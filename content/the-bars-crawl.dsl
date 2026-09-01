// The Bar's Crawl — Sunny wants something on the bar nobody in Tulsa has had
// before, and she has already worked out what it is made from: the dissolved
// bones of a fish that will kill you if the meat is cooked wrong.
//
// The fish is this module's own — nothing in fishing.dsl has a poisonous one,
// so `raw-blowfish` and the water it comes out of are declared here and hung
// off `tulsa.deep-water` the way `ball-of-a-boy.dsl` hangs an action off
// `tulsa.larry`: take this module out and the deep water goes back to trout
// and salmon only. The water is a fifth water and nothing else — it declares
// how deep it is and overlays `fishing.cast`, same as the four in fishing.dsl.
//
// The poison is the cooking system already in this world: `accuracy: cooking`
// against a `burnt:` fallback is exactly "cook it right or ruin it and try
// again," so the recipe uses that rather than inventing a second poison of
// its own. What it cannot do is say so on the way past — a recipe has one
// `say:` and no `on failure:` of its own, so a fumbled attempt falls back to
// the world's one generic `burnt-food` and its fixed description rather than
// anything about the poison staying in. Flagged on the line below rather than
// built around, since the workaround (a second, fish-specific ruined item)
// would just be the generic burnt-food wearing a costume.
//
// Reward is a cap and an apron of this module's own rather than the castle's
// `cooking.chefs-hat` — Sunny is not the castle range, and nothing says a bar
// cook dresses like one.

# info the-bars-crawl
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  fishing
  cooking

// --- what this quest owes the world ---

// The water and what comes out of it. Deep water already means "the rod
// reaches further than a net does," so the same requirement and the same
// bait-spend as trout and salmon apply here without restating why.
//
// The one thing this water asks that depth does not: a landed cast still has a
// blowfish on the end of it, and getting a swelling ball of spines off a hook is
// its own question. So the catch is a row weighed against the angler's own
// fishing rather than a second contest — a hand that knows the fish gets it off
// the hook, and one that does not lets go of the line.

# item raw-blowfish
title: Raw Blowfish
examine: Spined all over and still swelling in your hands. Everything past the fillet is poison, and there is not much fillet.
value: 4

# entity blowfish-hole
title: The Blowfish Hole
examine: A slack backwater off the main current, and whatever lives in it does not have to swim fast to eat.
stats: fishing 0, depth 86
uses: fishing.cast
cast:
  requires: has fishing-rod and has dried-fish-bait or has fishing-rod and has wrigglers
  rate: 15
  roll: spend-bait
  one of:
    fishing:
      give: 1 raw-blowfish
      xp: fishing 50
    12x:
      drain: 3 line-health
      say: It comes up spined-side first and you let go of the line rather than the rod.
  +on unfinished:
    roll: spend-bait
    say: Something down there takes the bait off the hook and does not take the hook.

# location tulsa.deep-water
+entities: blowfish-hole

// The cook and the brew. Two recipes rather than one, because the meat is
// finished the moment the poison is out of it and the bones are not dissolved
// until well after that — the same distinction `sunnys-poison` draws between
// gathering three things and mixing them.

# item blowfish-bones
title: Cleaned Blowfish Bones
examine: Picked out whole and boiled once already. Whatever was in them that would have killed you came off in the water instead.
value: 2

# item blowfish-brew
title: Sunny's Blowfish Brew
examine: Cloudy, faintly bitter, and it does not smell like anything that used to have a spine.

# recipe cleaned-blowfish
station: stove
in: raw-blowfish
out: blowfish-bones
burnt: burnt-food
accuracy: cooking
skill: cooking 25
rate: core.cooking-rate
say: You ease the fillet off the spine in one motion, the way Sunny showed you, and take every needle-fine bone out whole rather than snapping one.

# recipe blowfish-brew
station: stove
in: blowfish-bones
out: blowfish-brew
skill: cooking 8
time: 4
say: The bones go soft, then gone, and what is left in the pot is nothing like broth.

// The reward. A cap and an apron rather than the castle's own chef's hat,
// because Sunny's kitchen is her bar and not the castle range.

# item cooks-cap
title: Bar Cook's Cap
slot: head
value: 70
item-level: 4-8
kitchen, +6 cooking

# item cooks-apron
title: Bar Cook's Apron
slot: body
value: 70
item-level: 4-8
kitchen, +6 cooking

// --- the quest ---

# quest sunnys-brew
title: The Bar's Crawl
log: Sha Dynasty's has the same faces in it every night that it had the night before.

