// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type {
  RenderPredictor,
  SlicePlotOptions,
  DotInfo,
  DimensionRanker,
  ParamSpec,
} from "../types";

import {
  applyDotHighlight,
  applyDotHighlightFromPoint,
  clearDotHighlight,
  computeKernelRels,
  computeKernelRelsFromPoint,
} from "../dots";
import { estimateRange } from "../estimateRange";
import { isChoice, isInteger, formatParamValue, computeDimOrder, getParamSpecs } from "../params";
import { deltaRelativize, naiveRelPct, formatPct, resolveStatusQuo } from "../relativize";
import { injectScopedStyles, CTRL_CSS } from "../styles";
import {
  createOutcomeSelector,
  createParamSliders,
  createTooltipDiv,
  positionTooltip,
  removeTooltip,
  makeSelectEl,
} from "../widgets";

import { svgEl } from "./_svg";

/**
 * Render 1D posterior slice plots for each parameter dimension.
 *
 * For each dimension, sweeps that dimension while holding others
 * at fixed values, and plots mean +/- 2 sigma. Supports choice
 * parameters (discrete dots with error bars), stable y-axis,
 * hover line/dot on mean curve, and click-to-pin with slider snapping.
 */
/** Controller for programmatic interaction with an interactive slice plot. */
export interface SlicePlotController {
  setRelative(relative: boolean): void;
  setOutcome(name: string): void;
  destroy(): void;
}

