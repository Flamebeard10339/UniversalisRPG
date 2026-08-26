// Tulsa — the starting town, and effectively the whole region the early game
// happens in. Read off `.planning/starting-town-outline.md` and the ten notes
// in `.planning/planning_quests/`.
//
// This module is the town STANDING: its places, the roads between them, the
// people who live there and what they sell, and the things that are already
// hostile. It holds no quest, and the game does not begin here — a quest module
// above it is what marks a # location starting. Every quest named in the notes
// gets a module of its own that gives these entities more to say — take those
// modules away and Tulsa still loads, and everyone here still has a word for a
// traveller.
//
// It depends on core for that furniture: the stat bases, the health pool, the
// death event, the factions, the player, and melee-combat.
//
// The archetype pack is optional and named that way: it is a list of jewels and
// items that stands nowhere, so the town is what says where the crate holding it
// sits and what is worth swinging at beside it. Take that pack out and the yard
// is still here — the crate, the urchin and the routes that walk them prune
// themselves, which is what an optional dependency is for.

# info tulsa
version: 1.0.0
dependencies:
  core
  ? combat-expansion

// --- flags ---
//
// World state no single prop owns. A flag that belongs to one door or one
// person is declared on that door or that person instead.

# flag heard-of-the-back-way

# flag sewer-toll-paid

// --- items ---

# item bottle-of-vodka
title: Bottle of Vodka
examine: Sunny's own. The label is hand-written and does not say what is in it.

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
// engine answers a road from both ends either way. Distances are uniform: five
// seconds of walking each.

// The square every road in town runs through, and the ground a player arrives on
// however they got out of the house the game begins in.
# location market-square
x: 3, y: 0
title: Market Square
examine: Awnings, shouting, and a sewer grate set into the cobbles with a boy hunched over it.
adjacent:
  market-row
  tavern-street
  castle-gate
  kelsa-farmhouse
  swamp-edge
entities:
  mouse, town-crier, sewer-grate, bench

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
flags: axe-taken
lift an axe off the rack:
  hidden if: axe-taken
  time: 5
  xp: thieving 12
  set: axe-taken
  give: 1 hand-axe
  say: You take the end axe off the rack while the woodcutter is counting somebody else's coin, and you are two stalls away before the gap in it shows.

// The roof layer the outline asks for, and the only way onto it is a climb.
// What it overlooks is a quest's business rather than the town's.
# location market-rooftops
x: 4, y: 0, z: 1
title: Market Rooftops
examine: Tile and thatch, and the castle's upper windows across the way.
adjacent:
  market-row
watch the castle windows:
  time: 8
  xp: thieving 5
  say: You lie flat on the warm tile and give the castle a long look. The second floor opens its shutters and leaves them open; one window on the third is shut against weather nobody else is shutting against. It means something to somebody. It does not yet mean anything to you.

# location forge
east of market-row
examine: A low stone shop with the fire banked. An anvil stands unused in the middle of the floor.
adjacent:
  market-row
  proving-ground
entities:
  bladesmiths-son, anvil

// The yard the smiths test what they have made in, and it is the town's rather
// than any expansion's: a walled fixture off the forge that is here whatever
// else is loaded.
# location proving-ground
north of forge
examine: A walled yard behind the armoury, sand raked flat and stained.
adjacent:
  forge
entities:
  armourers-chest, proving-post, spined-urchin

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
examine: The last hive, and the comb at its mouth is chewed through by something that was not a bee.
adjacent:
  apiary-field
look into the comb:
  time: 6
  say: You put your face to the gap. The comb is chewed out to the depth of your arm and the cut edges of it are still wet. Whatever did it is not in there now, and it did not leave the way you came in.

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
entities:
  dead-alder

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
// A store is a # shop the entity behind the counter keeps. What it stocks is
// what it has when nobody has been in; every one of them will take anything
// tradable off you, because none of them says otherwise.

# shop general-store
coin: coin
stocks:
  6 core.pot-of-flour
  10 core.jug-of-water

# entity general-store
title: General Store
examine: Flour, water, rope, and a jar by the till for coins too bent to spend elsewhere.
keeps shop: general-store

# shop fishing-supplies
coin: coin
stocks:
  3 core.fishing-net
  20 herring

