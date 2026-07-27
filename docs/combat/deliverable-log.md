# Combat — branch deliverable log

Live working document for the combat feature. Spec, deliverables, progress and open
decisions live here so any session can resume without replaying the planning conversation.
Lifted from `backlog.md > dsl-rewrite-carryover > Engine` on 2026-07-27; on merge, archive
this file and lift anything unfinished back into `backlog.md`.

**Read this before touching combat code.** `backlog.md` carries only a pointer.

## Status

| Chunk | State |
| --- | --- |
| 1. Ranged stats + `dr` | done — stat layer live, `hitDamage` staged for chunk 2 |
| 2. Direct pool write | done — `drain:` / `restore:` results |
| 3. Encounter state / second actor | done — enemy has a sheet and takes real damage |
| 4. Per-actor cadences in the resolver | done — the rat swings back on its own clock |
| 5. Opposed roll (Elo) | done — one contest behind every chance in the game |
| 6. Stop-when-start-conditions-fail | done — `stop` result + re-checked `requires:` |
| 7. CLI readouts | done — and the tutorial rat is a real fight |
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

**Settled while building chunk 1** (`range.ts`, `statRange`/`statValue`/`sampleStat`):

- **Reading a stat and rolling a stat are separate calls.** `statValue` keeps its signature
  and returns the interval's **midpoint** — its expected value, bit-identical to the old
  result for any unranged stat — so pool maxima, rates and attempt durations can never
  jitter or consume randomness. `sampleStat` is the explicit per-attempt roll. A literal
  "every read samples" would have put draws inside `attemptDuration` and `captureResourceRates`,
  which the batching paths call at planning time; the draw count would then stop being a
  function of state and the associativity invariant would break silently.
- **One draw per sampled stat, not one per contributing source.** Intervals are summed
  endpoint-wise first and sampled once, exactly as the formula is written. `sampleStat`
  draws when the summed interval is non-degenerate and not at all when it isn't.
- **`+6-3 attack` and `+3-6% attack` are parse errors**, and the leading sign covers both
  bounds, so `-3-6 dr` means −6…−3.

Still open for chunk 2/3: sampled damage cannot use the closed-form batch path
(`applyFightBatch`), so an action whose `ability`/`dr` is ranged has to route to the
attempt-by-attempt resolver the way an `accuracy` action does. Route on something that
cannot flip mid-fight — the deterministic path recomputes `healthRemaining` from
`attemptsMade × ability`, which would clobber accumulated random damage if a fight switched
paths partway through.

### Defense — flat damage reduction, named `dr`

An ordinary stat under the rule above, subtracted from the incoming hit. No special
mitigation math, no EHP framing:

```
damage = max(minDamage, trunc(statValue(attack) − statValue(dr)))
```

`+10% dr` with no added dr does exactly nothing (`0 × 1.1 = 0`); `+0-10 dr` with `+10% dr`
reduces the hit by `0` to `11`. Damage truncates to int.

**Built in chunk 1** as `hitDamage(attack, dr, registry)` (`runtime.ts`), with the floor
authored as `# variable min-damage` (engine default 1, held at ≥ 1 whatever content says).
It has no caller yet on purpose — the hit it applies lands on a pool, which is chunk 2.

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

**Built in chunk 5** as `hitChance(accuracy, evasion, registry)`, the one roll behind every
contested outcome. `contest.test.ts` covers the curve and the perspective.

- **The flat reading of `accuracy:` is gone, not kept alongside.** `accuracy:` is now the
  attacker's skill stat and `evasion:` the stat on the target opposed to it — exactly the
  `dr:` pattern, read off `other` rather than `self`. There is therefore only *one*
  derivation of a hit chance and nothing for the engine to switch on. This cost no content
  churn at all: the tutorial authors no `accuracy:` anywhere, and only two test fixtures
  read a stat as a probability (`cook-success 0.7`, `kiln-accuracy 0.6`). Both became honest
  skill/difficulty pairs (`cooking 100` vs `shrimp-complexity 60` ⇒ 0.7153).
- **Absent `evasion:` is evasion 0**, not a second code path — an unopposed target, decided
  by the attacker's skill against nothing.
- **`# variable contest-spread`** (default 100) gives the spec's anchors exactly: equal
  stats 0.5, +100 → 0.909, +200 → 0.990. It divides the gap, so a non-positive authored
  value is rejected at load rather than producing a NaN threshold deep in the resolver. An
  *absent* value still means "engine default", per the DSL's empty==absent rule.
