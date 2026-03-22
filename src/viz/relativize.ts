// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { RenderPredictor } from "./types";

/**
 * Delta-method relativization (matches Ax's `relativize` in plot/helper.py).
 * m_t, s_t: treatment (grid point) mean and std.
 * mC, sC: control (status quo) mean and std.
 * Returns [relMean%, relStd%].
 */
export function deltaRelativize(
  mT: number,
  sT: number,
  mC: number,
  sC: number,
): [number, number] {
  const absC = Math.abs(mC);
  const rHat = (mT - mC) / absC - (sC * sC * mT) / (absC * absC * absC);
  const variance = (sT * sT + ((mT / mC) * sC) ** 2) / (mC * mC);
  return [rHat * 100, Math.sqrt(Math.max(0, variance)) * 100];
}

/** Naive relativization for observed Y values (no uncertainty to propagate). */
export function naiveRelPct(y: number, sqMean: number): number {
  return ((y - sqMean) / Math.abs(sqMean)) * 100;
}

/**
 * Format a percentage value with adaptive precision:
 * - |v| >= 100: no decimal  (e.g., "+151%")
 * - |v| >= 1:   1 decimal   (e.g., "+5.2%")
 * - |v| >= 0.001: enough decimals for significance (e.g., "0.012%")
 * - |v| < 0.001: scientific notation (e.g., "1.2e-4%")
 */
export function formatPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  const abs = Math.abs(v);
  if (abs === 0) return "0.0%";
  if (abs < 0.001) return sign + v.toExponential(1) + "%";
  if (abs < 0.1) return sign + v.toFixed(3) + "%";
  if (abs < 1) return sign + v.toFixed(2) + "%";
  if (abs < 100) return sign + v.toFixed(1) + "%";
  return sign + v.toFixed(0) + "%";
}

/** Resolve the status quo reference point from options or predictor. */
export function resolveStatusQuo(
  predictor: RenderPredictor,
  options?: { statusQuoPoint?: Array<number> },
): Array<number> | null {
  return options?.statusQuoPoint ?? predictor.statusQuoPoint ?? null;
}
