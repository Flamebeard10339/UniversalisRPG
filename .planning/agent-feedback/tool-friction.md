# Tool friction

Raw notes on where the tooling — repo scripts, the agent harness, the CLI — cost time or
produced a wrong state. Each entry is something that actually happened, not a speculative
improvement. One section per session, newest last.

## Entries

<!-- Append below. Newest last. Name the pass and the date. -->

## `tasks-roadmap`, audit pass 1 — 2026-08-03

Folded in from `.planning/feedback/audit-tool-friction.md`, which was a second log at a second
path for the same purpose; see the 2026-08-04 entry below.

### `tasks audit` with a full pass plus findings exceeds the Windows argument limit

`audit-prompt` asks for verdicts and findings "in the same `tasks audit` call". Nine clauses with
re-runnable evidence plus five findings with both halves came to roughly 13k characters of argv, and
the shell answered `The command line is too long.` — nothing ran, and the failure arrives after the
whole invocation has been composed.

Worked around by splitting into six calls: one carrying all nine `--proof`/`--evidence` pairs, then
one finding each. That is safe by the command's own design (`findings with no --proof flags are filed
without recording a pass`), and the output confirms it each time — but the prompt's phrasing reads as
though one call is required, so the split looks like a workflow violation until you check.

Worth considering: `tasks audit --from <file>` reading the same flags from a JSON or argfile, which
would also stop long evidence from being escaped through two shells.

### No cheap way to ask a `scripts/` renderer a question with a synthetic store

`npm run probe` asks the DSL load path questions without a scratch runner, and CLAUDE.md says to reach
for it instead of a scratch `*.test.ts`. There is no equivalent for the task-system CLI: verifying the
78-column clause against a store the real one cannot contain meant writing a throwaway `.ts` at the
repo root and deleting it, because `npx tsx -e` does not resolve the repo's relative imports. `npm run
mutate` covered the rest of the clauses well — twelve mutations, twelve killed — so the gap is
specifically "render this view over records I made up", not "test the logic".

## `tasks-roadmap`, closing the pass-1 findings through to merge — 2026-08-04

Four promoted findings fixed, self-review, pass 2 commissioned, triage, merge to main.

### `tasks spec show` refuses the slug `tasks next` infers

First command of the session, and it was a wrong guess. `tasks next` prints `spec inferred from the
branch name: tasks-roadmap — docs/specs/tasks-roadmap.md exists`, so inference reads as ambient;
`tasks spec show` answers with usage. Every read verb that can infer the spec should, or none should.

### Querying the store from a different branch answers `0 task(s)` instead of refusing

After `git checkout main` for the merge, `tasks search per-system` and `tasks list --spec
tasks-roadmap` both returned `0 task(s) — unreviewed: 0, open: 0, …`. Nothing was wrong: main's
`docs/tasks.jsonl` predated the branch, so the records genuinely did not exist at that ref. But the
answer is indistinguishable from "those findings are gone", and the store being versioned with the
code makes every query silently ref-scoped. Recovered by piping `git show tasks-roadmap:docs/tasks.jsonl`
into a `node -e` script, because `--store` takes a path and there is no way to name a revision.

Worth considering: a global `--at <ref>`, or a one-line warning when the inferred branch and the
newest event in the store disagree about which branch is live.

### `tasks show` does not surface what `tasks note` records

Closing `…-the-gui-rebuild-title-rewrite-dropped-de` required a mechanical check over all 28 renamed
titles. That check — the actual evidence for closing a medium finding — went into `tasks note --id
<finding>`, since editing the finding's `evidence` would have rewritten the auditor's statement.
`tasks show` on that record then prints `closed`, `closedCommit` and nothing else. The record says
*that* it closed and never *why*, and carries no pointer to `tasks log --id`, so the evidence is only
reachable by someone who already knows it exists.

### The synthetic-store gap above reproduced, independently

Verifying the 78-column clause still held after the renderer refactor meant the same throwaway script.
`tsx` could not resolve the repo's relative imports from the scratchpad path, so it ended as
`npm run tasks -- roadmap | node -e '…'` — which also turned out to be necessary for a second reason:
`awk`'s `length()` counts bytes, and the footer's `·` separator is multi-byte, so a byte-counting
measurement reports the shipped output at 79 columns against a 78-column clause. Two sessions now have
hit the "render this view over records I made up" gap from opposite directions.

### Two friction logs at two paths, because `audit-prompt` names two that do not exist

This file and `.planning/feedback/audit-tool-friction.md` were the same log in two places, neither
referencing the other. Not an accident: `audit.ts:178-179` printed `Log any task tool friction in
.planning/feedback/tool-friction.md` and `Log any audit tool friction in
.planning/feedback/audit-tool-friction.md`, and every auditor is commissioned by being told to run
`audit-prompt` and do what it says. Both named paths were wrong — the log has always been at
`.planning/agent-feedback/tool-friction.md` — so the auditor created the file the brief asked for,
in the directory the brief invented.

Merged here and the other deleted, and `audit.ts` now names one log. Deleting the file without
fixing the generator would have recreated it on the next audit. Worth noticing that the failure
CLAUDE.md warns about — a system required to be manually kept in sync — landed in the file that
exists to catch exactly that, via the one document nobody hand-writes.

### Merge readiness is six reads across two tools, and `merge-ready` answers none of them

Preparing the merge, the questions that had to be answered by hand were: is the tree clean
(`git status`), has main moved past the merge base (`git rev-parse` + `git merge-base`), is every spec
member done or declined and does the latest pass leave a clause outstanding (`tasks spec show`, twice
over), and what subject shape do this repo's merge commits use (`git log --first-parent main`, then
reading two previous merge bodies). `tasks merge-ready` ran last and passed every leg — but its six
legs are all *repo* health (tsc, tests, layer-check, audit-status, doctor, bytes) and not one of them
is about *this branch's standing*.

Worth considering: `merge-ready` already sits at the right place in workflow step 9 and already reads
git. Adding `branch`, `spec` and `clauses` legs would collapse six commands into none, and would fail
loudly on the case that actually bites — main moved, so merge main in first. Printing the conventional
merge command as its closing line would cover the rest. Stopping short of a `tasks merge` verb looks
right: the merge body is the one artifact that has to be written by whoever did the work.

### Commit messages are winning the reasoning against `tasks decision`

Of 17 commits on this branch, 5 changed source code; 12 changed none (10 touched only
`tasks.jsonl` + `events.jsonl`, 2 also touched the spec doc). The commit count itself costs little —
`events.jsonl` already carries who, when, branch and head for every store write, so per-write commits
are close to redundant with it.

The cost is elsewhere. `workflow.md` step 10 says to record reasoning with `tasks decision "<one
line>" --spec <slug>`, warning that a decision not recorded there is one the next planner
re-litigates. It was never run this session. Every judgement — why the mechanical title check gets no
gate, why the packing rule moved to `render.ts`, why the two pass-2 findings were triaged out of the
spec — went into a commit body, because a commit was being written anyway and the message wanted one.
The store, which is what a cold session actually reads, got only the terse auto-notes. Two channels
for one thing, and the one with the writing prompt attached wins.

