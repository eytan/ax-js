"""
Export GP model state from Ax to JSON for axjs.

Usage:
    from axjs_export import export_client, export_experiment

    # From ax.api.Client (recommended)
    state = export_client(client)

    # From Experiment with GenerationStrategy
    state = export_experiment(experiment, generation_strategy)

Output schema: ExperimentState
    {search_space, model_state, name?, description?, outcome_names,
     status_quo?, adapter_transforms?, optimization_config?}

Supports:
    - SingleTaskGP / FixedNoiseGP (with ARD, warp, fixed/heteroscedastic noise)
    - Batched multi-output SingleTaskGP (Ax default for MOO → exported as ModelListGP)
    - ModelListGP (multi-output)
    - PairwiseGP (with optional warp)
    - MultiTaskGP (PositiveIndexKernel/MultitaskMean, BoTorch >= 0.17)
    - EnsembleGP (SAAS fully Bayesian / multi-restart MAP)
    - Composite kernels: Scale(Product(...)), Scale(Additive(...))
    - Input transforms: Normalize, Warp (Kumaraswamy), ChainedInputTransform
    - Outcome transforms: Standardize, Log, Bilog, Power, Chained
    - Adapter-level Y transforms: LogY, BilogY, PowerTransformY, StandardizeY
"""

from __future__ import annotations

import json
import warnings
from typing import Any

from _extraction import (
    export_botorch_model,
    export_single_gp,
    export_pairwise_gp,
    export_multi_task_gp,
    export_model_list,
    export_ensemble_gp,
)

# Adapter Y-transform class names that affect prediction space.
# These transforms are applied by Ax BEFORE data reaches BoTorch.
# Without exporting this metadata, client-side predictions are in the wrong space.
_Y_TRANSFORM_NAMES = {"LogY", "BilogY", "PowerTransformY", "StandardizeY"}


def _compose_unitx_if_needed(
    adapter: Any, model_state: dict, search_space: Any
) -> None:
    """Compose UnitX normalization into exported model state.

    Ax's adapter applies UnitX (raw → [0,1]) before the BoTorch model sees data.
    After export_botorch_model(), train_X is in UnitX space. This function:
    1. Converts train_X back to raw parameter space
    2. Creates/adjusts input_transform to map raw → model's expected space

    Only runs if UnitX is detected in the adapter's transforms.
    """
    # Check if UnitX is in the adapter's transforms
    if not hasattr(adapter, "transforms"):
        return
    has_unitx = any(
        type(tf).__name__ == "UnitX" for tf in adapter.transforms.values()
    )
    if not has_unitx:
        return

    # Extract bounds from search space
    params = list(search_space.parameters.values())
    lo = []
    hi = []
    for p in params:
        if hasattr(p, "lower") and hasattr(p, "upper"):
            lo.append(float(p.lower))
            hi.append(float(p.upper))
        else:
            lo.append(0.0)
            hi.append(1.0)

    d = len(lo)

    def _compose_single(state: dict) -> None:
        """Un-UnitX train_X and compose UnitX into input_transform for one model."""
        if "train_X" in state:
            for pt in state["train_X"]:
                for i in range(min(d, len(pt))):
                    pt[i] = pt[i] * (hi[i] - lo[i]) + lo[i]

        itf = state.get("input_transform")
        if itf is None:
            # No model-level Normalize — create one equivalent to UnitX
            state["input_transform"] = {
                "offset": lo[:],
                "coefficient": [hi[i] - lo[i] for i in range(d)],
            }
        else:
            # Compose: combined = Normalize ∘ UnitX
            offset = itf["offset"]
            coeff = itf["coefficient"]
            n = min(d, len(offset))
            for i in range(n):
                span = hi[i] - lo[i]
                if span > 0:
                    offset[i] = lo[i] + offset[i] * span
                    coeff[i] = coeff[i] * span

    # Apply to all sub-models (ModelListGP) or the single model
    if model_state.get("model_type") == "ModelListGP" and "models" in model_state:
        for sub in model_state["models"]:
            _compose_single(sub)
    else:
        _compose_single(model_state)


