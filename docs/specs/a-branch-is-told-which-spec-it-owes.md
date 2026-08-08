# a-branch-is-told-which-spec-it-owes

## Deliverable

Two invariants that meet on one line, `scripts/tasks/mergeReady.ts:343`, which computes a leg from a
clause standing that reads one pass, about a spec that was guessed from the event log.

**A spec is named by its caller, or read from evidence about this branch that no unrelated command
can write. It is never determined by history.**

`resolveActiveSpec` tries four routes. The first is `--spec`. The second is the branch name, checked
against an existing spec file — correct by construction, and dead: it reads `docs/specs/<branch>.md`
against the raw git branch name, so a `claude/*` branch looks for `docs/specs/claude/<name>.md`,
which cannot exist. 55 of the 65 branches in the event log are `claude/*`, carrying 1553 events;
7 branches in the project's history ever had a name literally equal to a slug. So on every branch
this project actually uses, a command without `--spec` fell through to route three: *the most recent
spec-tagged event written from this branch.*

That route produced all three recorded incidents. `audit-prompt` told a legitimate auditor it was on
the wrong branch and to file nothing, because one uncommitted `note` event had inherited a spec tag
from the archived record it annotated. `tasks promote` filed an unrelated Task-system record into the
friction-channel spec, reading a `decision` event the same session had written twenty minutes earlier
for a different purpose. And the log is append-only by design, so nothing could unbind either.

This branch deletes routes three and four. It does not cross-check them: this record previously
proposed routing every spec-standing read through `decideSpec`, which adds a third mechanism to check
the second, and deleting the guess removes what the check was for. `decideSpec` survives because its
evidence is the branch's own diff, and because `merge-ready` runs in CI where no human can be asked.
A candidate may still be *proposed* from any source, including the log, provided it must pass diff
evidence before it is used — that is the difference between a guess and a shortlist.

**A clause's standing is the composition of every pass that graded it, and a later silence is not a
retraction.**

`clauseStandings` is honest — it takes verdicts and reports `unknown` for a clause they do not
mention. Eight call sites in seven files each hand it `doc.auditPasses[len-1]?.verdicts`, so the
standing is the latest pass alone. That holds while one branch audits a whole spec and fails as soon
as two do. `the-workflow-records-what-cost-it-in-one-place` has thirteen clauses and six members, so
no single pass can grade it: one branch's pass graded c6 met, another's graded c2, c3 and c4 met and
left c6 unknown because it never looked. Merged, c6 reads outstanding with its met verdict still in
the document two headings above. Nothing warns.

The same line carries a third fault: a clause whose undelivered record was consciously declined —
the state the tool itself calls "abandoned, not discharged" — keeps `merge-ready`'s clauses leg red
forever, with the reasoning living only in the store. Seen twice, and the second time it blocked.

Proof:

- [c1] No command's spec answer can be changed by a write that an unrelated command made. The event
  log and store-wide state are not sources of a spec; `resolveActiveSpec` has no route that reads
  either. The property is over what can *determine* an answer, not over what may be listed as a
  candidate: a candidate proposed from any source is permitted precisely when it must independently
  pass evidence about this branch's own diff before it is used, which is what `decideSpec` does and
  what nothing else may do.
  proof: `grep -rn "lastSpecWrittenFromBranch\|specsWrittenFromBranch" scripts/ --include=*.ts`
  outside tests returns no caller that yields a spec without a diff check between the read and the
  use. Name every remaining caller in the pass and say which check stands between it and its answer.
  proof: vitest scripts/tasks/records.test.ts scripts/tasks/mergeReady.test.ts scripts/tasks/triage.test.ts

