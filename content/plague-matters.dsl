# info plague-matters
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  combat
  reverse-infiltration

# quest plague-matters
title: Plague Matters
log: The captain sent for me directly, which she has not done before.

stage summoned:
  log: The ground under the east wall has been moving since before dawn and has not stopped. The captain wants me down through the tunnels and the muster to find out what is moving it.
  guard-captain says:
    when: reverse-infiltration.settled
    ask: About the summons.
    She is not reading the roster this time. "Ground has been moving under my east wall since before light, and it is not settling the way ground settles on its own."
    You gave me a name and a date. The date I could not do anything about. Get down through the tunnels and the muster and find out what is moving under my wall before it finishes moving. Take a blade you trust. I am not sending you to only look this time.
    goto the-dig

stage the-dig:
  log: Whatever is digging is coming off the muster's own ground, further in than Tulsa has ever had cause to walk.
  done when: sapper-tunnel.discovered
  goto the-sappers

stage the-sappers:
  log: A fresh cut runs off the muster, timbered in a hurry and driven straight at something rather than following any seam worth following. Whoever dug it is still down here.
  done when: dig-searched
  goto the-charge

stage the-charge:
  log: The props down here were not axed, they were sawn to drop true. Whatever this was dug toward is close, and it is not waiting on anybody's permission to arrive.
  done when: wall-brought-down
  goto the-black-plague

stage the-black-plague:
  log: The wall is open and the ratkin are already coming through it. Whoever is leading them signed the ledger himself.
  done when: black-plague-defeated
  goto report-back

stage report-back:
  log: The breach is quiet behind me. The captain needs to hear it from somebody who was standing in it when it opened.
  guard-captain says:
    always
    ask: About the wall.
    She has already sent two down to stand the breach before you clear the stair, which is as close as she comes to saying she was afraid of the answer. "The wall is open and there is a dead ratkin warlord lying in it. Say that again as slowly as you like, it does not get any less true."
    Whatever this town owed the ratkin border, it is paid now, both ways. Every watch I doubled stands down to one, starting tonight, and you are the reason I can do that.
    xp: combat.attack 20000
    xp: combat.health 30000
    give: 10000 coin
    "For the whole of it," she says, and does not reach for the roster while she says it.
    goto settled

stage settled:
  log: The Black Plague is dead in a hole in Tulsa's own wall, and the town above it has no idea how close that hole came to being the whole story.
  complete
  guard-captain says:
    always
    ask: About the wall.
    again: One watch, same as before all this started. @@@ wanted the two guards who stood the breach with the player to go on standing with them, in whatever comes next; `allies:` laid over `tulsa.player` takes no `while` or `when` of its own and never comes back off once written, and it reaches every fight from the moment it is written, not only this one — laying it there broke fights the rest of the world already depends on. What stands instead is the two of them at the breach itself, same as Vance's five at the wire.

# flag dig-searched

# flag wall-brought-down

# flag black-plague-defeated

# item unique-plagues-seal
title: The Black Plague's Seal
examine: The ring he signed the ledger with, still warm. The pattern cut into it is not ratkin work at all — a seal made for a name he gave himself, not one anyone else ever used for him.
value: 3200
cluster-jewel:
  shape: wheel
  open-connections: e
  passives:
    1 combat.chaos-ward
    2 combat.hardened
    3 combat.retribution
    4 combat.constitution
    5 combat.chaos-ward
    6 combat.mending
    7 combat.tempered-frame

# action the-wall-comes-down
title: The Wall Comes Down
time: 6
on success:
  say: The first keg goes and the roof follows it, not out but up — the whole prop line letting go at once, the way it was cut to. Light gets in where light has no business being, and it is castle light, not tunnel lamp. Something that was under the wall a moment ago is coming up through it instead.
  set: wall-brought-down
  relocate: the-breach

# entity ratkin-sapper
title: Ratkin Sapper
examine: Built low and wiry, more pick than blade in hand, knees bent from tunnel work that has not let them stand up straight in years.
tier: elite
profile: skirmisher
level: 27
uses: core.melee-combat
faction: world
aggressive
respawn after: 90s
on death:
  credit:
    roll: combat.ratman-remains
    give: 6-14 core.coin

# entity spoil-heap
title: The Spoil Heap
examine: Dug earth banked higher than a man and still dark with damp, moved faster than a crew this size should be able to move it.
dig through the spoil:
  hidden if: dig-searched
  instant
  set: dig-searched
  say: Under the last of it the props are ring-sawn rather than axed, cut to drop true rather than just fast. Whoever laid this out has done it before, more than once, and not on this side of the border.

