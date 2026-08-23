# info tutorial-quests
version: 1.0.0
dependencies:
  core

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
log: They say a guide keeps this house, and takes newcomers in hand.
hint: Talk to Miki, in the guide house you woke in.

stage offered:
  log: A guide called Miki offered to show you the ropes.
  hint: Talk to Miki.
  core.miki says:
    always
    Greetings, adventurer! Welcome to UniversalisRPG.
    The name's Miki, your tutorial guide, here to walk you through your first steps.
    What do you say I show you the ropes?
    -> Sounds good. Teach me.
      goto name-yourself
    -> I'd rather find my own way.
      goto snubbed

stage name-yourself:
  log: Miki wants you to find the mirror and say who you are.
  hint: The mirror stands in the guide house, in the room Miki is in.
  hint when core.mirror-done: You have a name. Miki is in the same room, waiting to hear it.
  core.miki says:
    always
    again: The mirror's still waiting. Name yourself first, then we'll talk.
    Splendid! We start with what gives an adventurer purpose: quests.
    Your first task: find the mirror in this house and decide who you are, your name and your people.
  core.miki says:
    when: core.mirror-done
    There you are, {player.name}. A fine name.
    give: core.jug-of-water
    give: core.pot-of-flour
    Water and flour make dough - knead them together, then bake the dough in the oven.
    Give it a go. I'll wait.
    goto bake-bread

stage bake-bread:
  log: Water and flour make dough, and the oven makes bread of it.
  hint: Knead the dough, then bake it in the oven.
  hint when has core.bread: Take the loaf back to Miki.
  core.miki says:
    always
    sticky
    Knead that dough and get it in the oven, {player.name} - water and flour won't bake themselves.
  core.miki says:
    when: has core.bread
    A warm loaf! Well done, {player.name}.
    Keep it in your pack - eat it whenever you're hungry.
    Every swing and catch builds a skill, and skills raise your stats.
    Here, gear changes your stats the moment you equip it.
    give: core.iron-sword
    give: core.wooden-shield
    Downstairs in the basement you'll find giant rats. Put them down and watch your stats work.
    goto clear-the-rats

stage clear-the-rats:
  log: Miki wants three giant rats put down.
  hint: The basement, below the guide house.
  hint when core.rats-killed >= 3: Three down. Back up the stairs to Miki.
  core.miki says:
    always
    sticky
    Still those rats, {player.name}? Downstairs, in the basement.
  core.miki says:
    when: core.rats-killed >= 3
    Ha! Barely a scratch on you. You're a natural.
    Truth be told, there's little left I can teach you.
    So here's the last of it: get off this island. East, past the sand, and keep going - there's a whole world of skills out that way.
    set: core.front-door.unlocked
    Go on. Make some trouble worth telling stories about.
    goto sendoff

stage sendoff:
  log: You have the measure of the place. Miki says the way off is east, past the sand.
  complete
  core.miki says:
    always
    sticky
    Still here? East, past the sand. I've nothing else for you.

stage snubbed:
  log: You turned Miki down, and found your own way.
  hint: Miki is still in the guide house, if you think better of it. Otherwise the front door is locked, and nothing on this floor opens it.
  core.miki says:
    always
    sticky
    Hmph. Suit yourself. Don't come crying when a door won't open.
    if has core.lockpick:
      set: core.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed
  // Crossing routes is acknowledged: a player who snubbed Miki and killed the
  // rats anyway does not get the straight clear-the-rats line, since that one
  // lives in a stage this branch never reaches — they get this instead.
  core.miki says:
    when: core.rats-killed >= 3
    sticky
    Rats are dealt with, then. That was never the hard part.
    if has core.lockpick:
      set: core.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed

stage apologised:
  log: You went back and apologised. Miki took it, and set a price on it.
  hint: Miki handed you a fishing net. The window upstairs looks out over the water.
  hint when has core.fish: One fish, caught. Take it down to Miki.
  core.miki says:
    always
    sticky
    give: core.fishing-net
    Take the net. Bring me one fish out of it and I'll call us square. @@@ asked for "reach level 2 in any skill" as the unlock condition; the condition grammar (npm run oracle: a flag optionally compared to a number, has/not/and/or over items and flags declared by a # flag or an entity/location's own flags: field) has no skill-level or xp-threshold predicate, and no # event fires on a skill levelling up (its triggers are only on empty/on full/damage-dealt/damage-taken/missed/evaded/completed/unfinished) — nearest playable thing: Miki asks for one fish caught with the net instead, a plain item check
  core.miki says:
    when: has core.fish
    A fish. Right, then - you'll do. Door's open. Get yourself off this island, and that's the last of me you get.
    set: core.front-door.unlocked
    goto sendoff

