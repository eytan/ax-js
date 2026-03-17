import { SingleTaskGP } from "./single_task.js";
import type { ModelListState, PredictionResult } from "./types.js";

export class ModelListGP {
  readonly outcomeNames: string[];
  private models: SingleTaskGP[];

  constructor(state: ModelListState) {
    this.outcomeNames = state.outcome_names;
    this.models = state.models.map((s) => new SingleTaskGP(s));
  }

  predict(testPoints: number[][]): PredictionResult[] {
    return this.models.map((m) => m.predict(testPoints));
  }

  predictOutcome(index: number, testPoints: number[][]): PredictionResult {
    return this.models[index].predict(testPoints);
  }

  /** Analytic LOO-CV predictions per outcome. */
  loocvPredictions(): PredictionResult[] {
    return this.models.map((m) => m.loocvPredictions());
  }

  /**
   * Posterior covariance with a reference point, per output.
   * Each sub-model is independent, so no cross-output covariance.
   */
  predictCovarianceWith(
    testPoints: number[][],
    refPoint: number[],
  ): Float64Array[] {
    return this.models.map((m) =>
      m.predictCovarianceWith(testPoints, refPoint),
    );
  }
}
