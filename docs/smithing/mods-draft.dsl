// DRAFT — this file does not load. `# mod` and `# resonance` are not section kinds
// yet, and the clauses marked GAP need runtime that does not exist. It is an
// authoring trial: the point is which mods fall out of the existing vocabulary and
// which do not.
//
// Updated 2026-08-04: every GAP below now has an owning branch, and the event
// vocabulary is settled — `on hit:` and `on hit self:` are action-declared hooks
// distinguished by which party the results land on, and anything reacting to being
// struck is an actor-carried persistent effect on the event `damage-taken`. The
// GAP notes name their owner where one exists; where a line still reads as invented
// syntax, that is authoring work belonging to archetype-mods, not a missing runtime.
//
// What already works, unchanged: a mod's payload is a tag clause, and the runtime
// already folds those as (base + added) x (1 + increased) in statRange. That is the
// flat/increased structure the probe modelled, so no new stat maths is needed. The
// smithing graph supplies the compounding term the fold does not have.

# resonance
types: ember, tide, gale, stone, gloom
resonates: +1, +2
gain: 0.30
damp: 0.15

// ember -> tide -> gale -> stone -> gloom -> ember at offset 1, and ember -> gale,
// tide -> stone, and so on at offset 2. The remaining pairs damp. Five types is the
// smallest signed ring that reads as a cycle rather than as rock-paper-scissors.

// --- core: survivability ------------------------------------------------------
// Every one of these is expressible today. They are why the core tier is the right
// place to start: it needs no runtime work at all.

# mod stout-heart
type: stone
examine: A knot of iron that will not be moved.
tier: 1
+18-24 max-health

# mod stout-heart-greater
type: stone
tier: 2
+45-58 max-health

# mod warded-plate
type: stone
tier: 1
+2-3 defense

# mod warded-plate-greater
type: stone
tier: 2
+5-7 defense

# mod slow-mend
type: tide
examine: The wound closes while you are still deciding whether it hurt.
tier: 1
+1-2 regeneration

# mod slow-mend-greater
type: tide
tier: 2
+3-4 regeneration

# mod quickstep
type: gale
tier: 1
+6-9 evasion

# mod quickstep-greater
type: gale
tier: 2
+15-20 evasion

# mod tempered-frame
type: stone
examine: Not more armour. Better armour.
tier: 2
+12% max-health

// --- berserker ----------------------------------------------------------------
// The stat half authors cleanly. The mechanic half does not.

# mod goring-edge
type: ember
tier: 1
+3-5 attack

# mod flurry
type: gale
tier: 1
+2-3 attack-rate

# mod rising-fury
type: ember
examine: Every blow lands harder than the one before it.
tier: 2
// GAP 1: rage. Needs a resource that gains on a landed hit, decays over time, and
// raises attack while it is stacked. The runtime has resources with rates and has
// activeBuffs with added/increased amounts — what is missing is the on-hit event to
// drive them, and a way for a stat to read a resource level.
// SPECCED as combat-events + buffs-generalized. `on hit self:` is the settled
// spelling: `on hit:` applies to the struck actor, `on hit self:` to the swinging
// one, and rage accrues to the wielder. `+2% attack per rage` is the per-counter
// shape combat-events defines over a resource's level.
on hit self: gain: 1 rage
+2% attack per rage

// --- juggernaut ---------------------------------------------------------------

# mod bulwark
type: stone
tier: 1
+3-4 defense, +12-16 max-health

# mod retaliator
type: stone
examine: Striking it is its own punishment.
tier: 2
// SPECCED as combat-events. Not a hook: `on hit-taken:` was the wrong shape, because
// a hook is declared on an action and a passive enemy has none. Thorns is an
// actor-carried persistent effect subscribing to the event `damage-taken`, which is
// a name from the closed past-tense set skill-levels-xp-events owns.
on damage-taken: damage: 4-6 attacker

# mod ironblood
type: stone
tier: 2
// GAP 3: a stat that scales off another stat. `+1 attack per 10 defense` has no
// grammar, and statRange folds each stat independently with no cross-reference.
+1 attack per 10 defense

// --- poison assassin ----------------------------------------------------------

# mod envenomed
type: gloom
examine: The cut is the smallest part of it.
tier: 1
// GAP 4: damage over time on the target. Same missing on-hit event as GAP 1, plus a
// timed modifier owned by the enemy rather than the player. activeBuffs are the
// player's only.
on hit: poison: 2-3, 8s

# mod creeping-rot
type: gloom
tier: 2
on hit: poison: 6-9, 12s

# mod sapping-touch
type: tide
tier: 2
// GAP 5: debuffs. A modifier applied to the enemy's stats for a duration. The buff
// machinery is keyed to the player and has no actor.
on hit: weaken: -3 defense on target, 6s

# mod wracking-blades
type: gloom
tier: 1
// Expressible today, and it is the honest version of the assassin until the events
// land: fast, accurate, low per-hit.
+2 attack-rate, +4-6 accuracy

// --- where orbs drop ----------------------------------------------------------
// GAP 6: `give:` is deterministic and there is no loot table. An orb can be gated
// behind a condition, so a guaranteed first orb from a quest works today, but a
// rat that drops a stout-heart one time in forty does not.

# item orb-of-the-stout-heart
examine: A grey bead, heavier than it looks.
mod: stout-heart

# entity giant-rat
strike:
  // Works today: a guaranteed, gated give.
  requires: flag rat-champion-slain
  give: 1 orb-of-the-stout-heart

  // Wanted, and unavailable: a weighted roll, and a tier band keyed to the level of
  // the thing that died rather than to the player.
  // drops: orb-of-the-stout-heart 1 in 40, orb-of-warded-plate 1 in 60
  // tier: 1 below level 21, 2 above
