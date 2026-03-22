// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor, ScatterPlotOptions, DotInfo } from "../types";

import {
  computeKernelRels,
  applyDotHighlight,
  clearDotHighlight,
  findNearestDot,
  buildPointTooltipHtml,
} from "../dots";
import { injectScopedStyles, CTRL_CSS } from "../styles";
import { createTooltipDiv, positionTooltip, removeTooltip, makeSelectEl } from "../widgets";

import { svgEl } from "./_svg";

/** Data for one scatter point. */
export interface ScatterPointData {
  x: number;
  y: number;
  idx: number;
  pt: Array<number>;
  /** Half-width of x-axis CI whisker (e.g., 2*std). Omit for no whisker. */
  xWhisker?: number;
  /** Half-height of y-axis CI whisker (e.g., 2*std). Omit for no whisker. */
  yWhisker?: number;
}

/** Margin specification for plot layout. */
interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Configuration for the static scatter renderer. */
export interface ScatterConfig {
  points: Array<ScatterPointData>;
  xLabel: string;
  yLabel: string;
  xRange?: [number, number];
  yRange?: [number, number];
  width: number;
  height: number;
  diagonalLine?: boolean;
  /** Callback to render custom SVG overlays (GP bands, frontier, etc.) behind dots. */
  renderOverlay?: (
    svg: SVGSVGElement,
    sx: (v: number) => number,
    sy: (v: number) => number,
    bounds: { xlo: number; xhi: number; ylo: number; yhi: number },
  ) => void;
  /** Callback to render custom annotations (R², labels, etc.) on top of dots. */
  renderAnnotation?: (
    svg: SVGSVGElement,
    margin: Margin,
    pw: number,
    ph: number,
    sx: (v: number) => number,
    sy: (v: number) => number,
  ) => void;
  /** Custom tooltip builder. Falls back to buildPointTooltipHtml. */
  buildTooltip?: (idx: number) => string;
}

/** Controller for programmatic interaction with a scatter plot. */
export interface ScatterPlotController {
  setXAxis(name: string): void;
  setYAxis(name: string): void;
  destroy(): void;
}

// ── Axis resolution ───────────────────────────────────────────────────────

interface AxisData {
  values: Array<number>;
  label: string;
  pts: Array<Array<number>>;
  /** Predictive std at each point (populated for outcome axes). */
  stds?: Array<number>;
}

function resolveAxisData(predictor: RenderPredictor, name: string): AxisData | null {
  if (predictor.outcomeNames.includes(name)) {
    const td = predictor.getTrainingData(name);
    const pred = predictor.predict(td.X)[name];
    const stds = pred
      ? Array.from(pred.variance).map((v) => Math.sqrt(v))
      : undefined;
    return { values: Array.from(td.Y), label: name, pts: td.X, stds };
  }
  const dimIdx = predictor.paramNames.indexOf(name);
  if (dimIdx >= 0) {
    const td = predictor.getTrainingData(predictor.outcomeNames[0]);
    return { values: td.X.map((x) => x[dimIdx]), label: name, pts: td.X };
  }
  return null;
}

function buildScatterPoints(xData: AxisData, yData: AxisData): Array<ScatterPointData> {
  // Same-length training sets: zip by index (common case)
  if (xData.pts === yData.pts || xData.pts.length === yData.pts.length) {
    const n = Math.min(xData.values.length, yData.values.length);
    return Array.from({ length: n }, (_, i) => ({
      x: xData.values[i],
      y: yData.values[i],
      idx: i,
      pt: xData.pts[i],
      xWhisker: xData.stds ? 2 * xData.stds[i] : undefined,
      yWhisker: yData.stds ? 2 * yData.stds[i] : undefined,
    }));
  }
  // Different-length training sets: match by X vector equality
  const points: Array<ScatterPointData> = [];
  for (let i = 0; i < xData.pts.length; i++) {
    const xPt = xData.pts[i];
    for (let j = 0; j < yData.pts.length; j++) {
      if (
        xPt.length === yData.pts[j].length &&
        xPt.every((v, k) => v === yData.pts[j][k])
      ) {
        points.push({
          x: xData.values[i],
          y: yData.values[j],
          idx: i,
          pt: xPt,
          xWhisker: xData.stds ? 2 * xData.stds[i] : undefined,
          yWhisker: yData.stds ? 2 * yData.stds[j] : undefined,
        });
        break;
      }
    }
  }
  return points;
}

