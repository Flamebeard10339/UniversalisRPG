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

## Seven mechanisms have never been mutated

The sweep that de-balanced the suite covered buff expiry (12 tests catch a break in it),
skill levelling (46), equipment slots (1), the thorns passive, the bench, the window drop
and the live bar. What it did not reach: **drop tables, conditions, cadence and attempts,
the save round-trip, dialogue, quests, and map travel.** Nothing says those are over-proved
or under-proved; nobody has looked.

The instrument is `npm run mutate -- <manifest.json>` and the finding it produces is either
a duplicate to delete or a mechanism nothing catches, and both are worth having. It is a
suite run per mutated line, so it is bounded by how many lines you pick rather than by the
tool.

**`npm run mutate` writes the break into the working tree and puts the file back
afterwards, so it may only be run in a worktree nobody else is in.** An interrupted run
leaves the file broken on disk.

*Closes when:* each of the seven has had at least one mechanism broken and the catchers
counted, the duplicates that shows are deleted, and anything caught by nothing is either
proved or written down here as knowingly unproved.

## `integration.test.ts` reports a route's verdict twice

`played()` re-asserts each route's verdict, and the corpus harness already asserts it. A
genuinely broken route therefore reddens two lines rather than one — the shape `CLAUDE.md`
names when it says a route's verdict is reported once.

It is milder than the rule's target case: both lines are in one file and both name the
route, so a reader is not sent across the tree after a content bug. It was found during the
balance sweep and flagged rather than changed, because changing it is a question about what
`played()` is for rather than a line edit.

*Closes when:* `played()` either stops asserting the verdict, or is the one place that does
and the corpus harness's claim is the one that goes — not both, and whichever stands says
in its own name that it is the verdict's home.

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

## Nobody has established that editing while playing is cheaper than reporting and fixing

The premise of handing a playbot the authoring vocabulary is that a bot editing in situ
beats a bot reporting and an agent fixing. It is a real hunch and it is not measured, and
the arms it is usually stated as — *fleet* against *global agent* — do not isolate it,
because they differ in two things at once: **who found the gap** and **who wrote the DSL**.

What is already known cuts across it. Where the edit is a fact about the world you are
standing in and the kind is schema-driven, editing in situ plainly wins, and `/place` and
`/link` are that case working today. Where the edit is a quest — stages, conditions and
dialogue, written at `effort: 'low'` by a model with no grammar in reach, one line per
turn, no way to run a `# test`, and both of the blockers above in the way — an agent with
the corpus, the oracle and `npm test` is not obviously paying more.

*Closes when:* the sweep is run as three arms over one brief — report-only bot then coding
agent, editing bot alone, coding agent alone — and the report says what each cost and what
each landed. The fan-out that makes it affordable, and its price: `--save` opens a run on a
fixture, `content/first-steps.dsl` carries 15 and `tulsa.dsl` 18, and a state bug is found
starting mid-quest and leaving wrong rather than playing forward from turn one. One bot per
save at the default 100 turns is 1,500 model calls a sweep. Isolation is a copy of
`content/` per bot and a local file of its own — `isolatedCwd()` and absolute paths already
carry it, and nothing commits, so the one-writer rule has nothing to bite on.

## N bots hitting one edge case would file N near-identical proofs

`runAsSections` turns a run into a `# test`, which is what makes a fan-out cheap to keep.
It is also this repository's worst failure mode pointed at its own suite: three harnesses
replay every corpus `# test`, `npm run review` walks them, and the first item in this file
already says the suite holds duplicate proofs. A sweep that files every bot's run adds to
that by construction.

`npm run mutate` cannot be the gate — it writes a break into the working tree, so it may not
run in a checkout anyone else is in, and it costs a suite run per line.

*Closes when:* the merge step over N staged local-changes files is written with a stated
rule that at most one route is kept per end that was not reachable before, and the rest are
read and discarded. Two staged sections at one id are k candidate implementations and the
diffs are the argument; two staged sections at different ids for one gap is the one-home
call, and the only judgement the loop owes a human.

## A typo in a patch heading now makes a section instead of being refused

Home-from-id was the trade: a staged `# item base.cabel` used to be refused as naming an
unknown item, and now declares a new one under `base`. The lane that landed it said so
plainly and rewrote the `resolve.test.ts` case that asserted the old refusal.

That is the right default for a run that authors — a bot writing a section nothing declares
is the whole deliverable — but it means the language has stopped catching the commonest
authoring mistake there is, and it catches it nowhere else either.

*Closes when:* a staged section whose id is one edit away from a loaded one says so, and an
author who meant the loaded one can take it. Not a refusal — the new section has to stay
available — a report beside it, in the same place `/dsl` already answers.

## A place the map draws still has nowhere to go home to

`/dsl` now refuses an unqualified id, and a qualified one lands in the module its namespace
names. The map pane was not brought over with it: a new place is written
`# location local-changes.<id>`, and `contribution:consolidate` correctly answers that
nothing declares that key, so map-drawn rooms stay staged for ever.

*Closes when:* the map pane names a module the way `/dsl` now makes an author name one, and
a place drawn on the map consolidates into that module's file.

## `squash-local-changes` has not been told about a section nothing declares

`npm run contribution:squash` prints one module's canonical source with the staged changes
folded in. It was written when every staged section was an edit to a shipped one, and it was
not taught about a brand-new section arriving under a module it does not yet declare.

*Closes when:* squashing a module shows a section staged under its name that it does not yet
hold, in the place consolidation would put it.
