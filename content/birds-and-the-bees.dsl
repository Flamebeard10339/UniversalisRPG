// Birds and the Bees — read off `.planning/planning_quests/Birds and the Bees.md`.
// Kelsa takes whoever walks into her yard for the Mayor's man, sets them on her
// hives and will not say what is wrong with them. George says what is wrong with
// them. The town crier names it, loudly, and is wrong. What is in the third hive
// is a Korning Mind Wasp with the queen of that hive under it.
//
// Everything this module stands on is tulsa's: Kelsa and George in the
// farmhouse, the crier in the square, the apiary with its two working hives and
// its drones, and the third hive at the end of the row. What this file adds is
// the errand, the inside of that third hive, the two things in it, and the
// reward. Take this module out and the apiary is a field with angry bees in it
// and a chewed comb nobody explains, which is exactly what tulsa says it is.
//
// Nothing here is written into tulsa, and one measurement is why. A location
// holds only entities the module that declared it can see: `# location
// tulsa.hive-mouth` written from here — whole body or `+entities:` patch, it
// makes no difference — merges into tulsa and is printed back under tulsa, and
// tulsa cannot name a birds-and-the-bees wasp. So the quest brings its own room.
// The way into the hive is written from this end only, because the engine
// answers a road from both ends, and it is open only while there is something in
// there worth going in after.

# info birds-and-the-bees
version: 0.1.0
dependencies:
  core
  tulsa

# quest kelsas-hives
title: Birds and the Bees
log: Kelsa keeps the apiary in the east corner of the wall, and every bee on that property has turned on anything that comes near it.

stage hired:
  log: Kelsa has taken me for the Mayor's man and set me on her hives. Anything I like to the drones; a hand on one of her queens and I am paying for her. What is actually wrong with them she would not say.
  kelsa says:
    always
    ask: I am here about the bees.
    She looks up, sees somebody in her yard who is not a bee, and has decided what you are before you have finished the sentence. "About time. I wrote to the Mayor in the spring."
    Something has got into my hives and turned every bee on this property. Get it out. Do what you like to the drones — they are drones, there are ten thousand of them and they are worth nothing to me. Put a hand on one of my queens and you will be paying me for her.
    -> What has got into them?
      say: "Figure it out." She turns the frame in her hands over and does not look up again. "What do you imagine it is I am paying you for?"
      goto ask-george
  george says:
    always
    ask: Is something wrong with this place?
    again: The bees. Still the bees. Ask her, and see how far you get.
    He does not put down what he is carrying. "Depends what you call wrong. She would call it nothing, and she would be lying, and she would know it."
    The bees have been off since the spring. All of them, the whole property, and she has written to the Mayor about it and will not say what she wrote.

stage ask-george:
  log: Kelsa will not say what is wrong with her hives. George does the actual work of the place and was standing right there while she did not say it.
  george says:
    always
    ask: What is actually wrong with the hives?
    He waits until she is out of the room, which does not take long. "Three hives, out the postern on the far side of the property. Two of them are working. Something got into the third and it has been in and out of the comb since, and the bees have been like this ever since it did."
    Wasp, I think. I could not tell you which. I have not been down to the end of the row and I would rather not pretend I want to.
    If you want it named, ask the crier in the square. He will name it. He names everything.
    goto the-hives

stage the-hives:
  log: Three hives past the postern on the far side of Kelsa's land, two of them in the field and the last at the end of the row. George says to go through all three, and that the crier in the square will name what is in them whether or not he knows.
  done when: inside-the-hive.touched
  goto the-third-hive
  george says:
    always
    ask: About the hives again.
    again: Out the postern, past the pasture gate, and keep going. Go through all three of them, frame by frame, and do not stop at the first one that looks wrong. Whatever is in there moves.
  town-crier says:
    always
    sticky
    ask: What kind of wasp gets into a hive?
    Borer wasp. Hundred per cent, and you may quote me anywhere in this square. Go in there and give it a good whack or two and that is the end of your afternoon's work.
    -> How can you be so sure?
      say: "Because the only other thing it could be is a Korning Mind Wasp." He says the name the way you would hand back a foreign coin. "And those mind-riding beasts do not live within four hundred miles of this gate. So. Borer wasp."

