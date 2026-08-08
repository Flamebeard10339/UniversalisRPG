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

## Audit passes

### Pass 1 — 2026-08-08

- base: `fbf475fe1786cc51ccb1a2c7f1f3619ed5006d2a`
- head: `7b8e3e386ef40fc4536f4a80b5235ea29db54e17`
- proof 1: met — grep -rn "spec === null\|spec ?? '(deferred)'\|spec == null" scripts/ --include=*.ts finds
  17 sites; render.ts's old `spec ?? '(deferred)'` is gone, replaced by specLine() which reads
  task.departure explicitly. Every remaining site (roadmap.ts:85,195; taskStore.ts:691,806;
  architectureCmds.ts:57; mergeReady.ts:110,329,331,342; records.ts:280,607,904; roadmapCmd.ts:61;
  specCmds.ts:107; triage.ts:37; workPrompt.ts:27,33,164) is a membership/branching test (e.g.
  "no active spec", "discharges no clause", "(unspecced)") — none maps the absence to a departure
  verdict word. Mutation: reverted render.ts's specLine() to the old `spec ?? '(deferred)'` —
  KILLED by scripts/tasks/render.test.ts ("reads \"no spec\" for a record that never joined one",
  "reads the departure reason for each of the three ways a record can leave one"), re-measured at
  its own file per the manifest's second pass.
- proof 2: met — Five call sites null a record's spec: scripts/tasks/audit.ts:513-514 (a pass grading a
  clause deferred, sets spec/departure together at record creation), scripts/tasks/specCmds.ts:345
  (cmdSpecDone --defer-open, departFromSpec(straggler, 'unmet')), scripts/tasks/specCmds.ts:282
  (cmdSpecRemove, departFromSpec(task, 'retriage')), scripts/tasks/triage.ts:123 (runDefer,
  departFromSpec(task, 'retriage')), scripts/tasks/records.ts:970 (cmdDefer, departFromSpec(task,
  'retriage')). `grep -rn "\.spec\s*=\s*null" scripts/` finds exactly one raw assignment left in
  the whole tree: taskStore.ts:383, which is departFromSpec's own body — every other caller is
  forced through it by the function's mandatory second parameter. TS cannot forbid a future direct
  `task.spec = null` bypassing the helper (no store-wide check was added; enforcement is the
  helper's required arg, not a check on write) — the branch's own closing note says this
  explicitly rather than leaving it silent. Mutation: reverted cmdSpecDone's `--defer-open` line to
  raw `straggler.spec = null` — KILLED by scripts/tasks/specCmds.test.ts ("spec done --defer-open
  removes a straggler task from the spec instead of refusing"), re-measured at its own file.
  See also the finding filed below: a sixth site (cmdSpecRemove) states a reason at assembly but
  the reason it states can be wrong for an id that was never a member of the named spec — c2 only
  requires a reason be supplied, which it is, so this does not fail c2's stated proof, but it is
  the same category of loss the branch exists to prevent, filed separately.
- proof 3: met — The three records run-an-orchestrator-over-three-parallel-tasks left behind —
  run-an-orchestrator-over-three-parallel-tasks-clause-2, -clause-3, -clause-5 — are undelivered/
  open records with titles starting "Unmet deliverable clause N". `npm run tasks -- list
  --deferred` returns none of them (checked against the live store). `npm run tasks -- list
  --unspecced` and the plain `npm run tasks -- list` both return all three, with the "Unmet"
  verdict still legible in the title even though these predate the `departure` field (they carry
  departure: null, a legacy gap noted below, not a regression — pre-branch every null-spec record
  rendered "(deferred)" regardless of truth, which was strictly less accurate than today's plain
  "(no spec)" for these). Mutation: reverted taskStore.ts's `--deferred` filter predicate from
  `task.departure === 'deferred'` back to `task.spec === null` — KILLED by
  scripts/lib/taskStore.test.ts ("--deferred keeps only state:open tasks departed as a scope
  decision, not one merely never joined or swept out unmet"), re-measured at its own file.
- proof 4: unmet — Reproduced live against a fixture demo-spec (two clauses): pass 1 graded clause 1
  `unmet` (`--evidence 1=first pass, it fails`), creating demo-spec-clause-1 with title "Unmet
  deliverable clause 1", spec: demo-spec, evidence: "first pass, it fails". Pass 2 then graded the
  same clause `deferred` (`--evidence 1=goal still holds without it`). The record after pass 2 is
  byte-identical to after pass 1 — same title, same spec: demo-spec, same stale evidence — and it
  is absent from `tasks list --deferred`. cmdAudit's duplicate guard at
  scripts/tasks/audit.ts:494 (`if (tasks.some((task) => task.id === baseId && task.state ===
  'open')) continue;`) is untouched by this diff (identical to the pre-branch file, confirmed by
  diffing against fbf475f) and still runs above the branch at :513-514 that would set spec: null,
  departure: 'deferred' — exactly the ordering bug the clause describes. audit.ts's only change in
  this diff is the added `departure: deferred ? 'deferred' : null,` literal on the *creation* path;
  the reuse/skip path that governs a second grading is untouched. scripts/tasks/audit.test.ts has
  zero lines changed in this diff (`git diff <range> -- scripts/tasks/audit.test.ts` is empty), so
  nothing exercises this transition either before or after. This work is already tracked, not
  duplicated by this verdict's own filing: scripts/tasks/audit.ts and .test.ts sit in the grant of
  the already-open task a-later-pass-converts-what-an-earlier-one-filed-and-a-restat
  (discharges: c4, c5; BLOCKED on brief-builds-the-manifest), per this spec's own Decisions
  section splitting c1-c3 and c4-c5 into disjoint grants.
- proof 5: unmet — scripts/tasks/audit.ts:312-353 (buildFindingTask, filedFindings) contains no logic
  that compares a filed finding against a clause verdict graded unmet in the same pass — no
  title/text similarity check, no shared-clause check, nothing relates the two record kinds at
  all. scripts/tasks/audit.test.ts is unchanged in this diff (confirmed empty diff against
  fbf475f), so the exact scenario the clause names — run-an-orchestrator-over-three-parallel-tasks
  pass 1 producing six records for three faults — remains fully reproducible today with zero
  guard or report. Same tracking task as c4: a-later-pass-converts-what-an-earlier-one-filed-and-a-restat
  (discharges: c4, c5) already exists, open, BLOCKED on brief-builds-the-manifest — filing this
  verdict unmet will create dropped-and-failed-clauses-differ-clause-5 as a second, unrelated
  record for the same work; noting the overlap here in evidence is this pass applying c5's own
  principle to itself, since the tool has no mechanism to relate them automatically.
