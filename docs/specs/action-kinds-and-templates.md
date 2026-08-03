# action-kinds-and-templates

Closes `action-time-taxonomy` and `entity-action-templates`.

## Deliverable

An action declares **what ends it** as a named kind, and **how fast it attempts** as exactly one
cadence field. The two are separate axes; today they are one, and `time: 60` is folklore for
"`speed:` reads as attempts per minute". After this branch there is one live-stat cadence channel
(`rate:`), `speed:` is gone, and an absent cadence has a named default instead of a TODO.

An entity names a shared `# entitytype` instead of every enemy re-authoring the same combat clauses.
The template compiles into each entity's own `actions` array at load through the merge rule the
repo already has, so no new resolver or runtime concept appears.

The cadence table, whole:

| kind | written | cadence |
| --- | --- | --- |
| instant | bare tag `instant` | neither `time:` nor `rate:` |
| duration | untagged; the default | at most one of `time:`/`rate:`; absent falls back to `# variable default-action-duration` |
| continuous | bare tag `continuous` (renames `repeating`) | exactly one of `time:`/`rate:` |

`time:` is seconds per attempt and takes a literal only. `rate:` is attempts per minute and takes a
literal **or** a stat id, read live against whoever is swinging. Any cadence value must be positive:
a zero span is `instant`, and that is the error's wording.

Proof:

- [c1] An action carries a kind. `instant` and `continuous` are bare tags; an untagged action is
  `duration`. `Action.kind` is what the runtime reads to decide re-arming, and the authored
  `repeating` field no longer exists — `continuous` is the only spelling.
- [c2] The table is enforced at load, each by a named error with the offending action in the message:
  `instant` carrying a cadence field; `continuous` carrying none; `time:` and `rate:` on one action;
  `instant` and `continuous` on one action; a cadence value that is not positive. A retired `speed:`
  is a sixth, and its message names `rate:` as the replacement rather than falling through to
  "unrecognized tag clause".
