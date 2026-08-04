# items-mods-and-crafting

Renamed from `smithing` on 2026-08-04, and superseding the `smithing-skill` task. Neither old name
described this: there is no skill here, no xp and no levels. An item is a graph, a mod is a payload
placed into it, and crafting is the act of placing one.

**Gated on `graph-based-items-research`.** Every clause below rests on the premise that placing mods
into a graph gives the player real agency, which `docs/smithing/topology-probe.md` measures on a
synthetic model. Whether that measurement is enough to build on is a question this spec cannot
answer about itself, so it is asked separately and answered before any clause here is worked. A
negative answer retires this spec rather than amending it.

## Deliverable

An item is a directed graph of mod nodes, not a list. A dropped weapon carries a rolled graph; a
mod placed into a node is amplified or damped by the mods feeding it through that graph's edges;
and the evaluated result enters combat through the stat-bonus path equipment already uses. Placing
a mod is permanent, so the decision is which node to spend it on before the next drop is known.

The parameters below are not invented here. They are the measured conclusions in
`docs/smithing/topology-probe.md`. The probe that produced them lives on branch
`smithing-topology-probe` under `scripts/smithing-probe`, reachable there through
`npm run smithing-probe` and its siblings; the report travelled to main ahead of the code.

Proof:

- [c1] `# mod` is a section kind carrying a resonance `type:` and a payload authored in the tag-clause
  vocabulary items already use (`+6 attack`). An `# item` names one through `mod:` to become the orb
  that grants it, so orbs drop, stack, and are carried through the existing item machinery with no
  second inventory.
- [c2] `# resonance` declares the type names, the circulant offsets that resonate, and the gain and
  damp magnitudes, once, for the whole universe. Loading content with an offset outside the type
  count, or with a pair of offsets that would make one type feed another in both directions, is
  refused at load time with the DSL's own error surface rather than at evaluation.
- [c3] An `# item` template declares the band a drop may roll — `nodes: 3-5` and `indegree: 2-3` —
  and a rolled graph is an oriented graph over those nodes: no bidirectional pair, no node without
  an incident edge, in-degree within the band. A template whose band cannot be satisfied is refused
  at load time.
- [c4] A smithed weapon is an **instance**, not a count. Instances live in game state with their
  rolled graph and their node placements, are saved and restored, survive a reload with identical
  evaluated stats, and are pruned when their template or a placed mod's declaration goes away.
  Stackable items are untouched: only templates declaring `nodes:` become instanced.
- [c5] Evaluation is one pure function, lifted from `scripts/smithing-probe/arrangement.ts` on
  branch `smithing-topology-probe` into `src/runtime`, and the probe imports it from there
  afterwards rather than keeping a copy. Given a graph and its placements it returns a per-node
  multiplier and a summed payload; conduction compounds across incoming edges and a damped
  multiplier floors at zero.
- [c6] The evaluated payload reaches combat through the same stat-bonus path an equipped `+2 attack`
  already takes. A focused fixture proves that moving one mod between two nodes of the same item
  changes outgoing damage, and that an unequipped instance is inert.
- [c7] Smithing is reachable through the directive surface every other play input goes through, so a
  `# test` section records it and replays green. Placing a mod consumes the orb, is refused on an
  occupied node, and cannot be undone.
- [c8] `npm run tasks -- merge-ready` passes before the spec is marked done. It is the whole merge
  gate in one invocation — tsc, tests, layer-check, audit-status, doctor, byte check — and it
  replaced the `tasks check --merge` this clause was originally written against.

## Decisions

- **Items are graphs because rings and lists measurably do not work.** On identical mods a ring
  scores 41 and a transitive tournament 91 (F16). A ring gives every node in-degree 1, which caps a
  mod's multiplier at `1 + gain` and leaves no way to target one mod (F1, F15). Max in-degree, not
  edge count, is the quality axis, and it stops paying above about 4 (F17) — hence `indegree:` as a
  band rather than an open number.
- **Node count is progression, in-degree is rarity.** Bare power is linear in nodes at about 8 per
  node; the graph's lift is geometric at `1.21^(nodes-2)`, so 3 nodes to 7 is 6.5x (F17). Early
  items are mod-driven and late ones graph-driven, which onboards the mechanic for free.
- **Conduction compounds, and the item's payload is summed rather than averaged.** Compounding is
  what reaches 3.7x targeting against 2.5x additive (F15). Normalising by node count flattens an
  edgeless item across sizes but costs the 6.5x band and does not shift value from mods to topology
  — it scales both terms alike (F18). Both are one-line reversals if play disagrees.
