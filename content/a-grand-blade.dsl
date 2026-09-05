# info a-grand-blade
version: 0.2.0
pack: quests
dependencies:
  core
  tulsa
  smithing
  combat

# quest finding-the-notes
title: A Grand Blade
log: The forge in the market row is cold, and the young smith at it does not look like a man who chose the work.

stage taken-up:
  log: I said I would find whatever his father hid from him, on nothing more than a riddle the man was fond of and never explained.
  tulsa.bladesmiths-son says:
    always
    ask: About your father's notes.
    He kept the whole of his trade in his head, or so everyone tells me now that it is too late to ask him. There should have been notes somewhere. Temperatures. Mixes. What iron wants that bronze doesn't.
    I have turned this shop over twice. Crates, the counter, the chimney. Nothing.
    The one thing of his that ever sounded like an answer was a riddle he was fond of: a real smith paves his own way. I took it for one of his jokes, the day he said it. He did not make jokes.
    -> I'll find them for you.
      goto searching

stage searching:
  log: His father's whole trade is somewhere in this shop, if the riddle means what it says: a real smith paves his own way.
  tulsa.bladesmiths-son says:
    when: not has smiths-notes
    ask: About the riddle again.
    again: Paves his own way. Not a road he built in his life that I ever heard of. I don't know what he meant by it either.
    He says it again slower, as though slowing it down might make it mean something else. A real smith paves his own way. It doesn't.
  tulsa.bladesmiths-son says:
    when: has smiths-notes
    ask: I found what your father hid.
    He goes quiet reading them, the way somebody goes quiet hearing a voice they had stopped expecting to hear again.
    "Paves his own way." He shuts the book on his thumb. "He built this floor. Never told me that either." A road-maker paves a road. My father was not a road-maker, unless he counted the anvil.
    take: 1 smiths-notes
    give: 1 grand-blade-schematic
    xp: smithing.smithing 400
    There's a blade in here too big for anything he ever sold — bar count, temper, the whole shape of it. I don't think he thought anyone would get this far. Take the pattern of it.
    One thing in here I can't get you, though. The bar count calls for iron with a grain in it that isn't ours — ratkin-work. He traded a warchief for a bar of it once, back when trading was still a thing you could do with them. I don't have that trade. If this gets made, you're the one taking the bar off whoever's holding it now.
    goto gathering-the-iron

stage gathering-the-iron:
  log: The pattern calls for a bar the shop cannot supply — ratkin ironwork, out past the muster, and nobody down there is giving it up for the asking.
  tulsa.bladesmiths-son says:
    when: not has ratkin-ingot
    ask: About the ratkin iron.
    again: Past the muster, and past whichever of them is minding it now. I know what I'm asking. I don't have a better way to ask it.
    He doesn't dress it up. "It's ratkin-work, out past the muster. Whoever's leading that lot these days isn't handing it over for a please." He doesn't say what happens if you can't take it off him. He doesn't have to.
  tulsa.bladesmiths-son says:
    when: has ratkin-ingot
    ask: I have the bar.
    He turns it over twice before he believes it's real, thumb along the grain like he's never felt metal sit like that before. "That's it. That's exactly what he traded for."
    He doesn't ask what it cost you to get it, which is its own kind of answer. He doesn't take it off you, either — that's a job for the anvil, not for his hands.
    goto forge-reopened

stage forge-reopened:
  log: The forge in the market row has a fire in it again, and the schematic for whatever the old man was building toward is mine to make good on.
  complete
  tulsa.bladesmiths-son says:
    always
    ask: About the forge, now.
    again: Fire's lit. Anvil's yours as much as it's mine, these days.
    Fire's lit for the first time since he died. Feels like it should have taken more than a book under a paving stone and a warchief's arm besides.

# entity tulsa.anvil
flags: notes-found
search under the anvil:
  hidden if: notes-found
  time: 8
  give: 1 smiths-notes
  set: notes-found
  say: One flag under the anvil's foot sits proud of the others, cut to fit around it rather than under it — set by whoever set the anvil there in the first place. It lifts on a fingernail. Underneath, wrapped against the damp, is a notebook that has not seen daylight in years.

# flag warchief-confronted

# entity combat.ratkin-warrior
push-to-the-warchief:
  requires: level.combat.attack >= 22
  hidden if: warchief-confronted or not finding-the-notes.gathering-the-iron
  instant
  set: warchief-confronted
  say: You put enough of them down, fast enough, that the ones still standing give ground rather than die for a stranger's fight. Past them, something a head taller than the rest turns to face you at last.
  on refused:
    say: You get three strides into the press before two spears meet in front of you and a third takes you back a step. Whatever is standing behind this lot, you are not getting past it today.

