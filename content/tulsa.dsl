# info tulsa
version: 1.0.0
pack: tulsa
dependencies:
  core
  cooking
  smithing
  crafting

# flag heard-of-the-back-way

# flag sewer-toll-paid

# flag corners-slathered

# flag wurm-defeated

# flag hives-searched

# flag the-third-search-was-in-the-field

# flag the-third-search-was-at-the-mouth

# item bottle-of-vodka
title: Bottle of Vodka
examine: Sunny's own. The label is hand-written and does not say what is in it.

# item sewer-key
title: Sewer Key
examine: A heavy iron key, left on a table by someone who expected to come back for it.

# location market-square
x: 7, y: 0
title: Market Square
examine: Four roads meet under the awnings, and you can see three of the town's gates from where you are standing. There is a sewer grate set into the cobbles with a boy hunched over it.
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
  general-store, woodcutters-stall, 6 civilian
flags: axe-taken
lift an axe off the rack:
  hidden if: axe-taken
  time: 5
  set: axe-taken
  give: 1 hand-axe
  say: You take the end axe off the rack while the woodcutter is counting somebody else's coin, and you are two stalls away before the gap in it shows.

# location market-rooftops
above market-row
title: Market Rooftops
examine: Tile and thatch over the stalls, the wall-walk one roof away, and the castle's upper windows across the town.
adjacent:
  market-row

# location forge
x: 9, y: -1
title: The Forge
examine: A low stone shop at the end of the row with the fire banked. An anvil stands unused in the middle of the floor.
adjacent:
  market-row
  proving-ground
entities:
  bladesmiths-son, anvil, smithing.forge-counter

# location proving-ground
x: 11, y: -1
title: Proving Ground
examine: A walled yard behind the armoury, sand raked flat and stained, with the town wall for one of its four sides.
adjacent:
  forge

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
  sunny, bar-stove, pass-rail, drunk-patron, 3 civilian

# location oolga-house
x: 8, y: 2
title: Oolga's House
examine: A crooked house wedged between two straighter ones at the top of the lane. Bundles of something dry hang from every beam.
adjacent:
  tavern-street
  oolga-basement
entities:
  oolga, oolgas-counter

# location oolga-basement
below oolga-house
title: Oolga's Cellar
examine: A dirt-floored cellar. Something has been at the sacks in the corner, and part of the far wall has fallen in.
adjacent:
  oolga-house
  sewer-junction
entities:
  broken-wall, oolgas-sacks, groundwurm

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

# region oolga-house
title: Oolga's
holds:
  oolga-house
  oolga-basement

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
  nan, nans-hearth, 2 civilian

# location hasks-house
x: 5, y: 2
title: Hask's House
examine: A cooper's, and the front room is staves. Somewhere behind the staves a family is having its dinner.
adjacent:
  well-lane
entities:
  hask, hasks-stove, 2 civilian

# location doss-house
x: 3, y: 2
title: The Doss House
examine: Beds by the night, eleven of them in one room, and a fire at the end that everybody cooks on and nobody cleans.
adjacent:
  well-lane
  rogue-den
entities:
  doss-house-fire, 7 civilian

# location rogue-den
x: 3, y: 2, z: -1
title: The Rogue Den
examine: A cellar under the beds with a good floor, better light than the room above it, and eleven people down here who are all facing the door.
adjacent:
  doss-house

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
  bel, bels-kiln, 2 civilian

# location aggies-house
x: 12, y: 0
title: Aggie's House
examine: Nets over every surface that will take one, and a stove going under a pan that has fish in it whatever hour you arrive.
adjacent:
  kiln-lane
entities:
  aggie, aggies-stove, spoon-crock, 2 civilian

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
  bench, 4 civilian

# location bee-gate
x: 10, y: 2
title: The Bee Gate
examine: The east gate, and hardly a gate at all: a postern in the corner of Kelsa's yard that the town gave up minding when it gave up minding the bees.
adjacent:
  kelsa-farmhouse
  apiary-field
  tunnel-mouth
  pasture

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

# location apiary-field
x: 10, y: 3
title: The Apiary
examine: Three hives on the far side of the property, and the air between them is not calm.
adjacent:
  bee-gate
  hive-mouth
entities:
  5 drone-bee, first-hive, second-hive

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
  the-muster

# location the-muster
x: 16, y: 13, z: -1
title: The Muster
examine: The tunnel opens into a dug hall with a roof held up by pit props, and there are more of them down here than the town above has soldiers. Nobody is in a hurry. They are waiting for a date.
adjacent:
  tunnels

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
  herb-patch, dumped-crates

# location north-road
x: 8, y: -5
title: The North Road
examine: Out of the King's Gate and banked either side, with rocks along the top of the bank that are a very good size for standing behind.
adjacent:
  kings-road
  pinewood

