/**
 * Visualization utilities for ax-js.
 *
 * Colormaps, data-point rendering, fixture normalization, and search-space
 * helpers used by the demo suite and available for custom visualizations.
 *
 * @module ax-js/viz
 */

// ── Colormaps ─────────────────────────────────────────────────────────────

/** RGB triplet in 0-255 range. */
export type RGB = [number, number, number];

const VIRIDIS_STOPS: RGB[] = [
  [68, 1, 84], [72, 32, 111], [63, 64, 153], [50, 101, 176],
  [38, 130, 142], [63, 151, 120], [92, 170, 98], [140, 188, 80],
  [195, 203, 72], [253, 231, 37],
];

const PLASMA_STOPS: RGB[] = [
  [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150],
  [203, 70, 121], [229, 107, 93], [245, 144, 66], [252, 180, 36],
  [241, 229, 29],
];

function interpolateStops(t: number, stops: RGB[]): RGB {
  t = Math.max(0, Math.min(1, t));
  const idx = t * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const f = idx - lo;
  return [
    Math.round(stops[lo][0] + f * (stops[hi][0] - stops[lo][0])),
    Math.round(stops[lo][1] + f * (stops[hi][1] - stops[lo][1])),
    Math.round(stops[lo][2] + f * (stops[hi][2] - stops[lo][2])),
  ];
}

/** Viridis colormap. Maps t in [0, 1] to an RGB triplet. */
export function viridis(t: number): RGB {
  return interpolateStops(t, VIRIDIS_STOPS);
}

/** Plasma colormap. Maps t in [0, 1] to an RGB triplet. */
export function plasma(t: number): RGB {
  return interpolateStops(t, PLASMA_STOPS);
}

/**
 * Render a horizontal colorbar into a canvas element.
 * @param canvasId - DOM id of the `<canvas>` element.
 * @param colorFn - Colormap function mapping [0,1] to RGB.
 */
export function drawColorbar(
  canvasId: string,
  colorFn: (t: number) => RGB,
): void {
  const cvs = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!cvs) return;
  cvs.width = cvs.offsetWidth || 200;
  cvs.height = cvs.offsetHeight || 24;
  const ctx = cvs.getContext("2d");
  if (!ctx) return;
  const w = cvs.width;
  const h = cvs.height;
  for (let i = 0; i < w; i++) {
    const rgb = colorFn(i / w);
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(i, 0, 1, h);
  }
}

// ── Data point rendering ──────────────────────────────────────────────────

/**
 * Draw a training-data point with the standard outer-ring + inner-fill style.
 *
 * @param ctx - Canvas 2D rendering context.
 * @param x - Pixel x coordinate.
 * @param y - Pixel y coordinate.
 * @param alpha - Opacity in [0, 1] (distance-based fade).
 * @param isActive - Whether the point is click-pinned (larger, full opacity).
 * @param isHovered - Whether the mouse is hovering (larger).
 * @param fillRGB - Inner fill color as [r, g, b]. Defaults to red [255, 60, 60].
 */
export function drawDataDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  isActive: boolean,
  isHovered: boolean,
  fillRGB: RGB = [255, 60, 60],
): void {
  if (alpha < 0.04) return;
  const outerR = isActive || isHovered ? 7.5 : 5;
  const innerR = isActive || isHovered ? 4 : 2.5;
  ctx.beginPath();
  ctx.arc(x, y, outerR, 0, 2 * Math.PI);
  ctx.strokeStyle = isActive
    ? "rgba(255,255,255,1)"
    : `rgba(255,255,255,${Math.max(0.15, alpha * 0.6).toFixed(3)})`;
  ctx.lineWidth = isActive ? 2.5 : isHovered ? 2 : 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, innerR, 0, 2 * Math.PI);
  ctx.fillStyle =
    isActive || isHovered
      ? `rgba(${fillRGB[0]},${fillRGB[1]},${fillRGB[2]},1)`
      : `rgba(${fillRGB[0]},${fillRGB[1]},${fillRGB[2]},${alpha.toFixed(3)})`;
  ctx.fill();
}

