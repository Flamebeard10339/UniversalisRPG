# buffs-generalized

## Goal

One buff mechanism any character can hold, so that a debuff, a stack and an expiry are the same
record with different values rather than three bespoke ones.

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
  proof: vitest src/runtime/buffs.test.ts, beside `grep -rn "state.buffs" src/ --include=*.ts`
- [c2] A buff is held by an actor, and any actor can hold one. `statRange` stops gating the modifier fold
  on `actorId === PLAYER`, so a buff on an enemy changes that enemy's stats the way the player's
  already change theirs.
  proof: vitest src/runtime/buffs.test.ts src/runtime/encounter.test.ts
- [c3] Each instance carries its own expiry, and refreshing is replacement. A buff is a set of instances
  rather than one entry with a count, each expiring on its own clock; applying a source that is
  already held either adds an instance or replaces an existing one, and replacing is how a duration
  is refreshed. Which of the two a source does is authored, not implied by whether two keys collide.
  proof: vitest src/runtime/buffs.test.ts
- [c4] A debuff is a buff with a sign. There is no second record, no second code path, and no predicate
  anywhere that asks whether a modifier is a penalty.
  proof: vitest src/runtime/buffs.test.ts
- [c5] Durations tick on the existing cadence. A buff's expiry is a boundary `nextBoundary` returns and
  `applyDueBoundaries` applies, for whoever holds it, and no new clock is introduced.
  proof: vitest src/runtime/buffs.test.ts src/runtime/resolve.test.ts src/runtime/cadence.test.ts
- [c6] A buff's payload is the tag-clause vocabulary items already use, and stacking is repetition of it.
  A buff carrying `+6 attack` held five times contributes `+30 attack` because each stack applies
  its own effect through the existing fold. There is no per-stack arithmetic, no new payload shape,
  and nothing about a buff's own bonus that a piece of equipment's bonus does not already do.
  proof: vitest src/runtime/buffs.test.ts src/runtime/stat.test.ts
- [c7] A buff's stack count is readable by other modifiers. `+N <stat> per <counter>`, defined by
  `combat-events` over a resource's level, takes a named buff's stack count as a counter — so a
  sword granting `+1% attack per stack of accelerated-vigor` raises what each stack is worth. This
  is the path by which a player improves a buff they are stacking, and it is separate from the buff
  paying out its own payload.
  proof: vitest src/runtime/buffs.test.ts src/content/parse.test.ts
- [c8] The player's existing behaviour is unchanged. Food buffs grant, stack (or do not), and expire
  exactly as they do today; every shipped `# test` passes byte-identical and no `expect:` save is
  regenerated to accommodate this branch.
  proof: vitest src/runtime/integration.test.ts src/runtime/resolve.test.ts, beside `git diff ae7232c -- content/`
- [c9] A save written before this branch loads. Buffs it holds either survive with their meaning intact
  or are pruned with the warning the loader already emits — never silently dropped, and never
  reinterpreted as a different number of stacks.
  proof: vitest src/runtime/buffs.test.ts src/runtime/save.test.ts scripts/migrate-saves.test.ts

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

### Pass 2 — 2026-08-14

- base: `ae7232c5e9ab4a157da7ba445270ce0e0ac936c4`
- head: `d0cde1c53357211a3d42e12c55dc2167e082f990`
- proof 1: met — Re-measured, not re-read. `grep -rn "ActiveBuff\|activeBuffs" src scripts --include=*.ts`
 returns exactly one hit and it is a string literal inside scripts/tasks/triage.test.ts:55, so the type
 and the field are gone from the tree. `grep -rn "state\.buffs" src --include=*.ts` outside tests names
 buffs.ts alone (32, 44, 66, 76, 100); stats.ts reaches the table through `buffsOf`/`stackCount` and
 never indexes it, and save.ts holds no key slicing. I aimed at a line pass 1 did not touch, to test
 ownership of the representation rather than of the lifecycle: mutating buffs.ts:39
 `if (held.length === 0) delete table[actorId];` to `table[actorId] = held` was KILLED by
 buffs.test.ts "durations tick on the existing cadence > expires each instance on its own clock, for
 whoever holds it, through resolve alone", re-run at its own file with the mutation still applied.
 Re-run with `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json`,
 entry c1-empty-holder-left-behind. Caveat recorded as a finding rather than charged against the
 clause: `loadSave` installs `state.buffs` wholesale through the generic RECORD_FIELDS cast
 (save.ts:252) without passing through `set`, so the "an actor holding nothing is spelled as absent"
 invariant buffs.ts:38 states is breachable from a `# save` body. No module interprets a buff's
 identity, which is what the clause promises, so this is a normalisation hole and not an ownership one.
