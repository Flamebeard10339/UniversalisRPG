# info
id: tutorial-island-combat
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island
dependencies: tutorial-island-mining

# item bones
title: Bones
examine: A dusty set of bones.

# location tutorial-rat-cage
x: 5, y: 0, z: -1
title: Combat Cage
examine: A rat cage, a portal, and a broad-shouldered instructor wait underground.
exhausted: The cage is still.
tags: tutorial cave

## entity orloth
talk: [[dialogue orloth]]
fight:
  hidden if: tutorial.combat-cleared
  resource: health -4
  xp: attack 60
  xp: defense 30
  set: tutorial.combat-cleared
  set: tutorial.cage-locked-by-orloth
  say: Orloth laughs, trains you hard, and locks the empty cage behind him. Your health does not thank you for it.

## entity giant-rat
title: Giant Rat
fight:
  hidden if: tutorial.cage-locked-by-orloth
  enemy: melee-combat, attack 1, defense 1, health 5, rate 20
  xp: attack 20
  xp: defense 10
  max: 3
  on success:
    set: tutorial.combat-cleared
  droptable:
    bones (1)
    dependent droptable (3):
      1 tin-ore (4)
      3-5 copper-ore (3)

## entity rat-cage-door
title: Rat Cage Door
unlock orloth:
  requires: lockpick
  visible if: tutorial.cage-locked-by-orloth
  say: The cage is empty except for Orloth, arms crossed, unimpressed with your priorities.
unlock:
  requires: lockpick
  visible if: tutorial.combat-cleared & !tutorial.cage-locked-by-orloth
  say: The cage is empty. The rats already had their say.

## entity portal
title: Mainland Portal
step through:
  visible if: tutorial.combat-cleared
  set: tutorial.reached-mainland
  set spawn: mainland-arrival
  relocate: mainland-arrival

# location mainland-arrival
x: 20, y: 0
title: Mainland Pier
examine: Open roads begin beyond a salt-stained pier.
exhausted: The pier creaks gently.
tags: mainland

## entity mainland-greeter
title: Dock Greeter
talk: [[dialogue mainland-greeter]]

# dialogue orloth
start (orloth): So, you want to learn to fight. Good instinct, bad cage — those rats won't teach you finesse, but they'll teach you not to die. Questions before you go in?
  -> What do I actually equip? [[explain-equip]]
  -> How do I know if I'm winning? [[explain-stats]]
  -> No, I'm ready. [[close]]

[[explain-equip]] (orloth): Equipment tab, mainhand slot — any blade you've got will do for the cage.
  -> How do I know if I'm winning? [[explain-stats]]
  -> Got it. [[close]]

[[explain-stats]] (orloth): Attack wears the rats down, defense keeps you standing. Stats tab breaks down exactly how much of each you've got, if you want the numbers instead of a feeling.
  -> Got it. [[close]]

[[close]] (orloth): And don't try me directly. I'm not a rat.

# dialogue mainland-greeter
start: Thanks for playing Tutorial Island. Go make trouble somewhere larger.
