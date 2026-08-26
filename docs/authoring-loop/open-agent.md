# What is still wrong that an agent can take

The queue an autonomous lane picks from. Everything here is open; nothing here is
done. **A line is deleted the day it closes** — not struck through, not annotated,
deleted. Git holds the reasoning, and the commit that closes a line is where the
reasoning belongs. Nothing here records what has been decided: a ruling a later
agent could get wrong is a test, and a test is where they will meet it.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here is proved headlessly — `npm test`, `npm run probe`,
`npm run oracle`, `tsc --noEmit` — and the shape is already settled, so a lane can
take one to the end without asking. What waits on the owner's play, his reading of
the writing, or a ruling nobody has taken is in `open-human.md`.

**A GUI line is proved the way `CLAUDE.md` says and no further.** The decision goes
in a `.ts` beside the component and is tested there; the wiring is built, `tsc` and
the suite are run, and it is handed to the author in one line. A lane that cannot
find a pure decision under a GUI line says so rather than reaching for a screenshot
loop. Half of what is below is GUI, because it came out of a playtest.

**A line here that turns out to need his judgement does not stay here flagged — it
moves, carrying what you measured.** Guessing the ruling and abandoning the lane
are the two bad answers, and the second is worse, because the measurement dies with
the session. The `hand-over` skill states how a line crosses, in both directions,
and is the one place that rule is written.

---

## From the owner's second playtest, 2026-08-25

`.planning/yonatan-playtests/run-2026-08-25t14-51-24-926z-reviewed.md`, sixty turns
through Miki's route recorded through the playtest tool against `56a2dca7`. Every
line quotes what he wrote at the turn it happened. Four were measured against the
live loader while the run was read, and those carry the measurement — the run is the
evidence a line exists, and the measurement is the evidence about its cause.

### What the chat says, and when

So: talking with more than one thread open **offers the paths as a choice**, quest
threads ahead of the rest, each labelled in words rather than with its first spoken
line. The reproduction is a fresh game on this branch — talk, take *"I'd rather find my
own way"*, refuse again, leave by the window, come back — and today it says nothing and
draws a bare list labelled with each thread's opening line. `isThread`
(`src/content/sections/dialogue.ts`) is `when !== undefined || ask !== undefined`, so
every quest-given node is a thread including one the author wrote `always` on, and
fifteen of Miki's sixteen nodes are threads. **Do not take the one-line `isThread` fix
on its own:** it was measured, it makes Miki speak, and it strands the whole
`apologised` route, because `snubbed.miki.0` becomes an `otherwise` node and
`adrift.miki.0` is `sticky` on a flag that never goes false. `apology-route-full`
apologises before ever leaving the house, so the suite would not catch it — a proof
that walks out of the house and back is part of closing this.

### The fight

**Three siblings of the arming question are unasked, and they were measured while it was
answered.** All three are the same conflation one step over, all reachable only by a
directive, and none is reached by anything shipped today — which is why they are one line
rather than an emergency.

- **`use: location.<other-room>.<action>` still arms.** `armAction` passes a target only for
  `obj === 'entity'`, and `isElsewhere` cannot cover a room because location ids are not in
  `entitiesStood`. Same shape, different list to ask.
- **`standsAgain` and `fightLeftItsLocation` still ask `isStanding`**, so a fight or a
  repeating depleting action against an entity no room stands would stop, or fail to re-arm.
  Nothing reaches it today.
- **`actionVisible` throws before `whyRefused` runs**, so an action `hidden if:` from the far
  room raises `action hidden: …` instead of being refused in the player's own words. Two of
  the 82 corpus doors hit this, and the sweep that found them skips them honestly rather than
  asserting on the raise.

*Closes when:* each is either asked the same way the entity question now is, or written down
as differing with its reason. **The third is the one to think about first** — it is the
`hidden if:` rule and the refusal rule meeting, and which of them owns that moment is a
design answer rather than a patch.

---

## From the owner's rulings on `open-human.md`, 2026-08-26

