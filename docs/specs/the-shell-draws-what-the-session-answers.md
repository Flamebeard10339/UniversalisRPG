# the-shell-draws-what-the-session-answers

## Deliverable

Two things about a session are true at the level of the whole shell rather than of any one page:
whether the session opened at all, and whether it is the player's or a developer's. Neither is drawn
today. `createDriver` (`src/ui/driver.ts:80`) catches an opening failure into a `fault` string and
hands React `view: null`; no component reads `fault`, so what an author gets after a bad edit is a
shell with a message in it, no session, and no control that changes anything — a state entered by
editing and impossible to leave by editing, because editing needs the session that failed to open. And
nothing in the tree is dev-only at all: a grep for `devMode`, `debugMode`, `contributionMode` or
`isDev` across `src/` and `scripts/` comes back empty, and the Settings subpage renders `null`
(`src/ui/App.tsx:150`).

They are one branch because they are one rule. In both cases the session already knows the answer —
`auto-save-export-and-load` c13 makes which slot is live a thing a session reports, and the driver
already holds why an open failed — and the defect in both cases would be a component keeping its own
copy of it. The orange banner is a rendering of c13's answer, the recovery control is a rendering of
`fault`, and neither is a second piece of state. Writing them as two branches would have meant two
workers in `src/ui/App.tsx` deciding separately what the shell draws over a page, which is how the two
copies get made.

The route into the broken state is the one an author will actually take: an edit is made in the game,
copied into a file under `content/`, and the page reloaded — and now the base module and the local
module both speak about the same ids. Read carefully that is two situations. While the local module
still loads it *wins* the merge and silently shadows the file that was just edited, so the author's
next edit to that file does nothing and nothing says so. Once it no longer loads — because the base
moved under a `-field:` edit or a `# remove` it made — the app strands. This branch owns the exit, not
the detection: whether a redeclaration is an error is
`refuse-two-objects-of-different-kinds-sharing-an-id-while-ei`'s question at `declareIds`, and whether
a parse may drop what it does not understand is `nothing-authored-is-silently-dropped`'s. Both answers
are taken as given, and whatever they refuse, the author can still act.

The dev powers themselves are commands. Teleport does not exist in any form — no `/goto`, no cheat
command anywhere — and the speed multiplier already does: `/speed` turns `LiveSettings.speed`
(`src/runtime/command.ts:627`), which the live clock reads. Both go through the shared command table
for the reason `createDriver` already gives about every other route in: the table decides what a
command does, so the two drivers cannot reach different sets, and a `# test` can replay a session that
used one.

Proof:

- [c1] **A local module that will not load never costs the session.** The session opens on the base
  sources alone, the local module is set aside rather than applied, and the reason is on the tool
  channel. The game is playable and every non-authoring surface behaves as it does with no local module
  at all. The proof induces the failure through the store rather than through a command, because a
  payload written by a previous session is how this state is actually reached.
  proof: vitest src/ui/driver.test.ts
- [c2] **Clearing local changes is always available in that state, and always works.** The control that
  discards the local module is reachable whenever the local module was set aside, and taking it leaves
  the session in the state a first-ever launch would produce: base sources, empty local module, no
  residue in the store. It cannot itself fail on text it cannot parse, because it writes a fresh module
  rather than editing the broken one.
  proof: vitest src/ui/driver.test.ts src/runtime/command.test.ts
- [c3] **A local section that shadows a base section is reported, for every kind.** When the local
  module declares an id the base sources also declare, the author is told which ids and which files —
  whether or not the merged result differs — because a local copy that matches its base is exactly the
  copy that makes the next edit to the file invisible. The clause is universal over kinds and its proof
  derives its subjects by walking `SCHEMAS` and the loaded modules, not by naming location, item and
  entity.
  proof: vitest src/ui/authoringSurface.test.ts
- [c4] **Every state the loader can leave the app in has an action out of it.** For each way opening
  can fail — a base module that will not parse, a base module that parses but leaves no starting
  location, a local module that will not parse, a local module that will not resolve against the base —
  the shell offers at least one control that changes the state, and `fault` is never rendered as text
  with nothing beside it. The proof derives its cases from the driver's own failure modes rather than
  listing screens.
  proof: vitest src/ui/driver.test.ts src/ui/shell.test.tsx
