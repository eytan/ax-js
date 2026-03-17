# ax-js Data Model

This document describes the `ExperimentState` schema — the JSON format used to
transfer GP model state from Python (Ax/BoTorch) to ax-js. All TypeScript
interfaces are defined in `src/models/types.ts`.

## ExperimentState (Top Level)

The root object exported by `axjs_export.py` and consumed by `new Predictor(state)`.

```typescript
interface ExperimentState {
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
```

## Search Space

### Parameters

```typescript
interface SearchSpaceParam {
  name: string;
  type: "range" | "choice";
  bounds?: [number, number];                  // for range params
  values?: (string | number | boolean)[];     // for choice params
  parameter_type?: "int" | "float";
  log_scale?: boolean;
  is_fidelity?: boolean;
  target_value?: number;
  is_ordered?: boolean;
}
```

Example:
```json
{
  "parameters": [
    { "name": "learning_rate", "type": "range", "bounds": [0.0001, 0.1], "log_scale": true },
    { "name": "num_layers", "type": "range", "bounds": [1, 5], "parameter_type": "int" },
    { "name": "optimizer", "type": "choice", "values": ["adam", "sgd", "rmsprop"] }
  ]
}
```

### Parameter Constraints

```typescript
interface ParameterConstraint {
  type: "sum" | "order" | "linear";
  constraint_dict: Record<string, number>;  // {param_name: weight}
  bound: number;
  op: "LEQ" | "GEQ";
}
```

All Ax parameter constraints reduce to the linear form `sum(w_i * x_i) <= bound`:
- **order**: `lower_param - upper_param <= 0`
- **sum**: `sum(param_i) <= bound`
- **linear**: general weighted inequality

Example:
```json
{
  "parameter_constraints": [
    { "type": "order", "constraint_dict": {"x0": 1, "x1": -1}, "bound": 0, "op": "LEQ" },
    { "type": "sum", "constraint_dict": {"x0": 1, "x1": 1}, "bound": 1.0, "op": "LEQ" }
  ]
}
```

## Model State

`model_state` is a discriminated union on the `model_type` field:

```typescript
type AnyModelState =
  | GPModelState          // SingleTaskGP, FixedNoiseGP
  | ModelListState        // ModelListGP
  | PairwiseGPModelState  // PairwiseGP
  | MultiTaskGPModelState // MultiTaskGP
  | EnsembleGPModelState; // EnsembleGP
```

### GPModelState (SingleTaskGP / FixedNoiseGP)

The most common model type. Used for single-output GP regression.

```typescript
interface GPModelState {
  model_type: "SingleTaskGP" | "FixedNoiseGP";
  train_X: number[][];                          // [n_train, n_dims]
  train_Y: number[];                            // [n_train] (transformed space!)
  kernel: KernelState;
  mean_constant: number;
  noise_variance: number | number[];            // scalar or per-point
  input_transform?: { offset: number[]; coefficient: number[] };
  outcome_transform?: OutcomeTransformState;
  input_warp?: {
    concentration0: number[];
    concentration1: number[];
    indices?: number[];
  };
}
```

**Important**: `train_Y` is NOT in the original data space. It has been
transformed by adapter transforms (LogY, etc.) and model-level transforms
(Standardize). Use `Predictor.getTrainingData()` to get original-space values.

Example:
```json
{
  "model_type": "SingleTaskGP",
  "train_X": [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
  "train_Y": [-0.72, 0.31, 1.15],
  "kernel": {
    "type": "Matern", "nu": 2.5,
    "lengthscale": [0.8, 1.2],
    "outputscale": 0.95
  },
  "mean_constant": 0.02,
  "noise_variance": 0.001,
  "input_transform": {
    "offset": [-5.0, 0.0],
    "coefficient": [0.0667, 0.0667]
  },
  "outcome_transform": { "type": "Standardize", "mean": -23.5, "std": 45.2 }
}
```

`FixedNoiseGP` uses the same structure but with known (not learned) noise.
Per-point heteroscedastic noise uses `noise_variance: number[]`.

### ModelListState (ModelListGP)

One independent GP per outcome. Used for multi-output optimization.

```typescript
interface ModelListState {
  model_type: "ModelListGP";
  outcome_names: string[];
  models: GPModelState[];    // One per outcome, same order as outcome_names
}
```

