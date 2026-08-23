# What is still wrong

The queue. Everything here is open; nothing here is done. **A line is deleted the
day it closes** — not struck through, not annotated, deleted — and if what it
settled is something a later agent could get wrong, one sentence about it goes in
`settled.md` instead. Git holds the reasoning, and the commit that closes a line is
where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

---

## The next stretch of work, in order

Everything under this heading is the owner's, and the order is theirs.

**1. A recorded run should be a `# test` section.** Ruled by the owner after the
first run anybody played: *"Playtests have a lot of noise. It would be cool if the
output was literally a test section. Including GUI navigation and everything. All
we would need to add to a test is some kind of line which is the note / expected /
confusion / blocked."* And: *"Can we regenerate the path the player took into a
test that I can run and watch happen in real time so I don't have to press the same
mechanical buttons again and again to confirm behavior?"*

Most of the mechanism is already here and the next session should not rediscover
it. `CommandContext.recorder` already holds every line a session ran in canonical
directive form plus the save it started from, and `/create-test` and
`/create-valid-test` already write a `# test` (and a `# save`, and an `expect:`)
out of one — the app's driver builds a recorder like every other. So a run today is
recorded **twice**: once as directives that replay, once as the run log an author
reads. Those are one fact and should be one record. *Closes when:* the playtest
bar's copy hands over a `# test` an author can paste into `content/` and run, with
their own note / expected / confusion / blocked on the turn it was about, and with
a page move written as a line the replay honours.

Two things that fall out of it and are not decided:

- **A `# test` has no line for what a player thought.** It is the one thing the
  format is missing, and it is what makes the run a finding list rather than a
  script. It has to be a body line no kind's grammar holds, the way `DEBUG` is.
- **Watching a replay happen** wants a driver that feeds a `# test`'s lines at a
  visible cadence. `npm run play` runs one with `/test` and `npm run probe --
  --test <id>` runs one in about a second; neither is watchable in the app.

**2. The author's own playtest, and the list of problems it produces.** The first
one is `.planning/yonatan-playtests/`. Its findings are under *For the human review
pass* and *Ours, and small* below.

**3. Then author each quest in order, with playbot testers in a loop.** Ten quest
notes in `.planning/planning_quests/`, deliberately not levelled up before now —
how much outline detail the loop actually needs is what the runs were meant to
measure. The runs are cheap and the fixing is not, which is the asymmetry to plan
around.

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

**`sewer-toll-paid` is read and never set.** `castle-yard`'s road to
`sewer-entrance` is gated on it (`content/tulsa.dsl`) and nothing in the corpus
sets it, so that road is unreachable. It is Larry's toll and belongs to a quest
that is not written; it closes the same way.

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

