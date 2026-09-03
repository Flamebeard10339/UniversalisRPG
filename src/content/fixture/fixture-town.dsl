# info fixture-town
version: 1.0.0
pack: fixture
dependencies: core

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
entities: carter, drover
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
entities: stair, chest, keeper

# location shed
title: The Shed
examine: Tools, most of them somebody else's.
x: 1, y: -1
entities: strongbox, hoard

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

# region the-yard
holds: shed, pump, loft, cellar

# entity player
title: You
faction: player
stats: max-health 30, attack 8-12, accuracy 100, evasion 0, defense 0, attack-rate 60
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
stats: max-health 40, attack 2-4, accuracy 8, evasion 0, defense 0, attack-rate 60
uses: melee-combat
aggressive
respawn after: 10m
on death:
  roll: vermin-drops

# stat haggling-rate
base: 10
group: skilling

# skill haggling
stat: haggling-rate

# item ledger
title: Ledger
examine: Columns of figures in three hands, none of them tidy.
slot: main-hand
requires: level.haggling >= 5
value: 20
+3 core.attack

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

# entity stair
title: The Stair
faction: world
go up:
  instant
  relocate: loft
go down:
  instant
  relocate: cellar

# action unbolt
title: Unbolt the Door
time: 1
stands: standing-open for 5s

# guise standing-open
title: The Side Door, Open
examine: The bolt is drawn and the door is standing open on the gate road, and it will swing back on its own.
without: unbolt

# entity side-door
title: The Side Door
examine: Bolted from this side, which means it opens from this side.
faction: world
flags: unlocked
uses: unbolt
step through:
  instant
  hidden if: not side-door.unlocked
  relocate: gate

# entity chest
title: The Chest
faction: world
open:
  instant
  give: 1 heavy-spade
  give: 1 keen-edge-jewel
  give: 1 stout-heart-jewel

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

# entity drover
title: The Drover
examine: Somebody bringing four cows up a lane built for two.
faction: world

# dialogue drover
owner = drover

node greeting:
  always
  again: Still four of them.
  Four cows, one lane. You work it out.

node about-the-well:
  when: well.touched
  ask: Is the well as deep as they say?
  Deeper. I have never had a bucket come back full.

# dialogue wanderer
owner = wanderer

node greeting:
  always
  again: Three ways, still.
  Three ways out of a green is two more than most greens manage.

# flag stash
bundle

# entity strongbox
title: The Strongbox
examine: An iron box with a lid that takes two hands and a key that takes none.
faction: world
put it all in:
  instant
  stash = take: everything
tip it out:
  instant
  give: everything in stash

# entity hoard
title: The Hoard
examine: Somebody's whole life in a heap, and nobody standing near it.
faction: world
help yourself:
  instant
  give: 1 bread
  give: 1 spade
  give: 1 rope
  give: 1 twine
  give: 1 stout-twine
  give: 1 heavy-spade
  give: 1 quiet-hour-jewel
  give: 1 copper-coin
  give: 1 leather-gloves
  give: 1 jerkin
  give: 1 keen-edge-jewel
  give: 1 stout-heart-jewel

# shop counter
coin: copper-coin
stocks: 5 bread, 2 rope
buying: 1.5
selling: 0.5
accepts: stocked

# test one-thing-open-is-said-outright-rather-than-put-in-a-list
travel: lane
talk: carter
choose: continue
assert: carter.greeting.visits = 1

# test a-thread-open-beside-a-greeting-is-the-one-thing-open
travel: well
travel: green
travel: lane
talk: drover
choose: continue
assert: drover.about-the-well.visits = 1
assert: drover.greeting.visits = 0

# test more-than-one-thread-open-is-put-up-to-be-picked-from
talk: keeper
choose: keeper.about-the-rats
choose: continue
assert: keeper.about-the-rats.visits = 1
assert: keeper.greeting.visits = 0

# test a-bundle-holds-a-whole-pack-and-hands-it-back
goto: green
use: location.green.dig
wait: done
goto: shed
use: entity.strongbox.put-it-all-in
assert: not has rat-tail
assert: count.stash >= 1
use: entity.strongbox.tip-it-out
assert: has rat-tail
assert: count.stash < 1

# test what-will-not-fit-is-left-standing-in-the-bundle
goto: green
use: location.green.dig
wait: done
goto: shed
use: entity.strongbox.put-it-all-in
use: entity.hoard.help-yourself
use: entity.strongbox.tip-it-out
assert: not has rat-tail
assert: count.stash >= 1
