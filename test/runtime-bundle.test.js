import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

test("builds an independent WASM fallback beside the WebGPU runtime", async () => {
  const assets = await readdir(new URL("../dist/assets/", import.meta.url));
  const standardWasm = assets.find((name) => /^ort-wasm-simd-threaded-[^.]+\.wasm$/.test(name));
  const webgpuWasm = assets.find((name) => /^ort-wasm-simd-threaded\.asyncify-[^.]+\.wasm$/.test(name));

  assert.ok(standardWasm, "production build does not contain the standard WASM runtime");
  assert.ok(webgpuWasm, "production build does not contain the WebGPU-compatible WASM runtime");
});
