# the-cost-of-a-change-is-known-before-it-is-made

## Deliverable

Two earlier versions of this spec proposed proxies and both were refuted by independent graders before
dispatch. The first ranked modules by how many others import their types; it correlated with actual
change frequency at Spearman 0.195 and scored `src/content/serialize.ts` — the most-changed file in
the tree — as perfectly safe. The second counted systems touched per feature; it would have hard
blocked `reimplement-localization`, the branch `docs/workflow.md` holds up as the model, and
`openUniverse`, the cleanest de-duplication in the repository's history. Both are at `7b8463a` and
`501a9ed`, and rows 85 and 86 of `docs/dsl-rewrite/delegation-experiments.md` hold the gradings. The
pattern in both failures was the same: a metric was chosen because its data was already lying around,
and was never checked against the question that was asked.

The question that was asked is *how many files must be understood in order to change one*. That has
an exact answer in graph theory and it was computable the entire time. In the undirected import graph,
two modules lie in the same **biconnected block** when there are two independent paths between them,
so no single module sits between them as a seam. The size of the block containing a module is
therefore not a proxy for how much must be understood to change it — it is that quantity. An
**articulation point** is a module whose removal disconnects the graph, which is what a seam is.

Measured on this tree, over `src/` and `scripts/` `.ts`/`.tsx` files excluding `*.test.*`, with
imports resolved from relative `from '…'` specifiers:

    modules 211        pure data modules 6        directed import edges 1030

    articulation points          10 of 211  (5%)
    largest biconnected block   157 modules, of which 155 export behaviour
    median module's block       157

    import cycles (SCCs > 1)     4
      28  src/runtime/{forwardProgress, hooks, journey, planeReport, growth, planeScreen, …}
       4  src/content/{registryDiff, serialize, references, registry}
       3  src/content/{locale, action, module}
       2  src/ui/{agent/surfaces, testSurface}

**Seventy-four percent of the codebase is one indivisible blob.** For the median module the number of
files that may have to be understood to change it is 157, because no articulation point exists
anywhere between them. That is the number this branch installs a gate around, and the target is 30.

It is not held together by a few cuttable cycles. Removing the single best candidate — `src/ui/App.tsx`
— takes the blob from 157 to 154. Removing every internal edge in `src/runtime` takes it to 148. The
blob is densely two-connected, which is why every previous search for the one file that is the missing
seam has come back empty, including both of this spec's predecessors.

The cause is on the first line of the measurement. **Six of 211 modules export only types.** The other
205 mix data with behaviour, so importing a type drags the behaviour declared beside it into the
importer's block. `Registry` is the case this repository keeps rediscovering — a type and its engine
in one module with 37 consumers, every one of them pulled into the blob by an import it needed for the
type alone. This is why the counted quantity is the number of **behaviour** modules in the largest
block rather than all of them: extracting a type into a data-only module moves its consumers' edges
onto a module that is not counted, and the number falls. The metric rewards precisely the change that
fixes the thing.

And it has the one property both predecessors lacked, which is the reason it can carry a hard gate.
**Adding an import can only merge blocks; only removing a dependency splits one.** A wrapper function,
a barrel re-export, a trivial getter, a moved type alias — every evasion that defeated the earlier
metrics adds an edge, and adding an edge can only make this number worse. The gradient points at one
behaviour and it is the behaviour that is wanted. The one move that lowers the count without improving
anything is concatenating two modules in the blob into one, which buys one point per merge; c5 names
it rather than claiming it away, because the previous two versions each claimed non-gameability and
each was wrong within a day.

Proof:

- [c1] **The graph, its blocks, its articulation points and its cycles are derived from the tree, and
  the report states the rule it counted under.** Subjects are `shippedModules()`, the enumeration
  `layer-check` already sweeps, so a module written next month is counted with no edit; where that set
  differs from the filter this spec measured under, the difference is reported rather than absorbed.
  Edges are relative `from '…'` specifiers resolved against the tree, re-exports included. The report
  prints module count, pure-data count, edge count, every SCC of size > 1, the articulation points,
  and the block sizes — each beside the rule that produced it, because both predecessors published a
  headline that could not be reproduced from their own clause text.
  proof: vitest scripts/lib/moduleGraph.test.ts
