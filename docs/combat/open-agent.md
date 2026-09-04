# What is still wrong that a lane can take

Combat is the last skill before the MVP, and the push runs in this order: the engine grows
typed damage and a forced action, combat is isolated into its own module, one authoring run
re-cuts the skill onto the types, a parallel wave writes the lessons and the two finale
quests and passes over the eight quests that stand, and a speedrun gives combat a floor.
Rulings taken 2026-09-04 and not re-argued here: damage types are declared in the world and
the engine only knows how a stat enters a swing; a faint is a forced five-second action that
ends at `starting-location`, hardcore taking the pack besides; there is no defense skill and
will not be; the muster is a room; what pays for a long fight is gear, food and deaths in
whatever mix the speedruns find; **food is gear with an upkeep cost and nothing more**, so
the sheet never had a special case to answer; and A Grand Blade is **two** quests, a
level-one miniquest that teaches the plane and a hard finale that pays a weapon.
**A line is deleted the day it closes.**

---

## The passive ids were not renamed, and were ruled to be

The base run renamed the six jewel items it wrote to `<rarity>-<role>-<skill>` and stopped
there. The six older `<name>-jewel` items — `keen-edge-jewel`, `stout-heart-jewel`,
`tempered-will-jewel`, `great-work-jewel`, `causeway-jewel`, `crossroads-jewel` — and all
thirty-two `# passive` sections still carry flavour ids. Ruled 2026-09-04 that the passives
are renamed too and their flavour moves into `title:`.

This is mechanical work rather than authoring: `npm run rename-section` writes one id
everywhere the world reads it and refuses unless the registry afterwards differs by exactly
that id. **It was deliberately not done while the wave was in flight**, because a run holds a
copy of `content/` taken when it started and a module that merges afterwards would name the
old id.

*Closes when:* every `# passive` and the six `<name>-jewel` items carry ids saying what they
are, each has a `title:` holding the flavour it gave up, and
`npm run oracle -- --at content` is green.

## The wave after the base run is three dispatched of eleven

Nine briefs stood in `.planning/` on 2026-09-04, each written off a measured gap; the ruling
on A Grand Blade added two more (`the-grumpy-crafter.md`, `a-grand-blade-pass.md`). Each is
one `npm run authorbot -- <brief> --target <module>`, run in the background with `--watch`
beside it. **Three at a time**, so a fault in the tool or the oracle is caught before it has
eaten eight runs. Orders to keep: `plague-matters.md` after `reverse-infiltration.md` has
merged, since it names that quest's ids; `a-grand-blade-pass.md` after
`the-grumpy-crafter.md`, since the pass hands the teaching half to it; and The Rat Conspiracy
matches its own note and gets no pass.

    dispatched 2026-09-04:  combat-lessons        reverse-infiltration    ball-of-a-boy-pass
    waiting:                kill-it-with-fire-pass   birds-and-the-bees-pass
                            the-swampy-menace-pass   attention-to-detail-pass
                            the-bars-crawl-pass      the-grumpy-crafter
                            a-grand-blade-pass       plague-matters

*Closes when:* each module is merged with `npm run oracle -- --at content` green and its
reaches read, and the two finale quests walk start to finish.

## Every combat room but the pasture stops short, and that is the balance problem

Measured 2026-09-04 off the merged module, standing a character on the declared ladder at
three rungs and reading every offer in each room over the hour window
(`npm run simulate-activity -- combat.iron-band-in-hand --at <room> --ladder
combat.physical-damage=<n>,core.max-health=<n>`). What the whole window paid, against what
the curve asks:

    rung                  5              12             21
    proving-ground   A .13 H .06    A .13 H .23    A .13 H .26
    sewer-junction   A .07 H .09    A .20 H .30    A .30 H .56
    pasture          A .67 H .27    A .69 H .27    A .69 H .27
    kings-road       A .29 H .09    A .29 H .41    A .29 H .66
    north-road       A <.01 H .06   A .02 H .23    A .21 H .49
    sewer-locked     A <.01 H .06   A .05 H .03    A .05 H .03
    the-muster       A .08 H .07    A .63 H .32    A 1.8 H .13
    swamp-mire       A <.01 H .06   A .19 H .15    A .19 H .15

