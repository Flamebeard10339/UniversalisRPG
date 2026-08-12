# an-agent-needs-no-screenshot

## Deliverable

The browser harness becomes the whole interface an agent needs to the running GUI. It drives every
control a finger can reach and reads everything the shell draws, including the moments that exist
only while they are playing. Completeness is held by construction rather than by lists: a field the
runtime starts publishing is readable because the harness carries the view rather than a copy of it,
a control a component starts rendering names its driver on the tag a rule already reads, and a
moment a component starts playing goes onto the one channel that plays moments.

Proof:

- [c1] The harness reads everything the runtime publishes. `__test.state()` carries the published
  view itself and not a projection of it, so a field the runtime starts publishing is readable the
  moment it is published and there is no edit to the harness that can be forgotten. What the harness
  derives — a choice's dispatch position, the modal being asked, a bounded transcript, what the
  shell holds that the session does not — sits beside the view and never in place of a field of it.
  A hand-written list of readable fields is the defect this clause exists to prevent: the same shape
  filed three times against this codebase, closed each time by reading the list off its owner, and
  the only closure that does not re-open it is having no list.
- [c2] The harness drives every control the player can touch. Every `button`, `input`, `select` and
  `textarea` rendered under `src/ui` names on its own tag the harness action that drives it, or
  declares there that it needs no driving and why. The set is read off the tree by the scanner that
  already walks control tags, so a component that adds a control and names nothing fails rather than
  passes quietly; and the name is checked against the actions the harness actually offers, so a
  control that names an action no surface has fails too.
- [c3] Every moment that reports a state change is played through one channel. `transient.ts`
  becomes that channel — the text notes it carries today become one kind of moment on it — and the
  discovery flash `useArrivals` raises and the settle transitions `Pager` and `VStack` write onto a
  node become the others. No module under `src/ui` sets `style.transition`, names a `@keyframes` or
  otherwise begins such a moment except through the channel. Feedback bound to an input's own state
  — the `:active` press scaling, `:hover` — reports nothing an agent could miss, is not a moment,
  and is exempt by the same rule rather than by an argument at each site.
- [c4] The harness reports what played, not what is playing. Moments accumulate into a log that
  every batch result carries — what played since the previous step — so a moment shorter than the
  settle between two steps is still reported. Proved with a moment briefer than the settle, which a
  snapshot read cannot see.
- [c5] A registration that lies fails. Today's rule reads that the call is written, not that the
  component hands over what it holds: a map registering plane 0 while drawing plane 2 survives the
  whole suite. Each registering component assembles one value, renders from that value and hands
  over that same value, so a registration that lies is markup that lies and the render tests already
  in the tree fail on it. Proved by the mutant that survives today.
- [c6] Nothing agent-only reaches the player. One directory holds the modules that exist only to be
  driven, and that directory is the whole derivation of the set: the bundle test asserts no file
  under it is rolled into a shipped chunk — against the bundler's module graph rather than against
  names a minifier renames — and the source rule reads the same directory, so the two cannot
  disagree about what the set is and a third such module is covered the day it is written. The one
  seam that ships and reaches in stays behind the constant a production build folds to false. The
  predicate is no longer "reached by a dynamic import", so a lazily loaded pane is not asked to hide
  behind that constant to satisfy a rule that was never about it.

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
- **c5 is held by a seam and not by a DOM environment.** The mutant that survives is a component
  re-stating what it renders from when it registers; a component that assembles the value once and
  both renders from it and hands it over cannot re-state it wrongly, and `renderToStaticMarkup` — the
  suite's existing way of reading a render — fails on the lie. What that does not prove is the wire
  from mount to `window.__test`: a `useEffect` and a dynamic import, one file, author-verified in the
  browser, with the suite holding the builders and the registry at either end of it. Recorded here
  rather than left to the reader, because "the DOM wiring is untested" is a claim a spec owes out
  loud. Ruled 2026-08-12.
- **Agent-only is a directory, not an import spelling.** The two tests that guard c6 disagree today
  about what the set is — one reads two static namespace imports, the other reads the dynamic-import
  spelling — and neither predicate is the property. A directory is the property written down: a
  module is agent-only because of where it is, one derivation both tests read, and it costs nothing
  to extend. The alternative predicates each fail on something ordinary — a third module written
  outside both, or the first `React.lazy` of a pane. Ruled 2026-08-12.
- **A control names its driver where it is rendered.** c2's declaration is an attribute on the tag,
  read by the scanner that already reads control tags whole. A table mapping component to action
  would be the list beside the tree that c2's own last sentence refuses. Ruled 2026-08-12.
- **c2 covers the four control elements, and gestures are out of it.** "Every control a finger can
  reach" would otherwise take in `Splitter`'s drag handle and the `Pager` and `VStack` swipes, which
  no scanner finds and which an agent already has destinations for through `shell.layer` and
  `shell.subpage`. Driving a gesture as a gesture is worth its own spec if it is ever worth
  anything; naming it in this one would buy a widened scanner and no new reach. Ruled 2026-08-12.
- **The saved driving script is its own spec.** It was `[c5]` here — a script of harness steps that
  persists and re-runs with assertions — and it shares nothing with the clauses above but the
  harness existing. It has an open question of its own (where it lives and in what format, given
  that `src/ui` may not `fetch`), and this branch already carries two refactors and three
  derivations. Opened separately rather than carried. Ruled 2026-08-12.
