# What is still wrong that needs Yonatan

The queue nobody else can take. Everything here is open; nothing here is done. **A
line is deleted the day it closes** — not struck through, not annotated, deleted —
and if what it settled is something a later agent could get wrong, one sentence
about it goes in `settled.md` instead. Git holds the reasoning, and the commit that
closes a line is where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here waits on the owner: his play, his reading of the writing, or a
ruling nobody else can take. **Under each line is one italic clause saying what
would move it into `open-agent.md`** — the decision that is missing, named — or
saying plainly that nothing would and why. The clause is deleted with the line it
belongs to. A line that arrives here from `open-agent.md`, because a lane got into
it and hit a judgement that is his, carries that same clause written out of what
the lane had already measured. `deliverable-log.md` states when a line crosses, in
both directions.

---

## The next stretch of work, in order

Everything under this heading is the owner's, and the order is theirs.

**1. A playtest is not marked reviewed anywhere.** Asked for by the owner beside
item 2: *"Need to have a way to mark a playtest as reviewed."* A run now files
itself into `local-changes` as a `# test` when it is stopped, so the runs pile up
with nothing saying which ones somebody has already read the findings out of.
`content/reviewed.tsv` does this for the writing and is keyed by locale key, which
is the wrong key for a run. *Closes when:* an author can see, of the runs standing
in `local-changes`, which they have been through.

*Moves when: the key and the surface are ruled — what a run's reviewed mark is
keyed by, and where an author sees it. The ledger and the check are headless once
that is said.*

**Nothing ever removes a filed run.** Each stopped run mints its own id from the
clock, so `upsertLocalSection` never replaces one and `local-changes` grows by two
sections per playtest, forever. An author who plays daily carries every run they
have ever played into every load. *Closes when:* a run can be dropped, or filing
prunes.

*Moves when: the owner rules which of the two, and to what depth if it prunes —
either is engine work with a test behind it, and neither can be guessed, because
one of them destroys runs the author may want.*

**2. The author's own playtest, and the list of problems it produces.** The first
one is `.planning/yonatan-playtests/`. Its findings are under *For the human review
pass* and *Ours, and small* below. A second round of play, on and off across several
runs and **not recorded through the playtest tool**, is under *The owner's play, and
the game it asks for* — a list of wants rather than a run, so it does not discharge
this item.

*Nothing moves it: it is a playtest, and it is his.*

**3. Then author each quest in order, with playbot testers in a loop.** Ten quest
notes in `.planning/planning_quests/`, deliberately not levelled up before now —
how much outline detail the loop actually needs is what the runs were meant to
measure. The runs are cheap and the fixing is not, which is the asymmetry to plan
around.

*Moves quest by quest, when the owner says a note is levelled enough to author
from — how much outline detail the loop needs is exactly what item 2's runs are
meant to measure, and the writing that comes out is his to accept either way.*

## The owner's play, and the game it asks for

Written 2026-08-24, out of playing on and off across several runs. **None of it was
recorded through the playtest tool**, so no `# test` stands behind a line here and the
turn each came from is not recoverable. The rulings the rest of it turned on were taken
2026-08-25 and the lines crossed to `open-agent.md` carrying them; what is left here is
the one want nobody has put a number on.

### Chat readability, and the information dump

**Dialogue does not animate.** A typewriter reveal. **Explicitly low priority.** The
chat's sizing was ruled beside it and deliberately left this unbuilt — text appears at
once — so nothing now depends on it.

*Moves when: a reveal rate is named. The mechanism is not in doubt; how fast it reads
is the whole of the question.*

## A quest cannot hold all of its own state

**Deferred by the owner** in favour of the smaller members. The ruling stands:
everything related to a quest belongs inside the quest file. Nothing today lets it.
`tulsa.mirror` sets `mirror-done` and `tulsa.giant-rat` sets `rats-killed`; both
are read only by `tutorial-quests`, and neither can move there, because `tulsa`
does not depend on `tutorial-quests` and the engine refuses the upward reference:

    town [town] resolve: # entity town.mirror action "look in" set: names
    errand.mirror-done, but errand is not this module or one of its dependencies

