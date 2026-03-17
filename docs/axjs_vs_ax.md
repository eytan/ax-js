# axjs vs Ax Data Model Comparison

## Context

axjs was designed as a prediction-only library: Ax exports a snapshot (`ExperimentState`), axjs deserializes it and runs GP predictions client-side. The data flow is strictly one-directional (Ax -> axjs). The goal now is to enable rich BO UIs where users can both view predictions AND generate/modify candidates (via acquisition functions or manual selection) that synchronize back to Ax. This requires understanding where the data models align, where they diverge, and what's missing for bidirectional workflows.

---

## 1. Side-by-Side Data Model Comparison

### 1.1 Experiment Identity & Metadata

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| Experiment name | `experiment.name` (str) | `ExperimentState.name?` (string) | Parity |
| Description | `experiment.description` (str) | `ExperimentState.description?` (string) | Parity |
| Experiment ID | Internal DB ID, not typically exposed | Not present | No gap -- not needed client-side |
| Properties/metadata | `experiment.properties` (dict) | Not present | Minor gap -- could carry arbitrary metadata |
| Creation time | `experiment._time_created` | Not present | Not needed |

### 1.2 Search Space (Parameters)

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| Range parameters | `RangeParameter(name, lower, upper, parameter_type, log_scale)` | `SearchSpaceParam {type:"range", bounds, parameter_type, log_scale}` | **Parity** |
| Choice parameters | `ChoiceParameter(name, values, is_ordered)` | `SearchSpaceParam {type:"choice", values, is_ordered}` | **Parity** |
| Fidelity parameters | `is_fidelity`, `target_value` on params | `is_fidelity?`, `target_value?` on `SearchSpaceParam` | **Parity** |
| Parameter constraints | `ParameterConstraint`, `OrderConstraint`, `SumConstraint` | `ParameterConstraint {type, constraint_dict, bound, op}` | **Parity** -- exported via `_extract_parameter_constraints()` |
| Fixed parameters | `FixedParameter(name, value)` | Not present (handled at export by fixing value) | Minor gap -- export flattens these out |
| Hierarchical search space | `HierarchicalSearchSpace` with parameter dependencies | **Not present** | **Gap** -- increasingly common in Ax |

**Remaining gap**: Hierarchical search space structure. Parameter constraints are now exported. If the UI generates candidates, it can validate against sum/order/linear constraints but can't yet determine which parameters are active given hierarchical dependencies.

### 1.3 Optimization Config

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| Single objective | `Objective(metric, minimize)` | `ObjectiveConfig {name, minimize}` | **Parity** |
| Multi-objective | `MultiObjective([objectives])` | `objectives: ObjectiveConfig[]` | **Parity** |
| Outcome constraints | `OutcomeConstraint(metric, op, bound)` | `OutcomeConstraintConfig {name, bound, op}` | **Parity** |
| Objective thresholds (MOO) | `ObjectiveThreshold(metric, bound, op)` | `ObjectiveThresholdConfig {name, bound, op}` | **Parity** |
| Relative constraints | `OutcomeConstraint(..., relative=True)` | `OutcomeConstraintConfig.relative?` / `ObjectiveThresholdConfig.relative?` | **Parity** -- exported by `_extract_optimization_config()` |
| Scalarized objective | `ScalarizedObjective(metrics, weights)` | **Not present** | Minor gap |
| Risk measures | `RiskMeasure` on objectives | **Not present** | Minor gap |

**Full parity.** Both absolute and relative constraints/thresholds are now exported with the `relative` flag.

### 1.4 Trials & Observations

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| Trial (single arm) | `Trial(experiment, generator_run)` | Flattened into `Observation` | See below |
| BatchTrial (multi-arm) | `BatchTrial(experiment, generator_runs, arms, weights)` | Flattened -- batch structure lost | **Gap for batch-aware UIs** |
| Trial index | `trial.index` (int) | `observation.trial_index?` (number) | Parity |
| Trial status | `TrialStatus` enum (CANDIDATE/STAGED/RUNNING/COMPLETED/FAILED/ABANDONED/EARLY_STOPPED) | `observation.trial_status?` (string) | **Parity** (read-only) |
| Arm name | `arm.name` (str) | `observation.arm_name` (string) | Parity |
| Arm parameters | `arm.parameters` (dict) | `observation.parameters` (Record) | Parity |
| Arm weights | `trial.arm_weights` (dict) | **Not present** | Minor gap |
| Metric values | `Data(df)` with metric_name, mean, sem | `observation.metrics` (Record<string, {mean, sem?}>) | **Parity** |
| Generation method | `generator_run._model_key` | `observation.generation_method?` (string) | Parity |
| Run metadata | `trial.run_metadata` | Not present | Not needed for UI |
| Attached data | Multiple Data objects per trial | Single metrics dict per observation | Simplified -- fine for UI |

