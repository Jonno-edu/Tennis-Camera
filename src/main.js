import "./style.css";
import { loadLocalImage, loadLocalVideo, startRearCamera, stopSource } from "./camera.js";
import { loadModel } from "./inference.js";
import { drawOverlay, clearOverlay } from "./overlay.js";
import { BALL_CLASS_ID, selectVisibleDetections } from "./postprocess.js";
import { calculateCrop, calculateResize, createPreprocessor } from "./preprocess.js";
import { createBallSearch, tileCenters } from "./ball-search.js";
import { buildCourtMapping, describePosition, groundPosition } from "./court-mapping.js";
import { formatPosition } from "./overlay.js";

// The court pass sees the whole frame and barely changes on a fixed phone, so
// it runs every few frames. The ball pass runs every frame.
const COURT_REFRESH_FRAMES = 5;

const elements = {
  stage: document.querySelector("#camera-container"),
  video: document.querySelector("#source-video"),
  image: document.querySelector("#source-image"),
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
  showCourtLines: document.querySelector("#show-court-lines-input"),
  showMappedCourt: document.querySelector("#show-mapped-court-input"),
  mapping: document.querySelector("#mapping-status"),
  position: document.querySelector("#position-status"),
  showAll: document.querySelector("#show-all-input"),
};

const preprocess = createPreprocessor();
const ballSearch = createBallSearch();
let model = null;
let courtDetections = [];
let courtMapping = null;
let framesSinceCourtPass = Number.POSITIVE_INFINITY;
let activeSource = null;
let lastView = null;
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

/** The element to sample, its pixel size, and whether it keeps changing. */
function describeSource(kind) {
  if (kind === "image") {
    const { naturalWidth: width, naturalHeight: height } = elements.image;
    return { kind, element: elements.image, width, height, live: false };
  }
  const { videoWidth: width, videoHeight: height } = elements.video;
  return { kind, element: elements.video, width, height, live: true };
}

function fitStageToSource() {
  const source = activeSource?.kind === "image" ? describeSource("image") : describeSource("video");
  if (source.width && source.height) {
    elements.stage.style.setProperty("--source-ratio", `${source.width} / ${source.height}`);
  }
}

function updateDetectionMetrics(bestCourt, bestBall) {
  elements.court.textContent = bestCourt ? `${Math.round(bestCourt.confidence * 100)}%` : "None";
  elements.ball.textContent = bestBall ? `${Math.round(bestBall.confidence * 100)}%` : "None";
}

function updatePositionMetrics(mapping, position) {
  elements.mapping.textContent = mapping ? `Fit ${mapping.residual.toFixed(1)} px` : "None";
  if (!position) {
    elements.position.textContent = mapping ? "No ball" : "Needs court and net";
    return;
  }
  // Positive x is toward the right sideline, positive y toward the far baseline.
  elements.position.textContent = `${formatPosition(position)} · ${describePosition(position)}`;
}

function recordCompletion(now) {
  completionTimes.push(now);
  completionTimes = completionTimes.filter((time) => now - time <= 2_000);
  if (completionTimes.length < 2) return 0;
  return ((completionTimes.length - 1) * 1_000) / (completionTimes.at(-1) - completionTimes[0]);
}

function stopInference() {
  loopGeneration += 1;
  lastView = null;
  completionTimes = [];
  courtDetections = [];
  courtMapping = null;
  framesSinceCourtPass = Number.POSITIVE_INFINITY;
  ballSearch.reset();
  updatePositionMetrics(null, null);
  clearOverlay(elements.canvas);
  updateDetectionMetrics(null, null);
  elements.fps.textContent = "0.0 FPS";
}

function startInference() {
  stopInference();
  if (!activeSource) return;
  const generation = loopGeneration;
  if (activeSource.live) inferenceLoop(generation);
  else analyzeStill(generation);
}

async function runCourtPass(source, confidenceThreshold) {
  const transform = calculateResize(source.width, source.height);
  const pass = await model.run(preprocess(source.element, transform), transform, confidenceThreshold);
  return {
    detections: pass.detections.filter((detection) => detection.classId !== BALL_CLASS_ID),
    latency: pass.latency,
  };
}

async function runBallPass(source, centerX, confidenceThreshold) {
  const transform = calculateCrop(source.width, source.height, centerX);
  const pass = await model.run(preprocess(source.element, transform), transform, confidenceThreshold);
  return {
    balls: pass.detections.filter((detection) => detection.classId === BALL_CLASS_ID),
    latency: pass.latency,
  };
}

function present(source, detections, latency) {
  const { bestCourt, bestBall } = selectVisibleDetections(detections);
  const ballPosition = bestBall ? groundPosition(courtMapping, bestBall) : null;

  lastView = {
    source,
    view: { detections, bestCourt, bestBall, mapping: courtMapping, ballPosition },
  };
  redraw();
  updateDetectionMetrics(bestCourt, bestBall);
  updatePositionMetrics(courtMapping, ballPosition);
  elements.latency.textContent = `${Math.round(latency)} ms`;
  return bestBall;
}

