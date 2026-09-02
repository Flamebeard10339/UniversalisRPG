# info combat
version: 1.0.0
pack: skills
dependencies:
  core

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

# item raw-chicken
title: Raw Chicken
examine: A plucked bird, still warm.
value: 4

# item raw-beef
title: Raw Beef
examine: A slab of it, and more than one meal's worth.
value: 8

# item cowhide
title: Cowhide
examine: A whole hide, folded hair-in. The tanners take these by the cart.
value: 12

# item wolf-pelt
title: Wolf Pelt
examine: Grey through to the roots, and it still smells of the pines.
value: 22

# item feather
title: Feather
examine: One brown feather. Nobody has ever wanted just one.
value: 1

# droptable chicken-remains
give: 1 raw-chicken
give: 3-8 feather

# droptable cow-remains
give: 1-2 raw-beef
1 in 2: give: 1 cowhide

# droptable wolf-remains
give: 1 wolf-pelt
1 in 3: give: 4-11 coin
1 in 40: give: 1 core.keen-edge-jewel

# droptable purse
one of:
  5x: give: 2-6 coin
  3x: give: 7-15 coin
  1x: give: 20-40 coin

# droptable highwaymans-keepsake
1 in 30: give: 1 core.stout-heart-jewel

# droptable knights-purse
give: 15-30 coin
1 in 4: give: 1 core.rats-eye-gem

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
    1 in 45: give: 1 core.orb-of-the-edge
