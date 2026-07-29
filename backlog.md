# How to use
Please move finished tasks to `completed-tasks.md` with a reference to the commit that solved the issue when they are complete. 
Do not remove tasks from this document until the user confirms the task is complete.
Only work on one backlog task at a time. 
Check `scratch.md` for open architectural notes touching an area before starting adjacent work there

# Tasks

## Audit findings — DSL modules, full deliverable (2026-07-29)
Evidence: `docs/audits/dsl-modules-2026-07-29-full.md`. Covers chunks 1-8 and the cross-system
surfaces the deliverable grew (`src/runtime/save.ts`, `scripts/play-cli.ts`, `scripts/modportal.ts`).
Every item below was reproduced at `731c3a6`. Work them in order; H1 and H2 are player-visible data
loss.

- **H1 a loaded save deletes every object-owned flag.** `src/runtime/save.ts:120` checks
  `registry.flags`, which holds only `# flag` sections; flags declared by `flags:` on an entity or
  location, and `discovered` on every location, live in `registry.namespace` alone. Round-tripping a
  save against the shipped tutorial loses `front-door.unlocked` and `basement.discovered`. Fires on
  `/load` and on every `/dsl` edit. The fix is the shape the `visits` line one row below already
  uses: `registry.namespace.has('flag', id)` — applied, 419/419 green. **Land the fix with a `# test`
  that saves, loads and asserts a member flag survived**, or M7 stays open.
- **H2 patching one stat on another module's entity deletes the rest of the sheet.** `stats` is a
  `Record` whose parser (`src/content/entity.ts:30`) is not a `ListParser`, so
  `merge.ts:61` replaces wholesale instead of merging. Silent. Fails module requirement 2 of the
  deliverable and the design's own "fields it does not list are untouched".
- **M1 `stats:` is the only collection field that rejects block form and `+`/`-`.** Same root cause as
  H2: `statBlock` wraps `list()` and drops the `parseBlock`/`element` it supplies. Every other
  multi-valued field in the grammar takes a block. Making `statBlock` a real `ListParser` over
  `[statId, Range]` pairs closes H2 and M1 together — do them as one change.
- **M2 a corrupt modportal manifest crashes the game.** Unguarded `JSON.parse` + `manifest.entries`
  iteration at `scripts/play-cli.ts:760` and `scripts/modportal.ts:97`. Takes down `npm run play`
  before the tolerant loader is reached, and takes down `modportal list/enable/disable` so the cache
  cannot be repaired through the tool.
- **M3 disabling a broken module neither silences it nor unblocks `sync`.** `registry.ts:524` records
  parse diagnostics for switched-off sources; `play-cli` prints them every launch and
  `scripts/modportal.ts:165` exits 1 on them.
- **M4 two positional args make the first the local-changes file, and `/dsl` overwrites it.**
  `play-cli.ts:718`. `npm run play -- content/a.dsl content/b.dsl` rewrites `a.dsl`'s `# info` header
  as `local-changes`. Multi-file loading is comma-separated; drop the positional rule or refuse a
  local file that already declares another module id.
- **M5 the prune map has no exhaustiveness guard.** `SAVE_FIELDS` in the same file forces a new
  `GameState` field to be classified for diffing; `pruneStateForRegistry` is hand-written and says
  nothing. Drive the record prunes off a `SaveField`-keyed table so one exhaustive key type covers
  both halves. (The prune is otherwise *not* over-complex — see the audit doc's M5 for the
  justification.)
- **M6 approved-mod re-identification is a global text substitution.** `modportal.ts:60` rewrites
  every `local-changes.` in the source, prose and `# save` JSON included. Route it through the
  namespace/`referenceSites` machinery that exists for this.
- **M7 the prune tests restate the implementation.** The H1 fix leaves the suite green.
  `PRUNE_MODULE` declares only module-level flags, and no `# save` section exists in `content/`, so
  `integration.test.ts` never loads a real save.
