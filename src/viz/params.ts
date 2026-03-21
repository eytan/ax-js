// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { ParamSpec, DimensionRanker, RenderPredictor } from "./types";
import type { ExperimentState, FixtureData } from "../models/types.js";

import { Rng } from "../acquisition/sample_mvn.js";

/** Returns true if the parameter is a choice parameter. */
export function isChoice(p: ParamSpec): boolean {
  return p.type === "choice";
}

/** Returns true if the parameter is an integer range parameter. */
export function isInteger(p: ParamSpec): boolean {
  return p.type === "range" && p.parameter_type === "int";
}

/** Returns a sensible default value for a parameter (midpoint or first choice). */
export function defaultParamValue(p: ParamSpec): number | string | boolean {
  if (isChoice(p)) {
    return p.values![0];
  }
  if (isInteger(p)) {
    return Math.round((p.bounds![0] + p.bounds![1]) / 2);
  }
  return (p.bounds![0] + p.bounds![1]) / 2;
}

/** Format a parameter value for display. */
export function formatParamValue(val: number | string | boolean, p: ParamSpec): string {
  if (isChoice(p)) {
    return String(val);
  }
  if (isInteger(p)) {
    return String(Math.round(val as number));
  }
  return (val as number).toFixed(3);
}

/** Normalized fixture format for visualization (flattened from FixtureData). */
interface NormalizedFixture {
  search_space: ExperimentState["search_space"];
  model_state: ExperimentState["model_state"];
  metadata: {
    name: string;
    description: string;
    [key: string]: unknown;
  };
  test_points: Array<Array<number>>;
  outcome_names?: Array<string>;
  optimization_config?: ExperimentState["optimization_config"];
  status_quo?: ExperimentState["status_quo"];
  adapter_transforms?: ExperimentState["adapter_transforms"];
  observations?: ExperimentState["observations"];
  candidates?: ExperimentState["candidates"];
}

/**
 * Normalize a fixture or ExperimentState into a flat shape for visualization.
 *
 * Handles both the `{experiment, test}` fixture format and plain
 * ExperimentState objects, extracting search_space, model_state,
 * metadata, and optional fields into a consistent shape.
 */
export function normalizeFixture(
  data: FixtureData | ExperimentState,
): NormalizedFixture | ExperimentState {
  // Type guard: if it has an 'experiment' field, it's a FixtureData
  if ("experiment" in data && data.experiment) {
    const fixtureData = data;
    const result: NormalizedFixture = {
      search_space: fixtureData.experiment.search_space,
      model_state: fixtureData.experiment.model_state,
      metadata: {
        name: fixtureData.experiment.name || "",
        description: fixtureData.experiment.description || "",
        ...fixtureData.test?.metadata,
      },
      test_points: fixtureData.test?.test_points || [],
    };
    if (fixtureData.experiment.outcome_names) {
      result.outcome_names = fixtureData.experiment.outcome_names;
    }
    if (fixtureData.experiment.optimization_config) {
      result.optimization_config = fixtureData.experiment.optimization_config;
    }
    if (fixtureData.experiment.status_quo) {
      result.status_quo = fixtureData.experiment.status_quo;
    }
    if (fixtureData.experiment.adapter_transforms) {
      result.adapter_transforms = fixtureData.experiment.adapter_transforms;
    }
    if (fixtureData.experiment.observations) {
      result.observations = fixtureData.experiment.observations;
    }
    if (fixtureData.experiment.candidates) {
      result.candidates = fixtureData.experiment.candidates;
    }
    return result;
  }
  // Already an ExperimentState
  return data as ExperimentState;
}

/**
 * Compute dimension display order, sorted by importance.
 * When `useSobol` is true and the predictor supports it, sorts by first-order
 * Sobol' index descending (direct variance explained). Otherwise falls back
 * to shortest lengthscale first.
 */
