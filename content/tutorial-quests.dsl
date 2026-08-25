# info tutorial-quests
version: 1.0.0
dependencies:
  core
  tulsa

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
  tulsa.miki says:
    always
    ask: Who are you, then?
    Greetings, adventurer! Welcome to UniversalisRPG.
    The name's Miki, your tutorial guide, here to walk you through your first steps.
    What do you say I show you the ropes?
    -> Sounds good. Teach me.
      say: Splendid! We start with what gives an adventurer purpose: quests.
      if not tulsa.mirror-done:
        say: Your first task: find the mirror in this house and decide who you are, your name and your people.
      if tulsa.mirror-done:
        say: Though you have stood in front of the mirror already, by the look of you, so that one is done before I set it. Come tell me who you turned out to be.
      goto name-yourself
    -> I'd rather find my own way.
      goto snubbed

stage name-yourself:
  log: Miki says the first thing an adventurer needs is to know who they are. I am not sure I do.
  tulsa.miki says:
    always
    sticky
    ask: About that mirror.
    The mirror's still waiting. Name yourself first, then we'll talk.
  tulsa.miki says:
    when: tulsa.mirror-done
    ask: I know who I am now.
    There you are, {player.name}. A fine name.
    give: core.jug-of-water
    give: core.pot-of-flour
    Water and flour make dough - knead them together, then bake the dough in the oven.
    Give it a go. I'll wait.
    goto bake-bread

stage bake-bread:
  log: Miki gave me water and flour. The two of them make dough, and dough wants an oven.
  tulsa.miki says:
    always
    sticky
    ask: About the bread.
    Knead that dough and get it in the oven, {player.name} - water and flour won't bake themselves.
  tulsa.miki says:
    when: has core.bread
    ask: The loaf is out of the oven.
    A warm loaf! Well done, {player.name}.
    Keep it in your pack - eat it whenever you're hungry.
    Every swing and catch builds a skill, and skills raise your stats.
    Here. Open up what you're carrying and put these on from there - your stats move the moment you do.
    give: core.iron-sword
    give: core.wooden-shield
    Downstairs in the basement you'll find giant rats. Put them down and watch your stats work.
    goto clear-the-rats

stage clear-the-rats:
  log: A sword and a shield, off Miki. He says there are giant rats under this house, and that three of them down would be proof enough.
  tulsa.miki says:
    always
    sticky
    ask: About the rats.
    Still those rats, {player.name}? Downstairs, in the basement.
  tulsa.miki says:
    when: tulsa.rats-killed >= 3
    ask: The rats are dealt with.
    Ha! Barely a scratch on you. You're a natural.
    Truth be told, there's little left I can teach you.
    So here's the last of it: get off this island. East, past the sand, and keep going - there's a whole world of skills out that way.
    set: tulsa.front-door.unlocked
    Go on. Make some trouble worth telling stories about.
    goto sendoff

stage sendoff:
  log: Miki says he has nothing left to teach me, and that the way off is east, past the sand.
  complete
  tulsa.miki says:
    always
    sticky
    ask: Anything else before I go?
    Still here? East, past the sand. I've nothing else for you.

stage snubbed:
  log: I turned Miki down. He took it badly, and the front door has not opened since.
  tulsa.miki says:
    always
    sticky
    ask: About what I said.
    Hmph. Suit yourself. Don't come crying when a door won't open.
    if has core.lockpick:
      set: tulsa.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed
  // Crossing routes is acknowledged: a player who snubbed Miki and killed the
  // rats anyway does not get the straight clear-the-rats line, since that one
  // lives in a stage this branch never reaches — they get this instead.
  tulsa.miki says:
    when: tulsa.rats-killed >= 3
    sticky
    ask: I cleared out your rats.
    Rats are dealt with, then. That was never the hard part.
    if has core.lockpick:
      set: tulsa.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed

