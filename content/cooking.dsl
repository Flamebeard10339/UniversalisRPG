// Cooking — one attempt at every dish, and it is either dinner or it is a lump of charcoal.
//
// A recipe with an `accuracy:` gets one attempt and no more: win the contest and the outputs are
// yours with the experience on them, lose it and the inputs are gone, the `burnt:` line is what you
// are left holding, and nothing is paid. That is the whole mechanic, and the contest is the
// player's `cooking` against nothing at all — the stat is the only thing that decides it, so gear
// and levels are the only two ways to stop ruining food.
//
// It depends on fishing and combat because a kitchen cooks what somebody else caught and killed.

# info cooking
version: 1.0.0
pack: skills
dependencies:
  core
  fishing
  combat

// Sixty is about one dish in five burnt with nothing on and no levels, and a little over one in
// twenty at twenty levels in a full kitchen. Every dish is contested against the same nothing, so
// what makes a salmon worth more than a shrimp is what it is worth, not what it risks.
# stat cooking
title: Cooking
base: 60
group: core.skilling

# skill cooking
title: Cooking
stat: cooking


// One ruined thing rather than one per dish, because what is left of a burnt salmon and what is
// left of a burnt shrimp is the same lump and telling them apart is a list somebody would have to
// keep. It is worth one coin, which a counter rounds down to nothing on the way out.
# item burnt-food
title: Burnt Food
examine: Black all the way through and welded to whatever it was cooked on. Somebody will take it off you for nothing, which is what it is worth.
value: 1

// --- the kitchen ---

# item chefs-hat
title: Chef's Hat
examine: Starched, ridiculous, and it is what the range at the castle expects to see on somebody standing at it.
slot: head
requires: level.cooking >= 20
value: 180
kitchen, +12 cooking

# item oven-mitts
title: Oven Mitts
examine: Quilted to the wrist and scorched at the thumbs.
slot: gloves
requires: level.cooking >= 5
value: 40
kitchen, +5 cooking

# item cast-iron-pan
title: Cast Iron Pan
examine: Heavy enough to be a weapon and seasoned black by somebody who never once washed it properly.
slot: mainhand
requires: level.cooking >= 5
value: 60
item-level: 6-12
kitchen, +6 cooking

// --- what a kitchen turns out ---

# item cooked-anchovies
title: Cooked Anchovies
examine: Crisped whole in a pan, eaten whole, bones and all.
value: 6
food, +2 core.regeneration, 45s
eat:
  instant
  take: 1 cooked-anchovies
  say: You eat them off your palm in two handfuls.

# item cooked-trout
title: Cooked Trout
examine: The skin came away in one piece, which is the only way you can tell it went well.
value: 20
food, +7 core.regeneration, 90s
eat:
  instant
  take: 1 cooked-trout
  say: You eat the trout off the bone and feel considerably better about the afternoon.

# item cooked-salmon
title: Cooked Salmon
examine: Pink through to the middle and still giving off heat.
value: 36
food, +11 core.regeneration, 120s
eat:
  instant
  take: 1 cooked-salmon
  say: You eat the salmon slowly, because it is worth eating slowly.

# item cooked-pike
title: Cooked Pike
examine: Firm white flesh off a fish that fought about it, and picked clean of the bones that come with that.
value: 46
food, +11 core.regeneration, 120s
eat:
  instant
  take: 1 cooked-pike
  say: You eat it slowly, because of the bones, and it is worth eating slowly.

# item cooked-sturgeon
title: Cooked Sturgeon
examine: Steaks off something that was swimming here before the walls went up.
value: 84
food, +16 core.regeneration, 150s
eat:
  instant
  take: 1 cooked-sturgeon
  say: There is more of it than one person should eat and you eat all of it.

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

// --- the recipes ---
//
// The two that came out of core with the skill. Neither is contested: kneading dough is not a thing
// anybody burns, and the loaf is the tutorial's, so it is not where a player meets the burn rule.

