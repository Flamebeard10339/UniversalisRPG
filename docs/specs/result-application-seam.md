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
- **The observation point is a synchronous observer list carried on the segment**, settling the open
  question below. Not a return value and not an accumulated list read afterwards: a consumer's own
  log line has to interleave with the result that caused it, and skill level-ups and combat hooks
  both narrate next to the result that fired them. `RESULT_OBSERVERS` in `effects.ts` is the default
  list every production segment carries, and it is exported so a caller building its own segment can
  spread it.
- **Joining that list is a one-line append to `effects.ts`, and that is the sanctioned extension
  path.** A subscriber manifest is static by construction: the segments the game runs are built
  inside the engine, so nothing downstream can reach them without a shared file naming it. This is
  what the branch actually bought — three branches append one line each and write their own module,
  instead of three rewrites of `applyResults` landing on top of each other. It is *not* what c5
  measures. `tasks plan`'s cohesion check is path-level and cannot tell those two apart, so c5 is
  satisfiable only by moving the manifest to a second file, which would relocate the report rather
  than remove it. Recorded here rather than repaired: the clause names the wrong measurement, and
  `first-class-modals`, `skill-levels-xp-events` and `combat-events` will each need `effects.ts` in
  their grant when their workers correct them.

## Open questions

- Whether the observation point is a return value, a callback, or an accumulated list on the segment
  is left to the first slice. The clause is that exactly one such place exists, not what it is —
  choosing it needs the region read, and the worker who reads it corrects this grant anyway.
  *Answered in Decisions above.*

## Audit passes

### Pass 1 — 2026-08-08

- base: `84273ec336f9d2159a8c6431764a058eb2d22921`
- head: `e60e670063a32e2492bb2d4c11d212e6f657deb5`
- proof 1: met — applyOne and applyResults thread `actor` through every switch case and every recursive wrapper call (say/set/unset/add/give/take/xp/relocate/discover/open-modal/pool/stop/chance/contest/gate/one-of/roll); grep across src confirms no call site to applyResults omits an explicit actor, and the three production call sites (runtime.ts:226, runtime.ts:325, effects.ts:225 applyResultsNow) all pass PLAYER by name rather than a default. Mutation manifest audit-result-application-seam-pass1-mutations.json, run 2026-08-08: c1-pool-actor-hardcoded (effects.ts:193, actor->PLAYER) KILLED by effects.test.ts's two actor-scoping tests. Gap: c1-gate-actor-not-threaded (effects.ts:210) and c1-roll-actor-not-threaded (effects.ts:218) both SURVIVED at whole-suite scope (0 failed of 2065) — the code is correct but untested for two of five wrapper kinds; filed as actor-threading-through-gate-and-roll-wrappers-is-unprotecte.
- proof 2: met — segment.observers (populated by newSegment, default RESULT_OBSERVERS=[narrateModal]) is the sole dispatch point; applyResults calls every observer once per genuinely-applied result and skips wrappers (magnitude undefined). Mutation c2-wrapper-leaks-into-observers (effects.ts:138, removing the `magnitude === undefined` guard) KILLED by effects.test.ts's watching-tests (2 failed of 6, re-confirmed at file scope). effects.test.ts:60-119 exercises actor/kind/magnitude reporting, no-wrapper-reporting, non-lead say: suppression, and default-vs-bare observer wiring. Caveat, not a defect in the clause as literally stated: RESULT_OBSERVERS and narrateModal are module-private (effects.ts:40,47; not in the export list at effects.ts's exports), and newSegment's observers param replaces rather than composes with the default — a downstream consumer cannot add to the list used by the three production call sites without either importing something unexported or editing effects.ts's array. Filed as the-observer-list-has-no-additive-registration-path-so-a-fut. This bears on whether c5 holds once first-class-modals/skill-levels-xp-events/combat-events actually land, not on whether c2 holds today.
- proof 3: met — git diff --stat over 84273ec336f9d2159a8c6431764a058eb2d22921..e60e670063a32e2492bb2d4c11d212e6f657deb5 touches only src/runtime/{effects.ts,effects.test.ts,runtime.ts} and store/doc files (docs/audits/systems.json, docs/events.jsonl, docs/tasks.jsonl) — zero paths under content/ or any *.dsl file, so no `expect:` save fixture is regenerated and no # test text changed. Standalone `npm test -- --reporter=dot` run 2026-08-08: 78 files, 2065 tests, all passed, including src/runtime/integration.test.ts which replays every shipped # test. All three production Segment-construction sites (runtime.ts:226,325,351 via newSegment) keep default modal-narration wiring, matching the old switch's unconditional inline log push for a leading open-modal result.
- proof 4: met — grep for Segment/ResultObserver/ResultApplication/observers across src/runtime/save.ts returns no matches — the new types and the Segment.observers field are a per-resolve-call, in-memory construct built by newSegment and never serialized. The diff makes no change to save.ts, and no field of GameState (log/flags/inventory/xp/pendingModal/location/etc.) changes shape; only applyResults' and Segment's own signatures change.
- proof 5: met — `npm run tasks -- plan first-class-modals skill-levels-xp-events combat-events` (2026-08-08) reports 2 note-level findings (blocking chain only) and no cohesion finding: only first-class-modals' writes grant lists src/runtime/effects.ts; skill-levels-xp-events and combat-events do not. Re-runnable as stated. Caveat: `git show 84273ec336f9d2159a8c6431764a058eb2d22921:docs/tasks.jsonl` shows both downstream grants already excluded effects.ts at this branch's own merge base, before any of this branch's code existed — so the absence of a cohesion finding predates and is not caused by this branch, matching this branch's own event-log note (2026-08-08T22:39:31Z on result-application-seam: "c5 already held before this branch... not evidence of anything this branch did"). Whether the seam this branch built actually lets those two branches avoid effects.ts once implemented is undemonstrated — see the-observer-list-has-no-additive-registration-path-so-a-fut.

