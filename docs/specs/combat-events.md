# combat-events

Re-planned 2026-08-09 against the grammar `full-refactor-of-enemies-and-combat` shipped, and
corrected the same day after the first re-plan hung hooks off `# action`. That was wrong and the
sword is why: equipping a blade that poisons cannot mean the wearer now performs a different attack.
An `# action` is the **verb** — what damage is applied, and to which pool, which is what tells
woodcutting from melee from ranged. An effect is never a verb. Both recorded decisions that rested
on the action host are overturned by name below.

## Deliverable

A hook is a character modifier. It is carried by the same things that carry `+4-7 attack` — an
entity's own block, an equipped item, and later an allocated passive or an active buff — it arrives
and departs with its carrier, and the runtime gathers it from the same sources `statRange` already
folds a stat bonus from. There are two of them, because a character in a two-sided swing is either
the one who landed it or the one it landed on:

```
# item venomous-blade
slot: mainhand
+4-7 attack
on hit: 1 in 4: drain: 3 health from them

# item bramble-mail
slot: body
when hit: drain: 2 health from them
```

Everything in a hook is read from the character carrying it. `on hit:` is *I landed one*, `when hit:`
is *one landed on me*, and the party a result moves something between is written where English puts
it — `from them`, `to me` — rather than as a level of nesting above it. An unmarked result is mine,
because the carrier is the perspective, which is what makes the block readable off the page you are
already looking at.

Each of those is one line because every wrapper in this language already takes an inline body and
wrappers chain, which `on death: 1 in 4: credit: drain: 3 health` parses today. A hook block inherits
that; it needs no inline spelling of its own. The multi-result form indents the same way anything
else does:

```
# entity berserker
stats: max-health 40, max-rage 10, attack 6
uses: melee-combat
+2 attack per rage
on hit:
  restore: 1 rage
  1 in 20:
    drain: 4 health from them
```

`# entity` and `# item` are the two carriers that exist. The same two blocks on `# passive`, which
`archetype-mods` and `items-mods-and-crafting` own between them, is that record's line to write and
this branch's gather to already accept.

The enabling change beneath it is small and specific. `resolveAttempt` already holds both parties as
`self` and `other`, `result-application-seam` has already given result application a subject, and
`statRange` already walks every source a character's modifiers come from. What remains is when to
fire, what the gather returns, what a load error rejects, and when depletion is decided.

No archetype effect is a feature of this branch. Each is a fixture `archetype-mods` assembles in the
DSL out of these primitives, the runtime must not contain any of their names, and this branch ships
no content.

Proof:

- [c1] Two blocks, two carriers, no side vocabulary. `on hit:` and `when hit:` are result blocks the
  load path accepts on an `# entity` and on an `# item`, and on nothing else. Neither block names a
  side, an action or a weapon — a character with two ways to swing writes one `on hit:` for both,
  because what a hook is about is the character and not the verb. Both survive a serialize/reload
  round trip on both carriers.
  proof: vitest src/grammar/action.test.ts src/content/roundTrip.test.ts
- [c2] Two verbs, one perspective, gathered the way a stat bonus is. `on hit:` fires when a
  two-sided swing by the carrying character lands and `when hit:` when one lands on it, both read
  from the carrier. A hook on an item reaches its wearer when equipped and stops reaching them when
  unequipped, exactly as that item's `+4-7 attack` does, because the gather walks the sources
  `statRange` folds rather than a list of its own — so a passive or a buff becomes a carrier by
  joining that list and not by a second mechanism.
- [c3] A hook block on an `# action` is a load error. An action is the verb, shared by everyone who
  performs it, so a hook on `melee-combat` would fire for every entity in the game that swings. The
  error names the carrier to write it on instead, and `on hit self:` and `on hit them:` are refused
  by name beside it.
