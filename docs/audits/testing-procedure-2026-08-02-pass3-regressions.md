# Testing procedure — 2026-08-02, pass 3 (regression audit)

Branch `task-system-policy-seam` against `main` (`91cd1ed`). Scope: one question
only — **is anything worse than it was before this branch?** Clause verification
was handled by the other auditor and is deliberately absent here.

Range: `git diff main...HEAD` — 32 files, +8462/−1507, 90 commits.

## Required commands

Run on the branch working tree at `1ac51b0`:

| command | result |
| --- | --- |
| `npm test` | 43 files, **899 passed**, 53.7s |
| `npx tsc --noEmit` | exit 0 |
| `npm run layer-check` | 468 imports, all downward, exit 0 |
| `npm run tasks -- doctor` | 280 tasks, 0 errors, 0 warnings, 0 unparseable, exit 0 |
| `npm run audit-status` | exit 0, partition intact |

`main` was checked out to a throwaway `git worktree` (never `git checkout` in
place; the branch tree was not mutated). Its suite was not run — the worktree has
no `node_modules` and installing one is not worth the wall clock — but every
behavioural claim below was A/B'd by invoking `main`'s `scripts/tasks.ts`
directly through the shared `tsx`, against scratch stores under the scratchpad.
`docs/tasks.jsonl` and `docs/events.jsonl` were not touched.

### Note on working-tree state

The tree was clean at `1ac51b0` when this audit began. Partway through it, an
uncommitted edit to `scripts/tasks.ts:2095-2100` appeared — not made by this
audit, which changed no source file:

```js
const { events: rawEvents, skipped } = loadEvents(config.eventsPath);
const nowById = new Map(readStore(config).map((task) => [task.id, task]));
const events = rawEvents.map((event) => (event.id !== null && nowById.has(event.id) ? { ...event, spec: nowById.get(event.id)!.spec, system: nowById.get(event.id)!.system } : event));
```

It was left in place. Flagging it because it is the exact thing `c12` forbids —
`tasks log` answering "by joining to present-day state, which would rewrite
history every time a record is re-pointed" — and because the `npm test` result
above predates it. It is outside the `main...HEAD` diff this audit scopes, so it
is not numbered as a finding, but it should not be committed as written.

---

## RG-H1 — A store-corrupting merge now succeeds silently, and the one condition CI still fails on was made unreachable by the same branch

**Files:** `.gitattributes:6-13`, `.github/workflows/test.yml:39-45`, `scripts/tasks.ts:494-501`
**Commits:** `da6aa7d` (union attribute), `fbe1b90` (CI step removed), `4d0e892` (`check` → `doctor`)

Three changes landed on this branch that are individually defensible and jointly
open a silent-corruption path that did not exist on `main`.

1. `da6aa7d` added `docs/tasks.jsonl merge=union` to `.gitattributes`.
2. `4d0e892` made the store scan report instead of refuse: `doctor` exits
   non-zero on **one** condition, a line that will not parse.
3. `fbe1b90` removed `tasks check` from CI, replacing it with `doctor`.

The CI comment states the failing condition's purpose outright:

> a store line that will not parse — a committed merge marker, which is a real
> breakage and not a disagreement about the work

A committed merge marker in `docs/tasks.jsonl` is the exact outcome that
`merge=union` exists to prevent. The branch removed the gate, kept one failure
condition, and then configured git so that condition can no longer be produced by
the mechanism it names.

What union merge produces instead is not a marker. `saveStore` rewrites the whole
file, so any schema change touches every line — this branch did exactly that in
`b326230`, which added `claimed`/`claimedBy` and rewrote all 277 records.
Reproduced in throwaway repos, a schema-rewrite branch merged against a base that
appended one record:

```
# with `docs/tasks.jsonl merge=union`
Auto-merging docs/tasks.jsonl
Merge made by the 'ort' strategy.
MERGE_EXIT=0
--- result ---
{"id":"a","v":1}
{"id":"b","v":1}
{"id":"c","v":1}
{"id":"d","v":1}
{"id":"a","v":1,"new":null}
{"id":"b","v":1,"new":null}
{"id":"c","v":1,"new":null}

# identical merge without the attribute (i.e. `main`)
CONFLICT (content): Merge conflict in docs/tasks.jsonl
MERGE_EXIT=1
```

