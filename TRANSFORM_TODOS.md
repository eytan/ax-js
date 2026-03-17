# Transform Layer: Pain Points and Proposed Improvements

## 1. Problem Statement

The axjs transform layer is a frequent source of confusion during development,
demo construction, and debugging. Six recurring issues have caused repeated
mistakes and head-scratching:

### 1.1 Is `input_transform` required or optional?

`GPModelState.input_transform` is typed as optional (`types.ts:32`):

```typescript
input_transform?: { offset: number[]; coefficient: number[] };
```

Yet CLAUDE.md states:

> When constructing synthetic model states (e.g., in demos), always include
> `input_transform` with proper `Normalize` bounds so that lengthscales are in
> normalized `[0,1]` space, matching real Ax/BoTorch exports.

So it is *semantically required* for correct behavior but *structurally optional*.
When omitted, `SingleTaskGP` silently treats inputs as already normalized
(`single_task.ts:29-34`), and the model "works" — but lengthscale
interpretation, `kernelCorrelation`, and `getTrainingData` all break in subtle
ways. Demos have been bitten by this: every demo that constructs a synthetic
model must manually compute `offset` and `coefficient` arrays (see
`build_demos.js:3399-3401`, `build_demos.js:1519-1520`). There is no
validation that catches the omission.

### 1.2 What space are lengthscales in?

Lengthscales are **always** in the input_transform's *output* space (i.e.,
normalized [0,1] space when Normalize is present). But this is nowhere
explicit in the type system or docs. The `KernelState` type (`types.ts:6`)
simply says `lengthscale?: number[]` with no annotation of what space those
values live in.

This causes confusion in two directions:
- When building synthetic models, developers set lengthscales in raw parameter
  space (e.g., `[0.5, 0.5]` meaning "half of each raw range") when they should
  be in normalized space (e.g., `[0.15, 0.15]` meaning "15% of [0,1]").
- `Predictor.kernelCorrelation()` (`predictor.ts:321-332`) manually divides by
  `input_transform.coefficient` to undo normalization before applying
  lengthscales — reimplementing the transform pipeline ad hoc rather than
  using the model's own kernel.

### 1.3 The two-layer transform architecture (adapter vs model)

There are two completely separate transform pipelines:

1. **Adapter transforms** (`adapter_transforms` in `ExperimentState`) — applied
   by Ax BEFORE BoTorch, stored as metadata, undone by `Predictor` after
   prediction (`predictor.ts:406-423`).
2. **Model-level transforms** (`outcome_transform` in `GPModelState`) — applied
   within BoTorch, stored in model state, undone by `ExactGP.predict()`
   (`gp.ts:133-139`).

These two layers have:
- **Different storage locations** (top-level vs nested in model_state)
- **Different untransform application points** (Predictor vs ExactGP)
- **Different type systems** (`AdapterTransform` vs `OutcomeTransformState`)
- **Overlapping names** (adapter `LogY` vs model-level `Log`, adapter
  `StandardizeY` vs model-level `Standardize`)

The overlapping names are particularly treacherous. `StandardizeY` (adapter)
and `Standardize` (model) are different transforms with different parameters
applied at different points. Both can be active simultaneously.

There is no single place in the codebase that shows the full forward/inverse
pipeline end-to-end. The closest is the "Transform Application Order" section
in CLAUDE.md, but this is documentation only — the code itself splits the
logic across `gp.ts`, `predictor.ts`, and `outcome.ts`.

### 1.4 Is `train_Y` in raw space or transformed space?

`model_state.train_Y` is in the **doubly-transformed** space: adapter
transforms first, then model-level transforms. This is documented in
`FORMAT.md:54-57` and `predictor.ts:382-387`, but the type system provides
no protection:

```typescript
train_Y: number[];  // types.ts:28 — could be anything
```

The `Predictor.untransformTrainY()` method (`predictor.ts:390-403`) correctly
reverses both layers, but:
- The standalone `unstandardizeY()` helper (`predictor.ts:544-553`) only
  handles model-level Standardize, not other outcome transforms (Log, Bilog,
  Power, Chained).
- When constructing synthetic models in demos, developers pass raw Y values
  directly as `train_Y` (`build_demos.js:3415`), which is correct only because
  those models have no outcome_transform. But when a demo adds
  `outcome_transform: { type: 'Standardize', mean: ..., std: ... }`, train_Y
  must be pre-standardized — and there is no validation or builder to enforce
  this.

### 1.5 Mandatory vs optional fields in synthetic model states

