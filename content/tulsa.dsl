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
// traveller. Kelsa is the one exception and is meant to be: the only thing she
// ever said was the preamble to being hired, so it went where the hiring is.
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
pack: tulsa
dependencies:
  core
  combat
  fishing
  cooking
  thieving
  smithing
  crafting
  ? combat-expansion

// --- flags ---
//
// World state no single prop owns. A flag that belongs to one door or one
// person is declared on that door or that person instead.

# flag heard-of-the-back-way

# flag sewer-toll-paid

# flag corners-slathered

# flag wurm-defeated

// Set by the rooftop watch the town keeps for itself, so what is up there is worth
// noticing once rather than by the hour.
# flag castle-watched

// How many of Kelsa's hives have been gone through, and on which of her two hive
// grounds the third one was. Every hive adds to the count and hides itself
// afterwards, so three is all three; whichever one takes the count to three
// marks the ground it stands on, and only ever one of them does, so nothing here
// has to be cleared. A hive on a third ground is a fourth marker beside these
// and a line on that hive, and neither of the two below has to be read to write
// it.
# flag hives-searched

# flag the-third-search-was-in-the-field

# flag the-third-search-was-at-the-mouth

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
// Tulsa is a walled town on a grid. Four roads meet at the market and each of
// them ends at a gate, which is why the square is where every road in town runs
// through and why a stranger who wants out has to walk back to it first. Inside
// the wall are the streets and the houses on them; outside are the fields, the
// pines, the marsh and the road north.
//
// Every road is written from both ends so that a place's own `adjacent:` reads
// as the whole list of its exits; the engine answers a road from both ends
// either way. Walking one is a flat three seconds whatever it draws, so the town
// is laid out to be read rather than to be paced: a lane and its houses are a
// short walk apart on the map because that is what they look like, not because
// the engine charges less for it.
//
// `x` runs east and `y` runs south, which is how the map draws them, so north is
// the smaller `y` and a place written `north of` another lands above it. Every
// place writes both, because a relative step moves exactly one unit and resolves
// through whatever it names, which walks a chain of them into an occupied square
// easily — and the loader refuses two places on one square, naming both.

// --- inside the wall ---

// Where the four gate roads cross. Everything a new arrival can reach is one
// road from here, which is what a market square is for and why the town crier
// stands in it.
# location market-square
x: 7, y: 0
title: Market Square
examine: Four roads meet under the awnings, and you can see three of the town's gates from where you are standing. There is a sewer grate set into the cobbles with a boy hunched over it.
// The town has to be able to open on its own, so the square is where a player
// arrives when nothing else says otherwise. A tutorial takes this line back and
// puts `starting` on its own front room; see `first-steps`.
starting
adjacent:
  market-row
  tavern-street
  castle-gate
  kings-road
  swamp-edge
  riverside
  kelsa-farmhouse
entities:
  mouse, town-crier, sewer-grate, bench, 8 civilian

# location market-row
x: 8, y: 0
title: Market Row
examine: The east road out of the square, stalls down both sides of it: groceries, fishing tackle, and a rack of axes nobody is watching closely enough.
adjacent:
  market-square
  forge
  kiln-lane
  market-rooftops
entities:
  general-store, fishing-supplies, woodcutters-stall, 6 civilian
flags: axe-taken
lift an axe off the rack:
  hidden if: axe-taken
  time: 5
  xp: thieving.thieving 12
  set: axe-taken
  give: 1 hand-axe
  say: You take the end axe off the rack while the woodcutter is counting somebody else's coin, and you are two stalls away before the gap in it shows.

// The roof layer the outline asks for, and the only way onto it is a climb.
// What it overlooks is a quest's business rather than the town's.
# location market-rooftops
above market-row
title: Market Rooftops
examine: Tile and thatch over the stalls, the wall-walk one roof away, and the castle's upper windows across the town.
adjacent:
  market-row
// Paid once, because there is one thing up here to notice and noticing it twice is not a
// second thing. Without the guard the view is eight seconds and five experience forever, and
// with no quest in the world it was the best thieving in Tulsa — `attention-to-detail` writes
// its own gated watch over this one, so the hole only ever showed with the quests turned off.
// The roof itself stays: a player may lie on the tile and look as often as they like.
watch the castle windows:
  time: 8
  if not castle-watched:
    set: castle-watched
    xp: thieving.thieving 5
  say: You lie flat on the warm tile and give the castle a long look. The second floor opens its shutters and leaves them open; one window on the third is shut against weather nobody else is shutting against. It means something to somebody. It does not yet mean anything to you.

# location forge
x: 9, y: -1
title: The Forge
examine: A low stone shop at the end of the row with the fire banked. An anvil stands unused in the middle of the floor.
adjacent:
  market-row
  proving-ground
entities:
  bladesmiths-son, anvil, smithing.forge-counter

// The yard the smiths test what they have made in, and it is the town's rather
// than any expansion's: a walled fixture off the forge that is here whatever
// else is loaded.
# location proving-ground
x: 11, y: -1
title: Proving Ground
examine: A walled yard behind the armoury, sand raked flat and stained, with the town wall for one of its four sides.
adjacent:
  forge
entities:
  armourers-chest, proving-post, spined-urchin

# location tavern-street
x: 8, y: 1
title: Tavern Street
examine: The lane running north-west off the square, and it smells of spilled beer at any hour. Sha Dynasty's is the door with the lantern over it.
adjacent:
  market-square
  sha-dynastys
  oolga-house
entities:
  charlie-the-tramp, 5 civilian

# location sha-dynastys
x: 9, y: 2
title: Sha Dynasty's
examine: The city's bar. Low beams, long tables, and a stove in the corner that has never been cold.
adjacent:
  tavern-street
entities:
  sunny, bar-stove, drunk-patron, 3 civilian

# location oolga-house
x: 8, y: 2
title: Oolga's House
examine: A crooked house wedged between two straighter ones at the top of the lane. Bundles of something dry hang from every beam.
adjacent:
  tavern-street
  oolga-basement
entities:
  oolga, oolgas-counter, house-chest

# location oolga-basement
below oolga-house
title: Oolga's Cellar
examine: A dirt-floored cellar. Something has been at the sacks in the corner, and part of the far wall has fallen in.
adjacent:
  oolga-house
  sewer-junction
entities:
  broken-wall, oolgas-sacks, groundwurm

// --- the castle, at the top of the town ---

# location castle-gate
x: 5, y: -2
title: Castle Gate
examine: The gatehouse of Tulsa's castle, which is a wall inside a wall. Two guards, bored, and a road running round the back.
adjacent:
  market-square
  castle-hall
  castle-yard
  guard-barracks
entities:
  2 castle-guard, 4 guardsman

# location guard-barracks
x: 3, y: -3
title: Guard Barracks
examine: Bunks, a weapon rack, and a table with the town's troubles laid out on it in no particular order.
adjacent:
  castle-gate
entities:
  guard-captain, 4 guardsman

# location castle-yard
x: 7, y: -4
title: Castle Yard
examine: Round the back of the castle: barrels, a midden, and a hatch into the sewers with a guard sat on it.
adjacent:
  castle-gate
  sewer-entrance while sewer-toll-paid
entities:
  larry, sewer-hatch, 4 knight

# location castle-hall
x: 5, y: -4
title: Banquet Hall
examine: The ground floor of the castle, given over to one long table that seats forty and rarely does.
adjacent:
  castle-gate
  castle-kitchen
  castle-quarters
  castle-cellar
entities:
  4 knight

# location castle-kitchen
x: 3, y: -5
title: Castle Kitchen
examine: Copper overhead, a range along one wall, and staff who do not look up.
adjacent:
  castle-hall
entities:
  castle-range, range-drawer, 3 civilian

# location castle-quarters
above castle-hall
title: Castle Quarters
examine: The second floor: bedrooms along one side, and a sewing room at the end with the door open.
adjacent:
  castle-hall
  castle-solar
