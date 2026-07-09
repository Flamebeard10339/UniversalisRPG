# info
id: tutorial-island-mining-proof
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island
dependencies: tutorial-island-mining-proof-stub

# item copper-ore

# item tin-ore

# item bronze-bar

# item bronze-dagger

# location tutorial-mine
x: 3, y: 0
tags: tutorial cave

## entity locked-chest
examine: A prison-issue padlock, guarding something better than rocks.
pick:
  requires: lockpick
  chance: 50
  xp: thieving 25
  give: copper-ore 2
  give: tin-ore 2
  give: iron-dagger 1
  set: mining-cleared
  say: The lock gives all at once, spilling ore, bars, and a dagger better than anything at the anvil.
  on fail:
    resource: health -3
    say: The lock bites back. That was going to leave a mark either way.

## entity furnace
smelt: station: tutorial-furnace

## entity anvil
smith: station: tutorial-anvil

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
  set: mining-cleared
