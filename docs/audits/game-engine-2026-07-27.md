# Game Engine audit — 2026-07-27

Independent audit of repository system 3 (**Game Engine**) at `642fdd4`, covering the 11
commits since its last audit — `a444753` (DSL Pass 2: resource pools) through combat chunks
1–7 (`51ebbcf`…`642fdd4`).

Baseline at time of audit: `npx tsc --noEmit` clean, 265 tests / 18 files green.

Every finding marked **verified** was reproduced against a throwaway fixture. Findings the
combat deliverable log already tracks as deliberate deferrals (enemy pools not integrating
their rate stat, `action.health` vs `target:` as two paths, `rate:` sugar, inert equipment,
segment-granular `on empty:` for a modifier-emptied pool, unread `Skill['stat-id']`) are
**not** repeated here.

**This is a live list.** Findings are resolved out of it. What remains below is what is still
open.

---

## Resolved

Baseline after remediation: `tsc --noEmit` clean, **289 tests / 19 files** green.

| # | Finding | Commit |
| --- | --- | --- |
| C1 | A `speed:` stat reading 0 drove `state.time` to `Infinity` and NaN'd the save | `593318c` |
| C2 | `stop` in an action's own result block crashed the stochastic resolver | `9bec8e9` |
| C3 | `stop` was batched away on the deterministic path, breaking the associativity invariant | `9bec8e9` |
| C4 | No workflow ran `npm test` | `8679297` |
| M1 | Food buffs silently skipped on the live/armed path | `8b9dbc3` |
| M2 | An encounter actor's pools filled from the player-facing `start:` | `8b9dbc3` |
| M3 | `use:location.<id>.<action>` was a dead path; location actions unauthorable | `c247f43` |
| M4 | `save.ts` kept four hand-maintained lists that had to track `GameState` | `dfdb009` |
| M5 | Three independent copies of "may this action run" | `8c77b13` |
| M6 | Affordability was the same reduction written three times | `8c77b13` |
| L3 | Content references never resolved against the registry at load | `ae1588b` |
| L5 | `clampResources` could empty a pool without firing `on empty:` | `48fba00` |

Notes worth carrying forward, since they changed the shape of the answer rather than just
applying the suggested one:

- **C2/C3 were fixed as one design problem, as the audit argued they had to be.** `stop` is
  recorded on the segment (`SegmentEffects`) and honoured by whichever resolver is running;
  no data-application function writes `state.activeAction` from inside a segment any more.
  `nextBoundary` additionally treats an action that stops on its own outcome as
  non-repeating, so the segment ends at the first completion and time stops where the action
  does — without that, a batched span would run past the stop with the action's stat
  modifiers snapshotted for the whole of it. `applyFightBatch`'s count cap is the backstop.
- **C1 split in two once L3 landed.** The typo half is now a load error. The runtime guard in
  `attemptDuration` stays for the half load cannot see: a stat that IS declared but has no
  `base:`, of which the tutorial ships two.
- **M1's fix is a rule, not a patch.** Nothing that completing an action does may live in
  `useAction`, because `beginAction`'s armed path never returns through it. The food buff
  moved to the action's completion inside `resolve()`.
- **M3 was decided in the schema's favour**, per CLAUDE.md listing location actions as
  first-class. Scoping generalized (`scopeActions`) rather than being copied.
- **L3 covers more than a stat-existence check**: action stat/resource fields (reached
  through the compiled Action for recipes), a pool's `max:`/`rate:`, a location's
  `entities:`/`adjacent:`, and actor-sheet stat assignments.

---

## Open

### L1 — a hit and a miss read the target pool through different lenses

`resolveAttempt`: the hit branch tests `damagePool(...) <= EPSILON`, which returns the
*projected* level (`state.resources[r]` plus pending deltas); the miss branch tests
`poolLevel(...) <= EPSILON`, which reads `state.resources` alone and ignores everything the
segment has accrued.

For an action whose own results `drain:` the player's pool (the spec's stamina-cost case), a
retaliation's *miss* can report the pool non-empty while the projected level is already ≤ 0,
so the segment runs past the death instant and `on empty:` — and its `stop` — fire at segment
end rather than at the attempt, which is exactly the guarantee chunk 6 was built to provide.
Neither reading is test-covered. Not reproduced against a fixture; reported as a
code-consistency defect with a concrete failure mode.

### L2 — `state.log` grows without bound across a long `resolve()`

`logSwing` pushes one line per attempt with no cap. Measured on the repeating rat fight over
an 8-hour span: **11,999 lines / 384 KB**, all of which `view()` hands back in a single
`said` array. Not a save-size problem (`log` is excluded from `SaveDiff`), but memory and
driver ergonomics both suffer, and crossing a huge idle span is the stated purpose of
`resolve()`'s big-jump path. A per-resolve cap, or collapsing repeats ("You hit the Giant Rat
×143"), would cost nothing the resolver cares about.

### L4 — a `target:` action on a non-entity owner fights a phantom built from the player's sheet

**Verified.** `armAction` puts `objId` into `actors` unconditionally, and `freshActor` falls
through to the global `# stat` defaults when no `# entity` exists. An item action with
`target: health` therefore fights a "Lockpick" with **the player's** 30 max-health, narrated
as `You hit the Lockpick for 10.`

L3 closed the half where `target:` named a resource that does not exist. The other half is a
design question and is deliberately left: the generality may well be wanted (the spec's
lockpicking shape is a non-entity with a pool), but inheriting the player's maximum is not.
Deciding it means deciding whether a non-entity can carry a sheet.

### L6 — `ActiveAction.healthRemaining` is written by both paths and read by one

Read only on the non-`target:` stochastic branch and by the deterministic path that writes
it; a `target:` fight carries it in state and in every save while it means nothing. Cheap to
drop when the `action.health` / `target:` unification the deliverable log already tracks is
done — noted here so the two are resolved together.

---

## Inventory note

**Resolved in CLAUDE.md.** The system inventory listed "offline progression" under Game
Engine → Core; there is no wall-clock reconciliation anywhere in `src/game`, and the only
`Date.now()` in the repo is `play-cli`'s `--live` render loop. `resolve()` is the seam that
would support it, but the feature was never written. The line now names it as the backlog
item it is, so a future audit does not go looking for code that does not exist.
