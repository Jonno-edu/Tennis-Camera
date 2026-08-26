import test from "node:test";
import assert from "node:assert/strict";
import {
  COURT,
  COURT_LINES,
  COURT_POINTS,
  HALF_DOUBLES,
  HALF_LENGTH,
  HALF_SINGLES,
  courtHalf,
  isInsideDoubles,
  isInsideSingles,
  serviceBox,
} from "../src/court-model.js";

test("holds the ITF dimensions and the relations between them", () => {
  assert.equal(COURT.doublesWidth, 10.97);
  assert.equal(COURT.singlesWidth, 8.23);
  assert.equal(COURT.length, 23.77);
  assert.equal(COURT.serviceLineFromNet, 6.4);

  // Two alleys make up the difference between singles and doubles.
  const alleys = COURT.doublesWidth - COURT.singlesWidth;
  assert.ok(Math.abs(alleys - 2 * COURT.alleyWidth) < 1e-9);
});

test("puts every named point inside the doubles court", () => {
  for (const [name, point] of Object.entries(COURT_POINTS)) {
    assert.ok(isInsideDoubles(point), `${name} at (${point.x}, ${point.y}) is off the court`);
  }
});

test("names the four corners symmetrically", () => {
  assert.deepEqual(COURT_POINTS["near-doubles-left"], { x: -HALF_DOUBLES, y: -HALF_LENGTH });
  assert.deepEqual(COURT_POINTS["near-doubles-right"], { x: HALF_DOUBLES, y: -HALF_LENGTH });
  assert.deepEqual(COURT_POINTS["far-doubles-left"], { x: -HALF_DOUBLES, y: HALF_LENGTH });
  assert.deepEqual(COURT_POINTS["far-doubles-right"], { x: HALF_DOUBLES, y: HALF_LENGTH });
  assert.deepEqual(COURT_POINTS["near-singles-right"], { x: HALF_SINGLES, y: -HALF_LENGTH });
});

test("draws each line once, with both ends on the court", () => {
  assert.equal(new Set(COURT_LINES.map((line) => line.name)).size, COURT_LINES.length);
  for (const { name, from, to } of COURT_LINES) {
    assert.ok(isInsideDoubles(from) && isInsideDoubles(to), `${name} runs off the court`);
    assert.ok(Math.hypot(to.x - from.x, to.y - from.y) > 0, `${name} has no length`);
  }
});

test("measures the sidelines at the full court length", () => {
  const sideline = COURT_LINES.find((line) => line.name === "left-doubles-sideline");
  assert.equal(sideline.to.y - sideline.from.y, COURT.length);
});

test("separates the halves at the net", () => {
  assert.equal(courtHalf({ x: 0, y: 5 }), "far");
  assert.equal(courtHalf({ x: 0, y: -5 }), "near");
  assert.equal(courtHalf({ x: 0, y: 0 }), "net");
});

test("calls the singles alley out and the doubles alley in", () => {
  const inAlley = { x: (HALF_SINGLES + HALF_DOUBLES) / 2, y: 3 };
  assert.equal(isInsideDoubles(inAlley), true);
  assert.equal(isInsideSingles(inAlley), false);
});

test("names the service box a ball landed in", () => {
  assert.equal(serviceBox({ x: 2, y: 3 }), "far-right");
  assert.equal(serviceBox({ x: -2, y: 3 }), "far-left");
  assert.equal(serviceBox({ x: 2, y: -3 }), "near-right");
  assert.equal(serviceBox({ x: -2, y: -3 }), "near-left");
});

test("returns no service box past the service line or outside the singles court", () => {
  assert.equal(serviceBox({ x: 2, y: COURT.serviceLineFromNet + 0.01 }), null);
  assert.equal(serviceBox({ x: HALF_SINGLES + 0.01, y: 3 }), null);
  assert.equal(serviceBox({ x: 2, y: 9 }), null);
});

test("keeps a ball exactly on the line in play", () => {
  assert.equal(isInsideSingles({ x: HALF_SINGLES, y: 0 }), true);
  assert.equal(isInsideDoubles({ x: 0, y: HALF_LENGTH }), true);
  assert.equal(serviceBox({ x: HALF_SINGLES, y: COURT.serviceLineFromNet }), "far-right");
});
