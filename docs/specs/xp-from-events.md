# xp-from-events

## Deliverable

Experience is earned from what happened, not only from an authored `xp:` result someone remembered to
write. A skill grant says `gain <expression> experience on <event>` in the body of the `# skill` it
trains, where `<event>` is an ordinary authored `# event` name — the same name an entity handler writes
after `on` — so the language has one event vocabulary and not two. What this branch adds to `# event` is the other half of that
unification: `trigger:` grows from the two pool crossings `full-refactor-of-enemies-and-combat` ships
with to a closed set that also names the discrete combat and settle moments the runtime already
produces. This branch was clauses c7–c9 of `skill-levels-xp-events` until 2026-08-09; it left because
five of its moments are defined in terms of a swing and a participant that the refactor rewrites, and
three were written against result blocks that refactor renames or repoints.

Proof:

- [c1] **There is one event vocabulary and `on <name>` means one thing.** The name after `on` in a skill
  grant is an authored `# event` id, resolved and reference-checked exactly as the name after `on` in an
  entity handler is, and an undeclared one is a load error naming no engine moment. No engine moment is
  writable directly in a grant, and no second closed list of names exists anywhere in the language. A
  reader holding the page can tell what an event is by looking at its `# event` declaration, which is
  the invariant `docs/combat/encounter-grammar.md` is written to hold.
  proof: vitest src/content/event.test.ts
- [c2] **The closed set lives in `trigger:`, beside the pool crossings that are already there.** The
  triggers are exactly the ten listed under `### Triggers` and nothing else. An unrecognised trigger
  fails at load with an error naming the triggers that do exist, and adding an eleventh requires editing
  that list. This is where the closed set belongs because `trigger: on empty` already is one.
  proof: vitest src/content/event.test.ts
- [c3] **A trigger's arity is `resource:`, and it is known at parse time.** Because the set is closed,
  each name declares whether it requires a `resource:` line: `trigger: on empty` does, `trigger:
  damage-taken` does not. A declaration violating its trigger's arity is a load error that names the
  arity it violated, in either direction — a missing `resource:` and a superfluous one are both refused.
  proof: vitest src/content/event.test.ts
- [c4] **A trigger name says whose view it is, and the entity it fires on follows from the name alone.**
  One swing produces `damage-dealt` on the performer and `damage-taken` on the struck; a swing that does
  not land produces `missed` on the performer and `evaded` on the struck. That is why there are four
  names for two moments rather than two names plus a rule. An event fires on the entity whose view its
  name is, and `credit:` remains the one marked way for a result to reach anyone else, unchanged from
  the refactor's c9.
  proof: vitest src/runtime/skillGrants.test.ts
- [c5] **The grant expression is `<coefficient> * <amount>` with either side omittable, but not both.**
  `4 * amount`, `4` and `amount` all parse; `gain experience on dish-cooked` is a parse
  error. Every event binds exactly one variable, `amount`, and anything more general than one
  coefficient and one bound amount is a parse error rather than a feature — a general expression here
  would be a second evaluator with its own variable binding, and no authored case needs one.
  proof: vitest src/grammar/skillGrant.test.ts
- [c6] **The `# skill` a grant is written on is the skill it trains, and `on` delimits the expression
  from the event.** The grammar is `gain <expression> experience on <event>`, written bare in the body
  of `# skill <id>`, `<event>` is a `# event` id resolved like every other reference, and the line
  parses to one grant however the spacing is written. Amended from `gain <expression> experience in
  <skill> on <event>` when the Open question below was answered; see the Decisions entry.
  proof: vitest src/grammar/skillGrant.test.ts
- [c7] **Any entity that declares `skills:` earns experience from its own events, and the player is not
  special.** The refactor made the player an entity; nothing here reads `PLAYER`, and an authored enemy
  with `skills:` accumulates xp by the same path with no code change. That shipped content declares
  `skills:` on the player alone is a fact about the content, not about this mechanism.
  proof: vitest src/runtime/skillGrants.test.ts
- [c8] **There is one xp accumulator and one place that writes it.** A grant lands through the same
  accumulation the existing `xp:` result already uses; this branch adds no second store, no second
  write site and no per-event tally. A grant becomes ordinary `xp:` results and reaches the
  accumulator through `applyResults`, so neither `applyResults` nor `applyOne` is in this branch's
  diff, and the module that evaluates a grant is this branch's alone. Amended from "the runtime hook
  is one entry appended to `RESULT_OBSERVERS`", which no moment in the closed set can reach; see the
  Decisions entry and the finding filed against that seam.
  proof: vitest src/runtime/skillGrants.test.ts
