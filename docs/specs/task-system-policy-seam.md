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
  ambient repository, and a proof fixture left behind by an interrupted run
  cannot fail `npm test`.
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

### Targets are attached before the baseline, and proved after the implementation

Pass 2 found that `c1` and `c4` of the superseded spec could not both be
satisfied: attaching a `proof:` line edits the deliverable, which the freeze
reports as unaudited drift. The original response was to attach nothing until
U8 landed a freeze exclusion. That gets the ordering backwards — the
contradiction only bites when a baseline already exists to drift *from*. This
spec has no baseline and no recorded pass, so attaching targets in U2 and
freezing afterwards dissolves it by sequence rather than by machinery.

The two halves of a target therefore land at different times. Attachment is
early, because the test is how the clause is written down. **Proof is late,
because a target cannot be mutation-tested until there is an implementation to
mutate.** A red test says only that it can fail; it does not say it fails for
the right reason. Both of the surviving weak proofs from the superseded branch
pass a clean red-green cycle — `expect(activeAction).toBeDefined()` is red
before the feature and green after, and discharges nothing.

`c6` stays load-bearing rather than becoming unnecessary: the audit pass edits
targets, and by then the baseline exists.

### TDD is offered to a planner, not imposed on one

A clause backed by a test needs no prose restating it — the test is the
statement. But a planner who wants prose gets prose, and a clause that resists
codification stays prose rather than being forced into a weak assertion for the
sake of uniformity. `c4` is a measurement and `c7` defeated an attempt at
codification within this branch; neither is a defect.

Nor is the clause set a ceiling on testing. A worker that judges its unit needs
coverage the clauses do not name should write it. The clause tests are the
branch's contract, not its test plan, and nobody planning a unit from outside
knows what it will need to be robust.

**The audit is where prose becomes tests.** By then mutation testing has
established which assertion actually discharges which promise, which is exactly
the knowledge that was missing when the clause was first written. A prose clause
that survives to the audit with a mutation-proved test available should be
promoted; that is a strictly more readable and more rigorous statement of the
same promise, and it is the one moment in the branch when it can be written
with evidence rather than intention.

### A proof target is a test, not a shell command

`proof: command <shell>` is removed, not guarded. A clause names a list of
tests. Two consequences fall out for free: the CI shell-execution path both
audits demonstrated ceases to exist rather than being sandboxed or allowlisted,
and a clause's proof stops being something assembled afterwards to satisfy a
gate.

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

### Tests before implementation, at two different altitudes

The clause tests in U2 are the branch's contract, written once by the planner.
Separately, a worker writes its own unit's tests before its body — the system
rule for non-UI work, and this branch is not UI work. Policy extraction is
exactly where it pays: a pure function's test is written before its body
without friction.

The two are not the same discipline and neither substitutes for the other. A
green unit suite says the worker built what it set out to build; a green clause
suite says the branch kept its promise.

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

Checked label by label against both archives under U1. Every finding below is
also a store record, so this section is a reader's index rather than the
system of record — `tasks list --spec task-system-policy-seam` is.

Closed by a clause of this spec, with the clause named:

| finding | clause |
|---|---|
| pass 1 M5, pass 2 A-H2 — a hand-written `[cN]` inherits a retired `met` verdict | c9 |
| pass 1 M6, pass 2 A-M4 — `check --merge` shell-executes a command from the PR's own tree | c3 |
| pass 1 M13, pass 2 C-M5 — no git seam; the duplication survived and grew | c2 |
| pass 1 M11 — the wall-clock measurement was never recorded | c4 |
| pass 1 M12, pass 1 L4, pass 2 B-L2, pass 2 C-L1 — no command-specific help; unvalidated flags; `next`'s concise form answers nothing | c10 |
| pass 2 A-M1, C-H1, C-H2, C-M4 — rename, adoption without touching the spec file, unresolvable merge base, and the two-spec refusal that the diff binding forced | c8 |
| pass 2 A-M3, B-M1, C-M2 — one vitest process per target, 16–25 minutes in CI | c3, measured under c4 |
| pass 2 B-H1 — the aggregate `command` target proves none of its clause's promises | c3 |
| pass 2 B-H2, C-M1 — attaching a target reads as unaudited deliverable drift | c6 |
| pass 2 B-M4, C-H3 — the leaked proof fixture and the ambient diff-range assertion | c7 |
| pass 2 C-M6 — `scripts/tasks.ts` is 2 139 lines and the seam is not where the policy is | c1 |

**Six labels the previous version of this list claimed and no clause covers.**
Each is now an open store record instead of a claim:

- **pass 1 M3 and M4, pass 2 A-H1** — that nothing proves `in-progress` is not
  treated as complete, and that both `stop` guards are untested. c1 and c5
  relocate these rules and make them testable without a repository; neither
  promises the cases exist. A-H1 was listed as subsumed *and* as not-dissolved
  in the same section, which cannot both be true — pass 2 says outright that it
  does not dissolve.
- **pass 2 B-M2 and B-M3** — targets that assert an incidental string. Same
  double listing, same resolution: they are authoring discipline, and U9 is the
  only mechanism.
- **pass 2 C-H4** — 188 comment lines, several forbidden by name. c1 removes the
  cause by giving policy a home; nothing in the clause set requires the comments
  already in the tree to go, and they are still there at `28d56cd`.

**Two labels the previous version listed neither as subsumed nor as deferred.**
Both are open records with no spec:

- **pass 2 A-M2** — the freeze baseline does not exist for most shipped specs,
  so the drift check is a silent no-op on them. `tasks check` reports four such
  specs today, this branch's own among them.
