# no-source-text-can-strand-the-app

## Deliverable

An author who edits content in the browser will, sooner or later, write text the loader cannot use.
The failure that matters is not the bad text — it is that the app has no way back. `createDriver`
(`src/ui/driver.ts:80`) catches an opening failure into a `fault` string and hands React
`view: null`; no component reads `fault`, so what the author gets is a shell with a message in it, no
session, and no control that changes anything. The state is entered by editing and cannot be left by
editing, because editing needs the session that failed to open.

The specific route in is the one the author will actually take: an edit is made in the game, copied
into a file under `content/`, and the page is reloaded — and now the base module and the local module
both speak about the same ids. Read carefully, that is two different situations and this branch
answers both. When the local module still loads, it *wins* the merge and silently shadows the file
that was just edited, so the author's next edit to that file does nothing and nothing says so. When it
no longer loads — because the base moved under a `-field:` edit or a `# remove` it made — the load
fails and the app strands.

What this branch owns is the exit, not the detection of bad text. Whether a redeclaration is an error
is `refuse-two-objects-of-different-kinds-sharing-an-id-while-ei`'s question and its enforcement point
is `declareIds`; whether a parse may drop what it does not understand is
`nothing-authored-is-silently-dropped`'s. This branch takes each of those answers as given and
guarantees that whatever they refuse, the author can still act.

Proof:

- [c1] **A local module that will not load never costs the session.** The session opens on the base
  sources alone, the local module is set aside rather than applied, and the reason is on the tool
  channel. The game is playable and every non-authoring surface behaves as it does with no local
  module at all. The proof induces the failure through the store rather than through a command,
  because a payload written by a previous session is how this state is actually reached.
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
  proof: vitest src/content/localChanges.test.ts
- [c4] **Every state the loader can leave the app in has an action out of it.** For each way opening can
  fail — a base module that will not parse, a base module that parses but leaves no starting location,
  a local module that will not parse, a local module that will not resolve against the base — the shell
  offers at least one control that changes the state, and `fault` is never rendered as text with
  nothing beside it. The proof derives its cases from the driver's own failure modes rather than
  listing screens.
  proof: vitest src/ui/driver.test.ts src/ui/shell.test.tsx
- [c5] **A failure in the base is distinguishable from a failure in the local module, and only one of
  them is the author's to clear.** Clearing local changes is offered when the local module is at fault
  and is not offered — and would not help — when a shipped file is. Telling an author to discard their
  work to fix a bug that is not theirs is the specific wrong answer this clause forbids.
  proof: vitest src/ui/driver.test.ts
- [c6] **Nothing that loads today stops loading.** Shipped content, every `# test` over it and the whole
  suite pass unchanged, and no authored file is edited to accommodate this branch. A recovery path that
  needed content changed to reach it would be a behaviour change wearing a safety net's clothes.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat HEAD -- content/
- [c7] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make bad content a state the author can leave, so that authoring in the browser is recoverable rather
than one edit away from a page that has to be fixed from a text editor.

## Decisions

**Extends `the GUI's session container`; registers no concept.** The driver already owns opening a
universe and already holds `fault`; what this adds is that the field has consequences. A second
concept over `src/ui/driver.ts` would manufacture the two-concepts-one-file report, which is the shape
of the 2026-08-07 and 2026-08-14 rulings on `an-action-pruned-for-a-dangling-reference` and
`authored-prose-is-addressed-by-its-owner`. The `produces` forecast is cleared rather than registered.

**Owns the exit, not the detection — checked against the standing rulings rather than assumed.**
`nothing-authored-is-silently-dropped`'s Decisions divide the silent-acceptance cluster into three
invariants with three enforcement points and assign *an id is declared once* to
`refuse-two-objects-of-different-kinds-sharing-an-id-while-ei` at `declareIds`. This branch takes no
part of that. c3 is not a redeclaration check: a redeclaration across modules is the patch mechanism
`mergeSection` exists to serve, and a mod overriding a base section is the system working. c3 reports
the fact to the one audience that needs it — the author who has a copy of a file in two places and is
about to edit the wrong one — and refuses nothing.

**Requires `the-gui-authors-through-the-same-door`, and collides with it on `src/ui/driver.ts`.** Both
branches write the driver's opening path, so they are sequenced rather than run together, per
one-worker-per-worktree. The order is forced by more than the file: c1's "set the local module aside"
has no meaning until there is a local module in the browser to set aside.

**c3's report is a diagnostic, not a gate, and the consolidation it points at is not here.** The remedy
for a shadowing section is to send it home to its source file, which is
`an-edit-goes-home-to-its-source-file`'s deliverable. Building the remedy inside the diagnosis would
put a filesystem write behind a browser warning, which the browser cannot do, and would leave the CLI
consolidation with a second implementation.

## Open questions

- Whether the set-aside local module is preserved in the store so a later build can load it, or is
  moved to a quarantine slot the author can still read, is the worker's call. c2 fixes what clearing
  leaves behind; it does not require the broken text to be destroyed at the moment it is set aside.
- Where c2's control is drawn — a banner over the shell, a row on the Edit surface, or both — is the
  worker's call. c4 fixes that an action exists in every failure state, not which surface carries it.
