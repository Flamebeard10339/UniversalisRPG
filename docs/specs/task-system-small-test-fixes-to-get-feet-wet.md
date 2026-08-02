# task-system-small-test-fixes-to-get-feet-wet

## Deliverable

Amending a spec proof clause does not strand an existing undelivered task. A task created for an
unmet proof clause can still be matched, audited as met, and marked done after the clause has been
amended, without hand-editing the task store.

Extended after pass 1, by promotion rather than by plan: two findings the pass raised were promoted
onto this spec because both block the workflow the branch is exercising rather than merely improving
it. A finding that reaches triage with no evidence cannot be decided on, and triage is the limiting
step in this repository; a handoff that names another branch's plan misdirects the session it exists
to orient. Both are recorded here so the branch is audited against what it did, not against what it
set out to do.

Proof:

- [c1] A regression test covers this flow: create a spec with a proof clause, audit it as unmet, amend or reword the clause, audit the amended clause as met, then mark the undelivered task done.
- [c2] The implementation no longer depends only on exact clause text matching between an undelivered task and the current proof-clause prose.
- [c3] `npm test` and `npm run tasks -- doctor` pass. (This clause named `check --merge`, which no longer exists; `doctor` is the scan that replaced it. RG-L2.)
- [c4] A finding recorded by `tasks audit` can carry evidence alongside its deliverable, and the command refuses a finding that carries only one of the two, so no pass can produce a queue item triage cannot decide.
- [c5] `tasks handoff` never reports a Next: trailer written before the branch's first commit. On a branch carrying no trailer of its own it says so, and on the base branch, where there is no branch point to stop at, it walks recent history as before.

## Decisions

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-01

- base: `9c87fd37e63f7e6e3c032b00b118bb1f51c30d5c`
- head: `f56678dbf9f0403ae99488812616f6634f44a08e`
- proof 1: met — scripts/tasks.test.ts drives the whole flow through the CLI: audit clause 1 unmet, reword the [c1] line, spec amend, re-audit met, tasks done closes it. npm test green at 40 files / 717 tests. Reproduced by hand in a temp fixture via --store/--specs-dir; the task closed.
- proof 2: met — undeliveredDoneRefusal (scripts/tasks.ts:488-497) resolves the clause by task.clause id and reads no prose at all. Probed live: rewording a clause that keeps its [c1] tag leaves tasks done working, and deleting the clause refuses with "proof clause 1 is no longer in ..." rather than a text mismatch.
- proof 3: met — npm test 40 files / 717 tests passed; npx tsc --noEmit exit 0; npm run layer-check 454 imports, all downward; tasks check 171 tasks / 0 errors / 0 warnings. Before this pass the merge gate reported exactly one issue, "has no recorded audit pass", which this pass supplies.

### Pass 2 — 2026-08-01

- base: `9c87fd37e63f7e6e3c032b00b118bb1f51c30d5c`
- head: `0d48558d154aa63070d2f86e6ef564ec6888c1ea`
- proof 1: met — scripts/tasks.test.ts:741 drives the whole flow through the CLI: audit clause 1 unmet, reword the [c1] line, spec amend, re-audit met, tasks done closes it. Re-run this pass: npm test 40 files / 731 tests green, npx tsc --noEmit exit 0. Reproduced by hand in a temp fixture through --store/--specs-dir; the task closed.
- proof 2: met — undeliveredDoneRefusal (scripts/tasks.ts:503) resolves the clause through task.clause and reads no prose at all. Probed live: rewording a clause that keeps its [c1] tag leaves tasks done working, and deleting the clause refuses with proof clause 1 is no longer in ... rather than a text mismatch. Consequence measured and filed as a finding, not a defect of the clause: the undelivered task deliverable snapshot can now disagree with the clause it certifies.
- proof 3: met — npm test 40 files / 731 tests passed; npx tsc --noEmit exit 0; npm run layer-check 454 imports, all downward; tasks check 178 tasks / 0 errors / 0 warnings in 267ms. Before this pass the merge gate reported exactly two issues, clauses 4 and 5 having no verdict in pass 1, which this pass supplies.
- proof 4: met — All four combinations measured in a temp fixture. deliverable plus evidence records, and tasks show prints the evidence line. deliverable alone exits 1 with needs --evidence and records nothing: the spec file is byte-identical after the refusal and list --kind finding reports 0. evidence alone exits 1 with needs --deliverable. Two findings in one call each keep their own evidence. The interactive clause walk is untouched, since it records no findings. Genuinely checkable rather than a restatement of the diff, though the trailing claim over-reaches: tasks add --kind finding with no evidence is still accepted and tasks check stays green.
- proof 5: met — Measured in throwaway git repos. On a branch off main whose only commit carries no trailer, handoff prints no Next: trailer yet on this branch and never the previous branch trailer, including under a detached HEAD checkout. Branch-internal walk-back still finds a trailer one commit back. On the base branch itself the range is empty and the unscoped walk prints its trailer. Two gaps filed as findings rather than graded here: the never holds only while the base ref resolves, and the no-trailer message is asserted on a branch over 20 commits that does carry one. The clause is checkable, but it enumerates exactly the three branches of branchCommitRange and is silent on both places the code is weakest, which is the post-hoc smell.
