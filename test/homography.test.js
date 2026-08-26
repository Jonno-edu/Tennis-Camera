import test from "node:test";
import assert from "node:assert/strict";
import { apply, invert, multiply, reprojectionError, solveHomography } from "../src/homography.js";
import { COURT_POINTS, HALF_DOUBLES, HALF_LENGTH } from "../src/court-model.js";

const close = (actual, expected, tolerance, what) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);

test("recovers an exact affine mapping", () => {
  const correspondences = [
    { from: { x: 0, y: 0 }, to: { x: 10, y: 20 } },
    { from: { x: 1, y: 0 }, to: { x: 14, y: 20 } },
    { from: { x: 1, y: 1 }, to: { x: 14, y: 24 } },
    { from: { x: 0, y: 1 }, to: { x: 10, y: 24 } },
  ];
  const matrix = solveHomography(correspondences);

  close(reprojectionError(matrix, correspondences), 0, 1e-9, "rms");
  const middle = apply(matrix, { x: 0.5, y: 0.5 });
  close(middle.x, 12, 1e-9, "x");
  close(middle.y, 22, 1e-9, "y");
});

test("recovers a known perspective matrix from four points", () => {
  const truth = [1.4, 0.3, 55, -0.2, 1.1, 90, 0.0004, 0.0011, 1];
  const corners = [
    { x: -5, y: -12 }, { x: 5, y: -12 }, { x: 5, y: 12 }, { x: -5, y: 12 },
  ];
  const correspondences = corners.map((from) => ({ from, to: apply(truth, from) }));

  const matrix = solveHomography(correspondences);
  for (const probe of [{ x: 0, y: 0 }, { x: 3, y: -7 }, { x: -4.5, y: 11 }]) {
    const expected = apply(truth, probe);
    const actual = apply(matrix, probe);
    close(actual.x, expected.x, 1e-6, "x");
    close(actual.y, expected.y, 1e-6, "y");
  }
});

test("averages over more than four correspondences instead of fitting the first four", () => {
  const truth = [1.4, 0.3, 55, -0.2, 1.1, 90, 0.0004, 0.0011, 1];
  const jitter = [0.4, -0.3, 0.2, -0.4, 0.3, -0.2, 0.4, -0.3];
  const correspondences = Object.values(COURT_POINTS)
    .slice(0, 8)
    .map((from, index) => {
      const exact = apply(truth, from);
      return { from, to: { x: exact.x + jitter[index], y: exact.y - jitter[index] } };
    });

  const matrix = solveHomography(correspondences);
  const rms = reprojectionError(matrix, correspondences);

  // The fit should absorb the jitter rather than chase any single point.
  assert.ok(rms < 0.45, `rms ${rms} should stay near the noise it was given`);
  assert.ok(rms > 0, "an over-determined noisy fit cannot be exact");
});

test("the inverse maps points back where they came from", () => {
  const truth = [1.4, 0.3, 55, -0.2, 1.1, 90, 0.0004, 0.0011, 1];
  const probe = { x: 3.2, y: -8.4 };

  const round = apply(invert(truth), apply(truth, probe));

  close(round.x, probe.x, 1e-9, "x");
  close(round.y, probe.y, 1e-9, "y");
  const identity = multiply(truth, invert(truth)).map((v) => v / multiply(truth, invert(truth))[8]);
  for (const [index, expected] of [1, 0, 0, 0, 1, 0, 0, 0, 1].entries()) {
    close(identity[index], expected, 1e-9, `identity[${index}]`);
  }
});

test("rejects inputs that cannot determine a homography", () => {
  const three = [
    { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
    { from: { x: 1, y: 0 }, to: { x: 1, y: 0 } },
    { from: { x: 0, y: 1 }, to: { x: 0, y: 1 } },
  ];
  assert.throws(() => solveHomography(three), /at least 4 correspondences/);

  const collinear = [0, 1, 2, 3].map((step) => ({
    from: { x: step, y: step },
    to: { x: step * 2, y: step * 2 },
  }));
  assert.throws(() => solveHomography(collinear), /collinear/);

  const stacked = [0, 1, 2, 3].map(() => ({ from: { x: 5, y: 5 }, to: { x: 1, y: 1 } }));
  assert.throws(() => solveHomography(stacked), /same place/);
});

test("refuses to place a point that maps to the horizon", () => {
  assert.throws(() => apply([1, 0, 0, 0, 1, 0, 0, 1, 0], { x: 3, y: 0 }), /horizon/);
  assert.throws(() => invert([1, 2, 3, 2, 4, 6, 1, 1, 1]), /singular/);
});

/**
 * Measured off test/Screenshot 2026-08-26 at 16.55.18.png. Tracing the blue
 * paint gives the court width in pixels per image row as w(y) = 254.3 + 1.018y
 * with the court centred on x = 479. That fixes the four baseline corners.
 * Nothing below tells the solver where the service lines are.
 */
const FRAME = { widthAtRow: (y) => 254.3 + 1.018 * y, centreX: 479, farBaselineRow: 151, nearBaselineRow: 535 };

function measuredCorner(courtX, courtY, row) {
  const metresToPixels = FRAME.widthAtRow(row) / (HALF_DOUBLES * 2);
  return { from: { x: courtX, y: courtY }, to: { x: FRAME.centreX + courtX * metresToPixels, y: row } };
}

test("maps a real frame well enough to find lines it was never given", () => {
  const matrix = solveHomography([
    measuredCorner(-HALF_DOUBLES, -HALF_LENGTH, FRAME.nearBaselineRow),
    measuredCorner(HALF_DOUBLES, -HALF_LENGTH, FRAME.nearBaselineRow),
    measuredCorner(-HALF_DOUBLES, HALF_LENGTH, FRAME.farBaselineRow),
    measuredCorner(HALF_DOUBLES, HALF_LENGTH, FRAME.farBaselineRow),
  ]);

  // Both service lines were read off the same frame by scanning for white pixels.
  close(apply(matrix, COURT_POINTS["far-service-centre"]).y, 203, 1.5, "far service line row");
  close(apply(matrix, COURT_POINTS["near-service-centre"]).y, 393, 1.5, "near service line row");

  // And back the other way, which is the direction that actually gets used.
  const onCourt = apply(invert(matrix), { x: 479, y: 393 });
  close(onCourt.x, 0, 0.02, "centre line x in metres");
  close(onCourt.y, -6.4, 0.02, "near service line y in metres");
});
