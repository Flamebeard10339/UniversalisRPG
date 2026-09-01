// The engine's own furniture. This world is not content: it ships to nobody, no author edits it,
// and it changes only when the engine changes. It is what the suite stands on so that editing
// anything under `content/` cannot redden a test — the corpus's own verdict is the oracle's, and
// `docs/authoring-split/` says why.
//
// Keep it small and keep it complete. Every kind the engine has a rule about wants one section
// here, because a rule with nothing to fire on in this world is a rule the suite cannot reach.

# info fixture-core
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

// --- passives ---

# passive hale
+10 max-health

# passive keen
+4 attack

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
value: 1

# item rope
title: Rope
value: 5

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
