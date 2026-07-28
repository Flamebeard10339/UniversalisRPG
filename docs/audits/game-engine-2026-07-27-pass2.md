# Game Engine audit (pass 2) — 2026-07-27

Independent audit of repository system 3 (**Game Engine**) at `28f07e0`, covering the 8
commits since the previous audit — the remediation series `593318c`…`48fba00` — plus the
structural state of `runtime.ts` that series left behind.

Baseline: `npx tsc --noEmit` clean, **289 tests / 19 files** green.

Every finding below marked **verified** was reproduced against a throwaway fixture or a
measurement, and the fixture is described inline so it can be re-run. Findings the previous
audit already tracks as open (L1, L2, L4, L6) are **not** re-reported; all four were
re-confirmed as still open and unchanged.

---

## What the remediation series got right

Stated first because it bounds everything else: **the associativity invariant holds.** I
fuzzed `resolve(resolve(s,t₁),t₂) === resolve(s,t₂)` over the real `tutorial-island.dsl`
content with randomized split points — 200 trials against the stochastic rat fight and 200
against the repeating deterministic oven, comparing the whole of `GameState` minus `log` —
and got 400/400. The fixed-boundary cases (12 one-second splits, fractional splits landing
mid-attempt, a fight followed by a 5000 s idle span) also pass. The `SegmentEffects` design
from C2/C3 does what it claims, and a single `resolve()` across 3,000,000 s of a repeating
stochastic fight completes in 787 ms rather than hanging.

The design is sound. Findings S1–S3 are about how it is *expressed*, not whether it works.

---

## H1 — the PRNG's arithmetic silently overflows; its period is 10,466, not 2³¹

**Verified by measurement.** `runtime.ts:121`:

```ts
state.rng = (state.rng * RNG_MULTIPLIER + RNG_INCREMENT) % RNG_MODULUS;
```

`state.rng` is up to 2³¹ and `RNG_MULTIPLIER` is 1103515245 ≈ 2³⁰, so the product reaches
2.37 × 10¹⁸ — about 2⁶¹, well past `Number.MAX_SAFE_INTEGER` (2⁵³). The bottom ~8 bits are
rounded away *before* the modulus extracts the bottom 31. This is not the LCG the constants
describe; it is a different, much smaller map.

Measured directly:

| | |
| --- | --- |
| Nominal period (exact 31-bit LCG) | 2,147,483,648 |
| **Actual period** | **10,466** (after an 8,337-step tail) |
| Distinct low-8-bit values in 100k draws | 20 of 256 |
| Distinct states reachable | 10,667 — 0.0005% of the intended space |

Reachable in play, not just in theory. A repeating `target:` fight consumes ~3 draws per
attempt (hit roll, damage sample, DR sample); at the tutorial rat's 3.75 s cadence the
sequence saturates its entire reachable state space within ~40,000 s of simulated time — and
I confirmed that by grinding a repeating fight and counting distinct `state.rng` values
(10,667, then exact repetition forever). Since `rng` is a save field (`save.ts:47`), a save
taken inside the cycle carries the repetition with it.

Consequence: after roughly eleven in-game hours of combat, every hit/miss/damage pattern
replays identically. For a game whose stated purpose includes crossing huge idle spans, that
is a live defect, not a theoretical one.

The comment at `runtime.ts:107` asserts the opposite — that this seed/multiplier/increment
combination avoids degeneration. That reasoning is correct for exact integer arithmetic and
is not what runs.

**Fix is one line.** `Math.imul` gives the truncated 32-bit multiply the constants assume:

```ts
state.rng = (Math.imul(state.rng, RNG_MULTIPLIER) + RNG_INCREMENT) >>> 0;
return state.rng / 4294967296;
```

Verified to run 5,000,000 steps with no repeat. Note this **changes every existing sequence**,
so the `# save` fixtures asserting post-combat state will need regenerating — worth doing
deliberately in its own commit.

---

## M1 — reference validation closed one third of the class it claims to close

**Verified against fixtures.** `validateReferences` (`runtime.ts:164`) checks six stat/resource
fields on actions, `entity.stats` keys, `resource.max`/`rate`, and a location's
`entities:`/`adjacent:`. It does not look inside `ActionResult`s, tag clauses, or recipe
quantities. Loading a module with each bad reference in turn:

| Bad reference | Result |
| --- | --- |
| `speed:` / `target:` unknown | caught at load ✅ |
| `drain: 5 bogus-pool` | **loads clean → `unknown resource: bogus-pool` thrown mid-fight** |
| `restore: 5 bogus-pool` | loads clean → same |
| `+100% bogus-stat` (tag clause) | **loads clean → silently reads 0 forever** |
| `xp: bogus-skill 5` | loads clean → `state.xp` accrues under a skill that does not exist |
| `give: 1 bogus-item` / `take:` | loads clean → phantom inventory entry |
| `relocate: bogus-place` | loads clean → `unknown location` thrown from `view()` |
| `discover: bogus-place` | loads clean → sets `bogus-place.discovered`, no error ever |
| `recipe in:`/`out:`/`burnt:` item | loads clean |
| `recipe skill:` | loads clean |

The first two rows matter most because the L3 rationale comment (`runtime.ts:158-163`) names
exactly these two failure modes as the thing it fixed:

> "An unknown RESOURCE surfaced as `unknown resource: helth` from deep inside a live fight…
> An unknown STAT never failed at all… silently read 0."

Both are still reachable — the first through `drain:`/`restore:`, the second through a
stat-bonus tag clause. L3 closed them on the `target:`/`speed:` path only. The comment
describes the intended invariant; the code implements a subset.

`xp:` deserves separate mention: CLAUDE.md requires every skill-XP-granting moment to produce
floating text, which a nonexistent skill cannot do.

**Fix**: extend `checkAction` to walk `action.results`/`onSuccess`/`onFailure`/`onEscape` and
`action.tags`, add the same walk for `resource.onEmpty`/`onFull`, and add item/skill to
`ReferenceKind`. The dispatch already exists; it is being handed too few nodes.

---

## L1 — `actionFirstUnit`'s "same value `armAction` would compute" is not the same value

**Verified.** `actionFirstUnit` (`runtime.ts:1651`) is documented as "the same firstUnit
armAction would compute, without arming". It probes *before* `state.activeAction` is set;
`armAction` computes its own return value *after* (`runtime.ts:1639-1643`). Since `statRange`
folds the active action's own stat-bonus tags into every stat it reads, an action that
modifies its own `speed:` stat reads differently through the two paths.

Fixture: an action with `time: 8`, `speed: cooking-speed` (base 1) and a `+100% cooking-speed`
tag —

```
actionFirstUnit (probe)  = 8
armAction firstUnit      = 4   ← correct; the action halves its own duration
```

Blast radius is smaller than it looks: `beginAction` discards `armAction`'s return value and
`play-cli`'s live loop ticks until `activeAction` is null rather than to a precomputed span,
and `play-cli`'s progress-bar denominator calls the probe *while* the action is active (so it
gets 4). What is actually wrong today is the gate — `beginAction` routes instant-vs-spannable
on a value that is not the one the action will run at — plus a false comment on a function
whose whole purpose is to agree with another.

