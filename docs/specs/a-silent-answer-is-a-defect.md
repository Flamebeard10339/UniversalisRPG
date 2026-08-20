# a-silent-answer-is-a-defect

## Deliverable

`docs/audits/task-system-2026-08-08.md` is the first whole-system sweep of the task system. Its §7
orders the work by what retires the most of the finding list rather than by severity, and its §8
rules that §7.1–§7.3 land *inside* the phase-6 freeze rather than after it, because what they buy is
a system that **cannot silently lose a record, cannot silently answer short, cannot silently accept
a flag it does not have, and cannot silently hide a record from the query meant to find it.** This
branch is that work.

Every clause below is one of the sweep's own prescriptions, and each is small. None of them is a
redesign: the audit's §7.5 explicitly refuses the event-sourced store as the next move, and §7.6
refuses building any new capability ahead of its use. What is common to all ten is a single shape —
a command that answers confidently from a default after the thing it was actually asked has already
failed. The whole branch replaces those defaults with the answer.

Proof:

- [c1] A concurrent write cannot silently lose a record, and a concurrent read cannot silently see a
  truncated file. `saveStore` stages to a sibling temp file and renames it into place, so no reader
  ever observes a prefix; and it refuses, rather than overwriting, when the file has changed on disk
  since this process read it. What was lost with `exit 0` is now refused with a non-zero exit and a
  message naming the re-run.
  proof: vitest scripts/lib/taskStore.test.ts
- [c2] `tasks where <path>` names every file that imports the region, same-system siblings included,
  labelling which of them cross a system boundary instead of filtering down to those. The query that
  could have shown `scripts/tasks/auditPrompt.ts` still calling into `scripts/tasks/context.ts` does
  show it.
  proof: vitest scripts/lib/architecture.test.ts
- [c3] A record whose declared `system` disagrees with the system that owns every path it names is
  reported — at the moment the record is assembled, and again by `doctor` over records already
  filed — and is never refused, because a record may legitimately span systems.
  proof: vitest scripts/lib/taskStore.test.ts
- [c4] Every queue's order is total. Two records sharing a `seq` — 104 of 792 do — sort the same way
  whatever order the store was read in, which is the property
  `scripts/lib/orderIndependence.test.ts` was written to hold and could not, because its fixture
  gave every record a distinct `seq`.
  proof: vitest scripts/lib/orderIndependence.test.ts
- [c5] The flags a command accepts are what it declares, not what its prose mentions. A `--word`
  written inside a usage string's explanatory parenthetical is description and is refused as a flag;
  a flag given twice is an error rather than a silent last-value win. `tasks list --trigger x` and
  `tasks decision "…" --op note` both refuse.
  proof: vitest scripts/tasks/cliFixtures.test.ts
- [c6] `--grant commitment` is refused on a record nobody has started, because the field's only job
  is to record that someone read the region and the planner is the party it exists to distrust; and
  setting `--writes` grades the dispatch collision it creates, at that moment, above the prior-art
  wall rather than as one untagged line inside it.
  proof: vitest scripts/tasks/records.test.ts
- [c7] `tasks done --commit <rev>` reports the difference between the record's write grant and the
  diff that commit actually made — the comparison `docs/workflow.md` asks a human to do by eye, and
  the first measurement of how wrong a forecast is.
  proof: vitest scripts/tasks/records.test.ts
- [c8] `tasks where <directory>` collapses closed prior art the way `collapseClosed` already does
  for its one caller, so the survey `plan-prompt` runs at workflow step 1 is one a planner reads
  rather than skims.
  proof: vitest scripts/tasks/architectureCmds.test.ts
- [c9] `doctor` exits non-zero when a record points at something that does not exist — a system name
  absent from `systems.json`, a live record's spec with no file, a `requires` naming nothing, a
  duplicate id, a dependency cycle — and keeps merely reporting every disagreement about the work.
  proof: vitest scripts/tasks/doctor.test.ts
- [c10] A spec file can be deleted without stranding its closed members: a closed record keeps its
  spec slug as history and no longer requires the file to exist, and `spec remove` can detach a live
  member from a spec whose file is already gone.
  proof: vitest scripts/lib/taskStore.test.ts

## Goal

