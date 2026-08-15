# archetype-mods

Rewritten 2026-08-07 against the cluster vocabulary. The hold this spec was under is released: it
carried no proof clauses on purpose, because what it promised depended on decisions `smithing` owned
and an earlier draft got four of them wrong by guessing. `items-mods-and-crafting` has now settled
what a declaration is, what an item base carries and how an effect is placed, so the clause set can
be written.

What changed underneath it: there is no `# mod` and no rolled graph. An item is a hex plane, a
`# cluster-jewel` is one hexagon of `# passive` declarations, and an effect reaches the player by
being allocated. The content this branch owes is unchanged in substance — the same four effects
across the same three archetypes — and every section kind it names has moved.

## Goal

Three archetypes exist as content and as nothing else, so that the engine is shown to have
generalized rather than grown special cases. Four effects of four different shapes, all authored as
passives a player allocates, and no identifier below the DSL named after any of them.

## Deliverable

The three archetypes, authored as content and nothing else. `combat-events` owes the primitives and
carries the constraint that the runtime never names a fixture; this branch is the proof of that
claim. If any of the four effects needs a resolver branch, a runtime identifier, or a special case
anywhere below the DSL, the primitives were built for cases rather than for a shape and the failure
belongs upstream, not here.

Proof:

- [c1] Each of the four effects — rage, accelerated vigor, thorns, poison — is authored entirely as
  `# passive` declarations placed into `# cluster-jewel` positions, using the primitives
  `combat-events` and `buffs-generalized` ship. No archetype is a runtime concept, no archetype has
  a code path, and none is innate: an effect reaches the player by being allocated on a plane and
  by nothing else.
  proof: vitest src/content/passive.test.ts src/runtime/itemContribution.test.ts src/runtime/integration.test.ts
- [c2] The constraint is checkable rather than asserted. No identifier in the shipped source is named
  for any fixture this branch composes, and the command that shows it is the clause's proof. It
  excludes tests deliberately: a test may use one of these words as an arbitrary content id with no
  bearing on the runtime, which `src/content/references.test.ts:139` does today with `# stat rage`
  while resolving references. The command is clean on the tree as it stands, so it is a real
  regression check rather than one that starts red and gets weakened.
  proof: command grep -rniE "\b(poison|rage|thorns|accelerated.?vigou?r)\b" src/ --include=*.ts --exclude=*.test.ts
- [c3] **Rage** is a resource with a constant drain, granted on a landed swing and read as a counter:
  `+N% attack per rage`. Its ceiling and its rate are what distinguish it from a stack count, and a
  `# test` shows attack rising as rage accumulates and falling as it drains, with no other stat
  moving.
  proof: vitest src/runtime/integration.test.ts src/runtime/itemContribution.test.ts
- [c4] **Accelerated vigor** is a chance-gated stacking buff. A wrapper from `droptables` gates the
  grant, each stack pays its own payload through the existing fold, and `+N% <stat> per stack` reads
  the stack count so that stacking improves what a stack is worth. A `# test` shows the two
  contributions are separable: stacks alone, and stacks under the per-counter bonus.
  proof: vitest src/runtime/integration.test.ts src/runtime/buffs.test.ts
- [c5] **Thorns** is a persistent effect on `damage-taken` that damages the attacker. It is carried
  by an actor rather than declared on an action, which is what lets a passive enemy have one, and a
  `# test` proves an enemy carrying it damages a player who strikes it.
  proof: vitest src/runtime/integration.test.ts src/runtime/hooks.test.ts
- [c6] **Poison** is a timed debuff held by the struck actor, applied when a swing of the player's
  lands. It is `buffs-generalized`'s mechanism with a sign and a duration, not a second one, and a
  `# test` shows a struck enemy losing health after the swing that applied it and stopping when it
  expires.
  proof: vitest src/runtime/integration.test.ts src/runtime/buffs.test.ts
- [c7] All four are authored as **actor-carried persistent effects**, because a passive is carried by
  whoever allocated it rather than written onto a swing. `on hit:` and `on hit self:` are the second
  authoring route for the same moment, correct for a weapon or an entity that declares a swinging
  action of its own; `combat-events`' fixture table describes that route, and this branch takes the
  other one because the content it owes is passives. Neither is a lesser form of the other, and no
  fixture needs both.
  proof: vitest src/content/passive.test.ts src/runtime/itemContribution.test.ts
