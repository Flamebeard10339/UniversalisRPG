// Tutorial Island — Miki route (Path 1), end to end.
// Guide house (ground floor, upstairs, basement) + the beach beyond the front door.
// Paths 2/3 (thieving, fishing) are only stubbed where Path 1 shares their props
// (front door, dresser, lockpick) so the world stays internally consistent.

# info tutorial-island
version: 1.0.0

// --- variables ---

// Seconds of real-time travel per unit of straight-line distance between
// locations; the beach sits one unit east of the guide house's front door.
# variable travel-seconds-per-unit
value: 5

// What a duration action takes when it names no cadence of its own. At 0 an
// untagged action is over the instant it is used; raising it makes every action
// that has not declared itself `instant` a span the world moves through.
# variable default-action-duration
value: 0

// --- stats ---

// What a stat is worth to anything that does not name its own. A fighter names
// every stat its action reads off it, so these are defaults rather than
// anyone's sheet.
# stat attack
base: 10

// Flat damage reduction, subtracted from each incoming hit. Named `defense`
// because that is what a player calls it; a contest points at it by name.
# stat defense
base: 5

// The two sides of the opposed roll. A gap of 100 is worth about a 91% chance
// (see `contest-spread`), so the player at 100 against a rat's 40 lands ~80%.
# stat accuracy
base: 100

# stat evasion

// Attacks per minute, which is what `rate:` on an action reads directly:
// 25/min is one swing every 2.4s.
# stat attack-rate
base: 25

# stat regeneration

// Deliberately without a base: a health pool is what makes something worth
// swinging at, so a door and an oven have none and only what declares
// `max-health` can be fought.
# stat max-health

// Chestnuts per minute: 15/min is one every 4 seconds.
# stat cooking-rate
base: 55

// The drop channel. Contested like any other roll, so a charm that reads
// `+20 luck` moves a rare find without any table knowing the charm exists.
# stat luck
base: 60

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

// --- factions ---

# faction world

# faction player

// --- flags ---

// Quest and world state the module owns. An entity or location declares the
// flags that are its own; these belong to no one prop.
# flag fainted

# flag mirror-done

# flag rats-killed

// --- skills ---

# skill thieving
stat-id: attack

# skill melee
stat-id: attack

# skill cooking

// --- equipment slots ---

// The vocabulary is still `equipment-slots:` on # entity player; these are the
// words the equipment page draws, and the keys a translation answers.
# slot mainhand
title: Main Hand

# slot offhand
title: Off Hand

// --- modals ---

// The mirror raises this one; the engine draws it and writes what it is told
// into the player.
# modal character-creation
screen: character-creation

// What `/inv` raises, and what a # test answers with submit-modal: item=.
# modal carried-items
screen: carried-items

// --- actions ---

// The shape every combattable thing in the game shares, written once and
// brought by whoever swings: `my` reads off the swinger and `their` off the
// struck, so one block is both the player's fight and the rat's bite.
# action melee-combat
title: Fight
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health

// --- items ---

# item cooked-shrimp
examine: A simple meal.
food, +3 regeneration, 60s
eat:
  instant
  take: 1 cooked-shrimp
  say: You eat the shrimp. Simple, warm, and better than it looks.

// No `origin-cluster:` of its own, so hex (0,0) falls back to a single point
// carrying one east jewel slot: the on-ramp every base has when it declares
// nothing. `max-level:` is where a base is tiered, and this one is a starter
// forever.
# item iron-sword
examine: A well-balanced blade, standard adventurer's kit.
slot: mainhand
weapon, +2 attack
max-level: 10

# item wooden-shield
examine: A sturdy shield of banded oak.
slot: offhand
shield, +2 defense

# item lockpick
examine: A bent sliver of metal, worn smooth from use.
thieving-tool

# item fishing-net
examine: A fishing net. @@@

# item fish
examine: A fish. @@@

# item jug-of-water
examine: A clay jug of clean water.

# item pot-of-flour
examine: A small pot of milled flour.

# item dough
examine: A ball of raw dough, ready for the oven.

# item bread
examine: A warm, golden loaf.
food, +5 regeneration, 90s
eat:
  instant
  take: 1 bread
  say: You tear into the warm loaf - simple, filling, and worth the trouble.