- [c4] A result that moves something between two parties says which one, in the place English puts
  it. `drain:` and `restore:` take a trailing `from them` / `from me` / `to them` / `to me`, so
  `drain: 3 health from them` is one sentence and one line. The preposition follows the verb and is
  not a choice — `drain … from`, `restore … to` — and the wrong one is refused naming the right one.
  Unmarked is mine: `restore: 1 rage` on a carrier restores that carrier's. `me` is always the
  carrying character and `them` the other party the moment identifies, in both blocks, which is what
  makes one rule serve `on hit:` and `when hit:` alike.
- [c5] A hook body is an ordinary result list, so it inherits `droptables`' selectors unchanged and
  this branch adds no chance mechanism of its own. A 5%-on-hit effect is `1 in 20:` wrapping the
  body, a gear-scaled one is `<stat> vs <stat>:`, and a state-gated one is `if <condition>:`. The
  draw discipline that comes with them is already shipped and is not restated here.
- [c6] Hooks fire on a landed swing only. A swing that misses fires neither block, and no moment
  that is not a resolved two-sided swing fires either.
- [c7] Firing never recurses. Only a resolved swing fires a hook, and a pool change produced by a
  hook's results is not a swing, so two characters that each carry a `when hit:` draining
  `from them` terminate by construction rather than by a depth counter.
- [c8] Firing order within one swing is fixed and stated: damage is applied, the swing is logged,
  then the swinging character's `on hit:`, then the struck character's `when hit:` — and within each
  character, its carriers in the order the gather returns them, which is the order `statRange`
  already folds. Two hooks that write one pool compose deterministically.
- [c9] Depletion is decided after the swing's hooks have applied, and over every actor a hook
  reached rather than the struck one alone. A target finished off by a hook ends the fight exactly
  as one finished by the swing does; a swinger felled by the character it struck leaves the fight at
  that instant, and ends it if it was the player or the armed action's target.
- [c10] A stat bonus can be scaled by a counter, through the multiplier that already exists.
  `+N <stat> per <counter>` parses beside the flat and percent forms `tagClause` holds and folds
  through `foldBonus`, which `skill-levels-xp-events` shipped and which `statRange` already calls
  with a skill's level as its `times`. This branch adds a resource's level as a second counter
  source and no second multiplier: a grep of `src/runtime/stats.ts` finds one function scaling a
  `BonusAmount` by a count, not two. `buffs-generalized` adds a buff's stack count and
  `per-grammar-dependent-stats` a stat, the same way.
- [c11] No identifier anywhere in `src/runtime` is named for any fixture `archetype-mods` composes —
  poison, rage, thorns or accelerated vigor — and no branch in the resolver exists for any of them.
  `content/` is untouched by this branch, so no shipped fixture can stand in for a primitive that
  did not generalize.

### Primitives

What this branch owes, named. Each is a strategy the runtime implements and the DSL composes.

| primitive | what it is |
| --- | --- |
| `on hit:` | results fired when a two-sided swing by the carrying character lands |
| `when hit:` | results fired when a two-sided swing lands on the carrying character |
| `from them` / `to me` | which party a `drain:` or `restore:` moves its amount between; unmarked is me |
| `+N <stat> per <counter>` | a stat bonus whose size reads a counter; a resource's level here |

Carried by an `# entity` block or an equipped `# item`, gathered by the same walk that folds a stat
bonus, so `# passive` and a buff join as carriers without a second mechanism.

### Fixtures belong to `archetype-mods`

No archetype effect is this branch's. `archetype-mods` owns them as authored content — "authoring
all three is the test that the engine generalized rather than growing three special cases" — and it
is ordered behind `buffs-generalized`, which owns the timed-modifier and stacking halves.

| fixture | what it needs | whose |
| --- | --- | --- |
| poison | `on hit:` and a timed debuff on the struck character | here, then `buffs-generalized` |
| rage | a resource with a constant drain, `on hit:` restoring it, `+N <stat> per rage` | here |
| accelerated vigor | `1 in 20:` inside `on hit:`, a stacking buff, `+N% <stat> per stack` | here, then `buffs-generalized` |
| thorns | `when hit: drain: N health from them` on the carrier | here |

