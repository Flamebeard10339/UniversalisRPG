# info the-swampy-menace
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  combat
  kill-it-with-fire
  ball-of-a-boy

# quest oolgas-errands
title: The Swampy Menace
log: The guard captain has been asking after me, and it is to do with whatever the sewers turned up.

stage sent-to-oolga:
  log: The captain wants me to help Oolga with whatever the sewers turned up, and told me to do whatever she says.
  guard-captain says:
    when: kill-it-with-fire.oolgas-basement.cellar-cleared and ball-of-a-boy.down-the-grate.reported
    ask: About the sewers.
    Whatever was breeding ratmen down there left something behind it never finished. Oolga's had a look and says she can cure it, given what she needs.
    Go and do whatever she tells you. I do not want to hear that you argued with her about it.
    goto errands

stage errands:
  log: Oolga has me carrying and fetching and will not say what any of it is for.
  done when: oolga-struck
  goto swamp-bound
  oolga says:
    always
    sticky
    ask: About the captain's errand.
    A cure wants doing properly, and properly wants a great many things you have never heard of, done in an order you would get wrong. Kettles scoured. Letters carried. Coin chased down for herbs I have not even named yet.
    You would not understand a word of it if I explained it twice. Just do what I say.
    -> What needs doing now?
      one of:
        1x: say: The cellar wants scouring, and you are the one with a bucket now.
        1x: say: A stack of letters, none of them addressed, all of them apparently urgent.
        1x: say: Three doors, three debts, none of them written down anywhere but her memory.

stage swamp-bound:
  log: Oolga wants three things out of the mire past the marsh gate — marsh thistle, fen root, and a leaf off the same hummock — and will not say what for. {has marsh-thistle: The thistle is in my pack.} {has fen-root: The root too.} {has adders-tongue: And the leaf.}
  done when: has marsh-thistle and has fen-root and has adders-tongue
  goto confronted
  oolga says:
    always
    ask: About the herbs.
    No need to get testy. You are right — the herbs I need can be found in the swamp. Go and get them now.
    again: The swamp. Thistle, root, and the leaf. Go on.

stage confronted:
  log: I have the herbs. Oolga is at her house, and the captain already knows there was never any cure to make. @@@ asked for the captain to be standing in Oolga's doorway for this; nothing in the grammar relocates an entity to a new room on a story beat, so she is spoken to wherever tulsa placed her instead, and either conversation reaches the same scene.
  oolga says:
    always
    ask: About the herbs.
    The captain is at the door before you have your boots off, and she has plainly been waiting for this. "Everything she needed," the captain says, not to you. "The whole time."
    Oolga does not deny it. "A body my age likes a bit of quiet now and then. You were only ever running errands for the look of it."
    The captain looks at you like she is deciding whose fault that is, and settles on yours.
    give: 3000 coin
    xp: combat.health 6000
    "For the trouble," she says, and does not sound like she thinks it was worth it either.
    goto settled
  guard-captain says:
    always
    ask: About Oolga's errands.
    You have not finished the sentence before she cuts you off. "I know. I have been standing in her doorway telling her so."
    Oolga, behind her, does not look sorry. "A body my age likes a bit of quiet now and then."
    "She had everything she needed the whole time," the captain says. "You were fetching for the look of it."
    give: 3000 coin
    xp: combat.health 6000
    "For the trouble," she says, and hands it over like it costs her something.
    goto settled

stage settled:
  log: Oolga had everything she needed the whole time. The captain knew it. I did the fetching anyway.
  complete
  oolga says:
    always
    ask: About the swamp.
    again: Same as I told the captain. Nothing wrong with me that a fetch boy didn't cure.
  guard-captain says:
    always
    ask: About Oolga.
    again: Filed. Same as everything else she wastes my guards' time on.

# flag oolga-struck

# flag herbs-found

# entity tulsa.oolga
stats: attack 0, defense 999, max-health 999999, attack-rate 20, accuracy 0, evasion 0
uses: core.melee-combat
when hit:
  if not oolga-struck:
    set: oolga-struck
    say: Oolga's mouth snaps shut around whatever she was about to say next.

# dialogue tulsa.castle-guard
node the-captain-wants-you:
  when: kill-it-with-fire.oolgas-basement.cellar-cleared and ball-of-a-boy.down-the-grate.reported and not oolgas-errands.errands
  ask: Anything for me, then?
  again: Round the side, and do not make her ask a third time.
  For once, yes. Captain's been down to this gate twice asking after you by name, and she does not come down to this gate.
  Round the side. Same place I always tell you she is, only this time she wants you in it.

# dialogue tulsa.guardsman
node the-captain-wants-you:
  when: kill-it-with-fire.oolgas-basement.cellar-cleared and ball-of-a-boy.down-the-grate.reported and not oolgas-errands.errands
  ask: Anything doing?
  again: Barracks. Captain. Today, if it is all the same to you.
  Nothing up here, same as ever. Something at the barracks, though. Captain has had your name written down since the sewers, and she does not write names down for the pleasure of it.

