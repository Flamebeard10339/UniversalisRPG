# combat-events

Re-planned 2026-08-09 against the grammar `full-refactor-of-enemies-and-combat` shipped. The three
things the previous head note said rested on the grammar it replaced are settled below, and one
recorded decision is overturned by name: the actor-carried half is no longer an event handler.

## Deliverable

The runtime gains one hook mechanism; the DSL gives every one of its blocks a name that says which
party the results land on. A hook is a result block that fires at the instant a two-sided swing
lands. It has two hosts — an `# action`, so a weapon can poison what it hits, and an `# entity`, so
a thing that swings nothing at all can still answer being hit — and four block names, because a
landed swing has two parties and either host may want either of them.

The enabling change beneath it is small and specific. `resolveAttempt` already holds both parties as
`self` and `other`, `result-application-seam` has already given result application a subject, and
`combat-encounter-grammar` has already settled that the page names the side. What remains is when to
fire, who it lands on, what a load error rejects, and when depletion is decided.

No archetype effect is a feature of this branch. Each is a fixture `archetype-mods` assembles in the
DSL out of these primitives, the runtime must not contain any of their names, and this branch ships
no content.

Proof:

- [c1] Four block names, two hosts, and a recipient on every one of them. `on hit them:` and
  `on hit me:` are result blocks the load path accepts on an `# action` and on an `# entity`;
  `on struck them:` and `on struck me:` it accepts on an `# entity` alone. No hook block is
  unmarked: there is no `on hit:`, and a block whose recipient would have to be recovered from
  `depletes:` or from which host declared it does not parse. An entity may carry hooks with no
  `uses:` and no action of its own. All four survive a serialize/reload round trip on both hosts.
  proof: vitest src/grammar/action.test.ts src/content/roundTrip.test.ts
- [c2] A hook on an action that cannot swing is a load error. `isTwoSided` is the test — an action
  that names no side has no *them* for a hook to land on — and it is asked where a whole action is
  assembled, so a top-level `# action` and an entity's overloaded copy of one are rejected alike,
  while a fragment that is well-formed only once the two are joined is not rejected early. `on hit:`,
  `on hit self:`, `when hit:` and `on struck …` on an action are each refused by name, naming the
  block to write instead.
- [c3] `on hit them:` and `on hit me:` fire at the instant a two-sided swing lands — of the
  declaring action, or by the declaring entity, whichever host carries the block — and their results
  land on the struck party and the swinging party respectively. A weapon that poisons its target and
  a weapon that feeds its wielder are the same trigger differing only in the block name.
- [c4] `on struck them:` and `on struck me:` fire when a two-sided swing lands on the declaring
  entity, whatever swung it, and their results land on the swinger and on the struck entity
  respectively. This is what lets a thorns effect reach its attacker, and it is available to an
  entity that swings nothing at all — which is the case no action-declared hook can serve.
- [c5] A hook body is an ordinary result list, so it inherits `droptables`' selectors unchanged and
  this branch adds no chance mechanism of its own. A 5%-on-hit effect is `1 in 20:` wrapping the
  body inside `on hit me:`, a gear-scaled one is `<stat> vs <stat>:`, and a state-gated one is
  `if <condition>:`. The draw discipline that comes with them is already shipped and is not
  restated here.
- [c6] Hooks fire on a landed swing only. A swing that misses fires none of the four blocks, and no
  moment that is not a resolved two-sided swing fires any of them.
- [c7] Firing never recurses. Only a resolved swing fires a hook, and a pool change produced by a
  hook's results is not a swing, so two entities that each carry `on struck them:` damage terminate
  by construction rather than by a depth counter.
- [c8] Firing order within one swing is fixed and stated: damage is applied, the swing is logged,
  then the swung action's hooks, then the swinging entity's hooks, then the struck entity's hooks —
  `them` before `me` within each host, and declaration order between blocks of one name on one host.
  Two hooks that write one pool compose deterministically.
- [c9] Depletion is decided after the swing's hooks have applied, and over every actor a hook
  reached rather than the struck one alone. A target finished off by a hook ends the fight exactly
  as one finished by the swing does; a swinger felled by the entity it struck leaves the fight at
  that instant, and ends it if it was the player or the armed action's target.
- [c10] A stat bonus can be scaled by a counter. `+N <stat> per <counter>` reads a counter's current
  value and contributes through the existing `added` and `increased` channels, alongside the flat
  and percent forms `tagClause` already parses, and it is read for the actor the stat is being read
  for rather than for the player. This branch defines the shape with a resource's level as its first
  counter; `buffs-generalized` adds a buff's stack count and `per-grammar-dependent-stats` adds a
  stat, as further counters of the one shape rather than as second spellings of it.
