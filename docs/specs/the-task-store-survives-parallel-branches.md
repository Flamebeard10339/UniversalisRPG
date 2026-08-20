# the-task-store-survives-parallel-branches

## Deliverable

The record this branch answers says `docs/tasks.jsonl` produces "three unmergeable rewrites of one
file" under parallel branches, because records are edited in place rather than appended. Measured on
2026-08-06 against the real 590-record store, that is not what happens. Two branches editing
different records — 5 and 300 — merged clean, both edits kept, no conflict. `saveStore` rewrites the
whole file, but it writes one record per line in canonical key order and never moves a line, so git's
ordinary three-way merge already resolves edits per record. The comment at `taskStore.ts:304` that
claims this is true, and it had never been checked.

The single failure is that **every branch appends at EOF**. Two branches that each add one record
collide on the tail hunk, and adding records is what an audit does. That is the only conflict the
measurement produced, and it is the whole of the problem.

Sorting records by id removes it. The same scenario re-run against an id-sorted store merged with
zero conflicts, both new records present and both edits applied — because sorting turns a line every
branch writes into a position determined by the id, and three branches working three tasks file
records under three different slugs. The residual is measured, not assumed, and pass 1 corrected what
that measurement said: the condition is not "two inserts" but **adjacency of changed lines**. Two
branches that touch immediately neighbouring lines conflict — swept, the boundary sits between zero
and one record of separation — and that covers an insert beside an insert, an edit beside an insert,
and a delete beside an insert. Only the first resolves by keeping both sides.

So the fix is a sort, and the branch is small. What makes it more than a one-line change is what the
sort destroys. Four queues — `taskStore.ts:375`, `:407`, `:487`, `:513` — tie-break on array index,
and they carry `.map((task, index) => …)` for no other purpose. File position *is* creation order,
because records are appended, so `tasks next` today returns the oldest task in the highest severity
band. Sorting by id would silently replace that with alphabetical order, which means nothing.

Creation order cannot be recovered from the event log: 456 of the 590 records predate it — the log's
first line is `2026-08-02T19:57:20.782Z` — and only 134 have an `add` event. File position is the
only surviving record of it. So the reorder is not a cleanup that happens to precede the sort; it is
the one moment the information still exists, and the branch's real job is to convert it from a
property of the file's layout into a field on the record before canonicalising the layout. That is
this repository's own rule about enforcing where a value is assembled rather than where it is
written, applied to ordering.

| the situation                                                     | today                                       | after |
| ----------------------------------------------------------------- | ------------------------------------------- | ----- |
| two branches edit different records                                | merges clean                                 | unchanged |
| two branches each add a record                                     | **conflicts on the tail, every time**        | merges clean |
| two branches change *adjacent lines*, in any of three shapes       | conflicts                                    | conflicts once — documented, not fixed; only insert-beside-insert resolves by keeping both |
| two branches edit the same record                                  | conflicts                                    | unchanged, and correctly so |
| `tasks next` picks between two tasks of equal severity             | oldest first, by file position               | oldest first, by a field that says so |
| a branch cut before this lands adds a record, then merges          | merges                                       | merges; the record carries no `seq` and sorts as newest |

Proof:

- [c1] `saveStore` writes records in id order. The file on disk is a function of the record set alone:
  two branches that add the same records in different orders produce byte-identical files.
  proof: vitest scripts/lib/taskStore.test.ts
- [c2] Creation order survives as data. Every record carries an explicit ordinal, backfilled from its
  position in the pre-sort file, and the four queues tie-break on that field instead of on array
  index — so `tasks next` answers as it does today and `taskStore.ts:375`, `:407`, `:487` and `:513`
  no longer read meaning out of where a line happens to sit.
  proof: vitest scripts/lib/taskStore.test.ts
- [c3] The reorder commit changes no record. Parsed before and after, the two files carry the same
  set of ids and, the new ordinal aside, field-for-field identical records — so the one commit that
  touches every line is provably a permutation, checked against whatever the store holds rather than
  against a count written into this clause.
  proof: vitest scripts/lib/taskStore.test.ts
- [c4] The regression is a real merge, not a simulation of one. Two branches, each editing a
  different record and each adding one, merge with zero conflicts through actual `git merge` — the
  scenario that conflicts today and the one this branch exists to fix.
  proof: vitest scripts/lib/taskStore.test.ts
- [c5] The residual is named where a reader will hit it, and named correctly. The condition is that
  two branches changed *adjacent lines* — measured by sweeping the separation: at zero records
  between them the merge conflicts, at one or more it is clean. That covers three shapes, not one:
  an insert beside an insert, an edit beside an insert, and a delete beside an insert. Only the
  first resolves by keeping both sides; the other two need the edit reconciled, so a single stated
  resolution would be wrong for two of the three. A test pins the adjacency boundary rather than one
  shape, because the boundary is the property and the shapes are its instances.
  proof: vitest scripts/lib/taskStore.test.ts
