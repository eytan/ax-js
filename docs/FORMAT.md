# ExperimentState Format

The canonical serialization format for GP models exported from Ax/BoTorch to axjs.
Used by both `axjs_export.py` (production) and `generate_fixtures.py` (test fixtures).

## Schema

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

### `search_space`

Parameter definitions and constraints from the Ax experiment:

```typescript
interface SearchSpaceParam {
  name: string;
  type: "range" | "choice";
  bounds?: [number, number];       // for range params
  values?: (string|number|boolean)[];  // for choice params
  parameter_type?: "int" | "float";
  log_scale?: boolean;
  is_fidelity?: boolean;
  target_value?: number;
  is_ordered?: boolean;
}

interface ParameterConstraint {
  type: "sum" | "order" | "linear";
  constraint_dict: Record<string, number>;  // {param_name: weight}
  bound: number;
  op: "LEQ" | "GEQ";
}
```

`parameter_constraints` is an optional array of `ParameterConstraint`. All Ax
parameter constraints reduce to the linear form `Σ(w_i * x_i) ≤ bound`:
- **`order`**: `lower_param - upper_param ≤ 0` (ordering constraint)
- **`sum`**: `Σ(param_i) ≤ bound` (sum constraint, can be ≤ or ≥)
- **`linear`**: general weighted linear constraint

### `model_state`

Discriminated union by `model_type`:

| `model_type` | TypeScript type | Description |
|---|---|---|
| `"SingleTaskGP"` | `GPModelState` | Standard GP with learned noise |
| `"FixedNoiseGP"` | `GPModelState` | GP with known per-point noise |
| `"ModelListGP"` | `ModelListState` | Multi-output (one GP per outcome) |
| `"PairwiseGP"` | `PairwiseGPModelState` | Preference learning (Laplace approx) |
| `"MultiTaskGP"` | `MultiTaskGPModelState` | Multi-task with ICM kernel |
| `"EnsembleGP"` | `EnsembleGPModelState` | Ensemble of GPs (SAAS/MAP) |

**Warning: `train_Y` values are NOT in the original data space.** They have been
transformed by adapter transforms (LogY, StandardizeY, etc.) and then by model-level
outcome transforms (Standardize). Use `Predictor.getTrainingData()` to get Y values
in the original space — it applies both layers of untransforms automatically.

### `outcome_names`

Always populated. Examples: `["y"]`, `["branin"]`, `["weight", "acceleration", ...]`.
For `ModelListGP`, matches the order of sub-models.

### `status_quo`

Optional status quo arm for relativization:

```json
{ "point": [0.5, 0.3, ...] }
```

Point values are in raw parameter space (matching `search_space` order).

### `adapter_transforms`

Transforms applied by Ax's adapter layer **before** data reaches BoTorch.
These are NOT in `model_state` — they must be applied after GP prediction to
get results in the original data space. They also affect `train_Y`: since Ax
applies these transforms before BoTorch sees the data, `model_state.train_Y`
is in the post-adapter-transform space, not the original space.

```typescript
type AdapterTransform =
  | { type: "LogY"; metrics?: string[] }
  | { type: "BilogY"; metrics?: string[] }
  | { type: "StandardizeY"; Ymean?: Record<string, number>; Ystd?: Record<string, number> }
  | { type: "PowerTransformY"; power_params?: Record<string, number[]> };
```

When `metrics` is present, the transform only applies to those outcome names.
When absent, it applies to all outcomes.

### `optimization_config`

Optional multi-objective / constrained optimization metadata:

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
  bound: number;     // threshold value
  op: "LEQ" | "GEQ"; // ≤ or ≥
  relative?: boolean; // true if bound is relative to status quo (% change)
}
interface ObjectiveThresholdConfig {
  name: string;
  bound: number;     // worst acceptable value (reference point for MOO)
  op: "LEQ" | "GEQ"; // direction: LEQ for minimize objectives, GEQ for maximize
  relative?: boolean; // true if bound is relative to status quo (% change)
}
```

Extracted from `experiment.optimization_config` by `axjs_export.py`.
Multi-objective experiments have multiple entries in `objectives`.
Single-objective experiments have a single entry.
`objective_thresholds` define the MOO reference point — the worst acceptable value
per objective, used for hypervolume computation and Pareto front visualization.
Used by the radar demo to render objective/constraint axes generically.

### `observations`

Observed trial data from completed experiments:

```typescript
interface Observation {
  arm_name: string;
  parameters: Record<string, number>;
  metrics: Record<string, { mean: number; sem?: number }>;
  trial_index?: number;
  trial_status?: string;    // "COMPLETED" | "CANDIDATE" | "RUNNING" | "ABANDONED"
  generation_method?: string; // "Sobol" | "BO" | "Manual" etc.
}
```

### `candidates`

Unevaluated candidate arms from the generation strategy:

```typescript
interface Candidate {
  arm_name?: string;
  parameters: Record<string, number>;
  trial_index?: number;
  generation_method?: string;
}
```

## How Predictor Consumes This Format

```typescript
import { Predictor } from "axjs";

