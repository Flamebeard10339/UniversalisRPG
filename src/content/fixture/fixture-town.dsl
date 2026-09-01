// Somewhere for the fixture world to stand: three places, a road between each pair, the player, a
// keeper with a counter, and something hostile to swing at. See `core.dsl` for what this
// world is and why it is not under `content/`.

# info fixture-town
version: 1.0.0
pack: fixture
dependencies: core

// --- places ---

# location green
title: The Green
examine: Cropped grass, a bench, and three ways out of it.
x: 0, y: 0
starting
adjacent: well, store, lane, gate while side-door.unlocked
entities: keeper, side-door
dig:
  time: 2
  on success:
    xp: digging 4
    give: 1 rat-tail
    give: 1 spade
    give: 20 copper-coin

# location well
title: The Well
examine: A stone rim, a bucket, and a long way down.
east of green
entities: 2 rat

# location lane
title: The Lane
examine: Mud, and a row of backs of houses.
south of green
entities: carter
feed the dogs:
  instant
  requires: has bread
  take: 1 bread
  say: They take it without looking up.

look in your pack:
  instant
  open modal: carried-items

check the journal:
  instant
  open modal: quest-journal

# location gate
title: The Gate
examine: Two posts and no gate between them any more.
west of green
pay the toll:
  instant
  requires: inventory.copper-coin >= 1
  take: 1 copper-coin
  say: Nobody is collecting, but you leave it on the post anyway.

# location store
title: The Store
examine: One counter and a shelf behind it.
north of green
adjacent: loft, cellar, shed, pump
entities: stair

# location shed
title: The Shed
examine: Tools, most of them somebody else's.
x: 1, y: -1

# location pump
title: The Pump
examine: It works if you know where to hit it.
x: 2, y: -1

# location loft
title: The Loft
examine: Sacks, and a window nobody has opened this year.
above store

# location cellar
title: The Cellar
examine: Cold, and lower than the well.
below store
entities: keeper, wanderer

// One shape on the map gathering the places under a roof, so a region has something to be, and two
// rooms written off another rather than placed, so a floor above and a floor below are reachable.
# region the-yard
holds: shed, pump, loft, cellar

// --- who is here ---

# entity player
title: You
faction: player
stats: max-health 30, attack 10, accuracy 10, evasion 0, defense 0, attack-rate 60
skills: core.digging, core.scavenging, haggling
passives: hale, keen
equipment-slots: main-hand, body, gloves
uses: melee-combat
on line-snapped:
  roll: snapped-line

# entity keeper
title: The Keeper
examine: An unhurried person behind an unhurried counter.
faction: world
stations: bench
keeps shop: counter

# entity rat
title: Rat
examine: Wet, and closer than it was.
faction: vermin
stats: max-health 8, attack 3, accuracy 8, evasion 2, defense 0, attack-rate 60
uses: melee-combat
aggressive
respawn after: 30s
on death:
  roll: vermin-drops

// A skill of its own, so this module is a second activity beside the core's — an activity is a
// module that declares skills, and a world with only one of them cannot say what two costs.
# stat haggling-rate
base: 10
group: skilling

# skill haggling
stat: haggling-rate

// Worn only by somebody who has climbed for it, which is the one shape that makes a tier's gear list
// depend on the tier.
# item ledger
title: Ledger
examine: Columns of figures in three hands, none of them tidy.
slot: main-hand
requires: level.haggling >= 5
value: 20
+3 core.attack

// --- what is said here ---

# dialogue keeper
owner = keeper

node greeting:
  always
  again: Still here, then.
  Morning. The green's yours to cross, and the well's yours to keep out of.
  -> What is down the well?
    goto the-well
  -> Nothing, thanks.
    goto parting

node the-well:
  Rats. More of them than there were.

// A second opener, so talking to the keeper puts up a list to pick out of rather than entering the
// one thread there is. An entity with one voice and an entity with several are different beats.
node about-the-town:
  when: time >= 0
  ask: How long have you kept this counter?
  Longer than the counter has.

node about-the-rats:
  when: time >= 0
  ask: Has anyone been down the well?
  Down, yes. Up is the part nobody manages.

node parting:
  Right you are.

# entity wanderer
title: The Wanderer
examine: Somebody who has walked further today than you have.
faction: world

// A stair is a free relocate to somewhere a road already reaches, which is the one shape that makes
// the road beside it a second way to say the same thing.
# entity stair
title: The Stair
faction: world
stations: bench
go up:
  instant
  relocate: loft
go down:
  instant
  relocate: cellar

// A door that governs the road it stands beside: until the player has met it, the road is what
// carries them out, and once they have, the door is.
# entity side-door
title: The Side Door
examine: Bolted from this side, which means it opens from this side.
faction: world
flags: unlocked
step through:
  instant
  hidden if: not side-door.unlocked
  relocate: gate

# entity carter
title: The Carter
examine: A cart, and somebody waiting beside it.
faction: world

# dialogue carter
owner = carter

node greeting:
  always
  again: Still loading.
  The lane's soft this time of year. Mind the ruts.

# dialogue wanderer
owner = wanderer

node greeting:
  always
  again: Three ways, still.
  Three ways out of a green is two more than most greens manage.

// --- what may be bought ---

# shop counter
coin: copper-coin
stocks: 5 bread, 2 rope
buying: 1.5
selling: 0.5
accepts: stocked

