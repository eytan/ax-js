import { libraryScript, sharedUtilsScript, fixtureScript, penicillinFixture, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — LOO Cross-Validation</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f0f11; color: #e0e0e0; padding: 2rem; min-height: 100vh; }
  h1 { font-size: 18px; font-weight: 500; color: #f0f0f0; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 16px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  label { font-size: 13px; color: #aaa; }
  select, button, input[type=file] { font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #444; background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none; }
  button:hover { background: #252528; }
  #plotArea { display: flex; gap: 12px; flex-wrap: wrap; }
  .cv-tile { background: #141418; border: 0.5px solid #222;
    border-radius: 8px; overflow: hidden; position: relative; }
  .cv-title { font-size: 13px; font-weight: 500; color: #ccc; text-align: center; padding: 6px 0 0; }
  .hint { font-size: 11px; color: #555; margin-top: 8px; }
  #tooltip { position: fixed; background: rgba(20,20,24,0.95); border: 0.5px solid #444;
    border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none;
    display: none; z-index: 100; max-width: 300px; }
  .tt-title { font-weight: 600; color: #aaa; margin-bottom: 4px; }
  .tt-val { color: #7c9aff; }
</style>
</head>
<body>
<h1>${axHomeLink}Leave-One-Out Cross-Validation</h1>
<div class="subtitle" id="subtitle">Observed vs predicted — load a fixture to begin</div>
<div class="controls">
  <label>Outcome: <select id="outcomeSelect"></select></label>
  <label>File: <input type="file" id="fileInput" accept=".json"></label>
</div>
<div id="plotArea"></div>
<div class="hint">Click a point to see kernel-distance neighbors. Click empty space to clear.</div>
<div id="tooltip"></div>
${libraryScript()}
${fixtureScript('__DEFAULT_FIXTURE__', penicillinFixture)}
${sharedUtilsScript()}
<script>
var Predictor = Ax.Predictor;
var predictor, fixture, selectedOutcome;
var cvPinnedIdx = -1;
var plotPanels = [];
var allOutcomeY = {};
var tooltip = document.getElementById('tooltip');
var outcomeSelect = document.getElementById('outcomeSelect');

function broadcastHighlight(idx, rels) {
  plotPanels.forEach(function(p) { p.highlight(idx, rels); });
}
function broadcastClear() {
  plotPanels.forEach(function(p) { p.clear(); });
  cvPinnedIdx = -1;
}
// Compute kernel correlations once (shared across panels)
function computeRels(activeIdx, pts, outcomeName) {
  var rawRels = [], maxRel = 0;
  for (var i = 0; i < pts.length; i++) {
    if (i === activeIdx) { rawRels.push(1); continue; }
    var r = predictor.kernelCorrelation(pts[i], pts[activeIdx], outcomeName);
    rawRels.push(r);
    if (r > maxRel) maxRel = r;
  }
  return { raw: rawRels, max: maxRel };
}

function buildParamTooltip(idx, pts) {
  var paramNames = predictor.paramNames;
  var params = fixture.search_space.parameters;
  var html = '';
  // All outcomes
  predictor.outcomeNames.forEach(function(name) {
    var yArr = allOutcomeY[name];
    if (!yArr || idx >= yArr.length) return;
    var isSel = name === selectedOutcome;
    html += (isSel ? '<b>' : '<span style="color:#888">') +
      name + ' = <span class="tt-val">' + yArr[idx].toFixed(4) + '</span>' +
      (isSel ? '</b>' : '</span>') + '<br>';
  });
  // Parameters
  html += '<hr style="border-color:#333;margin:4px 0">';
  paramNames.forEach(function(name, j) {
    html += '<span style="color:#888">' + name + '</span> = ' +
      formatParamValue(pts[idx][j], params[j]) + '<br>';
  });
  return html;
}

function loadFixtureData(data) {
  fixture = normalizeFixture(data);
  cvPinnedIdx = -1;
  predictor = new Predictor(fixture);
  outcomeSelect.innerHTML = '';
  // Add "All" option if multi-output
  if (predictor.outcomeNames.length > 1) {
    var allOpt = document.createElement('option');
    allOpt.value = '__all__'; allOpt.textContent = 'All outcomes';
    outcomeSelect.appendChild(allOpt);
  }
  predictor.outcomeNames.forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    outcomeSelect.appendChild(opt);
  });
  selectedOutcome = predictor.outcomeNames.length > 1 ? '__all__' : predictor.outcomeNames[0];
  outcomeSelect.value = selectedOutcome;
  document.getElementById('subtitle').textContent =
    (fixture.metadata.name || 'Fixture') + ' — leave-one-out cross-validation';
  render();
}

// Render a single LOO-CV plot for one outcome into a container element.
// W/H control the SVG size (small multiples use smaller sizes).
function renderCVPlot(outcomeName, container, W, H) {
  var loo = predictor.loocv(outcomeName);
  if (loo.observed.length === 0) { container.textContent = 'No data'; return; }

  var observed = loo.observed;
  var predicted = loo.mean;
  var predStd = loo.variance.map(function(v) { return Math.sqrt(v); });
  var td = predictor.getTrainingData(outcomeName);
  var n = observed.length;
  var isSmall = W < 350;

  // R²
  var meanObs = observed.reduce(function(a,b){return a+b;}, 0) / n;
  var ssTot = 0, ssRes = 0;
  for (var i = 0; i < n; i++) {
    ssTot += (observed[i] - meanObs) * (observed[i] - meanObs);
    ssRes += (observed[i] - predicted[i]) * (observed[i] - predicted[i]);
  }
  var r2 = 1 - ssRes / ssTot;

  // Axis range
  var allVals = observed.concat(predicted);
  var lo = Math.min.apply(null, allVals), hi = Math.max.apply(null, allVals);
  for (var i = 0; i < n; i++) {
    lo = Math.min(lo, predicted[i] - 2 * predStd[i]);
    hi = Math.max(hi, predicted[i] + 2 * predStd[i]);
  }
  var pad = 0.08 * (hi - lo); lo -= pad; hi += pad;

  var margin = isSmall
    ? { top: 24, right: 12, bottom: 30, left: 42 }
    : { top: 30, right: 20, bottom: 40, left: 55 };
  var pw = W - margin.left - margin.right;
  var ph = H - margin.top - margin.bottom;

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W); svg.setAttribute('height', H);

  function sx(v) { return margin.left + (v - lo) / (hi - lo) * pw; }
  function sy(v) { return margin.top + ph - (v - lo) / (hi - lo) * ph; }

  // Diagonal
  var diag = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  diag.setAttribute('x1', sx(lo)); diag.setAttribute('y1', sy(lo));
  diag.setAttribute('x2', sx(hi)); diag.setAttribute('y2', sy(hi));
  diag.setAttribute('stroke', 'rgba(255,255,255,0.15)'); diag.setAttribute('stroke-width', '1');
  diag.setAttribute('stroke-dasharray', '4,4');
  svg.appendChild(diag);

  // CI whiskers + dots
  var dots = [];
  var dotR = isSmall ? 3 : 4;
  for (var i = 0; i < n; i++) {
    var cx = sx(observed[i]), cy = sy(predicted[i]);
    var ciLo = sy(predicted[i] - 2 * predStd[i]);
    var ciHi = sy(predicted[i] + 2 * predStd[i]);
    var whisker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    whisker.setAttribute('x1', cx); whisker.setAttribute('x2', cx);
    whisker.setAttribute('y1', ciHi); whisker.setAttribute('y2', ciLo);
    whisker.setAttribute('stroke', 'rgba(124,154,255,0.3)'); whisker.setAttribute('stroke-width', isSmall ? '1' : '1.5');
    svg.appendChild(whisker);
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', dotR);
    dot.setAttribute('fill', 'rgba(124,154,255,0.85)');
    dot.setAttribute('stroke', 'rgba(255,255,255,0.5)'); dot.setAttribute('stroke-width', '1');
    svg.appendChild(dot);
    dots.push({ cx: cx, cy: cy, obs: observed[i], pred: predicted[i], std: predStd[i], idx: i, pt: td.X[i], dot: dot, whisker: whisker, dotR: dotR });
  }

  // Axis labels (skip on small multiples)
  if (!isSmall) {
    var xl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xl.setAttribute('x', margin.left + pw/2); xl.setAttribute('y', H - 6);
    xl.setAttribute('fill', '#888'); xl.setAttribute('font-size', '13');
    xl.setAttribute('text-anchor', 'middle'); xl.textContent = 'Observed';
    svg.appendChild(xl);
    var yl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yl.setAttribute('x', 14); yl.setAttribute('y', margin.top + ph/2);
    yl.setAttribute('fill', '#888'); yl.setAttribute('font-size', '13');
    yl.setAttribute('text-anchor', 'middle');
    yl.setAttribute('transform', 'rotate(-90,' + 14 + ',' + (margin.top + ph/2) + ')');
    yl.textContent = 'LOO Predicted';
    svg.appendChild(yl);
  }

  // Axis ticks
  var nTicks = isSmall ? 3 : 5;
  var tickFontSize = isSmall ? '8' : '10';
  for (var t = 0; t <= nTicks; t++) {
    var v = lo + (hi - lo) * t / nTicks;
    var xt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xt.setAttribute('x', sx(v)); xt.setAttribute('y', margin.top + ph + (isSmall ? 12 : 16));
    xt.setAttribute('fill', '#555'); xt.setAttribute('font-size', tickFontSize);
    xt.setAttribute('text-anchor', 'middle'); xt.textContent = v.toFixed(isSmall ? 0 : 2);
    svg.appendChild(xt);
    var yt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yt.setAttribute('x', margin.left - 4); yt.setAttribute('y', sy(v) + 3);
    yt.setAttribute('fill', '#555'); yt.setAttribute('font-size', tickFontSize);
    yt.setAttribute('text-anchor', 'end'); yt.textContent = v.toFixed(isSmall ? 0 : 2);
    svg.appendChild(yt);
    var gl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    gl.setAttribute('x1', margin.left); gl.setAttribute('x2', margin.left + pw);
    gl.setAttribute('y1', sy(v)); gl.setAttribute('y2', sy(v));
    gl.setAttribute('stroke', 'rgba(255,255,255,0.04)');
    svg.appendChild(gl);
  }

  // R² annotation
  var r2text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  r2text.setAttribute('x', margin.left + 6); r2text.setAttribute('y', margin.top + (isSmall ? 14 : 18));
  r2text.setAttribute('fill', '#7c9aff'); r2text.setAttribute('font-size', isSmall ? '11' : '14');
  r2text.setAttribute('font-weight', '600');
  r2text.textContent = 'R\\u00B2 = ' + r2.toFixed(4);
  svg.appendChild(r2text);

  container.appendChild(svg);

  // ── Highlighting ──
  function findNearest(px, py) {
    var best = -1, bestD = isSmall ? 8 : 12;
    for (var i = 0; i < dots.length; i++) {
      var dx = px - dots[i].cx, dy = py - dots[i].cy;
      var d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function highlightDots(activeIdx, rels) {
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      if (i === activeIdx) {
        d.dot.setAttribute('fill', 'rgba(255,80,80,0.95)');
        d.dot.setAttribute('stroke', 'rgba(255,255,255,1)');
        d.dot.setAttribute('stroke-width', '2'); d.dot.setAttribute('r', d.dotR + 1);
        d.whisker.setAttribute('stroke', 'rgba(255,80,80,0.5)');
      } else {
        var relNorm = rels.max > 0 ? rels.raw[i] / rels.max : 0;
        var fa = Math.max(0.08, Math.min(0.90, Math.sqrt(relNorm)));
        d.dot.setAttribute('fill', 'rgba(255,80,80,' + fa.toFixed(3) + ')');
        d.dot.setAttribute('stroke', 'rgba(255,255,255,' + Math.max(0.15, fa * 0.6).toFixed(3) + ')');
        d.dot.setAttribute('stroke-width', '1'); d.dot.setAttribute('r', d.dotR);
        d.whisker.setAttribute('stroke', 'rgba(255,80,80,' + (fa * 0.35).toFixed(3) + ')');
      }
    }
  }

  function clearDots() {
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.dot.setAttribute('fill', 'rgba(124,154,255,0.85)');
      d.dot.setAttribute('stroke', 'rgba(255,255,255,0.5)');
      d.dot.setAttribute('stroke-width', '1'); d.dot.setAttribute('r', d.dotR);
      d.whisker.setAttribute('stroke', 'rgba(124,154,255,0.3)');
    }
  }

  plotPanels.push({ highlight: highlightDots, clear: clearDots });
  var trainPts = dots.map(function(d) { return d.pt; });

  container.addEventListener('mousemove', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = findNearest(px, py);
    if (best >= 0) {
      var d = dots[best];
      var html = '<div class="tt-title">' + outcomeName + ' — trial ' + d.idx + '</div>' +
        'observed = <span class="tt-val">' + d.obs.toFixed(4) + '</span><br>' +
        'LOO predicted = <span class="tt-val">' + d.pred.toFixed(4) + '</span><br>' +
        '\\u00B1 2\\u03C3 = [' + (d.pred - 2*d.std).toFixed(4) + ', ' + (d.pred + 2*d.std).toFixed(4) + ']<br>' +
        buildParamTooltip(d.idx, trainPts);
      showTooltip(tooltip, html, e.clientX, e.clientY);
      if (cvPinnedIdx < 0) broadcastHighlight(best, computeRels(best, trainPts, outcomeName));
    } else {
      hideTooltip(tooltip);
      if (cvPinnedIdx < 0) broadcastClear();
    }
  });

  container.addEventListener('click', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = findNearest(px, py);
    if (best >= 0) { cvPinnedIdx = best; broadcastHighlight(best, computeRels(best, trainPts, outcomeName)); }
    else { broadcastClear(); }
  });

  container.addEventListener('mouseleave', function() {
    hideTooltip(tooltip);
    if (cvPinnedIdx < 0) broadcastClear();
  });
}

// Render an optimization trace panel for one outcome.
function renderTracePanel(outcomeName, container, W, H) {
  var td = predictor.getTrainingData(outcomeName);
  if (td.Y.length === 0) { container.textContent = 'No data'; return; }

  var yVals = td.Y;
  var trainX = td.X;
  var n = yVals.length;

  // Determine direction from optimization_config
  var minimize = true;
  if (fixture.optimization_config && fixture.optimization_config.objectives) {
    var obj = fixture.optimization_config.objectives.find(function(o) { return o.name === outcomeName; });
    if (obj) minimize = obj.minimize;
  }

  // Running best
  var best = yVals[0];
  var bestSoFar = yVals.map(function(y) {
    if (minimize) { best = Math.min(best, y); }
    else { best = Math.max(best, y); }
    return best;
  });

  var yMin = Math.min.apply(null, yVals);
  var yMax = Math.max.apply(null, yVals);
  var yPad = 0.08 * (yMax - yMin || 1);
  yMin -= yPad; yMax += yPad;

  var margin = { top: 30, right: 20, bottom: 40, left: 55 };
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

  // Best-so-far step line
  var bsfPath = 'M ' + sx(0) + ' ' + sy(bestSoFar[0]);
  for (var i = 1; i < n; i++) {
    bsfPath += ' H ' + sx(i) + ' V ' + sy(bestSoFar[i]);
  }
  var bsfLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bsfLine.setAttribute('d', bsfPath);
  bsfLine.setAttribute('stroke', '#7c6ff7'); bsfLine.setAttribute('stroke-width', '2.5');
  bsfLine.setAttribute('fill', 'none'); bsfLine.setAttribute('opacity', '0.7');
  svg.appendChild(bsfLine);

  // Dots
  var dots = [];
  for (var i = 0; i < n; i++) {
    var isBest = bestSoFar[i] === yVals[i];
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', sx(i)); dot.setAttribute('cy', sy(yVals[i]));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', isBest ? 'rgba(124,111,247,0.9)' : 'rgba(255,255,255,0.3)');
    dot.setAttribute('stroke', isBest ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)');
    dot.setAttribute('stroke-width', '1');
    svg.appendChild(dot);
    dots.push({ cx: parseFloat(dot.getAttribute('cx')), cy: parseFloat(dot.getAttribute('cy')),
      idx: i, value: yVals[i], best: bestSoFar[i], isBest: isBest, pt: trainX[i], el: dot });
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
  yl.textContent = outcomeName + (minimize ? ' (min)' : ' (max)');
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

  // ── Highlighting ──
  function findNearest(px, py) {
    var best = -1, bestD = 12;
    for (var i = 0; i < dots.length; i++) {
      var dx = px - dots[i].cx, dy = py - dots[i].cy;
      var d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function highlightDots(activeIdx, rels) {
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      if (i === activeIdx) {
        d.el.setAttribute('fill', 'rgba(255,80,80,0.95)');
        d.el.setAttribute('stroke', 'rgba(255,255,255,1)');
        d.el.setAttribute('stroke-width', '2'); d.el.setAttribute('r', '6');
      } else {
        var relNorm = rels.max > 0 ? rels.raw[i] / rels.max : 0;
        var fa = Math.max(0.08, Math.min(0.90, Math.sqrt(relNorm)));
        d.el.setAttribute('fill', 'rgba(124,111,247,' + fa.toFixed(3) + ')');
        d.el.setAttribute('stroke', 'rgba(255,255,255,' + Math.max(0.15, fa * 0.6).toFixed(3) + ')');
        d.el.setAttribute('stroke-width', '1'); d.el.setAttribute('r', '4');
      }
    }
  }

  function clearDots() {
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.el.setAttribute('fill', d.isBest ? 'rgba(124,111,247,0.9)' : 'rgba(255,255,255,0.3)');
      d.el.setAttribute('stroke', d.isBest ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)');
      d.el.setAttribute('stroke-width', '1'); d.el.setAttribute('r', '4');
    }
  }

  plotPanels.push({ highlight: highlightDots, clear: clearDots });

  container.addEventListener('mousemove', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = findNearest(px, py);
    if (best >= 0) {
      var d = dots[best];
      var html = '<div class="tt-title">trial ' + d.idx + '</div>' +
        outcomeName + ' = <span class="tt-val">' + d.value.toFixed(4) + '</span><br>' +
        'best so far = <span class="tt-val">' + d.best.toFixed(4) + '</span><br>' +
        buildParamTooltip(d.idx, trainX);
      showTooltip(tooltip, html, e.clientX, e.clientY);
      container.style.cursor = 'pointer';
      if (cvPinnedIdx < 0) broadcastHighlight(best, computeRels(best, trainX, outcomeName));
    } else {
      hideTooltip(tooltip);
      container.style.cursor = 'crosshair';
      if (cvPinnedIdx < 0) broadcastClear();
    }
  });

  container.addEventListener('click', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = findNearest(px, py);
    if (best >= 0) { cvPinnedIdx = best; broadcastHighlight(best, computeRels(best, trainX, outcomeName)); }
    else { broadcastClear(); }
  });

  container.addEventListener('mouseleave', function() {
    hideTooltip(tooltip);
    if (cvPinnedIdx < 0) broadcastClear();
  });
}

