# a-move-never-strands-a-question

## Deliverable

`tasks ask` exists so a triager can hand a record back with a question instead of guessing. It
appends the question to the record's `evidence` and leaves the record where the queue will offer it
again. Nothing reads what it wrote. Every verb that can move a record out of that queue — `promote`,
`defer`, `decline`, `start`, `done` — moves it with no awareness that a live, unanswered question is
sitting in its evidence, printing no warning and refusing nothing. Two of those five were added by
the same branch that added `ask`.

The remedy is a warning and never a refusal, because the person moving the record is usually the
person answering the question. A refusal would make the tool argue with the one user who is right.

The failure is not that five verbs each forgot a check. It is that there is no one place where
"this record is leaving the queue" is decided, so a check has five homes and a sixth verb inherits
none of them. This branch puts the guard where the transition is assembled. That is the same lesson
this repository has now filed under three different names, and this is the fourth.

Underneath it is a smaller instance of the same shape: the sentinel `ask` writes is written by two
different functions, in two modules, and read by nobody. A reader added against one of them would be
correct about half the writes and silently wrong about the other half — so the writers collapse
before the reader is added, not after.

Two folded records complete the design. There is no route from a deferred record back to the
unreviewed queue, which is where a question answered late has nowhere to land — the inverse of the
move this branch guards. And the test named for sweeping every bounded command surface hardcodes
thirty of them, so the three verbs this system added last are unswept: `tasks defer` with five junk
arguments exits 0. That test is why the stranding was never caught, and a test that cannot fail for
the reason it exists is worth less than no test, because it is counted as coverage.

Proof:

- [c1] There is exactly one definition of "this record has a live, unanswered question", it is
  assembled in one place, and it covers every route that can create one. Today the sentinel is
  written by two functions in two modules and read by none; a reader added against one writer is
  silently wrong about the other. The clause is the single definition, not the count of writers —
  collapsing to one writer and one predicate is the shape that satisfies it, and any arrangement
  where two sites can independently decide the answer does not.
  proof: `grep -rn "triage asked (" scripts/ --include=*.ts` outside test files returns exactly one
  line, and every command that both writes and reads that state reaches it through the same exported
  predicate. Name the predicate and its call sites in the pass.
  proof: vitest scripts/tasks/records.test.ts

- [c2] A verb that moves a record out of the queue while an unanswered question is live warns,
  naming the question, and then performs the move. It never refuses, because the mover is usually
  the answerer. The property is over the moves, not over a list of verbs: any transition that takes
  a record out of a state where the unreviewed queue would re-offer it carries the warning. The five
  verbs that can do it today — `promote`, `defer`, `decline`, `start`, `done` — are illustration of
  that property and not its extent.
  proof: vitest scripts/tasks/records.test.ts
  proof: vitest scripts/tasks/triage.test.ts

- [c3] The guard acts where the state transition is assembled, not inside the verbs that call it.
  A verb added after this branch inherits the warning without being edited, and the way that is
  shown is by removing the guard from its one home and watching every verb lose it at once. A guard
  that has to be added per-verb is the defect this clause exists to close, however correct each copy
  is on the day it is written.
  proof: the guard has one source location. Deleting it makes more than one verb's test fail — run
  the mutation and record which tests died, since a guard whose removal kills exactly one test is
  not shared.
  proof: vitest scripts/tasks/records.test.ts

- [c4] A deferred record can be routed back to the unreviewed queue by a non-interactive command,
  and the route is recorded the same way its inverse is. `defer` takes a record out of every spec
  and there is nothing that puts it back into triage, so a question answered after the record was
  deferred has nowhere to land. This branch does not redefine what "deferred" means — the
  classification is derived in `scripts/lib/taskStore.ts` and is another branch's grant this round;
  this clause consumes whatever predicate exists there and adds no second answer to the same
  question.
  proof: record the predicate the route consults and where it is defined. If the branch defines its
  own test for "open with a null spec" anywhere inside this grant rather than consuming
  `taskStore.ts`'s, the clause is unmet however well the route works.
  proof: vitest scripts/tasks/records.test.ts