# location pinewood
x: 8, y: -6
title: The Pinewood
examine: Black pine and no undergrowth at all, which means you can see a long way and so can everything else.
adjacent:
  north-road

# location deep-water
x: 7, y: 5
title: The Deep Water
examine: Downstream of the wall, past the last of the houses. The bank is undercut here and the water does not look like the same river.
adjacent:
  riverside
  the-narrows

# location the-narrows
x: 6, y: 6
title: The Narrows
examine: The valley closes in and the river goes quiet and fast between two shoulders of rock. Nobody has built anything down here and the path stops being a path.
adjacent:
  deep-water

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
  sewer-signs

# location sewer-outfall
x: 7, y: 0, z: -1
title: Sewer Outfall
examine: The channel widens and slows here, under a grate you can see daylight through. A barred door stands where the water goes.
adjacent:
  sewer-junction
  sewer-locked-room while barred-door.unlocked
entities:
  barred-door, outfall-grate

# location sewer-locked-room
x: 10, y: 0, z: -1
title: The Barred Room
examine: A dry room behind the water, kept by someone. A table, a shelf, and two things standing on their hind legs.
adjacent:
  sewer-outfall
entities:
  key-table, sewer-shelf

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

# shop general-store
coin: coin
stocks:
  6 core.pot-of-flour
  10 core.jug-of-water
  4 core.unassuming-cap
  4 core.linen-shirt
  4 core.linen-pants
  4 core.simple-boots

# entity general-store
title: General Store
examine: Flour, water, rope, and a jar by the till for coins too bent to spend elsewhere.
keeps shop: general-store

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

# entity sewer-shelf
title: Shelf
examine: A plank shelf on two spikes driven into the brick, with a lamp, a whetstone, and a flat iron thing at the back of it under a cloth.
flags: emptied

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

# entity the-well
title: The Well
examine: Deep enough that the bucket is out of sight before you hear it land.
draw water:
  continuous
  time: 8
  give: 1 core.jug-of-water
  on success:
    say: You wind the bucket up and fill a jug off it.

# entity washing-line
title: Washing Line
examine: Somebody's whole week strung across the lane at head height, and it has been there since before it rained.
flags: taken
lift a shirt off the line:
  hidden if: taken
  time: 5
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
  set: taken
  give: 1 core.bread
  say: You take the end one and put the gap in the middle of the row, which buys you about a minute.

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

# entity pass-rail
title: The Pass Rail
examine: The shelf over the bar's stove where the dockets went up, and the last of them is still on the spike.
flags: emptied
go through the spike:
  time: 6
  hidden if: emptied
  set: emptied
  give: 1 cooking.a-hot-pass-jewel
  say: Under forty years of dockets there is a brass tally worn through at one corner, from a kitchen that never once got behind.

# entity spoon-crock
title: The Spoon Crock
examine: A crock by Aggie's stove with more wooden spoons in it than one person could use in a life.
flags: emptied
look through the spoons:
  time: 6
  hidden if: emptied
  set: emptied
  give: 1 cooking.a-steady-hand-jewel
  say: One of them is burnt black along a single edge and nowhere else, which takes a steadier hand than most people have.

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
  time: 12
  give: 1 adders-tongue
  say: One split leaf, taken whole.

# entity dumped-crates
title: Dumped Crates
examine: Alchemy crates thrown into the bushes in a hurry, and among the straw a scatter of insect eggs, broken and badly wrong.

# entity civilian
title: Townsman
examine: Somebody about their day, with a purse on their belt and no reason to expect you.
stats: attack 5, defense 1, max-health 20, attack-rate 15, accuracy 55, evasion 25
uses: core.melee-combat
faction: world
respawn after: 45s

# entity guardsman
title: Guardsman
examine: One of the duke's, in a coat of plates and a mood.
stats: attack 16, defense 8, max-health 70, attack-rate 20, accuracy 90, evasion 40
uses: core.melee-combat
faction: world
respawn after: 70s

# entity knight
title: Knight
examine: Iron from the crown of his head to the soles of his feet, and he has been hit by better than you.
stats: attack 26, defense 14, max-health 130, attack-rate 20, accuracy 100, evasion 45
uses: core.melee-combat
faction: world
respawn after: 100s

# entity drone-bee
title: Drone Bee
examine: A drone off one of Kelsa's hives, and it should not be this angry.
stats: attack 6, defense 0, max-health 14, attack-rate 30, accuracy 70, evasion 55
uses: core.melee-combat
faction: world
aggressive
respawn after: 2m

