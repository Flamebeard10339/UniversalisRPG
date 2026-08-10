# in-process-module-api

## Deliverable

There is one driver today and it is also the only definition of what a player can do.
`scripts/play-cli.ts` holds the command set, the recorder, the DSL-authoring commands, the live
clock and the terminal rendering in one 909-line file at layer `scripts` — above `ui`, so a second
driver cannot import a line of it. And what the engine publishes is not enough to render from:
`formatInventory` and `formatState` take `session.state`, so the REPL already reaches past `PlayView`
for inventory, equipment, xp and flags. A second driver written against this tree has no option but
to redefine the command set and reach into `GameState` — two paths into the runtime, drifting from
their first day.

This branch makes a driver a renderer. A command is defined once, below `ui`, in a table both
drivers dispatch from and neither extends; help is derived from that table instead of hand-written
beside it; and everything a driver displays is published by the engine, so no driver reads
`GameState`. It adds no capability and changes nothing a player can see. Its whole proof is that the
same commands do the same things through a surface a second driver can reach.

Proof:

- [c1] A command is defined in exactly one place. One table names every command, its argument shape
  and its handler; dispatch is a lookup in that table; no driver holds a command of its own, and no
  driver filters the table. Adding a command is editing the table and nothing else.
- [c2] Help is derived, not maintained. `HELP_LINES` is a hand-written second copy of the command
  set and is gone; what `/help` prints is computed from the table's entries. A command added to the
  table is documented by that edit alone. This is the one clause whose text a player sees change.
- [c3] A command result says what happened, never how it looks. The shared surface returns the
  resulting view and the messages the command produced; no bar glyph, no numbered choice list, no
  `[time: Ns]`, no `✓`/`⚠` and no other terminal vocabulary is produced below the driver. Each
  driver renders the same result its own way, which is the rule `first-class-modals` already sets
  for modals, applied to everything else a command emits.
- [c4] Everything a driver shows is published by the engine. Inventory, equipment, skill xp, stat
  values, flags and discovered locations reach a driver the way `location`, `said`, `choices` and
  `resources` already do. The guard acts where a driver *obtains* its session, not at each read: a
  driver cannot reach `GameState`, rather than merely being observed not to. `formatInventory` and
  `formatState` stop taking `session.state` because they can no longer be given it.
- [c5] The shared surface sits below `ui` and takes its effects as data. It imports nothing from
  `scripts`; the local-changes file, the content sources and the wall clock arrive as arguments
  rather than being reached for inside it, so its tests exercise the decision and not the world.
- [c6] The live clock is one implementation. Advancing simulated time from elapsed real time,
  deciding whether the in-flight action is still active, and reporting its progress happen in the
  shared surface; a driver supplies elapsed milliseconds and renders the answer. `liveTick` no
  longer lives above `ui`, where a second driver cannot call it.
- [c7] `layer-check` reads every source file under `src/` and `scripts/`, and a file belonging to no
  declared root fails the run naming it — the partition assertion `audit-status` already makes over
  system membership. This closes `testing-procedure-2026-07-30-m2`, whose ruling deferred it until
  the GUI rebuild, and it is what makes c5 and `gui-rebuild`'s import rule enforceable rather than
  merely intended: `src/main.tsx` is the second driver's entry point and no rule reads it today.
- [c8] Nothing else observable changes. Every `# test` in shipped content passes unchanged and
  byte-identical, no `# save` fixture is regenerated, and a scripted REPL session's transcript is
  the same before and after this branch apart from `/help`. A seam branch that needs a fixture
  rewritten has changed behaviour it claimed not to.

## Goal

One in-process API for playing the game, below `ui`, that a driver renders and cannot extend.

## Decisions

- **A seam branch, not a seam smuggled into the GUI.** `result-application-seam` recorded the
  reasoning and it applies harder here: whoever landed the restructure first would be making an
  architectural change under a feature's name, and the feature in this case adds an entire
  directory, so the seam would be reviewed as incidental diff inside a diff nobody can read whole.
- **What "identical" means, and why it has to be structural.** The requirement, from the author on
  2026-08-07, is that the two play methods cannot drift in capability or function and that the GUI
  cannot alter state directly. A checklist of commands both drivers implement is a thing that has to
  be kept in sync by hand, which CLAUDE.md forbids building. So identity is made structural: one
  definition site (c1), derived help (c2), no driver-side state access (c4). The behavioural half —
  one scripted session replayed through both drivers landing on byte-identical state — belongs to
  `gui-rebuild`, because that is where a second driver exists to compare against.
- **The surface is an in-process API, and nothing more than that.** It is a module both drivers link
  against in one bundle: no envelope, no serialization, no version field, no compatibility contract.
  There is no consumer outside this repository, and a boundary nothing crosses is machinery to
  maintain for free. It is also not a new API — `session.ts` is the one CLAUDE.md already designates,
  and this branch closes the two ways it leaks: the command set sits above it where a second driver
  cannot reach, and `GameState` passes through it.
- **Parsing a line is separable from dispatching a command.** c1's "argument shape" is the seam: the
  REPL turns a typed line into a command and its arguments, and a driver with typed arguments in
  hand dispatches without going near the parser. A GUI that assembled command strings to hand back
  to a parser would be stringly-typed at the one boundary this branch exists to make precise.
- **The collision window is chosen, not ignored.** `tasks where` reports five open specs writing
  `scripts/play-cli.ts` and six writing `src/runtime/session.ts`: the "plan concentrated in one
  file" report. This branch lands immediately after `first-class-modals`, the largest claimant on
  both files, and before the rest. Every one of them gets cheaper afterwards, because adding a
  command becomes a table entry rather than another branch in a 909-line function — which is the
  argument for paying the collision here rather than avoiding it.
- **The choice-id contract is not touched.** `action-labels-as-members` owns the rewrite of
  `use:<kind>.<objId>.<label>` and its own record says to do it with the GUI rebuild rather than
  churn it twice. Publishing more of the view does not require re-spelling a choice id, so this
  branch leaves the spelling exactly as it is.
- **`testing-procedure-2026-07-30-h1` is not fixed here.** `/test` running against the live session
  is a real HIGH in the file this branch restructures, and fixing it would be a behaviour change
  while this branch's entire proof is that behaviour did not change. It moves with the interpreter
  and stays open.
- **Terminal rendering stays in `scripts/play-cli.ts`.** Bars, glyphs, the numbered choice list and
  the readline loop are that driver's presentation, and the second driver writes its own. Moving
  them down would be exactly the presentation vocabulary crossing out of the engine that
  `first-class-modals` forbids.
- **Tests move with the code they drive.** `handleCommand`'s 619 lines of tests are the command
  surface's tests and follow it out of `scripts/`, per CLAUDE.md's rule that tests live in the
  folder of the layer they drive rather than the one their name suggests.

## Open questions

- Where the shared surface lives, and whether it is one module or two. `src/runtime/` is the obvious
  home and needs no new layer; whether the authoring commands (`/dsl`, `/local`) belong beside the
  play commands or in a sibling module is for whoever has read both.
- How a driver is stopped from reaching `GameState` — an opaque session handle, a narrowed exported
  type, or a check `layer-check` performs. c4 is the property; choosing the mechanism needs the
  region read, and the worker who reads it corrects this grant anyway.
