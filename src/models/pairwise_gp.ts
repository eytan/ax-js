// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { PredictionResult, PairwiseGPModelState } from "./types.js";
import type { Kernel } from "../kernels/types.js";

import { buildKernel } from "../kernels/build.js";
import { kernelDiag } from "../kernels/composite.js";
import { cholesky } from "../linalg/cholesky.js";
import { lu, solveLUWithFactors, type LUFactors } from "../linalg/lu.js";
import { Matrix } from "../linalg/matrix.js";
import { matmul, transpose } from "../linalg/ops.js";
import { solveCholesky } from "../linalg/solve.js";
import { ConstantMean } from "../means/constant.js";
import { InputNormalize } from "../transforms/normalize.js";
import { InputWarp } from "../transforms/warp.js";

/**
 * PairwiseGP for preference/comparison data (BOPE).
 *
 * Unlike ExactGP, PairwiseGP uses a Laplace approximation:
 * - Training "targets" are MAP utility estimates (not raw observations)
 * - The noise is replaced by the Hessian of the probit log-likelihood
 *
 * Prediction at X*:
 *   mu = K(X*, X) @ K^{-1} @ (utility - m(X)) + m(X*)
 *   C = likelihood_hess (from Laplace approximation)
 *   fac = (CK + I)^{-1} @ C @ K(X, X*)
 *   var = K(X*, X*) - K(X*, X) @ fac
 */
export class PairwiseGP {
  private readonly kernel: Kernel;
  private readonly mean: ConstantMean;
  private readonly inputTransform: InputNormalize | null;
  private readonly inputWarp: InputWarp | null;
  private readonly trainXNorm: Matrix;
  private readonly alpha: Matrix;
  private readonly likelihoodHess: Matrix;
  private readonly CKI: Matrix;
  private readonly ckiLU: LUFactors;

  constructor(
    trainX: Matrix,
    utility: Matrix,
    kernel: Kernel,
    mean: ConstantMean,
    likelihoodHess: Matrix,
    inputTransform?: InputNormalize,
    inputWarp?: InputWarp,
  ) {
    this.kernel = kernel;
    this.mean = mean;
    this.inputTransform = inputTransform ?? null;
    this.inputWarp = inputWarp ?? null;
    this.likelihoodHess = likelihoodHess;

    let xNorm = inputTransform ? inputTransform.forward(trainX) : trainX.clone();
    if (this.inputWarp) {
      xNorm = this.inputWarp.forward(xNorm);
    }
    this.trainXNorm = xNorm;

    const K = kernel.compute(this.trainXNorm, this.trainXNorm);
    const L = cholesky(K);

    const meanVals = mean.forward(this.trainXNorm);
    const residuals = new Matrix(utility.rows, 1);
    for (let i = 0; i < utility.rows; i++) {
      residuals.data[i] = utility.get(i, 0) - meanVals.data[i];
    }
    this.alpha = solveCholesky(L, residuals);

    const CK = matmul(likelihoodHess, K);
    this.CKI = CK;
    this.CKI.addDiag(1);

    // Cache LU factorization of CKI (CKI is NOT symmetric, so we need LU)
    this.ckiLU = lu(this.CKI);
  }

  /** Transform inputs through normalize + warp pipeline. */
  private transformInputs(testX: Matrix): Matrix {
    let testXNorm = this.inputTransform ? this.inputTransform.forward(testX) : testX;
    if (this.inputWarp) {
      testXNorm = this.inputWarp.forward(testXNorm);
    }
    return testXNorm;
  }

  predict(testPoints: Array<Array<number>>): PredictionResult {
    if (testPoints.length === 0) {
      throw new Error("testPoints must not be empty");
    }
    if (testPoints[0].length !== this.trainXNorm.cols) {
      throw new Error(
        `Dimension mismatch: test has ${testPoints[0].length} dims, model trained on ${this.trainXNorm.cols}`,
      );
    }
    const testXNorm = this.transformInputs(Matrix.from2D(testPoints));

    const Kstar = this.kernel.compute(testXNorm, this.trainXNorm);
    const kssDiag = kernelDiag(this.kernel, testXNorm);

    const meanPrior = this.mean.forward(testXNorm);
    const mu = new Float64Array(testXNorm.rows);
    for (let i = 0; i < testXNorm.rows; i++) {
      let dot = 0;
      for (let j = 0; j < this.trainXNorm.rows; j++) {
        dot += Kstar.get(i, j) * this.alpha.get(j, 0);
      }
      mu[i] = meanPrior.data[i] + dot;
    }

    const KstarT = transpose(Kstar);
    const C_KstarT = matmul(this.likelihoodHess, KstarT);
    // CKI is NOT symmetric (C and K don't commute), so we need LU, not Cholesky
    const fac = solveLUWithFactors(this.ckiLU, C_KstarT);
    const correction = matmul(Kstar, fac);

    const variance = new Float64Array(testXNorm.rows);
    for (let i = 0; i < testXNorm.rows; i++) {
      variance[i] = Math.max(0, kssDiag[i] - correction.get(i, i));
    }

    return { mean: mu, variance };
  }

  /**
   * Posterior covariance between each test point and a reference point.
   *
   * For PairwiseGP (Laplace approximation):
   *   Cov(f(a), f(b)) = k(a,b) - K(a,X) @ (CK+I)⁻¹ @ C @ K(X,b)
   *
   * where C = likelihood Hessian, K = prior covariance, CK+I is NOT symmetric.
   */
  predictCovarianceWith(testPoints: Array<Array<number>>, refPoint: Array<number>): Float64Array {
    const testXNorm = this.transformInputs(Matrix.from2D(testPoints));
    const refXNorm = this.transformInputs(Matrix.from2D([refPoint]));

    const KstarTest = this.kernel.compute(testXNorm, this.trainXNorm);
    const KstarRef = this.kernel.compute(refXNorm, this.trainXNorm);

    // fac_ref = (CK+I)⁻¹ @ C @ K(X, ref)
    const KstarRefT = transpose(KstarRef);
    const C_KstarRefT = matmul(this.likelihoodHess, KstarRefT);
    const facRef = solveLUWithFactors(this.ckiLU, C_KstarRefT);

    // Prior covariance k(test, ref)
    const Ktr = this.kernel.compute(testXNorm, refXNorm);

    const n = testPoints.length;
    const covariance = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // K(test_i, X) @ fac_ref
      let dot = 0;
      for (let j = 0; j < this.trainXNorm.rows; j++) {
        dot += KstarTest.get(i, j) * facRef.get(j, 0);
      }
      covariance[i] = Ktr.get(i, 0) - dot;
    }

    return covariance;
  }
}

export function createPairwiseGP(state: PairwiseGPModelState): PairwiseGP {
  const trainX = Matrix.from2D(state.train_X);
  const utility = Matrix.vector(state.utility);
  const likelihoodHess = Matrix.from2D(state.likelihood_hess);
  const kernel = buildKernel(state.kernel);
  const mean = new ConstantMean(state.mean_constant);

  const inputTransform = state.input_transform
    ? new InputNormalize(state.input_transform.offset, state.input_transform.coefficient)
    : undefined;

  const inputWarp = state.input_warp
    ? new InputWarp(
        state.input_warp.concentration0,
        state.input_warp.concentration1,
        state.input_warp.indices,
      )
    : undefined;

  return new PairwiseGP(trainX, utility, kernel, mean, likelihoodHess, inputTransform, inputWarp);
}
