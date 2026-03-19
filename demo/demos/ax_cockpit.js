import { libraryScript, vizScript, fixtureScript, axHomeLink, axFavicon, vsipFixture } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>axjs — Ax Cockpit</title>
${axFavicon}
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #fff; color: #1a1a1a;
  padding: 1.5rem 2rem; min-height: 100vh;
}
h1 { font-size: 17px; font-weight: 500; color: #111; margin-bottom: 3px; }
.subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
.scatter-controls {
  display: flex; flex-direction: column; gap: 5px; margin-top: 10px;
}
.controls {
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 5px;
}
.controls-secondary {
  display: flex; flex-direction: column; gap: 5px;
}
label { font-size: 13px; color: #555; }
select, button {
  font-size: 11px; padding: 3px 8px; border-radius: 6px;
  border: 0.5px solid #d0d0d0; background: #fff; color: #333; cursor: pointer; outline: none;
}
button:hover { background: #f0f0f0; }
.cb-label { font-size: 13px; color: #555; display: flex; align-items: center; gap: 4px; cursor: pointer; }
.main-area { display: flex; gap: 20px; align-items: flex-start; }
.scatter-wrap { position: relative; flex-shrink: 0; }
#scatterSvg { display: block; }
.right-panel {
  background: #fff; border: 0.5px solid #e0e0e0; border-radius: 8px;
  padding: 14px 16px; flex-shrink: 0; min-width: 530px;
}
.rp-title {
  font-size: 11px; color: #999; letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 14px;
}
#rpBars svg { display: block; }
.slider-section {
  border-top: 0.5px solid #e0e0e0; margin-top: 14px; padding-top: 12px;
}
.slider-section .section-title {
  font-size: 11px; color: #999; letter-spacing: 0.06em;
  text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
}
.clone-btn, .action-btn {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  border: 0.5px solid #d0d0d0; background: #f0f0f0; color: #555; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.clone-btn:hover, .action-btn:hover { background: #e0e0e0; color: #333; }
.param-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
}
.param-row label {
  font-size: 10px; color: #666; width: 100px; text-align: right; flex-shrink: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  position: relative; z-index: 1;
}
.param-row .imp-bar {
  position: absolute; right: 0; top: 1px; bottom: 1px; border-radius: 2px;
  z-index: -1;
}
.param-row input[type=range] {
  flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
  background: #e0e0e0; border-radius: 2px; outline: none; cursor: pointer;
}
.param-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px;
  border-radius: 50%; background: #636EFA; cursor: pointer; border: none;
}
.param-row input[type=range]:disabled { opacity: 0.4; cursor: default; }
.param-row input[type=range]:disabled::-webkit-slider-thumb { background: #666; cursor: default; }
.param-row .param-val {
  font-size: 10px; color: #666; width: 42px; text-align: left; flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.delete-btn {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 4px;
  border: 0.5px solid #e0a0a0; background: #fff0f0; color: #c66; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.delete-btn:hover { background: #ffe0e0; color: #a44; }
.legend {
  display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; padding: 6px 0;
}
.legend-item {
  display: flex; align-items: center; gap: 5px; font-size: 11px; color: #666;
  cursor: pointer; user-select: none; padding: 2px 6px; border-radius: 4px;
  transition: opacity 0.15s;
}
.legend-item:hover { background: #f5f5f5; }
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
.rp-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
}
.rp-header .rp-title { margin-bottom: 0; }
.rp-actions { display: flex; gap: 2px; margin-left: auto; }
.scatter-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.scatter-header .scatter-label {
  font-size: 11px; color: #999; letter-spacing: 0.06em; text-transform: uppercase;
}
.scatter-header .rp-actions { margin-left: auto; }
.icon-btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border: none; background: none; color: #999; cursor: pointer; border-radius: 4px;
  padding: 0; font-size: 14px;
}
.icon-btn:hover { background: #f0f0f0; color: #555; }
.icon-btn svg { width: 14px; height: 14px; pointer-events: none; }
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: #333; color: #fff; padding: 8px 18px; border-radius: 6px;
  font-size: 12px; opacity: 0; transition: opacity 0.2s; pointer-events: none;
  z-index: 10000;
}
.toast.show { opacity: 1; }
</style>
</head>
<body>

<h1>${axHomeLink}Ax Cockpit</h1>
<p class="subtitle" id="subtitle"></p>

<div class="main-area">
  <div class="right-panel" id="rightPanel">
    <div class="rp-header">
      <div class="rp-title" id="rpTitle">Click an arm to see all outcomes</div>
      <div class="rp-actions">
        <button class="icon-btn" id="btnCopyDeltoid" data-tip="Copy as text"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
        <button class="icon-btn" id="btnSaveDeltoid" data-tip="Download image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
      </div>
    </div>
    <div id="rpBars"></div>
    <div id="rpSliders"></div>
  </div>
  <div class="scatter-wrap">
    <div class="scatter-header">
      <span class="scatter-label">Scatter</span>
      <div class="rp-actions">
        <button class="icon-btn" id="btnSaveScatter" data-tip="Download image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
      </div>
    </div>
    <svg id="scatterSvg" width="420" height="400"></svg>
    <div class="legend" id="legend"></div>
    <div class="scatter-controls">
      <div class="controls">
        <label>X <select id="selX"></select></label>
        <label>Y <select id="selY"></select></label>
      </div>
      <div class="controls-secondary">
        <label>Control arm <select id="selSQ"></select></label>
        <label>Distance highlighting
          <select id="selDistMode">
            <option value="euclidean">euclidean</option>
            <option value="bi-objective" selected>bi-objective kernel</option>
            <option value="kernel">kernel</option>
          </select>
        </label>
        <div style="display:flex;gap:6px;align-items:center">
          <label style="cursor:pointer"><input type="file" id="fileInput" accept=".json" style="display:none">
            <span style="font-size:11px;padding:3px 8px;border-radius:6px;border:0.5px solid #d0d0d0;background:#fff;color:#333;cursor:pointer">import</span></label>
          <button id="btnExport">export</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

${libraryScript()}
${vizScript()}
${fixtureScript('__DEFAULT_FIXTURE__', vsipFixture)}

<script>
(function() {
var Predictor = Ax.Predictor;
var relativize = Ax.relativize;

// ── Batch color palette ──
var QUALITATIVE_PALETTE = ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#a65628'];
function batchColor(batchIdx) {
  if (batchIdx < QUALITATIVE_PALETTE.length) return QUALITATIVE_PALETTE[batchIdx];
  var hue = (batchIdx * 137.5) % 360;
  return 'hsl(' + Math.round(hue) + ', 55%, 45%)';
}

// ── Default VSIP optimization config (used when fixture lacks one) ──
var DEFAULT_VSIP_OPT_CONFIG = {
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

// ── Arm data model ──
var arms = [];
var candidates = [];
var nextCandidateId = 1;
var predictor = null;
var sqIdx = 0;
var nDims = 0;
var outcomeNames = [];
var paramNames = [];
var paramBounds = [];
var OPTIMIZATION_CONFIG = DEFAULT_VSIP_OPT_CONFIG;

// Build lookup maps for quick constraint/objective checks
var objectiveSet = {};
var constraintMap = {};
var thresholdMap = {};

function rebuildOptConfigMaps() {
  objectiveSet = {};
  constraintMap = {};
  thresholdMap = {};
  if (OPTIMIZATION_CONFIG.objectives) {
    OPTIMIZATION_CONFIG.objectives.forEach(function(o) { objectiveSet[o.name] = o; });
  }
  if (OPTIMIZATION_CONFIG.outcome_constraints) {
    OPTIMIZATION_CONFIG.outcome_constraints.forEach(function(c) { constraintMap[c.name] = c; });
  }
  if (OPTIMIZATION_CONFIG.objective_thresholds) {
    OPTIMIZATION_CONFIG.objective_thresholds.forEach(function(t) { thresholdMap[t.name] = t; });
  }
}

function loadExperimentState(rawData) {
  // Normalize fixture format (handles {experiment: ...} wrapper)
  var data = Ax.viz.normalizeFixture(rawData);

  // Build predictor from ExperimentState
  var experimentState = {
    search_space: data.search_space,
    model_state: data.model_state
  };
  if (data.outcome_names) experimentState.outcome_names = data.outcome_names;
  if (data.adapter_transforms) experimentState.adapter_transforms = data.adapter_transforms;

  // Extract parameter info
  var params = data.search_space.parameters;
  paramNames = params.map(function(p) { return p.name; });
  paramBounds = params.map(function(p) { return p.bounds || [0, 1]; });
  nDims = paramNames.length;

  // Determine outcome names
  outcomeNames = data.outcome_names || [];
  if (outcomeNames.length === 0 && data.model_state.outcome_names) {
    outcomeNames = data.model_state.outcome_names;
  }
  if (outcomeNames.length === 0 && data.model_state.models) {
    outcomeNames = data.model_state.models.map(function(_, i) { return 'y' + i; });
  }
  if (outcomeNames.length === 0) outcomeNames = ['y'];

  // Set optimization config (fixture > default)
  if (data.optimization_config) {
    OPTIMIZATION_CONFIG = data.optimization_config;
  } else {
    // Check if fixture names match VSIP — use default config only for VSIP
    var isVsip = outcomeNames.indexOf('weight') >= 0 && outcomeNames.indexOf('intrusion') >= 0;
    OPTIMIZATION_CONFIG = isVsip ? DEFAULT_VSIP_OPT_CONFIG : {
      objectives: outcomeNames.slice(0, Math.min(2, outcomeNames.length)).map(function(n) {
        return { name: n, minimize: true };
      }),
      outcome_constraints: [],
      objective_thresholds: []
    };
  }
  rebuildOptConfigMaps();

  // Build arms from training data
  arms = [];
  candidates = [];
  nextCandidateId = 1;

  if (data.observations && data.observations.length > 0) {
    // Fixture has explicit observations
    data.observations.forEach(function(obs, i) {
      var pt = obs.point || obs.parameters || [];
      // If observations use named parameters, convert to positional array
      if (!Array.isArray(pt)) {
        pt = paramNames.map(function(n) { return pt[n] || 0; });
      }
      var evals = [];
      outcomeNames.forEach(function(name) {
        evals.push(obs.values ? (obs.values[name] || 0) : 0);
      });
      arms.push({
        idx: i, armName: obs.arm_name || ('arm_0_' + i), params: pt, evals: evals,
        trialIndex: obs.trial_index != null ? obs.trial_index : i,
        batchIndex: obs.batch_index != null ? obs.batch_index : 0,
        trialStatus: 'COMPLETED', generationMethod: obs.generation_method || 'unknown'
      });
    });
  } else {
    // Synthesize arms from model_state train_X + train_Y
    var ms = data.model_state;
    var trainX;
    if (ms.models && ms.models.length > 0) {
      trainX = ms.models[0].train_X;
    } else {
      trainX = ms.train_X || [];
    }
    if (trainX && trainX.length > 0) {
      // Gather Y values per arm across all sub-models/outcomes
      trainX.forEach(function(pt, i) {
        var evals = [];
        outcomeNames.forEach(function(name, k) {
          var sub = ms.models ? ms.models[k] : ms;
          var rawY = sub.train_Y ? sub.train_Y[i] : 0;
          // Untransform: if outcome_transform has mean/std, undo standardization
          var ot = sub.outcome_transform;
          if (ot && ot.mean !== undefined && ot.std !== undefined) {
            evals.push(ot.mean + ot.std * rawY);
          } else {
            evals.push(rawY);
          }
        });
        arms.push({
          idx: i, armName: 'arm_0_' + i, params: pt.slice(), evals: evals,
          trialIndex: i, batchIndex: 0, trialStatus: 'COMPLETED',
          generationMethod: 'unknown'
        });
      });
    }
  }

  // Status quo: from fixture or arm closest to center
  var sqPoint = null;
  if (data.status_quo && data.status_quo.point) {
    sqPoint = data.status_quo.point;
    // Find matching arm
    sqIdx = 0;
    var bestMatch = Infinity;
    arms.forEach(function(arm, i) {
      var d = 0;
      for (var j = 0; j < nDims; j++) d += Math.pow(arm.params[j] - sqPoint[j], 2);
      if (d < bestMatch) { bestMatch = d; sqIdx = i; }
    });
  } else {
    // Pick arm closest to center of bounds
    var center = paramBounds.map(function(b) { return (b[0]+b[1])/2; });
    var bestD = Infinity;
    sqIdx = 0;
    arms.forEach(function(arm, i) {
      var d = 0;
      for (var j = 0; j < nDims; j++) {
        var rng = paramBounds[j][1] - paramBounds[j][0] || 1;
        d += Math.pow((arm.params[j] - center[j]) / rng, 2);
      }
      if (d < bestD) { bestD = d; sqIdx = i; }
    });
    sqPoint = arms.length > 0 ? arms[sqIdx].params : center;
  }

  experimentState.status_quo = { point: sqPoint };
  experimentState.optimization_config = OPTIMIZATION_CONFIG;
  experimentState.outcome_names = outcomeNames;

  // Synthesize input_transform from search_space bounds for sub-models that
  // lack one. Without input_transform, the analytic Sobol path can't run
  // (integrals assume [0,1] normalized space). The Normalize transform maps
  // [lower, upper] → [0, 1] via offset=lower, coefficient=upper-lower.
  var synthInputTf = {
    offset: paramBounds.map(function(b) { return b[0]; }),
    coefficient: paramBounds.map(function(b) { return b[1] - b[0]; })
  };
  var ms = experimentState.model_state;
  if (ms.models) {
    ms.models.forEach(function(sub) {
      if (!sub.input_transform) sub.input_transform = synthInputTf;
    });
  } else if (!ms.input_transform) {
    ms.input_transform = synthInputTf;
  }

  sobolCache = {};
  paramSignCache = {};
  predictor = new Predictor(experimentState);

  // Precompute predictions for completed arms
  arms.forEach(function(arm) {
    arm.preds = predictor.predict([arm.params]);
  });

  // Load candidates from fixture if present
  if (data.candidates && data.candidates.length > 0) {
    var maxBatch = 0;
    arms.forEach(function(a) { if (a.batchIndex > maxBatch) maxBatch = a.batchIndex; });
    data.candidates.forEach(function(cand, i) {
      var pt = cand.point || cand.parameters || [];
      if (!Array.isArray(pt)) {
        pt = paramNames.map(function(n) { return pt[n] || 0; });
      }
      candidates.push({
        id: nextCandidateId++, armName: cand.arm_name || ('cand_' + i),
        params: pt.slice(),
        trialIndex: arms.length + i, batchIndex: maxBatch + 1,
        trialStatus: 'CANDIDATE',
        generationMethod: cand.generation_method || 'suggested',
        edited: false, preds: null, relData: null
      });
    });
  }
}

// Load default fixture
loadExperimentState(__DEFAULT_FIXTURE__);

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

// ── Persistent metric ordering (survives re-renders) ──
function computeDefaultMetricOrder() {
  var obj = [], con = [], trk = [];
  outcomeNames.forEach(function(name) {
    if (objectiveSet[name]) obj.push(name);
    else if (constraintMap[name]) con.push(name);
    else trk.push(name);
  });
  obj.sort(); con.sort(); trk.sort();
  return obj.concat(con).concat(trk);
}
var customMetricOrder = computeDefaultMetricOrder();

// ── Populate dropdowns (uses customMetricOrder) ──
var selX = document.getElementById('selX');
var selY = document.getElementById('selY');
var selSQ = document.getElementById('selSQ');

customMetricOrder.forEach(function(name) {
  var idx = outcomeNames.indexOf(name);
  selX.innerHTML += '<option value="' + idx + '">' + name + '</option>';
  selY.innerHTML += '<option value="' + idx + '">' + name + '</option>';
});
selX.value = String(outcomeNames.indexOf(customMetricOrder[0]));
selY.value = String(outcomeNames.indexOf(customMetricOrder.length > 1 ? customMetricOrder[1] : customMetricOrder[0]));

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

var xOutIdx = +selX.value, yOutIdx = +selY.value;

// Legend-based visibility: set of hidden generation methods
var hiddenGenMethods = {};

// ── Selection state ──
var selectedItem = null; // {type:'arm'|'candidate', idx:number}
var prevSelectedItem = null;
var hoveredItem = null;

// ── Slider ordering by outcome importance ──
var sliderOutcome = null; // outcome name controlling slider order, or null for default
var sliderDimOrder = null; // array of dim indices sorted by importance, or null for default

// Cache for Sobol' sensitivity results per outcome (lazy: computed on first click)
var sobolCache = {};

function getSobolForOutcome(outcomeName) {
  if (sobolCache[outcomeName]) return sobolCache[outcomeName];
  if (!predictor || !predictor.computeSensitivity) return null;
  var sens = predictor.computeSensitivity(outcomeName, { numSamples: 128 });
  sobolCache[outcomeName] = sens;
  return sens;
}

// PiYG-derived sign colors for Sobol' importance bars.
// Must match SOBOL_COLORS in src/viz/plots/importance.ts.
var SIGN_COLORS = {
  pos: { first: '#7fbc41', interaction: '#b8e186' },
  neg: { first: '#c51b7d', interaction: '#de77ae' }
};

// Cache for per-outcome param sign directions
var paramSignCache = {};

function getParamSigns(outcomeName) {
  if (paramSignCache[outcomeName]) return paramSignCache[outcomeName];
  if (!predictor) return null;
  var result = Ax.viz.computeParamSigns(predictor, outcomeName);
  paramSignCache[outcomeName] = result;
  return result;
}

function computeDimOrderForOutcome(outcomeName) {
  var sens = getSobolForOutcome(outcomeName);
  if (sens && sens.firstOrder.length > 0) {
    // Sort by first-order descending (direct variance explained)
    var dims = [];
    for (var j = 0; j < sens.firstOrder.length; j++) dims.push({ dim: j, s: sens.firstOrder[j], st: sens.totalOrder[j] });
    dims.sort(function(a, b) { var df = b.s - a.s; return Math.abs(df) > 0.005 ? df : b.st - a.st; });
    return dims.map(function(d) { return d.dim; });
  }
  // Fallback to lengthscale
  if (!predictor) return null;
  var ls = predictor.getLengthscales(outcomeName);
  if (!ls) return null;
  var dims2 = [];
  for (var j = 0; j < nDims; j++) dims2.push({ dim: j, ls: ls[j] || 1 });
  dims2.sort(function(a, b) { return a.ls - b.ls; });
  return dims2.map(function(d) { return d.dim; });
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

// Helper: rebuild dropdown options using current metric order
function rebuildDropdownOrder() {
  var xVal = selX.value, yVal = selY.value;
  selX.innerHTML = ''; selY.innerHTML = '';
  customMetricOrder.forEach(function(name) {
    var idx = outcomeNames.indexOf(name);
    selX.innerHTML += '<option value="' + idx + '">' + name + '</option>';
    selY.innerHTML += '<option value="' + idx + '">' + name + '</option>';
  });
  selX.value = xVal; selY.value = yVal;
}

// ── Drag reordering state ──
var dragState = null; // { name, startY, rowH, origIdx }

// Shared tooltip: custom div for data-tip hover
var tooltip = document.createElement('div');
tooltip.style.cssText =
  'position:fixed;display:none;background:rgba(255,255,255,0.97);border:1px solid #d0d0d0;' +
  'border-radius:5px;padding:5px 10px;font-size:11px;color:#333;pointer-events:none;' +
  'z-index:10000;white-space:pre-line;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:300px';
document.body.appendChild(tooltip);

rpBars.addEventListener('mouseover', function(e) {
  var el = e.target;
  while (el && el !== rpBars) {
    var tip = el.getAttribute && el.getAttribute('data-tip');
    if (tip) {
      tooltip.textContent = tip;
      tooltip.style.display = 'block';
      return;
    }
    el = el.parentNode;
  }
  tooltip.style.display = 'none';
});
rpBars.addEventListener('mousemove', function(e) {
  if (tooltip.style.display === 'block') {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY - 8) + 'px';
  }
});
rpBars.addEventListener('mouseleave', function() {
  tooltip.style.display = 'none';
});

// Tooltip for Sobol' importance bars in the slider panel
rpSliders.addEventListener('mouseover', function(e) {
  var el = e.target;
  while (el && el !== rpSliders) {
    var tip = el.getAttribute && el.getAttribute('data-tip');
    if (tip) {
      tooltip.textContent = tip;
      tooltip.style.display = 'block';
      return;
    }
    el = el.parentNode;
  }
  tooltip.style.display = 'none';
});
rpSliders.addEventListener('mousemove', function(e) {
  if (tooltip.style.display === 'block') {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY - 8) + 'px';
  }
});
rpSliders.addEventListener('mouseleave', function() {
  tooltip.style.display = 'none';
});

// Tooltip for icon buttons (reuses tooltip)
document.querySelectorAll('.icon-btn[data-tip]').forEach(function(btn) {
  btn.addEventListener('mouseenter', function(e) {
    tooltip.textContent = btn.getAttribute('data-tip');
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY - 8) + 'px';
  });
  btn.addEventListener('mousemove', function(e) {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY - 8) + 'px';
  });
  btn.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
  });
});

var W = 420, H = 400;
var margin = { top: 24, right: 16, bottom: 46, left: 52 };
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
  html += '<rect width="' + W + '" height="' + H + '" fill="#fff" rx="8"/>';
  html += '<defs><clipPath id="plotClip"><rect x="' + margin.left + '" y="' + margin.top +
          '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>';

  // Grid + tick labels
  xRange.ticks.forEach(function(tv) {
    html += '<line x1="' + sx(tv) + '" y1="' + margin.top + '" x2="' + sx(tv) +
            '" y2="' + (margin.top + ph) + '" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>';
    html += '<text x="' + sx(tv) + '" y="' + (H - margin.bottom + 16) +
            '" text-anchor="middle" fill="#999" font-size="10">' + tv + '%</text>';
  });
  yRange.ticks.forEach(function(tv) {
    html += '<line x1="' + margin.left + '" y1="' + sy(tv) + '" x2="' + (margin.left + pw) +
            '" y2="' + sy(tv) + '" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>';
    html += '<text x="' + (margin.left - 8) + '" y="' + (sy(tv) + 3) +
            '" text-anchor="end" fill="#999" font-size="10">' + tv + '%</text>';
  });

  // Zero reference lines
  if (xMin <= 0 && xMax >= 0) {
    html += '<line x1="' + sx(0) + '" y1="' + margin.top + '" x2="' + sx(0) +
            '" y2="' + (margin.top + ph) + '" stroke="rgba(0,0,0,0.10)" stroke-width="1" stroke-dasharray="4,3"/>';
  }
  if (yMin <= 0 && yMax >= 0) {
    html += '<line x1="' + margin.left + '" y1="' + sy(0) + '" x2="' + (margin.left + pw) +
            '" y2="' + sy(0) + '" stroke="rgba(0,0,0,0.10)" stroke-width="1" stroke-dasharray="4,3"/>';
  }

  // Axis labels
  var xLabel = xName + ' (% vs Control)';
  var yLabel = yName + ' (% vs Control)';
  html += '<text x="' + (margin.left + pw/2) + '" y="' + (H - 8) +
          '" text-anchor="middle" fill="#666" font-size="12">' + xLabel + '</text>';
  html += '<text x="14" y="' + (margin.top + ph/2) +
          '" text-anchor="middle" fill="#666" font-size="12" transform="rotate(-90,14,' +
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

    // Selected: filled 2D Gaussian density contours; unselected: dot only
    var xLo95 = sx(p.x - CI_Z.c95 * p.xSem), xHi95 = sx(p.x + CI_Z.c95 * p.xSem);
    var yLo95 = sy(p.y - CI_Z.c95 * p.ySem), yHi95 = sy(p.y + CI_Z.c95 * p.ySem);
    var xLo75 = sx(p.x - CI_Z.c75 * p.xSem), xHi75 = sx(p.x + CI_Z.c75 * p.xSem);
    var yLo75 = sy(p.y - CI_Z.c75 * p.ySem), yHi75 = sy(p.y + CI_Z.c75 * p.ySem);

    if (isSelected) {
      var rx95 = Math.abs(xHi95 - cx);
      var ry95 = Math.abs(yLo95 - cy);
      var rx75 = Math.abs(xHi75 - cx);
      var ry75 = Math.abs(yLo75 - cy);
      html += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx95 + '" ry="' + ry95 +
              '" fill="' + color + '" fill-opacity="0.20" stroke="' + color + '" stroke-width="0.75" opacity="0.40"/>';
      html += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx75 + '" ry="' + ry75 +
              '" fill="' + color + '" fill-opacity="0.25" stroke="' + color + '" stroke-width="0.75" opacity="0.55"/>';
    }

    if (isSQ) {
      var s = isSelected ? 8 : 7;
      html += '<polygon points="' + cx + ',' + (cy-s) + ' ' + (cx+s) + ',' + cy +
              ' ' + cx + ',' + (cy+s) + ' ' + (cx-s) + ',' + cy +
              '" fill="' + (isSelected ? '#fff' : 'none') + '" stroke="' + color + '" stroke-width="2"/>';
    } else if (isCandidate) {
      var starR = isSelected ? 8 : 7;
      html += '<polygon points="' + starPoints(cx, cy, starR) +
              '" fill="' + color + '" stroke="' + (isSelected ? '#222' : color) +
              '" stroke-width="' + (isSelected ? 1.5 : 0.5) + '" fill-opacity="0.8"/>';
    } else {
      var r = isSelected ? 4 : 4.5;
      html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
              '" fill="' + color + '" stroke="' + (isSelected ? '#222' : 'none') + '" stroke-width="' + (isSelected ? 1.5 : 0) + '"/>';
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
    var rng = paramBounds[j][1] - paramBounds[j][0] || 1;
    var scaled = diff / rng;
    d2 += scaled * scaled;
  }
  return Math.exp(-0.5 * d2);
}

function biObjectiveKernelRelevance(pt, ref) {
  if (!predictor) return euclideanRelevance(pt, ref);
  var indices = [xOutIdx, yOutIdx];
  var logSum = 0;
  var count = 0;
  for (var k = 0; k < indices.length; k++) {
    var name = outcomeNames[indices[k]];
    if (!name) continue;
    var corr = predictor.kernelCorrelation(pt, ref, name);
    logSum += Math.log(Math.max(corr, 1e-300));
    count++;
  }
  if (count === 0) return euclideanRelevance(pt, ref);
  var geoMean = Math.exp(logSum / count);
  return geoMean * geoMean * geoMean;
}

function allKernelRelevance(pt, ref) {
  if (!predictor) return euclideanRelevance(pt, ref);
  var logSum = 0;
  for (var k = 0; k < outcomeNames.length; k++) {
    var corr = predictor.kernelCorrelation(pt, ref, outcomeNames[k]);
    logSum += Math.log(Math.max(corr, 1e-300));
  }
  var geoMean = Math.exp(logSum / outcomeNames.length);
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
// Returns { c99, c95, c75, tick, isBad }
function ciColors(mean, sem, desiredSign) {
  var lo75 = mean - CI_Z.c75 * sem;
  var hi75 = mean + CI_Z.c75 * sem;
  var spans0 = lo75 <= 0 && hi75 >= 0;

  if (desiredSign === 0) {
    // No preference known — color by direction unless 75% CI spans 0
    if (spans0) return { c99: '#e8e8e8', c95: '#d0d0d0', c75: '#b8b8b8', tick: '#666', isBad: false };
    if (mean > 0) return { c99: '#e6f5d0', c95: '#b8e186', c75: '#7fbc41', tick: '#4d9221', isBad: false };
    return { c99: '#fde0ef', c95: '#de77ae', c75: '#c51b7d', tick: '#8e0152', isBad: false };
  }
  // Green when mean goes in desired direction, pink when against
  var isGood = mean * desiredSign > 0;
  var isBad = mean * desiredSign < 0;
  // If 75% CI spans zero, use grey (uncertain)
  if (spans0) return { c99: '#e8e8e8', c95: '#d0d0d0', c75: '#b8b8b8', tick: '#666', isBad: false };
  if (isGood) return { c99: '#e6f5d0', c95: '#b8e186', c75: '#7fbc41', tick: '#4d9221', isBad: false };
  if (isBad) return { c99: '#fde0ef', c95: '#de77ae', c75: '#c51b7d', tick: '#8e0152', isBad: true };
  return { c99: '#e8e8e8', c95: '#d0d0d0', c75: '#b8b8b8', tick: '#666', isBad: false };
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
  var constraints = OPTIMIZATION_CONFIG.outcome_constraints || [];
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
  if (item.idx === sqIdx) label += ' (Control)';
  return label;
}

function getItemStatusBadge(item) {
  if (!item || item.type !== 'candidate') return '';
  return ' <span style="color:#999;font-size:inherit">[PENDING]</span>';
}

function getItemPreds(item) {
  if (!item) return null;
  if (item.type === 'candidate') return candidates[item.idx] ? candidates[item.idx].preds : null;
  return arms[item.idx] ? arms[item.idx].preds : null;
}

function getItemColor(item) {
  if (!item) return '#999';
  if (item.type === 'candidate') {
    var cand = candidates[item.idx];
    return cand ? batchColor(cand.batchIndex) : '#999';
  }
  var arm = arms[item.idx];
  return arm ? batchColor(arm.batchIndex) : '#999';
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
    var titleColor = getItemColor(displayItem);
    rpTitle.innerHTML = '<span style="color:' + titleColor + '">' + getItemLabel(displayItem) + '</span>' + getItemStatusBadge(displayItem) + ' \\u2014 no data';
    rpBars.innerHTML = '';
    return;
  }

  var titleColor = getItemColor(displayItem);
  rpTitle.innerHTML = '<span style="color:' + titleColor + '">' + getItemLabel(displayItem) + '</span>' + getItemStatusBadge(displayItem) + ' \\u2014 % vs Control';

  // Get raw predictions for constraint checking
  var itemPreds = getItemPreds(displayItem);

  // Precompute constraint bounds in relative (%) space.
  // Must match relativize() formula: r = (meanT - meanC) / |meanC|
  // For a fixed bound (zero uncertainty): relBound = (bound - sqMean) / |sqMean| * 100
  var sqPred = arms[sqIdx].preds;
  var relConstraintBounds = {};
  (OPTIMIZATION_CONFIG.outcome_constraints || []).forEach(function(c) {
    var sqMean = sqPred[c.name].mean[0];
    var absSqMean = Math.abs(sqMean);
    if (absSqMean > 1e-10) {
      relConstraintBounds[c.name] = { rel: (c.bound - sqMean) / absSqMean * 100, op: c.op };
    }
  });
  (OPTIMIZATION_CONFIG.objective_thresholds || []).forEach(function(t) {
    var sqMean = sqPred[t.name].mean[0];
    var absSqMean = Math.abs(sqMean);
    if (absSqMean > 1e-10) {
      relConstraintBounds[t.name] = { rel: (t.bound - sqMean) / absSqMean * 100, op: t.op };
    }
  });

  // Use persistent custom metric order
  var sortedNames = customMetricOrder;

  var rowH = 30, barH = 11, handleW = 14, labelW = 140, barW = 220, valW = 100, pad = 8;
  var totalW = handleW + labelW + barW + valW + pad * 3;
  var topPad = 20;
  var totalH = sortedNames.length * rowH + topPad + 8;

  var lo = panelRange.lo, hi = panelRange.hi;
  function bx(v) { return handleW + labelW + pad + (v - lo) / (hi - lo) * barW; }

  var s = '<svg width="' + totalW + '" height="' + totalH + '" xmlns="http://www.w3.org/2000/svg">';

  // Layer 1: Alternating row stripes (bottom)
  sortedNames.forEach(function(name, k) {
    if (k % 2 === 1) {
      var stripY = k * rowH + topPad;
      s += '<rect x="0" y="' + stripY + '" width="' + totalW + '" height="' + rowH + '" fill="#f7f7f7"/>';
    }
  });

  // Layer 2: Grid lines + zero reference (on top of stripes)
  panelRange.ticks.forEach(function(tv) {
    var tx = bx(tv);
    s += '<text x="' + tx + '" y="12" text-anchor="middle" fill="#999" font-size="9" font-family="sans-serif">' + tv + '%</text>';
    s += '<line x1="' + tx + '" y1="16" x2="' + tx + '" y2="' + (totalH - 4) + '" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>';
  });

  if (lo <= 0 && hi >= 0) {
    var x0 = bx(0);
    s += '<line x1="' + x0 + '" y1="16" x2="' + x0 + '" y2="' + (totalH - 4) + '" stroke="rgba(0,0,0,0.30)" stroke-width="1"/>';
  }

  // Layer 3: Row content (labels, CI bars, badges)
  sortedNames.forEach(function(name, k) {
    var cy = k * rowH + rowH / 2 + topPad;
    var r = itemRelData[name];

    // Classify metric type
    var isObj = objectiveSet[name];
    var constraint = constraintMap[name];
    var threshold = thresholdMap[name];
    var metricType = isObj ? 'Objective' : (constraint ? 'Constraint' : 'Tracking metric');
    var isActiveOutcome = (sliderOutcome === name);

    // Build label with objective/constraint annotation
    var labelText = name;
    var labelColor = '#999';
    if (isObj) {
      labelText = (isObj.minimize ? '\\u2193 ' : '\\u2191 ') + name;
      labelColor = '#333';
    } else if (constraint) {
      labelText = name + ' ' + (constraint.op === 'LEQ' ? '\\u2264' : '\\u2265') + ' ' + constraint.bound;
      labelColor = '#555';
    }
    if (isActiveOutcome) labelColor = '#4872f9';

    // Drag handle nub (small grey strip with grip dots)
    s += '<g data-drag-handle="' + name + '" style="cursor:grab">';
    s += '<rect x="0" y="' + (cy - rowH/2) + '" width="' + handleW + '" height="' + rowH + '" fill="transparent"/>';
    for (var di = 0; di < 3; di++) {
      var dotY = cy - 4 + di * 4;
      s += '<circle cx="' + (handleW/2 - 1.5) + '" cy="' + dotY + '" r="1.2" fill="#bbb"/>';
      s += '<circle cx="' + (handleW/2 + 1.5) + '" cy="' + dotY + '" r="1.2" fill="#bbb"/>';
    }
    s += '</g>';

    // Clickable row group — click events bubble from children to <g>
    s += '<g data-outcome="' + name + '" style="cursor:pointer">';

    // Check constraint OR objective threshold violation
    var violated = false;
    var violatedBound = null;
    var violatedOp = null;
    if (r && itemPreds) {
      var predMean = itemPreds[name].mean[0];
      var predVar = itemPreds[name].variance[0];
      var predSem = Math.sqrt(Math.max(0, predVar));
      if (constraint) {
        if (constraint.op === 'LEQ' && predMean + 1.96 * predSem > constraint.bound) {
          violated = true; violatedBound = constraint.bound; violatedOp = constraint.op;
        }
        if (constraint.op === 'GEQ' && predMean - 1.96 * predSem < constraint.bound) {
          violated = true; violatedBound = constraint.bound; violatedOp = constraint.op;
        }
      }
      if (threshold) {
        if (threshold.op === 'LEQ' && predMean + 1.96 * predSem > threshold.bound) {
          violated = true; violatedBound = threshold.bound; violatedOp = threshold.op;
        }
        if (threshold.op === 'GEQ' && predMean - 1.96 * predSem < threshold.bound) {
          violated = true; violatedBound = threshold.bound; violatedOp = threshold.op;
        }
      }
    }

    // Violation badge: left-justified after handle
    if (violated) {
      s += '<text x="' + (handleW + 2) + '" y="' + (cy + 5) +
           '" fill="#d32f2f" font-size="13" font-weight="700" font-family="sans-serif">\\u26A0</text>';
    }

    // Label with tooltip for metric type
    s += '<text data-tip="' + metricType + '" x="' + (handleW + labelW - 4) + '" y="' + (cy + 4) +
         '" text-anchor="end" fill="' + labelColor + '" font-size="11" font-family="sans-serif"' +
         (isActiveOutcome ? ' font-weight="600"' : '') + '>' + labelText + '</text>';

    if (r) {

      var desiredSign = outcomeDesiredSign(name);
      var cols = ciColors(r.mean, r.sem, desiredSign);
      if (violated) {
        cols = { c99: '#fde0ef', c95: '#de77ae', c75: '#c51b7d', tick: '#8e0152', isBad: true };
      }

      // Determine interval tooltip text
      var intervalTooltip;
      if (cols.isBad) {
        intervalTooltip = 'Metric regression: ' + r.mean.toFixed(2) + '% vs Control';
        if (violated && violatedBound !== null) {
          var boundRel = relConstraintBounds[name];
          if (boundRel) {
            intervalTooltip += '\\nFalls ' + (violatedOp === 'LEQ' ? 'above' : 'below') +
              ' constraint threshold ' + violatedBound + ' (' + boundRel.rel.toFixed(1) + '% vs Control)';
          }
        }
      } else if (cols.c75 === '#b8b8b8') {
        intervalTooltip = 'Likely neutral: ' + r.mean.toFixed(2) + '% vs Control';
      } else {
        intervalTooltip = 'Metric improvement: ' + r.mean.toFixed(2) + '% vs Control';
      }

      // Red outline halo for constraint-violating intervals
      if (violated) {
        var haloX1 = bx(r.mean - CI_Z.c99 * r.sem) - 2;
        var haloX2 = bx(r.mean + CI_Z.c99 * r.sem) + 2;
        var haloW = Math.max(4, haloX2 - haloX1);
        s += '<rect x="' + haloX1 + '" y="' + (cy - barH/2 - 2) +
             '" width="' + haloW + '" height="' + (barH + 4) +
             '" fill="none" stroke="#d32f2f" stroke-width="1.5" rx="3"/>';
      }

      // CI interval bars with tooltip
      var escapedTip = intervalTooltip.replace(/"/g, '&quot;');
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
        s += '<rect data-tip="' + escapedTip + '" x="' + x1 + '" y="' + (cy - ci.h/2) +
             '" width="' + w + '" height="' + ci.h +
             '" fill="' + ci.fill + '" rx="1.5"/>';
      }

      var xm = bx(r.mean);
      s += '<line data-tip="' + escapedTip + '" x1="' + xm + '" y1="' + (cy - barH/2 + 1) + '" x2="' + xm +
           '" y2="' + (cy + barH/2 - 1) + '" stroke="' + cols.tick + '" stroke-width="2"/>';

      // Constraint/threshold bound dashed line (in relative space)
      var boundInfo = relConstraintBounds[name];
      if (boundInfo && boundInfo.rel >= lo && boundInfo.rel <= hi) {
        var bxPos = bx(boundInfo.rel);
        var boundColor = violated ? '#d32f2f' : '#4d9221';
        var opWord = boundInfo.op === 'LEQ' ? 'less' : 'greater';
        var boundTooltip = name + ' must be ' + opWord + ' than ' + boundInfo.rel.toFixed(1) + '% vs Control';
        var escapedBound = boundTooltip.replace(/"/g, '&quot;');
        s += '<line data-tip="' + escapedBound + '" x1="' + bxPos + '" y1="' + (cy - barH/2 - 3) + '" x2="' + bxPos +
             '" y2="' + (cy + barH/2 + 3) + '" stroke="' + boundColor +
             '" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>';
        // Invisible wider hit area for easier hover
        s += '<line data-tip="' + escapedBound + '" x1="' + bxPos + '" y1="' + (cy - barH/2 - 3) + '" x2="' + bxPos +
             '" y2="' + (cy + barH/2 + 3) + '" stroke="transparent" stroke-width="8"/>';
      }

      // Value annotation
      var valStr = r.mean.toFixed(2) + '\\u00B1' + (1.96 * r.sem).toFixed(2) + '%';
      s += '<text x="' + (handleW + labelW + pad + barW + pad * 2) + '" y="' + (cy + 4) +
           '" fill="' + (violated ? '#c66' : '#777') + '" font-size="10" font-family="sans-serif">' + valStr + '</text>';
    } else {
      s += '<text x="' + (handleW + labelW + pad + barW/2) + '" y="' + (cy + 4) +
           '" text-anchor="middle" fill="#999" font-size="10" font-style="italic" font-family="sans-serif">N/A</text>';
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
    pofHtml += '<span style="font-size:10px;color:#999;letter-spacing:.06em;text-transform:uppercase">P(feasible)</span>';
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

// ── Drag reordering of deltoid metrics ──
(function() {
  var dragName = null;
  var dragOrigIdx = -1;
  var lastTargetIdx = -1;
  var rowH = 30, topPad = 20;
  var ghostEl = null; // floating clone of the row

  function findDragHandle(el) {
    while (el && el !== rpBars) {
      var handle = el.getAttribute && el.getAttribute('data-drag-handle');
      if (handle) return handle;
      el = el.parentNode;
    }
    return null;
  }

  function getTargetIdx(e) {
    var svgEl = rpBars.querySelector('svg');
    if (!svgEl) return -1;
    var svgRect = svgEl.getBoundingClientRect();
    var localY = e.clientY - svgRect.top - topPad;
    var idx = Math.round(localY / rowH);
    return Math.max(0, Math.min(customMetricOrder.length - 1, idx));
  }

  // Insert a blue line + arrows into the SVG at a given row boundary
  function updateSvgIndicator(targetIdx) {
    var svgEl = rpBars.querySelector('svg');
    if (!svgEl) return;
    // Remove old indicator
    var old = svgEl.querySelector('#drag-indicator');
    if (old) old.remove();

    var svgW = +svgEl.getAttribute('width') || 400;
    var y = topPad + targetIdx * rowH;

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'drag-indicator';
    // Main line
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0'); line.setAttribute('x2', String(svgW));
    line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y));
    line.setAttribute('stroke', '#4872f9'); line.setAttribute('stroke-width', '3');
    line.setAttribute('pointer-events', 'none');
    g.appendChild(line);
    // Left arrow
    var arL = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arL.setAttribute('points', '0,' + y + ' 6,' + (y - 4) + ' 6,' + (y + 4));
    arL.setAttribute('fill', '#4872f9');
    g.appendChild(arL);
    // Right arrow
    var arR = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arR.setAttribute('points', svgW + ',' + y + ' ' + (svgW - 6) + ',' + (y - 4) + ' ' + (svgW - 6) + ',' + (y + 4));
    arR.setAttribute('fill', '#4872f9');
    g.appendChild(arR);
    svgEl.appendChild(g);
  }

  function removeSvgIndicator() {
    var svgEl = rpBars.querySelector('svg');
    if (!svgEl) return;
    var old = svgEl.querySelector('#drag-indicator');
    if (old) old.remove();
  }

  // Highlight the source row as "being dragged" — blue tint + slight dim
  function styleSourceRow(name, dragging) {
    var svgEl = rpBars.querySelector('svg');
    if (!svgEl) return;
    var handles = svgEl.querySelectorAll('[data-drag-handle="' + name + '"]');
    var outcomes = svgEl.querySelectorAll('[data-outcome="' + name + '"]');
    if (dragging) {
      handles.forEach(function(el) { el.setAttribute('opacity', '0.4'); });
      outcomes.forEach(function(el) {
        el.setAttribute('opacity', '0.4');
        // Tint all text children blue
        var texts = el.querySelectorAll('text');
        texts.forEach(function(t) { t.setAttribute('data-orig-fill', t.getAttribute('fill') || ''); t.setAttribute('fill', '#4872f9'); });
      });
      // Also tint the drag handle dots blue
      handles.forEach(function(el) {
        var circles = el.querySelectorAll('circle');
        circles.forEach(function(c) { c.setAttribute('fill', '#4872f9'); });
      });
    } else {
      handles.forEach(function(el) { el.setAttribute('opacity', '1'); });
      outcomes.forEach(function(el) {
        el.setAttribute('opacity', '1');
        var texts = el.querySelectorAll('text');
        texts.forEach(function(t) {
          var orig = t.getAttribute('data-orig-fill');
          if (orig !== null) { t.setAttribute('fill', orig); t.removeAttribute('data-orig-fill'); }
        });
      });
      handles.forEach(function(el) {
        var circles = el.querySelectorAll('circle');
        circles.forEach(function(c) { c.setAttribute('fill', '#bbb'); });
      });
    }
  }

  // Create a floating ghost showing the row label
  function createGhost(name, x, y) {
    if (ghostEl) ghostEl.remove();
    ghostEl = document.createElement('div');
    ghostEl.style.cssText =
      'position:fixed;pointer-events:none;z-index:10001;' +
      'background:rgba(255,255,255,0.95);border:1.5px solid #4872f9;' +
      'border-radius:4px;padding:3px 10px;font-size:11px;color:#333;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.12);white-space:nowrap';
    ghostEl.textContent = name;
    document.body.appendChild(ghostEl);
    moveGhost(x, y);
  }

  function moveGhost(x, y) {
    if (!ghostEl) return;
    ghostEl.style.left = (x + 16) + 'px';
    ghostEl.style.top = (y - 12) + 'px';
  }

  function removeGhost() {
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  }

  rpBars.addEventListener('pointerdown', function(e) {
    var name = findDragHandle(e.target);
    if (!name) return;
    e.preventDefault();
    dragName = name;
    dragOrigIdx = customMetricOrder.indexOf(name);
    lastTargetIdx = dragOrigIdx;
    rpBars.setPointerCapture(e.pointerId);
    rpBars.style.cursor = 'grabbing';
    styleSourceRow(name, true);
    createGhost(name, e.clientX, e.clientY);
    updateSvgIndicator(dragOrigIdx);
  });

  rpBars.addEventListener('pointermove', function(e) {
    if (!dragName) return;
    var targetIdx = getTargetIdx(e);
    if (targetIdx < 0) return;
    moveGhost(e.clientX, e.clientY);
    if (targetIdx !== lastTargetIdx) {
      lastTargetIdx = targetIdx;
      updateSvgIndicator(targetIdx);
    }
  });

  rpBars.addEventListener('pointerup', function(e) {
    if (!dragName) return;
    rpBars.style.cursor = '';
    removeSvgIndicator();
    removeGhost();

    var targetIdx = getTargetIdx(e);
    if (targetIdx >= 0 && targetIdx !== dragOrigIdx) {
      customMetricOrder.splice(dragOrigIdx, 1);
      customMetricOrder.splice(targetIdx, 0, dragName);
      rebuildDropdownOrder();
      showDeltoid(null);
    } else {
      styleSourceRow(dragName, false);
    }

    dragName = null;
    dragOrigIdx = -1;
    lastTargetIdx = -1;
  });
})();

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
  var itemColor = getItemColor(selectedItem);
  var badge = getItemStatusBadge(selectedItem);
  html += '<div class="section-title"><span style="color:' + itemColor + '">' + label + '</span>' + badge;

  html += ' <button class="clone-btn" id="btnClone">clone</button>';
  if (isCandidate) {
    html += ' <button class="delete-btn" id="btnDeleteCand">remove</button>';
  }
  html += '</div>';

  // Compute importance bars from Sobol' first-order and total-order indices
  var impFirst = new Array(nDims);
  var impTotal = new Array(nDims);
  var maxImp = 0;
  if (sliderOutcome) {
    var sens = getSobolForOutcome(sliderOutcome);
    if (sens && sens.totalOrder.length >= nDims) {
      for (var d = 0; d < nDims; d++) {
        impFirst[d] = sens.firstOrder[d];
        impTotal[d] = sens.totalOrder[d];
        if (impTotal[d] > maxImp) maxImp = impTotal[d];
      }
    } else {
      // Fallback to lengthscale
      var ls = predictor ? predictor.getLengthscales(sliderOutcome) : null;
      if (ls) {
        for (var d = 0; d < nDims; d++) {
          impFirst[d] = 1.0 / (ls[d] || 1);
          impTotal[d] = impFirst[d];
          if (impTotal[d] > maxImp) maxImp = impTotal[d];
        }
      }
    }
    html += '<div style="font-size:10px;color:#888;margin-bottom:6px">Sorted by parameter importances for ' + sliderOutcome + '</div>';
  } else {
    for (var d = 0; d < nDims; d++) {
      var sumS1 = 0, sumST = 0, count = 0;
      for (var oi = 0; oi < outcomeNames.length; oi++) {
        var sens = getSobolForOutcome(outcomeNames[oi]);
        if (sens && sens.totalOrder.length >= nDims) {
          sumS1 += sens.firstOrder[d];
          sumST += sens.totalOrder[d];
          count++;
        }
      }
      impFirst[d] = count > 0 ? sumS1 / count : 0;
      impTotal[d] = count > 0 ? sumST / count : 0;
      if (impTotal[d] > maxImp) maxImp = impTotal[d];
    }
  }

  // Use importance-ordered dims if an outcome is selected, else default order
  var dimOrder = sliderDimOrder || Array.from({length: nDims}, function(_, i) { return i; });

  // Compute param signs once for the selected outcome (or first outcome)
  var signOutcome = sliderOutcome || outcomeNames[0];
  var paramSigns = getParamSigns(signOutcome);

  for (var di = 0; di < dimOrder.length; di++) {
    var j = dimOrder[di];
    var bLo = paramBounds[j][0], bHi = paramBounds[j][1];
    var val = params[j];
    var step = (bHi - bLo) / 200;

    // Stacked bars: total-order bar (lighter) with first-order overlay (darker).
    // Clamp first-order to [0, total-order] — MC noise can push S₁ > Sᵀ
    var s1 = Math.max(0, Math.min(impFirst[j] || 0, impTotal[j] || 0));
    var st = Math.max(0, impTotal[j] || 0);
    var totalW = maxImp > 0 ? Math.round((st / maxImp) * 96) : 0;
    var firstW = st > 0 ? Math.round((s1 / st) * totalW) : totalW;
    // Ensure interaction portion is visible (min 4px) if any interaction exists
    if (st > s1 && totalW > 6 && totalW - firstW < 4) firstW = totalW - 4;
    var totalPct = ((impTotal[j] || 0) * 100).toFixed(1);
    var firstPct = ((s1 || 0) * 100).toFixed(1);
    var tipText = paramNames[j] + ' explains ' + totalPct + '% of the total variance in ' + signOutcome +
      ' (' + firstPct + '% main effect)';

    html += '<div class="param-row">';
    var labelStyle = isEditable ? 'color:#333' : '';
    html += '<label style="' + labelStyle + '" data-tip="' + tipText + '">' + paramNames[j];
    var dimSign = paramSigns ? paramSigns[j] : 1;
    var cols = dimSign >= 0 ? SIGN_COLORS.pos : SIGN_COLORS.neg;
    var interW = totalW - firstW;
    if (totalW > 1) {
      // First-order bar (darker) flush right
      if (firstW > 0) {
        html += '<span class="imp-bar" style="right:0;width:' + firstW + 'px;background:' + cols.first + ';opacity:0.7"></span>';
      }
      // Interaction bar (lighter) adjacent to the left of first-order
      if (interW > 0) {
        html += '<span class="imp-bar" style="right:' + firstW + 'px;width:' + interW + 'px;background:' + cols.interaction + ';opacity:0.7"></span>';
      }
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
              var newLabel = '<span style="color:' + getItemColor(selectedItem) + '">' + getItemLabel(selectedItem) + '</span>' + getItemStatusBadge(selectedItem);
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
    if (selectedItem.idx === candIdx) {
      // Revert to previous selection; validate it still exists
      var fallback = prevSelectedItem;
      if (fallback && fallback.type === 'candidate' && fallback.idx >= candidates.length) fallback = null;
      selectedItem = fallback || { type: 'arm', idx: 0 };
      prevSelectedItem = null;
    } else if (selectedItem.idx > candIdx) selectedItem.idx--;
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
  if (!info) return; // clicking empty space keeps current selection
  if (selectedItem && selectedItem.type === info.type && selectedItem.idx === info.idx) return; // already selected
  prevSelectedItem = selectedItem;
  selectedItem = { type: info.type, idx: info.idx };
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



// createNewCandidate is available programmatically (e.g. from clone or import)
document.getElementById('btnExport').addEventListener('click', exportCandidates);

// Import ExperimentState or candidates from JSON
document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  file.text().then(function(text) {
    try {
      var data = JSON.parse(text);
      // Detect ExperimentState (has model_state or experiment wrapper)
      if (data.experiment || data.model_state || data.search_space) {
        // Full fixture reload
        loadExperimentState(data);
        computeAllRelData();
        computePanelRange();
        customMetricOrder = computeDefaultMetricOrder();
        rebuildDropdownOrder();
        populateSQDropdown();
        selectedItem = arms.length > 0 ? { type: 'arm', idx: 0 } : null;
        sliderOutcome = outcomeNames.length > 0 ? outcomeNames[0] : null;
        sliderDimOrder = sliderOutcome ? computeDimOrderForOutcome(sliderOutcome) : null;
        renderLegend();
        updateSubtitle();
        renderScatter();
        showDeltoid(selectedItem);
        renderSliders();
      } else if (Array.isArray(data)) {
        // Candidate array import
        candidates = [];
        nextCandidateId = 1;
        var maxBatch = 0;
        arms.forEach(function(a) { if (a.batchIndex > maxBatch) maxBatch = a.batchIndex; });
        data.forEach(function(item, i) {
          var pt = paramNames.map(function(p) { return item.parameters[p] || 0; });
          candidates.push({
            id: nextCandidateId++,
            armName: item.arm_name || ('imported_' + i),
            params: pt,
            trialIndex: arms.length + i,
            batchIndex: maxBatch + 1,
            trialStatus: 'CANDIDATE',
            generationMethod: item.generation_method || 'imported',
            edited: false, preds: null, relData: null
          });
        });
        computeAllRelData();
        computePanelRange();
        renderLegend();
        updateSubtitle();
        renderScatter();
        showDeltoid(null);
      } else {
        alert('Expected an ExperimentState JSON or an array of candidates');
      }
    } catch(err) { alert('Failed to parse JSON: ' + err.message); }
  });
  e.target.value = ''; // allow re-import of same file
});

// ── Subtitle ──
function updateSubtitle() {
  var completed = arms.filter(function(a) { return a.trialStatus === 'COMPLETED'; }).length;
  var candCount = candidates.length;
  var nObj = OPTIMIZATION_CONFIG.objectives ? OPTIMIZATION_CONFIG.objectives.length : 0;
  var nCon = OPTIMIZATION_CONFIG.outcome_constraints ? OPTIMIZATION_CONFIG.outcome_constraints.length : 0;
  // Count distinct batches
  var batches = {};
  arms.forEach(function(a) { batches[a.batchIndex] = true; });
  var nBatch = Object.keys(batches).length;
  var parts = [];
  if (nBatch > 0) parts.push(nBatch + (nBatch === 1 ? ' batch' : ' batches'));
  parts.push(completed + ' completed');
  if (candCount > 0) parts.push(candCount + ' candidate' + (candCount > 1 ? 's' : ''));
  parts.push(nObj + ' objective' + (nObj > 1 ? 's' : ''));
  if (nCon > 0) parts.push(nCon + ' constraint' + (nCon > 1 ? 's' : ''));
  document.getElementById('subtitle').textContent = parts.join(' \\u00B7 ');
}

// ── Toast ──
var toastEl = document.getElementById('toast');
var toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toastEl.classList.remove('show'); }, 2000);
}

// ── Copy deltoid summary as text ──
function buildSummaryText() {
  var displayItem = getDisplayItem();
  if (!displayItem) return null;
  var itemRelData = getItemRelData(displayItem);
  if (!itemRelData) return null;

  var label = getItemLabel(displayItem);
  var lines = [label + ' \\u2014 % vs Control', ''];
  var groups = { Objectives: [], Constraints: [], Tracking: [] };
  customMetricOrder.forEach(function(name) {
    var r = itemRelData[name];
    var txt = name + ' ';
    if (r) {
      var sign = r.mean >= 0 ? '+' : '';
      txt += sign + r.mean.toFixed(2) + '% \\u00B1 ' + (r.sem * CI_Z.c95).toFixed(2) + '%';
    } else {
      txt += 'n/a';
    }
    if (objectiveSet[name]) groups.Objectives.push(txt);
    else if (constraintMap[name]) groups.Constraints.push(txt);
    else groups.Tracking.push(txt);
  });
  ['Objectives', 'Constraints', 'Tracking'].forEach(function(g) {
    if (groups[g].length === 0) return;
    lines.push('*' + g + '*');
    groups[g].forEach(function(l) { lines.push(l); });
    lines.push('');
  });
  return lines.join('\\n').trim();
}

function copyDeltoidText() {
  var text = buildSummaryText();
  if (!text) { showToast('No arm selected'); return; }
  navigator.clipboard.writeText(text).then(function() {
    showToast('Copied to clipboard');
  }, function() {
    showToast('Copy failed (requires HTTPS)');
  });
}

// ── Save SVG as PNG ──
function saveSvgAsPng(svgEl, filename) {
  if (!svgEl) { showToast('No chart to save'); return; }
  var clone = svgEl.cloneNode(true);
  // Ensure width/height attributes for rasterization
  var w = svgEl.getAttribute('width') || svgEl.getBoundingClientRect().width;
  var h = svgEl.getAttribute('height') || svgEl.getBoundingClientRect().height;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  var xml = new XMLSerializer().serializeToString(clone);
  var dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  var img = new Image();
  img.onload = function() {
    var scale = 2; // retina
    var canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, +w, +h);
    canvas.toBlob(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Saved ' + filename);
    }, 'image/png');
  };
  img.src = dataUrl;
}