- Whether the recorder (`/create-test`) is part of the shared surface or stays a REPL concern. It
  records commands, so it probably follows them, but nothing in `gui-rebuild` asks for it and a
  wrong guess here costs a move later.

## Audit passes

### Pass 1 — 2026-08-09

- base: `33c020be09a43da6765389df04c6d33eb6b0b13c`
- head: `43d7e7867fad3f053c5d3ef49b1a32dcb551e79e`
- proof 1: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer,
which is still open. scripts/play-cli.ts still dispatches by a chain of
`trimmed === '/x'` / `trimmed.startsWith('/x')` branches across handleCommand and
handleGameplayCommand, and there is no table anywhere below `ui`.
- proof 2: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
HELP_LINES is still the hand-written list at scripts/play-cli.ts:52 and /help still
prints it verbatim. Confirmed by the c8 transcript check: /help is byte-identical
across this branch, which is the same fact read from the other side.
- proof 3: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
The bar glyphs, the numbered choice list, `[time: Ns]`, the ✓/⚠ pair and the
progress bar all still live in scripts/play-cli.ts, which is correct for this
branch: the shared surface c3 speaks about does not exist yet.
- proof 4: unmet — The guard half holds and is re-runnable: `npx tsc --noEmit` passes, and
PlaySession no longer declares `state` — its GameState sits under a module-private
`const STATE = Symbol(...)` in src/runtime/session.ts, so `session.state` is a
compile error in every file but that one, and startSession takes no GameState to
hand back. Reverting only the type (re-adding `state: GameState`) is what a next
pass re-runs. formatInventory and formatState now take a PlayStatus.
The publication half is implemented but not proved. c4 names six kinds of data;
`npm run mutate` over
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass1-mutations.json
replaced four of them with empty and the whole suite stayed green:
c4-xp SURVIVED, c4-equipment SURVIVED, c4-discovered SURVIVED, c4-stats SURVIVED,
0 failed of 2121 each. Only inventory and flags are killed (m2 and m3 of the
worker's own run). A clause whose proof covers two of the six things it names by
name is not met, so this is unmet on evidence, not on behaviour — see the finding.
- proof 5: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
No module below `ui` holds the command set, so there is nothing yet for the
effects-as-data rule to apply to. This branch's own additions (adoptRegistry,
serializeSession, runSessionTest, sessionStatus) take everything as arguments and
reach for no file, clock or subprocess, so they do not stand in c5's way.
- proof 6: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
liveTick still lives at scripts/play-cli.ts, above `ui`. It did get smaller here —
cycleDuration is gone and the bar, pools and clock come from the PlayView `wait`
returns — so what c6 has left to move is the wait-and-decide, not the arithmetic.
- proof 7: unmet — Not attempted on this branch; owed by layer-check-reads-every-source-file.
scripts/layer-check.ts is untouched in this diff and still reports only on the
imports it finds, naming no file that belongs to no declared root.
- proof 8: met — Three re-runnable measurements, all against 33c020b (the merge base):
(1) A 33-command scripted REPL session — /help, /state, /inventory, /look, a
numbered choice, talk:, submit-modal:, craft:, use:, begin:, wait:, /assert,
/expect, /wait, /cancel, an unknown command, an out-of-range choice, /create-test
and /quit — piped into `npx tsx scripts/play-cli.ts --no-modportal` on this tree
and on a stashed HEAD: 304 lines, `diff` empty.
(2) liveTick's rendered lines over six action shapes (a continuous time: action, a
one-shot time: action through completion, a targeted fight with an encounter
readout, an untargeted rate: action, a contested action, and a low-ability action
that exercises the `hits:N completion:X` branch): identical on both trees, via
`npm run inspect`.
(3) The published `action` block (label, progress, attempts, targeted, completion)
printed against the raw activeAction reads it replaced, over five action shapes
and six ticks each: identical.
No file under content/ is in the diff, so no `# save` fixture was regenerated and
every shipped `# test` runs unchanged — integration.test.ts passes.
Mutation: c8-state-location (the /state location line reporting the title where it
reported the id) is KILLED by two named tests in scripts/play-cli.test.ts.
`npm run tasks -- merge-ready`: tsc, npm test (2121), layer-check, audit-status,
doctor and the byte check all pass.

### Pass 2 — 2026-08-09

- base: `33c020be09a43da6765389df04c6d33eb6b0b13c`
- head: `43d7e7867fad3f053c5d3ef49b1a32dcb551e79e`
- proof 1: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer, still open.
  Re-read the dispatcher rather than taking pass 1's word: scripts/play-cli.ts still decides by a
  chain of string tests, handleCommand testing trimmed === '/dsl' / startsWith('/dsl ') / '/local' /
  '/create-valid-test' / '/create-test' and then handing the rest to handleGameplayCommand, which
  tests '' , '/help', '/state', '/inventory'|'/inv', '/look', '/quit'|'/q', startsWith('/speed'),
  startsWith('/test'), then rewrites '/cancel' '/load' '/expect' '/assert' '/wait' into directive
  text before parseDirectiveLine. No table of commands exists anywhere below ui: grep for a
  Record or Map of handlers under src/ returns nothing. Re-runnable: read scripts/play-cli.ts
  lines 437-540 and look for a single table; there is none.
- proof 2: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
  HELP_LINES is still the hand-written 28-entry array at scripts/play-cli.ts:52-79, and
  handleGameplayCommand returns it verbatim for '/help'. Measured from the player's side rather
  than by reading: the scripted REPL transcript this pass ran on the merge base and on the branch
  head prints the same 28 help lines at lines 14-40 of both files, byte-identical. c2 is the one
  clause whose text a player is supposed to see change, and it did not.
- proof 3: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer, and
  correctly so - the shared surface c3 speaks about does not exist yet. Worth recording that the
  negative half held while the positive half was not built: the branch moved rendering inputs down
  as numbers, not as glyphs. PlayAction publishes progress as a 0-to-1 fraction and completion as
  a unit count; progressBar, MINIMAL_STAGES, fullBar, the numbered choice list, the check and
  warning glyphs and the [time: Ns] suffix all still live in scripts/play-cli.ts and nothing below
  ui produces terminal vocabulary. Re-runnable: grep the runtime for the bar characters and the
  bracketed time - src/runtime has none of them.