# entity player
title: You
faction: core.player
stats: max-health 30, attack 8-12, defense 5, attack-rate 25, accuracy 100, evasion 0
skills: core.woodcutting, cooking.cooking, smithing.smithing, crafting.crafting
equipment-slots: mainhand, offhand, head, body, legs, gloves, boots
uses: core.melee-combat
on death:
  say: You slump to the floor, spent, and come to a long while later somewhere you did not lie down. (You should have eaten something.)
  set: core.fainted
  restore: core.health
  shake off: everything
  perform: core.faint

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

# recipe sunnys-poison
station: stove
in: royal-jelly, mollusk-venom, bottle-of-vodka
out: sunnys-poison
skill: cooking.cooking 2
time: 4
say: You mix the jelly, the venom and the vodka together over the heat. What comes off it is worse than any one of the three on its own, which is rather the point.

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

# save in-town
{"version":13,"location":"tulsa.market-square"}

# save in-town-with-a-sword-and-a-shield
{"version":13,"location":"tulsa.market-row","instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.wooden-shield","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save in-town-with-bent-coins
{"version":13,"location":"tulsa.market-square","inventory":{"core.bent-coin":8}}

# save hurt-in-town
{"version":13,"location":"tulsa.market-square","resources":{"core.health":11000}}

# save at-the-sewer-junction
{"version":13,"location":"tulsa.sewer-junction","inventory":{"core.lockpick":1},"flags":{"tulsa.heard-of-the-back-way":true}}

# save axe-at-the-swamp-edge
{"version":13,"location":"tulsa.swamp-edge","instances":{"next":2,"byId":{"1":{"kind":"item","template":"core.hand-axe","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save a-netful-on-well-lane
{"version":13,"location":"tulsa.well-lane","inventory":{"fishing.raw-shrimp":4}}

# save armed-at-the-sewer-junction
over: in-town-with-a-sword-and-a-shield, at-the-sewer-junction
{"version":13}

# item deaths-door
DEBUG
step-through:
  drain: 1000 core.health

# item sunnys-poison
title: Sunny's "Poison"
examine: A jar of royal jelly, mollusk venom and good vodka, mixed until it stops smelling like any of the three. Nothing sane would go near it.

# save four-rows-and-a-blade-worn
DEBUG
{"version":13,"inventory":{"core.bent-coin":2,"core.rats-eye-gem":1,"tulsa.deaths-door":1},"equipped":{"mainhand":"2"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.25,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.75,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

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
wait: done
assert: inventory.core.bent-coin = 0
assert: inventory.core.rats-eye-gem = 0
assert: inventory.core.iron-sword = 0
assert: inventory.deaths-door = 0

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

# test a-sword-and-a-shield-are-goods-at-a-counter
load: in-town-with-a-sword-and-a-shield
shop: general-store
submit-modal: item=sell:1
submit-modal: item=sell:2
submit-modal: item=close
assert: inventory.coin > 0
assert: not has core.iron-sword
assert: not has core.wooden-shield

# test kelsas-corner-is-the-towns-rather-than-a-quests
unkillable
load: in-town
travel: kelsa-farmhouse
travel: bee-gate
travel: apiary-field
use: entity.first-hive.harvest-comb until done
use: entity.second-hive.harvest-comb until done
assert: has core.honeycomb
use: entity.first-hive.search-the-comb until done
assert: hives-searched = 1

# test the-well-is-where-the-water-is
load: a-netful-on-well-lane
travel: town-well
use: entity.the-well.draw-water
assert: inventory.core.jug-of-water = 1
use: entity.the-well.draw-water
assert: inventory.core.jug-of-water = 2

# test the-wall-in-oolgas-cellar-is-the-back-way
load: in-town
travel: market-row
travel: oolga-house
travel: oolga-basement
use: entity.broken-wall.squeeze-through
assert: heard-of-the-back-way
assert: sewer-junction.discovered

# test the-bench-is-where-health-comes-back
load: hurt-in-town
assert: resource.core.health = 11
wait: 60
use: entity.bench.sit-down
wait: 60

# test a-log-costs-four-swings-of-an-axe
load: axe-at-the-swamp-edge
use: entity.dead-alder.chop-a-log
assert: time > 3
assert: inventory.core.log = 1
assert: xp.core.woodcutting > 0

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

# test the-key-opens-the-barred-door
load: at-the-sewer-junction
unkillable
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
assert: barred-door.unlocked
travel: sewer-locked-room
use: entity.key-table.take-the-key
assert: has sewer-key

# test what-two-layers-of-a-save-each-keep
load: armed-at-the-sewer-junction
assert: inventory.core.iron-sword = 1
assert: inventory.core.wooden-shield = 1
assert: inventory.core.lockpick = 1
assert: heard-of-the-back-way
travel: sewer-outfall

