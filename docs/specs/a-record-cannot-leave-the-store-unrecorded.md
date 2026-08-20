# a-record-cannot-leave-the-store-unrecorded

## Deliverable

`docs/events.jsonl` is append-only, union-merged, and SHA-anchored, and nothing reads it back.
That is not the defect — a write-only ledger is a legitimate design. The defect is that the store
has a removal path the ledger has no verb for, so a record can leave `docs/tasks.jsonl` and the log
cannot say that it did, or why.

The mechanism is one line of `taskStore.ts`: *"saveStore rewrites the whole file from the tasks it
was"*. Any caller that drops a task from the array removes it from the store on the next save.
`EVENT_OPS` has sixteen verbs — add, edit, start, stop, done, decline, triage, import, audit,
spec-add, spec-remove, spec-defer, spec-done, doctor-fix, note, decision — and not one of them
means *this record is no longer in the store*. `spec-remove` is the nearest miss and is about
membership of a spec, not presence in the store. `doctor` does not report the gap either — not
because anything about its failure conditions is wrong, but because nothing computes the gap for it
to print.
That distinction is c5, and it is what keeps this branch a reader rather than a gate.

This has already happened, and the evidence is in the tree today. Four ids carry an `add` event and
resolve to no store record:

| id | lifecycle in the log | reading |
| -- | -------------------- | ------- |
| `c11-proof-probe` | add → decline *("not real work")* → edit | deliberate |
| `orch-verify-probe` | add → decline *("not real work")* → edit | deliberate |
| `scratch-ruling-probe` | add → decline *("not real work")* → edit | deliberate |
| `proof-targets-resolve` | add → **spec-add** into `audit-loop-costs-less` | **unexplained** |

The first three were declined with a stated reason and then dropped. The fourth was created on
branch `audit-session-timing`, titled *"Resolve a spec's proof targets against the tests that
exist"*, and moved into `audit-loop-costs-less` — a spec that exists and holds eleven other live
records. It then vanished. `git log --all -S proof-targets-resolve -- docs/tasks.jsonl` returns
nothing: the id has never appeared in the store on any ref this repository can still reach.

Whether that work was lost or re-filed under another id is not answerable from anything in the
tree. `rg-m3-dead-proof-targets` covers adjacent ground and may be its replacement; nothing records
that it is. That ambiguity — not the missing row — is what this branch removes. One lost record is
cheap. A store that cannot distinguish *deliberately dropped* from *silently gone* costs a re-audit
of all 655 records every time the question is asked, which is the cost this branch is actually
buying down.

The durable part is not the reconciliation report. It is that removal becomes an **operation** with
a verb, so a seventeenth op added later cannot re-open the hole by being write-path-only — the same
completeness shape `every-triage-action-has-a-non-interactive-form` used for the triage table, and
for the same reason: a set that must stay closed needs something that fails when it does not.

Honesty about reach is a clause and not a footnote. Only **160 of 655** store records carry an
`add` event; the other 495 predate the log, as `Task.seq`'s own comment records. A check that
reports "reconciled" over a store it can only see a quarter of is a false proof, and this repository
has filed that defect under seven different names already. The check states its coverage or it does
not ship.

**Out of scope, deliberately.** Duplicate ids from two branches editing one record — the loss mode
`.gitattributes` names, where `doctor` reports it and exits 0 and every read answers from the first
copy forever — is real and is **not** fixed here. The store has zero duplicates today. By this
repository's own rule a gate earns its place by preventing something that actually happened, and
this has not happened yet. It is filed, not built.

Proof:

- [c1] `EVENT_OPS` gains `remove`, and it is the recorded form of a record leaving the store: the
  event carries the id, the branch, the head SHA, and a reason. A removal filed without a reason is
  refused, on the same ground `decline` refuses one — an absence with no stated cause is the exact
  state this branch exists to make impossible.
  proof: vitest scripts/lib/eventLog.test.ts
- [c2] Every path that drops a record from the array `saveStore` writes files a `remove` event.
  A test drives the store's removal callers and asserts the log gained one event per dropped id, so
  a caller that forgets is a red test rather than a silent gap.
  proof: vitest scripts/lib/taskStore.test.ts
- [c3] A reconciliation reads the log and the store and returns three disjoint sets: ids accounted
  for, ids absent from the store with a `remove` or `decline` that explains it, and ids absent with
  nothing that does. The third set is the finding; the first two are the proof it is complete.
  proof: vitest scripts/lib/eventLog.test.ts
