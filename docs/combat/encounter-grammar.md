# Encounter grammar

How combat is written down. The reader this is for is the worker on
`full-refactor-of-enemies-and-combat`: the rules and the worked shapes come first, the argument for
them second.

## The invariant

**Every field in an authored combat block names the side it reads, from that block alone.**

A reader holding only the page can say what a field refers to. An answer that depends on a bare tag
elsewhere in the block, on which section the block is nested under, or on a rule written in another
file does not count. Today's grammar fails this: on `# entitytype melee-foe`, `fight` and `bite` are
identical clause for clause except the word `retaliates`, and what makes them opposite is which side
is `self` — a mapping that exists as a comment at `src/runtime/encounter.ts:58` and a comment at
`content/tutorial-island.dsl:289`, and nowhere in the grammar.

## The proposal

### Two kinds of action, told apart by the block

An action either names sides or it does not, and that is the whole distinction:

- **Two-sided.** It writes `my` and `their`. It is brought by the one performing it and applied to a
  target. `melee-combat` is two-sided.
- **One-sided.** It writes neither. It belongs to the object that declares it and has one
  participant. The mirror's `look in` is one-sided.

Nothing else has to be remembered, and nothing declares which kind it is: side vocabulary in the
body is the declaration.

### `# action`

An action is a top-level declaration with an id, referenced by id, so it is written once and used by
anything:

```
# action melee-combat
title: Fight
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health
```

`my` and `their` are relative to the one performing this action, which is intrinsic — an action has
exactly one performer. A side marker is required wherever a field names a **stat, pool or skill**,
because those exist on both sides. Literals and structural fields (`time:`, `escape after`,
`instant`) carry none, because there is no other side for them to be confused with.

`X vs Y` is a contest: my `X` against their `Y`. The right half is optional and its absence means the
neutral default, as today. `accuracy:` and `damage:` are the two contests; `depletes:` names the pool
a landed hit reduces.

`title:` is the display name, defaulting to `humanize(id)` the way every other section's does. An
action written **inline** under an entity, item or location is unchanged from today — its label is
its title, `roast chestnuts:` stays one line — because a one-off is referenced by nothing and needs
no id. Both forms parse identically; `# action` exists for the shared case.

### How an action ends

`attempts: N` bounds an action at N attempts. It completes if it gets there in time and runs
`on success:`; if it does not, it runs `on unfinished:`. Absent means unbounded, so a fight ends when
a side is down or when someone leaves the room.

This replaces `escape after N` and `on escape:`, which were the same mechanism named for the one case
they were imagined in. The case that shows the name was wrong is not combat: cooking a fish is one
attempt yielding a cooked fish or a burnt one, and nothing escaped. `attempts:` is a literal and
carries no side marker, because a count has no other side to be confused with.

`on unfinished:` is deliberately not called `on failure:`. That name is occupied by a different
moment — today `on failure:` fires only when an action cannot *start* for want of inputs
(`src/runtime/runtime.ts:478`) — and repointing it silently is the class of defect this document is
written against. That `on failure:` means "could not begin" is a real naming defect, but it is in a
non-combat corner of the grammar and is filed separately rather than fixed here.

### `uses:` and overloads

An entity lists the actions it performs. An entity may overload its own copy:

```
# entity giant-rat
uses: melee-combat
melee-combat:
  +hidden if: rats-killed >= 3
```

A bare line replaces the inherited value; a `+` line appends to it. An overload block naming an
action the entity does not `use:` is a load error, so a typo cannot silently add an action.

**An overload governs that entity's own performance of the action, and nothing else.** The block
above stops the rat swinging; it does not stop you attacking the rat. That is what an entity-level
`hidden if:` does, and the two are different sentences in different places.

### Targets

What makes a target valid is **the pool the performer's action names, and nothing on the target**.
`depletes: their health` reaches anything with a health pool; `depletes: their wood` reaches anything
with a wood pool. A new tree species is choppable with no edit to the woodcutting action, and there
is no list of permitted types for anyone to keep in sync.