A `# quest` hands **dialogue** to an upstream entity and cannot hand it an
**action**, so moving the flag by moving what sets it does not work either. The
corpus has zero `+` field edits and this is not an argument for inventing one.

*Closes when:* a quest module can own a whole interaction on an entity declared
upstream of it. Until then the two flags stay where they are. Entity-private flags
(`tulsa.mirror.done`) would work today and were rejected: they re-home the flag
without re-homing the quest, which is the requirement.

*Moves when: the owner un-defers it. The language design after that is engine work an
agent can take and prove; the deferral is the only thing holding it here.*

**`sewer-toll-paid` is read and never set.** `castle-yard`'s road to
`sewer-entrance` is gated on it (`content/tulsa.dsl`) and nothing in the corpus
sets it, so that road is unreachable. It is Larry's toll and belongs to a quest
that is not written; it closes the same way.

*Moves when: Larry's toll is written, or the owner rules the road may be cut instead.*

## Prose nobody can reach

The class is closed and what is left is one decision. `src/runtime/proseReach.test.ts`
holds every field a kind declares as prose to being said to a player, subjects taken
from `textFieldsOf` crossed with the corpus's own values, evidence from a sweep that
stands the player in front of everything the registry declares. Two fields the engine
has no surface for are named in a guarded list, and one of them is a live question:

**`# faction` declares a `title` no call site in the engine ever reads.** A faction is
the bitmask `factionBits` builds in `src/content/load.ts`, and nothing in `src/`,
`scripts/` or the app ever names one to a player — so two generated lines sit on the
review sheet that no player can reach, forever. Measured: dropping `title` from
`src/content/sections/faction.ts` leaves `tsc` clean, loses exactly one derived test
and adds no failure, and takes two lines off the sheet. *Closes when:* a faction has a
surface, or the field goes and its entry leaves `NOT_SAID`.

*Moves when: the owner rules whether a faction is ever named to a player. If it is not,
dropping the field is a measured, headless change already costed.*

