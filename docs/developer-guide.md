# ax-js Developer Guide

This guide is for contributors to the ax-js library. It covers the architecture,
the prediction pipeline, and how to extend the library with new kernels, models,
or transforms.

## Overview

ax-js is a TypeScript library that mirrors BoTorch/Ax GP posterior predictions
client-side. It is **prediction-only** — model fitting (MLL optimization, MCMC)
stays in Python. Hyperparameters are exported from Python via `axjs_export.py` as
a JSON `ExperimentState`, deserialized in TypeScript, and used to compute GP
posteriors in the browser or Node.js.

All computations use Float64 (double precision) throughout. The global numerical
tolerance for parity with BoTorch is `1e-8`.

## Source Layout

```
src/
  linalg/         Matrix ops, Cholesky, LU, forward/back substitution
  kernels/        Kernel functions (Matern, RBF, Scale, Categorical, composites)
  means/          Mean functions (ConstantMean)
  models/         GP model classes and TypeScript type definitions
  transforms/     Input transforms (Normalize, Warp) and outcome transforms
  io/             Deserialization from JSON to model objects
  acquisition/    Acquisition functions (UCB, EI, LogEI, Thompson, EUBO) + optimizer
  predictor.ts    High-level Predictor class (the main public API)
  index.ts        Public API surface (~20 exports)
```

### Linear Algebra (`src/linalg/`)

| File | Purpose |
|------|---------|
| `matrix.ts` | Row-major `Matrix` class backed by `Float64Array` |
| `cholesky.ts` | Cholesky decomposition with escalating jitter (1e-6 to 1e-3) |
| `lu.ts` | LU factorization with partial pivoting (needed for PairwiseGP) |
| `solve.ts` | Forward/back substitution, `solveCholesky`, `solveLU` |
| `ops.ts` | Matrix multiply, transpose, diagonal extraction |

### Kernels (`src/kernels/`)

| File | Purpose |
|------|---------|
| `types.ts` | `Kernel` interface: `compute(x1, x2) -> Matrix`, optional `computeDiag` |
| `matern.ts` | Matern kernel (nu = 0.5, 1.5, 2.5) with ARD. Matches GPyTorch mean-centering. |
| `rbf.ts` | RBF (squared exponential) with ARD. No mean-centering (differs from Matern). |
| `scale.ts` | `ScaleKernel`: wraps a base kernel, multiplies by `outputscale` |
| `categorical.ts` | `CategoricalKernel`: `exp(-mean(delta/ls))` for discrete features |
| `composite.ts` | `AdditiveKernel`, `ProductKernel`, `ActiveDimsKernel` |
| `multitask.ts` | `MultitaskKernel`: Kronecker product of data kernel and task covariance |
| `distance.ts` | Euclidean/squared distance with clamping |
| `build.ts` | `buildKernel(KernelState)`: recursive deserializer for the kernel tree |

### Models (`src/models/`)

| File | Class | Use Case |
|------|-------|----------|
| `gp.ts` | `ExactGP` | Core GP posterior (Cholesky, alpha, predict). All other GPs use this. |
| `single_task.ts` | `SingleTaskGP` | Standard GP. Constructs `ExactGP` from `GPModelState`. |
| `model_list.ts` | `ModelListGP` | Multi-output: one `SingleTaskGP` per outcome. |
| `multi_task.ts` | `MultiTaskGP` | Multi-task with ICM kernel and per-task means. |
| `pairwise_gp.ts` | `PairwiseGP` | Preference learning via Laplace approximation. Uses LU (not Cholesky). |
| `ensemble_gp.ts` | `EnsembleGP` | Ensemble of GPs (SAAS/MAP). Law-of-total-variance aggregation. |
| `types.ts` | (types only) | All TypeScript interfaces (`GPModelState`, `ExperimentState`, etc.) |

### Transforms (`src/transforms/`)

| File | Purpose |
|------|---------|
| `normalize.ts` | `InputNormalize`: affine `(x - offset) / coefficient` mapping raw params to [0,1] |
| `warp.ts` | `InputWarp`: Kumaraswamy CDF warping (after normalization) |
| `outcome.ts` | `StandardizeUntransform`, `LogUntransform`, `BilogUntransform`, `PowerUntransform`, `ChainedOutcomeUntransform` |
| `build_outcome.ts` | `buildOutcomeUntransform(OutcomeTransformState)` factory |
| `relativize.ts` | `relativize()`, `unrelativize()`, `relativizePredictions()` matching Ax's `math_utils.relativize()` |

## The Prediction Pipeline

Understanding the prediction flow is essential for contributing. Here is how a
prediction goes from raw parameter values to final output:

