// Fishing — the skill, the one cast, the waters it is practised on, the tackle it is practised
// with, and the one pool in the game that only exists while you are wearing something.
//
// The cast is `# action cast` and every water hangs off it, the way every foe in the game hangs off
// `# action melee-combat`: `my` reads off the angler and `their` off the water, so one block is the
// shrimp shoal and the sturgeon hole both. A water declares its own sheet — how deep it is — and, in
// the block it overlays on the cast, what tackle reaches it, how often it gives you a chance,
// what comes out of it, and what it says when it beats you. Nothing else is a water's business, and
// a seventh water is those lines and no others.
//
// `line-health` is a real pool with a bar of its own, and it is there only because the tackle you
// are wearing grants `max-line-health` — take the tackle off and the pool is not there at all. When
// it empties, the tackle parts and is gone, which is what `# droptable parted-tackle` below is.
//
// Nothing here `depletes:` anybody's pool, deliberately, and that is two facts rather than one. The
// engine reports damage dealt and damage taken off any action that depletes, and combat pays its
// two skills on exactly those two moments — so a cast that depleted a pool would train a player's
// arm every time they went to the water. And a water that could be depleted could be felled, which
// no water ever is: there is no pool on it to empty. A cast is contested rather than depleting, and
// what a landed cast finishes is a whole of its own.

# info fishing
version: 1.0.0
pack: skills
dependencies:
  core

// --- what the skill is measured in ---

// The one side of every cast the player brings. Sixty is a little under four casts in five landing
// at the easiest water and about one in four at the deepest, which is what makes the tackle worth
// buying before the deep water is worth walking to.
# stat fishing
title: Fishing
base: 60
group: core.skilling

// Deliberately without a base, like `max-health`: a player wearing no tackle has no line to lose,
// and `line-health` is not a pool they have at all until something grants this.
# stat max-line-health
title: Line
group: core.skilling

// The other side of every cast, and no player ever carries it: how far down what you are after is.
# stat depth
title: Depth
group: core.other

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


// --- the cast ---

// Ten seconds to a throw of the net, and the two deep waters slow it to fifteen for a rod. The pace
// is half of what brings the water onto the curve and the `xp:` on each water is the other half:
// thirty a minute was an idle game's pace rather than a river's.
# action cast
title: Fish
continuous
attempts: 1
rate: 6
accuracy: my fishing vs their depth
on unfinished:
  drain: 1 line-health


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
item-level: 2-5
tackle, +3 fishing, +40 max-line-health

# item large-fishing-net
title: Large Fishing Net
examine: A throw net wide enough to need both arms and a running start.
slot: mainhand
requires: level.fishing >= 10
value: 70
item-level: 5-9
tackle, +7 fishing, +60 max-line-health

# item fishing-rod
title: Fishing Rod
examine: Split cane in three pieces, whipped at the joints. It holds no line of its own.
slot: mainhand
value: 45
item-level: 4-8
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
item-level: 2-4
tackle, +15 max-line-health

# item braided-fiber-line
title: Braided Fibre Line
examine: Four strands laid against each other so that no one of them ever takes the whole pull.
slot: gloves
value: 40
item-level: 4-8
tackle, +35 max-line-health

# item horsehair-line
title: Horsehair Line
examine: Drawn from one tail, by somebody with a great deal of patience and one horse.
slot: gloves
requires: level.fishing >= 15
value: 120
item-level: 8-14
tackle, +60 max-line-health

// The one piece of tackle that is a trade rather than an upgrade: twice the line to lose and six
// off what you land with. A player who cannot afford to keep replacing line buys this instead.
# item steel-line
title: Steel Line
examine: Wire, honestly. It will outlast the fish and it will spook every one of them first.
slot: gloves
value: 60
item-level: 3-7
tackle, +25 max-line-health, +100% max-line-health, -6 fishing

// Every piece of tackle above that grants a line to empty. Nothing in the language selects an item
// by the keyword it carries, so the subjects are written out — and what holds them to the tackle
// above is a claim in the suite that derives its own subjects off the corpus, so a seventh net left
// out of this list reddens `npm test` rather than working never.
# droptable parted-tackle
take: 1 small-fishing-net
take: 1 large-fishing-net
take: 1 gut-line
take: 1 braided-fiber-line
take: 1 horsehair-line
take: 1 steel-line

// The one thing two waters both do, and the only part of a cast that is neither the fish nor the
// water: a rod eats a strip every time it goes out. The two deep waters roll this rather than
// restating it, and the two net waters do not roll it at all.
# droptable spend-bait
if has wrigglers:
  3 in 4:
    take: 1 wrigglers
if not has wrigglers:
  take: 1 dried-fish-bait

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

# item raw-pike
title: Raw Pike
examine: All head and teeth and bad temper, and it is not finished being alive.
value: 38

