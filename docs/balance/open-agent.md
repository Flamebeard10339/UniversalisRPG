# What is still wrong that a lane can take

The instrument is built and the curve has landed. **A line is deleted the day it
closes.** The work order it all serves is `.planning/balance-plan-2026-08-31.md`;
what is below is what that plan does not already say to do next.

---

## The portal is built and nothing has been played through it

`--off quests` is real on both `npm run probe` and `npm run simulate-activity`, and
the settings page offers the same names. What nobody has done is *play* the town
that comes out: 107 of 202 offers stand at the market square with no quest in the
world, and whether the first hour of that is a game is the question this branch
exists to answer.

The sheet has since been read questless at every shipped tier, which is the whole of
`docs/tulsa/`, and turning the quests off moves no frontier in the town: the same
offers top the same skills either way. That is why the questless world needed no
table of its own. What is left of this line is the walk.

*Closes when:* a `# test` walks the questless town from the market square through
one activity of each of the five skills.

## A route through the portal itself is not proved

The harness offers `mods.pack` and `mods.module`, and `src/content/packs.test.ts`
holds the reading and the arithmetic. What no test does is turn a pack off through
the driver and open the world again: the save is pruned on the way through
(`loadSaved` returns `PruneWarning`s), and nothing pins what a player loses.

*Closes when:* a driver test turns the quests pack off, reopens, and says what
became of a save that was standing in a quest — either it survives with the quest
pruned, or it is kept and the player is told, which is what `Resumption` already
distinguishes.

## A fixture marked `aggressive` may not be hostile at all

`factionMask` (`src/content/registry.ts:84-87`) answers `WORLD_BIT` for an entity
that declares no faction, and `hostile` is a mask intersection — so two faction-less
entities are on the **same side** and neither ever opens on the other. A fixture in
the simulate-activity tests had a wasp marked `aggressive` that had therefore never
engaged anyone, leaving the aggression path unexercised while reading as covered.
Fixed there; a manual sweep of the others has a shelf life of one commit.

*Closes when:* a derived claim in `src/content/dsl.test.ts` holds every `aggressive`
declaration in the shipped corpus to being hostile to the player who would meet it —
subjects generating themselves, per `CLAUDE.md`'s Mission.

## Whether any row in the matrix is non-monotone

Reading "the lowest tier that earns from it" as a difficulty assumes more of a stat
never makes an outcome worse. The shipped thorns does **not** break it:
`# passive retribution` is `when hit: drain: 5 health from them`
(`combat-expansion.dsl:127-129`), a flat cost per landed hit, so total thorn damage
falls as attack rises. A scaling reflect would break it, and so would anything keyed
on a ratio such as an enrage below half health. A violation is a finding about the
world, not a tool failure.

*Closes when:* the matrix (§6.2) exists and is checked for non-monotone rows, and
either none are found or the ones found are named.

## The build space has been walked greedily and not searched

`npm run tier-build -- <activity> <level> [<item>...] --grow <stat>...` spends every
point every worn piece dropped with, scoring each move by applying it and reading
`statValue` back off the engine. All twelve reference builds in `content/tiers.dsl`
now wear what they spend — 0 points unreached in all twelve — and the greedy pass is
~1.5s per build rather than the hours a slot-by-slot sweep was costed at.

Greedy is a floor in exactly the way the even experience split is. It takes the next
move whose played-out plane reads highest, one piece at a time and in the order they
went on, so a piece that goes on first takes the jewels it likes and a corridor that
would have paid three nodes later is never crossed. Whether pouring everything into
attack is right is still unasked.

`combat-expansion`'s six jewels are not offered to the combat tiers, because `tiers`
does not declare it as a dependency. Adding it is an authored decision.

*Closes when:* a seeded, reproducible search improves on the greedy answer and says
by how much — or is shown not to, which makes greedy the answer and is worth the
same finding.

## Sixteen hand-written saves describe a character the engine cannot mint

`npm run test` is red on one claim in `src/content/dsl.test.ts`, carrying sixteen
findings of one shape: *"# save X carries core.hand-axe under `inventory`, which no
route through the world reaches: receiveItem mints a base as an instance."* Subjects
are `tulsa` (×3), `birds-and-the-bees` (×3), `the-bars-crawl` (×2), `fishing`,
`first-steps`, `kill-it-with-fire`, `the-rat-conspiracy`, `the-swampy-menace`.

The cause is this branch giving `item-level:` to thirty-one bases that had a slot and
none. A base with a plane arrives as a minted copy, so a fixture listing one as a bare
inventory count is now describing something no player could be holding — the same
class of error as a reference build wearing an empty plane, and the derived claim
caught it without being asked to. The twelve `tiers` saves were in this set and are
clean.

`npm run migrate-saves` will not do it: these are already at `SAVE_VERSION`, and the
shape did not change — the world did.

*Closes when:* the sixteen carry their bases under `instances` and the claim is green.

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

