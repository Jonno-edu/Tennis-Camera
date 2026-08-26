import { buildCourtLineSegments, selectCourtLineDetections } from "./court-lines.js";
import { COURT_LINES } from "./court-model.js";
import { describePosition, projectCourtLines } from "./court-mapping.js";

const COLORS = {
  court: "#44e28b",
  courtLine: "#f4fff7",
  net: "#eaff45",
  tennis_ball: "#eaff45",
  mapped: "#ff9bd2",
  other: "#70b7ff",
};

function contentRect(canvas, sourceWidth, sourceHeight) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  return {
    x: (width - renderedWidth) / 2,
    y: (height - renderedHeight) / 2,
    scale,
  };
}

function prepareCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  return context;
}

function drawLabel(context, text, x, y, color) {
  context.font = "600 13px system-ui, sans-serif";
  const padding = 5;
  const width = context.measureText(text).width + padding * 2;
  const top = Math.max(0, y - 24);
  context.fillStyle = "rgba(5, 8, 6, 0.82)";
  context.fillRect(x, top, width, 22);
  context.fillStyle = color;
  context.fillText(text, x + padding, top + 15);
}

function displayBox(detection, rect) {
  return {
    x1: rect.x + detection.x1 * rect.scale,
    y1: rect.y + detection.y1 * rect.scale,
    x2: rect.x + detection.x2 * rect.scale,
    y2: rect.y + detection.y2 * rect.scale,
  };
}

function drawCourt(context, detection, rect, lineCount = 0) {
  const box = displayBox(detection, rect);
  const color = COLORS.court;
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
  const lineStatus = lineCount ? ` · LINES ${lineCount}/5` : "";
  drawLabel(context, `COURT ${Math.round(detection.confidence * 100)}%${lineStatus}`, box.x1, box.y1, color);
}

function strokeLine(context, from, to, rect, { color, width, dashed = false, alpha = 1 }) {
  const points = [from, to].map((point) => ({
    x: rect.x + point.x * rect.scale,
    y: rect.y + point.y * rect.scale,
  }));

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = alpha;
  if (dashed) context.setLineDash([8, 6]);
  for (const [stroke, thickness] of [["rgba(2, 4, 3, 0.78)", width + 3], [color, width]]) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.strokeStyle = stroke;
    context.lineWidth = thickness;
    context.stroke();
  }
  context.restore();
}

/** Court lines inferred from the detected part boxes. */
function drawCourtLines(context, court, courtParts, rect) {
  for (const segment of buildCourtLineSegments(court, courtParts)) {
    strokeLine(context, { x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }, rect, {
      color: segment.role === "net" ? COLORS.net : segment.role === "boundary" ? COLORS.court : COLORS.courtLine,
      width: segment.role === "boundary" ? 2.5 : 2,
      dashed: segment.role === "net",
      alpha: Math.max(0.5, Math.min(0.92, segment.confidence)),
    });
  }
}

/** The court model reprojected through the solved mapping. */
function drawMappedCourt(context, mapping, rect) {
  for (const line of projectCourtLines(mapping, COURT_LINES)) {
    strokeLine(context, line.from, line.to, rect, {
      color: COLORS.mapped,
      width: line.name === "net-line" ? 2.5 : 2,
      dashed: line.name === "net-line",
    });
  }
}

function drawBall(context, detection, rect, position) {
  const box = displayBox(detection, rect);
  const centerX = (box.x1 + box.x2) / 2;
  const centerY = (box.y1 + box.y2) / 2;
  const color = COLORS.tennis_ball;
  const radius = Math.max(13, Math.min(28, Math.max(box.x2 - box.x1, box.y2 - box.y1) * 0.8));

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.stroke();
  context.beginPath();
  context.arc(centerX, centerY, 4, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  const label = position
    ? `BALL ${formatPosition(position)}`
    : `BALL ${Math.round(detection.confidence * 100)}%`;
  drawLabel(context, label, centerX + radius + 4, centerY, color);
}

export function formatPosition({ x, y }) {
  const across = `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(1)}`;
  const along = `${y >= 0 ? "+" : "-"}${Math.abs(y).toFixed(1)}`;
  return `${across}, ${along} m`;
}

function drawOther(context, detection, rect) {
  const box = displayBox(detection, rect);
  const color = COLORS.other;
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
  drawLabel(
    context,
    `${detection.className.toUpperCase()} ${Math.round(detection.confidence * 100)}%`,
    box.x1,
    box.y1,
    color,
  );
}

export function clearOverlay(canvas) {
  prepareCanvas(canvas);
}

/** `source` carries the pixel size of the frame the detections were read from. */
export function drawOverlay(canvas, source, view) {
  const { detections, bestCourt, bestBall, mapping, ballPosition, show } = view;
  const context = prepareCanvas(canvas);
  const rect = contentRect(canvas, source.width, source.height);
  const courtParts = selectCourtLineDetections(detections, bestCourt);

  if (show.all) {
    for (const detection of detections) {
      if (detection !== bestCourt && detection !== bestBall) drawOther(context, detection, rect);
    }
  }
  if (bestCourt && show.courtLines) drawCourtLines(context, bestCourt, courtParts, rect);
  if (mapping && show.mappedCourt) drawMappedCourt(context, mapping, rect);
  if (bestCourt) drawCourt(context, bestCourt, rect, show.courtLines ? courtParts.length : 0);
  if (bestBall) drawBall(context, bestBall, rect, ballPosition);
}

export { describePosition };
