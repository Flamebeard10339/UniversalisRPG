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

**This does not settle the premise, and the two reasons it did not have both been closed since.** The
final run failed on a missing diagnostic, not on the bot's judgement or its grasp of the language: it
had read the corpus, found the right id, chosen the right stage, and written a body whose only
visible defect was whitespace. A staged edit that will not load now says what the loader said — the
line it stopped on and what may stand there instead. What is measured here is a loop with one broken
link, not a bot that cannot author.

**The reading both arms did was also being forced, and that is the second.** Every id list the oracle
and the grammar panel offered was cut off at 24. An author standing in a hole saw 24 of 86 entities,
24 of 220 flags and 24 of 112 items — not one flag in `tulsa`, which is the town both arms were
writing in, and not one `core` item, so neither `core.coin` nor `core.bread` could be found without
opening the corpus. The lists are written whole now, which is why a quest can be authored against
`npm run oracle` alone.

*Closes when:* this run is repeated against the world as it now stands. If the bot then lands a
quest, these numbers are the before. If it still does not, the premise is answered and the playbot
is a reporter — which is worth having: the two `first-steps` repairs that landed this session both
came out of playbot reports, and no agent reading the corpus had found either.

## Three of the ten quest notes still have no module, and what one costs is measured

Plague Matters, Reverse Infiltration and The Rat Conspiracy. They are last because each
waits on another: The Rat Conspiracy on Birds and the Bees, Reverse Infiltration on that
and The Swampy Menace, Plague Matters on Reverse Infiltration. So they are written one
wave at a time, each merged before the next starts.

**Birds and the Bees landed on 2026-08-30, so The Rat Conspiracy is next and unblocked.**
Kelsa's whole `# dialogue` is out of `tulsa` and the quest owns her; the fight at the hive
is a room the quest declares below `tulsa.hive-mouth`, reached by a road written from the
quest's end only and open only while the fight is on, so tulsa's third hive stays the
ordinary dead end tulsa wrote and nothing of the quest sits in the town file. That is the
shape a quest reaching into a shipped room has to take until the printer half below is
fixed — a room of its own underneath, rather than an entity in someone else's.

Five ran in parallel on 2026-08-30, one brief each, Sonnet 5, engine off limits:

| quest | wall | replies | out tok | cost | reaches for the engine |
|---|---|---|---|---|---|
| birds-and-the-bees | 16.3 min | 91 | 69,549 | $3.77 | 0 |
| attention-to-detail | 17.4 min | 126 | 82,829 | $4.64 | 0 |
| the-bars-crawl | 20.3 min | 120 | 92,014 | $4.31 | 0 |
| the-swampy-menace | 25.6 min | 154 | 120,603 | $6.97 | 0 |
| a-grand-blade | 22.7 min | 179 | 106,799 | $8.80 | 0 |
| | **25.6 min wall** | 670 | | **$28.49** | **0** |

**Not one of the five reached for the engine.** Every question all five had was answered
by `npm run oracle` or by the corpus, which is the first time that has been true — and it
is the measurement the harness exists to take.

The spread is the finding. a-grand-blade cost two and a half times birds-and-the-bees and
spent replies 59 through 124 hand-building throwaway `DEBUG` sections, all of it against
the stage-transition defect below.

*Closes when:* the three are written and merge with the suite green.

## A line that is nothing but a conditional fragment prints as a blank line

`{<condition>: <words>}` inside a `say:` is how one speech says different things on different
paths. Measured on 2026-08-30, writing Oolga's two closings: a line whose **whole** content is
one fragment renders as an **empty line** when the condition is false, rather than as nothing.
The speech comes out with a hole in it.

That run was the corpus's first use of fragments — there were none before it — so nothing had
met this. It was worked around by pairing the two acknowledgements on one line and the two
farewells on another, so that between them one always holds, and by hanging the one-sided
clause off a sentence said either way. That is a real technique and it is also the sort of
thing an author should be told rather than made to discover.

*Closes when:* a line left empty by its fragments is dropped rather than printed, or
`npm run oracle` says under the fragment entry that it will not be — derived from whatever the
printer actually does, so the page cannot drift from it.

## Nothing tells a player to wear the net, so the lent net can never part

Miki now offers another net to a player holding none, and a route walks it. But the thing that
takes the first one away cannot happen on the shipped path, measured on 2026-08-30: **a net
that is carried and not worn grants no `line-health` pool at all**, because `max-line-health`
comes from the tackle. Ten game-minutes and 248 catches leave no pool in the save.
`apology-route-full` never equips the net and nothing in the tutorial says to.

So the repair is right and its trigger is unreachable. The tutorial teaches netting without
teaching that tackle is worn, which is also why the false line survived long enough to be
found by reading rather than by playing.

*Closes when:* the tutorial says that a net is worn — a line of Miki's, most likely, since he
is the one handing it over — and a route equips it, so the path a player is actually taught is
the path the module proves.

## A negative weight in a `one of:` fires no branch at all

