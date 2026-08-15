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

# info combat-expansion
version: 1.0.0
dependencies: tutorial-island

// --- rage ---
//
// The ceiling and the rate are what make this a resource rather than a stack
// count. Both stats sit at nothing by default and the passive that grants rage
// is what supplies the drain, so a character who never took the passive has a
// pool that cannot move rather than one bleeding a number nobody can see.

# stat max-rage
base: 20

# stat rage-drain

# resource rage
rate: rage-drain
max: max-rage
start: 0
display: minimal

// --- payloads a swing can hand out ---
//
// A declaration carrying a payload and a duration, granted by `apply:` and
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
examine: Wide, and not interested in closing.
berserker, physical, +3 attack

# passive bloodlust
berserker, speed, +3 attack-rate

# passive reckless
examine: Guard is a thing other people keep.
berserker, physical, +10% attack, -2 defense

// Rage: gained on a landed swing, bled back at a constant rate, and read as a
// counter by the same clause an item's own tag uses. The drain rides here so
// that taking the passive is what starts the pool moving.
# passive rising-fury
title: Rising Fury
examine: Every blow lands harder than the one before it.
berserker, physical, -30 rage-drain, +2% attack per rage

on hit: restore: 3 rage

// The chance gate is a wrapper the drop tables already had; what is behind it
// is one instance of a payload that stacks.
# passive spurred
examine: Sometimes the second swing arrives before you decided on it.
berserker, speed

on hit:
  1 in 4: apply: accelerated-vigor to me

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
examine: It does not hurry. It does not need to.
juggernaut, armour, +3 defense, -2 attack-rate

// Thorns: read off whoever was struck, and its result names the other party in
// that moment. Nothing here is declared on an action, which is what lets a
// thing that never swings carry it.
# passive retribution
examine: Striking it is its own punishment.
juggernaut, thorns

when hit: drain: 5 health from them

// --- assassin passives ---

# passive wracking-blades
assassin, precision, +6 accuracy, +2 attack-rate

# passive silent-step
assassin, evasion, +12 evasion

# passive exposed-throat
examine: There is a right place, and there is everywhere else.
assassin, precision, +10 accuracy, -1 attack

// Poison: the same two-party requirement as thorns and in the opposite
// direction. The payload's own duration is how long it runs; nothing here says
// so a second time.
# passive envenom
examine: The cut is the smallest part of it.
assassin, poison

on hit: apply: venom to them

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
  4 tutorial-island.flurry
  5 bloodlust
  6 tutorial-island.swift-hands
  7 goring-edge
  10 tutorial-island.flurry

// INCREASED. The hub is two points from any edge and holds the signature
// passive, so the jewel is a decision about how deep to go rather than a row
// of numbers.
# cluster-jewel wrath
title: Wrath
examine: Every blow lands harder than the one before it.
shape: wheel
open-connections: e
passives: 1 goring-edge, 2 reckless, 3 quickening, 4 tutorial-island.frenzied, 5 spurred, 6 reckless, 7 rising-fury

// ADDED. Twelve positions of flat mass and two exits, with the curated
// downside authored as a real passive that costs something real.
# cluster-jewel iron-bulwark
title: Iron Bulwark
examine: Banding over banding, until the shape stops mattering.
shape: double-ring
open-connections: e, sw
passives:
  1 tutorial-island.warded
  2 iron-carapace
  3 immovable
  4 tutorial-island.plated
  5 immovable
  6 iron-carapace
  7 slow-and-certain
  10 tutorial-island.constitution

// INCREASED. A ring, so the thorns passive sits opposite the entry and costs
// three points either way round.
# cluster-jewel retribution
title: Retribution
examine: Striking it is its own punishment.
shape: ring
open-connections: ne, se
passives: 1 tutorial-island.warded, 2 tutorial-island.hardened, 3 tutorial-island.tempered-frame, 4 retribution, 5 tutorial-island.hardened, 6 tutorial-island.tempered-frame

// ADDED. Flat precision and evasion, two exits.
# cluster-jewel wracking-blades
title: Wracking Blades
examine: Fast, accurate, and not interested in a long fight.
shape: ring
open-connections: e, ne
passives: 1 tutorial-island.keen-eye, 2 wracking-blades, 3 silent-step, 4 tutorial-island.marksman, 5 exposed-throat, 6 tutorial-island.quickstep

// INCREASED. One exit, deep: the hub is the whole point of the jewel and costs
// two points to reach from the only edge that opens.
# cluster-jewel creeping-rot
title: Creeping Rot
examine: The cut is the smallest part of it.
shape: wheel
open-connections: se
passives: 1 tutorial-island.keen-eye, 3 tutorial-island.deadly-precision, 5 tutorial-island.evasive, 7 envenom

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