# item roasted-chestnut
examine: A chestnut roasted soft and sweet in the oven's embers.

# item rat-bone
examine: A thin bone, picked clean.

# item rat-tail
examine: Still twitching, faintly.

# item bent-coin
examine: A copper coin someone stepped on.

# item rats-eye-gem
examine: A red stone the size of a thumbnail. It does not warm in your hand.

// --- passives ---
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
precision, +6 accuracy

# passive marksman
precision, +8 accuracy

# passive deadly-precision
precision, +12% accuracy

# passive quickstep
evasion, +8 evasion

# passive evasive
evasion, +15% evasion

# passive fortune
utility, +5 luck

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

// --- item experience ---
//
// Experience is fed, never earned, and the grant is authored per item: a
// greater whetstone is a second declaration and not a second mechanism.

# item whetstone
examine: A grey block, faintly oiled.
item-experience: 1000

# item masters-whetstone
title: Master's Whetstone
examine: The same grey block, cut true, and it lasts.
item-experience: 10000

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
examine: A dull red bead. It beats, very slowly.
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
examine: Cool, and faintly wet, and it does not dry.
cluster-effect: +25% regeneration

// A base that declares its own origin cluster, which is the general rule the
// iron sword's bare east slot is the degenerate case of.
# item heartwood-blade
examine: The grain still moves, slowly, when you are not looking.
slot: mainhand
weapon, +4 attack
max-level: 40
origin-cluster: heartwood-core

// --- drop tables ---

// A table is a named result list, so what a rat leaves behind reads as two
// facts: bones always, a tail sometimes.
# droptable rat-remains
give: 1-3 rat-bone
1 in 4: give: 1 rat-tail

// The smithing on-ramp: one of each shape, the whetstones to pay for them and
// the orbs to spend on what they carry. Every line is certain, because this
// table is the tutorial's way of putting a plane in the player's hands rather
// than a drop economy — the rats are a capped population and a jewel behind a
// 1-in-150 roll would never arrive on this island at all.
# droptable smiths-cache
give: 1 heartwood-blade
give: 1 iron-sword
give: 6 whetstone
give: 4 masters-whetstone
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

// --- locations ---

# location guide-house
x: 0, y: 0
starting
examine: A cluttered but cozy cottage. Miki's guide house.
adjacent:
  guide-house-upstairs
  basement
  beach while front-door.unlocked
entities:
  miki, front-door, stairs, mirror, oven, smiths-chest

# location guide-house-upstairs
x: 0, y: 0, z: 1
examine: A narrow landing with a dresser and a view of the coast.
adjacent:
  guide-house
entities:
  dresser, stairs-down, window

# location basement
x: 0, y: 0, z: -1
examine: A damp cellar, crates stacked against the walls.
adjacent:
  guide-house
entities:
  3 giant-rat, stairs-up

# location beach
east of guide-house
examine: Pale sand and the sound of the tide. The mainland waits past the water.
adjacent:
  guide-house
  market-district

// However a route leaves the house, it lands adjacent to here: the shared
// ground every route's test converges on.
# location market-district
east of beach
examine: The market district. @@@
adjacent:
  beach

// --- entities ---

// The player is an entity like any other, and declares everything that measures
// it. The global `# stat` bases above are what something that names none falls
// back to; they stopped being this sheet.
# entity player
title: You
faction: player
stats: max-health 30, attack 10, defense 5, attack-rate 25, accuracy 100, evasion 0
skills: melee, cooking, thieving
equipment-slots: mainhand, offhand
uses: melee-combat
on death:
  say: You slump to the floor, spent. (You should have eaten something.)
  set: fainted
  stop

# entity miki
faction: player
examine: A weathered man in patched leather, quick to smile.
flags: angered

# entity front-door
examine: A heavy wooden door, bound in iron.
flags: unlocked
pick lock:
  requires: has lockpick
  hidden if: unlocked
  time: 4
  xp: thieving 4
  on success:
    set: unlocked
    say: The lock clicks open.

# entity mirror
examine: A tall mirror in a gilt frame. Your reflection waits, nameless.
look in:
  instant
  hidden if: mirror-done
  open modal: character-creation
  set: mirror-done

