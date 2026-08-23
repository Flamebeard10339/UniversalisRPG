// Tulsa — the starting town, and effectively the whole region the early game
// happens in. Read off `.planning/starting-town-outline.md` and the ten notes
// in `.planning/planning_quests/`.
//
// This module is the town STANDING: its places, the roads between them, the
// people who live there and what they sell, and the things that are already
// hostile. It holds no quest. Every quest named in the notes gets a module of
// its own that gives these entities more to say — take those modules away and
// Tulsa still loads, and everyone here still has a word for a traveller.
//
// It depends on tutorial-island for the engine's own furniture: the stat
// bases, the health pool, the death event, the factions, melee-combat, and the
// market district that all three routes out of Miki's house converge on. That
// module's id is machine-facing and outlives the fiction it was named for.

# info tulsa
version: 1.0.0
dependencies:
  tutorial-island

// --- skills ---
//
// Two the town's stores exist for. Melee, cooking and thieving are the
// tutorial's and are used here unchanged.

# skill fishing

# skill woodcutting

// --- flags ---
//
// World state no single prop owns. A flag that belongs to one door or one
// person is declared on that door or that person instead.

# flag heard-of-the-back-way

# flag sewer-toll-paid

// --- items ---

// The kingdom's coin. Tutorial island's bent-coin is a curio a rat leaves
// behind; the grocer takes those off you at face value, which is the on-ramp
// to having any money at all.
# item coin
title: Coin
examine: A milled coin of Yanodonin, the duke's profile worn nearly flat.

# item herring
examine: A silver fish, still cold from the water.

# item cooked-herring
title: Cooked Herring
examine: Grilled through and smelling of the docks. Larry on the sewer door has a nose for these.
food, +2 regeneration, 45s
eat:
  instant
  take: 1 cooked-herring
  say: You eat the herring off your fingers. Salt, smoke, and small bones.

# item honeycomb
examine: A slab of comb, heavy and dripping.

# item royal-jelly
title: Royal Jelly
examine: A spoonful of something pale and faintly warm. It comes from a princess cell and nowhere else.

# item mollusk-venom
title: Mollusk Venom
examine: A thumb of cloudy resin scraped from a swamp mollusk's foot.

# item bottle-of-vodka
title: Bottle of Vodka
examine: Sunny's own. The label is hand-written and does not say what is in it.

# item marsh-thistle
title: Marsh Thistle
examine: A grey-headed thistle that grows where the water stands.

# item fen-root
title: Fen Root
examine: A knuckle of root pulled from black mud. It smells of nothing at all.

# item adders-tongue
title: Adder's Tongue
examine: A single split leaf. Oolga's list calls it the last one for a reason.

# item hand-axe
title: Hand Axe
examine: A short axe, good for firewood and not much else.
slot: mainhand
weapon, +1 attack

# item bundle-of-firewood
title: Bundle of Firewood
examine: Split logs, roped together. The bar buys these by the armful.

# item rat-pelt
title: Rat Pelt
examine: Hairless in patches, and weeping where it is not.

# item sewer-key
title: Sewer Key
examine: A heavy iron key, left on a table by someone who expected to come back for it.

// --- drop tables ---

# droptable feral-rat-remains
give: 1-2 rat-pelt
1 in 3: give: 1-4 coin

# droptable ratman-remains
give: 1 rat-pelt
give: 3-8 coin

# droptable swamp-pickings
one of:
  6x: nothing
  3x: give: 1 mollusk-venom
  1x: give: 1-3 coin

// --- locations ---
//
// A dense town read as a text adventure. Every road is written from both ends
// so that a place's own `adjacent:` reads as the whole list of its exits; the
// engine answers a road from both ends either way, which is what lets the
// square below name a location in the module underneath this one. Distances are
// in the units tutorial island already set: five seconds of walking each.

# location market-square
x: 3, y: 0
title: Market Square
examine: Awnings, shouting, and a sewer grate set into the cobbles with a boy hunched over it.
adjacent:
  tutorial-island.market-district
  market-row
  tavern-street
  castle-gate
  kelsa-farmhouse
  swamp-edge
