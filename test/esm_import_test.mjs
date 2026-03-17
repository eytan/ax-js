/**
 * ESM import test for axjs dist bundles.
 * Run: node test/esm_import_test.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let allPassed = true;

function check(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      console.log(`PASS: ${name}`);
    } else {
      console.log(`FAIL: ${name} => ${JSON.stringify(result)}`);
      allPassed = false;
    }
  } catch (e) {
    console.log(`FAIL: ${name} => ${e.message}`);
    allPassed = false;
  }
}

// --- Test main ESM import ---
let Predictor, loadModel, relativize;
try {
  const axjs = await import('../dist/index.js');
  Predictor = axjs.Predictor;
  loadModel = axjs.loadModel;
  relativize = axjs.relativize;
  check('import { Predictor } from dist/index.js', () => typeof Predictor === 'function');
  check('import { loadModel } from dist/index.js', () => typeof loadModel === 'function');
  check('import { relativize } from dist/index.js', () => typeof relativize === 'function');
} catch (e) {
  console.log(`FAIL: ESM main import => ${e.message}`);
  allPassed = false;
}

// --- Test viz sub-export ---
try {
  const viz = await import('../dist/viz/index.js');
  check('import { viridis } from dist/viz/index.js', () => typeof viz.viridis === 'function');
  check('import { plasma } from dist/viz/index.js', () => typeof viz.plasma === 'function');
  check('import { normalizeFixture } from dist/viz/index.js', () => typeof viz.normalizeFixture === 'function');

  const c = viz.viridis(0.5);
  check('viridis(0.5) returns RGB array', () => Array.isArray(c) && c.length === 3);
} catch (e) {
  console.log(`FAIL: ESM viz import => ${e.message}`);
  allPassed = false;
}

// --- Test acquisition sub-export ---
try {
  const acq = await import('../dist/acquisition/index.js');
  check('import { UpperConfidenceBound } from dist/acquisition/index.js', () => typeof acq.UpperConfidenceBound === 'function');
  check('import { ExpectedImprovement } from dist/acquisition/index.js', () => typeof acq.ExpectedImprovement === 'function');
  check('import { optimizeAcqf } from dist/acquisition/index.js', () => typeof acq.optimizeAcqf === 'function');
} catch (e) {
  console.log(`FAIL: ESM acquisition import => ${e.message}`);
  allPassed = false;
}

// --- Test Predictor with a real fixture ---
try {
  const fixtureRaw = JSON.parse(readFileSync(join(root, 'test/fixtures/branin_matern25.json'), 'utf8'));
  // normalizeFixture lives in viz
  const { normalizeFixture } = await import('../dist/viz/index.js');
  const fixture = normalizeFixture(fixtureRaw);

  const p = new Predictor(fixture);
  check('Predictor.paramNames', () => p.paramNames.length === 2);
  check('Predictor.outcomeNames', () => p.outcomeNames.length > 0);

  // predict() takes number[][] (positional arrays), not named objects
  const testPoint = p.paramBounds.map(([lo, hi]) => (lo + hi) / 2);

  const pred = p.predict([testPoint]);
  const firstKey = Object.keys(pred)[0];
  check('predict returns mean', () => typeof pred[firstKey].mean[0] === 'number');
  check('predict variance > 0', () => pred[firstKey].variance[0] > 0);

  const td = p.getTrainingData();
  check('getTrainingData returns data', () => td.X.length > 0 && td.Y.length > 0);

  const ls = p.getLengthscales();
  check('getLengthscales returns array', () => Array.isArray(ls) && ls.length === 2);

  const ranked = p.rankDimensionsByImportance();
  check('rankDimensionsByImportance works', () => ranked.length === 2);

  const cv = p.loocv();
  check('loocv returns results', () => cv.observed.length > 0);
} catch (e) {
  console.log(`FAIL: Predictor fixture test => ${e.message}`);
  console.log(e.stack);
  allPassed = false;
}

// --- Summary ---
console.log('');
if (allPassed) {
  console.log('ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log('SOME TESTS FAILED');
  process.exit(1);
}