entities:
  2 house-chest

# location castle-solar
above castle-quarters
title: The Duke's Solar
examine: The top floor, and one room of it. The duke keeps his own counsel and most of the good chairs.
adjacent:
  castle-quarters
entities:
  the-duke

# location castle-cellar
below castle-hall
title: Castle Cellar
examine: Casks, cold air, and a drain in the floor carrying the noise of running water.
adjacent:
  castle-hall
entities:
  treasure-chest

// The castle is seven rooms on three floors and a wall around all of it. The
// region draws that wall: nothing in the engine reads it, and a room inside it
// is exactly as far from the square as its coordinates say it is. What it buys
// is a map somebody can read — the castle is one thing on it, and which of its
// rooms you are looking at is a question you only ask once you are inside.
# region castle
title: The Castle
holds:
  castle-gate
  castle-yard
  castle-hall
  castle-kitchen
  castle-quarters
  castle-solar
  castle-cellar
  guard-barracks

// Two rooms and a ladder between them, which is a house rather than a building,
// and is here because the shape has to hold for the small case as well as the
// grand one.
# region oolga-house
title: Oolga's
holds:
  oolga-house
  oolga-basement

// --- the lanes, and the people who live on them ---
//
// Two lanes of ordinary houses, one either side of the town, and they are where
// Tulsa is actually lived in. Each house is a room with somebody's kitchen in
// it, somebody in the kitchen, and a door that is not locked, which is the whole
// of why a thief walks these rather than the square.

# location well-lane
x: 4, y: 1
title: Well Lane
examine: The lane down the west side, running from the marsh gate to the water. There is a well at the turn of it and a queue at the well most of the day.
adjacent:
  swamp-edge
  riverside
  town-well
  nans-house
  hasks-house
  doss-house
entities:
  washing-line, 6 civilian

# location town-well
x: 6, y: 2
title: The Well
examine: A stone kerb worn into scallops by two hundred years of rope, and a bucket somebody left on it.
adjacent:
  well-lane
entities:
  the-well, bench, 3 civilian

# location nans-house
x: 4, y: 2
title: Nan's House
examine: One room and a loft over it, the fire banked low, and more chairs in it than the room can hold.
adjacent:
  well-lane
entities:
  nan, nans-hearth, house-chest, 2 civilian

# location hasks-house
x: 5, y: 2
title: Hask's House
examine: A cooper's, and the front room is staves. Somewhere behind the staves a family is having its dinner.
adjacent:
  well-lane
entities:
  hask, hasks-stove, house-chest, 2 civilian

# location doss-house
x: 3, y: 2
title: The Doss House
examine: Beds by the night, eleven of them in one room, and a fire at the end that everybody cooks on and nobody cleans.
adjacent:
  well-lane
  rogue-den
entities:
  doss-house-fire, 7 civilian

// Under the doss house, which is the one building in Tulsa where nobody asks who anybody is. The
// town's second band of thieving, and the only place the picks and the jewel come from.
//
// Nothing here is aggressive. They are not going to start something in their own cellar over a hand
// in a pocket, which is what lets a beginner walk down, try it, fail, and walk back up having
// learned where the ceiling is — the vigilance is the gate, not a fight.
# location rogue-den
x: 3, y: 2, z: -1
title: The Rogue Den
examine: A cellar under the beds with a good floor, better light than the room above it, and eleven people down here who are all facing the door.
adjacent:
  doss-house
entities:
  4 thief, strongbox

# location kiln-lane
x: 11, y: 1
title: Kiln Lane
examine: The lane down the east side, behind the market row. It is warmer than the rest of the town and it smells of bread and fired clay.
adjacent:
  market-row
  kelsa-farmhouse
  motts-house
  bels-house
  aggies-house
entities:
  pie-window, 6 civilian

# location motts-house
x: 10, y: 0
title: Mott's House
examine: A bakehouse with the living done in the back of it. The oven is the size of the room it is in and it has never once been let go out.
adjacent:
  kiln-lane
entities:
  mott, motts-oven, 2 civilian

# location bels-house
x: 11, y: 0
title: Bel's House
examine: A potter's, and the yard behind it is stacked with things that did not survive the kiln.
adjacent:
  kiln-lane
entities:
  bel, bels-kiln, house-chest, 2 civilian

# location aggies-house
x: 12, y: 0
title: Aggie's House
examine: Nets over every surface that will take one, and a stove going under a pan that has fish in it whatever hour you arrive.
adjacent:
  kiln-lane
entities:
  aggie, aggies-stove, 2 civilian

// --- the wall, and the four ways through it ---
//
// Each gate is a road out written from the square, so a player standing in the
// market has all four on the map at once and can see which way the town ends.

# location kings-road
x: 8, y: -1
title: The King's Gate
examine: The north gate, and the biggest of the four: a barrel vault deep enough to be dark in the middle of it, with the portcullis housing overhead and the King's Road running out under the arch.
adjacent:
  market-square
  north-road
  rampart
entities:
  2 guardsman, bench, 3 civilian

# location rampart
above kings-road
title: The Rampart
examine: The wall-walk over the King's Gate. From here Tulsa is small and orderly and entirely enclosed, and the country past it is not any of the three.
adjacent:
  kings-road

# location swamp-edge
x: 3, y: 1
title: The Marsh Gate
examine: The west gate, and the low one. The coast road runs out of it and the ground on the north side of that road starts drinking within fifty paces. A dead alder leans over the ditch outside the arch.
adjacent:
  market-square
  well-lane
  swamp-mire
entities:
  dead-alder, bench, 2 guardsman

# location riverside
x: 7, y: 1
title: The Water Gate
examine: The south gate, where the river comes under the wall through a grate too narrow for a boat and wide enough for a boy. Stone stairs go down to the shingle, and the shingle is busy with people who are not fishing.
adjacent:
  market-square
  well-lane
  deep-water
entities:
  fishing.shrimp-shoal, fishing.anchovy-shoal, bench, 4 civilian

# location bee-gate
x: 10, y: 2
title: The Bee Gate
examine: The east gate, and hardly a gate at all: a postern in the corner of Kelsa's yard that the town gave up minding when it gave up minding the bees.
adjacent:
  kelsa-farmhouse
  apiary-field
  tunnel-mouth
  pasture

// --- Kelsa's steading, in the east corner of the wall ---

# location kelsa-farmhouse
x: 9, y: 1
title: Kelsa's Farmhouse
examine: A working farmhouse built against the inside of the east wall, with the door wedged open and the yard running back to a postern. Nothing here stings.
adjacent:
  market-square
  kiln-lane
  bee-gate
entities:
  kelsa, george

// --- outside the wall ---

# location apiary-field
x: 10, y: 3
title: The Apiary
examine: Three hives on the far side of the property, and the air between them is not calm.
adjacent:
  bee-gate
  hive-mouth
entities:
  5 drone-bee, first-hive, second-hive, princess-bee

# location hive-mouth
x: 10, y: 4
title: The Third Hive
examine: The end of the row, far enough from the other two that the noise off them arrives late. The comb at the mouth of the hive standing here is chewed through by something that was not a bee.
adjacent:
  apiary-field
entities:
  chewed-hive

# location pasture
x: 9, y: 3
title: The Pasture
examine: Kelsa's field beyond the hives, cropped short, with a gate at the top of it and cattle who have never once used the gate.
adjacent:
  bee-gate
entities:
  4 combat.cow, 6 combat.chicken

# location tunnel-mouth
x: 11, y: 5
title: Tunnel Mouth
examine: A hole in the turf at the edge of Kelsa's land, shored with timber by somebody who knew how.
adjacent:
  bee-gate
  tunnels

# location tunnels
x: 14, y: 10, z: -1
title: The Tunnels
examine: A dug passage running away from town, wide enough for two abreast. It has been used.
adjacent:
  tunnel-mouth
  ratkin-border