- [c9] **A grant costs nothing when nobody wrote one.** Evaluating a moment that no `# event` names, or
  an event no grant references, does no per-moment work proportional to the number of declared skills;
  the resolve loop runs the same number of segments with grants authored and without, and no fixture
  in shipped content changes because this branch loaded.
  proof: vitest src/runtime/skillGrants.test.ts
- [c10] **The save format is unchanged.** Grants are derived from content, levels are derived from xp,
  and no new field, no `SAVE_VERSION` move and no regenerated fixture belongs to this branch.
  proof: vitest src/runtime/skillGrants.test.ts
- [c11] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready
- [c12] **A moment's firing count is a fact about what happened, not about how the span was cut.**
  Every name in the vocabulary fires once per discrete thing that happened — the ten `trigger:` names
  and the two hook blocks alike, because they are the same kind of thing — so resolving one span in any
  number of pieces fires each of them the same number of times, and any effect hung off one lands the
  same total whether it reads `amount` or ignores it. `restored` and `drained` are one firing per whole
  unit the pool moved, as `on full` is one per rollover: a settle is a slice of a continuum and is not a
  moment. A rollover meter's ceiling must be a whole number of units, because a wrap moves the origin
  the next crossings are measured from. The proof derives its subjects from the vocabulary and refuses
  to run unless its table covers all of it, so an eleventh name is covered on the line it is added
  rather than on the line somebody remembers a fixture. The one stated exception predates this branch:
  a handler's own deltas settle without firing, because a handler answering a pool moment by moving
  that pool would re-enter it.
  proof: vitest src/runtime/moments.test.ts

### Triggers

Each trigger names a discrete moment the runtime already produces — a settle tick is as discrete as a
landed swing, since time only ever advances in steps. Names are past tense throughout: a trigger is a
thing that happened, not a thing in progress. `resource:` marks the two arities.

| trigger | `resource:` | fires on | when | `amount` |
| --- | --- | --- | --- | --- |
| `on empty` | required | the pool's owner | the pool reached zero | 1 |
| `on full` | required | the pool's owner | the pool reached its max | 1 |
| `damage-dealt` | none | the performer | a swing it performed landed | damage dealt |
| `damage-taken` | none | the struck | a swing landed on it | damage taken |
| `missed` | none | the performer | a swing it performed failed to land | 1 |
| `evaded` | none | the struck | a swing at it failed to land | 1 |
| `completed` | none | the performer | an action ran to its end | 1 |
| `unfinished` | none | the performer | an action ended before reaching it | 1 |
| `restored` | required | the pool's owner | the pool gained a whole unit | 1 |
| `drained` | required | the pool's owner | the pool lost a whole unit | 1 |

The performer of a bounded action is the player, and these two rows are the only place that is true:
the engine arms exactly one action and it is the player's, while every other participant swings from a
roster seat and finishes nothing. The other eight triggers reach any entity that carries the pool or
the swing. Recorded rather than written as if general — see the Decisions entry.

```
# event rat-bitten
trigger: damage-dealt

# event dish-cooked
trigger: completed

# skill melee
gain 4*amount experience on rat-bitten

# skill cooking
gain 4 experience on dish-cooked
```

## Goal

Let content say what trains a skill, in the same event vocabulary the rest of the language already
uses.

## Decisions

- **The engine moments fold into `# event`'s `trigger:` rather than becoming a second `on` vocabulary.**
  Ruled by the author 2026-08-09. The alternative — a handler writing `on <authored-event>:` while a
  grant writes a trailing `on <engine-moment>` — is distinguishable by a parser and not by a reader,
  and "a reader holding only the page can say what a field refers to" is the invariant the encounter
  grammar exists to hold. Folding also puts the closed set where a closed set already lives, and turns
  arity into the presence of `resource:` instead of a positional argument.
- **`succeeded`, `failed` and `escaped` collapse to `completed` and `unfinished`.** The three names were
  written against `on success:`, `on failure:` and `on escape:`. The refactor renames `escape after N`
  to `attempts: N` and `on escape:` to `on unfinished:`, replaces a fight's `on success:`/`on failure:`
  with event handlers, and leaves `on failure:` meaning "could not begin" — a moment no skill trains.
  What survives is the real pair: an action reached its attempt bound, or it did not. Three names for
  two moments was the old grammar showing through.
