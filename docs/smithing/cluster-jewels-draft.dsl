// DRAFT — this file does not load. `# passive` and `# cluster-jewel` are not
// section kinds yet. It is an authoring trial for items-mods-and-crafting: the
// point is to find out which parts fall out of the existing grammar and which
// need new machinery, before any of it is built.
//
// Three syntax facts checked against the real grammar rather than assumed:
//
//   * A block key must match /[a-z][a-z0-9 -]*:/ (src/grammar/section.ts), so
//     `1: hale` does NOT parse. Positions are authored the way `# entity` already
//     authors stats — `stats: attack 8, defense 0` is a list of `<key> <value>`
//     pairs hydrated into a map (src/content/entity.ts:41). `passives:` is that
//     same MappedField shape, and because `list` has `parseBlock` it may be
//     written inline or as one pair per line.
//   * Every id in this language is `[a-z][a-z0-9-]*`, so directions are `ne`,
//     not `NE`.
//   * `tagClause` produces a Range for every `+N stat`, so `+5-8 accuracy` parses
//     happily. A passive REFUSES it: a passive is always on and has no moment at
//     which to roll. Every payload below is a fixed number, which is what keeps an
//     instance's saved state to nothing but which positions are allocated.
//
// The stats used are the ones that exist today: attack (base 10), defense (5),
// accuracy (100), evasion (0), attack-rate (25), regeneration (0), max-health (30),
// luck (60).


// --- the shape catalogue ------------------------------------------------------
//
// Shapes are hard-coded in src/content/shapes.ts and named from the DSL. They are
// a closed set: an unknown `shape:` fails at load naming the shapes that exist,
// the same way skill-levels-xp-events closes its event list. Because the set is
// closed, connectivity is proved ONCE by a test over the catalogue instead of per
// jewel, and there is no grammar for authoring topology at all.
//
// A shape declares three things: its numbered positions, the adjacency between
// them, and which position each of the six hex edges touches. Every shape is
// authored in the one orientation the spec fixes — root on the west edge — and is
// rotated on slotting. Rotation remaps the six edge labels and NEVER renumbers
// positions: position 3 is position 3 in the save file forever.
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
// point       1 position, every edge touches it. Two jobs: an item base's default
//             origin, and the pure junction — one node, up to five ways out.
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
// wheel       ring plus a hub adjacent to all six. 7 positions. The hub is the
//             cheap crossing — two points from any edge to any other.
//
//                  2 ────── 3
//                 ╱ ╲  │  ╱ ╲
//                1 ── 7 ──── 4
//                 ╲ ╱  │  ╲ ╱
//                  6 ────── 5
//
// double-ring 12: an outer ring on the edges, an inner ring, and six spokes.
//             Twelve positions plus up to five slots is seventeen nodes — one full
//             double-ring is very close to what item level 17 affords, which is a
//             useful anchor for what a point is worth.
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
// Position 1 is therefore the root in all three, and the hub and inner ring are
// reachable only by spending points to walk inward.


// --- passives -----------------------------------------------------------------
//
// A passive is its own section, in the global id space, so one declaration is
// referenced by every jewel that wants it. That is what makes the sequel's
// "+10% increased effect of poison passives" mean something across jewels rather
// than inside one.
//
// The body is the tag-clause list `# item` already uses: bare words are tags,
// `+N stat` and `+N% stat` are payloads, and both live in the same comma list.
// Nothing new is needed for the untyped tier — statRange already folds these as
// (base + added) x (1 + increased).
//
// A note the fold makes unavoidable: a percent passive is worth almost nothing
// early. `+10% defense` on base 5 is half a point. Percent passives are therefore
// late-tree by nature and should sit deep in a cluster or behind flat ones, which
// is a placement fact rather than a balance number.

// untyped: life
# passive hale
title: Hale
life, +15 max-health

# passive constitution
title: Constitution
life, +20 max-health

