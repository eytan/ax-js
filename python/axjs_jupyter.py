"""
Jupyter notebook integration for ax-js visualizations.

Renders interactive GP visualizations directly in Jupyter cells using
IPython.display.HTML. Bundles are inlined into the cell output, so
notebooks work offline and can be shared as standalone HTML files.

Usage:
    from axjs_jupyter import setup_axjs, display_slice_plot, display_response_surface

    setup_axjs()  # Load bundles once (like bokeh.io.output_notebook())

    # From an Ax Client
    display_response_surface(client, outcome="accuracy")

    # Or from an exported ExperimentState dict
    from axjs_export import export_client
    state = export_client(client)
    display_response_surface(state)

Requires: IPython (always available in Jupyter environments)
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Optional

_DIST_DIR = Path(__file__).parent / "../dist"
_AX_JS: Optional[str] = None
_AX_VIZ_JS: Optional[str] = None
_BUNDLES_LOADED = False


def _load_bundles() -> tuple[str, str]:
    """Lazily read the JS bundles from dist/."""
    global _AX_JS, _AX_VIZ_JS
    if _AX_JS is None:
        _AX_JS = (_DIST_DIR / "ax.js").read_text()
    if _AX_VIZ_JS is None:
        _AX_VIZ_JS = (_DIST_DIR / "ax-viz.js").read_text()
    return _AX_JS, _AX_VIZ_JS


def _resolve_state(client_or_state: Any) -> dict:
    """Accept either an Ax Client or an ExperimentState dict."""
    if isinstance(client_or_state, dict):
        return client_or_state
    # Assume it's an Ax Client — try to export
    try:
        from axjs_export import export_client
        return export_client(client_or_state)
    except ImportError:
        raise ImportError(
            "axjs_export.py is required to export from an Ax Client. "
            "Copy python/axjs_export.py and python/_extraction.py to your project."
        )


def _unique_id() -> str:
    return f"axjs_{uuid.uuid4().hex[:8]}"


def setup_axjs() -> None:
    """Load ax-js bundles into the notebook. Call once per session.

    Similar to `bokeh.io.output_notebook()`. Subsequent visualization
    calls will use the already-loaded bundles.
    """
    from IPython.display import display, HTML

    global _BUNDLES_LOADED
    ax_js, viz_js = _load_bundles()
    display(HTML(
        f"<script>\n{ax_js}\n{viz_js}\n</script>"
        '<div style="color:#888;font-size:12px">ax-js loaded.</div>'
    ))
    _BUNDLES_LOADED = True


def _render_cell(state_json: str, viz_code: str, container_id: str,
                 width: str = "100%", height: str = "400px") -> str:
    """Build an HTML string for a Jupyter cell output."""
    ax_js, viz_js = _load_bundles()
    # Only inline bundles if setup_axjs() wasn't called
    bundle_script = "" if _BUNDLES_LOADED else f"if(!window.Ax){{{ax_js}\n{viz_js}}}"

    return f"""
    <div id="{container_id}" style="width:{width};height:{height};position:relative;
         background:#0f0f11;border-radius:8px;overflow:hidden"></div>
    <script>
    (function() {{
      {bundle_script}
      var state = {state_json};
      var container = document.getElementById("{container_id}");
      var predictor = new Ax.Predictor(state);
      {viz_code}
    }})();
    </script>
    """


def display_feature_importance(
    client_or_state: Any,
    outcome: Optional[str] = None,
    width: str = "100%",
    height: str = "300px",
) -> None:
    """Render a feature importance bar chart in a Jupyter cell.

    Args:
        client_or_state: An ax.api.Client or ExperimentState dict.
        outcome: Outcome name. Defaults to first outcome.
        width: CSS width of the container.
        height: CSS height of the container.
    """
    from IPython.display import display, HTML

    state = _resolve_state(client_or_state)
    cid = _unique_id()
    outcome_js = json.dumps(outcome) if outcome else "predictor.outcomeNames[0]"

    viz_code = f"Ax.viz.renderFeatureImportance(container, predictor, {{ outcome: {outcome_js} }});"
    html = _render_cell(json.dumps(state), viz_code, cid, width, height)
    display(HTML(html))


def display_cross_validation(
    client_or_state: Any,
    outcome: Optional[str] = None,
    width: str = "450px",
    height: str = "450px",
) -> None:
    """Render a LOO cross-validation scatter plot in a Jupyter cell.

    Args:
        client_or_state: An ax.api.Client or ExperimentState dict.
        outcome: Outcome name. Defaults to first outcome.
        width: CSS width of the container.
        height: CSS height of the container.
    """
    from IPython.display import display, HTML

    state = _resolve_state(client_or_state)
    cid = _unique_id()
    outcome_js = json.dumps(outcome) if outcome else "predictor.outcomeNames[0]"

    viz_code = f"""
    Ax.viz.renderCrossValidation(container, predictor, {{
      outcome: {outcome_js},
      width: container.offsetWidth || 400,
      height: container.offsetHeight || 400
    }});
    """
    html = _render_cell(json.dumps(state), viz_code, cid, width, height)
    display(HTML(html))


def display_optimization_trace(
    client_or_state: Any,
    outcome: Optional[str] = None,
    width: str = "700px",
    height: str = "400px",
) -> None:
    """Render an optimization trace in a Jupyter cell.

    Args:
        client_or_state: An ax.api.Client or ExperimentState dict.
        outcome: Outcome name. Defaults to first outcome.
        width: CSS width of the container.
        height: CSS height of the container.
    """
    from IPython.display import display, HTML

    state = _resolve_state(client_or_state)
    cid = _unique_id()
    outcome_js = json.dumps(outcome) if outcome else "predictor.outcomeNames[0]"

    viz_code = f"""
    Ax.viz.renderOptimizationTrace(container, predictor, {{
      outcome: {outcome_js},
      width: container.offsetWidth || 650,
      height: container.offsetHeight || 350
    }});
    """
    html = _render_cell(json.dumps(state), viz_code, cid, width, height)
    display(HTML(html))


def display_all_diagnostics(
    client_or_state: Any,
    outcome: Optional[str] = None,
) -> None:
    """Render feature importance, cross-validation, and optimization trace.

    Convenience function that displays all three diagnostic visualizations
    for a single outcome, stacked vertically.
    """
    display_feature_importance(client_or_state, outcome)
    display_cross_validation(client_or_state, outcome)
    display_optimization_trace(client_or_state, outcome)
