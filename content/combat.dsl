# info combat
version: 1.0.0
pack: skills
dependencies:
  core
  cooking
  crafting
  smithing
  ? tulsa

# event damage-dealt
trigger: damage-dealt

# event damage-taken
resource: core.health
trigger: damage-taken

# skill attack
title: Attack
stat: core.attack
gain 0.1 * amount experience on damage-dealt

# skill health
title: Health
stat: core.max-health
gain 6 * amount experience on damage-taken

# droptable chicken-remains
give: 1 raw-chicken
give: 3-8 feather

# droptable cow-remains
give: 1-2 raw-beef
1 in 2: give: 1 cowhide

# droptable wolf-remains
give: 1 wolf-pelt
1 in 3: give: 4-11 coin
1 in 40: give: 1 combat.keen-edge-jewel

# droptable purse
one of:
  5x: give: 2-6 coin
  3x: give: 7-15 coin
  1x: give: 20-40 coin

# droptable highwaymans-keepsake
1 in 30: give: 1 combat.stout-heart-jewel

# droptable knights-purse
give: 15-30 coin
1 in 4: give: 1 core.rats-eye-gem

# droptable archetype-cache
give: 1 proving-blade
give: 1 blood-frenzy-jewel
give: 1 wrath-jewel
give: 1 iron-bulwark-jewel
give: 1 retribution-jewel
give: 1 wracking-blades-jewel
give: 1 creeping-rot-jewel

# droptable smiths-cache
give: 1 heartwood-blade
give: 1 iron-sword
give: 1 keen-edge-jewel
give: 1 stout-heart-jewel
give: 1 tempered-will-jewel
give: 1 great-work-jewel
give: 1 causeway-jewel
give: 1 crossroads-jewel
give: 1 orb-of-vitality
give: 2 orb-of-the-edge
give: 1 lesser-orb-of-the-edge
give: 1 orb-of-the-bulwark
give: 1 orb-of-renewal

# droptable feral-rat-remains
give: 1-2 rat-pelt
1 in 3: give: 1-4 coin
1 in 90: give: 1 combat.lesser-orb-of-the-edge

# droptable ratman-remains
give: 1 rat-pelt
give: 3-8 coin

# droptable swamp-pickings
one of:
  6x: nothing
  3x: give: 1 mollusk-venom
  1x: give: 1-3 coin

# item bronze-dagger
title: Bronze Dagger
examine: Short, soft, and better than your hands.
slot: mainhand
value: 30
item-level: 2-5
weapon, +5 core.attack

# item bronze-helmet
title: Bronze Helmet
examine: A plain cap of hammered bronze, dented over the left ear by somebody else's evening.
slot: head
value: 26
item-level: 2-4
armour, +2 core.defense, +3 core.max-health

# item bronze-platebody
title: Bronze Platebody
examine: Front and back plate, laced at the sides. Heavier than it looks and quieter than you want.
slot: body
value: 44
item-level: 3-6
armour, +4 core.defense, +1 core.max-health

# item bronze-platelegs
title: Bronze Platelegs
examine: Skirted plate to the knee. Walking in them is a skill nobody warns you about.
slot: legs
value: 38
item-level: 2-5
armour, +3 core.defense, +2 core.max-health

# item bronze-boots
title: Bronze Boots
examine: Plate over the shin and the foot, and they are the loudest thing anybody wears.
slot: boots
value: 24
item-level: 2-4
armour, +2 core.defense, +1 core.max-health

# item bronze-shield
title: Bronze Shield
examine: A round of bronze over a board, with a boss in the middle you are meant to punch things with.
slot: offhand
value: 32
item-level: 2-4
shield, +3 core.defense, +1 core.max-health

# item bronze-sword
title: Bronze Sword
examine: A hand and a half of bronze with a real crossguard, and it is the first thing you have held that was made for this and nothing else.
slot: mainhand
requires: level.attack >= 5
value: 70
item-level: 4-7
weapon, +8 core.attack

# item iron-dagger
title: Iron Dagger
examine: Grey steel with a proper edge on it, and no decoration at all.
slot: mainhand
requires: level.attack >= 10
value: 90
item-level: 5-9
weapon, +10 core.attack

# item iron-helmet
title: Iron Helmet
examine: A full helm with a slot to see out of, and not much of one.
slot: head
requires: level.attack >= 10 and level.health >= 10
value: 80
item-level: 4-8
armour, +4 core.defense, +6 core.max-health

