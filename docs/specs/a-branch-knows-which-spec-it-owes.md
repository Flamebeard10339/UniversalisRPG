# a-branch-knows-which-spec-it-owes

## Deliverable

`merge-ready` grades the spec it infers, so a wrong inference grades the wrong contract — and with
three branches in flight, the wrong one is likely to be another live branch's rather than nothing.
The author reports it is wrong about half the time. This branch is the third pass, and the record
asked for the remaining error to be characterised before it is fixed. It has been, by reproduction
rather than estimate.

**The bug.** `authoredAsPlan(members, onBaseBranch)` returns `onBaseBranch === false && members.length
> 0 && members.every(open)`. `onBaseBranch` is `git.fileAt(baseBranch, specFile(spec)) !== null` — it
asks whether the spec **file is absent from main**. A respec edits a file that already exists. So
every planning branch that revises an existing spec is misread as owing it.

Reproduced live on `claude/spec-unspecced-tasks-e4a0d9`, 2026-08-06: the branch respec'd
`offline-progression`, whose file was already on main. `merge-ready` correctly identified
`dsl-kind-prints-fields` as a plan — its file is new — then reached past it, graded
`offline-progression`, and failed the `spec` and `clauses` legs demanding an audit of work nobody
did. The merge went ahead over the top of it, which is the outcome a gate that cries wolf always
produces.

**Why it is as frequent as half.** `specsWrittenFromBranch` returns *every* spec the branch wrote any
store event against, and `specToGrade` picks the first candidate that is not a plan. A planning
session that touches thirteen specs offers thirteen candidates, and a single misclassification
anywhere in that list hijacks the gate. The error rate therefore rises with how productive the
planning session was, which is the worst possible direction.

**The fix is to ask a different question.** Not "did this file exist on main" but "did this branch
author these clauses, or work against them" — and the parsed clause list answers it, because
`appendAuditPass` never touches `## Deliverable`. A worker branch appending passes leaves the clause
list identical; a planning branch's clause list differs. Combined with the existing
`members.every(open)` test, which is already right and stays, the two together separate the cases
that matter:

| branch | clauses vs base | members | verdict |
| ------ | --------------- | ------- | ------- |
| writes a new spec for later | file absent — differs | all open | plan |
| **respecs an existing spec** | **differs** | **all open** | **plan — the case that is broken today** |
| works a spec, appends audit passes | identical | in-progress or done | owes |
| works a spec and amends a clause | differs | in-progress or done | owes — `members.every(open)` catches it |

That last row is the interaction with `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal`, which
makes amending a clause mid-branch legitimate. Without the members test, a worker that deferred a
clause would flip to "author" and exempt itself from the gate — the fix for one task opening a hole
in the other. Both tests are load-bearing; neither is sufficient alone.

Proof:

- [c1] Authorship is decided by clauses, not by the file. A spec whose parsed clause list differs
  between base and head was authored here; one whose clauses are identical and which only gained
  audit passes is owed. The comparison is over parsed clauses, not file bytes, so appending a pass is
  not mistaken for authorship.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c2] A respec is a plan. The reproduction above is pinned as a test: a spec whose file exists on
  base, whose clauses this branch rewrote, and whose members are all open, is not graded as a
  contract this branch owes.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c3] A worker that amends its own clause still owes its spec. A branch with any member
  `in-progress` or `done` owes the spec whatever it did to the clause text, so clause deferral cannot
  become an exemption from the gate that would have caught the deferral.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c4] One misclassification cannot hijack the rest. A branch offering many candidates is graded such
  that a single wrong answer costs at most that spec — the failure mode that makes the current error
  rate scale with how many specs a planning session wrote.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c5] The gate says how it decided. It already names which spec it graded and how it got there; that
  survives and now states the authorship evidence, so a disagreement is readable from the output
  rather than requiring the reader to re-derive the inference.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c6] A git question that cannot be asked still reads as "not shown to be a plan". The existing
  polarity — `onBaseBranch` null means no answer, and a gate whose exemption widens when its evidence
  disappears is the wrong way round — survives the change of question.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c7] A branch that merely *touched* a spec neither authored nor owes it. `specsWrittenFromBranch`
  builds its candidates from store events carrying a spec field, so recording a note against a spec
  is today enough to be asked to audit it — and if that spec's work is deliberately scheduled for
  later, its open member makes the demand permanent. Authorship and debt are not exhaustive: the
  third state is having left no work behind, and the discriminator is whether this branch's diff
  touched the spec's write regions at all.
  proof: vitest scripts/tasks/mergeReady.test.ts

