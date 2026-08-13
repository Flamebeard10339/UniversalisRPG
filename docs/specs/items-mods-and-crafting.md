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
  A base may instead declare an `origin-cluster:` of its own for hex `(0, 0)`, so a unique weapon
  ships with authored passives and a slot layout of its choosing; the default is what that rule
  yields when nothing is declared. **You grow what you can wear:** an item is a base if and only if
  it declares a `slot:`, so a consumable, a jewel and an orb have no plane and every growth verb
  refuses one as its target. Amended 2026-08-12, after this spec's first audit found that one field
  named two roles and that nothing said which items had a plane at all.
- [c10] A cluster jewel reaches the player as an ordinary item. An `# item` names one through
  `cluster-jewel:` to become the droppable thing, so jewels drop through `droptables`, stack in
  inventory, and are carried by the existing item machinery with no second inventory and no second
  drop path. A `cluster-jewel:` naming an unknown declaration is a load-time reference error like
  every other reference in the language. `cluster-jewel:` says the item **is** a jewel and
  `origin-cluster:` says the item **has** a plane; an item declaring both is refused at load, because
  the two roles are exclusive and the refusal is what stops a weapon being consumed as a jewel.
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
- **A cluster effect selects by stat, not by tag.** The four orbs name `max-health`, `attack`, `defense`
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

- The directive spelling for the four verbs — feed, slot, allocate, apply an effect — is the worker's
  to choose, including whether feeding, slotting and applying are one verb dispatching on what the
  consumed item declares or three. All three consume an item against a target on the plane, so one
  verb is plausible. The clauses fix what each must do and refuse, not what it is called.
- Which shapes the catalogue ships with. The trial uses `point`, `spindle`, `ring`, `wheel` and
  `double-ring`, which cover the degenerate, the corridor, the cycle, the hub and the large cluster;
  whether that set is right is a content judgement, and adding to it is a code change by design.
- `skill-levels-xp-events` is itself blocked on `first-class-modals`. The level curve is one pure
  function; whichever of the two branches lands first should own it and the other import it, rather
  than either waiting on the other for arithmetic.

## Audit passes

### Pass 1 — 2026-08-13