# entity fishing-supplies
title: Fishing Supplies
examine: Nets on hooks, line on spools, and a crate of herring on ice at the front.
keeps shop: fishing-supplies

# shop woodcutters-stall
coin: coin
stocks:
  5 hand-axe

# entity woodcutters-stall
title: Woodcutter's Stall
examine: A rack of hand axes and a standing offer chalked on the board behind it.
keeps shop: woodcutters-stall

# entity oolgas-counter
title: Oolga's Counter
examine: A counter with nothing on it. Everything worth buying is on the shelves behind her, and the shelves are not for you.
ask after her wares:
  instant
  say: Oolga looks at the shelves, then at you, and puts her back to them. Nothing behind her is for sale, and she does not say what would change that.

// --- stations and props ---

// The only way back from a bad fight, and it sits in the square every road in
// town runs through. Sitting is worth ten regeneration for as long as you stay
// sat, on top of the one core gives everybody, so the bench does not restore a
// pool of its own and anything else that adds to that stat adds to this too.
# entity bench
title: Bench
examine: A bench along the wall under the awnings, worn shiny by people waiting on somebody.
sit down:
  continuous
  time: 60
  +10 regeneration
  on success:
    say: You sit a while longer, and some of it comes back.

# entity sewer-grate
title: Sewer Grate
examine: An iron grate in the cobbles. The water below it moves faster than you expect.
flags: reached
reach through the bars:
  hidden if: reached
  time: 6
  xp: thieving 3
  set: reached
  give: 1 core.bent-coin
  say: The gap takes your arm to the elbow and the cold takes the rest of you. What your fingers close on is a bent coin and a great deal of grit. Whatever the boy lost went under the castle a long time ago.

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
  requires: has core.lockpick
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
examine: A table with a key on it, and a book beside the key.
flags: taken
take the key:
  instant
  hidden if: taken
  give: 1 sewer-key
  set: taken
  say: You pocket the key.

# entity anvil
title: Anvil
examine: A good anvil, cold. It is not yours to use.
stations: anvil
strike it:
  instant
  say: You get one flat ring out of it before the smith's son is across the floor. Off it. That was my father's anvil, and it is not going to be you who makes it sound like something.

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

// The one thing in town that takes more than one swing and is not a fight.
// `damage:` with no `depletes:` counts down a whole of the action's own, so a
// swing is a quarter of a trunk and the log comes at the end of four of them.
// Continuous, so a pack is filled by standing there rather than by asking
// again — which is also the only place in the corpus that lights the live
// countdown a driver draws beside the progress bar.
# entity dead-alder
title: Dead Alder
examine: An alder leaning out over the water, dead and dry all the way through. Someone has already had the low branches.
chop a log:
  continuous
  requires: has hand-axe
  time: 3
  damage: felling
  give: 1 log
  xp: woodcutting 40
  on success:
    say: The trunk gives, and a round of alder rolls clear.

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
// One hummock and three plants, and it pays about the same by the minute
// whichever is taken: the leaf is worth twice the root and is twice the work.
take the leaf:
  time: 12
  give: 1 adders-tongue
  say: One split leaf, taken whole.

# entity dumped-crates
title: Dumped Crates
examine: Alchemy crates thrown into the bushes in a hurry, and among the straw a scatter of insect eggs, broken and badly wrong.

// --- what is already hostile ---

# entity feral-rat
title: Feral Rat
examine: A rat the size of a cat, hairless in patches and weeping where it is not.
stats: attack 9, defense 1, max-health 24, attack-rate 18, accuracy 65, evasion 35
uses: core.melee-combat
faction: world
aggressive
respawn after: 3m
on death:
  credit:
    xp: core.melee 6-9
    roll: feral-rat-remains

# entity ratman
title: Ratman
examine: A man's frame, a rat's head, and the join between them done badly on purpose.
stats: attack 14, defense 4, max-health 60, attack-rate 20, accuracy 85, evasion 40
uses: core.melee-combat
faction: world
aggressive
respawn after: 10m
on death:
  credit:
    xp: core.melee 40-55
    roll: ratman-remains

# entity drone-bee
title: Drone Bee
examine: A drone off one of Kelsa's hives, and it should not be this angry.
stats: attack 6, defense 0, max-health 14, attack-rate 30, accuracy 70, evasion 55
uses: core.melee-combat
faction: world
aggressive
respawn after: 2m
on death:
  credit:
    xp: core.melee 4-6