Land the four "cannot silently" properties §8 of the sweep makes the condition of the freeze, using
only changes the sweep already reproduced and costed.

## Decisions

- **The audit's own ordering is the branch's ordering.** §7.1's five changes, then §7.2's grant
  observation point, then §7.3's `doctor` failure and the spec retirement it needs. Nothing here is
  reordered by severity: c1 is first because it is the only clause that ends an active, silent data
  loss.
- **`saveStore` refuses rather than retries.** A retry loop would have to re-apply the caller's
  mutation against a store it did not read, which no caller can express — every write verb is
  `loadStore` → mutate → `saveStore` and the mutation is a closure over the array it loaded.
  Refusing converts a silent loss into a loud one and costs the caller one re-run, which is what
  `docs/workflow.md:135-140` already asks agents to arrange by hand.
- **The compare is against the bytes this process read, not against the record set.** An id-set
  comparison catches a concurrent `add` and misses a concurrent `edit`, which is the same class of
  defect one field over. The store module owns both the read and the write, so the whole
  read-modify-write window is inside it and the snapshot needs no caller to thread it through.
- **The compare needs a lock, which the sweep's costing does not include.** Measured after
  implementing exactly what §7.1's change 1 prescribes: five concurrent `tasks add`, three exiting 0
  claiming success, one record lost. Comparing and then renaming is check-then-act — both writers
  pass the comparison, then both rename, and the second silently replaces the first. The comparison
  and the rename now happen together under an exclusive-create lock beside the store, held for the
  microseconds they take and broken if a process died holding it. This is the one place the branch
  is larger than the audit costed it, and the reason is a measurement rather than a preference.
- **No declared flag table.** §7.1's change 5 prescribes "a declared arity table beside each usage
  string". That is refused, and the refusal is the audit's own §4.3 rule: a table beside 45 usage
  strings is a second artifact required to be manually kept in sync with the first, and the sweep's
  central finding is that this repository has ten such relations and enforces one. The same
  exactness is bought inside the single artifact by making the declaration/description boundary
  explicit — a `--word` inside parentheses is prose, which is the rule `positionalArity` already
  applies to its own half of the same string — and by sweeping every registered verb in a test.
- **`checkStore` keeps its signature; ownership is a separate issue source.** `checkStore` is pure
  over the record set, and resolving a path to its owning system needs the manifest. Adding a
  parameter would edit 25 test call sites to make one check reachable, so the ownership comparison
  is its own exported function composed into `doctorIssues` beside the others.
- **A third issue level rather than a flag on the second.** `doctor` failing on "points at nothing
  real" and reporting "disagrees with itself" is a distinction the type must carry, or the next
  reference check added will be classified by whoever writes it. `dangling` is a level, so tsc
  requires every construction site to choose.
- **A closed record's `spec` is history, not a live reference.** The five-line change §6.4 names.
  `departFromSpec` clears `spec` only on departure, never on an ordinary close, which is correct —
  the slug is how a closed record says which contract it answered. What was wrong is requiring the
  file to still exist for a record that can never be worked again.

## Open questions

None. Every clause is a prescription the sweep reproduced; where this branch departs from one, the
departure is recorded above.

## Audit passes

### Pass 1 — 2026-08-08

- base: `ccbf328d4a31b7e4d6fe0998ef8a5e7f0d323263`
- head: `19789883096ca41d2ae85bb892dbd0ebc65b4f25`
- proof 1: met — Mutation: deleted the refusal at scripts/lib/taskStore.ts:560 (the StoreError thrown when the
 bytes on disk differ from the ones this process read). KILLED by scripts/lib/taskStore.test.ts > a store
 that moved under the writer > "refuses rather than overwriting, and the write it would have deleted
 survives", 1 failed of 110, re-measured at its own file with the mutant still applied. Between processes
 the property is held by scripts/lib/taskStore.test.ts > writers dispatched together > "never reports a
 record added that the store does not then hold", which spawns three real `tasks add` against one store and
 asserts the store holds exactly the ids that exited 0. Torn reads: saveStore stages to
 `<store>.<pid>.tmp` and renames, and "leaves no staging file behind" asserts the directory back to one
 entry. The lock is load-bearing and I exercised it directly: a lock file younger than LOCK_ABANDONED_MS
 refuses after LOCK_WAIT_MS rather than being broken, and the same lock back-dated past 30s is broken and
 the write lands in 13ms (filed as a low finding, since the refusal message misnames the cause). The
 in-process snapshot cannot go stale in the CLI: every write verb is loadStore/readStore then
 saveStoreAndWarn, saveStore re-seeds lastSeen with the bytes it just wrote, and no production caller saves
 a path it did not load in the same command, so the `seen === undefined` escape is unreachable through
 the CLI. StoreError reaches the user as `error: <message>` and exit 1 via reportReadErrors in
 scripts/tasks/commands.ts:210. What is not silent but is new is filed as a medium finding: on Windows the
 rename fails EPERM when any process holds the store open for reading, and that error is not a StoreError.
