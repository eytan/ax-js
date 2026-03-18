import { libraryScript, vizScript, fixtureScript, hartmannMixedFixture, axHomeLink, axFavicon } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Slice Plots</title>
${axFavicon}
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #fff; color: #1a1a1a; padding: 2rem; min-height: 100vh; }
  h1 { font-size: 18px; font-weight: 500; color: #111; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #666; margin-bottom: 20px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  label { font-size: 13px; color: #555; }
  select, input[type=file] { font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #d0d0d0; background: #fff; color: #333; cursor: pointer; outline: none; }
</style>
</head>
<body>
<h1>${axHomeLink}Ax-Style 1D Slice Plots</h1>
<p class="subtitle" id="subtitle">Load a fixture JSON to visualize GP posterior slices</p>
<div class="controls">
  <label>Fixture: <input type="file" id="fileInput" accept=".json"></label>
</div>
<div id="plotContainer"></div>
${libraryScript()}
${vizScript()}
${fixtureScript('__DEFAULT_FIXTURE__', hartmannMixedFixture)}
<script>
var Predictor = Ax.Predictor;
var predictor, fixture;

function loadFixtureData(data) {
  fixture = Ax.viz.normalizeFixture(data);
  predictor = new Predictor(fixture);
  document.getElementById('subtitle').textContent =
    fixture.metadata.name + ' — ' + fixture.metadata.description;
  render();
}

function render() {
  var container = document.getElementById('plotContainer');
  container.innerHTML = '';
  Ax.viz.renderSlicePlot(container, predictor, { interactive: true });
}

document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;
}