- [c2] **The baseline is the merge base and is stored nowhere.** The same pure function runs over a
  `SourceTree` whose `files` and `read` are served from git at the merge base, which is the seam
  `architecture.ts` already exposes. No count, ceiling or ranking is written to any tracked file, so
  a branch has no baseline to drift from.
  proof: vitest scripts/lib/moduleGraph.test.ts
- [c3] **`merge-ready` exits non-zero when a branch makes the graph worse.** Three quantities, none of
  which may increase against the merge base: the number of behaviour modules in the largest
  biconnected block, the number of SCCs of size greater than one, and the size of the largest SCC.
  This is the ratchet and it is passable today by any branch that does not regress. The proof drives
  the real leg over a fixture whose diff adds one import that merges two blocks, and asserts the exit
  code rather than the message.
  proof: vitest scripts/tasks/mergeReady.test.ts
- [c4] **CI is red until the largest behaviour block is 30 or fewer.** A step in
  `.github/workflows/test.yml` exits non-zero while the count exceeds 30, prints the count, the
  target and the distance, and names the largest block's members. It is red today at 155 by design
  and by the author's ruling of 2026-08-19, and 30 is explicitly provisional — c6's record is what it
  will be re-set from. The step is one npm script so that the condition CI fails on and the condition
  a person can run locally are the same command rather than two that must agree.
  proof: command npm run graph-status
- [c5] **The evasions that defeated the predecessors are proved not to work here, and the one that
  does is named.** Three fixtures: adding a wrapper function that re-exports an existing dependency
  does not reduce the count; a barrel module that re-exports a blob member does not reduce it; and a
  module moved from `src/` to `scripts/` is still counted, because subjects come from
  `shippedModules()` and `scripts/printedWords.test.ts:18` records what walking `src` alone once cost.
  The fourth — concatenating two blob modules into one, which lowers the count by one and improves
  nothing — is asserted to lower it, so the report says out loud that this is possible rather than the
  spec claiming an immunity it does not have.
  proof: vitest scripts/lib/moduleGraph.test.ts
- [c6] **Every run of the gate records what the number was, so 30 can be re-set from evidence.**
  `tasks done` writes the closing count onto the event it already emits, derived once from git at
  close and never recomputed. The target is arbitrary today and is admitted to be; this is the series
  that decides what it should be, and without it the re-evaluation the author asked for has nothing
  to read.
  proof: vitest scripts/tasks/records.test.ts
- [c7] **A worker is given the number before it writes.** `work-prompt` prints, for every path in the
  member's `writes` grant, whether that module is in the largest block, the block's current size, and
  the distance to target. The subjects are the record's own grant, so a grant widened after dispatch
  is reported with no edit here.
  proof: vitest scripts/tasks/workPrompt.test.ts
- [c8] **The gate holds on the branch that builds it.** The implementation branch is cut from `main`,
  its diff names no file outside this member's `writes` grant, and its own c3 leg passes — which it
  does trivially, since nothing here imports from `src/`. This replaces the second version's
  equivalent clause, which was false at the commit that introduced it.
  proof: command git diff --name-only main...HEAD
- [c9] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Goal

Give the repository a hard, derived, un-evadable bound on how much must be understood to change one
module, hold it where it is, and turn CI red until it reaches a size a person can hold in their head.

## End state

    graph(tree)  = modules, relative imports, undirected
    blob         = |behaviour modules in the largest biconnected block|     -- 155 today
    cycles       = SCCs of size > 1                                        -- 4 today
    ratchet      = merge-ready FAILS if blob, |cycles| or max|cycle| rose vs the merge base
    target       = CI FAILS while blob > 30
    tasks done   = record blob, so 30 can be re-set from evidence

Six lines. Anything in the implementation that is not one of them is scope this spec did not ask for.

## Stages

1. **The graph** — c1, c2, c5. New `scripts/lib/moduleGraph.ts`, pure over `{ files, read }`, the
   same seam `architecture.ts` uses and for the same reason: no temp repo per case, and the
   five-minute rule survives. c5's fixtures are written here, beside the algorithm, because an
   anti-evasion proof written after an auditor names the evasion is the 3.5-hour failure `CLAUDE.md`
   records.
2. **The two gates** — c3, c4. `scripts/tasks/mergeReady.ts` and `.github/workflows/test.yml`. The
   ratchet and the target are separate legs with separate exit reasons on purpose; see Decisions.
3. **The consumers** — c6, c7. `scripts/tasks/records.ts`, `scripts/tasks/workPrompt.ts`.

c8 and c9 hold across all three and are not a stage.

