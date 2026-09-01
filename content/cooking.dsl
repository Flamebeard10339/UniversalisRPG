# info cooking
version: 1.0.0
pack: skills
dependencies:
  core
  fishing
  combat

# stat cooking
title: Cooking
base: 60
group: core.skilling

# skill cooking
title: Cooking
stat: cooking

# item burnt-food
title: Burnt Food
examine: Black all the way through and welded to whatever it was cooked on. Somebody will take it off you for nothing, which is what it is worth.
value: 1

# item chefs-hat
title: Chef's Hat
examine: Starched, ridiculous, and it is what the range at the castle expects to see on somebody standing at it.
slot: head
requires: level.cooking >= 20
value: 180
item-level: 8-14
kitchen, +12 cooking

# item oven-mitts
title: Oven Mitts
examine: Quilted to the wrist and scorched at the thumbs.
slot: gloves
requires: level.cooking >= 5
value: 40
item-level: 3-6
kitchen, +5 cooking

# item cast-iron-pan
title: Cast Iron Pan
examine: Heavy enough to be a weapon and seasoned black by somebody who never once washed it properly.
slot: mainhand
requires: level.cooking >= 5
value: 60
item-level: 6-12
kitchen, +6 cooking

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

# passive quick-hands
kitchen, +1 core.cooking-rate

# passive short-order
kitchen, +2 core.cooking-rate

# passive never-still
kitchen, +12% core.cooking-rate

# cluster-jewel a-hot-pass
examine: Six things going at once and none of them waiting on him.
shape: ring
open-connections: e
passives: 1 quick-hands, 2 seasoned, 3 short-order, 4 never-still, 5 quick-hands, 6 short-order

# item a-hot-pass-jewel
title: A Hot Pass
examine: A brass tally worn through in one corner, off a kitchen that fed a great many people very fast.
cluster-jewel: a-hot-pass

# cluster-jewel a-steady-hand
examine: Nothing in this kitchen has ever caught, and nobody has ever seen him hurry.
shape: spindle
open-connections: e
passives: 1 practised, 2 second-nature

# item a-steady-hand-jewel
title: A Steady Hand
examine: A wooden spoon burnt black at one edge and not the other, which took some doing.
cluster-jewel: a-steady-hand
