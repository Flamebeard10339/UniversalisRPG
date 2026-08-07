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

## Audit passes

### Pass 1 — 2026-08-07

- base: `b56ba3ee30365f83e10738189ac42d94bcad295c`
- head: `007b8afedbe51c101c8dd168ca79f01c8b2f9a4e`
- proof 1: met — Mutation-measured, not asserted. Four mutations over the cap in src/runtime/runtime.ts, each KILLED by a
  named test in src/runtime/runtime.test.ts that passed unmutated and failed with the line broken, re-measured at its
  own file: c1-drain-cap-removed (completionsBeforeDrain -> Infinity) and c1-cap-off-by-one (Math.ceil(current /
  milliPerCompletion) -> +1) both die on "banks the third grind and no more over a 200s span, one-shot or split at 3s
  or 10s"; c1-rate-also-settling-the-pool-ignored (the "< 0" sign in alsoRated inverted) dies on "reads a rate settling
  the same pool, which crosses zero a grind before the results alone would"; c1-wrapper-drain-unseen (the nestedResults
  recursion deleted) dies on "walks a drain it cannot plan - one drawn from a selector - a completion at a time". The
  contingency this evidence carried on its first draft - drop to unmet if either of the first two survived - is
  DISCHARGED: both were KILLED, 1 of 37.
  Re-run with: npx vitest run --maxWorkers=4 src/runtime/runtime.test.ts -t "a deterministic batch settles" (4 green;
  full suite 1794/1794 at --maxWorkers=4, 41s).
  The tests are falsifiable, not structural: src/runtime/runtime.test.ts:445-601 pins ABSOLUTE outcomes before
  comparing splits - grindstone banks 3 trophies / vigor 0 / activeAction null / exactly one "Your vigor gutters out."
  at t=200s, and agrees one-shot with [3,200], [10,200], [1,2,3,4,200], [2.5,7.5,60,200]. The pre-fix reading of that
  same fixture was 200 / 3 / 10 for those splits (d9dd982's message), so every assertion was false before this commit.
  Mechanism: runtime.ts:143-159 completionsBeforeDrain over 109-136 collectDrainSites, consumed at 174-186.
  On the branch collapse the worker claimed was "exactly reproduced": re-derived rather than trusted, and it holds -
  with the drain term at Infinity the new Math.min is algebraically identical to the two branches it replaced, on all
  three shapes. (repeating && !stopsOnOutcome) reduces to min(Infinity, limit) = limit, including limit=0 and
  limit=Infinity; (repeating && stopsOnOutcome) reduces to 1 and runway = inFlight + max(0,0)*... = the old
  else-branch expression; (!repeating) likewise reduces to 1. inFlight is the old "remainingAttempts * duration -
  player.progress" character-for-character. EMPIRICALLY, two of those three shapes are covered and one is not:
  collapse-input-limit-term was KILLED 2 of 26 (resolve.test.ts "also holds when the action is input-limited partway
  through" AND "wait(1_000_000) with only 28 raw-shrimp ... quickly") and collapse-non-repeating-term KILLED 1 of 26
  (resolve.test.ts "grants a slow meal's buff on the armed path as well as the instant one"), but
  collapse-stops-on-outcome-term SURVIVED the whole suite, 0 failed of 1794. See the F5 finding on this pass: the
  evidence points at an equivalent mutant rather than an unwatched line, because fightBatch (src/runtime/actions.ts:130-133)
  caps a stops-on-outcome batch at one completion independently. Either way, no part of this clause's grade rests on
  that term, and the first draft of this evidence line was wrong to cite all three shapes as covered.
  Also verified, since the new code sets a boundary where the old left one unbounded: resolve() cannot spin. For a
  repeating action inFlight >= duration - progress > 0 whenever duration > 0, and duration <= 0 on a repeating action
  throws at runtime.ts:208 under both readings.
- proof 2: unknown — Not built and not looked at by anyone; recorded unknown rather than unmet because the member task
  declare-the-offline-span-cap-as-a-tuning-variable is still open and was never dispatched. What was checked, so the
  next pass does not repeat it: grep -rn "offline" src/ content/ finds only a test title at resolve.test.ts:845;
  src/runtime/tuning.ts exports travelSecondsPerUnit, minDamage, contestSpread, defaultActionDuration and no fifth
  accessor; src/runtime/tuning.test.ts (this clause's proof target) has no offline case. Nothing in d9dd982 touches
  tuning.ts.
- proof 3: unknown — No reconciliation entry point exists. src/runtime/session.ts exports startSession, view, apply, wait,
  beginAction, cancelAction, submitModal, applyDirective, runTest and nothing that takes an elapsed span. The
  invariant the clause promises to keep is intact today but vacuously: grep -rn "Date.now|performance.now" src/
  --include=*.ts excluding tests returns nothing, and src/runtime/state.ts:41 still carries "The one seam through
  which simulated time advances; nothing reads a real clock." d9dd982 adds no clock read. Nobody built or verified
  the clamp-and-call this clause is about.
- proof 4: unknown — Recorded unknown, not met: the clause is about a feature that does not exist, so a green tree proves
  nothing about it. The negative check that WAS run, so the next pass need not: applyDirective's "load:" case
  (src/runtime/session.ts:352-359) calls loadSave and resets dialogue/logCursor only - no resolve(), no time write;
  src/runtime/save.ts is not in this branch's diff at all; content/tutorial-island.dsl is unchanged, and
  integration.test.ts over its shipped "# test" sections passes byte-identical (full suite 1794/1794 at
  --maxWorkers=4). So d9dd982 does NOT violate this clause - but nothing has been verified about the load path in
  the presence of a reconciliation entry point, because there is none.
- proof 5: unknown — Nothing built. There is no store stamp, no store, and no span source: the spec's own Decisions record
  that this waits on auto-save-export-and-load. src/runtime/session.test.ts (this clause's proof target) has no case
  naming a store write or an inert import; its only "load:" case is line 203, a stale-save warning.
- proof 6: unknown — Nothing built. resolve() still throws on a backwards toTime (src/runtime/runtime.ts:410) and there is
  no entry point above it to clamp, so no negative-span case exists to grade. d9dd982 leaves both guards at
  runtime.ts:410-411 untouched.
- proof 7: unknown — No "offline:" directive. src/runtime/session.ts:315-373 switches on run/talk/choose/use/travel/craft/
  begin/assert/expect/load/cancel/wait/equip/unequip and nothing else; "wait:" (line 364) is the grammar it would
  mirror. src/content/test.test.ts, this clause's proof target, has no offline case.
- proof 8: unknown — Recorded unknown, not met, for the same reason as c4: the stamp this clause rules on does not exist, so
  "the save format is unchanged" is true of a tree that was never asked to change it. The negative check: this
  branch's diff (git diff --name-only b56ba3e..HEAD) does not include src/runtime/save.ts or src/runtime/state.ts;
  d9dd982 adds no GameState field, no SaveDiff field, no envelope field and no SAVE_VERSION change - its runtime.ts
  hunk is confined to nextBoundary and two new module-private helpers. src/runtime/save.test.ts passes unchanged.
  ADJACENCY the next pass should not lose, raised by this auditor but owned by the dangling-reference-on-field-edit
  finding: loadSave prunes fields holding no registry id (src/runtime/save.ts:49, prune: "holds no registry id") and
  warns, the behaviour save.test.ts:235 pins for mod.gem/mod.flag. A flag key wrongly undeclared at load is therefore
  a flag id a previously-valid save loses on load, with a warning rather than an error - which is the failure mode
  this clause exists to forbid, arriving from a direction the clause did not anticipate. "No GameState field changed"
  and "a save loads back to what was written" are not the same promise.
- proof 9: unknown — Nothing built, and nothing to survive. resolve() neither reads nor writes pendingModal before or after
  d9dd982 (grep -n pendingModal src/runtime/runtime.ts - no hits in the resolve path). src/runtime/session.test.ts
  has no reconciliation-with-outstanding-modal case because there is no reconciliation.
