# full-refactor-of-enemies-and-combat

## Deliverable

The grammar `docs/combat/encounter-grammar.md` settles, implemented. An action becomes a thing
performed rather than a thing owned: one `# action` block, brought by whoever swings, reading `my`
off the swinger and `their` off the struck, so `# entitytype melee-foe`'s two near-identical blocks
collapse to zero. An entity becomes a stateful participant with a faction, a roster of actions it
`uses:`, skills, equipment slots and event handlers — and the player becomes one of those entities,
authored in content, which is what deletes the two places the runtime privileges an identity rather
than a lifecycle. A fight names its sides from factions and `allies:` instead of from a `retaliates`
tag, which is what makes more than two participants expressible at all. Respawn timers, exhaustible
resources and a felled tree that regrows fall out of the same spawn model rather than each needing a
mechanism. The design document is the requirements; this spec is the promise, and where the two
disagree the document is right and this file is the defect.

Proof:

- [c1] **The document's invariant holds in the implementation, not only on its page.** Every field of
  a two-sided action reads the side it names from a written `my` or `their`, and no runtime code
  recovers a side from anything else — not from a bare tag in the block, not from which section the
  block is nested under, not from a rule living in a comment. `retaliates` and the
  `BOOLEAN_ACTION_FLAGS` machinery it is the only member of are deleted, and the side-mapping comment
  at `src/runtime/encounter.ts:58` is deleted because the grammar now says what it said. The load path
  refuses a two-sided action whose stat, pool or skill field carries no marker; it never defaults one.
- [c2] **Side vocabulary in the body is the whole declaration of kind.** An action that writes `my` or
  `their` is two-sided and takes a target; one that writes neither is one-sided and belongs to the
  object declaring it. Nothing authored says which kind a block is, and no field, tag or section
  placement may be added that does. `# action <id>` at top level and an inline action under an entity,
  item or location parse to the same shape, so `roast chestnuts:` stays one line and
  `use: entity.mirror.look in` still addresses a one-sided action unchanged.
- [c3] **A contest is one line naming both halves, and there is exactly one spelling of each.**
  `accuracy: my accuracy vs their evasion` and `damage: my attack vs their defense`, right half
  optional and its absence meaning today's neutral default; `depletes:` names the pool a landed hit
  reduces. `accuracy`, `evasion`, `ability`, `dr` and `target` cease to be action fields, and no alias
  keeps them working. A two-sided action with no `depletes:` is a load error, because a side-naming
  action with nothing to deplete is not a contest.
- [c4] **How an action ends is `attempts: N`, and `on failure:` is not repointed.** `attempts: N`
  bounds an action at N of the performer's attempts, running `on success:` if it gets there and
  `on unfinished:` if it does not; `escape after N` and `on escape:` are gone. `on failure:` keeps the
  meaning it has today — the action could not begin — and this branch does not silently move it, which
  is the class of defect the design document is written against. Absent `attempts:` is unbounded.
- [c5] **`uses:` is a list and an overload governs only its own entity's performance.** A bare
  overload line replaces the inherited value and a `+` line appends to it; an overload block naming an
  action the entity does not `use:` is a load error, so a typo cannot silently add an action. The
  invariant the overload must not break is that it speaks about that entity swinging and never about
  anyone swinging at it — `hidden if:` inside `melee-combat:` stops the rat attacking, and `hidden if:`
  on the entity removes the rat.
- [c6] **What makes a target valid is the pool the performer's action names, and nothing on the
  target.** There is no list of permitted types anywhere in the tree, so a new tree species is
  choppable with no edit to the woodcutting action. The performer's side of the bargain is the
  counterpart rule: an entity performing a two-sided action must declare every stat that action names,
  and falling through to the global `# stat` bases is a load error. That subsumes
  `non-entity-action-owner-inherits-player-stats`, restated as a property of two-sided actions rather
  than as a ban on one kind of owner, and the global bases keep being what they already are for every
  entity that names no stat.
- [c7] **Retaliation is unconditional, unauthored, and picked by a stated rule.** An entity struck by a
  two-sided action swings back with the first two-sided action in its `uses:` whose `depletes:` names a
  pool its attacker has, so `uses:` order is the one place an entity says which attack it prefers.
  Deliberately not "the same action the attacker used". An entity with no `uses:` cannot retaliate and
  needs no `attack-rate: 0` to say so. `retaliationOf` is deleted.
- [c8] **Hostility is derived from factions and is symmetric.** `# faction` declares a name, names are
  authored and bits are compiled, and two entities are hostile exactly when they share no bit — one
  `and` in one place, never a per-species list. An entity naming no faction is `world`. An undeclared
  faction name is a load error the way every other reference is. `aggressive` means opens the fight
  against any hostile entity in its location, and a fight is bounded by that location: an aggressive
  entity disengages when its target leaves and does not follow, so travelling out is how a fight is
  broken off and no authored leash exists.
- [c9] **An event is a name bound to a trigger, and a handler's results land on the entity it happened
  to.** `# event` binds an id to a pool crossing a threshold; any entity may write `on <event>:`, and
  the results apply to that entity — on the player and on the rat alike, with no unmarked block whose
  recipient depends on which entity you are reading. `credit:` is the one marked exception and is an
  ordinary result wrapper, so it composes with `1 in 3:`, `luck vs 60:` and `if` as `droptables`
  already defines them. `on empty:` and `on full:` leave `# resource`, which is left declaring the
  pool's shape and nothing else.
- [c10] **The player is an entity and the runtime privileges no identity.** `# entity player` is
  authored in shipped content and declares its stats, skills, equipment slots, `uses:`, allies and
  handlers; the grammar reads nothing from it that it does not read from a rat. Both identity
  special-cases go: `participants()`'s `PLAYER` branch (`src/runtime/encounter.ts:70`) and
  `statRange`'s `if (actorId === PLAYER)` gate (`src/runtime/stats.ts:35`). The third thing that gate
  covers does not generalize for free and is named separately: the active action's tag bonuses fold
  from **the performer of the action**, read off that participant, never from `state.activeAction`.
  A `PLAYER` constant surviving as a well-known entity id is fine; a branch in behaviour taken on it
  is what this clause forbids.
