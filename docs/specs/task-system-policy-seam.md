# task-system-policy-seam

The slug is historical. This spec no longer builds a policy seam — it deletes
most of what the seam was going to organise. The name is kept because renaming
a spec means re-pointing 38 member records through a tool that handles exactly
that operation badly, which is a fair illustration of the problem being fixed.

## Deliverable

The task system stops behaving like a gate and starts behaving like a ledger.

A gate refuses. It assumes an adversary, it is binary, and it fails closed. A
ledger records and reports: it holds partial information, it degrades, and it
says how much it knows. Every agent using this store is cooperative, so the
premise that justified a gate was never true here — and the machinery built on
that premise is what has generated findings for three branches running.

The observable change is a polarity flip. **Reads always answer.** **Writes
refuse only malformed input, never a semantic disagreement.** The consistency
scan survives and stops blocking: it repairs what it can and reports the rest.

Proof:

- [c1] No read command exits non-zero because the record is inconsistent,
  incomplete or ambiguous. It answers, and names what it could not determine.
  Contested state is reported with its sources, never resolved by refusing.
- [c2] No write is refused for a semantic reason; malformed input is the only
  refusal. A task closes with criteria outstanding, a held task can be claimed
  by someone else, and a superseded spec's undelivered clauses can be dropped —
  each recorded, none blocked.
- [c3] `unknown` and `unmet` are distinct states and are never collapsed. A
  criterion nobody checked reads `unknown`; completeness is reported as which
  criteria are outstanding, never as a percentage and never as one bit.
- [c4] `doctor` runs the scan `check` ran and repairs or reports what it finds.
  Exactly one condition may exit non-zero: a store that will not parse, which is
  malformed input under `c2`. No semantic disagreement — a criterion
  outstanding, a mark uncommitted, a spec without a baseline — can fail a build.
- [c5] Abandonment is a first-class write: any record closes with a stated
  reason, including a superseded spec's undelivered clause tasks. **No new verb
  — `decline --reason` already does this**, because `c2` removed the guards that
  were the whole obstacle. The clause originally specified `drop --because`; a
  synonym for a working command is exactly the bloat this branch exists to
  reverse.
- [c6] A claim records who holds it and when. A claim with no activity past a
  threshold is reported cold; nothing is ever auto-released.
- [c7] A decision that needs a human is a record the tool can return, not a
  paragraph of prose in a spec document.
- [c8] No *recorded fact* and no *refusal* is derived from git. Every fact in
  the store was asserted by an agent that intended it, and git is referenced as
  evidence by sha. Inferring a **default argument** — which spec a read command
  should assume — is permitted and is not state, provided the output says the
  inference happened and what it was drawn from.
- [c9] No command answers a question it did not understand, and none silently
  discards one it did. An unrecognised flag is an error naming the flag; a
  recognised flag either takes effect or is refused, never accepted and dropped;
  `--help` works on every command and subcommand; and one printer renders a task
  everywhere it appears.
- [c10] These are gone, not guarded: proof-target execution as a gate, the
  deliverable freeze and its baselines, verdicts bound to clause-text hashes,
  the merge gate's refusals, and `spec amend` with its `## Amendments` sections —
  an amendment is an event, not a second copy of the deliverable.
- [c11] Every write to the store appends one line to an append-only event log,
  naming the record, the system and spec it carried **at that moment**, the
  branch, the head sha, and a one-line note. Events are never rewritten and
  never deleted. A decision, an amendment reason, or an abandonment is the same
  kind of record as a state change, and an event may name a system with no task.
- [c12] The log is searchable in one command. "What decisions were made about
  this task", "about this system", "about this spec", and "about this topic" are
  each a single invocation, and each answers from the log alone — not by joining
  to present-day state, which would rewrite history every time a record is
  re-pointed.

## Why this replaces the nine-unit refactor

