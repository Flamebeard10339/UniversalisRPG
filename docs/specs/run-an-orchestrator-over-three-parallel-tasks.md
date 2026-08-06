# run-an-orchestrator-over-three-parallel-tasks

## Deliverable

One orchestrator drives three workers over three specced tasks in three worktrees, and the run's
output is a decision about whether to push the remaining backlog that way. It produces no feature.

**The reason is endurance, not cost.** Cost was settled separately and is recorded in
`docs/dsl-rewrite/delegation-experiments.md`; this branch does not reopen it. The constraint is the
author. Seventeen specced tasks and about thirty miscellaneous findings are waiting, and supervising
a single worker costs half a day of which nearly all is reading output, confirming the plan is being
followed, and saying continue — while a planning session with the same hours produces a dozen specs.
An hour spent planning is worth several hours spent reviewing, so any design question settled
mid-branch is paid twice: once at the expensive rate, and again because it is answered without the
survey, the prior art and the rulings that a planning session has in front of it. That is the double
work the task system exists to prevent, and the orchestrator's whole job is to stop reintroducing it.

So the orchestrator is a **buffer, not a decision-maker**. It absorbs everything that is not a
genuine design decision and batches what is left into one review at the end. The measurement follows
directly: not where the wall-clock went, not how many audits each task took, but **how many times a
human had to enter the loop, and whether a planning session could have prevented each one.**

Four things can pull a human in, and they mean opposite things:

| class | what it means | where it gets fixed |
| ----- | ------------- | ------------------- |
| **spec defect** | the spec did not answer something it could have | planning — this is the number that must fall |
| **design question** | knowledge that did not exist when the spec was written | a planning session, never mid-branch |
| **tool friction** | a correct tool gave an unactionable answer | the tooling; the sibling tasks are the first instalment |
| **silent guess** | a worker hit a question and answered it itself | nowhere — this is the failure the run exists to detect |

The fourth is the dangerous one, because it never announces itself. A worker that guesses looks
exactly like a worker that had no questions, and the difference only surfaces in the audit or, worse,
after the merge. So the run does not infer its absence from a quiet inbox; it goes looking.

The corpus is the three sibling prerequisites — `every-triage-action-has-a-non-interactive-form`,
`a-clause-can-be-deferred-and-a-spec-can-carry-its-goal`, `a-branch-knows-which-spec-it-owes` — whose
grants are disjoint after correction. Each one that lands removes friction the next round would have
paid, which makes the run self-documenting: the before and after are visible rather than claimed.

This run therefore proceeds **without** non-interactive triage, which is one of the three things it
is landing. Three tasks is a batch the author can read by hand. That capability arriving from the run
is what makes the seventeen-plus-thirty push possible after it, and doing it by hand once is the
cheapest way to learn what the batched form actually has to carry.

Proof:

- [c1] The run happens as described: three tasks, three worktrees, three branches, one orchestrator,
  and the author is not in the implementation loop. What was run and by what route is recorded, so a
  later reader can tell this from three tasks worked in sequence.
  proof: npm run tasks -- log --spec run-an-orchestrator-over-three-parallel-tasks
- [c2] Every entry into the author's attention is recorded at the moment it happens, carrying its
  class from the four above. It is recorded live because it cannot be reconstructed afterwards — a
  question answered in conversation leaves no trace, and this count is the branch's whole result.
  proof: npm run tasks -- log --spec run-an-orchestrator-over-three-parallel-tasks --op note
- [c3] No design question is settled mid-branch. A worker or auditor that reaches one files it and
  stops on that point rather than choosing; the orchestrator relays it and does not adjudicate it.
  Each one is answered in a planning session or not at all, and the record shows which.
  proof: npm run tasks -- log --spec run-an-orchestrator-over-three-parallel-tasks --op decision
- [c4] The author's review is one batch at the end. Anything reaching them before then is itself an
  interruption recorded under c2, so "the author was not interrupted" is a countable fact rather than
  an impression formed after the fact.
  proof: npm run tasks -- log --spec run-an-orchestrator-over-three-parallel-tasks --op note
- [c5] Silent guesses are hunted rather than assumed absent. Each branch's audit is asked
  specifically whether the worker answered a question its spec did not, and the answer is recorded
  per branch — including "none found", which is a result only because it was looked for.
  proof: npm run tasks -- log --spec run-an-orchestrator-over-three-parallel-tasks --op audit
- [c6] The orchestrator brief is generated, not hand-written: the fourth member of the family
  `plan-prompt`, `work-prompt` and `audit-prompt` already form, carrying what this run learned rather
  than what was imagined before it. Writing it is downstream of running, which is why it is a clause
  here and not a separate task filed in advance.
  proof: vitest scripts/tasks/orchestratePrompt.test.ts
- [c7] The run ends in a recorded decision: whether the remaining backlog is pushed this way, and
  what has to change first. A run that produces a measurement and no decision has answered nothing,
  because the question was never how it went but whether to do it again at scale.
  proof: npm run tasks -- log --spec run-an-orchestrator-over-three-parallel-tasks --op decision

## Decisions

- **Endurance, not cost, and the distinction is load-bearing.** The record this replaces asked where
  the wall-clock went, how many audits each task took, and whether reused context beats a cold start.
  Three of those four are efficiency questions, and answering them would not tell the author whether
  they can clear the backlog without spending every day of it in a review loop. The old questions are
  not re-asked here; `delegation-experiments.md` owns them.
- **The orchestrator does not adjudicate.** Given a design question it has the context to answer, it
  still does not, because the point is not to move the decision off the author's desk — it is to move
  it into a planning session where the survey and the rulings are already on the page. An
  orchestrator that decides is a planning session with worse inputs.
- **Interruptions are recorded in the event log, not in a new artifact.** `tasks note` and `tasks
  decision` against this spec already give a queryable, mergeable, timestamped record, and every
  proof target above is a query against it. A branch whose deliverable is a measurement is exactly
  the branch that should not invent a second place to keep measurements.
- **The corpus is the siblings, so this waits only on the store.** The old requires list named all
  five prerequisites, which is circular once three of them are the work. Their grants are disjoint
  after correction, and every worktree is its own checkout — so a worker changing `specDoc.ts` cannot
  reach the orchestrator's tooling or another worker's mid-run. The three land serially at the end,
  which is where they interact and where serial is correct anyway.
- **Three, not more.** The number is set by what the author can review by hand in one batch without
  the capability this run is landing. A larger fan-out would measure throughput, which is not the
  question, and would do it while the mechanism for handing judgements back does not yet exist.
- **`clear-the-friction-an-orchestrated-run-hits-repeatedly` is dissolved rather than required.** Its
  doctor half was misfiled — `doctor.ts` is already merge-aware and the failing thing is
  `doctor.test.ts` reading ambient repository state, filed accurately as `doctor-test-fails-mid-merge`
  — and its remaining half is a one-line error message in `audit.ts`. Neither is a prerequisite.

## Open questions

- Whether the orchestrator is a long-lived session or a spawned agent. It changes what "the
  orchestrator's context" means for c3, and the answer is likelier to come from the first hour of the
  run than from reasoning about it now.
- What granularity c2's classification needs beyond the four classes. A fifth may appear during the
  run; adding one is a note against this spec, not an amendment.
- Whether an audit can be trusted to answer c5 about the worker it is auditing, or whether the
  question needs a reader that did not watch the branch being built. The run should try the cheap
  form first and record whether it produced anything.
