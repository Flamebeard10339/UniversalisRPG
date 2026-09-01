// The engine's own furniture, which every region depends on: the stat bases, the
// health pool and its regeneration, the factions, the equipment slots, the
// passives and cluster jewels, the droptables, the generic items, and
// melee-combat.
//
// Not the player, and not a skill. Which skills a character has is a fact about
// the world they are in rather than about the engine, and a skill is one module
// each — so the region that knows all of them is the one that says who you are.
//
// Nothing here stands anywhere. A location, an entity that occupies one, or a
// line somebody says belongs to the region it happens in, so this module holds
// none of them — and a route that would prove any of this needs somewhere to
// stand, which is why the one `# test` below is the only claim that can be made
// without walking anywhere.

# info core
version: 1.0.0
pack: engine

// --- variables ---

// What walking one road costs, whichever road it is. A map is drawn to be read
// rather than to be measured, so how far apart two places look on it is the
// author's business and not the player's; every road is the same few seconds.
# variable travel-seconds
value: 3

// What a duration action takes when it names no cadence of its own. At 0 an
// untagged action is over the instant it is used; raising it makes every action
// that has not declared itself `instant` a span the world moves through.
# variable default-action-duration
value: 0

// The beat a room takes to find you: what stands between arriving somewhere and the thing that
// lives there coming at you, and the same pause between one foe falling and the next stepping over
// it. Long enough that a second rat is a fight the player saw coming rather than one that was
// already happening, and short enough that nowhere hostile is ever somewhere to stand and work.
# variable engagement-seconds
value: 2

// How many things the player's pack holds. A stack counts once however deep it is, and anything
// grown into a copy of its own counts as itself; what is worn is on the player rather than in the
// pack. At 0 a world hands out an endless pack instead.
# variable inventory-slots
value: 28

// How far apart one step of this world's coordinates is drawn on the map, in
// pixels. Two places a square apart have to have room for both their names
// between them and a road that can be seen; raise it to spread a crowded
// quarter out, lower it to fit more of the world on a phone at once.
# variable map-grid
value: 140

// --- stats ---

// Each one says what kind of measure it is, which is the same `group:` an item or
// an entity writes and is what the character sheet keeps its tabs by: the sheet
// shows one group at a time and its first tab is the group the first stat here
// belongs to, so moving a stat between groups moves it between tabs and there is
// no list of tabs anywhere to keep in step with this one. The groups themselves
// are declared below, with everything else that says what something is.

// What a stat is worth to anything that does not name its own. A fighter names
// every stat its action reads off it, so these are defaults rather than
// anyone's sheet.
# stat attack
base: 10
group: combat

// Flat damage reduction, subtracted from each incoming hit. Named `defense`
// because that is what a player calls it; a contest points at it by name.
# stat defense
base: 5
group: combat

// The two sides of the opposed roll. A gap of 100 is worth about a 91% chance
// (see `contest-spread`), so the player at 100 against a rat's 40 lands ~80%.
# stat accuracy
base: 100
group: combat

# stat evasion
group: combat

// Attacks per minute, which is what `rate:` on an action reads directly:
// 25/min is one swing every 2.4s.
# stat attack-rate
base: 25
group: combat

// One health a minute, which is slow enough that a fight still costs something
// and fast enough that what it cost is never permanent. Anything that wants to
// heal at a useful pace adds to this rather than restoring a pool of its own.
# stat regeneration
base: 1
group: combat

// Deliberately without a base: a health pool is what makes something worth
// swinging at, so a door or a stove has none and only what declares
// `max-health` can be fought.
# stat max-health
group: combat

// Fish per minute: 6/min is one about every ten seconds, which is the pace the rest of the
// skilling in the world was brought to. A second and a bit a fish was an idle game's kitchen.
# stat cooking-rate
base: 6
group: skilling

// The drop channel. Contested like any other roll, so a charm that reads
// `+20 luck` moves a rare find without any table knowing the charm exists.
# stat luck
base: 60
group: skilling

// What one swing of an axe takes off a trunk. An action with nothing to
// deplete counts down a whole of its own instead of anybody's pool, so this is
// a fraction of one felling and the swings it costs are read off it — the
// number lives here and is written nowhere else, in prose least of all.
# stat felling
base: 0.25
group: skilling

