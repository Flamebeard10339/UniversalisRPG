# info fishing
version: 1.0.0
pack: skills
dependencies:
  core
  cooking
  crafting
  ? tulsa
  ? combat

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

# ladder fishing
added at level one: 0
added growth per level: 7
minutes at level one: 5
minutes growth per level: 1.07

# stat fishing-rate
title: Casting Speed
base: 6
group: core.skilling

# stat bait-persistance
title: Bait
group: core.skilling

# stat haul
title: Haul
group: core.skilling

# stat rod-cast-rate
base: 4
group: core.other
hidden if: always

# stat eel-soak
group: core.other
hidden if: always

# stat river-clear
group: core.other
hidden if: always

# stat match-clock
group: core.other
hidden if: always

# stat rise-clock
group: core.other
hidden if: always

# stat keepnet-difficulty
group: core.other
hidden if: always

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
requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers or has greenheart-rod and has dried-fish-bait or has greenheart-rod and has wrigglers or has rod-and-winch and has dried-fish-bait or has rod-and-winch and has wrigglers
continuous
attempts: 1
rate: us.fishing-rate
accuracy: us.fishing vs them.depth
rewards scaled by: haul
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

# item greenheart-rod
title: Greenheart Rod
examine: Heavy, dense-grained timber that takes a bend all the way round without splintering.
slot: mainhand
requires: level.fishing >= 25
value: 260
item-level: 20-26
tackle, +9 fishing, +40 max-line-health

# item rod-and-winch
title: Rod and Winch
examine: A greenheart blank fitted with a winch below the grip, so a running fish gives up line off the spool instead of taking it off the rod.
slot: mainhand
requires: level.fishing >= 30
value: 420
item-level: 26-32
tackle, +130 max-line-health, -15% fishing-rate

# item dressed-silk-line
title: Dressed Silk Line
examine: Braided silk, dressed with oil until it sheds water rather than drinking it.
slot: gloves
requires: level.fishing >= 25
value: 200
item-level: 20-26
tackle, +100 max-line-health

# item fishermans-gansey
title: Fisherman's Gansey
examine: Tight-knitted wool, oiled against the wet, in a pattern that names the village it was knitted in.
slot: body
requires: level.fishing >= 25
value: 170
item-level: 20-26
tackle, +8 fishing

# item creel
title: Creel
examine: A wicker basket worn on the hip, willow strips woven tight enough to keep a fish alive and cool through an afternoon.
slot: body
requires: level.fishing >= 30
value: 300
item-level: 26-32
tackle, +14 fishing

# item waders
title: Waders
examine: Oiled canvas laced up the side from boot to chest, and cold on the inside within the hour regardless.
slot: legs
requires: level.fishing >= 25
value: 160
item-level: 20-26
tackle, +8 fishing

# item hobnailed-river-boots
title: Hobnailed River Boots
examine: Iron studs through the sole, for standing on wet stone without going in after the fish.
slot: boots
requires: level.fishing >= 25
value: 150
item-level: 20-26
tackle, +2 fishing-rate

# droptable parted-tackle
take: worn gloves

# droptable spend-bait
one of:
  bait-persistance: nothing
  100x:
    if has wrigglers:
      3 in 4:
        take: 1 wrigglers
    if not has wrigglers:
      take: 1 dried-fish-bait

# droptable spend-bread-paste
one of:
  bait-persistance: nothing
  100x:
    take: 1 bread-paste

# droptable spend-herring-strip
one of:
  bait-persistance: nothing
  100x:
    take: 1 herring-strip

# droptable marle-catches-you
add: marle-catches 1
if marle-catches = 1:
  say: He is beside you before you hear him on the shingle. "Name?" He does not write it down anywhere you can see, and does not say what he does with it once you have given it.
if marle-catches = 2:
  take: up to 20 raw-salmon
  say: "Again." He does not sound surprised. The salmon goes into his own bag, not yours. "That is the second one of these you will not be eating."
if marle-catches = 3:
  take: up to 20 raw-salmon
  take: worn gloves
  say: "Third." He holds his hand out for the fish, and then, when you are slow about the rest of it, for the line off your hands as well. "You can fish this water with your fingers from here, if you still fancy it."
if marle-catches >= 4:
  take: up to 20 raw-salmon
  take: worn gloves
  take: up to 100 coin
  say: He does not ask this time. The fish, the line, and a fine go into his bag in that order, and then a hand closes on your shoulder. "Up to the gate. You know the way by now."
  relocate: tulsa.riverside

# item bread-paste
title: Bread Paste
examine: A knuckle of dough worked soft between finger and thumb, and it holds its shape on a hook without holding it forever.
slot: offhand
value: 4
tackle, +4 fishing

# item herring-strip
title: Herring Strip
examine: A strip cut off the flank of a herring, cured enough on the ice to hold together on a hook.
slot: offhand
tackle, +8 fishing

# item core.herring
cut for bait:
  instant
  take: 1 core.herring
  give: 3 herring-strip
  say: You slit it down the flank and lift three strips off the bone, thin enough to see the knife through.

# flag honest-catches

# flag trap-set

# flag old-slate-landed

# flag head-shown-at-tavern

# flag head-given-to-stall

# flag head-given-to-aggie

# flag hob-lifts

# flag hob-asked

# flag eel-bed-found

# flag has-own-trap

# flag kept-hobs-eels

# flag has-taught-rook

# flag fenn-beaten-honest

# flag fenn-was-robbed