# entity sappers-charge
title: The Sappers' Charge
examine: Kegs wedged along the main shoring, fuses run further back than any one crew should need — and every one of them already lit.
try to smother the fuses:
  hidden if: wall-brought-down
  requires: dig-searched
  instant
  perform: the-wall-comes-down

# entity black-plague
title: The Black Plague
examine: A ratkin in armour scavenged from three different armies and refitted to a frame none of it was ever cut for. Whatever name he was given, he has stopped answering to it.
tier: boss
profile: brute
level: 30
stats: chaos-damage 30
uses: core.melee-combat
faction: world
aggressive
on death:
  credit:
    say: He goes down the way the ledger read it: all at once, and later than it should have taken. Behind him what is left of the charge stops pushing and starts running, back the way the wall let them in.
    set: black-plague-defeated
    give: 1 unique-plagues-seal

# location sapper-tunnel
x: 10, y: 6, z: -1
title: The Sappers' Dig
examine: A fresh cut off the muster, timbered in a hurry and driven straight rather than following any seam worth following — driven at something, not away from anything.
adjacent:
  tulsa.the-muster
entities:
  2 ratkin-sapper, spoil-heap, sappers-charge

# location the-breach
x: 6, y: -6
title: The Breach
examine: Sky where a tunnel roof was a moment ago, and Tulsa's own wall standing open above you in a wound none of the masons cut. Ratkin are already coming through it.
adjacent:
  sapper-tunnel while wall-brought-down
entities:
  black-plague, 2 combat.ratkin-warrior, 2 tulsa.guardsman

# dialogue tulsa.guard-captain
node plague-matters-aftermath:
  when: plague-matters.settled
  sticky
  ask: About the Black Plague.
  Dead in a hole in my own wall, and the town over our heads never felt it move. That is the job done properly, for once.

# dialogue tulsa.town-crier
node plague-matters-aftermath:
  when: plague-matters.settled
  sticky
  ask: About the wall coming down.
  A ratkin warlord came up through our own wall and did not walk back out of it. I did not see it happen. I am telling it anyway, and for once nobody is telling me to stop.

# dialogue tulsa.kelsa
owner = tulsa.kelsa

node plague-matters-aftermath:
  when: plague-matters.settled
  sticky
  ask: About the ratkin.
  I sealed a tunnel and thought that was the end of my part in it. Apparently it was the start of somebody else's. Good riddance to him, whoever he was before he decided to be a plague instead.

# dialogue tulsa.oolga
node plague-matters-aftermath:
  when: plague-matters.settled
  sticky
  ask: About the border.
  A warlord under the wall, and the whole town finds out after it is already over. That is how it always goes. I found out before, same as always, and I am not going to say how.

# dialogue tulsa.guardsman
node plague-matters-aftermath:
  when: plague-matters.settled
  sticky
  ask: About the wall.
  I stood the breach with you. Captain's put my name on the report twice now, which for her is a parade.

# save ready-for-the-final-battle
{"version":13,"location":"tulsa.guard-barracks","flags":{"reverse-infiltration.settled":true}}

# test plague-matters-start-to-finish
unkillable
instant-kill
load: ready-for-the-final-battle
talk: guard-captain
choose: plague-matters.summoned.guard-captain.0.said
choose: continue
assert: plague-matters.the-dig
travel: castle-gate
travel: market-square
travel: kelsa-farmhouse
travel: bee-gate
travel: tunnel-mouth
travel: tunnels
travel: the-muster
travel: sapper-tunnel
assert: plague-matters.the-sappers
use: entity.spoil-heap.dig-through-the-spoil
assert: dig-searched
assert: plague-matters.the-charge
use: entity.sappers-charge.try-to-smother-the-fuses
wait: done
assert: wall-brought-down
assert: plague-matters.the-black-plague
use: melee-combat on black-plague until done
assert: black-plague-defeated
assert: plague-matters.report-back
travel: sapper-tunnel
travel: the-muster
travel: tunnels
travel: tunnel-mouth
travel: bee-gate
travel: kelsa-farmhouse
travel: market-square
travel: castle-gate
travel: guard-barracks
talk: guard-captain
choose: plague-matters.report-back.guard-captain.0.said
choose: continue
assert: plague-matters.settled
assert: xp.combat.attack > 0
assert: xp.combat.health > 0
assert: inventory.core.coin > 0
assert: has unique-plagues-seal