An entity that performs a two-sided action must declare every stat that action names on its side.
Falling through to the global `# stat` bases is a load error — the rule
`non-entity-action-owner-inherits-player-stats` shipped, restated as a property of two-sided actions
rather than as a ban on one kind of owner.

### Retaliation, factions and aggression

Retaliation is unconditional: an entity attacked by a two-sided action performs its own matching
action in return, if it has one. It is not authored, because nothing that can retaliate ever wants
not to — a tree does not need `attack-rate: 0`, it simply has no `uses:`.

What *is* authored is disposition, on the entity, because the player and the rat share
`melee-combat` and only one of them is hostile:

```
# faction world
# faction player

# entity giant-rat
aggressive

# entity player
faction: player
```

An entity belongs to one or more factions and defaults to `world`. **Two entities are hostile when
they share no faction.** An `aggressive` entity opens the fight itself against any hostile entity in
its location; everything else waits to be attacked. A neutral that nobody attacks is one that joins
every faction, and an ally is one that joins yours.

Membership is a bitmask at runtime, so the check is one `and` and an entity is in several factions
for free. It is authored as declared names rather than as numbers: `faction: 3` is unreadable on the
page, which is the whole thing this grammar is for, and an undeclared name is a load error the way
every other reference is — otherwise `faction: vermni` silently invents a faction hostile to
everyone.

**A fight is bounded by its location.** An aggressive entity keeps swinging while its target is in
the room and disengages when the target leaves; it does not follow. Travelling out is therefore how
a player breaks off a fight, and it needs no authored mechanism.

### `# event` and handlers

An event binds a name to a pool crossing a threshold:

```
# event death
resource: health
trigger: on empty
```

Any entity may handle it. **Results in a handler apply to the entity the event happened to.** Where
they should land on whoever caused it, `credit:` says so:

```
on death:
  add: rats-killed 1
  say: You put down another rat.
  credit:
    xp: melee 4-6
    roll: rat-remains
```

`credit:` is an ordinary result wrapper, so it composes with `1 in 3:`, `luck vs 60:` and `if` the
way `droptables` already defines. Counters and log lines have no subject and are unaffected by it.

This is where `on empty:`/`on full:` go. They are on `# resource` today, which is why they can only
be written in the player's voice — `# resource health`'s block says "You slump to the floor" for
every actor that could ever empty a health pool. A `# resource` now declares the pool's shape and
nothing else.

### Entities

```
# entity player
title: You
stats: max-health 10, attack-rate 25
skills: melee, cooking, thieving
equipment-slots: head, body, legs
uses: melee-combat
allies: miki
on death:
  relocate: starting-location
```

The player is an entity, and declares everything that affects it. `skills:` sits beside `stats:` for
the same reason: `# skill melee` declares what melee is and `skills:` says who has one, exactly as
`# resource health` declares the pool and `max-health` says who carries it. `equipment-slots:`
likewise — today the slot vocabulary is inferred from `slot:` on items, which quietly gives a rat a
head slot.

`respawn after: 30s` on an entity says how long after it leaves the world it returns. Absent means
never, so a boss simply omits it and nobody has to remember that zero is a magic value.

`hidden if: <condition>` on an entity means it is not present.

### Locations and populations

A location's `entities:` list takes counts:

```
entities:
  3 giant-rat, stairs-up
```

Absent count is one, so every line that ships today is unchanged. The count is the place's fact; the
respawn delay is the thing's fact, and they are written where they belong.

### Sides

Your side is you and your `allies:`; their side is your target and its `allies:`. Attacking a second
foe while a fight is running adds it to the fight rather than starting another. An entity attacks one
target at a time.

`allies:` names **types with counts**, never instances: `allies: 2 bandit`. An author cannot address
one particular spawned rat, in any written form. Nothing needs to — results reach the right instance
because the moment supplies the subject, which is what `result-application-seam` already gives them.

An ally does not have to be standing in the room beforehand. `allies:` is a roster, not a filter over
what the location holds, so `allies: 2 bandit` brings two bandits into the fight whether or not the
camp was authored with any. They are fight-scoped: they exist while the fight does, the way
`ActiveAction.actors` already does at `src/runtime/encounter.ts:17`.