entities:
  mouse, town-crier, sewer-grate

# location market-row
east of market-square
title: Market Row
examine: A lane of stalls end to end: groceries, fishing tackle, and a rack of axes nobody is watching closely enough.
adjacent:
  market-square
  forge
  oolga-house
  market-rooftops
entities:
  general-store, fishing-supplies, woodcutters-stall

// The roof layer the outline asks for, and the only way onto it is a climb.
// What it overlooks is a quest's business rather than the town's.
# location market-rooftops
x: 4, y: 0, z: 1
title: Market Rooftops
examine: Tile and thatch, and the castle's upper windows across the way. @@@ Attention to Detail wants a vantage on the duke from up here; nothing on this roof says so yet.
adjacent:
  market-row

# location forge
east of market-row
examine: A low stone shop with the fire banked. An anvil stands unused in the middle of the floor.
adjacent:
  market-row
entities:
  bladesmiths-son, anvil

# location tavern-street
x: 2, y: 1
title: Tavern Street
examine: A short street that smells of spilled beer at any hour. Sha Dynasty's is the door with the lantern over it.
adjacent:
  market-square
  sha-dynastys
  oolga-house
entities:
  charlie-the-tramp

# location sha-dynastys
x: 2, y: 2
title: Sha Dynasty's
examine: The city's bar. Low beams, long tables, and a stove in the corner that has never been cold.
adjacent:
  tavern-street
entities:
  sunny, bar-stove, drunk-patron

# location oolga-house
x: 3, y: 1
title: Oolga's House
examine: A crooked house wedged between two straighter ones. Bundles of something dry hang from every beam.
adjacent:
  market-row
  tavern-street
  oolga-basement
entities:
  oolga, oolgas-counter

# location oolga-basement
x: 3, y: 1, z: -1
title: Oolga's Basement
examine: A dirt-floored cellar. Something has been at the sacks in the corner, and part of the far wall has fallen in.
adjacent:
  oolga-house
  sewer-junction
entities:
  4 feral-rat, broken-wall

# location castle-gate
x: 2, y: -1
title: Castle Gate
examine: The gatehouse of Tulsa's castle. Two guards, bored, and a road running round the back.
adjacent:
  market-square
  castle-hall
  castle-yard
  guard-barracks
entities:
  2 castle-guard

# location guard-barracks
x: 1, y: -1
title: Guard Barracks
examine: Bunks, a weapon rack, and a table with the town's troubles laid out on it in no particular order.
adjacent:
  castle-gate
entities:
  guard-captain

# location castle-yard
x: 1, y: -2
title: Castle Yard
examine: Round the back of the castle: barrels, a midden, and a hatch into the sewers with a guard sat on it.
adjacent:
  castle-gate
  sewer-entrance while sewer-toll-paid
entities:
  larry, sewer-hatch

# location castle-hall
x: 2, y: -2
title: Banquet Hall
examine: The ground floor of the castle, given over to one long table that seats forty and rarely does.
adjacent:
  castle-gate
  castle-kitchen
  castle-quarters
  castle-cellar

# location castle-kitchen
x: 3, y: -2
title: Castle Kitchen
examine: Copper overhead, a range along one wall, and staff who do not look up.
adjacent:
  castle-hall
entities:
  castle-range

# location castle-quarters
x: 2, y: -2, z: 1
title: Castle Quarters
examine: The second floor: bedrooms along one side, and a sewing room at the end with the door open.
adjacent:
  castle-hall
  castle-solar

# location castle-solar
x: 2, y: -2, z: 2
title: The Duke's Solar
examine: The top floor, and one room of it. The duke keeps his own counsel and most of the good chairs.
adjacent:
  castle-quarters
entities:
  the-duke

# location castle-cellar
x: 2, y: -2, z: -1
title: Castle Cellar
examine: Casks, cold air, and a drain in the floor carrying the noise of running water.
adjacent:
  castle-hall