# entity ratkin-warchief
title: The Ratkin Warchief
examine: Scaled in plate the rest of the muster only wears pieces of, worked from an iron with a grain in it no Tulsa forge has ever put there.
hidden if: not warchief-confronted
tier: elite
profile: brute
level: 24
stats: physical-resistance 55
uses: core.melee-combat
faction: world
aggressive
respawn after: 3m
on death:
  credit:
    roll: combat.ratman-remains
    give: 1 ratkin-ingot

# location tulsa.the-muster
+entities: ratkin-warchief

# item ratkin-ingot
title: Ratkin Ingot
examine: A bar the colour of old iron and heavier than its size has any business being, worked in a grain that runs the wrong way for anything a Tulsa smith learned.

# item grand-blade-schematic
title: The Grand Blade Schematic
examine: Bar count, temper, and the whole shape of a blade too big for anything the shop ever sold, copied out in a steadier hand than whatever wrote the original.

# item grand-blade
title: Grand Blade
examine: A long, plain blade with nothing on it a smith would call decoration, and an edge that does not argue with anything it meets.
slot: mainhand
requires: level.combat.attack >= 25
value: 2400
item-level: 24-30
weapon, +23 physical-damage

# item smiths-notes
title: The Bladesmith's Notes
examine: A notebook wrapped in oilcloth, the pages gone soft at the corners from being read standing up.

# recipe grand-blade
station: anvil
in: 15 iron-bar, 1 hammer, 1 grand-blade-schematic, 1 ratkin-ingot
out: 1 grand-blade, 1 hammer, 1 grand-blade-schematic
skill: smithing 650
rate: smithing
say: You work the ratkin bar in with the rest, and the blade that comes off the anvil is not shaped like anything either of you made before.

# save outside-the-forge
{"version":13,"location":"tulsa.market-row","xp":{"combat.attack":200000,"combat.health":200000},"inventory":{"core.coin":1000,"smithing.iron-bar":15,"smithing.hammer":1}}

# test a-grand-blade-start-to-finish
unkillable
instant-kill
load: outside-the-forge
travel: forge
talk: tulsa.bladesmiths-son
choose: finding-the-notes.taken-up.bladesmiths-son.0.said
choose: I'll find them for you.
assert: finding-the-notes.searching
use: entity.anvil.search-under-the-anvil
assert: has smiths-notes
talk: tulsa.bladesmiths-son
choose: finding-the-notes.searching.bladesmiths-son.1.said
choose: continue
assert: not has smiths-notes
assert: has grand-blade-schematic
assert: finding-the-notes.gathering-the-iron
goto: the-muster
use: entity.combat.ratkin-warrior.push-to-the-warchief
assert: warchief-confronted
use: core.melee-combat on ratkin-warchief until has ratkin-ingot
cancel
assert: has ratkin-ingot
goto: forge
talk: tulsa.bladesmiths-son
choose: finding-the-notes.gathering-the-iron.bladesmiths-son.1.said
choose: continue
assert: has ratkin-ingot
assert: finding-the-notes.forge-reopened
craft: grand-blade
assert: has grand-blade
assert: has grand-blade-schematic
assert: not has ratkin-ingot

# save at-the-muster-with-the-schematic
{"version":13,"location":"tulsa.the-muster","xp":{"combat.attack":200000,"combat.health":200000},"flags":{"a-grand-blade.finding-the-notes.gathering-the-iron":true},"inventory":{"core.coin":1000,"smithing.iron-bar":15,"smithing.hammer":1,"a-grand-blade.grand-blade-schematic":1}}

# test the-warchief-is-not-taken-by-asking
unkillable
instant-kill
load: at-the-muster-with-the-schematic
use: entity.combat.ratkin-warrior.push-to-the-warchief
assert: warchief-confronted
use: core.melee-combat on ratkin-warchief until has ratkin-ingot
cancel
assert: has ratkin-ingot
goto: forge
talk: tulsa.bladesmiths-son
choose: finding-the-notes.gathering-the-iron.bladesmiths-son.1.said
choose: continue
assert: finding-the-notes.forge-reopened
craft: grand-blade
assert: has grand-blade

# save at-the-muster-untrained
{"version":13,"location":"tulsa.the-muster","flags":{"a-grand-blade.finding-the-notes.gathering-the-iron":true},"inventory":{"core.coin":1000}}

# test the-muster-turns-away-a-fighter-who-is-not-ready
load: at-the-muster-untrained
use: entity.combat.ratkin-warrior.push-to-the-warchief
assert: not warchief-confronted