# flag fenns-salmon-lifted

# flag fishing-contest-barred

# flag marle-catches

# flag match-entered

# flag weighed-in

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
stats: depth 0
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
stats: depth 14
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
stats: depth 28
uses: cast
cast:
  rate: us.rod-cast-rate
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
hidden if: not stat.river-clear >= 1
stats: depth 49
uses: cast
cast:
  rate: us.rod-cast-rate
  roll: spend-bait
  give: 1 raw-salmon
  xp: fishing 11
  add: honest-catches 1
  1 in 200:
    give: 1 anglers-knot-jewel
    say: There is something wound into the gill plate that was not put there by a fish.
  +on attempts exhausted:
    roll: spend-bait
    say: Something enormous takes it and simply keeps going.

# entity salmon-pool-poaching
title: Salmon Pool
examine: Slow black water under the far bank. The castle's water, and the castle is watching it today.
hidden if: stat.river-clear >= 1
stats: depth 102
uses: cast
cast:
  rate: us.rod-cast-rate
  roll: spend-bait
  give: 1 raw-salmon
  xp: fishing 11
  1 in 200:
    give: 1 anglers-knot-jewel
    say: There is something wound into the gill plate that was not put there by a fish.
  +on attempts exhausted:
    roll: spend-bait
    roll: marle-catches-you

# entity pike-reach
title: Pike Reach
examine: A straight of dark water under the willows where nothing smaller than your forearm is showing itself.
stats: depth 70
uses: cast
cast:
  hidden if: level.fishing < 11
  rate: us.rod-cast-rate
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
stats: depth 105
uses: cast
cast:
  hidden if: level.fishing < 16
  rate: us.rod-cast-rate
  roll: spend-bait
  give: 1 raw-sturgeon
  xp: fishing 17
  1 in 150:
    give: 1 a-full-tin-jewel
    say: It brings up somebody's tin with it, and there is still bait in the tin.
  +on attempts exhausted:
    roll: spend-bait
    say: The rod goes over and stays over, and then there is nothing on the end of it at all.

# item raw-eel
title: Raw Eel
examine: Thick as a wrist and still working against your grip, longer out of the water than most fish know how to be.
value: 40

# item raw-tench
title: Raw Tench
examine: Small-scaled and slime-coated, the slime coming off on your hands in a way nothing else out of the river does.
value: 55

# item raw-perch
title: Raw Perch
examine: Striped down the flank and spined along the back, and it does not go easily into the creel.
value: 60

# item raw-carp
title: Raw Carp
examine: Broad, heavy in the hand, and old by the look of the scarring round its mouth.
value: 90

# item old-slate-head
title: A Very Old Head
examine: Longer than your forearm on its own, armoured, and older by the look of it than the wall the town sits inside of.

# item the-trap-is-soaking
title: The Trap Is Soaking
examine: Set and baited, and it will want the night to do its work.
+1 eel-soak

# entity eel-bed
title: Eel Bed
examine: Still black water at the reed line, and it smells of rot in a way the rest of the mire does not.
set the trap:
  hidden if: level.fishing < 18 or not eel-bed-found or trap-set
  requires: hobs-traps.lifting or has wrigglers or has dried-fish-bait
  set: trap-set
  if not hobs-traps.lifting:
    roll: spend-bait
  inflict: the-trap-is-soaking for 3m
  say: You bait the pot with what you have and lower it on its cord into the black water, and it goes under without a ripple.
lift the trap:
  hidden if: level.fishing < 18 or not eel-bed-found or not trap-set or stat.eel-soak >= 1
  unset: trap-set
  xp: fishing 120
  if hobs-traps.lifting:
    add: hob-lifts 1
  roll: eel-trap-contents
  say: The cord comes up heavier than a pot has any right to be, and something in it is still moving.

# droptable eel-trap-contents
one of:
  90x: give: 1-2 raw-eel
  6x: nothing
  1x:
    give: 1 tight-lines-jewel
    say: There is something in among the eels that is not an eel, small and hard and looped through with old cord.

# entity tench-hole
title: Tench Hole
examine: Slack water under the reeds, and a patch of fine bubbles working up through it that were not there a moment ago.
stats: depth 147
uses: cast
cast:
  hidden if: level.fishing < 22
  requires: has fishing-rod and has bread-paste or has greenheart-rod and has bread-paste or has rod-and-winch and has bread-paste
  rate: 4
  roll: spend-bread-paste
  give: 1 raw-tench
  xp: fishing 21
  say: {stat.rise-clock >= 1: The light is going, and the bubbles have not stopped since you got here. }The float goes without any warning at all, straight down, and stays down.
  +on attempts exhausted:
    roll: spend-bread-paste
    say: The paste comes back off the hook picked clean, and the bubbles stop for a while.

# entity perch-shoal
title: Perch Shoal
examine: Striped fish holding tight to a line of old posts, spined down the back and in no hurry to move off them.
stats: depth 161
uses: cast
cast:
  hidden if: level.fishing < 24
  rate: 4
  roll: spend-bait
  give: 1 raw-perch
  xp: fishing 22
  +on attempts exhausted:
    roll: spend-bait
    say: It backs into the post rather than off it, and by the time the line comes free there is nothing on the end of it.

