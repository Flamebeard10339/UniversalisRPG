# info kill-it-with-fire
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  cooking
  combat

# quest oolgas-basement
title: Kill it with Fire
log: Grandma Oolga keeps her shelves behind her and sells to nobody she has not taken the measure of.

stage set-a-task:
  log: Oolga will not open her counter to me until her basement is clear of rats, and I am not to kill a one of them.
  oolga says:
    always
    ask: Can I see what's on your shelves?
    A glint comes into her eye, quick as a knife catching light, and it is gone just as quick.
    Not until you've earned the look behind me. My cellar's thick with rats and I'll have every one of them still breathing when you're done, or don't bother bringing me the news at all.
    Try Sha Dynasty's, up the lane. The woman who runs it has a way of asking animals to leave that they actually listen to.
    goto seek-sunny

stage seek-sunny:
  log: Oolga wants her cellar clear of rats without one of them killed, and thinks the woman who runs Sha Dynasty's would know how that is managed.
  sunny says:
    always
    ask: Oolga sent me about her rats.
    Oolga. Of course it's Oolga. All right — you don't kill rats out of a cellar, you make the cellar not worth staying in.
    You'll want firetouched royal jelly, and a princess bee out at Kelsa's apiary is where that comes from — they do not hand it over politely. Mollusk venom out of the swamp. And a bottle of my own vodka.
    give: 1 tulsa.bottle-of-vodka
    Here. Saves you asking twice. Mix the three together over a flame and you'll have something no rat in its right mind stays near.
    goto gather-ingredients

stage gather-ingredients:
  log: Sunny wants firetouched royal jelly off a princess bee at Kelsa's apiary and mollusk venom out of the swamp, mixed with the bottle of vodka she already gave me, over any flame in town.
  done when: has sunnys-poison or corners-slathered
  goto apply-the-poison
  sunny says:
    when: not has sunnys-poison
    ask: About the mixture again.
    again: Jelly off a princess bee, venom out of the swamp, and the vodka you've already got off me. All three in your pack, and any stove in town will do the rest.

stage apply-the-poison:
  log: The poison is mixed. Oolga's cellar is through Tavern Street, and the corners of it want slathering before the rats get any further into her sacks.
  done when: corners-slathered
  goto groundwurm-fight

stage groundwurm-fight:
  log: The rats went quiet the moment the poison went into the corners. Something a great deal larger came up out of the ground in their place, and it is not leaving until it is dealt with.
  oolga says:
    always
    ask: About the noise under your house.
    again: Still under there, is it. Best you finish what you started before you come telling me about it.
    Whatever's under there now, it isn't rats. That much I'll grant you.
  oolga says:
    when: wurm-defeated
    ask: It's dealt with.
    So that's what was keeping the rats off.
    {cellar-rats-killed = 0: You didn't kill a one of them, which is more sense than I gave you credit for — and a great deal less than whatever bred that thing under my floor deserves.}{cellar-rats-killed >= 1: You went through a few of mine on the way to it, though. I count what is eating out of my sacks, and there is less eating out of them tonight than there was this morning. Don't tell me they were in the way. Everything is in somebody's way.}
    "Repellent." She says the word like it has done something to personally annoy her. Chase off the small thing and something bigger fills the gap it left. That's not a recipe. That's how the whole world works, and I'd have thought somebody your age would know it by now.{cellar-rats-killed >= 1:  And a cellar you empty with a blade fills again by spring, with whatever is nearest. You have dug me the same hole twice and noticed it the once.}
    Somebody wanted my rats gone badly enough to plant a worm under them for it. That is not chance, and it is not my business to chase either, at my age.
    if cellar-rats-killed = 0:
      xp: cooking.cooking 1500
    if cellar-rats-killed >= 1:
      xp: cooking.cooking 500
    {cellar-rats-killed = 0: Go on, then. Shelves are behind me. You've more than paid for the look.}{cellar-rats-killed >= 1: Shelves are behind me. You did the work and you'll have the look for it. You'll not have my good opinion along with it, and you can keep the tails.}
    goto cellar-cleared

stage cellar-cleared:
  log: Whatever came up out of the floor is dead, and Oolga has had the truth out of me. Rats do not leave a place because they are threatened. They leave because something worse moved in.
  complete
  oolga says:
    always
    ask: About my shelves.
    again: Same as I said. They're behind me, same as they always were.

# flag cellar-rats-killed

# entity cellar-rat
title: Feral Rat
examine: A rat the size of a cat, hairless in patches and weeping where it is not.
stats: attack 9, defense 1, max-health 24, attack-rate 18, accuracy 65, evasion 35
uses: core.melee-combat
faction: world
aggressive
hidden if: tulsa.corners-slathered
respawn after: 40s
on death:
  add: cellar-rats-killed 1
  credit:
    roll: combat.feral-rat-remains

# location tulsa.oolga-basement
+entities: 4 cellar-rat

# save sent-out-for-oolga
{"version":13,"location":"tulsa.market-square","inventory":{"core.royal-jelly":1,"core.mollusk-venom":1},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"core.hand-axe","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test kill-it-with-fire-start-to-finish
unkillable
instant-kill
load: sent-out-for-oolga
equip: 1
travel: tavern-street
travel: oolga-house
talk: oolga
choose: oolgas-basement.set-a-task.oolga.0.said
choose: continue
assert: oolgas-basement.seek-sunny
travel: tavern-street
travel: sha-dynastys
talk: sunny
choose: oolgas-basement.seek-sunny.sunny.0.said
choose: continue
assert: oolgas-basement.gather-ingredients
assert: has tulsa.bottle-of-vodka
craft: sunnys-poison
assert: has sunnys-poison
assert: oolgas-basement.apply-the-poison
travel: tavern-street
travel: oolga-house
travel: tulsa.oolga-basement
use: entity.oolgas-sacks.slather-with-poison
assert: corners-slathered
assert: oolgas-basement.groundwurm-fight
use: core.melee-combat on groundwurm until done
assert: not core.fainted
assert: wurm-defeated
assert: cellar-rats-killed = 0
travel: oolga-house
talk: oolga
choose: oolgas-basement.groundwurm-fight.oolga.1.said
choose: continue
assert: oolgas-basement.cellar-cleared

# test kill-it-with-fire-rats-put-down
unkillable
instant-kill
load: sent-out-for-oolga
equip: 1
travel: tavern-street
travel: oolga-house
talk: oolga
choose: oolgas-basement.set-a-task.oolga.0.said
choose: continue
travel: tavern-street
travel: sha-dynastys
talk: sunny
choose: oolgas-basement.seek-sunny.sunny.0.said
choose: continue
craft: sunnys-poison
travel: tavern-street
travel: oolga-house
travel: tulsa.oolga-basement
use: core.melee-combat on cellar-rat until done
assert: cellar-rats-killed >= 1
use: entity.oolgas-sacks.slather-with-poison
assert: corners-slathered
use: core.melee-combat on groundwurm until done
assert: not core.fainted
assert: wurm-defeated
travel: oolga-house
talk: oolga
choose: oolgas-basement.groundwurm-fight.oolga.1.said
choose: continue
assert: oolgas-basement.cellar-cleared
