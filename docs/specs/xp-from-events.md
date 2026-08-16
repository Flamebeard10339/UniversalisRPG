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
  proof: vitest src/runtime/poolMoments.test.ts
- [c10] **The save format is unchanged.** Grants are derived from content, levels are derived from xp,
  and no new field, no `SAVE_VERSION` move and no regenerated fixture belongs to this branch.
  proof: vitest src/runtime/skillGrants.test.ts
- [c11] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

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
| `completed` | none | the performer | an action reached its `attempts:` bound | 1 |
| `unfinished` | none | the performer | an action ended without reaching it | 1 |
| `restored` | required | the pool's owner | a settle raised that pool | units gained |
| `drained` | required | the pool's owner | a settle lowered that pool | units lost |

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
