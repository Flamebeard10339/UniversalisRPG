# Task system — first whole-system sweep

Reviewed at `6895198` (`main`), 2026-08-08. Nine independent auditors over disjoint regions of
`scripts/tasks.ts`, `scripts/tasks/`, the eight task-workflow libs in `scripts/lib`, the two JSONL
stores, and the prose that governs them. Commissioned by the author's ruling of 2026-08-08, which
paused the task-system final push after phase 3.5.

Until this document, `docs/audits/systems.json` recorded `"lastAudit": null` for this system. Every
other system carries a SHA. This is the first sweep.

---

## 0. What this audit was told not to assume, and what the numbers say

The commissioning ruling names its own prior error: *"What the audit should NOT take as its premise:
that HIGHs are appearing faster than they close … The orchestrator reported 13 earlier from a grep
that counted wrapped output lines rather than records, and that wrong number is what the pause was
argued from."*

Counted directly from `docs/tasks.jsonl` at `6895198`:

| | count |
|---|---|
| live Task-system HIGH records | 8 |
| — of which `open task` (planned phase 4–6 work, not discoveries) | 4 |
| — of which `unreviewed finding` (actual discoveries) | 4 |
| live HIGH across all six other systems combined | 22 |

**The premise does not hold.** HIGH findings are not accumulating on this system faster than they
close, and half of what looks like a HIGH backlog is the plan for the work that was paused.

The real signal is different, and worse.

---

## 1. The measurement that reframes everything

| corpus | lines |
|---|---|
| `src/**` non-test — **the game** | 7,101 |
| `src/**` including tests | 15,473 |
| Task system non-test | **8,478** |
| Task system including tests | **19,728** |
| `docs/**` + `.planning/**` markdown — process prose | 27,953 |

The tool that manages the work is 19% larger than the work, in source, and 27% larger counting
tests. The prose about the process is larger than both.

Three corroborating counts:

- **Registered concepts.** Task system: 22. Every other system combined: 21.
  (DSL load path 6, Testing procedure 6, Contribution system 5, Runtime 4, UI 0, Build 0.)
- **Store share.** 254 of 792 records ever filed (32.1%) name the Task system; 54 of 171 live
  records (31.6%). A third of everything this project has ever tracked is the tracker.
- **Merge cadence.** 21 of the last 25 merge commits on `main` are task-system work.

The author's v3 notes ask for a counter that fires when a capability has needed 5+ rounds of work,
so it can be rethought instead of patched again. Applied to the task system as a whole, that
counter fired some time ago. §3 computes it per capability.

---

## 2. What the tool is for, and whether it delivers it

The system is not a failure and this audit does not read as one. Three things it does are load-bearing
and have no cheaper substitute:

- **Generated briefs.** `work-prompt` / `audit-prompt` / `plan-prompt` replaced hand-written ones
  after "three sessions proved instruction does not survive context pressure: agents told about
  `audit-prompt` still fabricated briefs." The delegation log attributes the second half's quality
  jump — workers refusing bad prescriptions, catching planner errors, disclosing scope corrections —
  to briefs that invite refusal, not to a better model.
- **The event log.** 2,247 events carrying who, when, branch, head and what changed. It is the only
  artifact in the repository that reliably answers "why is it like this", and it was cut once and
  reinstated when the measurement justifying the cut was shown wrong.
- **Audits themselves.** The delegation record's own arithmetic: a fix round cost ~1.07M subagent
  tokens and produced a branch that was still not mergeable; two audit rounds cost ~1.18M and
  produced the finding that the real defect was structural. *"The audits were the better spend."*

What the tool does **not** deliver is the thing it was widened to deliver on 2026-08-02: safe
parallel work. That is §4.

---

## 3. Recurrence — the counter, computed retrospectively

| capability | rounds | status |
|---|---|---|
| **Which spec does this branch own** (`resolveActiveSpec`, `authoredAsPlan`, `specToGrade`, `decideSpec`) | **6** | Deleted rather than patched a seventh time — and the branch that deleted it shipped a live deadlock (§4.2). |
| **The generated audit brief / mutation manifest** | **5** | "Fixed" by `brief-builds-the-manifest`; the newest failure mode (684-entry manifests) is quantitatively worse than the first (blank ones). |
| **Clause standing across audit passes** | **5** | Believed closed; a further independent copy of the "latest pass only" bug surfaced twice after the fix. |
| **Write-grant / dispatch-collision detection (`tasks plan`)** | **4, unresolved** | Never redesigned. The last round *avoided* it — three members serialised onto one branch rather than dispatched in parallel. |
| `scripts/tasks/mergeReady.ts` as a file | **6+ branches** | Not a capability — the single site every other recurring class lands on. |

