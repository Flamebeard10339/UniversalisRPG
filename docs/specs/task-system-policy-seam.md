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
- [c3] A proof target names one or more tests and nothing else — no target
  executes a shell command. Execution is an adapter that batches targets by
  test file, one process per file rather than one per target, and returns
  results as data the policy module consumes.
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
- [c10] No command answers a question it did not understand. An unrecognised
  flag is an error naming the flag; `--help` prints usage and exits 0 on every
  command and subcommand; and the questions a planner asks — what is blocked,
  what is in flight, what is next — are each one command whose output fits on a
  screen.

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
U8 lands the freeze exclusion**, then attaches them in U9. Attaching
them earlier reproduces the contradiction on this branch.

### A proof target is a test, written before the implementation

`proof: command <shell>` is removed, not guarded. A clause names a list of
tests, and those tests are the ones the repo's tests-before-implementation rule
already requires a worker to write first. Two consequences fall out for free:
the CI shell-execution path both audits demonstrated ceases to exist rather
than being sandboxed or allowlisted, and a clause's proof stops being something
assembled afterwards to satisfy a gate.

It also kills the aggregate target honestly. `command npm test` survived every
mutation that falsified its own clause, because "the suite passes" is not
evidence for any particular promise. A clause whose proof is genuinely "the
standard gates pass" gets no target and is verified by a human — which is what
the untargeted-clause callout is for.

### The five-minute budget is measured, not gated

Recorded in audit evidence, not enforced by a failing CI check. CLAUDE.md
resists new gates, a timing gate is flaky on shared runners, and the number is
useful as a trend long before it is useful as a threshold. Revisit if a
measurement ever regresses without anyone noticing.

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

### Cut the work by command family, not by layer

Measured on 2026-08-02 and recorded in
`.planning/orchestrator-measurement-2026-08-02.md`: the policy rules live in
roughly lines 89–530 and 907–920 of `scripts/tasks.ts`, the git call sites span
89–1440, and the 218 `console.` sites are spread evenly across all 2139 lines.
A policy slice, a git slice and a rendering slice are therefore not three
changes to one file — they are one change, which
`.planning/agent-swarm-theory.md` names outright: chunks touching one file are
not independent, parallel or sequential. Sequenced by layer, the rendering pass
rewrites the output of every pass already audited.

Cutting by command family instead gives each unit a contiguous, disjoint region
and lets it take that region's policy, git and output in one pass. What the
families would otherwise collide over — the fact types and the shared printers —
is pinned by a scaffold unit before any family starts.

### `c10` is scope, not creep

This is a structural spec and argument parsing is a feature. It is in anyway,
for two reasons. It is the most direct failure of the thing the tool exists
for: `tasks list --blocked` prints all 87 tasks and exits 0, because flag names
are unvalidated while flag values are validated. And `parseArgs` is what the
dispatch/policy split rewrites regardless, so holding it back means editing the
same function twice in two units.

The other two measured defects — every read printing its whole record, and
`check` warning about other branches' specs — are filed
(`task-system-read-cost`, `tasks-check-reports-freeze-warnings-for-specs-belonging-to-o`)
and are not members of this spec.

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
the clause's behaviour). U9's attach-only-if-it-dies rule is the whole
mechanism, and it has already failed once — treat a surviving target as a
finding, not as a target to reword until it passes.

Deliberately deferred, and to be triaged rather than assumed: pass 1 M10, M11,
M12, M15, M16, M17 and the low findings of both passes. `tasks spec add`'s
pass-2 guard (B-M5) is a policy question for triage, not a refactor task.

## Implementation units

Re-cut on 2026-08-02 from six layer-shaped slices to nine units, after
measurement showed the layer cut handed three units the same 2139-line file.
The work is the same work; only its boundaries and its order changed. Where an
audit record or a store task cites an old slice number, the mapping is: old 0 →
U1, old 5's regressions → U0, old 1 → U2 and U3–U6, old 2 → U7, old 3 → U4's
share of U2's scaffold plus U5, old 4 → distributed into U3–U6, old 5's
remainder → U8, old 6 → U9.

