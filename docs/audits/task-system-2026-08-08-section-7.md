# Task system — what §7 of the 2026-08-08 sweep changed

Written 2026-08-08 on `claude/task-system-audit-impl-09cdb4`, against
`docs/audits/task-system-2026-08-08.md`. That document is the diagnosis and this one is the state
after acting on its §7. Read it first; nothing here restates its measurements, and every finding
label below (`H1`, `M4`, …) is one of its.

The branch's own contract is `docs/specs/a-silent-answer-is-a-defect.md` — ten clauses, one per
prescription, with the reasoning for every departure in its `## Decisions`. What follows is what a
later agent needs that neither the sweep nor that spec says.

---

## 1. What now behaves differently

Eight commands changed. Each line is a behaviour, not a diff.

| before | now |
|---|---|
| concurrent `tasks add` printed `added …` and exit 0 while records vanished | a write over a store that moved since this process read it **refuses**, exit 1, naming the re-run. Every `added` line is now a record on disk |
| a reader inside a write saw a truncated file that parsed | the store is staged and renamed, so a reader sees one whole version or the other |
| `tasks where <file>` printed no same-system caller | it prints every caller, tagging the ones that cross a system boundary |
| `tasks where <directory>` was 763 lines | 384, with closed claims collapsed to a count and the command that expands them. A single-file query still prints everything |
| `tasks edit --writes` printed a prior-art wall and no grading | `checkPlan`'s **defects** print above the wall, naming the set they were graded against |
| `--grant commitment` was settable at `add` | refused unless the record has been started; the refusal names `tasks start` |
| `tasks done --commit <rev>` recorded a sha | it also reports what that commit wrote outside the grant, and what the grant claimed it never touched — including when they agree |
| `tasks list --trigger x` printed the whole list, exit 0 | refused; `--trigger` was never `list`'s flag, only prose in its usage |
| `tasks list --state open --state declined` silently kept the last | refused, naming both values |
| `tasks doctor` exited 0 on nine conditions it called errors | exits **1** on a reference that resolves to nothing, and still 0 on every disagreement about the work |
| a spec file could not be deleted without stranding 336 closed records | a closed record keeps its spec slug as history; only a live one needs the file |
| `tasks spec remove` refused once the file was gone | it detaches members from a spec whose file is gone — a slug no named record belongs to is still refused as a typo |

Two ordering properties changed with no visible output: every queue tie-breaks `seq` then `id`
(104 of 792 records share a `seq`), and `producers.priorArt` does the same.

## 2. Vocabulary a later reader will hit

- **`dangling`** is a third `CheckIssue` level beside `error` and `warning`
  (`scripts/lib/taskStore.ts`). It means the record points at something that does not exist — a
  system name, a spec file, another record's id, a duplicate, a cycle. It is a level rather than a
  flag so tsc makes every new check choose. **`doctor` exits non-zero on `dangling` alone.** The
  live store has zero, so the CI leg is green today and is a real check tomorrow.
- **`docs/tasks.jsonl.lock` and `docs/tasks.jsonl.<pid>.tmp`** exist for microseconds during a
  write and are `.gitignore`d. A leftover means a process was killed mid-write; the lock is broken
  automatically after 30 s.
- **`misfiledSystem`** (pure, in `taskStore.ts`) and **`pathOwner`** (`context.ts`, the manifest
  half of `systemNames`) are the H4 comparison. It runs at `add`/`edit` and in `doctor`, warns
  only, and skips closed records — asking those turned one answer into 137.
- **`git.changedIn(rev)`** is a new fact on the seam: one commit against its parent, which no
  two-dot range can express.
- **`oldestFirst(a, b)`** is the shared total tie-break. Reach for it, not `seqRank`, in a queue.
- **`CLOSING_STATES`** now lives in `taskStore.ts`; `context.ts` re-exports the same binding.

## 3. Where this branch departed from §7, and why

Three places. All three are recorded in the spec's `## Decisions`; the reasons matter because a
later agent re-reading §7 will otherwise read them as unfinished work.

1. **No declared flag arity table** (§7.1 change 5). A table beside 45 usage strings is a second
   artifact required to be manually kept in sync — the sweep's own §4.3 rule. The
   declaration/description boundary was made explicit inside the one artifact instead: a `--word`
   inside parentheses is prose, which is the rule `positionalArity` already applied to its own half
   of the same string. Repetition is declared the same way, by the `...` `AUDIT_USAGE` already
   writes, scoped to the flag's bracket group. Swept over all 41 verbs the new vocabulary differs
   from the old in exactly three places, and that set is pinned by a test.
2. **`saveStore` needs a lock, which §7.1's costing does not include.** Implementing exactly what
   change 1 says — stage, rename, compare before writing — still lost a record: five concurrent
   adds, three exiting 0 claiming success, one lost. Compare-then-rename is check-then-act. The
   comparison and the rename are now one critical section under an exclusive-create lock. **If you
   are reasoning from §7.1's "ten lines in one function", that number is wrong and the measurement
   that corrects it is in the c1 commit body.**
