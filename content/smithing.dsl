# info smithing
version: 1.0.0
pack: skills
dependencies:
  core
  combat

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

# recipe bronze-boots
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-boots, 1 hammer
skill: smithing 25
rate: smithing
say: Two shells and a hinge across the instep, and the hinge is the only part anybody notices.

# recipe bronze-shield
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-shield, 1 hammer
skill: smithing 28
rate: smithing
say: You raise the boss out of the middle of it first and work the rest of it flat around that.

# recipe bronze-sword
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 combat.bronze-sword, 1 hammer
skill: smithing 32
rate: smithing
say: A blade, a tang and a guard, and the guard is what makes it a sword rather than a long knife.

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

# recipe iron-boots
station: anvil
in: 2 iron-bar, 1 hammer
out: 1 combat.iron-boots, 1 hammer
skill: smithing 62
rate: smithing
say: Jointed over the instep in five lames, and you walk the shop in them before you call them done.

# recipe iron-shield
station: anvil
in: 2 iron-bar, 1 hammer
out: 1 combat.iron-shield, 1 hammer
skill: smithing 66
rate: smithing
say: Iron over ash, because iron alone that size is a thing nobody could lift twice.

# recipe knights-sword
station: anvil
in: 10 iron-bar, 1 hammer
out: 1 combat.knights-sword, 1 hammer
skill: smithing 500
rate: smithing
say: You take the whole day over it, and at the end of the day there is a sword on the anvil that somebody could be knighted with.

# recipe causeway-jewel
station: anvil
in: 2 bronze-bar, 1 hammer
out: 1 core.causeway-jewel, 1 hammer
skill: smithing 30
rate: smithing
say: You draw the bar out long and true and put nothing on it at all, which is harder than putting something on it.

# recipe crossroads-jewel
station: anvil
in: 3 iron-bar, 1 hammer
out: 1 core.crossroads-jewel, 1 hammer
skill: smithing 110
rate: smithing
say: Five ways out of one stone, and every one of them has to leave it at the same angle or the thing is a lump with notches in it.