- proof 2: met — Pass 1 restored the `actorId === PLAYER` gate; I broke the other direction, so that a
 fold which is merely ungated cannot pass for one that is actor-scoped. Mutating stats.ts:69
 `buffs: buffsOf(state, actorId)` to `buffs: buffsOf(state, PLAYER)` — every actor reading the
 player's table — was KILLED by buffs.test.ts "a buff is held by an actor > moves the stats of
 whoever holds it, player or not, and reaches nobody else", re-run at its own file with the mutation
 still applied. Manifest entry c2-every-actor-reads-the-players-table in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. Independently
 confirmed live through `npm run inspect`: a `giant-rat` holding two instances of a source reads
 attack 11 off base 5 while the player holding five reads 25 off base 10, on one registry and one
 state. Two neighbours are filed as findings rather than charged here — the counter half of the same
 generalisation is unwatched (stats.ts:42), and a buff on a participant that is not a fight-scoped
 copy is cleared when the action ends (state.ts:54) — because the clause promises the modifier fold,
 and the modifier fold is ungated and actor-scoped.
- proof 3: met — Both halves of the authored decision are watched, and I broke each in a direction pass 1
 did not. Mutating buffs.ts:53 `const stacks = source.tags.some(...)` to `const stacks = true` — every
 source stacks, so nothing is ever authored — was KILLED by buffs.test.ts "stacking is authored, and
 is repetition of one payload > adds an instance for a source that stacks and replaces one for a
 source that does not". Mutating buffs.ts:54's `.filter((buff) => buff.source !== source.id)` to
 `=== source.id` — replacement keeping the colliding instances and dropping everything else — was
 KILLED by the same named test, re-run at its own file. Each instance carrying its own clock is proved
 separately by "expires each instance on its own clock, for whoever holds it, through resolve alone",
 which walks two player instances to different instants through `resolve` and no other seam. Manifest
 entries c3-everything-stacks and c3-replacement-keeps-the-wrong-half in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json.
- proof 4: met — This clause is a negative claim, so I proved it by writing the thing it forbids and
 watching the suite refuse it. Mutating stats.ts:133 to
 `foldStatBonuses(carrier.buff.tags.filter((tag) => tag.kind !== 'stat-bonus' || tag.percent || tag.amount.min >= 0), ...)`
 — a predicate at the fold that asks whether a modifier is a penalty — was KILLED by buffs.test.ts
 "makes a debuff the same mechanism with a sign, summing against a buff rather than beside it",
 re-run at its own file with the mutation still applied. Manifest entry
 c4-a-predicate-that-asks-whether-a-modifier-is-a-penalty in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. The state of the tree
 agrees: `grep -rniE "debuff|penalt|isNegative" src --include=*.ts` finds one comment in buffs.ts:9,
 one test name in buffs.test.ts and one pre-existing display test in ui/sheet.test.ts — no code. One
 record (`BuffInstance`), one fold (`foldStatBonuses`).
