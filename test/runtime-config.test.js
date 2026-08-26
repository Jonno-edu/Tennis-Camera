import test from "node:test";
import assert from "node:assert/strict";
import { configureWasmRuntime } from "../src/runtime-config.js";

test("sets an explicit WASM URL before runtime initialization", () => {
  const runtime = { env: { wasm: {} } };
  configureWasmRuntime(runtime, "/assets/runtime.wasm");

  assert.deepEqual(runtime.env.wasm.wasmPaths, { wasm: "/assets/runtime.wasm" });
  assert.equal(runtime.env.wasm.numThreads, 1);
  assert.equal(runtime.env.wasm.proxy, false);
});
