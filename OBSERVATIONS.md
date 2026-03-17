# ax-js — Observations & Future Work

Notes on performance opportunities, BoTorch/Ax behavior quirks, and unimplemented features.
For architecture and implementation details, see [docs/developer-guide.md](docs/developer-guide.md).

## Performance Optimizations (Deferred)

### 1. LU Factorization Caching in PairwiseGP
`solveLU(CKI, ...)` recomputes LU factorization on every `predict()` and `predictCovarianceWith()` call. Should cache the LU factors (P, L, U) at construction time and only apply the forward/back substitutions during prediction.

### 2. Transpose Allocation
The explicit transpose `KstarT` in `gp.ts:predict()` allocates an n×m matrix just to feed into `forwardSolve`. A `forwardSolveTransposed` that reads K* in column-major order would eliminate this copy.

### 3. Kernel Matrix Reuse
Cross-covariance K* is recomputed each time test points change. For interactive use (slider-driven), caching the last K* and checking if test points changed would help.

### 3a. Shared V Matrix for predict + predictCovarianceWith
When calling both `predict(testPoints)` and `predictCovarianceWith(testPoints, refPoint)`, the V matrix (`V = L⁻¹ @ K*ᵀ`) is computed twice. A combined method or cached V could halve the cost for relativization workflows.

### 4. WASM Linear Algebra
For n > 100, the Cholesky decomposition and matrix multiplications would benefit from compiled linear algebra (WASM-BLAS, Web Workers, SharedArrayBuffer).

### 5. Memory Allocation
Every kernel `compute()` call allocates new `Matrix` objects. For hot paths (repeated predictions during visualization), an arena allocator or pre-allocated scratch matrices would reduce GC pressure.

## Features Not Yet Implemented

### 1. LMC (Linear Model of Coregionalization)
LMC generalizes ICM by using multiple latent functions. ICM is the special case with one latent function. Rarely used in Ax but could be needed for complex multi-task setups.

### 2. Fantasy Models
BoTorch supports "fantasizing" — conditioning on hypothetical observations. Used for knowledge gradient and lookahead acquisition. Not needed for prediction-only use.

### 3. GPU/WebGPU
For very large n (>1000), WebGPU-based matrix operations could provide significant speedup.

### 4. LCEAGP (Latent Context Embedding Additive GP)
Used for transfer learning across related experiments. Each context gets a learned embedding vector, and the GP kernel operates on the joint (parameter, embedding) space.

## BoTorch/Ax Behavioral Notes

These observations are useful context for Ax/BoTorch developers reviewing ax-js.

### Bilog/Power/Log Are Adapter-Only in Practice

BoTorch defines `Bilog`, `Power`, and `Log` as model-level outcome transforms (`botorch.models.transforms.outcome`), but **Ax never passes them as `outcome_transform` to `SingleTaskGP`**. They are always applied at the adapter level via `BilogY`, `PowerTransformY`, and `LogY`.

The real pipeline for a BilogY-transformed metric:
```
Raw Y → [Adapter: BilogY.transform()] → bilog(Y)
     → [Model: outcome_transform=Standardize() ONLY] → GP trains on standardized bilog(Y)

Predict:
GP posterior → [Model: Standardize⁻¹] → bilog-space (μ, σ²)
            → [Adapter: BilogY.untransform()] → original-space (μ, σ²)
```

**Why:** BoTorch's `Bilog` and `Power` provide **only** `sample_transform` (for MC acquisition), with **no** `mean_transform` or `variance_transform`. Calling `.mean` or `.variance` raises `NotImplementedError`.

**Log is a special case:** BoTorch's `Log` DOES have analytic moments (`norm_to_lognorm_mean/variance`), so it could work as a model-level transform. But Ax uses `LogY` at the adapter level in practice.

**Covariance across the transform boundary:** `predictCovarianceWith()` returns covariance in the GP's internal (transformed) space. For nonlinear transforms, the identity `Cov(f(x),f(x)) = Var(f(x))` does NOT hold across the transform boundary (self-covariance is in GP space, variance from `predict()` is in original space).

### Log Transform Uses Exact Log-Normal, Not Delta Method

BoTorch's `Log` outcome transform uses exact log-normal distribution formulas: `E[Y] = exp(μ + σ²/2)`, `Var[Y] = expm1(σ²)·exp(2μ + σ²)`. This means the mean prediction depends on the posterior variance.

### Relativization Ignores Posterior Covariance

Ax's `relativize()` always passes `cov_means=0`, treating test and control predictions as independent. For GP models, predictions at the test and status quo points are typically positively correlated. Ignoring this covariance makes relative effect confidence intervals wider than necessary (conservative). ax-js uses model covariance by default for tighter CIs — this is an intentional improvement.