stage offered:
  log: Sunny wants a brew nobody in Tulsa has had before, made from the bones of a fish that will kill you if it is cooked wrong.
  sunny says:
    always
    ask: About a new brew.
    Same faces, same stools, same rounds, every night this year. I want something on the bar nobody's had before.
    There's a fish out past the shingle, in the deep water — blowfish, they call it, and it swells up like a bladder the second it's out of the water. The meat's poison until it's cooked exactly right, and the bones are worth more dissolved than the meat is worth eating.
    Charlie tried it raw once, back when he still had opinions about things. He's been on that floor since Tuesday.
    Cook it wrong and the poison's still in the bones same as it was in the fish. Cook it right and it's gone. Bring the bones back clean and I'll see to the rest myself. @@@ a fumbled attempt should come back saying just that — that the poison stayed in — rather than the world's one generic burnt-food; a recipe has one `say:` for the attempt and no `on failure:` of its own to say anything else on
    goto catching

stage catching:
  log: Sunny wants the bones of a blowfish out of the deep water, cooked clean of what killed the fish.
  done when: has blowfish-bones
  goto dissolving
  sunny says:
    when: not has blowfish-bones
    ask: About the blowfish again.
    again: Deep water, past the shingle, and a rod reaches it same as it reaches the trout. Cook it wrong and you'll know soon enough what's left of it. Cook it right and bring me the bones.

stage dissolving:
  log: The bones are clean. Sunny wants them dissolved down over a flame before she calls it a brew.
  done when: has blowfish-brew
  goto deliver
  sunny says:
    when: not has blowfish-brew
    ask: About the bones.
    again: Any stove in town will do it. Dissolve them down and bring me what's left.

stage deliver:
  log: The brew is mixed. Sunny is behind her own bar, same as she always is.
  sunny says:
    always
    ask: I've got your brew.
    -> Give her the bottle.
      take: 1 blowfish-brew
      say: Sunny holds it up to the lamp, sniffs it once, and does not make a face, which from her is most of a compliment.
      xp: cooking 400
      give: 1 cooks-cap
      give: 1 cooks-apron
      say: That'll do. Keep the cap and the apron — you've earned the right to stand at a stove and not be asked what you think you're doing there.
      goto poured

stage poured:
  log: Sunny has her brew. Whether it fills the stools is her business from here.
  complete
  sunny says:
    always
    ask: About the brew.
    again: Out on the bar already, if you want to see how it's going over.

// --- tests ---

// Everything the deep water, the stove and Sunny's own bar are asked to do:
// catch the fish, cook the poison out of it, dissolve the bones down into the
// brew, and hand it across the bar for the reward. Cooking's accuracy roll
// and the cast's own chance of a snapped line are real chances rather than a
// fight, so the levels below are bought high enough that both come in
// reliably instead of being asked to stand or fall on either one, and three
// fish are caught against one recipe attempt each so a single burnt one does
// not stall the route — that headroom is a balance question for a pass of
// its own, not for this file.
# save fresh-for-the-brew
{"version":13,"location":"tulsa.market-square","xp":{"fishing.fishing":6725,"cooking.cooking":6725},"inventory":{"fishing.fishing-rod":1,"fishing.dried-fish-bait":30,"fishing.braided-fiber-line":1}}

# test the-bars-crawl-start-to-finish
load: fresh-for-the-brew
equip: fishing.fishing-rod
equip: fishing.dried-fish-bait
equip: fishing.braided-fiber-line
travel: tavern-street
travel: sha-dynastys
talk: sunny
choose: sunnys-brew.offered.sunny.0.said
choose: continue
assert: sunnys-brew.catching
travel: tavern-street
travel: market-square
travel: riverside
travel: deep-water
use: entity.blowfish-hole.cast until inventory.raw-blowfish >= 3
assert: inventory.raw-blowfish >= 3
travel: riverside
travel: market-square
travel: tavern-street
travel: sha-dynastys
craft: cleaned-blowfish
craft: cleaned-blowfish
craft: cleaned-blowfish
assert: not has raw-blowfish
assert: inventory.blowfish-bones >= 1
assert: sunnys-brew.dissolving
craft: blowfish-brew
assert: has blowfish-brew
assert: sunnys-brew.deliver
talk: sunny
choose: sunnys-brew.deliver.sunny.0.said
choose: Give her the bottle.
assert: sunnys-brew.poured
assert: has cooks-cap
assert: has cooks-apron
