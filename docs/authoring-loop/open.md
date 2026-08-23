# What is still wrong

The queue. Everything here is open; nothing here is done. **A line is deleted the
day it closes** — not struck through, not annotated, deleted — and if what it
settled is something a later agent could get wrong, one sentence about it goes in
`settled.md` instead. Git holds the reasoning, and the commit that closes a line is
where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

---

## Refactor quest journal
Refactor the quest journal. It should be written from the player's perspective. No hints or handholding. Just thoughts of what `I` should do next. If a player wants information, they should talk to people in the world which should update the notes. The journal is useful for remembering what happened and general information. It should not guide the player to the next step exactly.

Part of the fun is figuring out what is the next thing that you need to do. This game will not have a dotted yellow line for players to mindlessly follow. We need to be vigilant that agent's being confused by quests being misinterpreted that the quest needs more handholding. We should just tell them that the quests may not be trivial. 

## Proper shop with modal
Create a proper shop modal instead of listing specific buy actions at specific entities. The modal has a list of items it sells. And a bool of whether they accept any item or just items they stock (Default true). The modal shows all items the store currently has in stock. Allows selling any tradable item in the inventory, and buying any item currently in stock. Can buy/sell multiples (buy 23), but can't go below the shops stock. Shops don't have a maximum stock. 

Shops keep a running tally of how much stock they currently have, and regenerate stock with a rate. 1 item per minute is the default. The replenish brings the item total toward what the shop stocks, so an unstocked item moves to 0 and gets deleted. 

Shops have an efficiency value for selling and buying. Each one is a multiplier on how much coin a player gets or needs compared to the default value of an item. Buying and selling always uses integer coin values. 
Defaults: buying=1.2, selling=0.8

Shops only interact with items that define a value in coins. Otherwise, the item is untradable. 

It goes without saying, but coins don't have a value and can't be bought or sold. This doesn't need a rule, just don't give coins a value and it won't create an infinite loop. 

## A station has no declaration of its own

`stations: oven` on an entity is the only thing in the language that creates the
name `oven`, and `validateRecipeReferences` (`src/content/references.ts:67`)
refuses any recipe naming a station no *loaded* entity opens. So a recipe is
pinned to the module holding the thing it is cooked on, not because a recipe is
local knowledge but because the oven entity is the oven's only declaration. That
is a name minted by a side effect, which is the failure mode CLAUDE.md's mission
paragraph names.

*Closes when:* `# station <id>` is a kind of its own — core names it, the entity
that opens it lists it, the recipe that needs it resolves it through the
namespace like every other id, and the refusal becomes *names an undeclared
station*. `bread` and `cooked-herring` follow their recipes into core when it
lands; they are the two sections the tulsa/core split could not move. Five sites
load `core` alone and are the proof it worked: `src/runtime/localized.test.ts`
(three), `scripts/probe.test.ts` (two).

## A quest cannot hold all of its own state

Ruled by the owner: **everything related to a quest belongs inside the quest
file.** Nothing today lets it. `tulsa.mirror` sets `mirror-done` and
`tulsa.giant-rat` sets `rats-killed`; both are read only by `tutorial-quests`,
and neither can move there, because `tulsa` does not depend on `tutorial-quests`
and the engine refuses the upward reference:

    town [town] resolve: # entity town.mirror action "look in" set: names
    errand.mirror-done, but errand is not this module or one of its dependencies

A `# quest` hands **dialogue** to an upstream entity and cannot hand it an
**action**, so moving the flag by moving what sets it does not work either. The
corpus has zero `+` field edits and this is not an argument for inventing one.

*Closes when:* a quest module can own a whole interaction on an entity declared
upstream of it — at which point the mirror's `look in:` and the rat's `on death:`
go to the quest that is the only reader of what they set. Until then the two
flags stay where they are. Entity-private flags (`tulsa.mirror.done`, the way
`tulsa.front-door` owns `unlocked`) would work today and were rejected: they
re-home the flag without re-homing the quest, which is the requirement.

**`sewer-toll-paid` is read and never set.** `castle-yard`'s road to
`sewer-entrance` is gated on it (`content/tulsa.dsl`) and nothing in the corpus
sets it, so that road is unreachable. It is Larry's toll and belongs to a quest
that is not written; it closes the same way.

## For the human review pass

The long pole, and it is Yonatan's. `npm run review` is the sheet and
`content/reviewed.tsv` makes it resumable. Nothing is in front of it.

The agent pre-pass that was queued here is done: every room that named a thing and
offered no way to touch it now either does something or has stopped promising it
would, and `npm run notes` reports **no rough lines** where it reported five. What
is below is what a reading still has to settle.

- **The orbs read as healing items.** Two independent runs concluded Orb of Renewal
  and Orb of Vitality must restore health. They are item modifiers. Their `examine:`
  lines were improved; whether that is enough is a reading question and was left
  for this pass deliberately.
- **The mirror cannot offer a rename, and the writing now says so.** Two runs read
  re-entering character creation as save corruption; the glass now says it does not
  ask a second time, which matches what the engine does. But *renaming is allowed*
  turns out not to be true through any content path: `character-creation`
  (`src/runtime/modals.ts`) asks name **and** race together and writes both, so
  re-opening it would re-pick race too. Offering a rename needs a name-only modal
  screen. Whether the game should have one is the owner's call.

