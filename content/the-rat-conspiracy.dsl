# info the-rat-conspiracy
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  combat
  birds-and-the-bees

# quest rat-conspiracy
title: The Rat Conspiracy
log: Kelsa has been dropping hints about something under her land again. She has not said what yet.

stage rumblings:
  log: Kelsa says the ground under her land has been talking for a fortnight and it has taken a whole cow. She has found the hole it is coming out of and wants it shut, but Tulsa will not let her set a charge without the duke's leave. She wants me to get it.
  kelsa says:
    when: birds-and-the-bees.kelsas-hives.settled
    ask: You look like you have found something else, Kelsa.
    She has stopped pretending to work the frame in her hands. "Ground's been talking under my land for a fortnight now. Not moles — moles do not take a whole cow between one milking and the next."
    Found the hole it is coming out of, past the pasture gate. I want it shut before it takes anything else, but this town does not let a farmer set off a charge on her own land without somebody in a good coat saying it is fine. Go and get me that.
    goto seek-the-duke

stage seek-the-duke:
  log: Kelsa wants the duke's leave to seal the tunnel past her pasture. He keeps to his solar above the castle and hears everything before anybody tells him.
  the-duke says:
    when: rat-conspiracy.seek-the-duke
    ask: Kelsa wants to seal a tunnel on her land.
    He does not look up from whatever he is reading. "A hole that eats cattle, and nobody has looked into it yet."
    Go and see what dug it, and who is walking beasts through it, before either of you puts an end to asking. Bring me back something worth burying and you will have your charge and my leave to light it.
    goto prepare-charges

stage prepare-charges:
  log: The duke wants the tunnel looked into before it is sealed. Kelsa is packing the charges anyway, in case looking into it goes badly.
  kelsa says:
    always
    ask: About the duke's answer.
    "Look first, shut it after — of course he would say that. Fine. We do it the slow way." She reaches under the bench and comes up with an oilcloth roll, already tied. "I made these the day I found the hole. I did not wait on his leave to start packing."
    There is enough here to bring the roof down and no more, so lay it where the tunnel actually is and not spread thin over three places. If it turns out you need it for something other than a hole in the ground, that is your judgement to make down there and not mine to make from here.
    give: 1 blasting-charge
    goto into-the-tunnels

stage into-the-tunnels:
  log: The tunnel starts past Kelsa's pasture. It is thick with feral rats, the same as the sewers under the castle, and something bigger dug in besides. Look for whatever proves this was not moles.
  done when: tunnels-searched
  goto the-rat-army
  kelsa says:
    when: not tunnels-searched
    ask: About the tunnel.
    again: Whatever is down there, I want it named before you light anything. Go on.

stage the-rat-army:
  log: Something dug that tunnel from the far end too. It runs to the ratkin border, and Tulsa has never had reason to walk it before now.
  done when: tulsa.ratkin-border.discovered
  goto report-back

stage report-back:
  log: What is mustered past the ratkin border is not staying there. Kelsa needs to hear this before anything else, and the charge is still in my pack.
  kelsa says:
    always
    ask: About what is on the other side.
    She listens all the way through without once reaching for the frame in her hands, which is not like her. "That is not moles. That is not even one wasp somebody carried four hundred miles."
    "I do not care what the duke wanted investigated next. Whatever is massing back there, I want that door shut before it decides to use it. Get back down there and light what I gave you."
    goto set-the-charges

stage set-the-charges:
  log: Back to the tunnel mouth, with the charge Kelsa packed. Lay it against the shoring, where the tunnel actually is.
  done when: tunnel-sealed
  goto paid

stage paid:
  log: The tunnel is down and the dust is still settling in the throat of it. Kelsa should hear it went well from somebody other than the ground shaking.
  kelsa says:
    always
    ask: It is done.
    She does not ask if it worked; the ground already told her that. "Good. Whatever answer the duke wanted, he can go dig for it himself."
    give: 5000 coin
    goto settled

stage settled:
  log: The tunnel under Kelsa's land is closed for good, and whatever was massing on the other side of it will have to find another door.
  complete
  kelsa says:
    always
    ask: About the tunnel.
    again: Quiet under there now. However long that lasts.

# flag tunnels-searched

# flag tunnel-sealed

# item blasting-charge
title: Blasting Charge
examine: An oilcloth roll packed tight and tied off, with a fuse laid into the seam. Kelsa's own mix, and there is exactly enough of it for one job.