stage the-third-hive:
  log: The third hive I went through is the one it was in, and the gallery down out of it was cut while I was at the other two. What is at the bottom of it is not a borer wasp. The queen of that hive is standing between me and it and she is not standing there of her own accord. @@@ asked for the wasp to periodically drain the life out of the queen to heal itself; a result names only the one who acts and the one it lands on, so nothing in the grammar takes from a third party. What stands is the two halves of that separately — the wasp feeds off every blow it lands, and the queen is burning down the whole time she is being made to fight.
  done when: wasp-put-down
  goto back-to-kelsa
  george says:
    always
    ask: About what is in the third hive.
    again: I am staying up here. Shout if it goes badly and I will come down, which is more than she would.
    You went down there, then. He looks at your face and stops asking.
    I will keep the postern open and I will listen. That is the whole of what I am good for at the end of that row.

stage back-to-kelsa:
  log: The wasp is dead and the hive is quiet. Kelsa is up at the farmhouse and has not once come down to look.
  kelsa says:
    always
    ask: It is dealt with.
    "Korning." She says it flatly, and then she says it again. "Korning. That is four hundred miles of somebody else's country between here and a thing that was sitting in my third hive."
    She is quiet for a moment, which from her is a great deal. "Somebody carried it. Wasps do not walk."
    give: 5000 coin
    That is what I said I would pay and it is what I am paying. {queen-fell: George says he had to carry you out of there once, and that my girl was on her back when he did it. She is not on her back now, so we will say nothing more about it.} @@@ asked, on top of the coin, for every bee on the property to go neutral and for the hives to be harvestable in peace afterwards. Nothing in the grammar makes `aggressive` conditional — it is a bare word on a sheet with no `when` to hang on — and hiding the drones behind a flag would be deleting the field rather than calming it, so the apiary is as angry after this as before and the two working hives hand over comb to anybody who will stand there for it, exactly as they did before the quest.
    Tell whoever it is you actually work for that a hive is not a small thing to lose, and that I want to know who was walking a Korning wasp about the countryside.
    goto settled

stage settled:
  log: A Korning Mind Wasp does not live within four hundred miles of Tulsa, and one of them was in Kelsa's third hive with her queen under it. Somebody carried it here.
  complete
  kelsa says:
    always
    ask: About the third hive.
    again: Working again, near enough. And I am still waiting to hear who walked it here.

// --- what this quest owes the world ---

// The arena, and the whole of what this quest owns about getting into it. One
// road in per ground the hives stand on, each open while tulsa's own count says
// three and tulsa's marker says the third search happened there — so the hive a
// player goes through last is the one that lets them down, wherever they were
// standing when they did it, and the other ground does not. A hive on a third
// ground is a fourth line here and nothing else in this file.
# location inside-the-hive
below tulsa.hive-mouth
title: Inside the Hive
examine: Comb to every side and above you, chewed out in galleries a bee never cut, and the noise in here is not a hive's noise.
adjacent:
  tulsa.hive-mouth while kelsas-hives.the-hives and tulsa.the-third-search-was-at-the-mouth
  tulsa.apiary-field while kelsas-hives.the-hives and tulsa.the-third-search-was-in-the-field
entities:
  mind-wasp
  taken-queen

// What the crier was certain it was not. It feeds off what it lands on, which
// is the only half of the drain the grammar will say.
# entity mind-wasp
title: Korning Mind Wasp
examine: Longer than your forearm and banded in a colour no bee wears, and the head of it turns to follow you before the body does.
stats: attack 20-26, defense 8, max-health 150, attack-rate 20, accuracy 95, evasion 45
uses: core.melee-combat
faction: world
aggressive
on hit:
  restore: 4 health to me
