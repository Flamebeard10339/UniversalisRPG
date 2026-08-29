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

## Nobody has established that editing while playing is cheaper than reporting and fixing

The premise of handing a playbot the authoring vocabulary is that a bot editing in situ beats a
bot reporting and an agent fixing. It is a real hunch and it is not measured, and the arms it is
usually stated as — *fleet* against *global agent* — do not isolate it, because they differ in two
things at once: **who found the gap** and **who wrote the DSL**.

What is already known cuts across it. Where the edit is a fact about the world you are standing in
and the kind is schema-driven, editing in situ plainly wins, and `/place` and `/link` are that case
working today.

**Three runs have now been made, and what they cost is here so the sweep does not re-measure it.**
All against a copy of `content/`, one bot, default effort, on 2026-08-29:

| run | mode | turns asked | turns played | wall | out tokens | cache read | cache write | edits |
|---|---|---|---|---|---|---|---|---|
| smoke | reader | 3 | 3 | 20.4s | 715 | 19,371 | 8,352 | — |
| first-steps | bughunter | 60 | 44 | 366.4s | 21,735 | 621,666 | 127,284 | **0** |
| ball-of-a-boy | briefed | 100 | 60 | 831.6s | 47,994 | 872,887 | 385,764 | 5 |

So a turn costs about **7 seconds when the bot is walking and about 14 when it is writing** — the
staging turn alone produced 4,695 output tokens, where a walking turn produces about 300. The
prompt is written once and read every turn, which is why cache read runs an order of magnitude
above everything else and why prompt size is close to free after turn one.

**Neither of the two long runs finished, and neither stopped for a reason about the game.** The
bughunter stopped on a note field that spelled emptiness rather than being empty; the briefed run
stopped on four `/dsl` refusals it could not read. Both are closed or queued. **Until a run ends
because it finished, none of these numbers is a cost-to-complete** — they are a cost-to-die, and
the sweep needs the first.

*Closes when:* the sweep is run as three arms over one brief — report-only bot then coding agent,
editing bot alone, coding agent alone — and the report says what each cost and what each landed.
Isolation is a copy of `content/` per bot and a local file of its own, and nothing commits, so the
one-writer rule has nothing to bite on.

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

## A bughunter never arrives at an edit, and it is not the framing

Measured over **320 turns in six runs**, three per arm, 2026-08-29. Arm A is the shipped
`BUGHUNTER_FRAMING`; arm B states repairing in the imperative the way reporting is stated, keeps
the report-first gate verbatim, and changes nothing else.

| run | arm | turns | edits | reports | wall s | out tok |
|---|---|---|---|---|---|---|
| A1 | baseline | 40 | 0 | 36 | 370 | 23,110 |
| A2 | baseline | 40 | 0 | 5 | 263 | 14,196 |
| A3 | baseline | 80 | 0 | 31 | 575 | 34,664 |
| B1 | imperative | 40 | 0 | 16 | 297 | 17,483 |
| B2 | imperative | 40 | 0 | 9 | 271 | 13,659 |
| B3 | imperative | 80 | 0 | 36 | 604 | 34,537 |

**Zero `/dsl`, `/place`, `/link`, `/unlink`, `/region` in all 320 turns, in both arms.** The
imperative rewrite was measured, found to change nothing, and reverted — the framing is unchanged
and is not the cause. **The gate was never the obstacle either**: 133 of the 320 turns carried a
report, so it stood open almost the whole time.

The bot does not refuse to edit. It never gets that far, for two reasons the logs show:

- **It cannot address the section it wants.** `/source` was typed 11 times in 320 turns and **5 were refused for a guessed id**. The bot reads a choice id off the view — `entity.fishing.shrimp-shoal.net` — and tries `/source entity.fishing.shrimp-shoal`, which is not how `/source` is addressed. It then burns two to four turns triangulating. That is the line below.
- **The horizon lands mid-diagnosis.** B1's last two turns were `/source quest first-steps.finding-your-feet` and `/source entity first-steps.giant-rat`, drilling into a real bug — three confirmed rat kills not incrementing `first-steps.rats-killed`. The run ended there. **More turns did not help**: both 80-turn runs typed *fewer* source reads than the 40-turn ones, because they wandered further into unfinished play instead.

*Closes when:* a bughunter run reaches an edit, or it is known why one never can. The two things
to try first, in this order: open the run on `--save` in finished content rather than in the
tutorial, where every run so far spent its first ten to fifteen turns; and close the addressing
line below, which is the one measured cost between a report and an edit.

## A choice id is not an address `/source` accepts

The view hands a player `entity.fishing.shrimp-shoal.net` and `/source` wants
`entity fishing.shrimp-shoal`. Every id in the view is a thing the engine can already resolve, and
the one command for reading how a thing is written will not take the form the view prints.

Measured above: five of eleven `/source` attempts in 320 turns were refused for this, each costing
two to four turns of triangulation, and it is the single most common refusal an authoring run hits.

*Closes when:* an id the view printed is an id `/source` reads, deriving the section from whatever
the engine already resolves that id to rather than by a second parse of the id's shape. A choice
id names an action on an owner; the owner is the section, and the engine already knows that.

