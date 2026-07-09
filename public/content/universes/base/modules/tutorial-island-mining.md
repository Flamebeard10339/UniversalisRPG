# info
id: tutorial-island-mining
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island
dependencies: tutorial-island-bank

# item bronze-dagger
title: Bronze Dagger
description: A short bronze blade suited to quick strikes.
tags: mainhand (1 attack), +1 attack

# item bronze-pickaxe
title: Bronze Pickaxe
description: A simple pickaxe suitable for ore veins.
tags: pickaxe, mainhand (1 attack 1 mining), +8 mining, +3 attack, +5% health

# location tutorial-mine
x: 3, y: 0, z: -1
title: Training Mine
description: Copper and tin glint in a cramped cave.
exhausted: Dust hangs in the lamplight.
tutorial cave

## entity denzel
talk:
  give: bronze-pickaxe 1
  once
  [[dialogue denzel]]
examine: Denzel keeps glancing at the chest, then pretending he did not.

## entity copper-rock
title: Copper Rock
mine:
  requires: tag:pickaxe
  xp: mining 5
  give: copper-ore 1

## entity tin-rock
title: Tin Rock
mine:
  requires: tag:pickaxe
  xp: mining 5
  give: tin-ore 1

## entity locked-chest
title: Locked Chest
pick:
  requires: lockpick
  chance: 50
  xp: thieving 25
  give: copper-ore 2
  give: tin-ore 2
  give: iron-dagger 1
  set: tutorial.mining-cleared
  say: The lock gives all at once, spilling ore, bars, and a dagger better than anything at the anvil.
  on fail:
    resource: health -3
    say: The lock bites back. That was going to leave a mark either way.
examine: A prison-issue padlock, guarding something better than rocks.

## entity mine-tunnel
title: Mine Tunnel
examine: A ladder climbs toward the bank on one side; the tunnel keeps going deeper on the other.
ascend:
  say: You climb up to the bank.
  relocate: tutorial-bank
enter forge: relocate: tutorial-forge

# location tutorial-forge
x: 4, y: 0, z: -1
title: Cave Forge
description: A furnace and anvil are wedged into a hot alcove.
exhausted: The forge pops and cools.
tutorial cave

## entity furnace
smelt: station: tutorial-furnace

## entity anvil
smith: station: tutorial-anvil

## entity forge-table
title: Forge Table
return mine: relocate: tutorial-mine
continue:
  say: You reach the combat cage.
  relocate: tutorial-rat-cage

# dialogue denzel
start (denzel): Pickaxe's yours, don't lose it. Rocks are through there. Anything else before you start swinging?
  -> What am I actually making? [[explain-smithing]]
  -> Why are you down here, anyway? [[explain-sentence]]
  -> Nothing, I'm good. [[close]]

[[explain-smithing]] (denzel): Copper plus tin makes bronze. Furnace first, anvil second — smelt it, then shape it. Simple, if you don't rush the furnace.
  -> Why are you down here, anyway? [[explain-sentence]]
  -> Makes sense. [[close]]

[[explain-sentence]] (denzel): Let's just say this posting is part of my... sentence. I'd be out of here already if I hadn't drawn it. And don't touch the chest — that's not a hint, that's a rule.
  -> Makes sense. [[close]]

[[close]] (denzel): Go on, then. Rocks won't mine themselves.

# recipe smelt-bronze
station: tutorial-furnace
in: copper-ore
in: tin-ore
out: bronze-bar
skill: smithing 8

# recipe smith-dagger
station: tutorial-anvil
in: bronze-bar
out: bronze-dagger
skill: smithing 10
on success:
  set: tutorial.mining-cleared
