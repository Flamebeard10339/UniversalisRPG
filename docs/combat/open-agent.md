# What is still wrong that a lane can take

Combat is the last skill before the MVP. **Where this is going: every balance number is
declared in the world, named in one place, and edited once.** A change to how hard the game
is should be a handful of numbers with a global meaning, not a thousand small edits each
needing its own proof. Most of that machinery is built; what is left is below.

Rulings taken 2026-09-04 and not re-argued here: damage types are declared in the world and
the engine only knows how a stat enters a swing; a faint is a forced five-second action that
ends at `starting-location`, hardcore taking the pack besides; there is no defense skill and
will not be; the muster is a room; what pays for a long fight is gear, food and deaths in
whatever mix the speedruns find; **food is gear with an upkeep cost and nothing more**, so
the sheet never had a special case to answer; A Grand Blade is **two** quests; **a foe's
toughness is typed resistance, never flat damage reduction**; **a foe is classified by tier
and shaped by profile rather than cut one at a time**; and **balance is the engine's problem
rather than the author's** — an author names what an encounter needs to be and writes a stat
only where it is load-bearing for the story.

Two axes, independent so that a body may climb one without the other: **toughness**, what a
character can lose, and **dps**, what it deals a second. Both are declared in the world as
`# ladder <stat>` sections, one per stat, each carrying what a character of that level stands
at and how long the level takes; `src/runtime/pace.ts` holds no balance number of its own. The
toughness line is whichever ladder declares `seconds to fell an even match:`, every stat
carrying `deals:` reads that same line divided by those seconds, and damage-per-blow is
derived from dps and attack rate rather than declared — the two used to be on different clocks, blows against seconds, which
is what made the ladder and the tiers measure different things.

The four tiers are declared in `content/combat.dsl`, their shape in
`src/content/sections/tier.ts`:

    tier      seconds to fell    damage share    experience share    drops
    mob             7                0.8               0.7           common
    normal         15                1.0               1.0           uncommon
    elite          30                1.4               1.3           rare
    boss           75                1.75              0.5           unique

Normal is the curve, so a room of them is on pace and elites pay above it. Damage share is
against survivable incoming over a **60-second** window, meaning *are you net positive in
health after a minute of this fight* — if yes it can be farmed unwatched, if no the player
pays attention or dies, which is the threshold a semi-idle game wants. Damage share is per
body, and a place is single combat unless it says `multicombat`.

A `# profile` names one side of each contested pair and the tier solves the other. A factor
weighed against another is read against **its opposite number**: a foe's evasion is a
multiple of the player's accuracy, its reduction a multiple of the damage it takes its cut
of. Reading them against the player's own stat of the same name is what made `evasion:` a
no-op, since the player's is zero.

**A line is deleted the day it closes.**

---

## Every number in combat.dsl is cut against ladders that have since moved

Nothing under `content/` moved when the damage model and the ladders were corrected, and the
toughness anchor has since gone to 100 at level one and 999 at thirty. `npm run ladder-check`
now reads its lines out of `# ladder` sections in the world:

    combat.attack (dps)                          shop         anywhere
      level 10   the ladder asks 25.3/s      10.0 short     12.3 over
      level 20   the ladder asks 45.9/s      25.8 short      2.1 short
      level 30   the ladder asks 66.6/s      41.1 short     14.2 short

    combat.health (core.max-health)              shop         anywhere
      level 10   ladder asks 379.0          326.2 short    325.9 over
      level 20   ladder asks 689.0          619.4 short     70.6 over
      level 30   ladder asks 999.0          910.6 short    182.8 short

The flat surcharge on attack is gone: it was flat because the ladder was nearly flat, and
against a real slope it reads as a slope deficit crossing near level 20. The health drop row
that used to sit 613 over at every rung likewise crosses instead of running parallel — the
kit is level-independent and it was the ladder that was flat, which is what the 613 was.

