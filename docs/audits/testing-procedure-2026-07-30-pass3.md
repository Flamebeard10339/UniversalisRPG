# Testing procedure — audit pass 3 (2026-07-30)

Window `9adc928..52013f2`: four code-changing commits, 8 completed chunks across four tasks, all
of them this system fixing itself against pass 1 and pass 2. Reviewed against
`docs/tasks/task-system.md` (the design), `docs/audits/testing-procedure-2026-07-30-pass2.md`
(the findings being closed), and the four task files.

Independence note: pass 2 and the three commits closing it share an author. This pass does not.
Everything below was measured against the working tree at `52013f2` rather than read off the
task files' own claims — which is how H1 was found, because the task files claim the opposite.

The headline: **the pass-2 M1 fix is directionally right and its cited proof is false.** The
number it was written to correct — `task-system` reading 6 when the truth was 8 — now reads **1**.
The window moved the error from 25% low to 87% low, in the direction of less audit debt.

---

## H1 — the chunk-budget fix under-counts the exact case it was written to fix: `task-system` weighs 1, not 8

`the-chunk-budget-counts-trailer-lines-not-task-chunks` states its acceptance criterion as
"Proof is task-system reading 8 rather than 6" (`docs/tasks/the-chunk-budget-counts-trailer-lines-not-task-chunks.md:13`).
Measured with the store's own parser:

| revision | `task-system` chunks the parser sees | budget weight |
| --- | --- | --- |
| `92adffe` (pre-compaction) | **8**, all checked | — |
| `52013f2` (HEAD) | **0** | **1** |

`task-system.md` was compacted by `tasks confirm` *before* this window removed the stripping, so
its `## Chunks` section is gone from the file. `auditBudgetForSystem` (`scripts/tasks.ts:498`)
weighs it `task.chunks.length || 1` — the fallback, not the chunk list. Reconstructing the window
the finding cites:

```
lastAudit=4631baa → count 9: chunk-budget 3, unresolvable-lastAudit 2, one-bad-sha 1,
                             status-vocabulary 2, task-system 1
```

Three numbers were wrong before (8 declared, 3 distinct pairs, 6 reported). There are still three,
and the reported one moved further from the true one.

The load-bearing error is in the recorded decision
(`the-chunk-budget-counts-trailer-lines-not-task-chunks.md:57`):

> The 36 already-compacted tasks keep working: Chunks stays optional for a confirmed task rather
> than becoming required, so nothing needs migrating.

They keep *parsing*. They do not keep *counting*. `serializeTask`'s new
required-or-present filter (`scripts/tasks.ts:283-284`) is what makes them keep parsing, and it
works; but a task whose boxes were already deleted has nothing for the new counting rule to read,
and no migration chunk was written. The decision names this exact failure mode two sentences
earlier and calls it "a worse defect than the one being fixed":

> If its chunk boxes are gone the count for that task collapses to zero or to a fallback of one,
> which means the user's confirmation would silently lower its own system's audit debt

That is the shipped state for every task confirmed before `52013f2`. The population is frozen at
36 and will not grow, which bounds the damage — but `task-system`, this system's largest completed
deliverable and the finding's own worked example, is inside it.

Blast radius is small and precisely known. Of the 36 compacted tasks, 34 were migrated from
`backlog.md` already-compacted and never had chunk lists, so `|| 1` is a fair answer for them.
Exactly one is materially mis-weighted: `task-system`, 8 → 1. The fix is a one-time backfill, and
the data is recoverable — `git show 92adffe:docs/tasks/task-system.md` still has all eight boxes.

**Recommended fix, and it is not "restore the boxes":** see the note under M1. Freezing the count
into frontmatter at `tasks done` closes H1, H2 and M1 together and lets compaction go back to
being a free choice.

---

## H2 — "a completed task with no trailers is counted and shown" is not delivered; discovery is still trailer-based

Same task, same Deliverable sentence (`:13`). Pass-2 M1 prescribed deriving the count from
"the tasks (`status: done`, naming the system, whose completion falls in the range)", using
trailers only to locate the task. The implementation kept trailers as the *discovery* mechanism:
`auditBudgetForSystem` iterates `taskCommitsSince(...)` and only ever sees a task that some commit
in range names (`scripts/tasks.ts:491-496`).

Measured on the real store at HEAD:

- `done` tasks naming Testing procedure: **36**
- with no `Task:` trailer anywhere in history: **31**
- visible to the budget and to `--brief` in the current window: **4**

Pass 2 measured 31 of 32 invisible and called it out as half the finding. It is 31 of 36 now.
The brief's working set is more honest than it was — it agrees with the count by construction,
which chunk 3 genuinely delivered — but both are still derived from the same blind mechanism.

The reason the criterion could not be met is structural and worth naming: **nothing in the task
model records when a task completed.** `doneTask` (`scripts/tasks.ts:805-829`) sets
`status: done` and stamps nothing. `confirmed:` is stamped, but confirmation is a separate,
user-paced act and pass 2's own container task already asks whether it earns its step. With no
completion date, "tasks whose completion falls in the range" is unimplementable, so trailers were
the only available proxy — the implementation did the best the model allowed. The model is the
defect.

