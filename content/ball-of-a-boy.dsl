# info ball-of-a-boy
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  combat
  thieving

# quest down-the-grate
title: Ball of a Boy
log: There is a boy hunched over the sewer grate in the market square, and he will not say what he has lost.

stage asked:
  log: Mouse dropped his ball through the grate, and I said I would go down after it.
  tulsa.mouse says:
    always
    ask: What's wrong?
    It went down the grate. My ball. I can't reach it and nobody else will go.
    There's a hatch down into the sewers round the back of the castle. A guard sits on it, but that's the way.
    Will you get it back for me?
    -> I'll get it back for you.
      goto down-below

stage down-below:
  log: The channels under the town run to a barred door, and whatever the water carried went through it.
  done when: tulsa.barred-door.unlocked
  goto back-up
  tulsa.mouse says:
    when: tulsa.sewer-outfall.discovered
    ask: About the ball.
    again: Maybe it went through the locked door. That's all I know.
    Maybe it fell into the water and got carried through that locked door.

stage back-up:
  log: The grate was empty and so was Mouse's spot beside it when I climbed back out of the sewers. I should tell a guard what is down there.
  tulsa.larry says:
    always
    ask: About what's under the town.
    Larry doesn't say anything for a moment. "Ratmen," he says, like the word tastes wrong. "And somebody's book on making more of them."
    He does not ask what happened to the boy, and he does not offer to go down and look either.
    xp: combat.health 1000
    xp: thieving.thieving 1500
    goto reported
  tulsa.guard-captain says:
    always
    ask: About what's under the town.
    She puts the report down for this one. "Ratmen," she says, and it is not a question. "Under my own market square." She hears the rest of it — the book, the table, the room kept dry behind the water — without once interrupting.
    "That is worth knowing, and worth paying for knowing." She counts the coin out without checking the sum twice.
    give: 500 core.coin
    xp: combat.health 1000
    xp: thieving.thieving 1500
    goto reported

stage reported:
  log: I told a guard what the book in that locked room said was done to a man down there. Whoever heard it did not look glad to know it.
  complete

# entity tulsa.mouse
hidden if: down-the-grate.back-up

# dialogue tulsa.town-crier
node the-back-way:
  when: down-the-grate.asked and not down-the-grate.back-up
  ask: About the sewers.
  again: Same as I said. The old witch's cellar, if the hatch is shut to you.
  "The sewers? Everyone goes at the hatch, and the hatch wants paying." He does not quite lower the bell, which is as close as he gets to lowering his voice. "There's a wall down in Oolga's cellar that's been open for years and nobody minding it. I don't cry that one. Free, though, same as everything else I say."

# dialogue tulsa.oolga
node the-cellar-wall:
  when: down-the-grate.asked and not down-the-grate.back-up
  ask: About your cellar.
  again: Still down there. Still my sacks, whatever's left of them.
  "My cellar wall came down into the sewer years ago, and I have never once had it mended." She looks at you the way she looks at everything, over the top of it. "Go and look, if the front way is shut to you. Mind the sacks. Something's been at them."

# entity tulsa.sewer-signs
examine: MARKET one way, CASTLE another, GATE a third. Whoever painted them was doing the town a favour. {down-the-grate.down-below and not down-the-grate.back-up: The one marked MARKET is the way the water goes.}

# entity tulsa.outfall-grate
examine: A grate to the surface, market noise falling through it in pieces. {down-the-grate.down-below and not down-the-grate.back-up: The boy is up there, waving at you through the bars.}

# entity tulsa.larry
pay the toll:
  instant
  hidden if: sewer-toll-paid
  requires: has 1000 core.coin
  take: 1000 core.coin
  set: sewer-toll-paid
  say: Larry weighs the coin in his palm, decides it outweighs the duke's word, and gets up off the hatch without quite looking at you. "Never saw you," he says, to the barrels.
haggle with a cooked herring:
  instant
  hidden if: sewer-toll-paid
  requires: has core.cooked-herring and has 200 core.coin
  take: 1 core.cooked-herring
  take: 200 core.coin
  set: sewer-toll-paid
  say: You set the herring down on the hatch before he can answer the coin, and something in Larry's arithmetic gives before the duke's word does. "Sunny's?" He does not wait to be told. "Two hundred, then, and neither of us saw the other." He pockets both and gets up off the hatch.

# entity tulsa.key-table
read the book:
  instant
  say: The book beside the key sets out, step by patient step, how to turn a man into a ratman — what is broken first, what is fed to him, how long the change takes if he lives through it. Someone has read it enough times to have worn the corners round.

# flag escaped-through-the-lock

# flag ratmen-killed

# flag killed-both-ratmen

