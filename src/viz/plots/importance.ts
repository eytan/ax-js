// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor, FeatureImportanceOptions } from "../types";

import { computeParamSigns } from "../params.js";
import { injectScopedStyles, CTRL_CSS } from "../styles";
import {
  createOutcomeSelector,
  createTooltipDiv,
  positionTooltip,
  removeTooltip,
  makeSelectEl,
} from "../widgets";

import { svgEl } from "./_svg";
const SEG_CSS =
  "display:inline-flex;border:1px solid #d0d0d0;border-radius:6px;overflow:hidden;font-size:11px";
const SEG_BTN =
  "padding:3px 10px;cursor:pointer;border:none;outline:none;background:#fff;color:#555";
const SEG_BTN_ACTIVE =
  "padding:3px 10px;cursor:pointer;border:none;outline:none;background:#4872f9;color:#fff";

// PiYG-derived sign colors for Sobol' importance bars.
// Must match SIGN_COLORS in the explorer slider panel.
// Currently designed to echo the deltoid palette; may be revisited.
const SOBOL_COLORS = {
  pos: { first: "#7fbc41", interaction: "#b8e186" }, // green = positive effect
  neg: { first: "#c51b7d", interaction: "#de77ae" }, // pink = negative effect
  neutral: { first: "#4872f9", interaction: "#a8c4ff" }, // blue = categorical / no directional main effect
};

/** Controller for programmatic interaction with an interactive feature importance plot. */
export interface FeatureImportanceController {
  setOutcome(name: string): void;
  setMode(mode: "lengthscale" | "sobol"): void;
  destroy(): void;
}

/**
 * Render a horizontal bar chart of feature importance into a container.
 *
 * Supports two modes:
 * - **lengthscale** (default): bars show `1 / lengthscale`, sorted by importance
 * - **sobol**: stacked bars showing first-order S_i (blue) + interaction ST_i - S_i (light blue)
 */
export function renderFeatureImportance(
  container: HTMLElement,
  predictor: RenderPredictor,
  options?: FeatureImportanceOptions,
): FeatureImportanceController {
  const interactive = options?.interactive !== false;
  const initialMode = options?.mode ?? "lengthscale";

  if (!interactive) {
    if (initialMode === "sobol" && predictor.computeSensitivity) {
      renderSobolStatic(
        container,
        predictor,
        options?.outcome ?? predictor.outcomeNames[0],
        options?.sobolSamples,
      );
    } else {
      renderLengthscaleStatic(container, predictor, options?.outcome ?? predictor.outcomeNames[0]);
    }
    return { setOutcome() {}, setMode() {}, destroy() { container.innerHTML = ""; } };
  }

  if (!container.id) {
    container.id = "axjs_" + Math.random().toString(36).slice(2, 10);
  }
  removeTooltip(container.id);
  container.innerHTML = "";
  injectScopedStyles(container);
  let selectedOutcome = options?.outcome ?? predictor.outcomeNames[0];
  let mode: "lengthscale" | "sobol" = initialMode;
  const sobolSamples = options?.sobolSamples;
  const tooltip = createTooltipDiv(container.id);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.cssText = CTRL_CSS;
  const plotsDiv = document.createElement("div");
  container.append(controlsDiv);
  container.append(plotsDiv);

  if (predictor.outcomeNames.length > 1) {
    const { wrapper, select } = makeSelectEl("Outcome:");
    createOutcomeSelector(predictor, select, (name) => {
      selectedOutcome = name;
      redraw();
    });
    controlsDiv.append(wrapper);
  }

  // Mode toggle (only if predictor supports Sobol')
  if (predictor.computeSensitivity) {
    const segDiv = document.createElement("div");
    segDiv.style.cssText = SEG_CSS;
    const btnLs = document.createElement("button");
    btnLs.textContent = "Lengthscale";
    const btnSobol = document.createElement("button");
    btnSobol.textContent = "Sobol\u2019";

    function updateSegStyle(): void {
      btnLs.style.cssText = mode === "lengthscale" ? SEG_BTN_ACTIVE : SEG_BTN;
      btnSobol.style.cssText = mode === "sobol" ? SEG_BTN_ACTIVE : SEG_BTN;
    }
    updateSegStyle();

    btnLs.addEventListener("click", () => {
      mode = "lengthscale";
      updateSegStyle();
      redraw();
    });
    btnSobol.addEventListener("click", () => {
      mode = "sobol";
      updateSegStyle();
      redraw();
    });
    segDiv.append(btnLs);
    segDiv.append(btnSobol);
    controlsDiv.append(segDiv);
  }

  function redraw(): void {
    plotsDiv.innerHTML = "";
    if (mode === "sobol" && predictor.computeSensitivity) {
      renderSobolStatic(plotsDiv, predictor, selectedOutcome, sobolSamples, tooltip, container);
    } else {
      renderLengthscaleStatic(plotsDiv, predictor, selectedOutcome, tooltip, container);
    }
  }
  redraw();

  return {
    setOutcome(name: string) {
      if (name === selectedOutcome) return;
      selectedOutcome = name;
      redraw();
    },
    setMode(m: "lengthscale" | "sobol") {
      if (m === mode) return;
      mode = m;
      redraw();
    },
    destroy() {
      removeTooltip(container.id);
      container.innerHTML = "";
    },
  };
}

