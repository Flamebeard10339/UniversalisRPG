# How to use
Please move finished tasks to `completed-tasks.md` with a reference to the commit that solved the issue when they are complete.
Do not remove tasks from this document until the user confirms the task is complete.
Only work on one backlog task at a time.
Check `.planning/.scratch.md` for open architectural notes touching an area before starting adjacent work there.

A decision line marked **SETTLED (2026-07-29)** is an answer the user gave in the backlog-triage
session; it is the contract for the item, not a suggestion. Full rationale lives in the linked
deliverable log, not here.

# Tasks

## Contribution system
Tracked in `docs/contribution-system/deliverable-log.md` — spec, the settled label-tier model, what
is done and what is left. **Read that log before touching contribution code.** Evidence for every
finding it carries is `docs/audits/contribution-system-2026-07-29-reconciled.md`.

## `/dsl <kind> <id>` reads like a query and is a write (grammar evidence, 2026-07-29)
Kept as evidence for the grammar work, not as a bug to patch in isolation. **What to fix is a
question for the `/dsl` redesign**; what follows is the observation that should inform it.

**What happened.** Verifying that R1's modportal-synced mods reached a live session, I wanted to see
the DSL of the `gem` item that `approved-mod-11` had contributed, and typed `/dsl item gem`. It
printed `Staged # item gem in local-changes.` — `handleDslCommand` (`scripts/play-cli.ts:333`) treats
an absent body as an empty body, so the command created `content/local-changes.dsl` holding a
heading with no fields, **and added `approved-mod-11` and `approved-mod-12` to that module's
`dependencies:`**. A read-shaped invocation wrote a file and edited a dependency list. Nothing was
lost — the file was untracked and deleted — but nothing warned either.

**Why the mistake happened**, which is the part worth keeping:

- **The read/write axis is carried by nothing in the syntax.** `/dsl item gem` and
  `/dsl item gem title: Gem` are both writes; they differ only in whether a body follows. Every
  other verb in the CLI announces itself — `/local delete`, `/local clear`, `/create-test`. `/dsl`
  does not, and `<kind> <id>` is the universal shape of *addressing* a thing in this repo
  (`use:<kind>.<objId>.<label>`, `# remove item.rock`, `/local delete <kind> <id>`), which everywhere
  else means "the one I mean", not "make one".
- **Arity is about to become the read/write discriminator**, which is the actual trap. The settled
  item "`/dsl <kind>` prints the kind's fields" makes `/dsl item` a **read**. So the grammar becomes:
  one argument reads, two arguments write, three arguments write. Adding specificity flips the verb,
  then adding more does not. That reads as a narrowing query right up to the point it mutates.
- **An empty body is accepted as content.** Staging `# item gem` with no fields is almost never what
  anyone means; it is the exact keystroke of someone who expected output.
- **There is no read path for loaded content at all.** `/local show` prints the staged local module;
  nothing prints a registry object. So the thing I wanted did not exist, and the nearest-looking
  command was a write. Sessions cannot inspect what mods contributed without editing something.

**What it says about intuitiveness.** The wrong guess came from an agent holding the whole repo, the
grammar, and the help text — the help line does say "stage or replace". If that is not enough to
overcome the shape of the command, a contributor reading a wiki page has no chance. It is weak
evidence about humans and strong evidence that the shape itself is misleading; the write verb should
be visible in the syntax rather than inferable from argument count.

## A field edit can strip a member and leave references to it dangling
The remaining half of the `# remove` ordering defect below, which is **fixed**. That half was found
while building the R1 admission fixtures; this half was found while proving the fix, and it is the
same defect class reached through a different door — with no ordering component, just no coverage.

```
# entity base.door        <- base declares flags: unlocked, and open: requires: unlocked
-flags: unlocked          <- a later module strips the flag
```
loads **clean**, leaving `open:` requiring `base.door.unlocked`, a key nothing can ever set. The
action is permanently unavailable and nothing says so.