- **L1** `extractContributionDsl` takes the *first* ```dsl fence, which contributor notes precede.
- **L2** `serialize.ts:25` `n()` has two identical branches.
- **L3** `pruneRegistryDanglingReferences` uses dangling-roots for most kinds but
  `registry.stats.has` for entity stats and stat-bonus tags — two rules, one function, and the log
  disclaims the second.
- **L4** `visits` is not reserved, so a flag named `visits` misparses as a dialogue-node counter;
  `skills` is reserved but is not an engine root.
- **L5** `Namespace.resolve` materializes every key of a kind per reference; `/dsl` reloads the whole
  universe per accepted edit.

### Decision wanted, not a defect
- **`/dsl <kind>` should print the kind's fields instead of requiring memorization.** `SCHEMAS`
  (`src/content/module.ts:19`) already enumerates every field of every generic kind, so the help can
  be generated rather than written and cannot drift. Two things make it real work rather than a
  one-liner: `AnySchema` (`grammar/section.ts:34`) currently carries only field *names*, so it would
  need widening to expose `keyword`, `keywords`, `clauses` and `bare` — otherwise the help says
  `capabilities` where the DSL wants `stations`, and `hiddenIf` where it wants `hidden if` — and the
  four bespoke kinds (`dialogue`, `test`, `save`, `remove`) have no schema and need a hand-written
  line each. Recommended: `/dsl <kind>` with no id prints the generated field list and returns; the
  existing `/dsl <kind> <id> [body]` is unchanged.
- **Modportal `sync` enables new approved mods by default** and `play-cli` auto-loads the cache, so
  approved third-party content goes live without a prompt. Defensible (DSL-only, maintainer-labelled)
  but currently unstated. Decide and record it.

## Audit findings (2026-07-29)
Evidence: `docs/audits/dsl-load-path-2026-07-29.md`.

The independent DSL load-path audit for chunks 1-7 found serializer, squash, BOM/CRLF,
unordered-dependency and local-module-id defects. All were fixed in `65d764a` as part of Chunk 7,
with regression tests. No open follow-up was added from this audit. Residual boundary: the squash
serializer is canonical rather than source-preserving, and the networked `gh issue create` path still
needs a real authenticated GitHub run when contribution publishing gets its first end-to-end manual
test.

## Audit findings (2026-07-28)
The four outstanding audits ran. Evidence lives in the docs, not here:
`docs/audits/dsl-load-path-2026-07-28.md`, `testing-procedure-2026-07-28.md`,
`build-deployment-2026-07-28.md`, `user-interface-2026-07-28.md`. Every finding below was
verified against a fixture or a measurement; the doc names the fixture so it can be re-run.

Work them in tier order — tier 1 is what makes the rest of CI trustworthy.

### Tier 1 — the gates do not enforce what they claim
**Mostly CLOSED 2026-07-28 by retiring the gates rather than repairing them.** The comment
budget and `comment-only` are deleted; TP-H1, TP-M4, TP-L5 and UI-L1 died with them. TP-M1 is
fixed: `audit-status` now requires a real file under `docs/audits/` with real content. What
remains:

- **DSL-L2 + TP-M7 `layer-check` is a string match.** Catches 1 of 7 upward-import syntaxes
  (single quotes only — nothing pins quote style, there is no ESLint/Prettier), false-positives
  on imports inside comments and strings, and misses directory imports. `codeOnly` is right
  there in `scripts/lib/` and would fix the comment/string half in one line. Kept because
  layering is a real architectural claim and the script is cheap — but it is currently
  decorative, so either fix it or drop it too.
- **TP-M2 the commit hook fires on the wrong things.** Triggers on `echo "git commit"` and
  `--dry-run`, silent on `merge`/`rebase`, reports the main HEAD when you commit from a
  worktree, and asserts "ran normally" without checking the exit code. It also dumps the whole
  ledger after every commit; it should fire on the OK→DUE transition only.

### Tier 2 — DSL load path correctness
- **DSL-H1 a second definition of an id replaces the first wholesale.** There are no merge
  semantics; "patching" is `Map.set`. A 2-line mod concatenated onto real content — exactly what
  `play-cli.ts:551` does and exactly the worked example under *E2E Authoring* below — strips
  `guide-house` of 5 entities, 3 edges and `starting`, and the game then cannot start. This is
  the crux of the *DSL pipeline audit* item below; settle redefinition semantics before building
  the editor on top of it.
- **DSL-H2 reference validation covers 20 of 44 reference-bearing fields.** `registry.ts:72`
  claims "Every id is checked". Sharpest miss: `requires: has <typo>` loads clean and is false
  forever — the exact silent-typed-reference class the pass-2 M1 fix claimed to close (that fix
  *did* land completely; this is the remaining surface). Also `goto`, `open modal:`, `station:`,
  `stat-id:`, and every `# test` directive. 15 of the 24 misses name an already-registered kind.
  Third consecutive audit to find a false universal claim in this validator's comment.
- **DSL-M1 + TP-M6 CRLF breaks the shipped content, and CI cannot see it.** One stray `\r`
  reattributes a section to the previous one; a CRLF checkout fails `loadModule` outright
  (13 tests red). There is no `.gitattributes`, CI is ubuntu-only, and pasting DSL through a
  GitHub issue is the planned authoring path. One-line fix plus a CI matrix entry.
- **DSL-M2 `action.ts` is a second, laxer copy of the section field engine.** 89 of its 147
  lines, with 14 duplicated "defined more than once" guards; `time: 1e3` → `1`,
  `speed: s garbage`, `escape after 3 times` and `stop now` all load clean where the section
  engine rejects the equivalents. `section.ts:1` records the hand-written-per-kind parser as the
  *rejected* alternative. Likely partly causal for the **grammar.md update (STALE)** item:
  the document grew rules because actions parse by a different rulebook than sections do.