// ── Search-space helpers ──────────────────────────────────────────────────

/** Minimal parameter shape accepted by search-space helpers. */
export interface ParamSpec {
  type: "range" | "choice";
  bounds?: [number, number];
  values?: (string | number | boolean)[];
  parameter_type?: "int" | "float";
}

/** Returns true if the parameter is a choice parameter. */
export function isChoice(p: ParamSpec): boolean {
  return p.type === "choice";
}

/** Returns true if the parameter is an integer range parameter. */
export function isInteger(p: ParamSpec): boolean {
  return p.type === "range" && p.parameter_type === "int";
}

/** Returns a sensible default value for a parameter (midpoint or first choice). */
export function defaultParamValue(
  p: ParamSpec,
): number | string | boolean {
  if (isChoice(p)) return p.values![0];
  if (isInteger(p)) return Math.round((p.bounds![0] + p.bounds![1]) / 2);
  return (p.bounds![0] + p.bounds![1]) / 2;
}

/** Format a parameter value for display. */
export function formatParamValue(
  val: number | string | boolean,
  p: ParamSpec,
): string {
  if (isChoice(p)) return String(val);
  if (isInteger(p)) return String(Math.round(val as number));
  return (val as number).toFixed(3);
}

// ── Kernel-distance helpers ───────────────────────────────────────────────

/**
 * Compute kernel-distance relevance between a training point and a reference.
 *
 * Returns `exp(-0.5 * d²)` where d² is the scaled squared distance across
 * non-plotted dimensions (dimensions in `plottedDims` are skipped).
 *
 * @param pt - Training point coordinates (raw parameter space).
 * @param fixedValues - Current slider/reference values for all dimensions.
 * @param plottedDims - Indices of dimensions shown on the plot axes (skipped).
 * @param ls - Lengthscale array from the kernel (one per dimension).
 * @param inputTf - Input transform with `coefficient` array, or null.
 * @param params - Parameter specs (for choice-parameter penalty).
 */
export function pointRelevance(
  pt: number[],
  fixedValues: number[],
  plottedDims: number[],
  ls: number[] | null,
  inputTf: { coefficient?: number[] } | null,
  params?: ParamSpec[],
): number {
  let d2 = 0;
  for (let j = 0; j < fixedValues.length; j++) {
    if (plottedDims.indexOf(j) >= 0) continue;
    if (params && params[j] && isChoice(params[j])) {
      if (pt[j] !== fixedValues[j]) d2 += 4;
      continue;
    }
    const diff = pt[j] - fixedValues[j];
    const coeff = inputTf?.coefficient?.[j] ?? 1;
    const lsj = ls && j < ls.length ? ls[j] : 1;
    const scaled = diff / coeff / lsj;
    d2 += scaled * scaled;
  }
  return Math.exp(-0.5 * d2);
}

// ── Fixture normalization ─────────────────────────────────────────────────

/**
 * Normalize a fixture or ExperimentState into a flat shape for visualization.
 *
 * Handles both the `{experiment, test}` fixture format and plain
 * ExperimentState objects, extracting search_space, model_state,
 * metadata, and optional fields into a consistent shape.
 */
export function normalizeFixture(data: any): any {
  if (data.experiment) {
    const result: any = {
      search_space: data.experiment.search_space,
      model_state: data.experiment.model_state,
      metadata: {
        name: data.experiment.name || "",
        description: data.experiment.description || "",
        ...(data.test?.metadata || {}),
      },
      test_points: data.test?.test_points || [],
    };
    if (data.experiment.outcome_names)
      result.outcome_names = data.experiment.outcome_names;
    if (data.experiment.optimization_config)
      result.optimization_config = data.experiment.optimization_config;
    if (data.experiment.status_quo)
      result.status_quo = data.experiment.status_quo;
    if (data.experiment.adapter_transforms)
      result.adapter_transforms = data.experiment.adapter_transforms;
    if (data.experiment.observations)
      result.observations = data.experiment.observations;
    if (data.experiment.candidates)
      result.candidates = data.experiment.candidates;
    return result;
  }
  return data;
}

