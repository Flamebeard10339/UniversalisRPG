---
name: feedback-pause-for-manual-ui-testing
description: "For UI/visual changes, pause and ask the user to manually test rather than self-verifying in the preview browser"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b96bb9a9-d842-4f93-ba30-05bc2e80157b
---

For UI/visual polish work (layout, positioning, drag gestures, touch targets — the
kind of thing that needs a human eye or a real device), stop after implementing and
ask the user to manually test and give feedback, rather than spending turns trying to
self-verify via `preview_click`/`preview_eval`/screenshots.

**Why:** During the Home page redesign (chat panel + movement arrows resize/collapse
work), the session's preview browser tab was in a persistently degraded state
(`document.hidden` stuck `true`, `ResizeObserver` never firing, `position:fixed`
elements computing impossible geometry, stale DOM node references after re-renders
producing false-negative read-after-click checks). This burned many tool calls
chasing phantom bugs that were actually environment artifacts, and even after correct
diagnosis, self-verification couldn't produce a confident pass/fail. The user
explicitly said after the session: "I feel like it would be faster and better if you
just ask me to test it ... and I can validate and provide feedback" — a direct
preference to skip self-verification for this class of change. This complements
[[feedback_prefer_test_harness]] (which is about *how* to verify programmatically when
verification is appropriate) — this memory is about *when* to skip verification
entirely and hand off to the user instead.

**How to apply:** After implementing a UI/visual change (especially layout, gesture,
touch-target, or drag-resize work), don't loop on `preview_*` tools trying to prove it
works. Do a quick sanity check if cheap (typecheck, tests, maybe one structural DOM
query), then stop and explicitly ask the user to test on their real device/browser and
report back — either via a direct question or by just pausing for their feedback.
Still fine to self-verify non-visual logic (state changes, computed values, non-UI
regressions) where the test harness gives a reliable signal.

**Note (2026-07-11):** this memory is not DSL-specific and remains live in the active
memory store unchanged after the DSL pipeline teardown — included in this snapshot
folder only for completeness alongside the retired DSL memory.
