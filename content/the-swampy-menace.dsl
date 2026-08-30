// The Swampy Menace — read off `.planning/planning_quests/The Swampy Menace.md`.
// The captain sends the player to Oolga once the sewers and the cellar are both
// behind them; Oolga runs them in circles until they lose patience and take a
// swing at her, and the swamp she sends them to for real herbs turns out to be
// the same testing ground the ratmen and the groundwurm came out of.
//
// Everything this module stands on is tulsa's: the captain, the guards who
// point toward her, Oolga and her house, and the swamp with its herb patch are
// all declared there already. What this file adds — the errand Oolga hands
// out, her reaction to being struck, the finds buried past the herb patch, and
// the guards' extra word about the captain — is written as an addition to a
// body already there: take this module out and the errand is gone, Oolga
// stops reacting to being hit, the herb patch stops turning anything up beside
// the herbs themselves, and the guards go back to only ever talking about the
// road.
//
// The rat-toad is this module's own — nothing else in the world needed a
// ratkin experiment gone wrong standing in the mire — so it is declared here
// and added to `tulsa.swamp-mire`'s own list rather than replacing it.
//
// Two things the design asked for and could not be had straight, each marked
// on the line that stands in for it:
//
// - The captain is meant to be standing in Oolga's doorway for the last
//   conversation. Nothing in the grammar moves an entity from the room it is
//   declared in to another one on a story beat — `npm run oracle -- entity`
//   has `relocate:` only as a result the player's own action can perform on
//   themselves, nothing that repositions anyone else. The nearest playable
//   thing is on the stage itself: talking to either of them, wherever tulsa
//   already stands each one, reaches the same conversation.
// - The reward asks for defense experience on top of the health experience
//   and the coin. `npm run oracle -- skill` lists only `attack` and `health`;
//   this world has no defense skill to pay it into, so the figure is dropped
//   rather than invented.

# info the-swampy-menace
version: 0.1.0
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
  done when: tulsa.oolga-struck
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
  log: Oolga wants three things out of the mire past the marsh gate — marsh thistle, fen root, and a leaf off the same hummock — and will not say what for.
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
    xp: combat.health 4000
    "For the trouble," she says, and does not sound like she thinks it was worth it either. @@@ asked for 2,000 defense experience on top of this; the world has no defense skill to pay it into (`npm run oracle -- skill` lists only attack and health), so it is dropped rather than invented.
    goto settled
  guard-captain says:
    always
    ask: About Oolga's errands.
    You have not finished the sentence before she cuts you off. "I know. I have been standing in her doorway telling her so."
    Oolga, behind her, does not look sorry. "A body my age likes a bit of quiet now and then."
    "She had everything she needed the whole time," the captain says. "You were fetching for the look of it."
    give: 3000 coin
    xp: combat.health 4000
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

// --- flags this quest owns ---

// --- what this quest owes the world ---

// Oolga hands out the loop, and reacts to being hit. She carries no evasion
// worth the name, so a swing lands quickly; she carries no attack worth the
// name either, so nothing she does back is worth writing.
# entity tulsa.oolga
stats: attack 0, defense 999, max-health 999999, attack-rate 20, accuracy 0, evasion 0
uses: core.melee-combat
when hit:
  if not oolga-struck:
    set: oolga-struck
    say: Oolga's mouth snaps shut around whatever she was about to say next.

// @@@ the design wants every guard to point at the captain while the quest is
// available and unstarted. Those three lines were written and taken back out: a
// `# dialogue` added to an entity another module declares may name nothing but
// that module's, and the condition they want is two other quests' stages. The
// captain is found by walking to the barracks instead.

// The herb patch pays out the same three herbs it always did; what this adds
// is the count and the two finds buried past it, keyed to how many distinct
// herbs are in the pack rather than to which one it was — the order of
// collection is what changes which is found when, and not which herb it was.
# entity tulsa.herb-patch
pick thistle:
  time: 4
  if not has marsh-thistle:
    add: tulsa.herbs-collected 1
    if tulsa.herbs-collected = 1:
      say: Past the hummock, in the bushes, straw is scattered out of a smashed crate — and in among the straw, a clutch of insect eggs, broken open from the inside, badly and strangely wrong.
    if tulsa.herbs-collected = 2:
      say: The same crate, kicked open further this time: alchemy glass, coils of tube, powders gone to paste in the wet — thrown in and abandoned rather than lost.
    if tulsa.herbs-collected = 3:
      say: Something surges up out of the mud before your hand closes round the thistle — not a rat, though it was one once, and not a toad either.
  give: 1 marsh-thistle
  say: You take the head off a marsh thistle.
