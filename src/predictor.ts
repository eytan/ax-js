import { loadModel } from "./io/deserialize.js";
import type { AnyModel } from "./io/deserialize.js";
import { ModelListGP } from "./models/model_list.js";
import { MultiTaskGP } from "./models/multi_task.js";
import type {
  ExperimentState,
  SearchSpaceParam,
  PredictionResult,
  AdapterTransform,
  Observation,
  TrainingData,
  LOOCVResult,
  DimensionImportance,
  AnyModelState,
  GPModelState,
  KernelState,
  OutcomeTransformState,
} from "./models/types.js";
import { SingleTaskGP } from "./models/single_task.js";
import {
  LogUntransform,
  BilogUntransform,
  StandardizeUntransform,
  PowerUntransform,
  ChainedOutcomeUntransform,
} from "./transforms/outcome.js";
import type { OutcomeUntransform } from "./transforms/outcome.js";
import {
  relativizePredictions,
  type RelativizeOptions,
} from "./transforms/relativize.js";

/** Predictions keyed by outcome/metric name. */
export type PredictionsByOutcome = Record<string, PredictionResult>;

/**
 * High-level prediction interface mirroring Ax's Adapter.predict().
 *
 * Wraps a loaded model + search space metadata so callers never need to:
 * - Check model type (SingleTaskGP vs ModelListGP vs ...)
 * - Handle input normalization (the model's input_transform does it)
 * - Know about outcome indexing (results are keyed by name)
 * - Apply adapter-level untransforms (LogY, BilogY, etc.)
 */
export class Predictor {
  readonly outcomeNames: string[];
  readonly paramNames: string[];
  readonly paramBounds: [number, number][];
  readonly paramSpecs: SearchSpaceParam[];
  readonly statusQuoPoint: number[] | null;
  private model: AnyModel;
  private _state: ExperimentState;
  private adapterUntransforms: Map<string, OutcomeUntransform> | null;

  constructor(exported: ExperimentState) {
    this._state = exported;
    this.model = loadModel(exported.model_state);
    this.paramSpecs = exported.search_space.parameters;
    this.paramNames = exported.search_space.parameters.map((p) => p.name);
    this.paramBounds = exported.search_space.parameters.map(
      (p) => (p.bounds || [0, 1]) as [number, number],
    );
    this.statusQuoPoint = exported.status_quo?.point ?? null;
    if (exported.outcome_names) {
      this.outcomeNames = exported.outcome_names;
    } else if (this.model instanceof ModelListGP) {
      this.outcomeNames = this.model.outcomeNames;
    } else {
      this.outcomeNames = ["y"];
    }
    this.adapterUntransforms = buildAdapterUntransforms(
      exported.adapter_transforms,
      this.outcomeNames,
    );
    validateModelState(exported.model_state, this.paramNames.length);
  }

  /** Observed trial data, if included in the ExperimentState. */
  get observations(): Observation[] | undefined {
    return this._state.observations;
  }

  /**
   * Predict at one or more points (raw parameter space).
   * Points are positional arrays matching search_space parameter order.
   * The model's input_transform handles normalization if present.
   *
   * Returns predictions keyed by outcome name.
   */
  predict(points: number[][]): PredictionsByOutcome {
    if (this.model instanceof ModelListGP) {
      const results = this.model.predict(points);
      const out: PredictionsByOutcome = {};
      for (let k = 0; k < results.length; k++) {
        out[this.outcomeNames[k]] = this.applyAdapterUntransform(
          this.outcomeNames[k],
          results[k],
        );
      }
      return out;
    }
    if (this.model instanceof MultiTaskGP) {
      const out: PredictionsByOutcome = {};
      for (let t = 0; t < this.model.numTasks; t++) {
        const result = this.model.predict(points, t);
        const name = this.outcomeNames[t] || `task_${t}`;
        out[name] = this.applyAdapterUntransform(name, result);
      }
      return out;
    }
    const result = (
      this.model as Exclude<AnyModel, ModelListGP | MultiTaskGP>
    ).predict(points);
    return {
      [this.outcomeNames[0]]: this.applyAdapterUntransform(
        this.outcomeNames[0],
        result,
      ),
    };
  }