- [c4] The reconciliation reports its own coverage — how many store records carry no `add` event and
  are therefore outside what it can check — on every run, including a clean one. A run that finds
  no discrepancy prints the 495 it never examined rather than the word "reconciled".
  proof: vitest scripts/lib/eventLog.test.ts
- [c5] **The reconciliation adds no failure condition to `doctor`.** An unexplained absence is named,
  counted and printed on every run that finds one, and changes no exit code. Ruled by the author 2026-08-06,
  refusing this clause's original form: one historical absence is the case for reporting it, not for
  failing the build on the store's own history. `doctor-fix` cannot repair it either — a record the
  store lost is not a record `doctor` may invent, so the action is to file the ruling, not to write
  the row back. Written as a refusal rather than deleted, because a deleted clause leaves the gate
  available to the next branch that finds the argument locally reasonable, and this exact gate was
  proposed twice in one day from two independent directions.
  proof: vitest scripts/tasks/doctor.test.ts
- [c6] The four live discrepancies are adjudicated in the store rather than left as the check's
  first output. The three probes take retroactive `remove` events naming them scratch;
  `proof-targets-resolve` takes a `decision` event ruling on whether
  `rg-m3-dead-proof-targets` supersedes it or the work is re-filed. After this branch the
  reconciliation runs clean, so a later run that does not is signal.
  proof: npm run tasks -- doctor

## Goal

Make the difference between a record deliberately dropped and a record silently gone answerable
from the log instead of by re-auditing the store.

## Decisions

- **c5's headline was a census and is now the refusal it always was.** It read "`doctor` keeps
  exactly one failure condition", which was true at the merge base and false by the time pass 1
  graded it: `f2b0383`, on this same branch, gave `doctor` a second condition under c9 of
  `a-silent-answer-is-a-defect` — a reference that resolves to nothing. Pass 1 graded c5 **unmet**
  and refused to grade it met-with-a-note, because a met verdict would have entered a sentence in
  the store as verified that anyone could disprove in one command. The substance never changed and
  is untouched below: the reconciliation reports and does not gate. What changed is that the clause
  now says that, so it cannot be falsified by a second condition arriving from a direction it was
  never about. `CLAUDE.md` stated the same one-condition contract and was corrected in the same
  commit. Pass 2 then found three more copies of the census the first repair had missed — this
  document's own `## Deliverable`, `doctor.ts`'s comment above `printReconciliation`, and a line of
  stderr the c5 repair itself had just written into `tasks remove` — so the count was never in two
  places, and a repair aimed at the two the finding named is the shape
  `[auditor/next-neighbour]` describes. All five now say the same thing.
- **Adopted from a planning session in another context, verified before adoption rather than taken
  on report.** Every factual claim above was re-derived independently against the tree: the four
  orphaned ids are exactly those four, `proof-targets-resolve` returns nothing from `git log --all
  -S` over the store on every reachable ref, and `EVENT_OPS` holds sixteen verbs with no removal
  among them. One number was corrected in adoption — **160** store records carry an `add` event, not
  164; there are 164 `add` events and four of them are the orphans this branch is about.
- **Removal is an op, not a report.** A reconciliation that finds orphans is a snapshot and rots the
  moment the next caller drops a record. A verb closes the set, which is why c1 comes before c3.
- **Coverage is a clause, not a caveat.** c4 exists because a check that says "reconciled" over the
  quarter of the store it can see is exactly the false proof this repository has filed seven times
  under different names.

## Open questions

- Whether the retroactive `remove` events in c6 are written by hand or by a one-shot command.
  Delegated: three events is small enough that the answer follows from how awkward the by-hand
  route turns out to be, which the worker will know and this session does not.

## Audit passes

### Pass 1 — 2026-08-08

