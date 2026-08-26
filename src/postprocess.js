export const CLASS_NAMES = [
  "racket",
  "tennis_ball",
  "bottom-dead-zone",
  "court",
  "left-doubles-alley",
  "left-service-box",
  "net",
  "right-doubles-alley",
  "right-service-box",
  "top-dead-zone",
];

export const BALL_CLASS_ID = CLASS_NAMES.indexOf("tennis_ball");
export const COURT_CLASS_ID = CLASS_NAMES.indexOf("court");

const CLASS_COUNT = CLASS_NAMES.length;

function tensorValue(data, dims, detectionIndex, featureIndex) {
  const [, first, second] = dims;
  if (first === 4 + CLASS_COUNT || first === 5 + CLASS_COUNT) {
    return data[featureIndex * second + detectionIndex];
  }
  return data[detectionIndex * second + featureIndex];
}

function rawLayout(dims) {
  if (dims.length !== 3 || dims[0] !== 1) return null;
  const [, first, second] = dims;
  if (first === 4 + CLASS_COUNT || first === 5 + CLASS_COUNT) {
    return { count: second, features: first, transposed: true };
  }
  if (second === 4 + CLASS_COUNT || second === 5 + CLASS_COUNT) {
    return { count: first, features: second, transposed: false };
  }
  return null;
}

function nmsLayout(dims) {
  if (dims.length === 2 && dims[1] === 6) return { count: dims[0], offset: 0 };
  if (dims.length === 3 && dims[0] === 1 && dims[2] === 6) return { count: dims[1], offset: 0 };
  return null;
}

export function describeOutput(tensor) {
  return `${tensor.type || "tensor"} [${tensor.dims.join(", ")}]`;
}

export function decodeOutput(tensor, confidenceThreshold) {
  const { data, dims } = tensor;
  const raw = rawLayout(dims);
  if (raw) {
    const hasObjectness = raw.features === 5 + CLASS_COUNT;
    const classStart = hasObjectness ? 5 : 4;
    const detections = [];

    for (let index = 0; index < raw.count; index += 1) {
      let bestClass = -1;
      let bestClassScore = 0;
      for (let classId = 0; classId < CLASS_COUNT; classId += 1) {
        const score = tensorValue(data, dims, index, classStart + classId);
        if (score > bestClassScore) {
          bestClassScore = score;
          bestClass = classId;
        }
      }

      const objectness = hasObjectness ? tensorValue(data, dims, index, 4) : 1;
      const confidence = objectness * bestClassScore;
      if (confidence < confidenceThreshold) continue;

      const centerX = tensorValue(data, dims, index, 0);
      const centerY = tensorValue(data, dims, index, 1);
      const width = tensorValue(data, dims, index, 2);
      const height = tensorValue(data, dims, index, 3);
      detections.push({
        x1: centerX - width / 2,
        y1: centerY - height / 2,
        x2: centerX + width / 2,
        y2: centerY + height / 2,
        confidence,
        classId: bestClass,
        className: CLASS_NAMES[bestClass] ?? `class_${bestClass}`,
      });
    }
    return { detections, includesNms: false, format: "raw xywh" };
  }

  const withNms = nmsLayout(dims);
  if (withNms) {
    const detections = [];
    for (let index = 0; index < withNms.count; index += 1) {
      const offset = index * 6;
      const confidence = data[offset + 4];
      const classId = Math.round(data[offset + 5]);
      if (confidence < confidenceThreshold || classId < 0 || classId >= CLASS_COUNT) continue;
      detections.push({
        x1: data[offset],
        y1: data[offset + 1],
        x2: data[offset + 2],
        y2: data[offset + 3],
        confidence,
        classId,
        className: CLASS_NAMES[classId],
      });
    }
    return { detections, includesNms: true, format: "NMS xyxy" };
  }

  throw new Error(
    `Unsupported ONNX output ${describeOutput(tensor)}. Expected raw [1, 14, N], raw [1, N, 14], or NMS [1, N, 6].`,
  );
}

export function intersectionOverUnion(a, b) {
  const intersectionWidth = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const intersectionHeight = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const intersection = intersectionWidth * intersectionHeight;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return intersection / Math.max(areaA + areaB - intersection, Number.EPSILON);
}

export function nonMaxSuppression(detections, iouThreshold = 0.45) {
  const remaining = [...detections].sort((a, b) => b.confidence - a.confidence);
  const selected = [];

  while (remaining.length) {
    const candidate = remaining.shift();
    selected.push(candidate);
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const other = remaining[index];
      if (candidate.classId === other.classId && intersectionOverUnion(candidate, other) > iouThreshold) {
        remaining.splice(index, 1);
      }
    }
  }
  return selected;
}

export function restoreCoordinates(detection, transform) {
  const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));
  const { offsetX = 0, offsetY = 0 } = transform;
  return {
    ...detection,
    x1: clamp(detection.x1 / transform.scaleX + offsetX, transform.sourceWidth),
    y1: clamp(detection.y1 / transform.scaleY + offsetY, transform.sourceHeight),
    x2: clamp(detection.x2 / transform.scaleX + offsetX, transform.sourceWidth),
    y2: clamp(detection.y2 / transform.scaleY + offsetY, transform.sourceHeight),
  };
}

export function selectVisibleDetections(detections) {
  const bestCourt = detections
    .filter((detection) => detection.classId === COURT_CLASS_ID)
    .sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  const bestBall = detections
    .filter((detection) => detection.classId === BALL_CLASS_ID)
    .sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  return { bestCourt, bestBall };
}
