# a-lesson-is-folded-from-its-own-log

## Deliverable

**The deliverable is the fold, not the lessons.** Lessons are the subject because they are the
smallest real set in the repository — nineteen records against a declared cap of twenty-four — and
because getting the mechanism wrong there costs a day rather than a migration.

`docs/events.jsonl` cannot be folded. Not "is not folded": *cannot be*. A real edit event reads

```json
{"op":"edit","id":"one-query-over-the-channel-and-the-second-place-retired","note":"edited discharges"}
```

which names the field that changed and drops the value it changed to. `eventLog.ts` exports five
functions — `eventsPathFor`, `appendEvents`, `parseEvents`, `loadEvents`, `filterEvents` — and all
nine consumer call sites do load, filter, print. Nothing derives state from the log, so the log has
never needed a payload or an order, and neither exists. That is a coherent design for a searchable
journal and a dead end for anything that wants current state out of it.

This branch builds the other thing once, small: an append-only log whose events carry enough to
apply, and a pure fold that turns them into current state. If it holds, `docs/tasks.jsonl` can
become derived and the removal verb `a-record-cannot-leave-the-store-unrecorded` just added stops
being necessary, because one artifact cannot disagree with itself. If it does not hold, that was
learned on nineteen records.

**Ordering is `t`, and the alternative was measured before it was refused.** Ordering the fold by
commit ancestry through each event's `head` was the first design. Against the real log: 1,606
events, zero null heads, 338 distinct heads, all resolvable — but **51 of the 338 are outside
`HEAD`'s reachability**, and unreachable objects are what `git gc` prunes. An ancestry-ordered fold
therefore decays: the events attached to those heads are unorderable today and will become
unresolvable later. It also makes the log's meaning depend on a mutable graph stored elsewhere,
which is the one property that currently makes the file trustworthy. Every agent in this repository
runs on one machine, so `t` is not an approximation of arrival order — it is arrival order.

What `t` gives up is the lost update: a branch cut from stale main that finishes late overwrites
work it never saw. That case is **detected, never silently resolved**, which is `.gitattributes`'s
own rule — *a conflict is loud and fixable, a silent duplicate is neither*. It is rare and therefore
dangerous: only **5 of 338** heads carry events from more than one branch, so a wrong tiebreak would
fire seldom enough to go unnoticed for months.

**Prior art, and a collision this branch must resolve before it starts.** Two open records under
`the-workflow-records-what-cost-it-in-one-place` already own lesson semantics:

- *A lesson has a handle that survives rewording it*
- *A lesson can be retired, and the retirement is recorded*

Both are satisfiable without a store — a handle is a field on the existing interface, and a
retirement is a `decision` event plus a source deletion. **They do not justify this branch, and this
branch does not re-specify them.** But both write `briefLessons.ts`, which this branch empties, so
two branches would be editing one file for different reasons. Either those two records move here and
this spec absorbs their clauses, or this branch waits for them to land and folds their result into
the genesis import. That is the author's call and it is the first thing a worker must ask.

**Out of scope.** Migrating `docs/tasks.jsonl` to a derived store. It becomes the right next branch
only if c3 and c5 both hold, and it is a schema change — the trial-merge record already establishes
that one cannot run beside a store writer.

Proof:

- [c1] Lessons live in `docs/lessons.jsonl`, append-only, registered `merge=union` in
  `.gitattributes` beside `docs/events.jsonl` and for the same stated reason. The four exported
  arrays in `briefLessons.ts` are deleted and the nineteen become a genesis import. No file holds
  current lesson state: the four briefs render from the fold, and a test asserts the rendered output
  is byte-identical to what the arrays produced, so the medium changes and the briefs do not.
  proof: vitest scripts/tasks/workPrompt.test.ts
- [c2] Every write event carries its payload, not the name of a field. The clause is falsifiable in
  one shape: an edit event plus the state before it is sufficient to produce the state after it,
  with no other input. A test applies an edit event to a prior state and asserts the result, which
  is exactly the test `events.jsonl` would fail today.
  proof: vitest scripts/lib/lessonLog.test.ts
- [c3] The fold is pure and total — `(events) => Lesson[]`, ordered by `t`, reading no filesystem,
  no clock and no subprocess. Proven by a fixture whose events are supplied out of file order and
  fold to one answer regardless of the order they arrive in, which is the property a union merge
  requires and the one the store migration would inherit.
  proof: vitest scripts/lib/lessonLog.test.ts
- [c4] `MAX_LESSON_COUNT` counts live lessons only. A retired lesson leaves the briefs and stays in
  the log with its reason, so the cap measures what agents are asked to hold rather than what has
  ever been written. The existing assertion at `audit.test.ts:1869` keeps passing against the folded
  count.
  proof: vitest scripts/tasks/audit.test.ts
- [c5] A concurrent edit is reported, not resolved. Two branches editing one lesson with no ancestry
  relation between their heads is a `doctor` finding, driven by a fixture rather than by waiting for
  a real collision. The ancestry facts are passed in as data, so the read path acquires no
  subprocess and the check can be tested without a repository.
  proof: vitest scripts/tasks/doctor.test.ts
- [c6] The refusal of ancestry ordering is recorded as a `decision` against this spec, carrying the
  measurement that produced it — 51 of 338 heads outside `HEAD`, and gc as the mechanism that makes
  it worse. A later branch proposing an ancestry fold for the store meets the ruling rather than
  re-deriving it, which is the whole reason the store holds decisions.
  proof: npm run tasks -- log --spec a-lesson-is-folded-from-its-own-log --op decision

## Goal

Build a log that can be folded into current state once, on the smallest real set, before anything
larger depends on it.

## Decisions

- **Adopted 2026-08-06 from a planning session in another context, verified rather than taken on
  report.** Every load-bearing number was re-derived against the tree before adoption: 1,606 events,
  zero null heads, 338 distinct heads, **51 of them outside `HEAD`'s reachability**, and **5 heads
  carrying events from more than one branch**. The ordering argument stands on those and they hold
  exactly.
- **Not started.** Task-system work is frozen as of this session in favour of the MVP roadmap. This
  spec lands as a plan for a later branch, with an open member and no work done, which is the state
  `merge-ready`'s spec leg recognises as a plan rather than a debt.

## Open questions

- **The `briefLessons.ts` collision is the author's call and is the first thing a worker must ask**,
  exactly as the Deliverable says. Two records under `the-workflow-records-what-cost-it-in-one-place`
  write that file for other reasons: `a-lesson-has-a-handle-that-survives-rewording-it`, which is
  built and sitting unmerged on `claude/lesson-handle`, and
  `a-lesson-can-be-retired-and-the-retirement-is-recorded`, which is open and unstarted. This branch
  empties the file. Either those two move here and this spec absorbs their clauses, or this branch
  waits and folds their result into the genesis import. Recorded unresolved deliberately — deciding
  it under a freeze is how a decision gets re-decided.