Found on 2026-08-30 while measuring how long a net takes to part: an item granting `-1000
fishing` produced 300 casts with **no catch, no experience and no drain** — neither branch of
the roll appeared to fire, rather than the roll settling on the other one.

The input was invented rather than found in the corpus, so nothing ships in this state and it
costs nobody anything today. It is here because a roll that silently does nothing is the
shape a later author would lose an afternoon to, and because the language refuses malformed
input everywhere else.

*Closes when:* a weight the roll cannot use is refused at load with the line named, or the
roll settles on a branch — either is fine, and the first is the language's usual answer.

## George's word in tulsa is an `always`, so no quest may stand beside it

Writing *Birds and the Bees* on 2026-08-30 hit this and could not take it. The brief wanted
George to hint at the farm's troubles before the quest is picked up. Its first stage stands
from the outset, so a `george says:` under it would take George's own tulsa node away from
every player in every world, permanently — and that is not a defect. `always` is what an
entity says when no thread is open, so a quest line replaces it, which is exactly what the
sibling lane established the same day while proving that two quests otherwise stand side by
side on one NPC perfectly well.

The answer is therefore known and is one line of shape rather than a ruling: **a word that
must survive a quest opening is written as a thread (`ask:`/`when:`), not as `always`.** Kelsa
was the only person given a line under a first stage, and she is the one whose tulsa dialogue
was deliberately removed; George's was not, and should not be.

The same reasoning is why the quest's closing `settled` stage gives a line only to Kelsa.

*Closes when:* George's tulsa word is a thread rather than his `always`, the pre-quest hint
stands beside it under `hired`, and a route walks both — his own answer and the quest's — from
one talk. Whether other tulsa entities want the same treatment is answered by looking, not by
listing: a shipped `always` on anyone a quest will ever speak through is the same trap.

## `rate: their <stat>` is live grammar that reads as nought

Found on 2026-08-30 while rebuilding fishing as one cast over four waters. The oracle
advertises a sided rate, and it does not work: `fightParams` (`src/runtime/runtime.ts:97`)
and `firstUnitSpan` (`src/runtime/runtime.ts:696`) both call `attemptDuration` with no
sides, so `other` falls back to the player and a `their` rate reads zero.

The symptom is not an error. A route written `until 30 times` against a `their` rate walked
**four hours of world instead of ninety seconds** — it looks like a balance problem, and
the lane that hit it spent time there before finding the cause. It was worked around with
plain numeric `rate:` lines, so nothing ships broken; the grammar is still offered.

*Closes when:* a sided rate reads the side it names, or the grammar stops offering one —
and whichever it is, `npm run oracle` says it without anyone having to keep the page in
step by hand.

## No route walks a deep-water cast, and the blowfish still uses the old shape

Fishing is now one `# action cast` and four waters that overlay it. Two of the four are
proved: the shrimp shoal, by `first-steps`' own routes. **The trout run and the salmon pool
are walked by nothing**, because `content/fishing.dsl` holds no `# test` and no `# save` —
fishing stands nowhere (`dependencies: core`), and a route needs somewhere to stand.

Separately, `the-bars-crawl.blowfish-hole`'s `cast for blowfish` is still written in the old
per-water shape rather than as an overlay of `cast`. It walks, so nothing is broken; it is the
last copy of the thing the one-home pass removed.

*Closes when:* a route standing in tulsa walks a rod-and-bait cast at the deep water, and
the blowfish hole is an overlay of `cast` like every other water. Both want whoever owns
`tulsa.dsl` next, since that is where a fishing route can stand.

## A condition wanted in several places is written out in each of them

The three guard threads in `the-swampy-menace.dsl` — the gate guard, the guardsman and Larry,
each pointing at the captain while the quest is on offer and untaken — carry the same
`when: kill-it-with-fire.oolgas-basement.cellar-cleared and ball-of-a-boy.down-the-grate.reported
and not oolgas-errands.errands` written out three times. One fact about when the pointer is live,
in three places, which is the shape this repository spends its commits undoing.

There is nothing to reach for. `npm run oracle -- dialogue` offers `when: <condition>` and
nothing that names a condition and points at it; a `# flag` holds a fact somebody sets rather
than a standing test, and a `# variable` holds a number. So the duplication is the language's
rather than the author's, and it will recur the moment a fourth speaker joins them.

*Closes when:* a condition can be declared once under a name and named wherever one is taken,
with `npm run oracle` saying so off the declaration; then those three lines are one, and the
comment above them that explains why they are three is deleted.

## Two homes for one check on an assembled action

`src/content/sections/action.ts:78` runs a check `actionBody.parseBlock` already runs, and
is now unreachable through the parser — noticed on 2026-08-30 while the two-sided refusal
was being removed. Its live callers are `load.ts`, for assembled entity actions and for
recipe actions that never pass the parser.

So the fact has two homes and one of them is dead for the path it was written for. It was
left in place because the lane that found it did not own the file.

*Closes when:* the check has one home that both paths reach, and the dead one is gone.
