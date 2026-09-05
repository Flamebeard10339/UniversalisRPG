## An `# entity` cannot extend another, so a variant of a world body is retyped whole

`# action` takes `extends:` — "that action's whole body, with every line written here laid
over it" — and thieving leans on it three times. `# entity` has none (`npm run oracle -- entity`
names no such line), and laying a second body over an entity's id is not the same thing: it
changes the entity every other module sees.

So a quest wanting a variant of a world body has to copy it. `# entity cellar-rat`
(`content/kill-it-with-fire.dsl:82-93`) repeats `combat.feral-rat`'s title, examine, `uses:`,
faction, `aggressive`, respawn and drop table (`content/combat.dsl:601-608`) to add one
`hidden if:` and one kill counter — and it genuinely cannot lay them over `combat.feral-rat`,
because the gate and the counter would then reach every feral rat in the game. The same gap
is what `content/the-swampy-menace.dsl:51` reports as a different impossibility: staging a
character in another room needs a second, hidden copy of them, which is a hand-copy of
tulsa's.

**One thing to settle before that lands, because `extends:` would decide it silently.** The two
bodies do not carry their numbers the same way: `feral-rat` says `tier: mob` / `profile: brute`
/ `level: 4` and is audited against the ladder, while `cellar-rat` writes
`stats: attack 9, defense 1, max-health 24, attack-rate 18, accuracy 65, evasion 35` and, the
oracle's `# entity` page says of a body naming no tier, "is not audited against any of them".

They are not the same rat. Solved 2026-09-05, `combat.feral-rat` comes out at
**max-health 221.27, attack 14.27, accuracy 100, evasion 70, attack-rate 15** — against the
cellar rat's hand-written 24 health and 9 attack. Nine times the body. So this is not a copy
that drifted; either the cellar is deliberately full of weaker rats and should say so, or the
quest has been fighting a different animal than it named since it was written. An `extends:`
that inherits the tier would quietly make it the harder one.

*Closes when:* `# entity` takes `extends:` the way `# action` does, `cellar-rat` declares only
its gate and its counter, and whichever of the two rats it is meant to be is the one the ladder
sees.

## A single-text field cannot be extended, so a module appending a clause restates the sentence

`+<line>` adds to a body that holds a list. A single-text keyword has nothing to add to, and
says so: `+examine:` on another module's entity is refused with *"entity field examine is not
a list, so it cannot take +"*.

So a quest that wants to hang one conditional clause on a place's `examine:` writes the whole
sentence again. `content/ball-of-a-boy.dsl:77,80` restate two of tulsa's
(`content/tulsa.dsl:670,674`) to append a `{…}` fragment each, and
`content/kill-it-with-fire.dsl:113` restates a third (`content/tulsa.dsl:642`). Reword tulsa's
line and the quest keeps saying the old one, in the world, with every gate green.

*Closes when:* a text field takes `+`, appending rather than replacing, and the three quests
above write only the clause they are adding.

## A condition has no name, so one worth naming is written out wherever it is asked

`# flag <id>` takes one word, `bundle`, and nothing else — a flag cannot stand for a
condition. Nor can a route or a body ask which stage a quest is standing on: the engine states
a condition may read are `time`, `player.`, `setting.`, `xp.`, `level.`, `highest-level`,
`resource.`, `inventory.`, `count.`, `stat.`, `us.`, `them.` and `changed.`, and none of them
is a quest.

Measured 2026-09-05, the largest single instance is not a stage at all: `stat.match-clock >= 1`
— "the fishing match is running" — is written **ten times** in `content/fishing.dsl`. A stage
flag is a latch, so "standing on stage X" is written by hand as `X and not <the stage
after it>`, in `content/ball-of-a-boy.dsl:64,71`, `content/kill-it-with-fire.dsl:100,107`,
`content/fishing.dsl:1126` and `content/the-swampy-menace.dsl:97,105,113`. Inserting a stage
between two of them means finding every such condition; nothing derives them. The same gap
makes `content/combat.dsl:300,309,318,327,336` write one armour requirement five times.

*Closes when:* a condition worth naming can be named once and asked for by name, or a
condition can read the stage a quest stands on — and the compound conditions above are written
through it.

## Market Square is ruled legible, and still carries more than any room in town

Ruled 2026-09-03: **legible**. The square holds more entities and more roads than any other
room — `npm run probe -- content --show location.tulsa.market-square` counts both — and it
is the room every road in town runs through by design, so it is the worst case for a screen
a player has to read at a glance. The travel half is already capped — the sheet stops at one
step out and the rest is on the map — and nothing caps the entity list.

The lever is which entities stand there, not a number in the engine, so this is authoring:
a brief that thins the square and says where each entity it moves now stands. Nothing may
simply be deleted — a townsman who was the market square's is somewhere else afterwards, or
the room he moved to is named.

*Closes when:* the square reads at a glance, every entity taken off it stands somewhere a
road reaches, and `walking-the-town` still walks.

## Cooking, smithing and crafting still hang off the town rather than writing onto it

Ruled 2026-09-03: **the thieving inversion is the pattern, not the exception**, and fishing
is its own module on the same terms. Fishing is already off tulsa's `skills:` line, and so
are the two combat stats — `content/combat.dsl` lays them back with `+skills: attack,
health`, which is the move below already made once. What is left is the three that have not
made it: tulsa's line still names `core.woodcutting, cooking.cooking, smithing.smithing,
crafting.crafting`.

The move is the one `content/thieving.dsl` already makes and is four-ish lines per module:
the skill's stat comes off tulsa's `skills:` line and goes back as a `+skills:` laid over
`# entity tulsa.player` from the skill's own file, the skill takes `? tulsa` in its
`dependencies:`, and every id tulsa names of that skill's becomes an addressed heading
written from the skill's side. The verification is thieving's: `npm run probe -- content
--off <skill>` loads clean and every one of tulsa's routes still passes, so the skill
strips out and leaves a town behind.

Two references are not the town's and are a separate call: `content/first-steps.dsl` hands
out `fishing.small-fishing-net` and casts at `entity.fishing.shrimp-shoal`, and
`content/the-bars-crawl.dsl:19` writes `uses: fishing.cast`. A quest naming a skill's id is
not the same shape as a town declaring the skill on its player, and nothing above asks for
those to move.

