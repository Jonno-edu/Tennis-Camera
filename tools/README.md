# Probes

Two scripts for answering questions about the model with measurements instead
of reasoning. Neither is part of `npm test`: both load the real 10 MB model and
take seconds, and the still probe needs a build first.

## `preprocess-probe.mjs`

```bash
node tools/preprocess-probe.mjs [image.png]
```

Runs one frame through the model under each preprocessing and prints the best
detection per class at a 0.05 threshold, low enough to show what a class scored
even where the app would discard it.

This is the probe that settled why the app makes two passes. On the test frame:

```
full-frame stretch    court 98.0%   ball none
letterbox             court none    ball 14.9%
square crop 622px     court none    ball 79.3%
square crop 480px     court none    ball 57.8%   (1.33x zoom)
square crop 320px     court none    ball none    (2.00x zoom)
```

The model was trained on stretched images, so letterbox bars drop every court
class below the threshold. That same stretch flattens the ball out of existence.
And zooming in loses the ball rather than recovering it, because the model
learned a tight ball scale of roughly 8 to 9 pixels.

Reach for this before changing anything in `src/preprocess.js`.

## `still-probe.mjs`

```bash
npm run build && node tools/still-probe.mjs [image.png]
```

Runs the whole app end to end outside a browser. `src/main.js` is DOM-bound, so
none of it reaches the unit tests. This stubs enough DOM to import the built
bundle, serves the real model off disk, feeds the preprocessor real pixels
through a fake `drawImage`, fires the file-input handler with an image, and
prints what the status panel would read:

```
Inference      Still
Latency        617 ms
Court          98%
Ball           79%
Court map      Fit 0.0 px
Ball position  -2.1, -2.6 m · near left service box
```

It exits non-zero if the error panel has anything in it.

It proves the wiring and the analysis. It does not prove the rendering: every
canvas drawing call in it is a no-op.

## `png.mjs`

Just enough PNG to read a test frame without an image library. 8-bit
non-interlaced only, which is what a screenshot is.
