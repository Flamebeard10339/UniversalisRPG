# the-cost-of-a-change-is-known-before-it-is-made

## Deliverable

This repository has no measurement of its own resistance to change, and every remedy it has attempted
has therefore been aimed at a symptom. The finding census that motivated the last three branches —
duplication ~30%, inference ~17%, proofs-that-cannot-fail ~28%, layering/missing-seam ~16% — reads as
four problems and is not. Duplication is a consumer that rebuilt an answer, inference is a consumer
that rebuilt an answer from a lossy carrier, and a missing seam is the absence of the answer that
would have been asked for. Those three are 63% of the census and they are one act: **a consumer
deriving an answer from a shape, because nothing exposes the answer.** They were remediated
separately, three times, which is why each remediation found its own surfaces and none of them
reached the sentence.

The act is measurable and is measured here for the first time. Classifying every internal import edge
in the shipped tree by what the importer consumes — a **shape** (a type, an interface, a const table:
the importer must know the internals) or an **answer** (a function: the importer knows only the
contract) — gives 2342 edges, of which 1056, or 45%, are structural. Ranked by how many modules must
know a module's shape:

    shape-in  answer-in  module
          39         13  src/content/registry.ts
          37         15  src/runtime/localized.ts
          26          6  src/grammar/section.ts
          23         15  src/runtime/state.ts
          23          4  src/runtime/session.ts
          21         37  src/grammar/parser.ts

`Registry` is imported as a type by 37 modules; `loadUniverseWithDiagnostics` is called by 10. The
registry is a data structure thirty-seven consumers walk and is not an oracle any of them asks. That
is the whole of the namespace-autocomplete report: the editor received `Registry` and had to build the
namespace, because the registry has never been asked to produce one — and "do module-level variables
belong in the list" became a decision the *feature* made because the registry never made it, so all
thirty-seven consumers make it again, independently. Five implementations of one capability is not a
surprise at thirty-seven shape-consumers; it is the predicted number.

The last row is the calibration. `src/grammar/parser.ts` is the only module in that ranking where
answers exceed shapes, and it is the one the branch immediately preceding this one converted into a
codec. The metric was derived with no knowledge of that branch and independently agrees with the one
fix that has worked, which is the reason to trust it as an instrument rather than as an opinion.

Counting the files a feature touches, which is the intuition this began as, is not the instrument.
It is post-hoc, so a worker cannot reach for it before writing; it is satisfied perfectly by one god
file; and it condemns exactly the wide invariant sweeps `CLAUDE.md` protects, where one rule across
forty files is one task. Shape-in-degree is the same intuition made available before the work and
not gameable: a module's shape-in is literally the number of files that must be read and possibly
changed if that module's internals move.

Two properties are load-bearing and are what make this a measurement rather than a second model of
the code. The classification derives its subjects from the tree, so a module written next month is
counted with no edit here. And the comparison against the branch's base is computed by running the
same pure function over a `SourceTree` read from git at the merge base — `architecture.ts` already
takes `files` and `read` as data — so **no census number is stored anywhere and there is nothing to
keep in sync.** A stored baseline would be the failure mode this repository names as its largest and
most frequent, installed inside the tool built to detect it.

The gate is soft by ruling. Nothing here changes an exit code, refuses a diff or reddens a check. The
number is reported where decisions are made — to the worker before it writes, to the auditor before
it grades, and to whoever reads `audit-status` — because the measured failure is not that people
ignored a gate, it is that nobody had the number. Across 1582 store records this repository holds
1188 findings and **2 questions**: the channel by which an agent says "this design is wrong, stop"
exists in `taskStore.ts` and has been used twice in the project's life. An agent that sees the disease
today has nowhere to put it except a finding, which by the standing rule cannot create work and is
therefore triaged as a symptom. c6 is the clause that gives that observation somewhere to go.

No application code changes on this branch, and c8 is what makes that checkable rather than promised.
`src/content/registry.ts` is the first thing this measurement will indict and it is deliberately not
touched: the instrument is built and calibrated before it is acted on, so that the change to the
registry can be shown to have moved the number rather than asserted to have helped.

Proof:

- [c1] **Every internal import edge in the shipped tree is classified, and the subject set derives
  itself.** Each edge is `shape`, `answer` or `unclassified`, decided from the *exporting* module's
  own declaration — `export function`/`export class` and a `const` whose initializer is callable are
  answers; `export interface`/`export type`/`export enum` and a `const` bound to data are shapes.
  The file set comes from `repoSourceTree()`, the enumeration `tasks system` and `tasks where` already
  walk, so a module added next month is a subject with no edit. Nothing is guessed: an export whose
  form does not decide the question is counted `unclassified` and that count is reported, rather than
  assigned to whichever bucket looks likelier.
  proof: vitest scripts/lib/architecture.test.ts
