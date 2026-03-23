// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { MetricConfig, OptimizationConfig } from "../../models/types.js";

/** A completed trial arm with observed values and GP predictions. */
export interface CockpitArm {
  idx: number;
  armName: string;
  params: Array<number>;
  /** Observed values per outcome. */
  evals: Array<number>;
  trialIndex: number;
  batchIndex: number;
  trialStatus: string;
  generationMethod: string;
  /** GP predictions at this arm's parameters. */
  preds: Record<string, { mean: Float64Array; variance: Float64Array }> | null;
  /** Relativized predictions (% vs control). Keyed by outcome name. */
  relData: Record<string, { mean: number; sem: number } | null> | null;
}

/** An unevaluated candidate arm with predicted values. */
export interface CockpitCandidate extends CockpitArm {
  id: number;
  edited: boolean;
}

/** Selection state: which arm or candidate is currently focused. */
export interface CockpitSelection {
  type: "arm" | "candidate";
  idx: number;
}

/** Options for rendering the cockpit. */
export interface CockpitOptions {
  width?: number;
  height?: number;
  optimizationConfig?: OptimizationConfig;
  metricConfigs?: Array<MetricConfig>;
  defaultXOutcome?: string;
  defaultYOutcome?: string;
}

/** Controller returned by renderCockpit for programmatic interaction. */
export interface CockpitController {
  loadData(rawData: unknown, PredictorClass: new (state: import("../../models/types.js").ExperimentState) => unknown, options?: CockpitOptions): void;
  selectArm(idx: number): void;
  selectCandidate(idx: number): void;
  destroy(): void;
}

/** Nice range with tick values for axis display. */
export interface NiceRange {
  lo: number;
  hi: number;
  ticks: Array<number>;
}