- base: `9f5f4ddaaa307b18abc3c3214acc6fcea758ef65`
- head: `485cb9bbcbcfad7613454292e9a8485054af76e7`
- proof 1: met — EVENT_OPS holds 'remove' at scripts/lib/eventLog.ts:15, and it is the only enumeration of the ops in the tree (grep for 'spec-done' outside tests returns eventLog.ts:15, friction.ts:48 and specCmds.ts:249, no second list). All four required fields verified live rather than from the test: in an isolated store, `npx tsx scripts/tasks.ts add "goner" --id goner --store <tmp>` then `remove goner --reason "scratch probe" --actor auditor` appended
  {"t":"2026-08-08T19:51:42.760Z","by":"auditor","branch":"worktree-agent-aead6172a73dbb0d6","head":"485cb9bbcbcfad7613454292e9a8485054af76e7","op":"remove","id":"goner","system":null,"spec":null,"note":"removed from the store: scratch probe"}
  — id, branch, head SHA and reason all present, the branch and head coming from recordEvents/git.head() at scripts/tasks/context.ts:48-56. A removal with no reason is refused at records.ts:357 and writes nothing (`remove xx --reason ""` prints the usage and exits 1; empty string is falsy on the same line, so there is no "" bypass). Mutations, all KILLED and re-confirmed at their own file: "EVENT_OPS loses the remove verb" (dropped `, 'remove'` from eventLog.ts:15) killed by eventLog.test.ts > "declares `remove` as an op, so the log can name what left"; "a removal with no reason is no longer refused" (`if (!given || !reason)` -> `if (!given)`) killed by records.test.ts > "refuses with no reason, on the same ground decline does, and writes nothing"; "the retroactive remove event drops the reason it carries" (records.ts:383 note literal) killed by records.test.ts > "files a removal for a record that already went...". Manifest: C:\Users\yonat\AppData\Local\Temp\mutations-a-record-cannot-leave-the-store-unrecorded-pass1.json. Caveat recorded as a finding, not against this clause: `tasks remove` checks no precondition before it writes.
- proof 2: met — The "every path" quantifier is true today because there is exactly one path, which I verified independently of the tests: grep over scripts/ for `saveStore(` outside *.test.ts returns the definition (scripts/lib/taskStore.ts:613) and one call site, scripts/tasks/context.ts:205 inside saveStoreAndWarn; grep for array-narrowing at every saveStoreAndWarn call site returns exactly one that drops a record, scripts/tasks/records.ts:389 in cmdRemove. saveStoreAndWarn derives the declaration (`removals.map(({ task }) => task.id)`) and the events (`removals.map(({ task, reason }) => ...)`) from the same Removal list, so the two cannot disagree. Every write verb reads through the strict `loadStore`, not `readStore`, so the tolerant-parse-then-save hole the module comment at taskStore.ts:469 warns about is not reachable from a write; `doctor --fix` is the one tolerant reader that saves and it declines when skipped.length > 0 (doctor.ts:94). Five mutations, all KILLED and re-confirmed: `if (undeclared.length > 0)` -> `> 99` killed by taskStore.test.ts > "refuses a save that would drop a record nothing declared, and writes nothing"; dropping `&& !declared.has(id)` from taskStore.ts:520 killed by "accepts the same save once the drop is declared"; `if (seen === undefined) return []` -> `return ['phantom']` killed by "says nothing about a store this process never read..." (the over-strictness direction is watched, not only the bypass direction); zeroing either half of the pair in context.ts:208 and :213 both killed by records.test.ts > "drops the record and files one remove event carrying the reason". Two limits filed as findings rather than graded here: nothing fails when a second saveStore caller appears with a `removing` argument and no event, so the closure is asserted rather than enforced; and taskStore.test.ts > "names every undeclared drop, not the first" has only one undeclared id in its fixture, so it cannot fail on the property its name claims.
- proof 3: met — reconcile at scripts/lib/eventLog.ts:170-185 partitions `created` (the deduplicated ids of every `add` event) into accounted / absentExplained / absentUnexplained by construction, so the three sets are disjoint and exhaustive over what the log created; `npm run inspect` over the live tree returns accounted 233, absentExplained 4, absentUnexplained 0, and 233 + 4 + 0 equals the 237 distinct add-ids. Mutations, both KILLED and re-confirmed: `const accounted = created.filter((id) => present.has(id))` -> `const accounted = created` (breaks disjointness) killed by eventLog.test.ts > "returns three disjoint sets over every id the log has seen created"; EXPLAINS_ABSENCE -> ['remove'] killed by the same test. Graded met for the partition, and the completeness sentence is qualified: the explanation predicate is order-blind. Reproduce with `npm run inspect -- -` over
  reconcile([add 'twice', remove 'twice' 'first time, on purpose', add 'twice'], [])
  which returns absentExplained [{id:'twice',op:'remove',note:'first time, on purpose'}] and absentUnexplained [] — a record re-created after its removal and then silently lost reads as accounted for. The same happens for add/decline/triage/start. The branch's own test for this line uses add,remove,add,remove, where "last explanation" and "last explanation after the last add" agree, so it cannot fail on the difference. Filed as a finding.
