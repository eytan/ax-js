// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Estimate the min/max range of GP posterior predictions across the search space.
 *
 * Uses scrambled Halton sampling for space-filling evaluation, followed by
 * batched multi-start gradient-free optimization from the best candidates.
 * For high-d problems, projects to the top active dimensions (ranked by
 * lengthscale) to keep the Halton phase efficient.
 */
import type { RenderPredictor } from "./types";

import { Rng } from "../acquisition/sample_mvn.js";
import { haltonSequence } from "../sensitivity.js";

import { isChoice } from "./params";

/** Estimated range for one outcome. */
export interface EstimatedRange {
  /** Minimum posterior mean. */
  muMin: number;
  /** Maximum posterior mean. */
  muMax: number;
  /** Minimum of μ − k·σ (lower CI bound). */
  ciMin: number;
  /** Maximum of μ + k·σ (upper CI bound). */
  ciMax: number;
}

// First 32 primes — enough for Halton in up to 32 active dimensions
const MAX_HALTON_D = 32;

/**
 * Estimate the posterior range for each outcome.
 *
 * @param predictor - The GP predictor to evaluate.
 * @param ciMultiplier - CI half-width multiplier (default 1.96 for 95% CI).
 * @param outcomes - Outcomes to estimate (default: all).
 * @returns Per-outcome range estimates.
 */