*Closes when:* `npm run probe -- content --off cooking --off smithing --off crafting` loads
clean with tulsa's routes passing, and tulsa's `skills:` line names only `core.woodcutting`.

## A route that pins a gate cannot say which refusal it caught

This line used to say that nothing can prove a `hidden if:` works, because `refuse:` takes
`slot`, `allocate`, `unallocate` and `apply` and no `use:`. **That was wrong, and it was wrong
about the wrong directive.** `refused` is a separate, general directive standing under any line
the engine was asked to take, `use:` included — `refusalFrom` in `src/runtime/session.ts` catches
the `RuntimeError` a hidden action throws in `src/runtime/runtime.ts`. Measured 2026-09-03
against the shipped corpus: a route that searches `first-hive`, uses its `search-the-comb` and
writes `refused` PASSES, and the same route against the unsearched `second-hive` FAILS with *was
not refused*. Both fishing band gates behave the same way. So the hive beat is provable today,
and so is every gate the fishing expansion adds, with two lines and no language change.

What is actually missing is that `refused` does not say **why**. Also measured: a `use:` on the
pike reach from the wrong location is refused, and so is one with the bait unequipped. A route
meaning to pin a level band therefore passes for three unrelated reasons, and goes silently
vacuous the day the bait runs out or the walk changes. Every gate route anybody writes carries
that risk, and nothing reports it.

*Closes when:* a route can say which refusal it caught — `refused: <reason>` reading off the
same engine keys the refusals are raised under, so no second list of reasons exists — and the
routes for the hive and the two fishing bands are written against it.

## A long step still nets what a short step would have clamped

The parity the owner ruled for holds for buffs now, and the clamped-remainder half is
fixed: 27 of 42 shipped fights diverged between a small dt and a large one and 23 do.
What is left is two structural things, measured on 2026-08-30 and not fixed because
neither is a bug in the sense the first two were.

A segment nets a whole span's damage against a whole span's regeneration before it
clamps, so a long segment never notices the pool sat at its ceiling for part of it —
60s, regen 30/min, 16 incoming hits: 64.150 at dt=50, 64.500 at dt=1000, 66.000 in one
step. And `captureResourceRates` snapshots at segment start, so a debuff that changes a
*resource* rate mid-segment is ignored for the rest of it — health 0 at dt≤1000 against
10.375 in one 60s step.

Exposure is bounded: the engine normally steps one attempt-cycle at a time, and nothing
in the corpus changes a resource rate mid-fight. The one caller that takes a whole span
in one go is `session.ts:933`, which turns a `wait: <seconds>` directive into a single
`resolve`. So this is reachable from a `# test` and from nowhere a player stands.

*Closes when:* a span is cut at the moment a pool would reach its ceiling, or `wait:`
steps the way the loop does and the two structural cases are then unreachable — and
whichever it is, the parity claim in `runtime.test.ts` grows the case it did not cover.

## A condition wanted in several places is written out in each of them

The three guard threads in `the-swampy-menace.dsl` — the gate guard, the guardsman and Larry,
each pointing at the captain while the quest is on offer and untaken — carry the same
`when: kill-it-with-fire.oolgas-basement.cellar-cleared and ball-of-a-boy.down-the-grate.reported
and not oolgas-errands.errands` written out three times. One fact about when the pointer is live,
in three places, which is the shape this repository spends its commits undoing.

There is nothing to reach for. `npm run oracle -- dialogue` offers `when: <condition>` and
nothing that names a condition and points at it; a `# flag` holds a fact somebody sets rather
than a standing test, and a `# variable` holds a number. So the duplication is the language's
rather than the author's, and it will recur the moment a fourth speaker joins them.

*Closes when:* a condition can be declared once under a name and named wherever one is taken,
with `npm run oracle` saying so off the declaration; then those three lines are one.

## A workaround has no mark at its site

Comments are banned and `npm run comment-check` is the gate, so a workaround can no longer
carry a note saying why it is written the way it is — the three identical `when:` lines in
`the-swampy-menace.dsl` are the standing example, and the next reader is invited to "fix" the
duplication. The reason has a home: the line above this one. What is missing is a mark at the
site pointing at it.

What cannot go stale is a mark that says almost nothing. `@@@` already does this for the
corpus and `npm run notes` reads them out; the same mark carrying only the id of an open line
would say *there is a reason, and it is written down over there* — one home for the reason,
and a mark whose only failure mode is being orphaned, which is detectable. `npm run handoff`
already reports a proof no line stands on, which is the same check with a different subject.

*Closes when:* `npm run handoff` reports a `@@@ <id>` in the corpus that no open line names.

## An action a grown copy owns cannot survive being saved

`activeActionProblem` (`src/runtime/save.ts:203-221`) resolves an `activeAction`'s
owner with `findActionOwner(obj, objId, registry)`, and that reads the registry
alone (`src/runtime/actionLookup.ts:17-18`). A grown copy's id is minted into the
state's instance table and is in no registry map, so `item.<copy>` resolves to
nothing and the action is pruned off every load with `engine.action.stale.owner`.

Found while proving that composing two saves renumbers a copy everywhere it is
named: the route had to aim an action *at* the copy rather than hang it off one,
because hanging it off one is thrown away before anything can be asked about it.
Whether any shipped item that grows also carries an action is not the point —
`item-level:` and an action block are independent, and nothing refuses the pair.

*Closes when:* an action owned by a grown copy survives a save and a load, or the
pair is refused at load time so an author is told rather than quietly losing it.

## An anvil cannot be opened by a quest, though a counter now can

`# shop` takes `hidden if:` since 2026-09-03, so a quest opening or shutting a counter is one
line — which is what fishing's Hob wants. An entity's `stations:` still takes a bare id with no
condition, so `a-grand-blade` still cannot gate `tulsa.anvil` on having met the smith's son and a
player can craft at the forge before the quest exists.

