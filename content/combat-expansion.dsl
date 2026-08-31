// Combat Expansion — three archetypes, authored as cluster jewels.
//
// Berserker, juggernaut and assassin are tags on passives and nothing else.
// Nothing below is a class: an archetype is not a thing a player picks, it has
// no runtime concept, and every effect in it reaches the player exactly one
// way — a passive allocated on a plane, paid for with a point that could have
// gone somewhere else.
//
// The four mechanical effects are four different shapes of the same primitives,
// which is what makes authoring them the test that the engine generalized:
//
//   rage               a resource with a ceiling and a rate, granted on a
//                      landed swing and read back as a counter
//   accelerated vigor  a stacking buff behind a chance gate, with a second
//                      passive reading how many are held
//   thorns             a persistent effect on being struck that reaches the
//                      striker
//   poison             a timed debuff on the struck party, which is the buff
//                      mechanism with a minus in front of it
//
// A passive and a cluster jewel may share an id — `retribution` and
// `wracking-blades` do — because ids are per kind and the jewel is named after
// the passive that is the point of it.
//
// It is a list and stands nowhere: no location, no entity, no place a player
// walks to. The region that wants these puts a crate of them somewhere and owns
// the routes that prove them, which is why nothing here names a town.

# info combat-expansion
version: 1.0.0
pack: skills
dependencies: core

// --- rage ---
//
// The ceiling and the rate are what make this a resource rather than a stack
// count, and they are held apart on purpose. The rate is the pool's own and is
// declared here, so a second copy of the passive that grants rage does not bleed
// it twice as fast; the ceiling arrives with the passive, because a stat left
// global is read as a full pool by every actor a fight snapshots and that is the
// inverse of what a resource granted on a landed swing is for. Nobody without
// the passive has a pool at all, so the rate below reaches nothing until one is
// allocated.

// Both are `other` on the character sheet rather than combat, which is the whole
// of what that tab is for: a player who never allocates the passive has no rage
// pool at all, and a stat they will never own should not take a line on a tab
// they read every fight.
# stat max-rage
group: core.other

# stat rage-drain
base: -30
group: core.other

# resource rage
rate: rage-drain
max: max-rage
start: 0
display: minimal

// --- payloads a swing can hand out ---
//
// A declaration carrying a payload and a duration, granted by `inflict:` and
// never given, dropped or carried. `stacks` on the first is what makes a
// second application a second instance instead of a refreshed one, which is
// the whole difference between the two counter sources below.

# item accelerated-vigor
title: Accelerated Vigor
examine: The swing after the last one, and faster than it.
stacks, +2 attack-rate, 60s

# item venom
title: Venom
examine: It works while you are busy with something else.
poison, -30 regeneration, 20s

// --- berserker passives ---

# passive goring-edge
berserker, physical, +3 attack

# passive bloodlust
berserker, speed, +3 attack-rate

# passive reckless
berserker, physical, +10% attack, -2 defense

// Rage: gained on a landed swing, bled back at the rate the pool itself
// declares, and read as a counter by the same clause an item's own tag uses.
// The ceiling rides here, so nobody without this has a pool at all; the rate
// does not, so a second copy of this does not bleed one twice as fast.
# passive rising-fury
title: Rising Fury
berserker, physical, +20 max-rage, +2% attack per rage

on hit: restore: 3 rage

// The chance gate is a wrapper the drop tables already had; what is behind it
// is one instance of a payload that stacks.
# passive spurred
berserker, speed

on hit:
  1 in 4: inflict: accelerated-vigor on me

// The second half of the pair, and separable from it: this reads how many are
// held without granting any, so stacking is worth more with it than without.
# passive quickening
berserker, speed, +3% attack-rate per stack of accelerated-vigor

// --- juggernaut passives ---

# passive iron-carapace
juggernaut, armour, +4 defense

# passive immovable
juggernaut, life, +25 max-health

# passive slow-and-certain
juggernaut, armour, +3 defense, -2 attack-rate

// Thorns: read off whoever was struck, and its result names the other party in
// that moment. Nothing here is declared on an action, which is what lets a
// thing that never swings carry it.
# passive retribution
juggernaut, thorns

when hit: drain: 5 health from them

// --- assassin passives ---

# passive wracking-blades
assassin, precision, +6 accuracy, +2 attack-rate

# passive silent-step
assassin, evasion, +12 evasion

# passive exposed-throat
assassin, precision, +10 accuracy, -1 attack

// Poison: the same two-party requirement as thorns and in the opposite
// direction. The payload's own duration is how long it runs; nothing here says
// so a second time.
# passive envenom
assassin, poison

