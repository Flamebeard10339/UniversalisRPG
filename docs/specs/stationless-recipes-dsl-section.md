# stationless-recipes-dsl-section

## Deliverable

Half of what this task's name asks for already exists. `# recipe` is a first-class DSL section with
its own schema, `station:` maps to `requiresCapability`, and the schema says outright that absent
means craftable anywhere — all of it in place before the record was settled. What the evidence was
really deciding is where recipes are *not*: not scoped under an item, because a multi-input recipe
has no owning ingredient and nothing picks between water and flour; and not scoped under a location,
because being craftable anywhere is not a property of the room you happen to stand in. Both halves of
that are recorded here and neither needs code.

What is left is one loop and a surface. `session.ts` pushes every craftable recipe into the location's
choice list, next to the doors and the entities, under a `TODO(inventory-crafting)` saying they
clutter it. This branch takes crafting out of the room entirely and gives it one surface of its own —
a craft modal, which is why it waits on `first-class-modals`. **Every** recipe goes there, stationed
or not: crafting is one thing the player learns one place, rather than a thing that is sometimes in
the room and sometimes elsewhere depending on a property of the recipe they cannot see.

The list is what the player could plausibly act on: recipes they hold the inputs for. Holding the
inputs and standing by the station means craftable; holding the inputs without the station means
listed and gated, naming what is missing, so the surface teaches where to go. Lacking the inputs means
not listed, which keeps the list a set of choices rather than an encyclopedia and reveals nothing the
player has not already gathered. There is no recipe-learning concept in the DSL and this branch does
not invent one.

That distinction is not available today. `recipeCraftable` returns one boolean folding two different
failures — inputs short, and capability not provided — so a surface that gates on a missing station
cannot tell which happened. Separating them is the model half of this branch and the only part with
no GUI in it.

| the player                                        | the craft surface shows                                   | the room shows |
| -------------------------------------------------- | ---------------------------------------------------------- | -------------- |
| holds water and flour, dough needs no station        | `Craft dough`, craftable                                    | nothing        |
| holds dough, is standing by the oven                 | `Craft bread`, craftable                                    | nothing        |
| holds dough, is nowhere near an oven                 | `Craft bread`, gated, naming the oven                       | nothing        |
| holds neither                                       | neither recipe                                              | nothing        |
| holds dough, and the oven entity is gone from content | `Craft bread`, gated, naming the capability rather than a title | nothing        |

The room column is the point: it is empty in every row. Crafting leaves the location's action list
whether or not a station is present, and `craft:` remains a directive throughout, so nothing this
branch does changes what a `# test` can drive.

Proof:

- [c1] Craftability answers *why*, not just whether. A recipe reports craftable, short of inputs, or
  missing its station, as three distinct states rather than one boolean, so a caller can gate and
  explain without re-deriving either check.
  proof: vitest src/runtime/recipe.test.ts
- [c2] No recipe appears in a location's choices. The craft entries leave `session.ts`'s choice
  assembly, including stationed ones, and no room lists a craft under any content.
  proof: vitest src/runtime/session.test.ts
- [c3] The craft surface lists what the player holds inputs for, and nothing else. A recipe whose
  inputs are short is absent; a recipe whose inputs are held is present, marked craftable when its
  station is satisfied and gated when it is not.
  proof: vitest src/runtime/session.test.ts
- [c4] A gated entry names what is missing. It carries the station's title where an entity in content
  provides that capability, and the capability's own name where none does, so the gate is actionable
  rather than a refusal.
  proof: vitest src/runtime/session.test.ts
- [c5] Crafting is unchanged as a mechanism. `craft:` still works as a directive, `recipeCraftable`'s
  answer for a fully satisfied recipe is what it was, every shipped `# test` passes byte-identical,
  and no authored content is edited.
  proof: npm test
- [c6] The surface is a modal, not a second room list. Crafting is reached through the modal system
  `first-class-modals` settles, so this branch adds no parallel presentation concept and no second
  way for a blocking surface to open.
  proof: vitest src/runtime/session.test.ts

## Decisions

- **The section question is already answered and is recorded, not built.** `# recipe` has been a
  top-level section with its own schema since before this record was settled, so the deliverable is
  the surface. The record's `files: src/content/module.ts` is misdirected — no section kind is added
  or moved — and the region this branch actually touches is `session.ts`'s choice assembly and the
  craftability check beneath it.
- **One crafting surface, not two.** Stationed recipes could defensibly have stayed in the room,
  since the oven being present is why bread is craftable at all. They do not, because splitting
  crafting across two places asks the player to know which recipes need a station before they can
  guess where to look — a property of the recipe they cannot see from the outside. One surface is one
  thing to learn.
- **The list is choices, not an encyclopedia.** Listing every recipe gated by whatever is missing
  would double as a crafting guide and reveal the whole tree from the first room, which is a
  content-reveal decision rather than a UI one. Gating on inputs held keeps the surface to what the
  player could act on and needs no new authoring. A `hidden if:` on recipes was considered and
  rejected here: it is new grammar, it is authoring work on every recipe, and grammar design belongs
  with `combat-encounter-grammar` rather than smuggled into a surface change.
- **Splitting the craftability answer is the model half and the only part with no GUI in it.**
  `recipeCraftable` folds "inputs short" and "no station here" into one `false`, which is exactly
  enough for the room list it was written for and not enough for a surface that must explain a gate.
  c1 is separable from the rest and can be proven without a modal existing.
- **This waits on `first-class-modals` and does not invent a surface.** The evidence named a craft
  modal, and the alternative — building a second blocking-presentation concept here and reconciling
  it later — is the parallel-system failure this repository names outright. The cost is real: this
  sits behind `save-fixture-migration`, `result-application-seam` and `first-class-modals`.
- **`craft:` stays a directive and nothing about testing changes.** The directive surface is how
  `# test` drives crafting, and it is independent of what the choice list holds, so this branch
  cannot make a regression unwritable.

## Open questions

- Whether the three craftability states are an enum, a discriminated result or a reason string is the
  worker's call once the region is read. c1 fixes that the caller does not re-derive either check.
- Whether a gated entry is selectable — and does nothing but explain — or is inert is presentation,
  and lands with the modal. c4 fixes only that it names what is missing.