Demo authors constructing `GPModelState` by hand face a minefield of implicit
requirements:

| Field | Typed as | Actually required for correctness? |
|---|---|---|
| `input_transform` | optional | Yes, if inputs are not already in [0,1] |
| `outcome_transform` | optional | Depends on what `train_Y` contains |
| `mean_constant` | required | Must match the space of transformed Y |
| `noise_variance` | required | Must match the scale of transformed Y |
| `kernel.lengthscale` | optional (per type) | Must be in post-input_transform space |

There is no factory, builder, or validation function that checks consistency
between these fields. The `SingleTaskGP` constructor (`single_task.ts:15-58`)
simply accepts the state and wires everything up. Invalid combinations
(e.g., lengthscales in raw space + input_transform present) produce plausible
but wrong predictions.

### 1.6 Standardize outcome transform: what do `mean` and `std` refer to?

The `OutcomeTransformState` for Standardize (`types.ts:19`) stores `mean`
and `std`:

```typescript
{ type?: "Standardize"; mean: number; std: number }
```

These are the mean and standard deviation of `train_Y` **in the space that
BoTorch saw the data** — which may already be post-adapter-transform. If
adapter transforms include `LogY`, then `mean` is the mean of `log(Y)`, not
of raw `Y`. This is noted in CLAUDE.md but not in the type definition or
`FORMAT.md` examples.

The `StandardizeUntransform` class (`outcome.ts:32-47`) uses these to
un-standardize: `y_original = mean + std * y_standardized`. But the names
`mean` and `std` suggest raw data statistics, which they are not when adapter
transforms are present.

## 2. Root Causes

### 2.1 Optional fields that should be required (or at least validated)

`input_transform` is optional in the TypeScript type because some models
genuinely operate in pre-normalized space (e.g., when inputs are already
[0,1]). But the **common case** — real Ax exports — always has it. Making it
optional without any validation means the most common mistake (omitting it)
is also the quietest.

### 2.2 No distinction between "spaces" in the type system

The same `number[]` type is used for:
- Raw parameter values (user space)
- UnitX-normalized values ([0,1])
- Post-input_transform values (what the kernel sees)
- Raw Y values (original metric space)
- Adapter-transformed Y (post-LogY/StandardizeY)
- Model-standardized Y (what `train_Y` actually contains)
- Lengthscales (in post-input_transform space)

Every handoff between spaces is an implicit convention enforced only by
developer discipline.

### 2.3 Dual ownership of Y untransforms

Model-level untransforms are applied inside `ExactGP.predict()` (`gp.ts:133`).
Adapter-level untransforms are applied inside `Predictor.applyAdapterUntransform()`
(`predictor.ts:406`). But covariance untransforms are partially handled
in `ExactGP.predictCovarianceWith()` (`gp.ts:237-249`) using duck typing
(`typeof tf.std === "number"`) to detect Standardize — a fragile pattern
that skips nonlinear transforms entirely.

### 2.4 Python-side complexity leaks into JS

The UnitX composition logic (`axjs_export.py:51-105`,
`generators/_ax_helpers.py:70-118`) exists because Ax's adapter applies UnitX
*implicitly* before the model sees data. The JS side doesn't know about UnitX
at all — it just sees the composed `input_transform`. But understanding *why*
the offset/coefficient values are what they are requires understanding the
Python-side composition, which is not documented from the JS consumer's
perspective.

### 2.5 Inconsistent `train_Y` semantics between real exports and synthetic states

Real Ax exports produce `train_Y` in doubly-transformed space (adapter +
model transforms). Synthetic demo states pass raw Y as `train_Y` with no
transforms. Both are valid, but the code provides no guidance on which
convention is in use for a given model state. The `getTrainingData()` method
always applies both untransform layers, which is correct for real exports but
would double-untransform synthetic states that incorrectly include an
`outcome_transform` with raw `train_Y`.

## 3. Proposed Improvements

### 3.1 Make `input_transform` structurally required with an identity default

**Change**: Make `input_transform` non-optional in `GPModelState`,
`PairwiseGPModelState`, and `MultiTaskGPModelState`. Provide a static
factory method to create identity transforms.

```typescript
// In types.ts
export interface InputTransformState {
  offset: number[];
  coefficient: number[];
}

export interface GPModelState {
  // ...
  input_transform: InputTransformState;  // no longer optional
}
```

Add a helper:

