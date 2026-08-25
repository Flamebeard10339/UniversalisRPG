# Deliverable log — the authoring loop and the playbot

Branch `authoring-loop-and-playbot`. Items 3 and 5 of the content dream. This file
is the agreement about what is being built and what "done" means. It is tracked, so
a session that picks this branch up cold starts here.

**Four files, and they do not overlap. This one names the other three, and that
naming is what `npm run handoff` reads the folder off — in both directions, so a
name here with no file behind it is reported:**

- **this one** — what the branch is for, and what phase it is in
- **`open-agent.md`** — everything still wrong whose shape is settled and whose
  proof is headless: `npm test`, `npm run probe`, `npm run oracle`, `tsc`
- **`open-human.md`** — everything still wrong that waits on Yonatan: his play,
  his reading of the writing, and the rulings nobody else can take. Every line
  there carries one italic clause naming what would move it to `open-agent.md`.
  **A line whose clause would have to read *nothing moves it, and no work hangs
  off it* is not an open line**: it is a ruling, which belongs in `settled.md`, or
  an observation, which belongs in git. It is deleted
- **`settled.md`** — what is already true, for an agent starting cold

A line is deleted the day it closes, and one that changes hands crosses between
the two open files rather than being marked in place. That rule is the repo's,
not this folder's — `CLAUDE.md` and the `hand-over` skill own it, and the skill
says how a handback is written. Nothing is struck through anywhere. If it is done
it is gone, and git holds why.

---

## What the two items are

**Item 3 — an outline goes in, a module comes out.**

    you write     a rough outline, prose, one page
    agent reads   npm run oracle   +   the outline
    agent writes  content/<region>.dsl
    agent runs    npm run oracle -- --at content/<region>.dsl, fixes, repeats
    agent runs    npm test
    you run       npm run review   → the second pass, on the writing

**Item 5 — the playbot.** `docs/specs/a-turn-costs-what-the-last-turn-did.md` is a
ten-clause spec with a `## Decisions` section and measured numbers behind every
ruling. **Nothing on this branch re-decides it.** Its cost rulings and the
one-harness rule are in `settled.md`; its proof step is now `tsc --noEmit`,
`npm test` and `npm run layer-check`, the workflow tooling it named having been
deleted.

Both items share one thing worth saying at the top: **an author writing content and
a bot playing it both need to say "this bit is not right yet" and have it survive
into a list someone reads later.** `@@@` and `npm run notes` are already that
channel. Neither item gets its own.

It is important that authoring agents don't spend 30+ minutes experimenting with 
the DSL before authoring for real. They should be able to one shot content with 
just the assistance of the oracle and other existing modules. 

## What has actually happened

Two authoring runs, seven playbot runs, and two playtests the owner played himself.
Tulsa exists and now holds the whole region — Miki's house, the beach and the town
are one module, and `core` is furniture that stands nowhere.

**The loop's own product is the finding list, and it has been earning its keep.**
Run 4 found a whole town's worth of unhearable dialogue that the corpus, the test
suite and the review sheet all passed clean. Runs 5–7, three runs of 45 turns,
found that health was unrecoverable, that a fight never announced a kill so three
rats read as one that healed, and that an earlier quest's opening was unreachable
because a later module parsed last. None of those was visible to anything static.

**The runs are cheap and the fixing is not.** That asymmetry is the thing to plan
around: three runs cost minutes and produced a fortnight of work.

## The phase this is in

**1. A recorded run is a `# test`, and both harnesses write it.** What the first
run anybody played asked for is built. A run comes back as the `# save` it walks
forward from and the `# test` that walks it, carrying `note:` / `expected:` /
`confusion:` / `blocked:` on the turn they were about, `page:` for where in the app
the player went, and `refused` for what bounced. A run was recorded twice before —
once as directives that replay, once as prose somebody reads — and that prose
rendering is gone. Converting the playbot cost almost nothing, because `runLine`
had been pushing canonical directives into a recorder the playbot never read.

**2. Most recorded runs are failed runs, and that did not need a second kind.**
The owner's question, and the answer that fell out of it: running a `# test`
reports where the replay **diverged from the record**, and a corpus proof is the
case where that report must be empty. So `refused` is a claim like any other, a
recorded failure replays green, and a replay where a refusal has become a success
fails loudly — which is the authoring loop, written down.

**3. Stopping a run files it into the game, and it can be watched back.** The two
sections go through the one load-and-adopt path `/dsl` uses, so the `# test` is in
the live registry at once and a reload finds it. A run whose starting save this
build cannot read is refused rather than filed, and goes on being recorded. The
replay scrubs in both directions and runs itself at a cadence, 0.3s by default —
the whole thing is a function of one cursor, so the state, the page and what has
been said all follow it and nothing has to be undone.

