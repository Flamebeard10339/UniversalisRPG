# info cooking
version: 1.0.0
pack: skills
dependencies:
  core
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

# recipe cooked-beef
station: stove
in: combat.raw-beef
out: cooked-beef
burnt: burnt-food
accuracy: cooking
skill: cooking 5
rate: core.cooking-rate
say: You sear it hard on both sides and leave the middle alone.

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
