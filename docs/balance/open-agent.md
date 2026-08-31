# What is still wrong that a lane can take

The instrument is built and the curve has landed. **A line is deleted the day it
closes.** The work order it all serves is `.planning/balance-plan-2026-08-31.md`;
what is below is what that plan does not already say to do next.

---

## The rebalance, which the sheet is now specific enough to aim

The ratio sheet reads, per activity per tier — `npm run simulate-activity --
tiers.<activity>-tier-<level> --seeds 2`, the frontier's ratio to `R(L)`:

| | tier 1 | tier 10 | tier 20 |
|---|---|---|---|
| `combat.attack` | 88× | 272× | 240× |
| `combat.health` | 1.1× | 3× | 2.1× |
| `fishing.fishing` | 34× | 95× | 72× |
| `thieving.thieving` | 23× | — | 44× |

**Health is the one skill in the world that is tuned, and it is tuned by
accident.** It is paid per point of damage *taken*, which the player's own pool
and the death that ends the run both bound. Attack is paid per point *dealt*,
which nothing bounds. That asymmetry is the whole finding: the two halves of one
fight are two orders of magnitude apart, and no `xp:` line was ever wrong — the
two lines are `gain 2 * amount experience on damage-dealt` and `gain 15 * ... on
damage-taken` at `content/combat.dsl:42` and `:52`, and they are the only awards
that matter, because they dwarf all 25 authored `xp:` lines together.

It gets worse with level, not better, because `R(L)` troughs at L ≈ 9.4 while the
player's damage only climbs. `R(L)` then rises 57× to level 70, so **later rooms
have to pay more by the minute** — every hunting ground in `content/combat.dsl`
is sized to hand over roughly the same health a minute, which is flat. That was
an open choice while the pace target was open; it is not one now, and the line it
stood on in `docs/skills/open-human.md` was deleted with the ruling.

Two rows are the room and not the offer, and the sheet says so by putting the
runners-up underneath. `entity.tulsa.civilian.pick-their-pocket` reads 23× at
Market Square and 3.1× at all six other places it is offered: the square is the
free-death room, where a run that dies wakes where it fell and so fills the hour
that every other row loses at the death. And the level-1 combat frontier is
`core.melee-combat on combat.chicken` at `tulsa.pasture` — the chicken tops the
world because it does not fight back, so the run never stops.

*Closes when:* the sheet reads near 1 at the frontier for each activity at each
shipped tier.

## The measurement accelerates itself, and now by how much

Attack xp is paid per point of damage dealt (`combat.dsl:42`), a level grants `+1`
flat and `+1%` to the skill's stat (`skill.ts:47-55`) through the unbounded `level`
counter at `stats.ts:46`, and `combat.attack` names `core.attack`. Damage buys
levels which buy damage.

It used to be too slow to see. It is not now: the same offer under the same world,
measured either side of the curve landing, went **28,635 → 62,476 xp/h** — 2.2×,
with no number in the corpus touched. Health xp fell over the same window
(2,880 → 1,305/h) because the character is killing faster and being hit less, which
is the loop closing rather than a second effect.

So an hour is not a rate any level actually holds, and a maximum (§7.2) selects
whichever offer the acceleration inflated most, where a mean would dilute it. This
is a precondition for trusting the ratio column, not an improvement to it.

*Closes when:* a run at a fixed node is measured at several window lengths and the
rate is shown either to converge, naming the level above which it does, or not to.

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

