// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import { Matrix } from "./matrix.js";

/**
 * LU decomposition with partial pivoting.
 * Returns { L, U, P } where PA = LU, P is permutation indices.
 */
export function lu(A: Matrix): { L: Matrix; U: Matrix; perm: Array<number> } {
  const n = A.rows;
  const M = A.clone(); // work in-place on clone
  const perm = Array.from({ length: n }, (_, i) => i);

  for (let k = 0; k < n; k++) {
    // Partial pivoting: find row with largest element in column k
    let maxVal = Math.abs(M.get(k, k));
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M.get(i, k));
      if (v > maxVal) {
        maxVal = v;
        maxRow = i;
      }
    }

    // Swap rows k and maxRow
    if (maxRow !== k) {
      [perm[k], perm[maxRow]] = [perm[maxRow], perm[k]];
      for (let j = 0; j < n; j++) {
        const tmp = M.get(k, j);
        M.set(k, j, M.get(maxRow, j));
        M.set(maxRow, j, tmp);
      }
    }

    const pivot = M.get(k, k);
    if (Math.abs(pivot) < 1e-15) {
      continue;
    }

    // Compute multipliers and update
    for (let i = k + 1; i < n; i++) {
      const factor = M.get(i, k) / pivot;
      M.set(i, k, factor); // store L factor in lower part
      for (let j = k + 1; j < n; j++) {
        M.set(i, j, M.get(i, j) - factor * M.get(k, j));
      }
    }
  }

  // Extract L and U from M
  const L = Matrix.eye(n);
  const U = Matrix.zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (j < i) {
        L.set(i, j, M.get(i, j));
      } else {
        U.set(i, j, M.get(i, j));
      }
    }
  }

  return { L, U, perm };
}

/**
 * LU factorization result (for caching).
 */
export interface LUFactors {
  L: Matrix;
  U: Matrix;
  perm: Array<number>;
}

/**
 * Solve Ax = b using pre-computed LU factors.
 * Used when the same matrix A is solved against multiple right-hand sides.
 */
export function solveLUWithFactors(factors: LUFactors, b: Matrix): Matrix {
  const { L, U, perm } = factors;
  const n = L.rows;
  const x = Matrix.zeros(n, b.cols);

  for (let col = 0; col < b.cols; col++) {
    // Apply permutation to b
    const pb = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      pb[i] = b.get(perm[i], col);
    }

    // Forward substitution: Ly = Pb
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = pb[i];
      for (let j = 0; j < i; j++) {
        s -= L.get(i, j) * y[j];
      }
      y[i] = s; // L has 1s on diagonal
    }

    // Back substitution: Ux = y
    const xCol = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) {
        s -= U.get(i, j) * xCol[j];
      }
      xCol[i] = s / U.get(i, i);
    }

    for (let i = 0; i < n; i++) {
      x.set(i, col, xCol[i]);
    }
  }

  return x;
}

/**
 * Solve Ax = b using LU decomposition with partial pivoting.
 * Handles non-symmetric matrices (unlike Cholesky).
 */
export function solveLU(A: Matrix, b: Matrix): Matrix {
  const factors = lu(A);
  return solveLUWithFactors(factors, b);
}