// ── Dimension ordering ────────────────────────────────────────────────────

/** Minimal predictor shape for dimension ranking. */
interface DimensionRanker {
  rankDimensionsByImportance(
    outcome?: string,
  ): { dimIndex: number }[] | null;
}

/**
 * Compute dimension display order, sorted by importance (shortest lengthscale first).
 * Falls back to natural order if no importance data is available.
 */
export function computeDimOrder(
  predictor: DimensionRanker,
  nDim: number,
  selectedOutcome?: string,
): number[] {
  const ranked = predictor.rankDimensionsByImportance(selectedOutcome);
  if (!ranked || ranked.length === 0) {
    return Array.from({ length: nDim }, (_, i) => i);
  }
  const order = ranked.map((d) => d.dimIndex);
  if (order.length < nDim) {
    const inRanked = new Set(order);
    for (let i = 0; i < nDim; i++) {
      if (!inRanked.has(i)) order.push(i);
    }
  }
  return order;
}

// ── Tooltip helpers ───────────────────────────────────────────────────────

/** Show a tooltip element at the given screen coordinates. */
export function showTooltip(
  el: HTMLElement,
  html: string,
  screenX: number,
  screenY: number,
): void {
  el.innerHTML = html;
  el.style.display = "block";
  el.style.left = screenX + 16 + "px";
  el.style.top = screenY - 10 + "px";
}

/** Hide a tooltip element. */
export function hideTooltip(el: HTMLElement): void {
  el.style.display = "none";
}

// ── Higher-level embedding helpers ────────────────────────────────────────

/** Minimal predictor shape accepted by embedding helpers. */
interface EmbeddingPredictor {
  readonly outcomeNames: string[];
  readonly paramNames: string[];
  readonly paramBounds: [number, number][];
}

/**
 * Populate a `<select>` element with the predictor's outcome names.
 *
 * Clears existing options, adds one `<option>` per outcome, and selects
 * the first. Attaches a `change` listener that calls `onChange(selectedName)`.
 * Safe to call repeatedly — replaces the previous listener each time by
 * cloning the element's event handlers.
 *
 * @param predictor - Provides `outcomeNames`.
 * @param selectEl - The `<select>` element to populate.
 * @param onChange - Called with the newly selected outcome name.
 */
export function createOutcomeSelector(
  predictor: EmbeddingPredictor,
  selectEl: HTMLSelectElement,
  onChange: (name: string) => void,
): void {
  selectEl.innerHTML = "";
  predictor.outcomeNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });
  // Use onchange (property) instead of addEventListener to ensure
  // repeated calls replace rather than stack handlers.
  selectEl.onchange = () => onChange(selectEl.value);
}

/**
 * Build parameter sliders for non-plotted dimensions inside `container`.
 *
 * For each dimension not in `excludeDims`, creates a range slider (or
 * dropdown for choice parameters). Calls `onChange(dimIndex, newValue)`
 * whenever a slider value changes.
 *
 * @param predictor - Provides paramNames, paramBounds.
 * @param params - Full parameter specs from `search_space.parameters`.
 * @param container - DOM element to append slider rows into.
 * @param currentValues - Current value for each dimension (mutated in place).
 * @param onChange - Called with `(dimIndex, newValue)` on slider input.
 * @param options - Optional `excludeDims` (Set of dim indices to skip)
 *   and `dimOrder` (array of dim indices controlling display order).
 */