```typescript
function identityInputTransform(d: number): InputTransformState {
  return {
    offset: new Array(d).fill(0),
    coefficient: new Array(d).fill(1),
  };
}

function boundsInputTransform(bounds: [number, number][]): InputTransformState {
  return {
    offset: bounds.map(b => b[0]),
    coefficient: bounds.map(b => b[1] - b[0]),
  };
}
```

**Impact**: High. Eliminates the most common demo bug. Forces explicit
acknowledgment that inputs are already normalized (identity transform) vs
needing normalization (bounds transform).

**Migration**: Add `input_transform: identityInputTransform(d)` to any
existing model states that omit it. The Python export already always provides
it after UnitX composition.

### 3.2 Add a model state builder/validator

**Change**: Create a `buildModelState()` factory that:
1. Requires `search_space` bounds and raw training data
2. Computes `input_transform` from bounds automatically
3. Optionally standardizes `train_Y` and sets `outcome_transform`
4. Validates consistency between `mean_constant`, `noise_variance`, and the
   transform pipeline

```typescript
function buildSingleTaskGPState(opts: {
  bounds: [number, number][];
  trainX: number[][];  // raw space
  trainY: number[];    // raw space
  kernel: KernelState;
  noiseVariance: number;
  standardize?: boolean;  // default true — auto-compute mean/std
}): GPModelState
```

**Impact**: High for demo authors. Eliminates the need to manually compute
offset/coefficient, pre-standardize Y, or set mean_constant in the right
space.

**Trade-off**: This is a convenience layer — power users constructing states
from real exports would bypass it. The factory should not be the only way to
create model states.

### 3.3 Branded types for different "spaces"

**Change**: Use TypeScript branded types to distinguish values in different
spaces at the type level:

```typescript
type RawY = number & { readonly __brand: 'RawY' };
type TransformedY = number & { readonly __brand: 'TransformedY' };
type NormalizedX = number[] & { readonly __brand: 'NormalizedX' };
type RawX = number[] & { readonly __brand: 'RawX' };
```

**Impact**: Medium. Catches space-mixing bugs at compile time. However,
branded types add friction to every numeric operation and may be overkill
for a library of this size. The practical benefit depends on how often
new code is written that handles transforms.

**Recommendation**: Consider a lighter version — just branded array types
for `train_Y` and `train_X` in `GPModelState`, not for individual scalars.
Even just renaming the fields would help (see 3.5).

### 3.4 Unify the covariance untransform path

**Change**: The duck-typing check in `gp.ts:237-249` should be replaced
with a proper interface method:

```typescript
export interface OutcomeUntransform {
  untransform(mu: number, variance: number): { mean: number; variance: number };
  untransformCovariance(cov: number): number;  // NEW
}
```

For `StandardizeUntransform`, `untransformCovariance(cov)` returns
`std * std * cov`. For nonlinear transforms, it could return `cov` (raw GP
covariance) or apply delta method scaling. This eliminates the `as any` cast
and the `typeof tf.std === "number"` check.

**Impact**: Medium. Fixes a code smell and makes the covariance path correct
for all transform types. Currently, nonlinear outcome transforms silently
return un-scaled covariance, which could cause subtle bugs in relativization.

### 3.5 Rename fields to make spaces explicit

**Change**: Rename ambiguous fields in the serialization format:

| Current | Proposed | Rationale |
|---|---|---|
| `train_Y` | `train_Y_transformed` | Makes clear this is NOT raw data |
| `outcome_transform.mean` | `outcome_transform.Y_offset` | Avoids confusion with raw data mean |
| `outcome_transform.std` | `outcome_transform.Y_scale` | Avoids confusion with raw data std |

**Impact**: Medium-high for clarity, but requires a **breaking format change**.
Could be done with a format version bump and a migration period where both
names are accepted.

**Alternative**: Keep the wire format unchanged but rename the TypeScript
interface fields and add a deserialization step that maps old names to new.

### 3.6 Document the full transform pipeline in code, not just CLAUDE.md

**Change**: Add a `src/transforms/README.md` or a comprehensive JSDoc block
in `src/transforms/index.ts` that shows the complete forward and inverse
pipelines with code references:

```
Forward (training):
  raw X → InputNormalize.forward() [normalize.ts:16] → InputWarp.forward() → kernel
  raw Y → adapter transforms [predictor.ts:434-512] → outcome_transform [outcome.ts] → GP trains

Inverse (prediction):
  GP posterior → outcome untransform [gp.ts:133-139] → adapter untransform [predictor.ts:406-423] → user
```

**Impact**: Low-medium. Helps onboarding but doesn't prevent bugs.