- [c11] No identifier anywhere in `src/runtime` is named for any fixture `archetype-mods` composes —
  poison, rage, thorns or accelerated vigor — and no branch in the resolver exists for any of them.
  `content/` is untouched by this branch, so no shipped fixture can stand in for a primitive that
  did not generalize.

### Primitives

What this branch owes, named. Each is a strategy the runtime implements and the DSL composes.

| primitive | host | fires when | results land on |
| --- | --- | --- | --- |
| `on hit them:` | `# action`, `# entity` | a two-sided swing of this action, or by this entity, lands | the struck party |
| `on hit me:` | `# action`, `# entity` | the same instant | the swinging party |
| `on struck them:` | `# entity` | a two-sided swing lands on this entity | the swinger |
| `on struck me:` | `# entity` | the same instant | this entity |
| `+N <stat> per <counter>` | tag clause | — | — |

### Fixtures belong to `archetype-mods`

No archetype effect is this branch's. `archetype-mods` owns them as authored content — "authoring
all three is the test that the engine generalized rather than growing three special cases" — and it
is ordered behind `buffs-generalized`, which owns the timed-modifier and stacking halves. This
branch owes the primitives above and the constraint that the runtime never names any fixture.

| fixture | what it needs | whose |
| --- | --- | --- |
| poison | `on hit them:` and a timed debuff carried by the struck actor | here, then `buffs-generalized` |
| rage | a resource with a constant drain, `on hit me:` granting it, `+N <stat> per rage` | here |
| accelerated vigor | `1 in 20:` inside `on hit me:`, a stacking buff, `+N% <stat> per stack` | here, then `buffs-generalized` |
| thorns | `on struck them:` on the carrier | here |

Rage and accelerated vigor are both kept because they are not the same mechanism wearing two names:
a resource has a ceiling and a rate that regeneration can push against, and a stack count has
neither. That is two counters behind one `per <counter>` shape, which is why the shape is defined
once here rather than once per fixture.

## Decisions

- **The actor-carried half is a hook on an entity, not a handler on an event.** This overturns the
  recorded decision that a persistent effect "names one event from the `skill-levels-xp-events`
  vocabulary". That vocabulary never arrived: `skill-levels-xp-events` ships the curve only and left
  the closed event set to `xp-from-events` on 2026-08-09. What did arrive is `# event`, which binds
  a name to *a pool crossing a threshold* — a shape a landed swing does not have, and one whose
  handler results land on the entity it happened to with `credit:` as the single marked exception.
  Reaching thorns through it would mean extending `# event`'s trigger set with moments that are not
  threshold crossings, colliding with `xp-from-events`' own eight, and widening `credit:` from "who
  caused this" to "the other party" so that a hook on the swinging side had somewhere to land. Four
  changes to shipped mechanisms to avoid writing one block name. An entity-declared hook costs none
  of them and reads as the same sentence the action-declared one does.
- **`when hit:` was dropped, and comes back as `on struck …`.** The earlier draft rejected a
  symmetric `when hit:` beside `on hit:` because a passive enemy with no swinging action could not
  carry an action-declared block. That argument was against an *action*-declared pair and does not
  reach an entity-declared one: `on struck …` is carried by the thing that gets hit, needs no
  `uses:`, and is exactly what that rejection said was missing. The conclusion is reversed; the
  reason it was reached is not.
- **Every hook block names its recipient, and there is no unmarked block.** One unmarked block whose
  results land on the struck actor beside one marked block whose results land on the swinger is the
  defect `combat-encounter-grammar` exists to remove, one level up. `them` and `me` are the
  object-case of the `their` and `my` that action fields already write, so a reader who knows one
  knows the other.
- **`credit:` is neither reused nor renamed.** It means "the party this moment identifies as the
  causer", which is right for a death and wrong for a hook, where the recipient is a choice the
  author makes rather than a fact the moment supplies. A hook says which party on its own block name
  and never consults `credit:`. Renaming `credit:` to `them:` would unify the two vocabularies and
  is the better end state; it is filed as its own question rather than smuggled in, because it
  touches a word `full-refactor-of-enemies-and-combat` shipped four days ago and buys this branch
  nothing.