What is left is a genuine content gap on the shop row: **the world grants a player 39 health
at level one and 88 at thirty, all of it gear**, because a skill raises its stat by +1 and
+1% a level and nothing else. Against a ladder asking 100 to 999 that is short everywhere,
and it is why five routes had to say `unkillable` when the anchor moved.

The brief is `.planning/combat-expansion/combat-recut.md`. It also carries the sweep moving
foe toughness off flat reduction onto typed resistance, and the classification of 175
entities of which two name a tier.

*Closes when:* `combat.dsl` is re-cut with every route in it still walking, and `ladder-check`
reads both skills within a stated band.

## The kit the audit dresses is chosen for one stat, so the dps row understates the world

`ladder-check` now measures in dps, which is what finally made attack rate visible: a rate
jewel raises the number where before it could not. But `kitFor` still picks each slot by what
the item contributes to the **dealt stat alone**, so it never reaches for a rate jewel even
where that is the stronger build. The figure is honest for the kit it picked and understates
what the world can reach.

*Closes when:* the kit is chosen by the dps it reaches rather than by one stat, and the
attack rows are re-read against the change.

## The engine's floor of one point a blow puts some tiers out of reach low on the ladder

The solve cannot cut a blow under `min-damage`, which the engine floors every hit at. Where a
tier's damage share at a low level asks less than one point a blow, no profile reaches it,
because rate and accuracy are the profile's and the floor is the engine's. It bit
`combat.feral-rat` as a `skirmisher` at level 4; re-tagging it a `brute` — slower blows, each
above the floor — closed that case and is the pattern for the next.

Raising the toughness anchor to 100 is most of the answer, and was measured rather than
argued: swept across every tier and profile at every rung, the wall now stands in **one cell**
— level 1, on the fastest profile — where it used to bite a real content body at level 4. The
proof is `src/runtime/foeTier.test.ts`'s *cannot cut a blow under the floor the engine puts on
one*, repointed at that cell, and it still pins the wall rather than a way round it.

A solved reduction may go negative: ruled that a body which takes extra damage from every blow
is a legitimate state to arrive at, and an author may write one deliberately. It reads as a
higher xp/hour, since that depends on dps.

*Closes when:* a body can be cut to any declared tier at any level it is met at, or the one
level at which it cannot is refused with a message saying why.

## The tier audit models one damage stat, and the engine has many

`readingAt` prices a foe's output as its `us.attack` stat run through the resistance of
whatever the player's laddered damage stat deals. The engine's real path is `typedDamage`,
which sums *every* stat carrying `deals:` on the swinger and resists each type separately. A
foe whose bite is mostly `fire-damage` — `fixture-combat.ember` is one — reads to the audit as
though it dealt almost nothing, and the solve then hands it an `attack` big enough to make
the tier on top of the fire it already deals.

So a foe dealing more than one type is priced wrong in both directions, and the fixture
carries the shape that shows it. The fix is for the solve and `readingAt` to share the
engine's own summation rather than a second model of it.

*Closes when:* a body dealing two types reads back at its tier, and `readingAt` no longer
names a single damage stat.

## Sixty passives have a budget to be cut against and are still carrying hand-cut amounts

`# passive` now takes `grants:` — the stat — and `budget:` — how many points of it come to one
level of the ladder that stat climbs. The amount is derived rather than written, so moving a
ladder re-cuts every passive hanging off it with no content edit, and `rounds to:` on a
`# stat` says the step the derived number comes to the nearest of, so `core.max-health` moves
in fives. `combat.immovable` is converted and reads +30 where it was a hand-cut +25.

**One of seventy-five is converted.** Measured shapes of the rest: 43 more are one flat grant
of one stat and convert exactly as `immovable` did; 17 grant a percent, which cannot be solved
because a percent of a linear ladder is a different number at every rung, and want an audit
instead; 15 are trade-offs, per-resource scaling, behaviour-only or multi-stat, and what those
should do is in `open-human.md`.

