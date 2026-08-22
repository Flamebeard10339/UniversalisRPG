# What the runs have said

Every line here is something a playbot reported through `expected` or `confusion`,
or something the run itself demonstrated. This is the work queue the spec calls a
run's actual product. A line is struck when it is fixed or ruled not-a-bug.

## Run 2, 2026-08-22, author mode, 12 turns, tutorial island

Twelve turns applied, none refused. Reached: Miki, character creation, dough,
bread, the basement, two rounds against a giant rat.

### The engine has three input surfaces, not two

**c6 of `a-turn-costs-what-the-last-turn-did` says the engine has exactly two ways
of taking an input, and the run proved otherwise.** The loop supports
`apply(choiceId)` and `applyDirective(submit-modal)`. Opening a screen at all is a
third, `applyDirective({ kind: 'open-modal', modal: … })`, which
`src/runtime/command.ts:277` uses to reach the carried-items screen.

The consequence is not cosmetic. Equipping is done through that screen, so a
playbot cannot equip anything. It said so three turns running — *"I have an Iron
Sword and Wooden Shield in my inventory but no visible equip action, only Main Hand
and Off Hand slots listed without interactable choices."* It was right, and it will
be right about every screen a player opens rather than answers.

**This blocks item 4.** A bot that cannot put on gear cannot measure gear, so no
balance question can be asked of it until c6 is widened.

### Reported by the player, not yet diagnosed

- **A dialogue node announces its own removal to the player.** Named
  `bake-bread.miki.1.said`, reported on turns 2, 7 and 10 as a recurring
  missing-content note. Three separate turns is the same signal strength that made
  the mirror the first spike's loudest finding.
- **The journal does not keep up with the player.** On turn 9, after both steps
  were done: *"Journal text still says 'Knead the dough, then bake it in the oven'
  even though both steps are already completed."*
- **The oven offers a recipe whose ingredient the player cannot have.** *"'roast
  chestnuts' is available but I have no chestnuts."* Same family as the first
  spike's *the oven is unlimited*.

## Fixed by these runs

- ~~The journal sent the player upstairs for a mirror the guide house keeps on the
  floor the game starts on.~~ Three turns lost to the search and four notes filed
  before it was believed. Fixed: the hint names the room, not a floor.
- ~~A dialogue value and its label were printed as `0=the sentence`, and the player
  sent the sentence five turns running.~~ Six of twelve turns lost. Fixed: the line
  reads `value=0 :: the sentence`, like the choice lines beside it.
- ~~The player was shown neither what it held, nor its health, nor its quests.~~
  Fixed, and a claim now derives the check from a live view.

## What run 2 settled about cost

The open half of c5 is closed, and the answer is yes. Cache reads were nonzero from
turn 2 onward and stayed so for every turn after — 10,603 then 2,967 and up,
against a billed input of **2 to 6 tokens a turn**. The frozen prefix caches, and a
turn costs what the last turn did.

For scale, the shape this replaced was measured at ~44,000 tokens a turn and
growing without bound.
