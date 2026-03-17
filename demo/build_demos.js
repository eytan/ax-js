#!/usr/bin/env node
/**
 * Build self-contained demo HTML files.
 * Inlines the axjs IIFE bundle and default fixture data so demos work
 * when opened directly as file:// URLs (no server required).
 *
 * Usage: node demo/build_demos.js
 * Called automatically by `npm run build`.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const iifeBundle = readFileSync(join(root, 'dist/index.global.js'), 'utf8');
const braninFixture = readFileSync(join(root, 'test/fixtures/branin_matern25.json'), 'utf8');
const hartmannMixedFixture = readFileSync(join(root, 'test/fixtures/hartmann_mixed.json'), 'utf8');
const penicillinFixture = readFileSync(join(root, 'test/fixtures/penicillin_modellist.json'), 'utf8');

function libraryScript() {
  return `<script>\n${iifeBundle}\n</script>`;
}

function fixtureScript(varName, json) {
  return `<script>\nvar ${varName} = ${json};\n</script>`;
}

// Shared utility functions inlined into each demo that uses fixtures
const sharedUtilsCode = `
// ── Shared utilities ──
function isChoice(p) { return p.type === 'choice'; }
function isInteger(p) { return p.type === 'range' && p.parameter_type === 'int'; }
function defaultParamValue(p) {
  if (isChoice(p)) return p.values[0];
  if (isInteger(p)) return Math.round((p.bounds[0] + p.bounds[1]) / 2);
  return (p.bounds[0] + p.bounds[1]) / 2;
}
function formatParamValue(val, p) {
  if (isChoice(p)) return String(val);
  if (isInteger(p)) return String(Math.round(val));
  return val.toFixed(3);
}
function computeDimOrder(predictor, nDim, selectedOutcome) {
  var ranked = predictor.rankDimensionsByImportance(selectedOutcome);
  if (!ranked || ranked.length === 0) return Array.from({length:nDim}, function(_,i){return i;});
  var order = ranked.map(function(d){return d.dimIndex;});
  if (order.length < nDim) {
    var inRanked = new Set(order);
    for (var di = 0; di < nDim; di++) {
      if (!inRanked.has(di)) order.push(di);
    }
  }
  return order;
}
// Kernel-distance relevance between two points (for neighbor highlighting).
// Returns exp(-0.5*d²) where d² is scaled squared distance.
function pointRelevance(pt, fixedValues, plottedDims, ls, inputTf, params) {
  var d2 = 0;
  for (var j = 0; j < fixedValues.length; j++) {
    if (plottedDims.indexOf(j) >= 0) continue;
    if (params && params[j] && isChoice(params[j])) {
      if (pt[j] !== fixedValues[j]) d2 += 4;
      continue;
    }
    var diff = pt[j] - fixedValues[j];
    var coeff = (inputTf && inputTf.coefficient) ? inputTf.coefficient[j] : 1;
    var lsj = (ls && j < ls.length) ? ls[j] : 1;
    var scaled = diff / coeff / lsj;
    d2 += scaled * scaled;
  }
  return Math.exp(-0.5 * d2);
}
function normalizeFixture(data) {
  if (data.experiment) {
    var result = {
      search_space: data.experiment.search_space,
      model_state: data.experiment.model_state,
      metadata: Object.assign(
        {name: data.experiment.name || '', description: data.experiment.description || ''},
        data.test && data.test.metadata || {}
      ),
      test_points: data.test && data.test.test_points || []
    };
    if (data.experiment.outcome_names) result.outcome_names = data.experiment.outcome_names;
    if (data.experiment.optimization_config) result.optimization_config = data.experiment.optimization_config;
    if (data.experiment.status_quo) result.status_quo = data.experiment.status_quo;
    if (data.experiment.adapter_transforms) result.adapter_transforms = data.experiment.adapter_transforms;
    return result;
  }
  return data;
}
function showTooltip(tt, html, ex, ey) {
  tt.innerHTML = html;
  tt.style.display = 'block';
  tt.style.left = (ex + 16) + 'px';
  tt.style.top = (ey - 10) + 'px';
}
function hideTooltip(tt) { tt.style.display = 'none'; }
`;

function sharedUtilsScript() {
  return `<script>\n${sharedUtilsCode}\n</script>`;
}

// Inline Ax logo SVG (white wireframe, links back to index)
const axIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="22" height="22" style="vertical-align:-3px;margin-right:8px;opacity:0.7"><path fill="#fff" d="M761.76,600h0l200-346.16H550.12l-400,692.32H961.76ZM573.41,274H926.82L750.12,579.85ZM550.12,926H185.06L555.94,284.07,738.47,600Zm23.29,0L750.12,620.15,926.82,926Z"/></svg>`;
const axHomeLink = `<a href="index.html" style="text-decoration:none">${axIconSvg}</a>`;

// Shared colormap functions used by response_surface and point_proximity
const sharedColormapCode = `
function viridis(t) {
  t = Math.max(0, Math.min(1, t));
  var c = [[68,1,84],[72,32,111],[63,64,153],[50,101,176],[38,130,142],
    [63,151,120],[92,170,98],[140,188,80],[195,203,72],[253,231,37]];
  var idx = t * (c.length - 1);
  var lo = Math.floor(idx), hi = Math.min(lo + 1, c.length - 1), f = idx - lo;
  return c[lo].map(function(v, k) { return Math.round(v + f * (c[hi][k] - v)); });
}

function plasma(t) {
  t = Math.max(0, Math.min(1, t));
  var c = [[13,8,135],[75,3,161],[125,3,168],[168,34,150],[203,70,121],
    [229,107,93],[245,144,66],[252,180,36],[241,229,29]];
  var idx = t * (c.length - 1);
  var lo = Math.floor(idx), hi = Math.min(lo + 1, c.length - 1), f = idx - lo;
  return c[lo].map(function(v, k) { return Math.round(v + f * (c[hi][k] - v)); });
}

function drawColorbar(id, cfn) {
  var cvs = document.getElementById(id);
  cvs.width = cvs.offsetWidth || 200;
  cvs.height = cvs.offsetHeight || 24;
  var ctx = cvs.getContext('2d'), w = cvs.width, h = cvs.height;
  for (var i = 0; i < w; i++) {
    var rgb = cfn(i / w);
    ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    ctx.fillRect(i, 0, 1, h);
  }
}
`;

function sharedColormapScript() {
  return `<script>\n${sharedColormapCode}\n</script>`;
}

// ─── Slice Plot ──────────────────────────────────────────────────────────────

const slicePlot = `<!DOCTYPE html>
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
var Predictor = axjs.Predictor;

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

// ─── Response Surface ────────────────────────────────────────────────────────

const responseSurface = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — 2D Response Surface</title>
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
  select, button {
    font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #444;
    background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none;
  }
  button:hover { background: #252528; }
  .file-btn {
    font-size: 12px; padding: 5px 12px; border-radius: 6px;
    border: 0.5px solid #444; background: #1a1a1d; color: #999;
    cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  }
  .file-btn:hover { background: #252528; color: #ccc; border-color: #555; }
  .file-btn input { display: none; }
  .plots { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  .plot { display: flex; flex-direction: column; gap: 6px; }
  .plot-title { font-size: 12px; color: #888; text-align: center; letter-spacing: 0.04em; }
  .canvas-wrap { position: relative; display: inline-block; }
  canvas.main {
    display: block; border-radius: 6px;
    border: 0.5px solid #333; cursor: crosshair;
  }
  canvas.overlay { position: absolute; top: 0; left: 0; pointer-events: none; }
  .cbrow { display: flex; align-items: center; gap: 6px; }
  .cblbl { font-size: 11px; color: #666; min-width: 40px; }
  canvas.cbar { height: 16px; flex: 1; border-radius: 4px; }
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
  .statline { font-size: 13px; color: #777; margin-top: 14px; min-height: 1.5em; }
  .statline span { font-weight: 500; color: #ddd; }
  #tooltip {
    position: fixed; display: none;
    background: #1e1e22; border: 0.5px solid #555;
    border-radius: 7px; padding: 9px 13px;
    font-size: 12px; color: #ccc;
    pointer-events: none; z-index: 100;
    line-height: 1.8; white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }
  #tooltip .tt-title {
    font-size: 11px; color: #888; letter-spacing: 0.05em;
    text-transform: uppercase; margin-bottom: 4px;
  }
  #tooltip .tt-val { color: #ff6b6b; font-weight: 500; }
  #tooltip .tt-coord { color: #a0c4ff; }
</style>
</head>
<body>

<h1>${axHomeLink}2D Response Surface</h1>
<p class="subtitle" id="subtitle">Load a fixture JSON to visualize GP posterior</p>

<div class="controls">
  <label class="file-btn" title="Load custom fixture JSON">📂 Load fixture<input type="file" id="fileInput" accept=".json"></label>
  <label>X axis <select id="selX"></select></label>
  <label>Y axis <select id="selY"></select></label>
  <label>Outcome: <select id="outcomeSelect"><option value="0">y</option></select></label>
  <label style="margin-left:6px"><input type="checkbox" id="cbContour" checked> contours</label>
</div>

<div id="tooltip"><div class="tt-title" id="tt-title"></div><div id="tt-body"></div></div>

<div class="plots">
  <div class="plot">
    <div class="plot-title">posterior mean</div>
    <div class="canvas-wrap">
      <canvas id="cvM" class="main" width="368" height="358"></canvas>
      <canvas id="ovM" class="overlay" width="368" height="358"></canvas>
    </div>
    <div class="cbrow">
      <span class="cblbl" id="mlo">—</span>
      <canvas id="cbM" class="cbar"></canvas>
      <span class="cblbl" id="mhi" style="text-align:right">—</span>
    </div>
  </div>
  <div class="plot">
    <div class="plot-title">predictive std</div>
    <div class="canvas-wrap">
      <canvas id="cvS" class="main" width="368" height="358"></canvas>
      <canvas id="ovS" class="overlay" width="368" height="358"></canvas>
    </div>
    <div class="cbrow">
      <span class="cblbl">0.00</span>
      <canvas id="cbS" class="cbar"></canvas>
      <span class="cblbl" id="shi" style="text-align:right">—</span>
    </div>
  </div>
</div>

<div class="section-label" id="sliderLabel" style="display:none">Fixed dimensions</div>
<div id="sliders"></div>
<div class="statline" id="statline">hover over either map to inspect \u00b7 red dots = training points</div>

${libraryScript()}
${sharedUtilsScript()}
${sharedColormapScript()}
${fixtureScript('__DEFAULT_FIXTURE__', penicillinFixture)}

<script>
var Predictor = axjs.Predictor;

var N = 320, GS = 60;
var ML = 48, MT = 0, MB = 38; // margins: left, top, bottom (pixels)
var CW = N + ML, CH = N + MB;  // total canvas size
var predictor = null, fixture = null;
var params = [], paramNames = [], paramBounds = [], fixedValues = [];
var dimOrder = []; // dims sorted by importance
var axX = 0, axY = 1, selectedOutcome = '';
var contourMode = true;

var ctxM  = document.getElementById('cvM').getContext('2d');
var ctxS  = document.getElementById('cvS').getContext('2d');
var ctxOM = document.getElementById('ovM').getContext('2d');
var ctxOS = document.getElementById('ovS').getContext('2d');
var selX = document.getElementById('selX');
var selY = document.getElementById('selY');
var outcomeSelect = document.getElementById('outcomeSelect');

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

  // Populate axis selectors — all params including choice
  selX.innerHTML = ''; selY.innerHTML = '';
  paramNames.forEach(function(name, i) {
    [selX, selY].forEach(function(sel) {
      var o = document.createElement('option');
      o.value = i; o.textContent = name + (isChoice(params[i]) ? ' (cat)' : '');
      sel.appendChild(o);
    });
  });
  // Auto-select the two most active non-choice dims for the initial outcome
  updateDimOrder();
  var nonChoiceDims = dimOrder.filter(function(i) { return !isChoice(params[i]); });
  if (nonChoiceDims.length >= 2) {
    axX = nonChoiceDims[0]; axY = nonChoiceDims[1];
  } else {
    axX = 0; axY = paramNames.length > 1 ? 1 : 0;
  }
  selX.value = axX; selY.value = axY;

  document.getElementById('subtitle').textContent =
    fixture.metadata.name + ' — ' + fixture.metadata.description;

  buildSliders();
  render();
}

function updateDimOrder() {
  dimOrder = computeDimOrder(predictor, paramNames.length, selectedOutcome);
}

document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

selX.addEventListener('change', function() {
  axX = +selX.value;
  if (axX === axY) { axY = (axX + 1) % paramNames.length; selY.value = axY; }
  buildSliders(); render();
});
selY.addEventListener('change', function() {
  axY = +selY.value;
  if (axX === axY) { axX = (axY + 1) % paramNames.length; selX.value = axX; }
  buildSliders(); render();
});
outcomeSelect.addEventListener('change', function() {
  selectedOutcome = outcomeSelect.value;
  updateDimOrder();
  buildSliders();
  render();
});
document.getElementById('cbContour').addEventListener('change', function() {
  contourMode = this.checked;
  render();
});
function buildSliders() {
  var div = document.getElementById('sliders');
  var label = document.getElementById('sliderLabel');
  div.innerHTML = '';
  var axes = new Set([axX, axY]);
  var hasSliders = paramNames.some(function(_, i) { return !axes.has(i); });
  label.style.display = hasSliders ? 'block' : 'none';
  dimOrder.forEach(function(i) {
    if (axes.has(i)) return;
    var name = paramNames[i];
    var p = params[i];
    var row = document.createElement('div'); row.className = 'slrow';
    var lbl = document.createElement('span'); lbl.className = 'sllbl';
    lbl.textContent = name;

    if (isChoice(p)) {
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
        render();
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
        render();
      });
      row.appendChild(lbl); row.appendChild(sl); row.appendChild(val);
    }
    div.appendChild(row);
  });
}

function predictAt(points) {
  return predictor.predict(points)[selectedOutcome];
}

// Marching-squares contour line rendering
function drawContourLines(ctx, vals, gs, canvasN, vMin, vRange, cfn) {
  var nLevels = 10;
  var step = canvasN / (gs - 1);
  // Edge interpolation: 0=top, 1=right, 2=bottom, 3=left
  function edgeXY(gi, gj, edge, frac) {
    switch (edge) {
      case 0: return [step*(gi+frac), step*gj];
      case 1: return [step*(gi+1),    step*(gj+frac)];
      case 2: return [step*(gi+frac), step*(gj+1)];
      case 3: return [step*gi,        step*(gj+frac)];
    }
  }
  function lerp(a, b, level) { var d=b-a; return d===0 ? 0.5 : (level-a)/d; }

  // Segment table: case → [[edgeA, edgeB], ...]
  var SEG = [
    [],[[2,3]],[[1,2]],[[1,3]],[[0,1]],null,[[0,2]],[[0,3]],
    [[0,3]],[[0,2]],null,[[0,1]],[[1,3]],[[1,2]],[[2,3]],[]
  ];

  for (var li = 1; li < nLevels; li++) {
    var level = vMin + vRange * li / nLevels;
    var rgb = cfn(li / nLevels);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    for (var gj = 0; gj < gs-1; gj++) {
      for (var gi = 0; gi < gs-1; gi++) {
        var tl=vals[gj*gs+gi], tr=vals[gj*gs+gi+1];
        var bl=vals[(gj+1)*gs+gi], br=vals[(gj+1)*gs+gi+1];
        var code = (tl>=level?8:0)|(tr>=level?4:0)|(br>=level?2:0)|(bl>=level?1:0);
        if (code===0||code===15) continue;

        var segs = SEG[code];
        if (!segs) {
          // Saddle: disambiguate with center value
          var center = (tl+tr+br+bl)/4;
          if (code===5) segs = center>=level ? [[0,3],[1,2]] : [[0,1],[2,3]];
          else          segs = center>=level ? [[0,1],[2,3]] : [[0,3],[1,2]];
        }

        for (var si=0; si<segs.length; si++) {
          var eA=segs[si][0], eB=segs[si][1];
          var fA, fB;
          if (eA===0) fA=lerp(tl,tr,level);
          else if (eA===1) fA=lerp(tr,br,level);
          else if (eA===2) fA=lerp(bl,br,level);
          else fA=lerp(tl,bl,level);
          if (eB===0) fB=lerp(tl,tr,level);
          else if (eB===1) fB=lerp(tr,br,level);
          else if (eB===2) fB=lerp(bl,br,level);
          else fB=lerp(tl,bl,level);
          var pA=edgeXY(gi,gj,eA,fA), pB=edgeXY(gi,gj,eB,fB);
          ctx.moveTo(pA[0],pA[1]);
          ctx.lineTo(pB[0],pB[1]);
        }
      }
    }
    ctx.stroke();
  }
}

// Axis coordinate helpers — choice axes use index-based mapping
var xIsChoice = false, yIsChoice = false;
var xCatVals = [], yCatVals = []; // numeric category values for choice axes
var gsX = GS, gsY = GS; // grid sizes (smaller for choice axes)

function nearestCatIdx(catVals, val) {
  var ci = catVals.indexOf(val);
  if (ci >= 0) return ci;
  // Fuzzy match for floating-point category values
  var best = 0, bestD = Infinity;
  for (var k = 0; k < catVals.length; k++) {
    var d = Math.abs(catVals[k] - val);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

function axisToPixel(axIdx, val) {
  // Convert a parameter value to canvas pixel (with margin offset)
  if (axIdx === axX && xIsChoice) {
    var ci = nearestCatIdx(xCatVals, val);
    return ML + (ci + 0.5) / xCatVals.length * N;
  }
  if (axIdx === axY && yIsChoice) {
    var ci = nearestCatIdx(yCatVals, val);
    return MT + (1 - (ci + 0.5) / yCatVals.length) * N;
  }
  var lo = paramBounds[axIdx][0], hi = paramBounds[axIdx][1];
  if (axIdx === axX) return ML + (val - lo) / ((hi - lo) || 1) * N;
  return MT + (1 - (val - lo) / ((hi - lo) || 1)) * N;
}

function pixelToValue(axIdx, px) {
  // Convert canvas pixel to parameter value (accounting for margins)
  var p = (axIdx === axX) ? px - ML : px - MT; // offset by margin
  if (axIdx === axX && xIsChoice) {
    var ci = Math.floor(p / N * xCatVals.length);
    ci = Math.max(0, Math.min(xCatVals.length - 1, ci));
    return xCatVals[ci];
  }
  if (axIdx === axY && yIsChoice) {
    var ci = Math.floor((1 - p / N) * yCatVals.length);
    ci = Math.max(0, Math.min(yCatVals.length - 1, ci));
    return yCatVals[ci];
  }
  var lo = paramBounds[axIdx][0], hi = paramBounds[axIdx][1];
  var v;
  if (axIdx === axX) v = lo + (hi - lo) * p / N;
  else v = hi - (hi - lo) * p / N;
  if (isInteger(params[axIdx])) v = Math.round(v);
  return v;
}

function render() {
  if (!predictor) return;
  xIsChoice = isChoice(params[axX]);
  yIsChoice = isChoice(params[axY]);
  xCatVals = xIsChoice ? params[axX].values.map(Number) : [];
  yCatVals = yIsChoice ? params[axY].values.map(Number) : [];
  // For choice axes, grid size = number of categories; for continuous, use GS
  gsX = xIsChoice ? xCatVals.length : GS;
  gsY = yIsChoice ? yCatVals.length : GS;

  var xlo = paramBounds[axX][0], xhi = paramBounds[axX][1];
  var ylo = paramBounds[axY][0], yhi = paramBounds[axY][1];
  var imgM = ctxM.createImageData(N, N);
  var imgS = ctxS.createImageData(N, N);

  var testPoints = [];
  for (var gj = 0; gj < gsY; gj++) {
    for (var gi = 0; gi < gsX; gi++) {
      var xv, yv;
      if (xIsChoice) { xv = xCatVals[gi]; }
      else { xv = xlo + (xhi - xlo) * gi / (gsX - 1); if (isInteger(params[axX])) xv = Math.round(xv); }
      if (yIsChoice) { yv = yCatVals[gsY - 1 - gj]; }
      else { yv = yhi - (yhi - ylo) * gj / (gsY - 1); if (isInteger(params[axY])) yv = Math.round(yv); }
      var pt = fixedValues.slice();
      pt[axX] = xv; pt[axY] = yv;
      testPoints.push(pt);
    }
  }

  var pred = predictAt(testPoints);
  var means = Array.from(pred.mean);
  var stds = means.map(function(_, i) { return Math.sqrt(pred.variance[i]); });

  var meanMin = Math.min.apply(null, means), meanMax = Math.max.apply(null, means);
  var stdMax = Math.max.apply(null, stds);
  var meanRange = meanMax - meanMin || 1;

  var cellW = N / gsX, cellH = N / gsY;
  for (var k = 0; k < means.length; k++) {
    var gi = k % gsX, gj = Math.floor(k / gsX);
    var tm = (means[k] - meanMin) / meanRange;
    var ts = stds[k] / (stdMax || 1);
    var mr = viridis(tm), sr = plasma(ts);
    var x0 = Math.round(gi * cellW), y0 = Math.round(gj * cellH);
    var x1 = Math.round((gi + 1) * cellW), y1 = Math.round((gj + 1) * cellH);
    for (var py = y0; py < y1; py++) {
      for (var px = x0; px < x1; px++) {
        var idx = (py * N + px) * 4;
        imgM.data[idx] = mr[0]; imgM.data[idx+1] = mr[1]; imgM.data[idx+2] = mr[2]; imgM.data[idx+3] = 255;
        imgS.data[idx] = sr[0]; imgS.data[idx+1] = sr[1]; imgS.data[idx+2] = sr[2]; imgS.data[idx+3] = 255;
      }
    }
  }

  // Clear full canvas and place heatmap at margin offset
  ctxM.clearRect(0, 0, CW, CH);
  ctxS.clearRect(0, 0, CW, CH);
  ctxM.putImageData(imgM, ML, MT);
  ctxS.putImageData(imgS, ML, MT);

  // Contour lines — only when both axes are continuous (contours across categories are meaningless)
  if (contourMode && !xIsChoice && !yIsChoice) {
    [ctxM, ctxS].forEach(function(ctx) { ctx.save(); ctx.translate(ML, MT); });
    drawContourLines(ctxM, means, gsX, N, meanMin, meanRange, viridis);
    drawContourLines(ctxS, stds, gsX, N, 0, stdMax || 1, plasma);
    [ctxM, ctxS].forEach(function(ctx) { ctx.restore(); });
  }

  // Draw category grid lines to visually separate discrete bands
  if (xIsChoice || yIsChoice) {
    [ctxM, ctxS].forEach(function(ctx) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      if (xIsChoice) {
        for (var ci = 1; ci < xCatVals.length; ci++) {
          var lx = ML + Math.round(ci * cellW);
          ctx.beginPath(); ctx.moveTo(lx, MT); ctx.lineTo(lx, MT + N); ctx.stroke();
        }
      }
      if (yIsChoice) {
        for (var ci = 1; ci < yCatVals.length; ci++) {
          var ly = MT + Math.round(ci * cellH);
          ctx.beginPath(); ctx.moveTo(ML, ly); ctx.lineTo(ML + N, ly); ctx.stroke();
        }
      }
    });
  }

  // Draw axis ticks and labels in the margin area
  [ctxM, ctxS].forEach(function(ctx) {
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    var nTicks = 4;

    // X-axis ticks
    if (xIsChoice) {
      ctx.textAlign = 'center';
      var cw = N / xCatVals.length;
      for (var ci = 0; ci < xCatVals.length; ci++) {
        var tx = ML + (ci + 0.5) * cw;
        ctx.beginPath(); ctx.moveTo(tx, MT + N); ctx.lineTo(tx, MT + N + 4); ctx.stroke();
        ctx.fillText(String(params[axX].values[ci]), tx, MT + N + 15);
      }
    } else {
      ctx.textAlign = 'center';
      var xRange = paramBounds[axX][1] - paramBounds[axX][0];
      for (var ti = 0; ti <= nTicks; ti++) {
        var tv = paramBounds[axX][0] + xRange * ti / nTicks;
        var tx = ML + ti * N / nTicks;
        ctx.beginPath(); ctx.moveTo(tx, MT + N); ctx.lineTo(tx, MT + N + 4); ctx.stroke();
        ctx.fillText(formatParamValue(tv, params[axX]), tx, MT + N + 15);
      }
    }

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(paramNames[axX], ML + N / 2, MT + N + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';

    // Y-axis ticks
    if (yIsChoice) {
      ctx.textAlign = 'right';
      var ch = N / yCatVals.length;
      for (var ci = 0; ci < yCatVals.length; ci++) {
        var ty = MT + (yCatVals.length - 1 - ci + 0.5) * ch;
        ctx.beginPath(); ctx.moveTo(ML - 4, ty); ctx.lineTo(ML, ty); ctx.stroke();
        ctx.fillText(String(params[axY].values[ci]), ML - 6, ty + 3);
      }
    } else {
      ctx.textAlign = 'right';
      var yRange = paramBounds[axY][1] - paramBounds[axY][0];
      for (var ti = 0; ti <= nTicks; ti++) {
        var tv = paramBounds[axY][0] + yRange * ti / nTicks;
        var ty = MT + (1 - ti / nTicks) * N;
        ctx.beginPath(); ctx.moveTo(ML - 4, ty); ctx.lineTo(ML, ty); ctx.stroke();
        ctx.fillText(formatParamValue(tv, params[axY]), ML - 6, ty + 3);
      }
    }

    // Y-axis label (rotated)
    ctx.save();
    ctx.translate(12, MT + N / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(paramNames[axY], 0, 0);
    ctx.restore();
    ctx.textAlign = 'start'; // reset
  });

  document.getElementById('mlo').textContent = meanMin.toFixed(2);
  document.getElementById('mhi').textContent = meanMax.toFixed(2);
  document.getElementById('shi').textContent = stdMax.toFixed(2);
  drawColorbar('cbM', viridis);
  drawColorbar('cbS', plasma);
  // Preserve pinned state across re-renders — draw overlays with active pin
  drawOverlays(undefined, undefined, -1, pinnedTrainIdx);
}

var pinnedTrainIdx = -1; // pinned training point index (-1 = none)
var hoverNeighborIdx = -1; // hover-based neighbor highlight (-1 = none)

function drawOverlays(hx, hy, hoveredIdx, neighborActiveIdx) {
  [ctxOM, ctxOS].forEach(function(ctx) {
    ctx.clearRect(0, 0, CW, CH);
    if (hx !== undefined) {
      ctx.beginPath(); ctx.moveTo(hx, MT); ctx.lineTo(hx, MT + N);
      ctx.moveTo(ML, hy); ctx.lineTo(ML + N, hy);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.5; ctx.stroke();
    }

    if (fixture) {
      var td = predictor.getTrainingData(selectedOutcome);
      if (td.X.length > 0) {
        var activePt = (neighborActiveIdx >= 0 && neighborActiveIdx < td.X.length)
          ? td.X[neighborActiveIdx] : null;

        // If in neighbor mode, pre-compute relative scaling
        var neighborRels = null, neighborMax = 0;
        if (activePt) {
          neighborRels = [];
          for (var ni = 0; ni < td.X.length; ni++) {
            if (ni === neighborActiveIdx) { neighborRels.push(1); continue; }
            var nr = predictor.kernelCorrelation(td.X[ni], activePt, selectedOutcome);
            neighborRels.push(nr);
            if (nr > neighborMax) neighborMax = nr;
          }
        }

        td.X.forEach(function(pt, i) {
          var fillAlpha;
          if (activePt) {
            if (i === neighborActiveIdx) {
              fillAlpha = 0.95;
            } else {
              // Relative scaling: nearest neighbor is bright, others fade
              var relNorm = neighborMax > 0 ? neighborRels[i] / neighborMax : 0;
              fillAlpha = Math.max(0.08, Math.min(0.90, Math.sqrt(relNorm)));
            }
          } else {
            fillAlpha = 0.95;
          }
          var ppx = axisToPixel(axX, pt[axX]);
          var ppy = axisToPixel(axY, pt[axY]);
          var isActive = (i === neighborActiveIdx);
          var isHovered = (i === hoveredIdx);
          var outerR = (isActive || isHovered) ? 7.5 : 5;
          var innerR = (isActive || isHovered) ? 4 : 2.5;
          ctx.beginPath(); ctx.arc(ppx, ppy, outerR, 0, 2 * Math.PI);
          ctx.strokeStyle = isActive ? 'rgba(255,255,255,1)'
            : 'rgba(255,255,255,' + Math.max(0.15, fillAlpha * 0.6).toFixed(3) + ')';
          ctx.lineWidth = isActive ? 2.5 : (isHovered ? 2 : 1.5); ctx.stroke();
          ctx.beginPath(); ctx.arc(ppx, ppy, innerR, 0, 2 * Math.PI);
          ctx.fillStyle = (isActive || isHovered)
            ? 'rgba(255,110,110,1)'
            : 'rgba(255,60,60,' + fillAlpha.toFixed(3) + ')';
          ctx.fill();
        });
      }
    }
  });
}

var HOVER_R = 9;
function nearestTrainPoint(canvasPx, canvasPy) {
  if (!fixture) return -1;
  var trainX = predictor.getTrainingData(selectedOutcome).X;
  if (!trainX.length) return -1;
  var best = -1, bestD = HOVER_R;
  trainX.forEach(function(pt, i) {
    var dx = axisToPixel(axX, pt[axX]) - canvasPx;
    var dy = axisToPixel(axY, pt[axY]) - canvasPy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

['cvM', 'cvS'].forEach(function(id) {
  var cv = document.getElementById(id);
  cv.addEventListener('mousemove', function(e) {
    var rect = cv.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var xv = pixelToValue(axX, px);
    var yv = pixelToValue(axY, py);

    var hitIdx = nearestTrainPoint(px, py);
    var tt = document.getElementById('tooltip');
    var ttTitle = document.getElementById('tt-title');
    var ttBody = document.getElementById('tt-body');

    // Determine which point drives neighbor highlighting
    var activeIdx = pinnedTrainIdx;
    if (activeIdx === -1 && hitIdx >= 0) {
      activeIdx = hitIdx;
      hoverNeighborIdx = hitIdx;
    } else if (activeIdx === -1) {
      hoverNeighborIdx = -1;
    }

    if (hitIdx >= 0) {
      var td = predictor.getTrainingData(selectedOutcome);
      var tpt = td.X[hitIdx];
      var yVal = td.Y[hitIdx];
      ttTitle.textContent = 'training point #' + (hitIdx + 1);
      ttBody.innerHTML = '<span class="tt-val">y = ' + yVal.toFixed(4) + '</span><br>' +
        paramNames.map(function(name, j) {
          return '<span class="tt-coord">' + name + '</span> = ' + formatParamValue(tpt[j], params[j]);
        }).join('<br>');
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 16) + 'px';
      tt.style.top = (e.clientY - 10) + 'px';

      document.getElementById('statline').innerHTML =
        'point #' + (hitIdx + 1) + ' &nbsp; y = <span>' + yVal.toFixed(4) + '</span>';
      cv.style.cursor = 'pointer';
    } else {
      var pt = fixedValues.slice(); pt[axX] = xv; pt[axY] = yv;
      var p = predictAt([pt]);
      var mu = p.mean[0], std = Math.sqrt(p.variance[0]);
      document.getElementById('statline').innerHTML =
        paramNames[axX] + ' = <span>' + formatParamValue(xv, params[axX]) + '</span>  ' +
        paramNames[axY] + ' = <span>' + formatParamValue(yv, params[axY]) + '</span>  ' +
        'μ = <span>' + mu.toFixed(4) + '</span>  ' +
        'σ = <span>' + std.toFixed(4) + '</span>';
      ttTitle.textContent = '';
      ttBody.innerHTML = 'μ = ' + mu.toFixed(4) + '<br>σ = ' + std.toFixed(4);
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 16) + 'px';
      tt.style.top = (e.clientY - 10) + 'px';
      cv.style.cursor = 'crosshair';
    }

    drawOverlays(px, py, hitIdx, activeIdx);
  });

  cv.addEventListener('click', function(e) {
    var rect = cv.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var hitIdx = nearestTrainPoint(px, py);
    if (hitIdx >= 0) {
      if (pinnedTrainIdx === hitIdx) {
        pinnedTrainIdx = -1;
      } else {
        pinnedTrainIdx = hitIdx;
        // Snap sliders to clicked point's coordinates
        var td = predictor.getTrainingData(selectedOutcome);
        var clickedPt = td.X[hitIdx];
        for (var j = 0; j < fixedValues.length; j++) fixedValues[j] = clickedPt[j];
        buildSliders();
        render();
        return; // render rebuilds everything including overlays
      }
    } else {
      pinnedTrainIdx = -1;
    }
    var activeIdx = pinnedTrainIdx >= 0 ? pinnedTrainIdx : hoverNeighborIdx;
    drawOverlays(px, py, hitIdx, activeIdx);
  });

  cv.addEventListener('mouseleave', function() {
    document.getElementById('tooltip').style.display = 'none';
    hoverNeighborIdx = -1;
    drawOverlays(undefined, undefined, -1, pinnedTrainIdx);
    document.getElementById('statline').innerHTML =
      pinnedTrainIdx >= 0
        ? 'pinned point #' + (pinnedTrainIdx + 1) + ' — click elsewhere to unpin'
        : 'hover over either map to inspect · red dots = training points';
  });
});

// Auto-load
loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;


// ─── Radar (Multi-Objective) ──────────────────────────────────────────────────
// Generic multi-objective constrained optimization radar demo.
// Accepts any ExperimentState with optimization_config (objectives + constraints).
// Default fixture: VSIP test problem (built at build-time).

function buildDefaultRadarFixture() {
  // VSIP test problem: 7 design variables, 3 objectives, 6 constraints
  var BOUNDS = [
    [0.5, 1.5], [0.45, 1.35], [0.5, 1.5], [0.5, 1.5],
    [0.875, 2.625], [0.4, 1.2], [0.4, 1.2]
  ];
  var PARAM_NAMES = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'];
  var OBJ_NAMES = ['Weight', 'Accel.', 'Intrus.'];
  var CON_NAMES = ['V-Door', 'V-Btop', 'V-Bmid', 'Pub.F', 'VC', 'Abdom.'];
  var CON_THRESHOLDS = [32.0, 32.0, 32.0, 4.0, 0.32, 1.0];
  var RESP_NAMES = OBJ_NAMES.concat(CON_NAMES);
  var NRESP = RESP_NAMES.length;

  function evaluate(x) {
    var x1=x[0],x2=x[1],x3=x[2],x4=x[3],x5=x[4],x6=x[5],x7=x[6];
    return [
      1.98+4.90*x1+6.67*x2+6.98*x3+4.01*x4+1.78*x5+0.001*x6+2.73*x7,
      7.50-0.80*x1-0.60*x2-0.40*x3-0.50*x4-0.30*x5+0.30*x1*x2+0.20*x2*x3,
      15.0-2.00*x1-1.50*x2-1.00*x3-1.50*x5+0.50*x1*x2+0.30*x5*x6,
      38.0-4.00*x1-3.00*x2-2.00*x5+0.50*x1*x2-0.30*x3*x5+x6,
      42.0-6.00*x1-5.00*x2-3.00*x5+0.50*x1*x2-0.20*x1*x1,
      40.0-5.00*x1-4.00*x2-2.00*x3-2.00*x5+0.80*x1*x2,
      6.00-0.80*x1-0.90*x2-0.60*x5-0.40*x6+0.30*x1*x5,
      0.50-0.08*x1-0.07*x2-0.05*x5+0.02*x1*x2,
      1.40-0.18*x1-0.15*x2-0.12*x3-0.08*x5+0.05*x2*x3
    ];
  }

  // Generate 64 random training points with fixed seed (mulberry32)
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32(42);
  var nSamples = 64;
  var trainX = [];
  for (var i = 0; i < nSamples; i++) {
    trainX.push(BOUNDS.map(function(b) { return b[0] + rng()*(b[1]-b[0]); }));
  }
  var evals = trainX.map(evaluate);

  var GP_LS = 0.45, GP_NV = 1e-4;
  var inputTf = {
    offset: BOUNDS.map(function(b) { return b[0]; }),
    coefficient: BOUNDS.map(function(b) { return 1 / (b[1] - b[0]); })
  };

  var subModels = [];
  for (var k = 0; k < NRESP; k++) {
    var trainY = evals.map(function(e) { return e[k]; });
    var yMin = Math.min.apply(null, trainY);
    var yMax = Math.max.apply(null, trainY);
    var sv = (yMax - yMin) * (yMax - yMin) || 1;
    subModels.push({
      model_type: 'SingleTaskGP',
      train_X: trainX,
      train_Y: trainY,
      kernel: {
        type: 'Scale', outputscale: sv,
        base_kernel: { type: 'RBF', lengthscale: [GP_LS,GP_LS,GP_LS,GP_LS,GP_LS,GP_LS,GP_LS] }
      },
      mean_constant: 0,
      noise_variance: GP_NV * sv,
      input_transform: inputTf
    });
  }

  return {
    name: 'Vehicle Side-Impact Problem',
    description: 'VSIP: 3 objectives, 6 constraints, 7 design variables',
    search_space: {
      parameters: PARAM_NAMES.map(function(name, i) {
        return { name: name, type: 'range', bounds: BOUNDS[i] };
      })
    },
    model_state: {
      model_type: 'ModelListGP',
      outcome_names: RESP_NAMES,
      models: subModels
    },
    outcome_names: RESP_NAMES,
    optimization_config: {
      objectives: OBJ_NAMES.map(function(name) {
        return { name: name, minimize: true };
      }),
      outcome_constraints: CON_NAMES.map(function(name, i) {
        return { name: name, bound: CON_THRESHOLDS[i], op: 'LEQ' };
      })
    }
  };
}

const defaultRadarFixture = JSON.stringify(buildDefaultRadarFixture());

const radar = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Multi-Objective Radar</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0f0f11; color: #e0e0e0;
  padding: 1.5rem 2rem; min-height: 100vh;
}
h1 { font-size: 17px; font-weight: 500; color: #f0f0f0; margin-bottom: 3px; }
.subtitle { font-size: 12px; color: #777; margin-bottom: 16px; }

.top-controls {
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 18px;
}
label.ctrl { font-size: 13px; color: #aaa; display: flex; align-items: center; gap: 5px; }
select, button, input[type=file] {
  font-size: 13px; padding: 4px 9px; border-radius: 6px;
  border: 0.5px solid #444; background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none;
}
button { border-color: #555; }
button:hover { background: #252528; }
input[type=range] { accent-color: #7c6ff7; cursor: pointer; }

.main { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }

.left-panel { width: 222px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0; }
.panel-sec {
  font-size: 10px; color: #555; letter-spacing: .06em; text-transform: uppercase;
  margin: 12px 0 6px; padding-bottom: 4px; border-bottom: 0.5px solid #1e1e22;
}
.panel-sec:first-child { margin-top: 0; }

.stat-row {
  padding: 7px 9px 6px; border-radius: 6px;
  background: #141418; border: 0.5px solid #202026;
  margin-bottom: 3px; transition: border-color .2s, background .2s;
}
.stat-row.viol  { border-color: #5a1e1e; background: #1b1010; }
.stat-row.close { border-color: #3a3a1a; background: #1b1b10; }

.sr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1px; }
.sr-name { font-size: 11px; color: #999; }
.badge {
  font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 500; letter-spacing: .03em;
}
.b-ok   { background: #152518; color: #4d8a5e; }
.b-warn { background: #252510; color: #8a8a3e; }
.b-viol { background: #251010; color: #b04040; }

.sr-val { font-size: 17px; font-weight: 500; color: #c4c4d4; line-height: 1.25; }
.sr-ci { font-size: 10px; color: #505055; margin-top: 1px; }
.sr-ci .clo { color: #4d7da0; }
.sr-ci .chi { color: #a04d4d; }
.sr-thresh { font-size: 10px; color: #444; margin-top: 1px; }

.pof-card {
  margin-top: 14px; padding: 11px 13px; border-radius: 8px;
  border: 0.5px solid #2a2a30; background: #111118;
  transition: border-color .3s;
}
.pof-lbl { font-size: 10px; color: #555; letter-spacing: .06em; text-transform: uppercase; }
.pof-val { font-size: 26px; font-weight: 500; color: #6070b0; margin: 3px 0 6px; transition: color .3s; }
.pof-bar-bg { background: #1a1a24; border-radius: 3px; height: 4px; overflow: hidden; }
.pof-bar    { height: 100%; border-radius: 3px; background: #4858a0; transition: width .3s, background .3s; }
.pof-sub { font-size: 10px; color: #444; margin-top: 5px; }

.radar-col { display: flex; flex-direction: column; align-items: center; gap: 5px; }
#radarCanvas { display: block; }
.radar-legend {
  display: flex; gap: 14px; font-size: 11px; color: #555;
  align-items: center; flex-wrap: wrap; justify-content: center;
}
.leg-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; }

.sliders-col { flex: 1; min-width: 230px; }
.sec-lbl {
  font-size: 10px; color: #555; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 10px;
}
.slrow { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.sllbl { min-width: 102px; }
.sllbl-name { font-size: 12px; color: #bbb; display: block; }
.sl-wrap { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.sl-wrap input[type=range] { width: 100%; }
.sl-bounds { display: flex; justify-content: space-between; font-size: 9px; color: #3a3a3a; }
.slval { font-size: 12px; font-weight: 500; color: #ccc; min-width: 36px; text-align: right; }
</style>
</head>
<body>

<h1 id="title">${axHomeLink}Multi-Objective Radar</h1>
<p class="subtitle" id="subtitle">Load a fixture to visualize</p>

<div class="top-controls">
  <label class="ctrl">
    <input type="file" id="fileInput" accept=".json"> Load fixture
  </label>
  <label class="ctrl" style="margin-left:6px">
    <input type="checkbox" id="cbCI" checked> 95% CI band
  </label>
</div>

<div class="main">

  <div class="left-panel">
    <div class="panel-sec" id="obj-sec">Objectives</div>
    <div id="obj-cards"></div>
    <div class="panel-sec" id="con-sec" style="display:none">Constraints</div>
    <div id="con-cards"></div>
    <div class="pof-card" id="pof-card" style="display:none">
      <div class="pof-lbl">probability of feasibility</div>
      <div class="pof-val" id="pof-val">\u2014</div>
      <div class="pof-bar-bg"><div class="pof-bar" id="pof-bar" style="width:0%"></div></div>
      <div class="pof-sub" id="pof-sub">product of per-constraint normal CDFs</div>
    </div>
  </div>

  <div class="radar-col">
    <canvas id="radarCanvas" width="400" height="400"></canvas>
    <div class="radar-legend" id="radarLegend">
      <span><span class="leg-dot" style="background:#8090d0"></span>objectives</span>
      <span><span class="leg-dot" style="background:#c8a050"></span>constraints</span>
      <span><span class="leg-dot" style="background:#cc4040"></span>violated</span>
      <span style="color:#555">\u25C6 = constraint threshold</span>
    </div>
  </div>

  <div class="sliders-col">
    <div class="sec-lbl">Design variables</div>
    <div id="sliders"></div>
  </div>

</div>

${libraryScript()}
${sharedUtilsScript()}
${fixtureScript('__DEFAULT_FIXTURE__', defaultRadarFixture)}

<script>
var Predictor = axjs.Predictor;

var predictor = null;
var params = [], paramBounds = [];
var query = [];
var NOBJ = 0, NCON = 0, N_AXES = 0;
var OBJ_INFO = [], CON_INFO = [];
var normBounds = null;

function abbreviate(name) {
  if (name.length <= 6) return name;
  var words = name.split(/[\\s_-]+/);
  if (words[0].length <= 6) return words[0];
  return name.slice(0, 5) + '.';
}

function loadFixtureData(data) {
  var fix = normalizeFixture(data);
  predictor = new Predictor(fix);

  params = fix.search_space.parameters;
  paramBounds = predictor.paramBounds;

  var oc = fix.optimization_config;
  if (oc) {
    OBJ_INFO = oc.objectives.map(function(o) {
      return { name: o.name, short: abbreviate(o.name), minimize: o.minimize, decs: 2 };
    });
    CON_INFO = (oc.outcome_constraints || []).map(function(c) {
      return { name: c.name, short: abbreviate(c.name), threshold: c.bound, op: c.op, decs: 2 };
    });
  } else {
    // Infer: all outcomes are objectives, no constraints
    OBJ_INFO = predictor.outcomeNames.map(function(name) {
      return { name: name, short: abbreviate(name), minimize: true, decs: 2 };
    });
    CON_INFO = [];
  }

  NOBJ = OBJ_INFO.length;
  NCON = CON_INFO.length;
  N_AXES = NOBJ + NCON;

  // Update panel headers
  var minCount = OBJ_INFO.filter(function(o){ return o.minimize; }).length;
  var maxCount = OBJ_INFO.length - minCount;
  var objLabel = 'Objectives';
  if (minCount > 0 && maxCount === 0) objLabel += ' (minimize)';
  else if (maxCount > 0 && minCount === 0) objLabel += ' (maximize)';
  document.getElementById('obj-sec').textContent = objLabel;

  // Show/hide constraint section
  var conSec = document.getElementById('con-sec');
  var pofCard = document.getElementById('pof-card');
  if (NCON > 0) {
    conSec.style.display = '';
    pofCard.style.display = '';
    var hasLeq = CON_INFO.some(function(c){ return c.op === 'LEQ'; });
    var hasGeq = CON_INFO.some(function(c){ return c.op === 'GEQ'; });
    var conLabel = 'Constraints';
    if (hasLeq && !hasGeq) conLabel += ' (\u2264 threshold)';
    else if (hasGeq && !hasLeq) conLabel += ' (\u2265 threshold)';
    conSec.textContent = conLabel;
  } else {
    conSec.style.display = 'none';
    pofCard.style.display = 'none';
    var legend = document.getElementById('radarLegend');
    var items = legend.children;
    for (var li = 1; li < items.length; li++) items[li].style.display = 'none';
  }

  // Set query to center of search space
  query = params.map(function(p) {
    if (p.type === 'choice') return p.values[0];
    return (p.bounds[0] + p.bounds[1]) / 2;
  });

  // Update title/subtitle
  var fixName = fix.name || (fix.metadata && fix.metadata.name ? fix.metadata.name : '');
  document.getElementById('title').textContent = fixName
    ? 'GP Surrogate \u2014 ' + fixName : 'Multi-Objective Radar';

  var nTrain = fix.model_state.model_type === 'ModelListGP'
    ? fix.model_state.models[0].train_X.length
    : (fix.model_state.train_X || []).length;
  document.getElementById('subtitle').textContent =
    nTrain + ' training points \u00B7 ' + NOBJ + ' objectives' +
    (NCON > 0 ? ' \u00B7 ' + NCON + ' constraints' : '');

  // Compute normalization bounds by sampling the GP
  computeNormBounds();
  buildSliders();
  onQueryChange();
}

// ── Normalization bounds (sampled from GP predictions) ──
function computeNormBounds() {
  var nSample = 400;
  var pts = [];
  for (var i = 0; i < nSample; i++) {
    pts.push(params.map(function(p) {
      if (p.type === 'choice') return p.values[Math.floor(Math.random() * p.values.length)];
      return p.bounds[0] + Math.random() * (p.bounds[1] - p.bounds[0]);
    }));
  }
  var preds = predictor.predict(pts);

  normBounds = { obj: [], con: [] };
  OBJ_INFO.forEach(function(inf) {
    var pred = preds[inf.name];
    var lo = Infinity, hi = -Infinity;
    for (var j = 0; j < nSample; j++) {
      var m = pred.mean[j];
      if (m < lo) lo = m;
      if (m > hi) hi = m;
    }
    normBounds.obj.push({ min: lo, max: hi });
  });
  CON_INFO.forEach(function(inf) {
    var pred = preds[inf.name];
    var lo = Infinity, hi = -Infinity;
    for (var j = 0; j < nSample; j++) {
      var m = pred.mean[j];
      if (m < lo) lo = m;
      if (m > hi) hi = m;
    }
    normBounds.con.push({ min: lo, max: hi });
  });
}

function predictSplit(xs) {
  var preds = predictor.predict([xs]);
  var objectives = OBJ_INFO.map(function(inf) {
    return { mean: preds[inf.name].mean[0], std: Math.sqrt(preds[inf.name].variance[0]) };
  });
  var constraints = CON_INFO.map(function(inf) {
    return { mean: preds[inf.name].mean[0], std: Math.sqrt(preds[inf.name].variance[0]) };
  });
  return { objectives: objectives, constraints: constraints };
}

function normObj(v, k)    { var b=normBounds.obj[k]; return (v-b.min)/((b.max-b.min)||1); }
function normObjStd(s, k) { var b=normBounds.obj[k]; return s/((b.max-b.min)||1); }
function normCon(v, k)    { return v / (1.5*CON_INFO[k].threshold); }
function normConStd(s, k) { return s / (1.5*CON_INFO[k].threshold); }
var THRESH_FRAC = 2/3;

function allRadii(preds, ciSigmas) {
  var r = [];
  preds.objectives.forEach(function(p,k) {
    r.push(Math.max(0, Math.min(1.15, normObj(p.mean,k) + ciSigmas*normObjStd(p.std,k))));
  });
  preds.constraints.forEach(function(p,k) {
    r.push(Math.max(0, Math.min(1.15, normCon(p.mean,k) + ciSigmas*normConStd(p.std,k))));
  });
  return r;
}

function normCDF(z) {
  var t=1/(1+0.2316419*Math.abs(z));
  var d=0.3989422813*Math.exp(-z*z/2);
  var p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return z>0 ? 1-p : p;
}

function isViolated(p, k) {
  if (CON_INFO[k].op === 'GEQ') return p.mean < CON_INFO[k].threshold;
  return p.mean > CON_INFO[k].threshold;
}

function probFeasible(conPreds) {
  if (conPreds.length === 0) return 1;
  return conPreds.reduce(function(acc,p,k) {
    var z;
    if (CON_INFO[k].op === 'GEQ') {
      z = (p.mean - CON_INFO[k].threshold) / (p.std+1e-10);
    } else {
      z = (CON_INFO[k].threshold - p.mean) / (p.std+1e-10);
    }
    return acc * normCDF(z);
  }, 1);
}

// ── Radar drawing ──
var cvs = document.getElementById('radarCanvas');
var rctx = cvs.getContext('2d');
var CW=cvs.width, CH=cvs.height, CX=CW/2, CY=CH/2, RADAR_R=140;

function spoke(r, i) {
  var a = -Math.PI/2 + i*(2*Math.PI/N_AXES);
  return [CX+r*Math.cos(a), CY+r*Math.sin(a)];
}
function axAngle(i) { return -Math.PI/2 + i*(2*Math.PI/N_AXES); }

function polygon(radii) {
  rctx.beginPath();
  radii.forEach(function(r,i) { var xy=spoke(r*RADAR_R,i); i?rctx.lineTo(xy[0],xy[1]):rctx.moveTo(xy[0],xy[1]); });
  rctx.closePath();
}

function drawRadar(preds) {
  rctx.clearRect(0,0,CW,CH);
  var cp = preds.constraints;
  var anyViol = cp.some(function(p,k) { return isViolated(p,k); });

  // Grid rings
  for(var g=1;g<=5;g++) {
    var r=g/5;
    rctx.beginPath();
    for(var i=0;i<N_AXES;i++){var xy=spoke(r*RADAR_R,i);i?rctx.lineTo(xy[0],xy[1]):rctx.moveTo(xy[0],xy[1]);}
    rctx.closePath();
    rctx.strokeStyle = g===5?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.05)';
    rctx.lineWidth = g===5?0.8:0.4; rctx.stroke();
  }

  // Constraint threshold ring (dashed)
  if (NCON > 0) {
    rctx.beginPath();
    for(var k=0;k<NCON;k++){
      var xy=spoke(THRESH_FRAC*RADAR_R, NOBJ+k);
      k===0?rctx.moveTo(xy[0],xy[1]):rctx.lineTo(xy[0],xy[1]);
    }
    rctx.closePath();
    rctx.strokeStyle='rgba(200,150,60,0.4)'; rctx.lineWidth=0.8;
    rctx.setLineDash([4,3]); rctx.stroke(); rctx.setLineDash([]);
  }

  // Spokes
  for(var i=0;i<N_AXES;i++){
    var isObj=i<NOBJ, ki=i-NOBJ;
    var viol=!isObj&&isViolated(cp[ki],ki);
    var xy=spoke(RADAR_R,i);
    rctx.beginPath(); rctx.moveTo(CX,CY); rctx.lineTo(xy[0],xy[1]);
    rctx.strokeStyle=viol?'rgba(210,70,70,0.6)':isObj?'rgba(110,130,230,0.45)':'rgba(190,145,70,0.4)';
    rctx.lineWidth=0.8; rctx.stroke();
    if(!isObj){
      var txy=spoke(THRESH_FRAC*RADAR_R,i);
      rctx.save(); rctx.translate(txy[0],txy[1]); rctx.rotate(axAngle(i));
      var s=4.5; rctx.beginPath();
      rctx.moveTo(0,-s); rctx.lineTo(s,0); rctx.lineTo(0,s); rctx.lineTo(-s,0); rctx.closePath();
      rctx.fillStyle=viol?'rgba(200,60,60,0.9)':'rgba(200,150,60,0.65)';
      rctx.fill(); rctx.restore();
    }
  }

  // Axis ticks — show value labels along each spoke
  rctx.save();
  rctx.font='9px sans-serif';
  for(var i=0;i<N_AXES;i++){
    var isObj=i<NOBJ, ki=i-NOBJ;
    var nTicks=3; // number of tick labels along each spoke
    for(var t=1;t<=nTicks;t++){
      var frac=t/nTicks; // fraction of RADAR_R
      var txy=spoke(frac*RADAR_R,i);
      // Compute actual value at this radius
      var val;
      if(isObj){
        var b=normBounds.obj[i];
        val=b.min+frac*(b.max-b.min);
      } else {
        val=frac*1.5*CON_INFO[ki].threshold;
      }
      // Format: use compact notation
      var txt;
      if(Math.abs(val)>=100) txt=Math.round(val).toString();
      else if(Math.abs(val)>=1) txt=val.toFixed(1);
      else txt=val.toFixed(2);
      // Small tick mark perpendicular to spoke
      var a=axAngle(i);
      var px=Math.cos(a+Math.PI/2)*3, py=Math.sin(a+Math.PI/2)*3;
      rctx.beginPath();
      rctx.moveTo(txy[0]-px,txy[1]-py);
      rctx.lineTo(txy[0]+px,txy[1]+py);
      rctx.strokeStyle='rgba(255,255,255,0.15)';
      rctx.lineWidth=0.8; rctx.stroke();
      // Label offset to the right of the spoke
      var ox=Math.cos(a+Math.PI/2)*10, oy=Math.sin(a+Math.PI/2)*10;
      rctx.textAlign='center'; rctx.textBaseline='middle';
      rctx.fillStyle='rgba(255,255,255,0.2)';
      rctx.fillText(txt, txy[0]+ox, txy[1]+oy);
    }
  }
  rctx.restore();

  // 95% CI band
  if(document.getElementById('cbCI').checked){
    var upR=allRadii(preds,+1.96), loR=allRadii(preds,-1.96);
    rctx.save();
    rctx.beginPath();
    upR.forEach(function(r,i){var xy=spoke(r*RADAR_R,i);i?rctx.lineTo(xy[0],xy[1]):rctx.moveTo(xy[0],xy[1]);});
    rctx.closePath();
    var revKeys = Array.from(Array(N_AXES).keys()).reverse();
    revKeys.forEach(function(ri,j){
      var xy=spoke(loR[ri]*RADAR_R,ri); j===0?rctx.moveTo(xy[0],xy[1]):rctx.lineTo(xy[0],xy[1]);
    });
    rctx.closePath();
    rctx.fillStyle=anyViol?'rgba(200,70,70,0.14)':'rgba(100,120,230,0.16)';
    rctx.fill('evenodd'); rctx.restore();

    polygon(upR);
    rctx.strokeStyle=anyViol?'rgba(200,70,70,0.3)':'rgba(100,120,230,0.3)';
    rctx.lineWidth=0.7; rctx.setLineDash([3,3]); rctx.stroke(); rctx.setLineDash([]);
    polygon(loR);
    rctx.strokeStyle=anyViol?'rgba(200,70,70,0.2)':'rgba(100,120,230,0.2)';
    rctx.lineWidth=0.7; rctx.setLineDash([3,3]); rctx.stroke(); rctx.setLineDash([]);
  }

  // Mean polygon
  var mR=allRadii(preds,0);
  polygon(mR);
  rctx.fillStyle=anyViol?'rgba(190,60,60,0.22)':'rgba(90,110,220,0.22)';
  rctx.fill();
  rctx.strokeStyle=anyViol?'rgba(210,80,80,0.9)':'rgba(130,155,255,0.9)';
  rctx.lineWidth=2; rctx.stroke();

  // Vertex dots
  mR.forEach(function(r,i){
    var isObj=i<NOBJ, ki=i-NOBJ;
    var viol=!isObj&&isViolated(cp[ki],ki);
    var xy=spoke(r*RADAR_R,i);
    rctx.beginPath(); rctx.arc(xy[0],xy[1],3.5,0,2*Math.PI);
    rctx.fillStyle=viol?'#ff4444':isObj?'rgba(170,190,255,0.9)':'rgba(210,170,90,0.9)';
    rctx.fill(); rctx.strokeStyle='#0f0f11'; rctx.lineWidth=1.5; rctx.stroke();
  });

  // Axis labels
  for(var i=0;i<N_AXES;i++){
    var isObj=i<NOBJ, ki=i-NOBJ;
    var viol=!isObj&&isViolated(cp[ki],ki);
    var lxy=spoke(RADAR_R+20,i);
    var shortName=isObj?OBJ_INFO[i].short:CON_INFO[ki].short;
    rctx.textAlign='center'; rctx.textBaseline='middle';
    rctx.font='500 12px sans-serif';
    rctx.fillStyle=viol?'#ff6060':isObj?'rgba(150,170,255,0.9)':'rgba(210,168,85,0.9)';
    rctx.fillText(shortName, lxy[0], lxy[1]);
  }

  // Center dot
  rctx.beginPath(); rctx.arc(CX,CY,3,0,2*Math.PI);
  rctx.fillStyle='rgba(255,255,255,0.18)'; rctx.fill();
}

// ── Left panel stat cards ──
function updateCards(preds, pof) {
  var objDiv=document.getElementById('obj-cards');
  objDiv.innerHTML='';
  preds.objectives.forEach(function(p,k){
    var inf=OBJ_INFO[k];
    var lo=p.mean-1.96*p.std, hi=p.mean+1.96*p.std;
    var d=document.createElement('div'); d.className='stat-row';
    d.innerHTML=
      '<div class="sr-head"><span class="sr-name">'+inf.name+'</span></div>'+
      '<div><span class="sr-val">'+p.mean.toFixed(inf.decs)+'</span></div>'+
      '<div class="sr-ci">95% CI <span class="clo">'+lo.toFixed(inf.decs)+'</span> \u2013 <span class="chi">'+hi.toFixed(inf.decs)+'</span></div>';
    objDiv.appendChild(d);
  });

  var conDiv=document.getElementById('con-cards');
  conDiv.innerHTML='';
  preds.constraints.forEach(function(p,k){
    var inf=CON_INFO[k];
    var lo=p.mean-1.96*p.std, hi=p.mean+1.96*p.std;
    var z;
    if (inf.op === 'GEQ') { z = (p.mean - inf.threshold) / (p.std+1e-10); }
    else { z = (inf.threshold - p.mean) / (p.std+1e-10); }
    var pf=normCDF(z);
    var viol=isViolated(p,k);
    var opStr = inf.op === 'GEQ' ? '\u2265' : '\u2264';
    var close = !viol && (inf.op === 'GEQ' ? p.mean < inf.threshold * 1.12 : p.mean > inf.threshold * 0.88);

    var bCls, bTxt;
    if(pf>0.95){bCls='b-ok';bTxt='feasible';}
    else if(pf>0.5){bCls='b-warn';bTxt='uncertain';}
    else{bCls='b-viol';bTxt='violated';}

    var d=document.createElement('div');
    d.className='stat-row'+(viol?' viol':close?' close':'');
    d.innerHTML=
      '<div class="sr-head">'+
        '<span class="sr-name">'+inf.name+'</span>'+
        '<span class="badge '+bCls+'">'+bTxt+'</span>'+
      '</div>'+
      '<div><span class="sr-val">'+p.mean.toFixed(inf.decs)+'</span></div>'+
      '<div class="sr-ci">95% CI <span class="clo">'+lo.toFixed(inf.decs)+'</span> \u2013 <span class="chi">'+hi.toFixed(inf.decs)+'</span></div>'+
      '<div class="sr-thresh">threshold '+opStr+' '+inf.threshold+' \u00B7 P(ok)='+(pf*100).toFixed(0)+'%</div>';
    conDiv.appendChild(d);
  });

  if (NCON > 0) {
    var pofPct=(pof*100).toFixed(1);
    document.getElementById('pof-val').textContent=pofPct+'%';
    document.getElementById('pof-bar').style.width=pofPct+'%';
    var card=document.getElementById('pof-card');
    var pofVal=document.getElementById('pof-val');
    var bar=document.getElementById('pof-bar');
    if(pof<0.25){
      card.style.borderColor='#5a1e1e'; pofVal.style.color='#c04040'; bar.style.background='#7a2828';
    } else if(pof<0.6){
      card.style.borderColor='#3a3a18'; pofVal.style.color='#8a8a38'; bar.style.background='#6a6a28';
    } else {
      card.style.borderColor='#1a2830'; pofVal.style.color='#4878a0'; bar.style.background='#305870';
    }
    document.getElementById('pof-sub').textContent = '\u220F \u03A6((g\u2096* \u2212 \u03BC\u2096)/\u03C3\u2096)  =  '+pofPct+'%';
  }
}

// ── Sliders ──
function buildSliders() {
  var div=document.getElementById('sliders');
  div.innerHTML='';
  params.forEach(function(p, i) {
    if (p.type !== 'range') return;
    var lo=p.bounds[0], hi=p.bounds[1];
    var step = p.parameter_type === 'int' ? 1 : (hi-lo)/200;
    var row=document.createElement('div'); row.className='slrow';
    var lbl=document.createElement('div'); lbl.className='sllbl';
    lbl.innerHTML='<span class="sllbl-name">'+p.name+'</span>';
    var wrap=document.createElement('div'); wrap.className='sl-wrap';
    var sl=document.createElement('input');
    sl.type='range'; sl.min=lo; sl.max=hi; sl.step=step; sl.value=query[i];
    var bounds=document.createElement('div'); bounds.className='sl-bounds';
    bounds.innerHTML='<span>'+lo+'</span><span>'+hi+'</span>';
    wrap.appendChild(sl); wrap.appendChild(bounds);
    var val=document.createElement('span'); val.className='slval';
    val.textContent=p.parameter_type === 'int' ? String(Math.round(+sl.value)) : (+sl.value).toFixed(3);
    (function(idx, sl, val, param) {
      sl.addEventListener('input',function(){
        query[idx]=+sl.value;
        val.textContent = param.parameter_type === 'int' ? String(Math.round(+sl.value)) : (+sl.value).toFixed(3);
        onQueryChange();
      });
    })(i, sl, val, p);
    row.appendChild(lbl); row.appendChild(wrap); row.appendChild(val);
    div.appendChild(row);
  });
}

// ── Main update ──
function onQueryChange() {
  var preds = predictSplit(query);
  var pof = probFeasible(preds.constraints);
  drawRadar(preds);
  updateCards(preds, pof);
}

// ── Controls ──
document.getElementById('cbCI').addEventListener('change', function(){ onQueryChange(); });

document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

// ── Init ──
loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;




// ─── Scatteroid ──────────────────────────────────────────────────────────────

const scatteroid = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Multi-Outcome Scatterplot</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0f0f11; color: #e0e0e0;
  padding: 1.5rem 2rem; min-height: 100vh;
}
h1 { font-size: 17px; font-weight: 500; color: #f0f0f0; margin-bottom: 3px; }
.subtitle { font-size: 12px; color: #777; margin-bottom: 16px; }
.controls {
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;
}
label { font-size: 13px; color: #aaa; }
select, button {
  font-size: 13px; padding: 4px 9px; border-radius: 6px;
  border: 0.5px solid #444; background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none;
}
button:hover { background: #252528; }
.cb-label { font-size: 13px; color: #aaa; display: flex; align-items: center; gap: 4px; cursor: pointer; }
.main-area { display: flex; gap: 20px; align-items: flex-start; }
.scatter-wrap { position: relative; flex-shrink: 0; }
#scatterSvg { display: block; }
.right-panel {
  background: #141418; border: 0.5px solid #222; border-radius: 8px;
  padding: 14px 16px; flex-shrink: 0;
}
.rp-title {
  font-size: 11px; color: #555; letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 14px;
}
#rpBars svg { display: block; }
.slider-section {
  border-top: 0.5px solid #2a2a30; margin-top: 14px; padding-top: 12px;
}
.slider-section .section-title {
  font-size: 11px; color: #555; letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
}
.clone-btn {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  border: 0.5px solid #555; background: #1e1e24; color: #aaa; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.clone-btn:hover { background: #2a2a30; color: #ddd; }
.param-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
}
.param-row label {
  font-size: 10px; color: #777; width: 100px; text-align: right; flex-shrink: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.param-row input[type=range] {
  flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
  background: #2a2a30; border-radius: 2px; outline: none; cursor: pointer;
}
.param-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px;
  border-radius: 50%; background: #7c8cc8; cursor: pointer; border: none;
}
.param-row input[type=range]:disabled { opacity: 0.4; cursor: default; }
.param-row input[type=range]:disabled::-webkit-slider-thumb { background: #666; cursor: default; }
.param-row .param-val {
  font-size: 10px; color: #888; width: 42px; text-align: left; flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.delete-btn {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: auto;
  border: 0.5px solid #555; background: #2a1a1a; color: #c66; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.delete-btn:hover { background: #3a2020; color: #f88; }
</style>
</head>
<body>

<h1>${axHomeLink}Multi-Outcome Scatterplot</h1>
<p class="subtitle" id="subtitle">Training arms relativized vs status quo</p>

<div class="controls">
  <label>X axis <select id="selX"></select></label>
  <label>Y axis <select id="selY"></select></label>
  <label style="margin-left:8px">Status Quo: <select id="selSQ"></select></label>
  <label style="margin-left:8px">Distance:
    <select id="selDistMode">
      <option value="euclidean">euclidean distance</option>
      <option value="bi-objective" selected>bi-objective kernel</option>
      <option value="kernel">kernel distance</option>
    </select>
  </label>
  <button id="btnResample">resample ↺</button>
</div>

<div class="main-area">
  <div class="scatter-wrap">
    <svg id="scatterSvg" width="520" height="460"></svg>
  </div>
  <div class="right-panel" id="rightPanel">
    <div class="rp-title" id="rpTitle">Click an arm to see all outcomes</div>
    <div id="rpBars"></div>
    <div id="rpSliders"></div>
  </div>
</div>

${libraryScript()}
${sharedUtilsScript()}

<script>
(function() {
var Predictor = axjs.Predictor;
var relativize = axjs.relativize;

// ── VSIP test problem (same as radar demo) ──
var NDIM = 7, NRESP = 9;
var BOUNDS = [
  [0.5, 1.5], [0.45, 1.35], [0.5, 1.5], [0.5, 1.5],
  [0.875, 2.625], [0.4, 1.2], [0.4, 1.2]
];
var PARAM_NAMES = [
  'bpillar_inner', 'bpillar_outer', 'floor_side_inner', 'cross_member',
  'door_beam', 'door_belt_line', 'roof_rail'
];
var OUTCOME_NAMES = [
  'weight', 'acceleration', 'intrusion', 'door_velocity', 'bpillar_top_vel',
  'bpillar_mid_vel', 'pubic_force', 'viscous_criterion', 'abdomen_load'
];

function evaluate(x) {
  var x1=x[0],x2=x[1],x3=x[2],x4=x[3],x5=x[4],x6=x[5],x7=x[6];
  return [
    1.98 + 4.90*x1 + 6.67*x2 + 6.98*x3 + 4.01*x4 + 1.78*x5 + 0.001*x6 + 2.73*x7,
    7.50 - 0.80*x1 - 0.60*x2 - 0.40*x3 - 0.50*x4 - 0.30*x5 + 0.30*x1*x2 + 0.20*x2*x3,
    15.0 - 2.00*x1 - 1.50*x2 - 1.00*x3 - 1.50*x5 + 0.50*x1*x2 + 0.30*x5*x6,
    38.0 - 4.00*x1 - 3.00*x2 - 2.00*x5 + 0.50*x1*x2 - 0.30*x3*x5 + x6,
    42.0 - 6.00*x1 - 5.00*x2 - 3.00*x5 + 0.50*x1*x2 - 0.20*x1*x1,
    40.0 - 5.00*x1 - 4.00*x2 - 2.00*x3 - 2.00*x5 + 0.80*x1*x2,
    6.00 - 0.80*x1 - 0.90*x2 - 0.60*x5 - 0.40*x6 + 0.30*x1*x5,
    0.50 - 0.08*x1 - 0.07*x2 - 0.05*x5 + 0.02*x1*x2,
    1.40 - 0.18*x1 - 0.15*x2 - 0.12*x3 - 0.08*x5 + 0.05*x2*x3
  ];
}

function randn() {
  var u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ── Real VSIP hyperparameters from BoTorch-fitted fixture ──
var NOISE_FRAC = 0.05;  // observation noise SD = 5% of outcome range

// Per-outcome kernel hyperparameters (from real VSIP fixture)
var HP = [
  { ls: [1.6267,1.2128,1.2446,1.6253,3.608,8.932,1.7659],   mc: 0.0791, ot_mean: 29.7373, ot_std: 2.8713 },
  { ls: [1.307,1.3154,1.8387,1.2458,2.389,8.2335,7.9159],    mc:-0.1650, ot_mean: 5.0977,  ot_std: 0.2551 },
  { ls: [1.4428,1.6983,1.999,10.2398,2.1422,1.8556,10.6526], mc: 0.0363, ot_mean: 8.6801,  ot_std: 0.8495 },
  { ls: [1.3759,1.6135,3.3776,11.3655,2.2074,2.4952,10.4684],mc: 0.1406, ot_mean: 28.1566, ot_std: 1.6130 },
  { ls: [1.2147,1.3802,18.3456,15.5716,2.5602,14.1023,13.642],mc:0.0335, ot_mean: 25.9059, ot_std: 2.2715 },
  { ls: [1.1935,1.3005,1.8258,11.2485,2.4421,11.1151,10.2955],mc:0.0119, ot_mean: 26.2324, ot_std: 1.5737 },
  { ls: [1.1141,0.9713,14.616,11.7787,1.987,1.3989,11.441],  mc: 0.2721, ot_mean: 3.4712,  ot_std: 0.2693 },
  { ls: [1.3767,1.5675,17.9047,15.4862,2.4013,13.9189,13.9475],mc:0.0696, ot_mean: 0.2780, ot_std: 0.0324 },
  { ls: [1.1656,1.2878,1.6227,9.9579,2.3484,9.793,9.4348],   mc: 0.0302, ot_mean: 0.8563,  ot_std: 0.0629 }
];

// Input transform: raw bounds → [0,1]^7 (Normalize)
var INPUT_TF = {
  offset: BOUNDS.map(function(b) { return b[0]; }),
  coefficient: BOUNDS.map(function(b) { return b[1] - b[0]; })
};
var SEARCH_SPACE = {
  parameters: PARAM_NAMES.map(function(name, i) {
    return { name: name, type: 'range', bounds: BOUNDS[i] };
  })
};

// Compute outcome ranges from a sample to set noise SDs
var rangeSample = [];
for (var ri = 0; ri < 500; ri++) {
  rangeSample.push(BOUNDS.map(function(b) { return b[0] + Math.random()*(b[1]-b[0]); }));
}
var rangeEvals = rangeSample.map(evaluate);
var outcomeRanges = [];
for (var k = 0; k < NRESP; k++) {
  var vals = rangeEvals.map(function(e) { return e[k]; });
  outcomeRanges.push(Math.max.apply(null, vals) - Math.min.apply(null, vals));
}

// ── Build model on the fly ──
var nSamples = 32;
var predictor = null;
var trainX = [];

function buildModel() {
  trainX = [];
  for (var i = 0; i < nSamples; i++) {
    trainX.push(BOUNDS.map(function(b) { return b[0] + Math.random()*(b[1]-b[0]); }));
  }
  var evals = trainX.map(evaluate);

  var subModels = [];
  for (var k = 0; k < NRESP; k++) {
    var hp = HP[k];
    var noiseSd = NOISE_FRAC * outcomeRanges[k];
    var noiseVar = noiseSd * noiseSd;

    // Standardize Y using the real outcome transform parameters
    var rawY = evals.map(function(e) { return e[k] + noiseSd * randn(); });
    var trainY = rawY.map(function(y) { return (y - hp.ot_mean) / hp.ot_std; });

    // Per-observation noise variance in standardized space
    var stdNoiseVar = noiseVar / (hp.ot_std * hp.ot_std);
    var trainYvar = [];
    for (var j = 0; j < nSamples; j++) trainYvar.push(stdNoiseVar);

    subModels.push({
      model_type: 'SingleTaskGP',
      train_X: trainX,
      train_Y: trainY,
      kernel: {
        type: 'RBF',
        lengthscale: hp.ls
      },
      mean_constant: hp.mc,
      noise_variance: trainYvar,
      input_transform: INPUT_TF,
      outcome_transform: { type: 'Standardize', mean: hp.ot_mean, std: hp.ot_std }
    });
  }

  predictor = new Predictor({
    search_space: SEARCH_SPACE,
    model_state: {
      model_type: 'ModelListGP',
      outcome_names: OUTCOME_NAMES,
      models: subModels
    }
  });
}

buildModel();
var nArms = nSamples;
var nDims = NDIM;
var outcomeNames = OUTCOME_NAMES;
var paramNames = PARAM_NAMES;
var paramBounds = BOUNDS;

// ── Precompute predictions for all training arms ──
var allPreds = [];
function precomputePreds() {
  allPreds = [];
  for (var i = 0; i < nArms; i++) {
    allPreds.push(predictor.predict([trainX[i]]));
  }
}
precomputePreds();

// ── Default SQ = closest to center ──
function closestToCenterIdx() {
  var center = paramBounds.map(function(b) { return (b[0]+b[1])/2; });
  var best = 0, bestD = Infinity;
  trainX.forEach(function(pt, i) {
    var d = 0;
    for (var j = 0; j < nDims; j++) {
      var rng = paramBounds[j][1] - paramBounds[j][0] || 1;
      d += Math.pow((pt[j] - center[j]) / rng, 2);
    }
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

var sqIdx = closestToCenterIdx();

// ── Relativize all arms vs SQ ──
var relData = [];
function reRelativize() {
  relData = [];
  var sqPred = allPreds[sqIdx];
  for (var i = 0; i < nArms; i++) {
    var armRel = {};
    for (var k = 0; k < outcomeNames.length; k++) {
      var name = outcomeNames[k];
      var armMean = allPreds[i][name].mean[0];
      var armVar = allPreds[i][name].variance[0];
      var armSem = Math.sqrt(Math.max(0, armVar));
      var sqMean = sqPred[name].mean[0];
      var sqVar = sqPred[name].variance[0];
      var sqSem = Math.sqrt(Math.max(0, sqVar));
      try {
        armRel[name] = relativize(armMean, armSem, sqMean, sqSem, { asPercent: true });
      } catch(e) {
        armRel[name] = null;
      }
    }
    relData.push(armRel);
  }
}
reRelativize();

var CI_Z = { c99: 2.576, c95: 1.960, c75: 1.150 };

// ── Compute global panel range (fixed across all arms/outcomes) ──
var panelRange = { lo: -10, hi: 10, ticks: [-10, -5, 0, 5, 10] };
function computePanelRange() {
  // Use 95% CI endpoints (not 99%) to set the axis — keeps it tighter.
  // The 99% bars can extend slightly past the axis edge, which is fine.
  var lo = 0, hi = 0;
  for (var i = 0; i < nArms; i++) {
    for (var k = 0; k < outcomeNames.length; k++) {
      var r = relData[i][outcomeNames[k]];
      if (r) {
        var rlo = r.mean - CI_Z.c95 * r.sem;
        var rhi = r.mean + CI_Z.c95 * r.sem;
        if (rlo < lo) lo = rlo;
        if (rhi > hi) hi = rhi;
      }
    }
  }
  // Light padding + round to nice ticks
  var span = hi - lo; if (span < 1) span = 1;
  lo -= span * 0.05; hi += span * 0.05;
  var raw = (hi - lo) / 5;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var nice = [1, 2, 5, 10];
  var step = mag;
  for (var n = 0; n < nice.length; n++) {
    if (nice[n] * mag >= raw) { step = nice[n] * mag; break; }
  }
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  var ticks = [];
  for (var t = lo; t <= hi + step * 0.01; t += step) ticks.push(Math.round(t * 100) / 100);
  panelRange = { lo: lo, hi: hi, ticks: ticks };
}
computePanelRange();

// ── Populate dropdowns ──
var selX = document.getElementById('selX');
var selY = document.getElementById('selY');
var selSQ = document.getElementById('selSQ');

outcomeNames.forEach(function(name, idx) {
  selX.innerHTML += '<option value="' + idx + '">' + name + '</option>';
  selY.innerHTML += '<option value="' + idx + '">' + name + '</option>';
});
selX.value = '0';
selY.value = '1';

function populateSQDropdown() {
  selSQ.innerHTML = '';
  for (var i = 0; i < nArms; i++) {
    selSQ.innerHTML += '<option value="' + i + '">Arm #' + (i+1) + '</option>';
  }
  selSQ.value = String(sqIdx);
}
populateSQDropdown();

var xOutIdx = 0, yOutIdx = 1;

// ── Candidate system ──
var candidates = [];     // [{id, name, params, preds, relData}]
var nextCandidateId = 1;
var selectedItem = null; // {type:'arm'|'candidate', idx:number} or null

function predictCandidate(cand) {
  cand.preds = predictor.predict([cand.params]);
  cand.relData = {};
  var sqPred = allPreds[sqIdx];
  for (var k = 0; k < outcomeNames.length; k++) {
    var name = outcomeNames[k];
    var cMean = cand.preds[name].mean[0];
    var cVar = cand.preds[name].variance[0];
    var cSem = Math.sqrt(Math.max(0, cVar));
    var sqMean = sqPred[name].mean[0];
    var sqVar = sqPred[name].variance[0];
    var sqSem = Math.sqrt(Math.max(0, sqVar));
    try {
      cand.relData[name] = relativize(cMean, cSem, sqMean, sqSem, { asPercent: true });
    } catch(e) {
      cand.relData[name] = null;
    }
  }
}

function cloneArm(armIdx) {
  var cand = {
    id: nextCandidateId++,
    name: 'Candidate ' + (nextCandidateId - 1),
    params: trainX[armIdx].slice(),
    preds: null,
    relData: null
  };
  predictCandidate(cand);
  candidates.push(cand);
  selectedItem = { type: 'candidate', idx: candidates.length - 1 };
  renderScatter();
  showDeltoid(null);
  renderSliders();
}

function deleteCandidate(candIdx) {
  candidates.splice(candIdx, 1);
  if (selectedItem && selectedItem.type === 'candidate') {
    if (selectedItem.idx === candIdx) selectedItem = null;
    else if (selectedItem.idx > candIdx) selectedItem.idx--;
  }
  renderScatter();
  showDeltoid(null);
  renderSliders();
}

function starPoints(cx, cy, r) {
  var pts = [];
  for (var i = 0; i < 10; i++) {
    var angle = -Math.PI/2 + i * Math.PI/5;
    var rad = i % 2 === 0 ? r : r * 0.42;
    pts.push((cx + rad * Math.cos(angle)).toFixed(1) + ',' + (cy + rad * Math.sin(angle)).toFixed(1));
  }
  return pts.join(' ');
}

// ── SVG rendering ──
var svg = document.getElementById('scatterSvg');
var rightPanel = document.getElementById('rightPanel');
var rpTitle = document.getElementById('rpTitle');
var rpBars = document.getElementById('rpBars');
var selDistMode = document.getElementById('selDistMode');

var W = 520, H = 460;
var margin = { top: 30, right: 20, bottom: 55, left: 65 };
var pw = W - margin.left - margin.right;
var ph = H - margin.top - margin.bottom;

// Compute nice axis range from data: includes CI endpoints, pads, rounds to clean ticks
function niceRange(pts, getVal, getSem) {
  var lo = 0, hi = 0; // always include 0
  pts.forEach(function(p) {
    var v = getVal(p), s = getSem(p);
    var vlo = v - 1.96 * s, vhi = v + 1.96 * s;
    if (vlo < lo) lo = vlo;
    if (vhi > hi) hi = vhi;
  });
  var span = hi - lo; if (span < 1) span = 1;
  lo -= span * 0.12; hi += span * 0.12;
  // Round to nice tick interval
  var raw = (hi - lo) / 5;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var nice = [1, 2, 5, 10];
  var step = mag;
  for (var n = 0; n < nice.length; n++) {
    if (nice[n] * mag >= raw) { step = nice[n] * mag; break; }
  }
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  // Generate ticks
  var ticks = [];
  for (var t = lo; t <= hi + step * 0.01; t += step) ticks.push(Math.round(t * 100) / 100);
  return { lo: lo, hi: hi, ticks: ticks };
}

function renderScatter() {
  var xName = outcomeNames[xOutIdx];
  var yName = outcomeNames[yOutIdx];

  var pts = [];
  for (var i = 0; i < nArms; i++) {
    var rx = relData[i][xName];
    var ry = relData[i][yName];
    if (rx && ry) {
      pts.push({ idx: i, type: 'arm', x: rx.mean, y: ry.mean,
                 xSem: rx.sem, ySem: ry.sem });
    }
  }
  // Include candidates for axis range + rendering
  for (var ci = 0; ci < candidates.length; ci++) {
    var crx = candidates[ci].relData[xName];
    var cry = candidates[ci].relData[yName];
    if (crx && cry) {
      pts.push({ idx: ci, type: 'candidate', x: crx.mean, y: cry.mean,
                 xSem: crx.sem, ySem: cry.sem });
    }
  }

  var xRange = niceRange(pts, function(p){return p.x;}, function(p){return p.xSem;});
  var yRange = niceRange(pts, function(p){return p.y;}, function(p){return p.ySem;});
  var xMin = xRange.lo, xMax = xRange.hi;
  var yMin = yRange.lo, yMax = yRange.hi;

  function sx(v) { return margin.left + (v - xMin) / (xMax - xMin) * pw; }
  function sy(v) { return margin.top + ph - (v - yMin) / (yMax - yMin) * ph; }

  var html = '';
  html += '<rect width="' + W + '" height="' + H + '" fill="#141418" rx="8"/>';
  html += '<defs><clipPath id="plotClip"><rect x="' + margin.left + '" y="' + margin.top +
          '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>';

  // Grid + tick labels (data-adaptive)
  xRange.ticks.forEach(function(tv) {
    html += '<line x1="' + sx(tv) + '" y1="' + margin.top + '" x2="' + sx(tv) +
            '" y2="' + (margin.top + ph) + '" stroke="#1e1e24" stroke-width="0.5"/>';
    html += '<text x="' + sx(tv) + '" y="' + (H - margin.bottom + 16) +
            '" text-anchor="middle" fill="#555" font-size="10">' + tv + '%</text>';
  });
  yRange.ticks.forEach(function(tv) {
    html += '<line x1="' + margin.left + '" y1="' + sy(tv) + '" x2="' + (margin.left + pw) +
            '" y2="' + sy(tv) + '" stroke="#1e1e24" stroke-width="0.5"/>';
    html += '<text x="' + (margin.left - 8) + '" y="' + (sy(tv) + 3) +
            '" text-anchor="end" fill="#555" font-size="10">' + tv + '%</text>';
  });

  // Zero reference lines (dashed)
  if (xMin <= 0 && xMax >= 0) {
    html += '<line x1="' + sx(0) + '" y1="' + margin.top + '" x2="' + sx(0) +
            '" y2="' + (margin.top + ph) + '" stroke="#3a3a44" stroke-width="1" stroke-dasharray="4,3"/>';
  }
  if (yMin <= 0 && yMax >= 0) {
    html += '<line x1="' + margin.left + '" y1="' + sy(0) + '" x2="' + (margin.left + pw) +
            '" y2="' + sy(0) + '" stroke="#3a3a44" stroke-width="1" stroke-dasharray="4,3"/>';
  }

  // Axis labels
  html += '<text x="' + (margin.left + pw/2) + '" y="' + (H - 8) +
          '" text-anchor="middle" fill="#888" font-size="12">' + xName + ' (% vs SQ)</text>';
  html += '<text x="14" y="' + (margin.top + ph/2) +
          '" text-anchor="middle" fill="#888" font-size="12" transform="rotate(-90,14,' +
          (margin.top + ph/2) + ')">' + yName + ' (% vs SQ)</text>';

  // Dots + CI crosshairs — each item wrapped in <g data-idx data-type> for opacity/events
  html += '<g clip-path="url(#plotClip)">';
  pts.forEach(function(p) {
    var isSQ = (p.type === 'arm' && p.idx === sqIdx);
    var isCandidate = (p.type === 'candidate');
    var isSelected = selectedItem && selectedItem.type === p.type && selectedItem.idx === p.idx;
    var cx = sx(p.x), cy = sy(p.y);

    html += '<g data-idx="' + p.idx + '" data-type="' + p.type + '" style="cursor:pointer">';

    // Invisible hit area (large circle for reliable hover)
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="14" fill="transparent"/>';

    // CI crosshairs: thin 95% lines + stubbier 75% lines
    var ciColor = isCandidate ? '#6a5a20' : (isSelected ? '#994040' : '#3a4a6a');
    var ci75Color = isCandidate ? '#8a7a30' : (isSelected ? '#bb5050' : '#5a6a8a');
    // 95% CI (thin)
    var xLo95 = sx(p.x - CI_Z.c95 * p.xSem), xHi95 = sx(p.x + CI_Z.c95 * p.xSem);
    var yLo95 = sy(p.y - CI_Z.c95 * p.ySem), yHi95 = sy(p.y + CI_Z.c95 * p.ySem);
    html += '<line x1="' + xLo95 + '" y1="' + cy + '" x2="' + xHi95 + '" y2="' + cy +
            '" stroke="' + ciColor + '" stroke-width="1"/>';
    html += '<line x1="' + cx + '" y1="' + yLo95 + '" x2="' + cx + '" y2="' + yHi95 +
            '" stroke="' + ciColor + '" stroke-width="1"/>';
    // 75% CI (stubbier, thicker)
    var xLo75 = sx(p.x - CI_Z.c75 * p.xSem), xHi75 = sx(p.x + CI_Z.c75 * p.xSem);
    var yLo75 = sy(p.y - CI_Z.c75 * p.ySem), yHi75 = sy(p.y + CI_Z.c75 * p.ySem);
    html += '<line x1="' + xLo75 + '" y1="' + cy + '" x2="' + xHi75 + '" y2="' + cy +
            '" stroke="' + ci75Color + '" stroke-width="2.5"/>';
    html += '<line x1="' + cx + '" y1="' + yLo75 + '" x2="' + cx + '" y2="' + yHi75 +
            '" stroke="' + ci75Color + '" stroke-width="2.5"/>';

    if (isSQ) {
      // Open diamond for status quo — same color as normal arms, distinct only by shape
      var s = 7;
      html += '<polygon points="' + cx + ',' + (cy-s) + ' ' + (cx+s) + ',' + cy +
              ' ' + cx + ',' + (cy+s) + ' ' + (cx-s) + ',' + cy +
              '" fill="none" stroke="#7c8cc8" stroke-width="2"/>';
    } else if (isCandidate) {
      // Star for candidates
      var starR = isSelected ? 9 : 7;
      html += '<polygon points="' + starPoints(cx, cy, starR) +
              '" fill="#e8b84d" stroke="#fff" stroke-width="' + (isSelected ? 1.5 : 0.5) + '"/>';
    } else {
      var fill = isSelected ? '#ff6b6b' : '#7c8cc8';
      var r = isSelected ? 6 : 4.5;
      var strokeAttr = isSelected ? ' stroke="#fff" stroke-width="1.5"' : '';
      html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
              '" fill="' + fill + '"' + strokeAttr + '/>';
    }
    html += '</g>';
  });
  html += '</g>';

  svg.innerHTML = html;
  // Apply initial opacities
  updateOpacities();
}

// Update dot opacities in-place (no SVG rebuild).
// Hover/pin always highlights neighbors; checkbox controls how aggressively far points dim.
function getRefPoint() {
  // Get the parameter-space point for the reference item (selected or hovered)
  var item = selectedItem || hoveredItem;
  if (!item) return null;
  if (item.type === 'candidate') return candidates[item.idx] ? candidates[item.idx].params : null;
  return trainX[item.idx] || null;
}

function euclideanRelevance(pt, ref) {
  // Normalized euclidean distance in [0,1] input space, converted to RBF-like relevance
  var d2 = 0;
  for (var j = 0; j < ref.length; j++) {
    var diff = pt[j] - ref[j];
    var coeff = INPUT_TF.coefficient[j];
    var scaled = diff / coeff;
    d2 += scaled * scaled;
  }
  return Math.exp(-0.5 * d2);
}

function biObjectiveKernelRelevance(pt, ref) {
  // Geometric mean of kernel relevances for just the two plotted outcomes
  var indices = [xOutIdx, yOutIdx];
  var logSum = 0;
  for (var k = 0; k < indices.length; k++) {
    var oi = indices[k];
    if (oi >= HP.length) continue;
    var raw = pointRelevance(pt, ref, [], HP[oi].ls, INPUT_TF);
    logSum += Math.log(Math.max(raw, 1e-300));
  }
  var geoMean = Math.exp(logSum / indices.length);
  return geoMean * geoMean * geoMean; // cube to sharpen
}

function allKernelRelevance(pt, ref) {
  // Geometric mean of kernel relevances across ALL outcome kernels
  var logSum = 0;
  for (var k = 0; k < HP.length; k++) {
    var raw = pointRelevance(pt, ref, [], HP[k].ls, INPUT_TF);
    logSum += Math.log(Math.max(raw, 1e-300));
  }
  var geoMean = Math.exp(logSum / HP.length);
  return geoMean * geoMean * geoMean; // cube to sharpen
}

function updateOpacities() {
  var refPt = getRefPoint();
  var groups = svg.querySelectorAll('g[data-idx]');
  if (!refPt) {
    for (var g = 0; g < groups.length; g++) groups[g].setAttribute('opacity', 1);
    return;
  }
  var distMode = selDistMode.value;
  var relevanceFn = distMode === 'euclidean' ? euclideanRelevance
    : distMode === 'bi-objective' ? biObjectiveKernelRelevance
    : allKernelRelevance;

  var armRels = [], candRels = [], maxRel = 0;
  for (var i = 0; i < nArms; i++) {
    var rel = relevanceFn(trainX[i], refPt);
    armRels[i] = rel;
    if (rel < 0.999 && rel > maxRel) maxRel = rel;
  }
  for (var ci = 0; ci < candidates.length; ci++) {
    var rel = relevanceFn(candidates[ci].params, refPt);
    candRels[ci] = rel;
    if (rel < 0.999 && rel > maxRel) maxRel = rel;
  }
  var minOpacity = 0.08;
  for (var g = 0; g < groups.length; g++) {
    var idx = parseInt(groups[g].getAttribute('data-idx'));
    var gType = groups[g].getAttribute('data-type');
    var relVal = gType === 'candidate' ? (candRels[idx] || 0) : (armRels[idx] || 0);
    var opacity;
    if (relVal > 0.999) {
      opacity = 1;
    } else if (maxRel > 0) {
      opacity = minOpacity + (1 - minOpacity) * Math.pow(relVal / maxRel, 0.5);
    } else {
      opacity = minOpacity;
    }
    groups[g].setAttribute('opacity', opacity);
  }
}

// ── Right panel: nested interval bars (75/95/99% CI) ──
// Color scheme: positive=green, negative=red, matching the "chonky" experiment bar style
function ciColors(mean) {
  if (mean > 0) return { c99: '#1a3a1a', c95: '#2a6a2a', c75: '#3a9a3a', tick: '#2a5a2a' };
  if (mean < 0) return { c99: '#3a1a1a', c95: '#7a2a2a', c75: '#b03030', tick: '#5a2020' };
  return { c99: '#2a2a2a', c95: '#4a4a4a', c75: '#6a6a6a', tick: '#444' };
}

// Get the item to display in deltoid: selectedItem takes priority, then hovered
var hoveredItem = null; // tracks {type, idx} of hovered item

function getDisplayItem() {
  if (selectedItem) return selectedItem;
  if (hoveredItem) return hoveredItem;
  return null;
}

function getItemRelData(item) {
  if (!item) return null;
  if (item.type === 'candidate') return candidates[item.idx] ? candidates[item.idx].relData : null;
  return relData[item.idx] || null;
}

function getItemLabel(item) {
  if (!item) return '';
  if (item.type === 'candidate') return candidates[item.idx].name;
  var label = 'Arm #' + (item.idx + 1);
  if (item.idx === sqIdx) label += ' (SQ)';
  return label;
}

function showDeltoid(item) {
  var displayItem = item || getDisplayItem();
  if (!displayItem) {
    rpTitle.textContent = 'Hover over an arm to see all outcomes';
    rpBars.innerHTML = '';
    return;
  }

  var itemRelData = getItemRelData(displayItem);
  if (!itemRelData) {
    rpTitle.textContent = getItemLabel(displayItem) + ' — no data';
    rpBars.innerHTML = '';
    return;
  }

  rpTitle.textContent = getItemLabel(displayItem) + ' — % vs SQ';

  var rowH = 30, barH = 11, labelW = 115, barW = 150, valW = 100, pad = 8;
  var totalW = labelW + barW + valW + pad * 3;
  var topPad = 20;
  var totalH = outcomeNames.length * rowH + topPad + 8;

  var lo = panelRange.lo, hi = panelRange.hi;
  function bx(v) { return labelW + pad + (v - lo) / (hi - lo) * barW; }

  var s = '<svg width="' + totalW + '" height="' + totalH + '" xmlns="http://www.w3.org/2000/svg">';

  panelRange.ticks.forEach(function(tv) {
    var tx = bx(tv);
    s += '<text x="' + tx + '" y="12" text-anchor="middle" fill="#555" font-size="9" font-family="sans-serif">' + tv + '%</text>';
    s += '<line x1="' + tx + '" y1="16" x2="' + tx + '" y2="' + (totalH - 4) + '" stroke="#1e1e24" stroke-width="0.5"/>';
  });

  if (lo <= 0 && hi >= 0) {
    var x0 = bx(0);
    s += '<line x1="' + x0 + '" y1="16" x2="' + x0 + '" y2="' + (totalH - 4) + '" stroke="#3a3a44" stroke-width="1" stroke-dasharray="3,2"/>';
  }

  outcomeNames.forEach(function(name, k) {
    var cy = k * rowH + rowH / 2 + topPad;
    var r = itemRelData[name];

    s += '<text x="' + (labelW - 4) + '" y="' + (cy + 4) +
         '" text-anchor="end" fill="#999" font-size="11" font-family="sans-serif">' + name + '</text>';

    if (r) {
      var cols = ciColors(r.mean);
      var intervals = [
        { z: CI_Z.c99, fill: cols.c99, h: barH },
        { z: CI_Z.c95, fill: cols.c95, h: barH - 2 },
        { z: CI_Z.c75, fill: cols.c75, h: barH - 4 }
      ];
      for (var iv = 0; iv < intervals.length; iv++) {
        var ci = intervals[iv];
        var x1 = bx(r.mean - ci.z * r.sem);
        var x2 = bx(r.mean + ci.z * r.sem);
        var w = Math.max(1, x2 - x1);
        s += '<rect x="' + x1 + '" y="' + (cy - ci.h/2) +
             '" width="' + w + '" height="' + ci.h +
             '" fill="' + ci.fill + '" rx="1.5"/>';
      }

      var xm = bx(r.mean);
      s += '<line x1="' + xm + '" y1="' + (cy - barH/2 + 1) + '" x2="' + xm +
           '" y2="' + (cy + barH/2 - 1) + '" stroke="' + cols.tick + '" stroke-width="2"/>';

      s += '<text x="' + (labelW + pad + barW + pad * 2) + '" y="' + (cy + 4) +
           '" fill="#777" font-size="10" font-family="sans-serif">' +
           r.mean.toFixed(2) + '\\u00B1' + (1.96 * r.sem).toFixed(2) + '%</text>';
    } else {
      s += '<text x="' + (labelW + pad + barW/2) + '" y="' + (cy + 4) +
           '" text-anchor="middle" fill="#555" font-size="10" font-style="italic" font-family="sans-serif">N/A</text>';
    }
  });
  s += '</svg>';
  rpBars.innerHTML = s;
}

// ── Slider panel for selected item ──
var rpSliders = document.getElementById('rpSliders');

function renderSliders() {
  if (!selectedItem) {
    rpSliders.innerHTML = '';
    return;
  }

  var isCandidate = selectedItem.type === 'candidate';
  var params = isCandidate ? candidates[selectedItem.idx].params : trainX[selectedItem.idx];
  var label = getItemLabel(selectedItem);

  var html = '<div class="slider-section">';
  html += '<div class="section-title">' + label;

  if (!isCandidate) {
    html += ' <button class="clone-btn" id="btnClone">clone as candidate</button>';
  } else {
    html += ' <button class="delete-btn" id="btnDeleteCand">remove</button>';
  }
  html += '</div>';

  for (var j = 0; j < nDims; j++) {
    var bLo = paramBounds[j][0], bHi = paramBounds[j][1];
    var val = params[j];
    var step = (bHi - bLo) / 200;
    html += '<div class="param-row">';
    html += '<label>' + paramNames[j] + '</label>';
    html += '<input type="range" min="' + bLo + '" max="' + bHi + '" step="' + step +
            '" value="' + val + '" data-dim="' + j + '"' + (isCandidate ? '' : ' disabled') + '>';
    html += '<span class="param-val" id="pval' + j + '">' + val.toFixed(3) + '</span>';
    html += '</div>';
  }
  html += '</div>';
  rpSliders.innerHTML = html;

  // Wire up buttons and sliders
  if (!isCandidate) {
    document.getElementById('btnClone').addEventListener('click', function() {
      cloneArm(selectedItem.idx);
    });
  } else {
    var candIdx = selectedItem.idx;
    document.getElementById('btnDeleteCand').addEventListener('click', function() {
      deleteCandidate(candIdx);
    });
    var sliders = rpSliders.querySelectorAll('input[type=range]');
    for (var si = 0; si < sliders.length; si++) {
      (function(slider) {
        slider.addEventListener('input', function() {
          var dim = parseInt(slider.getAttribute('data-dim'));
          var cand = candidates[selectedItem.idx];
          cand.params[dim] = parseFloat(slider.value);
          document.getElementById('pval' + dim).textContent = cand.params[dim].toFixed(3);
          predictCandidate(cand);
          renderScatter();
          showDeltoid(selectedItem);
        });
      })(sliders[si]);
    }
  }
}


// ── Event delegation on SVG ──
function getDotInfo(el) {
  while (el && el !== svg) {
    var attr = el.getAttribute && el.getAttribute('data-idx');
    if (attr !== null && attr !== undefined) {
      return { idx: parseInt(attr), type: el.getAttribute('data-type') || 'arm' };
    }
    el = el.parentNode;
  }
  return null;
}

svg.addEventListener('mouseover', function(e) {
  var info = getDotInfo(e.target);
  if (!info) return;
  if (hoveredItem && hoveredItem.type === info.type && hoveredItem.idx === info.idx) return;
  hoveredItem = info;
  updateOpacities();
  if (!selectedItem) showDeltoid(info);
});
svg.addEventListener('mouseout', function(e) {
  var info = getDotInfo(e.target);
  if (!info) return;
  var relInfo = getDotInfo(e.relatedTarget);
  if (relInfo && relInfo.type === info.type && relInfo.idx === info.idx) return;
  hoveredItem = null;
  updateOpacities();
  if (!selectedItem) showDeltoid(null);
});
svg.addEventListener('click', function(e) {
  var info = getDotInfo(e.target);
  if (!info) {
    // Click on empty area — deselect
    selectedItem = null;
    renderScatter();
    showDeltoid(null);
    renderSliders();
    return;
  }
  // Toggle selection
  if (selectedItem && selectedItem.type === info.type && selectedItem.idx === info.idx) {
    selectedItem = null;
  } else {
    selectedItem = { type: info.type, idx: info.idx };
  }
  renderScatter();
  showDeltoid(null);
  renderSliders();
});

// ── Dropdown / control handlers ──
selX.addEventListener('change', function() {
  xOutIdx = +selX.value;
  if (xOutIdx === yOutIdx) {
    yOutIdx = (xOutIdx + 1) % outcomeNames.length;
    selY.value = String(yOutIdx);
  }
  renderScatter();
});
selY.addEventListener('change', function() {
  yOutIdx = +selY.value;
  if (yOutIdx === xOutIdx) {
    xOutIdx = (yOutIdx + 1) % outcomeNames.length;
    selX.value = String(xOutIdx);
  }
  renderScatter();
});
selSQ.addEventListener('change', function() {
  sqIdx = +selSQ.value;
  reRelativize();
  // Re-relativize candidates too
  for (var ci = 0; ci < candidates.length; ci++) predictCandidate(candidates[ci]);
  computePanelRange();
  renderScatter();
  showDeltoid(null);
});
selDistMode.addEventListener('change', function() { updateOpacities(); });

document.getElementById('btnResample').addEventListener('click', function() {
  selectedItem = null;
  hoveredItem = null;
  candidates = [];
  nextCandidateId = 1;
  rpTitle.textContent = 'Hover over an arm to see all outcomes';
  rpBars.innerHTML = '';
  rpSliders.innerHTML = '';
  buildModel();
  nArms = nSamples;
  precomputePreds();
  sqIdx = closestToCenterIdx();
  populateSQDropdown();
  reRelativize();
  computePanelRange();
  renderScatter();
});

// ── Init ──
document.getElementById('subtitle').textContent =
  nArms + ' noisy training arms \u00B7 ' + outcomeNames.length + ' outcomes \u00B7 FixedNoiseGP \u00B7 relativized vs status quo';
renderScatter();
})();

</script>
</body>
</html>`;


// ─── Point Proximity ─────────────────────────────────────────────────────────

const pointProximity = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Point Proximity Diagnostic</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f0f11; color: #e0e0e0;
    padding: 2rem; min-height: 100vh;
  }
  h1 { font-size: 18px; font-weight: 500; color: #f0f0f0; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 20px; }
  .ctrl-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .ctrl-group { display: flex; gap: 5px; align-items: center; }
  .ctrl-divider { width: 1px; height: 20px; background: #333; margin: 0 4px; }
  label { font-size: 13px; color: #aaa; }
  select, button {
    font-size: 13px; padding: 4px 8px; border-radius: 6px;
    border: 0.5px solid #444; background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none;
  }
  button:hover { background: #252528; }
  input[type=range] { width: 90px; accent-color: #7c6ff7; cursor: pointer; }
  input[type=checkbox] { accent-color: #7c6ff7; cursor: pointer; }
  .diag-ctrl.locked select { opacity: 0.35; pointer-events: none; }
  .diag-ctrl.locked label { opacity: 0.35; }
  .val-lbl { font-size: 13px; font-weight: 500; color: #ccc; min-width: 24px; }
  .plots { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  .plot { display: flex; flex-direction: column; gap: 6px; }
  .plot-title { font-size: 12px; color: #888; text-align: center; letter-spacing: 0.04em; }
  .canvas-wrap { position: relative; display: inline-block; }
  canvas.main {
    display: block; border-radius: 6px;
    border: 0.5px solid #333; cursor: crosshair;
  }
  canvas.overlay { position: absolute; top: 0; left: 0; pointer-events: none; }
  .cbrow { display: flex; align-items: center; gap: 6px; }
  .cblbl { font-size: 11px; color: #666; min-width: 32px; }
  canvas.cbar { height: 16px; flex: 1; border-radius: 4px; }
  .section-label {
    font-size: 11px; color: #555; letter-spacing: 0.06em;
    text-transform: uppercase; margin: 18px 0 10px;
  }
  .slrow { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .sllbl { font-size: 13px; color: #888; min-width: 68px; }
  .slval { font-size: 13px; font-weight: 500; color: #ccc; min-width: 40px; text-align: right; }
  .hist-row { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 20px; }
  .hist-wrap { display: flex; flex-direction: column; gap: 6px; }
  .statline { font-size: 13px; color: #777; margin-top: 14px; min-height: 1.5em; }
  .statline span { font-weight: 500; color: #ddd; }
  .info-line { font-size: 12px; color: #555; margin-top: 6px; word-break: break-all; line-height: 1.6; }
  .info-line .hl { color: #8b8; }
  .info-line .dim { color: #888; }
  #tooltip {
    position: fixed; display: none;
    background: #1e1e22; border: 0.5px solid #555;
    border-radius: 7px; padding: 9px 13px;
    font-size: 12px; color: #ccc;
    pointer-events: none; z-index: 100;
    line-height: 1.8; white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }
  #tooltip .tt-title {
    font-size: 11px; color: #888; letter-spacing: 0.05em;
    text-transform: uppercase; margin-bottom: 4px;
  }
  #tooltip .tt-val { color: #ff6b6b; font-weight: 500; }
  #tooltip .tt-coord { color: #a0c4ff; }
</style>
</head>
<body>

<h1>${axHomeLink}Point Proximity — Opacity Diagnostic</h1>
<p class="subtitle" id="subtitle">20 pts, 10d Ackley, ARD RBF</p>

<div class="ctrl-row">
  <div class="ctrl-group">
    <label>Dims</label>
    <input type="range" id="dimSlider" min="1" max="20" step="1" value="10">
    <span class="val-lbl" id="dimLabel">10</span>
  </div>
  <div class="ctrl-group">
    <label>Points</label>
    <input type="range" id="ptsSlider" min="5" max="100" step="1" value="20">
    <span class="val-lbl" id="ptsLabel">20</span>
  </div>
  <div class="ctrl-divider"></div>
  <div class="ctrl-group">
    <label><input type="checkbox" id="useCorrelation" checked> kernel correlation</label>
  </div>
  <div class="ctrl-divider"></div>
  <div class="ctrl-group diag-ctrl">
    <label>Distance</label>
    <select id="selDistance" disabled>
      <option value="kernel" selected>kernel (÷LS)</option>
      <option value="euclidean">euclidean</option>
    </select>
  </div>
  <div class="ctrl-group diag-ctrl">
    <label>Normalize</label>
    <select id="selNorm" disabled>
      <option value="none" selected>none (sum)</option>
      <option value="mean">÷d_eff (mean)</option>
      <option value="sqrt">÷√d_eff</option>
    </select>
  </div>
  <div class="ctrl-group diag-ctrl">
    <label>Formula</label>
    <select id="selFormula" disabled>
      <option value="exp(-0.5·d²)">exp(-0.5·d²) [RBF]</option>
      <option value="exp(-d²)">exp(-d²)</option>
      <option value="exp(-d)">exp(-d) [Matérn½]</option>
      <option value="exp(-2·d²)">exp(-2·d²) [steep]</option>
    </select>
  </div>
  <div class="ctrl-group diag-ctrl">
    <label>Opacity</label>
    <select id="selOpacity" disabled>
      <option value="linear" selected>linear (raw)</option>
      <option value="sqrt">sqrt</option>
      <option value="relative">relative (÷max + √)</option>
    </select>
  </div>
</div>
<div class="ctrl-row">
  <div class="ctrl-group">
    <label>X</label><select id="selX"></select>
    <label>Y</label><select id="selY"></select>
  </div>
</div>

<div id="tooltip">
  <div class="tt-title" id="tt-title">training point</div>
  <div id="tt-body"></div>
</div>

<div class="plots">
  <div class="plot">
    <div class="plot-title">1D Slice (X axis)</div>
    <canvas id="cv1d" class="main" width="400" height="280"></canvas>
  </div>
  <div class="plot">
    <div class="plot-title">2D Heatmap (mean)</div>
    <div class="canvas-wrap">
      <canvas id="cv2d" class="main" width="320" height="320"></canvas>
      <canvas id="ov2d" class="overlay" width="320" height="320"></canvas>
    </div>
    <div class="cbrow">
      <span class="cblbl" id="mlo">—</span>
      <canvas id="cb2d" class="cbar"></canvas>
      <span class="cblbl" id="mhi" style="text-align:right">—</span>
    </div>
  </div>
</div>

<div class="section-label">Fixed dimensions</div>
<div id="sliders"></div>

<div class="hist-row">
  <div class="hist-wrap">
    <div class="plot-title" id="histDistTitle">Distance distribution</div>
    <canvas id="cvHistDist" class="main" width="360" height="180"></canvas>
  </div>
  <div class="hist-wrap">
    <div class="plot-title" id="histCorrTitle">Relevance distribution</div>
    <canvas id="cvHistCorr" class="main" width="360" height="180"></canvas>
  </div>
</div>

<div class="statline" id="statline">Slice mode · hover plots to inspect</div>

${libraryScript()}
${sharedColormapScript()}

<script>
var Predictor = axjs.Predictor;

// ─── Ackley test function ───────────────────────────────────────
function ackley(x) {
  var d = x.length, a = 20, b = 0.2, c = 2 * Math.PI;
  var sum1 = 0, sum2 = 0;
  for (var i = 0; i < d; i++) { sum1 += x[i]*x[i]; sum2 += Math.cos(c*x[i]); }
  return -a * Math.exp(-b * Math.sqrt(sum1/d)) - Math.exp(sum2/d) + a + Math.E;
}

// ─── Formula variants ───────────────────────────────────────────
var FORMULAS = {
  'exp(-d²)':     function(d2) { return Math.exp(-d2); },
  'exp(-0.5·d²)': function(d2) { return Math.exp(-0.5*d2); },
  'exp(-d)':      function(d2) { return Math.exp(-Math.sqrt(Math.max(0, d2))); },
  'exp(-2·d²)':   function(d2) { return Math.exp(-2*d2); }
};

// ─── Distance computation ───────────────────────────────────────
// Returns {d2, relevance} where d2 is the (possibly normalized) squared distance
function computeRelevance(pt, ref, plottedDims, ls, formulaFn, distMode, normMode) {
  var d2 = 0;
  var dEff = 0; // count of non-plotted dims
  for (var j = 0; j < ref.length; j++) {
    if (plottedDims.indexOf(j) >= 0) continue;
    dEff++;
    var diff = pt[j] - ref[j];
    if (distMode === 'euclidean') {
      // Normalize by parameter range only
      var scaled = diff / RANGE;
      d2 += scaled * scaled;
    } else {
      // Kernel: normalize to [0,1] space first, then scale by lengthscale
      var lsj = (typeof ls === 'number') ? ls : ((ls && j < ls.length) ? ls[j] : 0.5);
      var scaled = (diff / RANGE) / lsj;
      d2 += scaled * scaled;
    }
  }
  // Apply dimensionality normalization
  if (dEff > 0) {
    if (normMode === 'mean') d2 = d2 / dEff;
    else if (normMode === 'sqrt') d2 = d2 / Math.sqrt(dEff);
  }
  return { d2: d2, relevance: formulaFn(d2), dEff: dEff };
}


// ─── State ──────────────────────────────────────────────────────
var nDim = 10, nPts = 20;
var trainX, trainY, SV = 5.0, NV = 0.1;
var LS = 0.15; // isotropic lengthscale in normalized [0,1] space
var RANGE = 10; // [-5, 5] domain width
var gpPredictor = null;
var axX = 0, axY = 1;
var fixedValues;
var neighborActiveIdx = -1;  // pinned point (click)
var hoveredIdx = -1;         // hovered point (mousemove, transient)
// Cached from last render() for lightweight dot redraws
var cachedSliceRelData = null;
var cached1dImage = null;

// ─── DOM refs ───────────────────────────────────────────────────
var ctx1d = document.getElementById('cv1d').getContext('2d', { willReadFrequently: true });
var ctx2d = document.getElementById('cv2d').getContext('2d');
var ctxOv = document.getElementById('ov2d').getContext('2d');
var ctxHD = document.getElementById('cvHistDist').getContext('2d');
var ctxHC = document.getElementById('cvHistCorr').getContext('2d');

// ─── Fit & Build ────────────────────────────────────────────────
function fitAndBuild() {
  // Generate random training data in [-5, 5]^d
  trainX = Array.from({ length: nPts }, function() {
    return Array.from({ length: nDim }, function() { return -5 + 10 * Math.random(); });
  });
  trainY = trainX.map(ackley);

  // Isotropic lengthscale array (in normalized [0,1] space)
  var lsArr = Array.from({ length: nDim }, function() { return LS; });
  // Normalize input_transform: offset=lower, coefficient=range (upper-lower)
  var offset = Array.from({ length: nDim }, function() { return -5; });
  var coeff = Array.from({ length: nDim }, function() { return RANGE; });

  // Build ExperimentState and use Predictor (matches real Ax export pipeline)
  var searchSpace = { parameters: [] };
  for (var i = 0; i < nDim; i++) {
    searchSpace.parameters.push({
      name: 'x' + i, type: 'range', bounds: [-5, 5], value_type: 'float'
    });
  }
  var experimentState = {
    search_space: searchSpace,
    model_state: {
      model_type: 'SingleTaskGP',
      train_X: trainX,
      train_Y: trainY,
      kernel: {
        type: 'Scale',
        outputscale: SV,
        base_kernel: { type: 'RBF', lengthscale: lsArr }
      },
      mean_constant: trainY.reduce(function(a,b){return a+b;},0) / trainY.length,
      noise_variance: NV,
      input_transform: { offset: offset, coefficient: coeff }
    },
    outcome_names: ['ackley']
  };
  gpPredictor = new Predictor(experimentState);

  // Snap sliders to a random training point so we start near data
  var initIdx = Math.floor(Math.random() * nPts);
  fixedValues = trainX[initIdx].slice();
  neighborActiveIdx = -1;
  hoveredIdx = -1;

  rebuildAxisDropdowns();
  buildSliders();
  updateSubtitle();
}

function updateSubtitle() {
  document.getElementById('subtitle').textContent =
    nPts + ' pts, ' + nDim + 'd Ackley, isotropic RBF (LS=' + LS + ')';
}

function rebuildAxisDropdowns() {
  var selXel = document.getElementById('selX');
  var selYel = document.getElementById('selY');
  selXel.innerHTML = ''; selYel.innerHTML = '';
  for (var i = 0; i < nDim; i++) {
    [selXel, selYel].forEach(function(sel) {
      var o = document.createElement('option');
      o.value = i; o.textContent = 'x' + i;
      sel.appendChild(o);
    });
  }
  if (axX >= nDim) axX = 0;
  if (nDim === 1) {
    axY = -1; // no Y axis in 1d
    selYel.disabled = true;
  } else {
    selYel.disabled = false;
    if (axY >= nDim || axY < 0) axY = Math.min(1, nDim - 1);
    if (axX === axY) axY = (axX + 1) % nDim;
  }
  selXel.value = axX;
  if (axY >= 0) selYel.value = axY;
}

function buildSliders() {
  var div = document.getElementById('sliders');
  div.innerHTML = '';
  var axes = [axX, axY];
  for (var i = 0; i < nDim; i++) {
    if (axes.indexOf(i) >= 0) continue;
    (function(idx) {
      var row = document.createElement('div'); row.className = 'slrow';
      var lbl = document.createElement('span'); lbl.className = 'sllbl';
      lbl.textContent = 'x' + idx;
      var sl = document.createElement('input');
      sl.type = 'range'; sl.min = -5; sl.max = 5; sl.step = '0.01';
      sl.value = fixedValues[idx].toFixed(2);
      sl.style.flex = '1'; sl.style.minWidth = '100px'; sl.style.accentColor = '#7c6ff7';
      var val = document.createElement('span'); val.className = 'slval';
      val.textContent = fixedValues[idx].toFixed(2);
      sl.addEventListener('input', function() {
        fixedValues[idx] = +sl.value;
        val.textContent = (+sl.value).toFixed(2);
        render();
      });
      row.appendChild(lbl); row.appendChild(sl); row.appendChild(val);
      div.appendChild(row);
    })(i);
  }
}

// ─── Render ─────────────────────────────────────────────────────
function render() {
  if (!gpPredictor) return;

  var formulaKey = document.getElementById('selFormula').value;
  var formulaFn = FORMULAS[formulaKey];
  var distMode = document.getElementById('selDistance').value;
  var normMode = document.getElementById('selNorm').value;
  var opacityMode = document.getElementById('selOpacity').value;
  var plottedDims = axY >= 0 ? [axX, axY] : [axX];

  // ── 1D Slice ──
  var W1 = 400, H1 = 280;
  var PAD_L = 50, PAD_R = 10, PAD_T = 20, PAD_B = 30;
  var pw = W1 - PAD_L - PAD_R, ph = H1 - PAD_T - PAD_B;
  var nSlice = 100;
  var slicePts = [];
  for (var si = 0; si < nSlice; si++) {
    var xv = -5 + 10 * si / (nSlice - 1);
    var pt = fixedValues.slice();
    pt[axX] = xv;
    slicePts.push(pt);
  }
  var pred1d = gpPredictor.predict(slicePts).ackley;
  var means1d = Array.from(pred1d.mean);
  var stds1d = means1d.map(function(_, i) { return Math.sqrt(pred1d.variance[i]); });

  // Fixed y-axis spanning Ackley range: min=0 at origin, max≈14.3 at corners
  // (for any d, the per-dim averages in Ackley keep max bounded).
  // Pad to include GP uncertainty bands comfortably.
  var yMin = -2, yMax = 18;
  var yRange = yMax - yMin;
  last1dGeom.yMin = yMin; last1dGeom.yRange = yRange;

  ctx1d.clearRect(0, 0, W1, H1);
  ctx1d.fillStyle = '#0f0f11';
  ctx1d.fillRect(0, 0, W1, H1);

  // Axes
  ctx1d.strokeStyle = '#333'; ctx1d.lineWidth = 0.5;
  ctx1d.strokeRect(PAD_L, PAD_T, pw, ph);

  // Axis labels
  ctx1d.font = '11px sans-serif'; ctx1d.fillStyle = '#666';
  ctx1d.fillText('x' + axX, PAD_L + pw/2 - 8, H1 - 5);
  ctx1d.save(); ctx1d.translate(12, PAD_T + ph/2 + 10); ctx1d.rotate(-Math.PI/2);
  ctx1d.fillText('mean', 0, 0); ctx1d.restore();

  // Y ticks
  for (var ti = 0; ti <= 4; ti++) {
    var yy = PAD_T + ph - ti * ph / 4;
    var yval = yMin + ti * yRange / 4;
    ctx1d.fillStyle = '#555'; ctx1d.fillText(yval.toFixed(1), 4, yy + 4);
    ctx1d.beginPath(); ctx1d.moveTo(PAD_L, yy); ctx1d.lineTo(PAD_L + pw, yy);
    ctx1d.strokeStyle = '#222'; ctx1d.lineWidth = 0.5; ctx1d.stroke();
  }

  // X ticks
  for (var xi = -5; xi <= 5; xi += 2.5) {
    var xx = PAD_L + (xi - (-5)) / 10 * pw;
    ctx1d.fillStyle = '#555'; ctx1d.fillText(xi.toFixed(1), xx - 10, H1 - PAD_B + 16);
    ctx1d.beginPath(); ctx1d.moveTo(xx, PAD_T); ctx1d.lineTo(xx, PAD_T + ph);
    ctx1d.strokeStyle = '#222'; ctx1d.lineWidth = 0.5; ctx1d.stroke();
  }

  // ±2σ band
  ctx1d.fillStyle = 'rgba(100, 160, 255, 0.12)';
  ctx1d.beginPath();
  for (var i = 0; i < nSlice; i++) {
    var sx = PAD_L + i * pw / (nSlice - 1);
    var sy = PAD_T + ph - (means1d[i] + 2*stds1d[i] - yMin) / yRange * ph;
    if (i === 0) ctx1d.moveTo(sx, sy); else ctx1d.lineTo(sx, sy);
  }
  for (var i = nSlice - 1; i >= 0; i--) {
    var sx = PAD_L + i * pw / (nSlice - 1);
    var sy = PAD_T + ph - (means1d[i] - 2*stds1d[i] - yMin) / yRange * ph;
    ctx1d.lineTo(sx, sy);
  }
  ctx1d.closePath(); ctx1d.fill();

  // Mean line
  ctx1d.strokeStyle = 'rgba(100, 180, 255, 0.9)'; ctx1d.lineWidth = 1.5;
  ctx1d.beginPath();
  for (var i = 0; i < nSlice; i++) {
    var sx = PAD_L + i * pw / (nSlice - 1);
    var sy = PAD_T + ph - (means1d[i] - yMin) / yRange * ph;
    if (i === 0) ctx1d.moveTo(sx, sy); else ctx1d.lineTo(sx, sy);
  }
  ctx1d.stroke();

  // Cache the 1D plot background (before dots) for fast hover redraws
  cached1dImage = ctx1d.getImageData(0, 0, W1, H1);

  // ── Compute relevance for all training points ──
  var isNeighborMode = (neighborActiveIdx >= 0 && neighborActiveIdx < trainX.length);

  var relData = []; // {d2, relevance, opacity, idx}
  var maxRel = 0;
  var visCount = 0;
  var opacitySum = 0;

  if (isNeighborMode) {
    var refPoint = trainX[neighborActiveIdx];
    for (var i = 0; i < trainX.length; i++) {
      if (i === neighborActiveIdx) {
        relData.push({ d2: 0, relevance: 1, opacity: 0.95, idx: i, visible: true });
        continue;
      }
      var r = computeRelevance(trainX[i], refPoint, [], LS, formulaFn, distMode, normMode);
      relData.push({ d2: r.d2, relevance: r.relevance, opacity: 0, idx: i, visible: true });
      if (r.relevance > maxRel) maxRel = r.relevance;
    }
    // Compute opacities with selected mapping
    for (var i = 0; i < relData.length; i++) {
      var rd = relData[i];
      if (i === neighborActiveIdx) { visCount++; opacitySum += rd.opacity; continue; }
      var rawRel = rd.relevance;
      var mapped;
      if (opacityMode === 'relative') {
        var rn = maxRel > 0 ? rawRel / maxRel : 0;
        mapped = Math.sqrt(rn);
      } else if (opacityMode === 'sqrt') {
        mapped = Math.sqrt(rawRel);
      } else {
        mapped = rawRel;
      }
      rd.opacity = Math.max(0.05, Math.min(0.90, mapped));
      rd.visible = true;
      visCount++; opacitySum += rd.opacity;
    }
  } else {
    // No reference point: all dots at uniform full opacity
    for (var i = 0; i < trainX.length; i++) {
      relData.push({ d2: 0, relevance: 1, opacity: 0.85, idx: i, visible: true });
      visCount++; opacitySum += 0.85;
    }
  }
  cachedSliceRelData = relData;

  // Draw training dots on 1D slice
  for (var i = 0; i < trainX.length; i++) {
    var rd = relData[i];
    if (!rd.visible) continue;
    var px = PAD_L + (trainX[i][axX] - (-5)) / 10 * pw;
    var py = PAD_T + ph - (trainY[i] - yMin) / yRange * ph;
    if (py < PAD_T || py > PAD_T + ph) continue;
    var isActive = (i === neighborActiveIdx);
    var r = isActive ? 5 : 3.5;
    ctx1d.beginPath(); ctx1d.arc(px, py, r + 1, 0, 2 * Math.PI);
    ctx1d.strokeStyle = isActive ? 'rgba(255,255,255,1)'
      : 'rgba(255,255,255,' + Math.max(0.15, rd.opacity * 0.6).toFixed(3) + ')';
    ctx1d.lineWidth = isActive ? 2 : 1; ctx1d.stroke();
    ctx1d.beginPath(); ctx1d.arc(px, py, r, 0, 2 * Math.PI);
    ctx1d.fillStyle = isActive ? 'rgba(255,110,110,1)'
      : 'rgba(255,60,60,' + rd.opacity.toFixed(3) + ')';
    ctx1d.fill();
  }

  // ── 2D Heatmap ──
  var N2 = 320, GS = 60;
  if (axY < 0) {
    // 1D mode: clear 2D canvases
    ctx2d.clearRect(0, 0, N2, N2);
    ctx2d.fillStyle = '#1a1a1e'; ctx2d.fillRect(0, 0, N2, N2);
    ctx2d.font = '14px sans-serif'; ctx2d.fillStyle = '#555';
    ctx2d.fillText('(1D mode — no heatmap)', 60, N2/2);
    ctxOv.clearRect(0, 0, N2, N2);
  } else {
  var testPts2d = [];
  for (var gj = 0; gj < GS; gj++) {
    for (var gi = 0; gi < GS; gi++) {
      var xv = -5 + 10 * gi / (GS - 1);
      var yv = -5 + 10 * (1 - gj / (GS - 1));
      var pt = fixedValues.slice();
      pt[axX] = xv; pt[axY] = yv;
      testPts2d.push(pt);
    }
  }
  var pred2d = gpPredictor.predict(testPts2d).ackley;
  var means2d = Array.from(pred2d.mean);
  var mMin = Math.min.apply(null, means2d), mMax = Math.max.apply(null, means2d);
  var mRange = mMax - mMin || 1;

  var img2d = ctx2d.createImageData(N2, N2);
  var cellW = N2 / GS, cellH = N2 / GS;
  for (var k = 0; k < means2d.length; k++) {
    var gi = k % GS, gj = Math.floor(k / GS);
    var t = (means2d[k] - mMin) / mRange;
    var rgb = viridis(t);
    var x0 = Math.round(gi * cellW), y0 = Math.round(gj * cellH);
    var x1 = Math.round((gi + 1) * cellW), y1 = Math.round((gj + 1) * cellH);
    for (var py = y0; py < y1; py++) {
      for (var px = x0; px < x1; px++) {
        var idx = (py * N2 + px) * 4;
        img2d.data[idx] = rgb[0]; img2d.data[idx+1] = rgb[1]; img2d.data[idx+2] = rgb[2]; img2d.data[idx+3] = 255;
      }
    }
  }
  ctx2d.putImageData(img2d, 0, 0);
  document.getElementById('mlo').textContent = mMin.toFixed(2);
  document.getElementById('mhi').textContent = mMax.toFixed(2);
  drawColorbar('cb2d', viridis);

  // Draw ticks and training dots on 2D heatmap (via overlay)
  ctxOv.clearRect(0, 0, N2, N2);
  ctxOv.font = '10px sans-serif'; ctxOv.fillStyle = 'rgba(255,255,255,0.5)';
  // X ticks (bottom)
  for (var xi = -5; xi <= 5; xi += 2.5) {
    var tx = (xi - (-5)) / 10 * N2;
    ctxOv.fillText(xi.toFixed(1), tx - 8, N2 - 2);
    ctxOv.beginPath(); ctxOv.moveTo(tx, N2 - 14); ctxOv.lineTo(tx, N2 - 10);
    ctxOv.strokeStyle = 'rgba(255,255,255,0.3)'; ctxOv.lineWidth = 1; ctxOv.stroke();
  }
  // Y ticks (left)
  for (var yi = -5; yi <= 5; yi += 2.5) {
    var ty = (1 - (yi - (-5)) / 10) * N2;
    ctxOv.fillText(yi.toFixed(1), 2, ty + 3);
    ctxOv.beginPath(); ctxOv.moveTo(10, ty); ctxOv.lineTo(14, ty);
    ctxOv.strokeStyle = 'rgba(255,255,255,0.3)'; ctxOv.lineWidth = 1; ctxOv.stroke();
  }
  // Axis labels
  ctxOv.font = '12px sans-serif'; ctxOv.fillStyle = 'rgba(255,255,255,0.7)';
  ctxOv.fillText('x' + axX + ' \\u2192', N2 - 48, N2 - 8);
  ctxOv.save(); ctxOv.translate(14, 56); ctxOv.rotate(-Math.PI / 2);
  ctxOv.fillText('x' + axY + ' \\u2192', 0, 0); ctxOv.restore();

  for (var i = 0; i < trainX.length; i++) {
    var rd = relData[i];
    if (!rd.visible) continue;
    var ppx = (trainX[i][axX] - (-5)) / 10 * N2;
    var ppy = (1 - (trainX[i][axY] - (-5)) / 10) * N2;
    var isActive = (i === neighborActiveIdx);
    var outerR = isActive ? 7.5 : 5;
    var innerR = isActive ? 4 : 2.5;
    ctxOv.beginPath(); ctxOv.arc(ppx, ppy, outerR, 0, 2 * Math.PI);
    ctxOv.strokeStyle = isActive ? 'rgba(255,255,255,1)'
      : 'rgba(255,255,255,' + Math.max(0.15, rd.opacity * 0.6).toFixed(3) + ')';
    ctxOv.lineWidth = isActive ? 2.5 : 1.5; ctxOv.stroke();
    ctxOv.beginPath(); ctxOv.arc(ppx, ppy, innerR, 0, 2 * Math.PI);
    ctxOv.fillStyle = isActive ? 'rgba(255,110,110,1)'
      : 'rgba(255,60,60,' + rd.opacity.toFixed(3) + ')';
    ctxOv.fill();
  }
  } // end 2D heatmap if/else

  // ── Histograms ──
  var dists = relData.map(function(rd) { return Math.sqrt(rd.d2); });
  var maxDist = Math.max.apply(null, dists) || 1;
  if (isNeighborMode) {
    drawHistogram(ctxHD, 360, 180, dists, relData, 0, maxDist,
      'distance', formulaKey);
    var corrs = relData.map(function(rd) { return rd.relevance; });
    drawHistogram(ctxHC, 360, 180, corrs, relData, 0, 1,
      'relevance', formulaKey);
  } else {
    // Clear histograms when no reference point
    ctxHD.clearRect(0, 0, 360, 180);
    ctxHD.fillStyle = '#0f0f11'; ctxHD.fillRect(0, 0, 360, 180);
    ctxHD.fillStyle = '#444'; ctxHD.font = '12px sans-serif';
    ctxHD.fillText('Click a training point to see distances', 50, 90);
    ctxHC.clearRect(0, 0, 360, 180);
    ctxHC.fillStyle = '#0f0f11'; ctxHC.fillRect(0, 0, 360, 180);
    ctxHC.fillStyle = '#444'; ctxHC.font = '12px sans-serif';
    ctxHC.fillText('Click a training point to see correlations', 40, 90);
  }

  // Status line
  var meanOpacity = visCount > 0 ? (opacitySum / visCount) : 0;
  var modeStr = isNeighborMode
    ? 'Neighbor mode (point #' + neighborActiveIdx + ')'
    : nPts + ' points, ' + nDim + 'd Ackley';
  document.getElementById('statline').innerHTML =
    modeStr + ' · Mean opacity: <span>' + meanOpacity.toFixed(2) +
    '</span> · Visible: <span>' + visCount + '/' + nPts + '</span>';
}

function drawHistogram(ctx, W, H, values, relData, lo, hi, xlabel, formulaKey) {
  var PAD_L = 40, PAD_R = 10, PAD_T = 10, PAD_B = 28;
  var pw = W - PAD_L - PAD_R, ph = H - PAD_T - PAD_B;
  var NBINS = 20;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f0f11'; ctx.fillRect(0, 0, W, H);

  // Bin the data
  var range = hi - lo || 1;
  var bins = new Array(NBINS);
  var binOpacitySums = new Array(NBINS);
  for (var b = 0; b < NBINS; b++) { bins[b] = 0; binOpacitySums[b] = 0; }

  for (var i = 0; i < values.length; i++) {
    var bi = Math.min(NBINS - 1, Math.max(0, Math.floor((values[i] - lo) / range * NBINS)));
    bins[bi]++;
    binOpacitySums[bi] += relData[i].opacity;
  }

  var maxCount = Math.max.apply(null, bins) || 1;

  // Axes
  ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5;
  ctx.strokeRect(PAD_L, PAD_T, pw, ph);

  // Bars
  var barW = pw / NBINS;
  for (var b = 0; b < NBINS; b++) {
    if (bins[b] === 0) continue;
    var meanOp = binOpacitySums[b] / bins[b];
    var barH = bins[b] / maxCount * ph;
    var bx = PAD_L + b * barW;
    var by = PAD_T + ph - barH;
    ctx.fillStyle = 'rgba(100, 180, 255, ' + meanOp.toFixed(3) + ')';
    ctx.fillRect(bx + 1, by, barW - 2, barH);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.4)'; ctx.lineWidth = 0.5;
    ctx.strokeRect(bx + 1, by, barW - 2, barH);
  }

  // X axis labels
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#555';
  ctx.fillText(lo.toFixed(1), PAD_L, H - 4);
  ctx.fillText(hi.toFixed(1), PAD_L + pw - 20, H - 4);
  ctx.fillStyle = '#666';
  ctx.fillText(xlabel, PAD_L + pw / 2 - 20, H - 4);

  // Y axis
  ctx.fillStyle = '#555';
  ctx.fillText(maxCount.toString(), 4, PAD_T + 10);
  ctx.fillText('0', 4, PAD_T + ph + 4);
}

// ─── Lightweight dot redraw (for hover without full re-render) ──
// Computes neighbor-mode opacities relative to refIdx and redraws dots on both canvases.
function drawNeighborDots(refIdx) {
  if (!trainX || !cachedSliceRelData) return;
  var formulaKey = document.getElementById('selFormula').value;
  var formulaFn = FORMULAS[formulaKey];
  var distMode = document.getElementById('selDistance').value;
  var normMode = document.getElementById('selNorm').value;
  var refPt = trainX[refIdx];
  var relData = [];
  var maxRel = 0;
  for (var i = 0; i < trainX.length; i++) {
    if (i === refIdx) { relData.push({ opacity: 0.95, visible: true }); continue; }
    var r = computeRelevance(trainX[i], refPt, [], LS, formulaFn, distMode, normMode);
    relData.push({ relevance: r.relevance, opacity: 0, visible: true });
    if (r.relevance > maxRel) maxRel = r.relevance;
  }
  var opacityMode = document.getElementById('selOpacity').value;
  for (var i = 0; i < relData.length; i++) {
    if (i === refIdx) continue;
    var rawRel = relData[i].relevance;
    var mapped;
    if (opacityMode === 'relative') {
      var rn = maxRel > 0 ? rawRel / maxRel : 0;
      mapped = Math.sqrt(rn);
    } else if (opacityMode === 'sqrt') {
      mapped = Math.sqrt(rawRel);
    } else {
      mapped = rawRel;
    }
    relData[i].opacity = Math.max(0.05, Math.min(0.90, mapped));
  }
  redrawDotsOnly(relData, refIdx);
}

function redrawDotsOnly(relData, activeIdx) {
  var g = last1dGeom;
  var pw = g.W - g.PAD_L - g.PAD_R, ph = g.H - g.PAD_T - g.PAD_B;
  var N2 = 320;

  // 1D: clear just the dot area by re-rendering the cached 1D background
  // (We can't selectively clear canvas, so we save/restore the 1D image)
  if (cached1dImage) ctx1d.putImageData(cached1dImage, 0, 0);

  for (var i = 0; i < trainX.length; i++) {
    var rd = relData[i];
    if (!rd.visible) continue;
    var px = g.PAD_L + (trainX[i][axX] - (-5)) / 10 * pw;
    var py = g.PAD_T + ph - (trainY[i] - g.yMin) / g.yRange * ph;
    if (py < g.PAD_T || py > g.PAD_T + ph) continue;
    var isAct = (i === activeIdx);
    var r = isAct ? 5 : 3.5;
    ctx1d.beginPath(); ctx1d.arc(px, py, r + 1, 0, 2 * Math.PI);
    ctx1d.strokeStyle = isAct ? 'rgba(255,255,255,1)'
      : 'rgba(255,255,255,' + Math.max(0.15, rd.opacity * 0.6).toFixed(3) + ')';
    ctx1d.lineWidth = isAct ? 2 : 1; ctx1d.stroke();
    ctx1d.beginPath(); ctx1d.arc(px, py, r, 0, 2 * Math.PI);
    ctx1d.fillStyle = isAct ? 'rgba(255,110,110,1)'
      : 'rgba(255,60,60,' + rd.opacity.toFixed(3) + ')';
    ctx1d.fill();
  }

  // 2D overlay: clear and redraw (skip in 1D mode)
  if (axY < 0) return;
  ctxOv.clearRect(0, 0, N2, N2);
  ctxOv.font = '12px sans-serif'; ctxOv.fillStyle = 'rgba(255,255,255,0.7)';
  ctxOv.fillText('x' + axX + ' \\u2192', N2 - 48, N2 - 8);
  ctxOv.save(); ctxOv.translate(14, 56); ctxOv.rotate(-Math.PI / 2);
  ctxOv.fillText('x' + axY + ' \\u2192', 0, 0); ctxOv.restore();
  for (var i = 0; i < trainX.length; i++) {
    var rd = relData[i];
    if (!rd.visible) continue;
    var ppx = (trainX[i][axX] - (-5)) / 10 * N2;
    var ppy = (1 - (trainX[i][axY] - (-5)) / 10) * N2;
    var isAct = (i === activeIdx);
    var outerR = isAct ? 7.5 : 5;
    var innerR = isAct ? 4 : 2.5;
    ctxOv.beginPath(); ctxOv.arc(ppx, ppy, outerR, 0, 2 * Math.PI);
    ctxOv.strokeStyle = isAct ? 'rgba(255,255,255,1)'
      : 'rgba(255,255,255,' + Math.max(0.15, rd.opacity * 0.6).toFixed(3) + ')';
    ctxOv.lineWidth = isAct ? 2.5 : 1.5; ctxOv.stroke();
    ctxOv.beginPath(); ctxOv.arc(ppx, ppy, innerR, 0, 2 * Math.PI);
    ctxOv.fillStyle = isAct ? 'rgba(255,110,110,1)'
      : 'rgba(255,60,60,' + rd.opacity.toFixed(3) + ')';
    ctxOv.fill();
  }
}

function restoreSliceDots() {
  if (cachedSliceRelData) redrawDotsOnly(cachedSliceRelData, neighborActiveIdx);
}

// ─── Interaction ────────────────────────────────────────────────
var HOVER_R = 9;
// 1D hit-test uses cached render geometry
var last1dGeom = { PAD_L: 50, PAD_R: 10, PAD_T: 20, PAD_B: 30, W: 400, H: 280, yMin: 0, yRange: 1 };
function nearest1dPoint(px, py) {
  var g = last1dGeom;
  var pw = g.W - g.PAD_L - g.PAD_R, ph = g.H - g.PAD_T - g.PAD_B;
  var best = -1, bestD = HOVER_R;
  for (var i = 0; i < trainX.length; i++) {
    var dx = g.PAD_L + (trainX[i][axX] - (-5)) / 10 * pw - px;
    var dy = g.PAD_T + ph - (trainY[i] - g.yMin) / g.yRange * ph - py;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function nearest2dPoint(px, py) {
  if (axY < 0) return -1; // 1D mode
  var best = -1, bestD = HOVER_R;
  var N2 = 320;
  for (var i = 0; i < trainX.length; i++) {
    var dx = (trainX[i][axX] - (-5)) / 10 * N2 - px;
    var dy = (1 - (trainX[i][axY] - (-5)) / 10) * N2 - py;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Shared hover handler: show tooltip + neighbor highlights
function handleHover(e, nearestFn) {
  var rect = e.target.getBoundingClientRect();
  var px = e.clientX - rect.left, py = e.clientY - rect.top;
  var hitIdx = nearestFn(px, py);
  var tt = document.getElementById('tooltip');
  if (hitIdx >= 0) {
    // Show tooltip
    var pt = trainX[hitIdx], fv = trainY[hitIdx];
    document.getElementById('tt-title').textContent = 'training point #' + hitIdx;
    var coordStr = 'x' + axX + ' = <span class="tt-coord">' + pt[axX].toFixed(3) + '</span>';
    if (axY >= 0) coordStr += ', x' + axY + ' = <span class="tt-coord">' + pt[axY].toFixed(3) + '</span>';
    document.getElementById('tt-body').innerHTML =
      '<span class="tt-val">f = ' + fv.toFixed(4) + '</span><br>' + coordStr;
    tt.style.display = 'block';
    tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px';
    e.target.style.cursor = 'pointer';
    // Highlight neighbors on hover (only if nothing pinned)
    if (neighborActiveIdx < 0 && hitIdx !== hoveredIdx) {
      hoveredIdx = hitIdx;
      drawNeighborDots(hitIdx);
    }
  } else {
    tt.style.display = 'none';
    e.target.style.cursor = 'crosshair';
    // Clear hover highlight (only if nothing pinned)
    if (neighborActiveIdx < 0 && hoveredIdx >= 0) {
      hoveredIdx = -1;
      restoreSliceDots();
    }
  }
}

function handleLeave() {
  document.getElementById('tooltip').style.display = 'none';
  if (neighborActiveIdx < 0 && hoveredIdx >= 0) {
    hoveredIdx = -1;
    restoreSliceDots();
  }
}

document.getElementById('cv1d').addEventListener('mousemove', function(e) {
  handleHover(e, nearest1dPoint);
});
document.getElementById('cv1d').addEventListener('mouseleave', handleLeave);

// Click handlers
function handleClick(e, nearestFn) {
  var rect = e.target.getBoundingClientRect();
  var px = e.clientX - rect.left, py = e.clientY - rect.top;
  var hitIdx = nearestFn(px, py);
  if (hitIdx >= 0) {
    if (neighborActiveIdx === hitIdx) {
      neighborActiveIdx = -1;
    } else {
      neighborActiveIdx = hitIdx;
      var clickedPt = trainX[hitIdx];
      for (var j = 0; j < fixedValues.length; j++) fixedValues[j] = clickedPt[j];
      buildSliders();
    }
  } else {
    neighborActiveIdx = -1;
  }
  hoveredIdx = -1;
  render();
}

document.getElementById('cv1d').addEventListener('click', function(e) {
  handleClick(e, nearest1dPoint);
});
document.getElementById('cv2d').addEventListener('click', function(e) {
  handleClick(e, nearest2dPoint);
});
document.getElementById('cv2d').addEventListener('mousemove', function(e) {
  handleHover(e, nearest2dPoint);
});
document.getElementById('cv2d').addEventListener('mouseleave', handleLeave);

// ─── Controls ───────────────────────────────────────────────────
document.getElementById('dimSlider').addEventListener('input', function() {
  document.getElementById('dimLabel').textContent = this.value;
});
document.getElementById('dimSlider').addEventListener('change', function() {
  nDim = +this.value;
  document.getElementById('dimLabel').textContent = nDim;
  fitAndBuild(); render();
});

document.getElementById('ptsSlider').addEventListener('input', function() {
  document.getElementById('ptsLabel').textContent = this.value;
});
document.getElementById('ptsSlider').addEventListener('change', function() {
  nPts = +this.value;
  document.getElementById('ptsLabel').textContent = nPts;
  fitAndBuild(); render();
});

// Kernel correlation checkbox: locks/unlocks diagnostic controls
function syncCorrelationToggle() {
  var locked = document.getElementById('useCorrelation').checked;
  var diagCtrls = document.querySelectorAll('.diag-ctrl');
  for (var i = 0; i < diagCtrls.length; i++) {
    if (locked) diagCtrls[i].classList.add('locked');
    else diagCtrls[i].classList.remove('locked');
    var sel = diagCtrls[i].querySelector('select');
    if (sel) sel.disabled = locked;
  }
  if (locked) {
    document.getElementById('selDistance').value = 'kernel';
    document.getElementById('selNorm').value = 'none';
    // Select the RBF formula option (first option)
    document.getElementById('selFormula').selectedIndex = 0;
    document.getElementById('selOpacity').value = 'linear';
  }
}
document.getElementById('useCorrelation').addEventListener('change', function() {
  syncCorrelationToggle(); render();
});

// These change the formula/distance/norm but don't refit the GP
['selFormula', 'selDistance', 'selNorm', 'selOpacity'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function() { render(); });
});

document.getElementById('selX').addEventListener('change', function() {
  axX = +this.value;
  if (axY >= 0 && axX === axY) { axY = (axX + 1) % nDim; document.getElementById('selY').value = axY; }
  buildSliders(); render();
});
document.getElementById('selY').addEventListener('change', function() {
  if (nDim < 2) return;
  axY = +this.value;
  if (axX === axY) { axX = (axY + 1) % nDim; document.getElementById('selX').value = axX; }
  buildSliders(); render();
});

// ─── Init ───────────────────────────────────────────────────────
syncCorrelationToggle();
fitAndBuild();
render();
</script>
</body>
</html>`;


// ─── Cross-Validation Plot ───────────────────────────────────────────────────

const crossValidation = `<!DOCTYPE html>
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
var Predictor = axjs.Predictor;
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

// ─── Feature Importance ──────────────────────────────────────────────────────

const featureImportance = `<!DOCTYPE html>
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
${sharedUtilsScript()}
<script>
var Predictor = axjs.Predictor;
var predictor, fixture, selectedOutcome;
var outcomeSelect = document.getElementById('outcomeSelect');
var viewMode = document.getElementById('viewMode');

var barColors = ['#7c6ff7','#6fa0f7','#6fcff7','#6ff7c8','#a0f76f','#f7e06f','#f7a06f','#f76f6f'];

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

outcomeSelect.addEventListener('change', function() { selectedOutcome = outcomeSelect.value; render(); });
viewMode.addEventListener('change', render);
document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  file.text().then(function(text) { loadFixtureData(JSON.parse(text)); });
});

loadFixtureData(__DEFAULT_FIXTURE__);
</script>
</body>
</html>`;

// ─── Optimization Trace ──────────────────────────────────────────────────────

const optimizationTrace = `<!DOCTYPE html>
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
var Predictor = axjs.Predictor;
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

// ─── Bayesian Optimization ───────────────────────────────────────────────────

const bayesianOptimization = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Bayesian Optimization</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f0f11; color: #e0e0e0;
    padding: 2rem; min-height: 100vh;
  }
  h1 { font-size: 18px; font-weight: 500; color: #f0f0f0; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 16px; }
  .controls { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
  button {
    font-size: 13px; padding: 6px 16px;
    border-radius: 6px; border: 0.5px solid #444;
    background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none;
  }
  select {
    font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #444;
    background: #1a1a1d; color: #e0e0e0; cursor: pointer; outline: none;
  }
  button:hover, select:hover { background: #252528; }
  button:disabled { opacity: 0.4; cursor: default; }
  .status { font-size: 13px; color: #888; }
  .status span { font-weight: 500; color: #ccc; }
  .plots { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  .plot { display: flex; flex-direction: column; gap: 6px; }
  .plot-title { font-size: 12px; color: #888; text-align: center; letter-spacing: 0.04em; }
  .canvas-wrap { position: relative; display: inline-block; }
  canvas.main {
    display: block; border-radius: 6px;
    border: 0.5px solid #333; cursor: crosshair;
  }
  canvas.overlay { position: absolute; top: 0; left: 0; pointer-events: none; }
  .cbrow { display: flex; align-items: center; gap: 6px; }
  .cblbl { font-size: 11px; color: #666; min-width: 40px; }
  canvas.cbar { height: 16px; flex: 1; border-radius: 4px; }
  .info { font-size: 13px; color: #777; margin-top: 14px; line-height: 1.8; }
  .info span { font-weight: 500; color: #ccc; }
  .statline { font-size: 13px; color: #777; margin-top: 14px; min-height: 1.5em; }
  .statline span { font-weight: 500; color: #ddd; }
  .legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: #777; }
  .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  #tooltip {
    position: fixed; display: none;
    background: #1e1e22; border: 0.5px solid #555;
    border-radius: 7px; padding: 9px 13px;
    font-size: 12px; color: #ccc;
    pointer-events: none; z-index: 100;
    line-height: 1.8; white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }
  #tooltip .tt-title {
    font-size: 11px; color: #888; letter-spacing: 0.05em;
    text-transform: uppercase; margin-bottom: 4px;
  }
  #tooltip .tt-val { color: #ff6b6b; font-weight: 500; }
  #tooltip .tt-coord { color: #a0c4ff; }
</style>
</head>
<body>

<h1>${axHomeLink}Bayesian Optimization</h1>
<p class="subtitle">Thompson Sampling (2D) - ScaleKernel(RBF) - GP fitted via MAP</p>

<div class="controls">
  <select id="selProblem">
    <option value="branin" selected>Branin</option>
    <option value="camel">Six-Hump Camel</option>
    <option value="ackley">Ackley</option>
    <option value="rosenbrock">Rosenbrock</option>
  </select>
  <button id="btnStep">Iterate</button>
  <button id="btnRun">Run All</button>
  <button id="btnReset" style="color:#888">Reset</button>
  <span class="status" id="status">Click Iterate to step through, or Run All for animation</span>
</div>

<div class="plots">
  <div class="plot">
    <div class="plot-title">true function (Branin)</div>
    <canvas id="cvT" class="main" width="320" height="320"></canvas>
    <div class="cbrow">
      <span class="cblbl" id="tlo">--</span>
      <canvas id="cbT" class="cbar"></canvas>
      <span class="cblbl" id="thi" style="text-align:right">--</span>
    </div>
  </div>
  <div class="plot">
    <div class="plot-title">posterior mean</div>
    <div class="canvas-wrap">
      <canvas id="cvM" class="main" width="320" height="320"></canvas>
      <canvas id="ovM" class="overlay" width="320" height="320"></canvas>
    </div>
    <div class="cbrow">
      <span class="cblbl" id="mlo">--</span>
      <canvas id="cbM" class="cbar"></canvas>
      <span class="cblbl" id="mhi" style="text-align:right">--</span>
    </div>
  </div>
  <div class="plot">
    <div class="plot-title">predictive std</div>
    <div class="canvas-wrap">
      <canvas id="cvS" class="main" width="320" height="320"></canvas>
      <canvas id="ovS" class="overlay" width="320" height="320"></canvas>
    </div>
    <div class="cbrow">
      <span class="cblbl">0.00</span>
      <canvas id="cbS" class="cbar"></canvas>
      <span class="cblbl" id="shi" style="text-align:right">--</span>
    </div>
  </div>
  <div class="plot">
    <div class="plot-title">LOO cross-validation</div>
    <canvas id="cvLOO" class="main" width="320" height="320"></canvas>
    <div class="loo-stats" id="looStats" style="font-size:11px;color:#777;margin-top:4px;text-align:center;">--</div>
  </div>
  <div class="plot">
    <div class="plot-title">optimization trace</div>
    <div id="traceContainer" style="width:320px;height:320px;background:#111;border-radius:6px;border:0.5px solid #333;position:relative;overflow:hidden;"></div>
  </div>
</div>

<div id="tooltip"><div class="tt-title" id="tt-title"></div><div id="tt-body"></div></div>

<div class="legend">
  <span><span class="legend-dot" style="background:#fff"></span>initial points</span>
  <span><span class="legend-dot" style="background:#6f6"></span>BO points</span>
  <span><span class="legend-dot" style="background:#f44"></span>latest</span>
  <span><span class="legend-dot" style="background:#ff0; border:1px solid #aa0"></span>global minima</span>
</div>
<div class="statline" id="statline">hover over posterior maps to inspect</div>
<div class="info" id="info"></div>

${libraryScript()}
${sharedColormapScript()}

<script>
var loadModel = axjs.loadModel;
var Predictor = axjs.Predictor;
var CN = 320, GS = 60;
var N_CAND = 1000, N_FEAT = 256, N_ITER = 50, N_INIT = 3, DELAY_MS = 100;
var running = false;

// ── Test Functions (all rescaled to [0,1]^2) ──
var PROBLEMS = {
  branin: {
    name: 'Branin',
    fn: function(x0, x1) {
      var X0 = 15*x0 - 5, X1 = 15*x1;
      var b = 5.1/(4*Math.PI*Math.PI), c = 5/Math.PI, t = 1/(8*Math.PI);
      return Math.pow(X1 - b*X0*X0 + c*X0 - 6, 2) + 10*(1-t)*Math.cos(X0) + 10;
    },
    optima: [[0.5428, 0.1517], [0.1239, 0.8183], [0.9617, 0.1650]],
    fmin: 0.397887
  },
  camel: {
    name: 'Six-Hump Camel',
    fn: function(x0, x1) {
      // Domain: x1 in [-3,3], x2 in [-2,2] -> rescale from [0,1]
      var X0 = 6*x0 - 3, X1 = 4*x1 - 2;
      return (4 - 2.1*X0*X0 + X0*X0*X0*X0/3)*X0*X0 + X0*X1 + (-4 + 4*X1*X1)*X1*X1;
    },
    optima: [[(0.0898+3)/6, (-0.7126+2)/4], [(-0.0898+3)/6, (0.7126+2)/4]],
    fmin: -1.0316
  },
  ackley: {
    name: 'Ackley',
    fn: function(x0, x1) {
      // Domain: [-5,5]^2 -> rescale from [0,1]
      var X0 = 10*x0 - 5, X1 = 10*x1 - 5;
      return -20*Math.exp(-0.2*Math.sqrt(0.5*(X0*X0+X1*X1)))
             - Math.exp(0.5*(Math.cos(2*Math.PI*X0)+Math.cos(2*Math.PI*X1)))
             + Math.E + 20;
    },
    optima: [[0.5, 0.5]],
    fmin: 0
  },
  rosenbrock: {
    name: 'Rosenbrock',
    fn: function(x0, x1) {
      // Domain: [-2,2]^2 -> rescale from [0,1]
      var X0 = 4*x0 - 2, X1 = 4*x1 - 2;
      return (1-X0)*(1-X0) + 100*(X1-X0*X0)*(X1-X0*X0);
    },
    optima: [[(1+2)/4, (1+2)/4]],  // (1,1) in raw space
    fmin: 0
  }
};

var curProblem = PROBLEMS.branin;

// ── PRNG (xoshiro128**) ──
function Rng(seed) {
  var s = new Uint32Array(4);
  for (var i = 0; i < 4; i++) {
    seed += 0x9e3779b9;
    var t = seed;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    s[i] = (t ^ (t >>> 15)) >>> 0;
  }
  this.s = s;
}
Rng.prototype.uniform = function() {
  var s = this.s, r = s[0] + s[3], t = s[1] << 9;
  s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t;
  s[3] = (s[3] << 11) | (s[3] >>> 21);
  return (r >>> 0) / 4294967296;
};
Rng.prototype.randn = function() {
  var u1 = this.uniform(), u2 = this.uniform();
  return Math.sqrt(-2*Math.log(u1+1e-300)) * Math.cos(2*Math.PI*u2);
};

// ── Cholesky utilities (flat Float64Array, n×n) ──
function cholRaw(K, n, jitter) {
  var L = new Float64Array(n*n);
  for (var i = 0; i < n; i++) {
    for (var j = 0; j <= i; j++) {
      var s = K[i*n+j]; if (i===j) s += jitter;
      for (var k = 0; k < j; k++) s -= L[i*n+k]*L[j*n+k];
      if (i===j) { if (s<=0) return null; L[i*n+j] = Math.sqrt(s); }
      else L[i*n+j] = s / L[j*n+j];
    }
  }
  return L;
}
function chol(K, n) {
  var r = cholRaw(K, n, 0); if (r) return r;
  var jit = [1e-6,1e-5,1e-4,1e-3];
  for (var i = 0; i < jit.length; i++) { r = cholRaw(K, n, jit[i]); if (r) return r; }
  return null;
}
function cholSolve(L, b, n) {
  var y = new Float64Array(n);
  for (var i = 0; i < n; i++) { var s=b[i]; for (var j=0;j<i;j++) s-=L[i*n+j]*y[j]; y[i]=s/L[i*n+i]; }
  var x = new Float64Array(n);
  for (var i=n-1; i>=0; i--) { var s=y[i]; for (var j=i+1;j<n;j++) s-=L[j*n+i]*x[j]; x[i]=s/L[i*n+i]; }
  return x;
}

// ── MLL + gradient for ScaleKernel(RBF) ──
function mllGrad(X, Y, p) {
  // p = [log_os, log_ls0, log_ls1, log_nv, mean]
  var n = X.length, os = Math.exp(p[0]);
  var ls0 = Math.exp(p[1]), ls1 = Math.exp(p[2]);
  var nv = Math.exp(p[3]), mc = p[4];
  // Kernel matrix K = os*RBF + nv*I
  var Krbf = new Float64Array(n*n), K = new Float64Array(n*n);
  // Store per-dim squared diffs for gradient
  var D0 = new Float64Array(n*n), D1 = new Float64Array(n*n);
  for (var i = 0; i < n; i++) {
    for (var j = i; j < n; j++) {
      var d0 = (X[i][0]-X[j][0])/ls0, d1 = (X[i][1]-X[j][1])/ls1;
      var kr = Math.exp(-0.5*(d0*d0+d1*d1));
      Krbf[i*n+j]=kr; Krbf[j*n+i]=kr;
      D0[i*n+j]=d0*d0; D0[j*n+i]=d0*d0;
      D1[i*n+j]=d1*d1; D1[j*n+i]=d1*d1;
      var kv = os*kr;
      K[i*n+j]=kv; K[j*n+i]=kv;
    }
    K[i*n+i] += nv;
  }
  var L = chol(K, n);
  if (!L) return {mll:-1e10, grad:new Float64Array(5)};
  // alpha = K^-1 (y - m)
  var r = new Float64Array(n);
  for (var i=0;i<n;i++) r[i] = Y[i] - mc;
  var alpha = cholSolve(L, r, n);
  // log MLL
  var mll = -0.5*n*Math.log(2*Math.PI);
  for (var i=0;i<n;i++) { mll -= 0.5*r[i]*alpha[i]; mll -= Math.log(L[i*n+i]); }
  // K^-1 for gradient
  var Ki = new Float64Array(n*n);
  for (var c=0;c<n;c++) {
    var e = new Float64Array(n); e[c]=1;
    var x = cholSolve(L,e,n);
    for (var rr=0;rr<n;rr++) Ki[rr*n+c]=x[rr];
  }
  // W = alpha*alpha^T - K^-1
  var W = new Float64Array(n*n);
  for (var i=0;i<n;i++) for (var j=0;j<n;j++) W[i*n+j] = alpha[i]*alpha[j] - Ki[i*n+j];
  // Gradients
  var g = new Float64Array(5);
  for (var i=0;i<n;i++) for (var j=0;j<n;j++) {
    var w = W[i*n+j], kr = Krbf[i*n+j];
    g[0] += w * os * kr;         // d/d log(os)
    g[1] += w * os * kr * D0[i*n+j]; // d/d log(ls0)
    g[2] += w * os * kr * D1[i*n+j]; // d/d log(ls1)
  }
  g[0]*=0.5; g[1]*=0.5; g[2]*=0.5;
  var trW = 0; for (var i=0;i<n;i++) trW += W[i*n+i];
  g[3] = 0.5*nv*trW;
  for (var i=0;i<n;i++) g[4] += alpha[i]; // d/d mean
  // MAP priors (log-normal, matching BoTorch defaults)
  // Noise prior: centered at log(1e-4), sigma=1
  var nvTarget = Math.log(1e-4);
  mll += -0.5*(p[3]-nvTarget)*(p[3]-nvTarget);
  g[3] += -(p[3]-nvTarget);
  // Lengthscale prior: centered at log(0.3), sigma=1
  var lsTarget = Math.log(0.3);
  for (var d=0;d<2;d++) {
    mll += -0.5*(p[1+d]-lsTarget)*(p[1+d]-lsTarget);
    g[1+d] += -(p[1+d]-lsTarget);
  }
  // Outputscale prior: centered at 0 (=log(1)), sigma=1.5
  mll += -0.5*p[0]*p[0]/(1.5*1.5);
  g[0] += -p[0]/(1.5*1.5);
  return {mll:mll, grad:g};
}

// ── Fit GP hyperparameters via multi-restart Adam on MAP ──
function fitGP(X, rawY) {
  var n = rawY.length, ymean = 0;
  for (var i=0;i<n;i++) ymean += rawY[i];
  ymean /= n;
  var yvar = 0;
  for (var i=0;i<n;i++) yvar += (rawY[i]-ymean)*(rawY[i]-ymean);
  var ystd = Math.sqrt(yvar/Math.max(n-1,1));
  if (ystd < 1e-8) ystd = 1;
  var Y = new Float64Array(n);
  for (var i=0;i<n;i++) Y[i] = (rawY[i]-ymean)/ystd;
  // Multi-restart: 4 different initializations
  var inits = [
    [0, Math.log(0.5), Math.log(0.5), -5, 0],
    [0, Math.log(0.1), Math.log(0.1), -8, 0],
    [1, Math.log(0.3), Math.log(0.3), -6, 0],
    [-0.5, Math.log(0.15), Math.log(0.15), -9, 0]
  ];
  var bestMll = -Infinity, bestP = inits[0];
  for (var r = 0; r < inits.length; r++) {
    var p = inits[r].slice();
    var m = new Float64Array(5), v = new Float64Array(5);
    var lr = 0.05, b1 = 0.9, b2 = 0.999, eps = 1e-8;
    for (var step = 0; step < 200; step++) {
      var res = mllGrad(X, Y, p);
      for (var i = 0; i < 5; i++) {
        m[i] = b1*m[i] + (1-b1)*res.grad[i];
        v[i] = b2*v[i] + (1-b2)*res.grad[i]*res.grad[i];
        var mh = m[i]/(1-Math.pow(b1,step+1));
        var vh = v[i]/(1-Math.pow(b2,step+1));
        p[i] += lr * mh / (Math.sqrt(vh)+eps);
      }
      p[0] = Math.max(-5, Math.min(5, p[0]));
      p[1] = Math.max(-4, Math.min(2, p[1]));
      p[2] = Math.max(-4, Math.min(2, p[2]));
      p[3] = Math.max(-12, Math.min(0, p[3]));
    }
    var finalMll = mllGrad(X, Y, p).mll;
    if (finalMll > bestMll) { bestMll = finalMll; bestP = p.slice(); }
  }
  return {
    os: Math.exp(bestP[0]), ls: [Math.exp(bestP[1]),Math.exp(bestP[2])],
    nv: Math.exp(bestP[3]), mc: bestP[4], ymean: ymean, ystd: ystd
  };
}

// ── RFF-based Thompson Sampling ──
function thompsonSampleRFF(X, hp, rng) {
  var n = X.length, D = N_FEAT;
  // Standardize Y is already done — we store yStd as hp.yStd
  var yStd = hp.yStd;
  // Sample random features for RBF kernel
  var omega0 = new Float64Array(D), omega1 = new Float64Array(D);
  var bias = new Float64Array(D);
  for (var j=0;j<D;j++) {
    omega0[j] = rng.randn() / hp.ls[0];
    omega1[j] = rng.randn() / hp.ls[1];
    bias[j] = rng.uniform() * 2 * Math.PI;
  }
  var scale = Math.sqrt(2*hp.os/D);
  // Feature function
  function phi(pts) {
    var m = pts.length, F = new Float64Array(m*D);
    for (var i=0;i<m;i++) for (var j=0;j<D;j++) {
      F[i*D+j] = scale * Math.cos(omega0[j]*pts[i][0] + omega1[j]*pts[i][1] + bias[j]);
    }
    return F;
  }
  var PhiX = phi(X);
  // A = Phi^T Phi / nv + I  (D×D)
  var A = new Float64Array(D*D);
  for (var i=0;i<D;i++) {
    for (var j=0;j<=i;j++) {
      var s=0; for (var k=0;k<n;k++) s += PhiX[k*D+i]*PhiX[k*D+j];
      s /= hp.nv; A[i*D+j]=s; A[j*D+i]=s;
    }
    A[i*D+i] += 1;
  }
  var LA = chol(A, D);
  if (!LA) return null;
  // b = Phi^T (y-m) / nv
  var b = new Float64Array(D);
  for (var j=0;j<D;j++) { var s=0; for (var k=0;k<n;k++) s += PhiX[k*D+j]*(yStd[k]-hp.mc); b[j]=s/hp.nv; }
  var muTh = cholSolve(LA, b, D);
  // Sample: theta* = mu + L_A^{-T} z
  var z = new Float64Array(D); for (var j=0;j<D;j++) z[j]=rng.randn();
  var v = new Float64Array(D);
  for (var i=D-1;i>=0;i--) { var s=z[i]; for (var j=i+1;j<D;j++) s-=LA[j*D+i]*v[j]; v[i]=s/LA[i*D+i]; }
  var theta = new Float64Array(D);
  for (var j=0;j<D;j++) theta[j] = muTh[j] + v[j];
  // Generate candidates and evaluate TS function
  var cands = [];
  for (var i=0;i<N_CAND;i++) cands.push([rng.uniform(), rng.uniform()]);
  var PhiC = phi(cands);
  var bestIdx=0, bestVal=Infinity;
  for (var i=0;i<N_CAND;i++) {
    var f = hp.mc;
    for (var j=0;j<D;j++) f += theta[j]*PhiC[i*D+j];
    if (f < bestVal) { bestVal=f; bestIdx=i; } // minimize
  }
  return cands[bestIdx];
}

// ── Build GPModelState for axjs ──
function buildModelState(X, rawY, hp) {
  var yStd = [];
  for (var i=0;i<rawY.length;i++) yStd.push((rawY[i]-hp.ymean)/hp.ystd);
  return {
    model_type: "SingleTaskGP",
    train_X: X,
    train_Y: yStd,
    kernel: { type: "Scale", outputscale: hp.os, base_kernel: { type: "RBF", lengthscale: hp.ls } },
    mean_constant: hp.mc,
    noise_variance: hp.nv,
    input_transform: { offset: [0,0], coefficient: [1,1] },
    outcome_transform: { type: "Standardize", mean: hp.ymean, std: hp.ystd }
  };
}

// ── Rendering ──
var ctxT = document.getElementById('cvT').getContext('2d');
var ctxM = document.getElementById('cvM').getContext('2d');
var ctxS = document.getElementById('cvS').getContext('2d');
var ctxOM = document.getElementById('ovM').getContext('2d');
var ctxOS = document.getElementById('ovS').getContext('2d');
var ctxLOO = document.getElementById('cvLOO').getContext('2d');

// Precompute true function on grid
var trueVals, trueMin, trueMax, trueRange;
function precomputeTrueFunction() {
  trueVals = new Float64Array(GS*GS);
  trueMin = Infinity; trueMax = -Infinity;
  for (var gj=0;gj<GS;gj++) for (var gi=0;gi<GS;gi++) {
    var v = curProblem.fn(gi/(GS-1), 1-gj/(GS-1));
    trueVals[gj*GS+gi] = v;
    if (v<trueMin) trueMin=v; if (v>trueMax) trueMax=v;
  }
  trueRange = trueMax-trueMin||1;
}
precomputeTrueFunction();

function renderHeatmap(ctx, vals, vmin, vrange, cfn) {
  var img = ctx.createImageData(CN, CN);
  var cellW = CN/GS, cellH = CN/GS;
  for (var k=0;k<vals.length;k++) {
    var gi=k%GS, gj=Math.floor(k/GS);
    var t = Math.max(0, Math.min(1, (vals[k]-vmin)/vrange));
    var rgb = cfn(t);
    var x0=Math.round(gi*cellW), y0=Math.round(gj*cellH);
    var x1=Math.round((gi+1)*cellW), y1=Math.round((gj+1)*cellH);
    for (var py=y0;py<y1;py++) for (var px=x0;px<x1;px++) {
      var idx=(py*CN+px)*4;
      img.data[idx]=rgb[0]; img.data[idx+1]=rgb[1]; img.data[idx+2]=rgb[2]; img.data[idx+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
}

// Draw optima stars and training points on the TRUE function canvas only
function drawTrueOverlay(X, nInit, latest) {
  ctxT.clearRect(0,0,CN,CN);
  renderHeatmap(ctxT, trueVals, trueMin, trueRange, viridis);
  // Global minima stars
  for (var i=0;i<curProblem.optima.length;i++) {
    var px=curProblem.optima[i][0]*CN, py=(1-curProblem.optima[i][1])*CN;
    ctxT.save(); ctxT.translate(px,py); ctxT.beginPath();
    for (var k=0;k<5;k++) {
      var a = -Math.PI/2 + k*2*Math.PI/5, b2 = a + Math.PI/5;
      ctxT.lineTo(5*Math.cos(a), 5*Math.sin(a));
      ctxT.lineTo(2*Math.cos(b2), 2*Math.sin(b2));
    }
    ctxT.closePath();
    ctxT.fillStyle='rgba(255,255,0,0.7)'; ctxT.fill();
    ctxT.strokeStyle='rgba(170,170,0,0.9)'; ctxT.lineWidth=0.8; ctxT.stroke();
    ctxT.restore();
  }
  // Training points
  for (var i=0;i<X.length;i++) {
    var px=X[i][0]*CN, py=(1-X[i][1])*CN;
    ctxT.beginPath(); ctxT.arc(px,py, i===latest?5:3.5, 0, 2*Math.PI);
    if (i<nInit) ctxT.fillStyle='rgba(255,255,255,0.9)';
    else if (i===latest) ctxT.fillStyle='#ff4444';
    else ctxT.fillStyle='rgba(100,255,100,0.85)';
    ctxT.fill();
    ctxT.strokeStyle='rgba(0,0,0,0.6)'; ctxT.lineWidth=1; ctxT.stroke();
  }
  // Axis labels
  ctxT.font='10px sans-serif'; ctxT.fillStyle='rgba(255,255,255,0.4)';
  for (var ti=0;ti<=4;ti++) {
    ctxT.fillText((ti/4).toFixed(2), ti*CN/4-8, CN-2);
    ctxT.fillText((1-ti/4).toFixed(2), 2, ti*CN/4+10);
  }
}

// Marching-squares contour lines (from response_surface demo)
function drawContourLines(ctx, vals, gs, canvasN, vMin, vRange) {
  var nLevels = 10, step = canvasN / (gs - 1);
  function edgeXY(gi, gj, edge, frac) {
    switch (edge) {
      case 0: return [step*(gi+frac), step*gj];
      case 1: return [step*(gi+1),    step*(gj+frac)];
      case 2: return [step*(gi+frac), step*(gj+1)];
      case 3: return [step*gi,        step*(gj+frac)];
    }
  }
  function lerp(a, b, level) { var d=b-a; return d===0 ? 0.5 : (level-a)/d; }
  var SEG = [
    [],[[2,3]],[[1,2]],[[1,3]],[[0,1]],null,[[0,2]],[[0,3]],
    [[0,3]],[[0,2]],null,[[0,1]],[[1,3]],[[1,2]],[[2,3]],[]
  ];
  for (var li = 1; li < nLevels; li++) {
    var level = vMin + vRange * li / nLevels;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (var gj = 0; gj < gs-1; gj++) {
      for (var gi = 0; gi < gs-1; gi++) {
        var tl=vals[gj*gs+gi], tr=vals[gj*gs+gi+1];
        var bl=vals[(gj+1)*gs+gi], br=vals[(gj+1)*gs+gi+1];
        var code = (tl>=level?8:0)|(tr>=level?4:0)|(br>=level?2:0)|(bl>=level?1:0);
        if (code===0||code===15) continue;
        var segs = SEG[code];
        if (!segs) {
          var center = (tl+tr+br+bl)/4;
          if (code===5) segs = center>=level ? [[0,3],[1,2]] : [[0,1],[2,3]];
          else          segs = center>=level ? [[0,1],[2,3]] : [[0,3],[1,2]];
        }
        for (var si=0; si<segs.length; si++) {
          var eA=segs[si][0], eB=segs[si][1];
          var fA, fB;
          if (eA===0) fA=lerp(tl,tr,level); else if (eA===1) fA=lerp(tr,br,level);
          else if (eA===2) fA=lerp(bl,br,level); else fA=lerp(tl,bl,level);
          if (eB===0) fB=lerp(tl,tr,level); else if (eB===1) fB=lerp(tr,br,level);
          else if (eB===2) fB=lerp(bl,br,level); else fB=lerp(tl,bl,level);
          var pA=edgeXY(gi,gj,eA,fA), pB=edgeXY(gi,gj,eB,fB);
          ctx.moveTo(pA[0],pA[1]); ctx.lineTo(pB[0],pB[1]);
        }
      }
    }
    ctx.stroke();
  }
}

// Draw star at given coords on a context
function drawStar(ctx, px, py) {
  ctx.save(); ctx.translate(px,py); ctx.beginPath();
  for (var sk=0;sk<5;sk++) {
    var sa = -Math.PI/2 + sk*2*Math.PI/5, sb = sa + Math.PI/5;
    ctx.lineTo(5*Math.cos(sa), 5*Math.sin(sa));
    ctx.lineTo(2*Math.cos(sb), 2*Math.sin(sb));
  }
  ctx.closePath();
  ctx.fillStyle='rgba(255,255,0,0.7)'; ctx.fill();
  ctx.strokeStyle='rgba(170,170,0,0.9)'; ctx.lineWidth=0.8; ctx.stroke();
  ctx.restore();
}

// Render true function
function renderTrueFunction() {
  precomputeTrueFunction();
  drawTrueOverlay([], 0, -1);
  document.getElementById('tlo').textContent = trueMin.toFixed(1);
  document.getElementById('thi').textContent = trueMax.toFixed(1);
}
renderTrueFunction();
drawColorbar('cbT', viridis);
drawColorbar('cbM', viridis);
drawColorbar('cbS', plasma);

// Problem selector
document.getElementById('selProblem').addEventListener('change', function() {
  curProblem = PROBLEMS[this.value];
  boReset();
});

// ── State for hover/click interaction ──
var lastX = null, lastRawY = null, lastPredictor = null;
var pinnedTrainIdx = -1, hoverNeighborIdx = -1;

function renderPosterior(model, X, rawY, hp) {
  var pts = [];
  for (var gj=0;gj<GS;gj++) for (var gi=0;gi<GS;gi++) {
    pts.push([gi/(GS-1), 1-gj/(GS-1)]);
  }
  var pred = model.predict(pts);
  var means = pred.mean, vars = pred.variance;
  var stds = new Float64Array(means.length), stdMax = 0;
  for (var i=0;i<means.length;i++) { stds[i]=Math.sqrt(vars[i]); if(stds[i]>stdMax) stdMax=stds[i]; }
  // Heatmaps + contour lines
  renderHeatmap(ctxM, means, trueMin, trueRange, viridis);
  renderHeatmap(ctxS, stds, 0, stdMax||1, plasma);
  drawContourLines(ctxM, Array.from(means), GS, CN, trueMin, trueRange);
  drawContourLines(ctxS, Array.from(stds), GS, CN, 0, stdMax||1);
  // True function with points
  drawTrueOverlay(X, N_INIT, X.length-1);
  // Overlay (training points on posterior canvases)
  drawOverlays(undefined, undefined, -1, pinnedTrainIdx);
  document.getElementById('mlo').textContent = trueMin.toFixed(1);
  document.getElementById('mhi').textContent = trueMax.toFixed(1);
  document.getElementById('shi').textContent = stdMax.toFixed(2);
}

// ── Overlay: crosshair + training points with neighbor-mode opacity ──
function drawOverlays(hx, hy, hoveredIdx, neighborActiveIdx) {
  if (!lastX) return;
  [ctxOM, ctxOS].forEach(function(ctx) {
    ctx.clearRect(0, 0, CN, CN);
    if (hx !== undefined) {
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, CN);
      ctx.moveTo(0, hy); ctx.lineTo(CN, hy);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.5; ctx.stroke();
    }
    // Axis labels
    ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('x0 ->', CN - 50, CN - 8);
    ctx.save(); ctx.translate(14, 60); ctx.rotate(-Math.PI / 2);
    ctx.fillText('x1 ->', 0, 0); ctx.restore();
    ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (var ti = 0; ti <= 4; ti++) {
      ctx.fillText((ti/4).toFixed(2), ti*CN/4 - 8, CN - 2);
      ctx.fillText((1-ti/4).toFixed(2), 2, ti*CN/4 + 10);
    }
    // Kernel-distance neighbor mode
    var activePt = (neighborActiveIdx >= 0 && neighborActiveIdx < lastX.length)
      ? lastX[neighborActiveIdx] : null;
    var neighborRels = null, neighborMax = 0;
    if (activePt && lastPredictor) {
      neighborRels = [];
      for (var ni = 0; ni < lastX.length; ni++) {
        if (ni === neighborActiveIdx) { neighborRels.push(1); continue; }
        var nr = lastPredictor.kernelCorrelation(lastX[ni], activePt, 'y');
        neighborRels.push(nr);
        if (nr > neighborMax) neighborMax = nr;
      }
    }
    // Training points
    for (var i = 0; i < lastX.length; i++) {
      var ppx = lastX[i][0]*CN, ppy = (1-lastX[i][1])*CN;
      var fillAlpha;
      if (activePt && neighborRels) {
        fillAlpha = (i === neighborActiveIdx) ? 0.95
          : Math.max(0.08, Math.min(0.90, Math.sqrt(neighborMax > 0 ? neighborRels[i]/neighborMax : 0)));
      } else { fillAlpha = 0.95; }
      var isActive = (i === neighborActiveIdx), isHovered = (i === hoveredIdx);
      var outerR = (isActive || isHovered) ? 7.5 : 5;
      var innerR = (isActive || isHovered) ? 4 : 2.5;
      ctx.beginPath(); ctx.arc(ppx, ppy, outerR, 0, 2*Math.PI);
      ctx.strokeStyle = isActive ? 'rgba(255,255,255,1)'
        : 'rgba(255,255,255,' + Math.max(0.15, fillAlpha*0.6).toFixed(3) + ')';
      ctx.lineWidth = isActive ? 2.5 : (isHovered ? 2 : 1.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(ppx, ppy, innerR, 0, 2*Math.PI);
      var bc = i < N_INIT ? [255,255,255] : (i === lastX.length-1 ? [255,68,68] : [100,255,100]);
      ctx.fillStyle = (isActive || isHovered)
        ? 'rgba(' + bc.join(',') + ',1)'
        : 'rgba(' + bc.join(',') + ',' + fillAlpha.toFixed(3) + ')';
      ctx.fill();
    }
    // Optima stars on overlays too
    for (var oi = 0; oi < curProblem.optima.length; oi++) {
      drawStar(ctx, curProblem.optima[oi][0]*CN, (1-curProblem.optima[oi][1])*CN);
    }
  });
}

// ── Hover + click handlers on posterior canvases ──
var HOVER_R = 9;
function nearestTrainPoint(cpx, cpy) {
  if (!lastX || !lastX.length) return -1;
  var best = -1, bestD = HOVER_R;
  for (var i = 0; i < lastX.length; i++) {
    var dx = lastX[i][0]*CN - cpx, dy = (1-lastX[i][1])*CN - cpy;
    var d = Math.sqrt(dx*dx + dy*dy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

['cvM', 'cvS'].forEach(function(id) {
  var cv = document.getElementById(id);
  cv.addEventListener('mousemove', function(e) {
    if (!lastX) return;
    var rect = cv.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var x0v = px / CN, x1v = 1 - py / CN;
    var hitIdx = nearestTrainPoint(px, py);
    var tt = document.getElementById('tooltip');
    var ttTitle = document.getElementById('tt-title');
    var ttBody = document.getElementById('tt-body');
    var activeIdx = pinnedTrainIdx;
    if (activeIdx === -1 && hitIdx >= 0) { activeIdx = hitIdx; hoverNeighborIdx = hitIdx; }
    else if (activeIdx === -1) { hoverNeighborIdx = -1; }

    if (hitIdx >= 0) {
      var tpt = lastX[hitIdx], yVal = lastRawY[hitIdx];
      var typeLabel = hitIdx < N_INIT ? 'initial' : (hitIdx === lastX.length-1 ? 'latest' : 'BO iter ' + (hitIdx - N_INIT + 1));
      ttTitle.textContent = 'training point #' + (hitIdx + 1);
      ttBody.innerHTML = '<span class="tt-val">y = ' + yVal.toFixed(4) + '</span><br>' +
        '<span class="tt-coord">x0</span> = ' + tpt[0].toFixed(4) + '<br>' +
        '<span class="tt-coord">x1</span> = ' + tpt[1].toFixed(4) + '<br>' +
        '<span style="color:#888">' + typeLabel + '</span>';
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px';
      document.getElementById('statline').innerHTML =
        'point #' + (hitIdx+1) + ' (' + typeLabel + ') y = <span>' + yVal.toFixed(4) + '</span>';
      cv.style.cursor = 'pointer';
    } else {
      if (lastPredictor) {
        var p = lastPredictor.predict([[x0v, x1v]]).y;
        var mu = p.mean[0], std = Math.sqrt(p.variance[0]);
        document.getElementById('statline').innerHTML =
          'x0 = <span>' + x0v.toFixed(4) + '</span>  x1 = <span>' + x1v.toFixed(4) + '</span>  ' +
          'mu = <span>' + mu.toFixed(4) + '</span>  std = <span>' + std.toFixed(4) + '</span>';
        ttTitle.textContent = '';
        ttBody.innerHTML = 'mu = ' + mu.toFixed(4) + '<br>std = ' + std.toFixed(4);
      }
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px';
      cv.style.cursor = 'crosshair';
    }
    drawOverlays(px, py, hitIdx, activeIdx);
    highlightTraceDots(activeIdx);
  });
  cv.addEventListener('click', function(e) {
    if (!lastX) return;
    var rect = cv.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var hitIdx = nearestTrainPoint(px, py);
    if (hitIdx >= 0) { pinnedTrainIdx = (pinnedTrainIdx === hitIdx) ? -1 : hitIdx; }
    else { pinnedTrainIdx = -1; }
    var a = pinnedTrainIdx >= 0 ? pinnedTrainIdx : hoverNeighborIdx;
    drawOverlays(px, py, hitIdx, a);
    highlightTraceDots(a);
  });
  cv.addEventListener('mouseleave', function() {
    document.getElementById('tooltip').style.display = 'none';
    hoverNeighborIdx = -1;
    drawOverlays(undefined, undefined, -1, pinnedTrainIdx);
    highlightTraceDots(pinnedTrainIdx);
    document.getElementById('statline').innerHTML =
      pinnedTrainIdx >= 0
        ? 'pinned point #' + (pinnedTrainIdx+1) + ' -- click elsewhere to unpin'
        : 'hover over posterior maps to inspect';
  });
});

// ── LOO Cross-Validation scatter plot ──
function renderLOO() {
  if (!lastPredictor) return;
  var loo = lastPredictor.loocv('y');
  var obs = loo.observed, pmean = loo.mean, pvar = loo.variance;
  var n = obs.length;
  // Compute range
  var lo = Infinity, hi = -Infinity;
  for (var i=0;i<n;i++) {
    var elo = pmean[i] - 2*Math.sqrt(pvar[i]), ehi = pmean[i] + 2*Math.sqrt(pvar[i]);
    lo = Math.min(lo, obs[i], elo); hi = Math.max(hi, obs[i], ehi);
  }
  var pad = (hi-lo)*0.08; lo -= pad; hi += pad;
  var range = hi - lo || 1;
  var margin = 32, pw = CN - 2*margin;
  // Clear and draw
  ctxLOO.clearRect(0,0,CN,CN);
  ctxLOO.fillStyle = '#111'; ctxLOO.fillRect(0,0,CN,CN);
  // Diagonal line (perfect prediction)
  ctxLOO.strokeStyle = 'rgba(255,255,255,0.15)'; ctxLOO.lineWidth = 1;
  ctxLOO.beginPath();
  ctxLOO.moveTo(margin, margin); ctxLOO.lineTo(margin+pw, margin+pw);
  ctxLOO.stroke();
  // Axis labels
  ctxLOO.font = '10px sans-serif'; ctxLOO.fillStyle = 'rgba(255,255,255,0.3)';
  ctxLOO.fillText('observed', margin + pw/2 - 20, CN - 4);
  ctxLOO.save(); ctxLOO.translate(10, margin + pw/2 + 16); ctxLOO.rotate(-Math.PI/2);
  ctxLOO.fillText('predicted', 0, 0); ctxLOO.restore();
  // Tick marks
  for (var t=0;t<=4;t++) {
    var val = lo + t*range/4;
    var px = margin + t*pw/4, py = margin + t*pw/4;
    ctxLOO.fillStyle = 'rgba(255,255,255,0.25)';
    ctxLOO.fillText(val.toFixed(1), px - 8, CN - margin + 14);
    ctxLOO.fillText(val.toFixed(1), 2, py + 3);
  }
  // Error bars + points
  for (var i=0;i<n;i++) {
    var px = margin + (obs[i]-lo)/range*pw;
    var py = margin + pw - (pmean[i]-lo)/range*pw;
    var errH = 2*Math.sqrt(pvar[i])/range*pw;
    ctxLOO.strokeStyle = 'rgba(100,180,255,0.3)'; ctxLOO.lineWidth = 1.5;
    ctxLOO.beginPath(); ctxLOO.moveTo(px,py-errH); ctxLOO.lineTo(px,py+errH); ctxLOO.stroke();
    ctxLOO.beginPath(); ctxLOO.arc(px,py,3,0,2*Math.PI);
    ctxLOO.fillStyle = 'rgba(100,180,255,0.85)'; ctxLOO.fill();
    ctxLOO.strokeStyle = 'rgba(255,255,255,0.4)'; ctxLOO.lineWidth = 0.5; ctxLOO.stroke();
  }
  // Compute R^2
  var mObs = 0; for (var i=0;i<n;i++) mObs += obs[i]; mObs /= n;
  var ssTot = 0, ssRes = 0;
  for (var i=0;i<n;i++) { ssTot += (obs[i]-mObs)*(obs[i]-mObs); ssRes += (obs[i]-pmean[i])*(obs[i]-pmean[i]); }
  var r2 = 1 - ssRes/(ssTot||1);
  document.getElementById('looStats').textContent = 'R2 = ' + r2.toFixed(4) + ' | n = ' + n;
}

// ── Optimization Trace (SVG) ──
var traceDots = [];  // [{el, idx, value, best, isBest, cx, cy}]

function renderTrace() {
  if (!lastRawY || lastRawY.length === 0) return;
  var container = document.getElementById('traceContainer');
  container.innerHTML = '';

  var rawY = lastRawY;
  var n = rawY.length;

  // Running best (always minimize in BO demo)
  var best = rawY[0];
  var bestSoFar = rawY.map(function(y) { best = Math.min(best, y); return best; });

  var yMin = Math.min.apply(null, rawY);
  var yMax = Math.max.apply(null, rawY);
  var yPad = 0.08 * (yMax - yMin || 1);
  yMin -= yPad; yMax += yPad;

  var W = 320, H = 320;
  var margin = { top: 20, right: 12, bottom: 30, left: 42 };
  var pw = W - margin.left - margin.right;
  var ph = H - margin.top - margin.bottom;

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W); svg.setAttribute('height', H);

  function sx(i) { return margin.left + (i / Math.max(1, n - 1)) * pw; }
  function sy(v) { return margin.top + ph - (v - yMin) / (yMax - yMin) * ph; }

  // Grid
  var nTicks = 4;
  for (var t = 0; t <= nTicks; t++) {
    var v = yMin + (yMax - yMin) * t / nTicks;
    var gl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    gl.setAttribute('x1', margin.left); gl.setAttribute('x2', margin.left + pw);
    gl.setAttribute('y1', sy(v)); gl.setAttribute('y2', sy(v));
    gl.setAttribute('stroke', 'rgba(255,255,255,0.05)');
    svg.appendChild(gl);
    var yt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yt.setAttribute('x', margin.left - 4); yt.setAttribute('y', sy(v) + 3);
    yt.setAttribute('fill', '#555'); yt.setAttribute('font-size', '8');
    yt.setAttribute('text-anchor', 'end'); yt.textContent = v.toFixed(1);
    svg.appendChild(yt);
  }

  // Best-so-far step line
  var bsfPath = 'M ' + sx(0) + ' ' + sy(bestSoFar[0]);
  for (var i = 1; i < n; i++) {
    bsfPath += ' H ' + sx(i) + ' V ' + sy(bestSoFar[i]);
  }
  var bsfLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bsfLine.setAttribute('d', bsfPath);
  bsfLine.setAttribute('stroke', '#7c6ff7'); bsfLine.setAttribute('stroke-width', '2');
  bsfLine.setAttribute('fill', 'none'); bsfLine.setAttribute('opacity', '0.7');
  svg.appendChild(bsfLine);

  // Dots (color matches BO legend: white=initial, green=BO, red=latest)
  traceDots = [];
  for (var i = 0; i < n; i++) {
    var isBest = bestSoFar[i] === rawY[i];
    var isInit = i < N_INIT, isLatest = i === n - 1;
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    var cx = sx(i), cy = sy(rawY[i]);
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    dot.setAttribute('r', isLatest ? '4' : '3');
    var baseColor = isLatest ? '255,68,68' : (isInit ? '255,255,255' : '100,255,100');
    dot.setAttribute('fill', 'rgba(' + baseColor + ',' + (isBest ? '0.95' : '0.5') + ')');
    dot.setAttribute('stroke', isBest ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)');
    dot.setAttribute('stroke-width', '1');
    svg.appendChild(dot);
    traceDots.push({ el: dot, idx: i, value: rawY[i], best: bestSoFar[i],
      isBest: isBest, isInit: isInit, isLatest: isLatest, baseColor: baseColor,
      cx: cx, cy: cy });
  }

  // Axis labels
  var xl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  xl.setAttribute('x', margin.left + pw/2); xl.setAttribute('y', H - 4);
  xl.setAttribute('fill', '#888'); xl.setAttribute('font-size', '10');
  xl.setAttribute('text-anchor', 'middle'); xl.textContent = 'trial';
  svg.appendChild(xl);

  // X ticks
  var xStep = Math.max(1, Math.ceil(n / 8));
  for (var i = 0; i < n; i += xStep) {
    var xt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xt.setAttribute('x', sx(i)); xt.setAttribute('y', margin.top + ph + 14);
    xt.setAttribute('fill', '#555'); xt.setAttribute('font-size', '8');
    xt.setAttribute('text-anchor', 'middle'); xt.textContent = String(i);
    svg.appendChild(xt);
  }

  // Legend
  var leg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var lr = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  lr.setAttribute('x1', margin.left + pw - 90); lr.setAttribute('x2', margin.left + pw - 76);
  lr.setAttribute('y1', margin.top + 10); lr.setAttribute('y2', margin.top + 10);
  lr.setAttribute('stroke', '#7c6ff7'); lr.setAttribute('stroke-width', '2');
  leg.appendChild(lr);
  var lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  lt.setAttribute('x', margin.left + pw - 73); lt.setAttribute('y', margin.top + 13);
  lt.setAttribute('fill', '#888'); lt.setAttribute('font-size', '9');
  lt.textContent = 'best so far';
  leg.appendChild(lt);
  svg.appendChild(leg);

  container.appendChild(svg);

  // ── Hover/click for trace panel ──
  var TRACE_HOVER_R = 10;
  function findNearestTrace(px, py) {
    var best = -1, bestD = TRACE_HOVER_R;
    for (var i = 0; i < traceDots.length; i++) {
      var dx = px - traceDots[i].cx, dy = py - traceDots[i].cy;
      var d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  container.addEventListener('mousemove', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var hit = findNearestTrace(px, py);
    var activeIdx = pinnedTrainIdx;
    if (activeIdx === -1 && hit >= 0) { activeIdx = hit; hoverNeighborIdx = hit; }
    else if (activeIdx === -1) { hoverNeighborIdx = -1; }

    if (hit >= 0) {
      var d = traceDots[hit];
      var typeLabel = d.isInit ? 'initial' : (d.isLatest ? 'latest' : 'BO iter ' + (d.idx - N_INIT + 1));
      var tt = document.getElementById('tooltip');
      var ttTitle = document.getElementById('tt-title');
      var ttBody = document.getElementById('tt-body');
      ttTitle.textContent = 'trial ' + d.idx;
      ttBody.innerHTML = '<span class="tt-val">y = ' + d.value.toFixed(4) + '</span><br>' +
        'best so far = ' + d.best.toFixed(4) + '<br>' +
        '<span class="tt-coord">x0</span> = ' + lastX[d.idx][0].toFixed(4) + '<br>' +
        '<span class="tt-coord">x1</span> = ' + lastX[d.idx][1].toFixed(4) + '<br>' +
        '<span style="color:#888">' + typeLabel + '</span>';
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px';
      container.style.cursor = 'pointer';
    } else {
      document.getElementById('tooltip').style.display = 'none';
      container.style.cursor = 'crosshair';
    }
    highlightTraceDots(activeIdx);
    drawOverlays(undefined, undefined, -1, activeIdx);
  });

  container.addEventListener('click', function(e) {
    var rect = container.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var hit = findNearestTrace(px, py);
    if (hit >= 0) { pinnedTrainIdx = (pinnedTrainIdx === hit) ? -1 : hit; }
    else { pinnedTrainIdx = -1; }
    var activeIdx = pinnedTrainIdx >= 0 ? pinnedTrainIdx : hoverNeighborIdx;
    highlightTraceDots(activeIdx);
    drawOverlays(undefined, undefined, -1, activeIdx);
  });

  container.addEventListener('mouseleave', function() {
    document.getElementById('tooltip').style.display = 'none';
    hoverNeighborIdx = -1;
    highlightTraceDots(pinnedTrainIdx);
    drawOverlays(undefined, undefined, -1, pinnedTrainIdx);
  });
}

function highlightTraceDots(activeIdx) {
  if (!traceDots.length || !lastPredictor) return;
  var activePt = (activeIdx >= 0 && activeIdx < lastX.length) ? lastX[activeIdx] : null;
  var rels = null, maxRel = 0;
  if (activePt) {
    rels = [];
    for (var i = 0; i < traceDots.length; i++) {
      if (i === activeIdx) { rels.push(1); continue; }
      var r = lastPredictor.kernelCorrelation(lastX[i], activePt, 'y');
      rels.push(r);
      if (r > maxRel) maxRel = r;
    }
  }
  for (var i = 0; i < traceDots.length; i++) {
    var d = traceDots[i];
    if (activePt) {
      if (i === activeIdx) {
        d.el.setAttribute('fill', 'rgba(255,80,80,0.95)');
        d.el.setAttribute('stroke', 'rgba(255,255,255,1)');
        d.el.setAttribute('stroke-width', '2'); d.el.setAttribute('r', '5');
      } else {
        var relNorm = maxRel > 0 ? rels[i] / maxRel : 0;
        var fa = Math.max(0.08, Math.min(0.90, Math.sqrt(relNorm)));
        d.el.setAttribute('fill', 'rgba(' + d.baseColor + ',' + fa.toFixed(3) + ')');
        d.el.setAttribute('stroke', 'rgba(255,255,255,' + Math.max(0.15, fa * 0.6).toFixed(3) + ')');
        d.el.setAttribute('stroke-width', '1'); d.el.setAttribute('r', d.isLatest ? '4' : '3');
      }
    } else {
      d.el.setAttribute('fill', 'rgba(' + d.baseColor + ',' + (d.isBest ? '0.95' : '0.5') + ')');
      d.el.setAttribute('stroke', d.isBest ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)');
      d.el.setAttribute('stroke-width', '1'); d.el.setAttribute('r', d.isLatest ? '4' : '3');
    }
  }
}

function updateInfo(iter, rawY, hp) {
  var best = Infinity;
  for (var i=0;i<rawY.length;i++) if(rawY[i]<best) best=rawY[i];
  var txt = 'Iteration <span>' + (iter+1) + '/' + N_ITER + '</span>';
  txt += ' | Best: <span>' + best.toFixed(4) + '</span>';
  txt += ' (global min ~ ' + curProblem.fmin.toFixed(4) + ')';
  txt += ' | n=' + rawY.length;
  txt += '<br>ls: [' + hp.ls[0].toFixed(3) + ', ' + hp.ls[1].toFixed(3) + ']';
  txt += ' | outputscale: ' + hp.os.toFixed(3);
  txt += ' | noise: ' + hp.nv.toExponential(1);
  document.getElementById('info').innerHTML = txt;
}

// ── BO state machine ──
var boState = null;  // {X, rawY, hp, rng, seed, iter}

function boInit() {
  pinnedTrainIdx = -1;
  renderTrueFunction();
  var seed = (Math.random() * 4294967296) >>> 0;
  var rng = new Rng(seed);
  var X = [], rawY = [];
  for (var i = 0; i < N_INIT; i++) {
    var pt = [rng.uniform(), rng.uniform()];
    X.push(pt); rawY.push(curProblem.fn(pt[0], pt[1]));
  }
  var hp = fitGP(X, rawY);
  hp.yStd = rawY.map(function(y) { return (y - hp.ymean) / hp.ystd; });
  boState = { X: X, rawY: rawY, hp: hp, rng: rng, seed: seed, iter: 0 };
  boRender(hp);
  document.getElementById('status').innerHTML =
    'Initialized (' + N_INIT + ' random points, seed: ' + seed + ')';
}

function boStep() {
  if (!boState) boInit();
  var s = boState;
  var next = thompsonSampleRFF(s.X, s.hp, s.rng);
  if (!next) { next = [s.rng.uniform(), s.rng.uniform()]; }
  s.X.push(next); s.rawY.push(curProblem.fn(next[0], next[1]));
  s.hp = fitGP(s.X, s.rawY);
  s.hp.yStd = s.rawY.map(function(y) { return (y - s.hp.ymean) / s.hp.ystd; });
  s.iter++;
  boRender(s.hp);
  var best = Infinity;
  for (var i = 0; i < s.rawY.length; i++) if (s.rawY[i] < best) best = s.rawY[i];
  document.getElementById('status').innerHTML =
    'Iter <span>' + s.iter + '</span> | n=' + s.rawY.length +
    ' | Best: <span>' + best.toFixed(4) + '</span>';
}

function boRender(hp) {
  var s = boState;
  var ms = buildModelState(s.X, s.rawY, hp);
  var model = loadModel(ms);
  renderPosterior(model, s.X, s.rawY, hp);
  lastX = s.X; lastRawY = s.rawY;
  lastPredictor = new Predictor({
    search_space: {parameters: [{name:'x0',type:'range',bounds:[0,1]},{name:'x1',type:'range',bounds:[0,1]}]},
    model_state: ms, outcome_names: ['y']
  });
  renderLOO();
  renderTrace();
  updateInfo(s.iter - 1, s.rawY, hp);
}

function boReset() {
  boState = null;
  running = false;
  pinnedTrainIdx = -1;
  lastX = null; lastRawY = null; lastPredictor = null;
  traceDots = [];
  renderTrueFunction();
  ctxM.clearRect(0, 0, CN, CN); ctxS.clearRect(0, 0, CN, CN);
  ctxOM.clearRect(0, 0, CN, CN); ctxOS.clearRect(0, 0, CN, CN);
  ctxLOO.clearRect(0, 0, CN, CN);
  document.getElementById('traceContainer').innerHTML = '';
  document.getElementById('mlo').textContent = '--';
  document.getElementById('mhi').textContent = '--';
  document.getElementById('shi').textContent = '--';
  document.getElementById('looStats').textContent = '--';
  document.getElementById('info').innerHTML = '';
  document.getElementById('statline').innerHTML = 'hover over posterior maps to inspect';
  document.getElementById('status').innerHTML = 'Click Iterate to step through, or Run All for animation';
  document.getElementById('btnStep').disabled = false;
  document.getElementById('btnRun').disabled = false;
  document.getElementById('selProblem').disabled = false;
}

function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function runAll() {
  if (running) return;
  running = true;
  document.getElementById('btnStep').disabled = true;
  document.getElementById('btnRun').disabled = true;
  document.getElementById('selProblem').disabled = true;
  if (!boState) boInit();
  for (var i = 0; i < N_ITER; i++) {
    if (!running) break;
    boStep();
    await delay(DELAY_MS);
  }
  running = false;
  document.getElementById('btnStep').disabled = false;
  document.getElementById('btnRun').disabled = false;
  document.getElementById('selProblem').disabled = false;
}

document.getElementById('btnStep').addEventListener('click', function() { if (!running) boStep(); });
document.getElementById('btnRun').addEventListener('click', runAll);
document.getElementById('btnReset').addEventListener('click', boReset);
</script>
</body>
</html>`;


// Write all demos
writeFileSync(join(__dirname, 'slice_plot.html'), slicePlot);
writeFileSync(join(__dirname, 'response_surface.html'), responseSurface);
writeFileSync(join(__dirname, 'radar.html'), radar);
writeFileSync(join(__dirname, 'scatteroid.html'), scatteroid);
writeFileSync(join(__dirname, 'point_proximity.html'), pointProximity);
writeFileSync(join(__dirname, 'cross_validation.html'), crossValidation);
writeFileSync(join(__dirname, 'feature_importance.html'), featureImportance);
writeFileSync(join(__dirname, 'optimization_trace.html'), optimizationTrace);
writeFileSync(join(__dirname, 'bayesian_optimization.html'), bayesianOptimization);

console.log('Built 9 self-contained demo HTML files:');
console.log('  demo/slice_plot.html');
console.log('  demo/response_surface.html');
console.log('  demo/radar.html');
console.log('  demo/scatteroid.html');
console.log('  demo/point_proximity.html');
console.log('  demo/cross_validation.html');
console.log('  demo/feature_importance.html');
console.log('  demo/optimization_trace.html');
console.log('  demo/bayesian_optimization.html');
