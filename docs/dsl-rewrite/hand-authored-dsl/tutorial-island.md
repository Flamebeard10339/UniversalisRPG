# info
id: tutorial-island
version: 1.0.0
universe: base
author: UniversalisRPG
game-version: 0.1.0
pack: 
dependencies: core

# location guide-house
x: 0, y: 0
starting
adjacent:
  beach while front-door.unlocked
entities:
  miki, stairs-up, front-door, dresser, bookshelf, painting, mirror

# entity miki
examine: A tall man with brown wavy hair. He has striking blue eyes and a strange shock of white hair above his right temple.
talk: [[dialogue miki]]

# dialogue miki
owner=miki

start: Oh — hi. You're the new arrival, right? I'm Miki, I look after new folks passing through here. What's on your mind before you head out?
  -> Whats this Quests tab I keep hearing about? [[explain-quests]]
  -> What do the colors mean? [[explain-colors]]
  -> I'm ready to go, thanks. [[offer-quest]]

[[explain-quests]]: Right, the Quests tab — it's under Character, second row. Anything you take on shows up there with a line about what to do next. Handy when you forget what you were doing five minutes ago. Which, no judgment, happens to everyone here.
  -> What do the colors mean? [[explain-colors]]
  -> Anyway — go on. [[offer-quest]]

[[explain-colors]]: Quick version: red means you haven't started something, yellow means you're partway through, green means it's done. Glance at the dot before you open anything if you just want the status.
  -> Whats this Quests tab I keep hearing about? [[explain-quests]]
  -> Anyway — go on. [[offer-quest]]

[[offer-quest]]: Speaking of which — want an actual task instead of just wandering? I can point you somewhere real.
  -> Go on then, give me something to do. [[check-tab-prompt]]
  -> Maybe later. [[maybe-later]]

[[maybe-later]]: Sure thing. Door's right there whenever you want to explore first — come find me again when you're ready.

[[check-tab-prompt]]: Take a look at your Quests tab right now — you'll see it listed, red, since you haven't actually started it yet. Go on, I'll wait.
  -> Okay, I see it. [[accept-node]]: set: quest.leave-tutorial-island.accepted

[[accept-node]]: There — now it should read yellow. That's you, officially underway. Leave Tutorial Island: find your way off this place.
  goto [[farewell]]

[[farewell]]: Door's unlocked. Go on, get curious.
  set: miki-cleared

# entity front-door
examine: A heavy wooden door. The keyhole looks scratched from years of use and there are scuff marks near the base where boots had nudged it along. 
pick lock:
  requires: lockpick
  hidden if: unlocked
  enemy: lockpicking, attack 0, defense 3, health 5, rate 0
  xp: thieving 4
  on success:
    set: unlocked
    set: quest.leave-tutorial-island.accepted
    say: The lock gives with a soft click.
    say: Whatever is out there, you can reach it now.

# entity painting
look: say: There is a painting on the wall depicting a swordsman in full plate fighting a green dragon. Oddly enough, their armor is made of some sort of blue metal. 

# entity mirror
look: 
  open modal: name-editor
  say: You catch your reflection. Something about it does not feel like you yet.

# entity dresser
examine: An ornate dresser with lacquer peeling off of the surface. It has several drawers with brass handles. 
open drawers: 
  set drawers-open 
  say: You open the drawers. Most of them are empty or are cluttered with random junk. 
close drawers:
  unset drawers-open
  say: You close the drawers
search drawers: 
  require: drawers-open
  once, 4s
  say: You search the drawers. It takes a few moments, and yeah, its mostly junk. You do find a few scattered coins and a set of old lockpicks.
take coins:
  require: search drawers occurred
  give: 12 coins
  say: You find 12 coins split among three of the drawers. They are a little dusty. 
  once
take lockpicks:
  require: search drawers occurred
  give: lockpick
  say: The lockpicking set is gorgeously made, like an heirloom set with gold edge banding and some sort of rich dark wood for a handle. Time, however, has not been kind to them. say: You pocket the set of lockpicks.   
  once

# entity bookshelf
examine: A packed bookshelf with leather bound tomes.{!take note occurred: There is a handwritten note tossed on the second shelf.}
take note: 
  give: note
  once
  say: You take the note. The handwriting is... iffy. 

# entity stairs-up
title: Stairs
examine: A narrow staircase leads up to the second floor.
ascend: relocate: guide-house-upstairs, say: You climb the stairs.

# location guide-house-upstairs
x: 0, y: 0, z: 1
title: The second floor of the Guide's House
examine: A cramped loft above the guide house, a single window looking out.
entities: stairs-down, window

# entity stairs-down
title: Stairs
examine: The staircase back down.
descend: relocate: guide-house, say: You climb back down.

# entity window
examine: A window looks out over the island.
look through:
  discover: beach
  discover: bridge
  say: Through the window you can make out the beach, and further off, a bridge.

# location beach
x: 1, y: 0
title: A beach that hasn't been implemented yet. 
examine: Wow, isn't this place empty?
adjacent: guide-house, bridge

# location bridge
x: 2, y: 0
title: A bridge that hasn't been implemented yet. 
examine: Wow, isn't this place empty?
adjacent: beach

# quest leave-tutorial-island
title: Leave Tutorial Island

## Quests are a list of named text fields. Dialogue can show/hide/complete them.

I can start this quest by speaking to Miki, the Tutorial Guide to start this quest. 
  show: not started

// received quest from miki
Miki asked me to take a look at the mirror in his house. 
  show: progress=1
  done: 1<progress<=3

// looked at mirror
I should go talk to him when I'm done. 
  show: progress=1 or progress=2

// talk to miki
I should go out and find the Survival Expert on the island. Miki said her name was Brii.
  show: progress=3


I was tasked by Miki to escape tutorial island to prove that I am fit to be an adventurer. I took the boat to the mainland and 
  show: 




{show-cond: strikethrough-condition: text}

stage accept: quest.leave-tutorial-island.accepted
  
stage leave-house: tutorial.miki-cleared
  Miki the tutorial guide has tasked you with finding a way off of tutorial island. Step one is probably to leave his house.

stage visit-bank: tutorial.bank-visited
  You have made it outside. Word is there is a bank somewhere along the coast — worth a look before you go much further.

stage clear-mining: tutorial.mining-cleared
  The bank is behind you now. Something below the island — through that trapdoor — is worth investigating.

stage clear-combat: tutorial.combat-cleared
  You have got gear from the cave. Somewhere further in, Denzel mentioned voices — that is probably where you are headed next.

stage complete: tutorial.reached-mainland
  Whatever is holding the mainland back from you will not last much longer. Keep pushing.