- proof 4: unmet — The guard half holds and is re-runnable; the publication half is half-built. Guard:
  a probe file added at src/runtime/zz-audit-probe.ts and then deleted made npx tsc --noEmit
  report exactly two errors, TS2339 "Property 'state' does not exist on type 'PlaySession'" for a
  read of session.state, and TS2353 for an object literal that tries to hand a PlaySession a state
  of its own. formatInventory and formatState now take a PlayStatus and there is no constructor
  that returns a GameState from a session. That is the re-runnable half.
  It is a type-level guard only, not the "cannot reach" c4 asks for: the third line of the same
  probe, a cast through Object.getOwnPropertySymbols, produced no tsc diagnostic at all, and
  running it under npm run inspect returned the live GameState (16 keys, symbol printed as
  "Symbol(game state)"); writing state.inventory.gem = 99 and state.time = 123456 through it came
  straight back out of view() as inventory {gem: 99} and time 123.456. Filed as a finding.
  Publication: an 11-entry mutation manifest was hand-built at
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass2-mutations.json and run.
  Emptying each of the six kinds c4 names: inventory KILLED (7 named tests), flags KILLED
  (1 named test), and equipment, xp, stats and discovered all SURVIVED the whole 2121-test suite,
  0 failed each. The control confirms the instrument rather than the code: player, which c4 does
  not name, is KILLED by 3 named tests. The same run kills adoptRegistry's prune-and-say and both
  publishAction fields the live line reads. So four of the six kinds the clause names by name have
  nothing watching them, reproduced independently of pass 1.
  Sharper than "unproved", and the reason a fix aimed only at the finding's text would be too
  small: equipment and xp are at least rendered, so the transcript check below does cover them
  behaviourally (three distinct Equipped: lines, byte-identical across trees). stats and
  discovered are read by nothing in the repository at all - not a test, not the driver, not
  src/main.tsx - so no transcript can ever reach them and only a test written against them will.
- proof 5: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
  No module below ui holds the command set, so the effects-as-data rule has nothing yet to apply
  to. Checked that this branch's own four additions do not stand in its way, by reading them
  rather than assuming: adoptRegistry, serializeSession, runSessionTest and sessionStatus each
  take everything they use as an argument and reach for no file, clock or subprocess.
  npm run layer-check passes, so nothing in src/runtime imports scripts.
- proof 6: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
  liveTick is still exported from scripts/play-cli.ts, above ui, where a second driver cannot
  call it. It did lose arithmetic - cycleDuration is gone and the bar, pools and clock now come
  from the PlayView that wait() returns - but note the direction of travel is not purely toward
  c6: liveTick's signature gained a previous: PlayView parameter, so the driver now has to carry
  the last view across ticks to name the action a tick finishes. Whatever eventually moves down
  has to take that threading with it, or drop it. Re-runnable: grep -n "export function liveTick"
  scripts/play-cli.ts.
- proof 7: unmet — Not attempted on this branch; owed by layer-check-reads-every-source-file.
  scripts/layer-check.ts is not in this diff and read cold it makes no partition assertion: it
  loops "for (const layer of LAYERS) for (const file of sourceFiles(ROOTS[layer]))" and reports
  only on the imports it finds, so a file belonging to no root is never visited and never named.
  ROOTS in scripts/lib/layers.ts is src/grammar, src/content, src/runtime, src/ui and scripts;
  src/main.tsx sits under none of them and src/ui does not exist yet, so the second driver's own
  entry point is read by no rule. Re-runnable: npm run layer-check reports "cross-file imports
  checked" and says nothing about files.
- proof 8: met — Three measurements of my own, all against the merge base 33c020b checked out into its
  own worktree, so both trees could be driven with the same input.
  (1) A 45-command scripted REPL session written for this pass and deliberately aimed at what
  pass 1 did not cover, saved at
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass2-transcript-input.txt: help,
  state, inventory, look, a numbered dialogue choice, a two-field modal answered field by field,
  craft, begin plus wait plus the published action block, ascend/descend, equip of two slots and
  an unequip (which is what puts the Equipped: line under test), dsl authoring, local list, local
  show, local clear (the adoptRegistry path), assert, create-valid-test (the serializeSession
  path), test, a failing expect, cancel with nothing in flight, an out-of-range choice, an unknown
  command and quit. Piped into npx tsx scripts/play-cli.ts --no-modportal with local= pointed at a
  temp file so neither tree was dirtied. 445 lines out of each; diff is empty. That covers the
  serialized save that create-valid-test prints, so serializeSession is byte-identical to the
  serializeSave call it replaced.
  (2) Read for equivalence where the code changed shape rather than value: cycleDuration's
  recipe branch was dropped when publishAction replaced it, and craftFirstUnit(id) is defined as
  actionFirstUnit('recipe', id, recipeActions.get(id).label) while armCraft sets exactly that
  ownerRef and actionLabel, so the two are the same number; showImplicitTarget's
  implicitTarget < toMilliUnits(1) became completion < 1 over fromMilliUnits, the same predicate;
  and the recorded wait: elapsed moved from ms subtraction to seconds subtraction, which is exact
  because msToSeconds is division with no rounding.
  (3) No file under content/ is in the diff, so no # save fixture was regenerated, and every
  shipped # test runs unchanged - src/runtime/integration.test.ts passes and npm test reports
  2121 of 2121 standalone.
  Mutation, aimed at the lines that carry the rendering this clause says did not change:
  c8-liveTick-label-from-previous KILLED by two named tests, c8-publishAction-progress KILLED,
  c8-publishAction-targeted KILLED, all re-run at their own files with the mutant still applied.
  Gate: npm run tasks -- merge-ready is green on tsc, layer-check, audit-status, doctor and the
  byte check. Its npm test leg went red on three of four runs and the two named failures are
  scripts/tasks/handoff.test.ts "beats git log -S on the edits it misses" and
  scripts/tasks/mergeReady.test.ts "stays fixed at the merge base's copy of the store", both
  "Test timed out in 5000ms", both real-git spawn-heavy Task-system tests that this diff does not
  touch, and both green when npm test is run on its own (2121 of 2121, twice, once under the same
  four concurrent gate commands merge-ready launches). Recorded as a recurrence of the existing
  flake record, not as a defect of this branch.

### Pass 3 — 2026-08-09

- base: `6d6815f04182e1c1ecdf25f1ffb534a1dd78d0ff`
- head: `08f01e5bf7dbb9b776aa4b54f1ad343d36aaa4e4`
- proof 1: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer, which is
  still open. Re-read the dispatcher cold rather than taking passes 1 and 2 on trust:
  scripts/play-cli.ts still decides by a chain of string tests, 18 of them by
  `grep -c "trimmed === '\|trimmed.startsWith('" scripts/play-cli.ts`, split across
  handleGameplayCommand (line 437) and handleCommand (line 545). No table exists below ui:
  `grep -rn "COMMANDS\|commands: *Record\|Record<string, *{[^}]*handler" src/` returns nothing.
  Re-runnable as those two greps.
- proof 2: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
  HELP_LINES is still the hand-written array at scripts/play-cli.ts:52 and handleGameplayCommand
  returns it verbatim at scripts/play-cli.ts:445. Re-runnable as
  `grep -n HELP_LINES scripts/play-cli.ts`, which prints exactly those two lines. c2 is the one
  clause a player is supposed to see change, and the scripted transcripts this pass ran on both
  trees print the same help block.
- proof 3: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer, and
  correctly so, because the shared surface c3 speaks about does not exist yet. The negative half
  holds and is re-runnable: `grep -rn "\[time: \|progressBar\|MINIMAL_STAGES" src/` is empty, and
  every piece of terminal vocabulary is in the driver — MINIMAL_STAGES at scripts/play-cli.ts:98,
  progressBar at :579, the check and warning glyphs at :508 and :509. What this branch moved down
  it moved as numbers: PlayAction publishes progress as a 0-to-1 fraction and completion as a unit
  count, and liveTick does the glyph work above them.