- **Recipes gained `evasion:` too**, forwarded by `recipeAction` to the same action field, so
  cooking-vs-dish-complexity is expressible now rather than waiting on the skill system. A
  recipe isn't an entity, so its `evasion:` stat falls through to the global `# stat`
  default — the same fall-through the player relies on.
- **The roll costs exactly zero new RNG**, as predicted. Both sides are read with
  `statValue`, never `sampleStat`, so the draw count per attempt is unchanged and the one
  uniform already drawn simply gets a derived threshold. Pinned by a test that replays the
  LCG 2000 times by hand and matches `state.rng` exactly. Sampling the stats instead would
  put a range roll and the contest roll inside one decision — two sources of variance for
  one outcome.

**One thing the curve does not actually do:** it is asymptotic in exact arithmetic but not in
a double. Past roughly ±16 spreads the near side rounds to exactly 1, so "never certain" is
false as written. Pinned rather than guarded against — a 16-spread gap is a 1-in-10^16
outcome, and the resolver draws from `[0, 1)`, so "always hits" is the correct reading.

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

**Built in chunk 4.** The acceptance case runs: 2.4s player against a 3.75s rat, and a
`+25% attack-rate` buff mid-fight taking the player to 1.92s.

- **A retaliation is one of the entity's own actions, tagged `retaliates`** — the existing
  bare-flag lift (`BOOLEAN_ACTION_FLAGS`), so no new grammar mechanism. It is filtered out of
  the player's choice list and run by the resolver on its owner's clock. The action shape is
  identical in both directions; only the perspective flips: `speed`/`ability`/`accuracy` read
  whoever is swinging, `target`/`dr` read whoever is being hit. Load rejects a `retaliates`
  action with no `target:`.
- **Attack rate needed no new duration axis**, as the spec predicted: `time: 60` plus
  `speed:` on a per-minute rate stat already means attempts-per-minute, and the `+25%` is the
  ordinary `increased` channel.
- **The per-attempt resolver is now an event queue.** It jumps to whichever attempt lands
  soonest, credits that span to *every* participant's progress, and resolves only the one
  that came due. Ties fall to a fixed roster order (player first, then actors in arm order),
  compared with an EPSILON margin — 2.4 and 3.75 genuinely collide at t=60, and float noise
  must not be what decides who swings first.
- **Storage stays asymmetric on purpose.** The player's cadence remains
  `ActiveAction.progress`/`attemptsMade`; an actor's lives in `ActorState.cadence`. The
  resolver builds a uniform `Participant[]` over both, so the asymmetry never reaches the
  scheduling logic, and the closed-form path — one swinger, no encounter — is untouched.
- **The player's damage goes through the segment's `PoolDeltas`, not a direct write**, because
  the player's health is also being integrated by its rate stat over that same segment; that
  is precisely the collision chunk 2 had to fix. An enemy's pool has no rate to collide with
  and the completion check must read it back immediately, so that one is written directly.
- **The fight's outcome is still the player's action's.** Its results, `escapeAfter` and
  `repeating` own the fight; a retaliation is a damage source. A fresh target stands up with
  pools refilled *and its clock restarted*, so it never inherits the dead one's half-swing.

**The invariant did break, loudly, and is fixed.** Progress accrues across arbitrarily many
segments, so a participant that has been idle for many splits can land a hair past its own
duration — `state.time + (duration - progress)` then computes an instant in the *past* and
`advanceTime` threw on `-1.1e-13`. An overdue swing is now floored at "now". Verified over
2000 random split patterns (horizon 1000s, up to 13 splits each, collision instants forced
in): zero mismatches on time, rng, attempt counts and inventory, and zero float drift on
progress or pool levels.

**In-flight rate change: absolute carry**, now a stated choice rather than an accident.
`progress` is elapsed seconds, so a 2.4s swing 1.2s in that speeds up to 1.92s has **0.72s**
left — not 0.96s (preserving the completed fraction) and not 1.2s (a fixed deadline). All
three are pinned by tests. Removes that entry from Open decisions below.
4. **This is a save-format change.** `activeAction` is persisted as a deep-diffed scalar
   field (`save.ts:67`/`104`/`128`), so encounter state serializes for free once it lives
   there — but its *shape* changes, which means bumping `SAVE_VERSION` (it fails loudly on
   mismatch by design).

