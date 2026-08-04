# Smithing probe — findings

`npm run smithing-probe` tests the arrangement layer. `npm run smithing-discover` tests whether
archetypes emerge from a single formula. Both work on synthetic mods — a type tag plus a payload
over 23 stats — because the questions are about the shape of the value landscape, not about
whether `+5 fire damage` is the right number.

## The combat model: Path of Exile in miniature

Build value is not a weighted sum. A linear objective cannot represent an archetype: no synergy,
no thresholds, and a hybrid lands exactly halfway between the two builds it mixes.

Four damage tags (phys, fire, cold, chaos). Per tag: a flat pool, one **additive** `increased`
pool, and a count of **multiplicative** `more` multipliers. Then global attack rate, crit as
`1 + chance x multi`, penetration, life, defence, and a resistance capped at 75.

```
perTag  = (flat + converted) x (1 + increased/100) x 1.25^more  - armour | x (1 - resist)
dps     = Σ perTag x attackRate x (1 + critChance x critMulti)
power   = dps x sat(life x (1 + defence/100) / (1 - min(75, resistance)/100))
```

Three properties carry the design:

- **`increased` is one additive pool per tag**, so stacking it alone is concave.
- **`more` is a count of separate multipliers**, so it compounds — the chase mod.
- **Both are per-tag**, so damage spread across tags makes every scaling mod apply to a fraction
  of it. *This* is what pays for specialising. Multiplication alone does not: within one chain
  the factors have diminishing returns against themselves and the optimum spreads across
  complements. Tags are the mechanism; multiplication is the vehicle.

Conversion is why two apparently unrelated mods stack: converted damage is scaled by the
increases of both the tag it came from and the tag it became.

## Findings — the arrangement layer

**F1 — A bare ring gives every placed mod exactly one incoming edge.** Its multiplier cannot
leave `[1, 1+strength]`, capping T1 at `1+strength` and T3 at `strength/(1+strength)`. The ring's
dynamic range *is* the strength dial. Structural, not tuning.

**F2 — Placement is build-independent.** Cross-archetype regret sits at 0.001–0.013 against a
0.05 floor and does not move for: nine topologies, bare or perturbed wiring, an 8x change in the
item's share of total power, resonance targeted to the source type's stats, or stat-type
correlation at 0 or 0.7. **Which mods go on the item is build-defining; how they are arranged is
not.** Arrangement is a real but build-neutral optimisation worth 7–24% of total power.

**This is not a reason to drop the topology, and reading it that way was an error (corrected
2026-08-02).** Build-dependence was never the requirement. The requirement was that applying a
mod be a decision rather than a sort, which is what T1 measures and what F14 confirms. A puzzle
with one right answer that is expensive to get wrong is still gameplay.

**F3 — Sparsity never wins.** Zero to 0.06 everywhere, including an abundance regime built to
make it possible and damping at twice the gain. The player chooses the insertion point, the
multiplier floors at zero, and outgoing damage can be aimed at something the build does not
value. Sparsity needs an explicit per-slot capacity cost. **Dropped as a goal 2026-08-02.**

**F4 — The two graphs do different jobs.** Wiring variance creates the placement decision; the
non-transitive type relation prevents a dominant type (`transitive` and `uniform` reach dominance
1.96–2.03 where `rps3` holds 1.06–1.24). `rps3` beats `paley7`; the extra paradox depth buys
nothing.

**F5 — Targeted resonance is a dead end.** Making an edge lift only the stats its source type
owns collapsed T1 to 1.02–1.07 and left T2 at 0.000–0.007, on correlated and uncorrelated pools
alike. It dilutes the effect without creating divergence.

## Findings — archetype emergence

**F6 — Specialisation beats diversification, decisively.** Greedy builds from an 80-mod pool
reach a tag-share Herfindahl of 0.985–0.990 against 0.49–0.68 for arbitrary builds of the same
size, with 100% of builds carrying over 60% of their damage on one tag. Nothing declares an
archetype; the optimiser lands on one. Concentration falls at very large budgets (0.538 at 36
mods) as the pool's good mods in the chosen tag run out and the build spills into a second — the
same late-game secondary-damage behaviour real ARPGs show.

**F7 — One item is not a character, and the probe's exhaustive search is scoped to one.** At
five slots the optimiser *diversifies* (concentration 0.578 versus 0.697 for arbitrary
arrangements), because five mods cannot build a scaling chain deep enough for a per-tag
multiplier to beat another tag's flat damage. Specialisation only appears from about eight mods
up. Any future test of build identity has to be run at character scale, greedily; exhaustive
enumeration belongs to the arrangement question alone.

