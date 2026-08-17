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

The door's own hinge is already hung. `a-session-adopts-an-edit-or-refuses-it-whole` was folded into
this spec and then landed on its own after all, so `adoptRegistry` now has a second caller,
`AuthoringContext` has the `readLocalChanges` half it never had, and the read, the load, the
diagnostic gate and the adopt are one function with `/dsl` and `/reload` in front of it. Nothing below
`src/ui` is left to build for that; what remains of it here is c2, which is the rule that the surfaces
this branch adds do not go around it.

One branch that was going to land beside this one is still inside it, because both write
`src/ui/driver.ts`: persistence, the named-slot store's browser implementation, without which c9's
"closing the tab loses nothing" has nowhere to be true.

Proof:

- [c1] **The browser has an authoring context, and it is the REPL's.** `createDriver` builds an
  `AuthoringContext` whose `baseSources` are the shipped modules, whose `localSource` is the
  `local-changes` module read from the slot store, and whose `writeLocalChanges` writes back to it.
  `/dsl` and `/local` typed into the Edit console do in the browser exactly what they do in
  `play-cli`: stage, validate, and adopt or refuse. The proof runs the same command lines against both
  drivers and compares the resulting serialized session.
  proof: vitest scripts/drift.test.ts src/ui/driver.test.ts
- [c2] **No surface goes around the one load-and-adopt path.** That path exists and is proved
  elsewhere; this clause is that nothing added here reaches past it. No module under `src/ui` imports
  `upsertLocalSection`, `deleteLocalSection`, `clearLocalSections` or `renderLocalChangesModule`, and
  none calls `adoptRegistry`: every control on every editing surface reaches the registry through
  `driver.send` and through nothing else. The proof derives its subjects from the exported surface of
  `src/content/localChanges.ts` and from the tree, not from a list of components, because the fourth
  surface is the one this clause exists to catch.
  proof: vitest src/ui/authoringSurface.test.ts
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
  proof: vitest src/ui/editorMemory.test.tsx
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
  proof: vitest scripts/drift.test.ts
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

**Absorbs `the-browser-save-store-adapter`, and no longer absorbs
`a-session-adopts-a-module-edit-or-refuses-it-whole`.** Both were edges on either side of this branch
in the first plan, and the 2026-08-16 ruling that the push folds wherever folding costs no parallelism
took both: `tasks where src/ui/driver.ts` returns all three, so no two could have run together. The
second fold was reversed the same day. It had assumed the region was unread, and it was not — a branch
had already built the reload path, audited it twice and graded its clauses met before the fold was
written, so the fold would have thrown that away to avoid a cost that had already been paid. The
author ruled that branch lands and this spec's grant shrinks to `src/ui`. What it delivered is c3
through c6 as they were written here, which is why they are gone from the list above rather than
renumbered: a clause number in this file names the same clause it always did, and the gap says
something left. c2 keeps only the half that is this branch's — that no surface added here goes around
the path — and its `src/runtime/command.ts` proof went with the rest.

The store half stands as it was: the browser adapter is this branch's, and the interface stays
`auto-save-export-and-load`'s to own.

**c16 is here rather than with the consolidation that consumes it.** Handing the author the local
module's bytes is a control on a surface this branch builds, over text this branch's
`AuthoringContext` already holds; `an-edit-goes-home-to-its-source-file` owns placing those bytes into
`content/`, which is a command run in a checkout because a browser cannot write files. Leaving the
control there would have made that branch write `src/ui/driver.ts`, which this branch and
`the-shell-draws-what-the-session-answers` both write — three branches on one file, where two of them
have nothing else to say to each other. Moving one clause keeps the consolidation entirely inside
`scripts/` and `src/content/`, where it runs beside the whole GUI chain instead of behind it.

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

**The two cross-driver clauses are proved in `scripts/drift.test.ts`, not where they first said.**
c1 and c15 both compare the GUI driver against `play-cli`, and c15 compares the file-backed store
against the browser one. `fileSlots` is `scripts/lib`'s, and the layer rule forbids `src/ui` reaching
it, so a proof of that comparison cannot live under `src/ui` at all. drift.test.ts is where the two
drivers were already held to identical output line by line; it now holds the store bytes too, and its
old carve-out — the GUI had no authoring context, so a section edit was counted rather than compared
— is gone. `src/ui/driver.test.ts` keeps the half reachable from there.

## Open questions

- Whether the Global surface's kind filter is a single-select or a multi-select, and whether it
  remembers its selection per session or per store, is the worker's call. c7 fixes the partition, not
  the control.
- Whether an unstaged edit in a text field is written to the store on every keystroke or on a debounce
  is the worker's call. c9 fixes that closing the tab loses nothing; the cadence that achieves it is not
  specified, and a debounce short enough that a reload after a pause loses nothing satisfies it.
- Whether a slot is keyed with a prefix that lets one origin hold more than one build's slots is the
  worker's call. c12 fixes what a slot must return, not how it is named.

## Audit passes

### Pass 1 — 2026-08-17

