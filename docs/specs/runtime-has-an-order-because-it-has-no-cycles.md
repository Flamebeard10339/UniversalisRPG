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

## Audit passes

### Pass 1 — 2026-08-19

- base: `ba96a5bfb249c05299a52350be81fe51c65760db`
- head: `1f7713f4c3793ad5b867565cb06e8b3ac5636d6d`
- proof 1: met — Re-derived independently of Tarjan: a Kahn peel over `shippedModules()` (221 shipped modules, 163 under `src/`), edges resolved through the repo's own `importedPaths`/`resolveModule`, leaves an empty live set — no module is on a cycle anywhere, and there are no self-loops either, so the `length > 1` filter is not hiding one. Re-run:
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-runtime-has-an-order-because-it-has-no-cycles-pass1-kahn.txt
  => { shippedTotal: 221, srcShipped: 163, nodesOnACycleAnywhere: [], runtimeModules: 49, runtimeMaxDepth: 21, selfLoops: [] }
The merge base was measured the same way, reading blobs out of `git show ba96a5b:<file>`, and reproduces the Deliverable exactly: 4 cycles of sizes [28, 4, 4, 3] over 153 src modules. Re-run:
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-runtime-has-an-order-because-it-has-no-cycles-pass1-base.txt
The detector itself is guarded in its own file: mutating Tarjan's back-link (`onStack.has(target)` to false) is KILLED by 5 tests in scripts/lib/acyclic.test.ts, and raising the component-size filter from 1 to 2 is KILLED by 2. `layer-check` exits 0 and says so. The clause reads "under `src/`" and what shipped is wider — the graph covers `scripts/` too — so the implementation exceeds its own text rather than falling short of it.
- proof 2: unmet — The behaviour is correct today and is held there by nothing. Injecting a synthetic cyclic tree through `runLayerCheck`'s effects gives exitCode 1, names both members and names the closing import, and there is no exemption list, threshold or baseline anywhere in the cycle path. Re-run:
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-runtime-has-an-order-because-it-has-no-cycles-pass1-gate.txt
But three mutations that turn the gate back into exactly the report c2 forbids all SURVIVED the whole 3764-test suite, escalated from scripts/lib/layers.test.ts:
  c2-gate-reports-instead-of-failing    SURVIVED  0 failed of 3764  (the whole `if (report.cycles.length > 0)` branch never runs: a cycle is found and layer-check exits 0)
  c2-gate-names-no-closing-import       SURVIVED  0 failed of 3764
  c2-gate-names-no-module-on-the-cycle  SURVIVED  0 failed of 3764
  manifest: C:\Users\yonat\AppData\Local\Temp\audit-runtime-has-an-order-because-it-has-no-cycles-pass1-mutations.json
The clause names `vitest scripts/lib/acyclic.test.ts` as its proof, and that file never calls `layerCheckOutput` or `runLayerCheck`; layers.test.ts gained `cycles: []` on three fixtures and one `checkLayers` expectation, and no case at all over the failure path. What is proved is that a cycle is detected. That it fails the run, and that the failure names what to invert, is the sentence c2 is, and a mutation deleting it is green everywhere. Graded unmet rather than met-with-a-finding because the promise is a durable property of the gate, not a state of the tree, and this pass verified it by hand exactly once.
- proof 3: met — `src/runtime/state.ts` still declares `GameState` (state.ts:110) and imports six modules: `../grammar/section`, `../grammar/tagClause`, `./error`, `./localized`, `./rng`, `./said`. None imports it back, directly or transitively — that is c1's Kahn result restricted to this file, since a back-edge of any length would put `state.ts` on a cycle and the live set came back empty. The seven back-edges the clause names are gone by the ruling it cites: `Seat`, `Cadence`, `ActorState`, `ActiveAction`, `Journey`, `BuffInstance`, `BuffTable`, `Instance`, `InstanceTable`, `Deficit`, `Populations`, `DialogueCursor`, `ModalAnswers` and `ModalFrame` moved down into `state.ts` character-identical from encounter/journey/buffs/instances/population/dialogue-runtime/modals, and `endAction`/`endJourney` went the other way into the new `actionEnd.ts` with unchanged bodies. `clearBuffs` moved into `state.ts` and back out again inside commit b4d15ac; its net diff against the merge base is position-in-file only, so the decision the spec records as caught is not in the tree.
- proof 4: met — Same run as c1: `src/runtime` holds 49 shipped modules, every one of them its own unit (no member of it appears in the empty cycle set), against a merge base of 42 modules resolving to 15 units — measured over the base tree the same way. Its stratification depth is 21, computed as the longest path through its own internal imports and declared in no file:
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-runtime-has-an-order-because-it-has-no-cycles-pass1-kahn.txt   => runtimeModules: 49, runtimeMaxDepth: 21
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-runtime-has-an-order-because-it-has-no-cycles-pass1-base.txt   => runtimeModules: 42, runtimeUnits: 15
"42 modules resolve to 42 units" is now 49 of 49 because the branch added ten modules; the substance of the clause — one unit per module, depth derived — holds, and the spec's own table records the revised counts. Nothing new to keep in sync: the diff adds no manifest, no per-file configuration and no entry to `OUTSIDE_STACK`, and severing the composition that carries cycles into the report (`const cycles = findCycles(...)` to `[]`) is KILLED by layers.test.ts.
- proof 5: met — Measured across the merge base rather than asserted. A worktree at ba96a5b (node_modules junctioned) loaded all three shipped `content/*.dsl` through that commit's `src/content/registry.ts`; HEAD loaded the same three through `src/content/load.ts`. Canonicalised whole load result (registry, parsed, modules, diagnostics, loadedModules, disabledModules), Maps and Sets sorted, hashed:
  base: registryBytes 330102, registrySha 058f85c2ab7db087e262b9722689b6aebdee2ac6fd358e712ea81334dbb94ab0
  head: registryBytes 330102, registrySha 058f85c2ab7db087e262b9722689b6aebdee2ac6fd358e712ea81334dbb94ab0
Serialising every module back out through `roundTripUniverse` and hashing the printed text:
  base: printedBytes 51659, printedSha 327df9cc699b2b945bad6c288046bb4599ed11328d0332c6f08bc142bb6af430, differences [], diagnostics 0
  head: printedBytes 51659, printedSha 327df9cc699b2b945bad6c288046bb4599ed11328d0332c6f08bc142bb6af430, differences [], diagnostics 0
Re-run: C:\Users\yonat\AppData\Local\Temp\audit-runtime-has-an-order-because-it-has-no-cycles-pass1-registry-base.txt and -registry-head.txt. The 1292/1283-line registry to load split was checked as a multiset of non-import lines: 1237 against 1237, one difference, `WORLD_BIT` gaining `export`. `npm test` is green at 3764. Two changes in the range are decisions rather than moves and are filed as findings below; neither is observable to a player, so c5 stands, and one of them is a coverage loss rather than a behaviour change.
- proof 6: unmet — `npm run tasks -- merge-ready` prints "NOT merge-ready". Every leg that measures the code is green — tsc, npm test (3764), layer-check, audit-status, doctor (28 warnings, which do not fail it), bytes, tree clean, base not moved. The two red legs are the spec's own standing: 1 open member (src-holds-no-import-cycle-and-layer-check-keeps-it-that-way) and no recorded audit pass. Filing this pass clears the second only if the clauses it grades come back clean, and c2 is unmet, so the clauses leg stays red on c2 rather than on anything mechanical.