The pattern the history makes precise: after `task-system-refactor` (2026-08-03) the tool stopped
being redesigned and started being re-patched in the same four places, and **each fix's own audit
found the next narrower bug in the same mechanism.**

The one move that has consistently worked here is **deletion**. Every retirement in the log follows
one shape — build a mechanism, discover under real multi-agent load that its premise does not hold
in this repository, and cut it rather than harden it: the merge gate, the deliverable freeze,
verdict-to-clause-hash binding, `spec amend`, `check`'s hard failures, the `--planning` flag that was
never built, the second mechanism proposed to cross-check the first spec inference, the worktree
repair machinery. The single reinstatement — the event log, cut on a bad `git log -S` measurement
and restored once redone — is the exception that shows the process self-corrects.

---

## 4. The diagnosis, corrected

The commissioning ruling names two structural failures. The first one is **not what it was thought
to be**, and the correction matters because it changes what to build.

### 4.1 `tasks plan` is not structurally blind. The record it read was false.

The ruling states: *"`tasks plan` graded the phase 3 set 'no overlap, no unstated dependency'
immediately before two of those branches collided in five shared files, because `plan` reads
forecast paths and cannot know what a fix will need."*

Reproduced against the three branches' actual common ancestor, `fbf475f`:

```
plan: 3 task(s), 3 with a write grant this check can read, 3 of those a commitment
no overlap, no unstated dependency, no duplicated interface.
```

All three Phase 3 grants were **`commitment`**, not `forecast`, at the planning commit `8c12842`.
The forecast/commitment softening — the mechanism the ruling blames — never engaged. `weigh` would
have returned `defect` for any overlap it saw. It saw none because none was declared:

| task | declared at dispatch | actually wrote |
|---|---|---|
| `dropped-and-failed-clauses-differ` | 4 files (`specDoc.ts`, `specCmds.ts`, + tests) | 20 — **10% recall** |
| `a-move-never-strands-a-question` | 4 files (`records.ts`, `triage.ts`, + tests) | — |

All five colliding files were among the 18 that `dropped-and-failed-clauses-differ` added *after*
dispatch. Re-run today against the corrected grants, the same command prints the collision exactly:
`[defect] … both write scripts/tasks/commands.ts, records.test.ts, records.ts, triage.test.ts,
triage.ts`.

**So `plan`'s predicates are correct and its inputs are not.** The real defects are three, and each
is small:

1. **`--grant commitment` is settable at `add`, on a record nobody has started.**
   `resolveGrant` (`scripts/tasks/records.ts:78`) honours the flag unconditionally and cannot tell
   `add` from `edit`. The one field whose entire job is to say "someone has read this region" is
   settable by the party it exists to distrust. All three Phase 3 records were born `commitment` at
   the planning commit.
2. **`plan` fires once, at the moment its input is least accurate** — before dispatch, when the
   grant is a planner's guess. Measured grant accuracy at that moment across this push is 10–50%.
   The corrected grant arrives *during* the run, and nothing re-grades it.
3. **Nothing ever compares a grant to the diff that was actually produced.** Verified directly:
   `task.grant` is read at exactly five non-test sites — `planCheck` (to soften its own report),
   `render` and `workPrompt` (to display it), `checkStore` (one warning about an empty grant), and
   `records.ts:97` (to print a reminder). Neither `tasks start`, nor `tasks done --commit`, nor
   `merge-ready` compares `writes` against the commit. The workflow asks a human to do this by hand:
   *"If the diff diverges from the grant, correct the record and say so in the commit body."*

That is the whole of the seven-out-of-seven story. It is not a check that cannot work. It is a
promise with no observation point, graded at the one moment nobody could have kept it.

### 4.2 "These two files must agree" — the data exists and the render discards it

The deadlock: `a8fd3e6` deleted the inference inside `resolveActiveSpec` and left
`auditPrompt.ts:568` still calling it. `merge-ready` blocked on a clause only `audit-prompt` could
clear; `audit-prompt` declared the diff foreign and refused to write the manifest.

`tsc` could not catch it and neither could a deleted-export detector: `resolveActiveSpec`'s
signature at `context.ts:219` is unchanged. Only the body narrowed. **The break is behavioural with
no type surface.**

But the repository already computes what would have shown it. `architecture.ts` walks every import
edge in the tree. Run today:

