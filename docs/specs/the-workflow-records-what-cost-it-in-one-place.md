# the-workflow-records-what-cost-it-in-one-place

## Deliverable

One channel for recording what working the process cost, one query over it, and nothing keeping a
parallel copy. Today there are three. `.planning/agent-feedback/tool-friction.md` is 866 lines of
dated prose that `audit.ts` step 8 instructs every auditor to append to, outside the store,
unqueryable and unclassified. The event log carries the same facts as `note` and `decision` prose
with the class inside the sentence. Task records carry the third slice, the part someone judged
worth fixing. An agent picks between them at the moment it is least able to classify, and a planner
has to remember three queries.

**The measurement that settles this is in the file itself.** The largest single repeated cost of the
2026-08-06 orchestrated run — a mutation manifest that never generates, because `proof: vitest
<file>` names a file where `mutationManifest` needs a test — appears in eight separate pass entries
at roughly ten minutes each, and has no record. Meanwhile `audit-prompt`'s wrong WARNING, hit
exactly once, is filed high and will be fixed. Not because it is worse; because it landed somewhere
that counts. Prose does not aggregate, so the friction that recurs is exactly the friction that
stays invisible, and the ranking the backlog presents to a planner is upside down.

The channel classifies on **two orthogonal axes**, because "what should we fix in the tooling" and
"how should we plan differently" are different questions with different answers. **Fault** — the
tooling, the contract, or nobody — decides which question a record feeds. **Blocking** decides
whether dispatch halts, and is mechanical rather than editorial. A record whose fault is *nobody*,
because the knowledge did not exist when the spec was written, is **not a defect and must never be
counted as one**: counting it creates pressure to write specs that pretend to know what they cannot.

Blocking is also this branch's answer to the run's own c3, which is the sharpest evidence it has.
That clause promised no design question would be settled mid-branch, and it failed because the
orchestrator's only alternatives at 17:57Z were to rule or to stall a blocked worker until a
planning session nobody had scheduled. Any orchestrator takes the first. The clause is unreachable
until a blocking question has a third route, and that route is the point of the blocking axis: file
it, let it halt only what depends on it, and carry on with everything that does not.

Third element: a record may name the **lesson it breaches**. That turns "how many defects" into
"which lesson is not landing", which is the actionable form — a lesson breached repeatedly is badly
worded, in the wrong brief, or wrong, and each is fixable by editing one line. The information
mostly exists already, since an auditor finding a test that cannot fail *is* a breach of a worker
lesson and a fix-the-neighbour instance *is* a breach of an auditor lesson; only the pointer is
missing. It is paired with a checked-and-clean marker, because zero breaches is otherwise ambiguous
between the lesson working and nobody looking.

None of it gates. Counting breaches while penalising them creates pressure not to report them, which
costs the only honest signal there is.

Proof:

- [c1] There is one place. Every route by which any agent reports what the workflow cost lands in
  the store, and one query answers over all of them. `.planning/agent-feedback/tool-friction.md` is
  deleted, and no generated brief instructs anyone to write process feedback anywhere but the
  channel. The invariant, of which the markdown file is one instance and not the extent: nothing the
  tooling generates may direct a report outside the store.
  proof: npm run tasks -- friction
- [c2] A record carries its fault, and fault is exactly one of tooling, contract or nobody. The
  value is required at the point the record is assembled, on every write route that can create one,
  rather than checked where a reader happens to look for it — so no route can produce a record the
  query has to guess about.
  proof: vitest scripts/tasks/friction.test.ts
- [c3] Blocking is derived, never stored. Whether a record halts work is answered by the same
  `requires`/`isBlocked` machinery every other record uses, so a friction record cannot disagree
  with the dispatch it is supposed to control. A stored blocking flag and a derived one are two
  answers to one question, which is the defect this clause exists to refuse.
  proof: vitest scripts/tasks/friction.test.ts
- [c4] **A question reaches its decider.** Every mechanism below serves that one property, and a
  reader grading this clause grades the property — the list is how it is reached today, never its
  extent. An agent can file a question against the record it is working and address it to the role
  whose decision would hold; exactly what depends on it halts while the rest proceeds; answering or
  dismissing it releases the hold; and **the addressee changes what the tooling does with it**, so
  that a question addressed away from the worker is never handed back to one as work to implement.
  A recorded decider that routes nothing is a label, and a question parked behind a label is a stall
  with extra steps. Amended 2026-08-06 after an audit graded the enumeration and not the property;
  the original text mixed the two, which is the error `PLANNER_LESSONS` names first.
  Owned by two slices, and outstanding until both land. Recorded as the remedy for
  `run-an-orchestrator-over-three-parallel-tasks` c3 — deferred out of that spec, still unmet, and
  this clause's real acceptance test.
  proof: vitest scripts/tasks/friction.test.ts
- [c5] Fault `nobody` is never counted as a defect, and **absence of a fault is never read as one**.
  The query reports `nobody`, because a question nobody could have answered is real information about
  where knowledge was missing, and excludes it from every count and rate presented as a defect
  measure. Reporting and counting are different acts and this clause turns on the difference. A
  record predating the field is reported in its own **unclassified** bucket and excluded from those
  same rates — never folded into `nobody`, which would look like a small convenience and would empty
  the value of the meaning the whole axis depends on. Unclassified is a reported category, not a
  fourth fault: fault stays exactly tooling, contract or nobody, and absence stays absence. They are
  not backfilled — 76 live records carry no fault, the number falls as they close, and guessing one
  for a record whose author is gone is how `nobody` becomes the catch-all.
  proof: vitest scripts/tasks/friction.test.ts
