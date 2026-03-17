#!/usr/bin/env python3
"""Build end-to-end demo notebook: Ax experiment → ax-js plots."""

from pathlib import Path
import nbformat
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell

ROOT = Path(__file__).parent.parent


def build_notebook() -> nbformat.NotebookNode:
    nb = new_notebook()
    nb.metadata.kernelspec = {
        "display_name": "Python 3", "language": "python", "name": "python3"
    }

    nb.cells.append(new_markdown_cell(
        "# ax-js End-to-End Demo\n\n"
        "Create an Ax experiment, run BO, and visualize the fitted GP.\n\n"
        "**Requirements**: `pip install ax-platform botorch`"
    ))

    nb.cells.append(new_markdown_cell("## 1. Run Bayesian Optimization"))
    nb.cells.append(new_code_cell(
        "from ax.api import Client\n"
        "from ax.api.configs import RangeParameterConfig\n"
        "from botorch.test_functions import Branin\n"
        "import torch\n"
        "\n"
        "client = Client()\n"
        "client.configure_experiment(\n"
        "    name='branin_demo',\n"
        "    parameters=[\n"
        "        RangeParameterConfig(name='x1', parameter_type='float', bounds=(-5.0, 10.0)),\n"
        "        RangeParameterConfig(name='x2', parameter_type='float', bounds=(0.0, 15.0)),\n"
        "    ],\n"
        ")\n"
        "client.configure_optimization(objective='branin')\n"
        "\n"
        "branin = Branin(negate=True)\n"
        "for i in range(25):\n"
        "    params, trial_index = client.get_next_trial()\n"
        "    y = branin(torch.tensor([[params['x1'], params['x2']]])).item()\n"
        "    client.complete_trial(trial_index=trial_index, raw_data={'branin': y})\n"
        "\n"
        "print(f'Completed 25 trials')"
    ))

    nb.cells.append(new_markdown_cell("## 2. Visualize"))
    nb.cells.append(new_code_cell(
        "import sys; sys.path.insert(0, 'python')\n"
        "from axjs_jupyter import (\n"
        "    slice_plot, response_surface,\n"
        "    feature_importance, cross_validation, optimization_trace,\n"
        ")"
    ))

    nb.cells.append(new_code_cell("slice_plot(client)"))
    nb.cells.append(new_code_cell("response_surface(client)"))
    nb.cells.append(new_code_cell("feature_importance(client)"))
    nb.cells.append(new_code_cell("cross_validation(client)"))
    nb.cells.append(new_code_cell("optimization_trace(client)"))

    nb.cells.append(new_markdown_cell(
        "---\n"
        "Five one-liners. Each call exports the fitted GP from the Ax Client "
        "and renders an interactive visualization — all client-side JavaScript."
    ))

    return nb


def main():
    nb = build_notebook()
    nb_path = ROOT / "demo" / "ax-js-e2e.ipynb"
    nbformat.write(nb, str(nb_path))
    print(f"Notebook: {nb_path}")
    print("Run: jupyter notebook demo/ax-js-e2e.ipynb")


if __name__ == "__main__":
    main()