# entity swamp-mollusk
title: Swamp Mollusk
examine: A shell the size of a shield, and the foot under it is wet with something you would not touch.
stats: attack 11, defense 8, max-health 45, attack-rate 10, accuracy 60, evasion 5
uses: core.melee-combat
faction: world
respawn after: 5m
on death:
  credit:
    xp: core.melee 18-24
    give: 1 mollusk-venom

# entity bog-lurker
title: Bog Lurker
examine: Something long standing very still in water that is not deep enough to hide it.
stats: attack 16, defense 3, max-health 50, attack-rate 22, accuracy 80, evasion 45
uses: core.melee-combat
faction: world
aggressive
respawn after: 5m
on death:
  credit:
    xp: core.melee 25-35
    roll: swamp-pickings

// --- what stands in the proving ground ---
//
// The crate is stencilled for somebody who never came, and what is in it is the
// archetype pack's list of jewels; the post and the urchin are what the yard is
// for. None of the three is an expansion's business — an expansion is a list of
// jewels and items, and where they sit in the world is the town's to say.

# entity armourers-chest
title: Armourer's Chest
examine: A long crate, stencilled, and nobody has come for it.
flags: emptied
open:
  instant
  hidden if: emptied
  roll: combat-expansion.archetype-cache
  set: emptied
  say: Six jewels and a plain blade with room in it for one of them.

// Deep enough to survive a fight long enough to watch a pool fill, and it
// swings nothing back, so what a test reads off the player came from what the
// player is carrying.
# entity proving-post
title: Proving Post
examine: A banded post, chest high, and it has taken worse than you.
stats: max-health 2000, defense 0, evasion 0, accuracy 0

// Carries a passive and declares no action at all. Whatever hits it is hurt by
// hitting it, which is the whole of what an actor-carried persistent effect is
// for.
# entity spined-urchin
title: Spined Urchin
examine: A knot of black spines around something that has not moved in years.
stats: max-health 2000, defense 0, evasion 0, accuracy 0
passives: combat-expansion.retribution

// --- what stands in no room at all ---

// It stands in no room, so nobody can reach it. It stays because the two
// recorded growth tests below are the only route to a cluster plane, and a
// DEBUG section is how the engine keeps one out of a player's hands.
# entity smiths-chest
DEBUG
flags: emptied
open:
  instant
  hidden if: emptied
  roll: smiths-cache
  set: emptied

// --- recipes ---

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

// Three threads rather than one line, which is what a bar is for. Each is
// named, so all three stand in the list at once and a quest that gives her a
// fourth stands in it beside them. Sticky, because a barmaid answers the same
// question as often as it is asked.
# dialogue sunny
owner = sunny

node the-stove:
  always
  sticky
  ask: Can I use the stove?
  It is in the corner and I do not care what you cook on it. Wipe it after.

node the-bottle:
  always
  sticky
  ask: What is in the vodka?
  My own. I do not write it on the label because then people would not drink it.

node the-animals:
  always
  sticky
  ask: They say you can call animals in.
  They say a lot in here, and most of it after the third one. Some of it is true.

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
  sticky
  If you are here about the bees, say so. If you are not, there is the door and it is a nice one.
  -> I am here about the bees.
    goto the-third-hive
  -> Not the bees.
    goto the-door

node the-third-hive:
  Third hive, end of the row. Something has been in it that was never a bee, and I have not been down to look at what.
  Ask George. He has the patience for the whole of it and I have not.

node the-door:
  Then there it is, and mind the step on your way through it.

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
{"version":13,"location":"tulsa.market-square"}