`# remove` now undeclares from the namespace at merge, which is what lets the post-build check see a
member go with its owner. A `-field:` edit does not: it filters the object's `flags` array without
telling the namespace, so the member stays declared and the reference still resolves. Fixing it means
member-level field edits reconciling with the namespace the way `# remove` now does. Same for any
other member list a `-` edit can shorten.

## ~~`# remove` validates by load order, so a dangling reference can pass silently~~ FIXED
Fixed on this branch. Resolution no longer undeclares; it only qualifies names. `# remove` undeclares
at **merge**, where removal is actually a fact and all resolution has finished, and existence is
proved after the universe is built by `validateSectionReferences`, walking the same reference sites
resolution walks and asking the namespace — which already knows a member goes away with its owner.
Both orders now produce the same diagnostic, attributed to the module holding the dangling reference.
`referenceSites.ts` had promised this pass all along ("validation hands it back and throws if it names
nothing"); the dead `validateReferences` export it should have been was deleted. The original finding:

Two modules over the same base: A does `# remove item.rock`, B has an entity whose action does
`give: base.rock`. Each loads clean alone. Together, **whether it errors depends on module order**:

| load order | result |
| --- | --- |
| remover first (`mod-a`, `mod-b`) | `resolve: … give: names an unknown item: base.rock` |
| referencer first (`approved-mod-2`, `approved-mod-8`) | **clean**, and `registry.items` is empty |

So a reference is resolved against the registry as it stands at that module's turn, and a later
`# remove` does not re-check what pointed at what. The second row is the dangerous one: the universe
loads with no diagnostic while the entity's `give:` names an item that no longer exists.

Reachable from ordinary content the moment two modules disagree, and load order follows module id, so
it is decided by a name. Fix direction: validate references after all modules are merged, or make
`# remove` reject a target that something still references. Wants a `# test` covering both orders.

## Go full integer: milli-units and integer milliseconds
See and Audit the following before marking this task resolved:
---
Branch: `backlog/full-integer-milli-ms`  
Worktree: `C:\Users\yonat\Projects\UniversalisRPG-full-integer`

The current checkout was left alone; all code changes are in the new worktree. I also linked `node_modules` in that worktree to the existing install so I could verify without reinstalling dependencies.

Implemented:
- Raw simulation time is integer milliseconds.
- Raw pools/resources are milli-units.
- Cadence progress and action spans are integer milliseconds.
- Resource rate integration carries integer remainders in state.
- Save version bumped to `5`, with stored time/resource fixtures updated.
- Float `EPSILON` usage removed from runtime resolution.
- Tests updated to assert exact integer storage where appropriate.

Verification passed:
- `npm test` → 31 files, 476 tests passed
- `npm run build` → passed

No commit was made.
---
**SETTLED (2026-07-29).** Every number the simulation stores becomes an integer: pools and stats at
milli-scale (`10.0` health is stored as `10000`), and `state.time`, cadence `progress` and every
duration in integer milliseconds. Chosen for the correctness properties — fewer edge cases, no
`EPSILON` equality, an invariant that can be asserted with `toBe` instead of `toBeCloseTo`.

What it fixes: every associativity gate today is `toBeCloseTo(..., 6)` (`resolve.test.ts:306`,
`cadence.test.ts:195`, `contest.test.ts:233`), so the core invariant holds to ~5e-7 while `EPSILON`
(`1e-9`, `effects.ts:85`) decides whether a pool is empty — and an empty pool fires `on empty:`,
which is death. The drift is ~500x the threshold that decides the outcome. It is unreachable today
only because damage and health are integers and float64 is exact on integers; it becomes reachable
the moment a continuous drain empties a pool, which offline progression makes routine.

**The accumulation must carry a remainder. It must not truncate per segment.** This is the one thing
that makes the conversion correct rather than a much worse regression, and it is not optional.
`effects.ts:144` accumulates `raw = current + delta + ratePerMinute * dtMinutes` into the stored
level once per segment, and the resolver has no tick rate — it advances to content-determined
boundaries, so the same span may be resolved in one segment or a thousand. Truncating per segment
makes the result depend on where the caller split. Worked example, 5 health/min at milli-scale over
one second: one segment gives `trunc(5000 x 1/60)` = **83** milli; sixty segments give
`60 x trunc(5000 x 1/3600)` = **60** milli. A 28% divergence from a pure split choice, against
~1e-13 for floats. Because the resolver splits at each swing in a fight, how much a player
regenerates would depend on how many times they were hit — an observable bug, not a rounding
artifact.

The remainder shape: accumulate `acc = rate * dtMs + remainder`, add `floor(acc / 60000)` to the
pool, keep `acc % 60000`. Exactly associative by
`floor(a/n) + floor((b + a mod n)/n) = floor((a+b)/n)`, provided `dt` is an integer — which the
integer-time half supplies, so the two halves depend on each other and land together. Cost: one
integer per rated pool, in state and in every save.

Consequences and things to settle during the work:

- **With remainders there are no dead rates.** A 0.001 health/min regen still accumulates and
  eventually ticks. The dead-rate breakpoints in the original milli-unit sketch were an artifact of
  truncate-and-discard, not a property of integers.
- **Breakpoints are still available, on derived rates rather than on the integration** — which is
  what Diablo 2 actually does (IAS to frames-per-attack, floored once; it never truncates
  accumulation per frame and never makes a stat do nothing forever). Two places:
  `attemptDuration = floor(timeMs / speed)` gets them for free and exactly, because it is a pure
  function of stats and stats only change at boundaries (`runtime.ts:615`) — `60000/16 = 3750`ms.
  And regen breakpoints, if wanted, belong in `captureResourceRates`, quantizing `ratePerMinute` at
  capture, which already runs once per boundary. Both are split-independent by construction.
- **Define the remainder's behaviour when a pool clamps at max** (discard, presumably — the pool is
  already at the ceiling). `resolve.test.ts:268` already documents one clamping shape that is not
  associative; integers do not make it worse, but the interaction needs a decision rather than a
  default.