- [c6] A record may name the lesson it breaches, by a handle that survives editing the lesson's own
  prose. Renaming or rewording an instruction must not orphan the records that cite it, and a
  citation naming no live lesson is reported rather than silently dropped.
  proof: vitest scripts/tasks/briefLessons.test.ts
- [c7] Zero breaches is readable. A lesson that was checked and found clean is distinguishable in
  the query's output from a lesson nobody looked at, and the distinction is recorded by whoever
  looked rather than inferred from an absence.
  proof: npm run tasks -- friction
- [c8] Every count is presented with the denominator it is a rate over, drawn from events the log
  already carries rather than from a new tally anyone has to maintain. A bare count cannot answer
  "how well is the system working", and a denominator that is itself hand-kept is a second thing to
  drift.
  proof: npm run tasks -- friction
- [c9] Nothing gates on any of it. No leg of `merge-ready`, no CI check and no command's exit code
  reads a fault, a breach or a count. The channel is a report and refuses to become a threshold.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c10] **A recurrence is a new observation, never an edit.** Recording that a friction happened
  again appends an occurrence that carries its own note and names the record it recurs on; nothing
  is incremented and no description is overwritten, so the count is derived from the occurrences and
  cannot disagree with them. Two reasons, both already written down here. `.gitattributes` keeps the
  store out of `merge=union` because two branches editing one record silently keep both copies under
  one id — and a counter is a field concurrent branches edit by construction, whose correct
  resolution is to add the two sides, which git cannot compute. And one description overwritten N
  times loses what N observations each said: the nine mutation-manifest instances differed by spec,
  by pass, and by what each cost. **Owned by two slices — the append and the derivation — and
  outstanding until both land.**
  proof: vitest scripts/tasks/friction.test.ts
- [c11] **Filing a record shows what already claims the path it names, and never refuses.** The
  prompt is by path and never by title, because a path is the same string for everyone while a title
  is authored prose two agents will not choose alike — `priorArt` already reads every record's
  `writes` and `files` in every state, so this is wiring, not a new query. Attaching an occurrence to
  an existing record is available and deliberate; filing a new record stays the cheap default. That
  asymmetry is the clause, not a preference: a duplicate is visible and cheap to triage, while a
  wrong merge makes a distinct defect vanish and the count lie, so the tool must never make the
  merge the path of least resistance — least of all for an agent that has just hit the friction and
  is the worst placed to classify it.
  proof: vitest scripts/tasks/friction.test.ts

- [c12] **A lesson that keeps costing something surfaces as work for a planner, and nothing in the
  tooling ever elevates it.** No count is compared to anything, anywhere in any code path. The
  breach records are the flag: they dedupe by c11 and accumulate by c10, so one lesson holds one
  record with N occurrences, and a planner reading N decides. The number is a reading aid for a
  human and never a rule — a stated threshold has been the wrong instrument four times in this
  repository inside one day, and a raw breach count is confounded by attention besides, which is why
  c8's denominator is per-lesson and c7's marker is where it comes from. Written as a refusal
  because the reasonable-sounding alternative is one `if` statement away and would look like
  tidying.
  proof: vitest scripts/tasks/friction.test.ts
- [c13] **A lesson can be retired, and the retirement is recorded.** Removing an instruction is an
  operation that says what left and why, not a deletion from an array — the same shape, one table
  over, as a record leaving the store with nothing able to say that it did. Its citations become
  reportable rather than silently resolving to nothing, which is c6's second half arriving at the
  case that motivates it.
  proof: vitest scripts/tasks/briefLessons.test.ts

## Goal

Make what the workflow costs countable in one place, so a fresh orchestrator inherits it instead of
re-deriving it.

## Decisions

- **The channel is the store, not the event log, and the event log's `note` field is not touched.**
  The 2026-08-06T13:37:57Z ruling measured 1322 events and settled that `note` stays prose: 72% of
  notes render a sentence from facts the event already has, structuring them buys nothing because
  the log is append-only and merges by union, and it would cost the two readers that search note
  text across every op (`eventLog.ts` for `tasks log <text>`, `producers.ts` for prior-art
  discovery). That ruling is a stop for the obvious design, not a data point to work around. The
  event log keeps answering *when something happened and who did it*; the store answers *what it
  cost and what is at fault*, because the store is where a record already has state, severity,
  `requires` and a triage queue — every mechanism the blocking axis needs.
- **Blocking is not a field.** `isBlocked` is `waitingOn().length > 0` and `requirementStates`
  releases on both `done` and `declined`, so a record named in a member's `requires` already halts
  dispatch and answering or dismissing it already unblocks. Adding a flag would create a second
  answer to a question the store answers, and the two would disagree the first time someone closed
  one without the other. This is why c3 is written as a refusal rather than a feature.
- **The `question` kind comes alive rather than a new kind being added.** `Kind` already declares
  `question`, `KINDS` includes it, `tasks add` accepts it, and zero records use it — a declared noun
  with no behaviour. A blocking question is exactly what it was declared for, and taking it over
  costs nothing a new kind would not cost twice.