// Every route out of the house lands here, and the joke is that it never
// leaves: no `complete` is ever reached, so the quest stands forever. Which
// line plays back is the choice outliving the house — a flag no route sets on
// purpose, only as a side effect of which way out it took.
//
// The door route's trigger is market-district.discovered rather than
// front-door.unlocked itself: a quest's stage only ever advances when the
// entity its dialogue is pinned to is talked to, and the door's own unlock —
// like reaching the beach it opens onto — happens while Miki can still be
// talked to, one talk before a player has anywhere to travel to. Gating on a
// place that is only discovered by having stood in it means Miki still gives
// his ordinary sendoff on the way out; this quest is what he has to say once
// you come back for one more word.
# quest leave-tutorial-island
title: Leave Tutorial Island
log: There is a town east of the sand, and it goes on a while. Miki still calls this an island.
hint: East, past the sand. See the town first.
hint when core.market-district.discovered: Go back to the guide house. Miki will have something to say about it.

stage adrift:
  log: Miki said his piece about your leaving. Neither of you has moved.
  hint: Nothing here needs doing. The town is east, and Miki is not going anywhere.
  core.miki says:
    when: core.market-district.discovered
    sticky
    So you found the market. That's the far side of the island, near enough. Off you go, then. I'll be here.
    goto adrift
  core.miki says:
    when: core.miki.angered
    sticky
    Went through my dresser, did you. Keep them - they'll get you further than I would have. I'll be here.
    goto adrift

// --- tests ---

# test quest-offered
talk: core.miki
choose: 0
assert: finding-your-feet.name-yourself

// Opens on a save so the route is walked with the pools a played game has.
# test miki-route-full
load: miki-route-start
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=elf
assert: core.mirror-done
talk: core.miki
assert: finding-your-feet.bake-bread
assert: has core.jug-of-water
craft: dough
assert: has core.dough
craft: bread
assert: has core.bread
talk: core.miki
assert: finding-your-feet.clear-the-rats
// A fight is bounded by its location, so the rats are fought where they stand
// rather than through the floor.
use: entity.stairs.descend
use: melee-combat on giant-rat until done
use: melee-combat on giant-rat until done
use: melee-combat on giant-rat until done
assert: core.rats-killed >= 3
use: entity.stairs-up.ascend
talk: core.miki
assert: finding-your-feet.sendoff
assert: core.front-door.unlocked
travel: beach
// Same second-talk shape as the apology route below: the eternal quest only
// picks up once the market district has been stood in, so a talk had while
// still inside the house would only repeat the ordinary sendoff.
travel: guide-house
talk: core.miki
assert: leave-tutorial-island.adrift
travel: beach
expect only: left-mikis-house
// The whole sheet, not a handful of flags: inventory, visits, xp, pools, the
// clock and the rng cursor all have to land where they landed. Regenerate with
// /create-valid-test when the route's content changes on purpose.
expect: miki-route-end

// --- thieving route: snub Miki, take the lockpick, fail the door, take the
// window instead. Costs 5 health on landing and leaves Miki angry — a fact
// the door itself can't carry (see the commit message), so it lives on Miki.

# test thieving-route-full
talk: core.miki
choose: 1
use: entity.stairs.ascend
use: entity.dresser.search-drawer
assert: has core.lockpick
use: entity.stairs-down.descend
// Reaching Miki with the lockpick already in hand is what the snubbed stage
// reads to get angry; declining to apologise is what closes that
// conversation back up, since a test (like a player) can't leave one hanging.
talk: core.miki
choose: 1
assert: core.miki.angered
// A second, separate talk: same as the door route above, a quest whose own
// condition just turned true does not pick it up until asked again.
talk: core.miki
assert: leave-tutorial-island.adrift
use: entity.stairs.ascend
use: entity.window.climb-out
assert: not core.front-door.unlocked
expect only: left-mikis-house
// Regenerate with /create-valid-test when this route's content changes on
// purpose. See thieving-route-full-end for why this isn't miki-route-end.
expect: thieving-route-full-end

// --- apology route: snub Miki, apologise, take the net, catch a fish, and
// the door opens the ordinary way. Converges on Miki's usual sendoff, since
// that line no longer says which route earned it.

# test apology-route-full
talk: core.miki
choose: 1
talk: core.miki
choose: 0
talk: core.miki
assert: has core.fishing-net
use: entity.stairs.ascend
use: entity.window.fish
assert: has core.fish
use: entity.stairs-down.descend
talk: core.miki
assert: finding-your-feet.sendoff
assert: core.front-door.unlocked
travel: beach
// Miki's ordinary sendoff is what a talk gets on the way out (see the door
// route's test); this quest is what stepping back in for one more word gets
// instead, now that there is somewhere to have come back from.
travel: guide-house
talk: core.miki
assert: leave-tutorial-island.adrift
travel: beach
expect only: left-mikis-house
// Regenerate with /create-valid-test when this route's content changes on
// purpose. See apology-route-full-end for why this isn't miki-route-end.
expect: apology-route-full-end

// bake-bread is left by a line Miki says and not by a `done when:`, so one
// stage stands over two beats: bake the loaf, then carry it back. This is the
// state each of that stage's two hints is gated on — the plain one while there
// is no loaf, `hint when has core.bread` once there is — and the proof that no
// single hint could be right in both.
# test bake-bread-spans-two-beats
load: miki-route-start
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=elf
talk: core.miki
assert: finding-your-feet.bake-bread and not has core.bread
craft: dough
craft: bread
assert: finding-your-feet.bake-bread and has core.bread and not finding-your-feet.clear-the-rats