# dialogue tulsa.larry
node the-captain-wants-you:
  when: kill-it-with-fire.oolgas-basement.cellar-cleared and ball-of-a-boy.down-the-grate.reported and not oolgas-errands.errands
  ask: Has anyone been asking after me?
  again: She is still asking, and I am still no help to her.
  The captain has, round this very hatch, and I told her I could not say where you were on account of not knowing. She looked at me as though that were my doing as well.
  Go and see her before she comes back and makes it my doing twice.

# droptable herb-find
if herbs-found = 0:
  say: Past the hummock, in the bushes, straw is scattered out of a smashed crate — and in among the straw, a clutch of insect eggs, broken open from the inside, badly and strangely wrong.
if herbs-found = 1:
  say: The same crate, kicked open further this time: alchemy glass, coils of tube, powders gone to paste in the wet — thrown in and abandoned rather than lost.
if herbs-found >= 2:
  say: Something surges up out of the mud before your hand closes round it — not a rat, though it was one once, and not a toad either.

# entity tulsa.herb-patch
pick thistle:
  +before:
    if not has marsh-thistle:
      roll: herb-find
      add: herbs-found 1
pull root:
  +before:
    if not has fen-root:
      roll: herb-find
      add: herbs-found 1
take the leaf:
  +before:
    if not has adders-tongue:
      roll: herb-find
      add: herbs-found 1

# entity rat-toad
title: Rat-Toad
examine: A rat's shape gone wrong in a toad's skin — too many teeth, and none of either animal's reasons to run from you.
stats: attack 22, defense 6, max-health 80, attack-rate 22, accuracy 85, evasion 40
uses: core.melee-combat
faction: world
aggressive
hidden if: not has marsh-thistle or not has fen-root or not has adders-tongue
respawn after: 10m
on death:
  credit:
    roll: ratman-remains

# location tulsa.swamp-mire
+entities: rat-toad

# save both-prior-quests-done
over: tulsa.in-town, tulsa.holding-a-hand-axe
{"version":13,"flags":{"kill-it-with-fire.oolgas-basement.cellar-cleared":true,"ball-of-a-boy.down-the-grate.reported":true}}

# save ambushed-in-the-mire
over: both-prior-quests-done
{"version":13,"location":"tulsa.swamp-mire","inventory":{"core.marsh-thistle":1,"core.fen-root":1,"core.adders-tongue":1},"flags":{"oolgas-errands.errands":true,"oolgas-errands.swamp-bound":true,"oolga-struck":true}}

# test oolga-sends-you-into-the-mire
load: both-prior-quests-done
equip: 1
travel: castle-gate
talk: castle-guard
choose: continue
assert: castle-guard.the-captain-wants-you.visits = 1
travel: guard-barracks
talk: guard-captain
choose: oolgas-errands.sent-to-oolga.guard-captain.0.said
choose: continue
assert: oolgas-errands.errands
travel: castle-gate
travel: market-square
travel: tavern-street
travel: oolga-house
talk: oolga
choose: oolgas-errands.errands.oolga.0.said
choose: What needs doing now?
talk: oolga
choose: oolgas-errands.errands.oolga.0.said
choose: What needs doing now?
use: melee-combat on oolga until oolga-struck
assert: oolga-struck
talk: oolga
choose: oolgas-errands.swamp-bound.oolga.0.said
choose: continue
assert: oolgas-errands.swamp-bound
travel: tavern-street
travel: market-square
travel: swamp-edge
travel: swamp-mire

# test the-swampy-menace-start-to-finish
run: oolga-sends-you-into-the-mire
use: entity.herb-patch.pull-root
assert: has fen-root
travel: swamp-edge
travel: swamp-mire
use: entity.herb-patch.pick-thistle
assert: has marsh-thistle
unkillable
instant-kill
travel: swamp-edge
travel: swamp-mire
use: entity.herb-patch.take-the-leaf
assert: has adders-tongue
use: melee-combat on rat-toad until done
assert: not fainted
travel: swamp-edge
travel: market-square
travel: tavern-street
travel: oolga-house
talk: oolga
choose: oolgas-errands.confronted.oolga.0.said
choose: continue
assert: oolgas-errands.settled
assert: inventory.coin > 0
assert: xp.combat.health > 0

# test the-rat-toad-is-outrun-rather-than-fought
load: ambushed-in-the-mire
unkillable
wait: 5
assert: not fainted
travel: swamp-edge
assert: not fainted
travel: market-square
assert: not fainted

# test the-swampy-menace-with-the-herbs-found-in-a-different-order
run: oolga-sends-you-into-the-mire
use: entity.herb-patch.pick-thistle
assert: has marsh-thistle
travel: swamp-edge
travel: swamp-mire
use: entity.herb-patch.take-the-leaf
assert: has adders-tongue
unkillable
instant-kill
travel: swamp-edge
travel: swamp-mire
use: entity.herb-patch.pull-root
assert: has fen-root
use: melee-combat on rat-toad until done
assert: not fainted
travel: swamp-edge
travel: market-square
travel: tavern-street
travel: oolga-house
talk: oolga
choose: oolgas-errands.confronted.oolga.0.said
choose: continue
assert: oolgas-errands.settled
assert: inventory.coin > 0
assert: xp.combat.health > 0
