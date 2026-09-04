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

The tiers are declared in `content/combat.dsl` and their shape in
`src/content/sections/tier.ts`. `npm run oracle -- tier` prints what a tier may say and what
each one says; do not write the table down here, and note that an older copy of it carried a
`drops` column no `# tier` has ever had.

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

## The armour above iron does not exist, so the health ladder runs out at the top

The re-cut landed 2026-09-04. Fifteen bodies name a tier where two did, every one reads on
tier, and toughness moved off flat reduction onto typed resistance. `npm run ladder-check` is
the sheet; no figure from it is written down here.

What the run could not close, and said so rather than inventing: **the shop health row is still
far short at level 30**, because there is no armour tier above iron. Bronze and iron were
raised and iron was added to the armoury counter, which closed levels 1 and 10 and most of 20.
A `knights-sword` exists as a level-20 weapon with nothing armoured to match it. Closing this
means a third armour tier — items, recipes, shop lines — which is authoring rather than a
number.

The drop rows are far over at every rung and that is the passive lane's, above.

*Closes when:* a player can reach the health line at thirty out of what the world sells, or the
ladder is re-cut to what the world can actually offer and the change is argued in the commit.

## Two synthetic combat worlds are kept in sync by hand

`src/runtime/foeTier.test.ts`'s `ARENA` and `scripts/lib/foeTier.test.ts`'s `WORLD` are two
hand-rolled worlds for one subject, and they have already diverged: `straw-man` carries a
different pool in each, `# stat defense` a different base, `# profile even` exists in one only.
Every ladder or tier change must be applied to both by hand, and a divergence introduced by
touching one is indistinguishable from the ones already there.

The suite is supposed to stand in `src/content/fixture/`. Found by audit rather than by a
failure, and deferred because it was not known whether any divergence is load-bearing for a
specific assertion — that is the thing to measure first.

*Closes when:* one world serves both, or the divergences are named as deliberate in the file
that keeps them.

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

## Six stats a passive grants against climb no ladder, so most passives cannot be cut

`# passive` takes `grants:`, a block of multiples of what one level is worth on the ladder the
stat climbs, and the engine writes the number. Ten passives in `combat.dsl` are written that
way; `grep -l '^grants:' content/*.dsl` says which.

**The rest are not waiting on effort, they are waiting on ladders.** A run put every stat a
passive in that file grants against to the oracle one at a time: only `core.max-health` (its
own `# ladder`) and `physical-damage` (which derives one by dealing) climb anything.
`core.defense`, `core.attack-rate`, `core.accuracy`, `core.evasion`, `core.regeneration` and
`combat.chaos-resistance` each answered with the grants-nothing remark, and seventeen passives
grant only those. So the job is **laddering those six stats**, after which the conversion is
mechanical — and until then a `grants:` against one of them mints nothing at all.

Deciding what each of the six climbs is a balance judgement, not a conversion: accuracy and
evasion meet each other in a contested check and want the same line as each other, which is
the adversarial-pair line at the bottom of this file.

The spread already chosen is 0.5x for filler reused across origin clusters, 1x for a notable
on one uncommon jewel, 2x for a unique — four to one, tied to the rarity of the jewel a
passive is exclusive to. The rare rung is unpopulated because none of its notables grants a
laddered stat. Keep that spread when the six are laddered rather than inventing a second one.

A budget in tiers collapses distinctions that hand-cut numbers had: `hale` and `constitution`
were +15 and +20 max-health and are both `+0.5x` now. If a distinction was doing work, the
answer is a finer spread and not a number written by hand.

This must not run at the same time as the passive rename below, since both write every
`# passive` in `combat.dsl`.

*Closes when:* the six stats climb something, every passive whose worth is a share of a level
says so, and `npm run oracle -- --at content` reports no passive granting against an
unladdered stat.

## Fifteen routes assert survival and fourteen of them cannot fail

Ruled that a route asks whether a path is walkable and nothing else; whether the player lives
through it is the balance system's to answer. `unkillable` was already in the grammar, so this
was a doctrine change rather than a build.

**Measured 2026-09-04, and it changes what closing this means.** `unkillable` floors every pool
so nothing empties, so `# event death` never fires and `core.fainted` is never set — and
**fourteen of the fifteen `assert: not core.fainted` lines sit under an `unkillable` in their
own route.** They cannot fail here, in `src/content/fixture/`, or in a `.test.ts`. Moving them
somewhere better would close this line on fourteen assertions that never had teeth. The worst
is `combat-lessons`'s *the iron shield turns a highwayman's fire*, whose only survival claim is
the one the switch guarantees; its real proof is the two `fire-resistance` lines above it.

The exception is `combat.a-feral-rat-picks-the-fight-itself`, which is not under `unkillable` —
and whose *other* assertion is `resource.core.health < 31.31` against a player whose max-health
is 30. That is above the ceiling, so it holds before the rat has swung. The route is named for
the rat opening the fight and nothing in it checks that.

So the answer is **deletion, not relocation**, and the three absolute-pool asserts go with them.
Where survival is genuinely the question, `simulate-activity` is the tool and a route is not.

*Closes when:* no route in `content/` asserts `not core.fainted` or an absolute pool value, and
`a-feral-rat-picks-the-fight-itself` either checks what its name promises or is deleted.

## Five resistance caps are one fact in five bodies

`physical/fire/cold/lightning/chaos-resistance-cap` in `combat.dsl` are byte-identical —
`base: 75`, `group: core.combat`, `hidden if: always`, `at most: 90` — and nothing anywhere
moves one without the others. Move the world's cap to 80 and miss one and fire stops at 75
while everything else stops at 80, with no test, no remark and no round-trip failure.

`at most: <stat>` already reads another stat off the same carrier and one shared cap makes no
ring, so this needs no engine change: one `# stat resistance-cap`, and every `<type>-resistance`
says `at most: resistance-cap`. Whether the per-type split is deliberate headroom for a future
item is the author's call, and that is the only reason it is a line rather than a commit.

*Closes when:* one stat says where resistances stop, or the five are named as deliberately
independent in the commit that keeps them.

## The passive ids were not renamed, and were ruled to be

The base run renamed the six jewel items it wrote to `<rarity>-<role>-<skill>` and stopped
there. The six older `<name>-jewel` items — `keen-edge-jewel`, `stout-heart-jewel`,
`tempered-will-jewel`, `great-work-jewel`, `causeway-jewel`, `crossroads-jewel` — and every
`# passive` in `combat.dsl` still carry flavour ids. Ruled that the passives are renamed
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

## The wave still has briefs waiting, and they now ask for tags

The briefs live in `.planning/combat-expansion/`, and one that has merged moves into
`completed/` beside them, **so what is left to run is what is in the folder and there is no
list of them here.** Each is one `npm run authorbot -- <brief> --target <module>`, three at a
time.

The briefs were rewritten 2026-09-04 to ask for tags rather than numbers, and each now says
plainly not to run `simulate-activity`. The speedrun is the one lane that still iterates,
because a floor is walked rather than declared. `passives-to-the-curve.md` is the brief for the
passive line above.

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
