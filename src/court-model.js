/**
 * ITF court dimensions in metres, and the court in its own coordinate frame.
 *
 * Origin is the centre of the net. X runs across the court, positive toward the
 * right-hand sideline. Y runs along the court, positive toward the far
 * baseline. Both signs are properties of the court itself, not of where the
 * camera happens to stand.
 */
export const COURT = {
  doublesWidth: 10.97,
  singlesWidth: 8.23,
  length: 23.77,
  serviceLineFromNet: 6.4,
  alleyWidth: 1.37,
  netHeightAtPost: 1.07,
  netHeightAtCentre: 0.914,
};

export const HALF_DOUBLES = COURT.doublesWidth / 2;
export const HALF_SINGLES = COURT.singlesWidth / 2;
export const HALF_LENGTH = COURT.length / 2;
const SERVICE = COURT.serviceLineFromNet;

const point = (x, y) => ({ x, y });

/** Line crossings a detector can aim at, keyed by name. */
export const COURT_POINTS = {
  "far-doubles-left": point(-HALF_DOUBLES, HALF_LENGTH),
  "far-doubles-right": point(HALF_DOUBLES, HALF_LENGTH),
  "near-doubles-left": point(-HALF_DOUBLES, -HALF_LENGTH),
  "near-doubles-right": point(HALF_DOUBLES, -HALF_LENGTH),

  "far-singles-left": point(-HALF_SINGLES, HALF_LENGTH),
  "far-singles-right": point(HALF_SINGLES, HALF_LENGTH),
  "near-singles-left": point(-HALF_SINGLES, -HALF_LENGTH),
  "near-singles-right": point(HALF_SINGLES, -HALF_LENGTH),

  "far-service-left": point(-HALF_SINGLES, SERVICE),
  "far-service-right": point(HALF_SINGLES, SERVICE),
  "far-service-centre": point(0, SERVICE),
  "near-service-left": point(-HALF_SINGLES, -SERVICE),
  "near-service-right": point(HALF_SINGLES, -SERVICE),
  "near-service-centre": point(0, -SERVICE),

  "net-left": point(-HALF_DOUBLES, 0),
  "net-right": point(HALF_DOUBLES, 0),
  "net-centre": point(0, 0),
};

const segment = (name, from, to) => ({ name, from, to });

/** Every painted line, for reprojecting the court over a frame. */
export const COURT_LINES = [
  segment("far-baseline", point(-HALF_DOUBLES, HALF_LENGTH), point(HALF_DOUBLES, HALF_LENGTH)),
  segment("near-baseline", point(-HALF_DOUBLES, -HALF_LENGTH), point(HALF_DOUBLES, -HALF_LENGTH)),
  segment("left-doubles-sideline", point(-HALF_DOUBLES, -HALF_LENGTH), point(-HALF_DOUBLES, HALF_LENGTH)),
  segment("right-doubles-sideline", point(HALF_DOUBLES, -HALF_LENGTH), point(HALF_DOUBLES, HALF_LENGTH)),
  segment("left-singles-sideline", point(-HALF_SINGLES, -HALF_LENGTH), point(-HALF_SINGLES, HALF_LENGTH)),
  segment("right-singles-sideline", point(HALF_SINGLES, -HALF_LENGTH), point(HALF_SINGLES, HALF_LENGTH)),
  segment("far-service-line", point(-HALF_SINGLES, SERVICE), point(HALF_SINGLES, SERVICE)),
  segment("near-service-line", point(-HALF_SINGLES, -SERVICE), point(HALF_SINGLES, -SERVICE)),
  segment("centre-service-line", point(0, -SERVICE), point(0, SERVICE)),
  segment("net-line", point(-HALF_DOUBLES, 0), point(HALF_DOUBLES, 0)),
];

/**
 * Which side of the net a court point is on. The far half is the half a camera
 * behind the near baseline is looking at.
 */
export function courtHalf({ y }) {
  if (y === 0) return "net";
  return y > 0 ? "far" : "near";
}

export function isInsideDoubles({ x, y }) {
  return Math.abs(x) <= HALF_DOUBLES && Math.abs(y) <= HALF_LENGTH;
}

export function isInsideSingles({ x, y }) {
  return Math.abs(x) <= HALF_SINGLES && Math.abs(y) <= HALF_LENGTH;
}

/**
 * The service box a serve has to land in, or null if the point is outside every
 * box. Boxes are named by the half they sit in and the side of the centre line.
 */
export function serviceBox({ x, y }) {
  if (Math.abs(x) > HALF_SINGLES || Math.abs(y) > SERVICE) return null;
  return `${y > 0 ? "far" : "near"}-${x > 0 ? "right" : "left"}`;
}
