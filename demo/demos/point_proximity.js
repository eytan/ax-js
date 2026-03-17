import { libraryScript, sharedColormapScript, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
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
var Predictor = Ax.Predictor;

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
}