export function renderSlicePlot(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: SlicePlotOptions,
): SlicePlotController {
  const interactive = options?.interactive !== false;

  if (!interactive) {
    renderSlicePlotStatic(
      container,
      predictor,
      options?.outcome ?? predictor.outcomeNames[0],
      options,
    );
    return { setRelative() {}, setOutcome() {}, destroy() { container.innerHTML = ""; } };
  }

  if (!container.id) {
    container.id = "axjs_" + Math.random().toString(36).slice(2, 10);
  }
  removeTooltip(container.id);
  container.innerHTML = "";
  injectScopedStyles(container);
  let selectedOutcome = options?.outcome ?? predictor.outcomeNames[0];
  const params = getParamSpecs(predictor);
  const td0 = predictor.getTrainingData();
  const fixedValues: Array<number | string | boolean> =
    options?.fixedValues?.slice() ??
    (td0.X.length > 0
      ? td0.X[0].slice()
      : params.map((p, j) => {
          if (isChoice(p)) {
            return p.values![0];
          }
          return (predictor.paramBounds[j][0] + predictor.paramBounds[j][1]) / 2;
        }));
  const tooltip = createTooltipDiv(container.id);

  // Relative mode: resolve SQ means/stds per outcome for delta-method
  let isRelative = options?.relative === true;
  let sqStats: Record<string, { mean: number; std: number }> | undefined;
  function computeSqStats(): void {
    sqStats = undefined;
    if (!isRelative) return;
    const sq = resolveStatusQuo(predictor, options);
    if (sq) {
      const sqPred = predictor.predict([sq]);
      sqStats = {};
      for (const name of predictor.outcomeNames) {
        const p = sqPred[name];
        if (p && Math.abs(p.mean[0]) >= 1e-15) {
          // std=0 for visualization: show only prediction uncertainty relative
          // to SQ level, not SQ uncertainty itself. Full delta method with large
          // sqStd produces meaninglessly wide CIs when the SQ is uncertain.
          sqStats[name] = { mean: p.mean[0], std: 0 };
        }
      }
      if (Object.keys(sqStats).length === 0) {
        console.warn("ax-js: status quo mean ≈ 0 for all outcomes; falling back to absolute mode");
        sqStats = undefined;
      }
    }
  }
  computeSqStats();

  // Pre-compute stable y-axis via Halton + optimization
  const rawRange = estimateRange(predictor);
  const globalYRange: Record<string, { min: number; max: number }> = {};
  function recomputeGlobalYRange(): void {
    for (const name of predictor.outcomeNames) {
      const r = rawRange[name];
      if (!r) continue;
      const sq = sqStats?.[name];
      let lo: number, hi: number;
      if (sq) {
        lo = naiveRelPct(r.ciMin, sq.mean);
        hi = naiveRelPct(r.ciMax, sq.mean);
      } else {
        lo = r.ciMin;
        hi = r.ciMax;
      }
      const pad = 0.05 * (hi - lo);
      globalYRange[name] = { min: lo - pad, max: hi + pad };
    }
  }
  recomputeGlobalYRange();

  // Shared pinned state — persists across re-renders
  let slicePinnedIdx = -1;
  let pinnedCurvePoint: Array<number> | null = null;

  // Single-dim mode state
  const isSingleLayout = options?.layout === "single";
  let selectedDim: number | null = null; // null means "all" in grid mode

  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS + "padding:8px 16px;";
  const slidersDiv = document.createElement("div");
  slidersDiv.style.cssText = "margin-bottom:8px;padding:0 16px;";
  const plotsDiv = document.createElement("div");
  plotsDiv.style.cssText = "padding:4px 8px 12px;";
  container.append(controlsDiv);
  container.append(plotsDiv);
  container.append(slidersDiv);

  if (predictor.outcomeNames.length > 1) {
    const { wrapper, select } = makeSelectEl("Outcome:");
    createOutcomeSelector(predictor, select, (name) => {
      selectedOutcome = name;
      redraw();
    });
    controlsDiv.append(wrapper);
  }

  // Dimension selector for single-dim layout
  let dimSelect: HTMLSelectElement | null = null;
  if (isSingleLayout) {
    const { wrapper, select } = makeSelectEl("Parameter:");
    dimSelect = select;
    // Populate with parameter names; default to most important
    const initDimOrder = computeDimOrder(
      predictor as DimensionRanker,
      predictor.paramNames.length,
      selectedOutcome,
    );
    selectedDim = initDimOrder[0] ?? 0;
    for (const di of initDimOrder) {
      const opt = document.createElement("option");
      opt.value = String(di);
      opt.textContent = predictor.paramNames[di];
      select.append(opt);
    }
    select.value = String(selectedDim);
    select.addEventListener("change", () => {
      selectedDim = +select.value;
      redrawPlots();
    });
    controlsDiv.append(wrapper);
  }

  function rebuildSliders(): void {
    const dimOrd = computeDimOrder(
      predictor as DimensionRanker,
      predictor.paramNames.length,
      selectedOutcome,
    );
    // In single mode, update dimension selector options order
    if (dimSelect && isSingleLayout) {
      const prevVal = dimSelect.value;
      dimSelect.innerHTML = "";
      for (const di of dimOrd) {
        const opt = document.createElement("option");
        opt.value = String(di);
        opt.textContent = predictor.paramNames[di];
        dimSelect.append(opt);
      }
      // Preserve selection if still valid, else pick most important
      if (dimOrd.includes(+prevVal)) {
        dimSelect.value = prevVal;
        selectedDim = +prevVal;
      } else {
        selectedDim = dimOrd[0] ?? 0;
        dimSelect.value = String(selectedDim);
      }
    }
    createParamSliders(
      predictor,
      params,
      slidersDiv,
      fixedValues,
      () => {
        pinnedCurvePoint = null;
        redrawPlots();
      },
      { dimOrder: dimOrd },
    );
  }

  function redrawPlots(): void {
    plotsDiv.innerHTML = "";
    renderSlicePlotStatic(
      plotsDiv,
      predictor,
      selectedOutcome,
      options,
      fixedValues as Array<number>,
      tooltip,
      globalYRange,
      params,
      () => slicePinnedIdx,
      (v: number) => {
        slicePinnedIdx = v;
      },
      (pt: Array<number>) => {
        // Snap sliders to clicked point's coordinates
        for (let j = 0; j < fixedValues.length; j++) {
          fixedValues[j] = pt[j];
        }
        rebuildSliders();
        redrawPlots();
      },
      sqStats,
      isSingleLayout && selectedDim !== null ? selectedDim : undefined,
      pinnedCurvePoint,
      (pt: Array<number> | null) => {
        pinnedCurvePoint = pt;
      },
    );
  }

  // Full redraw: rebuild sliders (order may change) + plots
  function redraw(): void {
    rebuildSliders();
    redrawPlots();
  }
  redraw();

  return {
    setRelative(relative: boolean) {
      if (relative === isRelative) return;
      isRelative = relative;
      computeSqStats();
      recomputeGlobalYRange();
      redrawPlots();
    },
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

function renderSlicePlotStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  options?: SlicePlotOptions,
  fixedValuesOverride?: Array<number>,
  tooltip?: HTMLDivElement,
  globalYRange?: Record<string, { min: number; max: number }>,
  paramSpecs?: Array<ParamSpec>,
  getPinnedIdx?: () => number,
  setPinnedIdx?: (v: number) => void,
  onSnapToPoint?: (pt: Array<number>) => void,
  sqStats?: Record<string, { mean: number; std: number }>,
  singleDim?: number,
  pinnedCurvePoint?: Array<number> | null,
  setPinnedCurvePoint?: (pt: Array<number> | null) => void,
  onHoverDim?: (dim: number, xValue: number) => void,
  onHoverDimClear?: () => void,
): void {
  const numPoints = options?.numPoints ?? 80;
  // Single-dim mode renders larger by default
  const W = options?.width ?? (singleDim !== undefined ? 560 : 340);
  const H = options?.height ?? (singleDim !== undefined ? 320 : 220);
  const bounds = predictor.paramBounds;
  const names = predictor.paramNames;
  const nDim = names.length;
  const params = paramSpecs ?? getParamSpecs(predictor);
  const fixedValues =
    fixedValuesOverride?.slice() ??
    options?.fixedValues?.slice() ??
    bounds.map(([lo, hi]) => (lo + hi) / 2);

  // Resolve per-outcome SQ stats for relative mode (delta method)
  const sqStat = sqStats?.[outcome];
  const relativeActive = sqStat !== undefined;

  target.style.display = "flex";
  target.style.flexWrap = "wrap";
  target.style.gap = "8px";

  const margin = { top: 24, right: 16, bottom: 32, left: relativeActive ? 62 : 50 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  // Cross-subplot dot arrays for coordinated highlighting
  const allSubplotDots: Array<Array<DotInfo>> = [];
  // Use external pinned state if provided, else local
  let localPinnedIdx = -1;
  const _getPinned = getPinnedIdx ?? (() => localPinnedIdx);
  const _setPinned =
    setPinnedIdx ??
    ((v: number) => {
      localPinnedIdx = v;
    });

  // Sort dimensions by importance; in single-dim mode, render only the selected dim
  const dimOrder =
    singleDim !== undefined
      ? [singleDim]
      : computeDimOrder(predictor as DimensionRanker, nDim, outcome);

  for (const dim of dimOrder) {
    const p = params[dim];
    const dimIsChoice = isChoice(p);
    const dimIsInt = isInteger(p);

    let xs: Array<number>;
    let xLo: number, xHi: number;
    if (dimIsChoice) {
      xs = p.values!.map(Number);
      xLo = 0;
      xHi = xs.length - 1;
    } else if (dimIsInt) {
      xLo = bounds[dim][0];
      xHi = bounds[dim][1];
      xs = [];
      for (let iv = Math.ceil(xLo); iv <= Math.floor(xHi); iv++) {
        xs.push(iv);
      }
    } else {
      [xLo, xHi] = bounds[dim];
      if (xLo === xHi) {
        continue;
      }
      xs = [];
      for (let i = 0; i < numPoints; i++) {
        xs.push(xLo + ((xHi - xLo) * i) / (numPoints - 1));
      }
    }
    if (xs.length === 0) {
      continue;
    }

    const testPoints = xs.map((v) => {
      const pt = fixedValues.slice();
      pt[dim] = v;
      return pt;
    });

    const pred = predictor.predict(testPoints)[outcome];
    if (!pred) {
      continue;
    }

    const rawMeans = Array.from(pred.mean);
    const rawStds = rawMeans.map((_, i) => Math.sqrt(pred.variance[i]));
    let means: Array<number>, stds: Array<number>;
    if (relativeActive) {
      means = [];
      stds = [];
      for (let i = 0; i < rawMeans.length; i++) {
        const [rm, rs] = deltaRelativize(rawMeans[i], rawStds[i], sqStat.mean, sqStat.std);
        means.push(rm);
        stds.push(rs);
      }
    } else {
      means = rawMeans;
      stds = rawStds;
    }
    const upper = means.map((m, i) => m + 2 * stds[i]);
    const lower = means.map((m, i) => m - 2 * stds[i]);

    // Y-axis range: use precomputed stable range if available, else per-subplot
    let yMin: number, yMax: number;
    if (globalYRange && globalYRange[outcome]) {
      yMin = globalYRange[outcome].min;
      yMax = globalYRange[outcome].max;
    } else {
      const td = predictor.getTrainingData(outcome);
      yMin = Math.min(...lower);
      yMax = Math.max(...upper);
      if (td.Y.length > 0) {
        yMin = Math.min(yMin, ...td.Y);
        yMax = Math.max(yMax, ...td.Y);
      }
      const yPad = 0.08 * (yMax - yMin || 1);
      yMin -= yPad;
      yMax += yPad;
    }
    const yRange = yMax - yMin || 1;

    // X-axis scaling: choice uses index-based, continuous uses value-based
    const sx = dimIsChoice
      ? (ci: number): number => margin.left + ((ci + 0.5) / xs.length) * pw
      : (v: number): number => margin.left + ((v - xLo) / (xHi - xLo || 1)) * pw;
    const sy = (v: number): number => margin.top + (1 - (v - yMin) / yRange) * ph;

    const svg = svgEl("svg", { width: W, height: H });
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

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

    // Title
    svg.append(
      Object.assign(
        svgEl("text", {
          x: margin.left + pw / 2,
          y: 16,
          fill: "#555",
          "font-size": 12,
          "text-anchor": "middle",
        }),
        { textContent: names[dim] },
      ),
    );

    if (dimIsChoice) {
      // Discrete: vertical error bars + mean dots
      for (let ci = 0; ci < xs.length; ci++) {
        const cx = sx(ci),
          cyMu = sy(means[ci]);
        const cyUp = sy(upper[ci]),
          cyLo = sy(lower[ci]);
        // Error bar
        svg.append(
          svgEl("line", {
            x1: cx,
            y1: cyUp,
            x2: cx,
            y2: cyLo,
            stroke: "rgba(72,114,249,0.4)",
            "stroke-width": 2,
          }),
        );
        // Caps
        for (const capY of [cyUp, cyLo]) {
          svg.append(
            svgEl("line", {
              x1: cx - 4,
              y1: capY,
              x2: cx + 4,
              y2: capY,
              stroke: "rgba(72,114,249,0.4)",
              "stroke-width": 1.5,
            }),
          );
        }
        // Mean dot
        svg.append(
          svgEl("circle", {
            cx,
            cy: cyMu,
            r: 5,
            fill: "#4872f9",
            stroke: "#444",
            "stroke-width": 1.5,
          }),
        );
      }
    } else {
      // Continuous: CI band + mean line
      let bandD = `M ${sx(xs[0])} ${sy(upper[0])}`;
      for (let i = 1; i < xs.length; i++) {
        bandD += ` L ${sx(xs[i])} ${sy(upper[i])}`;
      }
      for (let i = xs.length - 1; i >= 0; i--) {
        bandD += ` L ${sx(xs[i])} ${sy(lower[i])}`;
      }
      bandD += " Z";
      svg.append(svgEl("path", { d: bandD, fill: "rgba(72,114,249,0.10)" }));

      let lineD = `M ${sx(xs[0])} ${sy(means[0])}`;
      for (let i = 1; i < xs.length; i++) {
        lineD += ` L ${sx(xs[i])} ${sy(means[i])}`;
      }
      svg.append(svgEl("path", { d: lineD, stroke: "#4872f9", "stroke-width": 2, fill: "none" }));
    }

    // Training data dots
    const td = predictor.getTrainingData(outcome);
    const tdY = relativeActive ? td.Y.map((y) => naiveRelPct(y, sqStat.mean)) : td.Y;
    const sliceDots: Array<DotInfo> = [];
    if (td.X.length > 0) {
      for (let i = 0; i < td.X.length; i++) {
        let ptScreenX: number;
        if (dimIsChoice) {
          let ci = xs.indexOf(td.X[i][dim]);
          if (ci < 0) {
            ci = 0;
            let bestD = Infinity;
            for (let cj = 0; cj < xs.length; cj++) {
              const cd = Math.abs(xs[cj] - td.X[i][dim]);
              if (cd < bestD) {
                bestD = cd;
                ci = cj;
              }
            }
          }
          ptScreenX = sx(ci);
        } else {
          ptScreenX = sx(td.X[i][dim]);
        }
        const ptScreenY = sy(tdY[i]);
        if (ptScreenY >= margin.top && ptScreenY <= H - margin.bottom) {
          const dot = svgEl("circle", {
            cx: ptScreenX,
            cy: ptScreenY,
            r: 3,
            fill: "rgba(217,95,78,0.9)",
            stroke: "rgba(68,68,68,0.35)",
            "stroke-width": 1,
          });
          svg.append(dot);
          sliceDots.push({
            cx: ptScreenX,
            cy: ptScreenY,
            idx: i,
            pt: td.X[i],
            el: dot,
            defaultFill: "rgba(217,95,78,0.9)",
            defaultStroke: "rgba(68,68,68,0.35)",
            defaultR: 3,
          });
        }
      }
    }
    allSubplotDots.push(sliceDots);

    // Y-axis ticks + grid
    const nYTicks = 4;
    // Collect tick values, then add 0% if relative and not already present
    const tickVals: Array<number> = [];
    for (let t = 0; t <= nYTicks; t++) {
      tickVals.push(yMin + (yRange * t) / nYTicks);
    }
    if (
      relativeActive &&
      yMin <= 0 &&
      yMax >= 0 &&
      !tickVals.some((v) => Math.abs(v) < yRange * 0.01)
    ) {
      tickVals.push(0);
      tickVals.sort((a, b) => a - b);
    }
    for (const v of tickVals) {
      const yp = sy(v);
      const isZeroLine = relativeActive && Math.abs(v) < 1e-10;
      svg.append(
        svgEl("line", {
          x1: margin.left,
          x2: margin.left + pw,
          y1: yp,
          y2: yp,
          stroke: isZeroLine ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)",
          "stroke-width": isZeroLine ? 1 : 1,
          ...(isZeroLine ? { "stroke-dasharray": "4,3" } : {}),
        }),
      );
      const label = relativeActive ? formatPct(v) : v.toFixed(2);
      svg.append(
        Object.assign(
          svgEl("text", {
            x: margin.left - 6,
            y: yp + 4,
            "font-size": 10,
            "text-anchor": "end",
            fill: isZeroLine ? "#555" : "#999",
            "font-weight": isZeroLine ? "600" : "400",
          }),
          { textContent: label },
        ),
      );
    }

    // X-axis ticks
    if (dimIsChoice) {
      for (let ci = 0; ci < xs.length; ci++) {
        svg.append(
          Object.assign(
            svgEl("text", {
              x: sx(ci),
              y: H - margin.bottom + 16,
              fill: "#999",
              "font-size": 10,
              "text-anchor": "middle",
            }),
            { textContent: String(p.values![ci]) },
          ),
        );
      }
    } else {
      const nXTicks = dimIsInt ? Math.min(xs.length - 1, 4) : 4;
      for (let t = 0; t <= nXTicks; t++) {
        let xv = xLo + ((xHi - xLo) * t) / nXTicks;
        if (dimIsInt) {
          xv = Math.round(xv);
        }
        svg.append(
          Object.assign(
            svgEl("text", {
              x: sx(xv),
              y: H - margin.bottom + 16,
              fill: "#999",
              "font-size": 10,
              "text-anchor": "middle",
            }),
            { textContent: dimIsInt ? String(xv) : xv.toFixed(2) },
          ),
        );
      }
    }

    // X-axis label
    svg.append(
      Object.assign(
        svgEl("text", {
          x: margin.left + pw / 2,
          y: H - 4,
          fill: "#999",
          "font-size": 11,
          "text-anchor": "middle",
        }),
        { textContent: names[dim] },
      ),
    );

    // Hover line + dot on mean curve (hidden by default)
    const hoverLine = svgEl("line", {
      y1: margin.top,
      y2: margin.top + ph,
      stroke: "rgba(0,0,0,0.10)",
      "stroke-width": 1,
      "stroke-dasharray": "4,3",
    });
    (hoverLine as unknown as HTMLElement).style.display = "none";
    svg.append(hoverLine);
    const hoverDot = svgEl("circle", {
      r: 4,
      fill: "#4872f9",
      stroke: "#444",
      "stroke-width": 1.5,
    });
    (hoverDot as unknown as HTMLElement).style.display = "none";
    svg.append(hoverDot);

    // Restore highlight after re-render if a point was pinned
    if (_getPinned() >= 0) {
      const pvIdx = sliceDots.findIndex((d) => d.idx === _getPinned());
      if (pvIdx !== -1) {
        applyDotHighlight(
          sliceDots,
          pvIdx,
          computeKernelRels(predictor, sliceDots, pvIdx, outcome),
        );
      }
    } else if (pinnedCurvePoint) {
      // Restore curve-pin NN highlighting + blue dot
      const rels = computeKernelRelsFromPoint(
        predictor,
        sliceDots,
        pinnedCurvePoint,
        outcome,
      );
      applyDotHighlightFromPoint(sliceDots, rels);
      // Show the hover dot on the subplot whose dimension matches the pinned x value
      const pinnedXVal = pinnedCurvePoint[dim];
      if (pinnedXVal !== fixedValues[dim] || dimOrder.length === 1) {
        // This subplot's dim was the one clicked (its value differs from fixedValues)
        const screenX = dimIsChoice
          ? sx(xs.indexOf(pinnedXVal))
          : sx(pinnedXVal);
        const pinnedIdx = dimIsChoice
          ? xs.indexOf(pinnedXVal)
          : Math.round(((pinnedXVal - xLo) / (xHi - xLo)) * (xs.length - 1));
        const clampedIdx = Math.max(0, Math.min(xs.length - 1, pinnedIdx));
        hoverDot.setAttribute("cx", String(screenX));
        hoverDot.setAttribute("cy", String(sy(means[clampedIdx])));
        (hoverDot as unknown as HTMLElement).style.display = "";
        hoverLine.setAttribute("x1", String(screenX));
        hoverLine.setAttribute("x2", String(screenX));
        (hoverLine as unknown as HTMLElement).style.display = "";
      }
    }

    // Interactivity
    if (tooltip) {
      const HOVER_R = 10;

      function findHit(px: number, py: number): number {
        for (let pi = 0; pi < sliceDots.length; pi++) {
          const dx = px - sliceDots[pi].cx,
            dy = py - sliceDots[pi].cy;
          if (dx * dx + dy * dy < HOVER_R * HOVER_R) {
            return pi;
          }
        }
        return -1;
      }

      let hoverHighlight = false;
      let hoverCurveIdx = -1; // index into xs[] when hovering the mean curve

      // Restore pinned highlighting across all subplots (or clear if unpinned)
      function restorePinnedOrClear(): void {
        const pinnedIdx = _getPinned();
        for (const subDots of allSubplotDots) {
          if (pinnedIdx < 0) {
            clearDotHighlight(subDots);
          } else {
            const subActiveIdx = subDots.findIndex((d) => d.idx === pinnedIdx);
            if (subActiveIdx === -1) {
              clearDotHighlight(subDots);
            } else {
              applyDotHighlight(
                subDots,
                subActiveIdx,
                computeKernelRels(predictor, subDots, subActiveIdx, outcome),
              );
            }
          }
        }
      }

      svg.addEventListener("mousemove", (e: MouseEvent) => {
        const rect = svg.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        if (px < margin.left || px > margin.left + pw) {
          (hoverLine as unknown as HTMLElement).style.display = "none";
          (hoverDot as unknown as HTMLElement).style.display = "none";
          tooltip.style.display = "none";
          return;
        }

        const hitVpIdx = findHit(px, py);

        if (hitVpIdx >= 0) {
          // ── Training dot hover ──
          hoverCurveIdx = -1;
          onHoverDimClear?.();
          const hitPt = sliceDots[hitVpIdx];
          (hoverLine as unknown as HTMLElement).style.display = "none";
          (hoverDot as unknown as HTMLElement).style.display = "none";
          svg.style.cursor = "pointer";

          // NN highlight across ALL subplots (always, even when pinned)
          for (const subDots of allSubplotDots) {
            const subActiveIdx = subDots.findIndex((d) => d.idx === hitPt.idx);
            if (subActiveIdx !== -1) {
              applyDotHighlight(
                subDots,
                subActiveIdx,
                computeKernelRels(predictor, subDots, subActiveIdx, outcome),
              );
            }
          }
          hoverHighlight = true;

          // Compact tooltip: trial # + outcome value
          const yVal = relativeActive
            ? formatPct(tdY[hitPt.idx])
            : td.Y[hitPt.idx].toFixed(4);
          tooltip.innerHTML =
            `<span style="color:#999">trial ${hitPt.idx + 1}</span> ` +
            `<span style="color:#333;font-weight:500">${outcome} = ${yVal}</span>`;
          tooltip.style.display = "block";
          positionTooltip(tooltip, e.clientX, e.clientY);
        } else {
          // ── Mean curve hover ──
          svg.style.cursor = "crosshair";

          // Hover line + dot on mean curve
          const frac = (px - margin.left) / pw;
          let idx: number;
          if (dimIsChoice) {
            idx = Math.floor(frac * xs.length);
            idx = Math.max(0, Math.min(xs.length - 1, idx));
          } else {
            idx = Math.round(frac * (xs.length - 1));
            idx = Math.max(0, Math.min(xs.length - 1, idx));
          }
          hoverCurveIdx = idx;
          onHoverDim?.(dim, xs[idx]);
          const mu = means[idx],
            s = stds[idx];
          const screenX = dimIsChoice ? sx(idx) : sx(xs[idx]);

          hoverLine.setAttribute("x1", String(screenX));
          hoverLine.setAttribute("x2", String(screenX));
          (hoverLine as unknown as HTMLElement).style.display = "";
          hoverDot.setAttribute("cx", String(screenX));
          hoverDot.setAttribute("cy", String(sy(mu)));
          (hoverDot as unknown as HTMLElement).style.display = "";

          // NN highlight from the hovered curve point across ALL subplots
          const hoverPt = fixedValues.slice();
          hoverPt[dim] = xs[idx];
          for (const subDots of allSubplotDots) {
            const rels = computeKernelRelsFromPoint(
              predictor,
              subDots,
              hoverPt,
              outcome,
            );
            applyDotHighlightFromPoint(subDots, rels);
          }
          hoverHighlight = true;

          // Compact two-line tooltip
          const xLabel = dimIsChoice ? String(p.values![idx]) : formatParamValue(xs[idx], p);
          const ci = 1.96 * s;
          let html = `<span style="color:#666">${names[dim]}</span> = ${xLabel}<br>`;
          if (relativeActive) {
            html += `<span style="color:#4872f9;font-weight:500">${outcome} = ${formatPct(mu)} \u00B1 ${formatPct(ci)}</span>`;
          } else {
            html += `<span style="color:#4872f9;font-weight:500">${outcome} = ${mu.toFixed(4)} \u00B1 ${ci.toFixed(4)}</span>`;
          }
          tooltip.innerHTML = html;
          tooltip.style.display = "block";
          positionTooltip(tooltip, e.clientX, e.clientY);
        }
      });

      svg.addEventListener("click", (e: MouseEvent) => {
        const rect = svg.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const hitVpIdx = findHit(px, py);

        if (hitVpIdx >= 0) {
          // Clicking a training dot: clear any curve pin
          setPinnedCurvePoint?.(null);
          const hitTrainIdx = sliceDots[hitVpIdx].idx;
          if (_getPinned() === hitTrainIdx) {
            _setPinned(-1);
          } else {
            _setPinned(hitTrainIdx);
            if (onSnapToPoint) {
              onSnapToPoint(sliceDots[hitVpIdx].pt);
              return; // onSnapToPoint triggers full redraw
            }
          }
        } else {
          if (_getPinned() >= 0) {
            _setPinned(-1);
          }
          // Pivot: click on the mean curve pins the point and snaps sliders
          if (hoverCurveIdx >= 0 && onSnapToPoint) {
            const pivotPt = fixedValues.slice();
            pivotPt[dim] = xs[hoverCurveIdx];
            setPinnedCurvePoint?.(pivotPt);
            onSnapToPoint(pivotPt);
            return; // onSnapToPoint triggers full redraw
          }
        }
        hoverHighlight = false;
        restorePinnedOrClear();
      });

      svg.addEventListener("mouseleave", () => {
        (hoverLine as unknown as HTMLElement).style.display = "none";
        (hoverDot as unknown as HTMLElement).style.display = "none";
        svg.style.cursor = "crosshair";
        tooltip.style.display = "none";
        onHoverDimClear?.();
        if (hoverHighlight) {
          restorePinnedOrClear();
          hoverHighlight = false;
        }
      });
    }

    target.append(svg);
  }
}