// --- resources ---

// Health falls to the rats' bites and recovers from the regeneration a meal
// grants. Rates are per minute. What happens when it runs out is an event
// below, and a handler on whoever it ran out for.
# resource health
rate: regeneration
max: max-health
display: full

// --- events ---

// The name a pool running out is bound to. Any entity may write `on death:`,
// and what it says applies to the entity it happened to.
# event death
resource: health
trigger: on empty

// The name a change to what the player is holding is bound to: something entered the pack, left it,
// or was put on or taken off. It fires once per thing that moved, so an action reading `stops on:
// core.inventory-changed` comes back the moment the player's hands are different.
# event inventory-changed
trigger: inventory-changed

// --- factions ---

# faction world

# faction player

// --- groups ---

// What something is, said once and read wherever it is drawn. A region declares
// groups of its own — a weapon, a beast, a townsfolk — and anything that names
// none falls to whichever of these is standard for its kind, so nothing is ever
// ungrouped and every fill has a colour.
//
// Both of these are deliberately the widest word there is for what they cover: a
// standard group is what everything the world has not classified yet wears, and
// one that said `creature` would call a door and an oven creatures.

# group thing
standard for: item
colour: #94a3b8

# group presence
standard for: entity
colour: #fbbf24

// Where a quest stands is a kind of thing the quest is, so it is said here with
// everything else that is: the screen fills the row with the colour and a
// terminal prints the word, off the one declaration.

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

// What kind of measure a stat is. The character sheet keeps a tab per group and
// shows one at a time, so these are also what a player's stats are sorted into —
// the first tab is the group the first `# stat` above belongs to, and everything
// the sheet knows about tabs it reads off these three and the `group:` lines.
//
// `combat` is what a stat naming no group falls to, so a stat added next month is
// on the sheet whether or not anyone remembered to group it. It falls to the tab
// the sheet opens on rather than to one a player may never turn to, which is what
// makes having forgotten it something somebody notices.
//
// `other` is the only one put on by hand. It is where a pool a player may go a
// whole life without opening goes, so that never opening it costs them no room
// on either of the two tabs they read.

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

// --- flags ---

// Running out of health is the engine's own event, and this is what the player
// carries away from it. No prop owns it, which is why it is declared here.
# flag fainted

// --- skills ---
//
// One skill is one module, and each of them declares the stat it raises, the ways it is trained and
// the gear it is trained in, and puts itself on the player from there. What is left here is the one
// this town has never given anybody a second way to practise.

# skill woodcutting

// --- races ---

// What the player is, chosen once at the mirror and carried for the whole of a
// life. A race is a modifier carrier like a buff, a worn item or a skill: it
// hangs its bonus off the character with the same clause the rest of them use.
# race human
+5% max-health

# race elf
+5% accuracy

# race dwarf
+5% defense

# race orc
+5% attack

// --- equipment slots ---

// The vocabulary is still `equipment-slots:` on # entity player; these are the
// words the equipment page draws, where on the body it draws them, and the keys
// a translation answers. The body is three columns wide because the hands stand
// either side of a torso; a slot added down the middle needs no other change.
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

// --- stations ---

// The names a recipe may be worked at. They stand nowhere: an # entity that
// opens one lists it, and that entity belongs to the region it stands in.
# station anvil

# station oven

# station stove

// --- actions ---

// The shape every combattable thing in the game shares, written once and
// brought by whoever swings: `my` reads off the swinger and `their` off the
// struck, so one block is both the player's fight and the rat's bite.
# action melee-combat
title: Fight
continuous
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health

// --- items ---

# item cooked-shrimp
examine: A simple meal.
value: 7
food, +3 regeneration, 60s
eat:
  instant
  take: 1 cooked-shrimp
  say: You eat the shrimp. Simple, warm, and better than it looks.

// No `origin-cluster:` of its own, so hex (0,0) falls back to a single point
// carrying one east jewel slot: the on-ramp every base has when it declares
// nothing. `item-level:` is where a base is tiered, and this one is a starter
// forever.
//
// A base is a good, and what a counter pays for is the thing on the table: the
// steel and the days in it, never the plane it carries or how far it rolled. A
// price that read the roll would turn the one-shot caches these come out of
// into purses, which is the same reason nothing that is spent on a plane —
// jewel or orb — declares a value at all.
# item iron-sword
examine: A well-balanced blade, standard adventurer's kit.
slot: mainhand
value: 24
weapon, +2 attack
item-level: 3-8

