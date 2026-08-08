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
