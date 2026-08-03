# Testing procedure audit — 2026-08-01

Independent audit of branch `task-system-real-world-friction-spec` at `07463c8`, covering the 14
commits since `91cd1ed`, against the eight proof clauses of
`docs/specs/task-system-real-world-friction-spec.md`.

Method: four auditors in isolated git worktrees, each mutation-testing its own clauses; findings
reconciled here. A owned c2/c3, B owned c1/c4, C owned c5–c8, D audited the whole diff against
`CLAUDE.md` and rendered no clause verdicts. Every auditor ran the gates independently and they
agree: `npx tsc --noEmit` clean under the newly-enabled `noUnusedLocals`/`noUnusedParameters`;
`npm run layer-check` passes on 470 cross-file imports, all downward; `npm run audit-status`
partition intact; `npm run tasks -- check` reports `188 task(s), 0 error(s), 0 warning(s)`.
Two do not pass. **`npm test` fails at HEAD** — `1 failed / 782 passed`, the handoff scan-cap case
timing out at 5000 ms (H2). And `npm run tasks -- check --merge --spec
task-system-real-world-friction-spec` exits 1 with `has no recorded audit pass`, which is the
expected pre-audit state — except that H1 shows it cannot be cleared afterwards either.

This is the first independent audit of the branch. Where a defect was found by more than one
auditor working blind, that is recorded, because independent corroboration raises confidence in
findings whose reproductions were built from different starting points.

## Clause verdicts

| clause | verdict | evidence |
|---|---|---|
| c1 — executable proof targets | **unmet** | B: inserting `return null` as the first statement of `runProofTarget`'s vitest branch — every vitest target unconditionally passes — leaves 176/176 green, and an end-to-end reproduction shows the shape *never* passes for a test file with more than one test. The `command` half is genuinely proven: deleting `runProofTargets` from `cmdCheck` kills the named test for the right reason. |
| c2 — closing-commit anchor | **unmet** | A: reducing `task.closedCommit = args.flags.commit ?? currentHead()` to `?? null` (`scripts/tasks.ts:761`) leaves 165/165 green; and the originating scenario (`tasks done` → `git checkout -- docs/tasks.jsonl` → `tasks check`) reports `188 task(s), 0 error(s), 0 warning(s)`. |
| c3 — `in-progress` lifecycle | **met, proof weak** | A: verified by hand on every named surface, and six lifecycle mutations are caught (`start`/`stop` transitions, `next` skipping, `list`'s not-closed default, `handoff`'s section, `start` refusing a blocked task). But A's own words: "Verdict stands on my own reproduction, not on the suite" — five mutations that make `in-progress` be treated as complete ship green (M3), and the `start → done` path plus both `stop` guards are untested (M4). |
| c4 — spec and proof identity | **unmet** | B: three of four properties are mutation-proven (untagged-id reservation, top-level-only ids, rename-with-open-members, non-regular files). "A never-amended spec has an opening freeze baseline" is false by default — three of the four shipped specs have no `## Baseline` — and mutating the gate to drop `doc?.baseline` entirely leaves the suite green. Clause-id retirement is enforced only against auto-assignment, not against a hand-written `[cN]`. |
| c5 — auditor prompt | **unmet** | C: `required commands` appears nowhere in `cmdAuditPrompt`; the prompt prints `Member tasks: - none` and therefore no relevant files, for the very spec it is generated for; and replacing `` `Diff range: ${base}..${head}` `` with `` `Diff range: ` `` leaves the named test green. |
| c6 — command surface | **met** | C: all five behaviours run correctly when invoked literally and all five die under mutation — `--help`/`help` dispatch, the `spec <slug>` alias, `specMembers`' `ordered` sort, `next`'s concise renderer, and `search`'s `(matches: …)` annotation. Slice 5's *command-specific* help is absent (M12), but c6's own wording does not require it. |
| c7 — commit contract | **met** | C: verified with real commits in a worktree — no body refused, body accepted, body+`Next:` accepted, `Next:`-only refused, `fixup!` exempt; both launcher branches enforce identically (the `npx` fallback forced by pointing the guard at a nonexistent path); `checkCommitMessage` dies under a drop-the-body mutation and a require-`Next:` mutation. One gap: nothing automated reads `.claude/hooks/commit-msg` (L7). |
| c8 — gates and test cost | **unmet** | C: the clause requires `npm test` to pass and it does not, reproducibly, on a clean checkout of HEAD (3/3 via `npm test`, 3/3 under `--sequence.shuffle` seeds 1/2/3, 3/3 in isolation). Separately, "only subprocess/Git-history smoke cases stay out-of-process" does not describe the routing (M10). The clause's own fifth command is also unreachable once this audit's pass is recorded and committed (H1). |

No report's evidence contradicts its stated verdict. Two verdicts carry caveats worth reading with
them: c3's "met" rests on the auditor's reproduction rather than the suite, and c6's "met" is a
clause-wording pass over a slice instruction that did not ship.

## Findings

### H1 — `staleAuditIssue` is unsatisfiable by construction: recording an audit pass creates the commit that reddens the gate

**Severity:** high  **System:** Testing procedure  **Found by:** D (H2); corroborated independently
by B (who could not drive any fixture or any of the four real specs to `0 issue(s)`) and confirmed
by planner code read
**Files:** `scripts/tasks.ts:350-365`, reached from `scripts/tasks.ts:294`; test at
`scripts/tasks.test.ts:1479-1489`

**Evidence:** `cmdAudit` writes `head:` = HEAD at the moment the audit runs. The spec-file and store
writes must then be committed, and that commit advances HEAD past the recorded head while leaving
the recorded head an ancestor — so the `ancestor but behind` branch (`tasks.ts:359-365`) fires
permanently. Reproduced in a clean throwaway repo:

```
$ tasks audit demo-spec --proof 1=met
recorded pass 1 for demo-spec: 1/1 clauses met
$ git add -A && git commit --no-verify -m "Record audit pass" -m "body"
$ tasks check --merge
merge gate: demo-spec's latest audit pass reviewed 3a6165c…; HEAD has 1 commit(s) after that audit
merge gate: 1 issue(s)

$ tasks audit demo-spec --proof 1=met        # try again at the new HEAD
recorded pass 2 for demo-spec: 1/1 clauses met
$ git add -A && git commit --no-verify -m "Record audit pass 2" -m "body"
$ tasks check --merge
merge gate: demo-spec's latest audit pass reviewed 9dd0c36…; HEAD has 1 commit(s) after that audit
```

The loop does not terminate. `git commit --amend` makes it worse: the recorded head becomes
unreachable and the message switches to the not-reachable branch. This is chicken-and-egg, not a
threshold to tune. `.github/workflows/test.yml:60` runs `check --merge` on every `pull_request`,
and GitHub checks out `refs/pull/N/merge` — a synthetic merge commit — so the branch tip is always
at least one commit behind HEAD: **every spec'd PR is permanently red.** It also makes c8's own
fifth command unreachable the moment this branch's first audit pass is committed.

The authorizing task asked only for a refusal when the pass head "is not an ancestor of HEAD,
naming how many commits have landed since the audit". The not-an-ancestor branch
(`tasks.ts:356-357`) discharges that and is correct; the additional ancestor-but-behind refusal is
the strictest available reading of the trailing clause and is what makes the gate unsatisfiable.

The one covering test asserts only that the gate *fires*. It never asserts the gate can be
*satisfied*, so it repeats the implementation's assumption rather than testing the contract.

Second-order effect worth naming: B established that this blunt commit-count refusal is currently
the only thing masking M5 (clause-id inheritance) and the rename residual in M14. It is load-bearing
by accident, so fixing it opens two other holes at the same moment.

**Deliverable:** pick one semantics and record it in the spec's `## Decisions`: (a) keep only the
not-an-ancestor refusal and demote the commit count to a warning; (b) exclude commits that touch
only the spec file and the store from the count; or (c) let `tasks audit` accept the closing commit
after the fact (`tasks audit --head <sha>`), mirroring `done --commit`. Whichever is chosen, add a
test that records an audit, commits it, and asserts `check --merge` goes green.

### H2 — `npm test` fails at the branch head, so c8's own gate is red

**Severity:** high  **System:** Testing procedure  **Found by:** C (H1) and D (H3) independently, at
high; also seen by A (filed low) and B (noted as a flake)
**Files:** `scripts/tasks.test.ts:1544-1558`

**Evidence:** C's reproduction is the strongest and is the one to re-run:

```
cd <worktree> && git reset --hard 07463c8 && git clean -fd
npm test
```

```
 × handoff says the scan cap was reached instead of claiming the branch has no plan  5676ms
 Error: Test timed out in 5000ms.
      Tests  1 failed | 782 passed (783)
```

Reproduced 3/3 via `npm test` (5676 ms, 5696 ms, 43.76 s total), 3/3 under `--sequence.shuffle`
with seeds 1/2/3, and 3/3 in isolation via `-t "scan cap was reached"`. It passes *only* in the
single-file unfiltered run, where earlier cases have warmed the git binary and the temp filesystem
— which is almost certainly the configuration the author measured in. A measured the same case at
~3.44 s alone and timing out under load; D failed it once and passed it once in isolation.

The case spawns 24 sequential `git commit` subprocesses inside `gitFixture` plus a `tsx` cold start
against vitest's 5000 ms default. There is no margin, and CI runs `npm test` on `windows-latest` as
one of two matrix legs against slower hardware.

Severity resolved to high over A's low: A scoped it as a local flake, C and D established it fails
in the default invocation on a clean checkout and reddens a CI leg. The specific case also matters —
it is the one that discharges Slice 5's requirement that handoff never claim it proved no
branch-local `Next:` when it merely hit a scan cap, so losing it to a timeout leaves that honesty
guarantee unproven rather than merely slow.

**Deliverable:** give the case an explicit timeout (`it(..., { timeout: 30000 })`), or make
`HANDOFF_SCAN_CAP` injectable so the fixture proves the cap with 3 commits instead of 22, or build
the history with one `commit-tree`/`fast-import` pass. Then run the full suite three times before
claiming c8.

### H3 — a Vitest proof target can never pass for any real test file, and the branch is untested; the same line misfires a second, independent way

**Severity:** high  **System:** Testing procedure  **Found by:** B (H1) and D (H1) independently;
the second defect on the same line by planner code read
**Files:** `scripts/tasks.ts:320-327` (`runProofTarget`, vitest branch); `scripts/tasks.test.ts:1353,1378`
(only `command` and unsupported-shape are exercised); `scripts/lib/specDoc.test.ts:52` (parses a
vitest target, never runs one)

**Evidence:** the pass/fail decision is a substring scrape of vitest's human output
(`scripts/tasks.ts:325`):

```ts
if (result.stdout.includes('0 passed') || result.stdout.includes('skipped')) return `proof clause ${clause} target missing or skipped: ${target}`;
```

**Defect one — `'skipped'` (B, D).** Under vitest 4, `-t <name>` reports every filtered-out test in
the file as skipped, so a correct, uniquely-named, passing target prints
`Tests  1 passed | 31 skipped (32)` and the check fires. Every test file in this repo has more than
one test, so the feature refuses every legitimate target. B's end-to-end reproduction, which
exercises the whole CLI path and is the one to re-run:

```bash
mkdir -p _fx/specs && : > _fx/tasks.jsonl
echo '{"unowned":{"note":"","paths":["docs","*.md"]},"systems":[]}' > _fx/systems.json
cat > _fx/specs/demo-spec.md <<'EOF'
# Demo spec

## Deliverable

Promise.

Proof:

- [c1] A real, existing, passing test.
  proof: vitest scripts/lib/specDoc.test.ts "extracts the whole ## Deliverable section verbatim"

## Decisions

## Open questions

None.
EOF
G="--store _fx/tasks.jsonl --systems _fx/systems.json --specs-dir _fx/specs --branch demo-spec"
npx tsx scripts/tasks.ts audit demo-spec --proof 1=met $G
npx tsx scripts/tasks.ts check --merge $G
```

```
merge gate: proof clause 1 target missing or skipped: vitest scripts/lib/specDoc.test.ts "extracts the whole ## Deliverable section verbatim"
merge gate: 1 issue(s)
```

The named test passes. D's minimal one-liner isolates the cause without the CLI:
`node node_modules/vitest/vitest.mjs run scripts/lib/commitContract.test.ts --configLoader runner -t "refuses a subject-only message"` →
`Tests  1 passed | 17 skipped (18)`.

**Defect two — `'0 passed'` (planner code read).** The substring `0 passed` also matches
`10 passed`, `20 passed`, `30 passed`, and so on. A target whose file legitimately runs a
multiple-of-ten passing count is reported as missing. So the check misfires two independent ways,
not one — and the `'0 passed'` half is simultaneously *dead* for the case it was written for, since
B established that `vitest run <file> -t "no such test"` exits 0 and prints `Tests 32 skipped (32)`
with no `0 passed` anywhere. The gate is saved from vacuity on the zero-match case only by the
`'skipped'` substring, i.e. by the same thing that breaks it.

B's measured behaviour matrix:

| target | reported | correct |
|---|---|---|
| test file does not exist | `target failed` | yes |
| test name matches nothing | `missing or skipped` | yes, but only via the over-broad substring |
| `it.skip`, single-test file | `missing or skipped` | yes |
| test fails | `target failed` | yes |
| test passes, single-test file | pass | yes |
| **test passes, multi-test file** | `missing or skipped` | **no — false failure** |
| substring matching many tests | `missing or skipped` | flagged, but as *skipped*, not as *too broad* |

**And it is entirely unproven.** Inserting `return null;` as the first statement of the vitest
branch — every vitest target unconditionally passes — leaves
`scripts/tasks.test.ts` + `scripts/lib/specDoc.test.ts` + `scripts/lib/mergeGate.test.ts` at
176/176. There is no test anywhere for the shape c1 names first. This is also why the branch's own
spec carries zero `proof:` lines (M7): the feature could not be self-applied.

**Deliverable:** decide pass/fail from vitest's machine-readable result (`--reporter=json`), which
gives per-test `state` and counts and discriminates all four cases the clause names — missing,
skipped, failing, and matching more than one test — instead of conflating them (see also L2). Add a
test that runs a real passing target in a multi-test file through `check --merge` and asserts green,
and one that names a nonexistent test and asserts red.

### H4 — the deliverable freeze is opt-in, undiscoverable, and its use by the gate is untested

**Severity:** high  **System:** Testing procedure  **Found by:** B (H2, high) and D (M7, medium)
independently; severity taken at B's high because B additionally proved the *consuming* half has no
test at all
**Files:** `scripts/tasks.ts:1051-1079` (`cmdSpecFreeze`), `scripts/tasks.ts:284`
(`doc?.baseline ?? deliverableAtMergeBase(...)`), `scripts/tasks.ts:817-834` (`cmdSpecNew`),
`scripts/lib/mergeGate.ts:62`, `docs/specs/task-system-v2.md:307`

**Evidence:** Slice 2's acceptance — "`tasks check --merge` refuses unaudited deliverable edits on
a spec created on its own branch" — holds only if a human remembered to run `tasks spec freeze`.
Nothing requires, reminds, warns about or documents that step: `tasks spec new` prints
`fill in ## Deliverable before opening the branch's first audit` and never mentions freeze;
`SPEC_SCAFFOLD` contains no `## Baseline`; `tasks --help` lists `spec` but no subcommands;
`tasks audit` does not warn on a missing baseline; `check --merge` reports 0 issues for a spec with
neither baseline nor amendment; and `docs/specs/task-system-v2.md:307` still asserts the freeze "is
checked mechanically rather than trusted". Three of four shipped specs have no baseline:

```bash
for f in docs/specs/*.md; do echo -n "$f: "; grep -c '^## Baseline' "$f"; done
# combat-continuation-runtime.md: 0
# task-system-real-world-friction-spec.md: 1
# task-system-small-test-fixes-to-get-feet-wet.md: 0
# task-system-v2.md: 0
```

The no-op drift check, deterministic and git-free:

```bash
mkdir -p _fx/specs && : > _fx/tasks.jsonl
echo '{"unowned":{"note":"","paths":["docs","*.md"]},"systems":[]}' > _fx/systems.json
printf '# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] A clause.\n\n## Decisions\n\n## Open questions\n\nNone.\n' > _fx/specs/demo-spec.md
G="--store _fx/tasks.jsonl --systems _fx/systems.json --specs-dir _fx/specs --branch demo-spec"
npx tsx scripts/tasks.ts audit demo-spec --proof 1=met $G
sed -i 's/- \[c1\] A clause./- [c1] A completely different clause promising something else./' _fx/specs/demo-spec.md
npx tsx scripts/tasks.ts check --merge $G   # -> merge gate: 0 issue(s), exit 0
```

Run `spec freeze` first and the same edit produces a refusal, exit 1. The mechanism works; nothing
makes it engage.

**The consuming half has no test.** Changing `scripts/tasks.ts:284` from
`(doc?.baseline ?? deliverableAtMergeBase(config, spec, baseBranch))` to
`deliverableAtMergeBase(config, spec, baseBranch)` — the gate ignores the frozen baseline entirely —
leaves `scripts/tasks.test.ts` at 127 passed, 1 failed, and the one failure is H2's timeout.
`spec freeze` is tested only for what it writes into the file (`tasks.test.ts:804`), never for what
the gate does with it.

This is the reproduction written into the folded finding
`the-deliverable-freeze-never-engages-for-a-spec-created-on-i`, marked `done` at `b703bd5`. Its own
recorded deliverable said "cheapest fix is for `spec new` to record the opening deliverable as
amendment zero" — that is not what shipped, and the residual it described survives for the whole
population it guards. CLAUDE.md: "Do not create systems that are required to be manually kept in
sync."

**Deliverable:** either have `tasks spec new` write the `## Baseline` once the deliverable is
filled, or have `check --merge` raise an issue when a spec has neither baseline nor amendment. Add
the `check --merge` test that freezes, edits the deliverable and asserts refusal — the test the
mutation above should have killed. Update `docs/specs/task-system-v2.md` and the help output.

### H5 — `audit-prompt` omits three of the seven elements c5 names, plus both Slice 6 additions

**Severity:** high  **System:** Testing procedure  **Found by:** C (H2); the missing
no-proof-target callout also found by B (M3); "required commands" absent also noted by D
**Files:** `scripts/tasks.ts:1167-1224`; `scripts/tasks.test.ts:1219`

**Evidence:** run it against the spec it exists for:

```
npx tsx scripts/tasks.ts audit-prompt task-system-real-world-friction-spec
```

| c5 element | present? |
|---|---|
| diff range | yes, as a label only — see M9 |
| proof clauses | yes, all eight |
| member tasks | printed as `- none` |
| relevant files | absent — files are only ever derived from member tasks (line 1215), and there are none |
| proof targets | vacuous — this spec declares zero `proof:` lines |
| **required commands** | **absent — the string appears nowhere in `cmdAuditPrompt`** |
| mutation testing instruction | yes, lines 1218-1220 |

Slice 6 adds two more: "latest audit pass summary" is present (line 1209); per-clause guidance
distinguishing pure-logic from UI clauses is not — lines 1219-1220 are two blanket sentences and the
prompt never classifies which clauses are which. Slice 3 additionally requires the prompt to call
out that a clause with no proof target requires human verification (B M3); it does not, and on this
spec *every* clause lacks a target, so the auditor is told nothing about the eight clauses they must
verify by hand.

Judged against Slice 6's acceptance — "an auditor can paste the generated prompt into a fresh agent
and get the expected audit shape without knowing the branch history" — C's own answer, as the
experiment: no. The hand-written prompt C received gave the merge base, the six central files, five
gate commands, and an explicit mutation protocol. The generated prompt gives a diff range, eight
clause texts, and three sentences of generic advice. Working from it, C would not have opened
`.claude/hooks/commit-msg`, `tsconfig.json` or `scripts/lib/commitContract.ts`, and would not have
run `npm test` — which is how H2 gets found.

`Member tasks: none` is not an attachment bug: `tasks spec show` independently reports `0 member(s)`
and all fifteen folded ids carry `spec: null` (see M8).

**Deliverable:** print the standard gate commands; print the union of member-task `files` *and* the
diff's changed paths (`git diff --name-only <base>..<head>`) so "relevant files" survives a spec with
no members; emit a per-clause line for every clause with no `proof:` target saying it requires human
verification, plus a summary count. Then extend `scripts/tasks.test.ts:1219` to assert each.

### H6 — `tasks done` records HEAD at command time and calls it the closing commit; `--commit` stores an unresolved revspec

**Severity:** high  **System:** Testing procedure  **Found by:** A (H2, high) and D (M8, medium)
independently; also flagged by C as an out-of-scope observation. Severity taken at A's high because
A additionally established the unvalidated-revspec path, which D did not reach
**Files:** `scripts/tasks.ts:761`, `scripts/tasks.ts:342-348`, field at `scripts/lib/taskStore.ts:28`

**Evidence:**

```ts
task.closedCommit = args.flags.commit ?? currentHead();
```

`currentHead()` is `git rev-parse HEAD` at the instant `done` runs — by definition a commit that
cannot contain the store write that closes the task, and that contains the fix only if the operator
committed the fix first. The branch's own data shows the gap: all twelve tasks closed in `07463c8`
carry `closedCommit: b703bd57…`, the commit *before* the store write, which closed none of them; the
work for `the-deliverable-freeze-never-engages-…` landed in `d1c7a21`.

Slice 4 anticipated exactly this and named two sanctioned shapes. Neither was built: there is no
`tasks close-commit` command (`grep -rn "close-commit"` matches only the spec text) and no inference
from files touched. The convention that would make the default correct is undocumented —
`tasks --help` never mentions `--commit`, and neither does `CLAUDE.md` or `AGENTS.md`.

A's ordering reproduction (`scratchpad/repro-closing-commit.sh`):

