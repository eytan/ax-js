// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor, ResponseSurfaceOptions, DimensionRanker } from "../types";

import { viridis, plasma, piYG } from "../colormaps";
import { buildPointTooltipHtml } from "../dots";
import { estimateRange } from "../estimateRange";
import { isChoice, defaultParamValue, formatParamValue, computeDimOrder, getParamSpecs } from "../params";
import { deltaRelativize, formatPct, resolveStatusQuo } from "../relativize";
import { injectScopedStyles, CTRL_CSS } from "../styles";
import {
  createOutcomeSelector,
  createParamSliders,
  createTooltipDiv,
  positionTooltip,
  removeTooltip,
  makeSelectEl,
} from "../widgets";

type ColorFn = (t: number) => [number, number, number];

/**
 * Render side-by-side posterior mean + predictive std heatmaps.
 *
 * Interactive mode: outcome selector, axis selectors with collision guard,
 * parameter sliders, click-to-pin with slider snapping.
 */
/** Controller for programmatic interaction with an interactive response surface. */
export interface ResponseSurfaceController {
  setRelative(relative: boolean): void;
  setOutcome(name: string): void;
  destroy(): void;
}

export function renderResponseSurface(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: ResponseSurfaceOptions,
): ResponseSurfaceController {
  const interactive = options?.interactive !== false;

  if (!interactive) {
    renderResponseSurfaceStatic(
      container,
      predictor,
      options?.outcome ?? predictor.outcomeNames[0],
      options?.dimX ?? 0,
      options?.dimY ?? Math.min(1, predictor.paramNames.length - 1),
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
  const initOrder = computeDimOrder(
    predictor as DimensionRanker,
    predictor.paramNames.length,
    selectedOutcome,
  );
  const rangeDims = initOrder.filter((d) => !isChoice(params[d]));
  let selDimX = options?.dimX ?? rangeDims[0] ?? 0;
  let selDimY = options?.dimY ?? (rangeDims.length > 1 ? rangeDims[1] : 0);
  const fixedValues: Array<number | string | boolean> =
    options?.fixedValues?.slice() ?? params.map((p) => defaultParamValue(p));
  let isRelative = options?.relative === true;
  const statusQuoPoint = options?.statusQuoPoint ?? predictor.statusQuoPoint ?? null;
  const tooltip = createTooltipDiv(container.id);

  // Pre-compute stable colorscale range across all slider positions
  const globalRangeData = estimateRange(predictor);

  // Layout: outcome selector on top, then plots, then axis selectors + sliders below
  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS + "padding:8px 16px;";
  const plotsDiv = document.createElement("div");
  plotsDiv.style.cssText = "padding:4px 8px 12px;";
  const axisDiv = document.createElement("div");
  axisDiv.style.cssText = CTRL_CSS + "padding:4px 16px 0;";
  const slidersDiv = document.createElement("div");
  slidersDiv.style.cssText = "margin-bottom:8px;padding:0 16px;";
  container.append(controlsDiv);
  container.append(plotsDiv);
  container.append(axisDiv);
  container.append(slidersDiv);

  // Outcome selector (top)
  if (predictor.outcomeNames.length > 1) {
    const { wrapper, select } = makeSelectEl("Outcome:");
    createOutcomeSelector(predictor, select, (name) => {
      selectedOutcome = name;
      redraw();
    });
    controlsDiv.append(wrapper);
  }

  // Axis selectors (below plot, above sliders) with collision guard

  const axisSelects: { x?: HTMLSelectElement; y?: HTMLSelectElement } = {};
  function makeDimSelect(
    label: string,
    initial: number,
    onChange: (idx: number) => void,
  ): HTMLSelectElement {
    const { wrapper, select } = makeSelectEl(label);
    predictor.paramNames.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = name;
      if (i === initial) {
        opt.selected = true;
      }
      select.append(opt);
    });
    select.addEventListener("change", () => {
      onChange(+select.value);
      redraw();
    });
    axisDiv.append(wrapper);
    return select;
  }
  const xSelect = makeDimSelect("X axis:", selDimX, (v) => {
    selDimX = v;
    if (selDimX === selDimY) {
      selDimY = (selDimX + 1) % params.length;
      axisSelects.y!.value = String(selDimY);
    }
    rebuildSliders();
  });
  xSelect.setAttribute("data-axis", "x");
  axisSelects.x = xSelect;
  const ySelect = makeDimSelect("Y axis:", selDimY, (v) => {
    selDimY = v;
    if (selDimX === selDimY) {
      selDimX = (selDimY + 1) % params.length;
      axisSelects.x!.value = String(selDimX);
    }
    rebuildSliders();
  });
  ySelect.setAttribute("data-axis", "y");
  axisSelects.y = ySelect;

  // Pinned state persists across re-renders
  let rsPinnedIdx = -1;

  function rebuildSliders(): void {
    const dimOrd = computeDimOrder(
      predictor as DimensionRanker,
      predictor.paramNames.length,
      selectedOutcome,
    );
    createParamSliders(
      predictor,
      params,
      slidersDiv,
      fixedValues,
      () => {
        redraw();
      },
      { excludeDims: new Set([selDimX, selDimY]), dimOrder: dimOrd },
    );
  }
  rebuildSliders();

  function redraw(): void {
    plotsDiv.innerHTML = "";
    // Build stable colorscale range for the selected outcome
    const er = globalRangeData[selectedOutcome];
    let range: { meanMin: number; meanMax: number; stdMin: number; stdMax: number } | undefined;
    if (er) {
      if (isRelative) {
        // For relative mode: predict at SQ, then relativize the global range
        const sq = statusQuoPoint;
        if (sq) {
          const sqPred = predictor.predict([sq])[selectedOutcome];
          if (sqPred && Math.abs(sqPred.mean[0]) >= 1e-15) {
            const sqM = sqPred.mean[0];
            const sqS = Math.sqrt(sqPred.variance[0]);
            const [relMin] = deltaRelativize(er.muMin, 0, sqM, sqS);
            const [relMax] = deltaRelativize(er.muMax, 0, sqM, sqS);
            const relStdMin = (er.stdMin / Math.abs(sqM)) * 100;
            const relStdMax = (er.stdMax / Math.abs(sqM)) * 100;
            const maxAbs = Math.max(Math.abs(relMin), Math.abs(relMax));
            range = { meanMin: -maxAbs, meanMax: maxAbs, stdMin: relStdMin, stdMax: relStdMax };
          }
        }
      } else {
        range = { meanMin: er.muMin, meanMax: er.muMax, stdMin: er.stdMin, stdMax: er.stdMax };
      }
    }
    const effectiveOptions = isRelative !== (options?.relative ?? false)
      ? { ...options, relative: isRelative }
      : options;
    renderResponseSurfaceStatic(
      plotsDiv,
      predictor,
      selectedOutcome,
      selDimX,
      selDimY,
      effectiveOptions,
      fixedValues as Array<number>,
      tooltip,
      container,
      (pt: Array<number>) => {
        for (let j = 0; j < fixedValues.length; j++) {
          fixedValues[j] = pt[j];
        }
        rebuildSliders();
        redraw();
      },
      () => rsPinnedIdx,
      (v: number) => {
        rsPinnedIdx = v;
      },
      range,
    );
  }
  redraw();

  return {
    setRelative(relative: boolean) {
      if (relative === isRelative) return;
      isRelative = relative;
      redraw();
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

// ── Shared panel rendering ───────────────────────────────────────────────

interface CanvasDot {
  px: number;
  py: number;
  idx: number;
  pt: Array<number>;
  alpha: number;
}

/** Draw a vertical colorbar on a canvas context with top, bottom, and center tick labels. */
function drawVerticalColorbar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  vMin: number,
  vMax: number,
  colorFn: ColorFn,
  formatLabel?: (v: number) => string,
  isRelative?: boolean,
): void {
  for (let i = 0; i < h; i++) {
    const t = 1 - i / h; // top = max, bottom = min
    const rgb = colorFn(t);
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(x, y + i, w, 1);
  }
  const fmt = formatLabel ?? ((v: number) => v.toFixed(2));
  ctx.font = "9px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.textAlign = "left";

  // Top label (max)
  ctx.fillText(fmt(vMax), x + w + 3, y + 8);
  // Bottom label (min)
  ctx.fillText(fmt(vMin), x + w + 3, y + h);

  // Center tick — always show
  const vCenter = (vMin + vMax) / 2;
  const centerY = y + h / 2;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, centerY, w, 1); // thin tick line
  ctx.fillStyle = "rgba(0,0,0,0.50)";
  ctx.fillText(fmt(vCenter), x + w + 3, centerY + 3);

  // For relative mode: add 0% tick if it's within range and not at center
  if (isRelative && vMin < 0 && vMax > 0) {
    const range = vMax - vMin;
    const zeroFrac = (vMax - 0) / range; // fraction from top
    const zeroY = y + zeroFrac * h;
    // Only draw if not too close to center or edges (>10% away)
    if (Math.abs(zeroFrac - 0.5) > 0.1 && zeroFrac > 0.08 && zeroFrac < 0.92) {
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, zeroY);
      ctx.lineTo(x + w, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("0%", x + w + 3, zeroY + 3);
      ctx.font = "9px -apple-system, BlinkMacSystemFont, sans-serif";
    }
  }
}

/** Draw axis ticks and labels on a canvas. */
function drawAxes(
  ctx: CanvasRenderingContext2D,
  ML: number,
  MT: number,
  N: number,
  xlo: number,
  xhi: number,
  ylo: number,
  yhi: number,
  xName: string,
  yName: string,
  showYAxis: boolean,
  xLabels?: Array<string>,
  yLabels?: Array<string>,
): void {
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;

  // X-axis ticks
  ctx.textAlign = "center";
  if (xLabels) {
    // Categorical: centered labels per category
    for (let ci = 0; ci < xLabels.length; ci++) {
      const tx = ML + ((ci + 0.5) / xLabels.length) * N;
      ctx.beginPath();
      ctx.moveTo(tx, MT + N);
      ctx.lineTo(tx, MT + N + 4);
      ctx.stroke();
      ctx.fillText(xLabels[ci], tx, MT + N + 15);
    }
  } else {
    const nTicks = 4;
    for (let ti = 0; ti <= nTicks; ti++) {
      const v = xlo + ((xhi - xlo) * ti) / nTicks;
      const tx = ML + (ti * N) / nTicks;
      ctx.beginPath();
      ctx.moveTo(tx, MT + N);
      ctx.lineTo(tx, MT + N + 4);
      ctx.stroke();
      ctx.fillText(v.toFixed(2), tx, MT + N + 15);
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(xName, ML + N / 2, MT + N + 30);

  if (!showYAxis) {
    return;
  }

  // Y-axis ticks
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "right";
  if (yLabels) {
    // Categorical: centered labels per category (yVals is already reversed for canvas)
    for (let ci = 0; ci < yLabels.length; ci++) {
      const ty = MT + ((ci + 0.5) / yLabels.length) * N;
      ctx.beginPath();
      ctx.moveTo(ML - 4, ty);
      ctx.lineTo(ML, ty);
      ctx.stroke();
      ctx.fillText(yLabels[ci], ML - 6, ty + 3);
    }
  } else {
    const nTicks = 4;
    for (let ti = 0; ti <= nTicks; ti++) {
      const v = ylo + ((yhi - ylo) * ti) / nTicks;
      const ty = MT + (1 - ti / nTicks) * N;
      ctx.beginPath();
      ctx.moveTo(ML - 4, ty);
      ctx.lineTo(ML, ty);
      ctx.stroke();
      ctx.fillText(v.toFixed(2), ML - 6, ty + 3);
    }
  }
  ctx.save();
  ctx.translate(12, MT + N / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(yName, 0, 0);
  ctx.restore();
}

/** Draw training dots on a canvas. */
function drawDots(ctx: CanvasRenderingContext2D, dots: Array<CanvasDot>, pinnedIdx: number): void {
  for (const d of dots) {
    const isActive = d.idx === pinnedIdx;
    const outerR = isActive ? 8 : 6;
    const innerR = isActive ? 4.5 : 3.5;
    ctx.beginPath();
    ctx.arc(d.px, d.py, outerR, 0, 2 * Math.PI);
    ctx.strokeStyle = isActive
      ? "rgba(68,68,68,1)"
      : `rgba(68,68,68,${Math.max(0.15, d.alpha * 0.7).toFixed(3)})`;
    ctx.lineWidth = isActive ? 2.5 : 1.5;
    ctx.stroke();
    if (d.alpha >= 0.04) {
      ctx.beginPath();
      ctx.arc(d.px, d.py, innerR, 0, 2 * Math.PI);
      ctx.fillStyle = isActive ? "rgba(217,95,78,1)" : `rgba(217,95,78,${d.alpha.toFixed(3)})`;
      ctx.fill();
    }
  }
}

// ── Static renderer ──────────────────────────────────────────────────────

function renderResponseSurfaceStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  dimX: number,
  dimY: number,
  options?: ResponseSurfaceOptions,
  fixedValuesOverride?: Array<number>,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
  onSnapToPoint?: (pt: Array<number>) => void,
  getPinnedIdx?: () => number,
  setPinnedIdx?: (v: number) => void,
  globalRange?: { meanMin: number; meanMax: number; stdMin: number; stdMax: number },
): void {
  const gridSize = options?.gridSize ?? 80;
  const bounds = predictor.paramBounds;
  const names = predictor.paramNames;
  const params = getParamSpecs(predictor);
  const fixedValues =
    fixedValuesOverride?.slice() ??
    options?.fixedValues?.slice() ??
    params.map((p) => defaultParamValue(p));

  const ML = 48;
  const MT = 18; // room for panel title
  const MB = 38;
  const CB_W = 14; // colorbar width
  const CB_GAP = 4; // gap between heatmap and colorbar
  const CB_LBL = options?.relative ? 52 : 36; // wider for % labels
  const MR = CB_GAP + CB_W + CB_LBL;
  // Width/height are for the total area; each panel gets half the width
  const totalW = options?.width ?? 800;
  const panelW = Math.floor((totalW - 12) / 2); // 12px gap between panels
  const defaultH = options?.height ?? 380;
  // Second panel omits Y-axis, so its ML is smaller
  const ML2 = 10;
  const N = Math.min(panelW - ML - MR, defaultH - MT - MB);
  const CH = N + MT + MB;

  const [xlo, xhi] = bounds[dimX];
  const [ylo, yhi] = bounds[dimY];
  const xIsChoice = isChoice(params[dimX]);
  const yIsChoice = isChoice(params[dimY]);

  // Build axis value arrays — categorical uses discrete values, range uses continuous sweep
  const xVals: Array<number> = xIsChoice
    ? params[dimX].values!.map(Number)
    : Array.from({ length: gridSize }, (_, i) => xlo + ((xhi - xlo) * i) / (gridSize - 1));
  const yVals: Array<number> = yIsChoice
    ? params[dimY].values!.map(Number).reverse() // top = last, bottom = first (reversed for canvas)
    : Array.from({ length: gridSize }, (_, j) => yhi - ((yhi - ylo) * j) / (gridSize - 1));
  const nColsX = xVals.length;
  const nColsY = yVals.length;

  // Build grid points (shared for both panels)
  const testPoints: Array<Array<number>> = [];
  for (let gj = 0; gj < nColsY; gj++) {
    for (let gi = 0; gi < nColsX; gi++) {
      const pt = fixedValues.slice() as Array<number>;
      pt[dimX] = xVals[gi];
      pt[dimY] = yVals[gj];
      testPoints.push(pt);
    }
  }

  const pred = predictor.predict(testPoints)[outcome];
  if (!pred) {
    target.textContent = "No prediction data for outcome: " + outcome;
    return;
  }

  const rawMeans = Array.from(pred.mean);
  const rawStds = rawMeans.map((_, i) => Math.sqrt(pred.variance[i]));

  // Relative mode: compute % change vs status quo using delta method
  const isRelative = options?.relative === true;
  let sqMean = 0;
  let sqStd = 0;
  let relativeActive = false;
  if (isRelative) {
    const sq = resolveStatusQuo(predictor, options);
    if (sq) {
      const sqPred = predictor.predict([sq])[outcome];
      if (sqPred) {
        sqMean = sqPred.mean[0];
        sqStd = Math.sqrt(sqPred.variance[0]);
        if (Math.abs(sqMean) >= 1e-15) {
          relativeActive = true;
        } else {
          console.warn("ax-js: status quo mean ≈ 0; falling back to absolute mode");
        }
      }
    }
  }

  let means: Array<number>;
  let stds: Array<number>;
  if (relativeActive) {
    means = [];
    stds = [];
    for (let i = 0; i < rawMeans.length; i++) {
      const [rm, rs] = deltaRelativize(rawMeans[i], rawStds[i], sqMean, sqStd);
      means.push(rm);
      stds.push(rs);
    }
  } else {
    means = rawMeans;
    stds = rawStds;
  }

  let meanMin: number, meanMax: number;
  if (globalRange) {
    meanMin = globalRange.meanMin;
    meanMax = globalRange.meanMax;
  } else if (relativeActive) {
    const maxAbs = Math.max(Math.abs(Math.min(...means)), Math.abs(Math.max(...means)));
    meanMin = -maxAbs;
    meanMax = maxAbs;
  } else {
    meanMin = Math.min(...means);
    meanMax = Math.max(...means);
  }
  const stdMin = globalRange?.stdMin ?? Math.min(...stds);
  const stdMax = globalRange?.stdMax ?? Math.max(...stds);

  // Training dot data (positions computed per-panel since ML differs)
  const td = predictor.getTrainingData(outcome);
  const xRange = xhi - xlo || 1;
  const yRange = yhi - ylo || 1;
  // Normalized positions (0-1) — actual px computed per panel
  // Categorical axes use index-based centering: (idx + 0.5) / nCols
  function normX(val: number): number {
    if (xIsChoice) {
      const idx = xVals.indexOf(val);
      return idx === -1 ? 0 : (idx + 0.5) / nColsX;
    }
    return (val - xlo) / xRange;
  }
  function normY(val: number): number {
    if (yIsChoice) {
      const idx = yVals.indexOf(val);
      return idx === -1 ? 0 : (idx + 0.5) / nColsY;
    }
    return 1 - (val - ylo) / yRange;
  }
  interface DotData {
    normXv: number;
    normYv: number;
    idx: number;
    pt: Array<number>;
    alpha: number;
  }
  const dotData: Array<DotData> = [];
  if (td.X.length > 0) {
    for (let i = 0; i < td.X.length; i++) {
      dotData.push({
        normXv: normX(td.X[i][dimX]),
        normYv: normY(td.X[i][dimY]),
        idx: i,
        pt: td.X[i],
        alpha: 0.85,
      });
    }
  }

  // Pinned state
  let localPinnedIdx = -1;
  const _getPinned = getPinnedIdx ?? (() => localPinnedIdx);
  const _setPinned =
    setPinnedIdx ??
    ((v: number) => {
      localPinnedIdx = v;
    });

  // Build heatmap ImageData for both panels
  function buildHeatmap(
    values: Array<number>,
    vMin: number,
    vMax: number,
    colorFn: ColorFn,
  ): ImageData {
    const img = new ImageData(N, N);
    const range = vMax - vMin || 1;
    const cellW = N / nColsX;
    const cellH = N / nColsY;
    for (let k = 0; k < values.length; k++) {
      const gi = k % nColsX;
      const gj = Math.floor(k / nColsX);
      const t = Math.max(0, Math.min(1, (values[k] - vMin) / range));
      const rgb = colorFn(t);
      const x0 = Math.round(gi * cellW);
      const y0 = Math.round(gj * cellH);
      const x1 = Math.round((gi + 1) * cellW);
      const y1 = Math.round((gj + 1) * cellH);
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const idx = (py * N + px) * 4;
          img.data[idx] = rgb[0];
          img.data[idx + 1] = rgb[1];
          img.data[idx + 2] = rgb[2];
          img.data[idx + 3] = 255;
        }
      }
    }
    return img;
  }

  const meanColorFn = relativeActive ? piYG : viridis;
  const meanImg = buildHeatmap(means, meanMin, meanMax, meanColorFn);
  const stdImg = buildHeatmap(stds, stdMin, stdMax, plasma);

  const meanFmtLabel = relativeActive ? formatPct : undefined;

  // Panel layout: side-by-side
  const panels = [
    {
      title: relativeActive ? "% change vs control" : "posterior mean",
      img: meanImg,
      colorFn: meanColorFn as ColorFn,
      vMin: meanMin,
      vMax: meanMax,
      values: means,
      formatLabel: meanFmtLabel,
      isRelative: relativeActive,
    },
    {
      title: "predictive std",
      img: stdImg,
      colorFn: plasma as ColorFn,
      vMin: stdMin,
      vMax: stdMax,
      values: stds,
      formatLabel: relativeActive ? (v: number) => v.toFixed(1) + "%" : undefined,
      isRelative: false,
    },
  ];

  const panelWrap = document.createElement("div");
  panelWrap.style.cssText = "display:flex;gap:12px";

  const canvasRefs: Array<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    img: ImageData;
    ml: number;
    panelIdx: number;
  }> = [];

  for (let pi = 0; pi < panels.length; pi++) {
    const panel = panels[pi];
    const isFirst = pi === 0;
    const pML = isFirst ? ML : ML2;
    const pCW = N + pML + MR;

    const canvas = document.createElement("canvas");
    canvas.width = pCW;
    canvas.height = CH;
    canvas.style.display = "block";
    canvas.style.cursor = "crosshair";
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      continue;
    }

    // Panel title
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.textAlign = "center";
    ctx.fillText(panel.title, pML + N / 2, 12);

    // Heatmap
    ctx.putImageData(panel.img, pML, MT);

    // Vertical colorbar
    drawVerticalColorbar(
      ctx,
      pML + N + CB_GAP,
      MT,
      CB_W,
      N,
      panel.vMin,
      panel.vMax,
      panel.colorFn,
      panel.formatLabel,
      panel.isRelative,
    );

    // Axes (Y-axis only on first panel)
    const xLabels = xIsChoice ? params[dimX].values!.map(String) : undefined;
    // yVals is reversed for canvas, so labels match that order
    const yLabels = yIsChoice ? params[dimY].values!.map(String).reverse() : undefined;
    drawAxes(
      ctx,
      pML,
      MT,
      N,
      xlo,
      xhi,
      ylo,
      yhi,
      names[dimX],
      names[dimY],
      isFirst,
      xLabels,
      yLabels,
    );

    canvasRefs.push({ canvas, ctx, img: panel.img, ml: pML, panelIdx: pi });

    const col = document.createElement("div");
    col.append(canvas);
    panelWrap.append(col);
  }

  // Function to redraw all dots across both panels
  function redrawAllDots(): void {
    for (const ref of canvasRefs) {
      ref.ctx.putImageData(ref.img, ref.ml, MT);
      // Compute per-panel dot positions
      const panelDots: Array<CanvasDot> = dotData.map((d) => ({
        px: ref.ml + d.normXv * N,
        py: MT + d.normYv * N,
        idx: d.idx,
        pt: d.pt,
        alpha: d.alpha,
      }));
      drawDots(ref.ctx, panelDots, _getPinned());
    }
  }

  function applyCanvasHighlight(activeIdx: number): void {
    const rels = { raw: [] as Array<number>, max: 0 };
    for (let i = 0; i < dotData.length; i++) {
      if (i === activeIdx) {
        rels.raw.push(1);
        continue;
      }
      const r = predictor.kernelCorrelation(dotData[i].pt, dotData[activeIdx].pt, outcome);
      rels.raw.push(r);
      if (r > rels.max) {
        rels.max = r;
      }
    }
    for (let i = 0; i < dotData.length; i++) {
      if (i === activeIdx) {
        dotData[i].alpha = 1;
        continue;
      }
      const relNorm = rels.max > 0 ? rels.raw[i] / rels.max : 0;
      dotData[i].alpha = Math.max(0.08, Math.sqrt(relNorm));
    }
  }

  function clearCanvasHighlight(): void {
    for (const d of dotData) {
      d.alpha = 0.85;
    }
  }

  // Restore pinned highlight
  if (_getPinned() >= 0) {
    const pvIdx = dotData.findIndex((d) => d.idx === _getPinned());
    if (pvIdx !== -1) {
      applyCanvasHighlight(pvIdx);
    }
  }

  redrawAllDots();

  // Attach interactivity to both canvases
  if (tooltip && tooltipContainer) {
    let hoverHighlight = false;
    let pinnedDotDataIdx = -1;

    for (const ref of canvasRefs) {
      const rml = ref.ml;

      function findHit(mx: number, my: number): number {
        let best = -1,
          bestD = 144;
        for (let i = 0; i < dotData.length; i++) {
          const dpx = rml + dotData[i].normXv * N;
          const dpy = MT + dotData[i].normYv * N;
          const dx = mx - dpx,
            dy = my - dpy;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) {
            bestD = d2;
            best = i;
          }
        }
        return best;
      }

      ref.canvas.addEventListener("mousemove", (e: MouseEvent) => {
        const cRect = ref.canvas.getBoundingClientRect();
        const mx = e.clientX - cRect.left;
        const my = e.clientY - cRect.top;

        // Colorbar hover: show value at cursor position on the gradient
        const cbX0 = rml + N + CB_GAP;
        const cbX1 = cbX0 + CB_W + CB_LBL;
        if (mx >= cbX0 && mx <= cbX1 && my >= MT && my <= MT + N) {
          ref.canvas.style.cursor = "default";
          const frac = 1 - (my - MT) / N; // 0=bottom(min), 1=top(max)
          const panel = panels[ref.panelIdx];
          const val = panel.vMin + frac * (panel.vMax - panel.vMin);
          const fmt = panel.formatLabel ?? ((v: number) => v.toFixed(4));
          tooltip.innerHTML = `<span style="color:#333;font-weight:500">${fmt(val)}</span>`;
          tooltip.style.display = "block";
          positionTooltip(tooltip, e.clientX, e.clientY);
          return;
        }

        if (mx < rml || mx > rml + N || my < MT || my > MT + N) {
          tooltip.style.display = "none";
          return;
        }

        const best = findHit(mx, my);

        if (best >= 0) {
          ref.canvas.style.cursor = "pointer";
          applyCanvasHighlight(best);
          redrawAllDots();
          hoverHighlight = true;
          tooltip.innerHTML = buildPointTooltipHtml(predictor, dotData[best].idx, outcome);
          tooltip.style.display = "block";
          positionTooltip(tooltip, e.clientX, e.clientY);
        } else {
          ref.canvas.style.cursor = "crosshair";
          if (hoverHighlight) {
            if (pinnedDotDataIdx >= 0) {
              applyCanvasHighlight(pinnedDotDataIdx);
            } else {
              clearCanvasHighlight();
            }
            redrawAllDots();
            hoverHighlight = false;
          }
          // Grid tooltip
          const gi = Math.max(0, Math.min(nColsX - 1, Math.round(((mx - rml) / N) * (nColsX - 1))));
          const gj = Math.max(0, Math.min(nColsY - 1, Math.round(((my - MT) / N) * (nColsY - 1))));
          const xVal = xVals[gi];
          const yVal = yVals[gj];
          const idx = gj * nColsX + gi;
          const mu = means[idx] ?? 0;
          const s = stds[idx] ?? 0;
          const muLabel = relativeActive
            ? `\u0394 = ${formatPct(mu)}`
            : `\u03BC = ${mu.toFixed(4)}`;
          const sLabel = relativeActive ? `\u03C3 = ${s.toFixed(1)}%` : `\u03C3 = ${s.toFixed(4)}`;
          tooltip.innerHTML =
            `<b>${names[dimX]}</b>: ${formatParamValue(xVal, params[dimX])}<br>` +
            `<b>${names[dimY]}</b>: ${formatParamValue(yVal, params[dimY])}<br>` +
            `${muLabel}<br>${sLabel}`;
          tooltip.style.display = "block";
          positionTooltip(tooltip, e.clientX, e.clientY);
        }
      });

      ref.canvas.addEventListener("click", (e: MouseEvent) => {
        const cRect = ref.canvas.getBoundingClientRect();
        const mx = e.clientX - cRect.left;
        const my = e.clientY - cRect.top;
        const best = findHit(mx, my);

        if (best >= 0) {
          const hitTrainIdx = dotData[best].idx;
          if (_getPinned() === hitTrainIdx) {
            _setPinned(-1);
            pinnedDotDataIdx = -1;
            clearCanvasHighlight();
          } else {
            _setPinned(hitTrainIdx);
            pinnedDotDataIdx = best;
            applyCanvasHighlight(best);
            if (onSnapToPoint) {
              onSnapToPoint(dotData[best].pt);
              return;
            }
          }
        } else {
          if (_getPinned() >= 0) {
            _setPinned(-1);
            pinnedDotDataIdx = -1;
            clearCanvasHighlight();
          }
        }
        redrawAllDots();
        hoverHighlight = false;
      });

      ref.canvas.addEventListener("mouseleave", () => {
        ref.canvas.style.cursor = "crosshair";
        tooltip.style.display = "none";
        if (hoverHighlight) {
          if (pinnedDotDataIdx >= 0) {
            applyCanvasHighlight(pinnedDotDataIdx);
          } else {
            clearCanvasHighlight();
          }
          redrawAllDots();
          hoverHighlight = false;
        }
      });
    }
  }

  target.append(panelWrap);
}
