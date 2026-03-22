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
    // Strict improvement: excludes points dominated by ties
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

  // Predict at training points for uncertainty whiskers
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
 * Shows bi-objective training data with a step-line connecting
 * non-dominated points. Requires at least 2 outcomes.
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
    renderParetoStatic(
      container,
      predictor,
      xOut,
      yOut,
      W,
      H,
      directions,
      options?.showStatusQuo,
    );
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
  const dirs: Record<string, "min" | "max"> = { ...directions };
  const tooltip = createTooltipDiv(container.id);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS;
  const plotsDiv = document.createElement("div");
  container.append(controlsDiv);
  container.append(plotsDiv);

  // Direction toggle button — getOutcome returns the current axis outcome
  function makeDirBtn(
    getOutcome: () => string,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.style.cssText =
      "font-size:11px;padding:2px 6px;border-radius:4px;border:0.5px solid #d0d0d0;background:#f8f8f8;cursor:pointer;min-width:32px";
    btn.addEventListener("click", () => {
      const o = getOutcome();
      dirs[o] = (dirs[o] ?? "max") === "max" ? "min" : "max";
      syncBtn(btn, o);
      redraw();
    });
    return btn;
  }
  function syncBtn(btn: HTMLButtonElement, outcome: string): void {
    const d = dirs[outcome] ?? "max";
    btn.textContent = d;
    btn.style.color = d === "min" ? "#d95f4e" : "#4872f9";
  }

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
  const xDirBtn = makeDirBtn(() => selX);
  const yDirBtn = makeDirBtn(() => selY);
  syncBtn(xDirBtn, selX);
  syncBtn(yDirBtn, selY);
  xSel.addEventListener("change", () => {
    selX = xSel.value;
    if (selX === selY) {
      selY = predictor.outcomeNames.find((n) => n !== selX) ?? selX;
      ySel.value = selY;
    }
    syncBtn(xDirBtn, selX);
    redraw();
  });
  ySel.addEventListener("change", () => {
    selY = ySel.value;
    if (selX === selY) {
      selX = predictor.outcomeNames.find((n) => n !== selY) ?? selY;
      xSel.value = selX;
    }
    syncBtn(yDirBtn, selY);
    redraw();
  });
  xW.append(xDirBtn);
  yW.append(yDirBtn);
  controlsDiv.append(xW, yW);

  function redraw(): void {
    plotsDiv.innerHTML = "";
    renderParetoStatic(
      plotsDiv,
      predictor,
      selX,
      selY,
      W,
      H,
      dirs,
      options?.showStatusQuo,
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
  showStatusQuo?: boolean,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  const points = buildParetoPoints(predictor, xOutcome, yOutcome);
  const xMax = (directions[xOutcome] ?? "max") === "max";
  const yMax = (directions[yOutcome] ?? "max") === "max";

  // Compute both frontiers
  const activeFrontier = computeParetoFrontier(points, xMax, yMax);
  const dualFrontier = computeParetoFrontier(points, !xMax, !yMax);

  // Sort both frontiers by x ascending for step-line drawing
  const sortedActive = [...activeFrontier].sort(
    (a, b) => points[a].x - points[b].x,
  );
  const sortedDual = [...dualFrontier].sort(
    (a, b) => points[a].x - points[b].x,
  );

  // Determine which is max-max and which is min-min
  const isActiveMaxMax = xMax && yMax;
  const maxMaxSorted = isActiveMaxMax ? sortedActive : sortedDual;
  const minMinSorted = isActiveMaxMax ? sortedDual : sortedActive;
  const maxMaxIsActive = isActiveMaxMax;
  // When directions are mixed (max-min or min-max), the "active" frontier
  // is neither pure max-max nor pure min-min, so both are "inactive"
  const isMixed = xMax !== yMax;

  renderScatterStatic(
    target,
    predictor,
    xOutcome,
    {
      points,
      xLabel: xOutcome,
      yLabel: yOutcome,
      width: W,
      height: H,
      renderAnnotation: (svg, margin, pw, ph, sx, sy) => {
        // Render PF lines ON TOP of dots using <line> segments (not <path>)
        // for reliable first-paint rendering.
        const plotL = margin.left;
        const plotR = margin.left + pw;
        const plotT = margin.top;
        const plotB = margin.top + ph;

        function drawStaircase(
          sorted: Array<number>,
          color: string,
          fillColor: string,
          sw: number,
          opa: string,
          extendYBetter: number,
          extendXBetter: number,
          cornerX: number,
          cornerY: number,
          reverse: boolean,
        ): void {
          if (sorted.length === 0) return;
          const coords: Array<[number, number]> = sorted.map((fi) => [
            sx(points[fi].x),
            sy(points[fi].y),
          ]);

          // Build staircase waypoints: extension + steps + extension
          const waypoints: Array<[number, number]> = [];
          if (!reverse) {
            waypoints.push([coords[0][0], extendYBetter]);
            for (const c of coords) waypoints.push(c);
            waypoints.push([extendXBetter, coords[coords.length - 1][1]]);
          } else {
            waypoints.push([coords[coords.length - 1][0], extendYBetter]);
            for (let i = coords.length - 1; i >= 0; i--) waypoints.push(coords[i]);
            waypoints.push([extendXBetter, coords[0][1]]);
          }

          // Shaded non-dominated region: staircase + corner closure
          const polyPoints = waypoints
            .map(([x, y]) => `${x},${y}`)
            .concat([`${cornerX},${cornerY}`]) // close via the corner
            .join(" ");
          svg.append(
            svgEl("polygon", {
              points: polyPoints,
              fill: fillColor,
              stroke: "none",
            }),
          );

          // Draw staircase line segments on top of the fill
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
        }

        // ── Max-max frontier (upper-right, blue) ──
        const mmActive = maxMaxIsActive && !isMixed;
        drawStaircase(
          maxMaxSorted, "#4872f9", "rgba(72,114,249,0.06)",
          mmActive ? 2.5 : 1.5, mmActive ? "0.7" : "0.35",
          plotT,  // extend UP
          plotR,  // extend RIGHT
          plotR, plotT,  // corner: top-right
          false,
        );

        // ── Min-min frontier (lower-left, orange) ──
        const mmInactive = !maxMaxIsActive && !isMixed;
        drawStaircase(
          minMinSorted, "#e6a23c", "rgba(230,162,60,0.06)",
          mmInactive ? 2.5 : 1.5, mmInactive ? "0.7" : "0.35",
          plotB,  // extend DOWN
          plotL,  // extend LEFT
          plotL, plotB,  // corner: bottom-left
          true,
        );

        // Frontier dot rings (active only)
        const activeColor =
          isMixed ? "#4872f9" : maxMaxIsActive ? "#4872f9" : "#e6a23c";
        for (const fi of sortedActive) {
          const p = points[fi];
          svg.append(
            svgEl("circle", {
              cx: sx(p.x),
              cy: sy(p.y),
              r: 8,
              fill: "none",
              stroke: activeColor,
              "stroke-width": 1.5,
              opacity: "0.5",
            }),
          );
        }
      },
      renderOverlay: (svg, sx, sy, bounds) => {
        // Status quo diamond marker
        if (showStatusQuo && predictor.statusQuoPoint) {
          const sq = predictor.statusQuoPoint;
          const sqPred = predictor.predict([sq]);
          const sqXVal = sqPred[xOutcome]?.mean[0];
          const sqYVal = sqPred[yOutcome]?.mean[0];
          if (sqXVal != null && sqYVal != null) {
            const cx = sx(sqXVal);
            const cy = sy(sqYVal);
            svg.append(
              svgEl("polygon", {
                points: `${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`,
                fill: "#4872f9",
                stroke: "#fff",
                "stroke-width": 1.5,
                opacity: "0.8",
              }),
            );
          }
        }
      },
    },
    tooltip,
    tooltipContainer,
  );
}