- **DSL-M3** a mistyped section field becomes a player-facing action (`examin:` →
  `use:location.den.examin` in `view().choices`).
- **DSL-M4** `# save` bodies are unchecked past `version`: `"time":"potato"` survives a
  `resolve()`; `flags`/`inventory` as strings become index maps.
- **DSL-M5** zero `starting` locations crashes at first `view()`; two picks silently by source order.
- **DSL-L1** `DslError.span` is built at 37 sites and read by zero live code — and every
  post-parse error carries no span at all, while `play-cli` concatenates files before parsing so
  offsets are not file-attributable anyway. Decide whether spans earn their keep or get deleted.
- **DSL-L4** `Skill['stat-id']` is parsed, unvalidated, read by nothing; `parse.test.ts:79` pins
  its emptiness. **DSL-L5** `add: x -3` silently means `+1` (`/\d+/` cannot match a sign);
  `give: 0 straw` accepted. **DSL-L6** default examine is `"This is an Hay."` and
  `parse.test.ts:378` locks the bug in. **DSL-L7** `burnt:` without `accuracy:` is dropped.

### Tier 3 — the publish pipeline would ship a placeholder
- **BD-H2 no gate stops a non-functional publish, and today's build is one.** `src/main.tsx`
  renders a bare "GUI pending" div; any tag push sends that to itch.io *and* attaches a signed
  APK of it to a GitHub Release. Gate the release on something, or accept it knowingly.
- **BD-H1 the web build ships absolute asset paths.** `base` is never set in `vite.config.mjs`;
  `dist/index.html` emits `/assets/...`, which 404s under itch.io's subdirectory hosting.
- **BD-M2** three publish actions handling secrets (itch credentials, APK signing key) are pinned
  to floating tags, not SHAs. **BD-M3** `publish.yml` has no `permissions:` block.
- **BD-L1** `android/app/build.gradle` hardcodes `versionCode 1`/`versionName "1.0"` with no
  relationship to `package.json` — a hand-synced pair, which CLAUDE.md forbids.
- **BD-L5** the Android CI job re-implements the `sync` npm script inline.

### Tier 4 — teardown residue that ships today
- **UI-H1** `vite.config.mjs:20-22` excludes `attic/**` and cites `attic/README.md`; `attic/` was
  deleted in `843d8b8` and nothing can ever catch a stale config comment.
- **UI-M1** `src/index.css` is ~90% dead (270 lines, zero live consumers for its four animation
  classes; its one substantive comment describes two deleted files) and compiles into the shipped
  16.57 kB CSS bundle. **UI-M2** `public/content/` ships 49 KB of legacy locale/universe data no
  live code reads. **UI-M3** eight `dependencies` (zustand, 6 codemirror/lezer, diff) have zero
  imports; `reactflow` is imported for CSS only from the placeholder `main.tsx` and its 9.2 kB
  stylesheet is fully compiled into the production bundle.
- **BD-L2** `playwright-core` unused. **BD-L3** `tsconfig.node.tsbuildinfo` is tracked.
  **BD-L4** `vite.config.mjs` is outside both tsconfig projects.

### Tier 5 — `systems.json` membership is not a partition
- **TP-M5** 37 of 164 tracked files are owned by no system, so they can never trigger an audit —
  including `.claude/hooks/*` (which gate commits) and `content/tutorial-island.dsl` (the shipped
  game). **UI-L3** adds `public/`, `postcss.config.js`, `tailwind.config.js`, `src/vite-env.d.ts`.
- **BD-M1** the converse: all 7 commits that charged **Build & deployment**'s budget touched it
  only through `package.json`/`tsconfig.json`. Its real pipeline files have not changed once
  since before the previous baseline — the trigger fires on neighbours' noise.
- **DSL-L3** `references.test.ts` sits in `src/runtime/` but drives `src/content/registry.ts`, so
  changes to this system's key test spend the *Runtime's* budget. **TP-M5** also found `runTest` /
  `# test` parsing / `integration.test.ts` are double-covered rather than orphaned.
- **TP-L4** code has five layers; CLAUDE.md documents four.

### Tier 6 — test corpus
- **TP-L2** the shipped `# test` corpus is two happy paths, catches 4 of 6 injected mutants, and
  never uses `expect: <save-id>` — its strongest assertion — over shipped content.
  `integration.test.ts` holds the ad-hoc script CLAUDE.md tells you not to write.
- **TP-M3** `runTest` returns `passed: true` while holding an unhandled `pendingModal`, and
  `/test` then eats the next two piped commands as name/race. Merge this into the
  **recordings of `/test` ignore modals** item below rather than filing it separately.
