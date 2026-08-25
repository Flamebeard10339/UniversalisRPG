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
dependencies: core, tulsa

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

// Both are upkeep on the character sheet rather than fighting: a pool that fills
// while you swing and empties while you do not is not what a blow is decided by,
// and rage drain is the stat the owner named as the one he did not want on the
// front page.
# stat max-rage
group: core.upkeep

# stat rage-drain
base: -30
group: core.upkeep

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

// --- the ground they are proved on ---
//
// One way out and no way in: where the archetype jewels sit in the world is
// not this module's question, and a room the player can leave is the smallest
// thing that does not strand anyone who is put in it.

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

# entity armourers-chest
title: Armourer's Chest
examine: A long crate, stencilled, and nobody has come for it.
flags: emptied
open:
  instant
  hidden if: emptied
  roll: archetype-cache
  set: emptied
  say: Six jewels and a plain blade with room in it for one of them.

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
  tulsa.beach
entities:
  armourers-chest, proving-post, spined-urchin

// --- tests ---
//
// Every route below opens on this or on a copy of it, because where the
// archetype content sits in the world is out of this module's scope and a save
// is the smallest thing that puts a player in front of it.

# save at-the-proving-ground
{"version":13,"location":"combat-expansion.proving-ground","flags":{"combat-expansion.proving-ground.discovered":true}}

// Recorded from live sessions with /create-valid-test, so what each route
// spells is what a player typed and the closing sheet is where that session
// ended. Regenerate the same way when this content changes on purpose.
//
// The sheets close on `expect only:`, which compares just the keys the save
// names, and what each route actually claims is written above it as `assert:`.
// A buff held by the struck party and an enemy's pool are the two things no
// condition can name — those stay the sheet's to say.
//
// Every route grows the same plain blade, and the crate hands it over already
// a copy of its own with its level rolled: the base's bare east slot takes the
// jewel, and what differs between the routes is which positions the points
// were spent on.

// The berserker's resource. Rage is granted only by a landed swing and bled
// back only by the passive that grants it, so the whole of what the closing
// sheet records about the pool came from the hexagon this route allocated.
# test rage-rises-as-swings-land
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with wrath-jewel
// Position 1 is the entry the slot put the jewel's root on; the hub is one
// step from it and is where the signature passive sits.
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: core.melee-combat on proving-post
wait: 30
// rising-fury is the only source of max-rage on this route, so the stat root
// reading 20 back is the jewel's allocation and nothing else.
assert: stat.max-rage = 20
// Thirteen landed swings granted 39 where the rate bled 15 back over the same
// thirty seconds, so the pool is not merely up: it is against its ceiling.
assert: resource.rage = 20
expect only: rage-rises-as-swings-land-end

// The other half of the same arc, and the half a stack count cannot have: the
// rate keeps running once the swinging stops.
# test rage-drains-when-the-swinging-stops
run: rage-rises-as-swings-land
cancel
wait: 60
// The pool still exists — the passive granting the ceiling is still allocated —
// and a minute of the rate with nothing granting has emptied it.
assert: stat.max-rage = 20
assert: resource.rage = 0
expect only: rage-drains-when-the-swinging-stops-end

// What the route below counts with, and a save that puts it in the player's
// hand. One evasion a stack, on a stat nothing else this route moves, so the
// number the claim rests on is one this file writes rather than the balance of
// the payload being counted: `accelerated-vigor` may be worth anything at all
// and six held is still six read.
# item vigor-tally
DEBUG
slot: offhand
+1 evasion per stack of accelerated-vigor

# save at-the-proving-ground-with-a-tally
DEBUG
{"version":13,"location":"combat-expansion.proving-ground","flags":{"combat-expansion.proving-ground.discovered":true},"inventory":{"combat-expansion.vigor-tally":1}}

