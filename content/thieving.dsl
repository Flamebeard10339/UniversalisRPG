// Thieving: a standard contest between ability and task-difficulty.

# info thieving
version: 1.0.1
pack: skills
dependencies:
  core
  combat

# stat thieving-ability
title: Thieving
base: 0
group: core.skilling

# stat thieving-rate
title: Thieving Speed
base: 15
group: core.skilling

# stat npc-daze-duration
title: Daze Duration
base: 0
group: core.skilling

// Multiplier on thieving rewards. Rounds down.
# stat luck
base: 0
group: skilling

# stat npc-thieving-difficulty
title: Vigilance
group: core.other

# skill thieving
title: Thieving
stat: thieving-ability

// --- Debuffs ---

// Standard thieving debuff that applies on some failed checks. 
# item dazed
title: Dazed
examine: Dizzy...
-100% thieving-rate

// --- Actions ---

# action generic-thieving-action
title: CHANGETHIS
continuous
attempts: 1
rate: my thieving-rate
accuracy: my thieving-ability vs their npc-thieving-difficulty
on unfinished:
  inflict: dazed for npc-daze-duration

// --- Thieving Equipment ---

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

// --- Passives ---

# passive flat-thieving-small
Title: Light Fingers
tools, +2 thieving-ability

# passive flat-thieving-large
Title: Nimble Fingers
tools, +4 thieving-ability

# passive flat-thieving-rate-small
Title: Quick Fingers
tools, +1 thieving-rate

# passive flat-thieving-rate-large
Title: Planned Action
tools, +2 thieving-rate

# passive increased-thieving-small
Title: Rogue's Sense
tools, +12% thieving-ability

# passive thieving-flat-health-1
Title: Thick Skin
tools, +12 core.max-health

# passive thieving-regeneration-1
Title: Steady Nerve
tools, recovery, +1 core.regeneration

# passive reduced-daze-duration-1
Title: Brazen
tools, -10% npc-daze-duration

# passive reduced-daze-duration-2
Title: Tough
tools, -25% npc-daze-duration

# passive luck-1
Title: Good Eye
tools, +3-8 core.luck

# passive luck-2
Title: Practised Fence
tools, +8-15 core.luck

// --- Cluster Jewels ---

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
  passives: 1 good-eye, 2 practised-fence

// --- Stealable Items ---

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

