# info fishing
version: 1.0.0
pack: skills
dependencies:
  core
  cooking
  crafting
  ? tulsa

# stat fishing
title: Fishing
base: 60
group: core.skilling

# stat max-line-health
title: Line
group: core.skilling

# stat depth
title: Depth
group: core.other
hidden if: always

# stat fishing-rate
title: Casting Speed
base: 6
group: core.skilling

# stat bait-persistance
title: Bait
group: core.skilling

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

# action cast
title: Fish
continuous
attempts: 1
rate: us.fishing-rate
accuracy: us.fishing vs them.depth
on attempts exhausted:
  drain: 1 line-health

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

# item wide-straw-hat
title: Wide Straw Hat
examine: A brim you can see the whole river from under, and it has been sat on more than once.
slot: head
value: 18
item-level: 3-6
tackle, +2 fishing

# item horsehair-line
title: Horsehair Line
examine: Drawn from one tail, by somebody with a great deal of patience and one horse.
slot: gloves
requires: level.fishing >= 15
value: 120
item-level: 8-14
tackle, +60 max-line-health

# item steel-line
title: Steel Line
examine: Wire, honestly. It will outlast the fish and it will spook every one of them first.
slot: gloves
value: 60
item-level: 3-7
tackle, +25 max-line-health, +100% max-line-health, -6 fishing

# droptable parted-tackle
take: 1 small-fishing-net
take: 1 large-fishing-net
take: 1 gut-line
take: 1 braided-fiber-line
take: 1 horsehair-line
take: 1 steel-line

# droptable spend-bait
one of:
  bait-persistance: nothing
  100x:
    if has wrigglers:
      3 in 4:
        take: 1 wrigglers
    if not has wrigglers:
      take: 1 dried-fish-bait

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

# entity shrimp-shoal
title: Shrimp Shoal
examine: A dark shifting patch a foot under, moving the way one thing moves.
stats: depth 8
uses: cast
cast:
  requires: has small-fishing-net or has large-fishing-net
  give: 1 raw-shrimp
  xp: fishing 3
  +on attempts exhausted:
    say: The net comes up heavy with nothing in it, and something in the mesh gives.

# entity anchovy-shoal
title: Anchovy Shoal
examine: A shoal turning over on itself, all of it silver on one beat and gone on the next.
stats: depth 48
uses: cast
cast:
  requires: has small-fishing-net or has large-fishing-net
  give: 1 raw-anchovies
  xp: fishing 4
  +on attempts exhausted:
    say: They go under the net as one animal, and a strand parts as you haul it back.

# entity trout-run
title: Trout Run
examine: Fast water over stones, and every so often something turns in it.
stats: depth 80
uses: cast
cast:
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 4
  roll: spend-bait
  give: 1 raw-trout
  xp: fishing 9
  1 in 220:
    give: 1 quick-water-jewel
    say: A river stone comes up in the net with a thumb-groove worn into one face of it.
  +on attempts exhausted:
    roll: spend-bait
    say: It takes the bait, turns once, and the line sings and then stops singing.

# entity salmon-pool
title: Salmon Pool
examine: Slow black water under the far bank, deep enough that you cannot see the bottom of it in summer.
stats: depth 102
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
  +on attempts exhausted:
    roll: spend-bait
    say: Something enormous takes it and simply keeps going.

# entity pike-reach
title: Pike Reach
examine: A straight of dark water under the willows where nothing smaller than your forearm is showing itself.
stats: depth 96
uses: cast
cast:
  hidden if: level.fishing < 11
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 4
  roll: spend-bait
  give: 1 raw-pike
  xp: fishing 16
  1 in 180:
    give: 1 slack-water-jewel
    say: There is a length of old line in its mouth, and whatever it was tied to is still down there.
  +on attempts exhausted:
    roll: spend-bait
    say: It follows the bait almost to the bank, looks at you, and is not there any more.

# entity sturgeon-hole
title: Sturgeon Hole
examine: Where the bed drops away and the water goes the colour of slate. Something down there is older than the town.
stats: depth 118
uses: cast
cast:
  hidden if: level.fishing < 16
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 4
  roll: spend-bait
  give: 1 raw-sturgeon
  xp: fishing 17
  1 in 150:
    give: 1 a-full-tin-jewel
    say: It brings up somebody's tin with it, and there is still bait in the tin.
  +on attempts exhausted:
    roll: spend-bait
    say: The rod goes over and stays over, and then there is nothing on the end of it at all.

