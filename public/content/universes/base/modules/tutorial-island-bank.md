# info
id: tutorial-island-bank
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island
dependencies: tutorial-island-survival

# location tutorial-bank
x: 3, y: 0
title: Island Bank
description: A tidy counter and an open trapdoor share the room.
exhausted: The teller returns to sorting coins.
tutorial settlement

## entity bank-teller
title: Bank Teller
talk:
  set: tutorial.bank-visited
  [[dialogue bank-teller]]

## entity trapdoor
title: Trapdoor
examine: A ladder disappears into the dark below. Someone left it open on purpose.

# dialogue bank-teller
start (bank-teller): Afternoon. Haven't seen you before — first time at a bank?
  -> How does this work? [[explain]]
  -> Show me. [[show-vault]]

[[explain]] (bank-teller): Every bank shares one account, anywhere in the world — deposit here, withdraw anywhere. Your pack only holds so many different kinds of things at once, so once it fills up, this is where the rest goes. You've already got a little gold sitting in yours.
  -> Show me. [[show-vault]]
  -> Not right now. [[not-now]]

[[show-vault]] (bank-teller): Here you go — have a look.
  open modal: bank

[[not-now]] (bank-teller): Come back whenever. The vault is not going anywhere.