- proof 5: met — Pass 1 broke the two comparisons inside buffs.ts; I broke the seam instead, because the
 clause is about where the expiry is weighed rather than about how it is computed. Mutating
 runtime.ts:187 so `nextBoundary` never returns a buff expiry as a boundary — leaving expiry to land
 only where some other clock already stopped — was KILLED by resolve.test.ts "resolve: repeating
 action, speed stat, and timed buff (test 1 from the design brief) > produces exactly 1500
 cooked-shrimp over 1000s: 1000 while a x2-speed buff is active (500s @ 0.5s/completion), then 500
 more after it expires (500s @ 1s/completion)", re-run at its own file with the mutation still
 applied. Manifest entry c5-expiry-is-no-longer-a-boundary in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. No second clock was
 introduced: `expireBuffs(state, at)` is called inside the loop `applyDueBoundaries` already had
 (runtime.ts:465), and `grep -rn "state\.buffs" src --include=*.ts` shows no other reader of the
 table at all, let alone one holding a clock.
- proof 6: met — Mutating buffs.ts:55 so a granted instance carries the source's tag list minus its
 stat-bonus clauses (`tags: source.tags.filter((tag) => tag.kind !== 'stat-bonus')`) — a payload shape
 of the engine's own rather than the item's own — was KILLED by buffs.test.ts "pays five stacks of +6
 attack out as +30, through the fold and not through arithmetic of its own", re-run at its own file
 with the mutation still applied. Manifest entry c6-instance-carries-no-payload in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. Read alongside c4's
 kill, which proves the same `foldStatBonuses` call handles a negative amount with no branch, the
 fold an instance goes through is the one an action's tags and an item's tags already go through
 (stats.ts:48, 133), and no arithmetic in buffs.ts multiplies by a count anywhere.
- proof 7: met — Verified on my own inputs at both ends. Grammar and serializer: a module carrying
 `# item blade / +10% attack per stack of vigor` parses to `per: {kind:'stack', id:'vigor'}` and
 `npm run probe -- <it> --round-trip` reports "stackland: round-trips clean"; parse.test.ts "resolves
 a stack counter as the buff source it names, which is an item" holds that an unknown source is a
 load error rather than a silent zero. Spending: mutating stats.ts:42's stack branch to a constant 1
 was KILLED by buffs.test.ts "a stack count is a counter other modifiers read > raises what a worn
 item is worth per stack held, without the buff describing itself" — the sword case the clause names.
 Manifest entry c7-stack-counter-reads-one in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. The clause is met and
 one neighbour is filed rather than charged against it: the SECOND mutation of the same line,
 `stackCount(state, actorId, ...)` -> `stackCount(state, PLAYER, ...)`, SURVIVED the whole suite
 (0 failed of 2912), and the path is live — a rat holding two instances of `frenzy` plus a buff
 carrying `+3 attack per stack of frenzy` reads 11 today and would read 20 under the mutation. The
 counter reads the right actor; nothing holds it there.
- proof 8: met — Re-measured over the full range, not pass 1's. `git diff ae7232c..d0cde1c --
 content/tutorial-island.dsl` touches seven lines and every one changes only `"version":8` to
 `"version":9`; no `# test` directive, no `expect:` recording body and no item tag list moved.
 `npm run tasks -- merge-ready` is green on every leg (tsc, npm test, layer-check, audit-status,
 doctor, bytes, tree, base), integration.test.ts included. Pass 1 broke the grant by dropping the
 duration tag; I scaled it instead, which is the mutation a test that merely asserts "a buff exists"
 would survive: mutating runtime.ts:589 to double the food window was KILLED by resolve.test.ts
 "grants a slow meal's buff on the armed path as well as the instant one, with the clock starting
 when the bowl is empty", re-run at its own file with the mutation still applied. Manifest entry
 c8-food-window-doubled in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. Equivalence checked
 by hand as well, on the two ways this branch could have changed a shipped meal: `grep -rn "stacks"
 content/*.dsl` finds nothing, so every shipped food still replaces on a second helping; and
 `grep -rn " per " content/*.dsl` finds six comment lines and no tag, so no shipped food carries the
 `per` clause that a buff's payload now scales and previously took flat.