entities:
  6 feral-rat

# location ratkin-border
x: 17, y: 11
title: The Ratkin Border
examine: An outpost of stakes and banked earth, and beyond it a country nobody from Tulsa has walked in.
adjacent:
  tunnels
entities:
  2 border-guard

# location swamp-mire
x: 2, y: 2
title: The Mire
examine: Standing water to the knee, a quarter-mile off the coast road. Thistle on the hummocks, root under the mud, and broken things half-buried where somebody dumped them.
adjacent:
  swamp-edge
entities:
  3 swamp-mollusk, 2 bog-lurker, herb-patch, dumped-crates

# location north-road
x: 8, y: -5
title: The North Road
examine: Out of the King's Gate and banked either side, with rocks along the top of the bank that are a very good size for standing behind.
adjacent:
  kings-road
  pinewood
entities:
  4 combat.highwayman

# location pinewood
x: 8, y: -6
title: The Pinewood
examine: Black pine and no undergrowth at all, which means you can see a long way and so can everything else.
adjacent:
  north-road
entities:
  5 combat.wolf

# location deep-water
x: 7, y: 5
title: The Deep Water
examine: Downstream of the wall, past the last of the houses. The bank is undercut here and the water does not look like the same river.
adjacent:
  riverside
  the-narrows
entities:
  fishing.trout-run, fishing.salmon-pool

// The far end of the river and the far end of the ladder: two waters that are shut to a hand which
// has not put the hours in, so what stands here for a beginner is a walk and a look at it.
# location the-narrows
x: 6, y: 6
title: The Narrows
examine: The valley closes in and the river goes quiet and fast between two shoulders of rock. Nobody has built anything down here and the path stops being a path.
adjacent:
  deep-water
entities:
  fishing.pike-reach, fishing.sturgeon-hole

// --- the sewers ---
//
// Two ways in, and which one you took is the difference between arriving in a
// clean room and arriving among the rats. Larry's hatch lands you in the
// entrance; Oolga's fallen wall lands you in the junction, which is where the
// rats are.

# location sewer-entrance
x: 9, y: -1, z: -1
title: Sewer Entrance
examine: A brick chamber under the hatch, swept clean and lit. Whoever pays the toll gets this much for it.
adjacent:
  castle-yard
  sewer-junction

# location sewer-junction
x: 9, y: 0, z: -1
title: Sewer Junction
examine: Four channels meet here under a low vault. Painted signs on the brick point up at the buildings above: MARKET, CASTLE, GATE.
adjacent:
  sewer-entrance
  sewer-outfall
  oolga-basement
entities:
  6 feral-rat, sewer-signs

# location sewer-outfall
x: 7, y: 0, z: -1
title: Sewer Outfall
examine: The channel widens and slows here, under a grate you can see daylight through. A barred door stands where the water goes.
adjacent:
  sewer-junction
  sewer-locked-room while barred-door.unlocked
entities:
  2 feral-rat, barred-door, outfall-grate

# location sewer-locked-room
x: 10, y: 0, z: -1
title: The Barred Room
examine: A dry room behind the water, kept by someone. A table, a shelf, and two things standing on their hind legs.
adjacent:
  sewer-outfall
entities:
  2 ratman, key-table, treasure-chest

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

// The five the lanes belong to. None of them wants anything and none of them is
// anybody's quest: they are here so that a door on a lane has somebody behind
// it, and what each says is the one thing they would actually say to a stranger
// who walked into their kitchen.

# entity mott
title: Mott
faction: world
examine: The baker, forearms like a much larger man's, dusted to the elbow and going grey the same colour.

# entity bel
title: Bel
faction: world
examine: The potter, thumbs flat and splayed, watching the kiln rather than you.

# entity aggie
title: Aggie
faction: world
examine: A fishwife with a knife in one hand and a herring in the other, and she does not put either down to talk to you.

# entity nan
title: Nan
faction: world
examine: Very old and entirely comfortable, in the chair nearest the fire, with the rest of the chairs arranged around her.

# entity hask
title: Hask
faction: world
examine: The cooper, a barrel between his knees, tapping a hoop down the last quarter-inch it has left to go.

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
  20 herring
  3 fishing.small-fishing-net
  2 fishing.large-fishing-net
  3 fishing.fishing-rod
  200 fishing.dried-fish-bait
  1 fishing.wrigglers
  10 fishing.gut-line
  6 fishing.braided-fiber-line
  3 fishing.horsehair-line
  4 fishing.steel-line

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

// The only way back from a bad fight, and there is one in the square and one at
// every gate — a player who has just been beaten is never more than a room from
// sitting down, which is the whole reason a town is somewhere you come back to.
// Sitting is worth ten regeneration for as long as you stay sat, on top of the
// one core gives everybody, so the bench does not restore a pool of its own and
// anything else that adds to that stat adds to this too.
# entity bench
title: Bench
examine: A bench worn shiny down the middle by people waiting on somebody.
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
  xp: thieving.thieving 3
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
  xp: thieving.thieving 15
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

// Every fire in Tulsa somebody will let you stand at, one to a kitchen. A recipe
// asks the room for a station and takes the first thing standing in it that has
// one, so what these say about themselves is the whole of what makes each of
// them worth walking to rather than the one nearest the square.

# entity motts-oven
title: Mott's Oven
examine: Brick, domed, and hot enough at the mouth to be felt from the door. Mott bakes at four and it is yours from noon.
stations: oven

# entity bels-kiln
title: The Kiln
examine: Squat and round and closed, with a stack of split wood beside it. Bel says it is not a bread oven and then does not stop anybody using it as one.
stations: oven

# entity aggies-stove
title: Aggie's Stove
examine: Cast iron, small, and there has been a pan on it for so long that the pan and the stove have gone the same colour.
stations: stove

# entity nans-hearth
title: Nan's Hearth
examine: An open fire with a bar across it and a hook on the bar. It has not been out in the lifetime of anyone in the room.
stations: stove

# entity hasks-stove
title: Hask's Stove
examine: Wedged between the staves, and the family eats off it standing up because there is nowhere in the room to sit.
stations: stove

# entity doss-house-fire
title: The Doss House Fire
examine: A grate at the end of the long room with eleven people's suppers on it and no agreement about whose is whose.
stations: stove

// The town's water, and the reason the lane it stands on is the one everybody
// walks down. Free, slow, and it is what makes flour the only thing dough costs.
# entity the-well
title: The Well
examine: Deep enough that the bucket is out of sight before you hear it land.
draw water:
  continuous
  time: 8
  give: 1 core.jug-of-water
  on success:
    say: You wind the bucket up and fill a jug off it.

// Two things a light hand takes off a lane rather than off a person, and each is
// a one-off: the flag is what its own `hidden if:` reads, so neither is a second
// helping.
# entity washing-line
title: Washing Line
examine: Somebody's whole week strung across the lane at head height, and it has been there since before it rained.
flags: taken
lift a shirt off the line:
  hidden if: taken
  time: 5
  xp: thieving.thieving 8
  set: taken
  give: 1 core.bent-coin
  say: You take a shirt off the line without breaking stride and find a bent coin knotted into the tail of it, which somebody put there on purpose and is going to miss.

# entity pie-window
title: The Cooling Window
examine: Mott's back window, propped open on a spoon, with the afternoon's work cooling on the sill in a row.
flags: taken
take one off the sill:
  hidden if: taken
  time: 4
  xp: thieving.thieving 10
  set: taken
  give: 1 core.bread
  say: You take the end one and put the gap in the middle of the row, which buys you about a minute.

