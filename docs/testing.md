# ax-js Testing Guide

This guide covers the testing architecture, the fixture system, and how to add
new test coverage. It is aimed at both ax-js contributors and Ax/BoTorch
developers who need to onboard new model features.

## Quick Reference

```bash
npx vitest run                        # Run all tests
npx tsc --noEmit                      # Type-check
python python/generate_fixtures.py    # Regenerate BoTorch parity fixtures
npx tsup                              # Build bundle
```

## Testing Architecture

Three layers of tests ensure correctness at increasing scope:

| Layer | File | Ground Truth | Purpose |
|-------|------|-------------|---------|
| Unit | `test/` | Hand-computed | Mathematical properties |
| BoTorch-level | `botorch_parity.test.ts` | Raw BoTorch posterior | Low-level model math |
| **Ax-level** | **`predictor_parity.test.ts`** | **Ax `adapter.predict()`** | **End-to-end parity** |

### 1. Unit Tests (`test/`)

File-mirroring convention: `src/kernels/matern.ts` -> `test/kernels/matern.test.ts`.

These test mathematical properties:
- Kernel symmetry, positive-definiteness, special cases
- Formula correctness against hand-computed values
- Edge cases (empty inputs, single points, degenerate parameters)
- All `throw` statements with `expect(() => ...).toThrow()`

Use vitest:
```typescript
import { describe, it, expect } from "vitest";

it("kernel is symmetric", () => {
  const K = kernel.compute(X, X);
  for (let i = 0; i < K.rows; i++)
    for (let j = 0; j < K.cols; j++)
      expect(K.get(i, j)).toBeCloseTo(K.get(j, i), 12);
});
```

### 2. BoTorch Parity (`test/integration/botorch_parity.test.ts`)

Low-level tests verifying that ax-js model predictions match BoTorch's raw
posterior output exactly (within tolerance). These test the kernel, Cholesky, and
transform implementations.

```
BoTorch model -> generate_fixtures.py -> JSON fixture -> botorch_parity.test.ts -> compare
```

The test harness:
1. Loads the manifest (`test/fixtures/manifest.json`)
2. Validates a minimum fixture count (currently 32 parity fixtures)
3. Loads each fixture, builds the model via `loadModel()`, and predicts at test points
4. Compares against expected mean and variance using `expectAllClose`
5. Prints a report card showing discrepancy statistics

### 3. Predictor / Ax Parity (`test/integration/predictor_parity.test.ts`)

**Authoritative end-to-end parity.** Ground truth is Ax's actual
`adapter.predict()` — the same pipeline real users interact with.

```
Ax Client -> adapter.predict() -> reference values
Fixture JSON -> Predictor.predict() -> compare against reference
```

Ax-level fixtures have `test.metadata.ax_level = true` and test:
- Adapter transforms: LogY, BilogY, StandardizeY, PowerTransformY
- Combined adapter + model transforms (e.g., LogY + Standardize)
- Multi-output with per-metric adapter transforms
- MultiTaskGP predictions for all tasks
- Relativization via `Predictor.predictRelative()`

### 4. Integration Tests (`test/integration/relativize_parity.test.ts`)

Property-based tests for covariance and relativization:
- Self-covariance equals variance (fundamental identity)
- Covariance symmetry and Cauchy-Schwarz bound
- Relativize/unrelativize round-trip
- Covariance tightens relative confidence intervals

## Tolerance

A single global tolerance of `1e-6` is used for all fixtures. Comparison follows
numpy `allclose` semantics:

```
|actual - expected| <= atol + atol * |expected|
```

This handles large-magnitude values correctly (e.g., variances of ~10^11 for
PressureVessel). Any discrepancy above `1e-5` indicates a real numerical bug,
not floating-point precision limits. **Never relax the tolerance past `1e-5`.**

## The Fixture System

### What Is a Fixture?

A fixture is a JSON file in `test/fixtures/` containing:
1. An `ExperimentState` (search space, model state, transforms, etc.)
2. Test expectations: test points and BoTorch's reference predictions

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

**Consistency-only fixtures** (Bilog, Power) have `expected.mean === null`. These
verify that the model loads and predictions are finite and deterministic, but
have no BoTorch reference to compare against (BoTorch raises
`NotImplementedError` for analytic posteriors on these transforms).

### The Manifest