The previous plan reorganised the gate's rules into a policy module. That gives
a cleaner gate. It does not give a ledger, and the work would have been thrown
away by this change — which
`.planning/agent-swarm-theory.md` names as worse than doing nothing, because it
also adds risk.

Three independent sources reached the same conclusion from different
directions, none having seen the others:

- A from-scratch design, given the problem and forbidden from reading any of
  our code or notes, opened with "reads never fail; writes fail only on
  malformed input, never on disagreement", and named our exact trap: a gate that
  fails a PR when the record disagrees with the diff is "red by default, so it
  gets bypassed by default — and a gate that certifies its own bypass is
  strictly worse than no gate."
- `tl` (alexander.holbreich.org/posts/2026/tl-task-ledger) ships this problem
  as files in a repo, and **does not enforce acceptance criteria** — completion
  is human judgement, deliberately loose.
- `taskledger` (pypi.org/project/taskledger) carries plans-with-acceptance-
  criteria and reviews-as-evidence, and still gates nothing; even its `guided`
  mode "does not add lifecycle gates, it adds worker-step hints."

Two shipped systems built for precisely this problem, plus a clean-room design,
all declined to machine-verify completion, and all leave the human's review as
the approval mechanism. CLAUDE.md already says audits are the one gate that has
repeatedly caught real defects. Mutation-testing discipline is a practice, not
a feature of this tool.

### What the deletions actually retire

I first claimed six of the eight uncovered findings dissolve here. Walked
record by record against the archives, **two do**. The corrected table is below;
the original is preserved in git and in the commit that fixed it, because the
error is more instructive than the claim.

| finding | verdict |
|---|---|
| B-M3 | **dissolves.** Its only defect was which target the spec named; the test that proves the clause already exists and is green |
| A-M2 — four specs have no freeze baseline | **dissolves.** Both halves need the freeze |
| C-M3 — `check` exits 1 on done-but-not-committed | **dissolves**, but under `c4` and the Deliverable, not `c1`. `c1` is scoped to *read* commands and `doctor` writes — it repairs |
| M3, A-H1 | **partial.** Three of five determinations die with the merge gate. Two survive in code *Carried forward* keeps: `taskStore.ts:217` `isBlocked` is tested only with `open` and `done` requirements, and `spec show`'s member line has no `in-progress` case. A-H1 stays open, narrowed, in U6 |
| M4 | **does not dissolve.** It is `cmdDone`/`cmdStop` at `scripts/tasks.ts:680` and never touches the merge gate. `c2` deletes the stop guards; the `start → done` lifecycle test stays live. Open, in U3 |
| B-M2 | **does not dissolve.** It looks identical to B-M3 and is not: B-M3's fix is to the target, B-M2's is to the *test*. now `scripts/tasks.test.ts:1349`, `expect(stdout).toContain('Relevant files:')` — the header prints unconditionally, so it passes with `relevantFiles` replaced by `[]`. `audit-prompt` is Carried forward, so the weak assertion stays. **Open, in U6** — I put it in U2 and then wrote a U2 scope that did not reach it |

**The case for this spec does not rest on that count**, which is why the count
being wrong changes nothing structural. None of the three survivors argues for
the policy-seam refactor — they are a lifecycle test gap, a weak assertion, and
two untested branches. What the deletions retire is the machinery, and that is
unchanged.

The pass-2 audit filed A-H1, B-M2 and B-M3 together as "these do NOT dissolve."
Walked individually they split three ways, so neither that grouping nor my table
survived contact with the records.

**C-H4 did not survive as filed** — a claim I made twice and checked neither
time. Three of its five cited blocks went with U2: `mergeGate.ts:5`, and
`tasks.ts:148`/`:155`, which were `specCandidatesFromDiff`'s comments. **The one
both this spec and U6 called factually wrong is among the deleted**, so the
example that made the finding vivid no longer exists. Two survive verbatim —
`scripts/tasks.ts:107` and `scripts/lib/taskStore.ts:37` — and that is what U6
carries.

