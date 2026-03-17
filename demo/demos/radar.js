import { libraryScript, sharedUtilsScript, fixtureScript, axHomeLink } from '../shared.js';

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

export default function() {
return `<!DOCTYPE html>
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
var Predictor = Ax.Predictor;

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
}