### Performing an action

Two forms, following the two kinds of action:

- Two-sided: `use: <action> on <target>` — `use: melee-combat on giant-rat`,
  `use: woodcutting on oak-tree`.
- One-sided: `use: <obj>.<objId>.<action>` — `use: entity.mirror.look in`, unchanged.

## Worked shapes

### One player against one rat

```
# action melee-combat
title: Fight
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health

# event death
resource: health
trigger: on empty

# faction world
# faction player

# entity player
title: You
faction: player
stats: max-health 10, attack-rate 25
skills: melee, cooking, thieving
equipment-slots: head, body, legs
uses: melee-combat
on death:
  say: You slump to the floor, spent. (You should have eaten something.)
  set: fainted
  stop

# entity giant-rat
title: Giant Rat
examine: A hunched rat claws at an overturned crate, eyes red in the dark.
stats: attack 8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
uses: melee-combat
aggressive
on death:
  add: rats-killed 1
  say: You put down another rat.
  credit:
    xp: melee 4-6
    roll: rat-remains
    1 in 3:
      roll: trinket
```

`use: melee-combat on giant-rat`. Both sides run their own copy of one block.

### A location holding five rats, each respawning thirty seconds after it dies

```
# entity giant-rat
title: Giant Rat
stats: attack 8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
uses: melee-combat
aggressive
respawn after: 30s
on death:
  credit:
    xp: melee 4-6
    roll: rat-remains

# location basement
x: 0, y: 0, z: -1
examine: A damp cellar, crates stacked against the walls.
adjacent:
  guide-house
entities:
  5 giant-rat, stairs-up
```

### A fight with more than two participants

```
# faction bandits

# entity miki
title: Miki
faction: player
stats: max-health 30, attack 6, defense 2, attack-rate 20, accuracy 70, evasion 45
uses: melee-combat

# entity bandit
title: Bandit
faction: bandits
stats: max-health 15, attack 5, defense 1, attack-rate 18, accuracy 55, evasion 35
uses: melee-combat

# entity bandit-leader
title: Bandit Leader
faction: bandits
stats: max-health 40, attack 11, defense 3, attack-rate 14, accuracy 65, evasion 30
uses: melee-combat
aggressive
allies: 2 bandit
on death:
  credit:
    xp: melee 20-30
    roll: bandit-hoard
```

With `allies: miki` on the player, `use: melee-combat on bandit-leader` is two against three. Neither
side is "me and it", and no section was added to say so. The bandits share `bandits` and Miki shares
`player`, so nobody swings at their own side and the leader's `aggressive` reaches only across.

### A felled tree that regrows after sixty seconds

```
# resource wood
max: max-wood

# event felled
resource: wood
trigger: on empty

# action woodcutting
title: Chop
requires: has axe
time: 8
damage: my woodcutting
depletes: their wood

# entity oak-tree
title: Oak Tree
examine: A broad oak, its bark scored by old cuts.
stats: max-wood 3
respawn after: 60s
on felled:
  say: The oak comes down.
  credit:
    xp: woodcutting 15
    give: 2 log

# location forest-edge
entities:
  4 oak-tree
```

`use: woodcutting on oak-tree`. The tree has no `uses:`, so it never swings back; it needs no
`attack-rate: 0` and no combat block. Same spawn model, same event mechanism, no combat in it.

### Looking in a mirror

```
# entity mirror
examine: A tall mirror in a gilt frame. Your reflection waits, nameless.
look in:
  instant
  hidden if: mirror-done
  open modal: character-creation
  set: mirror-done
```

Unchanged from what ships. It names no side, so it is one-sided and belongs to the mirror;
`use: entity.mirror.look in` still addresses it. This is the shape that proves the two kinds coexist
without an author having to declare which they are writing.

## The shipped content, side by side

Today, `content/tutorial-island.dsl:295`:

```
# entitytype melee-foe
fight:
  rate: attack-rate
  accuracy: accuracy
  evasion: evasion
  ability: attack
  dr: defense
  target: health
bite:
  retaliates
  rate: attack-rate
  accuracy: accuracy
  evasion: evasion
  ability: attack
  dr: defense
  target: health

# entity giant-rat
type: melee-foe
title: Giant Rat
examine: A hunched rat claws at an overturned crate, eyes red in the dark.
stats: attack 8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
fight:
  hidden if: rats-killed >= 3
  xp: melee 4-6
  on success:
    add: rats-killed 1
    say: You put down another rat.
    roll: rat-remains
    1 in 3:
      roll: trinket
```

Under this proposal:

```
# action melee-combat
title: Fight
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health

# entity giant-rat
title: Giant Rat
examine: A hunched rat claws at an overturned crate, eyes red in the dark.
stats: attack 8, defense 0, max-health 20, attack-rate 16, accuracy 60, evasion 40
uses: melee-combat
aggressive
hidden if: rats-killed >= 3
on death:
  add: rats-killed 1
  say: You put down another rat.
  credit:
    xp: melee 4-6
    roll: rat-remains
    1 in 3:
      roll: trinket
```

Thirty lines become twenty-one, `# entitytype` and `retaliates` are gone, the duplicated block is
gone, and the six-field stat sheet reads as four lines that say which side each half belongs to. The
one semantic change is `hidden if:`: today it hides the player's `fight` action while leaving the rat
in the room, and here it removes the rat, which is what the content means.

## What the invariant buys, and where it does not hold

It holds for every field of a two-sided action: `my` and `their` are written, and the performer is
intrinsic to the block rather than assigned by a tag elsewhere in it.

It holds for handler results, which was the harder half. `on death:` applies to the entity that died
— always, on the player and on the rat alike — and `credit:` is the one marked exception. An earlier
draft of this design put the killer's rewards in an unmarked `on death:` block on the foe and the
victim's own consequences in an unmarked `on death:` block on the player. That is the original defect
one level up: same block name, opposite recipient, decided by which entity you were reading.

**Where it does not hold.** Three places, named against this proposal rather than only against
today's:

1. `attempts: 20` does not say whose attempts. It cannot mean the other side's, because a count is
   not a stat and there is no second one to confuse it with, but the reader is relying on that
   argument rather than on the page.
2. An action with `accuracy:` and no `depletes:` keeps today's abstract progress pool. Nothing on the
   page says what it is depleting, because it is depleting the action itself. This is inherited, not
   introduced, and it is out of scope here.

`aggressive` was a third until factions landed. It said nothing about who an entity was aggressive
*toward*, and "everyone" was a rule living in this document rather than on the page. `faction:` moves
the answer onto the entity, and the word now means aggressive toward anyone it shares no faction
with — readable from the two blocks involved.

## Ownership, argued

**An action is owned by nobody and performed by one participant.** That is the decision, and it is
what collapses `# entitytype melee-foe` from two blocks to zero.

The two blocks exist today only because the entity owns the action in which it is the object *and*
the action in which it is the subject. Nothing else in the grammar behaves that way: the oven's
`roast chestnuts` is offered by the oven and performed by the player, and there is no second block
where the oven roasts something at you. Combat grew the second block because the rat genuinely does
swing, and the only place to put its swing was the same list.

Separating the two makes the duplication unnecessary rather than merely tidier. One block, performed
by whoever is swinging, reading `my` off the swinger and `their` off the struck. The player performs
their own copy, which is what makes `uses: ranged-combat` on an equipped bow mean anything at all —
if the player ran the rat's action, the rat would decide how the player fights.

Alternatives that lost:

- **The entity keeps a `fight:` block and the swing moves to a shared move.** The engagement block
  would be authored per foe, so a hundred enemies is a hundred near-identical copies of `xp:` and
  `hidden if:` — the duplication this branch exists to remove, relocated.
- **Interactions own everything, and entities own no actions.** The refactor record proposes this.
  It breaks `<obj>.<objId>.<actionId>` addressing for ovens and doors, which CLAUDE.md makes
  first-class for anything an object can do, and it is aimed at the wrong half — the defect is that
  entity-owned actions are *sometimes* about the entity and sometimes about its victim, not that
  entities own actions.
