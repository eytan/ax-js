import { libraryScript, vizScript, axHomeLink, axFavicon } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Preferential Bayesian Optimization</title>
${axFavicon}
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #fff; color: #1a1a1a;
    padding: 2rem; min-height: 100vh;
  }
  h1 { font-size: 18px; font-weight: 500; color: #111; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #666; margin-bottom: 16px; }
  .controls { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
  button {
    font-size: 13px; padding: 6px 16px;
    border-radius: 6px; border: 0.5px solid #d0d0d0;
    background: #fff; color: #333; cursor: pointer; outline: none;
  }
  select {
    font-size: 13px; padding: 5px 10px;
    border-radius: 6px; border: 0.5px solid #d0d0d0;
    background: #fff; color: #333; cursor: pointer; outline: none;
  }
  button:hover, select:hover { background: #f0f0f0; }
  button:disabled { opacity: 0.4; cursor: default; }
  .status { font-size: 13px; color: #666; }
  .status span { font-weight: 500; color: #333; }
  .main-row { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  .panel { display: flex; flex-direction: column; gap: 6px; }
  .panel-title { font-size: 12px; color: #666; text-align: center; letter-spacing: 0.04em; }
  canvas.heatmap {
    display: block; border-radius: 6px;
    border: 0.5px solid #d0d0d0;
  }
  .cbrow { display: flex; align-items: center; gap: 6px; }
  .cblbl { font-size: 11px; color: #666; min-width: 40px; }
  canvas.cbar { height: 16px; flex: 1; border-radius: 4px; }

  /* Slice sliders */
  .slice-row {
    display: flex; gap: 20px; align-items: center; margin-bottom: 14px;
    flex-wrap: wrap; padding: 8px 12px;
    background: #f5f5f5; border-radius: 8px; border: 0.5px solid #e0e0e0;
  }
  .slice-row label { font-size: 12px; color: #666; display: flex; align-items: center; gap: 6px; }
  .slice-row input[type=range] { width: 120px; accent-color: #4872f9; }
  .slice-row .slice-val { font-size: 11px; color: #555; min-width: 36px; }
  .slice-row .slice-name { font-size: 10px; color: #999; margin-left: 2px; }

  /* Comparison panel */
  .comparison-panel {
    background: #f5f5f5; border-radius: 10px; border: 0.5px solid #e0e0e0;
    padding: 20px; width: 440px;
  }
  .comparison-header { font-size: 14px; color: #555; text-align: center; margin-bottom: 12px; }
  .comparison-options { display: flex; gap: 16px; justify-content: center; }
  .option-card {
    cursor: pointer; border-radius: 8px; border: 2px solid #d0d0d0;
    padding: 8px; transition: border-color 0.15s, transform 0.1s;
    text-align: center;
  }
  .option-card:hover { border-color: #999; transform: translateY(-2px); }
  .option-card.selected { border-color: #4d9221; }
  .option-card canvas { display: block; border-radius: 4px; }
  .option-label { font-size: 12px; color: #666; margin-top: 6px; }
  .option-coords { font-size: 10px; color: #999; margin-top: 2px; }
  .waiting-msg { font-size: 13px; color: #999; text-align: center; padding: 60px 0; }

  /* History */
  .history-panel {
    background: #f5f5f5; border-radius: 10px; border: 0.5px solid #e0e0e0;
    padding: 16px; max-height: 360px; overflow-y: auto; min-width: 300px;
  }
  .history-item {
    display: flex; align-items: center; gap: 8px; padding: 4px 0;
    font-size: 12px; color: #666; border-bottom: 0.5px solid #e0e0e0;
  }
  .history-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .history-winner { color: #4d9221; font-weight: 500; }
  .history-loser { color: #999; }

  /* Convergence */
  .convergence-panel {
    background: #f5f5f5; border-radius: 10px; border: 0.5px solid #e0e0e0;
    padding: 12px;
  }

  .bottom-row { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; margin-top: 16px; }
  .info { font-size: 13px; color: #666; margin-top: 14px; line-height: 1.8; }
  .info span { font-weight: 500; color: #333; }

  #tooltip {
    position: fixed; display: none;
    background: rgba(255,255,255,0.97); border: 0.5px solid #d0d0d0;
    border-radius: 7px; padding: 9px 13px;
    font-size: 12px; color: #333;
    pointer-events: none; z-index: 100;
    line-height: 1.8; white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  }
</style>
</head>
<body>

<h1>${axHomeLink}Preferential Bayesian Optimization</h1>
<p class="subtitle">Pick whichever pattern you find more beautiful — the model learns your aesthetic preferences in 4D</p>

<div class="controls">
  <select id="selMode">
    <option value="human" selected>Human Mode</option>
    <option value="auto">Auto Mode</option>
  </select>
  <select id="selStimulus">
    <option value="plasma_wave">Plasma Waves</option>
    <option value="op_art">Op Art</option>
    <option value="kaleidoscope">Kaleidoscope</option>
    <option value="nebula">Nebula</option>
    <option value="interference">Interference</option>
    <option value="terrain">Terrain</option>
  </select>
  <select id="selTestFn" style="display:none">
    <option value="branin" selected>Branin</option>
    <option value="camel">Six-Hump Camel</option>
    <option value="ackley">Ackley</option>
    <option value="rosenbrock">Rosenbrock</option>
  </select>
  <select id="selQuery">
    <option value="eubo" selected>EUBO</option>
    <option value="maxmean_maxvar">MaxMean vs MaxVar</option>
  </select>
  <button id="btnStep">Step</button>
  <button id="btnRun">Run All</button>
  <button id="btnReset" style="color:#888">Reset</button>
  <span class="status" id="status">Choose which you prefer</span>
</div>

<div class="slice-row" id="sliceRow">
  <label>
    <span id="sliceLbl2">x2</span>
    <input type="range" id="sliceR2" min="0" max="100" value="50">
    <span class="slice-val" id="sliceV2">0.50</span>
    <span class="slice-name" id="sliceN2"></span>
  </label>
  <label>
    <span id="sliceLbl3">x3</span>
    <input type="range" id="sliceR3" min="0" max="100" value="50">
    <span class="slice-val" id="sliceV3">0.50</span>
    <span class="slice-name" id="sliceN3"></span>
  </label>
</div>

<div class="main-row">
  <div class="panel">
    <div class="panel-title">comparison</div>
    <div class="comparison-panel" id="compPanel">
      <div class="waiting-msg" id="waitingMsg">Loading first pair...</div>
      <div id="compContent" style="display:none">
        <div class="comparison-header" id="compHeader">Which do you prefer?</div>
        <div class="comparison-options">
          <div class="option-card" id="optA" tabindex="0">
            <canvas id="cvA" width="180" height="180"></canvas>
            <div class="option-label">Option A</div>
            <div class="option-coords" id="coordsA"></div>
          </div>
          <div class="option-card" id="optB" tabindex="0">
            <canvas id="cvB" width="180" height="180"></canvas>
            <div class="option-label">Option B</div>
            <div class="option-coords" id="coordsB"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">utility mean (x0 vs x1 slice)</div>
    <canvas id="cvMean" class="heatmap" width="320" height="320"></canvas>
    <div class="cbrow">
      <span class="cblbl" id="mlo">--</span>
      <canvas id="cbMean" class="cbar"></canvas>
      <span class="cblbl" id="mhi" style="text-align:right">--</span>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">uncertainty (x0 vs x1 slice)</div>
    <canvas id="cvVar" class="heatmap" width="320" height="320"></canvas>
    <div class="cbrow">
      <span class="cblbl">0.00</span>
      <canvas id="cbVar" class="cbar"></canvas>
      <span class="cblbl" id="vhi" style="text-align:right">--</span>
    </div>
  </div>
</div>

<div class="bottom-row">
  <div class="panel">
    <div class="panel-title">learning progress</div>
    <div class="convergence-panel">
      <canvas id="cvConv" class="heatmap" width="320" height="280"></canvas>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">comparison history</div>
    <div class="history-panel" id="historyPanel">
      <div style="font-size:12px;color:#555;text-align:center;padding:20px">No comparisons yet</div>
    </div>
  </div>
</div>

<div class="info" id="info"></div>
<div id="tooltip"></div>
<canvas id="cvPreview" width="120" height="120" style="display:none"></canvas>

${libraryScript()}
${vizScript()}

<script>
var loadModel = Ax.loadModel;
var D = 4; // Number of dimensions
var CN = 320, GS = 80, N_EUBO_PAIRS = 200, DELAY_MS = 150;
var running = false, waitingForHuman = false;

// ══════════════════════════════════════════════
// PRNG (xoshiro128**)
// ══════════════════════════════════════════════
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
Rng.prototype.randInt = function(n) {
  return Math.floor(this.uniform() * n);
};

// Generate D-dimensional random point in [0,1]^D
function randPoint(rng) {
  var pt = [];
  for (var i = 0; i < D; i++) pt.push(rng.uniform());
  return pt;
}

// ══════════════════════════════════════════════
// Cholesky (flat Float64Array, n*n)
// ══════════════════════════════════════════════
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
function cholMulL(L, v, n) {
  var out = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    var s = 0;
    for (var j = 0; j <= i; j++) s += L[i*n+j] * v[j];
    out[i] = s;
  }
  return out;
}

// ══════════════════════════════════════════════
// RBF kernel (D-dimensional, flat n*n)
// ══════════════════════════════════════════════
function rbfKernel(X, n, ls, os) {
  var K = new Float64Array(n*n);
  var nDim = ls.length;
  for (var i = 0; i < n; i++) {
    for (var j = i; j < n; j++) {
      var d2 = 0;
      for (var dd = 0; dd < nDim; dd++) {
        var diff = (X[i][dd] - X[j][dd]) / ls[dd];
        d2 += diff * diff;
      }
      var k = os * Math.exp(-0.5 * d2);
      K[i*n+j] = k; K[j*n+i] = k;
    }
  }
  return K;
}

// ══════════════════════════════════════════════
// Normal CDF/PDF (ported from src/acquisition/normal.ts)
// ══════════════════════════════════════════════
var SQRT2 = Math.SQRT2, SQRT2PI = Math.sqrt(2*Math.PI);

function normalPdf(x) { return Math.exp(-0.5*x*x) / SQRT2PI; }

function erf(x) {
  var x2 = x*x, sum = 1, term = 1;
  for (var k = 1; k <= 20; k++) { term *= -x2/k; sum += term/(2*k+1); }
  return (2/Math.sqrt(Math.PI)) * x * sum;
}

function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 0.5) return 1 - erf(x);
  var t = 2/(2+x), ty = 4*t - 2;
  var c = [-1.3026537197817094,6.4196979235649026e-1,1.9476473204185836e-2,
    -9.561514786808631e-3,-9.46595344482036e-4,3.66839497852761e-4,
    4.2523324806907e-5,-2.0278578112534e-5,-1.624290004647e-6,
    1.303655835580e-6,1.5626441722e-8,-8.5238095915e-8,
    6.529054439e-9,5.059343495e-9,-9.91364156e-10,
    -2.27365122e-10,9.6467911e-11,2.394038e-12,
    -6.886027e-12,8.94487e-13,3.13092e-13,
    -1.12708e-13,3.81e-16,7.106e-15,
    -1.523e-15,-9.4e-17,1.21e-16,-2.8e-17];
  var d = 0, dd = 0;
  for (var j = c.length-1; j > 0; j--) { var tmp = d; d = ty*d - dd + c[j]; dd = tmp; }
  return t * Math.exp(-x*x + 0.5*(c[0]+ty*d) - dd);
}

function normalCdf(x) { return 0.5 * erfc(-x/SQRT2); }

// ══════════════════════════════════════════════
// Probit log-likelihood + gradient + Hessian
// ══════════════════════════════════════════════
function probitLogLik(f, comparisons) {
  var n = f.length;
  var loglik = 0;
  var grad = new Float64Array(n);
  var hess = new Float64Array(n*n);
  for (var c = 0; c < comparisons.length; c++) {
    var wi = comparisons[c][0], li = comparisons[c][1];
    var z = f[wi] - f[li];
    var cdfZ = normalCdf(z);
    if (cdfZ < 1e-30) cdfZ = 1e-30;
    var pdfZ = normalPdf(z);
    var ratio = pdfZ / cdfZ;
    loglik += Math.log(cdfZ);
    grad[wi] += ratio;
    grad[li] -= ratio;
    var h = -ratio * (ratio + z);
    hess[wi*n+wi] += h;
    hess[li*n+li] += h;
    hess[wi*n+li] -= h;
    hess[li*n+wi] -= h;
  }
  return { loglik: loglik, grad: grad, hess: hess };
}

// ══════════════════════════════════════════════
// Laplace MAP estimation
// ══════════════════════════════════════════════
function laplaceMAP(K, n, comparisons, fInit) {
  var LK = chol(K, n);
  if (!LK) return null;
  var f = fInit ? fInit.slice() : new Float64Array(n);

  for (var iter = 0; iter < 30; iter++) {
    var Kinv_f = cholSolve(LK, f, n);
    var lik = probitLogLik(f, comparisons);
    var grad = new Float64Array(n);
    for (var i = 0; i < n; i++) grad[i] = -Kinv_f[i] + lik.grad[i];
    // negH = K^{-1} - lik.hess  (negative Hessian, positive definite at MAP)
    var negH = new Float64Array(n*n);
    for (var c = 0; c < n; c++) {
      var e = new Float64Array(n); e[c] = 1;
      var col = cholSolve(LK, e, n);
      for (var r = 0; r < n; r++) negH[r*n+c] = col[r];
    }
    for (var i = 0; i < n*n; i++) negH[i] -= lik.hess[i];
    var LH = chol(negH, n);
    if (!LH) break;
    var delta = cholSolve(LH, grad, n);
    // Line search
    var stepSize = 1.0;
    var likOld = probitLogLik(f, comparisons);
    var objOld = likOld.loglik;
    for (var i = 0; i < n; i++) objOld -= 0.5 * f[i] * Kinv_f[i];
    for (var ls2 = 0; ls2 < 10; ls2++) {
      var fNew = new Float64Array(n);
      for (var i = 0; i < n; i++) fNew[i] = f[i] + stepSize * delta[i];
      var KinvNew = cholSolve(LK, fNew, n);
      var likNew = probitLogLik(fNew, comparisons);
      var objNew = likNew.loglik;
      for (var i = 0; i < n; i++) objNew -= 0.5 * fNew[i] * KinvNew[i];
      if (objNew >= objOld - 1e-8) break;
      stepSize *= 0.5;
    }
    var maxDelta = 0;
    for (var i = 0; i < n; i++) {
      f[i] += stepSize * delta[i];
      var ad = Math.abs(stepSize * delta[i]);
      if (ad > maxDelta) maxDelta = ad;
    }
    if (maxDelta < 1e-6) break;
  }
  var finalLik = probitLogLik(f, comparisons);
  return { utility: f, likelihoodHess: finalLik.hess };
}

// ══════════════════════════════════════════════
// Build PairwiseGPModelState for Ax.loadModel()
// ══════════════════════════════════════════════
function buildPairwiseModelState(X, utility, likelihoodHess, ls, os) {
  var n = X.length;
  var hess2d = [];
  for (var i = 0; i < n; i++) {
    var row = [];
    for (var j = 0; j < n; j++) row.push(likelihoodHess[i*n+j]);
    hess2d.push(row);
  }
  var offset = [], coeff = [];
  for (var i = 0; i < D; i++) { offset.push(0); coeff.push(1); }
  return {
    model_type: "PairwiseGP",
    train_X: X,
    utility: Array.from(utility),
    likelihood_hess: hess2d,
    kernel: { type: "Scale", outputscale: os, base_kernel: { type: "RBF", lengthscale: ls } },
    mean_constant: 0,
    input_transform: { offset: offset, coefficient: coeff }
  };
}

// ══════════════════════════════════════════════
// Test functions (2D — auto mode uses x0,x1 only)
// In 4D, dims 2-3 are irrelevant; the model should learn this
// ══════════════════════════════════════════════
var PROBLEMS = {
  branin: {
    name: 'Branin',
    fn: function(p) {
      var x0 = p[0], x1 = p[1];
      var X0 = 15*x0-5, X1 = 15*x1;
      var b = 5.1/(4*Math.PI*Math.PI), c = 5/Math.PI, t = 1/(8*Math.PI);
      return -(Math.pow(X1-b*X0*X0+c*X0-6,2)+10*(1-t)*Math.cos(X0)+10);
    }
  },
  camel: {
    name: 'Six-Hump Camel',
    fn: function(p) {
      var X0 = 6*p[0]-3, X1 = 4*p[1]-2;
      return -((4-2.1*X0*X0+X0*X0*X0*X0/3)*X0*X0+X0*X1+(-4+4*X1*X1)*X1*X1);
    }
  },
  ackley: {
    name: 'Ackley',
    fn: function(p) {
      var X0 = 10*p[0]-5, X1 = 10*p[1]-5;
      return -(-20*Math.exp(-0.2*Math.sqrt(0.5*(X0*X0+X1*X1)))
        -Math.exp(0.5*(Math.cos(2*Math.PI*X0)+Math.cos(2*Math.PI*X1)))+Math.E+20);
    }
  },
  rosenbrock: {
    name: 'Rosenbrock',
    fn: function(p) {
      var X0 = 4*p[0]-2, X1 = 4*p[1]-2;
      return -((1-X0)*(1-X0)+100*(X1-X0*X0)*(X1-X0*X0));
    }
  }
};

// ══════════════════════════════════════════════
// Stimulus renderers (human mode)
// Each takes (ctx, w, h, params) where params is array of D values in [0,1]
// ══════════════════════════════════════════════
function getP(p, i) { return (p && i < p.length) ? p[i] : 0.5; }

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  var c = (1 - Math.abs(2*l - 1)) * s;
  var x = c * (1 - Math.abs((h/60) % 2 - 1));
  var m = l - c/2;
  var r, g, b;
  if (h < 60)       { r=c; g=x; b=0; }
  else if (h < 120) { r=x; g=c; b=0; }
  else if (h < 180) { r=0; g=c; b=x; }
  else if (h < 240) { r=0; g=x; b=c; }
  else if (h < 300) { r=x; g=0; b=c; }
  else              { r=c; g=0; b=x; }
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
}

// Parameter names per stimulus (for slider labels)
var PARAM_LABELS = {
  plasma_wave: ['hue shift', 'wave complexity', 'zoom', 'saturation'],
  op_art: ['warp intensity', 'grid density', 'color scheme', 'warp center'],
  kaleidoscope: ['symmetry', 'color rotation', 'inner detail', 'brightness'],
  nebula: ['cloud structure', 'temperature', 'star density', 'cloud density'],
  interference: ['freq ratio', 'separation', 'grating style', 'color mode'],
  terrain: ['roughness', 'biome', 'sea level', 'elevation']
};

var STIMULI = {
  plasma_wave: function(ctx, w, h, p) {
    var hueShift = getP(p, 0) * 360;
    var complexity = 1 + getP(p, 1) * 6;
    var zoom = 0.5 + getP(p, 2) * 2;
    var sat = 0.4 + getP(p, 3) * 0.6;
    var img = ctx.createImageData(w, h);
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var nx = px / w * zoom, ny = py / h * zoom;
        var v = Math.sin(nx * complexity * 3.1 + ny * 1.7)
              + Math.sin(ny * complexity * 2.3 - nx * 2.9)
              + Math.sin((nx + ny) * complexity * 1.5)
              + Math.sin(Math.sqrt(nx*nx*4 + ny*ny*9) * complexity);
        var t = (v / 4) * 0.5 + 0.5;
        var hue = (t * 240 + hueShift) % 360;
        var rgb = hsl2rgb(hue, sat, 0.35 + t * 0.35);
        var idx = (py*w+px)*4;
        img.data[idx] = rgb[0]; img.data[idx+1] = rgb[1]; img.data[idx+2] = rgb[2]; img.data[idx+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  op_art: function(ctx, w, h, p) {
    var warpAmt = getP(p, 0) * 3;
    var gridFreq = 4 + getP(p, 1) * 16;
    var hueBase = getP(p, 2) * 360;
    var wcx = 0.3 + getP(p, 3) * 0.4, wcy = 0.3 + getP(p, 3) * 0.4;
    var img = ctx.createImageData(w, h);
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var nx = px / w - wcx, ny = py / h - wcy;
        var r = Math.sqrt(nx*nx + ny*ny);
        var warp = warpAmt * Math.sin(r * 8) / (r + 0.3);
        var wx = nx + warp * nx, wy = ny + warp * ny;
        var cx = Math.sin(wx * gridFreq * Math.PI);
        var cy = Math.sin(wy * gridFreq * Math.PI);
        var check = cx * cy > 0 ? 1 : 0;
        var glow = Math.exp(-r * r * 4) * 0.3;
        var t = check * (0.7 + glow) + glow;
        var rgb = hsl2rgb(hueBase + t * 60, 0.6, t * 0.5 + 0.1);
        var idx = (py*w+px)*4;
        img.data[idx] = rgb[0]; img.data[idx+1] = rgb[1]; img.data[idx+2] = rgb[2]; img.data[idx+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  kaleidoscope: function(ctx, w, h, p) {
    var folds = Math.floor(3 + getP(p, 0) * 7);
    var colorRot = getP(p, 1) * 360;
    var innerFreq = 2 + getP(p, 2) * 8;
    var bright = 0.3 + getP(p, 3) * 0.4;
    var img = ctx.createImageData(w, h);
    var cx = w/2, cy = h/2, maxR = Math.min(w, h) * 0.5;
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var dx = px - cx, dy = py - cy;
        var r = Math.sqrt(dx*dx + dy*dy) / maxR;
        var theta = Math.atan2(dy, dx);
        var seg = ((theta / Math.PI * folds) % 2 + 2) % 2;
        if (seg > 1) seg = 2 - seg;
        var v = Math.sin(seg * innerFreq * Math.PI) * Math.cos(r * innerFreq * 2)
              + Math.sin(r * 6 + seg * 3) * 0.5;
        var t = v * 0.5 + 0.5;
        var hue = (seg * 120 + r * 180 + colorRot) % 360;
        var fade = Math.max(0, 1 - r * 1.1);
        var rgb = hsl2rgb(hue, 0.7 * fade, bright * t * fade + 0.05);
        var idx = (py*w+px)*4;
        img.data[idx] = rgb[0]; img.data[idx+1] = rgb[1]; img.data[idx+2] = rgb[2]; img.data[idx+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  nebula: function(ctx, w, h, p) {
    var structure = 1 + getP(p, 0) * 5;
    var temp = getP(p, 1);
    var starDensity = getP(p, 2);
    var cloudDensity = 0.3 + getP(p, 3) * 0.7;
    var img = ctx.createImageData(w, h);
    function noise(x, y) {
      return Math.sin(x*1.7+y*2.3)*0.5+Math.sin(x*3.1-y*1.9)*0.25
            +Math.sin(x*5.7+y*4.3)*0.125+Math.sin(x*11.3-y*7.1)*0.0625;
    }
    var starSeed = Math.floor(starDensity * 1000);
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var nx = px/w*structure, ny = py/h*structure;
        var n = noise(nx, ny) + noise(nx*2.1+3.7, ny*1.8+2.1)*0.5;
        n = (n + 1) * 0.5;
        var cloud = Math.pow(Math.max(0, n), 0.8) * cloudDensity;
        var r0, g0, b0;
        if (temp < 0.33) {
          r0 = 30 + cloud * 60; g0 = 20 + cloud * 40; b0 = 100 + cloud * 155;
        } else if (temp < 0.66) {
          r0 = 40 + cloud * 100; g0 = 80 + cloud * 100; b0 = 80 + cloud * 100;
        } else {
          r0 = 120 + cloud * 135; g0 = 40 + cloud * 80; b0 = 60 + cloud * 80;
        }
        var sx = (px * 127 + py * 311 + starSeed) % 997;
        var star = (sx < starDensity * 30) ? Math.pow(sx / 30, 2) * 3 : 0;
        var idx = (py*w+px)*4;
        img.data[idx] = Math.min(255, Math.floor(r0 + star * 200));
        img.data[idx+1] = Math.min(255, Math.floor(g0 + star * 200));
        img.data[idx+2] = Math.min(255, Math.floor(b0 + star * 200));
        img.data[idx+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  interference: function(ctx, w, h, p) {
    var freqRatio = 0.8 + getP(p, 0) * 0.4;
    var sep = getP(p, 1) * 0.5;
    var style = getP(p, 2);
    var colorMode = getP(p, 3);
    var f1 = 8 + style * 25;
    var f2 = f1 * freqRatio;
    var img = ctx.createImageData(w, h);
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var nx = px/w, ny = py/h;
        var d1 = Math.sqrt((nx-0.5)*(nx-0.5) + (ny-0.5)*(ny-0.5));
        var d2 = Math.sqrt((nx-0.5-sep)*(nx-0.5-sep) + (ny-0.5+sep*0.3)*(ny-0.5+sep*0.3));
        var g1 = (Math.cos(d1 * f1 * Math.PI * 2) + 1) * 0.5;
        var g2 = (Math.cos(d2 * f2 * Math.PI * 2) + 1) * 0.5;
        var v = g1 * g2;
        var hue = colorMode * 300 + v * 60;
        var rgb = hsl2rgb(hue, 0.5 + v * 0.3, v * 0.6 + 0.1);
        var idx = (py*w+px)*4;
        img.data[idx] = rgb[0]; img.data[idx+1] = rgb[1]; img.data[idx+2] = rgb[2]; img.data[idx+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  terrain: function(ctx, w, h, p) {
    var roughness = 1 + getP(p, 0) * 5;
    var palette = getP(p, 1);
    var seaLevel = 0.2 + getP(p, 2) * 0.4;
    var mountainH = 0.5 + getP(p, 3) * 0.5;
    var img = ctx.createImageData(w, h);
    function fbm(x, y) {
      var v = 0, amp = 1, freq = roughness;
      for (var o = 0; o < 5; o++) {
        v += amp * (Math.sin(x*freq*1.3+y*freq*0.7+o*5.1)*0.5
                   +Math.sin(x*freq*0.8-y*freq*1.4+o*3.7)*0.5);
        freq *= 2; amp *= 0.5;
      }
      return (v + 1) * 0.5 * mountainH;
    }
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var elev = fbm(px/w, py/h);
        var r, g, b;
        if (elev < seaLevel) {
          var d = elev / seaLevel;
          r = Math.floor(20 + d * 30); g = Math.floor(40 + d * 80); b = Math.floor(120 + d * 80);
        } else {
          var t = (elev - seaLevel) / (1 - seaLevel);
          if (palette < 0.33) {
            r = Math.floor(30 + t * 180); g = Math.floor(120 - t * 60); b = Math.floor(30 + t * 100);
          } else if (palette < 0.66) {
            r = Math.floor(180 + t * 75); g = Math.floor(150 - t * 40); b = Math.floor(80 + t * 120);
          } else {
            r = Math.floor(150 + t * 100); g = Math.floor(160 + t * 80); b = Math.floor(180 + t * 60);
          }
        }
        var idx = (py*w+px)*4;
        img.data[idx] = Math.min(255, r); img.data[idx+1] = Math.min(255, g);
        img.data[idx+2] = Math.min(255, b); img.data[idx+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
};

// ══════════════════════════════════════════════
// Query selection strategies (D-dimensional)
// ══════════════════════════════════════════════
var N_CANDIDATES = 500;

function selectPairRandom(rng) {
  return [randPoint(rng), randPoint(rng)];
}

function selectPairMaxMeanVar(model, rng) {
  if (!model) return selectPairRandom(rng);
  var cands = [];
  for (var i = 0; i < N_CANDIDATES; i++) cands.push(randPoint(rng));
  try {
    var pred = model.predict(cands);
    var means = pred.mean, vars = pred.variance;
    var bestMeanIdx = 0, bestMean = -Infinity;
    for (var i = 0; i < N_CANDIDATES; i++) {
      if (isFinite(means[i]) && means[i] > bestMean) { bestMean = means[i]; bestMeanIdx = i; }
    }
    var bestVarIdx = -1, bestVar = -Infinity;
    for (var i = 0; i < N_CANDIDATES; i++) {
      if (i === bestMeanIdx) continue;
      if (isFinite(vars[i]) && vars[i] > bestVar) { bestVar = vars[i]; bestVarIdx = i; }
    }
    if (bestVarIdx < 0) bestVarIdx = (bestMeanIdx + 1) % N_CANDIDATES;
    return [cands[bestMeanIdx], cands[bestVarIdx]];
  } catch (e) {
    return selectPairRandom(rng);
  }
}

function selectPairEUBO(model, rng) {
  if (!model) return selectPairRandom(rng);
  var cands = [];
  for (var i = 0; i < N_CANDIDATES; i++) cands.push(randPoint(rng));
  try {
    var pred = model.predict(cands);
    var means = pred.mean, vars = pred.variance;
    var bestPair = [cands[0], cands[1]], bestEubo = -Infinity;
    var nSamples = 128;
    for (var pp = 0; pp < N_EUBO_PAIRS; pp++) {
      var ai = rng.randInt(N_CANDIDATES), bi;
      do { bi = rng.randInt(N_CANDIDATES); } while (bi === ai);
      var ma = means[ai], mb = means[bi];
      if (!isFinite(ma) || !isFinite(mb)) continue;
      var sa = Math.sqrt(Math.max(1e-10, vars[ai])), sb = Math.sqrt(Math.max(1e-10, vars[bi]));
      var eubo = 0;
      for (var s = 0; s < nSamples; s++) {
        var ua = ma + sa * rng.randn();
        var ub = mb + sb * rng.randn();
        eubo += Math.max(ua, ub);
      }
      eubo /= nSamples;
      if (eubo > bestEubo) { bestEubo = eubo; bestPair = [cands[ai], cands[bi]]; }
    }
    return bestPair;
  } catch (e) {
    return selectPairRandom(rng);
  }
}

// ══════════════════════════════════════════════
// Rendering
// ══════════════════════════════════════════════
var ctxMean = document.getElementById('cvMean').getContext('2d');
var ctxVar = document.getElementById('cvVar').getContext('2d');
var ctxConv = document.getElementById('cvConv').getContext('2d');

function renderHeatmap(ctx, vals, vmin, vrange, cfn) {
  var img = ctx.createImageData(CN, CN);
  var cellW = CN/GS, cellH = CN/GS;
  for (var k = 0; k < vals.length; k++) {
    var gi = k%GS, gj = Math.floor(k/GS);
    var t = Math.max(0, Math.min(1, (vals[k]-vmin)/vrange));
    var rgb = cfn(t);
    var x0 = Math.round(gi*cellW), y0 = Math.round(gj*cellH);
    var x1 = Math.round((gi+1)*cellW), y1 = Math.round((gj+1)*cellH);
    for (var py = y0; py < y1; py++) for (var px = x0; px < x1; px++) {
      var idx = (py*CN+px)*4;
      img.data[idx] = rgb[0]; img.data[idx+1] = rgb[1]; img.data[idx+2] = rgb[2]; img.data[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

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
  function lerp(a, b, level) { var d=b-a; return d===0?0.5:(level-a)/d; }
  var SEG = [
    [],[[2,3]],[[1,2]],[[1,3]],[[0,1]],null,[[0,2]],[[0,3]],
    [[0,3]],[[0,2]],null,[[0,1]],[[1,3]],[[1,2]],[[2,3]],[]
  ];
  for (var li = 1; li < nLevels; li++) {
    var level = vMin + vRange * li / nLevels;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.7;
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

// Compute opacity for a data point based on distance in slice dimensions (dims 2+)
function sliceOpacity(pt, sliceVals) {
  var d2 = 0;
  for (var dd = 2; dd < D; dd++) {
    var diff = (pt[dd] - sliceVals[dd - 2]) / currentLS[dd];
    d2 += diff * diff;
  }
  return Math.max(0.12, Math.exp(-0.5 * d2));
}

// Larger data dot for this demo (outerR=7, innerR=3.5 vs shared 5/2.5)
function drawLargeDot(ctx, x, y, alpha, isActive, isHovered, fillRGB) {
  if (alpha < 0.04) return;
  var outerR = (isActive || isHovered) ? 9 : 7;
  var innerR = (isActive || isHovered) ? 5 : 3.5;
  fillRGB = fillRGB || [255, 60, 60];
  ctx.beginPath(); ctx.arc(x, y, outerR, 0, 2 * Math.PI);
  ctx.strokeStyle = isActive ? 'rgba(68,68,68,1)'
    : 'rgba(68,68,68,' + Math.max(0.15, alpha * 0.6).toFixed(3) + ')';
  ctx.lineWidth = isActive ? 2.5 : (isHovered ? 2 : 1.5);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, innerR, 0, 2 * Math.PI);
  ctx.fillStyle = (isActive || isHovered)
    ? 'rgba(' + fillRGB[0] + ',' + fillRGB[1] + ',' + fillRGB[2] + ',1)'
    : 'rgba(' + fillRGB[0] + ',' + fillRGB[1] + ',' + fillRGB[2] + ',' + alpha.toFixed(3) + ')';
  ctx.fill();
}

function drawDataPoints(ctx, points, comparisons, bestIdx, sliceVals, activePinIdx, activeHoverIdx) {
  // Draw comparison edges — thick white lines with winner arrow
  for (var c = 0; c < comparisons.length; c++) {
    var wi = comparisons[c][0], li = comparisons[c][1];
    var oW = sliceOpacity(points[wi], sliceVals);
    var oL = sliceOpacity(points[li], sliceVals);
    var edgeO = Math.min(oW, oL);
    if (edgeO < 0.05) continue;
    var px1 = points[wi][0]*CN, py1 = (1-points[wi][1])*CN;
    var px2 = points[li][0]*CN, py2 = (1-points[li][1])*CN;
    ctx.strokeStyle = 'rgba(68,68,68,' + (edgeO * 0.55).toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
  }
  // Win/loss counts for coloring
  var wins = {}, losses = {};
  for (var c = 0; c < comparisons.length; c++) {
    wins[comparisons[c][0]] = (wins[comparisons[c][0]] || 0) + 1;
    losses[comparisons[c][1]] = (losses[comparisons[c][1]] || 0) + 1;
  }
  // Compute kernel-distance neighbor opacities when a point is pinned
  var neighborActiveIdx = (activePinIdx >= 0) ? activePinIdx : activeHoverIdx;
  var neighborRels = null, neighborMax = 0;
  if (neighborActiveIdx >= 0 && neighborActiveIdx < points.length) {
    var refPt = points[neighborActiveIdx];
    neighborRels = [];
    for (var ni = 0; ni < points.length; ni++) {
      if (ni === neighborActiveIdx) { neighborRels.push(1); continue; }
      // Kernel correlation: exp(-0.5 * sum((x_d - ref_d)^2 / ls_d^2))
      var kd2 = 0;
      for (var dd = 0; dd < Math.min(points[ni].length, currentLS.length); dd++) {
        var diff = points[ni][dd] - refPt[dd];
        var lsd = currentLS[dd];
        kd2 += (diff * diff) / (lsd * lsd);
      }
      var nr = Math.exp(-0.5 * kd2);
      neighborRels.push(nr);
      if (nr > neighborMax) neighborMax = nr;
    }
  }
  // Draw data points using shared drawDataDot
  // PiYG-derived dot colors for contrast against heatmaps
  // Winners: forest green [77,146,33], Losers: deep pink [197,27,125], Neutral: grey [110,110,120]
  for (var i = 0; i < points.length; i++) {
    var px = points[i][0]*CN, py = (1-points[i][1])*CN;
    var w = wins[i] || 0, l = losses[i] || 0;
    var rgb;
    if (w > l) rgb = [77, 146, 33];
    else if (l > w) rgb = [197, 27, 125];
    else rgb = [110, 110, 120];
    var isActive = (i === activePinIdx);
    var isHovered = (i === activeHoverIdx && i !== activePinIdx);
    var alpha;
    if (neighborActiveIdx >= 0) {
      if (i === neighborActiveIdx) alpha = 0.95;
      else {
        var relNorm = neighborMax > 0 ? neighborRels[i] / neighborMax : 0;
        alpha = Math.max(0.08, Math.min(0.90, Math.sqrt(relNorm)));
      }
    } else {
      alpha = sliceOpacity(points[i], sliceVals);
    }
    drawLargeDot(ctx, px, py, alpha, isActive, isHovered, rgb);
  }
  // Best point star
  if (bestIdx >= 0 && bestIdx < points.length) {
    var bAlpha = sliceOpacity(points[bestIdx], sliceVals);
    if (bAlpha > 0.1) {
      var bx = points[bestIdx][0]*CN, by = (1-points[bestIdx][1])*CN;
      ctx.save(); ctx.translate(bx, by); ctx.beginPath();
      for (var k = 0; k < 5; k++) {
        var a = -Math.PI/2 + k*2*Math.PI/5, b2 = a + Math.PI/5;
        ctx.lineTo(7*Math.cos(a), 7*Math.sin(a));
        ctx.lineTo(3*Math.cos(b2), 3*Math.sin(b2));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,0,' + (0.9*bAlpha).toFixed(2) + ')'; ctx.fill();
      ctx.strokeStyle = 'rgba(68,68,68,' + (0.8*bAlpha).toFixed(2) + ')'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
  }
  // Axis tick labels
  ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (var ti = 0; ti <= 4; ti++) {
    ctx.fillText((ti/4).toFixed(1), ti*CN/4 + 2, CN - 4);
    ctx.fillText((1-ti/4).toFixed(1), 4, ti*CN/4 + 14);
  }
}

// Cached grid values for hover lookups + cached heatmap ImageData for fast overlay redraws
var lastGridMeans = null, lastGridVars = null;
var cachedMeanImg = null, cachedVarImg = null;
var cachedBestIdx = -1;

function renderPosterior(model) {
  var sv = getSliceValues();
  var pts = [];
  for (var gj = 0; gj < GS; gj++) for (var gi = 0; gi < GS; gi++) {
    var pt = [gi/(GS-1), 1-gj/(GS-1)];
    for (var dd = 2; dd < D; dd++) pt.push(sv[dd - 2]);
    pts.push(pt);
  }
  var pred;
  try {
    pred = model.predict(pts);
  } catch (e) {
    console.error('predict failed:', e);
    return;
  }
  var means = pred.mean, vars = pred.variance;

  for (var i = 0; i < means.length; i++) {
    if (!isFinite(means[i])) means[i] = 0;
    if (!isFinite(vars[i])) vars[i] = 0;
  }
  lastGridMeans = means;
  lastGridVars = vars;

  // Mean heatmap
  var mMin = Infinity, mMax = -Infinity;
  for (var i = 0; i < means.length; i++) {
    if (means[i] < mMin) mMin = means[i];
    if (means[i] > mMax) mMax = means[i];
  }
  var mRange = mMax - mMin || 1;
  renderHeatmap(ctxMean, means, mMin, mRange, Ax.viz.viridis);
  drawContourLines(ctxMean, Array.from(means), GS, CN, mMin, mRange);
  cachedMeanImg = ctxMean.getImageData(0, 0, CN, CN);
  document.getElementById('mlo').textContent = mMin.toFixed(2);
  document.getElementById('mhi').textContent = mMax.toFixed(2);

  // Variance heatmap
  var stds = new Float64Array(vars.length), sMax = 0;
  for (var i = 0; i < vars.length; i++) { stds[i] = Math.sqrt(Math.max(0, vars[i])); if (stds[i] > sMax) sMax = stds[i]; }
  renderHeatmap(ctxVar, stds, 0, sMax || 1, Ax.viz.plasma);
  drawContourLines(ctxVar, Array.from(stds), GS, CN, 0, sMax || 1);
  cachedVarImg = ctxVar.getImageData(0, 0, CN, CN);
  document.getElementById('vhi').textContent = sMax.toFixed(3);

  // Find predicted best (reuse lastUtility to avoid extra predict call)
  cachedBestIdx = -1;
  if (lastUtility) {
    var bestMean = -Infinity;
    for (var i = 0; i < lastUtility.length; i++) {
      if (isFinite(lastUtility[i]) && lastUtility[i] > bestMean) { bestMean = lastUtility[i]; cachedBestIdx = i; }
    }
  }

  // Draw dots on top of cached heatmaps
  drawDotOverlays(sv);
}

// Lightweight: restore cached heatmap + redraw dots only (no model.predict)
function drawDotOverlays(sv) {
  if (!sv) sv = getSliceValues();
  if (cachedMeanImg) ctxMean.putImageData(cachedMeanImg, 0, 0);
  if (cachedVarImg) ctxVar.putImageData(cachedVarImg, 0, 0);
  drawDataPoints(ctxMean, allPoints, comparisons, cachedBestIdx, sv, pinnedIdx, hoverIdx);
  drawDataPoints(ctxVar, allPoints, comparisons, -1, sv, pinnedIdx, hoverIdx);
}

function renderConvergence(data) {
  var W = 320, H = 280;
  var ctx = ctxConv;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  if (data.length < 1) {
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.fillText('Make comparisons to see how well', W/2, H/2 - 8);
    ctx.fillText('the model learns your preferences', W/2, H/2 + 8);
    ctx.textAlign = 'left';
    return;
  }
  var margin = { top: 16, right: 40, bottom: 30, left: 46 };
  var pw = W - margin.left - margin.right;
  var ph = H - margin.top - margin.bottom;

  var utils = data.map(function(d) { return d.bestUtility; });
  var consis = data.map(function(d) { return d.consistency; });

  var uMin = Math.min.apply(null, utils), uMax = Math.max.apply(null, utils);
  var uPad = (uMax - uMin) * 0.15 || 0.5;
  uMin -= uPad; uMax += uPad;

  function sx(i) { return margin.left + (i / Math.max(1, data.length-1)) * pw; }
  function syU(v) { return margin.top + ph - (v - uMin) / (uMax - uMin) * ph; }
  function syC(v) { return margin.top + ph - v * ph; }

  // Grid
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.5;
  for (var t = 0; t <= 4; t++) {
    var v = uMin + (uMax-uMin)*t/4;
    ctx.beginPath(); ctx.moveTo(margin.left, syU(v)); ctx.lineTo(margin.left+pw, syU(v)); ctx.stroke();
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#666';
    ctx.fillText(v.toFixed(2), 2, syU(v)+3);
  }

  // Best utility line (purple)
  ctx.strokeStyle = '#4872f9'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (var i = 0; i < utils.length; i++) {
    if (i === 0) ctx.moveTo(sx(i), syU(utils[i]));
    else ctx.lineTo(sx(i), syU(utils[i]));
  }
  ctx.stroke();
  for (var i = 0; i < utils.length; i++) {
    ctx.beginPath(); ctx.arc(sx(i), syU(utils[i]), 2.5, 0, 2*Math.PI);
    ctx.fillStyle = '#4872f9'; ctx.fill();
  }

  // Consistency line (green, right axis)
  ctx.strokeStyle = 'rgba(77,146,33,0.8)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  for (var i = 0; i < consis.length; i++) {
    if (i === 0) ctx.moveTo(sx(i), syC(consis[i]));
    else ctx.lineTo(sx(i), syC(consis[i]));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (var i = 0; i < consis.length; i++) {
    ctx.beginPath(); ctx.arc(sx(i), syC(consis[i]), 2, 0, 2*Math.PI);
    ctx.fillStyle = 'rgba(77,146,33,0.85)'; ctx.fill();
  }

  // Right axis ticks
  ctx.fillStyle = 'rgba(77,146,33,0.6)'; ctx.font = '10px sans-serif';
  for (var t = 0; t <= 4; t++) {
    ctx.fillText((t*25)+'%', W - margin.right + 4, syC(t/4)+3);
  }

  // Axis labels
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#666';
  ctx.fillText('comparison #', margin.left + pw/2 - 40, H - 4);
  ctx.save(); ctx.translate(10, margin.top + ph/2 + 40); ctx.rotate(-Math.PI/2);
  ctx.fillStyle = '#4872f9'; ctx.fillText('peak utility (a.u.)', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(W - 6, margin.top + ph/2 + 30); ctx.rotate(-Math.PI/2);
  ctx.fillStyle = 'rgba(77,146,33,0.8)'; ctx.font = '9px sans-serif';
  ctx.fillText('user-model agreement', 0, 0); ctx.restore();

  var xStep = Math.max(1, Math.ceil(data.length / 8));
  for (var i = 0; i < data.length; i += xStep) {
    ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
    ctx.fillText(String(i+1), sx(i)-3, margin.top+ph+14);
  }
}

function renderStimulusPair(pA, pB) {
  var mode = document.getElementById('selMode').value;
  document.getElementById('waitingMsg').style.display = 'none';
  document.getElementById('compContent').style.display = 'block';
  var fmtCoord = function(pt) {
    return '(' + pt.map(function(v){return v.toFixed(2)}).join(', ') + ')';
  };
  document.getElementById('coordsA').textContent = fmtCoord(pA);
  document.getElementById('coordsB').textContent = fmtCoord(pB);
  var stimType = document.getElementById('selStimulus').value;
  var renderer = STIMULI[stimType];
  renderer(document.getElementById('cvA').getContext('2d'), 180, 180, pA);
  renderer(document.getElementById('cvB').getContext('2d'), 180, 180, pB);
  if (mode === 'auto') {
    var prob = PROBLEMS[document.getElementById('selTestFn').value];
    var vA = prob.fn(pA), vB = prob.fn(pB);
    document.getElementById('compHeader').textContent =
      'Auto: f(A) = ' + vA.toFixed(3) + ' vs f(B) = ' + vB.toFixed(3);
  } else {
    document.getElementById('compHeader').textContent = 'Which do you prefer?';
  }
  document.getElementById('optA').classList.remove('selected');
  document.getElementById('optB').classList.remove('selected');
}

function addHistoryItem(winPt, losePt, compIdx, modelDisagreed) {
  var panel = document.getElementById('historyPanel');
  if (compIdx === 0) panel.innerHTML = '';
  var item = document.createElement('div');
  item.className = 'history-item';
  var fmtShort = function(pt) { return '(' + pt[0].toFixed(2) + ',' + pt[1].toFixed(2) + ',..)'; };
  var warnHtml = modelDisagreed
    ? '<span title="Model predicted differently" style="color:#d32f2f;font-size:13px;font-weight:700;margin-left:4px">\\u26A0</span>'
    : '';
  item.innerHTML =
    '<span class="history-dot" style="background:#4d9221"></span>' +
    '<span class="history-winner">' + fmtShort(winPt) + '</span>' +
    '<span style="color:#999"> \\u25B7 </span>' +
    '<span class="history-dot" style="background:#c51b7d"></span>' +
    '<span class="history-loser">' + fmtShort(losePt) + '</span>' +
    warnHtml;
  panel.prepend(item);
  panel.scrollTop = 0;
}

// ══════════════════════════════════════════════
// Game state
// ══════════════════════════════════════════════
var allPoints = [];
var comparisons = [];
var currentPairPts = null;
var currentPairIdx = null;
var rng = new Rng(42);
var curModel = null;
var convergenceData = [];
var lastUtility = null;
var currentLS = null; // Will be set in prefReset
var pinnedIdx = -1;
var hoverIdx = -1;
var agreementCorrect = 0;
var agreementTotal = 0;

function getSliceValues() {
  var sv = [];
  for (var dd = 2; dd < D; dd++) {
    sv.push(parseInt(document.getElementById('sliceR' + dd).value) / 100);
  }
  return sv;
}

function syncModeUI() {
  var mode = document.getElementById('selMode').value;
  var isHuman = mode === 'human';
  document.getElementById('btnStep').style.display = isHuman ? 'none' : '';
  document.getElementById('btnRun').style.display = isHuman ? 'none' : '';
  // Stimulus selector always visible (stimuli render in both modes)
  document.getElementById('selStimulus').style.display = 'inline-block';
  document.getElementById('selTestFn').style.display = isHuman ? 'none' : 'inline-block';
  document.getElementById('sliceRow').style.display = (D > 2) ? 'flex' : 'none';
}

function updateSliceLabels() {
  var stimType = document.getElementById('selStimulus').value;
  var labels = PARAM_LABELS[stimType] || [];
  for (var dd = 2; dd < D; dd++) {
    var el = document.getElementById('sliceN' + dd);
    if (el) el.textContent = labels[dd] ? '(' + labels[dd] + ')' : '';
  }
}

function renderPrior() {
  var priorMean = new Float64Array(GS*GS);
  var priorStd = new Float64Array(GS*GS);
  var stdVal = Math.sqrt(currentLS ? currentLS[0] : 1);
  for (var i = 0; i < priorStd.length; i++) priorStd[i] = stdVal;
  renderHeatmap(ctxMean, priorMean, -0.5, 1, Ax.viz.viridis);
  renderHeatmap(ctxVar, priorStd, 0, stdVal || 1, Ax.viz.plasma);
  cachedMeanImg = ctxMean.getImageData(0, 0, CN, CN);
  cachedVarImg = ctxVar.getImageData(0, 0, CN, CN);
  cachedBestIdx = -1;
  var sv = getSliceValues();
  drawDataPoints(ctxMean, allPoints, comparisons, -1, sv, pinnedIdx, hoverIdx);
  drawDataPoints(ctxVar, allPoints, comparisons, -1, sv, pinnedIdx, hoverIdx);
  document.getElementById('mlo').textContent = '0.00';
  document.getElementById('mhi').textContent = '0.00';
  document.getElementById('vhi').textContent = stdVal.toFixed(3);
  lastGridMeans = null; lastGridVars = null;
}

var os = 1.0;

function prefReset() {
  running = false;
  waitingForHuman = false;
  allPoints = [];
  comparisons = [];
  currentPairPts = null;
  currentPairIdx = null;
  curModel = null;
  convergenceData = [];
  lastUtility = null;
  pinnedIdx = -1;
  hoverIdx = -1;
  agreementCorrect = 0;
  agreementTotal = 0;
  cachedMeanImg = null;
  cachedVarImg = null;
  cachedBestIdx = -1;
  os = 1.0;
  currentLS = [];
  for (var dd = 0; dd < D; dd++) currentLS.push(0.25);
  rng = new Rng(42);
  lastGridMeans = null; lastGridVars = null;

  ctxConv.fillStyle = '#fff'; ctxConv.fillRect(0, 0, 320, 280);

  document.getElementById('historyPanel').innerHTML =
    '<div style="font-size:12px;color:#555;text-align:center;padding:20px">No comparisons yet</div>';
  var mode = document.getElementById('selMode').value;
  document.getElementById('info').innerHTML = mode === 'human'
    ? '<span>Just pick whichever pattern you find more beautiful.</span> There is no right answer — the GP learns ' +
      '<em>your</em> latent aesthetic utility function in 4D from pairwise comparisons alone. ' +
      'After ~10 choices, the heatmap should reflect your taste. ' +
      'White lines connect compared pairs. ' +
      '<span style="color:#4d9221">Green dots</span> = winners, <span style="color:#c51b7d">pink</span> = losers. ' +
      '<span style="color:#ffd700">\\u2605</span> = predicted best. ' +
      '<span style="color:#4872f9">Purple line</span> = peak predicted utility (should stabilize); ' +
      '<span style="color:#4d9221">green dashed</span> = user-model agreement (proportion of your past choices the model correctly predicts).'
    : '<span>Auto mode</span> uses a hidden test function (only depends on x0, x1) to auto-answer comparisons. ' +
      'The model must learn the function from pairwise preferences alone — no function values are observed. ' +
      'Watch consistency climb as the model learns which points are better.';
  Ax.viz.drawColorbar('cbMean', Ax.viz.viridis);
  Ax.viz.drawColorbar('cbVar', Ax.viz.plasma);
  syncModeUI();
  updateSliceLabels();

  renderPrior();
  renderConvergence([]);

  if (mode === 'human') {
    presentNextPair();
    document.getElementById('status').textContent = 'Choose which you prefer (click or press A/B)';
  } else {
    document.getElementById('waitingMsg').style.display = 'block';
    document.getElementById('compContent').style.display = 'none';
    document.getElementById('status').textContent = 'Click Step to begin, or Run All for animation';
  }
}

function updateHyperparams() {
  if (!lastUtility || lastUtility.length < 3) return;
  var uMin = Infinity, uMax = -Infinity;
  for (var i = 0; i < lastUtility.length; i++) {
    if (lastUtility[i] < uMin) uMin = lastUtility[i];
    if (lastUtility[i] > uMax) uMax = lastUtility[i];
  }
  os = Math.max(0.5, Math.min(5.0, uMax - uMin));
}

// Check if current model (before refit) correctly predicts a comparison.
// Must be called BEFORE adding the comparison and refitting.
// Returns true if model DISAGREED with user choice, false otherwise.
function checkAgreement(winnerIdx, loserIdx) {
  if (!curModel) return false; // no model yet (first comparison)
  try {
    var pred = curModel.predict([allPoints[winnerIdx], allPoints[loserIdx]]);
    agreementTotal++;
    var correct = isFinite(pred.mean[0]) && isFinite(pred.mean[1]) && pred.mean[0] >= pred.mean[1];
    if (correct) agreementCorrect++;
    return !correct;
  } catch (e) { return false; }
}

function computeConvergence() {
  if (!curModel || allPoints.length === 0) return;
  try {
    var pred = curModel.predict(allPoints);
    var bestMean = -Infinity;
    for (var i = 0; i < allPoints.length; i++) {
      if (isFinite(pred.mean[i]) && pred.mean[i] > bestMean) bestMean = pred.mean[i];
    }
    var agreement = agreementTotal > 0 ? agreementCorrect / agreementTotal : 1;
    convergenceData.push({ bestUtility: bestMean, consistency: agreement });
  } catch (e) {
    console.error('convergence compute failed:', e);
  }
}

function fitAndRender() {
  if (comparisons.length === 0) return;
  var n = allPoints.length;
  var fInit = null;
  if (lastUtility && lastUtility.length > 0) {
    fInit = new Float64Array(n);
    for (var i = 0; i < lastUtility.length && i < n; i++) fInit[i] = lastUtility[i];
  }
  var K = rbfKernel(allPoints, n, currentLS, os);
  var result = laplaceMAP(K, n, comparisons, fInit);
  if (!result) {
    console.error('Laplace MAP failed');
    return;
  }
  lastUtility = result.utility;
  updateHyperparams();
  // Re-fit with updated hyperparams
  K = rbfKernel(allPoints, n, currentLS, os);
  result = laplaceMAP(K, n, comparisons, lastUtility);
  if (!result) return;
  lastUtility = result.utility;
  var state = buildPairwiseModelState(allPoints, result.utility, result.likelihoodHess, currentLS, os);
  try {
    curModel = loadModel(state);
    renderPosterior(curModel);
    computeConvergence();
    renderConvergence(convergenceData);
  } catch (e) {
    console.error('Model load error:', e);
  }
}

function presentNextPair() {
  var queryStrategy = document.getElementById('selQuery').value;
  var pts;
  if (queryStrategy === 'eubo') {
    pts = selectPairEUBO(curModel, rng);
  } else {
    pts = selectPairMaxMeanVar(curModel, rng);
  }
  currentPairPts = pts;
  var idxA = allPoints.length;
  allPoints.push(pts[0]);
  var idxB = allPoints.length;
  allPoints.push(pts[1]);
  currentPairIdx = [idxA, idxB];
  renderStimulusPair(pts[0], pts[1]);
  waitingForHuman = true;
}

function updateStatusLine() {
  var last = convergenceData.length > 0 ? convergenceData[convergenceData.length-1] : null;
  var consStr = last ? ' | Agreement: <span>' + Math.round(last.consistency*100) + '%</span>' : '';
  document.getElementById('status').innerHTML =
    'Comparisons: <span>' + comparisons.length + '</span>' +
    ' | Points: <span>' + allPoints.length + '</span>' +
    ' | Dims: <span>' + D + '</span>' +
    consStr;
}

function prefStep(callback) {
  if (currentPairIdx && waitingForHuman) return;

  if (currentPairIdx) {
    var prob = PROBLEMS[document.getElementById('selTestFn').value];
    var pA = allPoints[currentPairIdx[0]], pB = allPoints[currentPairIdx[1]];
    var vA = prob.fn(pA), vB = prob.fn(pB);
    var winner = vA >= vB ? currentPairIdx[0] : currentPairIdx[1];
    var loser = vA >= vB ? currentPairIdx[1] : currentPairIdx[0];
    var disagreed = checkAgreement(winner, loser);
    comparisons.push([winner, loser]);
    addHistoryItem(allPoints[winner], allPoints[loser], comparisons.length - 1, disagreed);
    document.getElementById('optA').classList.toggle('selected', winner === currentPairIdx[0]);
    document.getElementById('optB').classList.toggle('selected', winner === currentPairIdx[1]);
    currentPairIdx = null;
    currentPairPts = null;
  }

  fitAndRender();
  presentNextPair();
  waitingForHuman = false;
  updateStatusLine();
  if (callback) callback();
}

function humanChoice(chosenSide) {
  if (!currentPairIdx || !waitingForHuman) return;
  var winner, loser;
  if (chosenSide === 'A') {
    winner = currentPairIdx[0]; loser = currentPairIdx[1];
    document.getElementById('optA').classList.add('selected');
  } else {
    winner = currentPairIdx[1]; loser = currentPairIdx[0];
    document.getElementById('optB').classList.add('selected');
  }
  var disagreed = checkAgreement(winner, loser);
  comparisons.push([winner, loser]);
  addHistoryItem(allPoints[winner], allPoints[loser], comparisons.length - 1, disagreed);
  currentPairIdx = null;
  currentPairPts = null;
  waitingForHuman = false;

  fitAndRender();
  updateStatusLine();
  setTimeout(function() { presentNextPair(); }, 200);
}

function prefRunAll() {
  if (running) { running = false; return; }
  var mode = document.getElementById('selMode').value;
  if (mode === 'human') {
    document.getElementById('status').textContent = 'Run All is only available in Auto mode';
    return;
  }
  running = true;
  document.getElementById('btnRun').textContent = 'Stop';
  var maxIter = 30;
  var iter = 0;
  function doStep() {
    if (!running || iter >= maxIter) {
      running = false;
      document.getElementById('btnRun').textContent = 'Run All';
      return;
    }
    iter++;
    prefStep(function() {
      setTimeout(doStep, DELAY_MS);
    });
  }
  doStep();
}

// ══════════════════════════════════════════════
// Event wiring
// ══════════════════════════════════════════════
document.getElementById('btnStep').addEventListener('click', function() { prefStep(); });
document.getElementById('btnRun').addEventListener('click', function() { prefRunAll(); });
document.getElementById('btnReset').addEventListener('click', function() { prefReset(); });

document.getElementById('optA').addEventListener('click', function() { humanChoice('A'); });
document.getElementById('optB').addEventListener('click', function() { humanChoice('B'); });
document.addEventListener('keydown', function(e) {
  if (e.key === 'a' || e.key === 'A' || e.key === '1') humanChoice('A');
  if (e.key === 'b' || e.key === 'B' || e.key === '2') humanChoice('B');
  if (e.key === ' ') { e.preventDefault(); prefStep(); }
});

document.getElementById('selMode').addEventListener('change', function() { prefReset(); });
document.getElementById('selTestFn').addEventListener('change', function() { prefReset(); });
document.getElementById('selStimulus').addEventListener('change', function() {
  updateSliceLabels();
  prefReset();
});

// Slice sliders — re-render heatmaps when changed
for (var sd = 2; sd < D; sd++) {
  (function(dd) {
    var slider = document.getElementById('sliceR' + dd);
    if (slider) {
      slider.addEventListener('input', function() {
        document.getElementById('sliceV' + dd).textContent = (parseInt(this.value)/100).toFixed(2);
        if (curModel) renderPosterior(curModel);
        else renderPrior();
      });
    }
  })(sd);
}

// ══════════════════════════════════════════════
// Hover on heatmaps — show stimulus preview near data points
// ══════════════════════════════════════════════
var DATA_HIT_R = 12;
var previewCanvas = document.getElementById('cvPreview');
var previewCtx = previewCanvas.getContext('2d');
var lastPreviewIdx = -1;

function nearestDataPoint(cpx, cpy) {
  var sv = getSliceValues();
  var best = -1, bestD = DATA_HIT_R;
  for (var i = 0; i < allPoints.length; i++) {
    // Only consider points visible in current slice
    var alpha = sliceOpacity(allPoints[i], sv);
    if (alpha < 0.1) continue;
    var dx = allPoints[i][0]*CN - cpx, dy = (1-allPoints[i][1])*CN - cpy;
    var d = Math.sqrt(dx*dx + dy*dy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function renderPreviewDataURL(pt) {
  var stimType = document.getElementById('selStimulus').value;
  var renderer = STIMULI[stimType];
  renderer(previewCtx, 120, 120, pt);
  return previewCanvas.toDataURL();
}

// Lightweight overlay redraw: restores cached heatmap + redraws dots only.
// Only falls back to full renderPosterior if no cache exists.
function redrawOverlays() {
  if (cachedMeanImg && cachedVarImg) {
    drawDotOverlays();
  } else if (curModel) {
    renderPosterior(curModel);
  } else {
    renderPrior();
  }
}

['cvMean', 'cvVar'].forEach(function(id) {
  var cv = document.getElementById(id);
  cv.addEventListener('mousemove', function(e) {
    var rect = cv.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var x0v = px / CN, x1v = 1 - py / CN;
    var tt = document.getElementById('tooltip');
    var hitIdx = nearestDataPoint(px, py);

    // Update hover highlight (only re-render if changed)
    if (hitIdx !== hoverIdx) {
      hoverIdx = hitIdx;
      redrawOverlays();
    }

    if (hitIdx >= 0) {
      var pt = allPoints[hitIdx];
      if (lastPreviewIdx !== hitIdx) {
        lastPreviewIdx = hitIdx;
        renderPreviewDataURL(pt);
      }
      var dataUrl = previewCanvas.toDataURL();
      var mode = document.getElementById('selMode').value;
      var imgHtml = mode === 'human'
        ? '<img src="' + dataUrl + '" width="120" height="120" style="border-radius:4px;display:block;margin-bottom:6px">'
        : '';
      var predHtml = '';
      if (curModel) {
        try {
          var pred = curModel.predict([pt]);
          var mu = pred.mean[0], std = Math.sqrt(Math.max(0, pred.variance[0]));
          if (isFinite(mu)) predHtml = '<br>utility=<b>' + mu.toFixed(3) + '</b>  \\u00B1' + (2*std).toFixed(3);
        } catch(e2) {}
      }
      var coordStr = pt.map(function(v,i){return '<span style="color:#a0c4ff">x'+i+'</span>='+v.toFixed(3)}).join('  ');
      tt.innerHTML = imgHtml + coordStr + predHtml;
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px';
      cv.style.cursor = 'pointer';
    } else {
      lastPreviewIdx = -1;
      // Grid hover — read from cached grid values for speed
      var gi = Math.round(x0v * (GS - 1)), gj = Math.round((1 - x1v) * (GS - 1));
      gi = Math.max(0, Math.min(GS-1, gi));
      gj = Math.max(0, Math.min(GS-1, gj));
      var gridIdx = gj * GS + gi;
      var muStr = '--', stdStr = '--';
      if (lastGridMeans && gridIdx < lastGridMeans.length) {
        var mu = lastGridMeans[gridIdx];
        if (isFinite(mu)) muStr = mu.toFixed(3);
      }
      if (lastGridVars && gridIdx < lastGridVars.length) {
        var v = lastGridVars[gridIdx];
        if (isFinite(v) && v >= 0) stdStr = Math.sqrt(v).toFixed(3);
      }
      tt.innerHTML = 'x0=' + x0v.toFixed(3) + ' x1=' + x1v.toFixed(3) +
        '<br>utility=' + muStr + '  std=' + stdStr;
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px';
      cv.style.cursor = 'crosshair';
    }
  });
  cv.addEventListener('mouseleave', function() {
    document.getElementById('tooltip').style.display = 'none';
    lastPreviewIdx = -1;
    if (hoverIdx !== -1) {
      hoverIdx = -1;
      redrawOverlays();
    }
  });
  // Click-to-pin: toggle pin on data point, snap sliders to clicked point
  cv.addEventListener('click', function(e) {
    var rect = cv.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var hitIdx = nearestDataPoint(px, py);
    var sliceChanged = false;
    if (hitIdx >= 0) {
      if (pinnedIdx === hitIdx) {
        pinnedIdx = -1; // toggle off
      } else {
        pinnedIdx = hitIdx;
        // Snap slice sliders to clicked point's coordinates
        var pt = allPoints[hitIdx];
        for (var dd = 2; dd < D; dd++) {
          var slider = document.getElementById('sliceR' + dd);
          if (slider) {
            var newVal = Math.round(pt[dd] * 100);
            if (parseInt(slider.value) !== newVal) sliceChanged = true;
            slider.value = newVal;
            document.getElementById('sliceV' + dd).textContent = pt[dd].toFixed(2);
          }
        }
      }
    } else {
      pinnedIdx = -1; // click empty area → deselect
    }
    // Full re-render if slice changed (heatmap depends on slice values),
    // otherwise just redraw dot overlays
    if (sliceChanged && curModel) {
      renderPosterior(curModel);
    } else {
      redrawOverlays();
    }
  });
});

// ══════════════════════════════════════════════
// Initialize
// ══════════════════════════════════════════════
prefReset();
</script>
</body>
</html>`;
}
