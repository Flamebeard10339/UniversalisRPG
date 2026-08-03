# DSL load path — action-kinds-and-templates, 2026-08-03

Independent pass over the diff `main...action-kinds-and-templates` (b93f18d, d76154b). System:
DSL load path, with cross-system effects into Runtime. Commissioned with CLAUDE.md's audit prompt
plus the regression question — "is anything worse than before" — asked in its own right.

Gates at the time of the pass: `tsc --noEmit` clean, 968 tests green in 62s, `build` clean,
`layer-check` 482 imports all downward, `tasks doctor` 0 errors, `audit-status` partition intact.

Every finding below was reproduced by the planner independently of the auditor's report before it
was recorded.

## H1 — a patch that adds `type:` to an existing entity inherits nothing, silently

`src/content/registry.ts:290-304`, `:572`

`entityTypeBase` is reached through `byId.get(id)?.value ?? entityTypeBase(...)`, so it is consulted
only on an entity's **first** declaration. A second module patching `type:` onto an entity that
already exists is a no-op that reports nothing:

```
base:  # entitytype melee-foe ... / # entity rat  (no type:)
patch: # entity base.rat / type: base.melee-foe
=>     rat.type = 'base.melee-foe'   rat.actions = []
```

The `type:` resolves, validates, survives pruning and serializes. Patch-a-section-into-existence is
the DSL's headline merge rule (`merge.ts:80-83`, "whether the section creates or edits is not
declared"); `type:` is the one field that silently opts out of it.

**Deliverable:** the template base applies whenever `type:` first appears on an entity, whichever
module writes it — or a patch introducing `type:` is refused with a message saying why.

## H2 — the kind/cadence table is not enforced on the merged action, only the authored block

`src/grammar/action.ts:139-153`, `src/content/merge.ts:42-54`, `src/runtime/stats.ts:73-75`

`resolveKind` runs inside `actionBody.parseBlock`. Nothing re-checks after `mergeEntries`/`overlay`,
so an entity block overlaying a template action assembles states the loader claims cannot exist, and
the runtime resolves the contradiction by discarding an authored field with no diagnostic:

```
template fight: continuous / rate: swing-rate      entity fight: time: 5
=> merged {kind:'continuous', time:5, rate:'swing-rate'}   attemptDuration 2000ms, not 5000ms
   the same pair authored directly: "action time: and rate: are the same axis written two ways"

template fight: continuous / rate: 30              entity fight: instant
=> merged {kind:'instant', rate:30}
   authored directly: "an instant action takes no rate:"
```

Templates are what make these reachable, but the hole is in the merge path generally: a plain
cross-module entity patch reaches it too. c2's "enforced at load" is true of the authored surface
and false of the loaded one.

**Deliverable:** the table runs over each merged action at build time, so an unauthorable action
cannot be assembled by merge.

## H3 — serialize prints a template-bearing entity in a form that will not reload

`src/content/serialize.ts:240-252`, `:358-359`

`entitySection` prints `type:` **and** the entity's fully flattened action list, so a reload merges
the entity onto the template a second time and the flattened block collides with what it was built
from. Round-tripping the H2 fixture:

```
# entity rat
type: base.foe
fight:
  instant
  rate: 30          <- inherited, now restated
=> reload ERROR: an instant action takes no rate:
```

This reaches two real workflows, not just probes: `scripts/squash-local-changes.ts:116-124`
serialize-then-reloads and hard-fails on invalid output, and `src/content/modportal.ts:153`
canonicalises every web contribution the same way.

Even in the benign case the printer undoes the deliverable: the shipped rat comes back with all
~14 inherited lines restated, so a later edit to `# entitytype melee-foe` no longer reaches the
canonicalised entity. `registryDiff` is 0 for shipped content, which is why the round-trip gate
does not see this.

**Deliverable:** `entitySection` prints only what the entity authored over its template, so
print→load is a fixpoint for a template-bearing entity.

## M1 — `# recipe` cadence is unvalidated, so a recipe compiles the action the grammar refuses

`src/content/recipe.ts:40`, `src/content/registry.ts:104-110`

`rate: { parser: numberOrStat }` has no positivity check and `spannable` only tests
`rate !== undefined`:

```
# recipe dig / rate: 0    -> loads clean, compiles {kind:'continuous', rate:0}
                             first craft: "impossible attempt duration (Infinity)"
# recipe dig / rate: -30  -> loads clean, first craft: "(-2000)"
# recipe dig / time: -3   -> loads clean, silently compiles to an instant craft
```

`rate: 0` on an action is a load error. `rate:` on recipes is new in this branch.

**Deliverable:** `recipeSchema` validates `time:`/`rate:` positivity at load with the action
grammar's message.

## M2 — the doc AGENTS.md calls authoritative now teaches syntax that fails to load

`docs/dsl-rewrite/grammar.md:249, 262-264, 423, 524-529, 559-587, 603`; `AGENTS.md:20`

It still documents `repeating` as a bare tag, `speed: <stat-id>` as a field, and `time:` as
"defaults to 0 (instant) if omitted", with a worked `repeating` + `speed: cooking-speed` example.
After this branch `speed:` is a hard load error and `repeating` is a silently ignored no-op. This
section was correct before the branch, so it is strictly worse now.