// The gate is a wrapper and the payload stacks, so what a minute of swinging
// leaves the player holding is several instances of one declaration, each on
// its own clock, rather than one that keeps being refreshed. `quickening` is
// allocated beside `spurred` and reads how many are held; the two are separate
// passives on separate points, which is what makes them separable.
# test accelerated-vigor-stacks-behind-its-gate
DEBUG
load: at-the-proving-ground-with-a-tally
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with wrath-jewel
// Round the outer ring rather than across the hub, so the rage passive is not
// allocated and nothing in this sheet came from it.
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 2
allocate: 1 at 1,0 position 6
allocate: 1 at 1,0 position 5
equip: 1
equip: vigor-tally
use: core.melee-combat on proving-post
wait: 60
// Eight instances held at the end of the minute, counted and not inferred: the
// tally is one evasion a stack and nothing else on this route touches that
// stat, so the reading is the number of them rather than arithmetic over the
// base attack-rate, the payload's own figure and the passive that reads how
// many are held, none of which the count answers to.
assert: stat.evasion = 8
// The arithmetic the count above refuses to do, which is the other half of the
// pair and the only reading `quickening` reaches: 25 of base and eight stacks
// of a payload worth +2 is 41 added, raised 24% by a passive reading eight at
// 3% apiece. A `quickening` granting nothing reads 41, and a payload worth
// anything else moves the added half.
assert: stat.attack-rate = 50.84
expect only: accelerated-vigor-stacks-behind-its-gate-end

// The payload's own duration is the only thing that ends a stack — nothing
// refreshes one once the swinging stops — and each runs on the clock it was
// granted on rather than all of them together. Half a minute after the last
// swing the earliest two have lifted and six are held; a minute after it none
// are. A payload that lasted longer than its declaration says would read eight
// at both.
# test accelerated-vigor-lifts-on-each-stacks-own-clock
DEBUG
run: accelerated-vigor-stacks-behind-its-gate
cancel
wait: 30
assert: stat.evasion = 6
wait: 30
assert: stat.evasion = 0

// The debuff is held by the struck party rather than by the swinger, which is
// what the closing sheet shows: the venom is under the post's name and its
// health is falling faster than the swings alone took it.
# test poison-holds-the-struck-enemy
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with creeping-rot-jewel
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 7
equip: 1
use: core.melee-combat on proving-post
wait: 10
// The swinger's own regeneration is untouched. Venom is -30 on a stat whose
// base is 1, so a swinger holding its own venom would read well under zero;
// this is the half of "on them" that the player's sheet can say. That the post
// holds it, and that its health is falling faster than the swings took it, is
// the closing sheet's to say — no condition names another actor's buffs.
assert: stat.regeneration > 0
expect only: poison-holds-the-struck-enemy-end

// Nothing refreshes it once the swinging stops, and the duration on the
// declaration is the only thing that says when it ends.
//
// `expect:` and not `expect only:`, because the claim is an absence: the post
// no longer holds the venom. `expect only:` compares just the keys a save
// names, and a sheet recorded after the buff lifted has stopped naming it —
// which would leave this passing in a world where poison never expires. Only
// the whole sheet can say a thing is gone. No assertion can stand in either:
// the buff is on the struck party and the condition roots read the player.
# test poison-lifts-when-its-own-duration-runs-out
run: poison-holds-the-struck-enemy
cancel
wait: 30
expect: poison-lifts-when-its-own-duration-runs-out-end

// Thorns, carried by something that swings nothing and declares no action at
// all. The urchin never attacks, so nothing but the thorns can have taken any
// health off the player: five landed swings at five apiece is 25 of the 30 the
// player has, and only regeneration gave any of it back.
# test striking-a-thorned-enemy-costs-the-striker
load: at-the-proving-ground
use: core.melee-combat on spined-urchin
wait: 10
assert: resource.core.health < 10
expect only: striking-a-thorned-enemy-costs-the-striker-end

// The take-back rule walked from shipped content rather than only from a unit
// test: a leaf comes back for its point, a node something still stands on is
// refused, and a socket is refused whatever else is true of it.
# test a-plane-unwinds-from-its-leaves-and-never-out-from-under-a-jewel
DEBUG
load: at-the-proving-ground
use: entity.armourers-chest.open
allocate: 1 at 0,0 slot e
slot: 1 at 0,0 e with wrath-jewel
refuse: unallocate 1 at 0,0 slot e
allocate: 1 at 1,0 position 1
allocate: 1 at 1,0 position 2
refuse: unallocate 1 at 1,0 position 1
unallocate: 1 at 1,0 position 2
unallocate: 1 at 1,0 position 1