### Pass 2 — 2026-08-08

- base: `84273ec336f9d2159a8c6431764a058eb2d22921`
- head: `20e3221e3aad8882bf47ff8c308e5f6846e64d54`
- proof 1: met — Reconfirms pass 1 with the gap closed: the every-wrapper droptable fixture added in effects.test.ts (carries the actor into the body of every wrapper kind / carries the actor into each repetition of a batch that samples per application, lines 74-94) now exercises all five wrapper kinds (chance/contest/gate/one-of/roll) with actor='brute', asserting both getDelta(deltas,'brute','health')===toMilliUnits(-25) and getDelta(deltas,PLAYER,'health')===0, so any single wrapper misattributing to PLAYER is caught by both the totals and the player-stays-zero check; the count=3 variant additionally exercises the sampled-batch repetition loop. Per this brief's instruction not to re-run already-run mutations: c1-gate-actor-not-threaded and c1-roll-actor-not-threaded (effects.ts:210,218) are recorded KILLED on the current tree, closing finding actor-threading-through-gate-and-roll-wrappers-is-unprotecte. Pass-2 new mutations (audit-result-application-seam-pass2-mutations.json, run 2026-08-08): c2-wrapper-body-inherits-outer-lead-instead-of-its-own (effects.ts chance case, threading the enclosing lead into a wrapper body instead of the documented always-true default) KILLED by dropTable.test.ts's pre-existing 'lets a say inside a wrapper speak on every repetition that reaches it'; applyResultsNow-actor-swapped-for-wrong-constant (effects.ts:226, PLAYER -> 'nobody', all-scope) KILLED by resource.test.ts's drain/restore tests. No survivors found hunting this clause's neighbours.
- proof 2: met — segment.observers remains the sole dispatch point (effects.ts:140), unchanged in shape from pass 1. The pass-1 caveat (RESULT_OBSERVERS/narrateModal module-private) is partially addressed: RESULT_OBSERVERS is now exported (effects.ts:48) and effects.test.ts:158-167 proves a caller building its own segment can spread it alongside a new observer. Grading this met on the literal clause text ("a consumer subscribes there instead of adding a case to the switch") — the subscription point exists and composition is possible for a caller that builds its own segment. What exporting RESULT_OBSERVERS does NOT do is give the three production Segment-construction sites (runtime.ts:351, effects.ts:225 inside applyResultsNow — grepped, these are the only two production newSegment call sites in src, both call it with no observers argument, i.e. always the bare default) a composition path: a downstream module still cannot make the actual game loop honor its observer without either editing RESULT_OBSERVERS's array literal in effects.ts or editing one of those two call sites. That gap is what c5 measures and is graded there, not here.
- proof 3: met — git diff --stat 84273ec336f9d2159a8c6431764a058eb2d22921..HEAD (20e3221, the full pass-2 range) touching non-docs paths shows exactly three files: src/runtime/effects.test.ts, src/runtime/effects.ts, src/runtime/runtime.ts — zero paths under content/ or any *.dsl file, so no # test text or expect: save fixture changed anywhere in this branch's full range, not just its pass-1 prefix. npm run tasks -- merge-ready (2026-08-08) reports npm test ok pass and tree ok pass (nothing uncommitted), reconfirming the full 2065+-test suite green on the current tree.
- proof 4: met — Unchanged from pass 1: src/runtime/save.ts is not in the pass-2 diff (confirmed by the three-file diff --stat above), and grep for Segment/ResultObserver/ResultApplication/observers across save.ts still returns no matches. No field of GameState changes shape in this branch's full range.
- proof 5: unmet — Grading this unmet on adversarial re-review of the branch's own new Decisions entry (docs/specs/result-application-seam.md, added this pass), which argues c5 names the wrong measurement because tasks plan's cohesionFinding (scripts/lib/planCheck.ts:201-223) is path-level and cannot distinguish three rewrites of applyResults from three one-line appends to a subscriber manifest. That premise is correct — cohesionFinding only counts how many of a plan's writes grants list a given normalized path (fires only when a single path is named by ALL granted tasks in a 3-task plan, since the threshold is worst>=3 and worst>=granted.length-1) — but the conclusion (a shared manifest is unavoidable, so the clause should be recorded as measuring the wrong thing rather than repaired) does not follow, for two independent reasons. First, the Decision's own last sentence concedes the mechanism does not yet deliver what c5 promises: 'first-class-modals, skill-levels-xp-events and combat-events will each need effects.ts in their grant when their workers correct them' — i.e. the branch predicts, in its own words, that once those three specs' writes grants are corrected to reflect the sanctioned extension path (append a line to RESULT_OBSERVERS in effects.ts), all three will name effects.ts and cohesionFinding's 3-of-3 threshold will fire, reproducing exactly the report c5 exists to eliminate. Today's tasks plan run (npm run tasks -- plan first-class-modals skill-levels-xp-events combat-events, 2026-08-08) shows only first-class-modals' grant lists effects.ts; skill-levels-xp-events and combat-events do not yet, which is why no cohesion finding fires now — but that absence is the pre-branch state pass 1 already flagged as not caused by this branch, now additionally contradicted by this branch's own prediction of what those grants should say once corrected. Second, a materially different shape was available and not evaluated: exporting a mutable registration function (e.g. registerResultObserver(observer): void, pushing onto the backing array RESULT_OBSERVERS already binds by reference) instead of (or alongside) a spreadable const array would let each downstream module self-register with a single call inside its own already-owned file (e.g. skills.ts calling registerResultObserver(narrateSkillLevelUp) at module load), reaching the two production newSegment call sites (runtime.ts:351, effects.ts:225) automatically via their existing default-parameter reference to RESULT_OBSERVERS, with zero edits to effects.ts's source and hence a legitimately effects.ts-free writes grant for all three downstream branches. This is not 'moving the manifest to a second file' (the alternative the Decision considered and dismissed as relocating rather than removing the report) — it eliminates the need to co-edit a manifest at all, which the Decision's 'nothing downstream can reach them without a shared file naming it' claim did not consider and is therefore not established. Filed as the-observer-list-composes-by-array-literal-not-by-push, discharging c5 as undelivered pending either that redesign or an honest correction of the Decision text and the two downstream grants. Note per this brief's override: deferred is not used here because docs/specs/result-application-seam.md carries no ## Goal line to weigh a deferral against (also true and separately worth recording, see finding below).
