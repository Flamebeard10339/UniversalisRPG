# info reverse-infiltration
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  combat
  the-rat-conspiracy
  the-swampy-menace

# quest reverse-infiltration
title: Reverse Infiltration
log: The captain has had guards standing extra watches since the tunnel and the swamp both turned out to be the same story. She wants me in the barracks.

stage sent-across:
  log: The captain is sending a party over the ratkin border to find out what is actually coming, not what the tunnel already said. I am going with them.
  guard-captain says:
    when: the-rat-conspiracy.rat-conspiracy.settled and the-swampy-menace.oolgas-errands.settled
    ask: About the extra watches.
    She does not look up from the roster until she has finished the line she is on. "You are the only one who has been under that border and come back able to say anything useful about it. Twice now."
    I am sending five over the wire — Vance and four of his. You go with them. Find out what is actually coming, not what a tunnel full of rats already told us. I want it named before I stand this town up over a rumour.
    Vance has the patrol. Past the stakes you take his lead, not the other way round.
    goto to-the-wire

stage to-the-wire:
  log: The border outpost is past the tunnels and the muster, the last post Tulsa keeps in that direction. Vance's party will be forming up there.
  border-guard says:
    always
    ask: About the crossing.
    He looks past you at the five assembling rather than at you. "Two of us out here for a year and nobody past the stakes in all of it. Now it's five at once and everybody pretending that's routine."
    Wire's ahead. Vance is already through it, doing what he does before anyone else goes — deciding whether he likes it.
    goto over-the-wire

stage over-the-wire:
  log: Past the stakes the ground stops being anyone Tulsa answers to. Vance and his four are waiting on the other side of it.
  done when: beyond-the-wire.discovered
  goto the-warcamp
  vance says:
    always
    ask: About the crossing.
    He has a hand up before you have finished crossing, which is as close as he gets to a greeting. "This is what five spears buys you. Past this point it gets quieter with fewer of us in it, not louder — you go on, we hold the ground back to the wire."
    Anything comes out of there after you, it comes out through us. That is the whole plan. Try not to need it. @@@ wanted Vance's five to fight beside the player crossing the wire and stand down once the quest ended; `allies:` takes no `while` or `when` of its own and, laid over `tulsa.player`, never comes back off once written — so they hold the ground instead, and the fight past this point is the player's alone.

stage the-warcamp:
  log: Whatever mustered past the wire has stopped mustering. The camp beyond it is dug in properly, tents in rows, nothing about it thrown together.
  done when: warcamp-searched
  goto the-laboratory
  vance says:
    when: not warcamp-searched
    ask: About the camp.
    again: Go through it properly. We are not doing this twice.

stage the-laboratory:
  log: The tents back onto a dug hall with too much lamplight and too much glassware in it for a war camp. Whatever the muster was staging for, it was planned in here.
  done when: plague-revealed
  goto the-twins

stage the-twins:
  log: The ledger named him. Whatever answered out of the dark past the last lamp did not wait to be introduced.
  done when: escaped-the-lab
  goto report-back

stage report-back:
  log: Vance's line held long enough to matter. What is coming across the wire has a name and a date now, and the captain needs to hear both before anyone else does.
  guard-captain says:
    always
    ask: About what is coming.
    She listens through the whole of it without once reaching for the roster, which is not like her. "A name and a date. That is more than the tunnel gave us and worse than I wanted."
    I cannot put that in front of the duke and expect him to move before it is standing at the wall. I can put it in front of every guard I have got, and I am going to. Whatever this costs you, it bought the town time it did not have an hour ago.
    xp: combat.attack 12500
    xp: combat.health 18500
    "For the trouble," she says, and for once means it the way it sounds.
    goto settled

stage settled:
  log: Tulsa does not believe it yet. The captain does, in the way she is making every guard she has stand an extra watch for a border nobody but five of them and I have seen.
  complete
  guard-captain says:
    always
    ask: About the border.
    again: Filed, same as everything else — except this one I am still losing sleep over.
  vance says:
    always
    ask: About the border.
    again: We held the ground. You did the part that mattered. Go and get some sleep; I am not going to.

# flag warcamp-searched

# flag plague-revealed

# flag twins-defeated

# flag escaped-the-lab

# item unique-twinned-ward
title: Twinned Ward
examine: Two rings cast from the same pour and never quite finished separating, still fused along one seam.
value: 1400
cluster-jewel:
  shape: double-ring
  open-connections: e, sw
  passives:
    1 combat.chaos-ward
    2 combat.hardened
    3 combat.constitution
    4 combat.chaos-ward
    5 combat.mending
    6 combat.constitution
    10 combat.tempered-frame

# action flee-the-lab
title: Fall Back to the Wire
time: 6
on success:
  say: You do not wait to see what else the alarm brings up out of the dark. The lamps are still swinging behind you when the tents give way to open ground, and the tents give way to the wire, and Vance's five close up around you without anybody saying why.
  set: escaped-the-lab
  relocate: tulsa.ratkin-border

# entity vance
title: Vance
examine: One of the captain's own, plate scuffed to a matte finish on purpose, watching the tree line the way the border guards stopped bothering to.
faction: world

# entity abandoned-tents
title: The Supply Tents
examine: Canvas staked in neat rows, crates stencilled in a hand too careful for a border muster, and none of it thrown together the way an enemy that is only playing at being an army would leave it.
search the stores:
  hidden if: warcamp-searched
  instant
  set: warcamp-searched
  say: The crates are full and numbered, and the numbers are consistent — this is not a raiding camp, it is a staging one. Under the last crate, a marked map shows the tunnels Tulsa thinks are its own secret, and a line drawn through the wire straight at the town gate.

