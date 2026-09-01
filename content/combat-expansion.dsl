# info combat-expansion
version: 1.0.0
pack: skills
dependencies: core

# stat max-rage
group: core.other

# stat rage-drain
base: -30
group: core.other

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

# passive goring-edge
berserker, physical, +3 attack

# passive bloodlust
berserker, speed, +3 attack-rate

# passive reckless
berserker, physical, +10% attack, -2 defense

# passive rising-fury
title: Rising Fury
berserker, physical, +20 max-rage, +2% attack per rage

on hit: restore: 3 rage

# passive spurred
berserker, speed

on hit:
  1 in 4: inflict: accelerated-vigor on me

# passive quickening
berserker, speed, +3% attack-rate per stack of accelerated-vigor

# passive iron-carapace
juggernaut, armour, +4 defense

# passive immovable
juggernaut, life, +25 max-health

# passive slow-and-certain
juggernaut, armour, +3 defense, -2 attack-rate

# passive retribution
juggernaut, thorns

when hit: drain: 5 health from them

# passive wracking-blades
assassin, precision, +6 accuracy, +2 attack-rate

# passive silent-step
assassin, evasion, +12 evasion

# passive exposed-throat
assassin, precision, +10 accuracy, -1 attack

# passive envenom
assassin, poison

on hit: inflict: venom on them

# cluster-jewel blood-frenzy
title: Blood Frenzy
examine: It does not get tired. That is the problem with it.
shape: double-ring
open-connections: ne, e
passives:
  1 goring-edge
  2 bloodlust
  3 goring-edge
  4 core.flurry
  5 bloodlust
  6 core.swift-hands
  7 goring-edge
  10 core.flurry

# cluster-jewel wrath
title: Wrath
examine: Every blow lands harder than the one before it.
shape: wheel
open-connections: e
passives: 1 reckless, 2 quickening, 3 core.frenzied, 4 reckless, 5 spurred, 6 core.brutal, 7 rising-fury

# cluster-jewel iron-bulwark
title: Iron Bulwark
examine: Banding over banding, until the shape stops mattering.
shape: double-ring
open-connections: e, sw
passives:
  1 core.warded
  2 iron-carapace
  3 immovable
  4 core.plated
  5 immovable
  6 iron-carapace
  7 slow-and-certain
  10 core.constitution

# cluster-jewel retribution
title: Retribution
examine: Striking it is its own punishment.
shape: ring
open-connections: ne, se
passives: 1 core.warded, 2 core.hardened, 3 core.tempered-frame, 4 retribution, 5 core.hardened, 6 core.tempered-frame

# cluster-jewel wracking-blades
title: Wracking Blades
examine: Fast, accurate, and not interested in a long fight.
shape: ring
open-connections: e, ne
passives: 1 core.keen-eye, 2 wracking-blades, 3 silent-step, 4 core.marksman, 5 exposed-throat, 6 core.quickstep

# cluster-jewel creeping-rot
title: Creeping Rot
examine: The cut is the smallest part of it.
shape: wheel
open-connections: se
passives: 1 core.keen-eye, 3 core.deadly-precision, 5 core.evasive, 7 envenom

# item blood-frenzy-jewel
examine: A dark red disc, and it is warm.
cluster-jewel: blood-frenzy

# item wrath-jewel
cluster-jewel: wrath

# item iron-bulwark-jewel
cluster-jewel: iron-bulwark

# item retribution-jewel
cluster-jewel: retribution

# item wracking-blades-jewel
cluster-jewel: wracking-blades

# item creeping-rot-jewel
cluster-jewel: creeping-rot

# item proving-blade
title: Proving Blade
examine: Unlovely, well balanced, and it has never been anywhere.
slot: mainhand
value: 20
weapon, +2 attack
item-level: 6-10

# droptable archetype-cache
give: 1 proving-blade
give: 1 blood-frenzy-jewel
give: 1 wrath-jewel
give: 1 iron-bulwark-jewel
give: 1 retribution-jewel
give: 1 wracking-blades-jewel
give: 1 creeping-rot-jewel

# item vigor-tally
DEBUG
slot: offhand
item-level: 2-5
+1 evasion per stack of accelerated-vigor