function render() {
  var plotArea = document.getElementById('plotArea');
  plotArea.innerHTML = '';
  cvPinnedIdx = -1;
  plotPanels = [];

  // Pre-compute all outcome Y values for rich tooltips
  allOutcomeY = {};
  predictor.outcomeNames.forEach(function(name) {
    allOutcomeY[name] = predictor.getTrainingData(name).Y;
  });

  if (selectedOutcome === '__all__') {
    // Small multiples: 4 per row (LOO-CV only)
    var names = predictor.outcomeNames;
    var tileW = 280, tileH = 280;
    names.forEach(function(name) {
      var tile = document.createElement('div');
      tile.className = 'cv-tile';
      tile.style.width = tileW + 'px'; tile.style.height = (tileH + 28) + 'px';
      var title = document.createElement('div');
      title.className = 'cv-title'; title.textContent = name;
      tile.appendChild(title);
      renderCVPlot(name, tile, tileW, tileH);
      plotArea.appendChild(tile);
    });
  } else {
    // Side by side: LOO-CV + Optimization Trace
    var tile = document.createElement('div');
    tile.className = 'cv-tile';
    tile.style.width = '440px'; tile.style.height = '468px';
    var title = document.createElement('div');
    title.className = 'cv-title'; title.textContent = selectedOutcome + ' — LOO-CV';
    tile.appendChild(title);
    renderCVPlot(selectedOutcome, tile, 440, 440);
    plotArea.appendChild(tile);

    var traceTile = document.createElement('div');
    traceTile.className = 'cv-tile';
    traceTile.style.width = '440px'; traceTile.style.height = '468px';
    var traceTitle = document.createElement('div');
    traceTitle.className = 'cv-title'; traceTitle.textContent = selectedOutcome + ' — Optimization Trace';
    traceTile.appendChild(traceTitle);
    renderTracePanel(selectedOutcome, traceTile, 440, 440);
    plotArea.appendChild(traceTile);
  }
}

outcomeSelect.addEventListener('change', function() { selectedOutcome = outcomeSelect.value; render(); });
document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;
}
