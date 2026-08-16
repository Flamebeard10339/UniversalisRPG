# the-gui-authors-through-the-same-door

## Deliverable

The GUI cannot author at all today. `createDriver` (`src/ui/driver.ts:69`) builds a `CommandContext`
with no `authoring` field, so `/dsl` and `/local` typed into the Edit console answer `UNAVAILABLE`
(`src/runtime/command.ts:404`) — every editing route in the browser is closed, and there is nothing
below it to open. Everything those commands need already exists and is proven in `play-cli`:
`upsertLocalSection` stages a whole section into the `local-changes` module,
`loadUniverseWithDiagnostics` validates the whole universe with it, and `commitLocalChanges` adopts
the result or refuses it and changes nothing. This branch hands the browser that door and builds the
three surfaces that knock on it.

The surfaces are three filters over one derivation, not three editors. Every section the loaded
registry holds is addressable as `kind` + `id` + its text; **map** is that list narrowed to
`# location`, drawn where the locations already say they are; **local** is it narrowed to what the
player's current location owns; **global** is the rest, narrowed by kind. One list, three predicates,
and each of them produces the same `/dsl <kind> <id> <body>` line the REPL types. That is the whole
architecture, and c2 is the clause that stops it becoming three.

Dragging a location is not an exception to it. A drag computes new `x:`/`y:` values and stages the
same section edit any other route would; there is no coordinate the map writes that the console
cannot write, and no path to the registry that skips validation.

Two branches that were going to land on either side of this one are inside it instead, because all
three write `src/ui/driver.ts` and none of them could have run beside the others. The first is the
door's own hinge: `adoptRegistry` (`src/runtime/session.ts:381`) already swaps a registry under a live
session, prunes what no longer resolves and re-spreads discovery, but `commitLocalChanges` is its only
caller and it writes and adopts in one act inside one process — so a second process editing the same
file is invisible until restart. Making the read half exist, and making the read, the load, the
diagnostic gate and the adopt *one* function with `/dsl` and `/reload` as its two callers, is what c2
through c6 own. The second is persistence: the named-slot store's browser implementation, without
which c9's "closing the tab loses nothing" has nowhere to be true.

Proof:

- [c1] **The browser has an authoring context, and it is the REPL's.** `createDriver` builds an
  `AuthoringContext` whose `baseSources` are the shipped modules, whose `localSource` is the
  `local-changes` module read from the slot store, and whose `writeLocalChanges` writes back to it.
  `/dsl` and `/local` typed into the Edit console do in the browser exactly what they do in
  `play-cli`: stage, validate, and adopt or refuse. The proof runs the same command lines against both
  drivers and compares the resulting serialized session.
  proof: vitest src/ui/driver.test.ts scripts/play-cli.test.ts
- [c2] **One load-and-adopt path, with more than one caller and no second copy.** The read, the load,
  the diagnostic gate and the adopt are one function; `/dsl` is that function with a write in front of
  it and `/reload` is that function with none. A second copy of the sequence is what this clause
  forbids, and the proof is that removing the shared function breaks every caller rather than one. No
  module under `src/ui` imports `upsertLocalSection`, `deleteLocalSection`, `clearLocalSections` or
  `renderLocalChangesModule`, and none calls `adoptRegistry`: every control on every editing surface
  reaches the registry through `driver.send` and through nothing else. The proof derives its subjects
  from the exported surface of `src/content/localChanges.ts` and from the tree, not from a list of
  components, because the fourth surface is the one this clause exists to catch.
  proof: vitest src/ui/authoringSurface.test.ts src/runtime/command.test.ts
  proof: command grep -n "adoptRegistry" src/runtime/command.ts
- [c3] **A session re-reads its local module on demand and shows what another process wrote.** A
  `/reload` command re-reads the local module through a `readLocalChanges` on `AuthoringContext` — the
  counterpart of the `writeLocalChanges` already there — loads it beside the base sources, and adopts
  the result. A location added to that module by a different process is reachable in the running
  session after it, with no restart and no save.
  proof: vitest src/runtime/command.test.ts scripts/play-cli.test.ts
- [c4] **A reload that does not load changes nothing.** On any diagnostic, the session's registry,
  state, log and clock are exactly what they were, the diagnostics print on the tool channel, and play
  continues. There is no partial adoption: the load either produces a registry that is adopted whole or
  produces none. This is the shape `commitLocalChanges` already has, and c2 is what stops the second
  caller re-deciding it.
  proof: vitest src/runtime/command.test.ts
- [c5] **State the edit invalidates is pruned with the warning already emitted, never silently.** A
  session standing in a location the edit deletes, holding an item it removes, or carrying a flag it
  drops, comes out of the reload with `pruneStateForRegistry`'s warnings in its log and a state the
  registry resolves. This is `adoptRegistry`'s existing behaviour and the clause pins it for the new
  callers, because a reload is the first way a player can be standing somewhere an author just deleted.
  proof: vitest src/runtime/command.test.ts src/runtime/session.test.ts