Every record is now duplicated, exit 0, no human ever prompted. And `doctor`
passes it:

```
$ npx tsx scripts/tasks.ts doctor --store <store with one duplicated id>
1 issue(s) — reported, not enforced:
  [error] duplicate id: build-deployment-2026-07-28-h1
3 task(s), 1 error(s), 0 warning(s), 0 unparseable line(s)
EXIT=0
```

`duplicate id` is `level: 'error'` in `taskStore.ts:441`. On `main`, `tasks check`
exited 1 on any error and ran on **both** CI legs, so this reached a red check.
Now it is a line in a log on one leg. Downstream, `tasks edit <id>` resolves the
first match and `saveStore` writes both back, so the stale twin survives every
subsequent write, indefinitely, with CI green.

This is the clearest case on the branch of a guard that was preventing damage
rather than preventing the record of a disagreement. The premise stated in the
spec — "Every agent using this store is cooperative, so the premise that
justified a gate was never true here" — does not apply: nobody is the adversary
here, git's merge driver is, and a cooperative agent cannot see what it did.

The union attribute's own comment anticipates the duplicate-id case and points at
`doctor` as the answer. `doctor` exits 0 on it.

---

## RG-H2 — The tool now contradicts the document CLAUDE.md designates as its specification, and contradicts a prompt it generates itself

**Files:** `docs/specs/task-system-v2.md:56-60, 84-88, 221, 256`, `scripts/tasks.ts:1442`
**Commits:** `60de2cd` (pass-2 promote guard removed), `f4104e0`/`9629bd4`/`fbe1b90` (gate, freeze, CI), `7c1db37` (edited `task-system-v2.md` and left the body stale)

CLAUDE.md:26 — "The workflow and the tool that carries it are specified under
`docs/specs/`". `docs/specs/task-system-v2.md` is where that workflow is written
down. This branch edited that file (deleting its `## Amendments`) and left the
body describing a tool that no longer exists:

- `:56` — "**Pass 2 and later may defer or decline, never promote.** This is the
  only rule that terminates the audit-fix loop, and it terminates it by
  construction rather than by discipline." `60de2cd` deleted that refusal.
  `scripts/tasks.test.ts:1474` now asserts "spec add promotes a pass 2+ finding"
  and `:2521` asserts "triage promotes a finding sourced from an audit pass 2 or
  later".
- `:60` — an unmet clause becomes an undelivered member "and it cannot be
  declined." It can now: `scripts/tasks.test.ts` asserts "accepts a declined
  undelivered task, which is now an abandonment the tool can record", and `done`
  on an undelivered task closes against an unmet verdict.
- `:84-88, 221` — `spec amend`, the amendment baseline comparison. Deleted.
- `:256` — "`tasks check --merge` refuses when any of these is true:" followed by
  the full rule list. The command is gone.

Both of the two rules that this document names as the only things terminating the
audit-fix loop *by construction* were removed, and the document still claims them.
A cold agent reading the spec — which is what CLAUDE.md instructs — is now
misinformed about the two rules with the largest blast radius.

Worse, the contradiction ships inside one file. `scripts/tasks.ts:1442`, in the
prompt `tasks audit-prompt` generates for every auditor:

```js
console.log('Do not promote pass-2+ findings. Do not treat green tests as proof unless they are tied to the clause they discharge.');
```

The same source file, 500 lines earlier, implements and advertises pass-2+
promotion. Every auditor this tool commissions from now on is instructed in a
rule the tool actively supports breaking. That is not stale prose in an archive;
it is generated output, produced fresh on every invocation.

---

## RG-M1 — A dangling requirement went from impossible-and-fail-closed to accepted-and-fail-open, in one branch

**Files:** `scripts/lib/taskStore.ts:258-275`, `scripts/tasks.ts:538-545`
**Commit:** `14c26ba` "Record a requirement on a task that does not exist yet"