Worth considering: have `done`, `decline` and `triage` print the `tasks decision` command the way
`tasks done` already prints unregistered `produces` claims. Same nudge, same reason — the judgement is
the point, so the store should be the path of least resistance rather than the commit body. Batching
store writes to one commit per phase (triage → closures → `spec done` were four commits here and are
one state change per pass) is discipline rather than a tool change.

## droptables audit, 2026-08-04

### A full `tasks audit` pass does not fit on a Windows command line

The first attempt at recording twelve clause verdicts with evidence a next pass can re-run died on
`The command line is too long.` — Windows caps a process command line at 8191 characters, and twelve
`--proof N=... --evidence N="..."` pairs carrying test names, mutation verdicts and probe output ran
well past it. The evidence had to be compressed to fit, which is the wrong pressure: the tool asks
for evidence specific enough to re-run and then rations how much of it there is room for.

Splitting is not a way out. `--proof` flags record a *pass*, and a clause left ungraded in a pass is
recorded `unknown` — so two calls covering six clauses each would leave the first six reading
`unknown` in the next `audit-prompt`. Findings split cleanly (three calls, no pass appended, verdicts
stood), so the seam already exists for the half that does not need it.

Worth considering: `tasks audit <spec> --from <file>` taking the same flags as lines, or JSON. The
store write is one operation; only the transport is the problem.

### `npm run mutate` cannot tell a line-ending mismatch from a wrong find

This repo has mixed line endings — `src/**/*.ts` is CRLF on disk, `content/tutorial-island.dsl` is
LF. A manifest whose multi-line `find` used `\n` was refused with `src/runtime/effects.ts does not
contain the find text`, and the same manifest rewritten with `\r\n` was then refused for
`content/tutorial-island.dsl`. Both messages are correct and neither is a clue; `cat -A` through
git-bash shows LF for both, so the usual way of checking makes it worse. Two rounds went to this
before a node one-liner comparing the raw bytes found it.

Worth considering: when a `find` misses, retry once with the other line ending and, if that hits, say
so in the refusal — `the find text matches with CRLF line endings; this file is CRLF`. The refusal
already reads the whole file, so the check is free.

## droptables audit pass 2, 2026-08-04

### `npm run probe -- - --each` reports every document that loads as a broken module

The usage text advertises stdin plus `--each` as the way to survey a table of variants, and it works
for every variant that fails to load. A variant that loads *clean* reports `stdin[3] is not a usable
module id` — `splitDocuments` names each document `${name}[${index + 1}]` (probe.ts:204) and the
brackets are not legal in a module id, so the loader refuses the name rather than the content. The
survey therefore cannot distinguish "loads" from "rejected", which is the one distinction a table of
variants is asked for; every probe of an accepted shape had to be re-run as a temp file.

Worth considering: name them `stdin-3`. One character, and the advertised path starts answering the
question it exists for.

### The CRLF trap in `npm run mutate` cost this pass two rounds as well

Already logged from pass 1 below, and hit again immediately: two of ten mutations in the first
manifest were refused with `does not contain the find text` purely because `\n` should have been
`\r\n`. Recording the second occurrence because the fix suggested there — retry with the other line
ending and say so — is now paid for twice.
