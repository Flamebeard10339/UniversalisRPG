---
name: project_dsl_flag_declaration_gotcha
description: "DSL/JSON authoring - referencing a flag via set:/unset: without declaring it in the module's flags list silently disables the whole module (module-conflict-cascade), not a parse error"
metadata:
  node_type: memory
  type: project
  originSessionId: 6f13198e-6c7f-46bc-a966-d90f427c960d
---

Referencing a brand-new flag id only via `set:`/`unset:` (or an action reward) in a content DSL module or raw JSON module — without also adding an explicit entry for it in that module's `flags` array (in DSL: the `# advanced` block's `"flags": [...]`) — compiles/validates with no error, but causes `applyModulesToBundle`'s semantic-conflict check (`validateModuleSemanticChanges` in `src/game/contentModules.ts`) to disable the *entire module* (a `validation.moduleConflictDisabled` warning naming the undeclared flag as the `key`), cascading to disable every module that depends on it too.

**Why:** this is the exact "module-conflict-cascade" failure mode already documented in `CLAUDE.md`'s Content pipeline section ("A validation gap in one new action/item can silently disable unrelated modules... this has happened twice") — confirmed here as a third concrete trigger. It's dangerous specifically because the failure is a `warning`-severity issue buried among dozens of unrelated `missingLocalization` warnings, not a compile error, so nothing in the DSL editor UI currently calls it out — a content author sees "compiled successfully" and no in-game change, with no obvious signal why.

**How to apply:** when authoring or reviewing DSL/JSON content that adds a new flag reference, always check it has a matching explicit declaration in the module's flags list. When debugging "my edit isn't showing up in-game" for this project, check `window.__test.modules.getIssues()` (see [[feedback_prefer_test_harness]]) for `moduleConflictDisabled`/`moduleDisabled` entries before assuming a merge/store bug — this is cheap to check and was the actual root cause the one time it looked like a deeper engine bug. Longer-term, this UX gap (silent warning-level cascade) is worth surfacing more prominently in `DslModuleEditor.tsx` — e.g. a distinct banner when the just-edited module ends up in a `moduleDisabled`/`moduleConflictDisabled` issue after a successful compile — rather than requiring a manual issues-list scan.

**Retired 2026-07-11:** the module-conflict-cascade validator this describes (`resolveAndApplyModules`/`validateModuleSemanticChanges` in `src/game/contentModules.ts`) was deleted as part of the DSL/JSON content pipeline teardown (see `../postmortem.md`). This memory no longer applies to the live codebase and was removed from the active memory store; kept here as a historical snapshot. The cascade-blame-and-disable-whole-module design this describes is exactly the kind of failure mode the rewrite (`../implementation-plan.md`) is meant to design out from the start, not just re-fix.
