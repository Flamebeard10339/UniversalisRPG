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
  and after, and the count of call sites that still compute a latest pass themselves — which must be
  zero.
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
