# task-system-refactor pass 2A

Independent second pass. Base `354682d` … head `e861d30`. Every claim below was reproduced by running it; mutation verdicts come from `npm run mutate` against scratch manifests, restored and verified clean. Gate: mutate's whole-suite baselines 1312 tests, 0 failed, twice; `merge-ready` all six legs green.

## H1 — `tasks spec show --full` is dead as documented and a silent no-op when accepted, and the `## Deliverable` section it replaced left the CLI

**Files:** `scripts/tasks/commands.ts:33`, `scripts/tasks/cli.ts:25`, `scripts/tasks/specCmds.ts:95`

Before this branch, `tasks spec show <slug>` printed `doc.deliverableSection` unconditionally (`354682d:scripts/tasks.ts:1467`). The branch replaced that with clause standings and moved the section behind a new `--full`. `flagArities` infers a flag's arity from the token that follows it in the usage string; `spec show`'s usage ends `[--order] [--full]  (default shows clause standings; --full prints the whole ## Deliverable)`, so the token after `[--full]` is `(default` — not empty, not `--`/`[--`/`]`-prefixed — and `--full` is classified `value`. Reproduced against a scratch store:

- `tasks spec show demo-spec --full` → `error: --full needs a value`, exit 1. Same for the `tasks spec <slug> --full` shorthand.
- `tasks spec show demo-spec --full true` → works, prints the section. The literal string `true` is required and is documented nowhere.
- `tasks spec show demo-spec --full yes` → **exit 0, flag silently ignored**, standings printed. That is precisely what `cli.ts`'s own contract forbids ("a flag not named there is an error, never a silent no-op") and what `context.ts:10-12` cites as the reason `--actor` is not a global.

The same-spirit input the code handles is `tasks next --full`, which works because `[--full]` is the last token of that usage string. I ran every command's usage through `flagArities`: `spec show`'s `--full` is the only flag in the tool written `[--x]` yet inferred as taking a value.

Net effect: the whole `## Deliverable` section is no longer obtainable from the CLI by any documented route (`handoff` and `audit-prompt` print clauses only), and CI's `npm run tasks -- spec show "$SPEC_BRANCH"` on every PR now reports strictly less than before the branch. **This makes c2 unmet** — "the CLI surface is unchanged except where a clause below changes it deliberately", and no clause touches `spec show`.

**Fix:** stop `flagArities` at a prose parenthetical the way `positionalArity` already does, or move the parenthetical ahead of the flag list; add a test that runs `spec show --full` and asserts the Deliverable prose appears, so the boolean/value classification is pinned rather than inferred silently.

## M1 — `tasks promote` prints "promoted <id>" for records it then discards

**Files:** `scripts/tasks/records.ts:629-643`

Reproduced. Scratch store with unreviewed finding `finding-one` and done task `plain`:

```
$ tasks promote finding-one plain --spec demo-spec
stdout: promoted finding-one into demo-spec
stderr: error: plain is done — promote moves unreviewed or deferred records into a spec, it does not reopen closed ones
exit 1
store after: finding-one  state=unreviewed  spec=null
```

The loop announces each promotion inside itself, but `saveStoreAndWarn` is only reached after the loop, so a refusal on any later id throws away every promotion it already reported. `done` and `decline` do not have this shape: `resolveTaskIds` settles the whole batch before either write loop begins, which is what c4's "one bad id refuses the batch before anything is written" buys. `promote` validates state inside the loop instead.

**Fix:** pre-validate every resolved record's state before mutating or printing anything, mirroring `resolveTaskIds`'s all-or-nothing contract, so the batch either promotes and reports, or refuses and reports nothing.

## M2 — a second-pass finding filed the c7 way is stamped `pass 1`, so the pass-2 promotion guard never fires

**Files:** `scripts/tasks/audit.ts:434`, `scripts/tasks/records.ts:636`, `scripts/tasks/triage.ts:60`, `docs/workflow.md:40-44`

`cmdAudit`'s findings-only branch records `const against = doc.auditPasses.length === 0 ? 1 : doc.auditPasses[doc.auditPasses.length - 1].pass` — the *latest existing* pass, not the pass doing the filing. Reproduced end to end against a scratch spec:

```
pass 1 recorded in full            -> ### Pass 1 written
tasks audit demo-spec --finding …  -> "recorded … against pass 1"; source={"spec":"demo-spec","pass":1}; id demo-spec-pass1-…
tasks audit demo-spec --proof 1=met --finding … -> source={"spec":"demo-spec","pass":2}; id demo-spec-pass2-…

tasks promote demo-spec-pass1-a-second-pass-finding  -> promoted, silently
tasks promote demo-spec-pass2-a-verdict-carrying-…   -> "promoting a pass 2 finding, which extends what demo-spec owes"
```

