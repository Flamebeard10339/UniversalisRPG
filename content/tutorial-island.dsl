// Tutorial Island — Miki route (Path 1), end to end.
// Guide house (ground floor, upstairs, basement) + the beach beyond the front door.
// Paths 2/3 (thieving, fishing) are only stubbed where Path 1 shares their props
// (front door, dresser, lockpick) so the world stays internally consistent.

# info tutorial-island
version: 1.0.0

// --- variables ---

// Seconds of real-time travel per unit of straight-line distance between
// locations; the beach sits one unit east of the guide house's front door.
# variable travel-seconds-per-unit
value: 5

// What a duration action takes when it names no cadence of its own. At 0 an
// untagged action is over the instant it is used; raising it makes every action
// that has not declared itself `instant` a span the world moves through.
# variable default-action-duration
value: 0

// --- stats ---

// The player's sheet. An entity that fights names its own values for these in a
// `stats:` block; anything it doesn't name falls through to the base here, which
// is how the player — who has no `# entity` of their own — works at all.
# stat attack
base: 10

// Flat damage reduction, subtracted from each incoming hit. Named `defense`
// because that is what a player calls it; an action points at it with `dr:`.
# stat defense
base: 5

// The two sides of the opposed roll. A gap of 100 is worth about a 91% chance
// (see `contest-spread`), so the player at 100 against a rat's 40 lands ~80%.
# stat accuracy
base: 100

# stat evasion

// Attacks per minute, which is what `rate:` on an action reads directly:
// 25/min is one swing every 2.4s.
# stat attack-rate
base: 25

# stat regeneration

# stat max-health
base: 30

// Chestnuts per minute: 15/min is one every 4 seconds.
# stat cooking-rate
base: 15

// --- resources ---

// Health falls to the rats' bites and recovers from the regeneration a meal
// grants. Rates are per minute.
# resource health
rate: regeneration
max: max-health
display: full
// `stop` is what makes running out of health end whatever you were doing —
// the engine has no privileged pool, so this block is where health becomes the
// fatal one. Anything else that should happen on blacking out (dropping what
// you carried, waking up elsewhere) belongs here beside it.
on empty:
  say: You slump to the floor, spent. (You should have eaten something.)
  set: fainted
  stop

// --- flags ---

// Quest and world state the module owns. An entity or location declares the
// flags that are its own; these belong to no one prop.
# flag fainted

# flag mirror-done

# flag made-bread

# flag rats-killed

# flag quest-given

# flag snubbed-miki

# flag miki-complete

// --- skills ---

# skill thieving
stat-id: attack

# skill melee
stat-id: attack

# skill cooking

// --- items ---

# item cooked-shrimp
examine: A simple meal.
food, +3 regeneration, 60s
eat:
  instant
  take: 1 cooked-shrimp
  say: You eat the shrimp. Simple, warm, and better than it looks.

# item iron-sword
examine: A well-balanced blade, standard adventurer's kit.
slot: mainhand
weapon, +2 attack

# item wooden-shield
examine: A sturdy shield of banded oak.
slot: offhand
shield, +2 defense

# item lockpick
examine: A bent sliver of metal, worn smooth from use.
thieving-tool

# item jug-of-water
examine: A clay jug of clean water.

# item pot-of-flour
examine: A small pot of milled flour.

# item dough
examine: A ball of raw dough, ready for the oven.

# item bread
examine: A warm, golden loaf.
food, +5 regeneration, 90s
eat:
  instant
  take: 1 bread
  say: You tear into the warm loaf - simple, filling, and worth the trouble.

# item roasted-chestnut
examine: A chestnut roasted soft and sweet in the oven's embers.

// --- locations ---

# location guide-house
x: 0, y: 0
starting
examine: A cluttered but cozy cottage. Miki's guide house.
adjacent:
  guide-house-upstairs
  basement
  beach while front-door.unlocked