```
HEAD before implementation commit: 079cf59…
the actual implementation commit:  ea99278…
commit carrying the store write:   6cabc3c…
closedCommit recorded:             ea99278…    # correct only because `done` ran after the fix commit
```

Worse, `--commit` is stored with no validation or normalisation:

```
$ tasks done relrev --commit 'HEAD~2'
done relrev
  stored closedCommit = "HEAD~2"
$ tasks check
3 task(s), 0 error(s), 1 warning(s)     # passes: HEAD~2 is an ancestor today
```

`"HEAD~2"` is a floating reference. It resolves to a different commit after every subsequent commit
and `merge-base --is-ancestor` keeps saying yes forever — a silently wrong SHA the check can never
catch, which is precisely what c2 promises to exclude. A non-revspec string is caught, but only as a
`warning`, so `npm run tasks -- check` still exits 0.

**Mutation:** replacing `?? currentHead()` with `?? null` leaves
`npx vitest run scripts/tasks.test.ts scripts/lib/taskStore.test.ts` fully green (165 passed). The
single test that mentions `closedCommit` (`scripts/tasks.test.ts:485`) supplies `--commit` by hand
and never exercises the default path.

**Deliverable:** resolve and validate before storing — `git rev-parse --verify <value>^{commit}`,
refuse on failure, store the full 40-char SHA. Add the `tasks close-commit <id> <sha>` follow-up
Slice 4 named, or rename the field to what it records. State in `done`'s help which commit the
default takes. A test that runs `done` inside a real git fixture and asserts
`closedCommit === <fixture HEAD>` kills the `?? null` mutation.

### H7 — the closing-commit anchor lives in the file it is meant to survive, so it cannot detect the failure the branch exists to prevent

**Severity:** high  **System:** Testing procedure  **Found by:** A (H1) alone — single-source, see
the gaps section
**Files:** `scripts/tasks.ts:761`, `scripts/tasks.ts:332-340`, `scripts/tasks.ts:81-94`,
`.planning/task-system-friction.md:88-113`

**Evidence:** `.planning/task-system-friction.md:112` proposes "a task records the commit that
closed it, so a reverted `done` is detectable by asking whether that commit is still reachable", and
Slice 4's acceptance inherits it. Both are circular. `closedCommit` is a field *of the reverted
record*: a `git checkout -- docs/tasks.jsonl` / `git reset --hard` / `git stash` takes `state: done`,
`closed` and `closedCommit` away together, leaving nothing to ask a reachability question about.
Reproduced verbatim at `07463c8`:

```
$ npx tsx scripts/tasks.ts done quest-journal
warning: docs/tasks.jsonl has uncommitted task-state changes; commit them before cleanup/reset, or another session may miss working-tree-only state
done quest-journal
$ git status --porcelain -- docs/tasks.jsonl
 M docs/tasks.jsonl
$ git checkout -- docs/tasks.jsonl        # the exact tidy-up that lost three marks
$ npx tsx scripts/tasks.ts check
188 task(s), 0 error(s), 0 warning(s)     # <- silent, as before
```

`closedCommitIssues` fires on a different, rarer failure — a *committed* record whose SHA was later
dropped by rebase/reset/amend. Worth having, but not the originating failure, and nothing on the
branch says so.

The only machinery addressing the originating failure is `dirtyStoreIssue`, a boolean over
`git status --porcelain -- docs/tasks.jsonl`. The friction doc asked for something stronger
(`:110`: "`tasks check` compares the store's committed state against HEAD and reports state that
exists only in the working tree"). What shipped compares nothing, names no task, and by construction
fires after **every** state-changing write — including once per decision inside the `triage` loop
(`scripts/tasks.ts:1344`, `1350`). A warning with a 100% firing rate is the one a worker learns to
scroll past, which is how the marks were lost in the first place.

**Deliverable:** have `tasks check` diff the working-tree store against `git show HEAD:docs/tasks.jsonl`
and report *by id* the tasks whose state differs — "3 task(s) are `done` only in the working tree:
a, b, c" — instead of "the file is dirty". That names what would be lost, and it lets the warning go
silent when the dirty diff contains no state transitions.

### M1 — the malformed-store fix guards one of nine store-reading commands; the rest still stack-trace

**Severity:** medium  **System:** Testing procedure  **Found by:** A (M4) and D (M3) independently
**Files:** `scripts/lib/taskStore.ts:126-140` (throws), `scripts/tasks.ts:233-245` (the only catcher),
store record `tasks-check-stack-traces-instead-of-reporting-on-a-conflicte`

**Evidence:** Slice 1's acceptance is literally met — through `check`. A's matrix over 11 malformed
shapes (malformed JSON, conflict marker, empty, whitespace-only, missing required field, duplicate
id, JSON array/number/null as a record, invalid enum, wrong-typed array, CRLF) all report `path:line`
with no stack trace. But `loadStore` still *throws*; the friendly report is `cmdCheck`'s local
`try/catch` alone. Against a store carrying conflict markers:

```
tasks next         exit=1 uncaught-stack=true
tasks list         exit=1 uncaught-stack=true
tasks show ok      exit=1 uncaught-stack=true
tasks start ok     exit=1 uncaught-stack=true
tasks done ok      exit=1 uncaught-stack=true
tasks handoff      exit=1 uncaught-stack=true
tasks spec show    exit=1 uncaught-stack=true
tasks audit-prompt exit=1 uncaught-stack=true
tasks check        exit=1 uncaught-stack=false   <- the only one
```

The closed finding's own deliverable says "**loadStore** reports a parse or shape failure as a check
error naming the file and line number, instead of throwing" and its evidence says "the unclean case
is the one that needs a readable failure". A worker in a half-resolved merge — the situation the
record describes — still gets a Node stack from `tasks next`. The task was marked `done` on this
branch with eight of nine call sites unfixed. Not operationally blocking: `check-commit-msg` does
not read the store, so the commit hook does not block a conflict resolution (verified, exit 0).

Second consequence A measured: when any line is malformed, `cmdCheck` sets `tasks = []`, reports
`0 task(s)` and silently skips every other rule — duplicate ids, `requires` resolution, cycles,
`closedCommit` reachability, dirty store. One conflict marker hides everything else.

**Deliverable:** move the catch into one entry point every command shares — `run(argv)` wrapping
store-loading commands, or a `loadStoreOrReport(config)` used by all of them — so the readable
message is a property of the loader's callers as a class. Optionally collect per-line failures rather
than throwing on the first, so `check` can report all of them and still run the remaining rules.

### M2 — `renderTask` silently drops unknown fields, and `tsc` cannot see an omission

**Severity:** medium  **System:** Testing procedure  **Found by:** A (M5) and D (M4) independently
**Files:** `scripts/lib/taskStore.ts:98-120` (`renderTask`), `:65-96` (`normalizeTask`)

**Evidence:** the old `saveStore` did `JSON.stringify(task)` over the spread of what it parsed, so
unknown fields survived a round trip. `renderTask` builds an untyped 16-key object literal, so they
do not:

```
$ # a store row carrying an extra "futureField":"must survive", loaded and saved by HEAD's taskStore
{"id":"x","title":"x","kind":"task",…,"closed":null,"closedCommit":null}
```

`futureField` is gone. Since `saveStore` rewrites every line on every write, one `tasks add` from a
checkout that predates a new field wipes that field from all 188 records at once. The near-term
hazard is the mirror of friction item 17, the thing this branch exists to fix: two concurrent
sessions, one on a branch that added a store field and one on `main`; the `main` session's
`tasks edit` strips the field from all rows and the diff looks like ordinary reserialization.

A also measured the type-system blindness: adding `owner: string | null` to `Task` and
`normalizeTask` but *not* to `renderTask` compiles clean. `npx tsc --noEmit` errored at the six
construction sites and said nothing about `renderTask`. The one place that decides what is persisted
is the one place the type system does not check. The canonical-key-order test
(`taskStore.test.ts:73`) pins the current key set byte-exactly, but its expectation is a hand-copied
literal of the same 16 keys, so it cannot catch a field that never reached either side.

D adds the asymmetry: `normalizeTask` throws on any `state` outside the five it knows, so a store
written by a future version with a sixth state is unreadable by *every* command in this version. And
an old checkout loads `state: "in-progress"` without complaint but its `listQueue` default filter is
`unreviewed || open`, so claimed work is invisible to it — the exact double-claim scenario
`in-progress` was added to prevent.

**Deliverable:** annotate the literal so `tsc` enforces completeness (`{…} satisfies Task`, or
`JSON.stringify(task, CANONICAL_KEYS)` with `CANONICAL_KEYS: Array<keyof Task>` checked for
exhaustiveness). Then decide the forward-compat contract and write it down: preserve unknown keys
through the round trip, or add a store `version` and refuse to write one this tool does not own.
Silent erasure is the one option that loses data without telling anyone.

### M3 — nothing proves `in-progress` is not treated as complete: five mutations that do exactly that ship green

**Severity:** medium  **System:** Testing procedure  **Found by:** A (M2)
**Files:** `scripts/lib/mergeGate.ts:70`, `scripts/tasks.ts:958` (`cmdSpecDone` straggler filter),
`scripts/tasks.ts:257` (`cmdCheck` merge `openBySpec`), `scripts/lib/taskStore.ts` (`isBlocked`),
`scripts/tasks.ts:902` (`cmdSpecShow` member line)

**Evidence:** c3's operative half is "without treating it as complete". Battery run against
`scripts/tasks.test.ts scripts/lib/taskStore.test.ts scripts/lib/mergeGate.test.ts`,
`--testTimeout=30000`:

```
gate-treats-in-progress-as-closed                   -> *** SURVIVED ***
spec-done-treats-in-progress-as-closed              -> *** SURVIVED ***
check-merge-openbyspec-treats-in-progress-as-closed -> *** SURVIVED ***
isBlocked-treats-in-progress-as-done                -> *** SURVIVED ***
specshow-hides-state (prints every member as /open)  -> *** SURVIVED ***
next-does-not-skip-in-progress                      -> CAUGHT (2 tests)
list-default-drops-in-progress                      -> CAUGHT (2 tests)
start-does-not-transition                           -> CAUGHT (3 tests)
stop-does-not-transition                            -> CAUGHT (1 test)
handoff-drops-in-progress-section                   -> CAUGHT (1 test)
start-does-not-refuse-blocked                       -> CAUGHT (1 test)
```

The first is the consequential one: adding `&& task.state !== 'in-progress'` to `checkMergeGate`'s
`notClosed` filter makes the merge gate pass a branch whose members are still being worked on — a
false completion signal at the one gate the repo says has repeatedly caught real defects — with a
fully green suite. `mergeGate.test.ts` has no `in-progress` member in any case. `isBlocked`
surviving means a task whose blocker is merely claimed could be handed to a second worker by `next`.
`specshow-hides-state` is a direct miss against the clause's own wording: `spec show` is one of the
five named surfaces and no test gives it an in-progress member.

The behaviour is correct today; A verified all of it by hand (`spec show` renders
`[task/in-progress]`, `spec done` refuses, `check --merge` names the member, `start` refuses a task
blocked by an in-progress requirement). Only `list`, `show` and `handoff` actually assert the state
reaches a user.

**Deliverable:** one test per determination, each with an `in-progress` member — a `mergeGate.test.ts`
case asserting the member appears in `notClosed`; a `spec done` case asserting refusal names it; a
`check --merge` no-active-spec case; a `taskStore.test.ts` `isBlocked` case with an `in-progress`
requirement; and a `spec show` assertion on `[task/in-progress]`.

### M4 — the `start → done` lifecycle and both `stop` guards are untested

**Severity:** medium  **System:** Testing procedure  **Found by:** A (M3)
**Files:** `scripts/tasks.ts:680-702` (`cmdStop`), `scripts/tasks.ts:743-746` (`cmdDone` state guard),
`scripts/tasks.test.ts:347-361`

**Evidence:** two mutations, both surviving 128/128 green:

| mutation | result |
|---|---|
| `cmdDone` guard narrowed to `if (task.state !== 'open')` — `done` refuses an in-progress task | **survives** |
| `cmdStop`'s entire `if (task.state !== 'in-progress')` guard deleted | **survives** |

The second is the dangerous one: with the guard gone, `tasks stop <a-done-task>` silently reopens a
closed task, flipping `state` back to `open` while `closed` and `closedCommit` stay populated — a
record `checkStore` does not flag, since it only cross-checks `reason` against `declined`.

Today's behaviour is correct (`stop` on an open task errors `a is open, not in-progress`; on a done
task `a is done, not in-progress`; `start` then `done` works) but none of it is pinned.