- base: `fa790124d4c1cc281a80245b6540a34771767671`
- head: `e17c3c02e254a3ba1f8b577b4cabb8cb3d078256`
- proof 1: met — scripts/drift.test.ts "reaches byte-identical state and says the same things, over a scripted sequence"
  runs one script through openRepl (file-backed slots) and createDriver (browser slots) and asserts, per line,
  identical transcript entries and identical serializeSession bytes; the script now contains
  /dsl location tutorial-island.guide-house x: 9, y: 9 and /local list, /local show, /reload, /save,
  and the UNAVAILABLE carve-out the old version counted is gone. src/ui/driver.test.ts
  "stages a section, adopts it, and the session is playing the edit" proves the adopt reaches the session.
  Mutation aimed at the context this branch builds: src/ui/driver.ts `dependencies: base.loadedModules`
  to `dependencies: []` KILLED by that named test
  (manifest C:\Users\yonat\AppData\Local\Temp\audit-the-gui-authors-through-the-same-door-pass1-neighbours.json).
  Caveat recorded as a finding: the clause's own proof line names src/ui/driver.test.ts and
  scripts/play-cli.test.ts, and the two-driver comparison it describes is in scripts/drift.test.ts.
- proof 2: met — src/ui/authoringSurface.test.ts "reaches the local-changes module for its name and for nothing else"
  derives the forbidden names by matching `^export (const|function|interface|type) (\w+)` over
  src/content/localChanges.ts, then walks every non-test .ts/.tsx under src/ui plus src/main.tsx and asserts
  none contains any of them but LOCAL_CHANGES_MODULE_ID, and none contains adoptRegistry. Subjects come from
  two trees, not a list of components. Mutation: planting the string upsertLocalSection into a comment in
  src/ui/editControls.ts KILLED by that named test
  (manifest C:\Users\yonat\AppData\Local\Temp\mutations-the-gui-authors-through-the-same-door-pass1.json).
