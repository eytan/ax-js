// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/** RGB triplet in 0-255 range. */
export type RGB = [number, number, number];

/** Minimal parameter shape accepted by search-space helpers. */
export interface ParamSpec {
  type: "range" | "choice";
  bounds?: [number, number];
  values?: Array<string | number | boolean>;
  parameter_type?: "int" | "float";
}

/** Structural type for the predictor methods used by render functions. */
export interface RenderPredictor {
  readonly outcomeNames: Array<string>;
  readonly paramNames: Array<string>;
  readonly paramBounds: Array<[number, number]>;
  /** Full parameter specs (type, values, parameter_type). Optional for backward compat. */
  readonly paramSpecs?: Array<ParamSpec>;
  /** Status quo baseline point for relative mode. */
  readonly statusQuoPoint?: Array<number> | null;
  /** Per-outcome optimization direction from optimization_config. */
  readonly outcomeDirections?: Record<string, "min" | "max">;
  /** Per-outcome objective thresholds (reference point for hypervolume). */
  readonly objectiveThresholds?: Record<string, { bound: number; op: "LEQ" | "GEQ" }>;
  predict(
    points: Array<Array<number>>,
  ): Record<string, { mean: Float64Array; variance: Float64Array }>;
  getTrainingData(outcomeName?: string): {
    X: Array<Array<number>>;
    Y: Array<number>;
    paramNames: Array<string>;
  };
  loocv(outcomeName?: string): {
    observed: Array<number>;
    mean: Array<number>;
    variance: Array<number>;
  };
  rankDimensionsByImportance(
    outcomeName?: string,
  ): Array<{ dimIndex: number; paramName: string; lengthscale: number }>;
  kernelCorrelation(point: Array<number>, refPoint: Array<number>, outcomeName?: string): number;
  computeSensitivity?(
    outcomeName?: string,
    options?: { numSamples?: number; seed?: number },
  ): {
    firstOrder: Array<number>;
    totalOrder: Array<number>;
    paramNames: Array<string>;
    numEvaluations: number;
  };
}

/** Info tracked for each visible training dot in an SVG plot. */
export interface DotInfo {
  cx: number;
  cy: number;
  idx: number;
  pt: Array<number>;
  el: SVGCircleElement;
  /** Associated whisker/CI line elements that fade with NN highlighting. */
  whiskers?: Array<SVGLineElement>;
  /** Default fill when not highlighted. */
  defaultFill: string;
  /** Default stroke when not highlighted. */
  defaultStroke: string;
  /** Default radius. */
  defaultR: number;
}

/** Options for renderFeatureImportance. */
export interface FeatureImportanceOptions {
  outcome?: string;
  interactive?: boolean;
  backgroundColor?: string;
  /** Importance mode. Default: "lengthscale". */
  mode?: "lengthscale" | "sobol";
  /** Number of Saltelli samples for Sobol' mode. Default: 512. */
  sobolSamples?: number;
}

/** Options for renderCrossValidation. */
export interface CrossValidationOptions {
  outcome?: string;
  width?: number;
  height?: number;
  interactive?: boolean;
  backgroundColor?: string;
}

/** Options for renderOptimizationTrace. */
export interface OptimizationTraceOptions {
  outcome?: string;
  minimize?: boolean;
  width?: number;
  height?: number;
  interactive?: boolean;
  backgroundColor?: string;
}

/** Options for renderSlicePlot. */
export interface SlicePlotOptions {
  outcome?: string;
  fixedValues?: Array<number>;
  numPoints?: number;
  width?: number;
  height?: number;
  interactive?: boolean;
  backgroundColor?: string;
  /** Show predictions as % change vs status quo. Default: false. */
  relative?: boolean;
  /** Override the status quo reference point. Falls back to predictor.statusQuoPoint. */
  statusQuoPoint?: Array<number>;
  /** "grid" shows all dims as small multiples (default). "single" shows one dim with a selector. */
  layout?: "grid" | "single";
}

/** Options for renderResponseSurface. */
export interface ResponseSurfaceOptions {
  outcome?: string;
  dimX?: number;
  dimY?: number;
  fixedValues?: Array<number>;
  gridSize?: number;
  width?: number;
  height?: number;
  interactive?: boolean;
  backgroundColor?: string;
  /** Show predictions as % change vs status quo. Default: false. */
  relative?: boolean;
  /** Override the status quo reference point. Falls back to predictor.statusQuoPoint. */
  statusQuoPoint?: Array<number>;
}

/** Options for renderScatter. */
export interface ScatterPlotOptions {
  xAxis?: string;
  yAxis?: string;
  width?: number;
  height?: number;
  interactive?: boolean;
  diagonalLine?: boolean;
}

/** Options for renderParetoPlot. */
export interface ParetoPlotOptions {
  xOutcome?: string;
  yOutcome?: string;
  /** Override directions (defaults to predictor.outcomeDirections). */
  directions?: Record<string, "min" | "max">;
  interactive?: boolean;
  width?: number;
  height?: number;
}

/** Options for renderObservedPredicted. */
export interface ObservedPredictedOptions {
  outcome?: string;
  interactive?: boolean;
  width?: number;
  height?: number;
}

/** Options for renderEffectsPlot. */
export interface EffectsPlotOptions {
  outcome?: string;
  interactive?: boolean;
  width?: number;
  height?: number;
  /** Sort order for trials. Default: "trial". */
  sort?: "trial" | "predicted" | "observed";
  /** Show as % change vs status quo. Default: false. */
  relative?: boolean;
  /** Override the status quo reference point. Falls back to predictor.statusQuoPoint. */
  statusQuoPoint?: Array<number>;
}

/** Minimal predictor shape for dimension ranking. */
export interface DimensionRanker {
  rankDimensionsByImportance(outcome?: string): Array<{ dimIndex: number }> | null;
  computeSensitivity?(outcomeName?: string): {
    firstOrder: Array<number>;
    totalOrder: Array<number>;
    paramNames: Array<string>;
  };
}

/** Minimal predictor shape accepted by embedding helpers. */
export interface EmbeddingPredictor {
  readonly outcomeNames: Array<string>;
  readonly paramNames: Array<string>;
  readonly paramBounds: Array<[number, number]>;
}
