import { libraryScript, vizScript, fixtureScript, hartmannMixedFixture, axHomeLink, axFavicon } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — 2D Response Surface</title>
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
<h1>${axHomeLink}2D Response Surface</h1>
<p class="subtitle" id="subtitle">Load a fixture JSON to visualize GP posterior</p>
<div class="controls">
  <label>File: <input type="file" id="fileInput" accept=".json"></label>
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
var predictor, fixture, surface;

function loadFixtureData(data) {
  fixture = Ax.viz.normalizeFixture(data);
  predictor = new Predictor(fixture);
  document.getElementById('subtitle').textContent =
    fixture.metadata.name + ' — ' + fixture.metadata.description;
  if (surface) surface.destroy();
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
  surface = Ax.viz.renderResponseSurface(container, predictor, {
    interactive: true,
    width: 800,
    height: 380,
    relative: isRelative,
    statusQuoPoint: sqPoint,
  });
}

document.getElementById('modeSelect').addEventListener('change', function() {
  if (surface) surface.setRelative(this.value === 'relative');
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
