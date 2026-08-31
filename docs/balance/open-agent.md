# What is still wrong that a lane can take

The instrument is built and the curve has landed. **A line is deleted the day it
closes.** The work order it all serves is `.planning/balance-plan-2026-08-31.md`;
what is below is what that plan does not already say to do next.

---

## The world pays about fifty times what the curve asks

`R(1)` — the rate the frontier has to pay at level 1 for `T(L) = 3L + 2` minutes a
level — is **1,200 xp/h**. Measured the day the curve landed,
`npm run simulate-activity -- tulsa.in-town --seeds 2`, the best offer a level-1
character can reach is `core.melee-combat on tulsa.civilian` at Market Square, at
**62,476–62,861 xp/h** over a full hour without dying or running dry. Fifty-two
times.

Nothing about that is a surprise — §4.1 of the plan ruled that the awards move
rather than the time function, and §2 that every `xp:` line, drop rate, stat and
timer is in scope. It is written down because the world ships in this state until
the ratio sheet exists to move it with, and because a lane that measures one offer
and finds it wild should know the whole level is.

One thing the curve settles that the world does not yet obey, and it is a shape
rather than a number: `R(L)` troughs at L ≈ 9.4 and then climbs 57× to level 70, so
**later rooms have to pay more by the minute**. Every hunting ground in
`content/combat.dsl` is sized to hand over roughly the same health a minute, which
is flat. That was an open choice while the pace target was open; it is not one now,
and the line it stood on in `docs/skills/open-human.md` was deleted with the ruling.

*Closes when:* the ratio sheet (§7) reads near 1 at the frontier for the levels the
starter town covers.

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
