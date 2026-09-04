# What is still wrong that a lane can take

Combat is the last skill before the MVP, and the push runs in this order: the engine grows
typed damage and a forced action, combat is isolated into its own module, one authoring run
re-cuts the skill onto the types, a parallel wave writes the lessons and the two finale
quests and passes over the eight quests that stand, and a speedrun gives combat a floor.
Rulings taken 2026-09-04 and not re-argued here: damage types are declared in the world and
the engine only knows how a stat enters a swing; a faint is a forced five-second action that
ends at `starting-location`, hardcore taking the pack besides; there is no defense skill and
will not be; the muster is a room; and what pays for a long fight is gear, food and deaths in
whatever mix the speedruns find. **A line is deleted the day it closes.**

---

## The base run's module is merged as it wrote it, and the run never wrote its report

`npm run authorbot -- .planning/combat-expansion.md --target combat` ran on 2026-09-04 and
hit its 150-turn cap while still cutting the muster's numbers, so no report was written and
the muster is at whatever its last edit left it. Its `combat.dsl` (1,325 lines) is copied
into `content/` as it stood: the five types and fifteen stats, the attack skill on
`physical-damage`, the weapons on physical and the iron set carrying resistances, the
jewels renamed to `<rarity>-<role>-<skill>` (`uncommon-berserker-attack`, `rare-thorns-health`,
`unique-rage-attack` and so on), a physical-to-fire conversion stat, a counter, and 84 routes
that all walk. It was never read for reaches: `npm run friction` says what it had to work out.

`npm run oracle -- --at content` is red on one thing said six ways: `# save
combat.iron-band-in-hand` writes the six iron pieces under `"inventory"` where a base has to
stand under `"instances"` as a copy with a roll. The run used that save to sweep the second
band. `npm run probe -- content --record <a route that buys the iron>` prints the body to
paste over it, or the save goes if nothing loads it.

*Closes when:* the gate is green, `npm run ladder-check` and a per-band
`npm run simulate-activity` table are read off the merged module and written into the commit
that closes this, the muster reads as a room at the level-21 rung in the band's shop gear,
and whether the jewels' passives were renamed is stated.

## The wave after the base run has its briefs and has not been dispatched

Nine briefs stand in `.planning/`, each written off a measured gap on 2026-09-04, and each is
one `npm run authorbot -- <brief> --target <module>`, run in the background with `--watch`
beside it. They may run in parallel because each writes one file, with two orders to keep:
`plague-matters.md` after `reverse-infiltration.md` has merged, since it names that quest's
ids; and none before the line above closes, since every one reads combat's ids. The Rat
Conspiracy matches its own note and gets no pass; A Grand Blade's pass waits on the ruling in
`open-human.md`.

    ball-of-a-boy-pass.md        kill-it-with-fire-pass.md    birds-and-the-bees-pass.md
    the-swampy-menace-pass.md    attention-to-detail-pass.md  the-bars-crawl-pass.md
    combat-lessons.md            reverse-infiltration.md      plague-matters.md

*Closes when:* each module is merged with `npm run oracle -- --at content` green and its
reaches read, and the two finale quests walk start to finish.

## Combat has no floor, so its tier saves cannot be deleted

`docs/balance/open-agent.md` holds the line: `tiers.dsl` goes a skill at a time as each gets
a floor, and combat and cooking are what is left. `npm run floors` walks fishing's and
thieving's; nothing walks a fighter from level one to thirty.

*Closes when:* `floors/combat-floor.dsl` walks a bare fighter and a geared one to the band
edges and the combat saves in `content/tiers.dsl` are deleted.

## The muster is a room, and reads as a wall

Crossed from `docs/tulsa/open-human.md` on the ruling of 2026-09-04. Six ratkin warriors at
115 health on a ninety-second respawn kill a tier-20 build in full iron in about five
minutes, and nothing there is aggressive. It is meant to be a fair fight for its band, and
may be cut harder and pay more than a fair one, but a fighter of its level has to be able to
stand in it for an hour.

*Closes when:* the combat floor reaches the muster and its rate reads on the curve for the
level the route arrives at.

## What pays for a long fight is ruled, and nothing has measured the mix

Crossed from `docs/tulsa/open-human.md`. Measured 2026-08-31: every combat room pays on
target while it runs and none can be occupied — the king's road guardsman paid health at
nearly four times the curve for 7% of the hour and died in four seeds of four, because a
faint walked back from the square. Ruled 2026-09-04: gear, food and cheap deaths all pay for
it, and the speedruns find the mix. Food should read useful but expensive: worth eating at a
hard target, not worth eating at grunts farmed for experience. If the floor does not read
that way, food is buffed or nerfed, and that is cooking's number rather than combat's.

*Closes when:* the combat floor carries one route that eats and one that does not at the
same two targets, and the sheet says which won where.
