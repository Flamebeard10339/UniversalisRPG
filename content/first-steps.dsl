# info first-steps
version: 1.0.0
pack: quests
dependencies:
  core
  combat
  tulsa
  cooking
  fishing
  thieving

# quest finding-your-feet
title: Finding Your Feet
log: I woke in a house that is not mine. They say whoever keeps it takes newcomers in hand.

stage offered:
  log: A guide called Miki offered to show me the ropes.
  first-steps.miki says:
    always
    ask: Who are you, then?
    Greetings, adventurer! Welcome to UniversalisRPG.
    The name's Miki, your tutorial guide, here to walk you through your first steps.
    What do you say I show you the ropes?
    -> Sounds good. Teach me.
      say: Splendid! We start with what gives an adventurer purpose: quests.
      if not first-steps.mirror-done:
        say: Your first task: find the mirror in this house and decide who you are, your name and your people.
      if first-steps.mirror-done:
        say: Though you have stood in front of the mirror already, by the look of you, so that one is done before I set it. Come tell me who you turned out to be.
      goto name-yourself
    -> I'd rather find my own way.
      goto snubbed

stage name-yourself:
  log: Miki says the first thing an adventurer needs is to know who they are. I am not sure I do.
  first-steps.miki says:
    always
    sticky
    ask: About that mirror.
    The mirror's still waiting. Name yourself first, then we'll talk.
  first-steps.miki says:
    when: first-steps.mirror-done
    ask: I know who I am now.
    There you are, {player.name}. A fine name.
    give: core.jug-of-water
    give: core.pot-of-flour
    Water and flour make dough - knead them together, then bake the dough in the oven.
    Give it a go. I'll wait.
    goto bake-bread

stage bake-bread:
  log: Miki gave me water and flour. The two of them make dough, and dough wants an oven.
  first-steps.miki says:
    always
    sticky
    ask: About the bread.
    Knead that dough and get it in the oven, {player.name} - water and flour won't bake themselves.
  first-steps.miki says:
    when: has core.bread
    ask: The loaf is out of the oven.
    A warm loaf! Well done, {player.name}.
    Keep it in your pack - eat it whenever you're hungry.
    Every swing and catch builds a skill, and skills raise your stats.
    Here - a sword and a shield. Better than your fists, and they're yours.
    give: core.iron-sword
    give: core.wooden-shield
    Downstairs in the basement you'll find giant rats. Put three of them down and watch your stats work, then come back up here and tell me it's done.
    One thing first: they do nothing sat in your pack. Open up what you're carrying, have a look at the pair of them, and put them on - your stats move the moment you do.
    open modal: carried-items
    goto clear-the-rats

stage clear-the-rats:
  log: A sword and a shield, off Miki. He says there are giant rats under this house, that three of them down would be proof enough, and that I am to climb back up and tell him when they are.
  first-steps.miki says:
    always
    sticky
    ask: About the rats.
    Still those rats, {player.name}? Downstairs, in the basement.
  first-steps.miki says:
    when: first-steps.rats-killed >= 3
    ask: The rats are dealt with.
    Ha! Barely a scratch on you. You're a natural.
    Truth be told, there's little left I can teach you.
    So here's the last of it: get off this island. Out the front door and up the road, and keep going - there's a whole world of skills out that way.
    set: first-steps.front-door.unlocked
    Go on. Make some trouble worth telling stories about.
    goto sendoff

stage snubbed:
  log: I turned Miki down. He took it badly, and the front door has not opened since.
  first-steps.miki says:
    always
    sticky
    ask: About what I said.
    Hmph. Suit yourself. Don't come crying when a door won't open.
    if has core.lockpick:
      set: first-steps.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed
  first-steps.miki says:
    when: first-steps.rats-killed >= 3
    sticky
    ask: I cleared out your rats.
    Rats are dealt with, then. That was never the hard part.
    if has core.lockpick:
      set: first-steps.miki.angered
    -> Actually - sorry. Show me the ropes after all.
      goto apologised
    -> Not a chance.
      goto snubbed

