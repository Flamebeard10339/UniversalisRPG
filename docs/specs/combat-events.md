# combat-events

## Deliverable

The runtime gains the strategies; the DSL keeps the shapes and the names. An action can declare
effects that fire when one of its swings lands, and an actor can carry an effect that fires on a
named event regardless of what swung, and either composes with the chance wrappers `droptables`
ships. No archetype effect is a feature of this branch — each is a fixture `archetype-mods`
assembles in the DSL out of primitives, and the runtime must not contain any of their names. The
enabling change beneath both triggers is small and specific:
`resolveAttempt` already holds both parties to a swing as `self` and `other`, and
`result-application-seam` has already given result application a subject and an observation point,
so what remains is when to fire, who it lands on, and what a load error rejects.

Proof:

- `on hit:` and `on hit self:` are one moment with two recipients. Both fire when a swing of the
  declaring action lands; `on hit:` applies its results to the actor that was struck, and
  `on hit self:` applies them to the actor that swung. A weapon that poisons its target and a
  weapon that feeds its wielder are the same trigger, differing only in which of the two parties
  the results land on, so they are two block names rather than a result-level target.
- A persistent effect fires on a named event rather than on an action. It is carried by an actor,
  it names one event from the `skill-levels-xp-events` vocabulary, and it applies to whichever party
  that event's moment identifies — so an actor that never swings still has one, which an
  action-declared hook cannot give it.
- A hook's body is an ordinary result list, so it inherits `droptables`' selectors unchanged and this
  branch adds no chance mechanism of its own. A 5%-on-hit effect is `1 in 20:` wrapping the body
  inside `on hit self:`, a gear-scaled one is `<stat> vs <stat>:`, and a state-gated one is
  `if <condition>:`. The draw discipline that comes with them — a certainty drawing nothing, a
  wrapper drawing once for its body, and a stochastic group sampling per application rather than
  being multiplied by a batch count — is already shipped and is not restated here.
- A stat bonus can be scaled by a counter. `+N <stat> per <counter>` reads a counter's current value
  and contributes through the existing `added` and `increased` channels, alongside the flat and
  percent forms `tagClause` already parses. This branch defines the shape with a resource's level as
  its first counter; `buffs-generalized` adds a buff's stack count as a second source of the same
  shape, not as a second spelling.
- Hooks and persistent effects fire on a landed swing only. A swing that misses fires neither, and
  neither does any moment that is not a resolved swing.
- Firing never recurses. Only a resolved swing fires a hook or a persistent effect, and a pool
  change produced by a result is not a swing, so two actors that both damage each other on being
  struck terminate by construction rather than by a depth counter.
- Depletion is decided after a swing's effects have applied. A target finished off by a poison tick
  ends the fight exactly as one finished by the swing itself does, and an effect that empties a pool
  ends the segment at that instant, the way a retaliation that empties one already does.
- Firing order within one swing is fixed and stated: damage is applied, the swing is logged, then
  the swinging actor's `on hit:` and `on hit self:`, then any persistent effects the moment matches,
  in a stated order. Two effects that write one pool compose deterministically.
- A hook on an action that cannot swing is a load error. `resolvesPerAttempt` is the test — an
  action with neither `accuracy:` nor `target:` never rolls a hit — so an `instant` action carrying
  `on hit:` is rejected by name at load rather than silently never firing. This is what the action
  kind taxonomy was a prerequisite for.
- No identifier anywhere in `src/runtime` is named for any fixture `archetype-mods` composes —
  poison, rage, thorns or accelerated vigor — and no branch in the resolver exists for any of them.

### Primitives

What this branch owes, named. Each is a strategy the runtime implements and the DSL composes.

| primitive | what it is |
| --- | --- |
| `on hit:` | results applied to the **struck** actor when a swing of the declaring action lands |
| `on hit self:` | results applied to the **swinging** actor at that same instant |
| persistent effect | an effect carried by an actor, fired by a named event rather than by an action |
| `+N <stat> per <counter>` | a stat bonus whose size reads a counter; a resource's level here, a buff's stack count in `buffs-generalized` |

### Fixtures belong to `archetype-mods`

