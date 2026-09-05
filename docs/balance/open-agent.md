## Health outruns attack about two to one, and the curve by nine

Read off `combat-floor` the day it landed. A fighter climbing to `attack 30` arrives at
**`health 65`**, in 611 game-minutes where the curve asks 5354 for that level.

Health experience is paid on `damage-taken` at 6× the amount, so a fighter who stands and
trades is paid for both halves of the exchange while attack is paid once. That is the mechanism
to look at first, and it is a `# skill` line rather than a ladder one.

Whether the answer is the rate, the ladder, or that health is simply meant to be the cheap arm
is the author's, and this is the first measurement that puts the question on the table.

*Closes when:* the two arms of a fighter climb at a stated ratio, and the floor is re-read
against it.


## Nothing asks what every room pays, so the room table is swept by hand

`simulate-activity --at <location>` reads one room; with no `--at` the sweep stands where the
save left the player. So comparing rooms means one call per room, and the room table the
handovers keep referring to was built that way and goes stale whenever balance moves.

**Measured on a live run 2026-09-04**, which is what makes this a line rather than a hunch: the
combat-floor run spent nine of its first thirty-six calls on `--at` one room at a time —
pasture, tunnels, proving-ground, apiary-field, and back round again — because there was no way
to ask the question once. It is the single largest use of its turns, and it is a question the
tool could answer in one pass.

The author also asked for a tool printing every location with what stands in it and each body's
tier and profile. The same run says that one is worth less: it read `combat.dsl` and `tulsa.dsl`
whole and had all of it, and one of its dozen greps was about enemies at all. Worth folding into
the sweep as columns rather than building beside it — a room, what stands in it and at what
tier, and what an hour there pays, is one table and answers both.

Not trivial: a room takes seconds, so a world takes minutes, and what to print is most of the
work. `npm run floors` and `ladder-check` both already take `--world`, so the seam is the same
one.

*Closes when:* one command prints every room a player can fight in, what stands there, and what
an hour of it pays, and the handovers stop saying the room table was re-read by hand.


## Three `replenish:` lines still read as whole-shelf times, and mean per-unit ones

`c049e157` made `replenish:` the time **one unit** of stock takes to come back, and all five
shipped lines were written meaning the whole shelf. The two the urchins route asserts were
re-cut when the route went red on 2026-09-03; the other three were not, because nothing
empties them and so nothing is wrong today. `forge-supplies` is `replenish: 5m` over 200
bronze bars and 200 iron, which is a thousand game-minutes to refill a shelf nobody can drain;
the alley coat's 15m and the Fence's 10m are over stocks of two to twelve, which reads as a
plausible pace for a lockpick either way.

*Closes when: the three lines say the pace their shops are meant to keep, read off what a
player can actually empty rather than left at whichever number happens not to matter.*

## `tiers.dsl` is being deleted a skill at a time, as each one gets a floor

Its nine reference saves have inventories written out by hand, and a hand-written pack inside a
balance instrument drifts from the world it measures. Measured 2026-09-03: the `cooking-tier-*`
saves carry the raw ingredients that existed when somebody typed them in, so a sweep from one
reported cooking's ceiling as **flat at 2,160/h from level 1 to 20, falling from 1.8x the curve
to 0.99x**. From a cook holding the fish that shipped that day, the same world reads **6,480/h
at level 30, 2.2x**. The first figure is an honest reading of the save and the answer to a
question nobody asked, and it was written down as a conclusion about cooking before the second
reading caught it. They also declare no location, so each one stands where a world with no save
location starts — the tutorial guide house — which is where those cooking figures were taken.

Ruled 2026-09-03: they go. The replacement is already built and is derived rather than typed —
`npm run simulate-activity -- --after <test>` stands a sweep where a floor route ends, and a
floor route buys and wears its own gear by walking. `fishing-tier-1`, `-10` and `-20` are
deleted, because `floors/fishing-floor.dsl` covers that skill at 14, 20 and 30.

What is left is combat and cooking, and they stay until the same is true of them: deleting a
skill's tier saves before it has a floor leaves it with no reference build at all.