`test/fixtures/manifest.json` lists all fixtures:

```json
{
  "fixtures": [
    { "name": "branin_matern25", "file": "branin_matern25.json", "description": "..." },
    ...
  ]
}
```

The test harness validates:
- `MINIMUM_FIXTURES` (32): prevents silent fixture loss
- All referenced files exist on disk
- Expected values have meaningful signal (not trivially near-zero)

Ax-level fixtures are excluded from the minimum count and tested separately in
`predictor_parity.test.ts`.

### Report Card

After running all parity fixtures, the test harness prints a discrepancy summary:

```
Fixture                       Model           N  Mean(avg)    Mean(max)    Var(avg)     Var(max)
branin_matern25               SingleTaskGP   20  2.30e-15     7.11e-15     1.60e-10     1.60e-10
branin_rbf                    SingleTaskGP   20  1.45e-14     4.89e-14     9.27e-11     9.27e-11
...
Worst-case: mean=7.11e-15, variance=1.60e-10
Tolerance: 1.00e-6 (global)
```

This makes it easy to spot regressions or near-tolerance results.

## How Fixtures Are Generated

Fixtures are generated by `python/generate_fixtures.py`. The pipeline:

1. A `FixtureSpec` defines what to generate (model type, kernel, transforms, etc.)
2. A generator function (in `python/generators/`) builds the BoTorch model
3. `_extraction.py` extracts model state to the `ExperimentState` JSON format
4. The generator computes reference predictions at random test points
5. Everything is saved as a JSON fixture

### FixtureSpec

Each fixture is defined as a `FixtureSpec` dataclass:

```python
@dataclass
class FixtureSpec:
    name: str              # Unique name, becomes the JSON filename
    benchmark: str         # "Branin" | "Hartmann" | "BraninCurrin"
    model_class: str       # "SingleTaskGP" | "ModelListGP" | etc.
    n_train: int           # Number of training points
    n_test: int            # Number of test points for parity comparison
    seed: int              # Deterministic seed (must be unique across specs)
    description: str       # Human-readable description
```

#### Key Optional Fields

| Field | Default | Description |
|-------|---------|-------------|
| `kernel_type` | `"Matern"` | `"Matern"` or `"RBF"` |
| `nu` | `2.5` | Matern smoothness: 0.5, 1.5, or 2.5 |
| `use_warp` | `False` | Kumaraswamy input warping |
| `use_composite` | `False` | Product(continuous x Categorical) kernel |
| `use_additive` | `False` | AdditiveKernel (per-dim) |
| `cat_dims` | `None` | Categorical dimension indices |
| `int_dims` | `None` | Integer parameter dimensions |
| `noise` | `None` | Fixed noise level (makes FixedNoiseGP) |
| `heteroscedastic_noise` | `False` | Per-point noise proportional to \|y\| |
| `outcome_type` | `"Standardize"` | `"Standardize"`, `"Log"`, `"Bilog"`, `"Power"`, `"Chained"` |
| `negate_benchmark` | `True` | Negate Y (set False for Log which needs Y > 0) |
| `num_tasks` | `0` | >0 for MultiTaskGP |
| `status_quo` | `None` | `"center"` to include relativization reference |
| `ax_level` | `False` | Generate through the Ax adapter pipeline |
| `adapter_transforms` | `None` | List of adapter Y-transforms: `["LogY"]`, etc. |
| `all_tasks` | `False` | Predict for all tasks (MultiTaskGP) |
| `objectives` | `None` | `[{name, minimize}]` for optimization config |
| `outcome_constraints` | `None` | `[{name, bound, op}]` for constraints |
| `objective_thresholds` | `None` | `[{name, bound, op}]` for MOO thresholds |

### Generator Functions

Generators live in `python/generators/` organized by model type:

| File | Generator | Handles |
|------|-----------|---------|
| `singletask.py` | `generate_singletask_fixture` | SingleTaskGP, FixedNoiseGP |
| `model_list.py` | `generate_model_list_fixture` | ModelListGP (multi-output) |
| `pairwise.py` | `generate_pairwise_fixture` | PairwiseGP |
| `multitask.py` | `generate_multitask_fixture` | MultiTaskGP |
| `ensemble.py` | `generate_ensemble_fixture` | EnsembleGP (SAAS/MAP) |
| `ax_level.py` | `generate_ax_level_fixture` | Ax-level (through Ax Client API) |
| `_ax_helpers.py` | (helpers) | UnitX composition, transform building |

