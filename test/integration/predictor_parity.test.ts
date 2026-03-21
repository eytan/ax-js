// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Predictor ↔ Ax Adapter parity tests — AUTHORITATIVE end-to-end parity.
 *
 * Ground truth: Ax's actual adapter.predict() pipeline (observation space).
 * These are the definitive tests for "given clean input from Ax, axjs
 * predictions match what Ax would predict."
 *
 * Unlike botorch_parity.test.ts (low-level model math consistency), these
 * tests verify the full Predictor pipeline including adapter-level transforms
 * (LogY, BilogY, StandardizeY, PowerTransformY) and multi-task iteration.
 *
 * Fixture format:
 * - Single-output: expected.mean/variance are number[]
 * - Multi-output (ModelListGP): expected.mean/variance are number[][]
 * - All-tasks (MultiTaskGP): expected.mean/variance are Record<string, number[]>
 * - Relativization: expected_relative has relative means/variances
 */
import type { FixtureData, Manifest } from "../../src/models/types.js";

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { Predictor } from "../../src/predictor.js";
import { relativizePredictions } from "../../src/transforms/relativize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

const TOLERANCE = 1e-8;

function loadFixture(filename: string): FixtureData {
  const raw = readFileSync(join(fixturesDir, filename), "utf8");
  return JSON.parse(raw) as FixtureData;
}

const manifest: Manifest = JSON.parse(readFileSync(join(fixturesDir, "manifest.json"), "utf8"));

// Select only ax-level fixtures (those with ax_level: true in metadata)
const axFixtures = manifest.fixtures.filter((entry) => {
  const fp = join(fixturesDir, entry.file);
  if (!existsSync(fp)) {
    return false;
  }
  const f = JSON.parse(readFileSync(fp, "utf8"));
  return f.test.metadata?.ax_level === true;
});

function expectAllClose(
  actual: Float64Array | Array<number>,
  expected: Array<number>,
  atol: number,
  label: string,
): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const absDiff = Math.abs(actual[i] - expected[i]);
    // numpy allclose: |a-b| <= atol + rtol*|b|, with rtol=atol for uniform relative precision
    const tol = atol + atol * Math.abs(expected[i]);
    if (absDiff > tol) {
      throw new Error(
        `${label}[${i}]: expected ${expected[i]}, got ${actual[i]}, diff=${absDiff} > tol=${tol}`,
      );
    }
  }
}