# entity oven
examine: A stone oven, its coals still glowing.
stations: oven
roast chestnuts:
  continuous
  rate: cooking-rate
  give: 1 roasted-chestnut
  xp: cooking 40-80
  on success:
    say: Another chestnut pops from the embers, roasted through.

# entity stairs
title: Stairs
ascend:
  instant
  relocate: guide-house-upstairs
  say: You climb to the second floor.
descend:
  instant
  relocate: basement
  say: You head down into the basement.

# entity stairs-down
title: Stairs
descend:
  instant
  relocate: guide-house
  say: You head back down to the ground floor.

# entity stairs-up
title: Stairs
ascend:
  instant
  relocate: guide-house
  say: You climb back up to the ground floor.

# entity smiths-chest
title: Smith's Chest
examine: A banded chest shoved under the workbench, its lid unlatched.
flags: emptied
open:
  instant
  hidden if: emptied
  roll: smiths-cache
  set: emptied
  say: Whetstones, a handful of cut stones, and a blade nobody came back for.

# entity dresser
examine: A dusty dresser, one drawer left slightly ajar.
flags: searched
search drawer:
  hidden if: searched
  give: lockpick
  say: Tucked beneath old linens, a set of worn lockpicks.
  set: searched
  luck vs 60:
    roll: trinket

// The only way out that never runs through Miki. A player who has burned the
// front door still has this — a straight drop with a cost, not a puzzle.
# entity window
examine: A window. @@@
climb out:
  instant
  relocate: beach
  drain: 5 health
  say: You climb out. @@@
fish:
  instant
  requires: has fishing-net
  hidden if: has fish
  give: 1 fish
  say: You catch a fish. @@@

// 20 health against the player's 10 a hit is two hits, ~2.5 swings at 80%, so a
// rat falls in about six seconds and lands a bite or two on the way out. It
// swings back because it `uses:` an action, not because a tag says so.
# entity giant-rat
title: Giant Rat
examine: A hunched rat claws at an overturned crate, eyes red in the dark.
stats: attack 8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
uses: melee-combat
hidden if: rats-killed >= 3
on death:
  add: rats-killed 1
  say: You put down another rat.
  credit:
    xp: melee 4-6
    roll: rat-remains
    1 in 3:
      roll: trinket

// --- recipes ---

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

// --- dialogue ---

// Miki has a word for a traveller whatever else is loaded. A quest that wants
// more of him gives him more to say; this is what is left when none is.
# dialogue miki
owner = miki

node greeting:
  always
  Well met. Miki, they call me - I keep an eye on this island.
  There's a mirror upstairs if you've a mind to know your own face, and rats in the basement if you haven't.

// --- saves ---

# save dresser-trinket-end
{"version":11,"inventory":{"tutorial-island.lockpick":1},"flags":{"tutorial-island.dresser.searched":true,"tutorial-island.guide-house.discovered":true,"tutorial-island.guide-house-upstairs.discovered":true},"resources":{},"location":"tutorial-island.guide-house-upstairs","rng":2617077404}

# save explored-and-unlocked
{"version":11,"flags":{"tutorial-island.front-door.unlocked":true,"tutorial-island.beach.discovered":true}}

// The drawer's contested roll over shipped content. On the default seed this
// search comes up empty behind the lockpick, so an assertion over inventory
// alone would also hold in a world where the drawer never rolls at all — which
// is the shape of test this branch's audit caught. The whole sheet is what tells
// the two apart: `luck vs 60` and the table behind it move the rng cursor
// whether or not they yield anything, and `expect:` is what pins that.
// Regenerate with /create-valid-test when the drawer's odds change on purpose.
# test dresser-trinket
travel: guide-house-upstairs
use: entity.dresser.search-drawer
assert: has lockpick
assert: searched
expect: dresser-trinket-end

# test a-lockpick-opens-the-front-door
run: dresser-trinket
travel: guide-house
use: entity.front-door.pick-lock
assert: front-door.unlocked
assert: beach.discovered
assert: xp.thieving = 4
assert: time >= 4

# test save-restores-object-owned-flags
load: explored-and-unlocked
assert: front-door.unlocked
assert: beach.discovered