## Decisions

### Keep the consistency scan; change what it does when it finds something

The clean-room design said to delete validation entirely — no scan, no
`--strict`, nothing. That is an overcorrection, and `tl` is the counter-evidence:
it ships `tl doctor --fix` precisely because "when you and an agent share a
directory" you accumulate "broken dependencies, orphaned temp files, stale
claims."

Our `check` already detects the right things. Its defect is that it answers by
exiting 1 and blocking. `doctor` finds the same things and repairs or reports
them. Same scan, opposite polarity, and a far smaller change than deleting it.

### The cost asymmetry that decides every ambiguous case

This tool's output is an input to an agent's reasoning, not a command to a
machine. An agent handles "here is what I know, with this caveat" perfectly
well. It handles a refusal by proceeding without the information — and after
two refusals it stops asking, at which point the record is dead weight.

So bias every ambiguity toward reporting doubt, never toward silence or
refusal. **An unrecorded truth costs more than a recorded contradiction.**
Blocking a write does not prevent the conflict it objects to; it prevents the
*record* of the conflict, and the agent does the work regardless.

### The event log, and the measurement that wrongly cut it

This spec previously cut the event log under the heading *"git is already the
event log"*, on a table claiming git answered a record's history in 86ms. **That
measurement was invalid** and the decision built on it is reversed here. The
error is recorded rather than quietly replaced, because it is the same shape as
the four weak proofs this branch exists to prevent: a green result from an
assertion that was measuring the wrong thing.

It used `git log -S`, which counts **occurrences** of a string. Editing a task's
title or evidence does not change how many times its id appears, so the edit is
invisible. Commit `b326230` edited `policy-seam-u5`'s title *and* evidence:

```
git log -S'policy-seam-u5'  →  1 commit   (only the one that created it)
git log -G'policy-seam-u5'  →  5 commits  (the real history)
```

`-S` missed four of five. It was answering *"when did this id first appear"*,
not *"what happened to this record."*

`-G` is not the repair. The control:

```
git log -G'build-deployment-2026-07-28-h2'   # an unrelated record
→ b326230 Close U5: a claim says who holds it…
```

`b326230` added two fields, so the serializer rewrote all 277 lines — **277
insertions, 276 deletions** — and it now appears in the history of *every record
in the store*. Every schema change does this.

So git offers false negatives or false positives with no way to tell them apart.
That is a text search over a shared file whose every line moves whenever the
schema changes, and it is not a record's history.

**What actually belongs in an event log is not a file change at all.** An
amendment is *the spec's promise widened on this date because X*. A decision, an
abandonment reason, a claim, a note — none of these is primarily a diff, and
deriving each one from git separately rebuilds the log badly, one bespoke report
at a time. That is why the clean-room design and both shipped systems keep state
and history as separate artifacts: `tl` has `tasks/` plus `events.jsonl`,
`taskledger` has markdown records plus immutable events.

### The log is additive, and one-file-per-task stays deferred

`docs/tasks.jsonl` remains the state. `docs/events.jsonl` is added beside it,
append-only, never rewritten. Nothing migrates.

The parts of the cut decision that survived measurement still hold and are not
reopened: a single record edit is already a one-line diff, and two branches
editing *different* records already merge cleanly. Only concurrent **appends**
conflict, and `merge=union` in `.gitattributes` handles that for one line — with
its one failure mode, two branches editing the same record keeping both versions
as a duplicate id, caught by the `doctor` scan `c4` requires anyway.

### Searchable is the requirement, not a feature of it

A log nobody can query is a log nobody reads. Two consequences shape the record
format.

An event **snapshots the system and spec its record carried at the time**. This
is not the manual synchronisation CLAUDE.md forbids — an immutable event
recording what was true when it was written is the correct shape, and joining to
present-day state would silently rewrite history whenever a record is
re-pointed, which happened repeatedly on this branch. It also lets an event name
a system with no task at all, which is what a project-level decision is.

