# What is already decided

For an agent starting cold. Every line here is **true now** and was expensive to
learn — most of them were learned by getting the opposite wrong first. None of it
is history: git holds why, and the commit that settled a line is where the
reasoning lives. If a line here is wrong, the code changed and the line should be
deleted, not annotated.

Nothing open lives here. That is `open-agent.md` and `open-human.md`.

## The language

**Adjacency is symmetric by construction.** Write a road once; the engine derives
the return edge with the same condition unless the far end writes its own, which
always wins. `Location.adjacent` stays exactly what the author wrote, and the
effective relation lives in `Registry.roads` behind one accessor. Every road in the
corpus runs both ways — there is deliberately **no `one-way` keyword** until
something needs one.

**`DEBUG` on a line of its own under any heading marks a section as written to
prove something about the engine, and it ships to nobody.** It says nothing in any
language, so `npm run review`, `npm run notes`, the translation sweep and the game
itself all lose it at once; and anything a player can reach is **refused at load**
for naming it, so the only way to a `DEBUG` thing is another `DEBUG` thing. Mark
one section of a cluster and every section that names it has to be marked too —
which is the point, and is why `content/tutorial-quests.dsl` marks six: two
hammers, the two saves that arm them, the two tests that swing them. A `DEBUG`
`# test` still runs; that is what it is for.

**Nothing declares `DEBUG` and no kind's grammar holds it.** `section()` in
`sections/define.ts` is the one home: it strips the line before the kind's parser
sees it, writes it back beneath the heading when printing, and makes it **sticky
through a merge**, so no later module can unmark a section and put it in a player's
hands. It is exported as `EVERY_SECTION`, which the oracle's tree and the editing
page both read — so a page that offers the line also shows it, with no second copy
of its words.

**It is a body line and not part of the heading.** A heading is rebuilt from its
parts wherever a section is moved, renamed or edited on the GUI's authoring
surface, and a mark written into one is dropped by every such rebuild; a body line
rides along whole. It is upper case because nothing else in the language is, so it
can never be read as an id, a keyword or one of a kind's own values — `# item`
would otherwise have taken it for a tag.

**A section that is only `DEBUG` is not a valid one of any kind**, which is why the
line is in nobody's grammar: `dsl.test.ts` holds every grammar line to standing
alone under its heading, and `# droptable`, `# save` and `# remove` each refuse a
body with nothing in it. `# remove` cannot be marked at all, and needs no mark — it
declares nothing for anyone to reach.

**`sticky` replays a node whole; `again:` is what a non-sticky node says on a later
visit.** The engine refuses both on one node, since `again:` is unreachable on a
`sticky` one. Without either, a node is said once and then falls silent — and a
conversation whose every node has fallen silent is no longer offered at all, so
`reachedNow` returns nothing rather than a node that would say nothing.

**Talking to someone offers every thread they hold open, quest lines first, and the
player picks.** A thread is a node that says which moment is its turn (`when:`) or
what it is called (`ask:`); a node offering only `always` is what they say when no
thread is open — **except under a `# quest`, where a line is never the fallback**.
`Dialogue.fromQuest` is minted in `saidAt`, the one place a quest dialogue is made,
`givenByQuest` reads it, and `openersNow` ranks quest → thread → otherwise. That
ranking does not depend on how many stages a quest happens to have, and it moves no
node into or out of the offered set: every quest node already carried a `when:` the
engine wrote. **`isThread` must not be made to read that compiled `when:`** — it was
tried, measured, and it strands the whole `apologised` route, because `snubbed.miki.0`
becomes an `otherwise` node and `adrift.miki.0` is sticky on a flag that never goes
false. One thread open is entered outright, so nothing gains a click. Within one
standing, threads are ordered by the words the player reads, never by declaration
order — no module takes a place by loading earlier. Before that, the winner was
whichever module parsed last, which silently made an earlier quest's opening
unreachable for fifteen turns of a run.

**Naming a line says what to call it, not which moment is its turn.** `otherwise()` in
`quest.ts` no longer treats `ask:` as an exemption, so a stage's fallback line can be
named without coming open beside the line meant to replace it.

**A beat that says its piece and asks nothing stands at Continue, and is not a modal
left open.** `standingAfter` is the one place either way of stepping a conversation
turns into what it leaves in front of the player, and `AT_WHAT_WAS_SAID` is an
ordinary cursor like the thread list — so the frame, the staleness check, the stack's
sameness test and all three drivers needed no edit. A screen declares `asksNothing` in
`DEFINITIONS` rather than having it inferred from its options, because a list of one is
still a decision; `runTest` asks the screen rather than treating any open modal as a
failure. A visit that genuinely said nothing leaves nothing standing, so no screen
appears to be dismissed over nothing.

**`choose:` names what it takes, and only falls back to counting.** A line in one
node's menu is named by the words the `.dsl` writes it with; a thread is named by
the node it opens, under the same name `visits` counts it by and answerable by any
tail of that name. A position still works and is safe under one node, whose
choices stand in the order they are written — it is a list of *threads* that
reorders itself in another language. What may be written lives with the list that
publishes it (`menuChoices` in `src/runtime/dialogue-runtime.ts`), and an answer
that names nothing comes back with every entry the list held; the modal gate
defers to it rather than keeping its own copy of the names.

**A journal is read out of `log:` lines alone.** `hint:` is gone — the field, its
conditional form and the fourteen corpus lines with it. What a quest is standing on
is `standingLine(entry)`, the one line not yet struck through, **derived from
`lines` rather than held beside them**, so the journal and whatever asks a quest
where it stands read the same words. The `journal:` test directive reads it. A
stage's `log:` has no conditional form.

**A line the game says may carry `@@@` and still be played, and may not be
silence.** `@@@ <words>` means *unreviewed, or here is what I wanted and could not
get*; the engine drops the note and says the rest. Because the note is dropped, a
line that is *only* a mark is silence, and the engine refuses it at load naming the
line — so the mark goes beside the words, never in place of them. The sweep reads
`everySaid`, the same table `npm run notes` and `npm run review` read, so a kind or
a field added next month is covered with no edit.

**An `examine:` on an entity is an action, minted at registry-build time.**
`mintedActions` in `src/content/sections/entity.ts` compiles it where an entity's
actions are already assembled from its blocks and its `uses:`, so it is an ordinary
action before any renderer sees it and **no renderer was edited to draw it**. The
words are a pointer, not a copy — the minted `say:` reuses the entity's own
`entity.<id>.examine` key, so `npm run review` gained no second row. Its address is
`look` and its label has one home, `action.look.look`. A `# location`'s `examine:`
already reaches the player as `location.description` and was deliberately left
alone; two ways to the same prose would be the duplication.

**An item's own words stand beside its name where a player holds it, and a
jewel's beside the cluster in focus.** `itemExamine()` is the one home for what an
item's examine words are and now answers *nothing* where the author wrote nothing —
the `engine.item.examine` fallback and its English article are deleted, because the
name has to stay in the label and `Apple — This is an Apple.` is worse than
silence. Both ride out on a `ModalOption.label` every driver already draws, so no
renderer was edited. Derived claims in `carriedScreen.test.ts` and
`planeScreen.test.ts` take their subjects from the registry.

**An action that is offered and then refuses is deliberate, and does not follow
dialogue.** A dialogue node the player cannot afford is simply not offered; an
action in the same position is offered and refuses with `engine.inputs.short`.
Ruled by the owner: a node is a thing someone says and can go unsaid, an action is a
thing you can see and try, and being told why you cannot is information. Authors
keep `hidden if:` for the cases where it should vanish.

**An entity a location stands must offer a player something.** Refused at load
naming the line, in the `unpriceableStock` shape: an action of its own or in
`uses:`, `stations:`, `keeps shop:`, `stats:` to fight, or a `# dialogue` that owns
it — and `examine:`, which counts because by then it *is* an action. `requires:`
and `hidden if:` are not read, because a load-time check cannot know a flag is
never set. The rule is over what a location **stands**, not over every entity,
because `# entity player` offers a player nothing by design and is the one entity
in the corpus standing nowhere — a derived rule with no exemption beat an
unconditional one with a listed exception.

**A race is content, and everything with an effect while it exists is one carrier
list.** `# race <id>` declares its bonus as ordinary tag clauses (`+5% defense`);
`modifierCarriers` in `src/runtime/stats.ts` folds the entity, its passives, its
buffs, its worn items, those items' passives and its race through one shape. A
skill level is simply a third `Counter` beside `resource` and `stack`, so a skill's
old private `stat-id:`/`per-level:` pair is gone and `+1 attack per level of melee`
is writable on an item, a passive, a buff or a race. **The performing action's tags
are deliberately not in that list**: they are the same mechanism with a different
source, and folding a verb into the carrier list would put it behind `hooks.ts`,
which already rules that `on hit:` is carried by a character rather than by a verb.

**`assert:` reads `xp`, `level`, `resource`, `inventory`, `stat`, flags, `time`,
`visits` and `player.<field>`.** The resolver is a `Record` over the grammar's own
roots, so a root added there does not compile until it reads something, and the
shapes the oracle prints are derived from the same table, so it does not reach the
page by hand either. An unknown id under a root is refused at load. **A root
answers two questions and carries both**: `resolveReference` is identity, so a
condition compares `core.elf`; `referenceWords` is locale-aware, so `{player.race}`
in prose reads *Elf*. A root that does not say which of the two its answer is does
not compile. `xp.<skill>` is the raw total and `level.<skill>` is what that total
has bought — 1000 experience is level 2 — so *reach level N* is one root and never
arithmetic on the other.

**`until <done | condition>` runs an action to a terminator.** The condition is the
same grammar `assert:` takes — no second predicate language. `done` means nothing
is under way. There is exactly one stepping loop, `resolveUnderWay`, and it takes
the stopping test.

**A terminator may only follow a payload that spells itself out.** `choose:` is
free text a player is shown and may contain the word "until", so the split is tried
after free text and before anything that would swallow the tail.

**Content claims live in `# test`; TypeScript tests are for mechanics.** A claim
about a number is `assert:` or a `# save` compared with `expect only:`, which
matches just the keys the save declares.

**`expect only:` is the default; whole-sheet `expect:` has to earn itself.** Two
arguments earn it and no third has been found. One: the claim is that a roll
*happened*, and the cursor moves whether or not it yielded anything, which no
assertion can name. Two: **the claim is an absence** — `expect only:` compares the
keys a save names, and a sheet recorded after a buff lifted has stopped naming it,
so the narrow form would also pass in a world where the buff never expired. A test
that walks anything must state its claim in words (`assert:` or `refuse:`), and
`dsl.test.ts` reports one that does not.

