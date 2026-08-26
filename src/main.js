import "./style.css";
import { loadLocalVideo, startRearCamera, stopSource } from "./camera.js";
import { loadModel } from "./inference.js";
import { drawOverlay, clearOverlay } from "./overlay.js";
import { selectVisibleDetections } from "./postprocess.js";
import { createPreprocessor } from "./preprocess.js";

const elements = {
  stage: document.querySelector("#camera-container"),
  video: document.querySelector("#source-video"),
  canvas: document.querySelector("#overlay-canvas"),
  empty: document.querySelector("#empty-state"),
  cameraButton: document.querySelector("#camera-button"),
  videoInput: document.querySelector("#video-input"),
  error: document.querySelector("#error-message"),
  orientation: document.querySelector("#orientation-note"),
  model: document.querySelector("#model-status"),
  runtime: document.querySelector("#runtime-status"),
  fps: document.querySelector("#fps-status"),
  latency: document.querySelector("#latency-status"),
  court: document.querySelector("#court-status"),
  ball: document.querySelector("#ball-status"),
  confidence: document.querySelector("#confidence-input"),
  confidenceValue: document.querySelector("#confidence-value"),
  showAll: document.querySelector("#show-all-input"),
};

const preprocess = createPreprocessor();
let model = null;
let sourceActive = false;
let loopGeneration = 0;
let completionTimes = [];
let inferenceErrorShown = false;

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function clearError() {
  elements.error.hidden = true;
  elements.error.textContent = "";
}

function updateOrientationNote() {
  elements.orientation.hidden = window.innerWidth >= window.innerHeight;
}

function fitStageToSource() {
  if (elements.video.videoWidth && elements.video.videoHeight) {
    elements.stage.style.setProperty("--source-ratio", `${elements.video.videoWidth} / ${elements.video.videoHeight}`);
  }
}

function updateDetectionMetrics(bestCourt, bestBall) {
  elements.court.textContent = bestCourt ? `${Math.round(bestCourt.confidence * 100)}%` : "None";
  elements.ball.textContent = bestBall ? `${Math.round(bestBall.confidence * 100)}%` : "None";
}

function recordCompletion(now) {
  completionTimes.push(now);
  completionTimes = completionTimes.filter((time) => now - time <= 2_000);
  if (completionTimes.length < 2) return 0;
  return ((completionTimes.length - 1) * 1_000) / (completionTimes.at(-1) - completionTimes[0]);
}

function stopInference() {
  loopGeneration += 1;
  completionTimes = [];
  clearOverlay(elements.canvas);
  updateDetectionMetrics(null, null);
  elements.fps.textContent = "0.0 FPS";
}

function startInference() {
  stopInference();
  const generation = loopGeneration;
  inferenceLoop(generation);
}

async function inferenceLoop(generation) {
  while (sourceActive && generation === loopGeneration) {
    if (document.hidden || elements.video.paused || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise(requestAnimationFrame);
      continue;
    }

    try {
      const { tensorData, transform } = preprocess(elements.video);
      const result = await model.run(tensorData, transform, Number(elements.confidence.value));
      if (generation !== loopGeneration) return;

      const { bestCourt, bestBall } = selectVisibleDetections(result.detections);
      drawOverlay(
        elements.canvas,
        elements.video,
        result.detections,
        bestCourt,
        bestBall,
        elements.showAll.checked,
      );
      updateDetectionMetrics(bestCourt, bestBall);
      elements.latency.textContent = `${Math.round(result.latency)} ms`;
      elements.fps.textContent = `${recordCompletion(performance.now()).toFixed(1)} FPS`;
      inferenceErrorShown = false;
    } catch (error) {
      console.error("Inference failed", error);
      if (!inferenceErrorShown) {
        showError(`Inference failed: ${error.message}`);
        inferenceErrorShown = true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }

    await new Promise(requestAnimationFrame);
  }
}

async function activateSource(start) {
  clearError();
  stopInference();
  sourceActive = false;
  try {
    const sourceType = await start();
    sourceActive = true;
    elements.empty.hidden = true;
    elements.cameraButton.textContent = sourceType === "camera" ? "Restart camera" : "Start camera";
    fitStageToSource();
    if (model) startInference();
  } catch (error) {
    showError(error.message);
    elements.empty.hidden = false;
  }
}

elements.cameraButton.addEventListener("click", () => {
  activateSource(() => startRearCamera(elements.video));
});

elements.videoInput.addEventListener("change", () => {
  const [file] = elements.videoInput.files;
  if (file) activateSource(() => loadLocalVideo(elements.video, file));
  elements.videoInput.value = "";
});

elements.confidence.addEventListener("input", () => {
  elements.confidenceValue.value = Number(elements.confidence.value).toFixed(2);
});

elements.showAll.addEventListener("change", () => clearOverlay(elements.canvas));
elements.video.addEventListener("loadedmetadata", fitStageToSource);
window.addEventListener("resize", () => {
  updateOrientationNote();
  clearOverlay(elements.canvas);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && sourceActive && model) startInference();
});

window.addEventListener("pagehide", () => {
  sourceActive = false;
  stopInference();
  stopSource(elements.video);
});

async function initialize() {
  updateOrientationNote();
  try {
    model = await loadModel((message) => {
      elements.runtime.textContent = "WASM fallback";
      console.info(message);
    });
    elements.model.textContent = "Ready";
    elements.runtime.textContent = model.provider;
    if (sourceActive) startInference();
  } catch (error) {
    console.error(error);
    elements.model.textContent = "Failed";
    elements.runtime.textContent = "Unavailable";
    showError(error.message);
  }
}

initialize();
