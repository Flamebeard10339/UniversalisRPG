# Testing procedure audit — 2026-07-30, pass 2

Independent audit of repository system 5 (**Testing procedure**) at `9adc928`, covering the four
code-changing commits since `4631baa` — `ec4bc17`, `9e1b1b3`, `92adffe`, `c0984d2` — and the one
completed task chunk group they close, `task-system`.

The window is one deliverable: `backlog.md` and the four per-feature deliverable logs became
`docs/tasks/`, `scripts/tasks.ts` (972 new lines) became the store's only writer, and the audit
trigger's unit changed from commits to task chunks. Scope is therefore `scripts/tasks.ts`,
`scripts/audit-status.ts`, `.claude/hooks/task-handoff.sh`, `.claude/commands`, `.claude/settings.json`
and `test.yml`, judged against the design in `docs/tasks/task-system.md` — which is this window's
own acceptance criteria, and is treated as a claim to test rather than a description to trust.

Baseline: `npx tsc --noEmit` clean, **34 files / 520 tests** green, `layer-check` 435 imports all
downward, `tasks check` passes on 94 tasks, `audit-status` exits 0 with Testing procedure at WARN.

Method: every gate was driven with fixtures in a throwaway `git worktree` under the scratchpad
(removed; the working tree was never modified), and against the real store through the exported
API. Each finding names the fixture or the command that reproduces it.

Pass 1 (`testing-procedure-2026-07-30.md`) is the `play-cli`/`layer-check` audit; all ten of its
findings are open and lifted, and none is re-reported here.

---

## What the window gets right

**The migration lost nothing at the heading level.** All **58** `##`/`###` items of
`ec4bc17~1:backlog.md` (868 lines) map to a task file — checked by slugging every heading and
matching against all 94 task ids and titles, 0 unmatched. The four deliverable logs moved as
renames, so `git log --follow` still reaches their history.

**Gate 8 is real and bidirectional.** `92adffe` made `checkStore` fail both on a task naming a
finding its doc does not have and on a finding no task references. Driven with a live doc, it
produced all four expected errors and no others. It is the forcing function the design argued
for, and it is the one gate here with recorded history behind it.

**The round-trip test guards the whole store, not a fixture.** `tasks.test.ts:192` re-serialises
every real task file and asserts no non-empty line disappears. This is why the migration can be
trusted, and it is the right shape — it enumerates the store rather than listing examples.

**`--brief` is a genuine improvement to the audit prompt.** It replaced the unfiltered
`git log --oneline <sha>..HEAD` the previous six audits resorted to, and its per-system file list
and pre-filtered code-changing commits were the starting point for this pass.

---

## H1 — an unresolvable `lastAudit` now reports the system OK and exits 0, disarming the ledger, the chunk budget and `tasks done` together

`4631baa` computed the ledger through a bare `git()`. This window changed it to `safeGit` at
`scripts/audit-status.ts:93`, and the new budget path reads through `safeGit` too at
`scripts/tasks.ts:460`. Neither reports the failure. A `lastAudit` that no longer resolves is
therefore indistinguishable from a system with nothing to review.

Measured in a worktree at `9adc928`, Testing procedure's `lastAudit` set to `deadbeef` and
`chunkBudget` lowered to `{warn: 1, block: 2}` so the real state is unambiguously over budget:

| `lastAudit` | ledger line | `audit-status` exit | `tasks done` |
| --- | --- | --- | --- |
| `4631baa` (real) | `DUE  Testing procedure  4 of 4 commit(s) …; 6/2 completed task chunk(s)` | **1** | refused: *"is at 6/2 task chunk(s); run an audit"* |
| `deadbeef` | `     Testing procedure  0 of 0 commit(s) …; 0/2 completed task chunk(s)` | **0** | **accepted** |

The same fixture against `4631baa`'s `audit-status.ts` exits **1** with a Node stack trace. So the
change converted a loud failure into a green one.

Three consequences, not one:

- **CI passes.** `test.yml` runs `npm run audit-status`; exit 0 is a passing step.
- **The chunk budget reads 0 forever.** It is now the *verdict* — `audit-status.ts:186` is
  `owed || budget.state === 'block'` — so the system can never become due again.
