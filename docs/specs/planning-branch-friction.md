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

- `merge-ready` passes the spec and clauses legs for a branch that authored its spec as a plan for a
  later branch, and says which spec and why. The condition is derived from two facts and not
  declared anywhere: the spec file is absent from the base branch, so this branch wrote it, and
  every member of it is still `open`, so nothing here was ever worked against it. A member that is
  `in-progress`, `done` or `declined` is work done here and the branch owes the spec exactly as it
  did before. The answer lands in `standingLegs` beside the existing "this branch is working no
  spec, so it owes no clause" case (`mergeReady.ts:95`) and not in the `LEGS` loop, which
  `audit-loop-costs-less` clause 4 rewrites.
  proof: vitest scripts/tasks/mergeReady.test.ts "passes the spec and clauses legs for a branch that wrote its spec as a plan for a later branch"
  proof: vitest scripts/tasks/mergeReady.test.ts "reads a spec as a plan only when this branch wrote it and worked none of its members"

- `npm run tasks -- work-prompt <spec-slug>` briefs that spec's next unblocked member, naming the
  slug it resolved and the member it picked, and a spec with no member to brief is told why rather
  than answered with nothing. The queue is `fixNowQueue`, the same one `tasks next --spec <slug>`
  reads, and the explanation is `explainEmptyQueue`, the same one `tasks next` prints — a second
  answer to "which member is next" would be a second thing to keep in sync. An exact task id still
  wins outright, so the eleven specs carrying a root task of the same slug brief that record
  unchanged.
  proof: vitest scripts/tasks.test.ts "work-prompt takes the spec slug a dispatcher knows and briefs its next unblocked member"
  proof: vitest scripts/tasks.test.ts "work-prompt prefers an exact task id to a spec file of the same name"
  proof: vitest scripts/tasks.test.ts "work-prompt says why a spec has no member to brief rather than printing nothing"

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
