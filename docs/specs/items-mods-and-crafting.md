# items-mods-and-crafting

Rewritten 2026-08-07. The previous design made an item a rolled directed graph of mod nodes whose
payloads amplified and damped each other through a universe-wide resonance relation. It is replaced,
not amended: an item is a **passive tree** grown by slotting orbs, and the graph, the resonance
relation, and the research branch that gated them all go with it.

Renamed from `smithing` on 2026-08-04, superseding the `smithing-skill` task. The name survives the
rewrite: there are items, there are modifiers, and crafting is the act of growing one into the other.

## Deliverable

Every equippable item has one open orb socket. An orb dropped in the world is an authored bundle of
passive nodes and further sockets; slotting it into an item hangs that bundle off the socket, and the
sockets it brings can take orbs of their own. The tree that results grows without bound, but the
player can light up only as much of it as the item's level affords — items gain experience by being
fed experience orbs, and each level buys one passive point. Two scarcities, independent: how far the
tree reaches is decided by the orbs you hold, how much of it burns is decided by the item's level.

Crafting is that growth. Which orb goes into which socket, and which branch the points walk down,
are permanent decisions made before the next drop is known.

Proof:

- [c1] `# orb` is a section kind declaring a passive tree. Its entries are nodes; a node carries a
  payload in the tag-clause vocabulary items already use (`+6 attack`), names its parent through
  `from:`, and may be marked as a socket. Parenthood is single-valued, so the declaration is a tree
  by construction: exactly one node omits `from:` and is the bundle's root. A `from:` naming an
  unknown node, a second rootless node, or a `from:` that closes a cycle is refused at load time
  through the DSL's own error surface, not at evaluation.
- [c2] An orb reaches the player as an ordinary item. An `# item` names one through `orb:` to become
  the droppable thing, so orbs drop through `droptables`, stack in inventory, and are carried by the
  existing item machinery with no second inventory and no second drop path. An `orb:` naming an
  unknown orb is a load-time reference error like every other reference in the language.
- [c3] An item template declaring `slot:` has exactly one root socket, and instancing is **lazy**.
  `inventory[itemId]` keeps counting stacks until an orb is slotted into one; that single item then
  leaves the stack and becomes an instance carrying its tree, its allocations and its xp. Instances
  are the `instanced-objects` substrate and nothing else — no second instance table in `GameState`,
  no second prune rule, no second save migration.
- [c4] Item experience has exactly one source. Consuming an item that declares `item-experience:`
  raises the target instance's xp by that amount, and no other event in the game changes it. Feeding
  an item already at the cap is refused with the orb unconsumed, rather than silently clamped. The
  cap is the tuning variable `item-experience-cap`, defaulting to 30000.
- [c5] An item's level is `skill-levels-xp-events`'s `level(X)`, imported rather than reimplemented,
  and its passive points equal its level. There is one level curve in this repository. At the
  shipped defaults a 1000-xp orb is worth one point for each of the first five, and an item reaches
  level 17 and 17 points on its thirtieth — the curve's doubling is what makes late orbs cost more
  than early ones, and no separate diminishing-returns rule is added on top of it.
- [c6] Allocation is bounded by points and gated by adjacency. A node may be allocated only when its
  parent is already allocated, or when it is the root of an orb slotted into an allocated socket.
  The item's own root socket needs no point and is available from the first drop; every socket a
  slotted orb brings is an ordinary node that must be allocated before it can be filled. Allocating
  with no point remaining, or out of adjacency, is refused and costs nothing.
- [c7] Slotting and allocation are both permanent. An orb is consumed when slotted, a filled socket
  refuses a second orb, and no directive un-allocates a node or un-slots an orb. The refusals are
  proved, not asserted: attempting each is a checked outcome, not an absence.
- [c8] An item's contribution is the sum of the payloads of its allocated nodes, computed by one pure
  function of the instance, and it reaches combat through the same stat-bonus path an equipped
  `+2 attack` already takes. A focused fixture proves that allocating one node changes outgoing
  damage, and that an instance the player is not wearing is inert.
