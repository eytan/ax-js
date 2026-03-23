"""Explorer fixture generator: standard model + multi-batch metadata overlay.

Generates a fixture by:
1. Using the standard ModelListGP generator (proven parity) for the model
2. Adding observations, candidates, and optimization_config metadata

The metadata simulates a real multi-batch BO workflow:
  Batch 0: Sobol initialization (8 arms, COMPLETED)
  Batch 1: BoTorch optimization (5 arms, COMPLETED)
  Batch 2: BoTorch suggestions (5 arms, CANDIDATE — pending)
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

import numpy as np
import torch

from benchmarks import make_benchmarks, sample_bounded

if TYPE_CHECKING:
    from generate_fixtures import FixtureSpec


def generate_explorer_fixture(spec: FixtureSpec, benchmarks: dict) -> dict:
    """Generate explorer fixture: standard model + observations/candidates metadata."""
    from generators.model_list import generate_model_list_fixture

    # Generate the base fixture using the standard ModelListGP pipeline
    # This handles model fitting, predictions, relativization, etc.
    fixture = generate_model_list_fixture(spec, benchmarks)

    # Now overlay observations, candidates, and optimization_config
    fn = make_benchmarks(negate=False)[spec.benchmark]()
    bounds = fn.bounds
    d = bounds.shape[-1]
    param_names = spec.param_names or [f"x{i}" for i in range(d)]
    outcome_names = spec.outcome_names or [f"y{i}" for i in range(spec.n_outcomes)]

    torch.manual_seed(spec.seed)
    np.random.seed(spec.seed)

    # Get the training X from the model state
    model_state = fixture["experiment"]["model_state"]
    train_X = model_state["models"][0]["train_X"]
    n_train = len(train_X)

    # Evaluate the benchmark at training points to get Y values
    train_X_tensor = torch.tensor(train_X, dtype=torch.float64)
    raw_Y = fn(train_X_tensor)
    if raw_Y.dim() == 1:
        raw_Y = raw_Y.unsqueeze(-1)
    raw_Y = raw_Y[:, :spec.n_outcomes]

    # Split into Sobol init + BO batches
    n_sobol = min(max(n_train * 3 // 5, 1), n_train)
    n_bo = n_train - n_sobol
    # Label BO method based on whether multi-objective
    is_moo = spec.objectives and len(spec.objectives) > 1
    bo_method = "qEHVI" if is_moo else "BoTorch"

    # Build observations
    observations = []
    for i in range(n_train):
        batch_idx = 0 if i < n_sobol else 1
        gen_method = "Sobol" if i < n_sobol else bo_method
        arm_name = f"{batch_idx}_{i - (0 if i < n_sobol else n_sobol)}"

        metrics = {}
        for k in range(spec.n_outcomes):
            metrics[outcome_names[k]] = {
                "mean": float(raw_Y[i, k]),
                "sem": 0.0,
            }

        observations.append({
            "arm_name": arm_name,
            "parameters": {param_names[j]: train_X[i][j] for j in range(d)},
            "metrics": metrics,
            "trial_index": batch_idx,
            "trial_status": "COMPLETED",
            "generation_method": gen_method,
        })

    # Generate candidate points (not in training data)
    n_cand = 5
    cand_X = sample_bounded(bounds, n_cand, spec.seed + 50000)
    candidates = []
    for i in range(n_cand):
        candidates.append({
            "arm_name": f"2_{i}",
            "parameters": {param_names[j]: float(cand_X[i, j]) for j in range(d)},
            "trial_index": 2,
            "generation_method": bo_method,
        })

    # Build optimization config
    opt_config: dict[str, Any] = {
        "objectives": spec.objectives or [],
    }
    if spec.outcome_constraints:
        opt_config["outcome_constraints"] = spec.outcome_constraints
    if spec.objective_thresholds:
        opt_config["objective_thresholds"] = spec.objective_thresholds

    # Add status quo (center of bounds)
    sq_point = ((bounds[0] + bounds[1]) / 2.0).tolist()

    # Overlay metadata onto fixture
    fixture["experiment"]["observations"] = observations
    fixture["experiment"]["candidates"] = candidates
    fixture["experiment"]["optimization_config"] = opt_config
    fixture["experiment"]["status_quo"] = {"point": sq_point}
    fixture["test"]["metadata"]["explorer"] = True

    return fixture