3. **`saveStore` refuses rather than retries.** A retry would have to re-apply a mutation that is a
   closure over the array the caller loaded, which no caller can express.

## 4. §7.4's second correction was asked against a stale premise

§7.4 asks for a ruling on a three-way `briefLessons.ts` collision. Two of the three claimants were
already settled when the sweep was written:
`a-lesson-has-a-handle-that-survives-rewording-it` is **done and merged** — `52c2795`, and
`git log main..claude/lesson-handle` is empty — and
`a-lesson-can-be-retired-and-the-retirement-is-recorded` is **declined**.

The live collision is two-way, and the sweep missed one side: `lessons-say-what-the-run-learned`
also writes that file. It is ordered ahead of `a-lesson-is-folded-from-its-own-log` by a `requires`
edge, with the reasoning in the event log against that spec. The order is content-then-fold: two
entries in existing arrays cost the fold nothing, while authoring two new lessons against a log
format that does not exist costs a round trip.

The first correction landed as asked: `every-system-owns-its-files-by-name` is now
`Task system` / `high`. **Its own new-check warning is expected and must not be "fixed".** Its
paths are exactly the ones `Testing procedure`'s `scripts/lib` directory grant swallows — the M5
mechanism — and removing that grant is the record's own deliverable. A decision on the record says
so.

## 5. What §7 asked for and this branch did not do

- **Phases 4–6 are not resumed here, and that is a scope decision, not an omission.** §7.4 says the
  paused plan is well aimed and should be resumed; each of those specs is one branch's promise, and
  `merge-ready` grades a branch on every spec its own store diff declares. Carrying them here would
  make this branch owe clauses it never worked. What this branch did instead is make them
  dispatchable: the set is graded, the collision is ruled, the ordering is in the store.
  `npm run tasks -- plan one-query-over-the-channel-and-the-second-place-retired
  a-recurrence-is-appended-and-filing-shows-what-already-claim
  a-question-s-decider-changes-what-the-tooling-does-with-it lessons-say-what-the-run-learned
  a-record-cannot-leave-the-store-unrecorded every-system-owns-its-files-by-name` reports one
  `defect` and three notes. **The defect is a known false positive** — a declined record's
  `produces` claim graded as a live duplicate, already filed as
  `tasks-plan-grades-a-declined-record-s-produces-claim-as-a-li`. The three notes are the real
  answer: two records start blocked, in the order they should.
- **§7.5 and §7.6 are prohibitions and were obeyed.** The store was not rebuilt; no capability was
  added ahead of its use. Every new function here has a caller in the same commit.
- **This branch has no audit pass.** `merge-ready` says so on its clauses leg, correctly. An
  auditor is a separate actor by design: `npm run tasks -- audit-prompt a-silent-answer-is-a-defect`.
- **`merge-ready` reports this branch as declaring a second spec** it never worked, because the
  §7.4 ruling is a `requires` edit on that spec's member. That is filed as
  `ordering-a-member-declares-its-spec` — the branch reproduced it on itself while obeying the
  sweep.

## 6. The sweep's findings, after this branch

Closed against the work above: **H1, H2, H3, H4, H7, H12, H13, H14, M4, M8**, plus the older
`stranded-spec-members-have-no-repair` that M8 extended.

Still open and unchanged, with what a later reader should know:

- **H5** (`clauseStandings` reconciled at 2 of 9 call sites) — the largest remaining HIGH, and the
  one whose fix the sweep already designed: make the store's clause ids a required input.
- **H6** (`--args-from` classifies by prefix, not parser position) — still the mechanism by which
  an audit's findings get silently corrupted, and `--args-from` is still the one filing route for a
  branch audit. Nothing here touched it.
- **H8** (a duplicate id answers two ways) — `doctor` now *fails* on a duplicate id, so the latent
  hazard cannot persist unnoticed, but `Array.find` versus `new Map(pairs)` is untouched.
- **H9** (`CLAUDE.md`'s wisdom line drifted from its tested source) — a one-word fix, deliberately
  not made: it is in §5 and not in §7, and an unclaused change is what an audit exists to catch.
  It is the cheapest item left in the whole list.
- **H10, H11, H15, H16, M1–M3, M5–M7, M9–M13, L1–L6** — untouched. Note that **M5 is now
  load-bearing for a check that runs**: `Testing procedure` declaring the directory `scripts/lib`
  is what puts 11 of `doctor`'s 14 warnings there, and `every-system-owns-its-files-by-name` is the
  record that removes it.

## 7. What did not change, and should not be re-measured

The sweep's arithmetic still holds and this branch does not move it: the tool is still larger than
the game, the Task system still holds 22 of 43 registered concepts (23 now — `atomic store write`
was registered by this branch), 83% of `produces` claims are still unregistered, and `docs/specs/`
still has 34 fully historical files. What changed is that those 34 **can now be deleted** without
stranding their closed members; nobody has deleted them.

The suite is 1,972 tests at ~25 s wall, with one new real-subprocess test — three concurrent
`tasks add` — that costs about half a second and is the only thing proving the c1 seam between
processes rather than inside one.