- [c6] **Reload carries no information, so a driver may call it unconditionally.** Reloading an
  unchanged module leaves the session identical — same registry contents, same state, same log length,
  same clock — so a driver that reloads every turn is indistinguishable from one that never does until
  the module actually changes. A reload that only did something when something had changed would tell
  an agent playing the session that an author had just written, and a file watcher would do the same
  while making a session nondeterministic under `# test` replay.
  proof: vitest src/runtime/command.test.ts
- [c7] **The three surfaces are three predicates over one list.** Map, Local and Global are one
  function from the loaded registry to addressable sections, filtered three ways, and the three filters
  partition it: every section the registry holds is offered by exactly one of them, and adding a kind
  to `SCHEMAS` cannot produce a section no surface offers. The proof derives its subjects by walking
  `SCHEMAS` and the loaded registry rather than naming kinds.
  proof: vitest src/ui/authoringSurface.test.ts
- [c8] **A drag is a section edit and nothing else.** Moving a location on the map stages a `# location`
  edit carrying the new `x:`/`y:`, goes through the same validate-and-adopt path, and is refused whole
  the same way a typed edit is. No coordinate reaches the registry except through a staged section, and
  a location whose position is declared `relative:` is either moved by editing what it is relative to or
  refused with a reason — never silently given absolute coordinates that contradict its own declaration.
  proof: vitest src/ui/mapEdit.test.ts src/ui/driver.test.ts
- [c9] **An edit survives the tab closing.** Every staged edit is written to the slot store as it is
  staged, and a driver constructed over a store that already holds a `local-changes` payload opens with
  those edits applied and the same sections listed. Nothing is lost by closing the tab, and nothing
  needs a save command to be lost-proof.
  proof: vitest src/ui/driver.test.ts
- [c10] **Where the author was survives too.** Which section is open, the cursor position within it, the
  scroll offset, and the map's pan, zoom and floor are restored on reopen, so switching to Home and back
  does not change what is on screen. This is `edit-mode-memory`, and it is here rather than beside it
  because it is the same store write and the same restore.
  proof: vitest src/ui/editorMemory.test.ts
- [c11] **One implementation of one store interface, and the interface is not this branch's.** The
  browser adapter is a value satisfying the interface `src/runtime/store.ts` exports, constructed in
  `src/ui` and passed in; nothing below `src/ui` learns that a browser exists, and no file under
  `src/ui` re-declares the interface's shape. The proof derives its subject from the interface: the same
  contract test that pins the file-backed implementation runs against this one, so a method added to
  the store next month is a method this adapter is checked on without an edit here.
  proof: vitest src/ui/browserStore.test.ts src/runtime/store.test.ts
- [c12] **A slot reads back byte-identical, through the browser's own storage.** Written text comes back
  exactly as written — every byte, including trailing newlines, non-ASCII and text longer than one
  `localStorage` value comfortably holds — and the written-at instant comes back beside it rather than
  parsed out of the payload. The test drives a `Storage` implementation, not a mock of the adapter.
  proof: vitest src/ui/browserStore.test.ts
- [c13] **Every way the browser can refuse to store is a message, and the session continues.** A quota
  exception, storage disabled entirely, and a slot whose stored shape this build does not recognise are
  each reported on the tool channel and leave the session playable with the state it already had. The
  clause is universal over the refusal modes the adapter can distinguish, and its proof enumerates no
  message text: it asserts that the session survives and that something was said, for each mode induced
  through the injected `Storage`.
  proof: vitest src/ui/browserStore.test.ts
- [c14] **Nothing in `src/ui` reaches storage except through the adapter.** No component, no driver and
  no hook touches `window.localStorage`, `sessionStorage` or `indexedDB` directly. The proof derives its
  subjects by walking the tree rather than naming files, because the next surface that wants to remember
  something is the one this clause exists to catch.
  proof: vitest src/ui/browserStore.test.ts
- [c15] **The two drivers behave identically over the store.** A session run through `play-cli` against
  the file-backed store and the same session run through the GUI driver against this one produce the
  same slot contents for the same commands. The bytes are the comparison, because a view is what a
  driver was told and the slot is what it is standing in.
  proof: vitest src/ui/driver.test.ts
- [c16] **One route out of the browser, and it serializes nothing new.** A control hands the author the
  local module's text — the same bytes `/local show` prints and the same bytes the store holds. No
  second serialization exists in `src/ui`, so text copied out of the browser and text a consolidation
  later places into `content/` cannot disagree about what was edited.
  proof: vitest src/ui/driver.test.ts
