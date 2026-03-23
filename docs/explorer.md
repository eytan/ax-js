# Ax Explorer

The Ax Explorer is a multi-objective tradeoff exploration tool for Ax experiments. It visualizes predicted outcomes across all arms and candidates on a scatter plot, with a deltoid panel showing per-metric performance relative to the status quo.

## Overview

The Explorer is designed for experiments with an `optimization_config` — multiple objectives, outcome constraints, and objective thresholds. It lets you:

- **Explore tradeoffs** on a 2D scatter plot (choose any two metrics as axes)
- **Inspect arms** via a deltoid panel showing relativized metric bars (PiYG color scale: green = better, pink = worse)
- **Create and edit candidates** by cloning existing arms and adjusting parameters via sliders
- **Import/export candidates** as JSON for round-tripping with Python

## Exporting from Ax

Use `export_client()` from `axjs_export.py` to produce the `ExperimentState` JSON that the Explorer consumes:

```python
import sys, json
sys.path.insert(0, "path/to/ax-js/python")

from ax.api import Client
from axjs_export import export_client

# After running your multi-objective experiment...
state = export_client(client)

with open("explorer_data.json", "w") as f:
    json.dump(state, f)
```

The Explorer requires these fields in the `ExperimentState`:

| Field | Required | Description |
|-------|----------|-------------|
| `search_space` | Yes | Parameter definitions (bounds, types) |
| `model_state` | Yes | Fitted GP model (typically `ModelListGP` for MOO) |
| `optimization_config` | Yes | Objectives, constraints, thresholds |
| `outcome_names` | Yes | Metric names matching model outputs |
| `status_quo` | Recommended | Reference point for relativization |
| `observations` | Recommended | Completed trial data for scatter plot |
| `candidates` | Optional | Pre-existing unevaluated candidates |

### Optimization config structure

The `optimization_config` tells the Explorer which metrics are objectives vs. constraints:

```json
{
  "objectives": [
    { "name": "accuracy", "minimize": false },
    { "name": "latency", "minimize": true }
  ],
  "outcome_constraints": [
    { "name": "memory_mb", "op": "LEQ", "bound": 512 }
  ],
  "objective_thresholds": [
    { "name": "accuracy", "bound": 0.8, "op": "GEQ" },
    { "name": "latency", "bound": 100, "op": "LEQ" }
  ]
}
```

## Candidate Import/Export

### Export

Click **export** in the Explorer toolbar to download `candidates.json`:

```json
[
  {
    "arm_name": "candidate_1",
    "parameters": { "lr": 0.001, "batch_size": 64 },
    "trial_index": 12,
    "generation_method": "Manual"
  }
]
```

### Import

Click **import** to load a JSON file with the same format. Imported candidates replace any existing candidates and appear on the scatter plot with model predictions.

The import format accepts:

| Field | Required | Description |
|-------|----------|-------------|
| `parameters` | Yes | `Record<string, number>` matching search space parameter names |
| `arm_name` | Optional | Display name (defaults to `imported_0`, `imported_1`, ...) |
| `generation_method` | Optional | Label (defaults to `imported`) |

## Deltoid Panel

The right-side panel shows per-metric performance bars for the selected arm or candidate:

- **Color**: PiYG diverging scale — green for improvement, pink for regression (relative to status quo)
- **Bars**: Proportional to relativized mean, with uncertainty whiskers
- **Metric groups**: Objectives, constraints, and tracking metrics are visually separated
- **Drag reordering**: Drag metric rows to reorder within groups

## Customization

The Explorer reads the full `ExperimentState` format documented in [data-model.md](data-model.md). To customize:

- **Axis defaults**: The scatter plot defaults to the first two objectives
- **Relative vs. absolute**: Toggle relativization via the checkbox (requires `status_quo`)
- **Candidate editing**: Select a candidate, then adjust parameter sliders in the right panel
