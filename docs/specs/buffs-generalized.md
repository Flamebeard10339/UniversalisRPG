# buffs-generalized

## Deliverable

One buff mechanism, owned by one module, held by any actor. Today there is no such module: an
`ActiveBuff` is written only by `grantFoodBuff`, keyed by the string `<itemId>:<statId>`, and that
key format is parsed back apart in `save.ts` to decide what to prune — two modules agreeing by hand
on a string. The deeper problem is in `statRange`, where the entire modifier fold sits inside
`if (actorId === PLAYER)`: timed buffs, equipped items and the active action's tags are all read for
the player and for nobody else, so a non-player actor has its base stat and nothing more. Stacking
does not exist, because a second application of one source overwrites the first by key collision
rather than by any rule. This branch gives buffs an owner, an actor, an explicit stacking rule, a
sign that makes a debuff the same mechanism, and the second counter source that
`+N <stat> per <counter>` was defined to take.

Proof:

- One module owns a buff's whole life. Granting, expiring and folding all happen behind it, and no
  other module constructs an `ActiveBuff`, writes `activeBuffs`, or knows how a buff's identity is
  spelled. In particular `save.ts` no longer recovers an item id by slicing a key string.
- A buff is held by an actor, and any actor can hold one. `statRange` stops gating the modifier fold
  on `actorId === PLAYER`, so a buff on an enemy changes that enemy's stats the way the player's
  already change theirs.
- Each instance carries its own expiry, and refreshing is replacement. A buff is a set of instances
  rather than one entry with a count, each expiring on its own clock; applying a source that is
  already held either adds an instance or replaces an existing one, and replacing is how a duration
  is refreshed. Which of the two a source does is authored, not implied by whether two keys collide.
- A debuff is a buff with a sign. There is no second record, no second code path, and no predicate
  anywhere that asks whether a modifier is a penalty.
- Durations tick on the existing cadence. A buff's expiry is a boundary `nextBoundary` returns and
  `applyDueBoundaries` applies, for whoever holds it, and no new clock is introduced.
- A buff's payload is the tag-clause vocabulary items already use, and stacking is repetition of it.
  A buff carrying `+6 attack` held five times contributes `+30 attack` because each stack applies
  its own effect through the existing fold. There is no per-stack arithmetic, no new payload shape,
  and nothing about a buff's own bonus that a piece of equipment's bonus does not already do.
- A buff's stack count is readable by other modifiers. `+N <stat> per <counter>`, defined by
  `combat-events` over a resource's level, takes a named buff's stack count as a counter — so a
  sword granting `+1% attack per stack of accelerated-vigor` raises what each stack is worth. This
  is the path by which a player improves a buff they are stacking, and it is separate from the buff
  paying out its own payload.
- The player's existing behaviour is unchanged. Food buffs grant, stack (or do not), and expire
  exactly as they do today; every shipped `# test` passes byte-identical and no `expect:` save is
  regenerated to accommodate this branch.
- A save written before this branch loads. Buffs it holds either survive with their meaning intact
  or are pruned with the warning the loader already emits — never silently dropped, and never
  reinterpreted as a different number of stacks.

## Decisions

- **The key format was the bug, not an implementation detail.** `<itemId>:<statId>` is parsed in
  `save.ts` to find an item to check against the registry, which means the shape of a string is a
  contract between two modules that never agreed to one. Giving a buff an owner is what removes the
  need for anyone to parse it.
- **The player gate in `statRange` is the actual generalisation.** Moving `activeBuffs` off
  `GameState` alone would not help: gear and action tags are inside the same `actorId === PLAYER`
  branch, so an enemy would still be a bare base stat. The clause is about the fold, not the record.
- **`buff engine` stays this branch's `produces` claim.** `combat-events` was drafted claiming
  actor-scoped timed modifiers and that scope was removed from it rather than duplicated here.
- **No new clock.** Instances expire on the boundary the segment loop already honours; more
  instances means more boundaries, not a second scheduler.
- **A buff is equipment that expires.** Its payload is the same tag-clause vocabulary, folded the
  same way, and five stacks of `+6 attack` are `+30 attack` for the same reason five sources of
  `+6 attack` would be. Nothing about a stack needs arithmetic that equipment does not already have,
  which is why this branch introduces no payload shape of its own.
- **Improving a stack is a different mechanism from paying it out.** `+1% attack per stack of
  accelerated-vigor` on a sword is a modifier reading a counter — the shape `combat-events` defines
  — not the buff describing itself. Conflating them would have made a buff's payload a special form
  instead of an ordinary one.

## Open questions

None.