**Deliverable:** extend `tasks.test.ts:347` to run `start` → `done` and assert `[task/done]`; add
cases for `stop` on a never-started task and on a done task, asserting exit 1 and unchanged state.
Consider a `checkStore` rule that an `open`/`in-progress` task must not carry `closed`/`closedCommit`,
so a bad transition is caught in the store rather than only at the verb.

### M5 — a hand-written `[cN]` tag on rewritten clause text inherits the retired clause's `met` verdict

**Severity:** medium  **System:** Testing procedure  **Found by:** B (M1)
**Files:** `scripts/lib/specDoc.ts:96-105` (`resolveIds`), `:226-237` (`renderAuditPass` records no
clause text), `scripts/lib/mergeGate.ts:44-56`

**Evidence:** c4 promises "a retired clause id is never reused for a new clause that has not been
audited". Slice 2 offered two mechanisms — track retired ids, *or* compare clause text identity
against the latest audited/frozen identity. Neither was built. `resolveIds` reserves audited ids
against *auto-assignment* only; an id written by hand is taken verbatim
(`specDoc.ts:100`: `if (clause.tag !== null) return clause.tag;`), and an audit pass records only
`- proof N: met — evidence`, never the text it graded, so there is nothing to compare against.

Reproduce with a frozen spec, where the drift guard is at its strongest:

```bash
mkdir -p _fx/specs && : > _fx/tasks.jsonl
echo '{"unowned":{"note":"","paths":["docs","*.md"]},"systems":[]}' > _fx/systems.json
printf '# Demo spec\n\n## Deliverable\n\nPromise.\n\nProof:\n\n- [c1] The original clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n' > _fx/specs/demo-spec.md
G="--store _fx/tasks.jsonl --systems _fx/systems.json --specs-dir _fx/specs --branch demo-spec"
npx tsx scripts/tasks.ts spec freeze demo-spec $G
npx tsx scripts/tasks.ts audit demo-spec --proof 1=met $G
sed -i 's/- \[c1\] The original clause holds./- [c1] A brand new unaudited clause./' _fx/specs/demo-spec.md
npx tsx scripts/tasks.ts spec amend demo-spec --reason "reworked" $G
npx tsx scripts/tasks.ts check --merge $G   # -> merge gate: 0 issue(s)
```

The same sequence with an **untagged** replacement is caught correctly. The only difference is
whether the author typed `[c1]`.

Medium rather than high because in a committed workflow H1's `staleAuditIssue` reddens the gate on
the amend commit and forces a fresh `tasks audit`. But that is a blunt commit-count check that would
have fired without any of the new id machinery — the protection c4 claims is not the protection
doing the work, nothing tells the re-auditor that clause 1's text changed, and **fixing H1 removes
the mask.**

**Deliverable:** record a stable identity for each graded clause in the audit pass — a short hash of
the clause text alongside the verdict — and have `checkMergeGate` refuse a `met` verdict whose
recorded identity no longer matches the live clause.

### M6 — `check --merge` shell-executes commands from a markdown file in the PR's own tree, in CI

**Severity:** medium  **System:** Testing procedure  **Found by:** B (M2) and D (M10) independently
**Files:** `scripts/tasks.ts:313-318`; `.github/workflows/test.yml` final step

**Evidence:**

```ts
const command = target.slice('command '.length).trim();
const result = spawnSync(command, { cwd: process.cwd(), encoding: 'utf8', shell: true, … });
```

`.github/workflows/test.yml` runs `npm run tasks -- check --merge --branch "$BRANCH" --base-branch origin/main`
when `github.event_name == 'pull_request'`, and `actions/checkout` on `pull_request` checks out the
PR head — so the spec file supplying the command comes from the proposed diff. `docs/specs/**` is not
otherwise privileged; a first-time contributor editing only a markdown file now reaches `sh -c` on
the runner.