function saveDeltoidPng() {
  var svgEl = rpBars.querySelector('svg');
  if (!svgEl) { showToast('No arm selected'); return; }
  var displayItem = getDisplayItem();
  var name = displayItem ? (displayItem.type === 'candidate' ? candidates[displayItem.idx].armName : arms[displayItem.idx].armName) : 'deltoid';
  saveSvgAsPng(svgEl, 'deltoid_' + name.replace(/[^a-zA-Z0-9_]/g, '_') + '.png');
}

function saveScatterPng() {
  saveSvgAsPng(document.getElementById('scatterSvg'), 'scatter.png');
}

document.getElementById('btnCopyDeltoid').addEventListener('click', copyDeltoidText);
document.getElementById('btnSaveDeltoid').addEventListener('click', saveDeltoidPng);
document.getElementById('btnSaveScatter').addEventListener('click', saveScatterPng);

// ── Init ──
updateSubtitle();
// Auto-select the first arm and first outcome so panels are fully populated on load
selectedItem = { type: 'arm', idx: 0 };
sliderOutcome = outcomeNames[0];
sliderDimOrder = computeDimOrderForOutcome(outcomeNames[0]);
renderScatter();
showDeltoid(selectedItem);
renderSliders();
})();

</script>
</body>
</html>`;
}
