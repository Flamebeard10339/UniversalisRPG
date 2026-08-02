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
  No command in the tool can block a merge.
- [c5] Abandonment is a first-class write. `drop --because` closes any record,
  including the five undelivered clause tasks of the superseded spec that no
  command can close today.
- [c6] A claim records who holds it and when. A claim with no activity past a
  threshold is reported cold; nothing is ever auto-released.
- [c7] A decision that needs a human is a record the tool can return, not a
  paragraph of prose in a spec document.
- [c8] No state is derived from git. Every recorded fact was asserted by an
  agent that intended it; git is referenced as evidence by sha and is never an
  input to state.
- [c9] No command answers a question it did not understand. An unrecognised
  flag is an error naming the flag, `--help` works on every command and
  subcommand, and one printer renders a task everywhere it appears.
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

### The finding list dissolves rather than being worked

Of the eight findings U1 established that no clause covered, **six disappear
under this spec** rather than being fixed by it:

| finding | why it stops existing |
|---|---|
| M3, M4, A-H1 — the merge gate calls an in-progress branch complete | there is no merge gate |
| B-M2, B-M3 — proof targets asserting an incidental string | proof targets are not a gate; this returns to audit practice |
| A-M2 — four shipped specs have no freeze baseline | there is no freeze |
| C-M3 — `check` exits 1 on the ordinary done-but-not-committed state | reads answer (`c1`) |

Only **C-H4** survives: 188 comment lines in the task system, several forbidden
by name under CLAUDE.md's comment policy and still verbatim in the tree at
`28d56cd` (`scripts/tasks.ts:108,148,155`, `mergeGate.ts:5`, `taskStore.ts:36`).
One of them is also false — it claims `specCandidatesFromDiff` reuses quiet git
plumbing when `diffChangedFiles` inherits stderr. It is carried in U6.

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

### One file per task, plus an append-only event log

Both shipped systems converged on the same hybrid, and neither of our own
designs proposed it: human-readable state, one record per file, alongside a
separate immutable event log. State stays greppable and diffable; history is
never lost.

The property that matters here is that two branches touching different tasks
**merge with no resolution step**. That dissolves the two-key-orders diff noise
and most of the exposure behind friction #17, without a fold-on-read rewrite.

This is the largest single piece and the only one that is genuinely structural,
so it is last and it is separable. If it becomes its own branch, everything
above still delivers.

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
- Remove every path that derives state from git — spec binding by branch name
  and by diff both go, with nothing layered on top of them (`c8`).
- Delete the tests that exist only to prove the deleted behaviour. Keep the
  ones that prove something a reader still needs.

Acceptance: `npm test` green; no command in the tool can exit non-zero on
account of a merge being unsafe; `grep` for the removed concepts returns
nothing outside the audit archive.

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

- `unknown`, `unmet` and `met` are distinct; `met` requires an evidence string,
  unvalidated and free text (`c3`).
- Completeness is reported as the named outstanding criteria. No percentage.
- A decision needing a human is a record the tool returns (`c7`). `B-M5` — the
  `spec add` pass-2 guard — is the first one; it is a policy question that has
  been waiting on a human through two branches because there was nowhere to
  put it.

### U5 — Claims and abandonment

- A claim records actor and time. Past a configurable threshold it is reported
  **cold**, never expired and never auto-released (`c6`).
- `drop --because` closes any record (`c5`). Prove it against the live
  deadlock: the five undelivered clause tasks of
  `task-system-real-world-friction-spec`, which `decline`, `done` and
  `spec done --defer-open` each refuse by a different route.

### U6 — One command surface

- Unknown flag names are errors; `--help` works on every command and
  subcommand (`c9`).
- One printer renders a task everywhere. Today `list`, `spec show` and `next`
  each carry their own row format and only `next`'s marks a member blocked.
- Close C-H4: remove the comment lines CLAUDE.md's policy forbids by name,
  starting with the one that is factually wrong.

### U7 — Storage, and the audits

Separable. If this becomes its own branch, U0 and U2–U6 still deliver.

- One file per task, plus an append-only event log (`c8` history half). Prove
  the property that motivates it: two branches editing different tasks merge
  with no conflict.
- Record `npm test` and each PR gate against the five-minute budget.
- Commission an independent audit through `tasks audit-prompt`, and a second
  auditor asked only whether anything is worse than before U0 — scoped against
  `main`, not against a point inside the branch, because this branch carries
  the superseded branch's diff too.

## Open questions

**Does the storage split belong on this branch?** It is the only structural
piece and everything else delivers without it. Deferred to after U6, when its
cost is visible against a working tool rather than estimated against a broken
one.

**Should the spec and branch be renamed?** The slug describes work this spec
deletes. Renaming costs re-pointing 38 member records through the operation the
tool handles worst, so it waits until `c8` has removed the machinery that makes
a rename dangerous.