- [c11] **Population is authored where the fact lives, and no syntax anywhere names one instance.**
  A location's `entities:` list takes counts and absent means one, so every line shipping today is
  unchanged; `respawn after:` sits on the entity and absent means never, so a boss omits it and zero is
  not a magic value. `allies:` names types with counts — `allies: 2 bandit` mints two fight-scoped
  bandits whether or not the location holds any, while `allies: miki` with no count is the Miki that
  already exists, joining from wherever he is. An author cannot address one particular spawned rat in
  any written form, and results reach the right one because the moment supplies the subject.
- [c12] **This branch adds no second instance table.** An entity is durably instanced exactly when it
  declares `skills:`, which is `instanced-objects` c3's laziness rule with an authored tell; everything
  else is fight-scoped and vanishes with the fight, the way `ActiveAction.actors` already does. A
  location's respawn deficit — how many of its five rats are down and when each is due — is state about
  the location, because the count is the place's fact, and it is not an entry in the instance table.
  Shipped content declares `skills:` on the player and on nothing else, so the player is the only
  durable instance this branch creates. A second instance table, a second prune rule or a second save
  field for instances is the defect `instanced-objects` exists to prevent and this clause inherits.
- [c13] **The three new sections are total across the load path and the deleted one leaves no
  residue.** `# action`, `# event` and `# faction` each parse, register, resolve, reference-check,
  serialize and survive a round trip; `uses:`, `faction:`, `allies:` and a handler's event name are
  reference sites, so an undeclared name is a load error rather than a silent invention.
  `# entitytype`, `src/content/entityType.ts` and `entityType.test.ts` are deleted, and no file in the
  tree still names the kind — a surviving mention in the registry's kind map, the serializer or a
  reference table is what makes this clause fail.
- [c14] **`use: <action> on <target>` is a directive beside the form it does not replace.** Both
  spellings work: `use: melee-combat on giant-rat` for a two-sided action and
  `use: <obj>.<objId>.<actionId>` for a one-sided one. `src/content/test.ts`'s `use:` payload regex
  accepts both, so a `# test` can drive either.
- [c15] **The save format's change is declared rather than discovered.** Whatever actor and location
  state gains — a faction mask, a location's respawn deficit, the player's stats moving out of the
  global `# stat` bases and into `# entity player` — is named in the commit that adds it, `checkSave`
  validates its shape the way it validates every other field, and the branch states whether
  `SAVE_VERSION` moves and why. A save whose new field holds nonsense is refused at load, never
  misread at first use.
- [c16] **The shipped content is rewritten and the regression plays it.** `content/tutorial-island.dsl`
  loses `# entitytype melee-foe`, `# resource health`'s `on empty:` and `type:`, and gains
  `# action melee-combat`, `# event death`, the two `# faction` declarations, `# entity player` and a
  counted `entities:` list; its `# test` plays the rat fight through `use: melee-combat on giant-rat`.
  The `expect:` save that test carries is the only fixture this branch regenerates, and regenerating a
  second one is a signal that something changed which this spec did not promise.
- [c17] **Nothing outside the forecast blast radius changes.** `src/grammar/condition.ts`,
  `src/grammar/tagClause.ts`, `src/grammar/range.ts`, `src/content/item.ts`, `src/content/recipe.ts`,
  `src/content/dropTable.ts` and `src/content/skill.ts` are untouched: conditions, stat-bonus tag
  clauses, ranges, drop tables and the chance wrappers are reused as they are, because this grammar
  adds no second spelling for anything they already do. A diff reaching one of them is either a defect
  or a decision, and either way it is not silent.
- [c18] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.

## Goal

Make an action a thing performed rather than a thing owned, so that the rat's swing and the player's
swing are one block and multi-participant combat, respawning populations and a choppable tree stop
needing three mechanisms.

## Decisions

- **The design document is the requirements and this spec does not restate it.** `combat-encounter-grammar`
  shipped `docs/combat/encounter-grammar.md` as one document and no code, precisely so this branch
  would have a settled surface to implement. Clauses here are the checkable promises; the worked
  shapes, the argument for ownership, the alternatives that lost and the expressiveness table stay in
  the document. Copying them here would be a second copy that drifts, which is the thing CLAUDE.md
  forbids outright.
- **Capabilities: this branch takes over combat, retires two, and adds four.** It **takes over**
  `combat encounters` (`src/runtime/encounter.ts`) — the file survives but `retaliationOf`,
  `participants()`'s player branch and the self/other mapping do not. It **retires**
  `# entitytype` action templates, whose replacement (`# action` + `uses:`) is strictly more expressive
  because `uses:` is a list, and **retires** the two load-time bans of
  `non-entity-action-owner-inherits-player-stats` by making them c6's property of two-sided actions.
  It **adds** four: `authored actions` (`# action`, top-level and referenceable), `events and handlers`
  (`# event` and `on <event>:`), `factions` (declaration, mask and the hostility check), and
  `entity populations` (counts, `respawn after:`, `allies:` rosters and their fight scope). It
  **extends** `result application` with `credit:` rather than adding a second subject mechanism, and
  **extends** `object instancing` by becoming its first live consumer without adding a table.
- **`applyResultsNow`'s recorded `PLAYER` limitation is reopened, knowingly.** `result-application-seam`
  left it naming `PLAYER` on the stated grounds that "a foe's pool takes the clamp but not the authored
  handlers, so it has no subject to vary over yet." c9 gives it one: a foe's pool emptying now runs the
  foe's `on death:`. That is a consequence of this branch, not a disagreement with a decision that was
  correct when it was made, and it is written here so an auditor reads it as intended rather than as
  regression.
- **`skills:` is the instancing trigger, and that is the whole contract with `instanced-objects`.**
  The substrate stores a template reference plus an opaque payload; this branch decides which entities
  get one and what goes in the payload, and reads nothing the substrate does not hand back. In
  particular the respawn deficit is location state and not an instance payload, so `instanced-objects`
  ships with exactly one durable consumer here — the player — rather than the four its Deliverable
  paragraph forecast. That correction is recorded on that spec too; it does not change any of its
  clauses, because none of them names a consumer.
- **Ordered behind `instanced-objects` and `combat-encounter-grammar`, and behind the curve half of
  `skill-levels-xp-events`.** The first two are already `requires` edges and are what this branch
  implements and builds on. The third is a path collision rather than a design dependency: both write
  `src/runtime/statRange`'s fold in `src/runtime/stats.ts`, and the curve is unblocked today while this
  branch is not, so it lands first by construction. The edge is recorded rather than added, because a
  `requires` here would say this branch needs the curve to exist, which it does not.
