const COLORS = {
  court: "#44e28b",
  tennis_ball: "#eaff45",
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

function drawCourt(context, detection, rect) {
  const box = displayBox(detection, rect);
  const color = COLORS.court;
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
  drawLabel(context, `COURT ${Math.round(detection.confidence * 100)}%`, box.x1, box.y1, color);
}

function drawBall(context, detection, rect) {
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
  drawLabel(context, `BALL ${Math.round(detection.confidence * 100)}%`, centerX + radius + 4, centerY, color);
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

export function drawOverlay(canvas, source, detections, bestCourt, bestBall, showAll) {
  const context = prepareCanvas(canvas);
  const rect = contentRect(canvas, source.videoWidth, source.videoHeight);

  if (showAll) {
    for (const detection of detections) {
      if (detection !== bestCourt && detection !== bestBall) drawOther(context, detection, rect);
    }
  }
  if (bestCourt) drawCourt(context, bestCourt, rect);
  if (bestBall) drawBall(context, bestBall, rect);
}
