# info the-grumpy-crafter
version: 0.1.0
pack: quests
dependencies:
  core
  combat
  tulsa

# flag needled-the-crafter
# flag jewels-given
# flag self-socketed

# entity grumpy-crafter
title: Wick
faction: world
examine: A crafter with good hands and no shop to put them behind, working a whetstone that has nothing on it worth sharpening.
keeps shop: grumpy-crafters-stall

# location tulsa.market-row
+entities: grumpy-crafter

# quest wicks-stall
title: The Grumpy Crafter
log: There is a crafter in the market row with nowhere to sell what he makes, and he has a great deal to say about whose fault that is.

stage the-want:
  log: A crafter named Wick stands in the market row with no stall of his own, and he is furious about it in a way that does not seem to be about the row.
  grumpy-crafter says:
    always
    sticky
    ask: You look ready to put someone through a wall.
    "A wall would at least hold still." He does not stop working the stone, though there is nothing on its edge that needs it. "You want something, or are you just going to stand there being looked at."
    Behind him the row goes on the way it always does: the general store, the woodcutter's rack, and past that the forge, cold on and off since the old man died and the whole of it went to his son. Wick has not forgiven the town for choosing the boy, and has not forgiven the boy for being chosen either.
    -> "The shop was never going to be yours, was it?"
      say: He sets the stone down carefully, which is worse than if he'd thrown it. "Wasn't it. I stood at that anvil eleven years. I know its temper better than he knows his own father's hand, and none of that is on the deed. The deed asks whose name the old man wrote down, and he didn't write down mine." He picks the stone back up. "Anything else you wanted to get into?"
      set: needled-the-crafter
    -> "Is he really that bad at the work?"
      say: "Bad?" He laughs, short and not kind. "He's careful, and in ten years he'll be good, and neither of those is the point. The point is he has a roof over his forge and I have a stone with nothing to put an edge on. You want to tell me that's fair, or was that the whole question?"
      set: needled-the-crafter
    -> What do you actually need?
      say: "Now that's a question worth answering." He sets the stone down for good this time. "Publicity — my name in front of people who buy things, since the row's forgotten I make them. Stock — jewels, and something to put them in, since I've sold off most of what I'd have shown you. And somewhere to stand, since a crafter without a stall is just a man muttering at a stone." He looks at you properly, for the first time. "Bring me those and I'll show you something worth knowing while I'm at it."
      goto the-work

stage the-work:
  log: Wick wants three jewels for stock, and to look over a bronze platebody, a pair of bronze boots and a bronze dagger before he'll say the rest. Bring the rings to him directly; carry the bronze and he'll size it up himself.
  done when: jewels-given >= 2 and has combat.keen-edge-jewel and has combat.bronze-platebody and has combat.bronze-boots and has combat.bronze-dagger
  goto the-lesson
  grumpy-crafter says:
    always
    sticky
    ask: About the jewels and the bronze.
    "Rings, one at a time, straight into my hand — I'll take three of anything before I'll take none of one. The bronze you can keep on you; I've got eyes, I don't need it handed over to look it up and down."
    -> Hand him a common ring. (when has combat.keen-edge-jewel and jewels-given < 2)
      take: 1 combat.keen-edge-jewel
      add: jewels-given 1
      say: He turns it over once, unimpressed. "Common as a doorknob, this. Every armoury counter in the world has a tray of them." He pockets it anyway. "Still a ring. I'll take three of anything before I'll take none of one."

stage the-lesson:
  log: Wick has the rings and has looked over the bronze. He wants to show me how the last one is set, rather than do it for me.
  grumpy-crafter says:
    always
    ask: About the lesson.
    He looks the platebody over, then the boots, then the dagger, with the same face he'd give a stack of pennies. "Shop bronze, the lot of it. Common as the ring. It'll hold all the same — a base is a base once you're past arguing about the shape of it." He nods at the dagger. "That one you're doing yourself."
    -> "Show me, then."
      say: "A point buys the socket — one connection out of what the plane's got open, and the first step off the middle is the only one that's free. Spend the second point on what the ring itself offers once it's in. That's the whole of it." He pushes your own pack back at you rather than reaching for it himself. "Go on. Open it up."
      open modal: carried-items
      set: self-socketed
      add: jewels-given 1
      say: He watches you close the plane back up without touching it himself. "There. Now you know what I've been doing behind the counter every time somebody hands me a ring, and it isn't magic, whatever the counter at the forge would have you think." He nods at the platebody and the boots, socketed while you were watching him talk rather than while you were watching him work. "Those two are done as well. Now the part you actually agreed to. Take the three round the row and put them in front of people, one each. Not a counter — people. A piece that suits whoever's holding it is worth more to them than one that doesn't, and I'd like the row talking about me for getting that right rather than for getting it wrong."
      goto the-round