The same workflow step already carries a comment reasoning explicitly about this threat surface for
the branch name ("`github.head_ref` is attacker-controlled on `pull_request`, and a branch name
containing a quote or backtick would otherwise execute on the runner"). This branch added a wider
shell path to the same job without revisiting that reasoning.

Mitigating: default `pull_request` fork runs get a read-only `GITHUB_TOKEN` and no secrets, and
`npm ci`/`npm test` already run PR-authored code there — which is why this is medium. Aggravating:
per L1, the shape does not need to be authored deliberately, since a fenced markdown example inside
the `Proof:` list parses as a live clause with a live target. Also new: a spec saying
`proof: command npm test` makes CI run the suite twice.

**Deliverable:** drop `shell: true` and parse the target into argv, or restrict `command` targets to
an allow-list of repo scripts, or skip proof-target execution when the spec file differs from the
base branch's copy. Whichever is chosen — including "keep it" — record the decision in the spec's
`## Decisions` and in the workflow comment that already reasons about this step.

### M7 — the branch's own spec declares no proof targets, so c1's machinery is never exercised on the artifact it was built for

**Severity:** medium  **System:** unowned (`docs/specs/…` falls under `unowned.paths`)
**Found by:** B (M4) and D (M9) independently; also noted by C
**Files:** `docs/specs/task-system-real-world-friction-spec.md:16-53`, `scripts/tasks.ts:293,301-310`

**Evidence:** `parseSpecDoc` on the branch spec returns 8 clauses with `proofTargets` undefined on
every one, so `runProofTargets` returns `[]` on every `check --merge` run on this branch — the new
code path is never executed by the branch that introduced it, and c8's requirement that
`check --merge --spec task-system-real-world-friction-spec` passes is satisfiable without executing
any of the code c1 adds.

c1's wording ("Proof clauses **can** name executable proof targets") permits a spec with none, so
this is not a literal clause violation. It is why H3 survived to this audit: had c8's aggregate gates
been written as `proof: command npm test` and c4's clauses as
`proof: vitest scripts/lib/specDoc.test.ts "…"`, the always-fails bug would have reddened the
branch's own gate on the first run. H3 explains the causation in the other direction too — the
feature could not be dogfooded because it does not work.

**Deliverable:** once H3 lands, attach `proof:` targets to at least c1, c2, c3, c6 and c7 — c4's four
sub-properties map directly onto the four mutation-killed tests — and give c8 `proof: command npm test`.
Consider a `check --merge` warning (not an error, to preserve optionality) naming the count of
clauses with no target.

### M8 — thirteen folded tasks were closed but none were attached, so the branch's own record-keeping is empty where it should be richest

**Severity:** medium  **System:** unowned (`docs/tasks.jsonl`)  **Found by:** D (M11); the same fact
established independently by A (record-by-record store diff) and C (via `Member tasks: none`)
**Files:** `docs/tasks.jsonl`, commit `07463c8`

**Evidence:** parsing `docs/tasks.jsonl` at both ends of the range, of the fifteen ids under
`## Folded Existing Tasks`: **12 → `done`** (each gaining `closed: "2026-08-01"` and
`closedCommit: b703bd57…`), **1 → `declined`** with a reason mirroring Slice 5's "do not add a
`tags` field", **2 still `open`**, and **0 attached** — no record's `spec` field changed anywhere in
the diff.

Downstream, verified:

- `audit-prompt task-system-real-world-friction-spec` prints `Member tasks: none` and therefore no
  file list, on a branch that closed thirteen findings (this is half of H5).
- `checkMergeGate`'s two member conditions (`mergeGate.ts:68-71`) evaluate over an empty set, so the
  gate reports nothing about the thirteen tasks the branch discharged.
- The declined task's `reason` is the only place the search-versus-tags decision is recorded in the
  store, and it is unreachable from the spec.

The spec's instruction was to attach "if doing so produces a small, reviewable `docs/tasks.jsonl`
diff". A proved the condition was comfortably met: 188 records before and after, none added,
removed or reordered, exactly 13 changed semantically, all deliberate. Thirteen one-word `spec`
values on lines the same commit was already rewriting would have cost nothing extra.

Also open: `the-stale-file-warning-cannot-see-a-path-that-was-deleted-an` met the spec's fold
condition (`scripts/lib/taskStore.ts` was open and grew 112 lines) and neither landed nor was
declined. `lastauditdoc-is-dead-data-…` was correctly left, since its condition
(`scripts/lib/systems.ts` / `docs/audits/systems.json` touched) was not met.

**Deliverable:** run `tasks spec add task-system-real-world-friction-spec <the 13 ids>` before the
merge gate is exercised, so the branch's members, its auditor prompt and its gate all agree. Land or
decline `the-stale-file-warning-…` with a reason; consider removing `lastauditdoc-…` from the folded
list so the next reader does not re-derive that it was correctly skipped.

### M9 — the diff range is asserted by label, not by value, and ships as `(unknown base)..(unknown head)` at exit 0

**Severity:** medium  **System:** Testing procedure  **Found by:** C (M1) — the one mutation of C's
18 that survived
**Files:** `scripts/tasks.ts:1182-1199`; `scripts/tasks.test.ts:1231`

**Evidence:** replace line 1199

```ts
console.log(`Diff range: ${base}..${head}`);
```

with

```ts
void base; void head;
console.log(`Diff range: `);
```

then `npx vitest run scripts/tasks.test.ts --configLoader runner -t "audit-prompt prints a ready-to-use"`
→ `Tests 1 passed | 127 skipped (128)`. The named proof asserts
`expect(result.stdout).toContain('Diff range:')` — the label. Every other element C perturbed
(removing the line, members, mutation instruction, proof targets, audit-pass summary) was caught.
This is the same shape as the `expect(activeAction).toBeDefined()` failure the spec was written to
prevent.

Not hypothetical — `cmdAuditPrompt` swallows the merge-base failure at line 1188:

```
$ npx tsx scripts/tasks.ts audit-prompt task-system-real-world-friction-spec --base-branch no-such-base
fatal: Not a valid object name no-such-base
You are auditing task-system-real-world-friction-spec on branch HEAD.
Spec: docs/specs/task-system-real-world-friction-spec.md
Diff range: (unknown base)..(unknown head)
```

Exit 0. Because both `merge-base` and `rev-parse HEAD` sit inside one `try`, a failure of the first
discards the second too, so `head` is lost even though it was obtainable.

**Deliverable:** assert the real value —
`expect(result.stdout).toMatch(/Diff range: [0-9a-f]{40}\.\.[0-9a-f]{40}/)`. Separate the two git
calls, and make an unresolvable base a refusal naming the base branch rather than a placeholder,
since a prompt without a diff range cannot do its job.

### M10 — c8's "only subprocess/Git-history smoke cases stay out-of-process" does not describe the code

**Severity:** medium  **System:** Testing procedure  **Found by:** C (M2). **D reached the opposite
conclusion** — see the disagreements section
**Files:** `scripts/tasks.test.ts:72-80`

**Evidence:** the routing is on the verb, not on what the case needs:

```ts
tasks: (...args: string[]) => {
  if (args[0] !== 'audit') return runInProcess([...args, ...globals]);
  ...spawnSync...
},
```

Classifying all 126 cases by the fixture they reach:

| route | cases |
|---|---|
| in-process (`run(argv)`) | 67 |
| subprocess because the case calls `tasks('audit', …)` | 30 |
| subprocess because the case calls `triage(…)` | 8 |
| subprocess `gitFixture` (real Git history) | 8 |
| subprocess direct `spawnSync` (branch-name resolution) | 11 |
| subprocess `defaultStoreGitFixture` | 2 |

53% in-process satisfies "most", but the 38 `audit`/`triage` cases are out-of-process because
`cmdAudit` and `cmdTriage` are `async` and `runInProcess` throws on a returned Promise — not because
they are Git-history smoke tests. Many are pure command semantics with no Git dependence at all
("audit refuses a `--finding` with no `--deliverable`", "spec add refuses a pass 2+ finding", "audit
refuses when a proof clause is missing a verdict"). Reproduce by grepping `tasks('audit'` and
`triage(` in `scripts/tasks.test.ts`.

**Deliverable:** either restate c8 to what the conversion actually achieved ("the synchronous command
surface runs in-process; the two interactive commands and the Git-history fixtures stay out"), or
split the non-interactive half of `cmdAudit` (`parseAuditArgs` → verdict validation → store/spec
write) from `walkClausesInteractively` so the 30 flag-driven cases can run in-process too.

### M11 — the wall-clock measurement Slice 1 required was never recorded

**Severity:** medium  **System:** Testing procedure  **Found by:** C (M3); A and D independently
measured it too, on different file sets
**Files:** `docs/specs/task-system-real-world-friction-spec.md:158-159`

**Evidence:** Slice 1 instructs "re-run the task tests before and after the conversion and record
wall-clock improvement in the audit evidence". Searching every commit message in `91cd1ed..07463c8`
for `wall|clock|second|94s|39s|faster|speed`, and `docs/tasks.jsonl` for the same, returns nothing.
The spec records nothing.

Three independent measurements, so the number exists somewhere. They differ because they measured
different file sets, not because they disagree:

| auditor | scope | before | after |
|---|---|---|---|
| C | `vitest run scripts/tasks.test.ts` | 105.3 s / 104 cases (1.01 s per case) | 39.3 s / 128 cases (0.31 s per case) |
| A | `scripts/tasks.test.ts` + `scripts/lib/taskStore.test.ts` | 90.0 s / 138 tests | 41.0 s / 165 tests |
| D | whole suite | ~88 s (recorded in `.planning`) | 48.0 s |

The improvement is real — roughly 3.3x per case — and worth having on the record. The instruction to
record it simply was not followed.

**Deliverable:** carry C's two numbers (the like-for-like single-file pair) into the pass-1 audit
evidence for c8.

### M12 — command-specific help does not exist; 21 usage strings are unreachable, and `tasks spec help` errors

**Severity:** medium  **System:** Testing procedure  **Found by:** C (M4); corroborated as
out-of-scope observations by A and B
**Files:** `scripts/tasks.ts:1785-1796`, `scripts/tasks.ts:1084`

**Evidence:** Slice 5 asks for "`tasks --help`, `tasks help`, **and command-specific help**". Only
the first two exist; `run()` prints the same one-line `USAGE` for both and discards any argument:

```
$ npx tsx scripts/tasks.ts help add
usage: npm run tasks -- <check|add|edit|show|list|search|next|start|stop|done|decline|import|triage|spec|audit|audit-prompt|handoff> ...

$ npx tsx scripts/tasks.ts next --help
no active spec for this branch, and no --spec given          # exit 0, no help

$ npx tsx scripts/tasks.ts add --help
usage: tasks add "<title>" [--kind task|finding] ...          # exit 1 — the missing-argument path, by accident

$ npx tsx scripts/tasks.ts spec help
error: no such spec: help                                     # exit 1
```

The last is a regression introduced by the alias: `cmdSpec` at line 1084 routes any unrecognised
subcommand to `cmdSpecShow`, so `help` is read as a slug. `scripts/tasks.ts` already contains 21
`usage:` strings with full flag lists; none is reachable from the help verb. Neither `--order` nor
`--full` — the two flags c6 exists to surface — appears in any usage string, and `--commit`,
`--defer-open` and `--base-branch` are discoverable only by reading the source. `spec freeze` is
likewise invisible, which is one of the reasons H4 stays silent.

**Deliverable:** hoist the 21 literals into one `USAGE_BY_COMMAND` record, dispatch `help <cmd>` and
`<cmd> --help` through it at exit 0, exempt `help` from the `spec <slug>` alias, and add `[--order]`
/ `[--full]` / `[--commit]` to the relevant entries.

### M13 — no git seam: four merge-base call sites with four different failure behaviours, one an uncaught stack trace

**Severity:** medium  **System:** Testing procedure  **Found by:** C (M5); the duplication half also
found by D (L3)
**Files:** `scripts/tasks.ts:208`, `:1186`, `:1567`, `:1658`; `currentHead()` at `:342`

**Evidence:** `scripts/tasks.ts` invokes `git` at 15 sites with no shared helper, across two APIs
(`execFileSync` and `spawnSync`). Four resolve a merge base and each fails differently:

| site | on failure |
|---|---|
| `deliverableAtMergeBase` (208) | `try/catch` → `null`, silent |
| `cmdAuditPrompt` (1186) | `try/catch` → `(unknown base)`, git's `fatal:` leaks to stderr, exit 0 (M9) |
| `branchCommitRange` (1658) | `try/catch` + suppressed stderr → `kind: 'unknown'`, clean message |
| `cmdAudit` (1567) | **unguarded — throws** |

Reproduction of the fourth:

```bash
D=$(mktemp -d); mkdir -p $D/specs
printf '# demo\n\n## Deliverable\n\nX\n\nProof:\n\n- [c1] a\n' > $D/specs/demo.md
echo '{"unowned":{"note":"","paths":["docs","*.md"]},"systems":[]}' > $D/systems.json; : > $D/tasks.jsonl
npx tsx scripts/tasks.ts audit demo --proof 1=met --store $D/tasks.jsonl \
  --systems $D/systems.json --specs-dir $D/specs --branch demo --base-branch no-such-base
```

```
fatal: Not a valid object name no-such-base
node:internal/errors:985
Error: Command failed: git merge-base no-such-base HEAD
```

This is the exact defect Slice 1 fixed for `tasks check` reappearing one command over, because no
single place knows how to ask git for a merge base. D adds that `currentHead()` already exists and is
bypassed by two inline `git rev-parse HEAD` calls (`:1187`, `:1568`).

**Deliverable:** a `scripts/lib/git.ts` exporting `mergeBase(baseBranch): string | null`,
`head(): string | null`, `isAncestor(a, b): boolean`, `commitCount(range): number | null` — all
quiet, all nullable — and route all 15 call sites through it. This is also the natural first cut of
the seam `scripts/tasks.ts` needs: it is 1841 lines, up 369 on this branch, with git plumbing, store
plumbing and rendering interleaved at every level.

### M14 — the "no active spec" refusal was added outside the tested seam, is globally scoped, and contradicts a surviving design comment

**Severity:** medium  **System:** Testing procedure  **Found by:** D (M1); the unfixed half of the
same finding independently reproduced by B
**Files:** `scripts/tasks.ts:261-273`; contradicted comment at `scripts/lib/mergeGate.ts:19-29`;
branch binding at `scripts/tasks.ts:114`

**Evidence:** `scripts/lib/mergeGate.ts:19-29` still says, verbatim:

> A branch with no active spec has made no promise this gate can check, so it passes vacuously rather
> than refusing — this runs on every pull_request […] and forcing every PR to open a spec first, on
> pain of a red merge gate, is a far heavier requirement than the design describes

The branch inverts that decision but implements the inversion in `cmdCheck` rather than in
`checkMergeGate`, so `scripts/lib/mergeGate.test.ts` — the unit suite that owns this seam — never
sees it, and the comment stating the opposite policy is left in place. Per CLAUDE.md, a comment
describing behaviour its owner no longer has is exactly the failure mode to avoid.

The refusal is also global rather than branch-scoped: it fires when *any* spec anywhere in the store
has a non-closed member, naming specs the PR has nothing to do with. Combined with the CI invocation
on `pull_request`, a one-line docs PR opened while some unrelated spec has open members fails with
`merge gate: open spec member(s) exist but this branch has no active spec` — precisely the outcome
the comment rejects. Latent today only because the store has zero open spec members.

The authorizing finding's deliverable has two halves — "Something other than a mutable branch name
binds a branch to its spec, **and** `check --merge` refuses when a spec has open members but no
branch claims it". Only the second shipped; `existsSync(specFile(config, branch))` is unchanged at
`tasks.ts:114`, and the source still calls it "a known hole". B reproduced the residual: renaming a
branch onto *another* spec's name makes `currentSpec` resolve to that spec, the gate grades the wrong
spec and reports `0 issue(s)` while the first spec's members stay open — `demo-spec` with an open
member plus a clean `other-spec`, `--branch other-spec` → `merge gate: 0 issue(s)`, exit 0. Against
the four real specs this is currently masked by H1; it opens the moment H1 is fixed. CI passes
`--branch "${{ github.head_ref }}"`, so the lever is live there.

**Deliverable:** move the refusal into `checkMergeGate` where the policy and its tests live; update or
delete the contradicting comment; decide explicitly whether the refusal is global or scoped to specs
the current diff touches, and record that in `## Decisions`. Either finish the durable spec binding or
reopen that half of the finding.

### M15 — the searchable field set is defined twice, in two files, with no link between them

**Severity:** medium  **System:** Testing procedure  **Found by:** D (M2, medium) and C (L2, low)
independently; severity taken at D's medium, whose CLAUDE.md framing ("do not create systems that are
required to be manually kept in sync") is the right lens
**Files:** `scripts/lib/taskStore.ts:199` (`SEARCHABLE`), `scripts/tasks.ts:559-574` (`SEARCH_FIELDS`)

**Evidence:** `SEARCHABLE` decides *whether* a task matches; `SEARCH_FIELDS` decides *which field
name is printed*. Both enumerate `id, title, system, deliverable, evidence` today, independently, and
they are structurally different (a joined string vs a labelled reader list), so a divergence would
not be obvious in review. Add a sixth field to one and `search` either drops rows it should print or
prints `(matches: )` on a row it just matched. Mutating `matchingFields` to ignore the term is caught
by a test; nothing catches the two lists disagreeing. The reusable pattern was already there —
`SEARCHABLE` — and the new code duplicated its contents instead of deriving from it.

**Deliverable:** export the labelled reader list from `taskStore.ts` and build `SEARCHABLE` from it,
so one definition feeds both the filter and the labels.

### M16 — `--evidence` is parsed by two different implementations in the same function

**Severity:** medium  **System:** Testing procedure  **Found by:** D (M5)
**Files:** `scripts/tasks.ts:1424-1437`

**Evidence:** `parseAuditArgs` grew a second `clause=text` parser next to the one already there, and
they disagree:

```ts
} else if (key === 'evidence' && current) {
  const raw = value ?? '';
  const eq = raw.indexOf('=');
  if (eq > 0 && Number.isFinite(Number(raw.slice(0, eq)))) {          // parser A, validates
    evidence.set(Number(raw.slice(0, eq)), raw.slice(eq + 1));
  } else if (current.evidence !== null) { … }
} else if (key === 'evidence') {
  const eq = (value ?? '').indexOf('=');
  evidence.set(Number((value ?? '').slice(0, eq)), (value ?? '').slice(eq + 1));  // parser B, does not
}
```

Parser B accepts `--evidence foo=bar` and stores it under clause `NaN`; parser A rejects it. Which
one runs depends only on whether a `--finding` has been seen. A finding whose evidence legitimately
begins with digits and an `=` (a measurement like `21000=0 after the fix`) is silently routed to a
clause instead of the finding.

**Deliverable:** one `parseClauseEvidence(value): {clause, text} | null` used by both arms.

### M17 — a test was duplicated rather than moved, and the original's name now asserts the opposite of its body

**Severity:** medium  **System:** Testing procedure  **Found by:** D (M6)
**Files:** `scripts/tasks.test.ts:1408-1420` and `scripts/tasks.test.ts:1667-1678`

**Evidence:** two tests identical in setup and assertions, differing only in title and the `--branch`
value (`renamed-branch` vs `orphaned-branch`):

```ts
it('check --merge refuses when open spec members exist but the branch claims no active spec', …)   // new, 1408
it('check --merge never infers a spec — it stays "not applicable" even when exactly one spec has open members', …)  // 1667
```

Both assert `result.status === 1`, the `open spec member(s) exist but this branch has no active spec`
message, and `demo-spec: open-task`. The second's *name* still claims the gate "stays not applicable"
— the behaviour this branch removed. A reader grepping for the not-applicable invariant finds a test
whose name says the opposite of what it checks.

**Deliverable:** delete one; rename the survivor to match what it now asserts.

### L1 — a fenced code block inside the `Proof:` list becomes a real clause with a live proof target

**Severity:** low  **System:** Testing procedure  **Found by:** B (L1)
**Files:** `scripts/lib/specDoc.ts:62-90` (`scanProofClauses`)

**Evidence:** the scanner has no fence awareness, so a markdown example illustrating the new syntax,
placed inside the deliverable, parses as a clause. B's probe produced
`[{id:1, text:'A clause with an example: ```md'}, {id:9, text:'not a real clause ```', proofTargets:['command rm -rf /']}]`
from a `Proof:` bullet followed by a fenced example. Slice 3's own documentation of the feature is
written as exactly such a fence, so an author copying it creates a phantom clause whose target the
merge gate executes (M6). Also caught in the same probe: `proof:` at column zero and `proof:` nested
under a sub-bullet both attach to the preceding top-level clause without complaint.

**Deliverable:** skip lines between ``` fences when scanning, and require a `proof:` target to be
indented under the bullet it belongs to.

### L2 — `missing or skipped` conflates four failure modes and discards the target's output

**Severity:** low  **System:** Testing procedure  **Found by:** B (L2)
**Files:** `scripts/tasks.ts:316,324-325`

**Evidence:** one message covers "the test name matches nothing", "the test is `.skip`ped", "some
*other* test in the file is skipped", and (per H3) "the target passed". Both branches capture
stdout/stderr and then discard them, so a failing `proof: command npm test` prints
`proof clause 8 target failed: command npm test` and nothing about why, forcing every gate failure to
be re-run by hand. Slice 3 also asked for "too broad" to be reportable; substring breadth is never
measured.

**Deliverable:** distinguish the cases from vitest's JSON reporter (lands with H3), report the
matched-test count so a too-broad filter is nameable, and echo the target's last lines on failure.

### L3 — `specIssues` has no error handling around `statSync` / `readFileSync`

**Severity:** low  **System:** Testing procedure  **Found by:** B (L3)
**Files:** `scripts/tasks.ts:218-231`

**Evidence:** Slice 2 asked the spec scan to "skip non-regular files **and report parse errors as
check issues**". The first half shipped and is mutation-proven. The second did not: `statSync` and
`readFileSync` are called bare inside the `flatMap`, so a dangling symlink, a permission error, or a
file removed between `readdirSync` and the read escapes as an uncaught stack trace — the failure mode
the sibling folded task exists to eliminate for the store (M1). B found no deterministic Windows
reproduction; this is read from the code, not measured.

**Deliverable:** wrap the per-entry work in try/catch and push `{ level: 'error', message }` naming
the path, matching how `cmdCheck` already handles `loadStore` failures.

### L4 — `next`'s concise form can never show blockers, which Slice 5 lists as one of its seven fields

**Severity:** low  **System:** Testing procedure  **Found by:** C (L1)
**Files:** `scripts/tasks.ts:189-201`, `:636-645`

**Evidence:** `printTaskConcise` computes `isBlocked` and prints a `BLOCKED` marker, but its only
caller is line 645, and `cmdNext` sources its task from `fixNowQueue`, which filters `!isBlocked`
(`scripts/lib/taskStore.ts:169`). The marker is unreachable —
`grep -n printTaskConcise scripts/tasks.ts` → definition at 189, one call at 645. Verified against a
fixture: the concise form prints every listed field except blockers, which is structurally
impossible.

**Deliverable:** either drop "blockers" from the slice (the field is meaningless for a queue defined
as unblocked), or have `next` name the top blocked task and its blockers when the fix-now queue is
empty — currently it prints only `no open, unblocked tasks in spec <slug>`, which is exactly the dead
end a planner would want blocker names for.

### L5 — `handoff` claims a bounded proof if `git log` itself fails

**Severity:** low  **System:** Testing procedure  **Found by:** C (L3)
**Files:** `scripts/tasks.ts:1675-1709`

**Evidence:** the four honest cases all work — C constructed each in a scratch repo and read the
output (scan cap reached, missing merge-base, one branch commit with no trailer, empty range on the
base branch). The residual: `findLatestNextTrailer` catches its own `git log` failure and returns
`null` (line 1680). If `branchCommitRange` succeeded but `git log` then fails, `found === null` with
`kind: 'range'` and `count <= 20`, and line 1709 prints the confident "no `Next:` trailer found in N
branch commits" — asserting a scan that never ran. Narrow, but it is the one claim Slice 5 singles
out as forbidden.

**Deliverable:** have `findLatestNextTrailer` distinguish "scanned, found nothing" from "could not
scan", and print the skip wording for the latter.

### L6 — `printTask` and `printTaskConcise` are near-duplicate renderers

**Severity:** low  **System:** Testing procedure  **Found by:** C (L4); also noted by A
**Files:** `scripts/tasks.ts:167-201`

**Evidence:** 17 and 13 lines respectively; both rebuild `byId`, both compute `isBlocked`, both build
the same `tag`, both emit the same six leading lines — 10 of 13 lines byte-identical. They differ in
three: whether `deliverable`/`evidence` go through `preview()`, whether a blank line precedes
`deliverable:`, and whether the closing fields (`source`, `reason`, `closed`, `closedCommit`) print.
A behavioural change to the shared six has to be made twice, which is drift risk between `next` and
`next --full`.

**Deliverable:** one renderer taking `{ preview: boolean; tail: boolean }`.

### L7 — c7's third element has no automated proof

**Severity:** low  **System:** Testing procedure  **Found by:** C (L5)
**Files:** `.claude/hooks/commit-msg:19-23`

**Evidence:** c7 requires "the installed hook uses the repo-local `tsx` launcher before falling back
to `npx`". No test reads `.claude/hooks/commit-msg` — `grep -rn "commit-msg" scripts/ .github/`
returns only `check-commit-msg` CLI cases, which exercise the verb the hook calls, never the hook's
launcher choice. C verified it manually, so the behaviour is right; the clause simply rests on
nothing executable, and a future edit to the hook would not redden anything.

**Deliverable:** a case that reads the hook file and asserts it tests for
`node_modules/tsx/dist/cli.mjs` before the `npx` line. Cheap, and it is the only element of c7 with
no guard.

### L8 — three copies of the "requirement is satisfied" predicate

**Severity:** low  **System:** Testing procedure  **Found by:** A (L1)
**Files:** `scripts/lib/taskStore.ts` (`isBlocked`), `scripts/tasks.ts:661-663` (`cmdStart`),
`scripts/tasks.ts:756-758` (`cmdDone`)

**Evidence:** `isBlocked` asks `byId.get(id)?.state !== 'done'`. `cmdStart` and `cmdDone` each
re-derive the blocker list with a hand-written copy of the same predicate in order to name the
blockers in the error message. Three copies of one domain rule, in a branch whose subject is adding a
sixth state to that model — if a future state ever counts as satisfying a requirement, two of the
three will be updated and the third will disagree silently. M3 already shows the suite would not catch
the disagreement.

**Deliverable:** export `blockers(task, byId): string[]` from `taskStore.ts` and define `isBlocked` as
`blockers(...).length > 0`; both commands then print `blockers(...).join(', ')`.

### L9 — `checkStore`'s default `specExists` hard-codes a path `specFile` owns

**Severity:** low  **System:** Testing procedure  **Found by:** A (L2)
**Files:** `scripts/lib/taskStore.ts` (`checkStore` signature), `scripts/tasks.ts:73-75` (`specFile`),
`scripts/tasks.ts:244`

**Evidence:** `checkStore(..., specExists = (spec) => existsSync(\`docs/specs/${spec}.md\`))`.
`cmdCheck` always passes `(spec) => existsSync(specFile(config, spec))`, which honours `--specs-dir`.
The default is dead in production and exists only for tests, while being a second, `--specs-dir`-blind
source of truth for the spec path convention.

**Deliverable:** make `specExists` a required parameter; the two test call sites already pass
`() => false` or can pass a stub.

### L10 — three comments that do not earn their place

**Severity:** low  **System:** Testing procedure  **Found by:** A (L3) and D (L1, L2)
**Files:** `scripts/lib/taskStore.ts` (`fixNowQueue`, `unreviewedQueue`, `listQueue` headers),
`scripts/tasks.ts:1698`, `scripts/lib/commitContract.ts:30-32`, `scripts/tasks.test.ts:87-89`

**Evidence:** three distinct CLAUDE.md rules, three cases.

1. **Restating the code (A).** `// Fix-now: open, a member of the given spec, and unblocked.`
   restates the three `.filter` calls beneath it verbatim; the second sentence ("ties break by file
   position, which is creation order for an append-only store") is the owned fact.
   `// Severity first, then creation order:` restates the comparator.
   `// Every filter given is ANDed together.` restates a chain of `.filter` calls.
   `// The first command of a cold session.` above `cmdHandoff` is a label, not a fact. A also
   confirmed the rest of the comments in scope do earn their place — the append-only merge argument on
   `saveStore`, the `path#H1` vs `path:88` suffix rule, `currentSpec`'s deliberate strictness,
   `HANDOFF_QUEUE_CAP`'s derivation.
2. **Describing another module's contract (D).** `commitContract.ts:30-32`: the first sentence
   restates the four lines below it; the second describes what `tasks handoff` does with the trailer.
   The rationale already lives in the spec's `### Next: commit trailers` decision and in commit
   `dfa2cb7`'s body.
3. **Stale as of this branch (D).** `scripts/tasks.test.ts:87-89` describes `gitFixture` as distinct
   from `fixture` "which spawns against this repo's own real checkout" — as of `e805cc9`, `fixture`
   no longer spawns for anything but `audit`.

**Deliverable:** keep the second half of each in (1), delete (2) outright, update or delete (3).

### L11 — small duplications the new code introduced rather than reused

**Severity:** low  **System:** Testing procedure  **Found by:** D (L3); the `printTask` bullet is L6
and the git bullet is M13
**Files:** as listed

- `scripts/lib/taskStore.ts:34` (`STATES`) vs `scripts/tasks.ts:543` (`LIST_STATES`) — the same
  five-element list, now in two files, one of them new.
- `scripts/tasks.ts:1084` vs the `switch` at `:1085-1099` vs the usage string at `:1096` — the spec
  subcommand list written three times. Adding a subcommand and forgetting the guard array silently
  turns it into a slug (which is M12's `spec help` regression).
- `scripts/lib/specDoc.ts:113` (`auditedClauseIds(text)`) vs `:219` (the same `flatMap` inlined in
  `parseSpecDoc`) — two derivations of "reserved clause ids", added in the same commit.
- `preview()` (`tasks.ts:68-70`) takes the first non-empty line and does not bound its length, while
  `truncateLine()` (`:1250`) already exists and is what `cmdHandoff` uses. "Concise" `next` can still
  print a 2000-character line.

**Deliverable:** derive `LIST_STATES` from `STATES`; derive the subcommand guard from the switch's own
list; call `auditedClauseIds` in both places; run `preview` through `truncateLine`.

### L12 — two commit-hygiene blemishes

**Severity:** low  **System:** unowned / Testing procedure  **Found by:** D (L4)
**Files:** commits `84d75a2`, `e805cc9`

**Evidence:** `84d75a2 Created spec for the branch` has no body. It passed the hook because it touches
only `docs/specs/…`, and `docs` is `unowned` in `systems.json`, which makes `isExempt` return true. A
branch whose thesis is "commit bodies stay mandatory" opening with a bodyless commit is a coherence
blemish, and it points at a real gap: the project's system of record (`docs/tasks.jsonl`) and every
spec are body-exempt. Separately, `e805cc9 Close remaining task-system proof gaps` carries c8's
headline deliverable — the in-process conversion plus the change of `run(argv)`'s public signature from
`Promise<void>` to `void | Promise<void>` — bundled with two unrelated hardening changes; the body
discloses it, the subject does not suggest a public API change.

**Deliverable:** consider narrowing the `unowned` exemption so `docs/specs` and `docs/tasks.jsonl`
still require a body. Split API-shape changes into their own commit.

## What is solid

Stated at length, because it bounds the findings: the mechanical core of this branch is careful work,
and several of the riskiest things it could have got wrong, it got right. A and D verified the store
migration independently, by different methods, and agree completely.

- **The `docs/tasks.jsonl` 376-line diff is exactly what it claims to be.** Both A and D parsed each
  side of `91cd1ed..07463c8` and compared record-by-record, field-by-field: 188 records before and
  after, **no record added, removed or reordered**, relative order preserved, **zero fields lost**.
  Key order changed on all 188 lines (`clause` moved from last to eighth, `closedCommit` appended),
  which accounts for the 188 deletions plus 188 insertions. Exactly **13 records changed
  semantically**, all deliberate closures from the folded list. No content, severity, system, spec,
  files, deliverable or evidence field moved anywhere.
- **Rollback is safe in the direction that matters.** D re-implemented the pre-branch
  `loadStore`/`saveStore` and round-tripped the HEAD store through it: byte-identical output. An older
  checkout of the tooling reads and rewrites the new store without damage. (The reverse direction is
  M2.)
- **Round-tripping is byte-stable and idempotent, exactly as Slice 1 required.**
  `saveStore(loadStore('docs/tasks.jsonl'))` over the shipped store is a byte no-op; a second pass too;
  a line written in fully reversed key order canonicalises once and is then stable; output is LF-only
  with a single trailing newline; an empty file loads as `[]` and saves as `''`.
- **Malformed-store reporting through `tasks check` is thorough.** Eleven shapes tested; every failure
  names `path:line`, none emits a stack trace, the id is quoted where available. The validation is
  genuinely structural — enums, `source`'s shape, `clause`'s numericness and both string arrays are
  checked, not just parsed. (The gap is which commands reach it: M1.)
- **The uncommitted-store warning covers every write path.** All 15 store writes go through
  `saveStoreAndWarn`; `grep -n "saveStore\b"` finds zero raw calls, and removing `warnIfStoreDirty`
  from that one function is caught immediately. It correctly no-ops when `--store` points away from
  `docs/tasks.jsonl` and when `git status` fails. (What it *reports* is H7.)
- **The `in-progress` state is correct at every surface exercised by hand**, and six of eleven
  lifecycle mutations are properly caught. `start` refuses a blocked task and a non-open task; `stop`
  refuses a non-in-progress task; `done` accepts both `open` and `in-progress`; `next` and
  `fixNowQueue` skip it; `list` includes it in the not-closed default and filters on
  `--state in-progress`; `show`, `spec show` and `handoff` render it; `spec done`, `check --merge` and
  `isBlocked` count it as unfinished. `requires` remains the only dependency edge — no reverse edge is
  stored anywhere (Slice 4 acceptance 3).
- **c6, all five behaviours, mutation-verified.** Removing the `--help`/`help` dispatch, removing the
  `spec <slug>` alias, making `specMembers` ignore `ordered`, making `next` always call `printTask`,
  dropping the `(matches: …)` annotation, and making `matchingFields` return every label regardless of
  the term each kill exactly the named test and nothing else. Cycles are genuinely reported by
  `tasks check` while `spec show --order` still terminates on the same store — verified on a
  hand-built two-node cycle.
- **c7's enforcement, verified by real commits rather than by reading.** No body → refused with the
  `tasks handoff` / `tasks next` pointer. Body only → accepted. Body + `Next:` → accepted. `Next:`
  with no body → refused, so the trailer genuinely does not count as body. `fixup!` subject with no
  body → accepted. Both hook branches enforce identically. Timing 0.411 s repo-local vs 2.260 s `npx`
  — a bigger win than the spec claimed. `isExempt` is byte-identical: the exemption list did **not**
  widen, and the one deleted test (`refuses a body with no Next: trailer`) is the point of c7.
- **One clause parser, one extractor.** Grepping the whole tree for clause parsing finds a single
  owner: `scripts/lib/specDoc.ts`, with `CLAUSE_TAG` defined once and `parseSpecDoc` the only entry
  point. `scripts/tasks.ts` and `scripts/lib/mergeGate.ts` both consume it; neither re-implements it.
- **Three of c4's four properties are real and mutation-proven.** Top-level-only clause ids (indented
  sub-bullets, numbered sub-lists and wrapped multi-line bodies all behave), untagged-id reservation,
  the rename-with-open-members refusal, and the non-regular-file skip each die under a targeted
  mutation with the named test failing.
- **Unsupported proof-target shapes fail closed.** Anything that is neither `command …` nor the exact
  `vitest <file> "<name>"` shape is reported as an issue rather than ignored — the right default for a
  gate. The `command` half executes, fails on non-zero exit, names the clause id, and does not
  false-positive on a passing target.
- **The unused-locals gate covers the files where the bug happened.** `tsconfig.json` sets both flags
  and its `include` is `["src", "scripts", "vite.config.ts", "capacitor.config.ts"]`. Four mutations,
  four TS6133 errors at exit 2: an unused local in `scripts/tasks.ts`, an unused parameter in
  `scripts/lib/commitContract.ts`, an unused import in `scripts/lib/taskStore.ts`, an unused top-level
  const in `src/runtime/session.ts`. The one production change it forced is a genuine dead import, not
  a weakening. (Slice 6 names `tsconfig.node.json`, which does not exist in the repo — it was folded in
  before this branch.)
- **The in-process conversion introduced no shared-module-state leak.** `runInProcess` resets
  `process.exitCode` before and restores it after, swaps and restores all three console methods in a
  `finally`, and refuses any command returning a Promise rather than silently dropping it. Three
  `--sequence.shuffle` runs (seeds 1/2/3) and five representative cases run in isolation behave
  identically to the ordered run; the only failure under shuffle is H2's timeout, a duration problem
  rather than an ordering one.
- **The speed goal is met with room to spare.** Roughly 3.3x per case, measured three ways (M11).
- **`handoff`'s honesty wording.** All four situations print something true and distinguishable,
  including the two Slice 5 singles out (scan cap, missing merge-base), each with a named test. The
  only hole is L5.
- **No CI, coverage, lint, type, or security weakening anywhere in the diff.** `.github/workflows/test.yml`
  is byte-identical across the range — no step removed, no `continue-on-error` added, no matrix leg
  dropped. `package.json` and `docs/audits/systems.json` are untouched. The only config change is two
  flags *added* to `tsconfig.json`. No test was skipped, weakened or deleted beyond the one c7
  obsoleted.
- **No architecture-boundary violation.** `layer-check` passes on 470 imports.
  `scripts/lib/taskStore.ts` imports `node:fs` only; `scripts/tasks.ts` imports node builtins and
  `./lib/*`. Nothing under `scripts/` reaches into `src/`; the single `src/` hunk is the forced dead
  import removal.
- **No unauthorized scope drift.** D mapped every substantive change area to a slice, a proof clause,
  or a named folded task and found no unauthorized area. The spec's "do not fold unrelated Testing
  procedure tasks" instruction was honoured — no `scripts/play-cli.ts` fold, no `/test`/`/dsl`/dev-mode
  work. The two conditional items (`lastAuditDoc` removal, folded-task attachment) were left undone
  rather than done badly; the second is M8's subject, and only its attachment half was actually
  cheap.
- **No new automated gate beyond what the spec authorised.** Both additions (proof targets, freeze
  baseline) extend the existing merge gate rather than adding a CI step. This clears CLAUDE.md's
  "resist adding new automated gates" bar on structure, though H3 and H4 mean neither addition
  currently prevents anything.
- **Comment discipline in the diff is excellent.** Across all of `scripts/` and `src/`, the branch adds
  **three** comment lines. Two of the three are the subject of L10; the third owns a non-derivable
  fact.
- **Commit hygiene is good.** Fourteen commits, each a coherent slice with an explanatory body; no
  large change hidden inside an unrelated one, and both `docs/tasks.jsonl` reserializations are
  announced in their own subjects. Two blemishes in L12.

## Disagreements, coverage gaps, and leads that did not hold

1. **A lead that was investigated and disproved: the `## Baseline` section is not a second source of
   proof clauses.** The planner's leading candidate for a high finding does not hold, and B disproved
   it by mutation rather than by inspection. `appendBaseline` demotes `## Deliverable` to
   `#### Deliverable`; `sectionText`'s `/^## /` boundary scan does not match it; `parseProofClauses`
   only ever runs over the live deliverable section. `parseSpecDoc` on the branch's own spec returns
   exactly 8 clauses, not 16. Ids cannot attach to the duplicate (`stampClauseIds` is scoped to
   `## Deliverable`), and the freeze-drift comparison reads the live copy against the archived one.
   The mutation: stopping `appendBaseline` from demoting the heading kills two named tests. Friction
   item 9's claim that "the clause-id machinery runs over both" was already untrue before this branch
   — the amendment demotion predates it. The parser is correctly scoped; the lead is closed.
2. **A live disagreement: does the in-process routing match c8's wording?** C (M10) classified all 126
   cases and found 38 out-of-process for a reason c8 does not name — `cmdAudit`/`cmdTriage` are
   `async` and `runInProcess` refuses a Promise. D's "what is solid" states the opposite: "only
   `fixture` routes in-process, and it refuses async commands loudly … That matches c8's 'only
   subprocess/Git-history smoke cases stay out-of-process' exactly." Both describe real properties —
   D is right that the refusal is loud and that `gitFixture` correctly stays out; C is right that the
   residue is not Git-history-shaped. **Unresolved:** whether the clause text is satisfied. C, who
   owned c8, ruled unmet on H2 regardless, so the verdict does not turn on this — but the wording
   question is still open and belongs in `## Decisions`.
3. **A coverage gap in B, not a conflict: `staleAuditIssue` (H1).** It sits inside B's c4 territory,
   and only D filed it as a finding. B did reach it — B's out-of-scope observations record "I could not
   drive any fixture, or any of the four real specs, to `0 issue(s)`" and note that it is "load-bearing
   by accident" for M5 — but B classified it as out of scope rather than raising it. Two auditors
   therefore hit the same wall and only one wrote it up. That is the strongest single argument in this
   record for keeping overlapping scopes.
4. **A severity spread that was resolved upward: the flaky handoff test (H2).** A filed it low ("a
   subprocess test sits at 70–100% of the default 5s timeout"), C and D filed it high. Resolved to
   high: A measured it passing at ~3.4 s alone and treated it as a budget problem, while C established
   it fails 3/3 in the default `npm test` invocation on a clean checkout and D reproduced the full-suite
   failure independently. The deciding fact is that CI runs `npm test` on `windows-latest`.
5. **An apparent conflict on comments that is a scope difference.** B, C and D each state explicitly
   that "comments restating self-documenting code" yields nothing in scope — B verified the diff adds
   exactly one comment line and blamed the narrative comments at `tasks.ts:101-124` to commits before
   the range. A found four restating comments in the same files. Both are right: B/C/D audited the
   *diff*, A audited the *files in scope*. L10 keeps A's list because the rule is about the file, not
   the hunk, but nothing here contradicts anything.
6. **Three different wall-clock numbers, no conflict (M11).** A, C and D each measured the speed
   improvement over a different file set and got 90→41 s, 105.3→39.3 s and ~88→48 s. The direction and
   rough magnitude agree; there is simply no canonical number on the record, which is the finding.
7. **H7 is single-source.** A alone argues that the closing-commit anchor is circular with respect to
   the failure that motivated it. D examined the same field and reached a milder conclusion (M8, folded
   here into H6): "the field still does the job friction item 17 asked for". A's reproduction is
   concrete and re-runnable, so it stands as filed, but it is the one high finding in this record with
   no independent corroboration and it rests on a reading of intent as much as on behaviour. Worth a
   second opinion before the `check` redesign it asks for is built.
8. **c3's "met" verdict rests on the auditor's own reproduction, not on the suite.** A said so
   explicitly. M3 and M4 are the price: five determinations that would treat `in-progress` as complete,
   and both `stop` guards, can be broken with the suite green. The behaviour is correct today; nothing
   holds it there.
9. **All four auditors ran on Windows.** No auditor exercised the gates on Linux, so H2's severity
   rests partly on the reasoning that hosted runners are slower rather than on a measured
   `ubuntu-latest` failure. The Windows leg alone is enough to justify the severity.

### Observations carried forward without a verdict

Recorded here rather than as findings, because the auditors who raised them explicitly declined to
file them:

- **`tasks search <term>` silently excludes `done` and `declined`** (C). `npm run tasks -- search handoff`
  returns `0 task(s)` against a store containing six matching titles; `--state done` finds them. Slice
  5 assigned `search` only the field-naming requirement, so this is not a c6 miss — but the friction it
  replaced was "the store cannot be searched by topic".
- **`resolveConfig` derives the branch from `git rev-parse --abbrev-ref HEAD`, which is `HEAD` in any
  detached checkout** (C). Every `audit-prompt` run in a worktree says "on branch HEAD". CI works
  around this by passing `--branch`; `audit-prompt` has no such workaround, and a detached worktree is
  exactly where an auditor runs.
- **`currentHead()` ignores `--store`** (A). `dirtyStoreIssue` correctly guards on
  `usesDefaultStore(config)`; `currentHead()` does not, so `tasks done --store /elsewhere` stamps *this*
  repo's HEAD onto a foreign store. Visible in the test fixtures, which record the worktree's HEAD into
  temp-directory stores.
- **Squash or rebase merges would invalidate every anchor at once** (A). Not a live risk — the repo uses
  true two-parent merges, so `b703bd5` stays reachable from `main` — but worth writing down before
  anyone proposes squash-merging, since it would turn all 12 records into permanent `check` warnings.
- **The `## Baseline` section becomes dead weight after the first amendment** (B). `tasks.ts:284`
  prefers the latest amendment, so once a spec is amended the baseline is a permanently stale ~3 kB
  copy nothing reads. `spec amend` still appends a full duplicate body, which is the file-bloat half of
  friction item 9 that no change on this branch addressed.
- **Two DFS walks over `requires` now exist** (A): `dependencyCycles` in `taskStore.ts` (three-colour,
  cycle-reporting) and `specMembers` in `tasks.ts:908` (topological, cycle-tolerant). Both correct,
  purposes genuinely differ, but the second was added without reusing the first's traversal.

## Recommended fix order

Grouped where items must land together; ordered so each step unblocks the next.

1. **H1 (`staleAuditIssue`) — first, alone.** Nothing else on this branch can prove itself green until
   the merge gate can be satisfied at all, and every spec'd PR in CI is red until it is. Decide the
   semantics in `## Decisions` before writing code. Note the consequence: this gate is currently
   masking M5 and M14's rename residual, so fixing it exposes both.
2. **H2 (`npm test` timeout) — second, alone.** One-line fix, unblocks c8 and turns CI green, and it is
   the case that discharges Slice 5's honesty guarantee. Re-run the full suite three times and record
   the result.
3. **H3 + L2 together (vitest proof target).** Same line, same fix: replace the substring scrape with
   `--reporter=json`, which resolves both misfires and the four-way conflation at once. Add the
   passing-target-in-a-multi-test-file and nonexistent-target tests. Do not split these.
4. **M7 (attach proof targets to this spec) — immediately after 3.** Cheap once the mechanism works,
   and it is what would have caught H3 on the first run. Give c8 `proof: command npm test` last, after
   step 2 makes it pass.
5. **M8 (attach the 13 folded tasks) — before any further gate work.** Thirteen one-word `spec` values.
   It makes `checkMergeGate`'s member conditions and `audit-prompt`'s member/files halves operate on
   real data for the first time, which is a precondition for verifying step 6. Land or decline
   `the-stale-file-warning-…` in the same commit.
6. **H5 + M9 together (auditor prompt).** Same function, same test; M9's diff-range assertion is
   worthless applied to a prompt that still omits three elements, and H5's fix is unverifiable while the
   only assertion is a label match. Fold in B's no-proof-target callout here.
7. **H4 (spec freeze engages by default).** Independent of the above and the largest remaining silent
   hole — three of four shipped specs are unguarded. The `check --merge` test that freezes, edits and
   asserts refusal is the missing half.
8. **H6 + H7 together (c2's closing-commit story).** H6 makes the recorded value trustworthy
   (resolve, validate, store a full SHA, add `close-commit`); H7 changes what `check` does with it
   (diff against `git show HEAD:docs/tasks.jsonl`, report by id). Landing H7 without H6 reports on
   values that may be floating revspecs. Resolve the H7 single-source question (gap 7) first.
9. **M3 + M4 together (c3's missing proof).** Cheap, mechanical, and they are exactly the tests c3's
   verdict currently lacks. Doing them together means one pass over the lifecycle surfaces.
10. **M1 + M13 together (the two seams).** Both are "one catcher at the command boundary instead of
    one command's inline `try`": a `loadStoreOrReport` for the store and a `scripts/lib/git.ts` for
    git. Same refactor shape, same file, and M13's unguarded `cmdAudit` merge-base is the last
    stack-trace path left after M1.
11. **Decisions to record before more code: M6 (shell execution in CI), M10 (c8's wording), M2 (store
    forward-compat), M14's global-vs-scoped question.** All four are open policy questions where a
    wrong guess is expensive to unwind; write them into `## Decisions` in one pass.
12. **M14 (move the refusal into `checkMergeGate`, delete the contradicting comment)** — after 11
    decides its scope, and after 1, since fixing H1 makes the rename residual live.
13. **M2 (store forward-compat) and M5 (clause identity)** — implement whichever way 11 decided. M5
    becomes load-bearing the moment H1 lands.
14. **M15, M16, M17, M11, M12** — independent, small, no ordering constraints between them. M12
    (command-specific help) is worth doing near H4, since `spec freeze`'s invisibility is one of the
    reasons H4 stays silent.
15. **Lows last**, except **L1** (fenced blocks become live clauses), which should ride along with
    step 3 or step 11 because it is the mechanism that makes M6's shell path reachable by accident.
