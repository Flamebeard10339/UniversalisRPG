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

## Nobody has searched the build space, and what that would cost is now known

The nine reference builds in `content/tiers.dsl` spend their pool evenly and wear
the best of each slot the level allows. That is a floor, not an answer: the pool
is a real degree of freedom, and whether the best tier-20 combat build pours
everything into attack is unasked. Nothing carries a cluster jewel at all, so
§6.3's fifteen-rows-per-tier reading does not exist.

What it costs is measured rather than guessed. A whole-town sweep is ~19s at one
seed — ~2.3s of module load and ~0.153s per offer per seed — so a fitness read
over all 242 offers is ~19s and over one activity's 84 combat offers is ~13s. A
greedy pass over six slots at ~6 candidates each is ~36 evaluations, so one
(activity, tier) is minutes and one carrying each of fifteen jewels is hours.
Running the search in-process against one loaded registry, and reading fitness
over one activity's offers rather than the world's, are what make it affordable;
neither is built.

*Closes when:* a seeded, reproducible search improves on a shipped tier build and
says by how much — or is shown not to, which makes the hand-authored floor the
answer and is worth the same finding.

## A stored build can become a different character with no diff

`allocatedPositions` holds position *indices* and a `roll`, and the passive at a
position is looked up at read time (`src/runtime/clusterEffect.ts:31`, `:47-49`).
So editing a jewel's position list, or a passive's bonus range, changes what every
stored build grants with no error and no change on disk. Nine corpus saves carry
cluster planes today and the reference builds will once they carry jewels.

Two claims in `scripts/tier-build.test.ts` already catch the two ways a tier goes
stale that *are* visible — its level, and a slot it left empty — and neither
reaches this one.

*Closes when:* a tier artifact stores a hash of its resolved contribution set,
recomputed and compared on read, so a difference is reported rather than absorbed.

