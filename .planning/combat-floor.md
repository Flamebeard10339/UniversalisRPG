# Combat: a floor route, to walk the ladder rather than assert it

Write **one new module, `combat-floor`**, holding routes that start where a real player starts
and fight their way up. Nothing else is yours: `content/combat.dsl` and `content/tulsa.dsl`
are not to be edited, and neither is any quest module.

A floor route is the fastest way anybody has actually walked to a level. It is not a proof
that the numbers are right — it is the measurement the numbers are read against.
`npm run floors` walks each route, reads its goal off its own closing
`assert: level.<skill> >= <n>`, and prints the game-minutes it took beside the minutes the
curve allows for that level. Nothing about the minutes is asserted anywhere. **Do not write a
single `assert:` about experience, coin, time or a drop count.** A route asserts the level it
reached and the things it is holding, and no more.

`floors/thieving-floor.dsl` and `floors/fishing-floor.dsl` are the shape to copy. Read them
first. Note how each route opens with `run:` of the one before it, so the ladder is climbed
once and not three times, and how `gear-up` buys and wears a kit and allocates a jewel before
working a mark.

## What to write

Between three and five routes. These are the ones worth having, and the last two are the
point of the module rather than extras:

- **a bare floor to about level 10** — a player with whatever the tutorial leaves them and
  nothing bought, working the proving ground and the sewer. This says what fighting pays
  somebody who has spent nothing.
- **a bronze floor to about level 20** — the same player, having bought the bronze band off
  the armoury counter first. Buying the kit is part of the route and its minutes count.
- **an iron floor to 30** carrying the iron band and at least one jewel socketed, since
  ability comes from jewels rather than from gear and a floor that wears bases with empty
  planes is measuring the wrong thing.
- **one route that eats and one that does not, at the same two targets.** Ruled 2026-09-04
  that food is gear with an upkeep cost — a bonus to stats you pay to keep — and that the
  speedruns are what find the mix of gear, food and cheap deaths. These two routes are that
  measurement and there is nowhere else it can be made: `simulate-activity` walks one offer
  and eating is a different offer, so the sheet has never printed a rate for a character who
  ate. Pick a hard target and a grunt target, walk both routes at each, and say in the report
  which won where. **Food should read useful but expensive**: worth eating at the hard target
  and not worth eating at grunts farmed for experience. If it does not read that way, that is
  cooking's number to change and not this module's — say so and change nothing.

Fewer routes that walk beats more that do not.

## What was measured on 2026-09-04, so you do not buy it again

Every figure here was read off the shipped corpus with
`npm run simulate-activity -- combat.iron-band-in-hand --at <room> --ladder
combat.physical-damage=<n>,core.max-health=<n>`, at rungs 5, 12 and 21.

**The pasture is the only combat room in the world that ran the full hour.** Every other room
stopped short in every seed at every rung, and two different causes wear the same message: at
the low rungs a faint ends the offer after ten seconds, and at the high rungs the room runs
out of things to kill. The muster empties in 734–778 seconds of the 3,600-second window at
the level-21 rung while paying 1.8× the curve in attack experience for the twelve minutes it
lasts. Rooms that stop short pay a fraction of the curve over the window and healthily above
it while they run.

**Those room figures were read before the damage ladder was corrected on the afternoon of
2026-09-04 and the shape of them survives the correction, but the numbers do not.** On the
corrected line the muster reads 0.43× attack and 0.51× health over 880 seconds where it read
1.8× and 0.13× over 700. Re-read any room you lean on rather than taking a figure from here.

So a floor route that stands still in one room will stall, and **the interesting floor is the
one that moves**: a circuit of rooms walked in an order that keeps the player fighting, with
the walk between them costing what it costs. Write that circuit and the minutes it takes.

Watch whether a fighter's two skills climb together. On the old line the muster paid 1.8×
attack against 0.13× health, so the arms were fourteen-fold apart; correcting the ladder
brought them to 0.43× and 0.51×, which is close enough that one circuit may serve both. If
you find a room where they part again, a floor to level 30 in *both* may need different rooms
for each — say which if so.

## The facts you need, so you do not spend the run finding them

- A player reaches town through `first-steps.miki-route-full`. `run:` it as the first line,
  as the other two floors `run:` their own opposite numbers.
- The rooms that hold something to fight, and what each holds, are in `content/combat.dsl` and
  `content/tulsa.dsl`. Read both. Do not trust a list of them written here.
- `# save combat.iron-band-in-hand` stands a character in the market square holding the six
  iron pieces as instances. It is a starting point for reading a room, not a substitute for
  walking to one: a floor buys or earns its kit and the minutes count.
- A shop is worked the way the thieving floor works the alley coat: `shop:`, then
  `submit-modal: item=buy:<id>`, then `submit-modal: item=close`.
- **A faint is a forced five-second action ending at `starting-location`.** A route that dies
  is walked back to where it started and has to travel out again, and those minutes are real
  and are part of what a cheap death costs. Do not use `unkillable` to hide it — a floor that
  cannot die is not a floor. `unkillable` in a route here is a finding to explain, not a tool.
- `travel:` is one hop and refuses the room it is already in, so a loop body has to be a walk
  that is legal both from the room and from wherever a faint throws the player.
- Ask `npm run oracle` what the language allows, and `npm run oracle -- --walk <line>` when
  one line has you stuck. **Never read `src/`.**

## What the curve allows, for your report

`rateAtLevel` and `abilityAtLevel` in `scripts/lib/pace.ts` are the declared curve and ladder,
and `npm run ladder-check` audits the world against them — but do not read that file and do
not copy a number out of it into your module. Take what the curve allows at each level off
`npm run floors` on the shipped floors, whose output prints the allowance beside the minutes,
and take your own routes' minutes off
`npm run probe -- <your corpus> --record <test id>`, where `time` is in milliseconds.

A route that lands near its allowance is combat balanced. One well under it is a room paying
more than the curve asks, and one well over is a room paying less — **say which, and do not
fix it here.** This module changes no number in the world.

## Done means

`npm run oracle -- --at <your corpus>` green with `combat-floor` in it, every route in it
walking, and a report giving per route the level it reached, the game-minutes it took and the
ratio against the allowance; which rooms the circuit used and in what order; whether attack
and health climbed together; and what the eating route and the not-eating route each paid at
the hard target and at the grunt target.
