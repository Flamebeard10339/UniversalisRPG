# Memory snapshot (pre-DSL-teardown)

Verbatim copy of the assistant's persistent memory index and memory files as
they stood on 2026-07-11, immediately before `project_dsl_flag_declaration_gotcha.md`
and its index entry were pruned from the live memory store (the gotcha it
describes no longer applies once the module-conflict-cascade validator it names
is deleted). The other two memories here are not DSL-specific and remain live
in memory unchanged — they're included in this snapshot only for completeness.

---

## MEMORY.md (index, as it stood)

- [Prefer extending window.__test harness over DOM-scraping](feedback_prefer_test_harness.md) — user explicitly stopped a session over this; use/extend the harness, not textContent-scanning
- [DSL/JSON undeclared-flag module-conflict-cascade](project_dsl_flag_declaration_gotcha.md) — referencing a flag via set:/unset: without declaring it silently disables the whole module
- [Pause for manual UI testing instead of self-verifying](feedback_pause_for_manual_ui_testing.md) — for UI/visual polish, implement then ask user to test rather than looping preview tools