on death:
  set: wasp-put-down
  say: The wasp comes off the comb in pieces and the humming in the hive drops a whole tone, all at once, like a room where somebody has stopped talking.
  credit:
    say: The queen goes where she was always going to go once nothing was steering her, which is back onto the comb. You follow the gallery until it stops going anywhere and opens on daylight, at the far end of the row.
    relocate: tulsa.hive-mouth

// The other half of the drain: she is being burned down for as long as she is
// being made to fight, which is what makes the fight a clock. She is worth
// nothing to kill — a lost queen is the losing condition and George is what
// happens next. Losing her only means anything while the wasp is still up: a
// fight does not stop the moment its reason does, so the swing that follows the
// wasp's last one can still land on her, and that one is not a loss.
# entity taken-queen
title: The Third Queen
examine: A queen bee the length of your hand, and she moves the way a hand moves a glove. Nothing behind her eyes is hers.
stats: attack 14-18, defense 4, max-health 90, attack-rate 26, accuracy 80, evasion 50, regeneration -40
uses: core.melee-combat
faction: world
aggressive
respawn after: 5s
on death:
  if not wasp-put-down:
    set: queen-fell
    credit:
      say: The queen goes down and the hive goes up, all of it at once, and the last thing you are sure of is a hand in your collar. @@@ asked for the inside of the hive to be an instanced arena that resets each time it is entered; the engine has nothing instanced in it, so this is an ordinary room behind a road that is only open while the fight is on. A second attempt walks back down into the same room rather than into a fresh one, and the queen is not standing in it again until she has respawned.
      say: George gets you as far as the mouth of the hive before he lets go of you. "I got here just in time to drag you out. Are you alright?"
      relocate: tulsa.hive-mouth

// --- flags ---

# flag wasp-put-down

# flag queen-fell

// --- tests ---

// Standing in the square with something to swing, and nothing yet said to
// anybody about the bees.
# save nothing-said-about-the-bees
{"version":13,"location":"tulsa.market-square","inventory":{"core.hand-axe":1}}

// Start to finish: Kelsa hires without explaining, George explains, the crier
// names the wrong wasp, all three hives are gone through, the way down opens
// under the third of them, what is at the bottom of it is put down, and Kelsa
// pays. Unkillable and instant-kill, so what level walks the apiary is not what
// this is asking — the drones between the postern and the hive are tulsa's, and
// so are their numbers.
# test birds-and-the-bees-start-to-finish
unkillable
instant-kill
load: nothing-said-about-the-bees
travel: kelsa-farmhouse
talk: kelsa
choose: What has got into them?
assert: kelsas-hives.ask-george
talk: george
choose: kelsas-hives.ask-george.george.0.said
choose: continue
assert: kelsas-hives.the-hives
travel: market-square
talk: town-crier
choose: kelsas-hives.the-hives.town-crier.1.said
choose: How can you be so sure?
travel: kelsa-farmhouse
travel: bee-gate
travel: apiary-field
// Each search is waited out rather than left running: a second one started in
// the same room takes the first one's place, and a hive half gone through is a
// hive not gone through.
use: entity.tulsa.first-hive.search-the-comb until done
use: entity.tulsa.second-hive.search-the-comb until done
travel: hive-mouth
use: entity.tulsa.chewed-hive.search-the-comb until done
assert: tulsa.hives-searched = 3
assert: tulsa.the-third-search-was-at-the-mouth
travel: inside-the-hive
assert: kelsas-hives.the-third-hive
use: core.melee-combat on mind-wasp until wasp-put-down
cancel
assert: wasp-put-down
assert: kelsas-hives.back-to-kelsa
travel: apiary-field
travel: bee-gate
travel: kelsa-farmhouse
talk: kelsa
choose: continue
assert: kelsas-hives.settled
assert: inventory.core.coin >= 5000