## Decisions

- **Clause identity, not file identity.** The file-existence test is not a heuristic that needs
  tuning; it asks the wrong question, and no threshold on it would be right. Clause identity is
  available, cheap, and already parsed — `parseSpecDoc` and `git.fileAt` both exist and are both
  already called on this path.
- **Both tests, not either.** `members.every(open)` is already correct and is kept, not replaced. The
  fix is to swap the half that is wrong, and the table above is the argument that each half catches a
  case the other does not.
- **No new field, and nothing recorded to be kept in sync.** The answer is derived from the spec file
  and the store, both of which already exist and both of which are already read on this path. A
  branch that had to declare which spec it owes would be a second copy of a fact, and the first thing
  to drift.
- **Third pass, and the prior art is respected.** `spec-and-read-verbs-scope` narrowed inference to
  where a spec is used and named the near miss; `no-store-inference-on-main` stopped main inferring
  from the store. Neither is undone here. This changes one predicate inside the narrowing they built.
- **Ordered against clause deferral by grant, not by dependency.** This branch and
  `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal` were serialised on a forecast grant naming
  `specDoc.ts`, which this work does not touch — `grep` for `branch` or `infer` over that file
  returns nothing, and every inference lives in `mergeReady.ts` and `context.ts`. They run
  concurrently. c3 is where they meet, and it exists so that the later of the two cannot silently
  undo the other.
- **`mergeReady.ts` is shared with that branch, deliberately and by region.** Its c7 needs the
  `clauses` leg to name the deferrals it now passes over; this branch rewrites `authoredAsPlan` and
  `decideSpec`. Different functions in one file, which merge cleanly — measured on this repository,
  two edits to different regions of one file merged with no conflict. Neither branch touches the
  other's function, and this note exists in both specs so neither worker treats the other's presence
  as a surprise or a reason to widen its own grant.

## Open questions

- Whether "the clauses differ" means the clause *text* differs or the set of clause *ids* differs.
  Text is stricter and would count a typo fix as authorship; ids are looser and would miss a rewrite
  in place. The worker decides from how `stampClauseIds` already binds identity, and records which.
- Whether `specToGrade` should still pick a single spec to grade or report per-spec standings. c4
  fixes the blast radius either way, but the second shape may make c5's explanation simpler and is
  worth the worker's judgement once the region is read.

## Audit passes

### Pass 1 — 2026-08-06