# item iron-platebody
title: Iron Platebody
examine: Riveted plate over a padded coat. You feel the weight of it in your knees by evening.
slot: body
requires: level.attack >= 10 and level.health >= 10
value: 130
item-level: 6-11
armour, +7 core.defense, +3 core.max-health

# item iron-platelegs
title: Iron Platelegs
examine: Iron to the shin, hinged at the knee by somebody who had thought about knees.
slot: legs
requires: level.attack >= 10 and level.health >= 10
value: 110
item-level: 5-9
armour, +6 core.defense, +4 core.max-health

# item iron-boots
title: Iron Boots
examine: Sabatons, jointed over the instep, and you hear yourself arrive everywhere for the rest of your life.
slot: boots
requires: level.attack >= 10 and level.health >= 10
value: 70
item-level: 4-8
armour, +4 core.defense, +2 core.max-health

# item iron-shield
title: Iron Shield
examine: A kite of iron over ash, tall enough to put a shoulder behind and heavy enough that you only do it once a fight.
slot: offhand
requires: level.attack >= 10 and level.health >= 10
value: 95
item-level: 4-8
shield, +6 core.defense, +2 core.max-health

# item knights-sword
title: Knight's Sword
examine: A long blade with a fuller down the middle and somebody's initials filed off the tang. It was made for a knight and it was not made for you.
slot: mainhand
requires: level.attack >= 20
value: 400
item-level: 9-15
weapon, +18 core.attack

# item accelerated-vigor
title: Accelerated Vigor
examine: The swing after the last one, and faster than it.
stacks, +2 attack-rate, 60s

# item venom
title: Venom
examine: It works while you are busy with something else.
poison, -30 regeneration, 20s

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

# item vigor-tally
DEBUG
slot: offhand
item-level: 2-5
+1 evasion per stack of accelerated-vigor

# item keen-edge-jewel
examine: A closed ring of iron, warm to the touch.
cluster-jewel: keen-edge

# item stout-heart-jewel
cluster-jewel: stout-heart

# item tempered-will-jewel
cluster-jewel: tempered-will

# item great-work-jewel
cluster-jewel: great-work

# item causeway-jewel
cluster-jewel: causeway

# item crossroads-jewel
cluster-jewel: crossroads

# item orb-of-vitality
title: Orb of Vitality
examine: A dull red bead. It beats, very slowly. Nothing drinks it: an orb is spent on a cluster, and scales what that cluster already gives.
cluster-effect: +25% max-health

# item orb-of-the-edge
title: Orb of the Edge
examine: A sliver of something that was never blunt.
cluster-effect: +25% attack

# item lesser-orb-of-the-edge
title: Lesser Orb of the Edge
examine: The same sliver, ground down by whoever had it first.
cluster-effect: +10% attack

# item orb-of-the-bulwark
title: Orb of the Bulwark
examine: Heavier than the hand expects.
cluster-effect: +25% defense

# item orb-of-renewal
title: Orb of Renewal
examine: Cool, and faintly wet, and it does not dry. Nothing drinks it: an orb is spent on a cluster, and scales what that cluster already gives.
cluster-effect: +25% regeneration

# item heartwood-blade
examine: The grain still moves, slowly, when you are not looking.
slot: mainhand
value: 30
weapon, +4 attack
item-level: 12-18
origin-cluster: heartwood-core

# item cooked-chicken
title: Cooked Chicken
examine: Turned on the spit until the skin went the colour it is supposed to go.
value: 12
food, +6 core.regeneration, 90s
eat:
  instant
  take: 1 cooked-chicken
  say: You take it apart with your hands and there is nothing left of it a minute later.

# item cooked-beef
title: Cooked Beef
examine: A cut of it, seared outside and barely warm in the middle.
value: 22
food, +9 core.regeneration, 120s
eat:
  instant
  take: 1 cooked-beef
  say: You eat the beef standing up, which is a waste of good beef.

# entity chicken
title: Chicken
examine: It has decided you are a threat and it is not entirely wrong.
stats: attack 2, defense 0, max-health 8, attack-rate 20, accuracy 40, evasion 20
uses: core.melee-combat
faction: world
respawn after: 15s
on death:
  credit:
    roll: chicken-remains

