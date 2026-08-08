# dropped-and-failed-clauses-differ

## Deliverable

`scripts/lib/specDoc.ts:8-13` states this branch's invariant in its own words: `unmet` is "we
checked and it fails", `deferred` is "we checked, it fails, and the spec's goal is still served
without it", and no reader may collapse any verdict into another, least of all `deferred` into
`unmet`. The deferral feature's own closing command breaks it.

Two different facts land on one store shape. A clause a pass grades `deferred` becomes an
undelivered record with `spec: null` — the branch dropped it and the goal survived. A member still
open when `spec done --defer-open` closes the spec is *also* given `spec: null` — the branch checked
and failed, and said so. `render.ts:75` prints both as `(deferred)` and `taskStore.ts:653` returns
both from `tasks list --deferred`, so no query can tell a scope decision from an admitted failure.
This was hit directly closing `run-an-orchestrator-over-three-parallel-tasks`, where c2, c3 and c5
were graded unmet deliberately — deferring c3 would have laundered the run's headline measurement —
and `--defer-open` was the only route to closing the spec at all. `tasks list --deferred` now
returns three records whose verdict is unmet.

The root is not the command. It is that `spec: null` has been asked to carry a reason it does not
have. It is a fact — this record is a member of no spec — and "deferred" is a classification laid
over it by whoever reads it. Three routes set it (a deferred pass verdict, `--defer-open`'s sweep,
and triage's `defer`) and two readers each guess one reason back out. The invariant:

**`spec: null` means "a member of no spec" and nothing more. A record that left a spec carries why
it left, in a field, written by whatever moved it. Every reader that reports a reason reads that
field, and no reader infers one from an absence.**

The event log already knows: `--defer-open` records a `spec-defer` op naming the spec the record
left and the state it left in. The fact exists and is simply not on the record, which is why it is
recoverable by reading and not by any query.

Two adjacent records are the same confusion at other moments in the same lifecycle, and they live
on the filing side of the `audit.ts` seam, so they are a second member of this spec rather than a
second grant on this one. Their clauses are c4 and c5.

`spec-done-writes-no-event` was folded here and is **already fixed** — `specCmds.ts:245` records a
`spec-done` op and the log carries 22 of them. Verified 2026-08-07 against head. It is not a clause;
it is declined on this branch.

Proof:

- [c1] No reader derives a reason from `spec: null`. The `(deferred)` render and the `--deferred`
  filter are the two that do today, and the property is over readers rather than over those two: a
  reader added later that reports why a record has no spec must read the field, not the absence.
  proof: `grep -rn "spec === null\|spec ?? '(deferred)'\|spec == null" scripts/ --include=*.ts`
  outside tests returns no site that maps the absence to a verdict word. Every remaining match is a
  membership test, and the pass says which is which.
  proof: vitest scripts/lib/taskStore.test.ts

- [c2] Every route that sets a record's `spec` to null states why, where the change is assembled.
  Three do today — a pass grading a clause deferred, `spec done --defer-open` sweeping stragglers,
  and triage's `defer` — and a fourth added later must be unable to omit the reason rather than
  merely remembering to supply it. The guard belongs where the value is assembled, not where a
  reader later wants it; a store-wide check that reports records missing a reason is the shape this
  clause refuses, because it fires long after the one caller who knew the answer has returned.
  proof: name each route that sets `spec` to null and show the reason is required at that
  assignment — by the type if the language can carry it, and say so explicitly if it cannot and what
  carries it instead. Record the enumeration in the pass; a route found later that is not in it is
  this clause unmet.
  proof: vitest scripts/tasks/specCmds.test.ts

- [c3] `tasks list --deferred` returns the records dropped as a scope decision and does not return a
  clause the branch checked and failed. The query answers the question its name asks. A record swept
  out by `--defer-open` while still unmet is reachable — it has not been hidden — but it is not
  reported as deferred, and the pass says which query does surface it.
  proof: the three records `run-an-orchestrator-over-three-parallel-tasks` left behind — its c2, c3
  and c5 clause records — are in the store today and are returned by `tasks list --deferred`. After
  this branch they are not, and their verdict is still legible. Record their ids and both listings.
  proof: vitest scripts/lib/taskStore.test.ts

- [c4] A later pass grading a clause `deferred` converts the record an earlier pass created for it
  as `unmet`, rather than skipping it. Deferral converting rather than deleting is the deferral
  feature's own central promise, and it does not hold on the second grading of a clause — which is
  the common case, since deferral is usually proposed after a clause has already failed once. The
  duplicate guard that causes it is correct about not duplicating and wrong about ordering: it runs
  above the branch that would set the deferred shape.
  proof: vitest scripts/tasks/audit.test.ts

- [c5] A pass that grades a clause unmet and also files a finding restating the same fault reports
  the overlap. Two records for one fault, with nothing relating them, is what
  `run-an-orchestrator-over-three-parallel-tasks` pass 1 produced three times in one pass — six
  records for three faults, caught only by reading the member list by hand at close. Reporting the
  overlap is the clause; whether the two are related in the store or the pass merely says so is the
  open question. Silently producing both is what it forbids.
  proof: vitest scripts/tasks/audit.test.ts

## Goal

Stop `spec: null` from carrying a reason it does not have, so the query can tell a scope decision
from an admitted failure.

## Decisions

- No new capability is registered. `clause deferral` is already registered to the Task system over
  `scripts/lib/specDoc.ts`, `scripts/tasks/audit.ts` and `scripts/tasks/auditPrompt.ts`, produced by
  `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal`. This branch is that capability holding
  its own stated invariant; a second concept for "departure reason" would name a field of the thing
  `clause deferral` already owns.

- The spec has two members over disjoint grants, not one member over a widened grant. c1–c3 live in
  `specDoc.ts`, `specCmds.ts`, `taskStore.ts` and `render.ts`; c4 and c5 live in `audit.ts`, which
  `brief-builds-the-manifest` holds concurrently this round. The `writes` grant is the mechanism for
  exactly this, and splitting on it keeps both branches parallel instead of queueing the HIGH behind
  two mediums.

- `spec-done-writes-no-event` is declined rather than clause-ified. It was fixed after it was
  filed — `specCmds.ts:245` records a `spec-done` op with a comment saying why, and the event log
  carries 22 of them. The record was true when written and false when triaged, which is the same
  staleness that cost `lessons-say-what-the-run-learned` three of its five findings. Verified
  against head, not against the finding.

- The fix goes on the record, not on the command. `--defer-open` marking its own departures
  distinctly would leave the pass-verdict route and the triage route still inferring, and c1's
  property is over readers. Recording the reason where the record leaves is the one change that
  makes all three routes answerable by one read.

## Open questions

- What the departure reason is called and what its values are. At minimum it must separate "dropped
  as a scope decision, goal still served" from "checked, failed, and swept out at close", and the
  triage `defer` route needs a value too — it is neither of those, it is "taken out of every spec to
  be re-planned". Three values, or two plus a null that means the record never belonged to a spec?
  A record that was never a member is not a departure and may want no value at all; say which.

- Whether `tasks list --deferred` keeps its name. If the field distinguishes three reasons, one
  flag returning one of them may want to be a flag that takes the reason. Prefer the smallest change
  that satisfies c3; a flag taking a value is a query shape this repository has not used and is not
  worth introducing for three values unless reading says otherwise.

- For c5: whether the pass relates the two records in the store or merely reports the overlap and
  leaves the auditor to decline one. Reporting is cheaper and does not require deciding which record
  is canonical. Relating them is stronger and needs an answer to what happens when one is closed.
  The clause requires only that the overlap is reported; pick the cheaper one unless reading says
  the relation is nearly free.

- How the overlap in c5 is detected. Text similarity between a finding's title and a clause's text
  is the obvious route and is a guess that will have false positives. A cheaper signal may exist —
  both records are created in the same `cmdAudit` call, against the same slug and pass, and a
  finding filed alongside an unmet verdict for a clause it names in `--file` is a much narrower
  test. Report what was chosen and its false-positive behaviour.