# entity barred-door-from-inside
title: The Barred Door
examine: The door you came in by, seen from the wrong side of it, and it does not give from here the way it did from there.
pick the lock from the inside:
  hidden if: escaped-through-the-lock
  requires: level.thieving >= 15
  time: 10
  on success:
    set: escaped-through-the-lock
    say: The wards were never cut to be worked backwards, and it takes you a great deal longer to find out you can anyway. The last one turns, grudging, and the door gives.

# location tulsa.sewer-locked-room
-adjacent: sewer-outfall
+adjacent: sewer-outfall while has tulsa.sewer-key or escaped-through-the-lock
+entities: barred-door-from-inside

# entity combat.ratman
on death:
  add: ratmen-killed 1
  if ratmen-killed >= 2:
    set: killed-both-ratmen

# save at-the-grate
{"version":13,"location":"tulsa.market-square","inventory":{"core.coin":1000,"core.lockpick":1}}

# save at-the-grate-with-a-herring
{"version":13,"location":"tulsa.market-square","inventory":{"core.coin":200,"core.lockpick":1,"core.cooked-herring":1}}

# save fresh-at-the-barred-door
over: tulsa.at-the-sewer-junction
{"version":13,"xp":{"thieving.thieving":500}}

# save a-steadier-hand-at-the-junction
over: tulsa.at-the-sewer-junction
{"version":13,"xp":{"thieving.thieving":30000}}

# test the-toll-buys-a-quiet-word-with-larry
load: at-the-grate
talk: tulsa.mouse
choose: down-the-grate.asked.mouse.0.said
choose: I'll get it back for you.
assert: down-the-grate.down-below
travel: castle-gate
travel: castle-yard
use: entity.larry.pay-the-toll
assert: tulsa.sewer-toll-paid
travel: sewer-entrance
travel: sewer-junction
wait: done
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
assert: barred-door.unlocked
assert: down-the-grate.back-up
travel: sewer-locked-room
use: entity.key-table.read-the-book
use: entity.key-table.take-the-key
travel: sewer-outfall
travel: sewer-junction
travel: sewer-entrance
travel: castle-yard
talk: tulsa.larry
choose: down-the-grate.back-up.larry.0.said
assert: down-the-grate.reported
assert: xp.combat.health >= 1000
assert: xp.thieving.thieving >= 1500

# test the-captain-pays-a-bounty-for-the-news
load: at-the-grate
talk: tulsa.mouse
choose: down-the-grate.asked.mouse.0.said
choose: I'll get it back for you.
travel: castle-gate
travel: castle-yard
use: entity.larry.pay-the-toll
travel: sewer-entrance
travel: sewer-junction
wait: done
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
travel: sewer-locked-room
use: entity.key-table.take-the-key
travel: sewer-outfall
travel: sewer-junction
travel: sewer-entrance
travel: castle-yard
travel: castle-gate
travel: guard-barracks
talk: tulsa.guard-captain
choose: down-the-grate.back-up.guard-captain.1.said
assert: down-the-grate.reported
assert: xp.combat.health >= 1000
assert: xp.thieving.thieving >= 1500
assert: inventory.core.coin >= 500

# test a-cooked-herring-haggles-the-toll-down
load: at-the-grate-with-a-herring
talk: tulsa.mouse
choose: down-the-grate.asked.mouse.0.said
choose: I'll get it back for you.
travel: castle-gate
travel: castle-yard
use: entity.larry.haggle-with-a-cooked-herring
assert: tulsa.sewer-toll-paid
assert: not has core.cooked-herring
assert: inventory.core.coin = 0
travel: sewer-entrance
travel: sewer-junction
wait: done
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
travel: sewer-locked-room
use: entity.key-table.take-the-key
travel: sewer-outfall
travel: sewer-junction
travel: sewer-entrance
travel: castle-yard
talk: tulsa.larry
choose: down-the-grate.back-up.larry.0.said
assert: down-the-grate.reported

# test the-back-way-answers-when-the-front-does-not
load: at-the-grate
talk: tulsa.mouse
choose: down-the-grate.asked.mouse.0.said
choose: I'll get it back for you.
travel: tavern-street
travel: oolga-house
travel: oolga-basement
use: entity.broken-wall.squeeze-through
assert: sewer-junction.discovered
wait: done
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
travel: sewer-locked-room
use: entity.key-table.take-the-key
travel: sewer-outfall
travel: sewer-junction
travel: sewer-entrance
travel: castle-yard
assert: not tulsa.sewer-toll-paid
talk: tulsa.larry
choose: down-the-grate.back-up.larry.0.said
assert: down-the-grate.reported

# test the-locked-room-holds-until-the-key-or-the-nerve-is-there
unkillable
load: a-steadier-hand-at-the-junction
travel: sewer-outfall
wait: done
use: entity.barred-door.pick-lock
assert: barred-door.unlocked
travel: sewer-locked-room
use: entity.barred-door-from-inside.pick-the-lock-from-the-inside
assert: escaped-through-the-lock
travel: sewer-outfall
