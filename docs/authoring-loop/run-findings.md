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

### ~~A region cannot be joined to another region~~ — closed, and not the way it was framed

**Closed 2026-08-22 by making adjacency symmetric by construction.** A road is
one authored statement, and the engine derives the return edge — same condition
— unless the far end writes one of its own, which always wins. The effective
relation is closed once at load into `Registry.roads` and read through
`effectiveAdjacent`; `Location.adjacent` stays exactly what the author wrote, so
the printer, the round trip and publishing never see a derived edge and needed no
change at all.

**The framing below is what cost the time, and it is the lesson.** The problem
was read as *a merged section cannot print back under the module that wrote it*,
which points at provenance tracking in `merge.ts` and the serializer — a large,
invasive change. But the corpus uses **zero** `+` field edits, and the way a
downstream module already reaches an upstream thing is `QuestSpeech`: the
contribution is a field of the *contributing* section and the engine lands the
effect at the far end. `tulsa.market-square adjacent: tutorial-island.beach` was
already that shape. Only the landing was missing.

A blocker described as *the engine will not let me write X* is worth re-reading
as *what does this module already own, and what should the engine derive from
it?* The two readings cost about ten lines and about a week respectively.

`one-way` was designed and then deliberately not built: nothing in the corpus
needs it, and the map is churning. Every road is two-way until something wants
otherwise, and the keyword is ten lines the day a chute exists.

Standing, from the run:

`tutorial-island.market-district`
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

~~So Tulsa is joined one way — you can walk out of town and not back in.~~ It is
joined both ways now, and `combat-expansion.proving-ground` is a place you can
walk to rather than a fixture only a `# save` reaches. `src/content/dsl.test.ts`
no longer claims one-way roads out of a region as a rule; it claims instead that
every location the corpus declares is reachable on foot from the starting one,
which is a claim that could not have been made before and derives its subjects
from the corpus.

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
- **`npm run oracle -- --at` cannot answer for a module that already ships.** It
  loads the corpus beside the draft, so a draft that *is* a shipped file collides
  with its own copy and the whole answer becomes `two modules declare the id
  tulsa`. The tool reads a new module and refuses an edited one, which is the
  same tool an author reaches for either way. `npm run probe -- content` is the
  standing-in answer and says much less.
- **Nothing else in 900 lines was refused.** After the oracle was answering the
  right question, the module went in clean, and `npm run probe -- content --test
  tulsa` turned each of the five `# test` sections around in about a second.
  Both of those are item 2 and item 3 paying for themselves in the same hour.

## Playbot run 4, 2026-08-22, bughunt, 27 turns — the first run to reach Tulsa

Opened on `--save tulsa.in-town`. Twenty-seven turns applied, none refused. It
reached nine of the town's places — the square, the row, the rooftops, the forge,
Oolga's house and cellar, the sewer outfall — fought feral rats and won them, and
then stopped itself on a real blocker. **The fight fix worked in a live run**: the
rat went 24 to 15 to 6 with both sides trading, which is the case that could not
be won this morning.

### Every person in Tulsa goes mute after one conversation

Reproduced exactly:

    talk 0   "I lost it. It went down there." / "He does not say what…"
    talk 1   (nothing)
    talk 2   (nothing)
    talk 3   (nothing)

All thirteen of Tulsa's dialogues are one node marked `always` and nothing else. A
node is spoken once; **`sticky` is what makes it repeat and `again:` is what it
says the second time**, and `content/tutorial-quests.dsl` uses both. Tulsa uses
neither, anywhere. So the town has one line per person and then silence for the
rest of the game.

**This is the authoring loop's own failure and it is the most important thing this
run found.** A cold agent wrote thirteen dialogues that are each broken in the same
way, `npm run oracle` never said the fact that would have prevented it, the corpus
loaded clean, `npm test` passed, and `npm run review` printed all thirteen lines
without a hint that no player would hear twelve of them. Nothing in the loop
catches "this node can only ever be heard once", and the loop's whole claim is that
an outline goes in and a module comes out.

`always` reading as *always available* rather than *always said* is exactly the
shape `facts-to-home.md` exists for, and it wants the first home on that list: the
engine refuses it, or the oracle says it on the line.

