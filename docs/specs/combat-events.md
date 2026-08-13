# combat-events

Re-planned 2026-08-09 against the grammar `full-refactor-of-enemies-and-combat` shipped, and
corrected the same day after the first re-plan hung hooks off `# action`. That was wrong and the
sword is why: equipping a blade that poisons cannot mean the wearer now performs a different attack.
An `# action` is the **verb** — what damage is applied, and to which pool, which is what tells
woodcutting from melee from ranged. An effect is never a verb. Both recorded decisions that rested
on the action host are overturned by name below.

## Goal

A character can carry an effect that fires when a swing lands, and `archetype-mods` can author
poison, rage, thorns and accelerated vigor out of what this leaves behind without the runtime
knowing any of their names. The two blocks, their carriers and the party a result moves between are
what that costs; a counter-scaled stat bonus rides along because a passive that grants one is the
same kind of thing as a passive that grants a hook.

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

## Audit passes

### Pass 1 — 2026-08-10

- base: `402b310dac65bed22fa4d7ea1e7006a22a378b74`
- head: `b8327e0e6949c3abe4849f53c37628a75e506e38`
- proof 1: met — Both blocks parse on both carriers and on nothing else, and both survive the round trip.
  Structural: HOOK_FIELDS (src/grammar/hook.ts:15) is spread into exactly two schemas, entitySchema
  (src/content/entity.ts:132) and itemSchema (src/content/item.ts:29), and referenceSites.visitSection
  calls hooks() only in the 'entity' and 'item' arms (src/content/referenceSites.ts:275,287), so no other
  kind can hold one. Every other section reaches either the actionBody refusal (location, and an action
  block anywhere) or the generic "unknown <kind> field" error. Neither block names a side, an action or a
  weapon: HookCarrier is two ActionResult[] and nothing else.
  Tests: src/content/parse.test.ts "the two carriers of a hook" (entity reads on hit:/when hit: as hooks
  while on death: stays a handler; item reads both while swing: stays an action; location refused);
  src/content/roundTrip.test.ts "carries both hook blocks, on both carriers, through serialize and reload"
  plus its it.each sibling that deletes a printed hook and demands the diff report it, which is what stops
  a dropped hook reading as clean; src/content/serialize.test.ts asserts the reloaded item's whenHit and
  that its actions list is still only ['polish'].
  Mutation (manifest C:\Users\yonat\AppData\Local\Temp\mutations-combat-events-pass1.json and
  ...-pass1-mutations-c3c4.json): deleting the on-hit print in serialize.ts:196, deleting the HOOK_FIELDS
  spread from item.ts:29, and deleting it from entity.ts:132 were each KILLED by the named round-trip
  test, re-run at its own file with the mutant still applied.
  Not covered: an item's on hit: is the one of the four carrier-by-block pairs no round-trip or serializer
  fixture exercises — finding "an item's on hit: is the one carrier-and-block pair no round trip covers".
- proof 2: unknown — Not attempted by this branch and not verified by me. No reader of onHit or whenHit exists
  anywhere in src/runtime (grep -rn "onHit\|whenHit" src/runtime returns nothing), so there is no gather to
  compare against the sources statRange folds, and no equip/unequip behaviour to observe. Discharged by
  combat-hook-firing, which is open. Recorded unknown rather than unmet because no implementation was
  reviewed, not because one was reviewed and failed.
