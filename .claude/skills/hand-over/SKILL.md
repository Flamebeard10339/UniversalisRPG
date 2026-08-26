---
name: hand-over
description: Use when a session is being closed out, wrapped up, ended for the day, or handed to whoever picks the branch up next — and whenever the user asks to write up, tidy, or catch up the docs for a long-running piece of work. Also use before clearing or recycling a session that has been running a while, and when starting a feature that will outlive one sitting and needs somewhere to hand over through. Writes and maintains docs/<feature>/ — open-agent.md and open-human.md, and nothing else.
---

# Hand over

A feature that outlives one session hands over through **two** files in
`docs/<feature>/`, and nothing else:

| file | answers | when a line leaves |
|---|---|---|
| `open-agent.md` | what is still wrong that a lane can close on its own | **deleted the day it closes** |
| `open-human.md` | what is still wrong that waits on the author | **deleted the day it closes** |

`npm run handoff` reads the folder off the tree, so there is no index to keep in
step. **A third `.md` beside these two is reported as wrong**, whatever it is
called.

## Everything already true is somewhere else, and none of those places is a doc

This is the rule the format exists for. A `settled.md` was tried here and reached
1463 lines before it was deleted; every fact in it was already in the code, and its
real cost was that lanes read it as a wall of past rulings they were afraid to
overrule.

| what you have | where it goes |
|---|---|
| a decision about how the game behaves | a **test** |
| a rule about how the work is done | a line in `CLAUDE.md` |
| a workflow discovery worth carrying between branches | a **memory**, short and actionable |
| why it was decided, and what lost | the **commit message** |
| what is still wrong | one of the two files above |

**Never a code comment.** `CLAUDE.md`'s *Comments* section already refuses it, and
a settled decision written beside the code is the deleted file in a worse home.

The consequence, which a lane should not have to work out for itself: **a test that
blocks the task in hand is either the author's decision, in which case it stands, or
an agent's, in which case the task overrules it.** Change it and say so. Do not go
looking for a doc that licenses the change — there isn't one, by design.

## Done means deleted

Not struck through, not annotated, not moved to a "closed" heading. Git holds the
reasoning, and the commit that closed a line is where the reasoning belongs. A
folder where an open heading and a finished one look alike has stopped answering the
one question it exists for.

## A line that changes hands crosses; it is never marked in place

The two files are one queue split by who is blocked, so a line moves between them in
either direction and leaves nothing behind.

An answered ruling carries a line from `open-human.md` to `open-agent.md`. A lane
that gets into an `open-agent.md` item and finds it turns on a judgement only the
author can make sends it the other way: the item **moves**, rewritten to carry what
the lane measured, with its italic clause naming the decision it now waits on in the
same register as its own *Closes when:*. A `BLOCKED` marker left behind in the file
it came from is the struck-through heading in a new coat, and the evidence is the
whole point of the handback — an item that comes back saying only *blocked* has
thrown away the one thing that session produced.

That handback is a move between these files and deliberately **not** `@@@`. A `@@@`
is a mark on a line of content and `npm run notes` reads it out of the corpus; a
backlog item is not a line of content, and most of what stands in `open-agent.md`
has no corpus line that could carry one.

## Start by asking what has landed

    npm run handoff

It reports a third file, a missing half of the queue, what is struck through, **an
item that names nothing that would close it**, and — the part no reader can see —
**how many commits have landed since the docs were last written**. Then:

    git log --oneline <last doc commit>..HEAD

That log is the input. Work from it, not from memory: a session remembers what it
found interesting, not what it changed.

## Then, per file

For every line in both, ask *did this close?* If yes, **delete it** — and then, only
if a later agent could get the thing it settled wrong, take it to the destination
the table above names. Most closed lines need nothing: the test that closed them is
the record.

For every commit in the log that found something new, add a line to whichever file
owns it. Then ask of each file the question the other answers: has a ruling landed
that moves a line out of `open-human.md`, and did a lane hand one back the other
way?

A line in either says **what is wrong, how it is known, and what would close it.** A
line with no evidence is a hunch and does not belong yet. Group by what a reader can
pick up, never by which run or which day found it. Do not write a running narrative
of what the branch has been through — that is the shape the deleted files grew into,
and `git log` already holds it.

Every line in `open-human.md` also carries **one italic clause naming what would
move it to `open-agent.md`** — the specific decision, in the same register as its
*Closes when:* — or saying plainly that nothing would, and why. *"Needs more
detail"* is not one of these; name the missing ruling or admit the line is the
author's forever. A line whose clause would have to read *nothing moves it, and no
work hangs off it* is not an open line: it is a ruling or an observation, and it is
deleted.

**When `open-human.md` is long, it is usually because nobody put it in front of
him.** Twenty-five of its lines were answered in one sitting once the questions were
actually asked. Length here is a prompt to go and ask, not a fact about the work.

## Before you finish

    npm run handoff

Then confirm `git status` is clean and the gates are green. Commit the docs with the
work, not after it.

**Say in your closing summary that you wrote the handoff, and name the folder** —
one line, e.g. *"Handoff written: `docs/authoring-loop/`."* Checking whether these
files are current is the one thing the author does by hand, and that line is what
they look for. Its absence is the signal to go and check, so never write it for a
session that did not update them.

## Starting a folder that does not exist yet

Write both. An empty one says so in a line; it does not get a placeholder, and it is
not left absent. Nothing else goes in the folder — not a plan, not a phase log, not
a record of what the branch is for. The branch name and the open lines carry that,
and anything more becomes the file this format deleted.

## What this is not

Not a changelog, not a diary, not a record of what each session did, and not a list
of what has already been decided. Files of that were tried twice here and both times
the thing that broke was the same: a reader could no longer tell what was still
true, and an agent reading a wall of past rulings invents work rather than
overruling one. If a line is only interesting as history, leave it in the commit
message and delete it here.
