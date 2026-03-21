// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { GPInternals, MultiTaskGPModelState, PredictionResult } from "./types.js";
import type { OutcomeUntransform } from "../transforms/outcome.js";

import { buildKernel } from "../kernels/build.js";
import { kernelDiag } from "../kernels/composite.js";
import { MultitaskKernel } from "../kernels/multitask.js";
import { cholesky } from "../linalg/cholesky.js";
import { Matrix } from "../linalg/matrix.js";
import { forwardSolve, solveCholesky } from "../linalg/solve.js";
import { buildOutcomeUntransform } from "../transforms/build_outcome.js";
import { InputNormalize } from "../transforms/normalize.js";
import { InputWarp } from "../transforms/warp.js";

/**
 * Multi-task GP using ICM (Intrinsic Coregionalization Model).
 *
 * The training data X has a task index column. The kernel is a product of
 * a data kernel and a task covariance matrix B = W @ W^T + diag(exp(log_var)).
 *
 * Prediction for a specific task at new X points:
 * 1. Append the task index to each test point
 * 2. Compute cross-covariance with all training points (across tasks)
 * 3. Standard GP prediction
 */
export class MultiTaskGP {
  private readonly kernel: MultitaskKernel;
  private readonly meanConstants: Array<number>;
  private readonly inputTransform: InputNormalize | null;
  private readonly inputWarp: InputWarp | null;
  private readonly outcomeTransform: OutcomeUntransform | null;
  private readonly trainXFull: Matrix;
  private readonly L: Matrix;
  private readonly alpha: Matrix;
  private readonly taskFeature: number;
  private readonly dataDim: number;
  readonly numTasks: number;

  constructor(state: MultiTaskGPModelState) {
    if (state.train_X.length === 0) {
      throw new Error("train_X must not be empty");
    }
    this.numTasks = state.num_tasks;
    this.taskFeature = state.task_feature;
    // Support both scalar (shared) and per-task mean constants
    if (Array.isArray(state.mean_constant)) {
      this.meanConstants = state.mean_constant;
    } else {
      this.meanConstants = new Array(state.num_tasks).fill(state.mean_constant);
    }

    this.inputTransform = state.input_transform
      ? new InputNormalize(state.input_transform.offset, state.input_transform.coefficient)
      : null;

    this.inputWarp = state.input_warp
      ? new InputWarp(
          state.input_warp.concentration0,
          state.input_warp.concentration1,
          state.input_warp.indices,
        )
      : null;

    this.outcomeTransform = state.outcome_transform
      ? buildOutcomeUntransform(state.outcome_transform)
      : null;

    this.dataDim = state.train_X[0].length - 1;
    const dataKernel = buildKernel(state.data_kernel);
    // Support three modes:
    // 1. covar_matrix: pre-computed B matrix (BoTorch 0.16+ PositiveIndexKernel)
    // 2. var: B = W @ W^T + diag(var), direct variance
    // 3. log_var: B = W @ W^T + diag(exp(log_var)), legacy format
    const diagVar = state.task_covar.var ?? state.task_covar.log_var ?? [];
    const varIsLog = !state.task_covar.var;
    this.kernel = new MultitaskKernel(
      dataKernel,
      state.task_covar.covar_factor,
      diagVar,
      state.task_feature,
      varIsLog,
      state.task_covar.covar_matrix,
    );

    // Training data: apply transforms to data columns only, keep task column
    const trainXRaw = Matrix.from2D(state.train_X);
    this.trainXFull = this.applyTransforms(trainXRaw);

    // Kernel matrix
    const K = this.kernel.compute(this.trainXFull, this.trainXFull);
    const noiseVariance = state.noise_variance;
    if (typeof noiseVariance === "number") {
      K.addDiag(noiseVariance);
    } else {
      K.addDiagVec(Float64Array.from(noiseVariance));
    }

    this.L = cholesky(K);

    // Alpha: subtract per-task mean from targets
    const trainY = Matrix.vector(state.train_Y);
    const tf = this.taskFeature < 0 ? this.trainXFull.cols + this.taskFeature : this.taskFeature;
    const residuals = new Matrix(trainY.rows, 1);
    for (let i = 0; i < trainY.rows; i++) {
      const taskIdx = Math.round(this.trainXFull.get(i, tf));
      residuals.data[i] = trainY.get(i, 0) - this.meanConstants[taskIdx];
    }
    this.alpha = solveCholesky(this.L, residuals);
  }

  /**
   * Expose GP internals for analytic Sobol', for a specific task.
   *
   * For task t, the effective alpha folds in the task covariance:
   *   α_eff_i = α_i × B[t, task_i]
   *
   * Returns data-dimension-only training inputs (task column removed).
   */
  getInternals(taskIndex: number): GPInternals {
    const tf = this.taskFeature < 0 ? this.trainXFull.cols + this.taskFeature : this.taskFeature;
    const n = this.trainXFull.rows;
    const B = this.kernel.indexKernel.taskCovar;

    // Build effective alpha: α_i × B[t, task_i]
    const alphaEff = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ti = Math.round(this.trainXFull.get(i, tf));
      alphaEff[i] = this.alpha.get(i, 0) * B.get(taskIndex, ti);
    }

    // Extract data-only columns (remove task column)
    const dataCols: Array<number> = [];
    for (let j = 0; j < this.trainXFull.cols; j++) {
      if (j !== tf) {
        dataCols.push(j);
      }
    }
    const trainXData: Array<Array<number>> = new Array(n);
    for (let i = 0; i < n; i++) {
      const row: Array<number> = new Array(dataCols.length);
      for (let j = 0; j < dataCols.length; j++) {
        row[j] = this.trainXFull.get(i, dataCols[j]);
      }
      trainXData[i] = row;
    }

