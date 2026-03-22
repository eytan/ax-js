// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { DotInfo, RGB, RenderPredictor } from "./types";

import { positionTooltip } from "./tooltip";

/** Compute kernel correlations from a reference point to all dots. */
export function computeKernelRels(
  predictor: RenderPredictor,
  dots: Array<DotInfo>,
  activeIdx: number,
  outcome: string,
): { raw: Array<number>; max: number } {
  const rawRels: Array<number> = [];
  let maxRel = 0;
  for (let i = 0; i < dots.length; i++) {
    if (i === activeIdx) {
      rawRels.push(1);
      continue;
    }
    const r = predictor.kernelCorrelation(dots[i].pt, dots[activeIdx].pt, outcome);
    rawRels.push(r);
    if (r > maxRel) {
      maxRel = r;
    }
  }
  return { raw: rawRels, max: maxRel };
}

/** Apply kernel-distance-based highlight styling to SVG dot elements. */
export function applyDotHighlight(
  dots: Array<DotInfo>,
  activeIdx: number,
  rels: { raw: Array<number>; max: number },
): void {
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    if (i === activeIdx) {
      d.el.setAttribute("fill", "rgba(217,95,78,0.95)");
      d.el.setAttribute("stroke", "rgba(68,68,68,1)");
      d.el.setAttribute("stroke-width", "2");
      d.el.setAttribute("r", String(d.defaultR + 2));
      if (d.whiskers) {
        for (const w of d.whiskers) w.setAttribute("stroke", "rgba(217,95,78,0.5)");
      }
    } else {
      const relNorm = rels.max > 0 ? rels.raw[i] / rels.max : 0;
      const fa = Math.max(0.08, Math.min(0.9, Math.sqrt(relNorm)));
      d.el.setAttribute("fill", `rgba(217,95,78,${fa.toFixed(3)})`);
      d.el.setAttribute("stroke", `rgba(68,68,68,${Math.max(0.15, fa * 0.6).toFixed(3)})`);
      d.el.setAttribute("stroke-width", "1");
      d.el.setAttribute("r", String(d.defaultR));
      if (d.whiskers) {
        for (const w of d.whiskers) w.setAttribute("stroke", `rgba(217,95,78,${(fa * 0.35).toFixed(3)})`);
      }
    }
  }
}

/** Reset all dots to their default style. */
export function clearDotHighlight(dots: Array<DotInfo>): void {
  for (const d of dots) {
    d.el.setAttribute("fill", d.defaultFill);
    d.el.setAttribute("stroke", d.defaultStroke);
    d.el.setAttribute("stroke-width", "1");
    d.el.setAttribute("r", String(d.defaultR));
    if (d.whiskers) {
      for (const w of d.whiskers) w.setAttribute("stroke", "rgba(217,95,78,0.3)");
    }
  }
}

