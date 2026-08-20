# Testing procedure audit — pass 2 — 2026-08-02

Second independent audit of branch `task-system-real-world-friction-spec` at `84a78ee`, covering
the sixteen fix commits since pass 1 at `07463c8`. Three auditors in isolated git worktrees,
each mutation-testing its own clauses; reconciled here.

This branch is superseded. This record exists as evidence for the refactor that replaces it.

Auditor A owned c1–c4 and re-verified every proof target named by them. Auditor B owned c5–c8 and
additionally wrote up two implementation incidents. Auditor C rendered no clause verdicts and
audited the sixteen-commit diff for regressions, authorization, and architecture. Finding labels
are each auditor's own and are preserved unchanged — `A-H1`, `B-M4`, `C-H3` — so downstream
documents can cite them and trace them back. Where two auditors found one root cause from
different starting points, every contributing label is kept on the merged entry.

**Pass 1's H1, H2 and H3 are all confirmed closed.** Each was verified by mutation or by end-to-end
reproduction, not by reading the diff. Details in *What the fix round genuinely closed*.

## Clause verdicts

| clause | verdict | evidence, with the mutation that established it |
|---|---|---|
| c1 — executable proof targets | **met** | A: forcing `runVitestProofTarget` to `return null` as its first statement kills 5 tests including both named targets, and four finer mutations each kill exactly the outcome they break — zero-matches→`return null` kills "matched no test", `if (failed.length > 0)`→`if (false)` kills the failing-test target, `if (notPassed.length > 0)`→`if (false)` kills the skipped case, deleting the `existsSync` guard kills the missing-file case — while deleting the command branch's non-zero-status refusal kills the command target. |
| c2 — closing-commit anchor | **met** | A: deleting `...workingTreeOnlyIssues(config, tasks)` from `cmdCheck` kills the first named target, demoting its `closing ? 'error' : 'warning'` to a flat `'warning'` also kills it, and replacing `if (!git.isAncestor(task.closedCommit, 'HEAD'))` with `if (false)` kills the second. |
| c3 — `in-progress` lifecycle | **unmet** | A: adding `&& task.state !== 'in-progress'` to `checkMergeGate`'s `notClosed` filter — the merge gate declaring a branch complete while its members are still being worked on — leaves 366/366 green including c3's one named target; three further "treated as complete" mutations are green as well. See A-H1. |
| c4 — spec and proof identity | **unmet** | A: with `spec freeze` + `tasks audit` recorded and committed, replacing clause `[c1]`'s text wholesale by hand (keeping the tag) then running `spec amend` leaves `check --merge` at `0 issue(s)` — a never-audited clause carrying a `met` verdict (A-H2). Separately the rename property holds only when the branch's diff touched the spec (A-M1 / C-H1). |
| c5 — auditor prompt | **met** | B: all nine elements print; 7 of 8 mutations die, including pass 1's own survivor — `console.log(\`Diff range: ${base}..${head}\`)` → `console.log(\`Diff range: \`)` now kills the named target, as does forcing `head = base`, dropping the required-commands loop, the per-clause guidance, the no-target callout, the audit-pass line, or the member loop. The one survivor is a target gap, not a behaviour gap (B-M2). |
| c6 — command surface | **met** | B: verified by running, not reading — `--help`/`help` both exit 0 with usage, `tasks spec <slug>` renders the same document as `spec show`, `--order` on a hand-built `c→b→a` store prints `a, b, c`, a `c→b→a→c` cycle neither crashes nor reorders while `tasks check` reports `error: dependency cycle: c -> b -> a -> c` at exit 1, and `search freeze` annotates `(matches: title, deliverable, evidence)`. All five named targets die under mutation and each matches exactly one test. |
| c7 — commit contract | **met** | B: verified with real commits under `core.hooksPath .claude/hooks` — subject-only refused, subject+body accepted, subject+body+`Next:` accepted, subject+`Next:`-only refused, `fixup!` exempt; instrumenting both launcher branches shows the repo-local one is taken (0.67 s) and the `npx` fallback enforces identically (2.09 s). Dropping the body check and counting `Next:` as body each kill their named targets. The clause holds; its target set does not cover its headline (B-M3). |
| c8 — gates and test cost | **unmet** | B: c8's own fifth required command exits 1 at HEAD with 8 issues, and the sole target `command npm test` survives every mutation that falsifies the clause — disabling both `noUnusedLocals` and `noUnusedParameters` leaves 831/831 green, and routing every `tasks.test.ts` case out-of-process leaves 160/160 green (at 160.8 s against a 64.4 s baseline). See B-H1. |

c1, c2, c5, c6 and c7 moved from unmet to met on real, mutation-proven work. c3 and c4 remain unmet
for reasons pass 1 already named and this round chose not to close. c8 is unmet on its own literal
terms and its proof target cannot see any of its four promises.

## The c1/c4 contradiction

**c1 and c4 cannot both be satisfied.** Adopting c1's own feature — attaching a `proof:` target to a
clause — edits the `## Deliverable` text, which c4's freeze reports as unaudited deliverable drift.
There is no ordering of the two that leaves the gate green without declaring the deliverable amended.

Found by B (B-H2, high), corroborated independently by C (C-M1, medium) who diffed the live
deliverable against `stampClauseIds(baseline)` and found the drift is **exactly** the 18 `proof:`
lines and nothing else (`amendments: 0`, baseline present), and by A, who reached the same fact from
the c4 side while auditing the branch's own spec (live section 5 164 chars vs baseline 3 159, neither
the raw nor the `stampClauseIds` comparison holding).

Minimal reproduction — one added `proof:` line takes the gate from 0 to 1 issue:

```
git init; write specs/demo.md with one clause; commit on main; checkout -b demo
tasks spec freeze demo && tasks audit demo --proof 1=met && commit
tasks check --merge          -> merge gate: 0 issue(s)          (exit 0)
# add ONE line under the clause:   proof: command node --version
tasks check --merge          -> merge gate: demo's ## Deliverable text differs from its
                                most recent amendment (…)   1 issue(s)   (exit 1)
```

The proof target itself runs and passes; only the freeze objects. The escape hatch is
`tasks spec amend`, which clears it and then prints `next: run \`tasks audit demo\` to verify the new
clauses` — false, since no clause changed. This is issue 6 of the 8 keeping c8's fifth command red on
this branch, and every future spec that names targets hits it on its first `check --merge`.

The asymmetry is already solved once in the same code: the gate deliberately tolerates the `[cN]`
stamp (`doc.deliverableSection.trim() !== stampClauseIds(baseline).trim()`) because a clause id is
bookkeeping about a promise rather than the promise. A `proof:` target is the same kind of
bookkeeping and gets no such tolerance. `parseSpecDoc` already separates `clause.text` from
`clause.proofTargets`; the freeze compares rendered markdown instead of the parsed model, and that
choice is the whole defect.

## Findings

### Regressions introduced by the fix round

#### C-H3 — `npm test` fails on a `main` checkout, and the failing test is c5's own proof target

**Severity:** high  **System:** Testing procedure
**Files:** `scripts/tasks.test.ts:1512-1525`, `scripts/tasks.ts:1379-1392` (`resolveDiffRange`)

`b52f544` replaced pass 1's weak label assertion (`toContain('Diff range:')`) with a value assertion.
The strengthening is right in principle, but the test runs `audit-prompt` **in-process against the
real repository** (`runInProcess`, cwd = repoRoot), so its base and head come from
`git merge-base main HEAD` on whatever is checked out. When `HEAD == main`, base **is** head:

```bash
git clone --local --no-hardlinks <worktree> $SP/clone && cd $SP/clone
git checkout -B main 84a78ee     # + a node_modules junction
node node_modules/vitest/vitest.mjs run scripts/tasks.test.ts --configLoader runner \
  -t "audit-prompt prints a ready-to-use auditor prompt for a spec"
```

