# Testing procedure — 2026-08-02, pass 3 (clause audit)

Branch `task-system-policy-seam`, diff range `91cd1ed..1ac51b0` (`main..HEAD`), as
reported by `npm run tasks -- audit-prompt task-system-policy-seam`. One of two
independent auditors; this one answers a single question — **does each proof
clause actually hold?** The branch was cut from `task-system-real-world-friction-spec`,
so the diff carries that branch's work too; the spec's `## Carried forward`
section names what was inherited deliberately and I treated those items as
in-scope for correctness but not for scope drift.

The spec records 12 clauses and zero audit passes. Every clause read `unknown`
going in.

## Method

Where a clause was mechanically checkable I broke the behaviour it promises and
checked that something failed. Thirteen mutations were applied one at a time to
a backed-up working tree, each followed by a targeted `vitest run` and an
immediate restore. `git status --porcelain` is clean on tracked files at the end
of this audit and `npm test` was re-run green afterwards to prove the restore.
No source file was changed by this audit.

Behavioural probes were run against scratch stores under the session scratchpad,
never against `docs/tasks.jsonl` or `docs/events.jsonl`.

### Mutation results

| # | clause | mutation | result |
|---|---|---|---|
| M1 | c1 | `show` refuses an unknown id instead of answering with near matches | **caught** (3 tests) |
| M2 | c1 | reads go strict on an unparseable store line | **caught** (2 tests) |
| M4 | c2 | `transition` still moves the record but reports nothing it displaced | **caught** (6 tests) |
| M5 | c2 | closing an undelivered clause task prints no clause standing | **caught** (4 tests) |
| M6 | c3 | an ungraded clause defaults to `unmet` instead of `unknown` | **caught** (13 tests) |
| M7 | c4 | `doctor` also exits 1 when the scan finds an error | **caught** (6 tests) |
| M9 | c9 | an unrecognised flag is dropped instead of erroring | **caught** (3 tests) |
| M10 | c11 | `doctor --fix` writes the store and appends no event | **SURVIVED** |
| M10b | c11 | `triage` (both write sites) and `import` append no event | **SURVIVED** |
| M10c | c11 | `decline` and `spec done --defer-open` append no event | **SURVIVED** |
| M12 | c12 | `log` joins events to present-day store state | **caught** (1 test) |
| M13 | c1 | a contested spec returns null with no note, as before | **caught** (1 test) |

### Required commands

All four pass. Wall clock, this machine, warm `node_modules`:

| command | wall clock | result |
|---|---|---|
| `npm test` | **54.3 s** (vitest reported 52.98 s) — second run 48.5 s | 43 files / **899 tests**, green |
| `npx tsc --noEmit` | **3.6 s** | clean |
| `npm run layer-check` | **1.0 s** | 468 imports across 5 layers, all downward |
| `npm run tasks -- doctor` | **1.9 s** | 280 tasks, 0 errors, 0 warnings, 0 unparseable lines, exit 0 |
| `npm run audit-status` (also a PR gate) | **11.0 s** | partition holds |

Every gate is an order of magnitude inside CLAUDE.md's five-minute budget. This
records the measurement `c4` and U8 require; the store finding
`task-system-real-world-friction-spec-pass1-the-wall-clock-me` can close against
this table.

---

# Findings

## CL-H1 — an extra positional argument is understood and then silently discarded, and it has already written a wrong record into the shipped log

`scripts/tasks.ts:88-113` (`parseArgs`), every command body.

`parseArgs` collects every non-flag token into `parsed.positional`. Command
bodies then read `positional[0]` (and, for `spec add`/`spec remove`,
`positional.slice(1)`). Everything else is dropped with no message and exit 0.
Reproduced live against a scratch store:

```
tasks show alpha beta gamma          → answers about alpha only, exit 0
tasks add "title one" "title two"    → adds "title one", exit 0
tasks note "first note" "second"     → records "first note", exit 0
tasks decision "a" "and a dropped b" → records "a", exit 0
tasks doctor extraneous              → runs the scan, exit 0
```

This is the branch's own filed finding
(`an-extra-positional-argument-is-silently-discarded-which-is-`, commit
`1ac51b0`). Two things the filing does not carry, which change how it should be
weighted:

**It has already corrupted `docs/events.jsonl`.** Line 11 of the shipped log:

```json
{"op":"note","id":null,"system":null,"spec":null,
 "note":"task-system-real-world-friction-spec-pass1-the-start-done-li"}
```

The note text is a task id and `id` is null — the shape produced when the id is
passed positionally and the real note lands in a slot nothing reads. Whatever
was typed, the tool recorded a useless event, filed it against no task, and said
nothing. This is in the log the branch shipped specifically to make record
history answerable, and it is the third of thirteen lines in it.

**The worst case is in `add`, not in `note`.** An unquoted title —
`tasks add fix the thing` — records a task titled `fix` and discards `the thing`,
exit 0, with the id slugified from the truncated title. That is silent data loss
in the primary write verb, reachable by the most natural typo an agent makes.

The fix is one line at the parser boundary where `c9`'s other half already
lives: each command's usage string states its positional arity, and a count past
it is an error naming the extras — the same shape as `unknown flag: --x`.

**Bearing on `c9`:** the clause's headline sentence is *"No command answers a
question it did not understand, and none silently discards one it did."* An
extra positional is a question the parser understood — it parsed it, named it,
and put it in a list — and then discarded it. The four enumerated conjuncts
(unknown flag names, flag values, `--help`, one printer) are all met; the
sentence they elaborate is not. For an absolute clause, one falsifying case
settles it. **`c9` reads `unmet`.** The clause and the finding cannot coexist as
written; they could coexist if `c9` were rewritten to scope itself to flags,
which would be a spec amendment and is the human's call, not mine.

## CL-M1 — two read commands still refuse, and the branch already decided they should not

`scripts/tasks.ts:419-424` (`refuseUnknownSpec`), called from `cmdSpecShow:1140`
and `cmdAuditPrompt:1377`; `scripts/tasks.ts:1344-1356` (`resolveDiffRange`).

Commit `a163a58` states the rule explicitly: *"The two exit codes stay split on
the read/write line, which is `c1` against `c2`: `show` prints the near matches
on stdout and exits 0, because 'no such task, here are the five nearest' is an
answer to what was asked."* `reportUnknownIds` carries that comment at
`tasks.ts:390-392`.

That rule was applied to task ids and not to spec slugs. `refuseUnknownSpec` is a
single function called from two reads (`spec show`, `audit-prompt`) and four
writes (`spec add`, `spec remove`, `spec done`, `audit`), and it sets
`process.exitCode = 1` unconditionally. Measured:

```
tasks show nosuchthing        → prints "no such task" + near matches, EXIT 0
tasks spec show nosuchspec    → prints "no such spec" + the specs that exist, EXIT 1
tasks audit-prompt nosuchspec → same text, EXIT 1
```

Both spec reads do exactly what `c1` asks — they answer, and they name what they
could not determine — and then exit non-zero anyway. The answer is already
written; only the exit code disagrees with it.

Second site, same clause: `audit-prompt --base-branch <bad>` exits 1 on an
unresolvable merge-base, while `handoff --base-branch <bad>` answers the
identical condition at exit 0. Measured both. That asymmetry is evidence the
refusal is avoidable rather than intrinsic.

**`c1` reads `unmet`,** narrowly. The bulk of the clause is strongly proven — M1,
M2, M13 all caught, a dependency cycle is returned as the answer by both `next`
and `doctor`, and the store-tolerance footer is real — but the clause is an
absolute and two read commands break it.

## CL-M2 — six of fifteen event-write sites are unproven, and `decline` is one of them

`scripts/tasks.ts:474` (`doctor-fix`), `:1567` and `:1574` (`triage`), `:1332`
(`import`), `:1060` (`decline`), `:1213` (`spec-defer`).

Every `saveStoreAndWarn` call is paired with a `recordEvents` call — I checked all
fourteen — so `c11` is **true in the implementation**, and I confirmed it by
hand: declining a real undelivered clause task in a scratch store appends the
`decline` event.

