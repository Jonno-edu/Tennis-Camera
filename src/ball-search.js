/**
 * The ball pass reads one square crop per frame. A wide frame needs more than
 * one crop to cover, so this walks the crops in turn until a ball shows up and
 * then keeps the crop on that ball until it goes missing.
 */
export const BALL_TRACK_PATIENCE = 5;

export function tileCenters(sourceWidth, sourceHeight) {
  const side = Math.min(sourceWidth, sourceHeight);
  if (side >= sourceWidth) return [sourceWidth / 2];
  return [side / 2, sourceWidth / 2, sourceWidth - side / 2];
}

export function createBallSearch(patience = BALL_TRACK_PATIENCE) {
  let tileIndex = 0;
  let tracked = null;
  let missed = 0;

  return {
    get tracked() {
      return tracked;
    },

    nextCenterX(sourceWidth, sourceHeight) {
      if (tracked) return (tracked.x1 + tracked.x2) / 2;
      const centers = tileCenters(sourceWidth, sourceHeight);
      const center = centers[tileIndex % centers.length];
      tileIndex += 1;
      return center;
    },

    record(ball) {
      if (ball) {
        tracked = ball;
        missed = 0;
        return;
      }
      missed += 1;
      if (missed >= patience) {
        tracked = null;
        missed = 0;
      }
    },

    reset() {
      tileIndex = 0;
      tracked = null;
      missed = 0;
    },
  };
}