```
FAIL scripts/tasks.test.ts > audit-prompt prints a ready-to-use auditor prompt for a spec
AssertionError: expected '84a78ee8…' not to be '84a78ee8…'  // scripts/tasks.test.ts:1525
```

`test.yml` fires on `push: branches: ['**']`, so merging this branch turns `main` red on the merge
commit. This is a fresh instance of pass 1's H2 ("`npm test` fails at the branch head"), and c5's
declared proof target is the test that fails.

**Also found by:** planner reproduction, independently — cloned the repo, set `main` to `84a78ee`,
and ran the `audit-prompt prints a ready-to-use auditor prompt for a spec` case;
`expect(diffRange![1]).not.toBe(diffRange![2])` fails at `scripts/tasks.test.ts:1525` because
`merge-base(main, HEAD) === HEAD`. The planner adds the deeper defect: the test runs inside a temp
`fixture()` directory while `audit-prompt` resolves its range against the **ambient real repo**. The
assertion is not the bug; the ambient resolution is.

**Deliverable:** point the assertion at a fixture repo (`gitFixture` already builds one with a real
`main`), or assert the range against `git merge-base` computed in the test rather than against
"base ≠ head". Add a `main`-checkout run to the pre-merge checklist.

#### C-H1 / A-M1 (second half) — the branch-rename protection is not restored: `tasks spec add` attaches members without touching the spec file

**Severity:** high  **System:** Testing procedure
**Files:** `scripts/tasks.ts:172-187` (`mergeGateSpecCandidates`), `scripts/tasks.ts:155-168`
(`specCandidatesFromDiff`), `scripts/lib/mergeGate.ts:46-52`

`6c68037` justifies keeping the name-based fallback with this claim, in source and in its commit
message: *"a branch with open members has, by the time those members matter, touched its spec file at
least once — to open it, amend it, or record an audit pass — so the diff finds it."*

That is false. `tasks spec add` writes **only** `docs/tasks.jsonl`. The branch's own last commit,
`84a78ee`, is exactly that: `git show --name-only 84a78ee` → `docs/tasks.jsonl`, nothing else. So a
branch can acquire open spec members without its diff ever touching a spec file, and a rename then
turns the gate green.

Reproduction, side by side against 07463c8:

```bash
SP=<scratchpad>; WT=<worktree at 84a78ee>
bash $SP/mkfix.sh $SP/fix1 && cd $SP/fix1 && git checkout -q -b demo-spec
node $WT/node_modules/tsx/dist/cli.mjs $WT/scripts/tasks.ts add "Open work" --branch demo-spec
node $WT/node_modules/tsx/dist/cli.mjs $WT/scripts/tasks.ts spec add demo-spec open-work --branch demo-spec
git add -A && git commit -q --no-verify -m "Add an open member

Store only, spec file untouched."
# NEW (84a78ee)
node $WT/node_modules/tsx/dist/cli.mjs $WT/scripts/tasks.ts check --merge \
  --branch totally-unrelated-name --base-branch main
# OLD (07463c8)
node $WT/node_modules/tsx/dist/cli.mjs $SP/old/scripts/tasks.ts check --merge \
  --branch totally-unrelated-name --base-branch main
```

```
NEW: merge gate: not applicable — no active spec for this branch, and no --spec given   (exit 0)
OLD: merge gate: open spec member(s) exist but this branch has no active spec           (exit 1)
```

A reached the same property from the c4 side with a different construction
(`scratchpad/repro2.sh`): a spec opened, frozen and audited on `main`, then a branch that adds a
member and writes code without touching the spec file, renamed → `not applicable`, exit 0, one open
member. c4 states the property unconditionally; the implementation makes it conditional on the diff.

The rewritten test `check --merge stays not applicable when the branch's diff touches no spec file,
even though a spec in the same specs dir has open members` (`scripts/tasks.test.ts:1911`) encodes this
exact loss as intended behaviour, and its scenario is runtime-indistinguishable from a rename. Also:
the folded task `renaming-a-branch-turns-the-merge-gate-green-with-nothing-el` is recorded `done` in
`docs/tasks.jsonl` while the behaviour it names still reproduces.

**Also found by:** A (A-M1, second half), independently, from the clause rather than the diff.

#### C-H2 / A-M1 (first half) — an unresolvable merge-base is indistinguishable from "the diff touches no spec", so the gate silently downgrades to not-applicable

**Severity:** high (C-H2); A filed the same behaviour at medium as the first half of A-M1
**System:** Testing procedure
**Files:** `scripts/tasks.ts:160-168` (`specCandidatesFromDiff`), `scripts/tasks.ts:1393-1400`
(`diffChangedFiles`), `scripts/lib/git.ts:7-15` (`mergeBase` returns `null` on any failure)

`specCandidatesFromDiff` returns `[]` both when the diff genuinely touches no spec **and** when
`git.mergeBase` returns `null`. The seam's uniform quiet-null — the thing pass 1's M13 asked for — is
what makes the second case silent. `mergeGateSpecCandidates` then falls through to the branch name,
which is precisely the signal c4 exists to stop trusting, and which a rename has already defeated.

C's reproduction:

```bash
cd $SP/fix1   # branch's diff DOES touch docs/specs/demo-spec.md at this point
node $WT/node_modules/tsx/dist/cli.mjs $WT/scripts/tasks.ts check --merge \
  --branch totally-unrelated-name --base-branch does-not-exist
# NEW: merge gate: not applicable — no active spec for this branch, and no --spec given
# OLD: merge gate: open spec member(s) exist but this branch has no active spec
```

A's, from a separate fixture, showing the correct verdict first:

```
$ tasks check --merge --branch totally-different-branch-name
merge gate: member(s) of demo-spec neither done nor declined: still-open
merge gate: 1 issue(s)                                            exit=1   (correct)

$ tasks check --merge --branch totally-different-branch-name --base-branch no-such-base
merge gate: not applicable — no active spec for this branch, and no --spec given
                                                                  exit=0   (fails open)
```

Not reachable in this repo's CI today (`fetch-depth: 0`, `--base-branch origin/main`), but reachable
for any local run in a single-branch clone with no local `main`, and one workflow edit, one fork-PR
checkout variant, or one `git gc` away. The failure is silent and produces the same output as a
branch that legitimately promised nothing. The seam's own comment promises callers "decide for itself
how loud to be about it"; this caller decided to be silent about a case it cannot distinguish.

**Also found by:** A (A-M1, first half), independently.

#### B-H2 / C-M1 — attaching a proof target to a frozen deliverable is reported as unaudited drift

**Severity:** high (B-H2); C filed the same fact at medium as C-M1  **System:** Testing procedure
**Files:** `scripts/lib/mergeGate.ts:80-83`, `scripts/tasks.ts:359`,
`docs/specs/task-system-real-world-friction-spec.md:22-71` vs `:344-430` (`## Baseline`)

See **The c1/c4 contradiction** above for the argument, the reproduction, and the evidence. Recorded
here as a regression because `277bdb9` put 18 `proof:` lines inside `## Deliverable` and never
amended the baseline, so this refusal is permanent on the branch until someone runs
`tasks spec amend`. Corroborated by A as the first entry in A's own regressions section.

#### B-M1 / A-M3 / C-M2 — the merge gate runs one full vitest execution per target instead of per file: 16 to 25 minutes, in CI on every PR

**Severity:** medium (all three)  **System:** Testing procedure
**Files:** `scripts/tasks.ts:388-395` (`runProofTargets`), `scripts/tasks.ts:414-441`
(`runVitestProofTarget`), `.github/workflows/test.yml:53,60`

`85f9dd0` dropped vitest's `-t <name>` filter — the runner now spawns the whole file and filters the
JSON report. `277bdb9` then attached 18 targets, 13 of which name `scripts/tasks.test.ts`, a file that
takes 64–74 s. There is no per-file memoisation, so the gate spawns that file thirteen times: 2 080
test runs to verify 13 named ones, plus c8's `command npm test` (50–57 s) running the same file a
fourteenth time.

