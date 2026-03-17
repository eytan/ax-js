import { libraryScript, sharedUtilsScript, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — BO Cockpit</title>
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
.clone-btn, .action-btn {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  border: 0.5px solid #555; background: #1e1e24; color: #aaa; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.clone-btn:hover, .action-btn:hover { background: #2a2a30; color: #ddd; }
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
.legend {
  display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; padding: 6px 0;
}
.legend-item {
  display: flex; align-items: center; gap: 5px; font-size: 11px; color: #888;
}
.legend-swatch {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.legend-swatch.diamond {
  width: 10px; height: 10px; border-radius: 0; transform: rotate(45deg);
  border: 2px solid; background: none;
}
.legend-swatch.star {
  width: 12px; height: 12px; border-radius: 0; background: none;
  position: relative;
}
</style>
</head>
<body>

<h1>${axHomeLink}BO Cockpit — Multi-Objective VSIP</h1>
<p class="subtitle" id="subtitle">Loading...</p>

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
  <label style="margin-left:8px">Show:
    <select id="selFilter">
      <option value="all">All</option>
      <option value="Sobol">Sobol</option>
      <option value="qEHVI">qEHVI (completed)</option>
      <option value="candidates">Candidates</option>
    </select>
  </label>
  <button id="btnResample">resample</button>
  <button id="btnNewCand">+ candidate</button>
  <button id="btnExport">export JSON</button>
</div>

<div class="main-area">
  <div class="scatter-wrap">
    <svg id="scatterSvg" width="520" height="460"></svg>
    <div class="legend" id="legend"></div>
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

// ── VSIP test problem ──
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

var OPTIMIZATION_CONFIG = {
  objectives: [
    { name: 'weight', minimize: true },
    { name: 'acceleration', minimize: true },
    { name: 'intrusion', minimize: true }
  ],
  outcome_constraints: [
    { name: 'door_velocity', bound: 32.0, op: 'LEQ' },
    { name: 'bpillar_top_vel', bound: 30.0, op: 'LEQ' },
    { name: 'pubic_force', bound: 4.0, op: 'LEQ' },
    { name: 'abdomen_load', bound: 1.0, op: 'LEQ' }
  ],
  objective_thresholds: [
    { name: 'weight', bound: 35.0, op: 'LEQ' },
    { name: 'acceleration', bound: 6.0, op: 'LEQ' },
    { name: 'intrusion', bound: 11.0, op: 'LEQ' }
  ]
};

// Build lookup maps for quick constraint/objective checks
var objectiveSet = {};
OPTIMIZATION_CONFIG.objectives.forEach(function(o) { objectiveSet[o.name] = o; });
var constraintMap = {};
OPTIMIZATION_CONFIG.outcome_constraints.forEach(function(c) { constraintMap[c.name] = c; });
var thresholdMap = {};
OPTIMIZATION_CONFIG.objective_thresholds.forEach(function(t) { thresholdMap[t.name] = t; });

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

// ── Generation method definitions ──
var GEN_METHODS = {
  'Sobol':           { color: '#7c8cc8', label: 'Sobol' },
  'qEHVI':           { color: '#4ecdc4', label: 'qEHVI' },
  'qEHVI (pending)': { color: '#e8b84d', label: 'qEHVI (pending)' },
  'Manual':          { color: '#ff6b6b', label: 'Manual' }
};

// ── Real VSIP hyperparameters from BoTorch-fitted fixture ──
var NOISE_FRAC = 0.05;
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

var INPUT_TF = {
  offset: BOUNDS.map(function(b) { return b[0]; }),
  coefficient: BOUNDS.map(function(b) { return b[1] - b[0]; })
};
var SEARCH_SPACE = {
  parameters: PARAM_NAMES.map(function(name, i) {
    return { name: name, type: 'range', bounds: BOUNDS[i] };
  })
};

// Compute outcome ranges for noise calibration
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

// ── Quasi-random Sobol-like sampling (Halton sequence) ──
function halton(index, base) {
  var result = 0, f = 1;
  var i = index;
  while (i > 0) {
    f /= base;
    result += f * (i % base);
    i = Math.floor(i / base);
  }
  return result;
}
var HALTON_BASES = [2, 3, 5, 7, 11, 13, 17];

function generateSobolPoints(n, offset) {
  var pts = [];
  for (var i = 0; i < n; i++) {
    var pt = [];
    for (var j = 0; j < NDIM; j++) {
      var h = halton(i + offset + 1, HALTON_BASES[j]);
      pt.push(BOUNDS[j][0] + h * (BOUNDS[j][1] - BOUNDS[j][0]));
    }
    pts.push(pt);
  }
  return pts;
}

// ── Generate NEHVI-biased points (simulate optimizer suggestions) ──
function generateNEHVIPoints(n, completedArms, targetObjectives) {
  // Pick from the completed arms that are best on the target objectives,
  // then perturb slightly to simulate NEHVI suggestions
  var targetIdxs = targetObjectives.map(function(name) { return OUTCOME_NAMES.indexOf(name); });
  var scored = completedArms.map(function(arm, i) {
    var totalScore = 0;
    targetIdxs.forEach(function(oi) {
      // Lower is better (minimize objectives)
      totalScore -= arm.evals[oi];
    });
    return { idx: i, score: totalScore };
  });
  scored.sort(function(a, b) { return b.score - a.score; });

  var pts = [];
  for (var i = 0; i < n; i++) {
    // Pick from top performers with some randomness
    var srcIdx = scored[i % Math.min(scored.length, n * 2)].idx;
    var src = completedArms[srcIdx].params;
    var pt = [];
    for (var j = 0; j < NDIM; j++) {
      var range = BOUNDS[j][1] - BOUNDS[j][0];
      var perturbed = src[j] + randn() * range * 0.08;
      pt.push(Math.max(BOUNDS[j][0], Math.min(BOUNDS[j][1], perturbed)));
    }
    pts.push(pt);
  }
  return pts;
}

// ── Arm data model ──
// arms: [{idx, armName, params, evals, trialIndex, batchIndex, trialStatus, generationMethod, preds, relData}]
var arms = [];
var candidates = [];  // [{id, name, params, trialIndex, batchIndex, generationMethod, isFromFixture, preds, relData}]
var nextCandidateId = 1;
var predictor = null;
var sqIdx = 0;

function buildExperiment() {
  arms = [];
  candidates = [];
  nextCandidateId = 1;
  var armIdx = 0;

  // Batch 0: 8 Sobol points (COMPLETED) — quasi-random initialization
  var sobolPts = generateSobolPoints(8, Math.floor(Math.random() * 100));
  sobolPts.forEach(function(pt, i) {
    var ev = evaluate(pt);
    var noisyEvals = ev.map(function(v, k) { return v + NOISE_FRAC * outcomeRanges[k] * randn(); });
    arms.push({
      idx: armIdx, armName: 'arm_0_' + i, params: pt, evals: noisyEvals,
      trialIndex: i, batchIndex: 0, trialStatus: 'COMPLETED', generationMethod: 'Sobol'
    });
    armIdx++;
  });

  // Batch 1: 5 qEHVI with all 3 objectives + constraints (COMPLETED)
  var ehviPts = generateNEHVIPoints(5, arms, ['weight', 'acceleration', 'intrusion']);
  ehviPts.forEach(function(pt, i) {
    var ev = evaluate(pt);
    var noisyEvals = ev.map(function(v, k) { return v + NOISE_FRAC * outcomeRanges[k] * randn(); });
    arms.push({
      idx: armIdx, armName: 'arm_1_' + i, params: pt, evals: noisyEvals,
      trialIndex: 8 + i, batchIndex: 1, trialStatus: 'COMPLETED', generationMethod: 'qEHVI'
    });
    armIdx++;
  });

  // Build the GP model from completed arms only
  var completedArms = arms.filter(function(a) { return a.trialStatus === 'COMPLETED'; });
  var trainX = completedArms.map(function(a) { return a.params; });

  var subModels = [];
  for (var k = 0; k < NRESP; k++) {
    var hp = HP[k];
    var noiseSd = NOISE_FRAC * outcomeRanges[k];
    var noiseVar = noiseSd * noiseSd;
    var trainY = completedArms.map(function(a) { return (a.evals[k] - hp.ot_mean) / hp.ot_std; });
    var stdNoiseVar = noiseVar / (hp.ot_std * hp.ot_std);
    var trainYvar = completedArms.map(function() { return stdNoiseVar; });

    subModels.push({
      model_type: 'SingleTaskGP',
      train_X: trainX,
      train_Y: trainY,
      kernel: { type: 'RBF', lengthscale: hp.ls },
      mean_constant: hp.mc,
      noise_variance: trainYvar,
      input_transform: INPUT_TF,
      outcome_transform: { type: 'Standardize', mean: hp.ot_mean, std: hp.ot_std }
    });
  }

  // Pick SQ as arm closest to center
  var center = BOUNDS.map(function(b) { return (b[0]+b[1])/2; });
  var bestD = Infinity;
  sqIdx = 0;
  arms.forEach(function(arm, i) {
    if (arm.trialStatus !== 'COMPLETED') return;
    var d = 0;
    for (var j = 0; j < NDIM; j++) {
      var rng = BOUNDS[j][1] - BOUNDS[j][0] || 1;
      d += Math.pow((arm.params[j] - center[j]) / rng, 2);
    }
    if (d < bestD) { bestD = d; sqIdx = i; }
  });

  predictor = new Predictor({
    search_space: SEARCH_SPACE,
    model_state: {
      model_type: 'ModelListGP',
      outcome_names: OUTCOME_NAMES,
      models: subModels
    },
    optimization_config: OPTIMIZATION_CONFIG,
    status_quo: { point: arms[sqIdx].params }
  });

  // Precompute predictions for all completed arms
  arms.forEach(function(arm) {
    arm.preds = predictor.predict([arm.params]);
  });

  // Batch 2: 5 qEHVI candidates (CANDIDATE — pending, editable)
  var candPts = generateNEHVIPoints(5, arms, ['weight', 'acceleration', 'intrusion']);
  candPts.forEach(function(pt, i) {
    var cand = {
      id: nextCandidateId++, name: 'cand_2_' + i, params: pt,
      trialIndex: 13 + i, batchIndex: 2, generationMethod: 'qEHVI (pending)',
      isFromFixture: true, preds: null, relData: null
    };
    candidates.push(cand);
  });
}

buildExperiment();

var nArms = arms.length;
var nDims = NDIM;
var outcomeNames = OUTCOME_NAMES;
var paramNames = PARAM_NAMES;
var paramBounds = BOUNDS;

// ── Relativize all arms vs SQ ──
var CI_Z = { c99: 2.576, c95: 1.960, c75: 1.150 };

function relativizeItem(preds) {
  var sqPred = arms[sqIdx].preds;
  var result = {};
  for (var k = 0; k < outcomeNames.length; k++) {
    var name = outcomeNames[k];
    var mean = preds[name].mean[0];
    var variance = preds[name].variance[0];
    var sem = Math.sqrt(Math.max(0, variance));
    var sqMean = sqPred[name].mean[0];
    var sqVar = sqPred[name].variance[0];
    var sqSem = Math.sqrt(Math.max(0, sqVar));
    try {
      result[name] = relativize(mean, sem, sqMean, sqSem, { asPercent: true });
    } catch(e) {
      result[name] = null;
    }
  }
  return result;
}

function computeAllRelData() {
  arms.forEach(function(arm) {
    arm.relData = relativizeItem(arm.preds);
  });
  candidates.forEach(function(cand) {
    predictCandidate(cand);
  });
}

function predictCandidate(cand) {
  cand.preds = predictor.predict([cand.params]);
  cand.relData = relativizeItem(cand.preds);
}

computeAllRelData();

// ── Panel range ──
var panelRange = { lo: -10, hi: 10, ticks: [-10, -5, 0, 5, 10] };
function computePanelRange() {
  var lo = 0, hi = 0;
  var allItems = arms.concat(candidates);
  for (var i = 0; i < allItems.length; i++) {
    var rd = allItems[i].relData;
    if (!rd) continue;
    for (var k = 0; k < outcomeNames.length; k++) {
      var r = rd[outcomeNames[k]];
      if (r) {
        var rlo = r.mean - CI_Z.c95 * r.sem;
        var rhi = r.mean + CI_Z.c95 * r.sem;
        if (rlo < lo) lo = rlo;
        if (rhi > hi) hi = rhi;
      }
    }
  }
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
var selFilter = document.getElementById('selFilter');

outcomeNames.forEach(function(name, idx) {
  selX.innerHTML += '<option value="' + idx + '">' + name + '</option>';
  selY.innerHTML += '<option value="' + idx + '">' + name + '</option>';
});
selX.value = '0';
selY.value = '1';

function populateSQDropdown() {
  selSQ.innerHTML = '';
  arms.forEach(function(arm, i) {
    if (arm.trialStatus !== 'COMPLETED') return;
    var label = arm.armName;
    if (i === sqIdx) label += ' (current)';
    selSQ.innerHTML += '<option value="' + i + '">' + label + '</option>';
  });
  selSQ.value = String(sqIdx);
}
populateSQDropdown();

var xOutIdx = 0, yOutIdx = 1;
var activeFilter = 'all';

// ── Selection state ──
var selectedItem = null; // {type:'arm'|'candidate', idx:number}
var hoveredItem = null;

// ── Slider ordering by outcome importance ──
var sliderOutcome = null; // outcome name controlling slider order, or null for default
var sliderDimOrder = null; // array of dim indices sorted by importance, or null for default

function computeDimOrderForOutcome(outcomeName) {
  var oi = outcomeNames.indexOf(outcomeName);
  if (oi < 0 || oi >= HP.length) return null;
  var ls = HP[oi].ls;
  // Sort dimensions by ascending lengthscale (shortest = most important first)
  var dims = [];
  for (var j = 0; j < NDIM; j++) dims.push({ dim: j, ls: ls[j] });
  dims.sort(function(a, b) { return a.ls - b.ls; });
  return dims.map(function(d) { return d.dim; });
}

function setSliderOutcome(outcomeName) {
  if (sliderOutcome === outcomeName) {
    // Toggle off
    sliderOutcome = null;
    sliderDimOrder = null;
  } else {
    sliderOutcome = outcomeName;
    sliderDimOrder = computeDimOrderForOutcome(outcomeName);
  }
  renderSliders();
}

// ── Star shape helper ──
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
var rpSliders = document.getElementById('rpSliders');
var selDistMode = document.getElementById('selDistMode');
var legendEl = document.getElementById('legend');

var W = 520, H = 460;
var margin = { top: 30, right: 20, bottom: 55, left: 65 };
var pw = W - margin.left - margin.right;
var ph = H - margin.top - margin.bottom;

function niceRange(pts, getVal, getSem) {
  var lo = 0, hi = 0;
  pts.forEach(function(p) {
    var v = getVal(p), s = getSem(p);
    var vlo = v - 1.96 * s, vhi = v + 1.96 * s;
    if (vlo < lo) lo = vlo;
    if (vhi > hi) hi = vhi;
  });
  var span = hi - lo; if (span < 1) span = 1;
  lo -= span * 0.12; hi += span * 0.12;
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
  return { lo: lo, hi: hi, ticks: ticks };
}

function isItemVisible(genMethod) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'candidates') return genMethod === 'qEHVI (pending)' || genMethod === 'Manual';
  return genMethod === activeFilter;
}

function getGenColor(genMethod) {
  return GEN_METHODS[genMethod] ? GEN_METHODS[genMethod].color : '#7c8cc8';
}

function renderLegend() {
  var html = '';
  html += '<div class="legend-item"><div class="legend-swatch" style="background:#7c8cc8"></div>Sobol</div>';
  html += '<div class="legend-item"><div class="legend-swatch" style="background:#4ecdc4"></div>qEHVI</div>';
  html += '<div class="legend-item"><div class="legend-swatch diamond" style="border-color:#7c8cc8"></div>Status Quo</div>';
  html += '<div class="legend-item"><svg width="12" height="12"><polygon points="' +
    starPoints(6,6,6) + '" fill="none" stroke="#e8b84d" stroke-width="1.5"/></svg>Candidate</div>';
  html += '<div class="legend-item"><svg width="12" height="12"><polygon points="' +
    starPoints(6,6,6) + '" fill="#ff6b6b" stroke="#ff6b6b" stroke-width="0.5"/></svg>Manual</div>';
  legendEl.innerHTML = html;
}
renderLegend();

function renderScatter() {
  var xName = outcomeNames[xOutIdx];
  var yName = outcomeNames[yOutIdx];

  // Collect all plottable items
  var pts = [];
  arms.forEach(function(arm, i) {
    if (!arm.relData) return;
    var rx = arm.relData[xName];
    var ry = arm.relData[yName];
    if (rx && ry) {
      pts.push({ idx: i, type: 'arm', x: rx.mean, y: ry.mean,
                 xSem: rx.sem, ySem: ry.sem, genMethod: arm.generationMethod,
                 visible: isItemVisible(arm.generationMethod) });
    }
  });
  candidates.forEach(function(cand, ci) {
    if (!cand.relData) return;
    var crx = cand.relData[xName];
    var cry = cand.relData[yName];
    if (crx && cry) {
      pts.push({ idx: ci, type: 'candidate', x: crx.mean, y: cry.mean,
                 xSem: crx.sem, ySem: cry.sem, genMethod: cand.generationMethod,
                 visible: isItemVisible(cand.generationMethod) });
    }
  });

  // Compute axis range from ALL points (not just visible)
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

  // Grid + tick labels
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

  // Zero reference lines
  if (xMin <= 0 && xMax >= 0) {
    html += '<line x1="' + sx(0) + '" y1="' + margin.top + '" x2="' + sx(0) +
            '" y2="' + (margin.top + ph) + '" stroke="#3a3a44" stroke-width="1" stroke-dasharray="4,3"/>';
  }
  if (yMin <= 0 && yMax >= 0) {
    html += '<line x1="' + margin.left + '" y1="' + sy(0) + '" x2="' + (margin.left + pw) +
            '" y2="' + sy(0) + '" stroke="#3a3a44" stroke-width="1" stroke-dasharray="4,3"/>';
  }

  // Axis labels
  var xLabel = xName + ' (% vs SQ)';
  var yLabel = yName + ' (% vs SQ)';
  html += '<text x="' + (margin.left + pw/2) + '" y="' + (H - 8) +
          '" text-anchor="middle" fill="#888" font-size="12">' + xLabel + '</text>';
  html += '<text x="14" y="' + (margin.top + ph/2) +
          '" text-anchor="middle" fill="#888" font-size="12" transform="rotate(-90,14,' +
          (margin.top + ph/2) + ')">' + yLabel + '</text>';

  // Draw items (clipped)
  html += '<g clip-path="url(#plotClip)">';
  pts.forEach(function(p) {
    if (!p.visible) return;

    var isSQ = (p.type === 'arm' && p.idx === sqIdx);
    var isCandidate = (p.type === 'candidate');
    var isSelected = selectedItem && selectedItem.type === p.type && selectedItem.idx === p.idx;
    var cx = sx(p.x), cy = sy(p.y);
    var genColor = getGenColor(p.genMethod);

    html += '<g data-idx="' + p.idx + '" data-type="' + p.type + '" style="cursor:pointer">';

    // Hit area
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="14" fill="transparent"/>';

    // CI crosshairs — color from generation method
    var ciAlpha = isCandidate ? 0.5 : 0.4;
    var ciColor = isSelected ? '#994040' : genColor;
    var ci75Color = isSelected ? '#bb5050' : genColor;

    var xLo95 = sx(p.x - CI_Z.c95 * p.xSem), xHi95 = sx(p.x + CI_Z.c95 * p.xSem);
    var yLo95 = sy(p.y - CI_Z.c95 * p.ySem), yHi95 = sy(p.y + CI_Z.c95 * p.ySem);
    html += '<line x1="' + xLo95 + '" y1="' + cy + '" x2="' + xHi95 + '" y2="' + cy +
            '" stroke="' + ciColor + '" stroke-width="1" opacity="' + ciAlpha + '"/>';
    html += '<line x1="' + cx + '" y1="' + yLo95 + '" x2="' + cx + '" y2="' + yHi95 +
            '" stroke="' + ciColor + '" stroke-width="1" opacity="' + ciAlpha + '"/>';
    var xLo75 = sx(p.x - CI_Z.c75 * p.xSem), xHi75 = sx(p.x + CI_Z.c75 * p.xSem);
    var yLo75 = sy(p.y - CI_Z.c75 * p.ySem), yHi75 = sy(p.y + CI_Z.c75 * p.ySem);
    html += '<line x1="' + xLo75 + '" y1="' + cy + '" x2="' + xHi75 + '" y2="' + cy +
            '" stroke="' + ci75Color + '" stroke-width="2.5" opacity="0.7"/>';
    html += '<line x1="' + cx + '" y1="' + yLo75 + '" x2="' + cx + '" y2="' + yHi75 +
            '" stroke="' + ci75Color + '" stroke-width="2.5" opacity="0.7"/>';

    if (isSQ) {
      // Open diamond for SQ — colored by its generation method
      var s = 7;
      html += '<polygon points="' + cx + ',' + (cy-s) + ' ' + (cx+s) + ',' + cy +
              ' ' + cx + ',' + (cy+s) + ' ' + (cx-s) + ',' + cy +
              '" fill="none" stroke="' + genColor + '" stroke-width="2"/>';
    } else if (isCandidate) {
      var cand = candidates[p.idx];
      var starR = isSelected ? 9 : 7;
      if (cand.generationMethod === 'Manual') {
        // Filled star for user-created
        html += '<polygon points="' + starPoints(cx, cy, starR) +
                '" fill="#ff6b6b" stroke="#fff" stroke-width="' + (isSelected ? 1.5 : 0.5) + '"/>';
      } else {
        // Outline star for fixture candidates
        html += '<polygon points="' + starPoints(cx, cy, starR) +
                '" fill="none" stroke="#e8b84d" stroke-width="' + (isSelected ? 2.5 : 1.5) + '"/>';
      }
    } else {
      var fill = isSelected ? '#ff6b6b' : genColor;
      var r = isSelected ? 6 : 4.5;
      var strokeAttr = isSelected ? ' stroke="#fff" stroke-width="1.5"' : '';
      html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
              '" fill="' + fill + '"' + strokeAttr + '/>';
    }
    html += '</g>';
  });
  html += '</g>';

  svg.innerHTML = html;
  updateOpacities();
}

// ── Opacity/relevance ──
function getRefPoint() {
  var item = selectedItem || hoveredItem;
  if (!item) return null;
  if (item.type === 'candidate') return candidates[item.idx] ? candidates[item.idx].params : null;
  return arms[item.idx] ? arms[item.idx].params : null;
}

function euclideanRelevance(pt, ref) {
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
  var indices = [xOutIdx, yOutIdx];
  var logSum = 0;
  for (var k = 0; k < indices.length; k++) {
    var oi = indices[k];
    if (oi >= HP.length) continue;
    var raw = pointRelevance(pt, ref, [], HP[oi].ls, INPUT_TF);
    logSum += Math.log(Math.max(raw, 1e-300));
  }
  var geoMean = Math.exp(logSum / indices.length);
  return geoMean * geoMean * geoMean;
}

function allKernelRelevance(pt, ref) {
  var logSum = 0;
  for (var k = 0; k < HP.length; k++) {
    var raw = pointRelevance(pt, ref, [], HP[k].ls, INPUT_TF);
    logSum += Math.log(Math.max(raw, 1e-300));
  }
  var geoMean = Math.exp(logSum / HP.length);
  return geoMean * geoMean * geoMean;
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

  var rels = [], maxRel = 0;
  for (var g = 0; g < groups.length; g++) {
    var idx = parseInt(groups[g].getAttribute('data-idx'));
    var gType = groups[g].getAttribute('data-type');
    var pt = gType === 'candidate' ? (candidates[idx] && candidates[idx].params) : (arms[idx] && arms[idx].params);
    var rel = pt ? relevanceFn(pt, refPt) : 0;
    rels.push(rel);
    if (rel < 0.999 && rel > maxRel) maxRel = rel;
  }
  var minOpacity = 0.08;
  for (var g = 0; g < groups.length; g++) {
    var opacity;
    if (rels[g] > 0.999) {
      opacity = 1;
    } else if (maxRel > 0) {
      opacity = minOpacity + (1 - minOpacity) * Math.pow(rels[g] / maxRel, 0.5);
    } else {
      opacity = minOpacity;
    }
    groups[g].setAttribute('opacity', opacity);
  }
}

// ── Right panel: CI bars with constraint visualization ──
// desiredSign: -1 = lower is better (minimize), +1 = higher is better, 0 = neutral
function ciColors(mean, desiredSign) {
  var isGood, isBad;
  if (desiredSign === 0) {
    // No preference: default to positive=green
    isGood = mean > 0;
    isBad = mean < 0;
  } else {
    // Green when mean goes in desired direction, red when against
    isGood = mean * desiredSign > 0;
    isBad = mean * desiredSign < 0;
  }
  if (isGood) return { c99: '#1a3a1a', c95: '#2a6a2a', c75: '#3a9a3a', tick: '#2a5a2a' };
  if (isBad) return { c99: '#3a1a1a', c95: '#7a2a2a', c75: '#b03030', tick: '#5a2020' };
  return { c99: '#2a2a2a', c95: '#4a4a4a', c75: '#6a6a6a', tick: '#444' };
}

// Determine desired sign for each outcome
function outcomeDesiredSign(name) {
  var obj = objectiveSet[name];
  if (obj) return obj.minimize ? -1 : 1;
  var con = constraintMap[name];
  if (con) return con.op === 'LEQ' ? -1 : 1;
  return 0;
}

function getDisplayItem() {
  if (selectedItem) return selectedItem;
  if (hoveredItem) return hoveredItem;
  return null;
}

function getItemRelData(item) {
  if (!item) return null;
  if (item.type === 'candidate') return candidates[item.idx] ? candidates[item.idx].relData : null;
  return arms[item.idx] ? arms[item.idx].relData : null;
}

function getItemLabel(item) {
  if (!item) return '';
  if (item.type === 'candidate') {
    var cand = candidates[item.idx];
    return cand.name + ' \\u2014 ' + cand.generationMethod;
  }
  var arm = arms[item.idx];
  var label = arm.armName + ' \\u2014 ' + arm.generationMethod;
  if (item.idx === sqIdx) label += ' (SQ)';
  return label;
}

function getItemPreds(item) {
  if (!item) return null;
  if (item.type === 'candidate') return candidates[item.idx] ? candidates[item.idx].preds : null;
  return arms[item.idx] ? arms[item.idx].preds : null;
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
    rpTitle.textContent = getItemLabel(displayItem) + ' \\u2014 no data';
    rpBars.innerHTML = '';
    return;
  }

  rpTitle.textContent = getItemLabel(displayItem) + ' \\u2014 % vs SQ';

  // Get raw predictions for constraint checking
  var itemPreds = getItemPreds(displayItem);

  // Precompute constraint bounds in relative (%) space.
  // Must match relativize() formula: r = (meanT - meanC) / |meanC|
  // For a fixed bound (zero uncertainty): relBound = (bound - sqMean) / |sqMean| * 100
  var sqPred = arms[sqIdx].preds;
  var relConstraintBounds = {};
  OPTIMIZATION_CONFIG.outcome_constraints.forEach(function(c) {
    var sqMean = sqPred[c.name].mean[0];
    var absSqMean = Math.abs(sqMean);
    if (absSqMean > 1e-10) {
      relConstraintBounds[c.name] = { rel: (c.bound - sqMean) / absSqMean * 100, op: c.op };
    }
  });
  OPTIMIZATION_CONFIG.objective_thresholds.forEach(function(t) {
    var sqMean = sqPred[t.name].mean[0];
    var absSqMean = Math.abs(sqMean);
    if (absSqMean > 1e-10) {
      relConstraintBounds[t.name] = { rel: (t.bound - sqMean) / absSqMean * 100, op: t.op };
    }
  });

  var rowH = 30, barH = 11, labelW = 145, barW = 150, valW = 100, pad = 8;
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

    // Build label with objective/constraint annotation
    var labelText = name;
    var labelColor = '#999';
    var isObj = objectiveSet[name];
    var constraint = constraintMap[name];
    var isActiveOutcome = (sliderOutcome === name);

    if (isObj) {
      labelText = (isObj.minimize ? '\\u2193 ' : '\\u2191 ') + name;
      labelColor = '#ccc';
    } else if (constraint) {
      labelText = name + ' ' + (constraint.op === 'LEQ' ? '\\u2264' : '\\u2265') + ' ' + constraint.bound;
      labelColor = '#aaa';
    }
    // Highlight active outcome for slider ordering
    if (isActiveOutcome) labelColor = '#e8b84d';

    // Clickable row — invisible hit area + label
    s += '<g data-outcome="' + name + '" style="cursor:pointer">';
    s += '<rect x="0" y="' + (cy - rowH/2) + '" width="' + (labelW + pad + barW + pad) +
         '" height="' + rowH + '" fill="transparent"/>';
    s += '<text x="' + (labelW - 4) + '" y="' + (cy + 4) +
         '" text-anchor="end" fill="' + labelColor + '" font-size="11" font-family="sans-serif"' +
         (isActiveOutcome ? ' font-weight="600"' : '') + '>' + labelText + '</text>';

    if (r) {
      // Check constraint violation
      var violated = false;
      if (constraint && itemPreds) {
        var predMean = itemPreds[name].mean[0];
        var predVar = itemPreds[name].variance[0];
        var predSem = Math.sqrt(Math.max(0, predVar));
        // Constraint violated if 95% CI crosses bound in wrong direction
        if (constraint.op === 'LEQ' && predMean + 1.96 * predSem > constraint.bound) violated = true;
        if (constraint.op === 'GEQ' && predMean - 1.96 * predSem < constraint.bound) violated = true;
      }

      var desiredSign = outcomeDesiredSign(name);
      var cols = ciColors(r.mean, desiredSign);
      // Override colors for violated constraints
      if (violated) {
        cols = { c99: '#3a1a1a', c95: '#7a2a2a', c75: '#b03030', tick: '#5a2020' };
      }

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

      // Constraint/threshold bound dashed line (in relative space)
      var boundInfo = relConstraintBounds[name];
      if (boundInfo && boundInfo.rel >= lo && boundInfo.rel <= hi) {
        var bxPos = bx(boundInfo.rel);
        var boundColor = constraint ? '#c66' : '#e8b84d';
        s += '<line x1="' + bxPos + '" y1="' + (cy - barH/2 - 3) + '" x2="' + bxPos +
             '" y2="' + (cy + barH/2 + 3) + '" stroke="' + boundColor +
             '" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>';
      }

      // Value annotation
      var valStr = r.mean.toFixed(2) + '\\u00B1' + (1.96 * r.sem).toFixed(2) + '%';
      if (violated) valStr += ' \\u26A0';
      s += '<text x="' + (labelW + pad + barW + pad * 2) + '" y="' + (cy + 4) +
           '" fill="' + (violated ? '#c66' : '#777') + '" font-size="10" font-family="sans-serif">' + valStr + '</text>';
    } else {
      s += '<text x="' + (labelW + pad + barW/2) + '" y="' + (cy + 4) +
           '" text-anchor="middle" fill="#555" font-size="10" font-style="italic" font-family="sans-serif">N/A</text>';
    }
    s += '</g>';
  });
  s += '</svg>';
  rpBars.innerHTML = s;
}