# entity carp-hole
title: Carp Hole
examine: A deep slow bend of the mere where the water goes brown-green and nothing about the bottom of it is visible.
stats: depth 175
uses: cast
cast:
  hidden if: level.fishing < 26
  requires: has fishing-rod and has bread-paste or has greenheart-rod and has bread-paste or has rod-and-winch and has bread-paste
  rate: 2
  roll: spend-bread-paste
  give: 1 raw-carp
  xp: fishing 48
  1 in 130:
    give: 1 a-good-bag-jewel
    say: There is a creel strap tangled in with the weed round its mouth, and no sign of whoever it came off.
  +on attempts exhausted:
    roll: spend-bread-paste
    say: It takes an age to so much as move, and then it moves once, and the paste is gone and so is any hope of it for a while.

# entity old-slate
title: Something in the Sturgeon Hole
examine: A shape at the edge of where the light gives out, longer than anything that has ever come up out of this water before, and it has not moved since you first saw it.
hidden if: not level.fishing >= 30 or old-slate-landed
stats: depth 203
uses: cast
cast:
  requires: not old-slate-landed and has fishing-rod and has herring-strip and has dressed-silk-line or not old-slate-landed and has greenheart-rod and has herring-strip and has dressed-silk-line or not old-slate-landed and has rod-and-winch and has herring-strip and has dressed-silk-line
  roll: spend-herring-strip
  set: old-slate-landed
  give: 1 old-slate-head
  give: 1 the-priest-jewel
  xp: fishing 3000
  say: It comes up slowly, and then all at once, and there is a very long silence on the bank afterwards. Whatever this is, it is not a sturgeon, or not only one.
  +on attempts exhausted:
    roll: spend-herring-strip
    say: It takes the bait and goes straight down, and the rod bends further than a rod should, and then does not bend any further, and then nothing.

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

# item cooked-eel
title: Cooked Eel
examine: Cut into lengths and cooked through on the stove, without the smokehouse a proper smoked eel would want.
value: 58
food, +17 core.regeneration, 150s
eat:
  instant
  take: 1 cooked-eel
  say: You eat it in the lengths it was cut, and it is heavier eating than it looks.

# item cooked-tench
title: Cooked Tench
examine: Muddy-tasting under the pan unless it is scaled properly first, and this one was.
value: 75
food, +18 core.regeneration, 160s
eat:
  instant
  take: 1 cooked-tench
  say: It tastes of the mud less than you were braced for.

# item cooked-perch
title: Cooked Perch
examine: The spines are gone and the striping has cooked off, and what is left is worth the trouble of both.
value: 82
food, +19 core.regeneration, 165s
eat:
  instant
  take: 1 cooked-perch
  say: Firm and pale and worth picking the last of it off the bone for.

# item cooked-carp
title: Cooked Carp
examine: A great deal of fish off one plate, and every bit of it earned by however long it took to land.
value: 120
food, +22 core.regeneration, 180s
eat:
  instant
  take: 1 cooked-carp
  say: You eat until you are done rather than until the plate is, which takes a while.

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

# recipe cooked-eel
station: core.stove
in: raw-eel
out: cooked-eel
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 10
rate: core.cooking-rate
say: It wants smoking properly, over an open fire in a barrel with a lid, and there is no smokehouse in this town to do it in, so you make do with the stove. @@@ a smokehouse station for a proper smoked eel; cooking.dsl has no such station and this recipe is not cooking.dsl's to add one to

# recipe cooked-tench
station: core.stove
in: raw-tench
out: cooked-tench
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 14
rate: core.cooking-rate
say: You scale it twice over before it goes anywhere near the pan.

# recipe cooked-perch
station: core.stove
in: raw-perch
out: cooked-perch
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 16
rate: core.cooking-rate
say: The spines want taking out before the heat, not after.

# recipe cooked-carp
station: core.stove
in: raw-carp
out: cooked-carp
burnt: cooking.burnt-food
accuracy: cooking.cooking
skill: cooking.cooking 18
rate: core.cooking-rate
say: It takes the whole of the stove and most of an hour, and it feeds more than one person.

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

# passive well-filled
title: Well Filled
tackle, +4 haul

# passive brimming
title: Brimming
tackle, +9 haul

# cluster-jewel a-good-bag
examine: Oilcloth over wicker, roomier inside than it looks from the strap.
shape: wheel
open-connections: e, sw
passives: 1 well-filled, 2 sure-hand, 3 brimming, 4 unbreaking, 5 well-filled, 6 sure-hand, 7 brimming

# item a-good-bag-jewel
title: A Good Bag
examine: A creel with a strap gone soft from wear and a smell that will not wash out of it.
cluster-jewel: a-good-bag

# passive quick-mend
title: Quick Mend
tackle, recovery, +3 regeneration

# passive sound-knot
title: Sound Knot
tackle, +80 max-line-health

# cluster-jewel tight-lines
examine: A reel of good line that has never once been let run all the way out.
shape: wheel
open-connections: e, nw
passives: 1 quick-mend, 2 slack-given, 3 sound-knot, 4 braided-through, 5 quick-mend, 6 slack-given, 7 sound-knot

# item tight-lines-jewel
title: Tight Lines
examine: A reel of line that was not in the trap when it went in, and is not eel either.
cluster-jewel: tight-lines

# passive grown-into-it
title: Grown Into It
tackle, +0.3 fishing per level of fishing

# cluster-jewel the-priest
examine: A weighted knob of blackthorn, smoothed at the far end by a thumb that has done this more than once.
shape: spindle
open-connections: e
passives: 1 grown-into-it, 2 keen-line

