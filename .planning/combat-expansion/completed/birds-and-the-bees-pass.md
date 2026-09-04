# Birds and the Bees: the pass it is owed

This is a pass over `content/birds-and-the-bees.dsl`, the only file this run may write. Read
the module and its note, `.planning/planning_quests/Birds and the Bees.md`, before changing
a line. Keep all four routes walking, or say plainly what changed and why.

Do not edit `tulsa.dsl` or `combat.dsl`. A change that seems to need one is an overlay
written here. The apiary, the hives, Kelsa and George are the town's; the drones are the
town's too and the princess bee is combat's. Match the style of `thieving.dsl`. A `@@@`
marks what the grammar cannot say; leave the two that still stand and do not work around
them.

## What the note asks for and the module does not do

- **Two of the three rewards.** The note pays 5,000 coin, *and* every bee on the property
  going neutral, *and* the hives harvestable in peace afterwards. The module pays the coin
  and carries a `@@@` for the other two, written when nothing in the grammar made
  `aggressive` conditional. It still is a bare word, but the world has since found the shape
  for exactly this: **two entities, one hidden on a flag, the other shown on it**, which is
  how thieving's market watch comes and goes and how fishing's bailiff walks off. Declare a
  calm drone here that is not aggressive and stands in the apiary
  `hidden if: not kelsas-hives.settled`, and lay `hidden if: kelsas-hives.settled` over the
  town's angry one. The hives' harvest actions are the town's and already hand comb to
  anyone who stands there; what changes is only that nothing bites. Delete the `@@@` once it
  is built.
- **The loss condition, half built.** The note loses the fight if the queen dies or you do.
  The module ejects you when she falls but she respawns in five seconds and counts as a loss
  only while the wasp stands. Make the beat read as the note says: her death is the loss,
  George drags you out, and you try again against a queen who is standing there again.

## What stands, and stays marked

The wasp draining the queen to heal itself and the instanced arena are both still things the
grammar cannot say; the two `@@@` stay, and what the module does instead (the wasp feeds on
every blow it lands, the room behind the hive reopens rather than resetting) stands.

## Balance

This fight is the first boss a player meets and has to be walkable by somebody who has fought
the sewer and nothing else. That is a `tier:` and a `level:` — the level being the rung such a
player actually stands on, which is the whole of what makes the fight fair. The engine cuts
every stat from there.

`npm run ladder-check -- --world <your corpus>` says whether the queen and the wasp read as the
tags they name. **Do not run `simulate-activity` and do not move numbers**; if the fight reads
wrong the tier or the level is wrong, not a stat.

## Done means

`npm run oracle -- --at <your corpus>` green, every route walking, a route that harvests a
hive after the quest with nothing biting, and a report that says which `@@@` closed and
which stand.