- proof 4: met — outsideCoverage is computed at scripts/lib/eventLog.ts:184 and printed unconditionally at scripts/tasks/doctor.ts:79, before the summary line and on every exit path of cmdDoctor. On the live tree the merge-ready doctor leg prints "the log against the store: 0 record(s) absent with nothing explaining it, 4 absent and accounted for, 608 of 841 store record(s) outside what this can check at all" on a clean run, and the word "reconciled" appears nowhere. Mutations, both KILLED and re-confirmed: `outsideCoverage: storeIds.filter(...)` -> `outsideCoverage: 0` killed by eventLog.test.ts > "reports the coverage it does not have, on a clean run as well as a dirty one"; replacing the coverage clause of doctor.ts:79 with the word "reconciled" killed by doctor.test.ts > "prints its coverage on a clean run rather than the word reconciled". Met on the store side, which is what the clause names. The other input has no coverage statement at all and that is a filed finding: with one `add` line in events.jsonl truncated, the same store prints "0 record(s) absent with nothing explaining it" where it printed 1, says nothing about the log lines it could not read, and exits 0. loadEvents already returns .skipped and doctor.ts:78 discards it. Reproduction script: C:\Users\yonat\AppData\Local\Temp\audit-a-record-cannot-leave-the-store-unrecorded-pass1-e4.sh
- proof 5: unmet — The reconciliation half of this clause is proven and I want that on the record: an unexplained absence is named and counted at doctor.ts:79-80, changes no exit code, and `--fix` does not repair it. Mutations, both KILLED and re-confirmed at doctor.test.ts: deleting the `printReconciliation(config, tasks);` call killed by "names an unexplained absence, counts it, and still exits zero"; and the negative-direction mutation — making the absence a gate while printing byte-identical lines, `for (const id of absentUnexplained) if ((process.exitCode = 1)) console.log(...)` — was also KILLED by that test, so the suite does watch the exit code and not just the text. What fails is the clause's headline. At the merge base the comment read "The only condition that exits non-zero" (`git show 9f5f4dd:scripts/tasks/doctor.ts`); at HEAD scripts/tasks/doctor.ts:121 reads "The two conditions that exit non-zero" and doctor exits 1 on `dangling > 0` as well, added inside this same diff range by f2b0383 for c9 of a-silent-answer-is-a-defect. Reproduced live: the sandbox run at C:\Users\yonat\AppData\Local\Temp\audit-a-record-cannot-leave-the-store-unrecorded-pass1-e1.sh ends "0 unparseable line(s)" and "doctor exit=1". CLAUDE.md line 47 still reads "`doctor` fails on one condition only: a `docs/tasks.jsonl` line that will not parse", so the branch merges the one document every agent reads as ground truth stating a false gate contract, and this clause — written as a standing refusal precisely so the gate could not be re-argued — restates the false count. Recorded unmet rather than met-with-a-note because a met verdict would put that sentence in the store as verified. The fix is small and is filed as a finding: name both conditions in CLAUDE.md, and restate c5 as what it actually forbids.
- proof 6: met — Verified from the log and the store, not from the commit message. docs/events.jsonl gained one `decision` event and four `remove` events at 2026-08-08T18:51 (`git show 11ca3f3 -- docs/events.jsonl`): retroactive removes naming c11-proof-probe, orch-verify-probe and scratch-ruling-probe scratch, and one for proof-targets-resolve. The supersession ruling departs from the spec's suggested candidate and I corroborated it independently: the ruling names targets-resolve-across-files rather than rg-m3-dead-proof-targets, and audit-prompt's own prior-art block lists "[concept] proof target resolution — registered to Task system over scripts/tasks/auditPrompt.ts, produced by targets-resolve-across-files", which is the capability proof-targets-resolve forecast, so the ruling is derivable from the registry rather than from the reasoning that produced it. `npm run tasks -- doctor` (via the merge-ready run, output kept) prints "0 record(s) absent with nothing explaining it, 4 absent and accounted for, 608 of 841 store record(s) outside what this can check at all", so the reconciliation runs clean and a later run that does not is signal. Proof target is a command, so this clause is inspected rather than mutation-tested; the machinery it depends on is covered by the c3 and c4 mutations. Note the coverage number moved from the spec's 495 of 655 to 608 of 841 as the branch added records, which is the clause working, not drifting.