`cmdPromote` and `cmdTriage` both gate that warning on `(task.source?.pass ?? 0) >= 2`, and workflow.md step 8 makes it a policy boundary: first-pass findings skip the walk and are auto-promoted; "From pass 2 on, promotion extends what the spec owes, so it waits for the human." c7 created the findings-only route precisely so a late pass does not reset verdicts — and that route is the one that loses the pass marker. This applies to this audit's own output: findings filed as the generated brief instructs would be recorded as pass 1 and fall under the auto-promote policy. (Related prior record, different case: `pass2-b-m5` already documents that `source.pass` is blind to hand-added findings; the findings-only route is new.)

**Fix:** record the pass the findings are *filed by*, not the pass they were filed against — `doc.auditPasses.length + 1` for provenance, keeping "against pass N" as the report text — or move the promotion policy off `source.pass` onto something the filing route cannot mis-stamp.

## M3 — c5's "anywhere a command resolves a task id" is false for four inlets, and workflow.md states it as universal

**Files:** `scripts/tasks/specCmds.ts:59`, `scripts/tasks/specCmds.ts:212`, `scripts/tasks/architectureCmds.ts:44`, `scripts/tasks/handoff.ts:176`, `docs/workflow.md:13`

Reproduced against a store holding `long-record-identifier-one`:

| command | `long-rec` |
|---|---|
| `edit` / `start` / `stop` / `done` / `decline` / `show` / `promote` | `resolved long-rec -> long-record-identifier-one` |
| `spec add demo-spec long-rec` | `error: no such task: long-rec`, exit 1 |
| `spec remove demo-spec long-rec` | `error: no such task: long-rec`, exit 1 |
| `plan long-rec` | `no such task: long-rec`, grades nothing |
| `note "a note" --id long-rec` | **exit 0**, event written against the literal `long-rec` |

The last is the sharp one: it succeeds, so nothing signals the miss, and `tasks log --id long-record-identifier-one` will never find that note. `docs/workflow.md:13` — written by this branch — asserts "Any id may be given as a unique prefix or substring", and CLAUDE.md holds that a disagreement between the tool and that document is a defect in one of them.

