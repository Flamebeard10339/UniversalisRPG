# info first-steps
version: 1.0.0
dependencies:
  core
  tulsa
  cooking
  fishing
  thieving

// The whole of the tutorial quest: what the journal reads at each stage, what
// Miki says while the quest stands there, and what moving on does. Nothing else
// in the world knows this quest exists — take this module out and the house
// still loads, Miki still has a word for a traveller, and the mirror, the oven
// and the rats are all still there to be found.
//
// The quest owns no flags. A stage is a flag, so `finding-your-feet.bake-bread`
// is what anything else would ask about; `mirror-done` and `rats-killed` belong
// to the mirror and the rats, which are what set them.
//
// Every stage is left by a line Miki says rather than by a `done when:`, so
// reaching one is a thing that happened and not a thing that is worked out: the
// flag is really set, and a save carries it.

# quest finding-your-feet
title: Finding Your Feet
log: I woke in a house that is not mine. They say whoever keeps it takes newcomers in hand.

stage offered:
  log: A guide called Miki offered to show me the ropes.
  first-steps.miki says:
    always
    ask: Who are you, then?
    Greetings, adventurer! Welcome to UniversalisRPG.
    The name's Miki, your tutorial guide, here to walk you through your first steps.
    What do you say I show you the ropes?
    -> Sounds good. Teach me.
      say: Splendid! We start with what gives an adventurer purpose: quests.
      if not first-steps.mirror-done:
        say: Your first task: find the mirror in this house and decide who you are, your name and your people.
      if first-steps.mirror-done:
        say: Though you have stood in front of the mirror already, by the look of you, so that one is done before I set it. Come tell me who you turned out to be.
      goto name-yourself
    -> I'd rather find my own way.
      goto snubbed

stage name-yourself:
  log: Miki says the first thing an adventurer needs is to know who they are. I am not sure I do.
  first-steps.miki says:
    always
    sticky
    ask: About that mirror.
    The mirror's still waiting. Name yourself first, then we'll talk.
  first-steps.miki says:
    when: first-steps.mirror-done
    ask: I know who I am now.
    There you are, {player.name}. A fine name.
    give: core.jug-of-water
    give: core.pot-of-flour
    Water and flour make dough - knead them together, then bake the dough in the oven.
    Give it a go. I'll wait.
    goto bake-bread

stage bake-bread:
  log: Miki gave me water and flour. The two of them make dough, and dough wants an oven.
  first-steps.miki says:
    always
    sticky
    ask: About the bread.
    Knead that dough and get it in the oven, {player.name} - water and flour won't bake themselves.
  first-steps.miki says:
    when: has core.bread
    ask: The loaf is out of the oven.
    A warm loaf! Well done, {player.name}.
    Keep it in your pack - eat it whenever you're hungry.
    Every swing and catch builds a skill, and skills raise your stats.
    Here - a sword and a shield. Better than your fists, and they're yours.
    give: core.iron-sword
    give: core.wooden-shield
    Downstairs in the basement you'll find giant rats. Put them down and watch your stats work.
    One thing first: they do nothing sat in your pack. Open up what you're carrying, have a look at the pair of them, and put them on - your stats move the moment you do.
    // Last, so the screen lands under the conversation rather than over it: a
    // node's results run before what it says is put up, so the pack is what the
    // player finds on reading Miki out, and no line of his is talked over.
    open modal: carried-items
    goto clear-the-rats

stage clear-the-rats:
  log: A sword and a shield, off Miki. He says there are giant rats under this house, and that three of them down would be proof enough.
  first-steps.miki says:
    always
    sticky
    ask: About the rats.
    Still those rats, {player.name}? Downstairs, in the basement.
  first-steps.miki says:
    when: first-steps.rats-killed >= 3
    ask: The rats are dealt with.
    Ha! Barely a scratch on you. You're a natural.
    Truth be told, there's little left I can teach you.
    So here's the last of it: get off this island. Out the front door and up the road, and keep going - there's a whole world of skills out that way.
    set: first-steps.front-door.unlocked
    Go on. Make some trouble worth telling stories about.
    goto sendoff

