// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { Kernel } from "../../src/kernels/types.js";

import { describe, it, expect } from "vitest";

import { CategoricalKernel } from "../../src/kernels/categorical.js";
import { ActiveDimsKernel, AdditiveKernel, ProductKernel } from "../../src/kernels/composite.js";
import { MaternKernel } from "../../src/kernels/matern.js";
import { IndexKernel, MultitaskKernel } from "../../src/kernels/multitask.js";
import { RBFKernel } from "../../src/kernels/rbf.js";
import { ScaleKernel } from "../../src/kernels/scale.js";
import { Matrix } from "../../src/linalg/matrix.js";

/**
 * Verify computeDiag(X) === diag(compute(X, X)) for every kernel family.
 * Prerequisite for diagonal-only Kss (Tier 2.1).
 */
describe("Kernel.computeDiag parity", () => {
  const tolerance = 1e-12;

  const x2d = Matrix.from2D([
    [0.1, 0.2],
    [0.5, 0.6],
    [0.9, 0.8],
  ]);

  function assertDiagMatchesFull(kernel: Kernel, x: Matrix): void {
    const diag = kernel.computeDiag(x);
    const K = kernel.compute(x, x);
    expect(diag.length).toBe(x.rows);
    for (let i = 0; i < x.rows; i++) {
      expect(Math.abs(diag[i] - K.get(i, i))).toBeLessThan(tolerance);
    }
  }

  it("stationary kernels (RBF, Matern)", () => {
    assertDiagMatchesFull(new RBFKernel([0.5, 1.5]), x2d);
    assertDiagMatchesFull(new MaternKernel([0.8, 1.2], 1.5), x2d);
    assertDiagMatchesFull(new MaternKernel([0.5, 1], 2.5), x2d);
  });

  it("ScaleKernel", () => {
    assertDiagMatchesFull(new ScaleKernel(new RBFKernel([1, 1.5]), 2.5), x2d);
  });

  it("CategoricalKernel", () => {
    const xCat = Matrix.from2D([
      [0, 1],
      [1, 0],
      [0, 1],
    ]);
    assertDiagMatchesFull(new CategoricalKernel([0.8, 1.2]), xCat);
  });

  it("composite kernels (Additive, Product, ActiveDims)", () => {
    const k1 = new ActiveDimsKernel(new RBFKernel([0.5]), [0]);
    const k2 = new ActiveDimsKernel(new RBFKernel([1]), [1]);
    assertDiagMatchesFull(new AdditiveKernel([k1, k2]), x2d);
    assertDiagMatchesFull(new ProductKernel([k1, k2]), x2d);
    assertDiagMatchesFull(new ActiveDimsKernel(new RBFKernel([0.5]), [0]), x2d);
  });

  it("multitask kernels (Index, Multitask)", () => {
    const xTasks = Matrix.from2D([[0], [1], [0], [1]]);
    assertDiagMatchesFull(
      new IndexKernel(
        [
          [1, 0.5],
          [0.5, 1],
        ],
        [0.1, 0.2],
        true,
      ),
      xTasks,
    );

    const xMT = Matrix.from2D([
      [0.1, 0],
      [0.5, 1],
      [0.9, 0],
    ]);
    assertDiagMatchesFull(
      new MultitaskKernel(
        new RBFKernel([1]),
        [
          [1, 0],
          [0, 1],
        ],
        [0, 0],
        -1,
        true,
      ),
      xMT,
    );
  });

  it("complex nested: Scale(Product(Additive, Categorical))", () => {
    const k1 = new ActiveDimsKernel(new RBFKernel([0.5]), [0]);
    const k2 = new ActiveDimsKernel(new MaternKernel([1], 2.5), [1]);
    const k3 = new ActiveDimsKernel(new CategoricalKernel(1), [2]);
    const kernel = new ScaleKernel(new ProductKernel([new AdditiveKernel([k1, k2]), k3]), 2.5);
    const xMixed = Matrix.from2D([
      [0.1, 0.2, 0],
      [0.5, 0.6, 1],
      [0.9, 0.8, 0],
    ]);
    assertDiagMatchesFull(kernel, xMixed);
  });
});
