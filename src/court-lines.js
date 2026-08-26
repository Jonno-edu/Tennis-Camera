const COURT_PART_CLASS_IDS = new Set([4, 5, 6, 7, 8]);

function centerIsInside(detection, court) {
  const centerX = (detection.x1 + detection.x2) / 2;
  const centerY = (detection.y1 + detection.y2) / 2;
  return centerX >= court.x1 && centerX <= court.x2 && centerY >= court.y1 && centerY <= court.y2;
}

export function selectCourtLineDetections(detections, court) {
  if (!court) return [];

  const bestByClass = new Map();
  for (const detection of detections) {
    if (!COURT_PART_CLASS_IDS.has(detection.classId) || !centerIsInside(detection, court)) continue;
    const current = bestByClass.get(detection.classId);
    if (!current || detection.confidence > current.confidence) {
      bestByClass.set(detection.classId, detection);
    }
  }
  return [...bestByClass.values()].sort((a, b) => a.classId - b.classId);
}

function rectangleSegments(detection, role) {
  const { x1, y1, x2, y2, confidence } = detection;
  if (x2 <= x1 || y2 <= y1) return [];
  return [
    { x1, y1, x2, y2: y1, role, confidence },
    { x1: x2, y1, x2, y2, role, confidence },
    { x1: x2, y1: y2, x2: x1, y2, role, confidence },
    { x1, y1: y2, x2: x1, y2: y1, role, confidence },
  ];
}

export function buildCourtLineSegments(court, courtParts) {
  if (!court) return [];

  const segments = rectangleSegments(court, "boundary");
  for (const part of courtParts) {
    if (part.classId === 6) {
      const centerY = (part.y1 + part.y2) / 2;
      segments.push({
        x1: part.x1,
        y1: centerY,
        x2: part.x2,
        y2: centerY,
        role: "net",
        confidence: part.confidence,
      });
    } else {
      segments.push(...rectangleSegments(part, "region"));
    }
  }
  return segments;
}
