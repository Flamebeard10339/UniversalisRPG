# How to use
Please move finished tasks to `completed-tasks.md` with a reference to the commit that solved the issue when they are complete. 
Do not remove tasks from this document until the user confirms the task is complete.
Only work on one backlog task at a time. 
Check `scratch.md` for open architectural notes touching an area before starting adjacent work there

# Tasks

## Audit findings — DSL modules, full deliverable (2026-07-29)
Evidence: `docs/audits/dsl-modules-2026-07-29-reconciled.md`. Fourteen of sixteen findings closed
2026-07-29; see `completed-tasks.md` for the commit per finding. What is left:

- **M6 approved-mod re-identification is a global text substitution.** BLOCKED — design question.
  `src/content/modportal.ts:60` rewrites every `local-changes.` in an approved issue's DSL, prose
  and comments included. The audit's fix — route it through the namespace/`referenceSites`
  machinery — needs a loaded registry and canonical re-serialization
  (`serializeRegistryModule`), which drops the comments and formatting a maintainer reads. So it
  needs a call the user owns: **should an approved mod be stored source-preserving or canonical?**
  The alternative, making the authoring path emit `self.`-qualified self-references so a rename is
  a one-line `# info` change, does not cover `# save` bodies, whose JSON keys are unresolved and
  must stay fully qualified.
- **`/dsl <kind>` should print the kind's fields instead of requiring memorization.** BLOCKED —
  design question (raised independently by both audits as R6). `SCHEMAS` (`src/content/module.ts`)
  enumerates every field of every generic kind, so the help can be generated rather than written.
  Two things make it real work: `AnySchema` (`grammar/section.ts`) carries only field *names*, so
  it needs widening to expose `keyword`, `keywords`, `clauses` and `bare` — otherwise the help says
  `capabilities` where the DSL wants `stations` — and the four bespoke kinds (`dialogue`, `test`,
  `save`, `remove`) have no schema and need a hand-written line each. Recommended shape: `/dsl
  <kind>` with no id prints the generated field list and returns.
- **Should approved third-party content go live without a prompt?** BLOCKED — design question.
  `sync` still enables new approved mods by default and `play-cli` auto-loads the cache. Half
  answered by the R3 fix: the default now only applies to a mod that validates. Whether a
  maintainer-approved, DSL-only mod should additionally prompt is unstated and wants a decision.

## Audit findings (2026-07-29)
Evidence: `docs/audits/dsl-load-path-2026-07-29.md`.

The independent DSL load-path audit for chunks 1-7 found serializer, squash, BOM/CRLF,
unordered-dependency and local-module-id defects. All were fixed in `65d764a` as part of Chunk 7,
with regression tests. No open follow-up was added from this audit. Residual boundary: the squash
serializer is canonical rather than source-preserving, and the networked `gh issue create` path still
needs a real authenticated GitHub run when contribution publishing gets its first end-to-end manual
test.

## Audit findings (2026-07-28)
Evidence: `docs/audits/dsl-load-path-2026-07-28.md`, `testing-procedure-2026-07-28.md`,
`build-deployment-2026-07-28.md`, `user-interface-2026-07-28.md`. All six tiers are closed except
the two below; see `completed-tasks.md` for the commit per finding.

- **BD-H2 no gate stops a non-functional publish, and today's build is one.** BLOCKED — design
  question. `src/main.tsx` renders a bare "GUI pending" div; any tag push sends that to itch.io
  *and* attaches a signed APK of it to a GitHub Release. The audit's own wording is the decision
  that is owed: **gate the release on something, or accept it knowingly.** Neither is safe to
  pick unasked — a test-suite gate changes what a tag means, and accepting it changes what a
  published build promises. Related unanswered questions from the same audit: should the web and
  android jobs be independent, and is a tag imminent.
- **TP-M3 `runTest` returns `passed: true` while holding an unhandled `pendingModal`.** BLOCKED —
  folded into **recordings of `/test` ignore modals** below, on the audit's own instruction, and
  blocked on the same call: modal submission is not a directive, so there is no spelling for it
  in a recording. Deciding `modal: {"name":"Kira","race":"Elf"}` versus `submit-modal: name=Kira
  race=Elf` is what unblocks both. A guard added to `runTest` without it fails the shipped
  `miki-route-full`, which ends on an open modal.

Still-open design questions this audit raised that are not defects: should flags be declarable;
should `stations:` be a registered kind; are ids globally or kind-scoped unique.

