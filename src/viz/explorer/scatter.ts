// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { CockpitArm, CockpitCandidate, CockpitSelection } from "./types.js";
import type { CockpitPredictor } from "./data.js";

import { batchColor, CI_Z, niceRange, starPoints } from "./data.js";

/** Point data for the scatter plot. */
interface ScatterPoint {
  idx: number;
  type: "arm" | "candidate";
  x: number;
  y: number;
  xSem: number;
  ySem: number;
  genMethod: string;
  batch: number;
  armName: string;
  visible: boolean;
}

/** Scatter rendering state, preserved for hover/opacity updates. */
export interface ScatterState {
  sx: (v: number) => number;
  sy: (v: number) => number;
  pts: Array<ScatterPoint>;
}

/** Options for rendering the scatter panel. */
export interface ScatterOptions {
  width?: number;
  height?: number;
  xOutcome: string;
  yOutcome: string;
  sqIdx: number;
  selectedItem: CockpitSelection | null;
  hiddenGenMethods: Record<string, boolean>;
  /** Pre-computed sticky X range. If absent, computed from data. */
  xRange?: { lo: number; hi: number; ticks: Array<number> };
  /** Pre-computed sticky Y range. If absent, computed from data. */
  yRange?: { lo: number; hi: number; ticks: Array<number> };
}

/**
 * Render a bi-objective scatter plot into an SVG element.
 *
 * Returns the scatter state for use in hover/opacity updates.
 */