    return {
      alpha: alphaEff,
      trainXNorm: trainXData,
      meanConstant: this.meanConstants[taskIndex],
    };
  }

  private applyTransforms(X: Matrix): Matrix {
    const tf = this.taskFeature < 0 ? X.cols + this.taskFeature : this.taskFeature;

    // Extract data columns and task column
    const dataCols: Array<number> = [];
    for (let j = 0; j < X.cols; j++) {
      if (j !== tf) {
        dataCols.push(j);
      }
    }

    let dataX = new Matrix(X.rows, dataCols.length);
    for (let i = 0; i < X.rows; i++) {
      for (let j = 0; j < dataCols.length; j++) {
        dataX.set(i, j, X.get(i, dataCols[j]));
      }
    }

    // Apply transforms to data columns
    if (this.inputTransform) {
      dataX = this.inputTransform.forward(dataX);
    }
    if (this.inputWarp) {
      dataX = this.inputWarp.forward(dataX);
    }

    // Reassemble with task column
    const result = new Matrix(X.rows, X.cols);
    for (let i = 0; i < X.rows; i++) {
      let dk = 0;
      for (let j = 0; j < X.cols; j++) {
        if (j === tf) {
          result.set(i, j, X.get(i, j));
        } else {
          result.set(i, j, dataX.get(i, dk));
          dk++;
        }
      }
    }
    return result;
  }

  /** Prepare test points with task index and apply transforms. */
  private prepareTestPoints(testPoints: Array<Array<number>>, taskIndex: number): Matrix {
    const tf =
      this.taskFeature < 0 ? testPoints[0].length + 1 + this.taskFeature : this.taskFeature;
    const testWithTask: Array<Array<number>> = testPoints.map((pt) => {
      const row = [...pt];
      row.splice(tf, 0, taskIndex);
      return row;
    });
    return this.applyTransforms(Matrix.from2D(testWithTask));
  }

  /** Compute V = L⁻¹ @ K*ᵀ for cross-covariance matrix. */
  private computeV(Kstar: Matrix, n: number): Matrix {
    const KstarT = new Matrix(this.trainXFull.rows, n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < this.trainXFull.rows; j++) {
        KstarT.set(j, i, Kstar.get(i, j));
      }
    }
    return forwardSolve(this.L, KstarT);
  }

  predict(testPoints: Array<Array<number>>, taskIndex: number): PredictionResult {
    if (testPoints.length === 0) {
      throw new Error("testPoints must not be empty");
    }
    if (testPoints[0].length !== this.dataDim) {
      throw new Error(
        `Dimension mismatch: test has ${testPoints[0].length} dims, model trained on ${this.dataDim} data dims`,
      );
    }

    const testXNorm = this.prepareTestPoints(testPoints, taskIndex);
    const Kstar = this.kernel.compute(testXNorm, this.trainXFull);

    const taskMean = this.meanConstants[taskIndex];
    const n = testPoints.length;
    const mu = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let j = 0; j < this.trainXFull.rows; j++) {
        dot += Kstar.get(i, j) * this.alpha.get(j, 0);
      }
      mu[i] = taskMean + dot;
    }

    const kssDiag = kernelDiag(this.kernel, testXNorm);
    const V = this.computeV(Kstar, n);

    const variance = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let vSq = 0;
      for (let j = 0; j < this.trainXFull.rows; j++) {
        const vji = V.get(j, i);
        vSq += vji * vji;
      }
      variance[i] = Math.max(0, kssDiag[i] - vSq);
    }

    if (this.outcomeTransform) {
      for (let i = 0; i < n; i++) {
        const ut = this.outcomeTransform.untransform(mu[i], variance[i]);
        mu[i] = ut.mean;
        variance[i] = ut.variance;
      }
    }

    return { mean: mu, variance };
  }

  /**
   * Posterior covariance between each test point and a reference point.
   * Both test points and ref point are for the same task.
   *
   * Cov(f(x_i, t), f(x_ref, t)) = K_mt(x_i_t, x_ref_t) - v_i · v_ref
   */
  predictCovarianceWith(
    testPoints: Array<Array<number>>,
    taskIndex: number,
    refPoint: Array<number>,
  ): Float64Array {
    const testXNorm = this.prepareTestPoints(testPoints, taskIndex);
    const refXNorm = this.prepareTestPoints([refPoint], taskIndex);

    const KstarTest = this.kernel.compute(testXNorm, this.trainXFull);
    const KstarRef = this.kernel.compute(refXNorm, this.trainXFull);

    const Vtest = this.computeV(KstarTest, testPoints.length);
    const Vref = this.computeV(KstarRef, 1);

    const Ktr = this.kernel.compute(testXNorm, refXNorm);

    const n = testPoints.length;
    const covariance = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let vDot = 0;
      for (let j = 0; j < this.trainXFull.rows; j++) {
        vDot += Vtest.get(j, i) * Vref.get(j, 0);
      }
      covariance[i] = Ktr.get(i, 0) - vDot;
    }

    // Scale by outcome transform if Standardize (linear)
    if (this.outcomeTransform) {
      // StandardizeUntransform has a std property; use untransformCovariance for proper scaling
      for (let i = 0; i < n; i++) {
        covariance[i] = this.outcomeTransform.untransformCovariance(covariance[i]);
      }
    }

    return covariance;
  }
}