- [c2] A command that needs a spec and was not given one refuses, names the candidates it can see,
  and changes nothing. Refusing is the whole remedy: the incidents were not wrong answers a user
  could spot, they were confident answers with a plausible note attached. The message route 5 already
  writes for a contested spec is the right shape and should be what every caller gets, so a reader
  learns the same thing whether two specs are live or none are.
  proof: for every verb that consults `resolveActiveSpec`, invoking it on a branch with no `--spec`
  and no matching spec file exits non-zero, prints the candidates, and leaves `docs/tasks.jsonl` and
  `docs/events.jsonl` byte-identical. Record the verb list and the byte check.
  proof: vitest scripts/tasks/records.test.ts

- [c3] `merge-ready` is the only caller that derives a spec rather than being told one, and it
  derives it from the diff. It is the one invocation with no human present — CI runs it on a fresh
  checkout — so it is the one place a refusal would be useless rather than safe. Any second caller
  that grows this exemption later is this clause unmet.
  proof: vitest scripts/tasks/mergeReady.test.ts

- [c4] A clause's standing composes every pass that graded it. A later pass that does not mention a
  clause says nothing about it, and silence never overwrites a verdict; a later pass that does grade
  it wins. The composition happens where the standing is assembled, not at each of the eight call
  sites — a caller must not be *able* to ask for one pass's verdicts and get an answer that looks
  like a standing, which is what makes this the type's problem rather than each caller's.
  proof: on `the-workflow-records-what-cost-it-in-one-place`, whose two recorded passes grade
  disjoint clause sets, c6 reads met and c2/c3/c4 read met from one query. Record the standing before
  and after. Then enumerate every site that reads a single pass and say what it does with it: reading
  the last pass to report *which pass was last* is not a standing and is permitted, and
  `roadmap.ts:129` and `auditPrompt.ts:550` are that. A site that derives a clause's status from one
  pass is this clause unmet wherever it lives, including under a different name —
  `records.ts:789`'s `clauseStanding` is exactly that and is in scope for this branch.
  proof: vitest scripts/lib/specDoc.test.ts

- [c5] A clause whose undelivered record was declined reports as settled, not outstanding, and
  `merge-ready`'s clauses leg goes green on it. The tool already names that state "abandoned, not
  discharged"; the leg reads the record's state beside the verdict rather than the verdict alone. The
  invariant this serves is the one the deleted inference also violated: **no branch is left with a
  red leg it has no action available to clear.**
  proof: vitest scripts/tasks/mergeReady.test.ts

- [c6] Every open record whose reproduction depends on a deleted route is closed, with a reason
  naming this branch, and its reproduction is re-run first to confirm it no longer fires. The
  property is over the store, not over a list: any record this branch makes unreachable is closed by
  this branch. Searching for them is part of the work — a finding left open against deleted machinery
  is the stale record this push has now hit four times, and the search is what makes the count
  trustworthy rather than the two already known. As illustration and not as extent,
  `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal-pass5` and
  `a-note-against-an-archived-record-makes-the-branch-owe-that-` both describe the event-log route
  producing a wrong spec and both should fall to it.
  proof: name every record searched and its disposition, with what was run to confirm each
  reproduction no longer fires. A record left open whose reproduction cannot be made to fire is this
  clause unmet, however few they turn out to be.

- [c7] A generated command line carries every value its generator already holds. Deleting the guess
  moves the cost onto whoever must now name a spec, and the tooling prints most of the commands this
  project runs — so a brief that prints `npm run tasks -- next` while holding the spec in a local
  variable has manufactured exactly the refusal c2 introduces. The property is over generated
  commands, not over the four known sites: a printed invocation that omits an available argument is
  this clause unmet wherever it is. `mergeReady.ts:132` is the case that shows it is an oversight
  rather than a design — one branch of that ternary interpolates `${standing.spec}` and the other,
  in the same expression, prints a bare verb.
  proof: every `npm run tasks --` string printed by `scripts/tasks/*.ts` that names a verb needing a
  spec includes one. Enumerate them and record the list; the known four are `mergeReady.ts:132`,
  `mergeReady.ts:146`, `audit.ts:416` and `audit.ts:572`, and finding more is the expected outcome of
  looking rather than a sign the clause was wrong.
  proof: vitest scripts/tasks/mergeReady.test.ts