- **The xp event vocabulary is not this branch's, and this branch is what makes it authorable.**
  `xp-from-events` grants experience from what happened, and its nine moments become `trigger:` forms
  on the `# event` section c9 builds, so `on <name>` has one meaning everywhere in the language: an
  authored event name. This branch owes `# event` and its closed trigger set; it does not owe a single
  xp moment, and if it finds itself adding one, the seam is in the wrong place.
- **`docs/audits/systems.json` is in the grant, against the standing ruling, for the reason
  `first-class-modals` recorded.** The 2026-08-04 `tool-friction-backlog` ruling keeps that file out of
  every writes grant because every task appends to it through `tasks concept`, and treating it as a
  write region would collide every slice with every other. That reasoning is about appends. Since the
  2026-08-07 ruling that a system owns its files **by name**, three new files
  (`src/content/action.ts`, `event.ts`, `faction.ts`) and one deletion (`entityType.ts`) are a change to
  the partition `npm run audit-status` fails on, not an append — the same thing `first-class-modals` hit
  on 2026-08-09 when `src/runtime/modals.ts` had to enter the manifest or the partition would break.
  It is declared in the grant so the collision is visible rather than discovered, and it belongs to the
  load-path slice, which is where the new sections land.
- **Sequenced ahead of `combat-events`, `buffs-generalized` and `starting-zone`, each for its own
  reason.** `combat-events` would otherwise author hooks onto blocks about to move, and three of its
  clauses dissolve under this grammar. `buffs-generalized` should re-scope rather than re-plan: the
  identity half of "buffs apply to any entity" is c10's gate deletion, and stacking, sign and duration
  remain its own. `starting-zone` authors monsters in whichever grammar exists when it is worked and is
  already blocked behind two other branches, so ordering it after costs nothing and saves rewriting a
  zone. All three rulings are the design document's; they are repeated here only as the ordering this
  spec assumes.
- **The intended cut is five slices, disjoint by path, and it is recorded rather than added to the
  store now** — the same reason `instanced-objects` gives: adding unstarted slices to `main`'s store
  puts a plan in a shared file for a branch nobody has taken, and step 3 of the workflow runs on the
  branch with this paragraph as its input. (1) **Grammar** — `src/grammar/action.ts` and
  `src/grammar/actionResult.ts`: side markers, the two contest lines, `depletes:`, `attempts:`,
  `on unfinished:`, `credit:`, and the deletion of `retaliates`. (2) **Sections** — new
  `src/content/action.ts`, `event.ts`, `faction.ts`, rewritten `entity.ts`, deleted `entityType.ts`,
  and `location.ts`/`resource.ts`; requires (1). (3) **Load path totality** — `registry.ts`,
  `serialize.ts`, `referenceSites.ts`, `references.ts`, `test.ts`; requires (2), and is the slice
  `docs/audits/systems.json` moves in. (4) **Runtime** — `encounter.ts`, `stats.ts`, `actions.ts`,
  `session.ts`, `effects.ts`, and the player's instance against `instanced-objects`; requires (2).
  (5) **Content** — `content/tutorial-island.dsl` and its regenerated `expect:` save; requires (3) and
  (4), and is deliberately last because it is the only slice whose diff a reader can read as behaviour.

## Open questions

Four are the design document's, carried forward rather than re-derived, and two are this spec's:

- **Does the implicit target pool survive?** An action with `accuracy:` and no `depletes:` keeps
  today's abstract progress pool, unchanged, because it is one-sided and out of scope here. Decided by
  whoever revisits the action kind taxonomy, not by this worker.
- **How is an entity at peace with everyone written?** Membership makes peace pairwise, so a universal
  neutral must enumerate every faction in the module. An `everyone` wildcard, or peace as a relation
  between factions rather than as shared membership, would each fix it, and neither is proposed because
  no content needs one. Decided by `starting-zone`, the first module with more than two factions.
- **Can a `say:` name who it is about?** The log is one second-person channel, so a handler's `say:` is
  in the player's voice whoever triggered it. `credit:` moves rewards and deliberately does not move
  counters or log lines. Decided by whoever gives the log a subject.
- **Should today's `on failure:` be renamed, freeing that word for `on unfinished:`?** It means "could
  not begin", which no reader would guess. c4 forbids this branch from repointing it; the rename is
  filed as its own record because it reaches into grammar this branch does not own.
- **Where the location's respawn deficit is stored.** c12 fixes that it is location state and not an
  instance; whether that is a count plus a list of due times on location state, a queue keyed by
  location and entity id, or something else is the worker's call once it has read `save.ts`. The
  properties that are not the worker's call: it survives a save round trip, it is pruned when the
  entity or location leaves the registry, and it draws no randomness at spawn time.
- **When the player's instance is minted.** `createGameState`, the load-time prune pass, or first use
  are all defensible, and the answer interacts with `instanced-objects` c4's replay-stability property.
  The worker decides after reading `src/runtime/instances.ts` as built; the constraint is that a save
  written before this branch loads without one and gains one deterministically.

## Audit passes

### Pass 1 — 2026-08-09

