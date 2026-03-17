import { libraryScript, sharedUtilsScript, fixtureScript, hartmannMixedFixture, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Slice Plots</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f0f11; color: #e0e0e0;
    padding: 2rem; min-height: 100vh;
  }
  h1 { font-size: 18px; font-weight: 500; color: #f0f0f0; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 20px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  label { font-size: 13px; color: #aaa; }
  select, button, input[type=file] {
    font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #444;
    background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none;
  }
  button:hover { background: #252528; }
  .section-label {
    font-size: 11px; color: #555; letter-spacing: 0.06em;
    text-transform: uppercase; margin: 14px 0 8px;
  }
  .slrow { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
  .sllbl { font-size: 13px; color: #888; min-width: 60px; }
  input[type=range] { flex: 1; min-width: 100px; accent-color: #7c6ff7; cursor: pointer; }
  .slval { font-size: 13px; font-weight: 500; color: #ccc; min-width: 50px; text-align: right; }
  .slselect { flex:1; font-size:13px; padding:4px 8px; border-radius:6px;
              border:0.5px solid #444; background:#1a1a1d; color:#e0e0e0; outline:none; }
  #plots { display: flex; flex-wrap: wrap; gap: 16px; }
  .plot-container {
    width: 380px; height: 260px;
    background: #141418; border: 0.5px solid #222; border-radius: 8px;
    overflow: hidden;
  }
  .no-data {
    display: flex; align-items: center; justify-content: center;
    height: 200px; color: #555; font-size: 14px;
  }
  #tooltip {
    position: fixed; display: none;
    background: #1e1e22; border: 0.5px solid #555;
    border-radius: 7px; padding: 9px 13px;
    font-size: 12px; color: #ccc;
    pointer-events: none; z-index: 100;
    line-height: 1.8; white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }
  #tooltip .tt-val { color: #ff6b6b; font-weight: 500; }
  #tooltip .tt-coord { color: #a0c4ff; }
  #tooltip .tt-title {
    font-size: 11px; color: #888; letter-spacing: 0.05em;
    text-transform: uppercase; margin-bottom: 4px;
  }
</style>
</head>
<body>

<h1>${axHomeLink}Ax-Style 1D Slice Plots</h1>
<p class="subtitle" id="subtitle">Load a fixture JSON to visualize GP posterior slices</p>

<div class="controls">
  <label>Fixture: <input type="file" id="fileInput" accept=".json"></label>
  <label>Outcome: <select id="outcomeSelect"><option value="0">y0</option></select></label>
</div>

<div id="plots"><div class="no-data">Loading...</div></div>
<div class="section-label" id="sliderLabel" style="display:none">Fixed dimension values</div>
<div id="sliders" style="display:none"></div>
<div id="tooltip"></div>

${libraryScript()}
${sharedUtilsScript()}
${fixtureScript('__DEFAULT_FIXTURE__', hartmannMixedFixture)}

<script>
var Predictor = Ax.Predictor;

var predictor = null;
var fixture = null;
var params = [];
var paramNames = [];
var paramBounds = [];
var fixedValues = [];
var selectedOutcome = '';
var globalYRange = {}; // per-outcome { min, max } for stable y-axis
var dimOrder = []; // dims sorted by importance (smallest lengthscale first)
var slicePinnedIdx = -1; // persists across renderPlots() calls

var plotsDiv = document.getElementById('plots');
var slidersDiv = document.getElementById('sliders');
var sliderLabel = document.getElementById('sliderLabel');
var outcomeSelect = document.getElementById('outcomeSelect');
var tooltip = document.getElementById('tooltip');

// Pre-compute stable y-axis range by sampling across the design space
function precomputeYRange() {
  globalYRange = {};
  var nSample = 200;
  var pts = [];
  for (var i = 0; i < nSample; i++) {
    pts.push(params.map(function(p, j) {
      if (isChoice(p)) return p.values[Math.floor(Math.random() * p.values.length)];
      if (isInteger(p)) return Math.round(paramBounds[j][0] + Math.random() * (paramBounds[j][1] - paramBounds[j][0]));
      return paramBounds[j][0] + Math.random() * (paramBounds[j][1] - paramBounds[j][0]);
    }));
  }
  predictor.outcomeNames.forEach(function(name) {
    var preds = predictor.predict(pts);
    var pred = preds[name];
    var lo = Infinity, hi = -Infinity;
    for (var j = 0; j < nSample; j++) {
      var s = Math.sqrt(pred.variance[j]);
      var lower = pred.mean[j] - 2 * s;
      var upper = pred.mean[j] + 2 * s;
      if (lower < lo) lo = lower;
      if (upper > hi) hi = upper;
    }
    // Also include training Y values
    var td = predictor.getTrainingData(name);
    if (td.Y) {
      td.Y.forEach(function(yv) {
        if (yv < lo) lo = yv;
        if (yv > hi) hi = yv;
      });
    }
    var pad = 0.05 * (hi - lo);
    globalYRange[name] = { min: lo - pad, max: hi + pad };
  });
}

function loadFixtureData(data) {
  fixture = normalizeFixture(data);
  predictor = new Predictor(fixture);

  params = fixture.search_space.parameters;
  paramNames = predictor.paramNames;
  paramBounds = predictor.paramBounds;
  var _td = predictor.getTrainingData();
  fixedValues = _td.X.length > 0 ? _td.X[0].slice() : params.map(function(p) { return defaultParamValue(p); });

  outcomeSelect.innerHTML = '';
  predictor.outcomeNames.forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    outcomeSelect.appendChild(opt);
  });
  selectedOutcome = predictor.outcomeNames[0];

  document.getElementById('subtitle').textContent =
    fixture.metadata.name + ' — ' + fixture.metadata.description;

  precomputeYRange();
  updateDimOrder();
}

function updateDimOrder() {
  dimOrder = computeDimOrder(predictor, paramNames.length, selectedOutcome);
  buildSliders();
  renderPlots();
}

document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

outcomeSelect.addEventListener('change', function() {
  selectedOutcome = outcomeSelect.value;
  updateDimOrder();
});

function buildSliders() {
  if (paramNames.length <= 1) {
    slidersDiv.style.display = 'none';
    sliderLabel.style.display = 'none';
    return;
  }
  slidersDiv.style.display = 'block';
  sliderLabel.style.display = 'block';
  slidersDiv.innerHTML = '';
  dimOrder.forEach(function(i) {
    var name = paramNames[i];
    var p = params[i];
    var row = document.createElement('div'); row.className = 'slrow';
    var lbl = document.createElement('span'); lbl.className = 'sllbl';
    lbl.textContent = name;

    if (isChoice(p)) {
      // Dropdown for choice params
      var sel = document.createElement('select'); sel.className = 'slselect';
      p.values.forEach(function(v) {
        var o = document.createElement('option');
        o.value = v; o.textContent = String(v);
        if (v == fixedValues[i]) o.selected = true;
        sel.appendChild(o);
      });
      var val = document.createElement('span'); val.className = 'slval';
      val.textContent = formatParamValue(fixedValues[i], p);
      sel.addEventListener('change', function() {
        fixedValues[i] = +sel.value;
        val.textContent = formatParamValue(+sel.value, p);
        renderPlots();
      });
      row.appendChild(lbl); row.appendChild(sel); row.appendChild(val);
    } else {
      var lo = paramBounds[i][0], hi = paramBounds[i][1];
      var sl = document.createElement('input');
      sl.type = 'range'; sl.min = lo; sl.max = hi;
      sl.step = isInteger(p) ? '1' : ((hi - lo) / 200).toString();
      sl.value = fixedValues[i].toString();
      var val = document.createElement('span'); val.className = 'slval';
      val.textContent = formatParamValue(fixedValues[i], p);
      sl.addEventListener('input', function() {
        fixedValues[i] = isInteger(p) ? Math.round(+sl.value) : +sl.value;
        val.textContent = formatParamValue(fixedValues[i], p);
        renderPlots();
      });
      row.appendChild(lbl); row.appendChild(sl); row.appendChild(val);
    }
    slidersDiv.appendChild(row);
  });
}

function renderPlots() {
  if (!predictor) return;
  plotsDiv.innerHTML = '';
  var nDim = paramNames.length;
  var nSlice = 80;

  for (var di = 0; di < nDim; di++) {
    var dim = dimOrder[di];
    var dimParam = params[dim];
    var dimIsChoice = isChoice(dimParam);
    var dimIsInt = isInteger(dimParam);
    var lo, hi, xs;

    if (dimIsChoice) {
      xs = dimParam.values.map(Number);
      lo = 0; hi = xs.length - 1;
    } else if (dimIsInt) {
      lo = paramBounds[dim][0]; hi = paramBounds[dim][1];
      xs = [];
      for (var iv = Math.ceil(lo); iv <= Math.floor(hi); iv++) xs.push(iv);
    } else {
      lo = paramBounds[dim][0]; hi = paramBounds[dim][1];
      xs = Array.from({ length: nSlice }, function(_, i) { return lo + (hi - lo) * i / (nSlice - 1); });
    }

    var testPoints = xs.map(function(v) {
      var pt = fixedValues.slice();
      pt[dim] = v;
      return pt;
    });

    var pred = predictor.predict(testPoints)[selectedOutcome];

    var container = document.createElement('div');
    container.className = 'plot-container';

    var W = 380, H = 260, pad = { top: 30, right: 20, bottom: 36, left: 55 };
    var pw = W - pad.left - pad.right;
    var ph = H - pad.top - pad.bottom;

    var means = Array.from(pred.mean);
    var stds = means.map(function(_, i) { return Math.sqrt(pred.variance[i]); });
    var upper = means.map(function(m, i) { return m + 2 * stds[i]; });
    var lower = means.map(function(m, i) { return m - 2 * stds[i]; });

    // Use pre-computed stable y-axis range
    var yr = globalYRange[selectedOutcome] || { min: Math.min.apply(null, lower), max: Math.max.apply(null, upper) };
    var yMin = yr.min, yMax = yr.max;
    var yRange = yMax - yMin || 1;

    // For choice dims, use index-based x scaling (evenly spaced, centered in equal-width cells)
    var sx;
    if (dimIsChoice) {
      sx = (function(n, pw, pad) { return function(ci) { return pad.left + (ci + 0.5) / n * pw; }; })(xs.length, pw, pad);
    } else {
      sx = (function(lo, hi, pw, pad) { return function(v) { return pad.left + (v - lo) / ((hi - lo) || 1) * pw; }; })(lo, hi, pw, pad);
    }
    var sy = (function(yMin, yRange, ph, pad) { return function(v) { return pad.top + (1 - (v - yMin) / yRange) * ph; }; })(yMin, yRange, ph, pad);

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    if (dimIsChoice) {
      // Discrete points with vertical error bars for choice params
      for (var ci = 0; ci < xs.length; ci++) {
        var cx = sx(ci), cyMu = sy(means[ci]);
        var cyUp = sy(upper[ci]), cyLo = sy(lower[ci]);
        // Error bar line
        var ebar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ebar.setAttribute('x1', cx); ebar.setAttribute('y1', cyUp);
        ebar.setAttribute('x2', cx); ebar.setAttribute('y2', cyLo);
        ebar.setAttribute('stroke', 'rgba(100,120,230,0.5)'); ebar.setAttribute('stroke-width', '2');
        svg.appendChild(ebar);
        // Error bar caps
        [cyUp, cyLo].forEach(function(capY) {
          var cap = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          cap.setAttribute('x1', cx - 4); cap.setAttribute('y1', capY);
          cap.setAttribute('x2', cx + 4); cap.setAttribute('y2', capY);
          cap.setAttribute('stroke', 'rgba(100,120,230,0.5)'); cap.setAttribute('stroke-width', '1.5');
          svg.appendChild(cap);
        });
        // Mean dot
        var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', cx); dot.setAttribute('cy', cyMu);
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', 'rgba(130,155,255,0.9)');
        dot.setAttribute('stroke', 'white'); dot.setAttribute('stroke-width', '1.5');
        svg.appendChild(dot);
      }
    } else {
      // CI band (continuous)
      var bandPath = 'M ' + sx(xs[0]) + ' ' + sy(upper[0]);
      for (var i = 1; i < xs.length; i++) bandPath += ' L ' + sx(xs[i]) + ' ' + sy(upper[i]);
      for (var i = xs.length - 1; i >= 0; i--) bandPath += ' L ' + sx(xs[i]) + ' ' + sy(lower[i]);
      bandPath += ' Z';
      var band = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      band.setAttribute('d', bandPath);
      band.setAttribute('fill', 'rgba(100,120,230,0.18)');
      svg.appendChild(band);

      // Mean line
      var linePath = 'M ' + sx(xs[0]) + ' ' + sy(means[0]);
      for (var i = 1; i < xs.length; i++) linePath += ' L ' + sx(xs[i]) + ' ' + sy(means[i]);
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', linePath);
      line.setAttribute('stroke', 'rgba(130,155,255,0.9)');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('fill', 'none');
      svg.appendChild(line);
    }

    // Training points with kernel-distance-based opacity
    var td = predictor.getTrainingData(selectedOutcome);
    var visiblePts = []; // track screen coords, data, and SVG refs for hover/click
    if (td.X.length > 0) {
      td.X.forEach(function(pt, idx) {
        var yVal = td.Y[idx];
        var ptScreenX;
        if (dimIsChoice) {
          var ci = xs.indexOf(pt[dim]);
          if (ci < 0) { // fuzzy match for floating-point category values
            var bestCi = 0, bestCd = Infinity;
            for (var cj = 0; cj < xs.length; cj++) {
              var cd = Math.abs(xs[cj] - pt[dim]);
              if (cd < bestCd) { bestCd = cd; bestCi = cj; }
            }
            ci = bestCi;
          }
          ptScreenX = sx(ci);
        } else {
          ptScreenX = sx(pt[dim]);
        }
        var ptScreenY = sy(yVal);
        if (ptScreenY >= pad.top && ptScreenY <= H - pad.bottom) {
          var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', ptScreenX); dot.setAttribute('cy', ptScreenY);
          dot.setAttribute('r', '3');
          dot.setAttribute('fill', 'rgba(255,80,80,0.85)');
          dot.setAttribute('stroke', 'rgba(255,255,255,0.5)');
          dot.setAttribute('stroke-width', '1');
          svg.appendChild(dot);
          visiblePts.push({ cx: ptScreenX, cy: ptScreenY, idx: idx, pt: pt, yVal: yVal, dot: dot });
        }
      });
    }

    // Axes
    function makeText(x, y, text, opts) {
      opts = opts || {};
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('fill', opts.fill || '#666');
      t.setAttribute('font-size', opts.size || '11');
      t.setAttribute('text-anchor', opts.anchor || 'middle');
      t.textContent = text;
      return t;
    }

    svg.appendChild(makeText(pad.left + pw / 2, H - 4, paramNames[dim]));
    var nYTicks = 4;
    for (var t = 0; t <= nYTicks; t++) {
      var yv = yMin + (yRange * t) / nYTicks;
      var yp = sy(yv);
      svg.appendChild(makeText(pad.left - 6, yp + 4, yv.toFixed(2), { anchor: 'end', size: '10' }));
      var tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', pad.left); tick.setAttribute('y1', yp);
      tick.setAttribute('x2', pad.left + pw); tick.setAttribute('y2', yp);
      tick.setAttribute('stroke', 'rgba(255,255,255,0.06)');
      svg.appendChild(tick);
    }
    if (dimIsChoice) {
      // Show category labels
      for (var ci = 0; ci < xs.length; ci++) {
        svg.appendChild(makeText(sx(ci), H - pad.bottom + 16, String(dimParam.values[ci]), { size: '10' }));
      }
    } else {
      var nXTicks = dimIsInt ? Math.min(xs.length - 1, 4) : 4;
      for (var t = 0; t <= nXTicks; t++) {
        var xv = lo + (hi - lo) * t / nXTicks;
        if (dimIsInt) xv = Math.round(xv);
        var xp = sx(xv);
        svg.appendChild(makeText(xp, H - pad.bottom + 16, dimIsInt ? String(xv) : xv.toFixed(2), { size: '10' }));
      }
    }
    svg.appendChild(makeText(pad.left + pw / 2, 16, paramNames[dim], { fill: '#999', size: '13' }));

    // Hover overlay elements (line + dot on mean curve)
    var hoverLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hoverLine.setAttribute('y1', pad.top); hoverLine.setAttribute('y2', pad.top + ph);
    hoverLine.setAttribute('stroke', 'rgba(255,255,255,0.3)'); hoverLine.setAttribute('stroke-width', '1');
    hoverLine.style.display = 'none';
    svg.appendChild(hoverLine);

    var hoverDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hoverDot.setAttribute('r', '4'); hoverDot.setAttribute('fill', 'rgba(130,155,255,0.9)');
    hoverDot.setAttribute('stroke', 'white'); hoverDot.setAttribute('stroke-width', '1.5');
    hoverDot.style.display = 'none';
    svg.appendChild(hoverDot);

    container.style.cursor = 'crosshair';
    container.appendChild(svg);

    // Attach hover/click to the container div
    (function(dim, xs, means, stds, sx, sy, hoverLine, hoverDot, lo, hi, pw, pad, container, svg, visiblePts, dimParam, dimIsChoice) {
      var HOVER_R = 10; // pixel radius for point hit detection
      var hoverHighlight = false;

      // Resolve slicePinnedIdx (training point index) → visiblePts index
      function pinnedVpIdx() {
        if (slicePinnedIdx < 0) return -1;
        for (var i = 0; i < visiblePts.length; i++) {
          if (visiblePts[i].idx === slicePinnedIdx) return i;
        }
        return -1;
      }

      function findHit(px, py) {
        for (var pi = 0; pi < visiblePts.length; pi++) {
          var vp = visiblePts[pi];
          var dx = px - vp.cx, dy = py - vp.cy;
          if (dx * dx + dy * dy < HOVER_R * HOVER_R) return pi;
        }
        return -1;
      }

      // Show neighbor distances: relative scaling so nearest neighbor is always
      // bright regardless of dimensionality. Uses (raw/max)^0.5 for gentle decay.
      function highlightNeighbors(activeVpIdx) {
        var active = visiblePts[activeVpIdx];
        var rawRels = [];
        var maxRel = 0;
        for (var i = 0; i < visiblePts.length; i++) {
          if (i === activeVpIdx) { rawRels.push(1); continue; }
          var r = predictor.kernelCorrelation(visiblePts[i].pt, active.pt, selectedOutcome);
          rawRels.push(r);
          if (r > maxRel) maxRel = r;
        }
        for (var i = 0; i < visiblePts.length; i++) {
          var vp = visiblePts[i];
          if (i === activeVpIdx) {
            vp.dot.setAttribute('fill', 'rgba(255,80,80,0.95)');
            vp.dot.setAttribute('stroke', 'rgba(255,255,255,1)');
            vp.dot.setAttribute('stroke-width', '2');
            vp.dot.setAttribute('r', '5');
          } else {
            var relNorm = maxRel > 0 ? rawRels[i] / maxRel : 0;
            var fa = Math.max(0.08, Math.min(0.90, Math.sqrt(relNorm)));
            vp.dot.setAttribute('fill', 'rgba(255,80,80,' + fa.toFixed(3) + ')');
            vp.dot.setAttribute('stroke', 'rgba(255,255,255,' + Math.max(0.15, fa * 0.6).toFixed(3) + ')');
            vp.dot.setAttribute('stroke-width', '1');
            vp.dot.setAttribute('r', '3');
          }
        }
      }

      function clearHighlight() {
        for (var i = 0; i < visiblePts.length; i++) {
          var vp = visiblePts[i];
          vp.dot.setAttribute('fill', 'rgba(255,80,80,0.85)');
          vp.dot.setAttribute('stroke', 'rgba(255,255,255,0.5)');
          vp.dot.setAttribute('stroke-width', '1');
          vp.dot.setAttribute('r', '3');
        }
      }

      // Restore highlight after re-render if a point was pinned
      var pvIdx = pinnedVpIdx();
      if (pvIdx >= 0) highlightNeighbors(pvIdx);

      container.addEventListener('mousemove', function(e) {
        var rect = container.getBoundingClientRect();
        var px = e.clientX - rect.left;
        var py = e.clientY - rect.top;
        if (px < pad.left || px > pad.left + pw) {
          hoverLine.style.display = 'none';
          hoverDot.style.display = 'none';
          hideTooltip(tooltip);
          return;
        }

        var hitVpIdx = findHit(px, py);

        if (hitVpIdx >= 0) {
          var hitPt = visiblePts[hitVpIdx];
          hoverLine.style.display = 'none';
          hoverDot.style.display = 'none';
          container.style.cursor = 'pointer';

          if (slicePinnedIdx === -1) {
            highlightNeighbors(hitVpIdx);
            hoverHighlight = true;
          }

          var html = '<div class="tt-title">training point #' + (hitPt.idx + 1) + '</div>' +
            '<span class="tt-val">y = ' + hitPt.yVal.toFixed(4) + '</span><br>' +
            paramNames.map(function(name, j) {
              return '<span class="tt-coord">' + name + '</span> = ' + formatParamValue(hitPt.pt[j], params[j]);
            }).join('<br>');
          showTooltip(tooltip, html, e.clientX, e.clientY);
        } else {
          container.style.cursor = 'crosshair';
          if (slicePinnedIdx === -1 && hoverHighlight) {
            clearHighlight();
            hoverHighlight = false;
          }

          var frac = (px - pad.left) / pw;
          var idx;
          if (dimIsChoice) {
            idx = Math.floor(frac * xs.length);
            idx = Math.max(0, Math.min(xs.length - 1, idx));
          } else {
            idx = Math.round(frac * (xs.length - 1));
            idx = Math.max(0, Math.min(xs.length - 1, idx));
          }
          var mu = means[idx], s = stds[idx];
          var screenX = dimIsChoice ? sx(idx) : sx(xs[idx]);

          hoverLine.setAttribute('x1', screenX); hoverLine.setAttribute('x2', screenX);
          hoverLine.style.display = '';
          hoverDot.setAttribute('cx', screenX); hoverDot.setAttribute('cy', sy(mu));
          hoverDot.style.display = '';

          var xLabel = dimIsChoice ? String(dimParam.values[idx]) : formatParamValue(xs[idx], dimParam);
          var html = '<div class="tt-title">' + paramNames[dim] + '</div>' +
            '<span class="tt-coord">' + paramNames[dim] + '</span> = ' + xLabel + '<br>' +
            'μ = <span class="tt-val">' + mu.toFixed(4) + '</span><br>' +
            'σ = ' + s.toFixed(4) + '<br>' +
            '95% CI: [' + (mu - 2*s).toFixed(4) + ', ' + (mu + 2*s).toFixed(4) + ']';
          showTooltip(tooltip, html, e.clientX, e.clientY);
        }
      });

      container.addEventListener('click', function(e) {
        var rect = container.getBoundingClientRect();
        var px = e.clientX - rect.left;
        var py = e.clientY - rect.top;
        var hitVpIdx = findHit(px, py);

        if (hitVpIdx >= 0) {
          var hitTrainIdx = visiblePts[hitVpIdx].idx;
          if (slicePinnedIdx === hitTrainIdx) {
            slicePinnedIdx = -1;
            clearHighlight();
          } else {
            slicePinnedIdx = hitTrainIdx;
            var clickedPt = visiblePts[hitVpIdx].pt;
            for (var j = 0; j < fixedValues.length; j++) fixedValues[j] = clickedPt[j];
            buildSliders();
            renderPlots();
            return;
          }
        } else {
          if (slicePinnedIdx >= 0) {
            slicePinnedIdx = -1;
            clearHighlight();
          }
        }
        hoverHighlight = false;
      });

      container.addEventListener('mouseleave', function() {
        hoverLine.style.display = 'none';
        hoverDot.style.display = 'none';
        container.style.cursor = 'crosshair';
        hideTooltip(tooltip);
        if (slicePinnedIdx === -1 && hoverHighlight) {
          clearHighlight();
          hoverHighlight = false;
        }
      });
    })(dim, xs, means, stds, sx, sy, hoverLine, hoverDot, lo, hi, pw, pad, container, svg, visiblePts, dimParam, dimIsChoice);

    plotsDiv.appendChild(container);
  }
}

// Auto-load embedded fixture
loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;
}