No archetype effect is this branch's. `archetype-mods` owns them as authored content — "authoring
all three is the test that the engine generalized rather than growing three special cases" — and it
is ordered behind `buffs-generalized`, which owns the timed-modifier and stacking halves. This
branch owes the primitives above and the constraint that the runtime never names any fixture; it
ships none of them.

| fixture | what it needs | whose |
| --- | --- | --- |
| poison | `on hit:` and a timed debuff carried by the struck actor | here, then `buffs-generalized` |
| rage | a resource with a constant drain, `on hit self:` granting it, `+N <stat> per rage` | here |
| accelerated vigor | `1 in 20:` inside `on hit self:`, a stacking buff, `+N% <stat> per stack` | here, then `buffs-generalized` |
| thorns | a persistent effect on `damage-taken` | here |

Rage and accelerated vigor are both kept because they are not the same mechanism wearing two names:
a resource has a ceiling and a rate that regeneration can push against, and a stack count has
neither. That is two counters behind one `per <counter>` shape, which is why the shape is defined
once here rather than once per fixture.

## Decisions

- **`when hit:` is dropped; thorns is a persistent effect.** An earlier draft had a symmetric
  `when hit:` pair beside `on hit:`. Thorns decomposes as a stat plus an effect fired by
  `damage-taken`, which is carried by the actor rather than declared on an action — and that is what
  a passive enemy with no `retaliates` action needs, which the action-declared form could never give
  it. Keeping both would be two mechanisms for one moment.
- **Action-declared and actor-carried are both kept, because their scopes differ.** `on hit:` is
  scoped to one action — *this weapon* poisons — while a persistent effect fires for any swing that
  produces its event. Collapsing them would cost the ability to say "only this attack does this".
- **This branch consumes the event vocabulary and does not extend it.** `skill-levels-xp-events`
  defines the past-tense event names; a persistent effect names one of them. If an effect wants an
  event that does not exist, the name is added to that closed list by amending it, not by this
  branch growing a second vocabulary.
- **The buff engine is not built here.** `buffs-generalized` holds an exact `produces` claim on
  "buff engine" and its deliverable is already "applying to any entity rather than the player
  alone". An earlier draft of this spec claimed that scope; it was removed rather than duplicated,
  and this branch is ordered before it, so the timed modifier poison needs arrives after.
- **Rage is a resource and accelerated vigor is a stack, and both are kept.** `archetype-mods`
  originally modelled rage as a stacking self-buff. A resource carries a ceiling and a rate that a
  regeneration effect can push against, which a stack count cannot, so rage becomes the resource and
  a separate chance-gated stacking buff takes over the job of exercising stacking rules. The two are
  different mechanisms, not one described twice, and `archetype-mods` is amended to say so.
- **One `per <counter>` shape, two counter sources.** Rage needs a bonus that reads a pool's level
  and vigor needs one that reads a stack count. Spelling those separately would be the same
  mechanism authored twice, so the shape is defined here and `buffs-generalized` extends its counters
  rather than adding a parallel form.
- **The chance mechanism is `droptables`', not this branch's.** An earlier draft gave the hooks a
  percentage of their own, reasoning that a gate on individual results would roll per result and
  make a two-result hook fire half of itself. `droptables` had already answered that: a wrapper
  wraps a result *body* and draws once for it, and it applies wherever the DSL takes a result list —
  which a hook body is. Three clauses were removed rather than duplicated, including two that
  restated draw discipline `droptables` already proves.
- **Fixtures are content, not code.** They exist to prove the primitives compose. A mechanism whose
  tests pass while the resolver has grown a branch named after one of them has failed at the thing
  it was built for, which is why their absence from `src/runtime` is a clause.
- **Hooks fire on swings, not on damage.** Defining the trigger as a resolved swing rather than as a
  pool decreasing is what makes recursion impossible without a guard. The alternative needs a depth
  limit, and a depth limit is a number someone has to defend.

## Open questions

- Whether a persistent effect is carried by an entity, by an equipped item, or by both is not
  settled. Thorns reads naturally as an entity's property and a thorns *aura granted by armour*
  reads naturally as an item's; the fixture needs only the first.
