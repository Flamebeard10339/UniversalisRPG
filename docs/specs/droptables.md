# droptables

Closes `droptables`.

## Deliverable

A drop is not a section kind, it is a **result that wraps results**. Wherever the DSL already takes
a result list — an action's `results`/`on success:`/`on failure:`/`on escape:`, a resource's
`on empty:`/`on full:`, a dialogue effect — it now also takes a chance wrapper, and a wrapper's body
is an ordinary result list, so layering is nesting and needs no rule of its own. `give:` is not
sugar for a table and no table engine sits beside it: one grant path serves both because a
100%-certain single grant *is* the degenerate wrapper.

Four selectors, and the difference between the first three is the difference the task's evidence
says a droptable system must not blur:

| written | semantics | draws |
| --- | --- | --- |
| `<n> in <m>:` | authored odds, rolled independently of every sibling | 1 |
| `<stat> vs <stat\|number>:` | contested odds through the existing `hitChance`, so gear and buffs move a drop rate | 1 |
| `one of:` with `<n>x:` / `<stat>:` rows | exactly one row, selected by weight | 1 |
| `if <condition>:` | a certainty gated on state | 0 |

`one of:` is *pick-one*; sibling `<n> in <m>:` lines are *every-entry*. The classic droptable bug is
writing one and getting the other, and here they are different words.

A row carries its gate in its selector — `2x if melee >= 40:` — because a gated row must leave the
pool **before** the draw and let the survivors renormalize. Writing the gate inside the row's body
instead would select a dead row and then void it, which is a different distribution and the exact
trap the wrapper design exists to avoid.

A named, reusable table is `# droptable <id>`, whose body is that same result list, invoked with
`roll: <id>`. It is a section like any other: namespaced, referenced, removable, round-tripped —
nothing about references, resolution or merging is recreated for it.

Produced quantities become ranges, sampled like every other range, wherever a quantity is *produced*
and nowhere a number is a *threshold*: `give:`, a recipe's `out:`/`burnt:`, `xp:`, `drain:`/
`restore:` take `4-7`; `take:`, a recipe's `in:`, `has 5 potion`, `escape after 3`, `skill: cooking
15`, a comparison's right side, `<n> in <m>` and `<n>x` do not. `add:` is produced and still does
not, because it is the one signed count and `-3--1` cannot be told from a hyphen separator.

Proof:

- [c1] `<n> in <m>:` fires its body with probability n/m, drawn from `state.rng`, independently of
  every sibling wrapper. Its body is written inline (`1 in 5: give: 1 rat-tail`) or as an indented
  block, and a block body may hold any result including another wrapper. `0 in 5`, `6 in 5` and
  `1 in 0` are load errors naming the line.
- [c2] `one of:` selects exactly one row by weight and applies only that row's body. A row is
  `<n>x:` (literal weight) or `<stat>:` (weight read live from a stat, so a `luck` stat shifts the
  distribution without the table being touched), and `nothing` is the row body that means no
  results — the one spelling for the empty case, which is why it exists and why it is not accepted
  anywhere the empty case is already writable. `one of:` with no rows, a row with an empty body, a
  zero or negative literal weight, and a `vs` selector used as a row are each load errors.
- [c3] `if <condition>:` applies its body when the condition holds and draws nothing either way,
  taking the whole condition grammar — `and`, `or`, `not`, `has`, comparisons — unchanged. A row
  spells its gate in its selector, `<n>x if <condition>:` / `<stat> if <condition>:`, and a row whose
  gate is false is removed from the pool before the weighted draw, so the survivors' shares grow. A
  test pins that against the wrong reading, where the row is selected and then produces nothing.
- [c4] `<stat> vs <stat|number>:` fires its body with `hitChance(left, right)` — the same function
  and the same `contest-spread` tuning variable the attack roll uses, both sides read with
  `statValue` through the namespace. A stat bonus on the left side moves the observed drop rate, and
  a test pins that it does.
- [c5] Draw order is fixed and total: results are applied in source order; a wrapper draws once for
  its own selector and then recurses into its body depth-first; a certainty draws nothing, which is
  what keeps `give: 1 bones` free of the RNG and every pre-existing seeded test byte-identical. Two
  runs from one seed produce one sequence, and a segment split in two produces the same sequence as
  the whole.
- [c6] Applying a result group `count` times no longer multiplies amounts when the group is
  stochastic — it applies the group `count` times, in order, and stops on the repetition that rolled
  a `stop`. Batched repeating actions (`resolveDeterministicSegment` → `fightBatch`) therefore roll
  each repetition separately instead of rolling once and scaling. A `stop` behind a selector ends
  the action exactly once and gives the same answer jumped as stepped.
- [c7] `# droptable <id>` is a section whose body is a result list. `roll: <id>` applies it. It
  resolves, validates, prunes with a missing optional dependency, `# remove droptable <id>` works,
  and it round-trips through `serialize` — all through the existing machinery, with `droptable`
  added to `NAMESPACED_KINDS`, `ReferenceKind`, `CONTENT_SECTION_MAPS` and the prune loop rather
  than through anything new. An empty `# droptable` is a load error.