# item the-priest-jewel
title: The Priest
examine: Short, weighted, and worn smooth at the head end. Whatever it is for, it is not for tying knots.
cluster-jewel: the-priest

# passive full-wind
title: Full Wind
tackle, +5 fishing-rate

# passive clean-turn
title: Clean Turn
tackle, +20% fishing-rate

# cluster-jewel the-pirn
examine: An old word for a reel, and this one turns without a click in it anywhere.
shape: wheel
open-connections: e, sw
passives: 1 quick-cast, 2 full-wind, 3 practised-throw, 4 clean-turn, 5 full-wind, 6 fast-hands, 7 clean-turn

# item the-pirn-jewel
title: The Pirn
examine: A reel worn smooth on the handle from one man's thumb, four years running, and now from somebody else's.
cluster-jewel: the-pirn

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
  60 bread-paste
  2 greenheart-rod
  2 fishermans-gansey
  2 waders
  2 hobnailed-river-boots
replenish: 5s

# entity fishing-supplies
title: Fishing Supplies
examine: Nets on hooks, line on spools, and a crate of herring on ice at the front.{head-given-to-stall: A head longer than your forearm is nailed up over the awning, and it has brought people down the row who have never once bought a net.}
keeps shop: fishing-supplies

# entity stallkeeper
title: The Stallkeeper
examine: Behind the nets and the ice, doing sums on a scrap of paper and not looking up until you stop moving.

# dialogue stallkeeper
owner = stallkeeper

node passing:
  always
  again: Still nets and line. Still herring on ice.
  Nets, line, hooks, and a fresh crate of herring most mornings. Everything else you will have to catch yourself.

node the-rod:
  when: fenn-beaten-honest
  sticky
  ask: About the greenheart rod.
  "Heard you took the match off Fenn, fair and square." She looks at the rod on the rack. "I was going to knock something off that for you. I have decided against actually doing it, the price already being fair, but you should know I thought about it."

node the-herring:
  when: fishing-contest-barred
  sticky
  ask: About the herring.
  She looks at the herring in your hand rather than at you. "For eating, this time?"

node cutting-your-own:
  when: has herring-strip
  sticky
  ask: About the herring strips.
  "You have been buying herring to eat for a month, and now you are cutting it up for bait." She weighs that a moment. "I am not going to ask which one it actually is."

node the-old-head:
  when: has old-slate-head
  sticky
  ask: I have something for you.
  take: 1 old-slate-head
  set: head-given-to-stall
  She takes it in both hands and turns it over once, and then goes and finds a nail.
  "That," she says, hammering it into the beam over the stall, "is going to bring people down this row who have never once bought a net." She is not wrong about it, and she is pleased about it in a way she does not usually let show.

# item match-is-on
title: Fishing the Match
examine: The match is running, and the clock on it is not one you can see.
+1 match-clock

# entity weigh-master
title: The Weigh-Master
examine: A steelyard in one hand and a look on his face that says he has weighed a great many disappointing fish this way.
hidden if: level.fishing < 11
enter the match:
  hidden if: stat.match-clock >= 1 or has the-pirn-jewel or fishing-contest-barred
  instant
  requires: inventory.coin >= 20
  take: 20 coin
  set: match-entered
  unset: weighed-in
  inflict: match-is-on for 5m
  say: "In you go, then." He marks something on a slate. "Fenn's peg is the far one, same as every year. Biggest fish on the shingle when the clock runs out wins it. He'll tell you himself what he's caught, most likely before you ask."

# dialogue weigh-master
owner = weigh-master

node weigh-in-trout:
  when: stat.match-clock >= 1 and has raw-trout
  sticky
  ask: Weigh the trout.
  take: 1 raw-trout
  set: weighed-in
  He puts it on the steelyard without much ceremony. "Trout." He does not need to say more than that. "Fenn's got a salmon on his line, already weighed. You've lost this one."

node weigh-in-herring:
  when: stat.match-clock >= 1 and has core.herring
  sticky
  ask: Weigh this one.
  set: fishing-contest-barred
  unset: match-entered
  He turns it over once, and the ice has not fully come off it. "This one has been on ice." He does not raise his voice, but the shingle goes quiet around you anyway. "Off. Now. Your entry stands paid, and it is not coming back, and neither is this match, not for you."
  relocate: tulsa.riverside

node weigh-in-salmon:
  when: stat.match-clock >= 1 and has raw-salmon and not fenn-was-robbed
  sticky
  ask: Weigh the salmon.
  take: 1 raw-salmon
  set: weighed-in
  He puts it on the steelyard and looks at it a moment longer than the trout. "Salmon. Fenn's got one too, and his came in heavier." He shrugs. "A tie goes to the man who has held the title, which is him. Try again next year. Or this one, whichever comes first."

node weigh-in-salmon-fenn-robbed:
  when: stat.match-clock >= 1 and has raw-salmon and fenn-was-robbed
  sticky
  ask: Weigh the salmon.
  take: 1 raw-salmon
  set: weighed-in
  give: 1 the-pirn-jewel
  He puts it on the steelyard, and then looks down the shingle towards Fenn's peg, where Fenn is standing over an empty keepnet with an expression the weigh-master does not comment on. "Well. Nothing on the other end of the scale, is there." He does not ask why. "Yours, then." He hands over something small and worn smooth. "The Pirn. Wear it well."

