# offline-progression

## Deliverable

Offline time isn't reconciled when a save loads: `state.time` is purely simulated, nothing in the
engine reads a real clock, and closing the app just freezes the world. This branch reconciles it,
using `resolve()` as the seam its own doc comment already names — a load-time call computes the
real-world span since the save was produced, clamps it to a tuning cap, and hands the clamped span
to `resolve()` exactly the way any other wait does. No new time-advancement mechanism, no new
randomness path, no new pool-settlement math: the only new code is the clamp and the call site.

A capped span run in one shot is also the shape most likely to expose
`deterministic-on-empty-granularity` — a deterministic repeating action already settles its whole
batch at segment end today, so a resource pool it drains fires `on empty:` late regardless of how the
branch reconciles. Left unfixed, a long capped catch-up is exactly the case that maximizes the lag
between when a `stop` should have fired and when it does. This branch fixes that first and reconciles
second, because the second is not trustworthy without the first.

`resolve()`'s existing "four-hour offline cap" test already proves the numeric side — a span this
large stays inside the safe-integer range — and the `while` loop in `resolve()` already bounds its
own work by the number of segment boundaries in the span (buff expiry, resource-empty instant, fight
completion), not by wall-clock duration, so neither is reproven here.

Proof:

- [c1] A `# variable offline-span-cap` (seconds, default 14400 — 4 hours) is declared in
  `src/content/tuningVariables.ts` and read through an `offlineSpanCap(registry)` accessor in
  `src/runtime/tuning.ts`, in the same shape as `travelSecondsPerUnit`/`contestSpread`: a registry
  lookup with a hardcoded default, refused below zero at load time rather than silently clamped.
- [c2] A deterministic repeating action's results settle `on empty:` at the instant a result drains
  the pool, matching the per-attempt path's `drainedAPool` behavior, instead of at segment end. The
  existing reproduction — a repeating deterministic action draining 12 vigor per attempt against a
  30-vigor pool whose `on empty:` carries `stop`, resolved over a 200s horizon — banks the same
  trophy count whether resolved in one shot or split at 3s/10s boundaries, matching the associativity
  every other documented case of `resolve()` already has.
  proof: vitest src/runtime/runtime.test.ts (deterministic on-empty case)
- [c3] A session-level entry point advances the game by a real-world elapsed span, clamped to
  `offlineSpanCap`, converted to integer milliseconds and handed to the existing `resolve()`: no
  parallel implementation of segment resolution, pool settlement, or combat.
- [c4] The entry point never reads a real clock itself — the elapsed span is a parameter the caller
  supplies — preserving `state.ts`'s "nothing reads a real clock" invariant for the engine core. This
  branch adds no field to `GameState` or `SaveDiff`, bumps no `SAVE_VERSION`, and builds no wall-clock
  persistence: there is no real save-storage layer yet to write it into (`# save` is a hand-authored
  test fixture format and `src/ui` has no storage wiring today), so producing the elapsed span from a
  stored timestamp is left to whichever branch builds that layer.
- [c5] A negative or zero elapsed span (clock rolled back, or genuinely no gap) clamps to zero rather
  than throwing — `resolve()` itself throws if asked to move backward, and the entry point is
  responsible for never asking it to.
