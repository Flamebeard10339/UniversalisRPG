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
