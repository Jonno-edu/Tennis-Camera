# CourtSide mobile MVP

CourtSide mobile is a small browser test for one question. Can the CourtSide YOLO model detect a tennis court and a ball on a real phone at a real court?

The app opens the rear camera or a local video, runs two ONNX passes over it, applies YOLO decoding and NMS, then draws one court and one ball. It has no backend.

The two passes exist because the court and the ball need opposite preprocessing. Measured on one 987 by 622 broadcast frame: a full-frame stretch to 640 by 640 detects the court at 98 percent and the ball not at all, while an undistorted square crop detects the ball at 75 to 84 percent and no court class at all. Letterboxing serves neither, because the model was trained on stretched images and the grey bars drop every court class below 5 percent. Cropping tighter than about 1.3x also loses the ball, so the model wants the ball near its trained size of 8 to 9 pixels.

```text
       phone camera or local video
                    |
        +-----------+-----------+
        |                       |
        v                       v
 court pass:              ball pass:
 full-frame stretch       square crop
 to 640 x 640             to 640 x 640
 every 5 frames           every frame
        |                       |
        v                       v
      ONNX Runtime Web on the device
                    |
                    v
            YOLO decode and NMS
                    |
        +-----------+-----------+
        |                       |
        v                       v
   best court              best ball
        |                       |
        +-----------+-----------+
                    |
                    v
              canvas overlay
```

Inference runs entirely in the browser. Camera frames are not sent to the server.

## What is included

- Rear-camera access with no microphone request
- Local video playback through a browser object URL
- Still images, analysed once with every ball crop swept in that pass
- WebGPU first, with an independent WASM fallback
- YOLO11 raw output decoding for `[1, 14, N]` and `[1, N, 14]`
- Decoding for a common end-to-end NMS output shaped `[1, N, 6]`
- Class-aware NMS at an IoU threshold of `0.45`
- One court box, a model-guided court-line overlay, and one visible ball marker
- A ball crop that sweeps across wide frames and then locks onto the ball it finds
- Confidence control from `0.15` to `0.40`, starting at `0.25`
- Runtime, latency, inference FPS, court confidence, and ball confidence
- Inference pause while the page is hidden

Calibration, recording, accounts, analytics, and server inference are intentionally absent.

## Ball coordinates

The app reads the ball's position on the court in metres, live. Origin is the centre of the net, X runs across toward the right sideline, Y runs along toward the far baseline.

The mapping is a homography solved from two detections. The court box is the bounding rectangle of a trapezoid, so its corners are not court corners, but its widest row is the near baseline, which puts two corners on its bottom edge. The net box supplies the other two: its horizontal extent is the post-to-post span, and its bottom edge is where the net meets the ground. Turn on `Mapped court` to draw the court model back over the frame and see the fit.

Accuracy on the test frame, measured against the two service lines the fit never sees, is about 0.35 m. That is a readout, not a line call.

Two things break it. The fit assumes the camera sits behind the near baseline, roughly level. Roll the phone and the near baseline stops being horizontal, the box corners stop being court corners, and the fit degrades without saying so. Worse, a homography maps the ground plane only, so a ball in the air reads further away than it is. On the test frame's geometry a ball 1 m up reads 2.7 m to 5.4 m long depending on depth, and the error scales as `h / (h - height)`, so a low tripod is far worse than a high one. These coordinates only mean what they say at the bounce.

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

Two probes in `tools/` answer questions about the model by measuring rather than reasoning. `npm run probe:preprocess` runs one frame under each preprocessing and prints the best detection per class, which is what settled the two-pass split. `npm run probe:still` runs the whole app end to end outside a browser against a stubbed DOM. Neither is part of `npm test`, because both load the real 10 MB model. See `tools/README.md`.

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

Start with a recorded tennis clip or a single frame. Click `Test video or image` and choose the file. The browser creates a local object URL. It does not upload anything.

A still is analysed once rather than looped. Nothing moves, so there is no reason to sweep the ball crops one per frame the way the video path does, and all of them run in that single pass. Moving the confidence control re-runs the analysis, since a still has no next frame to pick up the new threshold.

Check these points before using a camera:

1. The model status changes to `Ready`.
2. The runtime reads `WebGPU` or `WASM`.
3. The court box follows the court in the video.
4. Detected doubles alleys and service boxes have white outlines. A detected net has a dashed yellow line.
5. The ball circle sits over the detected ball.
6. Lowering the confidence control reveals weaker detections without shifting their coordinates.

If a box is consistently displaced, stop there. Fix resize reversal or display scaling before testing on a phone.

## Deploy to Cloudflare Pages

The repository carries its own deployment config, so a Pages project needs no hand-typed build settings:

```text
wrangler.toml   name and pages_build_output_dir = "dist"
.node-version   22.17.0, the Node line Vite 7 requires
public/_headers cache rules, copied into dist by the build
```

Connect the repository in the Cloudflare dashboard and pick this branch, or deploy from a laptop:

```bash
npm run build
npm run deploy
```

If the project uses a separate deploy command in its hosting settings, set it
to `npm run deploy`. Do not use `wrangler versions upload`, which deploys a
Worker and does not read this Pages output.

Cloudflare Pages supplies HTTPS, which is what the rear camera needs. No Function, Worker, inference API, or database is involved.

`public/_headers` caches `/assets/*` for a year because Vite fingerprints those filenames. That matters more here than in most apps: the WebGPU WASM binary is 25 MB, and a phone that re-fetches it every visit spends the first minute of every court session downloading. `courtside.onnx` keeps a stable name, so it gets a day instead.

Cloudflare Pages rejects any single file over 25 MiB. The WebGPU runtime built from the current lockfile is 25,749,873 bytes, about 454 KiB under the limit, so a dependency bump can break the deploy without touching this repository's own code. `npm test` now measures every file in `dist` against that limit and fails before Cloudflare does. To read the sizes yourself:

```bash
find dist -type f -exec stat -f '%z %N' {} \;
```

The WASM fallback is 13,961,845 bytes and the CourtSide FP32 model is 10,611,804 bytes.

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

Far-ball failure does not invalidate this test. A ball at the opposite baseline may cover only a few pixels in the square crop, and the crop cannot add pixels the frame never had. The measured limit is that cropping tighter than about 1.3x loses the ball rather than recovering it, so a far-ball failure needs a longer lens or a model retrained on smaller balls, not a tighter crop.

## Network and privacy check

Open the browser Network panel during a local-video test. Requests should cover the page, JavaScript, CSS, ONNX Runtime WASM, and `courtside.onnx`. After those files load, inference should send no requests containing frames, images, or video.

The app uses `getUserMedia` for video only. It never asks for microphone access. Local video files stay behind a browser object URL and are revoked when the source changes.

## Errors

The page reports camera denial, missing video dimensions, missing model files, WebGPU fallback, WASM startup failure, unsupported input metadata, unsupported output dimensions, and inference exceptions. Full model metadata and stack traces remain in the browser console.

## MVP acceptance

The code and browser runtime are only the first part of acceptance. Version 0 is complete after the supplied ONNX model passes a recorded-court test, the Cloudflare deployment opens on a phone, the rear camera works over HTTPS, and a real court plus one tennis ball line up with their overlays.

Until those checks happen, the honest status is build-ready, not field-validated.