*Closes when: combat and cooking have floor routes, their tier saves are deleted with them, and
`tiers.dsl` is gone.*

## A sweep re-issues one directive, so an offer that is two actions cannot be priced

`npm run simulate-activity` builds a `# test` per offer that takes that offer until the window
closes. That prices anything a player stands and repeats, and it cannot price a loop made of
more than one action. Measured 2026-09-03 on fishing's eel trap, which is `set the trap`, a
three-minute soak, then `lift the trap`, with each action hidden while the other is the one to
take: the sweep got one lift in, divided it by the moment it took, and reported **46,957/h**.
That is not a rate and nothing in the sheet says so.

The trap's own route sets and lifts three times over and passes, so the loop works. It is the
only offer in the module with no price on it, and any mechanic shaped like it — a thing set and
come back to, a fire banked, a snare — will read the same way.

*Closes when: a sweep can be given the cadence an offer actually has — the run taking whatever
the engine puts on the sheet next rather than re-issuing the one it started with — or the sheet
says of an offer that left and came back that what it printed is a payoff and not a rate.*

## The blowfish hole pays nineteen times the curve and sits in fishing's best water

Measured 2026-09-03: `entity.the-bars-crawl.blowfish-hole.cast` at the Deep Water reads
**42,200/h at `--ideal` against a level-20 curve of 2,177**, where the salmon pool beside it
reads 2,640. It is `the-bars-crawl`'s quest prop rather than fishing's, and it is the
best-paying offer in the room by a factor of sixteen, so every sweep run at the Deep Water is
reported against it and any water cut to beat it would be absurd.

*Closes when: the blowfish is priced as a thing a player may stand and repeat, or stops being
one — a `stands:` that empties the hole, or a gate that shuts it once the quest is done.*

## The stat read is what `--grow` costs, and it recomputes six planes to answer about one

`npm run ladder-check` spends about 60% of its build time inside `statBreakdown`, which
rebuilds every carrier of every worn piece on every read — six planes walked to answer a
question only one of them can have changed, because `spendPlane` is growing one piece at a
time. `itemContribution` then folds all of that piece's stats, sorts them and materialises
an array, and `foldContribution` keeps the one stat asked for. Measured 2026-09-03 on
`combat.attack` at the level-30 rung: 20k reads at ~65us each, and the deep `isPlane` guard
that `itemInstance` runs on every access is 27% of the build on its own.

The greedy cannot read fewer times without either modelling what a passive is worth — which
`tier-build` refuses on purpose — or weakening the played-out lookahead, which is the thing
that stops `--grow` being decorative. So the remaining speed is all in the read, and it is
the engine's hottest path rather than the tool's, which is why this was left rather than
taken: the sweep is a usable 4.9s and no gate runs it.

*Closes when: `statBreakdown` can be asked about one stat without every worn item's whole
contribution set being built and sorted for it, and `itemInstance` stops deep-validating a
payload the runtime itself just built — with the UI's own use of `itemContribution` still
served by the same one home.*

## `-<line>` should take a scalar back, and does not yet

The grammar page offers `-<line>` on every line of every section, and it works on
lists, entries and keywords. On a field holding one value it is refused — `-examine:`
says *examine is not a list, so it cannot take -* — so the page promises more than the
parser does by exactly that much. Ruled 2026-09-02: unwriting a scalar over another
module's body is a thing the language should do. Low priority until an author needs it.

*Closes when: `-<keyword>:` on a scalar field takes the value out, the page and the
parser agree, and a refusal test for the malformed case stands beside it.*

## A stored build can become a different character with no diff

`allocatedPositions` holds position *indices* and a `roll`, and the passive at a
position is looked up at read time (`src/runtime/clusterEffect.ts:31`, `:47-49`).
So editing a jewel's position list, or a passive's bonus range, changes what every
stored build grants with no error and no change on disk. Nine corpus saves carry
cluster planes today and all twelve reference builds now do too.