  /**
   * Predict relative effects (% change vs status quo) at given points.
   * Requires status_quo to be set in ExperimentState.
   * Returns predictions keyed by outcome name with relativized mean/variance.
   *
   * By default, uses model covariance between test and status quo points for
   * tighter confidence intervals. Pass `useCovariance: false` to assume
   * independence (matches Ax's default `cov_means=0` behavior).
   */
  predictRelative(
    points: number[][],
    opts?: RelativizeOptions & { useCovariance?: boolean },
  ): PredictionsByOutcome {
    if (!this.statusQuoPoint) {
      throw new Error("Cannot relativize: no status_quo defined");
    }

    const absPreds = this.predict(points);
    const sqPreds = this.predict([this.statusQuoPoint]);
    const useCovariance = opts?.useCovariance !== false;

    const out: PredictionsByOutcome = {};
    for (const name of Object.keys(absPreds)) {
      const sqMean = sqPreds[name].mean[0];
      const sqVar = sqPreds[name].variance[0];
      const covariances = useCovariance
        ? this.getCovariances(name, points)
        : undefined;

      out[name] = relativizePredictions(
        absPreds[name].mean,
        absPreds[name].variance,
        sqMean,
        sqVar,
        opts,
        covariances,
      );
    }
    return out;
  }

  /**
   * Get covariances between predictions at points and the status quo.
   * Used internally by predictRelative for tighter confidence intervals.
   */
  private getCovariances(
    outcomeName: string,
    points: number[][],
  ): Float64Array | undefined {
    if (!this.statusQuoPoint) return undefined;
    const sqPoint = this.statusQuoPoint;

    if (this.model instanceof ModelListGP) {
      const idx = this.outcomeNames.indexOf(outcomeName);
      if (idx < 0) return undefined;
      const covs = this.model.predictCovarianceWith(points, sqPoint);
      return covs[idx];
    }
    if (this.model instanceof MultiTaskGP) {
      const taskIdx = this.outcomeNames.indexOf(outcomeName);
      if (taskIdx < 0) return undefined;
      return this.model.predictCovarianceWith(points, taskIdx, sqPoint);
    }
    // SingleTaskGP, PairwiseGP, EnsembleGP
    const m = this.model as { predictCovarianceWith?: (a: number[][], b: number[]) => Float64Array };
    if (typeof m.predictCovarianceWith === "function") {
      return m.predictCovarianceWith(points, sqPoint);
    }
    return undefined;
  }

  /**
   * Get training data for an outcome, with Y un-standardized to raw space.
   *
   * @example
   * ```ts
   * const { X, Y, paramNames } = predictor.getTrainingData("accuracy");
   * // X[i] is the i-th training point in raw parameter space
   * // Y[i] is the un-standardized observed value
   * ```
   */
  getTrainingData(outcomeName?: string): TrainingData {
    const name = outcomeName ?? this.outcomeNames[0];
    const ms = this._state.model_state;
    const sub = getSubModel(ms, this.outcomeNames, name);
    const trainX = sub.train_X;
    const trainY = sub.train_Y;
    if (!trainX || !trainY) {
      return { X: [], Y: [], paramNames: this.paramNames };
    }
    const Y = this.untransformTrainY(name, trainY, sub);
    return { X: trainX.map((row) => row.slice()), Y, paramNames: this.paramNames };
  }