The workaround the two shipped quests took is not the only one, and the line used to imply it
was. `tulsa.oolgas-counter` and `tulsa.anvil` are already entities of their own, separate from
Oolga and the smith, and an entity's `hidden if:` is honoured by `standing()` in
`src/runtime/population.ts` — so hiding the whole entity gates its station today. What that
cannot do is gate the *station* while leaving the entity's flavour standing: hiding `# entity
anvil` takes its `strike it:` line with it, and keeping the flavour means two entities with one
title, which is the duplication this repository spends its commits undoing. That is the real
shape of the wall.

`hidden if:` on `# station` itself is the cheap half and is world-wide by nature — right for
`anvil`, which one entity holds, and wrong in general, since `core.stove` is named by six of
tulsa's. Per-entity gating means a condition on the `stations:` **entry**, which costs an element
parser and breaks the auto-visit that reads a bare `<hole>` naming a kind.

*Closes when:* an entity's `stations:` can be gated on a condition without the entity going with
it, and `npm run oracle` prints the form off the declaration.

## A `them.` amount is taken where no two sides stand

`refuseParty` (`src/grammar/actionResult.ts:466`) is what enforces *the two sides stand
only inside `on hit:` or `when hit:``, and `firstParty` beneath it walks the `party` field
of `pool`, `inflict` and `shake-off` and nothing else. A `Sided` **amount** carries the same
two words in a different field and is not walked, so half the rule is unenforced. Put
through the real parser on 2026-09-02:

```
drain: them.attack health     PARSED  {"delta":{"side":"them","id":"attack","falls":true}}
drain: 5 health from them     REFUSED `from them` names one of two parties…
xp: mining them.attack        PARSED  {"amount":{"side":"them","id":"attack"}}
```

At runtime `readAmount` (`src/runtime/effects.ts:126`) reads
`segment.parties?.them ?? actor`, so the line that got through silently reads **the actor's
own stat** — a well-typed, plausible number, and no way downstream to tell it from the one
that was meant. `values.ts:175` already says these are "written nowhere a line is said to a
player", so the rule is stated and half-kept. `subjectOf` (`effects.ts:214`) carries the
identical `?? actor` and is safe only because `refuseParty` does cover its field; `stands`
(`effects.ts`, `case 'stands'`) is the shape to copy, returning 0 rather than falling back.

This is the same rule c02d4bc0 made `them.` throw for in a condition, one place short.

*Closes when:* a sided amount outside a hit list is refused where a sided party already is —
the two reading off one declaration rather than two walks — and a `describe` in this folder's
`open-tests.test.ts` pins the refusal, which is what a focused test is for.

## `ownerOf` answers three things and its callers hear two

`Namespace.ownerOf` returns `string | null | undefined`, and the three cases are distinct: a
module id, `null` for a kind whose ids are global and has no owner, and `undefined` for **an
id nobody declared**. Every caller writing `?? null` collapses the last two, then builds a
locale key under the wrong namespace — so a title or a line of prose comes back as its own
key, or as unauthored, with nothing raised. `grep -rn 'ownerOf(' src scripts` names them;
counting them here only produced a list that went stale.

`src/content/serialize.ts` is the one caller that does not: it asks
`sectionFor(kind)!.ids === 'global'` first and only then takes `null`. That it had to is the
evidence the distinction is load-bearing, and that no other caller does is what makes this a
line rather than a preference.

*Closes when:* an undeclared id cannot be read as a global-id kind — the caller either asks
the kind, as `serialize.ts` does, or `ownerOf` refuses a key it does not hold — and no site
has to remember which of the three it is looking at.

## `player.` and `setting.` take any word after the dot

`reference` (`src/content/refs.ts:60-69`) resolves a rooted reference's tail only when the
root declares a `kind`; `if (isEngineRoot(value.path)) return;` lets every other root past
unchecked. `player` and `setting` in `ENGINE_ROOTS` declare `stands`, not `kind`, so
`player.rase` and `setting.hadcore` load clean.

They then answer `undefined` at runtime (`src/runtime/conditions.ts:21-22`), and the two
readers of that answer both give it a plausible value: `Number(left ?? 0)` (`:84`) compares it
as **0**, and `String(value ?? '')` (`:70`) prints it as **empty**. So a misspelt condition
reads false for the life of the world and says nothing. The directive path already refuses the
same mistake — `session.ts:863` throws naming `SETTING_NAMES` — so the two entrances to one
question disagree about whether it has an answer.

The `?? ''` at `:70` is correct for a declared-but-unset flag, which is why it has survived;
what makes it dangerous is that the question reaching it can now be a bad one.

*Closes when:* a rooted reference's tail is checked for every root that has one, derived from
the root's own declaration rather than from a second list of which roots are checked, and a
`describe` in this folder's `open-tests.test.ts` pins the refusal an author sees.

## The modals have no API, so every agent that touches one invents a way in

Modals are drawn by `ModalSheet` and raised through `openModal`, and there is no stated
surface between them and the code that raises them. Each lane that has needed a modal has
reached for a new interface method rather than an existing one, which is how the same beat
comes to be spelled three ways.

The `welcome-back` screen is where this was noticed: it wants to say *do not typewrite this*,
and there is nowhere to say it.

*Closes when:* raising a modal, answering one, and saying how its body is revealed all go
through one declared surface, and a lane adding a modal has nothing to invent. The surface
states what a modal may say; it does not work out what a given modal wants from what that
modal is — a caller that has to be guessed at is the thing being replaced.

## The typewriter cannot be skipped and its speed is a constant

`reveal.ts` drives the typewriter and `Modal.tsx` reads it. Two things are wrong with it as
played. It is about three times slower than it should be, and its speed is written in the code
rather than declared, so it cannot be moved without a build. And there is no way past it: a
screen the player is reading rather than being told to — the away summary above all — types
itself out at them with no way to ask for the whole thing at once.

*Closes when:* the speed is a `# variable` the world declares and the settings page can move,
it defaults about three times faster than it reads today, and a modal may be raised saying its
body is not typewritten — which is the API line above.

## No setting the player changes survives a reload

`localStorage` is reached in exactly one place under `src/`: `browserStore.ts:18`, which keeps
save slots. Nothing else is persisted, so every setting the player changes — dev mode above
all — is back to its default the next time the page opens. Measured 2026-09-05 by sweeping
`src/` for every storage reach.