// ── Lengthscale bars (original implementation) ──────────────────────────

function renderLengthscaleStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  const ranked = predictor.rankDimensionsByImportance(outcome);
  if (!ranked || ranked.length === 0) {
    target.textContent = "No lengthscale data";
    return;
  }

  const barColors = [
    "#4872f9",
    "#5478fa",
    "#6088fa",
    "#7098fb",
    "#85a8fb",
    "#9ab8fc",
    "#b0c8fc",
    "#c7d4fd",
  ];
  const importances = ranked.map((d) => 1 / d.lengthscale);
  const maxImp = Math.max(...importances);

  const W = Math.min((tooltipContainer ?? target).clientWidth || 500, 500);
  const labelW = 130;
  const valueW = 70;
  const barH = 24;
  const rowGap = 6;
  const H = ranked.length * (barH + rowGap) + 8;
  const trackW = W - labelW - valueW;

  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  ranked.forEach((dim, i) => {
    const y = i * (barH + rowGap) + 4;
    const pct = importances[i] / maxImp;
    const barW = Math.max(2, pct * trackW);

    svg.append(
      Object.assign(
        svgEl("text", {
          x: labelW - 8,
          y: y + barH / 2 + 4,
          fill: "#333",
          "font-size": 13,
          "text-anchor": "end",
        }),
        { textContent: dim.paramName },
      ),
    );

    svg.append(
      svgEl("rect", {
        x: labelW,
        y,
        width: trackW,
        height: barH,
        rx: 4,
        fill: "#f0f0f0",
      }),
    );

    svg.append(
      svgEl("rect", {
        x: labelW,
        y,
        width: barW,
        height: barH,
        rx: 4,
        fill: barColors[dim.dimIndex % barColors.length],
      }),
    );

    if (tooltip) {
      const hoverRect = svgEl("rect", {
        x: labelW,
        y,
        width: trackW,
        height: barH,
        fill: "transparent",
        cursor: "pointer",
      });
      hoverRect.addEventListener("mouseenter", (e: MouseEvent) => {
        tooltip.innerHTML = `<b>${dim.paramName}</b><br>Lengthscale: ${dim.lengthscale.toFixed(4)}<br>Importance: ${(pct * 100).toFixed(1)}%`;
        tooltip.style.display = "block";
        positionTooltip(tooltip, e.clientX, e.clientY);
      });
      hoverRect.addEventListener("mousemove", (e: MouseEvent) => {
        positionTooltip(tooltip, e.clientX, e.clientY);
      });
      hoverRect.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
      svg.append(hoverRect);
    }

    svg.append(
      Object.assign(
        svgEl("text", {
          x: labelW + trackW + 4,
          y: y + barH / 2 + 4,
          fill: "#666",
          "font-size": 11,
          "text-anchor": "start",
          "pointer-events": "none",
        }),
        { textContent: `ls=${dim.lengthscale.toFixed(3)}` },
      ),
    );
  });

  target.append(svg);
}

// ── Sobol' stacked bars ─────────────────────────────────────────────────

function signColors(sign: number): { first: string; interaction: string } {
  return sign >= 0 ? SOBOL_COLORS.pos : SOBOL_COLORS.neg;
}