node weigh-in-pike:
  when: stat.match-clock >= 1 and has raw-pike
  sticky
  ask: Weigh the pike.
  take: 1 raw-pike
  set: weighed-in
  set: fenn-beaten-honest
  give: 1 the-pirn-jewel
  He puts it on the steelyard and it settles further than a salmon ever has. "That'll do it." He looks past you, down the shingle, at Fenn. "Fenn! Beaten fair, this year." He hands the jewel over. "The Pirn. Four years, he had it. Wear it well."

node weigh-in-sturgeon:
  when: stat.match-clock >= 1 and has raw-sturgeon
  sticky
  ask: Weigh the sturgeon.
  take: 1 raw-sturgeon
  set: weighed-in
  set: fenn-beaten-honest
  give: 1 the-pirn-jewel
  He does not bother finishing the sentence he was about to say. "Right, that settles that." He hands the jewel over without further ceremony. "The Pirn. Nobody has brought a sturgeon to this scale before."

node too-late:
  when: match-entered and not stat.match-clock >= 1 and not weighed-in
  sticky
  ask: About the match.
  unset: match-entered
  "Clock's out." He is already looking past you at the next peg. "Nothing weighed is nothing won. There is always next time."

# entity fenn
title: Fenn
examine: A rangy man at the peg below the weigh-master's scale, with a keepnet staked out in front of him and four years of winning stitched into how he talks about it.
hidden if: level.fishing < 11

# dialogue fenn
owner = fenn

node greeting:
  always
  again: "Four years running," he says, in case you had not heard.
  "Four years running." He says it as though you had asked. "Enter if you like. Somebody has to come last."

node beaten:
  when: fenn-beaten-honest
  sticky
  ask: About the contest.
  "The water was wrong that day," he says, not quite looking at you. "Current was off. Everybody knows the current was off." Nobody has said anything to him about the current.

node robbed:
  when: fenn-was-robbed
  sticky
  ask: About the contest.
  "I know what was in that net." He does not raise his voice. "A salmon, and then nothing, and then you, holding a salmon. I cannot prove it. I do not need to." He does not say the word thief. He does not need it either.

# entity fenns-keepnet
title: Fenn's Keepnet
examine: A net staked at the peg below yours, and something heavy in it keeps turning over.
hidden if: not stat.match-clock >= 1 or fenns-salmon-lifted
stats: keepnet-difficulty 70
lift the salmon out:
  attempts: 1
  accuracy: us.fishing vs them.keepnet-difficulty
  on success:
    set: fenns-salmon-lifted
    set: fenn-was-robbed
    give: 1 raw-salmon
    say: The salmon comes out of the net without a splash, and goes into your own creel instead of his.
  on attempts exhausted:
    say: Your hand closes on the line and the net swings, and you come up with nothing but a look from Fenn across the water — a look, and nothing said, because he cannot prove what he thinks he saw.

# item marle-is-elsewhere
title: Marle Has Moved Up the River
examine: The water bailiff has walked on upstream, and it will be a while before he is back this way.
+1 river-clear

# item days-permit
title: A Day on the Water
examine: Marle's own word that the salmon pool is yours to fish today, honestly.
+1 river-clear

# entity marle
title: Marle
examine: The water bailiff, in the castle's colours, with a rod of his own leaned against the bank that he is not using.
hidden if: stat.river-clear >= 1
wait for him to move up the river:
  time: 20
  inflict: marle-is-elsewhere for 3m
  say: You sit on the bank and look at anything but him until he tires of being looked at, and walks on upstream. It will be a while before he is back this way.

# dialogue marle
owner = marle

node about-the-water:
  always
  again: "Castle's water," he says again, in case you had forgotten between visits.
  "Castle's water, this. Has been the whole time, only nobody was minding it until me." He looks at his own rod, propped and unused. "I fish it too, on my own time. Badly, if you want the truth of it."
  -> Sell me a day on the water. (when inventory.coin >= 40)
    take: 40 coin
    inflict: days-permit for 3m
    say: "Forty." He pockets it without counting it twice. "You are honest water for a while now. Make use of it."

node remembers-you:
  when: marle-catches >= 1
  sticky
  ask: About last time.
  "I remember you." He does not need to check anything to say it. "Once already, and here you are again with a rod in your hand on my water. I keep a memory for faces, not a ledger for names."

node regular:
  when: honest-catches >= 8
  sticky
  ask: Evening.
  "You again. Regular, you are, at this rate." He says it the way a man says it about somebody he has stopped watching closely.

node the-boy:
  when: the-boy-at-the-narrows.taught
  sticky
  ask: About the Narrows.
  "There used to be a boy up at the Narrows. Under the bank, tickling them out with his sleeve. Have not seen him in a while." He looks almost relieved about it, which is not an expression he wears often. "Do not know why. Do not much want to ask."

# dialogue tulsa.guardsman
node a-poacher-brought-in:
  when: marle-catches >= 4
  sticky
  ask: About the one Marle marched in.
  "Marle's business, that, not mine, but he mentioned a name." He looks you over in a way that is not friendly. "Keep to your own water."

# item the-rise
title: The Rise
examine: Dusk on the water, and everything in it feeding at once.
+2 rod-cast-rate

# entity hob
title: Hob
examine: An older man in a chair pulled close to the door, one leg stuck out straight in front of him and not bending for anybody.
keeps shop: hobs-tackle

# shop hobs-tackle
coin: coin
stocks:
  1 rod-and-winch
  2 dressed-silk-line
  1 creel
replenish: 60s
hidden if: not hobs-traps.trusted

