# ax-js

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/eytan/ax-js)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-412%20passed-brightgreen.svg)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)

Client-side Gaussian process predictions mirroring [Ax](https://ax.dev) and [BoTorch](https://botorch.org) — **prediction, visualization, and acquisition in the browser**.

ax-js replicates BoTorch GP posterior predictions (`model.posterior(X).mean` and `.variance`) entirely in TypeScript. A Python export step serializes a fitted BoTorch model to JSON; the TypeScript side deserializes and predicts with numerical parity at Float64 precision.

**No Python backend required at prediction time.** Once you export your model, everything runs client-side.

## Highlights

- **Numerical parity** with BoTorch — 45 fixtures verify predictions match within 1e-6 tolerance
- **Full model coverage**: SingleTaskGP, ModelListGP, MultiTaskGP, PairwiseGP, EnsembleGP (SAAS)
- **Transform pipeline**: Normalize, Warp (Kumaraswamy), Standardize, Log, Bilog, Power — plus Ax adapter transforms (LogY, BilogY, PowerTransformY, StandardizeY)
- **Client-side acquisition**: UCB, Expected Improvement, Log EI, Thompson Sampling, EUBO
- **Interactive demos**: 10+ self-contained HTML visualizations (slice plots, response surfaces, radar charts, optimization traces, live BO, preference learning)
- **Zero dependencies** — pure TypeScript, Float64Array throughout

## Quick Start

### Install

```bash
npm install ax-js
```

### Export a model from Python

```bash
pip install ax-platform  # requires ax-platform >= 1.2, botorch >= 0.17
```

```python
from ax.api import Client
from axjs_export import export_client
import json

# After running your Ax experiment...
state = export_client(client)

with open("experiment.json", "w") as f:
    json.dump(state, f)
```

### Predict in TypeScript

```typescript
import { Predictor } from "ax-js";

// Load the exported state
const state = await fetch("experiment.json").then((r) => r.json());
const predictor = new Predictor(state);

// Predict at a point (raw parameter values, in search_space order)
const predictions = predictor.predict([[0.5, 0.3, 1.0]]);
// → { "accuracy": { mean: Float64Array([0.87]), variance: Float64Array([0.002]) } }

// Relative predictions vs status quo (% change)
const relative = predictor.predictRelative([[0.5, 0.3, 1.0]]);

// Training data in original space
const { X, Y } = predictor.getTrainingData("accuracy");

// Leave-one-out cross-validation (analytic, no refitting)
const loo = predictor.loocv("accuracy");

// Feature importance (sorted by lengthscale)
const dims = predictor.rankDimensionsByImportance("accuracy");
```

### Use in a browser (no bundler)

```html
<script src="dist/ax.global.js"></script>
<script>
  const predictor = new Ax.Predictor(experimentState);
  const preds = predictor.predict([[0.5, 0.3]]);
</script>
```

Three standalone bundles are available:

| Bundle | Global | Contents |
|--------|--------|----------|
| `ax.global.js` | `window.Ax` | Predictor, loadModel, relativize, types |
| `ax-acquisition.global.js` | `Ax.acquisition` | UCB, EI, LogEI, Thompson, EUBO, optimizeAcqf |
| `ax-viz.global.js` | `Ax.viz` | Colormaps, data-point rendering, fixture utilities |

## API Overview

### Predictor (main entry point)

| Property / Method | Description |
|---|---|
| `new Predictor(state)` | Load an `ExperimentState` JSON |
| `.predict(points)` | Predict mean & variance at points, keyed by outcome name |
| `.predictRelative(points)` | Relative predictions vs status quo (% change) |
| `.getTrainingData(outcome?)` | Training X/Y in original space (both transform layers undone) |
| `.loocv(outcome?)` | Analytic leave-one-out CV (Rasmussen & Williams Eq. 5.12) |
| `.getLengthscales(outcome?)` | Kernel lengthscales (recursive tree walk) |
| `.rankDimensionsByImportance(outcome?)` | Dimensions sorted by importance |
| `.kernelCorrelation(a, b, outcome?)` | Kernel similarity in [0, 1] |
| `.outcomeNames` | Outcome/metric names |
| `.paramNames` | Parameter names from search space |
| `.paramBounds` | Parameter bounds |
| `.statusQuoPoint` | Status quo point (if defined) |
| `.observations` | Observed trial data (if included) |

### Acquisition Functions (`ax-js/acquisition`)

```typescript
import { UpperConfidenceBound, LogExpectedImprovement, optimizeAcqf } from "ax-js/acquisition";
```

| Export | Description |
|---|---|
| `UpperConfidenceBound` | UCB(x) = μ(x) + β·σ(x) |
| `ExpectedImprovement` | Analytic EI |
| `LogExpectedImprovement` | Numerically stable log-space EI |
| `ThompsonSampling` | Random Fourier Features Thompson sampling |
| `EUBO` | Expected Utility of Best Option (preference learning) |
| `optimizeAcqf` | Random search + projected L-BFGS optimizer |

### Visualization (`ax-js/viz`)

```typescript
import { viridis, plasma, drawDataDot, pointRelevance } from "ax-js/viz";
```

Colormaps, canvas rendering helpers, search-space utilities, and fixture normalization used by the demo suite and available for custom visualizations.

## Demos

The demo suite includes 10+ self-contained HTML files that work as `file://` URLs (no server required):

| Demo | Description |
|------|-------------|
| **Slice Plot** | 1D posterior slices across each parameter |
| **Response Surface** | 2D heatmap with contours and training points |
| **Radar** | Multi-objective radar chart with constraints |
| **BO Cockpit** | Multi-batch BO visualization with candidate editing |
| **Cross-Validation** | LOO-CV observed vs predicted scatter |
| **Feature Importance** | Lengthscale-based dimension importance bars |
| **Optimization Trace** | Trial value progression with best-so-far |
| **Bayesian Optimization** | Live BO with Thompson sampling on 2D test functions |
| **Preference Explorer** | Interactive pairwise preference learning (BOPE) |
| **Point Proximity** | Kernel-distance opacity diagnostic |

Build demos: `npm run build` (requires the library to be built first).

Browse the demos: [demo/](demo/) — clone the repo and open the HTML files directly, or browse on GitHub.

## Supported Models

| Model | BoTorch Class | Features |
|-------|--------------|----------|
| SingleTaskGP | `SingleTaskGP` | Matérn (0.5/1.5/2.5), RBF, ARD, fixed/heteroscedastic noise |
| ModelListGP | `ModelListGP` | Multi-output (independent GPs per outcome) |
| MultiTaskGP | `MultiTaskGP` | ICM kernel, per-task means, PositiveIndexKernel |
| PairwiseGP | `PairwiseGP` | Laplace approximation, LU factorization |
| EnsembleGP | SAAS/MAP | Fully Bayesian (NUTS) or multi-restart MAP |

### Kernel Types

Matérn (ν=0.5, 1.5, 2.5), RBF, ScaleKernel, CategoricalKernel, AdditiveKernel, ProductKernel — with recursive nesting and `active_dims`.

### Transform Support

**Input**: Normalize, Warp (Kumaraswamy CDF), ChainedInputTransform
**Output (model-level)**: Standardize, Log, Bilog, Power, Chained
**Output (adapter-level)**: LogY, BilogY, PowerTransformY, StandardizeY

See [docs/data-model.md](docs/data-model.md) for the full serialization schema.

## Development

### Build

```bash
npm install
npm run build:lib    # Build library only (ESM + CJS + IIFE + types)
npm run build        # Build library + demos
```

### Test

```bash
npm test             # Run all tests (vitest)
npm run typecheck    # Type-check (tsc --noEmit)
```

### Regenerate fixtures

When Ax or BoTorch APIs change, regenerate the parity fixtures:

```bash
pip install -r python/requirements.txt
python python/generate_fixtures.py
npm test
```

See [docs/testing.md](docs/testing.md) for the full testing guide and fixture system documentation.

## Project Structure

```
src/
├── predictor.ts           # High-level Predictor API
├── index.ts               # Public API exports
├── io/deserialize.ts      # JSON → model objects
├── models/                # GP model implementations
│   ├── types.ts           #   TypeScript interfaces for all state types
│   ├── gp.ts              #   ExactGP base class
│   ├── single_task.ts     #   SingleTaskGP
│   ├── model_list.ts      #   ModelListGP
│   ├── multi_task.ts      #   MultiTaskGP
│   ├── pairwise_gp.ts     #   PairwiseGP
│   └── ensemble_gp.ts     #   EnsembleGP
├── kernels/               # Kernel implementations
├── transforms/            # Input/output transforms
├── linalg/                # Matrix, Cholesky, LU, solvers
├── acquisition/           # Acquisition functions + optimizer
└── viz/                   # Visualization utilities

python/
├── axjs_export.py         # User-facing export API
├── _extraction.py         # Shared kernel/transform/model extraction
├── generate_fixtures.py   # Parity fixture generator
└── generators/            # Per-model fixture generators

test/
├── fixtures/              # 45 JSON parity fixtures
└── integration/           # Parity and property-based tests

demo/                      # Self-contained HTML demos
```

## Documentation

- [Data Model](docs/data-model.md) — ExperimentState schema and serialization format
- [Testing Guide](docs/testing.md) — Fixture system, parity tests, and adding new fixtures
- [Developer Guide](docs/developer-guide.md) — Architecture and contributing
- [Ax vs ax-js](docs/ax-js_vs_ax.md) — Data model comparison
- [Serialization Contract](docs/SERIALIZATION_CONTRACT.md) — Proposal for BoTorch/Ax integration

## How It Works

1. **Fit a GP in Python** using Ax/BoTorch as usual
2. **Export** the fitted model state to JSON via `axjs_export.py`
3. **Load** the JSON in TypeScript with `new Predictor(state)`
4. **Predict** at arbitrary points — the TypeScript implementation mirrors BoTorch's `model.posterior(X)` exactly

The export captures everything needed for prediction: kernel hyperparameters, training data, input/output transforms, and metadata. The TypeScript side rebuilds the kernel matrix, computes the Cholesky factorization, and solves for posterior mean and variance — all in Float64 for numerical parity.

## License

[MIT](LICENSE) — Copyright (c) 2025-present Meta Platforms, Inc. and affiliates.

Built on [Ax](https://ax.dev) and [BoTorch](https://botorch.org).