// ── Click on outcome row to reorder sliders ──
rpBars.addEventListener('click', function(e) {
  var el = e.target;
  while (el && el !== rpBars) {
    var outcome = el.getAttribute && el.getAttribute('data-outcome');
    if (outcome) {
      setSliderOutcome(outcome);
      // Re-render deltoid to update highlight
      showDeltoid(null);
      return;
    }
    el = el.parentNode;
  }
});

// ── Slider panel ──
function renderSliders() {
  if (!selectedItem) {
    rpSliders.innerHTML = '';
    return;
  }

  var isCandidate = selectedItem.type === 'candidate';
  var isEditable = isCandidate;
  var params = isCandidate ? candidates[selectedItem.idx].params : arms[selectedItem.idx].params;
  var label = getItemLabel(selectedItem);

  var html = '<div class="slider-section">';
  html += '<div class="section-title">' + label;

  if (!isCandidate) {
    html += ' <button class="clone-btn" id="btnClone">clone as candidate</button>';
  } else {
    html += ' <button class="delete-btn" id="btnDeleteCand">remove</button>';
  }
  html += '</div>';

  // Show ordering hint if an outcome is selected
  if (sliderOutcome) {
    html += '<div style="font-size:10px;color:#e8b84d;margin-bottom:6px">Sorted by ' + sliderOutcome + ' importance</div>';
  }

  // Use importance-ordered dims if an outcome is selected, else default order
  var dimOrder = sliderDimOrder || Array.from({length: nDims}, function(_, i) { return i; });

  for (var di = 0; di < dimOrder.length; di++) {
    var j = dimOrder[di];
    var bLo = paramBounds[j][0], bHi = paramBounds[j][1];
    var val = params[j];
    var step = (bHi - bLo) / 200;
    html += '<div class="param-row">';
    html += '<label>' + paramNames[j] + '</label>';
    html += '<input type="range" min="' + bLo + '" max="' + bHi + '" step="' + step +
            '" value="' + val + '" data-dim="' + j + '"' + (isEditable ? '' : ' disabled') + '>';
    html += '<span class="param-val" id="pval' + j + '">' + val.toFixed(3) + '</span>';
    html += '</div>';
  }
  html += '</div>';
  rpSliders.innerHTML = html;

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

// ── Candidate management ──
function cloneArm(armIdx) {
  var arm = arms[armIdx];
  var cand = {
    id: nextCandidateId++, name: 'Candidate ' + (nextCandidateId - 1),
    params: arm.params.slice(),
    trialIndex: null, batchIndex: null,
    generationMethod: 'Manual', isFromFixture: false,
    preds: null, relData: null
  };
  predictCandidate(cand);
  candidates.push(cand);
  selectedItem = { type: 'candidate', idx: candidates.length - 1 };
  renderScatter();
  showDeltoid(null);
  renderSliders();
}

function createNewCandidate() {
  var center = paramBounds.map(function(b) { return (b[0]+b[1])/2; });
  var cand = {
    id: nextCandidateId++, name: 'Candidate ' + (nextCandidateId - 1),
    params: center, trialIndex: null, batchIndex: null,
    generationMethod: 'Manual', isFromFixture: false,
    preds: null, relData: null
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

// ── Export candidates as JSON ──
function exportCandidates() {
  var data = candidates.map(function(c) {
    var params = {};
    for (var j = 0; j < paramNames.length; j++) {
      params[paramNames[j]] = Math.round(c.params[j] * 1e6) / 1e6;
    }
    return {
      arm_name: c.name,
      parameters: params,
      generation_method: c.generationMethod
    };
  });
  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'candidates.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Event delegation ──
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
    selectedItem = null;
    renderScatter();
    showDeltoid(null);
    renderSliders();
    return;
  }
  if (selectedItem && selectedItem.type === info.type && selectedItem.idx === info.idx) {
    selectedItem = null;
  } else {
    selectedItem = { type: info.type, idx: info.idx };
  }
  renderScatter();
  showDeltoid(null);
  renderSliders();
});

// ── Control handlers ──
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
  // Recompute relativization against new SQ (no model rebuild needed)
  computeAllRelData();
  computePanelRange();
  renderScatter();
  showDeltoid(null);
});
selDistMode.addEventListener('change', function() { updateOpacities(); });
selFilter.addEventListener('change', function() {
  activeFilter = selFilter.value;
  renderScatter();
});

document.getElementById('btnResample').addEventListener('click', function() {
  selectedItem = null;
  hoveredItem = null;
  rpTitle.textContent = 'Hover over an arm to see all outcomes';
  rpBars.innerHTML = '';
  rpSliders.innerHTML = '';
  buildExperiment();
  nArms = arms.length;
  computeAllRelData();
  computePanelRange();
  populateSQDropdown();
  renderScatter();
  updateSubtitle();
});

document.getElementById('btnNewCand').addEventListener('click', createNewCandidate);
document.getElementById('btnExport').addEventListener('click', exportCandidates);

// ── Subtitle ──
function updateSubtitle() {
  var completed = arms.filter(function(a) { return a.trialStatus === 'COMPLETED'; }).length;
  var candCount = candidates.length;
  document.getElementById('subtitle').textContent =
    completed + ' completed \\u00B7 ' + candCount + ' candidates \\u00B7 ' +
    '3 objectives \\u00B7 4 constraints \\u00B7 qEHVI';
}

// ── Init ──
updateSubtitle();
renderScatter();
})();

</script>
</body>
</html>`;
}