### A conversation with nothing to say says nothing, and that reads as a bug

When the node is spent, `talk` resolves to no lines at all and the view re-renders,
which the player sees as the location's arrival text. The bot read *"talk is
completely non-functional in Market Square"* and stopped the run — the same wrong
diagnosis, from the same cause, as Miki's apology branch in run 3.

**Twice now, an entity with nothing to say has been reported as a broken engine.**
Either the talk choice is not offered when nothing would be said, or something is
said. Silence is the one option that cannot stay.

### The action status line always reads 100% done

*"Fight 100% done, 0 attempts"* stood while the rat was at full health, and stayed
while it dropped to 6. Reported on six separate turns.

**This one is ours, surfaced by the cycle rule that landed an hour earlier.**
Control now returns exactly at a cycle boundary, so the action a player is looking
at has always just finished one. The label is describing the cycle behind it rather
than the one ahead. Nothing was wrong with it before because the action was
freshly re-armed each time — which was the bug.

### Smaller, and each real

- **The journal points at Miki from inside Tulsa**, where Miki cannot be reached.
  Partly a fixture that starts a player in town with the tutorial quest unstarted,
  partly the standing complaint that the journal does not keep up with the player.
- **Flavour promises interactions that do not exist**, reported unprompted three
  times: the sewer grate is named in the room and cannot be touched, *"a rack of
  axes nobody is watching closely enough"* offers no way to take one, and Oolga's
  *"something glints in her eye"* opens no counter. These are for the review pass —
  writing that implies a mechanic is a promise, and a playtester files it as a bug.
- **No way to rest or heal**, noticed at 14/30 health with nothing to do about it.

## Reviewing the writing, 2026-08-22

`npm run review [-- <module>...]` prints every line the game can say, under the
section that says it, in the order its module writes them. The set derives itself
from the locale tables the engine builds off each kind's own prose fields, so
nothing has to be marked to be reviewed and `@@@` keeps meaning what it means.

Building it found two things:

- **`engine-en` reported nothing to review, and it holds 209 lines.** A `#
  locale` section names its keys rather than growing them off a section's fields,
  so a sweep over the base table reaches none of them. Every travel line, every
  combat line, every inventory label — what the game says when it is speaking on
  its own behalf — would have been reviewed by nobody. A sheet that reports zero
  is the failure a `loose` bucket exists to catch, and the bucket is now asserted
  empty over the corpus.
- **The writing hole is `tutorial-quests`, not `tulsa`.** 17 of its 59 lines carry
  a mark and most are bare: Miki's *snubbed* and *apologised* routes have empty
  `log:`, `hint:`, `again:` and whole dialogue lines, so a player who turns her
  down walks into blank text repeatedly. Tulsa is written; the quest module that
  the tutorial actually runs on is not.

Standing, per module: tulsa 213 lines / 6 auto-titled / 7 marked; engine-en 209 /
0 / 0; tutorial-island 168 / **78 auto-titled** / 6; tutorial-quests 59 / 0 / 17;
combat-expansion 52 / 23 / 0.

Two named lines for whoever reviews: `sha-dynastys` renders **"Sha Dynastys"**
without its apostrophe, and the outline's *two lines of island fiction* were never
actually replaced — `content/tutorial-quests.dsl:22` and `:85` still say *this
island* and *a boat to the mainland*.

## Playbot run 3, 2026-08-22, bughunt mode, 23 turns — stopped itself

Ran over all five modules. Twenty-three turns applied, none refused, and the bot
ended the run itself by declaring the game blocked. **It never reached Tulsa**;
every turn was spent in the guide house and the basement. Each of its two findings
was reproduced here before being written down, and in both cases the symptom was
real and the cause it named was wrong.

### ~~Swinging again never kills anything~~ — closed, and it was narrower than first written

Measured, three swings at the basement rats each way:

    swing, swing, swing                 rats-killed 0    xp {}                 time 7200
    swing, wait 5s, swing, wait 5s, …   rats-killed 3    xp melee 16          time 22200
    swing, wait 30s, …                  rats-killed 3    xp melee 16          time 97200

