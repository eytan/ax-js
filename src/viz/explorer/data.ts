// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Pure data layer for the cockpit — no imports from the core library.
 * This keeps the viz IIFE bundle lean (no Predictor/kernel/linalg duplication).
 */

import type {
  ExperimentState,
  Observation,
  OptimizationConfig,
  MetricConfig,
  MetricIntent,
} from "../../models/types.js";
import type { CockpitArm, CockpitCandidate, NiceRange } from "./types.js";
import { normalizeExperimentData } from "../fixture.js";

/**
 * Structural type for the predictor methods used by the cockpit.
 * Avoids importing the Predictor class (which pulls in the entire core library).
 */
export interface CockpitPredictor {
  predict(points: Array<Array<number>>): Record<string, { mean: Float64Array; variance: Float64Array }>;
  kernelCorrelation(point: Array<number>, refPoint: Array<number>, outcomeName?: string): number;
  computeSensitivity?(
    outcomeName?: string,
    options?: { numSamples?: number; seed?: number },
  ): { firstOrder: Array<number>; totalOrder: Array<number>; paramNames: Array<string>; numEvaluations: number };
  readonly outcomeNames: Array<string>;
  readonly paramNames: Array<string>;
  readonly paramBounds: Array<[number, number]>;
  readonly paramSpecs?: Array<{ type: string; values?: Array<unknown> }>;
}

/** Constructor type for Predictor — avoids importing the class directly. */
export type PredictorConstructor = new (state: ExperimentState) => CockpitPredictor;

/** Type for prediction results keyed by outcome name. */
export type PredsByOutcome = Record<string, { mean: Float64Array; variance: Float64Array }>;

// ── Experiment state preparation ────────────────────────────────────────

/**
 * Prepare raw fixture data into a proper ExperimentState with synthesized
 * input_transform on sub-models that lack one.
 *
 * Without input_transform, the analytic Sobol path can't run (it requires
 * normalized [0,1] space for closed-form integrals), falling back to slow
 * Monte Carlo with wrong importance rankings.
 */
export function prepareExperimentState(rawData: unknown): ExperimentState {
  const d = normalizeExperimentData(rawData as Parameters<typeof normalizeExperimentData>[0]);
  const state = d as unknown as ExperimentState;
  const params = state.search_space.parameters;
  const paramBounds: Array<[number, number]> = params.map(
    (p) => (p.bounds ?? [0, 1]) as [number, number],
  );

  // Synthesize Normalize transform: maps [lower, upper] → [0, 1]
  const synthInputTf = {
    offset: paramBounds.map((b) => b[0]),
    coefficient: paramBounds.map((b) => b[1] - b[0]),
  };

  const ms = state.model_state as unknown as Record<string, unknown>;
  if (ms.models) {
    for (const sub of ms.models as Array<Record<string, unknown>>) {
      if (!sub.input_transform) sub.input_transform = synthInputTf;
    }
  } else if (!ms.input_transform) {
    ms.input_transform = synthInputTf;
  }

  return state;
}

// ── Batch color palette ─────────────────────────────────────────────────

const QUALITATIVE_PALETTE = [
  "#e41a1c",
  "#377eb8",
  "#4daf4a",
  "#984ea3",
  "#ff7f00",
  "#a65628",
];

/** Get a consistent color for a batch index. */
export function batchColor(batchIdx: number): string {
  if (batchIdx < QUALITATIVE_PALETTE.length) return QUALITATIVE_PALETTE[batchIdx];
  const hue = (batchIdx * 137.5) % 360;
  return `hsl(${Math.round(hue)}, 55%, 45%)`;
}

// ── Batch inference ─────────────────────────────────────────────────────

/**
 * Infer batch indices from observations when `batch_index` is not provided.
 */
export function inferBatchIndices(observations: Array<Observation>): Array<number> {
  const batchMap = new Map<string, number>();
  let nextBatch = 0;
  return observations.map((obs) => {
    if (obs.batch_index != null) return obs.batch_index;
    const gen = obs.generation_method || "unknown";
    if (!batchMap.has(gen)) batchMap.set(gen, nextBatch++);
    return batchMap.get(gen)!;
  });
}

// ── Data loading ─────────────────────────────────────────────────────────