  /**
   * Analytic Leave-One-Out Cross-Validation (Rasmussen & Williams, Eq. 5.12).
   *
   * Returns LOO predictions and observed values in the original data space,
   * with both model-level and adapter-level untransforms applied.
   * No refitting required — computed analytically from the full GP.
   *
   * Supported for SingleTaskGP and ModelListGP. Throws for other model types.
   *
   * @example
   * ```ts
   * const loo = predictor.loocv("accuracy");
   * // loo.observed[i] — actual value for training point i
   * // loo.mean[i] — LOO predicted mean (point i held out)
   * // loo.variance[i] — LOO predicted variance
   * ```
   */
  loocv(outcomeName?: string): LOOCVResult {
    const name = outcomeName ?? this.outcomeNames[0];
    const td = this.getTrainingData(name);

    let looPred: PredictionResult;
    if (this.model instanceof ModelListGP) {
      const idx = this.outcomeNames.indexOf(name);
      if (idx < 0) throw new Error(`Unknown outcome: ${name}`);
      looPred = this.model.loocvPredictions()[idx];
    } else if (this.model instanceof SingleTaskGP) {
      looPred = this.model.loocvPredictions();
    } else {
      throw new Error(
        `loocv() is only supported for SingleTaskGP and ModelListGP, got ${this._state.model_state.model_type}`,
      );
    }

    // Apply adapter untransforms (same as predict())
    looPred = this.applyAdapterUntransform(name, looPred);

    return {
      observed: td.Y,
      mean: Array.from(looPred.mean),
      variance: Array.from(looPred.variance),
    };
  }

  /**
   * Returns null if no lengthscales are found (e.g., constant kernel).
   *
   * @example
   * ```ts
   * const ls = predictor.getLengthscales("loss");
   * // ls = [0.3, 1.2, 0.05] — one per input dimension
   * ```
   */
  getLengthscales(outcomeName?: string): number[] | null {
    const name = outcomeName ?? this.outcomeNames[0];
    const ms = this._state.model_state;
    const sub = getSubModel(ms, this.outcomeNames, name);
    return findLengthscales(sub.kernel ?? (sub as any).data_kernel);
  }

  /**
   * Rank input dimensions by importance (shorter lengthscale = more important).
   * Returns dimensions sorted from most to least important.
   *
   * @example
   * ```ts
   * const dims = predictor.rankDimensionsByImportance("accuracy");
   * // dims[0] = { dimIndex: 2, paramName: "lr", lengthscale: 0.05 }
   * ```
   */
  rankDimensionsByImportance(outcomeName?: string): DimensionImportance[] {
    const ls = this.getLengthscales(outcomeName);
    if (!ls) return [];
    const dims: DimensionImportance[] = ls.map((l, i) => ({
      dimIndex: i,
      paramName: this.paramNames[i] ?? `x${i}`,
      lengthscale: l,
    }));
    dims.sort((a, b) => a.lengthscale - b.lengthscale);
    return dims;
  }

  /**
   * Compute kernel correlation between two points for an outcome.
   * Returns a value in [0, 1] where 1 means identical and 0 means far apart.
   * Uses the RBF/Matern-style `exp(-0.5 * Σ((x_j - ref_j) / (coeff_j * ls_j))²)`.
   * Choice parameters use a penalty of 4.0 for mismatches.
   *
   * @example
   * ```ts
   * const corr = predictor.kernelCorrelation([1, 2, 3], [1, 2, 4], "loss");
   * // corr ≈ 0.87 — high correlation, differ only in dim 2
   * ```
   */
  kernelCorrelation(
    point: number[],
    refPoint: number[],
    outcomeName?: string,
  ): number {
    const name = outcomeName ?? this.outcomeNames[0];
    const ms = this._state.model_state;
    const sub = getSubModel(ms, this.outcomeNames, name);
    const ls = findLengthscales(sub.kernel ?? (sub as any).data_kernel);
    const inputTf = (sub as GPModelState).input_transform;
    const params = this.paramSpecs;

    let d2 = 0;
    for (let j = 0; j < point.length; j++) {
      if (params[j] && params[j].type === "choice") {
        if (point[j] !== refPoint[j]) d2 += 4.0;
        continue;
      }
      const diff = point[j] - refPoint[j];
      const coeff = inputTf?.coefficient?.[j] ?? 1;
      const lsj = ls && j < ls.length ? ls[j] : 1;
      const scaled = diff / coeff / lsj;
      d2 += scaled * scaled;
    }
    return Math.exp(-0.5 * d2);
  }