**Built in chunk 3** — points 1, 2 and 4. Point 3 (per-actor cadences) is chunk 4.

- **An actor sheet is `stats:` on `# entity`** — `stats: attack 4-7, dr 2, max-health 20`,
  an *assignment* rather than the `+4-7 attack` bonus tag clauses carry. An actor states
  what its stat IS; a bonus states how much something shifts it. Anything an entity doesn't
  name falls through to the global `# stat` default, which is exactly how the player — who
  names nothing, and has no `# entity` — goes on working untouched.
- **`statRange`/`statValue`/`sampleStat` take a trailing `actorId`, defaulting to `PLAYER`**,
  so no existing call site moved. Buffs and the running action's stat-bonus tags apply to
  the player only: they are food the player ate and the action the player is performing.
- **Actor pools live on `ActiveAction.actors`**, keyed by entity id, filled at arm time from
  that actor's own stats. They are scoped to the fight and vanish with it; the player's pools
  stay in `state.resources` and persist. `SAVE_VERSION` → 3.
- **`target:` + `dr:` on an action** make it a real fight: `target:` names the pool on the
  fought entity that a hit drains, `dr:` the stat on that entity subtracted from the hit.
  Damage is `hitDamage(sampleStat(ability, player), sampleStat(dr, target))` — chunk 1's
  function, now with a caller. The fight ends when the pool reaches 0.
- **Routing is authored, never derived.** `resolvesPerAttempt(action)` is
  `accuracy !== undefined || target !== undefined` — both authored fields, so it cannot flip
  partway through a fight and strand a batch planned under the other reading. This was the
  open risk chunk 1 flagged, and naming `target:` settles it: sampled damage has no closed
  form, so a `target:` action always resolves attempt-by-attempt. `action.health` and the old
  closed-form path are untouched for everything else (cooking, chopping, travel).
- **An actor's pool write does not run the resource's `on empty`/`on full` blocks.** Those
  are authored from the player's point of view ("You slump to the floor"); firing them for a
  felled enemy would put the player's words in its mouth. An enemy reaching 0 is expressed by
  the fight completing and its `on success:` running.

Known gaps left for chunk 4, where the resolver becomes actor-aware anyway:

- **Enemy pools do not integrate their rate stat.** `captureResourceRates`/`settlePools`/
  `clampResources` are player-scoped, so a regenerating enemy is not yet expressible.
- **`action.health` and `target:` are two code paths**, which the consolidation section says
  they should not be. Unifying them means every action carrying an implicit pool; deferred
  rather than half-done.
- ~~**Tutorial content is deliberately untouched.**~~ DONE in chunk 7, which is when the
  sheet was complete — the Miki-route assertions moved exactly once, as intended.

### Encounters end when their start conditions stop holding

Out of bait stops fishing, out of health stops fighting (with optional lose-inventory /
teleport-to-spawn behavior). This **generalizes machinery that already exists** rather than
adding any: `inputLimit(action, state) <= 0` already clears `state.activeAction` at
`runtime.ts:776`/`867`. Widen that one check to re-evaluate the action's full start
condition (inputs *and* `requires:` *and* actor health > 0) each attempt.

**Built in chunk 6** as two independent mechanisms, because the spec's one sentence is
actually two different questions. `stopping.test.ts` covers both.

- **`requires:` is re-checked, not trusted for the action's life.** `actionStillValid` is the
  shared predicate behind every clear site — the same gate `armAction` applies, minus
  visibility — and it now runs per attempt on the stochastic path and at every boundary on
  the deterministic one. Previously only `inputLimit` was re-checked, and only for a
  repeating action.
- **`hidden if:` is deliberately excluded.** It decides whether an action is *offered*,
  which is why `armAction` refuses to start a hidden one; an action already under way is a
  different question, and the tutorial's rat fight (`hidden if: rats-killed >= 3`) must not
  abort mid-swing because the third kill made the option disappear from the list.
- **Running out of a pool could not go in that predicate**, and this is the real finding:
  `health` is a name *content* chose. An engine that stops a fight when "health" empties has
  invented a privileged resource and a second place the DSL and the runtime must agree. So
  the answer is a **`stop` action result** — content declares which pool is fatal by putting
  `stop` in that resource's `on empty:` block, and the spec's "optional lose-inventory /
  teleport-to-spawn behavior" is then just `take:`/`relocate:` sitting beside it, needing
  nothing new at all. The tutorial's `# resource health` now carries it.
