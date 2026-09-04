# Combat: classify every body, and let the engine cut the numbers

This is a pass over `content/combat.dsl`, the only file this run may write. Read it whole
before changing a line — it is 1,325 lines and carries `# save` bodies and 30-odd `# test`
sections that are the proof the rest of the world still works. **Every route in it must still
walk when you are done**, and a route that stops walking is the finding rather than a line to
delete.

Do not edit `tulsa.dsl` or any quest module. Ask `npm run oracle` what the language allows,
and `npm run oracle -- --walk <line>` when one line has you stuck. **Never read `src/`** — and
in particular do not go looking for the ladder, which is declared and is not yours to move.

## Why this exists

Two things changed under the world on 2026-09-04, after `combat.dsl` was written:

- **A stat that deals a damage type now climbs at a fifth of the health ladder**, so an even
  fight takes about five blows. It used to climb at the same rate as health, which meant a
  level-21 character stood at 140 physical damage against the 115-health foe built for level
  21 and killed it in one blow.
- **Flat damage reduction now takes its cut of the whole blow, typed damage included.** It
  used to apply only to the untyped `attack` term, so measured against a 500-reduction dummy
  a +50 blade lost nine damage and the fifty passed through untouched.

Nothing in `content/` moved with either. This pass moves it.

## What is wrong, measured

`npm run ladder-check` on the shipped corpus, read 2026-09-04 after the ladders moved into the
world and the toughness anchor went to 100:

    combat.attack (dps)                          shop         anywhere
      level 10   the ladder asks 19.9/s      4.7 short      17.6 over
      level 20   the ladder asks 40.3/s     20.2 short       3.5 over
      level 30   the ladder asks 66.7/s     41.2 short      14.3 short

    combat.health (core.max-health)              shop         anywhere
      level 10   ladder asks 298.4          245.6 short    406.5 over
      level 20   ladder asks 604.4          534.8 short    155.2 over
      level 30   ladder asks 1000.5         912.1 short    184.2 short

Read these as shapes rather than as targets — the anchor may move again, and a figure copied
out of here into a body is a number cut against a page instead of against the world. Run it
yourself against your own corpus.

Two faults, and they do not have the same answer:

1. **Everything on the drop rows starts far over and ends short.** The kit the audit reaches
   for is nearly level-independent while the ladder climbs, so it overpays a beginner and
   underpays a thirty. That is the jewels and the passives behind them; a separate lane is
   writing those as shares of a level, so **read it, note it, and leave it alone.**
2. **Health out of a shop is short everywhere and getting worse with the rung.** This is the
   one that is yours, and it is the reason five routes in the corpus say `unkillable`: the
   world hands a player 39 health at level one and 88 at thirty, all of it gear, because a
   skill raises its stat by +1 and +1% a level and nothing else does anything. Against a
   ladder asking 100 and 1000 that is short by an order of magnitude at the top.

   Answering it is a judgement rather than an arithmetic: more health on what a shop sells,
   health on bases rather than only on jewels, or a shallower toughness ladder. **Say which
   you chose and why**, and if you conclude the ladder itself is wrong, say that instead of
   working around it — that is a finding, not a failure.

## Every foe declares a tier, and its numbers are read against that

Ruled 2026-09-04, and the four tiers are already declared at the top of `content/combat.dsl`
as `# tier` sections. Read them there rather than from here — this table is what they said
when this brief was written, and they may have moved:

    tier      seconds to fell    damage share    experience share    drops
    mob             7                0.8               0.7           common
    normal         15                1.0               1.0           uncommon
    elite          30                1.4               1.3           rare
    boss           75                1.75              0.5           unique

`# entity` now takes `tier:`, allowed once `stats:` is set. **Every foe in the world names
none yet, and giving each the right one is the largest single job in this pass.** Read the
three fields' own notes off `npm run oracle -- tier` — they say precisely what each means
and each carries a trap worth knowing before you start.

Three things to hold on to:

- **Seconds, not hits.** A tier fixes how long something stands against a player the ladder
  puts at its level. Attack-rate is gear-scalable, so hits are not an invariant and seconds
  are.
- **Toughness is one budget spent three ways.** The pool, the resistances and the flat
  reduction come out of the same seconds. A foe given a big pool *and* a heavy resistance is
  not of its tier however it is labelled — which is the single easiest way to get this wrong.
- **Experience share is an hour, not a kill.** So what one body pays falls out of the tier
  beside how long it takes to fell and how long the room takes to put another up. A room that
  cannot be killed fast enough to reach its share is under-populated rather than
  under-paying, and that is a finding to report rather than a payout to inflate.

Damage share is **per body**. A place is single combat unless its `# location` says
`multicombat`, so a room of six is one at a time until it says so — that keyword is new and
nothing in the world uses it yet. Where a room is meant to swarm, say so there, and
understand that six mobs at 0.8 is 4.8 times survivable incoming and will kill anyone.

## Foe toughness is resistances, not reduction

Ruled 2026-09-04: **do not give things flat damage reduction.** Reduction is a small,
gear-side number; a foe that should be hard to hurt is hard to hurt because it *resists a
damage type*. Flat reduction against a laddered damage number is degenerate — it does nothing
until it exceeds the damage and then it stops the fight dead, which is exactly the cliff a
run measured on the Twins in `reverse-infiltration.dsl` without being able to explain it.

So: sweep the entities this module declares. Where one carries a `defense` figure doing the
work of making it tough, move that work into a typed resistance and leave reduction small.
Which types each foe should resist is a writing question as much as a balance one — a thing in
scale plate resists physical, a thing that is already burnt resists fire — and the answer
wants to be legible from the `examine:` before the player takes the wrong weapon to it.

## What to leave alone

- **The five damage types, the stats, and the jewel plane.** They are right.
- **The `# ladder` sections and every `# passive`.** The ladders are declared in the world now
  and are not yours to move; a separate lane is writing the passives as shares of a level, and
  two lanes in `combat.dsl` is how a corpus ends up half-done.
- **The ids.** A separate lane is renaming the passives and the six older `<name>-jewel` items,
  and two lanes renaming the same things is how a corpus ends up half-renamed. Change numbers,
  not names.
- **Every `# save` body.** They are the proof the routes still walk. If a re-cut makes a saved
  build unable to finish its own route, say so in the report — do not quietly re-record it.

## Check your own work

`npm run ladder-check -- --world <your corpus>` after each pass. It lists every body that
fights, whether it reads as the tier and profile it names, and every body that names none. The
target is that nothing is left in that last list and that no body disagrees with its own tags.

**Do not run `simulate-activity` and do not tune a number.** A body that reads wrong is
mis-tagged or met at the wrong level, and both are one word to change rather than six numbers
to solve for. The largest single cause of the last run hitting its turn cap was spending turns
measuring what the tags already decide.

One thing the sheet will keep telling you that is **not yours to fix**: every combat room but
the pasture stops short of the hour, because a faint ends the offer or the room runs out of
things to kill. That is population and respawn, it has its own line, and a re-cut that makes
rooms last longer by accident is welcome but is not the goal.

## Done means

`npm run oracle -- --at <your corpus>` green with every route in `combat.dsl` still walking,
`ladder-check` naming no body that fights without a tier and none that disagrees with its own
tags, and a report giving which tier and profile each body got and why, which foes moved from
reduction to resistance and which types they got, every body you could not tag and what stopped
you, and every `@@@` you wrote.

**The health gap is the finding this run exists to close.** The world hands a player 39 health
at level one and 88 at thirty, all of it gear, against a ladder asking 100 and 1000. Five
routes in the corpus say `unkillable` because of it. Say in the report what you did about it
and what is left.