### U0 — Remove the two inherited regressions

Both are live, both are in `scripts/tasks.test.ts`, nothing depends on them,
and together they are why `npm test` fails on a `main` checkout containing this
work. The old plan scheduled them fifth while also saying "until it lands, do
not merge". They go first.

- The `Diff range` assertion resolves against the ambient repository, because
  `fixture` runs the CLI with `cwd: repoRoot`. Move it to a `gitFixture`-based
  test with a controlled repo; do not weaken M9's protection to decouple it.
- `vitestFixtureFile` writes `scripts/lib/__proof_fixture_*.test.ts` containing
  a deliberately failing test. An interrupted run leaves the suite permanently
  red inside a source directory. Move it out of `scripts/`, make a leak unable
  to fail `npm test`, and sweep a previous leak before reusing the fixture.

Acceptance: no test asserts anything about the ambient repository's git state; a
hand-placed leaked fixture leaves `npm test` green; the five proof-target tests
still distinguish file-missing, no-match, matched-but-skipped and
matched-and-failed.

### U1 — Reconcile inherited state

Four things carried in from the superseded branch. None is refactor work, and
each will be silently forgotten if it is not done before the refactor starts.

- The store points **12** records at `task-system-real-world-friction-spec`, 5
  of them still open or unreviewed — not the 36 + 5 this slice originally
  claimed. Establish first whether the rest of the pass-1 findings were filed
  without a `spec` field or were never filed at all; the answer sets the size of
  everything below. Then walk them: close what the inherited commits actually
  closed, naming the commit; re-point what this spec subsumes; triage the rest.
  `tasks next` is not usable until the store's answer is true.
- The store holds 229 records, of which 82 of the 87 open-or-unreviewed carry
  no spec at all, and this spec has zero members. A planner asking `tasks next`
  on this branch is told there is nothing to do while nine units of work wait.
- Pass-2 findings were never recorded as tasks — they exist only in
  `docs/audits/testing-procedure-2026-08-02-pass2.md`. The deferred list under
  `## Subsumed findings` must be triaged into the store rather than assumed
  handled.
- **Verify this spec's subsumption mapping before trusting it.** It was written
  by hand from audit summaries and has already been wrong once: `c9` exists
  because a finding was listed as subsumed while no clause covered it. Check
  each cited label against the archive and correct the list.
- This branch **inherits both regressions live**, not merely as history: the
  `Diff range` assertion that resolves against the ambient repository, and
  `vitestFixtureFile` writing into `scripts/lib/`. `npm test` fails on a `main`
  checkout containing this branch today. U0 removes them; until it lands,
  do not merge.

Acceptance: the store's answer to "what is open in this system" matches the two
audit records, and every claim in `## Subsumed findings` is checked.

### U2 — Scaffold: pin the fact types and the shared printers

The one unit every later unit depends on, and the reason they can then proceed
without colliding. It defines shape and moves almost nothing.

Files to read first: `scripts/tasks.ts`, `scripts/lib/mergeGate.ts`,
`scripts/lib/taskStore.ts`, `scripts/lib/specDoc.ts`.

- Create the policy module. Define the fact types the rules need: store records,
  parsed spec document, git facts (head, merge base, changed paths, ancestry,
  and whether git could answer at all), proof results.
- Move the shared printers — `printTask`, `printTaskConcise`, `preview`,
  `wrapText`, `truncateLine`, `printEvidence` — into a render module, returning
  strings instead of calling `console`. These are what U3–U6 would otherwise
  each rewrite.
- Move exactly one rule end to end as the worked example. `closedCommitIssues`
  is already pure over tasks and is the cheapest to carry.
- Enforce the no-effects rule with a check, scoped to the policy module (`c1`).

