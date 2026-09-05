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

## Four growth directives still refuse a rolled base by name

`equip:` resolves a written template to the first unworn copy since 14f72baf. `swap:`,
`slot:`, `allocate:` and `apply:` take the same `<carried>` token through `growItem` and do
not, so `floors/thieving-floor.dsl` still writes `allocate: 3` where it now writes
`equip: core.unassuming-cap` two lines above.

**This is a question rather than an oversight, and it was tried.** A `copyToGrow` preferring
the worn copy made the whole floor writable by name and reddened an authored claim in
`src/runtime/itemInstance.test.ts` — *refuses a base named by its template, because the points
belong to a copy and not to the item*. That claim is right about the distinction: you equip a
copy and any will do, while you allocate onto one particular plane, and a player holding three
swords with three planes has three answers. Naming a template there has to pick, and the pick
would be silent.

The other half of the same fix, also unbuilt: `carriedSubmit` in
`src/runtime/carriedScreen.ts` finds no entry for an unknown item id and returns null with no
refusal at all, and `carriedScreen` discards `equip`'s return besides. That is where the
silence an authoring run once met actually lives, and it is the GUI rather than the loop.

*Moves when: he says whether a growth directive may name a template — and if it may, what it
picks when several copies stand, since that is the thing the claim says cannot be silent.*

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
