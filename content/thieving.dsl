# info thieving
version: 1.2.0
pack: skills
dependencies:
  core
  ? combat
  ? tulsa

# stat thieving-ability
title: Thieving
base: 0
group: core.skilling

# ladder thieving-ability
added at level one: 0
added growth per level: 7
minutes at level one: 5
minutes growth per level: 1.07

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
hidden if: always

# stat npc-thieving-xp
group: core.other
hidden if: always

# stat npc-thieving-damage
group: core.other
hidden if: always

# skill thieving
title: Thieving
stat: thieving-ability

# guise open-chest
title: Open Chest
examine: The lid is standing up and the tray under it is bare. Whatever settles back into it does so slowly.
without: pick-the-lock

# item dazed
title: Dazed
examine: Dizzy...
-100% thieving-rate

# action steal
attempts: 1
accuracy: us.thieving-ability vs them.npc-thieving-difficulty
on success:
  xp: thieving them.npc-thieving-xp
on attempts exhausted:
  drain: them.npc-thieving-damage core.health

# action pick-pocket
title: Pick a Pocket
extends: steal
continuous
rate: us.thieving-rate
+on success:
  say: You come away with it and they walk on none the wiser.
+on attempts exhausted:
  inflict: dazed for daze-duration

# action pick-the-lock
title: Pick the Lock
extends: steal
continuous
time: 6
+on success:
  stands: open-chest for 3s

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

# item uncommon-general-thieving
title: Quiet Hour
value: 250
cluster-jewel: 
  shape: ring
  open-connections: e
  passives: 1 flat-thieving-small, 2 flat-thieving-rate-small, 3 flat-thieving-large, 4 flat-thieving-small, 5 flat-thieving-rate-small, 6 flat-thieving-large

# item common-general-thieving
title: Light Touch
value: 150
cluster-jewel: 
  shape: ring
  open-connections: e
  passives: 1 flat-thieving-small, 2 flat-thieving-rate-large, 3 flat-thieving-large, 4 increased-thieving-small, 5 flat-thieving-rate-large, 6 flat-thieving-small

# item uncommon-utility-thieving
title: Cold Nerve
value: 350
cluster-jewel: 
  shape: wheel
  open-connections: e, nw
  passives: 1 thieving-flat-health-1, 2 reduced-daze-duration-1, 3 thieving-regeneration-1, 4 reduced-daze-duration-2, 5 thieving-flat-health-1, 6 thieving-regeneration-1, 7 flat-thieving-large

# item unique-luck-thieving
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
  stands: picked-townsman for 90s
  one of:
    100x: give: 3 core.coin
    8x: roll: townsmans-wardrobe
  +on attempts exhausted:
    say: Your hand is on the purse and then their hand is on your wrist, and they are not gentle about it.

# droptable townsmans-wardrobe
one of:
  1x: give: 1 core.unassuming-cap
  1x: give: 1 core.linen-shirt
  1x: give: 1 core.linen-pants
  1x: give: 1 core.simple-boots

# entity tulsa.guardsman
+stats: npc-thieving-difficulty 55, npc-thieving-xp 10, npc-thieving-damage 1
+uses: pick-pocket
pick-pocket:
  stands: picked-guardsman for 90s
  give: 7 core.coin
  +on attempts exhausted:
    say: He turns into you rather than away, and the pommel of his sword arrives before you have finished deciding what to do, and then he has a fistful of your collar.

# entity tulsa.knight
+stats: npc-thieving-difficulty 70, npc-thieving-xp 25, npc-thieving-damage 1
+uses: pick-pocket
pick-pocket:
  requires: level.thieving >= 11
  stands: picked-knight for 90s
  give: 12 core.coin
  +on attempts exhausted:
    say: There is a great deal of iron in the way and then a great deal of iron coming the other way, and he holds you at arm's length while he decides whether you are worth the walk to the gate.

# entity thief
title: Thief
examine: A casual cloaked figure idly rolling a blade between their gloved hands. 
stats: attack 20, defense 6, max-health 85, attack-rate 26, accuracy 95, evasion 60, npc-thieving-difficulty 70, npc-thieving-xp 30, npc-thieving-damage 1
uses: core.melee-combat, pick-pocket
faction: core.world
respawn after: 80s
on death:
  credit:
    roll: combat.purse
    1 in 14: give: 1 steel-lockpicks
pick-pocket:
  requires: level.thieving >= 11
  stands: picked-thief for 90s
  one of:
    250x: give: 18 core.coin
    5x: give: 1 fingerless-gloves
    1x:
      give: 1 unique-luck-thieving
      say: The loupe was in the same pocket as the coin, and they will miss it a great deal more.
  +on attempts exhausted:
    say: They let you get all the way to it before their hand closes on your wrist, which is how you know they were watching the whole time. Nobody raises their voice. Nobody lets go either.

# entity house-chest
title: Chest
examine: A banded chest under the window with a lock on it older than the window.
stats: npc-thieving-difficulty 25, npc-thieving-xp 14, npc-thieving-damage 3
uses: pick-the-lock
pick-the-lock:
  roll: house-chest-contents
  say: The lock gives with a sound like a knuckle cracking.
  +on attempts exhausted:
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
stats: npc-thieving-difficulty 70, npc-thieving-xp 30, npc-thieving-damage 8
uses: pick-the-lock
pick-the-lock:
  requires: level.thieving >= 11
  time: 10
  roll: treasure-chest-contents
  say: The last ward turns over and the lid comes up on its own.
  +on attempts exhausted:
    say: The runes light one after another and the cellar goes out from under you, and puts you down at the gate.
    relocate: tulsa.castle-gate

# droptable treasure-chest-contents
one of:
  8x: give: 1 coloured-glass
  5x: give: 1 topaz
  3x: give: 1 sapphire
  1x: give: 1 ruby

# entity strongbox
title: Strongbox
examine: Banded twice over and set into the floor, and the lock is the newest thing in the room by thirty years.
stats: npc-thieving-difficulty 91, npc-thieving-xp 45, npc-thieving-damage 2
uses: pick-the-lock
pick-the-lock:
  requires: level.thieving >= 14
  time: 14
  roll: strongbox-contents
  say: The last ward goes over under your thumb and the lid lifts on a hinge somebody has kept oiled.
  +on attempts exhausted:
    say: A pick shears off in the third ward and somebody behind you says that one is theirs, in the tone of a person who is not going to say it twice.
    inflict: dazed for daze-duration

# droptable strongbox-contents
one of:
  9x: give: 1 sapphire
  6x: give: 1 ruby
  4x: give: 1 soft-toed-boots
  2x: give: 1 fingerless-gloves
  1x: give: 1 uncommon-general-thieving
  1x: give: 1 uncommon-utility-thieving

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
+entities: 4 thief, strongbox, the-fence, the-lurker, smirking-rogue, the-far-door

# location tulsa.market-row
+entities: market-watch, fruit-stall, tam
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

# stat watch-gap
group: core.other
hidden if: always

# stat warden-away
group: core.other
hidden if: always

# stat initiation-clock
group: core.other
hidden if: always

# item the-watch-is-elsewhere
title: The Watch Is Elsewhere
examine: The market watch have walked on up towards the castle, and it will be a while before they are round again.
+1 watch-gap

# item the-warden-is-downstairs
title: The Warden Is Downstairs
examine: The warden has gone down to the cells to see about the noise.
+1 warden-away

# item the-warden-is-at-his-doughnuts
title: The Warden Is at His Doughnuts
examine: A paper of doughnuts went up to the lock-up, and the warden eats where the lads can see him.
+2 warden-away

# item the-sand-is-running
title: The Sand Is Running
examine: The glass beside the far door was turned when the bell rang, and it has not run out yet.
+1 initiation-clock

# flag times-caught

# flag confiscated
bundle

# flag fruit-stolen

# flag fruit-given

# flag on-the-run

# flag cell-open

# flag knows-the-den

# flag has-the-word

# flag heard-about-the-doughnuts

# flag outfit-pieces

# flag hauled-out

# flag initiated

# flag widows-door-open

# flag widows-cellar-open

# action pick-the-door
title: Pick the Lock
extends: steal
continuous
time: 6

# action slip-past
title: Slip Past
extends: steal
continuous
time: 8

# action lift-from-the-stall
title: Lift From the Stall
extends: steal
continuous
rate: us.thieving-rate

# action cross
title: Cross
attempts: 1
continuous
time: 5
accuracy: us.thieving-ability vs them.npc-thieving-difficulty
on success:
  xp: thieving them.npc-thieving-xp

# passive cutpurse
title: Cutpurse
tools, +8 thieving-ability

# passive patience
title: Patience
tools, +3 thieving-rate

# passive casing
title: Casing the Place
tools, +1 thieving-ability per level of thieving

# passive sleight
title: Sleight
tools, +20% thieving-rate

