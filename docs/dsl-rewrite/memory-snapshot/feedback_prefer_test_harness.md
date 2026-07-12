---
name: feedback-prefer-test-harness
description: Extend window.__test (src/game/testHarness.ts) instead of DOM textContent-scanning or clicking checkboxes when verifying UniversalisRPG behavior
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6f13198e-6c7f-46bc-a966-d90f427c960d
---

When verifying app behavior in the browser preview, default to extending/using the dev-only `window.__test` harness (`src/game/testHarness.ts`, mounted in `App.tsx`) rather than `Array.from(document.querySelectorAll(...)).find(textContent...)` or clicking checkboxes/buttons via CSS selectors guessed from the DOM.

**Why:** the user explicitly stopped a session where DOM textContent-scanning caused repeated wasted attempts (stale checkbox state, `:has-text()` not being valid CSS, ambiguous duplicate elements, a checkbox `onChange` race that looked like a bug but wasn't). They pointed at [[stable-semantic-agent-api-notes]] (a `.planning/stable-semantic-agent-api.md` note from another agent) and said textcontent-scanning is "slow and brittle" and "leads to a lot of wasted effort" — the fix is a stable, structured, non-DOM API, which this project already has the skeleton for (`window.__test`), it just needs new namespaces added as new UI surfaces appear (contribution mode, DSL editor, module enable/disable were all missing before this session).

**How to apply:** before reaching for `preview_eval` + DOM queries to drive a new UI surface (a new tab, a new store-backed toggle, a new editor), check whether `testHarness.ts` already exposes it. If not, add a new namespace there (deps-injected, unit-testable — see the file's existing `nav`/`modules`/`contribution`/`dsl` namespaces for the pattern) and wire concrete deps from `App.tsx`, rather than driving it via clicks/selectors. Reserve DOM-based interaction (`preview_click`/`preview_fill`) for things that are inherently about the DOM itself (visual layout, CSS, a11y tree) or for one-off exploratory checks, not for repeated state manipulation during a debugging loop. Also see [[project_dsl_flag_declaration_gotcha]] for a concrete case where the harness (not DOM-scanning) was what made root-causing tractable at all.

**Note (2026-07-11):** this memory is not DSL-specific and remains live in the active memory store unchanged after the DSL pipeline teardown — included in this snapshot folder only because it's cross-referenced by `project_dsl_flag_declaration_gotcha.md`, which was retired.
