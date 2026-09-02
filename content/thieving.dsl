# info thieving
version: 1.1.0
pack: skills
dependencies:
  core
  combat
  ? tulsa

# stat thieving-ability
title: Thieving
base: 0
group: core.skilling

# stat thieving-rate
title: Thieving Speed
base: 15
group: core.skilling

# stat daze-duration
title: Daze Duration
base: 4
group: core.skilling

# stat luck
base: 0
group: skilling

# stat npc-thieving-difficulty
group: core.other

# stat npc-thieving-xp
group: core.other

# stat npc-thieving-damage
group: core.other

# skill thieving
title: Thieving
stat: thieving-ability

# item dazed
title: Dazed
examine: Dizzy...
-100% thieving-rate

# action steal
attempts: 1
accuracy: my thieving-ability vs their npc-thieving-difficulty
on success:
  xp: thieving their npc-thieving-xp
on unfinished:
  drain: their npc-thieving-damage core.health

# action pick-pocket
title: Pick a Pocket
extends: steal
continuous
rate: my thieving-rate
+on success:
  say: You come away with it and they walk on none the wiser.
+on unfinished:
  inflict: dazed for daze-duration

# action pick-the-lock
title: Pick the Lock
extends: steal
continuous
time: 6

# item steel-lockpicks
title: Steel Lockpicks
examine: A well oiled set of steel lockpicks.
slot: mainhand
requires: level.thieving >= 10
value: 180
item-level: 8-14
tools, +8 thieving-ability

# item fingerless-gloves
title: Fingerless Gloves
examine: A set of leather fingerless gloves.  
slot: gloves
value: 45
item-level: 3-6
tools, +4 thieving-ability

# item soft-toed-boots
title: Soft-Toed Boots
examine: A soft pair of felt lined, soft leather boots. 
slot: boots
value: 60
item-level: 3-6
tools, +4 thieving-ability

# passive flat-thieving-small
title: Light Fingers
tools, +2 thieving-ability

# passive flat-thieving-large
title: Nimble Fingers
tools, +4 thieving-ability

# passive flat-thieving-rate-small
title: Quick Fingers
tools, +1 thieving-rate

# passive flat-thieving-rate-large
title: Planned Action
tools, +2 thieving-rate

# passive increased-thieving-small
title: Rogue's Sense
tools, +12% thieving-ability

# passive thieving-flat-health-1
title: Thick Skin
tools, +12 core.max-health

# passive thieving-regeneration-1
title: Steady Nerve
tools, recovery, +1 core.regeneration

# passive reduced-daze-duration-1
title: Brazen
tools, -10% daze-duration

# passive reduced-daze-duration-2
title: Tough
tools, -25% daze-duration

# passive luck-1
title: Good Eye
tools, +3-8 luck

# passive luck-2
title: Practised Fence
tools, +8-15 luck

# item thieving-ability-jewel
title: Quiet Hour
value: 250
cluster-jewel: 
  shape: ring
  open-connections: e
  passives: 1 flat-thieving-small, 2 flat-thieving-rate-small, 3 flat-thieving-large, 4 flat-thieving-small, 5 flat-thieving-rate-small, 6 flat-thieving-large

# item thieving-rate-jewel
title: Light Touch
value: 500
cluster-jewel: 
  shape: ring
  open-connections: e
  passives: 1 flat-thieving-small, 2 flat-thieving-rate-large, 3 flat-thieving-large, 4 increased-thieving-small, 5 flat-thieving-rate-large, 6 flat-thieving-small

# item thieving-utility-jewel
title: Cold Nerve
value: 350
cluster-jewel: 
  shape: wheel
  open-connections: e, nw
  passives: 1 thieving-flat-health-1, 2 reduced-daze-duration-1, 3 thieving-regeneration-1, 4 reduced-daze-duration-2, 5 thieving-flat-health-1, 6 thieving-regeneration-1, 7 flat-thieving-large

# item luck-jewel
title: Fence's Eye
value: 1500
cluster-jewel: 
  shape: spindle
  open-connections: e
  passives: 1 luck-1, 2 luck-2

# item polished-buttons
title: Polished Buttons
examine: A few musty old buttons. 
value: 1

# item gold-ring
title: Gold Ring
examine: A thin gold ring. It has a few scratches on it. 
value: 5

# item gold-necklace
title: Gold Necklace
examine: A nice looking gold necklace with a delicate chain. 
value: 15

# item coloured-glass
title: Coloured Glass
examine: Colored glass. What? Were you expecting something else?
value: 1

# item topaz
title: Topaz
examine: A gold-brown, translucent gemstone.
value: 25

# item sapphire
title: Sapphire
examine: A blue, translucent gemstone.
value: 50

# item ruby
title: Ruby
examine: A red, translucent gemstone.
value: 150

# entity tulsa.player
+skills: thieving

# entity tulsa.civilian
+stats: npc-thieving-difficulty 20, npc-thieving-xp 4, npc-thieving-damage 1
+uses: pick-pocket
pick-pocket:
  one of:
    100x: give: 3 core.coin
    8x: roll: townsmans-wardrobe
    1x: give: 1 thieving-rate-jewel
  +on unfinished:
    say: Your hand is on the purse and then their hand is on your wrist, and they are not gentle about it.

# droptable townsmans-wardrobe
one of:
  1x: give: 1 core.unassuming-cap
  1x: give: 1 core.linen-shirt
  1x: give: 1 core.linen-pants
  1x: give: 1 core.simple-boots

