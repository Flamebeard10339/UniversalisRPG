# Combat — branch deliverable log

Live working document for the combat feature. Spec, deliverables, progress and open
decisions live here so any session can resume without replaying the planning conversation.
Lifted from `backlog.md > dsl-rewrite-carryover > Engine` on 2026-07-27; on merge, archive
this file and lift anything unfinished back into `backlog.md`.

**Read this before touching combat code.** `backlog.md` carries only a pointer.

## Status

| Chunk | State |
| --- | --- |
| 1. Ranged stats + `dr` | not started |
| 2. Direct pool write | not started |
| 3. Encounter state / second actor | not started |
| 4. Per-actor cadences in the resolver | not started |
| 5. Opposed roll (Elo) | not started |
| 6. Stop-when-start-conditions-fail | not started |
| 7. CLI readouts | not started |
| Droptables (separable) | not started |
| Skill levels + XP events (separable) | not started |

## Deliverable

The rat encounter is a **real fight** instead of the Pass-2 health-drain placeholder.
Acceptance case: a rat attacking 16×/min while the player attacks 25×/min, with a weapon
that raises the player's rate by 25% mid-encounter. Every combattable entity — a goblin
*or* a shoals-fishing-spot, same shape — carries a health resource, an attack-rate stat, a
damage stat and a `dr` stat.

## The one invariant everything here can break

`resolve(resolve(s, t1), t2) === resolve(s, t2)` for `t1 <= t2`, proved in
`resolve.test.ts`. It survives per-attempt RNG as long as the draw *count* per attempt is a
deterministic function of state and the draw *order* is fixed. The per-actor cadence work
(chunk 4) and mid-segment level-ups are the two things most likely to break it silently.

## Spec

### Attack rate

Attacks/minute; default 25 for most things. **Needs no new duration axis** —
`attemptDuration` is already `action.time / statValue(action.speed)` (`runtime.ts:516`), so
`time: 60` + `speed: <attack-rate stat>` yields exactly `60/25 = 2.4s` per attempt, and a
weapon granting `+25% attack rate` is just the existing `increased` channel
(`25 × 1.25 = 31.25/min` → `1.92s`). Consider a `rate:` sugar compiling to that pair, since
authoring a literal `time: 60` to mean "per minute" is opaque.

### Ranged stats

The base/added portion of a stat supports ranges (`4-7`); a range is stored, not collapsed,
and every *use* samples it uniformly. One rule for every stat, so nothing about damage is
special-cased:

```
statValue(s) = sample(s.base + Σs.added) × (1 + Σs.increased)
```

Bonus grammar extends to match — `+3 attack` and `+3-6 attack` are both legal on buffs and
equipment; percent/`increased` bonuses do **not** take a range.

### Defense — flat damage reduction, named `dr`

An ordinary stat under the rule above, subtracted from the incoming hit. No special
mitigation math, no EHP framing:

```
damage = max(minDamage, trunc(statValue(attack) − statValue(dr)))
```

`+10% dr` with no added dr does exactly nothing (`0 × 1.1 = 0`); `+0-10 dr` with `+10% dr`
reduces the hit by `0` to `11`. Damage truncates to int.

`minDamage` (≥ 1) is not just balance: `escapeAfter` defaults to **Infinity**
(`action.ts:51`), so a fight whose damage floors at 0 — `dr` ≥ the attacker's max roll —
never depletes target health and never ends. The player is locked in the action with time
advancing and no progress.

*Rejected* — percent mitigation in any form. `× (1 − d)` caps at 100% (ten +10% sources =
immunity). `/ (1 + d)` has no cap and buys exactly `+d` effective health, but that makes
`+10% defense` and `+10% max-health` the same knob under two names — a duplicated domain
concept, which is what killed it.

### The opposed roll

Used for every contested outcome in the game — combat hits, cooking, fishing, lockpicking:

```
hitChance = 1 / (1 + 10 ^ ((evasion − accuracy) / spread))
```

Base 10, `spread` authored as a `# variable` (equal stats → 0.5, +100 → 0.909, +200 →
0.990). Costs **zero** new RNG: the resolver already draws one uniform per attempt and
compares it to `clamp01(statValue(action.accuracy))` — only the threshold's derivation
changes.

Flat authored probabilities are deliberately **not** expressible here: the chance of
succeeding at a task is always derived from task difficulty vs player skill. Droptables are
the other half of that story and they *are* flat-authored. The split is by purpose —
contested outcomes are derived, loot selection is authored.

### Interaction kinds are named by the content

An action states which resolution model it uses (the opposed-Elo contest, the `attack − dr`
damage model, …) rather than the engine switching on which fields happen to be present.
Adding a new *skill* then needs no code — only a new `# skill`/`# stat`/action naming
existing kinds.

**Settled:** the named kind selects a **code-implemented strategy**; the DSL never authors a
formula, only chooses which implemented function is called. A formula language would need an
expression evaluator plus variable binding, and — the real problem — it would make the
resolver's determinism and associativity guarantees unverifiable, since an authored formula
could be non-associative, order-dependent, or divergent. The kind count is small (contest,
damage, unopposed-deterministic) and grows rarely; the skill count grows constantly, and a
named selector already makes *that* codeless.