- proof 3: met — A hook on an action is refused on all three routes an action body can be reached by, with a
  message that names the carrier. src/grammar/hook.ts:22 holds the one sentence ("write it on the
  `# entity` or `# item` that carries it, because an action is the verb and is shared by everyone who
  performs it"); hookLabelProblem is asked from actionBody.parse and actionBody.parseBlock
  (src/grammar/action.ts:317,321), and HOOK_FIELD_REFUSALS joins RETIRED_ACTION_FIELDS (action.ts:175) so
  the labels are also refused written as fields inside an action body. A section-level `# action` reaches
  the same code: src/content/action.ts:22 parses it with actionBody.parseBlock. The retired four-block
  spellings on hit self: and on hit them: are refused by name on both routes
  (src/grammar/hook.ts:26-29).
  Tests: src/grammar/action.test.ts "a hook is carried by a character, not by a verb" (six cases across
  the field route, the block-label route and the retired names); src/content/parse.test.ts "refuses a hook
  on a section that carries no character modifier" drives the same refusal through a real
  locationSchema parse.
  Mutation: deleting refuseHookLabel from parseBlock (KILLED, 4 named tests), deleting it from parse
  (KILLED, 2 named tests), and deleting the HOOK_FIELD_REFUSALS spread (KILLED, 4 named tests), each
  re-run at src/grammar/action.test.ts with the mutant still applied.
- proof 4: met — The phrase reads where English puts it and the preposition follows the verb.
  src/grammar/actionResult.ts:78-95 reads a trailing `from`/`to` plus `me`/`them` after the resource,
  rewinds when neither preposition follows, refuses an opened phrase that names neither party, and refuses
  the wrong preposition naming the right one (PREPOSITION = { drain: 'from', restore: 'to' }); an unmarked
  result carries no `party` key at all (parsePool returns the bare pool), which is what makes "unmarked is
  mine" a representation rather than a default someone has to remember. The serializer re-derives the
  preposition from the sign rather than holding a second field (src/content/serialize.ts:97).
  Tests: src/grammar/action.test.ts "which party a drain: or restore: moves its amount between", five
  cases including the ranged amount inside a wrapper with a comma list after it.
  Mutation: 4 of the 5 aimed lines KILLED by their own named tests — dropping the party from the result
  (`return pool`), unbounding the party reader so it swallows the rest of the line, hardcoding the verb
  handed to parseParty, and disabling the "names a party" refusal; plus the serializer's party clause,
  KILLED by the round-trip test. One SURVIVED: the `cursor.pos = start` rewind at actionResult.ts:87 is
  unobservable because requireEnd re-skips whitespace — filed as its own finding.
  Not proven here, and not provable at this layer: the clause's last sentence ("`me` is always the
  carrying character and `them` the other party the moment identifies") is a runtime resolution claim, and
  nothing in src/runtime reads `party` yet. Two things follow, both filed as findings: the phrase is
  currently accepted on every drain:/restore: in the language including one-sided actions where no other
  party exists, and today the runtime applies such a result to the actor regardless of what was written.
- proof 5: met — A hook body is the same resultList an action's result groups use (src/grammar/hook.ts:16-17),
  so every droptables selector nests inside one unchanged and this branch adds none of its own — the diff
  of src/grammar/actionResult.ts adds the Party type and parseParty and touches no wrapper.
  Re-runnable: npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass1-c5.dsl
  --round-trip reports "round-trips clean" for an item whose on hit: holds `1 in 20:`, `vigor vs vigor:`,
  `if calm:` and a `one of:` table with a `nothing` row, and whose when hit: holds an inline `1 in 4:`.
  src/content/parse.test.ts and roundTrip.test.ts both carry the `1 in 20:` nesting as well.
  Untested, because no hook fires yet: the draw discipline these selectors bring at runtime. The clause
  says that half is already shipped and not restated here, so it is not this branch's to prove.
- proof 6: unknown — Not attempted by this branch and not verified by me. Nothing fires a hook: no reader of
  onHit or whenHit exists in src/runtime, and resolveAttempt is untouched by this diff. Discharged by
  combat-hook-firing, which is open.
- proof 7: unknown — Not attempted by this branch and not verified by me. Nothing fires a hook, so there is no
  firing path whose termination could be argued or tested. Discharged by combat-hook-firing, which is open.
- proof 8: unknown — Not attempted by this branch and not verified by me. No firing order exists to observe;
  src/runtime is untouched by this diff. Discharged by combat-hook-firing, which is open.
- proof 9: unknown — Not attempted by this branch and not verified by me. The depletion verdict is untouched;
  src/runtime is untouched by this diff. Discharged by combat-hook-firing, which is open.
- proof 10: unmet — Half of it is shipped and the other half is missing in a way that is silent rather than
  loud, which is why this is unmet rather than unknown. Shipped: `+N <stat> per <counter>` parses beside
  the flat and percent forms (src/grammar/tagClause.ts:700 STAT_BONUS gains an optional `per` group),
  resolves its counter as a resource (src/content/referenceSites.ts:visitTags puts `per` as kind
  'resource', so `+2 attack per fury` with no such resource is a load error), and prints back namespaced
  (`+2 base.vigor per base.rage`), all covered by src/content/parse.test.ts and the round trip.
  Missing: nothing folds it. src/runtime/stats.ts:29 is still
  `for (const tag of tags) if (tag.kind === 'stat-bonus' && tag.statId === statId) foldBonus(tag, fold, 1)`
  — the counter is never read, and that line is the one that folds an equipped item's tags. So
  `+2 attack per rage` on an item grants a flat +2 at every rage value, including zero. Before this branch
  that clause was a load error, so the change for that input is from refused to silently wrong. The clause
  also asks for a grep of src/runtime/stats.ts finding one function scaling a BonusAmount by a count: that
  part holds, foldBonus is still the only one. Discharged by combat-hook-firing; filed as a finding so the
  interim state is not invisible.
- proof 11: met — Verified and currently true, but vacuously so — say so to the next pass rather than treating
  it as settled. `grep -rniE "poison|thorns|rage|vigor|accelerated" src/runtime/` returns nothing outside
  identifiers of its own (hitChance, hitDamage), and `git diff --stat 402b310..b8327e0 -- content/` is
  empty, so this branch ships no content and no shipped fixture can stand in for a primitive. It is clean
  because src/runtime is untouched by this diff, not because a resolver was written and kept general. The
  clause is discharged by combat-hook-firing, and the same two commands must be re-run against that slice
  before this grade means anything.

### Pass 2 — 2026-08-10

- base: `402b310dac65bed22fa4d7ea1e7006a22a378b74`
- head: `b8327e0e6949c3abe4849f53c37628a75e506e38`
- No independent measurement. The pass-1 auditor re-ran `tasks audit --args-from` on the same file to
  read output it had truncated, and the command appended a second, identical pass and a duplicate of each
  of its eight findings; the duplicates are declined. Every standing and every word of evidence here is
  pass 1 above. Recorded as an occurrence of `tasks-audit-args-from-is-not-idempotent-a-second-run-of-the-`.

### Pass 3 — 2026-08-10

- base: `402b310dac65bed22fa4d7ea1e7006a22a378b74`
- head: `6757444f062f9b23dcc6a52e10a95514ecfd183c`
- proof 1: met — Both blocks parse on both carriers and on nothing else, and a non-empty hook survives the round trip.
 Re-runnable: npm run mutate -- C:\Users\yonat\AppData\Local\Temp\mutations-combat-events-pass3.json, aimed at the
 four lines this clause is about rather than at pass 1's. KILLED, each re-run at its own file with the mutant still
 applied: the HOOK_FIELDS spread in src/content/entity.ts (roundTrip "carries both hook blocks, on both carriers,
 through serialize and reload"); the when-hit half of hookLines in src/content/serialize.ts:197 (same test — pass 1
 only broke the on-hit half); listMembers in the hooks() walk at src/content/referenceSites.ts:102 (parse.test
 "resolves a hook written as an edit, on a carrier that has none to edit yet", the pass-1 crash fix); and the
 inline-and-block refusal at src/grammar/section.ts:168 (parse.test "rejects a field written inline and as a block").
 Structural, re-checked independently of pass 1: HOOK_FIELDS is spread into entitySchema and itemSchema only, and
 referenceSites.visitSection calls hooks() only in the 'entity' and 'item' arms. Probed acceptance rather than
 assumed it: npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass3-b.dsl --round-trip
 round-trips clean for an item carrying both blocks with a nested 1 in 20:, a one of: table with party phrases in
 its rows, and a comma list inside an inline 1 in 4:.
 The exception, filed as a finding and not covered by any test: a hook whose list is EMPTIED rather than absent does
 not survive the round trip. Reproduce with
 npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass3-mods\base.dsl C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass3-mods\patch.dsl --round-trip
 — a patch module removing the only entry of a base entity's on hit: leaves onHit: [], the serializer's
 length guard prints nothing, the reload yields undefined, and roundTripModule reports "entities: changed
 base.berserker". The branch's own parse.test asserts [] is the outcome of `-when hit:` and no round-trip covers it.
- proof 2: unknown — Nobody has looked because there is nothing to look at: git diff --stat 402b310..6757444 -- src/runtime/
 is empty, and grep -rn "onHit\|whenHit" src/runtime returns nothing. No gather exists to compare against the
 sources statRange folds and no equip/unequip behaviour to observe. Discharged by combat-hook-firing, which is open
 and not started. Recorded unknown rather than unmet because no implementation was reviewed, not because one failed.
- proof 3: met — A hook label is refused on every route an action body is reached by, with a message naming the carrier.
 Re-runnable: the manifest entry "c3 a hook label is refused on the block route a real section reaches" deletes
 refuseHookLabel from actionBody.parseBlock (src/grammar/action.ts:322) — KILLED by four named tests in
 src/grammar/action.test.ts, re-run at that file with the mutant still applied. Independent of the test suite:
 npm run probe -- - --each over C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass3-c.txt refuses
 `on hit:` on a # location with "write it on the `# entity` or `# item` that carries it"; the same refusal reaches a
 section-level # action through content/action.ts's actionBody.parseBlock, and HOOK_FIELD_REFUSALS joins
 RETIRED_ACTION_FIELDS so the labels are refused written as fields inside an action body too. The retired four-block
 spellings `on hit self:` and `on hit them:` are refused by name on both routes (src/grammar/hook.ts:26-29).
 The `on hit` label is also refused as an event NAME where the name is bound (src/content/registry.ts:235) — the
 manifest entry "c1 an event a hook label would answer is refused where the name is bound" was KILLED by
 parse.test "refuses an event whose name only a hook block could answer". Noted, not filed: that refusal is on the
 event's local name only, so `# event hit` is refused globally even though another module could still answer it as
 `on <module>.hit:`; a defensible narrowing, but it is a name the language no longer allows anyone to declare.
- proof 4: met — The phrase reads where English puts it, the preposition follows the verb, and the phrase is refused
 everywhere the moment identifies no second party.
 Re-runnable: three manifest entries. "c4 the party phrase is refused at the line entry point" (deleting refuseParty
 from parseResultLine, src/grammar/actionResult.ts:324) and "c4 the preposition follows the verb" (disabling the
 `preposition !== wanted` check) were both KILLED by their own named tests in src/grammar/action.test.ts, re-run at
 that file with the mutant still applied.
 Verified independently of the tests, because a refusal rule is proved by where it does NOT fire as much as by where
 it does. npm run probe -- - --each over C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass3-g.txt,
 -h.txt and -i.txt refuses the phrase on every non-hook route in the language: a # droptable section body, a
 `one of:` row inside one, a dialogue choice effect, a # location action, an entity `on <event>:` handler in both
 the block and the inline form, an action's `on success:` in both forms, and inside a `credit:` nested in one.
 -b.dsl accepts it on every hook route: inline, block, inside `1 in 20:`, inside a `one of:` row, in a comma list,
 and through a patch module's `+on hit:`. I could not find a bypass.
 Two things the grade does not cover, both filed. First, the SECOND copy of the refusal — resultList.parse at
 src/grammar/actionResult.ts:340, which is the only guard on every inline result list — SURVIVED its mutation
 against the whole 2208-test suite. Second, a `roll:` into a # droptable from inside a hook cannot carry a party at
 all, and the refusal message tells the author it "reads only inside `on hit:` or `when hit:`" when the table's body
 is reached from inside exactly that. The clause's last sentence — that `me` is the carrying character and `them`
 the party the moment identifies — remains a runtime claim nothing in src/runtime reads yet.
- proof 5: met — A hook body is read by hookResultList, whose parse and parseBlock are the same parseResults and the same
 per-line reader every other result list uses (src/grammar/actionResult.ts:347-351); the only difference is that it
 does not run refuseParty. The diff of src/grammar/actionResult.ts adds the Party type, parseParty, firstParty and
 refuseParty and touches no wrapper, no selector and no draw.
 Re-runnable: npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass3-b.dsl --round-trip
 reports "round-trips clean" for an item whose on hit: holds `1 in 20:` and a `one of:` table with a `nothing` row,
 and whose when hit: is an inline `1 in 4:` followed by a comma list. Untested because nothing fires yet: the draw
 discipline at runtime, which the clause says is already shipped and not restated here.
- proof 6: unknown — Nothing fires a hook. src/runtime is untouched by this diff (git diff --stat 402b310..6757444 --
 src/runtime/ is empty) and resolveAttempt is unchanged, so there is no trigger whose landed/missed condition could
 be observed. Discharged by combat-hook-firing, which is open.
- proof 7: unknown — Nothing fires a hook, so there is no firing path whose termination could be argued or tested.
 src/runtime is untouched by this diff. Discharged by combat-hook-firing, which is open.
- proof 8: unknown — No firing order exists to observe; src/runtime is untouched by this diff. Discharged by
 combat-hook-firing, which is open.
- proof 9: unknown — The depletion verdict is untouched; src/runtime is untouched by this diff. Discharged by
 combat-hook-firing, which is open.
- proof 10: unmet — Re-confirmed independently, and it is worse on one axis than pass 1 recorded.
 The shipped half holds and is now mutation-proved: "c10 the counter is resolved as a resource" (disabling the
 `per` reference site at src/content/referenceSites.ts:137) was KILLED by parse.test "resolves the counter as a
 resource, so a bonus scaled by nothing is a load error", and "c10 the counter survives the serializer" (deleting
 the ` per <counter>` clause from src/content/serialize.ts:174) was KILLED by the round-trip test. So it parses,
 resolves and prints back namespaced.
 The missing half: src/runtime/stats.ts:29 is still
 for (const tag of tags) if (tag.kind === 'stat-bonus' && tag.statId === statId) foldBonus(tag, fold, 1)
 — `tag.per` is never read, so `+2 attack per rage` on an equipped item grants a flat +2 at every rage value
 including zero, where before this branch it was a load error. The clause's own grep test does hold: foldBonus is
 still the only function scaling a BonusAmount by a count (grep -n "foldBonus" src/runtime/stats.ts finds one
 definition and two call sites, both passing a count).
 What pass 1 did not record: the clause names the carriers as an entity, an item, a passive or a buff, and the
 spec's own Deliverable prints `+2 attack per rage` on a `# entity berserker`. That does not load at all —
 npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass3-a.dsl reports
 'unexpected content: "+2 attack per rage"', because entitySchema has no clauses field and an entity has never been
 able to carry a stat bonus. The authored spelling therefore reaches one of the two carriers the clause names.
 Filed as a finding. Discharged by combat-hook-firing plus whatever gives an entity a tag-clause field.