# entity mutagen-thrall
title: Mutagen Thrall
examine: A ratkin still recognisably a ratkin, until the joints — too many of them, and each one weeping something that is not blood and does not smell like anything blood should.
stats: attack 15-19, defense 6, max-health 90, attack-rate 20, accuracy 78, evasion 30, chaos-damage 10
uses: core.melee-combat
faction: world
aggressive
respawn after: 5m
on death:
  credit:
    roll: combat.ratman-remains

# entity plague-ledger
title: The Black Plague's Ledger
examine: Pages in a careful hand, human letters used the way somebody teaches themselves rather than learns, sums and dates ruled off in columns too neat for anything else down here.
read the ledger:
  hidden if: plague-revealed
  instant
  set: plague-revealed
  say: The sums are a headcount and the dates are a march. Both are signed the same way, over and over, in a hand that has stopped writing its own ratkin name: the Black Plague. Whatever he was before he decided that, he is done being it, and what he has under him is not a muster any more. It is an army, and it has a date on it that is closer than the walk home.

# entity the-twins
title: The Twins
examine: Two ratkin built like they came off the same mould and stopped being finished at the same moment, moving to answer each other rather than you — and the wounds they hand out do not close the way a blade's would.
stats: attack 20-26, defense 13, max-health 400, attack-rate 22, accuracy 86, evasion 28, chaos-damage 16
uses: core.melee-combat
faction: world
aggressive
hidden if: not plague-revealed
on death:
  credit:
    say: The second one goes down within a breath of the first, the way everything about the two of them has happened within a breath of each other, and for a moment neither the lamps nor anything else in the hall moves at all. Then, somewhere back through the tents, something starts ringing that is not a bell.
    1 in 3: give: 1 unique-twinned-ward
    set: twins-defeated
    perform: flee-the-lab

# dialogue tulsa.guard-captain
node reverse-infiltration-aftermath:
  when: reverse-infiltration.settled
  sticky
  ask: About the extra watches.
  Every guard I have got, doubled up, for a border most of them still think is a story. I would rather look foolish than right too late.

# dialogue tulsa.larry
node reverse-infiltration-aftermath:
  when: reverse-infiltration.settled
  sticky
  ask: About the border.
  You go over a border and come back like that, and everyone carries on same as ever. I believe you. Half the reason nobody else does is you did not come back saying much either.

# dialogue tulsa.mott
node reverse-infiltration-aftermath:
  when: reverse-infiltration.settled
  sticky
  ask: About the extra watches.
  Still baking regardless. "Extra watches," they tell me, for something one guard captain is scared of. That does not usually turn into something the rest of us have to be, and I have got bread either way.

# location beyond-the-wire
x: 19, y: 11
title: Past the Wire
examine: Stakes and banked earth behind you, and ahead of it ground nobody from Tulsa has ever had reason to name.
adjacent:
  tulsa.ratkin-border
  plague-warcamp
entities:
  vance

# location plague-warcamp
x: 21, y: 11
title: The Warcamp
examine: Tents in real rows, a picket line built for something bigger than a horse, and none of the disorder you would want to find in an enemy that is only playing at being an army.
adjacent:
  beyond-the-wire
  plague-laboratory
entities:
  abandoned-tents, mutagen-thrall

# location plague-laboratory
below plague-warcamp
title: The Black Plague's Laboratory
examine: A dug hall behind the tents, lit better than a war camp has any reason to be, with glassware standing on every surface and none of it broken by accident.
adjacent:
  plague-warcamp
entities:
  plague-ledger, the-twins

# save both-quests-settled
{"version":13,"location":"tulsa.market-square","flags":{"the-rat-conspiracy.rat-conspiracy.settled":true,"the-swampy-menace.oolgas-errands.settled":true,"tulsa.ratkin-border.discovered":true}}

# save at-the-twins-for-balance
DEBUG
{"version":13,"location":"reverse-infiltration.plague-laboratory","flags":{"the-rat-conspiracy.rat-conspiracy.settled":true,"the-swampy-menace.oolgas-errands.settled":true,"tulsa.ratkin-border.discovered":true,"reverse-infiltration.beyond-the-wire.discovered":true,"reverse-infiltration.plague-warcamp.discovered":true,"reverse-infiltration.plague-laboratory.discovered":true,"reverse-infiltration.warcamp-searched":true,"reverse-infiltration.plague-revealed":true}}

# test reverse-infiltration-start-to-finish
unkillable
instant-kill
load: both-quests-settled
travel: guard-barracks
talk: guard-captain
choose: reverse-infiltration.sent-across.guard-captain.0.said
choose: continue
assert: reverse-infiltration.to-the-wire
travel: castle-gate
travel: market-square
travel: kelsa-farmhouse
travel: bee-gate
travel: tunnel-mouth
travel: tunnels
travel: ratkin-border
talk: border-guard
assert: reverse-infiltration.over-the-wire
travel: beyond-the-wire
assert: reverse-infiltration.the-warcamp
talk: vance
choose: continue
travel: plague-warcamp
use: entity.abandoned-tents.search-the-stores
assert: warcamp-searched
assert: reverse-infiltration.the-laboratory
travel: plague-laboratory
use: entity.plague-ledger.read-the-ledger
assert: plague-revealed
assert: reverse-infiltration.the-twins
use: melee-combat on the-twins until done
assert: twins-defeated
wait: done
assert: escaped-the-lab
assert: reverse-infiltration.report-back
travel: tunnels
travel: tunnel-mouth
travel: bee-gate
travel: market-square
travel: castle-gate
travel: guard-barracks
talk: guard-captain
choose: reverse-infiltration.report-back.guard-captain.0.said
choose: continue
assert: reverse-infiltration.settled
assert: xp.combat.attack > 0
assert: xp.combat.health > 0