export function createParamSliders(
  predictor: EmbeddingPredictor,
  params: ParamSpec[],
  container: HTMLElement,
  currentValues: (number | string | boolean)[],
  onChange: (dimIndex: number, value: number | string | boolean) => void,
  options?: { excludeDims?: Set<number>; dimOrder?: number[] },
): void {
  container.innerHTML = "";
  const excludeDims = options?.excludeDims ?? new Set<number>();
  const order =
    options?.dimOrder ??
    Array.from({ length: predictor.paramNames.length }, (_, i) => i);

  order.forEach((i) => {
    if (excludeDims.has(i)) return;
    const name = predictor.paramNames[i];
    const p = params[i];
    const row = document.createElement("div");
    row.className = "slrow";
    const lbl = document.createElement("span");
    lbl.className = "sllbl";
    lbl.textContent = name;

    const val = document.createElement("span");
    val.className = "slval";
    val.textContent = formatParamValue(currentValues[i] as number, p);

    if (isChoice(p)) {
      const sel = document.createElement("select");
      sel.className = "slselect";
      p.values!.forEach((v) => {
        const o = document.createElement("option");
        o.value = String(v);
        o.textContent = String(v);
        if (v == currentValues[i]) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", () => {
        const nv = +sel.value;
        currentValues[i] = nv;
        val.textContent = formatParamValue(nv, p);
        onChange(i, nv);
      });
      row.appendChild(lbl);
      row.appendChild(sel);
      row.appendChild(val);
    } else {
      const lo = predictor.paramBounds[i][0];
      const hi = predictor.paramBounds[i][1];
      const sl = document.createElement("input");
      sl.type = "range";
      sl.min = String(lo);
      sl.max = String(hi);
      sl.step = isInteger(p) ? "1" : String((hi - lo) / 200);
      sl.value = String(currentValues[i]);
      sl.addEventListener("input", () => {
        const nv = isInteger(p) ? Math.round(+sl.value) : +sl.value;
        currentValues[i] = nv;
        val.textContent = formatParamValue(nv, p);
        onChange(i, nv);
      });
      row.appendChild(lbl);
      row.appendChild(sl);
      row.appendChild(val);
    }
    container.appendChild(row);
  });
}

/**
 * Wire up a `<input type="file">` element to parse JSON and invoke a callback.
 *
 * @param inputId - DOM id of the file input element.
 * @param callback - Called with the parsed JSON object.
 */
export function setupFileUpload(
  inputId: string,
  callback: (data: unknown) => void,
): void {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!input) return;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((text) => callback(JSON.parse(text)));
  });
}

/**
 * Render a 2D heatmap onto a canvas context from a flat array of values.
 *
 * The values array has length `gridW * gridH`, laid out in row-major order
 * (row 0 first). Each value is mapped through `colorFn` after normalizing
 * to [0, 1] via `(val - minVal) / (maxVal - minVal)`.
 *
 * The output fills the full `canvasW x canvasH` pixel region, stretching
 * grid cells evenly.
 *
 * @param ctx - Canvas 2D rendering context.
 * @param values - Flat row-major array of length `gridW * gridH`.
 * @param gridW - Number of grid columns.
 * @param gridH - Number of grid rows.
 * @param canvasW - Output pixel width.
 * @param canvasH - Output pixel height.
 * @param colorFn - Maps a normalized [0,1] value to an RGB triplet.
 * @param minVal - Value that maps to t=0.
 * @param maxVal - Value that maps to t=1.
 */
// ── Embeddable render functions ───────────────────────────────────────────

/** Structural type for the predictor methods used by render functions. */
export interface RenderPredictor {
  readonly outcomeNames: string[];
  readonly paramNames: string[];
  getTrainingData(outcomeName?: string): { X: number[][]; Y: number[]; paramNames: string[] };
  loocv(outcomeName?: string): { observed: number[]; mean: number[]; variance: number[] };
  rankDimensionsByImportance(outcomeName?: string): { dimIndex: number; paramName: string; lengthscale: number }[];
}

/** Options for renderFeatureImportance. */
export interface FeatureImportanceOptions {
  outcome?: string;
}

/** Options for renderCrossValidation. */
export interface CrossValidationOptions {
  outcome?: string;
  width?: number;
  height?: number;
}

