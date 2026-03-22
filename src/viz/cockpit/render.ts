// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { CockpitArm, CockpitCandidate, CockpitController, CockpitOptions, CockpitSelection, NiceRange } from "./types.js";
import type { CockpitData, CockpitPredictor, PredictorConstructor } from "./data.js";
import type { ScatterState } from "./scatter.js";
import type { SliderImportance } from "./sliders.js";

import {
  loadCockpitData,
  computeAllRelData,
  computeDefaultMetricOrder,
  computePanelRange,
  niceRange,
  CI_Z,
  predictCandidate,
  batchColor,
  starPoints,
  computeParamSignsInline,
} from "./data.js";
import { renderScatterSvg, showHoverEllipse, updateScatterOpacities } from "./scatter.js";
import { renderDeltoidPanel, getItemLabel } from "./deltoid.js";
import { renderSlidersPanel } from "./sliders.js";

// ── CSS ──────────────────────────────────────────────────────────────────

const COCKPIT_CSS = `
.axjs-cockpit *, .axjs-cockpit *::before, .axjs-cockpit *::after { box-sizing: border-box; }
.axjs-cockpit {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1a1a1a;
}
.axjs-cockpit .ck-subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
.axjs-cockpit .ck-main { display: flex; gap: 20px; align-items: flex-start; }
.axjs-cockpit .ck-right-panel {
  background: #fff; border: 0.5px solid #e0e0e0; border-radius: 8px;
  padding: 14px 16px; flex-shrink: 0; min-width: 530px;
}
.axjs-cockpit .ck-rp-title {
  font-size: 11px; color: #999; letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 14px;
}
.axjs-cockpit .ck-rp-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
}
.axjs-cockpit .ck-rp-header .ck-rp-title { margin-bottom: 0; }
.axjs-cockpit .ck-rp-actions { display: flex; gap: 2px; margin-left: auto; }
.axjs-cockpit .ck-scatter-wrap { position: relative; flex-shrink: 0; }
.axjs-cockpit .ck-scatter-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.axjs-cockpit .ck-scatter-label {
  font-size: 11px; color: #999; letter-spacing: 0.06em; text-transform: uppercase;
}
.axjs-cockpit .ck-scatter-controls { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
.axjs-cockpit .ck-controls-secondary { display: flex; flex-direction: column; gap: 5px; }
.axjs-cockpit label { font-size: 13px; color: #555; }
.axjs-cockpit select, .axjs-cockpit button {
  font-size: 11px; padding: 3px 8px; border-radius: 6px;
  border: 0.5px solid #d0d0d0; background: #fff; color: #333; cursor: pointer; outline: none;
}
.axjs-cockpit button:hover { background: #f0f0f0; }
.axjs-cockpit .ck-nav-btn {
  width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center;
  border: none; background: none; color: #bbb; cursor: pointer; border-radius: 3px;
  padding: 0; font-size: 11px;
}
.axjs-cockpit .ck-nav-btn:hover { background: #f0f0f0; color: #555; }
.axjs-cockpit .ck-icon-btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border: none; background: none; color: #999; cursor: pointer; border-radius: 4px;
  padding: 0; font-size: 14px;
}
.axjs-cockpit .ck-icon-btn:hover { background: #f0f0f0; color: #555; }
.axjs-cockpit .ck-icon-btn svg { width: 14px; height: 14px; pointer-events: none; }
.axjs-cockpit .ck-legend {
  display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; padding: 6px 0;
}
.axjs-cockpit .ck-legend-item {
  display: flex; align-items: center; gap: 5px; font-size: 11px; color: #666;
  cursor: pointer; user-select: none; padding: 2px 6px; border-radius: 4px;
  transition: opacity 0.15s;
}
.axjs-cockpit .ck-legend-item:hover { background: #f5f5f5; }
.axjs-cockpit .ck-legend-item.hidden-gen { opacity: 0.3; }
.axjs-cockpit .ck-legend-swatch { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.axjs-cockpit .ck-bars svg { display: block; }
.axjs-cockpit .slider-section {
  border-top: 0.5px solid #e0e0e0; margin-top: 14px; padding-top: 12px;
}
.axjs-cockpit .slider-section .section-title {
  font-size: 11px; color: #999; letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
}
.axjs-cockpit .clone-btn {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  border: 0.5px solid #d0d0d0; background: #f0f0f0; color: #555; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.axjs-cockpit .clone-btn:hover { background: #e0e0e0; color: #333; }
.axjs-cockpit .delete-btn {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 4px;
  border: 0.5px solid #e0a0a0; background: #fff0f0; color: #c66; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.axjs-cockpit .delete-btn:hover { background: #ffe0e0; color: #a44; }
.axjs-cockpit .param-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
}
.axjs-cockpit .param-row label {
  font-size: 10px; color: #666; width: 100px; text-align: right; flex-shrink: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  position: relative; z-index: 1;
}
.axjs-cockpit .param-row .imp-bar {
  position: absolute; right: 0; top: 1px; bottom: 1px; border-radius: 2px; z-index: -1;
}
.axjs-cockpit .param-row input[type=range] {
  flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
  background: #e0e0e0; border-radius: 2px; outline: none; cursor: pointer;
}
.axjs-cockpit .param-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px;
  border-radius: 50%; background: #636EFA; cursor: pointer; border: none;
}
.axjs-cockpit .param-row input[type=range]:disabled { opacity: 0.4; cursor: default; }
.axjs-cockpit .param-row input[type=range]:disabled::-webkit-slider-thumb { background: #666; cursor: default; }
.axjs-cockpit .param-row .param-val {
  font-size: 10px; color: #666; width: 42px; text-align: left; flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
`;

// ── Tooltip helper ───────────────────────────────────────────────────────

