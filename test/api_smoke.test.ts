/**
 * Smoke test for the axjs public API surface.
 *
 * Verifies that public imports compile, Predictor works end-to-end on a real
 * fixture, and sub-exports (viz, acquisition) are accessible.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// 1. Public API imports
import { Predictor, loadModel, relativize } from "../src/index.js";
import type { ExperimentState, PredictionResult } from "../src/index.js";

// 10. Viz imports
import {
  viridis,
  plasma,
  isChoice,
  normalizeFixture,
} from "../src/viz/index.js";

// 11. Acquisition imports
import {
  UpperConfidenceBound,
  LogExpectedImprovement,
} from "../src/acquisition/index.js";

// ── Load fixture ──────────────────────────────────────────────────────────

const fixturePath = join(__dirname, "fixtures", "branin_matern25.json");
const fixtureRaw = JSON.parse(readFileSync(fixturePath, "utf-8"));
const experimentState: ExperimentState = fixtureRaw.experiment;

describe("Public API imports", () => {
  it("Predictor, loadModel, relativize are defined", () => {
    expect(Predictor).toBeDefined();
    expect(loadModel).toBeDefined();
    expect(relativize).toBeDefined();
  });
});

describe("Predictor properties", () => {
  const predictor = new Predictor(experimentState);

  it("paramNames returns string array", () => {
    expect(predictor.paramNames).toEqual(["x0", "x1"]);
  });

  it("paramBounds returns array of [lo, hi] tuples", () => {
    const bounds = predictor.paramBounds;
    expect(bounds).toHaveLength(2);
    for (const [lo, hi] of bounds) {
      expect(typeof lo).toBe("number");
      expect(typeof hi).toBe("number");
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });

  it("outcomeNames returns string array", () => {
    expect(predictor.outcomeNames).toEqual(["y"]);
  });

  it("statusQuoPoint is null for this fixture", () => {
    expect(predictor.statusQuoPoint).toBeNull();
  });
});

describe("Predictor.predict()", () => {
  const predictor = new Predictor(experimentState);
  const testPoints = fixtureRaw.test.test_points.slice(0, 3);
  const result = predictor.predict(testPoints);

  it("returns object keyed by outcome name", () => {
    expect(Object.keys(result)).toEqual(["y"]);
  });

  it("mean is a Float64Array with correct length", () => {
    const pred = result["y"];
    expect(pred.mean).toBeInstanceOf(Float64Array);
    expect(pred.mean).toHaveLength(3);
  });

  it("variance is a Float64Array with correct length", () => {
    const pred = result["y"];
    expect(pred.variance).toBeInstanceOf(Float64Array);
    expect(pred.variance).toHaveLength(3);
  });

  it("variance values are positive", () => {
    const pred = result["y"];
    for (let i = 0; i < pred.variance.length; i++) {
      expect(pred.variance[i]).toBeGreaterThan(0);
    }
  });
});

describe("Predictor.getTrainingData()", () => {
  const predictor = new Predictor(experimentState);
  const td = predictor.getTrainingData("y");

  it("returns non-empty X and Y", () => {
    expect(td.X.length).toBeGreaterThan(0);
    expect(td.Y.length).toBeGreaterThan(0);
    expect(td.X.length).toBe(td.Y.length);
  });

  it("Y values are NOT near zero (i.e. not raw standardized)", () => {
    // Branin function has range roughly [0, 300]; standardized would be near 0
    const maxAbsY = Math.max(...td.Y.map(Math.abs));
    expect(maxAbsY).toBeGreaterThan(1);
  });

  it("paramNames matches predictor.paramNames", () => {
    expect(td.paramNames).toEqual(["x0", "x1"]);
  });
});

describe("Predictor.getLengthscales()", () => {
  const predictor = new Predictor(experimentState);
  const ls = predictor.getLengthscales("y");

  it("returns array of positive numbers", () => {
    expect(ls).not.toBeNull();
    expect(Array.isArray(ls)).toBe(true);
    for (const val of ls!) {
      expect(typeof val).toBe("number");
      expect(val).toBeGreaterThan(0);
    }
  });
});

describe("Predictor.loocv()", () => {
  const predictor = new Predictor(experimentState);
  const cv = predictor.loocv("y");

  it("observed, mean, variance are same length", () => {
    expect(cv.observed.length).toBe(cv.mean.length);
    expect(cv.observed.length).toBe(cv.variance.length);
    expect(cv.observed.length).toBeGreaterThan(0);
  });

  it("variance values are positive", () => {
    for (let i = 0; i < cv.variance.length; i++) {
      expect(cv.variance[i]).toBeGreaterThan(0);
    }
  });
});

describe("Predictor.rankDimensionsByImportance()", () => {
  const predictor = new Predictor(experimentState);
  const ranked = predictor.rankDimensionsByImportance("y");

  it("returns sorted array with dimIndex and lengthscale", () => {
    expect(ranked).not.toBeNull();
    expect(ranked!.length).toBeGreaterThan(0);
    for (const entry of ranked!) {
      expect(typeof entry.dimIndex).toBe("number");
      expect(typeof entry.lengthscale).toBe("number");
      expect(entry.lengthscale).toBeGreaterThan(0);
      expect(typeof entry.paramName).toBe("string");
    }
  });

  it("sorted by ascending lengthscale (most important first)", () => {
    // rankDimensionsByImportance sorts by lengthscale ascending
    // (shorter lengthscale = more important)
    for (let i = 1; i < ranked!.length; i++) {
      expect(ranked![i].lengthscale).toBeGreaterThanOrEqual(
        ranked![i - 1].lengthscale,
      );
    }
  });
});

describe("Predictor.kernelCorrelation()", () => {
  const predictor = new Predictor(experimentState);
  const td = predictor.getTrainingData("y");
  const pt = td.X[0];

  it("returns number in [0, 1]", () => {
    const corr = predictor.kernelCorrelation(pt, td.X[1], "y");
    expect(typeof corr).toBe("number");
    expect(corr).toBeGreaterThanOrEqual(0);
    expect(corr).toBeLessThanOrEqual(1);
  });

  it("self-correlation is approximately 1", () => {
    const selfCorr = predictor.kernelCorrelation(pt, pt, "y");
    expect(selfCorr).toBeCloseTo(1, 5);
  });
});

describe("Viz imports", () => {
  it("viridis returns RGB tuple", () => {
    const rgb = viridis(0.5);
    expect(rgb).toHaveLength(3);
    for (const c of rgb) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    }
  });

  it("plasma returns RGB tuple", () => {
    const rgb = plasma(0.5);
    expect(rgb).toHaveLength(3);
  });

  it("isChoice works", () => {
    expect(isChoice({ type: "choice", values: ["a", "b"] })).toBe(true);
    expect(isChoice({ type: "range", bounds: [0, 1] })).toBe(false);
  });

  it("normalizeFixture extracts experiment state", () => {
    const normalized = normalizeFixture(fixtureRaw);
    expect(normalized.search_space).toBeDefined();
    expect(normalized.model_state).toBeDefined();
    expect(normalized.outcome_names).toEqual(["y"]);
  });
});

describe("Acquisition imports", () => {
  it("UpperConfidenceBound is a constructor", () => {
    expect(typeof UpperConfidenceBound).toBe("function");
  });

  it("LogExpectedImprovement is a constructor", () => {
    expect(typeof LogExpectedImprovement).toBe("function");
  });
});