# passive tempered-frame
title: Tempered Frame
examine: Not more armour. Better armour.
life, +12% max-health

# passive mending
title: Mending
examine: The wound closes while you are still deciding whether it hurt.
life, recovery, +2 regeneration

// untyped: armour
# passive warded
title: Warded
armour, +2 defense

# passive plated
title: Plated
armour, +3 defense

// untyped: offence
# passive whetted
title: Whetted
physical, +2 attack

# passive honed
title: Honed
physical, +3 attack

# passive brutal
title: Brutal
physical, +8% attack

# passive swift-hands
title: Swift Hands
speed, +2 attack-rate

# passive flurry
title: Flurry
speed, +3 attack-rate

# passive keen-eye
title: Keen Eye
precision, +6 accuracy

# passive marksman
title: Marksman
precision, +8 accuracy

# passive quickstep
title: Quickstep
evasion, +8 evasion

# passive shadowstep
title: Shadowstep
evasion, +10 evasion

// untyped: utility
# passive fortune
title: Fortune
utility, +5 luck

# passive windfall
title: Windfall
utility, +8 luck

// --- archetype passives -------------------------------------------------------
//
// The three archetypes are the ones the store already names: berserker, thorns
// (the juggernaut) and assassin. Each has a stat half that authors cleanly today
// and a mechanic half that does not, and the split is clean enough that each
// archetype gets one jewel that loads on this branch and one that waits.
//
// Nothing below changes the cluster machinery. A passive body is a tag-clause
// list either way; what the archetype tier adds is clauses inside it.

// berserker — pressure and speed. Ships today.
# passive goring-edge
title: Goring Edge
berserker, physical, +3 attack

# passive bloodlust
title: Bloodlust
berserker, speed, +3 attack-rate

# passive reckless
title: Reckless
examine: Guard is a thing other people keep.
berserker, physical, +10% attack, -2 defense

// berserker — GAP. Needs combat-events for the hook and a resource to hold rage,
// then `+N stat per <counter>` to read it. Both are specced, neither has landed.
//
// # passive rising-fury
// title: Rising Fury
// berserker, rage
// on hit self: gain: 1 rage
// +2% attack per rage

// thorns / juggernaut — mass. Ships today.
# passive iron-carapace
title: Iron Carapace
juggernaut, armour, +4 defense

# passive immovable
title: Immovable
juggernaut, life, +25 max-health

# passive slow-and-certain
title: Slow and Certain
examine: It does not hurry. It does not need to.
juggernaut, armour, +3 defense, -2 attack-rate

// thorns — GAP. An actor-carried persistent effect on the event `damage-taken`,
// not a hook: a hook is declared on an action and a passive enemy has none.
//
// # passive retribution
// title: Retribution
// juggernaut, thorns
// on damage-taken: damage: 5 attacker

// assassin — precision and evasion. Ships today.
# passive wracking-blades
title: Wracking Blades
assassin, precision, +6 accuracy, +2 attack-rate

# passive silent-step
title: Silent Step
assassin, evasion, +12 evasion

# passive exposed-throat
title: Exposed Throat
examine: There is a right place, and there is everywhere else.
assassin, precision, +10 accuracy, -1 attack

// assassin — GAP. Damage over time owned by the target, which needs both the
// on-hit event and buffs-generalized ending the actorId === PLAYER gate.
//
// # passive envenom
// title: Envenom
// assassin, poison
// on hit: 1 in 4: poison: 3, 8s


// --- untyped clusters ---------------------------------------------------------
//
// Three, one per general axis. These are what a player finds first and what an
// item is built on before it commits to an archetype.

// Offence, dense, one way onward. The shape of a jewel you slot when you want
// power and are willing to commit to a direction.
# cluster-jewel keen-edge
title: Keen Edge
examine: Six facets, each one sharpened against the last.
shape: ring
open-connections: e
passives: 1 whetted, 2 keen-eye, 3 honed, 4 brutal, 5 swift-hands, 6 whetted

