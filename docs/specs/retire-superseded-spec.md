# retire-superseded-spec

Found by running `tasks handoff` on `main` immediately after the
`task-system-policy-seam` merge: a cold session on `main` opens to five unmet
clauses describing `tasks check --merge`, a command that no longer exists.

## Deliverable

A superseded spec stops being what a cold session reads, and stops carrying
promises about machinery that was deleted on purpose.

Two independent halves. The first fixes today's record; the second fixes the rule,
so the next spec to be retired cannot do this again while it is mid-retirement.

Proof:

- [c1] Every open member of `task-system-real-world-friction-spec` is closed, each
  against evidence gathered from the tree rather than from the clause's own
  wording. A clause whose subject this repository deleted is `declined` with that
  as the stated reason — a retracted promise, not a discharged one. A clause the
  work actually delivered is `done`, and the evidence names where.
  proof: command npm run tasks -- list --spec task-system-real-world-friction-spec --state open
- [c2] `main` never infers a spec from the store. The inference is a resume aid
  for a working branch whose name has drifted from its spec file; `main` is never
  working a spec, so every answer it could give there is a guess about a branch
  the caller is not on. The branch-name route and an explicit `--spec` are
  unaffected on every branch, `main` included.
  proof: vitest scripts/tasks.test.ts "does not infer a spec from the store on the default branch"
- [c3] The two halves stay independent. Closing the members is owed whether or
  not anything reads them, and the rule change protects the next retirement
  whether or not today's members are closed — neither is the other's fix, and a
  test proves the rule holds on a store where a superseded spec still has open
  members.

## Audit passes

### Pass 1 — 2026-08-03

- base: `354be57726f70e6d3070d7b3bb913e14a16b55a9`
- head: `9107d4cc2e707a5321ba3ee7785be88e1bb04de3`
- proof 1: met — Verified live: tasks list --spec task-system-real-world-friction-spec --state open returns 0 records. All five were closed against evidence gathered from the tree rather than the clause text - c2's three conjuncts checked at tasks.ts:200/:230/:546 and closedCommit on 28 records, c5's seven elements by running audit-prompt, c8's runner/tsconfig/52s-suite measured. c1 and c4 declined with the deletion that voided them named by commit.
- proof 2: met — Written test-first and mutation-verified. Red for the right reason before the guard existed ('expected ... not to contain spec inferred from the store'); green after; red again when the guard is deleted. The test asserts the same store still infers under branch name 'orphaned-branch', so what changed is the rule for main and not the inference. A second test pins --spec still working on main. Confirmed against the real store: handoff --branch main now reports 'spec: none'.
- proof 3: met — Structural, and asserted by construction: the c2 test builds a store where demo-spec HAS an open member and still expects no inference on main, so the rule holds independently of whether any spec has been retired. Conversely the five members were closed on their own evidence, none of it referencing the inference rule. Neither half is the other's fix.