- **Fault is a field; the four-class list it replaces is retired.** `run-an-orchestrator-over-three-
  parallel-tasks` named four classes — spec defect, design question, tool friction, silent guess —
  and its own audit graded c2 unmet because the run's log drifted off that list mid-run onto the two
  axes. That drift is the diagnosis, not the accident: the four classes enumerated instances where
  two orthogonal properties were wanted, which is the same error that produced both of the run's
  recorded spec defects. Fault and blocking are properties; the four classes were points in their
  cross product, and three of the four collapse into (fault, blocking) pairs while the fourth,
  silent guess, is not a class of friction at all but a thing an auditor hunts.
- **This branch retires `.planning/agent-feedback/tool-friction.md` and does not migrate it.** The
  file is treated the way a merged spec is treated: history, once its lessons are extracted. Its 866
  lines are pass-by-pass narrative whose value is in about five recurring frictions, and those are
  filed as records by this branch's planning rather than converted wholesale — a prose archive
  rewritten into structured records is a third copy of everything, which is what the branch exists
  to stop. Git holds every word.
- **Decision placement, not attention scarcity — and it is why c4 has an addressee.** The question
  this workflow answers for every decision is who decides it most durably. The author's time being
  scarce is true and is a consequence, not the principle. A mechanical decision belongs to the
  worker that just read the code, because routing it upward makes it both worse and slower; a
  planning decision belongs to the planner-and-author pairing, because that pairing has the best
  model of what is coming and its decisions are least likely to be rewritten. **The test is
  durability: a decision made in the wrong place gets re-decided, and the re-decision is the cost.**
  That measures whether the placement was right, where counting author interruptions only measures
  whether the author was disturbed. `run-an-orchestrator-over-three-parallel-tasks` c3 is therefore
  wrong as written and not merely unmet — "the orchestrator does not adjudicate" is a blanket
  prohibition where a placement question was wanted, which is the same error as enumerating four
  classes where two axes were wanted. Its own log carries the evidence, read the wrong way at the
  time: the pass-1 spec-ownership ruling re-ruled at pass 2 ("I named a threshold where the case
  wanted an invariant"), the c2 correction that named a dead-code site, and fix-the-neighbour three
  for three. Every one is a decision that did not hold, and every one was made mid-run rather than
  in planning. This branch does not build re-decision tracking; it makes the addressee recordable,
  which is what any later measurement of durability would have to read.
- **It reports, and the reporting is the product.** No gate, no threshold, no exit code. This is
  recorded as a clause (c9) rather than left as intent, because every previous measurement added
  here grew a gate within two branches, and CLAUDE.md's own account of the retired comment budget is
  the standing evidence for what that costs.

## Open questions

- Whether `friction` is its own verb or a mode of `tasks list`. Both answer c1; the query's shape is
  a worker's call once it has read how `listQueue` and `unreviewedQueue` already compose, and the
  clause deliberately names the answer rather than the command.
- What the lesson handle actually is — an added id field on `Lesson`, or the array name plus an
  index. Delegated: the invariant c6 states is that it survives rewording, and the worker that reads
  `briefLessons.ts` and its nineteen hardcoded per-instruction assertions is better placed to choose
  than this session is.
- Which denominators c8 presents. `start` events are the honest proxy for dispatches (a
  `work-prompt` is a read and leaves no event), `audit` events count passes and `spec-done` counts
  specs closed — all already in the log. Whether all three or a subset is the worker's call.
- Whether the checked-and-clean marker of c7 is an event op or a record field. Adding to `EVENT_OPS`
  has precedent (`spec-defer`), and this is the one place the event log is a plausible home, since
  "who looked, when" is exactly what it answers well.

## Audit passes

### Pass 1 — 2026-08-07

- base: `ea6262fada438d58a821ed0d43786fba52deac4f`
- head: `2505bacf323ca85fb9e3756e90af3de42685a6b2`
- proof 1: unknown — Not looked at, because there is nothing yet to look at. The member task that
owns this clause, one-query-over-the-channel-and-the-second-place-retired, is open and BLOCKED.
There is no `friction` verb (no scripts/tasks/friction.ts, no scripts/lib/friction*), and
.planning/agent-feedback/tool-friction.md is still present at 65241 bytes. Recording unmet here
would claim a verification nobody performed.
- proof 2: unknown — Not looked at. No fault field exists on any record; scripts/lib carries no
`fault` and no `breach`. Owned by a-record-carries-its-fault-and-a-question-blocks-only-what-d,
which is open.
- proof 3: unknown — Not looked at. The named proof, scripts/tasks/friction.test.ts, does not exist.
Owned by a-record-carries-its-fault-and-a-question-blocks-only-what-d, which is open.
- proof 4: unknown — Not looked at. No blocking-question route exists yet; the `question` kind the
spec's Decisions section takes over still has zero records. Owned by
a-record-carries-its-fault-and-a-question-blocks-only-what-d, which is open.
- proof 5: unknown — Not looked at. There is no query to report or count anything, so there is nothing
that could include or exclude fault `nobody`.
- proof 6: met — Delivered by a-lesson-has-a-handle-that-survives-rewording-it, as an explicit `id`
field on `Lesson` — the choice recorded as a decision against the record, with the reasoning that
array-name-plus-index makes this clause's second half unimplementable rather than awkward, since
after a reorder a stale citation still resolves to a different lesson. Re-derived rather than
confirmed: I built my own fifteen-entry manifest aimed at every line the clause is about, not at
the two survivors the worker reports fixing. Re-run it with
`npm run mutate -- <manifest>` over scripts/tasks/briefLessons.ts. 13 killed, 2 survived, 0 errored.
Both halves of the clause are pinned by mutations that die:
lh-index-keys-on-prose (index.set keyed on lesson.title instead of lesson.id) KILLED 6;
lh-an-id-silently-reworded ('auditor/next-neighbour' to 'auditor/next-neighbor', which is the
orphaning event itself) KILLED 4 — nothing but the literal id lists held outside the arrays at
briefLessons.test.ts:11-14 can catch that, and they do;
lh-find-falls-back-to-a-suffix KILLED 3 and lh-find-normalises-case KILLED 2, so a dead citation
cannot resolve to whatever is nearest;
lh-unknown-reports-nothing KILLED 3, lh-unknown-decides-liveness-by-prefix KILLED 1 and
lh-unknown-loses-dedupe KILLED 1, so the reporting half is real;
lh-index-snapshot-narrowed KILLED 3, lh-all-lessons-drops-a-brief KILLED 4,
lh-duplicate-refusal-removed KILLED 1;
lh-printed-handle-derived-from-prose KILLED 4 and lh-brief-stops-printing-the-handle KILLED 4,
which covers the third place the handle is computed — the bracket an agent actually reads and would
cite. The two survivors are one boundary the clause does not turn on, filed as a finding below
rather than graded against this clause: citation matching is pinned exact against case,
truncation, suffix and prefix, and unpinned against whitespace and the empty string.
- proof 7: unknown — Not looked at. No checked-and-clean marker exists in either candidate home — no new
EVENT_OPS entry and no record field — and there is no query whose output the distinction could be
readable in.
- proof 8: unknown — Not looked at. No count is presented anywhere yet, so no denominator can accompany one.
- proof 9: unknown — Not looked at as the clause is written. Nothing in this branch reads a fault, a
breach or a count, but that is vacuous rather than verified: none of the three exists. Grading it
met on an absent subject would be an assertion that cannot be false while the feature is missing,
which is the shape this repository's own auditor lesson refuses. Noted for the pass that grades it
for real: `merge-ready` gained no leg here, and the module-load refusal filed below is not a
threshold over a fault, a breach or a count — the worker's recorded argument on that point is right.

### Pass 2 — 2026-08-07

- base: `405eb154b5b8e0c643acd129b0f9e062f38cb88e`
- head: `e9218fddf52d20923eb9c010271f2a11b58ed05e`
- proof 1: unknown
- proof 2: met — Every route that constructs a Task now goes through createTask (scripts/lib/taskStore.ts:325);
grep -rn "createTask" over scripts/ returns exactly five call sites (audit.ts:61 import, audit.ts:948
buildFindingTask, audit.ts:1131 undelivered, records.ts:180 add, records.ts:259 question) and no
": Task = {" literal survives outside test fixtures. Its NewRecord union makes fault a compile-time
requirement of the finding and question arms, and Draft omits fault and decider, so a route cannot
assemble a reporting record without one and cannot override it through the draft either. Seven
mutations aimed at the four write routes and their shared resolver were all KILLED by
scripts/tasks/friction.test.ts, each by the named test that owns it: taskStore.ts
"if (!reportsCost(kind)) return { value: null };" to "if (true) ..." kills "add refuses a finding with
no fault"; REPORTING_KINDS to ['finding'] kills "question refuses with no fault"; "!FAULTS.includes(given
as Fault)" to "false" kills "add records each of the three faults"; "if (!reportsCost(kind)) return
{ error:" to "if (false) ..." kills "add refuses a fault on a plain task"; createTask's
"fault: record.fault ?? null," to "fault: null," kills four tests at once; audit.ts
"finding.fault ?? undefined" to "finding.fault ?? 'tooling'" kills "an audit pass refuses a finding with
no fault"; audit.ts cmdImport's "resolveFault('finding', args.flags.fault)" defaulted to 'tooling' kills
"import refuses a legacy document with no fault". Scope call, recorded on purpose: the clause says "a
record" without qualifying the kind, and the implementation restricts fault to finding and question. I
grade the clause loose rather than the implementation wrong, because c5 requires "nobody" to mean "the
knowledge did not exist"; stamping the store's 148 tasks and 34 undelivered records with a fault would
make "nobody" the modal value and empty it, so reading c2 as all four kinds puts it in direct conflict
with c5. The clause's own purpose sentence names the query as the beneficiary, and only finding and
question feed it. What the route guard does not reach is filed separately: 470 of the 471 reporting-kind
records in the store carry fault null today.
- proof 3: met — No field was added that stores a hold: the diff on scripts/lib/taskStore.ts adds fault and
decider and nothing block-shaped, cmdQuestion writes the question's id into each blocked record's
"requires" and nothing else, and release is cmdDone/cmdDecline moving the question to a closing state
with requirementStates already reading both. I re-derived the byte-identity proof rather than accepting
it, by aiming the attack the clause invites - can the assertion pass while something else stores the
release. It cannot, on three independent mutations, all KILLED against
scripts/tasks/friction.test.ts "a released record is byte-identical to the held one": (1) make the
release stored, by inserting into reportReleasedHolds (scripts/tasks/records.ts:790) the line
"for (const candidate of held) candidate.requires = candidate.requires.filter((requirement) =>
requirement !== task.id);" before its "if (held.length === 0) return;" - the held record's stored line
then differs after close and the assertion reddens, which is the load-bearing claim; (2) move the hold
off requires onto the question, by replacing "for (const task of held) task.requires.push(id);" with
"question.extra = { blocks: held.map((task) => task.id) };" - the BLOCKED assertion in the same test
reddens; (3) stop deriving, by replacing isBlocked's "return waitingOn(task, byId).length > 0;" with
"return false;" - same test reddens. The third test in the describe block independently asserts the
stored record carries no key matching /block|halt|held|waiting/ and that requires equals the question's
id, so the byte assertion is not carrying the clause alone.
- proof 4: met — Every operative promise the clause enumerates is reachable and proven. Filed against the
records it works: "tasks question <title> --blocks id1,id2" (scripts/tasks/records.ts:214). Addressed: the
decider flag is refused when absent and when outside worker|planner|author; mutating resolveDecider's
"if (kind !== 'question') return { value: null };" to "if (true) ..." is KILLED by "refuses a question
with no decider". Named where dispatch reads: the id lands in each blocked record's requires, so
isBlocked, next, plan and roadmap all see it with no new mechanism; mutating sharedSpec's
"return specs.size === 1 ? [...specs][0] : null;" to "return null;" is KILLED by "files a question
against the record it is working", and dropping render.ts's decider segment is KILLED by "halts exactly
what depends on it while the rest of the spec proceeds". Halts exactly what depends on it: reproduced
outside the suite against a scratch store - two high members of one spec, a question blocking one, and
"tasks next" returns the free one while the held one shows BLOCKED; after the free one closes, next
returns the question itself. Releases on both closes: "tasks done" and "tasks decline" each print
"released 1 record(s)" and the held record leaves BLOCKED, and the closed-record guard
("if (CLOSING_STATES.includes(task.state))" to "if (false)") is KILLED by "holds several records at once,
and refuses to hold a closed one". Recorded against the clause's own sharper sentence, that the addressee
is the point rather than a label on it: today it is a label. Nothing but render.ts:62 reads
Task.decider, and "tasks work-prompt <question-id>" prints a full worker implementation brief ("You are
implementing <id>", correct your write grant, register what it produces, commit after each logical
chunk) for a question addressed to the author. I grade the clause met because each promise it states is
discharged and mutation-proven, and file the routing gap high rather than reading it into the verdict.
- proof 5: unknown
- proof 6: unknown
- proof 7: unknown
- proof 8: unknown
- proof 9: unknown

### Pass 3 — 2026-08-08

- base: `9f5f4ddaaa307b18abc3c3214acc6fcea758ef65`
- head: `a6d7d92bf9a540f97bc81122ced5510f96a8b4e4`
- proof 1: unmet — Three of the clause's four sentences hold; its first and plainest one does not. Holding:
`.planning/agent-feedback/tool-friction.md` is gone (`git show 9f5f4dd:.planning/agent-feedback/tool-friction.md
| wc -l` is 1660, `ls .planning/agent-feedback/` at HEAD does not list it). `npm run tasks -- friction`
is one query and answers over the whole channel — live on the real store it reports 603 reporting
records across four buckets, 0 recurrences, and 20 lessons. And the generated-brief invariant is real
rather than asserted: mutation `c1-a-generated-brief-names-a-second-place` reinserted
`.planning/agent-feedback/tool-friction.md` into `auditPrompt.ts`'s step 8 (the exact line the spec's
Deliverable says used to carry it) and was KILLED by `scripts/tasks/auditPrompt.test.ts > ... makes
filing what the audit cost a numbered step, and sends it to the channel rather than a markdown file`,
re-run at its own file with the mutation still applied and failing there too. Note for the next pass:
the guard the branch wrote for this at `friction.test.ts:738` loops over work-prompt, plan-prompt and
orchestrate-prompt only — audit-prompt, the brief that historically named the file, is caught by a
different test in a different file, so the coverage is real but not where the clause's own test claims it.
What fails is "There is one place": `.planning/agent-feedback/audit-tooling-friction.md` is still
tracked (`git ls-files .planning/` lists it, 26 lines), still sits in the directory this branch retired,
and is still a prose channel for exactly what the store now holds — its own header says entries record
"what was reached for instead", "what it cost", and accumulate so a reader can "see which gaps keep
recurring across independent passes", which is verbatim the aggregation argument the spec's Deliverable
makes for replacing prose with records. Nothing directs an agent there, so the harm is a rotting
parallel copy rather than an active second route; but the clause says the markdown file is "one instance
and not the extent", which widens the promise past the named file rather than capping it at it, and the
branch's own guard is titled `has no tracked file left under the retired feedback directory` while
asserting only about `tool-friction.md`. Re-run: `git ls-files .planning/agent-feedback/`. One line
either way closes this — delete the file, or record it as history in its own header the way the spec
records tool-friction.md.
- proof 2: unknown
- proof 3: unknown
- proof 4: unknown
- proof 5: unmet — The rate section is right and mutation-proven; the exclusion the query prints is broader
than the exclusion it performs, and the gap lands on the axis this clause exists to protect. Proven
right: `printRates` (friction.ts:63-68) counts only `DEFECT_FAULTS = ['tooling','contract']`, and both
attacks on it die — `c5-nobody-counted-as-a-defect` (DEFECT_FAULTS widened to include 'nobody') and
`c5-absence-folded-into-nobody` (`bucketOf`'s `?? 'unclassified'` changed to `?? 'nobody'`, the one
substitution the clause names as the small convenience that would empty the axis) are each KILLED by
`friction.test.ts > c1, c5, c7, c8, c10, c12: one query over the channel > reports nobody and
unclassified, and counts neither as a defect`, both re-run at that file with the mutation still applied.
What fails: `BUCKET_NOTE` (friction.ts:28-33) prints "Reported, and counted in nothing below" for
`nobody` and "Counted in nothing below" for `unclassified`, and both are then counted below. Reproduced
live on an isolated store — `npm run tasks -- add "nobody could have known this lesson applied" --id
nobody-breach --kind finding --fault nobody --severity low --deliverable "record it" --breaches
worker/mutation-proof --store <scratch>` then `tasks recur nobody-breach --note "..."` then `tasks
friction --store <scratch>` prints, in one run: `nobody 1 record(s) ... Reported, and counted in nothing
below`, then `1 recurrence(s) recorded against 1 record(s)`, then `worker/mutation-proof  1 record(s),
1 further occurrence(s) — nobody-breach`. The nobody-fault record and its occurrence are counted twice
below the line that says they are counted in nothing. `printByLesson` (friction.ts:112-113) filters on
`task.breaches.includes(lesson.id)` over every reporting record with no fault filter at all, and
`printOccurrences` (friction.ts:88) totals occurrences the same way, so an `unclassified` record carrying
occurrences reaches the same two counts by the same code path. This is not a mislabelled line only: the
spec's own Deliverable says the breach axis "turns 'how many defects' into 'which lesson is not landing',
which is the actionable form", so the per-lesson section is the defect reading restated, and c5's
sentence is that `nobody` is excluded from every count presented as a defect measure. Graded unmet
rather than deferred because the harm the spec states for getting this wrong — "counting it creates
pressure to write specs that pretend to know what they cannot" — is the reason the axis exists, and the
fix is small: filter both sections the way `printRates` already does, or narrow the printed promise to
name the one section it is true of.
- proof 6: unknown
- proof 7: met — Live and re-runnable on an isolated store, then attacked from both directions. Before any
check, `npm run tasks -- friction --store <scratch>` prints all 20 live lessons as `0 record(s), 0
further occurrence(s) — nobody has looked`; after `npm run tasks -- checked auditor/next-neighbour --note
"hunted the neighbour on every clause this pass" --actor auditor-pass3 --store <scratch>`, that
one line reads `checked clean 2026-08-08 by auditor-pass3: hunted the neighbour on every clause this
pass` and the other 19 still read `nobody has looked`. The same holds on the real store today: all 20
read `nobody has looked`, so the marker is not vacuously satisfied by pre-existing data. The
distinction is recorded by whoever looked rather than inferred — it is a `checked` event carrying `by`
and `note`, not a derived absence (`recordEvents(config, 'checked', ...)` at friction.ts:169), and
`cmdChecked` refuses a handle no live lesson answers to (`no live lesson has the handle ...`), so a
check cannot mark a lesson that does not exist. Two mutations, both KILLED by `friction.test.ts > ... >
distinguishes a lesson checked and found clean from one nobody looked at`, each re-run at its own file
with the mutation still applied: `c7-a-recorded-check-reads-as-nobody-looked` (`lastCheck` returns
`undefined`, collapsing checked-clean back into the absence) and `c7-a-check-marks-every-lesson-clean`
(dropping `id: lessonId` from the `checked` filter, so one check anywhere marks all twenty). The second
matters more than the first: it is the failure that would look like the feature working. Two boundaries
checked and not graded against the clause: `--actor` is optional, so a check can be recorded anonymously
and prints `(unnamed)` (already filed as task-system-2026-08-08-m13, "nearly half of all recorded
history is anonymous"), and `lastCheck` takes the last-appended rather than the latest-dated event,
which two branches merging by union could reorder. Neither is what the clause turns on.
- proof 8: unmet — Every count does arrive beside a denominator, and no denominator is a hand-kept tally —
but one of the three denominators is not the quantity it is labelled as, and the count is inside it, so
the rate it presents cannot mean what it says. Measured on the real store: `npm run tasks -- friction`
prints `57 against 299 audit passes (audit events) — 19 per 100`. There are not 299 audit passes.
`grep -c '"op":"audit"' docs/events.jsonl` is 299; `grep '"op":"audit"' docs/events.jsonl | grep -c
'"id":null'` is 72, and `grep '"op":"audit"' docs/events.jsonl | grep -vc '"id":null'` is 227. `tasks
audit` emits one `audit` event for the pass (`audit.ts:553-556`, `id: null`) plus one per finding the
pass filed, and the findings-only route emits one per finding with no pass event at all
(`audit.ts:414`). So the denominator is 4x the quantity it names, and — worse — the 227 finding events
are the same findings the numerator counts, so filing a defect-fault finding increments both sides of
its own rate. Reproduced from empty: one `tasks audit demo-spec --proof ... --finding ...` on an
isolated store produced `2 audit passes (audit events)` and the query printed `2 against 2 audit passes
— 100 per 100` after one pass. Nothing in the suite pins this: mutation
`c8-audit-denominator-counts-only-real-passes`, which *corrects* the denominator to
`.filter((event) => event.id === null)`, SURVIVED at every scope up to the whole suite (0 failed of
2040) — the right answer and the wrong one are indistinguishable to the tests. The other two
denominators are sound and pinned: `c8-a-bare-count-with-no-denominator` (the rate loop replaced by a
bare count) and `c8-dispatch-denominator-drawn-from-the-wrong-op` (`start` swapped for `add`) are each
KILLED by `friction.test.ts > ... > presents every count beside the denominator it is a rate over,
drawn from the log`, re-run at that file with the mutation applied. The fix is the filter the surviving
mutation already spells, plus a test that asserts the number rather than only its presence; the clause
is a promise about what a denominator *is*, and a denominator containing its own numerator is the one
shape a rate must not have.
- proof 9: met — Graded by exhaustive search rather than by mutation, because a refusal is not proven by
breaking a line, and treated as a live risk rather than a formality. What I searched, all re-runnable:
(1) every non-test read of `fault` in `scripts/` (`grep -rn "fault" --include=*.ts scripts/ | grep -v
'\.test\.ts'`) — 40-odd hits, every one of them schema (`taskStore.ts:69,204,257-258,285,324,359-361,
385`), assembly (`records.ts:185-189,252,427-470,515-581`, `audit.ts:33-56,208-213,324,354-360`),
display (`render.ts:84`) or a usage string. Nothing branches on a fault's *value* to decide an outcome.
(2) every non-test read of `breaches` — schema, assembly, `render.ts:91`, `friction.ts:112,119` and
`records.ts:170` `reportUnknownBreaches`, which prints and returns and is explicitly not a doctor
condition. (3) every non-test read of the `recur` and `checked` ops — `EVENT_OPS`, `friction.ts:102,80`
and `records.ts:332-334`; nothing else in the repo reads either. (4) every leg of the gate:
`LEGS` (mergeReady.ts:20-26) is tsc, npm test, layer-check, audit-status, doctor — none of them the
friction query — plus the bytes, tree, base, spec and clauses legs, and `grep -n "\.fault\|\.breaches\|
'recur'\|'checked'\|friction" scripts/tasks/mergeReady.ts` is empty. (5) every CI step in
`.github/workflows/test.yml`: tsc, npm test, layer-check, audit-status, doctor, `spec show`, `plan` —
none names the channel, and `doctor`'s two exit conditions are an unparseable store line and a dangling
reference (doctor.ts:129-136), neither of which reads a fault or a breach. (6) `checkPlan`, which CI
runs through `tasks plan` — no fault, no breach, no occurrence read. The live gate agrees: `npm run
tasks -- merge-ready` reports `doctor ok pass — 15 warning(s) reported above, which do not fail this
leg`. Boundary stated rather than left as an exclusion list, because the clause read literally
contradicts c2 and c4: `tasks add --fault the weather` exits 1 and `tasks start` refuses a question
addressed to the author, so an exit code does read those fields as *input validation*. The operative
property, which is what I graded, is that no *value* of a fault, no breach count and no occurrence
count determines a pass/fail verdict, an ordering, a filter or an exit code anywhere. That holds today.
What does not hold is the guard: `mergeReady.test.ts`'s new c9 describe is a `not.toContain` text scan
over `mergeReady.ts` alone, and the gate reaches `doctorIssues` and `checkPlan` in other files.
Mutation `c9-an-exit-code-reads-a-fault` — doctor's exit condition widened to
`dangling > 0 || tasks.some((task) => task.kind === 'finding' && task.fault === null)`, which makes a
merge-ready leg *and* a CI check exit on a fault — SURVIVED at every scope up to the whole suite
(0 failed of 2040). Filed as a finding; the clause is met on the code, and unguarded against the
regression it was written to prevent.
- proof 10: met — Both slices land, and each is pinned by a mutation aimed at the thing the clause refuses
rather than at the code that happens to be there. The append: `cmdRecur` (records.ts:303-339) writes
one `recur` event through `recordEvents` and touches the store on no path — no `saveStoreAndWarn` call
exists in the function. Attacked directly: `c10-recur-overwrites-the-description` inserts
`task.evidence = note; saveStoreAndWarn(tasks, config);` before the append, turning the observation
into the edit the clause is written against, and is KILLED by `friction.test.ts > c10: a recurrence is
a new observation, never an edit > appends an occurrence naming the record, and leaves the record
byte-identical`, re-run at its own file with the mutation still applied. That assertion is
byte-identity of the stored line, which cannot pass while anything about the recurrence reaches the
record. The derivation: `occurrencesByRecord` (friction.ts:78-85) folds the `recur` events and stores
nothing; `c10-count-not-derived-from-the-occurrences` (`byId.set(event.id, [event])`, so each occurrence
replaces the last) is KILLED by `... > derives the recurrence count from the occurrences and prints
what each one cost`. The merge argument the clause rests on is itself tested rather than asserted —
`friction.test.ts:490` appends another branch's `recur` line to the log by hand and asserts the next
occurrence is numbered 3, which is the resolution a counter field would have needed git to compute.
Live: on an isolated store, `tasks recur nobody-breach --note "it cost twenty minutes again"` printed
`recorded occurrence 1 ... the record itself is untouched`, and `tasks friction` then printed
`1 recurrence(s) recorded against 1 record(s) ... nothing is stored, so nothing can disagree with them`
with the note's own text under it. Each occurrence keeps its own note (`--note` is required, and
`friction.test.ts:479` asserts two different notes both survive), which is the loss the clause names.
- proof 11: unmet — Everything the clause describes is true of `tasks add` and `tasks edit`, and none of it is
true of the route by which most of the channel actually arrives. Wired correctly at two sites, and both
proven: `records.ts:282` (`cmdAdd`) and `records.ts:600` (`cmdEdit`) call
`offerRecurrence(task, reportPriorArtOnPaths(config, tasks, task))`. It never refuses — the record is
saved at records.ts:274 before the prompt prints. It matches by path, not title
(`claimedPaths` = `writes` + `files`, architectureCmds.ts:247). Mutations
`c11-filing-shows-nothing-that-claims-the-path` (the call deleted from `cmdAdd`) and
`c11-the-occurrence-is-offered-outside-the-channel` (the `reportsCost` guard dropped, offering the merge
on a plain task) are each KILLED by their named test in `friction.test.ts > c11: filing shows what
already claims the path, and never refuses`, re-run at that file with the mutation applied.
What fails: `grep -n "priorArt\|reportPriorArt" scripts/tasks/audit.ts` is empty. Neither
`tasks audit --finding ... --file <path>` nor `tasks import` shows anything that already claims the
path, and those are the routes an auditor files through — the generated brief's own step 8 and the
`--args-from` transport. Reproduced live end to end on an isolated store: `tasks add "first sighting of
the manifest friction" ... --files scripts/tasks/audit.ts:88` printed the full `prior art on
scripts/tasks/audit.ts` block; then `tasks audit demo-spec --proof 1=met --evidence 1=checked --proof
2=met --evidence 2=checked --finding "second sighting of the manifest friction" --severity medium --fault
tooling --deliverable "generate it" --evidence "ten minutes again" --file
scripts/tasks/audit.ts:88` printed `1 finding(s) recorded, unreviewed` and nothing else — no prior art,
no `tasks recur <its id>`, no `Nothing is merged for you`. Both records are in the store with
`"files":["scripts/tasks/audit.ts:88"]` and the second author was never shown the first. Scale on the
real store: of 603 reporting-kind records, 227 carry both a `source` (filed by an audit pass) and a
non-empty `files` list — `grep '"kind":"\(finding\|question\)"' docs/tasks.jsonl | grep '"source":{' |
grep -vc '"files":\[\]'` — so more than a third of the channel was filed blind to what already claimed
its path, through the one route the tooling tells auditors to use. This is the shape
[auditor/next-neighbour] names: the clause promises a property of filing, the fix covered the command
the finding happened to mention, and the neighbour is where the volume is. The remedy is the same two
lines already working in `cmdAdd`, called from `audit.ts` after its `saveStoreAndWarn` at 413 and 548.
- proof 12: met — Graded as a refusal, by exhaustive search, and checked as the live risk this repository's
own history says it is rather than as a formality. The property holds: nothing anywhere elevates a
lesson, a fault or an occurrence count. Searched (re-runnable): every non-test read of `breaches` and of
the `recur`/`checked` ops in `scripts/` resolves to schema, assembly, display or `friction.ts` itself;
every threshold-shaped comparison in the nine files of this clause's live surface
(`grep -rn "length\s*[<>]=\?\s*[0-9]\|count\s*[<>]=\?\|>=\s*[0-9]" ...`) is an emptiness guard for
phrasing, or `planCheck.ts:203`'s `granted.length < 3` sample-size guard and `records.ts:1053`'s
`pass >= 2` promotion rule, both pre-existing and neither over a channel count. Ordering is not by
count anywhere: `printByFault` walks `BUCKETS`, `printByLesson` walks `allLessons()` in the briefs'
order, `occurrencesByRecord` returns log order. No exit code, filter, queue position or gate verdict is
decided by a fault, a breach count or an occurrence count. Boundary stated rather than a longer
exclusion list, per [auditor/rule-may-be-wrong]: the clause's literal sentence is false and cannot be
made true — `friction.ts:52` compares `over === 0` to guard a division, `friction.ts:120` returns on
`orphaned.length === 0`, `records.ts:291` returns on `claims === 0`. The operative property, which is
what I graded, is that no count determines what the tooling *does with* a lesson or a record: no
elevation, no ranking, no threshold, no exit code. That property holds, and I recommend the clause be
restated in those terms rather than kept as a sentence its own implementation contradicts three times.
The guard, by contrast, does not hold, and two mutations say so precisely. The only mechanised part of
this refusal is `friction.test.ts:716`, a `not.toMatch(/\.length\s*[<>]|count\s*[<>]|>=\s*\d/)` over
`friction.ts`'s source text. `c12-a-threshold-appears-in-the-query` (`if (cited.length > 2) console.log
('^ this lesson is not landing — schedule it')`) is KILLED by it, so the guard is not decorative. But
`c12-a-threshold-written-without-an-inequality` (the same elevation as `occurrenceCount.size === 3`)
SURVIVED at every scope up to the whole suite, because the regex bans inequalities and not comparisons;
and `c12-a-threshold-outside-the-one-file-the-guard-reads` (`if (occurrences.length >= 3) console.log
('... it is now scheduled work')` in `cmdRecur`, on the recurrence count itself) SURVIVED for the
simpler reason that the guard reads one file while the clause says "anywhere in any code path". Both
filed. A refusal whose guard can be walked around by changing `>` to `===`, in a repository whose own
clause text says this gate was proposed four times in one day, is worth more than the shape it has.
- proof 13: unknown
