# OSS Packaging — Open Questions & Decisions

Questions and concerns documented during the OSS packaging process.
Items marked [DONE] have been resolved; others need input.

## Resolved

- [DONE] **Package name**: `ax-js-platform` on npm, `Ax` as IIFE global
- [DONE] **License**: MIT, Copyright Meta Platforms, Inc.
- [DONE] **Three bundles**: `ax.js`, `ax-acquisition.js`, `ax-viz.js`
- [DONE] **Viz module**: Extracted shared demo utilities into `src/viz/index.ts`
- [DONE] **Author scrub**: Removed personal references from docs/SERIALIZATION_CONTRACT.md and CLAUDE.md

## For Discussion

### 1. [DONE] npm name availability
The name `ax-js` may already be taken on npm. Alternatives: `@ax-platform/js`, `axjs`, `ax-gp`.
Need to check `npm view ax-js` before first publish.

### 2. Demo duplication
The shared visualization code exists in two places:
- `src/viz/index.ts` — properly typed TypeScript module (for npm users)
- `demo/shared.js` — vanilla JS string literals (inlined into HTML demos)

This duplication is intentional: the demos inline code as strings for self-contained HTML files,
while the module provides a typed import path. A future refactor could have demos load
the IIFE bundle instead, but this would require updating all 10 demo modules to use
`Ax.viz.viridis()` instead of bare `viridis()`.

### 3. Python package distribution
Currently `axjs_export.py` and `_extraction.py` live in `python/` and are not pip-installable.
Options:
- (a) Keep as copy-paste scripts with `pip install ax-platform` as prerequisite
- (b) Create a small `ax-js-export` pip package
- (c) Propose upstream integration into `ax-platform` itself

The README currently documents option (a). If this goes into the Ax repo, (c) is the right answer.

### 4. GitHub repo organization
The package.json points to `github.com/eytan/ax-js`. If this should live under
`github.com/facebook/ax-js` or in the `ax` monorepo, the URLs need updating.

### 5. CI/CD
No GitHub Actions workflow has been set up yet. A basic CI would run:
- `npx tsc --noEmit`
- `npx vitest run`
- `npx tsup` (verify build succeeds)

This was deferred per user request but should be added before the first release.

### 6. Versioning strategy
Currently at `0.0.1`. Questions:
- When to bump to `1.0.0`? After Ax team review? After first external user?
- Should version be tied to Ax/BoTorch compatibility? (Currently tested against BoTorch 0.17.2)
- SemVer for the TypeScript API, but what about the JSON format? Breaking changes to
  `ExperimentState` schema could break existing exports.

### 7. Demo hosting
The demos are self-contained HTML files but need to be hosted somewhere for the README
links to work. Options:
- GitHub Pages from the `demo/` directory
- Include in npm package (increases package size significantly)
- Separate demo hosting

### 8. [DONE] `predictRelative` API alignment with Ax
Resolved: `predictRelative()` was removed from Predictor. Callers use
`predict()` + `relativizePredictions()` directly, matching Ax's separated pattern.
`getCovariances()` is available for covariance-aware relativization.

### 9. [PARTIAL] Embeddable viz components
The `ax-js/viz` module currently provides low-level building blocks (colormaps,
data-point rendering, tooltips). A future goal is higher-level embeddable components
(e.g., "render a response surface into this div") that users can drop into their
own applications without writing canvas code.
