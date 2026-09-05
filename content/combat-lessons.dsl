# info combat-lessons
version: 1.0.0
pack: quests
dependencies:
  core
  combat
  tulsa

# flag drunk-away
# flag drunk-helped

# entity tulsa.drunk-patron
hidden if: drunk-away and not drunk-helped

# dialogue tulsa.drunk-patron
owner = tulsa.drunk-patron

node the-boast:
  when: not drunk-away
  sticky
  ask: Rough night?
  "Rough?" He says it to the floorboards, which is the only direction he is currently facing. "This is a Tuesday. You want rough, you want the pinewood. Wolves up there. I have had words with worse."
  He gets one elbow under himself, which is further than he has managed all evening. "Wolves are nothing. Nothing at all. Come and watch, if you don't believe me."
  -> Go on, then. I'll watch.
    say: He is up before you have finished agreeing, which turns out to be the fastest he moves all night, and he is out the door of Sha Dynasty's ahead of you.
    set: drunk-away
  -> I believe you. Sit back down.
    say: "Wise," he says, and is face down again before the word is properly out.

node the-aftermath:
  when: drunk-helped
  sticky
  ask: About the pinewood.
  "Wolves." He prods at the arm they got. "One minute I am telling you how it is done, the next I am doing it a great deal worse than I said. The thing nobody tells you: they do not wait to see your face first. You are just there, and then they are on you. That is the whole of a wolf, that is."

# guise sitting-up-patron
examine: Sitting up now, working a thumb round the edge of a bite that is going to need looking at properly, and looking rather pleased to be upright at all. "Told you," he says. "Didn't say I'd win."
without: help-him-up

# action help-him-up
title: Help Him Up
instant
hidden if: drunk-helped
on success:
  set: drunk-helped
  stands: sitting-up-patron for 3m
  say: You get an arm under him and he comes up swearing, settles his back against a root, and starts in on the story before his breathing has caught up with him.

# entity mauled-patron
title: A Drunk Patron
examine: Face down in the pine needles, breathing, and — you have to give him this — still talking. "Wolves," he says, to nobody in particular. "Nobody said wolves."
hidden if: not drunk-away
uses: help-him-up

# location tulsa.pinewood
+entities: mauled-patron

# dialogue tulsa.civilian
node the-state-he-came-back-in:
  when: drunk-helped
  ask: About the drunk from Sha Dynasty's.
  again: "Wolves," they say, and leave it there, same as everyone does now.
  "You heard? The one who's always on the floor at Sha Dynasty's went and did it on purpose this time. Came back with a story and a bite to go with it. Nobody's let him forget either half."

# flag guard-sparred
# flag guard-sparred-won

# action bout
title: Bout
extends: core.melee-swing
attempts: 6
rate: us.attack-rate
on attempts exhausted:
  stands: winded-sparring-guardsman for 20s
  xp: combat.attack 3
  set: guard-sparred
  attack vs defense:
    set: guard-sparred-won

# guise winded-sparring-guardsman
examine: Bent over his knees getting his breath back, and waving off anybody who asks if he is all right.
without: bout

# entity sparring-guardsman
title: A Guardsman, Off Duty
examine: Off the roster for the afternoon and going through a slow drill with a wooden sword, more for something to do with his hands than because he needs the practice.
stats: attack 12, defense 8, max-health 70, attack-rate 20, accuracy 80, evasion 35
uses: bout
faction: world
respawn after: 60s

# location tulsa.guard-barracks
+entities: sparring-guardsman

# entity tulsa.player
+uses: bout

# dialogue sparring-guardsman
owner = sparring-guardsman

node the-offer:
  when: not guard-sparred
  sticky
  ask: Any use for a fresh pair of fists?
  "Every use." He squares up, unhurried. "Nobody teaches this part standing still. Accuracy against evasion says whether a swing lands at all. Attack against defense says what it takes off once it does. Rate says how often you get to try. That's the whole sheet, under all the rest of it."
  -> Show me what the numbers say about me.
    open modal: stat-breakdown
    say: He waits while you look it over. "There. Everything on that page is one of the two, or how fast you get to use it."
  -> Let's go, then.
    say: "Six exchanges. I'll not kill you and you'll not kill me, so hit me like you mean it."
  -> Some other time.
    say: "Sheet's not going anywhere. Neither am I, mostly."

node after-a-win:
  when: guard-sparred-won
  sticky
  ask: About the bout.
  "You got through my guard, which is more than nothing. Accuracy and rate got you the openings. What you did with them was yours." He rolls his shoulder. "Come back when you want another go."

node after-a-loss:
  when: guard-sparred and not guard-sparred-won
  sticky
  ask: About the bout.
  "Six exchanges and my guard held the whole way. That's defense doing its job, and it's a real number same as any other. Come back once you've raised something." He does not say which. "You'll know when you have."

