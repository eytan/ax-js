// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Smoke test for the ax-js public API surface.
 *
 * Verifies that public imports compile, Predictor works end-to-end on a real
 * fixture, and sub-exports (viz, acquisition) are accessible.
 */
import type { ExperimentState } from "../src/index.js";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { UpperConfidenceBound, LogExpectedImprovement } from "../src/acquisition/index.js";
import { Predictor, loadModel, relativize } from "../src/index.js";
import { viridis, plasma, isChoice, normalizeFixture } from "../src/viz/index.js";

const fixturePath = join(__dirname, "fixtures", "branin_matern25.json");
const fixtureRaw = JSON.parse(readFileSync(fixturePath, "utf8"));
const experimentState: ExperimentState = fixtureRaw.experiment;

describe("Public API smoke", () => {
  it("core exports are defined", () => {
    expect(Predictor).toBeDefined();
    expect(loadModel).toBeDefined();
    expect(relativize).toBeDefined();
  });

  it("Predictor exposes metadata", () => {
    const p = new Predictor(experimentState);
    expect(p.paramNames).toEqual(["x0", "x1"]);
    expect(p.paramBounds).toHaveLength(2);
    expect(p.outcomeNames).toEqual(["y"]);
  });

  it("predict returns keyed Float64Array results with positive variance", () => {
    const p = new Predictor(experimentState);
    const result = p.predict(fixtureRaw.test.test_points.slice(0, 3));
    expect(Object.keys(result)).toEqual(["y"]);
    expect(result["y"].mean).toBeInstanceOf(Float64Array);
    expect(result["y"].mean).toHaveLength(3);
    for (const v of result["y"].variance) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it("getTrainingData returns untransformed Y", () => {
    const p = new Predictor(experimentState);
    const td = p.getTrainingData("y");
    expect(td.X.length).toBe(td.Y.length);
    expect(td.X.length).toBeGreaterThan(0);
    // Branin has range ~[0, 300]; standardized would be near 0
    expect(Math.max(...td.Y.map(Math.abs))).toBeGreaterThan(1);
  });

  it("getLengthscales, loocv, rankDimensions, kernelCorrelation", () => {
    const p = new Predictor(experimentState);

    const ls = p.getLengthscales("y");
    expect(ls).not.toBeNull();
    for (const v of ls!) {
      expect(v).toBeGreaterThan(0);
    }

    const cv = p.loocv("y");
    expect(cv.observed.length).toBe(cv.mean.length);
    for (const v of cv.variance) {
      expect(v).toBeGreaterThan(0);
    }

    const ranked = p.rankDimensionsByImportance("y");
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].lengthscale).toBeGreaterThanOrEqual(ranked[i - 1].lengthscale);
    }

    const td = p.getTrainingData("y");
    expect(p.kernelCorrelation(td.X[0], td.X[0], "y")).toBeCloseTo(1, 5);
    const corr = p.kernelCorrelation(td.X[0], td.X[1], "y");
    expect(corr).toBeGreaterThanOrEqual(0);
    expect(corr).toBeLessThanOrEqual(1);
  });

  it("viz exports work", () => {
    const rgb = viridis(0.5);
    expect(rgb).toHaveLength(3);
    expect(plasma(0.5)).toHaveLength(3);
    expect(isChoice({ type: "choice", values: ["a", "b"] })).toBe(true);
    expect(isChoice({ type: "range", bounds: [0, 1] })).toBe(false);
    expect(normalizeFixture(fixtureRaw).model_state).toBeDefined();
  });

  it("acquisition exports are constructors", () => {
    expect(typeof UpperConfidenceBound).toBe("function");
    expect(typeof LogExpectedImprovement).toBe("function");
  });
});
