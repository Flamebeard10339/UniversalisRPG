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
  write and are `.gitignore`d. A leftover means a process was killed mid-write. The lock is broken
  automatically, but only for a writer arriving more than 30 s later — every write before that
  refuses after a 5 s wait and blames a holder that is not there. That gap is a deferred finding.
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

## 5. What §7 asked for, and where it stands

- **§7.5 and §7.6 are prohibitions and were obeyed.** The store was not rebuilt; no capability was
  added ahead of its use. Every new function here has a caller in the same commit.
- **`merge-ready` reports this branch as declaring a spec it never worked**, because the §7.4
  ruling is a `requires` edit on `a-lesson-is-folded-from-its-own-log`'s member. That is filed as
  `ordering-a-member-declares-its-spec` — the branch reproduced it on itself while obeying the
  sweep. That spec is out of §7.4's scope and its one member is now unblocked and open; the leg is
  red for that reason and for no other.
- **Two specs this branch did work are red on clauses only, and the reason is procedural.**
  `the-workflow-records-what-cost-it-in-one-place` and `a-record-cannot-leave-the-store-unrecorded`
  have every member closed and no audit pass over the work §6 below describes. Step 7 of
  `docs/workflow.md` gives that to a separate actor on purpose, and the session that did the work
  is the one party that cannot supply it. `npm run tasks -- audit-prompt <slug>` is the whole
  instruction.

## 5b. Phases 4–6, resumed

Written in a later session against the same branch. §7.4 said the paused plan was well aimed and
should be resumed; it now is, and every record it named is closed. What a reader needs beyond the
commit bodies:

- **The order was forced and the branch followed it.** `a-recurrence` → `a-record-cannot-leave` →
  `every-system-owns` is a `requires` chain, and phase 6 declares itself last and alone because the
  file list it enumerates has to be the final one. Running them as one sequential branch rather
  than six is therefore the same schedule the six branches would have had, with the merges removed.
- **c6 was graded `met` and its record half did not exist.** The lesson handle survived rewording,
  which is what pass 1 checked; no field on any record ever cited one, so c7 and c12 had nothing to
  count. `Task.breaches` is that field. Adding it forced a literal into eight test fixtures that
  construct a whole `Task`, which no grant forecast — the shape a schema change always has here,
  and one `tasks plan` still cannot see.
- **`proof-targets-resolve` was superseded by `targets-resolve-across-files`, not by
  `rg-m3-dead-proof-targets`.** The spec offered the second as the likely candidate and it is a
  declined Testing procedure finding about stale proof targets in a spec document. The answer came
  out of the concept registry, whose note names its own producer, rather than out of titles.
- **Three defects were found by the new tooling on its first real use, and each is fixed or filed
  where it belongs.** `checkPlan` grades a record's own concept registration as a duplicate of
  itself, which workflow step 5 guarantees for every worker — filed. `cmdConcept` blocked on every
  manifest error rather than the ones its own write introduced — fixed, because making `paths`
  exact caused it. `orphanedFiles` had no test home in a top-level script — moved into `systems.ts`,
  because a mutation making `covers` satisfy the orphan check left the whole suite green.
- **One new `doctor` warning is this branch's own and is correct.** A declined 2026-08-06 record
  lists `.planning/agent-feedback/tool-friction.md` in its `files`, and c1 deleted that file. The
  stale-file report is doing its job; editing a closed record's `files` to quiet it would erase what
  the record actually observed.
- **The Task system is frozen.** `docs/audits/systems.json` carries the SHA and the note on its
  entry, which is what `npm run audit-status` prints first for it.

## 5a. Pass 1, and what it changed after the fact

A commissioned auditor graded the branch over `ccbf328..1978988` in its own worktree and filed
through `--args-from`, the store being the orchestrator's to hold. **Ten clauses met, thirteen
mutations aimed by hand and thirteen killed**, each re-measured at its own file with the mutant
still applied. It discarded the generated 669-entry manifest and rebuilt it — the fifth consecutive
pass to do so, against an already-open finding.

Its regression answer was not clean, and four things changed after the pass because of it:

- **The staged rename fails on Windows while any process holds the store open**, which
  `writeFileSync` never did, and the `EPERM` escaped `reportReadErrors` as a stack trace naming a
  staging file that had been removed. Reproduced independently at 200 of 200 writes failing with one
  read handle held. `saveStore` now waits the reader out inside the lock it already holds — which
  cannot reorder writes, because what is being waited on is a read — and an exhausted wait is a
  `StoreError` with the usual re-run wording. Re-measured: a transient reader costs 0 of 200.
- **c6 was false as written.** `open` reaches `done` with no `start` in between, so a closed record
  still accepted `--grant commitment` on a region nobody read. `claimHolds` is `in-progress` only.
- **c10's declared proof could not fail on what c10 is about**; the checkStore case now exists in the
  file the clause names, so the proof line is true and the clause text is untouched.
- **c5's Decision rested on a one-directional sweep.** The converse now holds too, and the sweep was
  confirmed non-vacuous by breaking a usage string three separate ways.

**Everything after the first of those postdates pass 1**, whose c1 evidence describes `1978988`. A
decision on the spec records it; a pass 2 would re-grade c1 against the code as it now stands.

Two findings are deferred rather than fixed, live and unspecced: the record-versus-owner comparison
misses the two routes in `audit.ts` that also assemble a record, and a stale lock costs five seconds
and blames a holder that does not exist (`LOCK_WAIT_MS` 5 s is shorter than `LOCK_ABANDONED_MS`
30 s, so the abandonment break only ever fires for a writer arriving after the window).

## 6. The sweep's findings, after this branch

Closed against the work above: **H1, H2, H3, H4, H7, H12, H13, H14, M4, M8**, and pass 1's own EPERM regression, plus the older
`stranded-spec-members-have-no-repair` that M8 extended. Closed by phases 4–6: **M5**, and Testing
procedure's own L4 with it.

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
- **H10, H11, H15, H16, M1–M3, M6, M7, M9–M13, L1–L6** — untouched. M5 is gone: no system declares
  a directory in `paths` any more, so `doctor`'s misfiled-system warnings are now about records
  rather than about the manifest, and the shared-window count fell from 32 files to 12 — all twelve
  the deliberate second read `covers` now states outright.

## 7. What did not change, and should not be re-measured

The sweep's arithmetic still holds in the direction that matters and this branch moves it the wrong
way: the tool is still larger than the game, and the Task system now holds **28 of 49** registered
concepts rather than 22 of 43 — phases 4–6 added five of the six. 83% of `produces` claims are still
unregistered, and `docs/specs/` still has 34 fully historical files. What changed is that those 34
**can now be deleted** without stranding their closed members; nobody has deleted them.

The suite is 2,040 tests at ~25 s wall, with one new real-subprocess test — three concurrent
`tasks add` — that costs about half a second and is the only thing proving the c1 seam between
processes rather than inside one.
