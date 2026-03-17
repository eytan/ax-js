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
