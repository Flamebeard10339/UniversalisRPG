# Deliverable log — the authoring loop and the playbot

Branch `authoring-loop-and-playbot`. Items 3 and 5 of the content dream. This
file is the agreement about what is being built and what "done" means; it is
written before the implementation and edited as the implementation teaches us
something. It is tracked, so a session that picks this branch up cold starts here.

The two items share one thing, and it is worth saying at the top: **an author
writing content and a bot playing it both need to say "this bit is not right
yet" and have it survive into a list someone reads later.** `@@@` and
`npm run notes` are already that channel. Neither item gets its own.

---

## Item 3 — an outline goes in, a module comes out

### What it is

    you write     a rough outline, prose, one page
    agent reads   npm run oracle   +   the outline
    agent writes  content/<region>.dsl
    agent runs    npm run oracle -- --at content/<region>.dsl
                  fix what it names, repeat until clean
    agent runs    npm test
    you run       npm run notes    → the second pass, on the writing

Most of this exists. The build is small; the risk is in three places.

### Risk 1 — the whole-file verdict stops at the first refusal

`takenLines` in `scripts/oracle.ts` says, in its own words, that it stops at the
first thing it cannot take and that fixing it may uncover another. The per-line
pass already reports every line at once, but the whole-file pass — the one that
catches rules about two sections at once — does not.

"The oracle gives it all the errors in one go" is the stated point of item 3. So:
**the whole-file verdict reports every independent refusal it can reach, and
names only the ones that genuinely cascade as cascading.** This is the single
most concrete deliverable of item 3 and the first thing to build.

### Risk 2 — the oracle is complete on grammar and silent on semantics

`scripts/oracle.test.ts` derives its subjects from `sectionKinds()` and asserts
every offer the editing page makes appears in the tree, so an agent is never told
the wrong *syntax*. It is told nothing about meaning: that a travel action with
no cost is a pathfinding edge, that item actions are not location-scoped.

Those facts sat in a hand-kept list in `CLAUDE.md`. That list is now
`facts-to-home.md` in this folder, as a work-list to be consumed and deleted —
each line verified, then homed in an engine refusal, an oracle note, or the
outline template, or struck as stale.

**This work is not done first.** The measurement below tells us which of the
twelve actually bite. Some will never come up.

### Risk 3 — the process must forgive stopping and starting

This will not one-shot, and pretending otherwise builds the wrong thing. A draft
must be *useful while half-written*: `oracle --at` on a partial file has to be a
progress report, not one long refusal. `@@@` is how an agent says "I stopped
here" or "I could not do this"; `npm run notes` is how the next session — human
or agent — finds where to resume.

**A run that stops early with honest notes is a success, not a failure.** The
loop is designed around that, not around a single clean pass.

### The measurement, which comes first

Hand a cold agent `npm run oracle` output and one real outline, and nothing else.
Count the oracle iterations to clean. Read what it got wrong. The failures name
which of the twelve facts matter and whether the outline format carries enough.

The first run is a measurement. It has no pass mark.

---

## Item 5 — the playbot

### The four constraints, which fix the design

1. local, inside Claude Code, **not through the API**
2. cheap, fast, convenient for the agent
3. asynchronous — the DSL may be edited mid-session, by a human or a GM agent
4. the agent can register feedback, questions and confusion at every point, in a
   form that is actually usable afterwards

Constraint 1 is the one that decides the shape. This is **not** a script that
calls a model in a loop. It is a long-lived session the agent drives one cheap
turn at a time. `runLine` in `src/runtime/command.ts` is already that seam;
`play-cli` is a printer sitting on it.

Constraint 3 is the hard engineering: a live session whose world is reloaded
underneath it. What happens to state that points at a location the edit changed
is an open question and must be answered before the harness is built, not after.

Constraint 4 is where this meets item 3. A bot that says "I did not understand
what this NPC wanted" is writing the same kind of note an author leaves with
`@@@`. It goes to the same place and comes out of `npm run notes`.

### Not scored on reachability

Independent paths mean no run reaches everything, and the union across runs is
confounded by which paths were taken. A turn limit plus the agent's own judgment
is the frame. Reachability-of-the-union is still worth computing as a floor —
"nothing authored is orphaned" is a real standing check — but it is a by-product,
not the score.

### One harness, three agents

A bug-and-exploit finder, a balance measurer and an explorer want different
prompts and produce different reports. They want the **same** harness: a session,
a turn, a view, a note channel. Building three harnesses is the failure mode;
building one and letting the prompt differ is the shape. Whether one of them
needs planning that this design cannot give it is a question for after the first
one runs.

---

## What Yonatan has to deliver

1. **One real outline**, for a region you actually want, written the way you would
   naturally write it. Do not design a format — write one and the format is read
   off it. Nothing in item 3 can be measured without this.
2. **An answer on the reload question** (item 5, constraint 3), or agreement that
   the first cut simply restarts the session on an edit and we find out whether
   that is good enough.

Everything else on this branch is mine.