- **`# entitytype` survives, restricting actions to permitted entity types.** A list of types is a
  second place that has to be edited whenever a species is added, and CLAUDE.md forbids systems that
  must be manually kept in sync. The pool an action names is the same restriction, derived.
- **Factions written as numbers.** `faction: 1` and `faction: 3` are the runtime representation
  written down. They are unreadable on the page, and a mistyped digit is a valid faction, so the
  names are authored and the bits are compiled.
- **`on escape:` renamed to `on failure:`, the obvious word.** It is occupied by a different moment
  and repointing it silently is this document's own defect. Renaming *that* field instead — freeing
  the good word for this one — is the better end state and is filed as its own record, because it
  reaches into non-combat grammar this branch does not own.
- **`auto-retaliate` as an authored field.** Considered and dropped: nothing that can retaliate ever
  wants not to, and the one apparent counterexample, a tree, has no `uses:` and so cannot. A field
  with no counterexample is one nobody will ever write.

## The three questions the substrate is waiting on

**(a) Can an author address an individual spawned rat?** No, in any written form. A location holds a
count, `allies:` holds counts of types, and no syntax anywhere names one instance. Results reach the
right instance because the moment supplies the subject. `instanced-objects` therefore needs no
content-facing identity: instance ids are minted by the runtime, never written down, and never parsed.

**What makes something an instance, in the grammar.** `skills:` on an entity is the trigger, because
skill experience is per-individual and outlives any one fight. An entity that declares `skills:` is
durably instanced; one that does not is a template, and the pools it carries in a fight are
fight-scoped and vanish with it. That is `instanced-objects` c3's laziness rule with an authored
tell: an author can see from the block whether a thing is instanced. Shipped content declares
`skills:` on the player and on nothing else, and no enemy that earns experience is planned — the
mechanism generalises, the content does not exercise it.

**(b) Does a fight name its sides by type or by instance?** By type. `allies: 2 bandit` names a
template and a count; the opposing side is the target plus its allies; joining adds whoever you
attack next. No fight declares a roster.

**(c) Where is a respawn timer written?** On the spawned thing — `respawn after: 30s` on
`# entity giant-rat`, absent meaning never. The count is on the place, because how many rats are in
this basement is a fact about the basement, and how long a rat takes to come back is a fact about
rats. Putting the timer on the place was considered and lost: it is the first thing an author looks
for on the species, and a place that genuinely needs a different one can declare a different entity.
If that turns out to bite, it is a change to one field's home and not to the model.

## Expressiveness against what ships

| behaviour today | under this proposal |
| --- | --- |
| `retaliates` | **Dropped.** It marked which of two blocks was the entity's own; there is one block. Retaliation itself is unconditional and unauthored. |
| `escape after N` | **Renamed** `attempts: N`, inherited and overloadable. N is the performer's attempts, so a foe can disengage too — symmetric where today only the player could. |
| `on escape:` | **Renamed** `on unfinished:`. Same moment, same results, a name that fits the cooking case as well as the combat one. |
| implicit target pool (no `target:`) | Kept unchanged for one-sided actions. A two-sided action must write `depletes:`, because a side-naming action with nothing to deplete is not a contest. |
| `accuracy` / `evasion` | One contest line: `accuracy: my accuracy vs their evasion`. Both field names disappear; neither behaviour does. |
| `ability` / `dr` | One contest line: `damage: my attack vs their defense`. Same. |
| `rate:` naming a stat read live | Kept, written `rate: my attack-rate`. The comment at `src/runtime/stats.ts:69` about reading against whoever is swinging becomes the word `my`. |
| `rate:` as a literal | Kept, unmarked — a literal has no side. |
| `time:` | Kept, unmarked. |
| `# entitytype` action templates | **Replaced** by `# action` + `uses:`, which is strictly more expressive: `uses:` is a list, so an entity composes several actions instead of inheriting one type. |
| `on success:` / `on failure:` on a fight | **Replaced** by event handlers. A fight's outcome is a participant's death, which is an event on that participant, and putting the reward there is what lets the same rewards fire however the rat died. Non-combat actions keep both blocks unchanged. |
| `on empty:` / `on full:` on `# resource` | **Moved** to entity handlers via `# event`. This is what stops them being writable only in the player's voice. |
| `stop` | Kept, as a result inside a handler. `content/tutorial-island.dsl:69` is right that this is where health becomes the fatal pool; it moves to `# entity player`'s `on death:`. |