// --- growing an item ---
//
// Recorded from a live session with /create-valid-test, so what follows is what
// a player types and the closing `expect:` is the sheet that session ended on:
// both grown copies, their planes, every allocation, and the effects each
// cluster carries. Regenerate with /create-valid-test when this content changes
// on purpose.
//
// The Heartwood Blade's origin is a spindle whose root, position 1, is
// allocated from the start and free. Both of its jewel slots hang off position
// 3, so either one costs two points to reach before the slot itself.

# test growing-a-heartwood-blade
load: growing-a-heartwood-blade-start
use: entity.smiths-chest.open
// An orb grants no item experience, and nothing else in the game moves it.
refuse: feed heartwood-blade with orb-of-vitality
// Out of adjacency: position 3 touches only position 2 and the two slots,
// and the point to pay for it is in hand.
refuse: allocate heartwood-blade at 0,0 position 3
// The first verb the plane allows is what mints the copy. The two refusals
// above left the stack whole, so this one still names an item, not an id.
feed: heartwood-blade with whetstone
feed: 1 with whetstone
feed: 1 with whetstone
feed: 1 with whetstone
allocate: 1 at 0,0 position 2
allocate: 1 at 0,0 position 3
allocate: 1 at 0,0 slot ne
slot: 1 at 0,0 ne with keen-edge-jewel
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with crossroads-jewel
// Slotting is permanent: a filled slot refuses a second jewel forever.
refuse: slot 1 at 0,0 e with causeway-jewel
feed: 1 with masters-whetstone
// Allocation is permanent too, and this is asked with six points spare so
// that having none cannot be the reason.
refuse: allocate 1 at 0,0 position 2
allocate: 1 at 1,-1 position 1
allocate: 1 at 1,-1 position 2
allocate: 1 at 1,-1 position 3
allocate: 1 at 1,-1 position 4
allocate: 1 at 1,-1 position 5
allocate: 1 at 1,0 position 1
// The junction's nw edge faces the ring slotted a moment ago, and one hex
// holds one cluster: that direction is foreclosed for good. Asked with a
// point in hand and its own position allocated, so blocking is the only
// answer left — and the ne edge of the same hex, two lines down, takes the
// point the nw edge would not.
refuse: allocate 1 at 1,0 slot nw
refuse: slot 1 at 1,0 nw with causeway-jewel
allocate: 1 at 1,0 slot ne
// Level 11 bought eleven points and all eleven are spent.
refuse: allocate 1 at 1,0 slot se
apply: 1 at 1,-1 with orb-of-the-edge
apply: 1 at 1,-1 with lesser-orb-of-the-edge
// Two effects naming one stat pool to 35% rather than compounding to 37.5%.
// A second copy of one orb is refused by identity, a third orb by capacity.
refuse: apply 1 at 1,-1 with orb-of-the-edge
refuse: apply 1 at 1,-1 with orb-of-the-bulwark
// The origin's only allocated payload is a percent one, so this is an orb
// scaling the increased channel rather than the added one.
apply: 1 at 0,0 with orb-of-vitality
// The ordinary base, whose hex (0,0) is the bare east slot every base falls
// back to. Two Master's Whetstones carry it to the level 10 it is capped at,
// and feeding it again is refused with the whetstone intact.
feed: iron-sword with masters-whetstone
feed: 2 with masters-whetstone
refuse: feed 2 with masters-whetstone
allocate: 2 at 0,0 slot e
slot: 2 at 0,0 e with causeway-jewel
expect: growing-a-heartwood-blade-end

# save growing-a-heartwood-blade-start
{"version":11,"flags":{"tutorial-island.guide-house.discovered":true,"tutorial-island.guide-house-upstairs.discovered":true,"tutorial-island.basement.discovered":true}}

