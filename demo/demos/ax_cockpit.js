import { libraryScript, vizScript, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Ax Cockpit</title>
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
  position: relative; z-index: 1;
}
.param-row .imp-bar {
  position: absolute; right: 0; top: 1px; bottom: 1px; border-radius: 2px;
  z-index: -1; opacity: 0.35;
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
  cursor: pointer; user-select: none; padding: 2px 6px; border-radius: 4px;
  transition: opacity 0.15s;
}
.legend-item:hover { background: #1e1e24; }
.legend-item.hidden-gen { opacity: 0.3; }
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

<h1>${axHomeLink}Ax Cockpit — Multi-Objective VSIP</h1>
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
${vizScript()}

<script>
(function() {
var Predictor = Ax.Predictor;
var relativize = Ax.relativize;

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

// ── Pre-baked fixture data (Sobol X/Y, qEHVI X/Y, candidate X) ──
// Generated once via Pareto front computation: qEHVI and candidates are
// non-dominated feasible points with farthest-point diversity sampling.
// Y values include fixed observation noise (5% of outcome range).
var FIXTURE_SOBOL_X = [
    [0.5625,1.2500,1.1400,0.6633,2.1477,0.8923,0.7765],
    [1.0625,0.4833,1.3400,0.8061,2.3068,0.9538,0.8235],
    [0.8125,0.7833,0.5800,0.9490,2.4659,1.0154,0.8706],
    [1.3125,1.0833,0.7800,1.0918,0.8895,1.0769,0.9176],
    [0.6875,0.5833,0.9800,1.2347,1.0486,1.1385,0.9647],
    [1.1875,0.8833,1.1800,1.3776,1.2076,0.4047,1.0118],
    [0.9375,1.1833,1.3800,0.5408,1.3667,0.4663,1.0588],
    [1.4375,0.6833,0.6200,0.6837,1.5258,0.5278,1.1059]
  ];
var FIXTURE_SOBOL_Y = [
    [29.5496,5.4892,8.5507,28.3582,26.0185,26.2259,3.2436,0.2818,0.8739],
    [29.2600,5.1300,8.4058,27.8960,26.1785,24.9238,3.6024,0.2726,0.8065],
    [25.6585,5.3183,9.1263,28.8464,25.1950,27.3283,3.4238,0.2665,0.8980],
    [29.7914,5.2132,9.4320,27.9999,26.4629,26.8687,3.3774,0.2971,0.8961],
    [24.2727,5.5389,10.9718,31.8968,32.6158,29.9938,3.9865,0.3538,0.9835],
    [33.1458,4.9696,9.1446,29.4231,26.9569,27.4349,3.8075,0.2991,0.8537],
    [33.2413,5.4213,9.2514,28.0020,27.1778,25.5626,3.3805,0.3053,0.8740],
    [24.8074,5.2685,9.1002,27.2805,24.8371,25.7834,3.7158,0.2706,0.8775]
  ];
var FIXTURE_EHVI_X = [
    [0.8977,0.4721,0.5763,0.9214,2.0778,0.5625,0.4565],
    [1.4786,1.1985,1.3328,1.4923,2.2859,1.1770,0.9106],
    [1.3023,0.9103,0.8629,1.0084,2.5418,0.4166,0.5110],
    [1.4764,1.0423,1.4425,0.6113,2.5930,0.6108,0.4731],
    [1.4481,0.4849,0.5495,1.1153,2.1376,0.5178,0.5030]
  ];
var FIXTURE_EHVI_Y = [
    [21.8226,5.4237,9.3519,29.0098,29.0883,29.1847,3.9634,0.2866,0.9162],
    [39.2751,4.5225,7.0370,24.6250,20.5152,22.6175,2.8427,0.2187,0.6612],
    [31.4873,4.8815,6.9996,25.6185,22.6654,23.3159,3.4192,0.2268,0.7566],
    [33.0052,4.8042,6.3046,24.7057,21.1043,21.3162,3.0901,0.2087,0.6608],
    [25.4617,4.8249,8.3307,26.7621,24.5719,25.0565,3.7961,0.2804,0.8138]
  ];
var FIXTURE_CAND_X = [
    [1.3332,0.4936,0.7389,1.1505,2.6214,0.9114,0.9670],
    [1.4441,0.9909,1.4170,1.3217,2.5846,0.4849,0.4528],
    [0.5527,0.5337,0.5425,0.8523,2.3115,0.6893,0.5857],
    [1.0700,0.8376,0.5748,0.5486,2.6172,0.5669,0.4811],
    [1.3720,0.6039,1.3478,1.0967,2.5110,0.4433,0.6792]
  ];

// ── Batch color palette ──
// Each batch gets a distinct color. Shapes distinguish completed (circle) vs candidate (star).
var BATCH_PALETTE = ['#7c8cc8', '#4ecdc4', '#e8b84d', '#c57bdb', '#e07b9d', '#8cc87c', '#c8a87c', '#7cc8c8'];
function batchColor(batchIdx) {
  return BATCH_PALETTE[batchIdx % BATCH_PALETTE.length];
}

// ── Real VSIP hyperparameters (from BoTorch-fitted fixture) ──
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

// Observation noise SD per outcome (5% of outcome range, pre-computed)
var NOISE_SD = [0.8838,0.0648,0.2429,0.4783,0.5892,0.5083,0.0546,0.0069,0.0243];

// ── Arm data model ──
var arms = [];
var candidates = [];
var nextCandidateId = 1;
var predictor = null;
var sqIdx = 0;

function buildFromFixture(sobolX, sobolY, ehviX, ehviY, candX) {
  arms = [];
  candidates = [];
  nextCandidateId = 1;
  var armIdx = 0;

  // Batch 0: Sobol (COMPLETED)
  sobolX.forEach(function(pt, i) {
    arms.push({
      idx: armIdx, armName: 'arm_0_' + i, params: pt, evals: sobolY[i],
      trialIndex: i, batchIndex: 0, trialStatus: 'COMPLETED', generationMethod: 'Sobol'
    });
    armIdx++;
  });

  // Batch 1: qEHVI (COMPLETED)
  ehviX.forEach(function(pt, i) {
    arms.push({
      idx: armIdx, armName: 'arm_1_' + i, params: pt, evals: ehviY[i],
      trialIndex: sobolX.length + i, batchIndex: 1, trialStatus: 'COMPLETED', generationMethod: 'qEHVI'
    });
    armIdx++;
  });

  // Build GP model from completed arms
  var trainX = arms.map(function(a) { return a.params; });
  var subModels = [];
  for (var k = 0; k < NRESP; k++) {
    var hp = HP[k];
    var noiseVar = NOISE_SD[k] * NOISE_SD[k];
    var trainY = arms.map(function(a) { return (a.evals[k] - hp.ot_mean) / hp.ot_std; });
    var stdNoiseVar = noiseVar / (hp.ot_std * hp.ot_std);
    var trainYvar = arms.map(function() { return stdNoiseVar; });

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

  // SQ = arm closest to center of bounds
  var center = BOUNDS.map(function(b) { return (b[0]+b[1])/2; });
  var bestD = Infinity;
  sqIdx = 0;
  arms.forEach(function(arm, i) {
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

  // Precompute predictions for completed arms
  arms.forEach(function(arm) {
    arm.preds = predictor.predict([arm.params]);
  });

  // Batch 2: qEHVI candidates (CANDIDATE — pending, editable)
  candX.forEach(function(pt, i) {
    candidates.push({
      id: nextCandidateId++, armName: 'arm_2_' + i, params: pt.slice(),
      trialIndex: arms.length + i, batchIndex: 2, trialStatus: 'CANDIDATE',
      generationMethod: 'qEHVI', edited: false,
      preds: null, relData: null
    });
  });
}

buildFromFixture(FIXTURE_SOBOL_X, FIXTURE_SOBOL_Y, FIXTURE_EHVI_X, FIXTURE_EHVI_Y, FIXTURE_CAND_X);

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

// Legend-based visibility: set of hidden generation methods
var hiddenGenMethods = {};

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

function isItemVisible(genMethod, batchIndex) {
  var key = genMethod + ':' + batchIndex;
  return !hiddenGenMethods[key];
}

// Build legend dynamically from actual batches present in the data.
// Each batch gets: "Method (N)" where N is the batch index.
function buildLegendItems() {
  // Collect unique batches from arms and candidates, preserving order
  var seen = {};
  var items = [];
  function addBatch(method, batch, isCand) {
    var key = method + ':' + batch;
    if (seen[key]) return;
    seen[key] = true;
    items.push({ key: key, method: method, batch: batch, isCand: isCand, color: batchColor(batch) });
  }
  arms.forEach(function(a) { addBatch(a.generationMethod, a.batchIndex, false); });
  candidates.forEach(function(c) { addBatch(c.generationMethod, c.batchIndex, true); });
  return items;
}

function renderLegend() {
  var items = buildLegendItems();
  var html = '';
  items.forEach(function(item) {
    var isHidden = hiddenGenMethods[item.key];
    var swatch;
    if (item.isCand) {
      swatch = '<svg width="12" height="12"><polygon points="' + starPoints(6,6,6) +
        '" fill="' + item.color + '" stroke="' + item.color + '" stroke-width="0.5"/></svg>';
    } else {
      swatch = '<div class="legend-swatch" style="background:' + item.color + '"></div>';
    }
    html += '<div class="legend-item' + (isHidden ? ' hidden-gen' : '') +
            '" data-gen="' + item.key + '">' + swatch + item.method + ' (' + item.batch + ')</div>';
  });
  legendEl.innerHTML = html;
}
renderLegend();

legendEl.addEventListener('click', function(e) {
  var el = e.target;
  while (el && el !== legendEl) {
    var gen = el.getAttribute && el.getAttribute('data-gen');
    if (gen) {
      if (hiddenGenMethods[gen]) {
        delete hiddenGenMethods[gen];
      } else {
        hiddenGenMethods[gen] = true;
      }
      renderLegend();
      renderScatter();
      return;
    }
    el = el.parentNode;
  }
});

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
                 batch: arm.batchIndex,
                 visible: isItemVisible(arm.generationMethod, arm.batchIndex) });
    }
  });
  candidates.forEach(function(cand, ci) {
    if (!cand.relData) return;
    var crx = cand.relData[xName];
    var cry = cand.relData[yName];
    if (crx && cry) {
      pts.push({ idx: ci, type: 'candidate', x: crx.mean, y: cry.mean,
                 xSem: crx.sem, ySem: cry.sem, genMethod: cand.generationMethod,
                 batch: cand.batchIndex,
                 visible: isItemVisible(cand.generationMethod, cand.batchIndex) });
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
    var color = batchColor(p.batch);

    html += '<g data-idx="' + p.idx + '" data-type="' + p.type + '" style="cursor:pointer">';

    // Hit area
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="14" fill="transparent"/>';

    // CI crosshairs — batch color
    var ciAlpha = isSelected ? 0.6 : (isCandidate ? 0.5 : 0.4);
    var xLo95 = sx(p.x - CI_Z.c95 * p.xSem), xHi95 = sx(p.x + CI_Z.c95 * p.xSem);
    var yLo95 = sy(p.y - CI_Z.c95 * p.ySem), yHi95 = sy(p.y + CI_Z.c95 * p.ySem);
    html += '<line x1="' + xLo95 + '" y1="' + cy + '" x2="' + xHi95 + '" y2="' + cy +
            '" stroke="' + color + '" stroke-width="1" opacity="' + ciAlpha + '"/>';
    html += '<line x1="' + cx + '" y1="' + yLo95 + '" x2="' + cx + '" y2="' + yHi95 +
            '" stroke="' + color + '" stroke-width="1" opacity="' + ciAlpha + '"/>';
    var xLo75 = sx(p.x - CI_Z.c75 * p.xSem), xHi75 = sx(p.x + CI_Z.c75 * p.xSem);
    var yLo75 = sy(p.y - CI_Z.c75 * p.ySem), yHi75 = sy(p.y + CI_Z.c75 * p.ySem);
    html += '<line x1="' + xLo75 + '" y1="' + cy + '" x2="' + xHi75 + '" y2="' + cy +
            '" stroke="' + color + '" stroke-width="2.5" opacity="0.7"/>';
    html += '<line x1="' + cx + '" y1="' + yLo75 + '" x2="' + cx + '" y2="' + yHi75 +
            '" stroke="' + color + '" stroke-width="2.5" opacity="0.7"/>';

    if (isSQ) {
      var s = isSelected ? 9 : 7;
      html += '<polygon points="' + cx + ',' + (cy-s) + ' ' + (cx+s) + ',' + cy +
              ' ' + cx + ',' + (cy+s) + ' ' + (cx-s) + ',' + cy +
              '" fill="none" stroke="' + color + '" stroke-width="2"/>';
      if (isSelected) html += '<polygon points="' + cx + ',' + (cy-s-2) + ' ' + (cx+s+2) + ',' + cy +
              ' ' + cx + ',' + (cy+s+2) + ' ' + (cx-s-2) + ',' + cy +
              '" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>';
    } else if (isCandidate) {
      var starR = isSelected ? 9 : 7;
      html += '<polygon points="' + starPoints(cx, cy, starR) +
              '" fill="' + color + '" stroke="' + (isSelected ? '#fff' : color) +
              '" stroke-width="' + (isSelected ? 1.5 : 0.5) + '" fill-opacity="0.8"/>';
    } else {
      var r = isSelected ? 6 : 4.5;
      html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
              '" fill="' + color + '"' + (isSelected ? ' stroke="#fff" stroke-width="1.5"' : '') + '/>';
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
    var raw = Ax.viz.pointRelevance(pt, ref, [], HP[oi].ls, INPUT_TF);
    logSum += Math.log(Math.max(raw, 1e-300));
  }
  var geoMean = Math.exp(logSum / indices.length);
  return geoMean * geoMean * geoMean;
}

function allKernelRelevance(pt, ref) {
  var logSum = 0;
  for (var k = 0; k < HP.length; k++) {
    var raw = Ax.viz.pointRelevance(pt, ref, [], HP[k].ls, INPUT_TF);
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
  if (desiredSign === 0) {
    // No preference known — neutral gray
    return { c99: '#2a2a2a', c95: '#4a4a4a', c75: '#6a6a6a', tick: '#444' };
  }
  // Green when mean goes in desired direction, red when against
  var isGood = mean * desiredSign > 0;
  var isBad = mean * desiredSign < 0;
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

// Standard normal CDF (Abramowitz & Stegun rational approximation)
function normCDF(z) {
  var t = 1 / (1 + 0.2316419 * Math.abs(z));
  var d = 0.3989422813 * Math.exp(-z * z / 2);
  var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

// Product of per-constraint P(feasible) using Gaussian CDF
function probFeasible(preds) {
  if (!preds) return null;
  var constraints = OPTIMIZATION_CONFIG.outcome_constraints;
  if (constraints.length === 0) return 1;
  var pof = 1;
  for (var i = 0; i < constraints.length; i++) {
    var c = constraints[i];
    var mean = preds[c.name].mean[0];
    var std = Math.sqrt(Math.max(0, preds[c.name].variance[0])) + 1e-10;
    var z = c.op === 'GEQ' ? (mean - c.bound) / std : (c.bound - mean) / std;
    pof *= normCDF(z);
  }
  return pof;
}

// Continuous diverging color for P(feasible): green → olive → amber → red
function pofColor(pof) {
  // 5-stop interpolation: 0→red, 0.25→orange, 0.5→olive, 0.75→green-olive, 1→green
  var stops = [
    [176, 48, 48],   // 0.0: red
    [192, 96, 48],   // 0.25: orange
    [138, 138, 58],  // 0.5: olive/neutral
    [80, 154, 68],   // 0.75: green-olive
    [58, 154, 58]    // 1.0: green
  ];
  var t = Math.max(0, Math.min(1, pof));
  var idx = t * (stops.length - 1);
  var lo = Math.floor(idx), hi = Math.min(lo + 1, stops.length - 1), f = idx - lo;
  var r = Math.round(stops[lo][0] + f * (stops[hi][0] - stops[lo][0]));
  var g = Math.round(stops[lo][1] + f * (stops[hi][1] - stops[lo][1]));
  var b = Math.round(stops[lo][2] + f * (stops[hi][2] - stops[lo][2]));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
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
    var method = cand.generationMethod;
    if (cand.edited) method += ' (edited)';
    return cand.armName + ' \\u2014 ' + method;
  }
  var arm = arms[item.idx];
  var label = arm.armName + ' \\u2014 ' + arm.generationMethod;
  if (item.idx === sqIdx) label += ' (SQ)';
  return label;
}

function getItemStatusBadge(item) {
  if (!item || item.type !== 'candidate') return '';
  return ' <span style="color:#e8b84d;font-size:9px;font-weight:600">[PENDING]</span>';
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
    rpTitle.innerHTML = getItemLabel(displayItem) + getItemStatusBadge(displayItem) + ' \\u2014 no data';
    rpBars.innerHTML = '';
    return;
  }

  rpTitle.innerHTML = getItemLabel(displayItem) + getItemStatusBadge(displayItem) + ' \\u2014 % vs SQ';

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
    // Check constraint violation (need this before rendering label for badge)
    var violated = false;
    if (r && constraint && itemPreds) {
      var predMean = itemPreds[name].mean[0];
      var predVar = itemPreds[name].variance[0];
      var predSem = Math.sqrt(Math.max(0, predVar));
      if (constraint.op === 'LEQ' && predMean + 1.96 * predSem > constraint.bound) violated = true;
      if (constraint.op === 'GEQ' && predMean - 1.96 * predSem < constraint.bound) violated = true;
    }

    // Violation badge: small triangle to the LEFT of the label
    if (violated) {
      var badgeX = labelW - 4 - labelText.length * 6.2 - 14;
      s += '<text x="' + Math.max(2, badgeX) + '" y="' + (cy + 4) +
           '" fill="#c66" font-size="12" font-family="sans-serif">\\u26A0</text>';
    }

    s += '<text x="' + (labelW - 4) + '" y="' + (cy + 4) +
         '" text-anchor="end" fill="' + labelColor + '" font-size="11" font-family="sans-serif"' +
         (isActiveOutcome ? ' font-weight="600"' : '') + '>' + labelText + '</text>';

    if (r) {

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
      s += '<text x="' + (labelW + pad + barW + pad * 2) + '" y="' + (cy + 4) +
           '" fill="' + (violated ? '#c66' : '#777') + '" font-size="10" font-family="sans-serif">' + valStr + '</text>';
    } else {
      s += '<text x="' + (labelW + pad + barW/2) + '" y="' + (cy + 4) +
           '" text-anchor="middle" fill="#555" font-size="10" font-style="italic" font-family="sans-serif">N/A</text>';
    }
    s += '</g>';
  });
  s += '</svg>';

  // P(feasible) badge
  var pof = probFeasible(itemPreds);
  var pofHtml = '';
  if (pof !== null) {
    var pofPct = (pof * 100).toFixed(1);
    var col = pofColor(pof);
    pofHtml = '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:4px 0">';
    pofHtml += '<span style="font-size:10px;color:#555;letter-spacing:.06em;text-transform:uppercase">P(feasible)</span>';
    pofHtml += '<span style="font-size:15px;font-weight:600;color:' + col + '">' + pofPct + '%</span>';
    pofHtml += '</div>';
  }

  rpBars.innerHTML = s + pofHtml;
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
  // Candidates get white title to indicate they're mutable
  var titleStyle = isCandidate ? ' style="color:#e0e0e0"' : '';
  var badge = getItemStatusBadge(selectedItem);
  html += '<div class="section-title"' + titleStyle + '>' + label + badge;

  html += ' <button class="clone-btn" id="btnClone">clone</button>';
  if (isCandidate) {
    html += ' <button class="delete-btn" id="btnDeleteCand">remove</button>';
  }
  html += '</div>';

  // Compute importance bars: 1/lengthscale, normalized to [0,1]
  var impScores = new Array(nDims);
  var maxImp = 0;
  if (sliderOutcome) {
    // Single outcome: use that outcome's LS
    var oi = outcomeNames.indexOf(sliderOutcome);
    if (oi >= 0 && oi < HP.length) {
      for (var d = 0; d < nDims; d++) {
        impScores[d] = 1.0 / HP[oi].ls[d];
        if (impScores[d] > maxImp) maxImp = impScores[d];
      }
    }
    html += '<div style="font-size:10px;color:#e8b84d;margin-bottom:6px">Sorted by ' + sliderOutcome + ' importance</div>';
  } else {
    // No outcome selected: geometric mean of 1/LS across all outcomes
    for (var d = 0; d < nDims; d++) {
      var logSum = 0;
      for (var oi = 0; oi < HP.length; oi++) {
        logSum += Math.log(1.0 / HP[oi].ls[d]);
      }
      impScores[d] = Math.exp(logSum / HP.length);
      if (impScores[d] > maxImp) maxImp = impScores[d];
    }
  }

  // Use importance-ordered dims if an outcome is selected, else default order
  var dimOrder = sliderDimOrder || Array.from({length: nDims}, function(_, i) { return i; });

  for (var di = 0; di < dimOrder.length; di++) {
    var j = dimOrder[di];
    var bLo = paramBounds[j][0], bHi = paramBounds[j][1];
    var val = params[j];
    var step = (bHi - bLo) / 200;
    var impFrac = maxImp > 0 ? impScores[j] / maxImp : 0;
    var barW = Math.round(impFrac * 96); // max 96px within 100px label
    var barColor = sliderOutcome ? '#e8b84d' : '#7c8cc8';
    html += '<div class="param-row">';
    var labelStyle = isEditable ? ' style="color:#bbb"' : '';
    html += '<label' + labelStyle + '>' + paramNames[j];
    if (barW > 2) {
      html += '<span class="imp-bar" style="width:' + barW + 'px;background:' + barColor + '"></span>';
    }
    html += '</label>';
    html += '<input type="range" min="' + bLo + '" max="' + bHi + '" step="' + step +
            '" value="' + val + '" data-dim="' + j + '"' + (isEditable ? '' : ' disabled') + '>';
    html += '<span class="param-val" id="pval' + j + '">' + val.toFixed(3) + '</span>';
    html += '</div>';
  }
  html += '</div>';
  rpSliders.innerHTML = html;

  // Clone button — works for both arms and candidates
  document.getElementById('btnClone').addEventListener('click', function() {
    cloneItem(selectedItem.type, selectedItem.idx);
  });

  if (isCandidate) {
    document.getElementById('btnDeleteCand').addEventListener('click', function() {
      deleteCandidate(selectedItem.idx);
    });
    var sliders = rpSliders.querySelectorAll('input[type=range]');
    for (var si = 0; si < sliders.length; si++) {
      (function(slider) {
        slider.addEventListener('input', function() {
          var dim = parseInt(slider.getAttribute('data-dim'));
          var cand = candidates[selectedItem.idx];
          cand.params[dim] = parseFloat(slider.value);
          if (!cand.edited) {
            cand.edited = true;
            // Update slider section title in-place to show (edited)
            var titleEl = rpSliders.querySelector('.section-title');
            if (titleEl) {
              var newLabel = getItemLabel(selectedItem) + getItemStatusBadge(selectedItem);
              // Preserve buttons at the end
              var btns = titleEl.querySelectorAll('button');
              titleEl.innerHTML = newLabel;
              for (var b = 0; b < btns.length; b++) titleEl.appendChild(btns[b]);
            }
          }
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
// Manual candidates all share a single batch index (one above the highest existing)
function manualBatchIdx() {
  var maxBatch = -1;
  arms.forEach(function(a) { if (a.batchIndex > maxBatch) maxBatch = a.batchIndex; });
  // Fixture candidates have their own batch; manual batch is one above the highest non-manual
  candidates.forEach(function(c) {
    if (c.generationMethod !== 'Manual' && c.batchIndex > maxBatch) maxBatch = c.batchIndex;
  });
  return maxBatch + 1;
}

// Clone any item (arm or candidate) into a new Manual candidate.
// NOTE: "edited" is UI-only metadata not present in the axjs ExperimentState schema.
// It tracks whether the user has modified parameters via sliders after cloning.
// TODO: consider a richer edit-tracking mechanism (e.g., diff from source params)
// if this demo evolves into a production tool.
function cloneItem(sourceType, sourceIdx) {
  var srcParams;
  if (sourceType === 'candidate') {
    srcParams = candidates[sourceIdx].params;
  } else {
    srcParams = arms[sourceIdx].params;
  }
  var batch = manualBatchIdx();
  var idxInBatch = candidates.filter(function(c) { return c.batchIndex === batch; }).length;
  var cand = {
    id: nextCandidateId++, armName: 'arm_' + batch + '_' + idxInBatch,
    params: srcParams.slice(),
    trialIndex: null, batchIndex: batch, trialStatus: 'CANDIDATE',
    generationMethod: 'Manual', edited: false,
    preds: null, relData: null
  };
  predictCandidate(cand);
  candidates.push(cand);
  selectedItem = { type: 'candidate', idx: candidates.length - 1 };
  renderLegend();
  renderScatter();
  showDeltoid(null);
  renderSliders();
}

function createNewCandidate() {
  var center = paramBounds.map(function(b) { return (b[0]+b[1])/2; });
  var batch = manualBatchIdx();
  var idxInBatch = candidates.filter(function(c) { return c.batchIndex === batch; }).length;
  var cand = {
    id: nextCandidateId++, armName: 'arm_' + batch + '_' + idxInBatch,
    params: center, trialIndex: null, batchIndex: batch, trialStatus: 'CANDIDATE',
    generationMethod: 'Manual', edited: false,
    preds: null, relData: null
  };
  predictCandidate(cand);
  candidates.push(cand);
  selectedItem = { type: 'candidate', idx: candidates.length - 1 };
  renderLegend();
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
  renderLegend();
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
      arm_name: c.armName,
      parameters: params,
      trial_index: c.trialIndex,
      generation_method: c.generationMethod + (c.edited ? ' (edited)' : '')
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

document.getElementById('btnResample').addEventListener('click', function() {
  selectedItem = null;
  hoveredItem = null;
  sliderOutcome = null;
  sliderDimOrder = null;
  rpTitle.textContent = 'Hover over an arm to see all outcomes';
  rpBars.innerHTML = '';
  rpSliders.innerHTML = '';
  buildFromFixture(FIXTURE_SOBOL_X, FIXTURE_SOBOL_Y, FIXTURE_EHVI_X, FIXTURE_EHVI_Y, FIXTURE_CAND_X);
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