# entity shattered-cage
title: A Broken Cage
examine: Iron bars bent outward rather than in, and the latch still carries tool marks that no smith in Tulsa left.
search the wreckage:
  hidden if: tunnels-searched
  instant
  set: tunnels-searched
  say: Under the straw is a scrap of oilskin with a manifest scratched into it in ratkin script — tallies of stock, a route, and a border crossing marked off in charcoal. Whoever is walking beasts into this tunnel is doing it on a schedule.

# entity loosed-hound
title: Loosed Hound
examine: Something houndish and too big for any kennel in Tulsa, a snapped chain dragging off a collar no smith here forged.
stats: attack 20-26, defense 6, max-health 90, attack-rate 20, accuracy 85, evasion 35
uses: core.melee-combat
faction: world
aggressive
on death:
  credit:
    say: It goes down still snarling, and the chain comes off the collar in your hand — too fine a link for anything Tulsa forges, and stamped near the clasp with a mark no smith here would put there.

# entity ratkin-muster
title: The Muster
examine: Ranks of ratkin beyond the stakes, more than stand watch on any ordinary border, gear stacked in piles too orderly for a border post.

# entity tunnel-shoring
title: The Shoring
examine: Timber propping the mouth of the tunnel open, load-bearing enough that pulling the wrong piece would do the job for you.
lay the charge:
  requires: has blasting-charge
  hidden if: tunnel-sealed
  time: 8
  take: 1 blasting-charge
  say: You wedge the charge in against the main timber and run the fuse back up into the light.
  say: The blast comes up out of the ground rather than out, and by the time the dust clears there is no tunnel mouth left to speak of, only a scar of turned earth where it used to be. @@@ asked for a screen-shake on the blast; the result grammar (`npm run oracle -- result`) has nothing between `say:` and the engine's own effects — no camera or screen directive of any kind — so what stands is the line above, carrying the blast in words instead.
  set: tunnel-sealed
  relocate: tulsa.bee-gate

# location tulsa.tunnels
+entities: loosed-hound, shattered-cage

# location tulsa.ratkin-border
+entities: ratkin-muster

# location tulsa.tunnel-mouth
-adjacent: tunnels
+adjacent: tunnels while not tunnel-sealed

# save ready-to-hear-the-rumblings
over: tulsa.in-town, tulsa.holding-a-hand-axe
{"version":13,"flags":{"birds-and-the-bees.kelsas-hives.settled":true}}

# test the-rat-conspiracy-start-to-finish
unkillable
instant-kill
load: ready-to-hear-the-rumblings
travel: kelsa-farmhouse
talk: kelsa
choose: rat-conspiracy.rumblings.kelsa.0.said
choose: continue
assert: rat-conspiracy.seek-the-duke
travel: market-square
travel: castle-gate
travel: castle-hall
travel: castle-quarters
travel: castle-solar
talk: the-duke
choose: continue
assert: rat-conspiracy.prepare-charges
travel: castle-quarters
travel: castle-hall
travel: castle-gate
travel: market-square
travel: kelsa-farmhouse
talk: kelsa
choose: rat-conspiracy.prepare-charges.kelsa.0.said
choose: continue
assert: has blasting-charge
assert: rat-conspiracy.into-the-tunnels
travel: bee-gate
travel: tunnel-mouth
travel: tunnels
use: core.melee-combat on loosed-hound until done
cancel
use: entity.shattered-cage.search-the-wreckage
assert: tunnels-searched
assert: rat-conspiracy.the-rat-army
travel: ratkin-border
assert: tulsa.ratkin-border.discovered
assert: rat-conspiracy.report-back
travel: tunnels
travel: tunnel-mouth
travel: bee-gate
travel: kelsa-farmhouse
talk: kelsa
choose: rat-conspiracy.report-back.kelsa.0.said
choose: continue
assert: rat-conspiracy.set-the-charges
travel: bee-gate
travel: tunnel-mouth
use: entity.tunnel-shoring.lay-the-charge
assert: tunnel-sealed
assert: rat-conspiracy.paid
travel: tunnel-mouth
travel: tunnels
refused
travel: bee-gate
travel: kelsa-farmhouse
talk: kelsa
choose: rat-conspiracy.paid.kelsa.0.said
choose: continue
assert: rat-conspiracy.settled
assert: inventory.core.coin > 0
