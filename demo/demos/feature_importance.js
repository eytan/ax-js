import { libraryScript, vizScript, fixtureScript, penicillinFixture, axHomeLink, axFavicon , descriptionCSS, descriptionPanel } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Feature Importance</title>
${axFavicon}
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #fff; color: #1a1a1a; padding: 2rem; min-height: 100vh; }
  h1 { font-size: 18px; font-weight: 500; color: #111; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #666; margin-bottom: 16px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  label { font-size: 13px; color: #555; }
  select, input[type=file] { font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #d0d0d0; background: #fff; color: #333; cursor: pointer; outline: none; }
  .explanation { font-size: 12px; color: #666; margin-top: 16px; max-width: 600px; line-height: 1.5; }
${descriptionCSS}
</style>
</head>
<body>
<h1>${axHomeLink}Feature Importance</h1>
<div class="subtitle" id="subtitle">Parameter importance via GP kernel analysis</div>
${descriptionPanel(`
  <p>A bar chart ranking parameters by their influence on the selected outcome. Importance is derived from <b>Sobol sensitivity analysis</b> on the GP model.</p>
  <p>Each bar shows two components: the <b>first-order</b> effect (how much variance the parameter explains on its own) and the <b>total-order</b> effect (including interactions with other parameters). A large gap between them means the parameter's effect depends on the values of other parameters.</p>
  <p>These importances are also embedded in the sliders of the Ax Explorer.</p>`)}
<div class="controls">
  <label>File: <input type="file" id="fileInput" accept=".json"></label>
</div>
<div id="chart"></div>
<div class="explanation" id="explanation">
  <b>Lengthscale mode:</b> Bars show <b>1 / lengthscale</b> — shorter kernel lengthscales mean the model
  is more sensitive to that parameter. Fast but not range-aware.<br><br>
  <b>Sobol\u2019 mode:</b> Bars show variance decomposition via Saltelli\u2019s estimator on the GP posterior mean.
  Solid blue = first-order effect (S<sub>i</sub>), light blue = interaction with other parameters (ST<sub>i</sub> \u2212 S<sub>i</sub>).
  Range-aware and detects interactions, but requires ~500\u00D7(d+2) GP evaluations.
</div>
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
    (fixture.metadata.name || 'Fixture') + ' \\u2014 ' + predictor.paramNames.length + ' parameters, ' +
    predictor.outcomeNames.length + ' outcome' + (predictor.outcomeNames.length > 1 ? 's' : '');
  render();
}

function render() {
  var chart = document.getElementById('chart');
  chart.innerHTML = '';
  Ax.viz.renderFeatureImportance(chart, predictor, { interactive: true, mode: 'sobol' });
}

Ax.viz.setupFileUpload('fileInput', function(data) { loadFixtureData(data); });

loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;
}