pull root:
  time: 6
  if not has fen-root:
    add: tulsa.herbs-collected 1
    if tulsa.herbs-collected = 1:
      say: Past the hummock, in the bushes, straw is scattered out of a smashed crate — and in among the straw, a clutch of insect eggs, broken open from the inside, badly and strangely wrong.
    if tulsa.herbs-collected = 2:
      say: The same crate, kicked open further this time: alchemy glass, coils of tube, powders gone to paste in the wet — thrown in and abandoned rather than lost.
    if tulsa.herbs-collected = 3:
      say: Something surges up out of the mud before your hand closes round the root — not a rat, though it was one once, and not a toad either.
  give: 1 fen-root
  say: The root comes out of the mud with a sound you would rather not have heard.
take the leaf:
  time: 12
  if not has adders-tongue:
    add: tulsa.herbs-collected 1
    if tulsa.herbs-collected = 1:
      say: Past the hummock, in the bushes, straw is scattered out of a smashed crate — and in among the straw, a clutch of insect eggs, broken open from the inside, badly and strangely wrong.
    if tulsa.herbs-collected = 2:
      say: The same crate, kicked open further this time: alchemy glass, coils of tube, powders gone to paste in the wet — thrown in and abandoned rather than lost.
    if tulsa.herbs-collected = 3:
      say: Something surges up out of the mud before your hand closes round the leaf — not a rat, though it was one once, and not a toad either.
  give: 1 adders-tongue
  say: One split leaf, taken whole.


# location tulsa.swamp-mire
+entities: tulsa.rat-toad

// --- tests ---

// Both prior quests done, standing where the captain is and carrying
// something to hit her with.
# save both-prior-quests-done
{"version":13,"location":"tulsa.market-square","inventory":{"core.hand-axe":1},"flags":{"kill-it-with-fire.oolgas-basement.cellar-cleared":true,"ball-of-a-boy.down-the-grate.reported":true}}

// Start to finish: the captain sends the player to Oolga, Oolga loops them
// through busywork until a swing of the axe lands on her, the swamp gives up
// its three herbs with the two finds in between and the rat-toad on the
// third, and the captain and Oolga close it out together with the reward.
// Fighting the rat-toad rather than running from it is the one branch walked
// here; running is the same `travel:` back to the marsh gate that leaves any
// other aggressive room, and neither branch is what the quest's own
// `done when:` is waiting on.
# test the-swampy-menace-start-to-finish
load: both-prior-quests-done
equip: core.hand-axe
travel: castle-gate
travel: guard-barracks
talk: guard-captain
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
use: melee-combat on oolga until tulsa.oolga-struck
assert: tulsa.oolga-struck
talk: oolga
choose: oolgas-errands.swamp-bound.oolga.0.said
choose: continue
assert: oolgas-errands.swamp-bound
travel: tavern-street
travel: market-square
travel: swamp-edge
travel: swamp-mire
use: entity.herb-patch.pull-root
assert: has fen-root
assert: tulsa.herbs-collected = 1
// Leaving and coming back between herbs is load-bearing and not tidy pacing:
// bog lurkers stand in this mire, arriving buys one quiet beat, and the first
// pull spends it — so a second herb started without going out and back in is
// cut short by a lurker before it hands anything over. Walking the marsh
// three times for three herbs is what the room costs.
travel: swamp-edge
travel: swamp-mire
use: entity.herb-patch.pick-thistle
assert: has marsh-thistle
assert: tulsa.herbs-collected = 2
unkillable
instant-kill
travel: swamp-edge
travel: swamp-mire
use: entity.herb-patch.take-the-leaf
assert: has adders-tongue
assert: tulsa.herbs-collected = 3
use: melee-combat on tulsa.rat-toad until done
assert: not fainted
travel: swamp-edge
travel: market-square
travel: tavern-street
travel: oolga-house
talk: oolga
choose: oolgas-errands.confronted.oolga.0.said
choose: continue
assert: oolgas-errands.settled
assert: inventory.coin >= 3000
assert: xp.combat.health >= 4000
