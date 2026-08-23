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
// Miki's guide house, the rooms under and over it and the beach east of it are
// here too, and the game begins in them. They are the region's, not the
// engine's: what core keeps is the furniture every region would want.
//
// It depends on core for that furniture: the stat bases, the health pool, the
// death event, the factions, the player, and melee-combat.

# info tulsa
version: 1.0.0
dependencies:
  core

// --- flags ---
//
// World state no single prop owns. A flag that belongs to one door or one
// person is declared on that door or that person instead — the last two below
// are set by the mirror and by the rats, but the tutorial quest is what reads
// them, so neither is that object's private business.

# flag heard-of-the-back-way

# flag sewer-toll-paid

# flag mirror-done

# flag rats-killed

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
// engine answers a road from both ends either way. Distances are in the units
// Miki's house already set: five seconds of walking each.

// However a route leaves the guide house, it lands on the beach and the beach
// road runs here — so this is the shared ground every route's test converges
// on, as well as the square every road in town runs through.
# location market-square
x: 3, y: 0
title: Market Square
examine: Awnings, shouting, and a sewer grate set into the cobbles with a boy hunched over it.
adjacent:
  beach
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
examine: Tile and thatch, and the castle's upper windows across the way. @@@ Attention to Detail wants a vantage on the duke from up here; the watch is written and what it is worth seeing is that quest's to say.
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

// --- Miki's guide house, and the sand between it and the town ---
//
// Where a new game begins. Three rooms and a front door, and east of the door a
// beach whose road runs into the square: however a player gets out of the house,
// this is the ground they cross to reach everything above.

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
examine: Pale sand and the sound of the tide, and the road into town running the other way.
adjacent:
  guide-house
  market-square

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
  say: Oolga looks at the shelves, then at you, and puts her back to them. Nothing behind her is for sale, and she does not say what would change that. @@@ Kill it with Fire is what opens this counter; until that module is loaded there is nothing to sell you.

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

// --- who and what stands in the guide house ---

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
examine: A tall mirror in a gilt frame. Whoever stands in front of it comes away with a name and a people, and may stand in front of it again as often as they like. The first look is free. Every look after it wants a thousand coin, and the glass is not sentimental about it.
look in:
  instant
  hidden if: mirror-done
  open modal: choose-race
  open modal: name-yourself
  set: mirror-done
  on success:
    say: The glass gives you back a name and a people. Come and change your mind whenever you like - it will want paying next time, but it will not turn you away.
look in again:
  instant
  hidden if: not mirror-done
  take: 1000 coin
  open modal: choose-race
  open modal: name-yourself
  on success:
    say: The coin goes somewhere behind the frame. The glass clears, and waits to be told who you are this time.
  on failure:
    say: The glass shows you exactly what you are carrying, and it is not enough to be looked at twice.

# entity oven
examine: A stone oven, its coals still glowing.
stations: oven
roast chestnuts:
  continuous
  requires: has raw-chestnut
  rate: cooking-rate
  take: 1 raw-chestnut
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
examine: A casement over the water, its latch worn bright by somebody's thumb. It is a long drop to the sand and nothing on the way down to slow it.
climb out:
  instant
  relocate: beach
  drain: 5 health
  say: You get a leg over the sill, hang off it as long as your arms will have it, and let go. The sand takes most of the drop and your ankles take the rest.
fish:
  instant
  requires: has fishing-net
  hidden if: has fish
  give: 1 fish
  say: You drop the net off the sill and haul it up hand over hand. One fish in it, and it is not pleased about any part of this.

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

// Miki has a word for a traveller whatever else is loaded. A quest that wants
// more of him gives him more to say; this is what is left when none is.
# dialogue miki
owner = miki

node greeting:
  always
  Well met. Miki, they call me - I keep an eye on this stretch of coast.
  There's a mirror upstairs if you've a mind to know your own face, and rats in the basement if you haven't.

// --- saves ---

# save in-town
{"version":12,"location":"tulsa.market-square"}

// A pocket of curios out of the tutorial's rats, which is what a new arrival
// has to trade with and the whole of the town's on-ramp to money. The drawer
// and the rats between them hand out about this many.
# save in-town-with-bent-coins
{"version":12,"location":"tulsa.market-square","inventory":{"core.bent-coin":8}}