// The one thing in the castle worth more than what is on the range. Whoever it belonged to is not
// here and the cook does not say where they went.
# entity range-drawer
title: The End Drawer
examine: The drawer at the cold end of the range, which sticks, and which nobody has opened in a while.
flags: emptied
work it open:
  time: 8
  hidden if: emptied
  set: emptied
  give: 1 cooking.a-cooks-hands-jewel
  say: The drawer comes out crooked and almost entirely empty. What is in it is a ring of blackened iron, and it is warm.

// Going through a hive frame by frame, and the one action all three of Kelsa's
// hives hang off. What a hive adds to it is its own: the words for what is in
// that one, and which ground it stands on if it turns out to be the third gone
// through. The count and the sentence for the third are here so that no hive has
// to know how many others there are.
# action search-the-comb
title: Search The Comb
time: 8
on success:
  add: hives-searched 1
  if hives-searched >= 3:
    say: Three hives gone through, and the humming behind you drops a whole tone. There is a gallery cut down through this comb that was not in it when you started, and the edges of it are wet.

# entity first-hive
title: The First Hive
examine: A hive, working. The comb is whole and the bees ignore you.
flags: searched
uses: search-the-comb
search-the-comb:
  hidden if: searched
  +on success:
    set: searched
    say: You lift the frames out one at a time. Comb, brood, bees, and nothing between them that is not a bee's.
    if hives-searched >= 3:
      set: the-third-search-was-in-the-field
harvest comb:
  time: 8
  give: 1 honeycomb
  say: You cut a slab of comb out and leave the rest.

# entity second-hive
title: The Second Hive
examine: A hive, working, and louder than the first. The comb is whole.
flags: searched
uses: search-the-comb
search-the-comb:
  hidden if: searched
  +on success:
    set: searched
    say: This one goes the same way and takes longer about it. Whatever has been at these hives is not sitting in the comb waiting to be found.
    if hives-searched >= 3:
      set: the-third-search-was-in-the-field
harvest comb:
  time: 8
  give: 1 honeycomb
  say: You cut what you came for and step back before they mind.

// The one at the end of the row, standing in its own room because that is where
// the row ends. Nothing about the search knows that: it is a hive like the two
// above and it marks its own ground like they mark theirs.
# entity chewed-hive
title: The Chewed Hive
examine: The comb at the mouth of this one is cut through in galleries no bee cut, and the edges of them are still wet.
flags: searched
uses: search-the-comb
search-the-comb:
  hidden if: searched
  +on success:
    set: searched
    say: You put your face to the gap and go through what is left of the comb. It is chewed out to the depth of your arm. Whatever did it is not in there now, and it did not leave the way you came in.
    if hives-searched >= 3:
      set: the-third-search-was-at-the-mouth

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

// --- the townsfolk, and what happens when you pick on them ---
//
// A townsman, a guardsman and a knight are three rungs of one ladder: each is worth more to hit,
// hits back harder, and carries more. None of them starts it — the town is not hostile until you
// make it hostile — and each of them can be robbed instead, which is the other half of every sheet
// below and the reason all three are the town's rather than combat's.
//
// The pockets are the contest `thieving.pick-their-pocket` runs, and what each mark brings to it is
// one number on its own sheet. Each rung is watchful enough to be worth more than the one under it,
// so a minute at any of them comes to about the same and what changes is whether you can stand there
// at all.

# entity civilian
title: Townsman
examine: Somebody about their day, with a purse on their belt and no reason to expect you.
stats: attack 5, defense 1, max-health 20, attack-rate 15, accuracy 55, evasion 25, thieving.thieving 0, thieving.thieving-rate 0, thieving.vigilance 20
uses: core.melee-combat, thieving.pick-their-pocket
faction: world
respawn after: 45s
on death:
  credit:
    roll: combat.purse
pick-their-pocket:
  give: 3 coin
  xp: thieving.thieving 4
  +on unfinished:
    say: Your hand is on the purse and then their hand is on your wrist, and they are not gentle about it.
    drain: 1 health

# entity guardsman
title: Guardsman
examine: One of the duke's, in a coat of plates and a mood.
stats: attack 16, defense 8, max-health 70, attack-rate 20, accuracy 90, evasion 40, thieving.thieving 0, thieving.thieving-rate 0, thieving.vigilance 55
uses: core.melee-combat, thieving.pick-their-pocket
faction: world
respawn after: 70s
on death:
  credit:
    roll: combat.purse
    1 in 8: give: 1 combat.bronze-helmet
pick-their-pocket:
  give: 7 coin
  xp: thieving.thieving 7
  +on unfinished:
    say: He turns into you rather than away, and the pommel of his sword arrives before you have finished deciding what to do, and then he has a fistful of your collar.
    drain: 1 health
    inflict: thieving.collared

# entity knight
title: Knight
examine: Iron from the crown of his head to the soles of his feet, and he has been hit by better than you.
stats: attack 26, defense 14, max-health 130, attack-rate 20, accuracy 100, evasion 45, thieving.thieving 0, thieving.thieving-rate 0, thieving.vigilance 80
uses: core.melee-combat, thieving.pick-their-pocket
faction: world
respawn after: 100s
on death:
  credit:
    roll: knights-purse
    1 in 10: give: 1 combat.iron-helmet
pick-their-pocket:
  hidden if: level.thieving < 11
  give: 12 coin
  xp: thieving.thieving 10
  +on unfinished:
    say: There is a great deal of iron in the way and then a great deal of iron coming the other way, and he holds you at arm's length while he decides whether you are worth the walk to the gate.
    drain: 1 health
    inflict: thieving.collared

// The second band's mark. Watchful enough that a hand which has not put the hours in comes away with
// nothing all afternoon, and carrying the one thing in Tulsa worth taking off a person: a hand that
// robs thieves for long enough ends up holding their picks.
# entity thief
title: Thief
examine: Sitting where they can see the stair, doing nothing in particular, and they have already counted what you are carrying.
stats: attack 20, defense 6, max-health 85, attack-rate 26, accuracy 95, evasion 60, thieving.thieving 0, thieving.thieving-rate 0, thieving.vigilance 100
uses: core.melee-combat, thieving.pick-their-pocket
faction: world
respawn after: 80s
on death:
  credit:
    roll: combat.purse
    1 in 14: give: 1 thieving.lockpicks
pick-their-pocket:
  hidden if: level.thieving < 11
  give: 18 coin
  xp: thieving.thieving 17
  1 in 60: give: 1 thieving.fingerless-gloves
  +on unfinished:
    say: They let you get all the way to it before their hand closes on your wrist, which is how you know they were watching the whole time. Nobody raises their voice. Nobody lets go either.
    drain: 1 health
    inflict: thieving.collared

// --- what is locked ---
//
// Two boxes, running `thieving.pick-the-lock` against the wards on each. Winning empties the box;
// losing puts you on the step outside with the owner explaining it, and where that step is is the
// town's business rather than the hand's.

# entity house-chest
title: Chest
examine: A banded chest under the window with a lock on it older than the window.
stats: thieving.thieving 0, thieving.wards 60
uses: thieving.pick-the-lock
pick-the-lock:
  roll: thieving.house-chest-contents
  xp: thieving.thieving 20
  say: The lock gives with a sound like a knuckle cracking.
  +on unfinished:
    say: The wards catch, and somebody behind you says that is not your chest, and you are on the step before you have finished agreeing.
    drain: 3 health
    relocate: market-square

# entity treasure-chest
title: Treasure Chest
examine: Iron under the wood, and somebody has cut runes into the band that are not decoration.
stats: thieving.thieving 0, thieving.wards 110
uses: thieving.pick-the-lock
pick-the-lock:
  time: 10
  roll: thieving.treasure-chest-contents
  xp: thieving.thieving 55
  say: The last ward turns over and the lid comes up on its own.
  +on unfinished:
    say: The runes light one after another and the cellar goes out from under you.
    drain: 8 health
    relocate: market-square

