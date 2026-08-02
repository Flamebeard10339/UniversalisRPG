# combat-continuation-runtime

## Deliverable

Combat continuation has one runtime model for action completion and combat damage. Authored
`action.health` and saved `ActiveAction.healthRemaining` are removed from the live model; ordinary
action completion, entity combat, enemy regeneration, equipment stat bonuses, and modifier-driven
pool exhaustion all resolve through the same target-pool machinery and remain split-associative.
This branch also closes the runtime audit's integer-cursor gap for `rng`.

Proof:

- [c1] Loading or serializing game content no longer accepts or emits action `health:` fields, and no
  current `ActiveAction` value or current save produced by the runtime contains `healthRemaining`.
  Existing saves that carry `healthRemaining` are handled through the existing save/load path for
  this schema change, without adding a second persistence API.
- [c2] A regression test demonstrates that the former action-health completion case and an explicit
  `target: health` case consume the same authored `ability:` value at the same scale. The audit's
  `ability: 2.5` reproduction no longer has a 2.5-vs-2.0 damage split between runtime paths.
- [c3] Enemy-owned pools participate in rate capture and settlement while a fight is active. A
  regenerating enemy health pool produces the same result for one-shot resolution and split
  resolution, including the carried remainder, once it is off its ceiling. A pool saturated in its
  rate's direction is split-dependent — settling it clamps the rate away and drops the carried
  remainder — and a foe enters an encounter at full, so the claim holds from the first hit rather
  than from the first instant. The limitation is the player's too, it is recorded on `resolve`, and
  closing it is `saturated-pool-rate-associativity`, not this branch.
- [c4] Equipment is a real equipped state, not a property of carrying an item. An item declares the slot
  it occupies the way a recipe declares its station; the player's equipped items are one item per
  slot, held in game state, saved, and pruned when the item or its slot declaration goes away.
  Equipping and unequipping are reachable through the same directive surface every other play input
  goes through, so a `# test` section can record them.
- [c5] Equipment stat bonuses affect runtime combat stats. A focused fixture proves an equipped attack
  bonus changes outgoing damage and an equipped defense bonus changes incoming damage; shipped
  tutorial equipment is not inert once equipped, and is inert while merely carried.
- [c6] When a fight target pool is emptied by a modifier or rate settlement rather than by the hit that
  opened the segment, the same `on empty:` behavior fires at the correct boundary and remains
  associative across split resolution.
- [c7] Save validation requires `rng` to be an integer cursor. A fractional saved `rng` is rejected or
  pruned before `nextRandom` can truncate it, and a regression test covers the audit's `rng: 0.5`
  collapse.
- [c8] `npm test`, `npm run build`, `npm run layer-check`, and
  `npm run tasks -- check --merge --spec combat-continuation-runtime` pass before the spec is
  marked done.

## Decisions

- This branch claims only the runtime combat-continuation slice named by its member tasks. It does
  not claim the general `save-migration-system` task, but it must still make this branch's
  `healthRemaining` save-shape change safe through the existing local-universe save/load API.
- Game content changes, if any, stay in `.dsl` files under `content/`; runtime TypeScript must not
  hard-code combat content or tutorial equipment.
- `combat-post-chunk7-gaps` names equipment only as "inert". Making it non-inert by treating a
  carried item as equipped was rejected: it makes three swords worth +6 attack and gives content no
  way to say a bonus is passive gear. The branch takes the equipped-state answer instead, and the
  slot vocabulary is authored on `# item` the way `station:`/`stations:` already pairs a recipe with
  a capability — no new section, no new namespace kind.
- Enemy-owned pools settle through `settlePools` like the player's, which means the segment's
  pending-damage map is keyed by actor as well as resource. A non-player actor still never runs
  `on empty:`/`on full:`; those are authored in the player's voice.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-01

- base: `e53e5ad7579c37b4671d252667610780f44db3e0`
- head: `1765d0a776477dbabd18ca97506e752ed2031cdb`
- proof 1: met — health: is gone from ACTION_FIELDS and the Action type, from both serialize.ts emitters and from registry.ts/actions.ts; parse.test.ts pins the rejection on `unrecognized tag clause`. healthRemaining is implicitTarget. SAVE_VERSION 6 rejects v5 through the existing checkSave, no second API.
- proof 2: met — contest.test.ts measures per-attempt spend on both paths at ability 2.5 and 0.4. Pass 2 mutation-verified: reintroducing the truncating hitDamage fails it at both values.
- proof 3: met — enemy-pool.test.ts pins level 36516 and a non-zero carried remainder over 25 random splits. Clause amended 2026-08-01 to hold from the first hit rather than the first instant; the ceiling case is filed as saturated-pool-rate-associativity.
- proof 4: met — equipment.test.ts loads content/tutorial-island.dsl itself and proves outgoing damage, incoming damage through a retaliation, and carried-is-inert controls on each. save.test.ts covers the equipped field rule and both prune branches. A # test section records equip:/unequip: and replays green. Pass 2 mutation-verified: changing the shipped +2 attack or slot: fails it.
- proof 5: met — Same fixtures; the carried control is asserted on both the attack and defense halves, captured before the inventory write.
- proof 6: met — enemy-pool.test.ts proves the drain case fires at the instant rather than at segEnd — 3 completions against the ~9 a segment-granular fire banks. Scoped to the per-attempt path; the deterministic batch path is filed as deterministic-on-empty-granularity and named on resolve().
- proof 7: met — save.ts rng is isInteger beside time and both pool records; save.test.ts rejects rng 0.5 through both loadSave and compareSave.
- proof 8: met — 752 tests in 42 files, tsc --noEmit clean, layer-check 469 imports all downward, vite build clean.