- **Ordered behind the refactor, and that is the reason this spec exists separately.** Five triggers are
  defined in terms of a swing and a participant, and `# event` itself is the refactor's section.
  Authoring these names against today's grammar would mean rewriting them immediately after —
  `docs/combat/encounter-grammar.md` refused exactly that twice, for `combat-events` and for
  `starting-zone`, and this is the third instance of the same argument.
- **Also ordered behind `skill-levels-xp-events`.** Not for a path collision but because a grant with no
  level curve grants into an accumulator nothing reads, which is the defect that branch exists to fix.
  Both edges are real and both are recorded as `requires`.
- **The xp accumulator is inherited, not rebuilt.** `xp:` already increments it from one site. A grant
  is a second *source* and must not become a second *store*: c8 states that as a countable property
  because a per-event tally is the obvious first implementation and is the one that would need a save
  field, a prune rule and a migration.
- **`credit:` is reused rather than mirrored.** A grant fires on the entity whose view the trigger names,
  and redirecting to someone else is already a solved problem the refactor shipped. This branch adds no
  second subject mechanism.
- **Capabilities: extends two, adds one.** It **extends** `events and handlers` — the refactor's
  `# event` — with eight triggers, and **extends** `skill level curve` with a second xp source. It
  **adds** `skill xp grants`, the `gain … experience in … on …` line and its evaluation, which is the
  one durable capability registered here.

### Decisions taken while implementing

- **A grant is written on `# skill`, and `in <skill>` went with it.** The Open question offered `# skill`,
  the entity and top level. The entity is out on the constraint the question itself names — a hundred
  enemies restating one line. Top level does not exist: `splitSections` refuses content before the
  first heading, so every line in the language belongs to a section, and the spec's own example block
  would have parsed into the `# event` above it. A section of its own would keep `in <skill>` literally,
  and costs an id-less section kind fighting every mechanism the loader has — a registry map, a merge
  rule, a prune pass, a `# remove` address and a round trip, all for a phrase that restates the heading
  the line is under. So `# skill` it is, and the phrase went, exactly as the question said it should.
  c5's error example and c6 are amended to the shape that ships rather than left describing one the
  branch refuses at load.
- **`restored` and `drained` report the movement of the whole-unit level.** The question's binding
  properties are that the sum of `amount` over a span equals the pool's net movement and that where the
  span is split does not change it. A fractional amount fails the second: `divideRateRemainder` hands a
  settle whatever whole milli-units the elapsed span earned, so a pool creeping up by 0.4 a tick would
  report three amounts under one split and one under another. The integer level cannot: it is a
  function of the level alone, so any two splits of one span agree. Proven at 1, 2, 3, 7, 10 and 100
  cuts. The residue is that the xp *derived* from an amount is rounded to whole — a level is decided by
  integer comparison — so a fractional coefficient still rounds per moment; filed rather than hidden.
- **The forecast `RESULT_OBSERVERS` seam cannot carry a grant, and c8 is amended to what does.** An
  observer sees an applied result, which is the seam's whole point — the 2026-08-08 ruling that created
  it says so, and its first subscriber is a log line that has to interleave with the result that caused
  it. None of the ten triggers is a result application: four are pool writes inside `setPoolLevel`, four
  are read off a swing in `resolveAttempt`, and two are a fight's outcome. So the grant fires where the
  moment does, from `fireEvents`, and what it produces is ordinary `xp:` results applied through
  `applyResults` — which is what makes the accumulation the inherited one. `applyResults` and `applyOne`
  are untouched, which is the countable half of c8 and the half a diff can be read for. Filed as a
  finding against the forecast, per the clause's own instruction.
- **`completed` is the outcome the engine already calls `completion`, not the attempts bound.** The
  trigger table's `when` column reads "an action reached its `attempts:` bound" for `completed`, which
  is what the engine calls `unfinished` — `on escape:` was renamed `on unfinished:` precisely because
  attempts ran out. Reading the table literally would swap the pair against the rest of the language, so
  `completed` is `FightOutcome` `completion` and `unfinished` is `unfinished`.
