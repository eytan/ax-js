// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Benchmark: Sobol' sensitivity vs response surface rendering cost
 * for 15D GPs with n=50 and n=200 training points.
 *
 * Run: npx tsx test/bench_sensitivity.ts
 */
import type { ExperimentState, GPModelState } from "../src/models/types.js";

import { Predictor } from "../src/predictor.js";
import { boundsInputTransform } from "../src/transforms/normalize.js";

// ── Synthetic 15D GP builder ────────────────────────────────────────────

function buildSyntheticGP(d: number, _n: number): ExperimentState {
  const n = _n;
  const rng = (): number => Math.random();
  const params = Array.from({ length: d }, (_, i) => ({
    name: `x${i}`,
    type: "range" as const,
    bounds: [0, 10] as [number, number],
  }));

  const bounds = params.map((p) => p.bounds);
  const inputTf = boundsInputTransform(bounds);

  // Random training data
  const trainX: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    trainX.push(params.map((p) => p.bounds[0] + rng() * (p.bounds[1] - p.bounds[0])));
  }
  // Random Y values (standardized)
  const trainY = Array.from({ length: n }, () => rng() * 2 - 1);

  // Random lengthscales in normalized space
  const lengthscale = Array.from({ length: d }, () => 0.1 + rng() * 0.9);

  const modelState: GPModelState = {
    model_type: "SingleTaskGP",
    train_X: trainX,
    train_Y: trainY,
    kernel: {
      type: "RBF",
      lengthscale,
    },
    mean_constant: 0,
    noise_variance: 0.01,
    input_transform: inputTf,
    outcome_transform: { type: "Standardize", mean: 5, std: 2 },
  };

  return {
    search_space: { parameters: params },
    model_state: modelState,
    outcome_names: ["y"],
  };
}

// ── Timing helper ───────────────────────────────────────────────────────

function timeMs(fn: () => void, label: string): number {
  // Warmup
  fn();
  // Timed runs
  const runs = 3;
  const times: Array<number> = [];
  for (let r = 0; r < runs; r++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(runs / 2)];
  console.log(
    `  ${label}: ${median.toFixed(1)} ms (median of ${runs}, all: [${times.map((t) => t.toFixed(1)).join(", ")}])`,
  );
  return median;
}

// ── Response surface cost simulation ────────────────────────────────────
// The actual renderResponseSurface uses a gridSize x gridSize grid of predictions
// plus one more predict call per training point for dot rendering.
// Default gridSize = 30.

function simulateResponseSurface(predictor: Predictor, gridSize: number = 30): void {
  const _n = predictor.paramNames.length;
  // Build grid points (gridSize^2 points in 2D slice, other dims fixed at midpoint)
  const mid = predictor.paramBounds.map(([lo, hi]) => (lo + hi) / 2);
  const points: Array<Array<number>> = [];
  const [lo0, hi0] = predictor.paramBounds[0];
  const [lo1, hi1] = predictor.paramBounds[1];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const pt = mid.slice();
      pt[0] = lo0 + (i / (gridSize - 1)) * (hi0 - lo0);
      pt[1] = lo1 + (j / (gridSize - 1)) * (hi1 - lo1);
      points.push(pt);
    }
  }
  predictor.predict(points);
}

// ── Main benchmark ──────────────────────────────────────────────────────

console.log("=== Sobol' Sensitivity Benchmark ===\n");

for (const n of [50, 200]) {
  const d = 15;
  console.log(`\n--- d=${d}, n=${n} ---`);

  const state = buildSyntheticGP(d, n);
  const predictor = new Predictor(state);

  // Verify basic prediction works
  const testPt = predictor.paramBounds.map(([lo, hi]) => (lo + hi) / 2);
  predictor.predict([testPt]);

  // Time Sobol' at different sample counts
  for (const numSamples of [256, 512, 1024]) {
    const totalEvals = numSamples * (d + 2);
    timeMs(() => {
      // Clear cache by using different seeds each time
      const seed = Math.floor(Math.random() * 1e9);
      predictor.computeSensitivity("y", { numSamples, seed });
    }, `Sobol' N=${numSamples} (${totalEvals} GP evals)`);
  }

  // Time response surface rendering (grid prediction)
  for (const gridSize of [30, 50]) {
    const totalEvals = gridSize * gridSize;
    timeMs(
      () => simulateResponseSurface(predictor, gridSize),
      `Response surface ${gridSize}x${gridSize} grid (${totalEvals} GP evals)`,
    );
  }

  // Time a single batch prediction for reference
  const batchSizes = [100, 1000, 5000];
  for (const bs of batchSizes) {
    const pts = Array.from({ length: bs }, () =>
      predictor.paramBounds.map(([lo, hi]) => lo + Math.random() * (hi - lo)),
    );
    timeMs(() => predictor.predict(pts), `predict(${bs} points)`);
  }
}

console.log("\n=== Done ===");