// --- the ground they are proved on ---
//
// One way out and no way in: where the archetype jewels sit in the world is
// not this module's question, and a room the player can leave is the smallest
// thing that does not strand anyone who is put in it.

# item proving-blade
title: Proving Blade
examine: Unlovely, well balanced, and it has never been anywhere.
slot: mainhand
weapon, +2 attack
max-level: 40

# droptable archetype-cache
give: 1 proving-blade
give: 6 tutorial-island.masters-whetstone
give: 1 blood-frenzy-jewel
give: 1 wrath-jewel
give: 1 iron-bulwark-jewel
give: 1 retribution-jewel
give: 1 wracking-blades-jewel
give: 1 creeping-rot-jewel

# entity armourers-chest
title: Armourer's Chest
examine: A long crate, stencilled, and nobody has come for it.
flags: emptied
open:
  instant
  hidden if: emptied
  roll: archetype-cache
  set: emptied
  say: Six jewels, a plain blade, and enough whetstone to make something of it.

// Deep enough to survive a fight long enough to watch a pool fill, and it
// swings nothing back, so what a test reads off the player came from what the
// player is carrying.
# entity proving-post
title: Proving Post
examine: A banded post, chest high, and it has taken worse than you.
stats: max-health 2000, defense 0, evasion 0, accuracy 0

// Carries a passive and declares no action at all. Whatever hits it is hurt by
// hitting it, which is the whole of what an actor-carried persistent effect is
// for.
# entity spined-urchin
title: Spined Urchin
examine: A knot of black spines around something that has not moved in years.
stats: max-health 2000, defense 0, evasion 0, accuracy 0
passives: retribution

# location proving-ground
x: 3, y: 0
examine: A walled yard behind the armoury, sand raked flat and stained.
adjacent:
  tutorial-island.beach
entities:
  armourers-chest, proving-post, spined-urchin

// --- tests ---
//
// Every route below opens on this, because where the archetype content sits in
// the world is out of this module's scope and a save is the smallest thing that
// puts a player in front of it.

# save at-the-proving-ground
{"version":11,"location":"combat-expansion.proving-ground","flags":{"combat-expansion.proving-ground.discovered":true}}

// Recorded from live sessions with /create-valid-test, so what each route
// spells is what a player typed and the closing `expect:` is the sheet that
// session ended on. Regenerate the same way when this content changes on
// purpose.
//
// Every route grows the same plain blade: two Master's Whetstones buy the
// points, the base's bare east slot takes the jewel, and what differs between
// the routes is which positions the points were spent on.

// The berserker's resource. Rage is granted only by a landed swing and bled
// back only by the passive that grants it, so the whole of what the closing
// sheet records about the pool came from the hexagon this route allocated.
# test rage-rises-as-swings-land
load: at-the-proving-ground
use: entity.armourers-chest.open
feed: proving-blade with tutorial-island.masters-whetstone
feed: 1 with tutorial-island.masters-whetstone
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with wrath-jewel
// Position 1 is the entry the slot put the jewel's root on; the hub is one
// step from it and is where the signature passive sits.
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: tutorial-island.melee-combat on proving-post
wait: 30
expect: rage-rises-as-swings-land-end

// The other half of the same arc, and the half a stack count cannot have: the
// swinging stops, the rate keeps running, and the pool is empty a minute later.
# test rage-drains-when-the-swinging-stops
run: rage-rises-as-swings-land
cancel
wait: 60
expect: rage-drains-when-the-swinging-stops-end

// The gate is a wrapper and the payload stacks, so what the sheet records is
// several instances of one declaration, each on its own clock. `quickening` is
// allocated beside `spurred` and reads how many are held; the two are separate
// passives on separate points, which is what makes them separable.
# test accelerated-vigor-stacks-behind-its-gate
load: at-the-proving-ground
use: entity.armourers-chest.open
feed: proving-blade with tutorial-island.masters-whetstone
feed: 1 with tutorial-island.masters-whetstone
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with wrath-jewel
// Round the outer ring rather than across the hub, so the rage passive is not
// allocated and nothing in this sheet came from it.
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 2
allocate: 1 at 1,0 position 3
allocate: 1 at 1,0 position 6
allocate: 1 at 1,0 position 5
equip: 1
use: tutorial-island.melee-combat on proving-post
wait: 60
expect: accelerated-vigor-stacks-behind-its-gate-end

// The debuff is held by the struck party rather than by the swinger, which is
// what the closing sheet shows: the venom is under the post's name and its
// health is falling faster than the swings alone took it.
# test poison-holds-the-struck-enemy
load: at-the-proving-ground
use: entity.armourers-chest.open
feed: proving-blade with tutorial-island.masters-whetstone
feed: 1 with tutorial-island.masters-whetstone
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with creeping-rot-jewel
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: tutorial-island.melee-combat on proving-post
wait: 10
expect: poison-holds-the-struck-enemy-end