- base: `20a2557a2e8216fc07a51afe98e88280c204e504`
- head: `86e16af9316010aa128a2c3eae156035afd28d1b`
- proof 1: met — `npx vitest run src/grammar/action.test.ts -t "refuses a two-sided action whose stat, pool or skill field carries no marker"` passes and is a confirmed mutation kill: breaking `const unmarked = sidedFields(action).find(...)` in src/grammar/action.ts fails it and re-fails at its own file (manifest name c1). `sidedFields()` is one walk over every stat/pool/skill field, so no field escapes the marker rule. `retaliates` survives only as a RETIRED_ACTION_TAGS message (grep -rn "retaliates" src/ returns action.ts:74 and its test); `BOOLEAN_ACTION_FLAGS` and `retaliationOf` are gone (grep returns nothing); the side-mapping comment at encounter.ts:58 is replaced by `sideOf`, which reads the written marker. No default is ever supplied: `twoSidedProblem` refuses before the action is built.
- proof 2: met — `npx vitest run src/grammar/action.test.ts -t "makes an action two-sided when it writes a marker and one-sided when it writes none"` is a confirmed kill of `isTwoSided` (manifest name c2). Nothing authored declares the kind: ACTION_KEYWORD_TAGS is {instant, continuous} only, and `RETIRED_ACTION_TAGS.retaliates` refuses the one word that used to. `src/content/action.ts:22` builds a top-level `# action` through the same `actionBody.parseBlock` an inline entry uses, so both forms hold one shape; content/tutorial-island.dsl still ships `roast chestnuts:` on one line (:281) and `use: entity.mirror.look in` (:440), and `npx vitest run src/runtime/integration.test.ts` plays both.
- proof 3: met — `npx vitest run src/grammar/action.test.ts -t "refuses a side-naming action with nothing to deplete"` is a confirmed kill of `if (!action.depletes) return` in twoSidedProblem (manifest name c3). `npx vitest run src/grammar/action.test.ts -t "keeps exactly one spelling of each half"` pins that `evasion:`, `ability:`, `dr:` and `target:` are refused with the line to write instead (RETIRED_ACTION_FIELDS, src/grammar/action.ts:164-172) and no alias accepts them. The optional right half is pinned by "takes the right half as optional, absent meaning the neutral default".
- proof 4: met — `npx vitest run src/runtime/contest.test.ts` is a confirmed kill of `outcomeResults`'s `action.onUnfinished ?? []` in src/runtime/actions.ts (manifest name c4), killed by "escapes a deterministic fight on its attempt count, not on an emptied pool". `escape after` and `on escape:` are retired fields naming their replacements, pinned by action.test.ts "has deleted escape after and on escape:". `on failure:` is unmoved: it is still read only by `armAction`/`armFightAction`'s input-shortfall branch (src/runtime/runtime.ts:571, :617), pinned by action.test.ts "leaves on failure: meaning what it means today, unmoved". Absent `attempts:` is `?? Infinity` at src/runtime/runtime.ts:341.
- proof 5: unmet — The overload's own visibility gate is inert for the entity it governs. Re-run: `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass1-hiddenif.js` — a rat whose `fight:` overload writes `hidden if: truce` deals the player exactly the same 25 damage with the flag set, with it unset, and with no overload at all, and the same with an unmet `requires:`. `retaliation()` (src/runtime/encounter.ts:82) and `participants()` (:132) consult neither `hiddenIf` nor `requires`, so c5's stated example — "`hidden if:` inside `melee-combat:` stops the rat attacking" — does not hold. The `+`/bare overlay half is implemented (`overlayAction`, src/content/registry.ts:588) and the "overloads an action this entity does not use:" refusal is implemented (:617), but neither is watched: mutating `if (!appended.has(key)) merged[key] = value;` to always replace SURVIVED the whole suite (manifest name c5). Content moved the rat's `hidden if:` to the entity, so shipped content never exercises the overload form.
- proof 6: met — `npx vitest run src/content/references.test.ts` is a confirmed kill of `performerStatProblem`'s `if (needed === undefined || entity.stats[needed] !== undefined) continue;` in src/content/registry.ts (manifest name c6), killed by "refuses an entity performing an action over a pool its own stats: does not measure" and "names the stat the contest reads, not the one it happens to share a word with". Only `my`-marked fields are demanded, so the target's half still falls to the global `# stat` bases. There is no list of permitted types: `grep -rn "hasPool" src/runtime` shows the only target gate is whether the actor's `depletes:` pool reads a positive max (src/runtime/encounter.ts:74), and `armFightAction` requires nothing of the target but that it be a registered entity.
- proof 7: met — `retaliation()` (src/runtime/encounter.ts:82) walks `actorEntity(...).actions` in `uses:` order, skips anything with no `declaredId` (so an entity's own inline actions cannot retaliate), skips anything not two-sided or with no `depletes:`, and skips any whose pool the attacker lacks — the rule as written, with nothing authored selecting it. `npx vitest run src/runtime/cadence.test.ts -t "gives an entity that uses nothing no answer at all"` pins that an entity with no `uses:` gets no seat and needs no `attack-rate: 0`. `retaliationOf` is deleted (`grep -rn retaliationOf src/` returns nothing). CAVEAT recorded as a finding: the attacker-pool filter has no test — deleting `if (!hasPool(state, registry, attackerId, action.depletes.id)) continue;` SURVIVED the whole suite (manifest name c7), and the test named for this rule fixtures a one-entry `uses:` so it cannot distinguish the rule from its absence.
- proof 8: met — Re-run: `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass1-aggro.js` — hostility is symmetric (playerVsRat true, ratVsPlayer true, ratVsRat false) and an `aggressive` rat opens the fight itself (fightOpened true, ownerRef "action.fight", the player losing health) where the same rat without the keyword opens nothing. It is one `and`: `hostile()` is `(factionMask(a) & factionMask(b)) === 0` at src/content/registry.ts:570, over bits compiled in `compileFactionBits` (:555); an entity naming no faction takes WORLD_BIT (`factionMask`, :564). An undeclared faction is a load error, pinned by `npx vitest run src/content/references.test.ts -t "rejects an event, a use: or a faction naming nothing"`. The fight is bounded by the location at src/runtime/runtime.ts:443. CAVEAT recorded as a finding: nothing in the suite watches any of it — replacing `hostile()` with `return true` SURVIVED the whole suite (manifest name c8) — and the location bound is drawn over every participant rather than over the target, which is finding 1.
- proof 9: met — `# event` binds a name to a pool crossing a threshold and nothing else (src/content/event.ts, EVENT_TRIGGERS = on empty, on full); `# resource` no longer holds `onEmpty`/`onFull` at all (src/content/resource.ts, and `grep -rn "onEmpty\|onFull" src/` returns only `eventsFor`'s trigger strings). One code path serves every actor: `fireEvents` -> `handlersFor(registry, actorId, event.id)` -> `applyResults(segment, results, actorId, ...)` (src/runtime/effects.ts:74-81), reached for every pool store alike from `setPoolLevel` (:134). `npx vitest run src/runtime/encounter.test.ts -t "runs the felled actor own handler rather than the player one"` and `npx vitest run src/runtime/resource.test.ts -t "fires on empty once as the pool crosses to 0"` pass. `credit:` is an ordinary wrapper: `nestedResults` lists it beside chance/contest/gate (src/grammar/actionResult.ts:48) and `npx vitest run src/grammar/action.test.ts -t "reads as an ordinary result wrapper, composing with the chance wrappers"` pins that it nests `1 in 3:`. CAVEAT recorded as findings: the subject is unwatched — rewriting `applyResults(segment, results, actorId, count)` to pass PLAYER SURVIVED the whole suite (manifest name c9) — and `handlersFor` is the one lookup that does not apply `templateOf`, which is finding 2.
- proof 10: unmet — Both NAMED gates are gone: `participants()` (src/runtime/encounter.ts:132) builds every participant, the player included, from a roster seat, and `statRange` no longer writes `if (actorId === PLAYER)`. The third thing is delivered — `performing()` reads the action off the participant, and mutating that fold is a confirmed kill (manifest name c10). But the clause's own closing rule — "a branch in behaviour taken on it is what this clause forbids" — is broken twice by code this branch wrote. `grep -n "PLAYER" src/runtime/stats.ts` shows :35 `const durable = actorId === PLAYER;`, which is the deleted gate reinstated inside `ownStores`: buffs and equipment are still folded for the player alone, undeclared in the spec or in any commit, and the spec's Decisions bank that deletion as delivering "the identity half of 'buffs apply to any entity'" for `buffs-generalized`. `grep -n "PLAYER" src/runtime/runtime.ts` shows :333 `if (next.self !== PLAYER)`, which makes the player's swing the only one that can complete a fight, record a felled copy, or run `emptyPoolNow`. Findings 3 and 5.
- proof 11: unmet — Counts are delivered — `npx vitest run src/runtime/cadence.test.ts -t "ends the fight when the last of a population is down"` is a confirmed kill of `deficit.down += 1` (manifest name c11-counts) — and no syntax names one copy (`FIGHT_SCOPED` is `#`, which the id grammar cannot produce). The `allies:` half is not. Re-run: `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass1-leash.js` — with `allies: 2 wisp` and a location that holds no wisp the fight ends within 1ms, and so does `allies: wisp`, while the same content with a wisp standing in the location survives. c11 promises exactly the opposite ("whether or not the location holds any", "joining from wherever he is"). Re-run: `...-pass1-handlers.js` — `handlersFor(registry,'wisp','death').length` is 1 and `handlersFor(registry,'wisp#1','death').length` is 0, so a fight-scoped copy answers no event. Re-run: `...-pass1-allykill2.js` — when an ally lands the killing blow the foe's `on death:` fires twice (token 2 against the player-kill control's 1). `respawn after:` has no test, no shipped use, and deleting its `deficit.due.push(...)` SURVIVED the whole suite (manifest name c11-respawn); deleting the whole counted-ally spawn loop also SURVIVED (manifest name c11-allies). Findings 1, 2, 3.
- proof 12: deferred — The half the clause is named for holds: there is no second instance table. `src/runtime/population.ts` is location state keyed by location and entity type, `state.populations` is its own save field with its own prune rule, and `grep -rn "instances" src/runtime/population.ts src/runtime/runtime.ts` shows population code never touches the instance table. What is not delivered is the trigger: `grep -rn "skills" src/runtime/*.ts` shows nothing reads an entity's `skills:` to mint an instance, so the player is not a durable instance and this branch creates none. Deleting `prunePopulations` from `pruneStateForRegistry` also SURVIVED the whole suite (manifest name c12), so the prune rule the clause inherits is unwatched.
Why the goal still holds without it: an action performed rather than owned needs no durable instance minted, because nothing yet reads one; `instanced-objects` ships with zero live consumers rather than one, which is a smaller correction than the four its own Deliverable forecast, and the clause's own defence — no second table, no second prune rule, no second save field for instances — is delivered. The branch already filed the gap itself as `c12-s-durable-instancing-has-no-consumer-skills-mints-nothin`, so it is tracked rather than lost.
- proof 13: met — `npx vitest run src/content/references.test.ts` is a confirmed kill of the `case 'action':` arm of `visitSection` (manifest name c13), 18 tests failing. All three sections parse (SCHEMAS/BESPOKE in src/content/module.ts:30-41), register, resolve (NAMESPACED_KINDS in src/content/namespace.ts:7 now lists action, event and faction), reference-check (`uses:`, `faction:`, `allies:`, `skills:` and a handler's event name are put() sites in src/content/referenceSites.ts:250-258), serialize (actionSection/eventSection/factionSection, src/content/serialize.ts:304-315) and round-trip (`npx vitest run src/content/roundTrip.test.ts src/content/serialize.test.ts`). The deleted kind leaves no residue: `grep -rn "entitytype" --include=*.ts --include=*.dsl --include=*.json .` returns nothing outside node_modules; entityType.ts and entityType.test.ts are gone from the tree.
- proof 14: met — Both spellings are load-bearing in the shipped regression, each a confirmed kill at src/runtime/session.ts: replacing the `use-on` arm's `useFight(...)` with a no-op fails `src/runtime/integration.test.ts > tutorial-island content > test "tutorial-island.miki-route-full" passes`, and replacing the `use` arm's `useAction(...)` fails that test plus `test "tutorial-island.dresser-trinket" passes` (manifest C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass1-mutations-c14.json, names c14 and c14b). `src/content/test.ts` carries both payload regexes (USE_PAYLOAD and USE_ON_PAYLOAD, :32-33) and both `begin:` forms.
- proof 15: met — `SAVE_VERSION` moves 7 -> 8 and commit ae08d1b states it and why ("SAVE_VERSION moves 7 -> 8 for the new populations field, whose shape checkSave validates like every other"); the only state gained is `populations` (src/runtime/state.ts:39). `checkSave` validates its shape through the same SAVE_FIELDS table as every other field (`populations: { shape: 'scalar', holds: isPopulations, ... }`, src/runtime/save.ts:54), and `isPopulations`/`isDeficit` (src/runtime/population.ts:21-30) refuse a non-integer count, a negative one, a non-array `due`, and more due times than copies down. Registry ids are pruned by `prunePopulations`, wired into `pruneStateForRegistry` beside the instance prune. Faction masks are compiled, not stored, so they add no save field. CAVEAT recorded as a finding: replacing `holds: isPopulations` with `() => true` SURVIVED the whole suite (manifest name c15), so no fixture feeds it a bad shape.
- proof 16: met — `npx vitest run src/runtime/integration.test.ts` passes, and `3 giant-rat` in content/tutorial-island.dsl is a confirmed kill: dropping it to `1 giant-rat` fails `test "tutorial-island.miki-route-full" passes` (manifest name c16). `git diff 20a2557..86e16af -- content/tutorial-island.dsl` shows `# entitytype melee-foe`, `# resource health`'s `on empty:` and the rat's `type:` removed and `# action melee-combat`, `# event death`, `# faction world`, `# faction player`, `# entity player` and the counted `entities:` list added, with the route fighting through `use: melee-combat on giant-rat`. Only `miki-route-end` is regenerated — it gains `populations` and no other value changes; the other three saves move their `version` literal 7 -> 8 and nothing else, which is the format bump rather than a regenerated fixture.
- proof 17: met — Re-run: `git diff --stat 20a2557a2e8216fc07a51afe98e88280c204e504..86e16af9316010aa128a2c3eae156035afd28d1b -- src/grammar/condition.ts src/grammar/tagClause.ts src/grammar/range.ts src/content/item.ts src/content/recipe.ts src/content/dropTable.ts src/content/skill.ts` prints nothing: all seven are untouched. The new grammar reuses them as they are — conditions through `condition.parse`, tag clauses through `tagClause`, ranges through `range` in an entity's `stats:`, and the chance wrappers through `resultList`, with `credit:` added as a fifth wrapper inside the existing `wrapperAt` table rather than as a second spelling.
- proof 18: met — Re-run: `npm run tasks -- merge-ready`. tsc ok, npm test ok, layer-check ok, audit-status ok, doctor ok (17 warnings, which that leg does not fail on), bytes ok, tree ok, base ok, spec ok. The only failing leg is `clauses full-refactor-of-enemies-and-combat FAIL — has no recorded audit pass`, which is this pass.

### Pass 2 — 2026-08-09

- base: `20a2557a2e8216fc07a51afe98e88280c204e504`
- head: `eb1e9944082508f8ad26216b7686fced034098f6`
- proof 1: met — Re-run: `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations-b.json`
  manifest name c1 is KILLED at this head by src/grammar/action.test.ts > side markers > "refuses a two-sided
  action whose stat, pool or skill field carries no marker", re-run at its own file with the mutation still
  applied and failing there too. `sidedFields()` is one walk over every stat/pool/skill field, so no field
  escapes the marker rule, and `twoSidedProblem` refuses before the action is built, so no default is ever
  supplied. `grep -rn "retaliates" src/` returns only src/grammar/action.ts:74 (the RETIRED_ACTION_TAGS
  message) and its test; `grep -rn "BOOLEAN_ACTION_FLAGS\|retaliationOf" src/` returns nothing. The
  side-mapping comment at encounter.ts is replaced by `sideOf`, which reads the written marker.
- proof 2: met — Re-run: same manifest, name c2 is KILLED by src/grammar/action.test.ts > side vocabulary is the
  whole declaration of kind > "makes an action two-sided when it writes a marker and one-sided when it writes
  none", confirmed at its own file. Nothing authored declares the kind: ACTION_KEYWORD_TAGS is {instant,
  continuous} only. src/content/action.ts builds a top-level section through the same `actionBody.parseBlock`
  an inline entry uses. content/tutorial-island.dsl still ships `roast chestnuts:` on one line and
  `use: entity.mirror.look in` at :440, and `npx vitest run src/runtime/integration.test.ts` plays both.
- proof 3: met — Re-run: same manifest, name c3 is KILLED by src/grammar/action.test.ts > contests > "refuses a
  side-naming action with nothing to deplete", confirmed at its own file. `npx vitest run
  src/grammar/action.test.ts -t "keeps exactly one spelling of each half"` pins that `evasion:`, `ability:`,
  `dr:` and `target:` are refused with the line to write instead (RETIRED_ACTION_FIELDS) and no alias accepts
  them; the optional right half is pinned by "takes the right half as optional, absent meaning the neutral
  default". Noted for c5: this rule is enforced against an ENTITY OVERLOAD BLOCK before the overlay merges,
  so a partial overload that writes `damage: my X vs their Y` without restating `depletes:` is refused. Shown
  by `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-overload.js`
  (key `partialDamageOverload`). That is a c5 consequence, not a c3 defect.
- proof 4: met — Re-run: same manifest, name c4 is KILLED by src/runtime/contest.test.ts > a contest inside a
  fight > "escapes a deterministic fight on its attempt count, not on an emptied pool", confirmed at its own
  file. `escape after` and `on escape:` are retired fields naming their replacements, pinned by
  action.test.ts "has deleted escape after and on escape:". `on failure:` is unmoved: still read only by
  `armAction`/`armFightAction`'s input-shortfall branch (src/runtime/runtime.ts:577, :623), pinned by
  action.test.ts "leaves on failure: meaning what it means today, unmoved". Absent `attempts:` is
  `?? Infinity` at src/runtime/runtime.ts:348.
- proof 5: unmet — The repair delivered the gate half at ONE instant and nothing else. Re-run:
  `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-overload.js`
  an ogre whose `swing:` overload writes `damage: my big-attack vs their dr` (big-attack 400 against the
  global attack 4) is HELD in the registry as overloaded (`overloadSeen.damageLeft` is `my big-attack`) and
  yet deals the player exactly 20 over five seconds, byte-identical to the same content with no overload at
  all; `rate: my slow-rate` (1/min against 60/min) likewise swings five times in five seconds. Re-run:
  `...-pass2-overload-gate.js` a `+hidden if: truce` overload gates the ogre when the flag is set BEFORE the
  fight (health 1000) and does nothing at all when the same flag is set one second in (976, identical to the
  ungated control). The cause is one line: `enterEncounter` seats
  `{ ownerRef: 'action.<id>', actionLabel }` and `seatedAction` (src/runtime/encounter.ts:142) resolves that
  through `findActionOwner('action', id)`, which returns the TOP-LEVEL declaration, so every overloaded field
  is discarded at swing time and only `retaliation()`'s one-shot `performable` call ever reads the entity's
  copy. Beside that, the `+`/bare overlay rule is still watched by nothing: mutating
  `if (!appended.has(key)) merged[key] = value;` in src/content/registry.ts:590 to always replace SURVIVED
  the whole suite (manifest name c5-append-vs-replace,
  C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations.json). What IS
  delivered and watched: `uses:` as an ordered list (cadence.test.ts, manifest name c7-attacker-pool KILLED),
  the refusal of a block naming an action the entity does not use: (references.test.ts:276), and the
  seat-time gate (manifest name c5-overload-gate-at-seat KILLED by fight.test.ts "stops that entity swinging
  without removing it").
- proof 6: met — Unchanged by the repair commit. `npx vitest run src/content/references.test.ts` is a confirmed
  kill of `performerStatProblem`'s `if (needed === undefined || entity.stats[needed] !== undefined) continue;`
  in src/content/registry.ts, killed by "refuses an entity performing an action over a pool its own stats:
  does not measure" and "names the stat the contest reads, not the one it happens to share a word with"
  (pass 1 manifest name c6, still resolving to the same line). Only `my`-marked fields are demanded, so the
  target's half still falls to the global bases. There is still no list of permitted target types:
  `grep -rn "hasPool" src/runtime` shows the only target gate is whether the actor's `depletes:` pool reads a
  positive max (src/runtime/encounter.ts:78), and `armFightAction` requires nothing of the target but that it
  be a registered entity. The repair DID add a permitted-value list elsewhere — item slots against
  `registry.player.equipmentSlots` — which is filed as its own finding rather than against this clause,
  because c6 is about what makes a TARGET valid.
- proof 7: met — Re-run: `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations.json`
  manifest name c7-attacker-pool is now KILLED (it SURVIVED at pass 1) by src/runtime/cadence.test.ts > the
  rat sheet > "answers with the first action in uses: whose depletes: names a pool the attacker has",
  confirmed at its own file. The fixture is genuinely discriminating: the rat's `uses:` lists `shell-crack`
  FIRST, reaching a `carapace` pool the player does not carry, and the same test loads a second variant whose
  player DOES carry `max-carapace 20` and asserts the answer moves to `shell-crack` — so order and filter are
  each shown to be doing work. `retaliation()` (src/runtime/encounter.ts:86) walks `uses:` order, skips
  anything with no `declaredId`, anything not two-sided, anything with no `depletes:`, and anything whose pool
  the attacker lacks. `npx vitest run src/runtime/cadence.test.ts -t "gives an entity that uses nothing no
  answer at all"` pins the no-`uses:` case. `grep -rn retaliationOf src/` returns nothing.
- proof 8: met — Hostility and `aggressive` are now watched. Re-run: same manifest — name c8-hostile
  (`hostile()` to `return true`) is KILLED by src/runtime/fight.test.ts > "makes two entities hostile exactly
  when they share no bit", which walks five ordered pairs in BOTH directions, so symmetry cannot pass by
  accident; `hostile()` is one `and` at src/content/registry.ts:571 over bits compiled in
  `compileFactionBits`, an entity naming no faction takes WORLD_BIT, and an undeclared faction is a load error
  pinned by references.test.ts "rejects an event, a use: or a faction naming nothing". `aggressive` opening
  the fight and the no-aggressor control are both in fight.test.ts. The LEASH itself is correct but proved
  only outside the suite. Re-run:
  `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-leash2.js`
  with a crab tough enough that no killing blow can land in the window, travelling out ends the fight
  (stillArmed false) and staying does not (stillArmed true). Caveat filed as a finding: the test NAMED for
  this rule cannot fail — manifest name c8-leash (`return !isStanding(...)` to `return false`) SURVIVED the
  whole suite, because in fight.test.ts's own fixture the crab is dead by t=2 (player plus miki, 8 a second
  against 12 health) before the leash would ever fire.
