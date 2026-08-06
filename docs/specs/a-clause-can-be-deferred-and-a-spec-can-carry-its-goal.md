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

## Goal

Give a spec an honest way to drop scope without either blocking merge forever or silently rewriting
its own contract.

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

- **Decided: a `## Goal` heading**, not a `Goal:` line inside `## Deliverable`. `parseSpecDoc` already
  finds every other section this way (`## Deliverable`, `## Decisions`, `## Audit passes`), so a
  fifth section reuses `sectionText` rather than adding a second parse shape; `parseGoal` reads the
  first non-blank line under it, so one line is what a reader — and the round-trip — gets.
- **Decided: left optional, and it does not read as orphaned.** A deferred clause's `undelivered`
  record gets `spec: null` rather than a new field naming a follow-up — the store already renders a
  null spec as `(deferred)`, and `tasks list --deferred` already means exactly "open task, no spec".
  Reusing that convention means the record surfaces in the general backlog and in `tasks list`'s
  default queue the moment it is created, the same way any other deferred task does; `source.spec`
  still names the spec it fell out of, which is what `spec show`'s owner lookup was widened
  (`clauseOwners`) to read so the clause does not report owned by nobody. No orphan: two existing
  queries already find it.
- **Decided: no.** The record ships with `writes: []` and `grant: null`, identical to the unmet path's
  undelivered record. `doctor`'s only grant warning fires on a non-null grant with an empty `writes`
  list, so leaving both null avoids it rather than needing a special case — there was nothing to
  inherit because the unmet path never set one either.

## Audit passes

### Pass 1 — 2026-08-06

- base: `a49a9b614c6cff533de973d9bceb9d18c4d42e94`
- head: `8fcc75fc58b33ef354652f1dbe5c899234247c90`
- proof 1: met — vitest scripts/lib/specDoc.test.ts "round-trips a deferred verdict, with its reason, the same way a met one round-trips its evidence" passes. Mutation-killed at named-test scope: dropping 'deferred' from VERDICTS (scripts/lib/specDoc.ts:16) fails exactly that test (1 failed of 40), because parseAuditPasses' proof regex is built from VERDICTS and stops recognising the line.
- proof 2: unmet — The truly-empty case is refused correctly (`--proof 1=deferred --evidence 1=` exits 1 with "clause 1 is deferred with no reason"), and the interactive walk correctly rejects a whitespace-only answer via `.trim() || null` (scripts/tasks/audit.ts:894). But the flag/file path — the one `--args-from` uses, the one the workflow calls "the one filing route for a branch audit" — never trims: `clauseScoped` (scripts/tasks/audit.ts:744-749) stores the raw slice after `=` verbatim, so `--evidence 1="   "` sets evidence to three spaces, which is truthy and survives the `!verdict.evidence` check at scripts/tasks/audit.ts:1069. Reproduced live in a scratch git fixture (store/systems/specs pointed at a temp dir via --store/--systems/--specs-dir/--branch): `audit demo-spec --proof 1=deferred --evidence "1=   " --proof 2=met --evidence "2=checked"` exits 0, writes `- proof 1: deferred — ` (trailing whitespace, no visible reason) into the spec file, and creates an undelivered task with `"evidence":"   "` in the store; `doctor` reports 0 errors against it. This is the exact "cheaper way to say unmet" c2's own text says must not be possible, and it is reachable through the primary, scriptable input route rather than an obscure corner.
- proof 3: met — vitest scripts/lib/specDoc.test.ts "takes a deferred clause off the outstanding list, the same way a met one is" passes; mutation-killed (removing `&& verdict.status !== 'deferred'` from outstandingSummary's filter fails that test, 1 failed of 40). Also verified against the real `runMergeReady` (scripts/tasks/mergeReady.ts), invoked directly via `npm run inspect` with a stubbed BranchStanding carrying `deferredClauses: ['c3']` and empty `outstandingClauses`: the clauses leg reports `ok: true`, `pass — the latest of 1 pass(es) leaves no clause outstanding; deferred: c3`, while nothing erases the spec file's own recorded verdict.
- proof 4: met — vitest scripts/tasks/audit.test.ts "c3/c4: is not outstanding, and converts into a tracked undelivered record with no spec — doctor accepts it" passes; mutation-killed (forcing `const deferred = false` at scripts/tasks/audit.ts:1094 fails that test, 1 failed of 102). Reproduced live: a deferred clause creates a `kind: undelivered, spec: null, clause: N, source: {spec, pass}` record; `doctor` reports 0 errors/warnings over it; it is findable via `tasks list --deferred` (matches `state: open && spec: null`, and no --kind filter excludes it) and via `tasks spec show <slug>` under "owed by" (clauseOwners was widened at scripts/tasks/specCmds.ts:174 to also match `kind === 'undelivered' && source.spec === spec`). Noted, not a finding: `tasks roadmap`'s backlog section (`scripts/lib/roadmap.ts:247`) filters `kind: 'task'` and folds all undelivered records — deferred or unmet — into an "other kinds" count rather than listing them individually. That is pre-existing behaviour for unmet-clause undelivered records too (unchanged by this branch), not a regression this branch introduced.
- proof 5: met — vitest scripts/tasks/audit.test.ts "is printed by audit-prompt without opening the file" passes; mutation-killed (retargeting parseGoal's sectionText call to a heading that does not exist fails that test, 1 failed of 40). `audit-prompt` on this very spec printed `Goal: Give a spec an honest way to drop scope without either blocking merge forever or silently rewriting its own contract.` before Step 1, confirming it in the generated brief this pass itself used.
- proof 6: met — vitest scripts/tasks/audit.test.ts "the step where verdicts are assigned asks whether the goal still holds before a clause is dropped" passes; mutation-killed (deleting the console.log line carrying "Ask this before recording unmet: does the goal still hold if this clause is never met?" at scripts/tasks/audit.ts:632 fails that test, 1 failed of 102). Confirmed present verbatim in this pass's own generated brief, step 3.
- proof 7: met — vitest scripts/tasks/mergeReady.test.ts "passes the clauses leg on a deferred clause, and names it in the same line that says pass" passes; mutation-killed (collapsing deferredNote to '' at scripts/tasks/mergeReady.ts:138 fails that test, 1 failed of 28). Verified against the real, unmodified `runMergeReady` via `npm run inspect` (not a re-implementation): stubbed standing with `deferredClauses: ['c3']`, `outstandingClauses: []` produces the single line `clauses ok pass — the latest of 1 pass(es) leaves no clause outstanding; deferred: c3` — c3 and c7 do not contradict; the same line that says the leg passes is the line that names what it passed over. Confirmed `mergeReady.ts` diff touches only `standingLegs`'s clauses leg and `branchStanding`'s returned fields (deferredClauses/outstandingClauses) — `authoredAsPlan` and `decideSpec`, the functions the sibling branch `a-branch-knows-which-spec-it-owes` owns, are called but not edited anywhere in this diff.
