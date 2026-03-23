# File Correspondence: BoTorch/GPyTorch/Ax to ax-js

This document provides a complete mapping between Python (BoTorch, GPyTorch, Ax)
classes and their ax-js TypeScript equivalents.

Cross-references: [docs/developer-guide.md](../docs/developer-guide.md),
[docs/data-model.md](../docs/data-model.md), [plans/parity-guide.md](parity-guide.md)

---

## 1. Kernels

| GPyTorch class | ax-js file | ax-js class | Key differences |
|---|---|---|---|
| `gpytorch.kernels.MaternKernel` | `src/kernels/matern.ts` | `MaternKernel` | Mean-centers x1/x2 by x1.mean(axis=0) before scaling by lengthscale (matching GPyTorch). Supports nu in {0.5, 1.5, 2.5}. |
| `gpytorch.kernels.RBFKernel` | `src/kernels/rbf.ts` | `RBFKernel` | No mean-centering (matching GPyTorch). Uses squared-distance expansion. |
| `gpytorch.kernels.ScaleKernel` | `src/kernels/scale.ts` | `ScaleKernel` | Wraps any base kernel, multiplies by `outputscale`. |
| `gpytorch.kernels.AdditiveKernel` | `src/kernels/composite.ts` | `AdditiveKernel` | Sum of sub-kernels. Also exports `kernelDiag()` for diagonal computation. |
| `gpytorch.kernels.ProductKernel` | `src/kernels/composite.ts` | `ProductKernel` | Product of sub-kernels. |
| `botorch.models.kernels.CategoricalKernel` | `src/kernels/categorical.ts` | `CategoricalKernel` | Hamming-distance-based kernel for discrete parameters. |
| `gpytorch.kernels.IndexKernel` / `PositiveIndexKernel` | `src/kernels/multitask.ts` | `MultitaskKernel` | Task covariance via covar_factor matrix. Computes B = normalized WW^T. |
| (kernel type dispatch) | `src/kernels/build.ts` | `buildKernel()` | Factory: JSON kernel state to Kernel instance. |
| (kernel interface) | `src/kernels/types.ts` | `Kernel` interface | `compute(x1, x2)` and `computeDiag(x)` methods. |
| (distance utilities) | `src/kernels/distance.ts` | `cdist`, `cdistSquared` | Euclidean clamped at 1e-15; squared clamped at 0. |

## 2. Models

| BoTorch class | ax-js file | ax-js class | Differences |
|---|---|---|---|
| `botorch.models.SingleTaskGP` | `src/models/single_task.ts` | `SingleTaskGP` | Thin wrapper around ExactGP. Accepts `GPModelState` JSON. |
| `gpytorch.models.ExactGP` | `src/models/gp.ts` | `ExactGP` | Core Cholesky-based posterior. Pre-computes L and alpha at construction. Diagonal-only Kss (no full m x m). |
| `botorch.models.ModelListGP` | `src/models/model_list.ts` | `ModelListGP` | Wraps multiple SingleTaskGP sub-models, one per outcome. |
| `botorch.models.MultiTaskGP` | `src/models/multi_task.ts` | `MultiTaskGP` | Uses `MultitaskKernel` for cross-task covariance. Extracts data dims vs task column. |
| `botorch.models.PairwiseGP` | `src/models/pairwise_gp.ts` | (factory: `createPairwiseGP`) | Laplace-approximated posterior. Uses LU instead of Cholesky because CK+I is NOT symmetric. |
| (no BoTorch equivalent) | `src/models/ensemble_gp.ts` | `EnsembleGP` | Averages predictions from multiple SingleTaskGP models (SAAS posteriors or multi-restart MAP). |
| (model type definitions) | `src/models/types.ts` | Interfaces | `GPModelState`, `MultiTaskGPModelState`, `PairwiseGPModelState`, `EnsembleGPModelState`, `PredictionResult` |

## 3. Transforms

