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

## Open questions

- What the stall bound is — two, ten, or derived from the number of distinct boundary sources — is
  the worker's call once the region is read. c2 fixes that one stall is legal and c1 that an
  unbounded run is not; the number between them is a judgement about how deep a same-instant cascade
  can legitimately go.
