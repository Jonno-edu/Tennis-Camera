import test from "node:test";
import assert from "node:assert/strict";
import { createBallSearch, tileCenters } from "../src/ball-search.js";

const ballAt = (x) => ({ x1: x - 4, y1: 100, x2: x + 4, y2: 108, confidence: 0.8, classId: 1 });

test("covers a wide frame with three overlapping square crops", () => {
  assert.deepEqual(tileCenters(1920, 1080), [540, 960, 1380]);
});

test("a square frame needs one crop", () => {
  assert.deepEqual(tileCenters(720, 720), [360]);
});

test("walks the crops in turn until a ball appears", () => {
  const search = createBallSearch();
  const seen = [
    search.nextCenterX(1920, 1080),
    search.nextCenterX(1920, 1080),
    search.nextCenterX(1920, 1080),
    search.nextCenterX(1920, 1080),
  ];
  assert.deepEqual(seen, [540, 960, 1380, 540]);
});

test("locks the crop onto a tracked ball", () => {
  const search = createBallSearch();
  search.record(ballAt(1500));
  assert.equal(search.nextCenterX(1920, 1080), 1500);
  assert.equal(search.nextCenterX(1920, 1080), 1500);
});

test("keeps tracking through short gaps and resumes the sweep after patience runs out", () => {
  const search = createBallSearch(3);
  search.record(ballAt(1500));

  search.record(null);
  search.record(null);
  assert.equal(search.nextCenterX(1920, 1080), 1500);

  search.record(null);
  assert.equal(search.tracked, null);
  assert.equal(search.nextCenterX(1920, 1080), 540);
});

test("a fresh sighting resets the patience counter", () => {
  const search = createBallSearch(3);
  search.record(ballAt(1500));
  search.record(null);
  search.record(null);
  search.record(ballAt(800));
  search.record(null);
  search.record(null);

  assert.equal(search.nextCenterX(1920, 1080), 800);
});
