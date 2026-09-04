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
the sheet never had a special case to answer; A Grand Blade is **two** quests, a level-one
miniquest that teaches the plane and a hard finale that pays a weapon; **damage climbs at a
fifth of health so an even fight takes five blows**; **stats that meet in an adversarial
check share one ladder**, or the check stops meaning what it looks like it means; **a
foe's toughness is typed resistance, never flat damage reduction**; and **a foe is
classified by tier rather than cut one at a time**, the four tiers being declared in
`content/combat.dsl` and the shape of them in `src/content/sections/tier.ts`:

    tier      seconds to fell    damage share    experience share    drops
    mob             7                0.8               0.7           common
    normal         15                1.0               1.0           uncommon
    elite          30                1.4               1.3           rare
    boss           75                1.75              0.5           unique

Normal is the curve, so a room of them is on pace and elites pay above it. Damage share is
against survivable incoming over a **60-second** window, which is the one figure assumed
rather than ruled — say if it should be another. Damage share is per body, and a place is
single combat unless it says `multicombat`, so a room of six is one at a time until it says
otherwise.
**A line is deleted the day it closes.**

---

## Every number in combat.dsl is cut against ladders that have since moved

Two things changed under the world on the afternoon of 2026-09-04, after `combat.dsl` was
written, and nothing in `content/` moved with either. A stat that deals a damage type now
climbs at a fifth of the health ladder rather than at the same rate; and flat damage
reduction now takes its cut of the whole blow rather than only of the untyped `attack` term.

`npm run ladder-check`, read after both landed:

    combat.attack (combat.physical-damage)      shop         anywhere
      level 10   ladder asks  12.6           46.4 over     125.0 over
      level 20   ladder asks  26.6           51.2 over     140.0 over
      level 30   ladder asks  40.6           58.0 over     156.9 over

    combat.health (core.max-health)              shop         anywhere
      level 10   ladder asks  63.0           10.2 short    641.9 over
      level 20   ladder asks 133.0           63.4 short    626.6 over
      level 30   ladder asks 203.0          114.6 short    613.3 over

**A skill's level grants its own stat, which is what makes the attack row so stark.** A bare
character with no gear at all stands at physical-damage 1.01 / 11 / 24 / 39 at levels
1 / 10 / 20 / 30, against a ladder asking 0 / 12.6 / 26.6 / 40.6 — so levelling alone very
nearly *is* the damage ladder. That is an independent confirmation of the one-fifth figure,
and it means every point of damage on a weapon or a jewel is overshoot rather than most of
the climb. Health runs the other way: levelling gives 31 / 44 / 60 / 78 against a ladder
asking 0 / 63 / 133 / 203, so the rest is meant to come off gear, which is why that row reads
short from a shop.

Three faults with three different answers, which is why this is one brief and not three: the
attack rows are five-fold over because they are the old ladder showing through; the health
shop row is an ordinary residual wanting gear the world has not got; and the health drop row
is 613 over **and flat across every rung**, which is not a curve fault at all but something
granting a large fixed amount. The brief is `.planning/combat-expansion/combat-recut.md`, and it also carries
the sweep moving foe toughness off flat reduction and onto typed resistance.

*Closes when:* `combat.dsl` is re-cut with every route in it still walking,
`ladder-check` reads both skills within a stated band, and what the flat 613 of health turned
out to be is written into the commit.

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
old id. For the same reason it must not run at the same time as the re-cut above: two lanes
changing one file is how a corpus ends up half-renamed.

The form that fits what is already there is the jewel items' own, one term shorter: a
passive's id is `[<role>-]<stat>-<form>`, where the role is written only where the passive
carries one (`berserker`, `juggernaut`, `assassin`) and the form separates the passives that
would otherwise collide — `-small`, `-medium`, `-percent`, `-range` for the plain grants, and
a word for what the passive actually does where it does more than grant (`-on-hit`,
`-per-vigor`, `-at-defense` for one that pays for its bonus with another stat). So `whetted`,
`honed` and `brutal` become `physical-damage-small`, `physical-damage-medium` and
`physical-damage-percent`; `retribution` becomes `juggernaut-thorns`; `rising-fury` becomes
`berserker-rage-scaling`. Derive the terms from each passive's own declaration rather than
from this paragraph — it is an illustration and not a list.

*Closes when:* every `# passive` and the six `<name>-jewel` items carry ids saying what they
are, each has a `title:` holding the flavour it gave up, and
`npm run oracle -- --at content` is green.

## The wave after the base run is four merged of twelve

