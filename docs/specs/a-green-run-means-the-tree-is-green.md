# a-green-run-means-the-tree-is-green

## Deliverable

`npm test` gives the same verdict twice in a row on the same tree. Today it does not: on `main` at
`5240302` three of four full runs failed, each on a different pair of tests, and every failure is
`Test timed out in 5000ms` — a timeout, never an assertion. The cause is that the task-system tests
pay real git and real subprocess cost **per case** rather than at a seam, so their duration is a
function of machine load rather than of what they assert. The remedy is the one CLAUDE.md §6.5
already prescribes and this repository has not applied to itself: fake the effect at its seam, keep
a named handful of real-git and real-subprocess tests to prove the seam itself, and never pay that
cost per case.

The seam is the enabling step, not a separate concern. `scripts/lib/git.ts` exists and exports eight
functions, but git is still read raw from five production sites beside it, and `gitFixture` pays
eight `git` spawns per call to build a repository the seam could have answered from data. Installing
the seam is what makes the fixture cheap; the fixture is what makes the tests cheap.

Proof:

- [c1] Every git read in the task system's production path goes through `scripts/lib/git.ts`. The five
  raw sites are `audit.ts:118`, `context.ts:80`, `mergeReady.ts:306`, `mergeReady.ts:363` and
  `records.ts:303`; a sixth, `handoff.ts`'s log walk, is named by `cl-l3-seam-remainder` and belongs
  here. `scripts/audit-status.ts`, `scripts/lib/sourceFiles.ts` and `scripts/mutate.ts` are outside
  the task system and are explicitly **not** in scope.
  proof: `grep -rn "spawnSync('git'\|execFileSync('git'" scripts/tasks scripts/lib --include="*.ts" | grep -v "\.test\.ts" | grep -v "lib/git.ts"` returns nothing.
- [c2] `scripts/lib/git.ts` has an install point, so a caller can supply git facts as data. The
  installed implementation is what the seam's own callers read; nothing reaches around it.
  proof: vitest `scripts/lib/git.test.ts`
- [c3] A test's call site declares whether it wants the enclosing repository's git or a controlled
  one, and the difference is visible in the source rather than implied by which fields it asserts on.
  This is the standing defect in `tasks-cli-fixture-isolates-its-store-but-not-the-git-it-read`
  (unreviewed) and `audit-prompt-under-fixture-still-reads-the-real-checkout-s-g` (open): `fixture()`
  isolates the store, systems manifest, specs dir and tmpdir, then runs in-process with cwd left on
  the real worktree, so hermeticity today depends on which assertion a test happens to write. The
  measured constraint is that 48 tests across 6 files resolve real SHAs against the enclosing
  repository **on purpose** — those keep working, by saying so.
  proof: vitest `scripts/tasks/cliFixtures.test.ts`
- [c4] `gitFixture` and `defaultStoreGitFixture` spawn no `git` process in their default form.
  proof: `grep -n "spawnSync('git'" scripts/tasks/cliFixtures.ts` returns nothing.
- [c5] Every test file that today builds a git repository per case reaches the same assertions
  without one, except a **named** set kept deliberately to prove the seam against real git. The set
  is named in the source, not inferred from what is left over, and it is small enough to list in one
  line.
  proof: vitest `scripts/tasks/handoff.test.ts scripts/tasks/doctor.test.ts scripts/tasks/records.test.ts scripts/tasks/audit.test.ts scripts/tasks/architectureCmds.test.ts scripts/tasks/mergeReady.test.ts`
- [c6] `scripts/modportal.ts` has a `run(args)` entry, and `scripts/modportal.test.ts` uses it
  instead of spawning `tsx`, keeping the same named-handful rule as c5.
  proof: vitest `scripts/modportal.test.ts`
- [c7] No test in `scripts/` exceeds 2000ms on an unloaded machine. The current worst are 4794ms,
  4196ms, 3674ms and 3508ms against vitest's 5000ms default — under 2× headroom, where the measured
  contention multiplier is 2.1× for a cold `tsx` spawn, 2.3× for `git init` and 4.9× for temp-dir
  churn. Headroom, not the ceiling, is the property; raising the ceiling does not discharge this.
  proof: `npx vitest run --reporter=json scripts` — no `assertionResults` entry over 2000ms.
