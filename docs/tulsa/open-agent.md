# What is still wrong that a lane can take

The town's own ladder: one to three activities per ten levels per skill, standing
without a quest in the world. **A line is deleted the day it closes.**

The sheet is `npm run simulate-activity -- tiers.<activity>-tier-<level> --off quests`.

---

## Eight commits of town dialogue sit unmerged on a branch

`claude/game-text-rewrite-007476` holds a rewrite pass over how Tulsa's people talk — Miki
keeping a house rather than a tutorial, Oolga saying no first and counting her rats out loud,
Larry unsurprised, the duke stalling in his own voice, the captain not wanting to hear what
Oolga asked for. Eight commits, none of them in `main`.

It was kept when every other branch was deleted on 2026-09-04, because it is real writing and
nothing else holds it. Its worktree is gone; the branch is all there is.

It has not been read against the world as it now stands, and the world moved a long way that
day — the whole combat re-cut, the passives, five quest passes. Prose does not conflict with
balance, so the merge should be quiet, but the lines were written against the old town.

*Closes when:* the pass is merged with `npm run oracle -- --at content` green, or it is read and
deliberately dropped, and either way the branch is gone.

## The grumpy crafter was narrowed around an engine limit that does not exist

The run that wrote `content/the-grumpy-crafter.dsl` reported that a dialogue `when:`, a
`-> choice (when ...)` or an in-body `if ...:` reading `has <item>` never sees an item
declaring `item-level:`, and that a choice whose body holds a bare `take:` of such an item is
silently dropped from the menu. It spent a large share of a fifty-minute run on it and
designed around it: "any base, any jewel" became a fixed, named trio, two of the three pieces
are socketed off-screen because nothing could `take:` them, and every hand-over became a shop
transaction with four new shops laid over existing bodies.

**Re-measured against a minimal world and none of it reproduces.** A choice gated on
`has <an item-level item>` is offered; a choice whose body `take:`s one is offered and takes
it; and `has` sees the item while it is worn. The scratch world that shows this is four
sections and a handful of routes, and building it cost less than the run spent working around
the conclusion.

So the symptom was real and the cause named for it was not. What the true cause was is
unknown — likely something in the run's own lines rather than in the engine — and it is worth
finding, because the same wall will stop the next lane. The module itself works and its three
routes walk; what is wrong is only that its shape was chosen to avoid something imaginary.

*Closes when:* the real cause of the dead choice is named, and the quest either takes any base
and any jewel as the design asked or the narrowing is defended on its own merits rather than
on the engine's.

## Two of Kelsa's hives write the harvest out, beside a shared action that shows the answer

`tulsa.dsl` writes `harvest comb:` twice — `time: 8`, `give: 1 honeycomb`, differing only in
`say:`. Fourteen lines above it, `# action tulsa.search-the-comb` is exactly the pattern that
answers it: one action, three hives `uses:` it, each writing only its own `+on success:`. The
file gets it right on the line above and wrong on the line below.

Change the harvest to two comb or twelve seconds and one hive silently pays differently; a
fourth hive gets no harvest at all unless somebody remembers.

*Closes when:* a `# action harvest-the-comb` holds the time and the give, and each hive says
only its own words.

## The muster is ungated, so the tenth level's best fight is the twentieth's room

Read at tier-10 with the tiers dressed, attack inside the town makes a good ladder —
north-road 1,800/h against a curve asking 1,593 (1.13x), castle-gate and the barracks
1,400, market square 1,218, down through kiln-lane and the king's road to the castle
hall at 503. Nothing there overshoots.

The muster pays **2,638/h, 1.66x**, and tops the sheet. It is past the tunnels and
nothing stops a level-10 character walking into it — no combat action in the corpus
carries a `hidden if: level.<skill> < n` at all, so combat has no bands, only rooms a
weak build happens to die in. At tier-1 that soft gate holds (the market square still
tops the sheet at 1.0x); by ten it does not.

So the 1-10 attack band is not over-tuned and wants no rebalancing. What it wants is
the gate.

*Closes when:* the muster is reachable only by a character the band was meant to hand
over to, and tier-10's best attack offer is inside the town.

## Nothing holds a band gate shut

Five actions were said to be shut by `hidden if: level.<skill> < n` with nothing walking up to
one. Two things about that were measured wrong, both on 2026-09-03.

**The corpus writes the gate two ways.** Exactly two actions carry `hidden if: level.<skill> <
n` — the pike reach at 11 and the sturgeon hole at 16, both fishing's. The three thieving gates
the line named are `requires: level.thieving >= n` now, and there are fifteen of those. A claim
keyed on one spelling misses most of its subjects, so it has to read the gate off the condition
rather than off the keyword.

**It cannot live in `src/content/dsl.test.ts`.** The offering machinery is all in
`src/runtime/`, `layer-check` sweeps `.test.ts` files, and `content` may not point up at
`runtime` — verified by running the checker's own helpers. `src/runtime/fixtureRoutes.test.ts`
is the file already shaped like it, and `performable` is the read. The fixture carries no
level-gated action today, so one has to go in with the claim.

But a fixture-bound claim proves the mechanism and can never see the shipped gates, which is
what the line is about. The other home reaches them: `src/runtime/worldRemarks.ts` runs over the
shipped world under `npm run oracle -- --at content`, every rule there derives its own subjects,
and the remark to write is *this action carries a level band and no `# test` stands at it*. That
covers the six gates the fishing expansion adds by having been written, and it is an authoring
answer rather than a suite one. The two are not alternatives — the claim proves the engine
honours a band, the remark reports a band nobody walked to.

*Closes when:* a remark in `src/runtime/worldRemarks.ts` names a level-gated action no route
stands at, reading the gate off the condition so both spellings are caught, and a claim in
`src/runtime/fixtureRoutes.test.ts` holds the fixture's own gate shut under its band and open at
it.

## Two rooms nobody has walked into

The muster past the tunnels is reachable only by reading the file. Every other room
in the town is walked by something, and `walking-the-town` predates it. The two new
dishes are in the same position: nothing in the corpus has ever cooked a pike.

The den is no longer a road: thieving 1.2.0 puts it behind a hatch in the doss house
that opens to a password or a thousand coin, and two `locked-out` routes in
`content/thieving.dsl` stand in it. Nothing yet picks a pocket there.

*Closes when:* `walking-the-town` reaches the muster, and a `# test` takes one offer at
each — a pocket in the den, a swing at the muster — and one cooks a pike at a stove.

## The thieving jewel has never been put in anything

`a-quiet-hour` ships with three passives on a ring and drops one time in
twenty-two off the strongbox, and nothing has ever socketed one. The lockpicks carry
`item-level: 8-14` so they have a plane to take it. The Angler's Knot has stood in
exactly this position since it was written, so this closes both or neither.

*Closes when:* a route slots each into its base and allocates a passive, the way
`growing-a-heartwood-blade` does for the blade — one route, two jewels, since what is
being proved is the plane and not the jewel.

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