- proof 9: deferred — Checked independently and it fails, on both of its sentences now. First sentence:
 `SAVE_VERSION` moved 8 -> 9 and `checkSave` rejects on mismatch (save.ts:225), so a pre-branch save
 does not load at all — a v8 body throws `save version mismatch`, and the same body stamped 9 by hand
 throws `save holds an unknown field: activeBuffs`. Second sentence: pass 1 recorded that a surviving
 buff keeps its meaning, and that is no longer true where a counter is involved. `pruneBuffs`
 (buffs.ts:104) asks the registry about `buff.source` and about each `tag.statId`, and about nothing
 else, so a buff tag whose `per` counter names a resource or an item the registry no longer holds
 loads with `warnings: []`, is kept, and folds to base — measured through `npm run inspect` against
 `loadSave`: attack stays 10 where the tag says 15, for both `{kind:'resource'}` and `{kind:'stack'}`.
 That is neither "survives with its meaning intact" nor "pruned with the warning the loader already
 emits", and it is filed as a finding of its own. The half that does hold is that nothing is
 reinterpreted as a different number of stacks: mutating save.ts:53's `holds: isBuffList` to
 `holds: () => true` was KILLED by buffs.test.ts "refuses a body that is not a list of instances
 rather than reading it as some number of stacks" (manifest entry c9-save-body-shape-unchecked).
 Deferred rather than unmet because the goal this brief printed — one buff mechanism, owned by one
 module, held by any actor — holds without it: there is no player save store yet, "with no migration
 path, a stale save is rejected" is the standing policy at save.ts:13 owned by the open
 save-migration-system task, and this branch pays a cost every SAVE_VERSION bump pays rather than
 introducing one. The record this deferral leaves behind should carry the second sentence too, which
 is why the counter hole is filed separately rather than folded into this reason.

### Pass 3 — 2026-08-14

- base: `ae7232c5e9ab4a157da7ba445270ce0e0ac936c4`
- head: `d0cde1c53357211a3d42e12c55dc2167e082f990`
- proof 1: met — Re-measured, not re-read. `grep -rn "ActiveBuff\|activeBuffs" src scripts --include=*.ts`
 returns exactly one hit and it is a string literal inside scripts/tasks/triage.test.ts:55, so the type
 and the field are gone from the tree. `grep -rn "state\.buffs" src --include=*.ts` outside tests names
 buffs.ts alone (32, 44, 66, 76, 100); stats.ts reaches the table through `buffsOf`/`stackCount` and
 never indexes it, and save.ts holds no key slicing. I aimed at a line pass 1 did not touch, to test
 ownership of the representation rather than of the lifecycle: mutating buffs.ts:39
 `if (held.length === 0) delete table[actorId];` to `table[actorId] = held` was KILLED by
 buffs.test.ts "durations tick on the existing cadence > expires each instance on its own clock, for
 whoever holds it, through resolve alone", re-run at its own file with the mutation still applied.
 Re-run with `npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json`,
 entry c1-empty-holder-left-behind. Caveat recorded as a finding rather than charged against the
 clause: `loadSave` installs `state.buffs` wholesale through the generic RECORD_FIELDS cast
 (save.ts:252) without passing through `set`, so the "an actor holding nothing is spelled as absent"
 invariant buffs.ts:38 states is breachable from a `# save` body. No module interprets a buff's
 identity, which is what the clause promises, so this is a normalisation hole and not an ownership one.
- proof 2: met — Pass 1 restored the `actorId === PLAYER` gate; I broke the other direction, so that a
 fold which is merely ungated cannot pass for one that is actor-scoped. Mutating stats.ts:69
 `buffs: buffsOf(state, actorId)` to `buffs: buffsOf(state, PLAYER)` — every actor reading the
 player's table — was KILLED by buffs.test.ts "a buff is held by an actor > moves the stats of
 whoever holds it, player or not, and reaches nobody else", re-run at its own file with the mutation
 still applied. Manifest entry c2-every-actor-reads-the-players-table in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. Independently
 confirmed live through `npm run inspect`: a `giant-rat` holding two instances of a source reads
 attack 11 off base 5 while the player holding five reads 25 off base 10, on one registry and one
 state. Two neighbours are filed as findings rather than charged here — the counter half of the same
 generalisation is unwatched (stats.ts:42), and a buff on a participant that is not a fight-scoped
 copy is cleared when the action ends (state.ts:54) — because the clause promises the modifier fold,
 and the modifier fold is ungated and actor-scoped.
