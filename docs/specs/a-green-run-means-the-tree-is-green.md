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
  here. `scripts/audit-status.ts` and `scripts/mutate.ts` are outside the task system and are
  explicitly **not** in scope; `scripts/lib/sourceFiles.ts` was scoped out with them and later
  routed through the seam anyway by the pass-1 finding on audit-prompt's hermeticity.
  `scripts/tasks/realGitFixture.ts` is the named real-git set c5 keeps, excluded the way
  `lib/git.ts` is.
  proof: `grep -rn "spawnSync('git'\|execFileSync('git'" scripts/tasks scripts/lib --include="*.ts" | grep -v "\.test\.ts" | grep -v "lib/git.ts" | grep -v "realGitFixture.ts"` returns nothing.
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

## Audit passes

### Pass 1 — 2026-08-07

- base: `431ab07c20636f38fb66e094e28be1398e2d6798`
- head: `80de4d2a93058353266b8bcac6f748e64ad07717`
- proof 1: met — All five named production sites are routed through the seam and none was replaced by
another raw read. Verified against the base tree by replaying the clause's grep over
`git ls-tree -r --name-only 431ab07`: it returned audit.ts:118, context.ts:80, mergeReady.ts:302,
mergeReady.ts:359, records.ts:303 (plus sourceFiles.ts:17); the same grep at 80de4d2 returns none of
them. handoff.ts's log walk does not exist at either end of the range, so the clause's "sixth" site
was already discharged. `scripts/tasks.ts` carries no raw git either. The grep as literally written
still returns text, all of it out of the clause's substance: sourceFiles.ts:17 (named out of scope by
the clause, and filed as c1-s-proof-grep-sweeps-scripts-lib-and-so-always-catches-sou) and 17 lines
in the branch's own new scripts/tasks/realGitFixture.ts, a test fixture that is deliberately real per
c5 and is filed separately in this pass. Mutation, `npm run mutate` over an aimed manifest: breaking
context.ts:79 broke 3 tests in doctor.test.ts (doctor.test.ts:178, the warn-once case); breaking
records.ts:302 broke records.test.ts:860 (the derived closingCommit case); breaking audit.ts:117 broke
2 tests in audit.test.ts (audit.test.ts:1458, the ownership case). Those three are kills, but `mutate`
reported them ERROR rather than KILLED, because its parseFailedTests regex cannot read vitest's
project-prefixed `FAIL |tools| <file> > <test>` line — filed HIGH in this pass, and the failing tests
above are read out of mutate's own printed failure detail. The fourth aimed entry, breaking
mergeReady.ts:302 (`git.dirtyPaths() ?? []` to `[]`), SURVIVED at whole-suite scope, 0 failed of 1855
— filed as its own finding.
- proof 2: met — `install(facts)` at scripts/lib/git.ts:147 swaps a module-level `installed: GitFacts` and
returns the previous one, and all thirteen exported reads delegate to `installed`, read line by line.
`realGit` is the default. Mutation: deleting `installed = facts;` (git.ts:148) failed
`scripts/lib/git.test.ts > git seam > install swaps the implementation every exported read answers
from, and hands back the one it replaced` — that test is named verbatim in mutate's output. Rebinding
the `head` export to `realGit.head()` failed the same named test. Rebinding `commitLog` failed
`scripts/tasks/cliFixtures.test.ts > gitFixture answers git from the data its own commits built >
changedFiles and commitLog carry what each commit touched, newest first`; rebinding `mergeBase` failed
2 tests in cliFixtures.test.ts (cliFixtures.test.ts:63). All four reported ERROR rather than KILLED for
the tool reason filed HIGH in this pass. The one hole: rebinding the `diffStat` export to `realGit`
SURVIVED at whole-suite scope, 0 failed of 1855, so "nothing reaches around it" is unproven for that
export — filed as its own finding.
- proof 3: met — Five declared forms, each visible at the call site: `fixture` (installs `noRepositoryGit`,
every fact null/false), `enclosingGitFixture` (installs nothing, so the enclosing checkout answers),
`gitFixture` and `defaultStoreGitFixture` and `installDataGit` (install `DataGit`, a snapshot history),
and the four functions in scripts/tasks/realGitFixture.ts (real `git` in a temp repo, declared by the
import). scripts/tasks/cliFixtures.test.ts proves the difference behaviourally rather than by
inspection: `done --commit HEAD` is refused under `fixture` and accepted under `enclosingGitFixture`,
in one test. Mutation: swapping `fixture` to `fixtureWith(null, ...)` broke 2 tests in
cliFixtures.test.ts (cliFixtures.test.ts:32) and swapping `enclosingGitFixture` to
`fixtureWith(noRepositoryGit, ...)` broke 2 (cliFixtures.test.ts:37), so neither declaration is
decorative. Both reported ERROR for the tool reason filed HIGH here. One git read escapes the
declaration — `trackedFiles()` in scripts/lib/sourceFiles.ts spawns real `git ls-files` against
process cwd under every fixture — which is filed as its own finding rather than graded against this
clause, since c1 puts that file explicitly out of scope.
- proof 4: met — `grep -n "spawnSync('git'" scripts/tasks/cliFixtures.ts` returns nothing (exit 1); the
file's only `spawnSync` is `spawnTasks`, which spawns node, not git. Both fixtures build a `DataGit`
and install it. Mutation proves the data is what answers rather than a repository somewhere: changing
`DataGit`'s `head` from the last commit to the first broke cliFixtures.test.ts:62 (`commit() advances
HEAD and main stays at the branch base`), reported ERROR for the tool reason filed HIGH here.
- proof 5: met — The named set is declared by import: scripts/tasks/realGitFixture.ts exports exactly four
fixtures — realGitFixture, realGitRepo, eventLogGitFixture, realDefaultStoreGitFixture — and the six
files' import lines are the whole membership list (architectureCmds 1 call, audit 1, records 1,
mergeReady 1, handoff 4, doctor 5 plus 1 spawnTasks). Nothing is left over: every other case in those
files now runs on `fixture`, `enclosingGitFixture`, `gitFixture` or `installDataGit`. Mutation proves
the converted cases still reach their old assertions rather than passing vacuously: breaking
`DataGit.fork()` broke 4 tests across mergeReady.test.ts and cliFixtures.test.ts
(mergeReady.test.ts:708), and blanking `specAddsClauseId`'s base read broke 3 in mergeReady.test.ts
(mergeReady.test.ts:695) — both the exact cases that used to build a repo per case. Both reported
ERROR for the tool reason filed HIGH here. One converted case does not carry its own name: removing
doctor.ts:49's `git.mergeInProgress() ? [] :` suspension SURVIVED, so `doctor suspends the git-anchored
checks during an unresolved merge` cannot fail on the property it is named for — filed as its own
finding.
- proof 6: met — `export function run(argv: string[])` at scripts/modportal.ts:265, with the six
`process.exit(1)` calls replaced by a thrown `ExitSignal` that `run` converts to `process.exitCode`, so
a caller driving `run` in-process is not killed. `runModportal` in scripts/modportal.test.ts calls
`run(args)` and captures console; exactly one spawn is left, labelled in a describe block of its own as
the c5-rule keeper, and it is the only thing that can prove the direct-execution guard. Mutation:
forcing the ExitSignal code to 0 broke 4 tests in modportal.test.ts (modportal.test.ts:260 among them),
and replacing the direct-execution guard with `false` broke modportal.test.ts:260 — so the kept spawn
earns its place. Both reported ERROR for the tool reason filed HIGH here. Measured cost: the file no
longer appears anywhere in the slowest 15 tests of `npx vitest run --reporter=json scripts`.
- proof 7: unmet — Measured twice with the clause's own proof command
(`npx vitest run --reporter=json --configLoader runner scripts`), on the branch tip 80de4d2 on the
same idle 24-thread machine the spec was measured on (loadavg 0, 14GB free, nothing else running).
Run one: 1245 tests green, five
assertionResults over 2000ms — 3224ms handoff.test.ts `beats git log -S`, 3197ms doctor.test.ts
`default-store writes stay silent about their own dirtiness`, 3068ms tasks.test.ts `refuses five junk
arguments on every bounded command surface`, 2284ms triage.test.ts `triage promotes into the inferred
spec when the branch matches no spec file`, 2017ms mergeReady.test.ts `reports only the paths this
branch's own commits changed`. Run two: six over 2000ms, worst 3389ms, same five plus 2032ms
taskStore.test.ts. The clause asks for none. This is a large improvement on the 4794ms the clause
records as the starting worst, but headroom is the stated property and 3389ms against vitest's 5000ms
default is 1.48x, below the 2x the clause itself calls insufficient — and the measured contention
multipliers in the clause (2.1x to 4.9x) are what turns that into a timeout. Graded unmet rather than
deferred because the goal is that a green run means the tree is green, and a test with 1.48x headroom
on a 5000ms clock is the exact mechanism the deliverable names. Re-runnable: the command above, on any
idle machine.
- proof 8: met — vite.config.ts at 80de4d2 carries neither `maxWorkers` nor a `testTimeout` override on the
`tools` project, so every route runs vitest's 5000ms default at full worker count — read directly, and
`npm run tasks -- merge-ready` runs `npm test` with no clock flag. Reproduced the measurement
independently on the branch tip, three consecutive runs on a clean tree, no other work on the machine:
exit 0 / 74 files / 1855 of 1855 passed, three times, at 28.7s, 29.7s and 29.1s wall. Same verdict
three times, and the verdict is green. The worker's own record on
the-suite-is-deterministic-with-no-worker-cap-measured reports 26.7s / 26.6s / 26.2s for the same
three-run shape, which my slower absolute numbers are consistent with under an agent harness. The c7
half of that same record understates its residue, which is filed separately and does not touch this
clause's measurement.

