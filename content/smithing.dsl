// Smithing — everything the town wears that is made of metal, made rather than found.
//
// A smith needs three things and the recipes below say so in the only way the language has: the
// station, the bar, and the hammer. The hammer is an input *and* an output of every recipe here,
// which is how a tool that is required but not consumed is written — you cannot work without one
// and you never lose one.
//
// What gates the ladder is coin rather than a level: bars are bought, and iron costs more than twice
// what bronze costs. The `smithing` stat is the cadence every recipe here runs at, so a smith who
// has been smithing works visibly faster than one who has not.

# info smithing
version: 1.0.0
dependencies:
  core
  combat

// Thirty a minute is one piece every two seconds at the start and one a second by twenty, which is
// what the levels buy: nothing here can be failed, so what improves is how fast the pile goes down.
# stat smithing
title: Smithing
base: 30
group: core.skilling

# skill smithing
title: Smithing
stat: smithing


# item hammer
title: Hammer
examine: A smith's hammer, the face of it polished by the work. It is what you hold, not what you spend.
value: 15

# item bronze-bar
title: Bronze Bar
examine: A finger of bronze, cast and cooled and stamped at one end.
value: 20

# item iron-bar
title: Iron Bar
examine: Grey and heavier than the bronze, and it does not want to be shaped.
value: 45

// --- the forge counter ---

# shop forge-supplies
coin: core.coin
stocks:
  4 hammer
  200 bronze-bar
  200 iron-bar
replenish: 5m

# entity forge-counter
title: Forge Counter
examine: A bench along the wall of the shop with bar stock racked under it and a slate above with prices somebody has stopped rubbing out.
keeps shop: forge-supplies

// --- bronze ---

# recipe bronze-dagger
station: anvil
in: 1 bronze-bar, 1 hammer
out: 1 combat.bronze-dagger, 1 hammer
skill: smithing 20
rate: smithing
say: You draw the bar out to a point and put an edge on both sides of it.

# recipe bronze-helmet
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-helmet, 1 hammer
skill: smithing 25
rate: smithing
say: You raise the bowl of it out of one piece, which is the part that takes the practice.

# recipe bronze-platelegs
station: anvil
in: 3 bronze-bar, 1 hammer
out: 1 combat.bronze-platelegs, 1 hammer
skill: smithing 40
rate: smithing
say: Plate, skirt and hinge, and the hinge is the half of it that matters.

# recipe bronze-platebody
station: anvil
in: 4 bronze-bar, 1 hammer
out: 1 combat.bronze-platebody, 1 hammer
skill: smithing 45
rate: smithing
say: Front and back, laced at the sides, and it takes the whole afternoon.

// --- iron ---

# recipe iron-dagger
station: anvil
in: 1 iron-bar, 1 hammer
out: 1 combat.iron-dagger, 1 hammer
skill: smithing 50
rate: smithing
say: The iron argues the whole way and gives you a better blade for it.

# recipe iron-helmet
station: anvil
in: 2 iron-bar, 1 hammer
out: 1 combat.iron-helmet, 1 hammer
skill: smithing 62
rate: smithing
say: You cut the slot last, because everything else is easier while you can still see the work.

# recipe iron-platelegs
station: anvil
in: 3 iron-bar, 1 hammer
out: 1 combat.iron-platelegs, 1 hammer
skill: smithing 100
rate: smithing
say: You leave the knee loose enough to walk in, which is not how it is usually done.

# recipe iron-platebody
station: anvil
in: 4 iron-bar, 1 hammer
out: 1 combat.iron-platebody, 1 hammer
skill: smithing 112
rate: smithing
say: Riveted plate over a padded coat, and every rivet is one you set yourself.

// The one thing here that is a piece of work rather than a piece of stock: ten bars of iron and
// nothing else in the game costs that. It is also the only way a Knight's Sword ever exists.
# recipe knights-sword
station: anvil
in: 10 iron-bar, 1 hammer
out: 1 combat.knights-sword, 1 hammer
skill: smithing 500
rate: smithing
say: You take the whole day over it, and at the end of the day there is a sword on the anvil that somebody could be knighted with.