/** Result of loading and processing experiment data for the cockpit. */
export interface CockpitData {
  arms: Array<CockpitArm>;
  candidates: Array<CockpitCandidate>;
  predictor: CockpitPredictor;
  outcomeNames: Array<string>;
  paramNames: Array<string>;
  paramBounds: Array<[number, number]>;
  sqIdx: number;
  optimizationConfig: OptimizationConfig;
  metricConfigs: Array<MetricConfig>;
  nextCandidateId: number;
}

/**
 * Load experiment data into the cockpit data model.
 *
 * Accepts a Predictor constructor (class) rather than an instance — this
 * allows the cockpit to prepare the ExperimentState (synthesizing
 * input_transform) before constructing the Predictor, ensuring the
 * analytic Sobol path is used for fast, correct importance computation.
 *
 * @param rawData - ExperimentState or FixtureData JSON.
 * @param PredictorClass - Predictor constructor (e.g., `Ax.Predictor`).
 * @param externalMetricConfigs - Optional pre-built MetricConfig array.
 */
export function loadCockpitData(
  rawData: unknown,
  PredictorClass: PredictorConstructor,
  externalMetricConfigs?: Array<MetricConfig>,
): CockpitData {
  const data = normalizeExperimentData(rawData as Parameters<typeof normalizeExperimentData>[0]);
  const experimentState = data as unknown as ExperimentState;
  const predictor = new PredictorClass(experimentState);
  const d = experimentState as unknown as Record<string, unknown>;
  const searchSpace = d.search_space as ExperimentState["search_space"];

  const params = searchSpace.parameters;
  const paramNames = params.map((p) => p.name);
  const paramBounds: Array<[number, number]> = params.map(
    (p) => (p.bounds ?? [0, 1]) as [number, number],
  );
  const nDims = paramNames.length;
  const modelState = d.model_state as ExperimentState["model_state"];

  // Determine outcome names
  let outcomeNames = (d.outcome_names as Array<string>) || [];
  if (outcomeNames.length === 0) {
    const ms = modelState as unknown as Record<string, unknown>;
    if (ms.outcome_names) outcomeNames = ms.outcome_names as Array<string>;
    else if (ms.models)
      outcomeNames = (ms.models as Array<unknown>).map((_, i) => `y${i}`);
    else outcomeNames = ["y"];
  }

  // Resolve optimization config
  let optimizationConfig = d.optimization_config as OptimizationConfig | undefined;
  if (!optimizationConfig) {
    optimizationConfig = {
      objectives: outcomeNames.slice(0, Math.min(2, outcomeNames.length)).map((n) => ({
        name: n,
        minimize: true,
      })),
      outcome_constraints: [],
      objective_thresholds: [],
    };
  }

  // Build metric configs (inline — avoids importing buildMetricConfigs from core)
  const metricConfigs = externalMetricConfigs ?? buildMetricConfigsInline(optimizationConfig, outcomeNames);

  // Build arms from observations or training data
  const arms: Array<CockpitArm> = [];
  const observations = d.observations as Array<Observation> | undefined;

  if (observations && observations.length > 0) {
    const batchIndices = inferBatchIndices(observations);
    observations.forEach((obs, i) => {
      const pt = obs.parameters;
      const ptArray = Array.isArray(pt)
        ? (pt as unknown as Array<number>)
        : paramNames.map((n) => (pt as Record<string, number>)[n] ?? 0);

      const evals: Array<number> = [];
      const vals = obs.metrics ?? {};
      outcomeNames.forEach((name) => {
        const v = vals[name];
        evals.push(v != null ? (typeof v === "object" ? v.mean : (v as number)) : 0);
      });

      arms.push({
        idx: i,
        armName: obs.arm_name || `arm_0_${i}`,
        params: ptArray,
        evals,
        trialIndex: obs.trial_index ?? i,
        batchIndex: batchIndices[i],
        trialStatus: obs.trial_status ?? "COMPLETED",
        generationMethod: obs.generation_method || "unknown",
        preds: null,
        relData: null,
      });
    });
  } else {
    // Synthesize from model_state train_X/train_Y
    const ms = modelState as unknown as Record<string, unknown>;
    let trainX: Array<Array<number>> | undefined;
    if (ms.models) {
      const models = ms.models as Array<Record<string, unknown>>;
      if (models.length > 0) trainX = models[0].train_X as Array<Array<number>>;
    } else {
      trainX = ms.train_X as Array<Array<number>> | undefined;
    }

    if (trainX && trainX.length > 0) {
      trainX.forEach((pt, i) => {
        const evals: Array<number> = [];
        outcomeNames.forEach((_, k) => {
          const models = ms.models as Array<Record<string, unknown>> | undefined;
          const sub = models ? models[k] : ms;
          const rawY = (sub.train_Y as Array<number>)?.[i] ?? 0;
          const ot = sub.outcome_transform as { mean?: number; std?: number } | undefined;
          if (ot && ot.mean !== undefined && ot.std !== undefined) {
            evals.push(ot.mean + ot.std * rawY);
          } else {
            evals.push(rawY);
          }
        });
        arms.push({
          idx: i, armName: `arm_0_${i}`, params: pt.slice(), evals,
          trialIndex: i, batchIndex: 0, trialStatus: "COMPLETED",
          generationMethod: "unknown", preds: null, relData: null,
        });
      });
    }
  }

  // Resolve status quo
  let sqIdx = 0;
  const sqData = d.status_quo as { point?: Array<number> } | undefined;
  if (sqData?.point) {
    const sqPoint = sqData.point;
    let bestMatch = Infinity;
    arms.forEach((arm, i) => {
      let dist = 0;
      for (let j = 0; j < nDims; j++) dist += (arm.params[j] - sqPoint[j]) ** 2;
      if (dist < bestMatch) { bestMatch = dist; sqIdx = i; }
    });
  } else {
    const center = paramBounds.map((b) => (b[0] + b[1]) / 2);
    let bestD = Infinity;
    arms.forEach((arm, i) => {
      let dist = 0;
      for (let j = 0; j < nDims; j++) {
        const rng = paramBounds[j][1] - paramBounds[j][0] || 1;
        dist += ((arm.params[j] - center[j]) / rng) ** 2;
      }
      if (dist < bestD) { bestD = dist; sqIdx = i; }
    });
  }

  // Precompute predictions for arms
  arms.forEach((arm) => {
    arm.preds = predictor.predict([arm.params]);
  });

  // Load candidates from fixture
  const candidates: Array<CockpitCandidate> = [];
  let nextCandidateId = 1;
  const rawCandidates = d.candidates as Array<Record<string, unknown>> | undefined;
  if (rawCandidates && rawCandidates.length > 0) {
    let maxBatch = 0;
    arms.forEach((a) => { if (a.batchIndex > maxBatch) maxBatch = a.batchIndex; });
    rawCandidates.forEach((cand, i) => {
      const pt = cand.parameters as Record<string, number> | Array<number>;
      const ptArray = Array.isArray(pt) ? pt.slice() : paramNames.map((n) => pt[n] ?? 0);
      candidates.push({
        id: nextCandidateId++, idx: i,
        armName: (cand.arm_name as string) || `cand_${i}`,
        params: ptArray, evals: [],
        trialIndex: arms.length + i, batchIndex: maxBatch + 1,
        trialStatus: "CANDIDATE",
        generationMethod: (cand.generation_method as string) || "suggested",
        edited: false, preds: null, relData: null,
      });
    });
  }

  return {
    arms, candidates, predictor, outcomeNames, paramNames, paramBounds,
    sqIdx, optimizationConfig, metricConfigs, nextCandidateId,
  };
}