# item cooked-anchovies
title: Cooked Anchovies
examine: Crisped whole in a pan, eaten whole, bones and all.
value: 6
food, +2 core.regeneration, 45s
eat:
  instant
  take: 1 cooked-anchovies
  say: You eat them off your palm in two handfuls.

# item cooked-trout
title: Cooked Trout
examine: The skin came away in one piece, which is the only way you can tell it went well.
value: 20
food, +7 core.regeneration, 90s
eat:
  instant
  take: 1 cooked-trout
  say: You eat the trout off the bone and feel considerably better about the afternoon.

# item cooked-salmon
title: Cooked Salmon
examine: Pink through to the middle and still giving off heat.
value: 36
food, +11 core.regeneration, 120s
eat:
  instant
  take: 1 cooked-salmon
  say: You eat the salmon slowly, because it is worth eating slowly.

# item cooked-pike
title: Cooked Pike
examine: Firm white flesh off a fish that fought about it, and picked clean of the bones that come with that.
value: 46
food, +11 core.regeneration, 120s
eat:
  instant
  take: 1 cooked-pike
  say: You eat it slowly, because of the bones, and it is worth eating slowly.

# item cooked-sturgeon
title: Cooked Sturgeon
examine: Steaks off something that was swimming here before the walls went up.
value: 84
food, +16 core.regeneration, 150s
eat:
  instant
  take: 1 cooked-sturgeon
  say: There is more of it than one person should eat and you eat all of it.

# recipe cooked-shrimp
station: core.stove
in: raw-shrimp
out: core.cooked-shrimp
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 1
rate: core.cooking-rate
say: The shrimp goes from grey to pink in about four seconds, and that is the whole of the skill.

# recipe cooked-anchovies
station: core.stove
in: raw-anchovies
out: cooked-anchovies
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 2
rate: core.cooking-rate
say: They crisp in the pan all at once, which is the moment to take them off it.

# recipe cooked-trout
station: core.stove
in: raw-trout
out: cooked-trout
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 4
rate: core.cooking-rate
say: You take the trout off the heat at the moment the eye goes white.

# recipe cooked-salmon
station: core.stove
in: raw-salmon
out: cooked-salmon
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 6
rate: core.cooking-rate
say: The salmon takes longer than anything else on the range and punishes you for looking away.

# recipe cooked-pike
station: core.stove
in: raw-pike
out: cooked-pike
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 8
rate: core.cooking-rate
say: You cook the pike long and slow, which is the only way round the bones.

# recipe cooked-sturgeon
station: core.stove
in: raw-sturgeon
out: cooked-sturgeon
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 12
rate: core.cooking-rate
say: It takes up the whole range and it is worth the whole range.

# recipe gut-line
in: 2 crafting.sinew
out: 1 gut-line
skill: crafting.crafting 14
rate: crafting.crafting
say: Two lengths of it twisted against each other, which is the whole of a gut line.

# recipe braided-fiber-line
in: 4 crafting.sinew, 1 crafting.quill
out: 1 braided-fiber-line
skill: crafting.crafting 40
rate: crafting.crafting
say: Four strands round a quill core, laid so no one of them ever takes the whole pull.

# recipe horsehair-line
in: 6 crafting.sinew, 3 crafting.quill, 1 crafting.leather
out: 1 horsehair-line
skill: crafting.crafting 96
rate: crafting.crafting
say: It takes an afternoon and one horse's worth of patience, and it will outlast three of anything else.

# recipe small-fishing-net
in: 6 crafting.sinew
out: 1 small-fishing-net
skill: crafting.crafting 22
rate: crafting.crafting
say: Knotted square, mesh by mesh, until it is the size of the fish you have in mind.

# recipe large-fishing-net
in: 14 crafting.sinew, 1 crafting.leather
out: 1 large-fishing-net
skill: crafting.crafting 70
rate: crafting.crafting
say: The same knot four hundred more times, and a leather edge so the weight of it does not tear the mesh.

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
passives: 1 keen-line, 2 drawn-out, 3 sure-hand, 4 unbreaking, 5 keen-line, 6 thrifty

# item anglers-knot-jewel
title: Angler's Knot
examine: Six turns of something that is not quite line, and it does not come undone.
cluster-jewel: anglers-knot

# passive quick-cast
tackle, +1 fishing-rate

# passive practised-throw
tackle, +2 fishing-rate