- **State the overflow bound.** JS integers are integer-valued float64, exact to 2^53. `rate * dtMs`
  across the 4-hour offline cap is ~5e10, well inside it, but the plan should say so rather than
  assume it.
- `EPSILON` and its six call sites (`effects.ts:85,123`; `runtime.ts:120,183,193,196,221`) are
  deleted, not retuned.
- Display divides by the scale; the DSL keeps authoring decimals (`time:` already accepts them).

## Action-time taxonomy: name the three kinds, one cadence field each
**SETTLED (2026-07-29).** Closes `TODO(default-duration)` (`src/grammar/action.ts:19`), the `rate:`
sugar open decision, and F2 in `docs/combat/deliverable-log.md`.

`time:` is seconds per attempt and the kind is what ends the action; they are orthogonal axes, so
the kind gets its own token. `time: inf` / `time: continuous` was considered and rejected: a
continuous action still needs a finite per-attempt duration (the rat's 60/attack-rate = 3.75s), and
`floor(t / Infinity)` is 0, so such an action would never attempt anything while
`state.time + Infinity` poisons the clock on first use.

Each kind carries **exactly one** cadence field, so `time: 60` — authoring folklore that is opaque
to any contributor who has not read this file — never appears in content again.

| kind | tag | cadence |
| --- | --- | --- |
| instant | `instant` bare tag | none; `time:`, `rate:` and `speed:` all rejected |
| duration | untagged (the default) | `time:`, absent means `default-action-duration`; `speed:` optional |
| continuous | `continuous` bare tag, renaming `repeating` | `rate:` required; `time:` and `speed:` rejected |

- `rate:` accepts a literal (`rate: 12` is twelve per minute) or a stat id (`rate: attack-rate`).
- Four load errors, each naming its fix: `time:` with `rate:`, `rate:` with `speed:`, any cadence
  field on `instant`, and `continuous` without `rate:`.
- `# variable default-action-duration`, default `0`. Absent `time:` on an untagged action resolves
  to it, so the shipped default reproduces today's behaviour exactly and no timing assertion moves.
- Prerequisite for the variable ever being nonzero: tag the genuinely-instant actions (mirror,
  stairs, eat) `instant` in content first, otherwise raising it turns every one of them spannable.
  Surface is small — shipped content has 5 `time:` lines and 1 `repeating`.
- Accepted cost: a continuous action with a non-60 base scaled by a speed stat (`time: 30` +
  `speed: X`) is no longer directly expressible; content scales the stat instead. The
  +25%-attack-rate weapon in the spec already works that way — as a stat bonus on the rate channel,
  not a second multiplier field — so this is the shape the spec assumed.

## Unify `action.health` into `target:`, then drop `healthRemaining`
**SETTLED (2026-07-29).** Closes game-engine finding **L6** and the combat log's "whether
`action.health` survives as sugar" open decision.

`action.health` is removed outright rather than kept as sugar; every action gets an implicit pool
addressed by `target:`. Keeping it as sugar preserves the two-code-path problem the combat log
already says should not exist. `ActiveAction.healthRemaining` — written by both paths, read by one,
carried in state and every save while meaning nothing on a `target:` fight — drops in the same
change. Save shape changes; sequence with the save-migration item.

## A non-entity may carry a stat sheet, but never inherit the player's
**SETTLED (2026-07-29).** Closes game-engine finding **L4**.

`armAction` puts `objId` into `actors` unconditionally and `freshActor` falls through to the global
`# stat` defaults, so an item action with `target: health` fights a "Lockpick" with the player's 30
max-health. A non-entity owner of a `target:` action must declare its own `stats:`; falling through
to the global defaults becomes a load error. Preserves the spec's lockpicking shape and removes the
phantom.

## First-class modals
**SETTLED (2026-07-29).** Closes four backlog entries that were one question: **TP-M3**,
`TODO(modal-recording)` (`scripts/play-cli.ts:218`), "character-creation-modal-in-recordings", and
"recordings of `/test` ignore modals". Also closes `TODO(dialogue-pacing)`
(`src/runtime/dialogue-runtime.ts:24`).

A modal is a screen presenting options, which can sit atop other modals, and is cleared by user
choice. It blocks progression until answered or closed. The main action sheet is itself a modal;
so are the inventory, an NPC conversation, a shop, the quest journal, and the stationless-craft
menu below.

- **Each rendering layer chooses how to display a named modal.** The engine exposes a modal's name
  and its options; the CLI renders a shop as a list with prices inline, the GUI may render a grid of
  buttons. Both expose the same buy/sell options. The engine must not encode presentation.
- **Open and close are generalized** — one place defines what happens on push and on pop, rather
  than each modal kind hand-rolling it.
- Dialogue becomes a modal, which answers pacing as option (b) and gives the GUI rebuild a single
  popup system.
- **Directive spelling: `submit-modal: key=value`.** Chosen over
  `modal: {"name":"Kira","race":"Elf"}` because key=value matches the rest of the directive grammar
  and JSON would be the only place in the DSL carrying quoting rules. Parsed by
  `parseDirectiveLine`, executed by `applyDirective`, recorded like any other directive.
- The `runTest` guard for TP-M3 (currently returns `passed: true` holding an unhandled
  `pendingModal`) lands with the directive, not before — without it the guard fails the shipped
  `miki-route-full`, which ends on an open modal.

Sequencing: the directive spelling first, then the unified system records against it.

## Block release until MVP is complete
**SETTLED (2026-07-29).** Closes **BD-H2**.

`src/main.tsx` renders a bare "GUI pending" div, and today any tag push sends that to itch.io and
attaches a signed APK of it to a GitHub Release. Gate it — and the gate is not merely "the app
renders", it is **MVP complete**. No tag publishes before then. Keep the web and android jobs
independent so one failing does not block the other. No tag is imminent.

## Approved mods are stored canonical
**SETTLED (2026-07-29).** Closes **M6**, and **R2** of the contribution reconciliation — the first
contribution pass found the same defect independently, which is why it ranks Tier 1 there. The
duplicate copy that pass added to the follow-up list above has been removed in favour of this item.

`src/content/modportal.ts:60` rewrites every `local-changes.` in an approved issue's DSL, prose and
comments included, by global text substitution. Replace it with canonical re-serialization through
`serializeRegistryModule`. Comment loss costs nothing: the cache is a build artifact and the issue
body remains the human-readable original.

Also settled: **no additional prompt before a reviewed mod goes live** — the label is the human gate,
and validation narrows it further to mods that load.

**Superseded in part (2026-07-29):** that decision was taken against one flat `approved-mod` label,
where "goes live" meant "auto-enables". Under the tier model in the contribution follow-up item above,
approval and activation are different labels: `mod-approved` is listable but off until the user opts
in, and only `mod-auto-enabled` defaults on. No prompt still holds — the *label* is still the gate.
What no longer holds is that reviewing a mod activates it.

## Mod portal organized by pack
**SETTLED (2026-07-29).** Supersedes "how do you handle multiple dependencies / where do you place
the mod" — the question dissolves rather than being answered.

The hierarchy is built from `pack:`, which `# info` already carries, not from the dependency graph.
Multi-dependency placement stops being a question, and packs are what the expansion story actually
needs ("enable a folder of mods together"). Requirements carried over from the old item:

1. Enable or disable any mod.
2. Enabling or disabling a validated mod never crashes the game; a mod that would crash is blocked
   with a clear warning instead.
3. Enabling a mod enables its dependencies recursively.
4. Foldable tree, VS Code Outline-shaped.

The CLI half is done (chunk 8). This item is the GUI portal, and it is downstream of the GUI
rebuild.

## `resolve()` forward-progress guard
**SETTLED (2026-07-29)** — promoted from `.scratch.md`.

If a drain rate is large enough that `current / drainPerSecond` falls below the ULP of `state.time`,
`nextBoundary` returns `state.time` and the loop spins. It needs a rate above ~600k/min so it is not
reachable from plausible content, but it is the one place the resolver has no forward-progress
guard. The integer conversion eliminates the ULP class outright — a boundary is then either strictly
after now or equal to it — but the guard is worth having either way, and asserting it is what proves
the conversion did what it claims.

## Entity action templates (F1)
**SETTLED (2026-07-29)** — the override-scope question is answered; the rest is implementation.
Full context: `docs/combat/deliverable-log.md` F1.

The rat's `fight` and `bite` differ only in the `retaliates` tag and `cadence.test.ts`'s punchbag
repeats the block a third time. A template is an action kind an entity names rather than clauses
each entity copies.

- **An entity-level body sets stats only. Per-action overrides go in a named block matching the
  template's action label** — that resolves `stats:` belonging to the entity while `give: 1
  rat-tail` is a result on `fight`.
- The sketch's `# entitytype basic-enemy` and `type enemy:` must agree on one name.
- Compile at load into each entity's own `actions` array, following `recipeAction`
  (`runtime.ts:1506`). No new resolver concept, no runtime indirection.
- **Per-entity copies, never shared references** — `scopeEntity` (`scope.ts:38`) mutates
  `action.requires`/`results` in place, so one template object reachable from two entities is scoped
  twice and binds to the wrong one.
- Template action names must survive as stable labels; `findActiveAction` resolves by `ownerRef` +
  `actionLabel`.

## `/dsl <kind>` prints the kind's fields
**SETTLED (2026-07-29)** — approved as specified; no design work left. Raised independently by both
2026-07-29 audits as R6.

`/dsl <kind>` with no id prints the generated field list and returns. Generate it from `SCHEMAS`
(`src/content/module.ts`). Two real pieces of work: widen `AnySchema` (`grammar/section.ts`), which
carries only field *names*, to expose `keyword`, `keywords`, `clauses` and `bare` — otherwise the
help says `capabilities` where the DSL wants `stations` — and hand-write one line each for the four
bespoke kinds (`dialogue`, `test`, `save`, `remove`), which have no schema.

## Offline progression
**SETTLED (2026-07-29).** Never implemented; there is no wall-clock reconciliation anywhere in
`src/runtime`.

- **Encounters do not pause when the game is closed.** Offline combat means you can die in your
  sleep; the player is expected to explicitly stop acting to prevent it.
- **`# variable offline-span-cap`, default `14400`** (4 hours).
- `resolve()` is the seam: reconciling is calling it with the elapsed wall-clock span on load, which
  the associativity invariant already makes safe.
- **Sequence this after the integer conversion.** A 4-hour span integrates rates thousands of times,
  which is both the case where per-segment truncation would diverge most and the case that makes the
  `EPSILON` exposure reachable. Doing offline progression first means building it on the arithmetic
  that is being replaced.

## Single dev mode
**SETTLED (2026-07-29).** Contribution mode and debug mode are the same setting; you always want
both.

- One `dev-mode` bool replacing both toggles. It permits all state and DSL editing commands, for
  authoring and debugging.
- `/dev` command so UI navigation is not required to reach cheat commands.
- **Dev mode maintains a parallel state/save**, so the authoring workflow cannot brick a user's
  save. Exiting reverts to the state as of enabling.
- Bright orange top banner (`displayProfile` override) while enabled.

Validation: the game plays normally in either mode, and developing content neither corrupts nor
progresses the non-dev save.

## Stationless recipes get their own DSL section
**SETTLED (2026-07-29).** Supersedes `TODO(inventory-crafting)` (`src/runtime/session.ts:103`) and
reverses the playtest's suggestion.

Stationless recipes do **not** move onto items: a multi-input recipe has no single owning ingredient,
and item-scoping would leave it ambiguous whether the recipe must sit on one input or all of them.
They also should not stay in the location's action list unless they are genuinely location-restricted.
They get their own DSL section and their own surface — which, per the modal item above, is a craft
modal rather than a room action.

## Combat that mimics an aRPG
Spec is complete in `docs/combat/deliverable-log.md` — deliverable, settled decisions, engine gaps,
chunk status, implementation order. Read that file before touching combat code. Chunks 1-7 shipped;
the rat encounter is a real fight. What remains there, beyond the items broken out above:

- Enemy pools do not integrate their rate stat (`captureResourceRates`/`settlePools` are
  player-scoped), so a regenerating enemy is not expressible.
- **Equipment is inert.** `iron-sword`'s `+2 attack` and `wooden-shield`'s `+2 defense` parse and
  are ignored; only `food` tags become buffs. The stat channels exist; the equip verb does not.
- A stochastic fight's `on empty:` is still segment-granular when a pool is emptied by a *modifier*
  rather than a hit.

### Droptables (separable companion)
One system grants the player any item, so `give:` becomes sugar for a single-entry table. Layered
and referenceable by name; two explicitly distinct semantics (*every-entry* rolls each independently,
*pick-one* selects exactly one by weight); stats modify tables; the success/failure roll stays
orthogonal to the table; draws are deterministic and ordered. Detail in the combat log.

### Skill levels + XP events (separable companion)
Prerequisite for cooking-vs-dish-complexity and skill gating, not for the rat fight. `# skill`'s
`stat-id` parses and nothing reads it; there is no level curve. Curve, grammar
(`gain 4*damage taken experience in health on taking damage`), the closed event list, and the
requirement that level-ups land on segment boundaries are all specified in the combat log.

## Action labels as members
The one piece of DSL-modules chunk 3c deferred. Flags and dialogue nodes are paths in the namespace
tree; action labels are not. Nothing is broken — labels are validated in `src/content/references.ts`
and their objId is already namespaced — so this buys uniformity, not a fix. It needs a slug/display
split (labels carry spaces: `pick lock`) and rewrites the `use:<kind>.<objId>.<label>` choice-id
contract in `src/runtime/session.ts` and `src/content/test.ts`. Do it with the GUI rebuild, which
redefines that contract anyway, rather than churning it twice.

## Make the thin RPG GUI work again
Thin wrapper over CLI commands. Designed from the ground up for mobile. Blocks the release gate
above, the GUI mod portal, and action-labels-as-members.

## Implement a migration system for saves
Saves stored inside the DSL should be migrated once rather than run through the migration engine
every load. Needs a command to run on each version bump. Sequence the `healthRemaining` drop above
through it.

## Reimplement localization
Base `en` is ground truth, and localization lives in DSL files so the content pipeline stays unified.
Localizations are not patches and get their own folder.

- UI to add a locale; side-by-side English and target language; show-missing toggle that updates on
  focus change, not on every editor keystroke.
- GUI locale strings localizable separately — making localization just another DSL file gets this
  for free.
- The language dropdown warns (yellow exclamation) when a target language is incompletely localized.
- Consider a per-module language declaration so "en is ground truth" is not hardcoded: a module
  authored in Japanese should be translatable to English by its author declaring its language.
- The DSL is ground truth for what gets localized. A key not localized in the base DSL cannot be
  localized at all — this is what produces today's autogenerated-travel-action locale warnings.
- See `e7c3590` for the removed legacy editor.

### E2E localization authoring through GitHub
Create a Spanish locale, enter a few keys, submit to GitHub. Same workflow as regular authoring, so
if that works this should too. Covers both creating a new locale and updating an existing one.

## Submit bug report button
Creates a GitHub issue carrying complete state for the active universe plus the last N actions, so
the issue can be loaded and the bug reproduced directly.

### E2E submit bug report
Introduce a bug (discovering a location also animates the settings tab). Have the user reproduce it
live and submit a report. Load the save/run-transcript payload from the issue, confirm the bug
appears in the logs, fix it, replay, confirm it is gone, close the issue. Unit tests as needed; an
integration test only if several similar issues have appeared (consider tagging bug reports with a
bug class).

## Edit mode memory
The Edit tab remembers the module being edited, cursor and scroll position, map position, selected
location, and any contributor notes.

Validation: switching Home -> Edit does not change what the user sees, so feature testing stays
seamless.

## Contribution publishing: first authenticated end-to-end run
The networked `gh issue create` path has never run against real GitHub; chunk 7 and chunk 8 were
verified against local issue JSON fixtures of the same shape. Also unexercised: `modportal sync`
against live `gh issue list`.

## grammar.md update (STALE)
User owns grammar.md commits. Outstanding: the action combat axes
(`accuracy`/`ability`/`health`/`escape after`/`on escape`), the `speed:` rename, recipe fields
(`time`/`speed`/`accuracy`/`burnt`), entity `stations:`, and the full "Grammar surface added here"
list in `docs/combat/deliverable-log.md`. The action-time taxonomy above changes this surface again,
so sequence it after that lands.

Related doc debt: the merge examples in `docs/dsl-modules/deliverable-log.md` are wrong as written
under D8 (bare creates, dotted edits) — the log admits it at line 767.

## Miki questline Paths 2/3 (thieving/fishing)
Still stubbed. Content authoring.

## Balancing of the tutorial

## Identify parallel code paths and harden
Spring cleaning after the large merge. `/cancel` and "press any key to cancel the action" once went
through different paths despite doing the same thing. Find all such parallelism and merge it.

## Saves declare their active mods
A save records which mods were enabled. Loading a save whose enabled list names a mod that cannot be
found emits a **warning, not an error**, and prunes the missing module. The warning exists because
saving afterwards appreciably changes the save (pruned content plus an updated enabled list).

## Validate that time-based effects only apply on tick
Regeneration, fighting, and anything else rate-driven must apply values only when the simulation
ticks forward. Noted, never verified.

# Deferred — out of MVP

## Quest journal
**Confirmed deferred (2026-07-29).** `TODO(quest-journal)` (`scripts/play-cli.ts:79`). There is no
`/quests` command because quests are not a first-class DSL concept: progress is emergent from flags
set by dialogue nodes. Doing it properly means a `# quest` section kind (objectives plus completion
conditions over flags) and a `/quests` renderer. The playtest wanted it; it is out of MVP scope.
When it lands, it is a modal.

## Exploratory play-bot (`playbot.ts`)
Standalone Node loop holding a live session, calling the LLM API each turn to play and report
bugs/softlocks/immersion. Design decided, not implemented. Related: port the old agentSession GM
shape onto PlayView/PlayChoice and measure simulated time per run.

## Smithing skill
Work in progress, not ready for implementation, and dependent on droptables and skill levels. Design
notes and its three open questions stay in `.planning/.scratch.md`.

## Pre-0.1.0 release readiness audit
Full project audit before the initial release: clear or explicitly accept technical debt, simplify,
remove legacy code, consolidate duplicate implementations, review whether tests protect behavior
rather than implementation, combine redundant tests without losing detection power, move always-on
rules into runtime invariants, validate setup/upgrade/rollback/release workflows. Question the
workflow itself — can bug verification and feature validation be made less error-prone; is the
DSL -> game path convoluted; can the test count shrink without losing coverage. Treat CLAUDE.md as
input, not ground truth. Use a fresh session and independent review. Set version to 0.1.0 when done.

# Resolved by triage (2026-07-29) — no work required

These were carried as open design questions and are already answered by shipped work or by an
earlier settled decision. Recorded here rather than silently deleted.

- **"Should flags be declarable?"** (2026-07-28 DSL load-path audit, H2) — done. `flagSchema` is
  registered in `src/content/module.ts:26`, chunk 3c.
- **"Are ids globally or kind-scoped unique?"** — settled as D3: unique per kind, namespaced by
  owning module.
- **"What should a second definition of an id mean?"** (H1) — settled as D8: bare creates, dotted
  edits.
- **"Should `stations:` be a registered kind?"** — the hole it named is closed.
  `src/content/references.ts:18` errors on a `station:` naming an unknown capability. Registering
  the kind is now cosmetic.
- **"No validation that `max:`/`rate:` name real stats"** (`.scratch.md`) — fixed.
  `src/content/referenceSites.ts:212` resolves both as stat references, and unresolved references
  throw at load.
- **Integer/fixed-point vs floats** — settled as full integer; see the task at the top of this file.
  The combat log's earlier "pools stay float (an int pool never recovers from a low regen rate)" is
  superseded: milli-scale plus a carried remainder removes the objection, since a rate below one
  unit per segment accumulates rather than vanishing.
- **Test recorder auto-`load:`** — keep the auto-prepend of `load: <id>-start`. It is what makes a
  recording reproducible, and an explicit `/load` already overrides it. No change.
- **"Implement CLI commands for editing the DSL"** — chunk 6, done. `/dsl <kind> <id> [body]`,
  `/local` list/show/export/delete/clear, validated against a full universe reload before every
  write.
- **"Create the CLI modportal to enable/disable mods"** — chunk 8, done. `npm run modportal --
  sync|list|enable|disable|sources|show`, manifest-backed enablement, auto-loaded by `play-cli`.
- **E2E Authoring section** — the `upsert`/`replace`/`remove` grammar it documented no longer
  exists. Archived to `completed-tasks.md`; the one live item it still carried is
  "Contribution publishing: first authenticated end-to-end run" above.