## The player

The player is `# entity player`, shipped in content, declaring stats, skills, equipment slots, the
actions it uses, its allies and its handlers. It is nameable in a side list because it is an entity
id. The grammar reads nothing from it that it does not read from a rat.

This deletes both identity special-cases the refactor record names:

- `participants()`'s `PLAYER` branch (`src/runtime/encounter.ts:70`) goes because there is no
  privileged self: every participant is an actor performing its own action.
- `statRange`'s `if (actorId === PLAYER)` gate (`src/runtime/stats.ts:35`) covers three things.
  Buffs and equipment generalize by actor once the player is one. The third — folding the active
  action's tag bonuses — generalizes too, but only because this grammar names the role it needs: the
  bonuses belong to **the performer of the action**, not to the player, so the fold takes the
  performer's action rather than `state.activeAction`. Worth naming, because "make the player an
  instance" alone does not delete that third case.

The global `# stat` bases stop being the player's sheet. They remain what a stat's default is for an
entity that does not name it, which is what they already are for every entity that is not the player.

## Blast radius

A forecast for `full-refactor-of-enemies-and-combat`. Nothing here is changed by this branch.

**Changes:**

- `src/grammar/action.ts` — heavily. `my`/`their` stat references, the two contest lines,
  `depletes:`, `title:`; `retaliates` and the `BOOLEAN_ACTION_FLAGS` machinery it is the only member
  of are deleted; `accuracy`/`evasion`/`ability`/`dr`/`target` leave `ACTION_FIELDS` as such;
  `escape after` becomes `attempts:` and `on escape:` becomes `on unfinished:`. `requires`,
  `hidden if`, `time`, `rate` and the kind tags survive.
- `src/content/entity.ts` — `uses:`, overload blocks, `skills:`, `equipment-slots:`, `allies:`,
  `faction:`, `aggressive`, `respawn after:`, `hidden if:`, `on <event>:` handlers. `type:` is
  deleted.
- `src/content/entityType.ts` — **deleted**, with `entityType.test.ts`.
- `src/runtime/encounter.ts` — heavily. `retaliationOf` deleted; `participants()` loses its `PLAYER`
  branch and builds a symmetric roster; `Participant`'s `self`/`other` survive and the comment at
  line 58 goes, because the grammar now says what it said.
- `content/tutorial-island.dsl` — the two combat blocks, `# resource health`'s `on empty:`, the
  location's entity list, a new `# entity player`, and the `# test` at line 438, where
  `use: entity.giant-rat.fight` becomes `use: melee-combat on giant-rat`. The `expect:` save at line
  452 is regenerated.

**New:**

- A `# action` section, an `# event` section and a `# faction` section, in `src/content/`.
- `credit:` as a result wrapper, in `src/grammar/actionResult.ts`.
- A faction bitmask on the runtime's actor state, and the one `and` that decides hostility.

**Also touched:**

- `src/content/location.ts` — counts in `entities:`.
- `src/content/resource.ts` — `on empty:`/`on full:` removed.
- `src/runtime/stats.ts` — the gate, per the section above.
- `src/runtime/session.ts` and `src/runtime/actions.ts` — the `use: <action> on <target>` directive
  beside the existing `use:` form.

**Does not change:** `src/grammar/condition.ts`, `src/grammar/tagClause.ts`, `src/grammar/range.ts`,
`src/content/item.ts`, `src/content/recipe.ts`, `src/content/dropTable.ts`, `src/content/skill.ts`.
Conditions, stat-bonus tag clauses, ranges, drop tables and the chance wrappers are all reused
unchanged; this proposal adds no second spelling for anything they already do.