- proof 4: unmet — The publication half is now met and proved; the guard half is defeated, so the clause
  as worded fails. PUBLICATION: I hand-built an 11-entry manifest at
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass3-mutations.json aimed at the
  publication lines of sessionStatus rather than at any test, and ran it. All 11 KILLED, 0
  survived, each re-run at its own file with the mutant still applied: c4-xp, c4-equipment,
  c4-stats and c4-discovered — the four kinds pass 1 and pass 2 independently measured as
  SURVIVED against the whole suite — are each killed by a named test in the new
  "what the engine publishes" block of src/runtime/session.test.ts; c4-inventory by 4 tests,
  c4-flags by 2, control-player by 1, c4-action by 11 across scripts/play-cli.test.ts and
  src/runtime/session.test.ts. So all six kinds c4 names by name now have something watching them,
  reproduced independently of the implementer's own run. GUARD, the routes that are closed: on a
  session from startSession, Reflect.ownKeys is ['registry'], getOwnPropertySymbols is [], the
  prototype is Object.prototype, JSON.parse(JSON.stringify(session)) carries only registry, and
  the module exports no INTERNALS binding — pass 2's getOwnPropertySymbols cast now has nothing to
  find. Both halves of that seal are under test and both mutations killed
  (c4-handle-carries-no-state, c4-handle-refuses-a-forgery). A hostile Registry handed to
  adoptRegistry, proxied to record every argument any of its members receives, was never handed
  the live state. GUARD, the route that is open: c4 says a driver cannot reach GameState rather
  than merely being observed not to, and a driver holding nothing but a PlaySession still can. The
  registry the handle publishes is live and its maps are writable, so a driver can put a ParsedSave
  of its own into session.registry.saves and then call the exported applyDirective with
  {kind:'load'}; loadSave assigns the scalar save fields by reference
  (src/runtime/save.ts:237, `target[field] = diff[field]`), and player, activeAction, modals and
  instances are all scalar fields. Measured through npm run inspect on this head, scripts kept at
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass3-attack2.js and
  ...-attack3c.js: after the load, mutating the object the driver still holds sets
  sessionStatus(session).player.name to 'MUTATED-OUT-OF-BAND'; sets action.attempts to 4242 and
  action.completion to 999 without the engine running; and pushing a frame onto the array it
  handed in opens a character-creation modal and takes the choice list from 1 to 0. The same
  route writes arbitrary inventory, flags and time, and serializeSession(session) reads the whole
  state back out as a save string. This is not an exotic hostile shape: session.test.ts's own
  primed() helper (src/runtime/session.test.ts:13) and play-cli's buildCreateTest
  (scripts/play-cli.ts:307) both write to registry.saves, because there is no other way for a
  driver to load a save. Two smaller notes for the next pass rather than findings. First, runTest
  is exported taking a raw GameState and mints a PlaySession over it through the same sessionOver,
  so startSession is not the only door the handle comes out of — that leaks nothing, because the
  caller already owns the state, but it means "the guard acts where a driver obtains its session"
  has a second entrance. Second, the exhaustiveness test's closing loop asserts only that each
  published field's key is present in view(); the classification Record above it is the part that
  does the work, and the three value tests are the part that proves the values.
- proof 5: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer. No
  module below ui holds the command set, so the effects-as-data rule has nothing yet to apply to.
  Checked that this branch's own additions do not stand in its way by reading them: adoptRegistry,
  serializeSession, sessionStatus, runSessionTest and publishAction each take everything they use
  as an argument and reach for no file, clock or subprocess. npm run layer-check passes inside
  merge-ready, so nothing in src/runtime imports scripts.
- proof 6: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
  liveTick is still exported from scripts/play-cli.ts:603, above ui, where a second driver cannot
  call it. Re-runnable as `grep -rn "export function liveTick" scripts/ src/`, which names that
  one line. The direction of travel is still not purely toward c6 and this branch moved it
  further: on top of the previous: PlayView parameter pass 2 recorded, LiveTickResult now also
  carries the view the tick produced and runLiveAction threads it forward in a `latest` local
  (scripts/play-cli.ts:679-686). Whatever eventually moves down has to take that threading with it
  or drop it. The arithmetic did leave the driver — cycleDuration is gone and the bar, pools and
  clock come from the PlayView that wait() returns — so what c6 has left to move is the
  wait-and-decide.
- proof 7: unmet — Not attempted on this branch; owed by layer-check-reads-every-source-file.
  scripts/layer-check.ts is not in this diff and read cold makes no partition assertion: it loops
  `for (const layer of LAYERS) for (const file of sourceFiles(ROOTS[layer]))` at
  scripts/layer-check.ts:14-16 and reports only on the imports it finds, so a file belonging to no
  root is never visited and never named. ROOTS at scripts/lib/layers.ts:9 is src/grammar,
  src/content, src/runtime, src/ui and scripts; `ls src/ui` does not exist and src/main.tsx does,
  under none of them, so the second driver's own entry point is read by no rule.
- proof 8: unmet — Pass 1's and pass 2's measurements all reproduce and I am not disputing any of them:
  no file under content/ is in the diff, so no `# save` fixture was regenerated, every shipped
  `# test` runs unchanged, and merge-ready's npm test leg is green at 2121. What neither pass
  covered is a state the engine cannot produce but a `# save` can, and this branch made that state
  fatal. publishAction reads active.cadences[PLAYER].progress unguarded at
  src/runtime/session.ts:315, and sessionStatus calls it on every view(). On the merge base
  nothing on the view path touched cadences for an untargeted action: encounterView returns null
  before reaching them, and cycleDuration only ran inside liveTick. Reproduction, both trees driven
  with the same bytes: content at
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass3-content2.dsl, whose one
  `# save` body is {"version":7,"activeAction":{"ownerRef":"entity.rock","actionLabel":"mine",
  "cadences":{},"implicitTarget":1000}}, and the six-line input at
  ...-pass3-transcript-input.txt (/look, /load midaction, /look, /state, /inventory, /quit) piped
  into `npx tsx scripts/play-cli.ts <that dsl> --no-modportal local=<a temp file>`. The merge base
  6d6815f0, checked out into its own worktree, loads it and prints the whole transcript through
  /quit. This head dies on the /look after the load with an uncaught TypeError, "Cannot read
  properties of undefined (reading 'progress')", at publishAction. That save is not input the
  engine already rejects: checkSave accepts it (activeAction is validated as isObject only) and
  pruneStateForRegistry's activeActionProblem accepts it, which is why the base plays it. So a
  scripted REPL session's transcript is not the same before and after this branch, which is what
  c8 says it is. One line fixes it and the finding says so. Performance was checked as well and is
  not a regression: 2000 view() calls over content/tutorial-island.dsl measured 25ms on this head
  against 21ms on the merge base, through npm run inspect on both trees.

### Pass 4 — 2026-08-09

- base: `6d6815f04182e1c1ecdf25f1ffb534a1dd78d0ff`
- head: `8573d95c0106461b8fa7da87e60fdb295579cc6a`
- proof 1: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer, still open.
  Re-checked cold rather than taking passes 1-3 on trust: scripts/play-cli.ts still dispatches by a
  chain of string tests, 18 of them by
  `grep -c "trimmed === '\|trimmed.startsWith('" scripts/play-cli.ts`, split across
  handleGameplayCommand and handleCommand. No table exists below ui:
  `grep -rn "COMMANDS\|commands: *Record" src/` returns nothing. Re-runnable as those two greps.
  Nothing in the pass-3-to-head delta (one commit, two source lines in save.ts and session.ts)
  touches this.