def _get_search_space_info(search_space: Any) -> dict:
    """Extract parameter info from Ax search space.

    Exports all parameter metadata needed for client-side visualization:
    - Range params: bounds, parameter_type (int/float), log_scale, is_fidelity
    - Choice params: values, is_ordered
    """
    params = []
    for p in search_space.parameters.values():
        info: dict[str, Any] = {"name": p.name}
        if hasattr(p, "lower") and hasattr(p, "upper"):
            info["type"] = "range"
            info["bounds"] = [float(p.lower), float(p.upper)]
            if hasattr(p, "parameter_type"):
                info["parameter_type"] = p.parameter_type.name.lower()
            if hasattr(p, "log_scale") and p.log_scale:
                info["log_scale"] = True
            if hasattr(p, "is_fidelity") and p.is_fidelity:
                info["is_fidelity"] = True
                if hasattr(p, "target_value") and p.target_value is not None:
                    info["target_value"] = float(p.target_value)
        else:
            info["type"] = "choice"
            info["values"] = list(p.values)
            if hasattr(p, "is_ordered") and p.is_ordered:
                info["is_ordered"] = True
        params.append(info)
    return {"parameters": params}


def _extract_adapter_transforms(adapter: Any) -> list[dict] | None:
    """Extract adapter-level Y-transforms that affect prediction space.

    These transforms are applied by Ax's adapter layer BEFORE data reaches
    BoTorch. Without this metadata, client-side predictions are in the wrong
    space (e.g., log-space if LogY was applied).

    Returns a list of transform descriptors, or None if no Y-transforms found.
    """
    if not hasattr(adapter, "transforms"):
        return None

    y_transforms = []
    for name, tf in adapter.transforms.items():
        if name not in _Y_TRANSFORM_NAMES:
            continue

        # Extract metric names (LogY, BilogY, PowerTransformY track which metrics).
        # Ax 1.2+ uses "metric_signatures"; older versions used "metric_names".
        metric_list = (
            getattr(tf, "metric_signatures", None)
            or getattr(tf, "metric_names", None)
        )

        # Y-transforms with empty metrics list are no-ops — skip them
        if name in ("LogY", "BilogY", "PowerTransformY"):
            if not metric_list:
                continue

        info: dict[str, Any] = {"type": name}
        if metric_list:
            info["metrics"] = list(metric_list)

        # StandardizeY: extract per-metric Ymean/Ystd
        if name == "StandardizeY":
            if hasattr(tf, "Ymean") and tf.Ymean is not None:
                info["Ymean"] = {k: float(v) for k, v in tf.Ymean.items()}
            if hasattr(tf, "Ystd") and tf.Ystd is not None:
                info["Ystd"] = {k: float(v) for k, v in tf.Ystd.items()}

        # PowerTransformY: extract fitted power parameters + scaler stats.
        # sklearn's PowerTransformer bundles standardization: after YJ transform,
        # it standardizes using _scaler.mean_ and _scaler.scale_. We need both
        # the lambda AND the scaler params to invert correctly.
        if name == "PowerTransformY" and hasattr(tf, "power_transforms"):
            try:
                power_params = {}
                for k, v in tf.power_transforms.items():
                    entry = {"lambdas": v.lambdas_.tolist()}
                    if hasattr(v, "_scaler"):
                        entry["scaler_mean"] = v._scaler.mean_.tolist()
                        entry["scaler_scale"] = v._scaler.scale_.tolist()
                    power_params[k] = entry
                info["power_params"] = power_params
            except AttributeError:
                pass

        y_transforms.append(info)

    return y_transforms if y_transforms else None


