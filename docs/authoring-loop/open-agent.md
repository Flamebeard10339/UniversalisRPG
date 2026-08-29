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

## A bot cannot see why what it wrote did not load

**This is the last blocker, and it is the whole of what stopped the final run.**

Measured 2026-08-29 against `4bcdb1f1`, with the stage-merge landed and a quest editable one stage
at a time. 117 turns, 24 minutes, $3.17. The bot typed four `/dsl` lines. **All four were refused,
and every one got the same sentence:**

    local changes did not load, so nothing was written and the world is as it was.

That is the generic module-load failure. It does not say which line, which section, or what was
wrong. The bot wrote a plausible quest body, was told nothing, guessed the indentation, was told
the same nothing, guessed again — and stopped itself: *"Out of turns to iteratively fix DSL syntax
errors ... rather than repeat guesses."*

Turns 107 and 108 differ **only in the indentation of the line after `stage asked:`** — one space
against two. Turns 116 and 117 are the same pair again on a renamed stage. That is a bot doing
binary search on whitespace because nothing will tell it what it got wrong.

A refusal that quotes the head line and names the shapes that could stand there already exists — it
answers the *shape* refusal at `/dsl`'s own head. This is a different path: the section parsed, was
staged, and then **the module failed to load**, and that path has no diagnostic at all. The loader
knows exactly what is wrong: `loadUniverseWithDiagnostics` produces it and `formatModuleDiagnostic`
renders it, and `scripts/playbot.ts` already imports both. It is not reaching the author.

**The same sentence is the reported symptom of the map-editor line in `docs/map/open-agent.md`**,
which is the second place an author meets it. One fix serves both.

*Closes when:* a staged edit that will not load says what the loader said — the line and what was
wrong with it — wherever an author meets it, reading the diagnostic the load path already produces
rather than a second copy of it. **This is the highest-value line open**: every other affordance for
authoring inside a run now exists and is proved, and this is the one that makes them unusable.

## What the two arms cost, and what each landed

Both arms ran the same brief over the same world on 2026-08-29. The playbot is Sonnet 5 at
`effort: low`.

| arm | wall | tokens | cost | quest |
|---|---|---|---|---|
| playbot, `--mode briefed`, 117 turns | 24.0 min | 95,208 out; 1.92M cache read; 732K cache write | **$3.17** | **none** — 4 edits typed, 4 refused, nothing staged |
| a cold coding agent, same brief, no playbot | 17.2 min | 232,423 total | **~$0.65** | **all five beats**, walked by a corpus `# test` |

The playbot spent **74 of its 117 turns reading** (61 `/source` applied, 13 refused) and reached its
first edit at **turn 107 of 120**. The cold agent read the same world off disk and wrote the file.

So: **five times the money, forty percent more wall time, and nothing shipped.** Per turn the
playbot is cheap — 2.7 cents — and per completed task it has no figure at all, because it has never
completed one.

**This does not settle the premise, and the reason is the line above.** The final run failed on a
missing diagnostic, not on the bot's judgement or its grasp of the language: it had read the corpus,
found the right id, chosen the right stage, and written a body whose only visible defect was
whitespace. What is measured here is a loop with one broken link, not a bot that cannot author.

*Closes when:* the diagnostic line above is closed and this run is repeated. If the bot then lands a
quest, these numbers are the before. If it still does not, the premise is answered and the playbot
is a reporter — which is worth having: the two `first-steps` repairs that landed this session both
came out of playbot reports, and no agent reading the corpus had found either.

## Two traps that cost a run each, written down so they do not cost a third

- **`npx` on Windows truncates a multi-line argument at its first newline and silently drops every argument after it.** A briefed run was launched with `--brief "$(cat brief.txt)" --save … --local … --turns 100`; `parseArgs` received five arguments, not nine. The bot ran with a one-paragraph brief, no `--save`, and staged into the shipped corpus. Nothing said so. **Use `node --import tsx scripts/playbot.ts`.**
- **Nothing detects a truncated brief.** The run above was read as evidence for two hours before the cause was found. A brief that arrives as one line is indistinguishable from a brief that was one line.

*Closes when:* a run refuses, or at least says out loud, that its brief arrived as a single line
when the operator passed a file — or the brief is passed as a file rather than as an argument, which
removes the shape of the trap rather than reporting it.

