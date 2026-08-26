/**
 * Plane-to-plane mapping, solved by the direct linear transform.
 *
 * A homography is a 3x3 matrix held row-major as nine numbers. It maps points
 * on one plane to points on another, which is exactly the relationship between
 * the court and an image of the court, so long as the point really is on the
 * ground. A ball in flight is not, and no homography can rescue that.
 *
 * Four correspondences determine the eight degrees of freedom. More than four
 * are solved in the least-squares sense. Both point sets are conditioned before
 * the solve and the conditioning is undone afterwards, which is what keeps a
 * mapping from metres to pixels from falling apart numerically.
 */

const EPSILON = 1e-12;

export function multiply(a, b) {
  const out = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += a[row * 3 + k] * b[k * 3 + column];
      out[row * 3 + column] = sum;
    }
  }
  return out;
}

export function invert(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const cofactorA = e * i - f * h;
  const cofactorB = f * g - d * i;
  const cofactorC = d * h - e * g;
  const determinant = a * cofactorA + b * cofactorB + c * cofactorC;
  if (Math.abs(determinant) < EPSILON) throw new Error("The homography is singular and cannot be inverted.");

  return [
    cofactorA, c * h - b * i, b * f - c * e,
    cofactorB, a * i - c * g, c * d - a * f,
    cofactorC, b * g - a * h, a * e - b * d,
  ].map((value) => value / determinant);
}

export function apply(matrix, { x, y }) {
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  if (Math.abs(w) < EPSILON) {
    throw new Error("The point maps to the horizon and has no finite image.");
  }
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
  };
}

/** Centre on the origin and scale so the mean distance from it is sqrt(2). */
function conditioner(points) {
  const count = points.length;
  let centreX = 0;
  let centreY = 0;
  for (const p of points) {
    centreX += p.x / count;
    centreY += p.y / count;
  }

  let meanDistance = 0;
  for (const p of points) meanDistance += Math.hypot(p.x - centreX, p.y - centreY) / count;
  if (meanDistance < EPSILON) throw new Error("The points are all in the same place.");

  const scale = Math.SQRT2 / meanDistance;
  return {
    matrix: [scale, 0, -scale * centreX, 0, scale, -scale * centreY, 0, 0, 1],
    points: points.map((p) => ({ x: (p.x - centreX) * scale, y: (p.y - centreY) * scale })),
  };
}

/** Gaussian elimination with partial pivoting. Mutates its arguments. */
function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(matrix[pivotRow][column]) < 1e-10) {
      throw new Error("The correspondences are degenerate. Three or more points are collinear.");
    }
    [matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];
    [vector[column], vector[pivotRow]] = [vector[pivotRow], vector[column]];

    for (let row = column + 1; row < size; row += 1) {
      const factor = matrix[row][column] / matrix[column][column];
      if (factor === 0) continue;
      for (let k = column; k < size; k += 1) matrix[row][k] -= factor * matrix[column][k];
      vector[row] -= factor * vector[column];
    }
  }

  const solution = new Array(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = vector[row];
    for (let k = row + 1; k < size; k += 1) sum -= matrix[row][k] * solution[k];
    solution[row] = sum / matrix[row][row];
  }
  return solution;
}

/**
 * Solve the homography taking every `from` point to its `to` point.
 * Needs at least four correspondences, no three of them collinear.
 */
export function solveHomography(correspondences) {
  if (correspondences.length < 4) {
    throw new Error(`A homography needs at least 4 correspondences, got ${correspondences.length}.`);
  }

  const source = conditioner(correspondences.map((c) => c.from));
  const target = conditioner(correspondences.map((c) => c.to));

  // Each correspondence contributes two rows, with h22 pinned to 1.
  const normal = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const rightHand = new Array(8).fill(0);
  const accumulate = (row, value) => {
    for (let i = 0; i < 8; i += 1) {
      rightHand[i] += row[i] * value;
      for (let j = 0; j < 8; j += 1) normal[i][j] += row[i] * row[j];
    }
  };

  for (let index = 0; index < correspondences.length; index += 1) {
    const { x, y } = source.points[index];
    const { x: u, y: v } = target.points[index];
    accumulate([x, y, 1, 0, 0, 0, -x * u, -y * u], u);
    accumulate([0, 0, 0, x, y, 1, -x * v, -y * v], v);
  }

  const solved = solveLinearSystem(normal, rightHand);
  const conditioned = [...solved, 1];
  const matrix = multiply(invert(target.matrix), multiply(conditioned, source.matrix));

  const scale = matrix[8];
  if (Math.abs(scale) < EPSILON) throw new Error("The solved homography is degenerate.");
  return matrix.map((value) => value / scale);
}

/** Root-mean-square distance between each mapped `from` point and its `to`. */
export function reprojectionError(matrix, correspondences) {
  let total = 0;
  for (const { from, to } of correspondences) {
    const mapped = apply(matrix, from);
    total += (mapped.x - to.x) ** 2 + (mapped.y - to.y) ** 2;
  }
  return Math.sqrt(total / correspondences.length);
}
