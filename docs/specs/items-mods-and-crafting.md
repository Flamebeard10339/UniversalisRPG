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

- [c1] `# passive` is a section kind, its ids in the same global space as every other section, its
  body the tag-clause list `# item` already uses — bare words are tags and `+N stat` / `+N% stat` are
  payloads, in one comma list. One declaration is referenced by any number of cluster jewels, which
  is what lets a later modifier name a class of passives across all of them rather than inside one.
- [c2] **A passive's payload may not be a range.** `+5-8 accuracy` parses — `tagClause` produces a
  `Range` wherever a stat bonus appears — and is refused at load time by the `# passive` schema
  naming the clause it rejected. A passive is always on and there is no moment at which a range could
  roll: rolling at allocation would put a per-position number in every saved instance, which is a
  second instancing story bought for nothing. The consequence is the property the rest of the branch
  leans on: nothing is ever stored per position. An instance records which positions are allocated
  and which effects each cluster carries, and every payload is derived from those two.
- [c3] **Shapes are a closed, hard-coded catalogue** in `src/content`, named from the DSL and never
  authored in it. A shape declares numbered positions, the **undirected adjacency** between them, and
  which position each of the six hex edges touches; cycles are permitted, because an edge only says
  two nodes touch and nothing travels along one. Naming a shape that does not exist fails at load
  with an error listing the ones that do, the way `skill-levels-xp-events` closes its event list.
  Because the set is closed, every shape's connectivity is proved once by a test over the catalogue
  — there is no per-jewel reachability check, and no grammar for authoring topology.
- [c4] `# cluster-jewel` names a shape, says which edges are open, and fills numbered positions with
  passives. Positions are authored as `<position> <passive>` pairs, the `# entity` `stats:` shape —
  a list hydrated into a map, so it reads inline or one pair to a line. A position outside the
  shape's range, a position filled twice, or a passive that does not resolve is refused at load time.
  It also declares `mod-slots:`, how many cluster effects a cluster made from it may carry,
  defaulting to 2. Two rather than one because a capacity of one makes the composition rule
  unreachable, and a rule no content can exercise is a rule no test can hold to account.
- [c5] **An unfilled position is a node, not a gap.** It can be allocated, it costs a point, it
  conducts adjacency to whatever it touches, and it grants nothing. A jewel that fills two of twelve
  positions is a corridor the player pays ten points to cross, and that is a shape worth authoring
  rather than a jewel with parts missing.
- [c6] `open-connections` names between one and five of the five non-root edges, each at most once.
  At least one is the structural guarantee that the plane never runs out of somewhere to grow; five
  is what the geometry leaves once the root has the west edge. Naming the west edge, or naming one
  edge twice, is refused at load time.
- [c7] Rotation is determined, never chosen. Slotting a jewel through a slot on direction `d` places
  its cluster in the neighbouring hex, whose shared edge with the parent is `opposite(d)`, and the
  jewel is rotated by exactly the amount that carries its root node's west edge onto that shared
  edge. Slotting through an east-facing slot is therefore the identity, through a west-facing slot a
  half turn, and every other edge a multiple of a sixth. The rotation is a function of the slot, so
  there is nothing for the player to decide and nothing to store beyond which edge was used.
- [c8] Clusters occupy hexes addressed in axial coordinates on a pointy-top grid, whose six
  directions are `e`, `ne`, `nw`, `w`, `sw` and `se`. A jewel slot is an edge midpoint and is shared
  by exactly two hexes. A hex holds at most one cluster, so a slot may be filled only when the hex
  on its far side is empty; a slot facing an occupied hex is **blocked**, and both filling it and
  allocating it are refused. Two adjacent clusters are never joined by their shared edge — a
  connection exists only through a slot that was actually filled — so bare adjacency grants nothing
  that was not authored.
- [c9] The origin is the general rule's degenerate case, not a special case beside it. An item base
  occupies hex `(0, 0)` with a cluster that is never slotted and therefore never rotated: its root
  node is allocated from the start, costs no point, and is under no obligation to sit on the west
  edge, because the west-edge convention exists only to give slotting a defined rotation. By default
  that cluster is a single jewel slot on the east edge and nothing else, which is the item's on-ramp.
  A base may instead declare a `cluster-jewel:` of its own for hex `(0, 0)`, so a unique weapon ships
  with authored passives and a slot layout of its choosing; the default is what that rule yields when
  nothing is declared.
