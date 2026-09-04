# info core
version: 1.0.0
pack: engine

# variable travel-seconds
value: 3

# variable default-action-duration
value: 0

# variable engagement-seconds
value: 2

# variable inventory-slots
value: 28

# variable map-grid
value: 140

# stat attack
base: 10
group: combat

# stat defense
base: 5
group: combat

# stat accuracy
base: 100
group: combat

# stat evasion
group: combat

# stat attack-rate
base: 25
group: combat

# stat regeneration
base: 1
group: combat

# stat max-health
group: combat

# stat cooking-rate
base: 6
group: skilling

# stat felling
base: 0.25
group: skilling

# resource health
rate: regeneration
max: max-health
display: full

# event death
resource: health
trigger: on empty

# event inventory-changed
trigger: inventory-changed

# faction world

# faction player

# group thing
standard for: item
colour: #94a3b8

# group presence
standard for: entity
colour: #fbbf24

# group quest-unstarted
title: Not started
stands for: unstarted
colour: #e5e7eb

# group quest-started
title: Under way
stands for: started
colour: #fbbf24

# group quest-complete
title: Done
stands for: complete
colour: #34d399

# group combat
title: Combat
standard for: stat
colour: #f87171

# group skilling
title: Skilling
colour: #a78bfa

# group other
title: Other
colour: #94a3b8

# flag fainted

# skill woodcutting

# race human
+5% max-health

# race elf
+5% accuracy

# race dwarf
+5% defense

# race orc
+5% attack

# slot head
title: Head
at: 2 1

# slot mainhand
title: Main Hand
at: 1 2

# slot body
title: Body
at: 2 2

# slot offhand
title: Off Hand
at: 3 2

# slot gloves
title: Gloves
at: 1 3

# slot legs
title: Legs
at: 2 3

# slot boots
title: Boots
at: 2 4

# station anvil

# station oven

# station stove

# action melee-combat
title: Fight
continuous
rate: us.attack-rate
accuracy: us.accuracy vs them.evasion
damage: us.attack vs them.defense
depletes: them.health

# action faint
title: Fainted
time: 5
on success:
  relocate: starting-location
  if setting.hardcore:
    say: Somebody went through your pockets while you were down, and took the coat off your back besides. You have nothing.
    take: everything

# item cooked-shrimp
examine: A simple meal.
value: 7
food, +3 regeneration, 60s
eat:
  instant
  take: 1 cooked-shrimp
  say: You eat the shrimp. Simple, warm, and better than it looks.

# item iron-sword
examine: A well-balanced blade, standard adventurer's kit.
slot: mainhand
value: 24
weapon, +2 attack
item-level: 3-8

# item unassuming-cap
title: Unassuming Cap
examine: Soft, shapeless, and the colour of whatever it was before. Nobody has ever looked twice at it.
slot: head
value: 14
item-level: 2-5

# item linen-shirt
title: Linen Shirt
examine: Plain, worn thin at the elbows, and cool to work in.
slot: body
value: 18
item-level: 3-6

# item linen-pants
title: Linen Pants
examine: Loose at the knee, tied at the waist, and mended twice on one side.
slot: legs
value: 16
item-level: 2-5

# item simple-boots
title: Simple Boots
examine: Low, unlined, and broken in by somebody with the same size feet as you.
slot: boots
value: 20
item-level: 2-4

# item wooden-shield
examine: A sturdy shield of banded oak.
slot: offhand
value: 12
item-level: 2-4
shield, +2 defense

# item lockpick
examine: A bent sliver of metal, worn smooth from use.
thieving-tool

# item jug-of-water
examine: A clay jug of clean water.
value: 1

# item pot-of-flour
examine: A small pot of milled flour.
value: 3

# item dough
examine: A ball of raw dough, ready for the oven.
value: 5

# item raw-chestnut
examine: A hard brown nut, its shell scored ready for the embers.
value: 2

# item roasted-chestnut
examine: A chestnut roasted soft and sweet in the oven's embers.
value: 5

# item rat-bone
examine: A thin bone, picked clean.
value: 2

# item rat-tail
examine: Still twitching, faintly.
value: 4

# item bent-coin
examine: A copper coin someone stepped on.
value: 2

# item rats-eye-gem
examine: A red stone the size of a thumbnail. It does not warm in your hand.
value: 60

# item coin
title: Coin
examine: A milled coin of Yanodonin, the duke's profile worn nearly flat.

# item herring
examine: A silver fish, still cold from the water.
value: 5

# item honeycomb
examine: A slab of comb, heavy and dripping.
value: 4

# item royal-jelly
title: Royal Jelly
examine: A spoonful of something pale and faintly warm. It comes from a princess cell and nowhere else.
value: 120

# item mollusk-venom
title: Mollusk Venom
examine: A thumb of cloudy resin scraped from a swamp mollusk's foot.
value: 14

# item marsh-thistle
title: Marsh Thistle
examine: A grey-headed thistle that grows where the water stands.
value: 2

# item fen-root
title: Fen Root
examine: A knuckle of root pulled from black mud. It smells of nothing at all.
value: 3

# item adders-tongue
title: Adder's Tongue
examine: A single split leaf. It is the last thing on every list that has one, and there is a reason it is last.
value: 5

# item hand-axe
title: Hand Axe
examine: A short axe, good for firewood and not much else.
slot: mainhand
value: 12
item-level: 1-3
weapon, +1 attack

# item bundle-of-firewood
title: Bundle of Firewood
examine: Split logs, roped together. Anywhere with a stove in it buys these by the armful.
value: 12

# item log
title: Log
examine: A round of alder, cut green and heavier than it looks. @@@ Nothing splits a log into firewood yet, so a bundle of firewood is a thing that can be sold and not made.
value: 6

# item rat-pelt
title: Rat Pelt
examine: Hairless in patches, and weeping where it is not.
value: 4

# item bread
examine: A warm, golden loaf.
value: 12
food, +5 regeneration, 90s
eat:
  instant
  take: 1 bread
  say: You tear into the warm loaf - simple, filling, and worth the trouble.

# item cooked-herring
title: Cooked Herring
examine: Grilled through and smelling of the docks. Larry on the sewer door has a nose for these.
value: 9
food, +2 regeneration, 45s
eat:
  instant
  take: 1 cooked-herring
  say: You eat the herring off your fingers. Salt, smoke, and small bones.

# droptable rat-remains
give: 1-3 rat-bone
1 in 4: give: 1 rat-tail

# droptable trinket
one of:
  8x: nothing
  3x: give: 2-5 bent-coin
  1x:
    give: 1 rats-eye-gem
    say: Something glints in the dust, and it is looking back at you.