- [c2] **The cheap classifier is calibrated against the type checker, and the disagreement is
  reported rather than assumed small.** A test builds a `ts.Program` over the same subjects, classifies
  each edge from the resolved symbol's flags and call signatures, and compares. Every edge the two
  disagree on is asserted to be one the text classifier called `unclassified` — so the cheap answer
  is allowed to abstain and is not allowed to be wrong — and the run prints both totals beside each
  other. The reference measurement at commissioning is 2342 edges, 1056 shapes, 45% structural.
  proof: vitest scripts/census.test.ts
- [c3] **The comparison against the base stores nothing.** The census is computed twice through one
  pure function: once over the working tree and once over a `SourceTree` whose `files` and `read` are
  served from git at the merge base. No count, threshold or ranking is written to any tracked file,
  and the proof asserts the base-side reader never touches the working directory — so a branch cannot
  drift from its baseline, because it does not have one to drift from.
  proof: vitest scripts/lib/architecture.test.ts
- [c4] **The report names every shape hub and says what may not be done to it.** A module whose
  shape-in is at least twice its answer-in is a hub; the rule is a ratio and not a tuned threshold,
  which is why it names `registry.ts` (39:13), `localized.ts` (37:15), `section.ts` (26:6) and
  `session.ts` (23:4) and correctly does not name `parser.ts` (21:37) or `state.ts` (23:15). The
  report ranks them, prints both numbers, prints the delta against the merge base, and states the
  prohibition: do not add a consumer of a hub's shape. `audit-status` exits on exactly the condition
  it exits on today and on no condition added here.
  proof: vitest scripts/audit-status.test.ts
- [c5] **A worker is given the number before it writes.** `work-prompt` prints, for every path in the
  member's `writes` grant, that module's shape-in and answer-in and whether it is a hub, and prints
  the instruction that a grant crossing a hub is a reason to file a question rather than to proceed.
  The subjects are the grant the record actually carries, so a grant widened after dispatch is
  reported without an edit here.
  proof: vitest scripts/tasks/workPrompt.test.ts
- [c6] **Every auditor's brief carries the question an auditor currently cannot ask.** The generated
  brief contains, as a graded item beside the clauses, "what is the smallest change that would make
  this class of defect impossible, and was it made?" — and names "this spec is the wrong shape, stop"
  as a permitted answer, with `tasks question` as where it goes. The proof asserts this over every
  brief the generator can produce rather than over one sample, so a second brief shape added later
  carries it too.
  proof: vitest scripts/tasks/auditPrompt.test.ts
- [c7] **A spec says what it is aiming at before it says how.** `spec new`'s scaffold carries an
  `## End state` section, and `tasks spec show` reports whether that section is present and non-empty
  for the spec it is shown. It reports; it refuses nothing and fails nothing, and specs written before
  this branch are reported as lacking it rather than retrofitted.
  proof: vitest scripts/tasks/specCmds.test.ts
- [c8] **This branch changes no application behaviour.** No file under `src/` and no file under
  `content/` is modified. The measurement is built and calibrated before anything it indicts is
  touched, so that the change to `registry.ts` can be shown against a number that existed before it.
  proof: command git diff --name-only main...HEAD
- [c9] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Goal

Give the repository a number for its own resistance to change — derived, not stored — and put it in
front of the worker before it writes and the auditor before it grades, so that a design that will
cost seventeen files is visible in minute one instead of hour three.

## End state

    census(tree) = for each import edge, does the importer consume a shape or an answer
    hubs         = modules where shape-in >= 2 x answer-in
    report       = census(worktree) vs census(tree at merge-base), ranked, delta, hubs named
    work-prompt  = report restricted to this member's writes grant
    audit-prompt = + "what smallest change makes this impossible, and was it made?"

Five lines. Anything in the implementation that is not one of them is scope this spec did not ask
for, and this section exists so that is decidable by reading rather than by an audit.

## Stages

1. **The census** — c1, c2. `scripts/lib/architecture.ts` and `scripts/census.test.ts`. First because
   every other stage consumes it, and because the calibration is what decides whether the cheap
   classifier is honest enough to build on. If c2's disagreement set contains an edge the text
   classifier called `shape` or `answer` wrongly, stop and file a question: the remaining stages are
   worthless on an instrument that lies.
2. **The report** — c3, c4. `scripts/audit-status.ts`. The git-side `SourceTree` is the whole of c3
   and is small because `architecture.ts` was already written to take its reads as data.
3. **The consumers** — c5, c6, c7. `scripts/tasks/workPrompt.ts`, `auditPrompt.ts`, `specCmds.ts`.
   Independent of each other; each is a few lines over a number stage 1 already computes.

c8 and c9 hold across all three and are not a stage.

