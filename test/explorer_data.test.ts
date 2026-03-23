// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import { describe, it, expect } from "vitest";

import {
  inferBatchIndices,
  computeDefaultMetricOrder,
  computePanelRange,
  niceRange,
  outcomeDesiredSign,
  ciColors,
  batchColor,
  relativizeItem,
} from "../src/viz/explorer/data.js";
import type { MetricConfig, Observation } from "../src/models/types.js";

describe("explorer data layer", () => {
  describe("inferBatchIndices", () => {
    it("groups by generation_method when batch_index absent", () => {
      const obs: Array<Observation> = [
        { arm_name: "a", parameters: {}, metrics: {}, generation_method: "Sobol" },
        { arm_name: "b", parameters: {}, metrics: {}, generation_method: "BoTorch" },
        { arm_name: "c", parameters: {}, metrics: {}, generation_method: "Sobol" },
        { arm_name: "d", parameters: {}, metrics: {}, generation_method: "BoTorch" },
      ];
      const batches = inferBatchIndices(obs);
      expect(batches).toEqual([0, 1, 0, 1]);
    });

    it("uses explicit batch_index when provided", () => {
      const obs: Array<Observation> = [
        { arm_name: "a", parameters: {}, metrics: {}, batch_index: 5 },
        { arm_name: "b", parameters: {}, metrics: {}, batch_index: 3 },
      ];
      const batches = inferBatchIndices(obs);
      expect(batches).toEqual([5, 3]);
    });

    it("mixes explicit and inferred batch indices", () => {
      const obs: Array<Observation> = [
        { arm_name: "a", parameters: {}, metrics: {}, generation_method: "Sobol" },
        { arm_name: "b", parameters: {}, metrics: {}, batch_index: 10 },
        { arm_name: "c", parameters: {}, metrics: {}, generation_method: "Sobol" },
      ];
      const batches = inferBatchIndices(obs);
      expect(batches).toEqual([0, 10, 0]);
    });
  });

  describe("computeDefaultMetricOrder", () => {
    it("orders objectives first, then constraints, then tracking", () => {
      const configs: Array<MetricConfig> = [
        { name: "tracking_b", intent: "tracking" },
        { name: "obj_a", intent: "objective", lower_is_better: true },
        { name: "con_c", intent: "constraint", bound: 1, op: "LEQ" },
        { name: "tracking_a", intent: "tracking" },
        { name: "obj_b", intent: "objective", lower_is_better: false },
      ];
      const order = computeDefaultMetricOrder(
        ["tracking_b", "obj_a", "con_c", "tracking_a", "obj_b"],
        configs,
      );
      expect(order).toEqual(["obj_a", "obj_b", "con_c", "tracking_a", "tracking_b"]);
    });

    it("returns outcome order unchanged when all tracking", () => {
      const configs: Array<MetricConfig> = [
        { name: "z", intent: "tracking" },
        { name: "a", intent: "tracking" },
      ];
      const order = computeDefaultMetricOrder(["z", "a"], configs);
      expect(order).toEqual(["a", "z"]);
    });
  });

  describe("niceRange", () => {
    it("produces ticks covering the range", () => {
      const r = niceRange(-5, 10);
      expect(r.lo).toBeLessThanOrEqual(-5);
      expect(r.hi).toBeGreaterThanOrEqual(10);
      expect(r.ticks.length).toBeGreaterThan(2);
      expect(r.ticks[0]).toBe(r.lo);
      expect(r.ticks[r.ticks.length - 1]).toBeCloseTo(r.hi, 1);
    });

    it("handles small range", () => {
      const r = niceRange(0, 0.1);
      expect(r.lo).toBeLessThanOrEqual(0);
      expect(r.hi).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe("computePanelRange", () => {
    it("computes range from relativized arm data", () => {
      const arms = [
        {
          idx: 0,
          armName: "a",
          params: [0],
          evals: [0],
          trialIndex: 0,
          batchIndex: 0,
          trialStatus: "COMPLETED",
          generationMethod: "Sobol",
          preds: null,
          relData: { metric: { mean: -5, sem: 2 } },
        },
        {
          idx: 1,
          armName: "b",
          params: [1],
          evals: [1],
          trialIndex: 1,
          batchIndex: 0,
          trialStatus: "COMPLETED",
          generationMethod: "Sobol",
          preds: null,
          relData: { metric: { mean: 8, sem: 1 } },
        },
      ];
      const range = computePanelRange(arms, [], ["metric"]);
      expect(range.lo).toBeLessThanOrEqual(-5 - 1.96 * 2);
      expect(range.hi).toBeGreaterThanOrEqual(8 + 1.96 * 1);
    });
  });

  describe("outcomeDesiredSign", () => {
    const configs: Array<MetricConfig> = [
      { name: "obj_min", intent: "objective", lower_is_better: true },
      { name: "obj_max", intent: "objective", lower_is_better: false },
      { name: "con_leq", intent: "constraint", op: "LEQ", bound: 1 },
      { name: "con_geq", intent: "constraint", op: "GEQ", bound: 0 },
      { name: "tracking", intent: "tracking" },
    ];

    it("returns -1 for minimize objectives", () => {
      expect(outcomeDesiredSign("obj_min", configs)).toBe(-1);
    });

    it("returns +1 for maximize objectives", () => {
      expect(outcomeDesiredSign("obj_max", configs)).toBe(1);
    });

    it("returns -1 for LEQ constraints", () => {
      expect(outcomeDesiredSign("con_leq", configs)).toBe(-1);
    });

    it("returns +1 for GEQ constraints", () => {
      expect(outcomeDesiredSign("con_geq", configs)).toBe(1);
    });

    it("returns 0 for tracking metrics", () => {
      expect(outcomeDesiredSign("tracking", configs)).toBe(0);
    });
  });

  describe("ciColors", () => {
    it("returns grey when 75% CI spans zero", () => {
      const c = ciColors(0.5, 2, -1); // 75% CI: [0.5 - 1.15*2, 0.5 + 1.15*2] = [-1.8, 2.8]
      expect(c.c75).toBe("#b8b8b8");
      expect(c.isBad).toBe(false);
    });

    it("returns green when mean matches desired direction", () => {
      const c = ciColors(-5, 0.5, -1); // minimize: negative mean is good
      expect(c.c75).toBe("#7fbc41");
      expect(c.isBad).toBe(false);
    });

    it("returns pink when mean opposes desired direction", () => {
      const c = ciColors(5, 0.5, -1); // minimize: positive mean is bad
      expect(c.c75).toBe("#c51b7d");
      expect(c.isBad).toBe(true);
    });
  });

  describe("batchColor", () => {
    it("returns palette color for small indices", () => {
      expect(batchColor(0)).toBe("#e41a1c");
      expect(batchColor(1)).toBe("#377eb8");
    });

    it("returns HSL for large indices", () => {
      const c = batchColor(100);
      expect(c).toMatch(/^hsl\(\d+, 55%, 45%\)$/);
    });
  });
});