# recipe dough
in: jug-of-water, pot-of-flour
out: dough
skill: cooking 2
time: 2
say: You knead water and flour into a ball of dough.

# recipe bread
station: oven
in: dough
out: bread
skill: cooking 4
time: 3
say: The oven bakes your dough into a golden loaf.

// Everything below is one attempt against the same stat, at the cadence core sets for a knack.

# recipe cooked-shrimp
station: stove
in: raw-shrimp
out: cooked-shrimp
burnt: burnt-food
accuracy: cooking
skill: cooking 1
rate: core.cooking-rate
say: The shrimp goes from grey to pink in about four seconds, and that is the whole of the skill.

# recipe cooked-anchovies
station: stove
in: raw-anchovies
out: cooked-anchovies
burnt: burnt-food
accuracy: cooking
skill: cooking 2
rate: core.cooking-rate
say: They crisp in the pan all at once, which is the moment to take them off it.

# recipe cooked-herring
station: stove
in: herring
out: cooked-herring
burnt: burnt-food
accuracy: cooking
skill: cooking 2
rate: core.cooking-rate
say: You grill the herring through, which is the only way it is worth eating.

# recipe cooked-chicken
station: stove
in: combat.raw-chicken
out: cooked-chicken
burnt: burnt-food
accuracy: cooking
skill: cooking 3
rate: core.cooking-rate
say: You turn it until the fat stops running clear.

# recipe cooked-trout
station: stove
in: raw-trout
out: cooked-trout
burnt: burnt-food
accuracy: cooking
skill: cooking 4
rate: core.cooking-rate
say: You take the trout off the heat at the moment the eye goes white.

# recipe cooked-beef
station: stove
in: combat.raw-beef
out: cooked-beef
burnt: burnt-food
accuracy: cooking
skill: cooking 5
rate: core.cooking-rate
say: You sear it hard on both sides and leave the middle alone.

# recipe cooked-salmon
station: stove
in: raw-salmon
out: cooked-salmon
burnt: burnt-food
accuracy: cooking
skill: cooking 6
rate: core.cooking-rate
say: The salmon takes longer than anything else on the range and punishes you for looking away.

// The two the narrows hand over, and the only reason cooking has anything to do above the tenth
// level: what a kitchen is worth is bounded by what the water gave you, so a water shut until
// eleven is a dish shut until eleven.

# recipe cooked-pike
station: stove
in: fishing.raw-pike
out: cooked-pike
burnt: burnt-food
accuracy: cooking
skill: cooking 8
rate: core.cooking-rate
say: You cook the pike long and slow, which is the only way round the bones.

# recipe cooked-sturgeon
station: stove
in: fishing.raw-sturgeon
out: cooked-sturgeon
burnt: burnt-food
accuracy: cooking
skill: cooking 12
rate: core.cooking-rate
say: It takes up the whole range and it is worth the whole range.

# recipe roasted-chestnut
station: oven
in: raw-chestnut
out: roasted-chestnut
burnt: burnt-food
accuracy: cooking
skill: cooking 1
rate: core.cooking-rate
say: The shell splits along the score and the inside comes out soft.

// --- what a pan can be grown into ---
//
// The pan is the one thing in a kitchen a cook keeps, so it is the one thing with a plane in it.

# passive seasoned
kitchen, +4 cooking

# passive practised
kitchen, +7 cooking

# passive second-nature
kitchen, +10% cooking

# cluster-jewel a-cooks-hands
examine: Whatever it is that lets somebody take a pan off the heat without looking at it.
shape: ring
open-connections: e
passives: 1 seasoned, 2 practised, 3 second-nature, 4 seasoned, 5 practised, 6 second-nature

# item a-cooks-hands-jewel
title: A Cook's Hands
examine: A ring of blackened iron, worn smooth on the inside by somebody who never took it off.
cluster-jewel: a-cooks-hands