Two independent protections were removed together.

On `main`, `validateContentFields` refused the write:

```
$ npx tsx <main>/scripts/tasks.ts add "does the work" --requires does-not-exist ...
error: --requires references unknown id(s): does-not-exist
MAIN_ADD_EXIT=1
(store file is empty)
```

And had one existed anyway, `main`'s `isBlocked` was fail-closed:

```js
// main, taskStore.ts
return task.requires.some((id) => byId.get(id)?.state !== 'done');
```

`undefined?.state !== 'done'` is true, so a requirement naming nothing **blocked**
the task.

On the branch both halves are reversed. The write is accepted:

```
$ npx tsx scripts/tasks.ts add "does the work" --requires does-not-exist ...
added worker [task/open]
recorded 1 requirement(s) no record answers to: does-not-exist — they do not block, and `tasks doctor` reports them until they resolve
```

and `requirementStates` classifies the missing id as `'missing'`, which
`waitingOn` filters out — the branch's own test states it: "is unblocked by a
requirement id no record answers to, which names nothing to wait for".
`doctor` reports it at `level: 'error'` and exits 0.

The consequence is specific and bad: `tasks next` will hand a worker a task whose
stated prerequisite does not exist, presented as ready. The commit's stated
purpose is forward references — record a dependency before its target exists —
but under these semantics a forward reference has no effect at all until the
target is created, which is precisely the window in which it was supposed to
protect something. The write guard's removal is defensible under c2. Flipping
`isBlocked` from fail-closed to fail-open in the same change is what makes it a
regression rather than a policy shift, and nothing in the spec asked for it.

---

## RG-M2 — On a PR, nothing reports the branch's spec standing at all

**File:** `.github/workflows/test.yml:33-45`
**Commits:** `fbe1b90`, `f4104e0`

The branch is framed as gate → ledger: refusals become reports. In CI the flip
was gate → **nothing**.

`main`'s PR run executed `tasks check --merge`, which printed the spec's
outstanding issues — no audit pass recorded, a clause unmet, a clause ungraded, a
promoted finding still unreviewed, a member neither done nor declined — and
turned the check red. A reviewer saw the list on the PR page without asking.

The branch's CI is `tsc`, `npm test`, `layer-check`, `audit-status`, `doctor`.
`doctor` takes no spec and reports nothing about clause standing, membership or
audit passes; its `specIssues` covers only duplicate clause ids. There is no
`tasks spec show`, no `tasks audit-prompt`, no report step of any kind. The
information the gate used to surface is now reachable only by a human who thinks
to run a local command.

"A report nobody reads is weaker than a refusal" understates this case: there is
no report in the place the refusal used to appear.

---

## RG-M3 — Seven proof targets in a tracked spec now name deleted tests, and the mechanism that would have caught that was deleted in the same branch

**File:** `docs/specs/task-system-real-world-friction-spec.md:22, 23, 27, 28, 39, 42, 56`
**Commits:** `fdc706a` (proof-target execution removed), `f4104e0`/`9629bd4` (the tests)

`main`'s `check --merge` executed each `proof: vitest <file> "<test>"` target and
failed on a target whose named test was missing or failing. That is deleted;
targets are now parsed (`specDoc.ts:5, 95`) and printed into the auditor prompt,
never run.

The branch then deleted tests that seven live targets name. Verified against the
current test corpus:

| target | status |
| --- | --- |
| `"check --merge fails a vitest proof target whose named test fails, and reports the match count"` | MISSING |
| `"check --merge runs proof command targets and reports a failing target by clause id"` | MISSING |
| `"check reports a working-tree-only done mark as an error naming the task and its committed state"` | MISSING (renamed to `doctor …`) |
| `"check warns when a done task names a closing commit not reachable from HEAD"` | MISSING (renamed to `doctor …`) |
| `"check --merge applies to a branch renamed away from its spec's filename…"` | MISSING |
| `"spec freeze records the current deliverable as the baseline and refuses a second freeze"` | MISSING |
| `"next is concise by default and prints full task detail only with --full"` | MISSING |

