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

**The corpus writes the gate two ways.** Some actions carry `hidden if: level.<skill> < n`,
all of them fishing's; the thieving gates the line named are `requires: level.thieving >= n`.
Both counts have moved since this was written and will move again, so read them —
`grep -rn 'hidden if: level\.' content/` and `grep -rn 'requires: level\.' content/`. A claim
keyed on one spelling misses most of its subjects, so it has to read the gate off the
condition rather than off the keyword.

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
