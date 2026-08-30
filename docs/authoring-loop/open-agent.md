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

## Oolga's cellar rats are counted rather than protected

Ruling on 2026-08-30: there are no hard failure states in this game, only alternate paths.
*Kill it with Fire* completes when the player does what Oolga asked; **how** they did it
picks the dialogue and the reward. Her one condition — clear the cellar and leave every rat
breathing — is not a fail gate, it is a branch.

The shape he named: the cellar's rats carry an id of their own, with the same title as
`tulsa.feral-rat`, and the quest counts kills of that id. Zero kills is the clean path and
she says so; anything above zero is the other path, and she says that instead and pays
differently.

Measured on 2026-08-29 and still true: the route that walks the quest end to end kills four
of them — the melee action takes whatever in the room is aggressive, and the cellar's four
feral rats are aggressive — and it ends holding eight rat pelts, after which she
congratulates the player for not killing one.

*Closes when:* the cellar holds its own rat id, both branches of her closing are written,
and a route walks each — one that kills none and one that kills some — with the reward
differing between them. If nothing in the language counts kills of an id, that is the
finding and it is measured before anything is invented.

## Two quests may want one NPC at once, and one of them takes her whole conversation

Ruling on 2026-08-30, in two parts.

The narrow part: Kelsa's own `blunt` node in `tulsa` — the one that says *if you are here
about the bees, say so* — is a preamble to the quest and is **meant** to be replaced by it.
It comes out of `tulsa` and the quest owns it. The corpus route
`tulsa.kelsa-takes-the-answer-she-asks-for` walked that node, so it is rewritten with the
reasoning in the commit: a route may be rewritten because a quest superseded the path it
walked, and this is the first time that has been ruled.

The wide part, and the one that is actually the work: **two quests must be able to use one
NPC in parallel.** Today a quest's `<entity> says:` takes the whole of that entity's
dialogue for as long as its stage stands, so the second quest to reach her is silent. That
is the only requirement he could name, and the narrow part is a special case of it.

Measured on 2026-08-30, four ways, none of which is a way out: a distinct `ask:` does not
help, since the takeover is not about the ask text; gating the quest block on
`when: kelsa.the-third-hive.visits >= 1` never reads true, qualified or bare; stepping
tulsa's route past the quest opening first walks in English and fails under
`translationSurvival`.

*Closes when:* a quest's line sits **beside** an entity's own threads and beside another
quest's rather than replacing them — proved by two quests opening on one entity at once
with both reachable, and by Kelsa's preamble living in `birds-and-the-bees` with tulsa's
route rewritten to match.

## A section written over another module's belongs to the module that wrote it

Ruling on 2026-08-30: the id rule is a **defect**, not the design. All of a quest's flags
are named inside the quest. Loading `tulsa` alone must read as if no quest touches it —
strangely empty, with no hint of one. An entity or item leaves a quest module only when a
*second* module needs it, and then it goes to the shared module both use. Tulsa is not a
dummy: it is the skilling location, and skilling tasks genuinely belong there. If it reads
bare, that is a real measurement — there are not enough skilling tasks in the city — and
not a reason to push quest furniture into it.

What is wrong today, found on 2026-08-30 when the first pass's five modules were merged: a
`# entity tulsa.oolga`, a `# location tulsa.deep-water` or a `# dialogue tulsa.guardsman`
written from a quest may name **nothing** of the quest's own. The corpus loads either way;
only printing it and reading it back says so, which is why no authoring run could see it and
why all five hit it. Under that rule the four merged quests pushed five pieces into `tulsa`
— the bladesmith's notebook, the reporter, the mire's rat-toad, the blowfish and its hole —
plus three flags, and it cost three guard lines that could not follow it, marked `@@@` in
`the-swampy-menace.dsl` and listed by `npm run notes`.

*Closes when:* an overriding section carries the id namespace of the module that wrote it
through print-and-reload, the five pieces and three flags come back out of `tulsa` into the
quests that declared them, and the three `@@@` guards in `the-swampy-menace.dsl` are written
as the guards they wanted to be. The proof is print-back: the module that declared a body is
the module that gets it back.

## A fishing water is never used up, and fishing must not drift from combat

Ruling on 2026-08-30: **water cannot be depleted.** Engine changes are bypassed for now by
giving a water an instant respawn, so nothing is ever felled. And the load-bearing half:
fishing must not drift from combat, because that is a one-home violation — *"fishing should
be just like `# action melee-combat`, just for fishing."*

What stands in the way, measured: `src/grammar/action.ts:315` refuses a side-naming action
that declares no `depletes:`, so `accuracy: my fishing vs their depth` is rejected at load.
Adding `depletes:` loads, and a measured minute of netting then recorded the shoal felled by
the first fish and not coming back — which the instant respawn answers — plus
`combat.attack: 2` banked per landed cast, which it does not. That second one is what
`content/fishing.dsl`'s own header exists to refuse, and it could not be scoped away:
`damage-dealt` takes no `resource:` and the arity check refuses one.

