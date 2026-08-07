// DRAFT — this file does not load. `# passive` and `# cluster-jewel` are not
// section kinds yet. It is an authoring trial for items-mods-and-crafting: the
// point is to find out which parts fall out of the existing grammar and which
// need new machinery, before any of it is built.
//
// Two syntax facts checked against the real grammar rather than assumed:
//
//   * A block key must match /[a-z][a-z0-9 -]*:/ (src/grammar/section.ts), so
//     `1: hale` does NOT parse. Positions are authored the way `# entity` already
//     authors stats — `stats: attack 8, defense 0` is a list of `<key> <value>`
//     pairs hydrated into a map (src/content/entity.ts:41). `passives:` is that
//     same MappedField shape, and because `list` has `parseBlock` it may be
//     written inline or as one pair per line.
//   * Every id in this language is `[a-z][a-z0-9-]*`, so directions are `ne`,
//     not `NE`.


// --- the shape catalogue ------------------------------------------------------
//
// Shapes are hard-coded in src/content/shapes.ts and named from the DSL. They are
// a closed set: an unknown `shape:` fails at load naming the shapes that exist,
// the same way skill-levels-xp-events closes its event list. Because the set is
// closed, connectivity is proved ONCE by a test over the catalogue instead of per
// jewel — the per-jewel reachability check the earlier draft of the spec required
// disappears entirely.
//
// A shape declares three things: its numbered positions, the adjacency between
// them, and which position each of the six hex edges touches. Every shape is
// authored in the one orientation the spec fixes — root on the west edge —
// and is rotated on slotting. Rotation remaps the six edge labels and NEVER
// renumbers positions: position 3 is position 3 in the save file forever.
//
// A pointy-top hexagon has a due-west and a due-east edge, which is what lets the
// origin expand rightward:
//
//              /\
//          nw /  \ ne
//            /    \
//         w |      | e
//            \    /
//          sw \  / se
//               \/
//
// point       1 position, every edge touches it. The degenerate case, and what
//             an item base falls back to when it declares no cluster of its own.
//
// spindle     3 in a line. w/nw/sw touch 1, e/ne/se touch 3.
//
//                 1 ── 2 ── 3
//
// ring        6 in a cycle, one per edge. A cycle is a legitimate shape here:
//             edges are undirected adjacency and nothing travels along one.
//
//                  2 ────── 3
//                 ╱          ╲
//                1            4
//                 ╲          ╱
//                  6 ────── 5
//
// wheel       ring plus a hub adjacent to all six. 7 positions.
//
//                  2 ────── 3
//                 ╱ ╲  │  ╱ ╲
//                1 ── 7 ──── 4
//                 ╲ ╱  │  ╲ ╱
//                  6 ────── 5
//
// double-ring 12: an outer ring on the edges, an inner ring, and six spokes.
//             Twelve positions plus up to five slots is seventeen nodes — one
//             full double-ring is very close to what an item level 17 affords,
//             which is a useful anchor for what a point is worth.
//
//                    2 ────────── 3
//                   ╱ ╲          ╱ ╲
//                  ╱   8 ────── 9   ╲
//                 ╱    │          │   ╲
//                1     7          10    4
//                 ╲    │          │   ╱
//                  ╲   12 ───── 11   ╱
//                   ╲ ╱          ╲ ╱
//                    6 ────────── 5
//
// Edge map for ring, wheel and double-ring: w→1, nw→2, ne→3, e→4, se→5, sw→6.
// Position 1 is therefore the root in all three, and the hub (7) and inner ring
// of double-ring are reachable only by spending points to walk inward.


// --- passives -----------------------------------------------------------------
//
// A passive is its own section, in the global id space, so one declaration is
// referenced by every jewel that wants it. That is what makes the sequel's
// "+10% increased effect of poison passives" mean something across jewels rather
// than inside one.
//
// The body is the tag-clause list `# item` already uses: bare words are tags,
// `+N stat` and `+N% stat` are payloads, and both live in the same comma list.
// Nothing new is needed for the survivability tier — statRange already folds
// these as (base + added) x (1 + increased).

# passive hale
title: Hale
life, defensive, +18-24 max-health

# passive tempered-frame
title: Tempered Frame
examine: Not more armour. Better armour.
life, defensive, +12% max-health

# passive warded
title: Warded
armour, defensive, +2-3 defense

# passive mending
title: Mending
examine: The wound closes while you are still deciding whether it hurt.
life, recovery, +1-2 regeneration

# passive quickstep
title: Quickstep
evasion, defensive, +6-9 evasion

# passive whetted
title: Whetted
physical, offensive, +2-3 attack

# passive brutal
title: Brutal
physical, offensive, +8% attack

# passive keen-eye
title: Keen Eye
offensive, +5-8 accuracy

// GAP — the archetype tier. This one needs combat-events for the hook and
// buffs-generalized for a debuff that lives on the target, exactly as the spec's
// "Answered elsewhere" section says. Left here to show that a passive body is the
// only thing that changes when those land; the cluster machinery does not.
//
// # passive envenom
// title: Envenom
// poison, offensive
// on hit: 1 in 4: apply venom to target


// --- cluster jewels -----------------------------------------------------------
//
// `shape:` picks the topology, `open-connections:` says which of the five
// non-root edges carry a jewel slot, and `passives:` fills numbered positions.
//
// A position not named in `passives:` is EMPTY, and empty is a real node: it can
// be allocated, it costs a point, it conducts adjacency, and it grants nothing.
// That is what makes a sparse jewel a corridor you pay to cross rather than a
// jewel with missing parts.

