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
  and the merge gate's refusals.

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

### No storage split — git is already the event log

Both shipped systems keep one file per task plus an append-only event log, and
I proposed copying them. Measured against this repository, the case collapses.

| what an event log would record | already in git? |
|---|---|
| who changed what, when | yes — 45 commits touch the store |
| **why** | yes, and better: a commit message *plus the code diff beside it* |
| a single record's history | yes — `git log -S'<id>' -- docs/tasks.jsonl`, **86ms** |
| the sha at the time | yes; it *is* the commit |
| which branch asserted it | yes, the graph |

The only gap is an event that never became a commit — a worker claims a task and
dies. But a dead worker does not commit an event log either, so the split does
not close it. Only committing does. And `tl`'s own stated reason for
`events.jsonl` is not history: it is atomicity under concurrent access, which
bites only with parallel writers in one tree.

The one-file-per-task half fares no better here. Two of its three benefits are
already delivered: a single record edit is a **one-line diff** (the byte-stable
serializer did that), and two branches editing *different* records already merge
cleanly — tested. Only concurrent **appends** conflict, because both write at
end-of-file.

That gap costs one line, not a storage rewrite: `merge=union` in
`.gitattributes` merges concurrent appends cleanly. It has one failure mode —
two branches editing the *same* record keep both versions silently, as a
duplicate id — and that is exactly what `doctor` scans for under `c4`, which
has to exist regardless. Union plus a duplicate-id check buys the only real
benefit without the silent corruption, and without the risk.

So the split is cut. Revisit only if parallel writers in one working tree become
normal, which is the one condition that would change the answer.

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

### U7 — Concurrent appends, measurements, and the audits

- `merge=union` for `docs/tasks.jsonl` in `.gitattributes`, plus a duplicate-id
  scan in `doctor`. Prove both: two branches appending different tasks merge
  cleanly, and two branches editing one record produce a duplicate that
  `doctor` reports.
- Record `npm test` and each PR gate against the five-minute budget.
- Commission an independent audit through `tasks audit-prompt`, and a second
  auditor asked only whether anything is worse than before U0 — scoped against
  `main`, not against a point inside the branch, because this branch carries
  the superseded branch's diff too.

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
