let activeStream = null;
let activeObjectUrl = null;

function waitForDimensions(video) {
  if (video.videoWidth && video.videoHeight) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video dimensions are unavailable."));
    }, 10_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The browser could not read this video."));
    };

    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

export function stopSource(video) {
  if (activeStream) {
    for (const track of activeStream.getTracks()) track.stop();
    activeStream = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
  video.pause();
  video.controls = false;
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();
}

export async function startRearCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is unavailable in this browser. Use HTTPS or localhost.");
  }

  stopSource(video);
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      throw new Error("Camera permission was denied. Allow camera access and try again.");
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      throw new Error("No camera is available on this device.");
    }
    throw new Error(`Camera failed to start: ${error.message}`);
  }

  video.srcObject = activeStream;
  video.controls = false;
  await video.play();
  await waitForDimensions(video);
  return "camera";
}

export async function loadLocalVideo(video, file) {
  if (!file?.type.startsWith("video/")) {
    throw new Error("Choose a video file.");
  }

  stopSource(video);
  activeObjectUrl = URL.createObjectURL(file);
  video.src = activeObjectUrl;
  video.loop = true;
  video.controls = true;
  await video.play();
  await waitForDimensions(video);
  return "video";
}
