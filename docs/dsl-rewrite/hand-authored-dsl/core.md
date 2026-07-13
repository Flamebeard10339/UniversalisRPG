# info
id: core
version: 1.0.0
universe: base
author: UniversalisRPG
game-version: 0.1.0
pack: 
dependencies: 

# display-profile first-road
title: First Road
colors:
  background: #151733
  surface: #282541
  surfaceRaised: #45455f
  panel: #18182b
  border: #4b5f43
  text: #edf7e8
  textMuted: #c9d8c0
  textSubtle: #99aa8f
  accent: #67d8c7
  accentStrong: #a7f3d0
  accentText: #0d2a24
  danger: #fb7185
  dangerSurface: #4c1d17
  dangerText: #ffe4e6
  success: #7dd3a8
  warning: #f6c177

# variables
death-count=0

# stat action-rate
base: 25
# stat movement-speed
base: 60
# stat health
base: 10
# stat attack
# stat defense
# stat regeneration
# stat mining
# stat smithing
# stat fishing
# stat cooking
# stat thieving

# skill health
stat-id: health
# skill attack
stat-id: attack
# skill defense
stat-id: defense
# skill regeneration
stat-id: regeneration
# skill mining
# skill smithing
# skill fishing
# skill cooking
# skill thieving

# item gold
examine: Small bright coins.
currency

# item small-net
examine: A net suited to shallow shoals.
net

# item raw-shrimp
examine: Fresh and not yet dinner.
raw

# item cooked-shrimp
examine: A simple meal that keeps you going.
food, +3 regeneration, 60s

# item copper-ore
examine: A soft reddish ore.
ore

# item tin-ore
examine: A pale chunk of tin-bearing stone.
ore

# item bronze-bar
examine: A block of bronze.
bar

# item bronze-dagger
examine: A sharp bronze blade.
requires: 1 attack
mainhand, +2 attack

# item iron-dagger
examine: A sharp blade.
requires: 1 attack
mainhand, +3 attack

# interaction lockpicking
title: Lockpicking
source stat: thieving
target stat: thieving
targets player health: false
experience:
  gain amt experience in thieving when damage-dealt

# interaction melee-combat
title: Melee Combat
source stat: attack
target stat: defense
target player health: true
experience:
  gain 1 experience in attack when action completes
  gain 10 experience in defense when incoming attack missed
  gain damage*3 experience in attack when damage dealt
  gain damage+1 experience in health when damage taken
on player hit: say: You hit the {enemy.title}.
on player miss: say: You missed the {enemy.title}.
on player kill: say: You killed the {enemy.title}.
on entity hit: say: The {enemy.title} hit you.
on entity miss: say: The {enemy.title} missed you.
on entity kill: say: The {enemy.title} killed you.

# resource player-health
title: HP
source-stat: health
initial: full
on-empty:
  trigger: respawn
  say: You died.
effects:
  health-regeneration

# effect health-regeneration
title: Player Health Regeneration
source-stat: regeneration
units: per-minute
active-when: active-interaction
experience: 
  gain health regenerated*4 experience in regeneration when health-regenerated

# reset-state respawn
location-id: starting-location
change:
  death-count += 1
preserve:
  inventory, skill-xp, collection-log, discovered-locations

# resource action-rate
title: Action Rate
max: 60
initial: empty
display: minimal
reset-when-inactive: true
on-full:
  complete-action
  refill, min
effects:
  action-rate-regeneration

# effect action-rate-regeneration
title: Actions per second
source-stat: action-rate
units: per-second
active-when: active-interaction==true

# resource enemy-action-rate
title: {enemy.title} attack bar
max: 60
initial: empty
display: minimal
reset-when-inactive: true
on-full:
  enemy-attack
  refill, min
effects:
  enemy-action-rate-regeneration

# effect enemy-action-rate-regeneration
title: {enemy.title} attacks per second
source-stat: enemy.action-rate
units: per-second
active-when: active-interaction and combat-interaction

# resource enemy-health
title: {enemy.title} health
source-stat: enemy.health
initial: full
hidden: false
effects:
  enemy-regeneration

# effect enemy-regeneration
title: {enemy.title} regeneration
source-stat: enemy.regeneration
active-when: active-interaction and combat-interaction