// --- the sheets those routes ended on ---

# save rage-rises-as-swings-land-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"resources":{"combat-expansion.rage":20000},"equipped":{"mainhand":"1"},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":1200,"attemptsMade":13}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.proving-post"}},"actors":{"combat-expansion.proving-post":{"resources":{"core.health":1796980,"combat-expansion.rage":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":32400,"rng":1634748446}

# save rage-drains-when-the-swinging-stops-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"location":"combat-expansion.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":92400,"rng":1634748446}

# save accelerated-vigor-stacks-behind-its-gate-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1,"combat-expansion.creeping-rot-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"equipped":{"mainhand":"1","offhand":"combat-expansion.vigor-tally"},"buffs":{"player":[{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":75342},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":77293},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":95043},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":101535},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":103025},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":105773},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":108315},{"source":"combat-expansion.accelerated-vigor","tags":[{"kind":"keyword","value":"stacks"},{"kind":"stat-bonus","statId":"core.attack-rate","percent":false,"amount":{"min":2,"max":2}},{"kind":"duration","seconds":60}],"expiresAt":113035}]},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":581,"attemptsMade":39}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.proving-post"}},"actors":{"combat-expansion.proving-post":{"resources":{"core.health":1439360,"combat-expansion.rage":0},"rateRemainders":{"core.health":0}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.wrath","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,2,6,5],"allocatedSlots":[],"effects":[]}}}}}},"time":62400,"rng":2921578386}

# save poison-holds-the-struck-enemy-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"buffs":{"combat-expansion.proving-post":[{"source":"combat-expansion.venom","tags":[{"kind":"keyword","value":"poison"},{"kind":"stat-bonus","statId":"core.regeneration","percent":false,"amount":{"min":-30,"max":-30}},{"kind":"duration","seconds":20}],"expiresAt":32000}]},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.proving-post"}},"actors":{"combat-expansion.proving-post":{"resources":{"core.health":1925206,"combat-expansion.rage":0},"rateRemainders":{"core.health":40000}}}},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":12400,"rng":1044821574}

# save poison-lifts-when-its-own-duration-runs-out-end
{"version":13,"inventory":{"combat-expansion.blood-frenzy-jewel":1,"combat-expansion.wrath-jewel":1,"combat-expansion.iron-bulwark-jewel":1,"combat-expansion.retribution-jewel":1,"combat-expansion.wracking-blades-jewel":1},"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.beach.discovered":true,"combat-expansion.armourers-chest.emptied":true},"equipped":{"mainhand":"1"},"location":"combat-expansion.proving-ground","instances":{"next":2,"byId":{"1":{"kind":"item","template":"combat-expansion.proving-blade","payload":{"roll":0.13564288965426385,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.6093358164653182,"allocatedPositions":[],"allocatedSlots":["e"],"effects":[]},"1,0":{"jewel":"combat-expansion.creeping-rot","entry":"e","roll":0.794003525050357,"allocatedPositions":[1,7],"allocatedSlots":[],"effects":[]}}}}}},"time":42400,"rng":1044821574}

# save striking-a-thorned-enemy-costs-the-striker-end
{"version":13,"flags":{"combat-expansion.proving-ground.discovered":true,"tulsa.beach.discovered":true},"resources":{"core.health":5206},"resourceRateRemainders":{"core.health":40000},"location":"combat-expansion.proving-ground","activeAction":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","repeating":false,"implicitTarget":1000,"cadences":{"player":{"progress":400,"attemptsMade":5}},"roster":{"player":{"ownerRef":"action.core.melee-combat","actionSlug":"melee-combat","target":"combat-expansion.spined-urchin"}},"actors":{"combat-expansion.spined-urchin":{"resources":{"core.health":1940206,"combat-expansion.rage":0},"rateRemainders":{"core.health":40000}}}},"time":12400,"rng":278522923}