// The best lock in Tulsa, in the one cellar where nobody will explain to you that it is not your
// box — so this is the only lock in the world that does not end with a walk back from the market
// square. It is where the boots and the quiet hour come from.
# entity strongbox
title: Strongbox
examine: Banded twice over and set into the floor, and the lock is the newest thing in the room by thirty years.
stats: thieving.thieving 0, thieving.wards 132
uses: thieving.pick-the-lock
pick-the-lock:
  hidden if: level.thieving < 14
  time: 14
  roll: thieving.strongbox-contents
  xp: thieving.thieving 90
  say: The last ward goes over under your thumb and the lid lifts on a hinge somebody has kept oiled.
  +on unfinished:
    say: A pick shears off in the third ward and somebody behind you says that one is theirs, in the tone of a person who is not going to say it twice.
    drain: 2 health
    inflict: thieving.collared

// --- what is already hostile ---

# entity feral-rat
title: Feral Rat
examine: A rat the size of a cat, hairless in patches and weeping where it is not.
stats: attack 9, defense 1, max-health 24, attack-rate 18, accuracy 65, evasion 35
uses: core.melee-combat
faction: world
aggressive
respawn after: 40s
on death:
  credit:
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
    roll: ratman-remains

# entity drone-bee
title: Drone Bee
examine: A drone off one of Kelsa's hives, and it should not be this angry.
stats: attack 6, defense 0, max-health 14, attack-rate 30, accuracy 70, evasion 55
uses: core.melee-combat
faction: world
aggressive
respawn after: 2m

# entity swamp-mollusk
title: Swamp Mollusk
examine: A shell the size of a shield, and the foot under it is wet with something you would not touch.
stats: attack 11, defense 8, max-health 45, attack-rate 10, accuracy 60, evasion 5
uses: core.melee-combat
faction: world
respawn after: 5m
on death:
  credit:
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

// --- the player ---

// The player is an entity like any other, and declares everything that measures it. The global
// `# stat` bases in core are what something that names none falls back to; they stopped being this
// sheet.
//
// It is here rather than in core because of one line: a character's skills are a fact about the
// world they live in, one module each, and this is the module that depends on every one of them.
// Core is the furniture a region stands on and cannot see any of them from where it sits.
//
// The swing varies because the arm does, not because the weapon does: `attack`
// is a range here for the same reason the rat writes `attack 6-8` on its own
// sheet, and an unarmed player is as uneven as an armed one. Every level of
// `melee` shifts both ends by one, and a weapon's `+n attack` shifts both ends
// again, so *base plus level* reads straight off this line.
# entity player
title: You
faction: core.player
stats: max-health 30, attack 8-12, defense 5, attack-rate 25, accuracy 100, evasion 0
skills: core.woodcutting, combat.attack, combat.health, fishing.fishing, cooking.cooking, thieving.thieving, smithing.smithing, crafting.crafting
equipment-slots: mainhand, offhand, head, body, legs, gloves, boots
uses: core.melee-combat
// Waking up is the market square once the market square has been stood in, and
// the house the game begins in before that. `starting` may only be on one
// location and it stays on the tutorial's, so this branch is the whole of what
// content can say about where a faint puts you — and a player who has left that
// island should not be walked back onto it.
on death:
  say: You slump to the floor, spent, and come to a long while later somewhere you did not lie down. (You should have eaten something.)
  set: core.fainted
  restore: core.health
  if setting.hardcore:
    say: Somebody went through your pockets while you were down, and took the coat off your back besides. You have nothing.
    take: everything
  if market-square.touched:
    relocate: market-square
  if not market-square.touched:
    relocate: starting-location
  stop
// A pool going empty is the player's, so the handler for it is the player's; what an emptied line
// costs is fishing's, and `fishing.parted-tackle` is where fishing says it. A seventh net is added
// beside the other six and nothing here is touched.
on line-parted:
  say: The line goes slack in your hands, and what was on the end of it is somewhere under the water with the fish.
  restore: fishing.line-health
  roll: fishing.parted-tackle

// The corner of the cellar the examine text already points at — "something
// has been at the sacks in the corner" is tulsa.dsl's own line, and this is
// what that something was doing there.
# entity oolgas-sacks
title: The Sacks
examine: Feed sacks stacked in the corner, gnawed through in a dozen places, and a smell coming off them that is not doing Oolga any favours.
slather with poison:
  requires: has sunnys-poison
  hidden if: corners-slathered
  time: 6
  take: 1 sunnys-poison
  set: corners-slathered
  say: You work the poison into every corner the rats have been at, thick as paint. For a moment the scrabbling in the walls stops dead, which is everything Sunny promised.
  say: Then something a great deal larger than a rat starts moving in the earth behind the wall, and it is not leaving the way it came.

// What the poison actually draws. Bigger than anything else written for this
// basement, and it does not respawn — killed once is killed for good, which is
// the whole of what "dealt with" means to Oolga.
# entity groundwurm
title: Groundwurm
examine: A ridge of packed earth moving under the cellar floor, and something pale and segmented shouldering up through the middle of it.
hidden if: not corners-slathered
stats: attack 18-22, defense 5, max-health 80, attack-rate 16, accuracy 85, evasion 10
uses: core.melee-combat
faction: world
aggressive
on death:
  set: wurm-defeated
  say: The ground stops moving, and the cellar is quiet in a way it has not been since you came down here.

// A princess bee is a fight rather than a harvest, unlike the two ordinary
// hives at the front of the property — which is the whole reason Sunny sends
// the player after this one and not after a slab of honeycomb.
# entity princess-bee
title: Princess Bee
examine: Half again the size of a drone and it does not buzz so much as hum, a note that sits wrong in your teeth.
stats: attack 10-14, defense 2, max-health 40, attack-rate 28, accuracy 75, evasion 55
uses: core.melee-combat
faction: world
aggressive
respawn after: 5m
on death:
  credit:
    give: 1 royal-jelly

// --- recipes ---

// What Sunny mixes for Oolga's rats, over any stove in town rather than her own
// — the bar is where the asking happens and not where the work has to be done.
# recipe sunnys-poison
station: stove
in: royal-jelly, mollusk-venom, bottle-of-vodka
out: sunnys-poison
skill: cooking.cooking 2
time: 4
say: You mix the jelly, the venom and the vodka together over the heat. What comes off it is worse than any one of the three on its own, which is rather the point.

// --- dialogue ---
//
// One node each, and the town's own word rather than any quest's. An unnamed
// node is what somebody says when no thread of theirs is open, so the first
// quest to give them a line takes it away — permanently, in every world that
// loads that quest. Anybody a quest is ever going to speak through is therefore
// written with an `ask:` here: a named thread stands in the list beside whatever
// the quest opens instead of being replaced by it. Whoever is left bare is
// nobody a quest has ever wanted, and giving them one is the first line of
// giving them a quest.

// The three the town is made of. None of them is anybody in particular, so none of them has a name
// or a second thing to say — what they are for is that a player can talk to a townsman, rob a
// townsman and fight a townsman, and find out which of the three the town minds.

# dialogue civilian
owner = civilian

node passing:
  always
  again: They have already told you about the weather.
  Fine morning. Or it was. Have you been down by the water? They say there is something in it.

# dialogue guardsman
owner = guardsman

node on-duty:
  always
  again: He has gone back to watching the road.
  Move along. Nothing down there for you and nothing up here either.

# dialogue knight
owner = knight

node armoured:
  always
  again: Still the wrong end of it. He has not moved.
  You are stood at the wrong end of me. Everything worth hearing goes past the front of this helm and I am not turning it round for you.

# dialogue mouse
owner = mouse

node forlorn:
  always
  ask: What is the matter?
  again: It is still down there. He does not look up.
  I lost it. It went down there.
  He does not say what, and he does not look up.

# dialogue town-crier
owner = town-crier

node holding-forth:
  always
  ask: What is the news?
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
  ask: About the hatch.
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
  ask: Anything for me?
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
  ask: About the old days.
  again: Still was. Still wouldn't.
  It was better before. All of it. You would not remember.