**The pasture is the only room in the world that ran the full 3,600 seconds.** Every other
room stopped short in every seed at every rung, and the rest of the hour paid nothing — which
is the whole of why the column reads the way it does. Two different causes wear the same
message: at the low rungs it is a faint ending the offer after ten seconds, and at rung 21 it
is the room running out of things to kill. The rates *while it ran* are healthy — the muster
pays 13,000/h of attack experience in the twelve minutes it lasts — so nothing here is
underpaying per kill. What is missing is a reason to still be standing there at minute
fifty-nine.

*Closes when:* a lane has changed population, respawn or aggression so that at least the
band-appropriate room of each band runs the window out at its own rung, and the table above
is re-read against the change.

## Combat has no floor, so its tier saves cannot be deleted

`docs/balance/open-agent.md` holds the line: `tiers.dsl` goes a skill at a time as each gets
a floor, and combat and cooking are what is left. `npm run floors` walks fishing's and
thieving's; nothing walks a fighter from level one to thirty.

*Closes when:* `floors/combat-floor.dsl` walks a bare fighter and a geared one to the band
edges and the combat saves in `content/tiers.dsl` are deleted.

## The muster is a room, and now reads as a room that runs out

Crossed from `docs/tulsa/open-human.md` on the ruling of 2026-09-04, and re-measured the same
day against the merged module. It is no longer the wall it was: at the level-21 rung a
fighter in the iron band clears it, pays 1.8× the curve in attack experience, and **empties
it in 734–778 seconds of the 3,600-second window in four seeds of four**. Health experience
is 0.13× — the warriors barely mark a fighter cut for their rung, so the room trains one arm
and not the other. Six warriors on a ninety-second respawn is a twelve-minute room.

*Closes when:* the muster runs the hour out at the level-21 rung, its health experience reads
on the curve as well as its attack experience, and the combat floor reaches it.

## The shop ladder falls behind from level 20, and the drops run away above it

`npm run ladder-check`, read 2026-09-04 off the merged module:

    combat.attack (combat.physical-damage)      shop        anywhere
      level 10   ladder asks  63.0            4.0 short    74.6 over
      level 20   ladder asks 133.0           55.2 short    33.6 over
      level 30   ladder asks 203.0          104.4 short     5.5 short

    combat.health (core.max-health)             shop        anywhere
      level 10   ladder asks  63.0           10.2 short   641.9 over
      level 20   ladder asks 133.0           63.4 short   626.6 over
      level 30   ladder asks 203.0          114.6 short   613.3 over

The shop residual is the expected shape — shops are meant to be about a fifth of the ladder
by thirty — and the level-20 and level-30 gaps are what an obscure seller in the world is
for; `the-grumpy-crafter` brief is pointed at part of it and `a-grand-blade-pass` at the
level-30 attack residual. **What is not the expected shape is `combat.health` reading 613
over the ladder at every rung when everything in the world is counted.** That is one or two
health jewels paying an order of magnitude more than the ladder wants, and it is a content
bug rather than a residual.

*Closes when:* the health jewels are re-cut so that `it exists anywhere` lands within the
band the other skills land in, and `ladder-check` is re-read.

## What pays for a long fight is ruled, and nothing has measured the mix

Crossed from `docs/tulsa/open-human.md`. Ruled 2026-09-04: gear, food and cheap deaths all
pay for it, and the speedruns find the mix. Ruled the same day that **food is gear with an
upkeep cost** — a bonus to stats, priced by what it costs to keep eating — so there is no
question about whether the sheet may eat: a build that eats is a build stood up with those
stats, exactly as a build that wears a helmet is. Food should read useful but expensive:
worth eating at a hard target, not worth eating at grunts farmed for experience. If the floor
does not read that way, food is buffed or nerfed, and that is cooking's number rather than
combat's.

*Closes when:* the combat floor carries one route that eats and one that does not at the same
two targets, and the sheet says which won where.
