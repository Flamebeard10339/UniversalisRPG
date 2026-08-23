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

**1. The engine work `open.md` was holding is done.** One orchestration session
landed eleven lanes, each in its own worktree: the play surfaces can no longer
drift in capability, `hint:` is gone, the AFK summary exists, the economy is
priced, the pack is bounded, the mirror is a door anyone may walk back through,
race is content, `examine:` is an action, and fainting no longer livelocks. What
`open.md` holds now is the owner's own queue, the balance nobody has played
against, and the small residue each of those lanes reported on its way out.

**2. What the lanes kept finding was second authorities, again.** The pattern from
the previous session repeated exactly and at a higher rate. A shop that had written
its own answer to how many copies may be handed over, while the engine's rule sat
in `engine-en.dsl` in its own words. A player's race hardcoded in the runtime with
its names in content. A skill's stat bonus on a private path beside the one every
other carrier folds through. Three `CommandOutput` formatters. `stockItem`'s signed
delta letting any caller write a holding without asking. **None was on anybody's
list**, and every one was found by doing something else. Running `one-home` before
the work rather than after is what this keeps arguing for.

**3. The measurements were worth more than the patches.** Three lanes were sent to
build something and came back having established that it should not be built —
`wait: until <condition>` has no behaviour behind it, a `testing.dsl` would need an
exclusion someone has to remember, and a target selector is a second home because
aggression already is one. A fourth stopped before writing code because the ruling
it was given rested on a premise that was not true. That is the loop working, and
it is cheaper than the alternative.

**4. The writing is the long pole and nothing is in front of it.** `npm run review`
is the sheet and `content/reviewed.tsv` makes it resumable. **This is Yonatan's and
everything else is scheduled around it.** Two lines came back to the sheet marked
CHANGED this session, which is the mechanism working, and five scenery entities
became reachable prose for the first time.

**5. Then the author's own playtest, then the quests.** The order is in `open.md`
under *the next stretch of work*: a debug key so test-only content stops being
shipped content, a GUI playtesting mode unified with the playbot rather than beside
it, the author's own playtest and the list it produces, and then the ten quest
notes authored in order with playbot testers in a loop.

**Map churn is still deliberately deferred.** `combat-expansion.proving-ground`
sits at `tulsa.market-square`'s own square and hangs off the beach for want of
anywhere better. Not worth a hand-fix while the map is moving — a playtest names it
better than a reading does.

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