- proof 2: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
  `grep -n HELP_LINES scripts/play-cli.ts` prints exactly two lines: the hand-written array at :52
  and the verbatim return at :445. c2 is the one clause a player is supposed to see change and no
  player sees anything change.
- proof 3: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer, and
  correctly so, because the shared surface c3 speaks about does not exist yet. The negative half
  still holds: `grep -rn "\[time: \|progressBar\|MINIMAL_STAGES" src/` is empty and every piece of
  terminal vocabulary is in the driver. What this branch moved down it moved as numbers.
- proof 4: met — Both halves now hold and both are re-runnable. This is the first pass to grade c4 met
  and the change since pass 3 is the aliasing route pass 3 opened being closed.
  PUBLICATION, re-measured rather than inherited: manifest at
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass4-mutations.json. c4-stats and
  c4-discovered are the two kinds pass 1 and pass 2 independently measured as SURVIVED against the
  whole suite; on this head both are KILLED by a named test in session.test.ts's "what the engine
  publishes" block, each re-run at its own file with the mutant still applied. c4-handle-carries-no
  -state (putting `state` back on the object sessionOver returns) is KILLED by "carries no route to
  the state it plays, by enumeration or by key". The third sentence of the clause is met by reading:
  formatInventory and formatState at scripts/play-cli.ts:176 and :184 both take a PlayStatus.
  GUARD, attacked rather than re-read. I could not obtain a reference into the live GameState by any
  route I could construct from a session startSession hands out. Script at
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass4-attack-alias.js replays pass
  3's two reproductions and adds four more: activeAction by reference, the modals array by
  reference, the player object by reference, a nested activeBuffs value inside a RECORD field
  (which the spread would have aliased even with the scalars copied), the instance table, and
  whether playing on rewrites the fixture. All six report no alias and the loaded save reads back
  exactly as authored. A second script,
  ...-pass4-attack-identity.js, compares object identity across two sessionStatus calls for every
  object-valued published field: all twelve differ per call, and mutating the published inventory,
  flags, xp, player, equipment, stats, discovered and choices writes through to nothing.
  The copy is taken where the value is assembled (save.ts:231, one structuredClone over the whole
  diff before either the RECORD spread or the SCALAR assignment reads it), not per field, which is
  what makes the six attacks above one measurement rather than six. structuredClone is the right
  primitive and not merely a working one: loadSave:240 distinguishes `field in diff` from
  undefined, and structuredClone preserves an own key whose value is undefined where the
  JSON round-trip in src/content/modportal.ts:98 would have dropped it (verified through
  npm run inspect).
  The boundary this grade does NOT claim, recorded so the next pass does not have to rediscover it:
  a driver can still write arbitrary state into the session by putting a ParsedSave in
  session.registry.saves and calling applyDirective with {kind:'load'}, and read all of it back
  through serializeSession. That is the engine's own save channel rather than a reference into
  GameState, so it does not fail this clause's words, but it is what
  in-process-module-api-pass3-the-sealed-surface-has-no-way-to is about and it stays open. New fact
  for that record: `registry.saves` is a map on shared content, so a driver loading a save mutates
  the registry in place, which is exactly the act adoptRegistry exists to mediate, and two sessions
  over one registry share the slot namespace.
- proof 5: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer. No
  module below ui holds the command set, so the effects-as-data rule has nothing to apply to yet.
  Read this branch's own additions rather than assuming: adoptRegistry, serializeSession,
  sessionStatus, runSessionTest and publishAction each take everything they use as an argument and
  reach for no file, clock or subprocess. The one import the fix commit added, newCadence from
  ./encounter, is a pure constructor. layer-check passes inside merge-ready.
- proof 6: unmet — Not attempted on this branch; owed by the-command-set-lives-below-the-ui-layer.
  `grep -rn "export function liveTick" scripts/ src/` names one line, scripts/play-cli.ts:603,
  above ui where a second driver cannot call it. Unchanged since pass 3, which also recorded that
  the direction of travel is not purely toward c6: liveTick's signature carries `previous: PlayView`
  and LiveTickResult carries the view the tick produced, so whatever moves down takes that threading
  with it or drops it.
- proof 7: unmet — Not attempted on this branch; owed by layer-check-reads-every-source-file.
  `git diff --name-only 33c020b..8573d95 -- scripts/layer-check.ts scripts/lib/layers.ts` is empty
  across the whole branch, so the partition assertion c7 asks for was never written. src/main.tsx
  still belongs to no declared root and is read by no rule.
- proof 8: met — Pass 3's divergence is closed, re-measured by me, and nothing in the two-line delta
  produces a new one.
  THE DIVERGENCE PASS 3 FOUND: its exact bytes, unchanged. Content
  C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass3-content2.dsl and the six-line
  input ...-pass3-transcript-input.txt piped into
  `npx tsx scripts/play-cli.ts <that dsl> --no-modportal local=<a temp file>`. Pass 3 recorded this
  head dying on the /look after the load with an uncaught TypeError at publishAction. On this head
  it prints the whole transcript through /quit and exits 0. Mutation c8-cadence-guard (removing the
  `?? newCadence()` fallback) is KILLED by the named test "publishes an action a save left without
  a player clock instead of dying on the next look", re-run at its own file with the mutant still
  applied.
  THE REST OF THE CLAUSE: `git diff --name-only 33c020b..8573d95 -- content/` is empty over the
  whole branch, so no `# save` fixture was regenerated and every shipped `# test` runs unchanged;
  merge-ready's npm test leg is green on the first run this time.
  WHAT DID CHANGE BEFORE AND AFTER, stated rather than left silent, because c8's words are absolute.
  The copy at save.ts:231 stops play rewriting the `# save` it was loaded from, and the engine does
  mutate activeAction in place, so that is observable: load a save carrying an activeAction, wait
  3s, and the published progress reads 0.75 while `registry.saves.get(id).diff.activeAction` still
  reads progress 0 (npm run inspect, this head). On the merge base the fixture would have moved with
  the state. A REPL script that loads one save twice around a wait therefore prints different lines
  on the two trees. I am grading this met anyway and naming it rather than hiding it: the behaviour
  it changes is a defect pass 3 filed and instructed be fixed on this branch, the fix is in the
  branch's diff and audited here, and no shipped `# test` or fixture observes it. A future pass
  reading "the transcripts are identical" should read this paragraph as the exception.
  NOT MEASURED, and why: passes 1 and 2 each ran a full base-vs-head REPL transcript diff and found
  it empty, and pass 3 did not dispute them. I did not run a fourth, because the only route to a
  merge-base tree in this repository is a second worktree and the previous auditor's attempt at one
  destroyed the shared node_modules for every worktree. Filed as a recurrence rather than worked
  around. The delta I would have been measuring is one commit and two source lines, both of which
  are covered above by narrower measurements.

### Pass 5 — 2026-08-10