# item raw-sturgeon
title: Raw Sturgeon
examine: Armoured down both flanks, longer than your arm, and the market has no standing price for one.
value: 70

// --- the water ---
//
// Six kinds of water and a ladder up them. The two nets take the low water, where nothing is baited
// and nothing is lost but the net; the rod takes the deep, where every cast eats a strip of bait and
// the line is what pays for a miss. A water's `fishing` is nought because a water fishes nothing:
// it is the angler's half of the contest, and a water carries it only to stand on the other side.
//
// The first four are one band and pay about the same by the minute, which is what makes the choice
// between them a choice about what comes out rather than about the hour. The two below them are the
// second band and pay for the climb.

# entity shrimp-shoal
title: Shrimp Shoal
examine: A dark shifting patch a foot under, moving the way one thing moves.
stats: fishing 0, depth 8
uses: cast
cast:
  requires: has small-fishing-net or has large-fishing-net
  give: 1 raw-shrimp
  xp: fishing 3
  +on unfinished:
    say: The net comes up heavy with nothing in it, and something in the mesh gives.

# entity anchovy-shoal
title: Anchovy Shoal
examine: A shoal turning over on itself, all of it silver on one beat and gone on the next.
stats: fishing 0, depth 48
uses: cast
cast:
  requires: has small-fishing-net or has large-fishing-net
  give: 1 raw-anchovies
  xp: fishing 4
  +on unfinished:
    say: They go under the net as one animal, and a strand parts as you haul it back.

# entity trout-run
title: Trout Run
examine: Fast water over stones, and every so often something turns in it.
stats: fishing 0, depth 80
uses: cast
cast:
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 4
  roll: spend-bait
  give: 1 raw-trout
  xp: fishing 9
  +on unfinished:
    roll: spend-bait
    say: It takes the bait, turns once, and the line sings and then stops singing.

# entity salmon-pool
title: Salmon Pool
examine: Slow black water under the far bank, deep enough that you cannot see the bottom of it in summer.
stats: fishing 0, depth 102
uses: cast
cast:
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 4
  roll: spend-bait
  give: 1 raw-salmon
  xp: fishing 11
  1 in 200:
    give: 1 anglers-knot-jewel
    say: There is something wound into the gill plate that was not put there by a fish.
  +on unfinished:
    roll: spend-bait
    say: Something enormous takes it and simply keeps going.

// --- the water a levelled angler is for ---
//
// The four above pay about the same by the minute and differ in what comes out, which is right for
// a ladder inside one band and wrong for a ladder across two: the curve asks nearly twice as much an
// hour at the twentieth level as at the first, and a rung that pays what the rung below it pays
// cannot answer that. These two pay more, and they are shut until the level that is meant to be
// standing at them — a water is not hidden because it is hard, it is hidden because a hand that
// cannot work it has no business being offered it.
//
// The gate is a level rather than a piece of tackle because tackle is testable by `has` and a pack
// is not a skill: a beginner handed the gear would otherwise stand at the deepest water in Tulsa on
// their first afternoon, which is the whole thing these are here to stop.

# entity pike-reach
title: Pike Reach
examine: A straight of dark water under the willows where nothing smaller than your forearm is showing itself.
stats: fishing 0, depth 96
uses: cast
cast:
  hidden if: level.fishing < 11
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 4
  roll: spend-bait
  give: 1 raw-pike
  xp: fishing 16
  +on unfinished:
    roll: spend-bait
    say: It follows the bait almost to the bank, looks at you, and is not there any more.

# entity sturgeon-hole
title: Sturgeon Hole
examine: Where the bed drops away and the water goes the colour of slate. Something down there is older than the town.
stats: fishing 0, depth 118
uses: cast
cast:
  hidden if: level.fishing < 16
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 4
  roll: spend-bait
  give: 1 raw-sturgeon
  xp: fishing 17
  +on unfinished:
    roll: spend-bait
    say: The rod goes over and stays over, and then there is nothing on the end of it at all.

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

// --- tests ---

// The two nets are one slot and one difference: the large one names a level and
// the small one names none. So a run that has fished nothing is handed both and
// gets exactly one of them on, which says the refusal is the gate rather than the
// slot being full or the net being absent. Level 1 is the floor every skill starts
// on, so this route says nothing about where the gate is set and does not move
// when it moves. Each net names a level of its own, so each arrives as a copy
// under an id the engine mints rather than as a stack: `1` is the small one and
// `2` the large, in the order they were handed over. What says the small one is
// on is a line to lose, which nothing but tackle grants; reading `fishing` for
// that would mean naming its base and whatever a net adds to it.
# save both-nets-and-no-fishing-behind-them
{"version":13,"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.small-fishing-net","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.large-fishing-net","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test a-net-that-names-a-level-is-refused-to-somebody-who-has-not-got-it
load: both-nets-and-no-fishing-behind-them
equip: 2
refused
equip: 1
assert: stat.max-line-health > 0