- proof 7: met — src/ui/authoringSurface.test.ts "addresses every section the loaded registry holds" walks
  CONTENT_SECTION_MAPS and every key of every registry map (checked > 50) and asserts each is addressable;
  mutation dropping kind 'item' from sectionsIn KILLED by it. "draws every location on the map surface and
  nothing else there" compares the map slice against REGISTRY.locations.keys(); mutation retargeting
  `section.kind === MAPPED_KIND` to 'entity' KILLED by it. "offers a section of every kind the load path can
  parse" walks Object.keys(SCHEMAS) and SECTION_KINDS rather than naming kinds.
  Recorded so the next pass does not re-derive it: the "offers every section by exactly one surface"
  assertion cannot fail while surfaceOf is present at all, because surfaceOf is a total function into
  SURFACES. Collapsing the whole filter to `return 'global'` leaves that named test green; it was killed only
  by its two neighbours above (neighbours manifest, entry "c7 the partition assertion, asked whether it can
  fail at all", scope "src/ui/authoringSurface.test.ts <named test> to the file"). The partition is carried
  by the two derived tests, not by the one that states it.
- proof 8: met — src/ui/mapEdit.test.ts derives its subjects from offeredBy(SECTIONS, NOWHERE, 'map') and splits
  them on a `relative:` regex, so a location added to content/ is dragged too. For each absolute one it sends
  the produced line through createDriver and asserts the reloaded registry entry equals the shipped one with
  only x and y changed; for each relative one it asserts a refusal naming the address and no `line` property.
  Mutations: settledOn's y computed from at.x KILLED by "stages tutorial-island.guide-house where it was
  dropped"; `if (value.relative)` to `if (false as boolean)` KILLED by "refuses to drag tutorial-island.beach
  with a reason" (pass1 manifest). A broken section produces "local changes did not load." and localChanges()
  stays empty, so nothing reaches the registry outside a staged section.
  Two caveats filed as findings rather than left here: the map's own gesture-to-line path in
  src/ui/MapPane.tsx (letGo and place) survives a whole-suite mutation, and that path stages an edit on a tap
  as well as on a drag.
- proof 9: met — src/ui/driver.test.ts "opens a second driver over the same store with the edit already applied"
  builds two drivers over one pageStorage-backed browserSlots, stages through the first and asserts the second
  opens with the coordinates applied and the same /local list detail lines and the same localChanges() bytes.
  No save command anywhere in it. Mutations: `held = stored()` to `held = ''` KILLED by that test, and
  writeLocalChanges to a no-op KILLED by it and by the c16 test (pass1 manifest).
- proof 10: met — src/ui/editorMemory.test.ts "carries every field it holds, one at a time" walks
  Object.keys(FORGOTTEN) against an exhaustive `Record<keyof Editing, Editing[K]>` of moved values, so a field
  added to Editing stops the file compiling until it has one, and asserts each field both round-trips and
  differs from FORGOTTEN. "keeps what it can make sense of and forgets the rest" pins the field-by-field
  degradation, and "tells a floor of zero from no floor asked for" pins plane 0 against null. Mutations:
  `open: text(from.open, FORGOTTEN.open)` and `zoom: count(from.zoom, ...)` each pinned to FORGOTTEN, both
  KILLED (pass1 manifest).
  Said plainly, per the repository's rule that UI wiring is author-tested and declared: the restore itself is
  not proved anywhere. Replacing the `where` argument to useSheetHold in src/ui/MapPane.tsx with `undefined`
  SURVIVED the whole suite, 0 failed of 3640 (neighbours manifest), and no test in the suite opens an App or a
  driver over a store that already holds an `editor` slot. The wiring reads correct on inspection:
  App.useEditing seeds from driver.editorMemory.read(), EditPane restores scrollTop and setSelectionRange once
  on mount, MapPane seeds plane and the sheet's pan and zoom from editing.map. Filed as a finding for the
  author to confirm by hand.
- proof 11: met — src/ui/browserStore.test.ts calls describeSlotDriver('one localStorage key per slot', () =>
  overStorage()), the same exported contract scripts/lib/slotFile.test.ts runs against the file-backed driver.
  The contract derives its subjects from the interface twice over: `const DECLARED: Record<keyof SlotDriver,
  true>` stops it compiling when a verb is added to SlotDriver, and a Proxy records which verbs the cases
  reached and asserts the set equals the interface's. slotFile.test.ts dropped its own copies of the cases the
  contract now owns. Mutation: browserSlots.remove to a no-op KILLED by the contract case "forgets a removed
  slot, and removing what is not there is not a failure" (pass1 manifest). The other two halves of the clause
  — nothing below src/ui learning a browser exists, and no re-declaration of the interface in src/ui — hold on
  inspection: src/ui/browserStore.ts imports SlotDriver rather than restating it, src/runtime/store.ts names no
  browser, and src/main.tsx is where browserSlots() is constructed and passed in.
- proof 12: met — src/runtime/storeContract.ts CONTRACT_PAYLOADS drives ten values through a real Storage
  implementation (src/ui/pageStorage.ts, an object satisfying the DOM Storage shape, not a mock of the
  adapter): empty, whitespace-only, non-JSON, JSON with and without incidental whitespace, nested non-ASCII,
  CRLF, leading and trailing newlines, and a 400 000-character value of 'é 😀 line\n'. The stamp cases assert
  writtenAt comes from the store's clock beside an unparsed payload, and src/ui/browserStore.test.ts adds the
  two-prefixes-under-one-storage case. Mutation: setItem(keyed(name), text.trim()) KILLED 4 of the byte-for-byte
  cases (pass1 manifest).
- proof 13: unmet — The adapter half holds and is proved: src/ui/browserStore.test.ts asserts, for every mode in
  STORAGE_REFUSALS and with REFUSING keyed exhaustively by StorageRefusal, that each verb raises a named
  RuntimeError and that a slot keeps what it held when a write will not fit; mutation `throw error` in place of
  the RuntimeError wrap KILLED both modes (pass1 manifest).
  The driver half does not hold. Three mutations, each of which silences a way src/ui/driver.ts reports a
  storage refusal, all SURVIVED the whole suite at 0 failed of 3640:
  (a) the body of `complain` replaced with `void text`, so nothing the driver says on its own channel is ever
  appended — neighbours manifest, entry "c13 something is said when the store refuses";
  (b) the open-time `complaints.push({... local changes could not be read ...})` replaced with `void error`, so
  a store that cannot be read at all opens silently — C:\Users\yonat\AppData\Local\Temp\audit-the-gui-authors-through-the-same-door-pass1-c13.json;
  (c) writeLocalChanges wrapped in a try/catch that swallows, so a quota refusal is never reported — same file.
  The clause states its own proof as "it asserts that the session survives and that something was said". What
  the test asserts is `expect(said(driver).length).toBeGreaterThan(0)` after `driver.send(EDIT)`, where said()
  counts every tool-channel entry in the transcript including the staging and diagnostic lines the happy path
  produces. It therefore cannot be false while the code is present at all, which is the shape
  auditor/false-proof-shape names. The "session survives" half is real and does bite.
  The behaviour itself is correct today, verified by reading rather than by a test: adoptLocalChanges in
  src/runtime/command.ts returns `could not write local changes: <detail>` and does not adopt when persist
  throws, and createDriver pushes a warn line when the opening read throws. Nothing this branch added watches
  either. Graded unmet rather than unknown because I checked and the proof fails, and rather than deferred
  because the goal is that content can be written in the browser and lost writes going unmentioned is the way
  that goal fails quietly.
- proof 14: met — src/ui/browserStore.test.ts "names browser storage in the adapter and nowhere else" walks
  src/ui recursively for non-test .ts/.tsx plus src/main.tsx, asserts the walk found the adapter, main.tsx and
  more than 20 modules, and asserts the regex
  /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage|indexedDB)\b/ matches nothing outside
  src/ui/browserStore.ts; a companion case proves the regex catches four spellings including `localStorage .
  clear()`. Mutation: planting `window.localStorage` into a comment in src/ui/editorMemory.ts KILLED
  (pass1 manifest).
- proof 15: met — scripts/drift.test.ts builds two real stores — fileSlots over a temp directory for the REPL and
  browserSlots over pageStorage for the GUI, deliberately not shared — with one clock at 1700000000000, and
  after the scripted sequence asserts Object.keys(slotBytes(repl)) equals [local-changes, player] and
  slotBytes(gui) deep-equals slotBytes(repl). The second case walks the whole COMMANDS table bare and with an
  argument and compares the two stores again, requiring more than one slot written. Mutation:
  `createSaveContext(options.slots ?? memoryDriver(), ...)` to `createSaveContext(memoryDriver(), ...)`
  KILLED by "reaches byte-identical state and says the same things, over a scripted sequence"
  (pass1 manifest). The clause's proof line names src/ui/driver.test.ts, which holds no slot-bytes comparison;
  filed as a finding.