- [c8] A persistent effect's results can name **the other party in the moment**. Thorns fires on
  `damage-taken`, whose moment identifies the actor struck, and must damage the one who struck them;
  poison fires when the player deals damage and must land on the target. Both are the same
  requirement, and a fixture proves each direction rather than assuming one implies the other.
  proof: vitest src/runtime/hooks.test.ts src/runtime/buffs.test.ts src/runtime/integration.test.ts
- [c9] Archetype membership is a **tag on a passive and nothing more**. No `cluster-effect:`, no
  selector, and no runtime lookup may name an archetype, because a modifier that scaled "berserker
  passives" would be a class system arriving through the back door. Mechanical tags — `poison`,
  `physical`, `life` — are the ones a future tag selector may read; archetype tags exist for authors
  and for grouping, and c2's command is what keeps that honest.
  proof: vitest src/runtime/integration.test.ts
- [c10] The three archetypes ship as six cluster jewels, paired added-then-increased, matching the
  trial in `docs/smithing/cluster-jewels-draft.dsl`. Each pair has one jewel whose passives are flat
  and one whose passives are mostly percent, because `statRange` folds
  `(base + added) x (1 + increased)` and the pairing is what makes flat-first a visible build order
  rather than a thing a player has to be told.
  proof: vitest src/runtime/integration.test.ts
- [c11] All of it is one content module, `combat-expansion`, loaded through the machinery that
  already exists. Nothing here proves the module store; that belongs to the store's own branch.
  proof: vitest src/ui/shippedContent.test.ts src/runtime/integration.test.ts
- [c12] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Decisions

- **Carried forward unchanged from the held draft.** One `combat-expansion` module rather than three
  patch files, since nothing requires an archetype to load independently. Authoring only, with the
  module store a dependency and not a subject. Item bases are not per archetype — a base houses a
  plane, and archetypes are jewels slotted into it. Archetypes surface nowhere as a thing the player
  picks. Four effects across three archetypes, with berserker carrying both rage and accelerated
  vigor because a resource has a ceiling and a rate while a stack count has neither, and one
  `per <counter>` shape has to take both.
- **"No effect is innate" survives the rewrite, and gets stricter.** Under the old design an effect
  was a mod on an equipped item, which the player got by equipping. Under the cluster design it is a
  passive that must additionally be *allocated*, which costs a point that could have gone elsewhere.
  The archetype is therefore something a player spends toward rather than something they wear.
- **The zero-source-diff test is replaced by a zero-archetype-diff test, and it is stronger.** The
  held draft promised no runtime change at all. That was written when mods sat on items and items
  already carried actions; passives are new and the seam that lets one carry a persistent effect is
  generic machinery this branch may legitimately need. What was actually being protected is that the
  runtime contains no *archetype*, and c2 states that as a command anyone can run — where "no source
  diff" was a promise nobody could check without reading the whole diff.
- **All four fixtures take one trigger, and that is a consequence of c8 rather than a limitation of
  `on hit:`.** An earlier draft of this spec claimed the fixture table could not hold, on the grounds
  that a passive owns no action to declare a hook on. That conflated an action's *owner* with its
  *actor*: `fight:` is authored under `# entity giant-rat`, but the player is who performs it — the
  player has no `# entity` at all, and
  `non-entity-action-owner-inherits-player-stats` records that the global `# stat` bases are their
  sheet for exactly that reason. `on hit self:` on a `fight:` lands on the player and always would
  have. What actually decides the question is c8: once a persistent effect's results can name the
  other party, all four fixtures are expressible as persistent effects, and a passive carried by an
  actor is the natural home for one. The choice is authoring convenience, not necessity.
- **Two-party results are a latent requirement in `combat-events`, not a new ask.** Thorns fires on
  `damage-taken` and must damage the attacker, so results already had to be able to name the other
  party or thorns would not work as that spec describes it. Poison needs the same in the opposite
  direction. c8 names it once so it is decided rather than discovered twice.
- **The tag rule is where a class system would have crept in.** Nothing prevents someone authoring
  `+25% increased effect of berserker passives` once tag selectors exist, and that single line would
  turn a grouping convenience into a build the player commits to. Ruling it out now costs nothing;
  ruling it out after content exists costs the content.
- **This branch does not extend the stat vocabulary.** Every payload uses stats that exist. A
  passive that wants a stat reading another stat belongs to `per-grammar-dependent-stats`, and the
  archetype content is authored to need none.