**State the quantity the test names in its own title.** A one-line content change
broke fifteen tests whose claims were all still true; they were exact about
something else. A buff's *contribution* is not the stat's *total*, and damage is
not `max - current` once anything regenerates. The fix is a difference, never a
tolerance band — a band would also pass in a world where the mechanic did nothing.

## Modules

**One module is one file, and a module is a removability unit, not a size unit.**
Two files declaring the same `# info` id is refused, so "chunk a region" and "split
its namespace" are the same act. The rule: *a module is what you can take out and
still have a world that loads.* Tulsa standing is one module; each quest is its
own, and a quest module adds to entities rather than editing the region's file.
962 lines is not a problem.

**`core` holds the furniture and stands nowhere.** Stat bases, the health pool,
the death event, factions, skills, slots, modals, the player, passives, cluster
jewels, droptables, generic items, recipes with no station, and `melee-combat`.
It declares no location, no entity that occupies one and no line anybody says —
those belong to the region they happen in, which is why Miki's house, the beach
and everything standing in them are `tulsa`'s. The one `# test` core owns is the
only claim that can be made without walking anywhere.

**A modal screen is a word the language closes, and no kind declares one.**
`MODAL_SCREENS` lives in `src/grammar/actionResult.ts` beside the parser that reads
`open modal:`; `# modal` is gone, because it restated the engine's own list and the
engine opens `quest-journal` by name from `command.ts` while `core.dsl` never
declared it. `sections/test.ts` refuses `open-modal:` through the same words,
`modalStack.ts` keys its openers by `ModalScreen` so the compiler refuses both
directions, and the oracle's forms map off the same list.

**A kind declares its id scope and its name checking separately: `ids` and
`vocabulary`.** They used to be one answer — `ids: 'global'` silently opted a kind out
of both reference visits, because `isNamespacedKind` gated both — so a kind that wanted
one name across every module *and* its references checked could not say so, and
`# modal` picked the obvious word and got the bug. `isNamespacedKind` is gone.
`vocabulary: 'declared'` means a name nothing declares is refused; `vocabulary: 'open'`
means the vocabulary is the union of what the corpus writes, which is what `# slot`
wants and what its own file already said in a comment. `dsl.test.ts` derives both
halves: every kind anything names must be `declared`, and `ids: 'owned'` implies
`declared`, because `resolve` rewrites a module-scoped name into a key that has to
exist. A global name is already its own key, which is the one that may be left open.

**A name the engine mints and a name an author writes are different acts, and
`Namespace` keeps them apart.** `mint` holds a minted id at the root, is idempotent
across every section that mints it, and refuses an authored id standing on one;
`declare` refuses the reverse. Before that, the minted `examine:` stood on a bare
undeclared id, so a module writing `# action examine` landed on `action.examine.examine`
and one of the two silently won — confirmed against a two-section draft, where the
statue's minted offer wore the authored action's title. The minted id derives from the
same branch the locale key already used, so the id and the words cannot drift.

**A station is `# station <id>`, and a station's name is core's furniture.** The
name is declared where the world's vocabulary is declared, the entity that opens
one lists it in `stations:`, and the recipe that needs one names it in
`station:`; both are ordinary namespaced references, so an undeclared station is
refused at load naming the line and a declared one nothing opens loads clean. A
recipe is therefore generic knowledge and lives wherever it wants, while the
oven that opens `oven` stays in the region it stands in.

**A shop is a declared kind an entity points at, and price lives on the item.**
`# shop` says what it stocks, its `buying:`/`selling:` multipliers over an item's
own `value:`, how long a unit of stock takes back, and whether it `accepts: any`
tradable thing or only what it stocks. **An item declaring no `value:` is
untradable** — that is the whole of the rule, and it is why coin declares none and
why no shop can trade the coin it counts in. The player pays what the shop rounds
up and receives what it rounds down, so nothing can be bought and sold back at a
profit. Stock is counted in the save and comes back by whole periods, never to the
moment, or a shop bought from more often than its rate would restock never;
nothing is written until somebody trades. **The scale is anchored, not invented**:
`tulsa.a-bent-coin-becomes-a-cooked-herring` fixes bent-coin at 2 and herring at 5,
so a meal is five and a day's worked good is twelve. Every cluster jewel, whetstone
and orb is deliberately untradable — each comes out of a fixed one-shot cache, and
a price would launder a build handout into free cash.

**The journal is the player's own notebook.** First person, and it names no room,
no route and no verb — working out what is next is the play. The rule's home is the
`JOURNAL_VOICE` note on both `log:` lines in `src/content/sections/quest.ts`, which
is what `npm run oracle -- quest` prints — the oracle's own examples used to be map
instructions, so an agent authoring off the page learned the wrong voice from the
grammar itself.

**A holding leaves the player only through a door that already answered whether it
could.** `src/runtime/itemInstance.ts` holds one private writer and exactly two
public doors: `receiveItem` for arrivals, and `handOver(state, parting: HandOver)`
for departures, where `HandOver`'s constructor **and sole field** are private and
can only be minted by `HandOver.asked(...)`, which returns `undefined` when the
player is short. The guarantee is structural and was verified by compiling
forgeries, not asserted — a private constructor alone was not enough, since a
matching object literal got through. **A grown item is never spent**, which the
engine says in its own words in `content/engine-en.dsl`; a shop once had its own
answer and was wrong.

**An `always` node that writes its own `take:` is refused at load.** It is the
fallback line, so a player who cannot afford it leaves the entity with nothing
behind it and no Talk action at all — indistinguishable from a spent conversation.
The refusal sits in `contradiction(node)` beside the `sticky`/`again:` one, so it
covers a `# dialogue` node and a node under a `# quest` stage with nothing
enumerated, and it reads its cost through the same `itemCost` the runtime's
`affordable` reads. A cost on a `->` choice, a `when:` thread or an `ask:` thread is
untouched: those hide only themselves.

**`packedCount` counts off `packRows`, and no count is a door.** It was
`carriedCount`, had no production caller, and is the plausible-sounding count that
once let a shop sell grown copies for free. The name says a place rather than a
holding, and `spendableCount` remains the only count a departure asks.

**A dialogue node that takes more than the player holds is not offered.** Derived
from the node's own `take:` in `openersNow`, so the author writes the cost once and
never a matching `hidden if:`. An entity whose only node is unaffordable goes
silent down the *same* path a fully-spent conversation takes, rather than a second
one. A spent non-sticky node holds its `take:` back, so it costs nothing and stays
offered. A `give:` into a full pack refuses at the moment instead of hiding the
node — what you have not got is durable and reads as a quest not yet started, a
full pack is transient and reversible, and an entity going silent over it tells the
player nothing they could act on.

**A pack holds twenty-eight rows, and `0` means unbounded.** `# variable
inventory-slots` in `content/core.dsl` is the only place the number is written;
`inventorySlots(registry)` names none, and a registry without the variable answers
`0`, so infinite is the same expression rather than a second switch. A row is one
line of the pack: a stack of 500 is one row and the 501st always fits, each grown
copy is its own row, and worn gear is outside the count. `packRows(state)` is the
one home and `carriedEntries` localizes *that* list, so what the player counts on
screen and what the engine counts are the same list by construction. Nothing is
lost and nothing is silent: every door refuses through its own existing channel,
and an over-full `# save` loads whole and simply refuses arrivals until it is back
under — destroying a player's holdings on load is the silent loss this exists to
prevent.

**`inventory-changed` fires off a comparison, not off whoever moved something.**
`announceCarried` compares `heldSignature(state)` against what the player was last
told, so a door built next month is covered with no edit and noticing twice over
one act is impossible. `moments.test.ts` — the derived proof that every trigger the
language has actually fires — caught two earlier designs of it.

**The shipped corpus has one home: `src/content/shipped.ts`.** `shippedFiles()` and
`shippedSources()` read `content/` fresh each call and exclude an author's own
`local-changes.dsl`, which is legal to run `npm run play` against but is not itself
shipped. `standingSources()` is the minimum world with somewhere to stand — today
`core` and `tulsa` — and it is not a written-down pair: it finds whichever shipped
module's own text marks a `# location` `starting`, then closes over the
dependencies it cannot load without. `src/content/shipped.test.ts` proves that
answer against an independent brute-force reading of the same corpus, so a module
split that moves the starting location is caught rather than silently believed. A
site that wants one deliberate module or a handful (not "the whole corpus" and not
"the standing minimum") calls `moduleSource(id)` rather than spelling
`readFileSync('content/<id>.dsl')` again.

**A bulk id move is done by `npm run move-sections`, never by hand.** It lifts
named sections out of one module into another, writes every machine form of their
ids across `content/`, `src/` and `scripts/`, and refuses unless the reloaded
registry differs from the one before by exactly those ids —
`registryDiff(before, after, rewrite)`, which derives its subjects from the
section list. `npm run rename-module` is the whole-module case and owns the rule
for what an id written whole looks like.

**A downstream module reaches an upstream thing by owning the statement and letting
the engine land the effect** — the way a `# quest` hands a dialogue to the entity it
speaks through. The corpus uses **zero** `+` field edits. A blocker phrased as *the
engine will not let me write X* is usually asking the wrong question; ask instead
what this module already owns and what the engine should derive from it.

## Running an action

**Issuing an action carries it to the end of one of its own cycles**, and
re-issuing the same action against the same target advances it rather than
restarting it. Control returns after each cycle, which is what keeps breaking off
mid-fight possible. A live driver (the GUI) ticks an armed action to completion on
its own and always did.

**One entity's offers stand together, and its minted action stands second among
them.** `locationChoices` gathers what one entity offers into one run — its shop, its
available actions, and the fight choices aimed at it, all of which already carry it as
`choice.detail` — and `fightChoices` is asked per entity rather than sweeping the room
a second time after everything has been offered. That sweep is why examine was last on
a dresser, fourth on `herb-patch` and first on anything with `stats:`. `computeChoices`
is the sole home: the app groups the list by `detail`, `play-cli` and the playbot print
it in order, and none of the three sorts. Which action is minted stays where the
minting is — `isMintedAction` reads the same `EXAMINE_FIELD` that `mintedActions`
writes, so the runtime never spells the word.

**In flight and offerable are different questions.** *Which action is seated here*
is a fact about state and lives in `src/runtime/actionLookup.ts`, beneath action
legality; *may it be performed* reads conditions. Conflating them has now caused
three separate bugs, and once `stat` is a condition root it is circular besides.
`stat.test.ts` demonstrates the circularity rather than arguing it: folded through
offerability, an action granting `+5 attack` whose `requires:` reads
`stat.attack >= 6` exhausts the stack.

**Everything here is simulated time.** Wall clock belongs to the GUI and the live
REPL, which tick simulated time at a constant rate. Nothing below them may read it.