stage the-round:
  log: Wick's three pieces are mine to place: a platebody, a pair of boots, a dagger. Three people, three pieces — a piece that suits the buyer is worth more to them than one that doesn't, and a piece that doesn't suit anybody still spends.
  done when: not has combat.bronze-platebody and not has combat.bronze-boots and not has combat.bronze-dagger
  goto the-stall
  grumpy-crafter says:
    always
    sticky
    ask: About the sale.
    "Not sold yet, are you." He does not look up from the stone. "Three pieces, three people. Go on."
  tulsa.guardsman says:
    always
    sticky
    ask: You look like you'd know good plate from bad.
    He looks over what you're carrying the way he looks over most things: slowly, and without much hope of being impressed. "Plate I've a use for. A blade I've already got one of, and it's not going anywhere." He nods at the stall behind you rather than at himself. "Show me the plate, if that's what you've got. I'll not haggle over it."
  tulsa.aggie says:
    always
    sticky
    ask: You look like you spend half your day in the wet.
    She does not put the knife down, or the herring. "Boots, I'll take, and glad of them — my old pair's gone through at the sole and bronze doesn't mind salt water. A hat's no use to a woman stood over a stove all day. Show me the boots and I'll not keep you standing about."
  tulsa.hask says:
    always
    sticky
    ask: You look like you'd know a stave-knife from a table-knife.
    He does not stop tapping the hoop down, and talks around the mouthful of nails held against his lip. "A blade, now, that I could use. Mine's worn to a sliver. Boots I've a houseful of already. Show me the blade and I'll not haggle over it, which for me is close to a compliment."

stage the-stall:
  complete
  grumpy-crafter says:
    when: needled-the-crafter
    always
    ask: About the stall.
    again: The stall stands where he stood before, only with a board over it now. He still glances at the forge more than the customers.
    He hangs a board over the spot he's stood in for weeks and stands back to look at it, which is as close as he comes to looking pleased. "Row'll have to find something else to say about who got what, for a while." He does not thank you outright — that is not a thing he seems to know how to do — but he pushes a tray of stock to the front of the counter where it can be seen from the street, and that is Wick's version of it.
  grumpy-crafter says:
    ask: About the stall.
    again: The stall stands where he stood before, only with a board over it now, and business enough in front of it that he does not have time to grumble at length.
    He hangs a board over the spot he's stood in for weeks and stands back to look at it. "Row'll be talking about somebody else's forge for a change." He looks at you for a moment longer than the sentence needs. "You did that fair, the way you went about it. I noticed. Come back if you're ever carrying something worth putting in front of me."

# item crafters-cap
title: A Crafter's Cap
examine: Plain steel, hammered rather than cast, with none of the shop's polish and all of its purpose.
slot: head
requires: level.attack >= 5
value: 60
item-level: 6-8
armour, +3 core.defense, +35 core.max-health

# item crafters-cuirass
title: A Crafter's Cuirass
examine: Riveted in a pattern Wick swears is his own, though half the row could probably guess it by now.
slot: body
requires: level.attack >= 5
value: 100
item-level: 7-9
armour, +6 core.defense, +55 core.max-health, +10% core.max-health

# item crafters-blade
title: A Crafter's Blade
examine: No maker's mark on it yet. Wick says that's coming, once people start asking who made it.
slot: mainhand
requires: level.attack >= 5
value: 140
item-level: 6-9
weapon, +14 physical-damage

# shop grumpy-crafters-stall
coin: core.coin
stocks:
  3 crafters-cap
  3 crafters-cuirass
  3 crafters-blade
replenish: 120s
hidden if: not wicks-stall.the-stall

# shop guardsmans-eye
coin: core.coin
stocks: combat.bronze-platebody
accepts: stocked
selling: 1.0
hidden if: not wicks-stall.the-round

# entity tulsa.guardsman
keeps shop: guardsmans-eye

