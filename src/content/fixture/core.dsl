# info core
version: 1.0.0
pack: fixture

# variable travel-seconds
value: 3

# variable default-action-duration
value: 0

# variable engagement-seconds
value: 2

# variable inventory-slots
value: 12

# variable map-grid
value: 140

# group thing
title: Thing
standard for: item
colour: #94a3b8

# group presence
title: Presence
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

# stat attack
base: 10

# stat defense
base: 0

# stat accuracy
base: 10

# stat evasion
base: 0

# stat attack-rate
base: 60

# stat max-health
base: 30
rounds to: 5

# stat regeneration
base: 0

# ladder max-health
at level one: 100
growth per level: 31
minutes at level one: 5
minutes growth per level: 1.07
seconds to fell an even match: 15

# ladder digging-rate
at level one: 0
growth per level: 7
minutes at level one: 5
minutes growth per level: 1.07

# stat digging-rate
base: 12
group: skilling

# stat scavenging-rate
base: 8-14
group: skilling

# stat line-strength
base: 0
group: skilling

# resource health
max: max-health
rate: regeneration

# event death
resource: health
trigger: on empty

# resource line
max: line-strength
start: 0

# event line-snapped
resource: line
trigger: on empty

# droptable snapped-line
take: 1 twine
take: 1 stout-twine

# event inventory-changed
trigger: inventory-changed

# faction world

# faction player

# faction vermin

# flag fainted

# slot main-hand
at: 1 1

# slot body
at: 1 2

# slot gloves
at: 2 1

# skill digging
stat: digging-rate

# skill scavenging
stat: scavenging-rate

# race human
+5% max-health

# race badger
+5% defense

# passive hale
grants: max-health
budget: 4

# passive keen
+4 attack

# passive warded
+2 defense

# passive fortune
+2% max-health

# item copper-coin
title: Copper Coin

# item bread
title: Bread
examine: A dense, dark loaf.
value: 3
food
+2 attack
+3 regeneration
30s

# item spade
title: Spade
examine: Worn smooth at the handle and bright at the edge.
slot: main-hand
value: 12
+2 attack

# item leather-gloves
title: Leather Gloves
examine: Soft, and stained where the fingers go.
slot: gloves
item-level: 4
value: 10

# item jerkin
title: Jerkin
slot: body
value: 8
+1 defense

# item rat-tail
title: Rat Tail
examine: Somebody in town pays for these. @@@ who, and how much
value: 1

# item twine
title: Twine
value: 2
+4 line-strength

# item stout-twine
title: Stout Twine
value: 6
+9 line-strength

# item proving-token
DEBUG

# item rope
title: Rope
examine: Twelve feet of it, coiled and stiff.
value: 5

# cluster-jewel keen-edge
title: Keen Edge
examine: A closed ring of iron, warm to the touch.
shape: ring
open-connections: e
passives: 1 keen, 2 hale, 3 warded, 4 keen, 5 hale, 6 fortune

# cluster-jewel stout-heart
title: Stout Heart
examine: A knot of iron that will not be moved.
shape: wheel
open-connections: e, se
passives: 1 warded, 2 hale, 3 fortune, 5 hale, 6 warded, 7 keen

# cluster-jewel spade-core
title: Spade Core
examine: The haft is bored through, end to end.
shape: ring
open-connections: e
passives: 1 keen, 2 hale, 3 warded, 4 keen, 5 hale, 6 fortune

# item heavy-spade
title: Heavy Spade
examine: Twice the spade the other one is.
slot: main-hand
requires: level.digging >= 5
item-level: 20
origin-cluster: spade-core
value: 40

# item keen-edge-jewel
title: Keen Edge Jewel
examine: Six facets, each one sharpened against the last.
cluster-jewel: keen-edge

# item stout-heart-jewel
title: Stout Heart Jewel
examine: It does not add. It insists.
cluster-jewel: stout-heart

# item keen-orb
title: Keen Orb
examine: A sliver of something that was never blunt.
cluster-effect: +25% attack

# item quiet-hour-jewel
title: Quiet Hour Jewel
examine: An hour nobody asked after, kept in iron.
value: 25
cluster-jewel:
  shape: spindle
  open-connections: e
  passives: 1 hale, 2 keen, 3 warded

# station bench

# recipe rope-from-tails
station: bench
in: 1 rat-tail, 1 twine
out: 1 rope
say: The tails twist up into something that will hold.
skill: scavenging 10
time: 2

# droptable vermin-drops
give: 1 rat-tail
one of:
  digging-rate: give: 1-3 copper-coin
  scavenging-rate: give: 1 twine
  1x: nothing

# entity proving-dummy
DEBUG
faction: world
stats: max-health 1000, attack 0, accuracy 0, evasion 0, defense 0, attack-rate 60

# action melee-combat
title: Attack
continuous
rate: us.attack-rate
accuracy: us.accuracy vs them.evasion
damage: us.attack vs them.defense
depletes: them.health