**An action under way is bounded at four simulated hours**, exported and named in
the failure text. It replaced a 1000-*cycle* cap, which was about 1000 seconds for
a swing and about fifty hours for a craft — not a bound anyone could reason about,
which is why the respawn treadmill got past it. Hitting it is a directive failure,
deliberately not `on unfinished:`: that is an authored outcome of `attempts:`
running out, and a backstop the engine applies is not content. The longest wait-out
any `# test` reaches is 21.6 simulated seconds.

**`on death: stop` is a designed terminator.** A dangerous action risks dying and
stopping is the system working. It is not the bound above and must not be routed
around. Note that a regenerating player may now never die, so death can no longer
be relied on to end anything.

**Fainting carries the player to `starting-location`, and that is what makes `stop`
hold.** `openAggression` re-arms against whatever aggressive thing stands here at
the end of every quiet segment, so before the move it routed straight around
`stop`: four simulated hours in `tulsa.swamp-mire` were **4548 faints and 15,110
log lines** down the wait-out path, and 95 faints of free respawning in place down
the plain one. Both are one faint now. `stop` holds because the player is no longer
standing where the aggression is, **not** because `stop` changed — a world whose
*starting* location held an aggressive hostile would livelock again, and
`fight.test.ts` proves the difference rather than asserting the good case.

**`goto: starting-location` is answered live too**, through that same one
spelling and that same one answer, at both the `cheat` command and the `# test`
directive. `travel:`, `adjacent:` and `relative:` still refuse it, because a road to
wherever the game starts is not a coherent map.

**`relocate: starting-location` is answered live by the engine**, not resolved at
parse time, so `core` may write it without naming a module it does not depend on
and a world that moves its start moves this with it. The spelling exists once, in
`src/grammar/actionResult.ts` beside the parser that reads it; its answer is
`startingLocationId`, which lives beside the registry it reads. A `# location` may
not be *called* `starting-location`, because within a module an author writes bare
local names and one would shadow it.

**Nothing ends an action early unless the action names what does.** `stops on:
<event>, …` is that naming and its default is none, so no action's behaviour moved
when it landed. The test is made at `fireEvents`, which is the one place any event
fires, so every trigger is covered with nothing enumerated — and it reads the
events that fire **for the player**, since the action under way is the player's. A
`level-up` fires once per level crossed, carrying the level reached as its
`amount`, so `gain 1 * amount experience on <event>` weighs by how far the skill
got.

**Two things end an action without it naming them, and both are the world failing
to deliver rather than content**: the four-hour bound above, and a pack with no row
left for what the action just found. **A terminator that was never reached is a
third, and it is a failure** — `use: X until <condition>` that runs out of things
to do reports `engine.stopped.short`, naming what ran out beside the condition that
was asked for, where it used to report success. `done` is untouched: reading which
terminator was given is the whole of the split.

**A progress figure is published only when it has counted something.**
`completion` is `number | null` and `stillToCount()` is the one home; a renderer
shows a figure when there is one and says nothing when there is not. **Exactly one
shape makes it non-null:** an untargeted action — no `depletes:` and no `my`/`their`
anywhere — whose plain `damage:` reads under 1, so its cycle takes several attempts
and `implicitTarget` sits below full while control is out. Every other shape either
deplete-counts a named pool instead, or resolves in one attempt and is back at full
before anyone can look. A **side-naming** action with nothing to deplete is refused
outright, which is why `resolvesPerAttempt` is exactly targetedness. `tulsa`'s
dead alder is the corpus's one writing of it — four swings of `damage: felling` at
0.25 a swing for one log — so the terminal's `engine.repl.live.counting` line and
`LiveSheet.tsx`'s implicit bar are lit by shipped content and are **not dead code
to delete**.

**An action that ran to a terminator reports what changed and what stopped it.**
AFK is read off the terminator and nowhere else — `resolveUnderWay` takes the
`Terminator` itself, so a directive handing the engine a stopping test reaches the
summary and a plain `use:` never does. No flag, no caller decision. `span.ts` diffs
with the same `diffState` that `serializeSave` uses, and `SPAN_VOICE` is a
`Record<SaveField, …>`: **a field added to `GameState` does not compile until it
says whether a span mentions it**, and each silent field says why. A `# resource`
or `# skill` added next month is reported with no edit. `endAction(state, because)`
makes every ender name a localized reason at the point of decision, and `fireEvents`
names the event it is firing, so `on death: stop` and `stops on: X` come out as the
same fact told apart by the event rather than by the authoring mechanism.

**`travel: X` is not a journey.** `walkTo` walks the whole route synchronously
inside the directive; only `begin: travel X` creates a `state.journey` a wait-out
steps. So `travel: X until done` always reports that it finished, never that the
player arrived.

**Prune records are addressed to whoever loaded the save, not to the player.**
They travel as `PruneWarning[]` — stderr and the run log for the playbot, a
warn-toned tool message beside the view for the terminal and the GUI. They are
written in save-key vocabulary a player never wrote and cannot act on.

**`attempts:` is a per-cycle budget, and a repeating action is not bounded by it.**
`# recipe`'s `burnt:` compiles to exactly that shape — `continuous`, one attempt,
an unfinished outcome — and five hundred tiles must slag a few without the craft
stopping. The four-hour bound is reached by `continuous`, not by `attempts:`, and a
repeating action ends on `stop` among the outcome's results or on `stops on:` an
event whose trigger is `unfinished`. Both are proved in `src/runtime/stopping.test.ts`,
which was written after a lane built the other fix and threw it away.

**One function writes a pool level, and it is the one that fires on empty.**
`emptyPoolNow` used to write `store.levels[id]` itself and fire the event beside
it; it goes through `setPoolLevel` now, so cutting the single firing site takes
thirty tests across twelve files instead of sixteen. The two routes that looked
redundant were each independently load-bearing — the fight route runs mid-segment
at the instant of the blow, and `leaveFight` deletes the actor before any settle
could see it. One behaviour moved with the collapse: a pool that is *already* at
nothing is no longer fired on, only one that falls to nothing, which is the rule
the rest of the engine always kept.

**An event handler's pool writes go through that writer too, and the settle repeats
until the deltas run out.** `settleHandlerDeltas` was the third writer and looked like
a guard against a death handler recursing; measured, it was guarding nothing, because
`setPoolLevel` only fires on a crossing and a pool already at zero cannot cross again.
A handler draining a *second* pool to nothing had been silent, which was the actual
cost. Settling once only moves that silence one level deeper, so it settles until the
deltas run out — which makes livelock reachable where it was not (`on charged: restore:
charge` re-fires forever), and the passes are bounded at `HANDLER_SETTLE_PASSES` with
the refusal naming the shape. The overflow rule came with the writer: a handler that
restores a pool past full now fires `on full` and wraps, which is what every other
route already did and which nothing in the corpus exercises yet.

**`Ledger` is the one component that draws a sheet, and it takes a layout.** `list`,
`grid` and `doll` branch on the prop and on what an `Entry` carries — never on which
page is calling, because a branch on the caller is a per-page table. The grid's column
shape lives once in `src/ui/sheetLayout.ts` and `sheetLayout.test.ts` holds it derivedly:
exactly one file under `src/ui` writes `auto-fill`, and more than one takes `GRID`. A
cell's density comes out of the font and never out of the 44px touch floor.

**`SkillsPane` takes the grid's shape and keeps its own cell body, and that is the seam
in the right place.** It is deliberately not a fourth `Ledger` caller: its body is a
`Ring` — an SVG sweep, a level, and an arrival flash keyed on a generation — and pushing
a progress fraction and a flash key through `Entry` would make `Ledger` draw a Ring for
nobody else. `Home`'s `Sheet` is the same arrangement.

**A `# slot` says where on a body it sits, and the body is derived from the slots.**
`at: <column> <row>` is an ordinary field of the kind with its own parser and printer, so
the oracle prints it and the round-trip claim covers it. `doll()` makes the body as wide
and tall as the placed slots reach rather than declaring a canvas, and a slot with no
`at:` — including one no `# slot` describes at all, since the vocabulary is the union of
every `equipment-slots:` — falls to a row beneath. So no slot is unreachable and no table
of positions exists.

**A session opens on what the live slot last held, and a save it cannot read is kept.**
`openUniverse` returns a `Resumption` — `new` when the slot is empty, `resumed` when it
holds a game this build can read, `kept` when it holds one it cannot. In the `kept` case
the game is new and `synced` stays null, so nothing autosaves over the bytes that are
there, and it is said in error words. That is the same shape `fileRun` uses for a
recorded run whose starting save will not read, deliberately, rather than a second
answer to one question. `resumptionNotes` in `command.ts` is the one home for the words
and both the driver and `play-cli` call it.

**`runLog.ts` is the only file that mints a `-start` or `-end` id, and a sweep says so.** The
cycle that used to stop `/create-test` reading it is gone: `outcomeOf` and `refusedLine`
moved down into `command.ts`, and the private `refusedLine` already living there is
`refusal` now, because it mints a refusal rather than recognising one — two meanings
under one name is what made the collision look like an obstacle in the first place.

**The `DEBUG` assumption was swept out of every `standingSources()` caller, empirically.**
A `DEBUG` section of each kind that can stand alone was appended to `core.dsl` in turn
and all seven callers run against each. Two carried it — the action-key claim in
`locale.test.ts` and the thread-list claim in `translationSurvival.test.ts`, both taking
subjects from a registry map while claiming about words. Both read the mark off
`isDebug`, the section's own answer, rather than off whether the locale carries the
words, so a node whose words genuinely are missing still fails rather than quietly
leaving the sweep. The other five were clean.

**A road costs a flat three seconds, and every choice a view publishes is on the action
list.** `travel-seconds` is the tunable and `travel-seconds-per-unit` is gone, along with
`locationDistance` — nothing derives a travel time from map coordinates any more, which
was a mechanism that got worse as the world grew rather than a number that was too big.
There is no rule any more saying which choices reach the list. `onActionList` said a way
out did not; the owner reversed that on 2026-08-25 having played it, and a predicate that
answers *yes* to everything is not a seam, it is a thing to remember — so it was deleted
rather than inverted, and the app, the REPL and the playbot each draw the view's own list
whole. `aWalkAway` had gone earlier, having been the same judgement applied to only the
multi-leg half. `waysOut` lives in runtime and is the map's reader, so `/map` and the
app's map read one list: a way out now stands on both surfaces, which is the point.

