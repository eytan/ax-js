// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Visualization utilities for ax-js.
 *
 * Colormaps, data-point rendering, fixture normalization, and search-space
 * helpers used by the demo suite and available for custom visualizations.
 *
 * @module ax-js/viz
 */

// ── Types ─────────────────────────────────────────────────────────────────
export type { RGB, ParamSpec, RenderPredictor, DotInfo } from "./types";
export type {
  FeatureImportanceOptions,
  CrossValidationOptions,
  OptimizationTraceOptions,
  SlicePlotOptions,
  ResponseSurfaceOptions,
  ScatterPlotOptions,
  ParetoPlotOptions,
  ObservedPredictedOptions,
  EffectsPlotOptions,
} from "./types";
export type { NormalizedExperiment } from "./fixture";

// ── Styles ────────────────────────────────────────────────────────────────
export { injectStyles, injectScopedStyles } from "./styles";

// ── Colormaps ─────────────────────────────────────────────────────────────
export { viridis, plasma, piYG, drawColorbar, renderHeatmap } from "./colormaps";

// ── Data point rendering ──────────────────────────────────────────────────
export { drawDataDot } from "./dots";

// ── Search-space & fixture helpers ────────────────────────────────────────
export {
  isChoice,
  isInteger,
  defaultParamValue,
  formatParamValue,
  getParamSpecs,
  normalizeFixture,
  normalizeExperimentData,
  computeDimOrder,
  computeParamSigns,
  pointRelevance,
} from "./params";

// ── Relativization helpers ───────────────────────────────────────────────
export {
  deltaRelativize,
  naiveRelPct,
  formatPct,
  resolveStatusQuo,
} from "./relativize";

// ── Tooltip helpers ───────────────────────────────────────────────────────
export {
  showTooltip,
  hideTooltip,
  createTooltipDiv,
  positionTooltip,
  removeTooltip,
} from "./tooltip";

// ── Widget helpers ────────────────────────────────────────────────────────
export {
  createOutcomeSelector,
  createParamSliders,
  setupFileUpload,
} from "./widgets";

// ── Dot interactivity helpers ─────────────────────────────────────────────
export {
  computeKernelRels,
  computeKernelRelsFromPoint,
  applyDotHighlight,
  applyDotHighlightFromPoint,
  clearDotHighlight,
  findNearestDot,
  buildPointTooltipHtml,
  attachDotInteractivity,
} from "./dots";

// ── Range estimation ─────────────────────────────────────────────────
export { estimateRange } from "./estimateRange";
export type { EstimatedRange } from "./estimateRange";

// ── Embeddable render functions ───────────────────────────────────────────
export { renderFeatureImportance } from "./plots/importance";
export type { FeatureImportanceController } from "./plots/importance";
export { renderCrossValidation } from "./plots/cv";
export type { CrossValidationController } from "./plots/cv";
export { renderOptimizationTrace } from "./plots/trace";
export type { OptimizationTraceController } from "./plots/trace";
export { renderSlicePlot } from "./plots/slice";
export type { SlicePlotController } from "./plots/slice";
export { renderResponseSurface } from "./plots/surface";
export type { ResponseSurfaceController } from "./plots/surface";
export { renderScatter, renderScatterStatic } from "./plots/scatter";
export type { ScatterPlotController, ScatterPointData, ScatterConfig } from "./plots/scatter";
export { renderParetoPlot } from "./plots/pareto";
export type { ParetoPlotController } from "./plots/pareto";
export { renderObservedPredicted } from "./plots/observed_predicted";
export type { ObservedPredictedController } from "./plots/observed_predicted";
export { renderEffectsPlot } from "./plots/effects";
export type { EffectsPlotController } from "./plots/effects";

// ── Explorer (multi-panel experiment explorer) ────────────────────────────
import * as _explorer from "./explorer/index";
export { _explorer as explorer };
/** @deprecated Use `explorer` instead. */
export { _explorer as cockpit };