Example:
```json
{
  "model_type": "ModelListGP",
  "outcome_names": ["accuracy", "latency"],
  "models": [
    {
      "model_type": "SingleTaskGP",
      "train_X": [[0.1, 0.2], [0.3, 0.4]],
      "train_Y": [0.85, 0.92],
      "kernel": { "type": "RBF", "lengthscale": [0.5, 0.3], "outputscale": 1.1 },
      "mean_constant": 0.0,
      "noise_variance": 0.001
    },
    {
      "model_type": "SingleTaskGP",
      "train_X": [[0.1, 0.2], [0.3, 0.4]],
      "train_Y": [-1.2, 0.4],
      "kernel": { "type": "Matern", "nu": 2.5, "lengthscale": [1.0, 0.7], "outputscale": 0.8 },
      "mean_constant": 0.0,
      "noise_variance": 0.002
    }
  ]
}
```

### MultiTaskGPModelState

Multi-task GP with an Intrinsic Coregionalization Model (ICM) kernel. The GP
kernel is the Kronecker product of a data kernel and a task covariance matrix.

```typescript
interface MultiTaskGPModelState {
  model_type: "MultiTaskGP";
  train_X: number[][];         // Includes task column
  train_Y: number[];
  task_feature: number;        // Column index for task ID (usually -1 = last)
  num_tasks: number;
  data_kernel: KernelState;    // Kernel over data dimensions only
  task_covar: {
    covar_factor: number[][];       // W matrix (num_tasks x rank)
    log_var?: number[];             // Per-task log-variance
    var?: number[];                 // Per-task variance
    covar_matrix?: number[][];      // Pre-computed B = (WW^T + diag(var)) / B[target, target]
  };
  mean_constant: number | number[];  // Per-task means or shared
  noise_variance: number | number[];
  input_transform?: { offset: number[]; coefficient: number[] };
  outcome_transform?: OutcomeTransformState;
  input_warp?: { concentration0: number[]; concentration1: number[]; indices?: number[] };
}
```

Key details:
- `train_X` includes the task column (integer 0, 1, ...) at position `task_feature`
- `data_kernel` operates on data columns only (task column excluded)
- `mean_constant` is an array of per-task constants when using `MultitaskMean`
- `covar_matrix` is the pre-computed normalized task covariance (recommended)

Example:
```json
{
  "model_type": "MultiTaskGP",
  "train_X": [[0.1, 0.2, 0], [0.3, 0.4, 0], [0.1, 0.2, 1], [0.3, 0.4, 1]],
  "train_Y": [-1.5, -2.3, -1.1, -1.8],
  "task_feature": -1,
  "num_tasks": 2,
  "data_kernel": { "type": "RBF", "lengthscale": [0.8, 1.2], "outputscale": 1.0 },
  "task_covar": {
    "covar_factor": [[0.5], [0.3]],
    "covar_matrix": [[1.0, 0.6], [0.6, 0.48]]
  },
  "mean_constant": [-1.9, -1.5],
  "noise_variance": 0.01
}
```

### PairwiseGPModelState

Preference learning GP using a Laplace approximation. Used for human preference
data (pairwise comparisons).

```typescript
interface PairwiseGPModelState {
  model_type: "PairwiseGP";
  train_X: number[][];
  utility: number[];               // MAP utility estimate
  likelihood_hess: number[][];     // Hessian of the preference likelihood
  kernel: KernelState;
  mean_constant: number;
  input_transform?: { offset: number[]; coefficient: number[] };
  input_warp?: { concentration0: number[]; concentration1: number[]; indices?: number[] };
}
```

Unlike ExactGP which uses Cholesky, PairwiseGP uses LU factorization because its
`CK+I` matrix is not symmetric.

### EnsembleGPModelState

Ensemble of GPs, used for fully Bayesian models (SAAS with NUTS sampling or
MAP with multiple restarts).

```typescript
interface EnsembleGPModelState {
  model_type: "EnsembleGP";
  models: GPModelState[];    // Each model has different hyperparameters
}
```

Predictions use the law of total variance:
- Mean: average across ensemble members
- Variance: average variance + variance of means

## Kernel State

Kernels use a recursive tree structure:

```typescript
interface KernelState {
  type: "Matern" | "RBF" | "Scale" | "Categorical" | "Additive" | "Product";
  active_dims?: number[];

  // Matern/RBF fields
  lengthscale?: number[];    // Per-dimension (ARD)
  nu?: number;               // Matern smoothness: 0.5, 1.5, or 2.5

  // Scale fields
  outputscale?: number;
  base_kernel?: KernelState;

  // Composite fields (Additive/Product)
  kernels?: KernelState[];
}
```

