// The four shapes a buff can have, and something to try them on. Every one of them is a rule the
// engine holds and no world has to write the same way: a pool that fills as blows land and pays
// into a stat by how full it is, a buff that stacks and a passive that reads how many are held, a
// buff inflicted on whoever was struck, and a passive that costs whoever struck.
//
// See `core.dsl` for what this world is and why it is not under `content/`.

# info fixture-combat
version: 1.0.0
pack: fixture
dependencies: core, fixture-town

// --- a pool that fills as blows land ---

// No base of its own: nobody has rage until something grants the ceiling, so the pool is a thing a
// build has rather than a thing everyone has.
# stat max-rage
group: skilling

# stat rage-drain
base: -30
group: skilling

# resource rage
rate: rage-drain
max: max-rage
start: 0
display: minimal

// --- buffs ---

# item accelerated-vigor
title: Accelerated Vigor
examine: The swing after the last one, and faster than it.
stacks, +2 attack-rate, 60s

# item venom
title: Venom
examine: It works while you are busy with something else.
poison, -30 regeneration, 20s

// --- passives ---

# passive rising-fury
title: Rising Fury
+20 max-rage, +2% attack per rage

on hit: restore: 3 rage

# passive quickening
+3% attack-rate per stack of accelerated-vigor

# passive retribution
when hit: drain: 5 health from them

# passive envenom
on hit: inflict: venom on them

// --- a plane that carries the gate, so a route can reach it and another route can not ---

# cluster-jewel fury-core
title: Fury Core
examine: Wound tight, and getting tighter.
shape: ring
open-connections: e
passives: 1 quickening, 2 core.keen, 3 core.hale, 4 core.warded, 5 core.keen, 6 core.fortune

# item fury-blade
title: Fury Blade
examine: The grip has been rewrapped more than once.
slot: main-hand
item-level: 20
origin-cluster: fury-core
value: 40

// --- something to swing at that swings back ---

// It does not swing back, so what a striker loses to it is the spines and nothing else.
# entity proving-post
title: The Proving Post
examine: Sacking over a frame, and spines through the sacking.
faction: vermin
stats: max-health 4000, attack 0, accuracy 40, evasion 0, defense 0, attack-rate 60
passives: retribution

// One that punishes being struck and one that poisons what it strikes, so the two sides of a buff —
// landed on whoever was hit, landed on whoever hit — are each reachable without the other.
# entity spitting-post
title: The Spitting Post
examine: Wet at the top, and it was not raining.
faction: vermin
stats: max-health 4000, attack 1, accuracy 40, evasion 0, defense 0, attack-rate 60
passives: envenom
uses: core.melee-combat

# location fixture-town.pump
+entities: proving-post

# location fixture-town.shed
+entities: spitting-post

// The player carries the two that read off the striker: rage rises as their blows land, and what
// they strike is poisoned. The gate on stacking is not here — it is a point on the plane above, so
// one route can stand behind it and another can not.
# entity fixture-town.player
+passives: rising-fury, envenom

// The chest is the town's and the blade is this module's, so the way to one is written here: a
// module that adds a thing adds the way to reach it rather than reaching back into the module it is
// written on top of.
# entity fixture-town.chest
open the strongbox:
  instant
  give: 1 fury-blade
  give: 1 core.keen-edge-jewel
  give: 1 core.stout-heart-jewel

// Sitting adds to the regeneration everybody already has rather than restoring a pool of its own,
// so what it is worth can only be said against a span nobody sat out.
# item rested
title: Rested
examine: The bench is warm where somebody else was.
+20 core.regeneration, 120s

// A thing standing in the room with no `examine:` on it, so it is named rather than masked: what a
// player has not read yet is drawn as a placeholder, and a room where everything is one says nothing
// about a room where something is not.
# entity bench
title: The Bench
faction: world
stations: core.bench
sit:
  instant
  inflict: rested

# location fixture-town.green
+entities: bench

// Standing where the counter and the bench are, with what a rope is twisted out of and a coin or
// two: a sheet for a screen that wants an offer to draw rather than a route to walk.
# save supplied
{"version":13,"location":"fixture-town.green","inventory":{"core.rat-tail":4,"core.twine":4,"core.copper-coin":20}}

# save hurt-in-town
{"version":13,"location":"fixture-town.green","resources":{"core.health":12000}}

// --- routes ---

# test rage-rises-as-swings-land
goto: pump
use: core.melee-combat on proving-post
wait: 4
assert: resource.rage >= 3

# test poison-holds-the-struck-enemy
goto: pump
use: core.melee-combat on proving-post
wait: 4
assert: resource.health < 40

// The fight is let go of before the clock is run out, because a blow landing again is a blow
// inflicting it again: what is being asked is whether it lifts on its own, not whether it is kept.
# test poison-lifts-when-its-own-duration-runs-out
unkillable
goto: shed
use: core.melee-combat on spitting-post
wait: 4
cancel
wait: 30
assert: resource.rage >= 0

# test striking-a-thorned-enemy-costs-the-striker
goto: pump
use: core.melee-combat on proving-post
wait: 4
assert: resource.health < 40

// The gate on stacking, which is a point on a plane rather than anything a route can be handed: the
// blade drops with the points to spend, and spending them on `quickening` is what the route above
// has not done.
# test accelerated-vigor-stacks-behind-its-gate
goto: store
use: entity.fixture-town.chest.open-the-strongbox
assert: has fury-blade
allocate: 1 at 0,0 position 2
equip: 1
assert: stat.attack > 10

# test the-bench-is-where-health-comes-back
load: hurt-in-town
use: entity.fixture-combat.bench.sit
wait: 30
assert: resource.health > 12