**4. The lane that was sent to file runs came back having moved the work.** Its
first plan put filing in `src/ui`; two derived guards refused it — no UI module may
name an export of `localChanges`, and every `save.store` reach in the driver must
be exercised for refusal — and both were right. It also could not collapse
`/create-test` onto the shared writer, and said so with the measurement rather than
forcing it: `runLog.ts` imports a type from `command.ts`, so the reverse import
closes a cycle and `layer-check` exits 1. That is the loop working the way it
worked when four of nine lanes came back saying *do not build this*.

**5. What the lanes keep finding is still second authorities and listed proofs.**
This session's was small and typical: `render.test.tsx` rendered every label
against a **hand-written union of every parameter any label takes**, so a label
with a new one threw rather than being covered. It reads them off the labels now.
Nobody was looking for it.

**6. `npm test` is trustworthy, and now measured under load.** 3936 tests in 163 files,
about twenty-three seconds idle. Seven concurrent runs on a 24-core box — 79 processes —
all passed, slowest 109.7s against the 120s hang detector. That was the last debt from
the clock work.

**7. The writing is still the long pole and nothing is in front of it.** `npm run
review` is the sheet. **This is Yonatan's and everything else is scheduled around
it.**

**8. The wants from the owner's own play are built.** They became rulings in
`open-agent.md` on 2026-08-25 and were closed the same day, fifteen lanes in worktrees
with the orchestrator merging and keeping these files. `Ledger` takes a layout and is
still the only component that draws a sheet; a `# slot` says where on a body it sits and
the doll's shape is derived from the placed slots; the pack has an order its owner chose
and a save carries it; examine is reached by pressing a cell; an unexamined thing is
masked in the *view*, so all three surfaces mask alike and the playbot reads a room free
on arrival; a `# group` says what something is and colour carries voice and fill on two
channels that never share; there is one notification surface and a notification is words
and a merge key with no kind; gear drops carrying rolled points and the whetstone is
gone; a plane can shrink and refuses to shrink out from under a jewel; a road costs a
flat three seconds and a way out left the action list — which he has since played and
reversed, and the flat three seconds is the half that survived.

**9. The second playtest emptied more of `open-human.md` than it filled**, which is the
other half of the loop working. Sixty turns through Miki's route on 2026-08-25, recorded
through the playtest tool and marked reviewed by its filename. Twenty-one findings, and
**every one of them turned out to be takeable** — the run states its own ruling nearly
every time it complains, which is what a note written at the turn it happened buys you.
Reading it out took the owner's rulings on eight more lines that had been parked, so
`open-human.md` lost its whole review-pass heading, both never-moving balance
observations and four settled questions, and `open-agent.md` went from an empty queue to
a full one.

The rulings worth knowing without opening the file: **dialogue is drafted directly and
the review pass waits for the world**; a way out is back on the action list, reversing
`settled.md`; talking is offered as a choice of path with quests first; an attack
declares a damage range and rolls in it; autosave writes every action; a run is marked
reviewed by its filename and nothing prunes on a timer.

**10. The removal-cost question has an answer, it is the fixtures, and it is now ruled.**
The owner asked whether cutting a feature could cost less. Measured on the whetstone: 57
files, of which nine genuinely encoded a whetstone fact, five moved because one engine
word is spelled in four places, and **seventeen were test modules each declaring their
own copy of the item being deleted**. A shared, derived fixture world is the one lever
that matters and it is queued — *"build it, keep it as small as possible"* — with one
condition that can send it back: `settled.md` refuses a testing module the load path has
to be told to leave out, so the fixture world's unreachability has to be **derived** by a
guard before any of it is written. His own follow-up rides on the same guard — whether
the shipped corpus still needs its `DEBUG` sections — and it is not answerable until the
guard exists.

Map churn is still deliberately deferred. `combat-expansion.proving-ground` sits at
`tulsa.market-square`'s own square and hangs off the beach for want of anywhere
better. A playtest names it better than a reading does.

## What Yonatan has to deliver

1. **The rulings still standing in `open-human.md`.** Most are one line, and every one
   of them has an italic clause naming exactly the decision that is missing. This is
   now the shortest path to work: eight of them were answered in an hour on 2026-08-25
   and the queue filled up behind them.
2. **More play, and the list of problems it produces.** Nothing substitutes for it, and
   the second run's yield says so — twenty-one findings, all of them actionable, from
   sixty turns. Runs go to `.planning/yonatan-playtests/` and get a `-reviewed` suffix
   once their findings are out.
3. **The review pass over the writing, when the world has settled.** Deferred by his own
   ruling of 2026-08-25. Until then a lane fixes dialogue directly rather than parking
   it, and `content/reviewed.tsv` brings a rewritten line back marked CHANGED, which is
   what makes drafting safe.

## The ordering, which the corpus decided

Every quest note in `.planning/planning_quests/` starts *speak to Kelsa* or *around
the back of the castle*, and a quest modifies entities and locations rather than
creating them. So the town came first, and it was also the right first subject for
item 3's measurement. The ten quest notes were deliberately **not** finished before
it — how much outline detail the loop actually needs is what the runs were meant to
measure, and levelling them all up first would have deleted the experiment.