# passive iron-nerve
title: Iron Nerve
tools, -40% daze-duration

# passive hard-knuckles
title: Hard Knuckles
tools, +25 core.max-health

# item rare-general-thieving
title: The Long Look
examine: A ring of dull steel with seven notches filed into it, one for every day somebody stood across the street from a door.
value: 2500
cluster-jewel:
  shape: wheel
  open-connections: e, sw
  passives: 1 cutpurse, 2 patience, 3 casing, 4 cutpurse, 5 sleight, 6 patience, 7 casing

# item rare-utility-thieving
title: Nothing to Declare
examine: A closed ring of black iron with nothing on its surface that would catch on anything.
value: 2000
cluster-jewel:
  shape: ring
  open-connections: e
  passives: 1 hard-knuckles, 2 iron-nerve, 3 cutpurse, 4 hard-knuckles, 5 iron-nerve, 6 sleight

# item burglars-picks
title: Burglar's Picks
examine: Eleven picks and three tension bars in a leather roll, each one filed for a lock its maker would not want to hear about.
slot: mainhand
requires: level.thieving >= 20
value: 900
item-level: 10-30
tools, +14 thieving-ability

# item climbing-gloves
title: Climbing Gloves
examine: Goatskin gloves with the palms doubled and the fingertips cut away.
slot: gloves
requires: level.thieving >= 16
value: 320
item-level: 8-18
tools, +7 thieving-ability

# item rogues-hood
title: Rogue's Hood
examine: A hood of dark wool cut to sit low, with the seam at the back let out so it turns with the head.
slot: head
requires: level.thieving >= 30
value: 800
item-level: 26-34
tools, +15% thieving-ability

# item rogues-chestwrap
title: Rogue's Chestwrap
examine: Bands of dark linen wound over the ribs and pinned flat, with nothing on them that would catch on a sill.
slot: body
requires: level.thieving >= 30
value: 800
item-level: 26-34
tools, +15% thieving-ability

# item rogues-legwraps
title: Rogue's Legwraps
examine: Wrapped from ankle to knee and tied off on the inside of the leg, where the knot does not show.
slot: legs
requires: level.thieving >= 30
value: 800
item-level: 26-34
tools, +15% thieving-rate

# item rogues-sandals
title: Rogue's Sandals
examine: Rope soles on a leather upper, and the rope has been walked flat on tile.
slot: boots
requires: level.thieving >= 30
value: 800
item-level: 26-34
tools, +15% thieving-rate

# item signet-ring
title: Signet Ring
examine: A heavy gold ring with a seal cut into the face of it. The seal is the duke's, and it has been used.
value: 400

# item pearl-earrings
title: Pearl Earrings
examine: A pair of drop earrings, the pearls a little yellow with age and the settings worn thin.
value: 120

# item apple
title: Apple
examine: A red-and-green apple, small, with a bruise on one side where it sat on the tray.
value: 2
food, +1 core.regeneration, 30s
eat:
  instant
  take: 1 apple
  say: You eat the apple round the bruise.

# item pear
title: Pear
examine: A yellow pear, soft at the neck.
value: 3
food, +1 core.regeneration, 40s
eat:
  instant
  take: 1 pear
  say: You eat the pear, and it runs down your wrist.

# entity coat-of-pockets
title: A Man With a Coat
examine: He stands where the alley bends, so that he can see both ends of it at once, and the coat is cut a good deal wider than a coat needs to be. What he is selling is inside it, and he opens it the way somebody opens a book they have read.

keeps shop: the-alley-coat

# shop the-alley-coat
coin: core.coin
stocks:
  6 common-general-thieving
  3 fingerless-gloves
  3 soft-toed-boots
  2 steel-lockpicks
replenish: 200s

# shop the-fence
coin: core.coin
stocks:
  2 burglars-picks
  3 climbing-gloves
  6 steel-lockpicks
  12 common-general-thieving
replenish: 120s

# shop fruit-stall
coin: core.coin
stocks:
  40 apple
replenish: 8s

# shop pear-cart
coin: core.coin
stocks:
  30 pear
replenish: 10s

# droptable jewellery-box-contents
one of:
  42x: give: 1 gold-necklace
  35x: give: 1 sapphire
  28x: give: 1 ruby
  21x: give: 1 pearl-earrings
  1x: give: 1 rare-utility-thieving

# droptable wardens-lockbox-contents
one of:
  8x: give: 15-40 core.coin
  4x: give: 1 gold-ring
  3x: give: 1 fingerless-gloves
  2x: give: 1 core.lockpick
  1x: give: 1 rare-utility-thieving

# droptable the-lookouts-share
roll: strongbox-contents
roll: strongbox-contents

# droptable sent-to-jail
unset: cell-open
unset: on-the-run
unset: wardens-door.unlocked
shake off: dazed
say: The walk to the lock-up is not a long one and nobody talks on it. A door, a stair, a second door, and the key turning behind you.
relocate: jail-cell

# droptable purse-confiscated
confiscated = take: everything

# droptable purse-returned
give: everything in confiscated

# droptable caught-at-the-stalls
add: times-caught 1
if stat.watch-gap >= 1:
  if times-caught = 1:
    say: The stallholder has your wrist before the apple is in your sleeve. "Put it back. Put it back and I say nothing, this once."
  if times-caught = 2:
    say: "You again." The fruit goes back on the pile and the back of your hand gets a slap that is mostly for the benefit of the row. "Next time I call them over."
  if times-caught >= 3:
    drain: 2 core.health
    say: A shove in the chest sits you down on the cobbles with the whole row looking. "I said next time. Get away from my stall and stay away from it."
if not stat.watch-gap >= 1:
  if times-caught = 1:
    say: A hand lands on your shoulder, not hard. "Now then. Put that back for the man and we will all say it was a mistake. Go on." He waits until you have, and nods, and walks on.
  if times-caught = 2:
    drain: 4 core.health
    say: The slap arrives before the words do, open-handed and across the ear. "Second time. I have a good memory for faces and yours is not a hard one. Put it back."
  if times-caught = 3 or times-caught = 4:
    drain: 6 core.health
    roll: purse-confiscated
    if not count.confiscated >= 1:
      say: He goes through your pockets and finds nothing in them worth the walk, which does not improve his mood. "Nothing on you. Fine. The warden can have you instead."
      roll: sent-to-jail
    if count.confiscated >= 1:
      say: "Right." The pack comes off your shoulder, and then the boots, and then everything else on you with a buckle to it, and he does not look at any of it. "That goes up to the warden's box, and you can go and explain to him how you came by it, if you like. I would not."
  if times-caught >= 5:
    drain: 6 core.health
    roll: purse-confiscated
    say: Nobody says anything this time. The pack goes to one of them and everything you are wearing that will come off goes to the other, and then it is an arm each, and your feet do not touch the cobbles again until the barracks.
    roll: sent-to-jail

# droptable hauled-out
set: hauled-out
shake off: the-sand-is-running
say: You are on the floor and then you are not, because somebody has you under the arms and is walking you backwards fast, and then you are on the floor of the den with the lamps over you and a ring of faces round the lamps that are trying not to laugh.
relocate: tulsa.rogue-den

# entity market-watch
title: The Market Watch
examine: Two of the duke's men walking the stalls at the pace of people paid by the hour, one of them looking at the goods and the other at the hands near them.
hidden if: stat.watch-gap >= 1
wait for them to move on:
  time: 20
  inflict: the-watch-is-elsewhere for 3m
  say: They finish the row, turn up towards the castle, and do not look back. It will be a while before they are round again.

# dialogue market-watch
owner = market-watch

node walking-the-stalls:
  always
  again: "Move along." Neither of them has looked up.
  "Keep your hands where the stalls can see them." He says it to everybody. He has said it to you twice.

node a-known-face:
  when: times-caught >= 3
  sticky
  ask: Evening.
  The taller one stops. "Three times, is it? Four?" He does not need telling. "There is a bench in the lock-up with your shape in it. Keep walking."

# entity fruit-stall
title: Tam's Fruit Stall
examine: Apples in trays three deep, and a child's height of them piled at the front where a hand would go.
keeps shop: fruit-stall
stats: npc-thieving-difficulty 25, npc-thieving-xp 5, npc-thieving-damage 1
uses: lift-from-the-stall
lift-from-the-stall:
  one of:
    3x if not stat.watch-gap >= 1:
      say: The apple is in your hand and a hand is on your arm, and the hand is wearing the duke's colours.
      roll: caught-at-the-stalls
    5x:
      give: 1 apple
      add: fruit-stolen 1
      say: An apple off the near corner, and the pile settles to cover the gap.
  +on attempts exhausted:
    roll: caught-at-the-stalls

# entity tam
title: Tam
examine: A man behind the apple trays with a knife and a half-peeled apple, keeping the peel in one piece.