### Pass 2 — 2026-08-07

- base: `431ab07c20636f38fb66e094e28be1398e2d6798`
- head: `5987dd80c8798a3384e2022d7264b97ae0466aa6`
- proof 1: met — The clause's grep, run at 5987dd8, returns nothing (exit 1). Widening it past the
clause's literal text to every child_process channel in the task system leaves exactly two spawns,
neither a git read: audit.ts:247 (`npx vitest list --json`) and mergeReady.ts:414 (the gate legs).
handoff.ts contains no git reference at all, so the clause's "sixth" site does not exist at this
head. Mutation, `npm run mutate` over an aimed manifest: six of the seven seam reads this branch
created are killed by a named test each, re-run at their own files with the mutant still applied.
mergeReady.ts:302 (`git.dirtyPaths() ?? []` to `[]`) is killed by mergeReady.test.ts "reports the
working tree's own uncommitted paths as dirty" -- the pass-1 survivor, now closed. mergeReady.ts:355
is killed by two mergeReady.test.ts cases; records.ts:302 by records.test.ts "show derives the
closing commit from git history when closedCommit was never recorded"; context.ts:79 by three
doctor.test.ts cases; audit.ts:117 by two audit.test.ts cases; audit.ts:636 by audit.test.ts "the
brief names the commits in its diff range and what each touched". The seventh, audit.ts:641's
diffStat, SURVIVED at whole-suite scope (0 failed of 1862) and is filed as its own finding rather
than graded here, because c1 is about routing and that survivor is about coverage.
- proof 2: met — `install(facts)` at scripts/lib/git.ts:155-159 swaps a module-level `installed:
GitFacts` and returns the one it replaced; all fourteen exported reads delegate to `installed`, read
line by line, with `realGit` the default and no production caller importing `realGit` directly (only
realGitFixture.ts does, which is the named real-git set). Mutation: replacing `installed = facts;`
with `void facts;` is KILLED by scripts/lib/git.test.ts "install swaps the implementation every
exported read answers from, and hands back the one it replaced". Pass 1's one hole is closed --
rebinding the `diffStat` export to `realGit.diffStat(range)`, which SURVIVED the whole suite at
80de4d2, is now KILLED by that same named test, because 6b993be gave the test a distinct sentinel
for each of the fourteen exports instead of asserting on a handful. Re-runnable: both mutations, at
scripts/lib/git.test.ts scope.
- proof 3: met — Five declared forms, each visible at the call site: `fixture` (installs
`noRepositoryGit`, every fact null/false), `enclosingGitFixture` (installs nothing, so the enclosing
checkout answers), `gitFixture` / `defaultStoreGitFixture` / `installDataGit` (install `DataGit`, a
snapshot history), and the four fixtures in scripts/tasks/realGitFixture.ts (real `git`, declared by
the import). scripts/tasks/cliFixtures.test.ts proves the difference behaviourally rather than by
inspection: `done --commit HEAD` is refused under `fixture` and accepted under `enclosingGitFixture`,
in one test. Mutation in both directions, which is what makes the declaration binding rather than
decorative: swapping `fixture` to `fixtureWith(null, run)` is KILLED by two cliFixtures.test.ts
cases, and swapping `enclosingGitFixture` to `fixtureWith(noRepositoryGit, run)` is KILLED by two
more. One weakness in the mechanism rather than the clause -- `enclosingGitFixture` inherits whatever
is installed instead of pinning `realGit` the way `realGitRepo` does -- is filed as its own finding.
- proof 4: met — `grep -n "spawnSync('git'" scripts/tasks/cliFixtures.ts` returns nothing (exit 1); the
file's only `spawnSync` is `spawnTasks`, which spawns node. Both fixtures construct a `DataGit` and
install it. Mutation proves the installed data is what answers rather than a repository somewhere:
changing `DataGit.head` from the last commit to the first is KILLED by cliFixtures.test.ts "commit()
advances HEAD and main stays at the branch base", and dropping `DataGit.dirtyPaths`' pathspec
narrowing is KILLED by "the default-store form tracks the store the way a committed repo would" --
the case that covers `defaultStoreGitFixture` specifically.
- proof 5: unmet — One converted case does not reach the assertion it keeps. doctor.test.ts:253 "doctor
degrades to no working-tree-comparison issue when there is no committed store (unborn HEAD)" was
converted from a real repository with zero commits to `fixture`. `fixture` passes `--store
<tmpdir>/tasks.jsonl`, so `workingTreeOnlyIssues` returns at context.ts:115 on
`!usesDefaultStore(config)` and never reaches context.ts:117, the unborn-HEAD degradation the test is
named for. Measured: replacing context.ts:117 `if (committedText === null) return [];` with a return
of a working-tree-only warning SURVIVED at whole-suite scope, 0 failed of 1862 -- nothing anywhere in
the suite covers that path now -- and deleting the guard at context.ts:115 also SURVIVED whole-suite,
so neither branch of that read is watched. Before this branch the case built a repository with no
commit and ran doctor over the default store, which did exercise it. Second, smaller half: the set is
still partly inferred from what is left over. scripts/lib/git.test.ts builds a real repository in
`beforeEach` for all 24 of its cases and is the second most expensive file in `scripts/` (12.9s and
13.3s of assertion time over the two runs measured for c7, behind only audit.test.ts), yet it does
not import realGitFixture.ts and so is not in the one-line membership list. Both are filed as
findings. The rest of the conversion holds: breaking `DataGit.fork()` is KILLED by four
mergeReady.test.ts cases, and the mid-merge suspension that SURVIVED in pass 1 is now KILLED by
doctor.test.ts "doctor suspends the git-anchored checks during an unresolved merge".
- proof 6: met — `export function run(argv: string[])` at scripts/modportal.ts:265, with the six
`process.exit(1)` calls replaced by a thrown `ExitSignal` that `run` converts to `process.exitCode`,
so a caller driving `run` in-process is not killed; the one inner `catch` in `sync` (modportal.ts:161)
wraps a pure content call and cannot swallow it. `runModportal` in scripts/modportal.test.ts calls
`run(args)` and captures console. Exactly one spawn is left, in a describe of its own labelled as the
c5-rule keeper. Mutation shows both halves earn their place: forcing the `ExitSignal` code to 0 is
KILLED by four modportal.test.ts cases, and replacing the direct-execution guard at modportal.ts:282
with `false` is KILLED by that kept spawn's own test -- so the spawn proves something nothing else
can, and nothing else needs one. Measured cost: modportal.test.ts appears nowhere in the slowest 15
tests, and nowhere in the eight most expensive files, of `npx vitest run --reporter=json scripts`.
- proof 7: unmet — Measured twice with the clause's own proof command, run as `npx vitest run
 --reporter=json --configLoader runner scripts`, at the branch tip 5987dd8. Run one: 1252 tests green, one
assertionResult over 2000ms -- 2418ms, handoff.test.ts "beats git log -S on the edits it misses and
-G on the rewrites". Run two: three over 2000ms -- 2536ms for the same handoff case, 2157ms
doctor.test.ts "default-store writes stay silent about their own dirtiness, and warn once over stale
uncommitted state", 2104ms taskStore.test.ts "two branches, one editing a record and adding a
non-adjacent one". The clause asks for none. This is a large improvement on pass 1's five-to-six over
2000ms with a 3389ms worst, and on the 4794ms the clause records as its starting point, but headroom
is the stated property and 2536ms against vitest's 5000ms default is 1.97x -- still under the 2x the
clause itself calls insufficient, and the contention multipliers the clause measures (2.1x for a cold
tsx spawn, 2.3x for git init, 4.9x for temp-dir churn) are exactly what turns that into a timeout.
Graded unmet rather than deferred on the same reasoning pass 1 gave: the goal is that a green run
means the tree is green, and a test with under 2x headroom on a 5000ms clock is the mechanism the
deliverable names. Re-runnable: the command above on any idle machine.
- proof 8: met — vite.config.ts at 5987dd8 carries neither `maxWorkers` nor a `testTimeout` override on
either project -- read directly, lines 25-39 -- so every route runs vitest's defaults at full worker
count, and merge-ready's own leg (mergeReady.ts:24, `npm test -- --reporter=dot`) carries no clock
flag either, so no route runs a gentler suite than the one it claims to predict. Reproduced
independently on the branch tip, three consecutive `npm test` runs on a clean tree with nothing else
on the machine: exit 0, 74 of 74 files, 1862 of 1862 tests, three times, at 29s, 28s and 29s wall.
Same verdict three times, and the verdict is green. `npm run tasks -- merge-ready` on the same tree
passes tsc, npm test, layer-check, audit-status, doctor, bytes, tree and base; its only two FAIL legs
are `spec` and `clauses`, both reporting c7's standing and nothing else.