export function renderScatterSvg(
  svg: SVGSVGElement,
  arms: Array<CockpitArm>,
  candidates: Array<CockpitCandidate>,
  outcomeNames: Array<string>,
  options: ScatterOptions,
): ScatterState {
  const W = options.width ?? 420;
  const H = options.height ?? 400;
  const margin = { top: 24, right: 16, bottom: 46, left: 52 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  const xName = options.xOutcome;
  const yName = options.yOutcome;

  // Collect plottable points
  const pts: Array<ScatterPoint> = [];
  arms.forEach((arm, i) => {
    if (!arm.relData) return;
    const rx = arm.relData[xName];
    const ry = arm.relData[yName];
    if (rx && ry) {
      const key = `${arm.generationMethod}:${arm.batchIndex}`;
      pts.push({
        idx: i,
        type: "arm",
        x: rx.mean,
        y: ry.mean,
        xSem: rx.sem,
        ySem: ry.sem,
        genMethod: arm.generationMethod,
        batch: arm.batchIndex,
        armName: arm.armName,
        visible: !options.hiddenGenMethods[key],
      });
    }
  });
  candidates.forEach((cand, ci) => {
    if (!cand.relData) return;
    const crx = cand.relData[xName];
    const cry = cand.relData[yName];
    if (crx && cry) {
      const key = `${cand.generationMethod}:${cand.batchIndex}`;
      pts.push({
        idx: ci,
        type: "candidate",
        x: crx.mean,
        y: cry.mean,
        xSem: crx.sem,
        ySem: cry.sem,
        genMethod: cand.generationMethod,
        batch: cand.batchIndex,
        armName: cand.armName,
        visible: !options.hiddenGenMethods[key],
      });
    }
  });

  // Axis range: use provided sticky range if available, else compute from data
  const xRange = options.xRange ?? niceRange(
    Math.min(0, ...pts.map((p) => p.x - CI_Z.c95 * p.xSem)),
    Math.max(0, ...pts.map((p) => p.x + CI_Z.c95 * p.xSem)),
  );
  const yRange = options.yRange ?? niceRange(
    Math.min(0, ...pts.map((p) => p.y - CI_Z.c95 * p.ySem)),
    Math.max(0, ...pts.map((p) => p.y + CI_Z.c95 * p.ySem)),
  );

  const xMin = xRange.lo,
    xMax = xRange.hi;
  const yMin = yRange.lo,
    yMax = yRange.hi;

  const sx = (v: number): number => margin.left + ((v - xMin) / (xMax - xMin)) * pw;
  const sy = (v: number): number => margin.top + ph - ((v - yMin) / (yMax - yMin)) * ph;

  let html = "";
  html += `<rect width="${W}" height="${H}" fill="#fff" rx="8"/>`;
  html += `<defs><clipPath id="plotClip"><rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}"/></clipPath></defs>`;

  // Grid + tick labels
  xRange.ticks.forEach((tv) => {
    html += `<line x1="${sx(tv)}" y1="${margin.top}" x2="${sx(tv)}" y2="${margin.top + ph}" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>`;
    html += `<text x="${sx(tv)}" y="${H - margin.bottom + 16}" text-anchor="middle" fill="#999" font-size="10">${tv}%</text>`;
  });
  yRange.ticks.forEach((tv) => {
    html += `<line x1="${margin.left}" y1="${sy(tv)}" x2="${margin.left + pw}" y2="${sy(tv)}" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>`;
    html += `<text x="${margin.left - 8}" y="${sy(tv) + 3}" text-anchor="end" fill="#999" font-size="10">${tv}%</text>`;
  });

  // Zero reference lines
  if (xMin <= 0 && xMax >= 0) {
    html += `<line x1="${sx(0)}" y1="${margin.top}" x2="${sx(0)}" y2="${margin.top + ph}" stroke="rgba(0,0,0,0.10)" stroke-width="1" stroke-dasharray="4,3"/>`;
  }
  if (yMin <= 0 && yMax >= 0) {
    html += `<line x1="${margin.left}" y1="${sy(0)}" x2="${margin.left + pw}" y2="${sy(0)}" stroke="rgba(0,0,0,0.10)" stroke-width="1" stroke-dasharray="4,3"/>`;
  }

  // Axis labels
  html += `<text x="${margin.left + pw / 2}" y="${H - 8}" text-anchor="middle" fill="#666" font-size="12">${xName} (%)</text>`;
  html += `<text x="14" y="${margin.top + ph / 2}" text-anchor="middle" fill="#666" font-size="12" transform="rotate(-90,14,${margin.top + ph / 2})">${yName} (%)</text>`;

  // Draw items (clipped)
  html += '<g clip-path="url(#plotClip)">';
  pts.forEach((p) => {
    if (!p.visible) return;

    const isSQ = p.type === "arm" && p.idx === options.sqIdx;
    const isCandidate = p.type === "candidate";
    const isSelected =
      options.selectedItem?.type === p.type && options.selectedItem?.idx === p.idx;
    const cx = sx(p.x),
      cy = sy(p.y);
    const color = batchColor(p.batch);
    const tipText = `${p.armName} (${p.genMethod})`;

    html += `<g data-idx="${p.idx}" data-type="${p.type}" data-tip="${tipText}" style="cursor:pointer">`;
    html += `<circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/>`;

    if (isSelected) {
      const rx99 = Math.abs(sx(p.x + CI_Z.c99 * p.xSem) - cx);
      const ry99 = Math.abs(sy(p.y - CI_Z.c99 * p.ySem) - cy);
      const rx95 = Math.abs(sx(p.x + CI_Z.c95 * p.xSem) - cx);
      const ry95 = Math.abs(sy(p.y - CI_Z.c95 * p.ySem) - cy);
      const rx75 = Math.abs(sx(p.x + CI_Z.c75 * p.xSem) - cx);
      const ry75 = Math.abs(sy(p.y - CI_Z.c75 * p.ySem) - cy);
      html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx99}" ry="${ry99}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="0.5" opacity="0.25"/>`;
      html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx95}" ry="${ry95}" fill="${color}" fill-opacity="0.20" stroke="${color}" stroke-width="0.75" opacity="0.40"/>`;
      html += `<ellipse cx="${cx}" cy="${cy}" rx="${rx75}" ry="${ry75}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="0.75" opacity="0.55"/>`;
    }

    if (isSQ) {
      const s = isSelected ? 8 : 7;
      html += `<polygon points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}" fill="${isSelected ? "#fff" : "none"}" stroke="${color}" stroke-width="2"/>`;
    } else if (isCandidate) {
      const starR = isSelected ? 8 : 7;
      html += `<polygon points="${starPoints(cx, cy, starR)}" fill="${color}" stroke="${isSelected ? "#222" : color}" stroke-width="${isSelected ? 1.5 : 0.5}" fill-opacity="0.8"/>`;
    } else {
      const r = isSelected ? 4 : 4.5;
      html += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="${isSelected ? "#222" : "none"}" stroke-width="${isSelected ? 1.5 : 0}"/>`;
    }
    html += "</g>";
  });
  html += "</g>";

  svg.innerHTML = html;
  return { sx, sy, pts };
}