- **A retaliation that empties a pool ends the segment on the spot.** Without this the whole
  feature would be dead on arrival: a stochastic segment has no closed-form boundary, so the
  player's damage sits in `PoolDeltas` until the span ends — `resolve(state, 300)` would
  black the player out at t=300 having swung for 300s. Ending the segment at the emptying
  attempt makes `on empty:` fire at the instant it happened. The deterministic path already
  had this for free, since `nextBoundary` lands a segment on a draining pool's zero.
- **`applyDueBoundaries` now fires at the instant the segment actually reached**, not the one
  it aimed at. A pre-existing latent bug that the second early-return path made reachable:
  `resolve()` passed `segEnd` while a segment that stopped short left `state.time` behind it,
  expiring buffs that still had time on them.

Gated by an associativity case pinning death at the same instant across four split patterns,
and by a control fixture with no `stop`: there, the player keeps swinging at 0 health and
fells the rat at 240s. Stopping is authored, and the test proves the engine isn't imposing it.

### Pools need a direct write

Pass 2's stated invariant is that pools move *only* via their rate stat (`grammar.md`:
"nothing writes a pool level directly"), which is why the placeholder rat fight uses a
`-120 regeneration` tag. A discrete 4-7 damage hit is not a rate. Combat needs a result kind
applying an instantaneous pool delta — the one real architectural change in this feature.

**Pools stay float and only damage truncates**: an int pool would round a low regeneration
rate to zero every tick and never recover at all.

**Built in chunk 2** as the `drain:` / `restore:` results (`actionResult.ts`), parsed into
one signed `{ kind: 'pool', resource, delta }` — mirroring how a pool's rate is already one
signed stat rather than separate regen and drain. The amount is written unsigned and the
verb carries the direction, so a pool can never be drained by a negative restore.

**This overturns grammar.md's "nothing writes a pool level directly"** (line ~418), which
now needs rewording — user owns that file.

Two things the build turned up that the spec did not anticipate:

- **Applying a result now needs the registry.** A pool write reads the resource's live max
  and its `on empty`/`on full` blocks, so `applyResult`/`applyResultBatch` and the dialogue
  path (`runSteps`/`enterNode`/`choose`) all take a `Registry`. `choose(text, session,
  registry, state)` is the only exported signature that moved.
- **Clamping per write is not associative, and it silently broke the core invariant.**
  A pool that is drained per completion *and* regenerating moves in both directions inside
  one segment; writing each drain immediately floors the pool at 0 and then lets the rate
  refill it. Measured on a 25s span (start 30, +1/s regen, 2 drained per second): one jump
  gave 25, the same span split in two gave 10. The fix is that a segment accumulates its
  discrete deltas (`PoolDeltas`) and settles each pool **once**, summing deltas with the
  integrated rate before a single clamp — 5 either way. `settlePools` iterates the registry
  rather than the delta map so the order pools settle in, and therefore the order their
  handlers fire in, cannot depend on where the span was split. Results firing outside a
  segment (dialogue, instant actions, boundaries, rollover handlers) settle on the spot via
  `applyResultNow`/`applyFightBatchNow`.

Gated by `resolve.test.ts`'s new "direct pool writes stay associative alongside a rate"
describe, on both the deterministic and the stochastic path; the two pre-existing
associativity tests now assert `resources` as well, which they never did.

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

**Built in chunk 7**, and with it **the deliverable itself**: the tutorial rat is a real
fight. Driven through `play-cli` end to end, a rat now reads:

```
You hit the Giant Rat for 10.
Health: █████████░ 27/30
Giant Rat: █████░░░░░ 10/20
Your swing ▇   Giant Rat ▂
```

- **`encounterView(state, registry)`** is the read-only twin of `participants()` — the fight
  in flight as a driver needs to draw it, derived on the spot from the encounter and the
  actors' sheets. Nothing is stored for the sake of being shown, so a driver that never calls
  it costs nothing, and there is no display state to keep in sync with the resolver.
- **The cadence fraction is what `display: minimal` was waiting for.** A cadence is already a
  fraction, so the existing 8-stage glyph renderer takes it against a max of 1 — no second
  meter renderer, and the Pass-2 leftover closes without new machinery.
- **Per-hit lines are engine-emitted** (`logSwing`), following `armAction`'s "You don't have
  enough X." precedent. Only a `target:` action narrates — a craft attempt is not a swing at
  anything. Misses are narrated too: with the Elo roll live, a swing that silently vanishes
  reads as a bug.