Four duplicated casts are what not having this costs: one action per water.

*Closes when:* the four casts are one action over four waters, no water is ever felled, and
no cast trains an arm. If the last of those cannot be had without touching the grammar, the
lane says so with the measurement rather than shipping a cast that pays combat xp — the
ruling bypasses engine work, it does not license the leak.

## A stalled run holds where it stopped, because the rate went to zero and not the bar

Ruling on 2026-08-30: being caught pickpocketing is a **timed debuff that takes the thieving
rate to 0**. The resource stalls wherever it had got to — halfway is halfway — and there is
no flag for it. The published fraction reading `0` while a run is stalled is the defect, and
the `stalled` flag a lane published beside it so a renderer could draw the bar stopped is the
thing that goes.

*Closes when:* the stall is a rate taken to zero by an ordinary timed debuff, the published
fraction holds the value it stalled on, the `stalled` flag is gone from the view, and a test
drives a caught hand and reads a held fraction rather than a zero.

## Miki offers another net to a player who has none

Ruling on 2026-08-30: **no exemptions** — the lent net is a regular net and parts like one.
Miki simply offers another when the player is holding none.

What is wrong today: `on line-parted:` takes the tackle when `line-health` empties, and
Miki's `again:` line — the one a player gets on every talk after the offer — points at the
net already in their pack. A player whose net has parted is told to use a thing they no
longer hold. Remote rather than theoretical: the shrimp shoal drains 1 line-health per miss
against the 6 the small net grants, so it takes a run of misses; the window is still an exit,
so it is a false line rather than a softlock.

*Closes when:* Miki's `again:` branches on whether the player holds a net and hands over
another when they do not, and a route parts the net and takes the replacement.

## Load order decides, and the tie-break that says otherwise goes

Ruling on 2026-08-30: **load order determines everything.** Any other heuristic breaks under
real conditions, and mods already control load order through their dependencies.

`addressable`'s `declares` tie-break says in its own comment that when two modules write a
section at one address the **declaring** module's body is kept. Measured while the naming
rule was being folded into one place: **533 of 533 shipped sections take the true branch**,
so it never decides anything and the behaviour already reduces to *last source wins*. It is a
comment claiming a rule the code does not enforce.

*Closes when:* the tie-break and its comment are deleted, last-source-wins is what the code
says and what a renamed test names, and the shadowing rule that lets a staged edit override a
shipped section still works — which it should, since a staged edit is loaded last, and the
lane proves that rather than assuming it.

## A quest may have starting requirements, and one of them the grammar cannot say

Ruling on 2026-08-30, and it closes one question by dismissing it: **Miki's quest does not
stop any other quest from starting.** So `leave-tutorial-island.adrift` picking up while
`finding-your-feet` is mid-lesson is not a bug, no gate is added, and the words already
repaired — the dismissal and the "last word" journal line gone, with
`first-steps.the-town-is-found-before-the-lesson-is-over` proving both threads stand together
— are the whole of the answer. The route `the-apology-survives-going-out-of-the-window`
stays as it is.

What he opened in the same breath is the real line: **quests should have starting
requirements** — other quests, level requirements, and so on. Other quests they already have;
`adrift` is gated on `tulsa.market-square.touched`. Level requirements they do not, and the
corpus has asked twice: Miki's own offer wanted *"reach level 2 in any skill"* and got a
plain item check instead, and the `@@@` on
`dialogue.first-steps.finding-your-feet.apologised.miki.0.said.line.0` records the refusal —
the condition grammar takes a flag optionally compared to a number and `has`/`not`/`and`/`or`
over items and flags, and has no skill-level or xp predicate at all. No `# event` fires on
levelling either.

*Closes when:* a quest's start condition can name a skill level, the `@@@` on Miki's offer
comes out because the thing it asked for is now sayable, and `npm run oracle` prints the
predicate under the condition grammar without anyone listing it there.

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

## `<keyword>` is the one hole on the page whose vocabulary the page does not name

The page writes `<keyword>   e.g. sharp` and stops, and two keywords in that hole are load-bearing:
an item tagged `food` that also carries a `stat-bonus` grants it when an action takes the item
(`grantFoodBuff` in `src/runtime/runtime.ts`), and a buff source tagged `stacks` adds a stack rather
than replacing the one already there (`grantBuff` in `src/runtime/buffs.ts`). Neither word is
declared anywhere the grammar page can read, so neither is on it, and an author cannot tell a
keyword the engine acts on from one that is decoration.

`instant` and `continuous` are the same kind of word done right: declared in `src/grammar/action.ts`
as `TAGGED_ACTION_KINDS`, turned into `Written` lines there, and printed under the action kind.