# flag sal-armed-you

# dialogue combat.armoury-clerk
owner = combat.armoury-clerk

node types:
  when: not sal-armed-you
  sticky
  ask: What's in the case?
  She nods at the small case she has not opened yet. "Not that. Not for you, not yet." She taps the bronze on the racks instead. "This turns nothing. It's only ever weighed against defense, same as anything else you'd swing back."
  "But some of what's out past the gate carries more than that. Highwaymen on the north road burn what they hit, if you let them close. Bronze does nothing for fire, whatever else it's good for — you'd take the whole of it twice over, once as a blow and once as the type on top."
  -> Show me what stops it.
    give: 1 combat.iron-shield
    say: She takes an iron shield down from behind the counter and puts it in your hands, heavier than the bronze one by a fair margin. "That one turns fire same as it turns a blade. Go and stand a while where the burning is, and you'll feel the difference I'm talking about rather than take my word for it. Mind yourself — wearing it and surviving it are not the same promise."
    set: sal-armed-you
  -> Some other time.
    say: "Suit yourself. The case isn't going anywhere, and neither is the fire."

node after:
  when: sal-armed-you
  sticky
  ask: About the shield.
  "Turned out useful, did it?" She does not look up from the counter. "Everything out there is one type or another underneath the swing. Most of the town never learns that and gets by anyway. You won't have that excuse now."

# dialogue tulsa.bladesmiths-son
node about-sal:
  when: sal-armed-you
  ask: About Sal's advice.
  again: "She's still right about the fire," he says. "She's right about most things, out there."
  "Sal give you the talk? Types, resistances, the whole business?" He nods at the bronze on the racks behind him. "None of that turns anything. She'll have set you up better than the counter does, if you took it."

# save fresh-off-the-sewer
over: tulsa.in-town
{"version":13,"xp":{"combat.attack":15,"combat.health":45},"inventory":{"core.coin":50},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"core.iron-sword","payload":{"roll":0.5,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"core.wooden-shield","payload":{"roll":0.5,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}},"equipped":{"mainhand":"1","offhand":"2"}}

# test the-drunk-is-left-where-he-fell
unkillable
load: fresh-off-the-sewer
travel: tulsa.tavern-street
travel: tulsa.sha-dynastys
talk: tulsa.drunk-patron
choose: Go on, then. I'll watch.
choose: continue
travel: tulsa.tavern-street
travel: tulsa.market-square
travel: tulsa.kings-road
travel: tulsa.north-road
travel: tulsa.pinewood
wait: 5
assert: not drunk-helped
assert: not core.fainted

# test the-drunk-is-found-mauled-and-helped-up
run: the-drunk-is-left-where-he-fell
use: entity.mauled-patron.help-him-up
assert: drunk-helped
travel: tulsa.north-road
travel: tulsa.kings-road
travel: tulsa.market-square
travel: tulsa.tavern-street
travel: tulsa.sha-dynastys
talk: tulsa.drunk-patron
assert: not core.fainted

# test the-guardsman-yields-a-bout-well-fought
unkillable
succeed-checks
load: fresh-off-the-sewer
travel: tulsa.castle-gate
travel: tulsa.guard-barracks
talk: sparring-guardsman
choose: Let's go, then.
choose: continue
use: bout on sparring-guardsman until done
assert: guard-sparred-won
assert: not core.fainted

# test the-guardsman-outlasts-a-bout-poorly-fought
unkillable
fail-checks
load: fresh-off-the-sewer
travel: tulsa.castle-gate
travel: tulsa.guard-barracks
talk: sparring-guardsman
choose: Let's go, then.
choose: continue
use: bout on sparring-guardsman until done
assert: guard-sparred and not guard-sparred-won
assert: not core.fainted

# test sal-explains-the-types-and-hands-over-a-shield
load: fresh-off-the-sewer
travel: tulsa.market-row
travel: tulsa.forge
talk: combat.armoury-clerk
choose: Show me what stops it.
choose: continue
assert: has combat.iron-shield
assert: sal-armed-you

# test sal-is-turned-down-and-keeps-the-case-shut
load: fresh-off-the-sewer
travel: tulsa.market-row
travel: tulsa.forge
talk: combat.armoury-clerk
choose: Some other time.
assert: not sal-armed-you
assert: not has combat.iron-shield

# test the-iron-shield-turns-a-highwaymans-fire
unkillable
load: combat.iron-band-in-hand
assert: stat.fire-resistance = 0
equip: combat.iron-shield
assert: stat.fire-resistance > 0
goto: tulsa.north-road
use: core.melee-combat on highwayman
wait: 10
assert: not core.fainted