- base: `7d58a6491c0ca32f9d19569c2c3f8951132f3ef7`
- head: `239c0e4dd91f510ed69c3f31f46064b6cd0d7df9`
- proof 1: met — `passiveSchema` in src/content/passive.ts registers kind `passive` with the
same `list(tagClause)` body `# item` uses (`clauses: 'tags'`); src/content/module.ts adds it to
SCHEMAS, src/content/namespace.ts adds it to NAMESPACED_KINDS, src/content/registry.ts adds
`registry.passives` and the `['passive','passives']` entry in CONTENT_SECTION_MAPS. Re-run:
`npx vitest run src/content/passive.test.ts` — "reads bare tags and stat-bonus payloads in one
comma list", "defaults its title from its id, the way every other section does", "is named from
the global id space, so any number of cluster jewels can reference it". Shipped content backs the
sharing claim: `hale` in content/tutorial-island.dsl is named by stout-heart (positions 2 and 5),
tempered-will (1) and great-work (5).
- proof 2: met — `passiveRangeProblem` (src/content/passive.ts:38-45) is called from applySection's
`case 'passive'` in src/content/registry.ts, so it runs on the merged value rather than on one
authored section. The percent half needs no check: tagClause's `parseAmount` already throws "a
percent stat bonus cannot be a range" and BonusAmount types a percent amount as `number`.
Mutation-tested: replacing the guard condition with `if (false)` is KILLED by
src/content/passive.test.ts > "# passive refuses a range payload > rejects +5-8 accuracy, naming
the clause it rejected" and > "passiveRangeProblem > names the statId and the range when a payload
is not fixed". Enforcement is at assembly, not at authoring: `npm run inspect` over a module that
re-declares `# passive keen` with `+5-8 accuracy` is refused with "# passive keen: +5-8 accuracy is
a range; a passive has no moment to roll one, so its payload must be one value".
- proof 3: met — src/content/shapes.ts holds CATALOGUE as a module-private const with five entries and
no authoring grammar anywhere; `getShape` throws "shape must be one of point, spindle, ring, wheel,
double-ring, got ...". Re-run: `npx vitest run src/content/shapes.test.ts` — the generated
"<shape> reaches every position from position 1" case per catalogue entry proves connectivity once
over the set, plus "numbers positions 1..N and never lets adjacency or an edge name a position
outside that range". Mutation-tested: neutering `if (!shape)` in getShape is KILLED by
src/content/clusterJewel.test.ts > "rejects a shape that does not exist, listing the ones that do"
and src/content/shapes.test.ts > "names a shape that does not exist with an error listing the ones
that do". No per-jewel reachability check exists: grep for a walk over `adjacency` outside
shapes.test.ts and clusterPlane.ts's `neighbours` returns nothing.
- proof 4: met — `positionAssignment` in src/content/clusterJewel.ts parses `<position> <passive>` the
way src/content/entity.ts's `statAssignment` parses `stats:`, and `hydratePositions` throws on a
repeat rather than letting the later one win. `modSlots` defaults to DEFAULT_MOD_SLOTS = 2.
Re-run: `npx vitest run src/content/clusterJewel.test.ts` — "reads a shape, open-connections and
passives inline", "reads passives one pair to a line, the way # entity reads stats: as a block",
"defaults mod-slots to 2, and reads an explicit override", "rejects a position outside the shape's
range", "rejects a position filled twice", "rejects a passive that does not resolve, as an ordinary
load-time reference error".
- proof 5: met — allocateNode (src/runtime/clusterPlane.ts:176) bounds a position by
`getShape(...).positionCount` and never by which positions the jewel filled; positionPayloads
returns `[]` for an unfilled one, and `neighbours` walks the shape's adjacency regardless.
Re-run: `npx vitest run src/runtime/clusterPlane.test.ts -t "treats an unfilled position as a node"`.
Mutation-tested: narrowing the bound to `Object.keys(placement.jewel.positions).length` is KILLED
(15 of 30 tests in clusterPlane.test.ts fail).
- proof 6: met — `clusterJewelProblem` (src/content/clusterJewel.ts:68-84) refuses an empty
open-connections, the west edge, a repeat and an unknown direction, and is called from
registry.ts's `case 'cluster-jewel'`. Re-run: `npx vitest run src/content/clusterJewel.test.ts` —
"accepts all five non-root edges at once", "rejects the west edge, which the root occupies",
"rejects the same edge named twice", "rejects zero open connections, the structural non-termination
guarantee", "rejects a direction that is not one of the six". Mutation-tested: neutering the west
guard is KILLED by "open-connections > rejects the west edge, which the root occupies".
- proof 7: met — `placementOf` (src/runtime/clusterPlane.ts:66) computes
`rotationOnto('w', opposite(cluster.entry))` and stores nothing but `entry`; the Cluster interface
has no rotation field. Re-run: `npx vitest run src/runtime/clusterPlane.test.ts` — "carries the root
west edge onto the edge it entered through, through every one of the six", "is the identity through
an east-facing slot and a half turn through a west-facing one", "is a sixth of a turn for every
other edge, and the plane stores only the edge". Mutation-tested: dropping the `opposite` is KILLED
by the first two of those.
- proof 8: met — src/content/hex.ts names the six axial directions with constant deltas and no odd/even
case; `slotState` returns 'blocked' when the hex beyond holds a cluster that entered another way,
and `slotProblem` is the single sentence both `fillSlot` and `allocateNode` refuse through.
`neighbours` crosses a hex boundary only when `beyond.entry === node.direction`. Re-run:
`npx vitest run src/runtime/clusterPlane.test.ts` — "blocks the slot facing an occupied hex, for
filling and for allocating alike", "joins two clusters only through a slot that was filled, never
through the edge they share", plus src/content/hex.test.ts's four cases. Mutation-tested: collapsing
`beyond.entry === direction ? 'filled' : 'blocked'` to `'filled'` is KILLED by the blocking test.
- proof 9: met — BASE_CLUSTER (src/runtime/clusterPlane.ts) is a `point` with `open-connections: e`, no
positions, and is never registered; `originPlane(item.clusterJewel ?? null)` is the one constructor
and records `jewel: null` for the default. `isAllocated` grants the root free only where
`cluster.entry === null`, which is the origin and nowhere else, so the origin is the general rule
with entry unset rather than a branch beside it. Re-run:
`npx vitest run src/runtime/clusterPlane.test.ts` — "is a point with one open east connection when
the base declares none of its own", "is the base own cluster when it declares one, standing
unrotated", "has its root allocated from the start, and costs a point for every other node".
Shipped: content/tutorial-island.dsl's iron-sword takes the default and heartwood-blade declares
`cluster-jewel: heartwood-core`. See finding "a base's own origin cluster and a droppable cluster
jewel are one field" — the mechanism works, the field it is spelled with does two jobs.
- proof 10: met — `clusterJewel` is an ordinary `id` field on itemSchema resolved through
referenceSites.ts's `put(section, 'clusterJewel', 'cluster-jewel', ...)`, so it is a load-time
reference error like any other, and nothing about drops, stacking or inventory was touched.
Re-run: `npx vitest run src/content/item.test.ts` — "names a # cluster-jewel to become the
droppable jewel", "rejects a cluster-jewel: naming an unknown declaration", "is optional: an
ordinary item declares no cluster-jewel: at all". Shipped: the `# droptable smiths-cache` in
content/tutorial-island.dsl hands out six jewel items, and `# test growing-a-heartwood-blade`
opens the chest and slots two of them, replayed by src/runtime/integration.test.ts.
- proof 11: met — `growItem` (src/runtime/itemInstance.ts) is the only door: it mints through
`createInstance` after `growing.change` succeeds, so a refused verb leaves the stack whole.
`defineInstanceKind<ItemInstance>(ITEM_INSTANCE, ...)` is the whole registration — grep of the
diff shows no new field in SAVE_FIELDS in src/runtime/save.ts, no new table in GameState and no
new prune. Re-run: `npx vitest run src/runtime/itemInstance.test.ts` — "counts stacks while nothing
has happened to any of them", "leaves the stack the moment it is fed, and takes its experience with
it", "mints nothing and consumes nothing when the verb is refused", "grows the one that left the
stack from then on, and leaves the rest countable".
- proof 12: met — `feedItem` is the one writer of `payload.experience`; `grep -n "experience" src/runtime`
finds no other assignment. `itemLevel` is `Math.min(skillLevel(payload.experience), item.maxLevel)`
with `skillLevel` imported from ./skills, and `pointsRemaining` is `itemLevel - pointsSpent`.
DEFAULT_MAX_LEVEL = 99 in src/content/item.ts. Re-run:
`npx vitest run src/runtime/itemInstance.test.ts` — "has one source, so an item that grants none is
refused as food", "buys one passive point a level, off the one level curve in the repository",
"stops at the base max-level, refusing the feed with the item intact", "runs past ten on a base that
declares no maximum, because the default is 99". Mutation-tested: neutering the max-level guard is
KILLED by the third of those.
- proof 13: met — allocateNode refuses in order: out of the shape's range or no slot / blocked, already
allocated, `points < 1`, then no allocated neighbour — and returns a string before touching the
plane in every case, so a refusal costs nothing. `neighbours` is symmetric and never a parent
relation. Re-run: `npx vitest run src/runtime/clusterPlane.test.ts` — "asks for a neighbour and not
a parent, so a ring is walked either way round", "refuses a node nothing allocated touches, and the
refusal costs nothing", "refuses when no point remains, and the refusal costs nothing", "refuses a
position the shape does not have, and an edge with no slot on it". Mutation-tested: neutering the
adjacency gate is KILLED by "refuses a node nothing allocated touches".
- proof 14: met — No directive in the Directive union un-allocates or un-slots; `drop` in
clusterPlane.ts is reachable only from repairPlane. `fillSlot` refuses a filled slot and
`allocateNode` refuses an allocated node. Re-run: `npx vitest run src/runtime/clusterPlane.test.ts`
— "refuses a second jewel in a slot that already holds one", "refuses a node twice, the
pre-allocated root included" — and `npx vitest run src/runtime/itemInstance.test.ts -t "refuses a
second jewel into a filled slot"`. Mutation-tested: both guards neutered separately, both KILLED.
The shipped `# test growing-a-heartwood-blade` writes both refusals out (`refuse: slot 1 at 0,0 e
with causeway-jewel`, `refuse: allocate 1 at 0,0 position 2`) with points deliberately in hand.
- proof 15: unmet — The capacity and consumption halves hold, and are proved:
`npx vitest run src/runtime/clusterEffect.test.ts` — "consumes the item and records it against the
cluster it was used on", "leaves the orb a stack and mints no second instance for it", "refuses the
effect once the cluster fills its mod slots, with the item intact", "reads the capacity off the
jewel, so one that declares a single slot holds one"; mutation-testing the mod-slots guard is
KILLED. What fails is "never to a jewel in inventory". `applyClusterEffect` hands its `target`
straight to `growItem`, which accepts any id `registry.items.get` resolves, so a stacked cluster
jewel is a legal target: it de-stacks into an ItemInstance whose origin cluster is its own
declaration, and the effect is recorded on it. Reproduced with `npm run inspect` over a two-item
module (`# item node-jewel / cluster-jewel: node`, `# item orb / cluster-effect: +25% max-health`):
`applyClusterEffect(state, registry, 'node-jewel', 'orb', ORIGIN)` returns
`{ ok: true, instance: '1' }`, inventory goes node-jewel 3 -> 2 and orb 1 -> 0, and
`state.instances.byId['1']` is `{ kind: 'item', template: 'node-jewel', payload: { experience: 0,
plane: { '0,0': { jewel: 'node', entry: null, ..., effects: ['orb'] } } } }`. Both items are gone
and the resulting instance can never be slotted, because slotJewel consumes from `inventory`.
That is the clause's own sentence and the "Cluster mods are applied to a placed cluster, never to a
jewel in inventory" decision failing at once. Filed as "every growth verb accepts any item as its
target".
- proof 16: met — `clusterScale` (src/runtime/clusterEffect.ts:22-30) sums `percent / 100` into one
`pooled` and returns `1 + pooled`, over `cluster.effects` alone, so it stops at the cluster's edge;
`scaledAmount` in src/runtime/stats.ts multiplies within the channel the BonusAmount already
declares and never moves it. Re-run: `npx vitest run src/runtime/clusterEffect.test.ts` — "scales a
flat payload in the added channel" (42.5), "scales a percent payload in the increased channel, where
it multiplies the base" (33.75), "leaves an identical passive in another cluster at its declared
value" (scales `[1.25, 1]`). Mutation-tested: replacing the pool with
`pooled = (1 + pooled) * (1 + declared.percent / 100) - 1` is KILLED by "evaluates (30 + 15) x 1.15
under two, and not the 52.75 multiplying them would give".
- proof 17: met — `npx vitest run src/runtime/clusterEffect.test.ts -t "the worked case the reader will
check"` — three cases asserting 44, 47.8125 and 51.75 with `toBeCloseTo(..., 10)`, and the third
also asserts `.not.toBeCloseTo(52.75, 2)`. The fixture is real rather than derived: `max-health`
has `base: 30`, `# cluster-jewel twin` is a spindle whose root (position 1, the west edge) is
`hale` = `+10 max-health` free at the origin, and position 2 is `vigorous` = `+10% max-health`
allocated with a point — so `(30 + 10) x 1.10` is arithmetic the test does not compute for itself.
The tolerance is load-bearing exactly as the clause says: the additive path lands on
51.74999999999999.
- proof 18: met — The diff to `statRange` adds no channel: StatFold is unchanged, `foldBonus` routes
through `scaledAmount` and is arithmetically identical for `times === 1`
(`(amount * times) / 100` vs `(amount * times) / 100`), and the effect arrives as the same `times`
argument a skill level already arrives as. Re-run:
`npx vitest run src/runtime/clusterEffect.test.ts -t "an effect stops at its cluster"` — "leaves an
identical passive in another cluster at its declared value" (two clusters both carrying `hale`,
one scaled 1.25 and one 1, 50 -> 52.5), "lets a payload percent multiply the equipped item's own
flat bonus, which the effect never touches" (55 -> 59.0625), "scales only the payloads naming the
effect's stat".
- proof 19: met — `scaledAmount` is the one multiplication of a BonusAmount and rounds nothing;
`positionPayloads` hands out the declared bonus and the factor separately, and PlaneReport's
`effective` is `scaledAmount(payload.bonus, payload.scale)` so the surface and the fold read the
same number. Re-run: `npx vitest run src/runtime/clusterEffect.test.ts` — "rounds no payload, so
four scaled +10s are worth 50 and never 48" (80 with base 30), "hands the fold the declared bonus
and the factor, leaving one place that multiplies one" — and `npx vitest run scripts/planeView.test.ts
-t "states the effective payload first and the factor that made it after"`. Mutation-tested:
rounding inside scaledAmount is KILLED by three tests including "evaluates (30 + 12.5) x 1.125
under one 25% effect".
- proof 20: met — `instancePayloads(registry, instance)` is one pure function of the instance, and
`foldPlanePayloads` in src/runtime/stats.ts feeds it to the same `foldBonus` an equipped `+2 attack`
takes, inside the existing `for (const wornId of own.equipped)` loop. Re-run:
`npx vitest run src/runtime/clusterEffect.test.ts -t "a plane's contribution reaches combat"` —
"moves outgoing damage when a passive is allocated" (attack 4 -> 8, and hitDamage compared), "is
inert while the player is not wearing the instance" (30 and 4 unworn, 44 once equipped) — and
`-t "leaves an identical passive in another cluster at its declared value"` for the third clause of
the fixture.
- proof 21: met — `repairPlane` runs from the instance kind's `repair` hook, so it is the substrate's
own prune rather than a second one; `templateLoaded` prunes an instance whose item is gone, and
dropUnplaceable / dropStranded / dropVanishedAllocations / dropVanishedEffects /
dropUnreachableAllocations each return the point rather than leaving it spent. Re-run:
`npx vitest run src/runtime/itemInstance.test.ts -t "an instance across a reload"` — "comes back
with the same experience and the same plane", "is pruned when its own template goes", "drops a
slotted jewel whose declaration is gone and returns its point, so it is never over its budget",
"survives a repair that leaves nothing recorded, because dropping it would destroy the item",
"refuses a save whose plane is not one" — plus the seven cases under
`npx vitest run src/runtime/clusterPlane.test.ts -t "a plane whose content moved underneath it"`
(including "has nothing left to say about a plane it has already repaired", which is the fixpoint)
and `npx vitest run src/runtime/equipment.test.ts -t "is still worn, and still worth the same,
after a reload"` for the identical-evaluated-stats half.
- proof 22: met — `# test growing-a-heartwood-blade` in content/tutorial-island.dsl uses the four
directives added to the Directive union in src/content/test.ts and nothing else, and closes on
`expect: growing-a-heartwood-blade-end`, a full save comparison covering both instances, every
allocation and every recorded effect. It is replayed over the shipped content by the generated
`test "<id>" passes` case in src/runtime/integration.test.ts, which is green under `npm test` in
`npm run tasks -- merge-ready`. Refusals it records: c8 blocking (`refuse: allocate 1 at 1,0 slot
nw`, `refuse: slot 1 at 1,0 nw with causeway-jewel`), c12 (`refuse: feed heartwood-blade with
orb-of-vitality`, `refuse: feed 2 with masters-whetstone` at the level-10 cap), c13 (`refuse:
allocate heartwood-blade at 0,0 position 3` out of adjacency, `refuse: allocate 1 at 1,0 slot se`
with no point left), c14 (`refuse: slot 1 at 0,0 e with causeway-jewel`, `refuse: allocate 1 at 0,0
position 2`). Note for the record: the clause's "c17" has no refusal in it; what the test carries
is c15's two (`refuse: apply 1 at 1,-1 with orb-of-the-edge` by identity and `refuse: apply 1 at
1,-1 with orb-of-the-bulwark` by capacity), which is what the sentence must have meant.
- proof 23: met — `npm run tasks -- merge-ready` on 239c0e4: tsc ok, npm test ok, layer-check ok,
audit-status ok, doctor ok (20 warnings, which do not fail the leg), bytes ok — the six legs the
clause names, all green in one invocation, plus tree and base. Re-run the same command. The
invocation as a whole still exits non-zero on three spec-standing legs: `spec crafting-modal`
(1 open member), `spec items-mods-and-crafting` (1 open member, cluster-merge-ready) and
`clauses items-mods-and-crafting` (no recorded audit pass — this pass). The second and third close
themselves; the first is filed as a finding.

### Pass 2 — 2026-08-13

- base: `7d58a6491c0ca32f9d19569c2c3f8951132f3ef7`
- head: `3c788d40a13800259fc1a2c0955a5e2800b3ceaf`
- proof 1: met — Re-graded at head 3c788d4, not carried forward. passiveSchema in src/content/passive.ts
  still registers kind passive with the same list(tagClause) body an item body uses, and
  src/content/namespace.ts now lists passive and cluster-jewel in NAMESPACED_KINDS so a passive id
  sits in the same global space as every other section. Re-run:
  npx vitest run src/content/passive.test.ts — six cases green at this head, including "is named from
  the global id space, so any number of cluster jewels can reference it". Shipped content still backs
  the sharing half: hale in content/tutorial-island.dsl is filled by stout-heart, tempered-will and
  great-work.
- proof 2: met — Re-run at this head: npx vitest run src/content/passive.test.ts — "rejects +5-8 accuracy,
  naming the clause it rejected", "accepts the fixed payload a range was written as a typo of", "still
  refuses a percent range, which tagClause itself already catches", and the two passiveRangeProblem
  unit cases, all green. The guard is still called from applySection's passive case in
  src/content/registry.ts, so it runs on the merged value rather than on one authored section — the
  same assembly point confirmed by probe for c10 below. Nothing in the pass-1 to pass-2 diff touches
  passive.ts.
- proof 3: met — Re-run at this head: npx vitest run src/content/shapes.test.ts — 13 cases green,
  including the generated "<shape> reaches every position from position 1" per catalogue entry
  (point, spindle, ring, wheel, double-ring), which is the once-over-the-set connectivity proof, and
  "names a shape that does not exist with an error listing the ones that do". CATALOGUE is still a
  module-private const in src/content/shapes.ts with no authoring grammar reaching it.
- proof 4: met — Re-run at this head: npx vitest run src/content/clusterJewel.test.ts — 14 cases green,
  covering inline and block passives:, the mod-slots default of 2 and an explicit override, a
  position outside the shape's range, a position filled twice, and a passive that does not resolve.
- proof 5: met — Re-run at this head: npx vitest run src/runtime/clusterPlane.test.ts -t "treats an
  unfilled position as a node" — green. allocateNode still bounds a position by
  getShape(...).positionCount and never by which positions the jewel filled
  (src/runtime/clusterPlane.ts:183-184), and positionPayloads returns an empty list for an unfilled one.
- proof 6: met — Re-run at this head: npx vitest run src/content/clusterJewel.test.ts — the five
  open-connections cases green (all five non-root edges at once, the west edge, a repeat, zero, and a
  direction that is not one of the six). Independently reproduced the west refusal through the loader:
  npm run probe over a module whose open-connections: w, e is refused with "open-connections:
  names the west edge, which the root occupies". Note this same refusal is what makes c9 unmet — see
  proof 9; c6's rule holds exactly as written, it is c9's exemption for the origin that does not.
- proof 7: met — Re-run at this head: npx vitest run src/runtime/clusterPlane.test.ts — the three
  rotation cases green ("carries the root west edge onto the edge it entered through, through every one
  of the six", "is the identity through an east-facing slot and a half turn through a west-facing one",
  "is a sixth of a turn for every other edge, and the plane stores only the edge"). placementOf
  (src/runtime/clusterPlane.ts:64-68) still computes rotationOnto('w', opposite(cluster.entry)) and
  the Cluster interface still has no rotation field.
- proof 8: met — Re-run at this head: npx vitest run src/runtime/clusterPlane.test.ts — "blocks the slot
  facing an occupied hex, for filling and for allocating alike" and "joins two clusters only through a
  slot that was filled, never through the edge they share" green, plus the four cases in
  npx vitest run src/content/hex.test.ts. slotProblem is still the single sentence both fillSlot
  and allocateNode refuse through. Independently measured at the content level: mutating the shipped
  blocking refusal "refuse: allocate 1 at 1,0 slot nw" to "slot sw" is KILLED by
  src/runtime/integration.test.ts, so the blocked edge is the one the fixture is actually asking about.
- proof 9: unmet — The amendment's own half holds and is mutation-proved; an older sentence in the same
  clause does not, and that is why this is graded on its own evidence rather than carried forward from
  pass 1's met. HOLDS: "an item is a base if and only if it declares a slot:" — isBase in
  src/content/item.ts:56 is the one answer, basePlane (src/runtime/clusterPlane.ts:159) is the one
  plane constructor, and growItem (src/runtime/itemInstance.ts:118) refuses before any stack is
  counted. Mutating basePlane to return originPlane(item.originCluster ?? null) unconditionally is
  KILLED by src/runtime/itemInstance.test.ts > "an item with no slot has no plane > refuses every
  growth verb, leaving the stack and what it would have consumed whole" and > "is refused before the
  stack is counted". Mutating originPlane(item.originCluster ?? null) to originPlane(null) is KILLED
  across four files; mutating BASE_CLUSTER's openConnections ['e'] to ['ne'] is KILLED by "is a point
  with one open east connection when the base declares none of its own". FAILS: "its root node ... is
  under no obligation to sit on the west edge, because the west-edge convention exists only to give
  slotting a defined rotation". Reproduced with npm run probe over a base declaring
  origin-cluster: heart where heart is shape: spindle with open-connections: w, e — refused at load
  with "cluster-jewel heart: open-connections: names the west edge, which the root occupies".
  rootPosition is unconditionally getShape(jewel.shape).edges.w, so the origin's free root is
  obliged onto the west edge and the origin hex can grow in five directions, not six — which also
  contradicts the Deliverable's "Each of that hexagon's six edges can carry a jewel slot at its
  midpoint". This is the branch's own unreviewed pass-1 finding
  items-mods-and-crafting-pass1-the-origin-hex-can-never-carry, and it is not re-filed here. What pass
  2 adds is the grade: the amendment in 05ffe0f rewrote c9 and left this sentence standing in it, so
  the clause still promises something the tree refuses, and recording met a second time would let a
  known-false sentence stand as proved. The finding's own deliverable names both repairs — narrow c6's
  refusal to a jewel that will be slotted, or withdraw the sentence and narrow the Deliverable to five
  edges.
- proof 10: met — Graded against the amended text (05ffe0f), not pass 1's. originCluster is a separate
  id field on itemSchema resolved through referenceSites.ts:325, and itemRoleProblem
  (src/content/item.ts:62-70) is the exclusion. Re-run: npx vitest run src/content/item.test.ts — 13
  cases green, including "refuses an item declaring both, because one item cannot be a jewel and have
  a plane", "refuses a jewel that is also wearable", "refuses an origin-cluster: on an item nothing can
  wear", "rejects an origin-cluster: naming an unknown declaration". Enforced where the value is
  assembled, not where it is written: itemRoleProblem is called from applySection over the merged
  section, and npm run probe over a two-module universe where module A declares an item blade with
  slot: mainhand and module B adds cluster-jewel: to audit2-base.blade is refused with
  "# item audit2-base.blade: cluster-jewel: makes audit2-base.blade a jewel, which is exclusive
  with the slot: that makes it a base". Mutation-tested: neutering the itemRoleProblem throw in
  registry.ts is KILLED by three item.test.ts cases; deleting the originCluster reference site is
  KILLED by "rejects an origin-cluster: naming an unknown declaration". Drops, stacking and inventory
  are untouched — nothing in the diff reaches dropTable.ts or the inventory record.
- proof 11: met — Re-run at this head: npx vitest run src/runtime/itemInstance.test.ts — the six "an item
  is a stack until something is recorded about one of them" cases green. growItem is still the one
  door, and mints through createInstance only after growing.change succeeds. The no-second-table
  half re-checked against the whole branch diff rather than trusted: git diff 7d58a64..3c788d4 over
  src/runtime/save.ts changes nothing but the equipped-slot prune loop, SAVE_FIELDS is untouched,
  GameState gains no table, and instances.ts's only change swaps an inline regex for the shared
  mayBeInstanceId.
- proof 12: met — grep -rn "experience" over src/ and scripts/ excluding tests and the itemExperience
  field name returns ten lines, and exactly one of them assigns:
  payload.experience += experience in feedItem (src/runtime/itemInstance.ts:146). Re-run:
  npx vitest run src/runtime/itemInstance.test.ts — the four "an item experience" cases green,
  including "stops at the base max-level, refusing the feed with the item intact" and "runs past ten on
  a base that declares no maximum, because the default is 99". itemLevel still imports skillLevel
  from ./skills rather than reimplementing a curve.
- proof 13: met — Re-run at this head: npx vitest run src/runtime/clusterPlane.test.ts — the six
  allocation cases green, including "refuses a node nothing allocated touches, and the refusal costs
  nothing" and "refuses when no point remains, and the refusal costs nothing". Read the refusal order
  again at this head: allocateNode returns a string before touching the plane in every arm, and
  growItem returns before take(state, consumes), so no arm of a refusal spends an item or a point.
- proof 14: met — Re-run at this head: npx vitest run src/runtime/clusterPlane.test.ts — "refuses a
  second jewel in a slot that already holds one", "refuses a node twice, the pre-allocated root
  included" — and npx vitest run src/runtime/itemInstance.test.ts -t "refuses a second jewel into a
  filled slot". The Directive union in src/content/test.ts gains four growth verbs and a refuse:
  wrapper and no un-allocate or un-slot; drop in clusterPlane.ts is still reachable only from
  repairPlane. Caveat carried into the finding below rather than into this grade: the shipped
  regression's own permanence refusal is not pinned to its cause — see proof 22.
- proof 15: met — This is the clause pass 1 recorded unmet, and the failing half is now fixed. Pass 1's
  exact reproduction re-run at this head through npm run inspect over a module with
  an item node-jewel naming cluster-jewel: node and an item orb naming cluster-effect: +25% max-health:
  applyClusterEffect(state, registry, 'node-jewel', 'orb', ORIGIN) now returns
  { ok: false, refused: 'node-jewel is not a base: only an item you can wear has a plane to grow' },
  inventory stays { node-jewel: 3, orb: 1, whetstone: 2 } and state.instances.byId stays empty. The
  same probe shows feed, slot and allocate refusing the jewel identically and apply refusing the orb
  itself. Re-run: npx vitest run src/runtime/clusterEffect.test.ts — nine "applying a cluster effect"
  cases green, including the new "refuses a jewel in inventory as its target, leaving both items
  stacked and uninstanced". Mutation-tested three ways, all KILLED: replacing growItem's
  not-a-base refusal with a success; deleting the mod-slots capacity guard in
  recordEffect; deleting consumes: effectItem from applyClusterEffect. Jewels stay stackable — the
  probe above and "leaves the orb a stack and mints no second instance for it".
- proof 16: met — Re-run at this head: npx vitest run src/runtime/clusterEffect.test.ts — "scales a flat
  payload in the added channel", "scales a percent payload in the increased channel, where it
  multiplies the base", "leaves an identical passive in another cluster at its declared value",
  "scales only the payloads naming the effect's stat", all green. clusterScale
  (src/runtime/clusterEffect.ts:23-30) still sums percent / 100 into one pooled over
  cluster.effects alone and returns 1 + pooled; scaledAmount in stats.ts multiplies within the
  channel the BonusAmount already declares.
- proof 17: met — Re-run at this head: npx vitest run src/runtime/clusterEffect.test.ts -t "the worked
  case the reader will check" — three cases green asserting 44, 47.8125 and 51.75 with
  toBeCloseTo(..., 10), the third also asserting not.toBeCloseTo(52.75, 2). The fixture is real
  rather than derived: max-health has base 30, the origin jewel's free west root is hale = +10
  max-health and position 2 is vigorous = +10% max-health bought with a point, so the arithmetic is
  not computed by the test.
- proof 18: met — Read against the whole branch diff to statRange rather than the fix diff: StatFold is
  unchanged, foldBonus now routes through scaledAmount and is arithmetically identical at
  times === 1, and a cluster effect arrives as the same times argument a skill level already
  arrives as. Re-run: npx vitest run src/runtime/clusterEffect.test.ts -t "an effect stops at its
  cluster" — three cases green, including "lets a payload percent multiply the equipped item's own
  flat bonus, which the effect never touches".
- proof 19: met — scaledAmount (src/runtime/stats.ts:29-31) is the one multiplication of a BonusAmount
  and rounds nothing; PlaneReport's effective calls the same function, so the surface and the fold
  read one number. Re-run: npx vitest run src/runtime/clusterEffect.test.ts — "rounds no payload, so
  four scaled +10s are worth 50 and never 48", "hands the fold the declared bonus and the factor,
  leaving one place that multiplies one" — and npx vitest run scripts/planeView.test.ts (19 cases
  green, including "states the effective payload first and the factor that made it after").
- proof 20: met — instancePayloads(registry, instance) is one pure function of the instance, and
  foldPlanePayloads feeds it to the same foldBonus an equipped +2 attack takes, inside the
  existing equipped loop in statRange. Re-run:
  npx vitest run src/runtime/clusterEffect.test.ts -t "a plane's contribution reaches combat" — both
  cases green — plus "leaves an identical passive in another cluster at its declared value" for the
  third half of the clause's fixture.
- proof 21: met — Re-run at this head: npx vitest run src/runtime/itemInstance.test.ts -t "an instance
  across a reload" — five cases green — plus the seven under
  npx vitest run src/runtime/clusterPlane.test.ts -t "a plane whose content moved underneath it"
  (including the fixpoint case) and npx vitest run src/runtime/equipment.test.ts (10 cases green,
  including "is still worn, and still worth the same, after a reload" and "is unequipped when the item
  it grew from leaves the content"). repairPlane still runs from the instance kind's repair hook
  rather than from a second prune.
- proof 22: met — The regression exists, uses only the four growth verbs and refuse:, and replays green
  over the shipped content: the generated case in src/runtime/integration.test.ts is green under
  npm test inside npm run tasks -- merge-ready at 3c788d4, and it closes on a full save comparison
  covering both instances, every allocation and every recorded effect. Refusals it records: c8
  blocking, c12 max-level and no-experience, c13 adjacency and no-point, c14 filled-slot and
  already-allocated, c15 duplicate-effect and capacity. Two things this pass measured that the grade
  should not hide. First, the clause's list names c17, which states no refusal at all — the refusals
  actually carried are c15's, as pass 1 also noted; the spec was amended twice since and the list was
  not corrected. Second, and filed as a finding below: refuse: records that a growth was refused, not
  why, so a refusal can drift onto a different cause and stay green. Measured — mutating
  "refuse: slot 1 at 0,0 e with causeway-jewel" (the c14 permanence proof) to
  "refuse: slot 1 at 9,9 e with causeway-jewel", where no cluster stands at all, SURVIVED the whole
  2702-test suite. The control mutation in the same run was killed, so the directive is a real check;
  it is just not a check of the cause the line is written for.
- proof 23: met — npm run tasks -- merge-ready re-run at 3c788d4: tsc ok, npm test ok (2702 tests),
  layer-check ok, audit-status ok, doctor ok (20 warnings, which do not fail the leg), bytes ok — the
  six legs this clause names, green in one invocation, plus tree ok and base ok. Re-run the same
  command. The invocation as a whole exits non-zero on two spec-standing legs only:
  spec items-mods-and-crafting (2 open members — cluster-merge-ready and the clause-15 undelivered
  record, which this pass's met on c15 retires — plus 2 unreviewed findings) and
  clauses items-mods-and-crafting (c15 outstanding from pass 1, likewise answered here). Pass 1's
  third failing leg, spec crafting-modal, no longer appears.