This must not run at the same time as the passive rename below, since both write every
`# passive` in `combat.dsl`.

*Closes when:* every passive that is one flat grant of one stat names a budget and no amount,
`ladder-check` reports a percent passive that exceeds what its budget allows, and
`npm run oracle -- --at content` is green.

## A route proves reachability, and fifteen of them still assert survival

Ruled that a route asks whether a path is walkable and nothing else; whether the player lives
through it is the balance system's to answer. `unkillable` was already in the grammar, so this
was a doctrine change rather than a build, and five routes carry it after the anchor moved.

Fifteen routes still assert `not core.fainted`, and those are engine tests — *does damage
apply* — standing in the shipped world where a contributor editing content cannot run them.
They belong in `src/content/fixture/` or in a `.test.ts`. Three more assert an absolute pool
value (`resource.core.health = 11`), which `WALKED_FIELDS` already forbids an `expect:` sheet
and does not yet forbid an `assert:`. The predicate that derives cleanly is in `open-human.md`
and waits on a ruling, because read literally it refuses all 102 `has` asserts too.

*Closes when:* no route in `content/` asserts `not core.fainted` or an absolute pool value, and
the filter that stops the next one being written is derived from `SAVE_FIELDS` rather than
listed beside it.

## The passive ids were not renamed, and were ruled to be

The base run renamed the six jewel items it wrote to `<rarity>-<role>-<skill>` and stopped
there. The six older `<name>-jewel` items — `keen-edge-jewel`, `stout-heart-jewel`,
`tempered-will-jewel`, `great-work-jewel`, `causeway-jewel`, `crossroads-jewel` — and all
thirty-two `# passive` sections still carry flavour ids. Ruled that the passives are renamed
too and their flavour moves into `title:`.

`npm run rename-section` writes one id everywhere the world reads it and refuses unless the
registry afterwards differs by exactly that id. **It must not run at the same time as the
re-cut**, since both write `combat.dsl` and two lanes in one file is how a corpus ends up
half-renamed.

The form that fits is the jewel items' own, one term shorter: `[<role>-]<stat>-<form>`, the
role written only where the passive carries one, and the form separating those that would
otherwise collide — `-small`, `-medium`, `-percent`, `-range`, or a word for what it does
where it does more than grant. Derive the terms from each passive's own declaration rather
than from this paragraph.

*Closes when:* every `# passive` and the six `<name>-jewel` items carry ids saying what they
are, each has a `title:` holding the flavour it gave up, and
`npm run oracle -- --at content` is green.

## The wave is four merged of twelve, and its briefs still ask for balance

The briefs live in `.planning/combat-expansion/`, and one that has merged moves into
`completed/` beside them, so what is left to run is what is in the folder. Each is one
`npm run authorbot -- <brief> --target <module>`, three at a time.

    completed/: combat-expansion     ball-of-a-boy-pass   combat-lessons
                reverse-infiltration kill-it-with-fire-pass
    waiting:    combat-recut             birds-and-the-bees-pass
                the-swampy-menace-pass   attention-to-detail-pass
                the-bars-crawl-pass      the-grumpy-crafter
                a-grand-blade-pass       plague-matters
                combat-floor

**Every waiting brief still tells its run to measure and tune numbers, and that is now
wrong.** An author names a tier and a profile; the engine cuts the stats. A run that spends
its turns on `simulate-activity` is spending them on work the tags already do, which is much
of why the base run hit its turn cap. The speedrun is the one lane that still iterates,
because a floor is walked rather than declared.

Orders to keep: `a-grand-blade-pass` after `the-grumpy-crafter`; `combat-recut` and the
passive rename never at once; The Rat Conspiracy gets no pass. **Dispatching is on hold until
the re-cut lands**, because a run that tunes a fight against the old numbers has to be
re-read afterwards anyway.

*Closes when:* the briefs ask for tags rather than numbers, each module is merged with
`npm run oracle -- --at content` green and its reaches read, and the two finale quests walk.