# entity cow
title: Cow
examine: Enormous, patient, and standing exactly where it wants to be.
stats: attack 4, defense 2, max-health 40, attack-rate 12, accuracy 50, evasion 5
uses: core.melee-combat
faction: world
respawn after: 50s
on death:
  credit:
    roll: cow-remains

# entity wolf
title: Wolf
examine: Lean through the ribs and unhurried, which is worse.
stats: attack 14, defense 4, max-health 55, attack-rate 24, accuracy 85, evasion 45
uses: core.melee-combat
faction: world
aggressive
respawn after: 65s
on death:
  credit:
    roll: wolf-remains

# entity highwayman
title: Highwayman
examine: A man who has been waiting behind that rock since before you were on the road.
stats: attack 22, defense 10, max-health 90, attack-rate 22, accuracy 95, evasion 50
uses: core.melee-combat
faction: world
aggressive
respawn after: 70s
on death:
  credit:
    roll: purse
    roll: highwaymans-keepsake
    give: 5-12 coin
    1 in 12: give: 1 iron-dagger
    1 in 45: give: 1 combat.orb-of-the-edge

# entity feral-rat
title: Feral Rat
examine: A rat the size of a cat, hairless in patches and weeping where it is not.
stats: attack 9, defense 1, max-health 24, attack-rate 18, accuracy 65, evasion 35
uses: core.melee-combat
faction: world
aggressive
respawn after: 40s
on death:
  credit:
    roll: feral-rat-remains

# entity ratman
title: Ratman
examine: A man's frame, a rat's head, and the join between them done badly on purpose.
stats: attack 14, defense 4, max-health 60, attack-rate 20, accuracy 85, evasion 40
uses: core.melee-combat
faction: world
aggressive
respawn after: 10m
on death:
  credit:
    roll: ratman-remains

# entity ratkin-warrior
title: Ratkin Warrior
examine: A head taller than the ones in the sewer and put together properly, in scale somebody cut and fitted rather than found. It watches you the whole way in.
stats: attack 24, defense 12, max-health 115, attack-rate 14, accuracy 88, evasion 40
uses: core.melee-combat
faction: world
respawn after: 90s
on death:
  credit:
    roll: ratman-remains
    give: 8-20 core.coin
    1 in 20: give: 1 combat.iron-dagger
    1 in 25: give: 1 combat.orb-of-renewal

# entity swamp-mollusk
title: Swamp Mollusk
examine: A shell the size of a shield, and the foot under it is wet with something you would not touch.
stats: attack 11, defense 8, max-health 45, attack-rate 10, accuracy 60, evasion 5
uses: core.melee-combat
faction: world
respawn after: 5m
on death:
  credit:
    give: 1 mollusk-venom
    1 in 10: give: 1 combat.orb-of-the-bulwark

# entity bog-lurker
title: Bog Lurker
examine: Something long standing very still in water that is not deep enough to hide it.
stats: attack 16, defense 3, max-health 50, attack-rate 22, accuracy 80, evasion 45
uses: core.melee-combat
faction: world
aggressive
respawn after: 5m
on death:
  credit:
    roll: swamp-pickings
    1 in 12: give: 1 combat.tempered-will-jewel

# entity armourers-chest
title: Armourer's Chest
examine: A long crate, stencilled, and nobody has come for it.
flags: emptied
open:
  instant
  hidden if: emptied
  roll: combat.archetype-cache
  set: emptied
  say: Six jewels and a plain blade with room in it for one of them.

# entity proving-post
title: Proving Post
examine: A banded post, chest high, and it has taken worse than you.
stats: max-health 2000, defense 0, evasion 0, accuracy 0

# entity spined-urchin
title: Spined Urchin
examine: A knot of black spines around something that has not moved in years.
stats: max-health 2000, defense 0, evasion 0, accuracy 0
passives: combat.retribution

# entity princess-bee
title: Princess Bee
examine: Half again the size of a drone and it does not buzz so much as hum, a note that sits wrong in your teeth.
stats: attack 10-14, defense 2, max-health 40, attack-rate 28, accuracy 75, evasion 55
uses: core.melee-combat
faction: world
aggressive
respawn after: 5m
on death:
  credit:
    give: 1 royal-jelly
    1 in 8: give: 1 combat.orb-of-vitality

# entity smiths-chest
DEBUG
flags: emptied
open:
  instant
  hidden if: emptied
  roll: smiths-cache
  set: emptied