`audit-prompt` prints these to an auditor under the instruction "has a proof
target — pure logic/API shape: temporarily remove, invert, or scale the behavior
it proves", followed by "confirm the target exists". Four of the seven are
genuinely dead; two were renamed and the spec was not re-pointed. On `main` a
single command surfaced all seven; today nothing does, and the branch created the
divergence itself.

Mitigating: this spec is superseded by `task-system-policy-seam`. It is still a
tracked file that `tasks audit-prompt` will happily read.

---

## RG-M4 — The commit-msg hook stopped requiring a `Next:` trailer

**File:** `scripts/lib/commitContract.ts:30-40`
**Commit:** `dfa2cb7` "Make Next trailers optional"

Removed:

```js
const hasNext = lines.slice(1).some((line) => NEXT_TRAILER.test(line.trim()));
if (!hasNext) return 'commit message has no Next: trailer saying what the following session should pick up';
```

`tasks handoff` — the cold-start command, the thing a fresh session runs first —
reads `Next:` trailers to say what to pick up. On `main` the hook guaranteed the
immediately preceding commit carried one. Now handoff must walk back up to
`--scan-cap` commits and may legitimately report none found; the branch added
tests for exactly that path, which is the admission that the guarantee is gone.

Partly mitigated by the same branch: handoff's walk-back, multi-line trailer
capture and branch-point stop are all better than `main`'s. But the invariant it
used to rely on is now a convention.

---

## RG-L1 — Three specs' amendment history was deleted from the tree, and the event log does not carry it

**Files:** `docs/specs/task-system-v2.md` (−31), `docs/specs/combat-continuation-runtime.md` (−42), `docs/specs/task-system-small-test-fixes-to-get-feet-wet.md` (−25)
**Commit:** `7c1db37` "Record every store write, and delete the amendment that was a second copy"

The justification — an amendment was a second copy of the deliverable — holds for
`task-system-v2.md`, whose archived body is byte-identical to its live
`## Deliverable`. It does not hold for the amendment *headings*, which carried
prose that exists nowhere else:

> ### 2026-07-31 — Pass 1 measured six clauses and the branch learned three things they got wrong: clause 1 bounded the interpreter rather than the store, clause 3 promised a who field the record never had, and clause 5 named a merge-base comparison that is inert for a spec created on its own branch.

And it does not hold for `combat-continuation-runtime.md`, whose archived
deliverable is **not** a copy: the live `[c3]` has since been materially rewritten
to add the saturated-pool limitation, so the deleted section was the only record
in the tree of what that clause promised on 2026-08-01.

The replacement offered for amendments is the event log — but the log
(`docs/events.jsonl`) begins on this branch and contains 13 lines, none of them
these. Two of the three files belong to other branches' work. Recoverable from
git; no longer readable where a reader would look.

---

## RG-L2 — Two spec clauses promise a command that no longer exists

**Files:** `docs/specs/combat-continuation-runtime.md:42`, `docs/specs/task-system-small-test-fixes-to-get-feet-wet.md:20`

Both name `npm run tasks -- check --merge --spec <slug>` as a condition of being
marked done. `3714aa7` re-pointed the *task records* off the merge gate; the spec
clauses were missed. `combat-continuation-runtime` currently has 0 members in the
store, so the practical exposure is small.

---

## RG-L3 — The store scan lost a CI leg

**File:** `.github/workflows/test.yml:44-45`

`tasks check` ran on both `ubuntu-latest` and `windows-latest`; `doctor` runs on
ubuntu only. The workflow's own top comment justifies the Windows leg on line-ending
sensitivity, and the store is a text file the Windows checkout reads. With
`* text=auto eol=lf` in `.gitattributes` this is unlikely to matter; noting it
because the removal was justified as "platform-independent" without measurement.

---

## Checked and found not worse

