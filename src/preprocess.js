export const MODEL_SIZE = 640;

export function calculateLetterbox(sourceWidth, sourceHeight, targetSize = MODEL_SIZE) {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Video dimensions are unavailable.");
  }

  const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
  const resizedWidth = Math.round(sourceWidth * scale);
  const resizedHeight = Math.round(sourceHeight * scale);
  const padX = Math.floor((targetSize - resizedWidth) / 2);
  const padY = Math.floor((targetSize - resizedHeight) / 2);

  return { scale, resizedWidth, resizedHeight, padX, padY, sourceWidth, sourceHeight, targetSize };
}

export function createPreprocessor(targetSize = MODEL_SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) throw new Error("Canvas pixel access is unavailable.");

  return function preprocess(source) {
    const transform = calculateLetterbox(source.videoWidth, source.videoHeight, targetSize);
    context.fillStyle = "rgb(114, 114, 114)";
    context.fillRect(0, 0, targetSize, targetSize);
    context.drawImage(
      source,
      transform.padX,
      transform.padY,
      transform.resizedWidth,
      transform.resizedHeight,
    );

    const rgba = context.getImageData(0, 0, targetSize, targetSize).data;
    const area = targetSize * targetSize;
    const tensorData = new Float32Array(area * 3);

    for (let pixel = 0, rgbaIndex = 0; pixel < area; pixel += 1, rgbaIndex += 4) {
      tensorData[pixel] = rgba[rgbaIndex] / 255;
      tensorData[area + pixel] = rgba[rgbaIndex + 1] / 255;
      tensorData[area * 2 + pixel] = rgba[rgbaIndex + 2] / 255;
    }

    return { tensorData, transform };
  };
}