- **`liveTick`'s TODO(resource-bars) is closed.** It asked for "every combatant's resource
  bars … deferred until the Pass-2 resource-pool engine lands", which it now has. Live mode
  shows both sides' pools on its one redrawn line; the full-width bars live in the
  turn-by-turn view.

**The rat's sheet, at last** — `stats: attack 8, defense 0, max-health 20, attack-rate 16,
accuracy 60, evasion 40`, with `fight` and `bite` as the same action seen from either end.
Two hits at ~80% puts one down in about six seconds and it lands a bite or two on the way
out. Three things worth recording about the conversion:

- **The `-120 regeneration` hack is gone.** That tag existed only because nothing could write
  a pool directly; real damage replaces it, which is what the Pass-2 invariant note predicted.
- **`dr:` points at a stat called `defense`.** The engine field and the stat id are different
  things, so the player-facing name survives without duplicating the concept.
- **`accuracy: accuracy` / `evasion: evasion` is deliberate, not a tautology.** Both sides use
  the *same* stat id and it resolves against a different actor each way — that is exactly what
  makes one action shape serve both directions.
- **One `use:` is now one swing, not one kill**, since a stochastic fight's first unit is a
  single attempt. The tutorial `# test` and `session.test.ts` drive `use:` + `wait:` instead.

## Audit findings — CLEARED

`docs/audits/game-engine-2026-07-27.md` audits the Game Engine across the 11 commits from
Pass 2 through chunk 7. It is a live list: work items are resolved out of it, not out of this
log. **Its whole suggested order (1–6) is done** — `593318c`…`48fba00`, twelve findings
including all four criticals; only L1, L2, L4 and L6 remain there, none of them blocking.
Suite: 289 tests / 19 files.

Two of them mattered to this file specifically:

- **C2/C3 was a live violation of "the one invariant everything here can break".** `stop`
  authored as an *action result* — as opposed to inside `on empty:`, which is all that was
  ever tested — crashed the per-attempt resolver and was batched away on the deterministic
  one, where `resolve(s, 100)` gave 100 completions against 100 stepped calls' 1. `stop` is
  now recorded on the segment and honoured by the resolver, never written into
  `state.activeAction` from inside a data-application function, and `nextBoundary` lands the
  segment on the stopping completion so time stops where the action does. Four cases in
  `stopping.test.ts` gate it, two of them associativity.
- **C1's other half is still a runtime guard.** A typo'd stat id is now a load error
  (`validateReferences`), but a stat that is *declared* with no `base:` reads 0 legitimately,
  and the tutorial ships two. `attemptDuration` rejects the resulting infinite duration.

Also worth knowing before the next chunk, since both change what the authoring surface
affords:

- **Every id a section uses to name another is resolved at load.** A misspelled `target:`,
  `dr:`, `ability:`, `accuracy:`, `evasion:`, `speed:`, a pool's `max:`/`rate:`, a location's
  `entities:`/`adjacent:`, and an actor sheet's stat keys all fail at load naming the section
  and field. New combat grammar should extend `validateReferences` rather than trusting a
  fall-through.
- **An actor's pools fill from its own max, never from `# resource start:`** (M2), and
  **completing an action, not `useAction`, is where per-completion side effects belong**
  (M1) — the armed path never returns through `useAction`.

## What is left when chunks 1–7 are done

The combat core ships. Still open, and all of it was deferred deliberately rather than missed:

- **Enemy pools do not integrate their rate stat** — `captureResourceRates`/`settlePools` are
  player-scoped, so a regenerating enemy isn't expressible yet.
- **`action.health` and `target:` remain two code paths**, which the consolidation section
  says they shouldn't be. Unifying them means every action carrying an implicit pool.
- **`rate:` sugar** for `time: 60` + `speed:`. Authoring a literal `time: 60` to mean "per
  minute" is folklore, and the tutorial now has four actions carrying it.
- **Equipment is inert.** `iron-sword`'s `+2 attack` and `wooden-shield`'s `+2 defense` are
  parsed and ignored — only `food` tags become buffs (`grantFoodBuff`). The tutorial hands the
  player both and neither does anything, which is now visible in a way it wasn't before, since
  the numbers are on screen. The stat channels are all there; what's missing is an equip verb.
- **A stochastic fight's `on empty:` is still segment-granular in one case**: a pool emptied by
  a *modifier* rather than by a hit. A hit is now exact (chunk 6 ends the segment on it).