// --- comfortable clothes ---
//
// Four slots of nothing at all, and that is the whole design. Every other thing a player can put on
// carries a stat, which means every slot on a skiller's sheet is either armour they have no use for
// or empty — and an empty slot is a plane they never get to spend. These grant no bonus to anything,
// so what they are worth is exactly the points they drop with and the jewel that goes in them.
//
// They live here rather than in a skill because they belong to none of them: carrying no stat is
// what lets core declare them, and a fifth skill written next month is dressed by having been.

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

// --- passives ---
//
// A payload written as a range is rolled by the cluster that comes to carry it,
// once, at the moment that cluster enters a plane — so what a jewel is worth is
// settled when it is socketed and never again, and two of one jewel are two
// different jewels.
//
// Flat and percent are separated by cluster rather than mixed inside one.
// statRange folds a stat as (base + added) x (1 + increased), so a percent
// passive is worth almost nothing until flat ones have been stacked: keeping
// them apart puts the order a player has to build in on the plane itself,
// where a percent cluster slotted early is a mistake they can see.

# passive hale
life, +15 max-health

# passive constitution
life, +20 max-health

# passive tempered-frame
life, +12% max-health

# passive mending
life, recovery, +2 regeneration

# passive warded
armour, +2 defense

# passive plated
armour, +3 defense

# passive hardened
armour, +10% defense

# passive whetted
physical, +2 attack

# passive honed
physical, +3 attack

# passive brutal
physical, +8% attack

# passive swift-hands
speed, +2 attack-rate

# passive flurry
speed, +3 attack-rate

# passive frenzied
speed, +10% attack-rate

# passive keen-eye
precision, +4-8 accuracy

# passive marksman
precision, +8 accuracy

# passive deadly-precision
precision, +12% accuracy

# passive quickstep
evasion, +6-10 evasion

# passive evasive
evasion, +15% evasion

# passive fortune
utility, +3-8 luck

// --- cluster jewels ---
//
// Every shape the catalogue holds is authored at least once, so a shape that
// plays badly is met in play rather than only in a unit test. An unfilled
// position is a node the player pays for and gets nothing from, which is what
// makes a sparse jewel a corridor rather than a defective one.

# cluster-jewel keen-edge
examine: Six facets, each one sharpened against the last.
shape: ring
open-connections: e
passives: 1 whetted, 2 keen-eye, 3 honed, 4 brutal, 5 swift-hands, 6 whetted

# cluster-jewel stout-heart
examine: A knot of iron that will not be moved.
shape: ring
open-connections: ne, se
passives: 1 warded, 2 hale, 3 constitution, 5 hale, 6 mending

// Mostly percent, and worth close to nothing slotted early. Slotted behind a
// flat cluster it multiplies what that one already pays.
# cluster-jewel tempered-will
examine: It does not add. It insists.
shape: wheel
open-connections: e, se
passives: 1 hale, 2 tempered-frame, 3 brutal, 4 hardened, 5 tempered-frame, 6 brutal, 7 fortune

// Twelve positions and two exits. The inner ring is left mostly empty on
// purpose: crossing it costs four points and pays on one, where the short way
// round the outer ring costs three and pays on all of them.
# cluster-jewel great-work
examine: Twelve years of somebody's evenings, and they are not finished.
shape: double-ring
open-connections: e, sw
passives:
  1 warded
  2 plated
  3 constitution
  4 marksman
  5 hale
  6 honed
  7 fortune
  10 flurry

# cluster-jewel causeway
examine: A road, and nothing on either side of it.
shape: spindle
open-connections: e
passives: 2 hale

// One node, five ways out, and no payload at all. Six points buys the item
// nothing except five live directions from a single hex, which nothing else
// in the catalogue can do.
# cluster-jewel crossroads
examine: A junction stone. It offers roads, not shelter.
shape: point
open-connections: ne, e, se, sw, nw