# dialogue tam
owner = tam

node short:
  when: fruit-stolen >= 15
  sticky
  ask: Slow day?
  "Slow." He looks at the trays, which are lower than they should be at this hour, and at the street, and at you, and then quickly not at you. "I count them out in the morning. I count them again at noon. The numbers are not the numbers." His voice drops. "Something is having them. I have not seen a hand. I have not seen a rat. I have not seen anything." He goes back to the apple, and the peel breaks.

node the-buyer:
  when: inventory.apple >= 25 and not fruit-stolen >= 15
  sticky
  ask: Slow day?
  He looks at your pack, which is mostly apples. "Slow? You have had half the tray off me. Come back tomorrow and you can have the other half."

node passing:
  always
  again: "Apples," he says, in case you had forgotten.
  "Apples. Two coin, and they are better than they look."

# entity pear-cart
title: Bess's Pear Cart
examine: A handcart with the shafts down, stacked with pears in straw, and a cloth over the back half that nobody has lifted since morning.
keeps shop: pear-cart
stats: npc-thieving-difficulty 22, npc-thieving-xp 5, npc-thieving-damage 1
uses: lift-from-the-stall
lift-from-the-stall:
  one of:
    3x if not stat.watch-gap >= 1:
      say: You have the pear, and one of the duke's men has your wrist, and neither of you says anything for a moment.
      roll: caught-at-the-stalls
    5x:
      give: 1 pear
      add: fruit-stolen 1
      say: A pear from under the cloth, where she has not counted.
  +on attempts exhausted:
    roll: caught-at-the-stalls

# entity bess
title: Bess
examine: A woman beside the pear cart with her arms folded, watching the square rather than the cart.

# dialogue bess
owner = bess

node the-children:
  when: the-fruit-stall.fed
  sticky
  ask: About the children.
  "Them." She does not unfold her arms. "Somebody has been feeding them, and it was not me, and now I have started, so I suppose it is me." She looks at the four of them by the wall. "I gave them the bruised ones. They said thank you. Nobody has said thank you at this cart in eleven years."

node the-missing-pears:
  when: fruit-stolen >= 15 and not the-fruit-stall.fed
  sticky
  ask: Slow day?
  "Slow. Short." She lifts the cloth and looks under it and lets it drop. "I am down a dozen since noon and I have not sold a dozen since noon." Her eyes go to the children by the wall and come back. "It is not them. I watch them. It is something else." She watches the square a while longer, and does not say what else.

node passing:
  always
  again: "Pears," she says, and goes on watching the square.
  "Pears. Three coin. Mind the cloth."

# entity street-urchins
title: Street Urchins
examine: Four children between the pear cart and the wall, none of them above your elbow. {not the-fruit-stall.taught and not the-fruit-stall.fed: Their clothes were somebody else's first, and they are watching the cart the way the cart's owner is watching the square.}{the-fruit-stall.taught or the-fruit-stall.fed: Their clothes fit them, and one of them is eating a pear without looking over her shoulder.}

# quest the-fruit-stall
title: The Fruit Stall
log: There are children by the pear cart in the square who have been looking at it a long time.

stage hungry:
  log: The children by the pear cart are hungry and have not worked out what to do about it. A hundred pieces of fruit would feed them a while. A lesson would feed them longer.
  done when: fruit-given >= 100
  goto fed
  street-urchins says:
    always
    sticky
    ask: What are you lot doing?
    The biggest one steps in front of the others, which is something she has done before. "Nothing." Then, because you are still standing there: "Waiting for her to turn round. She never turns round."
    -> Watch. This is how it is done. (when fruit-stolen >= 1)
      say: You do it slowly so they can see, once, and then at speed, and the biggest one's mouth comes open. "That's it? That's all?" The smallest has already got one. It is not how fast, you tell them. It is where she is not looking. The biggest one nods like somebody memorising a map.
      goto taught
    -> Here. Twenty apples. (when inventory.apple >= 20)
      take: 20 apple
      add: fruit-given 20
      say: They do not say thank you. They eat. The biggest one puts two in her shirt for later and watches to see whether you mind.
    -> Here. Twenty pears. (when inventory.pear >= 20)
      take: 20 pear
      add: fruit-given 20
      say: The pears go faster than the apples did. The smallest one eats the core.
    -> Never mind.
      say: She steps back beside the others and goes back to watching the cart.

stage taught:
  log: I showed the children by the pear cart how a hand goes into a pile. They will not go hungry, and Bess will not know why.
  complete
  street-urchins says:
    always
    ask: How is it going?
    again: The biggest one grins and turns out her pockets, and there is nothing in them, which is the point.
    "She still has not turned round." The biggest one is eating a pear. "One each. Never two. Never off the front." She looks at you to see whether that was right. It is more right than you were.

stage fed:
  log: I fed the children by the pear cart out of my own pack until they stopped looking hungry.
  complete
  street-urchins says:
    always
    ask: How are you all?
    again: They wave. The smallest one is asleep in the sun.
    "You again." The biggest one does not step in front of the others this time. "We are all right. Bess gave us the bruised ones yesterday, on her own. Did not ask, just did." She thinks about that. "Nobody used to."

# entity lurking-man
title: A Man in the Alley
examine: A man standing where the alley narrows, his back to the crates and his hood up on a day that does not want one. He has been looking at the same door for a while.
hidden if: lookout.kept-watch or lookout.turned-him-in

# quest lookout
title: Lookout
log: There is a man in the alley behind Tavern Street who has been looking at one door for longer than a door takes.

stage an-offer:
  log: The man in the alley wants somebody at the mouth of it while he goes through a back door, and says there is a share in it.
  lurking-man says:
    always
    sticky
    ask: You have been stood there a while.
    He does not jump, which tells you something. "Have I." He looks past you to the mouth of the alley, and back. "There is a door here that wants going through, and a street out there that wants watching while I do. I cannot do both. I was going to wait for dark."
    "Stand at the end and look bored. Anybody turns in, you cough. That is the whole job." He weighs something in his pocket. "Half of what is in there, and you do not have to see what is in there."
    -> Go on, then. I will watch the street.
      say: He is gone before you have finished nodding. You stand at the mouth of the alley and look at the street, and the street looks back, and nobody coughs. When he comes out he is walking slowly, which is how people walk who are carrying more than they went in with.
      roll: the-lookouts-share
      say: "Half," he says, and it is. "If you ever want more of that, come and find me. I am not going to tell you where." He is halfway up the street before you think to ask.
      goto kept-watch
    -> Not for me.
      say: "No." He does not argue. "I will be here a while yet. Door is not going anywhere."
      goto thinking-it-over

stage thinking-it-over:
  log: I turned him down. He is still in the alley, and the guards are still on the gates.
  lurking-man says:
    always
    sticky
    ask: About that door.
    "Changed your mind?" He has not moved. "Mouth of the alley. Cough if anybody turns in."
    -> All right. I will watch.
      say: He is gone before you have finished nodding. You stand at the mouth of the alley and look at the street, and the street looks back, and nobody coughs. When he comes out he is walking slowly, which is how people walk who are carrying more than they went in with.
      roll: the-lookouts-share
      say: "Half," he says, and it is. "If you ever want more of that, come and find me. I am not going to tell you where." He is halfway up the street before you think to ask.
      goto kept-watch
    -> No.
      say: "Suit yourself." He goes back to looking at the door.
  tulsa.guardsman says:
    always
    ask: There is a man in the alley behind Tavern Street.
    "Is there." He is already looking that way. "Hooded? Been there a while?" He does not wait for the answer. "Stay here."
    It is not long. Two of them come back up the street with a man between them who is not struggling and is not looking at you either, and a bag that is not his.
    "This was in the bag." The guardsman hands it over without checking it. "Whoever it belongs to is not going to claim it. You did the town a turn. Do not let anybody tell you different."
    roll: the-lookouts-share
    goto turned-him-in
  tulsa.guard-captain says:
    always
    ask: There is a man in the alley behind Tavern Street.
    She puts the report down, which she does not do for most people. "Behind Sunny's? Hooded?" She is already on her feet. "Wait here. Do not go back that way."
    When she comes back she is alone, and she sets a bag on the table between you. "He is in the cells. This was on him, and none of it is his, and none of it is going to be claimed." She pushes it across. "Take it. I do not have many good afternoons."
    roll: the-lookouts-share
    goto turned-him-in

stage kept-watch:
  log: I kept watch while a man went through a door in the alley behind Tavern Street, and came away with half of what was behind it. He said to come and find him, and did not say where.
  complete
  tulsa.guardsman says:
    always
    ask: Evening.
    again: He watches you go, which he did not use to do.
    "You." He looks at you longer than he needs to. "Seen you about. Alleys, mostly, stood at the ends of them looking at nothing." He lets that sit. "Do not. Whatever it is you are doing, do it somewhere I am not."
  market-watch says:
    always
    ask: Evening.
    again: They do not answer. One of them keeps looking.
    One of them nudges the other. "That is the one from the alley." Neither of them says anything else, and neither of them stops looking until you are past the last stall.

