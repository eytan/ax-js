#!/usr/bin/env python3
"""Build pre-populated Jupyter demo notebook with ax-js visualizations."""

from __future__ import annotations
import json, sys
from pathlib import Path
import nbformat
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell

ROOT = Path(__file__).parent.parent
DIST = ROOT / "dist"
FIXTURES = ROOT / "test" / "fixtures"
sys.path.insert(0, str(ROOT / "python"))
from axjs_jupyter import _load_bundles, _render


def _load_fixture(name="penicillin_modellist.json"):
    data = json.loads((FIXTURES / name).read_text())
    return data["experiment"] if "experiment" in data else data


def _output(html):
    return nbformat.v4.new_output(
        output_type="display_data", data={"text/html": html}
    )


def _viz_cell(code, state, viz_code, **kw):
    cell = new_code_cell(code)
    html = _render(state, viz_code, **kw)
    cell.outputs = [_output(html)]
    return cell


def build_notebook():
    state = _load_fixture()
    outcomes = state.get("outcome_names", ["y"])

    nb = new_notebook()
    nb.metadata.kernelspec = {
        "display_name": "Python 3", "language": "python", "name": "python3"
    }

    nb.cells.append(new_markdown_cell(
        "# ax-js Jupyter Demo\n\n"
        "Interactive GP diagnostics. Pre-populated outputs — no execution needed.\n\n"
        f"**Fixture**: Penicillin ({len(outcomes)} outcomes: {', '.join(outcomes)})"
    ))

    nb.cells.append(new_code_cell(
        "import sys; sys.path.insert(0, 'python')\n"
        "import json\n"
        "from axjs_jupyter import (\n"
        "    slice_plot, response_surface,\n"
        "    feature_importance, cross_validation, optimization_trace,\n"
        ")\n\n"
        "state = json.load(open('test/fixtures/penicillin_modellist.json'))['experiment']"
    ))

    nb.cells.append(new_markdown_cell("## 1D Slice Plots"))
    nb.cells.append(_viz_cell(
        "slice_plot(state)", state,
        'Ax.viz.renderSlicePlot(c,p,{interactive:true});',
        height="600px"))

    nb.cells.append(new_markdown_cell("## 2D Response Surface"))
    nb.cells.append(_viz_cell(
        "response_surface(state)", state,
        'Ax.viz.renderResponseSurface(c,p,{interactive:true,width:460,height:460});',
        width="500px", height="520px"))

    nb.cells.append(new_markdown_cell("## Feature Importance"))
    nb.cells.append(_viz_cell(
        "feature_importance(state)", state,
        'Ax.viz.renderFeatureImportance(c,p,{interactive:true});',
        width="500px", height="280px"))

    nb.cells.append(new_markdown_cell("## Leave-One-Out Cross-Validation"))
    nb.cells.append(_viz_cell(
        "cross_validation(state)", state,
        'Ax.viz.renderCrossValidation(c,p,{interactive:true,width:460,height:460});',
        width="500px", height="500px"))

    nb.cells.append(new_markdown_cell("## Optimization Trace"))
    nb.cells.append(_viz_cell(
        "optimization_trace(state)", state,
        'Ax.viz.renderOptimizationTrace(c,p,{interactive:true,width:660,height:380});',
        width="700px", height="420px"))

    nb.cells.append(new_markdown_cell(
        "---\nAll visualizations by [ax-js](https://github.com/eytan/ax-js-platform)."))

    return nb


def main():
    nb = build_notebook()
    nb_path = ROOT / "demo" / "jupyter-demo.ipynb"
    nbformat.write(nb, str(nb_path))
    print(f"Notebook: {nb_path} ({nb_path.stat().st_size // 1024}KB)")

    try:
        from nbconvert import HTMLExporter
        exporter = HTMLExporter()
        exporter.template_name = "classic"
        body, _ = exporter.from_notebook_node(nb)
        html_path = ROOT / "demo" / "jupyter-demo.html"
        html_path.write_text(body)
        print(f"HTML: {html_path} ({html_path.stat().st_size // 1024}KB)")
    except ImportError:
        print("nbconvert not available")


if __name__ == "__main__":
    main()