- **A swing's moments fire only where there is somebody struck.** `damage-dealt`, `damage-taken`,
  `missed` and `evaded` are gated on `depletes:`, the same gate `logSwing` carries, because c4 defines
  all four in terms of a performer and a struck and an implicit target is nobody to have a view. A
  craft that failed its `accuracy:` roll is `unfinished`, not `missed`.
- **They fire after the swing's hooks, not before.** A hook is the swing's own consequence and the
  felling verdict is taken over the characters it reached; announcing the moment first would put a
  handler's drain inside that verdict. The moment is the announcement, so it goes last.
- **A settle is not a moment; a unit crossing is.** Pass 2 graded c12 unmet on three mechanisms at
  once, which is the signal that the rule was wrong rather than the instance list short. `restored` and
  `drained` fired once per settle, and a settle is an arbitrary slice of continuous accrual — so the
  *amount* telescoped while the *firing count* did not, and every shape that ignores the amount made
  game state depend on where the caller cut the clock. Measured: one ten-second span ending at exactly
  the same level grants `gain 4 experience` 4, 8, 20 and 40 at one, two, five and ten cuts. They now
  fire once per whole unit moved, which is what `on full` already did per rollover, and a fractional
  rollover ceiling — the second mechanism — is refused where the wrap is taken. The third, a handler's
  own delta moving the pool unreported, is the pre-existing no-recursion rule and is stated in c12
  rather than left implied: under per-unit firing it no longer makes the pool level itself depend on
  the cut, which was its real harm.
- **One walk over the whole vocabulary, and it refuses to be incomplete.** The moments are all the same
  kind of thing — something happened some number of times and had a measurable effect — so they are
  asked one question by one test whose table is checked against `TRIGGER_NAMES` and `HOOK_LABELS`. A
  moment added to either and left uncovered reddens that check, which is what makes this a proof of
  "every moment" rather than of the twelve that exist today. `on hit` and `when hit` are in the table
  beside `on full` deliberately: a hook is an event with a block instead of a grant, and a test that
  cannot tell them apart is the evidence for that.
- **A rollover meter's rise is reported as a rise, and a clamp as what the pool did.** Pass 1 measured a
  meter with an `on full` name granting `drained` for the wrap and a different amount at every way the
  span was cut — the wrap takes the level backwards, so reading the level back reports a rise as a fall.
  What is reported is now the level the rise reached before the meter restarted, which telescopes across
  any split. A clamp keeps reporting the level: a `max:` that fell and truncated the pool lowered it, and
  `drained` says the pool went down whatever took it down. c12 was added to own the rule, because the
  reason nobody asked whether it held for a meter is that no clause was asking.
- **A fight outcome belongs to the player by construction, and the table says so rather than implying
  otherwise.** `completed` and `unfinished` fire on the performer of a bounded action, and the engine
  arms exactly one action, the player's; every other participant swings from a roster seat and finishes
  nothing to complete. Threading a performer parameter that is `PLAYER` at both call sites would look
  general and be the same thing, so the boundary is written into the trigger table instead. c7 is
  unchanged and untouched by this: it promises that the mechanism reads no `PLAYER`, and the two
  triggers an enemy can be the subject of — `damage-dealt` and `damage-taken` — prove it on a rat.
- **A skill's references prune like every other kind's.** Pass 1 measured `registry.skills` as the one
  section kind `pruneRegistryDanglingReferences` never walked, so a grant into an absent optional
  dependency failed the whole module where an event's `resource:` into the same absent module is dropped
  and loads. Skills are walked now: a dangling grant is filtered off the skill, a dangling `stat-id:`
  drops the skill, and an entity's `skills:` is filtered with it. The `stat-id:` half predates this
  branch and is repaired with the same walk rather than left as the one reference site the rule skips.
- **The subject is enforced at the sheet, because the store is not keyed by actor.** `experienceFor`
  grants only into a skill the entity the moment happened to declares, which is what makes an enemy earn
  its own xp; `state.xp` itself is one map, which `skill-levels-xp-events` c4 reserved to whoever makes
  the player an entity. A mutation swapping the actor at the application site survives the whole suite
  for exactly that reason, and it is filed.

## Open questions

- ~~**Where a grant is written.**~~ Answered: `# skill`, and `in <skill>` went with the answer. See the
  Decisions entry; c5's error example and c6 were amended to the shape that ships.
- ~~**Whether `restored` and `drained` fire per settle tick or per crossing.**~~ Answered: per settle,
  reporting the movement of the whole-unit level, which is the second of the three shapes this question
  listed. See the Decisions entry.