- proof 9: met — Both pass-1 caveats are now watched. Re-run: same manifest — name c9-handler-subject (passing
  PLAYER instead of `actorId` in `fireEvents`) is KILLED by src/runtime/encounter.test.ts > "runs the felled
  actor own handler on the felled actor", whose fixture gives the dummy a `restore: 4 sawdust` handler and
  asserts the sawdust lands in the dummy's own store AND that `state.resources['sawdust']` stays 0 — so the
  subject is what the assertion reads. Name c9-handlers-template (restoring the pass-1 lookup) is KILLED by
  fight.test.ts "answers an event on a fight-scoped copy, which has no entry in the registry of its own".
  `# event` binds a name to a pool crossing a threshold and nothing else (src/content/event.ts); `# resource`
  no longer holds onEmpty/onFull. `credit:` is an ordinary wrapper beside the chance wrappers
  (src/grammar/actionResult.ts) pinned by action.test.ts "reads as an ordinary result wrapper, composing with
  the chance wrappers".
- proof 10: unmet — One of the two pass-1 breaches is repaired and the other is not, and the repair added a third
  in a new file. REPAIRED: `runtime.ts`'s `if (next.self !== PLAYER)` is gone — the fight is now measured on
  what the armed action targets, and manifest name c10-any-killing-blow (restoring `next.self === PLAYER`) is
  KILLED by fight.test.ts "lets an ally land the killing blow, which ends the fight and fires the death once".
  NOT REPAIRED: `grep -n "PLAYER" src/runtime/stats.ts` still returns :36 `const stored = actorId === PLAYER;`
  — behaviourally identical to the gate this clause names as deleted; the repair commit changed only the
  identifier and the comment above it. It is now PINNED as correct by encounter.test.ts:120 "keeps the player
  buffs and the running action off other actors" (manifest name c10-player-only-stores is KILLED), and the
  spec's Decisions still bank that deletion as delivering "the identity half of 'buffs apply to any entity'"
  while `npm run tasks -- show buffs-generalized` still says "Today activeBuffs is player-shaped". NEW:
  `grep -n "player" src/content/references.ts` returns :43 and :53, two behaviour branches on
  `registry.player` added by the repair, in the LOAD PATH where this clause's own grep over src/runtime cannot
  see them — `registrySlots` returns the player's slots alone when it has any, and `validateItemSlots` refuses
  every item whose `slot:` the player does not declare, naming the player in the message. Re-run:
  `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-slots.js`.
  The third thing the gate covered is delivered: `performing()` reads the action off the participant.
