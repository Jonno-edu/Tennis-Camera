import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("builds an independent WASM fallback beside the WebGPU runtime", async () => {
  const assets = await readdir(new URL("../dist/assets/", import.meta.url));
  const standardWasm = assets.find((name) => /^ort-wasm-simd-threaded-[^.]+\.wasm$/.test(name));
  const webgpuWasm = assets.find((name) => /^ort-wasm-simd-threaded\.asyncify-[^.]+\.wasm$/.test(name));

  assert.ok(standardWasm, "production build does not contain the standard WASM runtime");
  assert.ok(webgpuWasm, "production build does not contain the WebGPU-compatible WASM runtime");
});

test("ships the Cloudflare headers file in the deployable output", async () => {
  const headers = await readFile(new URL("../dist/_headers", import.meta.url), "utf8");
  assert.match(headers, /^\/assets\/\*$/m, "hashed assets are not given a cache rule");
  assert.match(headers, /^\/models\/\*$/m, "the model is not given a cache rule");
});

/**
 * Cloudflare Pages rejects any single file over 25 MiB. The WebGPU WASM build
 * sits about 450 KiB under that, so a dependency bump can break the deploy
 * without changing a line of this repository's own code.
 */
test("keeps every deployed file under the Cloudflare Pages file limit", async () => {
  const limit = 25 * 1024 * 1024;
  const root = fileURLToPath(new URL("../dist/", import.meta.url));
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const { size } = await stat(join(entry.parentPath, entry.name));
    assert.ok(size <= limit, `${entry.name} is ${size} bytes, over the 25 MiB Pages limit`);
  }
});
