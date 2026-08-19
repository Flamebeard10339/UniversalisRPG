# the-cost-of-a-change-is-known-before-it-is-made

## Deliverable

A first version of this spec proposed measuring resistance to change by classifying import edges as
shapes or answers and ranking modules by how many others must know their shape. It was graded by two
independent adversarial readers before dispatch and refuted, and the refutation is why this document
looks nothing like it. The record is kept rather than tidied away: the earlier text is at `7b8463a`
and the grading is row 85 of `docs/dsl-rewrite/delegation-experiments.md`.

It failed on measurement, not on taste. Ranked against the sixty merges on `main`, shape-in-degree
correlated with how often a file actually changes at Spearman 0.195, against 0.505 for its own dual.
`src/content/serialize.ts` is the most-changed file in the repository — **20 of 60 merged features
touch it** — and shape-in scored it 0, one hundred and sixty-third of two hundred and thirty-four,
which the worker would have read as "safe". The one validation the spec offered was that
`src/grammar/parser.ts` was the sole answer-dominant row and was the module the preceding branch had
just converted to a codec. Re-run at the merge base, before that conversion, `parser.ts` was already
answer-dominant on identical imported names — `Cursor DslError Parser Span parseWhole requireEnd` at
both ends. The instrument did not detect the fix it was said to agree with.

The lesson that survives is not about import graphs. It is that a proxy was chosen over a direct
measurement that was available the whole time, and was then never checked against it. The question
asked was *how many unique files are required to implement a given feature*. Every merge on `main` is
a feature whose file list git already holds, and `docs/audits/systems.json` is already a partition of
every tracked file, gated by `audit-status` on exactly that property. So the question is answerable
by reading, and here is the answer:

    unit                          n    files (median)   systems (median)   <= 2 systems
    src+scripts .ts, no tests    88          7                 2            52/88  (59%)
    src+scripts .ts, with tests  88         13                 2            51/88  (58%)
    every tracked file          139         10                 1           101/139 (73%)

    systems per feature, non-test code:  1sys=32  2sys=17  3sys=17  4sys=13  5sys=4  6sys=2
    files per feature, non-test code:    median 7, max 83
    97% of the files those merges touched are still owned by today's manifest

The file count moves with the unit and is therefore not a number anything should gate on — 7, 13 and
10 are the same repository counted three ways. **Systems per feature is median 2 under all three
units.** That is the measurement this spec is built on, and its robustness to the unit choice is the
property the previous version lacked: its headline of "2342 edges, 45% structural" turned out to be a
count of imported names under an abstain rule the clause text did not state, and neither grader could
reproduce it.

Which makes the author's own sentence checkable rather than aspirational. *"Any individual feature
should touch a single system or the interface between two systems."* Fifty-nine percent of merged
features already do. The remaining thirty-six are the whole of the problem, they are enumerable, and
nothing today notices when a branch joins them. Grant drift is the mechanism and it is already
measured: `decision 2026-08-08T14:04:52Z` records that **all seven** dispatches of one push needed
their write grant corrected, three caught before dispatch and four disclosed mid-task, and that
`tasks plan` graded that set "no overlap, no unstated dependency" immediately before two of its
branches collided in five shared files. A forecast that is never compared to the outcome is not a
forecast.

So the gate is on the comparison, and it is hard, by the author's ruling of 2026-08-19. The reason it
can be hard is the measurement above: a ceiling of two systems fails 41% of historical features, which
is a gate that bites without being a stop-work order, and every instrument in this repository with a
clean record is one that exits non-zero. `layer-check` is the only gate never routed around, and the
one rule that changed planner behaviour did so by deleting the decompose step rather than reporting on
it. Reporting-only instruments here have a uniform record: `tasks produces` fires on one of a hundred
and sixty related pairs, `--breaches` has five uses in 1583 records, and workers have written
event-log notes explaining a grant-drift number away rather than acting on it.

None of this detects duplication, and saying so plainly is a correction of the previous version's
worst habit. Five independent implementations of one capability have no import edge between them and
touch no common system; neither the refuted metric nor this one can see them. That is the author's
first-named complaint and it is deferred, named, to the next spec — `## Decisions` says what it will
need and why it is not folded in here.

Proof:

- [c1] **What every merged feature cost is derived from git and stored nowhere.** For every merge
  commit on `main`, the feature's file set is the diff between its two parents, and its system set is
  those files resolved through `owningSystem`. The subjects are the merges git holds, so a feature
  merged next month is in the series with no edit. The report prints the distribution under all three
  units above and never a bare median, because the file count is unit-dependent and a number quoted
  without its unit is how the previous version of this spec became unreproducible.
  proof: vitest scripts/lib/featureCost.test.ts