- proof 3: met — Both halves of the authored decision are watched, and I broke each in a direction pass 1
 did not. Mutating buffs.ts:53 `const stacks = source.tags.some(...)` to `const stacks = true` — every
 source stacks, so nothing is ever authored — was KILLED by buffs.test.ts "stacking is authored, and
 is repetition of one payload > adds an instance for a source that stacks and replaces one for a
 source that does not". Mutating buffs.ts:54's `.filter((buff) => buff.source !== source.id)` to
 `=== source.id` — replacement keeping the colliding instances and dropping everything else — was
 KILLED by the same named test, re-run at its own file. Each instance carrying its own clock is proved
 separately by "expires each instance on its own clock, for whoever holds it, through resolve alone",
 which walks two player instances to different instants through `resolve` and no other seam. Manifest
 entries c3-everything-stacks and c3-replacement-keeps-the-wrong-half in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json.
- proof 4: met — This clause is a negative claim, so I proved it by writing the thing it forbids and
 watching the suite refuse it. Mutating stats.ts:133 to
 `foldStatBonuses(carrier.buff.tags.filter((tag) => tag.kind !== 'stat-bonus' || tag.percent || tag.amount.min >= 0), ...)`
 — a predicate at the fold that asks whether a modifier is a penalty — was KILLED by buffs.test.ts
 "makes a debuff the same mechanism with a sign, summing against a buff rather than beside it",
 re-run at its own file with the mutation still applied. Manifest entry
 c4-a-predicate-that-asks-whether-a-modifier-is-a-penalty in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. The state of the tree
 agrees: `grep -rniE "debuff|penalt|isNegative" src --include=*.ts` finds one comment in buffs.ts:9,
 one test name in buffs.test.ts and one pre-existing display test in ui/sheet.test.ts — no code. One
 record (`BuffInstance`), one fold (`foldStatBonuses`).
- proof 5: met — Pass 1 broke the two comparisons inside buffs.ts; I broke the seam instead, because the
 clause is about where the expiry is weighed rather than about how it is computed. Mutating
 runtime.ts:187 so `nextBoundary` never returns a buff expiry as a boundary — leaving expiry to land
 only where some other clock already stopped — was KILLED by resolve.test.ts "resolve: repeating
 action, speed stat, and timed buff (test 1 from the design brief) > produces exactly 1500
 cooked-shrimp over 1000s: 1000 while a x2-speed buff is active (500s @ 0.5s/completion), then 500
 more after it expires (500s @ 1s/completion)", re-run at its own file with the mutation still
 applied. Manifest entry c5-expiry-is-no-longer-a-boundary in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. No second clock was
 introduced: `expireBuffs(state, at)` is called inside the loop `applyDueBoundaries` already had
 (runtime.ts:465), and `grep -rn "state\.buffs" src --include=*.ts` shows no other reader of the
 table at all, let alone one holding a clock.
- proof 6: met — Mutating buffs.ts:55 so a granted instance carries the source's tag list minus its
 stat-bonus clauses (`tags: source.tags.filter((tag) => tag.kind !== 'stat-bonus')`) — a payload shape
 of the engine's own rather than the item's own — was KILLED by buffs.test.ts "pays five stacks of +6
 attack out as +30, through the fold and not through arithmetic of its own", re-run at its own file
 with the mutation still applied. Manifest entry c6-instance-carries-no-payload in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. Read alongside c4's
 kill, which proves the same `foldStatBonuses` call handles a negative amount with no branch, the
 fold an instance goes through is the one an action's tags and an item's tags already go through
 (stats.ts:48, 133), and no arithmetic in buffs.ts multiplies by a count anywhere.
