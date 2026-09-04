# info smithing
version: 1.0.0
pack: skills
dependencies:
  core

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