### `ability:` / `action.health` consolidation (SETTLED)

Both concepts already exist in a weaker form and get folded into the resource system rather
than duplicated:

1. **`ability:` is already the per-hit damage stat** — "the stat whose value is subtracted
   from the target's remaining health per successful attempt" (`action.ts:41`, applied at
   `runtime.ts:796`). It stays the single damage stat, extended with ranges and `dr`. Do
   **not** add a parallel `damage:` field.
2. **`action.health` is removed in favour of the target's health resource.** A combattable
   entity declares a real pool; the fight ends when that pool reaches 0, replacing the
   `action.health` / `healthRemaining` number. Keep `action.health` only if a trivial
   one-hit target would otherwise need a pool declaration — and if kept, it is sugar that
   compiles to one, never a second code path.
3. **Which resource a hit drains is authored in the DSL, not hardcoded to health.** An
   action names the pool its damage applies to, so the same machinery covers a rat draining
   the player's health, a lockpick attempt draining a lock's integrity, and a
   stamina-draining attack — with fight completion defined as "the named pool hit 0" in
   every case. This is what makes the five shapes one system instead of combat plus four
   special cases.

### The five shapes this has to cover

All the same loop — attempt at a cadence, roll, hit/miss branch — differing only in whether
the target has health, what a hit costs the target, and what a miss costs you:

1. **Cooking** — one attempt, cooking vs dish-complexity, binary. Structurally already what
   recipes compile to (`accuracy` ⇒ `escapeAfter: 1`, `runtime.ts:1081`); only the roll
   changes. Requires raw food at a stove.
2. **Smithing** — no roll at all, gated by skill level. Already the deterministic path.
3. **Fishing** — two independent rolls: catch-or-retry (no failure branch) plus a separate
   chance to consume bait or degrade equipment (`net` → `torn-net`).
4. **Lockpicking** — the lock has health and takes damage per attempt, but its
   "counter-attack" destroys a lockpick instead of dealing damage.
5. **True combat** — health, ranged damage, accuracy, attack rate, both directions.

Cases 3–5 generalize cleanly: **the miss branch is just a result block** (already
`on escape:`), and "counter-attack" is whatever results that block holds — drain a pool,
take an item, swap `net` for `torn-net`.

### Encounter model — N actors, each with its own sheet

An encounter is a set of actors, each carrying its own stats, resources and attack cadence.
**Independent cadences are an MVP requirement, not a later generalization.** Consequences:

1. **There is no second actor today.** `statValue(statId, state, registry)` is
   player-centric and an `# entity` has no stat block.
2. **Resources are player-global.** `state.resources` is a flat `Record<string, number>`;
   per-actor pools need encounter-scoped state.
3. **One `ActiveAction`, N cadences.** Each actor's attack rate is an independent event
   stream (2.4s vs 3.75s interleaving), so `nextBoundary` needs a boundary per actor, and
   `progress`/`attemptsMade` become per-actor rather than the single cadence `ActiveAction`
   models.
4. **This is a save-format change.** `activeAction` is persisted as a deep-diffed scalar
   field (`save.ts:67`/`104`/`128`), so encounter state serializes for free once it lives
   there — but its *shape* changes, which means bumping `SAVE_VERSION` (it fails loudly on
   mismatch by design).

### Encounters end when their start conditions stop holding

Out of bait stops fishing, out of health stops fighting (with optional lose-inventory /
teleport-to-spawn behavior). This **generalizes machinery that already exists** rather than
adding any: `inputLimit(action, state) <= 0` already clears `state.activeAction` at
`runtime.ts:776`/`867`. Widen that one check to re-evaluate the action's full start
condition (inputs *and* `requires:` *and* actor health > 0) each attempt.

Today nothing clears `activeAction` on death — the four clear sites
(`runtime.ts:776/810/867/878`) are all completion or out-of-input, so a player at 0 health
keeps swinging forever.

### Pools need a direct write

Pass 2's stated invariant is that pools move *only* via their rate stat (`grammar.md`:
"nothing writes a pool level directly"), which is why the placeholder rat fight uses a
`-120 regeneration` tag. A discrete 4-7 damage hit is not a rate. Combat needs a result kind
applying an instantaneous pool delta — the one real architectural change in this feature.

**Pools stay float and only damage truncates**: an int pool would round a low regeneration
rate to zero every tick and never recover at all.

### Resolver consequence — combat does not batch

Sampling per attempt draws from `state.rng`, so a ranged-damage attack can no longer use the
batched closed-form path (`applyFightBatch` over whole fights) — it behaves like an
`accuracy` action and must resolve attempt-by-attempt with draws in strict attempt order.
**Accepted for the MVP.** Drawing for the contest, the attack roll, the dr roll and any drop
rolls in a fixed order is safe. Per-hit XP is batch-hostile for the same reason: it's a sum
of random values, not a count.

Optimizations for later, if speed ever becomes a concern:
`.planning/combat-batching-research.md` (exact multinomial aggregation, damage carryover,
renewal-process kills, tau-leaping, counter-based RNG).

