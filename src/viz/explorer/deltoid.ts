// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { CockpitArm, CockpitCandidate, CockpitSelection, NiceRange } from "./types.js";
import type { MetricConfig, OptimizationConfig } from "../../models/types.js";

import {
  batchColor,
  CI_Z,
  ciColors,
  outcomeDesiredSign,
  starPoints,
} from "./data.js";

/** Options for rendering the deltoid panel. */
export interface DeltoidOptions {
  customMetricOrder: Array<string>;
  panelRange: NiceRange;
  outcomeNames: Array<string>;
  xOutcome?: string;
  yOutcome?: string;
  sqIdx: number;
  sliderOutcome: string | null;
  metricConfigs: Array<MetricConfig>;
  optimizationConfig: OptimizationConfig;
}

/**
 * Get item display label.
 */
export function getItemLabel(
  item: CockpitSelection,
  arms: Array<CockpitArm>,
  candidates: Array<CockpitCandidate>,
  sqIdx: number,
): string {
  if (item.type === "candidate") {
    const cand = candidates[item.idx];
    let method = cand.generationMethod;
    if (cand.edited) method += " (edited)";
    return `${cand.armName} \u2014 ${method}`;
  }
  const arm = arms[item.idx];
  let label = `${arm.armName} \u2014 ${arm.generationMethod}`;
  if (item.idx === sqIdx) label += " (Control)";
  return label;
}

/**
 * Render the deltoid (CI bars) panel into a container element.
 *
 * Shows relativized predictions for all outcomes as nested CI bars
 * (99%/95%/75%) with constraint visualization, violation badges,
 * and drag-to-reorder support.
 */