function createTooltip(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;display:none;background:rgba(255,255,255,0.97);border:1px solid #d0d0d0;" +
    "border-radius:5px;padding:5px 10px;font-size:11px;color:#333;pointer-events:none;" +
    "z-index:10000;white-space:pre-line;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:300px";
  document.body.appendChild(el);
  return el;
}

function attachTooltip(el: HTMLElement, tooltip: HTMLDivElement): void {
  el.addEventListener("mouseover", (e) => {
    let target = e.target as HTMLElement | null;
    while (target && target !== el) {
      const tip = target.getAttribute?.("data-tip");
      if (tip) {
        tooltip.textContent = tip;
        tooltip.style.display = "block";
        tooltip.style.left = (e as MouseEvent).clientX + 14 + "px";
        tooltip.style.top = (e as MouseEvent).clientY - 8 + "px";
        return;
      }
      target = target.parentNode as HTMLElement | null;
    }
    tooltip.style.display = "none";
  });
  el.addEventListener("mousemove", (e) => {
    if (tooltip.style.display === "block") {
      tooltip.style.left = (e as MouseEvent).clientX + 14 + "px";
      tooltip.style.top = (e as MouseEvent).clientY - 8 + "px";
    }
  });
  el.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}

// ── DOM builder ──────────────────────────────────────────────────────────

const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';

interface DomRefs {
  subtitleEl: HTMLElement;
  rpTitle: HTMLElement;
  rpBars: HTMLElement;
  rpSliders: HTMLElement;
  scatterSvg: SVGSVGElement;
  legendEl: HTMLElement;
  selX: HTMLSelectElement;
  selY: HTMLSelectElement;
  selSQ: HTMLSelectElement;
  selDistMode: HTMLSelectElement;
  fileInput: HTMLInputElement;
  btnExport: HTMLButtonElement;
  btnCopy: HTMLButtonElement;
  btnPrev: HTMLButtonElement;
  btnNext: HTMLButtonElement;
}