- [c10] A cluster jewel reaches the player as an ordinary item. An `# item` names one through
  `cluster-jewel:` to become the droppable thing, so jewels drop through `droptables`, stack in
  inventory, and are carried by the existing item machinery with no second inventory and no second
  drop path. A `cluster-jewel:` naming an unknown declaration is a load-time reference error like
  every other reference in the language.
- [c11] Instancing is **lazy**. `inventory[itemId]` keeps counting stacks until a jewel is slotted
  into one; that single item then leaves the stack and becomes an instance carrying its plane, its
  allocations and its experience. Instances are the `instanced-objects` substrate and nothing else —
  no second instance table in `GameState`, no second prune rule, no second save migration.
- [c12] Item experience has exactly one source. Consuming an item that declares `item-experience:`
  raises the target instance's experience by that amount, and no other event in the game changes it.
  An item's level is `skill-levels-xp-events`'s `level(X)`, imported rather than reimplemented —
  there is one level curve in this repository — and its passive points equal its level. An item base
  declares `max-level:`, defaulting to 99; feeding an item already at its maximum is refused with
  the consumed item intact, rather than silently absorbed.
- [c13] Allocation is bounded by points and gated by adjacency. A passive or a jewel slot may be
  allocated when at least one of its neighbours is already allocated — a neighbour, not a parent,
  because the graph may contain cycles. The origin cluster's root is allocated from the start and is
  what every path is ultimately reachable from. Allocating with no point remaining, out of adjacency,
  or onto a blocked slot is refused and costs nothing.
- [c14] Slotting and allocation are both permanent. A jewel is consumed when slotted, a filled slot
  refuses a second jewel, and no directive un-allocates a node or un-slots a jewel. The refusals are
  proved, not asserted: attempting each is a checked outcome, not an absence.
- [c15] A **cluster effect** is applied to a cluster already standing in an item's plane, never to a
  jewel in inventory. An `# item` declaring `cluster-effect:` names a percentage and a stat; using
  one on a placed cluster consumes it and records it against that cluster. It is refused, with the
  item intact, when the cluster is already at its `mod-slots:` capacity. Jewels therefore stay
  stackable and uninstanced — the record lives in state that `instanced-objects` already holds, and
  there is no second instance table.
- [c16] A cluster effect scales the magnitude of every payload naming its stat, in that cluster only,
  in whichever channel the payload already lands in and without moving it between them. Under a 25%
  health effect a `+10 max-health` passive contributes `+12.5` and a `+10% max-health` passive
  contributes `+12.5%`. **Effects on one cluster compose additively into one pool**, exactly as
  `increased` already composes in `statRange`: two 25% effects are `1 + 0.25 + 0.25`, so the payloads
  become `+15` and `+15%`, and never `1.25 x 1.25`. The compounding the player feels comes from the
  fold multiplying the two scaled channels together, not from effects multiplying each other.
- [c17] The worked case is pinned, because it is the one a reader will check. `max-health` has base
  30. A cluster holding an allocated `+10 max-health` and an allocated `+10% max-health`, with
  nothing else in play, evaluates through `(base + added) x (1 + increased)`:
  `(30 + 10) x 1.10 = 44`. One 25% health effect makes it `(30 + 12.5) x 1.125 = 47.8125`. A second
  makes it `(30 + 15) x 1.15 = 51.75` — not the `52.75` that multiplying the effects would give.
  A test asserts these three numbers, and asserts them with a tolerance: the additive path evaluates
  to `51.74999999999999` in binary floating point, so an exact comparison would fail on the one
  number that distinguishes the two rules.
- [c18] The same passive allocated in two clusters is worth two different amounts, because an effect
  is a property of the cluster and stops at its edges. A payload's own `+N%` is not so scoped: it
  joins the one global `increased` pool `statRange` already keeps, so it multiplies the stat's base
  and every other source alongside its own cluster. Cluster effects add no channel and change no
  arithmetic in `statRange`; they decide what a payload is worth before it is handed to it.
- [c19] The scaled payload is what the runtime reports, and it is not rounded per passive. A
  position showing `+12.5 max-health` shows the number that reaches the fold, so any surface — the
  CLI now, a tree view later — states the effective value rather than the declared one with a
  footnote. Rounding, if a consumer wants it, happens where the stat is finally assembled, so four
  scaled `+10`s are worth `50` and never `48`.
