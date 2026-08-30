// Kill it with Fire — read off `.planning/planning_quests/Kill it with Fire.md`.
// Oolga wants her basement cleared without a rat killed, and what the repellent
// draws instead is worse than what it drives off.
//
// The module is the quest and nothing else. The sacks in the cellar, the wurm
// under it, the princess bee at the apiary, the poison and the recipe for it
// are all tulsa's, because they are things standing in tulsa's rooms: take this
// module out and the cellar still has something in the corner worth poisoning.
// A second body laid over `# location tulsa.oolga-basement` from here would say
// the same thing and does not survive being printed back, since the merged room
// prints under tulsa and tulsa does not depend on this module.
//
// Reward is 1500 cooking xp and, on paper, "access to Oolga's potion shop" —
// the shop itself is not written here. The grammar `npm run oracle -- shop
// entity` prints has no conditional form of `keeps shop:` and no `hidden if:`
// on a `# shop`, so there is no way to open her counter ON COMPLETION without
// also leaving it open to a player who has not done the quest, which is worse
// than not opening it at all. `tulsa.oolgas-counter` is left exactly as
// tulsa.dsl has it; Oolga's own closing line carries the reward instead. Worth
// a real fix — a gate on `keeps shop:` — rather than a workaround here.

# info kill-it-with-fire
version: 0.1.0
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
    So that's what was keeping the rats off. You didn't kill a one of them, which is more sense than I gave you credit for — and a great deal less than whatever bred that thing under my floor deserves.
    "Repellent." She says the word like it has done something to personally annoy her. Chase off the small thing and something bigger fills the gap it left. That's not a recipe. That's how the whole world works, and I'd have thought somebody your age would know it by now.
    Somebody wanted my rats gone badly enough to plant a worm under them for it. That is not chance, and it is not my business to chase either, at my age.
    xp: cooking.cooking 1500
    Go on, then. Shelves are behind me. You've more than paid for the look.
    goto cellar-cleared

stage cellar-cleared:
  log: Whatever came up out of the floor is dead, and Oolga has had the truth out of me. Rats do not leave a place because they are threatened. They leave because something worse moved in.
  complete
  oolga says:
    always
    ask: About my shelves.
    again: Same as I said. They're behind me, same as they always were.

// --- tests ---

// What the two errands are worth in the pack rather than how they were come by:
// the jelly is off the princess bee and the venom off a swamp mollusk, and both
// of those fights are tulsa's and stand or fall on tulsa's numbers rather than
// on anything this quest says. An axe because it is carried as a stack and
// needs no instance written by hand.
//
// Nothing else, and no experience: the route below walks godlike, so what level
// lives through the cellar is not what it is asking. What the wurm should cost
// is a balance question and is answered by running the world, not from here.
# save sent-out-for-oolga
{"version":13,"location":"tulsa.market-square","inventory":{"core.hand-axe":1,"core.royal-jelly":1,"core.mollusk-venom":1}}

// Start to finish: Oolga sets the task, Sunny names the three things and hands
// over the vodka she keeps for herself, the three come together over Sunny's
// own stove, the sacks in Oolga's cellar take the poison, the thing it draws
// is put down, and Oolga has the truth out of the player.
# test kill-it-with-fire-start-to-finish
godmode
load: sent-out-for-oolga
equip: core.hand-axe
travel: tavern-street
travel: oolga-house
talk: oolga
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
journal: oolgas-basement says The poison is mixed. Oolga's cellar is through Tavern Street, and the corners of it want slathering before the rats get any further into her sacks.
travel: tavern-street
travel: oolga-house
travel: tulsa.oolga-basement
use: entity.oolgas-sacks.slather-with-poison
assert: corners-slathered
journal: oolgas-basement says The rats went quiet the moment the poison went into the corners. Something a great deal larger came up out of the ground in their place, and it is not leaving until it is dealt with.
use: core.melee-combat on groundwurm until done
assert: not core.fainted
assert: wurm-defeated
travel: oolga-house
talk: oolga
choose: continue
assert: oolgas-basement.cellar-cleared