```
$ time npm run tasks -- check --merge --spec task-system-real-world-friction-spec
# B:  real 16m52.544s   EXIT 1
# C:  ~25 min           EXIT 1, 8 issues
# A:  two runs abandoned after >20 min each without printing a `merge gate:` line
```

**Independent corroboration, three ways.** All three auditors hit this from different directions — A
while trying to run the clause's own required command and failing to get a verdict at all, B by
measuring it end to end, C by timing a single spawn (`1m13.9s`) and multiplying. This is the command
c8 itself requires to pass and the command CI runs on every pull request, after the job has already
run `npm test` once.

Grouping targets by file and matching every clause's title against one JSON report turns thirteen
runs into one. All three auditors independently proposed the same fix, and all three note the
JSON-report approach is otherwise correct and clearly better than the scrape it replaced.

#### C-M3 — `check` now exits 1 on the ordinary "done, not yet committed" state; the spec asked for a warning

**Severity:** medium  **System:** Testing procedure
**Files:** `scripts/tasks.ts:116-139` (`workingTreeOnlyIssues`), `CLOSING_STATES` at `:114`

```bash
tasks add "Some work" --id w1 ; git commit -am "Add w1"
tasks done w1 ; tasks check
# error: w1 is done only in the working tree (committed state: open)
# 1 task(s), 1 error(s), 1 warning(s)   → exit 1
```

Slice 4 says *"**Warn** after state-changing writes when `docs/tasks.jsonl` has uncommitted changes.
`tasks check` should **distinguish** committed store state from working-tree-only state"*. The
implementation escalates the closing-state case to `error` + exit 1, which reddens `npm run tasks --
check` for every worker between `tasks done` and `git commit` — the exact window CLAUDE.md's "make
commits after each logical chunk" produces on purpose.

Worse, the acceptance criterion it serves is still unmet from the other side. After the revert the
clause exists to catch, the check goes quiet:

```bash
tasks done w1 ; git checkout -- docs/tasks.jsonl ; tasks check
# 1 task(s), 0 error(s), 0 warning(s)   → exit 0
```

