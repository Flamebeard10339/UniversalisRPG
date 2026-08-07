# a-driver-renders-the-play-surface-and-cannot-extend-it

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

One play surface, reachable from below `ui`, that a driver can render and cannot extend.

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
