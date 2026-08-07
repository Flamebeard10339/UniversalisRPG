# items-mods-and-crafting

Rewritten 2026-08-07. The previous design made an item a rolled directed graph of mod nodes whose
payloads amplified and damped each other through a universe-wide resonance relation. It is replaced,
not amended: an item is a **passive tree grown across a hex plane by slotting cluster jewels**, and
the resonance graph, its universe-wide constants and the research branch that gated them all go with
it.

Renamed from `smithing` on 2026-08-04, superseding the `smithing-skill` task. The name survives the
rewrite: there are items, there are modifiers, and crafting is the act of growing one into the other.

## Deliverable

An item occupies one hexagon of an unbounded plane. Each of that hexagon's six edges can carry a
**jewel slot** at its midpoint; a **cluster jewel** dropped in the world is an authored hexagon's
worth of passives and further slots, and slotting one places its **cluster** in the empty hex on the
far side of the slot. The clusters it brings carry slots of their own, so the plane fills outward
without ever terminating. What the player can light up is bounded elsewhere: an item gains experience
by being fed experience items, each level buys one passive point, and a level is spent on a passive
or on opening a slot alike.

Growth is therefore a plan in space, not a list. One cluster per hex, so a slot facing an occupied
hex is dead — and because slotting is permanent, filling the wrong edge forecloses a direction
forever.

Proof:

- [c1] `# cluster-jewel` is a section kind declaring one hexagon's worth of passives: nodes carrying
  payloads in the tag-clause vocabulary items already use (`+6 attack`), joined by **undirected
  adjacency** edges. Cycles are permitted and a ring of passives is a legitimate shape, because an
  edge only says two nodes touch and nothing travels along one. What is refused at load time,
  through the DSL's own error surface, is a node no path from the cluster's root reaches, since it
  can never be allocated.
- [c2] Every cluster jewel is authored in one orientation: its **root node** sits on the west edge,
  its passives do whatever they do inside the hexagon, and between one and five outgoing jewel slots
  sit on the five remaining edges, at most one to an edge. At least one is the structural guarantee
  that the plane never runs out of somewhere to grow; five is what the geometry leaves once the root
  has the west edge. A jewel declaring a second slot on one edge, or any slot on the west edge, is
  refused at load time.
- [c3] Rotation is determined, never chosen. Slotting a jewel through a slot on direction `d` places
  its cluster in the neighbouring hex, whose shared edge with the parent is `opposite(d)`, and the
  jewel is rotated by exactly the amount that carries its root node's west edge onto that shared
  edge. Slotting through an east-facing slot is therefore the identity, through a west-facing slot a
  half turn, and every other edge a multiple of a sixth. The rotation is a function of the slot, so
  there is nothing for the player to decide and nothing to store beyond which edge was used.
- [c4] Clusters occupy hexes addressed in axial coordinates on a pointy-top grid, whose six
  directions are `e`, `ne`, `nw`, `w`, `sw` and `se`. A jewel slot is an edge midpoint and is shared
  by exactly two hexes. A hex holds at most one cluster, so a slot may be filled only when the hex
  on its far side is empty; a slot facing an occupied hex is **blocked**, and both filling it and
  allocating it are refused. Two adjacent clusters are never joined by their shared edge — a
  connection exists only through a slot that was actually filled — so bare adjacency grants nothing
  that was not authored.
- [c5] The origin is the general rule's degenerate case, not a special case beside it. An item base
  occupies hex `(0, 0)` with a cluster that is never slotted and therefore never rotated: its root
  node is allocated from the start, costs no point, and is under no obligation to sit on the west
  edge, because the west-edge convention exists only to give slotting a defined rotation. By default
  that cluster is a single jewel slot on the east edge and nothing else, which is the item's on-ramp.
  A base may instead declare a `cluster-jewel:` of its own for hex `(0, 0)`, so a unique weapon ships
  with authored passives and a slot layout of its choosing; the default is what that rule yields when
  nothing is declared.
- [c6] A cluster jewel reaches the player as an ordinary item. An `# item` names one through
  `cluster-jewel:` to become the droppable thing, so jewels drop through `droptables`, stack in
  inventory, and are carried by the existing item machinery with no second inventory and no second
  drop path. A `cluster-jewel:` naming an unknown declaration is a load-time reference error like
  every other reference in the language.
- [c7] Instancing is **lazy**. `inventory[itemId]` keeps counting stacks until a jewel is slotted
  into one; that single item then leaves the stack and becomes an instance carrying its plane, its
  allocations and its experience. Instances are the `instanced-objects` substrate and nothing else —
  no second instance table in `GameState`, no second prune rule, no second save migration.
- [c8] Item experience has exactly one source. Consuming an item that declares `item-experience:`
  raises the target instance's experience by that amount, and no other event in the game changes it.
  An item's level is `skill-levels-xp-events`'s `level(X)`, imported rather than reimplemented —
  there is one level curve in this repository — and its passive points equal its level. An item base
  declares `max-level:`, defaulting to 99; feeding an item already at its maximum is refused with
  the consumed item intact, rather than silently absorbed.