- [c8] A branch's active specs are a set, and every reader of that answer takes the set. The type is
  the clause: nothing downstream may receive one spec where the branch has two. `BranchStanding`'s
  singular spec becomes a collection, and the heuristics whose only job was choosing among
  candidates -- `specToGrade`, `authoredAsPlan` and `specAddsClauseId` -- are deleted rather than
  adapted. A caller that still wants "the" spec is what this clause forbids.
  proof: `grep -rn "specToGrade\|authoredAsPlan\|specAddsClauseId" scripts/ --include=*.ts` returns
  nothing, and no exported type carries a singular spec for the branch's own standing. Name what
  replaced it.
  proof: vitest scripts/tasks/mergeReady.test.ts

- [c9] The set is read from the records this branch's own store diff changed, and from nothing else.
  `tasks spec add` and `tasks start` already write `Task.spec`, so the declaration is a side effect of
  work the workflow already does rather than a step someone must remember. No reader of the branch's
  spec set consults `docs/events.jsonl`. **That loses no evidence**: every op `WORK_OPS` names --
  `start`, `stop`, `done` -- writes the record itself, so a record in the store diff is exactly the
  signal `branchWorkedOnMembers` was reading out of the log. A checkout that cannot produce a diff
  says so rather than falling back to a guess.
  proof: on a branch whose store diff names two specs, the set has both. On one whose diff names
  none, the set is empty and every leg says so. Record both, and what the gate prints when the diff
  cannot be read at all.
  proof: vitest scripts/tasks/mergeReady.test.ts

- [c10] `merge-ready` fails while any declared spec is still active, and names which. Active means the
  spec still owes something this branch declared, not that its document exists. Each declared spec is
  graded on its own, so a branch working two cannot go green on the strength of the one it finished.
  The invariant: **the gate's answer is about every spec the branch declared, and never about one
  chosen from among them.**
  proof: vitest scripts/tasks/mergeReady.test.ts

- [c11] A branch is graded on the clauses its own members discharge, not on every clause in the specs
  they belong to. `Task.discharges` already records that per record. Today the `spec` and `clauses`
  legs go red on any branch holding one member of a multi-member spec, and the orchestrator brief
  tells the reader to expect it and ignore it -- a gate whose red state is documented as meaningless
  is not a gate, and it fired on two of Phase 3's three branches. A clause no member of this branch
  discharges is not this branch's to answer.
  proof: on a branch holding one member of a multi-member spec, the clauses leg is green when that
  member's discharged clauses are met and red when they are not, whatever the spec's other clauses
  say. Record both directions, and record that no instruction to ignore a red leg survives in
  `docs/workflow.md` or the generated briefs.
  proof: vitest scripts/tasks/mergeReady.test.ts

## Goal

Stop the tooling from telling a branch which spec it owes, stop it from forgetting a verdict an
earlier pass recorded, and do not hand the reader a command that cannot run.

## Decisions

- One branch, two members, in `requires` order on the same branch rather than two branches merged in
  sequence. The two invariants meet in `mergeReady.ts` and `auditPrompt.ts`, and Phase 3 measured
  what it costs when two branches edit one region: five shared files, three real conflicts, and one
  defect neither audit could see. A `requires` edge between members on one branch buys the same
  ordering with no merge at all.

- No new capability is registered. Nothing here adds a thing the system could not do; two routes are
  deleted and one derivation is moved to where it is assembled.

- The branch-name route is retained **unchanged**. It is checked against a file that exists, so it
  cannot invent a spec, and its note says what it inferred from. It is also effectively dead. Whether
  a dead-but-correct route should be repaired or deleted is a judgement to report, not to act on
  here: repairing it — matching a `claude/` prefix, say — would make it fire on 55 branches it has
  never fired on, which is a new behaviour and not this branch's promise.