Dev mode is the one that bites, because it is the setting somebody working on the world
changes every single session.

*Closes when:* the settings a player changes are kept beside the save slots and read back on
open, and the sweep for storage reaches still finds one home rather than two.

## Something leaves a node process running after the tools exit

Reported 2026-09-05: a node process outlives whatever started it and holds system resources
indefinitely. Which tool starts it is not known, and it is not reproduced here — this line is
the report, not a diagnosis.

The candidates worth eliminating first are the ones that spawn: `npm run handoff` shells out
to `npx vitest run` per proof file, `npm run authorbot` runs an agent over a copy of the
corpus, `npm run mutate` runs suites in a loop, and the dev server is started through the
preview tooling rather than through the shell.

*Closes when:* the tool is named, reproduced, and the process it leaves either exits with its
parent or is documented as something the caller must reap.

## `churns` and `walked` are one question answered twice, so a route may still pin a balance

`ENGINE_ROOTS` in `src/grammar/condition.ts:32-46` carries a `churns` per root, and
`SAVE_FIELDS` in `src/runtime/save.ts:109-131` carries a `walked` per field. Both answer
whether a figure moves when the world's numbers are tuned — the one for what an `assert:` may
pin, the other for what an `expect:` sheet may. Where they overlap they agree today, and
nothing makes them: `time`, `xp`, `resource(s)` and `inventory` churn and are not walked;
`player` and `setting(s)` do neither. Root `count` already reads oddly against field `bundles`.

What the split costs is concrete. `pinned` exempts every comparison against zero, because
`xp.combat.attack > 0` asks whether a thing happened at all. But `inventory.coin = 0` after a
purchase is CLAUDE.md's own named counter-example — it pins the price against whatever purse
the save started with — and three routes were carrying one, unremarked, until they were found
by reading.

Tightening the exemption to `>`, `>=` and `!=` was tried on 2026-09-05 and backed out: it
then reports `xp.combat.health = 0` in
`# test combat.a-minute-at-the-post-trains-the-arm-and-not-the-hide`, which is that route's
own claim — the post trains the arm and not the hide — rather than a magnitude. The two read
identically. What separates them is whether the route's save started that figure at zero, and
answering that means mapping a condition root onto the save field it reads, which is the
correspondence above.

Do it in that direction: an `ENGINE_ROOTS` entry names the `SaveField` it reads, `walked` is
derived from `churns` wherever a root exists and declared where none does — `flags`, `visits`,
`location`, `packOrder`, `equipped`, `journey`, `modals`, `instances`, `populations`, `shops`,
`buffs`, `activeAction` and `rng` have no root. Layers only allow that direction: `grammar`
cannot read `runtime`.

*Closes when:* one declaration answers whether a figure churns, `pinned` can tell a claim about
zero from a balance that landed on zero, and `first-steps`'s mirror pair is either covered by it
or moved to the fixture.

## An action asks for named items, so what a thing *is* cannot be required

Ruled 2026-09-05: **an action should be able to require an arbitrary series of tags, satisfied
across whatever the player has.** One item tagged both `rod` and `bait` satisfies a `rod`+`bait`
requirement; so do two items carrying one each; so does a passive sitting on the character that
supplies bait forever.

`<condition>` today reads `has <item>`, `inventory.<item>`, a flag, a quest stage and the engine
roots. Every one of those names a *thing*, never a kind of thing. So an action that wants "any
rod" writes the rods out, and one that wants "any rod and any bait" writes the cross product:
`# action cast` carried all six pairings of three rods against two baits until 2026-09-05, and
three waters wrote the pairing again for their own bait.

That was closed by `extends:` — `# action rod-cast` holds the rod set and each bait is a child
adding `+requires:` — which groups correctly and is a real improvement, but it still enumerates
the rods, and a fourth rod is still an edit to a list. `tackle` is already a tag every rod and
net carries (`npm run oracle -- item` calls a tag *a word of your own, carried and never read*),
so the world already says what these things are; nothing can ask.

The same gap is what `docs/fishing-expansion/open-agent.md` records under the blowfish hole
drifting out of the rod set, and what makes `# station` unable to say an anvil needs a hammer —
see the line below.

Two things a lane should know before starting, from reading the ground on 2026-09-05. The
**shape is cheap**: `Condition` is a union whose every consumer switches on it with a
`const unreached: never`, so adding a kind makes the compiler name each site that must handle
it — `parsePrimary`/`printCondition` in `src/grammar/condition.ts`, `evaluateCondition` and
`itemMissingFor` in `src/runtime/conditions.ts`, and `condition` in `src/content/refs.ts`,
where a tag is the one reference kind that names no declared section and so must not `put`.

The **cost is where the care goes**, and it is ruled. `requires:` is re-read every cycle of a
continuous action and again for every action a screen offers. The carried half would be cheap —
`itemCopies(state)` already gives every template the player holds, wears or has grown. The
passive half would not: reaching what a passive supplies means walking each worn item's plane
through `allocatedPositions` and `passiveTagsOf` on every evaluation, which lands on the tick
`src/ui/frameCost.dom.test.tsx` gates.

Ruled 2026-09-05: **do not ask the inventory. Every worn item resolves onto the player once, and
every engine check reads the player.** That is the one-home answer and it is not only about
tags — `statSources` in `src/runtime/stats.ts:159` gathers the player's carriers afresh on
*every single stat read*, and `statFrom` folds them again each time, so the same ruling says a
resolved sheet is the home for a stat as much as for a tag. Build the sheet where the player
changes — worn, unworn, allocated, given, taken — and let `statValue`, the tag check and
anything else that wants to know about the player read it there.

Ruled further: **the update is pushed, not pulled. A piece of the player changes what it
contributes only when it is equipped, unequipped or crafted, and it owns that update itself.**

Reading the code against that: `modifierCarriers` (`src/runtime/stats.ts:91`) gathers eight
kinds of contributor — the entity's own sheet and modifiers, its passives, its skills, the
race, buffs, each worn item, the passives allocated on each worn item, and the action being
performed. Seven of those eight change only on an event that already has a name, so the push
holds for them.