Nothing proves it. Deleting the event append from `doctor --fix` leaves the whole
suite green (M10). Deleting it from both `triage` sites and from `import` leaves
the suite green (M10b). Deleting it from `decline` and from
`spec done --defer-open` leaves the suite green (M10c). The event-log describe
block at `scripts/tasks.test.ts:2650-2750` enumerates `add`, `edit`, `start`,
`stop`, `done`, `spec-add`, `spec-remove`, `audit`, `note` and `decision`, and
stops there.

`decline` is the one that matters most. `c5` makes abandonment first-class *"any
record closes with a stated reason"*, and the spec's own argument for reinstating
the log is that *"a decision, an amendment reason, or an abandonment"* is not
primarily a diff and cannot be recovered from git. The abandonment event is the
clause's showcase and it is the one with no test.

The clause's wording is *"Every write to the store appends one line"* — a
universal over a set that will grow. A universal enforced by fifteen hand-paired
call sites and proven for nine of them will be false the first time someone adds
a sixteenth. The cheap structural fix is a single test that drives every write
verb once and asserts the event count equals the write count; that is one test
instead of six.

**`c11` reads `met`** — the behaviour is verifiably correct today — with this
filed as the proof gap. I am deliberately not grading it `unmet`: I observed the
writes appending, and grading a true clause false would be the same error in the
other direction.

## CL-M3 — three semantic write refusals survive

`c2` allows exactly one refusal: malformed input.

**`scripts/tasks.ts:505-514` (`resolveCommit`), the clearest one.**
`tasks done <id> --commit <sha>` refuses a sha that git resolves but that is not
an ancestor of HEAD:

```ts
if (!git.isAncestor(sha, 'HEAD')) throw new Error(`--commit is not reachable from HEAD: ${value}`);
```

A resolvable 40-char sha is well-formed. Refusing it is a semantic disagreement
about which commit the caller meant. The tool already holds the ledger-shaped
answer for exactly this condition: `closedCommitIssues` at `tasks.ts:520-527`
reports *"closed by a commit not reachable from HEAD"* as a `doctor` **warning**
at exit 0. So the same fact is a report in one command and a refusal in another,
and the refusal is the one on the write path. `scripts/tasks.test.ts:978` pins
the refusal in place.

**`scripts/tasks.ts:1750-1760` (`cmdAudit`), two more.** `audit` refuses when the
spec's `## Deliverable` has no `Proof:` clauses, and when a clause id is
duplicated. Both are the state of the spec *document* disagreeing with the write,
not malformed CLI input. The duplicate-clause case is provably reportable rather
than refusable: `specIssues` at `tasks.ts:426-436` reports the identical
condition as a `doctor` issue at exit 0. Again the same condition, two
polarities, refusal on the write path.

**`c2` reads `unmet`.** Everything the spec names under `c2` does work — I
verified live that a task closes with criteria outstanding, a held task is taken
over, a superseded spec's undelivered clause declines, a declined record reopens,
`--requires` accepts an id that does not exist yet, and `spec add` accepts a
pass-2 finding — and M4 and M5 confirm the "record shows what happened" half is
genuinely asserted. But the clause is stated as an absolute and three semantic
refusals remain.

## CL-M4 — four refusals are derived from git

`c8`: *"No recorded fact and no refusal is derived from git."*

- `scripts/tasks.ts:509` — `git rev-parse --verify` failure refuses `done --commit`
- `scripts/tasks.ts:511` — `git merge-base --is-ancestor` failure refuses `done --commit` (also CL-M3)
- `scripts/tasks.ts:1346-1354` (`resolveDiffRange`) — unresolvable merge-base or HEAD refuses `audit-prompt` (also CL-M1)
- `scripts/tasks.ts:1803-1812` — unresolvable merge-base or HEAD refuses `audit`

The disclosure half of `c8` is solid and mutation-proven: `resolveActiveSpec`
notes every inferred route, names the spec file the branch-name match found,
names why the branch-name route missed, and reports a contested spec with both
slugs and `--spec` as the way to settle it (M13 caught the regression to
silence). No recorded fact in `docs/tasks.jsonl` is git-derived; `show`'s derived
closing commit is labelled `(derived)` and is not stored.

**`c8` reads `unmet`** on the refusal half.

