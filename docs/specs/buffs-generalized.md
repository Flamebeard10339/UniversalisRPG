# buffs-generalized

## Deliverable

One buff mechanism, owned by one module, held by any actor. Today there is no such module: an
`ActiveBuff` is written only by `grantFoodBuff`, keyed by the string `<itemId>:<statId>`, and that
key format is parsed back apart in `save.ts` to decide what to prune — two modules agreeing by hand
on a string. The deeper problem is in `statRange`, where the entire modifier fold sits inside
`if (actorId === PLAYER)`: timed buffs, equipped items and the active action's tags are all read for
the player and for nobody else, so a non-player actor has its base stat and nothing more. Stacking
does not exist, because a second application of one source overwrites the first by key collision
rather than by any rule. This branch gives buffs an owner, an actor, an explicit stacking rule, a
sign that makes a debuff the same mechanism, and the second counter source that
`+N <stat> per <counter>` was defined to take.

Proof:

- [c1] One module owns a buff's whole life. Granting, expiring and folding all happen behind it, and no
  other module constructs an `ActiveBuff`, writes `activeBuffs`, or knows how a buff's identity is
  spelled. In particular `save.ts` no longer recovers an item id by slicing a key string.
- [c2] A buff is held by an actor, and any actor can hold one. `statRange` stops gating the modifier fold
  on `actorId === PLAYER`, so a buff on an enemy changes that enemy's stats the way the player's
  already change theirs.
- [c3] Each instance carries its own expiry, and refreshing is replacement. A buff is a set of instances
  rather than one entry with a count, each expiring on its own clock; applying a source that is
  already held either adds an instance or replaces an existing one, and replacing is how a duration
  is refreshed. Which of the two a source does is authored, not implied by whether two keys collide.
- [c4] A debuff is a buff with a sign. There is no second record, no second code path, and no predicate
  anywhere that asks whether a modifier is a penalty.
- [c5] Durations tick on the existing cadence. A buff's expiry is a boundary `nextBoundary` returns and
  `applyDueBoundaries` applies, for whoever holds it, and no new clock is introduced.
- [c6] A buff's payload is the tag-clause vocabulary items already use, and stacking is repetition of it.
  A buff carrying `+6 attack` held five times contributes `+30 attack` because each stack applies
  its own effect through the existing fold. There is no per-stack arithmetic, no new payload shape,
  and nothing about a buff's own bonus that a piece of equipment's bonus does not already do.
- [c7] A buff's stack count is readable by other modifiers. `+N <stat> per <counter>`, defined by
  `combat-events` over a resource's level, takes a named buff's stack count as a counter — so a
  sword granting `+1% attack per stack of accelerated-vigor` raises what each stack is worth. This
  is the path by which a player improves a buff they are stacking, and it is separate from the buff
  paying out its own payload.
- [c8] The player's existing behaviour is unchanged. Food buffs grant, stack (or do not), and expire
  exactly as they do today; every shipped `# test` passes byte-identical and no `expect:` save is
  regenerated to accommodate this branch.
- [c9] A save written before this branch loads. Buffs it holds either survive with their meaning intact
  or are pruned with the warning the loader already emits — never silently dropped, and never
  reinterpreted as a different number of stacks.

## Decisions

- **The key format was the bug, not an implementation detail.** `<itemId>:<statId>` is parsed in
  `save.ts` to find an item to check against the registry, which means the shape of a string is a
  contract between two modules that never agreed to one. Giving a buff an owner is what removes the
  need for anyone to parse it.
- **The player gate in `statRange` is the actual generalisation.** Moving `activeBuffs` off
  `GameState` alone would not help: gear and action tags are inside the same `actorId === PLAYER`
  branch, so an enemy would still be a bare base stat. The clause is about the fold, not the record.
- **`buff engine` stays this branch's `produces` claim.** `combat-events` was drafted claiming
  actor-scoped timed modifiers and that scope was removed from it rather than duplicated here.
- **No new clock.** Instances expire on the boundary the segment loop already honours; more
  instances means more boundaries, not a second scheduler.
