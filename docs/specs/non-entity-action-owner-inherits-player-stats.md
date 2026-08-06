# non-entity-action-owner-inherits-player-stats

## Deliverable

`statRange` resolves a stat as `registry.entities.get(actorId)?.stats[statId] ?? registry.stats.get(statId)?.base`. That
fallthrough is deliberate and load-bearing: the player has no `# entity` of their own, so the global
`# stat` bases *are* the player's sheet, and `content/tutorial-island.dsl` says so where the bases
are authored. The defect is that anything else with no entity gets the same sheet by accident.

Measured on this branch: an item carrying a `target: health` action enters the encounter with
`health: 30000` — the global `max-health` base of 30, the player's own number — while an entity
declaring `stats: max-health 8` enters with `8000`. A lockpick is fought as the player's twin.
Nothing announces it, because from `statRange`'s side nothing went wrong.

This branch closes both ways in. A `target:` action may only be owned by an entity, because an item
or a location has nowhere to put a stat sheet and adding one to those schemas would be inventing a
mechanism for a use case no content has. And an entity that *is* fought over must declare the pool it
is fought over, so that an entity cannot inherit the player's number by omission either. Both are
load errors. Neither costs an edit to shipped content: no non-entity owns a `target:` action anywhere,
and `giant-rat`, the one entity that does, already declares `max-health 20`.

| what the content says                                              | today                                              | after |
| ------------------------------------------------------------------ | -------------------------------------------------- | ----- |
| `# entity rat`, `stats: max-health 20`, a `target: health` action    | rat enters the fight with `20000`                   | unchanged |
| `# entity rat` with a `target: health` action naming no `max-health` | loads; rat enters with the global `30000`           | load error |
| `# item lockpick` with a `target: health` action                     | loads; lockpick enters with the global `30000`      | load error |
| `# location hall` with a `target:` action                            | loads, on the same fallthrough                      | load error |
| `# entitytype melee-foe` carrying `target:` and declaring no `stats:` | loads; it is a template, never an actor             | unchanged — **not** a load error |
| a `retaliates` action with `target: health`                          | drains the player's pool, read from the global base | unchanged |
| an entity action with no `target:`                                   | no encounter, no actor, no stat sheet needed        | unchanged |

Two rows are deliberate. A `retaliates` action's target names the player, whose sheet is the global
bases by design, so it is the one place the fallthrough is the mechanism rather than an accident. And
an entitytype is a template, not an actor — `findActionOwner` has no case for one, and `melee-foe`
carries both `target:` clauses in shipped content while declaring no stats at all. The check runs on
the merged entity, which is where a sheet can exist and where `giant-rat` supplies one. Running it on
templates instead would redden the tutorial on the first load.

Proof:

- [c1] A `target:` action may only be owned by an entity. An item, location, recipe or travel owner
  carrying one is a load error that names the owner and the action, rather than a silent actor
  wearing the player's stats.
  proof: vitest src/content/references.test.ts
- [c2] An entity that is fought over declares the pool it is fought over. For each of its actions
  that carries `target:` and does not retaliate, the entity's `stats:` must name the stat that the
  targeted resource's `max:` reads; omitting it is a load error rather than a silent 30. The check
  reads the merged entity and never a `# entitytype`: a template is not an actor, and `melee-foe`
  carries both `target:` clauses in shipped content while declaring no stats at all.
  proof: vitest src/content/references.test.ts
- [c3] The player's sheet is untouched and still the global bases. A retaliating action's target
  still reads the player's pool from `# stat`, no stat lookup changes, and no runtime fallthrough is
  removed — this branch adds load-time checks and changes no resolution.
  proof: vitest src/runtime/stat.test.ts
- [c4] Shipped content is not edited to satisfy this. Every authored file is byte-identical and the
  whole suite passes, which is what makes the two rules a description of what content already does
  rather than a migration.
  proof: npm test
