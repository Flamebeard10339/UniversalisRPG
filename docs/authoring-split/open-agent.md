# Authoring and the engine, split apart — open, for a lane

## CI does not run the corpus's verdict

`npm run oracle -- --at content` exits non-zero on a corpus that will not load, holds a line the
engine refuses, does not print back to itself, has stopped walking one of its own routes, or holds
one of the ten things the loader takes and an author probably did not mean. Nothing calls it, so the
gate that answers for `content/` is a gate somebody has to remember to run.
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

`src/runtime/worldRemarks.ts` holds both: seven rules that want only the registry, and three that
walk — prose to a surface, a root module loaded on its own, a pack read off each module's own source.
The walking ones take the sources as well, because the prose probe is a module laid over the world
and a registry cannot be added to. It works, and it means a rule's shape decides which list it joins
rather than anything about what the rule is for.
*Closes when:* either every rule takes the same two arguments and there is one list, or the two
lists are named for what actually separates them.

## The fixture world has grown to five modules and nothing says when it is too big

`src/content/fixture/` is now core, town, combat and quests, under two packs: nine places, a region,
two activities, four cluster jewels, a shop, a chest, four speakers, a recipe, five sheets and
seventeen routes. Every piece of it was added because a claim had nothing to fire on without it,
which is the right reason — but the rule *keep it small and keep it complete* has only the second
half enforced, by the claims themselves going vacuous.

Nothing yet says a piece of it has stopped earning its place. A shape nobody's claim reaches any
more is filler, and filler is what makes a fixture stop being readable.
*Closes when:* something reports a section of the fixture that no test and no route reaches — or you
decide that a world small enough to read whole does not need one.
