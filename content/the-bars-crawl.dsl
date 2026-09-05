# info the-bars-crawl
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  fishing
  cooking

# item raw-blowfish
title: Raw Blowfish
examine: Spined all over and still swelling in your hands. Everything past the fillet is poison, and there is not much fillet.
value: 4

# entity blowfish-hole
title: The Blowfish Hole
examine: A slack backwater off the main current, and whatever lives in it does not have to swim fast to eat.
stats: depth 86
uses: fishing.bait-cast
bait-cast:
  rate: 15
  roll: spend-bait
  one of:
    fishing:
      give: 1 raw-blowfish
      xp: fishing 50
    12x:
      drain: 3 line-health
      say: It comes up spined-side first and you let go of the line rather than the rod.
  +on attempts exhausted:
    roll: spend-bait
    say: Something down there takes the bait off the hook and does not take the hook.

# location tulsa.deep-water
+entities: blowfish-hole

# item blowfish-bones
title: Cleaned Blowfish Bones
examine: Picked out whole and boiled once already. Whatever was in them that would have killed you came off in the water instead.
value: 2

# item poisoned-blowfish-bones
title: Poisoned Blowfish Bones
examine: Picked out whole and boiled the same as any batch that came out clean. Whatever was in them that would have killed you did not come off in the water. It is still in there.
value: 1

# item blowfish-brew
title: Sunny's Blowfish Brew
examine: Cloudy, faintly bitter, and it does not smell like anything that used to have a spine.

# recipe cleaned-blowfish
station: stove
in: raw-blowfish
out: blowfish-bones
burnt: poisoned-blowfish-bones
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
    Cook it wrong and the poison's still in the bones same as it was in the fish. Cook it right and it's gone. Bring the bones back clean and I'll see to the rest myself.
    goto catching

stage catching:
  log: Sunny wants the bones of a blowfish out of the deep water, cooked clean of what killed the fish.
  done when: has blowfish-bones
  goto dissolving
  sunny says:
    when: not has blowfish-bones
    ask: About the blowfish again.
    again: Deep water, past the shingle, and a rod reaches it same as it reaches the trout. Cook it wrong and you'll know soon enough what's left of it. Cook it right and bring me the bones.
  sunny says:
    when: has poisoned-blowfish-bones
    sticky
    ask: I don't think I got this right.
    -> Here.
      say: She doesn't take it, just tips it back into your hand with two fingers. "Smell that? That's not gone, that's just wet. Whatever was in the meat's still in there — you rushed the water, or missed a bone. Take your time over it and try again."

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

# save fresh-for-the-brew
over: tulsa.in-town
{"version":13,"xp":{"fishing.fishing":6725,"cooking.cooking":6725},"inventory":{"fishing.dried-fish-bait":30},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"fishing.fishing-rod","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"fishing.braided-fiber-line","payload":{"roll":0.794003525050357,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.47681119898334146,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# test the-bars-crawl-start-to-finish
load: fresh-for-the-brew
equip: 1
equip: fishing.dried-fish-bait
equip: 2
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
use: entity.blowfish-hole.bait-cast until inventory.raw-blowfish >= 3
assert: has 3 raw-blowfish
travel: riverside
travel: market-square
travel: tavern-street
travel: sha-dynastys
craft: cleaned-blowfish
craft: cleaned-blowfish
craft: cleaned-blowfish
assert: not has raw-blowfish
assert: has blowfish-bones
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

# save at-sha-dynastys-with-a-raw-blowfish
{"version":13,"location":"tulsa.sha-dynastys","inventory":{"the-bars-crawl.raw-blowfish":1},"flags":{"the-bars-crawl.sunnys-brew.offered":true,"the-bars-crawl.sunnys-brew.catching":true}}

# test cooking-the-blowfish-wrong-leaves-the-poison-in
fail-checks
load: at-sha-dynastys-with-a-raw-blowfish
craft: cleaned-blowfish
assert: has poisoned-blowfish-bones
assert: not has blowfish-bones
talk: sunny
choose: sunnys-brew.catching.sunny.1.said
choose: Here.
assert: has poisoned-blowfish-bones