// A dense defensive cluster with one way onward. Every position filled, one exit:
// this is the shape of a jewel you slot when you want power and are willing to
// commit to a direction.
# cluster-jewel bulwark
title: Bulwark
examine: Iron banding, laid in a closed circle.
shape: ring
open-connections: e
passives: 1 warded, 2 hale, 3 quickstep, 4 warded, 5 hale, 6 mending

// The same shape, half filled, three ways onward. Fewer points of payload for
// the same twelve positions, but it opens the plane in three directions. The
// trade the mechanic runs on, expressed entirely in content.
# cluster-jewel crossroads
title: Crossroads
examine: A junction stone. It offers roads, not shelter.
shape: wheel
open-connections: ne, e, se
passives: 1 keen-eye, 7 whetted

// A large cluster authored as a block rather than inline, because twelve pairs on
// one line is not readable. `list` supports both; this is the same field.
# cluster-jewel ironroot
title: Ironroot
examine: It has been growing in the ore for a long time.
shape: double-ring
open-connections: ne, se
passives:
  1 warded
  2 hale
  3 whetted
  4 brutal
  5 hale
  6 warded
  7 tempered-frame
  10 tempered-frame
  // 8, 9, 11 and 12 are deliberately empty: the inner ring costs four points to
  // cross and pays on two of them. Reaching `brutal` at position 4 the short way
  // round the outer ring is three points; the inner route is cheaper in payload
  // and buys nothing. That is a decision, and it is authored, not simulated.


// --- the items that carry them ------------------------------------------------
//
// A jewel reaches the player as an ordinary item naming its declaration, so drops,
// stacking and inventory are the machinery that already exists. No second
// inventory, no second drop path.

# item bulwark-jewel
title: Bulwark Jewel
examine: A closed ring of iron, warm to the touch.
cluster-jewel: bulwark

# item crossroads-jewel
title: Crossroads Jewel
cluster-jewel: crossroads

# item ironroot-jewel
title: Ironroot Jewel
cluster-jewel: ironroot

// Experience is fed, never earned. The grant is authored per item, so a greater
// whetstone is a second declaration and not a second mechanism.
# item whetstone
examine: A grey block, faintly oiled.
item-experience: 1000

# item masters-whetstone
title: Master's Whetstone
item-experience: 10000

# droptable rat-remains
give: 1-3 rat-bone
1 in 4: give: 1 rat-tail
1 in 40: give: 1 whetstone
1 in 200: give: 1 crossroads-jewel


// --- item bases ---------------------------------------------------------------

// The ordinary case. No `cluster-jewel:`, so hex (0,0) falls back to `point` with
// a single open east connection: one jewel slot, allocated from the start, free.
// `max-level:` is where a base is tiered — this sword is a starter forever.
# item iron-sword
examine: A well-balanced blade, standard adventurer's kit.
slot: mainhand
weapon, +2 attack
max-level: 10

// A base that declares its own origin cluster, which is the general rule the
// default above is the degenerate case of. Hex (0,0) is never slotted and so
// never rotated: its root is pre-allocated and is under no obligation to sit on
// the west edge, because the west-edge convention exists only to give SLOTTING a
// defined rotation.
# item heartwood-blade
title: Heartwood Blade
examine: The grain still moves, slowly, when you are not looking.
slot: mainhand
weapon, +4 attack
max-level: 40
cluster-jewel: heartwood-core

# cluster-jewel heartwood-core
title: Heartwood Core
shape: spindle
open-connections: e, ne
passives: 1 mending, 2 tempered-frame


// --- a worked sequence --------------------------------------------------------
//
// The player finds a Heartwood Blade. Its origin cluster is a spindle: position 1
// (mending) is pre-allocated and free, positions 2 and 3 cost a point each, and
// the e and ne edges of hex (0,0) carry jewel slots that also cost a point each.
//
// They feed it four whetstones. 4000 xp is level 4 on the shared curve, so four
// points.
//
//   point 1  allocate position 2 (tempered-frame)   — +12% max-health
//   point 2  allocate position 3                    — empty, but it is what the
//                                                     e slot hangs off
//   point 3  allocate the e jewel slot
//   point 4  slot Crossroads into it
//
// Crossroads lands in hex (1,0), rotated by nothing at all, because it entered
// through an east-facing slot and its root is authored on the west edge. Its
// position 1 (keen-eye) is now adjacent to the allocated slot, so it is the next
// legal allocation — but there are no points left. Feeding is the only way on.
//
// Crossroads' own ne, e and se connections face hexes (1,-1), (2,0) and (1,1),
// all empty, so all three are live. Had the player instead spent point 3 on the
// NE slot of the origin, Crossroads would have landed in hex (0,-1) rotated one
// sixth of a turn, and its se connection would then face hex (0,0) — occupied by
// the blade itself, and therefore BLOCKED forever. That is the whole reason the
// plane exists: the same jewel is worth three directions or two depending on
// where it went, and slotting is permanent.
//
// Twenty-six more whetstones takes the blade to level 17 and Ironroot becomes
// affordable: twelve positions plus the two points to reach and open a slot for
// it. At max-level 40 the blade can eventually hold roughly two and a half
// double-rings — and 40 costs 194 whetstones, which is what makes a Master's
// Whetstone worth ten of them.