// --- the sewers ---
//
// Two ways in, and which one you took is the difference between arriving in a
// clean room and arriving among the rats. Larry's hatch lands you in the
// entrance; Oolga's fallen wall lands you in the junction, which is where the
// rats are.

# location sewer-entrance
x: 1, y: -2, z: -1
title: Sewer Entrance
examine: A brick chamber under the hatch, swept clean and lit. Whoever pays the toll gets this much for it.
adjacent:
  castle-yard
  sewer-junction

# location sewer-junction
x: 2, y: -1, z: -1
title: Sewer Junction
examine: Four channels meet here under a low vault. Painted signs on the brick point up at the buildings above: MARKET, CASTLE, GATE.
adjacent:
  sewer-entrance
  sewer-outfall
  oolga-basement
entities:
  3 feral-rat, sewer-signs

# location sewer-outfall
x: 2, y: 0, z: -1
title: Sewer Outfall
examine: The channel widens and slows here, under a grate you can see daylight through. A barred door stands where the water goes.
adjacent:
  sewer-junction
  sewer-locked-room while barred-door.unlocked
entities:
  2 feral-rat, barred-door, outfall-grate

# location sewer-locked-room
x: 3, y: 0, z: -1
title: The Barred Room
examine: A dry room behind the water, kept by someone. A table, a shelf, and two things standing on their hind legs.
adjacent:
  sewer-outfall
entities:
  2 ratman, key-table

// --- Kelsa's land, out past the town ---

# location kelsa-farmhouse
x: 8, y: 3
title: Kelsa's Farmhouse
examine: A working farmhouse with the door wedged open. Nothing here stings.
adjacent:
  market-square
  apiary-field
  tunnel-mouth
entities:
  kelsa, george

# location apiary-field
x: 9, y: 3
title: The Apiary
examine: Three hives on the far side of the property, and the air between them is not calm.
adjacent:
  kelsa-farmhouse
  hive-mouth
entities:
  5 drone-bee, first-hive, second-hive

# location hive-mouth
x: 10, y: 3
title: The Third Hive
examine: The last hive, and the comb at its mouth is chewed through by something that was not a bee. @@@ Birds and the Bees wants this instanced and reset on entry; the engine has no instancing, so it is one ordinary room and the boss it holds belongs to that quest.
adjacent:
  apiary-field

# location tunnel-mouth
x: 8, y: 4
title: Tunnel Mouth
examine: A hole in the turf at the edge of Kelsa's land, shored with timber by somebody who knew how.
adjacent:
  kelsa-farmhouse
  tunnels

# location tunnels
x: 8, y: 5, z: -1
title: The Tunnels
examine: A dug passage running away from town, wide enough for two abreast. It has been used.
adjacent:
  tunnel-mouth
  ratkin-border
entities:
  4 feral-rat

// --- the border, and the swamp on the way to it ---

# location swamp-edge
x: 6, y: -4
title: Swamp Edge
examine: Where the road gives up and the ground starts drinking. Everything past here is aggressive.
adjacent:
  market-square
  swamp-mire

# location swamp-mire
x: 7, y: -5
title: The Mire
examine: Standing water to the knee. Thistle on the hummocks, root under the mud, and broken things half-buried where somebody dumped them.
adjacent:
  swamp-edge
entities:
  3 swamp-mollusk, 2 bog-lurker, herb-patch, dumped-crates

# location ratkin-border
x: 12, y: 6
title: The Ratkin Border
examine: An outpost of stakes and banked earth, and beyond it a country nobody from Tulsa has walked in.
adjacent:
  tunnels
entities:
  2 border-guard

// --- the cast ---
//
// Everyone the quest notes lean on, and nothing they do not. Each carries what
// is true of them whatever else is loaded; the lines they say while a quest
// stands are that quest's to add.

# entity mouse
title: Mouse
faction: world
examine: A boy hunched over the sewer grate, and when he turns his head his eyes are black all the way across and his ears twitch at nothing.

