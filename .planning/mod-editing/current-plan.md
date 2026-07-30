# DSL Content Migration Plan

## Summary
The quick-mod-editing plan this file used to track (map editing MVP, quick Add
primitives, graph-based dialogue editing) is complete and has been superseded: the
contribution UI is now DSL-first (see `docs/content-dsl-grammar.md`), and the old
grid-based editors it describes (`ModuleEditor.tsx`, `ContentDataEditor.tsx`,
`ContributionWorkbench.tsx`, `ContributionQuickWorkbench.tsx`) have been deleted along
with the Playwright pipeline that drove them. The new target is finishing the DSL
migration itself. Track progress here the same way; move finished bullets to
`completed.md`.

## Done — Port Tutorial Island modules to DSL
Every `tutorial-island-*` module (`foundation`, `guide-house`, `survival`, `reset`,
`bank`, `mining`, `combat`) and `wayside-supplies` is now DSL, verified through the real
`applyModulesToBundle` pipeline. See `completed.md` for the full list of DSL features
that had to be added along the way.

`base-core.json` is intentionally left as hand-written JSON — see CLAUDE.md's Content
pipeline section for why. Its old standalone starter-world content (crossroads/
emberwood/old-quarry) has since been removed entirely; it's now purely the shared
engine-plumbing foundation tutorial-island depends on (display profiles, resources with
custom effect/onFull/onEmpty wiring, an interactionType with an `experience` array).
Stats/skills/flags — which used to also be in this "no sugar" list — now have DSL sugar
(`# stat`, `# skill`, `# flags`; see the grammar doc); the remaining pieces still don't,
so porting the rest of base-core today would mean routing it through the `# advanced`
raw-JSON escape hatch anyway — little authoring benefit over leaving it as JSON. Revisit
only if/when the structural audit below adds real sugar for those remaining shapes.

## Next Slice — Structural audit (set assumptions aside)
Once all Tutorial Island content is DSL, do a systematic pass flagging inconsistencies
in the DSL/engine, not just accepting how it works today. Known candidates to examine,
surfaced while building the DSL editor and Edit-tab UI:
- The compiler's 2ⁿ inline-conditional variant expansion for `say:` text
  (`docs/content-dsl-grammar.md`'s "Inline conditional text" section) — could the
  engine instead evaluate conditional text natively at render time instead of
  pre-enumerating every truth-assignment as a separate action variant?
- `location.tags`' bare-word special case (the one place in the grammar an
  unrecognized bare word isn't an error) — does this generalize to other object kinds,
  or should it stay a location-only convention?
- Any other DSL/`ContentModule` inconsistency found by actually authoring all of
  Tutorial Island in DSL — write these up before touching code, then refactor unless
  there's a good reason not to.

## Later Slice — DSL/ContentModule refinement
Simplify and harden the grammar/compiler and `ContentModule` shape based on the audit's
findings, aiming to reduce edge cases rather than add more sugar.

## Test Plan
- `npx vitest run` (compiler/coverage tests, `applyModulesToBundle` merge tests) after
  every module port.
- Headless playtests through the ported module's content, matching CLAUDE.md's
  content-pipeline discipline (a validation gap in one module can silently disable
  unrelated modules via the module-conflict-cascade in `resolveAndApplyModules`).
- `node scripts/ui-smoke.mjs` for UI-visible regressions.

## Assumptions
- Modules are ported one at a time, oldest/smallest first is a reasonable default
  ordering but not required — whichever unblocks the next real content need first is
  fine.
- No engine/compile-target changes during the porting slice itself — that's deferred
  to the "Later Slice" once the audit identifies real problems to fix.