**The pack has an order its owner chose, and `swap:` is how it is written.** It reaches
state by the road state already takes, so `SaveField`, `SAVE_FIELDS` and `SPAN_VOICE` all
had to answer for it through `keyof GameState` rather than a list being edited. A row the
order has never seen falls in behind the ones it has; a name the pack no longer holds
draws nothing. `carried()` no longer sorts by name, which was a second answer to where a
thing sits. **`swappedOrder` in `src/runtime/packOrder.ts` is the only function that moves
a row, and every surface reaches it by saying `swap: <one> with <other>`** — the app's
`driver.swap` builds exactly that line, and a terminal accepts it typed, so neither has a
control the other lacks and neither has an ordering of its own. A sweep in
`src/ui/surface.test.ts` holds that: no module under `src/ui` may name `swappedOrder`,
`inPlayerOrder` or `packOrder`, with a vacuity guard that something still sends the
directive. A screen that reordered its own copy would draw a pack the save does not
hold.

**A plane shrinks from its leaves inward, and a socket never comes back.** A passive
point refunds with no new state at all — `pointsSpent` is derived from the allocated
arrays, so a position leaving one *is* the refund. The ruling that a jewel socket does
not refund is built by refusing the unallocate outright rather than by removing the
socket and withholding the point, because withholding would have needed a hand-kept
`sunk` counter beside the plane and would have broken `isPlane` on saves already
written. So semi-permanent is literal: a jewel put in a socket stays in it. The strand
rule is general — taking back anything still allocated on a node is refused, and a
socket is always an allocated slot node, so sockets are covered without being
enumerated. Re-allocation cannot re-roll, structurally: allocate and unallocate are
never handed an rng cursor, `fillSlot` is the only writer of a `Cluster` and refuses a
filled slot, and unallocating never deletes one.

**Gear drops carrying its points, and `item-level:` is what gives an item a plane.**
`isBase` reads `itemLevel`, not `slot`. `receiveItem` was already the one arrival, so
that is where a base is rolled and minted — which is what makes every base an instance
stacking to 1, because the roll is what makes two copies different. `feedItem`, the
`feed:` directive and the whetstone are gone. An `item-level:` on an item with no
`slot:` is refused, so a potion cannot silently become unstackable with an invisible
skill tree.

**A thing entering the world draws one fraction and keeps it, and every `Range` it
declares is read at that fraction.** `ItemInstance.roll` and `Cluster.roll` are the same
field — a jewel's passives and an item's level are one mechanism, not two that look
alike. Storing the roll rather than the number is what lets a recorded run replay and
lets a rebalanced range reach gear already standing in the world. One roll per *cluster*
rather than per payload, so a jewel comes out good or bad rather than good in places, and
two of one jewel in one plane are two different jewels.

**`discovered` means heard of, `touched` means stood in, and they are two facts.** The
merge the owner asked for is real but is not the one that was named: *have I read this*
and *have I stood here* are the same fact under two kinds and are now one flag,
`<id>.touched`, named once as `TOUCHED` on the contract in `sections/define.ts` beside the
`flags` slot it fills — a third kind joins by declaring it, not by minting a word.
*Heard of* cannot join them, because **discovery spreads one hop**: `standWhereTheyAre`
writes `here.touched` and `here.discovered` and spreads only `discovered`, so a player on
the sand has the market on their map having never stood in it. That is what
`leave-tutorial-island.adrift` was gated on, and the module comment claiming `discovered`
meant *stood in* was simply false. **Deriving `discovered` from `touched` was measured and
rejected twice over:** a conditional road that later closes would *un*-discover a place
already walked, making the map non-monotonic while `journey.reachable` refuses undiscovered
targets; and the derivation would have to live as a per-flag special case inside the generic
flag reader in `conditions.ts`, the one file that spells no content flag name at all. The
proof takes its subjects from every location the corpus declares — standing touches that
place and nowhere else, and puts every open neighbour on the map untouched.

**`<id>.examined` is gone, and an old save is pruned rather than refused.** `SAVE_VERSION`
stays 13 because the change is additive: `.discovered` keeps its name and meaning, and a
save carrying `.examined` loads with that flag pruned and a warning. An entity a player had
read shows `?` again until re-examined, which is one action and nothing gates on it. No
shipped save carried it. Stood-in history from before the change is lost, so a returning
player walks to the market once — which is what the line asks for.

**An unexamined thing is masked in the view, so all three surfaces mask alike.** Having
been looked at is the same `touched` a place is stood in with: `# entity` and `# location`
both declare `flags: [TOUCHED]`, and `mintedActions` puts the set beside its `say:`, so the
write lives where the mint lives and no runtime file spells the word. The mask is written once, in `sessionStatus` and `locationChoices`, and no renderer
was taught anything — which is why the parity harness keeps its whole claim with no new
excuse. Two rules came with it, both measured: an entity with no `examine:` is never
masked, because it mints no offer that could lift the mask and masking it would void the
rule that a thing must offer something; and a foe in the fight under way is never masked,
because arming an examine would overwrite `state.activeAction` and disarm the player's
own fight. The mask hides offers and does not refuse a directive, so every recorded
`# test` still replays. The playbot reads a room free on arrival, before the model is
asked anything, so its turn budget means what it meant before.

**A DEBUG section carries no words, and is on no sheet that lists what the world
declares.** Two rules, and the first is why the second could be simple. Prose on a DEBUG
section is refused where it is written, because a section that says nothing in any
language has no business carrying words — which resolves what looked like two opposite
demands, since emptying the locale rows had been answering *these words are not sayable*
and *these words were never written* with one absence. What the emptying still holds is
only what the engine generated, and an action's label stays deliberately, because it is
the address a recorded `# test` drives the section through. Separately, the old rule
*nothing a player can reach may name a DEBUG thing* never fired on a sheet, because a
sheet walking a registry map names nothing — it lists everything. `listedToPlayer` sits
beside `isDebug` and is asked at every such enumeration; a sheet reporting what the
player holds or where they stand is reading state and does not ask it. The proof takes
its subjects from `contentSectionMaps()` and walks `sessionStatus` whole, with an
`it.each` coverage guard that fails the file for a kind nobody has probed — which is how
`# group` was caught the same day it arrived.

**A `# group` says what something is, and its colour is read off the same declaration.**
`# item` and `# entity` each name one through a shared `GROUP_FIELD`, and the standard
group for each kind is declared in `core.dsl` rather than defaulted in TypeScript, so
nothing is ever ungrouped and the fallback is content like everything else. The claims in
`dsl.test.ts` derive their subjects from whichever kinds name a group at all — including
the one `group.ts` cannot make about itself without closing the section-list cycle. A
standard group's word has to be true of everything that falls to it: the first attempt
was `creature`, and the terminal printed `[Creature] Front Door` before the lane had
finished, which is why it is `presence`.

**Colour carries two meanings on two channels and they never share one.** Text is voice,
fill is group, and `src/ui/lineStyle.ts` holds both with the separation proved off the
records themselves — no voice may name a background, no tone may name a colour, every
voice is distinct so `message` no longer borrows its tone's, and a place change has no
colour. The error tone is a rule down the margin rather than a fill, because fill means
group and nothing else.

**A group reaches the app as a fill and a terminal as a word, and the parity harness
holds both halves.** `engine.repl.grouped` is the one place the bracket form lives and
the prefix is the group's own `title:`, so a choice line and a carried row carry it in
both terminals. The two app-side paths carry one shared excuse that writes the ruling
down. `group` is deliberately not on the entity roster: prefixing it printed the same
word five times in one line, and an entity reaches every driver through the offers it
makes.

**A plain colour wheel ships, and guidance with it was ruled not now.** The want was a
constrained palette or one control moving saturation uniformly, because the owner does
not want to learn colour theory to change the game's colours. Deliberately deferred:
whether a free choice actually goes wrong is a thing the corpus answers by having
colours in it, and it has almost none yet.

**A control answers a hole, and which control it is derives from the parser.**
`COLOUR_HOLE` comes from the colour parser's own form, so any field written with that
parser gets the picker without naming itself anywhere. `Filling` gained `at` — where a
hole's value begins inside what the offering replaces — which is the fact that lets any
control fill a hole rather than replace the whole line.

**A modal shows the beat it is answering, and that is not dialogue-specific.**
`answering(entries)` in `asking.ts` is the whole decision: the trailing run of `said`
lines, stopping at the first line that is not somebody speaking. Any screen that darkens
what is behind it draws them above its choices, in the voice they were said in.

**A notification is a key, a count and its words, and `src/ui/notice.ts` is its one
home.** There is no discriminant: merging counts up under the key alone, so it never
asks what raised anything, and a raiser chooses how coarse its counting is by choosing
the key. Adding one is a line in `RAISED_BY`, and the imperative path reaches the same
type, which is why the playtest messages and an xp gain share a surface. Three derived
claims hold the list honest — nothing moved raises nothing, every raiser keys apart on
an everything-moved turn, and every line has words — so a raiser added next month is
covered with no edit. `Notices.tsx` is the only surface, and its lifetime is proved by
parsing `.lingered`'s duration out of `index.css` rather than restated beside it.

**`leaves()` is a fact about `PlayView`, and lives with it.** `src/runtime/viewLeaves.ts`
holds the walk; `scripts/lib/viewCoverage.ts` keeps what is about *comparing*
surfaces. So `src/ui/render.test.tsx` derives what a player may read from the same
walk the parity proof uses — every string the view holds, less the addresses
`addressable(sources)` derives off the driver's own sources — and the two
hand-written lists it used to carry are gone.

**`leaves()` keeps every string, and the parity question drops the short ones.** A
signature of two characters or fewer turns up everywhere by coincidence, so it can
settle nothing about *which surface drew what* — but the view published it all the
same, and `render.test.tsx` asks the other question, *what did the engine publish*.
The filter therefore lives in `driftingPaths` and not in the walk. Moving it back
into `leaves()` silently stops a two-letter word counting as published, which is
how a settings choice shown as `On` read as a word no engine value produced.

**The parity walk takes both shapes of `play-cli`'s driving flag, and neither alone
would do.** `cliRun` opens through `openRepl` the way the script's own `main` does and
hands the run to the script's own `driveRun`, so `formatTick`/`formatLive` are actually
exercised. But `play-cli` drives only under `--live` on a TTY, and without it `/state`'s
`action:` row is the only place a terminal names an action under way — measured by
deleting `formatUnderWay`, which the old non-driving harness caught and a driving-only
one did not. So the walk runs both and unions the credit. A claim guards the trap
itself: the walk reports which script lines came back with a run to advance, and an
empty list fails.

**A parity excuse says which moments it covers, not which path it names.** An excuse
keyed to a path strikes it out before the walk, so a driver dropping *every* occurrence
of that path passes — which is what `modals[].options[].label` was doing while its
stated reason covered one screen. `PathExcuse` carries `covers(view)` now and is spent
moment by moment, the modal excuse calls the app's own `onlyLeaves` (moved into
`asking.ts` beside `dismissal`, so the sheet and the excuse read one answer), and an
excuse that never bites is reported.

**A counter pays for the thing on the table.** The steel and the days in it, never
the plane an item carries or how far it grows — which is why the four weapon bases
are priced in band with the hand-axe at 12 while every jewel, whetstone and orb
still declares no value at all. A price that read the ceiling would turn the
one-shot caches those come out of into purses.