def _extract_parameter_constraints(search_space: Any) -> list[dict] | None:
    """Extract parameter constraints from Ax search space.

    All Ax parameter constraints reduce to the linear form: Σ(w_i * x_i) ≤ bound.
    - OrderConstraint: lower_param - upper_param ≤ 0
    - SumConstraint: Σ(param_i) ≤ bound (or ≥)
    - ParameterConstraint: general linear

    Returns a list of constraint dicts, or None if no constraints.
    """
    constraints_list = getattr(search_space, "parameter_constraints", None)
    if not constraints_list:
        return None

    result = []
    for c in constraints_list:
        cls_name = type(c).__name__

        # Determine constraint type
        if cls_name == "OrderConstraint":
            ctype = "order"
        elif cls_name == "SumConstraint":
            ctype = "sum"
        else:
            ctype = "linear"

        # constraint_dict: {param_name: weight}
        constraint_dict = {}
        if hasattr(c, "constraint_dict"):
            constraint_dict = {k: float(v) for k, v in c.constraint_dict.items()}

        # Determine op: Ax uses ComparisonOp.LEQ (0) and ComparisonOp.GEQ (1)
        op_str = "GEQ" if getattr(c.op, "name", "") == "GEQ" else "LEQ"

        result.append({
            "type": ctype,
            "constraint_dict": constraint_dict,
            "bound": float(c.bound),
            "op": op_str,
        })

    return result if result else None


def _extract_optimization_config(experiment: Any) -> dict | None:
    """Extract optimization config (objectives + constraints) from Ax experiment.

    Returns an OptimizationConfig dict, or None if no optimization config is set.
    """
    oc = getattr(experiment, "optimization_config", None)
    if oc is None:
        return None

    objective = oc.objective
    objectives = []

    # Multi-objective: objective.objectives is a list
    if hasattr(objective, "objectives"):
        for obj in objective.objectives:
            objectives.append({
                "name": obj.metric.name,
                "minimize": obj.minimize,
            })
    else:
        # Single-objective
        objectives.append({
            "name": objective.metric.name,
            "minimize": objective.minimize,
        })

    result: dict[str, Any] = {"objectives": objectives}

    # Outcome constraints
    if hasattr(oc, "outcome_constraints") and oc.outcome_constraints:
        constraints = []
        for c in oc.outcome_constraints:
            # ComparisonOp.LEQ = 0, ComparisonOp.GEQ = 1
            op_str = "GEQ" if c.op.name == "GEQ" else "LEQ"
            entry: dict[str, Any] = {
                "name": c.metric.name,
                "bound": float(c.bound),
                "op": op_str,
            }
            if getattr(c, "relative", False):
                entry["relative"] = True
            constraints.append(entry)
        result["outcome_constraints"] = constraints

    # Objective thresholds (MOO reference points)
    if hasattr(oc, "objective_thresholds") and oc.objective_thresholds:
        thresholds = []
        for t in oc.objective_thresholds:
            op_str = "GEQ" if getattr(t.op, "name", "") == "GEQ" else "LEQ"
            entry = {
                "name": t.metric.name,
                "bound": float(t.bound),
                "op": op_str,
            }
            if getattr(t, "relative", False):
                entry["relative"] = True
            thresholds.append(entry)
        result["objective_thresholds"] = thresholds

    return result


