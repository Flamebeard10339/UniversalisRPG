# offline-progression

## Deliverable

Nothing in the engine reads a real clock — `state.time` is purely simulated, and closing the app
freezes the world. This branch reconciles the gap, using `resolve()` as the seam its own doc comment
already names: a span of real elapsed time is clamped to a tuning cap and handed to `resolve()`
exactly the way any other wait is. No new time-advancement mechanism, no new randomness path, no new
pool-settlement math. The only new code is the clamp, the entry point, and the moment it fires.

**That moment is reopening the app, and it is deliberately not loading a save.** The two are
separable and must stay separated: a save has to load back to exactly what was written, or importing
a week-old export would burn the whole offline cap before the player saw the state they imported.
So reconciliation happens after a session exists, driven by a span the caller supplies, and no load
path — `/import`, a `# save` fixture, a `# test` doing `load:` — advances time by a millisecond.

Where the span comes from follows from that. It cannot be a field inside the save, because then an
imported save would carry someone else's clock. It also cannot be a bare "last active" stamp: with
autosave set to never, the state resumed is the last one the store actually wrote, and the span that
state never lived through is the one between its write and the player's last activity. So the stamp
records **when the store wrote the slot being resumed**, and lives with the store rather than in the
save payload. A payload with no store stamp reconciles nothing, which is what keeps fixtures and
imports inert for free rather than by special-casing them.

A capped span run in one shot is also the shape most likely to expose
`deterministic-on-empty-granularity`, an open finding `resolve()` names in its own comment: a
deterministic repeating action applies its whole batch at segment granularity, so a pool its results
drain fires `on empty:` late. Offline catch-up is definitionally the longest single `resolve()` call
the game ever makes, which is exactly what maximises how far a grind overruns a `stop` before the
engine notices. Left unfixed, the feature's headline case — leave a grind running, come back later —
is how a player discovers the bug. So it is fixed first and reconciled second.

| the situation                                    | what happens                                          |
| ------------------------------------------------ | ----------------------------------------------------- |
| app reopened ten minutes after the store wrote     | the world advances 600s through `resolve()`            |
| app reopened three days after the store wrote      | advances `offline-span-cap` and no further             |
| app reopened with the clock rolled back            | clamps to zero; nothing advances, nothing throws       |
| a save is loaded, or an export is imported         | **nothing advances** — the state is what was written   |
| a `# test` does `load: <id>`                       | nothing advances; fixtures carry no store stamp        |
| `offline: <seconds>` in a `# test`                 | advances exactly that span, deterministically          |
| autosave set to never, then the app is reopened    | the span is measured from the last slot the store wrote, not from when the player last acted |

Row four is the whole reason the entry point is not part of `loadSave`. Row seven is why the stamp
belongs to the store's slot rather than to the session.

`resolve()`'s existing four-hour test at `resolve.test.ts:845` already proves a span this large stays
inside the safe-integer range, and `resolve()`'s loop is bounded by the number of segment boundaries
in the span rather than by its wall-clock length, so neither is reproven here.

Proof:

- [c1] A deterministic repeating action settles `on empty:` at the instant a result drains the pool,
  matching the per-attempt path's `drainedAPool` behaviour, instead of at segment end. The existing
  reproduction — a repeating deterministic action draining 12 vigor per attempt against a 30-vigor
  pool whose `on empty:` carries `stop` — banks the same trophy count resolved in one shot as split
  at 3s and 10s boundaries, which is the associativity every other documented case of `resolve()`
  already has.
  proof: vitest src/runtime/runtime.test.ts
- [c2] `# variable offline-span-cap` is declared in seconds with a default of 14400, read through an
  accessor in `src/runtime/tuning.ts` in the same shape as `travelSecondsPerUnit` and `contestSpread`,
  and refused below zero at load time rather than silently clamped.
  proof: vitest src/runtime/tuning.test.ts
- [c3] Reconciliation is an entry point that takes an elapsed span, clamps it to `offlineSpanCap`,
  converts to integer milliseconds and calls the existing `resolve()`. It reads no clock itself, so
  `state.ts`'s "nothing in the engine reads a real clock" invariant is intact and every case is a
  test with a number rather than a test with a stub.
  proof: vitest src/runtime/session.test.ts
- [c4] No load path advances time. Loading a save, importing an export, and a `# test` running
  `load: <id>` all leave `state.time` exactly where the saved state left it, and every shipped
  `# test` passes byte-identical. A save loads back to what was written or the feature has corrupted
  it.
  proof: npm test