**A comparison's literal declares the precision it is weighed at.** The right side is a
`Threshold` carrying how many decimals the author actually wrote, peeked off the literal
before it is parsed, and the engine's answer is read to that many places before the
operator is applied. `= 50.84` therefore holds for 50.839999999999996, which is what 41
raised by 24% is in a double and what an author's own arithmetic gives — without this the
decimal threshold could not express the figure it was added for. The rounding happens
once, before any operator rather than per operator, so `<`, `=` and `>` still partition
the line at every precision; a whole-number literal declares no decimals and means what it
always meant. A literal prints back with the decimals it was written to, so `50.80` stays
`50.80`. The derived claim builds a record saying each operator in terms of `<`, `=` and
`>` and asserts its keys equal the grammar's own operator forms, so an operator added with
no word there fails rather than going unweighed.

**A condition's threshold reads a decimal; a count reads a whole number.** The engine's
numbers were measured rather than assumed: `statValue` is a midpoint of a scaled range,
an arbitrary double with folded percentages in it, while `xp`, `level` and an inventory
count are genuinely whole. So the comparison's right side takes `decimal` and
`has <count>` does not. Nothing else widened — the other readers of both parsers were
checked one at a time, and no input that was accepted before is refused.

**An `expect only:` sheet is not a claim, and what one carries alone can be measured.**
The vigor sheet's load was found by deleting its `expect only:` line and running seven
deliberate breaks against both shapes: five were already caught by `assert:`, and two
rested on the recording alone — whether `quickening` paid out at all, and whether the
payload's clock was the sixty seconds its declaration claims. Both are written as
claims now, one of which needed the decimal threshold to exist. `npm run mutate` is the
tool that settles this question and it reports `2 killed, 0 survived` on those two.

**An orphaned `content/reviewed.tsv` row is reported and never deleted.** The row
carries a person's "I read this" answer, so a key that moved wants its row moved and a
line that is gone wants its row gone — and which of the two it is, is the reader's call.
The keys it is measured against derive off the same walk that writes the ledger, and
every module's sheet is built even when a run asks for one, because deriving from only
the asked-for modules would report the rest of the ledger as orphaned. A key a
`# locale` declares is not in `registry.locales.base`, which is why a registry-only
derivation would have been wrong.

**The suite is green at seventy-nine processes, and the debt for that is paid.** Seven
concurrent runs on a 24-core box, six in agent worktrees and one in the checkout: the
repo's own guard counted 66 competing processes before the seventh started, so 79 with
its own workers. All seven passed 3936 tests in 163 files, nothing failed and nothing
timed out. The slowest run took 109.7s against the 120s hang detector, which is the
closest that number has come to mattering and the reason it is a hang detector and not a
budget. Idle is about 23s, so the whole cost of that contention is a fourfold slowdown
and no reds — which is what the worker cap was put there to buy.

**How long the runner waits for a test lives once, in `vite.config.ts`.** It is a
hang detector at 120 seconds, not a budget, and no test states its own — the two
hand-kept per-test budgets are deleted. Every red `npm test` has produced on this
machine was `Test timed out` and none was an assertion. A sweep over a derived set
is written as one test per subject, so the clock never stands in for a budget and a
failure names the subject that broke rather than a list at the end.

**A player preference is one declaration, and the engine branches on none of them.**
`SETTINGS` in `src/runtime/settings.ts` says what a preference is called, what it is
for, what values it takes and where it stands; `sessionStatus` publishes the list, and
`/settings`, the settings page, the help, the save, the prune and the AFK span all read
that rather than the declaration. What a preference *does* is written in content —
`hardcore` is an ordinary `setting.<name>` condition — so adding one is that line plus
its two engine keys' words. It lives in `GameState` and not in a slot, because the only
thing that can read one is the world running and a `Segment` carries the state and the
registry and nothing else. The autosave cadence deliberately stays outside: it is one
cadence for the whole store, and folding it into a portable document would have every
`/restore` overwrite the player's cadence with a fixture's.

**Every field a kind declares as prose is held to being said to a player.**
`src/runtime/proseReach.test.ts` takes its subjects from `textFieldsOf` crossed with
the corpus's own values, and its evidence from a sweep that stands the player in front
of everything the registry declares. The question is asked of the **field**, not the
line — a value behind a flag nobody sets is undecidable for the same reason `requires:`
is — and that reduction is what turns 360 undecidable questions into 19 decidable ones.

**`event.title` is excused rather than dead, and the excuse expires by itself.** Its one
reader is `engine.stopped.event`, reached only off an action's `stops on:`, and the
corpus writes no `stops on:` at all — `on death: stop` is a result and not a stopper. So
it sits in the guarded `NOT_SAID` list, and the day an author writes a `stops on:` the
words reach a screen and the entry has to go. Nobody has to remember that: the guard is
what fails.

**A recorded run is one line a turn and does not echo the engine back.** The author read
the answer on the screen it was said on; the model's journal is the only sight it has of
its own last turn, so `turnRecord` is handed null by one harness and a list by the
other. Notes belong to any turn, because moving between the app's pages is a turn the
engine never hears about and a player who has just navigated somewhere has something to
say about it. A run says on its first line when it was played and which commit it was
played against.

**The numbers stand until the world does, and balance is a pass of its own.** Ruled
2026-08-25: *"This is a balance concern and is not part of the current playtest
situation… Balance will happen after."* So the four race stats stand as chosen — human
max-health, elf accuracy, dwarf defense, orc attack, with evasion and regeneration
rejected as unusable at +5% of 0 and of 1 — and so do the item-level rolls
(`iron-sword 3-8`, `heartwood-blade 12-18`, `proving-blade 6-10`) and the rolling
passives. None of these is an open question; a lane that trips over one leaves it alone.

**`packOrder` is in the save without a version bump, deliberately.** It is additive with
a sparsest of `[]`, so all 32 corpus fixtures read back identically, and bumping would
have meant a `migrate-saves` run across every `# save` body for no behavioural gain.

**A `# skill` names one `stat:` and the engine grants +1 of it per level.** `PER_LEVEL`
lives once in `src/content/sections/skill.ts` and `skillTags` derives the grant from
that one word, appending it to whatever tags the author wrote — so the grant rides the
same carrier list a race, a buff and a worn item already go through, and `stats.ts`
needed one expression. A skill naming no stat grants nothing, which is stated in the
field's own note and is therefore what `npm run oracle -- skill` prints. The proof
derives its subjects from the skills the shipped player holds crossed with every stat
the registry declares, so a skill or a stat added next month is covered with no edit.

**Being spent is below one, it lives beside `setPoolLevel`, and the level stays where it
fell.** `SPENT_BELOW` / `spendable` / `isSpent` in `src/runtime/effects.ts` are the one
answer, asked by `emptied`, `drainedAPool`, `completionsBeforeDrain` and the rated-pool
boundary — four places that each used to spell `<= 0` for themselves. **The zeroing
variant was built and measured and is wrong:** it destroys a pool nobody binds an event
to, and it makes a span non-associative across a split, which `resolve.test.ts`'s
sign-change claim catches. Being spent and holding nothing are different facts; a felled
foe is zeroed separately by `emptyPoolNow`.

**One function makes the words a player reads off an action, and an inline label cannot
be written in Title Case.** `actionWords` in `src/content/sections/action.ts` is that
home — an author's `title:` if there is one, otherwise `humanizeEn` of the address — and
`recordActionText` is its only caller, because every driver already reads display labels
off `locales.base`. The corpus sweep this looks like it wants **does not exist**: the
entry-label pattern in `src/grammar/section.ts` refuses a capital, so `ascend`,
`look in` and `open` are the address an action is reached by and never writing. They
were the one generated name in the engine not passing through `humanizeEn`, and that was
the whole defect. `scripts/printedWords.test.ts` proves no second casing function exists
by sweeping the tracked sources rather than by naming today's callers.

**The counter counts `packRows`, so a grown copy is on it and worn gear is not.** One
substitution in `src/runtime/trade.ts` carries both halves of that rule without either
being written a second time: a copy is offered under its instance id, and a price
resolves through the template, so the plane and the points on a copy move it not at all.
`engine.pack.full` is the refusal a player reads when a row is what is missing.

**A quest's standing is a colour the corpus authors, and one declaration says which.**
Three `# group`s in `content/core.dsl` hold white, yellow and green; `STANDING_GROUP` in
`src/runtime/journal.ts` is the one mapping from standing to group, and `QuestStanding`
is `keyof typeof STANDING_GROUP` — so the type and the mapping are the same object and a
fourth standing cannot exist without a colour. The entry carries an ordinary `GroupRow`,
the app fills a cell from it and `/quests` says the word, which is the two channels a
group already has. The terminal's own second copy of the standings — three
`engine.repl.journal.*` keys and a `tone:` ternary — is deleted, and `grouped` moved to
`src/runtime/grouping.ts` so the command and the terminal share one function. **The
previous proof could not have caught the bug it was written for**: it asserted
`TONES[standing]` was truthy, and the value was `text-ok`, a class naming no colour in
`tailwind.config.js`, so a finished quest was drawn in nothing.

**`PlayView.said` is the lines that came with this view, and nothing reconstructs it.**
`view()` drains the log each step, so the field already answers *what was just said*. The
app used to hand a modal `answering(transcript.entries)` — the trailing run of `said`
lines in the whole history, whenever they were said — which is why a quest sheet drew the
last few chat messages. That guess is deleted rather than sharpened; a modal takes
`view.said`.

**`hidden if:` is the only thing that removes an action, and one function says why an
offered one turns you away.** An unmet `requires:` is now offered and refused rather than
absent; `refuseAction` in `src/runtime/runtime.ts` is that one home, having been
`refuseUnpayableInputs` widened, and an author's `on failure:` still stands in place of
all of it. `armAction` no longer throws `action requires unmet`, so **a `# test`'s
`refused` mark no longer covers an unmet `requires:`** — it refuses silently, the way an
unpayable input already did. The words are `engine.requires.item` (*You need {item} for
that.*) and `engine.requires.unmet` (*You cannot do that yet.*); the generic one is bland
on purpose, because it has to be true of any condition, and an author who wants better
writes `on failure:`. `describeCondition` is never called on this path, so no machine
condition reaches a player. The proof derives its subjects from the grammar's own field
table — every gate declared `offered when` — so a third gate has to answer it.

**The corpus's whole appetite for `requires:` is six actions in four rooms.** Measured
before that change landed, because it changes what every gated action looks like: 91
actions, 12 carrying `hidden if:`, 6 carrying `requires:`, 4 carrying both. The worst room
gains two offers and 29 of 33 rooms gain nothing, so the feared wall of refusals is not
reachable from this corpus — the ceiling *is* six. A gated door that refuses does not
suppress the room's own road out; nothing in `content/` reaches that today and it would
have been a stranding bug.