## Every combat room but the pasture stops short of the hour

Measured across eight rooms at three rungs. **The pasture is the only room in the world that
ran the full 3,600 seconds.** Every other room stopped short in every seed at every rung and
the rest of the hour paid nothing, which is the whole of why every room reads under the
curve. Two causes wear the same message: at the low rungs a faint ends the offer after ten
seconds, at the high rungs the room runs out of things to kill. The rates *while a room ran*
are healthy, so nothing underpays per kill. What is missing is a reason to still be standing
there at minute fifty-nine.

Correcting the ladder did not touch this, which is the point: the muster went from 1.8x
attack and 0.13x health over 700 seconds to 0.43x and 0.51x over 880, and still stopped short
in four seeds of four. **This is population, respawn and aggression**, and a tier's
`experience share` is an hour rather than a kill precisely so this falls out of the same sum:
a room that cannot be killed fast enough to reach its share is under-populated rather than
under-paying.

Ruled 2026-09-04 that **this has no one answer and is not a fault to be fixed**. There is a
real difference between a room holding three guards and one holding ten, and choosing it is
the author's job: a place may be meant to be lucrative, or dangerous, or thin. What the
engine owes is a reading of what a room comes to, not a rule that every room comes to the
same thing. So this closes on the sheet being read, not on the rooms being levelled.

*Closes when:* the room table is re-read after the re-cut and the rooms that stop short are
either meant to or given population, with the choice named per room rather than swept.

## Combat has no floor, so its tier saves cannot be deleted

`docs/balance/open-agent.md` holds the line: `tiers.dsl` goes a skill at a time as each gets
a floor, and combat and cooking are what is left. `npm run floors` walks fishing's and
thieving's; nothing walks a fighter from level one to thirty. The brief is
`.planning/combat-expansion/combat-floor.md` and it waits on the re-cut, since a floor
measured against numbers about to move is measured twice.

*Closes when:* `floors/combat-floor.dsl` walks a bare fighter and a geared one to the band
edges and the combat saves in `content/tiers.dsl` are deleted.

## The muster is a room, and now reads as a room that runs out

It is no longer the wall it was reported as, nor the one-sided thing it was: a fighter at the
level-21 rung pays 0.43x attack and 0.51x health, spending 135 health an hour rather than 39.
What it still does is **empty in 880 seconds of the 3,600**, in four seeds of four. Six
warriors on a ninety-second respawn is a fifteen-minute room.

*Closes when:* the muster runs the hour out at the level-21 rung and the combat floor reaches
it.

## What pays for a long fight is ruled, and nothing has measured the mix

Gear, food and cheap deaths all pay for it, and the speedruns find the mix. Food is gear with
an upkeep cost, so a build that eats is a build stood up with those stats, exactly as one
that wears a helmet is. Food should read useful but expensive: worth eating at a hard target,
not worth eating at grunts farmed for experience. If the floor does not read that way, food
is buffed or nerfed, and that is cooking's number rather than combat's.

*Closes when:* the combat floor carries one route that eats and one that does not at the same
two targets, and the sheet says which won where.

## Nothing audits an adversarial pair for sharing a ladder

Ruled that stats meeting in an adversarial check must sit on exactly the same ladder, or the
check stops meaning what it looks like it means. The world declares its own contests —
`accuracy: us.accuracy vs them.evasion` and `damage: us.attack vs them.defense` on
`# action melee-combat`, and every `<stat> vs <stat>:` in a result — so the pairs are
derivable, and nothing derives them. `accuracy` and `evasion` are consistent today by
accident: neither is named by a skill, so neither is laddered at all.

The shape this wants is `ladder-check` walking the actions, pairing the stats each contest
names, and reporting a pair whose two sides read different ladders — derived from the world's
own declarations rather than from a list kept beside them.

*Closes when:* `ladder-check` reports contested pairs that disagree, and either the world has
none or the ones it has are named in the commit that closes this.