- [c9] An instance survives a reload with identical evaluated stats, and is repaired rather than
  broken when content moves underneath it: an instance whose template is gone is pruned, and a
  slotted orb or allocated node whose declaration is gone is dropped from the tree with its point
  returned, so a loaded instance is never over its own budget. Permanence is a rule about what the
  player may do, not a promise that deleted content stays evaluable.
- [c10] Growing a tree is reachable through the directive surface every other play input goes
  through, so a `# test` section records feeding, slotting and allocating — and each refusal in c4,
  c6 and c7 — and replays green over the shipped content.
- [c11] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests,
  layer-check, audit-status, doctor and the byte check in one invocation.

## Decisions

- **The graph design is replaced because its balance was global and this one's is local.** Under
  resonance, `gain`, `damp` and the offset set were universe-wide constants: an item that played
  badly could only be fixed by moving numbers that moved every item at once. An orb's subtree is
  authored, so an orb that is too strong is nerfed by editing that orb and nothing else changes.
  That is the whole argument for the rewrite, and it is a property of where the numbers live rather
  than of how large they are.
- **`graph-based-items-research` is retired rather than answered.** It existed to decide whether the
  resonance graph's measured agency was real and, above all, *legible* — its own spec names
  legibility as the load-bearing uncertainty and concedes no probe settles it. A tree answers that
  question structurally: it is the most legible progression surface the genre has, and a player
  reads a branch rather than inferring an offset relation from rolled edges. The premise the
  research was gating no longer exists, so the gate is removed with it.
  `docs/smithing/topology-probe.md` becomes history — a measurement of a design not taken.
- **What survives from the old work is the authoring trial, not the probe.** `docs/smithing/mods-draft.dsl`
  found that health, defence, regeneration, evasion, attack and attack-rate all fall out of the
  existing tag-clause vocabulary, and that `statRange` already folds them as
  `(base + added) x (1 + increased)`. A payload is a payload whether it sits in a graph node or a
  tree node, so that finding transfers whole and the core tier still needs no new stat maths. What
  it loses is the compounding term the graph supplied; the tree does not compound, and does not need
  to, because its power comes from extent rather than from interaction.
- **Two scarcities, deliberately independent.** Orbs held decide how far the tree reaches; item level
  decides how much of it burns. This is what lets a tree be visibly enormous while the power it
  grants stays bounded, and it is why the design tolerates unbounded growth without an unbounded
  power curve. Collapsing them into one resource would make every orb a straight power gain and the
  tree a display.
- **The invariant that keeps allocation a decision: the reachable tree must always be larger than
  the points available.** If an item's tree is smaller than its point budget, allocation degenerates
  to "take everything" — a non-decision, which is exactly what the old research called a sort rather
  than a strategy. Under the graph design this was a measured property; here it is an authoring
  discipline and a tuning ratio, checked by judgement rather than by a gate. It is stated because it
  is the thing that breaks first if orbs are authored small.
- **Sockets cost a point, so depth competes with power.** A socket a slotted orb brings is an
  ordinary node: reaching it and opening it spends from the same budget the payload nodes want. That
  is the tension the mechanic runs on — a wide shallow tree of realised payloads against a narrow
  deep one that reaches a better orb. The item's root socket is free because an item with no free
  first socket has no on-ramp.
- **Permanent, because permanence is where the decision lives.** The probe's clearest transferable
  finding is that reversible placement is worth about 5% against an oracle and permanent placement
  24%. That argument is about irreversibility, not about graphs, so it survives the redesign intact.
  A refund orb is the obvious later dial and changes no part of the state model, which is why it can
  wait.
- **Item xp is fed, never earned.** One source means no per-instance subscription to combat events,
  no question about what an unequipped or off-hand item accrues, and no dependency on
  `combat-events` for the core tier. It also makes item progression a resource the player spends
  rather than a timer they wait out, and makes the 17-point ceiling exact and reachable by anyone.
