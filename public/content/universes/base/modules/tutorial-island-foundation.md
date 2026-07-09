# info
id: tutorial-island-foundation
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island
dependencies: base-core

# advanced
{
  "locale": {
    "modulePack.tutorial-island.title": "Tutorial Island"
  }
}

# stat mining
base: 0
title: Mining
description: Power applied to mining actions.

# stat smithing
base: 0
title: Smithing
description: Power applied to smelting and forging.

# stat fishing
base: 0
title: Fishing
description: Power applied to fishing actions.

# stat cooking
base: 0
title: Cooking
description: Power applied to cooking actions.

# stat thieving
base: 0
title: Thieving
description: Power applied to locks and sleight of hand.

# stat movement-speed
base: 60
title: Movement Speed
description: How quickly you travel between locations.

# skill mining
title: Mining
description: Reading stone, striking ore, and extracting useful minerals.

# skill smithing
title: Smithing
description: Smelting metal and shaping gear.

# skill fishing
title: Fishing
description: Catching food from open water.

# skill cooking
title: Cooking
description: Turning raw supplies into safer meals.

# skill thieving
title: Thieving
description: Opening what was meant to stay closed.

# flags
tutorial.miki-cleared
tutorial.bridge-open
tutorial.gommi-asleep
tutorial.bank-visited
tutorial.mining-cleared
tutorial.combat-cleared
tutorial.cage-locked-by-orloth
tutorial.reached-mainland
quest.leave-tutorial-island.accepted
tutorial.crate-net-taken
tutorial.crate-bowl-taken

# item gold
title: Gold
description: Small bright coins.

# item lockpick
title: Lockpick
description: A bent bit of metal for impatient doors.

# item note
title: Handwritten Note
description: A note in someone else's hand, tossed onto a shelf.
read: [[dialogue note]]

# item small-net
title: Small Net
description: A net suited to shallow shoals.

# item raw-shrimp
title: Raw Shrimp
description: Fresh and not yet dinner.

# item cooked-shrimp
title: Cooked Shrimp
description: A simple meal that keeps you going.
tags: food, +3 regeneration, 60s

# item herb
title: River Herb
description: A sleepy-smelling green herb.

# item bowl
title: Bowl
description: Cracked, but still useful.

# item uncooked-sleeping-draught
title: Uncooked Sleeping Draught
description: A murky mix that needs heat.

# item sleeping-draught
title: Sleeping Draught
description: A warm draught with a suspiciously calm smell.

# item copper-ore
title: Copper Ore
description: A soft reddish ore.

# item tin-ore
title: Tin Ore
description: A pale chunk of tin-bearing stone.

# item bronze-bar
title: Bronze Bar
description: Freshly smelted bronze.

# item iron-dagger
title: Iron Dagger
description: A sharp shortcut from Denzel's chest.
tags: mainhand (1 attack), +3 attack

# dialogue note
start: It reads: remember to tell them about the Quests tab, remember to explain the colors, and remember to unlock the door before they leave.

# quest leave-tutorial-island
title: Leave Tutorial Island

stage accept: quest.leave-tutorial-island.accepted
  You have not taken on a task yet. Someone in this house looks like they know the island — try talking to them.

stage leave-house: tutorial.miki-cleared
  Miki the tutorial guide has tasked you with finding a way off of tutorial island. Step one is probably to leave his house.

stage visit-bank: tutorial.bank-visited
  You have made it outside. Word is there is a bank somewhere along the coast — worth a look before you go much further.

stage clear-mining: tutorial.mining-cleared
  The bank is behind you now. Something below the island — through that trapdoor — is worth investigating.

stage clear-combat: tutorial.combat-cleared
  You have got gear from the cave. Somewhere further in, Denzel mentioned voices — that is probably where you are headed next.

stage complete: tutorial.reached-mainland
  Whatever is holding the mainland back from you will not last much longer. Keep pushing.