- [c5] **A failure in the base is distinguishable from a failure in the local module, and only one of
  them is the author's to clear.** Clearing local changes is offered when the local module is at fault
  and is not offered — and would not help — when a shipped file is. Telling an author to discard their
  work to fix a bug that is not theirs is the specific wrong answer this clause forbids.
  proof: vitest src/ui/driver.test.ts
- [c6] **One answer gates every dev-only control, and the banner reads the same one.** Which slot is
  live is asked of the session, and every dev-only surface — the editing surfaces, the teleport
  gesture, the speed control — and the banner are readings of that one answer. No component holds its
  own copy of whether dev mode is on, exactly as no component holds its own copy of whether the session
  opened. The proof derives its subjects from the tree: every control marked dev-only is gated, and one
  marked nothing is not reachable while dev is off.
  proof: vitest src/ui/devMode.test.tsx
- [c7] **The toggle is the dev slot's entry, not a second one.** Turning it on takes the snapshot and
  moves writes to the dev slot; turning it off restores the snapshot and discards the dev slot. The
  guarantee an author gets from the screen is byte-for-byte the guarantee the REPL gets, because it is
  the same call into `auto-save-export-and-load` c9–c13. There is no path in `src/ui` that sets a dev
  flag without entering the slot.
  proof: vitest src/ui/devMode.test.tsx scripts/play-cli.test.ts
- [c8] **Every dev power is a line the shared command table parses.** Teleport and the speed multiplier
  are commands, available to both drivers; what moved the world is recorded and replayable in a `# test`. No
  component mutates session state directly. The proof derives its subjects rather than listing the two:
  no module under `src/ui` writes to the session or its state except through the command table.
  proof: vitest src/ui/devMode.test.tsx src/runtime/command.test.ts
- [c9] **Tapping a place on the map has one handler and one decision.** With dev off it sets off for
  that place, exactly as it does today, arrival delay and all; with dev on it arrives there
  immediately. Both spell a command. A place the player could not reach on foot is reachable this way,
  and the state after it resolves — the location is what the registry holds, discovery is spread, and
  anything the arrival would have triggered is triggered.
  proof: vitest src/ui/devMode.test.tsx src/runtime/command.test.ts
- [c10] **There is one time multiplier.** The control writes the dial `/speed` turns and reads the same
  value back; `src/ui` declares no second multiplier, default or clamp, and setting it from the screen
  and from the console are indistinguishable afterwards.
  proof: vitest src/ui/devMode.test.tsx
  proof: command grep -rn "speed" src/ui --include=*.ts --include=*.tsx --exclude=*.test.*
- [c11] **With dev off, nothing changes.** Saving, loading, autosave, travel and the live clock behave
  exactly as they do before this branch; no dev slot is created; every dev command refuses from the GUI
  and says so. A player who never opens the toggle cannot tell this branch landed. `play-cli` stays
  ungated, because it is a developer's tool and every `# test` in the repository goes through it.
  proof: vitest src/runtime/integration.test.ts src/ui/driver.test.ts
- [c12] **Nothing that loads today stops loading.** Shipped content, every `# test` over it and the
  whole suite pass unchanged, and no authored file is edited to accommodate this branch. A recovery path
  that needed content changed to reach it would be a behaviour change wearing a safety net's clothes.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat main...HEAD -- content/tutorial-island.dsl content/combat-expansion.dsl
- [c13] **Every control added here names its driver.** Every button, input, select and textarea this
  branch adds carries `data-drive` naming a harness action, or `none:` with a reason, and each named
  action exists — the existing scanner's derivation, still passing over a tree with a dev banner, a
  recovery control and a Settings body in it.
  proof: vitest src/ui/surface.test.ts
- [c14] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make the two facts that are true of a whole session — did it open, and whose is it — things the shell
reads and draws, so that a bad edit is recoverable and the first dev power has a gate the tenth can be
added behind.

## Decisions

**Merges `no-source-text-can-strand-the-app` and `dev-powers-are-one-gate`, which were two specs in
the first plan.** `tasks plan` reported both forecasting `src/ui/App.tsx` with no edge between them —
the two-workers-one-file shape that cost this repository 206 lines once already — and the first fix was
an ordering edge. The author ruled on 2026-08-16 that the push folds wherever folding costs no
parallelism, and an ordering edge is the proof that it costs none here. The merge is not only
scheduling: both halves are the same invariant, that the shell renders an answer the session gives
rather than holding a copy of it, and c4 and c6 are that invariant read at its two ends.