stage apologised:
  log: I went back and apologised. Miki took it, and put a price on it: a second level in something, anything at all. He lent me a net and pointed at the pond behind his house.
  first-steps.miki says:
    always
    ask: About squaring it with you.
    again: The net's yours already. A second level in anything and we're square - the pond's still out the back.
    give: fishing.small-fishing-net
    set: first-steps.miki.net-lent
    Take the net and get it on your hand - it does nothing rolled up in your pack. There's a pond out the back, and shrimp in it. Get good enough at something to have a second level in it - fishing, or whatever else you find - and I'll call us square.
  first-steps.miki says:
    when: first-steps.miki.net-lent and not has fishing.small-fishing-net
    sticky
    ask: Your net came apart on me.
    Parted on you, did it? They do. Mesh is mesh, and that pond is deeper than it looks.
    give: fishing.small-fishing-net
    Here - another off the same box under the bench. The pond's not going anywhere, and neither is what I asked you for.
  first-steps.miki says:
    when: highest-level >= 2
    ask: I have a second level to show for myself.
    Level two in something. Right, then - you'll do. Door's open. Get yourself off this island, and that's the last of me you get.
    set: first-steps.front-door.unlocked
    goto sendoff

stage sendoff:
  log: Miki says he has nothing left to teach me, and that the way off is out the front door and up the road.
  complete
  first-steps.miki says:
    always
    sticky
    ask: Anything else before I go?
    Still here? Out the door and up the road. I've nothing else for you.

# quest leave-tutorial-island
title: Leave Tutorial Island
log: Up the road there is a town, and it goes on a while. Miki still calls this an island.
never ends

stage adrift:
  log: Miki says he will be here. Neither of us has moved since.
  first-steps.miki says:
    when: tulsa.market-square.touched
    sticky
    ask: About this island of yours.
    So you found the market. That's the far side of the island, near enough. I'll be here.
    goto adrift
  first-steps.miki says:
    when: first-steps.miki.angered
    sticky
    ask: About your dresser.
    Went through my dresser, did you. Keep them - they'll get you further than I would have. I'll be here.
    goto adrift

# test quest-offered
talk: first-steps.miki
choose: Sounds good. Teach me.
choose: continue
assert: finding-your-feet.name-yourself

# test miki-route-full
load: miki-route-start
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
assert: first-steps.mirror-done
talk: first-steps.miki
choose: continue
assert: finding-your-feet.bake-bread
assert: has core.jug-of-water
craft: dough
assert: has core.dough
craft: bread
assert: has core.bread
talk: first-steps.miki
choose: continue
submit-modal: item=close
assert: finding-your-feet.clear-the-rats
use: entity.stairs.descend
use: melee-combat on giant-rat until done
assert: first-steps.rats-killed >= 3
use: entity.stairs-up.ascend
talk: first-steps.miki
choose: continue
assert: finding-your-feet.sendoff
assert: first-steps.front-door.unlocked
travel: market-square
travel: guide-house
talk: first-steps.miki
choose: leave-tutorial-island.adrift.miki.0.said
choose: continue
assert: leave-tutorial-island.adrift
travel: market-square
expect only: left-mikis-house
expect only: miki-route-end

# test thieving-route-full
talk: first-steps.miki
choose: I'd rather find my own way.
use: entity.stairs.ascend
use: entity.dresser.search-drawer
assert: has core.lockpick
use: entity.stairs-down.descend
talk: first-steps.miki
choose: Not a chance.
assert: first-steps.miki.angered
talk: first-steps.miki
choose: leave-tutorial-island.adrift.miki.1.said
choose: continue
assert: leave-tutorial-island.adrift
use: entity.stairs.ascend
use: entity.window.climb-out
assert: not first-steps.front-door.unlocked
expect only: left-mikis-house
expect only: thieving-route-full-end

# test apology-route-full
talk: first-steps.miki
choose: I'd rather find my own way.
talk: first-steps.miki
choose: Actually - sorry. Show me the ropes after all.
talk: first-steps.miki
choose: continue
assert: has fishing.small-fishing-net
assert: first-steps.miki.net-lent
talk: first-steps.miki
choose: continue
talk: first-steps.miki
choose: continue
assert: inventory.fishing.small-fishing-net = 1
equip: 1
assert: stat.max-line-health >= 1
use: entity.back-door.step-out-back
use: entity.fishing.shrimp-shoal.cast until highest-level >= 2
assert: highest-level >= 2
use: entity.back-door-in.step-inside
talk: first-steps.miki
choose: continue
assert: finding-your-feet.sendoff
assert: first-steps.front-door.unlocked
travel: market-square
travel: guide-house
talk: first-steps.miki
choose: leave-tutorial-island.adrift.miki.0.said
choose: continue
assert: leave-tutorial-island.adrift
travel: market-square
expect only: left-mikis-house
expect only: apology-route-full-end

