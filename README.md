# CourtSide mobile MVP

CourtSide mobile is a small browser test for one question. Can the CourtSide YOLO model detect a tennis court and a ball on a real phone at a real court?

The app opens the rear camera or a local video, letterboxes each frame to 640 by 640, runs ONNX Runtime Web, applies YOLO decoding and NMS, then draws one court and one ball. It has no backend.

```text
phone camera or local video
            |
            v
  640 x 640 letterbox
            |
            v
 ONNX Runtime Web on the device
            |
            v
  YOLO decode and NMS
            |
            v
 best court and best ball
            |
            v
       canvas overlay
```

Inference runs entirely in the browser. Camera frames are not sent to the server.

## What is included

- Rear-camera access with no microphone request
- Local video playback through a browser object URL
- WebGPU first, with an independent WASM fallback
- YOLO11 raw output decoding for `[1, 14, N]` and `[1, N, 14]`
- Decoding for a common end-to-end NMS output shaped `[1, N, 6]`
- Class-aware NMS at an IoU threshold of `0.45`
- One court box and one visible ball marker
- Confidence control from `0.15` to `0.40`, starting at `0.25`
- Runtime, latency, inference FPS, court confidence, and ball confidence
- Inference pause while the page is hidden

Calibration, tracking, line calling, recording, accounts, analytics, and server inference are intentionally absent.

## Install and run

You need Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. `localhost` can request camera access on a desktop. Phone camera tests need an HTTPS deployment.

Run the checks with:

```bash
npm test
npm run build
```

The production output is `dist/`.

## Model

The repository includes the FP32 export at:

```text
public/models/courtside.onnx
```

The exported file is 10,611,804 bytes. ONNX validation and a CPU smoke test produced this contract:

```text
input:  images  [1, 3, 640, 640]  float32
output: output0 [1, 14, 8400]     float32
boxes:  xywh
NMS:    not included
classes: 10
```

The output has four box values followed by ten class scores. `src/postprocess.js` decodes this exact channel-first layout and applies class-aware NMS in JavaScript.

The Hugging Face repository publishes `model.pt`, not an ONNX file. To recreate the included export:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install ultralytics onnx onnxslim
curl -L https://huggingface.co/Davidsv/CourtSide-Computer-Vision-v1/resolve/main/model.pt -o model.pt
yolo export model=model.pt format=onnx imgsz=640 batch=1 dynamic=False simplify=True opset=17
mv model.onnx public/models/courtside.onnx
```

Keep the export in FP32. Do not add quantization until this version works at the court.

The app reads the actual input and output names from the loaded session. It logs the names and metadata in the browser console. It also rejects inputs that are not float32 tensors compatible with `[1, 3, 640, 640]`.

If you recreate the export with another Ultralytics version or different flags, check the console and run a known tennis image or video. The decoder also accepts `[1, N, 14]` and one common NMS layout with `xyxy`, confidence, and class ID. If a new export returns another layout, the page prints the received dimensions in its error message. Update `src/postprocess.js` against that output before field testing.

The relevant model classes are fixed to the model card:

```text
1 tennis_ball
3 court
```

## Test on a desktop

Start with a recorded tennis clip. Click `Test local video` and choose the file. The browser creates a local object URL. It does not upload the video.

Check these points before using a camera:

1. The model status changes to `Ready`.
2. The runtime reads `WebGPU` or `WASM`.
3. The court box follows the court in the video.
4. The ball circle sits over the detected ball.
5. Lowering the confidence control reveals weaker detections without shifting their coordinates.

If a box is consistently displaced, stop there. Fix letterbox reversal or display scaling before testing on a phone.

## Deploy to Cloudflare Pages

Connect this repository to a Cloudflare Pages project with these settings:

```text
Build command: npm run build
Output directory: dist
```

Cloudflare Pages supplies HTTPS. No function, Worker, inference API, or database is required.

Check the size of both the model and the ONNX Runtime WASM file before deployment:

```bash
find dist -type f -exec stat -f '%z %N' {} \;
```

Cloudflare Pages limits one static file to 25 MiB. The WebGPU runtime built from the current lockfile is 25,749,873 bytes. That is about 454 KiB below the limit. The separate WASM fallback is 13,961,845 bytes. A dependency update could push the WebGPU file over the limit, so treat the production size check as part of every deployment. The CourtSide FP32 model is 10,611,804 bytes.

The app loads the two ONNX Runtime builds separately. WASM-only browsers never initialize the WebGPU build. If WebGPU initialization fails, the fallback starts with a clean WASM runtime instead of retrying a failed runtime singleton.

Both runtimes receive an explicit Vite-managed URL for their WASM binary. This matters during `npm run dev`, where ONNX Runtime's default relative URL would point inside Vite's dependency cache and return `index.html` instead of a WASM file.

## Test on a phone

Open the deployed HTTPS URL in Android Chrome or iPhone Safari. Tap `Start camera`, grant camera access, and turn the phone toward the court. Android Chrome should try WebGPU first. iPhone Safari should use WASM.

Test in this order:

1. Empty court
2. Ball a few metres away
3. Ball near the service line
4. Ball at the opposite baseline
5. Slowly moving ball
6. Rally

Write down the actual result:

```text
Device:
Browser:
Runtime:
Inference FPS:
Court detection:
Near ball:
Service-line ball:
Far-baseline ball:
Moving ball:
Problems:
```

Far-ball failure does not invalidate this test. A ball at the opposite baseline may cover only a few pixels in a 640 by 640 input. That result would tell us what to work on next.

## Network and privacy check

Open the browser Network panel during a local-video test. Requests should cover the page, JavaScript, CSS, ONNX Runtime WASM, and `courtside.onnx`. After those files load, inference should send no requests containing frames, images, or video.

The app uses `getUserMedia` for video only. It never asks for microphone access. Local video files stay behind a browser object URL and are revoked when the source changes.

## Errors

The page reports camera denial, missing video dimensions, missing model files, WebGPU fallback, WASM startup failure, unsupported input metadata, unsupported output dimensions, and inference exceptions. Full model metadata and stack traces remain in the browser console.

## MVP acceptance

The code and browser runtime are only the first part of acceptance. Version 0 is complete after the supplied ONNX model passes a recorded-court test, the Cloudflare deployment opens on a phone, the rear camera works over HTTPS, and a real court plus one tennis ball line up with their overlays.

Until those checks happen, the honest status is build-ready, not field-validated.