**Fix:** route those four inlets through `resolveTaskIds` (report form for `plan`, refusing form for `spec add`/`spec remove`, and resolve-before-record for `note`/`decision --id` so the event names the record's real id); or narrow c5 and workflow.md to the verbs that actually resolve.

## M4 — findings filed through `tasks import`, the second route the generated brief offers, are invisible to every c8 view

**Files:** `scripts/tasks/audit.ts:64`, `scripts/lib/taskStore.ts:345`, `scripts/tasks/specCmds.ts:118`, `scripts/tasks/records.ts:317`, `scripts/tasks/audit.ts:212`

`unreviewedFiledBy` reads `task.source.spec`. `cmdAudit`'s `buildFindingTask` sets `source: {spec, pass}`; `cmdImport` sets `source: null`. Filed both ways against one spec in one store:

```
demo-spec-pass1-route-a-finding   source={"spec":"demo-spec","pass":1}
demo-spec-h1                      source=null

spec show demo-spec        -> lists route A only, "awaiting triage (not members)"
list --spec demo-spec      -> lists route A only, "(filed by this spec's audit — awaiting triage)"
next                       -> "1 unreviewed finding(s) filed by demo-spec's audits await triage"
list --state unreviewed    -> both
```

The brief generated by c13 presents the routes as interchangeable: "file them in the same `tasks audit` call …, or write the report under `docs/audits/` and `tasks import <doc>`". c8 promises "An unreviewed finding filed by a spec's audit is visible from that spec"; half the sanctioned filing routes do not deliver it, and the invisible half is the one an auditor reaches for when it has a long report.

**Fix:** let `tasks import` record the provenance it files under (`--spec`/`--pass`, defaulting to the active spec, named in the brief), or stop offering `import` as an equivalent route in `audit-prompt` and workflow.md.

## L1 — c3's "at most once per process" has no test

**Files:** `scripts/tasks/context.ts:97`, `scripts/tasks/context.ts:110`

Mutation `warnedStoreDirty = true;` → deleted: **SURVIVED the whole suite** (0 failed of 1312). The two behaviours c3 names that *are* covered both die: `STALE_DIRTY_MS = 30*60*1000` → `0` is KILLED, and `dirtyStoreIssue(config)` → `null` in `doctor.ts` is KILLED. Only the once-per-process half is unheld. It is not vacuous — `cmdTriage` calls `saveStoreAndWarn` once per decision, which is exactly the multi-write process the guard exists for.

**Fix:** a triage-over-two-findings test against a backdated default store asserting the warning appears once, not twice.

## L2 — c5's exact-id-wins rule has no test, and `uniqueId` manufactures the collision it guards

**Files:** `scripts/tasks/resolveIds.ts:21-25`, `scripts/tasks/context.ts:232-238`

Mutation deleting the exact-match shortcut: **SURVIVED the whole suite** (0 failed of 1312). The rule is load-bearing by construction, not by accident: `uniqueId` resolves a slug collision by appending `-2`, so the tool itself creates strict prefix pairs. Reproduced — adding `foo` then a task whose slug is also `foo` yields ids `foo` and `foo-2`; `tasks show foo` resolves to `foo` exactly, with no "resolved" line and no ambiguity error. Without the shortcut it would refuse as ambiguous. Today's real store has 0 strict prefix pairs, so nothing has hit it yet.

**Fix:** a test with `foo` and `foo-2` in one store asserting `tasks show foo` returns `foo` and prints no resolution line.

## L3 — `tasks list --spec <slug> --state unreviewed` hides the findings c8 exists to surface

**Files:** `scripts/tasks/records.ts:316`

The filed-findings block is guarded by `flags.spec !== undefined && state === undefined`. Reproduced with one finding filed by demo-spec's audit: `tasks list --spec demo-spec` lists it and says so; `tasks list --spec demo-spec --state unreviewed` prints `0 task(s)`. The narrower, more precise question — "what is awaiting triage on this spec" — is the one that answers nothing.

**Fix:** include the filed section when the state asked for is `unreviewed`.

## L4 — `scripts/lib/bytes.ts`, created by this branch for the Task system alone, is owned by Testing procedure

**Files:** `docs/audits/systems.json`, `scripts/lib/bytes.ts`, `scripts/tasks/mergeReady.ts:3`

`tasks where scripts/lib/bytes.ts` answers `Testing procedure` (it falls under that system's blanket `scripts/lib` declaration), while `tasks where scripts/tasks/mergeReady.ts` reports `imports across a system boundary: scripts/lib/bytes.ts (Testing procedure)`. `bytes.ts`/`bytes.test.ts` have exactly one importer, inside the Task system. c1 enumerates eight libs by name and the branch's own new one is not among them, so a file this branch wrote for the Task system will be swept under another system's window — and the Task system's `lastAudit` is `null`.

**Fix:** add `scripts/lib/bytes.ts` and `scripts/lib/bytes.test.ts` to the Task system's paths, or record why a byte-integrity check belongs to Testing procedure.

## L5 — c15 falls short in two named ways

**Files:** `docs/tasks.jsonl`, `docs/events.jsonl`, `scripts/tasks/triage.ts:64-67`

c15 promises the subsumed findings are "closed against commits" and the sixteen unreviewed ones "each triaged with a recorded reason".

- Three records this branch closed carry `closed: 2026-08-03` and `closedCommit: null`: `task-system-real-world-friction-spec-pass1-a-test-was-duplic`, `task-system-real-world-friction-spec-pass1-three-copies-of-t`, `pass2-b-m5`. All three are among the store lines this branch's diff changed. (`tasks show` can derive a commit for them — `pass2-b-m5` derives `4aceb21` in 1.6s — so this is recoverable, not lost.)
- Seven of the sixteen carry only the canned string `deferred: opened outside every spec` in `docs/events.jsonl` at `2026-08-03T15:00:47` (pass3-m1..m4, pass3-l2, pass3-l5, comments-in-the-new-modules-…). That is the decision, not a reason, and it is not a reviewer's omission: `triage`'s `[2] defer` branch asks for nothing, unlike `[3] decline`, which requires one. Only the four declines carry a reason.

**Fix:** `tasks done <id> --commit <sha>` on the three; and either prompt for a one-line reason on defer the way decline does, or amend c15 to promise a recorded *decision* rather than a reason.

## L6 — `promote` silently re-homes another spec's open member, and calls an `in-progress` record closed when refusing it

**Files:** `scripts/tasks/records.ts:631-639`

Reproduced: `crossmember` open in `other-spec`; `tasks promote crossmember --spec demo-spec` → exit 0, `promoted crossmember into demo-spec`, and the record now names `demo-spec`, with no note that it left another spec. `spec add` — the verb that exists for this — reports the move it makes (`moved into spec X from Y`); `promote` does not, and its usage says it "moves unreviewed or deferred records into the spec", which is narrower than what it accepts. Separately, the refusal guard `from !== 'unreviewed' && from !== 'open'` catches `in-progress`, but the message reads "it does not reopen closed ones". `promote` also assigns `task.state` directly rather than through `transition`, so it is the one state-moving verb that never releases a claim.

**Fix:** report the previous spec on a cross-spec promote, and give the `in-progress` case its own message (or route the move through `transition`).

## Verified sound

Hypotheses formed and refuted, plus the clause behaviour I could break and watch die:

- **Batch atomicity (c4) holds in both directions.** `done first second` closes both with one event timestamp and one event per id in order; `done beta nosuch` and `done beta al` (ambiguous) both exit 1 with the store byte-identical afterwards. Deleting `return null` from `resolveTaskIds`'s unknown branch: KILLED (2 failed).
- **Fragment resolution is order-independent (c5).** Exact wins outright; then prefix; then substring; ambiguity is refused with the full candidate list and never guessed. `show alpha` (exact, also a prefix of `alphabet` and a substring of `x-alpha`) → `alpha`; `show alphab` → `alphabet` with the resolution named; `show lpha` → refused naming all three; `show -alpha` → `x-alpha`. Writes through fragments land on the resolved record (`edit long-rec --title` edits `long-record-identifier-one`), and a fragment naming one record twice is one action. Making ambiguity pick `candidates[0]`: KILLED.
- **State transitions are correct.** `done` → `start` reopens and clears `closed`/`closedCommit`; `decline` → `stop` reopens, clears the close, keeps the reason, and `doctor` then reports exactly the "reads as a decline that was reopened" warning; every move out of `in-progress` releases the claim; a second `done` keeps the first close date and only takes a new `--commit`. `transition`, `releaseClaim`, `cmdStart` and `cmdStop` are byte-identical to base modulo id resolution — no regression here.
- **c3's stale-dirty margin and doctor's unconditional report.** Own-write silence, second-write silence, and the warning after backdating the store 40 minutes all reproduce; `STALE_DIRTY_MS → 0`: KILLED; `doctor`'s `dirtyStoreIssue → null`: KILLED. `warnIfStoreDirtyAndStale` correctly reads the *pre-save* mtime and returns silently when the store file is missing or non-default.
- **c6, c7, c9, c10, c11, c12 all die under mutation.** `--` terminator neutralised: KILLED. Findings-only route made to append a pass: KILLED. `[a]` ask key renamed: KILLED (2). `git.mergeInProgress() → false`: KILLED — the pass-1 finding "doctor's MERGE_HEAD suspension has no test" really was closed at `a3d6f49`. `runMergeReady`'s red-leg filter emptied: KILLED (4 of 5). `bytes.indexOf(0) → -1`: KILLED (3).
- **`layerOf` reusing `covers` is not a behaviour change.** `covers(path, file)` for a non-`*.` pattern is `file === path || file.startsWith(path + '/')`, identical to the inlined predicate it replaced, and no layer root is a `*.` pattern.
- **c1's checkable half.** `tasks where scripts/tasks.ts` → `Task system`; `merge-ready`'s `audit-status` leg passes, so the partition is intact.
- **c2's measurable half, c14, c16.** Entry point 12 lines; largest module `records.ts` 644 < 700; `docs/workflow.md` 107 < 242; whole suite 1312 tests green (measured twice as a mutation baseline) and `merge-ready` green on all six legs here.
- **Not a defect: `tasks show` deriving a closing commit.** I suspected a `git log` + per-commit store parse would be slow on the real 389-record store; measured at 1.6s wall for `tasks show pass2-b-m5`.
- **Pre-existing, not this branch's:** `cmdConcept` crashes on `tasks concept Runtime` (`name.trim()` on `undefined`) — identical in base at `354682d:scripts/tasks.ts:1108`; `tasks audit --proof 17=met` for a nonexistent clause is silently discarded and reported `unknown` — identical logic in base; a flag *value* starting with `--` remains unwritable, which the `--` terminator does not address and base did not either.
- **Unclaused but additive and covered:** `auditImport`'s prefixed heading support (`## RG-H1`) and the CRLF normalisation in `specDoc`/`auditImport` are outside every clause, but both carry tests and neither narrows existing behaviour.

## Merge judgement

**H1 is the only one this branch should not merge without.** It is a confirmed regression with a working fix of one line: an advertised flag that hard-errors as spelled and silently no-ops for any value but the literal `"true"` is the exact failure `cli.ts` was written to make impossible, and with it broken the `## Deliverable` section has no CLI route at all. Fixing it also settles c2.

Everything else is fileable. **c2 and c5 I grade unmet**, both for reasons the pass-1 verdicts could not have seen clause-by-clause: c2 because an unclaused surface change slipped in under the split, c5 because the clause says "anywhere" and four id inlets were missed while `docs/workflow.md` went on to state the property as universal. I disagree with pass 1 on those two clauses only; the other fourteen I re-grade met, with M2/M4 recorded against c7/c8 as consequences rather than failures of the clauses themselves.