# test miki-lends-another-net-to-a-player-who-has-none
load: a-parted-net-and-a-level-still-owed
assert: not has fishing.small-fishing-net
talk: first-steps.miki
choose: continue
assert: has fishing.small-fishing-net
talk: first-steps.miki
choose: continue
assert: inventory.fishing.small-fishing-net = 1

# test bake-bread-spans-two-beats
load: miki-route-start
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
talk: first-steps.miki
choose: continue
assert: finding-your-feet.bake-bread and not has core.bread
journal: finding-your-feet says Miki gave me water and flour. The two of them make dough, and dough wants an oven.
craft: dough
craft: bread
assert: finding-your-feet.bake-bread and has core.bread and not finding-your-feet.clear-the-rats
journal: finding-your-feet says Miki gave me water and flour. The two of them make dough, and dough wants an oven.

# test the-apology-survives-going-out-of-the-window
talk: first-steps.miki
choose: I'd rather find my own way.
talk: first-steps.miki
choose: Not a chance.
use: entity.stairs.ascend
use: entity.window.climb-out
travel: guide-house
assert: tulsa.market-square.touched and not first-steps.front-door.unlocked
talk: first-steps.miki
choose: finding-your-feet.snubbed.miki.0.said
choose: Actually - sorry. Show me the ropes after all.
assert: finding-your-feet.apologised
talk: first-steps.miki
choose: finding-your-feet.apologised.miki.0.said
choose: continue
assert: has fishing.small-fishing-net
equip: 1
use: entity.back-door.step-out-back
use: entity.fishing.shrimp-shoal.cast until highest-level >= 2
assert: highest-level >= 2
use: entity.back-door-in.step-inside
talk: first-steps.miki
choose: finding-your-feet.apologised.miki.2.said
choose: continue
assert: finding-your-feet.sendoff and first-steps.front-door.unlocked

# test the-mirror-charges-nothing-once-and-a-thousand-coin-after
load: at-the-mirror-with-a-thousand-coin
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
assert: mirror-done and inventory.coin = 1000
use: entity.mirror.look-in-again
submit-modal: name=Wren
submit-modal: race=core.orc
assert: inventory.coin = 0
expect only: renamed-at-the-mirror

# test a-purse-a-coin-short-is-turned-away-and-charged-nothing
load: at-the-mirror-one-coin-short
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
use: entity.mirror.look-in-again
assert: inventory.coin = 999 and player.name and player.race
expect only: named-once-with-nine-hundred-and-ninety-nine-coin

# test the-name-screen-is-answered-before-the-race-screen
load: at-the-mirror-with-a-thousand-coin
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.orc
assert: player.name and player.race

# test dresser-trinket
use: entity.stairs.ascend
use: entity.dresser.search-drawer
assert: has lockpick
assert: dresser.searched
expect: dresser-trinket-end

# test a-lockpick-opens-the-front-door
run: dresser-trinket
travel: guide-house
use: entity.front-door.pick-lock
assert: front-door.unlocked
assert: market-square.discovered
assert: not market-square.touched
assert: guide-house.touched
assert: xp.thieving > 0

# test the-town-is-found-before-the-lesson-is-over
run: quest-offered
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=core.elf
talk: first-steps.miki
choose: continue
assert: finding-your-feet.bake-bread
use: entity.stairs.ascend
use: entity.dresser.search-drawer
use: entity.stairs-down.descend
use: entity.front-door.pick-lock
travel: market-square
travel: guide-house
talk: first-steps.miki
choose: leave-tutorial-island.adrift.miki.0.said
choose: continue
assert: leave-tutorial-island.adrift and finding-your-feet.bake-bread
talk: first-steps.miki
choose: finding-your-feet.bake-bread.miki.0.said
choose: continue
journal: finding-your-feet says Miki gave me water and flour. The two of them make dough, and dough wants an oven.

# test a-room-of-this-house-reaches-the-map-by-being-stood-in
load: miki-route-start
assert: guide-house.discovered and not guide-house-upstairs.discovered
use: entity.stairs.ascend
assert: guide-house-upstairs.discovered

# test the-tutorial-oven-cooks-what-the-tutorial-catches
load: shrimp-at-mikis-oven
craft: cooked-shrimp
assert: not has fishing.raw-shrimp

# test save-restores-object-owned-flags
load: explored-and-unlocked
assert: front-door.unlocked
assert: market-square.discovered