Rage and accelerated vigor are both kept because they are not the same mechanism wearing two names:
a resource has a ceiling and a rate that regeneration can push against, and a stack count has
neither. That is two counters behind one `per <counter>` shape, which is why the shape is defined
once here rather than once per fixture — and why it belongs in this branch at all, since a hook and
a counter-scaled bonus are both things a passive or an item grants a character.

## Decisions

- **An `# action` is not a carrier, and hooks are not scoped to one.** This overturns the recorded
  decision that "action-declared and actor-carried are both kept, because their scopes differ", and
  with it the first re-plan's four block names. A sword that poisons is a character modifier: equip
  it and your swings poison, exactly as equipping it raises your attack. It cannot mean you now
  perform a different action, because you do not choose a verb by choosing a weapon. The scope that
  decision was defending — *only this attack does this* — is not one anything in the game wants, and
  under one shared `melee-combat` a hook on the action would fire for every entity that swings.
- **`# action` keeps the job it is for.** It says what damage is applied and to which pool, which is
  what distinguishes woodcutting from melee from ranged, and `uses:` says which of those a character
  can bring. That is the verb, and it is unchanged by this branch.
- **Two verbs, not four blocks.** The first re-plan had `on hit them:`, `on hit me:`,
  `on struck them:` and `on struck me:` — the cross product of two moments and two recipients, which
  is a distinction on every block for a redirect that most hooks do not want. Once every hook is
  read from the character carrying it, the moment is `on hit:` or `when hit:` and nothing else, and
  the recipient is a wrapper inside the body for the minority that need it.
- **`when hit:` is not dropped after all.** An earlier draft dropped it as "two mechanisms for one
  moment" and routed thorns through an event instead. That reasoning was about an *action*-declared
  pair; a character-carried `when hit:` is one mechanism with `on hit:`, not a second, and it is
  what a thing that swings nothing at all needs in order to answer being hit.
- **The actor-carried half is not a handler on a `# event`.** The vocabulary that draft meant to
  consume never arrived — `skill-levels-xp-events` shipped the curve alone and left the closed set
  to `xp-from-events` — and the `# event` that did ship binds a name to a pool crossing a threshold,
  which a landed swing is not. `# event` and `on empty:` are untouched here.
- **`credit:` is untouched, and the wrapper idea is dropped.** An earlier pass of this re-plan made
  the redirect a result wrapper — `them:` — renamed from `credit:` and widened. That is a level of
  nesting for one word: `on hit: 1 in 4: them: drain: 3 health` is four colons deep and reads as
  structure rather than as a sentence. Putting the party on the result that moves the amount costs
  no nesting and reads as English. `credit:` keeps its own job — moving a whole body of rewards to a
  killer, including `roll:`, which names a table rather than anything with a side — and the finding
  `credit-names-an-intent-where-the-grammar-elsewhere-names-a-s` stays open rather than being closed
  here. Whoever retires it will do so by giving `xp:`, `give:` and `roll:` the same trailing phrase,
  which is a change this branch's fixtures do not need and should not pay for.
- **The party is a phrase on the result, not a marker on the pool name.** `drain: 3 their health`
  was the other candidate, matching `depletes: their health` on an action exactly. It loses on
  reading: `depletes: their health` names a pool and `drain: 3 health from them` moves an amount,
  and English puts the party after the thing moved. `from them` also extends to `give:`, `take:` and
  `xp:` unchanged, where a marker glued to a pool name would not reach `roll:` at all.
- **The suffix is on `drain:` and `restore:` and no further.** They are what this branch's fixtures
  move — poison and thorns take from the other party, rage restores the carrier's own. `give:`,
  `take:` and `xp:` have the same shape available and no fixture here needs one, so they do not get
  it now; adding a phrase nothing writes is how a grammar grows forms nobody can find.
- **An unmarked result is the carrier's.** Neither default covers every fixture: rage restores the
  carrier's pool and poison drains the target's, both under `on hit:`. Defaulting to the carrier is
  what "read from the character with the effect" means, and it puts the phrase on the sentence that
  reaches outside the block rather than on the one that does not.
