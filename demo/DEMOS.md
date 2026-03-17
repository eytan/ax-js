# ax-js Demo Suite

Nine self-contained HTML demos built by `node demo/build_demos.js`.
Each inlines the ax.js and ax-viz.js bundles and default fixture data — no server required.

## Architecture

```
build_demos.js          # Node.js build script
├── Inlined IIFE bundles
│   ├── dist/ax.js        — window.Ax (Predictor, loadModel, etc.)
│   └── dist/ax-viz.js    — Ax.viz (viridis, drawDataDot, normalizeFixture, etc.)
├── Per-demo modules (demo/demos/*.js)
│   └── Each returns a self-contained HTML string
└── writeFileSync × 10+
```

**Data flow**: `test/fixtures/*.json` → `fixtureScript()` embeds as `__DEFAULT_FIXTURE__` → `Ax.viz.normalizeFixture()` at runtime → `Predictor.predict()`.

## Demos

### 1. slice_plot — 1D Posterior Slices

- **Default fixture**: `hartmann_mixed.json`
- **Features**: File upload, outcome selector, dimension sliders, training point overlay (uniform opacity; hover/click for kernel-distance neighbor mode), stable y-axis range via `precomputeYRange()`
- **Rendering**: Observable Plot (SVG)

### 2. response_surface — 2D Heatmaps

- **Default fixture**: `penicillin_modellist.json`
- **Features**: File upload, axis selectors, outcome selector, contour toggle, colorbar (viridis/plasma), tooltip with coordinates, click for kernel-distance neighbor mode
- **Rendering**: Canvas (pixel-level), shared colormaps

### 3. radar — Multi-Objective Radar

- **Default fixture**: VSIP (built at build-time by `buildDefaultRadarFixture()`)
- **Features**: File upload, generic fixture-driven rendering, 95% CI band toggle
- **Data-driven**: Reads `optimization_config` from fixture to populate objectives/constraints. Falls back to treating all outcomes as objectives if no `optimization_config`.
- **Left panel**: Stat cards (objectives + constraints), P(feasibility) bar
- **Supports**: LEQ and GEQ constraints, minimize/maximize objectives
- **Rendering**: Canvas radar chart

### 4. scatteroid — Ax Cockpit

- **Default fixture**: None (generates semi-synthetic VSIP BO experiment on-the-fly)
- **Features**: Multi-batch BO visualization with Sobol init (8 pts), qEHVI batch (5 completed), and 5 pending candidates. Generation method color coding, constraint bound dashed lines on deltoid (converted to relative space), constraint violation indicators, candidate editing/creation, JSON export, batch filter dropdown. Relativized predictions vs status quo, CI crosshairs, distance-based opacity.
- **Data model**: Arms carry metadata (armName, batchIndex, trialStatus, generationMethod). Sobol points use Halton sequences; qEHVI points are biased perturbations of top performers. Candidates are predicted through the model but not part of training data.
- **Optimization config**: 3 objectives (weight, acceleration, intrusion — all minimize), 4 outcome constraints (door_velocity, bpillar_top_vel, pubic_force, abdomen_load), 3 objective thresholds
- **Visual encoding**: Blue circles (Sobol), teal circles (qEHVI), open diamond (SQ), gold star outlines (fixture candidates), filled coral stars (user candidates). Deltoid shows constraint bounds as dashed lines (red for constraints, gold for objective thresholds).
- **Rendering**: SVG

### 5. cross_validation — Observed vs Predicted

- **Default fixture**: `penicillin_modellist.json`
- **Features**: Scatter plot of observed vs predicted values at training points, CI whiskers (±2σ), R² annotation, diagonal reference line, hover tooltips showing point parameters
- **Data flow**: `predictor.getTrainingData()` → observed Y; `predictor.predict(X)` → predicted mean/variance
- **Rendering**: Canvas

### 7. feature_importance — Dimension Importance Bar Chart

- **Default fixture**: `penicillin_modellist.json`
- **Features**: Horizontal bar chart of 1/lengthscale per dimension, outcome selector, single-outcome and all-outcomes view modes
- **Data flow**: `predictor.rankDimensionsByImportance(outcome)` → sorted bars
- **Rendering**: Canvas

### 8. optimization_trace — Trial Progression

- **Default fixture**: `penicillin_modellist.json`
- **Features**: Line chart of trial value vs trial index, running best-so-far step function (purple), highlighted best-setting trials, minimize/maximize toggle via `optimization_config`
- **Data flow**: `predictor.getTrainingData()` → Y values as sequential trials
- **Rendering**: Canvas

### 9. bayesian_optimization — Live BO with Thompson Sampling