- [c3] `speed:` is gone from `# entity`/`# item`/`# location` actions and from `# recipe`. Every site
  that read `time: 60` + `speed: <per-minute stat>` reads `rate: <stat>`, in shipped content and in
  every fixture, and a test pins that the millisecond attempt duration is unchanged at each of them
  (25/min → 2400ms, 16/min → 3750ms, 31.25/min → 1920ms, the oven's 4s → 15/min).
- [c4] `# variable default-action-duration` supplies the cadence of a `duration` action that declares
  none, read through `src/runtime/tuning.ts` like every other tuning variable, defaulting to 0 so no
  shipped timing moves. `TODO(default-duration)` is deleted, because an absent `time:` no longer
  means instant — `kind: 'instant'` does. A test proves that setting the variable to N spans an
  untagged action N milliseconds' worth and leaves an `instant` one at 0.
- [c5] Shipped content declares intent rather than relying on the default staying 0: the actions that
  are genuinely instant (the mirror's `look in`, the stairs, eating) carry `instant`, and the oven's
  craft carries `continuous`. Raising the variable above 0 is a later content change and lands no
  action in the wrong kind when it happens.
- [c6] `# entitytype <id>` is a section whose body is action blocks and nothing else. An entity names
  one with `type: <id>`. At load the template's actions are compiled into that entity's own `actions`
  array as **per-entity deep copies** — two entities of one type share no `Action` object, so
  reference resolution and any later patch cannot bind one entity's action through the other.
- [c7] The override rule is `mergeSection`'s existing entries-by-label overlay, invoked with the
  template's actions as the base, not a second merge implementation. An entity block whose label
  matches a template action overlays it field by field; a label the template does not have is a new
  action; a template action the entity does not name is inherited whole.
- [c8] A template is a first-class section: its references resolve and validate in its own context,
  it round-trips through `serialize`, `# remove entitytype <id>` works, and an entity naming a
  `type:` that does not resolve is a load error naming the entity.
- [c9] The shipped giant rat is authored against a template, and `cadence.test.ts`'s punchbag stops
  being a third copy of the same block. Existing combat, encounter, contest and enemy-pool tests
  keep their current expectations — the authoring shrinks, the outcomes do not move.
- [c10] `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run layer-check` and
  `npm run tasks -- doctor` pass before the spec is marked done.

## Decisions

- **`speed:` is retired rather than kept for `duration` actions.** The task's settled table gave
  `rate:` to `continuous` only, which would have left the rat's `fight`/`bite` — not `repeating`,
  therefore `duration` — still written `time: 60` + `speed: attack-rate`. That is the exact folklore
  the task exists to kill, so `rate:` is the cadence field for any kind that has one and `speed:`
  goes. This removes a field instead of adding one, at the cost of a mechanical rewrite across
  roughly eight fixture files.
- **`continuous` requires *a* cadence, not specifically `rate:`.** With `speed:` gone, `time:` and
  `rate:` are two spellings of one axis and the constraint that matters is "exactly one, positive".
  Requiring `rate:` by name would also have made `recipeAction`'s compiled `time:`-driven craft
  unrepresentable in the vocabulary it compiles into.
- **`default-action-duration` ships at 0.** The variable and its plumbing are the deliverable; the
  balance change of raising it is content work, and folding it in would make an audit separate
  taxonomy defects from timing defects inside one diff. Tagging the instant actions now is what
  makes the later raise a one-line change.
- **A template holds actions only.** Default stats on the template were rejected: it would add a
  stat-level override rule on top of the action-level one, and the settled rule "the entity-level
  body sets stats only" stops reading cleanly the moment the template can set them too.
- **`ActiveAction.repeating` keeps its name.** It is derived runtime state that is persisted in
  saves; renaming it is a save-shape change that buys nothing this branch promises.
- **`Action.kind` is optional, and absent means `duration`.** Recorded during implementation, not
  planned: `parseBlock` stamped `kind: 'duration'` on every untagged block, so an entity overriding
  one field of a `continuous` template action would have silently reset it. Absent is what an
  untagged action records now, `actionKind()` is the single place that says absent means duration,
  and c6's overlay test is the guard.
- **The template is the entity's merge base, applied in its own pass before entities merge.** Also
  recorded during implementation. The planned shape — apply templates after the merge loop — cannot
  work: an entry removal (`-bite:`) is consumed by the first merge that sees it, so a template
  applied afterwards never sees one, and the punchbag is exactly that case. Making the template the
  base puts override, addition and removal through the one merge rule. Templates settling first also
  means an entity may name a template declared after it, which nothing else in the DSL requires you
  to order; the price is that removing a template removes it outright, and an entity still naming it
  fails rather than quietly keeping what it was built from. Both are pinned.
- **An unknown bare tag on an action stays silently ignored.** Rejecting them is a strictly larger
  change than this table and would turn the dresser's inert `once` into a load failure. That `once`
  does nothing is a real defect and is filed as a finding, not fixed here.

## Corrections to the task store

Recorded against the two task records as this branch opened; both had stale evidence:

- `entity-action-templates` cites `recipeAction` at `runtime.ts:1506`. It lives at
  `src/content/registry.ts:92`.
- It also cites `scopeEntity` (`scope.ts:38`) as what mutates actions in place, and flags that it no
  longer resolves. The in-place mutation is now `resolveReferences` in `src/content/resolve.ts`
  driving `visitAction` in `src/content/referenceSites.ts`, and it runs **before** merge, not after.
- Both records' `writes` grants named a fraction of the real surface — neither mentioned
  `src/content/serialize.ts`, `src/content/referenceSites.ts`, `src/runtime/stats.ts`,
  `src/runtime/tuning.ts` or `content/`. Corrected before dispatch.
- Both are filed under system "DSL load path" while writing `src/runtime`, which the partition
  assigns to Runtime. The work is genuinely cross-system; the audit reads the diff, not the label.

## Audit passes

### Pass 1 — 2026-08-03

- base: `8f1de469c8609e685c500a1ae490ad5e1bc10c0c`
- head: `319b5b94128c727f7c072a218826e254e419b844`
- proof 1: met — repeating gone from the Action interface and BOOLEAN_ACTION_FLAGS; armAction reads actionKind(action)==='continuous'. Forcing actionKind to 'duration' reddens 9 tests across cadence/stopping/time.
- proof 2: unmet
- proof 3: met — speed gone from Action, Recipe, referenceSites, serialize and every fixture. cadence.test.ts pins 25/min=2400ms, 16/min=3750ms, hasted 31.25/min=1920ms, rate:15 identical to time:4; scaling MS_PER_MINUTE/perMinute reddens it.
- proof 4: met — DEFAULT_ACTION_DURATION read through tuning.ts like contestSpread/minDamage, ships at 0, TODO deleted. time.test.ts sets it to 7 and asserts the untagged action spans it while the instant one stays 0; ignoring the variable reddens exactly that test. Clause says 'N milliseconds worth' where code uses seconds — the wording is wrong, not the code.
- proof 5: met — mirror look-in, four stairs actions and both eat: carry instant; oven carries continuous; variable ships at 0. Enumerating every shipped action's effective kind leaves only pick-lock and search-drawer untagged with no cadence, and both plausibly span.
- proof 6: met — entityTypeSchema fields:{} refuses a non-action line; structuredClone per entity, and sharing the reference reddens the three-way non-identity assertion.
- proof 7: met — one merge implementation: entityTypeBase feeds the existing mergeSection. Overlay, addition, inheritance-whole and -label removal each covered; dropping the base reddens 4 entityType + 12 cadence tests.
- proof 8: met — own-context reference validation, serialize emits # entitytype and it reloads, # remove entitytype.x works, unresolvable type: names the entity — each pinned. The entity-SIDE round-trip is finding H3.
- proof 9: met — rat is type: melee-foe plus a 6-line fight block; punchbag is type: melee-foe plus -bite:. Zero assertion values changed across contest/encounter/enemy-pool/equipment/stopping — the diffs there are purely the mechanical vocabulary rewrite.
- proof 10: met — tsc --noEmit clean, 968 tests green in 62s, build clean, layer-check 482 imports all downward, tasks doctor 0 errors.

### Pass 2 — 2026-08-03

- base: `8f1de469c8609e685c500a1ae490ad5e1bc10c0c`
- head: `319b5b94128c727f7c072a218826e254e419b844`
- proof 1: unknown
- proof 2: unknown
- proof 3: unknown
- proof 4: unknown
- proof 5: unknown
- proof 6: unknown
- proof 7: unknown
- proof 8: unknown
- proof 9: unknown
- proof 10: unknown

### Pass 3 — 2026-08-03

- base: `8f1de469c8609e685c500a1ae490ad5e1bc10c0c`
- head: `319b5b94128c727f7c072a218826e254e419b844`
- proof 1: met — repeating gone from the Action interface and BOOLEAN_ACTION_FLAGS; armAction reads actionKind(action)==='continuous'. Forcing actionKind to 'duration' reddens 9 tests across cadence/stopping/time.
- proof 2: unmet
- proof 3: met — speed gone from Action, Recipe, referenceSites, serialize and every fixture. cadence.test.ts pins 25/min=2400ms, 16/min=3750ms, hasted 31.25/min=1920ms, rate:15 identical to time:4; scaling MS_PER_MINUTE/perMinute reddens it.
- proof 4: met — DEFAULT_ACTION_DURATION read through tuning.ts like contestSpread/minDamage, ships at 0, TODO deleted. time.test.ts sets it to 7 and asserts the untagged action spans it while the instant one stays 0; ignoring the variable reddens exactly that test. Clause says 'N milliseconds worth' where code uses seconds — the wording is wrong, not the code.
- proof 5: met — mirror look-in, four stairs actions and both eat: carry instant; oven carries continuous; variable ships at 0. Enumerating every shipped action's effective kind leaves only pick-lock and search-drawer untagged with no cadence, and both plausibly span.
- proof 6: met — entityTypeSchema fields:{} refuses a non-action line; structuredClone per entity, and sharing the reference reddens the three-way non-identity assertion.
- proof 7: met — one merge implementation: entityTypeBase feeds the existing mergeSection. Overlay, addition, inheritance-whole and -label removal each covered; dropping the base reddens 4 entityType + 12 cadence tests.
- proof 8: met — own-context reference validation, serialize emits # entitytype and it reloads, # remove entitytype.x works, unresolvable type: names the entity — each pinned. The entity-SIDE round-trip is the serialize finding.
- proof 9: met — rat is type: melee-foe plus a 6-line fight block; punchbag is type: melee-foe plus -bite:. Zero assertion values changed across contest/encounter/enemy-pool/equipment/stopping — the diffs there are purely the mechanical vocabulary rewrite.
- proof 10: met — tsc --noEmit clean, 968 tests green in 62s, build clean, layer-check 482 imports all downward, tasks doctor 0 errors.
