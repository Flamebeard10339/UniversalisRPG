# What watching the first authoring run showed

Observations taken live while the first authoring agent worked, 2026-08-22, plus
what each one turns out to be underneath. Ordered by what they cost, not by when
they were noticed.

**Struck through means closed.** What is left standing is the queue for the pass
after this one; the ordering is the original ordering, not the remaining one.

## ~~1. An author is gated on a suite that has no business gating them~~ — closed

`npm test` runs 3000-odd tests in twenty seconds, and an author changing one line
of content ran it over and over. Worse, two of those tests assert shipped tutorial
content rather than mechanics, in `src/runtime/integration.test.ts`:

- line 59, that the front door spans exactly four seconds
- line 68, that the dresser hands out one lockpick and not one per search

The second is about **the dresser route 2 is being authored into**. An author
touching the lockpicks collides with a TypeScript test by construction. Both are
claims about content and belong in `# test` sections. The rest of that file is
mechanics or derived sweeps and should stay.

**Unit tests are for mechanics. Content claims live in `# test`.**

## ~~2. There is no way to run one `# test` from a shell~~ — closed

`npm run probe -- content --test <id>` runs one in about a second, and an id that
names no test but stands as a prefix over some — a module id — runs the module's
own. A directory source stands for the `.dsl` files in it, so the corpus is
nameable on a shell that expands no globs.

`/test <id>` runs one, and only from inside the interactive REPL. So iterating on a
single route means the whole suite, and the agent did the rational thing: it piped
command files into `npm run play` and hand-rolled what a `# test` section already
is.

Its scratch `playcmds.txt` **was the deliverable**, written in a throwaway form
because the real form had no fast loop. A shell-runnable named test — one second,
no REPL — collapses the two artifacts into one and removes the reason to invent
the other. It also removes most of the appeal of a background watcher that pings on
breakage: a watcher hides latency, and there is no latency to hide once the check
is a second long.

## ~~3. `expect:` is all-or-nothing, and convergence is not~~ — closed by `expect only:`

Three routes are meant to end in the same place holding the same quest, and are
meant to differ in experience, damage taken and what the world remembers. A full
state comparison cannot say that. `expect:` needs to be able to name the part of the
state that must match — position and quest standing — and stay quiet about the rest.

Until it can, convergence has to be written as a pile of `assert:` lines, which is
the enumerated form of a claim that should be derived from one save.

## ~~4. `@@@` was read as "leave it empty", and that was the prompt's fault~~ — closed

The oracle's own preamble now says it, so it is read in minute one rather than
carried in a brief: *write what you can say now, then `@@@` alone to mark it
rough, or `@@@ <what you wanted>` where the engine cannot do what was asked.*

The brief said mark a stub and move on, which the agent read as writing
`examine: @@@`. A playtester cannot test that, and the run's own product —
`expected` and `confusion` — goes quiet on a room described by nothing.

`@@@` means **unreviewed, not absent**. The line should say what is supposed to
happen, in plain words, and carry the mark. The agent later began doing this on its
own and then flip-flopped, which is what an ambiguous instruction looks like from
outside.

## 5. Smaller things, each real

- ~~**No shorthand for waiting out an action.**~~ `wait: done` walks the runway
  `nextBoundary` already computes. An action that repeats without bound has no end
  to name and refuses saying so, rather than running to a cap nobody declared.
- ~~**Saves carry items at count zero.**~~ A key absent and a key at its sparsest
  value are the same holding, and each field already declared its own sparsest.
- ~~**`drain: 5 health` cost a syntax fight.**~~ The oracle prints
  `drain: <amount> <resource>[ from <me or them>]` with a written-out example, as
  it does for every result line.
- ~~**Do not rewrite a content module unread.**~~ Now a repository rule in
  `CLAUDE.md`; that a tool refuses an unread write stays the tool's own fact.

## 6. The measurement, which is the point of the run

The agent spent something like half an hour on trial and error and then wrote the
module nearly in one pass. **The fluency it earned by minute thirty-three is what
the oracle owes it in minute one.** Every question it had to answer by experiment is
a line the oracle should have said, and its own list of those is the specification
for the next pass over the oracle.

Nothing here is a criticism of what it built. Watching where it was slow is the
whole reason the first run was worth doing with someone watching.

## ~~7. What a `# test` can assert about a number~~ — closed, and half of what it could not

`assert:` resolves only four things — `time`, `player.name`/`race`, `visits`, and
flags (`resolveReference`, `src/runtime/conditions.ts`). It cannot see a resource,
a stat, an xp total or an inventory count. That reads as a wall in front of the
rule that content claims belong in `# test`, and it is half a wall.

**Exact numbers already move.** A `# save` body carries `xp`, `resources`,
`inventory` and the rest, and `expect only:` compares just the keys the save
declares. So a claim about a number is written as a save holding only that number:

    # save just-the-thieving-xp
    {"version":11,"xp":{"tutorial-island.thieving":4}}

    # test picking-the-lock-is-worth-four-thieving
    run: a-lockpick-opens-the-front-door
    expect only: just-the-thieving-xp

Measured 2026-08-22: this passes, and corrupting the number fails with
`xp.tutorial-island.thieving: 4 vs 999`. The tests left in TypeScript on the
grounds that a numeric claim cannot move are therefore movable, and the sweep is
not finished.

**Ranges do not move, and that is what balancing wants.** `expect only:` is
equality, and `assert:` cannot compare a number it cannot read. So *this gear
against this enemy earns between 100 and 200 melee an hour* — the shape the fourth
item of the content dream asks for — has no form in the language yet. Whichever way
it is closed, teaching `resolveReference` to see pools, stats and xp is the smaller
half of it and would let `assert:` carry a bound.

**This is one gap wearing two hats.** The thing stopping the last content claims
from leaving TypeScript is the thing stopping a balance test from being written at
all.

### What closed it

An engine root now carries the kind of the id beneath it — `xp` a skill,
`resource` a resource, `inventory` an item — so the reference walk resolves it in
the writing module's namespace and refuses a name nothing declares, and the
resolver is a `Record` over the grammar's own roots, so a root added there does
not compile until it reads something. `assert: xp.thieving = 4` and
`assert: resource.health < 10` are lines an author writes, and a bound is any
comparison the grammar already had. The lockpick claim is one `assert:` in
`content/tutorial-island.dsl` rather than a save built to hold one number.

**`stat` is the root still missing, and it is the one that needs a registry.**
A stat is derived from buffs, equipment and passives, so `statValue` takes the
registry, and `evaluateCondition` does not carry one — fifteen call sites away
from having it. That is the remaining half, and it is a threading job rather than
a design question: the `Record` over `ENGINE_ROOTS` is where the answer goes when
it is threaded.

**A range is still equality plus a second line.** `xp.thieving >= 100 and
xp.thieving <= 200` says it, which is a bound written twice rather than a bound.
Whether that wants its own form is a question for whoever first writes a hundred
of them.