**F8 — The weapon base seeds the archetype.** With one shared physical starting weapon, every
one of 24 pools produced a physical build. Give the character a different base and the dominant
tag follows it — fire base 10/24 fire, cold base 13/24 cold, chaos base 13/24 chaos, with
concentration 0.80–0.87 and 92–100% pure. This lands the design pillar: the random chase item
is what decides which archetype you can build, and crafting is what commits you to it.

**F9 - Armour is not a balance lever.** Raising enemy armour eightfold (30 to 240) moved
physical builds only 519 to 407 and base parity only 1.50x to 1.28x, because a taxed build
simply converts away from physical rather than eating the tax. Flat mitigation is also worthless
against a scaled hit and total against an unscaled one, so armour and resistance cannot share a
number; the model now uses the diminishing form `armour / (armour + hit)`, capped at 0.5.

**F10 - Most of the apparent imbalance was the generator, not the game.** The physical family
held 3 stats where fire and cold held 4 and chaos held 5, so physical mods rolled the stats that
matter more often. Equalising the families reversed the ranking outright: physical went from
strongest to weakest. A multiplier only one tag can use is the same artefact wearing a disguise -
`ailmentEffect` sat in the tagless family but only chaos could spend it, making it chaos's fifth
stat, and removing it moved chaos from strongest to mid. **Pool composition changed reachable
power by about 19%, more than either defence stat did.**

**F11 - The balance measurement has a noise floor of about 1.18x, which is wider than the gap it
was built to measure.** At zero resistance fire and cold face mechanically identical rules, and
across 60 pools they still differ by 18% (484 against 570). The cause is that `more` multipliers
compound at 1.25x and are rare, so whether a pool happens to contain one decides the build - the
distribution is heavy-tailed and does not average out at this sample size. Any future balance
claim needs a stratified pool with matched family counts, or it is reading luck.

**F12 - Stratifying the pool makes the instrument sound, and the baseline is balanced.** Dealing
every tag the same hand of mod templates drops the null (fire against cold, exact relabellings of
one another) from 1.18x to **1.000x-1.011x**. With that floor established, armour 90 against 30%
resistances gives a base parity of **1.07x** - phys 509, fire 546, cold 542, chaos 541. The
residual 1.011x in the no-defence row is the conversion stats, which are drawn independently in
the tagless family, so a pool can hold more convFire than convCold.

Differentiating by content then works exactly as intended: a cold-resistant monster (20/60/30)
moves fire to 613 and cold to 473, a 1.30x swing, and a chaos-immune monster drops chaos to 414.
**Identical tags, differentiated by what they are being swung at.**

**F13 - Pool size is a power dial, not a variety dial, and it does not saturate.** Holding the
budget at 16 mods and growing the pool from 20 to 240 raised reachable power from 53 to 1910,
gaining 85-190% at every step with no plateau. The cause is compounding: a larger pool holds
proportionally more `more` multipliers, and they multiply at 1.25 each, so power grows
exponentially in pool size. Authoring more mods therefore makes players stronger even when they
can equip no more of them.

This means "how many mods does the system need" cannot be answered by finding where power
plateaus, because it never does. **Access to compounding multipliers has to be bounded
independently of pool size** - by slot count, by restricting them to particular slots, or by
making them not stack - or every content addition is a power patch.

**F14 - Topology is what makes permanence bite, and it quadruples the decision.** Orbs arriving
one at a time, each placed permanently before the next is known, measured against an oracle that
saw the whole sequence (300 sequences, 10 orbs, 5 slots):

| topology | myopic smith / oracle | at stake |
|---|---|---|
| none, slots alike | 0.947 | 5.3% |
| ring5+damp | 0.863 | 13.7% |
| ring5+damp, perturbed | **0.762** | **23.8%** |

With interchangeable slots a player who simply takes every improvement lands within 5% of perfect
- which is exactly the complaint that deterministic crafting has no strategy, measured. Topology
raises what is at stake to 24%.

Holding slots open does not help: patience thresholds from 0 to 0.2 all land within a point of
each other, and high patience hurts. **The decision is where a mod goes, not whether to take it**,
which is precisely the thing only a topology can create. Without one, permanence has nothing to
bite on, because every slot is the same slot.

Part of the 24% is irreducible - the oracle knows the future and no online player can. The clean
result is the ratio between topologies, which is not confounded by that.

**F15 - Agency needs in-degree, and the ring has none to give.** How far a wealthy player can
push or suppress ONE chosen mod with the whole pool in hand (20 pools, 10 mods, 5 slots,
strength 0.3, damp 0.15):

| base | amplify | pure range | range at 90% of peak power |
|---|---|---|---|
| ring (in-degree 1) | 1.30 | 1.53 | 1.33 |
| ring, compounding | 1.30 | 1.53 | 1.33 |
| ring, perturbed | 1.60 | 2.29 | 1.47 |
| hub, additive | 2.50 | 10.00 | 1.72 |
| **hub, compounding** | **3.71** | **8.37** | 1.87 |