- proof 16: met — src/ui/driver.test.ts "hands over the same bytes /local show prints and the slot holds" stages an
  edit, runs /local show, and asserts driver.localChanges() equals the joined detail lines of that command and
  equals slotStore(slots).read('local-changes').payload. Three spellings held to one value. Mutation:
  `return stored()` to `return stored().trimEnd()` KILLED by it (pass1 manifest). That no second serialization
  exists in src/ui is carried by c2's scan, which forbids renderLocalChangesModule anywhere under src/ui.
- proof 17: met — src/ui/surface.test.ts "names on every control the harness action that drives it, or why it needs
  none" is the existing scanner, deriving the set of button, input, select and textarea from the tree and
  checking each data-drive name against what installTestHarness and the surface builders offer; it is green
  over the three new surfaces (npm run tasks -- merge-ready on e17c3c0, npm test leg ok). Mutation: deleting
  `data-drive="edit.copy"` from src/ui/EditPane.tsx KILLED by that named test (pass1 manifest). One erosion
  filed as a low finding: the map bubble keeps data-drive="choose" while in Place mode it moves rather than
  chooses.
- proof 18: met — npm run tasks -- merge-ready at e17c3c0 in this worktree: tsc ok, npm test ok, layer-check ok,
  audit-status ok, doctor ok (27 warnings, none of which fail the leg), bytes ok, tree ok (nothing
  uncommitted), base ok, spec ok (every declared member closed). The one failing leg is
  "clauses the-gui-authors-through-the-same-door — has no recorded audit pass", which is the leg this pass
  discharges; re-running merge-ready after this pass is filed is what a next reader should do.

### Pass 2 — 2026-08-17

