# info
id: tutorial-island-guide-house
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
dependencies: tutorial-island-foundation

# advanced
{
  "interactionTypes": [
    { "id": "lockpicking", "sourceStatId": "thieving", "targetStatId": "thieving", "targetPlayerHealth": false }
  ]
}

# location tutorial-guide-house
x: 0, y: 0, tags: tutorial indoors, starting

wall -> tutorial-beach while !tutorial.miki-cleared

## entity miki
examine: A guide with one eye on the door.
- talk: goto dialogue miki

## entity front-door
examine: A heavy door. The keyhole looks scratched, like someone was here before you.
- pick lock
  requires: lockpick
  hidden if: tutorial.miki-cleared
  enemy: lockpicking, attack 0, defense 3, health 12, rate 0
  xp: thieving 4
  on success: set tutorial.miki-cleared, set quest.leave-tutorial-island.accepted, say The lock gives with a soft click. Whatever is out there, you can reach it now.

## entity mirror
- look: open modal name-editor, say You catch your reflection. Something about it does not feel like you yet.

## entity drawer
examine: A drawer full of random junk.{!tutorial.drawer-coins-taken: You see some coins on the bottom.}{!tutorial.drawer-lockpick-taken: A worn set of lockpicks.}
- take coins: give gold 5, set tutorial.drawer-coins-taken, once, say You take the coins.
- take lockpick: give lockpick, set tutorial.drawer-lockpick-taken, once, say You take the lockpick.

## entity bookshelf
examine: A packed bookshelf with leather bound tomes.{!tutorial.bookshelf-note-taken: There is a handwritten note tossed on the second shelf.}
- take note: give note, set tutorial.bookshelf-note-taken, once, say You take the note.

# dialogue miki
start (miki): Oh — hi. You're the new arrival, right? I'm Miki, I look after new folks passing through here. What's on your mind before you head out?
  -> Whats this Quests tab I keep hearing about? [[explain-quests]]
  -> What do the colors mean? [[explain-colors]]
  -> I'm ready to go, thanks. [[offer-quest]]

[[explain-quests]] (miki): Right, the Quests tab — it's under Character, second row. Anything you take on shows up there with a line about what to do next. Handy when you forget what you were doing five minutes ago. Which, no judgment, happens to everyone here.
  -> What do the colors mean? [[explain-colors]]
  -> Anyway — go on. [[offer-quest]]

[[explain-colors]] (miki): Quick version: red means you haven't started something, yellow means you're partway through, green means it's done. Glance at the dot before you open anything if you just want the status.
  -> Whats this Quests tab I keep hearing about? [[explain-quests]]
  -> Anyway — go on. [[offer-quest]]

[[offer-quest]] (miki): Speaking of which — want an actual task instead of just wandering? I can point you somewhere real.
  -> Go on then, give me something to do. [[check-tab-prompt]]
  -> Maybe later. [[maybe-later]]

[[maybe-later]] (miki): Sure thing. Door's right there whenever you want to explore first — come find me again when you're ready.

[[check-tab-prompt]] (miki): Take a look at your Quests tab right now — you'll see it listed, red, since you haven't actually started it yet. Go on, I'll wait.
  -> Okay, I see it. [[accept-node]]: set quest.leave-tutorial-island.accepted

[[accept-node]] (miki): There — now it should read yellow. That's you, officially underway. Leave Tutorial Island: find your way off this place.
  goto [[farewell]]

[[farewell]] (miki): Door's unlocked. Go on, get curious.
  set tutorial.miki-cleared