stage turned-him-in:
  log: I sent the guard to the alley behind Tavern Street. They took the man away, and gave me what was in his bag for the trouble.
  complete
  tulsa.guardsman says:
    always
    ask: Evening.
    again: A nod, and it is meant.
    "Here is our friend." He is nearly smiling, which on him looks like something that hurts. "That one in the alley had been through four back doors this month and we did not have a face for him until you gave us one. Anything you need, you ask. Within reason."
  tulsa.guard-captain says:
    always
    ask: About the man in the alley.
    again: "Still in the cells," she says. "Still not talking."
    She looks up from the report. "He has not said a word since we brought him in, and he is not going to say one to you either, but you are welcome to try. He is under the lock-up." She goes back to the page. "That was good work. I do not say it often. I do not get to."
  market-watch says:
    always
    ask: Evening.
    again: A nod from one, and a look from the other that is nearly a nod.
    "Heard about you." The shorter one. "Alley behind Sunny's. Good." That is the whole of it, and they walk on.

# entity the-lurker
title: The Man from the Alley
examine: The man from the alley, hood down now, at a table with two others and a bottle. He looks less like a man waiting and more like a man who has arrived.
hidden if: not lookout.kept-watch

# dialogue the-lurker
owner = the-lurker

node found-me:
  when: always
  ask: Found you.
  again: "Still found," he says, and pushes the bottle an inch your way.
  He sees you on the stair and laughs, once, properly. "Well. Took you long enough. Or no time at all, I have lost track down here." He kicks a stool out from under the table with his foot. "Sit. You watched a street for me and you did not cough when you did not have to. That is rarer than you would think."
  "Nobody here will ask what you are for. Do not ask them either."

# entity the-man-from-the-alley
title: The Man from the Alley
examine: The man from the alley behind Tavern Street, on the bench of the end cell with his cloak folded under his head and his eyes open.
hidden if: not lookout.turned-him-in

# dialogue the-man-from-the-alley
owner = the-man-from-the-alley

node sour:
  when: always
  ask: About the alley.
  again: He has turned his face to the wall, and he keeps it there.
  He looks at you for a long moment before he speaks. "They gave you something for me, I expect. Out of my own bag. That is their little joke. They do it every time."
  "I offered you a share. A share. You could have said no and walked on and I would have thought no worse of you for it."
  -> It was not me.
    say: "No." He turns his face to the wall. "It never is."
  -> They would have caught you sooner or later.
    say: "Later," he says. "It was going to be later."

# entity the-widow-at-the-door
title: An Old Woman
examine: A small woman in a shawl on the step of the house on the corner, a basket at her feet and both hands flat on the door.
hidden if: locked-out.let-in-by-the-guard or locked-out.told-coldly or locked-out.gone

# entity the-widow-inside
title: An Old Woman
examine: The old woman from the step, in a chair by her own cold hearth with her shawl still on, and the basket on the table beside her, unpacked.
hidden if: not locked-out.let-in-by-the-guard

# entity widows-door
title: The Widow's Door
examine: A door in a frame that has settled, with a lock that has been changed at least once and a bar behind it that has not.
hidden if: locked-out.let-in-by-the-guard
stats: npc-thieving-difficulty 45, npc-thieving-xp 35, npc-thieving-damage 1
uses: pick-the-door
pick-the-door:
  hidden if: widows-door-open
  set: widows-door-open
  say: The lock is older than the bar and gives sooner, and the bar was never dropped. The door swings in on a room laid for one.
  relocate: widows-house
  +on attempts exhausted:
    say: The wards bind. Somebody at the well turns to look at the noise, and then turns back.

# entity widows-new-lock
title: The Widow's Door
examine: The same door, and a new lock on it, brass, with the fitter's file marks still bright round the plate.
hidden if: not locked-out.let-in-by-the-guard
stats: npc-thieving-difficulty 120, npc-thieving-xp 90, npc-thieving-damage 2
uses: pick-the-door
pick-the-door:
  hidden if: widows-door-open
  set: widows-door-open
  say: The new lock is a good one and it takes everything you have, and then it turns, and the bar behind it has not been dropped, which is either forgetfulness or an invitation.
  relocate: widows-house
  +on attempts exhausted:
    say: The brass does not give. Whoever fitted it in a morning knew what they were about.
    inflict: dazed for daze-duration

# entity back-window
title: The Back Window
examine: A small window at the back of the house, the shutter hooked open and the casement not quite shut, a little higher than is comfortable.
hidden if: locked-out.let-in-by-the-guard
climb in:
  time: 8
  say: You get an elbow on the sill and the rest of you follows the elbow. It is a smaller window than it looked, and you go through it in the order you would have chosen if asked.
  relocate: widows-house

# entity latched-window
title: The Back Window
examine: The same small window, shuttered now, with a new latch on the inside of the casement that can be seen through the crack.
hidden if: not locked-out.let-in-by-the-guard
stats: npc-thieving-difficulty 100, npc-thieving-xp 75, npc-thieving-damage 3
uses: pick-the-door
pick-the-door:
  say: A blade under the latch, worked up a hair at a time until it lifts, and then the shutter, and then you.
  relocate: widows-house
  +on attempts exhausted:
    say: The blade slips and takes a piece of your thumb with it, and the latch does not move.

# entity cellar-door
title: The Cellar Door
examine: Two leaves of grey wood set flat in the yard, and a padlock through the hasp with more rust on it than lock.
hidden if: locked-out.let-in-by-the-guard
stats: npc-thieving-difficulty 20, npc-thieving-xp 25, npc-thieving-damage 1
uses: pick-the-door
pick-the-door:
  hidden if: widows-cellar-open
  set: widows-cellar-open
  say: The padlock does not so much open as give up. The leaves come up on a stair going down.
  relocate: widows-cellar
  +on attempts exhausted:
    say: The rust in the padlock is doing more to keep it shut than the lock is.

# entity cellar-new-lock
title: The Cellar Door
examine: The same two leaves, and the rusted padlock is gone from the hasp. The one in its place is steel and has never been rained on.
hidden if: not locked-out.let-in-by-the-guard
stats: npc-thieving-difficulty 110, npc-thieving-xp 80, npc-thieving-damage 2
uses: pick-the-door
pick-the-door:
  hidden if: widows-cellar-open
  set: widows-cellar-open
  say: Steel, new, and fitted properly. It takes as long as a good lock should take, and then the leaves come up on a stair going down.
  relocate: widows-cellar
  +on attempts exhausted:
    say: The new padlock does not care what you think of it.

# entity widows-door-inside
title: The Front Door
examine: The inside of the front door: a bar across it in two iron brackets, and the bar is oak.
lift the bar:
  hidden if: widows-door-open
  instant
  set: widows-door-open
  say: The bar comes up out of the brackets with both hands and a knee, and the door swings in on the lane.

# quest locked-out
title: Locked Out
log: An old woman on Well Lane has been standing at her own door a while.

stage at-the-door:
  log: An old woman on Well Lane is locked out of her house, and says it is not the first time. The guard would help for a price.
  the-widow-at-the-door says:
    always
    sticky
    ask: Are you all right there?
    She does not turn round straight away. "Locked out," she says to the door. "Again." Then she does turn, and looks you up and down in a way that takes its time. "Third time this month. The lock sticks, or I have left the key on the wrong side, or I have dropped it down the well, and I am too old to be going round the back."
    "The guard will come if you ask them. They will want paying for it, mind. Everything is paying, with them." She looks at your hands, and then at your face. "You look like somebody who could get a door open."
    -> I will get you in.
      say: "Will you." Something in her face that might be a smile if it were let. "Front is locked. There is a window round the back I never latch, and a cellar with a padlock on it my husband bought the year we married, and it was cheap then. I will be here."
      goto getting-in
    -> The guard can deal with it.
      say: "The guard." She turns back to the door. "Twenty-five, they will want. Twenty-five to walk up a lane." She does not say anything else, and she does not look round.
      goto fetching-a-guard

stage getting-in:
  log: The old woman's front door is locked. She says there is a window round the back she never latches, and a cellar padlock older than her marriage. Any way in will do, so long as the front door opens in the end.
  done when: widows-door-open
  goto let-in
  the-widow-at-the-door says:
    always
    sticky
    ask: About the door.
    "Still here." She has not moved from the step. "Still locked."

