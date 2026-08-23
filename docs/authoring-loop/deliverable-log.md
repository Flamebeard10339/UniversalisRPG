# Deliverable log — the authoring loop and the playbot

Branch `authoring-loop-and-playbot`. Items 3 and 5 of the content dream. This file
is the agreement about what is being built and what "done" means. It is tracked, so
a session that picks this branch up cold starts here.

**Three files, and they do not overlap:**

- **this one** — what the branch is for, and what phase it is in
- **`open.md`** — everything still wrong. A line is deleted the day it closes
- **`settled.md`** — what is already true, for an agent starting cold

Nothing is struck through anywhere. If it is done it is gone, and git holds why.

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

Two authoring runs and four playbot runs. Tulsa exists — 28 locations, 37 entities,
13 dialogues, 962 lines, authored from an outline in roughly one pass once the
oracle was answering the right question. The playbot has reached it, fought in it,
and stopped itself twice on real blockers.

**The loop's own product is the finding list, and it has been earning its keep.**
Run 4 found a whole town's worth of unhearable dialogue that the corpus, the test
suite and the review sheet all passed clean. That is the case the loop exists for:
nothing static could have caught it.

## The phase this is in

**1. The region wall is down.** Adjacency is symmetric; Tulsa hangs off where every
route out of Miki's house lands. See `settled.md`.

**2. Module size is settled** — a removability unit, not a size unit. See
`settled.md`.

**3. The writing — a human pass over 492 lines, and it is the long pole.**
`npm run review` is the sheet and `content/reviewed.tsv` makes it resumable. **This
is Yonatan's and everything else is scheduled around it.** Agents work below `src/`
while it runs; content-editing passes wait. It has not started: the owner is
holding until the grammar settles and the bug rate drops, which is the right call
while findings are still arriving in batches.

**4. The hardening pass comes after a playbot run, not before**, because the run's
`confusion` reports say which lines are actually confusing. Reviewing blind and
then hardening would do the same reading twice.

**Map churn is deliberately deferred to that pass.** The beach stops making sense
once Miki's house sits in Tulsa properly; `tutorial-island.market-district` is a
stub duplicating `tulsa.market-square`; `combat-expansion.proving-ground` and
`tulsa.market-row` now collide at x:3,y:0. None is worth a hand-fix while the map
is moving — a playtest names them better than a reading does.

## What Yonatan has to deliver

1. **Corrections to a town outline**, which is extracted from the cast and places
   the quest notes already name. Correcting is cheaper than authoring, and the
   corrections are the specimen the outline format is read off. **Done** — the
   corrections are what `content/tulsa.dsl` was authored from.
2. **The review pass over the writing.** Open.
3. Nothing else. The reload question is closed and the quest notes stay as they are.

## The ordering, which the corpus decided

Every quest note in `.planning/planning_quests/` starts *speak to Kelsa* or *around
the back of the castle*, and a quest modifies entities and locations rather than
creating them. So the town came first, and it was also the right first subject for
item 3's measurement. The ten quest notes were deliberately **not** finished before
it — how much outline detail the loop actually needs is what the runs were meant to
measure, and levelling them all up first would have deleted the experiment.