# shop aggies-eye
coin: core.coin
stocks: combat.bronze-boots
accepts: stocked
selling: 1.0
hidden if: not wicks-stall.the-round

# entity tulsa.aggie
keeps shop: aggies-eye

# shop hasks-eye
coin: core.coin
stocks: combat.bronze-dagger
accepts: stocked
selling: 1.0
hidden if: not wicks-stall.the-round

# entity tulsa.hask
keeps shop: hasks-eye

# shop a-passing-eye
coin: core.coin
stocks:
  combat.bronze-platebody
  combat.bronze-boots
  combat.bronze-dagger
accepts: stocked
selling: 0.3
hidden if: not wicks-stall.the-round

# entity tulsa.civilian
keeps shop: a-passing-eye

# save at-the-market-row-with-coin
{"version":13,"location":"tulsa.market-row","inventory":{"core.coin":500}}

# save mid-round-with-two-boots
{"version":13,"location":"tulsa.aggies-house","flags":{"wicks-stall.the-want":true,"wicks-stall.the-work":true,"wicks-stall.the-lesson":true,"wicks-stall.the-round":true,"the-grumpy-crafter.jewels-given":3,"the-grumpy-crafter.self-socketed":true},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"combat.bronze-boots","payload":{"roll":0.5,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"combat.bronze-boots","payload":{"roll":0.5,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test the-grumpy-crafter-start-to-finish
load: at-the-market-row-with-coin
travel: tulsa.forge
shop: combat.armoury-counter
submit-modal: item=buy:combat.bronze-dagger
submit-modal: item=buy:combat.keen-edge-jewel
submit-modal: item=buy:combat.keen-edge-jewel
submit-modal: item=buy:combat.keen-edge-jewel
submit-modal: item=buy:combat.bronze-platebody
submit-modal: item=buy:combat.bronze-boots
submit-modal: item=close
travel: tulsa.market-row
talk: grumpy-crafter
choose: What do you actually need?
assert: wicks-stall.the-work
talk: grumpy-crafter
choose: Hand him a common ring.
talk: grumpy-crafter
choose: Hand him a common ring.
assert: jewels-given >= 2
assert: wicks-stall.the-lesson
talk: grumpy-crafter
choose: "Show me, then."
submit-modal: item=close
assert: self-socketed
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with combat.keen-edge-jewel
allocate: 1 at 1,0 position 1
assert: stat.physical-damage > 0
assert: jewels-given >= 3
assert: wicks-stall.the-round
travel: tulsa.market-square
travel: tulsa.castle-gate
shop: guardsmans-eye
submit-modal: item=sell:2
submit-modal: item=close
assert: not has combat.bronze-platebody
travel: tulsa.market-square
travel: tulsa.market-row
travel: tulsa.kiln-lane
travel: tulsa.aggies-house
shop: aggies-eye
submit-modal: item=sell:3
submit-modal: item=close
assert: not has combat.bronze-boots
travel: tulsa.kiln-lane
travel: tulsa.market-row
travel: tulsa.market-square
travel: tulsa.swamp-edge
travel: tulsa.well-lane
travel: tulsa.hasks-house
shop: hasks-eye
submit-modal: item=sell:1
submit-modal: item=close
assert: not has combat.bronze-dagger
assert: wicks-stall.the-stall
travel: tulsa.well-lane
travel: tulsa.swamp-edge
travel: tulsa.market-square
travel: tulsa.market-row
talk: grumpy-crafter
assert: inventory.core.coin > 0

# test needling-wick-does-not-stop-the-quest
load: at-the-market-row-with-coin
talk: grumpy-crafter
choose: "The shop was never going to be yours, was it?"
assert: needled-the-crafter
assert: wicks-stall.the-want
assert: not wicks-stall.the-work
talk: grumpy-crafter
choose: "Is he really that bad at the work?"
assert: wicks-stall.the-want
assert: not wicks-stall.the-work
talk: grumpy-crafter
choose: What do you actually need?
assert: wicks-stall.the-work

# test a-boot-sells-at-a-suited-eye-and-at-a-passing-one
load: mid-round-with-two-boots
shop: aggies-eye
submit-modal: item=sell:1
submit-modal: item=close
assert: has core.coin
travel: tulsa.kiln-lane
travel: tulsa.market-row
shop: a-passing-eye
submit-modal: item=sell:2
submit-modal: item=close
assert: not has combat.bronze-boots