/** Find nearest dot within a pixel radius. Returns index or -1. */
export function findNearestDot(dots: Array<DotInfo>, px: number, py: number, maxDist = 12): number {
  let best = -1;
  let bestD = maxDist * maxDist;
  for (let i = 0; i < dots.length; i++) {
    const dx = px - dots[i].cx;
    const dy = py - dots[i].cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return best;
}

/** Build rich tooltip HTML showing all outcomes and parameters for a training point. */
export function buildPointTooltipHtml(
  predictor: RenderPredictor,
  idx: number,
  selectedOutcome: string,
): string {
  let html = `<b>Trial ${idx}</b><br>`;
  for (const name of predictor.outcomeNames) {
    const td = predictor.getTrainingData(name);
    if (idx >= td.Y.length) {
      continue;
    }
    const isSel = name === selectedOutcome;
    const color = isSel ? "#4872f9" : "#666";
    html += `${isSel ? "<b>" : ""}${name} = <span style="color:${color}">${td.Y[idx].toFixed(4)}</span>${isSel ? "</b>" : ""}<br>`;
  }
  html += '<hr style="border-color:#e8e8e8;margin:4px 0">';
  const td0 = predictor.getTrainingData(predictor.outcomeNames[0]);
  if (idx < td0.X.length) {
    for (let j = 0; j < predictor.paramNames.length; j++) {
      html += `<span style="color:#666">${predictor.paramNames[j]}</span> = ${td0.X[idx][j].toFixed(4)}<br>`;
    }
  }
  return html;
}

/**
 * Attach click-to-pin and hover-highlight handlers to an SVG for training dots.
 * This is the shared interactivity layer used by slice, CV, and trace plots.
 */
export function attachDotInteractivity(
  svg: SVGSVGElement,
  dots: Array<DotInfo>,
  predictor: RenderPredictor,
  outcome: string,
  tooltip: HTMLDivElement,
  tooltipContainer: HTMLElement,
  options?: {
    fallbackMouseMove?: (e: MouseEvent) => void;
    onPinChange?: (pinnedIdx: number) => void;
    getPinnedIdx?: () => number;
    setPinnedIdx?: (idx: number) => void;
  },
): { getPinnedIdx: () => number } {
  let localPinnedIdx = -1;
  let hoverHighlight = false;
  let pinnedDotIdx = -1;
  let pinnedRels: { raw: Array<number>; max: number } | null = null;

  const getPinnedIdx = options?.getPinnedIdx ?? (() => localPinnedIdx);
  const setPinnedIdx =
    options?.setPinnedIdx ??
    ((v: number) => {
      localPinnedIdx = v;
    });

  svg.addEventListener("mousemove", (e: MouseEvent) => {
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const hitIdx = findNearestDot(dots, px, py);

    if (hitIdx >= 0) {
      svg.style.cursor = "pointer";
      applyDotHighlight(dots, hitIdx, computeKernelRels(predictor, dots, hitIdx, outcome));
      hoverHighlight = true;
      const html = buildPointTooltipHtml(predictor, dots[hitIdx].idx, outcome);
      tooltip.innerHTML = html;
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
      if (options?.fallbackMouseMove) {
        options.fallbackMouseMove(e);
      } else {
        tooltip.style.display = "none";
      }
    }
  });

  svg.addEventListener("click", (e: MouseEvent) => {
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const hitIdx = findNearestDot(dots, px, py);

    if (hitIdx >= 0) {
      const hitTrainIdx = dots[hitIdx].idx;
      if (getPinnedIdx() === hitTrainIdx) {
        setPinnedIdx(-1);
        pinnedDotIdx = -1;
        pinnedRels = null;
        clearDotHighlight(dots);
      } else {
        const rels = computeKernelRels(predictor, dots, hitIdx, outcome);
        setPinnedIdx(hitTrainIdx);
        pinnedDotIdx = hitIdx;
        pinnedRels = rels;
        applyDotHighlight(dots, hitIdx, rels);
      }
    } else {
      if (getPinnedIdx() >= 0) {
        setPinnedIdx(-1);
        pinnedDotIdx = -1;
        pinnedRels = null;
        clearDotHighlight(dots);
      }
    }
    hoverHighlight = false;
    options?.onPinChange?.(getPinnedIdx());
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

  return { getPinnedIdx };
}

/**
 * Draw a training-data point with the standard outer-ring + inner-fill style.
 *
 * @param ctx - Canvas 2D rendering context.
 * @param x - Pixel x coordinate.
 * @param y - Pixel y coordinate.
 * @param alpha - Opacity in [0, 1] (distance-based fade).
 * @param isActive - Whether the point is click-pinned (larger, full opacity).
 * @param isHovered - Whether the mouse is hovering (larger).
 * @param fillRGB - Inner fill color as [r, g, b]. Defaults to red [217, 95, 78].
 */
export function drawDataDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  isActive: boolean,
  isHovered: boolean,
  fillRGB: RGB = [217, 95, 78],
): void {
  if (alpha < 0.04) {
    return;
  }
  const outerR = isActive || isHovered ? 7.5 : 5;
  const innerR = isActive || isHovered ? 4 : 2.5;
  ctx.beginPath();
  ctx.arc(x, y, outerR, 0, 2 * Math.PI);
  ctx.strokeStyle = isActive
    ? "rgba(68,68,68,1)"
    : `rgba(68,68,68,${Math.max(0.15, alpha * 0.6).toFixed(3)})`;
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

export { type DotInfo } from "./types";
