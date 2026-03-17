# ax-js-platform Pre-Share Critique

Systematic review before sharing with Ax/BoTorch teams. Date: 2026-03-17.

---

## Fixed

### README.md
- **Line 107**: `ax-js/viz` changed to `ax-js-platform/viz` to match npm package name.

### docs/developer-guide.md
- **Line 306**: Stale `docs/FORMAT.md` reference updated to `docs/data-model.md`.

### docs/ax-js_vs_ax.md
- **Lines 264, 317**: All `docs/FORMAT.md` references updated to `docs/data-model.md`.
- **Line 145**: Removed `getClosestTrainingPoint()` from the comparison table -- this method does not exist in `src/predictor.ts` and was never implemented.

### docs/SERIALIZATION_CONTRACT.md
- **Line 30**: Stale fixture count "21" updated to "46".
- **Line 284**: Nonexistent `transforms/adapter.ts` changed to `transforms/outcome.ts`.
- **Line 288**: Stale fixture count "21" updated to "46".

### src/viz/index.ts
- **Lines 425-444**: Orphaned JSDoc block (for `renderHeatmap`) was stranded above the embeddable render functions section, attached to nothing. Moved to immediately above `renderHeatmap` at line 756.

### demo/DEMOS.md
- **Line 1**: Count remains "Nine" (matching the 9 demos in `build_demos.js`).
- **Lines 59, 66, 73, 81**: Demo numbering corrected (5 jumped to 7, now sequential 5-9).
- **Lines 91-96**: Removed ghost "quickstart" demo entry (#11) -- this demo does not exist as a source file, is not in `build_demos.js`, and is not in `index.html`.

### QUESTIONS.md
- **Line 8**: Package name corrected from `ax-js` to `ax-js-platform` in resolved item.
- **Line 52**: Version corrected from `0.1.0` to `0.0.1` to match `package.json`.
- **Lines 65-77**: `predictRelative` question (#8) marked as [DONE] -- method was removed; callers now use `predict()` + `relativizePredictions()`.

### TRANSFORM_TODOS.md
- **Lines 80, 131**: `FORMAT.md` references updated to `data-model.md`.

### .claude/commands/add-fixture.md
- **Line 45**: `TESTING.md` reference updated to `docs/testing.md`.

---

## Noted (Not Fixed)

### 1. Stale build artifact: `demo/preference_explorer.html`

This file is tracked in git but is a stale build output. The demo was renamed to `pbo.html` in `build_demos.js` but the old file was never deleted. It contains a stale `predictRelative` method in its inlined Predictor code. **Action**: Delete `demo/preference_explorer.html` from the repo.

### 2. `SERIALIZATION_CONTRACT.md` is significantly outdated

Beyond the fixture count fix above, this document has deeper staleness issues:
- Section header says "axjs" not "ax-js" throughout (lines 1, 6, 8, 105, 189, 253, 259)
- References `format_version: 2` in the schema (line 186, 195) but `ExperimentState` has no `format_version` field and never has
- Fixture coverage table (lines 32-43) lists only the original 21 fixtures, missing 25 newer ones
- Appendix file layout (lines 275-290) is stale

**Rationale for not fixing**: This is a proposal document for the Ax/BoTorch teams. Its purpose is to request API changes. Updating it fully would mean rewriting most of it, and it may be better to archive it and write a fresh version.

### 3. `NUMERICS.md`, `JUPYTER_FEASIBILITY.md`, `TRANSFORM_TODOS.md` -- internal development docs in repo root

These are working documents that were useful during development but are atypical for a public OSS repo root. They contain implementation notes, feasibility assessments, and task tracking. For sharing with external teams:
- **Option A**: Move to a `docs/internal/` directory
- **Option B**: Delete them (the information is captured in CLAUDE.md, developer-guide.md, and git history)
- **Option C**: Leave as-is (they provide useful context for reviewers)

### 4. `QUESTIONS.md` has unresolved items

Items 1-7, 9 are still marked "For Discussion". Several are outdated:
- Item 1 ("npm name availability"): Resolved -- it's `ax-js-platform`
- Item 4 ("GitHub repo organization"): Partially stale -- references `github.com/eytan/ax-js` but `package.json` already has `eytan/ax-js-platform`
- Item 9 ("Embeddable viz components"): Partially resolved -- `renderFeatureImportance`, `renderCrossValidation`, `renderOptimizationTrace` now exist in `src/viz/index.ts`

**Rationale**: These are discussion items for the review, not bugs. Marking them [DONE] is a product decision.

### 5. README title says "ax-js" but npm package is "ax-js-platform"

The README header is `# ax-js` and the IIFE global is `Ax`. The npm package name is `ax-js-platform`. This is confusing: is the project "ax-js" or "ax-js-platform"? The README uses both:
- Line 1: `# ax-js`
- Line 16: `npm install ax-js-platform`
- Line 46: `import { Predictor } from "ax-js-platform"`

**Recommendation**: Either rename the project to match the package name consistently, or add a note explaining that "ax-js" is the project name while "ax-js-platform" is the npm package name.

### 6. `demo/DEMOS.md` numbering gap from removed demo

DEMOS.md now has demos numbered 1-5 then 6-9 (sequential after fixes), but there's no #6 for the formerly-existing point_proximity demo. The count correctly says "Nine" matching the 9 demos in `build_demos.js`.

### 7. `src/viz/index.ts` render functions use `document` directly

`renderFeatureImportance`, `renderCrossValidation`, and `renderOptimizationTrace` create SVG elements using `document.createElementNS()`. This means they only work in browser environments, not Node.js/SSR. The functions are well-structured but lack any guard or error message for non-browser contexts. This is fine for their current use (demos + Jupyter), but would surprise someone trying to use them for server-side rendering.

### 8. `renderOptimizationTrace` has a correctness concern

Line 717: `const isBest = bestSoFar[i] === yVals[i]` uses strict equality on floats to determine if a trial set a new best. This works because `bestSoFar[i]` IS `yVals[i]` (same reference through `Math.min`/`Math.max`), but it's fragile -- a future refactor that copies values could break it silently.

### 9. `OBSERVATIONS.md` says ax-js uses model covariance "by default" for relativization

Line 70: "ax-js uses model covariance by default for tighter CIs -- this is an intentional improvement." However, with `predictRelative` removed, relativization is now manual via `relativizePredictions()`. There is no "default" anymore -- the caller explicitly passes covariances or not. The OBSERVATIONS.md description is slightly misleading.

### 10. `docs/SERIALIZATION_CONTRACT.md` references `src/transforms/adapter.ts`

Fixed the appendix reference, but the document overall refers to adapter transform types being in a separate file. In reality, `AdapterTransform` is defined in `src/models/types.ts`, and untransform logic is in `src/predictor.ts`. The doc's mental model of a separate adapter transform module doesn't match the code.

### 11. No `.gitignore` entry for `demo/*.html` build outputs

All demo HTML files are tracked in git even though they're generated build artifacts. This creates noise in diffs and risks stale files (like `preference_explorer.html`). Consider adding `demo/*.html` to `.gitignore` and generating them on demand, or at least documenting that they should be rebuilt before commits.

### 12. `test-report.txt` is a generated file tracked in git

This is regenerated on every test run. It will show up as modified in every developer's working tree. Consider adding to `.gitignore`.

### 13. `docs/ax-js_vs_ax.md` references `src/acquisition/acqf.ts`

Line 314 references `src/acquisition/acqf.ts` but there is no such file. The acquisition functions are split across `ucb.ts`, `log_ei.ts`, `thompson.ts`, `eubo.ts`.
