# Game Engine audit — 2026-07-27

Independent audit of repository system 3 (**Game Engine**) at `642fdd4`, covering the 11
commits since its last audit — `a444753` (DSL Pass 2: resource pools) through combat chunks
1–7 (`51ebbcf`…`642fdd4`).

Baseline at time of audit: `npx tsc --noEmit` clean, 265 tests / 18 files green.

Every finding marked **verified** was reproduced against a throwaway fixture and the fixture
is reproduced here; none of them are inferred from reading alone. Findings the combat
deliverable log already tracks as deliberate deferrals (enemy pools not integrating their
rate stat, `action.health` vs `target:` as two paths, `rate:` sugar, inert equipment,
segment-granular `on empty:` for a modifier-emptied pool, unread `Skill['stat-id']`) are
**not** repeated here.

---

## Critical

### C1 — a `speed:` stat that reads 0 drives `state.time` to `Infinity` and NaNs the save

**Verified.**

`attemptDuration` (`src/game/contentDsl/runtime.ts:647`) is `(action.time ?? 0) / speed` with
no guard on the divisor. Two ordinary authoring situations make `speed` exactly 0:

- a typo'd stat id — `statRange` (`runtime.ts:582`) falls through `entity.stats → # stat →
  point(0)`, so an unknown stat is silently 0, not an error;
- a **declared** `# stat` with no `base:` — `statSchema`'s default is `point(0)`
  (`src/game/contentDsl/stat.ts:17`). The tutorial already ships two such stats
  (`# stat evasion`, `# stat regeneration`).

`armAction`'s only guard is `duration <= 0` (`runtime.ts:1430`), which `Infinity` passes.
`useAction` then calls `resolve(state, registry, state.time + Infinity)`; `advanceTime`
(`runtime.ts:128`) only rejects negatives, so `state.time` becomes `Infinity` and
`progress`/`attemptsMade`/`healthRemaining` become `NaN` — which serialize to `null`, so the
poison survives a save round-trip rather than failing loudly.

```
# entity shrine
chant:
  repeating
  time: 1
  speed: cooking-sped   // typo: no such stat
  give: 1 blessing
```

```
useAction('entity', 'shrine', 'chant', registry, state);
// state.time === Infinity
// state.activeAction === {"progress":null,"healthRemaining":null,"attemptsMade":null,…}
```

**Direction.** Widen the existing guard to `!Number.isFinite(duration) || duration <= 0` and
apply it in `attemptDuration`'s callers uniformly (`armAction`, `resolveDeterministicSegment`,
`resolveStochasticSegment` — the latter two already throw on `<= 0`). Better still, close it
at load: reject an action whose `speed:`/`accuracy:`/`ability:`/`dr:`/`evasion:` names a stat
with no `# stat` block (see L3), which turns the whole class into a content error.

---

## High

C2 and C3 share one root cause: **`stop` is a control-flow verb living inside a data-application
function that has both a batched form and a mid-loop caller.** Fixing either separately will
leave the other.

### C2 — `stop` in an action's own result block crashes the stochastic resolver

**Verified** — uncaught `TypeError: Cannot read properties of null (reading 'ownerRef')` out
of `resolve()`, not a `RuntimeError`.

`applyResultBatch` (`runtime.ts:758`) falls through to `applyResult` for one-shot verbs,
whose `stop` case (`runtime.ts:357`) sets `state.activeAction = null`. But
`resolveStochasticSegment` holds `active` as a local captured at `runtime.ts:1182` and keeps
mutating it after the batch (`runtime.ts:1245`–`1250`), then loops back into `participants()`,
which dereferences `state.activeAction!` (`runtime.ts:897`).

```
# entity giant-rat
stats: attack 0, dr 0, max-health 20, attack-rate 16
fight:
  repeating
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: dr
  give: 1 rat-tail
  on success:
    say: You have had enough.
    stop
```

```
armAction('entity', 'giant-rat', 'fight', registry, state);
resolve(state, registry, 300);   // throws TypeError
```

### C3 — `stop` in a result block is batched away on the deterministic path, breaking the core invariant

**Verified**: `resolve(s, 100)` yields **100** completions; the same span walked as
`resolve(s, 1) … resolve(s, 100)` yields **1**.

This is a direct violation of the invariant the combat log calls "the one invariant everything
here can break" — `resolve(resolve(s, t1), t2) === resolve(s, t2)`. `applyFightBatch`
(`runtime.ts:767`) applies N completions' worth of results and only *then* fires the one-shot
`stop`, so on a batched path `stop` cannot stop anything: the whole span has already happened.

```
# entity shrine
chant:
  repeating
  time: 1
  give: 1 blessing
  on success:
    stop
```

**Direction.** `stop` is not a result; it is a segment terminator. Either give `applyFightBatch`
a way to report "this batch must not have been a batch" (scan the outcome's result list for
`stop` first, and cap `count` at 1 when present), or lift `stop` out of `ActionResult` into a
separate control channel that the resolver reads after each *unit*, never per batch. Whichever
is chosen, `applyResult`'s `stop` case must stop writing to `state.activeAction` behind the
resolver's back — the resolver's local `active` and `state.activeAction` must not be able to
disagree.

