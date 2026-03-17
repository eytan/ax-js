#!/usr/bin/env python3
"""
Build and export an ax-js demo notebook as HTML.

Creates a Jupyter notebook that demonstrates all ax-js diagnostic
visualizations using a real fixture, with pre-populated outputs.
Exports to standalone HTML that works in any browser.

Usage:
    python python/build_demo_notebook.py
    # or: npm run build:notebook

Output:
    demo/ax-js-demo.ipynb  — notebook with pre-populated outputs
    demo/ax-js-demo.html   — standalone HTML export
"""

from __future__ import annotations

import json
from pathlib import Path

import nbformat
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell

ROOT = Path(__file__).parent.parent
DIST = ROOT / "dist"
FIXTURES = ROOT / "test" / "fixtures"


def _load_fixture(name: str = "penicillin_modellist.json") -> dict:
    data = json.loads((FIXTURES / name).read_text())
    return data["experiment"] if "experiment" in data else data


def _viz_html(viz_code: str, cid: str, width: str = "100%",
              height: str = "400px", title: str = "") -> str:
    """Build HTML for a viz cell (bundles + data loaded in setup cell)."""
    title_html = (
        f'<div style="color:#aaa;font-size:14px;font-weight:500;'
        f'margin-bottom:8px">{title}</div>'
        if title else ""
    )
    return (
        f"{title_html}"
        f'<div id="{cid}" style="width:{width};min-height:{height};'
        f'position:relative;background:#0f0f11;border-radius:8px;'
        f'overflow:visible;padding:12px"></div>'
        f"<script>(function(){{"
        f"var c=document.getElementById('{cid}');"
        f"var p=new Ax.Predictor(window.__AXJS_STATE__);"
        f"{viz_code}"
        f"}})()</script>"
    )


def _output(html: str):
    return nbformat.v4.new_output(
        output_type="display_data", data={"text/html": html}
    )


def _viz_cell(viz_code: str, cid: str, **kw) -> nbformat.NotebookNode:
    html = _viz_html(viz_code, cid, **kw)
    cell = new_code_cell(f"display(HTML('''{html}'''))")
    cell.outputs = [_output(html)]
    return cell


def build_notebook() -> nbformat.NotebookNode:
    ax_js = (DIST / "ax.js").read_text()
    viz_js = (DIST / "ax-viz.js").read_text()
    state = _load_fixture("penicillin_modellist.json")
    state_json = json.dumps(state)
    outcomes = state.get("outcome_names", ["y"])

    nb = new_notebook()
    nb.metadata.kernelspec = {
        "display_name": "Python 3", "language": "python", "name": "python3"
    }

    # Title
    nb.cells.append(new_markdown_cell(
        "# ax-js Visualization Demo\n\n"
        "Interactive GP diagnostics rendered client-side. "
        "All predictions computed in JavaScript — no Python backend required.\n\n"
        f"**Fixture**: Penicillin benchmark ({len(outcomes)} outcomes: "
        f"{', '.join(outcomes)})\n\n"
        "Export with `jupyter nbconvert --to html` for a standalone page."
    ))

    # Setup cell — loads bundles + fixture data ONCE
    setup_html = (
        f"<script>\n{ax_js}\n{viz_js}\n"
        f"window.__AXJS_STATE__={state_json};\n"
        f"</script>"
        '<div style="color:#888;font-size:12px">'
        f"ax-js loaded. {len(outcomes)} outcomes available.</div>"
    )
    setup_cell = new_code_cell(
        "from IPython.display import display, HTML\n\n"
        "# Load ax-js bundles and fixture data\n"
        "display(HTML(setup_html))"
    )
    setup_cell.outputs = [_output(setup_html)]
    nb.cells.append(setup_cell)

    # Slice plots (interactive: outcome selector + sliders)
    nb.cells.append(new_markdown_cell(
        "## 1D Slice Plots\n"
        "Posterior mean ± 2σ along each parameter dimension. "
        "Use the sliders to adjust the fixed values of non-plotted dimensions."
    ))
    nb.cells.append(_viz_cell(
        'Ax.viz.renderSlicePlot(c,p,{interactive:true});',
        "sp_0", height="600px",
    ))

    # Response surface (interactive: axis selectors + sliders)
    nb.cells.append(new_markdown_cell(
        "## 2D Response Surface\n"
        "Posterior mean heatmap with training points. "
        "Select axes and adjust non-plotted dimensions with sliders."
    ))
    nb.cells.append(_viz_cell(
        'Ax.viz.renderResponseSurface(c,p,{interactive:true,width:400,height:400});',
        "rs_0", width="500px", height="520px",
    ))

    # Feature importance (interactive: outcome selector + tooltips)
    nb.cells.append(new_markdown_cell(
        "## Feature Importance\n"
        "Dimension importance from kernel lengthscales (shorter = more important)."
    ))
    nb.cells.append(_viz_cell(
        'Ax.viz.renderFeatureImportance(c,p,{interactive:true});',
        "fi_0", height="280px",
    ))

    # Cross-validation (interactive: outcome selector + tooltips)
    nb.cells.append(new_markdown_cell(
        "## Leave-One-Out Cross-Validation\n"
        "Observed vs predicted with ±2σ confidence intervals and R²."
    ))
    nb.cells.append(_viz_cell(
        'Ax.viz.renderCrossValidation(c,p,{interactive:true,'
        'width:c.offsetWidth||400,height:c.offsetHeight||380});',
        "cv_0", width="450px", height="450px",
    ))

    # Optimization trace (interactive: outcome selector + tooltips)
    nb.cells.append(new_markdown_cell(
        "## Optimization Trace\n"
        "Trial progression with running best-so-far."
    ))
    nb.cells.append(_viz_cell(
        'Ax.viz.renderOptimizationTrace(c,p,{interactive:true,'
        'width:c.offsetWidth||650,height:c.offsetHeight||350});',
        "ot_0", width="700px", height="420px",
    ))

    # About
    nb.cells.append(new_markdown_cell(
        "---\n## About\n\n"
        "All visualizations rendered by "
        "[ax-js](https://github.com/eytan/ax-js-platform). "
        "GP predictions computed entirely in JavaScript from an exported "
        "BoTorch model state.\n\n"
        "**Bundle sizes**: ax.js (70KB) + ax-viz.js (20KB) = 90KB total."
    ))

    return nb


def main():
    nb = build_notebook()
    nb_path = ROOT / "demo" / "ax-js-demo.ipynb"
    nbformat.write(nb, str(nb_path))
    print(f"Notebook: {nb_path} ({nb_path.stat().st_size // 1024}KB)")

    try:
        from nbconvert import HTMLExporter
        exporter = HTMLExporter()
        exporter.template_name = "classic"
        body, _ = exporter.from_notebook_node(nb)
        html_path = ROOT / "demo" / "ax-js-demo.html"
        html_path.write_text(body)
        print(f"HTML: {html_path} ({html_path.stat().st_size // 1024}KB)")

        # Verify
        for tag in ["sp_0", "rs_0", "fi_0", "cv_0", "ot_0", "Ax.Predictor", "renderSlicePlot", "renderResponseSurface"]:
            assert tag in body, f"Missing: {tag}"
        print("Verification: all expected content present")
    except ImportError:
        print("nbconvert not available — run: jupyter nbconvert --to html", nb_path)


if __name__ == "__main__":
    main()