stage sendoff:
  log: Miki says he has nothing left to teach me, and that the way off is out the front door and up the road.
  complete
  first-steps.miki says:
    always
    sticky
    ask: Anything else before I go?
    Still here? Out the door and up the road. I've nothing else for you.

stage snubbed:
  log: I turned Miki down. He took it badly, and the front door has not opened since.
  first-steps.miki says:
    always
    sticky
    ask: About what I said.
    Hmph. Suit yourself. Don't come crying when a door won't open.
    if has core.lockpick:
      set: first-steps.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed
  // Crossing routes is acknowledged: a player who snubbed Miki and killed the
  // rats anyway does not get the straight clear-the-rats line, since that one
  // lives in a stage this branch never reaches — they get this instead.
  first-steps.miki says:
    when: first-steps.rats-killed >= 3
    sticky
    ask: I cleared out your rats.
    Rats are dealt with, then. That was never the hard part.
    if has core.lockpick:
      set: first-steps.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed

stage apologised:
  log: I went back and apologised. Miki took it, and put a price on it: one catch out of the pond behind his house, in a net he lent me.
  // Not sticky: the node hands over a net, and sticky replays a node whole, so
  // a player who talked this through four times walked away with four nets.
  // `again:` is the other half of that pair — the offer is made once, and what
  // every talk after it gets is Miki pointing at the net already in the pack.
  first-steps.miki says:
    always
    ask: About squaring it with you.
    again: The net's yours already. One shrimp out of the pond and we're square.
    give: fishing.small-fishing-net
    Take the net - there's a pond out the back, and shrimp in it. Bring me one and I'll call us square. @@@ asked for "reach level 2 in any skill" as the unlock condition; the condition grammar (npm run oracle: a flag optionally compared to a number, has/not/and/or over items and flags declared by a # flag or an entity/location's own flags: field) has no skill-level or xp-threshold predicate, and no # event fires on a skill levelling up (its triggers are only on empty/on full/damage-dealt/damage-taken/missed/evaded/completed/unfinished) — nearest playable thing: Miki asks for one shrimp netted out of the pond behind the house instead, a plain item check
  first-steps.miki says:
    when: has fishing.raw-shrimp
    ask: I netted you your shrimp.
    Shrimp. Right, then - you'll do. Door's open. Get yourself off this island, and that's the last of me you get.
    set: first-steps.front-door.unlocked
    goto sendoff

// Every route out of the house lands here, and the joke is that it never
// leaves: no `complete` is ever reached, so the quest stands forever. Which
// line plays back is the choice outliving the house — a flag no route sets on
// purpose, only as a side effect of which way out it took.
//
// The door route's trigger is market-square.touched rather than
// front-door.unlocked itself: a quest's stage only ever advances when the
// entity its dialogue is pinned to is talked to, and the door's own unlock
// happens while Miki can still be talked to, one talk before a player has
// anywhere to travel to. `touched` and not `discovered`, because standing
// anywhere puts its neighbours on the map: unlocking the door puts the market
// on it, and Miki would say you had found it to someone still standing in his
// front room. Gating on having stood there means Miki still gives his ordinary
// sendoff on the way out; this quest is what he has to say once you come back
// for one more word.
# quest leave-tutorial-island
title: Leave Tutorial Island
log: Up the road there is a town, and it goes on a while. Miki still calls this an island.

stage adrift:
  log: Miki had his last word about my leaving. Neither of us has moved since.
  first-steps.miki says:
    when: tulsa.market-square.touched
    sticky
    ask: About this island of yours.
    So you found the market. That's the far side of the island, near enough. Off you go, then. I'll be here.
    goto adrift
  first-steps.miki says:
    when: first-steps.miki.angered
    sticky
    ask: About your dresser.
    Went through my dresser, did you. Keep them - they'll get you further than I would have. I'll be here.
    goto adrift

// --- tests ---

# test quest-offered
talk: first-steps.miki
choose: Sounds good. Teach me.
choose: continue
assert: finding-your-feet.name-yourself

// Opens on a save so the route is walked with the pools a played game has.
# test miki-route-full
load: miki-route-start
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
assert: first-steps.mirror-done
talk: first-steps.miki
choose: continue
assert: finding-your-feet.bake-bread
assert: has core.jug-of-water
craft: dough
assert: has core.dough
craft: bread
assert: has core.bread
talk: first-steps.miki
choose: continue
// Reading Miki out leaves the pack he opened standing, which is the whole of
// what his handover line buys. Shut it and go down the stairs; nothing on this
// route is worn, so what the screen was for is proved by its being there and
// not by anything taken in it.
submit-modal: item=close
assert: finding-your-feet.clear-the-rats
// A fight is bounded by its location, so the rats are fought where they stand
// rather than through the floor. One Fight clears the cellar: melee is
// continuous, so it re-arms on the next rat still standing, and the tally
// below is what says it did.
use: entity.stairs.descend
use: melee-combat on giant-rat until done
assert: first-steps.rats-killed >= 3
use: entity.stairs-up.ascend
talk: first-steps.miki
choose: continue
assert: finding-your-feet.sendoff
assert: first-steps.front-door.unlocked
travel: market-square
// Same second-talk shape as the apology route below: the eternal quest only
// picks up once the market district has been stood in, so a talk had while
// still inside the house — where unlocking the door only puts the market on
// the map — would repeat the ordinary sendoff instead.
travel: guide-house
talk: first-steps.miki
choose: leave-tutorial-island.adrift.miki.0.said
choose: continue
assert: leave-tutorial-island.adrift
travel: market-square
expect only: left-mikis-house
// This route's own sheet, on top of the ground all three converge on: the rats'
// drops, the visits, the xp, the pools, the clock and the rng cursor. A scalar
// field a save names is compared whole either way, so the clock and the cursor
// are pinned here as firmly as `expect:` pinned them; what `expect only:` lets
// go is the keys this sheet never named.
// Regenerate with npm run probe -- content --record first-steps.miki-route-full
// when the route's content changes on purpose.
expect only: miki-route-end

// --- thieving route: snub Miki, take the lockpick, fail the door, take the
// window instead. Costs 5 health on landing and leaves Miki angry — a fact
// the door itself can't carry (see the commit message), so it lives on Miki.

# test thieving-route-full
talk: first-steps.miki
choose: I'd rather find my own way.
use: entity.stairs.ascend
use: entity.dresser.search-drawer
assert: has core.lockpick
use: entity.stairs-down.descend
// Reaching Miki with the lockpick already in hand is what the snubbed stage
// reads to get angry; declining to apologise is what closes that
// conversation back up, since a test (like a player) can't leave one hanging.
talk: first-steps.miki
choose: Not a chance.
assert: first-steps.miki.angered
// A second, separate talk: same as the door route above, a quest whose own
// condition just turned true does not pick it up until asked again.
talk: first-steps.miki
choose: leave-tutorial-island.adrift.miki.1.said
choose: continue
assert: leave-tutorial-island.adrift
use: entity.stairs.ascend
use: entity.window.climb-out
assert: not first-steps.front-door.unlocked
// The drop is what the route pays instead of the door: five off the pool the
// player starts with, and nothing on this route gives any of it back. That pool
// is the thirty on their own sheet and the level of Health they stand at, which
// is where the odd fraction comes from. The condition roots read a pool and not
// what is missing from one, so this is the total the drop leaves — exact,
// because a band here would also hold in a world where the window cost twenty.
assert: resource.core.health = 26.31
expect only: left-mikis-house
// Regenerate with npm run probe -- content --record first-steps.thieving-route-full
// when this route's content changes on purpose. See thieving-route-full-end for
// why this isn't miki-route-end.
expect only: thieving-route-full-end

// --- apology route: snub Miki, apologise, take the net, net a shrimp out of the
// pond behind the house, and the door opens the ordinary way. Converges on Miki's
// usual sendoff, since that line no longer says which route earned it.
//
// The net and the water are both the world's own, so this route is also the claim
// that the tackle Miki lends works on the shoals the rest of the game is built
// out of: `net the shrimp` refuses anyone without one of the two nets, and it is
// Miki's that answers for it here.

# test apology-route-full
talk: first-steps.miki
choose: I'd rather find my own way.
talk: first-steps.miki
choose: Actually - sorry. Show me the ropes after all.
talk: first-steps.miki
choose: continue
assert: has fishing.small-fishing-net
// Talked through twice more before going fishing. The offer stands as long as
// the catch is owed, so the line keeps being reachable; what it must not do is
// keep paying out, which is what the count below is here for.
talk: first-steps.miki
choose: continue
talk: first-steps.miki
choose: continue
assert: inventory.fishing.small-fishing-net = 1
use: entity.back-door.step-out-back
use: entity.fishing.shrimp-shoal.net-the-shrimp until has fishing.raw-shrimp
assert: has fishing.raw-shrimp
use: entity.back-door-in.step-inside
talk: first-steps.miki
choose: continue
assert: finding-your-feet.sendoff
assert: first-steps.front-door.unlocked
travel: market-square
// Miki's ordinary sendoff is what a talk gets on the way out (see the door
// route's test); this quest is what stepping back in for one more word gets
// instead, now that there is somewhere to have come back from.
travel: guide-house
talk: first-steps.miki
choose: continue
assert: leave-tutorial-island.adrift
travel: market-square
expect only: left-mikis-house
// Regenerate with npm run probe -- content --record first-steps.apology-route-full
// when this route's content changes on purpose. See apology-route-full-end for
// why this isn't miki-route-end.
expect only: apology-route-full-end

// bake-bread is left by a line Miki says and not by a `done when:`, so one
// stage stands over two beats: bake the loaf, then carry it back. The two
// `assert:` lines are the beats. The `journal:` lines are what the player is
// reading across both of them — the stage's own `log:`, still the line they are
// standing on, with everything behind it crossed off.
# test bake-bread-spans-two-beats
load: miki-route-start
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
talk: first-steps.miki
choose: continue
assert: finding-your-feet.bake-bread and not has core.bread
journal: finding-your-feet says Miki gave me water and flour. The two of them make dough, and dough wants an oven.
craft: dough
craft: bread
assert: finding-your-feet.bake-bread and has core.bread and not finding-your-feet.clear-the-rats
journal: finding-your-feet says Miki gave me water and flour. The two of them make dough, and dough wants an oven.

// --- the window into the apology ---
//
// The one way through the house nobody had walked, and the one that made the
// list of threads matter: snub him, refuse again, drop out of the window into
// the market, and walk back in through his front room. Both quests have
// something to say by then, so from here on every talk is a list — and the line
// carrying the apology is in it, which is the whole claim. It is proved out here
// and not on the ordinary apology route, because that route makes it up with him
// before it ever leaves the house.
# test the-apology-survives-going-out-of-the-window
talk: first-steps.miki
choose: I'd rather find my own way.
talk: first-steps.miki
choose: Not a chance.
use: entity.stairs.ascend
use: entity.window.climb-out
travel: guide-house
assert: tulsa.market-square.touched and not first-steps.front-door.unlocked
talk: first-steps.miki
choose: finding-your-feet.snubbed.miki.0.said
choose: Actually - sorry. Show me the ropes after all.
assert: finding-your-feet.apologised
talk: first-steps.miki
choose: finding-your-feet.apologised.miki.0.said
choose: continue
assert: has fishing.small-fishing-net
use: entity.back-door.step-out-back
use: entity.fishing.shrimp-shoal.net-the-shrimp until has fishing.raw-shrimp
assert: has fishing.raw-shrimp
use: entity.back-door-in.step-inside
talk: first-steps.miki
choose: finding-your-feet.apologised.miki.1.said
choose: continue
assert: finding-your-feet.sendoff and first-steps.front-door.unlocked

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

// The drawer's contested roll over shipped content. On the default seed this
// search comes up empty behind the lockpick, so an assertion over inventory
// alone would also hold in a world where the drawer never rolls at all — which
// is the shape of test this branch's audit caught. The whole sheet is what tells
// the two apart: `luck vs 60` and the table behind it move the rng cursor
// whether or not they yield anything, and `expect:` is what pins that.
// Regenerate with npm run probe -- content --record first-steps.dresser-trinket
// when the drawer's odds change on purpose.
// The landing is not on the map until it has been stood in, so the stairs are
// how a fresh game first gets to it — which is the same first climb a player
// makes, and the reason this line is not a `travel:`.
# test dresser-trinket
use: entity.stairs.ascend
use: entity.dresser.search-drawer
assert: has lockpick
assert: searched
expect: dresser-trinket-end

// The two words for a place, told apart on the one line where the engine
// makes the difference: picking the lock opens the road into town, which puts
// the market on the map without anyone walking into it.
# test a-lockpick-opens-the-front-door
run: dresser-trinket
travel: guide-house
use: entity.front-door.pick-lock
assert: front-door.unlocked
assert: market-square.discovered
assert: not market-square.touched
assert: guide-house.touched
assert: xp.thieving = 4
assert: time >= 4

// The house is walked into and not read off the map: a room of it reaches the
// map by being stood in and not before, which is why every road out of the front
// room carries a clause. The landing stands for all of them — the clause is the
// mechanism and it is the same one on the cellar and the yard, so a room this
// house grows next is covered by copying the line rather than by editing this.
// A fresh game therefore opens with the front room on the map and nothing else.
# test a-room-of-this-house-reaches-the-map-by-being-stood-in
load: miki-route-start
assert: guide-house.discovered and not guide-house-upstairs.discovered
use: entity.stairs.ascend
assert: guide-house-upstairs.discovered

// Miki's oven is a stove as well as an oven, so the shrimp that comes out of the
// pond behind his house is cooked on it by the world's own recipe, at the same
// station the tavern's bar stove opens. What the contest then makes of it is
// cooking's business; that the raw shrimp is spent at all is what says the
// station answered.
# test the-tutorial-oven-cooks-what-the-tutorial-catches
load: shrimp-at-mikis-oven
craft: cooked-shrimp
assert: not has fishing.raw-shrimp

# test save-restores-object-owned-flags
load: explored-and-unlocked
assert: front-door.unlocked
assert: market-square.discovered

// Things can die. A foe whose pool is emptied is gone and its `on death:` ran,
// which is what `rats-killed` counts; one swing does it because the hammer says
// it does, and nothing about the rat's twenty health is being relied on.
# test one-swing-of-a-million-attack-hammer-fells-a-rat
DEBUG
load: armed-with-a-million-attack-hammer
equip: million-attack-hammer
use: entity.stairs.descend
use: melee-combat on giant-rat
assert: first-steps.rats-killed = 1

// The stages of a fight. A `use:` that finds its own action already under way
// against the same target advances a cycle of the fight in progress; one that
// re-armed would snapshot the rat at full health every time, so at eight a
// swing against twenty no run of them, however long, would ever empty the pool.
// Two swings are sixteen and three are twenty-four, so the third is the one
// that lands the kill and the second must not — and it is the second assertion
// that makes a rebalance of the rat fail this loudly, rather than quietly
// leaving behind a claim about one swing that a re-arming `use:` would pass too.
# test two-eight-health-swings-leave-a-rat-up-and-the-third-puts-it-down
DEBUG
load: armed-with-an-eight-a-swing-hammer
equip: eight-a-swing-hammer
use: entity.stairs.descend
use: melee-combat on giant-rat
use: melee-combat on giant-rat
assert: first-steps.rats-killed = 0
use: melee-combat on giant-rat
assert: first-steps.rats-killed = 1

// --- saves ---

// What all three routes out of the house genuinely land on, named once
// instead of asserted three times: the same square, the same front room, the
// same quest picked up. No other room of the house is in it — a room reaches
// the map by being stood in, and the three routes stand in three different
// ones. `finding-your-feet.sendoff` and `front-door.unlocked` are each true
// for two of the three routes and false for the third — the thief never gets
// the ordinary sendoff — so those two stay proven by each route's own
// `assert:` instead.
# save left-mikis-house
{"version":13,"location":"tulsa.market-square","flags":{"first-steps.guide-house.discovered":true,"first-steps.finding-your-feet.offered":true,"tulsa.market-square.discovered":true,"tulsa.market-square.touched":true,"first-steps.leave-tutorial-island.adrift":true}}

# save miki-route-start
{"version":13}

# save miki-route-end
{"version":13,"inventory":{"core.bread":1,"core.wooden-shield":1,"core.rat-bone":8,"core.rat-tail":1},"flags":{"first-steps.guide-house.touched":true,"first-steps.guide-house.discovered":true,"first-steps.finding-your-feet.offered":true,"first-steps.finding-your-feet.name-yourself":true,"first-steps.mirror-done":true,"first-steps.finding-your-feet.bake-bread":true,"first-steps.finding-your-feet.clear-the-rats":true,"first-steps.basement.touched":true,"first-steps.basement.discovered":true,"first-steps.rats-killed":3,"first-steps.front-door.unlocked":true,"tulsa.market-square.discovered":true,"first-steps.finding-your-feet.sendoff":true,"tulsa.market-square.touched":true,"tulsa.market-row.discovered":true,"tulsa.tavern-street.discovered":true,"tulsa.castle-gate.discovered":true,"tulsa.kelsa-farmhouse.discovered":true,"tulsa.swamp-edge.discovered":true,"tulsa.kings-road.discovered":true,"tulsa.riverside.discovered":true,"first-steps.leave-tutorial-island.adrift":true},"visits":{"first-steps.finding-your-feet.offered.miki.0.said":1,"first-steps.finding-your-feet.name-yourself.miki.1.said":1,"first-steps.finding-your-feet.bake-bread.miki.1.said":1,"first-steps.finding-your-feet.clear-the-rats.miki.1.said":1,"first-steps.leave-tutorial-island.adrift.miki.0.said":1},"xp":{"cooking.cooking":6,"combat.attack":127,"combat.health":97},"resources":{"core.health":25235},"location":"tulsa.market-square","instances":{"next":2,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"populations":{"first-steps.basement":{"first-steps.giant-rat":{"down":3,"due":[]}}},"time":34400,"rng":1498481104,"player":{"name":"Rowan","race":"core.elf"}}

// The thief's own closing sheet — not the door route's. A route that never
// bakes or fights lands on different holdings, a different clock and a
// different rng cursor from one that does both, so the three routes get three
// sheets; what genuinely converges across all of them is left-mikis-house,
// which each of them also closes on.
# save thieving-route-full-end
{"version":13,"inventory":{"core.lockpick":1},"flags":{"first-steps.finding-your-feet.offered":true,"first-steps.finding-your-feet.snubbed":true,"first-steps.guide-house-upstairs.touched":true,"first-steps.guide-house-upstairs.discovered":true,"first-steps.guide-house.discovered":true,"first-steps.dresser.searched":true,"first-steps.guide-house.touched":true,"first-steps.miki.angered":true,"first-steps.leave-tutorial-island.adrift":true,"tulsa.market-square.touched":true,"tulsa.market-square.discovered":true,"tulsa.market-row.discovered":true,"tulsa.tavern-street.discovered":true,"tulsa.castle-gate.discovered":true,"tulsa.kelsa-farmhouse.discovered":true,"tulsa.swamp-edge.discovered":true,"tulsa.kings-road.discovered":true,"tulsa.riverside.discovered":true},"visits":{"first-steps.finding-your-feet.offered.miki.0.said":1,"first-steps.finding-your-feet.snubbed.miki.0.said":1,"first-steps.leave-tutorial-island.adrift.miki.1.said":1},"resources":{"core.health":26310},"location":"tulsa.market-square","time":9000,"rng":2617077404}

// The apology route's own closing sheet, same reasoning as the thief's above.
# save apology-route-full-end
{"version":13,"inventory":{"fishing.small-fishing-net":1,"fishing.raw-shrimp":1},"flags":{"first-steps.finding-your-feet.offered":true,"first-steps.finding-your-feet.snubbed":true,"first-steps.finding-your-feet.apologised":true,"first-steps.backyard.touched":true,"first-steps.backyard.discovered":true,"first-steps.guide-house.discovered":true,"first-steps.guide-house.touched":true,"first-steps.front-door.unlocked":true,"tulsa.market-square.discovered":true,"first-steps.finding-your-feet.sendoff":true,"tulsa.market-square.touched":true,"tulsa.market-row.discovered":true,"tulsa.tavern-street.discovered":true,"tulsa.castle-gate.discovered":true,"tulsa.kelsa-farmhouse.discovered":true,"tulsa.swamp-edge.discovered":true,"tulsa.kings-road.discovered":true,"tulsa.riverside.discovered":true,"first-steps.leave-tutorial-island.adrift":true},"visits":{"first-steps.finding-your-feet.offered.miki.0.said":1,"first-steps.finding-your-feet.snubbed.miki.0.said":1,"first-steps.finding-your-feet.apologised.miki.0.said":3,"first-steps.finding-your-feet.apologised.miki.1.said":1,"first-steps.leave-tutorial-island.adrift.miki.0.said":1},"xp":{"fishing.fishing":18},"location":"tulsa.market-square","time":17000,"rng":582581775}

# save dresser-trinket-end
{"version":13,"inventory":{"core.lockpick":1},"flags":{"first-steps.guide-house-upstairs.touched":true,"first-steps.guide-house-upstairs.discovered":true,"first-steps.guide-house.discovered":true,"first-steps.dresser.searched":true},"location":"first-steps.guide-house-upstairs","time":3000,"rng":2617077404}

# save explored-and-unlocked
{"version":13,"flags":{"first-steps.front-door.unlocked":true,"tulsa.market-square.discovered":true}}

// Standing at the oven with something to roast. Nothing in the world grants a
// raw chestnut, so this save is the only way cooking's chestnut recipe is
// reached at all.
# save chestnuts-in-hand
{"version":13,"inventory":{"core.raw-chestnut":3}}

// Standing at the oven with the pond's own catch in hand, which is what says the
// oven is a stove: the shrimp came out of the water behind the house.
# save shrimp-at-mikis-oven
{"version":13,"location":"first-steps.guide-house","inventory":{"fishing.raw-shrimp":1}}

// A purse with the price of a second look in it, and a purse a coin short of
// one, standing in the room the mirror is in.
# save at-the-mirror-with-a-thousand-coin
{"version":13,"location":"first-steps.guide-house","inventory":{"core.coin":1000}}

# save at-the-mirror-one-coin-short
{"version":13,"location":"first-steps.guide-house","inventory":{"core.coin":999}}

# save renamed-at-the-mirror
{"version":13,"player":{"name":"Wren","race":"core.orc"},"inventory":{"core.coin":0}}

# save named-once-with-nine-hundred-and-ninety-nine-coin
{"version":13,"player":{"name":"Rowan","race":"core.elf"},"inventory":{"core.coin":999}}

# save armed-with-a-million-attack-hammer
DEBUG
{"version":13,"inventory":{"first-steps.million-attack-hammer":1}}

# save armed-with-an-eight-a-swing-hammer
DEBUG
{"version":13,"inventory":{"first-steps.eight-a-swing-hammer":1}}

// Two hammers whose numbers this file declares, so that what the tests swinging
// them prove is proved about the engine rather than about what the last balance
// pass did to base attack or to the rat's sheet: a million is more than any of
// that will ever move, and `-100% attack` scales the whole stat — base, bonuses
// and all — to nothing, so the second hammer's own swing is worth the least the
// engine lets a landed hit be worth and the eight it drains is the whole of what
// it does.
# item million-attack-hammer
DEBUG
slot: mainhand
weapon, +1000000 attack, +1000000 accuracy

# item eight-a-swing-hammer
DEBUG
slot: mainhand
weapon, -100% attack, +1000000 accuracy
on hit:
  drain: 8 health from them

// Miki has a word for a traveller whatever else is loaded. A quest that wants
// more of him gives him more to say; this is what is left when none is.
# dialogue miki
owner = miki

node greeting:
  always
  Well met. Miki, they call me - I keep an eye on this stretch of coast.
  There's a mirror over there if you've a mind to know your own face, and rats in the basement if you haven't.

# flag mirror-done

# flag rats-killed

# entity miki
faction: player
examine: A weathered man in patched leather, quick to smile.
flags: angered

# entity front-door
examine: A heavy wooden door, bound in iron. The latch lifts from this side once whatever is holding it has stopped.
flags: unlocked
step outside:
  instant
  hidden if: not unlocked
  relocate: market-square
  say: You lift the latch and step out into the light coming off the water, and the road carries you the short way into the market.
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
    say: You need 1000 coin to perform this action.

# entity oven
examine: A stone oven, its coals still glowing. The top of it is flat and takes a pan, which is the whole difference between an oven and a kitchen.
stations: oven, stove

// A flight of stairs is a leg of the journey and is paid for like one, at the
// same three seconds the road out of the house costs.
# entity stairs
title: Stairs
ascend:
  time: 3
  relocate: guide-house-upstairs
  say: You climb to the second floor.
descend:
  time: 3
  relocate: basement
  say: You head down into the basement.

# entity stairs-down
title: Stairs
descend:
  time: 3
  relocate: guide-house
  say: You head back down to the ground floor.

# entity stairs-up
title: Stairs
ascend:
  time: 3
  relocate: guide-house
  say: You climb back up to the ground floor.

# entity back-door
title: Back Door
examine: A plank door at the back of the room, swollen in its frame, with green light coming round the edge of it.
step out back:
  time: 3
  relocate: backyard
  say: You lean on the door until it gives, and step out into the yard.

# entity back-door-in
title: Back Door
step inside:
  time: 3
  relocate: guide-house
  say: You duck back in out of the wet.

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
  relocate: market-square
  drain: 5 health
  say: You get a leg over the sill, hang off it as long as your arms will have it, and let go. The sand takes most of the drop and your ankles take the rest, and the road into town is right there.

// 20 health against the player's 10 a hit is two hits, ~2.5 swings at 80%, so a
// rat falls in about six seconds and lands a bite or two on the way out. It
// swings back because it `uses:` an action, not because a tag says so.
# entity giant-rat
title: Giant Rat
examine: A hunched rat claws at an overturned crate, eyes red in the dark.
stats: attack 6-8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
uses: melee-combat
hidden if: rats-killed >= 3
on death:
  add: rats-killed 1
  say: You put down another rat.
  credit:
    roll: rat-remains
    1 in 3:
      roll: trinket

# location guide-house
x: 0, y: 0
starting
examine: A cluttered but cozy cottage. Miki's guide house.
adjacent:
  // This house is walked into rather than read off the map. Without these three
  // clauses a player who has not moved yet has the landing, the cellar and the
  // yard on the map already; the stairs and the back door are how each is first
  // reached, and the map is what has them from then on.
  guide-house-upstairs while guide-house-upstairs.touched
  basement while basement.touched
  backyard while backyard.touched
  // The road back in is this same edge read from the far end, so it carries this
  // same condition: without the second clause, dropping out of the window with the
  // door still shut would leave the house unreachable from the square.
  market-square while front-door.unlocked or market-square.touched
entities:
  miki, front-door, stairs, mirror, oven, back-door

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

// The water the tutorial teaches on is the same water the rest of the world has:
// the shoal standing here is the one the riverside stands on, so a net that works
// in this yard works in the river and a net that does not works in neither.
# location backyard
x: -1, y: 0
examine: A strip of grass behind the house, walled on three sides, with a pond at the end of it deeper than it has any business being.
adjacent:
  guide-house
entities:
  fishing.shrimp-shoal, back-door-in