## Queued work

**`combat-events`** — compatible; requires re-planning; no ruling of its overturned.

Its four recorded rulings survive intact and this document reopens none of them: thorns stays a
persistent effect (and reads better here — a passive enemy is one carrying no `uses:`, rather than
one lacking a `retaliates` action), rage stays a resource, the chance mechanism stays `droptables`',
and the event vocabulary stays closed. `# event` binds a *name* to a resource and a trigger from that
vocabulary; it does not add triggers, so it is a naming layer and not a second vocabulary.

Three things it must re-plan:

1. **Its host exists here and does not exist today.** Its lead example is a weapon that poisons its
   target, scoped by declaring `on hit:` on an action. Today the swing is `fight:` on the foe, so the
   only thing an author can scope a hook to is *this rat*. A `# action` referenced by `uses:` is the
   per-weapon host it was written for.
2. **`on hit:` / `on hit self:` must both be marked.** One unmarked block whose recipient is the
   struck actor and one marked block whose recipient is the swinger is this branch's defect in
   miniature. Under the vocabulary here they are `on hit them:` and `on hit me:`. The mechanism and
   the scope argument behind keeping both are untouched.
3. **Two clauses dissolve.** "A hook on an action that cannot swing is a load error", tested by
   `resolvesPerAttempt` over `accuracy:`/`target:`, has nothing to range over once those fields leave
   actions — a hook lives on a two-sided action and a two-sided action always swings. And its
   depletion clause is written in terms of "a retaliation that empties a pool", a word deleted here.

**Position: it stands, re-planned behind the refactor.** Landing first means authoring hooks onto
blocks that are about to move, and its own weapon example does not work until the move happens.
Against: it lengthens a chain already waiting on `skill-levels-xp-events`. `docs/specs/combat-events.md`
now carries this as a note at its head, so whoever picks it up reads it before planning rather than
after.

**`buffs-generalized`** — compatible, and partly done for it. Its deliverable is buffs "applying to
any entity rather than the player alone"; the `statRange` gate that makes them player-only is deleted
here. It should re-scope rather than re-plan: the identity half is this refactor's, the stacking,
sign and duration halves remain its own.

**`result-application-seam`** — done, and this design leans on it: `credit:` is a result list with a
different subject, which `ResultApplication` already carries. **It reopens one recorded limitation.**
That branch left `applyResultsNow` naming `PLAYER` on purpose, on the grounds that "a foe's pool takes
the clamp but not the authored handlers, so it has no subject to vary over yet." Here a foe's pool
emptying runs the foe's `on death:`, so it does have one. That is a stated consequence, not a
disagreement with the decision, which was correct when it was made.

**`non-entity-action-owner-inherits-player-stats`** — subsumed, as its own record anticipates. Its two
load-time bans become one rule of the new grammar: an entity performing a two-sided action declares
every stat that action names on its side. It adds no mechanism and removes authorable cases, so it
shrinks what the refactor must keep working, exactly as it was written to.

**`starting-zone`** — no re-plan needed, but it must not start first. It authors monsters in whichever
grammar exists when it is worked, and it is already blocked behind `items-mods-and-crafting` and
`archetype-mods`, so ordering it after the refactor costs nothing and saves rewriting a zone.

## Open questions

- **Does the implicit target pool survive?** An action with `accuracy:` and no `depletes:` keeps
  today's abstract progress bar, unchanged, because it is one-sided and out of this branch's scope.
  Decided by whoever revisits the action kind taxonomy.
- **Should today's `on failure:` be renamed, freeing that word for `on unfinished:`?** It means
  "could not begin", which no reader would guess, and the better end state is plainly that this
  branch's outcome branch gets the obvious name. It is filed as its own record because it reaches
  into grammar this branch does not own. Decided by whoever takes that record.

Three questions this document carried in earlier drafts are answered above rather than delegated:
whether an `allies:` member must be present (no — `allies:` is a roster), whether `aggressive` needs
a leash (no — a fight is bounded by its location), and whether a non-player entity with `skills:`
earns experience (yes, mechanically; no enemy is planned that does).
