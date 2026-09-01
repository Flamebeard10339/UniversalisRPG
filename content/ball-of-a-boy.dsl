# info ball-of-a-boy
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa

# quest down-the-grate
title: Ball of a Boy
log: There is a boy hunched over the sewer grate in the market square, and he will not say what he has lost.

stage asked:
  log: Mouse dropped his ball through the grate, and I said I would go down after it.
  tulsa.mouse says:
    always
    ask: What's wrong?
    It went down the grate. My ball. I can't reach it and nobody else will go.
    Will you get it back for me?
    -> I'll get it back for you.
      goto down-below

stage down-below:
  log: The channels under the town run to a barred door, and whatever the water carried went through it.
  done when: tulsa.barred-door.unlocked
  goto back-up

stage back-up:
  log: The grate was empty and so was Mouse's spot beside it when I climbed back out of the sewers. I should tell a guard what is down there.
  tulsa.larry says:
    always
    ask: About what's under the town.
    Larry doesn't say anything for a moment. "Ratmen," he says, like the word tastes wrong. "And somebody's book on making more of them."
    He does not ask what happened to the boy, and he does not offer to go down and look either.
    goto reported

stage reported:
  log: I told Larry what the book in that locked room said was done to a man down there. He did not look glad to know it.
  complete

# entity tulsa.larry
pay the toll:
  instant
  hidden if: sewer-toll-paid
  requires: has 5 core.coin
  take: 5 core.coin
  set: sewer-toll-paid
  say: Larry weighs the coin in his palm, decides it outweighs the duke's word, and gets up off the hatch without quite looking at you. "Never saw you," he says, to the barrels.

# entity tulsa.key-table
read the book:
  instant
  say: The book beside the key sets out, step by patient step, how to turn a man into a ratman — what is broken first, what is fed to him, how long the change takes if he lives through it. Someone has read it enough times to have worn the corners round.

# save at-the-grate
{"version":13,"location":"tulsa.market-square","inventory":{"core.coin":10,"core.lockpick":1}}

# test the-ball-is-never-coming-back
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