```
$ npm run tasks -- where scripts/tasks/context.ts
  imports across a system boundary:
    scripts/lib/git.ts (Testing procedure)
    scripts/lib/systems.ts (Testing procedure)
```

Fifteen files in the tree import `context.ts`. `tasks where` prints **none** of them, because
`regionView.importedBy` (`scripts/lib/architecture.ts:244`) filters callers down to *cross-system*
ones — and every file in the task system is in one system. The one query designed to answer "what
else touches this" is blind precisely inside a directory, which is the only place a same-directory
sibling caller can live.

The fix is to delete one filter clause and label cross-boundary callers instead of filtering to
them. The branch's own hand-survey of `resolveActiveSpec`'s seven callers *did* enumerate
`auditPrompt.ts` — and classified it "informational WARNING/no-op, never a write, never a pass
filer." That classification was wrong: the WARNING gated whether the manifest and pass file were
written at all. **The survey was done, by hand, correctly enumerated, and wrong in the direction of
harmless — and nothing checks a survey.**

### 4.3 The unifying shape: ten relations that must agree, one that is enforced

`CLAUDE.md` states the rule: *"Do not create systems that are required to be manually kept in
sync."* Every failure in this audit is an instance of breaking it.

| # | must agree | enforced by |
|---|---|---|
| 1 | `docs/workflow.md` ↔ the CLI's behaviour | nothing — the doc asserts a disagreement "is a defect in one of them" |
| 2 | a lesson's prose ↔ the command it names | nothing — `worker/file-findings` teaches `tasks add --kind finding` without `--fault`, which the command now refuses |
| 3 | `CLAUDE.md` ↔ its own tested source | nothing — **and it has already drifted** (§4.4) |
| 4 | a record's `system` ↔ the system owning its `writes` | nothing — the Phase-6 invisibility |
| 5 | a record's `writes` ↔ the diff it produced | nothing — §4.1 |
| 6 | a spec's `- [cN]` lines ↔ records' `clause`/`discharges` | reconciled at 2 of 9 call sites (§5.1) |
| 7 | `produces` forecasts ↔ registered `concepts` | nothing — **86 of 104 (83%) distinct claims never registered** |
| 8 | two source files that must agree | nothing — §4.2 |
| 9 | `AGENTS.md` ↔ the source tree | nothing — it still names `src/game/contentDsl/`, deleted |
| 10 | `docs/specs/*.md` ↔ the store | nothing, and it cannot shrink (§5.4) |

`npm run layer-check` is the counter-example that proves the point. It *is* a two-artifact
agreement check — imports against layer order — it is cheap, it runs in CI, it has never been the
subject of a finding, and nobody complains about it. The repository knows how to build these. It
has built exactly one.

### 4.4 The exhibit

`CLAUDE.md:26`, under "Wisdom that reduces audit issues":

> Enforce where a value is assembled, not where it is **written**

`scripts/tasks/briefLessons.ts:85`, the `planner/guard-placement` lesson printed live into every
planner's brief and pinned verbatim by `planPrompt.test.ts:106`:

> Enforce where a value is assembled, not where it is **read**.

The tested copy states the lesson. The hand-copied one in the repository's own governing document
is nearly a tautology — "assembled" and "written" are the same moment — and says nothing. One
sentence, two homes, no link, and the copy that governs every agent is the one that drifted.

---

## 6. The v3 requirements, assessed against measurement

The author's notes in `.planning/.scratch.md` list seven requirements for the next iteration. Each
is answered here against what this sweep measured, not against the design's own merits.

### 6.1 "Concurrent agents without corrupting the store" — **confirmed, and worse than stated**

Reproduced directly. Three concurrent `npm run tasks -- add` against one store:

```
records before: 792
records after:  793   (expected 795)
probes that survived in the STORE:  race-probe-gamma
probes recorded in the EVENT LOG:   3
```

All three commands printed `added …` and exited 0. **Two records were lost with no error**, and the
store and the event log now disagree permanently with nothing able to detect it.

`saveStore` (`scripts/lib/taskStore.ts:481-485`) is a bare `writeFileSync` of the whole file — no
lock, no temp-file-and-rename, no compare-and-swap, not even a re-read before write. A reader can
also observe a truncated file mid-write. `docs/workflow.md` states the hazard in prose — *"Filing is
the one step that cannot be concurrent"* — and nothing enforces it. Nine agents ran in this worktree
during this audit; the only reason nothing was lost is that they were told not to write.

**The author's instinct is right and the measurement supports it in an unexpected way: the event log
survived all three writes.** `appendFileSync` with three concurrent appenders kept every record; the
whole-file rewrite kept one. That is the strongest argument for the v3 direction, and it is
empirical rather than theoretical.