// Life, two ways onward, one position left empty so the ring is not free to cross.
# cluster-jewel stout-heart
title: Stout Heart
examine: A knot of iron that will not be moved.
shape: ring
open-connections: ne, se
passives: 1 warded, 2 hale, 3 constitution, 5 hale, 6 mending

// Utility, on a wheel so the hub is the cheap crossing. Sparse on purpose: this is
// the jewel you slot for luck and for reach, not for power.
# cluster-jewel wayfarers-charm
title: Wayfarer's Charm
examine: It has been lucky for several people, none of them for long.
shape: wheel
open-connections: e, se
passives: 1 fortune, 4 windfall, 7 quickstep

// --- berserker clusters -------------------------------------------------------

// Ships today. Dense, aggressive, and the inner ring carries the percent passives
// so they sit behind the flat ones that make them worth having.
# cluster-jewel blood-frenzy
title: Blood Frenzy
examine: It does not get tired. That is the problem with it.
shape: double-ring
open-connections: ne, e
passives:
  1 goring-edge
  2 bloodlust
  3 goring-edge
  4 flurry
  5 bloodlust
  6 swift-hands
  7 reckless
  10 brutal
  // 8, 9, 11 and 12 empty: the inner ring costs four points to cross and pays on
  // two of them. Reaching `brutal` the short way round the outer ring is three
  // points; the inner route is cheaper in payload and buys nothing. That is a
  // decision, and it is authored rather than simulated.

// WAITS on combat-events. Slot layout and passives are settled; only `rising-fury`
// is blocked, and the jewel loads today with position 7 empty.
# cluster-jewel rising-fury
title: Rising Fury
examine: Every blow lands harder than the one before it.
shape: wheel
open-connections: e
passives: 1 goring-edge, 2 reckless, 4 bloodlust, 6 goring-edge
// once combat-events lands:  7 rising-fury

// --- juggernaut clusters ------------------------------------------------------

// Ships today. Twelve positions of mass, two exits, and `slow-and-certain` is the
// curated downside in its authored form: a real passive with a real cost, which is
// the same shape the sequel's rolled modifiers will take on the jewel itself.
# cluster-jewel iron-bulwark
title: Iron Bulwark
examine: Banding over banding, until the shape stops mattering.
shape: double-ring
open-connections: e, sw
passives:
  1 warded
  2 iron-carapace
  3 immovable
  4 plated
  5 immovable
  6 iron-carapace
  7 slow-and-certain
  10 tempered-frame

// WAITS on combat-events. A ring so that the thorns passive, when it lands, sits
// opposite the entry and costs three points either way round.
# cluster-jewel retribution
title: Retribution
examine: Striking it is its own punishment.
shape: ring
open-connections: ne, se
passives: 1 warded, 2 iron-carapace, 3 plated, 5 immovable, 6 warded
// once combat-events lands:  4 retribution

// --- assassin clusters --------------------------------------------------------

// Ships today. Precision and evasion, two exits.
# cluster-jewel wracking-blades
title: Wracking Blades
examine: Fast, accurate, and not interested in a long fight.
shape: ring
open-connections: e, ne
passives: 1 keen-eye, 2 wracking-blades, 3 silent-step, 4 marksman, 5 exposed-throat, 6 quickstep

// WAITS on combat-events and buffs-generalized. One exit, deep: the poison hub is
// the whole point of the jewel and costs two points to reach from any edge.
# cluster-jewel creeping-rot
title: Creeping Rot
examine: The cut is the smallest part of it.
shape: wheel
open-connections: se
passives: 1 wracking-blades, 3 exposed-throat, 5 silent-step
// once the archetype tier lands:  7 envenom

// --- travel clusters ----------------------------------------------------------
//
// These carry almost nothing and exist to move the frontier. They are why the plane
// is a plan: a corridor buys distance cheaply in one direction, a junction buys
// directions expensively and no power at all.