- **`npm test` count.** 832 → 899 is a real net gain, not a wash. Of the ~65
  test titles present on `main` and absent here, all but the seven in RG-M3 are
  either renamed (`check …` → `doctor …`) or bound to code that is genuinely
  gone (mergeGate, freeze, `spec amend`). Spot-checked the commit bodies'
  justifications against the current corpus for `working-tree-only`, `closing
  commit not reachable`, `duplicate clause id`, `spec done`, `spec remove`,
  `decline requires a reason`, `--full`, `isBlocked` and every `specDoc` case —
  each has an equivalent or a strictly stronger successor.
- **`isBlocked` decomposition.** `main`'s single test became four, covering
  unreviewed/open/in-progress, done, declined and missing. Better coverage; the
  missing-id *semantics* are RG-M1, the coverage is not.
- **`specDoc`.** Fenced-code-block skipping, `~~~` fences, the audited-id
  reservation and the `unknown` round-trip are all new and all tested. The
  `## Audit passes` parser is unchanged in behaviour for existing files —
  `- proof N: met — …` still parses.
- **Unknown-id handling on writes.** The move from "no such task" to near-match
  suggestions kept the non-zero exit: `refuseUnknownIds` sets
  `process.exitCode = 1` and is wired into all seven write paths. Reads answer
  and exit 0, which is the intended split.
- **`c11` completeness.** Every `saveStoreAndWarn` call site in `scripts/tasks.ts`
  is paired with a `recordEvents` call — checked all 14. No write path escapes
  the log.
- **Event-log reinstatement.** The reversal window (`fc66211` → `1b11143`) is
  where the gate deletion and the guard removals happened, so the concern was
  well placed. But nothing in that window depended on the log's absence: the
  only capability the cut actually removed was `spec amend`, which the
  reinstatement deliberately does not restore and states so under c10. The
  restoration is partial by design, and the one thing it does not carry back is
  RG-L1.
- **Layer discipline.** `layer-check` clean at 468 imports; `eventLog.ts` sits in
  `scripts/lib` with no upward reach.
- **Type strictness.** `noUnusedLocals`/`noUnusedParameters` were *added* to
  `tsconfig.json`. Strictly stronger; `tsc --noEmit` clean.
- **System partition.** `audit-status` exits 0, so every new file
  (`eventLog.ts`, `docs/events.jsonl`, `.planning/agent-swarm-theory.md`, the two
  audit records) is owned. No orphans introduced.
- **`tasks check` removal is not silent.** `scripts/tasks.ts:2260` intercepts the
  old name with an explanatory error and exit 1, rather than "unknown command".
  No tracked script, hook or npm script still calls it — the only hits are in the
  untracked `.claude/worktrees/` copy.
- **The `commit-msg` hook's tsx change.** Prefers a local `node_modules/tsx`
  and falls back to `npx`. Faster, same behaviour.
- **The positional-argument hole** (`1ac51b0`) is real but **not** a regression:
  `main` discards extra positionals identically. The branch widened its blast
  radius by adding `note`/`decision`, found it by dogfooding, and filed it. Left
  as-is.
- **Five-minute budget.** `npm test` 53.7s, `doctor` and `layer-check` under 3s
  each, `tsc` well inside. CLAUDE.md:40's CI description now matches
  `test.yml` exactly, including the ubuntu-leg scoping.
- **Runtime, DSL and content systems.** The only touch outside `scripts/` and
  `docs/` is one unused import removed from `src/runtime/runtime.test.ts`, forced
  by `noUnusedLocals`. No runtime behaviour changed.

---

## Bottom line

Two findings I would not merge without a decision on: **RG-H1**, because the
branch configured away the only failure its own CI step still detects while
opening the corruption path that replaces it, and **RG-H2**, because the tool now
prints an instruction it contradicts, in a prompt it generates for every future
auditor.

**RG-M1** is the case the brief asked for specifically — a guard that was
preventing damage, not preventing the record of a disagreement. Its removal would
have been fine on its own; reversing `isBlocked`'s polarity in the same change is
what makes it a live defect rather than a policy choice.

The remaining findings are drift the branch created and did not sweep up. None of
them are the deletion volume itself: the 1113 removed lines and the ~51 removed
tests hold up under spot-checking, and the commit bodies' justifications were
accurate everywhere I tested them.
