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
