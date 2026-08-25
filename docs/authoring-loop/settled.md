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

**Talking to someone offers every thread they hold open, and the player picks.**
A thread is a node that says which moment is its turn (`when:`) or what it is
called (`ask:`); a node offering only `always` is not a thread but what they say
when no thread is open. One thread open is entered outright, so nothing gains a
click. Threads are ordered by the words the player reads, never by declaration
order — no module takes a place by loading earlier. Before this, the winner was
whichever module parsed last, which silently made an earlier quest's opening
unreachable for fifteen turns of a run.

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

**A recorded run is one line a turn and does not echo the engine back.** The author read
the answer on the screen it was said on; the model's journal is the only sight it has of
its own last turn, so `turnRecord` is handed null by one harness and a list by the
other. Notes belong to any turn, because moving between the app's pages is a turn the
engine never hears about and a player who has just navigated somewhere has something to
say about it. A run says on its first line when it was played and which commit it was
played against.

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