- [c5] The span is measured from when the store wrote the slot being resumed, and a payload carrying
  no store stamp reconciles nothing. An imported export and a `# save` fixture are inert without a
  case written for them, and with autosave set to never the span is still the one the resumed state
  did not live through rather than the one since the player last acted.
  proof: vitest src/runtime/session.test.ts
- [c6] A negative or zero span clamps to zero rather than throwing. `resolve()` throws if asked to
  move backwards, and the entry point is what makes sure it is never asked.
  proof: vitest src/runtime/session.test.ts
- [c7] An `offline: <seconds>` directive mirrors `wait:`'s grammar and runs through `applyDirective`,
  so a content author records "the player was gone N seconds" as a `# test` the same way they already
  record a wait — which is the regression format this repository asks for instead of an ad-hoc
  script.
  proof: vitest src/content/test.test.ts
- [c8] The save format is unchanged. No `GameState` field, no `SaveDiff` field, no envelope field, no
  `SAVE_VERSION` bump, and a save written before this branch loads exactly as it did. The stamp this
  feature needs is the store's, and the store is `auto-save-export-and-load`'s.
  proof: npm test
- [c9] An outstanding `pendingModal` survives reconciliation untouched. `resolve()` neither reads nor
  gates on it for a player who stays online, so nothing is invented for the offline case.
  proof: vitest src/runtime/session.test.ts

## Decisions

- **Reconciliation is an app-reopen event, not part of loading.** Coupling them would mean a save
  that changes when you open it, and `/import` is the case that makes it obvious: an export restored
  a week later would spend the entire cap before the player saw it. Keeping them separate also means
  a failure in reconciliation cannot reach the bytes on disk, because the save was already loaded
  verbatim and nothing wrote back.
- **The stamp is store metadata, not save content.** In the save it would travel with an export and
  carry a stranger's clock. As a bare "last active" it would be wrong whenever autosave is off, since
  the state resumed is the last slot the store wrote and the span it missed starts there, not at the
  player's last action. Recording when the store wrote the slot is right in both cases, and it makes
  fixtures and imports inert by construction rather than by exception.
- **This branch depends on `auto-save-export-and-load` and does not build a store.** An earlier draft
  deferred producing the elapsed span to "whichever branch builds that layer", and no such branch
  existed in the store — 575 records, none of them a save-storage task, so the deferral pointed
  nowhere and the feature would have shipped unreachable outside its own test directive. The task now
  exists and this waits on it.
- **`deterministic-on-empty-granularity` is a prerequisite, not a parallel concern.** It is
  pre-existing and not caused here, but it is orthogonal only in origin. Offline catch-up is the
  longest single `resolve()` call the game makes, which is the shape that maximises the overrun, so
  the feature's headline case would be the bug's discovery route. Ordered first inside this spec.
- **`saturated-pool-rate-associativity` is noted and not required.** It is about what one segment does
  when it settles a pool already at its rate's ceiling — a property of segment boundaries, not of the
  span around them. A four-hour call and a four-second one hit it under the same condition with the
  same segment-local cause, so the cap changes nothing about exposure.
- **`resolve-forward-progress-guard` stays out of scope.** Its own evidence puts the degenerate case
  above roughly 600k/min drain, a threshold the length of the span does not move. Being the first
  caller to routinely hand `resolve()` multi-hour spans does not change what rate reaches that
  failure mode.
- **The cap keeps its settled name and seconds convention.** `offline-span-cap` at 14400 was settled
  2026-07-29 with the task record; renaming needs a reason this branch does not have. Seconds matches
  every other authored tuning variable, and the accessor is where the conversion to milliseconds
  belongs.
- **No "while you were away" narration.** `view()`'s `elideMiddle` already bounds how much of a long
  reconciliation's log reaches a caller. A summary screen or a floating-text digest is UI work over a
  UI that does not exist.

## Open questions

- Whether the reconciliation entry point lives beside `startSession` or is a separate call the caller
  makes after it is the worker's call once the region is read. c3 fixes that it takes a span and
  reads no clock, which is what keeps either shape testable.
- `first-class-modals` also forecasts writing `session.ts` and `test.ts`. Both grants are forecasts
  and neither side has read the region, so `tasks plan` grades it a note rather than a defect — but
  if that branch starts first, `offline:` and its directive spelling touch the same `applyDirective`.
