// Thieving — taking things off people who are still using them, and out of boxes that are still
// locked.
//
// Every theft is one contest between two things: the player's `thieving` on one side and how hard
// the mark is on the other, carried on the mark's own sheet the way a water carries its depth. That
// contest is the same contest every time it is taken: a caught hand stops the hand for three seconds
// and it does not leave the next attempt harder than the first one was. A lock that loses puts the
// player outside, which is the same idea with a longer walk.
//
// One skill, two verbs. A pocket and a lock are not one mechanic, because what they cost when they
// go wrong is not the same thing — a hand caught in a pocket is a daze on the spot, and a hand
// caught in somebody's chest is the owner putting you on the step. So there are two `# action`s
// here and every mark in the world hangs off one of them, declaring only what is its own.
//
// What is here is the skill itself: what it is measured in, the two hands, what a caught one costs,
// and what comes out of a box. Who is worth stealing from is the town's, because a townsman is
// somebody two skills both have a use for and only the region can see both of them.

# info thieving
version: 1.0.0
pack: skills
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
//
// Ten seconds to a hand. Thirty a minute was a hand in a pocket every two seconds,
// which is not a thing anybody does to a crowd that is standing right there, and it
// is half of what put the skill twenty-three times over what the curve asks; the
// `xp:` on each mark is the other half.
# stat thieving-rate
title: Thieving Speed
base: 6
group: core.skilling

// How much of somebody's grip a thief shrugs off. Nothing reads this yet: a buff's duration is a
// literal and no result in the language reads a stat where a number stands, which is the wall
// `collared` names below and the one `fishing.bait-persistance` hits from the other side. One
// engine feature is under both.
# stat daze-resistance
title: Nerve
group: core.skilling

// The mark's half of the contest, and no player ever carries either: how much attention somebody is
// paying, and how good a lock is. Two rather than one because the two hands are two, and a chest is
// not watchful the way a townsman is — a number that had to mean both would mean neither.
# stat vigilance
title: Vigilance
group: core.other

# stat wards
title: Wards
group: core.other

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

// --- the two hands ---
//
// Every mark hangs off one of these the way every water hangs off `fishing.cast`: `my` reads off the
// thief and `their` off whatever is being robbed, so one block is a townsman and a treasure chest
// both. A mark declares its own sheet — how watchful it is, or how good its lock is — and, in the
// block it overlays, what comes off it, what that is worth, and what it says when it beats you.
// Nothing else is a mark's business, and a sixth one is those lines and no others.
//
// What a caught hand costs in health, and where a lock puts you when it throws you out, are the
// mark's rather than the hand's: a knight hits harder than a townsman and a cellar is a longer walk
// back than a front room. So the daze is here, because it is the same three seconds everywhere, and
// the drain and the walk are written where they differ.

# action pick-their-pocket
title: Pick Their Pocket
continuous
attempts: 1
rate: my thieving-rate
accuracy: my thieving vs their vigilance
on unfinished:
  inflict: dazed

# action pick-the-lock
title: Pick The Lock
continuous
attempts: 1
time: 6
accuracy: my thieving vs their wards

// A hand caught by somebody who does this for a living, and the reason the daze above is the floor
// rather than the whole of it: an action's `on unfinished:` is inherited by every mark and can only
// be added to, so a harder mark holds you as well rather than instead.
# item collared
title: Collared
examine: Somebody has a fistful of your collar and is deciding what to do about it. @@@ asked for a `daze-resistance` stat that shortens how long this lasts, and for the length to differ per mark rather than per item. A buff's duration is written on the buff as a literal and nothing in the language reads a stat there, so two tiers of hold is the whole of what can be said — which is the same wall the Angler's Knot hits from the other side. One feature is under both: a number inside a result that can read a stat.
10s, -90% core.attack-rate, -100% thieving-rate

// --- what a thief wears ---
//
// The kit is the whole of what a levelled hand has that a beginner does not, since the pockets ask
// for no tool at all: a townsman is robbed with a hand and the strongbox under the doss house is
// not. The picks are the one piece worn long enough to be worth spending points on, which is why
// they are the pair with a plane in them.

