# planning-branch-friction

## Deliverable

Two medium findings sat unreviewed because the tool cannot see a **planning branch** — one whose
output is a spec for a later branch rather than an implementation of its own. `audit-session-timing`
was one: it delivered `scripts/session-timing.ts`, then authored `docs/specs/audit-loop-costs-less.md`
and `docs/specs/audit-brief-arrives-complete.md` as plans for two branches that had not started.
`merge-ready` read those specs as debts it owed and failed on both the spec leg ("3 open members")
and the clauses leg ("no recorded audit pass") — two true statements about a branch that owed
neither. In the same session, the dispatcher held the one name a planning branch actually produces,
the spec slug, and `work-prompt audit-loop-costs-less` answered "no such task" with five near-misses
fuzzy-matched on titles.

Both are the same shape: the spec slug is a first-class name and the tool only accepts task ids.
This branch teaches `merge-ready` the difference between a spec a branch wrote and a spec a branch
owes, and teaches `work-prompt` to take a slug.

Proof:

- [c1] `merge-ready` passes the spec and clauses legs for a branch that authored its spec as a plan for a
  later branch, and says which spec and why. The condition is derived from two facts and not
  declared anywhere: the spec file is absent from the base branch, so this branch wrote it, and
  every member of it is still `open`, so nothing here was ever worked against it. A member that is
  `in-progress`, `done` or `declined` is work done here and the branch owes the spec exactly as it
  did before. The answer lands in `standingLegs` beside the existing "this branch is working no
  spec, so it owes no clause" case (`mergeReady.ts:95`) and not in the `LEGS` loop, which
  `audit-loop-costs-less` clause 4 rewrites.
  proof: vitest scripts/tasks/mergeReady.test.ts "passes the spec and clauses legs for a branch that wrote its spec as a plan for a later branch"
  proof: vitest scripts/tasks/mergeReady.test.ts "reads a spec as a plan only when this branch wrote it and worked none of its members"

- [c2] `npm run tasks -- work-prompt <spec-slug>` briefs that spec's next unblocked member, naming the
  slug it resolved and the member it picked, and a spec with no member to brief is told why rather
  than answered with nothing. The queue is `fixNowQueue`, the same one `tasks next --spec <slug>`
  reads, and the explanation is `explainEmptyQueue`, the same one `tasks next` prints — a second
  answer to "which member is next" would be a second thing to keep in sync.

- [c3] A **root record** — a task whose id is the spec slug and which declares no write grant, the
  convention eleven specs carry — is never dispatched as work. It requires every member of its own
  spec, so it is blocked by the very records that are ready to be picked up, and `work-prompt` on
  one briefs the spec's next member instead, saying why and pointing at `tasks show` for the whole
  picture it holds. Briefing it directly misdirects three times: "You are implementing
  audit-loop-costs-less" over a record whose own evidence reads "work the members, not this";
  `BLOCKED` against four waiting requirements that are this spec's own members, so a spec appears
  to wait on itself; and an instruction to record the write grant whose collision with every slice
  beneath it is why the last root task (`tool-friction-backlog`) was declined. An ordinary exact
  id still wins outright, and a record holding a write grant is work whatever it is called.
  proof: vitest scripts/tasks.test.ts "work-prompt takes the spec slug a dispatcher knows and briefs its next unblocked member"
  proof: vitest scripts/tasks.test.ts "work-prompt prefers an exact task id to a spec file of the same name"
  proof: vitest scripts/tasks.test.ts "work-prompt briefs a member rather than the root record its own spec blocks"
  proof: vitest scripts/tasks.test.ts "work-prompt falls back to the root record only when its spec holds no other record"
  proof: vitest scripts/tasks.test.ts "work-prompt says why a spec has no member to brief rather than printing nothing"

- The gate names which spec it graded and how it got there, and grades a spec the branch **owes**
  ahead of a plan it merely **wrote**. `resolveActiveSpec` answers "what am I working on" from the
  most recently written spec, and planning happens last — so a branch that implemented one spec and
  then authored a plan for a later branch resolved to the plan, which owes nothing, and the gate
  printed "every leg passed" with the implemented spec never named and never graded. Before this
  branch the same misresolution produced a red gate: loud and wrong, which is how the two original
  findings were noticed. Green and wrong is worse, on the one gate that certifies a merge. A branch
  whose every candidate is a plan still passes as the planning branch it is, and a plan's pass says
  no other spec was graded. Grading *every* spec a branch touched was measured and rejected: one
  branch in this repository's log wrote records against ten.
  proof: vitest scripts/tasks/mergeReady.test.ts "grades a spec the branch owes ahead of a plan it merely wrote, however recent the plan"
  proof: vitest scripts/tasks/mergeReady.test.ts "leaves an ordinary branch and a planning branch exactly as they were"
  proof: vitest scripts/tasks/mergeReady.test.ts "steps past a plan to the spec the branch owes, and says it did"
  proof: vitest scripts/tasks/mergeReady.test.ts "reports the route to the spec it is about to grade"