# quest hobs-traps
title: Hob's Traps
log: There is a man in a hut on the swamp edge who used to lift his own eel traps and does not, any more.

stage offered:
  log: Hob's knee has gone and he cannot get out to his traps in the mire any more. He will show me where they are for a share of the eels.
  hob says:
    always
    sticky
    ask: Something wrong with your leg?
    "Knee." He does not get up to answer you. "Been going since spring and it is not getting better. I have pots out in the mire and I have not lifted one of them myself in a month." He looks at the door as though the mire were visible through it. "Somebody with a working leg could lift them for me. Half of what comes up is theirs, for the walking."
    -> I'll lift them for you.
      set: eel-bed-found
      say: "Out past the reed line, where the water goes black. You will smell it before you see it." He settles back in the chair. "Bring me word on how it's going, now and again."
      goto lifting
    -> Not today.
      add: hob-asked 1
      say: "Suit yourself." He looks back at the door.

stage lifting:
  log: I am lifting Hob's traps for him in the eel bed and bringing him word of how it goes.
  done when: hob-lifts >= 3
  goto reckoning
  hob says:
    always
    sticky
    ask: About the traps.
    "Still going out there?" He nods at that. "Good. My knee thanks you even if I don't say it enough."

stage reckoning:
  log: I have lifted Hob's traps three times. He wants to know how it went.
  hob says:
    always
    sticky
    ask: About the traps.
    "Three times now, by my count." He looks at you rather than the door, for once. "How's it been going, out there?"
    -> Good. Here is your share, honestly.
      set: has-own-trap
      say: "Here." He holds out a battered wicker pot, mended more than once. "Yours, this one. Set it, lift it, whatever's in it is whatever's in it. I've three of my own left, so leave the near one be." He looks almost embarrassed about it. "Glad of the company, is the truth of it."
      goto trusted
    -> Empty, mostly. Bad luck.
      set: kept-hobs-eels
      say: "Empty." He says it flatly, and looks at you a moment too long. "Three pots, thirty years, and empty is not a word I have used about them once in that time." He does not call you a liar. He does not need to.
      goto keeping-the-eels

stage trusted:
  log: I told Hob the truth about the traps. He has given me one of my own, and is glad of the company.
  complete
  hob says:
    always
    ask: About the traps.
    again: "Yours are doing all right, by the sound of it," he says. "Mine too, since you ask."
    "Glad of the company," he says again, as though it bears repeating.

stage keeping-the-eels:
  log: I told Hob the traps were empty. He did not believe me, and he has stopped baiting them.
  complete
  hob says:
    always
    ask: About the traps.
    again: "Weather," he says, and does not look up. "Always the weather."
    He does not ask about the traps again, and he does not bait them again either. Whatever comes up out of them from here is whatever you put into them yourself.

# entity rook
title: Rook
examine: A boy from the doss house, sleeve rolled to the shoulder, lying flat on the bank with his hand under the water. There is a sack beside him.
hidden if: the-boy-at-the-narrows.telling-marle

# quest the-boy-at-the-narrows
title: The Boy at the Narrows
log: There is a boy at the Narrows with his sleeve rolled up and a hand under the water. It is the castle's water.

stage caught-tickling:
  log: A boy called Rook is tickling trout out from under the bank at the Narrows. It is the castle's water, and he asked me not to say anything.
  rook says:
    always
    sticky
    ask: What are you doing?
    He comes up out of the water fast, and whatever he had goes back under the bank with a flick. "Nothing." He looks at the sack, and at you, and back at the water. "Please don't say anything. I'm not — " He stops. "Please don't."
    -> I won't say anything.
      goto said-nothing
    -> I could show you a better way, if you had a net.
      goto offered-to-teach
    -> I'm telling the guard.
      goto telling-marle

stage said-nothing:
  log: I said nothing about the boy at the Narrows. He is still there, tickling trout out from under the bank.
  complete
  rook says:
    always
    ask: Still at it?
    again: He lifts a hand, quick, and goes back to watching the water.
    "Still here." He does not look up from the water this time. "Sack's not as full as I'd like. I'm not much good at this."

stage offered-to-teach:
  log: I offered to show Rook a proper way to fish, if I had a spare net to give him.
  done when: has-taught-rook
  goto taught
  rook says:
    always
    sticky
    ask: About the net.
    "You said you'd show me." He is still watching your hands more than your face. "Have you got one going spare?"
    -> Here. (when inventory.small-fishing-net >= 2)
      take: worn mainhand
      set: has-taught-rook
      say: He turns it over twice before he believes it is really for him. "I'll pay you back," he says, in a voice that means he has no idea how.
      goto taught
    -> Not yet.
      say: He nods, like he expected that, and goes back to the water.

stage taught:
  log: I gave Rook a net of his own and showed him how it is done. He fishes the shingle by the Water Gate now, in the open.
  complete
  rook says:
    always
    ask: How's the net?
    again: He holds it up before you ask. Still in one piece.
    "Better than my sleeve," he says. "Nobody's told me to stop yet."

stage telling-marle:
  log: I told the guard about the boy at the Narrows.
  complete
  tulsa.guardsman says:
    always
    ask: There is a boy at the Narrows.
    again: "Dealt with," he says, and does not elaborate.
    He is already walking. "The castle's water. Right." He does not run, but he does not dawdle either.

# entity rook-at-the-gate
title: Rook
examine: The boy from the Narrows, at the shingle with the people who are not fishing, and he does not look up when you stop near him.
hidden if: not the-boy-at-the-narrows.telling-marle