describe("Predictor ↔ Ax Adapter parity", () => {
  if (axFixtures.length === 0) {
    it.skip("no ax-level fixtures found", () => {});
    return;
  }

  for (const entry of axFixtures) {
    const fixture = loadFixture(entry.file);

    // Sanity: expected values must have meaningful signal (not trivially near-zero)
    const TRIVIAL_THRESHOLD = 1e-5;
    const rawMeans = fixture.test.expected.mean;
    const flatMeans: Array<number> =
      rawMeans === null
        ? []
        : typeof rawMeans === "object" && !Array.isArray(rawMeans)
          ? Object.values(rawMeans).flat()
          : Array.isArray(rawMeans[0])
            ? (rawMeans as Array<Array<number>>).flat()
            : (rawMeans as Array<number>);
    const maxAbsMean = flatMeans.length > 0 ? Math.max(...flatMeans.map(Math.abs)) : 0;
    if (flatMeans.length > 0 && maxAbsMean < TRIVIAL_THRESHOLD) {
      throw new Error(
        `Fixture "${entry.name}": all expected means are near-zero (max |mean| = ${maxAbsMean}). ` +
          `This makes the parity test vacuous.`,
      );
    }

    const isAllTasks =
      fixture.test.metadata?.all_tasks === true &&
      typeof fixture.test.expected.mean === "object" &&
      !Array.isArray(fixture.test.expected.mean);

    describe(`fixture: ${entry.name}`, () => {
      it("Predictor loads without error", () => {
        const predictor = new Predictor(fixture.experiment);
        expect(predictor).toBeTruthy();
      });

      if (isAllTasks) {
        // All-tasks MultiTaskGP: expected is {outcome_name: [values]}
        it("predictions match for all tasks", () => {
          const predictor = new Predictor(fixture.experiment);
          const predictions = predictor.predict(fixture.test.test_points);
          const expectedMeans = fixture.test.expected.mean as Record<string, Array<number>>;
          const expectedVars = fixture.test.expected.variance as Record<string, Array<number>>;

          for (const name of Object.keys(expectedMeans)) {
            expect(predictions[name]).toBeDefined();
            expectAllClose(predictions[name].mean, expectedMeans[name], TOLERANCE, `${name} mean`);
            expectAllClose(
              predictions[name].variance,
              expectedVars[name],
              TOLERANCE,
              `${name} variance`,
            );
          }
        });
      } else if (
        Array.isArray(fixture.test.expected.mean) &&
        fixture.test.expected.mean.length > 0 &&
        Array.isArray(fixture.test.expected.mean[0])
      ) {
        // Multi-output ModelListGP: expected.mean is number[][]
        const expectedMeans = fixture.test.expected.mean as Array<Array<number>>;
        const expectedVars = fixture.test.expected.variance as Array<Array<number>>;

        for (let k = 0; k < expectedMeans.length; k++) {
          const outcomeName = fixture.experiment.outcome_names?.[k] ?? `y${k}`;
          it(`outcome "${outcomeName}" mean matches`, () => {
            const predictor = new Predictor(fixture.experiment);
            const predictions = predictor.predict(fixture.test.test_points);
            expect(predictions[outcomeName]).toBeDefined();
            expectAllClose(
              predictions[outcomeName].mean,
              expectedMeans[k],
              TOLERANCE,
              `${outcomeName} mean`,
            );
          });

          it(`outcome "${outcomeName}" variance matches`, () => {
            const predictor = new Predictor(fixture.experiment);
            const predictions = predictor.predict(fixture.test.test_points);
            expectAllClose(
              predictions[outcomeName].variance,
              expectedVars[k],
              TOLERANCE,
              `${outcomeName} variance`,
            );
          });
        }
      } else {
        // Single-output: expected.mean is number[]
        const outcomeName = fixture.experiment.outcome_names?.[0] ?? "y";
        it("mean matches", () => {
          const predictor = new Predictor(fixture.experiment);
          const predictions = predictor.predict(fixture.test.test_points);
          expect(predictions[outcomeName]).toBeDefined();
          expectAllClose(
            predictions[outcomeName].mean,
            fixture.test.expected.mean as Array<number>,
            TOLERANCE,
            "mean",
          );
        });

        it("variance matches", () => {
          const predictor = new Predictor(fixture.experiment);
          const predictions = predictor.predict(fixture.test.test_points);
          expectAllClose(
            predictions[outcomeName].variance,
            fixture.test.expected.variance as Array<number>,
            TOLERANCE,
            "variance",
          );
        });
      }

      // Relativization parity (for fixtures with expected_relative + status_quo)
      if (fixture.test.expected_relative && fixture.experiment.status_quo) {
        const expectedRel = fixture.test.expected_relative;
        const isPerOutcome =
          !("mean" in expectedRel) ||
          (typeof expectedRel.mean === "object" && !Array.isArray(expectedRel.mean));

        if (isPerOutcome) {
          // Multi-output: expected_relative is Record<string, {mean, variance}>
          const perOutcome = expectedRel as Record<
            string,
            { mean: Array<number>; variance: Array<number> }
          >;
          for (const name of Object.keys(perOutcome)) {
            it(`relativized "${name}" mean matches`, () => {
              const predictor = new Predictor(fixture.experiment);
              const testPoints = fixture.experiment.status_quo
                ? fixture.test.test_points.slice(1)
                : fixture.test.test_points;
              const absPreds = predictor.predict(testPoints);
              const sqPreds = predictor.predict([predictor.statusQuoPoint!]);
              const rel = relativizePredictions(
                absPreds[name].mean,
                absPreds[name].variance,
                sqPreds[name].mean[0],
                sqPreds[name].variance[0],
              );
              expectAllClose(rel.mean, perOutcome[name].mean, TOLERANCE, `relative ${name} mean`);
            });

            it(`relativized "${name}" variance matches`, () => {
              const predictor = new Predictor(fixture.experiment);
              const testPoints = fixture.experiment.status_quo
                ? fixture.test.test_points.slice(1)
                : fixture.test.test_points;
              const absPreds = predictor.predict(testPoints);
              const sqPreds = predictor.predict([predictor.statusQuoPoint!]);
              const rel = relativizePredictions(
                absPreds[name].mean,
                absPreds[name].variance,
                sqPreds[name].mean[0],
                sqPreds[name].variance[0],
              );
              expectAllClose(
                rel.variance,
                perOutcome[name].variance,
                TOLERANCE,
                `relative ${name} variance`,
              );
            });
          }
        } else {
          // Single-output: expected_relative is {mean: number[], variance: number[]}
          const singleRel = expectedRel as {
            mean: Array<number>;
            variance: Array<number>;
          };
          it("relativized mean matches", () => {
            const predictor = new Predictor(fixture.experiment);
            const testPoints = fixture.experiment.status_quo
              ? fixture.test.test_points.slice(1)
              : fixture.test.test_points;
            const outName = fixture.experiment.outcome_names?.[0] ?? "y";
            const absPreds = predictor.predict(testPoints);
            const sqPreds = predictor.predict([predictor.statusQuoPoint!]);
            const rel = relativizePredictions(
              absPreds[outName].mean,
              absPreds[outName].variance,
              sqPreds[outName].mean[0],
              sqPreds[outName].variance[0],
            );
            expectAllClose(rel.mean, singleRel.mean, TOLERANCE, "relative mean");
          });

          it("relativized variance matches", () => {
            const predictor = new Predictor(fixture.experiment);
            const testPoints = fixture.experiment.status_quo
              ? fixture.test.test_points.slice(1)
              : fixture.test.test_points;
            const outName = fixture.experiment.outcome_names?.[0] ?? "y";
            const absPreds = predictor.predict(testPoints);
            const sqPreds = predictor.predict([predictor.statusQuoPoint!]);
            const rel = relativizePredictions(
              absPreds[outName].mean,
              absPreds[outName].variance,
              sqPreds[outName].mean[0],
              sqPreds[outName].variance[0],
            );
            expectAllClose(rel.variance, singleRel.variance, TOLERANCE, "relative variance");
          });
        }
      }
    });
  }
});