const predictor = new Predictor(experimentState);
const predictions = predictor.predict(points);
// predictions: Record<string, { mean: Float64Array, variance: Float64Array }>
```

The Predictor automatically:
1. Loads the model from `model_state`
2. Applies model-level transforms (Normalize, Standardize, Log, etc.)
3. Applies adapter-level untransforms (LogY, BilogY, etc.) per outcome

### Convenience Methods

```typescript
// Training data (original-space Y, raw X — both transform layers undone)
predictor.getTrainingData(outcomeName?) → { X: number[][], Y: number[], paramNames: string[] }

// Analytic LOO-CV (Rasmussen & Williams Eq. 5.12) — no refitting needed
predictor.loocv(outcomeName?) → { observed: number[], mean: number[], variance: number[] }

// Kernel lengthscales per input dimension
predictor.getLengthscales(outcomeName?) → number[] | null

// Dimensions ranked by importance (shortest lengthscale first)
predictor.rankDimensionsByImportance(outcomeName?) → DimensionImportance[]

// Kernel correlation between two points [0, 1]
predictor.kernelCorrelation(point, refPoint, outcomeName?) → number
```

## Fixture Format

Test fixtures wrap `ExperimentState` with test expectations:

```typescript
interface FixtureData {
  experiment: ExperimentState;
  test: {
    metadata: { botorch_version, gpytorch_version, torch_version, generated_at, seed, benchmark?, task_index? };
    test_points: number[][];
    expected: { mean: number[] | number[][] | null; variance: number[] | number[][] | null };
    expected_relative?: { mean: number[]; variance: number[] };
  };
}
```

When `expected.mean` is `null`, the fixture is consistency-only (model loads,
predictions are finite and deterministic — no BoTorch reference to compare against).

## Examples

### SingleTaskGP

```json
{
  "search_space": { "parameters": [
    { "name": "x0", "type": "range", "bounds": [-5, 10] },
    { "name": "x1", "type": "range", "bounds": [0, 15] }
  ]},
  "model_state": {
    "model_type": "SingleTaskGP",
    "train_X": [[0.1, 0.2], [0.3, 0.4]],
    "train_Y": [-1.5, -2.3],
    "kernel": { "type": "Matern", "nu": 2.5, "lengthscale": [1.0, 0.5], "outputscale": 1.2 },
    "mean_constant": -1.9,
    "noise_variance": 0.01,
    "input_transform": { "offset": [-5, 0], "coefficient": [0.067, 0.067] },
    "outcome_transform": { "type": "Standardize", "mean": -1.9, "std": 0.4 }
  },
  "outcome_names": ["branin"]
}
```

### ModelListGP

```json
{
  "search_space": { "parameters": [...] },
  "model_state": {
    "model_type": "ModelListGP",
    "outcome_names": ["obj1", "obj2"],
    "models": [
      { "model_type": "SingleTaskGP", ... },
      { "model_type": "SingleTaskGP", ... }
    ]
  },
  "outcome_names": ["obj1", "obj2"]
}
```

### MultiTaskGP

```json
{
  "search_space": { "parameters": [...] },
  "model_state": {
    "model_type": "MultiTaskGP",
    "train_X": [[0.1, 0.2, 0], [0.3, 0.4, 1]],
    "train_Y": [-1.5, -2.3],
    "task_feature": -1,
    "num_tasks": 2,
    "data_kernel": { "type": "RBF", "lengthscale": [1.0, 0.5] },
    "task_covar": { "covar_factor": [[...]], "covar_matrix": [[...]] },
    "mean_constant": [-1.9, -2.1],
    "noise_variance": 0.01
  },
  "outcome_names": ["y"]
}
```