**The eighth is the one to design around.** `counterLevels` (`:37`) exists because a modifier
may read `per` a resource, a stack count or a skill level — `foldStatBonuses` takes it as an
argument. A bonus that is *per resource* moves every tick as the pool drains; one *per stack*
moves whenever an item is spent. Those cannot be pushed on equip, because nothing equips.

So the sheet wants two halves: what a carrier contributes flatly, folded once when that carrier
changes and stored on the player; and what it contributes per counter, which stays live and is
small. The second half is what stops this from being a cache with an invalidation bug — the
things that genuinely move often are the things that keep being read, and everything else is
answered from the sheet.

**Run `src/ui/frameCost.dom.test.tsx` before and after**: a frame must read no DSL and cost what
it cost at the start of the session, and this change moves work off the tick rather than onto
it, which that file is the way to show.

*Closes when:* a condition can name a tag rather than an item, satisfied by any combination of
what the player carries and what their passives supply; `# action rod-cast` requires `rod` and
`bait-cast` requires `bait`; adding a rod is declaring one; and a frame still reads no DSL.

## A station cannot say what it is worked with, so 49 recipes each carry the tool

Ruled 2026-09-05: **a `# station` declares the tools it needs, as tags** — see the line above —
**and if that generalizes, an action inherits a recipe class and the required tools fall out of
it. Failing that, one shared tag checker.**

`npm run oracle -- station` prints, in full, *nothing but the heading, which is what declares the
name*. A station is a bare id, so every fact about working at one is filed on the recipes
instead. Seventeen anvil recipes write `1 hammer` in their `in:` and again in their `out:` — 34
lines saying the tool is kept, and an eighteenth that forgets the `out:` half silently eats the
player's hammer with nothing to catch it. Fifteen stove and oven recipes each write `burnt:`,
`accuracy: cooking.cooking` and `rate: core.cooking-rate` — 45 lines, no exceptions among them.

Both are one fact about the station, filed once per recipe that stands at it. The tool half wants
the tag condition above; the cooking half wants the station to carry defaults a recipe may
override.

*Closes when:* `# station` takes a body declaring the tags it is worked with and the defaults its
recipes inherit, the 34 hammer lines and the 45 cooking lines are gone, and a recipe that wants
tongs rather than a hammer says so.

## A condition compares against a number and nothing else, so a threshold is typed where it is asked

`<condition>`'s comparison form is `<engine state> <comparison> <float>`, and the right-hand
side is a literal. A stat may stand where an *amount* stands — `drain: them.npc-thieving-damage
core.health` is fine — but not on the right of a `>`. Measured 2026-09-05 rather than read off
the parser: a draft writing `if not resource.core.health > them.npc-thieving-damage:` through
`npm run oracle -- --at` comes back *"unrecognized action result"*.

What it costs, in the corpus's largest instance: the four obstacles of thieving's initiation run
(`content/thieving.dsl:1279-1333`) each write

    +on attempts exhausted:
      if not resource.core.health > N:
        roll: hauled-out
      if resource.core.health > N:
        drain: N core.health
        say: <its own line>

with N of 12, 20, 16 and 25 — the structure four times, and each obstacle's number three times
inside it. The number wants to be `npc-thieving-damage` on each entity's `stats:` line, which
`# action steal` already drains off; the *guard* — would this blow put me under, or should the
run haul me out — cannot be written once until a comparison can read a stat. Raise a pit's
drain and miss one of its two guards and a player just above the old threshold is drained past
zero instead of hauled out, and the `smirking-rogue` dialogue that only fires off `hauled-out`
stops being reachable at that band.

This is the same family as the tag line above: both are the grammar being able to name a thing
but not a property of one. `docs/thieving-expansion/open-agent.md` records the site; this
records the gap.

*Closes when:* a comparison's right-hand side may name a stat, the four obstacles declare
`npc-thieving-damage` and the guard is written once on `# action cross`.

## A choice id is a string the engine spells in three places and parses back by slicing

`src/runtime/session.ts` mints the ids the interface hands back — `fight:`, `talk:`, `shop:`,
`craft:`, `travel:` — as template strings at six sites (`:298`, `:313`, `:316`, `:375`, `:381`,
`:408`), reads them back in `choiceToDirective` (`:424-442`) with `.slice('talk:'.length)` and
friends, and mints them a third time in `choiceIdFor` (`:795-811`). The round trip is
load-bearing: `:880` builds an id, `beginAction` looks it up among what `computeChoices`
minted, and hands it to `choiceToDirective`. Three spellings must agree or a `begin:` silently
finds no choice.

The right shape is three files away and already half-used: `useChoiceId` / `parseUseChoiceId`
(`src/content/sections/test.ts:229-231`) is one print/parse pair, and `use` is the only one of
the six not duplicated here — precisely because it goes through that pair. The `# test`
directive grammar (`test.ts:114-131`) already declares `talk:`, `travel:`, `craft:`, `shop:`
and `use:` with printers and parsers built on one shared `PATH`.

A fourth copy rides along: `session.ts:429` hand-writes an id pattern as
`/^fight:([a-z0-9.-]+):([a-z0-9.-]+)$/`, where `REFERENCE` (`src/grammar/values.ts:95`) is the
one home for what an id looks like. The copy is looser — it accepts `9foo` and `..` — and is
greedy on both sides of a literal `:`.

*Closes when:* `sections/test.ts` exports a `choiceId` / `parseChoiceId` pair covering all five
kinds, `session.ts` calls it at every mint and both reads, and no module outside
`grammar/values.ts` spells what an id looks like.

## Three listed screens are consolidated and then unpacked into twenty-one aliases

`listedScreen()` (`src/runtime/listedScreen.ts:35`) already takes the five fields quest, stat
and skill differ in and returns one object with seven members. Each caller then re-exports
those seven under its own prefix — `questScreen.ts:18-23`, `statScreen.ts:23-28`,
`skillScreen.ts:15-21`, twenty-one lines carrying nothing but a name — and the aliases are
gathered again into three keyed tables: `modals.ts`'s `DEFINITIONS`, and `modalStack.ts`'s
`OPENERS` (`:25-27`) and `SAME` (`:37-39`).

