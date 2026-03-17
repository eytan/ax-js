# Jupyter Notebook Embedding: Feasibility Assessment

## Current State

ax-js produces three IIFE bundles that attach to a global `Ax` namespace:

| Bundle | Raw | Gzipped |
|--------|-----|---------|
| `dist/ax.js` (core: Predictor, models, transforms, linalg) | 71 KB | ~15 KB |
| `dist/ax-viz.js` (colormaps, heatmap, sliders, tooltips) | 7 KB | ~2 KB |
| `dist/ax-acquisition.js` (UCB, EI, Thompson, etc.) | 20 KB | ~5 KB |

The demo suite already inlines these bundles into self-contained HTML files (via `demo/shared.js` → `libraryScript()` / `vizScript()`). Each demo is a single HTML file with embedded JS and fixture JSON that works from `file://` URLs with no server. This is the exact same pattern needed for Jupyter.

The Python export pipeline is: `export_client(client)` returns an `ExperimentState` dict (JSON-serializable), which is the only data contract between Python and JS.

---

## Approach 1: IPython.display.HTML (Low-Lift) — RECOMMENDED

### How it works

Jupyter's `IPython.display.HTML` renders arbitrary HTML (including `<script>` and `<canvas>`) in a cell output. The ax-js bundles are inlined into a `<script>` tag, the ExperimentState JSON is inlined as a JS variable, and application JS builds the visualization inside a container `<div>`.

This is exactly what the demo build system already does. The only difference is that the HTML string is constructed in Python at runtime instead of at Node.js build time.

### Minimal code sketch

```python
# python/axjs_jupyter.py  (sketch — not runnable)

import json
from pathlib import Path
from IPython.display import display, HTML

_BUNDLE_DIR = Path(__file__).parent / "../dist"
_AX_JS = (_BUNDLE_DIR / "ax.js").read_text()
_AX_VIZ_JS = (_BUNDLE_DIR / "ax-viz.js").read_text()

def _render_html(experiment_state: dict, viz_js: str, container_id: str,
                 width: str = "100%", height: str = "500px") -> str:
    """Build a self-contained HTML string for a Jupyter cell."""
    state_json = json.dumps(experiment_state)
    return f"""
    <div id="{container_id}" style="width:{width}; height:{height}; position:relative;"></div>
    <script>
    (function() {{
      // Only load bundles once per notebook session
      if (!window.Ax) {{
        {_AX_JS}
        {_AX_VIZ_JS}
      }}
      var state = {state_json};
      var container = document.getElementById("{container_id}");
      {viz_js}
    }})();
    </script>
    """

def display_response_surface(client_or_state, outcome=None, width="800px", height="500px"):
    """Render an interactive response surface heatmap in a Jupyter cell.

    Args:
        client_or_state: An ax.api.Client (calls export_client) or an ExperimentState dict.
        outcome: Outcome name to plot. Defaults to first outcome.
        width: CSS width of the container.
        height: CSS height of the container.
    """
    if hasattr(client_or_state, '_experiment'):
        from axjs_export import export_client
        state = export_client(client_or_state)
    else:
        state = client_or_state

    # Unique container ID to avoid collisions across cells
    import uuid
    cid = f"axjs_{uuid.uuid4().hex[:8]}"

    # This JS would be the response_surface demo logic,
    # adapted to render into a specific container div
    viz_js = f"""
      var predictor = new Ax.Predictor(state);
      var outcome = "{outcome or ''}" || predictor.outcomeNames[0];
      // ... build canvas, sliders, render heatmap using Ax.viz.renderHeatmap ...
      // ... attach mouse handlers for tooltips via Ax.viz.showTooltip ...
    """

    html = _render_html(state, viz_js, cid, width, height)
    display(HTML(html))
```

### User-facing API

```python
from axjs_export import export_client
from axjs_jupyter import display_response_surface, display_slice_plot

# Direct from Client
display_response_surface(client, outcome="accuracy")
display_slice_plot(client)

# Or from exported state (e.g., loaded from file)
state = export_client(client)
display_response_surface(state, outcome="latency", width="600px")
```

### Limitations

1. **Bundle duplication**: If the user renders 5 plots in 5 cells, the 71 KB bundle is embedded 5 times in the notebook file. Mitigation: the `if (!window.Ax)` guard means it only *executes* once, and the guard can be extended to only *emit* the bundle in the first cell by tracking state on a module-level flag. Alternatively, one "setup" cell loads the bundle, and viz cells only emit the viz JS + data.

2. **Cell height**: Jupyter auto-sizes cell output to content. A `<div>` with explicit CSS height works fine. The user controls dimensions via `width`/`height` params.

3. **Canvas sizing**: Canvas elements need explicit pixel dimensions (not just CSS). The viz JS must read `container.offsetWidth` after render to set `canvas.width`. This works in Jupyter because the output cell is in the DOM when the script runs.