// ── Static renderer ───────────────────────────────────────────────────────

/**
 * Core scatter renderer. Draws axes, optional diagonal, overlays, dots,
 * annotations, and attaches NN-highlight interactivity.
 */
export function renderScatterStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  config: ScatterConfig,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  const { points, xLabel, yLabel, width: W, height: H } = config;
  if (points.length === 0) {
    target.textContent = "No data";
    return;
  }

  // Compute ranges with padding
  let [xlo, xhi] = config.xRange ?? [
    Math.min(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.x)),
  ];
  let [ylo, yhi] = config.yRange ?? [
    Math.min(...points.map((p) => p.y)),
    Math.max(...points.map((p) => p.y)),
  ];
  if (!config.xRange) {
    const xPad = 0.08 * (xhi - xlo || 1);
    xlo -= xPad;
    xhi += xPad;
  }
  if (!config.yRange) {
    const yPad = 0.08 * (yhi - ylo || 1);
    ylo -= yPad;
    yhi += yPad;
  }

  const margin: Margin = { top: 30, right: 20, bottom: 40, left: 55 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const sx = (v: number): number => margin.left + ((v - xlo) / (xhi - xlo)) * pw;
  const sy = (v: number): number => margin.top + ph - ((v - ylo) / (yhi - ylo)) * ph;

  const svg = svgEl("svg", { width: W, height: H });

  // Axis border lines
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

  // Diagonal line
  if (config.diagonalLine) {
    const dlo = Math.min(xlo, ylo);
    const dhi = Math.max(xhi, yhi);
    svg.append(
      svgEl("line", {
        x1: sx(dlo),
        y1: sy(dlo),
        x2: sx(dhi),
        y2: sy(dhi),
        stroke: "rgba(0,0,0,0.20)",
        "stroke-width": 1.5,
        "stroke-dasharray": "6,4",
      }),
    );
  }

  // Grid + ticks
  const nTicks = 5;
  for (let t = 0; t <= nTicks; t++) {
    const xv = xlo + ((xhi - xlo) * t) / nTicks;
    const yv = ylo + ((yhi - ylo) * t) / nTicks;
    svg.append(
      svgEl("line", {
        x1: margin.left,
        x2: margin.left + pw,
        y1: sy(yv),
        y2: sy(yv),
        stroke: "rgba(0,0,0,0.06)",
      }),
    );
    svg.append(
      Object.assign(
        svgEl("text", {
          x: sx(xv),
          y: margin.top + ph + 16,
          fill: "#999",
          "font-size": 10,
          "text-anchor": "middle",
        }),
        { textContent: xv.toFixed(2) },
      ),
    );
    svg.append(
      Object.assign(
        svgEl("text", {
          x: margin.left - 4,
          y: sy(yv) + 3,
          fill: "#999",
          "font-size": 10,
          "text-anchor": "end",
        }),
        { textContent: yv.toFixed(2) },
      ),
    );
  }

  // Overlays — rendered behind dots
  config.renderOverlay?.(svg, sx, sy, { xlo, xhi, ylo, yhi });

  // Dots with optional CI whiskers
  const dotR = 4;
  const defaultFill = "rgba(217,95,78,0.85)";
  const defaultStroke = "rgba(68,68,68,0.35)";
  const whiskerColor = "rgba(217,95,78,0.45)";
  const dots: Array<DotInfo> = [];
  for (const p of points) {
    const cx = sx(p.x);
    const cy = sy(p.y);
    const whiskerEls: Array<SVGLineElement> = [];

    // Y whisker (behind dot)
    if (p.yWhisker != null && p.yWhisker > 0) {
      const w = svgEl("line", {
        x1: cx,
        x2: cx,
        y1: sy(p.y + p.yWhisker),
        y2: sy(p.y - p.yWhisker),
        stroke: whiskerColor,
        "stroke-width": 1.5,
      });
      svg.append(w);
      whiskerEls.push(w);
    }

    // X whisker (behind dot)
    if (p.xWhisker != null && p.xWhisker > 0) {
      const w = svgEl("line", {
        x1: sx(p.x - p.xWhisker),
        x2: sx(p.x + p.xWhisker),
        y1: cy,
        y2: cy,
        stroke: whiskerColor,
        "stroke-width": 1.5,
      });
      svg.append(w);
      whiskerEls.push(w);
    }

    const dot = svgEl("circle", {
      cx,
      cy,
      r: dotR,
      fill: defaultFill,
      stroke: defaultStroke,
      "stroke-width": 1,
    });
    svg.append(dot);
    dots.push({
      cx,
      cy,
      idx: p.idx,
      pt: p.pt,
      el: dot,
      defaultFill,
      defaultStroke,
      defaultR: dotR,
      ...(whiskerEls.length > 0 ? { whiskers: whiskerEls } : {}),
    });
  }

  // Annotations — rendered on top
  config.renderAnnotation?.(svg, margin, pw, ph, sx, sy);

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
      { textContent: xLabel },
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
      { textContent: yLabel },
    ),
  );

  target.append(svg);

  // Interactivity with NN highlighting
  if (tooltip && tooltipContainer) {
    const buildTooltipFn =
      config.buildTooltip ??
      ((idx: number) => buildPointTooltipHtml(predictor, idx, outcome));

    let hoverHighlight = false;
    let pinnedDotIdx = -1;
    let pinnedRels: { raw: Array<number>; max: number } | null = null;

    svg.addEventListener("mousemove", (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const hitIdx = findNearestDot(dots, px, py);

      if (hitIdx >= 0) {
        svg.style.cursor = "pointer";
        applyDotHighlight(
          dots,
          hitIdx,
          computeKernelRels(predictor, dots, hitIdx, outcome),
        );
        hoverHighlight = true;
        tooltip.innerHTML = buildTooltipFn(dots[hitIdx].idx);
        tooltip.style.display = "block";
        positionTooltip(tooltip, e.clientX, e.clientY);
      } else {
        svg.style.cursor = "crosshair";
        if (hoverHighlight) {
          if (pinnedDotIdx >= 0 && pinnedRels) {
            applyDotHighlight(dots, pinnedDotIdx, pinnedRels);
          } else {
            clearDotHighlight(dots);
          }
          hoverHighlight = false;
        }
        tooltip.style.display = "none";
      }
    });

    svg.addEventListener("click", (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const hitIdx = findNearestDot(dots, px, py);

      if (hitIdx >= 0) {
        if (pinnedDotIdx === hitIdx) {
          pinnedDotIdx = -1;
          pinnedRels = null;
          clearDotHighlight(dots);
        } else {
          const rels = computeKernelRels(predictor, dots, hitIdx, outcome);
          pinnedDotIdx = hitIdx;
          pinnedRels = rels;
          applyDotHighlight(dots, hitIdx, rels);
        }
      } else {
        if (pinnedDotIdx >= 0) {
          pinnedDotIdx = -1;
          pinnedRels = null;
          clearDotHighlight(dots);
        }
      }
      hoverHighlight = false;
    });

    svg.addEventListener("mouseleave", () => {
      svg.style.cursor = "crosshair";
      tooltip.style.display = "none";
      if (hoverHighlight) {
        if (pinnedDotIdx >= 0 && pinnedRels) {
          applyDotHighlight(dots, pinnedDotIdx, pinnedRels);
        } else {
          clearDotHighlight(dots);
        }
        hoverHighlight = false;
      }
    });
  }
}

