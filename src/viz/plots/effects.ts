// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor, EffectsPlotOptions, DotInfo } from "../types";

import {
  computeKernelRels,
  applyDotHighlight,
  clearDotHighlight,
  findNearestDot,
} from "../dots";
import { deltaRelativize, formatPct } from "../relativize";
import { injectScopedStyles, CTRL_CSS } from "../styles";
import {
  createOutcomeSelector,
  createTooltipDiv,
  positionTooltip,
  removeTooltip,
  makeSelectEl,
} from "../widgets";

import { svgEl } from "./_svg";

type SortMode = "trial" | "predicted" | "observed";

/** Controller for programmatic interaction with an effects plot. */
export interface EffectsPlotController {
  setOutcome(name: string): void;
  setSort(sort: SortMode): void;
  destroy(): void;
}

/**
 * Render a per-trial effects chart (forest plot).
 *
 * Each trial shows: observed value (red dot) + LOO prediction (blue marker)
 * with 2σ CI whisker. X-axis is discrete trial index, sortable by trial order,
 * predicted value, or observed value. Optional relative mode vs status quo.
 *
 * Uses leave-one-out predictions (not in-sample) so the predicted values
 * actually differ from observed — in-sample would interpolate exactly for
 * noise-free GPs.
 */
export function renderEffectsPlot(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: EffectsPlotOptions,
): EffectsPlotController {
  const interactive = options?.interactive !== false;
  const W = options?.width ?? 520;
  const H = options?.height ?? 400;

  if (!interactive) {
    const outcome = options?.outcome ?? predictor.outcomeNames[0];
    const sort = options?.sort ?? "trial";
    const relative = options?.relative === true;
    const sqPt = options?.statusQuoPoint ?? predictor.statusQuoPoint ?? null;
    renderEffectsStatic(
      container,
      predictor,
      outcome,
      W,
      H,
      sort,
      relative,
      sqPt,
    );
    return {
      setOutcome() {},
      setSort() {},
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

  let selectedOutcome = options?.outcome ?? predictor.outcomeNames[0];
  let sortMode: SortMode = options?.sort ?? "trial";
  let isRelative = options?.relative === true;
  const sqPoint = options?.statusQuoPoint ?? predictor.statusQuoPoint ?? null;
  const tooltip = createTooltipDiv(container.id);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS;
  const plotsDiv = document.createElement("div");
  container.append(controlsDiv);
  container.append(plotsDiv);

  // Outcome selector
  if (predictor.outcomeNames.length > 1) {
    const { wrapper, select } = makeSelectEl("Outcome:");
    createOutcomeSelector(predictor, select, (name) => {
      selectedOutcome = name;
      redraw();
    });
    controlsDiv.append(wrapper);
  }

  // Sort selector
  const { wrapper: sortWrapper, select: sortSelect } = makeSelectEl("Sort:");
  for (const [val, label] of [
    ["trial", "Trial order"],
    ["predicted", "Predicted value"],
    ["observed", "Observed value"],
  ] as Array<[string, string]>) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    sortSelect.append(opt);
  }
  sortSelect.value = sortMode;
  sortSelect.addEventListener("change", () => {
    sortMode = sortSelect.value as SortMode;
    redraw();
  });
  controlsDiv.append(sortWrapper);

  // Relative toggle (if SQ available)
  if (sqPoint) {
    const relLabel = document.createElement("label");
    relLabel.style.cssText = "font-size:13px;color:#555;display:flex;align-items:center;gap:4px";
    const relCheck = document.createElement("input");
    relCheck.type = "checkbox";
    relCheck.checked = isRelative;
    relCheck.addEventListener("change", () => {
      isRelative = relCheck.checked;
      redraw();
    });
    relLabel.append(relCheck, "% vs SQ");
    controlsDiv.append(relLabel);
  }

  function redraw(): void {
    plotsDiv.innerHTML = "";
    renderEffectsStatic(
      plotsDiv,
      predictor,
      selectedOutcome,
      W,
      H,
      sortMode,
      isRelative,
      sqPoint,
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
    setSort(sort: SortMode) {
      if (sort === sortMode) return;
      sortMode = sort;
      sortSelect.value = sort;
      redraw();
    },
    destroy() {
      removeTooltip(container.id);
      container.innerHTML = "";
    },
  };
}

// ── Static renderer ───────────────────────────────────────────────────────

function renderEffectsStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  W: number,
  H: number,
  sortMode: SortMode,
  isRelative: boolean,
  sqPoint: Array<number> | null,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  const td = predictor.getTrainingData(outcome);
  const n = td.Y.length;
  if (n === 0) {
    target.textContent = "No data";
    return;
  }

  // LOO predictions (in-sample would interpolate exactly for noise-free GPs)
  const loo = predictor.loocv(outcome);
  const observed = loo.observed;
  const predicted = loo.mean;
  const predStd = loo.variance.map((v) => Math.sqrt(v));

  // Relative mode
  let relActive = false;
  let sqMean = 0;
  let sqStd = 0;
  let obsValues: Array<number> = observed;
  let predValues: Array<number> = predicted;
  let predSigmas: Array<number> = predStd;

  if (isRelative && sqPoint) {
    const sqPred = predictor.predict([sqPoint])[outcome];
    if (sqPred && Math.abs(sqPred.mean[0]) >= 1e-15) {
      sqMean = sqPred.mean[0];
      sqStd = Math.sqrt(sqPred.variance[0]);
      relActive = true;
      obsValues = observed.map(
        (y) => ((y - sqMean) / Math.abs(sqMean)) * 100,
      );
      predValues = [];
      predSigmas = [];
      for (let i = 0; i < n; i++) {
        const [rm, rs] = deltaRelativize(
          predicted[i],
          predStd[i],
          sqMean,
          sqStd,
        );
        predValues.push(rm);
        predSigmas.push(rs);
      }
    }
  }

  // Sort indices
  const indices = Array.from({ length: n }, (_, i) => i);
  if (sortMode === "predicted") {
    indices.sort((a, b) => predValues[a] - predValues[b]);
  } else if (sortMode === "observed") {
    indices.sort((a, b) => obsValues[a] - obsValues[b]);
  }

  // Y range including all observations and predictions ± 2σ
  let ylo = Infinity;
  let yhi = -Infinity;
  for (let i = 0; i < n; i++) {
    ylo = Math.min(ylo, obsValues[i], predValues[i] - 2 * predSigmas[i]);
    yhi = Math.max(yhi, obsValues[i], predValues[i] + 2 * predSigmas[i]);
  }
  const yPad = 0.08 * (yhi - ylo || 1);
  ylo -= yPad;
  yhi += yPad;

  // Layout
  const margin = { top: 24, right: 20, bottom: 40, left: 55 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const sx = (pos: number): number =>
    margin.left + ((pos + 0.5) / n) * pw;
  const sy = (v: number): number =>
    margin.top + ph - ((v - ylo) / (yhi - ylo)) * ph;

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

  // Y grid + ticks
  const nYTicks = 5;
  const fmtY = relActive ? formatPct : (v: number) => v.toFixed(2);
  for (let t = 0; t <= nYTicks; t++) {
    const v = ylo + ((yhi - ylo) * t) / nYTicks;
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
          x: margin.left - 4,
          y: sy(v) + 3,
          fill: "#999",
          "font-size": 10,
          "text-anchor": "end",
        }),
        { textContent: fmtY(v) },
      ),
    );
  }

  // X ticks (trial indices)
  const xStep = Math.max(1, Math.ceil(n / 15));
  for (let di = 0; di < n; di += xStep) {
    svg.append(
      Object.assign(
        svgEl("text", {
          x: sx(di),
          y: margin.top + ph + 16,
          fill: "#999",
          "font-size": 10,
          "text-anchor": "middle",
        }),
        { textContent: String(indices[di]) },
      ),
    );
  }

  // Zero line in relative mode
  if (relActive && ylo < 0 && yhi > 0) {
    svg.append(
      svgEl("line", {
        x1: margin.left,
        x2: margin.left + pw,
        y1: sy(0),
        y2: sy(0),
        stroke: "rgba(0,0,0,0.25)",
        "stroke-width": 1,
        "stroke-dasharray": "6,4",
      }),
    );
  }

  // Per-trial elements
  const defaultFill = "rgba(217,95,78,0.85)";
  const defaultStroke = "rgba(68,68,68,0.35)";
  const dotR = 4;
  const capW = 4; // half-width of error bar caps
  const dots: Array<DotInfo> = [];

  for (let di = 0; di < n; di++) {
    const i = indices[di];
    const px = sx(di);
    const ciHi = sy(predValues[i] + 2 * predSigmas[i]);
    const ciLo = sy(predValues[i] - 2 * predSigmas[i]);
    const predY = sy(predValues[i]);
    const obsY = sy(obsValues[i]);
    const whiskerEls: Array<SVGLineElement> = [];

    // ── Blue error bar: LOO prediction ± 2σ (centered on prediction) ──
    // Vertical stem
    const blueStem = svgEl("line", {
      x1: px, x2: px, y1: ciHi, y2: ciLo,
      stroke: "rgba(72,114,249,0.5)", "stroke-width": 2,
    });
    svg.append(blueStem);
    whiskerEls.push(blueStem);
    // Top cap
    const blueCap1 = svgEl("line", {
      x1: px - capW, x2: px + capW, y1: ciHi, y2: ciHi,
      stroke: "rgba(72,114,249,0.5)", "stroke-width": 2,
    });
    svg.append(blueCap1);
    whiskerEls.push(blueCap1);
    // Bottom cap
    const blueCap2 = svgEl("line", {
      x1: px - capW, x2: px + capW, y1: ciLo, y2: ciLo,
      stroke: "rgba(72,114,249,0.5)", "stroke-width": 2,
    });
    svg.append(blueCap2);
    whiskerEls.push(blueCap2);

    // ── Red error bar: same CI width, centered on observed value ──
    const redHi = obsY - (predY - ciHi); // shift CI to be centered on obsY
    const redLo = obsY + (ciLo - predY);
    // Vertical stem
    const redStem = svgEl("line", {
      x1: px, x2: px, y1: redHi, y2: redLo,
      stroke: "rgba(217,95,78,0.35)", "stroke-width": 1.5,
    });
    svg.append(redStem);
    whiskerEls.push(redStem);
    // Top cap
    const redCap1 = svgEl("line", {
      x1: px - capW, x2: px + capW, y1: redHi, y2: redHi,
      stroke: "rgba(217,95,78,0.35)", "stroke-width": 1.5,
    });
    svg.append(redCap1);
    whiskerEls.push(redCap1);
    // Bottom cap
    const redCap2 = svgEl("line", {
      x1: px - capW, x2: px + capW, y1: redLo, y2: redLo,
      stroke: "rgba(217,95,78,0.35)", "stroke-width": 1.5,
    });
    svg.append(redCap2);
    whiskerEls.push(redCap2);

    // LOO prediction marker (blue circle)
    svg.append(
      svgEl("circle", {
        cx: px,
        cy: predY,
        r: 3,
        fill: "#4872f9",
        stroke: "#fff",
        "stroke-width": 1,
      }),
    );

    // Observed dot (red, interactive)
    const dot = svgEl("circle", {
      cx: px,
      cy: obsY,
      r: dotR,
      fill: defaultFill,
      stroke: defaultStroke,
      "stroke-width": 1,
    });
    svg.append(dot);

    dots.push({
      cx: px,
      cy: obsY,
      idx: i,
      pt: td.X[i],
      el: dot,
      whiskers: whiskerEls,
      defaultFill,
      defaultStroke,
      defaultR: dotR,
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
  const yLabel = relActive ? `${outcome} (% vs SQ)` : outcome;
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

  // Legend (top-right)
  const lx = margin.left + pw - 140;
  const ly = margin.top + 6;
  svg.append(
    svgEl("circle", {
      cx: lx,
      cy: ly,
      r: 3.5,
      fill: defaultFill,
      stroke: defaultStroke,
      "stroke-width": 1,
    }),
  );
  svg.append(
    Object.assign(
      svgEl("text", {
        x: lx + 7,
        y: ly + 3.5,
        fill: "#666",
        "font-size": 10,
      }),
      { textContent: "observed \u00B12\u03C3" },
    ),
  );
  svg.append(
    svgEl("circle", {
      cx: lx + 62,
      cy: ly,
      r: 2.5,
      fill: "#4872f9",
      stroke: "none",
    }),
  );
  svg.append(
    Object.assign(
      svgEl("text", {
        x: lx + 68,
        y: ly + 3.5,
        fill: "#666",
        "font-size": 10,
      }),
      { textContent: "LOO pred. \u00B12\u03C3" },
    ),
  );

  target.append(svg);

  // Interactivity with NN highlighting
  if (tooltip && tooltipContainer) {
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

        const i = dots[hitIdx].idx;
        let html = `<div style="font-weight:600;color:#666;margin-bottom:4px">${outcome} — trial ${i}</div>`;
        if (relActive) {
          html += `observed = <span style="color:#d95f4e">${formatPct(obsValues[i])}</span><br>`;
          html += `LOO predicted = <span style="color:#4872f9">${formatPct(predValues[i])}</span><br>`;
          html += `\u00B1 2\u03C3 = [${formatPct(predValues[i] - 2 * predSigmas[i])}, ${formatPct(predValues[i] + 2 * predSigmas[i])}]`;
        } else {
          html += `observed = <span style="color:#d95f4e">${obsValues[i].toFixed(4)}</span><br>`;
          html += `LOO predicted = <span style="color:#4872f9">${predValues[i].toFixed(4)}</span><br>`;
          html += `\u00B1 2\u03C3 = [${(predValues[i] - 2 * predSigmas[i]).toFixed(4)}, ${(predValues[i] + 2 * predSigmas[i]).toFixed(4)}]<br>`;
          html += `residual = <span style="color:#666">${(obsValues[i] - predValues[i]).toFixed(4)}</span>`;
        }
        html += '<hr style="border-color:#e8e8e8;margin:4px 0">';
        for (let j = 0; j < predictor.paramNames.length; j++) {
          html += `<span style="color:#666">${predictor.paramNames[j]}</span> = ${td.X[i][j].toFixed(4)}<br>`;
        }
        tooltip.innerHTML = html;
        tooltip.style.display = "block";
        positionTooltip(tooltip, e.clientX, e.clientY);
      } else {
        svg.style.cursor = "default";
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
      svg.style.cursor = "default";
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