- **Whether a level-up is a boundary event.** `captureResourceRates` evaluates a resource's `rate` and
  `max` through `statValue`, so a stat that changes mid-segment is a stat the current segment's snapshot
  has already read. Inherited from `skill-levels-xp-events`, which recorded it and did not own it; this
  branch is the first that can actually cross a threshold mid-segment, so it inherits the question and
  may still hand it to whoever owns resources.

## Audit passes

### Pass 1 — 2026-08-16

- base: `cb74060058051c3d6fbd4249cfa72bbbe6d3ef25`
- head: `baf524ed8431b59b88cf31f1be6dcc14276e5618`
- proof 1: met — Mutation "c1 a grant's event is walked by the shared reference machinery" KILLED: deleting the
  one line src/content/referenceSites.ts adds to case 'skill' fails
  src/content/event.test.ts > "refuses every trigger name written where an event name belongs", re-run at
  its own file with the mutation still applied. That test derives its subjects from TRIGGER_NAMES, so every
  engine moment written where an event name belongs is refused with "names an unknown event", and the
  positive case asserts the same id resolves for a grant and for an entity handler label in one module.
  A grep over src for any second enumeration of trigger names finds only src/content/event.ts, which is the
  one closed list. Re-run: npm run mutate on the manifest, plus vitest src/content/event.test.ts.
- proof 2: met — Mutation "c2 an unrecognised trigger is refused against the closed set" KILLED: narrowing
  triggerValue's guard to "if (!normalized)" fails src/content/event.test.ts >
  "accepts every name the table declares and nothing else". The accept half of that test is derived from
  TRIGGER_NAMES rather than listed, so a trigger added to the table is covered on the line it is added, and
  the second test asserts the refusal message contains every name in TRIGGER_NAMES. The vocabulary pin
  asserts the ten names in order. Adding an eleventh is editing EVENT_TRIGGERS and nothing else, because
  TRIGGER_NAMES, watchesAPool and triggerArityProblem are all functions of that object.
- proof 3: met — Mutation "c3 a superfluous resource: is refused, not only a missing one" KILLED: replacing
  triggerArityProblem's no-pool branch with "return undefined" fails src/content/event.test.ts >
  "refuses a declaration that disagrees with what its trigger takes", which walks TRIGGER_NAMES and asserts
  both directions per trigger. The arity is a property of the name (EVENT_TRIGGERS maps each to 'pool' or
  'none') and is read off the assembled event, so a later module supplying resource: is still checked. The
  message names the arity, not the field: "trigger: on empty watches a pool, so it needs a resource:
  naming which one" and "trigger: damage-taken watches no pool, so it takes no resource:".
- proof 4: met — Mutation "c4 the struck side is who damage-taken and evaded fire on" KILLED: replacing
  "const struck = sideOf(action.depletes, self, other)" with "const struck = self" in resolveAttempt fails
  src/runtime/skillGrants.test.ts > "trains the performer on what it dealt and the struck on what it took".
  The fixture puts every skill on exactly one sheet, so which entity the moment fired on is readable off
  which skill moved; the miss/evade pair is proved the same way and the cross-check asserts the other
  side's skill stayed absent. credit: is untouched by this branch. Caveat, already filed by the
  implementer as a-skill-grant-s-xp-lands-in-one-store-shared-by-every-earner: only the SUBJECT SELECTION
  at fireEvents is provable, because state.xp is one map and the actor passed to applyResults reaches
  nothing that reads it.
- proof 5: met — Mutation "c5 a grant omitting both halves of the expression is a parse error" KILLED: making
  the expression alternation optional in the GRANT regexp fails src/grammar/skillGrant.test.ts >
  "refuses a grant that omits both halves, so a line always says a number". The same file proves 4*amount,
  4 and amount all parse to the same shape, and that a second variable, a second term, a non-product
  operator and a reversed product are each a parse error, so the one-coefficient-one-bound-amount rule is
  the whole grammar rather than the common case of a general one.
- proof 6: met — Two mutations KILLED. "c6 the line parses to one grant however the spacing is written":
  dropping raw.trim() fails src/grammar/skillGrant.test.ts > "reads the same grant however the spacing is
  written", which covers four spellings including leading and trailing whitespace. "c6 a grant is a bare
  clause of the skill it is written under": deleting "clauses: 'grants'" from skillSchema fails
  src/content/event.test.ts > "resolves a declared event exactly as a handler label does", which reads the
  parsed grant back off registry.skills.get('melee').grants. The amended grammar ships: a line naming a
  skill is refused, and the event is an ordinary namespaced reference (base.rat-bitten parses). Round trip
  checked separately with npm run probe --round-trip over a skill carrying four grants of all four shapes:
  clean.