## Decisions

**Why this metric and not the two that failed.** Block size is not correlated with the question, it
*is* the question: two modules are in one block exactly when no single module separates them, so the
block is the set that must be understood together. The predecessors were proxies and were beaten by
the same evasions — a barrel re-export defeated the first, a `tasks decision` any worker could issue
defeated the second. Neither evasion works here, and c5 proves it with fixtures rather than asserting
it in prose, which is what both predecessors did.

**The count is over behaviour modules, and that is the whole design.** Six of 211 modules export only
types. Counting all 157 would make extracting a type into a data-only module a no-op; counting the 155
that export behaviour makes it the cheapest way to move the number, because the extracted module stops
being counted and its importers stop being dragged into the block by it. The author's own framing —
"everything that is not a data structure" — is what this implements, and it is the reason the gate
does not merely forbid damage but points at a specific repair.

**The ratchet blocks merges and the target reddens CI, and they are deliberately not the same leg.**
The author asked for CI to be red until the codebase is manageable, and c4 delivers exactly that. c4
is *not* in `merge-ready`'s blocking set, and this is the one place this spec departs from a literal
reading of the instruction. If a permanently-failing condition blocked merges, no branch could land —
including the branches that reduce the number — and the target would prevent its own satisfaction.
So the standing red lives in CI where a standing signal belongs, and the thing that refuses a merge is
c3, which is passable today and fails exactly when someone regresses. If the author would rather c4
also block merges, moving it is one line and this paragraph is the argument to overrule.

**Existing cycles are not grandfathered, because a grandfather list is a manually-synced system.**
`CLAUDE.md` names that as the repository's largest and most frequent failure mode, and an exemption
file for the four SCCs would be one. c3 ratchets the count and the largest size against the merge base
instead, so the four are held where they are and a fifth is refused, with nothing stored and nothing
to keep in agreement. Removing them is real work in `src/runtime` and `src/content` and is not in this
branch's grant.

**Thirty is arbitrary and is recorded as arbitrary, by the author's ruling of 2026-08-19.** Nothing
here derives it and no measurement supports it over 25 or 40. c6 exists so that the re-evaluation the
author asked for reads a series rather than an impression, and this entry is where the number is
re-opened. A target chosen to be re-set is honest; a target defended after the fact would not be.

**No single change splits the blob, and the spec says so rather than implying a first target.**
Removing `src/ui/App.tsx` moves 157 to 154; removing every internal edge in `src/runtime` moves it to
148. Any plan that names one file as the seam is wrong, and the previous two versions each named one.
Getting from 155 to 30 is a sequence of data/behaviour separations whose individual effects are
unknown until each is made, which is exactly why the instrument is built before any of them and why
c6 records each step.

**This branch changes no application code.** Its grant is four files under `scripts/` plus the CI
workflow. That is what makes c8 true and it is why the ratchet leg passes trivially on the branch that
installs it — a property worth stating, because the second version's equivalent clause was false at
birth and neither grader had to look hard to find it.

**What this does not detect, stated plainly for the third time.** It does not find two modules
independently implementing one capability. `scripts/exhaustive.test.ts`, landed on
`nothing-downstream-rebuilds-what-the-load-path-decided`, detects re-enumeration of a discriminated
union's members and is green over 20 switches; that is one shape of duplication and not the class.
`serialize.ts` and `referenceSites.ts` still change together in 15 of 62 features with no import
between them. Nothing in c1–c9 sees that, and the honest expectation is that shrinking the blob makes
it visible rather than fixing it.

## Open questions

- Whether `moduleGraph.ts` shares `resolveImport` with `architecture.ts` or carries its own is the
  worker's call; sharing is preferable and the reason to deviate would be that `architecture.ts`
  resolves for a different purpose and the two would drift.
- Whether c4's step runs on every CI leg or only the ubuntu one is open. The five-minute rule decides
  it, and the graph build measured a few seconds over 211 modules, so both are probably affordable.
- Whether the ratchet should also refuse a *new* articulation point being destroyed — a branch can
  leave the blob's size alone while removing a seam elsewhere — is a real hole and is left open
  deliberately. Adding articulation-point count as a fourth ratcheted quantity is a small change; the
  reason it is not in c3 today is that it has not been measured for false positives and the author
  should see the series first.
- Whether `tasks done`'s recorded count in c6 should also record the block's membership is open. A
  size alone will not say which repair moved it.
