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

## A quest edited from inside a run is silently thrown away

This is the blocker under everything below, and it was measured rather than suspected.

`define.ts` gives a kind that declares `fields` a merge built from them, and a kind that
declares its own `parse` gets `into ?? from` — **the first module to write an id wins and
every later module's section is discarded, whole, with no diagnostic**. Only `dialogue`
declares a `merge` of its own, so this is `quest`, `droptable`, `action`, `save` and
`test`.

Measured on a copy of `content/` with one section appended to `local-changes.dsl`:

- `# item tulsa.sewer-key` writing only `examine:` — merged; `title:` survived. Every
  schema-driven kind behaves this way, which is why `/place` and `/link` work.
- `# quest ball-of-a-boy.down-the-grate` rewritten **whole** — `probe --show` prints the
  shipped quest, unchanged. `/dsl` answers `Staged # quest …` either way.

So an author's session, the app's edit pane and a playbot handed `/dsl` can all stage a
quest edit, watch `/reload` succeed, and change nothing.

The field loss this looks like is real too, and lands one step later: `foldedHome`
(`scripts/consolidate.ts:137`) returns the staged text **whole** when the kind has no
schema, so a partial quest edit that did nothing in the session would replace the whole
quest in `ball-of-a-boy.dsl` on consolidation. Both halves are the same missing fact —
these kinds have no answer for *what a second body at one id means*.

*Closes when:* every content kind that lands in a map answers that question in its own
file, and a claim in `src/content/dsl.test.ts` derives its subjects from the section list
rather than naming them — for each kind, a second body at a declared id either merges by a
rule that kind states or is refused where it is written. Silently keeping the first is the
one answer that must stop being available. `quest` is the one with a real design question
in it (a stage list is closer to `entries` than to a field); the rest can likely refuse.

## A section authored during a run has no way home

Measured: `# quest brand-new-quest` staged in a copy of `local-changes.dsl` loads clean and
lands in the registry as `local-changes.brand-new-quest`. `npm run contribution:consolidate`
then answers `no file under content/ declares quest local-changes.brand-new-quest` and
leaves it staged, because `declarations()` (`scripts/consolidate.ts:63`) only ever looks for
a file that already declares the key.

Home-derived-from-id is therefore true of **edits** and not of **new sections**, which is
the whole deliverable of anything that plays content into existence rather than fixing it.

*Closes when:* a staged section whose id nothing declares names its own destination, and
the id it lands under stops being `local-changes.…`. The cheapest shape that does not add a
second authority: the module a new section belongs to is written in its id the way every
other address is — `# quest ball-of-a-boy.mouse-pays-the-toll` — and consolidation places a
section whose namespace names a loaded module into that module's file, landing among the
sections already of its kind, the way `npm run move-sections` already does it. Refusing a
bare unqualified id at `/dsl` is what makes the rule legible at the point of writing.

## The playbot cannot ask what a kind may hold

`sdkOptionsFor` passes `tools: []` and the reply schema is one flat JSON object, so the
model's only channel is one line of this game's own command line per turn. No command
prints a kind's grammar: the two renderers are `scripts/oracle.ts` — which itself imports
`src/ui/offerGroups` — and `src/ui/editControls.ts`, both above `runtime`, so a `/grammar`
command cannot reuse either. It could read `sectionFor(kind).grammar` (`content` is below
it) and render it a third time, which is the thing this repo is worst at.

The measurement that bounds the alternative: `systemPromptFor('author')` is 11,971
characters today, and the oracle's own output for the kinds a quest touches is about
25.6 KB — `item` 9.3 KB, `entity` 7.9, `quest` 7.0, `location` 5.8, `dialogue` 4.9. Putting
them in the prompt roughly triples it. That is a cache write once per run and a cache read
per turn, so the price is small; the cost is dilution of a prompt whose whole subject is
*you are the player and not the author*.

*Closes when:* the grammar is in reach of a run without a third renderer existing — either
the oracle's rendering moves down beside the declarations it reads and an `audience: 'author'`
command prints it, or the editing modes' prompts carry the kinds they are allowed to write
and the choice is stated where the mode is declared. Not both.

## The playbot's mode carries framing but not ability

`MODE_FRAMING: Record<PlaybotMode, string>` is the whole of what a mode is, and two places
hardcode the player audience instead of reading it: `playerCommands()` filters
`audience === 'player'` for the vocabulary block, and `offMenuCommand` refuses any
non-player command **before `runLine` sees it** — module-level, mode-blind, and the one
place the classification makes a behavioural difference rather than a prompt-text one.
`runPlaybot` also builds its context as `newContext(session, view(session))` with no
options, so `ctx.authoring` is undefined and every authoring command answers
`local authoring is unavailable.` — `fileAuthoring` (`scripts/play-cli.ts:293`) is exported
and in the same layer, and passes absolute paths through unchanged, so a bot's own corpus
copy and local file are the whole of the wiring.

Two hazards in the naming. `--mode author` today means the *exploratory* bot and is also
the **default** (`parseArgs` initialises `mode = 'author'`), so retiring the token means
naming a new default, not only rejecting the old one. And `fileAuthoring` snapshots
`baseSources` at construction while `fileContentReader` re-expands per turn, so a bot that
authors a new module mid-run stages against a stale dependency list.

*Closes when:* a mode is one declaration holding its framing and the audiences it may run,
the vocabulary block and the off-menu refusal both read the audiences off it, `requireMode`
rejects `author` naming both replacements, and `runPlaybot` takes an authoring context.
Three modes: a reader (today's `author` framing), a bughunter that may fix, and one that
carries a brief. Nothing new to keep in sync — one entry per mode.

## Reporting has to stay the precondition for fixing, not the alternative

The naive first read is the thing a playbot produces that nothing else can. A bot that can
edit will answer a gap with a diff, and a diff is the less valuable half — it can be
re-derived from the report, and the report cannot be re-derived from it.

A required field on the reply would be a second copy of the report and would drift from it.
The gate is derivable: `runTurn` already holds `deps.log`, so a `/dsl` line may be refused
on a turn whose journal window carries no non-empty `expected` or `confusion`. Same shape
as `stoppedBy` — read off the log, nothing stored.

*Closes when:* an editing mode's `/dsl` turn is refused unless the log behind it holds a
report, proved in `scripts/playbot.test.ts` over a fake client the way `stoppedBy` is.

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

## `localChanges` and `authoringSurface` each own a copy of *a section's verbatim text*

`readSections` (`src/content/localChanges.ts:36`) and `sectionsIn`
(`src/ui/authoringSurface.ts:31`) both walk `splitSections` and slice
`text.slice(span.start, span.end).trimEnd()`. What they do with it differs — one keeps the
local id and throws on a missing one, the other re-heads with the qualified address and
reports the module — but the slice is one fact written twice, and `content` is below both.

This is small, and it is not what gates the editing work; it is worth doing because
anything that prints a shipped section verbatim — a command, the pane, consolidation —
becomes the third copy otherwise. Verbatim and never `printSectionOf`: a re-emitted
canonical print drops the comments above a section on every edit.

*Closes when:* the slice lives once under `content/`, both callers read it, and whatever
prints a shipped section to an author reads it too.