- The two separable companions below.

## Design feedback from the chunk-7 playthrough

Raised by the user after driving the finished rat fight. None of it is a defect in what
chunks 1–7 shipped; all of it is authoring-surface and scope work that the finished fight made
visible. Recorded here so the next pass starts from it rather than rediscovering it.

### F1 — every enemy re-authors the same six clauses

The rat's `fight` and `bite` differ only in the `retaliates` tag, and `cadence.test.ts`'s
punchbag repeats the same block a third time. The ask is a template — an action *kind* an
entity names, rather than clauses each entity copies:

```dsl
# entitytype basic-enemy
fight:
  repeating
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: dr
retaliation:
  retaliates
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: dr

# entity giant-rat
type enemy:
  stats: attack 4, dr 2, max-health 1000, attack-rate 16
  give: 1 rat-tail

# entity punchingbag
type enemy:
  stats: max-health 24, dr 0
```

The point is blast radius: with two dozen enemies authored by copy, changing how enemies work
means crawling every `.dsl`, and one enemy that fights subtly wrong — or one cooking recipe
unlike all the others — is a bug nothing catches.

Three engine facts that constrain the design, none of them blocking:

- **The precedent already exists.** `recipeAction` (`runtime.ts:1506`) compiles a non-action
  section into an `Action` at load, once, and stashes it in `registry.recipeActions`. A
  `# entitytype` compiles the same way — at load, into each entity's own `actions` array —
  so this needs no new resolver concept and no runtime indirection.
- **The compiled actions must be per-entity copies, never shared references.** `scopeEntity`
  (`scope.ts:38`) mutates `action.requires`/`results` in place to prefix the owning entity's
  id. One template `Action` object reachable from two entities would be scoped twice and bind
  to the wrong one.
- **A templated action still has to be findable by label.** `findActiveAction` resolves an
  in-flight action by `ownerRef` + `actionLabel` against the owner's `actions` array, so the
  template's `fight:` / `retaliation:` names have to survive into that array as stable labels.
  The sketch already does this; it is a constraint on any alternative shape.

The open question the sketch surfaces and does not answer: **what does an override attach
to?** `stats:` belongs to the entity, but `give: 1 rat-tail` is a result on `fight` — so the
body of `type enemy:` is addressing two different scopes at once. Settling that (per-action
override blocks? results merged into a named template action?) is the actual design work.
(Transcription detail: the sketch declares `# entitytype basic-enemy` and then references
`type enemy:`; the names need to agree.)

### F2 — `time:` has drifted, and the three-way taxonomy it should express

The user's report: *"my understanding of what time is in relation to actions has drifted. I
don't understand what `time: 60` is supposed to refer to in `cadence.test.ts`."* That is a
correct reading of a real inconsistency, and it has a precise location.

`time:` is **seconds per attempt**, divided by `speed:` (`attemptDuration`, `runtime.ts:647`).
One unit of an action lasts `attemptsToResolve × duration`, where `attemptsToResolve` is
`min(ceil(health / ability), escapeAfter)`. With the defaults — `health` 1, `ability` 1 — that
is exactly **one** attempt, so for every ordinary action `time:` *is* the whole duration, and
reads naturally as one. The moment an action becomes multi-attempt (`health:` or `target:`),
`time:` silently stops meaning "how long this takes" and becomes "60, chosen so the `speed:`
stat reads as per-minute". Same field, two meanings, no marker at the seam. The `rate:` sugar
already in Open decisions is a partial answer; it renames the folklore without settling the
axis underneath.

The three kinds the user wants to author, and how each is expressed today:

| kind | example | today | exit |
| --- | --- | --- | --- |
| instant | dialogue, equipping, eating | no `time:` | n/a |
| duration | travel, cooking a shrimp | `time:`, no `repeating` | completion |
| infinite | combat | `repeating` | `stop` / `requires:` false / inputs exhausted / `escape after` |

So all three exist — but the axis is implicit and split across two unrelated fields. `repeating`
is a bare tag whose name says "loops", not "runs until an exit condition fires", and
`beginAction` routes instant-vs-spannable on `firstUnit > 0` rather than on anything authored.
Worth noting: `escape after` is authorable and **no content uses it**, so the one exit
condition that is explicit today is also the one that has never been exercised outside tests.
A named kind per row — which is what "interaction kinds are named by the content" already
argues for elsewhere in this log — would make the taxonomy the authored thing and `time:`
unambiguous within each.

