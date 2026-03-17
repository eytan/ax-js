#!/usr/bin/env node
/**
 * Build self-contained demo HTML files.
 * Inlines the axjs IIFE bundle and default fixture data so demos work
 * when opened directly as file:// URLs (no server required).
 *
 * Usage: node demo/build_demos.js
 * Called automatically by `npm run build`.
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import slicePlot from './demos/slice_plot.js';
import responseSurface from './demos/response_surface.js';
import radar from './demos/radar.js';
import scatteroid from './demos/scatteroid.js';
import pointProximity from './demos/point_proximity.js';
import crossValidation from './demos/cross_validation.js';
import featureImportance from './demos/feature_importance.js';
import optimizationTrace from './demos/optimization_trace.js';
import bayesianOptimization from './demos/bayesian_optimization.js';
import preferenceExplorer from './demos/preference_explorer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const demos = [
  ['slice_plot.html', slicePlot],
  ['response_surface.html', responseSurface],
  ['radar.html', radar],
  ['scatteroid.html', scatteroid],
  ['point_proximity.html', pointProximity],
  ['cross_validation.html', crossValidation],
  ['feature_importance.html', featureImportance],
  ['optimization_trace.html', optimizationTrace],
  ['bayesian_optimization.html', bayesianOptimization],
  ['pbo.html', preferenceExplorer],
];

for (const [filename, buildFn] of demos) {
  writeFileSync(join(__dirname, filename), buildFn());
}

console.log(`Built ${demos.length} self-contained demo HTML files:`);
for (const [filename] of demos) {
  console.log(`  demo/${filename}`);
}