def _extract_observations(experiment: Any) -> list[dict] | None:
    """Extract observed trial data from an Ax experiment.

    Returns a list of observation dicts [{arm_name, parameters, metrics,
    trial_index?, trial_status?, generation_method?}],
    or None if no data is available.
    """
    try:
        data = experiment.lookup_data()
    except Exception:
        return None

    df = getattr(data, "df", None)
    if df is None or df.empty:
        return None

    # Build arm_name → (parameters, trial_index, trial_status, generation_method)
    arm_params: dict[str, dict[str, float]] = {}
    arm_trial_info: dict[str, dict[str, Any]] = {}
    for trial in experiment.trials.values():
        trial_idx = trial.index
        trial_status = trial.status.name if hasattr(trial, "status") else None
        gen_method = None
        if hasattr(trial, "generator_runs") and trial.generator_runs:
            gen_run = trial.generator_runs[0]
            gen_method = getattr(gen_run, "_model_key", None)
        for arm in trial.arms:
            if arm.name not in arm_params:
                arm_params[arm.name] = {
                    k: float(v) for k, v in arm.parameters.items()
                }
                arm_trial_info[arm.name] = {
                    "trial_index": trial_idx,
                    "trial_status": trial_status,
                    "generation_method": gen_method,
                }

    # Group by arm_name
    observations = []
    for arm_name, group in df.groupby("arm_name"):
        if arm_name not in arm_params:
            continue
        metrics: dict[str, dict[str, float]] = {}
        for _, row in group.iterrows():
            entry: dict[str, float] = {"mean": float(row["mean"])}
            if "sem" in row and row["sem"] is not None and row["sem"] == row["sem"]:
                entry["sem"] = float(row["sem"])
            metrics[row["metric_name"]] = entry
        obs: dict[str, Any] = {
            "arm_name": str(arm_name),
            "parameters": arm_params[arm_name],
            "metrics": metrics,
        }
        # Add trial metadata if available
        info = arm_trial_info.get(str(arm_name), {})
        if info.get("trial_index") is not None:
            obs["trial_index"] = info["trial_index"]
        if info.get("trial_status"):
            obs["trial_status"] = info["trial_status"]
        if info.get("generation_method"):
            obs["generation_method"] = info["generation_method"]
        observations.append(obs)

    return observations if observations else None


def _extract_candidates(experiment: Any, generation_strategy: Any) -> list[dict] | None:
    """Extract unevaluated candidate arms from the generation strategy.

    Returns a list of candidate dicts [{arm_name?, parameters, trial_index?,
    generation_method?}], or None if no candidates found.
    """
    candidates = []
    for trial in experiment.trials.values():
        status_name = trial.status.name if hasattr(trial, "status") else ""
        if status_name not in ("CANDIDATE", "STAGED"):
            continue
        gen_method = None
        if hasattr(trial, "generator_runs") and trial.generator_runs:
            gen_run = trial.generator_runs[0]
            gen_method = getattr(gen_run, "_model_key", None)
        for arm in trial.arms:
            candidate: dict[str, Any] = {
                "parameters": {k: float(v) for k, v in arm.parameters.items()},
            }
            if arm.name:
                candidate["arm_name"] = arm.name
            candidate["trial_index"] = trial.index
            if gen_method:
                candidate["generation_method"] = gen_method
            candidates.append(candidate)

    return candidates if candidates else None


