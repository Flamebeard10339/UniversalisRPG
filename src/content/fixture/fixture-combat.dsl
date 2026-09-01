# info fixture-combat
version: 1.0.0
pack: fixture
dependencies: core, fixture-town

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

# item accelerated-vigor
title: Accelerated Vigor
examine: The swing after the last one, and faster than it.
stacks, +2 attack-rate, 60s

# item venom
title: Venom
examine: It works while you are busy with something else.
poison, -30 regeneration, 20s

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

# entity proving-post
title: The Proving Post
examine: Sacking over a frame, and spines through the sacking.
faction: vermin
stats: max-health 4000, attack 0, accuracy 40, evasion 0, defense 0, attack-rate 60
passives: retribution

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

# entity fixture-town.player
+passives: rising-fury, envenom

# entity fixture-town.chest
open the strongbox:
  instant
  give: 1 fury-blade
  give: 1 core.keen-edge-jewel
  give: 1 core.stout-heart-jewel

# item rested
title: Rested
examine: The bench is warm where somebody else was.
+20 core.regeneration, 120s

# entity bench
title: The Bench
faction: world
stations: core.bench
sit:
  instant
  inflict: rested

# location fixture-town.green
+entities: bench

# save supplied
{"version":13,"location":"fixture-town.green","inventory":{"core.rat-tail":4,"core.twine":4,"core.copper-coin":20}}

# save hurt-in-town
{"version":13,"location":"fixture-town.green","resources":{"core.health":12000}}

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