- **`tasks done` stops refusing.** `doneTask` (`tasks.ts:757-762`) calls the same
  `auditBudgetForSystem`. The block that the design calls "the forcing function" is off, silently,
  for that system only.

Git's own `fatal: bad revision` reaches stderr, but it carries no verdict line, so `audit-due.sh`
classifies the run as successful (`if ledger=$(npm run --silent audit-status 2>&1)` succeeds),
writes `<head> ok`, and never speaks — the same fail-open the previous pass logged as **M1**.

This is not hypothetical, and pass 1 said why: `lastAudit` records a branch SHA and this repo
rebases and squashes feature branches. Once the original is gc'd the reference is unresolvable.
**M1's task is still open and its prescribed fix is the right one** — resolve `lastAudit` in a
`try` and turn a failure into a named verdict line alongside `undocumented`, so the ledger reports
rather than either aborting or lying. The window applied the `try` and skipped the verdict line,
which is the half that carried the signal.

---

## M1 — the chunk budget counts trailer lines, not chunks, so the number in `systems.json` is neither of the two things it could mean

`auditBudgetForSystem` (`tasks.ts:483`) is
`commits.reduce((sum, commit) => sum + commit.trailers.length, 0)`.

For `task-system` in this window the six trailers are:

```
task-system#1  task-system#1  task-system#6  task-system#6  task-system#6  task-system#7
```

- declared chunks in the task (`git show 92adffe:docs/tasks/task-system.md`): **8**, all checked
- distinct `(task, chunk)` pairs closed by a trailer: **3**
- reported by `audit-status` and `--brief`: **6**

Three numbers, none equal. Chunk 6 was committed three times and counted three times; chunks 2–5
and 8 were closed without a trailer and counted zero. The design's stated unit is
"a chunk of a completed task, not a commit" (`task-system.md:323`), rejecting commits precisely
because "a commit is an arbitrary slice". Counting trailer occurrences restores the arbitrary
slice — a session that splits one chunk across three commits spends three times the budget of one
that does not. `parseTaskTrailers` also accepts a bare `Task: <id>` with no `#n` (`tasks.ts:452`),
and that counts 1, which is a commit counted as a chunk by construction.

The same mechanism blinds `--brief`. Its "Completed tasks in range" is derived from trailers
(`audit-status.ts:143`), so **31 of the 32 `done` tasks naming Testing procedure have zero trailers
anywhere in history** and are invisible to it. The brief for this audit listed one completed task;
two were confirmed at `9adc928`. `go-full-integer-milli-units-and-integer-milliseconds` charges
this system per the design's multi-system rule (`task-system.md:127-130`) and contributes nothing
to either the count or the auditor's working set.

Both halves are one fix: derive the count from the tasks (`status: done`, naming the system,
whose completion falls in the range) and their own checked chunks, using trailers to locate the
task rather than to be the unit. `tasks confirm` strips `## Chunks`, so the compacted archive
cannot supply the boxes — which is the constraint that pushed the implementation to trailers, and
the reason the fix has to decide deliberately rather than by default.

---

## M2 — the entire audit trigger ships untested, against this deliverable's own written instruction not to

`task-system.md:598` records the open question and answers it: *"No test precedent for
`scripts/audit-status.ts` — it ships untested. `tasks.ts` should not follow that precedent."*

Measured references in `scripts/tasks.test.ts`:

| export | references |
| --- | --- |
| `auditBudgetForSystem` | **0** |
| `auditBudgets` | **0** |
| `taskCommitsSince` | **0** |
| `parseTaskFile` / `readManifest` | 0 |
| `checkStore` | 4 |
| `rankedQueue` | 2 |

The three functions with zero coverage are exactly the new audit trigger — the number that gates
`tasks done`, sets the `warn`/`block` marker, and decides CI's exit code. **H1** and **M1** are
both inside them.

