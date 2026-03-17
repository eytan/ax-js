# `ax-js-platform`</sup></sub>

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/eytan/ax-js-platform)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)

Client-side Gaussian process predictions mirroring [Ax](https://ax.dev) and [BoTorch](https://botorch.org) — **prediction and visualization in the browser**.

ax-js replicates BoTorch GP posterior predictions entirely in TypeScript. A Python export step serializes a fitted model to JSON; the TypeScript side deserializes and predicts with numerical parity at Float64 precision. **No Python backend required at prediction time.**

## Quick Start

### Install

```bash
npm install ax-js-platform
```

### Export a model from Python

```bash
pip install ax-platform  # requires ax-platform >= 1.2, botorch >= 0.17
```

```python
import sys
sys.path.insert(0, "path/to/ax-js/python")  # or copy python/ to your project

from ax.api import Client
from axjs_export import export_client
import json

# After running your Ax experiment...
state = export_client(client)

with open("experiment.json", "w") as f:
    json.dump(state, f)
```

> **Note:** `axjs_export.py` and `_extraction.py` live in the `python/` directory of this repo.
> Copy them to your project or add `python/` to your `PYTHONPATH`.

### Predict in TypeScript

```typescript
import { Predictor } from "ax-js-platform";

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

## Demos

Interactive demos are in the [demo/](demo/) directory. Clone the repo, run `npm run build`, and open the HTML files directly — no server required.

**Posterior Visualization** — 1D slice plots and 2D response surface heatmaps with interactive dimension sliders and training point overlays.

**Model Diagnostics** — Leave-one-out cross-validation, feature importance (lengthscale-based), and optimization trace with best-so-far tracking.

**Multi-Objective** — Radar chart for constrained MOO and a Ax Cockpit for exploring many-objective tradeoffs with candidate editing.

**Bayesian Optimization Loop** — Live BO with Thompson sampling on test functions, and preferential BO (BOPE) with pairwise comparison learning.

## Supported Models

| Model | BoTorch Class | Description |
|-------|--------------|-------------|
| SingleTaskGP | `SingleTaskGP` | Standard GP with Matérn/RBF kernels, ARD, fixed/heteroscedastic noise |
| ModelListGP | `ModelListGP` | Multi-output — independent GP per outcome |
| MultiTaskGP | `MultiTaskGP` | ICM kernel with per-task means |
| PairwiseGP | `PairwiseGP` | Preference learning via Laplace approximation |
| EnsembleGP | SAAS/MAP | Fully Bayesian (NUTS) or multi-restart MAP |

**Kernels**: Matérn (ν=0.5, 1.5, 2.5), RBF, Scale, Categorical, Additive, Product — with recursive nesting and `active_dims`.

**Transforms**: Normalize, Warp (Kumaraswamy), Standardize, Log, Bilog, Power, plus Ax adapter transforms (LogY, BilogY, PowerTransformY, StandardizeY).

46 fixtures verify numerical parity with BoTorch within 1e-6 tolerance.

## Modules

| Module | Script tag | Description |
|--------|-----------|-------------|
| `ax-js-platform` | `ax.js` | Predictor API, model loading, relativization |
| `ax-js-platform/viz` | `ax-viz.js` | Colormaps, response surface rendering, tooltips, search-space helpers |
| `ax-js-platform/acquisition` | `ax-acquisition.js` | Acquisition functions — **experimental**, see [docs/experimental.md](docs/experimental.md) |

When using script tags, load `ax.js` first — the other scripts extend the `Ax` namespace.

The viz module (`ax-js-platform/viz`) provides reusable building blocks for embedding GP visualizations: colormaps (viridis, plasma), data-point rendering, colorbar drawing, fixture normalization, and search-space parameter utilities. See [docs/developer-guide.md](docs/developer-guide.md) for API details.

## Development

```bash
npm install
npm run build:lib    # Build library (ESM + CJS + script bundles + types)
npm run build        # Build library + demos
npm run build:notebook  # Build Jupyter demo notebook + HTML export
npm test             # Run all tests — generates test-report.txt
npm run typecheck    # Type-check
```

### Jupyter notebooks

**End-to-end demo** (`demo/ax-js-e2e.ipynb`): Full workflow — set up Ax experiment, run BO, export model, render interactive visualizations. Execute all cells in Jupyter.

**Pre-built demo** (`demo/jupyter-demo.ipynb`): All diagnostic visualizations with pre-populated outputs — no execution required. Also exported as standalone HTML (`demo/jupyter-demo.html`).

```python
# In your own notebook — each function takes the Ax Client directly:
from axjs_jupyter import slice_plot, response_surface, cross_validation

slice_plot(client)
response_surface(client, outcome="accuracy")
cross_validation(client)
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
- [Experimental](docs/experimental.md) — Acquisition functions (beta)
- [Observations](OBSERVATIONS.md) — BoTorch behavioral notes and future work

## License

[MIT](LICENSE) — Copyright (c) 2025-present Meta Platforms, Inc. and affiliates.

Built on [Ax](https://ax.dev) and [BoTorch](https://botorch.org).