  /**
   * Untransform raw train_Y to original data space.
   *
   * IMPORTANT: model_state.train_Y is NOT in the original data space.
   * It has been transformed by TWO layers:
   *   1. Adapter transforms (LogY, StandardizeY, etc.) — applied by Ax before BoTorch
   *   2. Model-level outcome transforms (Standardize, Log, etc.) — within BoTorch
   *
   * This method reverses BOTH layers. Any new method that needs original-space
   * Y values MUST use this — never read train_Y directly.
   */
  private untransformTrainY(
    outcomeName: string,
    trainY: number[],
    subModel: { outcome_transform?: OutcomeTransformState; [k: string]: any },
  ): number[] {
    // Layer 2 (innermost): undo model-level outcome transform
    const outTf = (subModel as GPModelState).outcome_transform;
    let Y = unstandardizeY(trainY, outTf);
    // Layer 1 (outermost): undo adapter-level transforms
    const adapterUt = this.adapterUntransforms?.get(outcomeName);
    if (adapterUt) {
      Y = Y.map((y) => adapterUt.untransform(y, 0).mean);
    }
    return Y;
  }

  private applyAdapterUntransform(
    outcomeName: string,
    result: PredictionResult,
  ): PredictionResult {
    if (!this.adapterUntransforms) return result;
    const untransform = this.adapterUntransforms.get(outcomeName);
    if (!untransform) return result;

    const n = result.mean.length;
    const mean = new Float64Array(n);
    const variance = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ut = untransform.untransform(result.mean[i], result.variance[i]);
      mean[i] = ut.mean;
      variance[i] = ut.variance;
    }
    return { mean, variance };
  }
}

/**
 * Build per-outcome adapter untransforms from the adapter_transforms list.
 * Returns null if no adapter transforms are present.
 *
 * Ax may apply multiple adapter transforms per metric (e.g., BilogY then
 * StandardizeY). These are collected per metric and composed into a
 * ChainedOutcomeUntransform that applies them in the correct reverse order.
 */
function buildAdapterUntransforms(
  transforms: AdapterTransform[] | undefined,
  outcomeNames: string[],
): Map<string, OutcomeUntransform> | null {
  if (!transforms || transforms.length === 0) return null;

  // Collect transforms per metric in forward order
  const perMetric = new Map<string, OutcomeUntransform[]>();

  for (const tf of transforms) {
    // Determine which metrics this transform applies to
    const metrics =
      "metrics" in tf && tf.metrics ? tf.metrics : outcomeNames;

    switch (tf.type) {
      case "LogY":
        for (const metric of metrics) {
          if (!perMetric.has(metric)) perMetric.set(metric, []);
          perMetric.get(metric)!.push(new LogUntransform());
        }
        break;
      case "BilogY":
        for (const metric of metrics) {
          if (!perMetric.has(metric)) perMetric.set(metric, []);
          perMetric.get(metric)!.push(new BilogUntransform());
        }
        break;
      case "StandardizeY":
        if (tf.Ymean && tf.Ystd) {
          for (const metric of metrics) {
            if (metric in tf.Ymean && metric in tf.Ystd) {
              if (!perMetric.has(metric)) perMetric.set(metric, []);
              perMetric.get(metric)!.push(
                new StandardizeUntransform(tf.Ymean[metric], tf.Ystd[metric]),
              );
            }
          }
        }
        break;
      case "PowerTransformY":
        if (tf.power_params) {
          for (const metric of metrics) {
            if (metric in tf.power_params) {
              const entry = tf.power_params[metric];
              // Support both old format ({metric: [lambdas]}) and new
              // ({metric: {lambdas, scaler_mean, scaler_scale}})
              const lambdas = Array.isArray(entry) ? entry : entry.lambdas;
              const scalerMean = Array.isArray(entry)
                ? undefined
                : entry.scaler_mean?.[0];
              const scalerScale = Array.isArray(entry)
                ? undefined
                : entry.scaler_scale?.[0];
              if (!perMetric.has(metric)) perMetric.set(metric, []);
              perMetric
                .get(metric)!
                .push(new PowerUntransform(lambdas[0], scalerMean, scalerScale));
            }
          }
        }
        break;
    }
  }

  if (perMetric.size === 0) return null;

  // Build final map: single transform or chained
  const map = new Map<string, OutcomeUntransform>();
  for (const [metric, tfs] of perMetric) {
    if (tfs.length === 1) {
      map.set(metric, tfs[0]);
    } else {
      // ChainedOutcomeUntransform reverses internally for correct undo order
      map.set(metric, new ChainedOutcomeUntransform(tfs));
    }
  }

  return map.size > 0 ? map : null;
}

