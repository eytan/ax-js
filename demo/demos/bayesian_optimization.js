import { libraryScript, sharedColormapScript, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
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
var loadModel = Ax.loadModel;
var Predictor = Ax.Predictor;
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
}