## Decisions

**The capability is extended, not added.** The survey found `derived architecture view` registered to
Task system over `scripts/lib/architecture.ts`, which already exposes `ImportEdge` and
`exportedNames`. The census is a field on an edge that module already computes, not a second walk of
the import graph beside it. A separate tool would be two derivations of one graph kept in agreement by
hand, which is the thing this spec is about.

**The classifier is textual and the checker is the auditor of it, not the implementation.**
`architecture.ts` is pure over `{ files, read }` and is why `tasks where` needs no temp repo and
answers in milliseconds; a `ts.Program` inside it would take that away from every caller to serve one.
So the classification reads the exporting declaration's syntax, consistent with `exportedNames`, and
c2 is a separate checker-based test that holds it honest. This is the same division
`scripts/exhaustive.test.ts` already uses — a rule about the whole tree proved from above the tree —
and its cost is paid once per suite run rather than once per query. `export const x: Fn = ...` is the
known ambiguous form and is what `unclassified` is for.

**The gate is soft, by the author's ruling on 2026-08-19.** Nothing here fails a check. The reason is
in the store rather than in intuition: 1188 findings against 2 questions says the problem is not that
warnings were ignored, it is that the number did not exist and the channel for objecting was unused.
A hard ratchet on a measurement nobody has seen yet would be a gate earning its place by sounding
rigorous, which `CLAUDE.md` names directly. Whether it hardens is a decision for after there is a
history of the number moving.

**`src/content/registry.ts` is not touched, by the author's ruling on 2026-08-19, and the tool is
required to be loud about it.** It is the worst module by this measurement and the root of the
autocomplete report, and it is left alone until the instrument exists, so that the fix is graded
against a number captured before it. c4 makes the warning a clause rather than a courtesy and c8 makes
the abstention checkable. Turning `Registry` from a shape thirty-seven modules walk into an oracle
they ask is the next spec and is not this one.

**This spec runs beside `nothing-downstream-rebuilds-what-the-load-path-decided`, whose grant is
`scripts/` whole.** That is a declared collision and it is why this grant names five files rather than
a directory — `tool-friction-backlog` was declined for exactly the mistake of granting
`scripts/tasks/` and `scripts/lib/` wholesale. The two specs are disjoint in fact: that branch's
remaining stages are `src/content` and `src/runtime`, and c8 forbids this one from entering either.
`tasks plan` is run before dispatch regardless.

**The pseudocode requirement is one clause and not a system.** c7 reports; it does not refuse a spec
without an `## End state`, and it does not retrofit the eighty specs already written. The requirement
that a worker write the ideal shape before implementing is worth having because the failure it
addresses was measured at three hours against four lines, but a gate over spec prose would be a check
on writing rather than on code, and the cheapest version that could have prevented that failure is a
section in the scaffold and a line in `spec show`.

**Why 63% of the finding census is one disease, and why proofs-that-cannot-fail is not part of it.**
Duplication, inference and missing-seam are three readings of one act and are fixed by one change:
expose the answer. Proofs-that-cannot-fail is not an architectural category at all — it is the audit
protocol failing to notice an assertion that cannot fail, it is already addressed by
`npm run mutate` and by the standing lesson about aiming the manifest before the first auditor, and
filing it alongside the other three is the category error that has been costing passes. Nothing in
this spec addresses it and nothing in this spec should.

**`state.ts` and `parser.ts` are the two rows that prove the ratio rule is not a proxy for size.**
`state.ts` has a high shape-in (23) and is not a hub because 15 modules also call it; `parser.ts` has
21 and is emphatically not one. A rule keyed on shape-in alone would have named both and would have
told the last branch to undo the codec conversion. The ratio is what distinguishes a module many
things depend on from a module many things must understand.

## Open questions

- Whether the hub ratio is 2:1 or something else is the worker's call once the full distribution is
  in front of it. The clause fixes that the rule is a ratio between the two numbers and derives its
  own subjects; it does not fix the constant. A constant chosen to make today's list come out right
  is worth saying so in the pass file.
- Whether `work-prompt`'s hub report is printed for every grant or only when a grant crosses a hub is
  the worker's call. The clause requires the number be present before writing; a brief that prints
  four zeroes on every task is noise that will teach people to skip the section.
- Whether the base-side `SourceTree` reads through `git show` per file or one `git archive` is an
  implementation choice with a wall-clock consequence, and the five-minute rule is what decides it.
  `systemView` recomputing the whole edge graph per system was measured at 210ms over 260 files and
  declined as a non-problem; a second whole-tree walk against the merge base is the first thing on
  this branch that could change that, and the measurement belongs in the pass file.
- Whether `unclassified` edges should be reported per-module or only in the total is open. If the
  count is large the buckets are not trustworthy and c2 will say so before this matters.