# entity town-crier
title: The Town Crier
faction: world
examine: A man with a bell he is not currently using and an opinion he certainly is.

# entity charlie-the-tramp
title: Charlie the Tramp
faction: world
examine: A tramp with his back to a warm wall and no intention of moving.

# entity sunny
title: Sunny
faction: world
examine: The owner of Sha Dynasty's, drying a glass she has already dried. She is said to be able to call any animal in and send it back out again.

# entity drunk-patron
title: A Drunk Patron
faction: world
examine: Face down. Breathing. Occasionally editorialising.

# entity larry
title: Larry
faction: world
examine: The guard sat on the sewer hatch. He is bored, underpaid, and has his nose pointed at your pack.

# entity castle-guard
title: Castle Guard
faction: world
examine: A guard of Tulsa, in the duke's colours, watching the road rather than you.

# entity guard-captain
title: The Guard Captain
faction: world
examine: The captain of the town guard, reading a report she has clearly read before.

# entity the-duke
title: The Duke
faction: world
examine: The duke of Tulsa. He hears everything and volunteers nothing.

# entity oolga
title: Grandma Oolga
faction: world
examine: A small old witch surrounded by more bottles than shelf. She looks you over the way a grocer looks over fruit.

# entity kelsa
title: Kelsa
faction: world
examine: The owner of the apiary, in a veil she has not bothered to lower.

# entity george
title: George
faction: world
examine: Kelsa's helper, and the one who will actually answer the question you asked.

# entity bladesmiths-son
title: The Bladesmith's Son
faction: world
examine: A young man at a cold forge, holding a hammer as though it were somebody else's.

# entity border-guard
title: Border Guard
faction: world
examine: A soldier of Yanodonin on the last piece of it, and not glad to be.

// --- the stores ---
//
// Buying is a trade written out: what it costs, what it hands over. There is
// no shop mechanism in the engine and this does not invent one.

# entity general-store
title: General Store
examine: Flour, water, rope, and a jar by the till for coins too bent to spend elsewhere.
sell bent coins:
  instant
  requires: has tutorial-island.bent-coin
  take: 1 tutorial-island.bent-coin
  give: 1 coin
  say: The grocer weighs it, shrugs, and gives you a good one.
buy flour:
  instant
  requires: has 4 coin
  take: 4 coin
  give: 1 tutorial-island.pot-of-flour
  say: A pot of milled flour, four coins.
buy water:
  instant
  requires: has 2 coin
  take: 2 coin
  give: 1 tutorial-island.jug-of-water
  say: A jug off the rack, two coins.

# entity fishing-supplies
title: Fishing Supplies
examine: Nets on hooks, line on spools, and a crate of herring on ice at the front.
buy net:
  instant
  requires: has 25 coin
  take: 25 coin
  give: 1 tutorial-island.fishing-net
  say: A net, twenty-five coins, and she throws in the advice for free.
buy herring:
  instant
  requires: has 6 coin
  take: 6 coin
  give: 1 herring
  say: A herring off the ice, six coins.

# entity woodcutters-stall
title: Woodcutter's Stall
examine: A rack of hand axes and a standing offer chalked on the board behind it.
buy axe:
  instant
  requires: has 15 coin
  take: 15 coin
  give: 1 hand-axe
  say: A hand axe, fifteen coins, and no warranty.
sell firewood:
  instant
  requires: has bundle-of-firewood
  take: 1 bundle-of-firewood
  give: 9 coin
  say: He counts out nine coins without looking up.

# entity oolgas-counter
title: Oolga's Counter
examine: A counter with nothing on it. Everything worth buying is on the shelves behind her, and the shelves are not for you.
ask after her wares:
  instant
  say: Oolga looks at the shelves, then at you, and something glints in her eye. @@@ Kill it with Fire is what opens this counter; until that module is loaded there is nothing to sell you.

// --- stations and props ---

