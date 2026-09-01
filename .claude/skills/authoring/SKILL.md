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

## What this skill does not cover

`authorbot` writes exactly one module. A repair pass across several files, a rename, a
move between modules, or anything mechanical is ordinary work — use `npm run
rename-module` and `npm run move-sections`, which check themselves.

If you do that work by hand, **carry the engine denial over by hand**: an arm that
could read `src/` reached into it 19 times and wrote nothing; the arm that could not
was never blocked and wrote the module. The denial is not a formality.
