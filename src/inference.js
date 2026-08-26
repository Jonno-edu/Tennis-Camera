import { MODEL_SIZE } from "./preprocess.js";
import { decodeOutput, nonMaxSuppression, restoreCoordinates } from "./postprocess.js";
import { configureWasmRuntime } from "./runtime-config.js";
import standardWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import webgpuWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

const MODEL_URL = "/models/courtside.onnx";

function logModelContract(session) {
  console.info("CourtSide ONNX input names", session.inputNames);
  console.info("CourtSide ONNX output names", session.outputNames);
  console.info("CourtSide ONNX input metadata", session.inputMetadata);
  console.info("CourtSide ONNX output metadata", session.outputMetadata);
}

function validateInputContract(session) {
  const metadata = session.inputMetadata[0];
  if (!metadata?.isTensor) throw new Error("The model image input is not a tensor.");
  if (metadata.type !== "float32") {
    throw new Error(`The model expects ${metadata.type}, but this app prepares float32 pixels.`);
  }

  const expected = [1, 3, MODEL_SIZE, MODEL_SIZE];
  const shapeMatches = metadata.shape.length === expected.length
    && metadata.shape.every((dimension, index) => typeof dimension === "string" || dimension === expected[index]);
  if (!shapeMatches) {
    throw new Error(`The model input shape is [${metadata.shape.join(", ")}], expected [${expected.join(", ")}].`);
  }
}

async function createSession(runtime, executionProviders) {
  return runtime.InferenceSession.create(MODEL_URL, {
    executionProviders,
    graphOptimizationLevel: "all",
  });
}

async function assertModelAvailable() {
  let response;
  try {
    response = await fetch(MODEL_URL, { method: "HEAD", cache: "no-store" });
  } catch (error) {
    throw new Error(`The model request failed: ${error.message}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || contentType.includes("text/html")) {
    throw new Error(`Model file missing. Add courtside.onnx at public${MODEL_URL}.`);
  }
}

export async function loadModel(onProviderFallback = () => {}) {
  await assertModelAvailable();
  let session;
  let runtime;
  let provider = "WASM";

  if (navigator.gpu) {
    try {
      runtime = await import("onnxruntime-web/webgpu");
      configureWasmRuntime(runtime, webgpuWasmUrl);
      session = await createSession(runtime, ["webgpu"]);
      provider = "WebGPU";
    } catch (error) {
      console.warn("WebGPU model initialization failed. Falling back to WASM.", error);
      onProviderFallback("WebGPU failed. Using WASM.");
    }
  } else {
    onProviderFallback("WebGPU unavailable. Using WASM.");
  }

  if (!session) {
    try {
      runtime = await import("onnxruntime-web/wasm");
      configureWasmRuntime(runtime, standardWasmUrl);
      session = await createSession(runtime, ["wasm"]);
    } catch (error) {
      throw new Error(`Model failed to load from ${MODEL_URL}: ${error.message}`);
    }
  }

  logModelContract(session);
  if (session.inputNames.length !== 1 || session.outputNames.length < 1) {
    throw new Error("The ONNX model must have one image input and at least one detection output.");
  }
  validateInputContract(session);

  return {
    provider,
    async run(tensorData, transform, confidenceThreshold, iouThreshold = 0.45) {
      const inputName = session.inputNames[0];
      const tensor = new runtime.Tensor("float32", tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]);
      const startedAt = performance.now();
      const outputs = await session.run({ [inputName]: tensor });
      const latency = performance.now() - startedAt;
      const outputName = session.outputNames[0];
      const output = outputs[outputName];
      if (!output) throw new Error(`The model did not return its declared output "${outputName}".`);

      const decoded = decodeOutput(output, confidenceThreshold);
      console.debug("CourtSide ONNX output", outputName, output.dims, decoded.format);
      const suppressed = decoded.includesNms
        ? decoded.detections
        : nonMaxSuppression(decoded.detections, iouThreshold);
      const detections = suppressed
        .map((detection) => restoreCoordinates(detection, transform))
        .filter((detection) => detection.x2 > detection.x1 && detection.y2 > detection.y1);

      return { detections, latency };
    },
  };
}