- **`# event` is not extended and `skill-levels-xp-events` is not required.** The requirement on it
  existed for the event vocabulary alone. With the vocabulary gone from this branch's design, the
  edge is stale everywhere except one place: the `per <counter>` slice writes `src/runtime/stats.ts`
  and so does the curve's fold. That collision gets the narrow edge, following the ruling of
  2026-08-09 on the same two files; the rest of the branch is unblocked behind the merged refactor.
- **Action-declared and entity-declared are both kept, because their scopes differ.** A hook on
  `# action envenomed-strike` poisons only what *that* action hits; a hook on an entity fires for
  every two-sided swing it makes. Under the grammar this branch was first written against there was
  no per-weapon host to scope to at all — the swing was `fight:` on the foe — so the argument is
  stronger now than when it was made, not weaker.
- **The load error survives, with a better test.** The earlier head note expected this clause to
  dissolve once `accuracy:`/`target:` left actions. They did not: `accuracy:` stayed and `target:`
  became `depletes:`, and `resolvesPerAttempt` still answers true for a one-sided action with an
  implicit target pool. `isTwoSided` is the honest test, because what a hook needs is a *them*, not
  a hit roll — and it is asked at `assembledActionProblem`, which is where a whole action is
  assembled and which both assembly points already share.
- **Depletion is restated over actors, not over retaliations.** The earlier clause was written as
  "the way a retaliation that empties a pool already does"; `retaliates` is deleted and retaliation
  is unconditional. The invariant that replaces it is stronger and is what `on struck them:` forces:
  a swing's hooks can empty the pool of an actor that was not struck, so the verdict is taken over
  every actor the swing's effects reached.
- **This branch ships no content.** The earlier plan named `content/tutorial-island.dsl` in its
  forecast. Every fixture belongs to `archetype-mods`, and a hook can be proven end to end from an
  inline fixture in a runtime test, which is what the shipped combat tests already do. Authoring a
  hook onto the tutorial rat would be an archetype effect wearing a regression's clothes.
- **The chance mechanism is `droptables`', not this branch's.** An earlier draft gave the hooks a
  percentage of their own, reasoning that a gate on individual results would roll per result and
  make a two-result hook fire half of itself. `droptables` had already answered that: a wrapper
  wraps a result *body* and draws once for it, and it applies wherever the DSL takes a result list —
  which a hook body is.
- **Hooks fire on swings, not on damage.** Defining the trigger as a resolved swing rather than as a
  pool decreasing is what makes recursion impossible without a guard. The alternative needs a depth
  limit, and a depth limit is a number someone has to defend.
- **The buff engine is not built here.** `buffs-generalized` holds an exact `produces` claim on
  "buff engine" and its deliverable is already "applying to any entity rather than the player
  alone". This branch is ordered before it, so the timed modifier poison needs arrives after.
- **Rage is a resource and accelerated vigor is a stack, and both are kept.** A resource carries a
  ceiling and a rate that a regeneration effect can push against, which a stack count cannot. The
  two are different mechanisms, not one described twice.
- **One `per <counter>` shape, several counter sources.** Rage needs a bonus that reads a pool's
  level, vigor a stack count, and `per-grammar-dependent-stats` a stat. Spelling those separately
  would be one mechanism authored three times, so the shape is defined here and the other two extend
  its counters. That record already says so in its own evidence and claims only the resolution point
  and its cycle guard.
- **Fixtures are content, not code.** They exist to prove the primitives compose. A mechanism whose
  tests pass while the resolver has grown a branch named after one of them has failed at the thing
  it was built for, which is why their absence from `src/runtime` is a clause.

## Open questions

- **May an equipped item declare hooks?** Thorns reads naturally as an entity's property and a
  thorns aura granted by armour reads naturally as an item's. Nothing this branch owes needs the
  second, and `items-mods-and-crafting` is where an item's granted effects are decided. Delegated to
  that record, not to this branch's worker.
- **Do misses get hooks?** `on miss them:` / `on miss me:` are the obvious counterparts and no
  fixture needs one. `xp-from-events` names `missed` and `evaded` among its eight moments, so it is
  the record that will first want them — and if it does, they are more block names of this shape
  rather than a second mechanism. Decided there.
- **Should `credit:` be renamed `them:`?** One word for "the other party" across handlers and hooks
  is plainly the better end state, and `credit:` reads as a reward wherever the results are not one.
  Filed as `credit-names-an-intent-where-the-grammar-elsewhere-names-a-s` because it touches shipped
  grammar for no gain here.
- **Can a `say:` inside a hook name who it is about?** Inherited unchanged from
  `combat-encounter-grammar`: the log is one second-person channel, so a hook's `say:` is in the
  player's voice whoever swung. Decided by whoever gives the log a subject.