**`event.title` has exactly one reader**, `engine.stopped.event`, reached only off an
action's `stops on:` — and the corpus writes no `stops on:` at all, since `on death:
stop` is a result and not a stopper. So it is excused rather than dead, and the excuse
fails the moment the words reach a screen.

## A condition cannot name a number that is not whole

**`assert:` reads integers only** (`/-?\d+/` in `src/grammar/values.ts`), so a claim
landing on a folded percentage stat cannot be exact and is forced into a band — and a
band also passes in a world where the mechanic did nothing. That is the structural
reason the vigor claim existed at all, found by the lane that closed it: it worked
around the wall by counting the stacks off a `DEBUG` tally instead of reading the
stat, which is a good answer for one test and not a general one. Every later claim on
a real-valued stat meets the same wall. *Closes when:* a condition can name a number
the engine can actually hold.

**`expect only:` is carrying a claim nobody wrote.** The vigor sheet caught both a
rebalance and a dead `quickening`, but only through incidental couplings — buff expiry
clocks shifting because the cadence shifted. The file's own instruction is to
regenerate a sheet whenever content changes on purpose, so a recording doing work no
`assert:` states is one regeneration away from doing none. *Closes when:* what the
sheet stands in for is written as a claim, or the load is measured and found to be
nothing.

**`settleHandlerDeltas` is a third pool writer that fires no event.**
`src/runtime/effects.ts` writes `store.levels[…]` directly during a settle and
deliberately never fires `on empty`, so a handler that drains a pool to nothing is
silent. It looks intentional — it stops a death handler recursing — but it is the same
shape as the duplicate just collapsed and nothing in the file says which it is.
*Closes when:* the file says which, or it goes through the one writer.

**`applyDueBoundaries` discards `segment.stopped`.** A non-repeating deterministic
action whose `on success:` carries `stop` reports *finished* rather than the reason the
`stop` named, because `endAction` is called unconditionally after `applyOutcome`.
Pre-existing and no test sees it.

**`attempts:`'s retirement message says it "bounds the action".** True only for a
non-repeating one — a repeating action's `attempts:` is a per-cycle budget, which is
what sent this queue's own line down the wrong path for a session. *Closes when:* the
message says which.

## For the human review pass

The long pole, and it is the owner's. `npm run review` is the sheet and
`content/reviewed.tsv` makes it resumable.

- **The orbs read as healing items.** Two independent runs concluded Orb of Renewal
  and Orb of Vitality must restore health. They are item modifiers. Their `examine:`
  lines were improved; whether that is enough is a reading question.
- **Fourteen lines of player-voice writing went with `hint:`.** None was folded into
  a `log:`. Whether any of it should be is a writing decision.
- **Miki says *"There's a mirror upstairs"* while standing in `guide-house`**, which
  is where the mirror is (`content/tulsa.dsl:1032`). Pre-existing, and squarely the
  kind of thing that made two runs think the mirror was broken.
- **The player's death line changed** to cover being carried back to the start, so
  it returns to the sheet marked CHANGED. That is the mechanism working.
- **Five scenery entities became reachable** when `examine:` became an action —
  `drunk-patron`, `outfall-grate`, `sewer-signs`, `sewer-hatch`, `dumped-crates`.
  Their prose has never been read by a player and has never been read in place.
- **Two shipped choices are labelled with a machine address.** `modal:choose-race`
  and `modal:name-yourself` reach the player as `choices[].label`. Found by the
  parity lane, which had been passing them precisely because the label *is* the id.
- **Action labels are cased two ways.** A minted `examine:` reads *Examine* and an
  authored one reads its own raw line — `ascend`, `descend`, `look in`, `open`
  stand in the same list as *Talk to Miki* and *Examine*.

Everything below is from the first run somebody played, 2026-08-23, and is quoted
from what they wrote at the turn it happened.

- **Miki never says to find the mirror.** *"He asks if you want him to show you the
  ropes."* The quest's opening reads as though he did.
- **The mirror's refusal is fancy about failing.** *"The message should just be:
  'You need 1000 gold to perform this action'."* It currently answers *"The glass
  shows you exactly what you are carrying, and it is not enough to be looked at
  twice."*
- **Smith's chest does not belong.** *"Remove completely. Make it a debug entity if
  necessary."*
- **Examine sits inconsistently in the choice list.** *"Sometimes examine first and
  sometimes examine second. It should be consistent. Examine second."*

The eight marks the corpus holds are `tulsa` entities waiting on quests that are
not written — the anvil on A Grand Blade, Oolga's counter on Kill it with Fire, the
hive mouth on Birds and the Bees. Those close when the quest modules arrive.

## Balance nobody has played against

Every number here was reasoned about and none was played against.

**28 slots has had no play behind it.** The fullest shipped `# save` is 13 rows.

**Which stat each race raises is an agent's guess**, not a ruling: human
max-health, elf accuracy, dwarf defense, orc attack. Evasion and regeneration were
unusable at +5% of 0 and of 1.

**`# skill melee` and `thieving` carried an inert `stat-id: attack`** with no
`per-level:` anywhere, folding nothing. The dead declarations were deleted. Making
either live is now one line (`tags: +1 attack per level of melee`) but it is a
combat balance change.