**The flattened Observation model is appropriate for UI.** The main thing lost is batch structure (which arms were evaluated together). This matters for some visualizations but not for candidate generation.

### 1.5 Candidates (Unevaluated Trials)

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| Candidate arm | `Trial` with status CANDIDATE/STAGED | `Candidate {parameters, arm_name?, ...}` | **Parity** |
| Trial index | `trial.index` | `candidate.trial_index?` | Parity |
| Generation method | `generator_run._model_key` | `candidate.generation_method?` | Parity |
| ~~Acquisition value~~ | ~~Not directly stored~~ | ~~Removed~~ | **Cleaned up** -- was dead type surface |
| ~~Pre-computed predictions~~ | ~~Not stored~~ | ~~Removed~~ | **Cleaned up** -- was dead type surface |
| Candidate source | Internal GeneratorRun linkage | Not present | Minor |

**Cleaned up**: `acquisition_value` and `predicted` were removed from `Candidate` -- they were dead type surface never populated by any code path.

### 1.6 Model State (GP Internals)

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| SingleTaskGP | `SingleTaskGP` (BoTorch) | `GPModelState` | **Parity** |
| ModelListGP | `ModelListGP` (BoTorch) | `ModelListState` | **Parity** |
| MultiTaskGP | `MultiTaskGP` (BoTorch) | `MultiTaskGPModelState` | **Parity** |
| PairwiseGP | `PairwiseGP` (BoTorch) | `PairwiseGPModelState` | **Parity** |
| EnsembleGP | SAAS/MAP ensemble | `EnsembleGPModelState` | **Parity** |
| Kernel state | PyTorch parameters | `KernelState` (recursive) | **Parity** |
| Input transforms | `Normalize`, `Warp` | Exported in model_state | **Parity** |
| Outcome transforms | `Standardize`, `Log`, etc. | `OutcomeTransformState` | **Parity** |
| Training data | `model.train_inputs`, `model.train_targets` | `train_X`, `train_Y` | **Parity** |
| Fitting/optimization | MLL, optimizer state | **Not present** | By design -- prediction only |

**Full parity on the prediction side.** Model fitting is intentionally excluded.

### 1.7 Adapter Transforms (Ax -> BoTorch boundary)

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| LogY | `LogY` transform | `{type: "LogY", metrics?}` | **Parity** |
| BilogY | `BilogY` transform | `{type: "BilogY", metrics?}` | **Parity** |
| StandardizeY | `StandardizeY` with fitted Ymean/Ystd | `{type: "StandardizeY", Ymean?, Ystd?}` | **Parity** |
| PowerTransformY | `PowerTransformY` with sklearn params | `{type: "PowerTransformY", power_params?}` | **Parity** |
| UnitX | `UnitX` (raw -> [0,1]) | Composed into `input_transform` at export | **Parity** (handled transparently) |
| IntToFloat | `IntToFloat` transform | **Not present** | Minor -- integer params work via rounding |
| Derelativize | `Derelativize` transform | **Not present** | Gap if relative data enters pipeline |
| TaskEncode | `TaskEncode` | Handled in MultiTaskGP export | Parity |

### 1.8 Generation Strategy & Acquisition

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| Generation strategy | `GenerationStrategy` with steps | **Not present** | **Gap** -- no concept of "which generator to use next" |
| Sobol step | `GenerationStep(model=Sobol, num_trials=N)` | Not present | Gap -- UI can't know if still in Sobol phase |
| BO step | `GenerationStep(model=BO, ...)` | Not present | Gap |
| Acquisition function config | `AcquisitionFunction` class selection + config | `src/acquisition/` has UCB, EI, LogEI, Thompson, EUBO | **Partial** -- functions exist but no config linkage to Ax |
| Candidate generation | `get_next_trials()` -> runs acqf optimization | `optimizeAcqf()` in `src/acquisition/` | **Partial** -- optimizer exists but not integrated with Predictor |