Three claims in `scripts/tier-build.test.ts` already catch the ways a tier goes
stale that *are* visible — its level, a slot it left empty, and a piece standing on
less than the whole of the points it dropped with — and none reaches this one.

*Closes when:* a tier artifact stores a hash of its resolved contribution set,
recomputed and compared on read, so a difference is reported rather than absorbed.

## An ejecting mark's window column is a payoff, not a rate, and reads as one

`npm run simulate-activity` ends a run where the offer leaves the sheet, and a mark that
throws the player out leaves it on the first miss. So its window row is *the xp of one
visit*, divided by an hour — and two ejecting marks put side by side in that column are
being compared on how long their visits are rather than on what they pay. Measured
2026-09-03 at the level-22 rung: the jewellery box read 68/h against the house chest's
161/h and is in fact worth 10,470/h against the chest's 6,900/h, because the chest's visit
runs 75 seconds and the box's 17. That column is why the last pass recorded that every
gated mark loses to the ungated chest.

The walk back is the missing term and the tool already holds both halves of it —
`worked` is the visit, and the roads out of the eject room are in the registry.

*Closes when: a run the engine ended by moving the player prices the walk back to where it
was standing and reports one rate, or the column says in the sheet's own words that it is a
payoff per visit.*

## A daze costs a lock-picker nothing, so the strongbox's punishment is inert

`# item dazed` is `-100% thieving-rate`, `pick-pocket` is `rate: us.thieving-rate` and
`pick-the-lock` is `time: 6`. So a daze stops a pocket dead for its duration and takes
nothing at all off a lock. Four marks inflict it and two of them are locks.

That is priced into the numbers this pass shipped — the strongbox's payout is set against
its attempt alone — so nothing is wrong today. It is written down because the next author
to write `inflict: dazed` on a lock will believe they have written a cost.

*Closes when: either `dazed` carries something a lock feels, or the daze comes off the two
lock marks and is replaced by what the author means them to cost.*

## Three marks can have no floor route, because of how far their miss throws you

A `# test` loop body has to be a walk that is legal both from the mark's room and from
wherever a miss lands the player. Since 2026-09-04 a `travel:` to the room the player is
already standing in walks nothing and is not refused, so a loop body may open by naming the
room it wants to stand in and be legal from anywhere a road reaches it — which is what the
thieving floor now does after a faint sends the player home. What is left is the walk
itself: a one-hop eject is one `travel:`, and a three-hop one is three, each of which has
to be a road from wherever the pass began. `thieving-floor` therefore still covers the
treasure chest and the jewellery box and not the tavern lockbox, the pay chest or the duke.

*Closes when: the three remaining marks have floor routes, each opening with the walk from
wherever its miss lands the player.*

## The floors for this band walk ungeared, which is not what the band was balanced for

`cellar-chest-to-14`, `cellar-chest-to-22` and `jewellery-box-to-30` walk a thief who owns
nothing — ability is his level and nothing else — against marks whose difficulties are the
ladder a thief reaches by buying the Fence's three tools. So they read 0.96×, 1.24× and
1.75× and the house chest route still reads 1.02×, and all four numbers are honest and none
of them is the band's aim. They earn their place by proving the routes still walk.

*Closes when: a floor route buys and wears the kit before it works the mark — which is what
`gear-up` does for one rate jewel already, and what the step-2 speedrun owes.*

## A mark measured against a thief who has never fought reads far below what it is

Ruled 2026-09-03: thieving is meant to want some investment in health, and how much is out of
scope for a thieving pass. That ruling has a consequence for how a mark is read, and it is easy
to trip over.

At the top of the ladder the knight's pocket pays 3,863 an hour, which is what its numbers say
it should. At level eleven — its own gate — it pays **262, sixteen hundredths of the curve**,
because a pure thief misses about half the time, takes a point of damage a miss, and dies. The
floor routes never fight, so every rung read off one is a thief with a level-one constitution,
and a pocket mark measured that way is limited by dying rather than by anything the pass sets.

The lock marks are much less affected: a lock's miss throws you out or dazes you rather than
draining you, so the same reading is closer to honest for them.

