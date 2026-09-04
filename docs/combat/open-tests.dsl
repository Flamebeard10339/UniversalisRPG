# info combat-open-tests
version: 1.0.0
pack: combat-open-tests
dependencies:
  core
  tulsa

# damage-type fire

# stat fire-damage
group: core.combat
deals: fire

# stat fire-resistance
group: core.combat
resists: fire

# item fireproof
title: Fireproof
examine: A coat of clay, still damp.
+75 fire-resistance, 10m

# entity ember
title: The Ember
examine: A coal the size of a dog, and it is looking at you.
faction: core.world
stats: attack 0, fire-damage 40, defense 0, max-health 1000, attack-rate 60, accuracy 100000, evasion 0
uses: core.melee-combat

# entity brazier
title: The Brazier
examine: Clay in a bucket beside a fire.
faction: core.world
daub with clay:
  instant
  inflict: fireproof

# location ember-pit
title: The Ember Pit
x: 40, y: 40
entities: ember, brazier

# save bare-in-the-pit
{"version":13,"location":"combat-open-tests.ember-pit"}

# test a-dealt-type-lands-and-a-resistance-takes-its-share
load: bare-in-the-pit
unkillable
use: core.melee-combat on ember
wait: 2
assert: resource.core.health < 3
load: bare-in-the-pit
unkillable
use: entity.combat-open-tests.brazier.daub-with-clay
use: core.melee-combat on ember
wait: 2
assert: resource.core.health > 5