The main `generate_fixtures.py` dispatches to these based on `model_class` and
`ax_level`.

### Extraction (Shared Logic)

`python/_extraction.py` contains all model-state extraction logic. It is the
single source of truth shared by both `axjs_export.py` (user-facing export) and
`generate_fixtures.py` (test fixtures). Key functions:

- `extract_kernel_state(covar)` — recursive kernel tree extraction
- `_extract_input_transform(model)` — Normalize + Warp extraction
- `_extract_outcome_transform(model)` — Standardize, Log, etc.
- `_export_batched_multi_output(model)` — decompose batched GP into ModelListGP

## How to Add a New Fixture

### Step 1: Define a FixtureSpec

Add to the `FIXTURE_SPECS` list in `python/generate_fixtures.py`:

```python
FixtureSpec(
    name="branin_my_feature",
    benchmark="Branin",
    model_class="SingleTaskGP",
    n_train=15,
    n_test=20,
    seed=99,           # Must be unique across all specs
    description="Branin 2D with my new feature",
    # ... feature-specific fields
),
```

### Step 2: Add Generator Logic (if needed)

If the new fixture uses an existing model type with new options, modify the
relevant generator in `python/generators/`. If it requires a new model type,
create a new generator file.

### Step 3: Add Extraction Logic (if needed)

If BoTorch's model has new attributes to extract, update `python/_extraction.py`.
This is the most important step — extraction errors cause silent prediction bugs.

### Step 4: Generate and Test

```bash
# Generate the new fixture
python python/generate_fixtures.py

# Update MINIMUM_FIXTURES in botorch_parity.test.ts if adding parity fixtures
# (not needed for consistency-only or ax-level fixtures)

# Run all tests
npx vitest run
```

The generator automatically updates `test/fixtures/manifest.json`.

### Step 5: Add TypeScript Support (if needed)

If the fixture tests a new kernel, model, or transform type, implement the
TypeScript side first (see the developer guide for how-to), then generate
fixtures to verify parity.

## Adding Ax-Level Parity Fixtures

Ax-level fixtures test the full Predictor pipeline including adapter transforms.
They are more authoritative than BoTorch-level fixtures because the ground truth
is Ax's actual `adapter.predict()`.

```python
FixtureSpec(
    name="ax_branin_my_transform",
    benchmark="Branin",
    model_class="SingleTaskGP",
    n_train=15,
    n_test=20,
    seed=200,
    ax_level=True,                      # Generate through Ax Client API
    adapter_transforms=["MyTransformY"],  # Ax adapter transform
    description="MyTransformY adapter parity",
),
```

These fixtures use `ax.api.Client` to build a real Ax experiment, fit a model,
and capture `adapter.predict()` output as the reference. They are tested in
`predictor_parity.test.ts`, not `botorch_parity.test.ts`.

## Intended Workflow: Onboarding New BoTorch/Ax Features

When Ax or BoTorch adds new functionality (e.g., a new kernel, transform, or
model type), here is the recommended workflow:

1. **Understand the feature**: Read the BoTorch/Ax source to understand the new
   model component and its prediction behavior.

2. **Update extraction**: Modify `python/_extraction.py` to extract the new
   component's state into JSON. Run `python python/generate_fixtures.py` to
   verify extraction works.

3. **Implement in TypeScript**: Add the new kernel/model/transform in `src/`.
   Write unit tests first.

4. **Add fixtures**: Define `FixtureSpec` entries that exercise the new feature.
   Generate fixtures. Run `npx vitest run` and iterate until parity is achieved.

5. **Add Ax-level fixtures**: If the feature involves adapter transforms or
   changes the Predictor pipeline, add `ax_level=True` fixtures for
   authoritative end-to-end parity.

### When BoTorch/Ax APIs Change

If a BoTorch upgrade changes model internals (attribute names, kernel structure):

1. Run `python python/generate_fixtures.py` — extraction failures will show
   where `_extraction.py` needs updating.
2. Fix extraction, regenerate fixtures.
3. Run `npx vitest run` — any TypeScript-side parity failures indicate model
   math that needs updating.

The fixture system is deterministic (seeded). Same BoTorch version and same seed
always produce identical fixtures.

## When to Run Tests