One tension worth the human's attention rather than a fix: `recordEvents` writes
`branch` into every event from `git rev-parse --abbrev-ref HEAD`. That is a
recorded fact derived from git and it is not a sha, so `c8`'s permission ("git is
referenced as evidence by sha") does not cover it — but `c11` explicitly requires
the branch in the event. The two clauses disagree; `c11` is later and more
specific, so I read `c11` as governing and `c8`'s wording as slightly too broad.

## CL-M5 — `merge=union` on the state file creates a silent divergence nothing enforces or repairs

`.gitattributes:12`, `scripts/tasks.ts:459-500` (`cmdDoctor`).

The spec justifies union merge for an append-only log — *"union is exactly right
for an append-only log"* — and then applies it to `docs/tasks.jsonl`, which is
not append-only. It names the failure mode and says it is *"caught by the `doctor`
scan `c4` requires anyway."* Measured what "caught" means:

```
doctor           → "[error] duplicate id: dupe" … "2 task(s), 1 error(s)"  EXIT 0
edit dupe --title edited → edits the FIRST copy, exit 0; second copy untouched
doctor --fix     → same report, no repair                                  EXIT 0
```

So after a union merge of two branches that edited one record: both versions
persist; every read answers from the first and never mentions the second; every
write rewrites the first and preserves the second verbatim; `doctor` reports it
at exit 0 so CI stays green; and `--fix` will not touch it because `c4` restricts
repair to the one issue with a single correct answer. The acceptance test at
`scripts/tasks.test.ts:2938` asserts precisely this (`expect(doctor.status).toBe(0)`),
so the behaviour is designed, not broken.

That is coherent with the ledger polarity, and it is still a data risk the spec's
prose understates. A duplicate id is not a disagreement about the work — it is
two records claiming one identity, and the tool's answer to "what is the state of
X" becomes file-order-dependent and stays that way indefinitely. Union merge on
the log is right. On the store it buys away a conflict a human would have
adjudicated in ten seconds and replaces it with a divergence nobody is told
about again.

Worth considering: leave `merge=union` on `docs/events.jsonl` and take it off
`docs/tasks.jsonl`. The spec's own measurement already established that
different-record edits merge cleanly and a single record edit is a one-line
diff — so the only thing union buys on the store is the concurrent-append case,
which is `tasks add` on two branches, which is exactly the case where a human
should see both.

## CL-M6 — three more findings the branch's own commits closed are still open in the store

Commit `9cdd7fd` names the pattern — *"work lands, the record that asked for it is
not touched, and the next planner reads an open finding as outstanding work…
Fourth stale finding on this branch"* — and says the event log *"is the mechanism
that was missing every previous time."* It is not, because nothing reconciles a
commit to a record. Three more, verified against the tree:

**`blocked-forever-on-declined-requirement` — `finding/unreviewed/high`, a member
of this spec.** Commit `621fbe4` says in its body *"Closes
blocked-forever-on-declined-requirement (high)."* Verified: a declined
requirement grades `declined` and does not block, `show` prints the grade per
edge, `next` explains the four causes of an empty queue, and the coverage gap the
record names (`taskStore.test.ts:196`, only `open` and `done` exercised) is closed
at `scripts/lib/taskStore.test.ts:322-351` and `:353-366`, which now cover
`unreviewed`/`open`/`in-progress`/`done`/`declined`/missing. A **high-severity
finding on the active spec** that the next `tasks next` will read as outstanding.

**`reopen-has-no-route` — `finding/unreviewed/medium`.** Commit `0fb81ab` names it
by id as the subject of the removed `start` guard. Verified live:

```
tasks start x   → started x
                  reopened a declined record (closed 2026-08-02), keeping its declined reason: predicted moot
```

**`ci-runs-gates-the-spec-forbids` — `finding/unreviewed/medium`.** Its remaining
evidence reads *".github/workflows/test.yml:39 still runs `npm run tasks -- check`
on both legs of every push and pull request, and it still exits 1."* False as of
`fbe1b90` + `4d0e892`: the workflow runs `npm run tasks -- doctor` on the ubuntu
leg only, and `doctor` exits 1 on one condition. The decision the record asked
for was made and recorded — in the workflow comment and in `CLAUDE.md:39` — but
its own record was never touched.

