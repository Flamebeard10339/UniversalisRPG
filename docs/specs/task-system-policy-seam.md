# task-system-policy-seam

## Deliverable

The task system's rules live in one pure module that decides everything from
data it is handed. Effects — git, the filesystem, subprocesses — sit behind
adapters that the policy module never calls. `scripts/tasks.ts` shrinks to
argument parsing, dispatch and rendering. The merge gate becomes one question
the policy layer answers, not the place the answers live.

This is a structural fix, not a feature branch. It supersedes
`task-system-real-world-friction-spec`, absorbs the work that branch proved,
and removes the work that branch got wrong. Two independent audits of that
branch (`docs/audits/testing-procedure-2026-08-01.md` and
`docs/audits/testing-procedure-2026-08-02-pass2.md`) are the evidence base:
their findings are subsumed here rather than fixed there.

Proof:

- [c1] One module decides every gate rule from its arguments — store records,
  spec documents, git facts, proof results — and imports no `fs`,
  `child_process`, or `console`. `checkMergeGate` is one of its callers, not
  its owner. No gate rule is implemented in `scripts/tasks.ts`.
- [c2] Every git invocation under `scripts/` goes through `scripts/lib/git.ts`.
  No other module in `scripts/` spawns git, and that is enforced by a check
  rather than by convention.
- [c3] Proof-target execution is an adapter that batches targets by test file —
  one process per file, not one per target — and returns results as data the
  policy module consumes.
- [c4] `npm test` and every gate a PR must pass each complete in under five
  minutes of wall clock, measured and recorded in the audit evidence.
- [c5] Policy tests construct facts and assert issues with no repository, no
  subprocess and no filesystem. Real git and real subprocess behaviour is
  proven by a small, named set of adapter integration tests.
- [c6] Attaching or editing a `proof:` target is not deliverable drift, and
  this spec carries executable proof targets on its own clauses without the
  freeze reporting unaudited drift.
- [c7] The superseded branch's regressions are absent: `npm test` passes on a
  `main` checkout containing this work, no test resolves git state from the
  ambient repository, and the proof fixture helper cannot leave a file behind
  in `scripts/`.
- [c8] The merge gate cannot be defeated by renaming a branch or by adopting a
  spec without touching its file, and it does not fail open when git cannot
  resolve a base.
- [c9] An audit verdict is bound to the text it graded, not to a clause's
  position or tag: rewriting a clause's text retires its verdict, and a
  hand-written `[cN]` cannot inherit one.

## Decisions

### The policy layer is a new module, not a grown `mergeGate.ts`

`mergeGate` is one question the policy layer answers. Growing it would repeat
the mistake being fixed: pass 2 measured `mergeGate.ts` at 92 lines while
`staleAuditIssue`, `closedCommitIssues`, `runProofTarget`, `workingTreeOnlyIssues`,
`specIssues` and `mergeGateSpecCandidates` all lived in `scripts/tasks.ts`,
inline against git and the filesystem. The seam existed in name only.

### Effects are passed in as data; mocks live at the seam

The policy module takes facts, not ports it calls. That is why its tests need
no mocks at all — they construct the facts directly. Mocks and fakes appear
only in adapter tests, and real git/subprocess is exercised a handful of times
to prove the adapter, never once per case. This is the mechanism CLAUDE.md's
five-minute budget names.

### Branch from the superseded tip, then remove

Cutting from `task-system-real-world-friction-spec` inherits the proven work
without sixteen cherry-picks, and what that branch got wrong is a short list to
revert. Starting from `main` would mean re-landing good commits by hand.

### Proof targets are attached last

Pass 2 found that `c1` and `c4` of the superseded spec could not both be
satisfied: attaching a `proof:` line edits the deliverable, which the freeze
reports as unaudited drift. This spec therefore ships **no `proof:` lines until
Slice 5 lands the freeze exclusion**, then attaches them in Slice 6. Attaching
them earlier reproduces the contradiction on this branch.

### Identity is recorded, not positional

The whole `[cN]` tag-and-retirement machinery exists only because a verdict is
addressed by position. Pass 2 (A-H2) showed the consequence: a hand-written
`[c1]` on wholly rewritten clause text rides the old `met` verdict to
`0 issue(s)` in a fully committed workflow. An audit pass should record a hash
of the text it graded. Then a rewritten clause has no verdict because nothing
graded that text, tags stop carrying authority, and the retirement bookkeeping
becomes unnecessary rather than better-enforced.

### Bind a spec to a branch by recorded membership

Neither the branch name nor the branch's diff is a reliable binding — the name
loses to a rename, and the diff misses a branch that adopts a spec through
`tasks spec add` without touching the spec file. Store membership is the fact
that is actually recorded, and binding on it closes the rename hole and the
unresolvable-merge-base fail-open at the same time (C-H1 / C-H2 / A-M1, reached
independently by two auditors from opposite directions).

### Tests before implementation

By system rule for non-UI work, and this branch is not UI work. Policy
extraction is exactly the case where it pays: a pure function's test is written
before its body without friction.

### What this branch does not do

No new gates beyond the two that enforce the seams. CLAUDE.md's rule stands — a
gate earns its place by preventing something that actually happened — and both
`c1` and `c2` prevent defects with two audits' worth of evidence behind them.
Rendering extraction is bounded to moving output construction out of policy and
dispatch; it is not a UI project.

## Carried forward from the superseded branch

Proven by independent mutation testing in pass 2, and kept:

- the store serializer — unknown-field preservation with a type-level
  exhaustiveness guarantee; byte-stable, idempotent, bidirectionally compatible
- the store error boundary — all nine store-reading commands report `path:line`
  instead of stack-tracing