# dialogue george
owner = george

node helpful:
  always
  ask: About Kelsa.
  again: Still like that. Still right, mostly.
  Do not mind her. She is like that with everyone, and she is right about most of it.

# dialogue bladesmiths-son
owner = bladesmiths-son

node at-the-cold-forge:
  always
  ask: About your father's forge.
  again: Still just the noise. Nothing's changed that.
  My father made blades. I make a noise like somebody making blades.

# dialogue border-guard
owner = border-guard

node at-the-stakes:
  always
  again: Same as before. We watch. We do not go in.
  Past the stakes is theirs. We watch it. We do not go in.

// The lanes. Each of the five says one thing, and the thing each says is about
// the town rather than about the player, because a stranger in your kitchen is
// not news and the price of flour is.

# dialogue mott
owner = mott

node at-the-oven:
  always
  again: Still four in the morning. Still the flour.
  I am up at four and the oven is up before me. Use it after noon and mind the door, it swings.

# dialogue bel
owner = bel

node at-the-kiln:
  always
  again: Still not a bread oven. Still nobody listening.
  It is not a bread oven. It gets hotter than a bread oven and it goes cold slower, and no, I am not going to stop you.

# dialogue aggie
owner = aggie

node over-the-pan:
  always
  again: Still off the shingle. Still cheap.
  Everything in this house came out of the water at the bottom of the lane. It is not good fish. It is very cheap fish.

# dialogue nan
owner = nan

node by-the-fire:
  always
  again: Still the wall. She still would not.
  I have watched them build that wall twice. The second time they built it in the wrong place and nobody has ever said so out loud.

# dialogue hask
owner = hask

node over-the-barrel:
  always
  again: Still hoops. Still the whole of it.
  Staves, hoops, and a bottom. That is the whole of it, and it has fed four of us for thirty years.

// --- saves ---

# save in-town
{"version":13,"location":"tulsa.market-square"}

// What a new arrival walks into town holding and nothing takes back off them,
// standing in the row that would buy either. The sword is the copy the sendoff
// handed over, lifted whole out of miki-route-end with the roll it came out with.
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

// A netful out of the water at the bottom of Well Lane, which is what somebody
// walking up that lane is carrying.
# save a-netful-on-well-lane
{"version":13,"location":"tulsa.well-lane","inventory":{"fishing.raw-shrimp":4}}

// Down past the wall with the rod the stall sells, the bait it sells by the
// hundred and a line to lose, and enough water behind them to be standing here
// rather than at the shingle. What the shop stocks is what this holds: the deep
// water is reached by buying tackle, not by being given any.
# save rodded-up-at-the-deep-water
{"version":13,"location":"tulsa.deep-water","xp":{"fishing.fishing":467},"inventory":{"fishing.fishing-rod":1,"fishing.dried-fish-bait":40,"fishing.braided-fiber-line":1}}

# save growing-a-heartwood-blade-start
{"version":13}

# save growing-a-heartwood-blade-end
{"version":13,"inventory":{"core.stout-heart-jewel":1,"core.tempered-will-jewel":1,"core.great-work-jewel":1,"core.orb-of-the-edge":1,"core.orb-of-the-bulwark":1,"core.orb-of-renewal":1},"flags":{"tulsa.smiths-chest.emptied":true},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.heartwood-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":"core.heartwood-core","entry":null,"roll":0.6093358164653182,"allocatedPositions":[2,3],"allocatedSlots":["ne","e"],"effects":["core.orb-of-vitality"]},"1,-1":{"jewel":"core.keen-edge","entry":"ne","roll":0.06484867143444717,"allocatedPositions":[1,2,3,4,5],"allocatedSlots":[],"effects":["core.orb-of-the-edge","core.lesser-orb-of-the-edge"]},"1,0":{"jewel":"core.crossroads","entry":"e","roll":0.545911343768239,"allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"core.causeway","entry":"e","roll":0.2666903811041266,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"rng":1145426465}

# save growing-through-the-inventory-screen-end
{"version":13,"inventory":{"core.stout-heart-jewel":1,"core.tempered-will-jewel":1,"core.great-work-jewel":1,"core.causeway-jewel":1,"core.orb-of-vitality":1,"core.orb-of-the-edge":2,"core.lesser-orb-of-the-edge":1,"core.orb-of-the-bulwark":1,"core.orb-of-renewal":1},"flags":{"tulsa.smiths-chest.emptied":true},"equipped":{"mainhand":"2"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.heartwood-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":"core.heartwood-core","entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"core.crossroads","entry":"e","roll":0.06484867143444717,"allocatedPositions":[1],"allocatedSlots":["ne"],"effects":[]},"2,-1":{"jewel":"core.keen-edge","entry":"ne","roll":0.545911343768239,"allocatedPositions":[1],"allocatedSlots":[],"effects":[]}}}}}},"rng":2344671368}

// What somebody arrived carrying and where the world has got to, named together
// and written neither place: the sword and shield a new arrival walks in with,
// and the junction the back way leaves them standing at with a lockpick. Both
// halves are the saves that already say them, so a third of these costs a line
// rather than a body, and moving either half moves it here too.
# save armed-at-the-sewer-junction
over: in-town-with-a-sword-and-a-shield, at-the-sewer-junction
{"version":13}

// A build somebody grew and a state a run of theirs was left standing in, laid
// down together — which is the pairing a tier build and a progress state make,
// and the one this could not do. Both were minted by runs whose counters started
// at one, so both call a copy `1`. The upper layer is dealt fresh ids and every
// way its body names the copy goes with them, the blade in its hand included.
# save the-grown-blades-and-the-one-in-hand
over: growing-a-heartwood-blade-end, rage-rises-as-swings-land-end
{"version":13}

// --- the player, proved ---

# item deaths-door
DEBUG
step-through:
  drain: 1000 core.health

// The stuff itself. Sunny mixes it in her own bar and it works exactly as
// advertised — rats want nothing to do with it. What it draws instead is not
// hers to have known about.
# item sunnys-poison
title: Sunny's "Poison"
examine: A jar of royal jelly, mollusk venom and good vodka, mixed until it stops smelling like any of the three. Nothing sane would go near it.