stage apologised:
  log: I went back and apologised. Miki took it, and put a price on it: one fish, out of his own net.
  tulsa.miki says:
    always
    sticky
    ask: About squaring it with you.
    give: core.fishing-net
    Take the net. Bring me one fish out of it and I'll call us square. @@@ asked for "reach level 2 in any skill" as the unlock condition; the condition grammar (npm run oracle: a flag optionally compared to a number, has/not/and/or over items and flags declared by a # flag or an entity/location's own flags: field) has no skill-level or xp-threshold predicate, and no # event fires on a skill levelling up (its triggers are only on empty/on full/damage-dealt/damage-taken/missed/evaded/completed/unfinished) — nearest playable thing: Miki asks for one fish caught with the net instead, a plain item check
  tulsa.miki says:
    when: has core.fish
    ask: I caught you your fish.
    A fish. Right, then - you'll do. Door's open. Get yourself off this island, and that's the last of me you get.
    set: tulsa.front-door.unlocked
    goto sendoff

// Every route out of the house lands here, and the joke is that it never
// leaves: no `complete` is ever reached, so the quest stands forever. Which
// line plays back is the choice outliving the house — a flag no route sets on
// purpose, only as a side effect of which way out it took.
//
// The door route's trigger is market-square.discovered rather than
// front-door.unlocked itself: a quest's stage only ever advances when the
// entity its dialogue is pinned to is talked to, and the door's own unlock —
// like reaching the beach it opens onto — happens while Miki can still be
// talked to, one talk before a player has anywhere to travel to. Gating on a
// place that is only discovered by having stood in it means Miki still gives
// his ordinary sendoff on the way out; this quest is what he has to say once
// you come back for one more word.
# quest leave-tutorial-island
title: Leave Tutorial Island
log: East of the sand there is a town, and it goes on a while. Miki still calls this an island.

stage adrift:
  log: Miki had his last word about my leaving. Neither of us has moved since.
  tulsa.miki says:
    when: tulsa.market-square.discovered
    sticky
    ask: About this island of yours.
    So you found the market. That's the far side of the island, near enough. Off you go, then. I'll be here.
    goto adrift
  tulsa.miki says:
    when: tulsa.miki.angered
    sticky
    ask: About your dresser.
    Went through my dresser, did you. Keep them - they'll get you further than I would have. I'll be here.
    goto adrift

// --- tests ---

# test quest-offered
talk: tulsa.miki
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
assert: tulsa.mirror-done
talk: tulsa.miki
choose: continue
assert: finding-your-feet.bake-bread
assert: has core.jug-of-water
craft: dough
assert: has core.dough
craft: bread
assert: has core.bread
talk: tulsa.miki
choose: continue
assert: finding-your-feet.clear-the-rats
// A fight is bounded by its location, so the rats are fought where they stand
// rather than through the floor.
use: entity.stairs.descend
use: melee-combat on giant-rat until done
use: melee-combat on giant-rat until done
use: melee-combat on giant-rat until done
assert: tulsa.rats-killed >= 3
use: entity.stairs-up.ascend
talk: tulsa.miki
choose: continue
assert: finding-your-feet.sendoff
assert: tulsa.front-door.unlocked
travel: beach
// Same second-talk shape as the apology route below: the eternal quest only
// picks up once the market district has been stood in, so a talk had while
// still inside the house would only repeat the ordinary sendoff.
travel: guide-house
talk: tulsa.miki
choose: leave-tutorial-island.adrift.miki.0.said
choose: continue
assert: leave-tutorial-island.adrift
travel: beach
expect only: left-mikis-house
// This route's own sheet, on top of the ground all three converge on: the rats'
// drops, the visits, the xp, the pools, the clock and the rng cursor. A scalar
// field a save names is compared whole either way, so the clock and the cursor
// are pinned here as firmly as `expect:` pinned them; what `expect only:` lets
// go is the keys this sheet never named. Regenerate with /create-valid-test
// when the route's content changes on purpose.
expect only: miki-route-end

// --- thieving route: snub Miki, take the lockpick, fail the door, take the
// window instead. Costs 5 health on landing and leaves Miki angry — a fact
// the door itself can't carry (see the commit message), so it lives on Miki.