Notes stay **one line**. The whole design depends on `log` output fitting on a
screen, and prose in a record is what made `next` cost thirty lines to call.

### The policy extraction is deferred, and its stated justification was spent

The refactor's case in the previous spec was CLAUDE.md's five-minute budget.
The measurement records `npm test` at **50.08s / 43 files / 831 tests, green**,
with the in-process runner already landed. The budget is not under threat, so
that argument is spent.

The real case is different and still stands — a 2139-line file holding the
rules of a 92-line module, and three renderers for one concept. That is honest
debt work and it deserves its own branch and its own audit, not a ride on this
one. `c9` takes the one piece of it that a planner actually feels.

### TDD is offered to a planner, not imposed on one

A clause backed by a test needs no prose restating it — the test is the
statement. But a planner who wants prose gets prose, and a clause that resists
codification stays prose rather than being forced into a weak assertion for the
sake of uniformity.

Nor is the clause set a ceiling on testing. A worker that judges its unit needs
coverage the clauses do not name should write it. The clause tests are the
branch's contract, not its test plan, and nobody planning a unit from outside
knows what it will need to be robust.

Clause tests are ordinary tests in `npm test`. With the gate gone there is no
freeze to fight, nothing to attach them to as a gated target, and no question
about whether they are a CI gate — they are tests.

### Tests before implementation, at two altitudes

A worker writes its own unit's tests before its body: the system rule for
non-UI work, and this branch is not UI work. Separately, the clause tests state
what the branch owes. A green unit suite says the worker built what it set out
to build; the clause tests say the branch kept its promise. Neither substitutes
for the other.

### The five-minute budget is measured, not gated

Recorded in the audit evidence. CLAUDE.md resists new gates, a timing gate is
flaky on shared runners, and the number is useful as a trend long before it is
useful as a threshold.

### Branch from the superseded tip

Cutting from `task-system-real-world-friction-spec` inherits the proven work
without sixteen cherry-picks. Note the consequence for U7: the audits review
the union of both branches' diffs against `main`, which is larger than the
units below imply.

## Carried forward

Proven by independent mutation testing in pass 2, and kept:

- the store serializer — unknown-field preservation with a type-level
  exhaustiveness guarantee; byte-stable, idempotent
- the store error boundary — store-reading commands report `path:line` instead
  of stack-tracing
- `scripts/lib/git.ts` as a seam, as far as it goes
- the closing-commit work: `done` stores `null` rather than a commit that closed
  nothing, and `show` derives the closer from history
- `audit-prompt`'s nine required elements
- the commit contract: mandatory body, optional `Next:`, repo-local `tsx`
- `requires` edges, the `BLOCKED` computation, and topological member ordering

## Implementation units

U1 is done. U0 is in flight with one item left.

### U0 — Finish removing the inherited regressions

Two of three landed (`523251a`, `e9710f8`). The third: the test at
`scripts/tasks.test.ts:1588` asserts `audit-prompt`'s changed-file fallback
finds something, which holds only because this branch's diff against `main` is
non-empty. It fails on a `main` checkout, exactly like the one already moved.
Move it to `gitFixture`.

Acceptance: no test in `scripts/tasks.test.ts` asserts anything about the
ambient repository's git state, and the verification method is stated rather
than asserted.

### U2 — Delete the gate

First, because it shrinks everything after it and because most of the open
finding list disappears with it.

- Remove proof-target execution as a gate, the deliverable freeze and its
  baselines, verdict-to-clause-text binding, and the merge gate's refusals
  (`c10`).
- Remove spec binding derived from git *for gating*: `specCandidatesFromDiff`
  and `mergeGateSpecCandidates`, where the rename hole and the
  unresolvable-merge-base fail-open lived (`c8`).
