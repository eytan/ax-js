// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor, ParetoPlotOptions } from "../types";

import { injectScopedStyles, CTRL_CSS } from "../styles";
import { createTooltipDiv, removeTooltip, makeSelectEl } from "../widgets";

import { svgEl } from "./_svg";
import { renderScatterStatic, type ScatterPointData } from "./scatter";

/** Controller for programmatic interaction with a Pareto plot. */
export interface ParetoPlotController {
  setXOutcome(name: string): void;
  setYOutcome(name: string): void;
  destroy(): void;
}

/**
 * Compute non-dominated Pareto frontier indices.
 * Sorts by "better x" direction and sweeps, tracking best y.
 */
function computeParetoFrontier(
  points: Array<ScatterPointData>,
  xMax: boolean,
  yMax: boolean,
): Array<number> {
  if (points.length === 0) return [];

  const indices = points.map((_, i) => i);
  // Sort: better x first, break ties by better y first
  indices.sort((a, b) => {
    const dx = xMax
      ? points[b].x - points[a].x
      : points[a].x - points[b].x;
    return dx !== 0
      ? dx
      : yMax
        ? points[b].y - points[a].y
        : points[a].y - points[b].y;
  });

  const frontier: Array<number> = [];
  let bestY = yMax ? -Infinity : Infinity;

  for (const idx of indices) {
    const y = points[idx].y;
    if (yMax ? y > bestY : y < bestY) {
      frontier.push(idx);
      bestY = y;
    }
  }
  return frontier;
}

/** Build matched scatter points from two outcomes' training data with CI whiskers. */
function buildParetoPoints(
  predictor: RenderPredictor,
  xOutcome: string,
  yOutcome: string,
): Array<ScatterPointData> {
  const xTd = predictor.getTrainingData(xOutcome);
  const yTd = predictor.getTrainingData(yOutcome);
  const n = Math.min(xTd.Y.length, yTd.Y.length);

  const pred = predictor.predict(xTd.X.slice(0, n));
  const xPred = pred[xOutcome];
  const yPred = pred[yOutcome];

  return Array.from({ length: n }, (_, i) => ({
    x: xTd.Y[i],
    y: yTd.Y[i],
    idx: i,
    pt: xTd.X[i],
    xWhisker: xPred ? 2 * Math.sqrt(xPred.variance[i]) : undefined,
    yWhisker: yPred ? 2 * Math.sqrt(yPred.variance[i]) : undefined,
  }));
}

/**
 * Render a Pareto frontier scatter plot.
 *
 * Directions are inferred from `predictor.outcomeDirections` (from
 * `optimization_config`). Objective thresholds, when available, define
 * the reference point — the hypervolume indicator fill extends between
 * the PF and the reference point. Without thresholds, no fill is drawn.
 */
