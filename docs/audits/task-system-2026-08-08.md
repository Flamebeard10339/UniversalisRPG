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

