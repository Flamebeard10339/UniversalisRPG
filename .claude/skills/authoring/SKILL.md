---
name: authoring
description: Use whenever the work is writing or editing the game's world — a quest, a town, a skill, an item, an entity, a shop, a dialogue, a route, or any other section under content/ — whether it starts from a brief file or from the user describing what they want in the chat. Also use when asked to draft, flesh out, expand, rewrite or balance-pass a module. Dispatches the authoring harness rather than writing the DSL by hand, because authoring and engine work are separate jobs with separate tools. Skip only when the edit is to the engine itself, under src/ or scripts/.
---

# Authoring is not engine work

Two jobs share this repository and they do not overlap. What each one writes, what each one
reads, and what gates each one is the table under *Two jobs, and a line between them* in
`CLAUDE.md`. It is there and not here, so that there is one of it.

**An author never reads the engine.** Everything the language allows is printed by the
oracle; a question the oracle does not answer is a defect in the oracle, not a reason
to open `src/`. **An author never runs the suite either** — a contributor editing the
world inside the game cannot run vitest at all, and nothing in the suite reads a line
of `content/`, so it has no opinion about what they wrote.

That line is not advice. `npm run authorbot` enforces it, and this skill is how it is
reached from here.

## Hand the work to the harness

```bash
npm run authorbot -- "<brief file>"
```

Run it **in the background** — a module is 10–25 minutes. It copies `content/` to a directory of
its own, so it is not a second writer in this checkout and nothing it does can be lost or can
collide with yours.

**`npm run authorbot -- --help` prints every flag**, and is the only place they are written down.
Three things about running one are judgement rather than usage, and they are the whole of what
this section has to add:

- **Do not pass `--open`** unless the user asks for it. Refusing the engine is what turns every
  unanswered question into a number at the end, and that number is the point of dispatching this
  way rather than writing the module by hand.
- **A run that reaches for the engine stands still and waits for you.** It is not fire and
  forget. Leave `npm run authorbot -- --watch` going — it returns the moment a run has asked
  something *or* ended — and answer with `--answer "<one sentence>"`. A run nobody answers is
  delayed rather than stopped, but it is delayed by ten minutes a question.
- **`--watch` also says when a run is going in circles**, which is worth more than knowing how
  far along it is.

## There is no brief file yet

Most asks arrive as a sentence in the chat, not a file. Write the brief first — to the
scratchpad, or to `.planning/` if the user keeps them — then hand *that* to authorbot.
A brief says what the module is for, who is in it, what the player does and in what
order, and what it may lean on. It does not say what to type: that is the oracle's.

**A brief may carry what it paid for, and may not assert what the run can check in one command.**
Measurements you actually ran, and diagnoses that cost you a trace, are worth their space — the
run would otherwise buy them again. An id, a route's name, a dependency direction or what a
location holds is not: name the question rather than the answer, because a brief is written by
somebody who was not looking at the world at the time. Three briefs in one session asserted one
of each and all three were wrong.

Name the file after the module it becomes, because the name is the module id, the
working directory and the line `--watch` prints.

## When it comes back

It writes nothing here and prints where its work is. Then:

1. Copy the module into `content/`.
2. `npm run oracle -- --at content` — the corpus may have moved under the run while it
   was going, so its own green is not this checkout's.
3. Read what it reached for, and whether anybody answered it. An unanswered reach is a question
   the oracle did not answer and should have; that list is the point of running it this way.

## Balance is part of authoring, not a pass afterwards

A brief that says what a module is for and stops there gets a module whose numbers are
invented. Put the balance in the brief, and the run can finish it and check its own work.

**What a repeatable mark pays in an hour is arithmetic, and it is exact:**

    population in the room  x  experience per success  x  3600 / seconds it stays used up

That is the ceiling a player with enough ability reaches. Below that they are limited by
missing, and below *that* by dying. Measured against real runs it holds to about four percent.

So a mark is two numbers and both are derived:

- **Difficulty is the declared ladder read at the mark's own gate level.** `abilityAtLevel` in
  `scripts/lib/pace.ts` is what a character of that level can stand at, and `ladderFor` beside it
  says the ladder is per skill rather than one line for the world. A mark cut to it opens at
  about a coin toss for somebody standing on its rung. What the odds then are is `hitChance` in
  `src/runtime/stats.ts`, over a spread a world may write as `# variable contest-spread`.
- **Payout is set from the ceiling**, chosen so the marks rank in gate order for a character at
  the top of the band. Do *not* set it so a mark pays its share of the curve at its own gate:
  that reimburses an expensive miss with experience which turns free the moment the player stops
  missing, and a fast action then out-earns every slow one above it.

**Do not restate any of those numbers in a brief.** The slope, the spread and the curve are
declared, they move, and a run cannot read `src/` to notice that a constant you typed out has
gone stale. Name the function and let the run ask the tool. What the curve asks at a level is
`rateAtLevel`, in the same file. A cadence is `60/rate` seconds where a `rate:` is written and
flat seconds where a `time:` is; a miss costs three seconds a hop walking back, the daze duration
on a pocket, nothing at all on a lock, and about twenty seconds if it puts the player in a cell.

**A repeatable mark has to run out, or a speed stat scales without limit.** Combat's does not,
because its enemies die and come back on a timer. Give a mark the same floor with
`stands: <guise> for <duration>` — the thing stays itself with that one action gone, ninety
seconds is the house number — and the room empties, the offer leaves the sheet, and the player
moves on or waits.

**Ability comes from jewels, not from gear.** A worn base with no jewel socketed into it is
worth almost nothing; what a jewel is worth is the stat it returns per plane point, and how many
points exist is the base's item level. So the interesting question about a new piece is never its
flat bonus. Tiers are scarcity: **common** is sold in a shop and point-inefficient, **uncommon**
drops at one in sixteen to sixty-four and carries utility and variety, **rare** at one in a
hundred and twenty-eight is point-efficient endgame, **unique** comes off a boss at one in two
hundred and fifty-six or worse and does something nothing else does. Shops carry a character to
about level seven and are roughly a fifth of the ladder by thirty; they keep selling every slot,
just a worse version than the world drops.

`npm run ladder-check` prints, per skill and rung, what a shop stocks and what exists anywhere
against what the ladder asks. **Its residual is a brief for content, never a pass or a fail** —
a gap at level eight is answered by an obscure seller in an alley who fits the world, not by
adding a line to the general store because that makes a number go green.

**Then have the run check itself.** `npm run simulate-activity` reads what an offer actually pays
an hour, and stands a player on a rung of the declared ladder to read it there rather than at
whatever base a save happens to hold. `npm run probe` walks a staged `# test` and records the
clock it ended on. Both take the draft's own world rather than the shipped one, and both print
their flags with `--help`. Stage the routes so each opens with `run:` of the one before, stand
what they read beside what the curve asks for the level reached: a route that walks and lands
near the curve is the module balanced, and one that cannot walk at all is the finding.

Two habits that cost nothing. Ids carry what a thing *is* — `rare-general-thieving` — and the
flavour lives in `title:`; naming a set precisely is how a jewel was found to be a second copy of
another with a bigger number on it. And prefer round numbers: multiples of two or five.

## What this skill does not cover

`authorbot` writes exactly one module. A repair pass across several files, a rename, a
move between modules, or anything mechanical is ordinary work — use `npm run
rename-module` and `npm run move-sections`, which check themselves.

If you do that work by hand, **carry the engine denial over by hand**: an arm that
could read `src/` reached into it 19 times and wrote nothing; the arm that could not
was never blocked and wrote the module. The denial is not a formality.
