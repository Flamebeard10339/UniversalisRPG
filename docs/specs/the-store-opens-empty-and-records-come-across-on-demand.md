# the-store-opens-empty-and-records-come-across-on-demand

## Deliverable

`docs/tasks.jsonl` stops being written. A fold-derived store opens **empty** beside it, the old file
is frozen as history, and a record crosses over only when work actually needs it. Nothing is
migrated, nothing is triaged in advance, and no session is spent adjudicating a backlog.

**This is a smaller change than it reads as, and the reason is already in the repository.** c11 of
`task-system-policy-seam` establishes that *every write to the store appends one line to an
append-only event log*. Every mutation site therefore already fires an event. Three moves finish it:
the event carries its payload instead of a field name, the `saveStore` call beside it is deleted,
and `loadStore()` becomes a fold returning the identical `Task[]`. The read surface is **one seam** —
`planCheck`, `roadmap`, `producers`, `architecture` and `doctor` are not touched, because a fold
returns the shape they already consume. If any of them needs editing, the seam was not one function
and the branch has found something the design did not predict.

**Why empty rather than migrated.** Starting empty saves only the genesis import, which was the
cheapest part; the reason to do it is the backlog, not the migration. The store holds 658 records:
519 already closed, 139 live, and **100 of those 139 are attached to no spec** — filed findings that
have sat unpromoted since they were written. Re-filing on demand is a perfect filter that costs
nothing: a record that work never reaches for was not worth carrying, and that signal is
unobtainable any other way, because a backlog never volunteers what is dead. The 39 live records
that *are* attached to a spec are the natural first candidates to come across, and they come across
the same way as everything else — when something needs them.

**Retirement goes through the verb, not around it.** All 139 live records are retired with a
recorded reason, using the `remove` op this branch depends on. A file deletion or a fresh directory
would commit, at a scale of 139, the exact defect `a-record-cannot-leave-the-store-unrecorded` was
written to prevent — and would do it as the new store's first act. Done correctly the old store ends
fully explained: 519 closed by their own history, 139 retired with a stated cause, none unaccounted.

**Depends on two branches that have not landed.**

- `a-lesson-is-folded-from-its-own-log` — the payload-carrying event schema, the `t`-ordered pure
  fold, and the concurrent-edit detector. This branch **imports** all three and re-derives none of
  them; a second fold implementation is the failure this dependency exists to prevent.
- `a-record-cannot-leave-the-store-unrecorded` — merged as a spec, **not yet built**: `EVENT_OPS`
  still carries its original sixteen verbs and the spec has one open member. c4 below cannot be
  written until `remove` exists.

**Out of scope, for a mechanical reason rather than a preference.** `Task.seq`, `Task.extra` and the
tolerant/strict parse twin all exist to apologize for a rewritten state file and all become
unnecessary here. None of them is removed in this branch. c2's proof is a differential against the
old serializer — the fold must produce what `saveStore` would have written — and that comparison
only holds while the shape is identical. Cleaning the schema in the same diff destroys the only
cheap proof the switch has. It is the obvious next branch and it is worth nothing without this one.

Proof:

- [c1] `loadStore()` folds the new log and returns the same `Task[]` it returns today. The clause is
  falsifiable in one shape: every existing consumer test passes **unmodified**. A consumer that
  needed editing means the read surface was never one seam, which is the assumption this whole
  branch is priced on.
  proof: vitest scripts/lib/taskStore.test.ts
- [c2] Every write site emits an event sufficient to apply, and `saveStore` is deleted. Proven
  differentially while both exist: for each write op, the folded state equals the file the old
  serializer would have written, asserted over the real 658-record store rather than a fixture.
  proof: vitest scripts/tasks/records.test.ts
- [c3] `docs/tasks.jsonl` is frozen: no code path writes it, and a test asserts the absence rather
  than a reviewer noticing it. The file stays in the tree, readable and greppable, as history.
  proof: vitest scripts/lib/taskStore.test.ts
- [c4] The 139 live records are retired through `remove`, each carrying a reason, and the 100 with
  no spec share one stated cause: *retired unread at the store reset; attached to no spec and
  unpromoted since filing; if it matters it will be found again*. After it, no record in the old
  store is unaccounted for — 519 closed by their own history, 139 by a recorded removal.
  proof: npm run tasks -- doctor
- [c5] `tasks pull <id>` is the one route across. It reads the frozen store, files the record into
  the new one, and the new record's own history names the id it came from — so "what has come
  across, and what was it" is a query rather than an archaeology.
  proof: vitest scripts/tasks/records.test.ts
- [c6] The human-readable snapshot is generated, gitignored, and read by nothing. It is regenerated
  on any `tasks` invocation so it cannot go stale, it is never committed so it cannot conflict, and
  a test asserts no module imports it. A snapshot some command reads is a second answer to one
  question, which is the failure the recurrence ruling already names.
  proof: vitest scripts/lib/taskStore.test.ts

## Goal

Let the store be derived from its log, and let the backlog filter itself by what work actually
reaches for.

## Decisions

- **Adopted 2026-08-06 from a planning session in another context, verified rather than taken on
  report.** The backlog numbers were re-derived against the tree: **658 records, 519 closed, 139
  live, and 100 of the live attached to no spec.** The re-filing argument stands on that last number
  and it holds exactly.
- **Not started, and further from ready than its sibling.** It depends on two branches, one of which
  is a spec with no code behind it — `EVENT_OPS` still carries its original sixteen verbs. Task-system
  work is frozen as of this session in favour of the MVP roadmap.