**`event.title` has exactly one reader**, `engine.stopped.event`, reached only off an
action's `stops on:` — and the corpus writes no `stops on:` at all, since `on death:
stop` is a result and not a stopper. So it is excused rather than dead, and the excuse
fails the moment the words reach a screen.

*Nothing moves it while it stands: it becomes work the day a `stops on:` is authored,
which is a fact the corpus produces rather than information anyone can supply.*

## For the human review pass

The long pole, and it is the owner's. `npm run review` is the sheet and
`content/reviewed.tsv` makes it resumable.

- **The orbs read as healing items.** Two independent runs concluded Orb of Renewal
  and Orb of Vitality must restore health. They are item modifiers. Their `examine:`
  lines were improved; whether that is enough is a reading question.

  *Nothing moves it: whether the words still read as healing is a reading, and reading
  is what this pass is.*

- **Fourteen lines of player-voice writing went with `hint:`.** None was folded into
  a `log:`. Whether any of it should be is a writing decision.

  *Nothing moves it: whether player-voice writing belongs in a `log:` is a writing
  decision, line by line.*

- **Miki says *"There's a mirror upstairs"* while standing in `guide-house`**, which
  is where the mirror is (`content/tulsa.dsl:1032`). Pre-existing, and squarely the
  kind of thing that made two runs think the mirror was broken.

  *Moves when: the owner writes the line that should stand there. Landing it is then a
  content edit.*

- **The player's death line changed** to cover being carried back to the start, so
  it returns to the sheet marked CHANGED. That is the mechanism working.

  *Nothing moves it: it is a line standing on the sheet waiting to be read.*

- **Five scenery entities became reachable** when `examine:` became an action —
  `drunk-patron`, `outfall-grate`, `sewer-signs`, `sewer-hatch`, `dumped-crates`.
  Their prose has never been read by a player and has never been read in place.

  *Nothing moves it: their prose has never been read, and reading it is the pass.*

- **Two shipped choices are labelled with a machine address.** `modal:choose-race`
  and `modal:name-yourself` reach the player as `choices[].label`. Found by the
  parity lane, which had been passing them precisely because the label *is* the id.

  *Moves when: the two labels are written. Nobody has written words for either, and
  an agent minting them is writing without a reader.*

- **Action labels are cased two ways.** A minted `examine:` reads *Examine* and an
  authored one reads its own raw line — `ascend`, `descend`, `look in`, `open`
  stand in the same list as *Talk to Miki* and *Examine*.

  *Moves when: the casing is ruled — title case everywhere, or an authored label kept
  exactly as its author wrote it. Applying either is headless.*

- **Miki says nothing when two of his threads are open, and fixing it strands the
  apology.** Crossed from `open-agent.md` on 2026-08-25, reproduced headlessly from a
  fresh game on the owner's exact branch: talk, take *"I'd rather find my own way"*,
  refuse again, leave by the window, come back, and talking says **nothing** and draws a
  bare list labelled with each thread's first spoken line.

  It is not a spent node, which is what it was misdiagnosed as twice. A `# quest`
  stage's `tulsa.miki says:` block compiles its stage gate into the node's `when:`, and
  `isThread` (`src/content/sections/dialogue.ts`) is `when !== undefined || ask !==
  undefined` — so **every quest-given node is a thread**, including one the author wrote
  `always` on. Fifteen of Miki's sixteen nodes are threads. With two open, `talk` returns
  a cursor and pushes nothing to the log, and the list has no `ask:` phrases to label
  itself with. This contradicts `settled.md`'s own rule that a node offering only
  `always` is not a thread but what they say, and the node still records the intent —
  `always` sits beside the quest's gate, so `isThread` could read it.

  The obvious fix was measured and it costs a route. With `isThread = ask !== undefined
  || (when !== undefined && !always)`, Miki speaks in both reproductions — but
  `snubbed.miki.0` becomes an `otherwise` node offered only when no thread is open, and
  `adrift.miki.0` is `sticky` on a flag that never goes false, so **a player who snubs
  Miki and then steps outside can never apologise again** and the whole `apologised`
  route is stranded. The suite would not catch it: `apology-route-full` apologises
  before ever leaving the house. Today's ugly thread-list is what keeps that route
  reachable.

  *Moves when: the owner rules what talking does when a quest stage's `always` line and
  another quest's `when:` thread are both open on one entity. Three answers were costed
  — say the `always` line and then list the threads; keep the list but give quest nodes
  `ask:` phrases so it reads as a conversation; or make `always` non-thread and rewrite
  `snubbed`/`adrift` so nothing is stranded. Each is a writing decision with different
  content consequences, and the engine change is one line once it is taken.*

- **`leave-tutorial-island.adrift` opens on a premise that is false.** Found in the same
  reproduction. Its gate is `tulsa.market-square.discovered`, and the module's own
  comment justifies it as *"a place that is only discovered by having stood in it."*
  Discovery spreads to adjacent locations, so landing on the beach one step out of the
  house sets it — measured `true` immediately after `climb out`. Miki says *"So you found
  the market"* to a player who has never left the sand, and this is what opens the second
  quest early enough to collide with the item above.

  *Moves when: the owner says what should actually gate that stage — standing in the
  market is not a fact the corpus can currently state, so this is either a new condition
  or a different line. The measurement is done either way.*

- **Cluster planes are now unreachable in `tulsa`.** The smith's chest was the tutorial
  on-ramp to them and it is `DEBUG` now, as asked. `combat-expansion`'s `armourers-chest`
  still hands out jewels and whetstones so the mechanic is playable, but nothing in the
  town introduces it.

  *Moves when: the owner says where the on-ramp should be instead — or that the whetstone
  ruling in `open-agent.md` removes the need for one, since gear that drops carrying its
  own points needs no chest to hand out whetstones.*