entities:
  miki, front-door, stairs, mirror, oven

# location guide-house-upstairs
x: 0, y: 0, z: 1
examine: A narrow landing with a dresser and a view of the coast.
adjacent:
  guide-house
entities:
  dresser, stairs-down

# location basement
x: 0, y: 0, z: -1
examine: A damp cellar, crates stacked against the walls.
adjacent:
  guide-house
entities:
  giant-rat, stairs-up

# location beach
east of guide-house
examine: Pale sand and the sound of the tide. The mainland waits past the water.
adjacent:
  guide-house

// --- entities ---

# entity miki
examine: A weathered man in patched leather, quick to smile.

# entity front-door
examine: A heavy wooden door, bound in iron.
flags: unlocked
pick lock:
  requires: has lockpick
  hidden if: unlocked
  once, 4s
  xp: thieving 4
  on success:
    set: unlocked
    say: The lock clicks open.

# entity mirror
examine: A tall mirror in a gilt frame. Your reflection waits, nameless.
look in:
  instant
  hidden if: mirror-done
  open modal: character-creation
  set: mirror-done

# entity oven
examine: A stone oven, its coals still glowing.
stations: oven
roast chestnuts:
  continuous
  rate: cooking-rate
  give: 1 roasted-chestnut
  on success:
    say: Another chestnut pops from the embers, roasted through.

# entity stairs
title: Stairs
ascend:
  instant
  relocate: guide-house-upstairs
  say: You climb to the second floor.
descend:
  instant
  relocate: basement
  say: You head down into the basement.

# entity stairs-down
title: Stairs
descend:
  instant
  relocate: guide-house
  say: You head back down to the ground floor.

# entity stairs-up
title: Stairs
ascend:
  instant
  relocate: guide-house
  say: You climb back up to the ground floor.

# entity dresser
examine: A dusty dresser, one drawer left slightly ajar.
search drawer:
  once
  give: lockpick
  say: Tucked beneath old linens, a set of worn lockpicks.

// A real fight, and the shape every combattable thing in the game shares: its
// own stat sheet, a swing of its own on its own clock, and a pool that runs out.
// The two actions are the same action seen from either end — `rate`, `ability`
// and `accuracy` read whoever is swinging, `target`, `dr` and `evasion` whoever
// is being hit — so `fight` and `bite` differ only in who runs them.
//
// 20 health against the player's 10 a hit is two hits, ~2.5 swings at 80%, so a
// rat falls in about six seconds and lands a bite or two on the way out.
# entity giant-rat
title: Giant Rat
examine: A hunched rat claws at an overturned crate, eyes red in the dark.
stats: attack 8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
fight:
  hidden if: rats-killed >= 3
  rate: attack-rate
  accuracy: accuracy
  evasion: evasion
  ability: attack
  dr: defense
  target: health
  xp: melee 5
  on success:
    add: rats-killed 1
    say: You put down another rat.
bite:
  retaliates
  rate: attack-rate
  accuracy: accuracy
  evasion: evasion
  ability: attack
  dr: defense
  target: health

// --- recipes ---

# recipe dough
in: jug-of-water, pot-of-flour
out: dough
skill: cooking 2
time: 2
say: You knead water and flour into a ball of dough.

# recipe bread
station: oven
in: dough
out: bread
skill: cooking 4
time: 3
say: The oven bakes your dough into a golden loaf.

// --- dialogue ---

# dialogue miki
owner = miki

node greeting:
  when: not quest-given
  Greetings, adventurer! Welcome to UniversalisRPG.
  The name's Miki, your tutorial guide, here to walk you through your first steps.
  What do you say I show you the ropes?
  -> Sounds good. Teach me.
  -> I'd rather find my own way.
    set: snubbed-miki
    goto snub
  Splendid! We start with what gives an adventurer purpose: quests.
  Your first task: find the mirror in this house and decide who you are, your name and your people.
  set: quest-given