- **TP-L3** `session.test.ts` walks the Miki route a second time in TypeScript.

### Design questions raised for the user, not defects
DSL: redefinition/merge semantics (blocks DSL-H1); should flags be declarable; should `stations:`
be a registered kind; are ids globally or kind-scoped unique. Build: should publish gate on the
test suite; is a tag imminent given BD-H2; should the web and android jobs be independent.
Testing: settled — the comment gates were cut rather than repaired.

The retired readability gate is written up in `docs/readability-gate/deliverable-log.md`; the
Testing-procedure audit re-verified that retirement is genuinely complete (second ledger deleted
too), so nothing there is outstanding.

## dsl-rewrite-carryover (lifted from the archived branch deliverable on merge, 2026-07-26)
Full design context/rationale for these lives in `docs/dsl-rewrite/deliverable-log.md`.
The branch merged with the contentDsl engine, spannable actions, action/combat
unification (B1+B2), travel-by-distance, timed buffs, and the named-test system all
landed. These are the genuinely-open forward items at merge time:

### Engine
- ~~**Pass 2 — resource pools + effects(rate).**~~ DONE (b70b64f): `# resource` pools with
  max derived live from a stat, per-minute rate integration + clamp, rollover batching
  (`on full`/`on empty`), all under the associativity invariant. An action drains or feeds
  a pool by carrying a stat-bonus tag on the pool's rate stat — the same modifier math as
  food/equipment. Still deferred from that slice: combat numerics (below), pause/resume
  across different actions.
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

### Game engine audit findings (pass 2, `docs/audits/game-engine-2026-07-27-pass2.md`)
Closed 2026-07-27 by the staged restructure (commits `1c30ea7`..`243e59d`): H1, M1, and the
structural findings S1–S6. Re-verified after: 303 tests green, both tutorial-island `# test`
scripts pass, and the audit's own associativity fuzz reruns 400/400 against the real content.

- **L1 — `actionFirstUnit` probes before arming, `armAction` computes after.** STILL OPEN,
  now documented rather than silently false: the probe is only safe to read as a sign, which
  is all `beginAction` asks of it, so this is a latent hazard rather than a live defect. The
  fix is to arm first and route on `armAction`'s own return value (TODO(L1) in `runtime.ts`)
  — which needs a call on what `beginAction` does when arming succeeds but the first unit is
  instant. Same bug class as M1's food buffs: a quantity computed at two moments relative to
  arming.
- Pass-1 findings **L2, L4, L6** were re-confirmed open by the pass-2 audit and are untouched
  by this work.

### Docs / cleanup
- **grammar.md update (STALE).** Document the action combat axes (`accuracy`/`ability`/
  `health`/`escape after`/`on escape`), the `speed:` rename, recipe fields (`time`/
  `speed`/`accuracy`/`burnt`), and entity `stations:`. (User owns grammar.md commits.)
- ~~**`runtime.ts` decomposition**~~ DONE 2026-07-27. 1781 lines to 643, split into
  `registry`/`rng`/`state`/`tuning`/`conditions`/`actions`/`stats`/`effects`/`encounter`/
  `dialogue-runtime`. Each of the three homeless invariants got a home: associativity and the
  apply-function quadrant became the `Segment` type, and "all pool movement goes through
  `setPoolLevel`" became a readonly `PoolLevels` index signature.
- ~~`tsconfig include:["src"]` means `scripts/**` (play-cli.ts) is never type-checked by
  `tsc --noEmit`~~ DONE (see commit below): `include` is now `["src", "scripts"]`. All nine
  script files were already clean, so it was a one-line change with no cleanup behind it.

### Content
- **Miki questline Paths 2/3 (thieving/fishing)** are still only stubbed — content authoring.

### Design decisions to settle with user (before hardening)
- **Integer/fixed-point numbers vs floats** — eliminate EPSILON and float error across
  durations/rates/resource levels/stat values/progress. Weigh scale factor, percent
  stat-bonuses, rate integration, grammar impact (`time:` accepts decimals today).
- ~~**Full combat formula**~~ SETTLED — see the combat item above: Elo-style opposed
  accuracy-vs-evasion, and defense as a multiplicative percent factor plus a flat
  subtraction outside the attacker's multiplier. The attack-vs-defense truncated-Normal
  model (`.planning/old/balancing-resolution.md`) stays scrapped. Still true and still the
  reason this was cheap to defer: adding derived combat stats needs ZERO resolver rework,
  because the resolver only ever reads stat *values*.
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
merge-semantics half of *DSL pipeline audit* below, and absorbs audit findings DSL-H1 (no merge
semantics) and DSL-H2 (the reference walker, which turns out to be a prerequisite for graceful
mod-disable, not cleanup). The worked examples under *E2E Authoring* below describe the legacy
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