Everything below is from the first run somebody played, 2026-08-23, and is quoted
from what they wrote at the turn it happened.

- **Miki never says to find the mirror.** *"He asks if you want him to show you the
  ropes."* The quest's opening reads as though he did.

  *Moves when: the owner writes what Miki should say instead; the words are the whole
  of it.*

The eight marks the corpus holds are `tulsa` entities waiting on quests that are
not written — the anvil on A Grand Blade, Oolga's counter on Kill it with Fire, the
hive mouth on Birds and the Bees. Those close when the quest modules arrive.

*Moves with the quests: these close when the modules that answer them are written,
which is item 3 at the top of this file.*

## Balance nobody has played against

Every number here was reasoned about and none was played against.

**28 slots has had no play behind it.** The fullest shipped `# save` is 13 rows.

*Nothing moves it: only play says whether 28 is the number.*

**Which stat each race raises is an agent's guess**, not a ruling: human
max-health, elf accuracy, dwarf defense, orc attack. Evasion and regeneration were
unusable at +5% of 0 and of 1.

*Moves when: the owner rules the four. The edit is one line each.*

**`# skill melee` and `thieving` carried an inert `stat-id: attack`** with no
`per-level:` anywhere, folding nothing. The dead declarations were deleted. Making
either live is now one line (`tags: +1 attack per level of melee`) but it is a
combat balance change.

*Moves when: the owner rules whether either folds into a stat. It is one line, and
the line is a balance change nobody has played.*

**Hardcore mode has never been played.** Death empties the pack and everything worn,
which is a whole run's worth of consequence nobody has felt yet. Default off.

*Nothing moves it: a run's worth of consequence is felt, not read.*

## Ours, and small

**Two paths holding the same words at the same moment cannot be told apart.** Crossed
from `open-agent.md` on 2026-08-25 by the lane that fixed the other two parity lines.
The proof counts per moment and credits a path only beyond what already-proved paths
account for, and it still cannot see `choice.detail` going missing: mutating
`formatChoices` in `scripts/lib/replLines.ts` to drop it passes the suite. Measured at
`/look` in the Guide House, `choices[].detail` and `entities[].title` hold *identical*
word sets — Miki, Front Door, Stairs, Mirror, Oven, Smith's Chest — so neither is ever
proved, which needs a word with exactly one bearer, and the one occurrence in the
`Here:` line credits both.

The cheap rule that closes it — a shared word must be drawn once per bearing path —
does fail the mutant, and raises three false alarms on a clean tree: `location.title`,
`planes[].name`, `action.label`. None is a bug. `location.title` / `discovered[].title`
/ `locations[].title` are three names for one place, and `carried[].name` /
`planes[].title` / `planes[].name` are three names for one item, where drawing it once
is right. So two paths bearing one word are sometimes two showings that must both
appear and sometimes one fact reachable by several names, **and nothing in the view
distinguishes them** — no counting rule over the rendered text can, because the same
evidence supports both readings. The line's own suggested close does not work either,
and that was checked: a per-line unit gives the same answer, because `location.title`
and `discovered[].title` share a chunk for exactly the reason they share a word.
*Closes when:* an alias and a distinct showing can be told apart.

*Moves when: the owner rules whether the view may declare which paths are aliases of
one fact. If it may, the demand rule above is correct and cheap, and the three false
alarms are exactly the alias groups — they look declarable. If it may not, every driver
has to report its text keyed by the subject it hangs off, which is a change to all
three drivers rather than to the harness, and is the expensive path.*

**Travelling shows no progress on the map.** From the first run: *"The map doesn't
show a progress of how far along the travel is, so it reads as a bug like the game
is frozen."* Flat-band travel has now landed at three seconds, which was the condition
this was waiting on, so the question is only whether a three-second walk still reads as
a freeze.

*Moves when: the owner walks one and says. Nothing else can answer it, and the item that
was going to answer it has landed.*

**`accepts: any` is the default and no shop in the corpus says otherwise.** So
every counter will buy anything carrying a `value:`, and pricing four items changed
what three shops do without touching a shop. Item pricing and shop policy are one
decision written in one place, and nobody reading a `# shop` can see it.