# entity sewer-grate
title: Sewer Grate
examine: An iron grate in the cobbles. The water below it moves faster than you expect.

# entity outfall-grate
title: Grate
examine: A grate to the surface, market noise falling through it in pieces.

# entity sewer-signs
title: Painted Signs
examine: MARKET one way, CASTLE another, GATE a third. Whoever painted them was doing the town a favour.

# entity sewer-hatch
title: Sewer Hatch
examine: A hatch of banded iron, and Larry is sitting on it.

# entity broken-wall
title: Broken Wall
examine: The far wall has fallen into a brick channel that carries water. This is the way in that Charlie means.
squeeze through:
  instant
  relocate: sewer-junction
  set: heard-of-the-back-way
  say: You go through the gap sideways and come out where the channels meet.

# entity barred-door
title: Barred Door
examine: A barred door where the water goes, and the lock is old enough to be picked.
flags: unlocked
pick lock:
  hidden if: unlocked
  requires: has tutorial-island.lockpick
  time: 6
  xp: thieving 15
  on success:
    set: unlocked
    say: The wards give one at a time, and the last one gives properly.
unlock with the key:
  instant
  hidden if: unlocked
  requires: has sewer-key
  set: unlocked
  say: The key turns as though it had been waiting.

# entity key-table
title: Table
examine: A table with a key on it, and a book beside the key. @@@ Ball of a Boy wants the book to hold the procedure for turning a man into a ratman; the words are that quest's to write.
flags: taken
take the key:
  instant
  hidden if: taken
  give: 1 sewer-key
  set: taken
  say: You pocket the key.

# entity anvil
title: Anvil
examine: A good anvil, cold. It is not yours to use. @@@ A Grand Blade is what earns the use of it.
stations: anvil

# entity bar-stove
title: The Bar Stove
examine: The stove in the corner of Sha Dynasty's, and Sunny does not mind who cooks on it.
stations: stove

# entity castle-range
title: Castle Range
examine: A range the length of the wall, and one cook who will let you use the end of it.
stations: stove

# entity first-hive
title: The First Hive
examine: A hive, working. The comb is whole and the bees ignore you.
harvest comb:
  time: 8
  give: 1 honeycomb
  say: You cut a slab of comb out and leave the rest.

# entity second-hive
title: The Second Hive
examine: A hive, working, and louder than the first. The comb is whole.
harvest comb:
  time: 8
  give: 1 honeycomb
  say: You cut what you came for and step back before they mind.

# entity herb-patch
title: Herb Patch
examine: Thistle on the hummock, root under it, and one split leaf in the shade of the both of them.
pick thistle:
  time: 4
  give: 1 marsh-thistle
  say: You take the head off a marsh thistle.
pull root:
  time: 6
  give: 1 fen-root
  say: The root comes out of the mud with a sound you would rather not have heard.
take the leaf:
  time: 4
  give: 1 adders-tongue
  say: One split leaf, taken whole.

# entity dumped-crates
title: Dumped Crates
examine: Alchemy crates thrown into the bushes in a hurry, and among the straw a scatter of insect eggs, broken and badly wrong. @@@ The Swampy Menace wants this to be found in the order the herbs are; the crates say it plainly instead.

// --- what is already hostile ---

# entity feral-rat
title: Feral Rat
examine: A rat the size of a cat, hairless in patches and weeping where it is not.
stats: attack 9, defense 1, max-health 24, attack-rate 18, accuracy 65, evasion 35
uses: tutorial-island.melee-combat
faction: world
aggressive
respawn after: 3m
on death:
  credit:
    xp: tutorial-island.melee 6-9
    roll: feral-rat-remains

# entity ratman
title: Ratman
examine: A man's frame, a rat's head, and the join between them done badly on purpose.
stats: attack 14, defense 4, max-health 60, attack-rate 20, accuracy 85, evasion 40
uses: tutorial-island.melee-combat
faction: world
aggressive
respawn after: 10m
on death:
  credit:
    xp: tutorial-island.melee 40-55
    roll: ratman-remains

