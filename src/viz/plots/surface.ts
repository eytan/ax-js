import type { RenderPredictor, ResponseSurfaceOptions, ParamSpec, DimensionRanker } from "../types";
import { viridis, plasma } from "../colormaps";
import { isChoice, defaultParamValue, formatParamValue, computeDimOrder } from "../params";
import { createOutcomeSelector, createParamSliders, createTooltipDiv, positionTooltip, removeTooltip, makeSelectEl } from "../widgets";
import { buildPointTooltipHtml } from "../dots";
import { injectScopedStyles } from "../styles";

/** Extract ParamSpec array from predictor, falling back to range-only specs. */
function getParamSpecs(predictor: RenderPredictor): ParamSpec[] {
  if (predictor.paramSpecs) return predictor.paramSpecs;
  return predictor.paramBounds.map(([lo, hi]) => ({
    type: "range" as const,
    bounds: [lo, hi] as [number, number],
  }));
}

const CTRL_CSS = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;pointer-events:auto";

type ColorFn = (t: number) => [number, number, number];

/**
 * Render side-by-side posterior mean + predictive std heatmaps.
 *
 * Interactive mode: outcome selector, axis selectors with collision guard,
 * parameter sliders, click-to-pin with slider snapping.
 */
export function renderResponseSurface(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: ResponseSurfaceOptions,
): void {
  const interactive = options?.interactive !== false;

  if (!interactive) {
    renderResponseSurfaceStatic(container, predictor,
      options?.outcome ?? predictor.outcomeNames[0],
      options?.dimX ?? 0,
      options?.dimY ?? Math.min(1, predictor.paramNames.length - 1),
      options);
    return;
  }

  if (!container.id) container.id = "axjs_" + Math.random().toString(36).slice(2, 10);
  removeTooltip(container.id);
  container.innerHTML = "";
  injectScopedStyles(container);
  let selectedOutcome = options?.outcome ?? predictor.outcomeNames[0];
  const params = getParamSpecs(predictor);
  const initOrder = computeDimOrder(predictor as DimensionRanker, predictor.paramNames.length, selectedOutcome);
  const rangeDims = initOrder.filter(d => !isChoice(params[d]));
  let selDimX = options?.dimX ?? rangeDims[0] ?? 0;
  let selDimY = options?.dimY ?? (rangeDims.length > 1 ? rangeDims[1] : 0);
  const fixedValues: (number | string | boolean)[] =
    options?.fixedValues?.slice() ??
    params.map((p) => defaultParamValue(p));
  const tooltip = createTooltipDiv(container.id);

  // Layout: outcome selector on top, then plots, then axis selectors + sliders below
  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS + "padding:8px 16px;";
  const plotsDiv = document.createElement("div");
  plotsDiv.style.cssText = "padding:4px 8px 12px;";
  const axisDiv = document.createElement("div");
  axisDiv.style.cssText = CTRL_CSS + "padding:4px 16px 0;";
  const slidersDiv = document.createElement("div");
  slidersDiv.style.cssText = "margin-bottom:8px;padding:0 16px;";
  container.appendChild(controlsDiv);
  container.appendChild(plotsDiv);
  container.appendChild(axisDiv);
  container.appendChild(slidersDiv);

  // Outcome selector (top)
  if (predictor.outcomeNames.length > 1) {
    const { wrapper, select } = makeSelectEl("Outcome:");
    createOutcomeSelector(predictor, select, (name) => {
      selectedOutcome = name;
      redraw();
    });
    controlsDiv.appendChild(wrapper);
  }

  // Axis selectors (below plot, above sliders) with collision guard
  let selXEl: HTMLSelectElement;
  let selYEl: HTMLSelectElement;
  function makeDimSelect(label: string, initial: number, onChange: (idx: number) => void) {
    const { wrapper, select } = makeSelectEl(label);
    predictor.paramNames.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = name;
      if (i === initial) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => { onChange(+select.value); redraw(); };
    axisDiv.appendChild(wrapper);
    return select;
  }
  selXEl = makeDimSelect("X axis:", selDimX, (v) => {
    selDimX = v;
    if (selDimX === selDimY) { selDimY = (selDimX + 1) % params.length; selYEl.value = String(selDimY); }
    rebuildSliders();
  });
  selYEl = makeDimSelect("Y axis:", selDimY, (v) => {
    selDimY = v;
    if (selDimX === selDimY) { selDimX = (selDimY + 1) % params.length; selXEl.value = String(selDimX); }
    rebuildSliders();
  });

  // Pinned state persists across re-renders
  let rsPinnedIdx = -1;

  function rebuildSliders() {
    const dimOrd = computeDimOrder(predictor as DimensionRanker, predictor.paramNames.length, selectedOutcome);
    createParamSliders(predictor, params, slidersDiv, fixedValues, () => { redraw(); },
      { excludeDims: new Set([selDimX, selDimY]), dimOrder: dimOrd });
  }
  rebuildSliders();

  function redraw() {
    plotsDiv.innerHTML = "";
    renderResponseSurfaceStatic(plotsDiv, predictor, selectedOutcome, selDimX, selDimY,
      options, fixedValues as number[], tooltip, container, (pt: number[]) => {
        for (let j = 0; j < fixedValues.length; j++) fixedValues[j] = pt[j];
        rebuildSliders();
        redraw();
      },
      () => rsPinnedIdx,
      (v: number) => { rsPinnedIdx = v; },
    );
  }
  redraw();
}