- base: `fa790124d4c1cc281a80245b6540a34771767671`
- head: `6996181acc8acd13c9b9b7ed5456eca2442e2be7`
- proof 1: met — Re-derived rather than re-read. scripts/drift.test.ts "reaches byte-identical state and says the
same things, over a scripted sequence" runs one script through openRepl (fileSlots over a temp dir) and
createDriver (browserSlots over pageStorage) and asserts, per line, identical transcript entries and
identical serializeSession bytes; the script carries /dsl location tutorial-island.guide-house x: 9, y: 9,
/local list, /local show, /reload and /save. My own mutation, aimed at the half of the AuthoringContext
pass 1 did not break: src/ui/driver.ts `readLocalChanges: stored,` to `readLocalChanges: () => '',`
KILLED by that named test, re-run at its own file with the mutant still applied
(manifest C:\Users\yonat\AppData\Local\Temp\audit-the-gui-authors-through-the-same-door-pass2-neighbours.json).
The carve-out this file used to carry is gone and nothing replaced it: every line in the script and every
entry in COMMANDS is now compared, not counted.
- proof 2: met — src/ui/authoringSurface.test.ts "reaches the local-changes module for its name and for nothing
else" derives the forbidden names by matching ^export (const|function|interface|type) (\w+) over
src/content/localChanges.ts, then walks every non-test .ts/.tsx under src/ui recursively plus src/main.tsx.
Pass 1 aimed at src/ui/editControls.ts, a file at the top of the tree; I aimed at the subdirectory the
branch added, to ask whether the walk recurses: planting `void 'adoptRegistry';` into
src/ui/agent/pageStorage.ts KILLED by that named test (neighbours manifest). Subjects come from two trees,
not a list of components.
- proof 7: met — Two derived tests carry it and I broke a third property pass 1 did not.
src/ui/authoringSurface.test.ts "addresses every section the loaded registry holds" walks
CONTENT_SECTION_MAPS and every key of every registry map (checked > 50); "draws every location on the map
surface and nothing else there" compares the map slice against REGISTRY.locations.keys(). My mutations:
dropping the LOCAL_CHANGES_MODULE_ID branch from `addressOf` — so a staged copy is qualified and stands
beside the shipped section instead of shadowing it — KILLED by "shadows a shipped section with the copy
staged over it, rather than offering both"; and collapsing surfaceOf's whole body to `return 'global'`
KILLED only at file scope, by "draws every location on the map surface and nothing else there" and
"narrows Local to what is standing where the player is"
(scope reported as "offers every section by exactly one surface, standing in nowhere" -> the file).
Pass 1's caveat re-derived and confirmed unchanged: the assertion that states the partition cannot fail
while surfaceOf is present at all, because surfaceOf is a total function into SURFACES. The partition is
carried by its two neighbours, not by the case named after it.
- proof 8: met — src/ui/mapEdit.test.ts derives its subjects from offeredBy(SECTIONS, NOWHERE, 'map') and splits
them on a `relative:` regex; for each absolute one it sends the produced line through createDriver and
asserts the reloaded registry entry equals the shipped one with only x and y changed, and for each relative
one a refusal naming the address with no `line`. My mutations, both aimed away from pass 1's two:
`settledOn` stripped of Math.round, so a drag settles on a coordinate the grammar's integer parser cannot
take, KILLED by 5 named "stages <place> where it was dropped" cases; and `droppedAt` with the placedAt
nudge inverse removed KILLED by "takes the drawing nudge back out for a place 2 floors up" and "... 2
floors down". The gesture-to-line path pass 1 filed as unreachable is now out of the component in
placedInto/droppedAt and is what those cases call.
- proof 9: met — src/ui/driver.test.ts "opens a second driver over the same store with the edit already applied"
builds two drivers over one pageStorage-backed browserSlots, stages through the first and asserts the
second opens with the coordinates applied, the same /local list detail lines and the same localChanges()
bytes; no save command anywhere in it. My mutation, aimed at the branch pass 1 left alone:
`const loaded = held.trim() === '' ? base : loadUniverseWithDiagnostics([...sources, authoring.localSource]);`
replaced with `const loaded = base;` — the driver opens on the shipped modules and forgets what was staged —
KILLED by that named test (neighbours manifest).
- proof 10: unmet — Checked, and the proof fails. The clause promises a restore; what is proved is a serializer.
src/ui/editorMemory.test.ts walks Object.keys(FORGOTTEN) against an exhaustive Record<keyof Editing, ...>
and proves remembered(recorded(x)) === x field by field. Nothing anywhere opens a shell over a store that
already holds an `editor` slot. Three mutations, each of which deletes a restore, all SURVIVED the whole
suite at 0 failed of 3653 (neighbours manifest):
(a) src/ui/App.tsx `useState<Editing>(() => remembered(driver.editorMemory.read()))` to `remembered(null)`;
(b) src/ui/MapPane.tsx `useSheetHold(..., where, ...)` to `useSheetHold(..., undefined, ...)`;
(c) src/ui/EditPane.tsx `list.current.scrollTop = editing.scroll` to `void list.current`.
The commit body's declaration covers (c) and nothing else: it says the suite renders with
renderToStaticMarkup and runs no effect, which is true of the scroll and cursor useEffects and false of
(a) and (b), both of which are useState initializers that a static render reaches. I measured this rather
than argued it. Rendering <App driver={driver} .../> over a browserSlots store seeded with
recorded({...FORGOTTEN, surface:'global', kind:'item', open:'item tutorial-island.bread',
map:{pan:{x:-77,y:33}, zoom:2.5, plane:0}}) produces, in 78ms and with no effect run:
data-surface="global" data-showing, data-section="item tutorial-island.bread" data-opened, the textarea
drawn, and transform translate(-77px, 33px) scale(2.5); the same App over an empty store gives
translate(0px, 0px) scale(1). So the behaviour is right and four of the six things c10 names — the section
open, the map's pan, its zoom and its floor — are provable from the suite that already exists, using the
drawnAt() transform reader render.test.tsx already has. Graded unmet rather than deferred because the
restore is built and works; what is absent is any test that would notice it being deleted.
- proof 11: met — src/ui/browserStore.test.ts calls describeSlotDriver('one localStorage key per slot', () =>
overStorage()), the same exported contract scripts/lib/slotFile.test.ts runs against the file-backed
driver. The contract derives its subjects from the interface twice: `const DECLARED: Record<keyof
SlotDriver, true>` stops it compiling when a verb is added, and a Proxy records which verbs the cases
reached and asserts the set equals the interface's. My mutation, aimed away from pass 1's no-op remove:
`const keyed = (name: string): string => \`${prefix}${name}\`` to `=> name` KILLED by three contract cases
including "keeps slots apart, and lists every one that was written". The other two halves hold on
inspection: src/ui/browserStore.ts imports SlotDriver rather than restating it, src/runtime/store.ts names
no browser, and src/main.tsx is where browserSlots() is constructed and passed in.
- proof 12: met — src/runtime/storeContract.ts CONTRACT_PAYLOADS drives ten values through a real Storage
implementation (src/ui/agent/pageStorage.ts, an object satisfying the DOM Storage shape rather than a mock
of the adapter): empty, whitespace-only, non-JSON, JSON with and without incidental whitespace, nested
non-ASCII, CRLF, leading and trailing newlines, and a 400 000-character value of 'é 😀 line\n'. The stamp
cases assert writtenAt comes from the store's clock beside an unparsed payload. My mutation, at the read
side rather than pass 1's write side: `getItem(keyed(name))` to `getItem(keyed(name))?.trimStart() ?? null`
KILLED by the "   " and "\n\n trailing and leading \n\n" byte-for-byte cases.
- proof 13: met — Pass 1's unmet is discharged, and I re-derived it rather than taking the fix on trust. The
proof no longer counts tool-channel lines: src/ui/driver.test.ts runs the same session over a refusing
store and over a working one and requires, at each moment the refusing store actually refuses at, a line
the working store never produced at that moment. Which moments a mode refuses at is asked of a store built
the same way rather than named, and REFUSING is derived — pageStorage's REFUSING is
Record<StorageRefusal, ...>, so a mode added to STORAGE_REFUSALS stops the file compiling until it can be
induced, and driver.test.ts asserts its own set contains all of STORAGE_REFUSALS plus the store's own
`unrecognised`. No message text is named anywhere in it. I aimed five mutations, including all three pass 1
recorded as surviving the whole suite; all five KILLED, each re-run at src/ui/driver.test.ts with the
mutant still applied (manifest
C:\Users\yonat\AppData\Local\Temp\audit-the-gui-authors-through-the-same-door-pass2-c13.json):
(a) the body of `complain` replaced with `void text` — KILLED, unavailable;
(b) the open-time complaints.push replaced with `void error` — KILLED, unavailable;
(c) writeLocalChanges wrapped in a try/catch that swallows — KILLED, quota;
(d) editorMemory.write's complain replaced with `void error` — KILLED, quota;
(e) browserStore's RuntimeError wrap replaced with `throw error` — KILLED, unavailable.
Residue, recorded so pass 3 does not re-derive it and filed as a finding rather than left here: the moment
list is an enumeration, not a derivation. MOMENTS holds three entries and is pinned by
`expect(Object.keys(MOMENTS)).toHaveLength(3)`, which is the test's own constant against itself, and there
is a fourth reach outside it — editorMemory.read. Replacing its
`complain(\`where the editor was could not be read: ...\`)` with `void error` SURVIVED the whole suite at 0
failed of 3653 (neighbours manifest). Graded met rather than unmet because the clause states its own
universal over the refusal modes, not over the moments, and over the modes the proof is derived and bites;
but if a third pass finds a fifth reach, the answer is a derivation — drive the driver through a Storage
that refuses the Nth reach and walk N — and not a fourth moment.
- proof 14: met — src/ui/browserStore.test.ts "names browser storage in the adapter and nowhere else" walks
src/ui recursively for non-test .ts/.tsx plus src/main.tsx, asserts the walk found the adapter, main.tsx
and more than 20 modules, and asserts /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage|indexedDB)\b/
matches nothing outside src/ui/browserStore.ts; a companion case proves the regex catches four spellings.
My mutation, aimed at the subdirectory rather than pass 1's top-level file: planting `// window.localStorage`
into src/ui/agent/surfaces.ts KILLED by that named test (neighbours manifest), so the walk recurses.
- proof 15: met — scripts/drift.test.ts builds two real stores — fileSlots over a temp directory for the REPL
and browserSlots over pageStorage for the GUI, deliberately not shared — with one clock at 1700000000000,
and after the scripted sequence asserts Object.keys(slotBytes(repl)) equals [local-changes, player] and
slotBytes(gui) deep-equals slotBytes(repl); a second case walks the whole COMMANDS table bare and with an
argument and compares again, requiring more than one slot written. Two mutations of mine, both away from
pass 1's:
`createSaveContext(options.slots ?? memoryDriver(), options.now ?? (() => Date.now()))` with the injected
clock dropped KILLED by both cases; and `writeLocalChanges` writing to a slot named 'local' instead of
LOCAL_CHANGES_MODULE_ID KILLED by "reaches byte-identical state ...". The bytes, not a message, are what
moved in each.
- proof 16: met — src/ui/driver.test.ts "hands over the same bytes /local show prints and the slot holds" stages
an edit, runs /local show, and holds three spellings to one value: driver.localChanges(), the joined detail
lines of that command, and slotStore(slots).read('local-changes').payload. My mutation, aimed at where the
bytes come from rather than pass 1's trimEnd: `localChanges()` returning `authoring.localSource.text` — the
module the session opened on — instead of `stored()` KILLED at file scope by "offers nothing to hand over
when the store cannot be read". That no second serialization exists in src/ui is carried by c2's scan,
which forbids renderLocalChangesModule anywhere under src/ui, re-derived above.
- proof 17: met — src/ui/surface.test.ts "names on every control the harness action that drives it, or why it
needs none" is the existing scanner, deriving button/input/select/textarea from the tree and checking each
data-drive name against what installTestHarness and the surface builders offer; green over the three new
surfaces. Pass 1 deleted an attribute; I asked the other half — whether a name that is present but wrong is
caught. Retargeting src/ui/EditPane.tsx `data-drive="edit.open"` to `data-drive="edit.reveal"` KILLED by
that named test (neighbours manifest). The map bubble erosion pass 1 filed is fixed by construction: the
bubble is now two controls over one appearance, data-drive="map.place" while places are being moved and
data-drive="choose" otherwise, rather than one tag that lies in a mode.
- proof 18: met — npm run tasks -- merge-ready at 6996181 in this worktree: tsc ok, npm test ok, layer-check ok,
audit-status ok, doctor ok (28 warnings, none of which fail the leg), bytes ok, tree ok (nothing
uncommitted), base ok, spec ok (every declared member closed). The one failing leg is "clauses
the-gui-authors-through-the-same-door — 1 outstanding across 1 pass(es): c13", which is pass 1's grade and
is what this pass discharges; it will report c10 after this pass is filed, which is the work c10 creates
rather than a leg this clause can be held to. Two of doctor's warnings are this branch's own:
the-gui-authors-through-the-same-door-pass1-a-test-fixture-s names src/ui/pageStorage.ts:1, the path the
fix for that very finding moved away from.

