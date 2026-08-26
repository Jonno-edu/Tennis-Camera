import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeOutput,
  intersectionOverUnion,
  nonMaxSuppression,
  restoreCoordinates,
  selectVisibleDetections,
} from "../src/postprocess.js";

test("decodes a channel-first raw YOLO11 output", () => {
  const features = 14;
  const count = 2;
  const data = new Float32Array(features * count);
  const set = (feature, index, value) => { data[feature * count + index] = value; };
  set(0, 0, 320); set(1, 0, 300); set(2, 0, 200); set(3, 0, 100); set(7, 0, 0.9);
  set(0, 1, 100); set(1, 1, 120); set(2, 1, 10); set(3, 1, 10); set(5, 1, 0.8);

  const result = decodeOutput({ type: "float32", dims: [1, features, count], data }, 0.25);
  assert.equal(result.format, "raw xywh");
  assert.equal(result.detections.length, 2);
  assert.equal(result.detections[0].classId, 3);
  assert.deepEqual(
    [result.detections[0].x1, result.detections[0].y1, result.detections[0].x2, result.detections[0].y2],
    [220, 250, 420, 350],
  );
  assert.equal(result.detections[1].classId, 1);
});

test("decodes an ONNX output that already contains NMS", () => {
  const data = new Float32Array([10, 20, 30, 40, 0.75, 1]);
  const result = decodeOutput({ type: "float32", dims: [1, 1, 6], data }, 0.25);
  assert.equal(result.includesNms, true);
  assert.equal(result.detections[0].className, "tennis_ball");
});

test("suppresses overlapping boxes only within the same class", () => {
  const a = { x1: 0, y1: 0, x2: 100, y2: 100, confidence: 0.9, classId: 1 };
  const b = { x1: 5, y1: 5, x2: 95, y2: 95, confidence: 0.8, classId: 1 };
  const court = { ...b, classId: 3 };
  assert.ok(intersectionOverUnion(a, b) > 0.45);
  assert.deepEqual(nonMaxSuppression([a, b, court], 0.45), [a, court]);
});

test("removes letterbox padding and selects one court and one ball", () => {
  const transform = {
    scale: 0.5,
    padX: 0,
    padY: 140,
    sourceWidth: 1280,
    sourceHeight: 720,
  };
  const ball = restoreCoordinates(
    { x1: 100, y1: 190, x2: 110, y2: 200, confidence: 0.7, classId: 1 },
    transform,
  );
  assert.deepEqual([ball.x1, ball.y1, ball.x2, ball.y2], [200, 100, 220, 120]);

  const courtLow = { classId: 3, confidence: 0.6 };
  const courtHigh = { classId: 3, confidence: 0.95 };
  const ballHigh = { classId: 1, confidence: 0.8 };
  assert.deepEqual(selectVisibleDetections([courtLow, ball, courtHigh, ballHigh]), {
    bestCourt: courtHigh,
    bestBall: ballHigh,
  });
});