## dsl-rewrite-carryover (lifted from the archived branch deliverable on merge, 2026-07-26)
Full design context/rationale for these lives in `docs/dsl-rewrite/deliverable-log.md`.
The branch merged with the contentDsl engine, spannable actions, action/combat
unification (B1+B2), travel-by-distance, timed buffs, and the named-test system all
landed. These are the genuinely-open forward items at merge time:

### Engine
- **Combat that mimics an aRPG** (+ its two separable companions, **droptables** and
  **skill levels + XP events**). Spec is complete and lives in
  `docs/combat/deliverable-log.md` — deliverable, settled decisions, engine gaps, open
  questions, chunk status and implementation order. Read that file, not this line, before
  touching combat code. Deliverable: the rat encounter becomes a real fight (rat 16×/min vs
  player 25×/min, +25%-attack-rate weapon) instead of the Pass-2 health-drain placeholder.
- **Offline progression.** Never written, and CLAUDE.md listed it under Game Engine → Core as
  though it were (found by the 2026-07-27 audit's inventory check; the line has been
  corrected). There is no wall-clock reconciliation anywhere in `src/game` — the only
  `Date.now()` in the repo is `play-cli`'s `--live` render loop. `resolve()` is the seam that
  would carry it: reconciling means calling it with the elapsed wall-clock span on load, which
  the associativity invariant already makes safe. Open questions are policy, not mechanism —
  whether a fight keeps swinging while the game is closed, and whether a span is capped.
- **Exploratory play-bot (`playbot.ts`).** Standalone Node loop holding a live session,
  calling the LLM API each turn to play and report bugs/softlocks/immersion. Design
  decided, not implemented. Related: port the old agentSession GM shape onto
  PlayView/PlayChoice and measure simulated time per run.

### Game engine audit findings (`docs/audits/game-engine-2026-07-27.md` and `-pass2.md`)
H1, M1 and the structural findings S1–S6 closed 2026-07-27; L1 and L2 closed 2026-07-29. See
`completed-tasks.md`. What is left:

- **L4 a `target:` action on a non-entity owner fights a phantom built from the player's sheet.**
  BLOCKED — design question, and the audit deliberately left it as one. `armAction` puts `objId`
  into `actors` unconditionally and `freshActor` falls through to the global `# stat` defaults,
  so an item action with `target: health` fights a "Lockpick" with **the player's** 30
  max-health, narrated as `You hit the Lockpick for 10.` The generality may well be wanted — the
  spec's lockpicking shape is a non-entity with a pool — but inheriting the player's maximum is
  not. Deciding it means deciding **whether a non-entity can carry a sheet.**
- **L6 `ActiveAction.healthRemaining` is written by both paths and read by one.** BLOCKED on the
  same decision. It is carried in state and in every save while meaning nothing on a `target:`
  fight, and is cheap to drop — but only once the `action.health`/`target:` unification tracked
  in `docs/combat/deliverable-log.md` settles what the two fields mean. The audit filed them to
  be resolved together.

### Docs / cleanup
- **grammar.md update (STALE).** Document the action combat axes (`accuracy`/`ability`/
  `health`/`escape after`/`on escape`), the `speed:` rename, recipe fields (`time`/
  `speed`/`accuracy`/`burnt`), and entity `stations:`. (User owns grammar.md commits.)

### Content
- **Miki questline Paths 2/3 (thieving/fishing)** are still only stubbed — content authoring.

### Design decisions to settle with user (before hardening)
- **Integer/fixed-point numbers vs floats** — eliminate EPSILON and float error across
  durations/rates/resource levels/stat values/progress. Weigh scale factor, percent
  stat-bonuses, rate integration, grammar impact (`time:` accepts decimals today).
- **Test recorder auto-`load:`** — `/create-*` prepends `load: <id>-start` for
  reproducibility when history doesn't lead with a load; user may prefer requiring an
  explicit leading `/load`.
- **Character-creation-modal-in-recordings** — the modal isn't a directive, so a recording
  can't capture name/race (replay starts from `<id>-start`, which predates the modal).
  Known limitation, unsolved. (see `recordings of /test ignore modals.` backlog item)
  Proposed fix (`TODO(modal-recording)` in `play-cli.ts`): make modal submission a
  first-class directive (`modal: {"name":"Kira","race":"Elf"}` or
  `submit-modal: name=Kira race=Elf`), parsed by `parseDirectiveLine`, executed by
  `applyDirective` calling `submitModal`, and recorded like any other directive — so the
  recorder, `runTest` and the CLI stay on one vocabulary. Also unblocks any future
  modal-gated branch being reproducible by a recorded test.
