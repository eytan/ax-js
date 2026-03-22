// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { AnyModel } from "./io/deserialize.js";
import type {
  ExperimentState,
  SearchSpaceParam,
  PredictionResult,
  AdapterTransform,
  Observation,
  TrainingData,
  LOOCVResult,
  DimensionImportance,
  SensitivityIndices,
  AnyModelState,
  GPModelState,
  MultiTaskGPModelState,
  PairwiseGPModelState,
  EnsembleGPModelState,
  KernelState,
  OutcomeTransformState,
} from "./models/types.js";
import type { EnsembleSubModelInfo } from "./sensitivity_analytic.js";
import type { OutcomeUntransform } from "./transforms/outcome.js";

import { loadModel } from "./io/deserialize.js";
import { EnsembleGP } from "./models/ensemble_gp.js";
import { ModelListGP } from "./models/model_list.js";
import { MultiTaskGP } from "./models/multi_task.js";
import { SingleTaskGP } from "./models/single_task.js";
import { computeSobolIndices } from "./sensitivity.js";
import {
  extractKernelComponents,
  computeAnalyticSobolIndices,
  computeEnsembleAnalyticSobol,
} from "./sensitivity_analytic.js";
import {
  LogUntransform,
  BilogUntransform,
  StandardizeUntransform,
  PowerUntransform,
  ChainedOutcomeUntransform,
} from "./transforms/outcome.js";

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
  /** Ordered metric/outcome names (matches sub-model order for ModelListGP). */
  readonly outcomeNames: Array<string>;
  /** Ordered parameter names from the search space definition. */
  readonly paramNames: Array<string>;
  /** Per-parameter [lower, upper] bounds from the search space. */
  readonly paramBounds: Array<[number, number]>;
  /** Full parameter specifications including type, log_scale, etc. */
  readonly paramSpecs: Array<SearchSpaceParam>;
  /** Status quo baseline point for relativization, or null if not defined. */
  readonly statusQuoPoint: Array<number> | null;
  /** Per-outcome optimization direction inferred from optimization_config. */
  readonly outcomeDirections: Record<string, "min" | "max">;
  /** Per-outcome objective thresholds (reference point for hypervolume). */
  readonly objectiveThresholds: Record<string, { bound: number; op: "LEQ" | "GEQ" }>;
  private readonly model: AnyModel;
  private readonly _state: ExperimentState;
  private readonly adapterUntransforms: Map<string, OutcomeUntransform> | null;
  private readonly sensitivityCache: Map<string, SensitivityIndices> = new Map();

  constructor(exported: ExperimentState) {
    this._state = exported;
    this.model = loadModel(exported.model_state);
    this.paramSpecs = exported.search_space.parameters;
    this.paramNames = exported.search_space.parameters.map((p) => p.name);
    this.paramBounds = exported.search_space.parameters.map((p) => p.bounds || [0, 1]);
    this.statusQuoPoint = exported.status_quo?.point ?? null;
    if (exported.outcome_names) {
      this.outcomeNames = exported.outcome_names;
    } else if (this.model instanceof ModelListGP) {
      this.outcomeNames = this.model.outcomeNames;
    } else {
      this.outcomeNames = ["y"];
    }
    // Extract optimization directions from config
    const dirs: Record<string, "min" | "max"> = {};
    if (exported.optimization_config?.objectives) {
      for (const obj of exported.optimization_config.objectives) {
        dirs[obj.name] = obj.minimize ? "min" : "max";
      }
    }
    this.outcomeDirections = dirs;
    const thresholds: Record<string, { bound: number; op: "LEQ" | "GEQ" }> = {};
    if (exported.optimization_config?.objective_thresholds) {
      for (const t of exported.optimization_config.objective_thresholds) {
        thresholds[t.name] = { bound: t.bound, op: t.op };
      }
    }
    this.objectiveThresholds = thresholds;
    this.adapterUntransforms = buildAdapterUntransforms(
      exported.adapter_transforms,
      this.outcomeNames,
    );
    validateModelState(exported.model_state, this.paramNames.length);
  }

  /** Observed trial data, if included in the ExperimentState. */
  get observations(): Array<Observation> | undefined {
    return this._state.observations;
  }

  /**
   * Predict at one or more points (raw parameter space).
   * Points are positional arrays matching search_space parameter order.
   * The model's input_transform handles normalization internally.
   *
   * @returns Predictions keyed by outcome name.
   *
   * @example
   * ```ts
   * const preds = predictor.predict([[0.5, 1.0, 3.0]]);
   * const { mean, variance } = preds["accuracy"];
   * console.log(`mean=${mean[0]}, std=${Math.sqrt(variance[0])}`);
   * ```
   */
  predict(points: Array<Array<number>>): PredictionsByOutcome {
    if (!Array.isArray(points) || points.length === 0 || !Array.isArray(points[0])) {
      throw new Error(
        "predict() expects number[][] — an array of positional numeric arrays " +
          `matching search_space parameter order (${this.paramNames.join(", ")}). ` +
          "Example: predictor.predict([[0.5, 1.0]])",
      );
    }
    if (this.model instanceof ModelListGP) {
      const results = this.model.predict(points);
      const out: PredictionsByOutcome = {};
      for (let k = 0; k < results.length; k++) {
        out[this.outcomeNames[k]] = this.applyAdapterUntransform(this.outcomeNames[k], results[k]);
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
    const result = this.model.predict(points);
    return {
      [this.outcomeNames[0]]: this.applyAdapterUntransform(this.outcomeNames[0], result),
    };
  }

  /**
   * Get covariances between predictions at each test point and the status quo.
   * Returns a Float64Array of length `points.length`, where element `i` is the
   * posterior covariance between `points[i]` and `statusQuoPoint` for the given
   * outcome. Useful for covariance-aware relativization via `relativizePredictions()`.
   *
   * Returns `undefined` if no status quo is defined or the model does not
   * support `predictCovarianceWith`.
   */
  getCovariances(outcomeName: string, points: Array<Array<number>>): Float64Array | undefined {
    if (!this.statusQuoPoint) {
      return undefined;
    }
    const sqPoint = this.statusQuoPoint;

    if (this.model instanceof ModelListGP) {
      const idx = this.outcomeNames.indexOf(outcomeName);
      if (idx === -1) {
        return undefined;
      }
      const covs = this.model.predictCovarianceWith(points, sqPoint);
      return covs[idx];
    }
    if (this.model instanceof MultiTaskGP) {
      const taskIdx = this.outcomeNames.indexOf(outcomeName);
      if (taskIdx === -1) {
        return undefined;
      }
      return this.model.predictCovarianceWith(points, taskIdx, sqPoint);
    }
    // SingleTaskGP, PairwiseGP, EnsembleGP
    const m = this.model as {
      predictCovarianceWith?: (a: Array<Array<number>>, b: Array<number>) => Float64Array;
    };
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
    // PairwiseGP uses 'utility' instead of 'train_Y'; EnsembleGP has no direct training data
    if (sub.model_type === "EnsembleGP") {
      return { X: [], Y: [], paramNames: this.paramNames };
    }
    const trainX = sub.train_X;
    const trainY = sub.model_type === "PairwiseGP" ? sub.utility : sub.train_Y;
    if (!trainX || !trainY) {
      return { X: [], Y: [], paramNames: this.paramNames };
    }
    const Y = this.untransformTrainY(name, trainY, sub);
    return { X: trainX.map((row: Array<number>) => row.slice()), Y, paramNames: this.paramNames };
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
      if (idx === -1) {
        throw new Error(`Unknown outcome: ${name}`);
      }
      looPred = this.model.loocvPredictions()[idx];
    } else if (this.model instanceof SingleTaskGP) {
      looPred = this.model.loocvPredictions();
    } else {
      throw new TypeError(
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
  getLengthscales(outcomeName?: string): Array<number> | null {
    const name = outcomeName ?? this.outcomeNames[0];
    const ms = this._state.model_state;
    const sub = getSubModel(ms, this.outcomeNames, name);
    // MultiTaskGP stores kernel in data_kernel field instead of kernel
    const kernel =
      "kernel" in sub && sub.kernel ? sub.kernel : (sub as MultiTaskGPModelState).data_kernel;
    return findLengthscales(kernel);
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
  rankDimensionsByImportance(outcomeName?: string): Array<DimensionImportance> {
    const ls = this.getLengthscales(outcomeName);
    if (!ls) {
      return [];
    }
    const dims: Array<DimensionImportance> = ls.map((l, i) => ({
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
  kernelCorrelation(point: Array<number>, refPoint: Array<number>, outcomeName?: string): number {
    const name = outcomeName ?? this.outcomeNames[0];
    const ms = this._state.model_state;
    const sub = getSubModel(ms, this.outcomeNames, name);
    // MultiTaskGP stores kernel in data_kernel field instead of kernel
    const kernel =
      "kernel" in sub && sub.kernel ? sub.kernel : (sub as MultiTaskGPModelState).data_kernel;
    const ls = findLengthscales(kernel);
    const inputTf = "input_transform" in sub ? sub.input_transform : undefined;
    const warp = "input_warp" in sub ? sub.input_warp : undefined;
    const warpIndicesSet = warp?.indices ? new Set(warp.indices) : null;
    const params = this.paramSpecs;
    const eps = 1e-7;
    const warpRange = 1 - 2 * eps;

    let d2 = 0;
    for (let j = 0; j < point.length; j++) {
      if (params[j] && params[j].type === "choice") {
        if (point[j] !== refPoint[j]) {
          d2 += 4;
        }
        continue;
      }
      const offset = inputTf?.offset?.[j] ?? 0;
      const coeff = inputTf?.coefficient?.[j] ?? 1;
      let v1 = (point[j] - offset) / coeff;
      let v2 = (refPoint[j] - offset) / coeff;
      // Apply Kumaraswamy warp if present for this dimension
      if (warp && (warpIndicesSet === null || warpIndicesSet.has(j))) {
        const wIdx = warp.indices ? warp.indices.indexOf(j) : j;
        if (wIdx >= 0 && wIdx < warp.concentration0.length) {
          const a = warp.concentration1[wIdx];
          const b = warp.concentration0[wIdx];
          const xn1 = Math.max(eps, Math.min(1 - eps, v1 * warpRange + eps));
          const xn2 = Math.max(eps, Math.min(1 - eps, v2 * warpRange + eps));
          v1 = 1 - Math.pow(1 - Math.pow(xn1, a), b);
          v2 = 1 - Math.pow(1 - Math.pow(xn2, a), b);
        }
      }
      const lsj = ls && j < ls.length ? ls[j] : 1;
      const scaled = (v1 - v2) / lsj;
      d2 += scaled * scaled;
    }
    return Math.exp(-0.5 * d2);
  }

  /**
   * Compute Sobol' sensitivity indices for variance decomposition.
   *
   * Tries analytic computation first (exact, O(d×n²), no MC noise) when
   * the kernel is decomposable (RBF, Matérn, Product(RBF|Matérn, Categorical),
   * or Additive with disjoint active_dims). Falls back to Saltelli's MC
   * estimator for PairwiseGP or models with nonlinear outcome/adapter
   * transforms.
   *
   * @param outcomeName - Which outcome to analyze (default: first)
   * @param options - numSamples (default 512) and seed (default 42) for MC fallback
   * @returns First-order and total-order indices per dimension
   */
  computeSensitivity(
    outcomeName?: string,
    options?: { numSamples?: number; seed?: number },
  ): SensitivityIndices {
    const name = outcomeName ?? this.outcomeNames[0];
    const numSamples = options?.numSamples ?? 512;
    const seed = options?.seed ?? 42;
    const cacheKey = `${name}:${numSamples}:${seed}`;

    const cached = this.sensitivityCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Try analytic computation (exact, no MC noise)
    const analyticResult = this.tryAnalyticSobol(name);
    if (analyticResult) {
      // Cache under the default MC key so repeated calls are fast
      this.sensitivityCache.set(cacheKey, analyticResult);
      return analyticResult;
    }

    // Fall back to MC (Saltelli's estimator) — much slower than analytic
    console.warn(
      `[ax-js] computeSensitivity("${name}"): analytic Sobol unavailable, falling back to Monte Carlo. ` +
      `This is ~10x slower. Ensure model has input_transform for analytic path.`,
    );
    const predictFn = (points: Array<Array<number>>): Float64Array => {
      const preds = this.predict(points);
      return preds[name].mean;
    };

    const result = computeSobolIndices(predictFn, this.paramSpecs, {
      numSamples,
      seed,
    });
    this.sensitivityCache.set(cacheKey, result);
    return result;
  }

  /**
   * Attempt analytic Sobol' computation. Returns null if not supported,
   * causing the caller to fall back to MC.
   */
  private tryAnalyticSobol(outcomeName: string): SensitivityIndices | null {
    const ms = this._state.model_state;

    // PairwiseGP: Laplace posterior, not standard GP form
    if (ms.model_type === "PairwiseGP") {
      return null;
    }

    // Check for nonlinear adapter transforms that would change Sobol indices
    if (this.hasNonlinearAdapterTransforms(outcomeName)) {
      return null;
    }

    if (ms.model_type === "EnsembleGP") {
      return this.tryAnalyticSobolEnsemble(ms);
    }

    if (ms.model_type === "MultiTaskGP") {
      return this.tryAnalyticSobolMultiTask(outcomeName, ms);
    }

    // SingleTaskGP, FixedNoiseGP, or ModelListGP → get the relevant sub-model
    const sub = getSubModel(ms, this.outcomeNames, outcomeName) as GPModelState;
    return this.tryAnalyticSobolSingle(sub, outcomeName);
  }

  private tryAnalyticSobolSingle(
    sub: GPModelState,
    outcomeName: string,
  ): SensitivityIndices | null {
    // Check for nonlinear model-level outcome transforms
    if (hasNonlinearOutcomeTransform(sub.outcome_transform)) {
      return null;
    }

    // When input_transform exists, train_X is normalized to [0,1] and integrals
    // use [0,1] bounds. When absent, train_X is in raw space and we integrate
    // over the actual parameter bounds.
    const bounds: Array<[number, number]> | undefined = sub.input_transform
      ? undefined // [0,1] default
      : this.paramBounds;

    const components = extractKernelComponents(sub.kernel, this.paramSpecs, sub.input_warp, bounds);
    if (!components) {
      return null;
    }

    // Get model internals (alpha, trainXNorm — raw train_X when no input_transform)
    let internals;
    if (this.model instanceof ModelListGP) {
      const idx = this.outcomeNames.indexOf(outcomeName);
      if (idx === -1) {
        return null;
      }
      internals = this.model.getInternals(idx);
    } else if (this.model instanceof SingleTaskGP) {
      internals = this.model.getInternals();
    } else {
      return null;
    }

    return computeAnalyticSobolIndices(
      internals.alpha,
      internals.trainXNorm,
      components,
      internals.meanConstant,
      this.paramNames,
    );
  }

  private tryAnalyticSobolMultiTask(
    outcomeName: string,
    ms: MultiTaskGPModelState,
  ): SensitivityIndices | null {
    if (hasNonlinearOutcomeTransform(ms.outcome_transform)) {
      return null;
    }

    const bounds: Array<[number, number]> | undefined = ms.input_transform
      ? undefined
      : this.paramBounds;

    const components = extractKernelComponents(ms.data_kernel, this.paramSpecs, ms.input_warp, bounds);
    if (!components) {
      return null;
    }

    if (!(this.model instanceof MultiTaskGP)) {
      return null;
    }
    const taskIdx = this.outcomeNames.indexOf(outcomeName);
    if (taskIdx === -1) {
      return null;
    }

    const internals = this.model.getInternals(taskIdx);

    return computeAnalyticSobolIndices(
      internals.alpha,
      internals.trainXNorm,
      components,
      internals.meanConstant,
      this.paramNames,
    );
  }

  private tryAnalyticSobolEnsemble(ms: EnsembleGPModelState): SensitivityIndices | null {
    if (!(this.model instanceof EnsembleGP)) {
      return null;
    }

    // All sub-models must have RBF or Matérn kernels and linear transforms
    const subModels: Array<EnsembleSubModelInfo> = [];
    for (let mi = 0; mi < ms.models.length; mi++) {
      const sub = ms.models[mi];
      if (hasNonlinearOutcomeTransform(sub.outcome_transform)) {
        return null;
      }

      // Extract lengthscales and outputscale from kernel
      const ls = findLengthscales(sub.kernel);
      if (!ls) {
        return null;
      }
      const kernelInfo = extractKernelOutputscale(sub.kernel);
      if (!kernelInfo || (kernelInfo.baseType !== "RBF" && kernelInfo.baseType !== "Matern")) {
        return null;
      }

      // Extract nu for Matérn kernels
      const nu = findMaternNu(sub.kernel);

      const internals = this.model.getInternals(mi);

      subModels.push({
        alpha: internals.alpha,
        trainXNorm: internals.trainXNorm,
        meanConstant: internals.meanConstant,
        lengthscales: ls,
        outputscale: kernelInfo.outputscale,
        warpParams: sub.input_warp,
        kernelType: kernelInfo.baseType,
        nu: nu as 0.5 | 1.5 | 2.5 | undefined,
      });
    }

    return computeEnsembleAnalyticSobol(subModels, this.paramNames);
  }

  /** Check if there are nonlinear adapter transforms for this outcome. */
  private hasNonlinearAdapterTransforms(outcomeName: string): boolean {
    const transforms = this._state.adapter_transforms;
    if (!transforms) {
      return false;
    }
    for (const tf of transforms) {
      if (tf.type === "StandardizeY") {
        continue;
      } // linear → OK
      // LogY, BilogY, PowerTransformY are nonlinear
      const metrics = "metrics" in tf && tf.metrics ? tf.metrics : this.outcomeNames;
      if (metrics.includes(outcomeName)) {
        return true;
      }
    }
    return false;
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
    trainY: Array<number>,
    subModel: SubModelState,
  ): Array<number> {
    // Layer 2 (innermost): undo model-level outcome transform
    const outTf = "outcome_transform" in subModel ? subModel.outcome_transform : undefined;
    let Y = unstandardizeY(trainY, outTf);
    // Layer 1 (outermost): undo adapter-level transforms
    const adapterUt = this.adapterUntransforms?.get(outcomeName);
    if (adapterUt) {
      Y = Y.map((y) => adapterUt.untransform(y, 0).mean);
    }
    return Y;
  }

  private applyAdapterUntransform(outcomeName: string, result: PredictionResult): PredictionResult {
    if (!this.adapterUntransforms) {
      return result;
    }
    const untransform = this.adapterUntransforms.get(outcomeName);
    if (!untransform) {
      return result;
    }

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
  transforms: Array<AdapterTransform> | undefined,
  outcomeNames: Array<string>,
): Map<string, OutcomeUntransform> | null {
  if (!transforms || transforms.length === 0) {
    return null;
  }

  // Collect transforms per metric in forward order
  const perMetric = new Map<string, Array<OutcomeUntransform>>();

  for (const tf of transforms) {
    // Determine which metrics this transform applies to
    const metrics = "metrics" in tf && tf.metrics ? tf.metrics : outcomeNames;

    switch (tf.type) {
      case "LogY": {
        for (const metric of metrics) {
          if (!perMetric.has(metric)) {
            perMetric.set(metric, []);
          }
          perMetric.get(metric)!.push(new LogUntransform());
        }
        break;
      }
      case "BilogY": {
        for (const metric of metrics) {
          if (!perMetric.has(metric)) {
            perMetric.set(metric, []);
          }
          perMetric.get(metric)!.push(new BilogUntransform());
        }
        break;
      }
      case "StandardizeY": {
        if (tf.Ymean && tf.Ystd) {
          for (const metric of metrics) {
            if (metric in tf.Ymean && metric in tf.Ystd) {
              if (!perMetric.has(metric)) {
                perMetric.set(metric, []);
              }
              perMetric
                .get(metric)!
                .push(new StandardizeUntransform(tf.Ymean[metric], tf.Ystd[metric]));
            }
          }
        }
        break;
      }
      case "PowerTransformY": {
        if (tf.power_params) {
          for (const metric of metrics) {
            if (metric in tf.power_params) {
              const entry = tf.power_params[metric];
              // Support both old format ({metric: [lambdas]}) and new
              // ({metric: {lambdas, scaler_mean, scaler_scale}})
              const lambdas = Array.isArray(entry) ? entry : entry.lambdas;
              const scalerMean = Array.isArray(entry) ? undefined : entry.scaler_mean?.[0];
              const scalerScale = Array.isArray(entry) ? undefined : entry.scaler_scale?.[0];
              if (!perMetric.has(metric)) {
                perMetric.set(metric, []);
              }
              perMetric
                .get(metric)!
                .push(new PowerUntransform(lambdas[0], scalerMean, scalerScale));
            }
          }
        }
        break;
      }
    }
  }

  if (perMetric.size === 0) {
    return null;
  }

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

/** Result type for getSubModel: covers GPModelState, MultiTaskGPModelState, PairwiseGPModelState, and EnsembleGPModelState. */
type SubModelState =
  | GPModelState
  | MultiTaskGPModelState
  | PairwiseGPModelState
  | EnsembleGPModelState;

/** Get the sub-model state for a specific outcome. */
function getSubModel(
  ms: AnyModelState,
  outcomeNames: Array<string>,
  outcomeName: string,
): SubModelState {
  if (ms.model_type === "ModelListGP") {
    const idx = outcomeNames.indexOf(outcomeName);
    if (idx === -1) {
      throw new Error(`Unknown outcome "${outcomeName}". Available: ${outcomeNames.join(", ")}`);
    }
    return ms.models[idx];
  }
  return ms;
}

/** Recursively find lengthscale array in a kernel tree. */
function findLengthscales(k: KernelState | undefined): Array<number> | null {
  if (!k) {
    return null;
  }
  if (k.lengthscale) {
    return k.lengthscale;
  }
  if (k.base_kernel) {
    return findLengthscales(k.base_kernel);
  }
  if (k.kernels) {
    for (const sub of k.kernels) {
      const r = findLengthscales(sub);
      if (r) {
        return r;
      }
    }
  }
  return null;
}

/** Recursively find Matérn nu parameter in a kernel tree. */
function findMaternNu(k: KernelState | undefined): number | undefined {
  if (!k) {
    return undefined;
  }
  if (k.type === "Matern" && k.nu !== undefined) {
    return k.nu;
  }
  if (k.base_kernel) {
    return findMaternNu(k.base_kernel);
  }
  if (k.kernels) {
    for (const sub of k.kernels) {
      const r = findMaternNu(sub);
      if (r !== undefined) {
        return r;
      }
    }
  }
  return undefined;
}

/** Check if an outcome transform is nonlinear (Log, Bilog, Power). */
function hasNonlinearOutcomeTransform(tf: OutcomeTransformState | undefined): boolean {
  if (!tf) {
    return false;
  }
  if ("type" in tf) {
    if (tf.type === "Log" || tf.type === "Bilog" || tf.type === "Power") {
      return true;
    }
    if (tf.type === "Chained") {
      return tf.transforms.some(hasNonlinearOutcomeTransform);
    }
  }
  // Standardize (has mean/std but type is optional) → linear
  return false;
}

/** Extract outputscale and base kernel type from a kernel state. */
function extractKernelOutputscale(
  k: KernelState,
): { outputscale: number; baseType: string } | null {
  if (k.type === "Scale" && k.base_kernel) {
    return { outputscale: k.outputscale ?? 1, baseType: k.base_kernel.type };
  }
  // Legacy format: outputscale on the kernel itself
  return { outputscale: k.outputscale ?? 1, baseType: k.type };
}

/** Un-standardize Y values using the outcome transform mean/std. */
function unstandardizeY(
  trainY: Array<number>,
  outTf: OutcomeTransformState | undefined,
): Array<number> {
  if (!outTf) {
    return trainY.slice();
  }
  // Only un-standardize if it's a Standardize transform (has mean/std)
  if ("mean" in outTf && outTf.mean !== undefined && "std" in outTf) {
    return trainY.map((y) => outTf.mean + outTf.std * y);
  }
  return trainY.slice();
}

/**
 * Validate model state consistency. Emits console.warn for common errors
 * that silently produce wrong predictions.
 */
function validateModelState(state: AnyModelState, _numParams: number): void {
  const models: Array<GPModelState> = [];
  if (state.model_type === "ModelListGP" && "models" in state) {
    models.push(...state.models);
  } else if (state.model_type === "SingleTaskGP" || state.model_type === "FixedNoiseGP") {
    models.push(state);
  }
  // EnsembleGP, PairwiseGP, MultiTaskGP: skip detailed validation for now

  for (let idx = 0; idx < models.length; idx++) {
    const m = models[idx];
    const prefix = models.length > 1 ? `[ax-js] model ${idx}: ` : "[ax-js] ";

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
      const yMean = m.train_Y.reduce((a, b) => a + b, 0) / m.train_Y.length;
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
