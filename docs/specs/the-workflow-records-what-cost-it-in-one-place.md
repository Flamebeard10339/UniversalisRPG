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
- [c4] A blocking question has a route that is neither deciding it nor stalling the worker. An agent
  can file one against the record it is working, name it where the dispatch machinery already reads,
  and have exactly what depends on it halt while the rest proceeds; answering or dismissing it
  releases the hold. Recorded as the remedy for `run-an-orchestrator-over-three-parallel-tasks`
  c3 — which is deferred out of that spec, still unmet, and is this clause's real acceptance test.
  proof: vitest scripts/tasks/friction.test.ts
- [c5] Fault `nobody` is never counted as a defect. The query reports it, because a question nobody
  could have answered is real information about where knowledge was missing, and excludes it from
  every count and rate presented as a defect measure. Reporting and counting are different acts and
  this clause turns on the difference.
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