*Closes when: a rung save exists that has fought as much as it has stolen, and the marks are
read against that as well as against the pure thief — at which point the gap between the two is
the size of the health investment the skill is asking for, which is a number worth knowing
rather than a defect.*

## The floors now carry a geared route, and it lands on the curve

`gear-up` used to farm a townsman for a jewel at one in a hundred and nine and cost 139
game-minutes. The common jewel is bought from the alley now, and it costs 27.6, which drags
`geared-to-20` and `geared-to-30` to 0.91 and 0.98 of the curve — the closest either has been.
So the note that this band's floors walk ungeared is only half true now: three of the ten carry
gear, and the rest are deliberately the bare floor.

What is still missing is a route that carries the *band's own* gear — the climbing gloves, the
burglar's picks, a rare jewel — rather than the one common jewel the alley sells. The band's
marks are cut against a ladder no floor route stands on.

*Closes when: a floor route buys or wins the band's gear, so the marks of levels eleven to
thirty are walked by a thief who has what they were cut for.*

## A route cannot report what it cost, so what it cost goes unrecorded

The asserting half of this is closed: `ENGINE_ROOTS` declares per root whether what it reads
churns, `worldRemarks` reads that, and the corpus holds no pinned figure. What a route may
*say* is settled; what a route may *report* was never built. A route that spends an hour and
two hundred coin reaching its end says so nowhere, so the only way to learn what a path costs
is still to walk it by hand and watch.

*Closes when:* a route records what it took and what it paid, and something reads that back.

## A shop that is out of stock is a red rather than a wait

Changing figures broke several routes that were still perfectly walkable, because they tried
and failed to buy from a shop that was out of stock. The workaround in the corpus today is a
hand-rolled loop with a wait condition. **That wants a shorthand — buy until we have enough —
which a speedrun prefers**, on the understanding that if restock moves, the run spends the
difference waiting rather than failing.

*Closes when:* a route can ask a counter for a count and wait for it, and the hand-rolled
loops in the corpus are written that way instead.

## Turning a pack off mid-game eats a save with no way back

Reopening the world prunes a save of everything it can no longer name, so a player mid-quest
who turns quests off and back on has the quest gone rather than paused. That is the honest
behaviour of the machinery and it is not what a player should meet.

Ruled 2026-09-05: **this is an autosave feature.**

1. A player may enable or disable any number of mods, doing as much or as little damage to
   their save as they like.
2. The next action they take in the world triggers autosave, which sees a modlist different
   from the one the save was written under and offers them the choice: overwrite this save,
   write a new one under a name, or revert to the previous modlist.

A confused player reverts and loses no progress. A player who knows what they are doing
presses one button and keeps playing without interruption.

*Closes when:* toggling a pack does nothing on its own, the next action raises that choice,
and reverting restores the save exactly as it stood.

## The passives are flavour ids where the jewels are systematic

The jewels were renamed to `<rarity>-<role>-<skill>` with the flavour kept in `title:`, so a
reader can reason about them without holding seven titles in their head — `content/thieving.dsl`
carries six of them, `common-general-thieving` titled Light Touch through
`unique-luck-thieving` titled Fence's Eye.

The passives have the same problem and are what one actually reasons about when pricing a
jewel per point. `flat-thieving-small` and `increased-thieving-small` are already systematic;
`cutpurse`, `patience`, `casing`, `sleight`, `iron-nerve` and `hard-knuckles` are pure
flavour.

Ruled 2026-09-05: **they are renamed too, in one pass across every skill.** Doing thieving's
alone would leave two conventions standing in one world, which is the thing the jewel rename
was for.

*Closes when:* no passive id in the corpus is flavour, every one carries its flavour in
`title:`, and `npm run oracle -- --at content` is clean.

## The tier matrix should report a jewel that wins nothing without calling it a finding

Ruled 2026-09-05: **a jewel with no winning build at any tier is accepted, not a defect.**
`crossroads` is a connector whose whole function is reaching other jewels, and it may never
win a tier by design.

*Closes when:* the matrix says which jewels win nothing as a fact about the world rather than
as something to go and fix.
