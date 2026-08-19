# runtime-has-an-order-because-it-has-no-cycles

## Deliverable

`src` becomes acyclic, and `layer-check` gains the rule that keeps it so. Today four import
cycles exist and one of them is 28 of `src/runtime`'s 42 modules, bound by 131 internal edges;
79 of 153 modules carry it in their transitive closure, so for half the tree the reading list
contains a lump that cannot be read one module at a time. The repair is not a metric and not a
budget: the shape that makes a module reachable in an order is the absence of a cycle through it,
and a directed acyclic graph always has a stratification while a cyclic one has none. `grammar`,
`content` and `ui` are already near-acyclic and are 6-9 strata deep by their own imports, which
nobody declared. `runtime` is the only directory in the repository where "what does this sit on
top of" has no answer.

Proof:

- [c1] **`src` holds no import cycle.** Every strongly connected component of the module graph
  over `shippedModules()` under `src/` has exactly one member. The proof derives its subjects
  from the tree rather than naming files, so a cycle introduced next month fails it.
  proof: `vitest scripts/lib/acyclic.test.ts`
- [c2] **The rule is a gate, not a report.** `npm run layer-check` exits non-zero on a cycle and
  names the modules on it and the imports that close it. It has no exemption list, no threshold
  and no baseline file — the target is one member per component and one is not an adjustable
  number.
  proof: `vitest scripts/lib/acyclic.test.ts`
- [c3] **`state.ts` declares the state shape and calls nothing that reads it.** The module that
  declares `GameState` imports no module that imports it back. Its seven back-edges today are
  the shape of a `GameState` field asked for from the module that also owns that field's
  behaviour; the declaration goes below everything that asks, which is the ruling already
  recorded for `FIGHT_SCOPED` on this same file on 2026-08-14.
  proof: `vitest scripts/lib/acyclic.test.ts`
- [c4] **`src/runtime` acquires an internal order.** Its 42 modules resolve to 42 units rather
  than 15, and its stratification depth is derived from its imports rather than declared
  anywhere. No new manifest, no per-file configuration, nothing to keep in sync.
  proof: `vitest scripts/lib/acyclic.test.ts`
- [c5] **Nothing observable changes.** Every module under `content/` parses to a registry
  deep-equal to the one it parsed to at the merge base and prints to byte-identical text, and
  the suite is green. This branch moves declarations and inverts imports; it decides nothing
  differently.
  proof: `npm test`
- [c6] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: `npm run tasks -- merge-ready`

## Goal

Give `src/runtime` a reading order, so that a change to one of its modules can be understood
from that module and the interfaces beneath it rather than from twenty-eight modules at once.

## Decisions

**Adds** the acyclicity rule to `layer-check`, which already owns "which import is allowed".
It is the same gate, not a second one: `layer-check` is the only gate in this repository never
routed around, it has no knob, and cycles are the one thing it currently permits — its own
comment says so ("Permits cycles *within* a layer"). A separate cycle gate would be a second
artifact answering the same question.

**Extends** `scripts/lib/layers.ts`, which already derives the graph this rule needs.
`scripts/lib/architecture.ts` already resolves import specifiers against the tree; both are
reused rather than reimplemented.

**Retires** nothing. **Takes over** nothing.

Cycle repair is by moving declarations down, never by adding an indirection layer or a
`.types.ts` per module. Ten of the twenty-three back-edges are already type-only, so they carry
no implementation and the move is mechanical; the rest are behaviour that sits on the wrong side
of a boundary. A `X.types.ts` per hub was modelled during research and raises p90 closure
because it adds modules; moving a declaration to the module that already owns the shape adds
none.

The precedent is on the record: the 2026-08-14 ruling on `src/runtime/state.ts` repaired
`state -> encounter -> stats -> buffs -> state` by moving `FIGHT_SCOPED`, `templateOf` and
`isFightScoped` down into `state.ts`, because the cycle had broken `instances.ts`'s `KINDS`
initialisation when `instances.test.ts` was the entry point. That is the incident that earns
this gate its place: a cycle here has already produced a live initialisation-order defect, and
the repair chosen then is the repair generalised now.

## Open questions

None.

## Where it stands

**c1 is met.** `src` holds no import cycle, `layer-check` exits 0 and says so, and the whole
suite is green at 3764 tests. All four cycles are retired; `merge-ready` passes every mechanical
gate and is left only wanting an audit.