The eight marks the corpus holds are `tulsa` entities waiting on quests that are
not written — the anvil on A Grand Blade, Oolga's counter on Kill it with Fire, the
hive mouth on Birds and the Bees. Those are notes, not rough writing, and they
close when the quest modules arrive rather than in this pass. Each of them now has
a mechanic behind it that works today; the mark records only what the quest will
add.

## The AFK model

An action that runs to a terminator is the shape a player and an agent both spend
most of their time in, and it is half-built. Rulings are the owner's, made
2026-08-22; everything below is unbuilt unless it says otherwise.

**A summary after an AFK session is required**, and AFK derives itself from the
terminator rather than being declared: an explicit `use:` reports turn by turn, a
`use ... until <condition>` or a `wait:` summarizes. No new flag, no author
decision. The summary's content is undecided; the obvious body is what changed over
the span and what stopped it.

**Nothing stops early by default, and what does is a hook the player sets.** Two
events are missing: **inventory-full** and **level-up**, both the shape `on empty`
already has. *Closes when:* an action can name arbitrary events that end it, with
none named by default.

**A target selector over a set.** *"Fight anything aggressive until X"* needs a
predicate over what stands here. Fighting one *type* already works
(`fight:core.melee-combat:tulsa.feral-rat`) and `until <condition>` already works;
the selector does not exist.

**The level-up event is also why a `@@@` is stuck in the corpus.** Miki wants to ask
for *"reach level 2 in any skill"* and settles for a fish, because two things are
absent at once — no `# event` fires on a skill levelling, and the condition grammar
has no xp-threshold predicate. It is one cause filed twice, in two vocabularies.
*Closes when:* that mark can be written as a condition. It is the only mark left in
`tutorial-quests`.

## Left by the core/tulsa split

**The shipped world is hand-listed in ten test files.** `src/runtime/session.test.ts`,
`integration.test.ts`, `translationSurvival.test.ts`, `equipment.test.ts`,
`localized.test.ts`, `src/content/locale.test.ts`, `scripts/play-cli.test.ts`,
`playbot.test.ts` and `printedWords.test.ts` each name `content/core.dsl` and now
`content/tulsa.dsl` beside it to get a world with somewhere to stand; four more
derive the same set with their own `readdirSync('content')`. Splitting a module
again edits all ten. *Closes when:* one thing at or below the content layer says
what the shipped corpus is, and the ten read it.

**`combat-expansion` and `tutorial-quests` now depend on `tulsa`.** Each names one
thing that moved — a road to the beach, and Miki — so a module about archetypes and
a module about a quest both load the whole town. It is what the engine requires;
whether the beach is the right anchor for a proving ground is map churn for the
hardening pass.

## Ours, and small

**The oracle advertises a `choose:` form the engine refuses.** It prints
`choose: <what the choice reads>`, but `answerModal` matches only
`option.values[].value`, which for a dialogue modal is `String(index)`
(`src/runtime/modals.ts`), so text never matches and only `choose: 0` works. This
is the same fact as the line below, found from the other end: the oracle is
already promising the fix. Whichever lands, both close together.

**`choose: N` is an index into a list ordered by the words the player reads**, so a
`# test` that picks one specific thread is pinned to one language. Found when Tulsa
entered `translationSurvival` and `sunny-has-three-things-to-say` could not survive
it; that test was rewritten to be order-free, and the `choose:` lines in
`tutorial-quests` routes were not. A `# test` written this week had to fall back to
`choose: 0` for the same reason. *Closes when:* a test can name the thread it takes
rather than its position.

**A stage's `log:` has no conditional form**, so a stage that spans two beats reads
as one constant where `hint when <condition>:` would read as two. A second
unconditional `log:` is now refused rather than silently winning, so the shape is
at least honest. Still no evidence that an author has wanted the conditional form.

**`rats-fall-to-repeated-use` discriminates on a 3.3× margin.** Its claim is now
one rat down, which survives a rebalance of base attack or a better weapon — but a
one-shot rebalance would make even that stop telling advance from restart.

## Facts an author must know that nothing yet tells them

Each line is **verified against the code, then given a home, then deleted from
here**. Three homes, in order of preference: the engine refuses it, so `oracle --at`
names it at the point of writing; the oracle says it, derived from the kind's own
declaration; or the outline template says it, for a convention no engine rule could
enforce. A line that verification shows is stale is deleted with no home.

Nothing is to be added to this section. When it is empty, delete the heading.

Nine of the eleven are gone: three were already said by the engine or the oracle,
two were wrong about the code, two the owner ruled not worth the archaeology, and
two are now oracle notes derived from each kind's own declaration.

- [ ] a quest lives in its own module, and the world still loads without it
- [ ] progress signals get lightweight UI acknowledgement

**Both want the same home, and it does not exist.** The only candidate is the
outline template, and there is no template — `.planning/starting-town-outline.md`
is a specimen of one town and says so in its own first line. *Closes when:* there
is a template, or these two find another home.

## Open questions, not yet work

**A range is equality written twice.** `xp.thieving >= 100 and xp.thieving <= 200`
says it, which is a bound stated twice rather than a bound. Whether that wants its
own form is a question for whoever first writes a hundred of them.

**A repeat-N form.** `until <condition>` finishes one action; nothing says *do this
a hundred times*. Worth revisiting once `until` has been used in anger.

**Should a foe ever have identity?** Ruled: no, a count is enough, and
`EncounterFoe.remaining` is it. Reopen only if wanting to name one individual of a
kind ever actually comes up in play.
