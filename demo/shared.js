/**
 * Shared build-time helpers for demo HTML generation.
 *
 * Demos inline ax.js and ax-viz.js so they work as standalone file:// URLs
 * without a server. Shared visualization utilities are accessed via Ax.viz.*.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

export const iifeBundle = readFileSync(join(root, 'dist/ax.js'), 'utf8');
export const vizBundle = readFileSync(join(root, 'dist/ax-viz.js'), 'utf8');
export const braninFixture = readFileSync(join(root, 'test/fixtures/branin_matern25.json'), 'utf8');
export const hartmannMixedFixture = readFileSync(join(root, 'test/fixtures/hartmann_mixed.json'), 'utf8');
export const penicillinFixture = readFileSync(join(root, 'test/fixtures/penicillin_modellist.json'), 'utf8');
export const branincurrinFixture = readFileSync(join(root, 'test/fixtures/branincurrin_modellist.json'), 'utf8');
export const vsipFixture = readFileSync(join(root, 'test/fixtures/vsip_modellist.json'), 'utf8');
export const cockpitFixture = readFileSync(join(root, 'test/fixtures/explorer_vsip.json'), 'utf8');

/** Inline the main ax-js library. Exposes Ax.Predictor, Ax.loadModel, etc. */
export function libraryScript() {
  return `<script>\n${iifeBundle}\n</script>`;
}

/** Inline ax-viz. Exposes Ax.viz.viridis, Ax.viz.drawDataDot, etc. */
export function vizScript() {
  return `<script>\n${vizBundle}\n</script>`;
}

export function fixtureScript(varName, json) {
  return `<script>\nvar ${varName} = ${json};\n</script>`;
}

// Description panel CSS + helper
export const descriptionCSS = `
  details.description { font-size: 13px; color: #555; line-height: 1.6; max-width: 720px; margin-bottom: 16px; }
  details.description summary { cursor: pointer; color: #888; font-size: 12px; }
  details.description p { margin: 8px 0; }
  details.description ul { margin: 4px 0 4px 20px; }
  details.description li { margin: 3px 0; }
  details.description b { color: #333; }`;

export function descriptionPanel(content, { open = true, summary = 'About this plot' } = {}) {
  return `<details class="description"${open ? ' open' : ''}>
  <summary>${summary}</summary>
  ${content}
</details>`;
}

// Inline Ax logo SVG (links back to index)
export const axIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="24" height="24" style="vertical-align:middle;margin-right:8px;margin-top:-2px;opacity:0.7"><path fill="#222" d="M761.76,600h0l200-346.16H550.12l-400,692.32H961.76ZM573.41,274H926.82L750.12,579.85ZM550.12,926H185.06L555.94,284.07,738.47,600Zm23.29,0L750.12,620.15,926.82,926Z"/></svg>`;
export const axHomeLink = `<a href="index.html" style="text-decoration:none">${axIconSvg}</a>`;

// Inline SVG favicon (Ax logo as data URI)
export const axFavicon = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 1200'%3E%3Cpath fill='%234872f9' d='M761.76,600h0l200-346.16H550.12l-400,692.32H961.76ZM573.41,274H926.82L750.12,579.85ZM550.12,926H185.06L555.94,284.07,738.47,600Zm23.29,0L750.12,620.15,926.82,926Z'/%3E%3C/svg%3E">`;