function buildDom(container: HTMLElement): DomRefs {
  container.innerHTML = "";
  container.classList.add("axjs-cockpit");

  // Inject scoped CSS
  if (!document.getElementById("axjs-cockpit-css")) {
    const style = document.createElement("style");
    style.id = "axjs-cockpit-css";
    style.textContent = COCKPIT_CSS;
    document.head.appendChild(style);
  }

  const subtitleEl = document.createElement("p");
  subtitleEl.className = "ck-subtitle";

  // Right panel (deltoid + sliders)
  const rightPanel = document.createElement("div");
  rightPanel.className = "ck-right-panel";

  const rpHeader = document.createElement("div");
  rpHeader.className = "ck-rp-header";

  const btnPrev = document.createElement("button");
  btnPrev.className = "ck-nav-btn";
  btnPrev.innerHTML = "&#9664;";
  btnPrev.title = "Previous arm";

  const rpTitle = document.createElement("div");
  rpTitle.className = "ck-rp-title";
  rpTitle.textContent = "Click an arm to see all outcomes";

  const btnNext = document.createElement("button");
  btnNext.className = "ck-nav-btn";
  btnNext.innerHTML = "&#9654;";
  btnNext.title = "Next arm";

  const rpActions = document.createElement("div");
  rpActions.className = "ck-rp-actions";
  const btnCopy = document.createElement("button");
  btnCopy.className = "ck-icon-btn";
  btnCopy.title = "Copy as text";
  btnCopy.innerHTML = COPY_ICON;
  rpActions.appendChild(btnCopy);

  const navGroup = document.createElement("div");
  navGroup.style.cssText = "display:flex;gap:0;flex-shrink:0";
  navGroup.append(btnPrev, btnNext);
  rpHeader.append(navGroup, rpTitle, rpActions);

  const rpBars = document.createElement("div");
  rpBars.className = "ck-bars";
  const rpSliders = document.createElement("div");

  rightPanel.append(rpHeader, rpBars, rpSliders);

  // Scatter panel
  const scatterWrap = document.createElement("div");
  scatterWrap.className = "ck-scatter-wrap";

  const scatterHeader = document.createElement("div");
  scatterHeader.className = "ck-scatter-header";
  const scatterLabel = document.createElement("span");
  scatterLabel.className = "ck-scatter-label";
  scatterLabel.textContent = "Metric Tradeoffs";
  const selXLabel = document.createElement("label");
  selXLabel.style.marginLeft = "auto";
  selXLabel.textContent = "X ";
  const selX = document.createElement("select");
  selXLabel.appendChild(selX);
  const selYLabel = document.createElement("label");
  selYLabel.textContent = "Y ";
  const selY = document.createElement("select");
  selYLabel.appendChild(selY);
  scatterHeader.append(scatterLabel, selXLabel, selYLabel);

  const scatterSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  scatterSvg.setAttribute("width", "420");
  scatterSvg.setAttribute("height", "400");
  scatterSvg.style.display = "block";

  const legendEl = document.createElement("div");
  legendEl.className = "ck-legend";

  const scatterControls = document.createElement("div");
  scatterControls.className = "ck-scatter-controls";
  const controlsSec = document.createElement("div");
  controlsSec.className = "ck-controls-secondary";

  const sqLabel = document.createElement("label");
  sqLabel.textContent = "Control arm ";
  const selSQ = document.createElement("select");
  sqLabel.appendChild(selSQ);

  const distLabel = document.createElement("label");
  distLabel.textContent = "Distance highlighting ";
  const selDistMode = document.createElement("select");
  for (const [val, text] of [["euclidean", "euclidean"], ["bi-objective", "bi-objective kernel"], ["kernel", "kernel"]] as const) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = text;
    if (val === "bi-objective") opt.selected = true;
    selDistMode.appendChild(opt);
  }
  distLabel.appendChild(selDistMode);

  const ioRow = document.createElement("div");
  ioRow.style.cssText = "display:flex;gap:6px;align-items:center";
  const fileLabel = document.createElement("label");
  fileLabel.style.cursor = "pointer";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";
  fileInput.style.display = "none";
  const fileSpan = document.createElement("span");
  fileSpan.style.cssText = "font-size:11px;padding:3px 8px;border-radius:6px;border:0.5px solid #d0d0d0;background:#fff;color:#333;cursor:pointer";
  fileSpan.textContent = "import";
  fileLabel.append(fileInput, fileSpan);
  const btnExport = document.createElement("button");
  btnExport.textContent = "export";
  ioRow.append(fileLabel, btnExport);

  controlsSec.append(sqLabel, distLabel, ioRow);
  scatterControls.appendChild(controlsSec);
  scatterWrap.append(scatterHeader, scatterSvg, legendEl, scatterControls);

  // Assemble
  const mainArea = document.createElement("div");
  mainArea.className = "ck-main";
  mainArea.append(rightPanel, scatterWrap);

  container.append(subtitleEl, mainArea);

  return {
    subtitleEl, rpTitle, rpBars, rpSliders, scatterSvg, legendEl,
    selX, selY, selSQ, selDistMode, fileInput, btnExport, btnCopy,
    btnPrev, btnNext,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/**
 * Render a full cockpit UI into a container element.
 *
 * Creates the DOM layout, loads data, wires all events, and manages
 * internal state (caches, selection, etc.). The container becomes the
 * single owner of the cockpit — call `controller.destroy()` to clean up.
 *
 * The Predictor class is passed in (not an instance) so the cockpit can
 * prepare the ExperimentState (synthesizing input_transform for models
 * that lack one) before construction — ensuring fast analytic Sobol.
 *
 * @param container - Target element (will be cleared).
 * @param experimentData - ExperimentState or FixtureData (raw JSON).
 * @param PredictorClass - Predictor constructor (e.g., `Ax.Predictor`).
 * @param options - Optional overrides.
 * @returns Controller for programmatic interaction.
 */
export function renderCockpit(
  container: HTMLElement,
  experimentData: unknown,
  PredictorClass: PredictorConstructor,
  options?: CockpitOptions,
): CockpitController {
  const dom = buildDom(container);
  const tooltip = createTooltip();

  // ── State ──
  let data: CockpitData | null = null;
  let scatterState: ScatterState | null = null;
  let selectedItem: CockpitSelection | null = null;
  let prevSelectedItem: CockpitSelection | null = null;
  let hoveredItem: CockpitSelection | null = null;
  let hoverEllipseGroup: SVGGElement | null = null;
  let customMetricOrder: Array<string> = [];
  let xOutIdx = 0;
  let yOutIdx = 1;
  const hiddenGenMethods: Record<string, boolean> = {};
  let sliderOutcome: string | null = null;
  let sliderDimOrder: Array<number> | null = null;
  let hoveredDeltoidRow: string | null = null;

  // Sticky ranges: only expand when data hits the edge, shrink when
  // all data falls within 50% of the current range.
  let stickyRange: NiceRange | null = null;
  let stickyScatterX: NiceRange | null = null;
  let stickyScatterY: NiceRange | null = null;
  let stickyScatterXIdx = -1;
  let stickyScatterYIdx = -1;

  /** Apply sticky range logic: expand immediately, shrink only below 50%. */
  function applyStickyRange(dataRange: NiceRange, current: NiceRange | null): NiceRange {
    if (!current) return dataRange;

    // Expand if data exceeds the current range
    if (dataRange.lo < current.lo || dataRange.hi > current.hi) {
      return niceRange(
        Math.min(dataRange.lo, current.lo),
        Math.max(dataRange.hi, current.hi),
      );
    }

    // Shrink only if all data falls within 50% of the sticky range
    const stickySpan = current.hi - current.lo;
    const dataSpan = dataRange.hi - dataRange.lo;
    if (dataSpan < stickySpan * 0.5) {
      return dataRange;
    }

    return current;
  }

  function getStickyPanelRange(): NiceRange {
    if (!data) return { lo: -10, hi: 10, ticks: [-10, -5, 0, 5, 10] };
    const dataRange = computePanelRange(data.arms, data.candidates, data.outcomeNames);
    stickyRange = applyStickyRange(dataRange, stickyRange);
    return stickyRange;
  }

  // Caches (never recomputed unless data changes)
  const sobolCache: Record<string, { firstOrder: Array<number>; totalOrder: Array<number> }> = {};
  const paramSignCache: Record<string, Array<number>> = {};

  function getSobol(outcomeName: string) {
    if (sobolCache[outcomeName]) return sobolCache[outcomeName];
    if (!data?.predictor.computeSensitivity) return null;
    const sens = data.predictor.computeSensitivity(outcomeName, { numSamples: 128 });
    sobolCache[outcomeName] = sens;
    return sens;
  }

  function getParamSignsCached(outcomeName: string): Array<number> | null {
    if (paramSignCache[outcomeName]) return paramSignCache[outcomeName];
    if (!data) return null;
    const result = computeParamSignsInline(data.predictor, outcomeName);
    paramSignCache[outcomeName] = result;
    return result;
  }

  function computeDimOrder(outcomeName: string): Array<number> | null {
    const sens = getSobol(outcomeName);
    if (sens && sens.firstOrder.length > 0) {
      const dims = sens.firstOrder.map((s, j) => ({ dim: j, s, st: sens.totalOrder[j] }));
      dims.sort((a, b) => {
        const df = b.s - a.s;
        return Math.abs(df) > 0.005 ? df : b.st - a.st;
      });
      return dims.map((d) => d.dim);
    }
    return null;
  }

  function buildImportance(): SliderImportance | null {
    if (!data) return null;
    const nDims = data.paramNames.length;
    const impFirst = new Array<number>(nDims).fill(0);
    const impTotal = new Array<number>(nDims).fill(0);
    let outcomeName: string;

    if (sliderOutcome) {
      outcomeName = sliderOutcome;
      const sens = getSobol(sliderOutcome);
      if (sens && sens.totalOrder.length >= nDims) {
        for (let d = 0; d < nDims; d++) {
          impFirst[d] = sens.firstOrder[d];
          impTotal[d] = sens.totalOrder[d];
        }
      }
    } else {
      outcomeName = data.outcomeNames[0];
      for (let d = 0; d < nDims; d++) {
        let sumS1 = 0, sumST = 0, count = 0;
        for (const name of data.outcomeNames) {
          const sens = getSobol(name);
          if (sens && sens.totalOrder.length >= nDims) {
            sumS1 += sens.firstOrder[d];
            sumST += sens.totalOrder[d];
            count++;
          }
        }
        impFirst[d] = count > 0 ? sumS1 / count : 0;
        impTotal[d] = count > 0 ? sumST / count : 0;
      }
    }

    const signOutcome = sliderOutcome ?? data.outcomeNames[0];
    const paramSigns = getParamSignsCached(signOutcome);

    return {
      firstOrder: impFirst,
      totalOrder: impTotal,
      paramSigns: paramSigns ?? new Array<number>(nDims).fill(1),
      outcomeName,
    };
  }

  // ── Render functions ──

  function getRefPoint(): Array<number> | null {
    const item = selectedItem ?? hoveredItem;
    if (!item || !data) return null;
    if (item.type === "candidate") return data.candidates[item.idx]?.params ?? null;
    return data.arms[item.idx]?.params ?? null;
  }

  /** Compute data range for one scatter axis from all arm/candidate relData. */
  function scatterDataRange(outcomeName: string): NiceRange {
    let lo = 0, hi = 0;
    for (const item of [...(data?.arms ?? []), ...(data?.candidates ?? [])]) {
      const r = item.relData?.[outcomeName];
      if (r) {
        const rlo = r.mean - CI_Z.c95 * r.sem;
        const rhi = r.mean + CI_Z.c95 * r.sem;
        if (rlo < lo) lo = rlo;
        if (rhi > hi) hi = rhi;
      }
    }
    return niceRange(lo, hi);
  }

  function renderScatter(): void {
    if (!data) return;

    // Reset sticky scatter ranges when outcomes change
    if (xOutIdx !== stickyScatterXIdx) { stickyScatterX = null; stickyScatterXIdx = xOutIdx; }
    if (yOutIdx !== stickyScatterYIdx) { stickyScatterY = null; stickyScatterYIdx = yOutIdx; }

    stickyScatterX = applyStickyRange(scatterDataRange(data.outcomeNames[xOutIdx]), stickyScatterX);
    stickyScatterY = applyStickyRange(scatterDataRange(data.outcomeNames[yOutIdx]), stickyScatterY);

    scatterState = renderScatterSvg(dom.scatterSvg, data.arms, data.candidates, data.outcomeNames, {
      xOutcome: data.outcomeNames[xOutIdx],
      yOutcome: data.outcomeNames[yOutIdx],
      sqIdx: data.sqIdx,
      selectedItem,
      hiddenGenMethods,
      xRange: stickyScatterX,
      yRange: stickyScatterY,
    });
    updateOpacities();
  }

  function updateOpacities(): void {
    if (!data) return;
    updateScatterOpacities(
      dom.scatterSvg, data.arms, data.candidates, getRefPoint(), data.paramBounds,
      dom.selDistMode.value as "euclidean" | "bi-objective" | "all-kernel",
      data.predictor, data.outcomeNames, xOutIdx, yOutIdx,
    );
  }

  function applyBadgeHover(rowName: string | null): void {
    const svg = dom.rpBars.querySelector("svg");
    if (!svg) return;
    for (const attr of ["data-badge-x", "data-badge-y"]) {
      svg.querySelectorAll(`[${attr}]`).forEach((rect) => {
        const name = rect.getAttribute(attr)!;
        const isActive = rect.getAttribute("fill") === "#4872f9";
        const persist = rect.hasAttribute("data-persist");
        const show = isActive || persist || name === rowName;
        rect.setAttribute("opacity", show ? "1" : "0");
        rect.setAttribute("pointer-events", show ? "auto" : "none");
        const text = rect.nextElementSibling;
        if (text) text.setAttribute("opacity", show ? "1" : "0");
      });
    }
  }

  function showDeltoid(item?: CockpitSelection | null): void {
    if (!data) return;
    const displayItem = item ?? selectedItem ?? hoveredItem ?? null;
    renderDeltoidPanel(dom.rpBars, dom.rpTitle, displayItem, data.arms, data.candidates, {
      customMetricOrder,
      panelRange: getStickyPanelRange(),
      outcomeNames: data.outcomeNames,
      xOutcome: data.outcomeNames[xOutIdx],
      yOutcome: data.outcomeNames[yOutIdx],
      sqIdx: data.sqIdx,
      sliderOutcome,
      metricConfigs: data.metricConfigs,
      optimizationConfig: data.optimizationConfig,
    });
    if (hoveredDeltoidRow) applyBadgeHover(hoveredDeltoidRow);
  }

  function renderSliders(): void {
    if (!data || !selectedItem) { dom.rpSliders.innerHTML = ""; return; }
    renderSlidersPanel(dom.rpSliders, selectedItem, data.arms, data.candidates, {
      paramNames: data.paramNames,
      paramBounds: data.paramBounds,
      outcomeNames: data.outcomeNames,
      sqIdx: data.sqIdx,
      sliderDimOrder,
      importance: buildImportance(),
    }, {
      onSliderChange(dim: number, value: number) {
        if (!data || !selectedItem || selectedItem.type !== "candidate") return;
        const cand = data.candidates[selectedItem.idx];
        cand.params[dim] = value;
        if (!cand.edited) cand.edited = true;
        const sqPreds = data.arms[data.sqIdx].preds!;
        predictCandidate(cand, data.predictor, sqPreds, data.outcomeNames);
        renderScatter();
        showDeltoid(selectedItem);
      },
      onClone() {
        if (!selectedItem) return;
        cloneItem(selectedItem.type, selectedItem.idx);
      },
      onDelete() {
        if (!selectedItem || selectedItem.type !== "candidate") return;
        deleteCandidate(selectedItem.idx);
      },
    });
  }

  function renderLegend(): void {
    if (!data) return;
    const seen: Record<string, boolean> = {};
    let html = "";
    const addBatch = (method: string, batch: number, isCand: boolean) => {
      const key = `${method}:${batch}`;
      if (seen[key]) return;
      seen[key] = true;
      const color = batchColor(batch);
      const isHidden = hiddenGenMethods[key];
      const swatch = isCand
        ? `<svg width="12" height="12"><polygon points="${starPoints(6, 6, 6)}" fill="${color}" stroke="${color}" stroke-width="0.5"/></svg>`
        : `<div class="ck-legend-swatch" style="background:${color}"></div>`;
      html += `<div class="ck-legend-item${isHidden ? " hidden-gen" : ""}" data-gen="${key}">${swatch}${method} (${batch})</div>`;
    };
    data.arms.forEach((a) => addBatch(a.generationMethod, a.batchIndex, false));
    data.candidates.forEach((c) => addBatch(c.generationMethod, c.batchIndex, true));
    dom.legendEl.innerHTML = html;
  }

  function updateSubtitle(): void {
    if (!data) return;
    const completed = data.arms.filter((a) => a.trialStatus === "COMPLETED").length;
    const nCand = data.candidates.length;
    const nObj = data.optimizationConfig.objectives?.length ?? 0;
    const nCon = data.optimizationConfig.outcome_constraints?.length ?? 0;
    const batches = new Set(data.arms.map((a) => a.batchIndex));
    const parts: Array<string> = [];
    if (batches.size > 0) parts.push(`${batches.size} ${batches.size === 1 ? "batch" : "batches"}`);
    parts.push(`${completed} completed`);
    if (nCand > 0) parts.push(`${nCand} candidate${nCand > 1 ? "s" : ""}`);
    parts.push(`${nObj} objective${nObj > 1 ? "s" : ""}`);
    if (nCon > 0) parts.push(`${nCon} constraint${nCon > 1 ? "s" : ""}`);
    dom.subtitleEl.textContent = parts.join(" \u00B7 ");
  }

  function populateDropdowns(): void {
    if (!data) return;
    dom.selX.innerHTML = "";
    dom.selY.innerHTML = "";
    customMetricOrder.forEach((name) => {
      const idx = data!.outcomeNames.indexOf(name);
      for (const sel of [dom.selX, dom.selY]) {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = name;
        sel.appendChild(opt);
      }
    });
    xOutIdx = data.outcomeNames.indexOf(options?.defaultXOutcome ?? customMetricOrder[0]);
    if (xOutIdx < 0) xOutIdx = 0;
    yOutIdx = data.outcomeNames.indexOf(options?.defaultYOutcome ?? (customMetricOrder[1] ?? customMetricOrder[0]));
    if (yOutIdx < 0) yOutIdx = Math.min(1, data.outcomeNames.length - 1);
    if (yOutIdx === xOutIdx) yOutIdx = (xOutIdx + 1) % data.outcomeNames.length;
    dom.selX.value = String(xOutIdx);
    dom.selY.value = String(yOutIdx);

    dom.selSQ.innerHTML = "";
    data.arms.forEach((arm, i) => {
      if (arm.trialStatus !== "COMPLETED") return;
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = arm.armName + (i === data!.sqIdx ? " (current)" : "");
      dom.selSQ.appendChild(opt);
    });
    dom.selSQ.value = String(data.sqIdx);
  }

  // ── Candidate management ──

  function cloneItem(sourceType: "arm" | "candidate", sourceIdx: number): void {
    if (!data) return;
    const srcParams = sourceType === "candidate" ? data.candidates[sourceIdx].params : data.arms[sourceIdx].params;
    let maxBatch = -1;
    data.arms.forEach((a) => { if (a.batchIndex > maxBatch) maxBatch = a.batchIndex; });
    data.candidates.forEach((c) => { if (c.generationMethod !== "Manual" && c.batchIndex > maxBatch) maxBatch = c.batchIndex; });
    const batch = maxBatch + 1;
    const idxInBatch = data.candidates.filter((c) => c.batchIndex === batch).length;
    const cand: CockpitCandidate = {
      id: data.nextCandidateId++, idx: data.candidates.length,
      armName: `arm_${batch}_${idxInBatch}`, params: srcParams.slice(), evals: [],
      trialIndex: data.arms.length + data.candidates.length,
      batchIndex: batch, trialStatus: "CANDIDATE", generationMethod: "Manual",
      edited: false, preds: null, relData: null,
    };
    predictCandidate(cand, data.predictor, data.arms[data.sqIdx].preds!, data.outcomeNames);
    data.candidates.push(cand);
    selectedItem = { type: "candidate", idx: data.candidates.length - 1 };
    renderLegend();
    renderScatter();
    showDeltoid();
    renderSliders();
  }

  function deleteCandidate(candIdx: number): void {
    if (!data) return;
    data.candidates.splice(candIdx, 1);
    if (selectedItem?.type === "candidate") {
      if (selectedItem.idx === candIdx) {
        selectedItem = prevSelectedItem ?? { type: "arm", idx: 0 };
        prevSelectedItem = null;
      } else if (selectedItem.idx > candIdx) {
        selectedItem.idx--;
      }
    }
    renderLegend();
    renderScatter();
    showDeltoid();
    renderSliders();
  }

  function navigateArm(dir: number): void {
    if (!data) return;
    const items: Array<CockpitSelection> = [];
    data.arms.forEach((_, i) => items.push({ type: "arm", idx: i }));
    data.candidates.forEach((_, i) => items.push({ type: "candidate", idx: i }));
    if (items.length === 0) return;
    let curIdx = 0;
    if (selectedItem) {
      curIdx = items.findIndex((it) => it.type === selectedItem!.type && it.idx === selectedItem!.idx);
      if (curIdx < 0) curIdx = 0;
    }
    curIdx = (curIdx + dir + items.length) % items.length;
    prevSelectedItem = selectedItem;
    selectedItem = items[curIdx];
    renderScatter();
    showDeltoid();
    renderSliders();
  }

  // ── Scatter event delegation ──

  function getDotInfo(el: EventTarget | null): CockpitSelection | null {
    let node = el as HTMLElement | null;
    while (node && node !== (dom.scatterSvg as unknown as HTMLElement)) {
      const attr = node.getAttribute?.("data-idx");
      if (attr !== null && attr !== undefined) {
        return { idx: parseInt(attr), type: (node.getAttribute("data-type") ?? "arm") as "arm" | "candidate" };
      }
      node = node.parentNode as HTMLElement | null;
    }
    return null;
  }

  dom.scatterSvg.addEventListener("mouseover", (e) => {
    const info = getDotInfo(e.target);
    if (!info) return;
    if (hoveredItem?.type === info.type && hoveredItem?.idx === info.idx) return;
    hoveredItem = info;
    updateOpacities();
    if (hoverEllipseGroup) { hoverEllipseGroup.remove(); hoverEllipseGroup = null; }
    if (scatterState) hoverEllipseGroup = showHoverEllipse(dom.scatterSvg, scatterState, info);
    if (!selectedItem) showDeltoid(info);
  });

  dom.scatterSvg.addEventListener("mouseout", (e) => {
    const info = getDotInfo(e.target);
    if (!info) return;
    const relInfo = getDotInfo((e as MouseEvent).relatedTarget);
    if (relInfo?.type === info.type && relInfo?.idx === info.idx) return;
    hoveredItem = null;
    updateOpacities();
    if (hoverEllipseGroup) { hoverEllipseGroup.remove(); hoverEllipseGroup = null; }
    if (!selectedItem) showDeltoid(null);
  });

  dom.scatterSvg.addEventListener("click", (e) => {
    const info = getDotInfo(e.target);
    if (!info) return;
    if (selectedItem?.type === info.type && selectedItem?.idx === info.idx) return;
    prevSelectedItem = selectedItem;
    selectedItem = info;
    renderScatter();
    showDeltoid();
    renderSliders();
  });

  // ── Deltoid click → badge axis assignment or text importance toggle ──
  dom.rpBars.addEventListener("click", (e) => {
    let el = e.target as HTMLElement | null;
    let outcome: string | null = null;
    while (el && el !== dom.rpBars) {
      const badgeX = el.getAttribute?.("data-badge-x");
      const badgeY = el.getAttribute?.("data-badge-y");
      if (badgeX || badgeY) {
        const metricName = (badgeX ?? badgeY)!;
        const metricIdx = data!.outcomeNames.indexOf(metricName);
        if (metricIdx < 0) return;

        if (badgeX) {
          if (metricIdx === xOutIdx) {
            // Already X axis — just update importance panel
            sliderOutcome = metricName;
            sliderDimOrder = computeDimOrder(metricName);
            renderSliders();
            showDeltoid();
          } else {
            // Assign as X axis; swap if this metric is currently Y
            if (metricIdx === yOutIdx) {
              yOutIdx = xOutIdx;
              dom.selY.value = String(yOutIdx);
            }
            xOutIdx = metricIdx;
            dom.selX.value = String(xOutIdx);
            sliderOutcome = metricName;
            sliderDimOrder = computeDimOrder(metricName);
            renderScatter();
            showDeltoid();
            renderSliders();
          }
        } else {
          if (metricIdx === yOutIdx) {
            // Already Y axis — just update importance panel
            sliderOutcome = metricName;
            sliderDimOrder = computeDimOrder(metricName);
            renderSliders();
            showDeltoid();
          } else {
            // Assign as Y axis; swap if this metric is currently X
            if (metricIdx === xOutIdx) {
              xOutIdx = yOutIdx;
              dom.selX.value = String(xOutIdx);
            }
            yOutIdx = metricIdx;
            dom.selY.value = String(yOutIdx);
            sliderOutcome = metricName;
            sliderDimOrder = computeDimOrder(metricName);
            renderScatter();
            showDeltoid();
            renderSliders();
          }
        }
        return;
      }
      // Track outcome group for text-click fallback
      if (!outcome) {
        const oc = el.getAttribute?.("data-outcome");
        if (oc) outcome = oc;
      }
      el = el.parentNode as HTMLElement | null;
    }
    // No badge clicked — select importance for this metric
    if (outcome && sliderOutcome !== outcome) {
      sliderOutcome = outcome;
      sliderDimOrder = computeDimOrder(outcome);
      renderSliders();
      showDeltoid();
    }
  });

  // ── Deltoid badge hover visibility ──
  dom.rpBars.addEventListener("mouseover", (e) => {
    let el = e.target as HTMLElement | null;
    let rowName: string | null = null;
    while (el && el !== dom.rpBars) {
      const attr = el.getAttribute?.("data-badges-row")
        ?? el.getAttribute?.("data-outcome");
      if (attr) { rowName = attr; break; }
      el = el.parentNode as HTMLElement | null;
    }
    if (rowName !== hoveredDeltoidRow) {
      hoveredDeltoidRow = rowName;
      applyBadgeHover(rowName);
    }
  });

  dom.rpBars.addEventListener("mouseleave", () => {
    hoveredDeltoidRow = null;
    applyBadgeHover(null);
  });

  // ── Deltoid drag-to-reorder metrics ──
  {
    let dragName: string | null = null;
    let dragOrigIdx = -1;
    let lastTargetIdx = -1;
    let ghostEl: HTMLElement | null = null;
    let dragStartY = -1;
    const ROW_H = 30, TOP_PAD = 20;
    const DRAG_THRESHOLD = 5;

    function findDragHandle(el: EventTarget | null): string | null {
      let node = el as HTMLElement | null;
      while (node && node !== dom.rpBars) {
        const handle = node.getAttribute?.("data-drag-handle");
        if (handle) return handle;
        node = node.parentNode as HTMLElement | null;
      }
      return null;
    }

    function getTargetIdx(e: PointerEvent): number {
      const svgEl = dom.rpBars.querySelector("svg");
      if (!svgEl) return -1;
      const rect = svgEl.getBoundingClientRect();
      const localY = e.clientY - rect.top - TOP_PAD;
      return Math.max(0, Math.min(customMetricOrder.length - 1, Math.floor(localY / ROW_H)));
    }

    function updateIndicator(targetIdx: number): void {
      const svgEl = dom.rpBars.querySelector("svg");
      if (!svgEl) return;
      svgEl.querySelector("#drag-indicator")?.remove();
      const svgW = +(svgEl.getAttribute("width") || 400);
      const y = TOP_PAD + targetIdx * ROW_H;
      const ns = "http://www.w3.org/2000/svg";
      const g = document.createElementNS(ns, "g");
      g.id = "drag-indicator";
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", "0"); line.setAttribute("x2", String(svgW));
      line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "#4872f9"); line.setAttribute("stroke-width", "3");
      line.setAttribute("pointer-events", "none");
      g.appendChild(line);
      svgEl.appendChild(g);
    }

    function styleSource(name: string, dragging: boolean): void {
      const svgEl = dom.rpBars.querySelector("svg");
      if (!svgEl) return;
      const opacity = dragging ? "0.4" : "1";
      svgEl.querySelectorAll(`[data-drag-handle="${name}"]`).forEach((el) => el.setAttribute("opacity", opacity));
      svgEl.querySelectorAll(`[data-outcome="${name}"]`).forEach((el) => el.setAttribute("opacity", opacity));
    }

    dom.rpBars.addEventListener("pointerdown", (e) => {
      const name = findDragHandle(e.target);
      if (!name) return;
      e.preventDefault();
      dragName = name;
      dragOrigIdx = customMetricOrder.indexOf(name);
      lastTargetIdx = dragOrigIdx;
      dragStartY = e.clientY;
      dom.rpBars.setPointerCapture(e.pointerId);
      dom.rpBars.style.cursor = "grabbing";
      styleSource(name, true);
      ghostEl = document.createElement("div");
      ghostEl.style.cssText =
        "position:fixed;pointer-events:none;z-index:10001;" +
        "background:rgba(255,255,255,0.95);border:1.5px solid #4872f9;" +
        "border-radius:4px;padding:3px 10px;font-size:11px;color:#333;" +
        "font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
        "box-shadow:0 2px 8px rgba(0,0,0,0.12);white-space:nowrap";
      ghostEl.textContent = name;
      document.body.appendChild(ghostEl);
      ghostEl.style.left = e.clientX + 16 + "px";
      ghostEl.style.top = e.clientY - 12 + "px";
      updateIndicator(dragOrigIdx);
    });

    dom.rpBars.addEventListener("pointermove", (e) => {
      if (!dragName) return;
      if (ghostEl) {
        ghostEl.style.left = e.clientX + 16 + "px";
        ghostEl.style.top = e.clientY - 12 + "px";
      }
      const targetIdx = getTargetIdx(e);
      if (targetIdx >= 0 && targetIdx !== lastTargetIdx) {
        lastTargetIdx = targetIdx;
        updateIndicator(targetIdx);
      }
    });

    dom.rpBars.addEventListener("pointerup", (e) => {
      if (!dragName) return;
      dom.rpBars.style.cursor = "";
      dom.rpBars.querySelector("svg")?.querySelector("#drag-indicator")?.remove();
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }

      const moved = Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD;
      const targetIdx = getTargetIdx(e);
      if (moved && targetIdx >= 0 && targetIdx !== dragOrigIdx) {
        customMetricOrder.splice(dragOrigIdx, 1);
        const insertIdx = targetIdx > dragOrigIdx ? targetIdx - 1 : targetIdx;
        customMetricOrder.splice(insertIdx, 0, dragName!);
        showDeltoid();
      } else {
        styleSource(dragName, false);
      }
      dragName = null;
      dragOrigIdx = -1;
      lastTargetIdx = -1;
    });
  }

  // ── Legend toggle ──
  dom.legendEl.addEventListener("click", (e) => {
    let el = e.target as HTMLElement | null;
    while (el && el !== dom.legendEl) {
      const gen = el.getAttribute?.("data-gen");
      if (gen) {
        if (hiddenGenMethods[gen]) delete hiddenGenMethods[gen];
        else hiddenGenMethods[gen] = true;
        renderLegend();
        renderScatter();
        return;
      }
      el = el.parentNode as HTMLElement | null;
    }
  });

  // ── Dropdown handlers ──
  dom.selX.addEventListener("change", () => {
    xOutIdx = +dom.selX.value;
    if (xOutIdx === yOutIdx) { yOutIdx = (xOutIdx + 1) % data!.outcomeNames.length; dom.selY.value = String(yOutIdx); }
    sliderOutcome = data!.outcomeNames[xOutIdx] ?? null;
    sliderDimOrder = sliderOutcome ? computeDimOrder(sliderOutcome) : null;
    renderScatter();
    showDeltoid();
    renderSliders();
  });
  dom.selY.addEventListener("change", () => {
    yOutIdx = +dom.selY.value;
    if (yOutIdx === xOutIdx) { xOutIdx = (yOutIdx + 1) % data!.outcomeNames.length; dom.selX.value = String(xOutIdx); }
    sliderOutcome = data!.outcomeNames[yOutIdx] ?? null;
    sliderDimOrder = sliderOutcome ? computeDimOrder(sliderOutcome) : null;
    renderScatter();
    showDeltoid();
    renderSliders();
  });
  dom.selSQ.addEventListener("change", () => {
    if (!data) return;
    data.sqIdx = +dom.selSQ.value;
    computeAllRelData(data.arms, data.candidates, data.sqIdx, data.predictor, data.outcomeNames);
    renderScatter();
    showDeltoid();
  });
  dom.selDistMode.addEventListener("change", () => updateOpacities());

  // ── Navigation ──
  dom.btnPrev.addEventListener("click", () => navigateArm(-1));
  dom.btnNext.addEventListener("click", () => navigateArm(1));

  // ── Export ──
  dom.btnExport.addEventListener("click", () => {
    if (!data) return;
    const json = JSON.stringify(data.candidates.map((c) => {
      const params: Record<string, number> = {};
      data!.paramNames.forEach((n, j) => { params[n] = Math.round(c.params[j] * 1e6) / 1e6; });
      return { arm_name: c.armName, parameters: params, generation_method: c.generationMethod + (c.edited ? " (edited)" : "") };
    }), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "candidates.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ── Import ──
  // File import: re-load with a fresh Predictor from the imported data.
  dom.fileInput.addEventListener("change", () => {
    const file = dom.fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const rawData = JSON.parse(text);
        if (rawData.experiment || rawData.model_state || rawData.search_space) {
          loadData(rawData, PredictorClass);
        }
      } catch {
        // silently ignore parse errors
      }
    });
    dom.fileInput.value = "";
  });

  // ── Copy deltoid ──
  dom.btnCopy.addEventListener("click", () => {
    if (!data) return;
    const item = selectedItem ?? hoveredItem;
    if (!item) return;
    const rd = item.type === "candidate" ? data.candidates[item.idx]?.relData : data.arms[item.idx]?.relData;
    if (!rd) return;
    const label = getItemLabel(item, data.arms, data.candidates, data.sqIdx);
    const lines = [label, ""];
    customMetricOrder.forEach((name) => {
      const r = rd[name];
      const txt = name + " " + (r ? `${r.mean >= 0 ? "+" : ""}${r.mean.toFixed(2)}% \u00B1 ${(r.sem * 1.96).toFixed(2)}%` : "n/a");
      lines.push(txt);
    });
    void navigator.clipboard?.writeText(lines.join("\n").trim()).catch(() => {});
  });

  // ── Tooltips ──
  attachTooltip(dom.rpBars, tooltip);
  attachTooltip(dom.rpSliders, tooltip);
  attachTooltip(dom.scatterSvg as unknown as HTMLElement, tooltip);

  // ── loadData ──

  // TODO: Add performance profiling (loadCockpitData, computeAllRelData, sobol, render)
  function loadData(rawData: unknown, PredCls: PredictorConstructor, opts?: CockpitOptions): void {
    data = loadCockpitData(rawData, PredCls, opts?.metricConfigs);
    computeAllRelData(data.arms, data.candidates, data.sqIdx, data.predictor, data.outcomeNames);

    customMetricOrder = computeDefaultMetricOrder(data.outcomeNames, data.metricConfigs);

    // Clear caches and reset sticky ranges
    stickyRange = null;
    stickyScatterX = null;
    stickyScatterY = null;
    for (const k in sobolCache) delete sobolCache[k];
    for (const k in paramSignCache) delete paramSignCache[k];

    selectedItem = data.arms.length > 0 ? { type: "arm", idx: 0 } : null;
    prevSelectedItem = null;
    hoveredItem = null;

    populateDropdowns();
    sliderOutcome = data.outcomeNames[xOutIdx] ?? null;
    sliderDimOrder = sliderOutcome ? computeDimOrder(sliderOutcome) : null;

    renderLegend();
    updateSubtitle();
    renderScatter();
    showDeltoid();
    renderSliders();
  }

  // ── Initialize ──
  loadData(experimentData, PredictorClass, options);

  // ── Controller ──
  return {
    loadData(rawData: unknown, PredCls: PredictorConstructor, opts?: CockpitOptions) {
      loadData(rawData, PredCls, opts);
    },
    selectArm(idx: number) {
      prevSelectedItem = selectedItem;
      selectedItem = { type: "arm", idx };
      renderScatter();
      showDeltoid();
      renderSliders();
    },
    selectCandidate(idx: number) {
      prevSelectedItem = selectedItem;
      selectedItem = { type: "candidate", idx };
      renderScatter();
      showDeltoid();
      renderSliders();
    },
    destroy() {
      tooltip.remove();
      container.innerHTML = "";
      container.classList.remove("axjs-cockpit");
    },
  };
}
