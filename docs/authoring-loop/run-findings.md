# What the runs have said

Every line here is something a playbot reported through `expected` or `confusion`,
or something the run itself demonstrated. This is the work queue the spec calls a
run's actual product. A line is struck when it is fixed or ruled not-a-bug.

## Authoring run 2, 2026-08-22 — the town of Tulsa, 900 lines, one module

Not a playbot run: an authoring run, the second subject of item 3. An outline
and ten quest notes went in and `content/tulsa.dsl` came out. What follows is
what the loop cost on the way, in the order it was met.

### The oracle answered the draft against the corpus, not against the draft

The first `--at` on the draft reported **127 lines naming nothing** — and then
said the engine takes the file whole. The per-line pass built its known set from
`content/` alone, so every id the draft minted and used read as undeclared.

Worse, one missing colon in a `# dialogue` node emptied the answer entirely: a
refused draft is not in the world at all, so *nothing* it declares is known, and
the one real error arrived buried under a hundred consequences of itself.

Fixed: both passes share one reading of the file beside the world, and while the
draft is out of that world the undeclared half is suppressed rather than
printed. 127 lines became one.

**This was the single largest cost of the run and it was in the first minute.**

### `wait: done` could not end a fight, which is the case it was built for

Built earlier the same day off item 5's complaint that the first run wrote
`/wait 30`. It asked `nextBoundary` for the end of what was under way — and
`nextBoundary` caps an action by the pools *its own results* drain. A fight
drains the pool of whoever is being swung at, through `depletes:`, which is not
one of them. So the directive refused on exactly the case the guessed number had
been written for.

Fixed: step one of the action's own cycles at a time and stop when nothing is in
flight. No prediction needed.

### `npm run probe --test` took the whole run down when one test threw

A directive the engine refuses outright throws rather than failing, so one bad
test killed the other four and printed a stack trace instead of four verdicts.
Fixed: a throw is reported where that test's verdict would have gone.

### A region cannot be joined to another region — STILL OPEN

**The one thing this run could not author.** `tutorial-island.market-district`
is where all three routes out of Miki's house land, so the town should hang off
it. Writing `+adjacent: market-row` onto it loads clean, and then:

- the universe no longer prints back to itself (`# location
  tutorial-island.market-district adjacent: names tulsa.market-row, but tulsa is
  not this module or one of its dependencies`)
- the map surface draws the square under `tulsa.tutorial-island.market-district`
- publishing either module alone loses the road
- four tests fail

A section merged from two modules serializes wholly into the module that owns
its id, and that module cannot name ids from a module depending on it. The
corpus's only precedent works around it: `combat-expansion.proving-ground`
declares a one-way road to `tutorial-island.beach` and every one of its tests
opens on a `# save`.

The inverse is not available either. Tulsa needs tutorial-island's stat bases,
health pool, factions and `melee-combat`, so it cannot be the module underneath;
and moving that furniture into a third module below both is the namespace churn
across 40 files that the deliverable log has already ruled out.

So Tulsa is joined one way — you can walk out of town and not back in — and the
missing edge is one line, the day a merged section can print back under the
module that wrote it. It is marked `@@@` on the square's own `examine:` and
`src/content/dsl.test.ts` now claims the constraint as a rule: every road runs
both ways inside a module, and only ever one way out of one.

**This is the largest thing standing between the engine and a world with more
than one region in it.**

### Smaller, and each real

- **A structural blocker has no channel of its own.** `@@@` is read out of prose
  the game says, so the missing road had to be hung on a location's `examine:`
  to reach `npm run notes` at all. It reads oddly there and it is the only place
  it would be found.
- **`wait: done` is a no-op when nothing is under way**, so it cannot be used to
  let an aggressive room come to you: a rat opens the fight on the first tick of
  the clock, and a `wait: 1` has to precede it. Correct, and worth saying once.
- **The map surface's connection sweep scaled with the corpus.** One test looped
  every drawn location, reloading the universe twice each; 6 locations became 34
  and it ran out of its five seconds. Split into one case per place, which is
  what the sweep above it already did.
- **Nothing else in 900 lines was refused.** After the oracle was answering the
  right question, the module went in clean, and `npm run probe -- content --test
  tulsa` turned each of the five `# test` sections around in about a second.
  Both of those are item 2 and item 3 paying for themselves in the same hour.

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