**Hardcore mode has never been played.** Death empties the pack and everything worn,
which is a whole run's worth of consequence nobody has felt yet. Default off.

## Ours, and small

**The dialogue modal hides the words it is answering.** From the first run: *"The
dialogue modal darkens the screen and I can't see the words that were just spoken.
The dialogue that just happened should also be in the modal itself."* The modal
darkens what is behind it, so the line the player is answering is the one thing
they cannot read while answering it.

**Nothing says an entity has already been examined.** From the first run: *"There
should be some sort of visual cue that I already examined this object."* Examining
twice says the same words; examining a third time says nothing at all, because the
node has fallen silent — and the player cannot tell those two apart.

**Travelling shows no progress on the map.** From the first run: *"The map doesn't
show a progress of how far along the travel is, so it reads as a bug like the game
is frozen."*

**Miki's dialogue does not appear when it should.** From the first run, turn 26,
after taking the *"I'd rather find my own way"* branch: *"Miki's dialogue doesn't
appear when it should."* Talking again redrew the room and said nothing. Worth
reproducing before believing the cause — a spent node and a silent conversation
have been misdiagnosed here twice.

**A reload starts a fresh game.** `openUniverse` calls `startSession`
unconditionally, so closing the tab or refreshing loses the session: measured by
waiting 60 seconds, reloading, and coming back at 0. `/autosave` writes the live
slot and `/restore` reads it back, so the pieces exist and nothing joins them. It
costs an author a playtest and a player their game. *Closes when:* the app opens on
what it last wrote, or refuses to lose it silently.

**`accepts: any` is the default and no shop in the corpus says otherwise.** So
every counter will buy anything carrying a `value:`, and pricing four items changed
what three shops do without touching a shop. Item pricing and shop policy are one
decision written in one place, and nobody reading a `# shop` can see it.

**A proof that loads `standingSources()` may assume no `DEBUG` section stands
there.** `translationSurvival` took its subjects from `[...shipped.items.keys()]`
while its claim was about locale keys, and only ever passed because no `DEBUG`
section had lived in `core` or `tulsa`; moving the hammers into `tulsa` broke it.
It derives properly now. Whether its neighbours carry the same assumption has not
been asked.

**A kind cannot ask for one name across modules and have its references checked.**
`ids: 'global'` reads like an id-scoping choice and is silently also an opt-out of
reference checking — `isNamespacedKind` gates both reference visits, two files away
from the comment that says what `global` means. `# modal` picked the obvious word
and got the bug; `dsl.test.ts` now refuses any global kind that anything names, so
the next one fails rather than ships, but a kind that legitimately wants both still
has no way to say so. *Closes when:* the two are separate declarations.

**A minted action squats the `# action` key space without declaring it.** The
action `examine:` mints keys its label at `action.examine.examine` through a plain
`set`, on a bare unnamespaced global id it never declares — so a module writing
`# action examine` lands on the same key and one of the two silently wins. Nothing
can refuse the squat, because the namespace was never told the minted id exists.
Pre-existing, and the same shape when the address was `look`. *Closes when:* a
minted action's id is declared where an authored one's would be.

**A locale-key move silently orphans a row in `content/reviewed.tsv`.** The ledger
is keyed by locale key, so a key that moves takes its "a person has read this"
answer with it — the row does not come back marked CHANGED, it just stops being
about anything. No file exists yet on this branch, so nothing has broken; the first
review pass is when it starts to matter. *Closes when:* an orphaned row is reported
rather than ignored.

**A repeating action with `attempts:` never reaches `on unfinished:` as a
terminator** — it fires the handler and restarts, so `grind until done` runs to the
four-hour bound. Only a non-repeating action ends by attempts.

**Two tests still live in the wrong module.** The hammers and their claims are in
`content/tutorial-quests.dsl` and neither touches the quest — they are `tulsa`
claims about its rat and its `rats-killed`. Six `DEBUG` sections move together, or
the move is refused at load: the two items, the two saves that arm them and the two
tests that swing them. A clean follow-up.

