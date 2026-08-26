/**
 * Runs the whole app end to end outside a browser.
 *
 * main.js is DOM-bound, so nothing in it reaches the unit tests. This stubs
 * just enough DOM to import the built bundle, serves the real model off disk,
 * feeds the preprocessor real pixels through a fake drawImage, then fires the
 * file-input handler with an image and prints what the status panel would say.
 *
 * It proves the wiring and the analysis. It does not prove the rendering: every
 * canvas drawing call here is a no-op.
 *
 *   npm run build && node tools/still-probe.mjs [image.png]
 */
import fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { decodePng } from "./png.mjs";

const root = new URL("..", import.meta.url).pathname;
const image = decodePng(process.argv[2] ?? `${root}test/Screenshot 2026-08-26 at 16.55.18.png`);

const assets = `${root}dist/assets`;
if (!existsSync(assets)) throw new Error("No dist/. Run npm run build first.");
const bundle = readdirSync(assets).find((name) => name.startsWith("index-") && name.endsWith(".js"));

// The stubbed drawImage records the source rectangle; getImageData resamples it.
let region = { x: 0, y: 0, width: image.width, height: image.height };
function resample(width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const sx = Math.round(region.x + (px / width) * region.width);
      const sy = Math.round(region.y + (py / height) * region.height);
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
      const from = (sy * image.width + sx) * image.channels;
      const to = (py * width + px) * 4;
      out[to] = image.data[from];
      out[to + 1] = image.data[from + 1];
      out[to + 2] = image.data[from + 2];
      out[to + 3] = 255;
    }
  }
  return out;
}

const context = {
  drawImage(source, sx, sy, sourceWidth, sourceHeight) {
    region = { x: sx, y: sy, width: sourceWidth, height: sourceHeight };
  },
  getImageData: (x, y, width, height) => ({ data: resample(width, height) }),
  measureText: () => ({ width: 40 }),
  fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  arc() {}, fill() {}, save() {}, restore() {}, setTransform() {}, setLineDash() {},
  strokeRect() {}, fillText() {},
};

const handlers = new Map();
const nodes = new Map();
const makeNode = (id) => ({
  id, hidden: false, checked: true, value: "0.25", textContent: "", files: [],
  style: { setProperty() {} }, relList: { supports: () => true },
  videoWidth: image.width, videoHeight: image.height,
  naturalWidth: image.width, naturalHeight: image.height,
  paused: false, readyState: 4, clientWidth: 800, clientHeight: 500, width: 0, height: 0,
  addEventListener(type, handler) { handlers.set(`${id}:${type}`, handler); },
  removeAttribute() {}, setAttribute() {}, pause() {}, load() {},
  play: async () => {}, decode: async () => {}, getContext: () => context,
});
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, makeNode(id));
  return nodes.get(id);
};

globalThis.document = {
  hidden: false,
  querySelector: (selector) => node(selector.slice(1)),
  querySelectorAll: () => [],
  getElementsByTagName: () => [],
  createElement: () => makeNode("created"),
  head: { appendChild() {} },
  addEventListener(type, handler) { handlers.set(`document:${type}`, handler); },
};
globalThis.window = {
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
  setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0),
  addEventListener(type, handler) { handlers.set(`window:${type}`, handler); },
};
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.MutationObserver = class { observe() {} };
globalThis.HTMLMediaElement = { HAVE_CURRENT_DATA: 2 };
globalThis.URL.createObjectURL = () => "blob:probe";
globalThis.URL.revokeObjectURL = () => {};
Object.defineProperty(globalThis, "navigator", {
  value: { gpu: null, mediaDevices: null },
  configurable: true,
});

globalThis.fetch = async (url) => {
  const path = String(url).replace(/^.*?(?=\/)/, "");
  const file = path.startsWith("/assets/") ? `${root}dist${path}` : `${root}public${path}`;
  const body = await fs.readFile(file);
  return {
    ok: true,
    status: 200,
    headers: { get: (key) => (key === "content-type" ? "application/octet-stream" : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    text: async () => body.toString(),
  };
};

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await import(`${assets}/${bundle}`);
await settle(500);
console.log(`loaded ${bundle}, ${handlers.size} handlers registered`);
console.log(`model status: ${node("model-status").textContent}`);

node("video-input").files = [{ type: "image/png", name: "frame.png" }];
await handlers.get("video-input:change")();
await settle(8_000);

console.log(`\nsource swapped to the image: video hidden=${node("source-video").hidden}`
  + ` image hidden=${node("source-image").hidden} empty hidden=${node("empty-state").hidden}`);
console.log("\nwhat the status panel reads:");
for (const [label, id] of [
  ["Inference", "fps-status"], ["Latency", "latency-status"], ["Court", "court-status"],
  ["Ball", "ball-status"], ["Court map", "mapping-status"], ["Ball position", "position-status"],
]) {
  console.log(`  ${label.padEnd(14)} ${node(id).textContent}`);
}

const error = node("error-message").textContent;
console.log(`\nerror panel: ${error || "empty"}`);

for (const key of ["show-all-input:change", "show-court-lines-input:change",
  "show-mapped-court-input:change", "window:resize"]) {
  await handlers.get(key)();
}
console.log("display toggles and resize redrew without throwing");
process.exit(error ? 1 : 0);