These are the fifth, sixth and seventh instances on one branch. The mechanism
that would actually stop it is a reconciliation read, not a log: something that
takes a commit range and lists records whose closing evidence is now stale. That
is a real gap and it is not any of the twelve clauses.

## CL-L1 — four comments describe machinery this branch deleted, which is the class U6 was chartered to close

U6's brief: *"Close C-H4: remove the comment lines CLAUDE.md's policy forbids by
name, starting with the one that is factually wrong."* Four survive:

- `scripts/tasks.ts:701-702` — *"too slow to run from `check`, which runs on every push"*. `check` does not exist; the CI step is `doctor` and it runs on one leg.
- `scripts/tasks.ts:2234-2235` — *"check's own `path:line` diagnostic, non-zero exit … not only `check`"*. Same deleted command, twice.
- `scripts/tasks.ts:739` — *"`next` refuses outside an active spec"*. `next` no longer refuses; U3 made it answer, and I measured it printing `no active spec for this branch` at exit 0. The comment asserts the exact behaviour `c1` forbids.

CLAUDE.md: *"Never describe another module's contract. That comment drifts the
moment its owner changes."* These drifted with their owner inside this same
branch. The first three lose nothing on deletion; the third is actively
misleading to the next reader of `runList`.

## CL-L2 — `triage` renders a task in a fifth bespoke format, and omits its id

`scripts/tasks.ts:1517-1526`.

`c9`: *"one printer renders a task everywhere it appears."* `renderTask` genuinely
is that printer for `list`, `search`, `next`, `show`, `spec show` and `handoff` —
`scripts/tasks.test.ts:1578` proves `BLOCKED` appears in every one of those views,
which is the assertion U6 was aiming at. `triage` is not among them:

```ts
console.log(`[${i + 1}/${total}]  ${severityTag}  ${task.system ?? '(no system)'}   ${task.title}`);
```

Severity collapses to a single uppercase letter, `kind`/`state` are gone, and the
**id is not printed at all** — so a human triaging cannot copy an id out of the
pane to `tasks show` it. `renderTask(task, byId, 'brief')` already prints
everything this pane wants plus the id. U6's brief named `list`, `spec show` and
`next` and `triage` was not swept in; the clause says "everywhere".

## CL-L3 — `resolveConfig` bypasses the git seam and stack-traces outside a repo

`scripts/tasks.ts:131`:

```ts
branch: flags.branch ?? execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(),
```

`scripts/lib/git.ts` exists on this branch as the seam whose contract is *"Every
function here is quiet and nullable … returns null/false instead of throwing or
leaking git's stderr."* `resolveConfig` runs before every command body, uses raw
`execFileSync`, and has no `try`. Outside a git repo, every command — including
every read — dies with a raw Node stack trace and git's stderr:

```
fatal: not a git repository (or any of the parent directories): .git
Node.js v24.15.0
```

Carried forward promises *"the store error boundary — store-reading commands
report `path:line` instead of stack-tracing"*; this is the same failure shape one
layer out, and the seam that would fix it is thirty lines away. Eight raw
`spawnSync('git'`/`execFileSync('git'` sites remain in `tasks.ts` beside a
four-function seam (lines 131, 181, 198, 509, 685, 704, 1361, 1939). The open
finding `pass2-c-m5` — *"the git seam was created but the duplication it was meant
to end survived and grew"* — is correctly open; this adds the crash to its
evidence. Pre-existing on `main` at the same line, but the seam is new on this
branch, so the reuse miss is this branch's.

## CL-L4 — the `--help` coverage test omits `audit`

`scripts/tasks.test.ts:263` enumerates 25 commands and subcommands and asserts
`--help` answers on each. `audit` is not in the list. It works — I ran
`tasks audit --help` and got the usage plus globals at exit 0 — but `c9`'s
`--help` conjunct is unproven for the one command with a hand-rolled argument
parser (`parseAuditArgs` over `args.raw`), which is precisely where it is most
likely to break.

---

# Clause verdicts

