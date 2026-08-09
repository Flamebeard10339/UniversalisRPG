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
- [c5] A skill grants either `+1` or `+1% × level` to the stat it names, authored in the DSL with the
  existing tag-clause shape (`+1 attack` / `+1% attack`) and folded through the existing `added` and
  `increased` channels in `src/runtime/stats.ts`. No new modifier concept and no third channel.
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

## Open questions

- Whether a skill's contribution to a stat is authored on `# skill` beside `stat-id` or as an ordinary
  tag clause the skill carries. c5 fixes the two shapes (`+1 attack`, `+1% attack`) and the two channels
  they fold through; where the line is written is the worker's call after reading `src/content/skill.ts`
  and `src/grammar/tagClause.ts`.
- `captureResourceRates` evaluates a resource's `rate` and `max` through `statValue`, so a stat that
  changes mid-segment is a stat the current segment's snapshot has already read. This branch does not
  make level-ups boundary events and does not own the answer; recorded here so the resource owner
  inherits the question rather than discovering it.