on hit: inflict: venom on them

// --- cluster jewels ---
//
// Six, in three pairs, and each pair is one flat jewel and one mostly-percent
// jewel. statRange folds a stat as (base + added) x (1 + increased), so the
// percent half is worth almost nothing until the flat half has been stacked:
// the pairing is what puts the build order on the plane where a player can see
// it rather than in a sentence somebody has to read.

// ADDED. Dense and flat, two ways onward. The inner ring is left empty: it
// costs four points to cross and pays on two, where the short way round the
// outer ring is three and pays on all of them.
# cluster-jewel blood-frenzy
title: Blood Frenzy
examine: It does not get tired. That is the problem with it.
shape: double-ring
open-connections: ne, e
passives:
  1 goring-edge
  2 bloodlust
  3 goring-edge
  4 core.flurry
  5 bloodlust
  6 core.swift-hands
  7 goring-edge
  10 core.flurry

// INCREASED. The hub is two points from any edge and holds the signature
// passive, so the jewel is a decision about how deep to go rather than a row
// of numbers. Nothing flat sits on the ring: what the rage passive carries to
// give the pool its ceiling and its rate is the only added payload here, and it
// is bookkeeping rather than power.
# cluster-jewel wrath
title: Wrath
examine: Every blow lands harder than the one before it.
shape: wheel
open-connections: e
passives: 1 reckless, 2 quickening, 3 core.frenzied, 4 reckless, 5 spurred, 6 core.brutal, 7 rising-fury

// ADDED. Twelve positions of flat mass and two exits, with the curated
// downside authored as a real passive that costs something real.
# cluster-jewel iron-bulwark
title: Iron Bulwark
examine: Banding over banding, until the shape stops mattering.
shape: double-ring
open-connections: e, sw
passives:
  1 core.warded
  2 iron-carapace
  3 immovable
  4 core.plated
  5 immovable
  6 iron-carapace
  7 slow-and-certain
  10 core.constitution

// INCREASED. A ring, so the thorns passive sits opposite the entry and costs
// three points either way round.
# cluster-jewel retribution
title: Retribution
examine: Striking it is its own punishment.
shape: ring
open-connections: ne, se
passives: 1 core.warded, 2 core.hardened, 3 core.tempered-frame, 4 retribution, 5 core.hardened, 6 core.tempered-frame

// ADDED. Flat precision and evasion, two exits.
# cluster-jewel wracking-blades
title: Wracking Blades
examine: Fast, accurate, and not interested in a long fight.
shape: ring
open-connections: e, ne
passives: 1 core.keen-eye, 2 wracking-blades, 3 silent-step, 4 core.marksman, 5 exposed-throat, 6 core.quickstep

// INCREASED. One exit, deep: the hub is the whole point of the jewel and costs
// two points to reach from the only edge that opens.
# cluster-jewel creeping-rot
title: Creeping Rot
examine: The cut is the smallest part of it.
shape: wheel
open-connections: se
passives: 1 core.keen-eye, 3 core.deadly-precision, 5 core.evasive, 7 envenom

// --- the items that carry them ---

# item blood-frenzy-jewel
examine: A dark red disc, and it is warm.
cluster-jewel: blood-frenzy

# item wrath-jewel
cluster-jewel: wrath

# item iron-bulwark-jewel
cluster-jewel: iron-bulwark

# item retribution-jewel
cluster-jewel: retribution

# item wracking-blades-jewel
cluster-jewel: wracking-blades

# item creeping-rot-jewel
cluster-jewel: creeping-rot

// --- the blade they are grown on, and the crate they arrive in ---
//
// Where the crate stands is the region's business and not this module's, which
// is why nothing below is a place or a thing standing in one.

# item proving-blade
title: Proving Blade
examine: Unlovely, well balanced, and it has never been anywhere.
slot: mainhand
value: 20
weapon, +2 attack
item-level: 6-10

# droptable archetype-cache
give: 1 proving-blade
give: 1 blood-frenzy-jewel
give: 1 wrath-jewel
give: 1 iron-bulwark-jewel
give: 1 retribution-jewel
give: 1 wracking-blades-jewel
give: 1 creeping-rot-jewel

// What a route counting stacks counts with. One evasion a stack, on a stat no
// such route moves otherwise, so the number a claim rests on is one this file
// writes rather than the balance of the payload being counted:
// `accelerated-vigor` may be worth anything at all and six held is still six
// read.
# item vigor-tally
DEBUG
slot: offhand
+1 evasion per stack of accelerated-vigor