- proof 11: met — Verified and currently true, and still vacuously so — say so to the next pass rather than treating it
 as settled. grep -rniE "poison|thorns|rage|vigor|accelerated" src/runtime/ returns matches only inside DSL fixture
 text embedded in src/runtime/*.test.ts (enemy-pool.test.ts, resolve.test.ts) — no identifier, no resolver branch.
 git diff --stat 402b310..6757444 -- src/runtime/ content/ is empty, so this branch ships no content and touches no
 resolver. It is clean because src/runtime is untouched, not because a resolver was written and kept general; the
 same two commands must be re-run against combat-hook-firing before this grade means anything there.

### Pass 4 — 2026-08-13

- base: `3b355399a84e75c561de667023c340e601fcc1c3`
- head: `125f2304ae957d66ec7c44c1be78d53b1dfb7c7c`
- proof 1: met — Re-verified independently; the grammar half is untouched by this range, so pass 3's bytes are the bytes graded. `git diff 3b355399a84e75c561de667023c340e601fcc1c3..125f2304ae957d66ec7c44c1be78d53b1dfb7c7c` over src/grammar/ and src/content/ prints nothing at all.
 Structural, re-checked cold: HOOK_FIELDS is spread into exactly two schemas, src/content/entity.ts:132 and src/content/item.ts:89, and referenceSites calls hooks() only at src/content/referenceSites.ts:309 and :323, the entity and item arms.
 Re-runnable, my own fixture rather than pass 3's: npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-c1c5.dsl --round-trip reports "hookprobe: round-trips clean" for an item carrying `+4-7 attack`, an `on hit:` holding `1 in 20:`, `if calm:` and a `one of:` table with party phrases in its rows, and an inline `when hit: 1 in 4:` with a comma list; and for an entity carrying both blocks. Pass 3's four mutation kills stand over unchanged bytes.
- proof 2: met — The gather is the walk statRange folds, and the two share one function rather than agreeing by convention: modifierCarriers is defined at src/runtime/stats.ts:91 and has exactly two callers, statRange at src/runtime/stats.ts:134 and characterHooks at src/runtime/hooks.ts:15.
 Re-runnable: npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-mutations.json. Three entries, all KILLED, each re-run at its own file with the mutant still applied. "c2 an equipped item joins the one modifier walk both a hook and a stat bonus read" (emptying the hooks a worn item contributes) killed 9 named tests including hooks.test.ts "reaches its wearer while the item is equipped and stops when it comes off". "c2 the entity's own sheet is a carrier on the same walk" (deleting the entity push) killed 6, including "reads the entity block off whoever is being evaluated, whatever the player wears".
 The shared-walk half is proved by the third entry rather than asserted: "c2 an item that came off is off the walk" deletes the carriesItem guard from inside modifierCarriers and is killed by src/runtime/equipment.test.ts "equipment-slots: a slot keeps its item across losing and re-acquiring it" — a stat-side test that predates hooks. Breaking the hook gather breaks the stat fold, which is what "rather than a list of its own" means.
 Named, not a defect this branch owes: modifierCarriers gives the entity carrier `tags: []`, and statRange still folds the performing action's tags, buffs and skill levels outside the walk. See the finding on that seam.
- proof 3: met — Re-verified independently of pass 3 and of the suite. Re-runnable: npm run probe -- - --each < C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-c3c4.txt. Variant 1 (a section-level `# action` carrying `on hit:`) is refused with 'action "swing": on hit: is carried by a character rather than by a verb — write it on the `# entity` or `# item` that carries it, because an action is the verb and is shared by everyone who performs it'; variant 2 reaches the same refusal through a `# location`; variants 3 and 4 refuse `on hit self:` and `on hit them:` by name with 'was never implemented — there is one `on hit:` per carrier'. The error names the carrier in every case. src/grammar/ is untouched by this range.
- proof 4: met — Both halves now, where pass 3 could only grade the grammar. Grammar, re-probed at C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-c3c4.txt: `drain: 3 health to them` is refused with 'drain: takes its amount away from a party, so it is written `from them` rather than `to them`', `restore: 3 health from me` with the mirror of it naming `to me`, and `from nobody` with 'drain: from names a party'.
 Runtime, which pass 3 recorded as unprovable at that layer: src/runtime/effects.ts:190 subjectOf is the one place a party becomes an actor, and it is read only by `case 'pool'` at :242. Re-runnable: the manifest entry "c4 a party phrase names a character other than the one the list is applying to" replaces subjectOf's body with `return actor` — KILLED by 6 named tests in src/runtime/hooks.test.ts, re-run at that file with the mutant still applied. `me` and `them` are set in one place, src/runtime/hooks.ts:36 fireMoment, as { me: carrier, them: other } for the duration of that carrier's results and restored after, which is what makes one rule serve both blocks.
- proof 5: met — No chance mechanism was added: src/grammar/actionResult.ts is untouched by this range, and the whole of this branch's change to src/runtime/effects.ts is the Party import, the `parties` field on Segment, subjectOf, and its use in `case 'pool'` — no wrapper, no selector, no draw.
 Re-runnable: npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-c1c5.dsl --round-trip round-trips clean for a hook body holding `1 in 20:`, `if calm:`, a `one of:` table with a `nothing` row, and an inline `1 in 4:` followed by a comma list.
 The draw discipline is now observable for the first time and the branch tests it: src/runtime/hooks.test.ts "draws once for the body rather than once per result inside it" runs 40 swings through a `1 in 2:` wrapping a say and an `add:`, and asserts the flag count equals the spoken count, which is the property that would fail if the draw were per result.
- proof 6: met — Re-runnable: two entries in C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-mutations.json aimed at the one guard, src/runtime/runtime.ts:323. "c6 a miss fires neither block" drops `dealt !== null` and is KILLED by hooks.test.ts "fires neither block on a miss"; "c6 an attempt on an implicit target fires neither block" drops `isTwoSided(action)` and is KILLED by "fires nothing for an attempt that lands on an implicit target". Both re-run at their own file with the mutant still applied.
 The clause's second sentence holds by construction as well as by test: assembledActionProblem at src/grammar/action.ts:276 refuses a side-naming action with nothing to deplete, so `isTwoSided(action)` implies `action.depletes`, and there is no two-sided moment that could fire a hook and then skip the verdict.
- proof 7: met — Structural, and the structure is the whole argument the clause makes. fireHooks has exactly one call site in the repository — `grep -rn "fireHooks" src/ scripts/` returns its definition at src/runtime/hooks.ts:26, the import at runtime.ts:56 and the single call at runtime.ts:323, inside resolveAttempt. Nothing reachable from applyResults can swing: applyOne's arms are say, set, unset, add, give, take, xp, relocate, discover, open-modal, pool, stop, chance, contest, gate, credit, one-of and roll, and the one indirect route out of it, fireEvents, re-enters applyResults. There is no depth counter anywhere, which is what the clause promises.
 Measured rather than argued: npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-c7c9.ts builds the most recursive shape the grammar allows — both characters carrying both blocks, every one of the four draining `from them`, plus an item carrying both — and one second of it returns in 2ms with exact arithmetic (player 97, mirror 93, two log lines). A firing that recursed would not terminate.
- proof 8: met — Re-runnable: two entries in C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-mutations.json, both KILLED and re-run at their own file with the mutant still applied. "c8 the swinger's on hit: runs before the struck one's when hit:" swaps the two fireMoment calls at src/runtime/hooks.ts:27-28 and is killed by hooks.test.ts "logs the swing, then the swinger carrier by carrier, then the struck one", which asserts the log is exactly ['You hit the Dummy for 1.', 'charm', 'ring', 'dummy'] — the swing's line first, so "damage is applied, the swing is logged, then the hooks" is asserted as a sequence and not inferred. "c8 carriers fire in the order the modifier walk returns them" appends .reverse() to characterHooks and is killed by two named tests.
 Within-character order is the gather's order by construction, not by a second sort: characterHooks maps modifierCarriers directly, and modifierCarriers is the same list statRange folds.
- proof 9: met — Re-runnable: two entries in C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-mutations.json, both KILLED at src/runtime/hooks.test.ts with the mutant still applied. "c9 the verdict is taken over every character a hook reached, not the struck one alone" deletes the reached loop from felledBy (runtime.ts:287-290); "c9 the verdict is taken after the hooks have applied" passes an empty reached list. Both are killed by "fells a swinger with what it struck, and ends the fight because it was the target", which also pins the credit — the ear and the 3 fury go to whoever emptied the pool, not to whoever swung.
 Measured beyond the branch's own fixtures, because a fight can hold more than two characters through `allies:` (runtime.ts:534): npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-c9b.ts arms the player against a boss whose ally joins, and the player's `when hit:` fells the ally on the ally's own swing. Roster goes from [player, boss, minion] to [player, boss], cadences and actors likewise, and the fight goes on — the "leaves the fight at that instant" half, on the one shape that can exercise it.
 Two things this grade does not cover, both filed as findings. The leaveFight call that produces the result above survives its own mutation against the whole 2732-test suite. And "ends it if it was the player" is not delivered: a player emptied by a `when hit:` stays armed and keeps swinging — but a control probe (audit-combat-events-pass4-c9c.ts) shows a player emptied by an ordinary swing does exactly the same, so the parity this clause actually sets as its standard holds and the gap is the engine's, not this branch's.
- proof 10: met — The half pass 1 and pass 3 both recorded missing is now shipped and mutation-proved, and the clause's own grep test still holds.
 Re-runnable: three entries in C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-mutations.json. "c10 the counter is read as the count foldBonus multiplies by" rewrites src/runtime/stats.ts:51 back to `foldBonus(tag, fold, 1)`, which is the exact line passes 1 and 3 quoted as the defect — KILLED by 4 named tests in src/runtime/stat.test.ts including "grants nothing at all where the counter is empty, rather than a flat bonus". "c10 the counter is floored before it multiplies" drops Math.floor and is KILLED by "floors the level before it multiplies, because a counter counts points". Both re-run at their own file with the mutant still applied.
 No second multiplier: `grep -n "foldBonus\|scaledAmount" src/runtime/stats.ts` finds foldBonus defined once at :34 with three call sites (:51 the tag fold, :67 the plane payload, :109 the skill level), all passing a count, and the one multiplication inside it is the pre-existing scaledAmount that c19 of items-mods-and-crafting put there. counterLevel supplies a count and multiplies nothing.
 Two caveats, both filed. Which character's pool the counter is read off is unasserted — replacing that lookup with the player's own store survives the whole 2732-test suite, and I reproduced the reachable case by probe. And the clause names an entity among the carriers while the spec's own Deliverable prints `+2 attack per rage` on `# entity berserker`, which still does not load: npm run probe -- C:\Users\yonat\AppData\Local\Temp\audit-combat-events-pass4-deliverable.dsl reports 'unexpected content: "+2 attack per rage"'. That is the open pass-3 finding, recurred rather than refiled.
- proof 11: met — Verified, and non-vacuous for the first time: passes 1 and 3 both recorded this clean only because src/runtime was untouched, and this range is the resolver those passes were waiting for.
 Re-runnable: `grep -rniE "poison|thorns|rage|vigor|accelerated" src/runtime/` returns matches only inside DSL fixture text embedded in test files (clusterEffect.test.ts, command.test.ts, enemy-pool.test.ts, resolve.test.ts, runtime.test.ts) — no identifier and no resolver branch in any shipped file. The three new resolver surfaces are Moment, characterHooks, fireHooks, fireMoment (hooks.ts), subjectOf (effects.ts) and counterLevel, ModifierCarrier, modifierCarriers (stats.ts): every one is named for the mechanism and none for a fixture, and the branch's own test module deliberately spells its counter `fury` and its thorns carrier `briar-mail`. `git diff 3b35539..125f230` over content/ prints nothing, so this branch ships no content.