*Moves when: the owner rules whether a `# shop` has to say what it accepts. Making the
effective policy readable off the shop is headless after that.*

**Two-thirds of the suite's CPU is not test bodies.** Measured at 32 competing
processes: 312s of import and 148s of transform against 176s of test time, across
152 files. No amount of making a test body faster moves that, `pool: 'threads'`
makes it worse, and it is a function of how many test *files* there are. Beside it,
~450 full loads of the shipped corpus, ~105ms each idle and ~220ms under load —
about a quarter of all test time, with a flat profile and no hot spot, growing with
the corpus and with the UI. *Closes when:* somebody decides what the suite's cost
should be a function of.

*Moves when: that decision is taken. The item's own closing clause is the missing
information and more measurement does not supply it.*

**Removing a feature costs what its declaration was copied into, and the copies are in
the fixtures.** This answers what the owner wrote under the whetstone line — *"it would
be nice if these kinds of balance refactors cost less… some effort to reduce the work of
removing features would be nice."* The lane that removed it kept count. **57 files: 25
non-test, 32 test.** Nine non-test files genuinely encoded a whetstone fact — the items
and the cache, the three modules that used them, the engine's words, the field, the
directive, `feedItem`, the plane move and the panel.

Five were touched only because the same fact was spelled a second time, and they are
worth naming because they are a chain: the verb set is declared in
`sections/test.ts` and then re-listed by two `case 'feed':` arms in `session.ts` and a
third dispatch in `growth.ts`; and one engine word travels engine key → `locale.ts` row
→ `labels.ts` id → `planePanel.ts` channel → JSX, so four files move for one word.

**But the multiplier is the fixtures, and it dwarfs the rest. Seventeen test modules
each declared their own `# item whetstone` with its own `item-experience: 1000`** —
`itemInstance`, `modals` ×3, `session` ×2, `item`, `carriedItem`, `carriedScreen`,
`clusterEffect`, `command`, `equipment`, `growth`, `itemContribution`, `pack`,
`planeReport`, `planeScreen`, `stat`, `trade`. Deleting one feature meant deleting
seventeen copies of its declaration and rewriting whatever each fixture proved with it.
A shared, derived fixture world would have made those seventeen into one.

*Moves when: the owner says a shared fixture world is worth building. It is the one lever
measured to matter, it is a large piece of work, and it would change how nearly every
test in the repo is written — which is exactly why nobody should start it on their own
judgement. The engine-word chain is the smaller second answer and could be taken
separately.*