- [c20] An item's contribution is the sum of the scaled payloads of its allocated passives, computed
  by one pure function of the instance, and it reaches combat through the same stat-bonus path an
  equipped `+2 attack` already takes. A focused fixture proves that allocating one passive changes
  outgoing damage, that applying a mod to one cluster leaves an identical passive in another cluster
  untouched, and that an instance the player is not wearing is inert.
- [c21] An instance survives a reload with identical evaluated stats, and is repaired rather than
  broken when content moves underneath it: an instance whose template is gone is pruned, and a
  slotted jewel or allocated node whose declaration is gone is dropped with its point returned, so a
  loaded instance is never over its own budget. Permanence is a rule about what the player may do,
  not a promise that deleted content stays evaluable.
- [c22] Growing an item is reachable through the directive surface every other play input goes
  through, so a `# test` section records feeding, slotting, allocating and applying a cluster mod —
  and each refusal in c8, c12, c13, c14 and c17 — and replays green over the shipped content.
- [c23] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests,
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
  perfectly good authored form for no reason.
- **Topology is a closed catalogue, not a grammar.** An earlier draft let a jewel author its own nodes
  and edges, which meant a grammar for adjacency, a per-jewel reachability check, and an unbounded
  space of shapes to balance against. Naming one of a fixed set collapses all three: there is no
  topology grammar, connectivity is a property of the catalogue proved once by a test rather than
  re-checked per jewel, and a shape that plays badly is fixed in one place for every jewel using it.
  It also makes the eventual GUI tractable, because a renderer needs to know how to draw six shapes
  rather than an arbitrary graph. Adding a shape becomes a code change, which is the correct cost:
  a new topology is a new thing to balance and to draw, not content.
- **A passive is a section, and a position is a reference to one.** Passives share the global id
  space, so `hale` is authored once and named by every jewel that wants it. Inlining payloads into
  the jewel would have made the same passive a dozen unrelated declarations, and would have left the
  tag selector, when something tag-shaped needs one, with nothing stable to select over.
- **A passive is a fixed number, because it is always on.** A range needs a moment to roll, and a
  passive has none: it is not acquired, it is allocated, and it applies from then on. Rolling at
  allocation would mean a saved instance carried a number per allocated position, and pruning,
  migration and the evaluation fold would all have to carry it too — a whole second instancing story
  for variance that belongs on the jewel, not on the passive. Keeping the payload fixed is what makes
  an instance's state a set of allocated positions and a handful of cluster mods, with no number
  anywhere in it. Variance lives on the cluster mod, which is applied once and then fixed too.
- **An unfilled position is a node that grants nothing, not an absent node.** It costs a point and
  conducts adjacency, which is what makes a sparse jewel a corridor rather than a defective one, and
  makes "how much of this jewel is worth crossing" an authored decision. An empty position has no
  payload, so no cluster effect touches it: a corridor cannot be made worth crossing by an orb.
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
- **Cluster mods are applied to a placed cluster, never to a jewel in inventory.** That one choice is
  what keeps jewels stackable and uninstanced: a mod recorded against a cluster lives in state the
  item instance already holds, so there is no second instance table, no second prune rule and no
  second save migration. Applying to inventory would have made every jewel an instance in order to
  carry a property that only means anything once the jewel is somewhere — "increased effect of health
  passives *in this cluster*" has no referent until there is a cluster.
- **A mod selects by stat, not by tag.** The four shipped orbs name `max-health`, `attack`, `defense`
  and `regeneration`, and a mod scales every payload clause naming its stat. Selecting by stat is
  exact — `+12.5` is arithmetic on a number the passive already declares — where selecting by tag
  needs a tag vocabulary agreed between whoever authors passives and whoever authors orbs. A tag
  selector is the natural generalisation the moment something tag-shaped needs one (`poison` is not a
  stat), and passives already carry tags for it; it is not built until then.