**This is the biggest structural gap for the BO UI workflow.** axjs has acquisition functions and an optimizer, but:
- No way to know which acqf Ax would use
- No integration between `Predictor` and `src/acquisition/`
- No way to communicate generated candidates back to Ax

### 1.9 Status Quo & Relativization

| Concept | Ax (Python) | axjs (TypeScript) | Gap |
|---------|-------------|-------------------|-----|
| Status quo arm | `experiment.status_quo` | `ExperimentState.status_quo.point` | **Parity** (point only, no arm name) |
| Relativization | `Derelativize` transform + `relativize()` | `Predictor.predictRelative()` + `relativize()` | **Parity** |
| Covariance-aware relativization | Ax uses `cov_means=0` (independence) | axjs defaults to model covariance (tighter CIs) | **Intentional divergence** -- axjs is better |

---

## 2. What axjs Implements That Ax Does NOT Have

These are Predictor convenience methods that go beyond Ax's adapter:

| Feature | axjs | Ax equivalent |
|---------|------|---------------|
| `getTrainingData()` | Returns original-space X, Y | Manual: undo transforms on `model.train_targets` |
| `loocv()` | Analytic LOO-CV (R&W 5.12) | `cross_validate()` in `ax.modelbridge` (refitting-based, much slower) |
| `getLengthscales()` | Recursive kernel tree walk | Manual: `model.covar_module.base_kernel.lengthscale` |
| `rankDimensionsByImportance()` | Sorted by lengthscale | `get_feature_importances_from_botorch_model()` (similar but more complex) |
| `kernelCorrelation()` | Point-to-point kernel similarity | Not available as a simple API |
| `getClosestTrainingPoint()` | Nearest point in normalized space | Not available |
| Client-side acquisition optimization | UCB, EI, LogEI, Thompson, EUBO + L-BFGS | Server-side only via `get_next_trials()` |

---

## 3. What Ax Has That axjs Does NOT

### 3.1 Needed for BO UI round-trip

| Ax feature | Why needed | Priority |
|------------|-----------|----------|
| ~~Parameter constraints~~ | ~~Validate user-selected candidates~~ | **Done** -- exported as `ParameterConstraint[]` |
| **Hierarchical search space** | Know which parameters are active given others | **Medium** |
| ~~Relative constraints~~ | ~~Display constraint satisfaction correctly~~ | **Done** -- `relative?` flag on constraints/thresholds |
| **Generation strategy state** | Know whether to use Sobol vs BO, how many trials remain | **Low** (UI can always use BO) |
| **Acqf<->Predictor integration** | Generate candidates using the same model | **High** |

### 3.2 Not needed (intentional exclusions)

| Ax feature | Why excluded |
|------------|-------------|
| Model fitting (MLL optimization) | Prediction-only by design |
| Runner/Metric classes | Infrastructure for evaluation, not UI |
| Scheduler/deployment | Server-side orchestration |
| Storage/DB backends | Ax manages persistence |
| Transform registry | axjs handles transforms via explicit state |
| GeneratorRun internals | axjs only needs the fitted model output |

---

## 4. Mutation Model: What axjs Can Change

The UI is **read-only for trial lifecycle** (never moves a trial from CANDIDATE->RUNNING->COMPLETED) but **creates new candidates** (both human-selected and acqf-optimized) that sync back to Ax. This is a clean separation:

- **Read-only**: trial status, observations, model state, transforms, optimization config
- **Mutable**: candidate list (append new candidates, possibly discard unsubmitted ones)
- **Derived**: predictions, LOO-CV, feature importance (computed client-side, never sent back)

The key design question is how candidate creation flows back to Ax.

## 5. Synchronization: Trade-off Analysis

Three approaches for syncing new candidates back to Ax:

### Option A: Granular Operations (axjs -> Ax via structured messages)

