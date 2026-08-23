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

Two authoring runs and seven playbot runs. Tulsa exists and now holds the whole
region — Miki's house, the beach and the town are one module, and `core` is
furniture that stands nowhere.

**The loop's own product is the finding list, and it has been earning its keep.**
Run 4 found a whole town's worth of unhearable dialogue that the corpus, the test
suite and the review sheet all passed clean. Runs 5–7, three runs of 45 turns,
found that health was unrecoverable, that a fight never announced a kill so three
rats read as one that healed, and that an earlier quest's opening was unreachable
because a later module parsed last. None of those was visible to anything static.

**The runs are cheap and the fixing is not.** That asymmetry is the thing to plan
around: three runs cost minutes and produced a fortnight of work.

## The phase this is in

**1. The GUI playtesting mode exists, and one run has been played through it.**
`.planning/yonatan-playtests/8-23-2026.md` is the first, 32 turns, and it earned its
keep the way every run before it did: it found writing that does not match what a
character says, a refusal that is fancy about failing, an entity that should not be
there, a modal that hides the words it is answering, and a bug in the recorder itself
— two travels logged as `3` and `5`, because a tap on the map sends a bare position
and the recorder was reading the control rather than the line.

**2. What that run asked for is now item 1 of the queue, and it is a better design
than what was built.** A recorded run should *be* a `# test` section — navigation and
all — with one body line for what the player thought. The mechanism is most of the way
there and nobody should rediscover it: `CommandContext.recorder` already holds every
line in canonical directive form plus the save it started from, and `/create-test`
already writes a `# test` out of one. A run is therefore recorded twice today, and
those two records are one fact.

**3. Nine lanes landed in one session, each in its own worktree.** Five closed what
they were sent to close. **Four came back having established that the thing should not
be built, or that the premise was false** — `attempts:` is a per-cycle budget and no
engine change was correct; the emptied pool's "two independent routes" were each
independently load-bearing; resolving `open modal:` through `registry.modals` would
have broken the shipped game, so the `# modal` kind was deleted instead; and the
strengthened parity proof still cannot separate two paths holding identical words. That
is four measurements bought for the price of four patches, and it is the loop working.

**4. What the lanes kept finding was, again, second authorities and listed proofs.**
`ids: 'global'` silently opting a kind out of reference checking. A review sheet that
derives from declared prose fields rather than from reachability, which is the
generator behind three separate `examine:` fixes. A hand-written list of view fields
where `leaves()` would do. A test whose subjects were items rather than the locale keys
its claim was about. **None was on anybody's list**, and every one was found by doing
something else.

**5. `npm test` is trustworthy again.** Every red it produced on this machine was
`Test timed out` and none was an assertion. The clock now lives once, in
`vite.config.ts`, as a hang detector rather than a budget, and sweeps over derived sets
are written one test per subject. 3681 tests, about thirty-five seconds on a quiet
machine.

**6. The writing is still the long pole and nothing is in front of it.** `npm run
review` is the sheet. **This is Yonatan's and everything else is scheduled around it.**
Fifty-six lines of item and cluster-jewel prose reach a player for the first time.

**Map churn is still deliberately deferred.** `combat-expansion.proving-ground` sits at
`tulsa.market-square`'s own square and hangs off the beach for want of anywhere better.
A playtest names it better than a reading does.

## What Yonatan has to deliver

1. **The review pass over the writing.** `npm run review`, resumable through
   `content/reviewed.tsv`.
2. **A playtest of his own, and the list of problems it produces.** Nothing
   substitutes for it. It is what the GUI playtesting mode in `open.md` exists to
   record.
3. Nothing else. The reload question is closed and the quest notes stay as they are
   until the town has been played.

## The ordering, which the corpus decided

Every quest note in `.planning/planning_quests/` starts *speak to Kelsa* or *around
the back of the castle*, and a quest modifies entities and locations rather than
creating them. So the town came first, and it was also the right first subject for
item 3's measurement. The ten quest notes were deliberately **not** finished before
it — how much outline detail the loop actually needs is what the runs were meant to
measure, and levelling them all up first would have deleted the experiment.