But **the redesign is not the first move**, for three reasons:

1. **The cheap fix closes the loss today.** An advisory lock (or write-temp-then-rename with a
   re-read-and-retry on mtime change) around `saveStore` is tens of lines and ends silent data loss
   in every scenario above. It should land regardless of what happens to the store's shape.
2. **The cross-branch half is already largely solved and was measured.**
   `the-task-store-survives-parallel-branches` sorted the store by id; verified here — 792 records,
   zero out-of-order positions, every record carrying `seq`. Two branches editing different records
   already merge clean. The residual is *adjacent-line* changes, which is a much smaller problem
   than "three unmergeable rewrites."
3. **`merge=union` on an editable store has already been tried and rejected here, with a written
   reason** (`.gitattributes`): it silently produced a duplicate record under one id, clean exit,
   green CI — *"worse than the conflict it was configured to avoid."*

Point 3 is where the per-field `t` clause earns its keep: under an append-only log with last-write-
wins per field, a duplicate append is not a duplicate record, it is two events resolved by
timestamp. So the design does answer the objection that killed union merge. **And it dissolves a
manual-sync relation rather than adding one** — if the store is a projection of the log, the two
cannot disagree by construction, which retires the whole of the open spec
`a-record-cannot-leave-the-store-unrecorded` (whose deliverable is a reconciliation between them).

The cost is the "grep still works" clause. A projection that is committed is a derived artifact in
the tree, which is only safe if the tool rewrites it on every write and never asks a human to.
That is achievable — `saveStore` already rewrites the whole file every time — but it must be the
rule, not a convention.

**Recommendation.** Lock the write now. Take the event-log store as a deliberate later branch, and
take it whole: append-only, `merge=union`, per-field last-write-wins on `t`, and a projection the
tool regenerates on every command that writes. Do not take it as a patch to the current store.

### 6.2 "A single way to log an issue, with dedupe before filing" — **confirmed; already specced**

There are **ten channels** for "something we learned":

| channel | size | machine-readable | dedupes |
|---|---|---|---|
| `docs/tasks.jsonl` | 792 records / 1.41 MB | yes | no |
| `docs/events.jsonl` | 2,247 events / 907 KB | yes | no |
| `.planning/agent-feedback/tool-friction.md` | 1,660 lines, 47 session entries | no | no |
| `.planning/agent-feedback/audit-tooling-friction.md` | 26 lines — a scaffold with zero entries | no | — |
| `docs/audits/*.md` | 10,492 lines over 35 files | no | no |
| `docs/audits/systems.json` `note` fields | 12,605 chars of embedded audit prose | half | no |
| `docs/specs/*.md` `## Decisions` | 58 of 60 spec files | no | no |
| `docs/dsl-rewrite/delegation-experiments.md` | 437 lines | no | no |
| `postmortem.md` + `backlog-process-review.md` | 357 lines | no | no |
| commit bodies | ~every commit | no | no |

Nothing dedupes anywhere. `tasks import`'s key is `${basename}-${code}` — it detects re-importing
*one document twice* and cannot see across two documents describing one defect. The three
independent pass-2 audits of `task-system-refactor` each filed the same task-id-resolution gap;
`-a-m3`, `-b-m3` and `-c-m3` are all still open today.

The open HIGH `one-query-over-the-channel-and-the-second-place-retired` already specifies exactly
this — one query over the channel, `tool-friction.md` deleted, `audit.ts` step 8 stops telling
auditors to write prose into a markdown file. It is phase 4 of the paused push. **It is the right
design and it should be resumed.**

### 6.3 "Durable, automatic process lessons" — **confirmed gap, partly specced**

Every lesson in `briefLessons.ts` is hand-authored into one of four `const` arrays. There is no
`tasks lesson add`, no route from a finding to a lesson, and no recurrence counter anywhere.
One of nineteen lessons already names a command whose flags have drifted (`worker/file-findings`
teaches `tasks add --kind finding`, which the command now refuses without `--fault`).

`docs/specs/a-lesson-is-folded-from-its-own-log.md` designs the fix — an append-only
`docs/lessons.jsonl` under `merge=union`, folded by a pure function into the arrays — and is
unstarted. Note its own Open Questions flag a three-way collision: two *other* specs
(`a-lesson-has-a-handle-that-survives-rewording-it`, built and unmerged on `claude/lesson-handle`,
and `a-lesson-can-be-retired-and-the-retirement-is-recorded`) also intend to write
`briefLessons.ts`. That needs a ruling before any of the three is dispatched.