### Kernel Examples

**Simple Matern (legacy format)**:
```json
{ "type": "Matern", "nu": 2.5, "lengthscale": [0.8, 1.2], "outputscale": 0.95 }
```
The `outputscale` at the top level implies a `ScaleKernel` wrapping.

**Explicit Scale + RBF (recursive format)**:
```json
{
  "type": "Scale",
  "outputscale": 0.95,
  "base_kernel": { "type": "RBF", "lengthscale": [0.8, 1.2] }
}
```

**Product kernel (mixed continuous + categorical)**:
```json
{
  "type": "Scale",
  "outputscale": 1.2,
  "base_kernel": {
    "type": "Product",
    "kernels": [
      { "type": "Matern", "nu": 2.5, "lengthscale": [0.5, 0.8], "active_dims": [0, 1] },
      { "type": "Categorical", "lengthscale": [1.5], "active_dims": [2] }
    ]
  }
}
```

**Additive kernel (per-dimension)**:
```json
{
  "type": "Additive",
  "kernels": [
    { "type": "Matern", "nu": 2.5, "lengthscale": [0.5], "outputscale": 0.3, "active_dims": [0] },
    { "type": "Matern", "nu": 2.5, "lengthscale": [1.2], "outputscale": 0.7, "active_dims": [1] }
  ]
}
```

`active_dims` specifies which input columns a kernel operates on. When present,
ax-js wraps the kernel in an `ActiveDimsKernel` that extracts the relevant
columns before passing to the base kernel.

## Input Transforms

Input transforms map raw parameter values to the space the kernel expects.

### Normalize

Affine mapping: `x_normalized = (x - offset) * coefficient`.

```typescript
interface InputTransform {
  offset: number[];       // One per dimension
  coefficient: number[];  // One per dimension
}
```

Typically maps from parameter bounds to [0, 1]. Example for `x in [-5, 10]`:
```json
{ "offset": [-5.0], "coefficient": [0.0667] }
```

### Input Warp (Kumaraswamy)

Non-linear warping applied AFTER normalization:

```typescript
interface InputWarp {
  concentration0: number[];   // Kumaraswamy alpha, one per warped dim
  concentration1: number[];   // Kumaraswamy beta
  indices?: number[];         // Which dims to warp (all if absent)
}
```

## Outcome Transforms

Outcome transforms define how the GP's internal Y-space maps back to the
original data space. These are model-level transforms stored in the model state.

```typescript
type OutcomeTransformState =
  | { type?: "Standardize"; mean: number; std: number }
  | { type: "Log" }
  | { type: "Bilog" }
  | { type: "Power"; power: number }
  | { type: "Chained"; transforms: OutcomeTransformState[] };
```

### Standardize

The most common transform. The GP trains on `(y - mean) / std`.

```json
{ "type": "Standardize", "mean": -23.5, "std": 45.2 }
```

### Log

The GP trains on `log(y)`. Untransform uses exact log-normal moments.

```json
{ "type": "Log" }
```

### Chained

Multiple transforms applied in sequence:

```json
{ "type": "Chained", "transforms": [
  { "type": "Log" },
  { "type": "Standardize", "mean": 1.5, "std": 0.8 }
]}
```

## Adapter Transforms

Adapter transforms are applied by Ax BEFORE data reaches BoTorch. They are NOT
stored in `model_state` — they are metadata telling the caller how to untransform
predictions.

```typescript
type AdapterTransform =
  | { type: "LogY"; metrics?: string[] }
  | { type: "BilogY"; metrics?: string[] }
  | { type: "StandardizeY"; Ymean?: Record<string, number>; Ystd?: Record<string, number> }
  | { type: "PowerTransformY"; power_params?: Record<string, number[] | {
      lambdas: number[];
      scaler_mean?: number[];
      scaler_scale?: number[];
    }> };
```

When `metrics` is present, the transform applies only to those outcome names.
When absent, it applies to all outcomes.

Example — LogY on specific metrics:
```json
{
  "adapter_transforms": [
    { "type": "LogY", "metrics": ["accuracy"] },
    { "type": "StandardizeY", "Ymean": {"latency": 50.2}, "Ystd": {"latency": 12.3} }
  ]
}
```