- [c2] **A spec's system declaration is derived from its grant and is never typed.** The systems a
  spec may touch are `ownerOf` resolved over the member's `writes`, so there is no second list to
  keep in agreement with the first, and widening the declaration is possible only by widening the
  grant — which is a recorded store event carrying who, when, branch and head.
  proof: vitest scripts/lib/featureCost.test.ts
- [c3] **`merge-ready` exits non-zero when the diff touches a system the declaration does not name.**
  A new leg, hard, beside the existing ones. Ownership is resolved against the manifest **as it stands
  at the merge base**, so a diff cannot legalise itself by editing `systems.json` in the same change;
  that is the one gaming move this gate has, and resolving from the base is what closes it. The proof
  drives the real leg over a fixture repository whose diff crosses an undeclared system and asserts
  the exit code, not the message.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c4] **`merge-ready` exits non-zero when a declaration names more than two systems and no author
  ruling is recorded against that spec.** Two is the author's stated ceiling and the escape is a
  `tasks decision` against the spec, not a flag — a flag is a thing a worker can add, and a decision
  is a thing the store remembers. Measured against history: this leg would have failed 36 of the 88
  merged features that carry code.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c5] **A worker is given the number before it writes.** `work-prompt` prints the member's derived
  system declaration, the historical distribution from c1, and — when the declaration already exceeds
  two — the instruction that this needs an author ruling before code rather than an explanation at
  merge. The subjects are the record's own grant, so a grant widened after dispatch is reported with
  no edit here.
  proof: vitest scripts/tasks/workPrompt.test.ts
- [c6] **Closing a spec records what it actually cost, so a cadence can be derived rather than
  guessed.** `tasks done` writes the closing diff's file count and system count onto the event it
  already emits. It is derived once at close from git and never recomputed, so nothing drifts. This is
  the series that decides whether c4's ceiling of two is right: if the rate of rulings does not fall
  across the next twenty specs, either the ceiling is wrong or the partition is, and both are then
  answerable from data instead of from argument.
  proof: vitest scripts/tasks/records.test.ts
- [c7] **The gate holds on the branch that builds it.** The implementation branch is cut from `main`
  and its diff against `main` names no file outside this member's `writes` grant. This is c3 applied
  to itself, and it replaces the previous version's c8, which asserted "no file under `src/`" and was
  false at the commit that introduced it because that commit sat on a branch already carrying another
  spec's work.
  proof: command git diff --name-only main...HEAD
- [c8] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Goal

Make a change unable to cost more than it declared, and make two systems the declared ceiling, so
that a feature which is going to touch six systems is refused at declaration time instead of
discovered at hour three.

## End state

    cost(merge)   = files and systems in the diff between its two parents        -- from git
    declared(spec)= ownerOf over the member's writes grant                       -- from the store
    gate          = FAIL if diff touches a system not in declared(spec)
                    FAIL if |declared(spec)| > 2 and no author ruling is recorded
    work-prompt   = declared(spec) + the historical distribution, before code
    tasks done    = record cost(this merge), so the series accumulates

Five lines. Anything in the implementation that is not one of them is scope this spec did not ask
for, and this section is here so that is decidable by reading rather than by an audit. c1 and c6 are
the first and last lines; c2 the second; c3, c4 and c7 the gate; c5 the fourth.

## Stages

1. **The measurement** — c1, c2. New `scripts/lib/featureCost.ts`, pure over `{ merges, diff, read }`
   passed in as data, the same seam `architecture.ts` uses and for the same reason: no temp repo per
   case, and the five-minute rule survives. Goes first because c3 and c4 are meaningless if the
   distribution they are calibrated against cannot be reproduced.
2. **The gate** — c3, c4. `scripts/tasks/mergeReady.ts`. Two legs, both hard. The merge-base manifest
   read is the whole of c3's anti-gaming and is three lines given `git.fileAt`.
3. **The consumers** — c5, c6. `scripts/tasks/workPrompt.ts`, `scripts/tasks/records.ts`. Independent
   of each other.

c7 and c8 hold across all three and are not a stage.

## Decisions

**Why the import-edge census is abandoned rather than repaired.** Both graders killed it
independently and on different evidence. Its columns were overlapping sets rather than the partition
c1 claimed — 39 + 13 against 45 distinct importers of `registry.ts` — and the hub list flips depending
on which rule resolves the 26.5% of edges that carry both a shape and an answer, which in turn decides
whether `state.ts` is a hub, which is what the old Decisions rested its central argument on. Its
answer column was dominated by `export class`: `DslError` at 42 importers is thrown and not asked, and
`Cursor` is the most shape-like object in the grammar layer, so reclassifying one keyword made
`parser.ts` the worst module in the tree instead of the best. And it was defeatable in one line by a
barrel re-export, of which `src/runtime/runtime.ts:71` is already an instance. A metric with three
undecided definitions, each of which reverses its output, is not an instrument that needs tuning.

