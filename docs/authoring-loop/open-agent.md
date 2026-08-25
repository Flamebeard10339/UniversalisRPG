# What is still wrong that an agent can take

The queue an autonomous lane picks from. Everything here is open; nothing here is
done. **A line is deleted the day it closes** — not struck through, not annotated,
deleted — and if what it settled is something a later agent could get wrong, one
sentence about it goes in `settled.md` instead. Git holds the reasoning, and the
commit that closes a line is where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here is proved headlessly — `npm test`, `npm run probe`,
`npm run oracle`, `tsc --noEmit` — and the shape is already settled, so a lane can
take one to the end without asking. What waits on the owner's play, his reading of
the writing, or a ruling nobody has taken is in `open-human.md`.

**A GUI line is proved the way `CLAUDE.md` says and no further.** The decision goes
in a `.ts` beside the component and is tested there; the wiring is built, `tsc` and
the suite are run, and it is handed to the author in one line. A lane that cannot
find a pure decision under a GUI line says so rather than reaching for a screenshot
loop. Half of what is below is GUI, because it came out of a playtest.

**A line here that turns out to need his judgement does not stay here flagged — it
moves, carrying what you measured.** Guessing the ruling and abandoning the lane
are the two bad answers, and the second is worse, because the measurement dies with
the session. `deliverable-log.md` states how a line crosses, in both directions,
and is the one place that rule is written.

---

## From the owner's second playtest, 2026-08-25

`.planning/yonatan-playtests/run-2026-08-25t14-51-24-926z-reviewed.md`, sixty turns
through Miki's route recorded through the playtest tool against `56a2dca7`. Every
line quotes what he wrote at the turn it happened. Four were measured against the
live loader while the run was read, and those carry the measurement — the run is the
evidence a line exists, and the measurement is the evidence about its cause.

### What the chat says, and when

So: talking with more than one thread open **offers the paths as a choice**, quest
threads ahead of the rest, each labelled in words rather than with its first spoken
line. The reproduction is a fresh game on this branch — talk, take *"I'd rather find my
own way"*, refuse again, leave by the window, come back — and today it says nothing and
draws a bare list labelled with each thread's opening line. `isThread`
(`src/content/sections/dialogue.ts`) is `when !== undefined || ask !== undefined`, so
every quest-given node is a thread including one the author wrote `always` on, and
fifteen of Miki's sixteen nodes are threads. **Do not take the one-line `isThread` fix
on its own:** it was measured, it makes Miki speak, and it strands the whole
`apologised` route, because `snubbed.miki.0` becomes an `otherwise` node and
`adrift.miki.0` is `sticky` on a flag that never goes false. `apology-route-full`
apologises before ever leaving the house, so the suite would not catch it — a proof
that walks out of the house and back is part of closing this.

**The apology hands out a fishing net every time it is talked through.**
`finding-your-feet.apologised`'s first line is `sticky` and carries
`give: core.fishing-net`, and sticky replays a node whole — so four talks measured
`[1, 2, 3, 4]` nets. Found by the lane that rewrote Miki's threads and left alone as
outside its four lines. *Closes when:* the route hands over one net however many times
it is walked. **It moves `apology-route-full-end`'s sheet**, so do not take it beside
anything else regenerating a route.

### The action list

### The fight

**The player's damage never varies.** *"The player always does the same exact amount of
damage."* The foe's half of this is done — `giant-rat` declares `attack 6-8` and the
range grammar it uses was already there. The player's half is a different mechanism and
is what is left: *"The player's 3-8 should be part of their skill level + base."* So
`3-8` is a reading of what a starting player happens to come out at, not a number to
write down anywhere — it falls out of the base plus the melee level, which under the
skill rule that has since landed is `+1 attack per level`. **A lane that writes `3-8` on
the player has got this backwards.**

The seam already exists and the combat lane mapped it rather than building a second one:
`statRange` (`src/runtime/stats.ts`) is the single place a stat becomes a `Range` — the
actor's own `stats:` entry folded with every `stat-bonus` tag clause through
`addRanges`, so a ranged bonus composes with a ranged base. `+N attack per level of
melee` is already a writable tag clause on any carrier, so *base plus melee level* is
content rather than engine. Planning reads the midpoint through `statValue` while the
swing reads `sampleStat`, and the `flail`/`straw-man` fixture shows both working over a
range. **Watch `hitDamage`'s floor** — `max(1, min(minDamage, attack))` in milli-units —
because an attack at or below the target's defence collapses to a constant 1, which is
the trap that makes a naive `attack 1-3` mean nothing.