A fourth listed screen is one `listedScreen()` call plus about ten hand-written lines across
three files. Two of the three tables are mapped types and so are exhaustive-checked, but only
after the frame name is added; the aliases and the `DEFINITIONS` body are transcription.

*Closes when:* each screen exports its `Listed` object whole, one list of them stands
somewhere, and the three tables are built from it rather than typed out.

## `App.tsx`'s pane falls through to the inventory, so a derived test proves nothing about a new page

`pane()` (`src/ui/App.tsx:233-280`) dispatches over subpage ids by if-chain and ends, on the
character layer, in an unconditional fallthrough to the inventory `Ledger` (`:279`). The home
layer returns `null` for an id it does not know; the character layer returns a screen.

`src/ui/render.test.tsx:89` and `:305` do the right thing — they derive their subjects from
`everyPage(dev)` in `nav.ts:94`. But because a subpage `pane()` has never heard of still draws
a perfectly good inventory, `everyPage` visits it, the assertions pass, and the derived proof
goes green on a page nobody wrote. The fallthrough turns a derived test into a vacuous one,
which is worse than a listed one.

The declaration is right there: `LAYERS` (`nav.ts:18-40`) states the subpages. A
`Record<SubpageId, …>` keyed off it makes TypeScript refuse a subpage with no renderer.

**The break that discriminates is an addition, which `npm run mutate` cannot express.** Add
`{ id: 'settings' }` to the character layer in `nav.ts` and run `render.test.tsx` and
`pages.test.ts`: both should be green today, and that is the finding. Do not test it by
deleting the `journal` branch — `render.test.tsx:305` reads page text and would catch that,
which proves nothing about the gap. Note `pages.test.ts:13` slices `App.tsx` by the literal
text `'const pane = ('` and `'const bodies = '`, so keep both markers.

*Closes when:* `pane()` is a record keyed by the subpage ids `nav.ts` declares, and adding a
subpage without a renderer does not compile.

## An item's colour is read off what the player can do with it today, not off what it is

`lookOf` (`src/ui/itemLook.ts:12-17`) decides whether a carried thing is a jewel, gear, a
wearable or stuff by looking at which verbs the screen currently offers. `equip` is offered
only when `wearable()` holds (`src/runtime/carriedScreen.ts:35`, `equipment.ts:21-25`), and
`wearable` evaluates the item's `requires:`. So a wearable whose requirement the player has not
met yet is drawn the same grey as a log, and turns green on level-up. Nothing about the item
changed.

The facts that say what the thing is — `item.slot`, `isBase(item)`, whether it sockets — do not
move with the player, and `PlayStatus['carried']` (`session.ts:509-514`) already publishes a
row the look could be computed onto.

Scope, re-measured 2026-09-05 after the first sweep got it wrong: `grow` is gated only on
`isBase`, which ignores `requires:`, so anything with an `item-level:` escapes. Sweeping
`content/` and the fixture for an item with a `slot:` and a `requires:` and **no**
`item-level:` gives **no shipped item at all** — the only section anywhere that hits it is the
fixture's `# item ledger` (`src/content/fixture/fixture-town.dsl:127-131`). The first sweep
named `eight-a-swing-hammer`, which carries no `requires:` and is `DEBUG`; it is neither.

So this is a design point with no live instance, and should be ranked as one. It is worth
closing because the next requirement-gated wearable without an item level will hit it silently,
not because a player is looking at a grey hammer today.

`src/ui/itemLook.test.ts:7` reads *"reads the look off what the screen offers to do with it"*,
which describes the mechanism rather than deciding the behaviour — nothing in that file
exercises `requires:` at all. Read it as unexamined rather than as a ruling. The break that
settles it: make `equipment.ts:24` ignore `requires:` and see whether `itemLook.test.ts` has
any opinion. It should not.

*Closes when:* the carried row publishes what the item is, `lookOf` reads it, and an item the
player cannot yet wear is the colour of the thing it is.

## `location` declares fields and overrides the printer anyway, so the contract's one rule has one exception

`CLAUDE.md` says a kind either declares `fields` and gets its parser, printer and merge from
them, or declares its own `parse` and `print` — and that this is the whole difference.
Measured 2026-09-05 by walking every `section()` call body: of the twenty-six kinds that
declare a schema, exactly one also overrides, and it overrides both.

`src/content/sections/location.ts:321-332` spreads `...SCHEMA` and then declares
`print: printLocation` and `merge: mergeLocations`. Nothing refuses this —
`define.ts:267` only refuses a kind with *neither* fields nor a `parse`, and `print`/`merge`
sit on `Common<V>`, reachable from both branches. So the rule reads as a rule and is not one.

Two facts are doing it. **The join:** `printLocation` (`:313-319`) calls `printSection` and
then folds `x:`, `y:` and `z:` onto one line — recovering which of its own rendered lines are
the coordinates with a regex, `COORDINATE = /^[xyz]: /` (`:311`), which is a structured fact
read back out of text the same function just produced. It also drops them entirely when the
location is `relative:`, since a relative location still carries solved coordinates.
**The merge:** `mergeLocations` (`:304-309`) folds `adjacent:` through `roadsAfter` so a road
written from both ends merges rather than replaces, which is the ruled ideal in `docs/map`.

Both are declarations waiting to happen: something like `together: [['x','y','z']]` on the
schema for the join, a per-field printed-when for the relative case, and a per-field merge for
`adjacent:`. None of the three asks the engine to guess anything — each is a fact the kind
already knows and currently expresses as code instead of as a declaration.

*Closes when:* the join, the relative case and the road merge are all declared on
`location`'s schema, `location.ts` declares no `print` and no `merge`, and `CLAUDE.md`'s
sentence is true again — with the corpus still round-tripping, which is what would catch a
coordinate line printed wrong.

## `continuous` is checked against the body as typed, so an action cannot inherit its own pace

`assembledActionProblem` (`src/grammar/action.ts:337`) refuses a continuous action with no
`time:` or `rate:`. It is called twice on the merged body — `load.ts:331` and `:501` — which is
right, and once more at parse time from `resolveKind` (`action.ts:373`), which is not: at that
point `extends:` has supplied nothing, because `extends:` is a `# action` section field
(`sections/action.ts:54`) and `actionBody.parseBlock` never sees it.