# test thieving-route-full
talk: tulsa.miki
choose: I'd rather find my own way.
use: entity.stairs.ascend
use: entity.dresser.search-drawer
assert: has core.lockpick
use: entity.stairs-down.descend
// Reaching Miki with the lockpick already in hand is what the snubbed stage
// reads to get angry; declining to apologise is what closes that
// conversation back up, since a test (like a player) can't leave one hanging.
talk: tulsa.miki
choose: Not a chance.
assert: tulsa.miki.angered
// A second, separate talk: same as the door route above, a quest whose own
// condition just turned true does not pick it up until asked again.
talk: tulsa.miki
choose: leave-tutorial-island.adrift.miki.1.said
choose: continue
assert: leave-tutorial-island.adrift
use: entity.stairs.ascend
use: entity.window.climb-out
assert: not tulsa.front-door.unlocked
// The drop is what the route pays instead of the door: five off the thirty the
// player starts with, and nothing on this route gives any of it back. The
// condition roots read a pool and not what is missing from one, so this is the
// total the drop leaves — exact, because a band here would also hold in a world
// where the window cost twenty.
assert: resource.core.health = 25
expect only: left-mikis-house
// Regenerate with /create-valid-test when this route's content changes on
// purpose. See thieving-route-full-end for why this isn't miki-route-end.
expect only: thieving-route-full-end

// --- apology route: snub Miki, apologise, take the net, catch a fish, and
// the door opens the ordinary way. Converges on Miki's usual sendoff, since
// that line no longer says which route earned it.

# test apology-route-full
talk: tulsa.miki
choose: I'd rather find my own way.
talk: tulsa.miki
choose: Actually - sorry. Show me the ropes after all.
talk: tulsa.miki
choose: continue
assert: has core.fishing-net
use: entity.stairs.ascend
use: entity.window.fish
assert: has core.fish
use: entity.stairs-down.descend
talk: tulsa.miki
choose: continue
assert: finding-your-feet.sendoff
assert: tulsa.front-door.unlocked
travel: beach
// Miki's ordinary sendoff is what a talk gets on the way out (see the door
// route's test); this quest is what stepping back in for one more word gets
// instead, now that there is somewhere to have come back from.
travel: guide-house
talk: tulsa.miki
choose: continue
assert: leave-tutorial-island.adrift
travel: beach
expect only: left-mikis-house
// Regenerate with /create-valid-test when this route's content changes on
// purpose. See apology-route-full-end for why this isn't miki-route-end.
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
talk: tulsa.miki
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
// list of threads matter: snub him, refuse again, drop out of the window, go far
// enough to find the market, and come back in off the sand. Both quests have
// something to say by then, so from here on every talk is a list — and the line
// carrying the apology is in it, which is the whole claim. It is proved out here
// and not on the ordinary apology route, because that route makes it up with him
// before it ever leaves the house.
# test the-apology-survives-going-out-of-the-window
talk: tulsa.miki
choose: I'd rather find my own way.
talk: tulsa.miki
choose: Not a chance.
use: entity.stairs.ascend
use: entity.window.climb-out
travel: market-square
travel: beach
travel: guide-house
assert: tulsa.market-square.discovered and not tulsa.front-door.unlocked
talk: tulsa.miki
choose: finding-your-feet.snubbed.miki.0.said
choose: Actually - sorry. Show me the ropes after all.
assert: finding-your-feet.apologised
talk: tulsa.miki
choose: finding-your-feet.apologised.miki.0.said
choose: continue
assert: has core.fishing-net
use: entity.stairs.ascend
use: entity.window.fish
assert: has core.fish
use: entity.stairs-down.descend
talk: tulsa.miki
choose: finding-your-feet.apologised.miki.1.said
choose: continue
assert: finding-your-feet.sendoff and tulsa.front-door.unlocked

// --- saves ---

