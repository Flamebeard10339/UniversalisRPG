---
name: hand-over
description: Use when a session is being closed out, wrapped up, ended for the day, or handed to whoever picks the branch up next — and whenever the user asks to write up, tidy, or catch up the docs for a long-running piece of work. Also use before clearing or recycling a session that has been running a while, and when starting a feature that will outlive one sitting and needs somewhere to hand over through. Writes and maintains docs/<feature>/ — deliverable-log.md, open-agent.md, open-human.md, settled.md.
---

# Hand over

A feature that outlives one session hands over through four files in
`docs/<feature>/`, and nothing else:

| file | answers | when a line leaves |
|---|---|---|
| `deliverable-log.md` | what this is for, and what phase it is in | rewritten as the phase changes |
| `open-agent.md` | what is still wrong that a lane can close on its own | **deleted the day it closes** |
| `open-human.md` | what is still wrong that waits on the author | **deleted the day it closes** |
| `settled.md` | what someone starting cold has to know | deleted when it stops being true |

`deliverable-log.md` names the other three, and that naming is what
`npm run handoff` reads a folder off — in both directions, so a name in the log
with no file behind it is reported as the log gone stale.

**Done means deleted.** Not struck through, not annotated, not moved to a
"closed" heading. Git holds the reasoning, and the commit that closed a line is
where the reasoning belongs. A folder where an open heading and a finished one
look alike has stopped answering the one question it exists for.

## A line that changes hands crosses; it is never marked in place

The two open files are one queue split by who is blocked, so a line moves
between them in either direction and leaves nothing behind.

An answered ruling carries a line from `open-human.md` to `open-agent.md`. A lane
that gets into an `open-agent.md` item and finds it turns on a judgement only the
author can make sends it the other way: the item **moves**, rewritten to carry
what the lane measured, with its italic clause naming the decision it now waits
on in the same register as its own *Closes when:*. A `BLOCKED` marker left behind
in the file it came from is the struck-through heading in a new coat, and the
evidence is the whole point of the handback — an item that comes back saying only
*blocked* has thrown away the one thing that session produced.

That handback is a move between these files and deliberately **not** `@@@`. A
`@@@` is a mark on a line of content and `npm run notes` reads it out of the
corpus; a backlog item is not a line of content, and most of what stands in
`open-agent.md` has no corpus line that could carry one.

## Start by asking what has landed

    npm run handoff

It reports a companion the log never names, a name the log holds with no file
behind it, what is struck through, and — the part no reader can see — **how many
commits have landed since the docs were last written**. Then:

    git log --oneline <last doc commit>..HEAD

That log is the input. Work from it, not from memory: a session remembers what it
found interesting, not what it changed.

## Then, per file

**`open-agent.md` and `open-human.md`.** For every line in both, ask *did this
close?* If yes, delete the line — then decide whether a later agent could get it
wrong, and if so write one sentence in `settled.md`. Most closed lines need no
sentence. For every commit in the log that found something new, add a line to
whichever of the two owns it. Then ask of each file the question the other
answers: has a ruling landed that moves a line out of `open-human.md`, and did a
lane hand one back the other way?

A line in either says **what is wrong, how it is known, and what would close it.**
A line with no evidence is a hunch and does not belong yet. Group by what a reader
can pick up, never by which run or which day found it.

Every line in `open-human.md` also carries **one italic clause naming what would
move it to `open-agent.md`** — the specific decision, in the same register as its
*Closes when:* — or saying plainly that nothing would, and why. *"Needs more
detail"* is not one of these; name the missing ruling or admit the line is the
author's forever.

**`settled.md`.** One or two sentences a line, present tense, true now. Not
history, not rationale, not what was rejected. The test for a line belonging
here: *would someone reasonable do the wrong thing without it?* Prefer the
lessons that cost time — a rule someone already got backwards once is worth more
than a rule nobody would break.

**`deliverable-log.md`.** Only the phase section usually moves. If what the work
is *for* has changed, that is worth a conversation, not an edit.

## Before you finish

    npm run handoff

Then confirm `git status` is clean and the gates are green. Commit the docs with
the work, not after it.

**Say in your closing summary that you wrote the handoff, and name the folder** —
one line, e.g. *"Handoff written: `docs/authoring-loop/`."* Checking whether these
files are current is the one thing the author does by hand, and that line is what
they look for. Its absence is the signal to go and check, so never write it for a
session that did not update them.

## Starting a folder that does not exist yet

Write all four. `deliverable-log.md` must name the other three, or a reader who
starts at the log never learns they exist and `npm run handoff` cannot find them.
An empty open file says so in a line; it does not get a placeholder.

## What this is not

Not a changelog, not a diary, not a record of what each session did. Four files
of that is what this format replaced, and the thing that had broken was exactly
that a reader could no longer tell what was still true. If a line is only
interesting as history, leave it in the commit message and delete it here.
