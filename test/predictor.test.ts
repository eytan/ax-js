import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Predictor } from "../src/predictor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

function loadFixture(name: string) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf-8"));
}

const TOLERANCE = 1e-6;

describe("Predictor", () => {
  describe("single-output model (branin)", () => {
    const fixture = loadFixture("branin_matern25.json");
    const predictor = new Predictor(fixture.experiment);

    it("exposes param names from search_space", () => {
      expect(predictor.paramNames.length).toBe(2);
      expect(predictor.paramNames).toEqual(
        fixture.experiment.search_space.parameters.map((p: any) => p.name),
      );
    });

    it("exposes param bounds from search_space", () => {
      expect(predictor.paramBounds.length).toBe(2);
      for (let i = 0; i < 2; i++) {
        const expected = fixture.experiment.search_space.parameters[i].bounds || [0, 1];
        expect(predictor.paramBounds[i]).toEqual(expected);
      }
    });

    it("defaults outcome name to 'y' for single-output", () => {
      expect(predictor.outcomeNames).toEqual(["y"]);
    });

    it("predict returns results keyed by outcome name", () => {
      const preds = predictor.predict(fixture.test.test_points);
      expect(preds).toHaveProperty("y");
      expect(preds["y"].mean.length).toBe(fixture.test.test_points.length);
      expect(preds["y"].variance.length).toBe(fixture.test.test_points.length);
    });

    it("predictions match expected values", () => {
      const preds = predictor.predict(fixture.test.test_points);
      for (let i = 0; i < fixture.test.expected.mean.length; i++) {
        expect(Math.abs(preds["y"].mean[i] - fixture.test.expected.mean[i])).toBeLessThan(TOLERANCE);
      }
    });
  });

  describe("multi-output model (ModelListGP)", () => {
    const fixture = loadFixture("vsip_modellist.json");
    const predictor = new Predictor(fixture.experiment);

    it("exposes outcome names from ModelListGP", () => {
      expect(predictor.outcomeNames.length).toBe(9);
      expect(predictor.outcomeNames[0]).toBe("weight");
    });

    it("predict returns one key per outcome", () => {
      const preds = predictor.predict(fixture.test.test_points);
      for (const name of predictor.outcomeNames) {
        expect(preds).toHaveProperty(name);
        expect(preds[name].mean.length).toBe(fixture.test.test_points.length);
      }
    });

    it("predictions match expected values for all outcomes", () => {
      const preds = predictor.predict(fixture.test.test_points);
      const expectedMeans = fixture.test.expected.mean as number[][];
      for (let k = 0; k < predictor.outcomeNames.length; k++) {
        const name = predictor.outcomeNames[k];
        for (let i = 0; i < expectedMeans[k].length; i++) {
          expect(Math.abs(preds[name].mean[i] - expectedMeans[k][i])).toBeLessThan(TOLERANCE);
        }
      }
    });
  });

  describe("custom outcome_names override", () => {
    const fixture = loadFixture("branin_matern25.json");
    const predictor = new Predictor({
      ...fixture.experiment,
      outcome_names: ["branin_value"],
    });

    it("uses provided outcome_names", () => {
      expect(predictor.outcomeNames).toEqual(["branin_value"]);
    });

    it("predict keys results by custom name", () => {
      const preds = predictor.predict(fixture.test.test_points);
      expect(preds).toHaveProperty("branin_value");
      expect(preds).not.toHaveProperty("y");
    });
  });

  describe("adapter transforms", () => {
    // Use branin_matern25 as base — its predictions are in the raw GP space
    const fixture = loadFixture("branin_matern25.json");

    it("no adapter transforms: passthrough (same as raw model)", () => {
      const predictor = new Predictor(fixture.experiment);
      const preds = predictor.predict(fixture.test.test_points);
      for (let i = 0; i < fixture.test.expected.mean.length; i++) {
        expect(Math.abs(preds["y"].mean[i] - fixture.test.expected.mean[i])).toBeLessThan(TOLERANCE);
      }
    });

    it("LogY adapter transform applies exp(mu + var/2) mean", () => {
      const predictor = new Predictor({
        ...fixture.experiment,
        adapter_transforms: [{ type: "LogY" as const }],
      });
      const rawPredictor = new Predictor(fixture.experiment);
      const rawPreds = rawPredictor.predict(fixture.test.test_points);
      const preds = predictor.predict(fixture.test.test_points);

      for (let i = 0; i < fixture.test.test_points.length; i++) {
        const mu = rawPreds["y"].mean[i];
        const v = rawPreds["y"].variance[i];
        const expectedMean = Math.exp(mu + v / 2);
        expect(preds["y"].mean[i]).toBeCloseTo(expectedMean, 8);
      }
    });

    it("StandardizeY adapter transform reverses standardization", () => {
      const Ymean = 10.0;
      const Ystd = 2.5;
      const predictor = new Predictor({
        ...fixture.experiment,
        adapter_transforms: [{
          type: "StandardizeY" as const,
          Ymean: { y: Ymean },
          Ystd: { y: Ystd },
        }],
      });
      const rawPredictor = new Predictor(fixture.experiment);
      const rawPreds = rawPredictor.predict(fixture.test.test_points);
      const preds = predictor.predict(fixture.test.test_points);

      for (let i = 0; i < fixture.test.test_points.length; i++) {
        const expectedMean = Ymean + Ystd * rawPreds["y"].mean[i];
        const expectedVar = Ystd * Ystd * rawPreds["y"].variance[i];
        expect(preds["y"].mean[i]).toBeCloseTo(expectedMean, 8);
        expect(preds["y"].variance[i]).toBeCloseTo(expectedVar, 8);
      }
    });

    it("LogY with metrics only applies to matching outcomes", () => {
      const vsipFixture = loadFixture("vsip_modellist.json");
      // Apply LogY only to "weight" metric
      const predictor = new Predictor({
        ...vsipFixture.experiment,
        adapter_transforms: [{ type: "LogY" as const, metrics: ["weight"] }],
      });
      const rawPredictor = new Predictor(vsipFixture.experiment);
      const rawPreds = rawPredictor.predict(vsipFixture.test.test_points);
      const preds = predictor.predict(vsipFixture.test.test_points);

      // "weight" should be log-transformed
      const mu0 = rawPreds["weight"].mean[0];
      const v0 = rawPreds["weight"].variance[0];
      expect(preds["weight"].mean[0]).toBeCloseTo(Math.exp(mu0 + v0 / 2), 8);

      // "acceleration" should be unchanged
      expect(preds["acceleration"].mean[0]).toBeCloseTo(rawPreds["acceleration"].mean[0], 10);
    });
  });

  describe("convenience methods", () => {
    describe("getTrainingData", () => {
      it("returns training data for single-output model", () => {
        const fixture = loadFixture("branin_matern25.json");
        const predictor = new Predictor(fixture.experiment);
        const td = predictor.getTrainingData();
        expect(td.X.length).toBeGreaterThan(0);
        expect(td.Y.length).toBe(td.X.length);
        expect(td.paramNames).toEqual(predictor.paramNames);
        // X should be a copy, not a reference
        td.X[0][0] = -999;
        const td2 = predictor.getTrainingData();
        expect(td2.X[0][0]).not.toBe(-999);
      });

      it("returns per-outcome data for ModelListGP", () => {
        const fixture = loadFixture("vsip_modellist.json");
        const predictor = new Predictor(fixture.experiment);
        const td0 = predictor.getTrainingData(predictor.outcomeNames[0]);
        const td1 = predictor.getTrainingData(predictor.outcomeNames[1]);
        expect(td0.X.length).toBeGreaterThan(0);
        expect(td1.X.length).toBeGreaterThan(0);
      });

      it("un-standardizes Y when outcome_transform has mean/std", () => {
        const fixture = loadFixture("branin_matern25.json");
        const ms = fixture.experiment.model_state;
        if (ms.outcome_transform && ms.outcome_transform.mean !== undefined) {
          const predictor = new Predictor(fixture.experiment);
          const td = predictor.getTrainingData();
          // Y should be un-standardized: y_raw = mean + std * y_internal
          const rawY0 = ms.outcome_transform.mean + ms.outcome_transform.std * ms.train_Y[0];
          expect(td.Y[0]).toBeCloseTo(rawY0, 10);
        }
      });
    });

    describe("getLengthscales", () => {
      it("returns lengthscales for single-output model", () => {
        const fixture = loadFixture("branin_matern25.json");
        const predictor = new Predictor(fixture.experiment);
        const ls = predictor.getLengthscales();
        expect(ls).not.toBeNull();
        expect(ls!.length).toBe(2); // branin has 2 dims
        for (const l of ls!) {
          expect(l).toBeGreaterThan(0);
        }
      });

      it("returns lengthscales for a specific outcome in ModelListGP", () => {
        const fixture = loadFixture("vsip_modellist.json");
        const predictor = new Predictor(fixture.experiment);
        const ls = predictor.getLengthscales(predictor.outcomeNames[0]);
        expect(ls).not.toBeNull();
        expect(ls!.length).toBeGreaterThan(0);
      });
    });

    describe("rankDimensionsByImportance", () => {
      it("returns dimensions sorted by lengthscale (shortest first)", () => {
        const fixture = loadFixture("branin_matern25.json");
        const predictor = new Predictor(fixture.experiment);
        const ranked = predictor.rankDimensionsByImportance();
        expect(ranked.length).toBe(2);
        // Should be sorted: shortest lengthscale first
        expect(ranked[0].lengthscale).toBeLessThanOrEqual(ranked[1].lengthscale);
        // Should have correct param names
        expect(predictor.paramNames).toContain(ranked[0].paramName);
      });
    });

    describe("kernelCorrelation", () => {
      it("returns 1 for identical points", () => {
        const fixture = loadFixture("branin_matern25.json");
        const predictor = new Predictor(fixture.experiment);
        const pt = fixture.experiment.model_state.train_X[0];
        expect(predictor.kernelCorrelation(pt, pt)).toBeCloseTo(1.0, 10);
      });

      it("returns value in (0, 1) for different points", () => {
        const fixture = loadFixture("branin_matern25.json");
        const predictor = new Predictor(fixture.experiment);
        const pt1 = fixture.experiment.model_state.train_X[0];
        const pt2 = fixture.experiment.model_state.train_X[1];
        const corr = predictor.kernelCorrelation(pt1, pt2);
        expect(corr).toBeGreaterThan(0);
        expect(corr).toBeLessThan(1);
      });
    });

    describe("loocv", () => {
      it("returns LOO predictions that differ from observed (not interpolating)", () => {
        const fixture = loadFixture("branin_matern25.json");
        const predictor = new Predictor(fixture.experiment);
        const loo = predictor.loocv();
        expect(loo.observed.length).toBeGreaterThan(0);
        expect(loo.mean.length).toBe(loo.observed.length);
        expect(loo.variance.length).toBe(loo.observed.length);
        // LOO predictions should NOT be identical to observed (GP interpolates, LOO doesn't)
        let allSame = true;
        for (let i = 0; i < loo.observed.length; i++) {
          if (Math.abs(loo.mean[i] - loo.observed[i]) > 1e-4) allSame = false;
          expect(loo.variance[i]).toBeGreaterThan(0);
        }
        expect(allSame).toBe(false);
      });

      it("works for ModelListGP with specific outcome", () => {
        const fixture = loadFixture("vsip_modellist.json");
        const predictor = new Predictor(fixture.experiment);
        const loo = predictor.loocv("weight");
        expect(loo.observed.length).toBeGreaterThan(0);
        expect(loo.mean.length).toBe(loo.observed.length);
        // LOO variance should be positive
        for (let i = 0; i < loo.variance.length; i++) {
          expect(loo.variance[i]).toBeGreaterThan(0);
        }
      });

      it("LOO R² is reasonable for a well-fit model", () => {
        const fixture = loadFixture("penicillin_modellist.json");
        const predictor = new Predictor(fixture.experiment);
        const loo = predictor.loocv(predictor.outcomeNames[0]);
        const yBar = loo.observed.reduce((a, b) => a + b, 0) / loo.observed.length;
        const ssTot = loo.observed.reduce((a, y) => a + (y - yBar) ** 2, 0);
        const ssRes = loo.observed.reduce((a, y, i) => a + (y - loo.mean[i]) ** 2, 0);
        const r2 = 1 - ssRes / ssTot;
        // LOO R² should be positive (model explains more than the mean)
        expect(r2).toBeGreaterThan(0);
      });
    });

  });
});