node remind-mirror:
  when: quest-given
  sticky
  again: The mirror's still waiting. Name yourself first, then we'll talk.
  The mirror's still waiting. Name yourself first, then we'll talk.

node buffs:
  when: mirror-done
  once
  again: Knead that dough and get it in the oven, {player.name} - water and flour won't bake themselves.
  There you are, {player.name}. A fine name.
  give: jug-of-water
  give: pot-of-flour
  Water and flour make dough - knead them together, then bake the dough in the oven.
  Give it a go. I'll wait.

node baked:
  when: mirror-done and has bread and not made-bread
  once
  A warm loaf! Well done, {player.name}.
  Keep it in your pack - eat it whenever you're hungry.
  set: made-bread

node skills:
  when: made-bread
  once
  again: Still those rats, {player.name}? Downstairs, in the basement.
  Every swing and catch builds a skill, and skills raise your stats.
  Here, gear changes your stats the moment you equip it.
  give: iron-sword
  give: wooden-shield
  Downstairs in the basement you'll find giant rats. Put them down and watch your stats work.

node skills-annoyed:
  when: skills.visits >= 5
  sticky
  Are you deaf, {player.name}? Rats. Basement. Now.

node sendoff:
  when: rats-killed >= 3
  once
  again: Still here? The boat to the mainland won't wait forever.
  Ha! Barely a scratch on you. You're a natural.
  Truth be told, there's little left I can teach you.
  So here's the last of it: get off this island. There's a boat to the mainland, and a whole world of skills waiting past it.
  set: miki-complete
  set: front-door.unlocked
  Go on. Make some trouble worth telling stories about.

node snub:
  Hmph. Suit yourself. Don't come crying when a door won't open.

// --- tests ---

# test tutorial-quest-given
talk: miki
choose: Sounds good. Teach me.
assert: quest-given

# test miki-route-full
travel: guide-house
run: tutorial-quest-given
use: entity.mirror.look in
assert: mirror-done
talk: miki
assert: has jug-of-water
craft: dough
assert: has dough
craft: bread
assert: has bread
talk: miki
assert: made-bread
// A rat takes a few swings to put down, so each `use:` starts the fight and the
// `wait:` lets it play out — 30s is far longer than the ~6s it actually needs.
use: entity.giant-rat.fight
wait: 30
use: entity.giant-rat.fight
wait: 30
use: entity.giant-rat.fight
wait: 30
assert: rats-killed >= 3
talk: miki
assert: miki-complete
assert: front-door.unlocked
travel: beach
// The whole sheet, not a handful of flags: inventory, visits, xp, pools, the
// clock and the rng cursor all have to land where they landed. Regenerate with
// /create-valid-test when the route's content changes on purpose.
expect: miki-route-end

// --- saves ---

# save miki-route-end
{"version":6,"inventory":{"tutorial-island.jug-of-water":0,"tutorial-island.pot-of-flour":0,"tutorial-island.dough":0,"tutorial-island.bread":1},"flags":{"tutorial-island.quest-given":true,"tutorial-island.mirror-done":true,"tutorial-island.made-bread":true,"tutorial-island.rats-killed":3,"tutorial-island.miki-complete":true,"tutorial-island.front-door.unlocked":true},"visits":{"tutorial-island.miki.greeting":1,"tutorial-island.miki.buffs":1,"tutorial-island.miki.baked":1,"tutorial-island.miki.sendoff":1},"xp":{"tutorial-island.cooking":6,"tutorial-island.melee":15},"resources":{"tutorial-island.health":0},"location":"tutorial-island.beach","time":107200,"rng":1288631604,"pendingModal":"character-creation"}

# save explored-and-unlocked
{"version":6,"flags":{"tutorial-island.front-door.unlocked":true,"tutorial-island.beach.discovered":true}}

# test save-restores-object-owned-flags
load: explored-and-unlocked
assert: front-door.unlocked
assert: beach.discovered
