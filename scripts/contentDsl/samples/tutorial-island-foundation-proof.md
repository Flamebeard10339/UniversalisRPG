# info
id: tutorial-island-foundation-proof
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island

# advanced
{
  "stats": [{ "id": "thieving", "base": 6 }],
  "locale": {
    "stat.thieving.title": "Thieving",
    "stat.thieving.description": "Power applied to locks and sleight of hand."
  }
}

# item gold

# item lockpick

# item note
title: Handwritten Note
description: A note in someone else's hand, tossed onto a shelf.
read: [[dialogue note]]

# item cooked-shrimp
tags: food, +3 regeneration, 60s

# item iron-dagger
tags: mainhand (1 attack), +3 attack

# dialogue note
start: It reads: remember to tell them about the Quests tab, remember to explain the colors, and remember to unlock the door before they leave.

# quest leave-tutorial-island
title: Leave Tutorial Island

stage accept: quest-accepted
  You have not taken on a task yet. Someone in this house looks like they know the island — try talking to them.

stage leave-house: miki-cleared
  Miki the tutorial guide has tasked you with finding a way off of tutorial island. Step one is probably to leave his house.

stage visit-bank: bank-visited
  You have made it outside. Word is there is a bank somewhere along the coast — worth a look before you go much further.

stage clear-mining: mining-cleared
  The bank is behind you now. Something below the island — through that trapdoor — is worth investigating.

stage clear-combat: combat-cleared
  You have got gear from the cave. Somewhere further in, Denzel mentioned voices — that is probably where you are headed next.

stage complete: reached-mainland
  Whatever is holding the mainland back from you will not last much longer. Keep pushing.
