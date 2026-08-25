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
would move it into `open-agent.md`** — the decision that is missing, named. A line
whose clause would have to read *nothing moves it, and no work hangs off it* is not
an open line at all: it is either a ruling, which belongs in `settled.md`, or an
observation, which belongs in git. It is deleted. A line that arrives here from
`open-agent.md`, because a lane got into it and hit a judgement that is his, carries
that same clause written out of what the lane had already measured.
`deliverable-log.md` states when a line crosses, in both directions.

---

## The next stretch of work

**Author each quest in order, with playbot testers in a loop.** Ten quest notes in
`.planning/planning_quests/`, deliberately not levelled up before now — how much
outline detail the loop actually needs is what the runs were meant to measure. The
runs are cheap and the fixing is not, which is the asymmetry to plan around.

*Moves quest by quest, when the owner says a note is levelled enough to author from.
The writing that comes out is his to accept either way.*

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
stands the player in front of everything the registry declares.

**`# faction` declares a `title` no call site in the engine ever reads.** A faction is
the bitmask `factionBits` builds in `src/content/load.ts`, and nothing in `src/`,
`scripts/` or the app ever names one to a player — so two generated lines sit on the
review sheet that no player can reach, forever. Measured: dropping `title` from
`src/content/sections/faction.ts` leaves `tsc` clean, loses exactly one derived test
and adds no failure, and takes two lines off the sheet. *Closes when:* a faction has a
surface, or the field goes and its entry leaves `NOT_SAID`.

*Moves when: the owner rules whether a faction is ever named to a player. If it is not,
dropping the field is a measured, headless change already costed.*

## The town, and what it does not teach

**Cluster planes are now unreachable in `tulsa`.** The smith's chest was the tutorial
on-ramp to them and it is `DEBUG` now, as asked. `combat-expansion`'s `armourers-chest`
still hands out jewels so the mechanic is playable, but nothing in the town introduces
it. The whetstone ruling removed the need for a chest that hands out whetstones — gear
drops carrying its own points — so what is missing is the teaching, not the item.

*Moves when: the owner says where a player first meets a plane. It is one sentence, and
an agent picking the spot is deciding what the tutorial is about.*

**`combat-expansion` and `tutorial-quests` depend on `tulsa`.** Each names one thing
that moved — a road to the beach, and Miki — so a module about archetypes and a module
about a quest both load the whole town. `combat-expansion.proving-ground` sits at
`tulsa.market-square`'s own square and hangs off the beach for want of anywhere better.

*Moves when: a playtest names where the proving ground should stand. Two runs have now
gone through the town and neither reached it, which is itself the finding.*

**The eight `@@@` marks the corpus holds** are `tulsa` entities waiting on quests that
are not written — the anvil on A Grand Blade, Oolga's counter on Kill it with Fire, the
hive mouth on Birds and the Bees.

*Moves with the quests: these close when the modules that answer them are written, which
is the item at the top of this file.*

## Balance nobody has played against

Every number here was reasoned about and none was played against.

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

**Three balance numbers came out of the item-level lane and none is the owner's.** The
rolls are `iron-sword 3-8`, `heartwood-blade 12-18`, `proving-blade 6-10`; the rolling
passives are Keen Eye `+4-8 accuracy`, Quickstep `+6-10 evasion`, Fortune `+3-8 luck`.
They were chosen so the corpus's routes have points enough and so at least one rolled
payload is actually walked, and each is a one-line edit. The damage ruling of
2026-08-25 fixed two numbers beside these — the rat swings `1-3` and the player `3-8` —
so `iron-sword`'s roll and the player's swing now read as the same span and are not the
same fact.

*Moves when: the owner rules the six. Each is one line, and the collision with the
damage ranges is worth a glance while he is in there.*

**What a counter pays for a grown copy, now that gear is unsellable.** Measured rather
than assumed: a shop takes from the stack and a base never joins one, so `iron-sword`
still carries `value: 24` and no counter will ever price it — `trade.test.ts` asserts
the refusal, so the behaviour is pinned rather than accidental. Making a copy sellable
means the price answers to that instance's own modifiers and plane, and `Trade` carries
no copy identity.

*Moves when: the owner rules what a grown copy is worth at a counter, or that gear
simply is not sold. `Trade` carrying copy identity is engine work after the first
answer and nothing at all after the second.*

**Should worn gear take a slot?** It does not. The ruling said "the length of the
inventory list", `state.inventory` literally excludes worn and grown, and worn gear
is drawn under its own heading. If it should, equipping one of a stack of three
starts being refusable.

*Moves when: the owner rules it. Refusing to equip one of a stack of three is engine
work the moment he says yes.*

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
the corpus and with the UI. The shared fixture world now queued does **not** answer
this: it removes declarations, not files, and a derived fixture world may well be
loaded more often rather than less. *Closes when:* somebody decides what the suite's
cost should be a function of.

*Moves when: that decision is taken. The item's own closing clause is the missing
information and more measurement does not supply it.*

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
*a third time says nothing at all*. The run of 2026-08-25 hit this from the other side
and asked for the opposite of a collapse — *"There should be some sort of visual queue
that I already examined this object"* — which the mask now gives on the cell but not in
the log.

*Moves when: the owner rules which of two. Either a re-read that collapses says something
of its own — an engine line to the effect that this has been read already — or the
collapsed line moves to the bottom of the log so the count is where the player is
looking. Both are small; neither is derivable.*

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
`# save` body for no behavioural gain.

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

**Nobody has watched a replay back.** Everything the replay decides is proved
(`src/ui/replay.test.ts`, and the cursor through the driver in `src/ui/playtest.test.ts`);
what nobody has watched is the tick itself, the bar, and whether 0.3s is the right
default once a run with a long stretch of `page:` moves is played back. There are two
recorded runs standing in `.planning/yonatan-playtests/` to watch.

*Moves when: he watches one and names the cadence. Nothing else answers it.*