`checkStore` fares better but not by much. Of its thirteen error branches, four are asserted
(missing blocker, two-active, duplicate heading, gate 8). The other nine — invalid severity,
invalid status, malformed audit reference, unknown system, missing section, confirmed-not-compacted,
handoff-required, done-with-unchecked-chunks, and **dependency cycles** — have no test. Driven by
hand against a seven-task fixture, all nine fire correctly and the cycle is reported once rather
than per entry point, so this is a coverage finding and not a correctness one. But gate 2 is a
graph traversal with a `visiting`/`visited` pair and no test, and it is one refactor away from
being a correctness one.

The suite that exists is well-shaped — the round-trip test and the fenced-heading pair are exactly
right. The gap is that it tests the parser and the writer, which are the parts a reviewer can
eyeball, and not the arithmetic, which is the part nobody can.

---

## M3 — every writer verb silently deletes whatever sits between the frontmatter and the `# Title`

`parseSections` builds `preamble` from `body.slice(titleEnd, firstSection)` (`tasks.ts:206-208`);
anything before `titleMatch.index` is never captured, and `serializeTask` emits frontmatter, title,
preamble, sections. The content in between is dropped without a word.

Fixture — a migrated task carrying a provenance block above its heading, then one `tasks note`:

```
before: file contains "LOAD-BEARING PROVENANCE LINE"  -> true
        recorded note for alpha
after:  file contains "LOAD-BEARING PROVENANCE LINE"  -> false
        file contains "Migrated verbatim"             -> false
```

`9e1b1b3` — *"Stop writer verbs from silently dropping nested task sections"* — is this exact class,
and its fix is right: `writeTask` (`tasks.ts:288-292`) refuses a duplicate `##` heading *before*
writing, names it, and says how to fix it. Two shapes of unowned content, one refused loudly and
one deleted silently, in the same function.

No task file carries pre-title content today, and `tasks.test.ts:192`'s round-trip over the real
store would turn CI red if one did. That makes this latent rather than live — but the detection is
after the write, in CI, on a file whose working-tree copy has already lost the lines, whereas the
duplicate-heading case never reaches the disk. The guard belongs next to the one `9e1b1b3` added.

---

## M4 — `npm run tasks` takes 19.5 seconds to compute a tiebreak that cannot discriminate

`firstCommitTimestamp` (`tasks.ts:342`) spawns `git log --follow --format=%ct -- <file>` and is
called from inside `rankedQueue`'s sort comparator (`tasks.ts:371`) with no memoisation.

```
tasks list   real  0m19.484s
tasks check  real  0m0.240s
```

`rankedQueue` alone accounts for 19.6s of that. One `git log --follow` over this repo costs 0.142s,
which puts the comparator at roughly 138 spawns for a 48-item queue — the same file re-queried on
every comparison it participates in.

The value being computed is degenerate. Across all 94 tasks there are **8 distinct first-commit
timestamps, and 87 tasks share one of them** — the migration commit `ec4bc17`. So tiebreak 3
("oldest first") can order 7 tasks out of 94, and costs 80× the runtime of the CI gate to do it.

`tasks next` runs the same function, so `/task-next` — the command the slash-command prose makes an
agent's first action of every session — pays the full 19.5s. The function is pure per file; a
`Map<string, number>` in `rankedQueue`'s scope makes it 94 spawns worst case, and hoisting it out
of the comparator into a precomputed table makes it 94 exactly.

---

## M5 — the ordering axis chosen instead of a priority field is empty, so the queue head is alphabetical

The design rejected a second hand-assigned priority axis on the grounds that transitive dependent
count already answers it, and named the case (`task-system.md:206-209`):

> "Make the thin RPG GUI work again" blocks the release gate, the GUI mod portal and
> action-labels-as-members, so it floats; the five DSL lows have no dependents and sink.

Measured against the store it produced:

```
0 high   a-block-form-list-line-silently-drops-what-it-does-not-understand-dsl
0 high   an-approved-mod-loses-every-edit-and-removal-it-makes-contribution-aud
0 high   block-release-until-mvp-is-complete
0 high   checksave-crashes-on-the-save-bodies-it-exists-to-reject-runtime-audit
0 high   make-the-thin-rpg-gui-work-again
0 high   test-rewinds-the-live-session-and-corrupts-the-test-it-records-tp-audi
0 high   the-shipped-end-to-end-test-plays-the-tutorial-with-no-health-pool-dsl
0 high   the-signed-release-apk-is-built-in-dev-configuration-build-audit-2026
```