`Predictor` automatically applies adapter untransforms per-outcome after model
prediction. The transform order matters: if Ax applied `BilogY` then
`StandardizeY`, the `Predictor` undoes `StandardizeY` first, then `BilogY`.

## Optimization Config

Describes the optimization problem: objectives, constraints, and MOO thresholds.

```typescript
interface OptimizationConfig {
  objectives: ObjectiveConfig[];
  outcome_constraints?: OutcomeConstraintConfig[];
  objective_thresholds?: ObjectiveThresholdConfig[];
}

interface ObjectiveConfig {
  name: string;
  minimize: boolean;
}

interface OutcomeConstraintConfig {
  name: string;
  bound: number;
  op: "LEQ" | "GEQ";
  relative?: boolean;    // True if bound is % change vs status quo
}

interface ObjectiveThresholdConfig {
  name: string;
  bound: number;
  op: "LEQ" | "GEQ";    // LEQ for minimize objectives, GEQ for maximize
  relative?: boolean;
}
```

Example — constrained multi-objective:
```json
{
  "optimization_config": {
    "objectives": [
      { "name": "accuracy", "minimize": false },
      { "name": "latency", "minimize": true }
    ],
    "outcome_constraints": [
      { "name": "memory_usage", "bound": 1024, "op": "LEQ" }
    ],
    "objective_thresholds": [
      { "name": "accuracy", "bound": 0.8, "op": "GEQ" },
      { "name": "latency", "bound": 100.0, "op": "LEQ" }
    ]
  }
}
```

`objective_thresholds` define the MOO reference point — the worst acceptable
value per objective, used for hypervolume computation.

## Observations

Observed trial data from completed experiments:

```typescript
interface Observation {
  arm_name: string;
  parameters: Record<string, number>;
  metrics: Record<string, { mean: number; sem?: number }>;
  trial_index?: number;
  trial_status?: string;       // "COMPLETED" | "CANDIDATE" | "RUNNING" | etc.
  generation_method?: string;  // "Sobol" | "BO" | "Manual"
}
```

Example:
```json
{
  "observations": [
    {
      "arm_name": "0_0",
      "parameters": {"learning_rate": 0.01, "num_layers": 3},
      "metrics": {"accuracy": {"mean": 0.92, "sem": 0.01}, "latency": {"mean": 45.2}},
      "trial_index": 0,
      "trial_status": "COMPLETED",
      "generation_method": "Sobol"
    }
  ]
}
```

## Candidates

Unevaluated candidate arms:

```typescript
interface Candidate {
  arm_name?: string;
  parameters: Record<string, number>;
  trial_index?: number;
  generation_method?: string;
}
```

## Status Quo

The reference arm for relativization (% change calculations):

```json
{ "status_quo": { "point": [0.5, 0.3, 0.1] } }
```

Point values are positional, matching `search_space.parameters` order.

## Fixture Format

Test fixtures wrap `ExperimentState` with test expectations:

```typescript
interface FixtureData {
  experiment: ExperimentState;
  test: {
    metadata: {
      botorch_version: string;
      gpytorch_version: string;
      torch_version: string;
      generated_at: string;
      seed: number;
      benchmark?: string;
      ax_level?: boolean;
      all_tasks?: boolean;
    };
    test_points: number[][];
    expected: {
      mean: number[] | number[][] | Record<string, number[]> | null;
      variance: number[] | number[][] | Record<string, number[]> | null;
    };
    expected_relative?: { mean: number[]; variance: number[] }
      | Record<string, { mean: number[]; variance: number[] }>;
  };
}
```

When `expected.mean` is `null`, the fixture is consistency-only (model loads and
predictions are finite, but there is no BoTorch reference to compare against).

## Prediction Results

The `Predictor.predict()` method returns predictions keyed by outcome name:

```typescript
type PredictionsByOutcome = Record<string, PredictionResult>;

interface PredictionResult {
  mean: Float64Array;
  variance: Float64Array;
}
```

## Convenience Types

```typescript
interface TrainingData {
  X: number[][];         // Raw parameter-space inputs
  Y: number[];           // Original-space outputs (both transform layers undone)
  paramNames: string[];
}

interface LOOCVResult {
  observed: number[];    // Actual values in original space
  mean: number[];        // LOO predicted means
  variance: number[];    // LOO predicted variances
}

interface DimensionImportance {
  dimIndex: number;
  paramName: string;
  lengthscale: number;   // Shorter = more important
}
```
