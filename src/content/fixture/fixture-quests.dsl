// A pack of its own, so the fixture world has two of them and a test about turning one off has
// something to turn off. It also holds the routes: a `# test` here is a claim about the engine, and
// is the only kind of route the suite walks now that no corpus test reaches it.

# info fixture-quests
version: 1.0.0
pack: fixture-quests
dependencies: core, fixture-town

# flag well-cleared

# entity fixture-town.rat
on core.death:
  set: well-cleared

# quest clear-the-well
title: Clear the Well
log: The keeper keeps looking at the well and not saying why.

stage offered:
  log: The keeper asked me to deal with whatever is in the well.
  fixture-town.keeper says:
    when: time >= 0
    ask: About the well.
    That well wants clearing, and I am not the one to do it.
  done when: well-cleared
  goto settled

stage settled:
  log: The well is quiet again.
  complete

// --- routes ---

# test the-green-is-where-a-game-begins
assert: resource.health >= 30

# test digging-pays-in-tails-and-experience
goto: green
use: location.green.dig
wait: done
assert: inventory.rat-tail >= 1
assert: xp.digging >= 4

# test a-rat-can-be-put-down
travel: well
use: melee-combat on rat until done
assert: well-cleared

# test clearing-the-well-completes-the-quest
journal: clear-the-well says The keeper keeps looking at the well and not saying why.
travel: well
use: melee-combat on rat until done
assert: clear-the-well.settled

# test the-counter-sells-what-it-stocks
goto: green
use: location.green.dig
wait: done
shop: counter
assert: inventory.copper-coin >= 20
submit-modal: item=buy:core.bread
submit-modal: count=1
submit-modal: item=close
assert: has bread

// --- saves ---
//
// The one route here that closes on a sheet rather than on words, because minting the sheet is what
// it is for: `npm run probe -- src/content/fixture --record minting-the-dug-in-save` prints the
// `# save` body below when the world under it changes.

# test minting-the-dug-in-save
goto: green
use: location.green.dig
wait: done
expect: dug-in

# test minting-the-at-the-well-save
travel: well
expect: at-the-well

# test a-save-stands-where-it-was-left-rather-than-where-a-game-begins
load: at-the-well
assert: fixture-town.well.touched

# test a-save-puts-the-player-back-where-it-left-them
load: dug-in
assert: inventory.rat-tail >= 1
assert: xp.digging >= 4

# test minting-the-kitted-save
goto: green
use: location.green.dig
wait: done
equip: spade
expect: kitted

# test a-save-carrying-what-is-worn-puts-it-back-on
load: kitted
assert: stat.attack >= 16

# test a-save-written-over-another-keeps-what-that-one-says
load: dug-in-and-fed
assert: inventory.rat-tail >= 1
assert: has bread

# save at-the-well
{"version":13,"flags":{"fixture-town.well.touched":true,"fixture-town.well.discovered":true,"fixture-town.green.discovered":true},"location":"fixture-town.well"}

# save dug-in
{"version":13,"inventory":{"core.rat-tail":1,"core.spade":1,"core.copper-coin":20},"flags":{"fixture-town.green.touched":true,"fixture-town.green.discovered":true,"fixture-town.well.discovered":true,"fixture-town.store.discovered":true,"fixture-town.lane.discovered":true},"xp":{"core.digging":4},"resources":{"core.health":30033},"resourceRateRemainders":{"core.health":20000},"time":2000}

// Written over the one above rather than restating it: what is carried takes the ids every layer
// writes, so this sheet holds the loaf and the tail both.
# save kitted
{"version":13,"inventory":{"core.rat-tail":1,"core.copper-coin":20},"flags":{"fixture-town.green.touched":true,"fixture-town.green.discovered":true,"fixture-town.well.discovered":true,"fixture-town.store.discovered":true,"fixture-town.lane.discovered":true},"xp":{"core.digging":4},"resources":{"core.health":30033},"resourceRateRemainders":{"core.health":20000},"equipped":{"main-hand":"core.spade"},"time":2000}

# save dug-in-and-fed
over: dug-in
{"version":13,"inventory":{"core.bread":1}}
