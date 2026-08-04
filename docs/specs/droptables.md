# droptables

Closes `droptables`.

## Deliverable

A drop is not a section kind, it is a **result that wraps results**. Wherever the DSL already takes
a result list — an action's `results`/`on success:`/`on failure:`/`on escape:`, a resource's
`on empty:`/`on full:`, a dialogue effect — it now also takes a chance wrapper, and a wrapper's body
is an ordinary result list, so layering is nesting and needs no rule of its own. `give:` is not
sugar for a table and no table engine sits beside it: one grant path serves both because a
100%-certain single grant *is* the degenerate wrapper.

Three selectors, and the difference between them is the difference the task's evidence says a
droptable system must not blur:

| written | semantics | draws |
| --- | --- | --- |
| `<n> in <m>:` | authored odds, rolled independently of every sibling | 1 |
| `<stat> vs <stat\|number>:` | contested odds through the existing `hitChance`, so gear and buffs move a drop rate | 1 |
| `one of:` with `<n>x:` / `<stat>:` rows | exactly one row, selected by weight | 1 |

`one of:` is *pick-one*; sibling `<n> in <m>:` lines are *every-entry*. The classic droptable bug is
writing one and getting the other, and here they are different words.

A named, reusable table is `# droptable <id>`, whose body is that same result list, invoked with
`roll: <id>`. It is a section like any other: namespaced, referenced, removable, round-tripped —
nothing about references, resolution or merging is recreated for it.

Produced quantities become ranges, sampled like every other range, wherever a quantity is *produced*
and nowhere a number is a *threshold*: `give:`, a recipe's `out:`/`burnt:`, `xp:`, `drain:`/
`restore:` take `4-7`; `take:`, a recipe's `in:`, `has 5 potion`, `escape after 3`, `skill: cooking
15`, a comparison's right side, `<n> in <m>` and `<n>x` do not.

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
- [c3] `<stat> vs <stat|number>:` fires its body with `hitChance(left, right)` — the same function
  and the same `contest-spread` tuning variable the attack roll uses, both sides read with
  `statValue` through the namespace. A stat bonus on the left side moves the observed drop rate, and
  a test pins that it does.
- [c4] Draw order is fixed and total: results are applied in source order; a wrapper draws once for
  its own selector and then recurses into its body depth-first; a certainty draws nothing, which is
  what keeps `give: 1 bones` free of the RNG and every pre-existing seeded test byte-identical. Two
  runs from one seed produce one sequence, and a segment split in two produces the same sequence as
  the whole.
- [c5] Applying a result group `count` times no longer multiplies amounts when the group is
  stochastic — it applies the group `count` times, in order. Batched repeating actions
  (`resolveDeterministicSegment` → `fightBatch`) therefore roll each repetition separately instead
  of rolling once and scaling, and `stopsOnOutcome` sees a `stop` nested inside a wrapper so a
  batch that might stop is still capped at one.
- [c6] `# droptable <id>` is a section whose body is a result list. `roll: <id>` applies it. It
  resolves, validates, prunes with a missing optional dependency, `# remove droptable <id>` works,
  and it round-trips through `serialize` — all through the existing machinery, with `droptable`
  added to `NAMESPACED_KINDS`, `ReferenceKind`, `CONTENT_SECTION_MAPS` and the prune loop rather
  than through anything new. An empty `# droptable` is a load error.
- [c7] A cycle among droptables is a load error naming the tables in it, checked once over the built
  registry beside the other whole-registry validations. `roll:` naming an unknown table is the same
  unknown-reference error every other kind gets.
- [c8] Ranged produced quantities: `give: 5-10 arrows`, `out: 2-4 feather`, `burnt:`, `xp: melee
  4-6`, `drain: 2-4 health`, `restore: 3-5 health`. Item and xp counts sample as **integers**
  uniform over the closed range; pool deltas sample as decimals, as pools already do. A point range
  draws nothing. `take:`, `in:` and every threshold listed in the deliverable reject a range at
  parse time, each with a message saying so.
- [c9] The shipped giant rat drops through a table: a certain grant, an independent chance, a
  weighted `one of:` including a `nothing` row, and a `roll:` into a shared rare table that a second
  entity also names. A `# test` section replays it over the shipped content, and `integration.test.ts`
  runs it.
- [c10] `npx tsc --noEmit`, `npm test`, `npm run layer-check`, `npm run audit-status` and
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
- **`vs` is refused as a `one of:` row.** A contested check produces an independent probability, not
  a share of a total; reading one as a weight would be a category error the author named directly.
- **Ranges are for produced quantities only.** `take: 5-10 arrows` and `in: 1-3 log` would make
  consumption nondeterministic, which breaks `perCompletionCost` and `inputLimit` — a craft could
  not say how many completions it can afford. Thresholds (`has`, `escape after`, comparisons,
  `<n> in <m>`, `<n>x`) are floors and counts, and a range there is a distribution over a
  distribution.
- **Batching yields to sampling.** A stochastic result group cannot be applied as `amount × count`.
  Rather than teaching the resolver which actions are batchable, `applyResults` asks the group and
  loops when the answer is yes — the same conclusion the combat log reached ("combat does not
  batch") applied at the one seam that already had a `count`.

## Corrections to the task store

- The `droptables` record grants `src/grammar/dropTable.ts`, `src/grammar/values.ts`,
  `src/content/registry.ts`. There is no `src/grammar/dropTable.ts`: the wrappers belong in
  `src/grammar/actionResult.ts`, because the union, the leaf parsers and the wrapper parsers are
  mutually recursive and splitting them buys a cycle rather than a seam. The real surface is
  corrected on the record before implementation.

## Open questions

None.