// ── Shared panel rendering ───────────────────────────────────────────────

interface CanvasDot { px: number; py: number; idx: number; pt: number[]; alpha: number }

/** Draw a vertical colorbar on a canvas context. */
function drawVerticalColorbar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  vMin: number, vMax: number, colorFn: ColorFn,
) {
  for (let i = 0; i < h; i++) {
    const t = 1 - i / h; // top = max, bottom = min
    const rgb = colorFn(t);
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(x, y + i, w, 1);
  }
  // Labels
  ctx.font = "9px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.textAlign = "left";
  ctx.fillText(vMax.toFixed(2), x + w + 3, y + 8);
  ctx.fillText(vMin.toFixed(2), x + w + 3, y + h);
}

/** Draw axis ticks and labels on a canvas. */
function drawAxes(
  ctx: CanvasRenderingContext2D,
  ML: number, MT: number, N: number,
  xlo: number, xhi: number, ylo: number, yhi: number,
  xName: string, yName: string, showYAxis: boolean,
  xLabels?: string[], yLabels?: string[],
) {
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;

  // X-axis ticks
  ctx.textAlign = "center";
  if (xLabels) {
    // Categorical: centered labels per category
    for (let ci = 0; ci < xLabels.length; ci++) {
      const tx = ML + (ci + 0.5) / xLabels.length * N;
      ctx.beginPath(); ctx.moveTo(tx, MT + N); ctx.lineTo(tx, MT + N + 4); ctx.stroke();
      ctx.fillText(xLabels[ci], tx, MT + N + 15);
    }
  } else {
    const nTicks = 4;
    for (let ti = 0; ti <= nTicks; ti++) {
      const v = xlo + ((xhi - xlo) * ti) / nTicks;
      const tx = ML + (ti * N) / nTicks;
      ctx.beginPath(); ctx.moveTo(tx, MT + N); ctx.lineTo(tx, MT + N + 4); ctx.stroke();
      ctx.fillText(v.toFixed(2), tx, MT + N + 15);
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(xName, ML + N / 2, MT + N + 30);

  if (!showYAxis) return;

  // Y-axis ticks
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "right";
  if (yLabels) {
    // Categorical: centered labels per category (yVals is already reversed for canvas)
    for (let ci = 0; ci < yLabels.length; ci++) {
      const ty = MT + (ci + 0.5) / yLabels.length * N;
      ctx.beginPath(); ctx.moveTo(ML - 4, ty); ctx.lineTo(ML, ty); ctx.stroke();
      ctx.fillText(yLabels[ci], ML - 6, ty + 3);
    }
  } else {
    const nTicks = 4;
    for (let ti = 0; ti <= nTicks; ti++) {
      const v = ylo + ((yhi - ylo) * ti) / nTicks;
      const ty = MT + ((1 - ti / nTicks) * N);
      ctx.beginPath(); ctx.moveTo(ML - 4, ty); ctx.lineTo(ML, ty); ctx.stroke();
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
function drawDots(ctx: CanvasRenderingContext2D, dots: CanvasDot[], pinnedIdx: number) {
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
      ctx.fillStyle = isActive
        ? "rgba(217,95,78,1)"
        : `rgba(217,95,78,${d.alpha.toFixed(3)})`;
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
  fixedValuesOverride?: number[],
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
  onSnapToPoint?: (pt: number[]) => void,
  getPinnedIdx?: () => number,
  setPinnedIdx?: (v: number) => void,
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
  const MT = 18;      // room for panel title
  const MB = 38;
  const CB_W = 14;    // colorbar width
  const CB_GAP = 4;   // gap between heatmap and colorbar
  const CB_LBL = 36;  // space for colorbar labels
  const MR = CB_GAP + CB_W + CB_LBL;
  // Width/height are for the total area; each panel gets half the width
  const totalW = options?.width ?? 800;
  const panelW = Math.floor((totalW - 12) / 2); // 12px gap between panels
  const defaultH = (options?.height ?? 380);
  // Second panel omits Y-axis, so its ML is smaller
  const ML2 = 10;
  const N = Math.min(panelW - ML - MR, defaultH - MT - MB);
  const CW = N + ML + MR;
  const CH = N + MT + MB;

  const [xlo, xhi] = bounds[dimX];
  const [ylo, yhi] = bounds[dimY];
  const xIsChoice = isChoice(params[dimX]);
  const yIsChoice = isChoice(params[dimY]);

  // Build axis value arrays — categorical uses discrete values, range uses continuous sweep
  const xVals: number[] = xIsChoice
    ? params[dimX].values!.map(Number)
    : Array.from({ length: gridSize }, (_, i) => xlo + ((xhi - xlo) * i) / (gridSize - 1));
  const yVals: number[] = yIsChoice
    ? params[dimY].values!.map(Number).reverse()  // top = last, bottom = first (reversed for canvas)
    : Array.from({ length: gridSize }, (_, j) => yhi - ((yhi - ylo) * j) / (gridSize - 1));
  const nColsX = xVals.length;
  const nColsY = yVals.length;

  // Build grid points (shared for both panels)
  const testPoints: number[][] = [];
  for (let gj = 0; gj < nColsY; gj++) {
    for (let gi = 0; gi < nColsX; gi++) {
      const pt = fixedValues.slice() as number[];
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

  const means = Array.from(pred.mean);
  const stds = means.map((_, i) => Math.sqrt(pred.variance[i]));
  const meanMin = Math.min(...means);
  const meanMax = Math.max(...means);
  const stdMin = 0;
  const stdMax = Math.max(...stds);

  // Training dot data (positions computed per-panel since ML differs)
  const td = predictor.getTrainingData(outcome);
  const xRange = xhi - xlo || 1;
  const yRange = yhi - ylo || 1;
  // Normalized positions (0-1) — actual px computed per panel
  // Categorical axes use index-based centering: (idx + 0.5) / nCols
  function normX(val: number): number {
    if (xIsChoice) {
      const idx = xVals.indexOf(val);
      return idx >= 0 ? (idx + 0.5) / nColsX : 0;
    }
    return (val - xlo) / xRange;
  }
  function normY(val: number): number {
    if (yIsChoice) {
      const idx = yVals.indexOf(val);
      return idx >= 0 ? (idx + 0.5) / nColsY : 0;
    }
    return 1 - (val - ylo) / yRange;
  }
  interface DotData { normXv: number; normYv: number; idx: number; pt: number[]; alpha: number }
  const dotData: DotData[] = [];
  if (td.X.length > 0) {
    for (let i = 0; i < td.X.length; i++) {
      dotData.push({
        normXv: normX(td.X[i][dimX]),
        normYv: normY(td.X[i][dimY]),
        idx: i, pt: td.X[i], alpha: 0.85,
      });
    }
  }

  // Pinned state
  let localPinnedIdx = -1;
  const _getPinned = getPinnedIdx ?? (() => localPinnedIdx);
  const _setPinned = setPinnedIdx ?? ((v: number) => { localPinnedIdx = v; });

  // Build heatmap ImageData for both panels
  function buildHeatmap(values: number[], vMin: number, vMax: number, colorFn: ColorFn): ImageData {
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

  const meanImg = buildHeatmap(means, meanMin, meanMax, viridis);
  const stdImg = buildHeatmap(stds, stdMin, stdMax, plasma);

  // Panel layout: side-by-side
  const panels = [
    { title: "posterior mean", img: meanImg, colorFn: viridis as ColorFn, vMin: meanMin, vMax: meanMax, values: means },
    { title: "predictive std", img: stdImg, colorFn: plasma as ColorFn, vMin: stdMin, vMax: stdMax, values: stds },
  ];

  const panelWrap = document.createElement("div");
  panelWrap.style.cssText = "display:flex;gap:12px";

  const canvasRefs: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; ml: number }[] = [];

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
    if (!ctx) continue;

    // Panel title
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.textAlign = "center";
    ctx.fillText(panel.title, pML + N / 2, 12);

    // Heatmap
    ctx.putImageData(panel.img, pML, MT);

    // Vertical colorbar
    drawVerticalColorbar(ctx, pML + N + CB_GAP, MT, CB_W, N, panel.vMin, panel.vMax, panel.colorFn);

    // Axes (Y-axis only on first panel)
    const xLabels = xIsChoice ? params[dimX].values!.map(String) : undefined;
    // yVals is reversed for canvas, so labels match that order
    const yLabels = yIsChoice ? params[dimY].values!.map(String).reverse() : undefined;
    drawAxes(ctx, pML, MT, N, xlo, xhi, ylo, yhi, names[dimX], names[dimY], isFirst, xLabels, yLabels);

    canvasRefs.push({ canvas, ctx, img: panel.img, ml: pML });

    const col = document.createElement("div");
    col.appendChild(canvas);
    panelWrap.appendChild(col);
  }

  // Function to redraw all dots across both panels
  function redrawAllDots() {
    for (const ref of canvasRefs) {
      ref.ctx.putImageData(ref.img, ref.ml, MT);
      // Compute per-panel dot positions
      const panelDots: CanvasDot[] = dotData.map((d) => ({
        px: ref.ml + d.normXv * N,
        py: MT + d.normYv * N,
        idx: d.idx, pt: d.pt, alpha: d.alpha,
      }));
      drawDots(ref.ctx, panelDots, _getPinned());
    }
  }

  function applyCanvasHighlight(activeIdx: number) {
    const rels = { raw: [] as number[], max: 0 };
    for (let i = 0; i < dotData.length; i++) {
      if (i === activeIdx) { rels.raw.push(1); continue; }
      const r = predictor.kernelCorrelation(dotData[i].pt, dotData[activeIdx].pt, outcome);
      rels.raw.push(r);
      if (r > rels.max) rels.max = r;
    }
    for (let i = 0; i < dotData.length; i++) {
      if (i === activeIdx) { dotData[i].alpha = 1; continue; }
      const relNorm = rels.max > 0 ? rels.raw[i] / rels.max : 0;
      dotData[i].alpha = Math.max(0.08, Math.sqrt(relNorm));
    }
  }

  function clearCanvasHighlight() {
    for (const d of dotData) d.alpha = 0.85;
  }

  // Restore pinned highlight
  if (_getPinned() >= 0) {
    const pvIdx = dotData.findIndex((d) => d.idx === _getPinned());
    if (pvIdx >= 0) applyCanvasHighlight(pvIdx);
  }

  redrawAllDots();

  // Attach interactivity to both canvases
  if (tooltip && tooltipContainer) {
    let hoverHighlight = false;

    for (const ref of canvasRefs) {
      const rml = ref.ml;

      function findHit(mx: number, my: number): number {
        let best = -1, bestD = 144;
        for (let i = 0; i < dotData.length; i++) {
          const dpx = rml + dotData[i].normXv * N;
          const dpy = MT + dotData[i].normYv * N;
          const dx = mx - dpx, dy = my - dpy;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; best = i; }
        }
        return best;
      }

      ref.canvas.addEventListener("mousemove", (e: MouseEvent) => {
        const cRect = ref.canvas.getBoundingClientRect();
        const mx = e.clientX - cRect.left;
        const my = e.clientY - cRect.top;
        if (mx < rml || mx > rml + N || my < MT || my > MT + N) {
          tooltip.style.display = "none";
          return;
        }

        const best = findHit(mx, my);

        if (best >= 0) {
          ref.canvas.style.cursor = "pointer";
          if (_getPinned() < 0) {
            applyCanvasHighlight(best);
            redrawAllDots();
            hoverHighlight = true;
          }
          tooltip.innerHTML = buildPointTooltipHtml(predictor, dotData[best].idx, outcome);
          tooltip.style.display = "block";
          positionTooltip(tooltip, e.clientX, e.clientY);
        } else {
          ref.canvas.style.cursor = "crosshair";
          if (_getPinned() < 0 && hoverHighlight) {
            clearCanvasHighlight();
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
          tooltip.innerHTML =
            `<b>${names[dimX]}</b>: ${formatParamValue(xVal, params[dimX])}<br>` +
            `<b>${names[dimY]}</b>: ${formatParamValue(yVal, params[dimY])}<br>` +
            `\u03BC = ${mu.toFixed(4)}<br>\u03C3 = ${s.toFixed(4)}`;
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
            clearCanvasHighlight();
          } else {
            _setPinned(hitTrainIdx);
            applyCanvasHighlight(best);
            if (onSnapToPoint) {
              onSnapToPoint(dotData[best].pt);
              return;
            }
          }
        } else {
          if (_getPinned() >= 0) {
            _setPinned(-1);
            clearCanvasHighlight();
          }
        }
        redrawAllDots();
        hoverHighlight = false;
      });

      ref.canvas.addEventListener("mouseleave", () => {
        ref.canvas.style.cursor = "crosshair";
        tooltip.style.display = "none";
        if (_getPinned() < 0 && hoverHighlight) {
          clearCanvasHighlight();
          redrawAllDots();
          hoverHighlight = false;
        }
      });
    }
  }

  target.appendChild(panelWrap);
}