### Pass 3 — 2026-08-17

- base: `fa790124d4c1cc281a80245b6540a34771767671`
- head: `6eba2d02a4ef62c0c35079e04a468bef8f51192b`
- proof 1: met — Leaned on pass 2 and said so: no production source changed between 6996181 and 6eba2d0.
`git diff --stat 6996181..6eba2d0` names only docs/, scripts/play-cli.test.ts, src/ui/dragSheet.test.ts,
src/ui/driver.test.ts and the editorMemory.test.ts -> .tsx rename, and the only hunk in driver.test.ts is
inside the c13 describe. scripts/drift.test.ts is byte-identical to the tree pass 2 re-derived this on, so
its "reaches byte-identical state and says the same things, over a scripted sequence" and pass 2's kill of
src/ui/driver.ts `readLocalChanges: stored,` to `() => ''` stand unchanged. Not re-derived here.
- proof 2: met — Leaned on pass 2 for the clause and said so: src/ui/authoringSurface.test.ts and every module
it walks are unchanged since 6996181. What I did check, because the rename could have moved the subject set:
the walk's filter is `if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];`
(src/ui/authoringSurface.test.ts:182), which excludes by name and not by extension, so editorMemory.test.tsx
is excluded exactly as editorMemory.test.ts was and the set of scanned modules is the same set pass 2
measured. Pass 2's kill — `void 'adoptRegistry';` planted in src/ui/agent/pageStorage.ts — stands.
- proof 7: met — Leaned on passes 1 and 2 and said so: src/ui/authoringSurface.ts and
src/ui/authoringSurface.test.ts are unchanged since 6996181. Pass 2's two kills — the LOCAL_CHANGES_MODULE_ID
branch dropped from addressOf, and surfaceOf collapsed to `return 'global'`, killed at file scope by "draws
every location on the map surface and nothing else there" and "narrows Local to what is standing where the
player is" — stand. Carried forward unchanged: the assertion named after the partition cannot fail while
surfaceOf is present at all; the partition is carried by its two neighbours.
- proof 8: met — Half leaned on, half re-derived. src/ui/mapEdit.ts and src/ui/mapEdit.test.ts are unchanged
since 6996181, so pass 2's kills (settledOn stripped of Math.round; droppedAt with the placedAt nudge inverse
removed) stand and I did not re-derive them. What moved is src/ui/dragSheet.test.ts, which decides whether a
tap can stage the edit pass 1 filed, so I measured that half myself: src/ui/DragSheet.tsx
`carriedFar = (by, zoom) => Math.abs(by.x * zoom) > DRAG_SLOP_PX || ...` with the `* zoom` dropped is KILLED
by "measures the slop where the finger is and not where the sheet is, at x0.4", re-run at
src/ui/dragSheet.test.ts with the mutant still applied (manifest
C:\Users\yonat\AppData\Local\Temp\audit-the-gui-authors-through-the-same-door-pass3-neighbours.json). Pass 2
measured that mutation only at one zoom, where dropping `* zoom` is invisible. The single case at
`carrying(8)` that the loop replaced tested a zoom outside the sheet's own range (ZOOM_MIN 0.4, ZOOM_MAX 3),
so nothing reachable was given up for it.
- proof 9: met — Leaned on pass 2 and said so: src/ui/driver.ts is unchanged since 6996181 and the "opens a
second driver over the same store with the edit already applied" case is untouched by the c13 hunk. Pass 2's
kill — `const loaded = held.trim() === '' ? base : loadUniverseWithDiagnostics(...)` replaced with
`const loaded = base;` — stands.
- proof 10: met — Re-derived from scratch against the current tree. Pass 2 graded this unmet on three restore
seedings that could each be deleted with the whole suite green; two of the three are now killed, and I aimed
the mutations myself rather than reading the fix. Manifest
C:\Users\yonat\AppData\Local\Temp\audit-the-gui-authors-through-the-same-door-pass3-c10.json:
(a) src/ui/App.tsx `useState<Editing>(() => remembered(driver.editorMemory.read()))` to `remembered(null)`
KILLED by src/ui/editorMemory.test.tsx "opens on the surface it was left on, with the section it had open";
(b) src/ui/MapPane.tsx `useSheetHold(..., where, ...)` to `undefined` KILLED by "opens where the map was
looking, at the zoom and on the floor it was left at"; and a third of my own, aimed past pass 2's list,
(d) src/ui/MapPane.tsx `useState<number | null>(where.plane)` to `useState<number | null>(null)` KILLED by
the same case. Each re-run at src/ui/editorMemory.test.tsx with the mutant still applied and failing there
too. So four of the six things the clause names — the section open (with the kind filter that makes the list
the one the author left), the map's pan, its zoom and its floor — are proved from a store that already holds
where the author was, which is what reopening the tab is.
What is not proved is every effect involved, and it is more than the two the fix declares. Surviving the
whole suite at 0 failed of 3662: (c) src/ui/EditPane.tsx `list.current.scrollTop = editing.scroll` and
src/ui/EditPane.tsx `field.current.setSelectionRange(...)` — the two the 087ae9d body and the test file's own
comment declare untested — and also src/ui/App.tsx:118 `driver.editorMemory.write(recorded(editing))` and
src/ui/MapPane.tsx:193 `onWhere({ pan, zoom, plane })`, which are the write half of the round trip and are
declared nowhere. Filed as a medium finding rather than graded unmet, because I measured the boundary instead
of arguing it: two effects that predate this branch entirely — src/ui/Pager.tsx's
`node.style.transform = restingAt(index)` and src/ui/PlaneModal.tsx's newlyDrawn sprout — also SURVIVE the
whole suite at 0 failed of 3662 (manifest
C:\Users\yonat\AppData\Local\Temp\audit-the-gui-authors-through-the-same-door-pass3-boundary.json). There is
no jsdom and no act() in this repository: `test.environment` is unset in vitest.config.ts and neither jsdom
nor @testing-library is a dependency, so no React effect anywhere in src/ui is exercised by this suite and
never has been. That is the standing state CLAUDE.md's testing rule 5 rules on, not a shortfall of this
branch, and holding c10 to a standard no clause in the repository meets would be the longer exclusion list
that auditor/rule-may-be-wrong warns about. The clause is graded on what a suite with no effect runner can
reach, and all of that is now derived and killed.
- proof 11: met — Leaned on pass 2 and said so: src/ui/browserStore.ts, src/runtime/storeContract.ts,
src/runtime/store.ts and src/ui/browserStore.test.ts are all unchanged since 6996181. Pass 2's kill —
`const keyed = (name: string): string => backtick-prefix-name` to `=> name`, killed by three contract cases —
stands, as does the DECLARED/Proxy pair that derives the contract's subjects from the interface.
- proof 12: met — Leaned on pass 2 and said so: nothing in src/runtime/storeContract.ts, src/ui/browserStore.ts
or src/ui/agent/pageStorage.ts moved since 6996181. Pass 2's kill — `getItem(keyed(name))` to
`getItem(keyed(name))?.trimStart() ?? null`, killed by the byte-for-byte whitespace cases — stands.
- proof 13: met — Re-derived, because this is the one clause whose proof the diff touched.
`expect(Object.keys(MOMENTS)).toHaveLength(3)` — pass 2's finding, the test's own constant against itself —
is now `toHaveLength(STORE_REACHES)`, where STORE_REACHES counts `save\.store\.\w+\(` in src/ui/driver.ts,
and MOMENTS gained the fourth reach pass 2 found unwatched. I broke it in both directions (neighbours
manifest): adding a fifth reach, `save.store.read('notes')` beside `stored()` with no moment for it, KILLED
by "asks every moment of the driver that the store could refuse at"; and removing one, editorMemory.write's
`save.store.write(EDITOR_SLOT, text)` replaced with `void text`, KILLED by the same case. Both re-run at
src/ui/driver.test.ts with the mutant still applied. The correspondence is 1:1 today — read and write of
local-changes, read and write of the editor slot, against opening, staging, remembering and reading — so
recorded for a fourth pass rather than re-derived by it: this is a count over reaches and not an identity
map between them, so two reaches exchanged for two others would still balance. It bites for the case it was
built for and pass 2's residue is discharged. The universal over modes is unchanged since pass 2: REFUSING is
Record<StorageRefusal, ...>, driver.test.ts asserts its own set contains all of STORAGE_REFUSALS plus
`unrecognised`, and no message text is named anywhere in it.
- proof 14: met — Leaned on pass 2 and said so: src/ui/browserStore.test.ts is unchanged since 6996181 and
pass 2's kill — `// window.localStorage` planted into src/ui/agent/surfaces.ts — stands. Checked because the
rename could have moved the walk's subjects: the filter at src/ui/browserStore.test.ts:124 is
`entry.name.includes('.test.')`, extension-agnostic, so editorMemory.test.tsx is excluded exactly as
editorMemory.test.ts was and the ">20 modules" floor is measured over the same set.
- proof 15: met — Leaned on pass 2 and said so: scripts/drift.test.ts, scripts/lib/slotFile.ts,
src/ui/browserStore.ts and src/ui/driver.ts are all unchanged since 6996181. Pass 2's two kills — the
injected clock dropped from createSaveContext, and writeLocalChanges writing to a slot named 'local' — stand.
- proof 16: met — Leaned on pass 2 and said so: the "hands over the same bytes /local show prints and the slot
holds" case is untouched by the c13 hunk and src/ui/driver.ts has not moved. Pass 2's kill — `localChanges()`
returning `authoring.localSource.text` instead of `stored()` — stands, and c2's scan forbidding
renderLocalChangesModule anywhere under src/ui is re-derived above at proof 2.
- proof 17: met — Leaned on pass 2 for the scanner and said so: src/ui/surface.test.ts and every component it
scans are unchanged since 6996181, so pass 2's kill — src/ui/EditPane.tsx `data-drive="edit.open"`
retargeted to `data-drive="edit.reveal"` — stands. What I checked, because the tree gained a .tsx file
carrying JSX: the scanner's filter at src/ui/surface.test.ts:26 is the same
`entry.name.includes('.test.')`, so editorMemory.test.tsx is not in SOURCES and neither the control rule nor
c6's shipped-reaches-agent rule changed subject. Green on the npm test leg of merge-ready at 6eba2d0.
- proof 18: met — npm run tasks -- merge-ready at 6eba2d0 in this worktree: tsc ok, npm test ok, layer-check ok,
audit-status ok, doctor ok (28 warnings, none of which fail the leg), bytes ok, tree ok (nothing
uncommitted), base ok, spec ok (every member closed). The one failing leg is "clauses
the-gui-authors-through-the-same-door — 1 outstanding across 2 pass(es): c10", which is pass 2's grade and is
what this pass discharges; re-running merge-ready after this pass is filed is what a next reader should do.
One of doctor's warnings is still this branch's own and was not cleared by 6eba2d0:
the-gui-authors-through-the-same-door-pass1-a-test-fixture-s names src/ui/pageStorage.ts:1, the path the fix
for that very finding moved away from. It does not fail the leg.
