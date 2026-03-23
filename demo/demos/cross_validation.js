import { libraryScript, vizScript, fixtureScript, penicillinFixture, axHomeLink, axFavicon , descriptionCSS, descriptionPanel } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — LOO Cross-Validation</title>
${axFavicon}
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #fff; color: #1a1a1a; padding: 2rem; min-height: 100vh; }
  h1 { font-size: 18px; font-weight: 500; color: #111; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #666; margin-bottom: 16px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  label { font-size: 13px; color: #555; }
  select, button, input[type=file] { font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #d0d0d0; background: #fff; color: #333; cursor: pointer; outline: none; }
  button:hover { background: #f0f0f0; }
  .hint { font-size: 11px; color: #999; margin-top: 8px; }
${descriptionCSS}
</style>
</head>
<body>
<h1>${axHomeLink}Leave-One-Out Cross-Validation</h1>
<div class="subtitle" id="subtitle">Observed vs predicted — load a fixture to begin</div>
${descriptionPanel(`
  <p>Each training point is predicted by a GP model trained on all <em>other</em> points. Observed values are plotted against these LOO predictions — points on the diagonal indicate good model fit.</p>
  <p>Each point has a vertical error bar showing the GP's 95% confidence interval. Points far from the diagonal, or where the diagonal falls outside the CI, indicate regions where the model struggles. The R² value summarizes overall fit quality.</p>
  <p><b>Interactivity:</b></p>
  <ul>
    <li><b>Outcome selector</b> — switch between objectives</li>
    <li><b>Hover</b> — see the trial index and exact observed/predicted values</li>
    <li><b>Click</b> — highlight kernel-distance neighbors</li>
  </ul>`)}
<div class="controls">
  <label>File: <input type="file" id="fileInput" accept=".json"></label>
</div>
<div id="plotArea"></div>
<div class="hint">Click a point to see kernel-distance neighbors. Click empty space to clear.</div>
${libraryScript()}
${fixtureScript('__DEFAULT_FIXTURE__', penicillinFixture)}
${vizScript()}
<script>
var Predictor = Ax.Predictor;
var predictor, fixture;

function loadFixtureData(data) {
  fixture = Ax.viz.normalizeFixture(data);
  predictor = new Predictor(fixture);
  document.getElementById('subtitle').textContent =
    (fixture.metadata.name || 'Fixture') + ' — leave-one-out cross-validation';
  render();
}

function render() {
  var plotArea = document.getElementById('plotArea');
  plotArea.innerHTML = '';
  Ax.viz.renderCrossValidation(plotArea, predictor, {
    interactive: true,
    width: 440,
    height: 440
  });
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
