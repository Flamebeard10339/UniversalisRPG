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
- [c5] **The measurement.** Cold agents, told nothing of this branch, opened the way a planning
  session really is — "this is a planning session", the orient command, the request — with the
  opening held constant and only the request varying. The graded behaviour is not stop-versus-
  proceed but whether the agent read the record correctly, across four states a subject can be in:
  a ruling that still stands (**stop**), a ruling whose stated condition for revisiting has since
  been met (**proceed, citing that the trigger fired**), prior art with no ruling (**proceed,
  reusing the existing record rather than duplicating it**), and an empty record (**proceed, saying
  the survey found nothing**). A run passes only if all four are answered in kind; an agent that
  stops on every cell has learned to stall, and one that proceeds on every cell has not read
  anything.
- [c6] **The cells are blind to the experiment.** No agent can read which cell it is in, what the
  expected outcome is, or that it is being evaluated at all. The cell definitions live outside the
  repository under test, and neither the worktree's name nor any tracked file names a prompt or its
  verdict. This clause exists because the first run failed it: c5 and c6 quoted all four prompts
  with their expected outcomes, the worktrees were cut from a commit containing that text, and the
  worktrees were named `eval-*`. One agent stated in its own reasoning that it had recognised a
  control case and that the system was checking whether it would proceed rather than stop. A cell
  that can read its own answer measures the agent's honesty, which is worth knowing and is not what
  this evaluation is for.
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
- [c11] The survey nobody has to remember to run shows rulings too. `reportPriorArtOnWrites` fires by
  itself when a write grant is declared — which step 6 tells every worker to do, on exactly the paths
  a ruling would be about — and printed prior art only, so a planner could see a decision where a
  worker could not, on the same path and from the same store. It prints both, the way `where` and
  `plan-prompt` do.
  proof: command npm run tasks -- add "probe" --writes scripts/tasks/handoff.test.ts

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

## Audit passes

### Pass 1 — 2026-08-05

