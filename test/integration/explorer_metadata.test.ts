// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Explorer metadata plumbing tests.
 *
 * Verifies that observations, candidates, and optimization_config from an
 * explorer fixture are correctly loaded and accessible through Predictor.
 * Also verifies prediction parity at observation and candidate locations.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { Predictor } from "../../src/predictor";
import { relativizePredictions } from "../../src/transforms/relativize";

const fixturesDir = join(__dirname, "..", "fixtures");
const TOLERANCE = 1e-8;

function loadFixture(filename: string): any {
  const raw = readFileSync(join(fixturesDir, filename), "utf8");
  return JSON.parse(raw);
}

function expectAllClose(
  actual: Float64Array | Array<number>,
  expected: Array<number>,
  atol: number,
  label: string,
): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const absDiff = Math.abs(actual[i] - expected[i]);
    const tol = atol + atol * Math.abs(expected[i]);
    if (absDiff > tol) {
      throw new Error(
        `${label}[${i}]: expected ${expected[i]}, got ${actual[i]}, diff=${absDiff} > tol=${tol}`,
      );
    }
  }
}

describe("explorer fixture metadata", () => {
  const fixture = loadFixture("explorer_c2dtlz2.json");
  const exp = fixture.experiment;

  it("has observations with correct counts and batches", () => {
    expect(exp.observations).toBeDefined();
    expect(exp.observations.length).toBe(13);

    const sobol = exp.observations.filter((o: any) => o.generation_method === "Sobol");
    const bo = exp.observations.filter((o: any) => o.generation_method === "qEHVI");
    expect(sobol.length).toBe(7);
    expect(bo.length).toBe(6);
  });

  it("observations have correct trial metadata", () => {
    for (const obs of exp.observations) {
      expect(obs.arm_name).toBeDefined();
      expect(obs.parameters).toBeDefined();
      expect(obs.metrics).toBeDefined();
      expect(obs.trial_index).toBeDefined();
      expect(obs.trial_status).toBe("COMPLETED");
      expect(["Sobol", "qEHVI"]).toContain(obs.generation_method);

      if (obs.generation_method === "Sobol") {
        expect(obs.trial_index).toBe(0);
      } else {
        expect(obs.trial_index).toBe(1);
      }
    }
  });

  it("observations have all outcome metrics", () => {
    for (const obs of exp.observations) {
      for (const name of exp.outcome_names) {
        expect(obs.metrics[name]).toBeDefined();
        expect(typeof obs.metrics[name].mean).toBe("number");
      }
    }
  });

  it("has candidates with correct metadata", () => {
    expect(exp.candidates).toBeDefined();
    expect(exp.candidates.length).toBe(5);

    for (const cand of exp.candidates) {
      expect(cand.arm_name).toBeDefined();
      expect(cand.parameters).toBeDefined();
      expect(cand.trial_index).toBe(2);
      expect(cand.generation_method).toBe("qEHVI");
    }
  });

  it("has optimization_config with objectives, constraints, thresholds", () => {
    const oc = exp.optimization_config;
    expect(oc).toBeDefined();

    expect(oc.objectives).toHaveLength(2);
    expect(oc.objectives[0]).toEqual({ name: "f0", minimize: true });
    expect(oc.objectives[1]).toEqual({ name: "f1", minimize: true });

    expect(oc.outcome_constraints).toHaveLength(1);
    expect(oc.outcome_constraints[0].name).toBe("c0");
    expect(oc.outcome_constraints[0].op).toBe("GEQ");

    expect(oc.objective_thresholds).toHaveLength(2);
  });

  it("has status_quo", () => {
    expect(exp.status_quo).toBeDefined();
    expect(exp.status_quo.point).toHaveLength(4);
  });

  it("Predictor predictions match expected at test points", () => {
    const predictor = new Predictor(exp);
    const predictions = predictor.predict(fixture.test.test_points);

    const expectedMeans = fixture.test.expected.mean as Array<Array<number>>;
    const expectedVars = fixture.test.expected.variance as Array<Array<number>>;

    for (let k = 0; k < exp.outcome_names.length; k++) {
      const name = exp.outcome_names[k];
      expectAllClose(predictions[name].mean, expectedMeans[k], TOLERANCE, `${name} mean`);
      expectAllClose(predictions[name].variance, expectedVars[k], TOLERANCE, `${name} variance`);
    }
  });

  it("Predictor can predict at observation locations", () => {
    const predictor = new Predictor(exp);
    const paramNames = exp.search_space.parameters.map((p: any) => p.name);

    for (const obs of exp.observations) {
      const point = paramNames.map((n: string) => obs.parameters[n]);
      const pred = predictor.predict([point]);

      for (const name of exp.outcome_names) {
        expect(typeof pred[name].mean[0]).toBe("number");
        expect(isFinite(pred[name].mean[0])).toBe(true);
        // GP posterior at training points should be reasonably close to observations
        // (model-level Standardize + noise means predictions ≈ observations, not exact)
        const predMean = pred[name].mean[0];
        const obsMean = obs.metrics[name].mean;
        const relDiff =
          Math.abs(obsMean) > 0.01
            ? Math.abs(predMean - obsMean) / Math.abs(obsMean)
            : Math.abs(predMean - obsMean);
        expect(relDiff).toBeLessThan(0.5); // within 50% (generous for noise-free GP)
        expect(pred[name].variance[0]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("Predictor can predict at candidate locations", () => {
    const predictor = new Predictor(exp);
    const paramNames = exp.search_space.parameters.map((p: any) => p.name);

    for (const cand of exp.candidates) {
      const point = paramNames.map((n: string) => cand.parameters[n]);
      const pred = predictor.predict([point]);

      for (const name of exp.outcome_names) {
        expect(typeof pred[name].mean[0]).toBe("number");
        expect(isFinite(pred[name].mean[0])).toBe(true);
        expect(pred[name].variance[0]).toBeGreaterThan(0);
      }
    }
  });

  it("predict + relativizePredictions works with status quo", () => {
    const predictor = new Predictor(exp);
    // Just verify it runs without errors and produces finite results
    const testPoints = fixture.test.test_points.slice(0, 3);
    const absPreds = predictor.predict(testPoints);
    const sqPreds = predictor.predict([predictor.statusQuoPoint!]);

    for (const name of exp.outcome_names) {
      const rel = relativizePredictions(
        absPreds[name].mean,
        absPreds[name].variance,
        sqPreds[name].mean[0],
        sqPreds[name].variance[0],
      );
      for (let i = 0; i < testPoints.length; i++) {
        expect(isFinite(rel.mean[i])).toBe(true);
        expect(rel.variance[i]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