/** Show hover ellipses on the scatter SVG for a given item. */
export function showHoverEllipse(
  svg: SVGSVGElement,
  state: ScatterState,
  item: CockpitSelection,
): SVGGElement | null {
  if (!state.sx || !state.sy) return null;

  const p = state.pts.find((pt) => pt.type === item.type && pt.idx === item.idx);
  if (!p || !p.visible) return null;

  const cx = state.sx(p.x),
    cy = state.sy(p.y);
  const color = batchColor(p.batch);
  const rx99 = Math.abs(state.sx(p.x + CI_Z.c99 * p.xSem) - cx);
  const ry99 = Math.abs(state.sy(p.y - CI_Z.c99 * p.ySem) - cy);
  const rx95 = Math.abs(state.sx(p.x + CI_Z.c95 * p.xSem) - cx);
  const ry95 = Math.abs(state.sy(p.y - CI_Z.c95 * p.ySem) - cy);
  const rx75 = Math.abs(state.sx(p.x + CI_Z.c75 * p.xSem) - cx);
  const ry75 = Math.abs(state.sy(p.y - CI_Z.c75 * p.ySem) - cy);

  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");
  g.setAttribute("pointer-events", "none");

  const e99 = document.createElementNS(ns, "ellipse");
  e99.setAttribute("cx", String(cx));
  e99.setAttribute("cy", String(cy));
  e99.setAttribute("rx", String(rx99));
  e99.setAttribute("ry", String(ry99));
  e99.setAttribute("fill", color);
  e99.setAttribute("fill-opacity", "0.06");
  e99.setAttribute("stroke", color);
  e99.setAttribute("stroke-width", "0.5");
  e99.setAttribute("opacity", "0.20");

  const e95 = document.createElementNS(ns, "ellipse");
  e95.setAttribute("cx", String(cx));
  e95.setAttribute("cy", String(cy));
  e95.setAttribute("rx", String(rx95));
  e95.setAttribute("ry", String(ry95));
  e95.setAttribute("fill", color);
  e95.setAttribute("fill-opacity", "0.12");
  e95.setAttribute("stroke", color);
  e95.setAttribute("stroke-width", "0.75");
  e95.setAttribute("opacity", "0.35");

  const e75 = document.createElementNS(ns, "ellipse");
  e75.setAttribute("cx", String(cx));
  e75.setAttribute("cy", String(cy));
  e75.setAttribute("rx", String(rx75));
  e75.setAttribute("ry", String(ry75));
  e75.setAttribute("fill", color);
  e75.setAttribute("fill-opacity", "0.18");
  e75.setAttribute("stroke", color);
  e75.setAttribute("stroke-width", "0.75");
  e75.setAttribute("opacity", "0.45");

  g.appendChild(e99);
  g.appendChild(e95);
  g.appendChild(e75);

  const clipGroup = svg.querySelector("g[clip-path]");
  if (clipGroup) {
    clipGroup.insertBefore(g, clipGroup.firstChild);
  } else {
    svg.appendChild(g);
  }

  return g;
}

/** Update opacity of scatter dots based on relevance to a reference point. */
export function updateScatterOpacities(
  svg: SVGSVGElement,
  arms: Array<CockpitArm>,
  candidates: Array<CockpitCandidate>,
  refPoint: Array<number> | null,
  paramBounds: Array<[number, number]>,
  distMode: "euclidean" | "bi-objective" | "all-kernel",
  predictor: CockpitPredictor | null,
  outcomeNames: Array<string>,
  xOutIdx: number,
  yOutIdx: number,
): void {
  const groups = svg.querySelectorAll("g[data-idx]");
  if (!refPoint) {
    for (let g = 0; g < groups.length; g++) groups[g].setAttribute("opacity", "1");
    return;
  }

  const relevanceFn = (pt: Array<number>, ref: Array<number>): number => {
    if (distMode === "euclidean" || !predictor) {
      let d2 = 0;
      for (let j = 0; j < ref.length; j++) {
        const diff = pt[j] - ref[j];
        const rng = paramBounds[j][1] - paramBounds[j][0] || 1;
        d2 += (diff / rng) ** 2;
      }
      return Math.exp(-0.5 * d2);
    }

    const indices =
      distMode === "bi-objective"
        ? [xOutIdx, yOutIdx]
        : outcomeNames.map((_, i) => i);

    let logSum = 0;
    let count = 0;
    for (const k of indices) {
      const name = outcomeNames[k];
      if (!name) continue;
      const corr = predictor.kernelCorrelation(pt, ref, name);
      logSum += Math.log(Math.max(corr, 1e-300));
      count++;
    }
    if (count === 0) return Math.exp(-0.5 * pt.reduce((s, v, j) => s + ((v - ref[j]) / (paramBounds[j][1] - paramBounds[j][0] || 1)) ** 2, 0));
    const geoMean = Math.exp(logSum / count);
    return geoMean ** 3;
  };

  const rels: Array<number> = [];
  let maxRel = 0;
  for (let g = 0; g < groups.length; g++) {
    const idx = parseInt(groups[g].getAttribute("data-idx")!);
    const gType = groups[g].getAttribute("data-type");
    const pt =
      gType === "candidate"
        ? candidates[idx]?.params
        : arms[idx]?.params;
    const rel = pt ? relevanceFn(pt, refPoint) : 0;
    rels.push(rel);
    if (rel < 0.999 && rel > maxRel) maxRel = rel;
  }

  const minOpacity = 0.08;
  for (let g = 0; g < groups.length; g++) {
    let opacity: number;
    if (rels[g] > 0.999) {
      opacity = 1;
    } else if (maxRel > 0) {
      opacity = minOpacity + (1 - minOpacity) * Math.pow(rels[g] / maxRel, 0.5);
    } else {
      opacity = minOpacity;
    }
    groups[g].setAttribute("opacity", String(opacity));
  }
}
