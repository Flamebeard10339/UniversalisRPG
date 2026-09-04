# Combat: re-cut the numbers onto the corrected ladders

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

`npm run ladder-check` on the shipped corpus, read after both changes landed:

    combat.attack (combat.physical-damage)      shop         anywhere
      level 10   ladder asks  12.6           46.4 over     125.0 over
      level 20   ladder asks  26.6           51.2 over     140.0 over
      level 30   ladder asks  40.6           58.0 over     156.9 over

    combat.health (core.max-health)              shop         anywhere
      level 10   ladder asks  63.0           10.2 short    641.9 over
      level 20   ladder asks 133.0           63.4 short    626.6 over
      level 30   ladder asks 203.0          114.6 short    613.3 over

Three separate faults, and they do not have the same answer:

1. **Attack is about five times over at every rung, on both rows.** That is the old ladder
   showing through. Weapons and attack jewels come down roughly five-fold — but derive each
   one from what the ladder asks at the rung it is gated to, rather than dividing everything
   by five and calling it done.
2. **Health out of a shop is short and getting shorter with the rung.** That is an ordinary
   residual and the answer is gear the world has not got yet, not a bigger number on what it
   has.
3. **Health counting the drops is 613 over at every rung, and flat.** A residual that does not
   move with the rung is not a curve problem — something grants a large fixed amount. Find it
   before changing anything: the health jewels and the passives behind them are where to look,
   and `ladder-check` says which build it reached and how many plane points it spent.

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

- **The five damage types, the stats, and the jewel plane.** They are right; only the numbers
  on them are wrong.
- **The ids.** A separate lane is renaming the passives and the six older `<name>-jewel` items,
  and two lanes renaming the same things is how a corpus ends up half-renamed. Change numbers,
  not names.
- **Every `# save` body.** They are the proof the routes still walk. If a re-cut makes a saved
  build unable to finish its own route, say so in the report — do not quietly re-record it.

## Check your own work

`npm run ladder-check -- --world <your corpus>` after each pass, and
`npm run simulate-activity -- <save> --world <your corpus> --at <room> --ladder
combat.physical-damage=<n>,core.max-health=<n>` to read what a room pays a character standing
on a rung. The target is that a fight between an even match takes about five blows and that
neither arm of the skill is starved beside the other.

One thing the sheet will keep telling you that is **not yours to fix**: every combat room but
the pasture stops short of the hour, because a faint ends the offer or the room runs out of
things to kill. That is population and respawn, it has its own line, and a re-cut that makes
rooms last longer by accident is welcome but is not the goal.

## Done means

`npm run oracle -- --at <your corpus>` green with every route in `combat.dsl` still walking,
`ladder-check` reading both skills within a band you state and defend, and a report giving
the before-and-after per rung, which foes moved from reduction to resistance and which types
they got, what the flat 613 of health turned out to be, and every `@@@` you wrote.