**Three balance numbers and one policy came out of the item-level lane and none is the
owner's.** The rolls are `iron-sword 3-8`, `heartwood-blade 12-18`, `proving-blade
6-10`; the rolling passives are Keen Eye `+4-8 accuracy`, Quickstep `+6-10 evasion`,
Fortune `+3-8 luck`. They were chosen so the corpus's routes have points enough and so
at least one rolled payload is actually walked, and each is a one-line edit.

Beside them, a consequence measured rather than assumed: **gear is now unsellable and
`value:` on a base is inert.** A shop takes from the stack and a base never joins one,
so `iron-sword` still carries `value: 24` and no counter will ever price it.
`trade.test.ts` asserts the refusal, so the behaviour is pinned rather than accidental.
This is the same question as *What a shop pays for a grown copy* further down, which is
now the only shape a gear sale could take.

*Moves when: the owner rules the six numbers, and says whether a counter should learn to
take a copy. The numbers are one line each; the counter is engine work that `Trade`
carrying copy identity would open.*

**A re-read and a node that has fallen silent still cannot be told apart, and the cause
is not what it looked like.** Crossed from `open-agent.md` on 2026-08-25 as the half of
the examine-mask line the mask does not close. The mask closes *have I read this* — a
thing wearing its own name is read, a `?` is not. The other half was reproduced rather
than guessed: repeating `talk:` says a sticky line every time and a spent node simply
stops being offered, and repeating an examine always says the same words. **The silence
is the transcript.** `appendOutputs` merges an identical consecutive line into the entry
already held and bumps `repeats`, which `Line` draws as a `(2)` on the line above.
Measured on the shipped mirror: examine twice gives `entries=4, repeats=1`; a third time
gives `entries=4, repeats=2` — nothing moves at the bottom of the log, which is exactly
*a third time says nothing at all*.

*Moves when: the owner rules which of two. Either a re-read that collapses says something
of its own — an engine line to the effect that this has been read already — or the
collapsed line moves to the bottom of the log so the count is where the player is
looking. Both are small; neither is derivable.*

**Autosave ships as *never*, so the app opens on what it last wrote and a player who
never types `/save` still has nothing to open on.** The reload half is done — a session
now resumes the live slot, and a save this build cannot read is kept rather than
overwritten. What is left is the shipped cadence: `DEFAULT_AUTOSAVE_SECONDS` is `0`, and
measured through `createDriver` over the standing corpus, three turns spanning three
minutes write nothing at all. The GUI offers no control that sets one either.

Setting it to a real number was tried and reverted, because it is not the one-constant
change it looks like. At 60 seconds, four proofs fail, and one of them says something
worth knowing: a session that did not come out of the live slot immediately draws
*"autosave held: slot player — this session did not come out of that slot, so autosave
will not write it"* on the player's first turn. That warning is right when an author
typed `/autosave` and is noise when nobody asked for a cadence at all — so turning
autosave on by default surfaces an author's warning to a player, and the two readings
of `held` would have to be separated first.

*Moves when: the owner names the shipped cadence, and says whether a held autosave
nobody asked for should be silent. Both halves are then headless — the number is one
constant and the silence is one branch, and the four proofs that encode `never` are
named above.*

**`/create-test` still cannot go through the one writer, and what stops it is a contract
nobody has written.** Crossed from `open-agent.md` on 2026-08-25. The cycle that was
blamed is gone — `outcomeOf` and `refusedLine` moved down into `command.ts`,
`layer-check` exits 0, and `buildCreateTest` reads `startSaveId` so the one fact the two
writers disagreed about has one home, with a sweep requiring `runLog.ts` to be the only
file minting a `-start` id. But `runAsSections` still is not the writer for the sections
themselves, on the two counts the original line named, and neither is a decision a lane
can take:

- `/create-valid-test` appends `expect: <id>-end` and a second `# save` that a `KeptRun`
  has nowhere to put. Appending to the test block is easy; **whether a recorded run may
  have an ending save at all** is the question.
- A history already opening with `load:` deliberately emits no start save. `KeptRun`
  cannot say that — `from` is the bytes, and in that case the session *did* take a start
  save; the command simply declines to write it, because the author's own `load:`
  already places the replay. Saying it needs `from` to become *bytes, or a `# save` the
  corpus already holds*, which changes a type the app's playtest slot serializes.

The lane's judgement, worth keeping: routing only the common case through
`runAsSections` and slicing its output by index for the other two would be worse than
what is there now.

*Moves when: the owner rules whether a recorded run may carry an ending save, and
whether `KeptRun.from` may name a `# save` instead of holding bytes. Both are one-line
answers and the engine work after either is ordinary.*

**A pack reorder has no terminal control, and the save version was not bumped for it.**
Two loose ends from the pack-order lane, neither of which blocks anything. The `swap:`
directive is how a rearrangement records and replays, and a REPL player can type one, but
nothing lists their pack keys except `/state` — so the order is a thing the app can drive
and a terminal can only replay. Separately, `packOrder` was added to the save without
bumping the version: it is additive with a sparsest of `[]`, so all 32 corpus fixtures
read back identically, and bumping would have meant a `migrate-saves` run across every
`# save` body for no behavioural gain. Both are stated in the lane's commit messages.

*Moves when: the owner says whether a terminal needs to reorder a pack at all — it may
simply not be a terminal thing — and whether he wants the version bumped for tidiness.
The bump is one line plus a migrate run.*

