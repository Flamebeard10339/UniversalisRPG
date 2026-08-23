# What is still wrong

The queue. Everything here is open; nothing here is done. **A line is deleted the
day it closes** — not struck through, not annotated, deleted — and if what it
settled is something a later agent could get wrong, one sentence about it goes in
`settled.md` instead. Git holds the reasoning, and the commit that closes a line is
where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

---

## For the human review pass

Not bugs. Writing that promises a mechanic is a promise, and a playtester files it
as a bug — three runs did, repeatedly and unprompted. This is the long pole and it
is Yonatan's; `npm run review` is the sheet.

- The **sewer grate** is named in Market Square's own description and cannot be
  touched. Two runs filed it four times; Mouse's dialogue hangs a plot hook on it.
- *"a rack of axes nobody is watching closely enough"* offers no way to take one.
- Oolga's *"something glints in her eye"* opens no counter.
- The **anvil** is described as standing unused in the middle of the forge floor
  and has no action.
- **Painted Signs** point at MARKET, CASTLE and GATE and cannot be read.
- **General Store, Fishing Supplies and Woodcutter's Stall** stand in Market Row as
  named entities with nothing to do to them.
- The **castle's upper windows** are named from Market Rooftops with no way to look.
- The **hive mouth** says the comb was chewed through by *"something that was not a
  bee"* and offers no way to look into it.
- **Kelsa invites a reply that does not exist** — her line asks about the bees "as
  if expecting a specific response", and no dialogue option answers it. Filed three
  times in one run.
- **Miki promises a mechanic the view does not offer.**
  `content/tutorial-quests.dsl:70` says *"Here, gear changes your stats the moment
  you equip it"*, and equipping is only reachable through `/inv <item>` or the
  carried-items screen. **Ruled: the inventory screen owns equipping**, so the line
  is what is wrong, not the mechanic. One run filed this about twenty times.
- **The orbs read as healing items.** Two independent runs concluded Orb of Renewal
  and Orb of Vitality must restore health. They are item modifiers. Their `examine:`
  lines were improved; whether that is enough is a reading question.
- **The mirror reads as save corruption.** Two runs reported re-entering character
  creation as a bug. It is permanent by design and renaming is allowed — so nothing
  tells a player that, and something should.
- *this island* is still said where Miki is not joking about it.
- **Five lines are placeholders, and `npm run notes` names them**: `core.fish` and
  `core.fishing-net` examine as *"A fish."* and *"A fishing net."*, and the window
  in Miki's house examines as *"A window."* and says *"You climb out."* and *"You
  catch a fish."* They are the whole of the thieving route's scenery.

The other nine marks the corpus holds are `tulsa` entities waiting on quests that
are not written — the anvil on A Grand Blade, Oolga's counter on Kill it with Fire,
the hive mouth on Birds and the Bees. Those are notes, not rough writing, and they
close when the quest modules arrive rather than in this pass.

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

**`remaining` does not reach the GUI.** `livePools()`
(`src/runtime/command.ts:1129`) projects title, current and max, so the count that
stops three rats reading as one that healed is shown in the terminal and the
playbot and not in the game. Two files, and the second is `src/ui/LiveSheet.tsx`.

**`choose: N` is an index into a list ordered by the words the player reads**, so a
`# test` that picks one specific thread is pinned to one language. Found when Tulsa
entered `translationSurvival` and `sunny-has-three-things-to-say` could not survive
it; that test was rewritten to be order-free, and the `choose:` lines in
`tutorial-quests` routes were not. *Closes when:* a test can name the thread it
takes rather than its position.

**`# test` cannot read a journal.** No directive exposes a hint, so a content claim
about what the journal says can only pin the state the hint is gated on; the words
are pinned in `journal.test.ts` on its own fixture. *Closes when:* a `journal:`
directive exists — it belongs in `src/content/sections/test.ts`.

**A stage's `log:` has the two-beat problem `hint:` just lost.** `hint when
<condition>:` landed; `log:` has no conditional form, so a stage that spans two
beats still reads as one constant. No evidence yet that an author has wanted it.

**Two unconditional `hint:` lines in one stage are not refused**, and the second
silently wins. It did before the conditional form too.

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