- [c6] A record written without the new field still parses and still sorts. A branch cut before this
  lands and merged after adds records that carry no ordinal, which is the parallel case this whole
  branch is about, and the store's forward-compatibility machinery already exists for it.
  proof: vitest scripts/lib/taskStore.test.ts

## Decisions

- **A sort, not a merge driver.** A driver keyed on record id would be airtight where sorting leaves
  a residual, and it is refused because it cannot be carried by the repository: `git config
  merge.<name>.driver` is per-clone, so every worktree spawn and every CI leg would need a setup
  line, and a system that must be manually kept in sync is the thing this repository says not to
  build. The residual is one conflict, in the shape a human resolves by keeping both sides.
- **`.gitattributes` is not touched.** The record forecast a write there and there is nothing to
  write. Its existing comment argues that `merge=union` is wrong for the store because two branches
  editing one record would keep both copies under one id, and that argument is correct and survives
  this branch unchanged — union is right for the append region and wrong for the edit region, and
  sorting removes the append region rather than trying to express both.
- **The event-log projection is dead, and this records why.** Rebuilding `tasks.jsonl` from the
  union-merged log was the record's first candidate shape. Events carry `note: "edited requires"` —
  which field changed, never the value — so the log cannot reconstruct a record, and making it able
  to would mean a format change to all 1322 existing lines. It is not a smaller change than this one;
  it is a much larger one that also loses the log's own searchability.
- **The ordinal is a position, not a timestamp.** A `created` date would read better and cannot be
  had: 456 of 590 records predate the event log, so no date exists for them and inventing one would
  be worse than an honest ordinal. The pre-sort file position is exact, and it is the last moment it
  is knowable.
- **Two branches may produce the same ordinal, and that is fine.** Both take `max + 1` and neither
  sees the other, so the sort chain ends in id — which is deterministic and identical on both sides.
  A collision costs nothing because the field orders a queue; it does not identify a record.
- **Orchestration waits on this, and only this.** The three orchestration prerequisites this branch
  sits with all write elsewhere, and this one alone rewrites every line of the store, so it lands
  alone and before them rather than merging against itself.
- **The adjacency residual is accepted, not fixed** — amended into c5 after pass 1 found the original
  characterisation false. Line-based three-way merge conflicts when two sides touch adjacent lines;
  that is a property of git, not of this store, and nothing short of a merge driver removes it. The
  driver stays rejected for the reason above. What makes the residual tolerable is that ids carry
  their spec's slug, so concurrent branches write into different neighbourhoods of the file — the
  clustering visible at `docs/tasks.jsonl:559-563`, a task record immediately above its own audit's
  four records, is intra-branch and therefore harmless. Records named from a generic title carry no
  such prefix and can collide across branches; that is the honest exposure, and it is one small
  conflict rather than a corrupted store.

## Open questions

- Whether an absent ordinal sorts first or last. The backfill covers every tracked record, so absence
  only ever means "written by a checkout cut before this landed", which argues for newest; the worker
  decides once it has read how the queues degrade.
- Whether the field is named `seq`, `created` or `added`. c2 fixes what it must do and nothing rests
  on the spelling.
- Nine of the 134 records that do have an `add` event sit out of timestamp order in the file. Whether
  that is worth reconciling during the backfill, or is noise from records added and re-added, is the
  worker's call — the backfill takes file position either way, so nothing depends on the answer.

## Audit passes

### Pass 1 — 2026-08-06