| | base | at c1 open | now |
|---|---|---|---|
| import cycles | 4 | 3 | **0** |
| largest indivisible unit | 28 | 8 | **1** |
| modules carrying it | 79 of 153 (52%) | 51 of 158 (32%) | **none: there is no unit to carry** |
| `src/runtime` units, over its modules | 15 of 42 | 39 of 46 | **49 of 49** |
| `src/runtime` stratification depth | 6 | 15 | **21** |
| median transitive closure | 82 | 50 | 44 |
| mean closure | 53.9 | 47.5 | 46.0 |
| p90 closure | 91 | 96 | 99 |
| median largest unit *in* a closure | 28 | 4 | **1** |
| mean largest unit in a closure | 15.3 | 4.0 | **1** |

The `now` column was taken by re-measuring, and the same script reproduces every row of the
`at c1 open` column exactly except the two closure averages, which come out 0.5 higher. A
closure-row difference of 1 or less between columns is therefore not a reading.

The result the branch was opened to test is the `runtime` row, and it held all the way down.
Nobody declared a depth of 21, and no manifest holds it: `grammar` is 7 deep and `content` 9
because they are acyclic, and `runtime` was 6 because two thirds of it was one unit. Every unit
count and every depth here is derived from the imports and configured nowhere, which is the whole
of the claim that acyclicity is the precondition and that no finer layer rule is needed to get it.

p90 closure rose from 91 to 99, as predicted for any repair that adds modules. Ten were added
over the branch — `error.ts`, `sectionKind.ts`, `pruning.ts`, `actionEnd.ts`, `modalOption.ts`,
then `useTestSurface.ts`, `load.ts`, `roster.ts`, `carried.ts` and `modalStack.ts` — and each
exists because two modules needed one thing and it was living above one of them. The median fell
from 82 to 44 over the same period, which is the trade taken knowingly: the typical module reads
half of what it used to, and the widest one reads eight more.

### How the twenty-three closing imports actually went

Ten were type-only and every one was a declaration sitting above something that needed it; the
repair for all ten was the same move and none changed behaviour. Of the thirteen value edges,
the split at the end was:

- **Six were a declaration in the wrong file after all**, once the question was asked precisely.
  `sideOf` reads a `Sided` and two strings and went to `grammar/action.ts`, where `Sided` is
  declared — no module added. `hasPool` was a `statValue` predicate wearing an encounter's name.
  `Registry` was declared in the file that builds one rather than in one beneath it.
- **Four were a module that was two modules.** `testSurface.ts` was a declaration and a hook;
  `registry.ts` was a shape and a load path; `carriedScreen.ts` was a list and the screen that
  asks about it; `modals.ts` was a stack and a table of screens. In three of the four the seam
  was already visible in a caller — `session.ts` imported the carried rows and none of the
  screen, and 42 files import `Registry` and never a loader.
- **Three closed by subtraction.** Once `actorEntity` and `hasPool` moved, `effects.ts` wanted
  nothing else from `encounter.ts` and the edge went away rather than inverting.
- **One was a side effect in the wrong place.** `createDriver` hung `window.__test` off a global
  from inside a factory that had to ask `typeof window !== 'undefined'` because it did not know
  it was in a browser. The entry point does know. Deleting the edge deleted the guard.

Three results worth keeping:

- **`clearBuffs` is the counter-example to the move being mechanical.** It looked structural, and
  "an actor holding nothing is spelled as absent" turned out to be `buffs.ts`'s rule. Four tests
  caught it. A declaration can move down; a decision cannot, and telling them apart is the work.
- **Where a query lands is not cosmetic.** `encounter.ts` imports `hostile` and no loader, and
  `contribution.ts` imports `formatModuleDiagnostic` and no loader. Sending either up with the
  behaviour it sits beside would have bought an edge back by putting a whole load path in their
  closure. A pure query over a shape belongs with the shape, and the closure numbers are how
  that gets checked rather than argued.
- **Two mapped tables over one key set are not two lists to keep in sync.** Splitting the modal
  definitions left `{ [K in ModalName]: ... }` in two files, and adding a member to `ModalFrame`
  fails both at the compiler. That is the distinction between a derived proof and an enumeration,
  applied to a table rather than a test.