Nine briefs stood on 2026-09-04, each written off a measured gap; the ruling on A Grand
Blade added two more and the ladder correction added a third. They live in
`.planning/combat-expansion/`, and one that has been merged moves into `completed/` beside
them, so what is left to run is what is in the folder. Each is one
`npm run authorbot -- <brief> --target <module>`, run in the background with `--watch`
beside it. **Three at a time**, so a fault in the tool or the oracle is caught before it has
eaten eight runs.

    completed/: combat-expansion     ball-of-a-boy-pass   combat-lessons
                reverse-infiltration kill-it-with-fire-pass
    waiting:    combat-recut             birds-and-the-bees-pass
                the-swampy-menace-pass   attention-to-detail-pass
                the-bars-crawl-pass      the-grumpy-crafter
                a-grand-blade-pass       plague-matters
                combat-floor

Orders to keep: `plague-matters.md` after `reverse-infiltration.md` — already merged, so it
is free; `a-grand-blade-pass.md` after `the-grumpy-crafter.md`, since the pass hands the
teaching half to it; `combat-recut.md` and the passive rename never at the same time as each
other, since both write `combat.dsl`; and The Rat Conspiracy matches its own note and gets no
pass. **Dispatching is on hold until the re-cut lands** — ruled 2026-09-04 — because a run
that tunes a fight against the old numbers has to be re-read afterwards anyway.

*Closes when:* each module is merged with `npm run oracle -- --at content` green and its
reaches read, and the two finale quests walk start to finish.

## Every combat room but the pasture stops short of the hour

Measured 2026-09-04 across eight rooms at three rungs, and re-read after the ladder moved.
**The pasture is the only room in the world that ran the full 3,600 seconds.** Every other
room stopped short in every seed at every rung, and the rest of the hour paid nothing — which
is the whole of why every room reads under the curve. Two causes wear the same message: at
the low rungs a faint ends the offer after ten seconds, and at the high rungs the room runs
out of things to kill. The rates *while a room ran* are healthy, so nothing is underpaying
per kill. What is missing is a reason to still be standing there at minute fifty-nine.

The correction to the ladder did not touch this, which is the point: the muster went from
1.8× attack and 0.13× health over 700 seconds to 0.43× and 0.51× over 880, and still stopped
short in four seeds of four. **This is population, respawn and aggression, and it is the last
thing standing between combat and a floor.**

*Closes when:* at least the band-appropriate room of each band runs the window out at its own
rung, and the room table is re-read against the change.

## Combat has no floor, so its tier saves cannot be deleted

`docs/balance/open-agent.md` holds the line: `tiers.dsl` goes a skill at a time as each gets
a floor, and combat and cooking are what is left. `npm run floors` walks fishing's and
thieving's; nothing walks a fighter from level one to thirty. The brief is
`.planning/combat-expansion/combat-floor.md` and it waits on the re-cut, since a floor measured against
numbers about to move is measured twice.

*Closes when:* `floors/combat-floor.dsl` walks a bare fighter and a geared one to the band
edges and the combat saves in `content/tiers.dsl` are deleted.

## The muster is a room, and now reads as a room that runs out

Crossed from `docs/tulsa/open-human.md` on the ruling of 2026-09-04. It is no longer the wall
it was reported as, and on the corrected ladder it is no longer the one-sided thing it was
either: a fighter at the level-21 rung now pays 0.43× attack and 0.51× health, spending 135
health an hour rather than 39. What it still does is **empty in 880 seconds of the 3,600**,
in four seeds of four. Six warriors on a ninety-second respawn is a fifteen-minute room.

*Closes when:* the muster runs the hour out at the level-21 rung and the combat floor reaches
it.

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

## Nothing audits an adversarial pair for sharing a ladder

Ruled 2026-09-04 that stats meeting in an adversarial check must sit on exactly the same
ladder, or the check stops meaning what it looks like it means. The world declares its own
contests — `accuracy: us.accuracy vs them.evasion` and `damage: us.attack vs them.defense` on
`# action melee-combat`, and every `<stat> vs <stat>:` in a result — so the pairs are
derivable, and nothing derives them. `accuracy` and `evasion` are consistent today by
accident: neither is named by a skill, so neither is laddered at all.

The shape this wants is `ladder-check` walking the actions, pairing the stats each contest
names, and reporting a pair whose two sides read different ladders — derived from the world's
own declarations rather than from a list of pairs kept beside them.

*Closes when:* `ladder-check` reports contested pairs that disagree, and either the world has
none or the ones it has are named in the commit that closes this.