- base: `e90fd17d1f0966be7af6ddcecac83de2021c2a54`
- head: `640445db6289d7d3c855a3075093df2360259d15`
- proof 1: met — The table exists and is the only definition. COMMANDS at src/runtime/command.ts:472 carries 19 entries,
each naming name, aliases, match, arg (an ArgKind), argHint, summary, parse and run, and the three formic spellings
are entries in it rather than branches around it: '<N>' (match choice), '<enter>' (match blank) and '<directive>'
(match directive). Dispatch is a lookup: BY_TOKEN at :660 for the slash forms and byMatch at :664 for the other
three; parseLine at :704 does nothing else. Mutation, aimed at those two lines rather than at any test:
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass5-mutations.json. c1-token-split (dispatch stops
splitting the leading token) KILLED by 28 named tests, re-run at both files with the mutant still applied;
c1-alias-lookup (the table's aliases stop reaching BY_TOKEN) KILLED by 4; c1-modal-number-precedence KILLED by 2.
No driver holds a command: read scripts/play-cli.ts whole, the only command-shaped strings in it are the three
STARTUP_LINES argv notes and the argv flags parseCliArgs reads. No driver filters the table:
scripts/play-cli.test.ts pins the rendered help at exactly 1 + COMMANDS.length + startup lines.
"Adding a command is editing the table and nothing else" is proved rather than read. I added one entry to COMMANDS
(name '/zzprobe', alias '/zzp', arg 'id', parse requireId, run said(...)) and changed no other file, then piped
/help, /zzprobe hello, /zzp world and a bare /zzprobe into the unmodified scripts/play-cli.ts: it printed
"  /zzprobe, /zzp <x> audit probe added by editing the table alone" in help, answered "zzprobe saw hello" and
"zzprobe saw world" through the alias, and refused the missing id with "Error: /zzprobe requires an id". Reverted;
git diff over src/runtime/command.ts is empty. Re-runnable by repeating that edit.
Recorded and not counted against this grade: the '<N>' entry has a second handler the table does not name, because
in live mode the driver calls beginLive rather than the entry's own run. Filed as a finding.
- proof 2: met — HELP_LINES is gone: `grep -rn "HELP_LINES" src/ scripts/` returns nothing, where pass 4 found it at
scripts/play-cli.ts:52 and :445. /help is the table read out — helpEntries at src/runtime/command.ts:676 is
COMMANDS.map, the '/help' entry's run returns those entries as data, and scripts/play-cli.ts:143 formatHelp is the
only thing that turns an entry into a line. Mutation: c2-help-summaries (helpEntries stops reading spec.summary)
KILLED by 2 named tests; c2-help-drops-formic (helpEntries filters to match === 'name', dropping <N>, <enter> and
<directive> — the driver filtering the table by another name) KILLED by 3, both re-run at their own files with the
mutant still applied. Measured from the player's side too: my own scripted session run on the merge-base driver and
on this head prints a different help block, which is what this clause says a player should see change, and the new
block lists every one of the 19 entries.
The one thing /help prints that is not a table entry: the driver appends three STARTUP_LINES describing argv
(<a.dsl,b.dsl>, local=, modportal=). I judged that against the clause rather than accepting the implementer's
argument for it. They are not commands, no command is documented there, a second driver has no argv and prints
none of them, and scripts/play-cli.test.ts pins that the driver adds exactly those and nothing else. The clause's
property — a command added to the table is documented by that edit alone — holds, and the /zzprobe probe under c1
demonstrates it end to end.
- proof 3: met — Nothing below the driver produces terminal vocabulary. `grep -rn "\[time: |progressBar|MINIMAL_STAGES|
█|░|▁|✓|⚠" src/` matches exactly one line in the whole tree, src/runtime/command.test.ts:184, which is the test's
own list of the glyphs it forbids. CommandOutput at src/runtime/command.ts:38 carries structure, not rendering: a
message with a tone of plain|ok|warn|error, the PlayView itself, a PlayStatus, PlayChoice[], CommandHelp[], source
lines and authored DSL blocks. LiveProgress at :758 carries label, active, time, progress, pools, implicit and the
view — every number, no line. The whole terminal vocabulary is in the driver: TONE_PREFIX at scripts/play-cli.ts:139
turns tone into ✓/⚠/Error:, MINIMAL_STAGES at :47, fullBar at :58, formatChoices' "  N) " at :38, progressBar at
:182 and "[time: Ns]" at :116 and :189.
Mutation, aimed at the one line where the engine could have kept a glyph: c3-glyph-below-the-driver (the engine
emits the ✓/⚠ the driver already adds) KILLED by 3 named tests; c3-tone-collapsed (both verdicts become tone plain,
so the distinction stops crossing the boundary as data) KILLED by 3. Both re-run at their own files with the mutant
still applied.
- proof 4: met — Not this branch's work, and I say so rather than inheriting the grade silently: c4 was met on the
earlier branch at 8573d95 and `git diff --name-only e90fd17..640445d -- src/runtime/session.ts src/runtime/save.ts
src/runtime/encounter.ts` is empty, so every attack pass 4 ran is being asked of bytes this diff does not change.
What I checked on this head rather than assuming: formatInventory (scripts/play-cli.ts:120) and formatState (:128)
each take a PlayStatus and nothing else; the driver's only other reads of the session are through view(),
sessionStatus(), serializeSession() and startSession(); `npx tsc --noEmit` passes, so no file names session.state.
The new module below ui does not open a route either — src/runtime/command.ts reaches state only through session.ts's
published functions. The one route pass 4 named as open and not claimed by this grade, writing a ParsedSave into
session.registry.saves and loading it, is still open and still used by buildCreateTest at command.ts:410; that is
in-process-module-api-pass3-the-sealed-surface-has-no-way-to and it is unchanged here.
- proof 5: met — The surface sits below ui and reaches for nothing. src/runtime/command.ts imports only ../grammar/parser,
../content/{registry,universe,localChanges,test,typed,saveSection} and ./{runtime,modals,session} — nothing from
scripts. `npm run layer-check` passes (876 cross-file imports, 5 layers, every import downward). Stronger than the
clause asks and re-runnable in one command: `grep -rn "from 'node:" src/` returns nothing at all, so no file under
src reads a file, a clock or a subprocess.
Each effect arrives as an argument. The local-changes file: AuthoringContext (command.ts:62) carries localSource and
an optional writeLocalChanges callback, and the driver is the only thing that touches the disk
(writeLocalChanges at scripts/play-cli.ts:353). The content sources: baseSources on the same context. The wall clock:
LiveRun.tick takes elapsedMs, and the only Date.now() in the repository's play path is scripts/play-cli.ts:221 inside
runLiveAction. The tests exercise the decision — the authoring block at src/runtime/command.test.ts:820 hands a fake
writer that pushes into an array, and asserts /dsl still loads and prunes when no writer is supplied at all.
Mutation: c5-clock-argument-ignored (the speed dial the driver hands in stops reaching the tick) KILLED by 3 named
tests, re-run at its own file with the mutant still applied.
- proof 6: met — liveTick no longer lives above ui, and nothing else does either: `grep -rn "liveTick" src/ scripts/`
returns nothing, where pass 4 found it at scripts/play-cli.ts:603. The clock is beginLive (src/runtime/command.ts:809),
LiveRun.tick and LiveRun.end (:828-846), and tickOnce (:786) is where elapsed real time becomes simulated time,
where the in-flight action is judged still active, and where progress is reported. The driver supplies the
milliseconds and renders the answer: scripts/play-cli.ts:256-263 measures the interval and calls formatLive.
Behavioural parity measured rather than argued, and independently of the implementer's own run. I put the merge
base's scripts/play-cli.ts back into the tree beside the unchanged src/ (this diff adds no file under src except
command.ts, so the base driver is exact) and drove both clocks in one process through npm run inspect over eight
action shapes: an instant action, a repeating action run to its first output, three cancellations at different tick
counts (repeating, one-shot, untargeted-countdown), a fight run to the end, a fight cancelled at 8x speed, and a run
of zero-millisecond ticks. For each I compared the rendered live lines, the recorder history and the final sim-time.
All eight IDENTICAL. Script kept at
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass5-live.js.
Mutation: c6-active-decision (the tick that finishes an action keeps reporting active) KILLED by 3 named tests, and
c5-clock-argument-ignored KILLED by 3, both re-run at their own files with the mutant still applied.
The two lines of the clock that nothing watches, filed as findings rather than left in this verdict: the
!action.targeted guard on LiveProgress.implicit (:802) and the elapsed subtraction in end() (:841) each SURVIVED the
whole 2241-test suite. The clause's own words — one implementation, below ui, driver supplies ms and renders — hold
and are proved; those two are proof gaps inside it.
- proof 7: unmet — Not this branch's work; owed by layer-check-reads-every-source-file, still open. Checked cold rather
than inherited from pass 4: `git diff --name-only e90fd17..640445d -- scripts/layer-check.ts scripts/lib/layers.ts`
is empty, `npm run layer-check` prints "876 cross-file imports checked across 5 layers" and "Every import points
downward" and names no file, and ROOTS at scripts/lib/layers.ts:9 is still src/grammar, src/content, src/runtime,
src/ui and scripts. `ls src/ui` does not exist and src/main.tsx does, under none of those roots, so the second
driver's own entry point is read by no rule. The partition assertion the clause asks for was never written.
- proof 8: unmet — The transcript half fails, on ten lines and beyond /help. I built the merge-base side rather than
trusting before.txt: `git show e90fd17:scripts/play-cli.ts` placed back in the tree as a second entry point beside
the unchanged src/ (exact, because this diff adds no file under src except command.ts and changes none), then drove
both with the same 30 bytes-for-bytes input. Fixtures and both transcripts kept at
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass5-transcript-input.txt,
...-pass5-base.out and ...-pass5-head.out; the delta is ...-pass5-delta.txt.
Loosened, and undisclosed: /look junk, /state junk, /inventory junk, /inv extra words, /cancel junk and /quit junk
were "Error: unknown command: ..." on the merge base and now perform the command with the argument discarded. The
worst of those is /quit junk, which now ends the session where the base refused the line. Cause: the table declares
arg: 'none' and parse: nothing (src/runtime/command.ts:187) throws the rest of the line away instead of refusing it,
so the declared argument shape is not the thing that decides. Reproduced below the CLI as well, through
npm run inspect on runLine directly. Filed as a finding.
Tightened, and disclosed by the implementer as deliberate: /speed2, /testfoo, /loadaux2.zero, /expectaux2.zero and
/create-testabc acted on the base (the base prefix-matched) and are "unknown command" now. I am not disputing that
half; the branch's own event note names it and the argument for it is sound. It is still a transcript divergence,
and c8's words are absolute.
The rest of the clause holds. `git diff --name-only e90fd17..640445d -- content/` is empty, so no # save fixture was
regenerated and every shipped # test runs unchanged; merge-ready's npm test leg is green at 2241 on the first run.
The live half is identical over the eight shapes recorded under c6, including the recorder history a live run
produces. One line in `nothing` and one in directiveFrom('/cancel', ...) close the loosened half; nothing about the
seam needs redoing.