def export_experiment(
    experiment: Any,
    generation_strategy: Any | None = None,
    trial_index: int | None = None,
) -> dict:
    """Export GP model state from an Ax Experiment as ExperimentState.

    Args:
        experiment: Ax Experiment object.
        generation_strategy: GenerationStrategy (if not on experiment).
        trial_index: Specific trial to use as model context.

    Returns:
        ExperimentState dict: {search_space, model_state, name?, description?,
        outcome_names, status_quo?, adapter_transforms?}
    """
    gs = generation_strategy or getattr(experiment, "generation_strategy", None)
    if gs is None:
        raise ValueError("No GenerationStrategy found")

    # Get the adapter (Ax 1.4+: gs.adapter, Ax 1.2+: gs.model)
    adapter = getattr(gs, "adapter", None) or getattr(gs, "model", None)
    if adapter is None:
        raise ValueError("GenerationStrategy has no fitted model")

    # Get the BoTorch model from the adapter
    botorch_model = getattr(adapter, "botorch_model", None)
    if botorch_model is None:
        # Fallback for older Ax versions
        botorch_model = adapter.model.surrogate.model
    model_state = export_botorch_model(botorch_model)

    # Compose UnitX into input_transform so axjs can predict on raw param values.
    # Ax's adapter applies UnitX (maps raw → [0,1]) before the model sees data,
    # so train_X in the model is in UnitX space. We need to un-UnitX train_X and
    # adjust input_transform to accept raw inputs.
    _compose_unitx_if_needed(adapter, model_state, experiment.search_space)

    search_space_info = _get_search_space_info(experiment.search_space)

    # Export parameter constraints (sum, order, linear)
    param_constraints = _extract_parameter_constraints(experiment.search_space)
    if param_constraints:
        search_space_info["parameter_constraints"] = param_constraints

    result: dict[str, Any] = {
        "search_space": search_space_info,
        "model_state": model_state,
    }

    # Experiment name and description
    if hasattr(experiment, "name") and experiment.name:
        result["name"] = experiment.name
    if hasattr(experiment, "description") and experiment.description:
        result["description"] = experiment.description

    # Outcome names
    outcome_names = _get_outcome_names(experiment, model_state)
    result["outcome_names"] = outcome_names

    # Status quo
    if hasattr(experiment, "status_quo") and experiment.status_quo is not None:
        sq_arm = experiment.status_quo
        if hasattr(sq_arm, "parameters"):
            param_names = [p.name for p in experiment.search_space.parameters.values()]
            sq_point = [float(sq_arm.parameters.get(n, 0)) for n in param_names]
            result["status_quo"] = {"point": sq_point}

    # Export adapter-level Y-transforms (LogY, BilogY, etc.)
    adapter_transforms = _extract_adapter_transforms(adapter)
    if adapter_transforms:
        result["adapter_transforms"] = adapter_transforms

    # Export optimization config (objectives + constraints)
    optimization_config = _extract_optimization_config(experiment)
    if optimization_config:
        result["optimization_config"] = optimization_config

    # Export observations (trial data)
    observations = _extract_observations(experiment)
    if observations:
        result["observations"] = observations

    # Export candidate arms (unevaluated trials)
    candidates = _extract_candidates(experiment, gs)
    if candidates:
        result["candidates"] = candidates

    return result


def _get_outcome_names(experiment: Any, model_state: dict) -> list[str]:
    """Determine outcome names from experiment or model state."""
    # Try optimization_config metric names
    if hasattr(experiment, "optimization_config") and experiment.optimization_config is not None:
        oc = experiment.optimization_config
        names = []
        if hasattr(oc, "objective") and hasattr(oc.objective, "metric_names"):
            names.extend(oc.objective.metric_names)
        if hasattr(oc, "outcome_constraints"):
            for c in oc.outcome_constraints:
                if hasattr(c, "metric") and c.metric.name not in names:
                    names.append(c.metric.name)
        if names:
            return names

    # Fall back to ModelListGP outcome_names
    if model_state.get("model_type") == "ModelListGP":
        return model_state.get("outcome_names", [f"y{i}" for i in range(len(model_state.get("models", [])))])

    return ["y"]


def export_client(client: Any) -> dict:
    """Export from ax.api.Client (recommended entry point).

    Args:
        client: An ax.api.Client instance with a fitted model.

    Returns:
        ExperimentState dict.
    """
    return export_experiment(
        client._experiment,
        client._generation_strategy,
    )


def export_ax_client(ax_client: Any) -> dict:
    """Deprecated: use export_client() with ax.api.Client instead."""
    import warnings
    warnings.warn(
        "export_ax_client() is deprecated. Use export_client() with ax.api.Client.",
        DeprecationWarning,
        stacklevel=2,
    )
    return export_experiment(
        ax_client.experiment,
        ax_client.generation_strategy,
    )


def to_json(state: dict, path: str | None = None, indent: int = 2) -> str:
    """Serialize state to JSON string, optionally writing to file."""
    s = json.dumps(state, indent=indent)
    if path:
        with open(path, "w") as f:
            f.write(s)
    return s