| clause | verdict | basis |
|---|---|---|
| **c1** — reads always answer | **unmet** | CL-M1. `spec show` and `audit-prompt` exit 1 on an unknown slug after printing the answer; `audit-prompt` exits 1 on an unresolvable merge-base where `handoff` answers. Everything else holds and is mutation-proven (M1, M2, M13); the tolerance footer and the cycle-as-answer are real. |
| **c2** — writes refuse only malformed input | **unmet** | CL-M3. Three semantic refusals survive (`done --commit` ancestry, `audit` on a clause-less deliverable, `audit` on a duplicate clause id), two of which `doctor` already reports at exit 0. All fourteen named guard removals verified working, and M4/M5 prove the "record shows what happened" half is asserted, not assumed. |
| **c3** — `unknown` and `unmet` never collapse | **met** | M6 caught by 13 tests across `tasks.test.ts` and `specDoc.test.ts`. `clauseStandings` defaults to `unknown`; `outstandingSummary` names each outstanding clause with its own status; no percentage, ratio or single bit anywhere; `met` requires evidence on both the flag and interactive routes. |
| **c4** — `doctor` scans, and exactly one condition exits non-zero | **met** | M7 caught by 6 tests. Probed exit 0 on cycles, duplicate ids, cold claims, working-tree-only closes, a missing systems manifest and a missing store; exit 1 only on an unparseable line, plus malformed CLI flags which `c2`/`c9` permit. CI runs `doctor` alone; `check`/`check --merge` deleted; `CLAUDE.md:39` corrected. Timings recorded above. |
| **c5** — abandonment is a first-class write, no new verb | **met** | Verified end to end on a real `audit`-created undelivered task in a scratch store: `decline --reason` closes it, stores the reason, prints *"declining it abandons the clause, it does not discharge it"*, and appends a `decline` event. No `drop` verb exists in the dispatch table. |
| **c6** — a claim says who and when; cold is reported, never released | **met** | `claimed`/`claimedBy` on the record; `COLD_CLAIM_DAYS = 3` a constant, not configuration; `claimSummary` appends *"COLD — past the 3-day threshold, never auto-released"*. Auto-release is structurally impossible from `next`, which never saves. Twelve tests at `tasks.test.ts:645-805` cover actor recorded, unnamed actor, takeover, release on close, and cold in `next`/`list`/`show`/`doctor`/`handoff` including `doctor` declining to repair it. |
| **c7** — a decision needing a human is a record the tool returns | **met** | `question` is a fourth `kind`, reachable through the existing `add`/`list`/`show` with no new command, file or record shape. Live example present in the store: `spec-amend-survives`, *"Does `spec amend` survive?"*, now `declined` — the question the spec itself named, asked and answered as a record. |
| **c8** — no recorded fact and no refusal derived from git | **unmet** | CL-M4. Four git-derived refusal sites. The inference half is met and mutation-proven (M13): every inferred spec route discloses itself and its source, and a contested spec names both sides. |
| **c9** — nothing answered unheard, nothing understood and dropped | **unmet** | CL-H1. Extra positionals are parsed and discarded silently by every command, including `add`, and the hole has already written a wrong record into `docs/events.jsonl`. The four enumerated conjuncts are met — M9 caught the flag half; bare-value refusal, `--help` on 25 surfaces and the one printer are all tested (CL-L2 and CL-L4 are partial misses on the last two). |
| **c10** — these are gone, not guarded | **met** | `git grep` over tracked files outside `docs/audits/` finds no `mergeGate`, freeze, baseline, proof-target execution, clause-text hash, `spec amend`, `parseAmendments`, `renderAmendment`, `appendAmendment`, `Amendment` or `## Amendments`. `mergeGate.ts` (-74) and `mergeGate.test.ts` (-165) deleted; both CI steps removed; the three spec files stripped (-42/-31/-25). Only hits are prose in `.planning/`, this spec, and one event note. |
| **c11** — every store write appends one event, snapshot not join | **met** | All fourteen `saveStoreAndWarn` sites are paired with `recordEvents`; `appendEvents` never reads the file. Snapshot proven by M12 and by the re-point test at `tasks.test.ts:2717`. An event naming a system with no task is proven and live. **Filed CL-M2:** six of the fifteen sites are unproven — M10/M10b/M10c all survived — including `decline`, the clause's own showcase. |
| **c12** — the log is searchable in one command, answered from the log alone | **met** | The acceptance test at `scripts/tasks.test.ts:2868` genuinely beats both git searches and is not a tautology: in a real fixture repo it runs `git log -S` and `git log -G` and compares their counts to `tasks log`. `-S` finds **1** of 5 edits to `policy-seam-u5`; `tasks log --id` finds **5** and asserts the exact op sequence `['add','edit','edit','start','done']`. After a synthetic serializer rewrite of all lines, `-G` on an unrelated record finds **>1** while `tasks log --id` finds exactly **1**. M12 confirms the join is fatal to it. `--id`, `--system`, `--spec`, `--op` and free text are each one invocation and compose. |

