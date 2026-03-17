import { libraryScript, sharedUtilsScript, sharedColormapScript, fixtureScript, penicillinFixture, axHomeLink } from '../shared.js';

export default function() {
return `<!DOCTYPE html>
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
var Predictor = Ax.Predictor;

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
}