# item lockpicks
title: Lockpicks
examine: A roll of them in oiled cloth, filed thin, and every one of them shaped for a lock somebody has already met.
slot: mainhand
requires: level.thieving >= 10
value: 180
item-level: 8-14
tools, +8 thieving

# item fingerless-gloves
title: Fingerless Gloves
examine: Cut back to the second knuckle, so the ends of your fingers are yours and the backs of your hands are nobody's business.
slot: gloves
value: 45
item-level: 3-6
tools, +4 thieving

# item soft-toed-boots
title: Soft-Toed Boots
examine: Felt over the toe and no nails in the sole. They are no use in a fight and they are silent on a stair.
slot: boots
value: 60
item-level: 3-6
tools, +4 thieving

// --- what a pair of picks can be grown into ---

# passive light-fingers
tools, +3 thieving

# passive unhurried
tools, +1 thieving-rate

# passive nerveless
tools, +4 thieving

# cluster-jewel a-quiet-hour
examine: The habit of being somewhere for an hour and leaving nothing behind that says you were.
shape: ring
open-connections: e
passives: 1 light-fingers, 2 unhurried, 3 nerveless, 4 light-fingers, 5 unhurried, 6 nerveless

# item a-quiet-hour-jewel
title: A Quiet Hour
examine: A blank iron token on a thong, worn shiny. Whoever carried it was not in a hurry about anything.
cluster-jewel: a-quiet-hour
value: 260

// The token above is the generalist and it is also behind a level-14 lock, so until now a thief in
// the first band could build nothing at all. The three below are the ways of being a particular
// thief: the hand that is never caught, the one that does not mind being caught, and the one that
// comes away with more.

# passive quick-fingers
tools, +2 thieving-rate

# passive practised-lift
tools, +12% thieving

# cluster-jewel a-light-touch
examine: Out before the coat has finished moving.
shape: ring
open-connections: e
passives: 1 light-fingers, 2 quick-fingers, 3 nerveless, 4 practised-lift, 5 quick-fingers, 6 light-fingers

# item a-light-touch-jewel
title: A Light Touch
examine: A sliver of horn worn to the shape of a fingertip that is not yours.
cluster-jewel: a-light-touch

// Health and recovery are combat's stats and they are a thief's too: what a caught hand costs is a
// drain and ten seconds of somebody's fist, and the thief who can stand that robs the marks nobody
// else will go near. The daze passives below grant a stat nothing reads yet -- see `collared`.

# passive thick-skinned
tools, +12 core.max-health

# passive steady-nerve
tools, recovery, +1 core.regeneration

# passive brazen
tools, +2 daze-resistance

# passive hard-faced
tools, +5 daze-resistance

# cluster-jewel a-cold-nerve
examine: Being caught is a cost like any other, and he has costed it.
shape: wheel
open-connections: e, nw
passives: 1 thick-skinned, 2 brazen, 3 steady-nerve, 4 hard-faced, 5 thick-skinned, 6 steady-nerve, 7 nerveless

# item a-cold-nerve-jewel
title: A Cold Nerve
examine: A knuckle-bone, drilled. It is not the owner's own and he was not shy about saying so.
cluster-jewel: a-cold-nerve

// Two positions and no way on. `core.luck` is the drop channel, contested like any other roll, so
// this moves what comes off a mark without any table knowing it exists.

# passive good-eye
tools, +6-12 core.luck

# passive practised-fence
tools, +10 core.luck

# cluster-jewel a-fences-eye
examine: Knowing which pocket is worth the hand before the hand goes out.
shape: spindle
open-connections: e
passives: 1 good-eye, 2 practised-fence

# item a-fences-eye-jewel
title: A Fence's Eye
examine: A jeweller's loupe with the lens gone milky. It was not the lens he was using.
cluster-jewel: a-fences-eye

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

// What is in the one box the rogues keep for themselves: better stones than a house has, the two
// pieces of kit that are not for sale anywhere in Tulsa, and, once in a while, the jewel.
# droptable strongbox-contents
one of:
  9x: give: 1 sapphire
  6x: give: 1 ruby
  4x: give: 1 soft-toed-boots
  2x: give: 1 fingerless-gloves
  1x: give: 1 a-quiet-hour-jewel
  1x: give: 1 a-cold-nerve-jewel