Measured 2026-09-05 with two drafts through `npm run oracle -- --at`:

    extends: core.melee-combat / attempts: 6                → taken into the world
    extends: core.melee-combat / continuous / attempts: 6   → refused,
      *action "swing-again": a continuous action needs a time: or rate: to set its pace*

The second is the same action saying out loud what the first inherits silently, and the parent
supplies `rate:` in both.

Shape 1 — a check re-deriving from the body as typed what the merged body already states. It
costs one real line today: `# action core.melee-combat` restates `rate: us.attack-rate` that
`melee-swing` could hold, because writing `continuous` without it is refused before the merge
happens.

The fix is not a one-liner and that is why it is a line rather than a commit. Either the parse
gets told the body extends something — a flag through `EntryBody.parseBlock`, crossing the
grammar/content boundary that keeps `extends:` out of the body parser today — or the assembled
check leaves parse time entirely and lives only at the two load sites, which moves where an
author sees the refusal and costs it its span. `src/content/parse.test.ts:571` and
`src/content/completion.test.ts:218` both pin the parse-time refusal, so whichever way it goes,
they say what the answer was.

*Closes when:* an action that extends a continuous parent may write `continuous` without
restating its pace, `melee-combat` holds no `rate:` that `melee-swing` could, and a body that
extends nothing is still refused with a span.

## Ten kinds hand-write a reference walk their own field declarations could derive

`nameKind` (`src/content/sections/define.ts:189-202`) works out which kind a field's hole names,
and `namedFields` turns that into the walk that validates and prunes references. It gives up the
moment a parser's form is anything but a lone hole, so `<count> <entity>`, `<stat> <amount>`,
`north of <location>`, `<position> <passive>` and `<damage-type> to <damage-type>` all fall out.

Measured 2026-09-05: 35 holes on schema fields carry a kind, and **32 are not walked by
`namedFields`**. Every one is instead walked by hand, in the `section()` call of `clusterJewel`,
`entity`, `item`, `ladder`, `location`, `passive`, `recipe`, `shop`, `skill` and `stat` — ten
kinds, four of them one line of the same sentence.

**Relaxing `nameKind` to accept multi-hole forms is the wrong fix and would be shape 1.**
Knowing that `<item>` in `<count> <item>` names an item does not say *which property of the
parsed value holds it*, and the mapping is genuinely not uniform: `populationValue`'s
`<entity>` lands on `.entity`, `edgeValue`'s `<location>` on `.target`, `relativeValue`'s on
`.of`. The parser has to **declare** it — a `lands` beside the existing `names` — which is a
fact its author knows and currently expresses by writing the walk out instead.

A live inconsistency this would settle: `recipe` declares a `visit` and no `prune`, so the
fallback drops the *whole recipe* when an item it names goes, while `shop` declares a `prune`
and drops only the stock line. Nobody chose that difference.

*Closes when:* a value parser declares where each of its holes lands, `namedFields` derives the
walk, and `shop`, `skill`, `passive`, `recipe`, `stat` and `clusterJewel` declare no `visit` or
`prune` of their own.

## A set of words with two half-parsers, and six more sets written out by hand

`MODAL_SCREENS` (`src/grammar/actionResult.ts:32-38`) is read twice in its own file: by
`modalScreen` (`:668-679`), which offers the words to the editing page and refuses nothing, and
by `parseOpenModal`/`isModalScreen`/`modalScreenRefusal`, which refuse and offer nothing. One
set, two halves, neither whole.

Six kinds then wrote the same shape again — `shapeNamed` (`clusterJewel.ts:64`), `triggerValue`
(`event.ts:40`), `standingValue` (`group.ts:24`), `displayValue` (`resource.ts:19`),
`acceptsValue` (`shop.ts:28`) and `side` (`values.ts:135`) — and they have drifted the way six
copies do. The complaints read *must be one of*, *is one of*, *a shop accepts one of* and
*expected us or them*; the token is a bare word regex in three, `id.parse` in two, and
prefix-tolerant in the sixth.

**Note what is *not* the fix**, since the obvious one deletes six refusals: `oneOf`'s `parse`
is `id.parse`, so it refuses nothing at all. It is a grammar shim that gives the page a hole
with alternatives. Folding the six into it as it stands would lose every one of their refusals.

*Closes when:* one `oneOf(called, words, {complaint, token})` in `grammar/values.ts` both offers
the words and refuses anything else, `MODAL_SCREENS` has one reader, and the six kinds each
declare one line — with `event.ts`'s optional prefix passed as a token rather than kept as an
exception.

## Which section failed is recovered by regex over the prose of its own error

`validateBuiltRegistry` (`src/content/load.ts:627-751`) runs fourteen cross-registry checks and
attributes each failure to a kind and an id. Most read the id from the value. Three do not:
`refuseStackedLocations` and `recursivelyResolveRelativeCoordinates` throw a `DslError` whose
**message** is then re-parsed by `locationIdFromMessage` (`:294`) to recover which location to
blame, and `validateItemSlots` does the same for an item at `:727`.

Shape 4 — a fact filed under the words one author chose and read back by another. Reword either
message and the blame silently becomes unattributed: no test reddens, the author just stops
being told which module to look in.

Three of the fourteen checks also sit in `load.ts` rather than in their kind's file, unlike the
rest: `startingLocationFailure` (`:619`) is a location fact, `dropTableCycle` (`:406`) a
droptable one, `performedProblem` (`:422`) an action one.

*Closes when:* `DslError` carries an optional `at: { kind, id }` the throwers set, the three
regexes are gone, and the three homeless checks live in the files of the kinds they are about.

## The round-trip proof's root set skips action bodies, so four parsers are unproved

`dsl.test.ts:741-747` derives its subjects, correctly, from `schema.fields` — but an action
body's fields are `ACTION_FIELDS` in `grammar/action.ts`, reached through `schema.entries.body`,
which the root set does not walk. Measured against `exportedCodecs` (`grammar/codec.ts:24`),
exactly four parsers are outside it: `action#perMinute`, `actionResult#resultList`,
`segment#fragment` and `tagClause#bonusAmount`. `hookResultList` is checked; its twin
`resultList` is not, because it is only ever an action-body field.