- [c8] A cycle among droptables is a load error naming the tables in it, checked once over the built
  registry beside the other whole-registry validations. `roll:` naming an unknown table is the same
  unknown-reference error every other kind gets.
- [c9] Ranged produced quantities: `give: 5-10 arrows`, `out: 2-4 feather`, `burnt:`, `xp: melee
  4-6`, `drain: 2-4 health`, `restore: 3-5 health`. Item and xp counts sample as **integers**
  uniform over the closed range; pool deltas sample as decimals, as pools already do. A point range
  draws nothing. `take:`, `in:`, `add:` and every threshold listed in the deliverable reject a range
  at parse time, each with a message saying so.
- [c10] The zero rule inverts. `values.ts` refuses a written `0` today because a line that grants
  nothing does nothing; with a range, `give: 0-3 bones` means "sometimes nothing", which is the
  point. What does nothing is an upper bound of zero, so that is what is refused, and `0-0` is
  refused by the same clause rather than a second one.
- [c11] The shipped giant rat drops through a table: a certain grant, an independent chance, a
  weighted `one of:` including a `nothing` row, and a `roll:` into a shared rare table that a second
  entity also names. A `# test` section replays it over the shipped content, and `integration.test.ts`
  runs it.
- [c12] `npx tsc --noEmit`, `npm test`, `npm run layer-check`, `npm run audit-status` and
  `npm run tasks -- doctor` pass before the spec is marked done.

## Decisions

- **A wrapper is a result, not a section.** The task's evidence described a `# droptable` section
  with `every`/`pick-one` bodies and a `give:` desugaring. The author replaced it with wrappers over
  the result list, and it is strictly better: a chance composes with `say:`, `set:`, `xp:` and
  `stop` for free, it works in a dialogue effect and a resource's `on empty:` without those knowing
  what a drop table is, and layering is nesting rather than a second reference kind. The named
  section survives for *reuse*, which composition genuinely does not give.
- **`give:` is not rewritten into a table.** The evidence asked for `give:` to become sugar for a
  single-entry table. Under wrappers there is no parallel path to collapse — `give:` is the leaf
  every wrapper bottoms out in — so rewriting it would add a representation, not remove one, and
  would put a draw where a certainty belongs.
- **`nothing` is a row body, not a result kind.** An empty `one of:` row cannot otherwise be
  written; every other empty case already can be, and CLAUDE.md's own reasoning against giving one
  kind two spellings applies. So `nothing` parses to `results: []` and prints back as `nothing`,
  and `out: nothing` on a recipe — which the author sketched — is **not** accepted, because
  omitting `out:` already says it.
- **Weights renormalize; there is no sum rule.** `12x/5x/2x/1x` is a share of the total, so adding a
  row does not force rebalancing the others, and a `<stat>:` weight shifts the distribution without
  breaking an invariant. Percentages-summing-to-100 was considered and rejected for exactly that:
  a luck stat scaling one entry breaks the sum, so the rule would have to be suspended at the one
  moment it mattered.
