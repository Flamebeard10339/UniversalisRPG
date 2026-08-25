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

**Travelling shows no progress on the map.** From the first run: *"The map doesn't
show a progress of how far along the travel is, so it reads as a bug like the game
is frozen."*

*Moves when: flat-band travel lands — the item carrying that says this may close with
it — or the owner says a three-second walk still wants a figure.*

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