# entity drone-bee
title: Drone Bee
examine: A drone off one of Kelsa's hives, and it should not be this angry.
stats: attack 6, defense 0, max-health 14, attack-rate 30, accuracy 70, evasion 55
uses: tutorial-island.melee-combat
faction: world
aggressive
respawn after: 2m
on death:
  credit:
    xp: tutorial-island.melee 4-6

# entity swamp-mollusk
title: Swamp Mollusk
examine: A shell the size of a shield, and the foot under it is wet with something you would not touch.
stats: attack 11, defense 8, max-health 45, attack-rate 10, accuracy 60, evasion 5
uses: tutorial-island.melee-combat
faction: world
respawn after: 5m
on death:
  credit:
    xp: tutorial-island.melee 18-24
    give: 1 mollusk-venom

# entity bog-lurker
title: Bog Lurker
examine: Something long standing very still in water that is not deep enough to hide it.
stats: attack 16, defense 3, max-health 50, attack-rate 22, accuracy 80, evasion 45
uses: tutorial-island.melee-combat
faction: world
aggressive
respawn after: 5m
on death:
  credit:
    xp: tutorial-island.melee 25-35
    roll: swamp-pickings

// --- recipes ---

# recipe cooked-herring
station: stove
in: herring
out: cooked-herring
skill: cooking 3
time: 4
say: You grill the herring through, which is the only way it is worth eating.

// --- dialogue ---
//
// One node each, reached whenever nothing further along is. A quest that wants
// more of somebody gives them more; this is what is left when none does.

# dialogue mouse
owner = mouse

node forlorn:
  always
  again: It is still down there. He does not look up.
  I lost it. It went down there.
  He does not say what, and he does not look up.

# dialogue town-crier
owner = town-crier

node holding-forth:
  always
  again: Same offer. I am still right about everything, and still free.
  You want to know a thing? Ask me. I am right about everything and I am free.

# dialogue charlie
owner = charlie-the-tramp

node the-back-way:
  always
  again: The wall's still there. I already told you where.
  Everyone wants in the front. There is a wall down in the old witch's cellar and nobody minding it.
  set: heard-of-the-back-way

# dialogue sunny
owner = sunny

node behind-the-bar:
  always
  again: Stove's still there. Rest of it, ask properly — same as I said.
  Stove is over there, and I do not care what you cook on it. Anything else, you will have to ask properly.

# dialogue larry
owner = larry

node on-the-hatch:
  always
  again: Still nobody goes down. Still the duke's word, not mine.
  Nobody goes down. Duke's word, not mine.
  He shifts his weight and does not sound especially certain about the duke.

# dialogue castle-guard
owner = castle-guard

node on-the-gate:
  always
  again: Move along. Captain's round the side, same as I said.
  Move along. If it is trouble, it is the captain's, and she is round the side.

# dialogue guard-captain
owner = guard-captain

node reading:
  always
  again: Still nothing. I would have sent for you.
  If I have not sent for you, I have not got anything for you. Come back when I have.

# dialogue the-duke
owner = the-duke

node in-the-solar:
  always
  again: Say it or don't. I haven't got longer for you than that.
  You are here, so somebody let you be here. Say your piece.

# dialogue oolga
owner = oolga

node complaining:
  always
  again: Still was. Still wouldn't.
  It was better before. All of it. You would not remember.

# dialogue kelsa
owner = kelsa

node blunt:
  always
  again: Bees, or the door. I already told you which.
  If you are here about the bees, say so. If you are not, there is the door and it is a nice one.

# dialogue george
owner = george

node helpful:
  always
  again: Still like that. Still right, mostly.
  Do not mind her. She is like that with everyone, and she is right about most of it.

# dialogue bladesmiths-son
owner = bladesmiths-son

node at-the-cold-forge:
  always
  again: Still just the noise. Nothing's changed that.
  My father made blades. I make a noise like somebody making blades.