---

## M1 — a stray trailer now recharges an already-audited task's full chunk count; this is a regression against trailer counting

Consequence of the same missing completion date, and it runs the other way. A task that completed
and was audited in a previous window stays `status: done` forever. Any later commit whose message
names it — a follow-up fix, a doc correction, a `tasks chunk` tidy-up — pulls it back into
`completedTasks` and charges its **entire** chunk count against the new window.

| | old behaviour | new behaviour |
| --- | --- | --- |
| one stray `Task: old-task #3` in a fresh window | charges 1 | charges `old-task.chunks.length` |

For a task the size of `task-system` that is 8 of an 8-block budget from a single trailer line on
an unrelated commit. Trailer counting bounded this at 1 per line; chunk counting removed the bound
without adding the range filter that was supposed to replace it. Not observed firing in this
window — every in-range trailer belongs to a task genuinely completed in it — but it is one
follow-up commit away, and the failure is silent and blocks `tasks done`.

**The fix that closes H1, H2 and M1 at once.** Stamp the size and the date at completion:

```
status: done
completed: 2026-07-30
chunks-at-done: 8
```

`doneTask` already validates that every box is checked at exactly this moment, so it is the one
point where the count is known to be final and correct. Then the budget is "tasks whose
`completed:` falls in the range, summed over `chunks-at-done`" — no trailer involved. This
- makes compaction orthogonal again, so the pass-2 design change becomes optional rather than forced;
- freezes the count against later edits to the checklist, which the current rule does not;
- makes the 36 legacy tasks a one-pass backfill instead of a permanent blind spot;
- reuses the `confirmed:` frontmatter-stamp pattern already in the model rather than adding a mechanism.

It is strictly more of a change than what shipped. It is also the shape the design was reaching
for, and it retires three findings.

---

## M2 — every new branch in `audit-status.ts` and `audit-due.sh` shipped untested, and the task claiming them as proof is `done`

`audit-status-reports-ok-when-lastaudit-cannot-be-resolved` states its proof as "the deadbeef
fixture: **audit-status exits non-zero, the ledger names the system as mis-recorded**, and tasks
done still refuses on the real chunk count". Only the third clause is tested.

`grep -rn audit-status --include=*.test.ts scripts/` returns nothing. There is no
`scripts/audit-status.test.ts`, and `.claude/hooks/` has no test of any kind. Untested and shipped
in this window:

- `audit-status.ts:191-209` — the `unmeasurable` branch, the suppressed `touchesSince`, the detail string, the `DUE ` marker
- `audit-status.ts:220` and `:228` — the `unresolved:` line and its contribution to the exit code
- `audit-status.ts:140-144` — `printBrief`'s refusal
- `audit-due.sh:35-46` — the new `unresolved:` case arm, the `unknown` state write, and `exit 2`

`tasks.test.ts:258-284` covers `auditBudgetForSystem` returning `unresolved` and `tasks done`
refusing on it. That is the library seam, which is the right one to test first — but the two
clauses the deliverable names as its proof both live above it, in the two files with no test
harness at all.

This is pass-2 **M2** (`the-audit-trigger-and-most-of-tasks-check-ship-untested`), still open, and
this window widened the surface it describes while it was open. Not a new finding so much as
evidence that the existing one should lead the next beat rather than sit in Beat 1's tail — the
container task already sequences them together, correctly.

---

## M3 — `chunks.length || 1` conflates three populations and contradicts a written contract

`scripts/tasks.ts:498`. "No boxes" currently means three different things:

| population | count | correct weight | weighed |
| --- | --- | --- | --- |
| migrated-already-compacted (never had chunks) | 34 | 1 is defensible | 1 |
| compacted-after-having-chunks | 1 (`task-system`) | 8 | 1 |
| declared zero-weight by design | 1 (the container) | **0** | 1 |

The third is an explicit contract, not an inference. `testing-system-usable-and-reliable.md:37`:

> This task is a container, not work. It carries no chunks of its own and **spends no audit
> budget**; its `blocked-by` is the membership list.

It is `open` today, so nothing is wrong yet. When its 16 members close and it goes `done`, any
commit naming it charges 1 against a block budget of 8 — 12.5% of a window spent by a task whose
own spec says it spends nothing. The user flagged this; it is real, it is small, and it is a
contract violation rather than a judgement call, which is why it is M and not L.

Under the M1 frontmatter fix the fallback mostly disappears: `chunks-at-done: 0` is a real
recorded zero and needs no `|| 1` guess. If the current scheme is kept instead, the three
populations need three answers, and the container needs an explicit one.

---

## L1 — `task-system.md` still documents the contract this window replaced

The design doc is what pass 2 audited against ("treating that design as a claim to test"), so a
stale claim there sends the next auditor at a false target. Two passages are now wrong:

- `docs/tasks/task-system.md:264-268` — "`tasks confirm <id>` stamps the date and strips `## Chunks` and `## Handoff`". It strips Handoff only.
- `docs/tasks/task-system.md:375-376` — "It also means compaction is safe: `tasks confirm` strips `## Chunks`, but the budget reads trailers, not boxes, so a compacted archive still counts."

