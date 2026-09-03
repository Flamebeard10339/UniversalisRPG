---
name: authoring
description: Use whenever the work is writing or editing the game's world — a quest, a town, a skill, an item, an entity, a shop, a dialogue, a route, or any other section under content/ — whether it starts from a brief file or from the user describing what they want in the chat. Also use when asked to draft, flesh out, expand, rewrite or balance-pass a module. Dispatches the authoring harness rather than writing the DSL by hand, because authoring and engine work are separate jobs with separate tools. Skip only when the edit is to the engine itself, under src/ or scripts/.
---

# Authoring is not engine work

Two jobs share this repository and they do not overlap.

| | authoring | engine |
|---|---|---|
| writes | `content/*.dsl` | `src/`, `scripts/` |
| reads | the corpus, and `npm run oracle` | anything |
| its gate | `npm run oracle -- --at content` | `npm test`, `tsc`, `npm run layer-check` |

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

Run it **in the background** — a module is 10–25 minutes — and get on with something
else. It copies `content/` to a directory of its own, so it is not a second writer in
this checkout and nothing it does can be lost or can collide with yours.

- `--target <module>` — the one file the run may write. Default: the brief's own name,
  so `planning/A Grand Blade.md` writes `a-grand-blade.dsl`.
- `--turns`, `--model` — how long and as whom.
- `--open` — let the run read the engine. **Do not pass this** unless the user asks:
  refusing it is what turns every unanswered question into a number at the end.

`npm run authorbot -- --watch` says where every run on this machine stands, and whether
one is going in circles.

## There is no brief file yet

Most asks arrive as a sentence in the chat, not a file. Write the brief first — to the
scratchpad, or to `.planning/` if the user keeps them — then hand *that* to authorbot.
A brief says what the module is for, who is in it, what the player does and in what
order, and what it may lean on. It does not say what to type: that is the oracle's.

Name the file after the module it becomes, because the name is the module id, the
working directory and the line `--watch` prints.

## When it comes back

It writes nothing here and prints where its work is. Then:

1. Copy the module into `content/`.
2. `npm run oracle -- --at content` — the corpus may have moved under the run while it
   was going, so its own green is not this checkout's.
3. Read what it reached for. Every reach is a question the oracle did not answer, and
   that list is the point of running it this way rather than by hand.

## Balance is part of authoring, not a pass afterwards

A brief that says what a module is for and stops there gets a module whose numbers are
invented. Put the balance in the brief, and the run can finish it and check its own work.

**What a repeatable mark pays in an hour is arithmetic, and it is exact:**

    population in the room  x  experience per success  x  3600 / seconds it stays used up

That is the ceiling a player with enough ability reaches. Below that they are limited by
missing, and below *that* by dying. Measured against real runs it holds to about four percent.

So a mark is two numbers and both are derived:

- **Difficulty is the declared ladder read at the mark's own gate level** — `abilityAtLevel` in
  `scripts/lib/pace.ts`, which stands at nothing on level one and rises seven a level. A mark
  then opens at about a coin toss for a character standing on its rung. Hit chance is
  `1/(1 + 10^((difficulty - ability)/100))`, and that hundred is `# variable contest-spread`.
- **Payout is set from the ceiling**, chosen so the marks rank in gate order for a character at
  the top of the band. Do *not* set it so a mark pays its share of the curve at its own gate:
  that reimburses an expensive miss with experience which turns free the moment the player stops
  missing, and a fast action then out-earns every slow one above it.

What the curve asks at a level is `rateAtLevel`, in the same file. A cadence is `60/rate`
seconds where a `rate:` is written and flat seconds where a `time:` is; a miss costs three
seconds a hop walking back, the daze duration on a pocket, nothing at all on a lock, and about
twenty seconds if it puts the player in a cell.

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

**Then have the run check itself.** Stage `# test`s that each open with `run:` of the one before,
walk them with `npm run probe -- <world> --test <id>`, and read the clock off
`npm run probe -- <world> --record <id>`, where `time` is milliseconds. Stand that beside what
the curve asks for the level reached. A route that walks and lands near the curve is the module
balanced; one that cannot walk at all is the finding.

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
