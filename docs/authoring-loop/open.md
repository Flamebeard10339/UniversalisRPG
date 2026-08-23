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

**Inventory-full has nowhere to fire from.** The rest of that ruling is built —
an action names the events that end it (`stops on: <event>, …`, none by default)
and `level-up` fires — but there is no carrying capacity anywhere in the engine:
`stockItem` clamps only at zero, and no item, entity or stat declares a limit.
*Closes when:* carrying capacity exists. The ruling to make first is whether it is
a `# resource` with a `max:`, because if it is, `on full` already fires on it and a
second trigger name would be the same fact twice.

**A target selector over a set.** *"Fight anything aggressive until X"* needs a
predicate over what stands here. Fighting one *type* already works
(`fight:core.melee-combat:tulsa.feral-rat`) and `until <condition>` already works;
the selector does not exist.

**The `@@@` in `tutorial-quests` is writable now and not yet written.** Miki's
*"reach level 2 in any skill"* has its condition: `level.<skill> <comparison>
<number>`, beside `xp`, which the mark's own words wrongly reported missing as
well. What is left is a content edit and a balance call — level 2 in fishing is
1000 experience, which is a longer errand than one fish, so the line the quest ends
up asking for is the author's. *Closes when:* the `apologised` stage's second Miki
node names a level instead of the fish, and the mark comes off the line above it.
`npm run oracle -- --at` takes that edit clean today. It is the only mark left in
`tutorial-quests`.

## Left by the core/tulsa split

**`combat-expansion` and `tutorial-quests` now depend on `tulsa`.** Each names one
thing that moved — a road to the beach, and Miki — so a module about archetypes and
a module about a quest both load the whole town. It is what the engine requires;
whether the beach is the right anchor for a proving ground is map churn for the
hardening pass.

## Ours, and small

**`tutorial-quests` still counts to its choices.** `choose:` now takes a name —
the words a menu line is written with, or the node a thread opens — and `tulsa`'s
two routes were converted with it. The seven `choose: N` lines in
`content/tutorial-quests.dsl` were left alone because that module was being
written in another lane at the time. *Closes when:* those seven name what they
take, and `translationSurvival`'s "names the choice it takes rather than counting
to it" covers them because `tutorial-quests` has joined the world it loads.

**A stage's `log:` has no conditional form**, so a stage that spans two beats reads
as one constant where `hint when <condition>:` would read as two. A second
unconditional `log:` is now refused rather than silently winning, so the shape is
at least honest. Still no evidence that an author has wanted the conditional form.

**`rats-fall-to-repeated-use` discriminates on a 3.3× margin.** Its claim is now
one rat down, which survives a rebalance of base attack or a better weapon — but a
one-shot rebalance would make even that stop telling advance from restart.

## Open questions, not yet work

**A range is equality written twice.** `xp.thieving >= 100 and xp.thieving <= 200`
says it, which is a bound stated twice rather than a bound. Whether that wants its
own form is a question for whoever first writes a hundred of them.

**A repeat-N form.** `until <condition>` finishes one action; nothing says *do this
a hundred times*. Worth revisiting once `until` has been used in anger.

**Should a foe ever have identity?** Ruled: no, a count is enough, and
`EncounterFoe.remaining` is it. Reopen only if wanting to name one individual of a
kind ever actually comes up in play.