- proof 2: met — Mutation: restored the deleted `byPath.get(to)?.system !== candidate.system` filter at
 scripts/lib/architecture.ts:244. KILLED by scripts/lib/architecture.test.ts > regionView > "names a
 same-system sibling caller as well as a cross-system one, labelling which crosses", 1 failed of 38,
 re-measured at its own file. Verified against the repository the finding was about:
 `npm run tasks -- where scripts/tasks/context.ts` prints under `imported by:` the line
 `scripts/tasks/auditPrompt.ts (Task system)` with no boundary label, alongside cross-system entries that
 carry `— across a system boundary`. That is the caller H3 said the query could not see.
- proof 3: met — Mutation: made the early return in misfiledSystem unconditional at scripts/lib/taskStore.ts:905
 (`owners.size === 0` to `owners.size >= 0`). KILLED by scripts/lib/taskStore.test.ts > misfiledSystem >
 "reports a record whose every path belongs to a system other than the one it claims", 1 failed of 110,
 re-measured at its own file. Never refuses: the issue is level `warning` and doctor exits 0 on it —
 `npm run tasks -- merge-ready` prints `833 task(s), 0 dangling reference(s), 0 error(s), 14 warning(s)` and
 the doctor leg passes, all 14 being this check. Spanning records are exempt by construction
 (`owners.has(task.system)`), pinned by "says nothing when one of the paths does belong to the declared
 system". At assembly it fires on `tasks add` and on `tasks edit` when system/writes/files change. It does
 not fire on the two other routes that assemble a record with both fields — filed as a medium finding.
- proof 4: met — Mutation: removed the id tie-break from oldestFirst at scripts/lib/taskStore.ts:614, leaving
 `seqRank(a.seq) - seqRank(b.seq)`. KILLED by scripts/lib/orderIndependence.test.ts > order independence:
 every Task[] ordering function in scripts/lib > "fixNowQueue", 1 failed of 6, re-measured at its own file.
 The fixture is the thing the clause is about: base now builds five records where the first three share
 seq 1, so reversing the array can change the answer of a non-total comparator; before this branch every
 record had a distinct seq and the property was true of data the store does not contain. All four sort
 sites (fixNowQueue, unreviewedQueue, listQueue, nearMatches) plus producers.priorArt route through
 oldestFirst. No printed order moved: saveStore writes id-sorted, loadStore preserves file order, and V8's
 sort is stable, so a store read from disk already broke ties by id.
- proof 5: met — Two mutations, both KILLED at scripts/tasks/cliFixtures.test.ts, 1 failed of 12 each,
 re-measured at their own file. (a) deleted `if (tokens[i].prose) continue;` at scripts/tasks/cli.ts:86 —
 killed by "refuses a flag its usage only mentions in prose, and stops offering it on the refusal path".
 (b) deleted the repeated-value error at scripts/tasks/cli.ts:158 — killed by "refuses a flag given twice
 rather than answering from the last value". Swept over the live registry: for all 41 registered verbs the
 only `--word`s the usage text mentions but the vocabulary refuses are list/--trigger, decline/--triggered
 and decision/--op, which are exactly the three the clause names, and every usage string's parentheses
 balance. The boundary is fragile in two directions the sweep test in scripts/tasks.test.ts cannot see —
 filed as a medium finding — but nothing in the tree today is on the wrong side of it.