// ── Predictor helper functions ────────────────────────────────────────────

/** Get the sub-model state for a specific outcome. */
function getSubModel(
  ms: AnyModelState,
  outcomeNames: string[],
  outcomeName: string,
): { train_X?: number[][]; train_Y?: number[]; kernel?: KernelState; [k: string]: any } {
  if (ms.model_type === "ModelListGP") {
    const idx = outcomeNames.indexOf(outcomeName);
    return ms.models[Math.max(0, idx)];
  }
  return ms;
}

/** Recursively find lengthscale array in a kernel tree. */
function findLengthscales(k: KernelState | undefined): number[] | null {
  if (!k) return null;
  if (k.lengthscale) return k.lengthscale;
  if (k.base_kernel) return findLengthscales(k.base_kernel);
  if (k.kernels) {
    for (const sub of k.kernels) {
      const r = findLengthscales(sub);
      if (r) return r;
    }
  }
  return null;
}

/** Un-standardize Y values using the outcome transform mean/std. */
function unstandardizeY(
  trainY: number[],
  outTf: OutcomeTransformState | undefined,
): number[] {
  if (!outTf) return trainY.slice();
  // Only un-standardize if it's a Standardize transform (has mean/std)
  if ("mean" in outTf && outTf.mean !== undefined && "std" in outTf) {
    return trainY.map((y) => outTf.mean + outTf.std * y);
  }
  return trainY.slice();
}

/* global console */
declare const console: { warn(...args: unknown[]): void };

/**
 * Validate model state consistency. Emits console.warn for common errors
 * that silently produce wrong predictions.
 */
function validateModelState(state: AnyModelState, numParams: number): void {
  const models: GPModelState[] = [];
  if (state.model_type === "ModelListGP" && "models" in state) {
    models.push(...state.models);
  } else if (
    state.model_type === "SingleTaskGP" ||
    state.model_type === "FixedNoiseGP"
  ) {
    models.push(state as GPModelState);
  }
  // EnsembleGP, PairwiseGP, MultiTaskGP: skip detailed validation for now

  for (let idx = 0; idx < models.length; idx++) {
    const m = models[idx];
    const prefix =
      models.length > 1 ? `[axjs] model ${idx}: ` : "[axjs] ";

    // Check input_transform dimensions
    if (m.input_transform) {
      const d = m.train_X[0]?.length ?? 0;
      if (m.input_transform.offset.length !== d) {
        console.warn(
          `${prefix}input_transform.offset has ${m.input_transform.offset.length} dims but train_X has ${d} cols`,
        );
      }
    }

    // Check train_Y standardization when Standardize is active
    if (m.outcome_transform && "mean" in m.outcome_transform && m.train_Y.length > 1) {
      const yMean =
        m.train_Y.reduce((a, b) => a + b, 0) / m.train_Y.length;
      if (Math.abs(yMean) > 5) {
        console.warn(
          `${prefix}train_Y mean is ${yMean.toFixed(2)} but outcome_transform is Standardize — train_Y should be pre-standardized (near 0). Did you pass raw Y values?`,
        );
      }
    }

    // Check noise_variance is positive
    if (typeof m.noise_variance === "number" && m.noise_variance <= 0) {
      console.warn(`${prefix}noise_variance is ${m.noise_variance} (should be positive)`);
    }
  }
}