### Pass 2 — 2026-08-08

- base: `9f5f4ddaaa307b18abc3c3214acc6fcea758ef65`
- head: `2edcf7e789d7c5df5f8b965ce3ac8821e8b55148`
- proof 1: met — Re-verified at this head rather than carried over from pass 1, because records.ts changed
  under the fixes. `EVENT_OPS` holds 'remove' at scripts/lib/eventLog.ts:15 and is still the only
  enumeration of the ops. All four fields verified live in an isolated store: the probe at
  C:\Users\yonat\AppData\Local\Temp\audit-a-record-cannot-leave-the-store-unrecorded-pass2-p1.sh
  appended {"t":"2026-08-08T20:58:38.461Z","by":null,"branch":"worktree-agent-a91fa32020aa250dd",
  "head":"342bf645c55d520402ffd5246fa4188cc7636171","op":"remove","id":"ws-probe", ... } so id,
  branch, head SHA and reason are all on the line. Two mutations, both KILLED and re-confirmed at
  their own file: dropping ", 'remove'" from eventLog.ts:15 killed by eventLog.test.ts > "declares
  `remove` as an op, so the log can name what left"; weakening records.ts:347 from
  "if (!given || !reason)" to "if (!given)" killed by records.test.ts > "refuses with no reason, on
  the same ground decline does, and writes nothing". Bounded, and filed as a finding rather than
  graded here: the refusal is falsy-only, so a reason of one space is accepted and the resulting
  absence reads as accounted for. That is the same ground `decline` stands on, which is what the
  clause ties itself to, so it does not unmake the clause.
- proof 2: met — Re-derived at this head, not carried over: cmdRemove's body and the closure assertion
  both changed since pass 1 graded it. The call graph still has one path. `grep -rn "saveStore("
  scripts --include=*.ts | grep -v "\.test\.ts"` returns the definition (scripts/lib/taskStore.ts:613)
  and exactly one call site (scripts/tasks/context.ts:205, inside saveStoreAndWarn); of the 24
  saveStoreAndWarn call sites, only scripts/tasks/records.ts:400 narrows the array, and
  saveStoreAndWarn derives the declaration and the events from one Removal list so the two cannot
  disagree. Five mutations, all KILLED and re-confirmed: taskStore.ts:631 "> 0" to "> 99" killed by
  taskStore.test.ts > "refuses a save that would drop a record nothing declared, and writes
  nothing"; taskStore.ts:515 "return []" to "return ['phantom']" killed by "says nothing about a
  store this process never read", which is the over-strictness direction watched as well as the
  bypass; context.ts:208 "removals.map(({ task }) => task.id)" to "[]" killed by records.test.ts >
  "drops the record and files one remove event carrying the reason"; and a second "saveStore(" call
  site introduced into doctor.ts killed by the new taskStore.test.ts:1223 > "has exactly one
  non-test caller". Two limits, both filed rather than graded: the new closure assertion is a
  source-text scan over file identity, and a sixth mutation adding a second call site inside
  context.ts itself SURVIVED all 2056 tests; and taskStore.test.ts:1194 "names every undeclared
  drop, not the first" still has one undeclared id in its fixture, so it cannot fail on the
  property its name claims. The runtime hole the survivor points at is narrower than the static
  one: an undeclared drop from a second caller is still refused by saveStore itself, so the
  reachable case is a second caller that declares the drop and writes no event.
- proof 3: met — The partition holds by construction at scripts/lib/eventLog.ts:187-194 and the
  explanation predicate is the one thing the fixes changed, so both were re-measured. `npm run
  tasks -- doctor` over the live tree returns 0 unexplained, 4 accounted for, 625 of 862 outside
  coverage, and the pass-1 hole is closed: lastExplanation at eventLog.ts:201-208 stops at the id's
  last `add`. Two mutations, both KILLED and re-confirmed: "const accounted = created.filter((id)
  => present.has(id))" to "const accounted = created" killed by eventLog.test.ts > "returns three
  disjoint sets over every id the log has seen created"; and the fix reverted in place,
  "if (own[i].op === 'add') return undefined" to "continue", killed by eventLog.test.ts > "does not
  read an explanation from before the id was created again, so a re-filed record that vanishes is
  the finding". The completeness sentence carries one qualification, filed as a finding: the scan
  is over file order, and `docs/events.jsonl` is merge=union, so file order is not time order.
  Reproduced through the real function with `npm run inspect -- -` over
  C:\Users\yonat\AppData\Local\Temp\audit-a-record-cannot-leave-the-store-unrecorded-pass2-p2.js:
  the same add/remove/add triple returns unexplained ['x'] in time order and explained
  [{id:'x',op:'remove'}] in the order a union merge can produce. The live log already has 20
  adjacent pairs out of time order and 3 ids whose own events are out of time order.
