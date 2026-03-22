// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor, ObservedPredictedOptions } from "../types";

import { injectScopedStyles, CTRL_CSS } from "../styles";
import {
  createOutcomeSelector,
  createTooltipDiv,
  removeTooltip,
  makeSelectEl,
} from "../widgets";

import { svgEl } from "./_svg";
import { renderScatterStatic, type ScatterPointData } from "./scatter";

/** Controller for programmatic interaction with an observed vs predicted plot. */
export interface ObservedPredictedController {
  setOutcome(name: string): void;
  destroy(): void;
}

/**
 * Render an observed vs predicted scatter plot.
 *
 * Plots each training point's observed Y against the model's in-sample
 * prediction, with 2σ CI whiskers, a diagonal reference line, and R².
 */
export function renderObservedPredicted(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: ObservedPredictedOptions,
): ObservedPredictedController {
  const interactive = options?.interactive !== false;
  const W = options?.width ?? 440;
  const H = options?.height ?? 440;

  if (!interactive) {
    const outcome = options?.outcome ?? predictor.outcomeNames[0];
    renderOPStatic(container, predictor, outcome, W, H);
    return {
      setOutcome() {},
      destroy() {
        container.innerHTML = "";
      },
    };
  }

  if (!container.id) {
    container.id = "axjs_" + Math.random().toString(36).slice(2, 10);
  }
  removeTooltip(container.id);
  container.innerHTML = "";
  injectScopedStyles(container);

  let selectedOutcome = options?.outcome ?? predictor.outcomeNames[0];
  const tooltip = createTooltipDiv(container.id);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS;
  const plotsDiv = document.createElement("div");
  container.append(controlsDiv);
  container.append(plotsDiv);

  if (predictor.outcomeNames.length > 1) {
    const { wrapper, select } = makeSelectEl("Outcome:");
    createOutcomeSelector(predictor, select, (name) => {
      selectedOutcome = name;
      redraw();
    });
    controlsDiv.append(wrapper);
  }

  function redraw(): void {
    plotsDiv.innerHTML = "";
    renderOPStatic(
      plotsDiv,
      predictor,
      selectedOutcome,
      W,
      H,
      tooltip,
      container,
    );
  }
  redraw();

  return {
    setOutcome(name: string) {
      if (name === selectedOutcome) return;
      selectedOutcome = name;
      redraw();
    },
    destroy() {
      removeTooltip(container.id);
      container.innerHTML = "";
    },
  };
}

// ── Static renderer ───────────────────────────────────────────────────────

function renderOPStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  W: number,
  H: number,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  const td = predictor.getTrainingData(outcome);
  if (td.Y.length === 0) {
    target.textContent = "No data";
    return;
  }

  const observed = td.Y;
  const pred = predictor.predict(td.X)[outcome];
  if (!pred) {
    target.textContent = "No predictions for outcome: " + outcome;
    return;
  }

  const predicted = Array.from(pred.mean);
  const predStd = Array.from(pred.variance).map((v) => Math.sqrt(v));
  const n = observed.length;

  // R²
  const meanObs = observed.reduce((a, b) => a + b, 0) / n;
  const ssTot = observed.reduce((s, v) => s + (v - meanObs) ** 2, 0);
  const ssRes = observed.reduce(
    (s, v, i) => s + (v - predicted[i]) ** 2,
    0,
  );
  const r2 = 1 - ssRes / ssTot;

  // Points with CI whiskers on predicted axis
  const points: Array<ScatterPointData> = observed.map((obs, i) => ({
    x: obs,
    y: predicted[i],
    idx: i,
    pt: td.X[i],
    yWhisker: 2 * predStd[i],
  }));

  // Range including CI whiskers
  let lo = Math.min(...observed, ...predicted);
  let hi = Math.max(...observed, ...predicted);
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, predicted[i] - 2 * predStd[i]);
    hi = Math.max(hi, predicted[i] + 2 * predStd[i]);
  }
  const pad = 0.08 * (hi - lo || 1);
  lo -= pad;
  hi += pad;

  renderScatterStatic(
    target,
    predictor,
    outcome,
    {
      points,
      xLabel: "Observed",
      yLabel: "Predicted",
      xRange: [lo, hi],
      yRange: [lo, hi],
      width: W,
      height: H,
      diagonalLine: true,
      renderAnnotation: (svg, margin) => {
        svg.append(
          Object.assign(
            svgEl("text", {
              x: margin.left + 6,
              y: margin.top + 18,
              fill: "#4872f9",
              "font-size": 14,
              "font-weight": "600",
            }),
            { textContent: `R\u00B2 = ${r2.toFixed(4)}` },
          ),
        );
      },
      buildTooltip: (idx: number) => {
        let html = `<div style="font-weight:600;color:#666;margin-bottom:4px">${outcome} — trial ${idx}</div>`;
        html += `observed = <span style="color:#4872f9">${observed[idx].toFixed(4)}</span><br>`;
        html += `predicted = <span style="color:#4872f9">${predicted[idx].toFixed(4)}</span><br>`;
        html += `\u00B1 2\u03C3 = [${(predicted[idx] - 2 * predStd[idx]).toFixed(4)}, ${(predicted[idx] + 2 * predStd[idx]).toFixed(4)}]`;
        return html;
      },
    },
    tooltip,
    tooltipContainer,
  );
}