# cluster-jewel blood-frenzy
title: Blood Frenzy
examine: It does not get tired. That is the problem with it.
shape: double-ring
open-connections: ne, e
passives:
  1 goring-edge
  2 bloodlust
  3 goring-edge
  4 combat.flurry
  5 bloodlust
  6 combat.swift-hands
  7 goring-edge
  10 combat.flurry

# cluster-jewel wrath
title: Wrath
examine: Every blow lands harder than the one before it.
shape: wheel
open-connections: e
passives: 1 reckless, 2 quickening, 3 combat.frenzied, 4 reckless, 5 spurred, 6 combat.brutal, 7 rising-fury

# cluster-jewel iron-bulwark
title: Iron Bulwark
examine: Banding over banding, until the shape stops mattering.
shape: double-ring
open-connections: e, sw
passives:
  1 combat.warded
  2 iron-carapace
  3 immovable
  4 combat.plated
  5 immovable
  6 iron-carapace
  7 slow-and-certain
  10 combat.constitution

# cluster-jewel retribution
title: Retribution
examine: Striking it is its own punishment.
shape: ring
open-connections: ne, se
passives: 1 combat.warded, 2 combat.hardened, 3 combat.tempered-frame, 4 retribution, 5 combat.hardened, 6 combat.tempered-frame

# cluster-jewel wracking-blades
title: Wracking Blades
examine: Fast, accurate, and not interested in a long fight.
shape: ring
open-connections: e, ne
passives: 1 combat.keen-eye, 2 wracking-blades, 3 silent-step, 4 combat.marksman, 5 exposed-throat, 6 combat.quickstep

# cluster-jewel creeping-rot
title: Creeping Rot
examine: The cut is the smallest part of it.
shape: wheel
open-connections: se
passives: 1 combat.keen-eye, 3 combat.deadly-precision, 5 combat.evasive, 7 envenom

# cluster-jewel keen-edge
examine: Six facets, each one sharpened against the last.
shape: ring
open-connections: e
passives: 1 whetted, 2 keen-eye, 3 honed, 4 brutal, 5 swift-hands, 6 whetted

# cluster-jewel stout-heart
examine: A knot of iron that will not be moved.
shape: ring
open-connections: ne, se
passives: 1 warded, 2 hale, 3 constitution, 5 hale, 6 mending

# cluster-jewel tempered-will
examine: It does not add. It insists.
shape: wheel
open-connections: e, se
passives: 1 hale, 2 tempered-frame, 3 brutal, 4 hardened, 5 tempered-frame, 6 brutal

# cluster-jewel great-work
examine: Twelve years of somebody's evenings, and they are not finished.
shape: double-ring
open-connections: e, sw
passives:
  1 warded
  2 plated
  3 constitution
  4 marksman
  5 hale
  6 honed
  10 flurry

# cluster-jewel causeway
examine: A road, and nothing on either side of it.
shape: spindle
open-connections: e
passives: 2 hale

# cluster-jewel crossroads
examine: A junction stone. It offers roads, not shelter.
shape: point
open-connections: ne, e, se, sw, nw

# cluster-jewel heartwood-core
shape: spindle
open-connections: e, ne
passives: 1 mending, 2 tempered-frame

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

# passive hale
life, +15 max-health

# passive constitution
life, +20 max-health

# passive tempered-frame
life, +12% max-health

# passive mending
life, recovery, +2 regeneration

# passive warded
armour, +2 defense

# passive plated
armour, +3 defense

# passive hardened
armour, +10% defense

# passive whetted
physical, +2 attack

# passive honed
physical, +3 attack

# passive brutal
physical, +8% attack

# passive swift-hands
speed, +2 attack-rate

# passive flurry
speed, +3 attack-rate

# passive frenzied
speed, +10% attack-rate

# passive keen-eye
precision, +4-8 accuracy

# passive marksman
precision, +8 accuracy

# passive deadly-precision
precision, +12% accuracy

# passive quickstep
evasion, +6-10 evasion

# passive evasive
evasion, +15% evasion

# resource rage
rate: rage-drain
max: max-rage
start: 0
display: minimal

# stat max-rage
group: core.other
hidden if: not changed.max-rage

# stat rage-drain
base: -30
group: core.other
hidden if: stat.max-rage <= 0

