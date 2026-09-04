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