### Step 1: Input Transformation

Raw parameter values (in the original search space) pass through two transforms:

1. **Normalize**: `x_norm = (x - offset) / coefficient` maps to [0, 1]
2. **Warp** (optional): Kumaraswamy CDF `KumaCDF(x_norm; c0, c1)` for non-linear warping

The kernel always sees transformed (normalized + warped) inputs.

### Step 2: Kernel Evaluation

The kernel computes covariance matrices:
- **K**: training-training covariance `K(X_train, X_train)` (pre-computed at construction)
- **K\***: training-test cross-covariance `K(X_train, X_test)` (computed at predict time)
- **K\*\***: test self-covariance diagonal (computed at predict time)

### Step 3: GP Posterior (ExactGP)

Pre-computed at construction time:
```
L = cholesky(K + noise * I)
alpha = L^T \ (L \ (y - mean(X)))
```

At prediction time:
```
mu = mean(X*) + K* @ alpha
v = L \ K*^T
var = diag(K**) - sum(v^2, axis=0)
```

### Step 4: Outcome Untransformation (Two-Layer Architecture)

Predictions come back in the GP's internal (transformed) space. Two layers of
untransformation bring them to the user's original data space:

**Layer 1 — Model-level transforms** (within BoTorch):
Applied automatically by the model class. These are stored in `model_state.outcome_transform`:
- `Standardize`: linear `y = mean + std * y_standardized`
- `Log`: exact log-normal moments `E[Y] = exp(mu + sigma^2/2)`
- `Bilog`, `Power`: delta method approximations

**Layer 2 — Adapter-level transforms** (Ax boundary):
Applied by the `Predictor` class. These are metadata in `ExperimentState.adapter_transforms`:
- `LogY`, `BilogY`, `PowerTransformY`, `StandardizeY`
- Applied per-outcome after the model prediction

**Critical rule**: `model_state.train_Y` has been transformed by BOTH layers. To
get original-space Y, you must undo both in reverse order. The `Predictor` class
handles this via `untransformTrainY()`. Any new method returning Y values must use
it — never read `train_Y` directly.

### The Predictor Class

`Predictor` (`src/predictor.ts`) is the primary public API. It wraps a loaded
model plus metadata and handles all the complexity above:

```typescript
const predictor = new Predictor(experimentState);
const preds = predictor.predict(points);       // Record<string, {mean, variance}>
const td = predictor.getTrainingData("y");     // original-space training data
const loo = predictor.loocv("y");              // analytic LOO-CV
const ls = predictor.getLengthscales("y");      // kernel lengthscales

// Relativization (% change vs status quo) — matches Ax's separated pattern:
import { relativizePredictions } from "ax-js";
const sqPreds = predictor.predict([predictor.statusQuoPoint!]);
const rel = relativizePredictions(
  preds["y"].mean, preds["y"].variance,
  sqPreds["y"].mean[0], sqPreds["y"].variance[0],
);
```

It dispatches correctly across model types (SingleTaskGP, ModelListGP, MultiTaskGP)
without the caller needing to know which model is loaded.

**Rule**: Always use `Predictor` for prediction. Direct `loadModel()` usage is
reserved for the one legacy parity test (`hartmann6_sanity`).

## Posterior Covariance

All model types implement `predictCovarianceWith(points, refPoint)` for
relativization workflows:

| Model | Formula |
|-------|---------|
| ExactGP / SingleTaskGP | `Cov = k(a,b) - v_a . v_b` where `v = L^-1 K*^T` |
| PairwiseGP | `Cov = k(a,b) - K(a,X) @ (CK+I)^-1 @ C @ K(X,b)` (LU) |
| MultiTaskGP | Same as ExactGP with task-augmented kernel |
| ModelListGP | Per-output (returns `Float64Array[]`) |
| EnsembleGP | Law of total covariance: `E_k[Cov_k] + Cov_k(mu_a, mu_b)` |

ax-js defaults to using model covariance for relativization, which produces
tighter confidence intervals than Ax's default (`cov_means=0`).

## Numerical Details

These details are important for anyone modifying kernel or model code:

1. **Matern mean-centering**: GPyTorch subtracts `x1.mean(axis=0)` from both
   inputs before computing distances. RBF does NOT do this.
2. **Distance clamping**: Euclidean distances are clamped at 1e-15 (squared at 0).
3. **Cholesky jitter**: Escalating jitter values `[1e-6, 1e-5, 1e-4, 1e-3]`
   matching GPyTorch's `psd_safe_cholesky`.
4. **PairwiseGP**: The `CK+I` matrix is NOT symmetric, so it requires LU
   factorization rather than Cholesky.
