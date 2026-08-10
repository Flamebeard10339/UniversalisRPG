# skill-levels-xp-events

## Deliverable

Skills stop being write-only. Today xp is incremented in exactly one place (`src/runtime/effects.ts:179`)
and read by nothing, and `# skill`'s `stat-id` field parses, resolves and is reference-checked while no
runtime code consults it — the whole skill system is an accumulator with no consumer. This branch gives
xp a continuous level curve and lets a skill's level feed the stat it names, which is what makes "gated
by skill level" expressible at all. It adds no way to *earn* xp beyond the `xp:` result that already
ships: granting experience from what happened is `xp-from-events`, and it is separated out because its
event vocabulary cannot be written correctly until `full-refactor-of-enemies-and-combat` has said what a
swing, a participant and an event are.

Proof:

- [c1] The curve is continuous, not blocked. The cost of level `n` is `C(n) = 1000 × 2^((n-1)/10)` —
  1000 xp for the first level, doubling every ten levels without a step — and the xp needed to have
  reached level `n` is the geometric sum `T(n) = 1000 × (r^(n-1) - 1) / (r - 1)` where `r = 2^(1/10)`.
- [c2] Level from xp is one closed-form evaluation, `level(X) = 1 + 10 × log2(1 + X × (r - 1) / 1000)`,
  with no loop over levels and no piecewise block lookup. It is read on every stat evaluation, so it
  stays arithmetic.
- [c3] A level is an integer and is a pure function of an integer xp total. The closed form supplies a
  guess that is then corrected against integer thresholds, so the returned level is decided by integer
  comparison and never by float rounding — `level(T(n))` is `n` and `level(T(n) - 1)` is `n - 1`
  exactly, at thresholds across several ten-level spans.
- [c4] A skill's level is derived from the xp total on demand and never stored. This branch adds no
  save field, moves no `SAVE_VERSION`, and regenerates no fixture: a save written before it loads
  untouched. The invariant is derivation, not the shape of the key — where the xp total lives is not
  this branch's to change, and re-keying it per entity belongs to whoever makes the player an entity.
- [c5] A skill grants either `+1` or `+1% × level` to the stat it names, authored in the DSL as the
  magnitude half of the existing stat-bonus shape (`per-level: +1` / `per-level: +1%`, beside the
  `stat-id:` that names the stat) and folded through the existing `added` and `increased` channels in
  `src/runtime/stats.ts`. No new modifier concept and no third channel.
- [c6] The fold is keyed by actor from the first line written. `statRange` already takes an `actorId`,
  and the skill contribution is read against that actor rather than against the player, so it sits
  outside the `if (actorId === PLAYER)` gate and needs no revisiting when
  `full-refactor-of-enemies-and-combat` deletes it. A contribution that only happens to be right
  because the player is the only actor today is what this clause forbids.
- [c7] `# skill`'s `stat-id` is read by the runtime. The comment in `src/content/skill.ts` stating that
  nothing reads it is deleted because it has become false, not because it was tidied.
- [c8] A level-up changes the stat the skill names and nothing else. No pool is refilled, no resource's
  current value is adjusted, and no other state is touched as a consequence of crossing a threshold.
- [c9] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.

## Goal

Make a skill's level a number the rest of the engine can read, so that a stat can depend on it.

## Decisions

- **The curve is continuous and the floored ten-level block is rejected.** The block was chosen to keep
  the xp-to-level inverse closed-form and cheap, but the smooth geometric curve inverts to a single
  logarithm while the blocked one needs a block lookup and then an offset inside it. The stated reason
  for flooring argued for the continuous form all along.
- **Level is an integer; only the curve is continuous.** A fractional level would drift the player's
  stats on every xp gain and there would be no level-up event at all, which is not what "a level-up
  changes the stat" describes.
- **Float never decides a level.** Level is derived rather than stored, and the repository's regression
  format compares whole saves, so a threshold decided by `log2` rounding would change a stat, then
  damage, then an entire replay. The logarithm is a guess and integer thresholds are the arbiter.
- **The event grammar left this branch, and where it went.** The `gain <expression> experience in
  <skill> on <event>` grammar and its closed set of nine moments were clauses here until 2026-08-09.
  They moved to `xp-from-events` because five of the nine (`damage-dealt`, `damage-taken`, `missed`,
  `evaded`, `escaped`) are defined in terms of a swing and a participant that
  `full-refactor-of-enemies-and-combat` rewrites, and three (`succeeded`, `failed`, `escaped`) were
  written against `on success:`, `on failure:` and `on escape:` — result blocks that refactor renames,
  repoints or deletes for combat actions. Authoring nine event names in one grammar and rewriting them
  in the next is what `docs/combat/encounter-grammar.md` already refused twice, for `combat-events` and
  for `starting-zone`. What is left here names no combat concept and no actor, which is why it is
  unblocked today.