### C4 — the invariant is enforced by a suite nothing runs automatically

`.github/workflows/publish.yml` is the only workflow. It runs `npm run build` (i.e. `tsc` +
`vite build`) on a tag push. **No workflow runs `npm test`**, and there is no push/PR
workflow at all. The 265 tests — including the associativity gate that C3 violates — are
local-only.

Combined with the finding below, this is the reason C3 could land: `stop` as an action result
is a documented grammar surface (deliverable log, "Grammar surface added here") with **zero**
test coverage outside `on empty:`. `grep stop src/game/contentDsl/*.test.ts` hits only
`stopping.test.ts`, where every occurrence is inside a `# resource`'s `on empty:` block.

---

## Medium

### M1 — food buffs are silently skipped on the live/armed path

**Verified.** `grantFoodBuff` has exactly one caller, `useAction` (`runtime.ts:1458`–`1466`).
`beginAction` (`src/game/contentDsl/session.ts:289`) arms directly whenever
`actionFirstUnit > 0`, bypassing it. A food item whose eat action carries a `time:` therefore
buffs correctly in instant mode and not at all in `--live`:

```
# item stew
food, +5 attack, 60s
eat:
  time: 3
  take: 1 stew
```

`useAction` → attack 15. `beginAction` + `wait(10)` → attack 10.