# test one-swing-of-a-million-attack-hammer-fells-a-dummy
DEBUG
load: armed-with-a-million-attack-hammer
equip: million-attack-hammer
use: melee-combat on practice-dummy
assert: first-steps.dummies-felled = 1

# test two-eight-health-swings-leave-a-dummy-up-and-the-third-puts-it-down
DEBUG
load: armed-with-an-eight-a-swing-hammer
equip: eight-a-swing-hammer
use: melee-combat on practice-dummy
use: melee-combat on practice-dummy
assert: first-steps.dummies-felled = 0
use: melee-combat on practice-dummy
assert: first-steps.dummies-felled = 1

# save left-mikis-house
{"version":13,"location":"tulsa.market-square","flags":{"first-steps.guide-house.discovered":true,"first-steps.finding-your-feet.offered":true,"tulsa.market-square.discovered":true,"tulsa.market-square.touched":true,"first-steps.leave-tutorial-island.adrift":true}}

# save miki-route-start
{"version":13}

# save miki-route-end
{"version":13,"inventory":{"core.bread":1,"core.rat-bone":5},"flags":{"first-steps.guide-house.touched":true,"first-steps.guide-house.discovered":true,"first-steps.finding-your-feet.offered":true,"first-steps.finding-your-feet.name-yourself":true,"first-steps.mirror-done":true,"first-steps.finding-your-feet.bake-bread":true,"first-steps.finding-your-feet.clear-the-rats":true,"first-steps.basement.touched":true,"first-steps.basement.discovered":true,"first-steps.rats-killed":3,"first-steps.front-door.unlocked":true,"tulsa.market-square.discovered":true,"first-steps.finding-your-feet.sendoff":true,"tulsa.market-square.touched":true,"tulsa.market-row.discovered":true,"tulsa.tavern-street.discovered":true,"tulsa.castle-gate.discovered":true,"tulsa.kings-road.discovered":true,"tulsa.swamp-edge.discovered":true,"tulsa.riverside.discovered":true,"tulsa.kelsa-farmhouse.discovered":true,"first-steps.leave-tutorial-island.adrift":true},"visits":{"first-steps.finding-your-feet.offered.miki.0.said":1,"first-steps.finding-your-feet.name-yourself.miki.1.said":1,"first-steps.finding-your-feet.bake-bread.miki.1.said":1,"first-steps.finding-your-feet.clear-the-rats.miki.1.said":1,"first-steps.leave-tutorial-island.adrift.miki.0.said":1},"xp":{"cooking.cooking":6,"combat.attack":6,"combat.health":27},"resources":{"core.health":27321},"resourceRateRemainders":{"core.health":20000},"location":"tulsa.market-square","instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.wooden-shield","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"populations":{"first-steps.basement":{"first-steps.giant-rat":{"down":3,"due":[]}}},"time":39200,"rng":3974845897,"player":{"name":"Rowan","race":"core.elf"}}

# save thieving-route-full-end
{"version":13,"inventory":{"core.lockpick":1},"flags":{"first-steps.finding-your-feet.offered":true,"first-steps.finding-your-feet.snubbed":true,"first-steps.guide-house-upstairs.touched":true,"first-steps.guide-house-upstairs.discovered":true,"first-steps.guide-house.discovered":true,"first-steps.dresser.searched":true,"first-steps.guide-house.touched":true,"first-steps.miki.angered":true,"first-steps.leave-tutorial-island.adrift":true,"tulsa.market-square.touched":true,"tulsa.market-square.discovered":true,"tulsa.market-row.discovered":true,"tulsa.tavern-street.discovered":true,"tulsa.castle-gate.discovered":true,"tulsa.kelsa-farmhouse.discovered":true,"tulsa.swamp-edge.discovered":true,"tulsa.kings-road.discovered":true,"tulsa.riverside.discovered":true},"visits":{"first-steps.finding-your-feet.offered.miki.0.said":1,"first-steps.finding-your-feet.snubbed.miki.0.said":1,"first-steps.leave-tutorial-island.adrift.miki.1.said":1},"resources":{"core.health":26310},"location":"tulsa.market-square","time":9000,"rng":2617077404}

# save apology-route-full-end
{"version":13,"inventory":{"fishing.raw-shrimp":34},"flags":{"first-steps.finding-your-feet.offered":true,"first-steps.finding-your-feet.snubbed":true,"first-steps.finding-your-feet.apologised":true,"first-steps.miki.net-lent":true,"first-steps.backyard.touched":true,"first-steps.backyard.discovered":true,"first-steps.guide-house.discovered":true,"first-steps.guide-house.touched":true,"first-steps.front-door.unlocked":true,"tulsa.market-square.discovered":true,"first-steps.finding-your-feet.sendoff":true,"tulsa.market-square.touched":true,"tulsa.market-row.discovered":true,"tulsa.tavern-street.discovered":true,"tulsa.castle-gate.discovered":true,"tulsa.kings-road.discovered":true,"tulsa.swamp-edge.discovered":true,"tulsa.riverside.discovered":true,"tulsa.kelsa-farmhouse.discovered":true,"first-steps.leave-tutorial-island.adrift":true},"visits":{"first-steps.finding-your-feet.offered.miki.0.said":1,"first-steps.finding-your-feet.snubbed.miki.0.said":1,"first-steps.finding-your-feet.apologised.miki.0.said":3,"first-steps.finding-your-feet.apologised.miki.2.said":1,"first-steps.leave-tutorial-island.adrift.miki.0.said":1},"xp":{"fishing.fishing":102},"resources":{"fishing.line-health":38700},"resourceRateRemainders":{"core.health":40000,"fishing.line-health":40000},"equipped":{"mainhand":"1"},"location":"tulsa.market-square","instances":{"next":2,"byId":{"1":{"kind":"item","template":"fishing.small-fishing-net","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"time":415000,"rng":2398428564}

# save a-parted-net-and-a-level-still-owed
{"version":13,"location":"first-steps.guide-house","flags":{"first-steps.guide-house.discovered":true,"first-steps.guide-house.touched":true,"first-steps.finding-your-feet.offered":true,"first-steps.finding-your-feet.snubbed":true,"first-steps.finding-your-feet.apologised":true,"first-steps.miki.net-lent":true},"visits":{"first-steps.finding-your-feet.offered.miki.0.said":1,"first-steps.finding-your-feet.snubbed.miki.0.said":1,"first-steps.finding-your-feet.apologised.miki.0.said":1}}

# save dresser-trinket-end
{"version":13,"inventory":{"core.lockpick":1},"flags":{"first-steps.guide-house-upstairs.touched":true,"first-steps.guide-house-upstairs.discovered":true,"first-steps.guide-house.discovered":true,"first-steps.dresser.searched":true},"location":"first-steps.guide-house-upstairs","time":3000,"rng":2617077404}

# save explored-and-unlocked
{"version":13,"flags":{"first-steps.front-door.unlocked":true,"tulsa.market-square.discovered":true}}

# save chestnuts-in-hand
{"version":13,"inventory":{"core.raw-chestnut":3}}

# save shrimp-at-mikis-oven
{"version":13,"location":"first-steps.guide-house","inventory":{"fishing.raw-shrimp":1}}

# save at-the-mirror-with-a-thousand-coin
{"version":13,"location":"first-steps.guide-house","inventory":{"core.coin":1000}}

# save at-the-mirror-one-coin-short
{"version":13,"location":"first-steps.guide-house","inventory":{"core.coin":999}}

# save renamed-at-the-mirror
{"version":13,"player":{"name":"Wren","race":"core.orc"},"inventory":{"core.coin":0}}

# save named-once-with-nine-hundred-and-ninety-nine-coin
{"version":13,"player":{"name":"Rowan","race":"core.elf"},"inventory":{"core.coin":999}}

# save armed-with-a-million-attack-hammer
DEBUG
{"version":13,"location":"first-steps.practice-yard","inventory":{"first-steps.million-attack-hammer":1}}

# save armed-with-an-eight-a-swing-hammer
DEBUG
{"version":13,"location":"first-steps.practice-yard","inventory":{"first-steps.eight-a-swing-hammer":1}}

# item million-attack-hammer
DEBUG
slot: mainhand
weapon, +1000000 attack, +1000000 accuracy

# item eight-a-swing-hammer
DEBUG
slot: mainhand
weapon, -100% attack, +1000000 accuracy
on hit:
  drain: 8 health from them

# entity practice-dummy
DEBUG
stats: attack 0, defense 0, max-health 20, attack-rate 16, accuracy 0, evasion 0
uses: melee-combat
faction: world
on death:
  add: dummies-felled 1

# flag dummies-felled

# location practice-yard
DEBUG
x: 0, y: 0, z: -9
entities:
  3 practice-dummy

# dialogue miki
owner = miki

node greeting:
  always
  Well met. Miki, they call me - I keep an eye on this stretch of coast.
  There's a mirror over there if you've a mind to know your own face, and rats in the basement if you haven't.

# flag mirror-done

# flag rats-killed

# entity miki
faction: player
examine: A weathered man in patched leather, quick to smile.
flags: angered, net-lent

# entity front-door
examine: A heavy wooden door, bound in iron. The latch lifts from this side once whatever is holding it has stopped.
flags: unlocked
step outside:
  time: 3
  hidden if: not unlocked
  relocate: market-square
  say: You lift the latch and step out into the light coming off the water, and the road carries you the short way into the market.
pick lock:
  requires: has lockpick
  hidden if: unlocked
  time: 4
  xp: thieving 4
  on success:
    set: unlocked
    say: The lock clicks open.

# entity mirror
examine: A tall mirror in a gilt frame. Whoever stands in front of it comes away with a name and a people, and may stand in front of it again as often as they like. The first look is free. Every look after it wants a thousand coin, and the glass is not sentimental about it.
look in:
  instant
  hidden if: mirror-done
  open modal: choose-race
  open modal: choose-name
  set: mirror-done
  on success:
    say: The glass gives you back a name and a people. Come and change your mind whenever you like - it will want paying next time, but it will not turn you away.
look in again:
  instant
  hidden if: not mirror-done
  take: 1000 coin
  open modal: choose-race
  open modal: choose-name
  on success:
    say: The coin goes somewhere behind the frame. The glass clears, and waits to be told who you are this time.
  on refused:
    say: You need 1000 coin to perform this action.

# entity oven
examine: A stone oven, its coals still glowing. The top of it is flat and takes a pan, which is the whole difference between an oven and a kitchen.
stations: oven, stove

# entity stairs
title: Stairs
ascend:
  time: 3
  relocate: guide-house-upstairs
  say: You climb to the second floor.
descend:
  time: 3
  relocate: basement
  say: You head down into the basement.

# entity stairs-down
title: Stairs
descend:
  time: 3
  relocate: guide-house
  say: You head back down to the ground floor.

# entity stairs-up
title: Stairs
ascend:
  time: 3
  relocate: guide-house
  say: You climb back up to the ground floor.

# entity back-door
title: Back Door
examine: A plank door at the back of the room, swollen in its frame, with green light coming round the edge of it.
step out back:
  time: 3
  relocate: backyard
  say: You lean on the door until it gives, and step out into the yard.

# entity back-door-in
title: Back Door
step inside:
  time: 3
  relocate: guide-house
  say: You duck back in out of the wet.

# entity dresser
examine: A dusty dresser, one drawer left slightly ajar.
flags: searched
search drawer:
  hidden if: searched
  give: lockpick
  say: Tucked beneath old linens, a set of worn lockpicks.
  set: searched
  luck vs 60:
    roll: trinket

# entity window
examine: A casement over the water, its latch worn bright by somebody's thumb. It is a long drop to the sand and nothing on the way down to slow it.
climb out:
  instant
  relocate: market-square
  drain: 5 health
  say: You get a leg over the sill, hang off it as long as your arms will have it, and let go. The sand takes most of the drop and your ankles take the rest, and the road into town is right there.

# entity giant-rat
title: Giant Rat
examine: A hunched rat claws at an overturned crate, eyes red in the dark.
stats: attack 6-8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
uses: melee-combat
hidden if: rats-killed >= 3
on death:
  add: rats-killed 1
  say: You put down another rat.
  credit:
    roll: rat-remains
    1 in 3:
      roll: trinket

# location tulsa.market-square
-starting

# location guide-house
x: 6, y: 0
starting
examine: A cluttered but cozy cottage. Miki's guide house.
adjacent:
  guide-house-upstairs while guide-house-upstairs.touched
  basement while basement.touched
  backyard while backyard.touched
  market-square while front-door.unlocked or market-square.touched
entities:
  miki, front-door, stairs, mirror, oven, back-door

# location guide-house-upstairs
x: 6, y: 0, z: 1
examine: A narrow landing with a dresser and a view of the coast.
adjacent:
  guide-house
entities:
  dresser, stairs-down, window

# location basement
x: 0, y: 0, z: -1
examine: A damp cellar, crates stacked against the walls.
adjacent:
  guide-house
entities:
  3 giant-rat, stairs-up

# location backyard
x: 5, y: 0
examine: A strip of grass behind the house, walled on three sides, with a pond at the end of it deeper than it has any business being.
adjacent:
  guide-house
entities:
  fishing.shrimp-shoal, back-door-in