/** Options for renderOptimizationTrace. */
export interface OptimizationTraceOptions {
  outcome?: string;
  minimize?: boolean;
  width?: number;
  height?: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * Render a horizontal bar chart of feature importance into a container.
 *
 * Each bar shows `1 / lengthscale` (normalized to the most important
 * dimension). Longer bars = more sensitive. Sorted by importance.
 */
export function renderFeatureImportance(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: FeatureImportanceOptions,
): void {
  const outcome = options?.outcome ?? predictor.outcomeNames[0];
  const ranked = predictor.rankDimensionsByImportance(outcome);
  if (!ranked || ranked.length === 0) {
    container.textContent = "No lengthscale data";
    return;
  }

  const barColors = ["#7c6ff7", "#6fa0f7", "#6fcff7", "#6ff7c8", "#a0f76f", "#f7e06f", "#f7a06f", "#f76f6f"];
  const importances = ranked.map((d) => 1 / d.lengthscale);
  const maxImp = Math.max(...importances);

  const W = container.clientWidth || 500;
  const labelW = 130;
  const barH = 24;
  const rowGap = 6;
  const H = ranked.length * (barH + rowGap) + 8;

  const svg = svgEl("svg", { width: W, height: H });

  ranked.forEach((dim, i) => {
    const y = i * (barH + rowGap) + 4;
    const pct = importances[i] / maxImp;
    const barW = pct * (W - labelW - 80);

    // Label
    svg.appendChild(
      Object.assign(svgEl("text", {
        x: labelW - 8, y: y + barH / 2 + 4,
        fill: "#ccc", "font-size": 13, "text-anchor": "end",
      }), { textContent: dim.paramName }),
    );

    // Track
    svg.appendChild(svgEl("rect", {
      x: labelW, y, width: W - labelW - 10, height: barH,
      rx: 4, fill: "#1a1a1d",
    }));

    // Fill bar
    svg.appendChild(svgEl("rect", {
      x: labelW, y, width: Math.max(2, barW), height: barH,
      rx: 4, fill: barColors[dim.dimIndex % barColors.length],
    }));

    // Value annotation
    svg.appendChild(
      Object.assign(svgEl("text", {
        x: W - 16, y: y + barH / 2 + 4,
        fill: "#999", "font-size": 11, "text-anchor": "end",
      }), { textContent: `ls=${dim.lengthscale.toFixed(3)}` }),
    );
  });

  container.appendChild(svg);
}

/**
 * Render a leave-one-out cross-validation scatter plot into a container.
 *
 * Shows observed vs LOO-predicted values with 2-sigma CI whiskers,
 * a diagonal reference line, and R-squared annotation.
 */
export function renderCrossValidation(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: CrossValidationOptions,
): void {
  const outcome = options?.outcome ?? predictor.outcomeNames[0];
  const W = options?.width ?? 440;
  const H = options?.height ?? 440;
  const loo = predictor.loocv(outcome);
  if (loo.observed.length === 0) { container.textContent = "No data"; return; }

  const { observed, mean: predicted, variance } = loo;
  const predStd = variance.map((v) => Math.sqrt(v));
  const n = observed.length;

  // R-squared
  const meanObs = observed.reduce((a, b) => a + b, 0) / n;
  const ssTot = observed.reduce((s, v) => s + (v - meanObs) ** 2, 0);
  const ssRes = observed.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;

  // Axis range
  let lo = Math.min(...observed, ...predicted);
  let hi = Math.max(...observed, ...predicted);
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, predicted[i] - 2 * predStd[i]);
    hi = Math.max(hi, predicted[i] + 2 * predStd[i]);
  }
  const pad = 0.08 * (hi - lo); lo -= pad; hi += pad;

  const margin = { top: 30, right: 20, bottom: 40, left: 55 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const sx = (v: number) => margin.left + ((v - lo) / (hi - lo)) * pw;
  const sy = (v: number) => margin.top + ph - ((v - lo) / (hi - lo)) * ph;

  const svg = svgEl("svg", { width: W, height: H });

  // Diagonal reference
  svg.appendChild(svgEl("line", {
    x1: sx(lo), y1: sy(lo), x2: sx(hi), y2: sy(hi),
    stroke: "rgba(255,255,255,0.15)", "stroke-width": 1, "stroke-dasharray": "4,4",
  }));

  // Grid + ticks
  const nTicks = 5;
  for (let t = 0; t <= nTicks; t++) {
    const v = lo + ((hi - lo) * t) / nTicks;
    svg.appendChild(svgEl("line", {
      x1: margin.left, x2: margin.left + pw, y1: sy(v), y2: sy(v),
      stroke: "rgba(255,255,255,0.04)",
    }));
    svg.appendChild(Object.assign(svgEl("text", {
      x: sx(v), y: margin.top + ph + 16, fill: "#555", "font-size": 10, "text-anchor": "middle",
    }), { textContent: v.toFixed(2) }));
    svg.appendChild(Object.assign(svgEl("text", {
      x: margin.left - 4, y: sy(v) + 3, fill: "#555", "font-size": 10, "text-anchor": "end",
    }), { textContent: v.toFixed(2) }));
  }

  // CI whiskers + dots
  for (let i = 0; i < n; i++) {
    const cx = sx(observed[i]), cy = sy(predicted[i]);
    svg.appendChild(svgEl("line", {
      x1: cx, x2: cx,
      y1: sy(predicted[i] + 2 * predStd[i]),
      y2: sy(predicted[i] - 2 * predStd[i]),
      stroke: "rgba(124,154,255,0.3)", "stroke-width": 1.5,
    }));
    svg.appendChild(svgEl("circle", {
      cx, cy, r: 4, fill: "rgba(124,154,255,0.85)",
      stroke: "rgba(255,255,255,0.5)", "stroke-width": 1,
    }));
  }

  // Axis labels
  svg.appendChild(Object.assign(svgEl("text", {
    x: margin.left + pw / 2, y: H - 6, fill: "#888", "font-size": 13, "text-anchor": "middle",
  }), { textContent: "Observed" }));
  svg.appendChild(Object.assign(svgEl("text", {
    x: 14, y: margin.top + ph / 2, fill: "#888", "font-size": 13, "text-anchor": "middle",
    transform: `rotate(-90,14,${margin.top + ph / 2})`,
  }), { textContent: "LOO Predicted" }));

  // R-squared
  svg.appendChild(Object.assign(svgEl("text", {
    x: margin.left + 6, y: margin.top + 18, fill: "#7c9aff", "font-size": 14, "font-weight": "600",
  }), { textContent: `R\u00B2 = ${r2.toFixed(4)}` }));

  container.appendChild(svg);
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
): void {
  const outcome = options?.outcome ?? predictor.outcomeNames[0];
  const W = options?.width ?? 440;
  const H = options?.height ?? 440;
  const minimize = options?.minimize ?? true;
  const td = predictor.getTrainingData(outcome);
  if (td.Y.length === 0) { container.textContent = "No data"; return; }

  const yVals = td.Y;
  const n = yVals.length;

  // Running best
  let best = yVals[0];
  const bestSoFar = yVals.map((y) => {
    best = minimize ? Math.min(best, y) : Math.max(best, y);
    return best;
  });

  let yMin = Math.min(...yVals);
  let yMax = Math.max(...yVals);
  const yPad = 0.08 * (yMax - yMin || 1);
  yMin -= yPad; yMax += yPad;

  const margin = { top: 30, right: 20, bottom: 40, left: 55 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const sx = (i: number) => margin.left + (i / Math.max(1, n - 1)) * pw;
  const sy = (v: number) => margin.top + ph - ((v - yMin) / (yMax - yMin)) * ph;

  const svg = svgEl("svg", { width: W, height: H });

  // Grid + Y ticks
  const nTicks = 5;
  for (let t = 0; t <= nTicks; t++) {
    const v = yMin + ((yMax - yMin) * t) / nTicks;
    svg.appendChild(svgEl("line", {
      x1: margin.left, x2: margin.left + pw, y1: sy(v), y2: sy(v),
      stroke: "rgba(255,255,255,0.05)",
    }));
    svg.appendChild(Object.assign(svgEl("text", {
      x: margin.left - 8, y: sy(v) + 4, fill: "#555", "font-size": 10, "text-anchor": "end",
    }), { textContent: v.toFixed(2) }));
  }

  // Best-so-far step line
  let bsfPath = `M ${sx(0)} ${sy(bestSoFar[0])}`;
  for (let i = 1; i < n; i++) {
    bsfPath += ` H ${sx(i)} V ${sy(bestSoFar[i])}`;
  }
  svg.appendChild(Object.assign(svgEl("path", {
    d: bsfPath, stroke: "#7c6ff7", "stroke-width": 2.5, fill: "none", opacity: "0.7",
  })));

  // Dots
  for (let i = 0; i < n; i++) {
    const isBest = bestSoFar[i] === yVals[i];
    svg.appendChild(svgEl("circle", {
      cx: sx(i), cy: sy(yVals[i]), r: 4,
      fill: isBest ? "rgba(124,111,247,0.9)" : "rgba(255,255,255,0.3)",
      stroke: isBest ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.15)",
      "stroke-width": 1,
    }));
  }

  // Axis labels
  svg.appendChild(Object.assign(svgEl("text", {
    x: margin.left + pw / 2, y: H - 6, fill: "#888", "font-size": 13, "text-anchor": "middle",
  }), { textContent: "Trial" }));
  svg.appendChild(Object.assign(svgEl("text", {
    x: 14, y: margin.top + ph / 2, fill: "#888", "font-size": 13, "text-anchor": "middle",
    transform: `rotate(-90,14,${margin.top + ph / 2})`,
  }), { textContent: `${outcome}${minimize ? " (min)" : " (max)"}` }));

  // X ticks
  const xStep = Math.max(1, Math.ceil(n / 10));
  for (let i = 0; i < n; i += xStep) {
    svg.appendChild(Object.assign(svgEl("text", {
      x: sx(i), y: margin.top + ph + 18, fill: "#555", "font-size": 10, "text-anchor": "middle",
    }), { textContent: String(i) }));
  }

  // Legend
  svg.appendChild(svgEl("line", {
    x1: margin.left + pw - 120, x2: margin.left + pw - 100,
    y1: margin.top + 12, y2: margin.top + 12,
    stroke: "#7c6ff7", "stroke-width": 2.5,
  }));
  svg.appendChild(Object.assign(svgEl("text", {
    x: margin.left + pw - 96, y: margin.top + 16, fill: "#888", "font-size": 11,
  }), { textContent: "best so far" }));

  container.appendChild(svg);
}

export function renderHeatmap(
  ctx: CanvasRenderingContext2D,
  values: number[],
  gridW: number,
  gridH: number,
  canvasW: number,
  canvasH: number,
  colorFn: (t: number) => RGB,
  minVal: number,
  maxVal: number,
): void {
  const img = ctx.createImageData(canvasW, canvasH);
  const range = maxVal - minVal || 1;
  const cellW = canvasW / gridW;
  const cellH = canvasH / gridH;
  for (let k = 0; k < values.length; k++) {
    const gi = k % gridW;
    const gj = Math.floor(k / gridW);
    const t = Math.max(0, Math.min(1, (values[k] - minVal) / range));
    const rgb = colorFn(t);
    const x0 = Math.round(gi * cellW);
    const y0 = Math.round(gj * cellH);
    const x1 = Math.round((gi + 1) * cellW);
    const y1 = Math.round((gj + 1) * cellH);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const idx = (py * canvasW + px) * 4;
        img.data[idx] = rgb[0];
        img.data[idx + 1] = rgb[1];
        img.data[idx + 2] = rgb[2];
        img.data[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
