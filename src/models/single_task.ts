import { Matrix } from "../linalg/matrix.js";
import { ExactGP } from "./gp.js";
import type { GPModelState, PredictionResult } from "./types.js";
import { ConstantMean } from "../means/constant.js";
import { InputNormalize } from "../transforms/normalize.js";
import { InputWarp } from "../transforms/warp.js";
import { buildOutcomeUntransform } from "../transforms/build_outcome.js";
import { buildKernel } from "../kernels/build.js";

export class SingleTaskGP {
  private gp: ExactGP;
  private trainDim: number;
  private trainY: Matrix;

  constructor(state: GPModelState) {
    if (state.train_X.length === 0) {
      throw new Error("train_X must not be empty");
    }
    const trainX = Matrix.from2D(state.train_X);
    this.trainDim = trainX.cols;
    this.trainY = Matrix.vector(state.train_Y);
    const kernel = buildKernel(state.kernel);
    const mean = new ConstantMean(state.mean_constant);

    const noiseVariance = Array.isArray(state.noise_variance)
      ? Float64Array.from(state.noise_variance)
      : state.noise_variance;

    const inputTransform = state.input_transform
      ? new InputNormalize(
          state.input_transform.offset,
          state.input_transform.coefficient,
        )
      : undefined;

    const inputWarp = state.input_warp
      ? new InputWarp(
          state.input_warp.concentration0,
          state.input_warp.concentration1,
          state.input_warp.indices,
        )
      : undefined;

    const outcomeTransform = state.outcome_transform
      ? buildOutcomeUntransform(state.outcome_transform)
      : undefined;

    this.gp = new ExactGP(
      trainX,
      this.trainY,
      kernel,
      mean,
      noiseVariance,
      inputTransform,
      outcomeTransform,
      inputWarp,
    );
  }

  predict(testPoints: number[][]): PredictionResult {
    if (testPoints.length === 0) {
      throw new Error("testPoints must not be empty");
    }
    if (testPoints[0].length !== this.trainDim) {
      throw new Error(
        `Dimension mismatch: test has ${testPoints[0].length} dims, model trained on ${this.trainDim}`,
      );
    }
    const testX = Matrix.from2D(testPoints);
    return this.gp.predict(testX);
  }

  /**
   * Analytic LOO-CV predictions (Rasmussen & Williams, Eq. 5.12).
   * Returns predictions in the same space as predict() (after outcome untransform).
   */
  loocvPredictions(): PredictionResult {
    return this.gp.loocvPredictions(this.trainY);
  }

  /**
   * Compute posterior covariance between each test point and a reference point.
   * Returns Cov(f(x_i), f(x_ref)) for use in relativization.
   */
  predictCovarianceWith(
    testPoints: number[][],
    refPoint: number[],
  ): Float64Array {
    const testX = Matrix.from2D(testPoints);
    const refX = Matrix.from2D([refPoint]);
    return this.gp.predictCovarianceWith(testX, refX);
  }
}