- [c9] Allocation is bounded by points and gated by adjacency. A passive or a jewel slot may be
  allocated when at least one of its neighbours is already allocated — a neighbour, not a parent,
  because the graph may contain cycles. The origin cluster's root is allocated from the start and is
  what every path is ultimately reachable from. Allocating with no point remaining, out of adjacency,
  or onto a blocked slot is refused and costs nothing.
- [c10] Slotting and allocation are both permanent. A jewel is consumed when slotted, a filled slot
  refuses a second jewel, and no directive un-allocates a node or un-slots a jewel. The refusals are
  proved, not asserted: attempting each is a checked outcome, not an absence.
- [c11] An item's contribution is the sum of the payloads of its allocated passives, computed by one
  pure function of the instance, and it reaches combat through the same stat-bonus path an equipped
  `+2 attack` already takes. A focused fixture proves that allocating one passive changes outgoing
  damage, and that an instance the player is not wearing is inert.
- [c12] An instance survives a reload with identical evaluated stats, and is repaired rather than
  broken when content moves underneath it: an instance whose template is gone is pruned, and a
  slotted jewel or allocated node whose declaration is gone is dropped with its point returned, so a
  loaded instance is never over its own budget. Permanence is a rule about what the player may do,
  not a promise that deleted content stays evaluable.
- [c13] Growing an item is reachable through the directive surface every other play input goes
  through, so a `# test` section records feeding, slotting and allocating — and each refusal in c4,
  c8, c9 and c10 — and replays green over the shipped content.
- [c14] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests,
  layer-check, audit-status, doctor and the byte check in one invocation.

## Decisions

- **The names are Path of Exile's, deliberately.** A *cluster jewel* is the droppable item, the
  *cluster* is the hexagon of passives it places, a *jewel slot* is an edge midpoint that can receive
  one, and a *passive* is a node carrying a payload. Borrowing the vocabulary of the system this is
  modelled on costs nothing and stops four things that are not each other from all being called
  "orbs" or "mods". "Mod" in this repository already means a content module (`src/content/modportal.ts`),
  which is the collision the earlier draft was drifting toward.
- **The graph design was replaced because its balance was global and this one's is local.** Under
  resonance, `gain`, `damp` and the offset set were universe-wide constants: an item that played
  badly could only be fixed by moving numbers that moved every item at once. A cluster jewel's
  passives are authored, so a jewel that is too strong is nerfed by editing that jewel and nothing
  else changes. That is the whole argument for the rewrite, and it is a property of where the numbers
  live rather than of how large they are.
- **Edges are undirected adjacency, which is why cycles are free.** The retired design's edges were
  directed and carried amplification along them, so a cycle was a feedback loop that had to be banned
  at load time. Here an edge asserts only that two nodes touch, and allocation asks for one allocated
  neighbour; a ring is then just a shape with two ways round it, and banning it would forbid a
  perfectly good authored form for no reason. The one thing a graph can still get wrong is a node no
  path reaches, which is why c1 checks reachability and not acyclicity.
- **Non-termination is structural, not an authoring discipline.** An earlier draft of this spec noted
  that allocation degenerates to "take everything" whenever the reachable tree is smaller than the
  point budget, and could only offer judgement as the safeguard. Requiring every cluster jewel to
  declare at least one outgoing slot removes the failure mode outright: the frontier can always be
  pushed, so the plane is never smaller than the budget. What remains is a drop-economy question —
  whether jewels arrive fast enough to keep the frontier ahead of the points — and that is content,
  tunable per table.
- **The hex plane exists so that growth is a plan rather than a list.** Without it, slotting is
  bookkeeping: every jewel fits everywhere and the only question is which passives are strongest. One
  cluster per hex makes direction matter, makes a slot facing an occupied hex dead, and makes a badly
  chosen early jewel wall off a region permanently. That exclusion is the mechanic; a stranded slot
  is what planning badly costs.
- **Clusters connect only through a slot that was filled.** Two clusters that end up side by side
  share an edge, and that edge grants nothing. The alternative — letting bare adjacency fuse two
  authored graphs — would make power flow through geometry nobody authored, and would put the
  balance back where the resonance relation had it. As a consequence the cluster-level structure is
  a tree, since a cluster's every other edge faces either an empty hex or an occupied one, and cycles
  live inside clusters where an author put them.
- **One authored orientation, and rotation follows from the slot.** Every jewel is written the same
  way — root on the west edge, passives inside, outgoing slots on the other five — and slotting
  rotates it by whatever carries that root onto the edge it entered through. There is no rotation to
  choose and none to store: the slot's direction determines it, so an author never thinks about
  orientation and a save records only which edge was used. This is why the west edge is reserved
  rather than merely conventional; a jewel that could offer a slot there would have two candidate
  roots and no defined rotation.
- **Between one and five outgoing slots, at most one to an edge.** The lower bound is the
  non-termination guarantee. The upper bound is not a rule so much as what the hexagon has left once
  the root has the west edge, and stating it as a range is how the count reads as a design axis: a
  one-slot jewel is a corridor, a five-slot jewel is a junction that opens the plane in every
  remaining direction and is correspondingly rare.