### 3.7 Add runtime validation for model state consistency

**Change**: Add a `validateModelState(state, searchSpace?)` function that
checks:

1. `input_transform` dimensions match `train_X` column count
2. If `outcome_transform` is Standardize, verify `train_Y` has approximately
   zero mean and unit variance (within tolerance)
3. `mean_constant` is in a reasonable range for the transformed Y space
4. `kernel.lengthscale` length matches input dimensions (after transform)
5. `noise_variance` is positive

Call this from `loadModel()` or `Predictor` constructor with warnings (not
errors) to avoid breaking existing valid states.

**Impact**: Medium. Catches the most common construction errors early with
clear messages instead of silent wrong predictions.

### 3.8 Simplify the two-layer architecture (long-term)

**Change**: Consider collapsing adapter transforms into model-level
transforms during export, so axjs only has one transform layer.

Currently:
- Export: adapter transforms stored separately → axjs applies them in Predictor
- The split exists because adapter transforms are metadata about Ax's pipeline,
  not part of the BoTorch model

Proposed: during `axjs_export.py`, compose adapter transforms INTO the
model's `outcome_transform` as a `Chained` transform. Then `Predictor`
doesn't need `adapterUntransforms` at all — `ExactGP.predict()` handles
everything.

**Impact**: High simplification, but **risky**:
- `getTrainingData()` would need to know about the full chain to un-transform `train_Y`
- Adapter transforms that are per-metric (e.g., `LogY` on metric A but not B)
  would require per-sub-model composition, which is already how ModelListGP
  works but adds complexity for SingleTaskGP
- Would make the JS code simpler at the cost of more complex Python export

**Recommendation**: Investigate feasibility but do not prioritize over 3.1-3.4.

## 4. Priority Order

Ranked by impact-to-effort ratio:

1. **3.1 — Make `input_transform` required** (high impact, low effort)
   Eliminates the single most common source of confusion. Requires updating
   `types.ts`, adding identity/bounds helpers, and updating demos.
   **PARTIAL**: Added `identityInputTransform(d)` and `boundsInputTransform(bounds)`
   helpers to `src/transforms/normalize.ts`. Exported from `axjs`. The field is
   still typed as optional but the helpers eliminate manual math. Making it required
   would be a breaking type change deferred until 3.2 (builder) is done.

2. **3.7 — Runtime validation** (high impact, medium effort)
   Catches construction errors early. Can be added incrementally without
   breaking changes.
   **DONE**: `validateModelState()` in `src/predictor.ts` runs in the Predictor
   constructor. Warns on: input_transform dimension mismatch, train_Y not
   pre-standardized when Standardize is present, non-positive noise_variance.

3. **3.2 — Model state builder** (high impact, medium effort)
   Eliminates manual transform math in demos. Complements 3.1.

4. **3.4 — Unify covariance untransform** (medium impact, low effort)
   Fixes a real code smell and potential bug. Small, contained change.
   **DONE**: Added `untransformCovariance(cov): number` to `OutcomeUntransform`
   interface. Implemented in all 5 classes (Standardize returns `std²*cov`,
   nonlinear transforms return raw `cov`). Replaced duck-typing in `gp.ts`
   with proper interface dispatch.

5. **3.6 — Document pipeline in code** (medium impact, low effort)
   Quick win for developer experience.

6. **3.5 — Rename fields** (medium impact, high effort due to migration)
   Valuable but requires format versioning and migration tooling.

7. **3.3 — Branded types** (medium impact, medium effort)
   Nice-to-have but adds friction. Consider after 3.1 and 3.2 reduce the
   surface area where space confusion can occur.

8. **3.8 — Collapse two-layer architecture** (high impact, high effort/risk)
   The ideal end state, but requires careful design. Pursue only after
   3.1-3.4 are done and the remaining pain points are clearer.

## 5. Additional Issues Discovered

### 5.1 Demo Predictor construction drops ExperimentState fields

All fixture-based demos in `build_demos.js` were constructing `Predictor` by
cherry-picking only `search_space` and `model_state` from the normalized
fixture, silently dropping `adapter_transforms`, `status_quo`, `observations`,
and `optimization_config`. For fixtures with adapter transforms, predictions
are returned in the wrong space (e.g., log-space instead of original space).

**Fixed**: All fixture-based `new Predictor({...})` calls changed to
`new Predictor(fixture)`, which passes the full ExperimentState. Extra
properties (like `metadata`, `test_points` from normalizeFixture) are
harmlessly ignored by the Predictor constructor.