**Every screen in the app is drawn on one layer, and a strategy is a word.** `Modal` and
`ModalCard` in `src/ui/Modal.tsx` are the only overlay there is; what a screen does with
the surface under it is a `Declared` manner resolved in `src/ui/modalManner.ts`, over three
axes and no more — **`place`** (bottom / centre / fill), **`over`** (app / pane), **`behind`**
(dim / clear). Those three are what actually varied across the six overlays that shipped
before it; the fade-in that looked like a fourth was an inconsistency and now follows the
dimming. Two sweeps in `src/ui/surface.test.ts` hold it: only `Modal.tsx` may write
`role="dialog"`, and only `modalManner.ts` may write the scrim or the layer.

**Clicking off a screen is derived from whether it published a way out, and is not a
strategy.** `clickingOffLeaves` is the one place asked. That is why the Playtest Note is
fixed by the derivation rather than by a flag — it had a *Discard* all along and did not
honour it — and why a `fill` screen keeps an explicit button, having no backdrop to tap.

**No kind declares a modal and the manner does not reach the published view.** Two proofs
already in the suite decide this and the lane that built the API tried the other way first
and let them refuse it: a UI file may not name a modal, so the app cannot key a table by
screen; and a published `Modal` says what is still to be answered *and nothing about how
to draw it*, because `place: 'bottom'` is meaningless to `play-cli` and to the playbot. A
screen that must depart from the ordinary is keyed on the `focus` the view already
publishes, through a `Record` over `PlayView['focus']['kind']` that will not compile until
a new focus kind answers it.

**A modal's name is minted from its own id, and nothing can declare one.** `mintedName` in
`src/grammar/values.ts` is the one function — `humanizeEn` under the base language, the
plain last segment otherwise — reached through `Localizer.minted`, and `# info`'s
`defaultTitle` was a second copy of those two lines and now points at it. Because nothing
*can* author a modal's words, there is no second authority to drift. Two proofs derive
their subjects from `MODAL_SCREENS` and `MODAL_NAMES`: every screen's opening line carries
the minted words and never the address.

**The run under way is drawn below whatever page the player is on, and it is a band rather
than a banner.** `LiveSheet` sits in `src/ui/App.tsx` between the paged column and the tab
bar. It is not a banner because `VStack`'s banners sit *between* layers — `LocationBanner`
is the lower one on the map and `StatusBanner` the lower one on home, the character sheet
has none at all — so no banner is below every page and only a band outside the column is.

**A travel seats the road in the same seat a fight seats its target.** *Only a fight seats a
target* was believed and is false; it made the band read a location id where a foe's name
goes. Whatever reads `state.activeAction.roster[player].target` asks the registry whether
what it found names an entity.

**A stat's shares are the number folded up, not a second account of it.** `statRange` is
`foldStat(statBreakdown(...))`, and `statBreakdown` walks the same `modifierCarriers` list
that produced the number, so a share that went missing changes the number instead of
quietly disagreeing with it. Every carrier answers `{kind, id, field}` and
`localizer.content` reads its name off that, so nothing tables what contributes to what.
`increased` is a percentage everywhere; it was a fraction at three sites and a percentage
in `itemContribution`, which is two conventions for one field.

**A turn leaves the log resting on the first line that turn produced.** The decision is
`startedAt` / `restingAt` in `src/ui/logRest.ts` and the component only measures. Two cases
that look like bugs and are not: a turn whose only line repeats the standing last line
anchors on that line, because the transcript counts a repeat rather than minting a second
entry; and resting never goes past the end, so a fight ticking one line a turn still reads
as a scrollback.

**A cadence is the least time to leave between autosaves, and `never` is a word rather
than a quantity.** `Cadence = number | 'never'` in `src/runtime/saveSlots.ts`;
`DEFAULT_CADENCE` is `0`, which is no minimum, so **every action writes**. The default lives
in the engine and the app asks for nothing — measured, because the flip is inside the
suite's own run-to-run spread. `autosaveSeconds` is deleted rather than renamed: it threw
on an unreadable cadence, and its only caller ran under every action.

**That a slot is not being autosaved is said on demand, never under an action.** *This
session did not come out of that slot* is a standing fact, not an event: `saveReport.writes`
holds it, `/slots` and `/state` read it, and every act that makes it true says so once at
the moment it does. The per-action path reports only a write it tried and could not make.
Making the cadence slot answer that question instead would put a second meaning on one
piece of state and would still repeat the line every turn.

**A filed run brings a subset of the three addresses `runSections` names, and dropping one
takes exactly what it brought.** A run whose start is a `# save` the world already holds
*names* it and brings one section; a run carrying its own bytes brings two; one with an end
sheet brings three. `filedRuns` intersects with what is staged, so a named start save is
never taken — it was not the run's to take.
`runSections` in `src/runtime/runLog.ts` is the single answer to which two sections a run
is, so filing writes exactly what dropping takes; `dropLocalSections` is the counterpart of
`stageLocalSections`, adopting once so the registry never holds a `# test` whose `load:`
save has gone. The list is on the settings page. **Nothing prunes on a timer** — refused,
because it destroys runs the author has not exported.

**The road out of a room belongs to whatever in the room offers a free way to the same
place.** `entityAliasesTravelTo` drops the plain road where a standing entity's own action
relocates and says and does nothing else; that is why a basement is reached by descending
and why the front door, not a road beside it, is what a player walks out of the guide house
through. **A masked thing offers nothing but the look that reads it**, so the plain road
stands until the player has met the door and nobody is stranded by a door they have not
looked at.

**Gains that land together and are the same size read as one line, and the count is not
summed.** `saidLines` in `src/ui/notice.ts` folds a run of them — `+5 Attack` and
`+5 Defence` become `+5 Attack, Defence`, because a player who gained five of each gained
five and `+10` would say they gained ten of something there is no ten of. **One count is not
enough to fold on**: an action that hands over a thing and the xp for taking it raises both
at once, so roasting one chestnut is `+1` of the chestnut and `+1` of cooking, and counting
alone says `+1 Roast Chestnut, Cooking`. The fold is held to one namespace as well, read
back through `noticeKey` — the same function every watcher mints a key with, so what is
written into a key and what is read out of one is one rule. A notice counting nothing is a
whole sentence and never folds.

**A test world's shared furniture is a `.ts` outside `content/`, and nothing shipped can
reach it.** `FIXTURE_WORLD` in `src/content/worldFixture.ts` holds only the intersection
thirteen test modules were each spelling — a starting `# location camp`, two stat bases,
two passives and one plain item — and every blade, jewel and orb stayed with the test that
tunes it. It is unreachable **by construction rather than by exclusion**: both entry points
derive their sources from `content/` and nothing else, `shippedFiles()` with `readdirSync`
and `SHIPPED_SOURCES` with a glob, so there is no rule for anyone to remember. Sections
merge within a source, so a world wanting more of the camp writes `# location camp` again
and adds to it.

**What may legally be missing from `content/` is derived from what the file says about
itself.** The guard in `src/content/shipped.test.ts` takes the directory listing minus
`shippedFiles()` and holds every member to declaring `pack: local` in its own `# info` —
not to a name — with a vacuity half proving `renderLocalChangesModule` writes that pack and
no shipped module does. `src/ui/shippedContent.test.ts` carries the claim across to the
page, which reads the same directory a second way. Both were proved to fire by adding a
real `.dsl` and a second filter.

**Removing a piece of shared test furniture now touches one file.** That is what this line
was for: the original measurement found seventeen test modules each declaring their own copy
of the item being deleted. **31 files import `FIXTURE_WORLD`**, and every test module that
still declares furniture has been read and left on purpose. The reasons fall into five
kinds, and they are the test to apply to a new module rather than a list to keep:

- **A tuned arena** — `max-health: 100000`, `attack-rate: 25`, an accuracy the contest turns
  on. The numbers *are* the arithmetic being measured.
- **A deliberately baseless stat** — and this one is a trap. **Sections merge, and a later
  `# stat` with no `base:` inherits the earlier one's**, so prepending the fixture would hand
  a pool of 30 to something written to have none. `time.test.ts` and `hooks.test.ts` turn on
  exactly that.
- **A deliberate minimum** — a one-line world, or a module with *no* starting location, where
  the sparseness is the claim.
- **The module text itself is the input** — the rewriting tools measure comments, blank lines,
  heading order and ids embedded in `# save` JSON.
- **The world is the subject** — a road graph a content reader is asked about, a location
  whose own actions are under test, references that exist to be found.

**A run always carries a start save, and `KeptRun.from` says whether it holds one or names
one.** `RunStart` is `{ bytes }` or `{ save }`, `startsAtSave` is the one predicate, and
`runLines` always writes `load: <that save>` first — so nothing downstream asks again
whether a run declares its start. The branch that used to decide it lives once, as
`runStart(history, taken)` in `runLog.ts`: *a history opening by loading a save has already
said where the run begins, so that line is the run's start rather than its first move.* The
old `usesStartSave` in `command.ts` gated four separate things off one guess and is gone.
**Both `/create-test` and `/create-valid-test` go through `runAsSections`**, and
`buildCreateTest` adopts into the live registry by walking the same pairs, so a section
cannot land under a name the written form does not use. A run kept from before this reads a
plain-text `from` as bytes, so the playtest slot still opens.

**An ending save is permission, not obligation.** `KeptRun.ends` exists so any harness could
supply one, and none does: a run's product is the player's notes rather than a state pin, an
always-on end sheet would be exactly the recorded-figure churn the queue already warns
about, and — decisively — `dsl.test.ts` refuses `expect only:` as a claim in words, so an
automatic end sheet would mint corpus-illegal tests by construction. Where one *is* written
it lands as whole-sheet `expect:`, which is the one form that can say a key the state has
stopped holding.

**A stat's tab is its `# group`, and no list of tabs exists.** `# stat` carries the same
`GROUP_FIELD` `# item` and `# entity` already write, `statRow` publishes it through the
generic `grouping()`, and `statTabs` derives the strip from the groups the rows carry in the
order the view publishes them — so the first tab is the group of the first `# stat`, and
moving a stat between groups moves it between tabs. `# group measure` stands
`standard for: stat`, which makes *every stat is on a tab* true by construction and is
already covered by the claim `dsl.test.ts` derives for every kind that names a group.

**A declared name is drawn whole, and `NAME` in `src/ui/sheetLayout.ts` is where that is
decided.** Every `truncate` on a name is gone from `Ledger`, `SkillsPane` and `PlaneModal`;
`LAYOUTS` is the same object as the `Layout` type, so a fixture long enough to wrap is drawn
in all three layouts and a fourth has to answer it. The sweep derives its subjects: a file
that takes `NAME` may not write `truncate`.

