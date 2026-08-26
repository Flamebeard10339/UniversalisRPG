// Fishing — the skill, the water it is practised on, the tackle it is practised with, and the one
// pool in the game that only exists while you are wearing something.
//
// A cast is one roll weighed between two things: your `fishing` on one side and how hard the water
// is on the other, written as a plain number beside it. Winning it puts the fish in your pack;
// losing it costs the line. `line-health` is a real pool with a bar of
// its own, and it is there only because the tackle you are wearing grants `max-line-health` — take
// the tackle off and the pool is not there at all. When it empties, the tackle parts and is gone,
// which is what `on line-parted:` below is.
//
// The fish are not fought and nothing here `depletes:` anybody's pool, deliberately: the engine
// reports damage dealt and damage taken off any action that does, and combat pays its two skills on
// exactly those two moments. A cast that depleted a pool would quietly train a player's arm every
// time they went to the water.

# info fishing
version: 1.0.0
dependencies:
  core

// --- what the skill is measured in ---

// The one side of every cast the player brings. Sixty is a little under four casts in five landing
// at the easiest water and nothing at all at the hardest, which is what makes the tackle worth
// buying before the deep water is worth walking to.
# stat fishing
title: Fishing
base: 60
group: core.knack

// Deliberately without a base, like `max-health`: a player wearing no tackle has no line to lose,
// and `line-health` is not a pool they have at all until something grants this.
# stat max-line-health
title: Line
group: core.upkeep

# resource line-health
title: Line
rate: core.regeneration
max: max-line-health
display: full

# event line-parted
resource: line-health
trigger: on empty

# skill fishing
title: Fishing
stat: fishing


// --- the tackle ---
//
// Two ways to fish and they do not mix. A net is the whole of the low water: one hand, no bait, and
// the net itself is what tears. A rod is the deep water, and there the line in your gloves is what
// holds and what parts, so the rod is bought once and the line is bought over and over.

# item small-fishing-net
title: Small Fishing Net
examine: A hand net on a short pole, mended twice.
slot: mainhand
value: 20
tackle, +3 fishing, +6 max-line-health

# item large-fishing-net
title: Large Fishing Net
examine: A throw net wide enough to need both arms and a running start.
slot: mainhand
requires: level.fishing >= 10
value: 70
tackle, +7 fishing, +12 max-line-health

# item fishing-rod
title: Fishing Rod
examine: Split cane in three pieces, whipped at the joints. It holds no line of its own.
slot: mainhand
value: 45
tackle, +5 fishing

# item dried-fish-bait
title: Dried Fish Bait
examine: Strips of something that was a fish first. One strip to a cast, and the deep water eats them.
slot: offhand
value: 3
tackle, +3 fishing

# item wrigglers
title: Wrigglers
examine: A tin of them, and the lid does not sit flat. Three casts in four, whatever went in the water comes back out of it.
slot: offhand
value: 30
tackle, +5 fishing

# item gut-line
title: Gut Line
examine: Twisted gut, and it smells like it.
slot: gloves
value: 12
tackle, +3 max-line-health

# item braided-fiber-line
title: Braided Fibre Line
examine: Four strands laid against each other so that no one of them ever takes the whole pull.
slot: gloves
value: 40
tackle, +7 max-line-health

# item horsehair-line
title: Horsehair Line
examine: Drawn from one tail, by somebody with a great deal of patience and one horse.
slot: gloves
requires: level.fishing >= 15
value: 120
item-level: 8-14
tackle, +12 max-line-health

// The one piece of tackle that is a trade rather than an upgrade: twice the line to lose and six
// off what you land with. A player who cannot afford to keep replacing line buys this instead.
# item steel-line
title: Steel Line
examine: Wire, honestly. It will outlast the fish and it will spook every one of them first.
slot: gloves
value: 60
tackle, +5 max-line-health, +100% max-line-health, -6 fishing

// --- what comes out of the water ---

# item raw-shrimp
title: Raw Shrimp
examine: Grey and translucent and still flicking.
value: 3

# item raw-anchovies
title: Raw Anchovies
examine: A handful of small silver fish. They do not keep.
value: 4

# item raw-trout
title: Raw Trout
examine: Speckled along the flank, and heavier at one end than you expect.
value: 14

# item raw-salmon
title: Raw Salmon
examine: A proper fish. Carrying it makes you walk differently.
value: 26

// --- the water ---
//
// Four kinds of water and a ladder up them. The two nets take the low water, where nothing is baited
// and nothing is lost but the net; the rod takes the deep, where every cast eats a strip of bait and
// the line is what pays for a miss. What a spot is worth by the minute is its cast rate times what
// it lands times what it pays, and the three are on one line each below.

# entity shrimp-shoal
title: Shrimp Shoal
examine: A dark shifting patch a foot under, moving the way one thing moves.
net the shrimp:
  continuous
  requires: has small-fishing-net or has large-fishing-net
  rate: 30
  one of:
    fishing:
      give: 1 raw-shrimp
      xp: fishing 18
    18x:
      drain: 1 line-health
      say: The net comes up heavy with nothing in it, and something in the mesh gives.

# entity anchovy-shoal
title: Anchovy Shoal
examine: A shoal turning over on itself, all of it silver on one beat and gone on the next.
net the anchovies:
  continuous
  requires: has small-fishing-net or has large-fishing-net
  rate: 30
  one of:
    fishing:
      give: 1 raw-anchovies
      xp: fishing 24
    45x:
      drain: 1 line-health
      say: They go under the net as one animal, and a strand parts as you haul it back.

# entity trout-run
title: Trout Run
examine: Fast water over stones, and every so often something turns in it.
cast for trout:
  continuous
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 20
  if has wrigglers:
    3 in 4:
      take: 1 wrigglers
  if not has wrigglers:
    take: 1 dried-fish-bait
  one of:
    fishing:
      give: 1 raw-trout
      xp: fishing 44
    90x:
      drain: 2 line-health
      say: It takes the bait, turns once, and the line sings and then stops singing.

# entity salmon-pool
title: Salmon Pool
examine: Slow black water under the far bank, deep enough that you cannot see the bottom of it in summer.
cast for salmon:
  continuous
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 20
  if has wrigglers:
    3 in 4:
      take: 1 wrigglers
  if not has wrigglers:
    take: 1 dried-fish-bait
  one of:
    fishing:
      give: 1 raw-salmon
      xp: fishing 55
      1 in 200:
        give: 1 anglers-knot-jewel
        say: There is something wound into the gill plate that was not put there by a fish.
    150x:
      drain: 3 line-health
      say: Something enormous takes it and simply keeps going.

// --- what a line can be grown into ---
//
// The one piece of tackle with a plane in it, and the jewel that is worth socketing there. A line is
// the only thing a fisherman wears for long enough to be worth spending points on, which is why the
// horsehair one is the base and the gut one is not.

# passive keen-line
tackle, +3 fishing

# passive sure-hand
tackle, +6 fishing

# passive drawn-out
tackle, +4 max-line-health

# passive unbreaking
tackle, +20% max-line-health

# cluster-jewel anglers-knot
examine: A knot nobody can teach you and everybody claims to have invented.
shape: ring
open-connections: e
passives: 1 keen-line, 2 drawn-out, 3 sure-hand, 4 unbreaking, 5 keen-line, 6 drawn-out

# item anglers-knot-jewel
title: Angler's Knot
examine: Six turns of something that is not quite line, and it does not come undone. @@@ It should also carry a chance not to spend the bait, which nothing in the language can say: what a cast consumes is written in the cast rather than read off a stat.
cluster-jewel: anglers-knot