**Takes over `gui-dev-mode-toggle-banner-and-editing-gate`, which is retired into c6, c7, c8 and
c11.** That record is the presentation half of the dev slot and names exactly those. It carries a
2026-08-12 note that the Edit subpage is not an empty frame — `gui-rebuild` shipped the command console
there and the author ruled it stays — and the note is honoured: the editing surfaces land beside the
console, and the toggle lands in Settings, which renders nothing today. Its `/dev` shortcut is folded
into c8, where it is one more command rather than a special case.

**Extends `the GUI shell`, `the two-dimensional nav` and `the GUI's session container`; registers `the
dev gate` over `src/ui`.** The Settings subpage already exists in `LAYERS` (`src/ui/nav.ts:42`) with no
body, which is where `gui-rebuild` c7 left it; filling it extends that concept rather than adding one.
The driver already owns opening a universe and already holds `fault`; what c1–c5 add is that the field
has consequences. The gate itself is new and is registered once, because "is this power dev-only" is a
question later branches will ask and a survey should find an owner for.

**Owns the exit, not the detection — checked against the standing rulings rather than assumed.**
`nothing-authored-is-silently-dropped`'s Decisions divide the silent-acceptance cluster into three
invariants with three enforcement points and assign *an id is declared once* to
`refuse-two-objects-of-different-kinds-sharing-an-id-while-ei` at `declareIds`. This branch takes no
part of that. c3 is not a redeclaration check: a redeclaration across modules is the patch mechanism
`mergeSection` exists to serve, and a mod overriding a base section is the system working. c3 reports
the fact to the one audience that needs it — the author who has a copy of a file in two places and is
about to edit the wrong one — and refuses nothing.

**c3's report is a diagnostic, and the consolidation it points at is not here.** The remedy for a
shadowing section is to send it home to its source file, which is `an-edit-goes-home-to-its-source-file`'s
deliverable. Building the remedy inside the diagnosis would put a filesystem write behind a browser
warning, which the browser cannot do, and would leave the CLI consolidation with a second
implementation.

**Teleport is a command with no shipped content behind it, and that is deliberate.** It is dev-only at
the gate, not at the parser, so `play-cli` has it unconditionally the way `/dsl` does, and a `# test`
may use it to put a session somewhere without walking there. Making it refuse below the gate would put
the mode into the engine, which the absorbed dev-slot reasoning explicitly declined: dev mode is a mode
of the game, and the CLI is not the game.

**c9 keeps one handler rather than two surfaces.** A separate dev map would be a second thing drawing
the same report, which is the shape the 2026-08-12 ruling on the plane pane already rejected once. One
tap, one decision point, and the decision is c6's answer.

## Open questions

- Whether the set-aside local module is preserved in the store so a later build can load it, or is
  moved to a quarantine slot the author can still read, is the worker's call. c2 fixes what clearing
  leaves behind; it does not require the broken text to be destroyed at the moment it is set aside.
- Where c2's control is drawn — a banner over the shell, a row on the Edit surface, or both — is the
  worker's call. c4 fixes that an action exists in every failure state, not which surface carries it.
- Whether the dev slot survives a page reload so a dev session can be resumed, or is discarded on exit,
  is the worker's call, and is the absorbed spec's own open question reaching the browser. c7 fixes what
  the toggle does, not what a second launch finds.
- Whether the speed control is a slider, a stepped set of multipliers or a number field is the worker's
  call, and is a UI decision the author tests. c10 fixes that there is one dial.
- Which further powers are dev-only is not decided here. c6 makes adding one a matter of marking it,
  and the mark is what a later branch reads.

## Decisions the worker made

**The set-aside local module stays in the slot it was in.** The first open
question. Nothing is moved to a quarantine slot: the payload is still what
`/local show` prints and what the Edit page reads, so an author can copy their
work out before deciding to discard it, and clearing is the one thing that
destroys it. A quarantine slot would be a second place the module can be, and
the whole of the branch is about not making second copies.

**c2's control writes the fresh module by sending `/local clear`, then reopens.**
The command already mints a header from the dependencies rather than editing the
text, which is exactly what c2 asks for, and `authoringSurface.test.ts` holds
`src/ui` to reaching the local-changes module for its name and nothing else — a
driver that wrote the module itself would go around the one load-and-adopt path.
The reopen after it is what makes the result the session a first-ever launch
produces rather than the one that was already standing.