// Hex (0,0) of the Heartwood Blade. It is never slotted and so never rotated,
// which is why its root may sit where it likes; the west-edge convention that
// binds every jewel above exists only to give slotting a defined rotation.
# cluster-jewel heartwood-core
shape: spindle
open-connections: e, ne
passives: 1 mending, 2 tempered-frame

// --- cluster jewel items ---
//
// A jewel reaches the player as an ordinary item naming its declaration, so
// drops, stacking and inventory are the machinery that already exists.

# item keen-edge-jewel
examine: A closed ring of iron, warm to the touch.
cluster-jewel: keen-edge

# item stout-heart-jewel
cluster-jewel: stout-heart

# item tempered-will-jewel
cluster-jewel: tempered-will

# item great-work-jewel
cluster-jewel: great-work

# item causeway-jewel
cluster-jewel: causeway

# item crossroads-jewel
cluster-jewel: crossroads

// --- cluster effects ---
//
// An orb is used on a cluster already standing in a plane, never on a jewel
// in inventory, which is what keeps jewels stackable. It scales every payload
// naming its stat in that cluster and nowhere else, so an orb is a question
// about which hexagon — spent on a cluster with no such payload it is worth
// exactly nothing, and the runtime says so by reporting back the same numbers.
//
// Two orbs naming one stat pool additively, so the pair below is 35% and not
// 37.5%. The two tiers exist so that the pooling rule is reachable in play at
// all: a cluster refuses a second copy of one orb, so one orb per stat would
// leave `mod-slots: 2` unable to hold two effects on the same stat.

# item orb-of-vitality
title: Orb of Vitality
examine: A dull red bead. It beats, very slowly. Nothing drinks it: an orb is spent on a cluster, and scales what that cluster already gives.
cluster-effect: +25% max-health

# item orb-of-the-edge
title: Orb of the Edge
examine: A sliver of something that was never blunt.
cluster-effect: +25% attack

# item lesser-orb-of-the-edge
title: Lesser Orb of the Edge
examine: The same sliver, ground down by whoever had it first.
cluster-effect: +10% attack

# item orb-of-the-bulwark
title: Orb of the Bulwark
examine: Heavier than the hand expects.
cluster-effect: +25% defense

# item orb-of-renewal
title: Orb of Renewal
examine: Cool, and faintly wet, and it does not dry. Nothing drinks it: an orb is spent on a cluster, and scales what that cluster already gives.
cluster-effect: +25% regeneration

// A base that declares its own origin cluster, which is the general rule the
// iron sword's bare east slot is the degenerate case of.
# item heartwood-blade
examine: The grain still moves, slowly, when you are not looking.
slot: mainhand
value: 30
weapon, +4 attack
item-level: 12-18
origin-cluster: heartwood-core

// The kingdom's coin, and the bent one above is the curio that trades for it.
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

// --- drop tables ---

// A table is a named result list, so what a rat leaves behind reads as two
// facts: bones always, a tail sometimes.
# droptable rat-remains
give: 1-3 rat-bone
1 in 4: give: 1 rat-tail

// The smithing on-ramp: two blades to spend points on, one of each jewel shape
// to spend them on, and the orbs to scale what those carry. Every line is
// certain, because this table is the tutorial's way of putting a plane in the
// player's hands rather than a drop economy — the rats are a capped population
// and a jewel behind a 1-in-150 roll would never arrive on this island at all.
// The two blades are the only rolled lines in it: each arrives with a level
// drawn from what it declares, so the same chest is not the same chest twice.
# droptable smiths-cache
give: 1 heartwood-blade
give: 1 iron-sword
give: 1 keen-edge-jewel
give: 1 stout-heart-jewel
give: 1 tempered-will-jewel
give: 1 great-work-jewel
give: 1 causeway-jewel
give: 1 crossroads-jewel
give: 1 orb-of-vitality
give: 2 orb-of-the-edge
give: 1 lesser-orb-of-the-edge
give: 1 orb-of-the-bulwark
give: 1 orb-of-renewal

// Named rather than written inline because two different things reach it: the
// rat's corpse and the dresser's drawer. That is the whole reason a table has an
// id — composition already layers a chance, but it cannot share one.
# droptable trinket
one of:
  8x: nothing
  3x: give: 2-5 bent-coin
  1x:
    give: 1 rats-eye-gem
    say: Something glints in the dust, and it is looking back at you.
