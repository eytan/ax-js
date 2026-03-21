// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Benchmark: Sobol' cost scaling with n_train and n_outcomes.
 * Run: npx tsx test/bench_scaling.ts
 */
import type { ExperimentState, GPModelState } from "../src/models/types.js";

import { Predictor } from "../src/predictor.js";
import { boundsInputTransform } from "../src/transforms/normalize.js";

function buildSyntheticModelList(d: number, nTrain: number, nOutcomes: number): ExperimentState {
  const params = Array.from({ length: d }, (_, i) => ({
    name: `x${i}`,
    type: "range" as const,
    bounds: [0, 10] as [number, number],
  }));
  const inputTf = boundsInputTransform(params.map((p) => p.bounds));
  const trainX: Array<Array<number>> = [];
  for (let i = 0; i < nTrain; i++) {
    trainX.push(params.map((p) => p.bounds[0] + Math.random() * (p.bounds[1] - p.bounds[0])));
  }

  const models: Array<GPModelState> = [];
  const outcomeNames: Array<string> = [];
  for (let k = 0; k < nOutcomes; k++) {
    outcomeNames.push(`y${k}`);
    models.push({
      model_type: "SingleTaskGP",
      train_X: trainX,
      train_Y: Array.from({ length: nTrain }, () => Math.random() * 2 - 1),
      kernel: {
        type: "RBF",
        lengthscale: Array.from({ length: d }, () => 0.1 + Math.random() * 0.9),
      },
      mean_constant: 0,
      noise_variance: 0.01,
      input_transform: inputTf,
      outcome_transform: { type: "Standardize", mean: 5, std: 2 },
    });
  }

  return {
    search_space: { parameters: params },
    model_state: { model_type: "ModelListGP", outcome_names: outcomeNames, models },
    outcome_names: outcomeNames,
  };
}

function timeOne(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

console.log("=== Sobol' Scaling Benchmark (d=15) ===\n");
console.log("n_train | n_outcomes | N    | per-outcome (ms) | total (ms)");
console.log("--------|------------|------|------------------|----------");

for (const nTrain of [25, 50, 100, 200]) {
  for (const nOut of [1, 9, 20, 50]) {
    const state = buildSyntheticModelList(15, nTrain, nOut);
    const predictor = new Predictor(state);

    for (const N of [128, 256, 512]) {
      // Time all outcomes
      const times: Array<number> = [];
      for (let k = 0; k < nOut; k++) {
        const seed = k * 1000 + N; // unique seed to avoid cache hits
        const t = timeOne(() => predictor.computeSensitivity(`y${k}`, { numSamples: N, seed }));
        times.push(t);
      }
      const total = times.reduce((a, b) => a + b, 0);
      const perOutcome = total / nOut;
      console.log(
        String(nTrain).padStart(7) +
          " | " +
          String(nOut).padStart(10) +
          " | " +
          String(N).padStart(4) +
          " | " +
          perOutcome.toFixed(1).padStart(16) +
          " | " +
          total.toFixed(0).padStart(9),
      );
    }
  }
}