**Summary: 8 met, 4 unmet (c1, c2, c8, c9), 0 unknown.**

All four `unmet` verdicts are narrow. Each is a small number of surviving sites
inside a clause whose substance is otherwise implemented and, in most cases,
mutation-proven. I graded them `unmet` rather than "met with exceptions" because
all four clauses are stated as absolutes, and softening an absolute is how the
four weak proofs on the previous branch got their green.

---

# Things that do not fit either

**Nothing was weakened in CI, types, lint or coverage; two things were
strengthened.** `tsconfig.json` gained `noUnusedLocals` and `noUnusedParameters`
(and `src/runtime/runtime.test.ts` lost an unused import as a consequence).
`CLAUDE.md:39` now documents CI correctly for the first time — the old line
omitted both `tasks` steps and had been wrong independently of this branch. The
CI change is a genuine reduction in coverage — `check` ran on both matrix legs on
every push, `doctor` runs on one — but it is named in the commit message, in the
workflow comment, and in `CLAUDE.md`, which is what U2's acceptance asked for.

**The commit contract dropped the mandatory `Next:` trailer**
(`scripts/lib/commitContract.ts:40-42`). This is a real relaxation of a gate, and
it is declared: the spec's `## Carried forward` lists *"the commit contract:
mandatory body, optional `Next:`, repo-local `tsx`"*. Inherited from the
superseded branch, not scope drift.

**The `c11`/`c12` reinstatement is sound, and the invalid measurement is
correctly preserved.** I checked the specific claim the reversal rests on. The
`### The event log, and the measurement that wrongly cut it` section states the
error, states why `-S` was answering a different question, states why `-G` is not
the repair, and keeps the numbers. The acceptance test reproduces both failure
modes mechanically rather than asserting the conclusion. This is the strongest
piece of work on the branch and the section that would have been quietly rewritten
on a worse one.

**No architecture-boundary violation, no duplicated domain concept, and no test
that repeats the implementation's assumptions** that I found. `layer-check`
passes over 468 imports. The one duplication worth naming is the eight raw git
call sites beside `git.ts` (CL-L3), already tracked as `pass2-c-m5`. The
event-log module is a clean new concept with its own tests and no overlap with
the store.

**Rollback risk is low and asymmetric.** Reverting the branch restores the merge
gate, so any record closed under `c2`'s relaxed writes would become
un-reclosable — the `reopen-has-no-route` condition, in reverse. The event log is
purely additive and reverting it loses only `docs/events.jsonl`. The one
irreversible artefact is `.gitattributes`' `merge=union` on the store: a
divergence it lets through (CL-M5) is not detectable after the fact from the
merge commit alone.

**What I could not establish.** I did not attempt to verify `c12`'s "about this
topic" against a large log — the shipped log is thirteen lines, so free-text
search has never been exercised at a scale where its field selection
(`id`/`system`/`spec`/`op`/`by`/`note`, deliberately excluding `head`, `branch`
and `t`) would be tested. Not graded as a gap; noted so the next pass knows it is
untested at scale rather than proven.

**One line for whoever plans next.** The single highest-value change on this
list is not any of the twelve clauses: it is a reconciliation read that takes a
commit range and reports records whose evidence the tree has since falsified.
Seven stale findings on one branch, one of them high-severity and sitting on the
active spec, is not a discipline problem — it is a missing report, and the
branch has already built every piece it would need.
