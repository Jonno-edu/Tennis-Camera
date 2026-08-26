import { HALF_DOUBLES, HALF_LENGTH, isInsideDoubles, isInsideSingles, serviceBox } from "./court-model.js";
import { apply, invert, reprojectionError, solveHomography } from "./homography.js";
import { CLASS_NAMES } from "./postprocess.js";

const NET_CLASS_ID = CLASS_NAMES.indexOf("net");

/** ITF: the net posts stand 0.914 m outside the doubles sideline. */
export const POST_OFFSET = 0.914;

/**
 * Four court points recovered from two axis-aligned boxes.
 *
 * The court box is the bounding rectangle of a trapezoid, so its corners are
 * not court corners. Its widest row is the near baseline though, which puts the
 * two near corners on the bottom edge. The net box supplies the other two: its
 * horizontal extent is the post-to-post span at the net's depth, and its bottom
 * edge is where the net meets the ground.
 *
 * This assumes the camera is behind the near baseline, roughly level, with the
 * far half of the court higher in the frame. Roll the phone and the near
 * baseline stops being horizontal, the box corners stop being court corners,
 * and the fit degrades quietly.
 */
export function courtCorrespondences(court, net) {
  return [
    { from: { x: -HALF_DOUBLES, y: -HALF_LENGTH }, to: { x: court.x1, y: court.y2 } },
    { from: { x: HALF_DOUBLES, y: -HALF_LENGTH }, to: { x: court.x2, y: court.y2 } },
    { from: { x: -(HALF_DOUBLES + POST_OFFSET), y: 0 }, to: { x: net.x1, y: net.y2 } },
    { from: { x: HALF_DOUBLES + POST_OFFSET, y: 0 }, to: { x: net.x2, y: net.y2 } },
  ];
}

function isPlausible(court, net) {
  if (court.x2 - court.x1 < 40 || court.y2 - court.y1 < 30) return false;
  // The net has to sit inside the court box and above its bottom edge.
  if (net.y2 >= court.y2 || net.y2 <= court.y1) return false;
  return net.x2 > net.x1 && net.x2 - net.x1 > (court.x2 - court.x1) * 0.3;
}

/**
 * Solve the image-to-court mapping from one court box and one net box.
 * Returns null when the detections cannot support a fit.
 */
export function buildCourtMapping(detections, bestCourt) {
  if (!bestCourt) return null;
  const net = detections
    .filter((detection) => detection.classId === NET_CLASS_ID)
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!net || !isPlausible(bestCourt, net)) return null;

  const correspondences = courtCorrespondences(bestCourt, net);
  try {
    const courtToImage = solveHomography(correspondences);
    return {
      courtToImage,
      imageToCourt: invert(courtToImage),
      residual: reprojectionError(courtToImage, correspondences),
      confidence: Math.min(bestCourt.confidence, net.confidence),
    };
  } catch {
    return null;
  }
}

/**
 * Where a detection touches the court, in metres.
 *
 * The bottom of the box is the contact point for anything resting on the
 * ground. A ball in flight is not resting on the ground, and this returns the
 * point it would occupy if it were, which is further from the camera than the
 * truth. Only a bounce frame gives an honest answer.
 */
export function groundPosition(mapping, detection) {
  if (!mapping) return null;
  const point = { x: (detection.x1 + detection.x2) / 2, y: detection.y2 };
  try {
    return apply(mapping.imageToCourt, point);
  } catch {
    return null;
  }
}

/** Plain-language name for where a point sits. */
export function describePosition(position) {
  if (!position) return null;
  const box = serviceBox(position);
  if (box) return `${box.replace("-", " ")} service box`;
  if (isInsideSingles(position)) return "singles court";
  if (isInsideDoubles(position)) return "doubles alley";
  return "out";
}

/** Project the court's own lines back onto the image. */
export function projectCourtLines(mapping, lines) {
  if (!mapping) return [];
  const projected = [];
  for (const line of lines) {
    try {
      projected.push({
        name: line.name,
        from: apply(mapping.courtToImage, line.from),
        to: apply(mapping.courtToImage, line.to),
      });
    } catch {
      // A line running through the horizon has no finite image. Skip it.
    }
  }
  return projected;
}
