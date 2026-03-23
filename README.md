# `ax-js`</sup></sub>

[![Version](https://img.shields.io/badge/version-0.0.2-blue.svg)](https://github.com/eytan/ax-js)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)

Client-side Gaussian process predictions mirroring [Ax](https://ax.dev) and [BoTorch](https://botorch.org) — **prediction and visualization in the browser**.

ax-js replicates BoTorch GP posterior predictions entirely in TypeScript. A Python export step serializes a fitted model to JSON; the TypeScript side deserializes and predicts with numerical parity at Float64 precision. **No Python backend required at prediction time.**

## Quick Start

### Predict in TypeScript

```typescript
import { Predictor } from "ax-js";

const state = await fetch("experiment.json").then((r) => r.json());
const predictor = new Predictor(state);

// Predict at a point (positional array matching search_space parameter order)
const preds = predictor.predict([[0.5, 0.3, 1.0]]);
// → { "accuracy": { mean: Float64Array([0.87]), variance: Float64Array([0.002]) } }

// Training data in original space (both transform layers undone)
const { X, Y } = predictor.getTrainingData("accuracy");
```

### Use in a browser (no bundler)

```html
<script src="dist/ax.js"></script>
<script>
  const predictor = new Ax.Predictor(experimentState);
  const preds = predictor.predict([[0.5, 0.3]]);
</script>
```

## Embeddable Visualization Components

The viz module provides self-contained, embeddable plot functions with transparent backgrounds — designed to work in Jupyter notebooks, documentation sites, or any HTML page.

| Function | Description |
|----------|-------------|
| `renderSlicePlot` | 1D posterior mean +/- 2 sigma along each parameter, with training dots |
| `renderResponseSurface` | 2D heatmap of posterior mean and std with axis selectors and sliders |
| `renderCrossValidation` | Leave-one-out predicted vs. observed with CI whiskers and R^2 |
| `renderFeatureImportance` | Dimension importance bars derived from kernel lengthscales |
| `renderOptimizationTrace` | Trial progression with running best-so-far overlay |

```html
<script src="dist/ax.js"></script>
<script src="dist/ax-viz.js"></script>
<script>
  const predictor = new Ax.Predictor(experimentState);
  Ax.viz.renderSlicePlot(container, predictor, { interactive: true });
</script>
```


## Installation

### JavaScript

```bash
npm install ax-js
```

### Python (for model export)

```bash
pip install ax-platform  # requires ax-platform >= 1.2, botorch >= 0.17
```

The export scripts (`axjs_export.py` and `_extraction.py`) live in the `python/` directory of this repo. Either copy them to your project or add `python/` to your `PYTHONPATH`:

```bash
export PYTHONPATH="path/to/ax-js/python:$PYTHONPATH"
```

### From source

```bash
git clone https://github.com/eytan/ax-js.git
cd ax-js
npm install
npm run build
```

### Export a model from Python

```python
from ax.api import Client
from axjs_export import export_client
import json

# After running your Ax experiment...
state = export_client(client)

with open("experiment.json", "w") as f:
    json.dump(state, f)
```

## Jupyter

ax-js integrates with Jupyter notebooks via `axjs_jupyter.py`. Each function takes the Ax `Client` directly:

```python
from axjs_jupyter import slice_plot, response_surface, cross_validation

slice_plot(client)
response_surface(client, outcome="accuracy")
cross_validation(client)
```

Requires IPython and `ax-platform` installed in the notebook kernel.

See [demo/ax-js-e2e.ipynb](demo/ax-js-e2e.ipynb) for a full end-to-end workflow (set up experiment, run BO, export, visualize), and [demo/jupyter-demo.ipynb](demo/jupyter-demo.ipynb) for a pre-built demo with all visualizations rendered.

## Demos

Interactive demos are in the [demo/](demo/) directory. Clone the repo, run `npm run build`, and open the HTML files directly — no server required.

**Posterior Visualization** — 1D slice plots and 2D response surface heatmaps with interactive dimension sliders and training point overlays.

**Model Diagnostics** — Leave-one-out cross-validation, feature importance (lengthscale-based), and optimization trace with best-so-far tracking.

**Multi-Objective** — Radar chart for constrained MOO and the [Ax Explorer](docs/explorer.md) for exploring many-objective tradeoffs with candidate editing.

**Bayesian Optimization Loop** — Live BO with Thompson sampling on test functions, and preferential BO (BOPE) with pairwise comparison learning.

## Supported Models

| Model | BoTorch Class | Description |
|-------|--------------|-------------|
| SingleTaskGP | `SingleTaskGP` | Standard GP with Matern/RBF kernels, ARD, fixed/heteroscedastic noise |
| ModelListGP | `ModelListGP` | Multi-output — independent GP per outcome |
| MultiTaskGP | `MultiTaskGP` | ICM kernel with per-task means |
| PairwiseGP | `PairwiseGP` | Preference learning via Laplace approximation |
| EnsembleGP | SAAS/MAP | Fully Bayesian (NUTS) or multi-restart MAP |

**Kernels**: Matern (nu=0.5, 1.5, 2.5), RBF, Scale, Categorical, Additive, Product — with recursive nesting and `active_dims`.

**Transforms**: Normalize, Warp (Kumaraswamy), Standardize, Log, Bilog, Power, plus Ax adapter transforms (LogY, BilogY, PowerTransformY, StandardizeY).

46 fixtures verify numerical parity with BoTorch within 1e-6 tolerance.

## Modules

| Module | Script tag | Description |
|--------|-----------|-------------|
| `ax-js` | `ax.js` | Predictor API, model loading, relativization |
| `ax-js/viz` | `ax-viz.js` | Colormaps, response surface rendering, tooltips, search-space helpers |
| `ax-js/acquisition` | `ax-acquisition.js` | Acquisition functions — **experimental**, see [docs/experimental.md](docs/experimental.md) |

When using script tags, load `ax.js` first — the other scripts extend the `Ax` namespace.

## Development

```bash
npm install
npm run build:lib    # Build library (ESM + CJS + script bundles + types)
npm run build        # Build library + demos
npm run build:notebook  # Build Jupyter demo notebook + HTML export
npm test             # Run all tests — generates test-report.txt
npm run typecheck    # Type-check
```

### Regenerate fixtures

When Ax or BoTorch APIs change:

```bash
pip install -r python/requirements.txt
python python/generate_fixtures.py
npm test
```

## Documentation

- [Data Model](docs/data-model.md) — ExperimentState schema and serialization format
- [Testing Guide](docs/testing.md) — Fixture system and adding new tests
- [Developer Guide](docs/developer-guide.md) — Architecture, transforms, and contributing
- [Explorer](docs/explorer.md) — Multi-objective tradeoff exploration tool
- [Experimental](docs/experimental.md) — Acquisition functions (beta)

Internal docs for contributors working on numerical details and BoTorch integration:
[docs/internal/](docs/internal/) (observations, numerics, serialization contract, data model comparison).

## License

[MIT](LICENSE) — Copyright (c) 2025-present Meta Platforms, Inc. and affiliates.

Built on [Ax](https://ax.dev) and [BoTorch](https://botorch.org).
