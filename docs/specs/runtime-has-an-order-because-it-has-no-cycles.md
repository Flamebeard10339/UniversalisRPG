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