// The corridor. Three points from entry to exit, one of them worth something.
# cluster-jewel causeway
title: Causeway
examine: A road, and nothing on either side of it.
shape: spindle
open-connections: e
passives: 2 hale

// The junction: one node, five ways out, zero payload. Six points — one for the
// node, one for each slot — and the item is no stronger for any of them. What it
// buys is five live directions from a single hex, which nothing else in the
// catalogue can do.
# cluster-jewel crossroads
title: Crossroads
examine: A junction stone. It offers roads, not shelter.
shape: point
open-connections: ne, e, se, sw, nw


// --- the items that carry them ------------------------------------------------
//
// A jewel reaches the player as an ordinary item naming its declaration, so drops,
// stacking and inventory are the machinery that already exists. Eleven jewels, no
// second inventory, no second drop path.

# item keen-edge-jewel
title: Keen Edge Jewel
examine: A closed ring of iron, warm to the touch.
cluster-jewel: keen-edge

# item stout-heart-jewel
title: Stout Heart Jewel
cluster-jewel: stout-heart

# item wayfarers-charm-jewel
title: Wayfarer's Charm Jewel
cluster-jewel: wayfarers-charm

# item blood-frenzy-jewel
title: Blood Frenzy Jewel
cluster-jewel: blood-frenzy

# item rising-fury-jewel
title: Rising Fury Jewel
cluster-jewel: rising-fury

# item iron-bulwark-jewel
title: Iron Bulwark Jewel
cluster-jewel: iron-bulwark

# item retribution-jewel
title: Retribution Jewel
cluster-jewel: retribution

# item wracking-blades-jewel
title: Wracking Blades Jewel
cluster-jewel: wracking-blades

# item creeping-rot-jewel
title: Creeping Rot Jewel
cluster-jewel: creeping-rot

# item causeway-jewel
title: Causeway Jewel
cluster-jewel: causeway

# item crossroads-jewel
title: Crossroads Jewel
cluster-jewel: crossroads

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
1 in 150: give: 1 causeway-jewel
1 in 400: give: 1 crossroads-jewel


// --- item bases ---------------------------------------------------------------

// The ordinary case. No `cluster-jewel:`, so hex (0,0) falls back to `point` with a
// single open east connection: one jewel slot, allocated from the start, free.
// `max-level:` is where a base is tiered — this sword is a starter forever.
# item iron-sword
examine: A well-balanced blade, standard adventurer's kit.
slot: mainhand
weapon, +2 attack
max-level: 10

// A base that declares its own origin cluster, which is the general rule the
// default above is the degenerate case of. Hex (0,0) is never slotted and so never
// rotated: its root is pre-allocated and is under no obligation to sit on the west
// edge, because the west-edge convention exists only to give SLOTTING a defined
// rotation.
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
// (mending) is pre-allocated and free, positions 2 and 3 cost a point each, and the
// e and ne edges of hex (0,0) carry jewel slots that also cost a point each.
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
// through an east-facing slot and its root is authored on the west edge. Its single
// position is now adjacent to the allocated slot, so it is the next legal
// allocation — but there are no points left, and it grants nothing when it comes.
// Feeding is the only way on.
//
// Had the player instead spent point 3 on the NE slot of the origin, Crossroads
// would have landed in hex (0,-1) rotated one sixth of a turn, and its se
// connection would then face hex (0,0) — occupied by the blade itself, and
// therefore BLOCKED forever: four ways out instead of five. That is the whole
// reason the plane exists. The same jewel is worth a different amount depending on
// where it went, and slotting is permanent.
//
// Twenty-six more whetstones takes the blade to level 17, and Iron Bulwark becomes
// affordable: twelve positions plus the two points to reach and open a slot for it.
// At max-level 40 the blade can eventually hold roughly two and a half double-rings
// — and level 40 costs 194 whetstones, which is what makes a Master's Whetstone
// worth ten of them.
