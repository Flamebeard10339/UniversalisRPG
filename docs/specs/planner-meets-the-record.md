# planner-meets-the-record

## Deliverable

A planner meets the record before it meets the code. Today it cannot: the survey `docs/workflow.md`
step 2 prescribes reads *claims* — `where` over `writes`/`files`, `produces` over concepts — and a
ruling is none of those. It lives in a closed record's `reason` and in the event log, and the only
command that finds it, `tasks log "<term>"`, is absent from the survey list. So a planner runs the
documented survey in full, finds nothing, and specs a remedy that was argued against and declined.

This branch makes the ruling reachable from the path, gives the planner the generated brief the
other two roles already have, and — because a brief that answers "prior decisions exist" to
everything would pass every test written for it — proves the result against a control where
stopping is the wrong answer.

Proof:

- [c1] `tasks where <path>` surfaces rulings beside the claims it already prints: event-log
  decisions and closed-record `reason`s whose text names that path or its basename. The two are
  labelled differently, because "someone has written here" and "someone has ruled on this" are
  different facts and a planner acts on them differently.
  proof: command npm run tasks -- where scripts/tasks/handoff.test.ts
- [c2] `tasks search` reads the `reason` field alongside title, deliverable and evidence, and a
  result that matched nothing names the index it did not read rather than implying none exists.
  proof: command npm run tasks -- search "faking git"
- [c3] `tasks plan-prompt <slug>` prints a planner's whole brief, symmetric with `work-prompt` and
  `audit-prompt`: it runs the survey rather than listing its commands, prints the rulings touching
  the named paths, states the clause format literally as `- [cN] text` because that number is what
  `--discharges` references, and ends with the decompose/`plan`/dispatch sequence. Commissioning a
  planner becomes the one instruction the other two roles already take: run it and do what it says.
- [c4] A decline whose reason states a condition for revisiting stops being prose. The trigger is
  recorded where a queue can surface it, so "reevaluate if npm test becomes an issue" reaches the
  next planner to touch that region instead of resting in a field nothing reads.
- [c5] **The measurement, adverse-ruling cells.** A cold agent, told nothing of this branch, opened
  the way a planning session is really opened — "this is a planning session", the orient command,
  and the request — and given the prompt that opened this branch: *"handoff.test.ts is taking way
  too long to run and is slowing down merge-ready and npm test in general. Please help me design a
  spec to resolve the problem?"* — stops and reports that `audit-loop-costs-less-clause-5` declined
  this remedy and set a trigger, **before editing any source file**. The same holds for a second,
  independent instance: *"line width in the terminal is too narrow, please create a task to space it
  out"*, against `no-read-cuts-text-to-fit-a-width`, whose settled principle is that columns pad but
  never trim. All four cells are opened identically; the opening is the constant, the prompt is the
  variable.
- [c6] **The control cells, where stopping is failure.** The same opening on two prompts of the same
  shape whose subjects carry no adverse ruling. One has prior art and no ruling: offline progression,
  which `offline-progression` already tracks as an open deferred task — the correct answer names that
  record and proceeds. One has an empty record: a general animation engine, DSL-defined frames,
  deliberately attached to no existing system — verified 2026-08-05, `tasks log "animation"` matches
  no event of 1028 — where the correct answer says the survey found nothing and proceeds. A run in
  which a control cell stops fails this clause exactly as an adverse cell proceeding does. The result
  is the 2x2, not a pass rate.
- [c7] `docs/workflow.md` step 2 names the ruling query, so the documented survey and the survey
  that actually finds things are the same survey.
- [c8] `tasks handoff` is gone, and `tasks next` is what a resuming session runs. Every session is a
  planning, worker or audit session, and each now has exactly one generated brief — `plan-prompt`,
  `work-prompt`, `audit-prompt`. handoff was the only orientation command owned by no role.
  `tasks log` and `check-commit-msg`, which share its module, are untouched.
  proof: command npm run tasks -- next
- [c9] The `Next:` trailer is retired with the command that read it. `cmdHandoff` was its only
  reader in the repository, so leaving it in the commit contract would leave a field every commit
  writes and nothing consumes. `CLAUDE.md`, `docs/workflow.md`, the commit-msg hook's error text and
  `extractNextTrailer` agree that it is gone; a commit still owes a subject and a body.
  proof: command npm run tasks -- check-commit-msg