// What all three routes out of the house genuinely land on, named once
// instead of asserted three times: the same beach, the same house explored,
// the same quest picked up. `finding-your-feet.sendoff` and
// `front-door.unlocked` are each true for two of the three routes and false
// for the third — the thief never gets the ordinary sendoff — so those two
// stay proven by each route's own `assert:` instead.
# save left-mikis-house
{"version":13,"location":"tulsa.beach","flags":{"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true,"tulsa.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tulsa.beach.discovered":true,"tulsa.market-square.discovered":true,"tutorial-quests.leave-tutorial-island.adrift":true}}

# save miki-route-start
{"version":13}

# save miki-route-end
{"version":13,"inventory":{"core.bread":1,"core.wooden-shield":1,"core.rat-bone":4},"flags":{"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true,"tulsa.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tutorial-quests.finding-your-feet.name-yourself":true,"tulsa.mirror-done":true,"tutorial-quests.finding-your-feet.bake-bread":true,"tutorial-quests.finding-your-feet.clear-the-rats":true,"tulsa.rats-killed":3,"tulsa.front-door.unlocked":true,"tulsa.beach.discovered":true,"tutorial-quests.finding-your-feet.sendoff":true,"tulsa.market-square.discovered":true,"combat-expansion.proving-ground.discovered":true,"tutorial-quests.leave-tutorial-island.adrift":true},"visits":{"tutorial-quests.finding-your-feet.offered.miki.0.said":1,"tutorial-quests.finding-your-feet.name-yourself.miki.1.said":1,"tutorial-quests.finding-your-feet.bake-bread.miki.1.said":1,"tutorial-quests.finding-your-feet.clear-the-rats.miki.1.said":1,"tutorial-quests.leave-tutorial-island.adrift.miki.0.said":1},"xp":{"core.cooking":6,"core.melee":14},"resources":{"core.health":24529},"location":"tulsa.beach","instances":{"next":2,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"populations":{"tulsa.basement":{"tulsa.giant-rat":{"down":3,"due":[]}}},"time":28400,"rng":3953799810,"player":{"name":"Rowan","race":"core.elf"}}

// The thief's own closing sheet — not the door route's. A route that never
// bakes or fights lands on different holdings, a different clock and a
// different rng cursor from one that does both, so the three routes get three
// sheets; what genuinely converges across all of them is left-mikis-house,
// which each of them also closes on.
# save thieving-route-full-end
{"version":13,"inventory":{"core.lockpick":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true,"tulsa.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tutorial-quests.finding-your-feet.snubbed":true,"tulsa.dresser.searched":true,"tulsa.miki.angered":true,"tutorial-quests.leave-tutorial-island.adrift":true,"tulsa.beach.discovered":true,"tulsa.market-square.discovered":true},"visits":{"tutorial-quests.finding-your-feet.offered.miki.0.said":1,"tutorial-quests.finding-your-feet.snubbed.miki.0.said":1,"tutorial-quests.leave-tutorial-island.adrift.miki.1.said":1},"resources":{"core.health":25000},"location":"tulsa.beach","rng":2617077404}

// The apology route's own closing sheet, same reasoning as the thief's above.
# save apology-route-full-end
{"version":13,"inventory":{"core.fishing-net":1,"core.fish":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.guide-house.discovered":true,"tulsa.guide-house-upstairs.discovered":true,"tulsa.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tutorial-quests.finding-your-feet.snubbed":true,"tutorial-quests.finding-your-feet.apologised":true,"tulsa.front-door.unlocked":true,"tulsa.beach.discovered":true,"tutorial-quests.finding-your-feet.sendoff":true,"tulsa.market-square.discovered":true,"tutorial-quests.leave-tutorial-island.adrift":true},"visits":{"tutorial-quests.finding-your-feet.offered.miki.0.said":1,"tutorial-quests.finding-your-feet.snubbed.miki.0.said":1,"tutorial-quests.finding-your-feet.apologised.miki.0.said":1,"tutorial-quests.finding-your-feet.apologised.miki.1.said":1,"tutorial-quests.leave-tutorial-island.adrift.miki.0.said":1},"location":"tulsa.beach","time":9000}