// What a new arrival walks into town holding and nothing takes back off them,
// standing in the row that would buy either.
# save in-town-with-a-sword-and-a-shield
{"version":13,"location":"tulsa.market-row","inventory":{"core.wooden-shield":1},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

// A pocket of curios out of a new arrival's first fights, which is what they
// have to trade with and the whole of the town's on-ramp to money. About this
// many is what walks in.
# save in-town-with-bent-coins
{"version":13,"location":"tulsa.market-square","inventory":{"core.bent-coin":8}}

// Out of a fight and back in the square with eleven of thirty left, which is
// about what the three playtest runs walked into town holding.
# save hurt-in-town
{"version":13,"location":"tulsa.market-square","resources":{"core.health":11000}}

// Down the back way with a lockpick, which is what anybody who came here for
// the barred door would be carrying.
# save at-the-sewer-junction
{"version":13,"location":"tulsa.sewer-junction","inventory":{"core.lockpick":1},"flags":{"tulsa.heard-of-the-back-way":true}}

# save axe-at-the-swamp-edge
{"version":13,"location":"tulsa.swamp-edge","inventory":{"core.hand-axe":1}}

# save growing-a-heartwood-blade-start
{"version":13}

# save growing-a-heartwood-blade-end
{"version":13,"inventory":{"core.stout-heart-jewel":1,"core.tempered-will-jewel":1,"core.great-work-jewel":1,"core.orb-of-the-edge":1,"core.orb-of-the-bulwark":1,"core.orb-of-renewal":1},"flags":{"tulsa.smiths-chest.emptied":true},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.heartwood-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":"core.heartwood-core","entry":null,"roll":0.6093358164653182,"allocatedPositions":[2,3],"allocatedSlots":["ne","e"],"effects":["core.orb-of-vitality"]},"1,-1":{"jewel":"core.keen-edge","entry":"ne","roll":0.06484867143444717,"allocatedPositions":[1,2,3,4,5],"allocatedSlots":[],"effects":["core.orb-of-the-edge","core.lesser-orb-of-the-edge"]},"1,0":{"jewel":"core.crossroads","entry":"e","roll":0.545911343768239,"allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"core.causeway","entry":"e","roll":0.2666903811041266,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":1145426465}

# save growing-through-the-inventory-screen-end
{"version":13,"inventory":{"core.stout-heart-jewel":1,"core.tempered-will-jewel":1,"core.great-work-jewel":1,"core.causeway-jewel":1,"core.orb-of-vitality":1,"core.orb-of-the-edge":2,"core.lesser-orb-of-the-edge":1,"core.orb-of-the-bulwark":1,"core.orb-of-renewal":1},"flags":{"tulsa.smiths-chest.emptied":true},"equipped":{"mainhand":"2"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.heartwood-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":"core.heartwood-core","entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"core.crossroads","entry":"e","roll":0.06484867143444717,"allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]},"2,-1":{"jewel":"core.keen-edge","entry":"ne","roll":0.545911343768239,"allocatedPositions":[1],"allocatedSlots":[],"effects":[]}}}}}},"rng":2344671368}

// --- tests ---

// The town is walkable, and every road it holds is walked. The list is long
// because a road is a fact about two named places and nothing derives it; what
// it is really proving is that every place has a way in and a way out, and
// dsl.test.ts makes that claim over the corpus without naming anybody. The road
// on out of the square is written and walked by the module at the far end of it.
# test walking-the-town
load: in-town
travel: market-row
travel: forge
travel: proving-ground
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
assert: market-rooftops.discovered
assert: castle-solar.discovered
assert: hive-mouth.discovered

// The economy, end to end and in the smallest amount that closes: a curio the
// a new arrival's first fights leave behind becomes coin, coin becomes a herring, and the herring
// becomes the thing Larry's nose is pointed at.
# test a-bent-coin-becomes-a-cooked-herring
load: in-town-with-bent-coins
travel: market-row
shop: general-store
submit-modal: item=sell:core.bent-coin
submit-modal: count=6
submit-modal: item=close
assert: inventory.coin = 6
assert: inventory.core.bent-coin = 2
shop: fishing-supplies
submit-modal: item=buy:core.herring
submit-modal: count=1
submit-modal: item=close
assert: has herring
assert: inventory.coin = 0
travel: tavern-street
travel: sha-dynastys
craft: cooked-herring
assert: has cooked-herring
assert: xp.core.cooking = 3

// A weapon base is a good like any other, which is a thing the counter can only
// say by paying for one: a shop takes anything tradable it is offered, and what
// makes these tradable is the `value:` each declares. Twenty-eight is what the
// store's own rate leaves of a twenty-four and a twelve, rounded its way both
// times.
# test a-sword-and-a-shield-are-goods-at-a-counter
load: in-town-with-a-sword-and-a-shield
shop: general-store
submit-modal: item=sell:1
submit-modal: count=1
submit-modal: item=sell:core.wooden-shield
submit-modal: count=1
submit-modal: item=close
assert: inventory.coin = 28
assert: not has core.iron-sword
assert: not has core.wooden-shield

// The two things in the market a light hand gets, and fifteen is the whole of
// what they are worth: three at the grate and twelve off the rack. Each sets
// its own flag, which is what its own `hidden if:` reads, so neither is a
// second helping — and the axe is the tool the dead alder wants, which is why
// the rack is worth a hand at all.
# test the-market-is-fifteen-thieving-xp-to-a-light-hand
load: in-town
use: entity.sewer-grate.reach-through-the-bars
assert: has core.bent-coin
assert: sewer-grate.reached
travel: market-row
use: location.market-row.lift-an-axe-off-the-rack
assert: has core.hand-axe
assert: market-row.axe-taken
assert: xp.core.thieving = 15

// Kelsa asks a question and the player can answer it, which is the whole of
// this: the answer is a choice on her own line, and where it lands is George,
// who her line says has the patience she has not. The answer is named by the
// words it is written with here, so it stays the same answer in a language
// that has moved every word she says.
# test kelsa-takes-the-answer-she-asks-for
load: in-town
travel: kelsa-farmhouse
talk: kelsa
choose: I am here about the bees.
choose: continue
assert: kelsa.the-third-hive.visits = 1

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
assert: resource.core.health < 30

// What the fighting costs, got back. A minute standing about in the square is
// worth one health and a minute on the bench is worth eleven, because sitting
// adds ten to the regeneration everybody already has one of rather than
// restoring a pool of its own. The bench is continuous, so the second minute
// is had by staying put and not by sitting down again.
# test the-bench-is-where-health-comes-back
load: hurt-in-town
assert: resource.core.health = 11
wait: 60
assert: resource.core.health = 12
use: entity.bench.sit-down
assert: resource.core.health = 23
wait: 60
assert: resource.core.health = 30

// The only action in the corpus that takes more than one swing without being a
// fight. Four swings of three seconds is where the twelve comes from, and the
// twelve is the claim: an assertion on the log alone would also hold in a world
// where one swing felled the tree. What the four swings cost is read off
// `felling` and nothing here restates it.
# test a-log-costs-four-swings-of-an-axe
load: axe-at-the-swamp-edge
use: entity.dead-alder.chop-a-log
assert: time = 12
assert: inventory.core.log = 1
assert: xp.core.woodcutting = 40

// Sunny keeps three threads open at once, so talking to her is the list and
// not a line, and a thread taken stays open because each is sticky — the third
// talk still finds all three there, which is what taking three named ones off
// three consecutive lists proves. Each is named rather than counted to: the
// list is ordered by the words a player reads, so the three stand in a
// different order in every language, and this route is replayed in a
// translated universe. That ordering is `conversation.test.ts`'s to pin.
# test sunny-has-three-things-to-say
load: in-town
travel: tavern-street
travel: sha-dynastys
talk: sunny
choose: sunny.the-stove
choose: continue
talk: sunny
choose: sunny.the-bottle
choose: continue
talk: sunny
choose: sunny.the-animals
choose: continue
assert: sunny.the-stove.visits = 1
assert: sunny.the-bottle.visits = 1
assert: sunny.the-animals.visits = 1

// Two ways past the barred door, and the door is the same door either way. The
// key comes off the table with both ratmen still standing on it: taking it is
// instant and gated on nothing, and nobody who got this far on what the rats
// leave behind wins that fight.
# test the-key-opens-the-barred-door
load: at-the-sewer-junction
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
assert: barred-door.unlocked
assert: xp.core.thieving = 15
travel: sewer-locked-room
use: entity.key-table.take-the-key
assert: has sewer-key

// --- growing an item ---
//
// Core's cluster planes, walked from the DEBUG smith's chest, which is the only
// thing left that puts a jewel in anyone's hands and stands in no location.
//
// Recorded from a live session with /create-valid-test, so what follows is what
// a player types and the closing sheet is where that session ended: both grown
// copies, their planes, every allocation, and the effects each cluster carries.
// Regenerate with /create-valid-test when this content changes on purpose.
//
// What this route claims is written as its refusals — each one names a growth
// the plane must not take, and there are six of them. The plane itself is what
// no condition can name, so the sheet keeps it: `instances` is compared whole
// even under `expect only:`, so every hex, jewel, point and orb below is still
// pinned exactly — and so is every roll, which is how a recorded run proves a
// level is drawn once and never drawn again.
//
// The chest hands out two blades, and each arrives already a copy of its own
// with its level rolled: the Heartwood Blade is 1 and the Iron Sword is 2, and
// neither was ever in a stack to be lifted out of one.
//
// The Heartwood Blade's origin is a spindle whose root, position 1, is
// allocated from the start and free. Both of its jewel slots hang off position
// 3, so either one costs two points to reach before the slot itself.
# test growing-a-heartwood-blade
DEBUG
load: growing-a-heartwood-blade-start
use: entity.smiths-chest.open
// A template names no copy: the points belong to the id the chest handed
// over, and an item id is not one of them.
refuse: allocate heartwood-blade at 0,0 position 2
// Out of adjacency: position 3 touches only position 2 and the two slots,
// and the point to pay for it is in hand.
refuse: allocate 1 at 0,0 position 3
allocate: 1 at 0,0 position 2
allocate: 1 at 0,0 position 3
allocate: 1 at 0,0 slot ne
slot: 1 at 0,0 ne with keen-edge-jewel
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with crossroads-jewel
// Slotting is permanent: a filled slot refuses a second jewel forever.
refuse: slot 1 at 0,0 e with causeway-jewel
// Allocation is permanent too, and this is asked with points still spare so
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
// back to. It came out of the same chest, with a level rolled the same way.
allocate: 2 at 0,0 slot e
slot: 2 at 0,0 e with causeway-jewel
expect only: growing-a-heartwood-blade-end

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
// the inventory it was opened from, and equips the copy it just grew.
//
// The chest handed the sword over as a copy already, so the inventory names it
// by id: the row the player opens is 2, and the points it spends below were
// rolled when the chest was opened rather than bought afterwards.
# test growing-through-the-inventory-screen
DEBUG
load: growing-a-heartwood-blade-start
use: entity.smiths-chest.open
open-modal: carried-items
submit-modal: item=2
submit-modal: verb=grow
submit-modal: plane=allocate: slot e
submit-modal: plane=slot: e with core.crossroads-jewel
submit-modal: plane=go: 1,0
submit-modal: plane=allocate: position 1
submit-modal: plane=allocate: slot ne
submit-modal: plane=slot: ne with core.keen-edge-jewel
submit-modal: plane=go: 2,-1
submit-modal: plane=allocate: position 1
submit-modal: plane=back
submit-modal: verb=equip
open-modal: carried-items
submit-modal: item=close
// A worn item's plane is folded into the wearer's stats, so this one number is
// both halves of what `verb=equip` did: 16 is the player's own 10, the 1 each
// that melee and thieving grant for standing at level 1, the iron sword's 2,
// and the 2 that `whetted` carries at position 1 of the ring slotted two hexes
// out. Nothing else on this route touches attack.
assert: stat.attack = 16
expect only: growing-through-the-inventory-screen-end

// --- the archetype routes, walked in the proving ground ---
//
// The jewels are combat-expansion's list and stand nowhere; the yard, the crate
// and the two things in it are this module's, so a route that walks one is
// written here. Every route below opens on the save under it or on a copy of
// it, because a save is the smallest thing that puts a player in front of the
// crate.

# save at-the-proving-ground
{"version":13,"location":"tulsa.proving-ground","flags":{"tulsa.proving-ground.discovered":true}}

// Recorded from live sessions with /create-valid-test, so what each route
// spells is what a player typed and the closing sheet is where that session
// ended. Regenerate the same way when this content changes on purpose.
//
// The sheets close on `expect only:`, which compares just the keys the save
// names, and what each route actually claims is written above it as `assert:`.
// A buff held by the struck party and an enemy's pool are the two things no
// condition can name — those stay the sheet's to say.
//
// Every route grows the same plain blade, and the crate hands it over already
// a copy of its own with its level rolled: the base's bare east slot takes the
// jewel, and what differs between the routes is which positions the points
// were spent on.

// The berserker's resource. Rage is granted only by a landed swing and bled
// back only by the passive that grants it, so the whole of what the closing
// sheet records about the pool came from the hexagon this route allocated.
# test rage-rises-as-swings-land
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat-expansion.wrath-jewel
// Position 1 is the entry the slot put the jewel's root on; the hub is one
// step from it and is where the signature passive sits.
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: core.melee-combat on proving-post
wait: 30
// rising-fury is the only source of max-rage on this route, so the stat root
// reading 20 back is the jewel's allocation and nothing else.
assert: stat.combat-expansion.max-rage = 20
// Twelve of the thirteen swings landed, granting 36 where the rate bled 15
// back over the same thirty seconds. That is 21 into a pool the jewel caps at
// 20, so what the reading shows is the ceiling less the sliver that bled after
// the last landed swing — not what the swings added up to.
assert: resource.combat-expansion.rage = 19.8
expect only: rage-rises-as-swings-land-end

// The other half of the same arc, and the half a stack count cannot have: the
// rate keeps running once the swinging stops.
# test rage-drains-when-the-swinging-stops
run: rage-rises-as-swings-land
cancel
wait: 60
// The pool still exists — the passive granting the ceiling is still allocated —
// and a minute of the rate with nothing granting has emptied it.
assert: stat.combat-expansion.max-rage = 20
assert: resource.combat-expansion.rage = 0
expect only: rage-drains-when-the-swinging-stops-end
# save at-the-proving-ground-with-a-tally
DEBUG
{"version":13,"location":"tulsa.proving-ground","flags":{"tulsa.proving-ground.discovered":true},"inventory":{"combat-expansion.vigor-tally":1}}

// The gate is a wrapper and the payload stacks, so what a minute of swinging
// leaves the player holding is several instances of one declaration, each on
// its own clock, rather than one that keeps being refreshed. `quickening` is
// allocated beside `spurred` and reads how many are held; the two are separate
// passives on separate points, which is what makes them separable.
# test accelerated-vigor-stacks-behind-its-gate
DEBUG
load: at-the-proving-ground-with-a-tally
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat-expansion.wrath-jewel
// Round the outer ring rather than across the hub, so the rage passive is not
// allocated and nothing in this sheet came from it.
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 2
allocate: 1 at 1,0 position 6
allocate: 1 at 1,0 position 5
equip: 1
equip: combat-expansion.vigor-tally
use: core.melee-combat on proving-post
wait: 60
// Eight instances held at the end of the minute, counted and not inferred: the
// tally is one evasion a stack and nothing else on this route touches that
// stat, so the reading is the number of them rather than arithmetic over the
// base attack-rate, the payload's own figure and the passive that reads how
// many are held, none of which the count answers to.
assert: stat.evasion = 6
// The arithmetic the count above refuses to do, which is the other half of the
// pair and the only reading `quickening` reaches: 25 of base and six stacks of
// a payload worth +2 is 37 added, raised 18% by a passive reading six at 3%
// apiece. A `quickening` granting nothing reads 37, and a payload worth
// anything else moves the added half.
assert: stat.attack-rate = 43.66
expect only: accelerated-vigor-stacks-behind-its-gate-end

// The payload's own duration is the only thing that ends a stack — nothing
// refreshes one once the swinging stops — and each runs on the clock it was
// granted on rather than all of them together. Half a minute after the last
// swing the earliest one has lifted and five are held; a minute after it none
// are. A payload that lasted longer than its declaration says would read six
// at both.
# test accelerated-vigor-lifts-on-each-stacks-own-clock
DEBUG
run: accelerated-vigor-stacks-behind-its-gate
cancel
wait: 30
assert: stat.evasion = 5
wait: 30
assert: stat.evasion = 0

// The debuff is held by the struck party rather than by the swinger, which is
// what the closing sheet shows: the venom is under the post's name and its
// health is falling faster than the swings alone took it.
# test poison-holds-the-struck-enemy
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat-expansion.creeping-rot-jewel
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: core.melee-combat on proving-post
wait: 10
// The swinger's own regeneration is untouched. Venom is -30 on a stat whose
// base is 1, so a swinger holding its own venom would read well under zero;
// this is the half of "on them" that the player's sheet can say. That the post
// holds it, and that its health is falling faster than the swings took it, is
// the closing sheet's to say — no condition names another actor's buffs.
assert: stat.regeneration > 0
expect only: poison-holds-the-struck-enemy-end

// Nothing refreshes it once the swinging stops, and the duration on the
// declaration is the only thing that says when it ends.
//
// `expect:` and not `expect only:`, because the claim is an absence: the post
// no longer holds the venom. `expect only:` compares just the keys a save
// names, and a sheet recorded after the buff lifted has stopped naming it —
// which would leave this passing in a world where poison never expires. Only
// the whole sheet can say a thing is gone. No assertion can stand in either:
// the buff is on the struck party and the condition roots read the player.
# test poison-lifts-when-its-own-duration-runs-out
run: poison-holds-the-struck-enemy
cancel
wait: 30
expect: poison-lifts-when-its-own-duration-runs-out-end

// Thorns, carried by something that swings nothing and declares no action at
// all. The urchin never attacks, so nothing but the thorns can have taken any
// health off the player: five landed swings at five apiece is 25 of the 30 the
// player has, and only regeneration gave any of it back.
# test striking-a-thorned-enemy-costs-the-striker
load: at-the-proving-ground
// The thorns are the urchin's and not the player's: the jewel of the same name
// is still in the crate. Naming it is also what ties this route to the pack the
// urchin's passive comes from, so a world without that pack drops the route
// rather than replaying it against an urchin that has stopped being thorned.
assert: not has combat-expansion.retribution-jewel
use: core.melee-combat on spined-urchin
wait: 10
assert: resource.core.health < 10
expect only: striking-a-thorned-enemy-costs-the-striker-end

// The take-back rule walked from shipped content rather than only from a unit
// test: a leaf comes back for its point, a node something still stands on is
// refused, and a socket is refused whatever else is true of it.
# test a-plane-unwinds-from-its-leaves-and-never-out-from-under-a-jewel
DEBUG
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat-expansion.wrath-jewel
refuse: unallocate 1 at 0,0 slot e
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 2
refuse: unallocate 1 at 1,0 position 1
unallocate: 1 at 1,0 position 2
unallocate: 1 at 1,0 position 1

// --- the sheets those routes ended on ---

# save rage-rises-as-swings-land-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.armourers-chest.emptied":true},"resources":{"combat-expansion.rage":19800},"equipped":{"mainhand":"1"},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":1200,"attemptsMade":13}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.proving-post"}},"actors":{"tulsa.proving-post":{"resources":{"core.health":1814467,"combat-expansion.rage":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":32400,"rng":3953799810}

# save rage-drains-when-the-swinging-stops-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"location":"tulsa.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":92400,"rng":3953799810}

# save accelerated-vigor-stacks-behind-its-gate-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.armourers-chest.emptied":true},"equipped":{"mainhand":"1","offhand":"combat-expansion.vigor-tally"},"buffs":{"player":[{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":88800},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":97428},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":107183},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":112508},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":119000},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":121980}]},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":420,"attemptsMade":30}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.proving-post"}},"actors":{"tulsa.proving-post":{"resources":{"core.health":1562127,"combat-expansion.rage":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,2,6,5],"allocatedSlots":[],"effects":[]}}}}}},"time":62400,"rng":829729617}

# save poison-holds-the-struck-enemy-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"buffs":{"tulsa.proving-post":[{"source":"combat-expansion.venom","tags":[{"kind":"keyword","value":"poison"},{"kind":"stat-bonus","statId":"core.regeneration","percent":false,"amount":{"min":-30,"max":-30}},{"kind":"duration","seconds":20}],"expiresAt":32000}]},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.proving-post"}},"actors":{"tulsa.proving-post":{"resources":{"core.health":1925495,"combat-expansion.rage":0},"rateRemainders":{"core.health":40000}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":12400,"rng":2882385315}

# save poison-lifts-when-its-own-duration-runs-out-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"tulsa.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"location":"tulsa.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":42400,"rng":2882385315}

# save striking-a-thorned-enemy-costs-the-striker-end
{"version":13,"flags":{"tulsa.proving-ground.discovered":true},"resources":{"core.health":5206},"resourceRateRemainders":{"core.health":40000},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.spined-urchin"}},"actors":{"tulsa.spined-urchin":{"resources":{"core.health":1941505,"combat-expansion.rage":0},"rateRemainders":{"core.health":40000}}}},"time":12400,"rng":1288631604}

