# info tutorial-quests
version: 1.0.0
dependencies:
  tutorial-island

// The whole of the tutorial quest: what the journal reads at each stage, what
// Miki says while the quest stands there, and what moving on does. Nothing else
// in the world knows this quest exists — take this module out and the island
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
log: They say a guide keeps an eye on this island, and takes newcomers in hand.
hint: Talk to Miki, in the guide house you woke in.

stage offered:
  log: A guide called Miki offered to show you the ropes.
  hint: Talk to Miki.
  tutorial-island.miki says:
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
  hint: The mirror is upstairs in the guide house.
  tutorial-island.miki says:
    always
    sticky
    again: The mirror's still waiting. Name yourself first, then we'll talk.
    Splendid! We start with what gives an adventurer purpose: quests.
    Your first task: find the mirror in this house and decide who you are, your name and your people.
  tutorial-island.miki says:
    when: tutorial-island.mirror-done
    There you are, {player.name}. A fine name.
    give: tutorial-island.jug-of-water
    give: tutorial-island.pot-of-flour
    Water and flour make dough - knead them together, then bake the dough in the oven.
    Give it a go. I'll wait.
    goto bake-bread

stage bake-bread:
  log: Water and flour make dough, and the oven makes bread of it.
  hint: Knead the dough, then bake it in the oven.
  tutorial-island.miki says:
    always
    sticky
    Knead that dough and get it in the oven, {player.name} - water and flour won't bake themselves.
  tutorial-island.miki says:
    when: has tutorial-island.bread
    A warm loaf! Well done, {player.name}.
    Keep it in your pack - eat it whenever you're hungry.
    Every swing and catch builds a skill, and skills raise your stats.
    Here, gear changes your stats the moment you equip it.
    give: tutorial-island.iron-sword
    give: tutorial-island.wooden-shield
    Downstairs in the basement you'll find giant rats. Put them down and watch your stats work.
    goto clear-the-rats

stage clear-the-rats:
  log: Miki wants three giant rats put down.
  hint: The basement, below the guide house.
  tutorial-island.miki says:
    always
    sticky
    Still those rats, {player.name}? Downstairs, in the basement.
  tutorial-island.miki says:
    when: tutorial-island.rats-killed >= 3
    Ha! Barely a scratch on you. You're a natural.
    Truth be told, there's little left I can teach you.
    So here's the last of it: get off this island. There's a boat to the mainland, and a whole world of skills waiting past it.
    set: tutorial-island.front-door.unlocked
    Go on. Make some trouble worth telling stories about.
    goto sendoff

stage sendoff:
  log: You have the measure of the place. There is a boat to the mainland.
  complete
  tutorial-island.miki says:
    always
    sticky
    Still here? The boat to the mainland won't wait forever.

stage snubbed:
  log: You turned Miki down, and found your own way.
  complete
  tutorial-island.miki says:
    always
    sticky
    Hmph. Suit yourself. Don't come crying when a door won't open.

// --- tests ---

# test quest-offered
talk: tutorial-island.miki
choose: 0
assert: finding-your-feet.name-yourself

// Opens on a save so the route is walked with the pools a played game has.
# test miki-route-full
load: miki-route-start
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=elf
assert: tutorial-island.mirror-done
talk: tutorial-island.miki
assert: finding-your-feet.bake-bread
assert: has tutorial-island.jug-of-water
craft: dough
assert: has tutorial-island.dough
craft: bread
assert: has tutorial-island.bread
talk: tutorial-island.miki
assert: finding-your-feet.clear-the-rats
// A fight is bounded by its location, so the rats are fought where they stand
// rather than through the floor. A rat takes a few swings to put down, so each
// `use:` starts the fight and the `wait:` lets it play out — 30s is far longer
// than the ~6s it actually needs.
use: entity.stairs.descend
use: melee-combat on giant-rat
wait: 30
use: melee-combat on giant-rat
wait: 30
use: melee-combat on giant-rat
wait: 30
assert: tutorial-island.rats-killed >= 3
use: entity.stairs-up.ascend
talk: tutorial-island.miki
assert: finding-your-feet.sendoff
assert: tutorial-island.front-door.unlocked
travel: beach
// The whole sheet, not a handful of flags: inventory, visits, xp, pools, the
// clock and the rng cursor all have to land where they landed. Regenerate with
// /create-valid-test when the route's content changes on purpose.
expect: miki-route-end

// --- saves ---

# save miki-route-start
{"version":11}

# save miki-route-end
{"version":11,"inventory":{"tutorial-island.jug-of-water":0,"tutorial-island.pot-of-flour":0,"tutorial-island.dough":0,"tutorial-island.bread":1,"tutorial-island.iron-sword":1,"tutorial-island.wooden-shield":1,"tutorial-island.rat-bone":7},"flags":{"tutorial-island.guide-house.discovered":true,"tutorial-island.guide-house-upstairs.discovered":true,"tutorial-island.basement.discovered":true,"tutorial-quests.finding-your-feet.offered":true,"tutorial-quests.finding-your-feet.name-yourself":true,"tutorial-island.mirror-done":true,"tutorial-quests.finding-your-feet.bake-bread":true,"tutorial-quests.finding-your-feet.clear-the-rats":true,"tutorial-island.rats-killed":3,"tutorial-island.front-door.unlocked":true,"tutorial-island.beach.discovered":true,"tutorial-quests.finding-your-feet.sendoff":true},"visits":{"tutorial-quests.finding-your-feet.offered.miki.0.said":1,"tutorial-quests.finding-your-feet.name-yourself.miki.1.said":1,"tutorial-quests.finding-your-feet.bake-bread.miki.1.said":1,"tutorial-quests.finding-your-feet.clear-the-rats.miki.1.said":1},"xp":{"tutorial-island.cooking":6,"tutorial-island.melee":16},"resources":{"tutorial-island.health":21000},"location":"tutorial-island.beach","populations":{"tutorial-island.basement":{"tutorial-island.giant-rat":{"down":3,"due":[]}}},"time":107200,"rng":2776008081,"player":{"name":"Rowan","race":"elf"}}