The ring tops out at exactly `1 + strength`, as F1 said it must, and **compounding conduction
changes nothing on a ring** - there is only ever one incoming edge, so there is nothing to
compound. In-degree is the lever: funnelling four edges into one slot reaches 2.50 additively and
3.71 compounding, clearing the 200% bar.

The caveat is the last column. Pure range is what the player can reach at any price; holding 90%
of peak power the range falls under 2x. So targeting a mod hard is real but **costs power**, which
is the trade that makes it a decision rather than a free lunch.

This gives bases a mechanical identity rather than a numeric one: a ring base is a safe generalist
with almost no targeting, a hub base lets a build be built around one mod. That is the chase item
deciding what kind of crafting is available to you.

**F16 - The ring is the worst item shape there is.** Six nodes, no orphans, no bidirectional
edges, the same six mods placed every time so only the graph varies:

| graph | E | maxIn | acyclic | ceiling | spread | agency |
|---|---|---|---|---|---|---|
| cycle (the ring) | 6 | 1 | no | **41** | 1.09 | 1.10 |
| path (linear) | 5 | 1 | yes | 42 | 1.11 | 1.10 |
| circulant {1,2} | 12 | 2 | no | 48 | 1.13 | 1.10 |
| fan-in tree | 5 | 3 | yes | 49 | 1.21 | 1.37 |
| layered dag | 9 | 3 | yes | 57 | 1.27 | 1.37 |
| hub (all into one) | 5 | 5 | yes | 58 | 1.34 | 1.53 |
| tournament (complete) | 15 | 3 | no | 61 | 1.24 | 1.22 |
| **transitive tournament** | 15 | 5 | yes | **91** | 1.58 | 1.53 |

**Maximum in-degree predicts item quality; edge count is secondary.** A 5-edge hub beats a
12-edge circulant on every column. At a fixed 15 edges the transitive tournament reaches 91 where
the cyclic tournament reaches 61, because a regular graph spreads in-degree evenly by
construction and so offers nowhere to funnel. Acyclicity is not itself the virtue - it is how a
graph gets a node with in-degree 5.

A true Paley tournament needs 7 nodes and cannot exist on 6; the nearest analogue is the
doubly-regular circulant {1,2}, and it is close to the floor. **The fairest graph is the least
expressive one.** (`circulant {1,2,4}` is not a legal item at all - offset 4 is offset 2 reversed,
so it pairs both directions; the script now asserts orientation rather than trusting it.)

Random graphs make the chase real: mean ceiling climbs with edge count (44 at E=4 to 74 at E=15),
but at E=15 the best sampled graph reaches 88 and the worst 57. **A badly shaped 15-edge item is
worse than a well-shaped 8-edge one (70).** Shape dominates size, which is what makes a dropped
item worth reading rather than counting.

Two consequences. Item quality has one legible axis to show a player - how deep a funnel the
graph offers - and graph-editing orbs acquire an obvious purpose, since adding an edge into the
funnel or reversing one to deepen it is a real craft. And the ring, which every earlier finding
here was measured on, belongs as the starter item rather than the design.

**F17 - Node count is superlinear and fits a closed form; max in-degree peaks near 4.** Lift is
the wired ceiling over the same mods with resonance off, so the extra mods a bigger item holds are
divided out and only the graph is left.

| nodes | bare | wired | lift | 1.21^(N-2) | bound 1.3^(N-1) |
|---|---|---|---|---|---|
| 3 | 17 | 21 | 1.18 | 1.21 | 1.69 |
| 4 | 23 | 38 | 1.49 | 1.46 | 2.20 |
| 5 | 31 | 60 | 1.73 | 1.77 | 2.86 |
| 6 | 39 | 97 | 2.10 | 2.14 | 3.71 |
| 7 | 47 | 136 | 2.59 | 2.59 | 4.83 |

Two terms, and they behave differently. **Bare power is linear** - about 8 per node, because a
node is just another mod. **Lift is geometric**, and `1.21^(N-2)` reproduces every measured value
to within 0.04. Their product is the item's power, so **3 nodes to 7 nodes is 6.5x**.

The realised base of 1.21 sits under the all-positive bound of `1 + strength = 1.3` because with a
signed relation only about half of the ordered type pairs resonate, so not every edge can be made
positive. That fraction falls as in-degree grows: realised lift is 70% of the bound at 3 nodes and
54% at 7. **The exponential damps itself**, which is why the curve is tuneable rather than runaway.
`strength` and the positive-edge density of the type relation set the base directly.

Lift by max in-degree, holding node count:

| nodes | m=1 | m=2 | m=3 | m=4 | m=5 | m=6 |
|---|---|---|---|---|---|---|
| 5 | 1.31 | 1.59 | 1.73 | 1.73 | - | - |
| 6 | 1.35 | 1.75 | 2.09 | **2.22** | 2.10 | - |
| 7 | 1.40 | 1.90 | 2.50 | **2.98** | 2.75 | 2.59 |