Every high-severity task has zero dependents, and with tiebreak 3 also degenerate (**M4**) the
queue head falls through to `readdirSync` order, which is alphabetical. The named example does not
occur: `block-release-until-mvp-is-complete`, `mod-portal-organized-by-pack` and
`action-labels-as-members` all declare `blocked-by: []`.

**13 of 94 tasks declare a blocker**, and all thirteen are the mechanical relations the migration
spec called out as conversions of existing nesting — the four `###` sub-items, the four
`tier-*` splits, the three `follow-up` chains. Not one semantic dependency was added, which is the
work the design deferred to the migration without listing it as a chunk.

This is an unmet acceptance criterion rather than a bug: the machinery is correct and the input is
absent. But until the graph is populated, `tasks next` ranks by severity and then by filename, and
the design's justification for having no priority field is not yet earned.

---

## M6 — `systems.json` has two readers, two type declarations and two default-budget expressions in one process

`audit-status.ts:116-117`:

```ts
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
const taskStore = readTaskStore();
```

`readTaskStore` reads and parses the same file into `taskStore.manifest` (`tasks.ts:241,251`). Two
parses of one file on consecutive lines, producing two object graphs that are then used
interchangeably — `printBrief` takes its `system` from the first and passes it to
`auditBudgetForSystem`, which is typed against the second.

The declarations have already drifted. `audit-status.ts:8-14`'s `System` has five fields;
`tasks.ts:44-51`'s `SystemEntry` has six — `noFindings`, which gate 8 depends on and which
`audit-status` therefore cannot see. `git`/`safeGit` are duplicated verbatim
(`audit-status.ts:35-45` against `tasks.ts:108-118`). And the budget default is written twice:

```ts
// audit-status.ts:205 — what is printed
const budget = manifest.chunkBudget ?? { warn: manifest.threshold ?? 20, block: manifest.threshold ?? 20 };
// tasks.ts:474 — what is enforced
const budget = store.manifest.chunkBudget ?? { warn: store.manifest.threshold ?? 20, block: ... };
```

A manifest without `chunkBudget` gets its printed budget from one copy and its verdict from the
other. They agree today by having been typed twice.

CLAUDE.md's rule is *"do not create systems that are required to be manually kept in sync"*, and
this window is the one that wrote it into the file. `audit-status` already imports two symbols from
`tasks.ts`; importing `readManifest` — which is exported and has zero callers — and deleting the
local `System`/`Manifest`/`git`/`safeGit` makes the manifest have one reader.

---

## M7 — the handoff hook fires on process commits, and blocked the first command of this audit

`.claude/hooks/task-handoff.sh:46-54` reports any moved HEAD whose commit has no `Task:` trailer
while some task is `active`. Reproduced without trying: the first `npm run audit-status` of this
pass returned

```
HEAD moved to 9adc928… while a task is active, but the commit has no Task: trailer.
active task: combat
```

`9adc928` is *"confirmed two tasks"* — a `tasks confirm` bookkeeping commit that touches two task
files and no code. `combat` has been `active` since `ec4bc17` and no commit in this window is
combat work.

The rule is as specified (`task-system.md:192`), and the specification is what is wrong. `tasks
check` permits **at most one** `active` task, so any commit that is not that task's work — a
confirmation, an audit record, a `systems.json` edit, a merge, a revert, the commit that lands
*this* document — is structurally unable to carry a satisfying trailer and will trip the hook. The
first rule (trailer present, task file missing) is precise and worth keeping; the second is a
category claim derived from a field that means "a task is open somewhere", not "this commit should
have been task work".

It exits 2 on `PostToolUse`, so it interrupts rather than blocks, and its state file makes it
fire once per HEAD. The cost is not the interruption, it is that the design's own thesis —
"a warning is knowledge, and this project has demonstrated it already has the knowledge and loses
it" (`task-system.md:562-569`) — applies to a forcing function that cries wolf on routine commits.
The narrow version is to fire only when the commit touches a path the active task's system owns,
which `systems.json` already answers.