**Where the spread comes from is the open half, and the two readings are not the same
edit.** The player declares its own `stats: ... attack 10 ...` on `# entity player`, which
overrides `# stat attack base: 10`, and the melee grant adds a point to it — so today the
player's attack is a point and every swing is identical by construction. Making the
declared attack a range (`attack 8-12`) satisfies *base plus level* literally: `addRanges`
shifts both ends by the grant. Putting the spread on the weapon instead leaves an unarmed
player swinging flat. **Nothing on file chooses between them**, which is what *the lane's
to draft* means here — but say which one you took and why, because it is the difference
between *a body swings unevenly* and *a blade does*.

**And do not take this in the same session as anything else that moves a recorded route.**
Whichever reading is taken, every combat figure in `content/` moves — that is what the
rat's own range cost, and two lanes regenerating the same end-save collide.

The spread the derivation produces is the lane's to draft and is explicitly **not**
balanced yet: *"Balance will happen after."* What has to be true when this lands is that
two swings differ and that the player's differ because of what the player is. Only
`giant-rat` carries a range today; the other five foes still declare point attacks, and
that is the balance pass rather than this line.

**A fight does not chain.** *"Fighting the rat should auto start the next fight unless I
cancel it."* Three consecutive `begin: use core.melee-combat on tulsa.giant-rat` turns
in the run are the evidence. *Closes when:* a finished fight with a foe still standing
opens the next one, cancellably.

**Measured 2026-08-25, so take this with the answer rather than looking for it.** The
chaining machinery is already built and `melee-combat` simply does not ask for it: a
`continuous` action re-arms on the next foe still standing in the room (`standsAgain` →
`enterEncounter`, `src/runtime/runtime.ts`), and `# action melee-combat` in
`content/core.dsl` carries no tag, so `actionKind` reads `duration` and `repeating` is
false. Adding the word `continuous` to it was run against the whole suite and **the only
behavioural difference is the chaining** — the rage route's swing figures come back
identical at `progress: 1200, attemptsMade: 13`, so the timing does not move, and
`standsAgain` keys on the same entity, so it chains onto another rat rather than onto
whatever else is in the room. It is cancellable already, being a live action like any
other.

What it costs is **15 failing claims, every one a recorded figure**: `repeating: true` in
one serialized `activeAction`, seven `combat-expansion` route end-saves, `miki-route-end`
(health 24529 → 24609, clock 28400 → 33200, because the route now kills more inside one
action), and one runtime health claim. None is a break; each is a route to regenerate.
**Do not take this in the same session as anything else that moves `miki-route-end`** — a
dialogue change moves the same figures and the two collide.

### The character sheet

**Every stat is on one page and most of them are secondary.** *"there are a whole bunch
of stats that are secondary. Like rage drain. We need to be able to group stats into
tabs and then have the important ones on the main tab, and the less important ones
elsewhere."* A `# group` already says what something is; whether a stat's group is that
same fact or a different one is the lane's first question, and `one-home` is the
procedure for answering it. Which stat lands where is authoring the lane drafts and the
owner revises.

**A stat's breakdown is drawn on a sheet row rather than on the modal that now exists.**
Pressing a stat says what is adding to it, by name, through the simplest surface that was
already there — `Ledger`'s `onOpen` and `Entry.detail`. The modal API landed the same day
and this should move onto it, and the lane that built the breakdown costed the move: **the
runtime does not change at all.** The shares are already on the view as `StatRow.from` and
the words are already one function, `madeOf` in `src/ui/sheet.ts`. What moves is the
`openStat` `useState` in `App.tsx` and the third parameter of `counted`, both deleted;
`onOpen` points at whatever opens the modal — its sibling today is `driver.open`, which
sends `/inv <id>` and sets `view.focus`, so a stat wants the equivalent `/stat <id>` and a
`Focus` case — and the body renders from `row.from`, one row per share, which a modal can
afford and a sheet row cannot. *Closes when:* the breakdown is a modal like every other.

**Three things wrong with the item modal, in one turn.** *"Clicking on an item in the
inventory flashes the ?chat? on the screen for a single frame. I can't seem to interact
with the skill tree of the iron sword. Or equip them. Also the item names should wrap
(we should support languages with arbitrary length strings)."* The flash is a bug, the
plane and the equip are surfaces the modal has elsewhere and not here, and the wrapping
is the one of the three with a derived proof available — a label long enough to wrap is
a fixture, not a screenshot.

### Modals

> Modals need to be generalized into a single API so that every single modal isn't
> this unique thing. Some modals overlap the bottom. Some can't be cancelled by
> clicking off of them.
>
> There should be an opaque api and we should teach all agents how to interact with
> making new modals. Modals should also have general strategies (centered, bottom,
> darken background, etc) that the `# modal` section can interact with that default to
> reasonable values.
>
> The DSL should expose strategies not the minutiae.

This run's instance: *"Clicking off of the `Playtest Note` modal doesn't cancel it. This
is a generalize modal problem."* And from the first run, the same class: *"The dialogue
modal darkens the screen and I can't see the words that were just spoken."* *Closes
when:* a strategy is a word a `# modal` says, the defaults are reasonable, and no
component decides for itself whether clicking off cancels. The list of strategies is the
lane's to derive from what the shipped modals actually do — a hand-kept table of them is
the failure mode `one-home` exists to catch.