- proof 11: met — Every half pass 1 found missing is now delivered AND watched. Re-run:
  `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations.json`
  name c11-allies-count (the counted spawn loop to zero copies) is KILLED by fight.test.ts "mints one
  fight-scoped copy per count and joins a named one from wherever it is", which asserts the actor keys are
  exactly bandit#1, bandit#2, bandit-leader and miki at a camp holding no bandit and no miki; name
  c11-respawn is KILLED by "brings a copy back at its due instant and not before" and "draws no randomness at
  spawn time"; name c8-leash-is-the-target (restoring the pass-1 any-participant bound) is KILLED five times
  over. `allies: miki` joins from a location Miki does not stand in, and the killing-blow test asserts the
  death fires exactly once (`inventory['token']` is 1) with the deficit recorded (`{down: 1, due: []}`). No
  syntax names one copy: FIGHT_SCOPED is `#`, which the id grammar cannot produce. Caveat filed as a finding
  rather than against this clause: `allies:` is reference-checked for existence only, so `allies: player` on a
  foe loads clean and then throws `RuntimeError: actor is not in the encounter: <target>` the instant the
  fight arms — re-run
  `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-allyplayer.js`.
- proof 12: deferred — The half the clause is named for holds, and it is now watched: `src/runtime/population.ts` is
  location state keyed by location and entity type, `state.populations` is its own save field with its own
  prune rule, population code never touches the instance table, and manifest name c12-prune (dropping
  `prunePopulations` from `pruneStateForRegistry`) is now KILLED by fight.test.ts "survives a round trip and
  is pruned when the place or the thing leaves" — it SURVIVED at pass 1. What is still not delivered is the
  trigger: `grep -rn "skills" src/runtime/*.ts` returns only a comment in instances.ts and the xp prune rule
  in save.ts, so nothing reads an entity's `skills:` to mint an instance and this branch creates no durable
  instance at all.
  Why the goal still holds without it: the goal — an action performed rather than owned — needs no durable instance minted, because
  nothing yet reads one. `instanced-objects` ships with zero live consumers rather than the one this spec
  forecast, which is a smaller correction than the four its own Deliverable forecast, and the clause's own
  defence (no second table, no second prune rule, no second save field for instances) is delivered and, since
  the repair, watched. The branch already filed the gap itself as
  `c12-s-durable-instancing-has-no-consumer-skills-mints-nothin`, so it is tracked rather than lost.