// ── Relativization (inline — avoids importing from core) ─────────────────

/**
 * Delta-method relativization: % change vs control with uncertainty propagation.
 * Matches Ax's `relativize` function. Inlined to avoid pulling core into viz bundle.
 */
function deltaRelativize(
  mean: number, sem: number, sqMean: number, sqSem: number,
): { mean: number; sem: number } {
  const absC = Math.abs(sqMean);
  if (absC < 1e-10) throw new Error("Control mean ≈ 0");
  const rHat = ((mean - sqMean) / absC - (sqSem * sqSem * mean) / (absC * absC * absC)) * 100;
  const variance = ((sem * sem + ((mean / sqMean) * sqSem) ** 2) / (sqMean * sqMean)) * 10000;
  return { mean: rHat, sem: Math.sqrt(Math.max(0, variance)) };
}

/** Relativize predictions for an item vs the status quo arm. */
export function relativizeItem(
  preds: PredsByOutcome,
  sqPreds: PredsByOutcome,
  outcomeNames: Array<string>,
): Record<string, { mean: number; sem: number } | null> {
  const result: Record<string, { mean: number; sem: number } | null> = {};
  for (const name of outcomeNames) {
    const mean = preds[name]?.mean[0];
    const variance = preds[name]?.variance[0];
    if (mean === undefined || variance === undefined) { result[name] = null; continue; }
    const sem = Math.sqrt(Math.max(0, variance));
    const sqMean = sqPreds[name]?.mean[0];
    const sqVar = sqPreds[name]?.variance[0];
    if (sqMean === undefined || sqVar === undefined) { result[name] = null; continue; }
    const sqSem = Math.sqrt(Math.max(0, sqVar));
    try {
      result[name] = deltaRelativize(mean, sem, sqMean, sqSem);
    } catch {
      result[name] = null;
    }
  }
  return result;
}