**A stat's shares are reached by `/stat <id>`, the way a quest is reached by `/quests
<quest>`.** `stat-breakdown` is an ordinary `MODAL_SCREENS` entry with a `stat` `Focus`, so
the app, the terminal and a recorded run reach it by one line, and `/stat` with no id lists
every stat with its group's word — which is what put `stats[].group` in front of all three
drivers instead of into the parity excuse list.

**Tulsa holds the whole region and `combat-expansion` is a list of jewels and items.** Its
`# info` names `core` alone, and it loads *before* `tulsa` rather than after it — which is
the test of whether that separation is real, because a module about archetypes used to pull
the whole town in behind it. The 254 lines that left it were its locations, its entities and
the seven routes that walked them; those routes are `tulsa.*` tests now, because they stand
in tulsa's own proving ground.

**The proving ground is a walled yard north of the forge, and the beach is gone.** The yard
is the town's fixture, there whatever else is loaded, rather than a square borrowed from the
market. The beach has zero references left in `content/`: the guide house opens straight
onto the market square, still gated on `front-door.unlocked`, and **the window still lands
somewhere that is not through Miki** — the market square now, with its words rewritten
rather than left describing sand that is not there. The world declares 32 locations.

**A derived claim count shrinks when the world does, and that is not lost coverage.** Cutting
one location took four claims with it, because several proofs take their subjects from every
location the corpus declares. A test count that falls with a content cut is the proofs doing
what they were built to do.

**What is said arrives a line at a time, and that is a player preference rather than a
manner.** `SETTINGS.reveal` is one declaration in `src/runtime/settings.ts` and the engine
branches on none of it; `src/ui/reveal.ts` holds the three numbers to tune and the two words
of the declaration the app knows. **It is deliberately not a fourth `Declared` axis**, and
the argument is worth keeping because it will be proposed again: all three existing axes are
spent in `layerOf` and a pace costs no pixels, so crossing it in would double `EVERY_MANNER`
to eighteen members producing nine distinct layers; there is no shipped subject, because
every screen a player opens carries `said: []` and only a screen the world raised in the
step that said the words draws a beat at all; and the case it would have served is already
answered by `showsTheBeat`, which withholds a beat from a `clear` or a `fill` screen. A pace
is a property of the words, not of the screen.

**The transcript does not wait.** The reveal is the beat's alone. `Home.tsx` rests the log on
`startedAt`, the line the turn began on — which would be a line nobody has read yet if it
were still arriving — and a record does not wait for the thing it is a record of. When a
screen is up the transcript is scrimmed anyway, so nothing double-plays. `.spoken` sits in
the `prefers-reduced-motion` block, so reduced motion lands a beat whole with nothing in
TypeScript knowing about it.

**The player's swing varies because the arm does, not because the blade does.**
`# entity player` declares `attack 8-12` where it declared `attack 10` — the midpoint is
unmoved, so nothing the engine *plans* with moves (`statValue` reads midpoints) and only the
swing varies. Three reasons the spread is on the body, kept because the other reading will
be proposed again: the engine has **one** mechanism for a spread, a `Range` on a stat, and
`giant-rat` writes its own `attack 6-8` in exactly that place, so a weapon spread would make
the player the one actor whose swing does not read off its own sheet; **it has to survive
being unarmed**, and the only fight the tutorial ships is the cellar, fought bare-handed;
and `addRanges` shifts both ends, so a melee level and a weapon's `+n attack` compose onto
it and *base plus level* reads straight off the line. The corpus claim picked the player up
with **no edit**, because it already filtered shipped entities whose declared attack is not
a point.

**A ranged stat draws one `nextRandom` per swing where a point draws none, so giving
anything a range shifts the seeded stream and moves every recorded figure downstream of
it.** That is a standing cost, not a one-off: every foe given a range in the balance pass
will move the routes again. It is also why a regenerated route is re-derived from what it
now measures rather than patched — the rage pool reads its ceiling less what bled instead of
the ceiling flat, and a `1 in 4` gate rolls differently off the shifted stream.

**`melee-combat` is `continuous`, which is the whole of what makes a fight chain.**
`standsAgain` → `enterEncounter` re-arms a repeating action on the next foe standing in the
room, and melee simply did not ask for it. Nothing about a swing moved when it did: all four
combat sheets came back with exactly one key changed, `activeAction.repeating`.

**A node that must hand something over once says it with `again:`, never with `sticky`.**
`sticky` replays a node whole, *results and all* — `finding-your-feet.apologised` handed out
a fishing net per talk because of it. The pair the engine already has is the answer: the node
says its piece once and every visit after gets the `again:` line, so the offer still stands
as long as the stage does without the gift repeating.

**A dialogue node's `open modal:` lands under the conversation, not over it.** `session.ts`
steps the whole node — effects included — and *then* pushes `dialogueFrame(cursor)`, so a
screen a line opens is what the player finds when they have read the speaker out and pressed
Continue. Nothing is thrown at anyone mid-sentence, and that is the engine's ordering rather
than something a caller arranges. Write `open modal:` **last in the node body** so the
engine's *A screen opens: …* notice lands after the last thing said instead of between two
of them. Miki's gear hand-over is the first use of it in dialogue; it had only ever been on
an action before, and no component needed editing because `modals.ts` publishes `topModal`
alone.

**`carried-items` is the only screen `open modal:` can name that holds an item**, and
everything an on-ramp wants is reached from inside it: the chosen item's `examine:` words
are the heading, **Equip** is a verb on it, and an item's plane is the **Skill Tree** verb one
step further in. An item's own screen is a second option row on that one, and `item-plane` is
a frame `openModalNamed` explicitly refuses to open by name.

**A fight named on a foe that is not standing here is refused in the player's words.**
`whyRefused` takes the target as an input and asks `isStanding` — the same function
`standing()` backs, which is what `locationChoices` builds every room offer from, so this is
one reading with three callers framing their own questions, not three readings.
**`standsAgain` is deliberately not reused**: its `!action.depletes` guard is about whether a
re-arm has a foe left to count down, and carrying it into arming would exempt exactly the
case that wants refusing. The words are `engine.target.absent` — *"There is no {target}
here."* — bland because it has to be true both of a foe felled out of the room and of one
that was never in it.

**Only a directive could reach that case, and that is why the offer path needed nothing.**
`locationChoices` iterates `standingHere`, so a felled foe offers *nothing at all* — no
fight, no talk, no shop — and that is neither `hidden if:` nor a refusal: the entity is
simply absent, and `hidden if:` removes an action rather than an entity. `apply` and
`beginAction` throw `unavailable choice` for an id the view did not publish, so no button can
reach the refusal. A directive names an id outright and reaches past the offer list, which is
the whole of the difference.

**Nowhere is not elsewhere, and only elsewhere can be refused.** `armAction` asks the same
question of an entity whose action a directive names that `armFightAction` asks of a foe, so
`use: entity.<felled-foe>.<action>` is refused in `engine.target.absent` — *"There is no
{target} here."* — exactly as a fight on it is. The question is **`isElsewhere`** in
`src/runtime/population.ts`: the world places this entity somewhere, **and** it is not
standing here. **The second half alone is the obvious widening and it fails 26 tests**,
because every one of them names an entity *no room stands at all*: `tulsa.smiths-chest`, the
`DEBUG` chest that is the only route to a cluster plane; `# entity player`, which is not in a
room because you are it; and four fixture levers that exist to be named by a directive. An
entity the world places nowhere has **no room to be missing from**, so *where is it, then*
has no answer to give rather than the answer *not here*. `entitiesStood` already draws that
line for the load-time rule about what a room stands, so this is one reading with two callers
rather than a second one.

## The tools

- `npm run probe -- content --test <id>` runs one `# test` in about a second.
- `npm run oracle` prints the grammar; `--at <draft>` reads a draft against the
  world, **answering with the refusals and the verdict only** — the per-line
  reference walk is `--walk`, which takes the line you are stuck on and is
  thousands of lines without one. A draft is the module its own `# info`
  declares, so `--at` answers for a file that already ships by replacing the
  shipped copy rather than colliding with it.
- **An action field's writable shapes are its parser's own**, and every action the
  corpus holds is printed back and held to them in `dsl.test.ts`. Restating a
  shape beside the parser is what let `damage:` offer only the `vs` half, hid
  `continuous` entirely, and left an action's bare stat-bonus clauses off the page
  while all three shipped in `content/`.
- `npm run notes` lists every `@@@` the corpus holds.
- `npm run review [-- <module>]` is every line the game can say, under the section
  that says it; `--read-through <section>` marks a sitting as read. What has been
  read is kept in `content/reviewed.tsv` against a hash of the words, so a line
  rewritten after someone signed it off comes back marked CHANGED.
- `npm run playbot -- --save <id>` opens a run on a `# save` fixture, so a region
  has to be reachable only once.

**The set of things to review derives itself** from the locale tables the engine
builds off each kind's declared prose fields. Nothing is marked by hand to appear
on the sheet, and `@@@` keeps meaning what it means.

**The suite's twenty-three seconds are import and transform, and a corpus cache does not
touch them.** Measured 2026-08-25 by instrumenting the load path and reverting it: **692
universe loads across 14 worker processes, costing 20.4s of CPU** — about a fifth of the
summed test time, and **307 of them are one worker**, costing 13.4s. A warm shipped-corpus
load is 20.2ms median (15.9–31.9); the first in a process is 69.6ms, which is JIT. A
per-process cache keyed on the sources' own content then **removes a quarter of the
test-body CPU and none of the wall clock** — summed test time fell 95.7s → 70.9s while
wall stayed inside the 22.6–26.5s the suite already varies over. That is the answer to
*why is it twenty-three seconds*: it is not the test bodies, and it is not the corpus.

**A per-process corpus cache is safe everywhere except the five tools that rewrite the
corpus.** With the cache in, the only failures are `scripts/rename-module`,
`migrate-saves`, `move-sections`, `publish-local-changes` and `probe` — the tools that
write files and reload — and **not one engine, content or UI test.** Two things a lane
building it must know: the key has to include `ModuleSource.enabled`, because a source
switched off carries the same name and text as one switched on and collides otherwise
(24 failures on the first attempt, all from that); and `loadUniverseWithDiagnostics` hands
back a diagnostics array a caller may treat as its own.

**Test telemetry is deferred, and no lane deletes a test to make the suite faster.**
The sketch in `.planning/.scratch.md` — tracking runs, failures, mutation effectiveness
and churn per test to find deletion candidates — was weighed against the measurement and
put off: *"I would vastly prefer deferring it."* It also aims at the wrong cost. Two
thirds of the suite's CPU is import and transform, which is a function of how many test
**files** exist, not how many claims they hold — and this repo's claims deliberately
derive their own subjects, so its files hold many claims each. Deleting tests would buy
almost nothing and cost the coverage that makes the corpus safe to change.