function redraw() {
  if (!lastView) return;
  drawOverlay(elements.canvas, lastView.source, {
    ...lastView.view,
    show: {
      all: elements.showAll.checked,
      courtLines: elements.showCourtLines.checked,
      mappedCourt: elements.showMappedCourt.checked,
    },
  });
}

function reportInferenceFailure(error) {
  console.error("Inference failed", error);
  if (inferenceErrorShown) return;
  showError(`Inference failed: ${error.message}`);
  inferenceErrorShown = true;
}

/**
 * A still frame is analysed once. Nothing moves, so every ball crop is swept in
 * the same pass rather than one per frame, and the court fit is solved fresh.
 */
async function analyzeStill(generation) {
  const source = describeSource("image");
  elements.fps.textContent = "Still";
  try {
    const court = await runCourtPass(source, Number(elements.confidence.value));
    if (generation !== loopGeneration) return;
    courtDetections = court.detections;
    const { bestCourt } = selectVisibleDetections(courtDetections);
    courtMapping = buildCourtMapping(courtDetections, bestCourt);
    let latency = court.latency;

    const balls = [];
    for (const centerX of tileCenters(source.width, source.height)) {
      const pass = await runBallPass(source, centerX, Number(elements.confidence.value));
      if (generation !== loopGeneration) return;
      balls.push(...pass.balls);
      latency += pass.latency;
      present(source, [...courtDetections, ...balls], latency);
    }
    if (!balls.length) present(source, courtDetections, latency);
    inferenceErrorShown = false;
  } catch (error) {
    reportInferenceFailure(error);
  }
}

async function inferenceLoop(generation) {
  while (activeSource?.live && generation === loopGeneration) {
    if (document.hidden || elements.video.paused || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise(requestAnimationFrame);
      continue;
    }

    try {
      const source = describeSource("video");
      const confidenceThreshold = Number(elements.confidence.value);
      let latency = 0;

      if (framesSinceCourtPass >= COURT_REFRESH_FRAMES) {
        const court = await runCourtPass(source, confidenceThreshold);
        if (generation !== loopGeneration) return;
        courtDetections = court.detections;
        const { bestCourt } = selectVisibleDetections(courtDetections);
        // The camera is usually still, so keep the last good fit if this one fails.
        courtMapping = buildCourtMapping(courtDetections, bestCourt) ?? courtMapping;
        latency += court.latency;
        framesSinceCourtPass = 0;
      } else {
        framesSinceCourtPass += 1;
      }

      const centerX = ballSearch.nextCenterX(source.width, source.height);
      const ball = await runBallPass(source, centerX, confidenceThreshold);
      if (generation !== loopGeneration) return;
      latency += ball.latency;

      ballSearch.record(present(source, [...courtDetections, ...ball.balls], latency));
      elements.fps.textContent = `${recordCompletion(performance.now()).toFixed(1)} FPS`;
      inferenceErrorShown = false;
    } catch (error) {
      reportInferenceFailure(error);
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }

    await new Promise(requestAnimationFrame);
  }
}

async function activateSource(start) {
  clearError();
  stopInference();
  activeSource = null;
  try {
    const kind = await start();
    activeSource = describeSource(kind === "image" ? "image" : "video");
    elements.empty.hidden = true;
    elements.cameraButton.textContent = kind === "camera" ? "Restart camera" : "Start camera";
    fitStageToSource();
    if (model) startInference();
  } catch (error) {
    showError(error.message);
    elements.empty.hidden = false;
  }
}

elements.cameraButton.addEventListener("click", () => {
  activateSource(() => startRearCamera(elements.video, elements.image));
});

elements.videoInput.addEventListener("change", () => {
  const [file] = elements.videoInput.files;
  if (file) {
    const load = file.type.startsWith("image/") ? loadLocalImage : loadLocalVideo;
    activateSource(() => load(elements.video, elements.image, file));
  }
  elements.videoInput.value = "";
});

elements.confidence.addEventListener("input", () => {
  elements.confidenceValue.value = Number(elements.confidence.value).toFixed(2);
});

// A still has no next frame to pick up a new threshold, so re-run it.
elements.confidence.addEventListener("change", () => {
  if (activeSource && !activeSource.live && model) startInference();
});

for (const toggle of [elements.showAll, elements.showCourtLines, elements.showMappedCourt]) {
  toggle.addEventListener("change", redraw);
}
elements.video.addEventListener("loadedmetadata", fitStageToSource);
window.addEventListener("resize", () => {
  updateOrientationNote();
  clearOverlay(elements.canvas);
  redraw();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeSource?.live && model) startInference();
});

window.addEventListener("pagehide", () => {
  activeSource = null;
  stopInference();
  stopSource(elements.video, elements.image);
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
    if (activeSource) startInference();
  } catch (error) {
    console.error(error);
    elements.model.textContent = "Failed";
    elements.runtime.textContent = "Unavailable";
    showError(error.message);
  }
}

initialize();