# entity tavern-anglers
title: Three Anglers
examine: Three men at a table with their elbows in the rings their mugs have left, mid-argument about something none of them saw.

# dialogue tavern-anglers
owner = tavern-anglers

node the-story:
  always
  again: "Same as ever," one of them says, "and it gets an inch longer every telling."
  "There's a thing in the sturgeon hole," the nearest one says, "older than the wall." He holds his hands apart. The next one holds his hands wider. Fenn, at the end of the table, holds his hands wider still, and says nothing else about it.

node show-the-head:
  when: has old-slate-head
  sticky
  ask: I have something you should see.
  take: 1 old-slate-head
  set: head-shown-at-tavern
  You put it on the table between the mugs, and for a moment nobody says anything at all.
  "That's it," the nearest one says, turning it over. "That's the thing." He believes it before he has finished saying so. The second one turns it over the other way. "That's a sturgeon's head. A big one. Doesn't make it the thing." He does not put it down, though. Fenn takes it last, and looks for a scar on the gill plate that the story always had, and finds it, and goes quiet. He buys the next round and does not mention the contest once, all night.

node after:
  when: head-shown-at-tavern
  ask: About the thing in the sturgeon hole.
  again: "Still the same three opinions," the nearest one says. "Mine's still the right one."
  "You," the nearest one says. "The one who landed it." The second one shrugs. "The one who says he did." Fenn says nothing, and signals for another round.

# dialogue tulsa.aggie
node the-old-head:
  when: has old-slate-head
  sticky
  ask: I have something for your pan.
  take: 1 old-slate-head
  set: head-given-to-aggie
  She looks at it a long moment before she takes it. "That's too old to be worth the pan," she says, and puts it in the pan anyway.
  Later, she gives you a plate of it, and it is the best thing that has come out of her kitchen in a while. "Nobody else would have brought it to me," she says, and does not explain why that mattered.

# entity tulsa.player
+skills: fishing
on line-parted:
  say: The line goes slack in your hands, and what was on the end of it is somewhere under the water with the fish.
  restore: line-health
  roll: parted-tackle

# location tulsa.market-row
+entities: fishing-supplies, stallkeeper

# location tulsa.riverside
+entities: shrimp-shoal, anchovy-shoal, weigh-master, fenn, fenns-keepnet, tulsa.guardsman

# location tulsa.deep-water
+entities: trout-run, salmon-pool, salmon-pool-poaching, marle
wait for dusk:
  hidden if: stat.rise-clock >= 1
  time: 20
  inflict: the-rise for 3m
  say: You sit out the last of the afternoon on the bank and let the light go. Something changes in the water just as the sun drops below the wall, and every fish in it seems to know it at once.

# location tulsa.the-narrows
+entities: pike-reach, sturgeon-hole, old-slate, rook, rook-at-the-gate
wait for dusk:
  hidden if: stat.rise-clock >= 1
  time: 20
  inflict: the-rise for 3m
  say: You sit out the last of the afternoon on the rocks and let the light go. Something changes in the water just as the sun drops below the valley side, and every fish in it seems to know it at once.

# location tulsa.swamp-mire
+entities: eel-bed, tench-hole, hob

# location tulsa.sha-dynastys
+entities: tavern-anglers

# location the-mere
x: 6, y: 8
title: The Mere
examine: The valley opens out here and the river slows into something closer to a lake, reed-fringed and flat calm at this hour.
adjacent:
  tulsa.the-narrows
entities:
  perch-shoal, carp-hole

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
use: entity.salmon-pool-poaching.cast until has raw-salmon
assert: has raw-salmon

# test the-tackle-stall-is-where-the-herring-is
load: tulsa.in-town-with-bent-coins
travel: tulsa.market-row
shop: tulsa.general-store
submit-modal: item=more:sell:core.bent-coin
submit-modal: count=6
submit-modal: item=close
assert: inventory.core.coin > 0
assert: has 2 core.bent-coin
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
assert: has 3 raw-shrimp
travel: tulsa.nans-house
craft: cooked-shrimp
assert: has 2 raw-shrimp
assert: xp.cooking.cooking > 0

