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

The gate is in and its proof derives its subjects (c2). c1 is **not met**: three cycles remain,
closed by nine imports. What has landed is measured below, against the tree at the merge base.

| | base | now |
|---|---|---|
| import cycles | 4 | 3 |
| largest indivisible unit | **28** | **8** |
| modules carrying it | 79 of 153 (52%) | 51 of 158 (32%) |
| `src/runtime` units, over its modules | 15 of 42 | **39 of 46** |
| `src/runtime` stratification depth | 6 | **15** |
| median transitive closure | 82 | 50 |
| mean closure | 53.9 | 47.5 |
| p90 closure | 91 | 96 |
| median largest unit *in* a closure | 28 | **4** |
| mean largest unit in a closure | 15.3 | 4.0 |

The result the branch was opened to test is the `runtime` row. Nobody declared a depth of 15, and
no manifest holds it: `grammar` is 7 deep and `content` 9 because they are acyclic, and `runtime`
was 6 because two thirds of it was one unit. Removing the cycle is what produced the order, and
the order is derived from the imports rather than configured anywhere — which is the whole of the
claim that acyclicity is the precondition, and that no finer layer rule is needed to get it.

p90 closure rose, as predicted for any repair that adds modules. Five were added — `error.ts`,
`sectionKind.ts`, `pruning.ts`, `actionEnd.ts`, `modalOption.ts` — and each exists because two
modules needed one declaration and it was living above one of them.

Two secondary results worth keeping:

- **Ten of the original twenty-three closing imports were type-only**, and every one of those was
  a declaration sitting above something that needed it. The repair for all ten was the same move,
  and none of them changed behaviour. The value edges are the expensive ones and are what is left.
- **`clearBuffs` is the counter-example to the move being mechanical.** It looked structural, and
  "an actor holding nothing is spelled as absent" turned out to be buffs.ts's rule. Four tests
  caught it. A declaration can move down; a decision cannot, and telling them apart is the work.

### The nine imports still closing a cycle

```
src/content/registry.ts  -> src/content/references.ts       Registry is declared above its validators
src/content/registry.ts  -> src/content/serialize.ts        printSegments, which takes no Registry
src/runtime/carriedScreen.ts -> src/runtime/planeScreen.ts  planeFrame
src/runtime/effects.ts   -> src/runtime/modals.ts
src/runtime/encounter.ts -> src/runtime/effects.ts          the pool deltas
src/runtime/stats.ts     -> src/runtime/encounter.ts        actorEntity, participants, sideOf
src/ui/driver.ts         -> src/ui/agent/testHarness.ts     installTestHarness, in a dead branch
src/ui/testSurface.ts    -> src/ui/agent/surfaces.ts
src/ui/testSurface.ts    -> src/ui/agent/testHarness.ts
```

Nine calls, not nine declarations: each is a decision about where behaviour belongs. `printSegments`
is the nearest one — it takes no `Registry`, so it does not belong in the module that needs one, but
it carries two grammar-value printers with it and those belong in `src/grammar` beside the parsers
they invert, which is a second question and probably a second spec.