- **`currentSpec`'s branch-name match stays.** U2 was originally told to delete
  that too. It was wrong, and the worker refused with evidence rather than
  reading my ambiguous wording as permission. `currentSpec` has a second caller,
  `resolveActiveSpec`, backing `next`, `list`, `triage` and `handoff`; its only
  other route is "exactly one spec file has open members", and two do — 5 and 19
  — so it returns null and `tasks next` goes dark on the command CLAUDE.md tells
  every agent to open with. Deleting it also requires *introducing* an asserted
  binding, which is building, not deleting. Naming the inference in the output
  is U3's work, under the clarified `c8`.
- Delete the tests that exist only to prove the deleted behaviour. Keep the
  ones that prove something a reader still needs.
- **CI invokes what this unit deletes.** `.github/workflows/test.yml:53` runs
  `check --merge` on every PR and `:39` runs `check` on every push. Removing a
  CI step is the shape CLAUDE.md flags in an audit, so name it in the commit
  message and say what replaces it. Also correct `CLAUDE.md:40`, which lists CI
  as `tsc --noEmit`, `npm test`, `layer-check` and `audit-status` and omits both
  `tasks` steps — the document has been wrong about this independently of
  anything this branch changes.

Acceptance: `npm test` green; no command exits non-zero on account of a merge
being unsafe; `grep` for the removed concepts returns nothing outside the audit
archive; CI passes with no step invoking a command that no longer exists.

### U3 — Flip the polarity

- Every read command answers. A corrupt line is skipped and noted, an unknown
  id returns near matches, a dependency cycle is returned *as the answer*, and
  contested state is reported with its sources (`c1`).
- Every semantic write guard is removed. Malformed input is the only refusal
  (`c2`).
- `check` becomes `doctor`: same scan, repairing what it safely can and
  reporting the rest (`c4`).

Acceptance: for each removed guard, a test asserts the write now succeeds *and*
that the record shows what happened. A guard removed without a record of its
subject is a silent write, which is the failure this spec exists to prevent.

### U4 — Three-valued completeness, and questions as records

This unit is smaller than it reads. `tasks audit` already takes
`--evidence N="..."` and already stores `{clause, status, evidence}` per verdict,
so nothing here is a new data model — it is one enum value, one required
argument, and a report.

- `unknown`, `unmet` and `met` are distinct; `met` requires the evidence string
  that is today optional (`c3`). `unknown` is the default for a clause nobody
  graded, and it must never be collapsed into `unmet` — "we checked and it
  fails" and "nobody looked" are different facts, and the four weak proofs of
  `combat-continuation-runtime` all lived in that gap.
- Completeness is reported as the **named outstanding criteria**. No percentage,
  no ratio, no single bit — a scalar invites the 90%-for-three-weeks pathology
  and destroys the only actionable information, which is *which* clause is
  outstanding.
- **Reuse `kind` for `c7`.** A question is one more value in a field that
  already carries `task|finding|undelivered`, reachable through the existing
  `add`, `list` and `show`. No new command, no new file, no new record shape.
- A decision needing a human is a record the tool returns (`c7`).

  `B-M5` was named here as the first example and is not one any more. U3 removed
  the `spec add` pass-2 guard under `c2`, closing it by making the question moot
  rather than by answering it — a question that had waited two branches for a
  human, dissolved by a clause.

  The live example instead is **whether `spec amend` survives**. U2 established
  that it now writes a dated copy of the deliverable into the spec file which
  nothing reads, duplicating what `git log -p docs/specs/<slug>.md` already
  gives — and left it standing rather than deleting it as collateral, because
  whether the in-document convenience justifies a write command is a judgement
  about how the workflow is used, not something the code answers. Its
  unchanged-deliverable refusal, which U3 also deliberately left, stands or falls
  with it.

### U5 — Claims

- A claim records actor and time. Past a threshold it is reported **cold**,
  never expired and never auto-released — auto-release puts two agents on one
  task, while "held six days, no activity" lets the next agent decide in one
  read (`c6`).