### Pass 6 — 2026-08-10

- base: `e90fd17d1f0966be7af6ddcecac83de2021c2a54`
- head: `a3bc22c945255478d1fdacad4d651d868b6aa161`
- proof 1: met — The table is the only definition and dispatch is a lookup in it. COMMANDS at src/runtime/command.ts:487
carries 19 entries; BY_TOKEN (:666) is built from name+aliases of the match==='name' entries and byMatch (:670) resolves
the three formic spellings; parseLine (:710) does nothing else. The driver holds no command path at all now: grepping
scripts/ for isChoiceLine, beginLive, COMMANDS, findCommand, parseLine and runCommand names play-cli.test.ts and the
unrelated taskStore/tasks files and nothing in scripts/play-cli.ts, whose loop is runLine, print, drive-if-live
(scripts/play-cli.ts:427-429). Mutation aimed at the dispatch rule rather than at any test, manifest at
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass6-mutations.json:
c1-prefix-dispatch-beside-the-table (putting a second rule beside the lookup, the merge base's trimmed.startsWith chain
as a fallback) is KILLED by "takes a command to be a whole token, so no name can shadow a longer one", re-run at its own
file with the mutant still applied. c1-arghint-default-is-not-empty (the define() default changing from '' to '<x>', one
edit that reaches every entry) is KILLED by 2 named tests. Recorded and NOT counted against this grade, because the
behaviour is right today: the field the clause calls "its argument shape" (arg) decides nothing, because acceptance is
keyed on argHint. Filed as a finding.
- proof 2: met — Help is the table read out. helpEntries at src/runtime/command.ts:682 is COMMANDS.map and formatHelp
(scripts/play-cli.ts:141) is the only thing that turns an entry into a line; grep -rn "HELP_LINES" src/ scripts/ returns
nothing. Measured from the player's side against the merge base rather than by reading: I put git show
e90fd17:scripts/play-cli.ts back into the tree beside the unchanged src/ (exact, because this diff touches only
src/runtime/command.ts and command.test.ts under src/) and ran the same 54-line input through both. Transcripts at
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass6-base.out and ...-pass6-head.out: the help block is
the one thing a player sees change, and the new block lists all 19 entries, including <enter> and <directive>, which the
base's hand-written list documented inconsistently (<directive> was there, <enter> was not, and submit-modal: had a line
of its own that is now the <directive> summary). Mutation aimed at the entry field pass 5 did not break:
c2-help-drops-aliases (helpEntries stops reading spec.aliases, so /inv and /q go undocumented) is KILLED by 3 named
tests in src/runtime/command.test.ts, re-run at their own files with the mutant still applied.
- proof 3: met — Nothing below the driver produces terminal vocabulary. CommandOutput (src/runtime/command.ts:38) and
LiveProgress (:765) carry structure and numbers; TONE_PREFIX (scripts/play-cli.ts:137), MINIMAL_STAGES (:45), fullBar
(:56), formatChoices' two-space N-paren (:41), progressBar (:180) and the bracketed time (:114, :187) are all in the
driver. Mutation aimed at the other end of the tone channel than pass 5 took: c3-engine-error-loses-its-tone (refused()
returning tone 'plain' instead of 'error', so a RuntimeError stops crossing the boundary as data and the driver prints
no "Error: " prefix) is KILLED by "/test <id> reports PASSED or FAILED and shows the world the replay left", re-run at
its own file with the mutant still applied. The rendering identity is measured rather than argued: two further scripted
sessions, an authoring/modal/action session and a modal-answered session driving the shipped # tests and # saves, are
byte-identical between the merge-base driver and this one. Inputs at
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass6-transcript-input2.txt and ...-input3.txt.
- proof 4: met — Not this branch's work, and I say so rather than inheriting it: git diff --name-only e90fd17..HEAD -- src/
names only src/runtime/command.ts and src/runtime/command.test.ts, so every attack pass 4 ran is being asked of bytes
this diff does not change. Checked on this head rather than assumed: formatInventory (scripts/play-cli.ts:118) and
formatState (:126) each take a PlayStatus and nothing else; the driver's only reads of the session are view(),
serializeSession() and startSession(); npx tsc --noEmit passes inside merge-ready, so no file names session.state; and
the new module below ui opens no route, because src/runtime/command.ts reaches state only through session.ts's published
functions. The one route pass 4 named as open and did not claim is still open and still used by buildCreateTest
(command.ts:425-427), writing a ParsedSave into session.registry.saves; that is
in-process-module-api-pass3-the-sealed-surface-has-no-way-to, unchanged here.
- proof 5: met — src/runtime/command.ts imports only ../grammar/parser, ../content/registry, universe, localChanges, test,
typed and saveSection, and ./runtime, modals and session: nothing from scripts. npm run layer-check passes at 876
cross-file imports across 5 layers, every import downward. Each effect arrives as an argument: AuthoringContext
(command.ts:64) carries baseSources, localSource and an optional writeLocalChanges callback, and the only disk write is
scripts/play-cli.ts:351; the clock arrives as LiveRun.tick(elapsedMs) and the only Date.now() on the play path is
scripts/play-cli.ts:219. Mutation aimed at the content-sources argument rather than at the clock, which is where pass 5
aimed: c5-content-sources-not-taken-as-an-argument (commitLocalChanges loading only the local source instead of
[...authoring.baseSources, localSource], so the surface authors against a universe of its own rather than the one handed
in) is KILLED by 6 named tests in the "local DSL authoring takes its file as an argument" block, re-run at their own
files with the mutant still applied.
- proof 6: met — grep -rn "liveTick" src/ scripts/ returns nothing; the clock is driveChoice (src/runtime/command.ts:825),
tickOnce (:791) and LiveRun.tick/end (:840-857), and the driver supplies the milliseconds and renders the answer
(scripts/play-cli.ts:254-261). Behavioural parity re-measured independently of pass 5 and of the implementer, and
through the route the triage rewrote: the script at
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass6-live.js drives the merge base's own liveTick and
main-loop logic (its play-cli restored into the tree) against this head's <N>-entry plus CommandResult.live route, in
one process, over nine action shapes: an instant choice, a relocating instant choice, a continuous action run 6 ticks,
the same cancelled after 3, the same at 8x, a run armed after 10 simulated seconds were already on the clock, a targeted
fight run 30 ticks, that fight cancelled after 4, and a one-shot 4s pick-lock run to completion. For each I compared the
rendered live lines, the end-of-run output, the recorder history, the final sim-time and the whole final PlayView. All
nine IDENTICAL. Mutations: c6-elapsed-measured-from-zero (final.time - started losing its subtraction, which is pass 5's
finding) is KILLED by "measures the wait it records from where the run began, not from the clock";
c6-implicit-countdown-ignores-the-target (dropping the !action.targeted guard, pass 5's other finding) is KILLED by
"publishes no completion countdown for a run whittling a named pool down"; both re-run at their own files with the
mutant still applied. Both pass-5 proof gaps are genuinely closed. One survivor,
c6-tick-labels-from-the-view-that-ended-it, is an equivalent mutant and not a proof gap: tickOnce assigns ctx.view = next
after reading the label and driveChoice threads latest from the same value, so previous and ctx.view are the same object
at every call. That redundancy is filed as a low finding rather than counted against this grade.
- proof 7: unmet — Not this branch's work; owed by layer-check-reads-every-source-file, still open. Checked cold rather than
inherited: git diff --name-only e90fd17..HEAD -- scripts/layer-check.ts scripts/lib/layers.ts is empty, npm run
layer-check prints "876 cross-file imports checked across 5 layers" and "Every import points downward" and names no
file, and ROOTS at scripts/lib/layers.ts:9 is still src/grammar, src/content, src/runtime, src/ui and scripts. ls src/
is content, grammar, index.css, main.tsx, runtime, vite-env.d.ts: src/ui does not exist, and main.tsx, index.css and
vite-env.d.ts belong to no declared root, so the second driver's own entry point is read by no rule. The partition
assertion the clause asks for was never written.
- proof 8: deferred — Checked, it fails as literally worded, and the goal holds without it, so deferred rather than unmet, with
the residual named so that nobody tries to close it by re-encoding the merge base. WHAT HOLDS: git diff --name-only
e90fd17..HEAD -- content/ is empty, so no # save fixture was regenerated and every shipped # test runs unchanged;
merge-ready's npm test leg is green at 2247 on the first run. WHAT I RE-MEASURED, with the merge base's play-cli
restored into the tree beside the unchanged src/ and driven with the same bytes as this head. Session A, 54 lines aimed
at argument shapes: input at
C:\Users\yonat\AppData\Local\Temp\audit-in-process-module-api-pass6-transcript-input.txt, outputs ...-pass6-base.out and
...-pass6-head.out. Session B, authoring: /dsl staging and replacing, /local list, show, delete and clear, a modal, an
action, /create-valid-test and /create-test; transcript AND the written local-changes file byte-identical. Session C:
the character-creation modal answered by free text and then by number, /load miki-route-start, /test miki-route-full,
/expect miki-route-end, /assert, /test dresser-trinket; byte-identical. Live: nine action shapes, identical, see c6.
PASS 5'S LOOSENING IS GENUINELY CLOSED, and verified against the base rather than against the fix's own test: /look junk,
/state junk, /inventory junk, /inv junk, /quit junk, /cancel junk, /help junk and /q junk are all "Error: unknown
command: ..." on both trees now, and /quit junk ends nothing. Mutation c8-argument-thrown-away-again, removing the whole
guard at command.ts:722, is KILLED by "gives a command no argument it does not declare, over every entry that declares
none"; c8-create-test-without-a-start-save is KILLED by "says so rather than throwing when the session began without a
start save". WHAT STILL DIVERGES, and why I accept it: every run-on spelling of the eight commands the merge base
matched by bare prefix. My session found seven, not the three the branch's event note discloses: /speedxyz, /testfoo,
/loadfoo, /expectfoo, /assertfoo, /create-testfoo and /create-valid-testfoo. The note's "each an error on both trees" is
false for one of them: on the merge base /create-testfoo CREATED a test named 'foo' and wrote a # save foo-start into
the registry, and /assertfoo ran a real assertion. A typo performing a state-writing command is worse than the uniform
"unknown command" this branch gives it; the base's rule was per-command and inconsistent (=== for /cancel and the six
argument-free entries, startsWith-with-a-space for /dsl and /local, bare startsWith for the other six); and reproducing
it would mean building the hand-maintained second copy that c1 exists to delete. I accept the tightening on its merits
rather than on the implementer's say-so. The enumeration in the event note is the part that is wrong, and this record is
where that correction belongs. Plus /help, which the clause already excepts.