stage let-in:
  log: Her door is open. She is still on the step.
  the-widow-at-the-door says:
    always
    ask: Your door is open.
    She goes in past you without hurrying and stands in her own room a moment as though checking it is the one she left. Then she turns round. "That was quick."
    "You will want paying, and I have not got money worth the name. What I have got is this." She lowers her voice, though there is nobody in the lane. "Under the doss house at the bottom of the lane there is a cellar, and a hatch in the floor of the doss house that goes down to it, and a man on the hatch. Tell him the lock sticks. He will let you down. Do not tell anybody else, and do not tell him who told you."
    -> How would you know a thing like that?
      say: She smiles, and it is the first time, and it is not an old woman's smile at all. "I am just an old lady, dear. I get locked out."
      set: knows-the-den
      set: has-the-word
      goto gone
    -> Thank you.
      say: "Thank you," she says back, in exactly your voice, and shuts the door.
      set: knows-the-den
      set: has-the-word
      goto gone

stage gone:
  log: The old woman told me how to get under the doss house, and the words that get you past the hatch. Her house has been empty since.
  complete

stage fetching-a-guard:
  log: I left the old woman on her step. The guard will come for twenty-five coin.
  tulsa.guardsman says:
    always
    sticky
    ask: There is an old woman locked out on Well Lane.
    "Is there." He does not move. "That will be twenty-five." He says it the way a man says the weather. "Twenty-five and I will walk up there and see about it."
    -> Here is twenty-five. (when inventory.core.coin >= 25)
      take: 25 core.coin
      say: The coin goes somewhere inside the coat and he sets off up the lane at a pace that makes you wonder what the twenty-five was for. By the time you get there the door is shut, the old woman is inside it, and the guard is coming back down the lane counting.
      goto let-in-by-the-guard
    -> That is robbery.
      say: "That is the going rate," he says. "Robbery is more."
  tulsa.guard-captain says:
    always
    sticky
    ask: There is an old woman locked out on Well Lane.
    She does not look up. "And?" A page turns. "One of the lads will see to it. Twenty-five, to them, not to me. I do not carry change."

stage let-in-by-the-guard:
  log: The guard let her in, for twenty-five. The house has been shut since, and nobody answers the front.
  the-widow-inside says:
    always
    ask: You are in, then.
    She is in the chair by the cold hearth and she does not get up. She looks at you for long enough that you notice the room: the table laid for one, the basket unpacked, a new bolt on the inside of the door that was not there this morning.
    "Twenty-five coin," she says. "To a man who would not have crossed the lane for me on fire. And then you come in anyway." She lets that sit. "I could call him back. He would come quicker the second time, for what you would be worth to him."
    -> I got in, did I not?
      say: "You did." It is not a compliment and it is not not one. "New lock, new latch, new padlock, and you got in. Fine." She looks at the hearth. "Under the doss house there is a cellar, and a hatch in the floor above it, and a man on the hatch. He will want paying. I would have given you the words that get past him, if you had stood on my step and said yes."
      set: knows-the-den
      goto told-coldly
    -> I am sorry about the guard.
      say: "So am I." She does not soften. "Under the doss house there is a cellar, and a hatch in the floor above it, and a man on the hatch. He will want paying, and I will not be giving you the words that get past him. You will have to earn those somewhere else."
      set: knows-the-den
      goto told-coldly

stage told-coldly:
  log: The old woman told me where the hatch under the doss house is, and not the words that open it. She has not been in the house since.
  complete

# entity den-hatch
title: The Hatch
examine: A square of floor at the far end of the long room that is a different colour from the rest of it, and a man sitting on a stool on the square, eating.
hidden if: not knows-the-den
give the word:
  hidden if: not has-the-word
  instant
  say: You say it, not loudly. He does not look up from his bowl, but he moves the stool.
  relocate: tulsa.rogue-den
ask the price:
  hidden if: has-the-word
  instant
  say: He looks up from the bowl for the first time. "A thousand." He goes back to it. "Or the words. Nobody told you the words, or you would not be asking."
pay your way down:
  hidden if: has-the-word or not inventory.core.coin >= 1000
  instant
  take: 1000 core.coin
  say: He looks at the purse, and weighs it, and looks at you, and weighs that too. "Once," he says, and moves the stool. "Get the words off somebody down there. I am not carrying that up and down the stair every time."
  relocate: tulsa.rogue-den

# entity the-fence
title: The Fence
examine: A woman at a table at the back of the den with a set of scales, a lamp, and nothing on the table she did not put there herself.
keeps shop: the-fence

# dialogue the-fence
owner = the-fence

node terms:
  always
  again: "Same terms," she says, without looking up from the scales.
  "I buy what you bring and I sell what you will need." She sets a weight on one pan and watches the other. "I do not ask. You will notice I have not asked."

# entity smirking-rogue
title: A Rogue
examine: A young woman sitting on a barrel by the far door, cleaning her nails with a knife that is too good for it.

# dialogue smirking-rogue
owner = smirking-rogue

node a-close-one:
  when: hauled-out
  sticky
  ask: What happened?
  "That," she says, "was a close one." She is not trying very hard not to smile. "You would have been the first to die in there, you know. Ever. We would have had to put a plaque up."
  "Bell is still there. Nobody is counting how many times."

node the-bell:
  when: not hauled-out and not initiated
  ask: About the door.
  again: "Bell is right there," she says, and goes back to her nails.
  "The door?" She looks at it as if she has only just noticed it. "Ring the bell when you are ready and not before. It is not a race against anybody but the sand." She turns the knife over. "Everybody down here has been through. Some of them twice, and the second time was for showing off."

node after:
  when: initiated
  ask: About the door.
  again: "Still through," she says. "It does not wear off."
  "Through, then." She looks at you differently, which is to say she looks at you. "The hood is yours. The rest comes a piece at a time, and that is the rule, and I did not make it." A pause. "Nobody makes the second run for the clothes. They make it because the first one was not clean."

# entity the-far-door
title: The Far Door
examine: A door at the back of the den with a bar across it on this side and a bell on a bracket beside it. The floor in front of it is scuffed in a way the rest of the floor is not.
ring the bell:
  hidden if: stat.initiation-clock >= 1
  time: 4
  unset: hauled-out
  inflict: the-sand-is-running for 3m
  say: Somebody lifts the bar and somebody else turns a glass on a bracket beside it, and the den goes quiet the way a room does when everybody in it has done this. "Through to the end before the sand is out," a voice says. "Nobody is going to help you. Nobody helped us." The door shuts behind you.
  relocate: run-blades

# entity the-rope
title: A Rope
examine: A rope running back along the ceiling the way you came, with a bell on the far end of it.
pull it:
  instant
  shake off: the-sand-is-running
  say: You pull, and somewhere behind you a bell rings, and a while after that the door behind you opens and nobody comes through it. You walk back on your own.
  relocate: tulsa.rogue-den

# entity the-blades
title: The Blades
examine: A passage with slots cut in the walls at knee height and shoulder height, and something in the slots that catches the lamplight and moves.
stats: npc-thieving-difficulty 60, npc-thieving-xp 7
uses: cross
cross:
  +on success:
    say: You go through on the count, low under the high one and over the low one, and the wall closes behind you with a sound like a knife going back into a drawer.
    relocate: run-boulder
  +on attempts exhausted:
    if not resource.core.health > 12:
      roll: hauled-out
    if resource.core.health > 12:
      drain: 12 core.health
      say: The low one catches you across the shin and you go down on the near side of it, which is the only good thing about where you land.

# entity the-boulder
title: The Slope
examine: A passage that climbs, and at the top of it something round and heavy in a cradle of timber, and a rope from the cradle to a trip somewhere on the floor between you and it.
stats: npc-thieving-difficulty 75, npc-thieving-xp 9
uses: cross
cross:
  +on success:
    say: You find the trip by where the dust is not, and step over it, and go past the cradle without breathing.
    relocate: run-fire
  +on attempts exhausted:
    if not resource.core.health > 20:
      roll: hauled-out
    if resource.core.health > 20:
      drain: 20 core.health
      say: The cradle drops and the round thing comes down the slope faster than anything that size should, and you are against the wall with it going past close enough to take the buttons.

# entity the-fire
title: The Grate
examine: A short passage floored in iron grating, and under the grating, coals, and along the walls at head height, pipes with a smell of oil coming off them.
stats: npc-thieving-difficulty 90, npc-thieving-xp 12
uses: cross
cross:
  +on success:
    say: The pipes cough once as you go under them and the flame comes out behind you, which is where you are not.
    relocate: run-pit
  +on attempts exhausted:
    if not resource.core.health > 16:
      roll: hauled-out
    if resource.core.health > 16:
      drain: 16 core.health
      say: The flame comes out of the wall a step ahead of you and you go through the edge of it with an arm over your face.