- **Quest journal** (`TODO(quest-journal)` in `play-cli.ts`) — there is no `/quests`
  command because quests are not a first-class DSL concept: progress is emergent from
  flags (`tutorial.quest-given`, `tutorial.made-bread`, …) set by dialogue nodes. The
  playtest wanted a discoverable journal. Doing it properly means a `# quest` section kind
  (objectives + completion conditions over flags) plus a `/quests` renderer. Deferred as
  out of MVP scope.- **Default action duration** (`TODO(default-duration)` in `action.ts`) — the playtest
  suggested a small nonzero default (~0.5s) so every action feels weighty. Blocked on a
  design call, not effort: an absent `time:` is currently the seam distinguishing an
  INSTANT action (mirror/stairs/eat — a deliberate design tool per CLAUDE.md) from a
  spannable one, and `beginAction` routes on `firstUnit > 0`. Defaulting to 0.5 turns
  every instant action spannable and shifts every timing assertion (session.test's ~19s
  Miki route, resolve.test). Decide which actions stay instant first.
- **Stationless crafts on items, not locations** (`TODO(inventory-crafting)` in
  `session.ts`) — every craftable recipe currently surfaces as a location action, so a
  stationless recipe (mixing dough) clutters the room's list. The playtest wanted these on
  the inventory/items involved, surfaced when you act on an ingredient. Needs an
  item-scoped craft affordance (which held item exposes which recipes) rather than the
  flat location scan.
- **Dialogue pacing** (`TODO(dialogue-pacing)` in `dialogue-runtime.ts`) — consecutive
  `say` beats between menus all push to the log in one turn, so a multi-line node dumps at
  once with no "continue" beat. The playtest praised the first, gated dialogue but found
  the rest a wall of text. Two options it raised: (a) treat each say beat as an implicit
  single-choice "continue" menu so the player advances line by line; (b) model dialogue as
  a first-class modal (`pendingModal`) so a GUI need not reverse-engineer pacing. Deferred
  as an out-of-MVP dialogue-engine change.

## DSL modules (spec + design: `docs/dsl-modules/deliverable-log.md`)
Read that log before touching the load path. It carries the spec, the merge design, the chunk
order, and five open decisions — two of which change the grammar surface. It supersedes the
merge-semantics half of *DSL pipeline audit* below; it also absorbed audit findings DSL-H1 and
DSL-H2, both of which it closed. The worked examples under *E2E Authoring* below describe the legacy
`upsert`/`replace`/`remove` system, which no longer exists.

**Action labels as members** (the one piece of chunk 3c deferred). Flags and dialogue nodes are
paths in the namespace tree; action labels are not. Nothing is broken by that — labels are
validated in `src/content/references.ts` and their objId is already namespaced — so it buys
uniformity, not a fix. It needs a slug/display split (labels carry spaces: `pick lock`,
`roast chestnuts`) and rewrites the `use:<kind>.<objId>.<label>` choice-id contract in
`src/runtime/session.ts` and `src/content/test.ts`. Do it with the GUI rebuild, which redefines
that contract anyway, rather than churning it twice.

## Implement CLI commands for editing the DSL
There should be a way to create new entities/locations/actions/etc in game that are stored in a local DSL file. 
We should also be able to edit existing data. 
There should be a command to export the local DSL changes
There should be a way to view/delete all/specific local changes if the author isn't happy with them. 

The vision is that I (or an agent) should be able to explore the world in game and create/balance things without having to exit the program. For example, the user can start a fight with a monster, and if it is too hard, they can edit the monster and try again, repeating until they are happy with how it feels with the current gear set. This should lead naturally into the GUI version that will come later which will show the full local changes and allow authoring. 