function renderSobolStatic(
  target: HTMLElement,
  predictor: RenderPredictor,
  outcome: string,
  sobolSamples?: number,
  tooltip?: HTMLDivElement,
  tooltipContainer?: HTMLElement,
): void {
  if (!predictor.computeSensitivity) {
    target.textContent = "Sobol\u2019 analysis not available";
    return;
  }

  const sens = predictor.computeSensitivity(
    outcome,
    sobolSamples ? { numSamples: sobolSamples } : undefined,
  );
  if (!sens || sens.totalOrder.length === 0) {
    target.textContent = "No sensitivity data";
    return;
  }

  const signs = computeParamSigns(predictor, outcome);

  // Sort by total-order descending
  const dims = sens.totalOrder.map((st, i) => ({
    idx: i,
    name: sens.paramNames[i],
    first: sens.firstOrder[i],
    total: st,
    interaction: Math.max(0, st - sens.firstOrder[i]),
    sign: signs[i],
  }));
  dims.sort((a, b) => {
    const df = b.first - a.first;
    return Math.abs(df) > 0.005 ? df : b.total - a.total;
  });

  const maxST = Math.max(...dims.map((d) => d.total), 0.01);

  const W = Math.min((tooltipContainer ?? target).clientWidth || 500, 500);
  const labelW = 130;
  const barH = 24;
  const rowGap = 6;
  const H = dims.length * (barH + rowGap) + 8;
  const trackW = W - labelW - 10;

  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  // Defs for clip paths (one per row for clean rounded corners)
  const defs = svgEl("defs", {});
  dims.forEach((_, i) => {
    const clipPath = svgEl("clipPath", { id: `sobol-clip-${i}` });
    clipPath.append(
      svgEl("rect", {
        x: labelW,
        y: i * (barH + rowGap) + 4,
        width: trackW,
        height: barH,
        rx: 4,
      }),
    );
    defs.append(clipPath);
  });
  svg.append(defs);

  dims.forEach((dim, i) => {
    const y = i * (barH + rowGap) + 4;
    const firstW = Math.max(0, (dim.first / maxST) * trackW);
    const interW = Math.max(0, (dim.interaction / maxST) * trackW);
    const cols = signColors(dim.sign);

    // Label
    svg.append(
      Object.assign(
        svgEl("text", {
          x: labelW - 8,
          y: y + barH / 2 + 4,
          fill: "#333",
          "font-size": 13,
          "text-anchor": "end",
        }),
        { textContent: dim.name },
      ),
    );

    // Track background
    svg.append(
      svgEl("rect", {
        x: labelW,
        y,
        width: trackW,
        height: barH,
        rx: 4,
        fill: "#f0f0f0",
      }),
    );

    // Clipped group for stacked bars — consistent rounded corners
    const g = svgEl("g", { "clip-path": `url(#sobol-clip-${i})` });
    if (firstW > 0) {
      g.append(
        svgEl("rect", {
          x: labelW,
          y,
          width: firstW,
          height: barH,
          fill: cols.first,
        }),
      );
    }
    if (interW > 0) {
      g.append(
        svgEl("rect", {
          x: labelW + firstW,
          y,
          width: interW,
          height: barH,
          fill: cols.interaction,
        }),
      );
    }
    svg.append(g);

    // Tooltip on bar hover
    if (tooltip) {
      const hoverRect = svgEl("rect", {
        x: labelW,
        y,
        width: trackW,
        height: barH,
        fill: "transparent",
        cursor: "pointer",
      });
      hoverRect.addEventListener("mouseenter", (e: MouseEvent) => {
        tooltip.innerHTML =
          `<b>${dim.name}</b><br>` +
          `${(dim.first * 100).toFixed(1)}% direct effect<br>` +
          `${(dim.interaction * 100).toFixed(1)}% via interactions`;
        tooltip.style.display = "block";
        positionTooltip(tooltip, e.clientX, e.clientY);
      });
      hoverRect.addEventListener("mousemove", (e: MouseEvent) => {
        positionTooltip(tooltip, e.clientX, e.clientY);
      });
      hoverRect.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
      svg.append(hoverRect);
    }
  });

  target.append(svg);
}