- `scripts/lib/git.ts` as a seam (to be completed under `c2`; 14 call sites
  still bypass it)
- the vitest JSON proof runner, which replaced stdout scraping
- `staleAuditIssue` scoped to code outside the audit-record set
- fenced code blocks excluded from `Proof:` clause scanning
- the closing-commit work: `done` stores `null` rather than a commit that
  closed nothing, and `show` derives the closer from history
- the freeze baseline engaging on first audit
- `audit-prompt`'s nine required elements
- the commit contract: mandatory body, optional `Next:`, repo-local `tsx`

## Removed or redone

- the eighteen `proof:` targets attached to the superseded spec — two of them
  proved nothing (`c3`'s survived all four mutations it claimed to catch;
  `c8`'s `command npm test` survived every mutation that falsified its clause)
  and the set made `check --merge` take 16m52s
- the `Diff range` assertion that resolves against the ambient repository and
  fails on a `main` checkout
- `vitestFixtureFile` writing a deliberately-failing test into `scripts/lib/`
- the diff-based spec binding, which fails open when git cannot resolve a base
  and misses a branch that adopts a spec via `tasks spec add` without touching
  the spec file

## Subsumed findings

Closed by this spec's clauses: pass 1 M3, M4, M5, M6, M13; pass 2 A-H1, A-H2,
A-M1, A-M3, A-M4, B-H1, B-H2, B-M1, B-M2, B-M3, B-M4, C-H1, C-H2, C-H3, C-H4,
C-M1, C-M2, C-M4, C-M6.

Not dissolved by any structure, and inherited as authoring discipline rather
than fixed by code: A-H1 (a proof target that survives the mutation of its own
clause), B-M2 and B-M3 (targets that assert an incidental string rather than
the clause's behaviour). Slice 6's attach-only-if-it-dies rule is the whole
mechanism, and it has already failed once — treat a surviving target as a
finding, not as a target to reword until it passes.

Deliberately deferred, and to be triaged rather than assumed: pass 1 M10, M11,
M12, M15, M16, M17 and the low findings of both passes. `tasks spec add`'s
pass-2 guard (B-M5) is a policy question for triage, not a refactor task.

## Implementation Slices

### Slice 1 — Extract the policy core

Files to read first: `scripts/tasks.ts`, `scripts/lib/mergeGate.ts`,
`scripts/lib/taskStore.ts`, `scripts/lib/specDoc.ts`.

- Define the fact types the rules need: store records, parsed spec document,
  git facts (head, merge base, changed paths, ancestry), proof results.
- Move every gate rule into the new module as a pure function over those facts.
  Named starting set: `staleAuditIssue`, `closedCommitIssues`,
  `workingTreeOnlyIssues`, `specIssues`, spec-candidate resolution, and the
  clause/freeze rules currently split between `specDoc.ts` and `tasks.ts`.
- `checkMergeGate` becomes a caller that assembles facts and asks the module.
- Enforce the no-effects rule with a check (`c1`).

Acceptance: every rule has a test that constructs facts directly and runs
without a repository. Deleting any rule from the module fails a named test.

### Slice 2 — Complete the git seam

- Route the 14 remaining direct git/subprocess call sites through
  `scripts/lib/git.ts`; give it one documented failure behaviour.
- Distinguish "git could not answer" from "the answer is empty" — pass 2 found
  an unresolvable merge base is currently indistinguishable from "the diff
  touches no spec", which makes the gate fail open (`c8`).
- Replace name-based and diff-based spec resolution with binding on recorded
  store membership (`c8`). Delete both inference paths rather than layering a
  third on top of them.
- Enforce single-seam access with a check (`c2`).

### Slice 3 — Proof execution adapter

- Batch targets by test file; one process per file (`c3`).
- Return structured results; the policy module decides pass/fail from data.
- Keep the four distinguished outcomes: file missing, no test matched, matched
  but skipped, matched and failed. Zero matches must fail.

### Slice 4 — Rendering seam

- Move output construction out of dispatch and policy. 218 `console` sites in
  `scripts/tasks.ts` is the measure to reduce.
- `scripts/tasks.ts` keeps argument parsing, dispatch, and calls to render.

### Slice 5 — Regressions, freeze exclusion, and budget

- Freeze comparison runs over the parsed model — `clause.text` against
  `clause.proofTargets`, which the parser already separates — instead of over
  rendered `## Deliverable` markdown. Attaching a target then cannot read as
  prose drift (`c6`).
- An audit pass records a hash of the clause text it graded, and a verdict
  applies only to matching text (`c9`). Retire the clause-id retirement
  bookkeeping this replaces rather than keeping both.
- Fix the ambient-repo test coupling; `npm test` must pass on a `main`
  checkout containing this work (`c7`).
- Move the proof fixture out of `scripts/` and make leakage impossible.
- Measure and record `npm test` and each PR gate against the five-minute
  budget (`c4`).

### Slice 6 — Attach proof targets and audit

- Attach a `proof:` target to each clause of this spec — and for each, mutate
  the promised behaviour and confirm the named target dies. A target that
  survives is not attached; the clause is left untargeted and that is recorded.
- Commission an independent audit through `tasks audit-prompt`.

## Open questions

1. **Do `proof: command` targets survive at all?** Both passes confirmed
   `check --merge` shell-executes a command from a PR-authored spec file in CI,
   and pass 2 demonstrated a working side effect. Options: drop `command`
   targets and support only vitest targets; allow them but never execute them
   in CI; or allow only an allowlisted set. This needs a decision before
   Slice 3.
2. **Does the five-minute budget belong in CI as a failing check**, or as a
   measurement recorded in audit evidence? CLAUDE.md resists new gates, and a
   timing gate is flaky by nature on shared runners.
