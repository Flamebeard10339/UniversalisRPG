# What the runs have said

Every line here is something a playbot reported through `expected` or `confusion`,
or something the run itself demonstrated. This is the work queue the spec calls a
run's actual product. A line is struck when it is fixed or ruled not-a-bug.

## Run 2, 2026-08-22, author mode, 12 turns, tutorial island

Twelve turns applied, none refused. Reached: Miki, character creation, dough,
bread, the basement, two rounds against a giant rat.

### The playbot built a door beside the one the other drivers share

**This was first written up as "the engine has three input surfaces, not two", and
that was the wrong diagnosis.** The engine's input vocabulary is `Directive` in
`src/content/sections/test.ts`, and it has 24 kinds — `equip` among them. The
engine could always equip.

What is actually true is smaller and worse. `play-cli` and the GUI both reach the
session through `runLine` in `src/runtime/command.ts`, so `COMMANDS` is already
their one home and a command added there arrives in both for free. The playbot
alone bypassed it, and hand-picked two cases out of twenty-four to support.

So the player was right three turns running — *"I have an Iron Sword and Wooden
Shield in my inventory but no visible equip action, only Main Hand and Off Hand
slots listed without interactable choices."* — but not for the reason first
recorded. There was a way in. It just was not one of the two the loop had built.

The fix is to delete the private surface rather than add a third case to it, which
is being done on this branch. Widening c6 would have been chasing the surface
instead of removing it.

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

## What the unification found, 2026-08-22

Deleting the playbot's private door and asking all three renderers the same
question turned up gaps in the two drivers that were not being examined:

- **The terminal never shows a character's stats.** `PlayStatus.stats` is read by
  no command in `scripts/play-cli.ts` or `src/runtime/command.ts` — `/state`
  prints location, time, flags, inventory, resources and the encounter, and stops.
  A real gap, recorded as one rather than dressed up as an exclusion.
- **The terminal shows an equipment slot only once something is worn in it**, so an
  empty-handed session has nothing to point at.
- **The terminal has no map**, so neither `discovered` nor `locations` is drawn
  anywhere, where the GUI has a pane for it.
- The GUI's only deliberate exclusion is `flags`, on the same anti-spoiler
  reasoning the playbot refuses it for.

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