**Two xp gains at once now read as two pills, not one line.** A turn granting `+5
Attack` and `+5 Defence` used to fold into one pill, `+5 Attack, Defence`, because the
old notes grouped by amount. A notice is now words and a merge key with no discriminant,
and merging under the key alone is what makes adding a notification a line rather than a
shape — so the grouping went, deliberately, as the mechanism the ruling asked to delete.
Six rat kills still land as one line, because they share a key.

*Moves when: the owner says whether he wants the grouped reading back. If he does, it
belongs in `sayingOf` over notices that share a count, not in the notice type — the
lane costed that and it is small; what nobody can decide for him is whether two pills
read worse than one line.*

**Two GUI wiring lines are untested and want the author's eye** — the two identity
rows at the top of the Stats page, and the cadence a running replay steps at.
Everything the replay decides is proved (`src/ui/replay.test.ts`, and the cursor
through the driver in `src/ui/playtest.test.ts`); what nobody has watched is the
tick itself, the bar, and whether 0.3s is the right default once a run with a long
stretch of `page:` moves is played back.

*Nothing moves it: the line is a request for the author's eye, and whether 0.3s is
right is answered by watching a run back.*

## Left by the core/tulsa split

**`combat-expansion` and `tutorial-quests` depend on `tulsa`.** Each names one thing
that moved — a road to the beach, and Miki — so a module about archetypes and a
module about a quest both load the whole town. `combat-expansion.proving-ground`
sits at `tulsa.market-square`'s own square and hangs off the beach for want of
anywhere better. Map churn for the hardening pass; a playtest names it better than a
reading does.

*Moves when: a playtest names where the proving ground should stand. The item says a
reading does it worse, and that is why it is here.*

## Open questions, not yet work

**A range is equality written twice.** `xp.thieving >= 100 and xp.thieving <= 200`
says it, which is a bound stated twice rather than a bound. Whether that wants its
own form is a question for whoever first writes a hundred of them.

*Moves when an author has written enough of them — a fact the corpus produces, not
information anyone can supply now.*

**A repeat-N form.** `until <condition>` finishes one action and, since the
terminator ruling, fails loudly when it cannot reach the condition — so *do this a
hundred times* is still unsaid, and `tutorial-quests.dsl:189-191` still writes the
same rat line three times. Re-engagement was offered and **not** taken: the owner
chose the failure. Reopen when an author writes the fourth such line.

*Moves when the fourth such line is written; the owner has already declined once, so
nothing short of the corpus asking again reopens it.*

**Should a foe ever have identity?** Ruled: no, a count is enough, and
`EncounterFoe.remaining` is it. Reopen only if wanting to name one individual of a
kind ever actually comes up in play.

*Nothing moves it: it is ruled, and only play reopens it.*

**What a shop pays for a grown copy.** Today it does not deal in them at all — not
offered, not sold, `not-carried` if asked for by name. Making them sellable means
the price answers to the instance's own modifiers and plane, and `Trade` carries no
copy identity, so it is real design rather than a line change.

*Moves when: the owner rules what a grown copy is worth at a counter. `Trade` carrying
copy identity is engine work after that.*

**Should worn gear take a slot?** It does not. The ruling said "the length of the
inventory list", `state.inventory` literally excludes worn and grown, and worn gear
is drawn under its own heading. If it should, equipping one of a stack of three
starts being refusable.

*Moves when: the owner rules it. Refusing to equip one of a stack of three is engine
work the moment he says yes.*

**Whether picking a colour needs guidance.** The want was a colour wheel **and
guidance with it** — a constrained palette, or one control moving saturation uniformly
— because the owner does not want to learn colour theory to change the game's colours.
Ruled deliberately not now: a plain picker ships with the group colours, and whether a
free choice actually goes wrong is a thing the corpus answers by having colours in it.

*Moves when an author has picked enough colours to say whether the free wheel was a
problem — a fact play produces, not information anyone can supply now.*
