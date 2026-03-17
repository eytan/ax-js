import { Matrix } from "../linalg/matrix.js";
import { cholesky } from "../linalg/cholesky.js";
import { forwardSolve, solveCholesky } from "../linalg/solve.js";
import type { Kernel } from "../kernels/types.js";
import { kernelDiag } from "../kernels/composite.js";
import { ConstantMean } from "../means/constant.js";
import { InputNormalize } from "../transforms/normalize.js";
import { InputWarp } from "../transforms/warp.js";
import type { OutcomeUntransform } from "../transforms/outcome.js";
import type { PredictionResult } from "./types.js";

/**
 * Core ExactGP with Cholesky-based posterior.
 *
 * Pre-computes at construction:
 *   L = cholesky(K + noise * I)
 *   alpha = L^T \ (L \ (y - m(X)))
 *
 * Prediction at X*:
 *   mu = m(X*) + k* · alpha
 *   v = L \ k*^T
 *   var = diag(k**) - sum(v²)   [diagonal only — O(m) not O(m²)]
 */
export class ExactGP {
  private kernel: Kernel;
  private mean: ConstantMean;
  private inputTransform: InputNormalize | null;
  private inputWarp: InputWarp | null;
  private outcomeTransform: OutcomeUntransform | null;
  private trainXNorm: Matrix;
  private L: Matrix;
  private alpha: Matrix;

  constructor(
    trainX: Matrix,
    trainY: Matrix,
    kernel: Kernel,
    mean: ConstantMean,
    noiseVariance: number | Float64Array,
    inputTransform?: InputNormalize,
    outcomeTransform?: OutcomeUntransform,
    inputWarp?: InputWarp,
  ) {
    this.kernel = kernel;
    this.mean = mean;
    this.inputTransform = inputTransform ?? null;
    this.inputWarp = inputWarp ?? null;
    this.outcomeTransform = outcomeTransform ?? null;

    // Step 1: Normalize and warp training inputs
    let xNorm = inputTransform ? inputTransform.forward(trainX) : trainX.clone();
    if (inputWarp) {
      xNorm = inputWarp.forward(xNorm);
    }
    this.trainXNorm = xNorm;

    // Step 2: Compute kernel matrix
    const K = kernel.compute(this.trainXNorm, this.trainXNorm);

    // Step 3: Add noise
    if (typeof noiseVariance === "number") {
      K.addDiag(noiseVariance);
    } else {
      K.addDiagVec(noiseVariance);
    }

    // Step 4: Cholesky factorization
    this.L = cholesky(K);

    // Step 5: Compute alpha = (K+noise*I)^{-1} (y - m(X))
    const meanVals = mean.forward(this.trainXNorm);
    const residuals = new Matrix(trainY.rows, 1);
    for (let i = 0; i < trainY.rows; i++) {
      residuals.data[i] = trainY.get(i, 0) - meanVals.data[i];
    }
    this.alpha = solveCholesky(this.L, residuals);
  }

  /** Transform test inputs through normalize + warp pipeline. */
  private transformInputs(testX: Matrix): Matrix {
    let testXNorm = this.inputTransform
      ? this.inputTransform.forward(testX)
      : testX;
    if (this.inputWarp) {
      testXNorm = this.inputWarp.forward(testXNorm);
    }
    return testXNorm;
  }

  /** Compute V = L⁻¹ @ K*ᵀ for a set of transformed test points. */
  private computeV(Kstar: Matrix, nTest: number): Matrix {
    const KstarT = new Matrix(this.trainXNorm.rows, nTest);
    for (let i = 0; i < Kstar.rows; i++) {
      for (let j = 0; j < Kstar.cols; j++) {
        KstarT.set(j, i, Kstar.get(i, j));
      }
    }
    return forwardSolve(this.L, KstarT);
  }

  predict(testX: Matrix): PredictionResult {
    const testXNorm = this.transformInputs(testX);

    // Cross-covariance k(X*, X_train)
    const Kstar = this.kernel.compute(testXNorm, this.trainXNorm);

    // Posterior mean: m(X*) + k* · alpha
    const meanPrior = this.mean.forward(testXNorm);
    const mu = new Float64Array(testX.rows);
    for (let i = 0; i < testX.rows; i++) {
      let dot = 0;
      for (let j = 0; j < this.trainXNorm.rows; j++) {
        dot += Kstar.get(i, j) * this.alpha.get(j, 0);
      }
      mu[i] = meanPrior.data[i] + dot;
    }

    // Posterior variance: diag(k**) - ||v||²
    const kssDiag = kernelDiag(this.kernel, testXNorm);
    const V = this.computeV(Kstar, testX.rows);

    const variance = new Float64Array(testX.rows);
    for (let i = 0; i < testX.rows; i++) {
      let vSq = 0;
      for (let j = 0; j < this.trainXNorm.rows; j++) {
        const vji = V.get(j, i);
        vSq += vji * vji;
      }
      variance[i] = Math.max(0, kssDiag[i] - vSq);
    }

    // Un-transform if outcome transform exists
    if (this.outcomeTransform) {
      for (let i = 0; i < mu.length; i++) {
        const ut = this.outcomeTransform.untransform(mu[i], variance[i]);
        mu[i] = ut.mean;
        variance[i] = ut.variance;
      }
    }

    return { mean: mu, variance };
  }