- proof 13: met — Re-run: `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations-b.json`
  name c13 is KILLED, 18 tests of src/content/references.test.ts failing, confirmed at its own file. All three
  sections parse (SCHEMAS/BESPOKE in src/content/module.ts), register, resolve (NAMESPACED_KINDS in
  src/content/namespace.ts:7 lists action, event and faction), reference-check (uses:, faction:, allies:,
  skills: and a handler's event name are put() sites in src/content/referenceSites.ts), serialize
  (actionSection/eventSection/factionSection) and round-trip (`npx vitest run src/content/roundTrip.test.ts
  src/content/serialize.test.ts`). The deleted kind leaves no residue: `grep -rn "entitytype" --include=*.ts
  --include=*.dsl --include=*.json .` outside node_modules returns nothing, and both entityType files are gone.
- proof 14: met — Still met after the repair reversed the two readings' order. Both spellings are load-bearing in
  the shipped module, and each is now a confirmed LOAD failure rather than a test failure: re-run
  `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations-b.json`
  names c14 and c14b each report ERROR because content/tutorial-island.dsl stops parsing —
  `unexpected line in # test` — when either arm of `parseDirectiveLine` is disabled. The two lines it cannot
  parse are :457/:459/:461 `use: melee-combat on giant-rat` and :440 `use: entity.mirror.look in`.
  src/content/test.ts carries both payload regexes (USE_PAYLOAD, USE_ON_PAYLOAD) and both `begin:` forms, and
  `npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-repeat.js`
  (key `parses`) shows `use: melee-combat on giant-rat`, `use: island.melee-combat on island.giant-rat` and
  `use: entity.mirror.look on shelf` each reading as intended. Caveat filed as a finding: the same survey
  shows `use: a.b.melee-combat on giant-rat` reading as the dotted form, so the pass-1 repair swapped which
  shape is unaddressable rather than deciding between them.
- proof 15: met — Now watched. Re-run: `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations.json`
  name c15-holds (`holds: isPopulations` to `() => true`) is KILLED by fight.test.ts "refuses a shape that is
  not a deficit rather than misreading it at first use", which feeds five bad shapes plus a load through
  `loadSave` expecting `/save field populations/` — it SURVIVED at pass 1. SAVE_VERSION moves 7 to 8 and
  commit ae08d1b states it and why; the only state gained is `populations` (src/runtime/state.ts); `checkSave`
  validates it through the same SAVE_FIELDS table as every other field; `isPopulations`/`isDeficit` refuse a
  non-integer count, a negative one, a non-array `due` and more due times than copies down; faction masks are
  compiled, not stored, so they add no save field.
- proof 16: met — Re-run: `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-full-refactor-of-enemies-and-combat-pass2-mutations-b.json`
  name c16 is KILLED by src/runtime/integration.test.ts > tutorial-island content > test
  "tutorial-island.miki-route-full" passes, confirmed at its own file: dropping the counted list from
  `3 giant-rat` to `1 giant-rat` fails the shipped regression. `git diff --stat 86e16af..eb1e994 -- content/`
  prints nothing, so the repair commit regenerated no second fixture; the pass-1 reading of the content diff
  (entitytype and the resource handler removed, the action/event/faction/player entity and the counted list
  added, the route fighting through `use: melee-combat on giant-rat`, only `miki-route-end` regenerated)
  therefore still stands at this head.
- proof 17: met — Re-run: `git diff --stat 20a2557a2e8216fc07a51afe98e88280c204e504..eb1e9944082508f8ad26216b7686fced034098f6
  -- src/grammar/condition.ts src/grammar/tagClause.ts src/grammar/range.ts src/content/item.ts
  src/content/recipe.ts src/content/dropTable.ts src/content/skill.ts` prints nothing over the WHOLE range
  including the repair commit: all seven are untouched. The new grammar reuses them as they are — conditions
  through `condition.parse`, tag clauses through `tagClause`, ranges through `range` in an entity's `stats:`,
  and the chance wrappers through `resultList`, with `credit:` added inside the existing `wrapperAt` table
  rather than as a second spelling.
- proof 18: unmet — Re-run: `npm run tasks -- merge-ready` exits 1. tsc ok, npm test ok, layer-check ok, doctor ok
  (17 warnings, which that leg does not fail on), bytes ok, tree ok, base ok — and `audit-status FAIL exit=1`.
  Re-run `npm run audit-status`: "1 tracked file(s) belong to no system and are not declared unowned in
  docs/audits/systems.json: src/runtime/fight.test.ts". The repair commit added that file and did not add it
  to the manifest, which is the one condition the partition fails on and which CI runs on the ubuntu leg. This
  is a regression against the pass-1 head, where the same leg passed. The remaining two failing legs (spec and
  clauses, on the three open clause records) are what this pass is for; audit-status is not.