// Out of a fight and back in the square with eleven of thirty left, which is
// about what the three playtest runs walked away from the cellar rats holding.
# save hurt-in-town
{"version":12,"location":"tulsa.market-square","resources":{"core.health":11000}}

// Down the back way with the lockpick from Miki's dresser, which is what
// anybody who came here for the barred door would be carrying.
# save at-the-sewer-junction
{"version":12,"location":"tulsa.sewer-junction","inventory":{"core.lockpick":1},"flags":{"tulsa.heard-of-the-back-way":true}}

# save dresser-trinket-end
{"version":12,"inventory":{"core.lockpick":1},"flags":{"tulsa.dresser.searched":true,"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true},"resources":{},"location":"tulsa.guide-house-upstairs","rng":2617077404}

# save explored-and-unlocked
{"version":12,"flags":{"tulsa.front-door.unlocked":true,"tulsa.beach.discovered":true}}

// Standing at the oven with something to roast. Nothing in the world grants a
// raw chestnut, so this save is the only way the continuous cadence is reached.
# save chestnuts-in-hand
{"version":12,"inventory":{"core.raw-chestnut":3}}

# save axe-at-the-swamp-edge
{"version":12,"location":"tulsa.swamp-edge","inventory":{"core.hand-axe":1}}

# save growing-a-heartwood-blade-start
{"version":12,"flags":{"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true,"tulsa.basement.discovered":true}}

# save growing-a-heartwood-blade-end
{"version":12,"inventory":{"core.heartwood-blade":0,"core.iron-sword":0,"core.whetstone":2,"core.masters-whetstone":1,"core.keen-edge-jewel":0,"core.stout-heart-jewel":1,"core.tempered-will-jewel":1,"core.great-work-jewel":1,"core.causeway-jewel":0,"core.crossroads-jewel":0,"core.orb-of-vitality":0,"core.orb-of-the-edge":1,"core.lesser-orb-of-the-edge":0,"core.orb-of-the-bulwark":1,"core.orb-of-renewal":1},"flags":{"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true,"tulsa.basement.discovered":true,"tulsa.smiths-chest.emptied":true},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.heartwood-blade","payload":{"experience":14000,"plane":{"0,0":{"jewel":"core.heartwood-core","entry":null,"allocatedPositions":[2,3],"allocatedSlots":["ne","e"],"effects":["core.orb-of-vitality"]},"1,-1":{"jewel":"core.keen-edge","entry":"ne","allocatedPositions":[1,2,3,4,5],"allocatedSlots":[],"effects":["core.orb-of-the-edge","core.lesser-orb-of-the-edge"]},"1,0":{"jewel":"core.crossroads","entry":"e","allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"experience":20000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"core.causeway","entry":"e","allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save growing-through-the-inventory-screen-end
{"version":12,"inventory":{"core.heartwood-blade":1,"core.iron-sword":0,"core.whetstone":6,"core.masters-whetstone":3,"core.keen-edge-jewel":0,"core.stout-heart-jewel":1,"core.tempered-will-jewel":1,"core.great-work-jewel":1,"core.causeway-jewel":1,"core.crossroads-jewel":0,"core.orb-of-vitality":1,"core.orb-of-the-edge":2,"core.lesser-orb-of-the-edge":1,"core.orb-of-the-bulwark":1,"core.orb-of-renewal":1},"flags":{"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true,"tulsa.basement.discovered":true,"tulsa.smiths-chest.emptied":true},"equipped":{"mainhand":"1"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"experience":10000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"core.crossroads","entry":"e","allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]},"2,-1":{"jewel":"core.keen-edge","entry":"ne","allocatedPositions":[1],"allocatedSlots":[],"effects":[]}}}}}}}

// A purse with the price of a second look in it, and a purse a coin short of
// one, standing in the room the mirror is in.
# save at-the-mirror-with-a-thousand-coin
{"version":12,"location":"tulsa.guide-house","inventory":{"core.coin":1000}}

# save at-the-mirror-one-coin-short
{"version":12,"location":"tulsa.guide-house","inventory":{"core.coin":999}}

# save renamed-at-the-mirror
{"version":12,"player":{"name":"Wren","race":"core.orc"},"inventory":{"core.coin":0}}

# save named-once-with-nine-hundred-and-ninety-nine-coin
{"version":12,"player":{"name":"Rowan","race":"core.elf"},"inventory":{"core.coin":999}}

// --- tests ---

// The first look at the mirror is free and every look after it is a thousand
// coin. The claim is the difference across the second look — a purse of a
// thousand is untouched by the first and empty after the second — so a price
// that moved would fail here rather than pass inside a band.
# test the-mirror-charges-nothing-once-and-a-thousand-coin-after
load: at-the-mirror-with-a-thousand-coin
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
assert: mirror-done and inventory.coin = 1000
use: entity.mirror.look-in-again
submit-modal: name=Wren
submit-modal: race=core.orc
assert: inventory.coin = 0
expect only: renamed-at-the-mirror

// What a player who cannot pay sees. The action stays on the mirror rather
// than hiding itself, because a mirror that vanishes is what a playtester
// reads as a broken save; it takes the look, says what is missing, and leaves
// the purse and the character exactly as they were.
# test a-purse-a-coin-short-is-turned-away-and-charged-nothing
load: at-the-mirror-one-coin-short
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
use: entity.mirror.look-in-again
assert: inventory.coin = 999 and player.name and player.race
expect only: named-once-with-nine-hundred-and-ninety-nine-coin

// The name is asked first and the race second, which this proves by answering
// them in that order: the race screen has no `name` to answer, so a run that
// asked in the other order refuses the first line here rather than passing.
# test the-name-screen-is-answered-before-the-race-screen
load: at-the-mirror-with-a-thousand-coin
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.orc
assert: player.name and player.race

// The town is walkable, and every road it holds is walked. The list is long
// because a road is a fact about two named places and nothing derives it; what
// it is really proving is that every place has a way in and a way out, and
// dsl.test.ts makes that claim over the corpus without naming anybody. It ends
// on the sand, because the road from the square to the beach is the one every
// route out of Miki's house arrives by.
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
travel: beach
assert: market-rooftops.discovered
assert: castle-solar.discovered
assert: hive-mouth.discovered
assert: beach.discovered

// The economy, end to end and in the smallest amount that closes: a curio the
// tutorial's rats drop becomes coin, coin becomes a herring, and the herring
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
assert: xp.core.cooking > 0

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
talk: sunny
choose: sunny.the-bottle
talk: sunny
choose: sunny.the-animals
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
// Core's cluster planes, walked from the chest under Miki's workbench, which is
// the only thing in the world that puts a jewel in anyone's hands.
//
// Recorded from a live session with /create-valid-test, so what follows is what
// a player types and the closing sheet is where that session ended: both grown
// copies, their planes, every allocation, and the effects each cluster carries.
// Regenerate with /create-valid-test when this content changes on purpose.
//
// What this route claims is written as its refusals — each one names a growth
// the plane must not take, and there are eight of them. The plane itself is
// what no condition can name, so the sheet keeps it: `instances` is compared
// whole even under `expect only:`, so every hex, jewel, point and orb below is
// still pinned exactly.
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
// That the copy is worn is asserted below. That it is, by c21, no longer in the
// stack it was grown from is the sheet's: `has` and the `inventory` root both
// count a worn copy as held, so the stack falling to zero is a fact only
// `inventory.core.iron-sword` in the save body can state.
# test growing-through-the-inventory-screen
load: growing-a-heartwood-blade-start
use: entity.smiths-chest.open
open-modal: carried-items
submit-modal: item=core.iron-sword
submit-modal: verb=grow
submit-modal: plane=allocate: slot e
submit-modal: plane=slot: e with core.crossroads-jewel
// A base still in its stack is minted by the first growth, so the level the
// next allocation spends is bought after the copy exists rather than before.
submit-modal: plane=feed: with core.masters-whetstone
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
// both halves of what `verb=equip` did: 14 is the player's own 10, the iron
// sword's 2, and the 2 that `whetted` carries at position 1 of the ring slotted
// two hexes out. Nothing else on this route touches attack.
assert: stat.attack = 14
expect only: growing-through-the-inventory-screen-end