Twenty consecutive swings with no wait kill nothing at all and earn no xp. The bot
called this *"health tracking is broken"* after watching a rat sit at 10/20 for a
dozen turns; health tracking is fine. **Re-issuing the action restarts the cycle
that was in flight, so a swing only ever lands if something lets it finish.**

`content/tutorial-quests.dsl:203` already knows: *"each `use:` starts the fight and
the `wait:` lets it play out"*. So the corpus's own test passes, and a player doing
the one obvious thing — hit it again — can never win a fight. Every renderer offers
that button and none of them says waiting is what resolves it.

**Closed by the engine rule: issuing an action carries it to the end of one of its
own cycles.** Re-issuing the same action against the same target advances it
instead of re-arming it, reusing the one cycle-stepping primitive `wait: done`
already had. Control still returns after each cycle, which is what keeps breaking
off mid-fight possible — that case is the whole reason it does not simply run the
fight. Measured after:

    3 swings, no wait     rats-killed 1   melee 5    time 7200
    8 swings, no wait     rats-killed 3   melee 16   time 16800

No fixture moved. Every existing route that fights already separates
re-engagement with a `wait:`, so the new branch is unreachable from anything
written before it, and `# test tutorial-quests.rats-fall-to-repeated-use` — ten
`use:` lines and no `wait:` anywhere — is the claim that would have caught it.

**The severity was overstated when first written, and the correction is worth
keeping.** "Every renderer offers that button and none says waiting resolves it"
is not true: `src/runtime/command.ts:674` picks `driveChoice` when the context can
drive live and `applyChoice` when it cannot, and the GUI always sets
`driving: true` (`src/ui/driver.ts:76`). A live driver ticks the action to
completion on its own, so **the GUI never had this bug**. What had it was every
non-driving context — the playbot, and `play-cli` outside live mode.

That is still worth the fix and arguably more interesting than the original
reading: the same button meant two different things depending on who was holding
it, and only one of them was any good. It now advances the action either way, live
or a cycle at a time.

A setting was considered and refused. A mode is two behaviours to keep in step,
and "wait five seconds" is a cap nobody declared — the same reasoning that
produced `wait: done` instead of `wait: 30` in `loop-backlog.md` item 5.

### Miki's apology branch says nothing, and reads as a softlock

The bot reported the snub-then-reconcile path as *"a genuine softlock in that
dialogue branch"* and repeated it for six turns. The branch works. What is said
along it:

    accept                       three lines, as written
    decline                      "Hmph. Suit yourself. Don't come crying …"
    apologise, then talk again   [""]

The mechanic advances correctly and the options offered are the right ones. The
line is a bare `@@@`, so Miki opens her mouth and nothing comes out, and a player
reasonably concludes the game is broken. **This is unwritten prose presenting as an
engine fault**, which is the strongest argument yet that `@@@` on a line the game
actually says is not a neutral placeholder — it is a bug report waiting to be filed
by somebody who cannot see the source.

`npm run review` had already named this file as the hole — 17 of its 59 lines carry
a mark, concentrated in exactly these two stages — one run before the playbot found
it from the outside.

### The bot cannot start anywhere, so it can only ever test the tutorial

`scripts/playbot.ts` calls `startSession(registry)` and has no way to open on a
`# save`. The corpus holds twenty save fixtures, three of which put a player in
Tulsa, and none of them is reachable from the run. So the bot has to play the
tutorial correctly before it can reach anything else, and this run proves it will
not always manage that: it snubbed Miki on turn 2 and was still in the basement at
turn 23.

The playbot spec calls the save fixtures "the start-anywhere lever" and they are
not wired to the lever. **A `--save <id>` flag is what stands between the bot and
every region authored from here on.**

### What worked

- The self-stop. `BLOCKED` ended the run cleanly rather than burning seventeen more
  turns on a rat, and the reason it gave was specific enough to reproduce from.
- The cost shape holds: 2–4 tokens billed in per turn against 3.5k–10k cache reads,
  every turn from the second onward.
- `npm run playbot` has no `--help`; it reads the first unrecognised argument as a
  file and dies in `readFileSync`.

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
