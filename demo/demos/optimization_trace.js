import { libraryScript, sharedUtilsScript, fixtureScript, penicillinFixture, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Optimization Trace</title>
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
  .plot-container { width: 700px; height: 380px; background: #141418; border: 0.5px solid #222;
    border-radius: 8px; overflow: hidden; position: relative; }
  .no-data { display: flex; align-items: center; justify-content: center; height: 100%; color: #555; font-size: 14px;
    flex-direction: column; gap: 8px; }
  .no-data code { font-size: 12px; color: #666; }
  #tooltip { position: fixed; background: rgba(20,20,24,0.95); border: 0.5px solid #444;
    border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none;
    display: none; z-index: 100; max-width: 300px; }
  .tt-title { font-weight: 600; color: #aaa; margin-bottom: 4px; }
  .tt-val { color: #7c9aff; }
</style>
</head>
<body>
<h1>${axHomeLink}Optimization Trace</h1>
<div class="subtitle" id="subtitle">Trial progression — load a fixture with observations</div>
<div class="controls">
  <label>Outcome: <select id="outcomeSelect"></select></label>
  <label>Direction: <select id="dirSelect">
    <option value="auto">Auto (from config)</option>
    <option value="min">Minimize</option>
    <option value="max">Maximize</option>
  </select></label>
  <label>File: <input type="file" id="fileInput" accept=".json"></label>
</div>
<div class="plot-container" id="plotContainer"></div>
<div id="tooltip"></div>
${libraryScript()}
${fixtureScript('__DEFAULT_FIXTURE__', penicillinFixture)}
${sharedUtilsScript()}
<script>
var Predictor = Ax.Predictor;
var predictor, fixture, selectedOutcome;
var pinnedIdx = -1;
var tooltip = document.getElementById('tooltip');
var outcomeSelect = document.getElementById('outcomeSelect');

function loadFixtureData(data) {
  fixture = normalizeFixture(data);
  predictor = new Predictor(fixture);
  outcomeSelect.innerHTML = '';
  predictor.outcomeNames.forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    outcomeSelect.appendChild(opt);
  });
  selectedOutcome = predictor.outcomeNames[0];
  document.getElementById('subtitle').textContent =
    (fixture.metadata.name || 'Fixture') + ' — optimization trace';
  render();
}

function isMinimize(outcomeName) {
  var sel = document.getElementById('dirSelect').value;
  if (sel === 'min') return true;
  if (sel === 'max') return false;
  // Auto: check optimization_config
  if (fixture.optimization_config && fixture.optimization_config.objectives) {
    var obj = fixture.optimization_config.objectives.find(function(o) { return o.name === outcomeName; });
    if (obj) return obj.minimize;
  }
  return true; // default minimize
}

function render() {
  var container = document.getElementById('plotContainer');
  container.innerHTML = '';
  pinnedIdx = -1;

  // Get training data for selected outcome
  var td = predictor.getTrainingData(selectedOutcome);
  if (td.Y.length === 0) {
    container.innerHTML = '<div class="no-data">No data available</div>';
    return;
  }

  // Pre-compute all outcome Y values for multi-outcome tooltips
  var allOutcomeY = {};
  predictor.outcomeNames.forEach(function(name) {
    allOutcomeY[name] = predictor.getTrainingData(name).Y;
  });

  var trainX = td.X;
  var paramNames = td.paramNames;
  var params = fixture.search_space.parameters;

  var trials = td.Y.map(function(y, i) { return { index: i, value: y }; });
  var minimize = isMinimize(selectedOutcome);

  // Compute running best
  var best = trials[0].value;
  var bestSoFar = trials.map(function(t) {
    if (minimize) { best = Math.min(best, t.value); }
    else { best = Math.max(best, t.value); }
    return best;
  });

  var n = trials.length;
  var yVals = trials.map(function(t) { return t.value; });
  var yMin = Math.min.apply(null, yVals);
  var yMax = Math.max.apply(null, yVals);
  var yPad = 0.08 * (yMax - yMin || 1);
  yMin -= yPad; yMax += yPad;

  var W = 700, H = 380;
  var margin = { top: 20, right: 20, bottom: 40, left: 60 };
  var pw = W - margin.left - margin.right;
  var ph = H - margin.top - margin.bottom;

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W); svg.setAttribute('height', H);

  function sx(i) { return margin.left + (i / Math.max(1, n - 1)) * pw; }
  function sy(v) { return margin.top + ph - (v - yMin) / (yMax - yMin) * ph; }

  // Grid
  var nTicks = 5;
  for (var t = 0; t <= nTicks; t++) {
    var v = yMin + (yMax - yMin) * t / nTicks;
    var gl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    gl.setAttribute('x1', margin.left); gl.setAttribute('x2', margin.left + pw);
    gl.setAttribute('y1', sy(v)); gl.setAttribute('y2', sy(v));
    gl.setAttribute('stroke', 'rgba(255,255,255,0.05)');
    svg.appendChild(gl);
    var yt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yt.setAttribute('x', margin.left - 8); yt.setAttribute('y', sy(v) + 4);
    yt.setAttribute('fill', '#555'); yt.setAttribute('font-size', '10');
    yt.setAttribute('text-anchor', 'end'); yt.textContent = v.toFixed(2);
    svg.appendChild(yt);
  }

  // Best-so-far line (step function)
  var bsfPath = 'M ' + sx(0) + ' ' + sy(bestSoFar[0]);
  for (var i = 1; i < n; i++) {
    bsfPath += ' H ' + sx(i) + ' V ' + sy(bestSoFar[i]);
  }
  var bsfLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bsfLine.setAttribute('d', bsfPath);
  bsfLine.setAttribute('stroke', '#7c6ff7'); bsfLine.setAttribute('stroke-width', '2.5');
  bsfLine.setAttribute('fill', 'none'); bsfLine.setAttribute('opacity', '0.7');
  svg.appendChild(bsfLine);

  // Individual trial dots
  var dotEls = [];
  for (var i = 0; i < n; i++) {
    var isBest = bestSoFar[i] === trials[i].value;
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', sx(i)); dot.setAttribute('cy', sy(trials[i].value));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', isBest ? 'rgba(124,111,247,0.9)' : 'rgba(255,255,255,0.3)');
    dot.setAttribute('stroke', isBest ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)');
    dot.setAttribute('stroke-width', '1');
    svg.appendChild(dot);
    dotEls.push({ cx: parseFloat(dot.getAttribute('cx')), cy: parseFloat(dot.getAttribute('cy')),
      idx: i, value: trials[i].value, best: bestSoFar[i], isBest: isBest,
      pt: trainX[i], el: dot });
  }

  // Axis labels
  var xl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  xl.setAttribute('x', margin.left + pw/2); xl.setAttribute('y', H - 6);
  xl.setAttribute('fill', '#888'); xl.setAttribute('font-size', '13');
  xl.setAttribute('text-anchor', 'middle'); xl.textContent = 'Trial';
  svg.appendChild(xl);
  var yl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  yl.setAttribute('x', 14); yl.setAttribute('y', margin.top + ph/2);
  yl.setAttribute('fill', '#888'); yl.setAttribute('font-size', '13');
  yl.setAttribute('text-anchor', 'middle');
  yl.setAttribute('transform', 'rotate(-90,' + 14 + ',' + (margin.top + ph/2) + ')');
  yl.textContent = selectedOutcome + (minimize ? ' (minimize)' : ' (maximize)');
  svg.appendChild(yl);

  // X ticks
  var xStep = Math.max(1, Math.ceil(n / 10));
  for (var i = 0; i < n; i += xStep) {
    var xt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xt.setAttribute('x', sx(i)); xt.setAttribute('y', margin.top + ph + 18);
    xt.setAttribute('fill', '#555'); xt.setAttribute('font-size', '10');
    xt.setAttribute('text-anchor', 'middle'); xt.textContent = String(i);
    svg.appendChild(xt);
  }

  // Legend
  var leg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var lr = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  lr.setAttribute('x1', margin.left + pw - 120); lr.setAttribute('x2', margin.left + pw - 100);
  lr.setAttribute('y1', margin.top + 12); lr.setAttribute('y2', margin.top + 12);
  lr.setAttribute('stroke', '#7c6ff7'); lr.setAttribute('stroke-width', '2.5');
  leg.appendChild(lr);
  var lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  lt.setAttribute('x', margin.left + pw - 96); lt.setAttribute('y', margin.top + 16);
  lt.setAttribute('fill', '#888'); lt.setAttribute('font-size', '11');
  lt.textContent = 'best so far';
  leg.appendChild(lt);
  svg.appendChild(leg);

  container.appendChild(svg);

  // ── Neighbor highlighting ──
  function findNearest(px, py) {
    var best = -1, bestD = 12;
    for (var i = 0; i < dotEls.length; i++) {
      var dx = px - dotEls[i].cx, dy = py - dotEls[i].cy;
      var d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function highlightNeighbors(activeIdx) {
    var active = dotEls[activeIdx];
    var rawRels = [], maxRel = 0;
    for (var i = 0; i < dotEls.length; i++) {
      if (i === activeIdx) { rawRels.push(1); continue; }
      var r = predictor.kernelCorrelation(dotEls[i].pt, active.pt, selectedOutcome);
      rawRels.push(r);
      if (r > maxRel) maxRel = r;
    }
    for (var i = 0; i < dotEls.length; i++) {
      var d = dotEls[i];
      if (i === activeIdx) {
        d.el.setAttribute('fill', 'rgba(255,80,80,0.95)');
        d.el.setAttribute('stroke', 'rgba(255,255,255,1)');
        d.el.setAttribute('stroke-width', '2'); d.el.setAttribute('r', '6');
      } else {
        var relNorm = maxRel > 0 ? rawRels[i] / maxRel : 0;
        var fa = Math.max(0.08, Math.min(0.90, Math.sqrt(relNorm)));
        d.el.setAttribute('fill', 'rgba(124,111,247,' + fa.toFixed(3) + ')');
        d.el.setAttribute('stroke', 'rgba(255,255,255,' + Math.max(0.15, fa * 0.6).toFixed(3) + ')');
        d.el.setAttribute('stroke-width', '1'); d.el.setAttribute('r', '4');
      }
    }
  }

  function clearHighlight() {
    for (var i = 0; i < dotEls.length; i++) {
      var d = dotEls[i];
      d.el.setAttribute('fill', d.isBest ? 'rgba(124,111,247,0.9)' : 'rgba(255,255,255,0.3)');
      d.el.setAttribute('stroke', d.isBest ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)');
      d.el.setAttribute('stroke-width', '1'); d.el.setAttribute('r', '4');
    }
    pinnedIdx = -1;
  }

  function buildTooltip(d) {
    var html = '<div class="tt-title">trial ' + d.idx + '</div>';
    // All outcomes
    predictor.outcomeNames.forEach(function(name) {
      var yArr = allOutcomeY[name];
      if (!yArr || d.idx >= yArr.length) return;
      var isSel = name === selectedOutcome;
      html += (isSel ? '<b>' : '<span style="color:#888">') +
        name + ' = <span class="tt-val">' + yArr[d.idx].toFixed(4) + '</span>' +
        (isSel ? '</b>' : '</span>') + '<br>';
    });
    html += 'best so far = <span class="tt-val">' + d.best.toFixed(4) + '</span>';
    // Parameters
    html += '<hr style="border-color:#333;margin:4px 0">';
    paramNames.forEach(function(name, j) {
      html += '<span style="color:#888">' + name + '</span> = ' +
        formatParamValue(d.pt[j], params[j]) + '<br>';
    });
    return html;
  }

  container.addEventListener('mousemove', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = findNearest(px, py);
    if (best >= 0) {
      showTooltip(tooltip, buildTooltip(dotEls[best]), e.clientX, e.clientY);
      container.style.cursor = 'pointer';
      if (pinnedIdx < 0) highlightNeighbors(best);
    } else {
      hideTooltip(tooltip);
      container.style.cursor = 'crosshair';
      if (pinnedIdx < 0) clearHighlight();
    }
  });

  container.addEventListener('click', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = findNearest(px, py);
    if (best >= 0) { pinnedIdx = best; highlightNeighbors(best); }
    else { clearHighlight(); }
  });

  container.addEventListener('mouseleave', function() {
    hideTooltip(tooltip);
    if (pinnedIdx < 0) clearHighlight();
  });
}

outcomeSelect.addEventListener('change', function() { selectedOutcome = outcomeSelect.value; render(); });
document.getElementById('dirSelect').addEventListener('change', render);
document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;
}