- **Default fixture**: None (fits GP from scratch via MLL optimization)
- **Features**: Real-time BO animation on 2D test functions, test problem dropdown (Branin, Six-Hump Camel, Ackley, Rosenbrock), Thompson Sampling via Random Fourier Features (D=256), MAP estimation with priors + multi-restart Adam (4 inits), LOO cross-validation scatter plot with R^2, click-to-highlight nearest training point with tooltip
- **GP setup**: ScaleKernel(RBF) with ARD, unknown noise, Standardize outcome transform, identity input transform on [0,1]^2
- **Hyperparameter fitting**: Analytic MLL gradients, MAP priors (log-normal on noise/lengthscales/outputscale), 4 random restarts with 200 Adam steps each
- **Rendering**: Canvas (3 heatmaps: true function, posterior mean, predictive std; plus LOO scatter)

### 10. preference_explorer — BOPE (Preference Learning)

- **Default fixture**: None (fits PairwiseGP from scratch via Laplace approximation)
- **Features**: Interactive 4D pairwise preference learning, two modes (auto with test functions, human with visual stimuli), two query strategies (EUBO default, MaxMean-vs-MaxVar), utility and uncertainty heatmaps with dimension sliders, convergence + self-consistency plot, comparison history, stimulus preview on hover
- **GP setup**: PairwiseGP with ScaleKernel(RBF), ARD lengthscales [0.25]×4, adaptive outputscale, continuous candidate generation in [0,1]^4
- **Algorithms**: Client-side probit log-likelihood, Laplace MAP estimation (Newton's method with line search), EUBO pair selection via MC sampling (128 samples × 200 random pairs)
- **Stimulus types**: 6 parameterized 4D visual patterns (Plasma Waves, Op Art, Kaleidoscope, Nebula, Interference, Terrain) for human mode. Each parameter controls a distinct visual aspect
- **Slice visualization**: Heatmaps show x0-x1 slice; sliders control x2, x3 values. Data point opacity scales with kernel distance in slice dimensions
- **Rendering**: Canvas (2 heatmaps: utility mean viridis + uncertainty plasma, convergence dual-axis chart, stimulus canvases)

### 11. quickstart — API Reference & Live Demo

- **Default fixture**: `penicillin_modellist.json`
- **Features**: Syntax-highlighted code examples, method/property tables, demo grid linking to all other demos, live section executing Predictor methods on the fixture
- **Purpose**: Onboarding page for Ax/BoTorch team members
- **Rendering**: HTML/CSS (no canvas)

## Shared Visualization Utilities (`Ax.viz`)

All shared utilities are provided by the `ax-viz.js` IIFE bundle, accessed
via the `Ax.viz.*` namespace. Source: `src/viz/index.ts`.

| Function | Purpose |
|----------|---------|
| `Ax.viz.viridis(t)` | Viridis colormap (t ∈ [0,1] → RGB) |
| `Ax.viz.plasma(t)` | Plasma colormap (t ∈ [0,1] → RGB) |
| `Ax.viz.drawColorbar(id, cfn)` | Render horizontal colorbar to a canvas element |
| `Ax.viz.drawDataDot(ctx, x, y, alpha, isActive, isHovered, fillRGB)` | Standard outer-ring + inner-fill data point |
| `Ax.viz.normalizeFixture(data)` | Unwraps fixture format → flat `{search_space, model_state, metadata, ...}` |
| `Ax.viz.isChoice(p)`, `Ax.viz.isInteger(p)` | Parameter type checks |
| `Ax.viz.defaultParamValue(p)` | Center of bounds / first choice value |
| `Ax.viz.formatParamValue(val, p)` | Display formatting |
| `Ax.viz.computeDimOrder(predictor, nDim, outcome)` | Rank dimensions by importance |
| `Ax.viz.pointRelevance(pt, fixed, plotted, ls, tf, params)` | Kernel-distance relevance between points |
| `Ax.viz.showTooltip(el, html, x, y)` | Show tooltip at coordinates |
| `Ax.viz.hideTooltip(el)` | Hide tooltip |

## Key Visualization Concepts

- **Normalization bounds**: Computed by sampling GP predictions across the search space (not from ground truth). This makes demos fully generic — no `evaluate()` function needed.
- **Fixture-driven**: Demos load `ExperimentState` JSON (with optional `optimization_config`). The same demo works with any Ax experiment export.
- **Build-time fixtures**: Some default fixtures are built at build-time in `build_demos.js` (e.g., VSIP for radar) to avoid runtime model construction.

## Adding a New Demo

1. Create `demo/demos/my_demo.js` exporting a default function that returns HTML
2. Include `${libraryScript()}` and `${vizScript()}` for the core + viz bundles
3. For fixture-driven demos: `${fixtureScript('__DEFAULT_FIXTURE__', myFixture)}` + `Ax.viz.normalizeFixture(__DEFAULT_FIXTURE__)`
4. Use `Ax.viz.*` for colormaps, dot rendering, and search-space helpers
5. Register in `demo/build_demos.js`
6. Add a card to `index.html`
7. Update this file