Known from a run on 2026-08-29 that was allowed to read the engine: it grepped the corpus for
`food`, found items tagged with it, could not tell whether the word meant anything, and read
`src/runtime/runtime.ts` to find out. That was three of its nineteen reaches into `src/`.

*Closes when:* `food` and `stacks` are declared where the page reads them, the way the two action
kinds are, so `npm run oracle` names them under `<keyword>` — and the proof is that the page names
every keyword the engine branches on, derived rather than listed.

## The overlay is the one thing a quest needs first and the one thing nothing shows

Writing over a section another module declared is how a quest reaches into a town: a second body at
`# location tulsa.apiary-field` with `+entities:` under it. The page gives the two lines that do it
one entry each under *writing over a body already there* — and **the shipped corpus writes neither,
not once**, so there is no worked example of the whole shape anywhere in the world an author reads.

Both arms of the 2026-08-29 run hit this before anything else and neither could get at it from the
page. The arm that could read the engine went to `sections/location.ts` and then `merge.test.ts`;
the arm that could not wrote a block into its own draft labelled *SCRATCH: probing cross-file
patching, to be removed* and found the shape by experiment. It cost the second arm about
twenty-five turns, most of them cycling `--at`.

Half of that was the id rule, which is fixed. What is left is that the shape has no example.

*Closes when:* the example on the `+<line>` entry shows the heading it is written under and not
only the line — or a module that ought to be reaching into another one is written that way, so the
corpus carries the shape. The first is the smaller change and does not wait on content.

## Three of the ten quest notes still have no module, and what one costs is measured

Plague Matters, Reverse Infiltration and The Rat Conspiracy. They are last because each
waits on another: The Rat Conspiracy on Birds and the Bees, Reverse Infiltration on that
and The Swampy Menace, Plague Matters on Reverse Infiltration. So they are written one
wave at a time, each merged before the next starts.

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

## A stage does not leave on a flag an action set, and five runs lost time to it

All five runs hit it independently and none could see why. `done when: <flag>` does not
fire when the flag is set by an action, and `assert: <quest>.<stage>` immediately after
reads stale — while a plain `assert: <flag>` on the same line reads true. The transition
is correctly in effect a few directives later, once the route has travelled or talked.

Four triggers were named: a `set:` inside a `one of:` branch, a `craft:`, an entity's
`on death:`, and a location's `.touched`. The swampy run reduced it furthest and against a
bare universe — `core` + `combat` + `tulsa`, none of its own module loaded — to *two
differently-named actions on the same entity back to back silently drop the second
action's `give:`*, cleared reliably by leaving the room and returning. The a-grand-blade
run reduced it to a two-line repro and reported the narrower shape: a `done when:` never
picks up a flag set by an action added to a **foreign** entity, while the identical shape
against a native entity's own action advances correctly.

Every one of the five wrote a workaround into its route rather than a fix, so the corpus
now carries four different ways of stepping around the same thing.

*Closes when:* the repro is run against the engine and the transition either fires when
the flag is set or the oracle says plainly when it does not — and the four workarounds
come back out of the routes.

## An authoring run says nothing until it is over, and nothing shorter than this launches it

The harness prints each tool call as it happens, but a run redirected to a log is silent
for twenty-five minutes and there is no way to watch one. Five in parallel meant polling
the log files by hand to tell a run that was working from a run that was stuck — which is
how the a-grand-blade debug loop went unnoticed for sixty replies.

The command is also this, every time:

    npm run authorbot -- --brief <path>/<quest>.md --target <quest>.dsl --turns 150

`--brief` and `--target` are the same word twice, `--turns 150` was needed by three of the
five runs and the default is 80. There is a case for the flexibility — a brief and the
module it writes are not always the same name — so this is not simply a flag to delete.

*Closes when:* a run can be watched while it runs, and the common shape of the invocation
is one word rather than three flags — without taking away the ability to point a brief at
a module of a different name.

## Two traps that cost a run each, written down so they do not cost a third

- **`npx` on Windows truncates a multi-line argument at its first newline and silently drops every argument after it.** A briefed run was launched with `--brief "$(cat brief.txt)" --save … --local … --turns 100`; `parseArgs` received five arguments, not nine. The bot ran with a one-paragraph brief, no `--save`, and staged into the shipped corpus. Nothing said so. **Use `node --import tsx scripts/playbot.ts`.**
- **Nothing detects a truncated brief.** The run above was read as evidence for two hours before the cause was found. A brief that arrives as one line is indistinguishable from a brief that was one line.

*Closes when:* a run refuses, or at least says out loud, that its brief arrived as a single line
when the operator passed a file — or the brief is passed as a file rather than as an argument, which
removes the shape of the trap rather than reporting it.