# save growing-a-heartwood-blade-start
{"version":13}

# save growing-a-heartwood-blade-end
{"version":13,"inventory":{"combat.stout-heart-jewel":1,"combat.tempered-will-jewel":1,"combat.great-work-jewel":1,"combat.orb-of-the-edge":1,"combat.orb-of-the-bulwark":1,"combat.orb-of-renewal":1},"flags":{"combat.smiths-chest.emptied":true},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"combat.heartwood-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":"combat.heartwood-core","entry":null,"roll":0.6093358164653182,"allocatedPositions":[2,3],"allocatedSlots":["ne","e"],"effects":["combat.orb-of-vitality"]},"1,-1":{"jewel":"combat.keen-edge","entry":"ne","roll":0.06484867143444717,"allocatedPositions":[1,2,3,4,5],"allocatedSlots":[],"effects":["combat.orb-of-the-edge","combat.lesser-orb-of-the-edge"]},"1,0":{"jewel":"combat.crossroads","entry":"e","roll":0.545911343768239,"allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat.causeway","entry":"e","roll":0.2666903811041266,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":1145426465}

# save growing-through-the-inventory-screen-end
{"version":13,"inventory":{"combat.stout-heart-jewel":1,"combat.tempered-will-jewel":1,"combat.great-work-jewel":1,"combat.causeway-jewel":1,"combat.orb-of-vitality":1,"combat.orb-of-the-edge":2,"combat.lesser-orb-of-the-edge":1,"combat.orb-of-the-bulwark":1,"combat.orb-of-renewal":1},"flags":{"combat.smiths-chest.emptied":true},"equipped":{"mainhand":"2"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"combat.heartwood-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":"combat.heartwood-core","entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat.crossroads","entry":"e","roll":0.06484867143444717,"allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]},"2,-1":{"jewel":"combat.keen-edge","entry":"ne","roll":0.545911343768239,"allocatedPositions":[1],"allocatedSlots":[],"effects":[]}}}}}},"rng":2344671368}

# save the-grown-blades-and-the-one-in-hand
over: growing-a-heartwood-blade-end, rage-rises-as-swings-land-end
{"version":13}

# save at-the-proving-ground
{"version":13,"location":"tulsa.proving-ground","flags":{"tulsa.proving-ground.discovered":true}}

# save at-the-proving-ground-with-a-tally
DEBUG
{"version":13,"location":"tulsa.proving-ground","flags":{"tulsa.proving-ground.discovered":true},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat.vigor-tally","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save rage-rises-as-swings-land-end
{"version":13,"inventory":{"combat.blood-frenzy-jewel":1,"combat.iron-bulwark-jewel":1,"combat.retribution-jewel":1,"combat.wracking-blades-jewel":1,"combat.creeping-rot-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"combat.armourers-chest.emptied":true},"xp":{"combat.attack":381},"resources":{"combat.rage":19800},"equipped":{"mainhand":"1"},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":1200,"attemptsMade":13,"span":2400}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat.proving-post"}},"actors":{"combat.proving-post":{"resources":{"core.health":1809706,"combat.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":32400,"rng":3953799810}

# save accelerated-vigor-stacks-behind-its-gate-end
{"version":13,"inventory":{"combat.blood-frenzy-jewel":1,"combat.iron-bulwark-jewel":1,"combat.retribution-jewel":1,"combat.wracking-blades-jewel":1,"combat.creeping-rot-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"combat.armourers-chest.emptied":true},"xp":{"combat.attack":39},"equipped":{"mainhand":"2","offhand":"1"},"buffs":{"player":[{"source":"combat.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":88800},{"source":"combat.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":97428},{"source":"combat.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":107183},{"source":"combat.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":112508},{"source":"combat.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":119000},{"source":"combat.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":121980}]},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":420,"attemptsMade":30,"span":1374}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat.proving-post"}},"actors":{"combat.proving-post":{"resources":{"core.health":1590538,"combat.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"combat.vigor-tally","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"combat.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,2,6,5],"allocatedSlots":[],"effects":[]}}}}}},"time":62400,"rng":829729617}