Each line below crossed from `open-human.md` carrying what had already been measured
for it. The ruling is quoted; the measurement under it is what the lane that raised it
found, and is not re-derived.

### Nobody has swept the suite for asserts that pin a balance number

The rule itself is settled and lives in `CLAUDE.md` — a test asserts that a mechanism
works, never that a number is the number it is today. What is open is that **nobody
knows how many tests still break the rule**, because it has only ever been applied
where a lane happened to trip over one.

What is known, from lanes that did trip: two in `resolve.test.ts` and `driver.test.ts`
were rewritten and renamed to say what they now assert; the engagement tests were found
already clean, each declaring its own `# variable engagement-seconds` and reading it
back rather than naming the world's; and `scripts/play-cli.test.ts` was found asserting
a **flat progress bar that was a bug**, which is the shape that makes this worth
sweeping — a pinned number does not merely churn, it can pin the defect.

*Closes when:* the suite has been swept once and the count reported. `grep` for numeric
asserts standing on `attack`, `health`, `damage`, `xp` and `rage`, and for `expect only:`
sheets holding combat figures. Each one either stops asserting the number or asserts the
shape instead — that a blow lands, that two swings differ, that a cap bites. **Report the
count before editing**; if it is large, the sweep is its own commit.

## From the owner's third playtest, 2026-08-26

`.planning/yonatan-playtests/run-2026-08-26t14-27-54-074z.md`, recorded against
`8c853ce5`. Most of what it raised was taken straight into lanes on the day and is
closed; what stands below is what nobody was briefed on, because it was measured
while the run was being read rather than while it was being played.

### A failed lift makes the next one fail, and that is what "every single time" was

He wrote, at the third attempt on a townsman: *"I am taking damage every single time?
You should only take damage when you fail."*

The literal reading is wrong and the experience is real. `drain: 1 health` sits only in
the losing row of `pick their pocket:` (`content/tulsa.dsl`, civilian ~:772) — a
successful lift costs nothing. What actually happened is a cascade:

- `# stat thieving` is base **60**; the civilian's losing row is weighted **25x**. So a
  first attempt wins 60/85 — about seven in ten, which is exactly what the module's own
  header comment claims.
- The losing row also does `inflict: thieving.dazed`, and `# item dazed` is
  `3s, -90% core.attack-rate, -90% thieving` (`content/thieving.dsl:36`). Inside those
  three seconds `thieving` is **6** against the same 25, so the next attempt wins 6/31 —
  about **one in five**.
- `rate: 30` is one attempt every two seconds, so the daze always covers the next
  attempt and often the one after. One unlucky lift drops the player into a stretch
  where four in five fail, each failure re-inflicting the daze.

So the skill has two success rates — the advertised seven-in-ten on the first attempt,
and one-in-five for as long as the player keeps trying — and nothing tells the player
which one they are in. The module's header comment states only the first and is
therefore wrong about the mechanism it introduces.

**Half of this is now built and the half that matters is not.** A rate of zero stalls a
run outright — `attemptDuration` returns `Infinity`, the bar stops rather than crawls,
and the run resumes on expiry — and `# item dazed` carries `-100% thieving-rate` so
being caught genuinely stops the hand. That is what the owner asked for on the screen.

But `dazed` **still carries `-90% thieving`** beside it, and `thieving` is still the
weight contested against the mark's fixed number. So the arithmetic above is unchanged:
the second attempt is still about one in five where the first was about seven in ten.
The stall makes the penalty visible; it does not make it smaller.

*Closes when:* the penalty stops multiplying a weight contested against a fixed number,
or the module says out loud that it has two success rates and which one a player is in.
**Do not fix this by retuning the -90%** — that is a balance number, and what wants
deciding is whether a penalty to a contested stat may swing a roll fourfold, which is a
mechanism question. The evidence is the two arithmetic lines above, reproducible from
the declarations alone.

## A bar test passes whether or not a bar moves