# dialogue border-guard
owner = border-guard

node at-the-stakes:
  always
  again: Same as before. We watch. We do not go in.
  Past the stakes is theirs. We watch it. We do not go in.

// --- saves ---

# save in-town
{"version":11,"location":"tulsa.market-square"}

// A pocket of curios out of the tutorial's rats, which is what a new arrival
// has to trade with and the whole of the town's on-ramp to money. The drawer
// and the rats between them hand out about this many.
# save in-town-with-bent-coins
{"version":11,"location":"tulsa.market-square","inventory":{"tutorial-island.bent-coin":8}}

// Down the back way with the lockpick from Miki's dresser, which is what
// anybody who came here for the barred door would be carrying.
# save at-the-sewer-junction
{"version":11,"location":"tulsa.sewer-junction","inventory":{"tutorial-island.lockpick":1},"flags":{"tulsa.heard-of-the-back-way":true}}

// --- tests ---

// The town is walkable, and every road it holds is walked. The list is long
// because a road is a fact about two named places and nothing derives it; what
// it is really proving is that every place has a way in and a way out, and
// dsl.test.ts makes that claim over the corpus without naming anybody.
# test walking-the-town
load: in-town
travel: market-row
travel: forge
travel: market-row
travel: market-rooftops
travel: market-row
travel: oolga-house
travel: tavern-street
travel: sha-dynastys
travel: tavern-street
travel: market-square
travel: castle-gate
travel: guard-barracks
travel: castle-gate
travel: castle-kitchen
travel: castle-solar
travel: castle-cellar
travel: castle-yard
travel: market-square
travel: kelsa-farmhouse
travel: hive-mouth
travel: tunnel-mouth
travel: market-square
travel: swamp-edge
travel: tutorial-island.market-district
assert: market-rooftops.discovered
assert: castle-solar.discovered
assert: hive-mouth.discovered
assert: tutorial-island.market-district.discovered

// The economy, end to end and in the smallest amount that closes: a curio the
// tutorial's rats drop becomes coin, coin becomes a herring, and the herring
// becomes the thing Larry's nose is pointed at.
# test a-bent-coin-becomes-a-cooked-herring
load: in-town-with-bent-coins
travel: market-row
use: entity.general-store.sell-bent-coins
use: entity.general-store.sell-bent-coins
use: entity.general-store.sell-bent-coins
use: entity.general-store.sell-bent-coins
use: entity.general-store.sell-bent-coins
use: entity.general-store.sell-bent-coins
assert: inventory.coin = 6
assert: inventory.tutorial-island.bent-coin = 2
use: entity.fishing-supplies.buy-herring
assert: has herring
assert: inventory.coin = 0
travel: tavern-street
travel: sha-dynastys
craft: cooked-herring
assert: has cooked-herring
assert: xp.tutorial-island.cooking > 0

// Charlie's back way. The wall in Oolga's cellar is the second entrance the
// notes say several people know about, and it puts you in among the rats
// rather than in Larry's swept room.
# test the-wall-in-oolgas-cellar-is-the-back-way
load: in-town
travel: market-row
travel: oolga-house
travel: oolga-basement
use: entity.broken-wall.squeeze-through
assert: heard-of-the-back-way
assert: sewer-junction.discovered

// A feral rat is aggressive, so arriving is the whole of starting the fight.
// Nothing is under way the instant a save is loaded, though, so the first tick
// of the clock is what lets the rat open it and `wait: done` runs it from
// there — without anybody guessing how long a rat takes.
# test a-feral-rat-picks-the-fight-itself
load: at-the-sewer-junction
wait: 1
wait: done
assert: resource.tutorial-island.health < 30

// Two ways past the barred door, and the door is the same door either way.
# test the-key-opens-the-barred-door
load: at-the-sewer-junction
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
assert: barred-door.unlocked
assert: xp.tutorial-island.thieving = 15
travel: sewer-locked-room
wait: done
use: entity.key-table.take-the-key
assert: has sewer-key