- proof 7: met — Mutation "c7 the earner is the entity the moment happened to, not the player" KILLED:
  substituting PLAYER for actorId in the actorEntity lookup that feeds experienceFor fails
  src/runtime/skillGrants.test.ts > "earns an authored enemy experience from its own events, by the same
  path", where gnawing is on the rat's sheet and no other. The companion tests prove a skill the earner
  does not carry trains nobody, and that an entity with no skills: at all earns nothing rather than
  throwing. experienceFor and fireEvents name no PLAYER. Filed against this clause: applyOutcome does hard
  wire PLAYER, so completed and unfinished are the two triggers no non-player can reach.
- proof 8: met — Read off the diff and mutated. applyResults and applyOne are not in src/runtime/effects.ts's
  diff; the only thing experienceFor returns is a list of ordinary {kind:'xp'} results, and the only
  runtime state this branch adds is a WeakMap index derived from the registry, which holds no xp. Mutation
  "c8 a grant reaches the accumulator through applyResults carrying the batch count" KILLED: pinning the
  count to 1 fails src/runtime/skillGrants.test.ts > "grants once per completion a batched span produced".
  The accumulation is the inherited one: the same test file asserts a grant that crosses a level threshold
  mid-span produces exactly one level-up log line, which is the line applyOne pushes for any xp source.
  No new save field, so no prune rule and no migration.
- proof 9: met — Mutation "c9 the grant index is derived once and held against the registry" KILLED: defeating
  the WeakMap hit fails src/runtime/skillGrants.test.ts > "walks the declared skills at most once however
  many moments fire", which counts calls by wrapping registry.skills.values. A moment no event names costs
  one Map.get. Two further tests in that file discharge the rest: a fight with 300 idle skills on the page
  resolves to a state deep-equal to the same fight without them, and the same fight with every gain line
  stripped produces an identical state and an identical log once level lines are removed. No fixture under
  content/ is in the diff and the merge gate's integration leg is green. Recorded against this clause: the
  spec points c9 at src/runtime/poolMoments.test.ts, which contains no cost test at all; the evidence above
  is in src/runtime/skillGrants.test.ts. Filed.
- proof 10: met — src/runtime/save.ts is not in the diff and no fixture is regenerated by it. Mutation
  "c10 the save version this branch inherits is pinned" KILLED: moving SAVE_VERSION to 12 fails
  src/runtime/skillGrants.test.ts > "keeps the save shape it inherited, so a state that earned a grant
  reloads clean", which pins 11, serializes a state that earned only grant xp, asserts compareSave and
  loadSave both report no differences, and asserts the reloaded xp map is identical. Grants themselves are
  content: npm run probe --round-trip over a skill carrying four grants serializes and reloads clean, so
  the serializer change carries them without a format move.
- proof 11: met — npm run tasks -- merge-ready on baf524e: tsc pass, npm test pass, layer-check pass,
  audit-status pass, doctor pass (25 warnings, which do not fail the leg), bytes pass, tree pass (nothing
  uncommitted), base pass (main has not moved past the merge base), spec pass (every declared member
  closed). The single failing leg is "clauses xp-from-events has no recorded audit pass", which is this
  record. Re-run the command to reproduce.

### Pass 2 — 2026-08-16

- base: `cb74060058051c3d6fbd4249cfa72bbbe6d3ef25`
- head: `78ab9c8e0128cf17ad06de51df3a61d6c407b648`
- proof 1: met — Re-verified this pass, and extended past the load error pass 1 mutated. The prune half now
 works end to end: `npm run inspect` over a two-module universe whose `?extra` dependency is absent
 (temp file audit-xp-from-events-pass2-prune.js) shows a `gain 4 experience on extra.never-loaded`
 filtered off `pack.melee` while `gain 2 experience on base.bitten` survives, a dangling
 `stat-id: extra.gone` dropping the whole skill, and the entity's `skills:` filtered with it — which
 is exactly what an event's `resource:` into the same absent module does. `src/content/event.test.ts`
 derives its subjects from `TRIGGER_NAMES`, so "refuses every trigger name written where an event
 name belongs" covers every engine moment, and the one positive case reads the same id back off both
 `registry.skills.get('melee').grants` and `entities.get('rat').handlers[0].event`. A grep over `src`
 for a second enumeration of the names finds only `src/content/event.ts`. Filed against this clause,
 and it does not lower the grade because the property holds: all three branches of the prune loop
 that carries it SURVIVED the whole suite, so nothing re-measures it.
