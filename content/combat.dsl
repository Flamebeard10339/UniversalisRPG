// Combat — the two skills a fight trains, everything worth swinging at, and the gear you swing it
// in. Nothing here is a quest: the town is full of things that will fight you whether or not
// anybody asked you to, and this module is what makes standing in a room and fighting them worth a
// player's evening.
//
// The two skills are trained by the fight itself rather than by finishing one. `attack` is paid per
// point of damage dealt and `health` per point taken, so an enemy's health *is* the experience in
// it, and what a room is worth by the minute is its enemies' health times how many stand there
// divided by how long they take to come back. That is the only lever this file tunes with, and it
// is why the counts and the respawns below are written where the enemies are.
//
// Nothing here stands anywhere, the way nothing in core does: an enemy is a sheet and a room is the
// town's business, so Tulsa is what says how many of these are in which room and therefore what an
// evening in that room is worth.
//
// The three the town is made of — a townsman, a guardsman, a knight — are Tulsa's rather than this
// module's, because more than one skill has a use for them and only the region can see more than one
// skill from where it sits. Anything here is only ever hit.

# info combat
version: 1.0.0
pack: skills
dependencies:
  core

// --- what a fight pays ---

// The two moments the engine already reports, named so a skill can be paid on them. Neither watches
// a pool: they are one swing landing, seen from each end of it.
# event damage-dealt
trigger: damage-dealt

# event damage-taken
trigger: damage-taken

// A tenth of what the blow actually landed, which is two things at once. A tenth, because a whole
// number of experience for a whole point of damage put every room in the world an order of
// magnitude over what the curve asks. Landed, because the engine used to pay on what the swing
// threw rather than on what the pool took — a chicken with eight health paid a full hit, which
// made the smallest thing in a room the best thing in it.
//
// The award is rounded, so a swing under five points pays nothing at all: an arm that can barely
// mark a thing does not train on it, and the rounding either way comes out in the wash over an
// evening.
# skill attack
title: Attack
stat: core.attack
gain 0.1 * amount experience on damage-dealt

// Taken damage is worth sixty times what dealt damage is, because a fight the player wins is one
// where they took a small fraction of what they gave. That both halves are paid at once is
// `tulsa.the-sewer-pays-a-beginner-in-both-halves-of-a-fight`. What caps this is not the enemy but the
// player's own pool and what they can put back into it, so armour that stops a tier hurting you is
// armour that stops it training you — which is the whole reason to walk further out. That ceiling is
// why this half was the only one in the world already near what the curve asks while the other was
// two hundred times over it, and why the two move together: an arm that kills slower stands in
// front of the thing for longer, so trimming one raises the other.
# skill health
title: Health
stat: core.max-health
gain 6 * amount experience on damage-taken


// --- what comes off the things you kill ---

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

# droptable purse
one of:
  5x: give: 2-6 coin
  3x: give: 7-15 coin
  1x: give: 20-40 coin

# droptable knights-purse
give: 15-30 coin
1 in 4: give: 1 core.rats-eye-gem

// --- bronze, which anybody may wear ---
//
// About five points to a piece, spread between stopping a hit and surviving one. The whole set is
// five attack, nine defense and six health, which against the sewer is the difference between a rat
// costing four a bite and costing one.

# item bronze-dagger
title: Bronze Dagger
examine: Short, soft, and better than your hands.
slot: mainhand
value: 30
weapon, +5 core.attack

# item bronze-helmet
title: Bronze Helmet
examine: A plain cap of hammered bronze, dented over the left ear by somebody else's evening.
slot: head
value: 26
armour, +2 core.defense, +3 core.max-health

# item bronze-platebody
title: Bronze Platebody
examine: Front and back plate, laced at the sides. Heavier than it looks and quieter than you want.
slot: body
value: 44
armour, +4 core.defense, +1 core.max-health

# item bronze-platelegs
title: Bronze Platelegs
examine: Skirted plate to the knee. Walking in them is a skill nobody warns you about.
slot: legs
value: 38
armour, +3 core.defense, +2 core.max-health

// --- iron, which is not for beginners ---
//
// Twice bronze at every piece, and it asks ten of both skills before it will go on. The two are
// asked together on purpose: iron is what a player who has been fighting wears, not what a player
// who has been hitting a post wears.

# item iron-dagger
title: Iron Dagger
examine: Grey steel with a proper edge on it, and no decoration at all.
slot: mainhand
requires: level.attack >= 10
value: 90
weapon, +10 core.attack

# item iron-helmet
title: Iron Helmet
examine: A full helm with a slot to see out of, and not much of one.
slot: head
requires: level.attack >= 10 and level.health >= 10
value: 80
armour, +4 core.defense, +6 core.max-health

# item iron-platebody
title: Iron Platebody
examine: Riveted plate over a padded coat. You feel the weight of it in your knees by evening.
slot: body
requires: level.attack >= 10 and level.health >= 10
value: 130
armour, +7 core.defense, +3 core.max-health

# item iron-platelegs
title: Iron Platelegs
examine: Iron to the shin, hinged at the knee by somebody who had thought about knees.
slot: legs
requires: level.attack >= 10 and level.health >= 10
value: 110
armour, +6 core.defense, +4 core.max-health

// The one thing in the game nothing drops and no counter sells: it is made, at an anvil, by a
// player who has already got there. Eighteen points in one hand, and it asks twenty attack.
# item knights-sword
title: Knight's Sword
examine: A long blade with a fuller down the middle and somebody's initials filed off the tang. It was made for a knight and it was not made for you.
slot: mainhand
requires: level.attack >= 20
value: 400
weapon, +18 core.attack

// --- the farm, which is where a beginner goes when the sewer is full ---

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

// --- the pines, and the road ---

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
    give: 5-12 coin
    1 in 12: give: 1 iron-dagger
