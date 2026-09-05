---
name: one-home
description: Use before implementing any change to behavior in this repo — a new feature, field, kind, panel, command, or a fix that adds a branch, and before authoring a mechanic under content/ (an action, an entity that fights or is robbed, an item a quest hands over), and before adding a test of any kind, `.ts` or corpus `# test`. Names where the fact being added lives and halts the work if it would live in two places. Also use when the user mentions duplication, inference, second authorities, or things kept manually in sync. Skip only when the edit adds no fact.
---

# One home

Every change adds a fact. Before editing, say where that fact lives.

## The home line

Write this once, in prose, before the first edit:

> **Home:** *<the fact>* lives in `<file>`. After: `<file>`.

**Same file both sides — proceed.** No further ceremony. Do not restate the rule,
do not open a section for it, do not list what you considered. One line, then the work.

**Two files — stop. Report, do not edit.**

That is the entire procedure. It costs one line, because most changes have an
obvious single home. A change with an obvious home that gets more than one line
of this is the bureaucracy the skill exists to prevent.

## The seven shapes

Two homes rarely announce themselves. These are the forms they have actually
taken here, each drawn from a commit that had to undo one:

1. **A guess where a declaration exists.** Code re-derives by experiment what
   another module already states. *"the panel reads it instead of probing for it"*
   — the costliest shape; `completion.ts` guessing at the section files cost four
   bugs in one session.
2. **A list where the set is derivable.** A hand-written enumeration over
   something already enumerable. *"Derive c1's root set instead of listing it"*
3. **A copy where a pointer would do.** A fact restated rather than referenced.
   *"the load path stops keeping a second copy of its own reasoning"*
4. **A key restated rather than read.** A fact filed under words a second author
   chose. *"Key prior art by path, not by the words two authors chose"*
5. **N cases where the set is uniform.** Per-case handling of members that differ
   in no relevant way. *"Render a task through one printer instead of six"*
6. **A guess made more accurate.** A fix that improves an inference instead of
   deleting it. *"Replace the destroy sweep rather than repair it"*
7. **A proof that lists its subjects.** A test that names what it covers rather
   than deriving it. *"The cycle gate is proved by a cycle, not by the tree being clean"*

Two questions catch most of them: *does something already know this?* and *if a
kind or field were added next month, would someone have to remember this file?*

## The report

When the home line fails, write exactly this and stop. Five lines, no preamble:

```
Second home: <file> would also have to know <fact>.
Shape: <which of the seven, one sentence on why>.
Derived: <what changes instead, and roughly how big>.
As asked: <the debt, and what breaks when it drifts>.
Recommend: <one>.
```

Then wait. Do not start either path.

## Proceeding

The user's call, not yours. Any of these means implement now, without
re-litigating and without repeating the report:

- **"as asked"** / **"take the debt"** — build it the way it was asked. Say in one
  line where the debt sits, and leave it.
- **"derived"** — build the shape the report named.
- **"already ruled"** — this was decided in an earlier session; proceed.

If the user reaffirms the original request in their own words, that is their
decision. Treat it as "as asked" and build it.

## Content is not exempt

The corpus is code. A mechanic written out once per subject, a body naming the
things it applies to, a module declaring a private copy of something the world
already has — those are shapes 5, 2 and 3, and all three shipped in `content/`
while this section read *"does not apply"*.

They are cheap to spot and the shapes above are stated in engine vocabulary, so
here they are in the corpus's own:

- **One mechanic is one `# action`, and every subject `uses:` it**, declaring
  only what is its own. `# action melee-combat` in `content/core.dsl` is six
  lines and every foe in the game hangs off it. Fishing wrote four near-identical
  casts and thieving wrote three near-identical pockets before anyone noticed.
- **A body may not enumerate its subjects.** `on line-parted:` took one of each
  of six pieces of tackle, by name. A seventh net breaks nothing and works
  never.
- **A quest names the world's thing rather than inventing its own.** `first-steps`
  declared a second fishing net and a second fish; neither worked anywhere else,
  and the owner found it by trying to fish with it.

None of the three is caught by the suite: each loads clean, round-trips clean,
and plays exactly as written. They are found by a human reading, which is the
most expensive way this repo finds anything.

## Tests are not exempt

A test is a fact too: *this behaviour is proved here*. Two tests proving one
behaviour is shape 3, and a test naming its subjects rather than deriving them is
shape 7 — and both shipped while this skill listed test-only edits as out of
scope. Nine of tulsa's `# test` sections were written past the rule; breaking buff
stacking turned out to be caught eight ways over by `buffs.test.ts`, and breaking
the own-sheet-beats-the-global-table rule by `encounter.test.ts` and about
twenty-five others.

The home line takes the same one line, in the proof's vocabulary:

> **Home:** the proof that *<behaviour>* holds lives in `<test>`.

It is **measured, not guessed.** Run `npm run mutate` first: break the thing the
new test would guard and read which tests already catch it. Nothing catches it —
the home is free, write the test. Something catches it — the home is taken, and
the suite is already paying to run that proof.

**A taken home ends differently here: do not report, and do not wait.** A
redundant test is not a design question for the author. Don't write it; or, if
the duplicate is already on disk, delete it and say in one line what went. Then
carry on with the work that was asked for.

Two things the measurement will not tell you. It reads which tests *assert*
against a break, not which *depend on a route as a fixture* — grep `src/` and
`scripts/` for a `# test` id before deleting it, because three of those nine were
replayed by runtime tests as scenario builders and cutting them took good tests
down with them. And it has no word on *what* a test may assert — a route proves a
sequence yields a result and does not assert its cost or its reward — which is a
rule of its own, and `CLAUDE.md` owns it.

## Does not apply

**Skip only when the edit adds no fact.** If you cannot name the fact, there is
nothing to home: whitespace, reflow, a typo. That is the whole exemption, and it
is derived rather than listed on purpose — a list here would be shape 2, and the
copy of it that has to live in the description would be shape 3.

Three edits look exempt and are not. A **rename** is where a second home
announces itself, which is why the move tools reach into fixtures. A **prose
rewrite that changes no mechanic** can still restate one the world already
declares. And a **fix confined to one file**
asserts the home line's answer as its precondition: that it is confined is the
thing the line was going to tell you.

None of this costs anything when the home is obvious. Same file both sides,
proceed — that is one line, and it is the common case.
