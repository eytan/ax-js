import { libraryScript, vizScript, fixtureScript, hartmannMixedFixture, axHomeLink, axFavicon , descriptionCSS, descriptionPanel } from '../shared.js';

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
${descriptionCSS}
</style>
</head>
<body>
<h1>${axHomeLink}Ax-Style 1D Slice Plots</h1>
<p class="subtitle" id="subtitle">Load a fixture JSON to visualize GP posterior slices</p>
${descriptionPanel(`
  <p>Each subplot shows the GP posterior prediction (mean ± confidence band) as a single parameter varies, with all other parameters held fixed. Parameters are sorted by <b>feature importance</b> (shorter kernel lengthscale = more important).</p>
  <p>The blue curve is the posterior mean. The shaded band is the 95% CI. Training points are shown as dots — hover to highlight nearest neighbors across subplots.</p>
  <p><b>Interactivity:</b></p>
  <ul>
    <li><b>Outcome selector</b> — switch between objectives</li>
    <li><b>Sliders</b> — adjust "held fixed" values for other parameters</li>
    <li><b>Pivoting</b> — click the mean curve to set that parameter's value in all other subplots, exploring the response surface from that operating point. Dot opacity reflects kernel correlation (more distant = more transparent).</li>
    <li><b>Training dots</b> — click to snap all sliders to that trial's parameter values</li>
  </ul>`)}
<div class="controls">
  <label>Fixture: <input type="file" id="fileInput" accept=".json"></label>
  <label>Mode: <select id="modeSelect">
    <option value="absolute">Absolute</option>
    <option value="relative">Relative (% vs control)</option>
  </select></label>
</div>
<div id="plotContainer"></div>
${libraryScript()}
${vizScript()}
${fixtureScript('__DEFAULT_FIXTURE__', hartmannMixedFixture)}
<script>
var Predictor = Ax.Predictor;
var predictor, fixture, slicePlot;

function loadFixtureData(data) {
  fixture = Ax.viz.normalizeFixture(data);
  predictor = new Predictor(fixture);
  document.getElementById('subtitle').textContent =
    fixture.metadata.name + ' — ' + fixture.metadata.description;
  if (slicePlot) slicePlot.destroy();
  var container = document.getElementById('plotContainer');
  var isRelative = document.getElementById('modeSelect').value === 'relative';
  // Use real SQ if available; otherwise pick the training point closest to the center
  var sqPoint = fixture.status_quo ? fixture.status_quo.point : null;
  if (!sqPoint) {
    var td = predictor.getTrainingData(predictor.outcomeNames[0]);
    if (td.X.length > 0) {
      var center = predictor.paramBounds.map(function(b) { return (b[0] + b[1]) / 2; });
      var bestDist = Infinity, bestIdx = 0;
      for (var i = 0; i < td.X.length; i++) {
        var d = 0;
        for (var j = 0; j < center.length; j++) {
          var range = predictor.paramBounds[j][1] - predictor.paramBounds[j][0] || 1;
          d += ((td.X[i][j] - center[j]) / range) * ((td.X[i][j] - center[j]) / range);
        }
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      sqPoint = td.X[bestIdx];
    }
  }
  slicePlot = Ax.viz.renderSlicePlot(container, predictor, {
    interactive: true,
    relative: isRelative,
    statusQuoPoint: sqPoint,
  });
}

document.getElementById('modeSelect').addEventListener('change', function() {
  if (slicePlot) slicePlot.setRelative(this.value === 'relative');
});

document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;
}