- proof 2: met — Pass 1's mutation stands (narrowing `triggerValue`'s guard to `if (!normalized)` fails
 "accepts every name the table declares and nothing else"), and the accept half is derived from
 `TRIGGER_NAMES` rather than listed. Re-confirmed this pass that `TRIGGER_NAMES`, `watchesAPool` and
 `triggerArityProblem` are each a function of the one `EVENT_TRIGGERS` object, so an eleventh trigger
 is one edit; the vocabulary pin asserts the ten names in order. Re-run: vitest
 src/content/event.test.ts.
- proof 3: met — Strengthened past pass 1, which checked one assembled event. `triggerArityProblem` is
 asked of the merged event, so this pass drove five shapes through `loadInEnglish`
 (audit-xp-from-events-pass2-arity.js): a pool trigger with no `resource:` refuses; a plain trigger
 with one refuses; a plain trigger whose `resource:` arrives in a SECOND section of the same id
 refuses, in both declaration orders; and a pool trigger whose `resource:` arrives in a second
 section loads. So the arity cannot be smuggled past by splitting the declaration, in either
 direction, and the message names the arity rather than the field. Re-run: pipe that file through
 `npm run inspect -- -`, plus vitest src/content/event.test.ts.
- proof 4: met — Mutation "c4/c7 a grant lands only in a skill the entity the moment happened to carries"
 KILLED: dropping `earner.skills.includes(skill)` from src/runtime/skillGrants.ts:45 fails six named
 tests in src/runtime/skillGrants.test.ts, including "trains the performer on what it dealt and the
 struck on what it took" and "leaves a skill alone where its moment landed on the other side", re-run
 at that file with the mutation still applied. Pass 1's mutation on `sideOf` in `resolveAttempt`
 also stands. The fixture puts each skill on exactly one sheet, so which entity a moment fired on is
 readable off which skill moved. Caveat unchanged and already filed as
 a-skill-grant-s-xp-lands-in-one-store-shared-by-every-earner: only the subject SELECTION is
 provable, because `state.xp` is one map.
- proof 5: met — Pass 1's mutation stands: making the expression alternation optional in the `GRANT`
 regexp fails "refuses a grant that omits both halves". src/grammar/skillGrant.test.ts proves
 `4*amount`, `4` and `amount` all parse, and that a second variable, a second term, a non-product
 operator and a reversed product are each a parse error. Re-run: vitest
 src/grammar/skillGrant.test.ts. Noted rather than deducted: the bare-coefficient shape this clause
 makes first-class is the one F1 below shows is not split-independent on a per-settle trigger. The
 grammar is what this clause promises and the grammar is right.
- proof 6: met — Pass 1's two mutations stand (dropping `raw.trim()`; deleting `clauses: 'grants'` from
 `skillSchema`). Re-read this pass off the serializer as well: `grantLine` in src/content/serialize.ts
 emits the same four spellings back, and the probe round trip pass 1 recorded covers a skill carrying
 all four. Re-run: vitest src/grammar/skillGrant.test.ts and src/content/event.test.ts.
- proof 7: met — Mutation as under c4 KILLED, and it is the line that makes the earner the entity the
 moment happened to: `experienceFor` reads `earner.skills` and names no PLAYER, and
 `actorEntity(registry, actorId)` resolves an instance id through its template. Pass 1's PLAYER
 substitution in the `actorEntity` lookup also stands, failing "earns an authored enemy experience
 from its own events, by the same path". The `completed`/`unfinished` boundary is now written into
 the trigger table by the Decisions entry, so it is a stated limit rather than an unmet promise.
 Re-run: npm run mutate on mutations-xp-from-events-pass2.json.
