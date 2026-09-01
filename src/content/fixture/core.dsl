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

// A ceiling nobody is born with: a player has this pool only while carrying something that grants
// it, and emptying it costs them that thing. Two items grant it, so the table that takes it back has
// two to name.
# stat line-strength
base: 0
group: skilling

// --- pools ---

# resource health
max: max-health
rate: regeneration
start: 30

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

# slot gloves
at: 2 1

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

// A thing that arrives as a copy of its own, rolled once on arrival, so what is worn is a minted id
// and not the base.
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

// Written to prove the engine works, and refused wherever anything a player can reach names it.
# item proving-token
DEBUG

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

// A thing with a plane of its own, so points dropped with it have somewhere to be spent and a jewel
// has a socket to go into.
# cluster-jewel spade-core
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

// --- somewhere to make something ---

# station bench

# recipe rope-from-tails
station: bench
in: 1 rat-tail, 1 twine
out: 1 rope
say: The tails twist up into something that will hold.
skill: scavenging 10
time: 2

// --- what drops off a rat ---

# droptable vermin-drops
give: 1 rat-tail
one of:
  digging-rate: give: 1-3 copper-coin
  scavenging-rate: give: 1 twine
  1x: nothing

// --- the one action everything fights with ---

// Written to prove the engine works and reachable by nobody, which is what DEBUG is for.
# entity proving-dummy
DEBUG
faction: world
stats: max-health 1000, attack 0, accuracy 0, evasion 0, defense 0, attack-rate 60

# action melee-combat
title: Attack
continuous
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health