- [c5] The test named for sweeping every bounded command surface derives its list from the command
  registry rather than restating it. The property is that a verb registered in `commands.ts` is
  swept by that test without anyone remembering to add it — so adding a verb and not touching the
  test still covers it. A hardcoded list that happens to be complete today does not meet this
  clause; the test must be unable to fall behind.
  proof: add a verb to the registry in a test fixture, or otherwise show the sweep's subject set is
  computed from the registry, and show the count the test sweeps equals the registry's size. Record
  both numbers, and record that `tasks defer` with junk arguments now refuses, which it does not
  today.
  proof: vitest scripts/tasks.test.ts

## Goal

Make an unanswered question impossible to lose by accident, and make the test that should have
caught the loss incapable of falling behind the command set.

## Decisions

- No new capability is registered. `non-interactive triage` is registered to the Task system over
  both `scripts/tasks/records.ts` and `scripts/tasks/triage.ts` and already owns `ask`, `defer` and
  the `TRIAGE_ACTIONS` table; the guard, the sentinel's single writer and the return route are that
  capability working correctly rather than a new one. `blocking question` is a different thing — a
  `question`-kind record blocking what depends on it — and is not what `ask` writes.

- The guard warns and never refuses. This was already ruled when
  `an-answered-question-record-is-stranded-when-any-verb-moves-` was declined into its duplicate:
  the decision "warn, never refuse" was written into the survivor's deliverable. It is restated
  here so the worker does not re-derive it.

- `defer`'s existing state guard stays as it is. `isReviewable` refuses a closed record for
  `defer`, `redirect` and `ask`, ruled on 2026-08-06 for
  `every-triage-action-has-a-non-interactive-form-pass1-tasks-a`. c4's return route is a new
  transition, not a loosening of that guard, and reopening a `done` or `declined` record still needs
  a human.

- The write grant is widened from `records.ts` and `triage.ts` to include `scripts/tasks.test.ts`
  and `scripts/tasks/commands.ts`. c5's subject is the hardcoded list at `scripts/tasks.test.ts:112`
  and the registry it should read instead is `commands.ts`; the record's grant was written before
  that folded record named its file. No other branch in this push writes either path.

## Open questions

- Whether `ask`'s prose sentinel should become a `question`-kind record. `tasks question` now
  exists, with a `decider` and a `--blocks` list, and is the vetted representation of a question the
  store can query. An `ask` that filed one would make c1's single definition a stored field rather
  than a parsed prefix, which is strictly better. It is also a change to what `ask` promises — it
  currently leaves the record unreviewed and edits nothing else — and that promise is a closed
  spec's clause 4. **Do not make that change on this branch.** If reading says it is the right
  shape, file a record saying so and satisfy c1 with the prose sentinel collapsed to one writer.

- Which of the two sentinel writers survives, and where the predicate lives. `records.ts:1037` is
  `cmdAsk`'s and `triage.ts:88` is the interactive walk's; the 2026-08-06 ruling puts the action
  table in `triage.ts` and the standalone verbs in `records.ts`, which argues the shared writer
  belongs with the verbs. Decide it, and say which way the remaining call goes.

- What the return route is called and whether it takes a batch. `promote` and `defer` are both
  batch verbs over ids with a shared refusal; matching them is the cheap answer. A name that reads
  as the inverse of `defer` matters more than novelty — the queue view is where a reader will look
  for it.

- Whether c5's sweep should assert refusal behaviour for every registry verb or only that every
  verb is reached. Asserting behaviour is stronger and may surface more than three unswept verbs;
  if it does, report the count rather than fixing each one, since fixing an unrelated verb's
  argument handling is outside this grant.
