# resolve-forward-progress-guard

## Deliverable

`resolve()`'s loop advances only if `resolveSegment` moves `state.time`, and nothing makes it. The
originally reported route — a drain rate large enough that `current / drainPerSecond` falls below the
ULP of `state.time`, so `nextBoundary` returns `state.time` and the loop spins — was closed by the
integer conversion (`2c2ccee`, `f9dfd72`): there is no ULP between integers. But the route was never
the only one. `nextBoundary` builds its candidates as `state.time + Math.max(0, …)`, so a boundary
equal to now is reachable *by construction*, and the loop terminates today because
`applyDueBoundaries` consumes whatever was due, not because anything requires it to.

So this branch does two things the record asks of it: it makes the loop's forward progress an
enforced invariant rather than an emergent one, and in doing so it states what the integer conversion
actually bought. A claim that a class of failure was eliminated is worth exactly as much as the
assertion that checks it, and there is none today.

**The invariant is not that time always advances.** A zero-length iteration is legitimate: applying a
buff expiry changes a stat, which changes a cadence, which can make a completion due at that same
instant. What is not legitimate is failing to advance *indefinitely*. So the guard bounds consecutive
non-advancing iterations and throws, naming what was due, rather than forbidding a step it would be
wrong to forbid.

That shape is also the only one compatible with `offline-progression`, which hands `resolve()` a
capped multi-hour span in a single call — thousands of legitimate boundaries. A cap on total
iterations would have to scale with the span to avoid tripping on that, and a cap that scales with
the span is a slower hang rather than a guard.

| the situation                                                   | today                          | after |
| ----------------------------------------------------------------- | ------------------------------ | ----- |
| an ordinary span with buff expiries and completions                | terminates                      | unchanged, guard never fires |
| a four-hour offline catch-up with thousands of boundaries           | terminates                      | unchanged — the guard counts consecutive stalls, not total steps |
| one zero-length step, because a boundary created another at that instant | terminates                | unchanged, still allowed |
| a boundary that keeps returning `state.time` with nothing consumed  | **spins forever**               | throws, naming the action or buff that stalled |
| a boundary before `state.time`                                      | unreachable since the integer conversion — and unasserted | asserted, so the conversion's claim is checked |

Proof:

- [c1] The loop cannot spin. A bounded number of consecutive iterations that do not advance
  `state.time` raises a `RuntimeError` naming the boundary that stalled, so a defect that used to
  hang the process is reported where it happened.
  proof: vitest src/runtime/resolve.test.ts
- [c2] A legitimate zero-length step still passes. A boundary applied at the current instant that
  creates another at the same instant resolves normally, because the guard bounds consecutive stalls
  rather than forbidding one.
  proof: vitest src/runtime/resolve.test.ts
- [c3] The guard is independent of span length. A span with more boundaries than the stall bound
  resolves unchanged, so a capped offline reconciliation cannot trip it and the guard never has to be
  retuned when a caller passes a longer span.
  proof: vitest src/runtime/resolve.test.ts
- [c4] What the integer conversion bought is asserted rather than believed. A boundary is never before
  `state.time`, checked in the loop rather than argued in a comment, which is the claim
  `2c2ccee`/`f9dfd72` made and left untested.
  proof: vitest src/runtime/resolve.test.ts
- [c5] Nothing observable changes. Shipped content, every `# test` over it and the whole suite pass
  byte-identical; no authored file is edited and no timing moves.
  proof: npm test

## Decisions

- **Bound consecutive stalls, not total iterations.** A total cap has to scale with the span or
  `offline-progression`'s four-hour catch-up trips it, and a cap that scales with the span is not a
  guard — it is the same hang with a longer fuse. Counting consecutive non-advancing iterations is
  span-independent, which is the property that lets this be written once and never retuned.
- **A zero-length step is legitimate and stays legal.** Requiring `nextBoundary` to return strictly
  after now would be the strongest invariant and the cheapest check, and it is refused because
  applying a boundary can genuinely create another at the same instant. Adopting it would mean first
  proving every same-instant cascade in the engine impossible — a far larger piece of work, and one
  that would probably turn up shipped content violating it.