**The half nothing addresses is the one the author named directly**: *"Me forgetting to tell them
about `npm run tasks -- *-prompt ...` can't be the failure mode."* Today lessons arrive only if the
dispatcher remembers to say "run `work-prompt <id>` and do what it says". There is no fallback for
an agent told "just fix X". That is a `CLAUDE.md` line, not a code change, and §7 proposes it.

### 6.4 "No infinitely appended markdown; dissolve finished specs" — **confirmed, and currently impossible**

34 of 59 spec files (58%) are fully historical. They cannot be deleted: `checkStore` requires every
closed record's non-null `spec` to name an existing file forever, because `departFromSpec` only
clears `spec` on departure and never on an ordinary close. Deleting the 34 today would strand
**336 closed records** as 336 `doctor` errors, 55 of which carry `--discharges` and would produce a
second error wave. And `spec remove` — the one command that could detach a record — refuses once
the file is gone, so it needs the file it is trying to remove. This is already filed as
`stranded-spec-members-have-no-repair`.

**A spec cannot currently retire.** That is why `docs/specs/` only grows, and it is a five-line fix
in the wrong direction from where anyone has been looking: let a closed record keep its spec *slug*
as history without requiring the file to exist.

### 6.5 & 6.6 "Claim the spec" and "multiple specs per branch" — **one fixed, one not**

Multiple specs per branch is genuinely fixed. `BranchStanding.specs` is a real collection; the
heuristics (`specToGrade`, `authoredAsPlan`, `specAddsClauseId`, `decideSpec`) are deleted.

"Claim spec" is **not** built. There is no `claim` verb. What replaced inference is `--spec`, a
branch-name match against a real file, and a CI-only derivation from the branch's own store diff.
That derivation is better evidence than the old guess — a changed task record *is* the branch's diff
— but it is still derived, and one caller still exits 0 with no usable answer on an ambiguous spec
(`cmdPlan`, `architectureCmds.ts:57-60`), deliberately, because making it refuse would redden CI on
every PR. The resulting clause sits open and high-severity on an already-merged spec.

The author's instinct ("most inference-based systems should just be simplified") is the one the
repository's own history most strongly supports: this capability took **six rounds**, and the only
round that held was the one that deleted rather than fixed.

### 6.7 "A counter that fires when a capability needs 5+ rounds" — **the highest-value item**

This is the requirement that would have prevented the other six, and §3 shows it can be computed
from data that already exists: the event log, the store's `produces`/`concepts`, and 47 sessions of
`tool-friction.md`. What is missing is not the data but a **handle** — a stable identity a
recurrence can be appended to.

The design is already written and correct. `a-recurrence-is-appended-and-filing-shows-what-already-claim`
(open, HIGH, phase 4) reasons it out in its own deliverable: *"Nothing is incremented anywhere: a
counter is a field concurrent branches edit by construction … the derivation of the count belongs to
the query."* That is exactly right, and it is the same conclusion the store-race reproduction in
§6.1 reaches from the other direction.

Two things this audit adds to it:

- **The counter should also count *capabilities*, not only frictions.** The Task system holds 22 of
  the repository's 43 registered concepts. Concept count per system, tracked over time, is the
  cheapest available proxy for "this system is growing faster than it is being used", and
  `audit-status` already computes it.
- **83% of `produces` claims never become concepts** (86 of 104 distinct names). Any recurrence
  query keyed on capability name will read a vocabulary that is mostly unregistered forecasts.
  Key it on **path**, not name — `producers.ts:91-95` already says so in its own comment, and
  `checkPlan` does not do it.

### 6.8 "No way to know whether any of this is easy for the agents"

This is the one requirement with no design behind it, and it is answerable more cheaply than the
others. Three measurements already exist and are not collected:

- **Grant drift.** `tasks done --commit <rev>` has both the grant and the diff in hand. Recording
  the delta per task gives a real distribution of how wrong a forecast is (this audit's sample:
  10–50% recall). That is §7's first recommendation and it doubles as the answer here.
- **Direct-edit rate.** How often an agent bypasses the CLI and edits `docs/tasks.jsonl` by hand is
  measurable from commits that change the store without a matching `docs/events.jsonl` change.
- **Refusals.** The refusal invitation demonstrably works — the delegation log records real,
  correct refusals at rows 39, 48a, 51, 53, 54, 57, and no case of a planner overriding one. That
  is the tool's single best-evidenced mechanism and it is worth protecting from any redesign.