// George keeps his own word while this quest stands beside it. The first stage
// stands from the outset, so the hint under it is open to a player who has never
// spoken to Kelsa — and both are in the list, which is the whole claim: a line
// given to somebody here adds to what the town gave them rather than replacing
// it. That is a property of the `ask:` on his tulsa node and of the one on the
// node below, so it is proved by picking each in turn out of the same list.
# test george-answers-for-himself-while-the-quest-stands-beside-him
load: in-town
travel: kelsa-farmhouse
talk: george
choose: george.helpful
choose: continue
talk: george
choose: kelsas-hives.hired.george.1.said
choose: continue
// The quest's own thread is proved reachable by the `choose:` above taking it —
// a node id with a number in it is not something `visits` will read. What is
// left to say is that his tulsa word was taken too, and that the stage offering
// the other one was standing the whole time.
assert: tulsa.george.helpful.visits = 1
assert: kelsas-hives.hired

// Out the postern with the errand taken and none of the hives yet gone through.
// The count and both markers stand at nothing, which is what the route below
// walks up from.
# save sent-to-the-hives
{"version":13,"location":"tulsa.bee-gate","inventory":{"core.hand-axe":1},"flags":{"birds-and-the-bees.kelsas-hives.hired":true,"birds-and-the-bees.kelsas-hives.ask-george":true,"birds-and-the-bees.kelsas-hives.the-hives":true}}

// The same three hives in another order, and the way down moves with it: the one
// gone through last is the one that opens, so leaving a field hive until last
// puts the gallery in the field and not at the end of the row. The route above
// walks the other ground, and between them both roads into this room are walked
// rather than one. Unkillable for the same reason as above — the drones in that
// field are tulsa's and what they cost is not what this is asking.
# test the-way-down-opens-under-whichever-hive-is-gone-through-last
unkillable
load: sent-to-the-hives
travel: apiary-field
use: entity.tulsa.first-hive.search-the-comb
travel: hive-mouth
use: entity.tulsa.chewed-hive.search-the-comb
travel: apiary-field
use: entity.tulsa.second-hive.search-the-comb
assert: tulsa.hives-searched = 3
assert: tulsa.the-third-search-was-in-the-field
assert: not tulsa.the-third-search-was-at-the-mouth
travel: inside-the-hive
assert: kelsas-hives.the-third-hive

// Standing inside the third hive with the fight already on, which is the state a
// player reaches by walking down the gallery and the state a lost attempt puts
// them back in. All three hives are behind it and the last was the one at the end
// of the row, because that is the road the walk back out and down again takes.
# save at-the-third-hive
{"version":13,"location":"birds-and-the-bees.inside-the-hive","inventory":{"core.hand-axe":1},"flags":{"tulsa.hive-mouth.discovered":true,"tulsa.hives-searched":3,"tulsa.the-third-search-was-at-the-mouth":true,"birds-and-the-bees.kelsas-hives.the-hives":true,"birds-and-the-bees.kelsas-hives.the-third-hive":true}}

// The other way the fight ends, and that it is not the end of the quest. The
// queen is the losing condition rather than a kill, so putting her down is what
// gets the player carried out; the walk back down is the whole of what this
// world has instead of an arena that resets, and the wasp is still standing in
// it. That second `travel:` is what proves the carrying out — a road does not go
// from a room to itself, so a player who was never moved cannot walk it.
# test losing-the-queen-is-a-walk-back-rather-than-a-dead-end
unkillable
instant-kill
load: at-the-third-hive
assert: kelsas-hives.the-third-hive
use: core.melee-combat on taken-queen until queen-fell
cancel
assert: queen-fell
assert: not wasp-put-down
travel: inside-the-hive
use: core.melee-combat on mind-wasp until wasp-put-down
cancel
assert: kelsas-hives.back-to-kelsa