- proof 6: met — Mutation: disabled the guard at scripts/tasks/records.ts:93 (`if (false && given ===
 'commitment' && !claimHolds(task))`). KILLED by scripts/tasks/records.test.ts > a record that declares its
 grant kind > "refuses a commitment on a record nobody has taken, at add and at edit alike", 1 failed of
 122, re-measured at its own file. Reproduced through the real CLI: `tasks edit <id> --grant commitment` on
 an open record and on an unreviewed record both exit 1 naming `tasks start <id> --actor <you>`, and the
 grant stays `forecast`. Second half: mutating `collapseClosed`/the plan grading is c8's target, and the
 grading-above-the-wall behaviour is held by scripts/tasks/architectureCmds.test.ts > setting --writes
 grades the dispatch set the record belongs to > "reports the collision the corrected grant creates, above
 the prior-art wall", which asserts the [defect] line's index is less than the prior-art wall's. One
 loophole, filed low: a record closed straight from `open` was never started and accepts the word.
- proof 7: met — Mutation: emptied the ungranted set at scripts/tasks/records.ts:141 (`const wrote: string[] =
 []`). KILLED by scripts/tasks/records.test.ts > tasks CLI > "done --commit reports the grant against what
 that commit actually changed", 1 failed of 122, re-measured at its own file. Both directions are asserted
 by that test (`wrote, ungranted: src/ui/panel.ts` and `granted, untouched: src/runtime/never.ts`), and the
 agreement case by "done --commit says so when the grant and the diff agree, which is the measurement
 either way". The single-commit fact it needs is new on the seam and proved separately:
 scripts/lib/git.test.ts > "changedIn carries one commit against its parent, and answers null for a
 revision git cannot resolve", against a real repository. A commit git cannot read degrades to a printed
 note rather than a wrong comparison.
- proof 8: met — Mutation: forced `collapseClosed: false` at scripts/tasks/architectureCmds.ts:311. KILLED by
 scripts/tasks/architectureCmds.test.ts > tasks where > "where collapses closed claims for a directory and
 keeps them for one file", 1 failed of 44, re-measured at its own file. That test holds both halves — the
 directory query hides `[done] old-saves` and prints the count, the single-file query still prints it.
 Against the real store, `npm run tasks -- where scripts/lib` prints 276 lines with
 `102 closed claim(s) not listed`. The survey workflow step 1 runs is the same code path:
 scripts/tasks/planPrompt.ts:56 calls printWhere per target.
- proof 9: met — Mutation: neutered the failure condition at scripts/tasks/doctor.ts:114 (`if (dangling > 99)`).
 KILLED by scripts/tasks/doctor.test.ts > tasks CLI > "doctor exits non-zero on a reference that resolves
 to nothing, which is the one thing about the store a machine can check", 1 failed of 22, re-measured at
 its own file. The five conditions are classified `dangling` in checkStore and each has its own assertion
 in scripts/lib/taskStore.test.ts (duplicate id, unresolved requires, system not in systems.json, spec with
 no file, dependency cycle). Still-reporting half: "doctor reports a record disagreeing with itself and
 still exits zero" asserts exit 0 on `[error] a is declined but has no reason`. On the live store
 `merge-ready` prints `0 dangling reference(s), 0 error(s), 14 warning(s)` and the doctor leg passes, so the
 CI leg is green today and is a real check the first time a reference breaks.
- proof 10: met — Two mutations. (a) removed `!CLOSING_STATES.includes(task.state) &&` from checkStore at
 scripts/lib/taskStore.ts:939 — KILLED by scripts/tasks/doctor.test.ts > tasks CLI > "a closed record keeps
 its spec slug after the spec file is deleted, so a finished spec can retire", 1 failed of 22, re-measured
 at its own file; that test also asserts `tasks show` still prints `spec: demo-spec`. (b) forced the
 unknown-spec refusal at scripts/tasks/specCmds.ts:280 (`if (true)`) — KILLED by the same file's "a live
 record naming a spec with no file is a dangling reference, and `spec remove` detaches it without the
 file". The typo case still refuses: the refusal stands when every named id belongs to some other spec.
 One record for the next pass: the clause's declared proof target is scripts/lib/taskStore.test.ts, and it
 does not hold this. I ran mutation (a) scoped to that file alone; it survived there and only died when the
 run escalated to the whole suite, attributed to doctor.test.ts. Filed low.
