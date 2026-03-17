import { Matrix } from "../linalg/matrix.js";

/** Input transform state: X_norm = (X - offset) / coefficient */
export interface InputTransformState {
  offset: number[];
  coefficient: number[];
}

/**
 * Create an identity input transform (no normalization).
 * Use when inputs are already in the space the kernel expects.
 */
export function identityInputTransform(d: number): InputTransformState {
  return {
    offset: new Array(d).fill(0),
    coefficient: new Array(d).fill(1),
  };
}

/**
 * Create an input transform from parameter bounds.
 * Maps [lo, hi] → [0, 1] for each dimension, matching Ax/BoTorch's Normalize.
 * Lengthscales are then in [0,1] space.
 */
export function boundsInputTransform(
  bounds: [number, number][],
): InputTransformState {
  return {
    offset: bounds.map((b) => b[0]),
    coefficient: bounds.map((b) => b[1] - b[0]),
  };
}

/**
 * Input normalization: X_norm = (X - offset) / coefficient
 * Matches BoTorch's Normalize input transform.
 */
export class InputNormalize {
  readonly offset: Float64Array;
  readonly coefficient: Float64Array;

  constructor(offset: number[], coefficient: number[]) {
    this.offset = Float64Array.from(offset);
    this.coefficient = Float64Array.from(coefficient);
  }

  forward(X: Matrix): Matrix {
    const result = new Matrix(X.rows, X.cols);
    for (let i = 0; i < X.rows; i++) {
      for (let j = 0; j < X.cols; j++) {
        result.set(i, j, (X.get(i, j) - this.offset[j]) / this.coefficient[j]);
      }
    }
    return result;
  }
}