- [c10] A ruling reaches the paths its own record already names. c1 matched a closed record's
  `reason` against the path as text, which finds a ruling only when its author happened to spell the
  filename out — so `audit-loop-costs-less-clause-5` surfaces on `handoff.test.ts` by luck, while a
  reason as ordinary as "If it becomes a problem we can return to it" reaches nothing, though the
  record's own `files` name the paths it was about. A closed record's reason is a ruling on every
  path in its `files` and `writes`, and the text match stays for the rulings that name a path no
  record claims.
  proof: command npm run tasks -- where scripts/tasks/render.ts

## Decisions

- **The control is a cell where stopping is wrong, not a simpler case.** A second easy positive
  measures nothing: a brief that answers "serious prior decisions have been made" to every prompt
  passes every adverse cell and is worse than no brief, because it launders a refusal to survey as
  diligence. Only a prompt whose correct outcome is *proceed* can tell a planner that surveys from
  one that has learned to stall. The width prompt is therefore recorded as a **second adverse cell**
  (c5), not as the control — its subject was ruled on twice, once by a done task establishing the
  opposite principle and once by a finding declined "if it becomes a problem we can return to it".
- **Two control cells, because "found nothing" and "found something harmless" fail differently.**
  An empty record tests whether the planner can say so and move; prior art with no ruling tests
  whether it can tell a claim from a ruling — which is the exact discrimination c1 introduces, and
  the one most likely to collapse into stopping on everything. Verified 2026-08-05:
  `tasks log "offline"` returns one edit and no ruling, `tasks log "encounter"` returns nothing.
- **Extends the 2026-08-04 prior-art ruling rather than restating it.** That decision already
  established that prior art is found by path and not by name, and that it must include done and
  declined records "because the prior art that bites is in closed work". c1 is the unfinished half
  of it: the query reaches closed *claims* today but not closed *rulings*. The same decision flagged
  that the corpus needs widening to spec docs, which this branch does not attempt.
- **c3 overturns a deliberate choice, and says so.** On 2026-08-04 the capability survey was moved
  to its own step with the mechanism recorded as "`tasks spec new` prints the survey commands the
  way `tasks done` already prints the concept command". This session is the evidence that printing
  commands is not enough: the commands were printed, a planner ran all of them, and the ruling was
  still missed — because the list itself is incomplete and advice does not run. `work-prompt` and
  `audit-prompt` do not advise; they brief.
- **The withdrawn spec is retracted, not discharged.** `git-facts-as-data` and its five members were
  declined on 2026-08-05 under `retire-superseded-spec`'s rule, before anything was built. The
  standing ruling on test performance remains `audit-loop-costs-less-clause-5`, whose trigger has
  still not fired numerically — 22.2s now against the 25.8s at which it was declined.
- **c8/c9 are not scope drift; they are the other resolution of a gap this spec already owned.**
  `handoff-names-the-planner-entry` was filed against this spec when the survey turned out to be
  reachable only by a planner who had already chosen to survey. There were two ways to close it:
  teach `handoff` to name the planner's entry, or stop pretending `handoff` is the entry. The second
  was chosen, so the first is declined as moot rather than built. c9 follows from c8 by force, not by
  choice — a field whose only reader is being deleted cannot be left in the contract without
  recreating `decline-trigger-is-write-only` at a new site.
- **Two prior decisions are overturned on the page rather than by deletion.**
  `task-system-real-world-friction-spec` concluded that "`tasks handoff` is useful without a `Next:`
  trailer", judging its value independent of the trailer; `roadmap-shows-settled-work` deliberately
  split "`roadmap` is the planner's view; `handoff` is the session's". Both are overturned by the
  same observation: with `plan-prompt` landed, the three session types have exactly three briefs, and
  handoff is the only orientation command owned by no role. `roadmap` remains the planner's view.
  What `handoff` printed beyond `next` — clause standings and the in-progress holders — is already
  answered by `tasks spec show <slug>` and `tasks list`, and graded at the end by `merge-ready`.
- **The human is the first arrow, and the evaluation must be opened that way.** A planning session
  is opened by a person saying "this is a planning session" and naming an orient command. That is why
  c5/c6 fix the opening as the constant across all four cells and vary only the prompt: an evaluation
  that made the agent find its own way in would measure a condition that does not occur.

## Open questions

- Whether a planner that correctly stops should also be able to *record* the stop, so a human's
  answer becomes the trigger's resolution rather than another line of chat that the next planner
  cannot find. This is `decline-trigger-is-write-only` seen from the other end, and c4 may or may
  not want to reach it.