# entity the-pit
title: The Pit
examine: The floor stops. A plank, one, spans a drop that the lamp does not reach the bottom of, and the plank is not fixed at either end.
stats: npc-thieving-difficulty 105, npc-thieving-xp 15
uses: cross
cross:
  +on success:
    say: You cross with your eyes on the far end and not on the plank, which is the trick, and step off it a stride before it tips.
    relocate: run-door
  +on attempts exhausted:
    if not resource.core.health > 25:
      roll: hauled-out
    if resource.core.health > 25:
      drain: 25 core.health
      say: The plank turns under you and you get the far edge with your hands and your chest and nothing else. Whatever is at the bottom, you did not find out.

# entity the-last-door
title: The Last Door
examine: A plain door with an hourglass in a bracket beside it. The sand in the glass is either still running or it is not.
go through:
  hidden if: not stat.initiation-clock >= 1
  instant
  if not initiated:
    xp: thieving 300
  set: initiated
  set: has-the-word
  add: outfit-pieces 1
  shake off: the-sand-is-running
  say: The door is not locked. It never was. On the other side of it is the den, from the other end, and every face in it turned towards the door, and one of them says the words to you before you have asked, slowly, so that you will have them.
  if outfit-pieces = 1:
    give: 1 rogues-hood
    say: A hood comes across the room to you, thrown, dark wool, worn by somebody before you. "That is yours. The rest you come back for."
  if outfit-pieces = 2:
    give: 1 rogues-chestwrap
    say: Somebody has a bundle of dark linen ready, and hands it over without a word, which is how it is done the second time.
  if outfit-pieces = 3:
    give: 1 rogues-legwraps
    say: The legwraps come across folded flat. Nobody claps. Somebody nods.
  if outfit-pieces = 4:
    give: 1 rogues-sandals
    say: The sandals are the last of it, and the woman on the barrel gets down off the barrel to hand them over herself, which she has not done for anybody else.
  if outfit-pieces >= 5:
    give: 60-120 core.coin
    say: There is nothing left of the set to give you, and everybody knows it, so somebody passes a purse instead and somebody else says it is for showing off.
  relocate: tulsa.rogue-den
hammer on it:
  hidden if: stat.initiation-clock >= 1
  instant
  say: The glass beside the door has run out. Nobody opens the door. After a while somebody opens the other one, behind you, and you walk back the way you came with the whole den watching, and nobody says anything, which is worse.
  relocate: tulsa.rogue-den

# entity jewellery-box
title: Jewellery Box
examine: A walnut box on the dressing table with a lock the size of a fingernail, and the key is not in it.
stats: npc-thieving-difficulty 147, npc-thieving-xp 55, npc-thieving-damage 4
uses: pick-the-lock
pick-the-lock:
  requires: level.thieving >= 22
  time: 9
  roll: jewellery-box-contents
  say: The lid comes up on a tray lined in velvet, and you take what will not be counted before morning.
  +on attempts exhausted:
    say: The pick slips, the box goes over, and the maid in the next room stops humming. You are on the stair before she reaches the door and out of the hall before she reaches the stair.
    relocate: tulsa.castle-gate

# entity tavern-lockbox
title: Lockbox
examine: An iron box under the end of the bar, chained to the leg of it, that holds the night's takings until Sunny carries them up.
stats: npc-thieving-difficulty 119, npc-thieving-xp 45, npc-thieving-damage 3
uses: pick-the-lock
pick-the-lock:
  requires: level.thieving >= 18
  time: 10
  one of:
    12x: give: 20-45 core.coin
    2x: give: 1 tulsa.bottle-of-vodka
  say: The chain lets the lid come up an inch, and an inch is enough for a hand.
  +on attempts exhausted:
    say: Sunny does not stop drying the glass. "That is mine," she says, and the man on the end stool has you by the collar before you have stood up, and then you are in the street.
    drain: 3 core.health
    relocate: tulsa.tavern-street

# entity pay-chest
title: Pay Chest
examine: A strapped chest under the captain's table with the duke's mark burnt into the lid. The guard's wages sit in it between the castle and the guard.
stats: npc-thieving-difficulty 133, npc-thieving-xp 70, npc-thieving-damage 2
uses: pick-the-lock
pick-the-lock:
  requires: level.thieving >= 20
  time: 12
  one of:
    10x: give: 30-70 core.coin
    2x: give: 1 pearl-earrings
  say: The straps are for show and the lock is not, but it turns, and the chest is fuller than the guard would like the guard to know.
  +on attempts exhausted:
    say: The captain does not look up from her report. "Lock-up," she says, to nobody in particular, and four men who were bored a moment ago are not any more.
    roll: sent-to-jail

# entity tulsa.the-duke
+stats: npc-thieving-difficulty 168, npc-thieving-xp 160, npc-thieving-damage 2
+uses: pick-pocket
pick-pocket:
  requires: level.thieving >= 25
  stands: picked-duke for 90s
  one of:
    120x: give: 40-90 core.coin
    10x: give: 1 signet-ring
    1x: give: 1 rare-general-thieving
  +on attempts exhausted:
    say: He does not turn round. He says a name, not loudly, and the two men you did not see come in from the stair take an arm each.
    roll: sent-to-jail

# entity jailer
title: The Jailer
examine: A guardsman at the desk with a ring of keys on the desk in front of him and his hand on the ring, reading nothing.

# dialogue jailer
owner = jailer

node escorted:
  when: on-the-run
  sticky
  He looks at you, then at the stair down, then at you again. "How did you—" He stops, because it does not matter how. "Back. Now. And I am changing that lock myself."
  roll: sent-to-jail

node the-warden:
  when: not on-the-run
  ask: About the warden.
  again: "Still up there. Still eating," he says, without looking up.
  "Him." The jailer tips his head at the ceiling. "Up there with the door shut and a paper of doughnuts from Mott's, same as every day. He would come down for a riot, or for another paper of doughnuts, and I have not seen much else do it."
  He looks at you as though he has said more than he meant to, and goes back to the ring of keys.
  set: heard-about-the-doughnuts

# entity street-door
title: The Street Door
examine: The door out to the barracks, with the jailer's desk between it and everything else.
stats: npc-thieving-difficulty 40, npc-thieving-xp 7, npc-thieving-damage 0
uses: slip-past
slip-past:
  hidden if: not on-the-run
  unset: on-the-run
  say: You wait for him to bend to the stove, and you are through the door and across the yard with the barracks between you and the desk before he straightens.
  relocate: tulsa.guard-barracks
  +on attempts exhausted:
    say: He straightens too soon. "Oi." Not loud, and not needing to be.
    roll: sent-to-jail

# entity wardens-door
title: The Warden's Door
examine: A door at the top of the stair with WARDEN painted on it in the same hand as the sewer signs, and a lock on it that the town did not pay for.
flags: unlocked
stats: npc-thieving-difficulty 120, npc-thieving-xp 80, npc-thieving-damage 2
uses: pick-the-door
pick-the-door:
  hidden if: unlocked
  requires: level.thieving >= 15
  time: 8
  if not stat.warden-away >= 1:
    say: The last ward turns and the door opens on a man behind a desk with a paper of doughnuts in front of him, and he does not seem surprised. "Downstairs," he says. "You know the way."
    roll: sent-to-jail
  if stat.warden-away >= 1:
    set: unlocked
    say: The lock is a good one and it takes its time, and then it does not. The room behind it is empty.
    relocate: wardens-office
  +on attempts exhausted:
    say: A pick shears in the second ward, and the sound of it carries down the stair.
    1 in 3:
      say: The jailer is at the bottom of the stair looking up at you, and he has the keys in his hand already.
      roll: sent-to-jail

# entity office-door-inside
title: The Door
examine: The warden's door from the inside, with the key in it.
let yourself out:
  instant
  if not stat.warden-away >= 1:
    say: You have the door open on a man coming up the stair with a paper bag in his hand, and there is nowhere in a stairwell to be.
    roll: sent-to-jail
  if stat.warden-away >= 1:
    unset: wardens-door.unlocked
    say: You pull the door to behind you and hear the lock take. Whoever fitted it, it locks itself.
    relocate: lock-up

# entity wardens-lockbox
title: The Warden's Lockbox
examine: An iron box bolted to the floorboards through its own base, with a lock on the front and a ledger number painted on the lid.
stats: npc-thieving-difficulty 98, npc-thieving-xp 35, npc-thieving-damage 2
uses: pick-the-lock
pick-the-lock:
  requires: level.thieving >= 15
  time: 10
  if not stat.warden-away >= 1:
    say: The lid comes up and so does a voice from the doorway, which is where the warden is standing with a paper bag in his hand. "Leave it open. Saves me the key."
    roll: sent-to-jail
  if stat.warden-away >= 1:
    if not count.confiscated >= 1:
      roll: wardens-lockbox-contents
      say: The box holds what the town's guard has taken off the town, in no order. You take what nobody who could say so is going to miss.
    if count.confiscated >= 1:
      say: On top of everything else in the box is a bundle with a paper tag tied to it: your pack, and everything that was on your back, rolled up in your own coat. The tag has a description on it that is not flattering and is not wrong.
      roll: purse-returned
  +on attempts exhausted:
    say: The pick binds in the last ward and you have to work it back out, which takes longer than getting it in did.

