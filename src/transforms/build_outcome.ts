// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

import type { OutcomeUntransform } from "./outcome.js";
import type { OutcomeTransformState } from "../models/types.js";

import {
  StandardizeUntransform,
  LogUntransform,
  BilogUntransform,
  PowerUntransform,
  ChainedOutcomeUntransform,
} from "./outcome.js";

/**
 * Build an OutcomeUntransform from a serialized OutcomeTransformState.
 *
 * Handles both:
 * - Legacy format: { mean, std } (no type field) → StandardizeUntransform
 * - New format: { type: "Standardize"|"Log"|"Bilog"|"Power"|"Chained", ... }
 */
export function buildOutcomeUntransform(state: OutcomeTransformState): OutcomeUntransform {
  // Legacy format: no type field, just mean/std
  if (!("type" in state) || state.type === undefined || state.type === "Standardize") {
    const s = state as { mean: number | Array<number>; std: number | Array<number> };
    // Per-output vector mean/std: take first element (for single-output models).
    // ModelListGP handles per-output by giving each sub-model its own transform.
    const mean = Array.isArray(s.mean) ? s.mean[0] : s.mean;
    const std = Array.isArray(s.std) ? s.std[0] : s.std;
    return new StandardizeUntransform(mean, std);
  }

  switch (state.type) {
    case "Log": {
      return new LogUntransform();
    }

    case "Bilog": {
      return new BilogUntransform();
    }

    case "Power": {
      return new PowerUntransform(state.power);
    }

    case "Chained": {
      const transforms = state.transforms.map(buildOutcomeUntransform);
      return new ChainedOutcomeUntransform(transforms);
    }

    default: {
      // TypeScript exhaustiveness check: should never reach here if all cases are handled
      // Note: type field may be undefined for legacy Standardize format, which is already handled above
      throw new Error(`Unknown outcome transform type: ${String(state.type)}`);
    }
  }
}