```typescript
// axjs emits:
{ action: "add_trial", parameters: {x1: 0.5, x2: 0.3}, generation_method: "Manual" }
{ action: "complete_trial", trial_index: 5, metrics: {y: {mean: 1.2, sem: 0.1}} }
```
Maps directly to Ax Client API calls:
- `add_trial` -> `client.attach_trial(parameters)` (for manual/human-selected)
- `complete_trial` -> `client.complete_trial(trial_index, raw_data)`

**Pros**: Clean, minimal data transfer, maps 1:1 to Ax API, easy to validate
**Cons**: Requires defining an operation schema, axjs needs to track pending ops

### Option B: Full State Round-Trip (modified ExperimentState sent back)

axjs modifies its ExperimentState (e.g., appends to `candidates[]`) and sends it back. Python diffs against current Ax state to determine what changed.

**Pros**: Simple mental model -- "the state IS the API"
**Cons**: Diffing is fragile, large payloads, ambiguous semantics (what if both sides changed?), doesn't map cleanly to Ax's trial-based API

### Option C: Hybrid -- Thin Operations + ExperimentState Refresh

axjs emits granular operations (Option A) for mutations. After Ax processes them (and potentially refits the model), Ax sends back a fresh ExperimentState snapshot.

**Pros**: Best of both -- clean mutations, always-fresh predictions, no diffing
**Cons**: Requires a server component to handle the operation -> refit -> re-export cycle

### Recommendation: Option C (Hybrid)

This is the most natural fit because:
1. Ax's API is already operation-based (`attach_trial`, `complete_trial`, `get_next_trials`)
2. After any mutation, the GP must be refit, producing a new model_state anyway
3. ExperimentState is already the right shape for the "read" side
4. The operation vocabulary is tiny (3-5 operations) -- low schema burden

The operation set would be:
- `attach_trial(parameters, arm_name?)` -- human-selected or acqf-generated candidate
- `complete_trial(trial_index, metrics)` -- report outcomes
- `abandon_trial(trial_index)` -- cancel a candidate
- `request_candidates(n, acqf_config?)` -- ask Ax to generate candidates server-side

---

## 6. Congruence Assessment

### Where the models are congruent (safe for round-trip)

- **Search space parameters**: 1:1 mapping, same types and bounds
- **Observations**: axjs `Observation` maps cleanly to Ax trial data
- **Candidates**: axjs `Candidate.parameters` maps to `arm.parameters`
- **Optimization config**: objectives, constraints, thresholds all match
- **Status quo**: direct mapping
- **Outcome names**: consistent across both

### Where they diverge (needs care)

- **Parameter values**: axjs uses positional `number[]` arrays internally but `Record<string, number>` in observations/candidates. Ax always uses `{name: value}` dicts. The Predictor constructor bridges this, but round-trip operations should use the dict form.
- **train_Y space**: axjs `model_state.train_Y` is double-transformed. Any sync must never send raw train_Y back as "observed values."
- **Batch structure**: axjs flattens batches. If sending candidates back, need to specify whether they're individual trials or a batch.
- **Model staleness**: After adding/completing trials, the model_state in axjs is stale until Ax refits and re-exports. The UI must make this clear.

### What's intentionally different (keep it that way)

- **Predictor convenience methods** (LOO-CV, lengthscales, etc.): axjs-only, no Ax equivalent needed
- **Client-side acquisition**: axjs can suggest candidates locally, but Ax should be the authority
- **Covariance-aware relativization**: axjs does this better than Ax's default

---

## 7. Observations & Open Questions

### Completed cleanup

1. **~~Remove `acquisition_value` and `predicted` from `Candidate`~~** — Done. Dead type
   surface removed from `src/models/types.ts` and `docs/FORMAT.md`.

2. **~~Parameter constraints not exported~~** — Done. `ParameterConstraint` interface added
   to `src/models/types.ts`, `_extract_parameter_constraints()` added to `axjs_export.py`,
   wired into `export_experiment()`. Client-side validation logic still TBD.

3. **~~Relative constraints not distinguished~~** — Done. `relative?: boolean` added to
   `OutcomeConstraintConfig` and `ObjectiveThresholdConfig`. Python export populates
   from `c.relative` and `t.relative`.

### Remaining gaps for candidate creation

