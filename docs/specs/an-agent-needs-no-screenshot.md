# an-agent-needs-no-screenshot

## Deliverable

The browser harness becomes the whole interface an agent needs to the running GUI. It drives every
control a finger can reach and reads everything the shell draws, including the moments that exist
only while they are playing. Completeness is held by construction rather than by lists: a field the
runtime starts publishing, a control a component starts rendering, and an animation a component
starts playing each appear to a driving agent without anyone remembering to route them, because the
route is the only way to publish, render or play at all.

Proof:

- [c1] The harness reads everything the runtime publishes. Every field carried by the published
  view is readable through `__test.state()`, and it is readable by construction: a field added to
  the view appears without an edit to the harness, or a test fails naming the field that was added.
  A hand-written list of readable fields is the defect this clause exists to prevent — the same
  shape filed three times against this codebase already, and closed each time by reading the list
  off its owner.
- [c2] The harness drives every control the player can touch. Every interactive control rendered
  under `src/ui` is reachable by a named action, or is declared exempt where it is rendered with the
  reason it needs no driving. The set is derived from the tree, not enumerated beside it, so a
  component that adds a control and registers nothing fails rather than passes quietly.
- [c3] Every transient moment is created through one channel. `useArrivals` and the imperative
  settle transitions in `Pager` and `VStack` fold onto the channel `transient.ts` already provides,
  and no module under `src/ui` sets `style.transition`, names a `@keyframes` or otherwise starts an
  animation except through it. An animation that is not on the channel does not play at all, which
  is what makes "we forgot to route this one" a failing test rather than a debugging session.
- [c4] The harness reports what played, not what is playing. Transient moments accumulate into a
  log that every batch result carries — what played since the previous step — so a moment shorter
  than the settle between two steps is still reported. Proved with an animation briefer than the
  settle, which a snapshot read cannot see.
- [c5] A driving session is written down once and replayed. A script of harness steps persists and
  re-runs with assertions, so the same sequence is not retyped across rounds of fixing. It borrows
  `/create-test`'s record-then-replay shape and none of the DSL's grammar; it may name a `# test` to
  set the world up, because `ui` reads `runtime` downward and world state stays authored where it
  belongs.
- [c6] A registration that lies fails. Today's rule reads that the call is written, not that the
  component hands over what it holds: registering a wrong value survives the whole suite. This
  clause promises the property itself is held, and the cost of holding it — a DOM environment for at
  least one file — is a decision this branch makes rather than one it inherits.
- [c7] Nothing agent-only reaches the player. No agent-only module is rolled into a shipped chunk,
  asserted against the bundler's module graph rather than against names a minifier renames, and a
  *new* agent-only module is covered by that assertion by construction rather than by being
  remembered. The guard may not refuse a legitimate dynamic import that has nothing to do with the
  harness.

## Goal

An agent debugging this GUI never takes a picture.

## Decisions

- **The harness does not reuse the DSL's `# test` system.** A `# test` section is a runtime
  directive script: parsed by `src/grammar`, resolved by `src/content`, executed by `applyDirective`,
  asserting over flags, inventory and counters. For a directive to say `layer: map` or `plane: 2`,
  grammar and runtime would have to learn shell vocabulary that `src/ui` owns, and since
  `grammar < content < runtime < ui` the engine would either absorb GUI concepts or call back up into
  `src/ui`, which `layer-check` forbids. What is reused is composition, not grammar: the harness may
  invoke `runTest` by name to set a world up, because `ui` imports downward for free. Ruled
  2026-08-12; the full reasoning is the decision of that date against `gui-rebuild`.
- **This extends the `browser test harness` concept, and does not add a second one.** That concept is
  registered to User interface over `testHarness.ts`, `testSurface.ts` and `agentSurfaces.ts`. A
  second capability claiming to drive the GUI would be the report that one of them does two jobs.
- **`gui-rebuild` is closed and is not reopened.** It reached ten clauses met over seven audit
  passes; what it delivered is a harness that drives the shell fully and reads about half of it.
  Five findings it deferred outside every spec are this branch's to answer, not evidence against it.
- **Completeness is structural or it is not claimed.** Every clause above that says "by construction"
  is refusing the same remedy this codebase has now filed three times — a guard that is a
  hand-copied list of names. A derived rule has its own failure, silent narrowing to nothing, and a
  derived rule that can match nothing is not an answer either.

## Open questions

- **What holds c6, and at what cost?** A DOM environment for one file (jsdom or happy-dom) is the
  obvious answer and cuts against both CLAUDE.md's "leave DOM wiring untested" rule and the
  five-minute suite budget. The alternative is a seam that makes registration checkable without a
  DOM. This is the author's call and the branch should not guess it.
- **Where does a saved driving script live, and in what format?** It is not DSL, it is not a
  `*.test.ts`, and it has to be reachable from a browser in dev. Decide before c5 is worked.
- **Does c2's exemption need a vocabulary?** "Declared exempt where it is rendered" is a shape, not
  a syntax; the first pass at it should be the cheapest thing that a rule can read.