- **One level curve, and this branch does not own it.** `skill-levels-xp-events` specifies
  `level(X) = 1 + 10 x log2(1 + X x (r - 1) / 1000)` with `r = 2^(1/10)`, integer-arbitrated so
  float never decides a level. Items use that function. Two curves in one repository would be two
  things required to be kept in sync by hand.
- **The 30000 cap is not a level threshold, and that is deliberate.** `T(17)` is 28303 and `T(18)` is
  31335, so the thirtieth orb lands inside level 17 and a thirty-first cannot be fed. The player
  experiences a whole number of orbs for a whole number of points; the remainder is invisible
  because nothing can be spent to reach past it. If it reads badly in play, the cap is a tuning
  variable and moves.
- **The xp grant is authored per item, the cap is a tuning variable.** A greater experience orb is a
  second `# item` with a larger `item-experience:`, which is content. How high any item may be taken
  is one number for the whole universe, which is tuning. Neither is code.
- **Rolled orb modifiers are the sequel, and nothing is built ahead of them.** The branch after this
  one gives an orb instance rolled modifiers that scale its own subtree (`+10% increased effect of
  physical passives`) with a curated downside as a second modifier of opposite sign — no new
  mechanism, just an authored pair. It needs a scaling point between a node's payload and the stat
  fold, and node tags for a modifier to name. This branch builds neither: c8 already puts payload
  evaluation in exactly one pure function, which is the only structural precondition the sequel has.
  An identity seam and unused tags added now would be machinery with no caller.
- **Reuse, not new systems.** Orbs are items, so drops, stacking and inventory are `droptables` and
  the existing item machinery. Instances are `instanced-objects`. Levels are `skill-levels-xp-events`.
  Payloads are tag clauses folded by `statRange`. The genuinely new code is the `# orb` section kind,
  the tree's load-time validation, the allocation rules, and one evaluation fold.
- **No new system is declared.** The code this branch adds is owned by the systems that already own
  its paths — `src/grammar` and `src/content` by the DSL load path, `src/runtime` by Runtime.

## Answered elsewhere

The archetype tier — passives that react to being struck, poison a target, or read one stat off
another — waits on branches that already own its vocabulary, and this spec names theirs rather than
inventing its own. The core survivability tier waits on none of them.

- **The combat event surface is `combat-events`**: an action declares `on hit:` and `on hit self:`,
  and anything reacting to being struck is an actor-carried persistent effect subscribing to
  `damage-taken`. Event names are the past-tense closed set `skill-levels-xp-events` owns.
- **A debuff on an enemy has an owner: `buffs-generalized`**, which ends the `actorId === PLAYER`
  gate around the modifier fold in `statRange`.
- **A stat reading another stat is `per-grammar-dependent-stats`**, which adds a stat as the third
  counter source after a resource level and a buff's stack count.

## Out of scope

Rolled orb modifiers and orb instancing (the named sequel). Refund or respec of any kind. Per-item
experience caps. Orbs that edit an existing tree rather than extend it. Salvage, orb extraction, or
moving a tree between items. Keystone nodes that change the shape of the combat formula. Any GUI:
when a tree needs to be seen rather than computed, the cheap surface is a view in
`scripts/play-cli.ts` beside the existing directives, and the real one is a consumer of `gui-rebuild`
rather than a reason to reshape it. Each is a separate branch; none is required for the clauses above
to be provable.

## Open questions

- The directive spelling for the three verbs — feed, slot, allocate — is the worker's to choose,
  including whether feeding and slotting are one verb dispatching on what the consumed item declares
  or two. The clauses fix what each must do and refuse, not what it is called.
- Whether an orb's nodes are named in a namespace of their own or share the id space every other
  section uses. Node ids must be addressable by the allocate directive and by a saved instance, and
  two orbs will want a node called `root`.
- Whether `slot:` is the right predicate for "can carry a tree". It is the cheapest one that exists
  and it draws the line at equipment, but an item with a tree and no equip slot is not obviously
  nonsense.
- `skill-levels-xp-events` is itself blocked on `first-class-modals`. The level curve is one pure
  function; whichever of the two branches lands first should own it and the other import it, rather
  than either waiting on the other for arithmetic.