- `a-clause-met-by-an-earlier-pass-reverts-to-outstanding-when-` is promoted into this spec rather
  than worked separately. It named `specDoc.ts` and the latest-pass read; `merge-ready-s-clauses-leg-
  cannot-see-an-abandoned-clause` named the same line for a different reason. Two findings, one
  region.

## Open questions

- What the composed standing does when two passes grade one clause differently and neither is later
  than the other in a meaningful sense. Pass order is the document's order, so "later wins" is
  defined — but say out loud whether a `met` followed by an `unmet` should read unmet (the honest
  reading) and whether that needs to be visible as a disagreement rather than silently resolved.
  Prefer the smallest thing that satisfies c4.

- Whether `merge-ready`'s clauses leg should distinguish "settled by abandonment" from "met" in what
  it prints, given it treats both as green. Green with a named reason is more useful than green; a
  gate that cannot say why it passed is the shape this repository keeps filing.

- Whether the six verbs that lose their inferred default should gain anything besides the refusal —
  `tasks next` in particular is a read a human runs constantly, and making it refuse where it used to
  answer is the one place this change could read as a regression rather than a fix. If reading says
  it wants a different default (the store's open members, say, offered as a list rather than chosen),
  report it rather than deciding it.

- ~~Whether any caller is left with no way to supply a spec at all.~~ **Answered before dispatch, by
  survey.** No genuinely stranded caller exists: of the seven `resolveActiveSpec` call sites, `plan`,
  `next`, `promote` and `triage` all already accept `--spec`; `audit-prompt` takes its spec as a
  positional and uses this read only for an informational WARNING that degrades to null; and
  `merge-ready` is the sanctioned derivation. CI runs only `spec show "$SPEC_BRANCH" --branch ...`
  (slug passed positionally, so the inference path is never reached) and `plan --branch ...` (a read
  that exits 0 by design). No `package.json` script, git hook, or `scripts/*` subprocess invokes an
  affected verb. What the survey found instead is c7.

- `tasks spec show` is the one verb that consults the inference and has **no** `--spec` flag —
  `commands.ts:39`'s usage string carries none, and `flagArities` derives accepted flags from that
  string, so passing `--spec` is refused as unknown before `cmdSpecShow` runs. Its slug-less path is
  documented as interactive-only and no non-interactive caller reaches it. Adding the flag is the
  obvious tidy; decide whether that is in scope or a record, and say which.

- `lastSpecWrittenFromBranch` (`context.ts:222`) has exactly one caller — route 3. It becomes dead
  code on deletion. `specsWrittenFromBranch` keeps a second, surviving caller in `mergeReady.ts:315`,
  which reaches it directly rather than through `resolveActiveSpec`, so it stays.

## Audit passes

### Pass 1 — 2026-08-08

- base: `8e91a6e7408b82e46420b430ab46616f0773e4b0`
- head: `ef1bcf668e39581dd7ef51ce65090ca04aca16e4`
- proof 1: met — `grep -rn "lastSpecWrittenFromBranch\|specsWrittenFromBranch" scripts/ --include=*.ts`
returns nothing at all — both functions are deleted outright, not merely their caller.
context.ts:219-238's `resolveActiveSpec` now has exactly two routes: `--spec` (explicit) and
the branch-name file match (`currentSpec`); every other path returns `{ spec: null, note:
unresolvedSpecNote(...) }`, which never reads `docs/events.jsonl` or does a majority/latest
scan over the store. The five real callers (architectureCmds.ts:55 `plan`, records.ts:602
`next`, records.ts:944 `promote`, specCmds.ts:105 `spec show`, triage.ts:114 `triage`) all
pass through this same function; `mergeReady.ts` and `auditPrompt.ts` no longer call
`resolveActiveSpec` at all (grep confirms zero hits in either file) and instead read
`declaredSpecs(storeDiff(...).changed)`, which is exactly the diff-gated candidate c1
requires — `auditPrompt.ts`'s use is a check against a caller-given slug, not a source of an
operating spec (see c3). Mutation-tested: reverting the final `resolveActiveSpec` fallthrough
to guess `tasks.find((t) => t.spec !== null)?.spec` instead of refusing was KILLED by
scripts/tasks/records.test.ts "next does not infer when two specs both have open members —
as ambiguous as none" (1 failed of 119, re-run confirmed at file scope). Manifest:
C:\Users\yonat\AppData\Local\Temp\claude\C--Users-yonat-Projects-UniversalisRPG--claude-worktrees-task-system-final-push-5ed55b\816c65d0-7c79-4a9d-8cd0-653b667d9b34\scratchpad\bsio2-manifest.json,
entry "c1/c2 resolveActiveSpec falls back to a guess instead of refusing".
- proof 2: unmet — Ran all five real `resolveActiveSpec` callers on a branch matching no spec file:
`next` (records.ts:602) and `promote` (records.ts:944) and `spec show` (specCmds.ts:105) all
correctly exit non-zero and print the candidate note — verified live (`spec show` on an
orphaned branch: exit 1, "usage: tasks spec show..."; and by
scripts/tasks/records.test.ts:1045 "next refuses, naming the sole candidate..." and :1096
"next does not infer when two specs both have open members"). But `plan`
(architectureCmds.ts:55-60, `cmdPlan`) does not: called with no positional ids and no --spec
on a branch with 24 open-member candidate specs, it prints the correct contested note
("spec contested: ... Pass --spec to pick one") and then "no active spec for this branch,
and no ids or --spec given — `tasks plan <id>...` grades a set directly" but returns with
exit code 0 (verified live: `npx tsx scripts/tasks.ts plan --branch orphaned-test-branch
[...]` -> EXIT=0). This is the same shape `next` had before records.ts was patched with
`if (activeSpec.note !== null) process.exitCode = 1;` (records.ts:608) — `plan` never
received the equivalent line. No test in architectureCmds.test.ts asserts `plan`'s exit code
in the unresolved-spec case (only the positive "grades the active spec when given no ids"
path at :22 is covered). Mutation-tested the inverse direction to confirm the existing
`next` guard is real: removing records.ts:608's `process.exitCode = 1` line was KILLED by
"next refuses, naming the sole candidate..." (1 failed of 119). `triage` (triage.ts:114) also
does not refuse at the command level, but its use of `spec` is narrower — `unreviewedQueue`
is not filtered by it, and only the interactive `promote` sub-action inside triage needs a
spec, which it already refuses per-item ("no active spec to promote into — pass --spec,
skipping", triage.ts:38) — so triage's non-refusal reads as an intentional design difference
(browsing predates any spec choice) rather than the same gap as `plan`'s. `plan` is the one
verb where c2's proof target ("for every verb that consults resolveActiveSpec ... exits
non-zero") is checked and fails.
- proof 3: met — `grep -rn "resolveActiveSpec" scripts/ --include=*.ts | grep -v test` names five
call sites (architectureCmds.ts:55, records.ts:602, records.ts:944, specCmds.ts:105,
triage.ts:114) — none in mergeReady.ts. `mergeReady.ts`'s `branchStanding` computes
`declaredSpecs(diff.changed)` (mergeReady.ts:387) straight from `storeDiff` against the
merge base, with no `--spec` argument and no human in the loop — this is the CI-only
derivation c3 sanctions. `auditPrompt.ts` (cmdAuditPrompt, :580-596) also reads
`storeDiff`/`declaredSpecs`, but only to build `knownSpecsForBranch`, which feeds
`slugStanding`'s WARNING check against the slug the caller already gave positionally
(`slug = args.positional[0]` upstream) — it never substitutes `knownSpecsForBranch` for the
operating slug, so it is a check on a given answer, not a second deriving caller. This
reading is the one the store's own closed finding
`a-clause-can-be-deferred-and-a-spec-can-carry-its-goal-pass5` records under "reason": its
proposed remedy (route auditPrompt's check through decideSpec) was superseded by deleting
the guess outright, and the record's closure text explicitly distinguishes "told and merely
checks" from "infers instead of being told." vitest scripts/tasks/mergeReady.test.ts (414 of
414 pass, includes the full `branchStanding`/`storeDiff` suite at lines 336-840).
- proof 4: met — `scripts/lib/specDoc.ts:286` `clauseStandings(clauses, passes)` walks every pass in
order and only overwrites `standing` when `verdict !== undefined && verdict.status !==
'unknown'` — an unmentioned or explicitly-unknown verdict in a later pass never erases an
earlier real one. All eight call sites now pass the full `doc.auditPasses` array rather than
`doc.auditPasses[len-1]?.verdicts`: roadmap.ts:133, auditPrompt.ts:685, mergeReady.ts:336,
orchestratePrompt.ts:34, planPrompt.ts:42, records.ts:794 (`clauseStanding`, renamed from a
hand-rolled duplicate that read only the latest pass), specCmds.ts:128/148,
workPrompt.ts:101 — confirmed by reading each diff hunk. The two legitimate "which pass was
last" reads (roadmap.ts:129 `latest?.pass ?? null` and auditPrompt.ts's pass-number stamping
in audit.ts:403) report metadata, not a standing, and are unchanged. Mutation-tested:
weakening specDoc.ts:286's guard from `verdict.status !== 'unknown'` to always-overwrite was
KILLED by 3 of 93 tests across scripts/lib/specDoc.test.ts ("leaves an earlier met verdict
standing when a later pass explicitly grades the clause unknown, not silence" and "leaves a
clause unknown when no pass ever grades it with a real verdict") and
scripts/tasks/mergeReady.test.ts ("leaves a clause an earlier pass met off
outstandingClauses, even though the latest pass never regraded it (c4)"), re-run confirmed at
file scope. Manifest entry "c4 clauseStandings lets an unknown verdict overwrite an earlier
real one" in the bsio2 manifest path above.
- proof 5: met — mergeReady.ts:350-353 `settledByDecline` reads every `undelivered` record for a
clause and reports settled only when all are closed and at least one is `declined`; a live
open/in-progress recurrence keeps it outstanding. `specStanding` (mergeReady.ts:361-363)
routes settled clauses to `declinedClauses` and off `outstandingClauses`, and `specLegs`
(mergeReady.ts:126-143) reports the clauses leg green with a `declined:` note rather than
red when `outstandingClauses` is empty. Covered by
scripts/tasks/mergeReady.test.ts:262-268 "passes the clauses leg on a declined clause, and
names it distinctly from a real outstanding one" and "names a declined clause beside a real
outstanding one, on a failing run", and the recurrence case at :766 "keeps a clause
outstanding when its unmet recurred after an earlier record for it was declined (c5)".
Mutation-tested: forcing `settledByDecline`'s `.some((task) => task.state === 'declined')`
to always return `false` (so no clause could ever be settled by decline) was KILLED by
"passes the clauses leg on a declined clause..." (1 failed of 48, re-run confirmed at file
scope). Manifest entry "c5 settledByDecline never recognizes a decline as settling a clause".
- proof 6: unmet — The two records the spec names as illustration are both closed correctly:
`a-clause-can-be-deferred-and-a-spec-can-carry-its-goal-pass5` (finding/declined) and
`a-note-against-an-archived-record-makes-the-branch-owe-that-` (task/declined) both carry a
`reason` naming this branch's own members (`gate-believes-the-branch`) and a re-run
reproduction confirming the defect no longer fires. But a search for other records
describing the deleted event-log routes (`npx tsx scripts/tasks.ts list --state
open,unreviewed,in-progress` filtered for event-log/resolveActiveSpec/route language) found
one more: `audit-prompt-still-asks-resolveactivespec-whether-the-branch`
(finding/unreviewed/high), filed by this branch's own pass-1 auditor at commit b8f96d3. Its
own evidence text says the deadlock exists "Before this branch, the deleted routes 3 and 4
gave audit-prompt a wrong-half-the-time shot at self-recognition; nothing replaced it" — the
exact deleted-route dependency c6 is about. The fix landed in commit eff89ff (`auditPrompt.ts`
no longer imports `resolveActiveSpec` at all — confirmed by grep and by reading the diff;
it now validates the given slug against `declaredSpecs`/`storeDiff` instead) and is described
as closing this exact reproduction in the member task
`the-brief-validates-the-slug-it-was-given-against-the-declar` ("filed as
audit-prompt-still-asks-resolveactivespec-whether-the-branch", closedCommit eff89ff). I
re-ran the reproduction by inspection: `grep -n resolveActiveSpec scripts/tasks/auditPrompt.ts`
returns nothing, so the deadlock cannot fire. The finding record itself was never triaged —
it remains `unreviewed` rather than closed with a reason naming this branch, which is what
this clause requires and what the workflow's own rule for a branch's first-pass findings
("promoted without a walk") should have produced automatically.
- proof 7: met — `grep -n "npm run tasks --" scripts/tasks/*.ts | grep -v test` enumerated
every generated command string. The four named sites all carry the spec now: mergeReady.ts:123
(`spec done ${standing.spec}` / `next --spec ${standing.spec}` / `triage --spec
${standing.spec}`, all three ternary branches, where before one branch printed a bare verb),
mergeReady.ts:142 (`audit-prompt ${standing.spec}` / `next --spec ${standing.spec}`),
audit.ts:416 (`triage --spec ${slug}`, was `triage` bare) and audit.ts:572
(`next --spec ${slug}`, was `next` bare, via `nextAfterPass(outstanding, slug)`'s new second
parameter). No other site in the enumeration prints a verb needing a spec without
interpolating one available in its own scope; the remaining `npm run tasks --` strings
either take no spec (`doctor`, `merge-ready`, `where <path>`) or are generic usage text shown
with no spec in scope (`work-prompt <id-or-spec>`, `audit-prompt <spec>` as placeholders in
orchestratePrompt.ts/planPrompt.ts, correctly left as `<placeholder>` since no concrete slug
exists at that point). Live-confirmed via `npm run tasks -- merge-ready`, which printed
`commission an auditor: npm run tasks -- audit-prompt a-branch-is-told-which-spec-it-owes`
with the spec interpolated. Mutation-tested: dropping the spec from mergeReady.ts:123's first
ternary branch (`spec done` bare, the exact historical defect the spec's own text names) was
KILLED by "ends a green run on the two commands that finish the branch" (1 failed of 48,
re-run confirmed at file scope). Manifest entry "c7 mergeReady's spec-done next command
drops the spec".
- proof 8: met — `grep -rn "specToGrade\|authoredAsPlan\|specAddsClauseId" scripts/ --include=*.ts`
returns exactly one hit, a comment in mergeReady.test.ts:401 describing what the new fixture
"drives instead of" — no functional caller remains. `BranchStanding.specs` is typed
`SpecStanding[]` (mergeReady.ts:96), a collection assembled by
`declaredSpecs(diff.changed).map((spec) => specStanding(...))` (mergeReady.ts:387) — every
spec the diff names gets its own `SpecStanding`, none chosen over another. Exercised by
scripts/tasks/mergeReady.test.ts:682 "declares both specs when the diff changes a member of
each" and :316 "grades every declared spec on its own, and cannot go green on the strength of
only one" (mutation-tested under c10 below, since that is the same code path). Live-confirmed:
`npm run tasks -- merge-ready` on this checkout reported exactly one `spec
a-branch-is-told-which-spec-it-owes` leg pair, matching the one spec this branch's own diff
declares.
- proof 9: met — `storeDiff` (mergeReady.ts:306-310) reads `baseStoreTasks` (git-committed store
at the merge base) and diffs it against the live store via `changedRecords`
(field-for-field, key-order independent via `sortedJson`); `declaredSpecs` (mergeReady.ts:318)
maps the changed records' `.spec` field. No call in mergeReady.ts reads `docs/events.jsonl`
(`grep -n "loadEvents\|eventsPath" scripts/tasks/mergeReady.ts` returns nothing). Unreadable
diffs (no merge base, or the store unreadable at the base) are reported via `{readable:
false, changed: []}` and read distinctly from "declares nothing" at both `storeDiff` and
`standingLegs` (mergeReady.ts:173-176, the `spec` leg fails loudly rather than passing
vacuously). Covered end-to-end against real git by scripts/tasks/mergeReady.test.ts:403-495
("names every spec a changed record points at", "is unreadable when there is no merge base",
"is unreadable when the store did not exist at the merge base") and :495-810
("branchStanding, against repository facts"), including :590 "does not declare a spec this
branch only wrote the markdown for" (a spec authored but never assigned to a task record
correctly stays undeclared). Mutation-tested: truncating `declaredSpecs`'s result to always
empty (`.slice(0, 0)`) was KILLED by "names every spec a changed record points at" (1 failed
of 48, re-run confirmed at file scope). Manifest entry "c9 declaredSpecs also reads from
something besides the store diff".
- proof 10: met — `standingLegs` (mergeReady.ts:183) loops `for (const spec of standing.specs)
legs.push(...specLegs(spec))` — every declared spec gets its own `spec <slug>`/`clauses
<slug>` leg pair, and `runMergeReady` fails the whole run if any leg is red
(mergeReady.ts:233-234 `results.filter((r) => !r.ok)`), so a branch cannot go green by one
declared spec's strength while another is still open. Covered by
scripts/tasks/mergeReady.test.ts:316 "grades every declared spec on its own, and cannot go
green on the strength of only one" (asserts two `spec <slug>` legs, one ok one not, and the
overall run fails). Mutation-tested: narrowing the loop to `standing.specs.slice(0, 1)` (grade
only the first declared spec) was KILLED by that same test (1 failed of 48, re-run confirmed
at file scope). Manifest entry "c10 branchStanding grades only the first declared spec".
- proof 11: met — `specStanding` (mergeReady.ts:327-337) computes `ownMembers = changed.filter((t)
=> t.spec === spec)` first, then `ownClauseIds` from `ownMembers.flatMap(clausesOf)` only —
never from the whole `changed` set across every declared spec, so a branch holding members of
two specs cannot leak one spec's discharged clause numbers into the other's owed count. This
is the exact regression the spec's own text flags as unproven by pass 1's own mutation run
(member task `the-brief-validates-the-slug-it-was-given-against-the-declar`'s evidence: a
hand-built mutation on this scoping SURVIVED at whole-suite scope because no test declared two
specs in one diff with overlapping clause ids). That gap is now closed: scripts/tasks/mergeReady.test.ts:646
"does not credit spec-a's owed clauses with a clause number spec-b's own member discharged
(c11)" declares exactly that fixture (two specs, each a member closed by this branch's own
diff, sharing clause id 1). Mutation-tested directly at that line: widening
`ownClauseIds`'s source from `ownMembers.flatMap(clausesOf)` to `changed.flatMap(clausesOf)`
(the whole diff, across every spec) was KILLED by that named test (1 failed of 48, re-run
confirmed at file scope) — the regression the earlier pass could not pin is now caught.
Manifest entry "c11 ownClauseIds leaks clauses from the whole diff, not just this spec's own
members".
