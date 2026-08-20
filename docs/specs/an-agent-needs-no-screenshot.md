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

## Audit passes

### Pass 1 — 2026-08-12

- base: `5458f5ec05295dc091896f6eb7ebf56b4e5c6086`
- head: `b04876f803217b3474c18d1d9c953728f51b124f`
- proof 1: met — Mutation `view,` -> `view: view ? { ...view } : null,` in src/ui/agent/testHarness.ts:150 was KILLED by
src/ui/agent/testHarness.test.ts "carries the published view itself, so a field the runtime adds needs no edit here",
re-run at its own file with the mutant still applied. The test asserts identity (toBe), not field agreement, so a
projection that happened to agree today cannot pass it. testState returns snapshot.view itself; there is no field list
over the view for anyone to forget to widen. What is derived — choices[].position, the asked modal, the last 20
transcript entries, surfaces — sits beside the view as its own key and replaces no field of it.
Re-run: npm run mutate over audit-an-agent-needs-no-screenshot-pass1-mutations.json entry c1-view-is-the-published-object.
Graded met on the view, which is what the clause names. The residual hand-written list over the driver's `live` is
filed as a finding below rather than read into this grade.
- proof 2: met — Two mutations, both KILLED by src/ui/surface.test.ts "names on every control the harness action that
drives it, or why it needs none": (a) dropping `data-drive="shell.subpage"` from the TabBar button — a control that
adds itself and declares nothing — and (b) `data-drive="map.plane"` -> `"map.floor"` in MapPane — a control naming an
action no surface offers. Both halves of the clause therefore bite. The set is read off the tree by the same
brace-aware `controls()` scanner the touch-floor rule uses, and OFFERED is built by calling installTestHarness with a
Proxy-fed SURFACE_BUILDERS rather than by listing names, so the check is against what the harness actually offers. All
10 controls under src/ui carry the attribute; the `none: <reason>` escape exists and nothing uses it.
Re-run: entries c2-a-control-names-its-driver and c2-the-named-action-must-exist.
- proof 3: met — Mutation `node.style.transition = settle();` -> `node.style.transition = 'transform 220ms ease';` in
src/ui/Pager.tsx:73 was KILLED by src/ui/moments.test.ts "is the only module that writes what a moment is made of, so
one begun elsewhere came from here". The rule has both halves the clause needs: KEYFRAMES is read off src/index.css
(not off the channel's own table, so a keyframe added and never routed fails), and no module but transient.ts may
write a moment literal or declare one. transient.ts is the single door — useMoment/useMomentPlayer return the class or
transition string as the side effect of logging the play, so a component cannot draw one without writing it down.
The four `transition-transform duration-75 active:scale-[0.97]` sites and Splitter's `group-active:` are feedback bound
to the control's own press state, which the clause exempts by rule rather than by argument.
Re-run: entry c3-a-moment-begun-off-the-channel. Two gaps in the derivation are filed as findings below.
- proof 4: met — Two mutations, both KILLED. (a) `played: since()` -> `played: []` on the taken-step branch of
installTestHarness (src/ui/agent/testHarness.ts:212) was killed by src/ui/agent/testHarness.test.ts "reports a moment
that began and ended between two steps, which a read of the state cannot see" — the exact proof the clause names: the
fixture's settle expires the note, so channel.notes() is empty and only the log can answer. (b) `cursor: nextId - 1`
-> `cursor` in transient.ts playedSince was killed by "never reports one step's moments as the next step's". Together
these hold both halves: what played is reported, and it is reported once. The cursor also advances over a refused
step, and starts where the session already is rather than at its beginning, each with its own test.
Re-run: entries c4-what-played-is-reported and c4-the-cursor-moves.
- proof 5: met — The spec's own named mutant no longer survives. `const map = { plane: at, ... }` -> `{ plane: 0, ... }` in
src/ui/MapPane.tsx — a map registering plane 0 while drawing plane 2 — was KILLED by src/ui/render.test.tsx "says which
floor it is showing, and offers the ones it found", whose STOREYS fixture deliberately stands the player on the upper
floor so the mutant cannot pass by falling back to 0. The same seam on the other registering component,
`const shell = { where, go: setWhere }` -> `{ where: OPENING, ... }` in App.tsx, was KILLED by "draws the nav standing
where it was opened". Both components assemble one value, render every site from it and hand that same value over, so
a lie in the registration is a lie in the markup. Held by renderToStaticMarkup, not by a DOM environment, as decided.
Re-run: entries c5-a-registration-that-lies and c5-the-shell-hands-over-what-it-holds.
- proof 6: met — Mutation `if (!import.meta.env.DEV) return;` -> `if (globalThis === undefined) return;` in
src/ui/testSurface.ts:30 — the one seam that ships and reaches in, no longer behind the constant a production build
folds to false — was KILLED by src/ui/bundle.test.ts "carries the content, and none of the modules only a driving agent
reaches". That test builds the release in memory under NODE_ENV=production and reads Rollup's own module graph, plus
the exported names and the error literals only those modules can throw, so it does not depend on names a minifier
rewrites. The set is derived from src/ui/agent/ in both guards — bundle.test.ts by sourcesUnder(resolve(here,'agent')),
surface.test.ts by AGENT_DIR = 'src/ui/agent/' — so they cannot disagree, and both assert the directory is non-empty so
a run that found nothing would prove nothing. surface.test.ts also proves the over-strictness the old predicate had is
gone: "asks nothing of a pane that is merely loaded late".
Re-run: entry c6-agent-only-stays-out-of-the-bundle.