export function computeDimOrder(
  predictor: DimensionRanker,
  nDim: number,
  selectedOutcome?: string,
  useSobol?: boolean,
): Array<number> {
  if (useSobol && predictor.computeSensitivity) {
    const sens = predictor.computeSensitivity(selectedOutcome);
    if (sens && sens.totalOrder.length > 0) {
      const dims = sens.firstOrder.map((s, i) => ({ idx: i, s, st: sens.totalOrder[i] }));
      dims.sort((a, b) => {
        const df = b.s - a.s;
        return Math.abs(df) > 0.005 ? df : b.st - a.st;
      });
      const order = dims.map((d) => d.idx);
      if (order.length < nDim) {
        const inOrder = new Set(order);
        for (let i = 0; i < nDim; i++) {
          if (!inOrder.has(i)) {
            order.push(i);
          }
        }
      }
      return order;
    }
  }
  const ranked = predictor.rankDimensionsByImportance(selectedOutcome);
  if (!ranked || ranked.length === 0) {
    return Array.from({ length: nDim }, (_, i) => i);
  }
  const order = ranked.map((d) => d.dimIndex);
  if (order.length < nDim) {
    const inRanked = new Set(order);
    for (let i = 0; i < nDim; i++) {
      if (!inRanked.has(i)) {
        order.push(i);
      }
    }
  }
  return order;
}

/**
 * Compute kernel-distance relevance between a training point and a reference.
 *
 * Returns `exp(-0.5 * d²)` where d² is the scaled squared distance across
 * non-plotted dimensions (dimensions in `plottedDims` are skipped).
 * Accounts for input warp (Kumaraswamy CDF) when present.
 */
export function pointRelevance(
  pt: Array<number>,
  fixedValues: Array<number>,
  plottedDims: Array<number>,
  ls: Array<number> | null,
  inputTf: { offset?: Array<number>; coefficient?: Array<number> } | null,
  params?: Array<ParamSpec>,
  inputWarp?: {
    concentration0: Array<number>;
    concentration1: Array<number>;
    indices?: Array<number>;
  } | null,
): number {
  const warpIndicesSet = inputWarp?.indices ? new Set(inputWarp.indices) : null;
  const eps = 1e-7;
  const warpRange = 1 - 2 * eps;
  let d2 = 0;
  for (let j = 0; j < fixedValues.length; j++) {
    if (plottedDims.includes(j)) {
      continue;
    }
    if (params && params[j] && isChoice(params[j])) {
      if (pt[j] !== fixedValues[j]) {
        d2 += 4;
      }
      continue;
    }
    const offset = inputTf?.offset?.[j] ?? 0;
    const coeff = inputTf?.coefficient?.[j] ?? 1;
    let v1 = (pt[j] - offset) / coeff;
    let v2 = (fixedValues[j] - offset) / coeff;
    if (inputWarp && (warpIndicesSet === null || warpIndicesSet.has(j))) {
      const wIdx = inputWarp.indices ? inputWarp.indices.indexOf(j) : j;
      if (wIdx >= 0 && wIdx < inputWarp.concentration0.length) {
        const a = inputWarp.concentration1[wIdx];
        const b = inputWarp.concentration0[wIdx];
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
 * Compute the average sign of ∂μ/∂x_j for each parameter.
 * Positive (+1) = increasing the param increases the prediction.
 * Negative (-1) = increasing the param decreases the prediction.
 *
 * Uses finite differences at deterministically seeded random base points.
 * Choice params are skipped (default to +1).
 */
export function computeParamSigns(
  predictor: Pick<RenderPredictor, "predict" | "paramBounds" | "paramSpecs" | "paramNames">,
  outcome: string,
): Array<number> {
  const d = predictor.paramNames.length;
  const bounds = predictor.paramBounds;
  const specs = predictor.paramSpecs;
  const K = 20;
  const rng = new Rng(0xa_15);
  const signs = new Float64Array(d);

  const allPts: Array<Array<number>> = [];
  for (let trial = 0; trial < K; trial++) {
    const base = bounds.map(([lo, hi]) => lo + rng.uniform() * (hi - lo));
    for (let j = 0; j < d; j++) {
      if (specs && specs[j].type === "choice") {
        allPts.push(base, base);
        continue;
      }
      const [lo, hi] = bounds[j];
      const ptLo = base.slice();
      ptLo[j] = lo;
      const ptHi = base.slice();
      ptHi[j] = hi;
      allPts.push(ptLo, ptHi);
    }
  }

  const preds = predictor.predict(allPts)[outcome].mean;
  for (let trial = 0; trial < K; trial++) {
    for (let j = 0; j < d; j++) {
      const idx = (trial * d + j) * 2;
      signs[j] += Math.sign(preds[idx + 1] - preds[idx]);
    }
  }

  return Array.from(signs).map((s) => (s >= 0 ? 1 : -1));
}