---

## L1 — the multi-finding `audit:` shorthand the spec documents does not parse, and the code written to support it is unreachable

`task-system.md:132-134` specifies `audit: docs/audits/runtime-2026-07-30.md H1, M2`. Written into
a task file it yields `probe-shorthand: malformed audit reference 'M2'` from `tasks check`, and
`tasks show` prints the file's `H1, M2` two lines above a derived `audit: … H1` that has dropped
the second finding. `listValue` (`tasks.ts:120-126`) splits the frontmatter value on `,` before
either audit parser sees it, so the `currentDoc` carry-forward in `expandedAuditRefs:499-508` and
`auditRefErrors:517-526` — the mechanism whose only purpose is to let a bare `M2` inherit the
preceding doc — can never be reached in any input form. Two near-verbatim copies of one parse,
both dead in the same half. Loud rather than silent, so low: gate 8 reports the uncovered finding.

## L2 — `tasks active` is a public verb that no `usage()` line mentions

`tasks.ts:907-911` implements `active [--id-only]`, reachable and undocumented; `usage()` at
`862-882` lists nineteen invocations and not this one. It exists for `task-handoff.sh:46`, which is
a fine reason to have it and not a reason to hide it — the hook is a caller like any other, and a
verb absent from `--help` is a verb the next session re-implements.

## L3 — `tasks confirm` launders a gate-7 violation instead of refusing it

`confirmTask` (`tasks.ts:776-784`) requires only `status === 'done'`, then deletes `## Chunks`.
`tasks chunk add` has no status guard, so a `done` task can acquire an unchecked chunk — which
`checkStore:574` correctly fails on — and `tasks confirm` then makes the failure disappear by
removing the evidence. `doneTask` has the unchecked-chunk guard; `confirmTask`, which is the
irreversible one, has none.

## L4 — a task file with no `# Title` is silently given one

`parseSections:187-188` falls back to `'(untitled)'`, and the next writer verb serialises
`# (untitled)` into the file. Nothing in `checkStore` requires a title, so the fabricated heading
is the first durable record that the file was malformed. `tasks new` always writes one, so this is
only reachable by hand — but "reachable only by hand" is the case the store exists to make safe.

---

## Gate scorecard

| Gate | Catches | Lets through |
| --- | --- | --- |
| `audit-status` chunk budget | trailers in range, filtered to `done` tasks naming the system; per-system `warn`/`block` | **an unresolvable `lastAudit`, reported as 0 and OK (H1)**; the unit is trailer lines, not chunks (M1); 31 of 32 done tasks contribute nothing (M1) |
| `audit-status` doc gate + partition | unchanged this window; still real | pass-1 **L1** holes, open and lifted |
| `tasks check` gates 1–8 | all eight implemented; nine of thirteen branches verified by hand only | four branches asserted in tests (M2) |
| `tasks check` gate 8 | a finding with no task, a task naming a missing doc or absent finding — both directions | the `<doc> H1, M2` shorthand (L1) |
| `writeTask` | a duplicated `## section`, refused before writing, named | **everything above the `# Title`, deleted silently (M3)** |
| round-trip test | any non-empty line of any real task file that a re-serialise would lose | ordering, duplication, and pre-title loss only *after* the write |
| `task-handoff.sh` | a trailer whose task file is not in the commit | **fires on every trailer-less process commit (M7)** |
| `test.yml` | `tsc --noEmit`, 520 tests, `layer-check`, `tasks check`, `audit-status`; ubuntu + windows | `npm run build` (Build & deployment's surface); exit 0 under H1 |

---

## Budget attribution, for the note

All four in-window commits are this system's own work — the first window in this system's history
where that is true, against eleven of sixteen last pass reaching it only through `play-cli.ts`.
The budget reads 6 and the work is one task of eight chunks; **M1** is why those disagree.

`scripts/lib` is still declared whole and still double-charges the contribution system's
`modportalCache.ts` — pass-1 **L4**, open, and correctly recorded as open in the current note.
