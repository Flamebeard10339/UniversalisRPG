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

## Balance is declared, not measured

**An author does not tune numbers.** A body that fights names three things and the engine
cuts every stat under them:

- `tier:` — what it is worth fighting. How many seconds it stands against a player the ladder
  puts at its level, what share of survivable incoming it deals, and what an hour of it pays
  against the curve. The tiers the world offers are printed by `npm run oracle -- tier`.
- `profile:` — the shape it fights in. How that budget is spent across how hard it hits, how
  often, and how much it can stand. `npm run oracle -- profile` prints them, and each names
  one side of a contested pair while the tier solves the other.
- `level:` — the level a player is meant to meet it at, which is the character both are read
  against.

A body naming those needs **no `stats:` line at all**. Write a stat only where it is
load-bearing for the encounter — a resistance that punishes the wrong weapon, a bite that
must be fire so that a route about fire resistance means anything — and write it as a
modifier (`-20% fire-resistance`) so it survives a rebalance. Everything else is the
engine's, and a number typed by hand is a number that goes stale the next time a ladder moves.

**So do not spend a run on `simulate-activity` or on tuning passes.** That was the old
procedure and it is why the base run hit its turn cap with the work half done. The tags are
the balance. `npm run ladder-check` will tell you whether a body matches the tags it names,
and a body that does not is either mis-tagged or met at the wrong level — both of which are
one word to change rather than six numbers to solve.

**What is still the author's:** which tier a thing is, what shape it fights in, what level it
is met at, what it drops, and what a room holds. Those are judgements about the world. A room
that a tier says should pay a certain amount per hour reaches that only if its population and
respawn let a player kill fast enough, so how many stand there and how quickly they come back
is authoring rather than arithmetic.

**A passive is written as a share of a level, not as an amount.** The same rule on the other
side of the fight: `grants:` takes a block of multiples of what one level is worth on the
ladder the stat climbs, and the engine writes the number.

    # passive immovable
    juggernaut, life
    grants:
      +1x added core.max-health

`+1x added` is worth exactly what a level adds; `+2x increased` is worth twice what a level
increases, and lands as a percent because that is the half it names. A trade-off is two lines,
one of them negative, and a passive granting two stats is two lines — there is nothing else to
learn, because the unit is a share rather than a number. `npm run oracle -- ladder` prints
what the world's ladders say, and `rounds to:` on a `# stat` keeps the results readable.

**A grant against a stat that climbs no `# ladder` mints nothing at all**, and the oracle says
so. Where that happens the stat wants a ladder, or the passive keeps an ordinary modifier —
both are fine, and a passive may carry hand-cut modifiers and `grants:` at once.

**A repeatable mark has to run out**, or a speed stat scales without limit. Combat's does,
because its enemies die and come back on a timer. Give a non-combat mark the same floor with
`stands: <guise> for <duration>` — ninety seconds is the house number — and the room empties,
the offer leaves the sheet, and the player moves on or waits.

**Ability comes from jewels, not from gear.** A worn base with no jewel socketed into it is
worth almost nothing; what a jewel is worth is the stat it returns per plane point, and how
many points exist is the base's item level. Rarity is scarcity: **common** is sold in a shop
and point-inefficient, **uncommon** drops at one in sixteen to sixty-four and carries utility,
**rare** at one in a hundred and twenty-eight is point-efficient endgame, **unique** comes off
a boss and does something nothing else does.

**The one lane that still iterates is the speedrun**, because a floor is walked rather than
declared: what the fastest route to a level actually costs is only knowable by walking it.

Two habits that cost nothing. Ids carry what a thing *is* — `rare-general-thieving` — and the
flavour lives in `title:`. And prefer round numbers: multiples of two or five.

## What this skill does not cover

`authorbot` writes exactly one module. A repair pass across several files, a rename, a
move between modules, or anything mechanical is ordinary work — use `npm run
rename-module` and `npm run move-sections`, which check themselves.

If you do that work by hand, **carry the engine denial over by hand**: an arm that
could read `src/` reached into it 19 times and wrote nothing; the arm that could not
was never blocked and wrote the module. The denial is not a formality.