- base: `142374aadf157a2c6e7eb011b0aa266fb845b4d4`
- head: `137245b58f98fb12b45c7bd672434587b9e0b27a`
- proof 1: met — scripts/lib/taskStore.ts:328-331 saveStore sorts `[...tasks]` by id before writing. Test
"writes records in id order, so the same record set produces byte-identical files regardless of
build order" (scripts/lib/taskStore.test.ts:256) saves [x,y] and [y,x] to separate files and asserts
byte-identical output. Mutation-killed: replacing the sort with `[...tasks]` (no sort) fails that
exact test, 1 of 95 (`npm run mutate` manifest entry "c1").
- proof 2: met — Diffed against the pre-branch file (142374a): the four sites it names — taskStore.ts:375
(fixNowQueue), :407 (unreviewedQueue), :487 (listQueue), :513 (nearMatches) — each read
`.map((task, index) => ...).sort(... a.index - b.index)` before this branch and `seqRank(a.seq) -
seqRank(b.seq)` after. Each of the four has its own "breaks ties by seq, oldest first, regardless of
array order" test in taskStore.test.ts (lines 657, 695, 778, 645). Mutation-killed: replacing
seqRank's body with a constant `0` fails 6 of 95 tests file-wide (`npm run mutate` manifest entry
"c2"). Also verified live: `tasks next` still returns the same answer it did before the branch on the
real 590-record store (spot-checked via `npm run tasks -- next` — unchanged pick).
- proof 3: met — Two layers of evidence. (1) Generic: "is a permutation: the same ids and the same fields
aside from seq, whatever the store holds" (taskStore.test.ts:325) constructs three records with
distinct fields and asserts backfillSeq changes only seq. Mutation-killed: making backfillSeq also
mutate title on the way through fails that test, 1 of 95 (manifest entry "c3"). (2) Direct, against the
real reorder commit f61c505 rather than a synthetic fixture: loaded docs/tasks.jsonl at f61c505^ and
at f61c505 with parseStore and diffed them — 589 records both sides, identical id sets (no id only on
one side), zero field mismatches on any record once seq is excluded from the comparison, and seq
values in the "after" file are 1..589, all unique, none null. Script and output are in this pass's
report to the coordinator; re-run with
`git show f61c505^:docs/tasks.jsonl` / `git show f61c505:docs/tasks.jsonl` piped through parseStore
and diffed by id.
- proof 4: met — taskStore.test.ts:369 "two branches, one editing a record and adding a non-adjacent one, ...
merge with zero conflicts" spawns real git (init/branch/commit/merge, no mocking), builds two branches
from a 10-record base — one edits record 0 and inserts near the middle, the other edits record 9 and
appends — and asserts `git merge` exits 0 with both edits and both new records present. Ran it: passes.
I additionally re-derived the same scenario at varying gaps between an edited record and an unrelated
insertion (adversarial script, not in this repo) and confirmed real `git merge` stays clean as long as
at least one untouched line separates the two changes in the id-sorted file — consistent with the
clause's claim for the non-adjacent case it names. CAVEAT, not a clause failure but a test-strength gap
(see finding H1 below): mutation-testing this exact test by removing saveStore's sort survives at the
test's own scope and is only caught when escalated to the whole file (killed there by the unrelated c1
test) — because this test's branch arrays are hand-spliced already in id-sorted order, so the mutation
doesn't change what they write. The behavioural claim is independently verified true by inspection and
by my own adversarial re-run; the test as written does not, by itself, prove it.
- proof 5: unmet — The named test (taskStore.test.ts:404) is real and passes: two branches each inserting a
new record between the same two existing ids conflict once, in the shape described. But the clause's
stronger claim — "a test pins that this is the *only* remaining conflict shape" — is false. I built an
adversarial real-git-merge scenario (spawnSync git, same pattern as the shipped tests, not mocked):
branch A edits an existing record (title change only, no id/position change); branch B inserts a new
record whose id sorts immediately adjacent to the edited one (zero untouched lines between them once
saveStore sorts by id) — merge exits 1, a real conflict, shaped as an edit on one side and an insert on
the other, not two inserts. I then swept the gap between the edited line and the inserted line from 0
to 6 untouched lines: gap=0 conflicts, gap>=1 merges clean (confirmed with the array's actual id used
for `saveStore`'s sort, not the array-splice position, which is irrelevant since saveStore always
re-sorts). I also confirmed a second new shape: one branch deletes a record while the other inserts a
record adjacent to the deleted one — also conflicts. So the true residual is "any two changes whose
lines land adjacent in the id-sorted file," which subsumes insert+insert but is not the same claim as
"two branches inserting adjacent ids" and is not limited to a shape resolved by "keep both" — an
edit+insert conflict must be resolved by reconciling the edit, which "keep both" does not describe.
This is realistic, not contrived: ids in this store are hyphenated slugs that commonly share a prefix
for related work (an audit's own finding ids are typically `<subject>-passN-...`), so a record being
edited and a new record about the same subject are likely to sort next to each other. Filed as finding
H1.
- proof 6: met — normalizeTask reads `value.seq ?? null` (taskStore.ts:188) and seqRank treats null as
Number.POSITIVE_INFINITY (taskStore.ts:366), so an absent seq parses without error and sorts last —
"newest" — in every queue. Tests: "parses with seq null, from a line that never mentions the key" and
"sorts as the newest record in a queue, ahead of nothing and behind everything numbered"
(taskStore.test.ts:272-286). Mutation-killed: changing `value.seq ?? null` to `value.seq` (so an
absent key reads as `undefined`, which then fails the `typeof seq !== 'number'` guard and throws)
fails the "parses with seq null" test, 1 of 95 (manifest entry "c6").

### Pass 2 — 2026-08-06

- base: `142374aadf157a2c6e7eb011b0aa266fb845b4d4`
- head: `9a59239c48b4054b35493cd49ae2ecc2227ecb81`
- proof 1: met — Unchanged since pass 1: taskStore.ts:329 sorts `[...tasks]` by id before writing. Re-verified
independently this pass with a fresh manifest (not pass 1's): replacing the sort with `[...tasks]` (no-op)
against test "writes records in id order, so the same record set produces byte-identical files regardless
of build order" (taskStore.test.ts:256), scoped to that test by name via `npm run mutate`. KILLED, 1 failed
of 101, at the named test's own scope — no escalation needed.
- proof 2: met — The four sites c2 names (fixNowQueue:375, unreviewedQueue:407, listQueue:487, nearMatches:513)
all tie-break on seqRank(task.seq) instead of array index, confirmed by reading each. Independently
mutation-verified all four this pass, each at its own named-test scope: (1) collapsing `seqRank` to a
constant 0 against "breaks ties by seq, oldest first, regardless of array order" (matches the fixNowQueue,
unreviewedQueue and listQueue tests by name) — KILLED, 2 failed of 101; (2) the same mutation against
nearMatches's own "breaks a score tie by seq, oldest first, regardless of array order" — KILLED separately,
1 failed of 101. Neither needed escalation past its own file. Also live-checked: `npm run tasks -- next`
still returns the same pick on the real store as before the branch.
- proof 3: met — backfillSeq (taskStore.ts) only ever adds `seq` to a record that lacked one, and the real
reorder commit f61c505 is a verified permutation of the pre-branch store (589 ids both sides, zero
non-seq field mismatches — reconfirmed this pass by re-running pass 1's diff-by-id script against
`git show f61c505^:docs/tasks.jsonl` and `git show f61c505:docs/tasks.jsonl`). Mutation-verified this
pass: making backfillSeq also append `!` to `title` on the way through, against test "is a permutation:
the same ids and the same fields aside from seq, whatever the store holds" (taskStore.test.ts:325) —
KILLED, 1 failed of 101, at the named test's own scope.
- proof 4: met — Answers pass 1's medium finding directly. cae80b3 rebuilt this test's branch arrays with a
content-keyed `scrambled()` shuffle before every `saveStore` call (taskStore.test.ts), replacing the old
already-id-sorted hand splices pass 1 caught. Re-ran the exact mutation pass 1 used (disable saveStore's
sort) via `npm run mutate`, scoped this time to only the test's own name — "two branches, one editing a
record and adding a non-adjacent one, the other doing the same to a different record, merge with zero
conflicts" — KILLED, 1 failed of 101, at that scope alone. Pass 1 needed escalation to the whole file for
this same mutation; this pass does not. Also ran the test directly: still a real, unmocked git merge
(spawnSync init/branch/commit/merge), still exits 0 with both edits and both new records present.
- proof 5: met — Clause reworded (e3ea4b9) after pass 1's high finding, to claim adjacency of changed lines —
not "two inserts" — as the general condition, with insert-insert, edit-insert and delete-insert as three
named instances, only the first resolved by "keep both". taskStore.test.ts's "the adjacency boundary"
describe block (cae80b3) sweeps all three shapes at gap 0 and gap 1 via it.each (6 cases), plus a dedicated
insert-insert test asserting exactly one conflicting hunk resolved by keeping both. All branch arrays are
built through the same scrambled() helper c4 uses, closing pass 1's mutation-gap finding for this test too.
Mutation-verified: disabling saveStore's sort, scoped to `-t "merges clean"` (matches all 6 it.each cases,
none else) — KILLED, 3 of 6 failed, 101 total, at that scope alone, no escalation.
Adversarial re-check beyond the shipped tests, per this pass's brief: built a standalone real-git-merge
harness (spawnSync, fresh repo per run, not reusing branches) covering shapes the clause does not name —
edit-edit, delete-delete, delete-edit, edit-delete — sweeping gap 0/1/2, and separately the file's first and
last record (no context on one side). Every shape conflicts at gap 0 and merges clean at gap>=1, both
directions, both edges. The zero-vs-one-record boundary the clause claims holds outside the fixtures the
shipped tests exercise, not just inside them.
- proof 6: met — Unchanged since pass 1: normalizeTask reads `value.seq ?? null`, seqRank treats null as
Number.POSITIVE_INFINITY (sorts last/newest). Re-verified this pass: changing `value.seq ?? null` to
`value.seq` against "parses with seq null, from a line that never mentions the key" (taskStore.test.ts:272)
— KILLED, 1 failed of 101, at the named test's own scope. Also confirmed all four production sites that
construct a new Task literal (cmdAdd, cmdImport, buildFindingTask, the undelivered-clause literal) now call
nextSeq(tasks), so no new record ships without an opinion on seq; tsc enforces this structurally since
Task.seq is a required field.