# passive fast-hands
tackle, +12% fishing-rate

# cluster-jewel quick-water
examine: The trick is that the net is already going out while the last one is still coming in.
shape: ring
open-connections: e
passives: 1 quick-cast, 2 keen-line, 3 practised-throw, 4 fast-hands, 5 quick-cast, 6 sure-hand

# item quick-water-jewel
title: Quick Water
examine: A wrist-weight of river stone, worn smooth on one side by a thumb.
cluster-jewel: quick-water

# passive slack-given
tackle, +9 max-line-health

# passive well-tended
tackle, recovery, +1 regeneration

# passive braided-through
tackle, +25% max-line-health

# cluster-jewel slack-water
examine: Nobody lands anything here in a hurry, and nothing here breaks.
shape: wheel
open-connections: e, nw
passives: 1 slack-given, 2 well-tended, 3 drawn-out, 4 braided-through, 5 slack-given, 6 well-tended, 7 unbreaking

# item slack-water-jewel
title: Slack Water
examine: A coil of line that has been wet a very long time and has not rotted.
cluster-jewel: slack-water

# passive thrifty
tackle, +2 bait-persistance

# passive miserly
tackle, +4 bait-persistance

# cluster-jewel a-full-tin
examine: Whatever is in it, there is always another one.
shape: spindle
open-connections: e
passives: 1 thrifty, 2 miserly

# item a-full-tin-jewel
title: A Full Tin
examine: A dented tin that rattles, and has rattled the same amount for as long as anyone has had it.
cluster-jewel: a-full-tin

# shop fishing-supplies
coin: coin
stocks:
  20 herring
  3 small-fishing-net
  2 large-fishing-net
  3 fishing-rod
  200 dried-fish-bait
  1 wrigglers
  10 gut-line
  6 braided-fiber-line
  3 horsehair-line
  4 steel-line

# entity fishing-supplies
title: Fishing Supplies
examine: Nets on hooks, line on spools, and a crate of herring on ice at the front.
keeps shop: fishing-supplies

# entity tulsa.player
+skills: fishing
on line-parted:
  say: The line goes slack in your hands, and what was on the end of it is somewhere under the water with the fish.
  restore: line-health
  roll: parted-tackle

# location tulsa.market-row
+entities: fishing-supplies

# location tulsa.riverside
+entities: shrimp-shoal, anchovy-shoal

# location tulsa.deep-water
+entities: trout-run, salmon-pool

# location tulsa.the-narrows
+entities: pike-reach, sturgeon-hole

# save both-nets-and-no-fishing-behind-them
{"version":13,"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.small-fishing-net","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.large-fishing-net","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test a-net-that-names-a-level-is-refused-to-somebody-who-has-not-got-it
load: both-nets-and-no-fishing-behind-them
equip: 2
refused
equip: 1
assert: stat.max-line-health > 0

# save rodded-up-at-the-deep-water
{"version":13,"location":"tulsa.deep-water","xp":{"fishing.fishing":467},"inventory":{"fishing.dried-fish-bait":40},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.fishing-rod","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.braided-fiber-line","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test the-deep-water-is-fished-with-a-rod-and-bait
load: rodded-up-at-the-deep-water
equip: 1
equip: dried-fish-bait
equip: 2
use: entity.trout-run.cast until has raw-trout
assert: has raw-trout
use: entity.salmon-pool.cast until has raw-salmon
assert: has raw-salmon
assert: inventory.dried-fish-bait < 40

# test the-tackle-stall-is-where-the-herring-is
load: tulsa.in-town-with-bent-coins
travel: tulsa.market-row
shop: tulsa.general-store
submit-modal: item=more:sell:core.bent-coin
submit-modal: count=6
submit-modal: item=close
assert: inventory.core.coin > 0
assert: inventory.core.bent-coin = 2
shop: fishing-supplies
submit-modal: item=buy:core.herring
submit-modal: item=close
assert: has core.herring
travel: tulsa.tavern-street
travel: tulsa.sha-dynastys
craft: cooking.cooked-herring
assert: not has core.herring

# test the-lanes-are-where-the-cooking-is
load: tulsa.a-netful-on-well-lane
travel: tulsa.hasks-house
craft: cooked-shrimp
assert: inventory.raw-shrimp = 3
travel: tulsa.nans-house
craft: cooked-shrimp
assert: inventory.raw-shrimp = 2
assert: xp.cooking.cooking > 0