| Python class | Layer | ax-js file | ax-js class | Notes |
|---|---|---|---|---|
| `botorch.models.transforms.Normalize` | Model (input) | `src/transforms/normalize.ts` | `InputNormalize` | Affine: `(x - offset) / coefficient`. Applied before warp. |
| `botorch.models.transforms.Warp` | Model (input) | `src/transforms/warp.ts` | `InputWarp` | Kumaraswamy CDF. Uses eps squeeze `x*(1-2e)+e` with `e=1e-7`, not simple clamp. |
| `botorch.models.transforms.Standardize` | Model (outcome) | `src/transforms/outcome.ts` | `StandardizeUntransform` | Linear: `y*std + mean`. |
| `botorch.models.transforms.Log` | Model (outcome) | `src/transforms/outcome.ts` | `LogUntransform` | Delta-method for variance: `var * exp(2*mean)`. |
| `botorch.models.transforms.Bilog` | Model (outcome) | `src/transforms/outcome.ts` | `BilogUntransform` | `sign(y) * (exp(abs(y)) - 1)`. |
| `botorch.models.transforms.Power` | Model (outcome) | `src/transforms/outcome.ts` | `PowerUntransform` | Yeo-Johnson inverse with optional scaler. |
| `botorch.models.transforms.ChainedOutcomeTransform` | Model (outcome) | `src/transforms/outcome.ts` | `ChainedOutcomeUntransform` | Applies sub-transforms in reverse order. |
| `ax.modelbridge.transforms.LogY` | Adapter | `src/predictor.ts` | `LogUntransform` (reused) | Applied by Ax BEFORE BoTorch sees data. Exported in `adapter_transforms`. |
| `ax.modelbridge.transforms.BilogY` | Adapter | `src/predictor.ts` | `BilogUntransform` (reused) | Same mechanism as LogY. |
| `ax.modelbridge.transforms.StandardizeY` | Adapter | `src/predictor.ts` | `StandardizeUntransform` (reused) | Per-metric Ymean/Ystd. |
| `ax.modelbridge.transforms.PowerTransformY` | Adapter | `src/predictor.ts` | `PowerUntransform` (reused) | Per-metric lambda + optional scaler. |
| (relativization) | -- | `src/transforms/relativize.ts` | `relativizePredictions()` | Covariance-aware relativization (Ax uses `cov_means=0`). |
| (outcome transform builder) | -- | `src/transforms/build_outcome.ts` | `buildOutcomeTransform()` | Factory: JSON outcome_transform state to OutcomeUntransform. |

## 4. Linear Algebra

| ax-js file | ax-js functions | Python equivalent | Notes |
|---|---|---|---|
| `src/linalg/matrix.ts` | `Matrix` | `torch.Tensor` (2D) | Row-major Float64Array. No GPU, no autograd, no lazy evaluation. |
| `src/linalg/cholesky.ts` | `cholesky()` | `torch.linalg.cholesky` / `psd_safe_cholesky` | Jitter escalation: [1e-6, 1e-5, 1e-4, 1e-3]. |
| `src/linalg/solve.ts` | `forwardSolve`, `backSolve`, `solveCholesky` | `torch.linalg.solve_triangular` | Standard triangular solvers. |
| `src/linalg/lu.ts` | `luDecompose`, `luSolve` | `torch.linalg.lu_factor` / `lu_solve` | Used only for PairwiseGP (non-symmetric CK+I). |
| `src/linalg/ops.ts` | `matMul`, `transpose`, `addDiag`, etc. | `torch.matmul`, `.T`, etc. | Basic matrix operations. |

## 5. Python Export Functions

| Function in `python/_extraction.py` | What it extracts |
|---|---|
| `extract_kernel_state(covar)` | Recursive kernel tree: type, lengthscale, outputscale, active_dims, sub-kernels |
| `extract_transforms(model)` | Tuple of (input_transform, input_warp, outcome_transform) dicts |
| `extract_multitask_kernel(covar)` | Data kernel state + task covariance (covar_factor, covar_matrix) |
| `extract_mean_constant(model)` | Scalar or list (for MultitaskMean) |
| `export_single_gp(model)` | Full GPModelState dict for SingleTaskGP/FixedNoiseGP |
| `export_pairwise_gp(model)` | PairwiseGPModelState with utility and likelihood_hess |
| `export_multi_task_gp(model)` | MultiTaskGPModelState with data_kernel, task_covar, task_feature |
| `export_model_list(model)` | ModelListGP wrapping per-outcome sub-models |
| `export_ensemble_gp(models)` | EnsembleGPModelState from list of fitted GPs |
| `export_botorch_model(model)` | Top-level dispatcher (detects batched multi-output and decomposes) |

| Function in `python/axjs_export.py` | What it does |
|---|---|
| `export_client(client)` | Builds `ExperimentState` from `ax.api.Client`: model, search space, adapter transforms, observations |
| `export_experiment(experiment, model, ...)` | Builds `ExperimentState` from an Ax `Experiment` and fitted BoTorch model |

## 6. Source-to-Test Mapping

