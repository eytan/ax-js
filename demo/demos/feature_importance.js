import { libraryScript, vizScript, fixtureScript, penicillinFixture, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Feature Importance</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f0f11; color: #e0e0e0; padding: 2rem; min-height: 100vh; }
  h1 { font-size: 18px; font-weight: 500; color: #f0f0f0; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 16px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  label { font-size: 13px; color: #aaa; }
  select, input[type=file] { font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #444; background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none; }
  .chart-container { max-width: 600px; }
  .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
  .bar-label { width: 150px; font-size: 13px; color: #ccc; text-align: right; padding-right: 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { flex: 1; height: 24px; background: #1a1a1d; border-radius: 4px; position: relative; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
  .bar-value { position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    font-size: 11px; color: #ccc; font-weight: 500; }
  .explanation { font-size: 12px; color: #666; margin-top: 16px; max-width: 600px; line-height: 1.5; }
  .multi-outcome { display: flex; flex-wrap: wrap; gap: 24px; }
  .outcome-col { flex: 1; min-width: 400px; }
  .outcome-title { font-size: 14px; font-weight: 500; color: #aaa; margin-bottom: 10px; }
</style>
</head>
<body>
<h1>${axHomeLink}Feature Importance</h1>
<div class="subtitle" id="subtitle">Relative importance from GP kernel lengthscales</div>
<div class="controls">
  <label>View: <select id="viewMode">
    <option value="single">Single outcome</option>
    <option value="all">All outcomes</option>
  </select></label>
  <label>Outcome: <select id="outcomeSelect"></select></label>
  <label>File: <input type="file" id="fileInput" accept=".json"></label>
</div>
<div id="chart"></div>
<div class="explanation">
  Bars show <b>1 / lengthscale</b> — shorter kernel lengthscales mean the model is more
  sensitive to that parameter. Importance is relative (normalized to the most important dimension).
</div>
${libraryScript()}
${fixtureScript('__DEFAULT_FIXTURE__', penicillinFixture)}
${vizScript()}
<script>
var Predictor = Ax.Predictor;
var predictor, fixture, selectedOutcome;
var viewMode = document.getElementById('viewMode');
var outcomeSelect = document.getElementById('outcomeSelect');

var barColors = ['#7c6ff7','#6fa0f7','#6fcff7','#6ff7c8','#a0f76f','#f7e06f','#f7a06f','#f76f6f'];

// File upload — wired via shared utility instead of manual addEventListener
Ax.viz.setupFileUpload('fileInput', function(data) { loadFixtureData(data); });

function loadFixtureData(data) {
  fixture = Ax.viz.normalizeFixture(data);
  predictor = new Predictor(fixture);

  // Populate outcome dropdown via shared utility (clears + fills options + wires change listener)
  Ax.viz.createOutcomeSelector(predictor, outcomeSelect, function(name) {
    selectedOutcome = name; render();
  });
  selectedOutcome = predictor.outcomeNames[0];

  document.getElementById('subtitle').textContent =
    (fixture.metadata.name || 'Fixture') + ' — ' + predictor.paramNames.length + ' parameters, ' +
    predictor.outcomeNames.length + ' outcome' + (predictor.outcomeNames.length > 1 ? 's' : '');
  render();
}

function renderBars(outcomeName, container) {
  var ranked = predictor.rankDimensionsByImportance(outcomeName);
  if (ranked.length === 0) { container.textContent = 'No lengthscale data'; return; }

  // Importance = 1/ls, normalize to max
  var importances = ranked.map(function(d) { return 1 / d.lengthscale; });
  var maxImp = Math.max.apply(null, importances);

  ranked.forEach(function(dim, i) {
    var imp = importances[i];
    var pct = (imp / maxImp * 100).toFixed(1);

    var row = document.createElement('div'); row.className = 'bar-row';
    var label = document.createElement('div'); label.className = 'bar-label';
    label.textContent = dim.paramName;
    var track = document.createElement('div'); track.className = 'bar-track';
    var fill = document.createElement('div'); fill.className = 'bar-fill';
    fill.style.width = pct + '%';
    fill.style.background = barColors[dim.dimIndex % barColors.length];
    var value = document.createElement('div'); value.className = 'bar-value';
    value.textContent = 'ls=' + dim.lengthscale.toFixed(3);

    track.appendChild(fill);
    track.appendChild(value);
    row.appendChild(label);
    row.appendChild(track);
    container.appendChild(row);
  });
}

function render() {
  var chart = document.getElementById('chart');
  chart.innerHTML = '';

  if (viewMode.value === 'all' && predictor.outcomeNames.length > 1) {
    var wrap = document.createElement('div'); wrap.className = 'multi-outcome';
    predictor.outcomeNames.forEach(function(name) {
      var col = document.createElement('div'); col.className = 'outcome-col';
      var title = document.createElement('div'); title.className = 'outcome-title';
      title.textContent = name;
      col.appendChild(title);
      renderBars(name, col);
      wrap.appendChild(col);
    });
    chart.appendChild(wrap);
  } else {
    var container = document.createElement('div'); container.className = 'chart-container';
    renderBars(selectedOutcome, container);
    chart.appendChild(container);
  }
}

viewMode.addEventListener('change', render);

loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;
}
