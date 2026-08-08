# result-application-seam

## Deliverable

`applyResults` is the chokepoint three queued branches each need to change in a different way, which
is the report `tasks plan` gives when it says a plan concentrated in one file is one change. The
cause is that result application conflates three questions: what a result *is*, *who* it applies to,
and *what else* observes that it happened. Today the second is answered by a hardcoded `PLAYER` and
the third has no answer at all, so every consumer must edit the switch. This branch separates them,
and it is deliberately a refactor: no authored content behaves differently when it merges. It ships
nothing a player can see, and that is the point — it exists so that modals, skill events and combat
hooks each extend one seam instead of three rewrites of one function landing on top of each other.

Proof:

- [c1] A result carries a subject actor. `applyResults` takes the actor a result applies to rather than
  naming `PLAYER` inside itself, and the existing call sites pass the player explicitly.
- [c2] Applying a result is observable. There is one place where "this result was applied, to this actor,
  with this magnitude" can be watched, and a consumer subscribes there instead of adding a case to
  the switch or a call beside it.
- [c3] Nothing observable changes. Every `# test` in shipped content passes unchanged and byte-identical:
  the same saves compare equal, the same log lines appear in the same order, and no `expect:` save
  is regenerated as part of this branch. A refactor that needs a fixture rewritten has changed
  behaviour it claimed not to.
- [c4] The save format is unchanged by this branch, or moves once here rather than once in each of the
  branches that follow.
- [c5] The three queued branches stop concentrating. After this lands, `tasks plan` over
  `first-class-modals`, `skill-levels-xp-events` and `combat-events` no longer reports all of them
  writing `src/runtime/effects.ts`.

## Decisions

- **A seam branch, not a seam smuggled into the first consumer.** Whoever landed it first would be
  making an architectural change under a feature's name, and the two behind them would review it as
  incidental diff. Three branches needing one change is the argument for a fourth, not for letting
  one of them grow.
- **The refactor ships no behaviour.** Its whole proof is that nothing changed, which is only
  checkable if nothing was supposed to. Bundling even one small improvement forfeits that.
- **Everything downstream is strictly sequential.** This branch, then `first-class-modals`, then
  `skill-levels-xp-events`, then `combat-events`. They are not independent work that happens to
  collide; each needs the shape the previous one settles.

## Open questions

- Whether the observation point is a return value, a callback, or an accumulated list on the segment
  is left to the first slice. The clause is that exactly one such place exists, not what it is —
  choosing it needs the region read, and the worker who reads it corrects this grant anyway.

## Audit passes

### Pass 1 — 2026-08-08

- base: `84273ec336f9d2159a8c6431764a058eb2d22921`
- head: `e60e670063a32e2492bb2d4c11d212e6f657deb5`
- proof 1: met — applyOne and applyResults thread `actor` through every switch case and every recursive wrapper call (say/set/unset/add/give/take/xp/relocate/discover/open-modal/pool/stop/chance/contest/gate/one-of/roll); grep across src confirms no call site to applyResults omits an explicit actor, and the three production call sites (runtime.ts:226, runtime.ts:325, effects.ts:225 applyResultsNow) all pass PLAYER by name rather than a default. Mutation manifest audit-result-application-seam-pass1-mutations.json, run 2026-08-08: c1-pool-actor-hardcoded (effects.ts:193, actor->PLAYER) KILLED by effects.test.ts's two actor-scoping tests. Gap: c1-gate-actor-not-threaded (effects.ts:210) and c1-roll-actor-not-threaded (effects.ts:218) both SURVIVED at whole-suite scope (0 failed of 2065) — the code is correct but untested for two of five wrapper kinds; filed as actor-threading-through-gate-and-roll-wrappers-is-unprotecte.
- proof 2: met — segment.observers (populated by newSegment, default RESULT_OBSERVERS=[narrateModal]) is the sole dispatch point; applyResults calls every observer once per genuinely-applied result and skips wrappers (magnitude undefined). Mutation c2-wrapper-leaks-into-observers (effects.ts:138, removing the `magnitude === undefined` guard) KILLED by effects.test.ts's watching-tests (2 failed of 6, re-confirmed at file scope). effects.test.ts:60-119 exercises actor/kind/magnitude reporting, no-wrapper-reporting, non-lead say: suppression, and default-vs-bare observer wiring. Caveat, not a defect in the clause as literally stated: RESULT_OBSERVERS and narrateModal are module-private (effects.ts:40,47; not in the export list at effects.ts's exports), and newSegment's observers param replaces rather than composes with the default — a downstream consumer cannot add to the list used by the three production call sites without either importing something unexported or editing effects.ts's array. Filed as the-observer-list-has-no-additive-registration-path-so-a-fut. This bears on whether c5 holds once first-class-modals/skill-levels-xp-events/combat-events actually land, not on whether c2 holds today.
- proof 3: met — git diff --stat over 84273ec336f9d2159a8c6431764a058eb2d22921..e60e670063a32e2492bb2d4c11d212e6f657deb5 touches only src/runtime/{effects.ts,effects.test.ts,runtime.ts} and store/doc files (docs/audits/systems.json, docs/events.jsonl, docs/tasks.jsonl) — zero paths under content/ or any *.dsl file, so no `expect:` save fixture is regenerated and no # test text changed. Standalone `npm test -- --reporter=dot` run 2026-08-08: 78 files, 2065 tests, all passed, including src/runtime/integration.test.ts which replays every shipped # test. All three production Segment-construction sites (runtime.ts:226,325,351 via newSegment) keep default modal-narration wiring, matching the old switch's unconditional inline log push for a leading open-modal result.
- proof 4: met — grep for Segment/ResultObserver/ResultApplication/observers across src/runtime/save.ts returns no matches — the new types and the Segment.observers field are a per-resolve-call, in-memory construct built by newSegment and never serialized. The diff makes no change to save.ts, and no field of GameState (log/flags/inventory/xp/pendingModal/location/etc.) changes shape; only applyResults' and Segment's own signatures change.
- proof 5: met — `npm run tasks -- plan first-class-modals skill-levels-xp-events combat-events` (2026-08-08) reports 2 note-level findings (blocking chain only) and no cohesion finding: only first-class-modals' writes grant lists src/runtime/effects.ts; skill-levels-xp-events and combat-events do not. Re-runnable as stated. Caveat: `git show 84273ec336f9d2159a8c6431764a058eb2d22921:docs/tasks.jsonl` shows both downstream grants already excluded effects.ts at this branch's own merge base, before any of this branch's code existed — so the absence of a cohesion finding predates and is not caused by this branch, matching this branch's own event-log note (2026-08-08T22:39:31Z on result-application-seam: "c5 already held before this branch... not evidence of anything this branch did"). Whether the seam this branch built actually lets those two branches avoid effects.ts once implemented is undemonstrated — see the-observer-list-has-no-additive-registration-path-so-a-fut.
