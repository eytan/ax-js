# axjs — Client-Side GP Prediction Library

TypeScript implementation of BoTorch GP posterior predictions for use in Ax.
Prediction-only (no fitting). Hyperparameters are exported from Python via `axjs_export.py`.

## Ax API Rules

- **NEVER use `AxClient`** — it is deprecated. Use only `ax.api.Client` with public methods.
- Import configs from `ax.api.configs`: `RangeParameterConfig`, `ChoiceParameterConfig`
- Key Client methods: `configure_experiment()`, `configure_optimization()`, `get_next_trials()`, `complete_trial()`
- Access internals only when necessary for export: `client._experiment`, `client._generation_strategy`

## Testing Rules

- **Tolerance ceiling**: Global tolerance of `1e-6`. All computations use Float64 (double precision).
  Any diff > 1e-5 indicates a real numerical bug, not floating-point precision limits.
- **Minimum fixture count**: The parity test suite requires >= 28 parity fixtures. Empty or corrupt
  manifests cause hard failures, not silent skips. See `TESTING.md` for full details.
- **Fixture regeneration**: Run `python python/generate_fixtures.py` after any model/kernel changes.
  All fixtures must pass before merging. Requires BoTorch >= 0.17.

## Key Commands

```bash
npx vitest run              # Run all tests
npx tsc --noEmit            # Type-check
python python/generate_fixtures.py  # Regenerate BoTorch parity fixtures
npx tsup                    # Build bundle
```

## API Usage Rules

- **Always use `Predictor`** (not `loadModel` directly) unless the specific use case absolutely requires low-level model access AND a human has approved it. `Predictor` handles input transforms, output transforms, adapter untransforms, and outcome naming automatically — using `loadModel` bypasses all of this and leads to subtle bugs (e.g., lengthscales in the wrong space, missing normalization).
- When constructing synthetic model states (e.g., in demos), always include `input_transform` with proper `Normalize` bounds so that lengthscales are in normalized `[0,1]` space, matching real Ax/BoTorch exports.
- The only existing exception is `hartmann6_sanity`, which uses `loadModel` for a side-by-side parity check against a hand-rolled GP.

## Architecture

- `src/linalg/` — Matrix (Float64Array row-major), Cholesky, LU, forward/back solve
- `src/kernels/` — Matern (0.5/1.5/2.5), RBF, Scale, Categorical, Additive, Product, Multitask
- `src/models/` — ExactGP, SingleTaskGP, ModelListGP, PairwiseGP, MultiTaskGP, EnsembleGP
- `src/transforms/` — Normalize, Standardize, Log, Bilog, Power, Chained, Warp (Kumaraswamy)
- `src/io/` — Deserialization from BoTorch export format
- `src/predictor.ts` — High-level `Predictor` class (accepts `ExperimentState`, applies adapter untransforms)
- `python/_extraction.py` — Shared extraction logic (kernels, transforms, models). Requires BoTorch >= 0.17
- `python/axjs_export.py` — User-facing export (imports from _extraction.py), returns `ExperimentState`
- `python/generate_fixtures.py` — Benchmark fixture generation (imports from _extraction.py)
- `test/fixtures/` — 30 JSON fixtures (28 parity + 2 consistency). See `TESTING.md`

## Serialization Format

Both `axjs_export.py` and `generate_fixtures.py` produce `ExperimentState`:

```typescript
interface ExperimentState {
  search_space: { parameters: SearchSpaceParam[] };
  model_state: AnyModelState;  // discriminated by model_type
  outcome_names?: string[];
  status_quo?: { point: number[] };
  adapter_transforms?: AdapterTransform[];  // LogY, BilogY, StandardizeY, PowerTransformY
}
```

Test fixtures wrap this: `{ experiment: ExperimentState, test: { metadata, test_points, expected } }`.
See `docs/FORMAT.md` for full schema documentation.

## Transform Pipeline (Critical for Parity)

Understanding the transform pipeline is essential for correct predictions, especially
for multi-task GPs and transfer learning scenarios.

### Two-Layer Transform Architecture

**Layer 1: Adapter-level transforms** (Ax → BoTorch boundary)
- Applied by Ax's adapter BEFORE data reaches BoTorch
- NOT stored in model state — invisible to axjs unless explicitly exported
- Examples: `LogY`, `BilogY`, `PowerTransformY`, `StandardizeY`, `IntToFloat`
- Exported via `adapter_transforms` field in `ExperimentState`
- `Predictor` automatically applies adapter untransforms per-outcome after model prediction

**Layer 2: Model-level transforms** (within BoTorch model)
- Stored in `model.outcome_transform` and `model.input_transform`
- Automatically exported and handled by axjs
- Input: `Normalize` → `Warp` (Kumaraswamy CDF) via `ChainedInputTransform`
- Output: `Standardize`, `Log`, `Bilog`, `Power`, `ChainedOutcomeTransform`

### Transform Application Order

**Forward (training):**
1. Raw X → InputNormalize → InputWarp → kernel sees transformed X
2. Raw Y → (adapter transforms) → (model outcome transform) → GP trains on transformed Y

**Inverse (prediction):**
1. GP predicts in transformed space
2. Model outcome untransform: Standardize⁻¹, Log⁻¹(=exp), etc.
3. Adapter untransform: exp() for LogY, inverse-bilog for BilogY, etc.

### CRITICAL: `train_Y` is NOT in original space

`model_state.train_Y` has been transformed by **both** layers (adapter + model).
To get original-space Y values, you must undo both transforms in reverse order.
`Predictor.untransformTrainY()` (private) handles this correctly.

**RULE: Any Predictor method that returns Y-space values MUST call `untransformTrainY()` —
never read `train_Y` directly.** This is the same two-layer untransform that `predict()`
applies to posterior means. Using raw `train_Y` produces values in standardized/log/etc.
space, which silently gives wrong results (e.g., all observed values near 0).

### MultiTaskGP Transform Gotchas

- Input transforms apply to DATA columns only (task column excluded)
- Normalize coefficients span ALL columns (including task), but task column
  coefficient is typically 1.0 (identity)
- Per-task mean constants (`MultitaskMean`) must match task indices AFTER transform
- Warp indices refer to data column positions, not full X positions