- **A gate is a selector, not a body line.** The author sketched `2x:` with `requires: melee >= 40`
  inside the row, and pulled the whole idea back into this branch on the grounds that gating a
  result group is generally useful rather than a droptable feature. Agreed, and that is why it is
  `if <condition>:` beside the other three selectors: a condition in the body reads as "produce
  nothing when false", which for a weighted row is the wrong distribution, while a condition in the
  selector reads as "this row is not in the pool", which is the right one. `if` rather than
  `requires` because `requires:` is already an action field meaning something adjacent but different
  — it gates the action, not the group — and one word doing both inside one body is how that
  distinction gets lost.
- **`vs` is refused as a `one of:` row.** A contested check produces an independent probability, not
  a share of a total; reading one as a weight would be a category error the author named directly.
- **Ranges are for produced quantities only.** `take: 5-10 arrows` and `in: 1-3 log` would make
  consumption nondeterministic, which breaks `perCompletionCost` and `inputLimit` — a craft could
  not say how many completions it can afford. Thresholds (`has`, `escape after`, comparisons,
  `<n> in <m>`, `<n>x`) are floors and counts, and a range there is a distribution over a
  distribution.
- **A produced quantity forks its readers, not its storage.** `Quantified.amount` becoming a `Range`
  splits every caller the same way `statValue`/`sampleStat` already split: one wants the range
  without a draw, one wants a sample. So the range is what is *stored* and each caller says which it
  wants — `serialize` prints `4-7` through the `range()` helper it already has, the runtime samples
  through a `sampleCount` that mirrors `sampleStat`'s shape including its point-range shortcut. The
  range is never collapsed on the way in. Consumed quantities stay a plain number, a separate type
  from a produced one, so no consuming caller is offered the choice at all — which is what keeps
  `perCompletionCost` and `inputLimit` answerable.