export function renderParetoPlot(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: ParetoPlotOptions,
): ParetoPlotController {
  const interactive = options?.interactive !== false;
  const W = options?.width ?? 440;
  const H = options?.height ?? 440;
  const directions = options?.directions ?? predictor.outcomeDirections ?? {};

  if (predictor.outcomeNames.length < 2) {
    container.textContent = "Pareto plot requires at least 2 outcomes";
    return {
      setXOutcome() {},
      setYOutcome() {},
      destroy() {
        container.innerHTML = "";
      },
    };
  }

  if (!interactive) {
    const xOut = options?.xOutcome ?? predictor.outcomeNames[0];
    const yOut = options?.yOutcome ?? predictor.outcomeNames[1];
    renderParetoStatic(container, predictor, xOut, yOut, W, H, directions);
    return {
      setXOutcome() {},
      setYOutcome() {},
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

  let selX = options?.xOutcome ?? predictor.outcomeNames[0];
  let selY = options?.yOutcome ?? predictor.outcomeNames[1];
  const tooltip = createTooltipDiv(container.id);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS;
  const plotsDiv = document.createElement("div");
  container.append(controlsDiv);
  container.append(plotsDiv);

  // Outcome selectors (no direction toggles — inferred from optimization_config)
  const { wrapper: xW, select: xSel } = makeSelectEl("X:");
  const { wrapper: yW, select: ySel } = makeSelectEl("Y:");
  predictor.outcomeNames.forEach((name) => {
    const xo = document.createElement("option");
    xo.value = name;
    xo.textContent = name;
    xSel.append(xo);
    const yo = document.createElement("option");
    yo.value = name;
    yo.textContent = name;
    ySel.append(yo);
  });
  xSel.value = selX;
  ySel.value = selY;
  xSel.addEventListener("change", () => {
    selX = xSel.value;
    if (selX === selY) {
      selY = predictor.outcomeNames.find((n) => n !== selX) ?? selX;
      ySel.value = selY;
    }
    redraw();
  });
  ySel.addEventListener("change", () => {
    selY = ySel.value;
    if (selX === selY) {
      selX = predictor.outcomeNames.find((n) => n !== selY) ?? selY;
      xSel.value = selX;
    }
    redraw();
  });
  controlsDiv.append(xW, yW);

  // Show direction labels (read-only, from optimization_config)
  function dirLabel(outcome: string): string {
    const d = directions[outcome];
    return d === "min" ? "↓ min" : d === "max" ? "↑ max" : "";
  }
  const xDirSpan = document.createElement("span");
  xDirSpan.style.cssText = "font-size:10px;color:#999";
  xDirSpan.textContent = dirLabel(selX);
  const yDirSpan = document.createElement("span");
  yDirSpan.style.cssText = "font-size:10px;color:#999";
  yDirSpan.textContent = dirLabel(selY);
  xW.append(xDirSpan);
  yW.append(yDirSpan);

  xSel.addEventListener("change", () => {
    xDirSpan.textContent = dirLabel(selX);
  });
  ySel.addEventListener("change", () => {
    yDirSpan.textContent = dirLabel(selY);
  });

  function redraw(): void {
    plotsDiv.innerHTML = "";
    renderParetoStatic(
      plotsDiv,
      predictor,
      selX,
      selY,
      W,
      H,
      directions,
      tooltip,
      container,
    );
  }
  redraw();

  return {
    setXOutcome(name: string) {
      if (name === selX) return;
      selX = name;
      xSel.value = name;
      redraw();
    },
    setYOutcome(name: string) {
      if (name === selY) return;
      selY = name;
      ySel.value = name;
      redraw();
    },
    destroy() {
      removeTooltip(container.id);
      container.innerHTML = "";
    },
  };
}

// ── Static renderer ───────────────────────────────────────────────────────

function renderParetoStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  xOutcome: string,
  yOutcome: string,
  W: number,
  H: number,
  directions: Record<string, "min" | "max">,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  const points = buildParetoPoints(predictor, xOutcome, yOutcome);
  const xMax = (directions[xOutcome] ?? "max") === "max";
  const yMax = (directions[yOutcome] ?? "max") === "max";

  // Compute frontier with inferred directions
  const frontier = computeParetoFrontier(points, xMax, yMax);
  const sortedFrontier = [...frontier].sort(
    (a, b) => points[a].x - points[b].x,
  );

  // Resolve reference point from objective thresholds
  const thresholds = predictor.objectiveThresholds ?? {};
  const xThresh = thresholds[xOutcome];
  const yThresh = thresholds[yOutcome];
  const hasRefPoint = xThresh != null && yThresh != null;
  const refX = xThresh?.bound;
  const refY = yThresh?.bound;

  renderScatterStatic(
    target,
    predictor,
    xOutcome,
    {
      points,
      xLabel: `${xOutcome}${directions[xOutcome] ? ` (${directions[xOutcome]})` : ""}`,
      yLabel: `${yOutcome}${directions[yOutcome] ? ` (${directions[yOutcome]})` : ""}`,
      width: W,
      height: H,
      renderOverlay: (svg, sx, sy, bounds) => {
        // Reference point dashed lines (objective thresholds)
        if (hasRefPoint) {
          // Vertical dashed line at x threshold
          svg.append(
            svgEl("line", {
              x1: sx(refX!),
              x2: sx(refX!),
              y1: sy(bounds.ylo),
              y2: sy(bounds.yhi),
              stroke: "rgba(0,0,0,0.2)",
              "stroke-width": 1,
              "stroke-dasharray": "4,3",
            }),
          );
          // Horizontal dashed line at y threshold
          svg.append(
            svgEl("line", {
              x1: sx(bounds.xlo),
              x2: sx(bounds.xhi),
              y1: sy(refY!),
              y2: sy(refY!),
              stroke: "rgba(0,0,0,0.2)",
              "stroke-width": 1,
              "stroke-dasharray": "4,3",
            }),
          );
        }
      },
      renderAnnotation: (svg, margin, pw, ph, sx, sy) => {
        const plotL = margin.left;
        const plotR = margin.left + pw;
        const plotT = margin.top;
        const plotB = margin.top + ph;

        if (sortedFrontier.length === 0) return;

        // Build staircase waypoints
        const coords: Array<[number, number]> = sortedFrontier.map((fi) => [
          sx(points[fi].x),
          sy(points[fi].y),
        ]);

        // Extension directions based on optimization direction
        const extendY = yMax ? plotT : plotB;
        const extendX = xMax ? plotR : plotL;

        // Build waypoints: extend in better-y direction, step through, extend in better-x direction
        const waypoints: Array<[number, number]> = [];
        waypoints.push([coords[0][0], extendY]);
        for (const c of coords) waypoints.push(c);
        waypoints.push([extendX, coords[coords.length - 1][1]]);

        // Hypervolume indicator fill (only if reference point exists)
        if (hasRefPoint) {
          const refPx = sx(refX!);
          const refPy = sy(refY!);

          // Clip the staircase at the reference point to avoid fill crossing the whole image.
          // The fill polygon: staircase waypoints → close via reference point corner.
          // We clip the extension endpoints to the reference point instead of plot edges.
          const clippedWaypoints: Array<[number, number]> = [];
          const clipExtY = yMax ? Math.max(refPy, plotT) : Math.min(refPy, plotB);
          const clipExtX = xMax ? Math.min(refPx, plotR) : Math.max(refPx, plotL);

          clippedWaypoints.push([coords[0][0], clipExtY]);
          for (const c of coords) clippedWaypoints.push(c);
          clippedWaypoints.push([clipExtX, coords[coords.length - 1][1]]);

          const polyPoints = clippedWaypoints
            .map(([x, y]) => `${x},${y}`)
            .concat([`${clipExtX},${clipExtY}`])
            .join(" ");
          svg.append(
            svgEl("polygon", {
              points: polyPoints,
              fill: "rgba(72,114,249,0.08)",
              stroke: "none",
            }),
          );

          // Reference point marker (small diamond)
          svg.append(
            svgEl("polygon", {
              points: `${refPx},${refPy - 5} ${refPx + 5},${refPy} ${refPx},${refPy + 5} ${refPx - 5},${refPy}`,
              fill: "rgba(0,0,0,0.3)",
              stroke: "#fff",
              "stroke-width": 1,
            }),
          );
        }

        // Draw staircase line segments
        const color = "#4872f9";
        const sw = 2.5;
        const opa = "0.7";
        for (let i = 0; i < waypoints.length - 1; i++) {
          const [x1, y1] = waypoints[i];
          const [x2, y2] = waypoints[i + 1];
          if (Math.abs(x1 - x2) < 0.5) {
            svg.append(svgEl("line", {
              x1, y1, x2, y2, stroke: color, "stroke-width": sw, opacity: opa,
            }));
          } else {
            svg.append(svgEl("line", {
              x1, y1: y1, x2: x2, y2: y1, stroke: color, "stroke-width": sw, opacity: opa,
            }));
            if (Math.abs(y1 - y2) > 0.5) {
              svg.append(svgEl("line", {
                x1: x2, y1: y1, x2: x2, y2: y2, stroke: color, "stroke-width": sw, opacity: opa,
              }));
            }
          }
        }

        // Frontier dot rings
        for (const fi of sortedFrontier) {
          const p = points[fi];
          svg.append(
            svgEl("circle", {
              cx: sx(p.x),
              cy: sy(p.y),
              r: 8,
              fill: "none",
              stroke: "#4872f9",
              "stroke-width": 1.5,
              opacity: "0.5",
            }),
          );
        }
      },
    },
    tooltip,
    tooltipContainer,
  );
}
