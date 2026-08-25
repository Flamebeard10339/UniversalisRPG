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

**The chat does not scroll to what the turn just said.** *"Talking to miki, I have to
scroll down to see the dialogue. I should see just what Miki said, not everything
before as well."* *Closes when:* a turn leaves the log positioned on the first line
that turn produced. Which entry a turn starts at is a pure decision and belongs beside
the component.

**A node that says words and offers no choice reaches the player as nothing.** *"The
second dialogue with miki doesn't pop up a modal (because there is no choice) the choice
should be `continue`."* *Closes when:* such a node draws the same modal every other node
draws, carrying one choice, *Continue*. **The modal API has since landed and this is now
runtime only, with no UI edit at all** — the lane that built it says so: the `dialogue`
entry in `DEFINITIONS` gives the option its one value, `declaredFor(null)` hands back the
default manner, and a value that is not a `leaving` draws as an ordinary bottom sheet with
the beat above it.

**Talking is a location action rather than something Miki offers.** *"The talk to miki
dialogue should be attached to miki, not be a location action."* Measured on the
shipped corpus after examining Miki: `talk:tulsa.miki` is a `kind: 'talk'` choice in
the same flat `choices` list as every `use:entity.…`, and it is the **only** choice
carrying no `detail` — so it is the only one that does not name who is offering it,
while the six beside it read `Examine · Miki`, `Examine · ?`, `ascend · Stairs`.
Examine has already moved onto the entity's own cell; talk has not. *Closes when:*
talk is reached from Miki, the way examine is.

**Miki does not acknowledge what the player has already done.** *"Talking to miki
after interacting with the mirror doesn't acknowledge that the player already did the
thing."* `tulsa.mirror` sets `mirror-done` and the run's own `# save` carries it, so
the flag is there and the greeting is what gets said anyway. Reproduce from that save
before believing a cause; this closes with the thread ruling below, and probably by the
same edit.

**Miki's threads, and the ruling that unblocks them.** Crossed from `open-human.md`
with the owner's answer: *"The dialogue should be drafted, and when I review it later,
it might change, but it should be functional now for playtesters. The answer is just
give the player a choice on which dialogue path they want to go down. Quests should
have priority over regular dialogue, but a playtester shouldn't read the situation as a
bug if they encounter it."*

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

**`leave-tutorial-island.adrift` opens on a premise that is false**, which is what
makes the collision above reachable so early. Its gate is
`tulsa.market-square.discovered` and the module's own comment justifies it as *"a place
that is only discovered by having stood in it"* — but discovery spreads to adjacent
locations, so landing on the beach one step out of the house sets it, measured `true`
immediately after `climb out`. Miki says *"So you found the market"* to a player who has
never left the sand. *Closes when:* the corpus can state *has stood in*, and the stage
is gated on that. Standing in a place is not a fact anything can state today, so this is
a small piece of engine work before it is a content edit — and rewriting the line to be
true of the beach is the cheaper answer if the lane measures the new condition as worth
more than it costs.

### The action list

**The front door does not open onto anything.** *"Clicking on the front door doesn't
allow me to walk through it."* `# entity front-door` (`content/tulsa.dsl:776`) carries
`examine:` and a `pick lock:` that is `hidden if: unlocked`, so on a shipped save the
door offers exactly one action, *Examine*, and the road out of the house belongs to the
location rather than to the door. The line above puts the road back on the list; this
one is that the door should be what opens it. *Closes when:* an entity a player walks up
to and reads as a way out is one.

**The action progress bar is invisible on the map.** *"It should exist on lower banner
regardless of whether I'm on home, or on the map."* This is also what the
travel-progress question in `open-human.md` was waiting on, and it crosses here with
it: the first run's *"the map doesn't show a progress of how far along the travel is, so
it reads as a bug like the game is frozen"* is the same bar in the same place. Flat-band
travel landed at three seconds, so the bar is the whole of what is left. *Closes when:*
the bar is on the lower banner and a travel shows in it, whatever page the player is on.

**A running action does not animate, and nothing says who is being fought.** *"The
currently running action should animate when running. The game should acknowledge that
I am fighting the rat."*

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

The spread the derivation produces is the lane's to draft and is explicitly **not**
balanced yet: *"Balance will happen after."* What has to be true when this lands is that
two swings differ and that the player's differ because of what the player is. Only
`giant-rat` carries a range today; the other five foes still declare point attacks, and
that is the balance pass rather than this line.

**A fight does not chain.** *"Fighting the rat should auto start the next fight unless I
cancel it."* Three consecutive `begin: use core.melee-combat on tulsa.giant-rat` turns
in the run are the evidence. *Closes when:* a finished fight with a foe still standing
opens the next one, cancellably.

### The character sheet

**Every stat is on one page and most of them are secondary.** *"there are a whole bunch
of stats that are secondary. Like rage drain. We need to be able to group stats into
tabs and then have the important ones on the main tab, and the less important ones
elsewhere."* A `# group` already says what something is; whether a stat's group is that
same fact or a different one is the lane's first question, and `one-home` is the
procedure for answering it. Which stat lands where is authoring the lane drafts and the
owner revises.

**A stat does not say where its number came from.** *"I tried to click on regeneration
stat to see what was causing the number 6. A modal didn't open describing the bread
eating bonus."* *Closes when:* pressing a stat says what is adding to it, by name.

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

**Miki never says to find the mirror**, from the first run: *"He asks if you want him to
show you the ropes."* The quest's opening reads as though he did. The mirror's location
line has already been fixed by the owner in the working tree; this is the quest opening,
and under the dialogue policy it is a lane's to write.

