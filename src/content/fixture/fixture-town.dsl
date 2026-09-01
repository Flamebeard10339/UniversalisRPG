// Somewhere for the fixture world to stand: three places, a road between each pair, the player, a
// keeper with a counter, and something hostile to swing at. See `fixture-core.dsl` for what this
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
adjacent: well, store
entities: keeper

# location well
title: The Well
examine: A stone rim, a bucket, and a long way down.
east of green
entities: 2 rat

# location store
title: The Store
examine: One counter and a shelf behind it.
north of green
entities: keeper, wanderer

// --- who is here ---

# entity player
title: You
faction: player
stats: max-health 30, attack 10, accuracy 10, evasion 0, defense 0, attack-rate 60
skills: digging, scavenging
passives: hale, keen
equipment-slots: main-hand, body
uses: melee-combat

# entity keeper
title: The Keeper
examine: An unhurried person behind an unhurried counter.
faction: world
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

node parting:
  Right you are.

# entity wanderer
title: The Wanderer
examine: Somebody who has walked further today than you have.
faction: world

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
buying: 50
selling: 100
accepts: stocked

// --- what may be done here ---

# location green
dig:
  time: 2
  on success:
    xp: digging 4
    give: 1 rat-tail
    give: 1 spade
