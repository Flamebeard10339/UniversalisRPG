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
| ball-of-a-boy, every argument landing | briefed | 120 | **120** | 1,147.9s | 70,739 | 1,933,201 | 809,546 | **0** |

So a turn costs about **7 seconds when the bot is walking and about 14 when it is writing** — the
staging turn alone produced 4,695 output tokens, where a walking turn produces about 300. The
prompt is written once and read every turn, which is why cache read runs an order of magnitude
above everything else and why prompt size is close to free after turn one.

**The one run that did finish spent 83 of its 120 turns reading.** 73 `/source` and 10 `/grammar`
against 11 talks, 11 modal answers, 8 uses and 3 travels — and **no edit at all**. It is the arm
with the most information and the best tools: the full brief, opened on `tulsa.in-town` in finished
content, every argument delivered. The truncated one-paragraph brief, by contrast, staged a
four-stage quest at turn 39. More to read made it write less, and that is the finding.

**Neither of the two earlier long runs finished, and neither stopped for a reason about the game.** The
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

## A bot writes only when the turns run out

**Four interventions have been measured against this, and the queue below is what is left.** Every
run was `--mode briefed` or `--mode bughunter` on a copy of `content/`, one bot, default effort,
2026-08-29. An "edit" is a `/dsl`, `/place`, `/link`, `/unlink` or `/region` typed.

| intervention | arms | turns | first edit | verdict |
|---|---|---|---|---|
| framing: repair stated in the imperative | 3 runs each | 320 | never, either arm | **no effect — reverted** |
| addressing: a view's id readable by `/source` | shipped | 120 after | never | **no effect on its own — kept, it is right anyway** |
| more turns | 40 vs 80 | 240 | never | **worse**: the 80s read *less* and wandered further |
| horizon: `Turn N of M` | 2 runs each | 240 | **turn 58 / 59** | **kept** — moves it off zero and nothing more |

What is ruled out: the framing, the report gate (133 of 320 turns carried a report, so it stood
open almost throughout), the vocabulary, and the grammar being out of reach. What is established is
that a bot **can** author — a truncated one-paragraph brief produced a staged four-stage quest at
turn 39, and a horizon run staged a flag — and that it will not do so while it has turns left to
read instead.

**The standing read: reading is safe and writing risks a refusal**, so the expected value of trying
is bad until the deadline forces it. Both horizon runs ended by stopping themselves naming the
deadline — *"Ran out of turns to reload and walk this final edit"* — which no control run ever did.

**The lever built against that read is shipped and unmeasured.** A refused edit now quotes the line
as typed, sets under it the shapes the grammar would have taken there, and says outright that
nothing was written; `/dsl`'s summary says the attempt is free. The lane that built it hit the
account's spend limit before running its arm, so **whether it moves the first edit earlier than
turn 58 is not known**. That measurement is the next thing to take, and it is one run against the
horizon numbers above — the controls do not need re-running.

*Closes when:* the first edit lands early enough in a run that the run can walk what it wrote. If
the cheaper refusal does not do it, the untried levers are: opening on a `--save` in finished
content rather than the tutorial, where every run so far spent its first ten to fifteen turns; and
a brief so small there is nothing to defer into — which is the shape the deliverable line below
now depends on.

## Ball of a Boy is still unauthored, and the approach to take is known

The quest is the push's deliverable and it did not land. `content/ball-of-a-boy.dsl` still holds
`# quest down-the-grate` as a stub with one stage and its `@@@`. Tulsa ships the whole physical
world for it — `mouse` and `sewer-grate` in the market square, `larry` on the hatch,
`sewer-entrance` → `sewer-junction` → `sewer-outfall` → `sewer-locked-room`, `# item sewer-key`,
`# flag sewer-toll-paid`, `# droptable ratman-remains`, and dialogue for Mouse, Larry and Charlie —
so this is quest stages, dialogue gated on them, Larry's toll and the ratman book, and no engine
work under it.

`tulsa.sewer-toll-paid` is read by the road out of `castle-yard` and **nothing in the corpus sets
it**, so that road is unreachable until this is written.

**The approach, chosen against what was measured and not yet run:** several short briefed runs of
25–40 turns, one beat per brief, all staging into the same accumulating `--local` file so each run
opens with the last one's work already in the world. A small brief and a short run take away the
room to defer into, which is what every long run used up. The lane that would have run this hit the
spend limit before its first run.

*Closes when:* the quest is authored by a bot, consolidated into `content/ball-of-a-boy.dsl` by
`npm run contribution:consolidate`, and walked by a corpus `# test`. **If it is hand-authored
instead, the exercise has failed and the commit says so** — the point is not the quest, it is
whether a bot can write one.

## Two traps that cost a run each, written down so they do not cost a third

- **`npx` on Windows truncates a multi-line argument at its first newline and silently drops every argument after it.** A briefed run was launched with `--brief "$(cat brief.txt)" --save … --local … --turns 100`; `parseArgs` received five arguments, not nine. The bot ran with a one-paragraph brief, no `--save`, and staged into the shipped corpus. Nothing said so. **Use `node --import tsx scripts/playbot.ts`.**
- **Nothing detects a truncated brief.** The run above was read as evidence for two hours before the cause was found. A brief that arrives as one line is indistinguishable from a brief that was one line.

*Closes when:* a run refuses, or at least says out loud, that its brief arrived as a single line
when the operator passed a file — or the brief is passed as a file rather than as an argument, which
removes the shape of the trap rather than reporting it.

