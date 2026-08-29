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

## `authoringSurface` keeps its own copy of what a section is called and where it is

`src/ui/authoringSurface.ts` still holds `sectionsIn`/`addressOf` and its own `names()`, all of
which now exist once under `content/` — `sectionsWritten` walks the loaded sources and
`namesFrom` answers whether an id names a section, and `/source`, its kind listing, its refusal
and `/journal` all read those.

The pane was left alone while two lanes were in that file. It is the same fact in two places,
which is the thing this repository spends its commits undoing.

*Closes when:* the pane reads the one walk and the one naming rule, and nothing under `ui`
answers what a section is called.

## A bughunter reports and does not repair

Measured on the run of 2026-08-29 against `46120faf`: 44 turns, `--mode bughunter`, the
authoring vocabulary in its prompt and the report gate open behind it. It filed substantive
reports throughout — including a real one, that Miki answers *"So you found the market…"* while
the quest is asking for a pond fish — and it typed **no `/dsl`, no `/place`, no `/link`: zero
edits in forty-four turns**.

Nothing refused it. It did not reach for the ability it had.

That is the first real datapoint under the editing-versus-reporting line below, and it points
the other way from the hunch that line records. It is one run and one framing, so it settles
nothing on its own — but a bot that will not edit unless told to is a different animal from one
that edits instead of reporting, and the sweep below should be read knowing this happened.

*Closes when:* it is known whether this is the framing or the model — the same brief run with
the repair asked for in the imperative, against the same save, and the edit counts compared. If
it is the framing, `BUGHUNTER_FRAMING` says so plainly; if it is not, that is worth more than
the sweep below and belongs above it.
