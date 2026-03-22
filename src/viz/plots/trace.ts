// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor, OptimizationTraceOptions, DotInfo } from "../types";

import { attachDotInteractivity } from "../dots";
import { injectScopedStyles, CTRL_CSS } from "../styles";
import { createOutcomeSelector, createTooltipDiv, removeTooltip, makeSelectEl } from "../widgets";

import { svgEl } from "./_svg";

/** Controller for programmatic interaction with an interactive optimization trace plot. */
export interface OptimizationTraceController {
  setOutcome(name: string): void;
  destroy(): void;
}

/**
 * Render an optimization trace plot into a container.
 *
 * Shows per-trial outcome values as dots with a best-so-far step line.
 * Purple dots indicate trials that set a new best; gray dots are others.
 */
export function renderOptimizationTrace(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: OptimizationTraceOptions,
): OptimizationTraceController {
  const interactive = options?.interactive !== false;

  if (!interactive) {
    renderOptimizationTraceStatic(
      container,
      predictor,
      options?.outcome ?? predictor.outcomeNames[0],
      options,
    );
    return { setOutcome() {}, destroy() { container.innerHTML = ""; } };
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
    renderOptimizationTraceStatic(
      plotsDiv,
      predictor,
      selectedOutcome,
      options,
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

function renderOptimizationTraceStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  options?: OptimizationTraceOptions,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  const W = options?.width ?? 440;
  const H = options?.height ?? 440;
  const minimize =
    options?.minimize ?? predictor.outcomeDirections?.[outcome] === "min";
  const td = predictor.getTrainingData(outcome);
  if (td.Y.length === 0) {
    target.textContent = "No data";
    return;
  }

  const yVals = td.Y;
  const n = yVals.length;

  // Running best
  let best = yVals[0];
  const bestSoFar = yVals.map((y): number => {
    best = minimize ? Math.min(best, y) : Math.max(best, y);
    return best;
  });

  let yMin = Math.min(...yVals);
  let yMax = Math.max(...yVals);
  const yPad = 0.08 * (yMax - yMin || 1);
  yMin -= yPad;
  yMax += yPad;

  const margin = { top: 30, right: 20, bottom: 40, left: 55 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const sx = (i: number): number => margin.left + (i / Math.max(1, n - 1)) * pw;
  const sy = (v: number): number => margin.top + ph - ((v - yMin) / (yMax - yMin)) * ph;

  const svg = svgEl("svg", { width: W, height: H });

  // Axis border lines (bottom + left)
  svg.append(
    svgEl("line", {
      x1: margin.left,
      x2: margin.left + pw,
      y1: margin.top + ph,
      y2: margin.top + ph,
      stroke: "rgba(0,0,0,0.20)",
      "stroke-width": 1,
    }),
  );
  svg.append(
    svgEl("line", {
      x1: margin.left,
      x2: margin.left,
      y1: margin.top,
      y2: margin.top + ph,
      stroke: "rgba(0,0,0,0.20)",
      "stroke-width": 1,
    }),
  );

  // Grid + Y ticks
  const nTicks = 5;
  for (let t = 0; t <= nTicks; t++) {
    const v = yMin + ((yMax - yMin) * t) / nTicks;
    svg.append(
      svgEl("line", {
        x1: margin.left,
        x2: margin.left + pw,
        y1: sy(v),
        y2: sy(v),
        stroke: "rgba(0,0,0,0.06)",
      }),
    );
    svg.append(
      Object.assign(
        svgEl("text", {
          x: margin.left - 8,
          y: sy(v) + 4,
          fill: "#999",
          "font-size": 10,
          "text-anchor": "end",
        }),
        { textContent: v.toFixed(2) },
      ),
    );
  }

  // Best-so-far step line
  let bsfPath = `M ${sx(0)} ${sy(bestSoFar[0])}`;
  for (let i = 1; i < n; i++) {
    bsfPath += ` H ${sx(i)} V ${sy(bestSoFar[i])}`;
  }
  svg.append(
    Object.assign(
      svgEl("path", {
        d: bsfPath,
        stroke: "#444",
        "stroke-width": 2.5,
        fill: "none",
        opacity: "0.7",
      }),
    ),
  );

  // Dots
  const traceDots: Array<DotInfo> = [];
  for (let i = 0; i < n; i++) {
    const isBest = bestSoFar[i] === yVals[i];
    const dotFill = isBest ? "rgba(217,95,78,0.9)" : "rgba(0,0,0,0.12)";
    const dotStroke = isBest ? "rgba(68,68,68,0.5)" : "rgba(0,0,0,0.06)";
    const dot = svgEl("circle", {
      cx: sx(i),
      cy: sy(yVals[i]),
      r: 4,
      fill: dotFill,
      stroke: dotStroke,
      "stroke-width": 1,
    });
    svg.append(dot);
    traceDots.push({
      cx: sx(i),
      cy: sy(yVals[i]),
      idx: i,
      pt: td.X[i] ?? [],
      el: dot,
      defaultFill: dotFill,
      defaultStroke: dotStroke,
      defaultR: 4,
    });
  }

  // Axis labels
  svg.append(
    Object.assign(
      svgEl("text", {
        x: margin.left + pw / 2,
        y: H - 6,
        fill: "#666",
        "font-size": 13,
        "text-anchor": "middle",
      }),
      { textContent: "Trial" },
    ),
  );
  svg.append(
    Object.assign(
      svgEl("text", {
        x: 14,
        y: margin.top + ph / 2,
        fill: "#666",
        "font-size": 13,
        "text-anchor": "middle",
        transform: `rotate(-90,14,${margin.top + ph / 2})`,
      }),
      { textContent: `${outcome}${minimize ? " (min)" : " (max)"}` },
    ),
  );

  // X ticks
  const xStep = Math.max(1, Math.ceil(n / 10));
  for (let i = 0; i < n; i += xStep) {
    svg.append(
      Object.assign(
        svgEl("text", {
          x: sx(i),
          y: margin.top + ph + 18,
          fill: "#999",
          "font-size": 10,
          "text-anchor": "middle",
        }),
        { textContent: String(i) },
      ),
    );
  }

  // Legend
  svg.append(
    svgEl("line", {
      x1: margin.left + pw - 120,
      x2: margin.left + pw - 100,
      y1: margin.top + 12,
      y2: margin.top + 12,
      stroke: "#444",
      "stroke-width": 2.5,
    }),
  );
  svg.append(
    Object.assign(
      svgEl("text", {
        x: margin.left + pw - 96,
        y: margin.top + 16,
        fill: "#666",
        "font-size": 11,
      }),
      { textContent: "best so far" },
    ),
  );

  // Click-to-pin interactivity
  if (tooltip && tooltipContainer) {
    attachDotInteractivity(svg, traceDots, predictor, outcome, tooltip, tooltipContainer, {
      fallbackMouseMove: () => {
        tooltip.style.display = "none";
      },
    });
  }

  target.append(svg);
}