/** Compute relativized data for all arms and candidates. */
export function computeAllRelData(
  arms: Array<CockpitArm>,
  candidates: Array<CockpitCandidate>,
  sqIdx: number,
  predictor: CockpitPredictor,
  outcomeNames: Array<string>,
): void {
  const sqPreds = arms[sqIdx]?.preds;
  if (!sqPreds) return;
  arms.forEach((arm) => {
    if (arm.preds) arm.relData = relativizeItem(arm.preds, sqPreds, outcomeNames);
  });
  candidates.forEach((cand) => predictCandidate(cand, predictor, sqPreds, outcomeNames));
}

/** Predict and relativize a single candidate. */
export function predictCandidate(
  cand: CockpitCandidate,
  predictor: CockpitPredictor,
  sqPreds: PredsByOutcome,
  outcomeNames: Array<string>,
): void {
  cand.preds = predictor.predict([cand.params]);
  cand.relData = relativizeItem(cand.preds, sqPreds, outcomeNames);
}

// ── Panel range ──────────────────────────────────────────────────────────

const CI_Z = { c99: 2.576, c95: 1.96, c75: 1.15 };
export { CI_Z };

export function computePanelRange(
  arms: Array<CockpitArm>, candidates: Array<CockpitCandidate>, outcomeNames: Array<string>,
): NiceRange {
  let lo = 0, hi = 0;
  for (const item of [...arms, ...candidates]) {
    const rd = item.relData;
    if (!rd) continue;
    for (const name of outcomeNames) {
      const r = rd[name];
      if (r) {
        const rlo = r.mean - CI_Z.c95 * r.sem;
        const rhi = r.mean + CI_Z.c95 * r.sem;
        if (rlo < lo) lo = rlo;
        if (rhi > hi) hi = rhi;
      }
    }
  }
  return niceRange(lo, hi);
}

export function niceRange(rawLo: number, rawHi: number): NiceRange {
  let span = rawHi - rawLo;
  if (span < 1) span = 1;
  let lo = rawLo - span * 0.05;
  let hi = rawHi + span * 0.05;
  const raw = (hi - lo) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const niceSteps = [1, 2, 5, 10];
  let step = mag;
  for (const n of niceSteps) { if (n * mag >= raw) { step = n * mag; break; } }
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: Array<number> = [];
  for (let t = lo; t <= hi + step * 0.01; t += step) ticks.push(Math.round(t * 100) / 100);
  return { lo, hi, ticks };
}

// ── Metric ordering ──────────────────────────────────────────────────────

export function computeDefaultMetricOrder(
  outcomeNames: Array<string>, metricConfigs: Array<MetricConfig>,
): Array<string> {
  const configMap = new Map<string, MetricIntent>();
  for (const mc of metricConfigs) configMap.set(mc.name, mc.intent);
  const obj: Array<string> = [], con: Array<string> = [], trk: Array<string> = [];
  for (const name of outcomeNames) {
    const intent = configMap.get(name) ?? "tracking";
    if (intent === "objective") obj.push(name);
    else if (intent === "constraint") con.push(name);
    else trk.push(name);
  }
  obj.sort(); con.sort(); trk.sort();
  return [...obj, ...con, ...trk];
}