- [c5] The check adds no dependency from content on runtime. `retaliates` is a grammar flag and a
  resource's `max:` names a stat, so which side of a fight reads which clause — the rule that lives
  in `runtime/encounter.ts` — is not needed and is not duplicated in the load path.
  proof: npm run layer-check

## Decisions

- **Ban rather than extend.** The alternative was adding `stats:` to the item and location schemas so
  a non-entity owner could declare a sheet. Nothing in shipped content owns a `target:` action from a
  non-entity, so that would be building a mechanism for a use case that does not exist, and the
  weaker form of it — require *a* `stats:` block, let unnamed stats fall through — would accept
  `stats: defense 0` while max-health silently stayed at the player's 30. If a breakable item is
  wanted later, the answer is an entity, or adding stats then, deliberately and with a case to point
  at.
- **The fallthrough stays; only its accidental users go.** `statRange`'s `?? registry.stats.get(statId)?.base`
  is how the player works at all, and removing it would break the player before it fixed anything.
  What this branch removes is every route by which something that is not the player reaches it
  without saying so.
- **The rule is about actors, not about "entities that are not the player".** Phrasing it that way
  would bake in the very special case that `result-application-seam` and `buffs-generalized` exist to
  remove. Stated as "whatever is fought over declares the pool it is fought over", the rule already
  covers the player on the day the player becomes an entity, and that day changes where the player's
  sheet is stored rather than whether it has one.
- **Making the player an entity is the right direction and is not this branch.** It would delete
  `statRange`'s `if (actorId === PLAYER)` gate on buffs, tags and equipment, and `participants`'s
  PLAYER case, and this branch's rule would need no commentary about the player at all. It would not
  fix the asymmetry underneath, which is lifecycle rather than identity: the player's pools persist
  and an encounter actor's vanish with the fight, and `resources`, `activeBuffs`, `equipped` and `xp`
  are `GameState` fields either way. Three specced branches already walk that road —
  `result-application-seam` exists precisely because `applyResults` hardcodes `PLAYER`,
  `buffs-generalized` holds buffs per actor, `combat-events` follows both — and its own spec warns
  against a seam smuggled into a consumer. So: not here, and nothing here written to make it harder.
- **Load time, not runtime, and no second guard.** The evidence asked for a load error and that is
  where an authoring mistake belongs. A runtime guard in `statRange` would be a second gate for a
  case the load check and `loadSave`'s existing actor validation already close on every route an
  actor id arrives by; the repository's standing rule is that a gate earns its place by preventing
  something that happened.
- **A template is not an actor, and the check must not treat it as one.** `target:` is authored on
  `# entitytype melee-foe`, which is the point of it — "all monsters hit the player" is written once
  — and that template declares no stats, because its own comment says "a foe naming this supplies its
  own stat sheet." So the rule is enforced on the merged entity, where a sheet can exist, and the
  template is left alone. Checking sections as authored rather than as merged would fail the tutorial
  on its first load. The template's comment is the contract; c2 is that contract enforced.
- **This branch is a ban, which is the cheapest thing to carry through a redesign.** Whether an
  action stays owned by an entity at all is under discussion, and if actions are divorced from
  entities these two rules lose their subject. That is an argument for landing them, not against: a
  ban adds no mechanism and removes authorable cases, so it shrinks the surface any successor has to
  keep working. Nothing here is a foundation anything else would build on.
- **Both checks live where the action table is already validated.** `validateActionTable` runs from
  the `CONTENT_SECTION_MAPS` loop with the kind, the id and the section's own value in hand, which is
  everything both rules need. Adding a third traversal of every section to ask a fourth question
  about actions would be a parallel structure to keep in step with that one.

## Open questions

- Whether `target:` on a `# recipe` or a `travel` action is reachable at all is left to the slice.
  Both are synthetic owners built by `findActionOwner`, so the rule covers them by construction, but
  whether an author can even write one decides if the error is reachable or merely total.
