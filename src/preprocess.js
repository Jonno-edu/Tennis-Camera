export const MODEL_SIZE = 640;

/**
 * The model was trained on frames stretched to a square, so the court classes
 * only fire on a full-frame stretch. That same stretch flattens the ball out of
 * existence, so the ball needs an undistorted square crop instead. Both regions
 * are described the same way here and differ only in which source rectangle
 * they read.
 */
function createTransform(sourceWidth, sourceHeight, region, targetSize) {
  return {
    scaleX: targetSize / region.width,
    scaleY: targetSize / region.height,
    offsetX: region.x,
    offsetY: region.y,
    region,
    sourceWidth,
    sourceHeight,
    targetSize,
  };
}

function assertDimensions(sourceWidth, sourceHeight) {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Video dimensions are unavailable.");
  }
}

export function calculateResize(sourceWidth, sourceHeight, targetSize = MODEL_SIZE) {
  assertDimensions(sourceWidth, sourceHeight);
  const region = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  return createTransform(sourceWidth, sourceHeight, region, targetSize);
}

export function calculateCrop(sourceWidth, sourceHeight, centerX, targetSize = MODEL_SIZE) {
  assertDimensions(sourceWidth, sourceHeight);
  const side = Math.min(sourceWidth, sourceHeight);
  const x = Math.max(0, Math.min(sourceWidth - side, centerX - side / 2));
  const y = Math.max(0, Math.min(sourceHeight - side, (sourceHeight - side) / 2));
  return createTransform(sourceWidth, sourceHeight, { x, y, width: side, height: side }, targetSize);
}

export function createPreprocessor(targetSize = MODEL_SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) throw new Error("Canvas pixel access is unavailable.");

  return function preprocess(source, transform) {
    const { region } = transform;
    context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, targetSize, targetSize);

    const rgba = context.getImageData(0, 0, targetSize, targetSize).data;
    const area = targetSize * targetSize;
    const tensorData = new Float32Array(area * 3);

    for (let pixel = 0, rgbaIndex = 0; pixel < area; pixel += 1, rgbaIndex += 4) {
      tensorData[pixel] = rgba[rgbaIndex] / 255;
      tensorData[area + pixel] = rgba[rgbaIndex + 1] / 255;
      tensorData[area * 2 + pixel] = rgba[rgbaIndex + 2] / 255;
    }

    return tensorData;
  };
}
