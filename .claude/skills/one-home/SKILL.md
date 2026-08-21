---
name: one-home
description: Use before implementing any change to behavior in this repo — a new feature, field, kind, panel, command, or a fix that adds a branch. Names where the fact being added lives and halts the work if it would live in two places. Also use when the user mentions duplication, inference, second authorities, or things kept manually in sync. Skip for content authoring under content/, renames, formatting, and test-only edits.
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

## Does not apply

Content authoring under `content/`, renames, comment and formatting edits,
test-only additions, and fixes confined to one file that add no branch.
Skip the home line entirely for those.