- **Throw rather than break out of the loop.** A stall is a defect, and continuing from one would
  leave the state part-resolved and the player's world quietly wrong. An error names the boundary and
  loses nothing, because a hung process had already lost the session.
- **This is a runtime invariant, not a new gate.** The repository resists gates that have not
  prevented something real, and this is not one: it is a check inside the function whose contract it
  states, costing a comparison per iteration. `pre-release-readiness-audit` names moving always-on
  rules into runtime invariants as work it wants; this is one of them, arriving early because the
  region is open.
- **The value is the assertion, not the fix.** The ULP class is already gone. What is missing is
  anything that checks it stayed gone, and c4 is that — the difference between a commit message
  claiming a failure mode was eliminated and a test that fails if it returns.
- **Ordered independently of `offline-progression`.** That spec examined this one and scoped it out,
  correctly: the degenerate rate is unreachable from plausible content and the length of a span does
  not change what rate reaches it. This branch does not become urgent because of that one, and that
  one does not wait on this. They only meet in c3, which exists so the guard cannot become a bug in
  the feature that resolves the longest spans.

- **The stall bound is the constant 8** (settled by the worker; the planner left it open). The
  deepest same-instant cascade the engine can build today is *one*: whatever a zero-length segment
  makes due, `applyDueBoundaries` consumes before the next `nextBoundary`, so the loop already
  self-corrects after a single stall. 8 sits far above that and still reports a real spin in
  microseconds. Deriving it from the number of distinct boundary sources was refused for the same
  reason a total cap was: it makes the bound a function of how much content is loaded, so it has to
  be re-justified every time content grows, and a bigger registry would buy a longer hang.
- **The invariant is its own module.** `src/runtime/forwardProgress.ts` sits beside `units.ts`: both
  rules are pure and a test must be able to call them, and `runtime.ts` is the barrel `src/ui`
  imports, so its export surface stays the engine's API rather than growing two guards.
- **Mutating the guard away hangs the suite, by construction.** `npm run mutate` spawns vitest with
  no timeout, and a `resolve()` with the throw deleted spins synchronously — vitest's own timeout
  cannot interrupt that. So the manifest aims at the stall count, at the boundary name in the
  message, and at `STALL_BOUND = 0`; the last of those kills the legitimate-zero-length-step test
  and is therefore the proof that `resolve()` really calls the guard. An auditor re-aiming the
  manifest should keep that constraint.

## Open questions

None. The stall bound was the only one, and it is settled above.

## Audit passes

### Pass 1 — 2026-08-07

- base: `b56ba3ee30365f83e10738189ac42d94bcad295c`
- head: `a0a7059aa09ad19f6a1b379319fe093d7cb29cf0`
- proof 1: met — Mutation-tested, manifest hand-written (no target resolved). Three kills, each a named test
  re-run at its own file with the mutation still applied: STALL_BOUND 8 -> 0 is killed by
  "lets a zero-length segment through when it consumes a completion at the current instant",
  which is what proves resolve() really calls requireForwardProgress rather than merely importing
  it; "if (stalls > STALL_BOUND)" -> "> STALL_BOUND + 1" is killed by "throws past the bound,
  naming the boundary that held time, and not before it"; and the resource boundary's source
  string replaced by a literal is killed by "reports a boundary that never advances instead of
  spinning on it", which is the end-to-end half — resolve() throws RuntimeError, the message
  carries "resource pool", and state.time is still 0. The spin fixture is a deliberately corrupt
  state (a pool level of 0.5 milli-units, injected through a cast) and that is the right proof:
  for any integer level >= 1 and any remainder in [0, 60000), msUntilEmpty's numerator is at most
  -1 - remainder and its divisor negative, so emptyIn >= 1 — the stall is unreachable from
  engine-produced state by construction, which is exactly why a guard rather than a fix is what
  the clause promises. Its failure direction is safe: if the engine later rounds resource levels,
  the test stops reproducing a stall and goes red, not quietly green. The pre-change hang is
  verifiable by reading: with the boundary at state.time and no activeAction, resolveSegment
  advances 0, applyDueBoundaries changes nothing, and while (0 < 5000) never terminates.
  Residual filed as a finding: three of the four names the report can carry are asserted nowhere.