# save poison-holds-the-struck-enemy-end
{"version":13,"inventory":{"combat.blood-frenzy-jewel":1,"combat.wrath-jewel":1,"combat.iron-bulwark-jewel":1,"combat.retribution-jewel":1,"combat.wracking-blades-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"combat.armourers-chest.emptied":true},"xp":{"combat.attack":133},"resourceRateRemainders":{"core.health":40000},"equipped":{"mainhand":"1"},"buffs":{"combat.proving-post":[{"source":"combat.venom","tags":[{"kind":"keyword","value":"poison"},{"kind":"stat-bonus","statId":"core.regeneration","percent":false,"amount":{"min":-30,"max":-30}},{"kind":"duration","seconds":20}],"expiresAt":32000}]},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5,"span":2400}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat.proving-post"}},"actors":{"combat.proving-post":{"resources":{"core.health":1928692,"combat.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":40000}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":12400,"rng":2882385315}

# save poison-lifts-when-its-own-duration-runs-out-end
{"version":13,"inventory":{"combat.blood-frenzy-jewel":1,"combat.wrath-jewel":1,"combat.iron-bulwark-jewel":1,"combat.retribution-jewel":1,"combat.wracking-blades-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"combat.armourers-chest.emptied":true},"xp":{"combat.attack":133},"resourceRateRemainders":{"core.health":40000},"equipped":{"mainhand":"1"},"location":"tulsa.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":42400,"rng":2882385315}

# save striking-a-thorned-enemy-costs-the-striker-end
{"version":13,"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true},"xp":{"combat.attack":109},"resources":{"core.health":6516},"resourceRateRemainders":{"core.health":40000},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5,"span":2400}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat.spined-urchin"}},"actors":{"combat.spined-urchin":{"resources":{"core.health":1945968,"combat.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":40000}}}},"time":12400,"rng":1288631604}

# save at-aggies-stove-with-a-chicken
{"version":13,"location":"tulsa.aggies-house","inventory":{"cooking.raw-chicken":2}}

# test a-minute-at-the-post-trains-the-arm-and-not-the-hide
load: at-the-proving-ground
use: core.melee-combat on proving-post
wait: 60
assert: xp.combat.attack > 0
assert: xp.combat.health = 0

# test the-sewer-pays-a-beginner-in-both-halves-of-a-fight
load: at-the-sewer-junction
wait: 20
assert: xp.combat.attack > 0
assert: xp.combat.health > 0
assert: not core.fainted

# test a-feral-rat-picks-the-fight-itself
load: at-the-sewer-junction
wait: 10
assert: resource.core.health < 31.31
assert: not core.fainted

# test a-build-and-a-run-that-each-grew-something-keep-both
load: the-grown-blades-and-the-one-in-hand
unequip: mainhand
assert: inventory.combat.proving-blade = 1
assert: inventory.combat.heartwood-blade = 1
assert: inventory.core.iron-sword = 1

# test growing-a-heartwood-blade
DEBUG
load: growing-a-heartwood-blade-start
use: entity.smiths-chest.open
refuse: allocate heartwood-blade at 0,0 position 2
refuse: allocate 1 at 0,0 position 3
allocate: 1 at 0,0 position 2
allocate: 1 at 0,0 position 3
allocate: 1 at 0,0 slot ne
slot: 1 at 0,0 ne with keen-edge-jewel
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with crossroads-jewel
refuse: slot 1 at 0,0 e with causeway-jewel
refuse: allocate 1 at 0,0 position 2
allocate: 1 at 1,-1 position 1
allocate: 1 at 1,-1 position 2
allocate: 1 at 1,-1 position 3
allocate: 1 at 1,-1 position 4
allocate: 1 at 1,-1 position 5
allocate: 1 at 1,0 position 1
refuse: allocate 1 at 1,0 slot nw
refuse: slot 1 at 1,0 nw with causeway-jewel
allocate: 1 at 1,0 slot ne
apply: 1 at 1,-1 with orb-of-the-edge
apply: 1 at 1,-1 with lesser-orb-of-the-edge
refuse: apply 1 at 1,-1 with orb-of-the-edge
refuse: apply 1 at 1,-1 with orb-of-the-bulwark
apply: 1 at 0,0 with orb-of-vitality
allocate: 2 at 0,0 slot e
slot: 2 at 0,0 e with causeway-jewel
expect only: growing-a-heartwood-blade-end

# test growing-through-the-inventory-screen
DEBUG
load: growing-a-heartwood-blade-start
use: entity.smiths-chest.open
open-modal: carried-items
submit-modal: item=2
submit-modal: verb=grow
submit-modal: plane=allocate: slot e
submit-modal: plane=slot: e with combat.crossroads-jewel
submit-modal: plane=go: 1,0
submit-modal: plane=allocate: position 1
submit-modal: plane=allocate: slot ne
submit-modal: plane=slot: ne with combat.keen-edge-jewel
submit-modal: plane=go: 2,-1
submit-modal: plane=allocate: position 1
submit-modal: plane=back
submit-modal: verb=equip
open-modal: carried-items
submit-modal: item=close
assert: has combat.heartwood-blade
expect only: growing-through-the-inventory-screen-end

# test rage-rises-as-swings-land
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat.wrath-jewel
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: core.melee-combat on proving-post
wait: 30
assert: resource.combat.rage > 0
expect only: rage-rises-as-swings-land-end

# test accelerated-vigor-stacks-behind-its-gate
DEBUG
load: at-the-proving-ground-with-a-tally
use: entity.armourers-chest.open
allocate: 2 at 0,0 slot e
slot: 2 at 0,0 e with combat.wrath-jewel
allocate: 2 at 1,0 position 1
allocate: 2 at 1,0 position 2
allocate: 2 at 1,0 position 6
allocate: 2 at 1,0 position 5
equip: 2
equip: 1
use: core.melee-combat on proving-post
wait: 60
assert: stat.evasion > 0
expect only: accelerated-vigor-stacks-behind-its-gate-end

# test poison-holds-the-struck-enemy
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat.creeping-rot-jewel
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: core.melee-combat on proving-post
wait: 10
assert: stat.regeneration > 0
expect only: poison-holds-the-struck-enemy-end

# test poison-lifts-when-its-own-duration-runs-out
run: poison-holds-the-struck-enemy
cancel
wait: 30
expect: poison-lifts-when-its-own-duration-runs-out-end

# test striking-a-thorned-enemy-costs-the-striker
load: at-the-proving-ground
assert: not has combat.retribution-jewel
use: core.melee-combat on spined-urchin
wait: 10
expect only: striking-a-thorned-enemy-costs-the-striker-end

# test a-plane-unwinds-from-its-leaves-and-never-out-from-under-a-jewel
DEBUG
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat.wrath-jewel
refuse: unallocate 1 at 0,0 slot e
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 2
refuse: unallocate 1 at 1,0 position 1
unallocate: 1 at 1,0 position 2
unallocate: 1 at 1,0 position 1

# test a-cook-turns-raw-chicken-into-supper
succeed-checks
load: at-aggies-stove-with-a-chicken
craft: cooked-chicken
assert: has cooked-chicken
assert: inventory.cooking.raw-chicken = 1
use: item.cooked-chicken.eat
assert: not has cooked-chicken

# test a-burnt-dish-comes-off-the-stove-not-the-plate
fail-checks
load: at-aggies-stove-with-a-chicken
craft: cooked-chicken
assert: has burnt-food
assert: not has cooked-chicken

# entity tulsa.player
+skills: attack, health

# entity tulsa.civilian
on death:
  credit:
    roll: purse

# entity tulsa.guardsman
on death:
  credit:
    roll: purse
    1 in 8: give: 1 bronze-helmet

# entity tulsa.knight
on death:
  credit:
    roll: knights-purse
    1 in 10: give: 1 iron-helmet

# entity tulsa.sewer-shelf
look under the cloth:
  time: 6
  hidden if: emptied
  set: emptied
  give: 1 great-work-jewel
  say: Under the cloth is a disc of iron the size of a saucer, cut through in twelve places and filed at every one of them, and half the filing is fresher than the other half. Whoever kept this room was years into it and had not finished.

# location tulsa.pasture
+entities: 4 cow, 6 chicken

# location tulsa.north-road
+entities: 4 highwayman

# location tulsa.pinewood
+entities: 5 wolf

# location tulsa.tunnels
+entities: 6 feral-rat

# location tulsa.the-muster
+entities: 6 ratkin-warrior

# location tulsa.swamp-mire
+entities: 3 swamp-mollusk, 2 bog-lurker

# location tulsa.sewer-junction
+entities: 6 feral-rat

# location tulsa.sewer-outfall
+entities: 2 feral-rat

# location tulsa.sewer-locked-room
+entities: 2 ratman

# location tulsa.apiary-field
+entities: princess-bee

# location tulsa.proving-ground
+entities: armourers-chest, proving-post, spined-urchin

# recipe bronze-dagger
station: anvil
in: 1 bronze-bar, 1 hammer
out: 1 combat.bronze-dagger, 1 hammer
skill: smithing 20
rate: smithing
say: You draw the bar out to a point and put an edge on both sides of it.

# recipe bronze-helmet
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-helmet, 1 hammer
skill: smithing 25
rate: smithing
say: You raise the bowl of it out of one piece, which is the part that takes the practice.

# recipe bronze-platelegs
station: anvil
in: 3 bronze-bar, 1 hammer
out: 1 combat.bronze-platelegs, 1 hammer
skill: smithing 40
rate: smithing
say: Plate, skirt and hinge, and the hinge is the half of it that matters.

# recipe bronze-platebody
station: anvil
in: 4 bronze-bar, 1 hammer
out: 1 combat.bronze-platebody, 1 hammer
skill: smithing 45
rate: smithing
say: Front and back, laced at the sides, and it takes the whole afternoon.

# recipe bronze-boots
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-boots, 1 hammer
skill: smithing 25
rate: smithing
say: Two shells and a hinge across the instep, and the hinge is the only part anybody notices.

# recipe bronze-shield
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-shield, 1 hammer
skill: smithing 28
rate: smithing
say: You raise the boss out of the middle of it first and work the rest of it flat around that.

# recipe bronze-sword
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-sword, 1 hammer
skill: smithing 32
rate: smithing
say: A blade, a tang and a guard, and the guard is what makes it a sword rather than a long knife.

# recipe iron-dagger
station: anvil
in: 1 iron-bar, 1 hammer
out: 1 combat.iron-dagger, 1 hammer
skill: smithing 50
rate: smithing
say: The iron argues the whole way and gives you a better blade for it.

# recipe iron-helmet
station: anvil
in: 2 iron-bar, 1 hammer
out: 1 combat.iron-helmet, 1 hammer
skill: smithing 62
rate: smithing
say: You cut the slot last, because everything else is easier while you can still see the work.

# recipe iron-platelegs
station: anvil
in: 3 iron-bar, 1 hammer
out: 1 combat.iron-platelegs, 1 hammer
skill: smithing 100
rate: smithing
say: You leave the knee loose enough to walk in, which is not how it is usually done.

# recipe iron-platebody
station: anvil
in: 4 iron-bar, 1 hammer
out: 1 combat.iron-platebody, 1 hammer
skill: smithing 112
rate: smithing
say: Riveted plate over a padded coat, and every rivet is one you set yourself.

# recipe iron-boots
station: anvil
in: 2 iron-bar, 1 hammer
out: 1 combat.iron-boots, 1 hammer
skill: smithing 62
rate: smithing
say: Jointed over the instep in five lames, and you walk the shop in them before you call them done.

# recipe iron-shield
station: anvil
in: 2 iron-bar, 1 hammer
out: 1 combat.iron-shield, 1 hammer
skill: smithing 66
rate: smithing
say: Iron over ash, because iron alone that size is a thing nobody could lift twice.

# recipe knights-sword
station: anvil
in: 10 iron-bar, 1 hammer
out: 1 combat.knights-sword, 1 hammer
skill: smithing 500
rate: smithing
say: You take the whole day over it, and at the end of the day there is a sword on the anvil that somebody could be knighted with.

# recipe causeway-jewel
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.causeway-jewel, 1 hammer
skill: smithing 30
rate: smithing
say: You draw the bar out long and true and put nothing on it at all, which is harder than putting something on it.

# recipe crossroads-jewel
station: anvil
in: 3 iron-bar, 1 hammer
out: 1 combat.crossroads-jewel, 1 hammer
skill: smithing 110
rate: smithing
say: Five ways out of one stone, and every one of them has to leave it at the same angle or the thing is a lump with notches in it.

# recipe cooked-chicken
station: stove
in: cooking.raw-chicken
out: cooked-chicken
burnt: burnt-food
accuracy: cooking
skill: cooking 3
rate: core.cooking-rate
say: You turn it until the fat stops running clear.

# recipe cooked-beef
station: stove
in: cooking.raw-beef
out: cooked-beef
burnt: burnt-food
accuracy: cooking
skill: cooking 5
rate: core.cooking-rate
say: You sear it hard on both sides and leave the middle alone.