export function renderDeltoidPanel(
  container: HTMLElement,
  titleEl: HTMLElement,
  item: CockpitSelection | null,
  arms: Array<CockpitArm>,
  candidates: Array<CockpitCandidate>,
  options: DeltoidOptions,
): void {
  if (!item) {
    titleEl.textContent = "Hover over an arm to see all outcomes";
    container.innerHTML = "";
    return;
  }

  const itemRelData =
    item.type === "candidate"
      ? candidates[item.idx]?.relData
      : arms[item.idx]?.relData;

  const itemColor =
    item.type === "candidate"
      ? batchColor(candidates[item.idx]?.batchIndex ?? 0)
      : batchColor(arms[item.idx]?.batchIndex ?? 0);

  const label = getItemLabel(item, arms, candidates, options.sqIdx);
  const statusBadge =
    item.type === "candidate"
      ? ' <span style="color:#999;font-size:inherit">[PENDING]</span>'
      : "";

  if (!itemRelData) {
    titleEl.innerHTML = `<span style="color:${itemColor}">${label}</span>${statusBadge} \u2014 no data`;
    container.innerHTML = "";
    return;
  }

  titleEl.innerHTML = `<span style="color:${itemColor}">${label}</span>${statusBadge}`;

  const itemPreds =
    item.type === "candidate"
      ? candidates[item.idx]?.preds
      : arms[item.idx]?.preds;

  // Precompute constraint bounds in relative space
  const sqPred = arms[options.sqIdx]?.preds;
  const relConstraintBounds: Record<string, { rel: number; op: string }> = {};

  if (sqPred) {
    const addBounds = (constraints: Array<{ name: string; bound: number; op: string }>) => {
      for (const c of constraints) {
        const sqMean = sqPred[c.name]?.mean[0];
        if (sqMean === undefined) continue;
        const absSqMean = Math.abs(sqMean);
        if (absSqMean > 1e-10) {
          relConstraintBounds[c.name] = {
            rel: ((c.bound - sqMean) / absSqMean) * 100,
            op: c.op,
          };
        }
      }
    };
    if (options.optimizationConfig.outcome_constraints) {
      addBounds(options.optimizationConfig.outcome_constraints);
    }
    if (options.optimizationConfig.objective_thresholds) {
      addBounds(options.optimizationConfig.objective_thresholds);
    }
  }

  // Build metric config lookup
  const mcMap = new Map<string, MetricConfig>();
  for (const mc of options.metricConfigs) mcMap.set(mc.name, mc);

  const constraintMap = new Map<string, { bound: number; op: string }>();
  const thresholdMap = new Map<string, { bound: number; op: string }>();
  if (options.optimizationConfig.outcome_constraints) {
    for (const c of options.optimizationConfig.outcome_constraints) constraintMap.set(c.name, c);
  }
  if (options.optimizationConfig.objective_thresholds) {
    for (const t of options.optimizationConfig.objective_thresholds) thresholdMap.set(t.name, t);
  }

  const sortedNames = options.customMetricOrder;
  const rowH = 30,
    barH = 11,
    handleW = 14,
    labelW = 140,
    barW = 220,
    valW = 100,
    pad = 8;
  const totalW = handleW + labelW + barW + valW + pad * 3;
  const topPad = 20;
  const totalH = sortedNames.length * rowH + topPad + 8;

  const lo = options.panelRange.lo,
    hi = options.panelRange.hi;
  const bx = (v: number): number => handleW + labelW + pad + ((v - lo) / (hi - lo)) * barW;

  let s = `<svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">`;

  // Layer 1: Alternating row stripes + active-outcome highlight
  sortedNames.forEach((name, k) => {
    const stripY = k * rowH + topPad;
    if (options.sliderOutcome === name) {
      s += `<rect x="0" y="${stripY}" width="${totalW}" height="${rowH}" fill="rgba(72,114,249,0.12)"/>`;
    } else if (k % 2 === 1) {
      s += `<rect x="0" y="${stripY}" width="${totalW}" height="${rowH}" fill="#f7f7f7"/>`;
    }
  });

  // Layer 2: Grid lines + zero reference
  options.panelRange.ticks.forEach((tv) => {
    const tx = bx(tv);
    s += `<text x="${tx}" y="12" text-anchor="middle" fill="#999" font-size="9" font-family="sans-serif">${tv}%</text>`;
    s += `<line x1="${tx}" y1="16" x2="${tx}" y2="${totalH - 4}" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>`;
  });

  if (lo <= 0 && hi >= 0) {
    const x0 = bx(0);
    s += `<line x1="${x0}" y1="16" x2="${x0}" y2="${totalH - 4}" stroke="rgba(0,0,0,0.30)" stroke-width="1"/>`;
  }

  // Layer 3: Row content
  sortedNames.forEach((name, k) => {
    const cy = k * rowH + rowH / 2 + topPad;
    const r = itemRelData[name];
    const mc = mcMap.get(name);
    const constraint = constraintMap.get(name);
    const threshold = thresholdMap.get(name);
    const isObj = mc?.intent === "objective";
    const isActiveOutcome = options.sliderOutcome === name;

    let labelText = name;
    let labelColor = "#999";
    if (isObj) {
      labelText = (mc?.lower_is_better ? "\u2193 " : "\u2191 ") + name;
      labelColor = "#333";
    } else if (constraint) {
      labelText = `${name} ${constraint.op === "LEQ" ? "\u2264" : "\u2265"} ${constraint.bound}`;
      labelColor = "#555";
    }
    if (isActiveOutcome) labelColor = "#4872f9";

    // Drag handle
    s += `<g data-drag-handle="${name}" style="cursor:grab">`;
    s += `<rect x="0" y="${cy - rowH / 2}" width="${handleW}" height="${rowH}" fill="transparent"/>`;
    for (let di = 0; di < 3; di++) {
      const dotY = cy - 4 + di * 4;
      s += `<circle cx="${handleW / 2 - 1.5}" cy="${dotY}" r="1.2" fill="#bbb"/>`;
      s += `<circle cx="${handleW / 2 + 1.5}" cy="${dotY}" r="1.2" fill="#bbb"/>`;
    }
    s += "</g>";

    s += `<g data-outcome="${name}">`;
    // Full-row hit area so hover detection works in the gap between handle and label
    s += `<rect x="${handleW}" y="${cy - rowH / 2}" width="${totalW - handleW}" height="${rowH}" fill="transparent"/>`;

    // Check constraint violation
    let violated = false;
    let violatedBound: number | null = null;
    let violatedOp: string | null = null;
    if (r && itemPreds) {
      const predMean = itemPreds[name]?.mean[0] ?? 0;
      const predVar = itemPreds[name]?.variance[0] ?? 0;
      const predSem = Math.sqrt(Math.max(0, predVar));
      if (constraint) {
        if (constraint.op === "LEQ" && predMean + 1.96 * predSem > constraint.bound) {
          violated = true;
          violatedBound = constraint.bound;
          violatedOp = constraint.op;
        }
        if (constraint.op === "GEQ" && predMean - 1.96 * predSem < constraint.bound) {
          violated = true;
          violatedBound = constraint.bound;
          violatedOp = constraint.op;
        }
      }
      if (threshold) {
        if (threshold.op === "LEQ" && predMean + 1.96 * predSem > threshold.bound) {
          violated = true;
          violatedBound = threshold.bound;
          violatedOp = threshold.op;
        }
        if (threshold.op === "GEQ" && predMean - 1.96 * predSem < threshold.bound) {
          violated = true;
          violatedBound = threshold.bound;
          violatedOp = threshold.op;
        }
      }
    }

    // X/Y axis badges — variables computed here, rendered last for z-order
    const xBadgeX = handleW + 2;
    const yBadgeX = handleW + 18;
    const isX = options.xOutcome ? name === options.xOutcome : false;
    const isY = options.yOutcome ? name === options.yOutcome : false;

    const metricType = isObj ? "Objective" : constraint ? "Constraint" : "Tracking metric";
    s += `<text data-tip="${metricType}" x="${handleW + labelW - 4}" y="${cy + 4}" text-anchor="end" fill="${labelColor}" font-size="11" font-family="sans-serif" style="cursor:pointer"${isActiveOutcome ? ' font-weight="600"' : ""}>${labelText}</text>`;


    if (r) {
      const desiredSign = outcomeDesiredSign(name, options.metricConfigs);
      let cols = ciColors(r.mean, r.sem, desiredSign);
      if (violated) {
        cols = { c99: "#fde0ef", c95: "#de77ae", c75: "#c51b7d", tick: "#8e0152", isBad: true };
      }

      let intervalTooltip: string;
      if (cols.isBad) {
        intervalTooltip = `Metric regression: ${r.mean.toFixed(2)}%`;
        if (violated && violatedBound !== null) {
          const boundRel = relConstraintBounds[name];
          if (boundRel) {
            intervalTooltip += `\nFalls ${violatedOp === "LEQ" ? "above" : "below"} constraint threshold ${violatedBound} (${boundRel.rel.toFixed(1)}%)`;
          }
        }
      } else if (cols.c75 === "#b8b8b8") {
        intervalTooltip = `Likely neutral: ${r.mean.toFixed(2)}%`;
      } else {
        intervalTooltip = `Metric improvement: ${r.mean.toFixed(2)}%`;
      }

      if (violated) {
        const haloX1 = bx(r.mean - CI_Z.c99 * r.sem) - 2;
        const haloX2 = bx(r.mean + CI_Z.c99 * r.sem) + 2;
        const haloW = Math.max(4, haloX2 - haloX1);
        s += `<rect x="${haloX1}" y="${cy - barH / 2 - 2}" width="${haloW}" height="${barH + 4}" fill="none" stroke="#d32f2f" stroke-width="1.5" rx="3"/>`;
      }

      const escapedTip = intervalTooltip.replace(/"/g, "&quot;");
      const intervals = [
        { z: CI_Z.c99, fill: cols.c99, h: barH },
        { z: CI_Z.c95, fill: cols.c95, h: barH - 2 },
        { z: CI_Z.c75, fill: cols.c75, h: barH - 4 },
      ];
      for (const ci of intervals) {
        const x1 = bx(r.mean - ci.z * r.sem);
        const x2 = bx(r.mean + ci.z * r.sem);
        const w = Math.max(1, x2 - x1);
        s += `<rect data-tip="${escapedTip}" x="${x1}" y="${cy - ci.h / 2}" width="${w}" height="${ci.h}" fill="${ci.fill}" rx="1.5"/>`;
      }

      const xm = bx(r.mean);
      s += `<line data-tip="${escapedTip}" x1="${xm}" y1="${cy - barH / 2 + 1}" x2="${xm}" y2="${cy + barH / 2 - 1}" stroke="${cols.tick}" stroke-width="2"/>`;

      // Constraint bound dashed line
      const boundInfo = relConstraintBounds[name];
      if (boundInfo && boundInfo.rel >= lo && boundInfo.rel <= hi) {
        const bxPos = bx(boundInfo.rel);
        const boundColor = violated ? "#d32f2f" : "#4d9221";
        const opWord = boundInfo.op === "LEQ" ? "less" : "greater";
        const boundTooltip = `${name} must be ${opWord} than ${boundInfo.rel.toFixed(1)}%`;
        const escapedBound = boundTooltip.replace(/"/g, "&quot;");
        s += `<line data-tip="${escapedBound}" x1="${bxPos}" y1="${cy - barH / 2 - 3}" x2="${bxPos}" y2="${cy + barH / 2 + 3}" stroke="${boundColor}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
        s += `<line data-tip="${escapedBound}" x1="${bxPos}" y1="${cy - barH / 2 - 3}" x2="${bxPos}" y2="${cy + barH / 2 + 3}" stroke="transparent" stroke-width="8"/>`;
      }

      const valStr = `${r.mean.toFixed(2)}\u00B1${(1.96 * r.sem).toFixed(2)}%`;
      s += `<text x="${handleW + labelW + pad + barW + pad * 2}" y="${cy + 4}" fill="${violated ? "#c66" : "#777"}" font-size="10" font-family="sans-serif">${valStr}</text>`;
      if (violated) {
        s += `<text x="${handleW + labelW + pad + barW + pad * 2 + valW - 21}" y="${cy + 5}" fill="#d32f2f" font-size="13" font-weight="700" font-family="sans-serif">\u26A0</text>`;
      }
    } else {
      s += `<text x="${handleW + labelW + pad + barW / 2}" y="${cy + 4}" text-anchor="middle" fill="#999" font-size="10" font-style="italic" font-family="sans-serif">N/A</text>`;
    }
    // X/Y axis badges (rendered last to be on top in z-order)
    // Only rendered when scatter axes are defined (cockpit mode)
    if (options.xOutcome || options.yOutcome) {
      const persist = isX || isY;
      s += `<g class="axis-badges" data-badges-row="${name}">`;
      s += `<rect data-badge-x="${name}" x="${xBadgeX}" y="${cy - 6}" width="14" height="12" rx="2" fill="${isX ? "#4872f9" : "#c0c0c0"}" opacity="${persist ? "1" : "0"}" pointer-events="${persist ? "auto" : "none"}"${persist ? " data-persist" : ""} data-tip="${isX ? "X axis (click for importance)" : "Set as X axis"}" style="cursor:pointer"/>`;
      s += `<text x="${xBadgeX + 7}" y="${cy + 3}" text-anchor="middle" fill="#fff" font-size="8" font-weight="700" font-family="sans-serif" pointer-events="none" opacity="${persist ? "1" : "0"}">X</text>`;
      s += `<rect data-badge-y="${name}" x="${yBadgeX}" y="${cy - 6}" width="14" height="12" rx="2" fill="${isY ? "#4872f9" : "#c0c0c0"}" opacity="${persist ? "1" : "0"}" pointer-events="${persist ? "auto" : "none"}"${persist ? " data-persist" : ""} data-tip="${isY ? "Y axis (click for importance)" : "Set as Y axis"}" style="cursor:pointer"/>`;
      s += `<text x="${yBadgeX + 7}" y="${cy + 3}" text-anchor="middle" fill="#fff" font-size="8" font-weight="700" font-family="sans-serif" pointer-events="none" opacity="${persist ? "1" : "0"}">Y</text>`;
      s += "</g>";
    }
    s += "</g>";
  });
  s += "</svg>";

  container.innerHTML = s;
}
