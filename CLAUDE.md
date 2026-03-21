# ax-js — Client-Side GP Prediction Library

TypeScript implementation of BoTorch GP posterior predictions for use in Ax.
Prediction-only (no fitting). Hyperparameters are exported from Python via `axjs_export.py`.

## Ax API Rules

- **NEVER use `AxClient`** — it is deprecated. Use only `ax.api.Client` with public methods.
- Import configs from `ax.api.configs`: `RangeParameterConfig`, `ChoiceParameterConfig`
- Key Client methods: `configure_experiment()`, `configure_optimization()`, `get_next_trials()`, `complete_trial()`
- Access internals only when necessary for export: `client._experiment`, `client._generation_strategy`

## Testing Rules

- **Tolerance ceiling**: Global tolerance of `1e-8`. All computations use Float64 (double precision).
  Any diff > 1e-7 indicates a real numerical bug, not floating-point precision limits.
- **Minimum fixture count**: The parity test suite requires >= 28 parity fixtures. Empty or corrupt
  manifests cause hard failures, not silent skips. See `docs/testing.md` for full details.
- **Fixture regeneration**: Run `python python/generate_fixtures.py` after any model/kernel changes.
  All fixtures must pass before merging. Requires BoTorch >= 0.17.

## Key Commands

```bash
npx vitest run              # Run all tests
npx tsc --noEmit            # Type-check
python python/generate_fixtures.py  # Regenerate BoTorch parity fixtures
bash scripts/verify-docs.sh # Check docs haven't drifted from codebase
npx tsup                    # Build bundle
npm run build               # Build library + demos
```

## API Usage Rules

- **Always use `Predictor`** (not `loadModel` directly) unless the specific use case absolutely requires low-level model access. `Predictor` handles input transforms, output transforms, adapter untransforms, and outcome naming automatically — using `loadModel` bypasses all of this and leads to subtle bugs (e.g., lengthscales in the wrong space, missing normalization).
- When constructing synthetic model states (e.g., in demos), always include `input_transform` with proper `Normalize` bounds so that lengthscales are in normalized `[0,1]` space, matching real Ax/BoTorch exports.

## Plans & Guides

`plans/` contains modular documentation for maintaining parity with BoTorch:
- `parity-guide.md` — How to keep ax-js in sync (naming, transforms, checklists)
- `agent-playbook.md` — PR workflow, guardrails, and negative rules for agents
- `style-guide.md` — TS conventions (Meta TS + math exemptions)
- `file-correspondence.md` — Complete Python-to-TS class mapping
- `upstream-proposals.md` — Proposals for Ax/BoTorch teams
- `codebase-observations.md` — Analysis of both codebases
- `action-plan.md` — Prioritized improvement tasks
- `automation-integration.md` — CI/hooks integration proposal for adopting teams

## Architecture

- `src/linalg/` — Matrix (Float64Array row-major), Cholesky, LU, forward/back solve
- `src/kernels/` — Matern (0.5/1.5/2.5), RBF, Scale, Categorical, Additive, Product, Multitask
- `src/models/` — ExactGP, SingleTaskGP, ModelListGP, PairwiseGP, MultiTaskGP, EnsembleGP
- `src/transforms/` — Normalize, Standardize, Log, Bilog, Power, Chained, Warp (Kumaraswamy)
- `src/io/` — Deserialization from BoTorch export format
- `src/predictor.ts` — High-level `Predictor` class (accepts `ExperimentState`, applies adapter untransforms)
- `src/acquisition/` — UCB, EI, LogEI, Thompson, EUBO, optimizeAcqf
- `src/viz/` — Colormaps, data-point rendering, search-space helpers, embeddable plot functions
  - `types.ts` — Shared interfaces (RGB, ParamSpec, RenderPredictor, DotInfo, option types)
  - `styles.ts` — CSS injection for slider/tooltip styling (fixes nbconvert pseudo-element issues)
  - `colormaps.ts` — viridis, plasma, drawColorbar, renderHeatmap
  - `params.ts` — isChoice, isInteger, normalizeFixture, computeDimOrder, pointRelevance
  - `widgets.ts` — createOutcomeSelector, createParamSliders, tooltip helpers
  - `dots.ts` — Training dot interactivity (highlight, pin, kernel-distance)
  - `plots/` — Embeddable render functions (importance, cv, trace, slice, surface)
- `python/_extraction.py` — Shared extraction logic (kernels, transforms, models). Requires BoTorch >= 0.17
- `python/axjs_export.py` — User-facing export (imports from _extraction.py), returns `ExperimentState`
- `python/generate_fixtures.py` — Benchmark fixture generation (imports from _extraction.py)
- `test/fixtures/` — 46 JSON fixtures. See `docs/testing.md`

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
See `docs/data-model.md` for full schema documentation.

## Transform Pipeline (Critical for Parity)

### Two-Layer Transform Architecture

**Layer 1: Adapter-level transforms** (Ax → BoTorch boundary)
- Applied by Ax's adapter BEFORE data reaches BoTorch
- NOT stored in model state — invisible to ax-js unless explicitly exported
- Examples: `LogY`, `BilogY`, `PowerTransformY`, `StandardizeY`
- Exported via `adapter_transforms` field in `ExperimentState`
- `Predictor` automatically applies adapter untransforms per-outcome after model prediction

**Layer 2: Model-level transforms** (within BoTorch model)
- Stored in `model.outcome_transform` and `model.input_transform`
- Automatically exported and handled by ax-js
- Input: `Normalize` → `Warp` (Kumaraswamy CDF) via `ChainedInputTransform`
- Output: `Standardize`, `Log`, `Bilog`, `Power`, `ChainedOutcomeTransform`

### CRITICAL: `train_Y` is NOT in original space

`model_state.train_Y` has been transformed by **both** layers (adapter + model).
To get original-space Y values, you must undo both transforms in reverse order.
`Predictor.untransformTrainY()` (private) handles this correctly.

**RULE: Any Predictor method that returns Y-space values MUST call `untransformTrainY()` —
never read `train_Y` directly.**

## Git Rules

- **NEVER push to remote** without explicit user confirmation.

## Build & Package

- npm package: `ax-js`
- Three subpath exports: `ax-js`, `ax-js/acquisition`, `ax-js/viz`
- IIFE bundles: `ax.js` (`window.Ax`), `ax-acquisition.js` (`Ax.acquisition`), `ax-viz.js` (`Ax.viz`)
- ESM + CJS for all three entry points
- TypeDoc API reference: `npm run docs`