- [c6] A `# test` directive, `offline: <seconds>`, is added to `src/content/test.ts` (mirroring
  `wait:`'s grammar) and wired through `applyDirective` in `src/runtime/session.ts`, so a content
  author can write a regression for "the player was gone N seconds" the same way they already write
  one for `wait:`. This is the only test surface the feature needs, per the repository's own
  preference for `# test` regressions over ad-hoc scripts.
- [c7] Reconciling a save with an outstanding `pendingModal` behaves exactly as it does online today:
  the modal survives untouched, and `resolve()` neither reads nor gates on it, so this branch adds no
  special-casing for it.
- [c8] The save format is unchanged by this branch: no new `GameState` field, no `SAVE_VERSION` bump,
  and a save written before this branch loads exactly as it did before — same shape of claim
  `skill-levels-xp-events` already made for its own change.

## Decisions

- **Adds one capability, extends none, takes over nothing, retires nothing.** Offline reconciliation
  is new; it is built entirely on the existing `resolve()` seam, `tuning.ts`'s existing
  variable-accessor pattern, and `test.ts`'s existing directive pattern. Nothing already claims this
  region for a conflicting purpose — the survey (`tasks where` over `runtime.ts`, `session.ts`,
  `state.ts`, `save.ts`, `effects.ts`, `tuningVariables.ts`, `tuning.ts`) turned up no ruling against
  reading real elapsed time at load and calling `resolve()` with it; the task record settling that
  approach (`offline-progression`, SETTLED 2026-07-29) is reused rather than re-derived.
- **`offline-span-cap` keeps the name and the seconds convention already settled.** The pre-existing
  task record named the variable and its 4-hour default; renaming it would need a reason this branch
  doesn't have. Seconds matches `travel-seconds-per-unit`'s convention rather than `state.time`'s own
  milliseconds, because every other authored tuning variable in the DSL is seconds-scaled and the
  accessor is exactly where the millisecond conversion belongs.
- **`deterministic-on-empty-granularity` is a prerequisite, not a parallel concern.** It is
  pre-existing and not introduced by this branch, but it is orthogonal only in origin, not in effect:
  offline reconciliation is definitionally a one-shot call over a span most online play never
  produces in one `resolve()` invocation, which is exactly the shape that maximizes how much a
  deterministic grind can overrun a `stop` before the engine notices. Shipping offline reconciliation
  without the fix would let the feature's own headline case (leave a grind running, come back later)
  be the main way a player discovers the bug. The task is attached to this spec and ordered first.
- **`saturated-pool-rate-associativity` is noted and not required.** That finding is about what a
  single segment does when it settles a pool already at its rate's ceiling — a property of segment
  boundaries, not of how many wall-clock hours the surrounding `resolve()` call spans. A four-hour
  offline call and a four-second online one hit the same bug under the same condition with the same
  segment-local cause; the cap doesn't change exposure, so this branch neither depends on it nor
  makes it worse.
- **`resolve-forward-progress-guard` stays out of scope.** Its own evidence says the degenerate case
  needs a drain rate above roughly 600k/min to reach the ULP class the integer conversion already
  closed, a threshold that doesn't move with the length of the span being resolved. Offline
  reconciliation is the first caller to routinely hand `resolve()` a multi-hour span in one call, but
  that doesn't change what rate is needed to reach the guard's failure mode, so adding it here would
  be scope beyond what this branch's own risk requires.
- **`pendingModal` gets no special handling.** It doesn't gate `resolve()` today for a player who
  stays online, so gating offline reconciliation on it would be new, inconsistent behavior invented
  for this branch rather than a rule the engine already has. [c7] pins the "no change" result down as
  a checkable clause instead of leaving it an assumption.
- **No ordering needed against `buffs-generalized`, `result-application-seam`, or
  `items-mods-and-crafting`.** All three write `state.ts`, `save.ts`, and/or `effects.ts`; this
  branch's two tasks write only `runtime.ts` (the granularity fix) and `session.ts` / `tuning.ts` /
  `tuningVariables.ts` / `test.ts` (the reconciliation entry point and its test surface), none of
  which those three claim. `first-class-modals` is the one real overlap — it also forecasts writing
  `session.ts` and `test.ts` — but it is itself `BLOCKED` on `result-application-seam` and neither
  side has read the region yet, so `tasks plan` grades the overlap as a note against two forecasts,
  not a defect between commitments. Worth a human glance if `first-class-modals` starts first: its
  own deliverable is directive spelling and open/close, which shouldn't collide with `offline:` in
  practice, but the two would touch the same functions in `applyDirective`.
- **No "while you were away" narration or UI is in scope.** `view()`'s existing `elideMiddle` already
  bounds how much of a long reconciliation's log reaches a caller; anything richer (a summary screen,
  a floating-text digest) is UI-rebuild work over a system that doesn't exist yet, not this branch's.

## Open questions

None.