**Deliverable:** grammar.md's action section documents the three kinds, `rate:`,
`default-action-duration`, `# entitytype` and `type:` — or loses its authoritative designation.

## M3 — none of the five table errors names the action it rejected (this is c2's unmet half)

`src/grammar/action.ts:140-152`

```
an instant action takes no rate:
a continuous action needs a time: or rate: to set its pace
an action cannot be both instant and continuous
action time: and rate: are the same axis written two ways; give one
action time must be positive — an action that takes no time is tagged instant
```

No label, no owning section, where the repo's siblings manage both (`# entity X: retaliating action
"fight" requires a target: pool`). The structural reason: `EntryBody.parseBlock(lines)` receives only
body lines — the section engine applies the label afterwards — so the fix is a seam, not a string
edit. `formatModuleDiagnostic` supplies file:line only on the diagnostics path, and points at the
first modifier line rather than the block header.

## Lows

- **L1** `src/runtime/runtime.ts:152` and `:227` still tell authors to "give it a positive time: or
  a positive speed stat". The sibling at `:421` was reworded; these two were missed.
- **L2** `time: abc` now reports `expected a number` where main reported `action time requires a
  non-negative number`. `seconds` delegates to `decimal.parse`, whose generic message has no field
  context and builds a zero-width span rather than using `line.span`.
- **L3** `src/content/references.test.ts:152-153, 159-161` inject the retired word `repeating` into
  their fixture, so `strike` becomes an untagged cadence-less action rather than the continuous one
  the comment describes. The assertions pass because they check a different error.
- **L4** `content/tutorial-island.dsl` `front-door.pick lock` (which carries an inert `4s` tag) and
  `dresser.search drawer` are the two shipped actions left untagged with no cadence. Both plausibly
  should span, so c5 holds, but the forward claim is weaker than the clause states.
- **L5** the "unknown entitytype" message has two producers — `registry.ts:301` and the
  `referenceSites.ts:195` validation path — and `entityType.test.ts:118`/`:135` hit them with one
  regex, so drift in either is invisible.

## Regression question

No regression in the arithmetic, the save shape, or merge ordering:

- Every rewritten cadence site is neutral to the millisecond: 25/min → 2400, 16/min → 3750, hasted
  31.25/min → 1920, oven `time: 4` ≡ `rate: 15` → 4000, campfire `speed: cooking-speed(1)`+`time: 1`
  → `rate: cooking-rate(60)` → 1000 and 500 buffed. Scaling `MS_PER_MINUTE / perMinute` reddens 8
  cadence tests.
- Dropping `Math.floor(timeMs / speed)` on the `time:` branch is safe; `secondsToMs` already rounds.
- `ActiveAction.repeating` kept its name and is derived at arm time; no serialized field moved.
- Pass 2 walks modules and sections in source order exactly as the single pass did; only
  `entitytype` moves earlier, and swapping the pass order reddens 8 `entityType.test.ts` cases.

Regressions found: **H3** (serialize round-trip newly breaks for template-overriding entities and
re-inflates the shipped rat), **M2**, **L1**, **L2**.

## Clause verdicts

| # | verdict |
| --- | --- |
| c1 | met — `repeating` gone from the interface and from `BOOLEAN_ACTION_FLAGS`; forcing `actionKind` to `'duration'` reddens 9 tests across cadence/stopping/time |
| c2 | **unmet** — all six errors fire (mutation-checked), but none names the offending action; see M3. H2 also shows the table is not enforced on the merged form |
| c3 | met — `speed` gone from `Action`, `Recipe`, `referenceSites`, `serialize` and every fixture; the millisecond pin in `cadence.test.ts` reddens under a rate mutation |
| c4 | met — `time.test.ts` sets the variable to 7 and asserts the untagged action spans it while the `instant` one stays 0; ignoring the variable reddens exactly that test. The clause says "N milliseconds' worth" where the code uses seconds; the wording is what is wrong |
| c5 | met — mirror, four stairs actions and both `eat:` carry `instant`, the oven carries `continuous`, variable ships at 0; only `pick lock` and `search drawer` are untagged and both plausibly span (L4) |
| c6 | met — `fields: {}` refuses a non-action line; `structuredClone` at `registry.ts:304`, and sharing the reference reddens the three-way non-identity test |
| c7 | met — one merge implementation, `entityTypeBase` feeding `mergeSection`; dropping the base reddens 4 entityType + 12 cadence tests. H1 is *when* it is invoked, H2 is what the overlay may produce |
| c8 | met — own-context validation, `# remove entitytype` and unresolvable `type:` all pinned; the entity-side round-trip is H3 |
| c9 | met — zero assertion values changed across contest/encounter/enemy-pool/equipment/stopping; the two changed expectations elsewhere are both named in the spec |
| c10 | met — all five gates run above, full suite 62s |

## Must not merge without

H1, H2, H3. All three are silent — no error, no failing test — and all three sit outside what the
shipped content exercises, so the green suite says nothing about them. c2 is unmet and becomes an
open `undelivered` member rather than a triage item.