**Dialogue does not animate.** Ruled: *"This should be a global variable that can
optionally be edited/skipped by modals."* So a reveal rate is a setting with a default
the lane picks and the owner tunes, and a modal may say it wants the words at once.
Explicitly low priority; it is here because it is no longer blocked.

**Autosave writes after every action.** Ruled by the owner, and measured while ruling
it: a session serializes in **0.013 ms** to **165 bytes** on the shipped corpus, so the
cadence question was never about cost. `DEFAULT_AUTOSAVE_SECONDS` is `0` and four proofs
encode *never*; setting a cadence surfaced an author's warning — *"autosave held: slot
player — this session did not come out of that slot"* — to a player on turn one, and
**separating those two readings of `held` is part of this line**, not a follow-on. A
warning meant for an author who typed `/autosave` is noise to a player who asked for no
cadence at all.

**A filed run is dropped by hand, and nothing prunes.** Ruled: *"Can I just delete them
manually for now?"* — and today he can, from a terminal: `/local delete test <run-id>`
and `/local delete save <run-id>-start`, two commands per run, through
`deleteLocalSection` (`src/content/localChanges.ts:135`). What is missing is the surface
in the app, which is where the runs actually pile up: each stopped run mints its own id
from the clock, so `upsertLocalSection` never replaces one and `local-changes` grows by
two sections per playtest forever. *Closes when:* the playtest list can drop a run, both
its sections at once, through that same function. Nothing prunes on a timer — that was
refused, because it destroys runs the author has not exported yet.

**A shared fixture world, kept as small as it can be.** Ruled: build it. The measurement
that asked for it: removing the whetstone touched 57 files, and **seventeen of them were
test modules each declaring their own `# item whetstone` with its own
`item-experience: 1000`** — `itemInstance`, `modals` ×3, `session` ×2, `item`,
`carriedItem`, `carriedScreen`, `clusterEffect`, `command`, `equipment`, `growth`,
`itemContribution`, `pack`, `planeReport`, `planeScreen`, `stat`, `trade`. His
constraint: *"Keep it as small as possible. Nothing needs a verbose examine, etc."*

Two things a lane settles before writing much of it, either of which can send it back:

- **`settled.md` says the opposite about `DEBUG`, deliberately** — and the objection has
  since been measured and does not stand, so this no longer gates the line. `# item
  million-attack-hammer` lives in the module of the test that swings it *"not in a testing
  module, because a file the load path has to be told to leave out is a rule someone has to
  remember."* That is a real rule and it is about **a `.dsl` under `content/`**. Both
  shipped entry points derive their sources from that directory and nothing else —
  `shippedFiles()` in `src/content/shipped.ts` reads it with `readdirSync`, and
  `SHIPPED_SOURCES` in `src/ui/shippedContent.ts` globs it — so **a fixture world that is
  a `.ts` module outside `content/` is unreachable by construction rather than by
  exclusion**: there is nothing to tell the loader to leave out, and so nothing to
  remember. The unreachability is therefore derived in the strongest available sense, and
  what a guard has to hold is the *other* half: that the exclusion list stays exactly one
  entry long. It is one today — `LOCAL_CHANGES_MODULE_ID`, which is not shipped and does
  not exist in the repository — and a claim pinning it to that one, with its reason, is
  what stops a second being added quietly later.

- **Do not put the fixture world under `content/`**, and do not grow the exclusion. That
  is the whole of what the settled ruling was protecting, and it is the one way this line
  can still go wrong.
- **Then the `DEBUG` sections in the shipped corpus are worth re-asking about**, which
  is the owner's own follow-up. They stop being necessary the moment that guard exists,
  and not one moment before it.

The smaller second answer from the same measurement can be taken separately and needs
none of this: **one engine word travels engine key → `locale.ts` row → `labels.ts` id →
`planePanel.ts` channel → JSX**, so four files move for one word; and the verb set is
declared in `sections/test.ts` and then re-listed by two `case 'feed':` arms in
`session.ts` and a third dispatch in `growth.ts`.

---

## Crossed from `open-human.md`, second pass, 2026-08-25

Seventeen parked lines went to the owner after the playtest was read out and came back
ruled. Each carries his answer; none is to be re-decided. What was left behind stood in
`open-human.md` and was three lines; seven more have crossed back since, each carrying
what the lane that hit it had already measured.

### The town

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

**One list of what the player has interacted with, replacing two.** Ruled, and it is the
largest shape in this pass: *"The `have I read this` for examine is the same exact thing
as `discovered` for locations. We should strongly consider merging them as a list of
things that the player has already interacted with."*

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

**Two xp gains fold back into one line.** Ruled: *"+5 attack and +5 defense, should read
+10 attack, defense."* The grouping belongs in `sayingOf` over notices that share a count,
not in the notice type — the lane costed that and it is small. **One thing to settle
before writing it:** the previous fold read `+5 Attack, Defence`, and summing two
different stats into `+10` says the player gained ten of something they did not. Take
`+5 Attack, Defence` unless he says otherwise — the ruling is that they fold, and the
arithmetic inside it reads like a slip rather than a decision.

### The tools

**A recorded run carries a start save and an ending save, always.** Ruled, both halves:
*"of course it can have an ending save"* and *"yes and yes"* — so `KeptRun.from` may name
a `# save` the corpus already holds instead of carrying bytes. This is what lets
`/create-test` finally go through `runAsSections` as the one writer.

**And the exception goes with it**, which is his own question turned into the answer:
*"Why do we need an exception here in the first place? Why do we sometimes need to declare
a savegame was loaded and sometimes not?"* Today a history already opening with `load:`
declines to write a start save, because the author's `load:` already places the replay —
which is two rules where one would do. With `from` able to name a `# save`, the run always
carries a start save, a `load:` in the history is the same fact stated twice, and the
branch that decides between them is deleted rather than moved.