# entity tulsa.guardsman
+stats: npc-thieving-difficulty 55, npc-thieving-xp 7, npc-thieving-damage 1
+uses: pick-pocket
pick-pocket:
  give: 7 core.coin
  +on unfinished:
    say: He turns into you rather than away, and the pommel of his sword arrives before you have finished deciding what to do, and then he has a fistful of your collar.

# entity tulsa.knight
+stats: npc-thieving-difficulty 80, npc-thieving-xp 10, npc-thieving-damage 1
+uses: pick-pocket
pick-pocket:
  hidden if: level.thieving < 11
  give: 12 core.coin
  +on unfinished:
    say: There is a great deal of iron in the way and then a great deal of iron coming the other way, and he holds you at arm's length while he decides whether you are worth the walk to the gate.

# entity thief
title: Thief
examine: A casual cloaked figure idly rolling a blade between their gloved hands. 
stats: attack 20, defense 6, max-health 85, attack-rate 26, accuracy 95, evasion 60, npc-thieving-difficulty 100, npc-thieving-xp 17, npc-thieving-damage 1
uses: core.melee-combat, pick-pocket
faction: core.world
respawn after: 80s
on death:
  credit:
    roll: combat.purse
    1 in 14: give: 1 steel-lockpicks
pick-pocket:
  hidden if: level.thieving < 11
  one of:
    100x: give: 18 core.coin
    2x: give: 1 fingerless-gloves
    1x:
      give: 1 luck-jewel
      say: The loupe was in the same pocket as the coin, and they will miss it a great deal more.
  +on unfinished:
    say: They let you get all the way to it before their hand closes on your wrist, which is how you know they were watching the whole time. Nobody raises their voice. Nobody lets go either.

# entity house-chest
title: Chest
examine: A banded chest under the window with a lock on it older than the window.
stats: npc-thieving-difficulty 60, npc-thieving-xp 20, npc-thieving-damage 3
uses: pick-the-lock
pick-the-lock:
  roll: house-chest-contents
  say: The lock gives with a sound like a knuckle cracking.
  +on unfinished:
    say: The wards catch, and somebody behind you says that is not your chest, and you are on the step before you have finished agreeing.
    relocate: tulsa.market-square

# droptable house-chest-contents
one of:
  6x: give: 1 polished-buttons
  3x: give: 1 gold-ring
  1x: give: 1 gold-necklace

# entity treasure-chest
title: Treasure Chest
examine: Iron under the wood, and somebody has cut runes into the band that are not decoration.
stats: npc-thieving-difficulty 110, npc-thieving-xp 55, npc-thieving-damage 8
uses: pick-the-lock
pick-the-lock:
  time: 10
  roll: treasure-chest-contents
  say: The last ward turns over and the lid comes up on its own.
  +on unfinished:
    say: The runes light one after another and the cellar goes out from under you.
    relocate: tulsa.market-square

# droptable treasure-chest-contents
one of:
  8x: give: 1 coloured-glass
  5x: give: 1 topaz
  3x: give: 1 sapphire
  1x: give: 1 ruby

# entity strongbox
title: Strongbox
examine: Banded twice over and set into the floor, and the lock is the newest thing in the room by thirty years.
stats: npc-thieving-difficulty 132, npc-thieving-xp 90, npc-thieving-damage 2
uses: pick-the-lock
pick-the-lock:
  hidden if: level.thieving < 14
  time: 14
  roll: strongbox-contents
  say: The last ward goes over under your thumb and the lid lifts on a hinge somebody has kept oiled.
  +on unfinished:
    say: A pick shears off in the third ward and somebody behind you says that one is theirs, in the tone of a person who is not going to say it twice.
    inflict: dazed for daze-duration

# droptable strongbox-contents
one of:
  9x: give: 1 sapphire
  6x: give: 1 ruby
  4x: give: 1 soft-toed-boots
  2x: give: 1 fingerless-gloves
  1x: give: 1 thieving-ability-jewel
  1x: give: 1 thieving-utility-jewel

# location tulsa.oolga-house
+entities: house-chest

# location tulsa.nans-house
+entities: house-chest

# location tulsa.hasks-house
+entities: house-chest

# location tulsa.bels-house
+entities: house-chest

# location tulsa.castle-quarters
+entities: 2 house-chest

# location tulsa.castle-cellar
+entities: treasure-chest

# location tulsa.sewer-locked-room
+entities: treasure-chest

# location tulsa.rogue-den
+entities: 4 thief, strongbox

# location tulsa.market-row
lift an axe off the rack:
  +on success:
    xp: thieving 12

# flag castle-watched

# location tulsa.market-rooftops
watch the castle windows:
  time: 8
  if not castle-watched:
    set: castle-watched
    xp: thieving 5
  say: You lie flat on the warm tile and give the castle a long look. The second floor opens its shutters and leaves them open; one window on the third is shut against weather nobody else is shutting against. It means something to somebody. It does not yet mean anything to you.

# entity tulsa.sewer-grate
reach through the bars:
  +on success:
    xp: thieving 3

# entity tulsa.barred-door
pick lock:
  xp: thieving 15

# entity tulsa.washing-line
lift a shirt off the line:
  +on success:
    xp: thieving 8

# entity tulsa.pie-window
take one off the sill:
  +on success:
    xp: thieving 10