**The parity excuse on `modals[].options[].label` is keyed to a whole path.** Its
stated reason covers one narrow case — `ModalSheet`'s `onlyLeaves`, a screen whose
only answer is *close* — but because the excuse names the path, a driver that
dropped **every** modal label would pass. That path now carries an item's own words
and a jewel's, so it is load-bearing.

**Two paths holding the same words at the same moment cannot be told apart.** The
parity proof now counts per moment and credits a path only beyond what
already-proved paths account for, which caught `action.label` and the plane node
titles. It still cannot see `choice.detail` going missing, because
`entities[].title` holds exactly the same words at that moment and one occurrence
credits both. Separating them needs locality, and the three surfaces share no unit
of it: a line is a unit the terminals have and the app does not, an element is a
unit the app has and the terminals do not. *Closes when:* the harness gives each
surface a comparable unit — the thing to change is the harness, not the rule.

**The parity harness runs `play-cli` in a shape `play-cli` is never in.** `cliRun`
builds a non-driving context, so `result.live` never comes back and
`formatTick`/`formatLive` — the one place the real terminal names an action under
way — never runs. That is how `action.label` stayed invisible until this session.

**Two-thirds of the suite's CPU is not test bodies.** Measured at 32 competing
processes: 312s of import and 148s of transform against 176s of test time, across
152 files. No amount of making a test body faster moves that, `pool: 'threads'`
makes it worse, and it is a function of how many test *files* there are. Beside it,
~450 full loads of the shipped corpus, ~105ms each idle and ~220ms under load —
about a quarter of all test time, with a flat profile and no hot spot, growing with
the corpus and with the UI. *Closes when:* somebody decides what the suite's cost
should be a function of.

**A green suite under heavy load is still owed.** The lane that fixed the clock
measured green at 13 processes and, separately, green at 32 with the new clock on
the pre-split tree. Nobody has run the whole suite at 70 with the split in place,
which is where twelve tests used to fail. *Closes when:* that run is taken.

**`vite.config.ts` claims to hold the worker count and does not.** Its comment says
every route reads its clock and worker count from there. The clock is true now; the
worker count is still unset and the comment still claims it.

**A GUI wiring line is untested and wants the author's eye** — the two identity rows
at the top of the Stats page, in `App.tsx`.

## Left by the core/tulsa split

**`combat-expansion` and `tutorial-quests` depend on `tulsa`.** Each names one thing
that moved — a road to the beach, and Miki — so a module about archetypes and a
module about a quest both load the whole town. `combat-expansion.proving-ground`
sits at `tulsa.market-square`'s own square and hangs off the beach for want of
anywhere better. Map churn for the hardening pass; a playtest names it better than a
reading does.

## Open questions, not yet work

**A range is equality written twice.** `xp.thieving >= 100 and xp.thieving <= 200`
says it, which is a bound stated twice rather than a bound. Whether that wants its
own form is a question for whoever first writes a hundred of them.

**A repeat-N form.** `until <condition>` finishes one action and, since the
terminator ruling, fails loudly when it cannot reach the condition — so *do this a
hundred times* is still unsaid, and `tutorial-quests.dsl:189-191` still writes the
same rat line three times. Re-engagement was offered and **not** taken: the owner
chose the failure. Reopen when an author writes the fourth such line.

**Should a foe ever have identity?** Ruled: no, a count is enough, and
`EncounterFoe.remaining` is it. Reopen only if wanting to name one individual of a
kind ever actually comes up in play.

**What a shop pays for a grown copy.** Today it does not deal in them at all — not
offered, not sold, `not-carried` if asked for by name. Making them sellable means
the price answers to the instance's own modifiers and plane, and `Trade` carries no
copy identity, so it is real design rather than a line change.

**Should worn gear take a slot?** It does not. The ruling said "the length of the
inventory list", `state.inventory` literally excludes worn and grown, and worn gear
is drawn under its own heading. If it should, equipping one of a stack of three
starts being refusable.
