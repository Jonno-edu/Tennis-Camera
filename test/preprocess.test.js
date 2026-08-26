import test from "node:test";
import assert from "node:assert/strict";
import { calculateCrop, calculateResize } from "../src/preprocess.js";
import { restoreCoordinates } from "../src/postprocess.js";

test("the court pass stretches the whole frame into the model square", () => {
  const transform = calculateResize(987, 622, 640);

  assert.equal(transform.scaleX, 640 / 987);
  assert.equal(transform.scaleY, 640 / 622);
  assert.equal(transform.offsetX, 0);
  assert.equal(transform.offsetY, 0);
  assert.deepEqual(transform.region, { x: 0, y: 0, width: 987, height: 622 });

  const restored = restoreCoordinates(
    { x1: 64, y1: 128, x2: 576, y2: 512, confidence: 0.98, classId: 3 },
    transform,
  );
  assert.deepEqual(
    [restored.x1, restored.y1, restored.x2, restored.y2],
    [98.7, 124.4, 888.3, 497.6],
  );
});

test("the ball pass takes an undistorted square crop", () => {
  const transform = calculateCrop(1920, 1080, 960, 640);

  assert.equal(transform.scaleX, transform.scaleY);
  assert.equal(transform.region.width, 1080);
  assert.equal(transform.region.height, 1080);
  assert.equal(transform.region.x, 420);
  assert.equal(transform.region.y, 0);
});

test("the ball crop stays inside the frame when the ball is near an edge", () => {
  const left = calculateCrop(1920, 1080, 20, 640);
  const right = calculateCrop(1920, 1080, 1900, 640);

  assert.equal(left.region.x, 0);
  assert.equal(right.region.x, 1920 - 1080);
});

test("a square source needs no crop offset", () => {
  const transform = calculateCrop(720, 720, 360, 640);

  assert.deepEqual(transform.region, { x: 0, y: 0, width: 720, height: 720 });
});

test("restores ball coordinates from crop space back to frame pixels", () => {
  const transform = calculateCrop(1920, 1080, 960, 640);
  const ball = { x1: 300, y1: 200, x2: 308, y2: 208 };

  const restored = restoreCoordinates({ ...ball, confidence: 0.8, classId: 1 }, transform);

  assert.equal(restored.x1, 300 / transform.scaleX + 420);
  assert.equal(restored.y1, 200 / transform.scaleY);
  assert.equal(restored.x2 - restored.x1, restored.y2 - restored.y1);
});

test("rejects a source with no dimensions", () => {
  assert.throws(() => calculateResize(0, 622, 640), /Video dimensions are unavailable/);
  assert.throws(() => calculateCrop(1920, 0, 100, 640), /Video dimensions are unavailable/);
});