- proof 7: met — Verified on my own inputs at both ends. Grammar and serializer: a module carrying
 `# item blade / +10% attack per stack of vigor` parses to `per: {kind:'stack', id:'vigor'}` and
 `npm run probe -- <it> --round-trip` reports "stackland: round-trips clean"; parse.test.ts "resolves
 a stack counter as the buff source it names, which is an item" holds that an unknown source is a
 load error rather than a silent zero. Spending: mutating stats.ts:42's stack branch to a constant 1
 was KILLED by buffs.test.ts "a stack count is a counter other modifiers read > raises what a worn
 item is worth per stack held, without the buff describing itself" — the sword case the clause names.
 Manifest entry c7-stack-counter-reads-one in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. The clause is met and
 one neighbour is filed rather than charged against it: the SECOND mutation of the same line,
 `stackCount(state, actorId, ...)` -> `stackCount(state, PLAYER, ...)`, SURVIVED the whole suite
 (0 failed of 2912), and the path is live — a rat holding two instances of `frenzy` plus a buff
 carrying `+3 attack per stack of frenzy` reads 11 today and would read 20 under the mutation. The
 counter reads the right actor; nothing holds it there.
- proof 8: met — Re-measured over the full range, not pass 1's. `git diff ae7232c..d0cde1c --
 content/tutorial-island.dsl` touches seven lines and every one changes only `"version":8` to
 `"version":9`; no `# test` directive, no `expect:` recording body and no item tag list moved.
 `npm run tasks -- merge-ready` is green on every leg (tsc, npm test, layer-check, audit-status,
 doctor, bytes, tree, base), integration.test.ts included. Pass 1 broke the grant by dropping the
 duration tag; I scaled it instead, which is the mutation a test that merely asserts "a buff exists"
 would survive: mutating runtime.ts:589 to double the food window was KILLED by resolve.test.ts
 "grants a slow meal's buff on the armed path as well as the instant one, with the clock starting
 when the bowl is empty", re-run at its own file with the mutation still applied. Manifest entry
 c8-food-window-doubled in
 C:\Users\yonat\AppData\Local\Temp\audit-buffs-generalized-pass2-mutations.json. Equivalence checked
 by hand as well, on the two ways this branch could have changed a shipped meal: `grep -rn "stacks"
 content/*.dsl` finds nothing, so every shipped food still replaces on a second helping; and
 `grep -rn " per " content/*.dsl` finds six comment lines and no tag, so no shipped food carries the
 `per` clause that a buff's payload now scales and previously took flat.
- proof 9: deferred — Checked independently and it fails, on both of its sentences now. First sentence:
 `SAVE_VERSION` moved 8 -> 9 and `checkSave` rejects on mismatch (save.ts:225), so a pre-branch save
 does not load at all — a v8 body throws `save version mismatch`, and the same body stamped 9 by hand
 throws `save holds an unknown field: activeBuffs`. Second sentence: pass 1 recorded that a surviving
 buff keeps its meaning, and that is no longer true where a counter is involved. `pruneBuffs`
 (buffs.ts:104) asks the registry about `buff.source` and about each `tag.statId`, and about nothing
 else, so a buff tag whose `per` counter names a resource or an item the registry no longer holds
 loads with `warnings: []`, is kept, and folds to base — measured through `npm run inspect` against
 `loadSave`: attack stays 10 where the tag says 15, for both `{kind:'resource'}` and `{kind:'stack'}`.
 That is neither "survives with its meaning intact" nor "pruned with the warning the loader already
 emits", and it is filed as a finding of its own. The half that does hold is that nothing is
 reinterpreted as a different number of stacks: mutating save.ts:53's `holds: isBuffList` to
 `holds: () => true` was KILLED by buffs.test.ts "refuses a body that is not a list of instances
 rather than reading it as some number of stacks" (manifest entry c9-save-body-shape-unchecked).
 Deferred rather than unmet because the goal this brief printed — one buff mechanism, owned by one
 module, held by any actor — holds without it: there is no player save store yet, "with no migration
 path, a stale save is rejected" is the standing policy at save.ts:13 owned by the open
 save-migration-system task, and this branch pays a cost every SAVE_VERSION bump pays rather than
 introducing one. The record this deferral leaves behind should carry the second sentence too, which
 is why the counter hole is filed separately rather than folded into this reason.
