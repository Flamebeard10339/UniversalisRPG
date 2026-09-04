# What is still wrong that a lane can take

The instrument is built and the curve has landed. **A line is deleted the day it
closes.** The work order it all serves is `.planning/balance-plan-2026-08-31.md`;
what is below is what that plan does not already say to do next.

---

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

## The tiers saves carry a hand-written pack, and it goes stale the day a module ships

`tiers.dsl` is nine reference saves whose inventories are written out by hand. The three
`cooking-tier-*` ones carry shrimp, anchovies, trout, salmon, chicken and beef — the raw
ingredients that existed when they were written — so a sweep run from one sees only the six
cheapest recipes in the world and reports cooking's ceiling as **flat at 2,160/h from level 1 to
level 20, falling from 1.8x the curve to 0.99x**. Swept instead from a cook holding the eel, the
tench, the perch and the carp that the fishing expansion added, the same world reads **6,480/h
at level 30, 2.2x**, with five of seven offers inside the frontier.

Both figures are honest readings of the save they were taken from, and the first one is the
answer to a question nobody asked. It cost this session a wrong conclusion about cooking, in
writing, before the second reading caught it. The `fishing-tier-*` saves are stale the same way:
none of them carries a piece of the level 25-30 band that shipped today.

*Closes when: what a tier save holds is derived from the world rather than typed into it — every
raw input a recipe names, and a piece of every slot the skill has gear for — so a module that
ships new ingredients or new bases is swept correctly with nothing edited.*

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
wherever a miss lands the player, and `travel:` is one hop and refuses the room it is
already in. So a two-hop eject loops (`travel: <the room between>`, `travel: <the mark>`)
and a one-hop or three-hop eject cannot. `thieving-floor` therefore covers the treasure
chest and the jewellery box and not the tavern lockbox, the pay chest or the duke.

The treasure chest was thrown to the market square and now lands at the castle gate, which
is what made its route writable, and its payout was set for the shorter walk.

*Closes when: the three remaining marks have floor routes — which wants either a way for a
route to name where it stands, or their misses landing two hops out like the others'.*

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