- **The resonance relation keeps a negative half.** Compared at matched power a signed relation
  gives about 1.3x the arrangement spread and agency of a typeless one, and leaves 26-33% to the
  obvious heuristic where typeless leaves 7% (F20). An unsigned relation behaves almost exactly like
  having no types at all. The damping, not the paradox depth, is what makes placement a decision.
- **Mod selection is a ranking and that is fine.** Which mods a build wants is a sort, not a
  strategy (F2, F6). The strategy is placement under permanence, which is worth 24% against an
  oracle where interchangeable slots are worth 5% (F14). This spec therefore spends its complexity
  budget on the graph and none on making mod choice clever.
- **No mod budget, and no capacity cost.** Leaving a node empty never wins under any tested
  parameterisation (F3), so a budget would only exist to resurrect a goal already dropped.
- **A smithed item is an instance, not a count** (2026-08-02). A drop carries a rolled graph and
  the mods already placed in it, which cannot be represented by `inventory[itemId]`. This was
  recorded as an open question and is now a decision; only templates declaring `nodes:` become
  instanced, and stackable items keep their counts.
- **The core survivability tier needs no runtime work and ships first.** The authoring trial in
  `docs/smithing/mods-draft.dsl` found that health, defence, regeneration, evasion, attack and
  attack-rate mods all fall out of the existing tag-clause vocabulary, and that `statRange` already
  folds them as `(base + added) x (1 + increased)` — the flat/increased structure the probe
  modelled. The graph supplies the compounding term the fold lacks. No new stat maths is required.
- **Tier width is the dial between acquisition and crafting**, not a new mechanism. Narrow payload
  bands make the topology dominate; wide ones make the drop dominate (F19).
- The probe stays under `scripts/smithing-probe` and stays `unowned` in `docs/audits/systems.json`.
  The code this spec adds is owned by the systems that already own its paths — `src/grammar` and
  `src/content` by the DSL load path, `src/runtime` by Runtime — so no new system is declared.
- The GUI is out of scope. When placement needs to be seen rather than computed, the cheap surface
  is a crafting view in `scripts/play-cli.ts` beside the existing directives, not a GUI rebuild.

## Out of scope

Graph-editing orbs (add, reverse, remove an edge), mod tiers as authored variants, drop tables and
their pity weighting, salvage or mod transfer, keystone mods that change the shape of the combat
formula, and any UI beyond the CLI. Each is a separate branch; none is required for the clauses
above to be provable.

## Answered since this spec was written

Every gap the authoring trial found has become a specced branch. This spec names their vocabulary
rather than inventing its own, and the archetype tier waits on them; the core survivability tier
still waits on none of them.

- **The combat event surface is `combat-events`.** The prediction that all three archetypes were
  blocked on one primitive rather than three held. The settled spelling is *not* the
  `on hit:` / `on hit-taken:` pair this spec first guessed: an action declares `on hit:` and
  `on hit self:`, which fire on a landed swing and apply to the struck and the swinging actor
  respectively, and either may be gated by a chance. What this spec called `on hit-taken:` is an
  actor-carried **persistent effect** subscribing to the event `damage-taken`, because a passive
  enemy has no action of its own to declare a hook on. Event names are the past-tense closed set
  `skill-levels-xp-events` owns — `damage-dealt`, `damage-taken`, `missed`, `evaded`, `succeeded`,
  `failed`, `escaped`, `restored <resource>`, `drained <resource>` — and a mod naming one uses that
  list rather than a spelling of its own.
- **A debuff on an enemy has an owner: `buffs-generalized`.** It ends the `actorId === PLAYER` gate
  around the whole modifier fold in `statRange`, so a mod that poisons a target is expressible.
- **Loot tables are `droptables`.** An orb can drop one time in forty rather than only being gated
  behind a condition. The core tier can still ship on gated gives.
- **A stat reading another stat is the one gap with no home yet.** `+1 attack per 10 defense` has no
  grammar, and `statRange` folds each stat independently. `combat-events` introduces
  `+N <stat> per <counter>` over a resource's level, and `buffs-generalized` adds a buff's stack
  count as a second counter source — a stat would be the natural third, and that is where it should
  land rather than in a form of its own.

## Open questions
- The probe's combat model is a synthetic Path-of-Exile miniature with per-tag additive `increased`
  pools and compounding `more` multipliers. The shipped stat vocabulary is much smaller, so the
  measured magnitudes transfer but the archetype findings (F6, F8) do not until the real stat set
  supports tags. Nothing in the clauses above depends on them.