### CLI visualization

Finishes the Pass-2 leftover: the `display: minimal` 8-stage glyph renderer exists in
`play-cli` but has no consumer, because attack-rate's "progress" is the active action's
attempt cadence, not a `# resource` pool level — expose that cadence fraction, either as a
derived meter or a small dedicated readout.

As the simulation ticks the player should see health as a `full` bar, attack rate as the
`minimal` glyph, and per-hit lines: `The {enemy.name} hit you for {damage}` /
`You hit the {enemy.name} for {damage}`.

## Separable companion items

### Droptables (reinstate; removed in the rewrite)

One system grants the player *any* item, so `give:` becomes sugar for a single-entry table
rather than a parallel path.

- Layered and referenceable by name: killing a goblin gives 100% bones plus a 10% chance to
  roll the weapon table; the weapon table gives 50% a bronze dagger, 50% 5-10 bronze arrows.
  Quantities are ranges, sampled like any other range.
- **Two table semantics, and they must be distinct** — the goblin example silently uses
  both. *Every-entry*: each entry rolls independently, so you can get all or none (bones +
  weapon-table). *Pick-one*: exactly one entry is selected by weight (dagger XOR arrows).
  Conflating these is the classic droptable bug; name them explicitly.
- **Stats modify tables** (quantity and rarity bonuses from gear/buffs), which is what makes
  a table a first-class system rather than a constant.
- **Do not fold the success/failure roll into the table.** Tempting — cooked-vs-burnt looks
  like a two-entry table with stat-driven weights — but the roll also decides whether XP is
  granted and whether the attempt *completed*, which is outcome semantics, not loot. Keep
  them orthogonal and layer them: the opposed roll picks the branch, the branch's result
  block rolls a table. That yields "every item comes from a table" without one primitive
  doing two jobs.
- Each table roll consumes `state.rng` draws; counts must be deterministic and ordered like
  every other draw.

### Skill levels + XP events (reinstate; removed in the rewrite)

A prerequisite for cooking-vs-dish-complexity and "gated by skill level" — but **not** for
the rat-fight deliverable. Today `# skill`'s `stat-id` field parses but **nothing in the
runtime reads it**, and there is no level curve at all; only raw `state.xp[skillId]` exists.

- **Curve:** 1000 xp per level, doubling every 10 levels — `xpForLevel(n) = 1000 ×
  2^floor((n-1)/10)`. Geometric blocks of 10 keep the xp→level inverse closed-form and
  cheap, which it must be (it is read on every stat evaluation).
- **Skills grant `+1` or `+1% × level` to a named stat**, with which one authored in the
  DSL. This is exactly the existing tag-clause shape (`+1 attack` vs `+1% attack`) — the
  same grammar and the same added/increased channels, so no new modifier concept.
- **Events grant xp**, each carrying an `amount` the expression may use: dealing damage
  grants `4 × damage` attack xp, taking damage grants health xp, a successful cook grants
  cooking xp. The event set must be a closed, enumerated list.
- **Grammar** — the `in` keyword delimits the expression from the skill:

  ```
  gain 4*damage taken experience in health on taking damage
  ```

  Keep the expression deliberately tiny (`<coefficient> * <amount>`) rather than growing a
  general expression language.
- Events fire on **discrete** occurrences only. Continuous pool drain from a rate stat is
  not "taking damage" — otherwise Pass 2's regeneration integration would grant xp every
  segment.
- **Level-ups must be boundary events, not mid-segment.** If dealing damage grants xp and xp
  grants a level and a level grants `+1 attack`, the player's stats change *mid encounter*.
  Pass 2's resource integration explicitly assumes otherwise — `captureResourceRates`
  snapshots each rate once per segment because "stat values only change at boundaries"
  (`runtime.ts:615`). A mid-segment level-up silently violates that and desynchronizes pool
  integration from the stats that drove it. Level-ups have to land on segment boundaries
  like buff expiry does.
- Nice pairing worth keeping: stats grow linearly in level while level grows logarithmically
  in xp, and the Elo curve needs linear stat *gaps* to matter — so each 10-level block is a
  meaningful, roughly constant power spike rather than an inflation spiral.

## Open decisions (not blocking chunk 1)

- **In-flight swing when the rate changes.** `progress` is accumulated absolute seconds, so
  equipping a haste weapon mid-swing currently makes the current swing finish sooner
  (absolute carry). The alternative is rescaling progress to preserve the completed
  *fraction*. Absolute carry is what's already implemented — make it a stated choice rather
  than an accident, because mid-encounter rate changes are a first-class MVP feature.
- **`rate:` sugar** for `time: 60` + `speed: <stat>` — worth it, but not required to ship.
- **Whether `action.health` survives as sugar** for trivial one-hit targets, or is removed
  outright.

## Implementation order

1. **Combat core** (chunks 1–7 in the status table). Chunk 1 is pure stat math and testable
   in isolation; chunk 4 is the risky one for the associativity invariant.
2. **Skill levels + XP events** — needed for cooking, not for the rat fight.
3. **Droptables** — independent of both.
