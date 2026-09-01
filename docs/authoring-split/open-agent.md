# Authoring and the engine, split apart — open, for a lane

## One test file still reads the shipped corpus

`npm test` must not be able to fail because `content/` changed: a contributor editing the world in
the game cannot run vitest, so a gate they can redden is a gate nobody can answer. The corpus's
verdict is `npm run oracle -- --at content`; the suite's world is `src/content/fixture/`.

Keep that world small and keep it complete: a rule with nothing there to fire on is a rule the suite
cannot reach, and a test that needs a shape it has not got adds the shape rather than reaching into
`content/`. `FIXTURE_WORLD` in `worldFixture.ts` is still the cheaper habit where a test wants a
world smaller than the whole fixture.

What is left is `src/runtime/integration.test.ts`, and it is four different jobs:

*Already the oracle's, so they go.* That every module in `content/` assembles into one universe, and
that every route the corpus ships walks — `npm run oracle -- --at content` says both, and says them
where an author can hear.

*Straight swaps.* That `core` loads identically from a CRLF checkout with or without a BOM and lands
the kinds it declares; that a swing is spent out of the range it stands at; that health starts full,
drains as something bites back and regenerates from a meal; that sitting is worth more than standing.
None is about tulsa.

*Wants the fixture to fight properly.* The archetype claims — rage accumulating and moving attack and
nothing else, a stack paying separately from its count, poison held on the struck party and falling
its pool, a debuff lifting on its own clock, thorns costing the striker — replay tulsa's own routes.
They want rage, poison and thorns written into the fixture, with routes to reach each. That is the
one substantial piece left and it is a piece of its own.

*An author's finding.* That every archetype has one flat jewel and one percent jewel and no archetype
two of a kind is a rule about the world tulsa ships, not about the engine, and belongs beside the
other remarks.
*Closes when:* `no-test-reads-the-corpus` passes, and the proof has moved out of here into
`scripts/`, where it gates.

## The doors into the corpus are watched, not shut

The guard reads the tree: no test may name `CORPUS_DIR`, which is exact, since nothing else in the
tree has any use for that name. What a reading cannot see is a test that builds the path itself —
`readContent('content')` in `scripts/migrate-saves.test.ts` is one. The rule should not be a reading
at all: under vitest the corpus should not open, so that a test cannot read it however it tries.

`shipped.ts` is the one place that opens it, and refusing there costs four lines. It cannot land
until the file above is done, because it would redden it at once.
*Closes when:* every reader in `shipped.ts` throws under `process.env.VITEST`, naming the fixture,
and the guard's `shuts every door` claim passes because of it.

## CI does not run the corpus's verdict

`npm run oracle -- --at content` exits non-zero on a corpus that will not load, holds a line the
engine refuses, does not print back to itself, has stopped walking one of its own routes, or holds
one of the nine things the loader takes and an author probably did not mean. Nothing calls it.
*Closes when:* CI runs it beside `tsc`, `npm test` and `npm run layer-check`.

## `journal.ts` names three group ids that only `core` can supply

`STANDING_GROUP` is `core.quest-unstarted`, `core.quest-started`, `core.quest-complete` written out
in the engine, so a world whose furniture module is called anything else has an uncoloured journal
and nothing says so. It is why the fixture's furniture module is `# info core`: the engine already
requires a world to have one, and every other engine-to-content coupling in `src/` is an example in
a comment rather than a lookup.

The world should say which group means which standing, the way a group already says which kind it is
standard for, rather than the engine naming the ids.
*Closes when:* a `# group` can declare the standing it stands for, `journal.ts` reads that off the
registry, and the three ids are gone from `src/`.

## A remark that has to run the world is not the same shape as one that reads it

`src/runtime/worldRemarks.ts` holds both: six rules that want only the registry, and three that walk
— prose to a surface, a root module loaded on its own, a pack read off each module's own source. The
walking ones take the sources as well, because the prose probe is a module laid over the world and a
registry cannot be added to. It works, and it means a rule's shape decides which list it joins.
*Closes when:* either every rule takes the same two arguments and there is one list, or the two
lists are named for what actually separates them.
