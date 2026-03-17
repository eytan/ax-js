"""
Generate test fixtures for axjs by fitting BoTorch models and exporting predictions.

Usage:
    python generate_fixtures.py [--check] [--output-dir test/fixtures]

Each fixture spec defines:
1. A benchmark function (Branin, Hartmann, BraninCurrin) for stable training data
2. A BoTorch model configuration (kernel, transforms, etc.)
3. Reference predictions at test points

Output schema: {experiment: ExperimentState, test: {metadata, test_points, expected}}
- experiment: Same ExperimentState schema as axjs_export.py
- test.expected.mean/variance: null for consistency-only fixtures (Bilog/Power)
- test.expected_relative: present only for fixtures with status_quo

Model state extraction is delegated to _extraction.py (shared with axjs_export.py).
Generator functions live in generators/ (organized by model type).
Requires BoTorch >= 0.17.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch

from benchmarks import make_benchmarks, VehicleSideImpact
from generators import (
    generate_singletask_fixture,
    generate_model_list_fixture,
    generate_pairwise_fixture,
    generate_multitask_fixture,
    generate_ensemble_fixture,
    generate_ax_level_fixture,
)

# Ensure reproducibility
torch.set_default_dtype(torch.float64)


# ── Fixture spec ─────────────────────────────────────────────────────────────

@dataclass
class FixtureSpec:
    name: str
    benchmark: str  # "Branin", "Hartmann", "BraninCurrin", or "synthetic"
    model_class: str  # "SingleTaskGP" | "FixedNoiseGP" | "ModelListGP" | "PairwiseGP" | "MultiTaskGP" | "EnsembleGP"
    n_train: int
    n_test: int
    seed: int
    description: str = ""
    noise: float | None = None  # For FixedNoiseGP: fixed noise level
    heteroscedastic_noise: bool = False  # noise proportional to |y|
    kernel_type: str = "Matern"  # "Matern" | "RBF"
    nu: float = 2.5
    use_warp: bool = False
    use_composite: bool = False  # Product(continuous * Categorical)
    cat_cardinality: int = 5  # bins per categorical dim
    cat_dims: list[int] | None = None  # which dims to treat as categorical
    n_outcomes: int = 1
    num_tasks: int = 0  # >0 for MultiTaskGP
    int_dims: list[int] | None = None  # dims to round to integers
    int_bounds: tuple[int, int] = (0, 4)  # integer range for int_dims
    ensemble_method: str = "auto"  # "nuts", "map", or "auto" (for EnsembleGP)
    use_additive: bool = False  # AdditiveKernel(per-dim kernels)
    status_quo: str | None = None  # "center" to use center of bounds as status quo
    outcome_type: str = "Standardize"  # "Standardize"|"Log"|"Bilog"|"Power"|"Chained"
    power_lambda: float = 0.5  # lambda for Power (Yeo-Johnson) outcome transform
    negate_benchmark: bool = True  # negate benchmark Y (True → negative values)
    outcome_names: list[str] | None = None  # custom outcome names for ModelListGP
    param_names: list[str] | None = None  # custom parameter names (default: x0, x1, ...)
    # Ax-level fixture generation (through ax.api.Client)
    ax_level: bool = False  # True = generate through Ax Client API
    adapter_transforms: list[str] | None = None  # ["LogY", "BilogY", etc.]
    objectives: list[dict] | None = None  # [{"name": "y", "minimize": True}]
    outcome_constraints: list[dict] | None = None  # [{"name": "c", "bound": 0.5, "op": "LEQ"}]
    objective_thresholds: list[dict] | None = None  # [{"name": "f0", "bound": 1.1, "op": "LEQ"}]
    all_tasks: bool = False  # True = predict for all tasks (MultiTaskGP)


# Each fixture tests a DISTINCT modeling feature. No redundant coverage.
FIXTURE_SPECS = [
    # 1. Basic GP: ARD, Normalize, Standardize
    FixtureSpec(
        name="branin_matern25",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=42,
        description="Branin 2D, Matérn 5/2, ARD, Normalize+Standardize",
    ),
    # 2. RBF kernel (BoTorch 0.16 default)
    FixtureSpec(
        name="branin_rbf",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=43,
        kernel_type="RBF",
        description="Branin 2D, RBF kernel (BoTorch 0.16 default)",
    ),
    # 3. Fixed noise (per-point noise variance)
    FixtureSpec(
        name="branin_fixed_noise",
        benchmark="Branin",
        model_class="FixedNoiseGP",
        n_train=15,
        n_test=20,
        seed=44,
        noise=0.1,
        description="Branin 2D, FixedNoiseGP with per-point noise",
    ),
    # 4. Input warping (Kumaraswamy CDF)
    FixtureSpec(
        name="branin_warp",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=20,
        n_test=15,
        seed=45,
        use_warp=True,
        description="Branin 2D, Kumaraswamy input warping",
    ),
    # 5. Mixed continuous+categorical via natural discretization of Hartmann dims 4-5
    FixtureSpec(
        name="hartmann_mixed",
        benchmark="Hartmann",
        model_class="SingleTaskGP",
        n_train=30,
        n_test=15,
        seed=46,
        use_composite=True,
        cat_cardinality=5,
        cat_dims=[4, 5],
        description="Hartmann 6D, Product(Matérn(dims 0-3) * Categorical(dims 4-5))",
    ),
    # 6. High-dimensional with strong ARD
    FixtureSpec(
        name="hartmann_6d",
        benchmark="Hartmann",
        model_class="SingleTaskGP",
        n_train=30,
        n_test=20,
        seed=47,
        description="Hartmann 6D, strong ARD lengthscales",
    ),
    # 7. Multi-objective (ModelListGP with 2 outcomes)
    FixtureSpec(
        name="branincurrin_modellist",
        benchmark="BraninCurrin",
        model_class="ModelListGP",
        n_train=20,
        n_test=15,
        seed=48,
        n_outcomes=2,
        description="BraninCurrin 2D, ModelListGP with 2 outcomes",
    ),
    # 8. PairwiseGP (BOPE, Laplace approx)
    FixtureSpec(
        name="branin_pairwise",
        benchmark="Branin",
        model_class="PairwiseGP",
        n_train=10,
        n_test=15,
        seed=49,
        description="Branin 2D, PairwiseGP (BOPE), Laplace+LU",
    ),
    # 9. Multi-task GP (ICM kernel)
    FixtureSpec(
        name="branin_multitask",
        benchmark="Branin",
        model_class="MultiTaskGP",
        n_train=30,
        n_test=10,
        seed=50,
        num_tasks=2,
        description="Branin 2D, MultiTaskGP with 2 tasks (ICM)",
    ),
    # 10. Edge case: single training point
    FixtureSpec(
        name="branin_1pt",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=1,
        n_test=10,
        seed=51,
        description="Branin 2D, edge case: n_train=1",
    ),
    # 11. Integer parameters
    FixtureSpec(
        name="hartmann_integer",
        benchmark="Hartmann",
        model_class="SingleTaskGP",
        n_train=30,
        n_test=15,
        seed=60,
        int_dims=[4, 5],
        int_bounds=(0, 4),
        description="Hartmann 6D, dims 4-5 as integer [0,4]",
    ),
    # 12. Kitchen sink: mixed + warp
    FixtureSpec(
        name="hartmann_mixed_warp",
        benchmark="Hartmann",
        model_class="SingleTaskGP",
        n_train=30,
        n_test=15,
        seed=61,
        use_composite=True,
        use_warp=True,
        cat_cardinality=5,
        cat_dims=[4, 5],
        description="Hartmann 6D, 2 cat dims + warp on cont dims",
    ),
    # 13. Multi-task + categorical
    FixtureSpec(
        name="multitask_mixed",
        benchmark="Branin",
        model_class="MultiTaskGP",
        n_train=30,
        n_test=10,
        seed=62,
        num_tasks=2,
        use_composite=True,
        cat_cardinality=5,
        cat_dims=[1],
        description="Branin 2D, MultiTaskGP + categorical dim",
    ),
    # 14. Multi-task + warp
    FixtureSpec(
        name="multitask_warp",
        benchmark="Branin",
        model_class="MultiTaskGP",
        n_train=30,
        n_test=10,
        seed=63,
        num_tasks=2,
        use_warp=True,
        description="Branin 2D, MultiTaskGP + input warping",
    ),
    # 15. Pairwise + warp
    FixtureSpec(
        name="pairwise_warp",
        benchmark="Branin",
        model_class="PairwiseGP",
        n_train=10,
        n_test=15,
        seed=64,
        use_warp=True,
        description="Branin 2D, PairwiseGP + input warping",
    ),
    # 16. SAAS fully Bayesian (NUTS)
    FixtureSpec(
        name="saas_highdim_nuts",
        benchmark="Hartmann",
        model_class="EnsembleGP",
        n_train=40,
        n_test=15,
        seed=65,
        ensemble_method="nuts",
        description="20D (6 signal + 14 noise), fully Bayesian SAAS (NUTS)",
    ),
    # 17. SAAS MAP ensemble
    FixtureSpec(
        name="saas_highdim_map",
        benchmark="Hartmann",
        model_class="EnsembleGP",
        n_train=40,
        n_test=15,
        seed=66,
        ensemble_method="map",
        description="20D (6 signal + 14 noise), multi-restart MAP ensemble",
    ),
    # 18. Additive kernel (per-dim)
    FixtureSpec(
        name="branin_additive",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=20,
        n_test=15,
        seed=67,
        use_additive=True,
        description="Branin 2D, AdditiveKernel(Matern(x0) + Matern(x1))",
    ),
    # 19. Heteroscedastic noise (per-point variance)
    FixtureSpec(
        name="branin_heteroscedastic",
        benchmark="Branin",
        model_class="FixedNoiseGP",
        n_train=15,
        n_test=20,
        seed=68,
        noise=0.1,
        heteroscedastic_noise=True,
        description="Branin 2D, FixedNoiseGP with heteroscedastic noise (var ∝ |y|)",
    ),
    # 20. Multi-output ModelListGP with FixedNoiseGP
    FixtureSpec(
        name="branincurrin_fixednoise_modellist",
        benchmark="BraninCurrin",
        model_class="ModelListGP",
        n_train=20,
        n_test=15,
        seed=69,
        n_outcomes=2,
        noise=0.1,
        description="BraninCurrin 2D, ModelListGP with FixedNoiseGP sub-models",
    ),
    # 21. Multi-output ModelListGP with FixedNoiseGP + warp + heteroscedastic
    FixtureSpec(
        name="branincurrin_warp_fixednoise_modellist",
        benchmark="BraninCurrin",
        model_class="ModelListGP",
        n_train=20,
        n_test=15,
        seed=70,
        n_outcomes=2,
        noise=0.05,
        use_warp=True,
        heteroscedastic_noise=True,
        description="BraninCurrin 2D, ModelListGP + FixedNoise + Warp + heteroscedastic",
    ),
    # 22. Relativization: SingleTaskGP with status quo (noiseless)
    FixtureSpec(
        name="branin_relative",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=71,
        status_quo="center",
        description="Branin 2D, SingleTaskGP + relativize vs center status quo",
    ),
    # 23. Relativization: FixedNoiseGP with status quo (noisy)
    FixtureSpec(
        name="branin_relative_fixed_noise",
        benchmark="Branin",
        model_class="FixedNoiseGP",
        n_train=15,
        n_test=20,
        seed=72,
        noise=0.1,
        status_quo="center",
        description="Branin 2D, FixedNoiseGP + relativize vs center (noisy)",
    ),
    # 24. Matérn ν=0.5 (exponential kernel)
    FixtureSpec(
        name="branin_matern05",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=73,
        nu=0.5,
        description="Branin 2D, Matérn ν=0.5 (exponential kernel)",
    ),
    # 25. Matérn ν=1.5
    FixtureSpec(
        name="branin_matern15",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=74,
        nu=1.5,
        description="Branin 2D, Matérn ν=1.5",
    ),
    # 26. Log outcome transform
    FixtureSpec(
        name="branin_log",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=75,
        negate_benchmark=False,  # Branin is positive by default; Log needs Y > 0
        outcome_type="Log",
        description="Branin 2D, Log outcome transform (exact log-normal moments)",
    ),
    # 27. Chained(Log, Standardize) outcome transform
    FixtureSpec(
        name="branin_chained_log_std",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=76,
        negate_benchmark=False,  # Log needs Y > 0
        outcome_type="Chained",
        description="Branin 2D, Chained(Log, Standardize) outcome transform",
    ),
    # 28. Bilog outcome transform (consistency only — no BoTorch parity)
    FixtureSpec(
        name="branin_bilog",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=77,
        outcome_type="Bilog",
        description="Branin 2D, Bilog outcome transform (consistency test only)",
    ),
    # 29. Power outcome transform (consistency only — no BoTorch parity)
    FixtureSpec(
        name="branin_power",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=78,
        negate_benchmark=False,  # Power(0.5) needs positive Y
        outcome_type="Power",
        power_lambda=0.5,
        description="Branin 2D, Power(λ=0.5) outcome transform (consistency test only)",
    ),
    # 30. Vehicle Side-Impact Problem (9-outcome ModelListGP)
    FixtureSpec(
        name="vsip_modellist",
        benchmark="VSIP",
        model_class="ModelListGP",
        n_train=20,
        n_test=15,
        seed=79,
        n_outcomes=9,
        kernel_type="RBF",
        description="Vehicle Side-Impact 7D, ModelListGP with 9 outcomes (3 obj + 6 con)",
        outcome_names=VehicleSideImpact.OUTCOME_NAMES,
        param_names=VehicleSideImpact.PARAM_NAMES,
    ),
    # ── Ax-level fixtures (generated through ax.api.Client) ──────────────────
    # 31. LogY adapter transform
    FixtureSpec(
        name="ax_branin_logy",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=80,
        ax_level=True,
        negate_benchmark=False,  # LogY needs Y > 0
        adapter_transforms=["LogY"],
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: SingleTaskGP + LogY adapter transform",
    ),
    # 32. BilogY adapter transform
    FixtureSpec(
        name="ax_branin_bilogy",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=81,
        ax_level=True,
        adapter_transforms=["BilogY"],
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: SingleTaskGP + BilogY adapter transform",
    ),
    # 33. StandardizeY adapter transform
    FixtureSpec(
        name="ax_branin_standardizey",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=82,
        ax_level=True,
        adapter_transforms=["StandardizeY"],
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: SingleTaskGP + StandardizeY adapter transform",
    ),
    # 34. BilogY adapter + Standardize model (combined adapter+model)
    FixtureSpec(
        name="ax_branin_bilogy_standardize",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=83,
        ax_level=True,
        adapter_transforms=["BilogY"],
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: SingleTaskGP + BilogY adapter + Standardize model",
    ),
    # 35. Multi-output ModelListGP + LogY on one metric
    FixtureSpec(
        name="ax_branincurrin_logy",
        benchmark="BraninCurrin",
        model_class="ModelListGP",
        n_train=20,
        n_test=15,
        seed=84,
        n_outcomes=2,
        ax_level=True,
        negate_benchmark=False,
        adapter_transforms=["LogY"],
        objectives=[
            {"name": "branin", "minimize": True},
            {"name": "currin", "minimize": True},
        ],
        outcome_names=["branin", "currin"],
        description="Ax-level: ModelListGP + LogY on both metrics",
    ),
    # 36. Batched SingleTaskGP (Ax default MOO) → ModelListGP
    FixtureSpec(
        name="ax_branincurrin_batched",
        benchmark="BraninCurrin",
        model_class="ModelListGP",
        n_train=20,
        n_test=15,
        seed=85,
        n_outcomes=2,
        ax_level=True,
        negate_benchmark=False,
        objectives=[
            {"name": "branin", "minimize": True},
            {"name": "currin", "minimize": True},
        ],
        outcome_names=["branin", "currin"],
        description="Ax-level: batched SingleTaskGP (Ax default MOO) → ModelListGP",
    ),
    # 37. Multi-output relativization
    FixtureSpec(
        name="ax_branincurrin_relative",
        benchmark="BraninCurrin",
        model_class="ModelListGP",
        n_train=20,
        n_test=15,
        seed=86,
        n_outcomes=2,
        ax_level=True,
        negate_benchmark=False,
        status_quo="center",
        objectives=[
            {"name": "branin", "minimize": True},
            {"name": "currin", "minimize": True},
        ],
        outcome_names=["branin", "currin"],
        description="Ax-level: ModelListGP + status quo for multi-output relativization",
    ),
    # 38. MultiTaskGP + status quo for relativization
    FixtureSpec(
        name="ax_multitask_relative",
        benchmark="Branin",
        model_class="MultiTaskGP",
        n_train=30,
        n_test=10,
        seed=87,
        num_tasks=2,
        ax_level=True,
        status_quo="center",
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: MultiTaskGP + status quo for relativization",
    ),
    # 39. MultiTaskGP with predictions for ALL tasks
    FixtureSpec(
        name="ax_multitask_all_tasks",
        benchmark="Branin",
        model_class="MultiTaskGP",
        n_train=30,
        n_test=10,
        seed=88,
        num_tasks=2,
        ax_level=True,
        all_tasks=True,
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: MultiTaskGP with predictions for all tasks",
    ),
    # 40. PowerTransformY adapter
    FixtureSpec(
        name="ax_branin_powery",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=89,
        ax_level=True,
        negate_benchmark=False,  # PowerTransformY needs positive Y
        adapter_transforms=["PowerTransformY"],
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: SingleTaskGP + PowerTransformY adapter",
    ),
    # 41. LogY adapter + Standardize model outcome
    FixtureSpec(
        name="ax_branin_log_standardize",
        benchmark="Branin",
        model_class="SingleTaskGP",
        n_train=15,
        n_test=20,
        seed=91,
        ax_level=True,
        negate_benchmark=False,
        adapter_transforms=["LogY"],
        outcome_type="Standardize",
        objectives=[{"name": "y", "minimize": True}],
        description="Ax-level: LogY adapter + Standardize model outcome transform",
    ),
    # ── Constrained & high-dimensional benchmarks (for demos) ──
    # 42. C2DTLZ2: constrained MOO, 4D, 2 objectives + 1 constraint
    FixtureSpec(
        name="c2dtlz2_constrained_moo",
        benchmark="C2DTLZ2",
        model_class="ModelListGP",
        n_train=25,
        n_test=15,
        seed=100,
        n_outcomes=3,  # 2 objectives + 1 constraint
        negate_benchmark=False,
        outcome_names=["f0", "f1", "c0"],
        param_names=["x0", "x1", "x2", "x3"],
        objectives=[
            {"name": "f0", "minimize": True},
            {"name": "f1", "minimize": True},
        ],
        outcome_constraints=[{"name": "c0", "bound": 0.0, "op": "GEQ"}],
        objective_thresholds=[
            {"name": "f0", "bound": 1.1, "op": "LEQ"},
            {"name": "f1", "bound": 1.1, "op": "LEQ"},
        ],
        description="C2DTLZ2: 4D, 2 objectives + 1 constraint, constrained MOO",
    ),
    # 43. DiscBrake: constrained MOO, 4D, 2 objectives + 4 constraints
    FixtureSpec(
        name="discbrake_constrained_moo",
        benchmark="DiscBrake",
        model_class="ModelListGP",
        n_train=30,
        n_test=15,
        seed=101,
        n_outcomes=6,  # 2 objectives + 4 constraints
        negate_benchmark=False,
        outcome_names=["mass", "stopping_dist", "c0", "c1", "c2", "c3"],
        param_names=["x0", "x1", "x2", "x3"],
        objectives=[
            {"name": "mass", "minimize": True},
            {"name": "stopping_dist", "minimize": True},
        ],
        outcome_constraints=[
            {"name": "c0", "bound": 0.0, "op": "GEQ"},
            {"name": "c1", "bound": 0.0, "op": "GEQ"},
            {"name": "c2", "bound": 0.0, "op": "GEQ"},
            {"name": "c3", "bound": 0.0, "op": "GEQ"},
        ],
        objective_thresholds=[
            {"name": "mass", "bound": 5.7771, "op": "LEQ"},
            {"name": "stopping_dist", "bound": 3.9651, "op": "LEQ"},
        ],
        description="DiscBrake: 4D, 2 obj + 4 constraints, engineering MOO",
    ),
    # 44. PressureVessel: constrained SOO, 4D, 1 objective + 4 constraints
    FixtureSpec(
        name="pressure_vessel_constrained",
        benchmark="PressureVessel",
        model_class="ModelListGP",
        n_train=25,
        n_test=15,
        seed=102,
        n_outcomes=5,  # 1 objective + 4 constraints
        negate_benchmark=False,
        outcome_names=["cost", "c0", "c1", "c2", "c3"],
        param_names=["thickness_s", "thickness_h", "radius", "length"],
        objectives=[{"name": "cost", "minimize": True}],
        outcome_constraints=[
            {"name": "c0", "bound": 0.0, "op": "GEQ"},
            {"name": "c1", "bound": 0.0, "op": "GEQ"},
            {"name": "c2", "bound": 0.0, "op": "GEQ"},
            {"name": "c3", "bound": 0.0, "op": "GEQ"},
        ],
        description="PressureVessel: 4D, 1 obj + 4 constraints, engineering design",
    ),
    # 45. TrajectoryPlanning: high-dimensional SOO, 30D
    FixtureSpec(
        name="trajectory_planning_30d",
        benchmark="TrajectoryPlanning",
        model_class="SingleTaskGP",
        n_train=60,
        n_test=15,
        seed=103,
        negate_benchmark=False,
        objectives=[{"name": "y", "minimize": True}],
        description="TrajectoryPlanning: 30D, high-dimensional single objective",
    ),
    # 46. Cockpit: multi-batch MOO with observations + candidates metadata
    FixtureSpec(
        name="cockpit_c2dtlz2",
        benchmark="C2DTLZ2",
        model_class="ModelListGP",
        n_train=13,  # 8 Sobol + 5 qEHVI (completed)
        n_test=10,
        seed=200,
        n_outcomes=3,
        negate_benchmark=False,
        ax_level=True,
        outcome_names=["f0", "f1", "c0"],
        param_names=["x0", "x1", "x2", "x3"],
        objectives=[
            {"name": "f0", "minimize": True},
            {"name": "f1", "minimize": True},
        ],
        outcome_constraints=[{"name": "c0", "bound": 0.0, "op": "GEQ"}],
        objective_thresholds=[
            {"name": "f0", "bound": 1.1, "op": "LEQ"},
            {"name": "f1", "bound": 1.1, "op": "LEQ"},
        ],
        status_quo="center",
        description="Cockpit: C2DTLZ2 multi-batch MOO, 8 Sobol + 5 qEHVI + 5 candidates",
    ),
]


# ── Generator dispatch ───────────────────────────────────────────────────────

def _generate_fixture(spec: FixtureSpec, benchmarks: dict) -> dict:
    """Generate a single fixture from spec, dispatching to the appropriate generator."""
    if spec.ax_level and spec.name.startswith("cockpit_"):
        from generators.cockpit import generate_cockpit_fixture
        return generate_cockpit_fixture(spec, benchmarks)
    if spec.ax_level:
        return generate_ax_level_fixture(spec, benchmarks)
    dispatch = {
        "PairwiseGP": generate_pairwise_fixture,
        "MultiTaskGP": generate_multitask_fixture,
        "ModelListGP": generate_model_list_fixture,
        "EnsembleGP": generate_ensemble_fixture,
    }
    gen = dispatch.get(spec.model_class, generate_singletask_fixture)
    return gen(spec, benchmarks)


# ── Main ─────────────────────────────────────────────────────────────────────

def generate_all(
    output_dir: str = "test/fixtures",
    check: bool = False,
    names: list[str] | None = None,
) -> None:
    """Generate all fixtures and update manifest.

    Args:
        names: If provided, only generate fixtures whose name matches.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    if names:
        name_set = set(names)
        unknown = name_set - {s.name for s in FIXTURE_SPECS}
        if unknown:
            print(f"ERROR: Unknown fixture names: {unknown}", file=sys.stderr)
            print(f"Available: {sorted(s.name for s in FIXTURE_SPECS)}", file=sys.stderr)
            sys.exit(1)
        specs = [s for s in FIXTURE_SPECS if s.name in name_set]
    else:
        specs = list(FIXTURE_SPECS)

    benchmarks = make_benchmarks()
    manifest_entries = []
    failed = []

    for spec in specs:
        filename = f"{spec.name}.json"
        filepath = out / filename

        if check and filepath.exists():
            with open(filepath) as f:
                existing = json.load(f)
            import botorch

            bt_ver = existing.get("test", existing).get("metadata", existing.get("metadata", {})).get("botorch_version")
            if bt_ver and bt_ver != botorch.__version__:
                print(
                    f"WARNING: {spec.name} was generated with "
                    f"botorch {bt_ver}, "
                    f"current is {botorch.__version__}"
                )
            manifest_entries.append(
                {
                    "name": spec.name,
                    "file": filename,
                    "description": spec.description,
                }
            )
            continue

        print(f"Generating {spec.name}...", end=" ", flush=True)
        try:
            fixture = _generate_fixture(spec, benchmarks)
            with open(filepath, "w") as f:
                json.dump(fixture, f, indent=2)
            print(f"OK ({filepath})")
            manifest_entries.append(
                {
                    "name": spec.name,
                    "file": filename,
                    "description": spec.description,
                }
            )
        except Exception as e:
            print(f"FAILED: {e}")
            failed.append(spec.name)

    # When filtering by --names, merge with existing manifest entries
    if names:
        manifest_path = out / "manifest.json"
        if manifest_path.exists():
            with open(manifest_path) as f:
                existing_manifest = json.load(f)
            regenerated = {e["name"] for e in manifest_entries}
            for entry in existing_manifest.get("fixtures", []):
                if entry["name"] not in regenerated:
                    manifest_entries.append(entry)

    # Sort by name for stability
    manifest_entries.sort(key=lambda e: e["name"])

    manifest = {"fixtures": manifest_entries}
    with open(out / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest updated: {out / 'manifest.json'}")

    # Spec↔manifest validation (only when generating all)
    if not names:
        spec_names = {s.name for s in FIXTURE_SPECS}
        manifest_names = {e["name"] for e in manifest_entries}
        missing = spec_names - manifest_names
        if missing:
            print(
                f"ERROR: {len(missing)} specs not in manifest: {missing}",
                file=sys.stderr,
            )
            sys.exit(1)

    if failed:
        print(f"ERROR: {len(failed)} fixtures failed: {failed}", file=sys.stderr)
        sys.exit(1)

    print(f"\nAll {len(manifest_entries)} fixtures generated successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate axjs test fixtures")
    parser.add_argument(
        "--output-dir", default="test/fixtures", help="Output directory"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check version compatibility without regenerating",
    )
    parser.add_argument(
        "--names",
        nargs="+",
        help="Only generate these fixtures (by name)",
    )
    args = parser.parse_args()
    generate_all(args.output_dir, args.check, names=args.names)