// A `use:` that finds its own action already under way against the same
// target advances one cycle of the fight in progress instead of restarting
// it, so repeated `use:` with no `wait:` anywhere still puts the rats down.
# test rats-fall-to-repeated-use
load: miki-route-start
use: entity.stairs.descend
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
use: melee-combat on giant-rat
assert: core.rats-killed >= 3

// --- saves ---

// What all three routes out of the house genuinely land on, named once
// instead of asserted three times: the same beach, the same house explored,
// the same quest picked up. `finding-your-feet.sendoff` and
// `front-door.unlocked` are each true for two of the three routes and false
// for the third — the thief never gets the ordinary sendoff — so those two
// stay proven by each route's own `assert:` instead.
# save left-mikis-house
{"version":11,"location":"core.beach","flags":{"core.guide-house.discovered":true,"core.guide-house-upstairs.discovered":true,"core.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"core.beach.discovered":true,"core.market-district.discovered":true,"tutorial-quests.leave-tutorial-island.adrift":true}}

# save miki-route-start
{"version":11}

# save miki-route-end
{"version":11,"inventory":{"core.jug-of-water":0,"core.pot-of-flour":0,"core.dough":0,"core.bread":1,"core.iron-sword":1,"core.wooden-shield":1,"core.rat-bone":7},"flags":{"combat-expansion.proving-ground.discovered":true,"core.guide-house.discovered":true,"core.guide-house-upstairs.discovered":true,"core.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tutorial-quests.finding-your-feet.name-yourself":true,"core.mirror-done":true,"tutorial-quests.finding-your-feet.bake-bread":true,"tutorial-quests.finding-your-feet.clear-the-rats":true,"core.rats-killed":3,"core.front-door.unlocked":true,"core.beach.discovered":true,"tutorial-quests.finding-your-feet.sendoff":true,"core.market-district.discovered":true,"tutorial-quests.leave-tutorial-island.adrift":true},"visits":{"tutorial-quests.finding-your-feet.offered.miki.0.said":1,"tutorial-quests.finding-your-feet.name-yourself.miki.1.said":1,"tutorial-quests.finding-your-feet.bake-bread.miki.1.said":1,"tutorial-quests.finding-your-feet.clear-the-rats.miki.1.said":1,"tutorial-quests.leave-tutorial-island.adrift.miki.0.said":1},"xp":{"core.cooking":6,"core.melee":16},"resources":{"core.health":21000},"location":"core.beach","populations":{"core.basement":{"core.giant-rat":{"down":3,"due":[]}}},"time":36800,"rng":2776008081,"player":{"name":"Rowan","race":"elf"}}

// The thief's own closing sheet — not the door route's. `expect:` is a whole
// save compared exactly, so a route that never bakes or fights has no way to
// land on the same xp, clock or rng cursor as one that does both; what
// genuinely converges across all three routes is left-mikis-house instead,
// checked above by `expect only:`.
# save thieving-route-full-end
{"version":11,"inventory":{"core.lockpick":1},"flags":{"combat-expansion.proving-ground.discovered":true,"core.guide-house.discovered":true,"core.guide-house-upstairs.discovered":true,"core.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tutorial-quests.finding-your-feet.snubbed":true,"core.dresser.searched":true,"core.miki.angered":true,"tutorial-quests.leave-tutorial-island.adrift":true,"core.beach.discovered":true,"core.market-district.discovered":true},"visits":{"tutorial-quests.finding-your-feet.offered.miki.0.said":1,"tutorial-quests.finding-your-feet.snubbed.miki.0.said":1,"tutorial-quests.leave-tutorial-island.adrift.miki.1.said":1},"resources":{"core.health":25000},"location":"core.beach","rng":2617077404}

// The apology route's own closing sheet, same reasoning as the thief's above.
# save apology-route-full-end
{"version":11,"inventory":{"core.fishing-net":1,"core.fish":1},"flags":{"combat-expansion.proving-ground.discovered":true,"core.guide-house.discovered":true,"core.guide-house-upstairs.discovered":true,"core.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tutorial-quests.finding-your-feet.snubbed":true,"tutorial-quests.finding-your-feet.apologised":true,"core.front-door.unlocked":true,"core.beach.discovered":true,"tutorial-quests.finding-your-feet.sendoff":true,"core.market-district.discovered":true,"tutorial-quests.leave-tutorial-island.adrift":true},"visits":{"tutorial-quests.finding-your-feet.offered.miki.0.said":1,"tutorial-quests.finding-your-feet.snubbed.miki.0.said":1,"tutorial-quests.finding-your-feet.apologised.miki.0.said":1,"tutorial-quests.finding-your-feet.apologised.miki.1.said":1,"tutorial-quests.leave-tutorial-island.adrift.miki.0.said":1},"location":"core.beach","time":15000}