# entity the-warden
title: The Warden
examine: A broad man behind the desk with a ledger open in front of him and a paper bag beside the ledger, and he reads the ledger with one hand in the bag.
hidden if: stat.warden-away >= 1

# dialogue the-warden
owner = the-warden

node in-his-office:
  when: always
  sticky
  He does not ask how you got in. He looks at the door, and at you, and licks sugar off his thumb. "Well. You are in the right building for it."
  roll: sent-to-jail

# entity the-warden-below
title: The Warden
examine: A broad man at the end of the passage with a ring of keys in one hand, looking into the singing cell with the face of somebody deciding whether it was worth the stairs.
hidden if: not stat.warden-away = 1

# dialogue the-warden-below
owner = the-warden-below

node at-the-cells:
  when: always
  sticky
  He turns from the singing and finds you standing in a passage that was supposed to be empty. He does not hurry. "And whose are you?"
  roll: sent-to-jail

# entity the-warden-eating
title: The Warden
examine: A broad man at the end of the long table with a paper of doughnuts open in front of him, eating them in order.
hidden if: not stat.warden-away = 2

# dialogue the-warden-eating
owner = the-warden-eating

node at-the-table:
  when: always
  sticky
  He does not look up from the doughnuts until he has finished the one he is on. "You are not one of mine." A pause. "You will be."
  roll: sent-to-jail

# entity cell-door
title: Cell Door
examine: Bars, a frame, and a lock that was fitted to the frame after the frame was fitted to the wall, by a different hand.
stats: npc-thieving-difficulty 30, npc-thieving-xp 8, npc-thieving-damage 1
uses: pick-the-door
pick-the-door:
  hidden if: cell-open
  set: cell-open
  set: on-the-run
  say: The lock has been picked before and it remembers how. The door swings in an inch, stops against the bucket, and you go out sideways round it.
  relocate: jail-cells
  +on attempts exhausted:
    say: The pick catches, and the singing in the next cell stops for a moment, and then starts again louder, which is either kindness or the opposite.

# entity cheerful-drunk
title: A Cheerful Drunk
examine: A man on the bench of the next cell with his boots off and his hands behind his head, singing to the ceiling.

# dialogue cheerful-drunk
owner = cheerful-drunk

node free-lodging:
  always
  ask: What are you in for?
  again: "Still here," he says, pleased about it. "Still free."
  "In for? I am not in for anything. I am in." He counts on his fingers. "Roof. Bench. Two meals, one of them warm. A man to lock the door so nobody comes in. And they think it is a punishment." He laughs until he coughs. "I have paid for worse rooms than this. I have paid for worse rooms this week."
  "Sunny barred me, you know. Sunny. Twenty years I have drunk in there. So I came round the back of the barracks and sang until they took me in, and I will sing again when they let me out."

node the-racket:
  when: not stat.warden-away >= 1
  ask: Could you make some noise?
  again: "Again?" He is already drawing breath.
  "Noise?" He sits up. "Friend, I have been asked to shut up in six counties. Nobody has ever asked me the other thing." He takes a breath that goes all the way down.
  inflict: the-warden-is-downstairs for 5m
  The first verse brings a door open upstairs. The second brings boots on the stair, heavy ones, and a voice you have not heard before telling him he will lose the bench if he does not stop. He does not stop. @@@ asked for the warden to send anybody he finds in a room with him back to the cells; nothing in the grammar fires on a player entering a room, so he does it to anybody who speaks to him, and the way past him is to not

# dialogue tulsa.guardsman
node escaped:
  when: on-the-run
  sticky
  He looks at you, then at the stair. "You are the one from downstairs." He does not seem angry so much as tired. "Come on, then."
  roll: sent-to-jail

# dialogue tulsa.mott
node the-wardens-order:
  when: heard-about-the-doughnuts
  sticky
  ask: About the warden's doughnuts.
  "Him." Mott does not stop what he is doing. "Two papers a day, up to the lock-up, and the boy carries them. Best customer I have got and I have never once seen him."
  -> Send one up now. I will pay. (when inventory.core.coin >= 20)
    take: 20 core.coin
    inflict: the-warden-is-at-his-doughnuts for 5m
    say: Mott looks at the coin, then at you, and does not ask. "Boy!" The paper is out of the door before the sugar has settled on it. "He will be down in the mess for that. He always is. Eats them where the lads can see."
  -> Never mind.
    say: Mott shrugs and goes back to the flour.

# location back-alley
x: 7, y: 2
title: The Alley Behind Tavern Street
examine: A gap between the backs of two houses, wide enough for one and used by fewer. Crates stacked at the far end, and the far end does not go anywhere.
adjacent:
  tulsa.tavern-street
entities:
  lurking-man, coat-of-pockets

# location tulsa.tavern-street
+adjacent: back-alley

# location widows-house
x: 6, y: -1
title: The Widow's House
examine: One room downstairs with a stair in the corner of it, a table laid for one, and a front door with a bar across the inside that is thicker than the door.
adjacent:
  tulsa.well-lane
  widows-cellar
entities:
  widows-door-inside, the-widow-inside

# location widows-yard
x: 6, y: -2
title: The Widow's Yard
examine: A strip of yard behind the house on the corner: a water butt, a cellar door set flat into the ground, and a window at the back of the house.
adjacent:
  tulsa.well-lane
  widows-cellar while widows-cellar-open
entities:
  back-window, latched-window, cellar-door, cellar-new-lock

# location widows-cellar
below widows-house
title: The Widow's Cellar
examine: Low, dry, and emptier than a cellar under a house this old ought to be. A stair goes up to the room above.
adjacent:
  widows-house
  widows-yard

# location tulsa.well-lane
+adjacent: widows-house while widows-door-open, widows-yard
+entities: the-widow-at-the-door, widows-door, widows-new-lock

# location tulsa.doss-house
-adjacent: tulsa.rogue-den
+entities: den-hatch

# location run-blades
x: 4, y: 3, z: -1
title: The First Passage
examine: A passage off the back of the den, lit at the far end and not at this one.
entities:
  the-blades, the-rope

# location run-boulder
x: 5, y: 3, z: -1
title: The Second Passage
examine: A passage that climbs, and the sound of something settling in timber at the top of it.
entities:
  the-boulder, the-rope

# location run-fire
x: 6, y: 3, z: -1
title: The Third Passage
examine: A short passage, warmer than the last, with a smell of oil in it.
entities:
  the-fire, the-rope

# location run-pit
x: 7, y: 3, z: -1
title: The Fourth Passage
examine: A passage that ends in the dark before the lamp does.
entities:
  the-pit, the-rope

# location run-door
x: 8, y: 3, z: -1
title: The End of the Run
examine: A square of floor in front of a plain door, and a glass in a bracket beside the door.
entities:
  the-last-door, the-rope

# location lock-up
x: 2, y: -4
title: The Lock-Up
examine: The front room of the town's jail, behind the barracks: a desk, a stove, a stair going up to a door with a name painted on it, a stair going down, and a passage through to where the guard eats.
adjacent:
  tulsa.guard-barracks while not on-the-run
  jail-cells
  jail-mess
entities:
  jailer, street-door, wardens-door

# location tulsa.guard-barracks
+adjacent: lock-up
+entities: pay-chest

# location jail-cells
x: 2, y: -5, z: -1
title: The Cells
examine: A brick passage under the lock-up with four doors off it, three of them standing open. Somebody in the fourth is singing.
adjacent:
  lock-up
  jail-cell while cell-open
entities:
  cheerful-drunk, the-man-from-the-alley, the-warden-below

# location jail-cell
x: 1, y: -5, z: -1
title: Your Cell
examine: Brick on three sides and bars on the fourth, a bench, a bucket, and a lock on the door that has been picked before by the look of the scratches round it.
adjacent:
  jail-cells while cell-open
entities:
  cell-door, cheerful-drunk

# location jail-mess
x: 1, y: -4
title: The Guards' Mess
examine: A long table with benches, a hatch through to a kitchen, and the smell of whatever was on yesterday.
adjacent:
  lock-up
entities:
  the-warden-eating, 2 tulsa.guardsman

# location wardens-office
above lock-up
title: The Warden's Office
examine: A desk under the window, a chair that has been sat in a great deal, a shelf of ledgers, and an iron box on the floor with its own lock.
entities:
  the-warden, wardens-lockbox, office-door-inside

# location tulsa.market-square
+entities: market-watch, pear-cart, bess, street-urchins

# location tulsa.castle-quarters
+entities: jewellery-box

# location tulsa.sha-dynastys
+entities: tavern-lockbox