- **The load error survives, with a different subject.** It was "a hook on an action that cannot
  swing"; it is now "a hook on an action at all". `isTwoSided` is not the test and neither is
  `resolvesPerAttempt` — the rule is that an action is not a carrier, and it is enforced where an
  action's fields are read.
- **Depletion is restated over characters, not over retaliations.** The earlier clause was written
  as "the way a retaliation that empties a pool already does"; `retaliates` is deleted and
  retaliation is unconditional. A hook can empty the pool of a character that was not struck — a
  `when hit:` draining `from them` is exactly that — so the verdict is taken over every actor the
  swing's effects reached.
- **This branch ships no content.** Every fixture belongs to `archetype-mods`, and a hook can be
  proven end to end from an inline fixture in a runtime test, which is what the shipped combat tests
  already do.
- **The chance mechanism is `droptables`', not this branch's.** An earlier draft gave the hooks a
  percentage of their own, reasoning that a gate on individual results would roll per result and
  make a two-result hook fire half of itself. `droptables` had already answered that: a wrapper
  wraps a result *body* and draws once for it, and it applies wherever the DSL takes a result list.
- **Hooks fire on swings, not on damage.** Defining the trigger as a resolved swing rather than as a
  pool decreasing is what makes recursion impossible without a guard. The alternative needs a depth
  limit, and a depth limit is a number someone has to defend.
- **The buff engine is not built here.** `buffs-generalized` holds an exact `produces` claim on
  "buff engine" and its deliverable is already "applying to any entity rather than the player
  alone". This branch is ordered before it, so the timed modifier poison needs arrives after — and
  the gather it defines is where a buff joins as a carrier when it does.
- **One counter multiplier, several counter sources — and it is already shipped.**
  `skill-levels-xp-events` merged on 2026-08-09 with `foldBonus(bonus, fold, times)` and
  `# skill`'s `per-level:`, which is a stat bonus scaled by a level. That is this shape's runtime
  half, built before this branch reached it, so what remains here is the authored spelling and a
  second source for `times`. Building a second multiplier would be the duplication this branch's own
  decision was written to prevent.
- **`per-level:` and `+N <stat> per <counter>` are two positions, not two spellings.** `per-level:`
  sits on `# skill` and is the *declaration*: what one level of melee is worth, said once by the
  thing that defines melee. `+2 attack per rage` sits on an item, a passive or an entity and is the
  *grant*: what this carrier gives, said by the carrier. A skill cannot express the second — a
  passive that scales off rage is nothing melee knows about — and a carrier should not have to
  restate what a level is worth. They meet at `foldBonus`, which is the test that they are one
  mechanism: if this branch writes a second scaling function, they were two after all.
- **Fixtures are content, not code.** They exist to prove the primitives compose. A mechanism whose
  tests pass while the resolver has grown a branch named after one of them has failed at the thing
  it was built for, which is why their absence from `src/runtime` is a clause.

## Open questions

- **Does an unequipped item's hook reach anyone?** No, by the rule that a hook arrives the way its
  carrier's stat bonuses do — and `statRange` already reads equipped items only, and only for the
  player, because `ownStores` still gates buffs and equipment to `PLAYER`. That gate is
  `buffs-generalized`', named here because it now bounds hooks as well as bonuses: until it goes, a
  rat cannot wear a poisoned blade. Nothing this branch owes needs it to.
- **Do misses get hooks?** `on miss:` is the obvious counterpart and no fixture needs one.
  `xp-from-events` names `missed` and `evaded` among its eight moments, so it is the record that
  will first want them — and if it does, they are more verbs of this shape rather than a second
  mechanism. Decided there.
- **Can a `say:` inside a hook name who it is about?** Inherited unchanged from
  `combat-encounter-grammar`: the log is one second-person channel, so a hook's `say:` is in the
  player's voice whoever swung. Decided by whoever gives the log a subject.