---

## Crossed from `open-human.md`, 2026-08-25

The owner ruled these while reviewing the run. Each carries his answer; none is to be
re-decided.

**Dialogue does not animate.** Ruled: *"This should be a global variable that can
optionally be edited/skipped by modals."* So a reveal rate is a setting with a default
the lane picks and the owner tunes, and a modal may say it wants the words at once.
Explicitly low priority; it is here because it is no longer blocked.

**Tulsa's map is wrong and the fix is one shape, not four edits.** Ruled:
*"combat-expansion should not need locations or entities. It is a list of jewels and
items. The proving ground should be permanently moved as a static fixture in tulsa.
Likewise, the beach should be removed outright, it no longer makes sense. Miki's house is
adjacent to the market square."*

Measured before filing, because the beach is load-bearing: **30 references across three
modules.** Four shipped `# save` bodies stand on `tulsa.beach` and more carry
`tulsa.beach.discovered`; seven `# test` scripts travel there; and
`tulsa.window.climb-out` is `relocate: beach` — *"the only way out that never runs
through Miki,"* by the module's own comment, so the drop needs somewhere to land. This is
a content migration with a fixture sweep in it, not a map edit.

Two consequences worth knowing before starting:

- **`leave-tutorial-island.adrift` gets worse, not better.** Its gate is
  `tulsa.market-square.discovered`, discovery spreads to adjacent locations, and the
  ruling makes the market **adjacent to Miki's house** — so a stage that already opened a
  step too early now opens on turn one. The *has stood in* work named above stops being
  optional the moment this lands, and the two should land together.
- **`combat-expansion` losing its locations is what removes the dependency edge** that
  made a module about archetypes load the whole town. Check `layer-check` and the module
  dependency list afterwards: if `combat-expansion` still names `tulsa`, the edit did not
  finish.

**Miki teaches the plane when he hands over the gear.** Ruled, closing the on-ramp
question: *"Miki needs an extra line of dialogue when he gives the player the sword and
the shield encouraging the player to check the items in their inventory and opening up
the modals."* So the on-ramp is words plus an affordance — the line should be able to put
the player in front of the modal rather than only mentioning it, which is the same
mechanism the modal API line wants.

### What a player has already touched

Beside it, the standing rule that constrains how it is built: *"Dialogue should always be
able to be said. We shouldn't need a dozen conditions or complicated logic to guarantee
that an NPC can be talked to. We shouldn't even need complicated tests."* That is the
same ruling as the thread line above arriving from the other direction — an NPC being
sayable is not something a lane should be able to break with a gate.

Today these are two mechanisms: `<entity>.examined` flags carry *have I read this* and
drive the `?` mask, and `<location>.discovered` flags carry *have I been here* and drive
the map, the journal and several quest gates. `leave-tutorial-island.adrift` is gated on
one of them, and the *has stood in* condition the town work needs is a third thing of the
same kind. **Fold all three questions before writing the merge**, because a merged list
that still cannot say *stood in* as distinct from *heard of* has not merged anything.
`one-home` is the procedure and this is exactly the case it is for.

### Numbers and rules the owner ruled

### The tools

**A recorded run carries a start save and an ending save, always.** Ruled, both halves:
*"of course it can have an ending save"* and *"yes and yes"* — so `KeptRun.from` may name
a `# save` the corpus already holds instead of carrying bytes. This is what lets
`/create-test` finally go through `runAsSections` as the one writer.

**Two things measured 2026-08-25 that the line was written before.** First, **the layering
cycle that stopped `/create-test` going through the shared writer is gone.** A lane once
reported it could not collapse them because `runLog.ts` imported a type from `command.ts`,
so the reverse import closed a cycle and `layer-check` exited 1. `runLog.ts` now imports
only `../content/sections/test` and `./localized`, while `command.ts` imports *from*
`runLog.ts` — one direction, no cycle — so `runAsSections` is reachable from
`buildCreateTest` today. Second, **the branch to delete is `usesStartSave` in
`buildCreateTest` (`src/runtime/command.ts:563`)**, computed as *the history does not open
with `load:`*, and it gates four separate things: whether a start save is read, whether the
id is treated as taken, whether `load:` is unshifted onto the lines, and whether a `# save`
block is emitted. That is the one rule the ruling replaces.

**And the exception goes with it**, which is his own question turned into the answer:
*"Why do we need an exception here in the first place? Why do we sometimes need to declare
a savegame was loaded and sometimes not?"* Today a history already opening with `load:`
declines to write a start save, because the author's `load:` already places the replay —
which is two rules where one would do. With `from` able to name a `# save`, the run always
carries a start save, a `load:` in the history is the same fact stated twice, and the
branch that decides between them is deleted rather than moved.
