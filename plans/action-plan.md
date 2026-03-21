# Action Plan

Prioritized cleanup and improvement tasks for ax-js.
Cross-references: `plans/codebase-observations.md`, `plans/upstream-proposals.md`.

---

## Tier 1: High Impact, Low Risk — ✅ COMPLETE

### 1.1 ✅ Cache LU factorization in PairwiseGP

Cached LU factors (P, L, U) at construction time. Added `solveLUWithFactors()`
to `src/linalg/lu.ts`. Predict calls drop from O(n³) to O(n²).

### 1.2 ✅ Share V matrix between predict and predictCovarianceWith

Added V matrix cache in `ExactGP`. When `predictCovarianceWith` is called with
the same test points as `predict`, V is reused (~50% savings on relativization).

### 1.3 ✅ Add computeDiag to all kernels

All 9 kernel types already had `computeDiag` implemented. Added 6-test
verification suite (`test/kernels/computeDiag.test.ts`) confirming diagonal
matches full matrix to 1e-12.

### 1.4 ✅ Reduce `any` usage

Eliminated all 9 `any` occurrences in src/ via discriminated unions. Added
`SubModelState` type alias, proper type guards in Predictor.

---

## Tier 2: Medium Impact, Independent — ✅ COMPLETE

### 2.1 ✅ Diagonal-only Kss path

Was already implemented via `kernelDiag()` in `gp.ts`. Confirmed working with
all kernel types. For 80×80 grid: 328 MB → 51 KB.

### 2.2 ✅ Kernel caching for interactive use

Added K* (cross-covariance) cache in `ExactGP` with key based on dimensions +
first/last values. Eliminates redundant kernel evaluations during slider-driven
visualization. Tests in `test/models/gp_cache.test.ts`.

### 2.3 ✅ forwardSolveTransposed

Added `forwardSolveTransposed(L, B)` to `src/linalg/solve.ts`. Solves
`L X = Bᵀ` without allocating the transpose matrix. Saves O(nm) allocation
per predict call (~781 KB for n=100, m=1000).

### 2.4 ✅ ESLint configuration cleanup

Full ESLint 9 flat config + Prettier + unicorn. Copyright headers on all 92
`.ts` files. Zero lint errors. `npm run lint` / `npm run format` scripts added.

---

## Tier 3: Needs Upstream Coordination

These require engagement with the Ax or BoTorch teams. See
`plans/upstream-proposals.md` for full proposals.

### 3.1 Push for `_task_feature` and `_eval_covar_matrix()` stabilization

These are the two highest-risk private attributes. File issues or PRs to make
them public properties on `MultiTaskGP` and `PositiveIndexKernel`.

**Priority:** P0 in upstream-proposals.md
**Blocked on:** BoTorch team review

### 3.2 Propose `model.prediction_state()`

Draft a BoTorch RFC for a `prediction_state()` method that returns a
self-contained dict with everything needed for prediction replication.

**Priority:** P1 in upstream-proposals.md
**Blocked on:** BoTorch design review

### 3.3 Propose adapter transform metadata

Either `adapter.prediction_metadata()` or documentation of `adapter.transforms`
as a stable public API.

**Priority:** P2 in upstream-proposals.md
**Blocked on:** Ax team review

### 3.4 Propose Bilog/Power analytic moments

File an issue for adding delta-method moment approximations to `Bilog` and
`Power` outcome transforms, enabling them as model-level transforms.

**Blocked on:** BoTorch team interest and mathematical review

---

## Tier 4: Future / Large Scope

These require RFCs and are not actionable without further design work.

### 4.1 WASM linear algebra

For n > 100, compiled BLAS (via WASM) would significantly accelerate Cholesky
and matrix multiplications. Requires evaluating WASM-BLAS libraries, Web Worker
integration, and SharedArrayBuffer support.

### 4.2 Predictor-acquisition integration

Currently `Predictor` and `optimizeAcqf` are loosely coupled. A tighter
integration could share kernel evaluations and cache the posterior state across
acquisition function evaluations.

### 4.3 Hierarchical search space support

Ax supports hierarchical (conditional) search spaces where some parameters are
only active when others take specific values. ax-js currently treats all
parameters as unconditionally active.

### 4.4 WebGPU acceleration

For very large n (>1000), WebGPU-based matrix operations. Requires the WebGPU
API to stabilize across browsers and a compute shader implementation of Cholesky
and triangular solves.

---

## Sequencing

```
Tier 1 — ✅ COMPLETE
Tier 2 — ✅ COMPLETE

Tier 3 (blocked on upstream):
  3.1 Stabilize private attrs  <-- file issues first
  3.2 prediction_state() RFC   <-- after 3.1 accepted
  3.3 Adapter metadata         <-- independent of 3.1/3.2
  3.4 Bilog/Power moments      <-- independent

Tier 4 (needs RFCs):
  4.1 WASM linalg
  4.2 Predictor-acquisition integration
  4.3 Hierarchical search space
  4.4 WebGPU
```

Tier 3 should be initiated via upstream issues. Tier 4 items are tracked but
not scheduled.
