# archetype-mods

## Deliverable

**Held.** This spec has no proof clauses yet, on purpose: what it promises depends on decisions
`smithing` owns, and an earlier draft got four of them wrong by guessing. What is settled is
recorded below so the refinement starts from it rather than rediscovering it.

The shape, as far as it is known: one `combat-expansion` mod authoring the archetype effects —
assassin, berserker and thorns — as `# mod` declarations that roll onto items. No runtime change,
no source diff. The branch fails if any effect needs a line of TypeScript, which is what makes
authoring all of them the test that the primitives upstream were built for a shape rather than for
a case.

## Decisions

- **One mod, not three patch files.** A single `combat-expansion` houses all three archetypes.
  There is no requirement that each archetype load independently, and inventing one would buy a
  loader test nothing else asks for.
- **Authoring only; the mod store is a dependency, not a subject.** An earlier draft made "the mod
  portal carries them" a clause, which conflates authoring content with testing the store. This
  branch depends on the mod-store implementation and exercises it incidentally; proving the store
  belongs to the store's own branch.
- **Every effect is a mod on an item. None is innate.** Rage's `on hit self:` is carried by an item
  the player equipped, not by the character. There is no default archetype behaviour on a bare
  character, and nothing here writes to the player as a starting condition.
- **Item bases are not per archetype.** An earlier draft had each archetype carrying its own item
  bases, which is backwards: a base like `bronze-sword` is one item capable of housing mods, and the
  archetypes are mods that roll into it. That is why this branch depends on `smithing-skill` — the
  base, the graph it carries, and the act of placing a mod are all that spec's.
- **Archetypes surface nowhere in the game.** They are a design tool for grouping mods that reward
  being taken together. A player never picks one; they equip items, the mods on those items roll,
  and how the character performs in combat follows from which mods are in play. Nothing in the DSL,
  the UI or the save should name an archetype as a thing the player has.
- **Four effects across three archetypes.** Berserker carries both rage and accelerated vigor —
  a resource with a ceiling and a rate, and a stack count with neither — because they exercise both
  counter sources of one modifier shape.

## Open questions

- The whole clause set. It is written after `smithing` settles what a mod declaration is, what an
  item base carries, and how a mod is placed.