**The recovery control is a banner over the whole shell.** The second open
question. It sits above the column rather than on the Edit page, because the
state it is about is one where there may be no page worth opening: a base module
that will not load leaves no session, and a control on a page is a control
reached by navigating a shell that has nothing in it.

**The dev slot does not survive a page reload.** The third open question. A new
driver starts with `save.dev` false, so a reload comes back as the player. The
dev slot itself is untouched and `/restore` picks it up after `/dev on`, which
is the resumption the absorbed spec's question was really about; carrying the
mode across a reload would mean persisting it, and a persisted mode is a second
copy of the answer c6 says there is only one of.

**The speed control is a field and a button, the shape the console already has.**
The fourth open question. It holds what is being typed and sends `/speed` on
submit, and it is re-keyed on the session's own value so a line typed at the
console puts the field where it put the dial. What is typed goes over as
written: `src/ui` does not read it as a number, so the default and the clamp
c10 forbids stay where they already were, in `/speed`'s own parser — which is
also what makes a refusal come back from the one place that decides.

The first build bound the input straight to `snapshot.speed`, which meant every
keystroke sent a command. That was an over-reading of c10 — a draft string in a
form field is the field's contents, not a second multiplier — and it built a
second thing beside `Console.tsx`, which had the pattern already. The author
caught it. A stepped set of multipliers stays rejected: those steps would be
multipliers this layer declared.

**`/speed` is not marked dev-only; the control that turns it is.** c6 names the
speed control as a dev-only surface and c11 says a player cannot tell this
branch landed. `/speed` has been reachable from the GUI console since
`gui-rebuild`, so marking the command would be a behaviour change; marking the
widget is what c6 asks for. `/goto` is marked, and is the only mark.

**The recorder records what moved the world, so `/speed` leaves no line.** c8
describes both dev powers as recorded and replayable. Teleport is a directive
and records. The multiplier is one variable — `ctx.live.speed`, read only where
a live tick turns real milliseconds into sim seconds — so a `speed:` directive
would replay as a no-op, because `applyDirective` has no `LiveSettings` to turn.
It is covered by unit tests rather than by a `# test`, which is what a variable
with one read site wants anyway.

**The editing surfaces are gated and the command console is not, and that is
the whole of what a non-dev GUI loses.** c6 names the editing surfaces as
dev-only; the 2026-08-12 note the Decisions above honour says the console the
Edit subpage already ships stays. Both hold: `EditPane` wraps the staging
surfaces in the gate and leaves `Console` outside it, so every command the
shared table defines is still reachable from the GUI exactly as before.

Named rather than left to a diff, because it reads against c11's summary
sentence: two things a GUI without the dev slot had before this branch are gone
— the Edit subpage's staging surfaces (filters, section list, section field,
Stage, Unstage, Copy) and the map's Place button. Nothing else moved, and both
are what c6 instructs.

**Leaving the dev slot discards the session, and does not discard the work.**
Pass 1 asked whether authoring inside a slot whose exit throws its contents away
leaves an author's edit-and-test loop ending in a loss. It does not: a staged
edit lives in the local-changes slot, which is not a game slot and which no dev
transition reads or writes, so `/dev off` restores the pre-dev session *over the
same local module* and the edits are still being played. What the exit discards
is the play built in dev, which is `auto-save-export-and-load` c9–c13's contract
and the one c7 adopts byte-for-byte rather than a consequence this branch chose.
`devMode.test.tsx` holds it.

**Four words were added to `content/engine-en.dsl` and `ENGINE_KEYS`.** c12 says
no authored file is edited to accommodate this branch, and its command proof is
`git diff --stat HEAD -- content/`. That diff is not empty: the four controls
this branch adds need words, and the engine's vocabulary table is where a
control's word has lived since `gui-rebuild` — `src/ui/render.test.tsx` refuses
a run of text on the screen that is neither an engine value nor a key in
`LABELS`, so a control with no word is not an option. No shipped game content
moved: `tutorial-island.dsl` and `combat-expansion.dsl` are untouched, which is
what c12's own sentence about a recovery path needing content changed is aimed
at. Flagged rather than assumed.

