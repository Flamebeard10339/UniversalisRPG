// Tutorial Island — Miki route (Path 1), end to end.
// Guide house (ground floor, upstairs, basement) + the beach beyond the front door.
// Paths 2/3 (thieving, fishing) are only stubbed where Path 1 shares their props
// (front door, dresser, lockpick) so the world stays internally consistent.

// --- stats ---

# stat attack
base: 10

# stat defense
base: 5

# stat regeneration

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

# item iron-sword
examine: A well-balanced blade, standard adventurer's kit.
weapon, mainhand, +2 attack

# item wooden-shield
examine: A sturdy shield of banded oak.
shield, offhand, +2 defense

# item lockpick
examine: A bent sliver of metal, worn smooth from use.
thieving-tool

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
  miki, front-door, stairs, mirror

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
  giant-rats, stairs-up

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
  hidden if: tutorial.mirror-done
  open modal: character-creation
  set: tutorial.mirror-done

# entity stairs
title: Stairs
ascend: relocate: guide-house-upstairs, say: You climb to the second floor.
descend: relocate: basement, say: You head down into the basement.

# entity stairs-down
title: Stairs
descend: relocate: guide-house, say: You head back down to the ground floor.

# entity stairs-up
title: Stairs
ascend: relocate: guide-house, say: You climb back up to the ground floor.

# entity dresser
examine: A dusty dresser, one drawer left slightly ajar.
search drawer:
  once
  give: lockpick
  say: Tucked beneath old linens, a set of worn lockpicks.

# entity giant-rats
title: Giant Rats
examine: Three hunched rats claw at overturned crates, eyes red in the dark.
fight:
  hidden if: tutorial.killed-rats
  once
  xp: melee 5
  on success:
    set: tutorial.killed-rats
    say: You put down the last of the rats, breathing hard.

// --- dialogue ---

# dialogue miki
owner = miki

node greeting:
  when: not tutorial.quest-given
  Greetings, adventurer! Welcome to UniversalisRPG.
  The name's Miki, your tutorial guide, here to walk you through your first steps.
  What do you say I show you the ropes?
  -> Sounds good. Teach me.
  -> I'd rather find my own way.
    set: tutorial.snubbed-miki
    goto snub
  Splendid! We start with what gives an adventurer purpose: quests.
  Your first task: find the mirror in this house and decide who you are, your name and your people.
  set: tutorial.quest-given

node remind-mirror:
  when: tutorial.quest-given
  sticky
  again: The mirror's still waiting. Name yourself first, then we'll talk.
  The mirror's still waiting. Name yourself first, then we'll talk.

node buffs:
  when: tutorial.mirror-done
  once
  again: The oven's waiting, {player.name} - a jug of water and a pot of flour make dough.
  There you are, {player.name}. A fine name.
  Some foods grant a temporary edge. Let me show you baking sometime - for now, eat something and watch your stats.
  xp: cooking 3
  set: tutorial.made-bread
  Give it a go. I'll wait.

node skills:
  when: tutorial.made-bread
  once
  again: Still those rats, {player.name}? Downstairs, in the basement.
  That warm feeling? A buff. It fades, so spend it well.
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
  when: tutorial.killed-rats
  once
  again: Still here? The boat to the mainland won't wait forever.
  Ha! Barely a scratch on you. You're a natural.
  Truth be told, there's little left I can teach you.
  So here's the last of it: get off this island. There's a boat to the mainland, and a whole world of skills waiting past it.
  set: tutorial.miki-complete
  set: front-door.unlocked
  Go on. Make some trouble worth telling stories about.

node snub:
  Hmph. Suit yourself. Don't come crying when a door won't open.

// --- tests ---

# test tutorial-quest-given
talk: miki
choose: Sounds good. Teach me.
expect: tutorial.quest-given

# test miki-route-full
run: tutorial-quest-given
use: entity.mirror.look in
expect: tutorial.mirror-done
talk: miki
expect: tutorial.made-bread
use: entity.giant-rats.fight
expect: tutorial.killed-rats
talk: miki
expect: tutorial.miki-complete
expect: front-door.unlocked
travel: beach