## Decisions taken while building it

The spec was silent on each of these; every one is a judgement the worker made and the reason it
was made.

- **The trial `docs/smithing/cluster-jewels-draft.dsl` that c10 names was deleted before this
  branch started**, in b00c105, for drifting twice. Its jewel and passive names are carried forward
  out of git history unchanged, because c10 asks the six jewels to match it and matching a retired
  file is only possible by reading it. A passive and a cluster jewel share an id in two places
  (`retribution`, `wracking-blades`), exactly as the trial had them: ids are per kind, and the jewel
  is named after the passive that is the point of it.
- **Rage's drain rides on the passive that grants rage, not on the stat's base.** A `# resource`
  whose rate stat has a nonzero global base is snapshotted for every character in every segment, and
  `settlePools` then writes a `resourceRateRemainders` entry for it — which lands in every save
  written anywhere in the universe, including `tutorial-island`'s recorded `expect:` sheets. Keeping
  the base at nothing means a character who never took the passive has a pool that cannot move, and
  the tutorial's six shipped routes replay byte-identical beside this module.
- **A buff's source is an `# item`.** `buffs-generalized` made `BuffSource = Item`, `pruneBuffs`
  resolves a held buff's source in the item registry, and `+N stat per stack of <id>` resolves its
  counter as an item. `# item accelerated-vigor` and `# item venom` are therefore declarations that
  are never given, dropped or carried — the same standing a `# droptable` has. That a payload which
  is not a thing has to be declared as one is filed as a finding rather than fixed here: changing it
  means a reference kind that resolves against two registries, which is the buff engine's own branch.
- **`# entity passives:` is new, and is why thorns is authored once.** c1 wants every effect authored
  as a `# passive` in a jewel; c5 wants a `# test` in which an enemy carries thorns. An enemy has no
  plane to allocate on, so without this field the effect would be written twice — once as the passive
  and once as a `when hit:` block copied onto the entity — which is the failure mode CLAUDE.md names
  first. The field is generic: any entity carries any passive, and nothing about it knows what an
  archetype is.
- **Poison is not chance-gated.** c6 says it is applied when a swing of the player's lands and names
  no gate; c4 is where a wrapper is required, and accelerated vigor carries it. Leaving poison
  certain also makes its fixture deterministic without leaning on the seed.
- **The archetype content is reached by a `# save` and not by an edge from the island.** Where these
  jewels appear in the world is out of scope by the spec's own last section. A two-way edge would
  also have rewritten `tutorial-island`'s recorded routes, because `spreadDiscovery` marks every
  neighbour of wherever the player stands. `proving-ground` has one edge out to the beach so nobody
  put there is stranded.
- **`integration.test.ts` reads `content/` rather than naming a file.** It named
  `content/tutorial-island.dsl` literally, and a second content module would otherwise have shipped
  with no `# test` of it ever replayed. `src/ui/shippedContent.test.ts` listed the same two module
  names by hand and is derived the same way for the same reason.
- **A plane payload reading its counter was a defect, not a feature this branch added.** c3 and c4
  both need `+N% <stat> per <counter>` on a passive; `itemContribution` folded plane payloads by
  their cluster scale alone, so such a payload was silently worth its declared magnitude once. The
  fix is in the fold and the plane screen now prints the counter beside the number it states.

## Out of scope

Any fifth effect, and any archetype beyond the three. Rolled variance on a jewel and jewels that
drop pre-modded, which `items-mods-and-crafting` names as its own sequel. Drop rates and where the
archetype jewels appear in the world, beyond whatever one `# test` needs to reach them. Proving the
module store. Any GUI.

## Open questions

- Whether `combat-events` states c8 itself or this branch asks for it. It is that branch's primitive
  and its own thorns fixture already requires it — an effect firing on `damage-taken` must reach the
  attacker — so the honest outcome is one amendment there rather than a workaround here. This is the
  single upstream question this branch waits on.
- Which cluster shapes the archetype jewels use. The trial picks `ring`, `wheel` and `double-ring`
  per archetype; whether the signature passive sits on a hub two points from any edge or opposite
  the entry three points either way round is a placement judgement and the worker may make it.
- Whether accelerated vigor's chance wrapper is `1 in 20:` as `combat-events` writes it or something
  looser. The gate belongs to whoever tunes it, and the clause fixes only that a wrapper gates it.