### DSL pipeline audit
Investigate the current DSL data pipeline. Investigate the full pipeline from authoring in editor, to reading patches and merging said patches into the game. 
Identify any innefficiencies and technical debt to answer whether it needs a refactor or hardening in key areas. 
The criteria are that the whole DSL system will eventually become ground truth, forsaking any raw JSON. The DSL system has to be robust with the ability to go to and from objects easily so that working with the DSL is straightforward
The motivation is that the most recent feature of adding diff support for contributors has felt difficult to implement and hacky. Additionally, the grammar document has grown excessively with rules that undercut the point of using a DSL (it's simplicity and near english authoring flow).

Please don't consider CLAUDE.md or any of the other standards/assumptions in the project as this is intentionally a rethink of the methods. Investigate with an open mind and come up with a solution that is the final solution rather than a patch job on the existing codebase. 

## Make the thin RPG GUI work again. 
Should be a thin wrapper that only calls CLI commands. 
Should be designed from the ground up for mobile

## Create the CLI modportal to enable disable mods. 
There should be options in game to enable/disable certain modules. 
Need to think about how mods are connected to each other. 


## recordings of /test ignore modals. 
See: `TODO(modal-recording)` in line 199 of `play-cli.ts`
Investigate the validity of unifying dialogue and the character creation modal into a single system that handles all popup style interactions through a new window. Ideally, the designed system is extensible and capable of supporting every other type of modal we wish to add in the future like: shops, minigames, potentially the inventory, quest journal, etc. Essentially every popup in game. 
That's the global goal. The main local goal is to complete the modal-recording todo. 
See also `TODO(dialogue-pacing)` in case it is relevant here. 

## Implement a migration system for saves
Saves stored inside of the DSL should probably be migrated once, instead of running through the migration engine every time. There should be a command for this we can run in the project whenever we bump the version. 

---

## E2E Authoring
Progress was made on this task in commits dcc74f6e1bcde83b1a798e7838008af856a8b33a and c1ea38675f13691519670c6f2d277beb6ccb9df4, but paused before task completion. 

You may find the actual user tested output of each commit in `temp.md` and `temp2.md`.

### Proposed plan
1. Contributor notes textarea — wire the existing (unused) draft.notes field into SubmitToGitHub.tsx. Small.
2. Drop the full-JSON dump from the issue body — everything meaningful today comes from DSL modules anyway, which get better coverage below.
3. Replace the unified-diff block with the full, self-contained DSL module source — directly satisfies "must contain a DSL file that's plug-and-play," since a diff alone can't be dropped in and tested without a merge step first.
4. New DSL sugar for patching a dependent module's content.
5. Rework merge-contribution-issue.mjs: full-source upsert instead of diff-apply (since the issue no longer contains a diff), version-bump on merge into an existing file, confirm new-module-stays-new.
6. Standalone "merge two DSL files" CLI, independent of issue processing.
7. The real end-to-end run.

### Authoring workflow
1. Create a change using the built in editor.
2. Submit a github issue.
3. In github, manually review and accept the issue.
4. Back in the project, pull the approved issue and merge it with the relevant DSL files (choosing whether to create new modules for organization's sake)

### Authoring Requirements
1. Github contribution issues should contain only as much information is required to understand the changes made to the game. (only the local-changes mod)
2. Github contribution issues must contain a DSL file that can be plug and play to test the changes. (local-changes must be runnable on a fresh machine without any additional work)

### Identified Issues (potentially solved by existing commits)
1. There is no place to add contributor notes to document what and why the change is being proposed. 
2. Many validation warnings: see `## Autogenerated travel actions create validation locale warnings`.
3. The changed JSON appears to be the full json of the universe. But that doesn't matter since it needs to be removed in favor of (4). 
4. The contents of the github issue need to contain a DSL file that can be dropped in directly without the use of a script merging files. That means the DSL has to natively support editing existing keys in dependent modules. 
5. The DSL diff currently being shown is good at requirement 1, but it fails at requirement 2 and should be removed. 
5. When a contribution is tested and approved, there needs to be robust tooling to merge it into main. 
	1) Changes to existing DSL files should merge into those files while bumping the version. 
	2) New modules should stay new. 
	3) Separate independent tooling to merge two DSL files. 

### Full testing plan 
1. The user will create a change to the tutorial guide house DSL using the built in editor.
	The changes will be:
	1. change x position on the guide house from 0 to 1
	result:
		```md
		## upsert location tutorial-guide-house
		x: 1
		```
	2. Delete the mirror
	result:
		```md
		## remove entity mirror
		```
	3. change the title of the stairs-up, remove the ascend action, and add a foobar action
	result. Then create an entirely new entity in tutorial-guide-house.
	result:
		```md
		## upsert location tutorial-guide-house

		### replace entity stairs-up
		title: StairsFoobar
		examine: A narrow staircase leads up to the second floor.
		foobar: relocate: tutorial-guide-house-upstairs, say: You climb the stairs.
		
		### upsert entity foobar
		title: Foobar
		examine: this is a test entity
		```
	4. Any additional changes necessary to fully test the system. 
2. The user will submit a github issue
3. The github issue will be manually reviewed and accepted
4. Back in the project, the issue DSL will be downloaded and merged with the tutorial guide house DSL
5. One last check to make sure things aren't broken and validate changes are in game. 
6. Revert the changes to core modules from the tests. 