// Nothing refreshes it once the swinging stops, and the duration on the
// declaration is the only thing that says when it ends.
# test poison-lifts-when-its-own-duration-runs-out
run: poison-holds-the-struck-enemy
cancel
wait: 30
expect: poison-lifts-when-its-own-duration-runs-out-end

// Thorns, carried by something that swings nothing and declares no action at
// all: the urchin never attacks, and the player is at 5 health of 30 because
// every swing that landed cost five.
# test striking-a-thorned-enemy-costs-the-striker
load: at-the-proving-ground
use: tutorial-island.melee-combat on spined-urchin
wait: 10
expect: striking-a-thorned-enemy-costs-the-striker-end

// --- the sheets those routes ended on ---

# save rage-rises-as-swings-land-end
{"version":11,"inventory":{"combat-expansion.proving-blade":0,"tutorial-island.masters-whetstone":4,"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":0,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tutorial-island.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"resources":{"combat-expansion.rage":20000},"resourceRateRemainders":{"combat-expansion.rage":0},"equipped":{"mainhand":"1"},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":1200,"attemptsMade":13}},"roster":{"player":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.proving-post"}},"actors":{"combat-expansion.proving-post":{"resources":{"tutorial-island.health":1801400,"combat-expansion.rage":20000},"rateRemainders":{}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"experience":20000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":32400,"rng":2882385315}

# save rage-drains-when-the-swinging-stops-end
{"version":11,"inventory":{"combat-expansion.proving-blade":0,"tutorial-island.masters-whetstone":4,"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":0,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tutorial-island.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"resourceRateRemainders":{"combat-expansion.rage":0},"equipped":{"mainhand":"1"},"location":"combat-expansion.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"experience":20000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":92400,"rng":2882385315}

# save accelerated-vigor-stacks-behind-its-gate-end
{"version":11,"inventory":{"combat-expansion.proving-blade":0,"tutorial-island.masters-whetstone":4,"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":0,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tutorial-island.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"buffs":{"player":[{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"tutorial-island.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":69600},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"tutorial-island.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":101955},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"tutorial-island.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":109759},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"tutorial-island.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":111534},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"tutorial-island.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":114780},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"tutorial-island.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":117760}]},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":518,"attemptsMade":31}},"roster":{"player":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.proving-post"}},"actors":{"combat-expansion.proving-post":{"resources":{"tutorial-island.health":1514000,"combat-expansion.rage":20000},"rateRemainders":{}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"experience":20000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","allocatedPositions":[1,2,3,6,5],"allocatedSlots":[],"effects":[]}}}}}},"time":62400,"rng":2103776196}

# save poison-holds-the-struck-enemy-end
{"version":11,"inventory":{"combat-expansion.proving-blade":0,"tutorial-island.masters-whetstone":4,"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":0},"flags":{"combat-expansion.proving-ground.discovered":true,"tutorial-island.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"buffs":{"combat-expansion.proving-post":[{"source":"combat-expansion.venom","tags":[{"kind":"keyword","value":"poison"},{"kind":"stat-bonus","statId":"tutorial-island.regeneration","percent":false,"amount":{"min":-30,"max":-30}},{"kind":"duration","seconds":20}],"expiresAt":32000}]},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5}},"roster":{"player":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.proving-post"}},"actors":{"combat-expansion.proving-post":{"resources":{"tutorial-island.health":1935000,"combat-expansion.rage":20000},"rateRemainders":{"tutorial-island.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"experience":20000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":12400,"rng":278522923}

# save poison-lifts-when-its-own-duration-runs-out-end
{"version":11,"inventory":{"combat-expansion.proving-blade":0,"tutorial-island.masters-whetstone":4,"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":0},"flags":{"combat-expansion.proving-ground.discovered":true,"tutorial-island.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"location":"combat-expansion.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"experience":20000,"plane":{"0,0":{"jewel":null,"entry":null,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":42400,"rng":278522923}

# save striking-a-thorned-enemy-costs-the-striker-end
{"version":11,"flags":{"combat-expansion.proving-ground.discovered":true,"tutorial-island.beach.discovered":true},"resources":{"tutorial-island.health":5000},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5}},"roster":{"player":{"ownerRef":"action.tutorial-island.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.spined-urchin"}},"actors":{"combat-expansion.spined-urchin":{"resources":{"tutorial-island.health":1950000,"combat-expansion.rage":20000},"rateRemainders":{}}}},"time":12400,"rng":278522923}