- The threshold is a **constant, not configuration**, until someone needs to
  change it. A config surface for a number nobody has wanted to tune is the
  bloat this branch is reversing.

`c5` is already satisfied and this unit does not implement it. `decline --reason`
closes an undelivered clause task today — verified against a scratch copy of the
live store on 2026-08-02, on `task-system-real-world-friction-spec-clause-1`,
which reported *"declining it abandons the clause, it does not discharge it"*.
The deadlock was never about a missing verb; it was the guards, and `c2` removed
them.

### U6 — One command surface

- Unknown flag names are errors; `--help` works on every command and
  subcommand (`c9`).
- One printer renders a task everywhere. Today `list`, `spec show` and `next`
  each carry their own row format and only `next`'s marks a member blocked.
- Close C-H4: remove the comment lines CLAUDE.md's policy forbids by name,
  starting with the one that is factually wrong.

### U7 — The event log

Added to this branch after the measurement that cut it was found invalid. It is
additive: `docs/tasks.jsonl` stays exactly as it is and nothing migrates.

- `docs/events.jsonl`, append-only, one JSON object per line:
  `{ t, by, branch, head, op, id, system, spec, note }`. `system` and `spec` are
  snapshots of what the record carried at that moment, not joins (`c11`).
  `id` is nullable, so an event can name a system with no task.
- Every store write appends exactly one event. U5 folded state changes into
  `transition`, so the wiring is a handful of sites, not one per verb. Find them
  rather than trusting that count.
- `op` covers the existing verbs plus two explicit writes: **`note`** and
  **`decision`**. A decision is what makes `c12`'s first question answerable, so
  it is its own op rather than a note by convention.
- One read command answers `c12`: filter by `--id`, `--system`, `--spec`, `--op`
  and free text, composable. Reuse U6's usage-string-derived flag validation —
  do not add a second parser.
- **Delete `spec amend`**, `parseAmendments`, `renderAmendment`,
  `appendAmendment`, the `Amendment` type, `doc.amendments`, and the
  unchanged-deliverable refusal U3 deliberately left standing. Strip the
  `## Amendments` sections from the three spec files that carry one; git holds
  the text, and `combat-continuation-runtime.md` is 120 lines of which 56 are
  that duplicate. An amendment becomes `decision` against the spec.
- `merge=union` for both JSONL files in `.gitattributes`, plus a duplicate-id
  scan in `doctor`. Prove both: two branches appending merge cleanly, and two
  branches editing one record produce a duplicate that `doctor` reports. The log
  is append-only, so union is exactly right for it.

Acceptance: the log answers a single record's history **exactly** — no false
negative when a field is edited, and no false positive when the serializer
rewrites every line. Prove it against the case that exposed the original error:
`policy-seam-u5`, whose title and evidence changed in `b326230`, in a commit
that rewrote all 277 lines. `git log -S` finds one of five and `-G` finds every
record in the store; the log must do better than both, and a test must fail if
it does not.

### U8 — Measurements and the audits

- Record `npm test` and each PR gate against the five-minute budget (`c4`).
- Commission an independent audit through `tasks audit-prompt`, and a second
  auditor asked only whether anything is worse than before U0 — scoped against
  `main`, not a point inside the branch, because this branch carries the
  superseded branch's diff too.
- Give the second auditor the reversed event-log decision specifically. A spec
  that cut a capability, then reinstated it after finding its own measurement
  invalid, is exactly the shape a regression hides in.

## Open questions

**Answered: the storage split is cut.** Measured, git already carries every
field an event log would, a record edit is already a one-line diff, and
different-record edits already merge. Only concurrent appends conflict, and
`merge=union` plus a `doctor` duplicate-id scan closes that for one config line.
See the Decisions entry.

**Should the spec and branch be renamed?** The slug describes work this spec
deletes. Renaming costs re-pointing 38 member records through the operation the
tool handles worst, so it waits until `c8` has removed the machinery that makes
a rename dangerous.