// Every shape a holding takes: a stack, two things standing alone, a rolled
// blade in a row of its own, and a second blade on the arm rather than in the
// pack. The two are one template and neither joins the other: a level is rolled
// per copy, and that is the whole of why a base does not stack.
# save four-rows-and-a-blade-worn
DEBUG
{"version":13,"inventory":{"core.bent-coin":2,"core.rats-eye-gem":1,"tulsa.deaths-door":1},"equipped":{"mainhand":"2"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.25,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.75,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

// The difference hardcore makes, stated as a difference: the same faint down the
// same handler leaves all five holdings standing with it off and none of them
// with it on. A run that asserted only the empty pack would pass in a world
// where fainting always emptied it. What the faint restores the pool to is the
// engine's to prove and balance's to move, so it is not read here. `inventory.<item>` counts a stack, a grown copy and a worn one
// alike, so the two blades are the one in the pack and the one on the arm.
# test hardcore-death-empties-five-holdings-a-plain-faint-leaves-standing
DEBUG
load: four-rows-and-a-blade-worn
use: item.deaths-door.step-through
assert: inventory.core.bent-coin = 2
assert: inventory.core.rats-eye-gem = 1
assert: inventory.core.iron-sword = 2
load: four-rows-and-a-blade-worn
setting: hardcore on
use: item.deaths-door.step-through
assert: inventory.core.bent-coin = 0
assert: inventory.core.rats-eye-gem = 0
assert: inventory.core.iron-sword = 0
assert: inventory.deaths-door = 0

// --- tests ---

// The town is walkable end to end, and the shape it is walked in is the claim:
// out of the square by each of the four gates in turn and back, so a wall with a
// way through it in every direction is what this fails on if a gate stops being
// reachable. The corners are what the route ends on — the wall-walk, the top of
// the castle and the far side of Kelsa's land — because a place three roads deep
// is the kind that quietly loses its way in. That every place has a way in at all
// is dsl.test.ts's claim over the corpus, made without naming anybody.
# test walking-the-town
load: in-town
travel: market-row
travel: forge
travel: proving-ground
travel: market-rooftops
travel: kiln-lane
travel: motts-house
travel: bels-house
travel: aggies-house
travel: kelsa-farmhouse
travel: bee-gate
travel: hive-mouth
travel: pasture
travel: tunnel-mouth
travel: market-square
travel: tavern-street
travel: sha-dynastys
travel: oolga-house
travel: oolga-basement
travel: market-square
travel: castle-gate
travel: guard-barracks
travel: castle-kitchen
travel: castle-solar
travel: castle-cellar
travel: castle-yard
travel: market-square
travel: kings-road
travel: rampart
travel: north-road
travel: pinewood
travel: market-square
travel: swamp-edge
travel: swamp-mire
travel: well-lane
travel: town-well
travel: nans-house
travel: hasks-house
travel: doss-house
travel: riverside
travel: deep-water
assert: rampart.discovered
assert: castle-solar.discovered
assert: hive-mouth.discovered
assert: doss-house.discovered
assert: pinewood.discovered

// The economy, end to end and in the smallest amount that closes: a curio the
// a new arrival's first fights leave behind becomes coin, coin becomes a herring, and the herring
// becomes the thing Larry's nose is pointed at.
// --- what a minute is worth, which is what every room in the world is sized against ---

// The post is the one thing in the world that takes a swing and never returns one, which makes it
// the only place the two halves of a fight come apart. So this is the complement of the sewer route
// below: there, standing somewhere that hits back pays both; here, swinging at something that does
// not pays one and leaves the other where it was. No number — how much a minute is worth is a
// balance question and is answered by running the world, not by an assertion.
# test a-minute-at-the-post-trains-the-arm-and-not-the-hide
load: at-the-proving-ground
use: core.melee-combat on proving-post
wait: 60
assert: xp.combat.attack > 0
assert: xp.combat.health = 0

// The other half of the same minute, and the reason there are two skills rather than one: standing
// somewhere that hits back pays for both, and what a room can pay in Health is capped by the pool
// the player has to spend rather than by the room. Nothing here is a number — that a rat trains both
// at all is the claim, and how fast is what a playtest is for.
# test the-sewer-pays-a-beginner-in-both-halves-of-a-fight
load: at-the-sewer-junction
wait: 20
assert: xp.combat.attack > 0
assert: xp.combat.health > 0
assert: not core.fainted

// The two things in the market a light hand gets, and fifteen is the whole of what they are worth:
// three at the grate and twelve off the rack. Each sets its own flag, which is what its own
// `hidden if:` reads, so neither is a second helping — and the axe is the tool the dead alder wants,
// which is why the rack is worth a hand at all.
# test the-market-is-fifteen-thieving-xp-to-a-light-hand
load: in-town
use: entity.sewer-grate.reach-through-the-bars
assert: has core.bent-coin
assert: sewer-grate.reached
travel: market-row
use: location.market-row.lift-an-axe-off-the-rack
assert: has core.hand-axe
assert: market-row.axe-taken
assert: xp.thieving.thieving = 15

// A hand going out over and over at the same pocket, which is the whole shape of thieving: the
// player starts it, a lift pays, a catch costs health and stands them still for three seconds, and
// then it goes again. The two lifts above are one-shot props and prove none of that — this is the
// only route that walks the loop, and it walks it far enough that a catch has certainly happened
// along the way. What a catch costs is not asserted, because that is stochastic and a number; that
// the loop keeps going through one is what the last line is for.
# test a-hand-goes-out-again-after-it-is-caught
load: in-town
use: entity.civilian.pick-their-pocket until xp.thieving.thieving >= 200
assert: xp.thieving.thieving >= 200
assert: has core.coin
assert: not core.fainted

// The tutorial's own route through a counter and a stove. What it holds now that it did not before
// is the other half of a contested recipe: the herring is either dinner or it is a lump of charcoal,
// and the fish is gone either way.
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
assert: has core.herring
assert: inventory.coin = 0
travel: tavern-street
travel: sha-dynastys
craft: cooking.cooked-herring
assert: not has core.herring

// A weapon base is a good like any other, which is a thing the counter can only
// say by paying for one: a shop takes anything tradable it is offered, and what
// makes these tradable is the `value:` each declares. Twenty-eight is what the
// store's own rate leaves of a twenty-four and a twelve, rounded its way both
// times.
//
// The two rows of the counter are the two kinds of holding there are: the sword
// is a grown copy standing in a row of its own and is answered for by its id,
// and the shield is a stack answered for by its item. One number covers both
// because a copy fetches what its base is worth and not what its plane holds.
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

// Kelsa's corner of the wall, and what is the town's about it rather than a
// quest's. Her own word about the bees was a preamble to being hired and left
// with the hiring; what stays here is the apiary past the postern — two hives
// working and handing over comb to anybody who walks up to them, and all three
// there to be gone through by anybody who wants to.
//
// George is not walked here, though he is the town's too. How many threads he
// has open is a count of the quests loaded beside him, so a route that picks one
// out of his list is a route about those quests; the one that does it stands in
// the module that opens the second thread.
//
// Unkillable because the drones in that field are aggressive and what they cost
// is not what this is asking.
# test kelsas-corner-is-the-towns-rather-than-a-quests
unkillable
load: in-town
travel: kelsa-farmhouse
travel: bee-gate
travel: apiary-field
use: entity.first-hive.harvest-comb until done
use: entity.second-hive.harvest-comb until done
assert: has core.honeycomb
// The count is the town's and moves without anybody having been hired. That a
// hive gone through hides itself afterwards — so that one of them cannot stand
// for all three — is a refusal, and `refuse:` takes slot, allocate, unallocate
// and apply and no `use:`, so no route can ask for it.
use: entity.first-hive.search-the-comb until done
assert: hives-searched = 1

// A kitchen on a lane is a kitchen. What makes a room somewhere a player can
// cook is a thing standing in it that opens a station, and nothing about which
// room that is — so the fire in a stranger's front room answers a recipe exactly
// as the bar's stove does, and scattering the skill is a word on a location's
// own line rather than anything the skill has to be told. Both houses are walked
// to from the same lane, so what this separates is the two kitchens and not the
// two walks.
# test the-lanes-are-where-the-cooking-is
load: a-netful-on-well-lane
travel: hasks-house
craft: cooking.cooked-shrimp
assert: inventory.fishing.raw-shrimp = 3
travel: nans-house
craft: cooking.cooked-shrimp
assert: inventory.fishing.raw-shrimp = 2
assert: xp.cooking.cooking > 0

// The other half of a kitchen, and the reason Well Lane is the one everybody
// walks down: water is drawn rather than bought, so the only thing dough costs
// is flour. Two turns of the windlass rather than one, because a claim on one
// would also hold in a world where the well handed over its whole day at once.
# test the-well-is-where-the-water-is
load: a-netful-on-well-lane
travel: town-well
use: entity.the-well.draw-water
assert: inventory.core.jug-of-water = 1
use: entity.the-well.draw-water
assert: inventory.core.jug-of-water = 2

// The water below the wall, and the half of fishing a net never reaches. Both
// waters are walked because they are two waters and the town owns both — the
// shingle inside the gate is nets and no bait, and this is a rod and a strip
// spent every cast whether the fish comes up or not, which is what the last
// line is for.
# test the-deep-water-is-fished-with-a-rod-and-bait
load: rodded-up-at-the-deep-water
equip: fishing.fishing-rod
equip: fishing.dried-fish-bait
equip: fishing.braided-fiber-line
use: entity.fishing.trout-run.cast until has fishing.raw-trout
assert: has fishing.raw-trout
use: entity.fishing.salmon-pool.cast until has fishing.raw-salmon
assert: has fishing.raw-salmon
assert: inventory.fishing.dried-fish-bait < 40

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
wait: 10
assert: resource.core.health < 31.31
assert: not core.fainted

// The walk somebody hurt takes: stand about in the square a while, find the
// bench, and stay on it. The eleven is the save's own record read back. What
// the sitting pays is not this route's question — the bench is continuous, so
// the second minute is had by staying put and not by sitting down again, and
// that is the whole of what the walking proves.
# test the-bench-is-where-health-comes-back
load: hurt-in-town
assert: resource.core.health = 11
wait: 60
use: entity.bench.sit-down
wait: 60

// The only action in the corpus that takes more than one swing without being a
// fight, and that it takes more than one is the claim: an assertion on the log
// alone would also hold in a world where a single swing felled the tree. How
// many swings it costs is read off `felling`, and how long each takes off
// `time:`, so the clock is asked only to have run past a single swing rather
// than to read the four of them multiplied out.
# test a-log-costs-four-swings-of-an-axe
load: axe-at-the-swamp-edge
use: entity.dead-alder.chop-a-log
assert: time > 3
assert: inventory.core.log = 1
assert: xp.core.woodcutting > 0

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
travel: sewer-locked-room
use: entity.key-table.take-the-key
assert: has sewer-key

// A build and a place, laid down in that order. What the arrival was carrying
// survives being stood somewhere else — the sword is a rolled copy and the
// shield a stack, and neither layer says a word about the other's. Where the run
// stands is the last layer's, since only one of the two can be answered: no
// condition names where the player is, so the walk off the junction says it.
# test what-two-layers-of-a-save-each-keep
load: armed-at-the-sewer-junction
assert: inventory.core.iron-sword = 1
assert: inventory.core.wooden-shield = 1
assert: inventory.core.lockpick = 1
assert: heard-of-the-back-way
travel: sewer-outfall

// The same, where both layers grew something. Taking the blade off is what asks
// the question: if the upper layer's `equipped` were still calling its copy `1`
// it would be naming the lower layer's heartwood blade, and the wrong thing —
// or nothing at all — would come off the arm.
# test a-build-and-a-run-that-each-grew-something-keep-both
load: the-grown-blades-and-the-one-in-hand
unequip: mainhand
assert: inventory.combat-expansion.proving-blade = 1
assert: inventory.core.heartwood-blade = 1
assert: inventory.core.iron-sword = 1

// --- growing an item ---
//
// Core's cluster planes, walked from the DEBUG smith's chest, which is the only
// thing left that puts a jewel in anyone's hands and stands in no location.
//
// Recorded from a live session, so what follows is what a player types and the
// closing sheet is where that session ended: both grown copies, their planes,
// every allocation, and the effects each cluster carries. Regenerate the sheet
// with `npm run probe -- content --record tulsa.growing-a-heartwood-blade` when
// this content changes on purpose.
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
// session; regenerate the sheet with `npm run probe -- content --record
// tulsa.growing-through-the-inventory-screen` when this content changes on
// purpose.
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
// The claim is that the whole growth is reachable through the screen a player actually
// uses: the blade is out of the chest, grown, and on the arm at the end of it, having
// been driven there by nothing but modal submissions. A worn item's plane folds into the
// wearer's stats, and what that fold comes to is stats.ts's to prove rather than this
// route's. The sheet it closes on is what the view-parity sweep loads to draw a plane
// with points spent on it.
assert: has core.heartwood-blade
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

// Recorded from live sessions, so what each route spells is what a player typed
// and the closing sheet is where that session ended. Regenerate a sheet with
// `npm run probe -- content --record tulsa.<the route below it>` when this
// content changes on purpose.
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
// The claim is the one this route is named for: rage is granted by a landed swing and
// by nothing else, so a pool standing above empty after thirty seconds of swinging is
// the swings. What it came to is read off the state this route leaves, by the archetype
// tests in integration.test.ts, and against the ceiling asked for there rather than
// pinned here — a pass over the jewel moves the number and must not redden the walk.
assert: resource.combat-expansion.rage > 0
expect only: rage-rises-as-swings-land-end

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
// The tally is worth one evasion a stack and nothing else on this route touches that
// stat, so a reading above nothing is stacks being held behind the gate — which is what
// the route is named for. How many, and what the count is worth against what a stack
// pays, is separated out by the archetype tests in integration.test.ts, which read it
// off the state this route leaves rather than off a number pinned here.
assert: stat.evasion > 0
expect only: accelerated-vigor-stacks-behind-its-gate-end

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
// health off the player.
# test striking-a-thorned-enemy-costs-the-striker
load: at-the-proving-ground
// The thorns are the urchin's and not the player's: the jewel of the same name
// is still in the crate. Naming it is also what ties this route to the pack the
// urchin's passive comes from, so a world without that pack drops the route
// rather than replaying it against an urchin that has stopped being thorned.
assert: not has combat-expansion.retribution-jewel
use: core.melee-combat on spined-urchin
wait: 10
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
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"tulsa.armourers-chest.emptied":true},"xp":{"combat.attack":381},"resources":{"combat-expansion.rage":19800},"equipped":{"mainhand":"1"},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":1200,"attemptsMade":13,"span":2400}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.proving-post"}},"actors":{"tulsa.proving-post":{"resources":{"core.health":1809706,"combat-expansion.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":32400,"rng":3953799810}

# save accelerated-vigor-stacks-behind-its-gate-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"tulsa.armourers-chest.emptied":true},"xp":{"combat.attack":1063},"equipped":{"mainhand":"1","offhand":"combat-expansion.vigor-tally"},"buffs":{"player":[{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":88800},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":97428},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":107183},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":112508},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":119000},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":121980}]},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":420,"attemptsMade":30,"span":1374}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.proving-post"}},"actors":{"tulsa.proving-post":{"resources":{"core.health":1468992,"combat-expansion.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,2,6,5],"allocatedSlots":[],"effects":[]}}}}}},"time":62400,"rng":829729617}

# save poison-holds-the-struck-enemy-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"tulsa.armourers-chest.emptied":true},"xp":{"combat.attack":133},"resourceRateRemainders":{"core.health":40000},"equipped":{"mainhand":"1"},"buffs":{"tulsa.proving-post":[{"source":"combat-expansion.venom","tags":[{"kind":"keyword","value":"poison"},{"kind":"stat-bonus","statId":"core.regeneration","percent":false,"amount":{"min":-30,"max":-30}},{"kind":"duration","seconds":20}],"expiresAt":32000}]},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5,"span":2400}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.proving-post"}},"actors":{"tulsa.proving-post":{"resources":{"core.health":1928692,"combat-expansion.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":40000}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":12400,"rng":2882385315}

# save poison-lifts-when-its-own-duration-runs-out-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1},"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true,"tulsa.armourers-chest.emptied":true},"xp":{"combat.attack":133},"resourceRateRemainders":{"core.health":40000},"equipped":{"mainhand":"1"},"location":"tulsa.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":42400,"rng":2882385315}

# save striking-a-thorned-enemy-costs-the-striker-end
{"version":13,"flags":{"tulsa.proving-ground.discovered":true,"tulsa.proving-ground.touched":true,"tulsa.forge.discovered":true},"xp":{"combat.attack":109},"resources":{"core.health":6516},"resourceRateRemainders":{"core.health":40000},"location":"tulsa.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":true,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5,"span":2400}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"tulsa.spined-urchin"}},"actors":{"tulsa.spined-urchin":{"resources":{"core.health":1945968,"combat-expansion.rage":0,"fishing.line-health":0},"rateRemainders":{"core.health":40000}}}},"time":12400,"rng":1288631604}