4. **Interactivity**: Mouse events (hover, click) work normally inside Jupyter cell outputs. Sliders, dropdowns, and tooltips all function. This is proven by Plotly/Bokeh which do the same thing.

5. **No Python round-trip**: All interaction is client-side JS. There is no way to send slider values back to Python without ipywidgets/comms. For GP prediction visualizations this is fine — the whole point of ax-js is that prediction is client-side.

6. **Notebook export**: When saving as HTML, the inline scripts and canvas elements are preserved. However, canvas content is **not** captured as a static image — the JS must re-execute on load. For PDF/LaTeX export, canvas-based plots will be blank. This is the same limitation Plotly has with its WebGL renderer.

### Effort estimate

~2-3 days of work:
- Extract the viz logic from each demo module into reusable JS functions that accept a container element (currently they assume full-page layout with hardcoded DOM IDs).
- Write the Python wrapper (~100 lines for 3-4 viz types).
- Handle the bundle-loading-once pattern.
- Test in JupyterLab, classic notebook, and Colab.

---

## Approach 2: nbformat + Custom Template (Medium-Lift)

### How it works

Use Python's `nbformat` library to programmatically generate a `.ipynb` file with pre-populated cells:
- Cell 1: Markdown header with experiment metadata
- Cell 2: Code cell that defines the ExperimentState as a Python variable
- Cell 3: Code cell that calls `display_response_surface(state)`

### Assessment

This is orthogonal to Approach 1, not an alternative. You still need the `IPython.display.HTML` mechanism from Approach 1 to actually render anything. The notebook generation just automates the creation of a starter notebook.

Useful for: "export a diagnostic report notebook from an Ax experiment." The user runs `generate_report_notebook(client, "report.ipynb")`, opens it, and runs all cells.

```python
def generate_report_notebook(client, path="ax_report.ipynb"):
    import nbformat
    nb = nbformat.v4.new_notebook()
    state = export_client(client)
    nb.cells = [
        nbformat.v4.new_markdown_cell(f"# {state.get('name', 'Experiment')} Report"),
        nbformat.v4.new_code_cell(f"state = {json.dumps(state)}"),
        nbformat.v4.new_code_cell("from axjs_jupyter import display_response_surface\n"
                                   "display_response_surface(state)"),
    ]
    nbformat.write(nb, path)
```

### Effort estimate

~0.5 days on top of Approach 1. Trivial once the display functions exist.

---

## Approach 3: ipywidgets (High-Lift)

### What it would take

ipywidgets requires:
1. A Python "backend" widget class (subclass of `DOMWidget`) that syncs state via Jupyter's comm protocol.
2. A JS "frontend" widget (AMD or ES module) registered with the Jupyter widget manager.
3. A `setup.py`/`pyproject.toml` with nbextension/labextension build steps.
4. A bundler config (webpack/esbuild) that produces the JS extension in the format Jupyter expects.

The JS frontend would import ax-js and render into the widget's DOM element. Python-side sliders could sync to JS-side state via traitlets.

### Is it worth it?

**No, not for the initial integration.** Reasons:

- **Complexity**: ipywidgets requires a full npm build pipeline, extension installation, and version-specific compatibility with JupyterLab's extension system. This is weeks of work plus ongoing maintenance.
- **No clear benefit**: ax-js visualizations are fully client-side. There is no Python computation in the render loop. The only benefit of ipywidgets would be Python-side callbacks (e.g., "when the user clicks a point, update a Python variable"), but this is not a current requirement.
- **Colab compatibility**: Google Colab has limited ipywidgets support. Custom widgets require `google.colab.output.register_callback` hacks. `IPython.display.HTML` works universally.
- **Precedent**: Plotly uses `IPython.display.HTML` as its primary Jupyter integration. Their ipywidgets wrapper (`FigureWidget`) came much later and is optional.

If bidirectional Python-JS communication becomes necessary (e.g., "user selects a candidate in the viz, Python submits it as a trial"), ipywidgets would be worth revisiting. But that is a fundamentally different product.

---

## Practical Concerns

### Bundle size

Inlining 71 KB + 7 KB (~78 KB) of unminified JS per cell is reasonable:
- **Plotly** inlines ~3.5 MB of JS per notebook (they use `requirejs` CDN loading in some modes, but the offline/default mode embeds the full bundle).
- **Bokeh** embeds ~1.5 MB per notebook.
- 78 KB is **tiny** by comparison.
- Gzipped (as stored in `.ipynb` on disk), it is ~17 KB.

For repeated cells, the `if (!window.Ax)` guard prevents re-execution. To avoid bloating the `.ipynb` file, a refinement is to emit the bundle only once (first call sets a module flag) and subsequent cells only emit the viz JS + data JSON.

### How other libraries handle this