- **Batching yields to sampling.** A stochastic result group cannot be applied as `amount × count`.
  Rather than teaching the resolver which actions are batchable, `applyResults` asks the group and
  loops when the answer is yes — the same conclusion the combat log reached ("combat does not
  batch") applied at the one seam that already had a `count`.
- **`stopsOnOutcome` stays shallow, on measurement rather than instinct.** It was first made to see
  a `stop` nested inside a selector, so a batch that might stop would still be capped at one
  completion. Mutation testing found that unobservable and it was reverted: a nested `stop` implies
  a wrapper, a wrapper implies `samplesPerApplication`, and that loop already breaks on the
  repetition that stopped. Two guards over one case, and no test could tell them apart. What is kept
  instead is the coupling written down where it holds — every wrapper answers yes to
  `samplesPerApplication` — and a stopping test whose action hides its `stop` behind a `one of:`,
  which dies when the loop's break is removed.

## Corrections to the task store

- The `droptables` record grants `src/grammar/dropTable.ts`, `src/grammar/values.ts`,
  `src/content/registry.ts`. There is no `src/grammar/dropTable.ts`: the wrappers belong in
  `src/grammar/actionResult.ts`, because the union, the leaf parsers and the wrapper parsers are
  mutually recursive and splitting them buys a cycle rather than a seam. The real surface is
  corrected on the record before implementation.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-04

- base: `605b8688ae194ecb24c08ea9c03f18e7c3cbc420`
- head: `59a4a928571620bbe064604f8bd9e6912b767d00`
- proof 1: met — src/content/dropTable.test.ts 'reads authored odds, and refuses the three that are not odds' + 'reads a body inline or as a block' + 'nests a wrapper inside a wrapper'; rate in src/runtime/dropTable.test.ts 'fires authored odds at the rate it authored' and 'rolls each sibling independently'. Mutation 'chance comparison < -> >=' in effects.ts KILLED (1 of 16, src/runtime/dropTable.test.ts).
- proof 2: met — src/content/dropTable.test.ts 'reads a weighted pick-one, with nothing as the empty row' and 'refuses a one of: that can select nothing, and a vs read as a weight'; src/runtime/dropTable.test.ts 'selects exactly one row of a one of:, in proportion to weight' (asserts coins+gem <= 1 over 200 seeds) and 'reads a row weight from a stat'. probe: '1 in 2: nothing' -> 'unrecognized action result'. Caveat: a negative literal weight is a load error but reports 'expected an id'.
- proof 3: met — Mutation 'a gated-off row stays in the pool, selected and then voided' (selectRow filter -> map emptying results, the exact wrong reading) KILLED, 1 of 16 in src/runtime/dropTable.test.ts ('gives the survivors the failed row s share', which asserts rate == 1 where the wrong reading gives 0.5). probe: 'if not lit or n >= 3:' loads.
- proof 4: met — effects.ts:151 uses the same hitChance from ./stats as runtime.ts:191, both sides via statSide -> statValue. Mutation 'hitChance(...) -> 0.5' KILLED, 1 of 16 in src/runtime/dropTable.test.ts ('fires a contest at hitChance, and a bonus on the left side moves it').
- proof 5: met — src/runtime/dropTable.test.ts 'gives one sequence from one seed', 'leaves a certainty free of the rng', 'spends one draw on a range and none on a point'. Split-vs-whole over a stochastic group: src/runtime/stopping.test.ts 'sees a stop behind a selector' compares the 100s span jumped and stepped.
- proof 6: met — src/runtime/dropTable.test.ts 'rolls a chance per repetition', 'rolls a range per repetition', 'still scales a certainty'. Mutation 'samplesPerApplication branch disabled' KILLED 3 of 31 (dropTable+stopping); mutation 'repetition loop ignores a stop' KILLED 1 of 1385 whole-suite.
- proof 7: met — probe --round-trip over a wrapper as an action's sole result, a dialogue node effect, a choice effect and a resource on empty: -> 'round-trips clean'. probe of 'dependencies: ?base' with the rare table giving an absent item -> rare pruned, droptable 1 left. Mutations 'nestedResults recursion removed from referenceSites' and 'droptable removed from NAMESPACED_KINDS' each KILLED 5 of 1385. Two branches in this clause have no test — see the prune-loop and spansLines findings.
- proof 8: met — src/content/dropTable.test.ts 'refuses an empty table, an unknown roll, and a table that reaches itself'. Mutation 'dropTableCycle(registry) -> null' KILLED 1 of 1385 whole-suite.
- proof 9: unmet — Ranges themselves are met (src/content/dropTable.test.ts 'takes a range where a quantity is produced', 'takes a range on a recipe out: and burnt:', src/runtime/dropTable.test.ts 'samples a produced count as an integer covering both ends'). The clause also promises each refusing site rejects a range 'with a message saying so'; only take:/in:/add: do. Probed: 'has 5-10 potion' -> 'expected an id'; 'escape after 3-5' -> 'unexpected content after an action field: -5'; 'skill: fletching 15-20' -> 'unexpected content: -20'; 'counter >= 1-3' -> same shape; '1-2 in 5:' -> 'unrecognized tag clause'; '1-2x:' -> 'expected an id'.
- proof 10: met — src/content/dropTable.test.ts 'inverts the zero rule: a floor of zero is the point, a ceiling of zero is not' — 0-3 loads, 0 and 0-0 both throw 'a count of 0 does nothing', drain: 0 throws the same shape.
- proof 11: met — Mutation 'the rat stops rolling its remains and the shared table' (both roll lines deleted from giant-rat on success: in content/tutorial-island.dsl) KILLED, 1 of 9 in src/runtime/integration.test.ts — # test miki-route-full's expect: miki-route-end pins rat-bone 7, melee 16 and the rng cursor. The second-entity half is held by nothing — see the dresser-trinket finding.
- proof 12: met — npm run tasks -- merge-ready on 59a4a92: tsc, npm test, layer-check, audit-status, doctor (430 tasks, 0 errors) and bytes all pass — 'merge-ready: every leg passed'.

### Pass 2 — 2026-08-04

- base: `605b8688ae194ecb24c08ea9c03f18e7c3cbc420`
- head: `c25c2478fd720537565013cfc18f58146e0a11b7`
- proof 1: met — src/content/dropTable.test.ts 'reads authored odds, and refuses the three that are not odds' + 'reads a body inline or as a block' + 'nests a wrapper inside a wrapper'; rate in src/runtime/dropTable.test.ts. Re-run after the fix commit: mutation 'the chance comparison is inverted' KILLED 2 of 18 in src/runtime/dropTable.test.ts.
- proof 2: met — src/content/dropTable.test.ts 'reads a weighted pick-one, with nothing as the empty row' and 'refuses a one of: that can select nothing, and a vs read as a weight'; src/runtime/dropTable.test.ts 'selects exactly one row of a one of:, in proportion to weight' and 'reads a row weight from a stat'. Caveat unchanged from pass 1: a negative literal weight is a load error reported as 'expected an id'.
- proof 3: met — Mutation 'a gated-off row stays in the pool, selected and then voided' (selectRow filter -> map emptying results) KILLED 1 of 18 in src/runtime/dropTable.test.ts ('gives the survivors the failed row s share').
- proof 4: met — Mutation 'a contest is a coin flip rather than hitChance' KILLED 1 of 18 in src/runtime/dropTable.test.ts ('fires a contest at hitChance, and a bonus on the left side moves it'). effects.ts:156 and runtime.ts share the same hitChance import.
- proof 5: met — src/runtime/dropTable.test.ts 'gives one sequence from one seed', 'leaves a certainty free of the rng', 'spends one draw on a range and none on a point'; split-vs-whole in src/runtime/stopping.test.ts 'sees a stop behind a selector'. Unchanged by the fix commit, which touches no rng path.
- proof 6: met — Mutation 'a stochastic group is scaled once instead of repeated' (samplesPerApplication branch disabled) KILLED 4 of 33 across src/runtime/dropTable.test.ts and src/runtime/stopping.test.ts. The lead parameter added by the fix commit is held by 'leaves what a batch says alone' and 'lets a say inside a wrapper speak on every repetition'.
- proof 7: met — Mutation 'references inside a wrapper body are never walked' KILLED 5 of 1393 whole-suite. Both pass-1 survivors are now dead: 'the droptable prune loop is deleted' KILLED 1 of 21 and 'serialize inlines a wrapper again' KILLED 1 of 21, both in src/content/dropTable.test.ts. Caveat: a table holding a ranged restore: does not round-trip - see the serialize finding.
- proof 8: met — Mutation 'a droptable cycle is never checked' (dropTableCycle -> null) KILLED 1 of 21 in src/content/dropTable.test.ts 'refuses an empty table, an unknown roll, and a table that reaches itself'.
- proof 9: met — The second half is now delivered where pass 1 found it missing. Mutations 'a threshold accepts a range again' (refuseRange dropped from values.ts number) and 'a ranged selector is no longer claimed' each KILLED 1 of 21 in src/content/dropTable.test.ts, over 'refuses a range at every threshold' and 'refuses a range in a selector'. Probed: has 5-10 potion, c >= 1-3, skill: c 15-20, escape after 3-5, 1-2 in 5:, 1-2x: all name the range. Residual: 1 in 5-10: still reports 'unrecognized tag clause' - filed low.
- proof 10: met — Mutation 'the zero rule stops being inverted' (refuseZero range.max -> range.min) KILLED 1 of 21 in src/content/dropTable.test.ts 'inverts the zero rule: a floor of zero is the point, a ceiling of zero is not'.
- proof 11: met — Pass 1's survivor is dead: mutation 'the dresser stops rolling the shared table' (luck vs 60: roll: trinket deleted from search drawer:) KILLED 1 of 9 in src/runtime/integration.test.ts, now that # test dresser-trinket carries expect: dresser-trinket-end. The rat half stays held by # test miki-route-full.
- proof 12: met — npm run tasks -- merge-ready on c25c247: tsc, npm test, layer-check, audit-status, doctor (438 tasks, 0 errors) and bytes all pass - 'merge-ready: every leg passed'.