And because `done` now stores `null` by default, the second half of the acceptance criterion ("*or*
its closing commit is unreachable") can no longer fire for anything closed by the normal path: 30
done tasks in `docs/tasks.jsonl`, 12 with a `closedCommit`, none written by the new `done`. Both
detectors are off for the reverted-mark case.

**Disagreement on the record:** A ruled c2 met partly *because* the error level is mutation-proven —
demoting `closing ? 'error' : 'warning'` to a flat `'warning'` kills c2's first named target. C says
the error level exceeds Slice 4's own wording. Both are correct on their own terms; the verdict does
not turn on it, but the fix direction does.

#### B-M4 — `vitestFixtureFile` writes a deliberately-failing test file into `scripts/lib/` and leaks it on interruption

**Severity:** medium  **System:** Testing procedure
**Files:** `scripts/tasks.test.ts:162-193`, used at lines 1768, 1794, 1809, 1824, 1838

The helper writes `scripts/lib/__proof_fixture_<ts>_<rand>.test.ts` — inside the source tree, because
vitest only resolves test files under the project root — containing
`it('proof fixture fails', () => { expect(1).toBe(2); })`, and removes it in a `finally`. A `finally`
covers a failing assertion. It does **not** cover process death:

```
for attempt in 1 2 3; do
  npx vitest run scripts/tasks.test.ts --configLoader runner -t "proof target" &  VP=$!
  until ls scripts/lib/__proof_fixture_*.test.ts; do sleep 0.05; done
  kill -9 $VP; pkill -9 -f vitest; sleep 2
  ls scripts/lib/__proof_fixture_*.test.ts && echo LEAKED || echo clean
done
# attempt 1: LEAKED   attempt 2: LEAKED   attempt 3: clean
```

Consequences of one leftover, all measured: `npx vitest run scripts/lib` → 1 failed / 158 passed;
`npx tsc --noEmit` → exit 0, silent; `npm run layer-check` → passes, silent; `git status --short` →
`?? scripts/lib/__proof_fixture_LEAKED.test.ts`. `.gitignore` has no entry and `vite.config.ts`'s
`test.exclude` does not list it, so it is stageable by `git add -A`. For the next branch this presents
as a mystery failing test named "proof fixture fails" in a directory nobody edited, and it reddens
`npm test` — which is also c8's proof target and both CI legs. The helper never sweeps a leftover from
an earlier crashed run.

Two aggravating conditions: interruption is likely, since `check --merge` now takes 16–25 minutes and
re-enters this file thirteen times; and concurrency, since two vitest processes in one checkout — an
agent swarm's normal state, which is the thing this branch exists to support — will have one glob the
other's fixture.

**Also found by:** A, as an out-of-scope observation, having leaked it twice by accident during the
audit (e.g. `scripts/lib/__proof_fixture_1785641293404_07afhvi2dz6.test.ts`). Two auditors tripped
over it in one pass without looking for it.

#### C-M4 — the two-spec ambiguity refusal is a new gate with no authorizing finding and no observed incident

**Severity:** medium  **System:** Testing procedure
**Files:** `scripts/lib/mergeGate.ts:46-49` (refusal), `:33-45` (its comment)

```
branch's diff touches more than one spec file (a, b) — a branch proves exactly one spec;
split the change or resolve which spec this branch is for
```

CLAUDE.md: *"Resist adding new automated gates: a gate earns its place by preventing something that
actually happened, not by sounding rigorous."* Neither pass 1's M14 nor any other authorized finding
asks for this, and no incident is cited in `6c68037`'s message. It is live on `pull_request` and it
fires on mundane shapes — a branch that records its own audit pass and fixes a typo in a sibling spec,
or a branch that amends two specs, now reddens CI with no way to proceed except `--spec`, which CI
does not pass.

Meanwhile M14's *actual* second deliverable — *"decide explicitly whether the refusal is global or
scoped to specs the current diff touches, **and record that in `## Decisions`**"* — was not done; the
spec's `## Decisions` is unchanged across all sixteen commits.

#### C-H4 — the sixteen commits add 188 comment lines, several of which CLAUDE.md forbids by name

**Severity:** high  **System:** Testing procedure
**Files:** `scripts/tasks.ts:108,148,155,174,411,697,1378`; `scripts/lib/mergeGate.ts:5-11`;
`scripts/lib/taskStore.ts:36-40`; `scripts/lib/git.ts:3-6`

Comment density moved the wrong way in every touched file:

| file | before | after |
|---|---|---|
| `scripts/tasks.ts` | 129/1841 (7.0%) | 207/2139 (9.7%) — 78 of the 298 added lines are comments |
| `scripts/lib/taskStore.ts` | 16/290 (5.5%) | 37/353 (10.5%) |
| `scripts/lib/mergeGate.ts` | 23/74 (31%) | 36/92 (39%) |

CLAUDE.md: *"Never close an audit finding by writing its rationale into the source. … A comment
restating a finding is a third copy that cannot be executed and will rot."* Violated at least six
times, by finding id: `tasks.ts:108` (`// c2's own comparison: …`, H7's rationale); `tasks.ts:155`
(`// c4's diff-based binding: …`); `tasks.ts:174` (`// … it cannot reintroduce the rename regression
c4 exists to fix …`); `tasks.ts:1378` (`// … neither is allowed to fall back to a placeholder that
still exits 0 (M9).`); `tasks.ts:697` (`// … (H6: \`done\` cannot record it, since it does not exist
yet) …`); `tasks.ts:407-414`, where the whole "The prior scrape matched vitest's own `N passed | M
skipped`…" paragraph is pass 1 H3's *evidence section*, transcribed; and `mergeGate.ts:5-11`
(`// … which is what c4 requires …`).

CLAUDE.md: *"Never describe another module's contract."* Violated three times: `mergeGate.ts:5-11`
describes what **`tasks.ts`'s caller** loads and when; `taskStore.ts:36-40` names "the one catcher at
the command boundary (`run(argv)` in `tasks.ts`)"; `tasks.ts:148-151` (`currentSpec`) maintains a
hand-written list of its own callers.

And one is simply **wrong**: `tasks.ts:157` says `specCandidatesFromDiff` "Reuses `diffChangedFiles`'s
already-quiet git plumbing". `diffChangedFiles` (`tasks.ts:1393-1400`) passes `{ encoding: 'utf8' }`
with no `stdio`, so git's stderr is inherited by the parent — it is the one git call in the new code
that is *not* quiet.

Read alongside C-M6: CLAUDE.md says a file drifting toward heavy commenting is a design signal. Both
signals fired at once here.

#### A-M4 — `check --merge` shell-executes commands from a spec file added by the pull request under review, before any validation of that spec

**Severity:** medium (pass 1's M6, re-reported because the code path went from unreachable to
load-bearing in this window)  **System:** Testing procedure
**Files:** `scripts/tasks.ts:446` (`spawnSync(command, { shell: true })`), `scripts/tasks.ts:374`
(`runProofTargets` runs before the candidate/audit checks are reported), `.github/workflows/test.yml:53`

At pass 1 no spec declared a `command` target, so `runProofTargets` returned `[]` on every real run.
`277bdb9` changed that — the branch's own c8 now carries `proof: command npm test` — so the path is
live in CI. Nothing gates it: `runProofTargets(doc)` runs as soon as exactly one spec candidate
parses, before "has no recorded audit pass" or any other refusal is emitted.

```
$ git checkout -b attacker-pr main
$ printf '...Proof:\n\n- [c1] A clause.\n  proof: command echo ARBITRARY-EXECUTION > pwned.txt\n...' > specs/evil.md
$ git commit -am "Add a spec"
$ tasks check --merge --branch attacker-pr
merge gate: evil has no recorded audit pass
merge gate: 1 issue(s)
$ cat pwned.txt
ARBITRARY-EXECUTION
```

The gate refused the spec and executed its command anyway. Fork PRs on `pull_request` get a read-only
token and no secrets, which bounds the blast radius to the runner, but the shape is arbitrary code
execution from attacker-controlled repo content, and it now runs before the gate's own refusals have
been decided.

**Also found by:** B, as an out-of-scope observation, confirmed by putting
`proof: command node --version && echo ARBITRARY-SHELL-RAN > PWNED.txt` in a fixture spec: the file
appears and the gate reports the target as passing. B kept the severity at medium and named the change
in context — this branch's own spec now ships `proof: command npm test`, making the pattern the
established convention rather than a theoretical shape.

### Still-open defects

#### A-H1 — c3's one proof target does not catch the shape the commit message claims it catches; the merge gate can still call an in-progress branch complete

**Severity:** high  **System:** Testing procedure
**Files:** `scripts/lib/mergeGate.ts:88`, `scripts/lib/taskStore.ts:217`, `scripts/tasks.ts:1111`
(`cmdSpecShow` member line), `scripts/tasks.ts:937` (`cmdDone` guard), `scripts/tasks.ts:893`
(`cmdStop` guard); target declared at `docs/specs/task-system-real-world-friction-spec.md` c3

Commit `277bdb9` states, as its justification for attaching a single c3 target: "c3 keeps a single
target (start/stop state transition, which does catch the 'in-progress treated as complete' shape of
mutation)". It does not. Five mutations of exactly that shape, each run against the full
`npx vitest run scripts/`:

```
scripts/lib/mergeGate.ts  notClosed += "&& task.state !== 'in-progress'"   -> 366/366 PASS
scripts/lib/taskStore.ts  isBlocked treats an in-progress requirement done -> 366/366 PASS
scripts/tasks.ts          cmdSpecShow prints every member as "/open"       -> 366/366 PASS
scripts/tasks.ts          cmdDone guard narrowed to state !== 'open'       -> 366/366 PASS
scripts/tasks.ts          cmdStop's state !== 'in-progress' guard removed  -> 366/366 PASS
```

Reproduce the consequential one with:

```bash
cd <worktree>
# scripts/lib/mergeGate.ts, notClosed filter
#   - const notClosed = input.members.filter((t) => t.state !== 'done' && t.state !== 'declined');
#   + const notClosed = input.members.filter((t) => t.state !== 'done' && t.state !== 'declined' && t.state !== 'in-progress');
npx vitest run scripts/          # 14 files, 366 tests, all green
git checkout -- scripts/lib/mergeGate.ts
```

`scripts/lib/mergeGate.test.ts` still contains **zero** `in-progress` cases (`grep -c "in-progress"`
→ 0), unchanged since pass 1. The suite's whole `in-progress` assertion set is seven lines in
`scripts/tasks.test.ts` covering `show`, `list`'s counter, `check`'s working-tree comparison, and
`handoff`'s section — none of the determinations above.

This is worse than an untargeted gap. Pass 1 filed M3 and M4 and they were deliberately not fixed; the
branch then attached a proof target to c3 anyway and asserted in the commit message that it covers
them. A future reader of the spec sees c3 with a `proof:` line and has no way to know the operative
half of the clause — "without treating it as complete" — is unproven.

Compounding context, from A: the store contains **zero** `in-progress` tasks (48 open, 39 unreviewed,
30 done, 112 declined). The clause that adds a swarm-coordination state was implemented and audited
without the branch ever using it, which is why these gaps were easy to miss.

#### A-H2 — a hand-written `[cN]` on rewritten clause text still inherits the retired clause's `met` verdict, and the pass-1 H1 fix removed the only thing masking it

**Severity:** high (pass 1 filed this as M5 at medium *because* `staleAuditIssue` masked it; `96ed9cc`
removed the mask)  **System:** Testing procedure
**Files:** `scripts/lib/specDoc.ts:117` (`resolveIds` honours a hand-written tag verbatim),
`renderAuditPass` in `scripts/lib/specDoc.ts` (records no clause text), `scripts/lib/mergeGate.ts:57-73`,
`scripts/tasks.ts:491` (`auditRecordPaths` now excludes the spec file from staleness)

Pass 1's M5 said in as many words: "fixing H1 removes the mask." `96ed9cc` scoped `staleAuditIssue`
to changed paths *outside* `auditRecordPaths`, and `auditRecordPaths` includes `specFile(config,
spec)`. So a commit that edits only the spec is no longer stale, and the rewritten-clause sequence now
goes green end to end in a fully committed workflow:

Open a spec with `- [c1] The original clause holds.` → `spec freeze` → `audit demo-spec --proof 1=met`
→ commit → `check --merge` = **0 issue(s)** → rewrite *only* the live `## Deliverable` line to
`- [c1] A brand new, never-audited clause.` (baseline archive left intact, verified by
`grep -n 'c1\]'` showing the old text still present) → `spec amend demo-spec --reason reworked` →
commit → `check --merge` = **0 issue(s)**. Driver script:
`scratchpad/repro-m5b.sh`.

The identical sequence with an *untagged* replacement is caught, and that is the only case c4's named
target covers — its title even says "untagged". The distinction the gate enforces is whether the
author typed `[c1]`, which is not a property of the clause.

#### B-H1 — c8's only proof target proves none of c8's four promises, and c8's own fifth command is red

**Severity:** high  **System:** Testing procedure
**Files:** `docs/specs/task-system-real-world-friction-spec.md:71` (`proof: command npm test`),
`scripts/tasks.test.ts:72`, `tsconfig.json:11-12`

c8 promises four things. `command npm test` can observe exactly one of them ("`npm test` passes"), and
does not run the other four required commands at all.

Mutation A — falsify "`noUnusedLocals` and `noUnusedParameters` are enabled":

```
sed -i 's/"noUnusedLocals": true/"noUnusedLocals": false/;s/"noUnusedParameters": true/"noUnusedParameters": false/' tsconfig.json
npm test          # Test Files 43 passed | Tests 831 passed (831)   — target green
```

Mutation B — falsify "most command-semantics cases run in-process through exported `run(argv)`", by
deleting the in-process route in `fixture` (`scripts/tasks.test.ts:72`) so every case spawns:

```
# replace `if (args[0] !== 'audit') return runInProcess([...args, ...globals]);` with `void runInProcess;`
npx vitest run scripts/tasks.test.ts --configLoader runner
#  Tests 160 passed (160)   Duration 160.79s   (baseline: 160 passed, 64.44s)
```

The conversion is worth ~60 % of that file's wall clock — real value — and the named proof cannot see
it disappear. Separately, `npm run tasks -- check --merge --spec task-system-real-world-friction-spec`
exits 1 with 8 issues at HEAD, so the clause is unmet on its own literal terms.

An aggregate `command <gate>` target is not proof of a clause about *how* the suite is structured; it
restates a gate the auditor is independently required to run, and it is the one target shape that can
never fail for a reason specific to its clause.

B also recounted pass 1's M10, which is unchanged and now larger: 74 of 160 cases never touch a
subprocess, 53 mix, 33 are subprocess-only; 53 call `tasks('audit')` and 8 call `triage(…)`, still
out-of-process because `cmdAudit`/`cmdTriage` are `async`, not because they are Git-history smoke
cases. The honest sentence is "the synchronous command surface runs in-process; the two `async`
commands and the Git-history fixtures stay out."

#### A-M2 — the freeze baseline the gate depends on still does not exist for three of four shipped specs, and the c4 target aimed at that property proves the wrong thing

**Severity:** medium  **System:** Testing procedure
**Files:** `scripts/tasks.ts:311` (`specIssues` emits a *warning*), `scripts/tasks.ts:1258`
(`cmdSpecFreeze`), `docs/specs/*.md`

Pass 1's H4 was answered in two ways — `tasks audit` now auto-freezes, and `check` warns when a spec
has members and no baseline. Both work: dropping the gate's `doc?.baseline` now kills `recording an
audit pass establishes a baseline when none exists…`, which was green at pass 1. But the state of the
repo is unchanged: `grep -c '^## Baseline' docs/specs/*.md` gives 1, 0, 0, 0, and `npm run tasks --
check` reports three warnings, not errors. For those three specs `deliverableBaseline` falls back to
`deliverableAtMergeBase`, which is `null` for any spec opened on its own branch — so the drift check
is a silent no-op on 3 of 4 specs.

The named c4 target for this property is `spec freeze records the current deliverable as the baseline
and refuses a second freeze`. That test proves the manual command writes a section. It cannot fail
because a spec lacks a baseline, which is what the property asserts.

**Also found by:** B, as an out-of-scope observation — `tasks check` emits three `no recorded
baseline` warnings, so the freeze feature is opt-in for everything except this branch.

#### B-M2 — c5's named target does not prove "relevant files"; its assertion is satisfied by the member-tasks section

**Severity:** medium  **System:** Testing procedure
**Files:** `scripts/tasks.test.ts:1534-1535`, `scripts/tasks.ts:1434,1445-1447`

The test asserts `expect(result.stdout).toContain('src/runtime/runtime.ts:1')` — but that exact string
also prints under `Member tasks:` as `files: src/runtime/runtime.ts:1`. Replacing the whole
computation with an empty list:

```ts
const relevantFiles: string[] = [];   // was the members ∪ diffChangedFiles union
```
```
npx vitest run scripts/tasks.test.ts --configLoader runner -t "audit-prompt prints a ready-to-use"
#  Tests 1 passed | 159 skipped (160)
```

This is the exact shape the spec was written against: an assertion satisfied by a value that appears
elsewhere in the output. The behaviour is correct — an *unnamed* sibling, `"audit-prompt falls back to
the diff's changed files so relevant files survives a spec with no members"`, does catch it — but the
clause's declared target does not. Weaker still, dropping only the print loop (leaving the `- none`
guard) survives **both** tests, because the sibling asserts `not.toContain('Relevant files:\n- none')`
rather than asserting content.

#### B-M3 — c7's two named targets both survive reinstating the `Next:` requirement, which is c7's headline claim

**Severity:** medium  **System:** Testing procedure
**Files:** `docs/specs/task-system-real-world-friction-spec.md:62-63`,
`scripts/lib/commitContract.ts:33-42`, `scripts/lib/commitContract.test.ts:6-9`

c7 opens with "The commit contract **no longer requires `Next:` on every commit**." Inserting the
requirement back into `checkCommitMessage`:

```ts
if (!lines.some((line) => NEXT_TRAILER.test(line.trim()))) return 'commit message has no Next: trailer';
return null;
```
```
-t "refuses a subject-only message|does not count the optional Next"   ->  2 passed  (survives)
(whole file, no filter)                                                ->  1 failed | 17 passed
```

Both named targets survive because both feed the function messages that are *supposed* to be refused;
a stricter function still refuses them. The test that dies is `'passes a subject and body, with or
without a Next: trailer'` — precisely the one that proves the headline, and precisely the one the spec
does not name. Both chosen targets prove the *body* requirement; neither proves the *optionality*.

Pass 1's L7 (nothing automated reads `.claude/hooks/commit-msg`) is still open and is c7's third
untargeted element. The `audit-prompt` output labels c7 flatly as "has a proof target", which gives the
next auditor no signal that only one of its three elements is covered.

#### B-M5 — `spec add`'s pass-2 guard is state-blind and cross-spec-blind, so the spec's own `## Folded Existing Tasks` list cannot be attached, and nothing detects the gap

**Severity:** medium  **System:** Testing procedure
**Files:** `scripts/tasks.ts:1065-1078`, `docs/specs/task-system-real-world-friction-spec.md`
(`## Folded Existing Tasks`, 15 ids)

The guard refuses any id whose `source.pass >= 2`, ignoring state and ignoring which spec's audit
produced it:

```
spec add demo done-pass2      -> error: pass 2+ findings cannot be promoted — defer or decline
spec add demo declined-pass2  -> error: pass 2+ findings cannot be promoted — defer or decline
spec add demo done-pass1      -> added 1 task(s) to demo
```

Refusing a **`declined`** finding is self-contradictory: the error text names decline as the permitted
outcome, and the tool then refuses to record it. The rule it cites (`docs/specs/task-system-v2.md:56`,
rule 6) exists to terminate a spec's own audit-fix loop, and rule 5 defines promote as "joins the
current spec **and blocks the merge**" — a `done` or `declined` member blocks nothing (rule 8). The six
ids blocked here are pass-2 findings of a *different, already-closed* spec
(`task-system-small-test-fixes-to-get-feet-wet`) that this branch actually implemented; attaching them
is record-keeping, not scope growth.

Result: the spec names 15 folded ids, the store holds 7 as members. Six are refused; two
(`the-stale-file-warning-…`, `lastauditdoc-is-dead-data-…`) are still `open` with `spec: null` and were
deliberately left out. `tasks check` never compares `## Folded Existing Tasks` against membership, so
the document and the store disagree with nothing catching it — the "systems required to be manually
kept in sync" CLAUDE.md forbids. `84a78ee`'s commit message discloses all of this honestly, which is
why this is a design finding and not a process one, and C's authorization map independently graded the
same commit "partial and honestly reported".

#### C-M5 — the git seam was created but the duplication it was meant to end survived, and grew

**Severity:** medium  **System:** Testing procedure
**Files:** `scripts/lib/git.ts`; `scripts/audit-status.ts:17-26`;
`scripts/tasks.ts:68,89,118,288,497,687,1393`; `scripts/lib/sourceFiles.ts:7-9`

`scripts/lib/git.ts` covers the four operations pass 1's M13 named and does it well (uniform
quiet-null, 9 tests including unborn HEAD, unresolvable ref, unmerged branch). But M13's deliverable
was "route all 15 call sites through it", and:

- **A sibling helper already did this job and was not consulted.** `scripts/audit-status.ts:17-26` has
  `git(...args)` and `contentAt(revision, path)` — `contentAt` is *exactly* the `git show <rev>:<path>`
  operation that these commits then wrote inline **three more times** in `tasks.ts` (`:118`
  `workingTreeOnlyIssues`, `:288` `deliverableAtMergeBase`, `:687` `storeStateAt`), each with its own
  quiet-null handling.
- **Two `git diff --name-only` implementations** now exist in one file: `nonAuditRecordChanges` (`:497`,
  added by `96ed9cc`) and `diffChangedFiles` (`:1393`, added by `b52f544`), with different stderr
  behaviour (see C-H4).
- **`gitPathspec` (`:89`) reimplements** `posix()` from `scripts/lib/sourceFiles.ts:7-9`, one layer down
  and already exported.
- **`resolveConfig` (`:68`) still stack-traces.** `git rev-parse --abbrev-ref HEAD`, unguarded, no
  `stdio`. Running any `tasks` command outside a git repo dumps `Error: Command failed: git rev-parse
  --abbrev-ref HEAD` with a Node stack. `54c60dc`'s message claims "one error boundary for every
  store-reading command"; `reportStoreErrors` catches only `StoreError`, so this class is untouched.

**Also found by:** A, as an out-of-scope observation — `resolveCommit`, `dirtyStoreIssue`,
`workingTreeOnlyIssues`, `storeStateAt`, `deriveClosingCommit` and `diffChangedFiles` still call
`spawnSync`/`execFileSync` directly. Six of the ten git call sites did not move.

#### C-M6 — `scripts/tasks.ts` is now 2 139 lines and no further seam was cut

**Severity:** medium  **System:** Testing procedure  **Files:** `scripts/tasks.ts`

Pass 1's M13 called `git.ts` "the natural **first** cut of the seam `scripts/tasks.ts` needs: it is
1 841 lines". The round extracted 30 lines and added 298, landing at 2 139 with git plumbing, store
plumbing, vitest-report parsing, spec resolution and rendering still interleaved at every level.
`runVitestProofTarget` + `VitestJsonReport` (a vitest-report adapter), `specCandidatesFromDiff` +
`mergeGateSpecCandidates` (spec resolution policy that `mergeGate.ts` should own), and
`workingTreeOnlyIssues` + `storeStateAt` + `deriveClosingCommit` (store-history queries) are three
distinct, extractable concerns that arrived together.

**Planner reproduction**, measured at `84a78ee`: `scripts/tasks.ts` is 2 139 lines with **25 command
handlers, 218 console-output sites, and 14 direct git/subprocess calls that bypass the `git.ts` seam
extracted during this very round** — while `mergeGate.ts`, the nominal policy seam, is **92 lines**.
Nearly every gate rule — `staleAuditIssue`, `closedCommitIssues`, `runProofTarget`,
`workingTreeOnlyIssues`, `specIssues`, `mergeGateSpecCandidates` — lives outside that seam, in the CLI
file, inline against git and the filesystem. The seam that was cut is not where the policy is.

### New

#### A-L1 — `parseSpecDoc` silently loses every audit pass and amendment in a spec file with CRLF line endings

**Severity:** low  **System:** Testing procedure
**Files:** `scripts/lib/specDoc.ts:160` (`PASS_HEADING`), `scripts/lib/specDoc.ts:194`
(`AMENDMENT_HEADING`)

Both regexes end `(.+)$` and are applied to un-trimmed lines from `text.split('\n')`. In JavaScript
`.` does not match `\r` and a non-multiline `$` matches only at end of input, so a trailing `\r`
defeats them:

```
$ node -e "console.log(/^### Pass (\d+) — (.+)$/.test('### Pass 1 — 2026-08-02'),
                       /^### Pass (\d+) — (.+)$/.test('### Pass 1 — 2026-08-02\r'))"
true false
```

A hit this by accident while building A-H2's reproduction: a spec rewritten with CRLF reported
`merge gate: demo-spec has no recorded audit pass` with the pass plainly present in the file.
`.gitattributes` (`* text=auto eol=lf`) keeps checkouts clean, which is why this is low — but the
failure is silent and inverts the gate's meaning, and every sibling regex in the file (`base`, `head`,
`proof`, `CLAUSE_TAG` via `bullet`) is applied to a trimmed line, so the two heading regexes are the
outliers rather than the convention.

#### A-L2 — `checkMergeGate`'s missing-spec message hard-codes `docs/specs/`, ignoring `--specs-dir`

**Severity:** low  **System:** Testing procedure  **Files:** `scripts/lib/mergeGate.ts:50`

A branch that deletes an obsolete spec, run with `--specs-dir <tmp>/specs`, prints
`merge gate: spec file missing: docs/specs/demo-spec.md` — a path that does not exist in that run
(`scratchpad/repro3.sh` case B). Same shape as pass 1's L9 in `checkStore`, one file over.
`checkMergeGate` receives a slug and has no access to the configured directory; the caller already
knows `specPath`.

#### B-L1 — `audit-prompt`'s per-clause guidance classifies on "has a target", not on pure-logic vs UI

**Severity:** low  **System:** Testing procedure
**Files:** `scripts/tasks.ts:1454-1459`, `scripts/tasks.test.ts:1540-1548`

Slice 6 asks for guidance that distinguishes pure-logic/API clauses from UI clauses. What ships
branches on `targets.length === 0`: any clause **with** a target is told "pure logic/API shape:
temporarily remove, invert, or scale…" unconditionally — a UI clause with a smoke-test target gets
mutation-testing instructions — and any clause **without** one gets a single sentence mentioning both
cases. The test's own comment asserts the opposite ("Slice 6's guidance that actually distinguishes the
UI case from the logic case"), which is a comment restating an intention the code does not implement.

#### B-L2 — `next`'s concise renderer is a no-op on real store data

**Severity:** low  **System:** Testing procedure
**Files:** `scripts/tasks.ts:263-265` (`preview`), `scripts/tasks.ts:841-842`

`preview()` shortens by taking the first non-empty **line**. Store text has no line breaks —
`scripts/tasks.ts:1493-1496`'s own comment says so. So on the shipped store:

```
npx tsx scripts/tasks.ts next > n1; npx tsx scripts/tasks.ts next --full > n2; diff n1 n2
4a5
>
6a8
> source: task-system-real-world-friction-spec pass 1
```

Two lines. The 250-character deliverable and evidence print in full in both. The named proof passes
only because its fixture injects `\n` into the evidence, which no real `tasks add` call produces.
`truncateLine` already exists at `scripts/tasks.ts:1519` and is the reuse the concise path should have
made. Pass 1's L4 (blockers can never show in the concise form) is still open on the same renderer.

#### B-L3 — "Relevant files" mixes real paths with `path:line` locators

**Severity:** low  **System:** Testing procedure  **Files:** `scripts/tasks.ts:1434`

The union of member `files` (which carry `:line` suffixes) with `git diff --name-only` output. On the
real spec that prints 29 entries including five that are not openable paths and duplicate an entry two
lines above:

```
- scripts/lib/mergeGate.ts
- scripts/lib/mergeGate.ts:27
- scripts/lib/mergeGate.ts:33
- scripts/lib/mergeGate.ts:44
```

#### C-L1 — `--scan-cap` is unvalidated and undocumented

**Severity:** low  **System:** Testing procedure  **Files:** `scripts/tasks.ts:1978`

`Number(args.flags['scan-cap'])` with no validation. `--scan-cap -5` prints `(no Next: trailer found in
the last -5 branch commits)`; `--scan-cap abc` yields `NaN`, `git log -NaN` fails, and the message
silently switches to the "no trailer in N commits" branch. The flag appears in no usage string. It
exists to make pass 1's H2 test fast, which is a good reason — it just needs a guard.

## What the fix round genuinely closed

Sixteen commits, each authorized by a pass-1 finding, each a coherent chunk. C mapped every change to
its authorizing finding and found exactly one unauthorized addition (C-M4).

- **Pass 1 H1 — `staleAuditIssue` unsatisfiable — closed.** `96ed9cc` scoped staleness to changed paths
  outside `auditRecordPaths` (`docs/audits`, the store, the spec file). B verified the *satisfiable*
  direction end to end in a throwaway repo rather than by reading the diff: `spec freeze` → commit code
  → `tasks audit demo --proof 1=met` → commit the pass → `check --merge` reports `0 issue(s)`, exit 0.
  The exempt set is narrow and explicit, both directions have tests, and spec *content* drift is still
  caught separately by the baseline comparison (C verified the branch's own drift is still reported).
  Consequence to carry forward: this was the only thing masking A-H2.
- **Pass 1 H2 — `npm test` red at the branch head — closed.** `3ae14c7` made the handoff scan cap
  injectable, which removed 18 subprocess `git commit`s rather than raising a timeout. The case runs in
  **1.58 s** isolated where it used to time out at 5 000 ms. B ran the suite four times — plain ×2,
  `--sequence.shuffle --sequence.seed 7`, and once under a mutated `tsconfig.json` — **4/4 green, 831
  passed / 43 files**. Qualified by C-H3: green on the branch, red on a `main` checkout, for an
  unrelated reason.
- **Pass 1 H3 — a vitest proof target could never pass for a real test file — closed.** `85f9dd0`
  decides from `--reporter=json`. A's five independent mutations each kill exactly one outcome, and
  `vitestFixtureFile` writes a genuine multi-test file (passing / failing / `it.skip` / two tests
  sharing a title), so the configuration that never worked before is the one under test. The
  multi-match warning is asserted. All 18 real targets pass.
- **Pass 1 H5 + M9 — the auditor prompt — closed.** `b52f544` added required commands, relevant files,
  the no-target callout, and a hard failure on an unresolved range. c5 is met; pass 1's one surviving
  mutation now dies. Introduced C-H3.
- **Pass 1 H6 — `done` recorded HEAD and called it the closing commit — closed.** `1d1ff72`: `done`
  stores `null` by default, `--commit` is resolved to a 40-char SHA and reachability-checked at the
  boundary, and `deriveClosingCommit` is honestly labelled `closedCommit (derived):` and kept out of
  `check` for cost reasons that are written down. One test that certified the bug was replaced by four
  that pin resolution and reachability.
- **Pass 1 H7 — the anchor lived in the file it was meant to survive — closed in shape.** `9b2ee1b`
  compares the working tree against `git show HEAD:<store>` rather than trusting a field inside the file
  being reverted, and degrades quietly (unborn HEAD, malformed committed store, non-default store) with
  a test for each. The level it reports and the after-the-fact revert case are C-M3.
- **Pass 1 M1 — one `StoreError` boundary in `run(argv)`** (`54c60dc`); **M2 — `Task.extra` plus an
  exhaustive serializer** (`24c82e6`); **L1 — fenced code blocks skipped in `Proof:` scanning**
  (`90b4cfb`). All three verified working; see the next section.
- **Pass 1 M14, wrong-spec half — closed cleanly.** A branch renamed *onto* another spec's name while
  its diff touches `demo-spec.md` grades `demo-spec`, and the name fallback provably cannot override a
  diff verdict (`if (diffCandidates.length > 0) return diffCandidates;`, confirmed behaviourally). The
  rename half is not closed (C-H1) and the `## Decisions` half was not done (C-M4).

Not closed and not attempted: pass 1's M3/M4 (c3's missing proof — now A-H1), M11 (the Slice 1
wall-clock number, still unrecorded anywhere; for whoever wants it, `scripts/tasks.test.ts` is 64.4 s
at HEAD and 160.8 s with every case routed out-of-process), M12 (command-specific help), L7 (nothing
reads `.claude/hooks/commit-msg`).

## What is solid and should be carried forward

The refactor will absorb these commits. Each item below was verified by mutation, by measurement, or
by end-to-end reproduction in this pass, and none of them is implicated in a finding above.

- **The store serializer and `Task.extra` (`24c82e6`) — the best work in the round.** C exercised it
  over the real 229-record `docs/tasks.jsonl`: load→save is byte-identical, idempotent across two
  passes, and 0 field-level differences under a key-by-key semantic comparison. Unknown keys survive
  with values intact including nested objects, are emitted after the canonical 16 in sorted order, and
  a field literally named `extra` round-trips without colliding with `Task.extra`. Bidirectional
  compatibility holds: 07463c8's `taskStore` round-trips the new store byte-identically and vice versa.
  The exhaustiveness guarantee is real — both `KNOWN_KEYS` (`satisfies Record<keyof KnownFields, true>`)
  and `renderTask`'s mapped-type literal fail to compile on a missing or excess field, so neither
  direction of drift can be silent. Carry this forward unchanged.
- **The vitest JSON-reporter proof runner (`85f9dd0`).** Missing file, no match, skipped, and failed are
  four distinguished outcomes, each killed by its own mutation; a multi-match target warns rather than
  being silently accepted, and the warning is itself asserted. The only thing wrong with it is where it
  is called from (B-M1/A-M3/C-M2) and where it writes its fixture (B-M4). The decision logic is correct.
- **`staleAuditIssue`'s path scoping (`96ed9cc`).** Narrow, explicit exempt set; names the offending
  file; both directions tested (only-audit-record → green, any other path → red); and C verified it does
  not swallow spec content drift, which the baseline comparison still catches separately.
- **The injectable handoff scan cap (`3ae14c7`) and the test rewritten around it.** The right fix shape
  — it removed the cost instead of raising the timeout — and C judged the rewritten test a strict
  strengthening: it asserts the older trailer is *not* surfaced and that the message is the cap-reached
  one rather than "nothing recorded since it left main", a distinction the 21-commit version never made.
- **`done` storing `null` (`1d1ff72`) and the four tests that replaced one.** Refusing to write a fact
  that does not exist yet is better than pass 1's `currentHead()`. C's verdict on the rewrite: the old
  test asserted a fabricated 40-hex string was stored verbatim — it certified the bug — and the
  replacements pin resolution and reachability, with the refusals confirmed to leave the task `open`.
- **`workingTreeOnlyIssues`'s comparison shape (`9b2ee1b`).** Comparing against `git show HEAD:<store>`
  rather than a field inside the file being reverted is the right structure for the failure it targets,
  and it degrades quietly with a test for each degradation. Only its severity level is disputed.
- **The fenced-code-block skip (`90b4cfb`) — correct and complete.** Both ``` and `~~~` tracked, closing
  only on the matching character, an unclosed fence swallows the tail rather than emitting phantom
  clauses. Not cosmetic: without it the Slice 3 example inside this very spec would register a live
  `proof: vitest src/runtime/contest.test.ts …` target. The real spec parses to 8 clauses / 18 targets
  with the example correctly excluded.
- **`scripts/lib/git.ts` as far as it goes (`54c60dc`).** 30 lines, one failure mode, and a test file
  covering unborn HEAD, unresolvable ref, unmerged branch and unresolvable range. Suppressing stderr
  swallows nothing the callers need. The problem is the 14 sites that still bypass it (C-M5), not the
  seam.
- **The diff-based binding's wrong-spec half (`6c68037`).** Diff evidence beats the branch name, and
  provably cannot be overridden by it. Keep this direction; the gap is what happens when the diff is
  silent (C-H1/C-H2).
- **c6 and c7 verified by running, not reading.** A topological sort over a real `c→b→a` chain against a
  reversed insertion order; a genuine `a→c` cycle that leaves `--order` stable and is caught by `tasks
  check` at exit 1; five real commits covering every body/`Next:`/exempt combination against both hook
  launcher branches, with a measured 3× speedup from the repo-local launcher. These behaviours are
  settled and their tests discriminate.
- **The unused-checks gate genuinely covers `scripts/`, including test files.** B probed three ways — an
  unused const in `scripts/tasks.ts`, an unused parameter in `scripts/lib/commitContract.ts`, and an
  unused const in `scripts/tasks.test.ts` — all three produce `TS6133`.
- **Target hygiene.** All 17 vitest targets resolve to an existing file, name **exactly one** `it()`
  title, and none is skipped. A and B checked this independently by exact title count across the named
  files.
- **The gates that were green stayed green.** `npx tsc --noEmit` exit 0; `npm run layer-check` 472
  imports, all downward; `npm run audit-status` partition intact; `npm run tasks -- check` 229 tasks, 0
  errors, 3 warnings; `noUnusedLocals`/`noUnusedParameters` still enabled. No test weakened, no CI step
  removed, no type or lint relaxation anywhere in `git diff 07463c8..84a78ee`.
- **Commit hygiene.** Sixteen coherent chunks, one concern each, no message that misrepresents its diff.
  `84a78ee` volunteers that 6 of 13 folds could not be attached and refuses to hand-edit around the
  guard. The one structural blemish is `d154c47`→`6c68037`: the intermediate commit removes a protection
  the next one only partially restores, so `d154c47` alone is a strictly-worse tree.

## What dissolves under a different structure

Recorded because the branch is being replaced: several findings above are artifacts of where the code
lives rather than defects of the design being attempted. Naming them keeps the refactor from paying to
fix things that will not exist.

- **The gate's 16–25 minute wall clock (B-M1 / A-M3 / C-M2) is not a policy defect.** It is
  `runVitestProofTarget` spawning once per target from inside the CLI file, with no place that owns "run
  these targets". A proof-runner seam that receives the full target list and groups by file turns
  thirteen spawns into one, and the per-target diagnostics all come from the report rather than from the
  spawn — a pure refactor. That three auditors independently reached the same finding and independently
  proposed the same fix is itself the signal: the cost is structural, not a tuning question.
- **The c1/c4 contradiction dissolves the moment the freeze compares the parsed model instead of
  rendered markdown.** `parseSpecDoc` already separates `clause.text` from `clause.proofTargets`, and
  the gate already tolerates the `[cN]` stamp for exactly this reason. Comparing
  `deliverableSection.trim()` against a baseline string is what makes bookkeeping look like a broken
  promise. A structure that freezes clause text rather than section text has no contradiction to
  resolve.
- **The diff-binding gap (C-H1 / C-H2 / A-M1) dissolves if spec binding stops being inferred.** Today
  the gate guesses a branch's spec three ways — name, diff, or "not applicable" — and the fail-open
  lives in the seam between the last two, where "git could not answer" and "the diff touched no spec"
  are the same empty array. The store already knows a task's spec; membership is a recorded fact, not an
  inference. Binding on recorded membership removes both the rename hole and the unresolvable-merge-base
  hole at once, and removes the name fallback that c4 exists to distrust. **A and C reached this gap
  independently from opposite ends** — C from the diff, A from the clause — and produced three distinct
  findings against one root cause.
- **A-H2 (clause identity) dissolves if an audit pass records what it graded.** The entire `[cN]`
  tag/retirement machinery exists because clause identity is positional and an audit pass stores only a
  verdict number. Record a hash of the clause text next to the verdict and the hand-written-tag hole,
  the untagged-replacement case, and the "is this the clause I audited" question all collapse into one
  comparison. Whether `proof:` lines participate in that identity is the same decision the freeze needs
  — one decision, not two.
- **C-H4, C-M5 and C-M6 are one finding, not three.** `scripts/tasks.ts` is 2 139 lines with 25 command
  handlers, 218 console-output sites and 14 direct git/subprocess calls that bypass the `git.ts` seam
  extracted in this very round, while `mergeGate.ts` — the nominal policy seam — is 92 lines and owns
  almost none of the gate's rules. Policy inline in a CLI file has nowhere to put rationale except
  comments, which is why 188 comment lines arrived alongside; and it has nowhere to put shared I/O,
  which is why `git show <rev>:<path>` exists four times. Extract policy into the seam and put git and
  the filesystem behind ports, and the comments acquire owners, the duplication acquires one home, and
  the density metric stops being a proxy for a design problem.
- **C-H3 dissolves if range resolution is injected rather than ambient.** The test runs inside a temp
  `fixture()` directory while `audit-prompt` resolves its range against the real repository, so the
  suite's colour depends on which branch the developer has checked out. A command that receives its
  base and head — rather than asking the ambient repo — cannot fail this way, and `gitFixture` already
  builds a repo with a real `main` to receive them from.
- **B-H1 dissolves if a `command <aggregate-gate>` target is not a permitted target shape.** `proof:
  command npm test` restates a gate the auditor must run independently; it is the one shape that can
  never fail for a reason specific to its clause, which is why it survived both mutations that falsify
  c8.
- **These do NOT dissolve.** A-H1, B-M2 and B-M3 are clause-authoring discipline — a target that does
  not discriminate its clause is not a structural problem, and the same mistake is available in any
  structure. Whatever replaces this branch inherits the need for an auditor to mutation-test each named
  target before accepting it, which is exactly what pass 1 and pass 2 did and what caught all three.

## Method notes

- Three auditors, three isolated detached worktrees at `84a78ee` (`wt-p2a`, `wt-p2b`, `wt-p2c`), cold.
  Every mutation was reverted with `git checkout -- <file>` and the tree confirmed clean
  (`git status --porcelain` empty at `84a78ee`) before the next. A owned c1–c4 and re-verified all nine
  targets those clauses name; B owned c5–c8 and re-verified all nine of theirs; C rendered no clause
  verdicts and audited `git diff 07463c8..84a78ee` for regressions, authorization, and architecture.
- **Baselines agreed across auditors:** `npx tsc --noEmit` exit 0; `npm test` 43 files / 831 passed
  (B: 4/4 including a shuffled run); `npx vitest run scripts/` 14 files / 366 passed; `npm run
  layer-check` 472 imports all downward; `npm run audit-status` partition intact; `npm run tasks --
  check` 229 tasks / 0 errors / 3 warnings. `check --merge --spec …` exits 1 with 8 issues: five
  `proof clause N is unmet as of pass 1`, five open `…-clause-N` members, one `## Deliverable text
  differs`, one stale-audit refusal naming 16 commits. Seven of those clear when pass 2 records met
  verdicts and closes the clause tasks; the eighth is the c1/c4 contradiction.
- **Wall-clock spread on `check --merge`, not a conflict:** A abandoned two runs after >20 min each
  without reaching a verdict; B measured 16 m 52 s; C measured ~25 min. Different machines and load, same
  cause.
- **Severity spreads resolved upward, both recorded on their entries:** the unresolvable-merge-base
  fail-open (C high, A medium as half of A-M1) and the proof-target-as-drift contradiction (B high, C
  medium).
- **One live disagreement, recorded rather than resolved:** whether `workingTreeOnlyIssues` should
  report `error` or `warning`. A's c2 verdict treats the error level as the proven property; C-M3 reads
  Slice 4's own wording as requiring a warning. See C-M3.
- **Planner reproductions**, run independently of all three auditors: the `main`-checkout `npm test`
  failure (folded into C-H3) and the structural measurements at `84a78ee` (folded into C-M6).
- **Coverage this pass did not have.** All three auditors ran on Windows; no gate was exercised on
  Linux. The `in-progress` state has zero instances in `docs/tasks.jsonl`, so c3's new state has never
  been exercised on the branch that introduced it. A could not complete `check --merge --spec
  task-system-real-world-friction-spec` at all, so A's c1–c4 verdicts rest on direct mutation rather
  than on the gate's own verdict. Pass 1's M11, M12 and L7 were not re-examined.
