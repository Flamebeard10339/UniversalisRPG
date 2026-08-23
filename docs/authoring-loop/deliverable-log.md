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

**1. The region wall is down.** Adjacency is symmetric; Tulsa hangs off where every
route out of Miki's house lands. See `settled.md`.

**2. Module size is settled** — a removability unit, not a size unit. See
`settled.md`.

**3. The split is finished, and `core` stands nowhere in earnest.** Tulsa keeps two
items, three droptables its own creatures leave, and four flags. Everything else
that was in it — two skills, a stat, fourteen items, two recipes — is core's,
moved by tools that refuse on registry drift rather than by hand. The last two
sections could not move until a station stopped being a name minted by whichever
entity happened to open one; `# station` is a kind now, so a recipe is generic
knowledge and the oven it is worked on is still Tulsa's.

**4. The writing is the long pole and nothing is in front of it.** `npm run review`
is the sheet and `content/reviewed.tsv` makes it resumable. **This is Yonatan's and
everything else is scheduled around it.** The agent pre-pass is done: every room
that named a thing and offered no way to touch it now either does something or has
stopped promising it would, and the corpus holds **no rough lines** where it held
five. What is left under that heading in `open.md` is two readings, not a queue.

**5. The hardening pass comes after that**, and the runs have already named what
it is for: `confusion` reports say which lines are actually confusing, so reviewing
blind and then hardening would do the same reading twice. The playbot's prompt now
says a quest here is not meant to be trivial, so a `confusion` report should mean
the writing is wrong rather than that the player was expected to think.

**Map churn is deliberately deferred to that pass.** `combat-expansion.proving-ground`
sits at x:3,y:0, which is `tulsa.market-square`'s own square, and it hangs off the
beach for want of anywhere better. Whether the beach still makes sense as the road
into town is the same question. Neither is worth a hand-fix while the map is
moving — a playtest names them better than a reading does.

**What the loop keeps turning up is second authorities.** Six landed in one
session, each found by doing something else: the station vocabulary swept off
every entity, twenty-seven registry maps classified to name one exception, the
shipped corpus spelled out in ten files and derived in fourteen more, an exemption
letting a `names:` value be a kind nothing declared, the condition roots restated
for the oracle, and a menu entry's kind read back off the shape of its own string.
None was on anybody's list. The rate at which they turn up is the argument for
running `one-home` before the work rather than after.

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