  /**
   * Analytic Leave-One-Out Cross-Validation predictions (Rasmussen & Williams, Eq. 5.12).
   *
   * LOO mean:     μ_LOO(i) = y_i - α_i / [K⁻¹]_ii
   * LOO variance: σ²_LOO(i) = 1 / [K⁻¹]_ii
   *
   * where α = K⁻¹(y - m(X)) and K = K(X,X) + σ²I.
   * No refitting required — computed from the full GP's Cholesky factor.
   *
   * Returns predictions in model-internal space (before outcome untransform).
   * Caller (Predictor) is responsible for applying outcome + adapter untransforms.
   */
  loocvPredictions(trainY: Matrix): PredictionResult {
    const n = this.L.rows;

    // Compute diag(K⁻¹) = diag(L⁻ᵀ L⁻¹).
    // For each column i of L⁻¹ (= forward solve of L with e_i),
    // [K⁻¹]_ii = ||L⁻¹[:,i]||².
    // We solve one column at a time to avoid storing the full inverse.
    const diagKinv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // Forward-solve L * x = e_i
      const x = new Float64Array(n);
      for (let row = 0; row < n; row++) {
        let s = row === i ? 1.0 : 0.0;
        for (let j = 0; j < row; j++) {
          s -= this.L.get(row, j) * x[j];
        }
        x[row] = s / this.L.get(row, row);
      }
      let sumSq = 0;
      for (let j = 0; j < n; j++) sumSq += x[j] * x[j];
      diagKinv[i] = sumSq;
    }

    // LOO predictions
    const mean = new Float64Array(n);
    const variance = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const yi = trainY.get(i, 0);
      mean[i] = yi - this.alpha.get(i, 0) / diagKinv[i];
      variance[i] = Math.max(0, 1.0 / diagKinv[i]);
    }

    // Apply outcome untransform (same as predict())
    if (this.outcomeTransform) {
      for (let i = 0; i < n; i++) {
        const ut = this.outcomeTransform.untransform(mean[i], variance[i]);
        mean[i] = ut.mean;
        variance[i] = ut.variance;
      }
    }

    return { mean, variance };
  }

  /**
   *
   * Cov(f(x_i), f(x_ref)) = k(x_i, x_ref) - v_i · v_ref
   * where v = L⁻¹ @ k(X, x)
   *
   * Note: returns covariance in the MODEL's transformed space (before outcome
   * untransform). For Standardize this scales by std²; for nonlinear transforms
   * the covariance in original space requires additional delta-method terms.
   * For relativization, the Standardize scaling cancels out in the ratio.
   */
  predictCovarianceWith(testX: Matrix, refX: Matrix): Float64Array {
    const testXNorm = this.transformInputs(testX);
    const refXNorm = this.transformInputs(refX);

    // Cross-covariance of test and ref with training data
    const KstarTest = this.kernel.compute(testXNorm, this.trainXNorm);
    const KstarRef = this.kernel.compute(refXNorm, this.trainXNorm);

    // V matrices: L⁻¹ @ K*ᵀ
    const Vtest = this.computeV(KstarTest, testX.rows);
    const Vref = this.computeV(KstarRef, refX.rows);

    // Prior covariance k(x_test, x_ref)
    const Ktr = this.kernel.compute(testXNorm, refXNorm);

    const n = testX.rows;
    const covariance = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // k(x_i, x_ref) - v_i · v_ref
      let vDot = 0;
      for (let j = 0; j < this.trainXNorm.rows; j++) {
        vDot += Vtest.get(j, i) * Vref.get(j, 0);
      }
      covariance[i] = Ktr.get(i, 0) - vDot;
    }

    // Scale covariance by outcome transform
    if (this.outcomeTransform) {
      for (let i = 0; i < n; i++) {
        covariance[i] = this.outcomeTransform.untransformCovariance(covariance[i]);
      }
    }

    return covariance;
  }
}
