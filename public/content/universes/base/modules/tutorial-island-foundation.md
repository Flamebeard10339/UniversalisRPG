# info
id: tutorial-island-foundation
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island
dependencies: tutorial-island-reset

# advanced
{
  "stats": [
    { "id": "fishing", "base": 6 },
    { "id": "cooking", "base": 6 },
    { "id": "thieving", "base": 6 },
    { "id": "smithing", "base": 6 },
    { "id": "movement-speed", "base": 60 }
  ],
  "skills": [
    { "id": "fishing", "maxLevel": 100, "statId": "fishing" },
    { "id": "cooking", "maxLevel": 100, "statId": "cooking" },
    { "id": "thieving", "maxLevel": 100, "statId": "thieving" },
    { "id": "smithing", "maxLevel": 100, "statId": "smithing" }
  ],
  "flags": [
    { "id": "tutorial.miki-cleared", "initialValue": false },
    { "id": "tutorial.bridge-open", "initialValue": false },
    { "id": "tutorial.gommi-asleep", "initialValue": false },
    { "id": "tutorial.bank-visited", "initialValue": false },
    { "id": "tutorial.mining-cleared", "initialValue": false },
    { "id": "tutorial.combat-cleared", "initialValue": false },
    { "id": "tutorial.cage-locked-by-orloth", "initialValue": false },
    { "id": "tutorial.reached-mainland", "initialValue": false },
    { "id": "quest.leave-tutorial-island.accepted", "initialValue": false },
    { "id": "tutorial.crate-net-taken", "initialValue": false },
    { "id": "tutorial.crate-bowl-taken", "initialValue": false }
  ],
  "locale": {
    "stat.fishing.title": "Fishing",
    "stat.fishing.description": "Power applied to fishing actions.",
    "stat.cooking.title": "Cooking",
    "stat.cooking.description": "Power applied to cooking actions.",
    "stat.thieving.title": "Thieving",
    "stat.thieving.description": "Power applied to locks and sleight of hand.",
    "stat.smithing.title": "Smithing",
    "stat.smithing.description": "Power applied to smelting and forging.",
    "stat.movement-speed.title": "Movement Speed",
    "stat.movement-speed.description": "How quickly you travel between locations.",
    "skill.fishing.title": "Fishing",
    "skill.fishing.description": "Catching food from open water.",
    "skill.cooking.title": "Cooking",
    "skill.cooking.description": "Turning raw supplies into safer meals.",
    "skill.thieving.title": "Thieving",
    "skill.thieving.description": "Opening what was meant to stay closed.",
    "skill.smithing.title": "Smithing",
    "skill.smithing.description": "Smelting metal and shaping gear.",
    "modulePack.tutorial-island.title": "Tutorial Island"
  }
}

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