**In-degree peaks around 4 and then declines**, at every size. Past that, extra incoming edges are
more likely to land on a damping pair than a resonant one, and a fully connected node is worse
than a well-chosen four. So the rarity dial has a natural ceiling: raising max in-degree pays up
to about 4 and stops. That ceiling depends on how dense the positive half of the type relation is,
not on node count.

**F18 - Normalising by node count works, but it is a different problem from mods-versus-topology.**
Dividing the item's output by its node count makes an edgeless item worth the same at every size:
bare power reads 29, 31, 31, 31, 30 across 3 to 7 nodes, against 17 to 47 when summed. Node count
then buys only the lift it enables, and the 3-to-7 band falls from 6.5x to 1.8x.

It does **not** shift value from mods to topology. Dividing by N scales the mod term and the
topology term by the same factor, so their ratio at any fixed size is untouched.

**F19 - Edge strength cannot shift that ratio either, because edges multiply mods.** Measuring
arrangement spread against the p90/p10 spread of mod sets (max/min is an extreme-value statistic
one lucky compounding mod decides):

| lever | ratio at 3 nodes | at 7 nodes |
|---|---|---|
| normalised | 0.08 | 0.33 |
| normalised, no compounding mods | 0.09 | 0.34 |
| normalised, no compounding mods, strength 0.6 | 0.07 | 0.30 |

Doubling strength raised arrangement spread from 1.22 to 2.41 - and raised mod spread just as
much, because a strong edge amplifies whatever payload sits under it. A good mod set gains more
from strong edges than a bad one. **The two terms are coupled by construction** (`payload x
multiplier`), so the only lever that moves the ratio is payload uniformity, which is the
coloured-tokens trade: mods stop being a chase.

Removing the compounding `more` mods moved the ratio by 0.01. Their apparent dominance in F11 and
F13 was real for max/min and much smaller for p90/p10.

**What does move it is scale.** The ratio improves fourfold from 3 nodes to 7, so a big item is
genuinely more topology-driven than a small one - early game is about finding mods, late game
about arranging them, with no extra mechanism needed.

The premise worth separating: large mod variance is not the problem. It is the acquisition thrill
doing its job. The problem identified was that mod *choice* is a sort, and that is already
answered by F14 - arrangement is a live decision worth 24% against an oracle. Suppressing mod
value is not needed for the strategy to live in the topology, and it costs the chase.

**F20 - The type relation still earns its place on graph items, and damping is why.** On a ring
every slot has in-degree 1, so type pairs were the only thing telling two slots apart. On a funnel
the slots differ by depth on their own, which raised the question of whether types had become
redundant. Compared at matched power (typeless run at strength 0.12 to reach a ceiling of 84,
against the circulants at 0.3 reaching 93-97), on a transitive tournament:

| relation | ceiling | spread | agency | greedy |
|---|---|---|---|---|
| typeless (every edge resonates) | 84 | 1.31 | 1.59 | **0.932** |
| rps3 (unsigned) | 54 | 1.15 | 1.14 | 0.941 |
| ring5 + damp | 97 | 1.67 | 2.08 | 0.719 |
| paley7 + damp | 93 | 1.68 | 2.12 | **0.668** |

`greedy` is the obvious heuristic - biggest payload into the deepest slot - as a fraction of the
true optimum. **Typeless is nearly a pure sort**: that heuristic captures 93% of it. A signed
relation leaves 26-33% on the table, and gives about 1.3x more arrangement spread and agency at
the same power.

Unsigned relations behave like no relation at all (`rps3` at 0.941 against typeless at 0.932). It
is the **negative half** that forces a choice about which type feeds which; without it every edge
is worth taking and the assignment collapses back into a ranking.

Read at face value the unequalised table says typeless wins enormously - ceiling 412 against 93 -
but that is only because every edge is positive, which is a tuning difference rather than a design
one. Equalising power is what makes the comparison mean anything.

Refines F4, which found `rps3` beating `paley7`: that was measured on a ring, for type dominance.
On graph items, for puzzle difficulty, `paley7 + damp` is the best of the set. Both hold.

## Open

- Nothing here tests mods that *read* other mods (thresholds, conditional keystones). That is the
  third source of emergence and the probe does not cover it.
- Utility mods sitting outside the power formula is a **decision, not a gap** (2026-08-02).
  A utility mod that genuinely does not enter the formula is a real sacrifice the player chooses,
  and it lets friction be tuned without moving time-to-kill. The probe will rate them zero and
  never place them; that is correct behaviour, not a modelling failure.
- Balance between tags cannot be read off this probe until the pool is stratified (F11).