**c3's report lives in `src/ui/authoringSurface.ts`, not `src/content/localChanges.ts`.**
The forecast named the latter. `addressable` is the function that discards
exactly this information — it collapses a staged copy and the shipped section it
shadows into one row — and the qualification rule that turns a section into an
address lives beside it in `sectionsIn`. Putting the report in the content layer
would have meant a second copy of that rule, which is the failure mode this
repository names first. The proof moved with it, to
`src/ui/authoringSurface.test.ts`, and still walks `SCHEMAS`.

## Audit passes

### Pass 1 — 2026-08-17

- base: `7a0081a19f28d556372123f479f8d0baec702d7c`
- head: `2a93ced3bd3bda2329ab2823f5176df0b51d6389`
- proof 1: met — vitest src/ui/driver.test.ts "a local module that will not load never costs the session (c1, c2)".
  The proof writes the payload into the slot rather than typing a command, and walks both broken shapes
  ("will not parse", "will not resolve"): the driver opens on SHIPPED_SOURCES alone, serialized() and the
  whole view are identical to a driver opened with an empty slot before and after a /look, the reason rides
  the tool channel, and localChanges() still returns the broken text. Mutation c1b
  (src/ui/driver.ts `open(base, authoring, save, said)` -> `open(base, authoring, save, [])`) KILLED by that
  named test, re-run at its own file. Mutation c1a (`setAside = because(error);` -> `setAside = null;`)
  SURVIVED the whole suite: that catch is a branch no route I could build reaches (a `# remove`, a
  `-starting`, a dangling `adjacent:` and pure garbage all arrive as diagnostics, verified by probe), so it
  is untested defensive code rather than a hole in what c1 promises. Filed as a finding.
- proof 2: met — vitest src/ui/driver.test.ts "clears from any state that offers it, and lands where a first-ever
  launch lands". Clearing is taken from both broken shapes, including the one nothing can parse; afterwards
  fault is null, serialized() equals a fresh driver's, listLocalSections of what the slot holds is empty, and
  a second driver built over the same slots opens on the same bytes, which is the "no residue in the store"
  half. Mutation (src/ui/driver.ts send of `/local clear` changed to `/local list`) KILLED by that named
  test. The control writes a fresh module rather than editing the broken one because it spells /local clear,
  which mints a header from the dependencies; src/ui holds no second spelling of it.
- proof 3: met — vitest src/ui/authoringSurface.test.ts "a local section that shadows a base section is reported,
  for every kind (c3)" plus src/ui/driver.test.ts "opens a second driver over the same store with the edit
  already applied". The kind sweep derives its subjects from Object.keys(SCHEMAS) minus the header and asserts
  the count is over ten, and the address it compares against is the one addressable() itself writes, so the
  test does not restate the qualification rule. A copy identical to its base and a copy that differs report
  the same thing, which is the clause's "whether or not the merged result differs". Mutations c3a
  (src/ui/authoringSurface.ts `shipped.get(keyOf(section))` pointed at a key nothing holds) and c3b
  (src/ui/driver.ts `...shadowing(local.text)` deleted) both KILLED by their named tests.
  The report is implemented in src/ui/authoringSurface.ts (`shadowed`) rather than in
  src/content/localChanges.ts as this clause's proof line forecast. Judged on the merits and accepted: the
  information c3 wants is exactly what `addressable` discards, and the rule that turns a section into an
  address lives beside it in `sectionsIn`, so the content-layer placement would have been a second copy of
  that rule. The spec's proof line still names src/content/localChanges.test.ts and is now wrong.