| Source file | Test file(s) |
|---|---|
| `src/kernels/build.ts` | `test/kernels/build.test.ts` |
| `src/kernels/composite.ts` | `test/kernels/composite.test.ts` |
| `src/kernels/distance.ts` | `test/kernels/distance.test.ts` |
| `src/kernels/matern.ts` | `test/kernels/matern.test.ts` |
| `src/kernels/rbf.ts` | `test/kernels/rbf.test.ts` |
| `src/kernels/multitask.ts` | `test/kernels/multitask.test.ts` |
| `src/linalg/cholesky.ts` | `test/linalg/cholesky.test.ts` |
| `src/linalg/lu.ts` | `test/linalg/lu.test.ts` |
| `src/linalg/matrix.ts` | `test/linalg/matrix.test.ts` |
| `src/linalg/ops.ts` | `test/linalg/ops.test.ts` |
| `src/linalg/solve.ts` | `test/linalg/solve.test.ts` |
| `src/models/gp.ts`, `src/models/single_task.ts` | `test/models/gp.test.ts` |
| `src/models/multi_task.ts` | `test/models/multi_task.test.ts` |
| `src/transforms/outcome.ts` | `test/transforms/outcome.test.ts` |
| `src/transforms/relativize.ts` | `test/transforms/relativize.test.ts` |
| `src/transforms/warp.ts` | `test/transforms/warp.test.ts` |
| `src/io/deserialize.ts` | `test/io/deserialize.test.ts` |
| `src/predictor.ts` | `test/predictor.test.ts` |
| `src/sensitivity.ts` | `test/sensitivity.test.ts` |
| `src/sensitivity_analytic.ts` | `test/sensitivity_analytic.test.ts` |
| `src/acquisition/*.ts` | `test/acquisition/acqf.test.ts`, `eubo.test.ts`, `normal.test.ts` |
| `src/viz/*.ts` | `test/viz/kernel_correlation.test.ts` |
| (integration: all models) | `test/integration/botorch_parity.test.ts` |
| (integration: predictor) | `test/integration/predictor_parity.test.ts` |
| (integration: relativize) | `test/integration/relativize_parity.test.ts` |
| (integration: explorer) | `test/integration/explorer_metadata.test.ts` |
| (smoke: public API) | `test/api_smoke.test.ts` |

## 7. Acquisition Functions (Experimental)

These are client-side implementations for interactive exploration. They are NOT
strict BoTorch parity targets -- they aim for reasonable behavior, not numerical
identity with BoTorch's batch acquisition optimization.

| BoTorch class | ax-js file | ax-js function/class | Notes |
|---|---|---|---|
| `botorch.acquisition.UpperConfidenceBound` | `src/acquisition/ucb.ts` | `UCB` | Analytic UCB with configurable beta. |
| `botorch.acquisition.LogExpectedImprovement` | `src/acquisition/log_ei.ts` | `LogEI` | Log-space EI for numerical stability. |
| `botorch.acquisition.analytic.PosteriorMean` | `src/acquisition/posterior.ts` | `PosteriorMean` | Pure exploitation. |
| (Thompson sampling) | `src/acquisition/thompson.ts` | `ThompsonSampling` | Sample from GP posterior via MVN. |
| `botorch.acquisition.preference.AnalyticExpectedUtilityOfBestOption` | `src/acquisition/eubo.ts` | `EUBO` | Pairwise preference optimization. |
| (MVN sampling) | `src/acquisition/sample_mvn.ts` | `sampleMVN` | Cholesky-based MVN sampling. |
| `botorch.acquisition.optimize` | `src/acquisition/optimize.ts` | `optimizeAcqf` | CMA-ES-based optimization (no L-BFGS). |
| (normal distribution) | `src/acquisition/normal.ts` | `normalPdf`, `normalCdf`, `normalLogCdf` | Standard normal utilities. |
| (shared types) | `src/acquisition/types.ts` | `AcquisitionFunction` interface | Common interface for all acqf. |

## 8. What Has No ax-js Equivalent

| Python concept | Why excluded |
|---|---|
| Fantasy models / `fantasize()` | Prediction-only library; no model updating or look-ahead. |
| Lanczos / CG solvers | Not needed at ax-js scale (n < 5000). Cholesky is exact and fast enough. |
| `LazyEvaluatedKernelTensor` | GPyTorch lazy evaluation is a performance optimization for large-scale; ax-js uses eager dense matrices. |
| GPU dispatch / CUDA | ax-js runs in-browser on CPU. Float64Array provides sufficient performance for typical experiment sizes. |
| `LCEAGP` / context-dependent models | Specialized model not yet encountered in Ax exports. Can be added if needed. |
| Multi-fidelity models (`SingleTaskMultiFidelityGP`) | Not currently exported by Ax's adapter. Would require additional extraction logic. |
| Batch acquisition optimization (qEI, qNEHVI) | ax-js acquisition is for interactive single-point suggestions, not batch optimization. |
| Autograd / backward pass | No fitting or gradient-based optimization in ax-js. Hyperparameters come from Python. |
| `torch.distributions` | Replaced by hand-written `normalCdf`, `normalPdf` in `src/math.ts` and `src/acquisition/normal.ts`. |
| Model fitting (`fit_gpytorch_mll`) | Entirely out of scope. ax-js is prediction-only. |
