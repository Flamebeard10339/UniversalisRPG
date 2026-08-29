// Thieving — taking things off people who are still using them, and out of boxes that are still
// locked.
//
// Every theft is one roll weighed between two things: the player's `thieving` on one side and how
// hard the mark is on the other, written as a plain number on the mark's own line. That roll is the
// same roll every time it is taken: a caught hand costs health and stops the hand for three seconds,
// and it does not leave the next attempt harder than the first one was. A lock that loses puts the
// player outside, which is the same idea with a longer walk.
//
// What is here is the skill itself: what it is measured in, what a caught hand costs, and what
// comes out of a box. Who is worth stealing from is the town's, because a townsman is somebody two
// skills both have a use for and only the region can see both of them.

# info thieving
version: 1.0.0
dependencies:
  core
  combat

// The one side of every theft the player brings, and the mark's number is the other side of the same
// total, so the two are in the same units and a point here is worth a point there. Sixty is about
// seven lifts in ten off a townsman with nothing on and no levels, and a mark worth more is a bigger
// number rather than a different rule.
# stat thieving
title: Thieving
base: 60
group: core.skilling

// How often a hand goes out, which is a stat rather than a number on each pocket
// so that something can take it away. A rate that resolves to zero stalls the run
// outright — the bar stops rather than crawls — and that is the whole of what
// being caught is meant to feel like.
# stat thieving-rate
title: Thieving Speed
base: 30
group: core.skilling

# skill thieving
title: Thieving
stat: thieving


// Three seconds of being no use to anybody, which is what a hand caught in somebody's pocket costs.
// A buff is an item the world inflicts rather than one anybody carries, so it is not for sale and
// has no value. The hundred off `thieving-rate` is what stops the hand rather than slowing it: a
// pace of zero is a stalled run, so the three seconds are three seconds of standing there, and the
// whole of what being caught costs is time the player can watch going.
# item dazed
title: Dazed
examine: You are standing very still and hoping the moment passes.
3s, -90% core.attack-rate, -100% thieving-rate

// --- what is worth taking ---

# item polished-buttons
title: Polished Buttons
examine: A dozen of them cut from bone and polished, off a coat that is going to be missing a dozen buttons.
value: 1

# item gold-ring
title: Gold Ring
examine: Thin, plain, and warm from somebody's hand.
value: 5

# item gold-necklace
title: Gold Necklace
examine: A proper chain, heavy enough that whoever owns it will notice tonight.
value: 15

# item coloured-glass
title: Coloured Glass
examine: Cut and faceted and worth exactly what glass is worth, which whoever put it in the chest was counting on.
value: 1

# item topaz
title: Topaz
examine: Gold-brown and clear right through.
value: 25

# item sapphire
title: Sapphire
examine: Blue in the way that only one stone is blue.
value: 50

# item ruby
title: Ruby
examine: It is the size of a thumbnail and it is worth more than the house it was in.
value: 150

# droptable house-chest-contents
one of:
  6x: give: 1 polished-buttons
  3x: give: 1 gold-ring
  1x: give: 1 gold-necklace

# droptable treasure-chest-contents
one of:
  8x: give: 1 coloured-glass
  5x: give: 1 topaz
  3x: give: 1 sapphire
  1x: give: 1 ruby