5. **Warp epsilon**: BoTorch normalizes to `[eps, 1-eps]` via
   `x * (1 - 2*eps) + eps` with `eps=1e-7`. This is an affine squeeze, NOT clamping.
6. **CategoricalKernel**: Uses epsilon equality (`1e-8`) for category matching,
   NOT `Math.round()`.

## How to Add a New Kernel

1. Create `src/kernels/my_kernel.ts` implementing the `Kernel` interface:

```typescript
import { Matrix } from "../linalg/matrix.js";
import type { Kernel } from "./types.js";

export class MyKernel implements Kernel {
  compute(x1: Matrix, x2: Matrix): Matrix {
    // Return n1 x n2 covariance matrix
  }
  computeDiag(x: Matrix): Float64Array {
    // Return m-length diagonal (optional but recommended for performance)
  }
}
```

2. Add the type to `KernelState` in `src/models/types.ts`:
```typescript
export interface KernelState {
  type: "Matern" | "RBF" | ... | "MyKernel";
  // ... add any new fields
}
```

3. Add a case in `buildKernel()` in `src/kernels/build.ts`.

4. Add extraction logic in `python/_extraction.py` (`extract_kernel_state`).

5. Add a fixture in `python/generate_fixtures.py` and unit tests.

## How to Add a New Model Type

1. Create `src/models/my_model.ts` with a class that has:
   - `predict(points: number[][]): PredictionResult`
   - `predictCovarianceWith(...)` for relativization support

2. Add the state interface to `src/models/types.ts` and include it in `AnyModelState`.

3. Add a deserialization case in `src/io/deserialize.ts` (`loadModel`).

4. Handle it in `Predictor.predict()` and `getCovariances()`.

5. Add extraction logic in `python/_extraction.py` and update `axjs_export.py`.

6. Create parity fixtures and tests.

## How to Add a New Transform

### Model-level outcome transform

1. Implement `OutcomeUntransform` in `src/transforms/outcome.ts`:
```typescript
export class MyUntransform implements OutcomeUntransform {
  untransform(mu: number, variance: number): { mean: number; variance: number } {
    // Map from transformed space back to original space
  }
  untransformCovariance(cov: number): number {
    // Scale covariance (linear: std^2 * cov; nonlinear: return raw)
  }
}
```

2. Add the type to `OutcomeTransformState` in `src/models/types.ts`.

3. Add a case in `buildOutcomeUntransform()` in `src/transforms/build_outcome.ts`.

4. Add extraction logic in `python/_extraction.py` (`_extract_outcome_transform`).

### Adapter-level transform

1. Add the type to `AdapterTransform` in `src/models/types.ts`.

2. Add a case in `buildAdapterUntransforms()` in `src/predictor.ts`.

3. Add extraction logic in `python/axjs_export.py` (`_extract_adapter_transforms`).

4. Create Ax-level parity fixtures using `ax_level=True` in the fixture spec.

## Python Export Code

The Python side has two key files:

| File | Purpose |
|------|---------|
| `python/_extraction.py` | Shared extraction logic (kernels, transforms, models). Single source of truth. |
| `python/axjs_export.py` | User-facing export: `export_client(client)` returns `ExperimentState`. Imports from `_extraction.py`. |

`_extraction.py` walks BoTorch model internals to extract prediction-relevant
state (kernel parameters, training data, transforms). It handles:
- Recursive kernel tree extraction
- Batched multi-output decomposition (Ax's default MOO uses a single batched GP)
- Input/outcome transform extraction
- UnitX composition (Ax normalizes inputs to [0,1] before BoTorch sees them)

When BoTorch internals change (e.g., new kernel attribute names), `_extraction.py`
is the only file that needs updating.

## Key Files for Reference

| File | Path |
|------|------|
| Public API | `src/index.ts` |
| Predictor | `src/predictor.ts` |
| All type definitions | `src/models/types.ts` |
| Core GP posterior | `src/models/gp.ts` |
| Kernel deserializer | `src/kernels/build.ts` |
| Python extraction | `python/_extraction.py` |
| Python export API | `python/axjs_export.py` |
| Fixture generator | `python/generate_fixtures.py` |
| Data model schema | `docs/data-model.md` |
| Testing guide | `docs/testing.md` |
| Cockpit (MOO tool) | `docs/cockpit.md` |
| Codebase observations | `plans/codebase-observations.md` |
| Internal: numerics | `docs/internal/numerics.md` |
| Upstream proposals | `plans/upstream-proposals.md` |
| Internal: data model comparison | `docs/internal/ax-js-vs-ax.md` |