All four are clean today, so this is coverage rather than a bug. `exportedCodecs` is exported
and called from nowhere — grep across `src/` and `scripts/` — so it is either the fix's raw
material or dead.

**The break that discriminates** — do not break `resultList.print`, which the fixture round-trip
catches; that would prove nothing. Add a form to `perMinute.forms` in `grammar/action.ts` with
no matching example. `shapeFailures` is the only thing asserting forms against examples,
`perMinute` is outside its roots, and the per-kind walk at `dsl.test.ts:718` drops a form with
no example silently. If nothing reddens, the gap is real.

*Closes when:* an entry body can offer its parsers to the root set, the four are covered, and
`exportedCodecs` is used or deleted.

## `modportal` rewrites an entity's stat keys itself, because the kind's walk reads the wrong shape

`src/content/modportal.ts:98-108` carries `renamedStats` and a branch keyed on the entity kind —
a per-kind special case outside the kind's file, which is the thing `sections/index.ts` exists
to prevent.

It is there for a reason: `entity.visit` walks `stats` with `listMembers`, which returns nothing
for a plain object (`grammar/section.ts:107-110`). So it walks the *authored* shape, a list of
stat-and-range pairs, and not the *built* shape, a record keyed by stat. `modportal` works on
built contributions, so nothing is walked for it and it rewrites the keys by hand — handling
both shapes, because it cannot tell which it has.

The derived answer is the same one the `nameKind` line above wants: declare `entity.stats` as a
keyed reference field and let `define.ts` route it through `keyedBy` (`refs.ts:63`), which does
exactly this job and has one caller today. Making `entity.visit` handle both shapes instead
would be shape 6 — a guess made more accurate.

*Closes when:* `renamedStats` and the entity branch beside it are gone and the kind's own
declaration carries it.

## The symbolic-command map is written four times, and it duplicates a fact rather than a proof

`{ '<N>': '1', '<enter>': '', '<directive>': … }` — what to type where a command spec's name is
a symbol — stands at `scripts/drift.test.ts:39`, `scripts/printedWords.test.ts:144`,
`scripts/play-cli.test.ts:1398` (as `SHAPED_IN_DEV`) and `src/runtime/command.test.ts:1942`.
The first two are byte-identical; the other two differ only in the directive line, which is
per-world and genuinely theirs.

The key set is derivable — exactly the `COMMANDS` entries whose `name` is bracketed. The two
world-independent substitutions are not: they are facts about the spec, and belong on it as a
declared `typedAs`.

**`npm run mutate` will not discriminate these**, and that is the point: they duplicate a fact,
not a proof. Rename a symbolic spec and all four maps go stale at once, each test then types
the literal `<blank>` and quietly stops exercising the command rather than going red. Do not
delete any of the four tests.

*Closes when:* a `CommandSpec` declares what a player types for it, and each driver test
supplies only its own directive line.

## Five routes are written twice from the gate to the middle

Long stretches of `# test` routes are typed out again rather than composed, though `run: <test>`
is in the grammar and `content/first-steps.dsl:200` already uses it:

- `content/the-swampy-menace.dsl:169` and `:239` share 46 of about 52 lines — the whole approach
  through the castle gate, the strike, and the six-line hand-in. They differ only in the order
  the three herbs come out, which the module's own droptable is symmetric in.
- `content/ball-of-a-boy.dsl:138`, `:168`, `:196`, `:223` — the twelve-line sewer descent, four
  times.
- `content/first-steps.dsl:195` and `:249` — a twelve-line tail.
- `content/combat-lessons.dsl:164` and `:188` — a thirteen-line head.
- `content/kill-it-with-fire.dsl:161` and `:210` — a nine-line head.

Shape 3, in the corpus's own vocabulary. Move a room or rename a place and each of these has to
be found by hand.

**It is a judgement rather than a defect**, which is why it is a line and not a commit: a route
read end to end is a route a human can check, and `run:` trades that for one edit site. The
swampy pair is the one where the trade clearly pays, since the second route exists only to say
the herb order does not matter.

*Closes when:* the swampy pair shares its approach and its hand-in, and a decision is recorded
about whether the other four are meant to read whole.

## An action result's facts live in three files

Each kind of `<result>` is declared in `src/grammar/actionResult.ts:347-447` (`LEAVES` — its
opener, forms, examples and parse), printed in the same file by a second switch
(`printResultLine`, `:555-628`), and has its reference sites listed a third time in
`src/content/refs.ts:147-230`. Adding a result kind next month means remembering three places.

Both switches carry a `const unreached: never`, so a *missing case* is a compile error. What is
unguarded is a case that forgets a **field** — a new result naming a `# droptable` whose entry
in `refs.ts` omits its `put(...)` line. That reference then goes unvalidated and unpruned, in
silence.

The shape is the one `sections/<kind>.ts` already solves one level up: give `Leaf` optional
`print` and `visit` members and move each case body onto its leaf, leaving the two switches as
loops. It is the largest item in this file — roughly 250 lines relocated — and it crosses a
layer boundary, since `refs.ts` is content and `actionResult.ts` is grammar, so the visit half
may have to move down rather than across.

*Closes when:* a result kind is declared in one place, and `printResultLine` and `refs.results`
are loops over `LEAVES`.

## Small constants still spelled twice

- `HEADING_KIND` (`src/content/sectionSource.ts:24`) names the kind that heads a module, and
  `src/content/universe.ts:39,53` — the module that actually enforces one-`# info`-per-module —
  compares against the bare string instead. The constant's home by CLAUDE.md's own rule is
  `sections/info.ts`, the kind's own file; moving it there avoids the import cycle that pointing
  `universe.ts` at `sectionSource.ts` would close.
- `COMPASS` (`src/runtime/map.ts:222`) restates the eight bearing names that `HEADINGS` (`:29-37`)
  already derives. The membership is duplicated; the 3x3 screen ordering beside it is a genuinely
  separate fact, so only half of this is worth taking.

*Closes when:* both read the declaration beside them.
