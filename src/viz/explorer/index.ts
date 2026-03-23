// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Explorer module — embeddable multi-panel experiment explorer.
 *
 * Provides both a full `renderCockpit()` for standalone use and
 * individual panel renderers for embedding into custom layouts.
 *
 * @module ax-js/viz/explorer
 */

// ── Public types ──────────────────────────────────────────────────────────
export type {
  CockpitArm,
  CockpitCandidate,
  CockpitSelection,
  CockpitOptions,
  CockpitController,
} from "./types.js";

// ── Data layer (pure functions, no DOM) ───────────────────────────────────
export {
  prepareExperimentState,
  loadCockpitData,
  batchColor,
  inferBatchIndices,
  relativizeItem,
  computeAllRelData,
  predictCandidate,
  computePanelRange,
  niceRange,
  computeDefaultMetricOrder,
  outcomeDesiredSign,
  ciColors,
  starPoints,
  CI_Z,
} from "./data.js";
export type { CockpitData, CockpitPredictor, PredictorConstructor, PredsByOutcome, CIColors } from "./data.js";

// ── Panel renderers ───────────────────────────────────────────────────────
export { renderScatterSvg, showHoverEllipse, updateScatterOpacities } from "./scatter.js";
export type { ScatterState, ScatterOptions } from "./scatter.js";
export { renderDeltoidPanel, getItemLabel } from "./deltoid.js";
export type { DeltoidOptions } from "./deltoid.js";
export { renderSlidersPanel } from "./sliders.js";
export type { SliderOptions, SliderImportance } from "./sliders.js";

// ── Full explorer orchestrator ────────────────────────────────────────────
export { renderCockpit } from "./render.js";