## Decisions

- **Extends** `merge readiness runner` and `generated worker brief`; adds no capability and retires
  none. Both findings are gaps in existing surfaces, so a new concept here would be a second owner
  of a question one already answers.
- The planning-branch condition is derived, never declared. A `--planning` flag, or a field on the
  spec saying which kind of branch wrote it, would be a second place to keep in sync with what the
  store and git already know — and it would be set by the branch it exonerates.
- A spec with **no** members is not a plan. `authoredAsPlan` requires at least one member, so a spec
  file authored and never decomposed keeps failing the clauses leg. Nothing was promised to a later
  branch until the work was named.
- `work-prompt` resolves an exact task id before it looks for a spec file, and only falls back to
  the fuzzy id match after both. Fuzzy-first is what produced the finding: `audit-loop-costs-less`
  matched five records on substrings of their titles, none of which was the spec of that exact name.
- Clause 3 is the correction of a first attempt at clause 2 that made the finding worse. "An exact
  task id always wins" was written to protect the eleven specs carrying a root task of the slug's
  name — and those are exactly the records that must not be briefed. The slug resolved, the root
  record won, and the brief told a worker to implement a container its own spec blocks. A root
  record is identified by what it is rather than by what it is called: id equal to the spec slug
  **and** no write grant. A record that declares a grant is work whatever its name, so a single-task
  spec named after itself is briefed unchanged.
- The root record stands in for its spec only when the spec holds no other record at all. The first
  version fell back whenever the *queue* was empty, which put the defect straight back through
  `audit-brief-arrives-complete`: four members, every one waiting behind `audit-loop-costs-less`,
  an empty queue, and a brief that dispatched the container again. A decomposed spec with nothing
  ready is answered by `explainEmptyQueue` naming which member waits on what — the same answer
  `tasks next --spec` gives, and the one a dispatcher can act on.
- A planning branch carries **no spec of its own** — planning is informal here. `audit-session-timing`
  has no `docs/specs/audit-session-timing.md`; it wrote records against two specs, both plans. So
  nothing in this branch requires a planning branch to hold a spec, and clause 4's wrong-spec case
  is an *implementing* branch that also authored a plan, not the planning branch itself.
- The root-record guard covers the fuzzy path as well as the exact one. Guarding only the exact id
  left `work-prompt audit-loop` — one keystroke short, resolved by prefix — reproducing all three
  misdirections verbatim, which is the same input class the original finding was filed about.
- An unanswerable base ref reads as "not shown to be a plan", never as "this branch wrote it".
  `git.fileAt` returns null for a missing file and for a broken ref alike, so the flag is computed
  from a tri-state and the exemption fails closed. A gate whose exemption widens when its evidence
  disappears is the wrong way round.
- The spec decision is a pure function (`decideSpec`) with the git and store reads passed in as
  data. It was inline in `branchStanding`, which cannot be called without a repository, so inverting
  the flag's polarity left the file green and `tsc` clean — a decision nothing can call is a
  decision nothing checks.
- A record requiring a **sibling** member is not a container and is briefed normally. That was the
  first candidate for the test — "requires a member of its own spec" — and it is wrong: ordering
  between slices is the normal shape, and it would have redirected away from most of the queue.
- `work-prompt` keeps exiting 0 on a name it cannot resolve. The finding names this as secondary and
  systemic, and the repository has already decided the other way: a read answers rather than
  refuses (`context.ts:300`, `resolveIds.ts:5`), and `tasks.test.ts` asserts the exit code. Changing
  it here would settle a policy question for `show` and `audit-prompt` from inside one verb.
- This branch and `audit-loop-costs-less` clause 4 both write `scripts/tasks/mergeReady.ts`. The
  collision is real and left standing: clause 4 rewrites the serial `for (const leg of LEGS)` loop
  into a concurrent one, and every line this branch touches is in `standingLegs` and
  `branchStanding`, which that rewrite does not read.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-05