- **The split is at the curve, so this branch keeps the slug and the record.** The arithmetic, the
  stat feed and the `# skill` read are what `cooking-vs-dish-complexity` and skill gating actually
  wait on; the event grammar is what waits on combat. Keeping the smaller, unblocked half on the
  existing record is what stops a chain forming where none is needed.
- **The actor-keyed fold is the price of splitting, and it is one line.** c6 could have been left to
  the refactor, since the player is the only actor with skills today. Writing it keyed from the start
  costs nothing — `statRange` already carries `actorId` — and removes the only way this branch could
  hand the refactor a debt.
- **Resources are out of scope.** This branch owns what a level-up does to a *stat*. How a resource
  responds to a stat that changed — whether a raised `max` lifts the current value or only the ceiling
  — belongs to whoever owns resources, and is not decided here.
- **Floating text is not in this branch.** There is no GUI to produce it in, and there is now no xp
  event here to render either: `xp-from-events` publishes the event and `floating-text-for-xp-events`
  owns rendering it over the general transient-text channel `gui-rebuild` builds.
- **`src/runtime/effects.ts` and `src/grammar/skillGrant.ts` leave this grant.** Both were forecast for
  the event half: the observer appended to `RESULT_OBSERVERS` and the grant parser. Neither is touched
  by the curve, so both move to `xp-from-events` rather than staying as a grant nobody spends.
  `src/content/registry.ts` leaves for the same reason — no section kind is added here.

- **The grant is authored beside `stat-id`, and carries no stat of its own.** The Open question below
  offered two sites and c5 originally wrote the whole clause, `+1 attack`, at either of them. Writing
  the stat twice was measured and rejected: with the clause naming its own stat, `npm run mutate`
  showed that deleting `statRange`'s read of `stat-id` failed nothing, because the clause's `statId`
  decided the fold and `stat-id` was a provable no-op — c7 would have been met in name only. Naming the
  stat once, in `stat-id`, is what makes that read load-bearing; the same mutation now kills five
  tests. c5 was amended to the shipped shape rather than left describing a spelling the branch refuses
  at load. Both magnitudes, both channels and the ban on a third are untouched.

## Open questions

- ~~Whether a skill's contribution to a stat is authored on `# skill` beside `stat-id` or as an ordinary
  tag clause the skill carries.~~ Answered above: beside `stat-id`, as `per-level:`.
- `captureResourceRates` evaluates a resource's `rate` and `max` through `statValue`, so a stat that
  changes mid-segment is a stat the current segment's snapshot has already read. This branch does not
  make level-ups boundary events and does not own the answer; recorded here so the resource owner
  inherits the question rather than discovering it.

## Audit passes

### Pass 1 — 2026-08-10