- [c17] **Every control added here names its driver.** Every button, input, select and textarea this
  branch adds carries `data-drive` naming a harness action, or `none:` with a reason, and each named
  action exists. The rule and its scanner are already built and derive the set from the tree; this
  clause is that existing derivation still passing over a tree with three new surfaces in it.
  proof: vitest src/ui/surface.test.ts
- [c18] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Give the browser the authoring door the REPL has had all along, so content can be written where it is
played.

## Decisions

**Extends `the GUI's session container` and `the map and the character sheet`; registers `authoring
surfaces` and `localStorage persistence` over `src/ui`.** The container is already registered to User
interface over `src/ui` and is the one context every dispatch goes through, which is precisely where an
`AuthoringContext` belongs — a second container would be two places a command is dispatched from. The
map concept is extended rather than duplicated for the same reason the plane pane was repointed onto
it: two surfaces drawing one report is two places to change when the report changes. Two capabilities
are new and each is registered once — that the GUI can author at all, and that the game persists in a
browser. The second is registered as persistence rather than as a store, because `tasks plan` already
ruled on that wording: there is one slot-store interface, owned by `auto-save-export-and-load`, and
c11 is an implementation of it.

**Absorbs `the-browser-save-store-adapter` and `a-session-adopts-a-module-edit-or-refuses-it-whole`,
which were the two edges on either side of this branch in the first plan.** The author ruled on
2026-08-16 that the push folds wherever folding costs no parallelism. It costs none here and the
survey is why: `tasks where src/ui/driver.ts` returns all three, so no two of them could have run
together, and `a-session-adopts` additionally shares `src/runtime/command.ts` and `scripts/play-cli.ts`
with the rest of the push. Sequencing them would have meant three workers reading the same region
three times to produce one coherent path — which is the shape of the fold, not an argument against it.
Both absorbed specs' reasoning is carried in the clauses rather than restated: `adoptRegistry` is the
mechanism and is not built here, the diagnostic gate is `commitLocalChanges`' existing shape, and the
store interface stays `auto-save-export-and-load`'s to own.

**c16 is here rather than with the consolidation that consumes it.** Handing the author the local
module's bytes is a control on a surface this branch builds, over text this branch's
`AuthoringContext` already holds; `an-edit-goes-home-to-its-source-file` owns placing those bytes into
`content/`, which is a command run in a checkout because a browser cannot write files. Leaving the
control there would have made that branch write `src/ui/driver.ts`, which this branch and
`the-shell-draws-what-the-session-answers` both write — three branches on one file, where two of them
have nothing else to say to each other. Moving one clause keeps the consolidation entirely inside
`scripts/` and `src/content/`, where it runs beside the whole GUI chain instead of behind it.

**c6 is kept from the absorbed spec even though this branch has no polling driver.** A reload that
carries information is a reload an agent can read a signal out of, and it is the property that makes a
watcher safe to add later without making `# test` replay nondeterministic. Dropping it because nothing
polls yet would be discarding the constraint at exactly the moment it is cheap to hold.

**Subsumes `edit-mode-memory`, which is retired into c10.** That record asks for the module being
edited, cursor, scroll, map position and notes to be remembered across a tab switch. Every one of those
is a value one of these surfaces already holds and a write to the store this branch already makes;
filing it separately would mean a second branch opening the same files to add a second store write.

**The drag stays a section edit rather than gaining a coordinate channel — c8.** A live drag that wrote
coordinates straight into the registry and staged text only on release would be a second path to the
registry, unvalidated for the length of the gesture, and it would make a refused edit a state the map
is already drawn in. What a smooth drag needs is a local position the map draws while the pointer is
down; the registry learns about it once, on release, through the same door. That distinction —
draw-time position versus staged edit — is the one the worker must keep, and c8 is it as a test.

**`relative:` is refused rather than silently converted.** A location declaring `relative:` has its
position stated as a fact about another location, and dragging it could mean either "move me" or
"restate me absolutely". Choosing the second silently would delete an authored relationship on a
gesture. c8 requires a reason instead, and which of the two the surface eventually offers is the
author's to decide once it can be seen.

## Open questions

- Whether the Global surface's kind filter is a single-select or a multi-select, and whether it
  remembers its selection per session or per store, is the worker's call. c7 fixes the partition, not
  the control.
- Whether an unstaged edit in a text field is written to the store on every keystroke or on a debounce
  is the worker's call. c9 fixes that closing the tab loses nothing; the cadence that achieves it is not
  specified, and a debounce short enough that a reload after a pause loses nothing satisfies it.
- Whether a slot is keyed with a prefix that lets one origin hold more than one build's slots is the
  worker's call. c12 fixes what a slot must return, not how it is named.