- **The grid's offset axis is rows, not columns.** A hex with a due-east edge is pointy-topped, and
  pointy-topped hexes tile in rows whose alternates are shifted by half — the offset lives on the row
  index. The spec pins **axial** coordinates instead, which name the six neighbours as constant
  deltas and need no odd/even case at all; the offset layout is then a rendering detail belonging to
  whoever draws the plane, not a fact the runtime stores.
- **Permanent, because permanence is where the decision lives.** The retired probe's clearest
  transferable finding is that reversible placement is worth about 5% against an oracle and permanent
  placement 24%. That argument is about irreversibility, not about graphs, so it survives the
  redesign intact — and the hex plane sharpens it, because an irreversible placement now forecloses a
  direction as well as a slot. A refund is the obvious later dial and changes no part of the state
  model, which is why it can wait.
- **`max-level: 99` is an "unbounded" sentinel; the curve is the brake.** On the shipped curve level
  30 costs 90 experience items, level 50 costs 402, and level 99 costs 12,405 — nobody reaches the
  default and nothing needs them to. The field earns its place at the other end, for a base that
  wants a *low* ceiling: a starter sword capped at 10 is a starter sword forever, which is item
  tiering expressed as one number on the base rather than as a second progression system. This
  replaces the earlier draft's global experience cap, which was one number for every item and could
  not say that.
- **Item experience is fed, never earned.** One source means no per-instance subscription to combat
  events, no question about what an unequipped or off-hand item accrues, and no dependency on
  `combat-events` for the core tier. It also makes item progression a resource the player spends
  rather than a timer they wait out.
- **The experience grant is authored per item.** A greater experience item is a second `# item` with
  a larger `item-experience:`, which is content, not code.
- **What survives from the old work is the authoring trial, not the probe.**
  `docs/smithing/mods-draft.dsl` found that health, defence, regeneration, evasion, attack and
  attack-rate all fall out of the existing tag-clause vocabulary, and that `statRange` already folds
  them as `(base + added) x (1 + increased)`. A payload is a payload wherever it sits, so that
  finding transfers whole and the core tier needs no new stat maths. What it loses is the compounding
  term the resonance graph supplied; nothing compounds here, and nothing needs to, because power
  comes from extent rather than from interaction.
- **`graph-based-items-research` is retired rather than answered.** It existed to decide whether the
  resonance graph's measured agency was real and, above all, *legible* — its own spec names
  legibility as the load-bearing uncertainty and concedes no probe settles it. A plane of authored
  clusters answers that structurally: a player reads a map and a branch, rather than inferring an
  offset relation from rolled directed edges. `docs/smithing/topology-probe.md` becomes history, a
  measurement of a design not taken.
- **Rolled jewel modifiers are the sequel, and nothing is built ahead of them.** The branch after
  this one gives a jewel instance rolled modifiers that scale its own cluster (`+10% increased effect
  of physical passives`) with a curated downside as a second modifier of opposite sign — no new
  mechanism, just an authored pair. It needs a scaling point between a passive's payload and the stat
  fold, and passive tags for a modifier to name. This branch builds neither: c10 already puts payload
  evaluation in exactly one pure function, which is the only structural precondition the sequel has.
  An identity seam and unused tags added now would be machinery with no caller.
- **Reuse, not new systems.** Jewels are items, so drops, stacking and inventory are `droptables` and
  the existing item machinery. Instances are `instanced-objects`. Levels are `skill-levels-xp-events`.
  Payloads are tag clauses folded by `statRange`. The genuinely new code is the `# cluster-jewel`
  section kind, its load-time validation, the hex plane with its placement and blocking rules, the
  allocation rules, and one evaluation fold.
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

Rolled jewel modifiers and jewel instancing (the named sequel).
Refund or respec of any kind. Jewels that edit an existing cluster rather than extend the plane, or
that move one. Salvage, extraction, or transferring a plane between items. Keystone passives that
change the shape of the combat formula. Any GUI: when a plane needs to be seen rather than computed,
the cheap surface is a view in `scripts/play-cli.ts` beside the existing directives, and the real one
is a consumer of `gui-rebuild` rather than a reason to reshape it. Each is a separate branch; none is
required for the clauses above to be provable.

## Open questions

- The directive spelling for the three verbs — feed, slot, allocate — is the worker's to choose,
  including whether feeding and slotting are one verb dispatching on what the consumed item declares
  or two. The clauses fix what each must do and refuse, not what it is called.
- Whether a cluster jewel's passives are named in a namespace of their own or share the id space
  every other section uses. Passive ids must be addressable by the allocate directive and by a saved
  instance, and two jewels will both want a passive called `entry`.
- Whether `slot:` is the right predicate for "can carry a plane". It is the cheapest one that exists
  and it draws the line at equipment, but an item with a plane and no equip slot is not obviously
  nonsense.
- `skill-levels-xp-events` is itself blocked on `first-class-modals`. The level curve is one pure
  function; whichever of the two branches lands first should own it and the other import it, rather
  than either waiting on the other for arithmetic.
