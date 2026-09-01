# What is still wrong that a lane can take

The town's own ladder: one to three activities per ten levels per skill, standing
without a quest in the world. **A line is deleted the day it closes.**

The sheet is `npm run simulate-activity -- tiers.<activity>-tier-<level> --off quests`.

---

## No route stands at a band gate

Five actions are shut by level and nothing walks up to one: `hidden if:
level.fishing < 11` and `< 16` on the pike reach and the sturgeon hole,
`level.thieving < 11` on the knight's pocket and the thief's, and `< 14` on the
strongbox. Deleting any of those five lines reddens nothing — the corpus loads, every
route passes, and the second band quietly opens on the first afternoon, which is the
one thing the gates exist to stop.

`src/content/dsl.test.ts` has no claim over `hidden if:` at all, so this is not a
missing route so much as a missing claim.

*Closes when:* a derived claim in `src/content/dsl.test.ts` holds every action in the
shipped corpus carrying `hidden if: level.<skill> < n` to being off the sheet for a
character under n and on it at n — subjects generating themselves off the corpus, so a
sixth gate written next month is covered by having been written.

## Two rooms nobody has walked into

The rogue den under the doss house and the muster past the tunnels are reachable
only by reading the file. Every other room in the town is walked by something, and
`walking-the-town` predates both. The two new dishes are in the same position: nothing
in the corpus has ever cooked a pike.

*Closes when:* `walking-the-town` reaches both rooms, and a `# test` in
`content/tulsa.dsl` takes one offer at each — a pocket in the den, a swing at the
muster — and one cooks a pike at a stove.

## The thieving jewel has never been put in anything

`a-quiet-hour` ships with three passives on a ring and drops one time in
twenty-two off the strongbox, and nothing has ever socketed one. The lockpicks carry
`item-level: 8-14` so they have a plane to take it. The Angler's Knot has stood in
exactly this position since it was written, so this closes both or neither.

*Closes when:* a route slots each into its base and allocates a passive, the way
`growing-a-heartwood-blade` does for the blade — one route, two jewels, since what is
being proved is the plane and not the jewel.

## A parted line takes one of every piece of tackle a player owns

`fishing.parted-tackle` is six `take:` lines, one per piece, so a line that gives way
takes the net, the other net and every spare line out of the pack at once rather than
the one that parted. Seen on the sheet: a tier-1 fishing build at the shrimp shoal lost
`small-fishing-net`, `large-fishing-net` and `gut-line` on one parting, `-6/h` each.

The table's own comment says why it is written out — nothing in the language selects an
item by the keyword it carries — but that explains the enumeration, not the taking of
all six. It predates this branch and the line pools are five times what they were, so
it now costs a great deal more when it fires.

*Closes when:* a parting takes the piece that parted. If the language cannot say
"the worn one", that is a finding for `open-human.md` and this line crosses.

## No reference build has ever worn a jewel, so half of every combat row is missing

`tier-build` hands items over and equips them and never slots or allocates, so all
fifteen saves in `content/tiers.dsl` carry empty planes. That is not a rounding error
on the combat rows: regeneration is **1** bare and **3.5** on one cluster with an orb
on it, measured, and what a long fight sustains is exactly that number. Combat reads
0.55× on attack and 0.24× on health at twenty against builds that could not have been
worn by anybody who had opened a chest.

`docs/balance/open-agent.md` already carries this as a build-search line. It is worth
taking on its own first: the search is hours and dressing a tier is one directive per
allocation, and until a tier can wear a jewel no search has anything to search over.

*Closes when:* `npm run tier-build` accepts a jewel and a set of allocations, the combat
tiers are regenerated wearing what the level can reach, and the combat rows are re-read
against them.
