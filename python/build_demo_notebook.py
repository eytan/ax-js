#!/usr/bin/env python3
"""
Build pre-populated Jupyter demo notebook.

Creates an Ax experiment, runs BO, exports the model, and generates
a notebook with pre-populated visualization outputs. The notebook
works without execution — just open and see the plots.

Usage:
    python python/build_demo_notebook.py
"""

from __future__ import annotations
import json, sys
from pathlib import Path
import nbformat
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "python"))
from axjs_jupyter import _load_bundles, _render


def _output(html):
    return nbformat.v4.new_output(
        output_type="display_data", data={"text/html": html}
    )


def _generate_experiment_state():
    """Run a real Ax experiment and export the state."""
    from ax.api import Client
    from ax.api.configs import RangeParameterConfig
    from botorch.test_functions.multi_objective import DTLZ2
    import torch

    dim = 5
    client = Client()
    client.configure_experiment(
        name="dtlz2_demo",
        parameters=[
            RangeParameterConfig(name=f"x{i+1}", parameter_type="float", bounds=(0.0, 1.0))
            for i in range(dim)
        ],
    )
    client.configure_optimization(objective="f0, f1")

    fn = DTLZ2(dim=dim, num_objectives=2, negate=True)
    for i in range(30):
        trials = client.get_next_trials(max_trials=1)
        for trial_index, params in trials.items():
            x = torch.tensor([[params[f"x{j+1}"] for j in range(dim)]])
            y = fn(x).squeeze()
            client.complete_trial(trial_index=trial_index, raw_data={
                "f0": y[0].item(),
                "f1": y[1].item(),
            })

    from axjs_export import export_client
    return export_client(client)


def _viz_cell(code, state, viz_code, **kw):
    cell = new_code_cell(code)
    html = _render(state, viz_code, **kw)
    cell.outputs = [_output(html)]
    return cell


