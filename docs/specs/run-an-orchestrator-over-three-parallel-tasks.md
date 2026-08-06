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

## Audit passes

### Pass 1 — 2026-08-06

- base: `d63d440cf6def9ca989dd256b2f544b27687125d`
- head: `d63d440cf6def9ca989dd256b2f544b27687125d`
- proof 1: met — Three merge commits land the three branches serially on main: dd62522 (a-branch-knows-which-spec-it-owes,
15:08 local), d1ea434 (every-triage-action-has-a-non-interactive-form, 15:26 local), 624890c
(a-clause-can-be-deferred-and-a-spec-can-carry-its-goal, 15:54 local), each preceded by its own
worktree's audit-pass history in .planning/agent-feedback/tool-friction.md (dated sections per
branch per pass) and in each spec's own `## Audit passes`. `tasks log --spec
run-an-orchestrator-over-three-parallel-tasks` returns 27 events from 14:14Z to 20:04Z on
2026-08-06, and their timestamps line up to the second with git commit times on the corresponding
worker branches (e.g. the 14:45:19Z decision matches commit ca83048 at 10:45:32 local = 14:45:32Z;
the "worker 1 of 3" / "worker 2 of 3" notes at 17:39Z/17:49Z land between the corpus merge a49a9b6
and the respective worker's close commit) -- live interleaving with real commits, not a
reconstruction. One loose end: two of three branches' commits carry the CLAUDE.md
Co-Authored-By: Claude trailer on every commit (a-branch-knows-which-spec-it-owes,
every-triage-action-has-a-non-interactive-form); a-clause-can-be-deferred-and-a-spec-can-carry-its-goal's
~13 commits do not. Trailer presence does not prove authorship either way (the git author identity
is the same local git config regardless of who typed the commit), but it is an inconsistency
worth the author's attention, not proof of a violation.
- proof 2: unmet — The 24-entry note/decision log is genuinely live (see c1 evidence) and does cover most of the
run, but "carrying its class from the four above" is not true of every entry. Commit 01c7b47
("Unify the friction channel: one system, two axes, not four classes"), landed on the
prerequisite branch the-task-store-survives-parallel-branches *before* the three-worker corpus
even started (11:26 local vs. 13:23 local corpus merge), records a decision to replace the
Deliverable's four-class list with a two-axis scheme (blocking/non-blocking, fault:
tooling/contract/nobody). That replacement was never implemented -- it only touched
docs/events.jsonl and docs/tasks.jsonl, no code -- and the actual implementation is filed as its
own still-open task, "the-workflow-records-what-cost-it-in-one-place-with-one-quer", which
*requires* run-an-orchestrator-over-three-parallel-tasks (i.e. is scheduled to land after this
run, not before or during it). Despite that, several of this run's own log entries already use
the new fault-axis vocabulary instead of the four canonical classes ("fault is nobody", "these
classify as contract, not worker" at 18:06:59Z), while the spec file itself
(docs/specs/run-an-orchestrator-over-three-parallel-tasks.md) still prints the original four-class
table unchanged. A reader grading "does every entry carry its class from the four above" finds a
live record that drifted its own taxonomy mid-run without updating the spec it was measuring
against.
- proof 3: unmet — The Decisions section is explicit: "The orchestrator does not adjudicate... an orchestrator
that decides is a planning session with worse inputs," and c3's text says the orchestrator
"relays [a design question] and does not adjudicate it. Each one is answered in a planning
session or not at all." At least two design questions were adjudicated by the orchestrator itself,
mid-branch, with no planning session: (1) the 17:57:22Z decision event, self-labeled in its own
text -- "This is a design question and therefore mine, not the worker's" -- ruling that ask/redirect
must refuse a closed record; the ruling was implemented immediately in the worker's branch
(commit 289868e) rather than filed for a planning session. (2) The spec-ownership "zero head
clauses" evidence semantics, ruled once in pass 1 (behind commit 94bee0b) and re-ruled as a
different property in pass 2 (18:42:16Z note: "the first committed in an ORCHESTRATOR RULING
rather than in a spec... I named a threshold where the case wanted an invariant"), again decided
and shipped inside the branch rather than routed to planning. A third instance -- the 18:53:34Z
"c4 is MET, overruling pass 3" call -- is closer to ordinary clause-scope grading (interpreting
what c4's text already covers, and explicitly leaving the underlying HIGH finding open rather than
fixing it in-branch) and reads as defensible orchestrator judgment rather than a c3 violation. The
first two do not: they are self-identified design decisions, decided and shipped without a
planning session, which is exactly what c3 and the Decisions section both say must not happen.
- proof 4: met — None of the 24 --op note/--op decision entries against this spec describe pausing for,
consulting, or receiving input from the human author mid-run; every entry is the orchestrator's
own process record, ruling, or worker summary. Structurally, zero interruptions reached the
author before this review. The caveat is c3: the record's clean "zero interruptions" count is
achieved in part because some entries that were self-identified design questions were adjudicated
by the orchestrator rather than surfaced -- so the batch-review cleanliness c4 measures and the
c3 violation are the same events viewed from two sides, and a reader should not credit c4 without
also weighing c3.
- proof 5: unmet — Only one of the three worker branches has a locatable, per-branch answer to the silent-guess
question: every-triage-action-has-a-non-interactive-form, where two real silent guesses were
found and ruled on (17:57:22Z, 18:25:53Z decisions). Neither
a-clause-can-be-deferred-and-a-spec-can-carry-its-goal (5 audit passes) nor
a-branch-knows-which-spec-it-owes (3 audit passes) has an explicit "asked, none found" (or
"asked, found X") statement anywhere in their own spec's `## Audit passes` sections, in
.planning/agent-feedback/tool-friction.md, or in the run-an-orchestrator event log -- grepped all
three for "silent guess" / "none found" with no hits outside the triage branch. This is not
random: scripts/tasks/audit.ts had no "silent guess" language at all until the follow-on spec
briefs-carry-the-lessons added AUDITOR_LESSONS's "Ask the silent-guess question explicitly" line,
merged at d63d440 (16:57 local) -- *after* all three worker branches were already audited and
closed (last close 15:54 local). So the one instance that worked did so on auditor initiative, not
because the brief asked; the two branches with no recorded answer had no brief instruction to ask
either. The spec's own Open Questions section anticipated exactly this risk ("whether an audit can
be trusted to answer c5... the run should try the cheap form first and record whether it produced
anything") and the honest record of that experiment is: it worked once out of three tries, and the
gap is what motivated c6's fix -- which is a genuinely useful result, but c5 as written ("each
branch's audit is asked specifically... and the answer is recorded per branch") is not met for
2 of 3 branches.
- proof 6: met — scripts/tasks/orchestratePrompt.ts and scripts/tasks/orchestratePrompt.test.ts exist,
following the plan/work/audit-prompt family shape exactly. ORCHESTRATOR_LESSONS in
scripts/tasks/briefLessons.ts (six entries) traces directly to specific incidents in this run's
own event log and commit history: "File a record on the worker's branch, not the orchestrator's"
matches the 18:53:34Z decision's closing note about the orchestrator's own branch being invisible
to workers; "Give every dispatched agent a scratch filename prefix" matches this audit's own
worktree instructions and the run's concurrent-worktree setup; "Verify what a report claims; do
not grade the report" matches the 17:52:47Z-18:29:24Z run of false-proof-test findings; "Do not
tune the brief mid-run" matches the observed pattern that c5's brief instruction only landed after
all three branches were already audited (see c5 evidence). orchestratePrompt.test.ts asserts each
lesson's literal text (not a loop over the array, which the file's own comment explains would
still pass with the array emptied) and separately asserts the brief never leaks the narrative
evidence behind a lesson, matching the "instructions, not incidents" pattern the sibling briefs'
own tests use. Not independently re-run under vitest/mutate for this pass: the shared checkout's
node_modules (junctioned from C:\Users\yonat\Projects\UniversalisRPG\node_modules) was empty for
this audit's entire duration -- confirmed empty via both `ls` and `cmd /c dir` repeatedly over
roughly 40 minutes, with no node/npm process visible in `tasklist` -- so `npm run tasks`,
`vitest`, and `npm run mutate` were all unusable throughout. Graded on direct source inspection
instead; recorded as tool friction below.
- proof 7: unmet — `tasks log --spec run-an-orchestrator-over-three-parallel-tasks --op decision` returns five
entries and none of them is the run's own push/no-push call; the task record itself
(docs/tasks.jsonl, id run-an-orchestrator-over-three-parallel-tasks) is still state "open" with
closedCommit null. The decision this clause asks for has not been made. This is the expected,
almost-certain verdict per the audit assignment, and the useful output is the reading list handed
back to the author separately.
