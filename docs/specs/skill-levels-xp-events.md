# skill-levels-xp-events

## Deliverable

Skills stop being write-only. Today `state.xp[skillId]` is incremented in exactly one place and read
by nothing, and `# skill`'s `stat-id` field parses, resolves and is reference-checked while no
runtime code consults it — the whole skill system is an accumulator with no consumer. This branch
gives xp a continuous level curve, lets a skill's level feed the stat it names, and adds a closed,
enumerated set of events that grant xp from what actually happened, so that "gated by skill level"
and cooking-vs-dish-complexity become expressible.

Proof:

- The curve is continuous, not blocked. The cost of level `n` is `C(n) = 1000 × 2^((n-1)/10)` — 1000
  xp for the first level, doubling every ten levels without a step — and the xp needed to have
  reached level `n` is the geometric sum `T(n) = 1000 × (r^(n-1) - 1) / (r - 1)` where
  `r = 2^(1/10)`.
- Level from xp is one closed-form evaluation, `level(X) = 1 + 10 × log2(1 + X × (r - 1) / 1000)`,
  with no loop over levels and no piecewise block lookup. It is read on every stat evaluation, so it
  stays arithmetic.
- A level is an integer and is a pure function of an integer xp total. The closed form supplies a
  guess that is then corrected against integer thresholds, so the returned level is decided by
  integer comparison and never by float rounding — `level(T(n))` is `n` and `level(T(n) - 1)` is
  `n - 1` exactly, at thresholds across several ten-level spans.
- A skill's level is derived from `state.xp` on demand and never stored. The save format is
  unchanged by this branch: no new field, no `SAVE_VERSION` bump, and a save written before it loads
  untouched.
- A skill grants either `+1` or `+1% × level` to the stat it names, authored in the DSL with the
  existing tag-clause shape (`+1 attack` / `+1% attack`) and folded through the existing `added` and
  `increased` channels in `src/runtime/stats.ts`. No new modifier concept and no third channel.
- `# skill`'s `stat-id` is read by the runtime. The comment in `src/content/skill.ts` stating that
  nothing reads it is deleted because it has become false, not because it was tidied.
- The grant grammar is `gain <expression> experience in <skill> on <event>`, where `in` delimits the
  expression from the skill. The expression is `<coefficient> * <amount>` with either side omittable
  — `4 * amount`, `4`, and `amount` all parse — but not both: `gain experience in cooking on
  succeeded` is a parse error. Anything more general than one coefficient and one bound amount is
  also a parse error rather than a feature.
- An event is named by a past-tense identifier in the same `[a-z][a-z0-9-]*` shape as every other id
  in the language — `damage-dealt`, not `dealing damage`. Two of them take a resource id as an
  argument and the rest take none; because the set is closed, each name's arity is known at parse
  time, so `on drained health` and `on missed` are both unambiguous and `on missed health` is an
  error naming the arity it violated.
- The event set is exactly the nine listed under `### Events`, and nothing else. An unrecognised
  event name fails at load time with an error naming the events that do exist, and adding a tenth
  requires editing that list.
- A level-up changes the stat the skill names and nothing else. No pool is refilled, no resource's
  current value is adjusted, and no other state is touched as a consequence of crossing a threshold.

### Events

Every event binds exactly one variable, `amount`, which the expression may use. "The actor" is the
player; enemies accumulate no xp. Each event names a discrete moment that already exists in the
runtime — a settle tick is as discrete as a landed swing, since time only ever advances in steps.
Names are past tense throughout: an event is a thing that happened, not a thing in progress.

| event | fires when | `amount` |
| --- | --- | --- |
| `damage-dealt` | a swing the actor owns landed on its target | damage dealt |
| `damage-taken` | a swing landed on the actor | damage taken |
| `missed` | a swing the actor owns failed to land | 1 |
| `evaded` | a swing at the actor failed to land | 1 |
| `succeeded` | an attempt resolved in the actor's favour | 1 |
| `failed` | an attempt resolved against the actor | 1 |
| `escaped` | a fight the actor was in ended in escape | 1 |
| `restored <resource>` | a settle raised that pool | units gained |
| `drained <resource>` | a settle lowered that pool | units lost |

```
gain 4*amount experience in attack on damage-dealt
gain amount experience in vitality on drained health
gain 4 experience in cooking on succeeded
```

## Decisions

- **The curve is continuous and the floored ten-level block is rejected.** The block was chosen to
  keep the xp-to-level inverse closed-form and cheap, but the smooth geometric curve inverts to a
  single logarithm while the blocked one needs a block lookup and then an offset inside it. The
  stated reason for flooring argued for the continuous form all along.
- **Level is an integer; only the curve is continuous.** A fractional level would drift the player's
  stats on every xp gain and there would be no level-up event at all, which is not what "a level-up
  changes the stat" describes.
- **Float never decides a level.** Level is derived rather than stored, and the repository's
  regression format compares whole saves, so a threshold decided by `log2` rounding would change a
  stat, then damage, then an entire replay. The logarithm is a guess and integer thresholds are the
  arbiter.
- **Events are past tense, and that makes them identifiers rather than phrases.** An event is a
  thing that happened, so it is `damage-dealt`, not `dealing damage`. Past tense reads badly as an
  English clause after `on`, and the fix is to stop pretending it is one: an event name is an id in
  the same shape as every other reference in the language, and `on` introduces a name the way it
  does everywhere else.
- **The expression stays tiny on purpose.** One coefficient and one bound amount, either omittable.
  A general expression language here would be a second evaluator with its own variable binding, and
  the authored cases — `4 × damage`, damage taken, a successful cook — do not need one.
- **Every event is discrete, including regeneration.** Time advances in steps, so a settle tick is
  as much a discrete occurrence as a landed swing; `restoring` and `draining` are ordinary events
  rather than a continuous case needing special handling.
- **Resources are out of scope.** This branch owns what a level-up does to a *stat*. How a resource
  responds to a stat that changed — whether a raised `max` lifts the current value or only the
  ceiling — belongs to whoever owns resources, and is not decided here.
- **Floating text is not in this branch.** CLAUDE.md requires every skill-XP-granting moment to
  produce floating text, and there is no GUI to produce it in — the runtime publishes the xp event
  and `gui-rebuild` owns rendering it. This branch owes the event, not the animation.
- **Separable from `combat-events`.** Combat is where several of these events originate, but the
  event vocabulary is this branch's and `combat-events` consumes it. The two specs must not both
  define it.

## Open questions

- `succeeded`, `failed` and `escaped` name the same three moments as the existing `on success:`,
  `on failure:` and `on escape:` result blocks, and `drained`/`restored` overlap `on empty:` and
  `on full:`. The two are different constructs — a result block says what *happens*, a skill grant
  says what *trains* — but they are now two vocabularies over one set of moments, in two tenses.
  This branch does not rename the existing blocks, which are authored in shipped content; whether
  they converge is left open rather than settled by a branch that has no reason to touch them.
- `captureResourceRates` evaluates a resource's `rate` and `max` through `statValue`, so a stat that
  changes mid-segment is a stat the current segment's snapshot has already read. This branch does
  not make level-ups boundary events and does not own the answer; recorded here so the resource
  owner inherits the question rather than discovering it.
