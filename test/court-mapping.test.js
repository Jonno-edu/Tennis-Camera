import test from "node:test";
import assert from "node:assert/strict";
import {
  POST_OFFSET,
  buildCourtMapping,
  courtCorrespondences,
  describePosition,
  groundPosition,
  projectCourtLines,
} from "../src/court-mapping.js";
import { COURT_LINES, HALF_DOUBLES } from "../src/court-model.js";
import { apply } from "../src/homography.js";

/** Boxes exactly as the stretch pass reported them on the test screenshot. */
const COURT_BOX = { x1: 81.5, y1: 150.5, x2: 878.5, y2: 539.5, confidence: 0.98, classId: 3 };
const NET_BOX = { x1: 157.5, y1: 227, x2: 802.5, y2: 287, confidence: 0.949, classId: 6 };
const detections = [COURT_BOX, NET_BOX];

test("puts the net posts outside the doubles sideline", () => {
  const [, , leftPost, rightPost] = courtCorrespondences(COURT_BOX, NET_BOX);

  assert.equal(leftPost.from.x, -(HALF_DOUBLES + POST_OFFSET));
  assert.equal(rightPost.from.x, HALF_DOUBLES + POST_OFFSET);
  assert.equal(leftPost.from.y, 0);
});

test("fits the four correspondences it was given exactly", () => {
  const mapping = buildCourtMapping(detections, COURT_BOX);

  assert.ok(mapping, "a court and a net should be enough to fit");
  assert.ok(mapping.residual < 0.01, `residual ${mapping.residual} px`);
});

/**
 * The real check. Both service lines were read off the same frame by scanning
 * for white pixels, and neither goes into the fit.
 */
test("lands within half a metre of lines it was never given", () => {
  const mapping = buildCourtMapping(detections, COURT_BOX);

  for (const [name, pixel, truth] of [
    ["near service line", { x: 479, y: 393 }, -6.4],
    ["far service line", { x: 479, y: 203 }, 6.4],
    ["near baseline", { x: 479, y: 535 }, -11.885],
  ]) {
    const position = apply(mapping.imageToCourt, pixel);
    const error = Math.abs(position.y - truth);
    assert.ok(error < 0.5, `${name} off by ${error.toFixed(2)} m`);
    assert.ok(Math.abs(position.x) < 0.3, `${name} centre off by ${position.x.toFixed(2)} m across`);
  }
});

test("reads a position off the bottom of the box, where a grounded ball touches", () => {
  const mapping = buildCourtMapping(detections, COURT_BOX);
  const ball = { x1: 363, y1: 319, x2: 371, y2: 327 };

  const fromBox = groundPosition(mapping, ball);
  const fromBottomCentre = apply(mapping.imageToCourt, { x: 367, y: 327 });

  assert.ok(Math.abs(fromBox.x - fromBottomCentre.x) < 1e-9);
  assert.ok(Math.abs(fromBox.y - fromBottomCentre.y) < 1e-9);
});

test("refuses to fit without the detections the fit needs", () => {
  assert.equal(buildCourtMapping(detections, null), null);
  assert.equal(buildCourtMapping([COURT_BOX], COURT_BOX), null, "no net box");
  assert.equal(groundPosition(null, { x1: 1, y1: 2, x2: 3, y2: 4 }), null);
});

test("refuses geometry that cannot be a court seen from behind the baseline", () => {
  const netBelowCourt = { ...NET_BOX, y2: COURT_BOX.y2 + 10 };
  assert.equal(buildCourtMapping([COURT_BOX, netBelowCourt], COURT_BOX), null);

  const netAboveCourt = { ...NET_BOX, y2: COURT_BOX.y1 - 10 };
  assert.equal(buildCourtMapping([COURT_BOX, netAboveCourt], COURT_BOX), null);

  const stubbyNet = { ...NET_BOX, x1: 470, x2: 490 };
  assert.equal(buildCourtMapping([COURT_BOX, stubbyNet], COURT_BOX), null);

  const slivers = { ...COURT_BOX, x2: COURT_BOX.x1 + 5 };
  assert.equal(buildCourtMapping([slivers, NET_BOX], slivers), null);
});

test("names where a position sits", () => {
  assert.equal(describePosition({ x: 2, y: 3 }), "far right service box");
  assert.equal(describePosition({ x: 2, y: 9 }), "singles court");
  assert.equal(describePosition({ x: 4.8, y: 9 }), "doubles alley");
  assert.equal(describePosition({ x: 8, y: 9 }), "out");
  assert.equal(describePosition(null), null);
});

test("projects every court line back onto the frame, inside it", () => {
  const mapping = buildCourtMapping(detections, COURT_BOX);
  const projected = projectCourtLines(mapping, COURT_LINES);

  assert.equal(projected.length, COURT_LINES.length);
  for (const line of projected) {
    for (const end of [line.from, line.to]) {
      assert.ok(end.y > 100 && end.y < 600, `${line.name} ends at y=${end.y}`);
      assert.ok(end.x > -50 && end.x < 1040, `${line.name} ends at x=${end.x}`);
    }
  }
  assert.deepEqual(projectCourtLines(null, COURT_LINES), []);
});

/**
 * A homography maps the ground plane, so a ball in the air reads long. This
 * pins the size of that error so nobody mistakes these coordinates for a line
 * call. The net tape is the easiest case to check: it sits 1.07 m up at the
 * posts, and the fit puts its ground line well below where the tape appears.
 */
test("reads an airborne ball as further away than it is", () => {
  const mapping = buildCourtMapping(detections, COURT_BOX);

  const tapeRow = (NET_BOX.y1 + NET_BOX.y2) / 2;
  const atTape = apply(mapping.imageToCourt, { x: 479, y: tapeRow });
  const atGround = apply(mapping.imageToCourt, { x: 479, y: NET_BOX.y2 });

  assert.ok(Math.abs(atGround.y) < 0.5, `net ground line should sit near y=0, got ${atGround.y.toFixed(2)}`);
  assert.ok(atTape.y > 2, `the tape should read metres past the net, got ${atTape.y.toFixed(2)} m`);
});