**The human review pass is deferred until the world settles, and until then a lane fixes
dialogue directly.** The owner's ruling, 2026-08-25: *"we will directly fix all dialogue
rather than leave it unclear or broken."* So a line that reads wrong is rewritten by
whoever finds it, and drafted words are what a playtester should meet — not a `@@@` and
not a parked question. The sheet is still where he reads it all back afterwards, and a
line rewritten after he signed it off returns marked CHANGED, which is the mechanism
that makes drafting safe.

## The playbot

**A turn costs what the last turn did.** Measured: 2–6 tokens billed in per turn
against thousands of cache reads, from the second turn onward. **The prefix must
stay comfortably above 1024 tokens** — that is a caching cliff, not a style
preference, and a 932-token prefix cached nothing at all.

**One harness, several prompts.** Below the point where a prompt is selected there
is no branch on which prompt was chosen, and no branch on whether a save was
loaded. `scripts/playbot.test.ts` asserts it.

**A recorded run is a `# test`, and that is its only written form.** Both harnesses
— the app's bar and `runPlaybot` — hand back a `KeptRun`, and `runAsSections` in
`src/runtime/runLog.ts` writes it as the two sections that replay it: the `# save`
it walks forward from and the `# test` that walks it. There is no prose rendering
of a run any more. `describeEntry` survives only for the playbot's own journal
window, which is the model's in-run memory and not a record anybody keeps.

**A `# test` says what its player thought, where they went, and what bounced.**
`note:`, `expected:`, `confusion:` and `blocked:` are derived from `NOTE_FIELDS`,
which lives in `src/content/sections/test.ts` — the kind's own file — because
content cannot import runtime. Add a fifth field there and the grammar, the oracle,
the app's sheet and the model's reply schema all gain it with nothing else edited.
The playbot's *prompt* deliberately does not derive — it is a page of prose tuned
for a model, not a form label — and a claim in `scripts/playbot.test.ts` fails
until the prose for a new field is written. `page: <layer>/<subpage>` is where in
the app the player went, which the engine has no pages to honour and passes over.

**`refused` says the line above it bounced, and it is a claim like any other.**
Most recorded runs are failed runs, and that does not make them a different kind of
thing: running a `# test` reports where the replay **diverged from the record**,
and a corpus proof is the case where that report must be empty. A refusal no line
claims fails exactly as it always did; a line the record marks `refused` which now
*takes* fails too, and that is how an author sees a fix land. A `refused` standing
under nothing, under a note or under a page move is refused **at load** — the
sentence the editing page shows beside the line is literally the string the engine
refuses one with, which `dsl.test.ts` and `completion.test.ts` require of every
line a kind writes out.

**There is one walk over a test's steps.** `testSteps` flattens `run:` where it
stands and refuses a cycle once; `walkTest` walks a range of the result against a
session. `runTest` is those two and the modal check, and the app's replay is the
same two — so a replay cannot step a test differently from the way the suite runs
it. `refused` is read off the whole record rather than off the range, so a range
ending between a line and its mark still knows the mark is there.

**A replay is a function of one cursor.** The game state follows it, the page of
the app follows it (`pageAt` in `src/ui/replay.ts`), and what has been said follows
it. Scrubbing backwards starts the session over and walks forward again rather than
undoing anything, so the world at a step is the same world however the cursor
arrived. Forward is walked a step at a time, or every step would say everything the
run had said so far.

**Recording a playtest in the app is holding a run, and nothing else.** There is no
second flag saying the mode is on: the run lives in a slot, so a reload lands back
in the sitting. The saved game a run walks forward from is taken when recording
**starts**, not when the session opened — an author who plays twenty turns before
pressing start meant those twenty turns. The recorder is the app's counterpart of
`runPlaybot` and lives at the same level, in `src/ui/playtest.ts`, not in
`CommandContext`, because the playbot does not put its log there either.

**Stopping a run files it into the game.** It goes through the one load-and-adopt
path `/dsl` uses (`fileRun` in `src/runtime/runFiling.ts`), so the `# test` is in
the live registry at once and a reload finds it too — no reopen, which would throw
away the session the author was just playing. Filing lives in the runtime rather
than the UI because two derived guards say so: no `src/ui` module may name an
export of `localChanges`, and every `save.store` reach in the driver must be
exercised for refusal. A run whose starting save this build cannot read is refused
before anything is written — nothing here migrates one — and a refused run is said
and **goes on being recorded**, because the author who cannot land one has not
stopped wanting it.

**A run that stops early with honest notes is a success.** The run's product is the
player's own `expected` and `confusion`, not the moves — a run recording only moves
has produced nothing anyone can act on.

**No play surface may draw less of a live view than the others, and a derived proof
says so.** `scripts/viewSurfaces.test.ts` walks a live view into **leaf paths**
(`journal[].lines[].said`), keeps only signatures the locale declares — so ids,
enums and rounded figures drop out with no list — and requires **every** string at
a path to appear. `unansweredCommands` derives its subjects off `COMMANDS`. Both
name the path and the drivers that differ. The excuse list is **one list, not one
per driver**: an excuse for a *difference* belongs to no single surface, and a path
no driver draws is one decision made everywhere and needs no excuse at all.

**A command answers all three drivers in the same words.** `scripts/lib/replLines.ts`
is that one home; the playbot used to throw `result.output` away and keep only
error-toned refusals, so `/quests`, `/state`, `/look` and `/inventory` were met with
silence — while `play-cli` had the same drift on the journal screen, and
`src/ui/transcript.ts` was a third formatter returning nothing for `status`. **The
cost is zero on an ordinary turn**: a choice or directive returns a `view` output
the playbot excuses by name, since the next turn renders the view in full anyway. A
command pays only on the turn it is run and then rides the ten-turn window — worst
case `/state`, about 620 tokens for ten turns.

**A choice says what offers it.** `choice.detail` is the entity or location the
choice hangs off, and every driver draws it; without it three things standing here
that can each be looked at read as `Look`, `Look`, `Look`.

**A run is marked reviewed by its filename, and nothing in the app tracks it.** Ruled
2026-08-25: a run whose findings have been read out into `docs/authoring-loop/` is
exported to `.planning/yonatan-playtests/` and renamed with a `-reviewed` suffix.
`content/reviewed.tsv` stays the ledger for the *writing* and was the wrong key for a
run — it is keyed by locale key, and a run is not a line. A filed run in `local-changes`
is disposable once it has been exported: `/local delete test <run-id>` and `/local
delete save <run-id>-start` drop one, and **nothing prunes on a timer**, because a timer
destroys runs the author has not exported yet.

## The world acting on its own

**Aggression already is the target selector, and no selector is being built.**
`aggressive` is a shipped `# entity` keyword; `openAggression` fires at the end of
every quiet segment, walks what stands here, keeps what is aggressive and hostile
by faction, and arms the player's own retaliation with no directive involved.
Measured: standing still in `tulsa.swamp-mire` kills both aggressive bog-lurkers
and never touches a passive mollusk. `wait: 1 until xp.core.melee >= 20` passes
naming no target at all, because the world is what opens the fight.

**`wait: until <condition>` deliberately does not exist.** `resolveUnderWay` steps
what is *under way*, so with nothing under way it stops on the first iteration —
the form could only ever succeed where the condition already held. The `1` in
`wait: 1 until …` is not a wart concealing a useful form.

**A foe has no identity, and a count is enough.** `EncounterFoe.remaining` is it. Only
play reopens this — wanting to name one individual of a kind has never actually come up.

**Two forms the language declines, and what reopens each.** *Do this N times* is unsaid:
`until <condition>` finishes one action and fails loudly when it cannot reach the
condition, so `tutorial-quests.dsl:189-191` writes the same rat line three times.
Re-engagement was offered and the owner chose the failure instead; the fourth such line
in the corpus is what reopens it. And a range is equality written twice —
`xp.thieving >= 100 and xp.thieving <= 200` is a bound stated twice rather than a bound
— which wants its own form only once somebody has written a hundred of them. Both are
facts the corpus produces; neither is information anyone can supply now.

## What the loop keeps teaching

**A claim that a shape is unbuildable is a measurement, not a reading.** The one
shape that lights the implicit countdown had a green assertion sitting in
`command.test.ts` the whole time the branch was queued for deletion as dead code;
the reading that condemned it generalised a refusal that only covers *side-naming*
actions. Before writing *nothing the engine can build does X*, build it —
`npm run inspect` drives a live run over a throwaway module in seconds, and it
answers for the shapes as well as for the corpus.

**The symptom is real and the first-named cause is usually wrong.** Seven times now
a bot or an agent has reported something true and diagnosed it one layer too low —
"health tracking is broken" was a restarted cycle, "talk is non-functional" was a
spent node, "a merged section cannot print back" was a missing landing, "this is a
balance call" was a semantic circularity, "a fight is broken and the enemy heals"
was a kill nobody announced, "a quest is softlocked" was declaration order deciding
who speaks, "the status line lies" was a figure that had never once been meaningful.
Reproduce before believing the cause.

**A bot's reading of the fiction is evidence about the writing, even when it is
wrong about the mechanics.** Two runs concluded the orbs must heal, because they
are called Renewal and Vitality; they are item modifiers. Two read the mirror
re-offering character creation as save corruption; it is permanent by design and
the player may rename themselves whenever they like. Neither was an engine bug and
both were real findings — the words were doing something the author did not intend.

**A test run read against a tree another agent is mid-write on is worthless** — one
suite went 14/32 failing then 32/32 minutes later with no edit between. Re-run
before believing a failure, and never act on a red result while another lane holds
a file the test path touches.

**A ruling can rest on a premise that is not true, and measuring beats building.**
*"An entity with no interactable actions (including examine) should be a syntax
error"* would have refused nothing and left five invisible entities standing,
because `examine:` reached no surface at all. The lane measured that and stopped
before writing code. The same session, a lane declined to build `wait: until` and
another declined a `testing.dsl`, each on a measurement rather than a taste.

**A test declares what it swings with, so a rebalance cannot quiet it.**
`# item million-attack-hammer` and `# item eight-a-swing-hammer` live in the module
of the test that swings them, marked `DEBUG` — not in a testing module, because a
file the load path has to be told to leave out is a rule someone has to remember,
while a section that says what it is carries its own answer wherever it is written. `-100% attack` scales base *and* bonuses to nothing, so the swing
is worth the engine's floor and an `on hit: drain:` is the whole damage: genuinely
independent of any player-side balance, which `+N attack` could never be.
`npm run mutate` is what proves a test discriminates — deleting `useFight`'s
advance branch is killed by exactly one test in the suite.
