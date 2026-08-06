# a-clause-can-be-deferred-and-a-spec-can-carry-its-goal

## Deliverable

A clause stands `met`, `unmet` or `unknown`. There is no way to say a branch deliberately dropped
one, so the honest moves are both bad: leave it outstanding, which blocks `merge-ready`'s clauses leg
forever because that leg is `outstandingClauses.length === 0`; or edit the spec, which rewrites the
contract silently and leaves the audit grading something nobody promised. Measured in a planning
session: adding c8 to `reimplement-localization` shifted every later clause and required rewiring
`--discharges` across three records by hand, with nothing checking the result — a fumble there would
have left a clause owed by nobody, and `merge-ready` would have passed a branch that dropped scope.

Add a fourth verdict, `deferred`, and make it cost something. It carries a reason, it does not count
as outstanding, and — the part that separates a deferral from a quiet scope cut — **it converts the
clause into a tracked `undelivered` record rather than deleting it.** That machinery already exists
and is already enforced: `Kind` includes `undelivered`, `Task.clause` is "the clause this record
*is*", and `doctor` errors both ways — an `undelivered` naming no clause, and a clause named by
anything else. A deferral has somewhere correct to go.

The second half comes from the same root. Clauses are written before the knowledge exists.
`audit-brief-arrives-complete` carried specific clauses while the actual goal was to settle the audit
prompt, which nobody could have foreseen when the clauses were written; task growth after a worker's
first round is recurring and usually *not* scope drift. Auditors already make evidence-based value
judgements, and today they make them against a clause list and nothing else.

**The two halves are one thing: the goal is what makes a deferral judgeable.** A clause may be
deferred when the spec's goal is still served, and an auditor with no recorded goal has nothing to
weigh that against — which is why "defer" without "goal" would just be a licence to drop scope.

| the situation | today | after |
| ------------- | ----- | ----- |
| a clause the branch could not reach | outstanding forever, or silently deleted | deferred with a reason, and tracked as `undelivered` |
| a clause the branch tried and failed | `unmet` | unchanged — `unmet` still means tried and failed |
| a clause nobody looked at | `unknown` | unchanged |
| an auditor judging whether a miss mattered | nothing recorded to judge against | the spec's goal, printed in its brief |
| dropped scope after the merge | gone | a record in the backlog naming the clause |

Proof:

- [c1] `deferred` is a fourth verdict, parsed, rendered and round-tripped like the other three, so a
  spec file carrying one reads back identically.
  proof: vitest scripts/lib/specDoc.test.ts
- [c2] A deferral must carry its reason. Recording `deferred` with no evidence is refused, because a
  deferral with no reason is an `unmet` clause with a shrug, and the one thing this must not become
  is a cheaper way to say unmet.
  proof: vitest scripts/tasks/audit.test.ts
- [c3] A deferred clause is not outstanding. `outstandingSummary` and `merge-ready`'s clauses leg both
  pass with one recorded, while the spec file goes on showing it as deferred with its reason — the
  gate stops blocking without the record being erased.
  proof: vitest scripts/lib/specDoc.test.ts
- [c4] A deferral does not lose the work. Recording one creates an `undelivered` record naming that
  clause, so scope the branch dropped becomes a tracked backlog item rather than a sentence in a spec
  nobody queries. `doctor` accepts the result, which is the existing invariant this rides on.
  proof: vitest scripts/tasks/audit.test.ts
- [c5] A spec carries a goal: one line, distinct from its clause list, stating what the branch is
  *for*. `audit-prompt` prints it, so the auditor has it without opening the file — the brief is
  generated and complete, and a goal it does not carry is a goal nobody reads.
  proof: vitest scripts/tasks/audit.test.ts
- [c6] The auditor is asked to judge against the goal. Its generated brief asks, in the step where
  verdicts are assigned, whether the branch served the goal where it missed a clause — the question
  that licenses a deferral, asked by the tool rather than remembered by the auditor.
  proof: vitest scripts/tasks/audit.test.ts
- [c7] A deferral is visible where decisions get reviewed, not swallowed by a green gate.
  `merge-ready` names the deferred clauses in the leg it now passes, so a branch that deferred its
  way to green says so in the same output that says it is ready.
  proof: vitest scripts/tasks/mergeReady.test.ts

## Decisions

- **`deferred` is not a synonym for `unmet`.** `unmet` means the branch tried and failed and the gate
  should block. `deferred` means the branch deliberately dropped it, the goal is still served, and
  the work is now tracked elsewhere. Collapsing them would keep the gate honest and lose the
  distinction that makes the honest move available; keeping only `unmet` is the status quo this
  branch exists to fix.
- **A deferral converts, it does not delete.** The alternative — dropping the clause from the spec —
  was available all along and is what people do today. It is refused because it rewrites a contract
  after the fact and leaves the audit grading a document that no longer says what was promised.
  Converting to `undelivered` keeps the promise visible and the work findable.
- **The reason is required, and required at the point of recording.** Not encouraged, not warned
  about. c2 is the whole defence against this becoming a shortcut, and a defence that can be skipped
  is not one.
- **The goal is one line.** `## Deliverable` prose already exists and is not it: prose is the argument,
  the goal is the thing the argument serves, and an auditor weighing a miss needs the second in a
  form it can hold. One line also makes it cheap enough to write that specs will actually carry one.
- **The auditor records; the author ratifies.** A deferral is a scope decision, and scope decisions
  are the author's. The auditor is well placed to *propose* one with evidence, and the recorded
  deferral is exactly the shape of thing `run-an-orchestrator-over-three-parallel-tasks` batches into
  one end-of-run review. This branch does not build a ratification step; it makes the proposal
  legible enough that reviewing a batch of them is a short job.
- **No new gate.** Nothing here refuses a merge that would have passed, and nothing polices whether a
  deferral was justified. The repository's stance is that a recorded fact is an agent's assertion an
  auditor can contradict, not something the tool adjudicates.
- **`mergeReady.ts` is shared with `a-branch-knows-which-spec-it-owes`, deliberately and by region.**
  c7 needs the `clauses` leg to name what it now passes over; that branch rewrites `authoredAsPlan`
  and `decideSpec`. Different functions in one file, which merge cleanly — measured on this
  repository, two edits to different regions of one file merged with no conflict. Neither branch
  touches the other's function, and this note exists in both specs so neither worker treats the
  other's presence as a surprise or a reason to widen its own grant.

## Open questions

- Where the goal lives in the file — a `## Goal` heading, or a `Goal:` line inside `## Deliverable`.
  The parser has to find it either way; the worker picks against how `parseSpecDoc` already reads
  sections.
- Whether a deferral should name the spec or task that picks the clause up. It would be useful and it
  is often unknowable at the moment of deferring, so the worker should try leaving it optional and
  record whether the resulting records read as orphaned.
- Whether the generated `undelivered` record inherits the deferring branch's write grant. It has no
  worker yet, so probably not, but `doctor`'s grant warnings will say.
