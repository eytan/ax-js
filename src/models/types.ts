export interface KernelState {
  type: "Matern" | "RBF" | "Scale" | "Categorical" | "Additive" | "Product";
  active_dims?: number[];

  // Matern/RBF
  lengthscale?: number[];
  nu?: number;

  // Scale: legacy format has outputscale at top level with type="Matern"|"RBF"
  // New format: type="Scale" with base_kernel
  outputscale?: number;
  base_kernel?: KernelState;

  // Composite (Additive/Product)
  kernels?: KernelState[];
}

export type OutcomeTransformState =
  | { type?: "Standardize"; mean: number; std: number }
  | { type: "Log" }
  | { type: "Bilog" }
  | { type: "Power"; power: number }
  | { type: "Chained"; transforms: OutcomeTransformState[] };

export interface GPModelState {
  model_type: "SingleTaskGP" | "FixedNoiseGP";
  train_X: number[][];
  train_Y: number[];
  kernel: KernelState;
  mean_constant: number;
  noise_variance: number | number[];
  input_transform?: { offset: number[]; coefficient: number[] };
  outcome_transform?: OutcomeTransformState;
  input_warp?: {
    concentration0: number[];
    concentration1: number[];
    indices?: number[];
  };
}

export interface ModelListState {
  model_type: "ModelListGP";
  outcome_names: string[];
  models: GPModelState[];
}

export interface PairwiseGPModelState {
  model_type: "PairwiseGP";
  train_X: number[][];
  utility: number[];
  likelihood_hess: number[][];
  kernel: KernelState;
  mean_constant: number;
  input_transform?: { offset: number[]; coefficient: number[] };
  input_warp?: {
    concentration0: number[];
    concentration1: number[];
    indices?: number[];
  };
}

export interface MultiTaskGPModelState {
  model_type: "MultiTaskGP";
  train_X: number[][];
  train_Y: number[];
  task_feature: number;
  num_tasks: number;
  data_kernel: KernelState;
  task_covar: {
    covar_factor: number[][];
    log_var?: number[];
    var?: number[];
    covar_matrix?: number[][];
  };
  mean_constant: number | number[];
  noise_variance: number | number[];
  input_transform?: { offset: number[]; coefficient: number[] };
  outcome_transform?: OutcomeTransformState;
  input_warp?: {
    concentration0: number[];
    concentration1: number[];
    indices?: number[];
  };
}

export interface EnsembleGPModelState {
  model_type: "EnsembleGP";
  models: GPModelState[];
}

export type AnyModelState =
  | GPModelState
  | ModelListState
  | PairwiseGPModelState
  | MultiTaskGPModelState
  | EnsembleGPModelState;

export interface SearchSpaceParam {
  name: string;
  type: "range" | "choice";
  bounds?: [number, number];
  values?: (string | number | boolean)[];
  parameter_type?: "int" | "float";
  log_scale?: boolean;
  is_fidelity?: boolean;
  target_value?: number;
  is_ordered?: boolean;
}

// ── Parameter constraints ─────────────────────────────────────────────────

export interface ParameterConstraint {
  type: "sum" | "order" | "linear";
  constraint_dict: Record<string, number>;  // {param_name: weight}
  bound: number;
  op: "LEQ" | "GEQ";
}

// ── Optimization config (objectives + constraints) ────────────────────────

export interface ObjectiveConfig {
  name: string;
  minimize: boolean;
}

export interface OutcomeConstraintConfig {
  name: string;
  bound: number;
  op: "LEQ" | "GEQ";
  relative?: boolean;
}

export interface ObjectiveThresholdConfig {
  name: string;
  bound: number;
  op: "LEQ" | "GEQ";
  relative?: boolean;
}

export interface OptimizationConfig {
  objectives: ObjectiveConfig[];
  outcome_constraints?: OutcomeConstraintConfig[];
  /** Objective thresholds for MOO — defines worst acceptable value per objective. */
  objective_thresholds?: ObjectiveThresholdConfig[];
}

// ── Adapter transforms (applied by Ax BEFORE BoTorch) ─────────────────────

export type AdapterTransform =
  | { type: "LogY"; metrics?: string[] }
  | { type: "BilogY"; metrics?: string[] }
  | { type: "StandardizeY"; Ymean?: Record<string, number>; Ystd?: Record<string, number> }
  | {
      type: "PowerTransformY";
      power_params?: Record<
        string,
        | number[]
        | {
            lambdas: number[];
            scaler_mean?: number[];
            scaler_scale?: number[];
          }
      >;
    };

// ── Observations (trial data) ─────────────────────────────────────────────

export interface Observation {
  arm_name: string;
  parameters: Record<string, number>;
  metrics: Record<string, { mean: number; sem?: number }>;
  trial_index?: number;
  trial_status?: string;
  generation_method?: string;
}

// ── ExperimentState: shared schema for both exports and fixtures ──────────

export interface ExperimentState {
  search_space: {
    parameters: SearchSpaceParam[];
    parameter_constraints?: ParameterConstraint[];
  };
  model_state: AnyModelState;
  name?: string;
  description?: string;
  outcome_names?: string[];
  status_quo?: { point: number[] };
  adapter_transforms?: AdapterTransform[];
  optimization_config?: OptimizationConfig;
  observations?: Observation[];
  candidates?: Candidate[];
}

// ── Fixture schema: experiment + test expectations ────────────────────────

export interface FixtureData {
  experiment: ExperimentState;
  test: {
    metadata: {
      botorch_version: string;
      gpytorch_version: string;
      torch_version: string;
      generated_at: string;
      seed: number;
      benchmark?: string;
      task_index?: number | null;
      ax_level?: boolean;
      all_tasks?: boolean;
    };
    test_points: number[][];
    expected: {
      mean: number[] | number[][] | Record<string, number[]> | null;
      variance: number[] | number[][] | Record<string, number[]> | null;
    };
    expected_relative?:
      | { mean: number[]; variance: number[] }
      | Record<string, { mean: number[]; variance: number[] }>;
  };
}

export interface Manifest {
  fixtures: { name: string; file: string; description: string }[];
}

export interface PredictionResult {
  mean: Float64Array;
  variance: Float64Array;
}

// ── Predictor convenience types ───────────────────────────────────────────

/** Training data for one outcome, in raw parameter space with un-standardized Y. */
export interface TrainingData {
  X: number[][];
  Y: number[];
  paramNames: string[];
}

/** Leave-one-out cross-validation result for one outcome. */
export interface LOOCVResult {
  observed: number[];   // Y values in original space
  mean: number[];       // LOO predicted means in original space
  variance: number[];   // LOO predicted variances in original space
}

/** Dimension importance derived from kernel lengthscales. */
export interface DimensionImportance {
  dimIndex: number;
  paramName: string;
  lengthscale: number;
}

// ── Candidate arms (round-trip workflow) ──────────────────────────────────

export interface Candidate {
  arm_name?: string;
  parameters: Record<string, number>;
  trial_index?: number;
  generation_method?: string;
}
