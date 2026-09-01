# Authoring and the engine, split apart — open, for a lane

## 45 test files still read the shipped corpus

`npm test` fails today when `content/` changes, which means a contributor editing the world in the
game — who cannot run vitest at all, and whose edit is not about the engine — turns a gate red on
work that is not theirs. The corpus's verdict is the oracle's; the suite's belongs to a world the
engine owns.

The engine's world is `src/content/fixture/`: three modules under two packs, three places with
roads between them, the player, a keeper with a counter, a rat that drops what it carries, a quest
that closes on a flag, two sheets — one written over the other — and eight routes, all walking and
round-tripping clean. `worldFixture.ts` reads it, and `FIXTURE_WORLD` is still there for a test that
wants a smaller world than that. Keep the fixture small and keep it complete: a rule with nothing
here to fire on is a rule the suite cannot reach.

It was 83. Thirty-eight of those reached only `content/engine-en.dsl` and no longer reach anything —
the engine's own English moved to `src/content/engine/`, because it is the engine's writing and not
an author's. The guard names each of the 45 left and the shortest way it reaches. The fixture will
have to grow as they come over: nothing in it yet has a cluster jewel, a region, a recipe or a
station, a race, or a second dialogue node, and a test that wants one wants it here.
*Closes when:* `docs/authoring-split/open-tests.test.ts` is green and has been moved into
`scripts/`, where it gates.

## The corpus rules in `src/content/dsl.test.ts` have nowhere to go yet

`describe('the shipped corpus')` holds eight claims that are about the world rather than about the
engine: it loads clean, it prints back to the same registry, every location is reachable from the
starting one, every shop is kept by an entity, no `# save` writes a base into an inventory, no save
restates the layer beneath it, no shop's coin has a value of its own, and every `# test` states its
claim in words. Each derives its own subjects, and each is a rule an author breaks — so each belongs
where an author is told, which is the oracle and the editing page, not vitest.

The ones the loader can refuse outright belong in `validateBuiltRegistry` in `load.ts`, where every
reader — the oracle, `probe`, and the page — reports them for free. The ones that must not stop the
game loading want a second channel beside it: a remark on the built world, derived per rule from
the registry rather than listed per kind.
*Closes when:* every claim under `describe('the shipped corpus')` fires from the load path or from
that channel, `src/content/dsl.test.ts` reaches no corpus, and the suite proves each rule against a
module written to break it rather than against the world.

## CI does not run the corpus's verdict

`npm run oracle -- --at content` is that verdict, and exits non-zero on a corpus that will not load,
holds a line the engine refuses, does not print back to itself, or has stopped walking one of its own
routes. Nothing calls it yet, and `CLAUDE.md` still describes a suite that reads the corpus.
*Closes when:* CI runs it beside `tsc`, `npm test` and `npm run layer-check`, and `CLAUDE.md` says
which of the two gates answers for which half of the tree.

## The bundle's reading of what ships is still checked against content

`src/ui/shippedContent.test.ts` compares `import.meta.glob`'s answer to the filesystem's, module by
module, which is a claim about the build that can only fail because content moved. The fact worth
holding is that the two readings name the same two directories — `src/content/engine` and
`content/` — and that is a fact about two source files, not about anything either directory holds.
*Closes when:* the bridge is a claim about the glob patterns and the directories `shipped.ts` reads,
and the per-module comparison has moved to the corpus's own verdict.