4. **No bridge between Predictor and acquisition functions.** `src/acquisition/`
   has UCB, EI, LogEI, Thompson, EUBO, and `optimizeAcqf`, but there's no way to
   go from a `Predictor` to "generate N candidates." The acquisition code operates
   on raw model objects, not the Predictor API.

5. **Hierarchical search spaces** are increasingly common in Ax but have no
   representation in `SearchSpaceParam`. If parameters have dependencies (e.g.,
   `num_layers` controls whether `layer_3_size` is active), the UI can't know.

### Sync model -- still TBD

Three options explored in Section 5. The hybrid approach (Option C: granular ops +
ExperimentState refresh) maps best to Ax's API, but this needs real design work
once we know the transport layer (REST API? WebSocket? Jupyter comms?).

### Intentional divergences (keep)

- Flattened observation model (no batch structure -- fine for UI)
- Read-only trial lifecycle (status transitions stay in Ax)
- Two-layer transform architecture (correct and well-tested)
- Predictor convenience methods (unique value-add of axjs)
- Covariance-aware relativization (better than Ax's default)

---

## 8. File Reference Index

For follow-up action planning, here are the key files and what they'd need to change:

### TypeScript (axjs)

| File | What it contains | Relevant for |
|------|-----------------|--------------|
| `src/models/types.ts` | `ExperimentState`, `Candidate`, `SearchSpaceParam`, `OptimizationConfig`, all model state types | Any schema changes (constraints, relative flag, Candidate cleanup) |
| `src/predictor.ts` | `Predictor` class -- predict, predictRelative, getTrainingData, loocv, getLengthscales, etc. | Candidate creation API, acqf integration, validation |
| `src/index.ts` | Public API surface (~20 exports) | Exposing new types/methods |
| `src/acquisition/optimize.ts` | `optimizeAcqf()` -- random search + projected L-BFGS | Bridge to Predictor |
| `src/acquisition/acqf.ts` | UCB, EI, LogEI acquisition function implementations | Acqf config from Ax |
| `src/acquisition/thompson.ts` | Thompson sampling | -- |
| `src/acquisition/eubo.ts` | EUBO (preference-based) | -- |
| `src/transforms/relativize.ts` | `relativize()`, `relativizePredictions()` | Relative constraints |
| `docs/FORMAT.md` | Canonical schema documentation | Must update for any schema changes |

### Python (export side)

| File | What it contains | Relevant for |
|------|-----------------|--------------|
| `python/axjs_export.py` | `export_client()`, `export_experiment()`, all `_extract_*` functions | Any new fields to export |
| `python/_extraction.py` | Shared kernel/transform/model extraction | Model state changes |
| `python/generate_fixtures.py` | Fixture generation pipeline | Testing new export fields |
| `python/generators/ax_level.py` | Ax-level parity fixtures | Testing round-trip scenarios |
| `python/generators/_ax_helpers.py` | UnitX composition, transform building | -- |

### Key line references

- `Candidate` interface: `src/models/types.ts` (cleaned up -- no cruft fields)
- `ExperimentState` interface: `src/models/types.ts` (search_space now has `parameter_constraints?`)
- `ParameterConstraint` interface: `src/models/types.ts`
- `SearchSpaceParam` interface: `src/models/types.ts`
- `OutcomeConstraintConfig`: `src/models/types.ts` (has `relative?` flag)
- `ObjectiveThresholdConfig`: `src/models/types.ts` (has `relative?` flag)
- `OptimizationConfig`: `src/models/types.ts`
- `Predictor` constructor: `src/predictor.ts:55-75`
- `Predictor.predict()`: `src/predictor.ts:89-119`
- `Predictor.observations` getter: `src/predictor.ts:77-80` (read-only passthrough)
- `_extract_candidates()`: `python/axjs_export.py`
- `_extract_observations()`: `python/axjs_export.py`
- `_extract_optimization_config()`: `python/axjs_export.py` (now exports `relative` + `objective_thresholds`)
- `_extract_parameter_constraints()`: `python/axjs_export.py` (new)
- `_extract_adapter_transforms()`: `python/axjs_export.py`
- `optimizeAcqf()`: `src/acquisition/optimize.ts:20-70`