# save at-the-alley-mouth
{"version":13,"location":"tulsa.tavern-street","xp":{"thieving.thieving":1382}}

# save on-well-lane-with-a-purse
{"version":13,"location":"tulsa.well-lane","inventory":{"core.coin":1100},"xp":{"thieving.thieving":1382}}

# save in-the-square-with-a-light-purse
{"version":13,"location":"tulsa.market-square","inventory":{"core.coin":300}}

# save in-the-square-with-a-full-purse
{"version":13,"location":"tulsa.market-square","inventory":{"core.coin":400},"xp":{"thieving.thieving":1382}}

# save in-the-lock-up-owed-a-purse
{"version":13,"location":"thieving.lock-up","inventory":{"core.coin":40},"xp":{"thieving.thieving":5345},"bundles":{"thieving.confiscated":{"stacks":{"core.coin":200},"copies":[]}}}

# save in-the-den-at-the-bell
{"version":13,"location":"tulsa.rogue-den","xp":{"thieving.thieving":30000},"flags":{"thieving.knows-the-den":true,"thieving.has-the-word":true}}

# test lookout-kept-watch-and-found-him
load: at-the-alley-mouth
travel: back-alley
talk: lurking-man
choose: Go on, then. I will watch the street.
assert: lookout.kept-watch
travel: tavern-street
travel: market-square
travel: kings-road
talk: guardsman
choose: continue
goto: tulsa.rogue-den
talk: the-lurker
choose: continue
assert: the-lurker.found-me.visits = 1

# test lookout-turned-him-in-and-he-blames-you
load: at-the-alley-mouth
travel: back-alley
talk: lurking-man
choose: Not for me.
assert: lookout.thinking-it-over
travel: tavern-street
travel: market-square
travel: kings-road
talk: guardsman
choose: continue
assert: lookout.turned-him-in
goto: jail-cells
talk: the-man-from-the-alley
choose: It was not me.
assert: the-man-from-the-alley.sour.visits = 1

# test locked-out-by-the-front-door-and-down-the-hatch-on-the-word
lock-pools
load: on-well-lane-with-a-purse
talk: the-widow-at-the-door
choose: I will get you in.
assert: locked-out.getting-in
use: entity.widows-door.pick-the-door until widows-house.touched
assert: widows-door-open
assert: locked-out.let-in
travel: well-lane
talk: the-widow-at-the-door
choose: Thank you.
assert: locked-out.gone
assert: knows-the-den
assert: has-the-word
travel: doss-house
use: entity.den-hatch.give-the-word
assert: tulsa.rogue-den.touched
assert: inventory.core.coin = 1100

# test locked-out-through-the-cellar-after-the-guard-and-a-thousand-at-the-hatch
lock-pools
load: on-well-lane-with-a-purse
talk: the-widow-at-the-door
choose: The guard can deal with it.
assert: locked-out.fetching-a-guard
travel: swamp-edge
talk: guardsman
choose: Here is twenty-five.
assert: locked-out.let-in-by-the-guard
assert: inventory.core.coin = 1075
travel: well-lane
travel: widows-yard
use: entity.cellar-new-lock.pick-the-door until widows-cellar.touched
assert: widows-cellar-open
travel: widows-house
use: entity.widows-door-inside.lift-the-bar
assert: widows-door-open
talk: the-widow-inside
choose: I got in, did I not?
assert: locked-out.told-coldly
assert: knows-the-den
assert: not has-the-word
travel: well-lane
travel: doss-house
use: entity.den-hatch.pay-your-way-down
assert: tulsa.rogue-den.touched
assert: inventory.core.coin = 75

# test the-back-window-is-the-third-way-in
load: on-well-lane-with-a-purse
talk: the-widow-at-the-door
choose: I will get you in.
travel: widows-yard
use: entity.back-window.climb-in
assert: widows-house.touched
use: entity.widows-door-inside.lift-the-bar
assert: locked-out.let-in

# test the-urchins-learn-from-a-hand-that-has-done-it
lock-pools
load: in-the-square-with-a-full-purse
use: entity.market-watch.wait-for-them-to-move-on
assert: stat.watch-gap >= 1
use: entity.pear-cart.lift-from-the-stall until fruit-stolen >= 1
cancel
talk: street-urchins
choose: Watch. This is how it is done.
assert: the-fruit-stall.taught

# test the-urchins-are-fed-out-of-the-pack
load: in-the-square-with-a-full-purse
shop: pear-cart
submit-modal: item=more:buy:thieving.pear
submit-modal: count=30
submit-modal: item=close
travel: market-row
shop: fruit-stall
submit-modal: item=more:buy:thieving.apple
submit-modal: count=40
submit-modal: item=close
travel: market-square
wait: 300
shop: pear-cart
submit-modal: item=more:buy:thieving.pear
submit-modal: count=30
submit-modal: item=close
assert: inventory.pear = 60
assert: inventory.apple = 40
talk: street-urchins
choose: Here. Twenty pears.
talk: street-urchins
choose: Here. Twenty pears.
talk: street-urchins
choose: Here. Twenty apples.
talk: street-urchins
choose: Here. Twenty apples.
talk: street-urchins
choose: Here. Twenty pears.
assert: fruit-given >= 100
assert: the-fruit-stall.fed

# test caught-under-the-watch-until-the-purse-goes-up-and-you-go-down
unkillable
load: in-the-square-with-a-light-purse
use: entity.pear-cart.lift-from-the-stall until jail-cell.touched
assert: times-caught >= 3
assert: inventory.core.coin = 0
assert: count.confiscated >= 1
use: entity.cell-door.pick-the-door until cell-open
assert: on-the-run
travel: lock-up
travel: guard-barracks
refused
talk: jailer
assert: jail-cell.touched and not cell-open

# save on-the-run-at-the-desk
{"version":13,"location":"thieving.lock-up","xp":{"thieving.thieving":30000},"flags":{"thieving.on-the-run":true,"thieving.cell-open":true}}

# test the-street-door-is-the-way-out-and-the-street-forgets-you
load: on-the-run-at-the-desk
travel: guard-barracks
refused
use: entity.street-door.slip-past until guard-barracks.touched
assert: not on-the-run
travel: lock-up
travel: guard-barracks

# test doughnuts-draw-the-warden-to-the-mess-and-the-purse-comes-home
lock-pools
load: in-the-lock-up-owed-a-purse
talk: jailer
choose: continue
assert: heard-about-the-doughnuts
travel: guard-barracks
travel: castle-gate
travel: market-square
travel: market-row
travel: kiln-lane
travel: motts-house
talk: mott
choose: Send one up now. I will pay.
assert: stat.warden-away = 2
assert: inventory.core.coin = 20
travel: kiln-lane
travel: market-row
travel: market-square
travel: castle-gate
travel: guard-barracks
travel: lock-up
use: entity.wardens-door.pick-the-door until wardens-office.touched
assert: wardens-door.unlocked
use: entity.wardens-lockbox.pick-the-lock until count.confiscated < 1
cancel
assert: inventory.core.coin = 220
use: entity.office-door-inside.let-yourself-out
assert: not wardens-door.unlocked
assert: lock-up.touched

# test a-racket-in-the-cells-draws-the-warden-down
load: in-the-lock-up-owed-a-purse
travel: jail-cells
talk: cheerful-drunk
choose: cheerful-drunk.the-racket
choose: continue
assert: stat.warden-away = 1
talk: the-warden-below
assert: jail-cell.touched and not cell-open

# test the-initiation-pays-the-word-and-the-hood
lock-pools
load: in-the-den-at-the-bell
use: entity.the-far-door.ring-the-bell
assert: stat.initiation-clock >= 1
assert: run-blades.touched
use: entity.the-blades.cross until run-boulder.touched
use: entity.the-boulder.cross until run-fire.touched
use: entity.the-fire.cross until run-pit.touched
use: entity.the-pit.cross until run-door.touched
use: entity.the-last-door.go-through
assert: initiated
assert: has-the-word
assert: has rogues-hood
assert: tulsa.rogue-den.touched
assert: not stat.initiation-clock >= 1

# guise picked-townsman
examine: Somebody about their day, patting at their belt for a purse that is not there any more, already deciding they must have left it at home.
without: pick-pocket

# guise picked-guardsman
examine: One of the duke's, in a coat of plates and a worse mood than before, one hand checking an empty pocket as though it might change its mind.
without: pick-pocket

# guise picked-knight
examine: Iron from the crown of his head to the soles of his feet, and a hand gone still at his belt where something used to hang.
without: pick-pocket

# guise picked-thief
examine: A cloaked figure with the blade put away for once, one glove checking a pocket that was full a moment ago and is not now.
without: pick-pocket

# guise picked-duke
examine: The duke of Tulsa, a hand resting a moment too long where a ring used to sit, and volunteering nothing about that either.
without: pick-pocket