- base: `4314b3e7691cf732471862872188f5254725c01f`
- head: `44fb160e2585c00f7a119cc4e0c381f3125cf054`
- proof 1: met — `npm run tasks -- where scripts/tasks/handoff.test.ts` prints a `rulings on scripts/tasks/handoff.test.ts:` section, separate from and below `prior art on ...`, carrying three closed-record reasons and two `decision` events, each tagged `[ruling]`. The two labels are distinguishable without reading prose. Mutation-tested with `npm run mutate`: dropping the basename arm of `namesAny` (so only the full path matches) KILLED 2 of 30 in scripts/lib/producers.test.ts; widening the event filter to `op === 'decision' || op === 'decline'` KILLED 1 of 30. Both die for the right reason -- the basename case and the "a decline event is not a ruling" case.
- proof 2: met — `npm run tasks -- search "faking git"` returns audit-loop-costs-less-clause-5 with `(matches: reason)`; that record is declined, so it is reached both because `reason` joined SEARCH_FIELDS and because `listQueue` stopped applying the not-closed default to a text query. `npm run tasks -- search zzzznotathing` names the seven fields it read and points at `tasks log "zzzznotathing"` for the event log. Mutations: removing the reason/trigger entries from SEARCH_FIELDS KILLED 6 of 185; reverting `matchesSearchTerm` to a contiguous `includes(term)` KILLED 5 of 185; deleting the `filter.text !== undefined || filter.triggered` escape from listQueue's default state filter KILLED 6 of 185.
- proof 3: met — `npm run tasks -- plan-prompt some-new-slug scripts/tasks/render.ts` runs the whole of `printWhere` per named path (claims and rulings both), prints the clause format as the literal `- [c1] a checkable clause` bullet, and closes with decompose / `tasks plan` / `work-prompt` dispatch. Run with no paths it still prints the format and the sequence and says so. Verified by inspection of the printed output, not by a test target -- the clause has none. See finding `plan-prompt-cites-workflow-steps-that-no-longer-exist`: the sequence it prints is numbered 4/5/6 against a workflow.md that now numbers those steps 3/4/5.
- proof 4: met — `npm run tasks -- list --triggered` returns eval-spec-leaks-into-its-own-cells with `(trigger: a new evaluation of planner or worker behaviour is designed, ...)`; `tasks show` on it prints the trigger with a pointer back to `--triggered`; `tasks decline --trigger` records it and echoes the queue that reads it. Reaching a declined record from `--triggered` is the same listQueue escape mutation-KILLED under clause 2 (6 of 185). checkStore warns when a non-declined record carries a trigger, so the field cannot silently survive a reopen.
- proof 5: unmet — The recorded run does not establish the clause's own pass condition. c5 passes only if all four cells are answered in kind, and the branch's own event log records BOTH controls as contaminated: 2026-08-05T15:50:49Z says cell B "inferred an eval context from the eval-* worktree names, a second leak vector beside the spec text", and eval-spec-leaks-into-its-own-cells records cell C reporting unprompted that it had found "a ruling in docs/specs/planner-meets-the-record.md that records this exact request as a deliberately-empty-record control case". The spec's own Decisions section states why that is fatal rather than incidental: "Only a prompt whose correct outcome is proceed can tell a planner that surveys from one that has learned to stall" -- i.e. the discriminating power of the run lives entirely in B and C, and B and C are the two that read their own context. The two uncontaminated cells are the adverse ones, which a stop-on-everything agent also passes. Separately, nothing re-runnable survives: `docs/planner-eval/` (the harness's own declared write grant) was never created, the four prompts and transcripts are untracked by c6's design, and the only tracked evidence is one prose row in docs/dsl-rewrite/delegation-experiments.md.
- proof 6: unmet — c6 requires that no tracked file names a prompt or its verdict. docs/specs/planner-meets-the-record.md is tracked and c5 names all four cell states with their expected outcomes in parentheses -- stop; proceed, citing that the trigger fired; proceed, reusing the existing record; proceed, saying the survey found nothing. The clause is knowingly undelivered: eval-spec-leaks-into-its-own-cells is declined with a trigger and planner-eval-harness discharges c5 only. Recorded unmet rather than unknown because it was checked and fails on the current tree.
- proof 7: met — docs/workflow.md's survey step names the ruling query in its own terms -- "**rulings** (event-log decisions and closed-record `reason`s whose text names that path or its basename)" -- and prints it through `plan-prompt`, which is the command the step now opens with. Verified by reading docs/workflow.md lines 17-30 against the live output of `tasks plan-prompt <slug> <path>`, which does print both sections. Two qualifications, filed as findings rather than graded here: the clause says "step 2" and c8's renumbering made the survey step 1, and `tasks spec new` still prints the pre-branch survey list at a second call site workflow.md does not cover.
- proof 8: met — `npm run tasks -- handoff` exits with "unknown command: handoff" and a usage line that lists plan-prompt in its place; `npm run tasks -- next` answers the resuming session ("no open, unblocked tasks in spec planner-meets-the-record -- all 10 member(s) are accounted for"). `tasks log` and `check-commit-msg` both still run from the same module and are covered: `npm run tasks -- log "eval"` returns 19 of 1061 events, and check-commit-msg is exercised by hand under clause 9. `git grep cmdHandoff` finds no live reference outside merged audit records. The one test that enumerated `handoff` as a view (specCmds.test.ts "renders the same kind, state and severity tag in every view") dropped it and kept the other five, so no assertion was weakened to make the deletion pass.
- proof 9: met — Verified by hand against real message files through `npm run tasks -- check-commit-msg`: subject+body accepted (exit 0), subject-only refused with the body message and the new error text naming only `tasks next`, subject+`Next:`-only accepted. History is safe because the contract moved strictly one way -- the only shape whose verdict changed is `Next:`-only, which went from refused to accepted, so no commit that passed before fails now and no historical `Next:` trailer invalidates its commit. `extractNextTrailer` and `NEXT_TRAILER` have no remaining reader in the tree (`git grep` finds them only in merged audit records and this spec). One noted weak spot, unchanged by this branch: mutating the body filter from `line.trim() !== ''` to no filter at all SURVIVED the whole suite, so nothing pins "a body of blank lines is not a body" -- that predicate predates the branch and the branch only removed the trailer term from it.
- proof 10: met — `npm run tasks -- where scripts/tasks/render.ts` surfaces tasks-roadmap-pass2-... whose whole reason is "If it becomes a problem we can return to it" -- a ruling that names no path in prose and is reached only through the record's own `files`. Mutation: replacing structuralOn's body with `return []` KILLED 3 of 69 across scripts/lib/producers.test.ts and scripts/tasks/architectureCmds.test.ts, i.e. the unit case and the CLI case both die. De-duplication is separately pinned ("reports a record that qualifies by both text and files just once"). The over-reach this creates on directory grants is already filed by the branch as ruling-inherited-from-a-directory-grant and I confirmed it: `where scripts/tasks/` now prints 25 rulings, headed on ~30 files by tool-friction-backlog's decomposition note, which rules on none of them.
- proof 11: met — `npm run tasks -- add "probe" --writes scripts/tasks/handoff.test.ts --store <copy of the store>` prints `prior art on ...` and then `rulings on ...` with the same `[ruling]` tagging and the same closing sentence `where` uses -- the two call sites now print through the one `printRulings`. Run against a copy of docs/tasks.jsonl so the real store was not written. The record's own claim is excluded from both sections (the `others` filter), which the diff makes structural rather than duplicated.