# save growing-a-heartwood-blade-end
{"version":11,"inventory":{"tutorial-island.heartwood-blade":0,"tutorial-island.iron-sword":0,"tutorial-island.whetstone":2,"tutorial-island.masters-whetstone":1,"tutorial-island.keen-edge-jewel":0,"tutorial-island.stout-heart-jewel":1,"tutorial-island.tempered-will-jewel":1,"tutorial-island.great-work-jewel":1,"tutorial-island.causeway-jewel":0,"tutorial-island.crossroads-jewel":0,"tutorial-island.orb-of-vitality":0,"tutorial-island.orb-of-the-edge":1,"tutorial-island.lesser-orb-of-the-edge":0,"tutorial-island.orb-of-the-bulwark":1,"tutorial-island.orb-of-renewal":1},"flags":{"tutorial-island.guide-house.discovered":true,"tutorial-island.guide-house-upstairs.discovered":true,"tutorial-island.basement.discovered":true,"tutorial-island.smiths-chest.emptied":true},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"tutorial-island.heartwood-blade","payload":{"experience":14000,"plane":{"0,0":{"jewel":"tutorial-island.heartwood-core","entry":null,"allocatedPositions":[2,3],"allocatedSlots":["ne","e"],"effects":["tutorial-island.orb-of-vitality"]},"1,-1":{"jewel":"tutorial-island.keen-edge","entry":"ne","allocatedPositions":[1,2,3,4,5],"allocatedSlots":[],"effects":["tutorial-island.orb-of-the-edge","tutorial-island.lesser-orb-of-the-edge"]},"1,0":{"jewel":"tutorial-island.crossroads","entry":"e","allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]}}}},"2":{"kind":"item","template":"tutorial-island.iron-sword","payload":{"experience":20000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"tutorial-island.causeway","entry":"e","allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

// --- growing an item through the inventory screen ---
//
// The same growth the test above spells as directives, walked the way a player
// reaches it: every line below is a screen being answered. Recorded from a live
// session with /create-valid-test and regenerated the same way when this content
// changes on purpose.
//
// It opens the inventory, opens the Iron Sword's plane, slots a jewel into the
// bare east slot every base has, walks out to the hexagon that jewel put there
// and to the one slotted beyond that, allocates on both, leaves the plane for
// the inventory it was opened from, and equips the copy it just grew. The
// closing `expect:` is what says the route ended somewhere: the copy is worn in
// mainhand and, by c21, is no longer in the inventory it was grown from.

# test growing-through-the-inventory-screen
load: growing-a-heartwood-blade-start
use: entity.smiths-chest.open
open-modal: carried-items
submit-modal: item=tutorial-island.iron-sword
submit-modal: verb=grow
submit-modal: plane=allocate: slot e
submit-modal: plane=slot: e with tutorial-island.crossroads-jewel
// A base still in its stack is minted by the first growth, so the level the
// next allocation spends is bought after the copy exists rather than before.
submit-modal: plane=feed: with tutorial-island.masters-whetstone
submit-modal: plane=go: 1,0
submit-modal: plane=allocate: position 1
submit-modal: plane=allocate: slot ne
submit-modal: plane=slot: ne with tutorial-island.keen-edge-jewel
submit-modal: plane=go: 2,-1
submit-modal: plane=allocate: position 1
submit-modal: plane=back
submit-modal: verb=equip
open-modal: carried-items
submit-modal: item=close
expect: growing-through-the-inventory-screen-end

# save growing-through-the-inventory-screen-end
{"version":11,"inventory":{"tutorial-island.heartwood-blade":1,"tutorial-island.iron-sword":0,"tutorial-island.whetstone":6,"tutorial-island.masters-whetstone":3,"tutorial-island.keen-edge-jewel":0,"tutorial-island.stout-heart-jewel":1,"tutorial-island.tempered-will-jewel":1,"tutorial-island.great-work-jewel":1,"tutorial-island.causeway-jewel":1,"tutorial-island.crossroads-jewel":0,"tutorial-island.orb-of-vitality":1,"tutorial-island.orb-of-the-edge":2,"tutorial-island.lesser-orb-of-the-edge":1,"tutorial-island.orb-of-the-bulwark":1,"tutorial-island.orb-of-renewal":1},"flags":{"tutorial-island.guide-house.discovered":true,"tutorial-island.guide-house-upstairs.discovered":true,"tutorial-island.basement.discovered":true,"tutorial-island.smiths-chest.emptied":true},"equipped":{"mainhand":"1"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"tutorial-island.iron-sword","payload":{"experience":10000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"tutorial-island.crossroads","entry":"e","allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]},"2,-1":{"jewel":"tutorial-island.keen-edge","entry":"ne","allocatedPositions":[1],"allocatedSlots":[],"effects":[]}}}}}}}
