---
name: hand-over
description: Use when a session is being closed out, wrapped up, ended for the day, or handed to whoever picks the branch up next — and whenever the user asks to write up, tidy, or catch up the docs for a long-running piece of work. Also use before clearing or recycling a session that has been running a while, and when starting a feature that will outlive one sitting and needs somewhere to hand over through. Writes and maintains docs/<feature>/ — deliverable-log.md, open.md, settled.md.
---

# Hand over

A feature that outlives one session hands over through three files in
`docs/<feature>/`, and nothing else:

| file | answers | when a line leaves |
|---|---|---|
| `deliverable-log.md` | what this is for, and what phase it is in | rewritten as the phase changes |
| `open.md` | what is still wrong | **deleted the day it closes** |
| `settled.md` | what someone starting cold has to know | deleted when it stops being true |

**Done means deleted.** Not struck through, not annotated, not moved to a
"closed" heading. Git holds the reasoning, and the commit that closed a line is
where the reasoning belongs. A folder where an open heading and a finished one
look alike has stopped answering the one question it exists for.

## Start by asking what has landed

    npm run handoff

It reports what is missing, what is struck through, and — the part no reader can
see — **how many commits have landed since the docs were last written**. Then:

    git log --oneline <last doc commit>..HEAD

That log is the input. Work from it, not from memory: a session remembers what it
found interesting, not what it changed.

## Then, per file

**`open.md`.** For every line in it, ask *did this close?* If yes, delete the
line — then decide whether a later agent could get it wrong, and if so write one
sentence in `settled.md`. Most closed lines need no sentence. For every commit in
the log that found something new, add a line.

A line here says **what is wrong, how it is known, and what would close it.** A
line with no evidence is a hunch and does not belong yet. Group by who is
blocked, never by which run or which day found it — a reader wants to know what
they can pick up, not what happened when.

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

Write all three. `deliverable-log.md` must name the other two, or a reader who
starts at the log never learns they exist. An empty `open.md` says so in a line;
it does not get a placeholder.

## What this is not

Not a changelog, not a diary, not a record of what each session did. Four files
of that is what this format replaced, and the thing that had broken was exactly
that a reader could no longer tell what was still true. If a line is only
interesting as history, leave it in the commit message and delete it here.