This is a recurrence of the bug class M1 fixed for food buffs: the same quantity computed at
two different moments relative to arming. The rule the previous audit drew from M1 ("nothing
that completing an action does may live in `useAction`") has a sibling this violates: *nothing
that depends on the active action may be computed before it is armed.*

---

## The structural finding: why `runtime.ts` needs 521 comments

`runtime.ts` is 29.3% comment lines (521/1781). Every other non-test file in the engine
averages 13.3% (288/2163). The gap is not that the resolver is harder; it is that the
comments are carrying load nothing else in the file carries. Six specific causes, each
suggesting its own structural fix.

### S1 — one file is eight subsystems

`runtime.ts` holds module loading and reference validation, condition/reference evaluation,
text rendering, dialogue interpretation, stat algebra, the RNG, resource-pool mechanics, the
time resolver and combat scheduler, and the action/travel/craft verb façade. The DSL layer
next door expresses comparable complexity in 24 files averaging 60 lines. A large share of
runtime.ts's comments are section headers and orientation notes — work that a file name does
for free.

Note also an architecture-boundary point independent of comments: `loadModule` and
`validateReferences` are **content-pipeline** concerns (system 1), not game-engine concerns,
and they sit at the top of the engine's core file.

### S2 — the associativity invariant has no home

`resolve(resolve(s,t₁),t₂) === resolve(s,t₂)` is the file's central law. The word
"associative" appears in **10 comments across 8 functions** — `sampleStat`, `applyFightBatch`,
`PoolDeltas`, `settlePools`, `participants`, `resolveAttempt`, `damagePool`, `resolve` — and
is enforced by none of them. It is proven only in `resolve.test.ts`.

That is the mechanism behind the comment volume: each of those eight functions is individually
responsible for a property that no seam owns, so each must carry a paragraph explaining how it
could break it. The comments *are* the enforcement mechanism. This is also the one invariant
where prose is genuinely load-bearing, which is why it reads as the most justified — and it is
still the wrong place for it.

### S3 — five result-application functions enumerate a 2×2 by hand

`applyResult`, `applyResultBatch`, `applyFightBatch`, `applyResultNow`, `applyFightBatchNow`.
The real distinction is two independent questions: *one result or a fight's outcome?* and *am
I inside a resolver segment or outside one?* Nothing in the type signatures answers the
second, so each function needs prose telling the reader which quadrant it occupies and what
breaks if the wrong one is called — and `SegmentEffects` carries a ten-line postmortem
(`runtime.ts:964-973`) standing in for a type that would have made the bug unrepresentable.

If applying results *required* a segment context, picking the wrong one would be a type error
and four of the five functions plus their paragraphs would collapse into one.

### S4 — "end the action" is nine assignments

`state.activeAction = null` appears at nine sites in `runtime.ts` (`420, 1290, 1362, 1426,
1437, 1494, 1508`, plus `1177, 1184`) and once more in `session.ts:410`. Both resolvers hold
the same object in a local named `active` while other code nulls the global. That aliasing
hazard is precisely what `SegmentEffects.stopped` exists to manage and what its comment
explains at length. A single `endAction(state)` — or an explicit resolver return value —
removes the hazard and the paragraph together.

### S5 — an asymmetric data shape needs prose to be readable

`ActiveAction extends Cadence`, so the player's clock is inlined on the encounter while every
other combatant's lives at `actors[id].cadence`. The 10-line comment at `runtime.ts:23-32`
exists only to explain that asymmetry, and `participants()` exists to paper over it at read
time — its own comment says so: *"the resolver builds a uniform participant list over both, so
the storage asymmetry never reaches the scheduling logic."* A function whose stated job is to
hide a storage decision from the rest of the file is a storage decision worth changing. Make
`PLAYER` an ordinary key in the participant map and both the comment and the adapter go away.

### S6 — some comments are enforcement by vigilance

`setPoolLevel`'s "THE single seam that moves a pool's level" and `clampResources`'s postmortem
("Writing `state.resources` directly made this a THIRD way… and the rules had duly drifted")
are invariants held by discipline. I checked: the invariant currently holds — the only writes
are inside `setPoolLevel` and `initResources`. It holds *because someone is watching*, which
is exactly why it has to shout. A `Pools` module owning `state.resources` with `setPoolLevel`
private makes the comment unnecessary and the drift impossible.

### The drift has already happened

The user's concern that these comments would diverge from the code is not hypothetical. I
fact-checked the three load-bearing claims that this audit's other findings touched. **All
three were false:**

| Comment | Claim | Reality |
| --- | --- | --- |
| `runtime.ts:107` | the LCG "avoids degeneration" | period 10,466 (H1) |
| `runtime.ts:158-163` | both typo failure modes "closed at the source" | both still reachable (M1) |
| `runtime.ts:1646-1650` | probe computes "the same firstUnit `armAction` would" | 8 vs 4 (L1) |

Three for three is a sample, not a survey — but it is a sample chosen by "which comments does
this audit happen to touch", not by "which comments look suspicious", and that makes the hit
rate meaningful. A reader trusting these paragraphs is worse off than a reader who read only
the code, because the paragraphs are confident and specific about properties the code does not
have.

---

## Recommended restructure

Not a rewrite — the logic is correct and fuzz-verified. A decomposition that gives each
homeless invariant a home. Staged so each step is independently shippable and testable:

| Stage | Move | Kills |
| --- | --- | --- |
| 1 | `registry.ts` ← `loadModule`, `validateReferences` (+ the M1 fix) | S1, boundary violation |
| 2 | `rng.ts` ← the LCG (+ the H1 fix) | H1 |
| 3 | `pools.ts` ← `state.resources` behind a module; `setPoolLevel` private | S6 |
| 4 | `endAction()` as the one way an action ends | S4 |
| 5 | `Segment` as a type; one `applyResults(segment, …)` | S2, S3 |
| 6 | `encounter.ts`; player becomes an ordinary participant | S5 |
| 7 | `dialogue-runtime.ts`, `conditions.ts`, `stats.ts` split out | S1 |

Stages 1–2 are small and carry the two substantive bugs; they are worth doing regardless of
whether the rest is taken. Stages 5–6 are where the comment count actually falls, and they are
the ones that need a design decision first.

**On the comments themselves:** the ones worth keeping after this are the ones that record a
*decision*, not a *mechanism* — why `hidden if:` is deliberately excluded from
`actionStillValid`, why an enemy must not borrow the player's `on empty:` voice, why a stat is
never readable as a raw probability. Those are genuinely not derivable from the code. The
paragraphs explaining how batching stays associative should become a type, and the ones
explaining which of five apply-functions to call should become a signature.
