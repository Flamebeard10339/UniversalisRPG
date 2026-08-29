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

## A run can read a section it can name, and cannot find out what anything is called

Measured on the first briefed run, 2026-08-29, against `932562e1`. The bot was told to write
`ball-of-a-boy` and spent **five of its first six turns guessing the id**: `/source quest
ball-of-a-boy`, `/source quest first-steps.ball-of-a-boy`, `/source first-steps.ball-of-a-boy`,
`/journal ball-of-a-boy`, then `/grammar quest` — every one refused with *nothing loaded is
written as …*. It gave up and walked out of the house to find the id in the world.

`/grammar` answers what a kind may hold and `/source` answers what one section says, and
between them there is nothing that answers **what is loaded**. The journal prints a quest's
title and not its id, so the one place the bot could see the name it was briefed with is the
one place that will not tell it the address.

This is what the reading-examples hypothesis actually costs today: reading is cheap once you
can name a thing, and there is no way to learn a name.

*Closes when:* a run can ask what is loaded of a kind and get the ids back — `/source <kind>`
with no id is the shape that adds no new command — derived off the registry, and the same
answer the refusal should be suggesting when it says nothing is written as that id.

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