The comment at `session.ts:270`–`273` asserts the opposite ("…still go through the ordinary
instant dispatch()/apply() path unchanged — including the food-buff-on-eating side effect that
lives in useAction"). That is true only because every food in the tutorial happens to be
instant; the routing condition is `firstUnit > 0`, not "is food".

### M2 — an encounter actor's pools are filled from the player-facing `start:`

**Verified.** `freshActor` (`runtime.ts:868`) uses `resource.start ?? statValue(max, …, actorId)`.
`start` is documented in `resource.ts` as "where `current` begins on a fresh game" — a
player-lifecycle concept with no meaning for an actor stood up mid-fight. With `# resource
health` carrying `start: 5`, a rat whose sheet says `max-health 20` spawns at **5**.

Latent only because the tutorial authors no `start:`. Contrast the correct use two functions
up in `initResources` (`runtime.ts:642`). An actor should read its own max, full stop.

### M3 — `use:location.<id>.<action>` is a dead path; location actions are unauthorable

`locationSchema` (`src/game/contentDsl/location.ts:103`) declares no `entries`, and the
`Location` interface has no `actions` field — a location action is a parse error
(`unknown location field: <label>`). Yet the runtime still carries the path:

- `session.ts:126` scans `availableActions(location as unknown as Actable, state)` and emits
  `use:location.<id>.<label>` choice ids;
- `findActionOwner` (`runtime.ts:458`) still has `case 'location'`.

The `as unknown as Actable` double cast is precisely what hides the mismatch from `tsc`.
CLAUDE.md lists location actions as a first-class pattern ("location/item/entity actions
(`<obj>.<objId>.<actionId>`) are first-class patterns"; "item actions are not location-scoped,
location and entity actions are"), so either the schema lost `entries` in the rewrite or the
architecture note is stale. One of the two has to move.

### M4 — `save.ts` keeps four hand-maintained lists that must track `GameState`

`RECORD_FIELDS` (`src/game/contentDsl/save.ts:27`), `scalarFields` (`save.ts:132`), the
explicit per-field block in `diffState` (`save.ts:62`–`73`), and the explicit per-field block
in `loadSave` (`save.ts:97`–`109`). None is exhaustiveness-checked against `keyof GameState`,
so a new state field is silently absent from every save and from every `# save` comparison —
and `compareSave` would report no difference for it, which is worse than losing it.

This is the "systems required to be manually kept in sync" case CLAUDE.md prohibits.
`activeBuffs`, `resources` and `activeAction` each had to be threaded through all four by hand
across the last three passes. A `Record<keyof Omit<GameState,'log'>, 'record'|'scalar'>` map
driving all four sites would make an omission a type error.

### M5 — three independent copies of "may this action run"

| site | requires | hidden if | inputs | retaliates |
| --- | --- | --- | --- | --- |
| `armAction` (`runtime.ts:1411`–`1412`) | ✔ | ✔ | separate check below | ✘ |
| `actionStillValid` (`runtime.ts:710`) | ✔ | deliberately ✘ | ✔ | ✘ |
| `actionAvailable` (`session.ts:68`) | ✔ | ✔ | ✘ | ✔ |

`actionStillValid`'s own comment describes it as "the same gate armAction applies, minus
visibility" — but `armAction` does not call it, it re-implements it. Chunk 6 introduced the
shared predicate and then left two copies standing.

### M6 — affordability is the same reduction written three times

`armAction`'s `required` map (`runtime.ts:1418`–`1421`) and `inputLimit`'s `perCompletion` map
(`runtime.ts:721`–`724`) are the identical `for (result of action.results) if (kind === 'take')`
reduction under two names; `recipeCraftable` (`runtime.ts:1539`) is a third over `recipe.in`.
`armAction`'s version is exactly `inputLimit(action, state) < 1` plus "which item fell short",
which the shared function could return.

---

## Low

### L1 — a hit and a miss read the target pool through different lenses

`resolveAttempt`: the hit branch tests `damagePool(...) <= EPSILON` (`runtime.ts:1167`), which
returns the *projected* level `state.resources[r] + pendingDeltas`; the miss branch tests
`poolLevel(...) <= EPSILON` (`runtime.ts:1170`), which reads `state.resources` alone and
ignores everything the segment has accrued.

For an action whose own results `drain:` the player's pool (the spec's stamina-cost case), a
retaliation's *miss* can report the pool non-empty while the projected level is already ≤ 0,
so the segment runs on past the death instant and `on empty:` — and its `stop` — fire at
segment end rather than at the attempt, which is exactly the guarantee chunk 6 was built to
provide. Neither reading is test-covered. Not reproduced against a fixture; reported as a
code-consistency defect with a concrete failure mode.

### L2 — `state.log` grows without bound across a long `resolve()`

`logSwing` (`runtime.ts:972`) pushes one line per attempt with no cap. Measured on the
repeating rat fight over an 8-hour span: **11,999 lines / 384 KB**, all of which `view()`
hands back in a single `said` array (`session.ts:228`). Not a save-size problem (`log` is
excluded from `SaveDiff`), but memory and driver ergonomics both suffer, and crossing a huge
idle span is the stated purpose of `resolve()`'s big-jump path. A per-resolve cap, or
collapsing repeats ("You hit the Giant Rat ×143"), would cost nothing the resolver cares about.

### L3 — content references are never resolved against the registry at load

`loadModule` validates exactly two things beyond parsing: `retaliates` requires `target:`
(`runtime.ts:177`) and `# resource` requires `max:` (`runtime.ts:212`). Never checked:
`target:`, `dr:`, `ability:`, `accuracy:`, `evasion:`, `speed:`, `rate:`, `max:`,
`entities:`, `adjacent:`. **Verified**: `target: helth` loads clean and surfaces as
`RuntimeError: unknown resource: helth` from `requireResource` deep inside a live fight.
Stat ids are worse — they never error at all, they read 0 (see C1). A single load-time
reference pass over the registry would close C1, L3 and L4 together.

### L4 — a `target:` action on a non-entity owner fights a phantom built from the player's sheet

**Verified.** `armAction` (`runtime.ts:1437`) puts `objId` into `actors` unconditionally, and
`freshActor` falls through to the global `# stat` defaults when no `# entity` exists. An item
action with `target: health` therefore fights a "Lockpick" with **the player's** 30 max-health,
narrated as `You hit the Lockpick for 10.` The generality may well be wanted (the spec's
lockpicking shape is a non-entity with a pool), but inheriting the player's maximum is not.

### L5 — `clampResources` can empty a pool without firing `on empty:`

`clampResources` (`runtime.ts:1034`) writes `state.resources[...]` directly rather than going
through `setPoolLevel`, which `runtime.ts:802` calls "THE single seam that moves a pool's
level. Both ways a pool can move … land here, so the rollover and on-empty rules cannot drift
apart between them." There is a third way, and it has drifted: a max shrinking to 0 (an
expiring `+max` buff, a `max:` stat driven negative) silently zeroes the pool, so a `stop` in
its `on empty:` never fires.

### L6 — `ActiveAction.healthRemaining` is written by both paths and read by one

It is read only on the non-`target:` stochastic branch (`runtime.ts:1156`–`1157`) and by the
deterministic path that writes it; a `target:` fight carries it in state and in every save
while it means nothing. Cheap to drop when the `action.health` / `target:` unification the
deliverable log already tracks is done — noted here so the two are resolved together.

---

## Inventory note

CLAUDE.md lists "offline progression" under Game Engine → Core. There is no wall-clock
reconciliation anywhere in `src/game` — the only `Date.now()` in the repo is `play-cli`'s
`--live` render loop. `resolve()` is the seam that would support it, but the feature does not
exist. The system inventory should either drop the line or point at a backlog item, so a
future audit does not go looking for code that was never written.

---

## Suggested order

1. **C1** — one guard; it is the only finding that destroys a session.
2. **C2 + C3 together** — they are one design problem, and C3 is an invariant violation.
3. **C4** — a `push`/`pull_request` workflow running `npm test`; without it findings recur.
4. **M1, M2** — small, self-contained, both silently wrong today.
5. **L3** (load-time reference pass) — subsumes the residue of C1 and L4.
6. **M4, M5, M6, L5** — coherence work; no user-visible defect, direct CLAUDE.md violations.
