/**
 * Shared build-time helpers and runtime code strings for demo HTML generation.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

export const iifeBundle = readFileSync(join(root, 'dist/ax.global.js'), 'utf8');
export const braninFixture = readFileSync(join(root, 'test/fixtures/branin_matern25.json'), 'utf8');
export const hartmannMixedFixture = readFileSync(join(root, 'test/fixtures/hartmann_mixed.json'), 'utf8');
export const penicillinFixture = readFileSync(join(root, 'test/fixtures/penicillin_modellist.json'), 'utf8');

export function libraryScript() {
  return `<script>\n${iifeBundle}\n</script>`;
}

export function fixtureScript(varName, json) {
  return `<script>\nvar ${varName} = ${json};\n</script>`;
}

// Shared utility functions inlined into each demo that uses fixtures
export const sharedUtilsCode = `
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
    if (data.experiment.observations) result.observations = data.experiment.observations;
    if (data.experiment.candidates) result.candidates = data.experiment.candidates;
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

export function sharedUtilsScript() {
  return `<script>\n${sharedUtilsCode}\n</script>`;
}

// Inline Ax logo SVG (white wireframe, links back to index)
export const axIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="29" height="29" style="vertical-align:-4px;margin-right:8px;opacity:0.7"><path fill="#fff" d="M761.76,600h0l200-346.16H550.12l-400,692.32H961.76ZM573.41,274H926.82L750.12,579.85ZM550.12,926H185.06L555.94,284.07,738.47,600Zm23.29,0L750.12,620.15,926.82,926Z"/></svg>`;
export const axHomeLink = `<a href="index.html" style="text-decoration:none">${axIconSvg}</a>`;

// Shared colormap functions used by response_surface, point_proximity, bayesian_optimization
export const sharedColormapCode = `
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

export function sharedColormapScript() {
  return `<script>\n${sharedColormapCode}\n</script>`;
}

// Shared data-point dot rendering used by response_surface, point_proximity,
// bayesian_optimization, preference_explorer.
// Standard style: outer white ring + inner colored fill, with opacity scaling.
//   ctx:       canvas 2d context
//   x, y:      pixel coordinates
//   alpha:     opacity 0–1 (distance-based fade)
//   isActive:  boolean (click-pinned point — larger, full opacity)
//   isHovered: boolean (mouse-hovering — larger)
//   fillRGB:   [r,g,b] inner fill color (default [255,60,60] = red)
export const sharedDotCode = `
// Draw a data point with the standard outer-ring + inner-fill style.
function drawDataDot(ctx, x, y, alpha, isActive, isHovered, fillRGB) {
  if (alpha < 0.04) return;
  var outerR = (isActive || isHovered) ? 7.5 : 5;
  var innerR = (isActive || isHovered) ? 4 : 2.5;
  fillRGB = fillRGB || [255, 60, 60];
  ctx.beginPath(); ctx.arc(x, y, outerR, 0, 2 * Math.PI);
  ctx.strokeStyle = isActive ? 'rgba(255,255,255,1)'
    : 'rgba(255,255,255,' + Math.max(0.15, alpha * 0.6).toFixed(3) + ')';
  ctx.lineWidth = isActive ? 2.5 : (isHovered ? 2 : 1.5);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, innerR, 0, 2 * Math.PI);
  ctx.fillStyle = (isActive || isHovered)
    ? 'rgba(' + fillRGB[0] + ',' + fillRGB[1] + ',' + fillRGB[2] + ',1)'
    : 'rgba(' + fillRGB[0] + ',' + fillRGB[1] + ',' + fillRGB[2] + ',' + alpha.toFixed(3) + ')';
  ctx.fill();
}
`;

export function sharedDotScript() {
  return `<script>\n${sharedDotCode}\n</script>`;
}