- proof 4: met — vitest src/ui/driver.test.ts "every state the loader can leave the app in has an action out of
  it (c4, c5)" and src/ui/shell.test.tsx "a fault is never drawn as text with nothing beside it (c4, c5)".
  The cases are the cross product of three base states and four local states derived as a table rather than
  as a list of screens, the run asserts all three outcomes (opened, base, local) were actually reached, and
  every fault is checked to carry at least one remedy. shell.test.tsx reads the drawn markup rather than the
  props: the banner region is matched out of the rendered HTML and its data-drive buttons compared to
  remediesFor, in both directions (every fault draws its remedies, and every remedy is drawn by some fault),
  with a session under it and without one. Mutation (src/ui/driver.ts remediesFor's base arm made empty)
  KILLED by that named test.
- proof 5: met — vitest src/ui/driver.test.ts "offers clearing where the local module is at fault and nowhere
  else". Over the same derived table: clear-local is offered exactly when fault.at is 'local', and fault.at is
  'local' exactly when the base loads and the local module does not, asserted against the table's own labels
  rather than against an error string, which is the clause's "told apart by which path was taken".
  Mutation (src/ui/driver.ts the fallthrough fault relabelled from 'local' to 'base') KILLED by that test.
- proof 6: unmet — The gating half is met and holds by construction: DevOnly.tsx is the only module in the tree that
  writes data-dev (asserted by walking every shipped module under src/ui), so a mark that is not gated cannot
  be written; rendering App as the player contains no data-dev and rendering it after /dev on contains more
  than one; no module under src/ui assigns a dev flag or names DEV_SLOT, enterDev, leaveDev, devSnapshot or
  liveSlot. Mutation (src/ui/DevOnly.tsx `return dev ? (` -> `return true ? (`) KILLED.
  The banner half is not delivered. The clause says "and the banner reads the same one"; the Deliverable says
  "The orange banner is a rendering of c13's answer"; c13 says the scanner still passes "over a tree with a
  dev banner, a recovery control and a Settings body in it"; the absorbed record is named
  gui-dev-mode-toggle-banner-and-editing-gate. grep -rni "banner" src/ui returns FaultBanner, LocationBanner
  and StatusBanner and no dev banner, and DevOnly renders className="contents", which draws nothing of its
  own. The only thing on any screen that says whose session this is is the checkbox on the Settings subpage.
  Checked and fails; recorded unmet rather than deferred because the clause's other half is delivered here and
  the missing half is this branch's, not a later branch's.
- proof 7: met — vitest src/ui/devMode.test.tsx "the toggle is the dev slot's entry, not a second one (c7)".
  The screen's guarantee is measured as bytes: a session is edited, serialized, taken into dev, moved with
  /wait 30 and /save, then taken out; serialized() is back to the pre-dev bytes, DEV_SNAPSHOT_SLOT is gone,
  DEV_SLOT holds what dev did and PLAYER_SLOT is untouched. That there is no second path is derived: every
  shipped module under src/ui is checked to name none of the slot machinery and to assign no dev flag.
  Mutation (src/ui/devMode.ts devLine made to spell "on" for both arms) KILLED by the byte test.
- proof 8: met — vitest src/runtime/command.test.ts "/goto stands the player somewhere no road reaches, and
  records a line that replays" (recorder.history is ['goto: island'] and a `# test` built from that line
  replays to the same place) and "marks the dev-only commands, and the tokens are read off the marks";
  vitest src/ui/devMode.test.tsx "marks at least one, and every mark is a line both drivers can run", which
  walks COMMANDS.filter(spec => spec.dev) rather than naming /goto. "No component mutates session state
  directly" is derived by src/ui/surface.test.ts's DISPATCHES allowlist plus MOVES_THE_WORLD, over every
  module under src/ui; the branch's one addition to that list, devTokenIn, is a pure read of the table's own
  marks. Mutations c8 (src/content/serialize.ts printing goto: as travel:) and c9b both KILLED.
  Deviation, judged and accepted: the clause's sentence names "the speed multiplier" alongside teleport as
  recorded and replayable, and /speed records nothing. Under the branch's own settled reading /speed is not a
  dev power at all: it is unmarked on the table and only the widget is gated, so c8's universal ("every dev
  power") has one subject and that subject is recorded. Recording /speed would emit a directive
  applyDirective has no LiveSettings to turn, i.e. a `# test` line that replays as a no-op. Accepted; the
  disagreement between the clause's sentence and the implementation is filed as a finding so the next reader
  is not left to reconstruct it.
- proof 9: met — vitest src/ui/devMode.test.tsx "tapping a place has one handler and one decision (c9)". One
  decision point, tappedPlace(dev, place, goes), is asserted over all four cells; the dev-on path is played
  end to end against a world whose far place has no road to it (put on the map by a discover: on a signpost,
  and asserted unreachable before the tap), and the state after is read off the engine's own report: location
  is the far place, it is discovered, and every road out of it is discovered. The dev-off path is compared
  against driver.choose by serialized() bytes and by the live run, so "exactly as it does today, arrival delay
  and all" is a byte comparison rather than a claim. Mutations c9a (src/ui/devMode.ts's dev arm made to spell
  a choice) and c9b (src/runtime/session.ts relocateTo replaced by a bare location assignment) both KILLED.
