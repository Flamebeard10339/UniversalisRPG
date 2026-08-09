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