- proof 8: met — Read off the diff again this pass: `applyResults` and `applyOne` are not in
 src/runtime/effects.ts's diff over cb74060..78ab9c8, `experienceFor` returns nothing but ordinary
 `{kind:'xp'}` results, and the only state the branch adds is a `WeakMap` keyed by the registry that
 holds no xp. A grep for a second write of `state.xp` finds one site. Pass 1's mutation pinning the
 batch count to 1 stands. Re-run: `git diff cb74060..78ab9c8 -- src/runtime/effects.ts` and vitest
 src/runtime/skillGrants.test.ts.
- proof 9: met — `grantsByEvent` builds one map per registry and holds it in a `WeakMap`, so a moment no
 event names costs one `Map.get`; pass 1's mutation defeating the WeakMap hit fails "walks the
 declared skills at most once however many moments fire", which counts calls by wrapping
 `registry.skills.values`. "resolves the same segments, log and clock whether or not a grant was
 authored" and the three-hundred-idle-skills test discharge the rest, and no fixture under content/
 is in the diff. Re-run: vitest src/runtime/skillGrants.test.ts. Recorded and filed separately as
 LOW: the branch does add a per-settle cost that is not a grant cost — `writeLevel` calls
 `fireEvents`, hence `eventsFor`, hence a fresh `[...registry.events.values()]` allocation, on every
 settle that moved a pool by a whole unit whether or not any event names that pool. That is outside
 what this clause promises, which is why the grade stands.
- proof 10: met — src/runtime/save.ts is not in the diff and no fixture is regenerated by it. Pass 1's
 mutation moving `SAVE_VERSION` to 12 fails "keeps the save shape it inherited, so a state that
 earned a grant reloads clean", which pins 11 and asserts `compareSave` and `loadSave` both report no
 differences. Grants are content and round-trip through the serializer. Re-run: vitest
 src/runtime/skillGrants.test.ts.
- proof 11: met — `npm run tasks -- merge-ready` on 78ab9c8 this pass: tsc pass, npm test pass (142 files,
 3286 tests), layer-check pass, audit-status pass, doctor pass (25 warnings, which do not fail the
 leg), bytes pass, tree pass, base pass, spec pass. The one failing leg is
 "clauses xp-from-events 1 outstanding across 1 pass(es): c12", which is this record. Re-run the
 command to reproduce.
- proof 12: unmet — Checked and fails, on three independent mechanisms, none of which is pass 1's. The
 clause promises that the two report the pool's own whole-unit movement and that cutting one span
 into any number of pieces reports the same total.
 (1) The AMOUNT telescopes but the FIRING does not. `writeLevel` fires once per settle that moved a
 whole unit, so a grant that does not read `amount` — `gain 4 experience on <restored event>`, a
 shape c5 makes first-class — multiplies by the number of cuts. Measured with no handler anywhere
 (audit-xp-from-events-pass2-coefficient.js): one ten-second span of `rate: trickle`, identical end
 level 10000 in every run, `gain amount` earns 10 at 1, 2, 5 and 10 cuts, and `gain 4` earns 4, 8, 20
 and 40.
 (2) The amount itself is split-dependent for a rollover meter whose `max:` is not a whole number of
 units, because `writeLevel`'s `Math.floor(reached / MILLI_UNITS) - Math.floor(before / MILLI_UNITS)`
 only telescopes when `fires * max` is a whole number of units. Measured
 (audit-xp-from-events-pass2-fracmax.js): with `# stat max-fury / base: 10.5`, an 11.1-second span
 reports 11 resolved whole and 10 when cut at 10.9s, with the same end level 600 both ways. The same
 span at `base: 10` reports 11 at every cut, which is why the shipped fixture cannot see it.
 (3) The sum is not the pool's movement whenever a handler moved the pool. `settleHandlerDeltas`
 writes `store.levels` directly at src/runtime/effects.ts:494, bypassing `writeLevel`, so a handler's
 own drain is never reported. Measured (audit-xp-from-events-pass2-handler.js): an `on <restored
 event>:` handler with `drain: 2 vigour` leaves vigour at 8000, 6000 or 0 for 1, 2 or 10 cuts of one
 ten-second span, with `restored` reporting 10 in all three and `drained` never firing once.
 The two mutations aimed at what this clause DOES hold both KILLED — replacing `reached` with `level`
 in `writeLevel`, and replacing the clamp's `writeLevel` call with a bare assignment, each fail named
 tests in src/runtime/poolMoments.test.ts — so the failure is not weak testing of the implemented
 rule, it is that the rule implemented is narrower than the clause. Re-run: pipe the three temp files
 through `npm run inspect -- -`.