- base: `2e662bffa41a969ec6c900d8687a70e25563c018`
- head: `2d037fcf7b12f3d6d86b0579443c58a119edd7ed`
- proof 1: met — Both named targets exist and pass: `npx vitest run scripts/tasks/mergeReady.test.ts` is 15/15 green.
Hand mutation (no `npm run mutate`; edit, run one test with `-t`, restore via `git checkout --`) kills each for the right reason.
(a) mergeReady.ts:103 `if (standing.specAuthoredHere) {` -> `if (false) {` kills "passes the spec and clauses legs for a branch that wrote its spec as a plan for a later branch" at mergeReady.test.ts:167 (`expect(ok).toBe(true)`, got false).
(b) mergeReady.ts:187 dropping `!onBaseBranch &&` kills "reads a spec as a plan only when this branch wrote it and worked none of its members" at :186 — a spec the base branch already carries reads as a plan.
(c) dropping `members.length > 0 &&` kills the same test at :196 — a spec authored and never decomposed reads as a plan.
(d) `members.every(...)` -> `members.some(...)` kills it at :191 — a spec with one done member reads as a plan.
End to end: `npm run tasks -- merge-ready --store <tmp>/tasks.jsonl --specs-dir <tmp>/specs --branch claude/topic-abc` over a fixture (spec file plan-for-later.md absent from main, members plan-a and plan-b both open) prints `spec  ok  pass - this branch wrote plan-for-later as a plan for a later branch and worked none of its 2 member(s), so it owes neither them nor a clause` and emits no clauses leg at all.
Met as written. See the high finding: the leg answers about whichever spec `resolveActiveSpec` picked, and on a worktree branch name that is the plan spec rather than the spec the branch actually worked.
- proof 2: met — No proof target on this clause; verified by direct inspection, three parts, all re-runnable.
(a) Slug resolves to a member and names both: `npm run tasks -- work-prompt plan-for-later --store <tmp>/tasks.jsonl --specs-dir <tmp>/specs --branch claude/topic-abc` prints `resolved the spec plan-for-later -> plan-a, its next open, unblocked member (1 more behind it: plan-b)` then `You are implementing plan-a on branch claude/topic-abc.`
(b) Same queue as `tasks next --spec`, against the real store: `npm run tasks -- next --spec audit-loop-costs-less` and `npm run tasks -- work-prompt audit-loop-costs-less` both pick `mutate-narrows-to-a-test`, and work-prompt names the same two behind it (merge-ready-legs-run-together, task-tests-split-by-command). memberQueue (workPrompt.ts:137) is `fixNowQueue` with root records filtered out, so the two queues can only diverge on an undecomposed spec whose root record is unblocked, which is the case clause 3 handles.
(c) An empty queue is explained, not silent: `npm run tasks -- work-prompt planning-branch-friction` prints `planning-branch-friction is a spec, and it has no open, unblocked member to brief` then `all 2 member(s) are accounted for - done: 2`; `npm run tasks -- work-prompt audit-brief-arrives-complete` prints the four open members and the requirement each waits on, which is `explainEmptyQueue` (records.ts:423), the same function `tasks next` prints.
Regression cover exists even though the clause names no target: scripts/tasks.test.ts "work-prompt takes the spec slug a dispatcher knows and briefs its next unblocked member" and "work-prompt says why a spec has no member to brief rather than printing nothing", both killed by the c3 mutations M3/M4/M5.
- proof 3: unmet — The clause's opening sentence — "A root record ... is never dispatched as work" — is false on the third of the three resolution paths.
workPrompt.ts:148 guards the exact-id path and workPrompt.ts:137 filters root records out of the spec-file queue, but workPrompt.ts:155, the `resolveTaskIds` fuzzy fallback, returns whatever it matched with no `isRootRecord` check.
Reproduce against the real store: `npm run tasks -- work-prompt audit-loop` prints `resolved audit-loop -> audit-loop-costs-less` and then all three misdirections the clause enumerates, verbatim — `You are implementing audit-loop-costs-less on branch ...`; `audit-loop-costs-less  [task/open]  BLOCKED` with `requires: mutate-narrows-to-a-test (waiting), mutate-leaves-behind-what-a-mutant-created (waiting), merge-ready-legs-run-together (waiting), task-tests-split-by-command (waiting)`, which are that spec's own members; and `2. Correct the grant: npm run tasks -- edit audit-loop-costs-less --writes <what you will actually touch> --grant commitment` over a grant the same brief printed as `- none declared`.
The five named targets do all exist, pass, and die under hand mutation of workPrompt.ts: M1 `isRootRecord` dropping `task.writes.length === 0` kills "prefers an exact task id to a spec file of the same name"; M2 `if (exact !== undefined) return exact` kills "briefs a member rather than the root record its own spec blocks" and "falls back to the root record only when its spec holds no other record"; M3 `memberQueue` dropping the `!isRootRecord` filter kills "falls back to the root record only ..."; M4 the fallback guard reduced to `if (exact !== undefined)` kills the same; M5 deleting the `explainEmptyQueue(tasks, spec, {})` call kills "falls back ..." and "says why a spec has no member to brief rather than printing nothing".
They cover the two exact-name routes and nothing else — every one of the five passes an exact id or an exact slug, so none reaches the fuzzy route, and the route that misses the guard is the one the original finding was filed about ("answered `no such task` with five near-misses fuzzy-matched on titles").
Regrade to met when `work-prompt audit-loop` redirects to the member the way `work-prompt audit-loop-costs-less` does, with a test that passes an inexact name.