**Shape-out-degree is the good half and is deliberately not in this spec.** The dual of the refuted
metric — how many other modules' internals *this* module must know — correlates at 0.505 against the
same historical record and ranks `serialize.ts` second rather than one hundred and sixty-third, which
is the enumerator diagnosis stated as a number. It is worth having. It is not here because it is a
diagnostic and this spec is a gate, and because folding a second measurement into a branch that is
installing two hard legs into `merge-ready` is how the previous version reached nine clauses across
five production files, one of whose proof targets did not exist. It is the next spec and it now has a
validation set: any successor metric must be scored against c1's series before a line of it is
written.

**Duplication is not addressed here and this is the second time it has to be said out loud.** Five
implementations of one capability share no import edge and need not share a system, so neither the
refuted metric nor this one detects them. The author named it first and the previous version implied
it was covered by a causal story about shape-consumers, which is a story and not a detector. What
would detect it is the co-change matrix c1 already computes — file pairs that change together across
many features with no import path between them — plus the concept registry, whose failure was in its
key rather than its question: 78 of 149 distinct `produces` names in the store were never registered,
because a capability name is authored prose and two authors do not choose the same words. That is one
spec, it is next after shape-out, and it does not belong in a branch about gates.

**The gate is hard by the author's ruling of 2026-08-19, which reverses their soft ruling of the same
day.** The evidence that changed it was gathered after the first ruling and is in the graders' reports:
every reporting-only instrument in this repository has been routed around, with counts, and the two
mechanisms that ever changed behaviour both removed a path rather than annotating one. A hard gate is
affordable here only because the measurement says so — 59% of merged features already satisfy the
ceiling — and that is the difference between a gate and a stop-work order.

**c4's escape is a recorded decision and not a flag, and the ruling rate is the thing to watch.**
Forty-one percent of historical features would have needed one, which is a real risk of the escape
becoming furniture. It is accepted with the risk named rather than designed around, because the
alternative — a ceiling nobody must justify crossing — is the current state. c6 exists so the question
"is the rate falling" is answerable in twenty specs from the store rather than from anyone's
impression, and if it is not falling then the ceiling or the partition is wrong and this Decisions
entry is where that gets re-opened.

**Ownership is resolved at the merge base and this is the whole anti-gaming surface.** The one way to
satisfy c3 dishonestly is to move a file into the declared system by editing `systems.json` in the
same diff. Reading the manifest at the base closes it, costs three lines given `git.fileAt`, and needs
no new rule for anyone to remember. `audit-status` already fails on the partition being incomplete,
so "every tracked file is owned by exactly one system" is a property this gate may assume rather than
re-establish.

**The declaration is derived from the grant, so there is nothing to keep in sync.** `CLAUDE.md` names
manually-synced systems as the repository's single largest and most frequent failure mode, and a
`systems:` field beside `writes:` would be one. Resolving `writes` through `ownerOf` means the
declaration cannot disagree with the grant, and widening it is already a store event.

**The measurement is answerable over history, and the 3% that is not is stated rather than hidden.**
`System.paths` holds exact files, so a file renamed or deleted since a merge resolves to no owner
today. Ninety-seven percent of the files those 88 merges touched are still owned, which is why the
series is worth computing; the report names the unresolved count per merge rather than silently
dropping it, because a feature whose files have all since been renamed would otherwise appear to have
touched zero systems. Three of the 139 merges already show that shape.

**This spec must be implemented on its own branch cut from `main`.** c7 is false on any branch
carrying another spec's work, which is exactly how the previous version's equivalent clause was false
at birth. The commit of this document is not the implementation and does not need to satisfy c7.

## Open questions

- Whether the co-change matrix is computed here or in the duplication spec is the worker's call. c1
  needs the per-merge file sets and the matrix is one pass over them; building it now costs almost
  nothing and using it here is out of scope. Producing it and leaving it unused is acceptable; using
  it is not.
- Whether c3's leg reports every offending file or the first is the worker's call. The gate's value is
  the exit code; the message is ergonomics.
- Whether `tasks done`'s recorded cost in c6 counts test files is open, and the honest answer is
  probably both, since c1 shows the median moves from 7 to 13 on that choice alone and a series that
  does not say which it counted will be misread within a month.
- Whether 88 merges is enough to calibrate a ceiling is a fair challenge to c4 and is not settled
  here. The distribution is bimodal enough that the answer is probably yes, but the worker should say
  what it saw rather than repeat this sentence.
