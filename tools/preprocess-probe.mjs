/**
 * Runs the model over one frame under each preprocessing and prints the best
 * detection per class.
 *
 * This is the probe that showed the court and the ball want opposite
 * preprocessing: a full-frame stretch detects the court at 98% and the ball not
 * at all, while an undistorted square crop does the reverse. Reach for it
 * whenever a preprocessing question comes up, rather than reasoning about what
 * the model probably learned.
 *
 *   node tools/preprocess-probe.mjs [image.png]
 */
import * as ort from "onnxruntime-web";
import { decodePng } from "./png.mjs";
import { CLASS_NAMES, decodeOutput, nonMaxSuppression } from "../src/postprocess.js";
import { MODEL_SIZE } from "../src/preprocess.js";

const DEFAULT_IMAGE = new URL("../test/Screenshot 2026-08-26 at 16.55.18.png", import.meta.url);
const MODEL = new URL("../public/models/courtside.onnx", import.meta.url);
// Low enough to show what a class scored even when the app would discard it.
const THRESHOLD = 0.05;

const image = decodePng(process.argv[2] ?? DEFAULT_IMAGE);

function sample(x, y) {
  const xi = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const index = (yi * image.width + xi) * image.channels;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
}

/** mode is "stretch", "letterbox" or "crop". */
function buildTensor(mode, crop) {
  const area = MODEL_SIZE * MODEL_SIZE;
  const tensor = new Float32Array(area * 3);
  let scaleX;
  let scaleY;
  let padX = 0;
  let padY = 0;
  let offsetX = 0;
  let offsetY = 0;

  if (mode === "stretch") {
    scaleX = MODEL_SIZE / image.width;
    scaleY = MODEL_SIZE / image.height;
  } else if (mode === "letterbox") {
    scaleX = scaleY = Math.min(MODEL_SIZE / image.width, MODEL_SIZE / image.height);
    padX = (MODEL_SIZE - image.width * scaleX) / 2;
    padY = (MODEL_SIZE - image.height * scaleY) / 2;
    tensor.fill(114 / 255); // what Ultralytics pads with
  } else {
    scaleX = scaleY = MODEL_SIZE / crop.size;
    offsetX = crop.x;
    offsetY = crop.y;
  }

  for (let py = 0; py < MODEL_SIZE; py += 1) {
    for (let px = 0; px < MODEL_SIZE; px += 1) {
      const sx = (px - padX) / scaleX + offsetX;
      const sy = (py - padY) / scaleY + offsetY;
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
      const [r, g, b] = sample(sx, sy);
      const pixel = py * MODEL_SIZE + px;
      tensor[pixel] = r / 255;
      tensor[area + pixel] = g / 255;
      tensor[area * 2 + pixel] = b / 255;
    }
  }
  return { tensor, scaleX, scaleY, padX, padY, offsetX, offsetY };
}

const session = await ort.InferenceSession.create(MODEL.pathname, { executionProviders: ["wasm"] });

async function probe(label, mode, crop) {
  const { tensor, scaleX, scaleY, padX, padY, offsetX, offsetY } = buildTensor(mode, crop);
  const outputs = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]),
  });
  const output = outputs[session.outputNames[0]];
  const { detections } = decodeOutput(output, THRESHOLD);

  const best = new Map();
  for (const detection of nonMaxSuppression(detections, 0.45)) {
    const current = best.get(detection.className);
    if (!current || detection.confidence > current.confidence) best.set(detection.className, detection);
  }

  console.log(`\n=== ${label} ===`);
  for (const name of CLASS_NAMES) {
    const detection = best.get(name);
    if (!detection) {
      console.log(`  ${name.padEnd(20)}  none`);
      continue;
    }
    const centerX = ((detection.x1 + detection.x2) / 2 - padX) / scaleX + offsetX;
    const centerY = ((detection.y1 + detection.y2) / 2 - padY) / scaleY + offsetY;
    const width = (detection.x2 - detection.x1) / scaleX;
    const height = (detection.y2 - detection.y1) / scaleY;
    console.log(
      `  ${name.padEnd(20)} ${(detection.confidence * 100).toFixed(1).padStart(5)}%`
      + `  centre=(${centerX.toFixed(0)},${centerY.toFixed(0)}) size=${width.toFixed(0)}x${height.toFixed(0)}`,
    );
  }
}

console.log(`${image.width}x${image.height}, reporting anything above ${THRESHOLD}`);

await probe("FULL-FRAME STRETCH  (what the court pass does)", "stretch");
await probe("LETTERBOX           (serves neither)", "letterbox");

const side = Math.min(image.width, image.height);
await probe(
  `SQUARE CROP ${side}px    (what the ball pass does)`,
  "crop",
  { x: Math.max(0, (image.width - side) / 2), y: Math.max(0, (image.height - side) / 2), size: side },
);

// Zooming in loses the ball rather than recovering it: the model learned a
// tight ball scale of roughly 8-9 pixels.
for (const size of [480, 400, 320]) {
  const x = Math.max(0, Math.min(image.width - size, (image.width - size) / 2));
  const y = Math.max(0, Math.min(image.height - size, (image.height - size) / 2));
  await probe(`SQUARE CROP ${size}px    (${(MODEL_SIZE / size).toFixed(2)}x zoom)`, "crop", { x, y, size });
}