### Automatic local-changes mod
When contribution mode is enabled a mod called local-changes is automatically created which will populate with all changes made locally through patch targets. Any changes made to core mods are stored and saved in local changes so that the user doesn't need to edit core mods by creating upsert/remove operations in local-changes. 

### Example Local Mod:
```md
## Target universe
base

## Notes
No contributor notes provided.

## Validation
...

## App version
0.1.0

## Changed DSL Modules

### modules/tutorial-island-guide-house-mod.md
```md
# info
id: tutorial-island-guide-house-mod
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: none
dependencies: tutorial-island-guide-house

# patches tutorial-island-guide-house

## upsert flags
bookshelf-note-taken
drawer-coins-taken
drawer-lockpick-taken

## replace item bronze-dagger (this replaces the contents of the bronze tagger with the following, regardless of what was there before)
tags: mainhand (10 attack), +20 attack

## upsert item iron-dagger (This changes the attack value on the spear from +3 to +5 and gives it the 'stab' tag, without changing anything else)
tags: +5 attack, stab

## remove item tin-ore (removes the item)

# location birdhouse
x: 3, y: 0
tags: tutorial
adjacent: 
	tutorial.tutorial-beach
examine: A tranquil spot around back where the birds are chirping
(contents of this location are entirely new and belong to tutorial-island-guide-house-mod and NOT to tutorial-island-guide-house. That is why it must refer to tutorial-beach by its full name.)
```

When a module is merged with core, all # patches keys are merged, while retaining all normal keys as its own separate mod. There will also exist a tool to merge mods independently.  

## Edit mode memory
The Edit tab should remember details about:
1. What module was being edited.
2. Where the cursor was at. Where the scrolling was at.
3. What was the map position.
4. What location is currently selected. 
5. Any contributor notes jotted down.

Validation:
Switching to home then edit should not change the appearance of what the user sees so that feature testing is quick and seamless. 

## Reimplement localization
base en is ground truth. 
UI to add new locale in a given language. 
UI shows side by side english and target language. 
UI has show-missing toggle (only updates when focus changes, not on any editor change)
(Has the ability to localize GUI locale strings separately - potentially make localization just another DSL file so that we get this for free)
see e7c3590a0835cb9a2cc4866ba4d7d8823cd71fdb for the removed legacy editor
Localization should live in DSL files so that the entire content pipeline is unified. 
Localizations are not 'patches' and should have their own folder. 
The change language dropdown should warn the user if not all strings have been localized for the target language (yellow exclamation point beside the language name)
We should consider if a module should specify what language it uses at the top so 'en is ground truth' isn't hardcoded. (If someone creates something in japanese, I should be able to translate that to english, and they should be able to specify that the module is japanese)

### Autogenerated travel actions create validation locale warnings
The DSL should be the ground truth for what gets localized. 
If any key doesn't get localized in the base DSL, then it shouldn't be able to be localized no matter what. 

See: Reimplement localization

### E2E localization authoring through github
Create a new localization for spanish
input a few keys (I don't know spanish)
submit to github
Make sure that the workflow works mostly correctly for creating a new locale or updating an existing one. 
(This should go through the same workflow exactly as regular authoring so if that works this should too.)

## Unify dev settings into a single developer mode setting. 
- Unify contribution mode and debug mode toggles to a single dev-mode bool
- Add /dev command which sets dev mode to true so ui navigation isn't necessary to use cheat commands
- Exiting dev mode should revert the state to when dev mode was enabled (dev mode save isolation)
- Dev mode should recolor the top banner (displayProfile override) bright orange to clearly indicate that dev mode is enabled. 

Validation:
It should be possible to play the game normally while in either mode.
Developing content should not corrupt or progress the non-dev mode save. 

Before starting this task:
1. are contribution mode and debug mode the same setting? Or in other words: Do you always want both? 

## Submit bug report button
- Should create a github issue and should somehow be able to transfer complete state for active universe that caused the bug. Should include the last N actions they took. I should be able to take the issue, and load up what they see to reproduce the bug directly. 

### E2E submit bug report
Create a bug in the code:
	Make it so that when a new location is discovered, the settings tab also animates like the map tab does
Have the user 'reproduce' the bug live and submit a bug report. 
Check github issues for the bug report and run the save/run-transcript payload 
Validate that the bug was reproduced by checking the logs
Fix the bug. 
Once more, run the transcript/save and validate that the new logs don't have the bug. 
Close github issue.
Create any necessary unit tests. 
Only create an integration test for the issue if several similar issues have cropped up in the past. (potentially tag all bug reports with the class of bug?)