`src/ui/render.test.tsx`'s claim *"moves a bar over exactly one tick of the cadence
both drivers read"* is vacuous, and it was measured rather than suspected: a lane
mutated its fixture to an instant `examine`, watched two neighbouring tests go red,
and that one stayed green.

The cause is a shared constant doing two jobs. `FILL_TRANSITION`
(`src/ui/transient.ts:27`) is read by `Meter.tsx` as well as `LiveSheet.tsx`, so
`transition-duration:${LIVE_TICK_MS}ms` is in the markup whether or not a run is
armed at all. The test finds it either way. This predates the lane that found it —
nothing recent broke it, it never worked.

*Closes when:* the claim fails on a tree where no run is under way. That probably
means the bar's transition and a meter's are not the same fact and should not be
the same constant, which is the interesting half; asserting on something only
`LiveSheet` draws would also do it and is the cheap half. Whichever is taken, make
the mutation first and watch it fail, because that is the step that was skipped.

## `StatShare` sits above two of its readers

`madeOf` moved down into `src/runtime/statScreen.ts` so both surfaces read one
implementation, but it takes the share **structurally** rather than naming
`StatShare`, because importing that type from `session.ts` closes a cycle:
`session.ts -> runtime.ts` and `statScreen.ts -> session.ts`. `npm run layer-check`
is what said so. `tsc` still binds them at every call site, so nothing is unsound
today — the type is just not named where it is used.

*Closes when:* `StatShare` lives beneath both, say `src/runtime/statShare.ts`,
re-exported from `session.ts` so no published surface changes, and `madeOf` names
it.

## Nothing refuses two rooms standing in one place

Two `# location`s at the same `x/y/z` load clean, validate clean, and draw stacked on
the map. `src/content/sections/location.ts:170-188` has no uniqueness check, and
`spotOf` (`src/ui/discovery.ts:74-76`) is `at.x * PER_UNIT` with nothing behind it.

Not hypothetical: **the shipped corpus had one**. `proving-ground` and `riverside` were
both at `(5,1)`, drawing on top of each other, and it was found on 2026-08-26 only
because a lane laying out a grid town wrote its own throwaway collision check to protect
its own work — nothing in the repo would have said so. Relative placement (`east of X`)
moves exactly one unit per step and resolves recursively, so a chain of them collides by
accident easily.

*Closes when:* the load path refuses a collision, naming both rooms. About ten lines over
`registry.locations`, and it must exempt nothing — a genuine stack of floors already
differs in `z` and passes on its own. It belongs in `src/content/`, beside the other
things a location is refused for.

## `north of X` draws X's neighbour below it

`src/content/sections/location.ts:104` maps `north` to `[0, 1, 0]`, and `src/ui/discovery.ts:74-76`
maps `y` straight to screen-y, where larger is *further down*. So a room written
`north of market-square` is drawn south of it.

The corpus already disagrees with itself about which convention it is using, which is how
this survived unnoticed: some rooms are placed by the relative word and some by an explicit
`y:`, and the two do not agree.

*Closes when:* either the vector flips or the words are renamed, and the corpus is made
consistent with whichever is chosen. **Check both spellings across `content/` before
flipping anything** — the change that is one line in `location.ts` is a sweep through every
explicit `y:` in the corpus, and the map's `CLIMB_NUDGE` for off-plane rooms reads the same
axis.

## `--record` cannot refuse to print a body from a walk that stopped short

`npm run probe -- content --record <test-id>` prints the run's verdict above the body, so a
reader can see that a route failed before pasting what it ended on. It cannot do better than
report: `sessionOver` is unexported from `src/runtime/session.ts`, so `walkTest`'s `walked`
is unreachable over a bare `createGameState()` — which is what the tool runs on, because
`startSession` would change every recorded body.

So the guard against pasting a truncated sheet is currently a human reading a line. That is
thin for a tool whose whole purpose is that sheets stop being hand-maintained.

*Closes when:* `sessionOver` is exported and `--record` compares `walked.length` to
`testSteps().length`, refusing outright rather than printing a body it knows is short.