### F3 — a second `retaliates` action is silently dead content

**Answered, and it is the unhelpful answer.** `retaliationOf` (`runtime.ts:907`) is
`entity.actions.find(a => a.retaliates)` — first in authoring order wins. `freshActor`
allocates exactly one `cadence`, and `participants()` pushes exactly one entry per actor, so
every later `retaliates` action is unreachable. Load raises nothing.

Verified: a boss authored with `claw` and `tail-sweep`, both at 60/min, swings **5** times in
5 seconds, not 10. `tail-sweep` never fires.

The user's instinct that a spell rotation is out of scope for this pass is right — but the
current behaviour is the worst of the three options, because it fails silently. The cheap fix
is to reject a second `retaliates` action at load, beside the existing "retaliation requires a
`target:`" check (`runtime.ts:177`), which costs nothing and reserves the grammar. Multiple
cadences per actor are then a later, deliberate change rather than something an author
discovers by noticing their boss hits at half speed.

### F4 — equipment is inert

Already recorded above under "What is left when chunks 1–7 are done"; not duplicated here.
Worth reading alongside F1, since both are authoring-surface work that chunk 7's on-screen
numbers made visible.

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

## Grammar surface added here

`grammar.md` is user-owned, so these are recorded rather than documented in place; they
belong under the existing "grammar.md update (STALE)" backlog item.

- `# stat` — `base:` accepts `4-7` as well as `5` (both bounds may be negative or
  fractional: `-7--4`, `0.5-1.5`).
- Tag clauses — `+3-6 attack` / `-3-6 dr` alongside `+3 attack`. Percent bonuses stay
  rangeless, and a descending range is an error.
- `# variable min-damage` — the floor on a landed hit (default 1, never below 1).
- Action results — `drain: <n> <resource-id>` and `restore: <n> <resource-id>`, valid
  anywhere a result fires. The amount is an unsigned decimal (pools are float).
- The `# resource` prose stating that nothing writes a pool level directly is now wrong.
- `# entity` — `stats: <stat-id> <range>, ...`, this actor's own bases.
- Actions — `target: <resource-id>` (the pool on the fought entity a hit drains) and
  `dr: <stat-id>` (the stat on that entity subtracted from each hit).
- Actions — a `retaliates` bare tag, alongside `repeating`: the owner's own move in a fight,
  kept out of the player's choice list and run on the owner's cadence. Requires `target:`.
- Attack rate is authored as `time: 60` + `speed: <per-minute rate stat>`; no new field.
- Actions — `evasion: <stat-id>`, the stat on the target opposed to `accuracy:`. `accuracy:`
  itself changed meaning: it is the attacker's skill stat, never a probability.
- `# recipe` — `evasion: <stat-id>`, the dish's difficulty, forwarded to the action field.
- `# variable contest-spread` — the stat gap worth ~91% in the opposed roll (default 100,
  must be positive).
- Action results — a bare `stop`, abandoning whatever action is in flight. Valid anywhere a
  result fires; its home is a `# resource`'s `on empty:` block, which is how content declares
  a pool fatal. In an action's *own* results it ends that action at its first completion, so
  a repeating action carrying one runs exactly once.
- `# location` — actions, the same `<label>:` block entities carry, reached as
  `use:location.<id>.<label>`. Bare references inside one scope to the location, exactly as
  an entity's scope to the entity. (Reinstated in the schema; the runtime path was always
  there.)
- Every id naming another section is checked at load, so a misspelling is a content error
  where it is written rather than a silent 0 or a `RuntimeError` mid-fight.

## Open decisions (not blocking chunk 1)

- ~~**In-flight swing when the rate changes.**~~ SETTLED in chunk 4: absolute carry, chosen
  deliberately and pinned by tests against both alternatives.
- **`rate:` sugar** for `time: 60` + `speed: <stat>` — worth it, but not required to ship.
  Still opaque without it: `time: 60` meaning "per minute" is authoring folklore.
- **Whether `action.health` survives as sugar** for trivial one-hit targets, or is removed
  outright.

## Implementation order

1. **Combat core** (chunks 1–7 in the status table). Chunk 1 is pure stat math and testable
   in isolation; chunk 4 is the risky one for the associativity invariant.
2. **Skill levels + XP events** — needed for cooking, not for the rat fight.
3. **Droptables** — independent of both.
