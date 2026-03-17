// ── Public API ────────────────────────────────────────────────────────────
// High-level prediction interface — what most users need.

// Predictor (Ax-aligned high-level API)
export { Predictor } from "./predictor.js";
export type { PredictionsByOutcome } from "./predictor.js";

// IO
export { loadModel } from "./io/deserialize.js";
export type { AnyModel } from "./io/deserialize.js";

// Relativization
export {
  relativize,
  unrelativize,
  relativizePredictions,
} from "./transforms/relativize.js";
export type { RelativizeResult, RelativizeOptions } from "./transforms/relativize.js";

// Types — schema, config, and data interfaces
export type {
  ExperimentState,
  SearchSpaceParam,
  PredictionResult,
  AnyModelState,
  ObjectiveConfig,
  OutcomeConstraintConfig,
  ObjectiveThresholdConfig,
  OptimizationConfig,
  ParameterConstraint,
  Observation,
  AdapterTransform,
  Candidate,
  TrainingData,
  LOOCVResult,
  DimensionImportance,
} from "./models/types.js";