// ── Interactive wrapper ───────────────────────────────────────────────────

/**
 * Render an interactive scatter plot with axis selector dropdowns.
 *
 * Axes can be any outcome name or parameter name. NN highlighting uses
 * the kernel from the first selected outcome (or the first outcome overall).
 */
export function renderScatter(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: ScatterPlotOptions,
): ScatterPlotController {
  const interactive = options?.interactive !== false;
  const W = options?.width ?? 440;
  const H = options?.height ?? 440;

  if (!interactive) {
    const xName =
      options?.xAxis ?? predictor.outcomeNames[0] ?? predictor.paramNames[0];
    const yName =
      options?.yAxis ??
      (predictor.outcomeNames.length > 1
        ? predictor.outcomeNames[1]
        : predictor.paramNames[0]);
    const xData = resolveAxisData(predictor, xName);
    const yData = resolveAxisData(predictor, yName);
    if (xData && yData) {
      renderScatterStatic(container, predictor, predictor.outcomeNames[0], {
        points: buildScatterPoints(xData, yData),
        xLabel: xName,
        yLabel: yName,
        width: W,
        height: H,
        diagonalLine: options?.diagonalLine,
      });
    }
    return {
      setXAxis() {},
      setYAxis() {},
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

  const allNames = [...predictor.outcomeNames, ...predictor.paramNames];
  let selXName = options?.xAxis ?? allNames[0];
  let selYName =
    options?.yAxis ?? (allNames.length > 1 ? allNames[1] : allNames[0]);

  const tooltip = createTooltipDiv(container.id);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS;
  const plotsDiv = document.createElement("div");
  container.append(controlsDiv);
  container.append(plotsDiv);

  // X axis selector
  const { wrapper: xWrapper, select: xSelect } = makeSelectEl("X axis:");
  allNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    xSelect.append(opt);
  });
  xSelect.value = selXName;
  xSelect.addEventListener("change", () => {
    selXName = xSelect.value;
    if (selXName === selYName && allNames.length > 1) {
      selYName = allNames.find((n) => n !== selXName) ?? allNames[0];
      ySelect.value = selYName;
    }
    redraw();
  });
  controlsDiv.append(xWrapper);

  // Y axis selector
  const { wrapper: yWrapper, select: ySelect } = makeSelectEl("Y axis:");
  allNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    ySelect.append(opt);
  });
  ySelect.value = selYName;
  ySelect.addEventListener("change", () => {
    selYName = ySelect.value;
    if (selXName === selYName && allNames.length > 1) {
      selXName = allNames.find((n) => n !== selYName) ?? allNames[0];
      xSelect.value = selXName;
    }
    redraw();
  });
  controlsDiv.append(yWrapper);

  function redraw(): void {
    plotsDiv.innerHTML = "";
    const xData = resolveAxisData(predictor, selXName);
    const yData = resolveAxisData(predictor, selYName);
    if (!xData || !yData) {
      plotsDiv.textContent = "Invalid axis selection";
      return;
    }
    const outcomeForHighlight = predictor.outcomeNames.includes(selYName)
      ? selYName
      : predictor.outcomeNames.includes(selXName)
        ? selXName
        : predictor.outcomeNames[0];

    renderScatterStatic(
      plotsDiv,
      predictor,
      outcomeForHighlight,
      {
        points: buildScatterPoints(xData, yData),
        xLabel: selXName,
        yLabel: selYName,
        width: W,
        height: H,
        diagonalLine: options?.diagonalLine,
      },
      tooltip,
      container,
    );
  }
  redraw();

  return {
    setXAxis(name: string) {
      if (name === selXName) return;
      selXName = name;
      xSelect.value = name;
      redraw();
    },
    setYAxis(name: string) {
      if (name === selYName) return;
      selYName = name;
      ySelect.value = name;
      redraw();
    },
    destroy() {
      removeTooltip(container.id);
      container.innerHTML = "";
    },
  };
}