- [c8] With the `tools` project's `maxWorkers` cap removed from `vite.config.ts`, three consecutive
  `npm test` runs on the same clean tree give the same verdict. The cap is the stopgap this spec
  exists to make unnecessary; leaving it in place and calling the suite green is the failure mode
  that closed `audit-loop-costs-less-clause-5`. Verified by measurement and recorded as a number,
  not pinned as an assertion — a wall-clock threshold in a test is a flake on someone else's machine.

## Goal

Make a green `npm test` mean the tree is green, so that a clause proved by it can be graded from one
run and an auditor is never asked to sort real failures from contention.

## Decisions

**Extends `git-isolated CLI fixture`; revives `git facts as data` rather than renaming it.** The
survey returned an exact producer for the first: `a-fixture-test-must-not-read-the-enclosing-repository-s-git`
(done) already registered that concept over `scripts/tasks/cliFixtures.ts`, so c3 and c4 extend it to
answer git from data instead of from a real repository, and no second concept is registered against
that file. `git facts as data` — claimed by the declined `git-seam-install` — is a **different**
capability and is revived under its own name: it is the production-side seam in `scripts/lib/git.ts`,
whose eight callers are production commands, and it is what makes the fixture cheap rather than being
the fixture. Collapsing the two would put one name over a production module and a test helper, which
is the "two concepts claiming one file" report `audit-status` exists to make. The prior claim was
retracted, never superseded, so the name is free and reusing it keeps the archive connected.

**The standing ruling is dissolved on its merits, not worked around.**
`audit-loop-costs-less-clause-5` was declined 2026-08-05 with "we will reevaluate handoff and its
tests if npm test becomes an issue in the future", and the five-task cohort beneath it
(`git-seam-install`, `git-fixture-as-data`, `handoff-test-off-git`, `cohort-off-git`,
`modportal-in-process`) was retracted the same day because "the trigger has still not fired
numerically (22.2s now against the 25.8s it was declined at)". That trigger was written in seconds
and the failure mode is variance: wall clock **fell** while reliability collapsed, so the condition
could never be met by the thing that broke. It is restated here as c8, in the units that fail.

**The correctness case is the load-bearing one; speed is a consequence.** The prior cohort was
justified by runtime alone, which is why it lost to a wall-clock argument. Three findings filed
independently — `cl-l3-seam-remainder` (open), `tasks-cli-fixture-isolates-its-store-but-not-the-git-it-read`
(unreviewed) and `audit-prompt-under-fixture-still-reads-the-real-checkout-s-g` (open) — describe the
same seam from the hermeticity side and were never declined. This spec discharges those; c7 and c8
follow from the same change rather than motivating it.

**Measured before decomposing, on `e3baf17`, 24-thread machine.** Full suite 1838 tests, 34.9s wall,
green. `scripts/` is 198.5 CPU-seconds over 39 files; `src/` is 14.5 over 34 — a 93/7 split. Running
`scripts/` **alone** costs 34.0s against the full suite's 34.9s, so removing the entire game suite
buys 0.9s: the flaking tests contend with each other, and extracting the task system into its own
package would not have fixed this. That result is why this spec is about the seam and not about a
split.

**Where the cost is, and where it is not.** Two profiles. `mergeReady.test.ts` (median 0ms, top-10 =
89% of file cost) and `doctor.test.ts` (median 665ms, top-10 = 88%) are spawn-concentrated, and every
test named in a flake sighting lives in this group — that is what c5 targets. `audit.test.ts`
(120 tests, median 106ms, top-10 = 32%), `records.test.ts` (median 153ms) and
`architectureCmds.test.ts` (median 229ms, zero `spawnSync`) are broad and flat: roughly 80 CPU-seconds
of per-case `fixture()` overhead — `mkdtemp`, three writes, an in-process CLI run, `rmSync` — across
368 call sites. That is real and is **out of scope**: it is not what flakes, and folding it in would
turn a bounded fix into a suite rewrite. It is filed separately.

## Open questions

None. Two decisions are delegated to the worker and are not questions for the planner:

- **What the install point looks like** — a module-level setter, a context object threaded through
  `config`, or a factory the CLI constructs. c2 states the property; the shape is the worker's, and
  it is the worker that will have read `scripts/lib/git.ts`'s eight callers.
- **Which tests stay on real git** — c5 requires the set be named and small, not which members it
  has. `handoff.test.ts`'s log-walk cases are the likeliest keepers, since a commit-message walk over
  a synthesised log proves less than one over a real one; that is an observation, not an instruction.