| Changed | Run |
|---------|-----|
| Any TypeScript source | `npx tsc --noEmit && npx vitest run` |
| Kernels, transforms, models | Also regenerate fixtures if extraction changed |
| `_extraction.py` or `generate_fixtures.py` | `python python/generate_fixtures.py && npx vitest run` |
| Upgrading BoTorch/GPyTorch | Full regenerate + test |
| Docs only, build config | No tests needed |

## Python Environment

```bash
pip install -r python/requirements.txt
# Requires: botorch>=0.17, gpytorch>=1.10, ax-platform>=1.2
```

## Fixture Coverage Matrix

### BoTorch-Level Parity

| Fixture | Model | Feature |
|---------|-------|---------|
| `branin_matern25` | SingleTaskGP | Matern 5/2, ARD, Normalize+Standardize |
| `branin_rbf` | SingleTaskGP | RBF kernel |
| `branin_matern05` | SingleTaskGP | Matern nu=0.5 (exponential) |
| `branin_matern15` | SingleTaskGP | Matern nu=1.5 |
| `branin_fixed_noise` | FixedNoiseGP | Homoscedastic fixed noise |
| `branin_heteroscedastic` | FixedNoiseGP | Heteroscedastic noise |
| `branin_warp` | SingleTaskGP | Kumaraswamy input warping |
| `branin_1pt` | SingleTaskGP | Edge case: n_train=1 |
| `branin_additive` | SingleTaskGP | AdditiveKernel (per-dim) |
| `branin_log` | SingleTaskGP | Log outcome transform |
| `branin_chained_log_std` | SingleTaskGP | Chained(Log, Standardize) |
| `branin_bilog` | SingleTaskGP | Bilog outcome (consistency only) |
| `branin_power` | SingleTaskGP | Power outcome (consistency only) |
| `branin_pairwise` | PairwiseGP | Laplace + LU |
| `pairwise_warp` | PairwiseGP | + input warping |
| `hartmann_6d` | SingleTaskGP | 6D, strong ARD |
| `hartmann_integer` | SingleTaskGP | Integer parameters |
| `hartmann_mixed` | SingleTaskGP | Product(Matern x Categorical) |
| `hartmann_mixed_warp` | SingleTaskGP | Mixed + warp |
| `branincurrin_modellist` | ModelListGP | 2 outcomes |
| `branincurrin_fixednoise_modellist` | ModelListGP | + FixedNoise sub-models |
| `branincurrin_warp_fixednoise_modellist` | ModelListGP | + Warp + heteroscedastic |
| `branin_multitask` | MultiTaskGP | 2 tasks (ICM) |
| `multitask_mixed` | MultiTaskGP | + categorical |
| `multitask_warp` | MultiTaskGP | + input warping |
| `saas_highdim_nuts` | EnsembleGP | Fully Bayesian SAAS (NUTS) |
| `saas_highdim_map` | EnsembleGP | Multi-restart MAP |
| `branin_relative` | SingleTaskGP | Relativization (noiseless) |
| `branin_relative_fixed_noise` | FixedNoiseGP | Relativization (noisy) |
| `vsip_modellist` | ModelListGP | 7D, 9 outcomes |
| `c2dtlz2_constrained_moo` | ModelListGP | Constrained MOO |
| `discbrake_constrained_moo` | ModelListGP | Engineering MOO |
| `pressure_vessel_constrained` | ModelListGP | Constrained SOO |
| `trajectory_planning_30d` | SingleTaskGP | 30D high-dimensional |

### Ax-Level Parity (Predictor)

| Fixture | Feature |
|---------|---------|
| `ax_branin_logy` | LogY adapter transform |
| `ax_branin_bilogy` | BilogY adapter transform |
| `ax_branin_standardizey` | StandardizeY adapter transform |
| `ax_branin_bilogy_standardize` | BilogY adapter + Standardize model |
| `ax_branincurrin_logy` | LogY on both metrics |
| `ax_branincurrin_batched` | Ax default MOO (batched -> ModelListGP) |
| `ax_branincurrin_relative` | Multi-output relativization |
| `ax_multitask_relative` | Multi-task relativization |
| `ax_multitask_all_tasks` | All tasks prediction |
| `ax_branin_powery` | PowerTransformY adapter |
| `ax_branin_log_standardize` | LogY adapter + Standardize model |