# save geared-for-the-new-water
{"version":13,"location":"tulsa.swamp-mire","xp":{"fishing.fishing":100000},"inventory":{"fishing.bread-paste":40,"fishing.herring-strip":10,"fishing.dried-fish-bait":40,"core.coin":200},"instances":{"next":6,"byId":{"1":{"kind":"item","template":"fishing.greenheart-rod","payload":{"roll":0.2,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.dressed-silk-line","payload":{"roll":0.3,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"3":{"kind":"item","template":"fishing.waders","payload":{"roll":0.4,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"4":{"kind":"item","template":"fishing.hobnailed-river-boots","payload":{"roll":0.6,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"5":{"kind":"item","template":"fishing.creel","payload":{"roll":0.7,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test fishing-the-new-water-with-the-gear-for-it
unkillable
load: geared-for-the-new-water
equip: 1
equip: 2
equip: 3
equip: 4
equip: 5
equip: bread-paste
use: core.melee-combat on combat.bog-lurker until done
use: entity.tench-hole.cast until has raw-tench
assert: has raw-tench
goto: the-mere
use: entity.perch-shoal.cast until has raw-perch
assert: has raw-perch
use: entity.carp-hole.cast until has raw-carp
assert: has raw-carp
goto: tulsa.the-narrows
equip: herring-strip
use: entity.old-slate.cast until old-slate-landed
assert: old-slate-landed
assert: has old-slate-head
assert: has the-priest-jewel

# test old-slate-does-not-come-back-once-landed
unkillable
load: geared-for-the-new-water
equip: 1
equip: 2
equip: herring-strip
goto: tulsa.the-narrows
use: entity.old-slate.cast until old-slate-landed
assert: old-slate-landed
use: entity.old-slate.cast
refused

# save at-the-mire-with-a-shrimp-net
{"version":13,"location":"tulsa.swamp-mire","xp":{"fishing.fishing":30000},"inventory":{"fishing.dried-fish-bait":40},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"fishing.fishing-rod","payload":{"roll":0.1,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test hobs-traps-honest-path-unlocks-the-eel-bed-and-his-shop
unkillable
load: at-the-mire-with-a-shrimp-net
talk: hob
choose: I'll lift them for you.
assert: hobs-traps.lifting
assert: eel-bed-found
until 3 times:
  use: entity.eel-bed.set-the-trap
  wait: 190
  use: entity.eel-bed.lift-the-trap
assert: hobs-traps.reckoning
talk: hob
choose: Good. Here is your share, honestly.
assert: hobs-traps.trusted
assert: has-own-trap
shop: hobs-tackle
submit-modal: item=close

# test marle-catches-a-poacher-when-the-cast-fails
fail-checks
load: rodded-up-at-the-deep-water
equip: 1
equip: dried-fish-bait
equip: 2
use: entity.salmon-pool-poaching.cast
assert: marle-catches >= 1

# save rodded-up-at-the-deep-water-with-coin
{"version":13,"location":"tulsa.deep-water","xp":{"fishing.fishing":467},"inventory":{"fishing.dried-fish-bait":40,"core.coin":100},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.fishing-rod","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.braided-fiber-line","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test the-water-bailiff-sells-an-honest-day-on-the-water
load: rodded-up-at-the-deep-water-with-coin
equip: 1
equip: dried-fish-bait
equip: 2
assert: not stat.river-clear >= 1
talk: marle
choose: Sell me a day on the water.
assert: stat.river-clear >= 1
use: entity.salmon-pool.cast until has raw-salmon
assert: has raw-salmon

# save at-the-narrows-with-a-spare-net
{"version":13,"location":"tulsa.the-narrows","xp":{"fishing.fishing":3000},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.small-fishing-net","payload":{"roll":0.1,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.small-fishing-net","payload":{"roll":0.15,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test the-boy-at-the-narrows-is-taught-to-fish-in-the-open
load: at-the-narrows-with-a-spare-net
equip: 1
talk: rook
choose: I could show you a better way, if you had a net.
assert: the-boy-at-the-narrows.offered-to-teach
talk: rook
choose: Here.
assert: has-taught-rook
assert: the-boy-at-the-narrows.taught
assert: has small-fishing-net

# save on-the-shingle-with-a-rod
{"version":13,"location":"tulsa.riverside","xp":{"fishing.fishing":20000},"inventory":{"core.coin":40,"fishing.dried-fish-bait":40},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.fishing-rod","payload":{"roll":0.1,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.braided-fiber-line","payload":{"roll":0.2,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test winning-the-pirn-off-a-pike-beats-fenn-fair
load: on-the-shingle-with-a-rod
use: entity.weigh-master.enter-the-match
assert: stat.match-clock >= 1
goto: tulsa.the-narrows
equip: 1
equip: dried-fish-bait
equip: 2
use: entity.pike-reach.cast until has raw-pike
assert: has raw-pike
goto: tulsa.riverside
talk: weigh-master
assert: has the-pirn-jewel
assert: fenn-beaten-honest
talk: fenn
assert: fenn.beaten.visits = 1

# save holding-the-old-slate-head
{"version":13,"location":"tulsa.aggies-house","inventory":{"fishing.old-slate-head":1}}

# test the-old-slate-head-goes-to-aggies-pan
load: holding-the-old-slate-head
talk: aggie
assert: not has old-slate-head
assert: head-given-to-aggie

# save eel-bed-at-its-gate
{"version":13,"location":"tulsa.swamp-mire","xp":{"fishing.fishing":5000},"inventory":{"fishing.dried-fish-bait":40},"flags":{"fishing.eel-bed-found":true}}

# save tench-hole-at-its-gate
{"version":13,"location":"tulsa.swamp-mire","xp":{"fishing.fishing":8000},"inventory":{"fishing.bread-paste":300},"equipped":{"mainhand":"1","gloves":"2"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.fishing-rod","payload":{"roll":0.2,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.horsehair-line","payload":{"roll":0.3,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save the-mere-at-its-gate
{"version":13,"location":"the-mere","xp":{"fishing.fishing":13000},"inventory":{"fishing.bread-paste":300,"fishing.dried-fish-bait":300},"equipped":{"mainhand":"1","gloves":"2","legs":"3","boots":"4","body":"5"},"instances":{"next":6,"byId":{"1":{"kind":"item","template":"fishing.greenheart-rod","payload":{"roll":0.2,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.dressed-silk-line","payload":{"roll":0.3,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"3":{"kind":"item","template":"fishing.waders","payload":{"roll":0.4,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"4":{"kind":"item","template":"fishing.hobnailed-river-boots","payload":{"roll":0.6,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"5":{"kind":"item","template":"fishing.fishermans-gansey","payload":{"roll":0.7,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}
