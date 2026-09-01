// The engine's own furniture. This world is not content: it ships to nobody, no author edits it,
// and it changes only when the engine changes. It is what the suite stands on so that editing
// anything under `content/` cannot redden a test — the corpus's own verdict is the oracle's, and
// `docs/authoring-split/` says why.
//
// Keep it small and keep it complete. Every kind the engine has a rule about wants one section
// here, because a rule with nothing to fire on in this world is a rule the suite cannot reach.

# info core
version: 1.0.0
pack: fixture

// --- variables ---

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

// --- groups ---

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
colour: #e5e7eb

# group quest-started
title: Under way
colour: #fbbf24

# group quest-complete
title: Done
colour: #34d399

# group combat
title: Combat
standard for: stat
colour: #f87171

# group skilling
title: Skilling
colour: #a78bfa

// --- stats ---

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

# stat regeneration
base: 1

# stat digging-rate
base: 12
group: skilling

# stat scavenging-rate
base: 8-14
group: skilling

// --- pools ---

# resource health
max: max-health
rate: regeneration
start: 30

# event death
resource: health
trigger: on empty

# event inventory-changed
trigger: inventory-changed

// --- who is on whose side ---

# faction world

# faction player

# faction vermin

// --- what the player carries away from a beating ---

# flag fainted

// --- what may be worn ---

# slot main-hand
at: 1 1

# slot body
at: 1 2

// --- what may be trained ---

# skill digging
stat: digging-rate

# skill scavenging
stat: scavenging-rate

// --- what a life is lived as ---

# race human
+5% max-health

# race badger
+5% defense

// --- passives ---

# passive hale
+10 max-health

# passive keen
+4 attack

# passive warded
+2 defense

# passive fortune
+2% max-health

// --- items ---

# item copper-coin
title: Copper Coin

# item bread
title: Bread
examine: A dense, dark loaf.
value: 3
food
+2 attack
30s

# item spade
title: Spade
examine: Worn smooth at the handle and bright at the edge.
slot: main-hand
value: 12
+2 attack

# item jerkin
title: Jerkin
slot: body
value: 8
+1 defense

# item rat-tail
title: Rat Tail
examine: Somebody in town pays for these. @@@ who, and how much
value: 1

# item rope
title: Rope
examine: Twelve feet of it, coiled and stiff.
value: 5

// --- a plane to spend points on ---

# cluster-jewel keen-edge
examine: A closed ring of iron, warm to the touch.
shape: ring
open-connections: e
passives: 1 keen, 2 hale, 3 warded, 4 keen, 5 hale, 6 fortune

# cluster-jewel stout-heart
examine: A knot of iron that will not be moved.
shape: wheel
open-connections: e, se
passives: 1 warded, 2 hale, 3 fortune, 5 hale, 6 warded, 7 keen

# item keen-edge-jewel
title: Keen Edge Jewel
examine: Six facets, each one sharpened against the last.
cluster-jewel: keen-edge

# item stout-heart-jewel
title: Stout Heart Jewel
examine: It does not add. It insists.
cluster-jewel: stout-heart

// --- somewhere to make something ---

# station bench

# recipe rope-from-tails
station: bench
in: 3 rat-tail
out: 1 rope
skill: scavenging 10
time: 2

// --- what drops off a rat ---

# droptable vermin-drops
give: 1 rat-tail
one of:
  2x: give: 1-3 copper-coin
  1x: nothing

// --- the one action everything fights with ---

# action melee-combat
title: Attack
continuous
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health