- base: `a49a9b614c6cff533de973d9bceb9d18c4d42e94`
- head: `0c2828188a5c1073c95c4b285fcdbad0efb36983`
- proof 1: met — clauseIdsDiffer (mergeReady.ts) compares id sets, not text, exactly as the clause requires: the vitest suite's "clauseIdsDiffer" describe block asserts a wording-only edit under the same id reads as identical, an added or reordered id reads as differing, and an absent base parses as an empty set that differs from any real deliverable. The real-repository describe block "specClausesDiffer and changedFiles" reproduces this against actual git history: a committed respec that adds [c3] is read as differing, and an appended "## Audit passes" section with the deliverable untouched is read as identical. Mutation-verified: forcing clauseIdsDiffer's return to always false killed the suite at scripts/tasks/mergeReady.test.ts scope (4 of 42 failing), so the id-set comparison is watched rather than merely present.
- proof 2: met — The exact reproduction named in the spec (a respec of a file that already exists on base) is pinned in the real-repository test "reads a respec as a differing clause set (c2)", which commits a spec on main, checks out a branch, adds a clause, and asserts specClausesDiffer reports true — feeding into authoredAsPlan's "differs && all open" rule so it now reads as a plan rather than a debt, which is the bug this branch exists to fix. Mutation-verified: dropping the clausesDiffer===true half of authoredAsPlan's condition (leaving only members.length>0 && every open) killed 1 of 42 tests at scripts/tasks/mergeReady.test.ts scope, the authoredAsPlan test that pins false when clauses are identical to base.
- proof 3: met — The authoredAsPlan describe block loops every non-open state (in-progress, done, declined, unreviewed) paired with one open member and clausesDiffer=true, asserting the result is false in every case — a worker who amended a clause while any member left the open state still owes the spec. Mutation-verified: removing members.every(open) from authoredAsPlan's return (leaving only clausesDiffer===true && members.length>0) killed 1 of 42 tests at scripts/tasks/mergeReady.test.ts scope — the c3 loop in the authoredAsPlan describe block is what catches it, confirming this half is still load-bearing exactly as the sibling-branch interaction the spec describes requires.
- proof 4: met — decideSpec's "a single wrong classification costs only that spec, not the one behind it" test pins the case directly: with plan-for-later misclassified as owed, real-work behind it is still graded once isPlan is corrected, and specToGrade's own tests show a wrong-first-candidate list still finds the owed one behind it. Mutation-verified: replacing specToGrade's find(!authoredAsPlan) with an unconditional candidates[0] killed 4 of 42 tests at scripts/tasks/mergeReady.test.ts scope, including the c4 blast-radius test and specToGrade's own "grades a spec the branch owes ahead of a plan" test.
- proof 5: met — decideSpec's "names the untouched reason distinctly from the plan reason" test asserts the specNote says a candidate "was not shown to be touched by this branch's diff" and does not say "is a plan this branch wrote" when the two reasons differ, so a reader can tell an untouched-spec skip from a plan skip without re-deriving the inference. Mutation-verified: collapsing the activeReason ternary to always report the plan wording killed 1 of 42 tests at scripts/tasks/mergeReady.test.ts scope, that same test.
- proof 6: met — Both ends of the polarity are pinned: authoredAsPlan's own test asserts clausesDiffer=null returns false (git could not be asked, so the exemption does not widen), and the real-repository test "is null when git cannot answer at all, rather than guessing (c6)" points specClausesDiffer at an unresolvable base branch name and asserts it returns null rather than guessing true or false. Mutation-verified: deleting the `if (baseHead === null) return null` guard from specClausesDiffer killed 1 of 42 tests at scripts/tasks/mergeReady.test.ts scope, that same real-repository test.
- proof 7: met — decideSpec's "drops a spec this branch never touched, and grades nothing else it has" test reproduces the exact regression named in the spec's own decision log (docs/events.jsonl, 2026-08-06 17:22:06Z on claude/spec-orchestration-corpus): a branch that only recorded a --spec note against a spec with an open member and an unchanged file is now dropped before grading rather than offered as a candidate to audit. diffTouchesRegion's own describe block covers exact-match, directory-containment, no-overlap and the null-diff fail-open case. Mutation-verified: forcing diffTouchesRegion to always return true killed 1 of 42 tests at scripts/tasks/mergeReady.test.ts scope, the "is false when nothing changed falls inside any region" case. I additionally re-ran the concrete note-only-branch scenario from the events.jsonl entry directly against specClausesDiffer/diffTouchesRegion outside the suite and confirmed the note-only spec is now excluded. See the two findings below for where this same touched-region idea still overshoots or undershoots on cases the clause itself does not cover.