| Library | Strategy | Bundle Size |
|---------|----------|-------------|
| **Plotly** | Inline full plotly.js in first cell output, subsequent cells reference `window.Plotly`. Offline mode default. CDN optional. | 3.5 MB |
| **Bokeh** | `output_notebook()` call loads BokehJS via inline `<script>`. Each plot embeds only its data + glue JS. | 1.5 MB |
| **Altair** | Generates Vega-Lite JSON spec. Renders via embedded Vega runtime (~400 KB). | 400 KB |
| **mpld3** | Inline D3.js + plot spec per cell. | ~200 KB |

The Bokeh pattern (one setup call + lightweight per-plot cells) is the cleanest model for ax-js.

### Platform compatibility

| Platform | `IPython.display.HTML` with inline `<script>` | Canvas rendering | Interactive events |
|----------|-----------------------------------------------|------------------|-------------------|
| **JupyterLab** | Yes | Yes | Yes |
| **Classic Notebook** | Yes | Yes | Yes |
| **Google Colab** | Yes | Yes | Yes |
| **VS Code Notebooks** | Yes | Yes | Yes (some tooltip quirks) |
| **Databricks** | Yes | Yes | Yes |
| **nbviewer** (static) | Script stripped (security) | No | No |

The only environment where inline scripts fail is static HTML renderers (nbviewer, GitHub notebook preview) that strip `<script>` tags for security. This is the same limitation all JS-based viz libraries have.

### Notebook export (HTML, PDF)

- **HTML export**: Scripts preserved, visualizations re-render on load. Works.
- **PDF/LaTeX export**: Canvas content is blank (raster, not captured). Same as Plotly WebGL.
- **Workaround**: Could add a `canvas.toDataURL()` call after render that writes the canvas content as a fallback `<img>` tag, so static exports show the last-rendered frame. This is ~10 lines of JS. Would not preserve interactivity but would preserve the visual.

---

## Recommendation

**Pursue Approach 1 (IPython.display.HTML) first.** It is:
- The lowest effort (~2-3 days)
- Compatible with all major notebook platforms
- The same pattern used by Plotly and Bokeh
- Sufficient for all current viz types (slice plots, response surfaces, radar, cross-validation, etc.)
- Zero additional dependencies (just `IPython`, which is always available in notebooks)

### Minimal viable integration (ordered by priority)

1. **`setup_axjs()`** — one-time call that inlines the JS bundles into the notebook (Bokeh-style `output_notebook()`). Emits the `<script>` tag once.
2. **`display_slice_plot(client_or_state, outcome=...)`** — the most-requested Ax viz.
3. **`display_response_surface(client_or_state, outcome=...)`** — 2D heatmap.
4. **`display_cross_validation(client_or_state, outcome=...)`** — LOO-CV plot.

### Prerequisite refactor

The current demo JS is page-level (hardcoded DOM IDs like `#plots`, `#sliders`, `#tooltip`). To embed in Jupyter cells, the viz JS needs to be refactored to accept a container element and scope all DOM operations within it. This is the main engineering work — the Python wrapper is trivial by comparison. Options:

- **Quick path**: Copy-paste the demo JS into the Python wrapper with ID prefixes (e.g., `{cid}_plots`). Ugly but fast.
- **Clean path**: Refactor the demo JS into a `renderSlicePlot(container, predictor, options)` function in `src/viz/`, export it in the viz bundle, and call it from Python. This is better long-term and makes the viz module useful beyond demos.

The clean path is recommended. It aligns with the existing `src/viz/index.ts` design (which already has `renderHeatmap`, `createParamSliders`, etc.) — the missing piece is a top-level `renderSlicePlot()` orchestrator that composes these primitives.

---

## Sketch: Full API Shape

```python
# axjs_jupyter.py

def setup_axjs():
    """Call once per notebook to load ax-js bundles. Like bokeh.io.output_notebook()."""
    display(HTML(f"<script>{_AX_JS}\n{_AX_VIZ_JS}</script>"))

def display_slice_plot(client_or_state, outcome=None, width="100%", height="300px"):
    """1D slice plots for each parameter dimension."""
    ...

def display_response_surface(client_or_state, outcome=None,
                              dim_x=0, dim_y=1, grid_size=40,
                              width="800px", height="500px"):
    """2D heatmap with parameter sliders for non-plotted dimensions."""
    ...

def display_cross_validation(client_or_state, outcome=None,
                              width="400px", height="400px"):
    """Leave-one-out cross-validation scatter plot."""
    ...

def display_radar(client_or_state, width="500px", height="500px"):
    """Radar/spider chart for multi-objective optimization."""
    ...

def display_optimization_trace(client_or_state, outcome=None,
                                width="700px", height="400px"):
    """Optimization trace (best-so-far vs trial index)."""
    ...

# Lower-level: get the HTML string without displaying
def render_response_surface(state, **kwargs) -> str:
    """Return HTML string (useful for nbformat, email, etc.)."""
    ...
```