- base: `86a4096ec7eff3a6739e6677f93e4b916c710413`
- head: `a9e43a666490c14e4c37311e509275660f94a0e0`
- proof 1: met — Mutation manifest audit-skill-levels-xp-events-pass1-mutations.json, run with `npm run mutate`.
c1-ratio-doubles-every-ten (RATIO 2**(1/10) -> 2**(1/20)) KILLED by
src/runtime/skills.test.ts > the xp curve > costs 1000 for the first level and doubles that cost
every ten levels. c1-first-level-costs-1000 (1000 -> 1100) KILLED by the same test.
c1-geometric-sum-not-a-flat-block (the geometric sum replaced by a floored ten-level block
schedule) KILLED by src/runtime/skills.test.ts > the xp curve > rises on every level rather than
resting flat inside a ten-level block. Independently of the suite, `npm run inspect` recomputed the
clause's own algebra: T(2)=1000 and T(3)=ceil(1000*(r^2-1)/(r-1))=ceil(2071.77)=2072 match
xpForLevel, and over n=1..393 xpForLevel(n) equals ceil(T(n)) with C(n)=T(n+1)-T(n) doubling exactly
at every ten-level step. The suite's expected-value array is hardcoded literals, not derived from
the implementation, so it can fail.
- proof 2: met — c2-closed-form-log-is-the-guess (Math.log2 -> Math.log10 in the single guess
expression) KILLED by src/runtime/skills.test.ts > the xp curve > agrees with the accumulated curve
at every level, not only at its thresholds. src/runtime/skills.ts holds no table and no block
lookup: the whole inverse is one `Math.log2` call. The `while` in skillLevel is the integer
correction c3 asks for, not a walk over levels — `npm run inspect` instrumented the walk length over
xp = 0..5e6 step 1237 plus 0, 1, 999, 1000, 1e6, 1e9, 1e12, 1e15, MAX_SAFE_INTEGER and 1e300, and
the maximum number of iterations was 1. Recorded tension for a later pass: c2 says "no loop over
levels" while c3 requires a correction against integer thresholds; the implementation satisfies both
only because the correction is provably O(1).
- proof 3: met — c3-integer-correction-decides-the-level (the `while (level > 1 && xpForLevel(level) >
total) level -= 1;` line deleted) KILLED by src/runtime/skills.test.ts > the xp curve > decides a
level by integer comparison at thresholds across several ten-level spans. c3-thresholds-round-up-to-
whole-xp (Math.ceil dropped from xpForLevel) KILLED by src/runtime/skills.test.ts > the xp curve >
rounds a threshold up, so a level never costs less than the curve prices it. Independently, `npm run
inspect` swept n=1..393 and confirmed Number.isInteger(xpForLevel(n)), skillLevel(T(n)) === n and
skillLevel(T(n)-1) === n-1 with no exception. Two ends of the domain are outside that proof and are
filed as a finding: skillLevel(-1) passes with the Math.max(0, xp) clamp deleted (mutation
c3-negative-total-is-no-progress SURVIVED against the whole suite, 0 of 2178 failed), and from
n=394 T(n)=9430070322005768 exceeds 2^53 so T(n)-1 === T(n) in float and skillLevel(T(n)-1) returns
n. Neither end is reachable from the DSL: COUNT_RANGE in src/grammar/values.ts is /\d+(?:-\d+)?/, so
an `xp:` result cannot be signed, and 9.4e15 xp is not attainable.
- proof 4: met — `git diff --name-only 86a4096..a9e43a6` names no fixture, no `.dsl`, and neither
src/runtime/save.ts nor src/runtime/state.ts; the only `.json` touched is docs/audits/systems.json.
`state.xp` is at src/runtime/state.ts:28 and createGameState:47 in the unmodified file, so the save
shape this branch reads predates it and SAVE_VERSION is untouched. Mutation
c4-level-is-derived-not-stored (skillLevel(xp[skillId] ?? 0) replaced by the constant 1) KILLED by
4 tests in src/runtime/skills.test.ts, which is the derivation being load-bearing on every
evaluation rather than at a write. The full suite (2178 tests, including the save round-trip tests
in encounter.test.ts, fight.test.ts and instances.test.ts) is green under `npm run tasks --
merge-ready`.
- proof 5: unmet — The two channels half is proven and the authored shape half is contradicted by the
branch. Proven: c5-flat-grant-scales-with-the-level (scaleRange(bonus.amount, times) ->
bonus.amount) KILLED by "folds a flat grant through the added channel, once per level";
c5-percent-grant-scales-with-the-level KILLED by "folds a percent grant through the increased
channel, once per level"; c5-percent-lands-in-increased-not-added (percent routed into `added`)
KILLED by the same test. src/runtime/stats.ts adds no third field to StatFold — foldBonus writes
only `added` and `increased`, the same two foldStatBonuses already wrote. Contradicted: the clause
fixes the shapes `+1 attack` / `+1% attack`, and the branch makes both a load error.
src/runtime/skills.test.ts:141 asserts `per-level: +1 attack` throws "expected a bonus like +1 or
+1%", and `npm run inspect` over loadModule confirms it. The shipped shape is `per-level: +1` /
`per-level: +2%` on `# skill`, which is one of the two authoring sites the spec's Open questions
left to the worker — but choosing it forecloses the shape the clause fixed, and no Decisions entry
was added: `git diff 86a4096..a9e43a6 -- docs/specs/` is empty. Graded unmet rather than deferred
because the repair is a one-line spec amendment, not undelivered work that should be tracked as
owed. See finding "c5 fixes an authored shape the branch makes a load error".
- proof 6: met — Three mutations, all KILLED by src/runtime/skills.test.ts > a skill level feeding the
stat it names > reads the level off the actor being evaluated, not off the player:
c6-fold-is-called-with-the-actor (foldSkillLevels(registry, actorId, ...) -> PLAYER),
c6-skill-sheet-is-read-off-the-actor (actorEntity(registry, actorId) -> PLAYER inside the fold), and
c6-xp-store-is-not-shared-with-every-actor (`xp: stored ? state.xp : {}` -> `xp: state.xp`, so
another actor would inherit the player's totals). Structurally, the call sits at
src/runtime/stats.ts:64, outside ownStores, and takes actorId and the xp map as separate parameters,
so deleting the `actorId === PLAYER` gate in ownStores requires no edit to foldSkillLevels. The test
distinguishes three actors off one state: the player at level 30 gets 10+30, a rat that lists
`brawling` with no xp of its own gets 3+1, and a mannequin that lists nothing gets 3.
- proof 7: met — The diff deletes the two-line "Nothing reads it yet — skill levels are designed in
docs/combat" comment from src/content/skill.ts and it has become false: mutation
c7-stat-id-selects-which-stat-is-raised (dropping `skill['stat-id'] !== statId` from the fold
predicate, so the grant no longer selects on stat-id) KILLED 5 tests in src/runtime/skills.test.ts,
and c7-a-skill-with-no-stat-id-grants-nothing (the registry guard deleted) KILLED "refuses a grant
with no stat-id to raise". The orphaning paths are closed by pre-existing machinery, checked with
`npm run inspect` over loadUniverse: removing the stat a per-level skill names throws "# skill
base.brawling stat-id: names an unknown stat", and `-stat-id:` on a later module throws "skill field
stat-id is not a list". src/content/references.test.ts drops "though nothing reads it yet" from the
test name for the same reason.
- proof 8: met — c8-level-up-touches-nothing-but-the-stat (a shallow copy of state.resources written
during statRange) KILLED, attributed to 30 named tests across cadence, contest, effects, encounter,
fight, resolve, resource, runtime and stopping, re-run at their own files with the mutation still
applied. The branch's own test uses `brawling`, whose stat feeds no resource, so I ran the case its
fixture avoids with `npm run inspect`: a `grit` skill with `per-level: +5` on `max-stamina`, which is
a resource's own `max`, with `rate: regen`. Crossing the level-4 threshold via applyResultsNow moved
statValue('max-stamina') from 35 to 40 while state.resources.stamina stayed at 25000 milli-units,
state.resourceRateRemainders stayed {}, state.log stayed [] and state.time stayed 0 — the ceiling
moved, the current value did not, and nothing else was written.
- proof 9: met — `npm run tasks -- merge-ready` at a9e43a6: tsc ok pass, npm test ok pass, layer-check ok
pass, audit-status ok pass, doctor ok pass (17 warnings, none of which fail the leg), bytes ok pass,
and additionally tree ok pass and base ok pass. All six legs the clause names are green. The two
legs that report FAIL are `spec skill-levels-xp-events` (1 open member) and `clauses
skill-levels-xp-events` (no recorded audit pass); neither is named by the clause and both are what
this pass and the member's closure discharge.

### Pass 2 — 2026-08-10

- base: `86a4096ec7eff3a6739e6677f93e4b916c710413`
- head: `f1ff0136739176f092816d175d9aa51c5bc86c14`
- proof 1: met — Manifest audit-skill-levels-xp-events-pass2-mutations.json at head f1ff013.
c1-ratio-doubles-every-ten (RATIO 2**(1/10) -> 2**(1/20)) KILLED by src/runtime/skills.test.ts >
the xp curve > costs 1000 for the first level and doubles that cost every ten levels, re-run at
its own file with the mutation still applied. c1-geometric-sum-not-a-flat-block (the geometric
sum replaced by a floored ten-level block schedule) KILLED by src/runtime/skills.test.ts > the xp
curve > rises on every level rather than resting flat inside a ten-level block. The anchoring test
"rounds a threshold up, so a level never costs less than the curve prices it" compares against
hardcoded literals [1000, 2072, 3221, 4452, 12067, 13933, 41799, 97530, 402058, 14253179], not
against anything derived from xpForLevel, so it can fail; the other curve tests derive their
expectation from xpForLevel and are consistency checks resting on that one.
- proof 2: met — c2-closed-form-log-is-the-guess (Math.log2 -> Math.log10 in the single guess
expression) KILLED by src/runtime/skills.test.ts > the xp curve > agrees with the accumulated curve
at every level, not only at its thresholds, re-run at its own file with the mutation still applied.
Read directly, src/runtime/skills.ts is 20 lines and holds no table and no block lookup: the whole
inverse is one Math.log2 call, and the only loop is the integer correction c3 requires. Measured
cost of the whole read on shipped content: `npm run inspect` over content/tutorial-island.dsl ran
200,000 statValue('tutorial-island.attack') calls in 25 ms (0.125 us each) with the player's three
skills on the sheet, so "it stays arithmetic" holds at the call site as well as in the source.
- proof 3: met — c3-integer-correction-decides-the-level (the `while (level > 1 && xpForLevel(level) >
total) level -= 1;` line deleted) KILLED by src/runtime/skills.test.ts > the xp curve > decides a
level by integer comparison at thresholds across several ten-level spans.
c3-thresholds-round-up-to-whole-xp (Math.ceil dropped from xpForLevel) KILLED by "rounds a
threshold up, so a level never costs less than the curve prices it". The end of the domain pass 1
filed as a survivor is now dead: c3-negative-total-is-no-progress (`const total = Math.max(0, xp);`
-> `const total = xp;`) KILLED by "takes any negative total as no progress, including one past
where the curve stops being real" — the repair replaced a case that could not distinguish clamped
from unclamped (skillLevel(-1) answers 1 either way) with totals past -1000/(r-1), where the
unclamped form takes log2 of a non-positive argument and returns NaN. The upper end is now stated
by a test that walks to wherever Number.isSafeInteger stops holding and asserts it got past level
390, which is where T(n) exceeds 2^53 and T(n)-1 === T(n) in float; that is nine orders of
magnitude past any attainable total, and COUNT_RANGE in src/grammar/values.ts (/\d+(?:-\d+)?/)
means an `xp:` result cannot be authored negative either.
- proof 4: met — `git diff --name-only 86a4096..f1ff013` names no fixture, no `.dsl`, and neither
src/runtime/save.ts nor src/runtime/state.ts; the only `.json` touched is docs/audits/systems.json.
The two files f1ff013 added to the range beyond pass 1's head are src/content/entity.ts and
src/content/skill.ts, neither of which is a save surface. Mutation c4-level-is-derived-not-stored
(skillLevel(xp[skillId] ?? 0) -> the constant 1) KILLED by src/runtime/skills.test.ts > a skill
level feeding the stat it names > folds a flat grant through the added channel, once per level, so
the derivation is load-bearing on every evaluation rather than at a write. The one shape change
f1ff013 makes to loaded content — deduping an entity's `skills:` list — is not a save field:
`grep -rn "\.skills\b" src scripts --include=*.ts` shows exactly two readers, src/content/
serialize.ts:328 and src/runtime/stats.ts:43, and save.ts:47 keys `xp` by skill id, not by the
entity's list. Full suite green under `npm run tasks -- merge-ready` at f1ff013.
- proof 5: met — Both halves now hold, and the clause is still falsifiable after the amendment.
Authored shape: c5-authored-shape-carries-no-stat-of-its-own (BARE_AMOUNT loosened to
`^${AMOUNT}(?:[ \t]+[a-z][a-z0-9-]*)?$`, so `per-level: +1 attack` would parse) KILLED by
src/runtime/skills.test.ts > a skill level feeding the stat it names > refuses a grant that names a
stat, since stat-id is where the stat is named. So the shipped spelling the amended clause names is
defended by a test that a mutation can break, not merely described. Magnitudes:
c5-flat-grant-scales-with-the-level (scaleRange(bonus.amount, times) -> bonus.amount) KILLED by
"folds a flat grant through the added channel, once per level"; c5-percent-lands-in-increased-not-
added (percent routed into `added`) KILLED by "folds a percent grant through the increased channel,
once per level". Channels: StatFold at src/runtime/stats.ts:18 has exactly two fields, `added` and
`increased`, the same two foldStatBonuses wrote before this branch, and foldBonus is the single
writer both authored and skill-derived bonuses now go through. Independently, `npm run inspect`
folded the two spellings the clause names on a base-10 stat: `per-level: +1` at level 1 gives 11,
and `per-level: +1%` at level 30 gives 13 (10 x 1.30) — flat times the level in `added`, percent
times the level in `increased`.
I re-derived the amendment rather than accepting it. The Decisions entry's one falsifiable claim is
that naming the stat once in `stat-id` makes the runtime's read of it load-bearing, and that the
mutation "now kills five tests": run with `tests` scoped to the whole file and no named test,
dropping `skill['stat-id'] !== statId` from the fold predicate fails 5 of 16 tests in
src/runtime/skills.test.ts. The claim is exact. The counterfactual half — that a clause carrying
its own statId would have made `stat-id` a provable no-op — cannot be re-run at this head, but it
follows from the code: nothing outside foldSkillLevels reads `stat-id`, so a fold selecting on the
clause's own statId would leave `stat-id` read by the reference checker alone, and c7 would have
been met in name only. The amended clause is not a transcript: it still fixes both magnitudes, both
channels, the ban on a third, and a concrete authored spelling, and all four are killed by
mutations above.
- proof 6: met — c6-skill-sheet-is-read-off-the-actor (actorEntity(registry, actorId) -> PLAYER inside
foldSkillLevels) and c6-xp-store-is-not-shared-with-every-actor (`xp: stored ? state.xp : {}` ->
`xp: state.xp`) both KILLED by src/runtime/skills.test.ts > a skill level feeding the stat it names
> reads the level off the actor being evaluated, not off the player, each re-run at its own file
with the mutation still applied. Structurally the call is at src/runtime/stats.ts:64, outside
ownStores, and takes actorId and the xp map as separate parameters, so deleting the `actorId ===
PLAYER` gate in ownStores needs no edit to foldSkillLevels. Stated precisely, because the evidence
does not say more than this: the *sheet* is actor-keyed (the rat's own `skills:` decides what it
folds), while the *store* the xp comes from is still gated on PLAYER at src/runtime/stats.ts:36-37.
c4 explicitly reserves where the xp total lives to whoever makes the player an entity, so the
remaining gate is the one c4 permits, not one c6 forbids — and it is one line inside ownStores,
beside the buff and equipment stores it already gates, not a special case inside the fold.
- proof 7: met — The comment is gone and the claim it made is false: `git show f1ff013 -- src/content/
skill.ts` and the a9e43a6 diff show both the "Nothing reads it yet" lines removed, and mutation
c7-stat-id-selects-which-stat-is-raised (dropping `skill['stat-id'] !== statId` from the fold
predicate) fails 5 of 16 tests in src/runtime/skills.test.ts. c7-a-skill-with-no-stat-id-grants-
nothing (the registry guard at src/content/registry.ts:257 deleted) KILLED by "refuses a grant with
no stat-id to raise". I re-ran the orphaning paths at this head with `npm run inspect`, including
one pass 1 did not: `# remove skill.s` while an entity lists it throws "# entity player skills:
names an unknown skill: s"; `# remove stat.a.atk` under a per-level skill naming it throws "# skill
a.s stat-id: names an unknown stat: a.atk"; and a later module adding `per-level:` to a skill with
no `stat-id` throws "# skill a.s: per-level: needs a stat-id: to raise". That last one also settles
the over-strictness question the guard raises: because applySection runs after the whole merge pass
(src/content/registry.ts:889-901), a skill may be authored with `per-level:` in one module and
given its `stat-id:` in another and still loads — I ran that case and it produces a skill with both
fields. The guard is enforced where the value is assembled, not where it is written.
- proof 8: met — c8-level-up-touches-nothing-but-the-stat (a `state.time += 1;` write inserted into
statRange immediately before foldSkillLevels) KILLED by src/runtime/skills.test.ts > crossing a
level threshold > moves the stat the skill names and leaves the rest of the state alone, re-run at
its own file with the mutation still applied — that test compares a structuredClone of the whole
state minus `xp` across the level-up, so any write anywhere in state fails it. The branch's own
fixture crosses a threshold on `brawling`, whose stat feeds no resource, so I ran the case it
avoids at this head with `npm run inspect`: a `grit` skill with `per-level: +5` on `max-stamina`,
which is a resource's own `max`, with `rate: regen`. Crossing the level-4 threshold via
applyResultsNow moved statValue('max-stamina') from 35 to 40 while state.resources.stamina stayed
at 25000 milli-units, state.resourceRateRemainders stayed {}, state.log stayed [] and state.time
stayed 0. The ceiling moved, the current value did not, and nothing else was written.
- proof 9: met — `npm run tasks -- merge-ready` at f1ff013: tsc ok pass, npm test ok pass, layer-check
ok pass, audit-status ok pass, doctor ok pass (17 warnings, none of which fail the leg), bytes ok
pass, and additionally tree ok pass (nothing uncommitted) and base ok pass (main has not moved past
the merge base). All six legs the clause names are green. The two legs reporting FAIL are `spec
skill-levels-xp-events` (1 open member) and `clauses skill-levels-xp-events` (c5 outstanding from
pass 1); neither is named by the clause, and both are what this pass and the member's closure
discharge.