Acceptance: the example rule has a test that constructs facts directly and runs
with no repository, no subprocess and no filesystem. The check fails if the
policy module imports `fs`, `child_process` or `console`.

### U3 — Gate and check family

`cmdCheck` and every rule it reaches: `dirtyStoreIssue`, `workingTreeOnlyIssues`,
`specIssues`, `staleAuditIssue`, `nonAuditRecordChanges`, `auditRecordPaths`,
`resolveActiveSpec`, `mergeGateSpecCandidates`, `deliverableAtMergeBase`. Roughly
lines 89–530. This is the c1/c8 core and the largest single region.

- Each rule becomes a pure function over U2's facts; `checkMergeGate` becomes a
  caller that assembles facts and asks the module.
- No gate rule remains in `scripts/tasks.ts`.

Acceptance: every rule has a test that constructs facts directly and runs
without a repository. Deleting any rule from the module fails a named test.

### U4 — Task lifecycle family

`add`, `edit`, `show`, `search`, `list`, `next`, `start`, `stop`, `done`,
`decline`, and their helpers `storeStateAt`, `deriveClosingCommit`,
`undeliveredDoneRefusal`, `validateContentFields`, `runList`, `matchingFields`.
Roughly lines 531–1006.

- Take this family's policy, git and output in one pass against U2's shapes.
- Land `c10` here: validate flag names per command, route `--help` to usage.
  This family is where the planner's three questions are answered, so it is
  where `--blocked` must either work or say it is not a flag.

### U5 — Spec family

`spec new|add|remove|show|done|amend|freeze`, `specMembers`, `SPEC_SCAFFOLD`.
Roughly lines 1007–1316.

### U6 — Audit family

`audit`, `audit-prompt`, `import`, `triage`, `handoff`, and the git helpers
`resolveDiffRange` and `diffChangedFiles`. Roughly lines 1317–2139.

### U7 — Complete the git seam and fix the binding

Deliberately after U3–U6, because those units concentrate the call sites this
one closes over.

- Route every remaining direct git/subprocess call site through
  `scripts/lib/git.ts`; give it one documented failure behaviour.
- Distinguish "git could not answer" from "the answer is empty" — pass 2 found
  an unresolvable merge base is currently indistinguishable from "the diff
  touches no spec", which makes the gate fail open (`c8`).
- Replace name-based and diff-based spec resolution with binding on recorded
  store membership (`c8`). Delete both inference paths rather than layering a
  third on top of them. This is also what makes `tasks check --merge` answerable
  on this branch at all: its diff necessarily touches two spec files, so the
  diff binding refuses by default today.
- Enforce single-seam access with a check (`c2`).

### U8 — Proof adapter, identity, freeze, and budget

- Delete `proof: command` parsing and execution. A target names tests only.
- Allow a clause to name several tests; batch by test file, one process per file
  (`c3`). Return structured results; the policy module decides pass/fail.
- Keep the four distinguished outcomes: file missing, no test matched, matched
  but skipped, matched and failed. Zero matches must fail.
- Freeze comparison runs over the parsed model — `clause.text` against
  `clause.proofTargets`, which the parser already separates — instead of over
  rendered `## Deliverable` markdown. Attaching a target then cannot read as
  prose drift (`c6`).
- An audit pass records a hash of the clause text it graded, and a verdict
  applies only to matching text (`c9`). Retire the clause-id retirement
  bookkeeping this replaces rather than keeping both.
- Measure and record `npm test` and each PR gate against the five-minute
  budget (`c4`).

### U9 — Attach proof targets and audit

- Attach a `proof:` target to each clause of this spec — and for each, mutate
  the promised behaviour and confirm the named target dies. A target that
  survives is not attached; the clause is left untargeted and that is recorded.
- Commission an independent audit through `tasks audit-prompt`, and a second
  auditor whose only question is whether anything is worse than before U0.

## Open questions

None. Both are answered in Decisions: `proof: command` is removed rather than
guarded, and the five-minute budget is a recorded measurement rather than a
gate.