The second is the more interesting one, and it is why H1 happened. The original design was
*internally consistent*: strip the boxes, count the trailers. Pass-2 M1 attacked the counting half
without registering that it was the load-bearing counterpart of the compaction half, and the fix
inverted both without going back to the sentence that tied them together. That sentence is still
in the repo asserting the old pairing.

`task-system` is `confirmed`, so this is an archive — but it is also the de facto spec, and
nothing in `tasks check` notices a confirmed task's prose going stale.

---

## L2 — `printBrief` computes the audit budget twice

`scripts/audit-status.ts:140` (`budgetCheck`) and `:149` (`budget`) are the same call on the same
arguments; each spawns `git rev-parse` plus `git log` over the range. Collapse to one.

---

## L3 — an unresolvable system is marked `DUE` but omitted from the `audit due:` line

`scripts/audit-status.ts:195-209`. `overdue` excludes `unresolved`, so the system is not pushed to
`due`, but `marker` is `overdue || unmeasurable ? 'DUE '`. The table row says DUE, the summary line
does not list it, and the correct action is not "audit this" but "repoint the SHA" — which only
the `unresolved:` line says. The exit code is right; the marker is telling the reader to do the
wrong thing. A distinct marker (`??? `, `BAD `) would match the detail string already printed.

---

## L4 — the budget sums declared chunks where the deliverable says checked chunks

`scripts/tasks.ts:498` uses `task.chunks.length`; the Deliverable says "the **checked** chunks of
the tasks that completed in the range". They agree today only because `checkStore:613` refuses a
`done` task with unchecked boxes and `doneTask:807` refuses to create one. That is a real guard,
so this is not a live defect — but the budget is relying on an invariant enforced two files away
rather than stating it, and `.filter((chunk) => chunk.checked).length` costs nothing.

---

## Usability

Asked for separately; recording measurements rather than opening findings, since the two real
problems are already tracked.

**`tasks next` and `tasks list` now take 30 seconds.** Measured at HEAD, three runs each. Pass 2
measured 19.5s at 94 tasks; the store is 105 tasks now and the entry point is 54% slower. The
cause is `firstCommitTimestamp` (`scripts/tasks.ts:348`) spawning `git log --follow` from inside
the `.sort()` comparator, so it runs O(n log n) times, plus `summaryLine` rebuilding the whole
`dependents()` map per row. Both are `the-ready-queue-costs-19s-and-then-orders-by-filename`, open,
Beat 3.

The new datapoint worth having: **the audit protocol is itself the growth driver.** This window
lifted 11 findings into task files, and that is what moved 19.5s to 30s. Each audit makes the
tool you use most, most often, measurably worse. On the current trajectory Beat 3 is not a polish
item — at ~0.3s per task, the next two audits put `tasks next` over 40s. Memoising
`firstCommitTimestamp` into a single `git log` pass is a small change and would repay itself
immediately. Consider promoting it out of Beat 3.

**`.claude/commands/` has no entry for the new verbs.** `task-context`, `task-done`, `task-new`,
`task-next` exist; `stop` and `needs` shipped in this window with usage-text only
(`scripts/tasks.ts:924-925`). `stop` in particular is the one that unblocks the single-active-task
rule, which is the most common way to get stuck. Low, and arguably correct to leave — a slash
command per verb is its own kind of bloat — but the asymmetry is currently undeclared.

**`stop` requires `--note`, `defer` does not.** `stopTask:779` calls `requireNote`;
`deferTask:798` takes none and writes no handoff line. Deferring is the more permanent of the two
and leaves less trace. Not obviously wrong, but it is the kind of asymmetry that reads as an
oversight rather than a decision, and nothing records which it is.

---

## What this window got right

Worth stating, because three of the findings above are refinements of good work rather than
rejections of it.

- **`serializeTask`'s required-or-present filter** (`scripts/tasks.ts:283-284`) is the correct
  shape. It is what makes an optional `## Chunks` on a confirmed task survive the next write verb,
  and the round-trip test at `tasks.test.ts:367` guards it across all 105 real files rather than a
  fixture. Without it the compaction change would have silently deleted the boxes on first write.
- **The brief now sources its task list from `budget.completed`** rather than re-deriving it from
  trailers. The count and the working set can no longer disagree, which was half of pass-2 M1 and
  is genuinely closed.
- **`dependencyCycles` extracted and reused** by both `checkStore` and `addBlocker`
  (`tasks.ts:559`, `:767`) — the refusal happens at the point the edge is written, and the test
  asserts the rollback leaves `blockedBy` untouched (`tasks.test.ts:189-200`). That is the right
  seam and the right test.
- **The `unresolved` state is a state, not an exception.** Threading it through `AuditBudget`
  rather than throwing means `tasks done`, the ledger and the brief all refuse for the same
  reason with the same words. Pass-1 M1 and pass-2 H1 closing as one fix was the correct call.
- **`audit-due.sh` no longer swallows an unrecognised non-zero.** A ledger that ran and crashed is
  now distinguishable from a clean run, which was the actual fail-open.