def build_notebook():
    print("Running Ax experiment (30 DTLZ2 5D MOO trials)...")
    state = _generate_experiment_state()
    ms = state['model_state']
    n_train = len(ms.get('train_X', ms.get('models', [{}])[0].get('train_X', [])))
    print(f"Exported: {n_train} training points, {ms['model_type']}")

    nb = new_notebook()
    nb.metadata.kernelspec = {
        "display_name": "Python 3", "language": "python", "name": "python3"
    }

    nb.cells.append(new_markdown_cell(
        "# ax-js Jupyter Demo\n\n"
        "This notebook demonstrates interactive GP (Gaussian Process) model diagnostics "
        "for a **DTLZ2 multi-objective experiment** — a standard benchmark with 5 input "
        "parameters and 2 objectives.\n\n"
        "All plots are rendered client-side using [ax-js](https://github.com/eytan/ax-js), "
        "a TypeScript library that runs BoTorch GP predictions directly in the browser. "
        "The model hyperparameters are exported from Ax/BoTorch and loaded into a JavaScript "
        "predictor — no Python server needed after export.\n\n"
        "**Pre-populated outputs** — you can view results without re-running. Or execute "
        "the cells to regenerate from scratch."
    ))

    # Experiment setup cell
    nb.cells.append(new_code_cell(
        "from ax.api import Client\n"
        "from ax.api.configs import RangeParameterConfig\n"
        "from botorch.test_functions.multi_objective import DTLZ2\n"
        "import torch\n"
        "\n"
        "dim = 5\n"
        "client = Client()\n"
        "client.configure_experiment(\n"
        "    name='dtlz2_demo',\n"
        "    parameters=[\n"
        "        RangeParameterConfig(name=f'x{i+1}', parameter_type='float', bounds=(0.0, 1.0))\n"
        "        for i in range(dim)\n"
        "    ],\n"
        ")\n"
        "client.configure_optimization(objective='f0, f1')\n"
        "\n"
        "fn = DTLZ2(dim=dim, num_objectives=2, negate=True)\n"
        "for i in range(30):\n"
        "    trials = client.get_next_trials(max_trials=1)\n"
        "    for trial_index, params in trials.items():\n"
        "        x = torch.tensor([[params[f'x{j+1}'] for j in range(dim)]])\n"
        "        y = fn(x).squeeze()\n"
        "        client.complete_trial(trial_index=trial_index, raw_data={'f0': y[0].item(), 'f1': y[1].item()})\n"
        "\n"
        "print(f'Completed 30 trials')"
    ))

    # Import cell
    nb.cells.append(new_code_cell(
        "import sys; sys.path.insert(0, 'python')\n"
        "from axjs_jupyter import (\n"
        "    slice_plot, response_surface,\n"
        "    feature_importance, cross_validation, optimization_trace,\n"
        ")"
    ))

    nb.cells.append(new_markdown_cell(
        "## 1D Slice Plots\n\n"
        "Each subplot shows the GP posterior prediction (mean ± confidence band) as a single "
        "parameter varies, with all other parameters held fixed. This lets you see how each "
        "input individually affects the selected outcome.\n\n"
        "**How dimensions are chosen:** Parameters are sorted by *feature importance* "
        "(derived from the GP kernel's lengthscales — shorter lengthscale = more important). "
        "The most influential parameters appear first.\n\n"
        "**Reading the plot:** The blue curve is the posterior mean prediction. The shaded band "
        "shows the 95% confidence interval. Training points are shown as dots — hover over them "
        "to highlight their nearest neighbors across all subplots.\n\n"
        "**Interactivity:**\n"
        "- **Outcome selector** — switch between objectives (f0, f1) to see how each parameter "
        "affects different outcomes\n"
        "- **Sliders** — adjust the \"held fixed\" values for other parameters and watch the "
        "curves update in real time\n"
        "- **Pivoting** — click anywhere on the mean curve to \"pivot\" to that point. This sets "
        "the clicked parameter's value in all *other* subplots' sliders, so you can explore the "
        "response surface from that operating point. For example, clicking at x1=0.7 on the x1 "
        "subplot will fix x1=0.7 in all other subplots, showing you what the model predicts when "
        "x1 is held at 0.7. Points that are more \"distant\" in terms of (relevant) inputs are "
        "shown as more transparent. At a more technical level, opacity is proportional to the "
        "correlation between the points under the given GP kernel lengthscales.\n"
        "- **Training dots** — click a training point to snap all sliders to that trial's "
        "parameter values, exploring the model's predictions at that observed configuration"
    ))
    nb.cells.append(_viz_cell(
        "slice_plot(client)", state,
        'Ax.viz.renderSlicePlot(c,p,{interactive:true});',
        height="auto"))

    nb.cells.append(new_markdown_cell(
        "## 2D Response Surface\n\n"
        "A heatmap of the GP posterior mean over two input parameters, with all others held "
        "fixed. This shows how pairs of parameters jointly influence the outcome — revealing "
        "interactions that 1D slices can't capture.\n\n"
        "**How dimensions are chosen:** The two most important parameters (by kernel lengthscale) "
        "are selected by default. You can change them with the axis dropdowns.\n\n"
        "**Reading the plot:** Color encodes the predicted outcome value (yellow = high, "
        "purple = low). Training points are overlaid as dots. A second panel shows the posterior "
        "standard deviation (model uncertainty) — brighter regions indicate where the model is "
        "less certain, suggesting where additional trials would be most informative.\n\n"
        "**Interactivity:**\n"
        "- **Axis dropdowns** — choose which two parameters to plot\n"
        "- **Outcome selector** — switch between objectives\n"
        "- **Sliders** — adjust the held-fixed values for all non-plotted parameters"
    ))
    nb.cells.append(_viz_cell(
        "response_surface(client)", state,
        'Ax.viz.renderResponseSurface(c,p,{interactive:true,width:800,height:380});',
        width="860px", height="500px"))

    nb.cells.append(new_markdown_cell(
        "## Feature Importance\n\n"
        "A bar chart ranking parameters by their influence on the selected outcome.\n\n"
        "**How it works:** Importance is derived from Sobol sensitivity analysis on the GP model. "
        "Each bar shows two components: the *first-order* effect (how much variance the parameter "
        "explains on its own) and the *total-order* effect (including interactions with other "
        "parameters). A large gap between them means the parameter's effect depends on the values "
        "of other parameters. These importances are also embedded in the sliders of the Ax Explorer.\n\n"
        "**Interactivity:**\n"
        "- **Outcome selector** — switch between objectives to see which parameters matter most for each"
    ))
    nb.cells.append(_viz_cell(
        "feature_importance(client)", state,
        'Ax.viz.renderFeatureImportance(c,p,{interactive:true});',
        width="500px", height="auto"))

    nb.cells.append(new_markdown_cell(
        "## Leave-One-Out Cross-Validation\n\n"
        "Each training point is predicted by a GP model trained on all *other* points. Observed "
        "values are plotted against these LOO predictions — points on the diagonal indicate good "
        "model fit.\n\n"
        "**Reading the plot:** Each point has a vertical error bar showing the GP's 95% confidence "
        "interval for that prediction. Points far from the diagonal, or where the diagonal falls "
        "outside the CI, indicate regions where the model struggles. The R² value summarizes "
        "overall fit quality.\n\n"
        "**Interactivity:**\n"
        "- **Outcome selector** — switch between objectives\n"
        "- **Hover** — see the trial index and exact observed/predicted values"
    ))
    nb.cells.append(_viz_cell(
        "cross_validation(client)", state,
        'Ax.viz.renderCrossValidation(c,p,{interactive:true,width:460,height:460});',
        width="500px", height="500px"))

    nb.cells.append(new_markdown_cell(
        "## Optimization Trace\n\n"
        "The observed outcome value at each trial, with a running \"best so far\" line showing "
        "optimization progress.\n\n"
        "**Reading the plot:** Each dot is one trial's observed value. The step line tracks the "
        "best value seen up to that trial. For multi-objective problems, \"best\" is determined "
        "per-outcome using the direction inferred from the optimization config (maximize or minimize).\n\n"
        "**Interactivity:**\n"
        "- **Outcome selector** — switch between objectives to see convergence for each"
    ))
    nb.cells.append(_viz_cell(
        "optimization_trace(client)", state,
        'Ax.viz.renderOptimizationTrace(c,p,{interactive:true,width:660,height:380});',
        width="700px", height="420px"))

    nb.cells.append(new_markdown_cell(
        "---\nFive one-liners from `ax.api.Client` to interactive GP diagnostics. All rendering "
        "happens in the browser via ax-js — the GP posterior is evaluated in JavaScript using "
        "exported hyperparameters, so plots update instantly without round-trips to Python."))

    return nb


def main():
    nb = build_notebook()
    nb_path = ROOT / "demo" / "jupyter-demo.ipynb"
    nbformat.write(nb, str(nb_path))
    print(f"Notebook: {nb_path} ({nb_path.stat().st_size // 1024}KB)")

    try:
        from nbconvert import HTMLExporter
        exporter = HTMLExporter()
        exporter.theme = "light"
        body, _ = exporter.from_notebook_node(nb)
        html_path = ROOT / "demo" / "jupyter-demo.html"
        html_path.write_text(body)
        print(f"HTML: {html_path} ({html_path.stat().st_size // 1024}KB)")
    except ImportError:
        print("nbconvert not available")


if __name__ == "__main__":
    main()