- **"Increased" already means additive-pool in this repository, and a cluster effect is the same word
  one level up.** `statRange` keeps `fold.increased` as a running sum and applies it once as
  `(base + added) x (1 + increased)`. A cluster effect composes the same way — two 25% effects are
  50%, not 56.25% — so there is one rule to learn rather than two, and it is a rule the codebase
  already enforces somewhere a reader can go and look at. Naming it anything else would have made
  `+N%` mean additive in one place and multiplicative in another, which is the confusion worth
  spending a rename to avoid.
- **What compounds is the fold, not the effects.** This is the part that reads as contradictory and
  is not. An effect scales *both* channels of the payloads it touches: a `+10` becomes `+12.5` and a
  `+10%` becomes `+12.5%`. Those two then multiply each other inside `statRange`, which is where the
  player's felt compounding comes from. So the mechanic is multiplicative in its result and additive
  in its composition, and both halves are true at once because they are statements about different
  operations.
- **`more` is the word held in reserve.** If a genuinely multiplicative modifier is ever wanted — one
  that stacks as `x1.25` per copy rather than joining a pool — Path of Exile's name for it is `more`,
  and this repository has not spent that word on anything. Keeping `increased` honest is what leaves
  it available.
- **The field is `cluster-effect:`, not `cluster-mod:`.** "Mod" says where the thing lives and
  nothing about what it does, and it collides with the content-module sense of the word that
  `src/content/modportal.ts` already owns. "Effect" says the operation: it scales what a passive is
  worth rather than granting a stat. The value is spelled `+25% max-health`, the same `+N%` token the
  language already uses, precisely so that the additive-pool rule is carried by the syntax instead of
  needing to be remembered separately.
- **`mod-slots:` defaults to 2 so the composition rule is reachable.** At a capacity of one, two
  effects never meet, additive and multiplicative give identical answers, and c17's third number
  cannot be asserted by any test. A rule no content can exercise is a rule nothing holds to account,
  which is a worse position than either answer.
- **A mod stops at the cluster's edge, which is what makes it a crafting decision.** The same passive
  allocated in two clusters is worth two different amounts, so an orb is spent on *which hexagon*,
  and a dense single-stat cluster is worth more to it than a scattered one. A global multiplier
  would have been a straight power gain with no decision attached to it.
- **The effective value is what the runtime reports.** A position under a health mod is `+12.5
  max-health`, not `+10` with an asterisk. Any surface then states what is true without computing it
  itself, which is the difference between one answer and one answer per surface.
- **Rounding happens where the stat is assembled, never per passive.** Four scaled `+10`s are worth
  `50`, not `48`. Rounding each payload first loses two whole points to no purpose, and it is the
  repository's own rule — enforce where a value is assembled, not where it is written.
- **The remaining sequel is variance on the drop, not the mod machinery.** What is not built here is
  a jewel arriving with a mod already on it, more than one mod slot, and selection by tag. Each is a
  content or capacity change on top of what this branch ships, and none of them changes the state
  model, which is the test of whether deferring them is honest.
- **Reuse, not new systems.** Jewels are items, so drops, stacking and inventory are `droptables` and
  the existing item machinery. Instances are `instanced-objects`. Levels are `skill-levels-xp-events`.
  Payloads are tag clauses folded by `statRange`. The genuinely new code is the `# cluster-jewel`
  section kind, the `# passive` section kind, the shape catalogue, their load-time validation, the
  hex plane with its placement and blocking rules, the allocation rules, and one evaluation fold.
- **The authoring trial is `docs/smithing/cluster-jewels-draft.dsl`**, written against the real
  grammar rather than against an imagined one. Two constraints it found are already reflected above:
  a block key must match `[a-z][a-z0-9 -]*`, so numbered positions cannot be block keys and are
  authored as `<position> <passive>` pairs the way `# entity` authors `stats:`; and directions are
  ids, so they are `ne` and not `NE`.
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

Jewels that drop with a mod already rolled on them, more than one mod slot on any shipped jewel,
mods that select by tag rather than by stat, and jewel instancing of any kind.
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
- Which shapes the catalogue ships with. The trial uses `point`, `spindle`, `ring`, `wheel` and
  `double-ring`, which cover the degenerate, the corridor, the cycle, the hub and the large cluster;
  whether that set is right is a content judgement, and adding to it is a code change by design.
- `skill-levels-xp-events` is itself blocked on `first-class-modals`. The level curve is one pure
  function; whichever of the two branches lands first should own it and the other import it, rather
  than either waiting on the other for arithmetic.
