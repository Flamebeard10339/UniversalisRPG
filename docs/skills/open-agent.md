# What is still wrong that an agent can take

Everything here is open; nothing here is done. **A line is deleted the day it closes.**
Each says what is wrong, how it is known, and what would close it. All four below are
proved headlessly — `npm run probe`, `npm run oracle`, `npm test` — and each was met
while the seven skill modules were being written, so each has a reproduction.

---

## An entity cannot write `on <module>.<event>:`

`# entity player` in `content/tulsa.dsl` handles fishing's `line-parted`, and writing it
qualified is refused: `tulsa:908:1 parse: unexpected content: "on fishing.line-parted:"`.
The handler label itself is fine — `HANDLER_LABEL` in `src/content/sections/entity.ts`
matches a dotted id — but a body line is only read as an entry heading when it matches
`KEY` in `src/grammar/section.ts`, whose key class is `[a-z0-9 -]` and has no dot in it.

Unqualified resolution covers it, which is why the corpus loads: `on line-parted:`
resolves through tulsa's dependency on fishing. So this costs nothing today and refuses
something an author has every reason to write, in a message that names neither the rule
nor the fix.

*Closes when:* a dotted entry heading either parses, or is refused with a message saying
an entry names an event unqualified and why. Widening `KEY` is the obvious move and is
not obviously safe — `# locale` bodies are keys with dots in them, and they reach the
same loop — so whichever way it goes, a test over both kinds is part of it.

## `# recipe`'s `skill:` says level and means experience

`npm run oracle -- recipe` prints `skill: <skill> <level>   e.g. skill: smithing 5`, and
`recipeSkillValue.forms` in `src/content/sections/recipe.ts` says the same. What the
number actually does is `compile()` pushing `{ kind: 'xp', skill, amount }` — it is the
experience the craft pays, and nothing anywhere gates a recipe on a level. Every recipe
in `content/cooking.dsl`, `content/smithing.dsl` and `content/crafting.dsl` is written
against the real meaning, so the corpus is right and the word is wrong.

*Closes when:* the hole is named for what it is in `recipeSkillValue` and the oracle
prints that, or a level gate is built and the word becomes true. The two are different
sizes; the first is the one this line is about.

## A cross-module section edit can be written but not printed

A module may write `# location tulsa.market-square` and add to it with `+entities:`,
and the loader accepts it. If the added value names anything the *owning* module cannot
see, the corpus stops round-tripping: `serializeRegistryModule` prints the merged section
into the owner's file, and the owner cannot resolve the reference. Reproduced against
`content/combat.dsl` adding `8 civilian` to a Tulsa room, and again with
`+skills: combat.attack` on `core.player` — both loaded clean and both failed
`dsl.test.ts > prints back to a universe that loads to the same registry` with
`names combat.attack, but combat is not this module or one of its dependencies`.

No shipped module does this any more; the corpus was restructured so that whoever owns a
section can see everything written into it. So the rule exists and is enforced only by a
test three layers away from where an author would break it.

*Closes when:* the load path refuses a cross-module edit whose references the owning
module cannot resolve, naming the module and the reference — or the printer learns to
put an edit back in the module that wrote it. The refusal is much the smaller of the two
and is the one that would have saved this session an afternoon.

## The staging surface drops what a later module added

`addressable` in `src/ui/authoringSurface.ts` keeps one section per address and now keeps
the one whose module owns the id. A `local-changes` edit staged over that section loads
last, so it replaces the merged value rather than the owner's body — every addition a
later module made to that section is silently gone from what is played. Reproduced while
Tulsa's rooms were being written from `content/combat.dsl`: dragging a room on the map
staged it without the entities and roads combat had added, and `mapEdit.test.ts` failed
against the registry rather than against the section.

Not reachable from the shipped corpus today, for the same reason the line above is not.

*Closes when:* a staged section either carries the additions the modules after it made,
or the driver says plainly that it is shadowing a section other modules also write —
`driver.ts` already warns about shadowing a shipped section and this is the same warning
with one more thing to say.

## The tackle a parted line can cost is a list again

`on line-parted:` used to enumerate all six pieces of tackle by name, taking one of each;
the owner caught it on 2026-08-26 and it is now `# droptable fishing.parted-tackle`,
sitting under the tackle that declares it rather than in Tulsa. That is a better home and
a much smaller list — but it is still a list, and a seventh net added next month is still
a thing somebody has to remember.

The set is derivable: what can part is exactly what grants line to lose. Every item in the
droptable carries `+n max-line-health`, and no item carrying it is missing from the
droptable — today.

*Closes when:* a claim in `src/content/dsl.test.ts` derives its own subjects — *every item
granting `max-line-health` is named by `fishing.parted-tackle`, and nothing else is*. That
file's claims already pick their subjects off the shipped corpus, so this is one claim
beside them and no new file. It closes the last hand-kept list in the skill.
