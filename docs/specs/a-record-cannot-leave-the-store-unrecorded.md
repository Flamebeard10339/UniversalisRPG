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
membership of a spec, not presence in the store. `doctor` cannot report the gap either: it fails on
exactly one condition, a line that will not parse.

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
- [c5] `doctor` fails on an unexplained absence, its second failure condition, earned by the one
  instance above and by nothing else. `doctor-fix` cannot repair it: a record the store lost is not
  a record `doctor` may invent, so the action is to file the ruling, not to write the row back.
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

- **c5 needs the author's ruling before it is worked, and it is the one clause that is not the
  author's to delegate.** It gives `doctor` a second failure condition, and CLAUDE.md states in two
  places that `doctor` fails on exactly one — an unparseable line — and separately says to resist
  adding gates because "a gate earns its place by preventing something that actually happened". The
  spec argues the instance is `proof-targets-resolve` and that the rule is therefore satisfied. That
  argument is coherent and it still changes a documented invariant, so it is ruled rather than
  assumed. If the ruling is no, c1 through c4 and c6 stand unchanged and the reconciliation is a
  read that reports rather than a leg that fails.
- Whether the retroactive `remove` events in c6 are written by hand or by a one-shot command.
  Delegated: three events is small enough that the answer follows from how awkward the by-hand
  route turns out to be, which the worker will know and this session does not.
