import test from "node:test";
import assert from "node:assert/strict";
import { buildCourtLineSegments, selectCourtLineDetections } from "../src/court-lines.js";

const court = { x1: 100, y1: 50, x2: 900, y2: 650, classId: 3, confidence: 0.91 };

test("selects the strongest court-part detection inside the active court", () => {
  const weakServiceBox = {
    x1: 300, y1: 220, x2: 500, y2: 400, classId: 5, confidence: 0.61,
  };
  const strongServiceBox = { ...weakServiceBox, confidence: 0.84 };
  const outsideNet = {
    x1: 1000, y1: 300, x2: 1200, y2: 340, classId: 6, confidence: 0.99,
  };
  const ball = { x1: 400, y1: 400, x2: 410, y2: 410, classId: 1, confidence: 0.88 };

  assert.deepEqual(
    selectCourtLineDetections([weakServiceBox, strongServiceBox, outsideNet, ball], court),
    [strongServiceBox],
  );
});

test("builds a court boundary, region edges, and one net line", () => {
  const serviceBox = {
    x1: 300, y1: 220, x2: 500, y2: 400, classId: 5, confidence: 0.84,
  };
  const net = { x1: 180, y1: 310, x2: 820, y2: 350, classId: 6, confidence: 0.78 };
  const segments = buildCourtLineSegments(court, [serviceBox, net]);

  assert.equal(segments.filter((segment) => segment.role === "boundary").length, 4);
  assert.equal(segments.filter((segment) => segment.role === "region").length, 4);
  assert.deepEqual(
    segments.find((segment) => segment.role === "net"),
    { x1: 180, y1: 330, x2: 820, y2: 330, role: "net", confidence: 0.78 },
  );
});
