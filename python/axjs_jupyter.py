"""
Jupyter notebook integration for ax-js visualizations.

Each plot function accepts an Ax Client (or ExperimentState dict) and
renders an interactive visualization in the current Jupyter cell.
No setup or global state required.

Usage:
    from axjs_jupyter import slice_plot, response_surface

    slice_plot(client)
    response_surface(client, outcome="accuracy")
    feature_importance(client)
    cross_validation(client)
    optimization_trace(client)

Requires: IPython, ax-platform (for Client export)
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Optional

_DIST_DIR = Path(__file__).parent / "../dist"
_AX_JS: Optional[str] = None
_AX_VIZ_JS: Optional[str] = None


def _load_bundles() -> tuple[str, str]:
    global _AX_JS, _AX_VIZ_JS
    if _AX_JS is None:
        _AX_JS = (_DIST_DIR / "ax.js").read_text()
    if _AX_VIZ_JS is None:
        _AX_VIZ_JS = (_DIST_DIR / "ax-viz.js").read_text()
    return _AX_JS, _AX_VIZ_JS


def _export(client_or_state: Any) -> dict:
    """Export an Ax Client to ExperimentState, or pass through a dict."""
    if isinstance(client_or_state, dict):
        return client_or_state
    if isinstance(client_or_state, (str, Path)):
        data = json.loads(Path(client_or_state).read_text())
        return data.get("experiment", data)
    from axjs_export import export_client
    return export_client(client_or_state)


def _render(client_or_state: Any, viz_code: str,
            width: str = "100%", height: str = "400px") -> str:
    """Build self-contained HTML for a single visualization cell."""
    state = _export(client_or_state)
    state_json = json.dumps(state)
    ax_js, viz_js = _load_bundles()
    cid = f"axjs_{uuid.uuid4().hex[:8]}"

    return (
        f'<div id="{cid}" style="width:{width};min-height:{height};'
        f'position:relative;background:#0f0f11;border-radius:8px;'
        f'overflow:visible;padding:12px"></div>'
        f'<script>(function(){{'
        f'if(!window.Ax){{{ax_js}\n{viz_js}}}'
        f'var c=document.getElementById("{cid}");'
        f'var p=new Ax.Predictor({state_json});'
        f'{viz_code}'
        f'}})()</script>'
    )


def _show(html: str) -> None:
    from IPython.display import display, HTML
    display(HTML(html))


def _opts(outcome: Optional[str], extra: str = "") -> str:
    parts = ["interactive:true"]
    if outcome:
        parts.append(f'outcome:"{outcome}"')
    if extra:
        parts.append(extra)
    return ",".join(parts)


# ── Plot functions ─────────────────────────────────────────────────────────


def slice_plot(client_or_state: Any, *, outcome: Optional[str] = None) -> None:
    """1D posterior slices for each parameter, sorted by importance.

    Args:
        client_or_state: ``ax.api.Client`` or ``ExperimentState`` dict.
        outcome: Default outcome to display. If None, uses first outcome.
    """
    _show(_render(client_or_state,
                  f"Ax.viz.renderSlicePlot(c,p,{{{_opts(outcome)}}});",
                  height="600px"))


def response_surface(client_or_state: Any, *, outcome: Optional[str] = None) -> None:
    """2D posterior mean heatmap, auto-selects most important dimensions.

    Args:
        client_or_state: ``ax.api.Client`` or ``ExperimentState`` dict.
        outcome: Default outcome to display.
    """
    _show(_render(client_or_state,
                  f"Ax.viz.renderResponseSurface(c,p,{{{_opts(outcome, 'width:460,height:460')}}});",
                  width="500px", height="520px"))


def feature_importance(client_or_state: Any, *, outcome: Optional[str] = None) -> None:
    """Dimension importance from kernel lengthscales.

    Args:
        client_or_state: ``ax.api.Client`` or ``ExperimentState`` dict.
        outcome: Default outcome to display.
    """
    _show(_render(client_or_state,
                  f"Ax.viz.renderFeatureImportance(c,p,{{{_opts(outcome)}}});",
                  width="500px", height="280px"))


def cross_validation(client_or_state: Any, *, outcome: Optional[str] = None) -> None:
    """LOO cross-validation: observed vs predicted with CI.

    Args:
        client_or_state: ``ax.api.Client`` or ``ExperimentState`` dict.
        outcome: Default outcome to display.
    """
    _show(_render(client_or_state,
                  f"Ax.viz.renderCrossValidation(c,p,{{{_opts(outcome, 'width:460,height:460')}}});",
                  width="500px", height="500px"))


def optimization_trace(client_or_state: Any, *, outcome: Optional[str] = None) -> None:
    """Trial progression with best-so-far tracking.

    Args:
        client_or_state: ``ax.api.Client`` or ``ExperimentState`` dict.
        outcome: Default outcome to display.
    """
    _show(_render(client_or_state,
                  f"Ax.viz.renderOptimizationTrace(c,p,{{{_opts(outcome, 'width:660,height:380')}}});",
                  width="700px", height="420px"))


def all_diagnostics(client_or_state: Any, *, outcome: Optional[str] = None) -> None:
    """All plots: slice, surface, importance, CV, trace."""
    slice_plot(client_or_state, outcome=outcome)
    response_surface(client_or_state, outcome=outcome)
    feature_importance(client_or_state, outcome=outcome)
    cross_validation(client_or_state, outcome=outcome)
    optimization_trace(client_or_state, outcome=outcome)
