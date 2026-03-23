// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { CockpitArm, CockpitCandidate, CockpitSelection } from "./types.js";

import { batchColor } from "./data.js";
import { getItemLabel } from "./deltoid.js";

export type { CockpitSelection } from "./types.js";

const SIGN_COLORS = {
  pos: { first: "#7fbc41", interaction: "#b8e186" },
  neg: { first: "#c51b7d", interaction: "#de77ae" },
};

/** Pre-computed importance data for the slider panel. */
export interface SliderImportance {
  /** First-order Sobol index per dimension. */
  firstOrder: Array<number>;
  /** Total-order Sobol index per dimension. */
  totalOrder: Array<number>;
  /** Sign direction per dimension (+1 or -1). */
  paramSigns: Array<number>;
  /** Outcome name used for importance ranking. */
  outcomeName: string;
}

/** Options for rendering the slider panel. */
export interface SliderOptions {
  paramNames: Array<string>;
  paramBounds: Array<[number, number]>;
  outcomeNames: Array<string>;
  sqIdx: number;
  sliderDimOrder: Array<number> | null;
  /** Pre-computed importance data. Caller is responsible for caching. */
  importance?: SliderImportance | null;
}

/**
 * Render the parameter sliders panel for the selected arm/candidate.
 *
 * Importance bars and param signs are provided via `options.importance`
 * (pre-computed and cached by the caller). This function never calls
 * `computeSensitivity` — it's a pure renderer.
 */
export function renderSlidersPanel(
  container: HTMLElement,
  selectedItem: CockpitSelection | null,
  arms: Array<CockpitArm>,
  candidates: Array<CockpitCandidate>,
  options: SliderOptions,
  callbacks: {
    onSliderChange: (dim: number, value: number) => void;
    onClone: () => void;
    onDelete?: () => void;
  },
): void {
  if (!selectedItem) {
    container.innerHTML = "";
    return;
  }

  const nDims = options.paramNames.length;
  const isCandidate = selectedItem.type === "candidate";
  const isEditable = isCandidate;
  const params =
    isCandidate ? candidates[selectedItem.idx].params : arms[selectedItem.idx].params;
  const label = getItemLabel(selectedItem, arms, candidates, options.sqIdx);

  const itemColor =
    selectedItem.type === "candidate"
      ? batchColor(candidates[selectedItem.idx]?.batchIndex ?? 0)
      : batchColor(arms[selectedItem.idx]?.batchIndex ?? 0);
  const statusBadge =
    selectedItem.type === "candidate"
      ? ' <span style="color:#999;font-size:inherit">[PENDING]</span>'
      : "";

  let html = '<div class="slider-section">';
  html += `<div class="section-title"><span style="color:${itemColor}">${label}</span>${statusBadge}`;
  html += ' <button class="clone-btn" id="btnClone">clone</button>';
  if (isCandidate) {
    html += ' <button class="delete-btn" id="btnDeleteCand">remove</button>';
  }
  html += "</div>";

  // Use pre-computed importance data
  const imp = options.importance;
  const impFirst = imp?.firstOrder ?? new Array<number>(nDims).fill(0);
  const impTotal = imp?.totalOrder ?? new Array<number>(nDims).fill(0);
  let maxImp = 0;
  for (let d = 0; d < nDims; d++) {
    if ((impTotal[d] ?? 0) > maxImp) maxImp = impTotal[d] ?? 0;
  }

  if (imp) {
    html += `<div style="font-size:10px;color:#888;margin-bottom:6px">Parameters ranked by influence on <span style="color:#4872f9;font-weight:600">${imp.outcomeName}</span></div>`;
  }

  const dimOrder =
    options.sliderDimOrder ??
    Array.from({ length: nDims }, (_, i) => i);

  const paramSigns = imp?.paramSigns ?? new Array<number>(nDims).fill(1);

  for (const j of dimOrder) {
    const bLo = options.paramBounds[j][0],
      bHi = options.paramBounds[j][1];
    const val = params[j];
    const step = (bHi - bLo) / 200;

    const s1 = Math.max(0, Math.min(impFirst[j] || 0, impTotal[j] || 0));
    const st = Math.max(0, impTotal[j] || 0);
    const totalW = maxImp > 0 ? Math.round((st / maxImp) * 96) : 0;
    let firstW = st > 0 ? Math.round((s1 / st) * totalW) : totalW;
    if (st > s1 && totalW > 6 && totalW - firstW < 4) firstW = totalW - 4;
    const signOutcome = imp?.outcomeName ?? options.outcomeNames[0];
    const totalPct = ((impTotal[j] || 0) * 100).toFixed(1);
    const firstPct = ((s1 || 0) * 100).toFixed(1);
    const signLabel = (paramSigns[j] ?? 1) >= 0 ? "↑ increases" : "↑ decreases";
    const tipText = `${options.paramNames[j]} explains ${totalPct}% of variance in ${signOutcome} (${firstPct}% main effect, ${signLabel} it)`;

    html += '<div class="param-row">';
    const labelStyle = isEditable ? "color:#333" : "";
    html += `<label style="${labelStyle}" data-tip="${tipText}">${options.paramNames[j]}`;
    const dimSign = paramSigns[j] ?? 1;
    const cols = dimSign >= 0 ? SIGN_COLORS.pos : SIGN_COLORS.neg;
    const interW = totalW - firstW;
    // Bar direction encodes sign: positive grows left→right, negative right→left
    const anchor = dimSign >= 0 ? "left" : "right";
    if (totalW > 1) {
      if (firstW > 0) {
        html += `<span class="imp-bar" style="${anchor}:0;width:${firstW}px;background:${cols.first};opacity:0.7"></span>`;
      }
      if (interW > 0) {
        html += `<span class="imp-bar" style="${anchor}:${firstW}px;width:${interW}px;background:${cols.interaction};opacity:0.7"></span>`;
      }
    }
    html += "</label>";
    html += `<input type="range" min="${bLo}" max="${bHi}" step="${step}" value="${val}" data-dim="${j}"${isEditable ? "" : " disabled"}>`;
    html += `<span class="param-val" id="pval${j}">${val.toFixed(3)}</span>`;
    html += "</div>";
  }
  html += "</div>";
  container.innerHTML = html;

  // Wire up clone button
  document.getElementById("btnClone")?.addEventListener("click", callbacks.onClone);

  // Wire up delete button
  if (isCandidate && callbacks.onDelete) {
    document.getElementById("btnDeleteCand")?.addEventListener("click", callbacks.onDelete);
  }

  // Wire up slider inputs for candidates
  if (isCandidate) {
    const sliders = container.querySelectorAll("input[type=range]");
    sliders.forEach((slider) => {
      slider.addEventListener("input", () => {
        const dim = parseInt((slider as HTMLInputElement).getAttribute("data-dim")!);
        const value = parseFloat((slider as HTMLInputElement).value);
        const valEl = document.getElementById(`pval${dim}`);
        if (valEl) valEl.textContent = value.toFixed(3);
        callbacks.onSliderChange(dim, value);
      });
    });
  }
}
