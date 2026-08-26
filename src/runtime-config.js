export function configureWasmRuntime(runtime, wasmUrl) {
  runtime.env.wasm.wasmPaths = { wasm: wasmUrl };
  runtime.env.wasm.numThreads = 1;
  runtime.env.wasm.proxy = false;
}
