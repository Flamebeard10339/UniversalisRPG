# Authoring and the engine, split apart — open, for a lane

## Twelve test files still read the shipped corpus

`npm test` must not be able to fail because `content/` changed: a contributor editing the world in
the game cannot run vitest, so a gate they can redden is a gate nobody can answer. The corpus's
verdict is `npm run oracle -- --at content`; the suite's world is `src/content/fixture/`.

Keep that world small and keep it complete: a rule with nothing there to fire on is a rule the suite
cannot reach, and a test that needs a shape it has not got adds the shape rather than reaching into
`content/`. `FIXTURE_WORLD` in `worldFixture.ts` is still the cheaper habit where a test wants a
world smaller than the whole fixture.

It read 83 by the first count, which walked the import graph and counted a test that merely imported
a CLI. What matters is which tests actually call a door, and that is twelve:

*Swap the world once the claim is re-pointed.* `scripts/lib/tiers.test.ts` and
`scripts/tier-build.test.ts` read tier costs off the shipped skills and activities;
`scripts/play-cli.test.ts` and `scripts/printedWords.test.ts` print terminal views of the tutorial
island; `scripts/playbot.test.ts` plays it. Each was tried as a straight swap and each failed on
what it asserts rather than on the world it loads — the fixture has one activity and two skills, and
these are claims about a ladder. They want the fixture grown or the claim rewritten, one file at a
time.

*Read the corpus directory itself.* `scripts/probe.test.ts`, `scripts/consolidate.test.ts` and
`scripts/authorbot.test.ts` name `CORPUS_DIR` to get a directory of realistic modules on disk.
`src/content/fixture` is one, and all three tools already take a directory.

*Their own shapes.* `src/content/shipped.test.ts` proves the standing-world derivation against an
independent reading of the same corpus; the derivation wants to move somewhere pure over
`ModuleSource[]` and be proved against sources written for it, leaving `shipped.ts` holding only the
filesystem. `src/runtime/integration.test.ts` replays tulsa's own buff routes — rage, poison, thorns
— and wants those written into the fixture. `src/runtime/proseReach.test.ts` walks every prose field
to a surface and knows which fields have none; over the fixture two more go unsaid, which is either
a hole in the fixture or a real gap the corpus was covering for. `src/ui/shippedContent.test.ts` is
the bundle bridge, below.
*Closes when:* `no-test-reads-the-corpus` passes, and the proof has moved out of here into
`scripts/`, where it gates.

## The doors into the corpus are watched, not shut

The guard reads the tree: no test may name `CORPUS_DIR`, which is exact, since nothing else in the
tree has any use for that name. What a reading cannot see is a test that builds the path itself —
`readContent('content')` in `scripts/migrate-saves.test.ts` is one. The rule should not be a reading
at all: under vitest the corpus should not open, so that a test cannot read it however it tries.

`shipped.ts` is the one place that opens it, and refusing there costs four lines. It cannot land
until the twelve above are done, because it would redden every one of them at once.
*Closes when:* every reader in `shipped.ts` throws under `process.env.VITEST`, naming the fixture,
and the guard's `shuts every door` claim passes because of it.

## CI does not run the corpus's verdict

`npm run oracle -- --at content` exits non-zero on a corpus that will not load, holds a line the
engine refuses, does not print back to itself, has stopped walking one of its own routes, or holds
something the loader takes and an author probably did not mean. Nothing calls it.
*Closes when:* CI runs it beside `tsc`, `npm test` and `npm run layer-check`.

## The bundle's reading of what ships is still checked against content

`src/ui/shippedContent.test.ts` compares `import.meta.glob`'s answer to the filesystem's, module by
module, which is a claim about the build that can only fail because content moved. The fact worth
holding is that the two readings name the same two directories — `src/content/engine` and
`content/` — and that is a fact about two source files, not about anything either directory holds.
*Closes when:* the bridge is a claim about the glob patterns and the directories `shipped.ts` reads,
and the per-module comparison has gone to the corpus's own verdict.

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