- proof 4: met — Both coverages now, which is what the fix added. outsideCoverage is computed at
  scripts/lib/eventLog.ts:193 and logLinesUnread beside it from the read's own skipped list; both
  print unconditionally at scripts/tasks/doctor.ts:79-84, before the summary and on every exit path
  of cmdDoctor. The live merge-ready doctor leg prints "0 record(s) absent with nothing explaining
  it, 4 absent and accounted for, 625 of 862 store record(s) outside what this can check at all"
  followed by "and the log read whole: 0 line(s) of docs\events.jsonl failed to parse", and the word
  "reconciled" appears nowhere. `reconcile` takes ToleratedEvents rather than TaskEvent[], so a
  caller holding only the events cannot state the coverage; doctor.ts is its only non-test caller
  and tsc passes. Three mutations, all KILLED and re-confirmed: "outsideCoverage: storeIds.filter(
  ...).length" to "0" killed by eventLog.test.ts > "reports the coverage it does not have, on a
  clean run as well as a dirty one"; "logLinesUnread: skipped.length" to "0" killed by
  eventLog.test.ts > "states how much of the log it could not read"; and the print's own condition,
  "logLinesUnread === 0" to ">= 0", killed by doctor.test.ts > "says the comparison is reading less
  than the log holds when a line did not parse", so the field and the line are pinned separately.
  Pass 1's reproduction no longer reproduces. One bounded gap, not filed: an unparseable store line
  can fabricate an absence rather than hide one, and that direction is loudly accompanied by the
  unparseable count and exit 1, so nothing is silent.
- proof 5: met — Graded on the behaviour the clause now names, and the rewrite is not what carries it.
  printReconciliation is called unconditionally at doctor.ts:120, before the exit block; it touches
  process.exitCode nowhere; absentUnexplained never enters `issues`, so it cannot reach the
  `dangling` count; and repairStore only clears a close date, so `--fix` cannot invent the record.
  Two mutations, both KILLED and re-confirmed at doctor.test.ts, and one of them is the negative
  direction: making the absence a gate while printing byte-identical lines, "for (const id of
  absentUnexplained) if ((process.exitCode = 1)) console.log(", killed by "names an unexplained
  absence, counts it, and still exits zero"; and replacing the coverage clause with the word
  "reconciled" killed by "prints its coverage on a clean run rather than the word reconciled". On
  the rewrite itself, judged rather than accepted: the new headline states what was promised and
  does not narrow it. The clause body never changed, the Deliverable framed c5 as what "keeps this
  branch a reader rather than a gate", and on the axis the refusal exists for the new sentence is
  strictly stronger, because "exactly one failure condition" would have been satisfied by a branch
  that added the absence gate and removed the parse gate. What it drops is a census of doctor's
  total gate count, which this spec never owned and which f2b0383 changed under another spec's
  audited clause. What is not met is anything the clause says, and what fails is the census
  sentence itself, which survives in three more places and is filed as the first finding below,
  including one that this round's own fix commit newly wrote.
- proof 6: met — Re-checked at this head rather than carried over, because the c3 fix could have turned
  an accounted absence back into a finding and did not. `git show 11ca3f3 -- docs/events.jsonl`
  holds the one `decision` event and the four retroactive `remove` events, naming c11-proof-probe,
  orch-verify-probe and scratch-ruling-probe scratch and ruling on proof-targets-resolve; the
  supersession names targets-resolve-across-files, which the registry corroborates independently
  through the "proof target resolution" concept. `npm run tasks -- merge-ready`'s doctor leg at this
  head prints "0 record(s) absent with nothing explaining it, 4 absent and accounted for" under the
  new last-add rule, so the reconciliation still runs clean and a later run that does not is signal.
  Proof target is a command and is inspected, not mutation-tested; the machinery under it is covered
  by the c3 and c4 mutations above. The coverage figure moved from 608 of 841 to 625 of 862 as the
  round added records, which is the clause working.