export function estimateRange(
  predictor: RenderPredictor,
  ciMultiplier: number = 1.96,
  outcomes?: Array<string>,
): Record<string, EstimatedRange> {
  const names = outcomes ?? predictor.outcomeNames;
  const result: Record<string, EstimatedRange> = {};

  const d = predictor.paramNames.length;
  const bounds = predictor.paramBounds;
  const specs = predictor.paramSpecs;

  // Identify choice (categorical) dims — these are sampled discretely, not via Halton
  const choiceDims = new Set<number>();
  const choiceValues: Map<number, Array<number>> = new Map();
  if (specs) {
    for (let j = 0; j < d; j++) {
      if (isChoice(specs[j])) {
        choiceDims.add(j);
        choiceValues.set(j, specs[j].values!.map(Number));
      }
    }
  }

  // Continuous dims for Halton sampling
  const contDims: Array<number> = [];
  for (let j = 0; j < d; j++) {
    if (!choiceDims.has(j)) {
      contDims.push(j);
    }
  }

  // Dimension reduction: rank continuous dims by importance (1/lengthscale),
  // keep top MAX_HALTON_D. Fix the rest at midpoint.
  let activeDims = contDims;
  const fixedDimValues = new Map<number, number>();

  if (contDims.length > MAX_HALTON_D) {
    // Prefer Sobol sensitivity indices (handles EnsembleGP, warping, etc.)
    // Falls back to lengthscale ranking if computeSensitivity is unavailable
    let importantDims: Array<number> | null = null;

    if (predictor.computeSensitivity) {
      try {
        const sens = predictor.computeSensitivity(names[0]);
        // Sort by total-order index (descending = most important first)
        const indexed = sens.totalOrder.map((v, i) => ({ i, v }));
        indexed.sort((a, b) => b.v - a.v);
        importantDims = indexed
          .map((x) => x.i)
          .filter((i) => !choiceDims.has(i))
          .slice(0, MAX_HALTON_D);
      } catch {
        // Fall through to lengthscale ranking
      }
    }

    if (!importantDims) {
      const ranked = predictor.rankDimensionsByImportance?.(names[0]);
      if (ranked && ranked.length > 0) {
        importantDims = ranked
          .map((r) => r.dimIndex)
          .filter((i) => !choiceDims.has(i))
          .slice(0, MAX_HALTON_D);
      }
    }

    if (importantDims && importantDims.length > 0) {
      activeDims = importantDims;
      // Fix remaining continuous dims at midpoint
      for (const j of contDims) {
        if (!activeDims.includes(j)) {
          fixedDimValues.set(j, (bounds[j][0] + bounds[j][1]) / 2);
        }
      }
    } else {
      // No ranking available — take first MAX_HALTON_D dims
      activeDims = contDims.slice(0, MAX_HALTON_D);
      for (const j of contDims.slice(MAX_HALTON_D)) {
        fixedDimValues.set(j, (bounds[j][0] + bounds[j][1]) / 2);
      }
    }
  }

  const dEff = activeDims.length;

  // Adaptive budget based on effective dimensionality
  const nInitial = dEff <= 6 ? 256 : dEff <= 12 ? 384 : 512;
  const nStarts = dEff <= 6 ? 4 : 8;
  const nSteps = dEff <= 6 ? 5 : 10;

  // Phase 1: Generate Halton points in the active subspace, embed into full space
  const rng = new Rng(42);
  const haltonD = Math.min(dEff, MAX_HALTON_D);
  const haltonPts = haltonD > 0 ? haltonSequence(nInitial, haltonD, rng) : [];

  // For choice dims, sample each value uniformly across the Halton points
  // nChoicePerPt could expand, but 1 random choice per point is fine

  const fullPoints: Array<Array<number>> = [];
  for (let i = 0; i < nInitial; i++) {
    const pt = new Array(d);

    // Fill active continuous dims from Halton (mapped to bounds)
    for (let ai = 0; ai < activeDims.length; ai++) {
      const j = activeDims[ai];
      const h = haltonD > 0 ? haltonPts[i][ai] : rng.uniform();
      pt[j] = bounds[j][0] + h * (bounds[j][1] - bounds[j][0]);
    }

    // Fill fixed continuous dims
    for (const [j, v] of fixedDimValues) {
      pt[j] = v;
    }

    // Fill choice dims with random values
    for (const j of choiceDims) {
      const vals = choiceValues.get(j)!;
      pt[j] = vals[Math.floor(rng.uniform() * vals.length)];
    }

    fullPoints.push(pt);
  }

  // Also include training points — they're observed and should be in range
  const td0 = predictor.getTrainingData();
  for (const pt of td0.X) {
    fullPoints.push(pt);
  }

  // Evaluate all points
  const allPreds = predictor.predict(fullPoints);

  for (const outcome of names) {
    const pred = allPreds[outcome];
    if (!pred) {
      result[outcome] = { muMin: 0, muMax: 1, ciMin: 0, ciMax: 1 };
      continue;
    }

    let muMin = Infinity,
      muMax = -Infinity;
    let ciMin = Infinity,
      ciMax = -Infinity;

    // Track top candidates for optimization
    interface Cand {
      idx: number;
      ciUp: number;
      ciLo: number;
    }
    const maxCands: Array<Cand> = [];
    const minCands: Array<Cand> = [];

    for (let i = 0; i < fullPoints.length; i++) {
      const mu = pred.mean[i];
      const s = Math.sqrt(pred.variance[i]);
      const up = mu + ciMultiplier * s;
      const lo = mu - ciMultiplier * s;

      if (mu < muMin) {
        muMin = mu;
      }
      if (mu > muMax) {
        muMax = mu;
      }
      if (lo < ciMin) {
        ciMin = lo;
      }
      if (up > ciMax) {
        ciMax = up;
      }

      // Only track Halton points as candidates (not training points)
      if (i < nInitial) {
        maxCands.push({ idx: i, ciUp: up, ciLo: lo });
        minCands.push({ idx: i, ciUp: up, ciLo: lo });
      }
    }

    // Phase 2: Batched multi-start optimization
    // Select top candidates
    maxCands.sort((a, b) => b.ciUp - a.ciUp);
    minCands.sort((a, b) => a.ciLo - b.ciLo);

    const maxStarts = maxCands.slice(0, nStarts).map((c) => fullPoints[c.idx].slice());
    const minStarts = minCands.slice(0, nStarts).map((c) => fullPoints[c.idx].slice());

    const eps = 1e-4;
    const lr = 0.02;
    const totalStarts = maxStarts.length + minStarts.length;

    for (let step = 0; step < nSteps; step++) {
      // Build batch: for each start point, base + d perturbations (only active dims)
      const batchPts: Array<Array<number>> = [];
      const allStarts = [...maxStarts, ...minStarts];
      for (const pt of allStarts) {
        batchPts.push(pt.slice());
        for (const j of activeDims) {
          const ptP = pt.slice();
          ptP[j] = Math.min(bounds[j][1], pt[j] + eps * (bounds[j][1] - bounds[j][0]));
          batchPts.push(ptP);
        }
      }

      const bPred = predictor.predict(batchPts)[outcome];
      if (!bPred) {
        break;
      }

      let offset = 0;
      for (let si = 0; si < totalStarts; si++) {
        const isMax = si < maxStarts.length;
        const pt = isMax ? maxStarts[si] : minStarts[si - maxStarts.length];

        const mu0 = bPred.mean[offset];
        const s0 = Math.sqrt(bPred.variance[offset]);
        const val0 = isMax ? mu0 + ciMultiplier * s0 : mu0 - ciMultiplier * s0;

        // Update global range
        if (mu0 > muMax) {
          muMax = mu0;
        }
        if (mu0 < muMin) {
          muMin = mu0;
        }
        if (mu0 + ciMultiplier * s0 > ciMax) {
          ciMax = mu0 + ciMultiplier * s0;
        }
        if (mu0 - ciMultiplier * s0 < ciMin) {
          ciMin = mu0 - ciMultiplier * s0;
        }

        // Compute gradient w.r.t. active dims
        const grad: Array<number> = [];
        for (let ai = 0; ai < activeDims.length; ai++) {
          const muJ = bPred.mean[offset + 1 + ai];
          const sJ = Math.sqrt(bPred.variance[offset + 1 + ai]);
          const valJ = isMax ? muJ + ciMultiplier * sJ : muJ - ciMultiplier * sJ;
          grad.push(
            (valJ - val0) / (eps * (bounds[activeDims[ai]][1] - bounds[activeDims[ai]][0])),
          );
        }

        const gradNorm = Math.sqrt(grad.reduce((s, g) => s + g * g, 0));
        if (gradNorm > 1e-8) {
          for (let ai = 0; ai < activeDims.length; ai++) {
            const j = activeDims[ai];
            const range = bounds[j][1] - bounds[j][0];
            const stepJ = (lr * range * grad[ai]) / gradNorm;
            pt[j] = Math.max(
              bounds[j][0],
              Math.min(bounds[j][1], pt[j] + (isMax ? stepJ : -stepJ)),
            );
          }
        }

        offset += 1 + activeDims.length;
      }
    }

    // Final evaluation of optimized points
    const finalPts = [...maxStarts, ...minStarts];
    if (finalPts.length > 0) {
      const fPred = predictor.predict(finalPts)[outcome];
      if (fPred) {
        for (let i = 0; i < finalPts.length; i++) {
          const mu = fPred.mean[i];
          const s = Math.sqrt(fPred.variance[i]);
          if (mu > muMax) {
            muMax = mu;
          }
          if (mu < muMin) {
            muMin = mu;
          }
          if (mu + ciMultiplier * s > ciMax) {
            ciMax = mu + ciMultiplier * s;
          }
          if (mu - ciMultiplier * s < ciMin) {
            ciMin = mu - ciMultiplier * s;
          }
        }
      }
    }

    result[outcome] = { muMin, muMax, ciMin, ciMax };
  }

  return result;
}
