# What is still wrong that a lane can take

The instrument is built and the curve has landed. **A line is deleted the day it
closes.** The work order it all serves is `.planning/balance-plan-2026-08-31.md`;
what is below is what that plan does not already say to do next.

---

## The speedrun runs had to learn four things by experiment that the oracle should say

Two authorbot runs wrote routes to thieving 30 from the fresh start and reported what
the oracle left them to find out by running it. The grammar's example reads
`resource.health`, but a module other than core must write `resource.core.health`, and
only probe says so. `core` had to be listed under `dependencies:` though pulled in
transitively. `goto:` advances the clock by nothing while `travel:` pays every hop, and
nothing on the page marks the first as an authoring convenience rather than a way to
move. And `travel:` to the room already stood in is refused with *there is no way from
here*, which reads as a missing road rather than a no-op.

*Closes when: the page says each of the four — the resource example written whole, the
dependency rule stated, `goto:` marked as costing no time, and the standing-here refusal
saying what it means — and a speedrun brief no longer lists any of them.*

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