- proof 10: met — vitest src/ui/devMode.test.tsx "there is one time multiplier (c10)": setting from the field and
  setting from the console both land on snapshot.speed, which is context.live.speed. The command proof
  grep -rn "speed" src/ui --include=*.ts --include=*.tsx --exclude=*.test.* returns eleven lines, all of them
  either the prop being passed down, the label key, or speedLine spelling /speed; no default, no clamp, no
  second field. The sweep over every shipped src/ui module for a speed assigned a number and for a speed near
  Math.min, Math.max or clamp derives that rather than asserting it once. Mutation (src/ui/driver.ts
  `speed: context?.live.speed ?? null` -> `speed: 1`) KILLED.
- proof 11: met — vitest src/ui/driver.test.ts and src/ui/devMode.test.tsx "with dev off, nothing changes (c11)":
  a whole session with /autosave, /save, /look and /restore leaves no slot whose name starts with "dev",
  refusing a dev power moves no bytes and creates no dev slot, the refusal is derived from the table's marks
  rather than a list, and the CLI runs /goto with no gate at all. src/runtime/integration.test.ts is green.
  Mutations c11a (src/ui/devMode.ts devTokenIn's answer discarded) and c11b (src/runtime/command.ts the
  dev mark on /goto flipped off, which empties the derived set) both KILLED.
  The clause's enumerated subjects, saving, loading, autosave, travel, the live clock, no dev slot, every dev
  command refused and said so, and play-cli ungated, all hold. Its summary sentence ("a player who never
  opens the toggle cannot tell this branch landed") does not: the Edit subpage's staging surfaces and the
  map's Place button were reachable from the GUI before this branch and are now behind the gate, which
  src/ui/editorMemory.test.tsx measures by having to send /dev on to see what it saw before. That is c6's
  instruction rather than a defect, and it is filed as a finding because the two clauses disagree in the spec
  and the resolution lives only in the worker's Decisions.
- proof 12: met — vitest src/runtime/integration.test.ts green, and the whole suite green under
  npm run tasks -- merge-ready (tsc, npm test, layer-check, audit-status, doctor, bytes all pass).
  The command proof as written, git diff --stat HEAD -- content/, is empty on a clean tree and so answers
  nothing; read against the diff base it is not empty. git diff 7a0081a..2a93ced --stat -- content/ is four
  added lines in content/engine-en.dsl and nothing else. Judged on the merits and accepted: those four are
  engine vocabulary keys for the four controls this branch adds, mirrored into ENGINE_KEYS and LABELS, which
  is the established route for a shell word and is forced by src/ui/render.test.tsx refusing any run of text
  on screen that is neither an engine value nor a LABELS key. No shipped game content moved:
  tutorial-island.dsl and combat-expansion.dsl are untouched, so what c12's own sentence forbids, a recovery
  path reachable only because content was changed, did not happen. The unrunnable command proof is filed as a
  finding against the contract.
- proof 13: met — vitest src/ui/surface.test.ts "names on every control the harness action that drives it, or why
  it needs none", which reads every button, input, select and textarea out of every module under src/ui with
  a brace-aware scanner and checks each declared name against installTestHarness's own action list rather
  than against a table written beside the tree. The controls this branch adds, clear-local and reopen on the
  fault banner, the dev checkbox and speed field in Settings, and map.go on every map bubble, all pass, and
  the two driver-level actions were added to the harness. Two mutations, one per half of the rule: c13a
  (src/ui/MapPane.tsx data-drive on the map bubble renamed away, so a control names no driver) and c13b
  (src/ui/FaultBanner.tsx clear-local misspelt, so a control names an action the harness does not offer)
  both KILLED by that named test.
- proof 14: met — npm run tasks -- merge-ready on 2a93ced: tsc pass, npm test pass, layer-check pass,
  audit-status pass, doctor pass (27 warnings, none of which fails the leg), bytes pass, tree pass (nothing
  uncommitted), base pass (main has not moved past the merge base). The two legs that fail are the two this
  pass exists to clear: "1 open member" and "has no recorded audit pass". Re-runnable by the next pass with
  the same one command.