- **pass 2 C-M3** — `tasks check` exits 1 on the ordinary done-but-not-committed
  state. This is a live disagreement between two pass-2 auditors, recorded and
  never resolved, and it reddens `check` for every worker between `tasks done`
  and `git commit`.

Not dissolved by any structure, and inherited as authoring discipline rather
than fixed by code: A-H1, B-M2 and B-M3. U9's attach-only-if-it-dies rule is
the whole mechanism, and it has already failed once — treat a surviving target
as a finding, not as a target to reword until it passes.

Deliberately deferred: pass 1 M10, M15, M16, M17, and the lows of both passes
except the four c10 absorbs above. `tasks spec add`'s pass-2 guard (B-M5) is a
policy question, not a refactor task, and so is what to do with an undelivered
clause task whose spec has been superseded — the five inherited ones cannot be
closed by any verb the tool has.

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

- **Answered: 41 records, not 12.** The original 36 + 5 claim was right. The
  36 pass-1 findings were filed with `spec: null` and their provenance only in
  `source.spec`, because that is what `tasks audit` does with a finding, while
  the 5 clause tasks got a `spec`. A count of the `spec` field therefore sees 5
  of 41, and `next` and `list --spec` see the same 5. Walked under U1: 14 closed
  by inherited commits and credited to them, 10 re-pointed at the clause that
  subsumes them, 12 left open as deferred backlog, and 5 stuck — see below.
- Done: this spec has members, so `tasks next` answers with a unit. Binding
  them needed one thing the plan did not anticipate — `fixNowQueue` sorts by
  severity before store order and the units carry none, so a promoted `high`
  finding outranks every unit. Each promoted finding therefore `requires` the
  unit that closes it, which keeps it out of the queue until there is something
  to verify.
- Done: pass 2's findings are 26 store records. Provenance is in their evidence
  text, not in `source` — only `tasks audit` sets that field and it cannot parse
  this document's heading shape. `tasks add` has no `--source` flag.
- Done: every cited label was checked against the archive and the list rewritten.
  Six claims did not hold, three of them findings the section listed as subsumed
  *and* as not-dissolved in the same breath.
- **Blocked, and a policy question rather than work.** The five inherited
  undelivered clause tasks cannot be closed by any verb: `decline` refuses
  `kind: undelivered` outright, `done` demands a `met` verdict in the superseded
  spec's own latest pass — and pass 2 ruled three of them unmet — and `spec done
  --defer-open` skips undelivered stragglers by construction. The remaining
  paths are falsifying an audit pass or hand-editing the store. The store has no
  way to say a spec was abandoned.

Acceptance: the store's answer to "what is open in this system" matches the two
audit records, and every claim in `## Subsumed findings` is checked. Met except
for the five records above, which no available verb can move.

### U2 — Scaffold: pin the shape, and write the clauses as failing tests

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
  each rewrite, and the reason `list`, `spec show` and `next` disagree today
  about whether a member is blocked.
- **Write a failing test for every clause that admits one, and attach it as
  that clause's `proof:` target.** `c1`, `c2`, `c3`, `c6`, `c8`, `c9` and `c10`
  all admit one. `c4` is a recorded measurement rather than a gate and gets no
  target. `c7` resisted codification when U0 tried it — its verification was
  hand-tracing every call site — so it stays prose unless the audit finds a
  test for it.
- Move exactly one rule end to end as the worked example. `closedCommitIssues`
  is already pure over tasks and is the cheapest to carry.
- Enforce the no-effects rule with a check, scoped to the policy module (`c1`).

**Assert the promise, never the mechanism.** A test that pins *how* a clause is
satisfied gets rewritten the moment a worker finds a better mechanism, and it
will: U0's prescribed excluded-directory design died on contact with vitest's
actual behaviour, while the promise it served — a leaked fixture cannot fail
`npm test` — survived untouched and was satisfied a different way.

These tests are red for most of the branch, so they must not be able to drown
the signal a worker reads. Keep the clause suite out of the default `npm test`
run and let `tasks check --merge` be what executes it. Note the consequence
rather than absorbing it silently: CI runs `npm test`, `tsc`, `layer-check` and
`audit-status`, and does not run the merge gate — so decide deliberately
whether the clause suite is a gate a PR must pass or a check a planner runs.

Acceptance: the example rule has a test that constructs facts directly and runs
with no repository, no subprocess and no filesystem. The check fails if the
policy module imports `fs`, `child_process` or `console`. Every clause listed
above has a target that is red for the right reason — not red because it names
a module that does not exist yet, which any typo also achieves.

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

### U9 — Prove the targets, then audit

U2 attached the targets. This unit establishes whether any of them is worth
anything, which could not be known until there was an implementation to break.

- For each clause carrying a target, mutate the promised behaviour and confirm
  the named target dies. **A target that survives is a finding, not a target to
  reword until it passes** — that rule has already failed once. Detach it and
  record the clause as untargeted rather than leaving a green target that
  proves nothing.
- Promote what the mutation pass taught. A clause still in prose — `c7`, or any
  clause whose U2 target was detached — gets a test now if the mutation work
  surfaced one that discharges it. This is the only point in the branch where a
  clause can be written with evidence instead of intention.
- Commission an independent audit through `tasks audit-prompt`, and a second
  auditor whose only question is whether anything is worse than before U0.
  Clause-by-clause verification structurally cannot see a regression: each
  clause looks fine alone. On the superseded branch that second auditor found
  all three regressions and the two clause auditors found none.

## Open questions

None. Both are answered in Decisions: `proof: command` is removed rather than
guarded, and the five-minute budget is a recorded measurement rather than a
gate.