/** Inline buildMetricConfigs — avoids importing from core. */
function buildMetricConfigsInline(
  optConfig: OptimizationConfig, outcomeNames: Array<string>,
): Array<MetricConfig> {
  const objMap = new Map(optConfig.objectives.map((o) => [o.name, o]));
  const conMap = new Map((optConfig.outcome_constraints ?? []).map((c) => [c.name, c]));
  const thrMap = new Map((optConfig.objective_thresholds ?? []).map((t) => [t.name, t]));

  return outcomeNames.map((name) => {
    const obj = objMap.get(name);
    if (obj) {
      const thr = thrMap.get(name);
      const cfg: MetricConfig = { name, intent: "objective", lower_is_better: obj.minimize };
      if (thr) { cfg.bound = thr.bound; cfg.op = thr.op; cfg.relative = thr.relative; }
      return cfg;
    }
    const con = conMap.get(name);
    if (con) return { name, intent: "constraint" as MetricIntent, bound: con.bound, op: con.op, relative: con.relative };
    return { name, intent: "tracking" as MetricIntent };
  });
}

// ── Desired sign / CI colors ────────────────────────────────────────────

export function outcomeDesiredSign(name: string, metricConfigs: Array<MetricConfig>): number {
  const mc = metricConfigs.find((c) => c.name === name);
  if (!mc) return 0;
  if (mc.intent === "objective") return mc.lower_is_better ? -1 : 1;
  if (mc.intent === "constraint") return mc.op === "LEQ" ? -1 : 1;
  return 0;
}

export interface CIColors { c99: string; c95: string; c75: string; tick: string; isBad: boolean; }

export function ciColors(mean: number, sem: number, desiredSign: number): CIColors {
  const lo75 = mean - CI_Z.c75 * sem;
  const hi75 = mean + CI_Z.c75 * sem;
  const spans0 = lo75 <= 0 && hi75 >= 0;
  const grey: CIColors = { c99: "#e8e8e8", c95: "#d0d0d0", c75: "#b8b8b8", tick: "#666", isBad: false };
  const green: CIColors = { c99: "#e6f5d0", c95: "#b8e186", c75: "#7fbc41", tick: "#4d9221", isBad: false };
  const pink: CIColors = { c99: "#fde0ef", c95: "#de77ae", c75: "#c51b7d", tick: "#8e0152", isBad: true };
  if (desiredSign === 0) { if (spans0) return grey; return mean > 0 ? { ...green, isBad: false } : { ...pink, isBad: false }; }
  if (spans0) return grey;
  return mean * desiredSign > 0 ? green : pink;
}

// ── Star shape helper ────────────────────────────────────────────────────

export function starPoints(cx: number, cy: number, r: number): string {
  const pts: Array<string> = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rad * Math.cos(angle)).toFixed(1)},${(cy + rad * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(" ");
}

// ── Param sign computation (inline — avoids importing computeParamSigns) ─

/**
 * Compute the average sign of ∂μ/∂x_j for each parameter.
 * Simplified inline version that avoids importing Rng from acquisition.
 */
export function computeParamSignsInline(
  predictor: CockpitPredictor,
  outcome: string,
): Array<number> {
  const d = predictor.paramNames.length;
  const bounds = predictor.paramBounds;
  const specs = predictor.paramSpecs;
  const K = 20;
  const signs = new Float64Array(d);

  // Simple seeded PRNG (mulberry32)
  let seed = 0xa15;
  function rand() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const allPts: Array<Array<number>> = [];
  for (let trial = 0; trial < K; trial++) {
    const base = bounds.map(([lo, hi]) => lo + rand() * (hi - lo));
    for (let j = 0; j < d; j++) {
      if (specs && specs[j].type === "choice") { allPts.push(base, base); continue; }
      const [lo, hi] = bounds[j];
      const ptLo = base.slice(); ptLo[j] = lo;
      const ptHi = base.slice(); ptHi[j] = hi;
      allPts.push(ptLo, ptHi);
    }
  }

  const preds = predictor.predict(allPts)[outcome]?.mean;
  if (!preds) return Array.from({ length: d }, () => 1);
  for (let trial = 0; trial < K; trial++) {
    for (let j = 0; j < d; j++) {
      const idx = (trial * d + j) * 2;
      signs[j] += Math.sign(preds[idx + 1] - preds[idx]);
    }
  }
  return Array.from(signs).map((s) => (s >= 0 ? 1 : -1));
}