- proof 2: met — "lets a zero-length segment through when it consumes a completion at the current
  instant" passes on the unmutated tree and is KILLED by STALL_BOUND 8 -> 0, which is the
  measurement that matters: the mill fixture genuinely produces a boundary at the current instant
  that the guard counts as a stall, and the guard tolerates it. It is killed a second time by
  requireBoundaryNotPast(boundary, before) -> (boundary, before + 1), i.e. by making the
  not-past rule forbid a boundary at now, which is the over-strict form the Decisions section
  refused. So the clause's two halves — a zero-length step is real here, and it is legal — are
  each observed by a failing test rather than by the absence of one.
- proof 3: met — Two mutations, in opposite directions. Deleting the reset ("if (after > before)
  return 0;" made unreachable, so the counter becomes the total-iteration cap the Decisions
  section refused) is KILLED by "resolves a span carrying far more boundaries than the stall
  bound exactly as one with none" — which proves the span really carries more than STALL_BOUND
  iterations, rather than the test asserting its own marker count. And removing the 20 markers
  from that test entirely leaves every one of its expectations green (SURVIVED at whole-suite
  scope), which proves 25 cooked-shrimp / no active buffs / t=25s is the no-marker result, so
  "exactly as one with none" is what the assertion actually says and not a value read off the
  marked run.
- proof 4: met — The rule's direction is asserted: "if (boundary.at < now)" -> "< now - 1" is KILLED
  by "rejects a boundary before the current instant". The loop provably executes the call every
  iteration: "requireBoundaryNotPast(boundary, before)" -> "(boundary, before + 1)" is KILLED by
  "lets a zero-length segment through when it consumes a completion at the current instant". The
  check is at src/runtime/runtime.ts:365, inside the loop, not in a comment — read directly. I
  also confirmed the claim it states is not vacuous but is unreachable from legitimate state:
  every candidate but a buff expiry is built as state.time + Math.max(0, ...) or is toTime, which
  resolve() already validates as >= state.time, and applyDueBoundaries deletes every buff with
  expiresAt <= state.time before each nextBoundary call. So the check is a genuine invariant
  assertion and cannot refuse legitimate input — no over-strictness regression. One residual,
  filed as a finding and not a falsification of this clause: deleting the call site outright
  survives the whole suite.
- proof 5: unmet — Checked, and it fails on one conjunct. tsc, layer-check, audit-status, doctor, the
  byte check and the tree check all pass (npm run tasks -- merge-ready). No authored content file
  is touched anywhere in the range, and nextBoundary's selection logic is unchanged line for line
  — the same comparisons in the same order, with the winner carried as an object instead of a
  bare number — so no timing moves. But the suite does not pass: 1814 passed, 1 failed, and the
  failure is scripts/tasks/audit.test.ts > "the brief answers ownership and prior art for every
  path in its diff". I did not take the standing explanation on trust. The merge base b56ba3e is
  main, so before this range the branch diff was empty and that test was green; the assertion
  expects the heading "prior art on src/runtime/save.ts" and gets "prior art on
  src/runtime/forwardProgress.ts, src/runtime/resolve.test.ts, src/runtime/runtime.ts,
  src/runtime/save.test.ts, src/runtime/save.ts, src/runtime/session.test.ts:" because
  audit-prompt builds that heading from a live git diff of the real repository. This spec's three
  files are in that list and are independently sufficient to redden it — the other two specs'
  files are too. So the cause is a hermeticity defect in the Task system's own fixture rather
  than anything in this spec's logic, and two findings for it are already on file (I did not add
  a third). The clause as written still does not hold, and recording it met would be recording a
  suite state that does not exist.
