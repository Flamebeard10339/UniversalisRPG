# info
id: tutorial-island
version: 1.0.0
universe: base
author: UniversalisRPG
game-version: 0.1.0
pack: 
dependencies: core

# variables
bridge-open=false

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

start: Greetings adventurer! Welcome to UniversalisRPG. My name is Miki, the tutorial guide, and I am here to guide you through your first baby steps through this wonderful world! What say you I show you how the questing system works, eh?
  -> Okay. [[explain-quests]]

[[explain-quests]]: Right, the Quests tab. You can find it in your Character sheet on the second row. You'll find your quest journal there with color coded quests based on your progress. Quests you haven't started yet are red. Quests you have will show up as yellow. And any quest you complete will be green. Go check it out!
  -> Give me a second, I'll be back in a moment. 
  -> No, I prefer if you just finish the explanation first. [[explain-quests-2]]
  
## Need a nice way to say that the next time you talk to miki, dialogue starts here
## Need a better way to define conditionals based on previous choices
[[explain-quests-2]]: {choice: No, I prefer if you just finish the explanation first.: Fair enough.} You can open a quest to see your journal which will show you what you've done and what you need to do next. Handy when you forget what you were doing five minutes ago. Which, no judgment, happens to everyone here.
  -> Ha, ha. I can be pretty forgetful, yeah. [[offer-quest]]
  -> Right... [[offer-quest]]

[[offer-quest]]: Wonderful! Now that you have the basics, I think you are ready for your first quest. Don't worry, it will be a simple one. Just an actual task to get your feet wet. Better than just wandering around, I assure you. 
  [[ahem]]

[[ahem]]: *Ahem*. 
  [[ready?]]

[[ready?]]: Are you ready?
  -> Yes. 
    [[get-quest]]
  -> No. 
    [[get-quest]]

[[get-quest]]: Wonderful! I task thee, grand adventurer to... drum roll please. Escape tutorial Island. That's right. Get off the island and you'll get a reward. Oh yeah, didn't mention that yet. Quests give rewards. 
  leave-tutorial-island.start
  -> Awesome. I'll get to it. [[talk-to-brii]]
  -> What are the rewards for this quest? [[not-telling]]

[[not-telling]]: Ha! That's a good one. You're such a cutey! 
  [[talk-to-brii]]
  
[[talk-to-brii]]: Go outside and talk to Brii. She is our resident survival expert and she will walk you through the ins and outs of skills. Good luck. 
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

# entity campfire
examine: A gently crackling campfire perfect for cooking. 
cook: station: stove

# recipe cooked-shrimp
station: stove
in: raw-shrimp
out: cooked-shrimp
skill: cooking 4

# location bridge
x: 2, y: 0
title: A bridge that hasn't been implemented yet. 
examine: Wow, isn't this place empty?
adjacent: 
  beach
  bank while bridge-open

# item bones
title: Bones
examine: A dusty set of bones.

# entity small-rat
fight:
  enemy, melee-combat, attack 1, defense 1, health 2, rate 25
  droptable:
    bones

# entity bridge-troll
examine: A tall, knobbly creature adept at crushing weaponry
talk:
  [[dialogue troll]]
pay toll:
  requires: 5 cooked-shrimp and dialogue.bridge-troll.what-toll
  take: 5 cooked-shrimp
  set: bridge-open
  dialogue: [[dialogue troll.pay-toll]]
fight:
  hidden if: not troll-antagonized
  enemy: melee-combat, attack 55, defense 110, health 100, rate 25, regeneration 110
  on success:
    set: bridge-open
  droptable:
    bones (1)
    dependent droptable (3):
      1 tin-ore (4)
      3-5 copper-ore (3)

# dialogue troll
owner=bridge-troll
start: I's hears's a pesky human! Want to cross me bridge does he? Well then, if'n za little human knows anyfing, you'd betta pay the toll!
  -> What toll? [[what-toll]]
  -> No chance! [[no-toll-no-pass]]

[[what-toll]]: The Bridge Toll! Gimmi fives cooked shirmps and you pass.
  -> Alright
    bridge-troll.pay-toll
  -> That's highway robbery! [[robbery]]

[[robbery]]: Smart little feller aren't ya. That's the point. 
  -> Leave
  -> What if I don't want to pay the toll? [[no-toll-no-pass]]

[[no-toll-no-pass]]: {robbery: Do's you now...} Well no toll, no pass. Simple rules make easy memory. 
  set: bridge-troll.toll-available

[[pay-toll]]: Mmmm. Delicious. Alls rights. You pass. 

## entity shoals
title: Shrimp Shoals
fish:
  requires: small-net
  xp: fishing 4
  give: raw-shrimp 1
examine: Shrimp dart away from your shadow.

# entity supply-crate
title: Supply Crate
examine: A net and bowl sit on top. {crate-net-taken & !crate-bowl-taken: A bowl still sits at the bottom of the crate.}{!crate-net-taken & crate-bowl-taken: A small net still sits at the bottom of the crate.}{crate-net-taken & crate-bowl-taken: An empty supply crate. Nothing left worth taking.}
take net:
  give: small-net
  set: crate-net-taken
  once
  takes: 2s
  say: You take the small net.
take bowl:
  give: bowl
  set: crate-bowl-taken
  once
  takes: 2s
  say: You take the bowl.

# entity bridge-sign
title: Bridge Sign
read: say: "Billy's Bridge of Food". The word FOOD is carved deeper than the rest.

# quest leave-tutorial-island
start: I can start this quest by speaking to Miki, the Tutorial Guide to start this quest. 
talked-to-miki: Miki asked me to take a look at the mirror in his house. 
not-returned-to-miki: I should go talk to him when I'm done. 
finished-house: I'm done in this house. I should go out and find the Survival Expert on the island. Miki said her name was Brii.
summary: I was tasked by Miki to escape tutorial island to prove that I am fit to be an adventurer. I spoke to Miki and Brii and I know how to play the game. 

# location bank