- **A buff is equipment that expires.** Its payload is the same tag-clause vocabulary, folded the
  same way, and five stacks of `+6 attack` are `+30 attack` for the same reason five sources of
  `+6 attack` would be. Nothing about a stack needs arithmetic that equipment does not already have,
  which is why this branch introduces no payload shape of its own.
- **Improving a stack is a different mechanism from paying it out.** `+1% attack per stack of
  accelerated-vigor` on a sword is a modifier reading a counter — the shape `combat-events` defines
  — not the buff describing itself. Conflating them would have made a buff's payload a special form
  instead of an ordinary one.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-14

- base: `ae7232c5e9ab4a157da7ba445270ce0e0ac936c4`
- head: `07fa1e9129159d79c02dd3fdeef8a3bccc7fc87c`
- proof 1: met — `grep -rn "ActiveBuff\|activeBuffs" src scripts --include=*.ts` returns nothing: the type and the field are gone from the tree, not merely unused. `grep -rn "state\.buffs" src --include=*.ts` names buffs.ts (lines 34, 46, 70, 82, 112) and test files only; stats.ts reaches the table through `buffsOf` and never indexes it. save.ts holds no key slicing at all - `pruneStateForRegistry` now hands `pruneBuffs` an `actorLoaded` predicate (save.ts:165) and the old `key.slice(0, key.indexOf(':'))` line is deleted. buffs.ts follows the shape instances.ts / population.ts / modals.ts already use for a module-owned GameState field (readonly field, `isX` guard, `pruneX`), and the `state.buffs as {...}` cast in `writable` is the same technique effects.ts:317 and modals.ts:127 already use, so no new pattern was invented. My own mutation of state.ts:57 (deleting the `clearBuffs` call in `endAction`) was KILLED by "a buff on a fight-scoped copy dies with the copy > clears every actor the encounter minted when the action ends, and no other holder", and my mutation of save.ts:165 (`actorLoaded` replaced with `() => true`) was KILLED by save.test.ts "pruneStateForRegistry > removes state entries whose content ids are not loaded", so both ends of the lifecycle the module claims are actually watched.
- proof 2: met — I restored the gate the clause says was removed: mutating stats.ts:69 `buffs: buffsOf(state, actorId)` back to `buffs: stored ? buffsOf(state, actorId) : []` is KILLED by three named tests, first among them buffs.test.ts "a buff is held by an actor > moves the stats of whoever holds it, player or not, and reaches nobody else". Re-run with `npm run mutate` on the manifest at C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass1-mutations.json, entry c2-restore-player-gate. Caveat recorded rather than charged against the clause: `ownStores` still reads `equipped` and `xp` only for PLAYER. That is honest rather than a residual gate, because there is no per-actor equipment or xp store on GameState to read - the clause promises the buff fold, and the buff fold is ungated.
- proof 3: met — Stacking is authored by a `stacks` keyword tag on the source (buffs.ts:56), and both halves of the decision are watched. Mutating that line to `const stacks = false` is KILLED by six named tests including "adds an instance for a source that stacks and replaces one for a source that does not"; mutating buffs.ts:57 to drop the `filter` (always append) is KILLED by that same test. Each instance carries its own `expiresAt` and expires alone: buffs.test.ts "expires each instance on its own clock, for whoever holds it, through resolve alone" walks two player instances to different instants through `resolve` and no other seam. Manifest entries c3-never-stacks and c3-always-stacks.
- proof 4: met — A penalty is a negative `amount` on an ordinary `stat-bonus` tag: `grep -rniE "debuff|penalt|isNegative" src --include=*.ts` finds one comment in buffs.ts and no code, and every `< 0` in src is display-side sign rendering that predates this branch (serialize.ts, ui/format.ts, content/passive.ts). There is one record (`BuffInstance`) and one fold (`foldStatBonuses`). buffs.test.ts "makes a debuff the same mechanism with a sign, summing against a buff rather than beside it" shows `-4 attack` and `+6 attack` summing to base 10 -> 6 -> 12, which is arithmetic on one channel rather than two paths meeting.
- proof 5: met — `nextBoundary` weighs `nextBuffExpiry(state)` against every other clock (runtime.ts:186) and `applyDueBoundaries` calls `expireBuffs(state, at)` inside the loop it already had (runtime.ts:465); nothing else in the diff reads or writes a clock. Two mutations aimed at the two halves: buffs.ts:83 `buff.expiresAt > at` widened to `>=` is KILLED by "expires each instance on its own clock..." and "reports whether a pass ended anything, so the boundary loop can stop"; buffs.ts:72 `<` flipped to `>` (report the latest expiry instead of the earliest) is KILLED by "reports the earliest expiry any actor holds, which is the boundary resolve stops at". Manifest entries c5-expiry-off-by-one and c5-earliest-expiry.
- proof 6: met — A buff instance carries the source's whole `readonly TagClause[]` and `statRange` folds it through the same `foldStatBonuses` an action's tags go through (stats.ts:133); no arithmetic in buffs.ts multiplies by a count. The repetition is what I broke: mutating stats.ts:95 so that `modifierCarriers` pushes at most one carrier per source id is KILLED by "pays five stacks of +6 attack out as +30, through the fold and not through arithmetic of its own" and three more. Manifest entry c6-one-carrier-per-source.
- proof 7: met — `per stack of <id>` parses to `{kind:'stack', id}` (tagClause.ts), resolves as an item reference at load time - `npm run probe -- <module> --round-trip` on an item carrying `+10% attack per stack of vigor` reports "round-trips clean" and shows `per: {kind:'stack', id:'stackland.vigor'}`, and parse.test.ts "resolves a stack counter as the buff source it names, which is an item" proves an unknown source is a load error rather than a silent zero. The counter is spent by `counterLevels` (stats.ts:42); mutating that branch to return 0 is KILLED by "raises what a worn item is worth per stack held, without the buff describing itself", which is the sword case the clause names (10+6 then +10% -> 17.6, 10+12 then +20% -> 26.4). Manifest entry c7-stack-counter-reads-nothing.
- proof 8: met — `git diff ae7232c..07fa1e9 -- content/tutorial-island.dsl` touches seven lines and every one of them changes only `"version":8` to `"version":9`; no `# test` directive, no `expect:` recording body and no item tag list moved, so nothing was regenerated to accommodate the branch. `npm run tasks -- merge-ready` is green on every leg, integration.test.ts included. The player-facing grant path is watched: mutating runtime.ts:589 so `grantFoodBuff` drops the duration tag is KILLED by resolve.test.ts "eating a food item grants its tags as a live timed buff via the ordinary self-consuming eat action" and "grants a slow meal's buff on the armed path as well as the instant one, with the clock starting when the bowl is empty". Behaviour equivalence checked by hand as well: no shipped food carries the new `stacks` keyword, so every shipped food still replaces on a second helping exactly as key collision used to make it. Manifest entry c8-food-duration-dropped.
- proof 9: deferred — Measured, and it fails on its first sentence. `SAVE_VERSION` moved 8 -> 9 and `checkSave` rejects on mismatch, so a save written before this branch does not load at all: loading a v8 body carrying `activeBuffs` throws `save version mismatch: expected 9, got 8`, and the same body stamped 9 by hand throws `save holds an unknown field: activeBuffs` (both reproduced through `npm run inspect` against `loadSave`). The second sentence does hold, which is why this is a deferral and not a silent hole: nothing is dropped quietly and nothing is reinterpreted - the old record shape is refused by `isBuffList` (buffs.test.ts "refuses a body that is not a list of instances rather than reading it as some number of stacks"), and every shipped fixture was re-stamped by migrate-saves with its body byte-identical. The goal - one buff mechanism, owned by one module, held by any actor - holds without this clause: there is no player save store yet (CLAUDE.md: play-cli starts fresh every run and a `# save` fixture is how a session starts anywhere else), and "with no migration path, a stale save is rejected" is the repository's standing policy at save.ts:13, owned by the already-open save-migration-system task rather than by this branch. This branch pays the cost every SAVE_VERSION bump pays; it does not introduce it.
