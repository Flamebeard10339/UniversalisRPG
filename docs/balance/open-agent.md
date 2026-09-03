# What is still wrong that a lane can take

The instrument is built and the curve has landed. **A line is deleted the day it
closes.** The work order it all serves is `.planning/balance-plan-2026-08-31.md`;
what is below is what that plan does not already say to do next.

---

## The gear run had to learn two things by experiment that the page should say

How many points a jewel's own hex carries once it is socketed — four, out of the six
positions the rate jewel declares — is stated nowhere the oracle prints, and the run found
it by allocating one position at a time until `engine.plane.no-points`. And `equip:` by
template id was refused with *player does not carry item core.unassuming-cap* while the
cap was plainly carried, because several copies were, and only `equip: 3`, the instance,
took. The refusal names the template rather than saying an instance is wanted.

*Closes when: the cluster-jewel page says what sets a socketed hex's points, and equipping
a template that is carried more than once either picks one or refuses by saying that an
instance number is wanted — with a refusal test beside it.*

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
