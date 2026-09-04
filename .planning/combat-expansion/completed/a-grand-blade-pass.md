# A Grand Blade: the pass it is owed

This is a pass over `content/a-grand-blade.dsl`, the only file this run may write. Read the
module and its note, `.planning/planning_quests/A Grand Blade.md`, before changing a line.
Keep the route in the file walking, or say plainly what changed and why.

Do not edit `tulsa.dsl`, `combat.dsl`, `smithing.dsl` or any other module. A change that
seems to need one is an overlay written here: a `when:` node laid over
`# dialogue tulsa.<entity>`, a `# location tulsa.<room>` body with `+entities:`, a
`# entity tulsa.<id>` body with an action of its own. Match the style of `thieving.dsl`.
Mark what the grammar cannot say with `@@@` and do not work around one. Ask `npm run oracle`
what the language allows; never read `src/`.

## What was ruled, and what it changes

The quest was one thing doing two jobs: teaching the plane, and paying out the best weapon in
the game. Ruled 2026-09-04 that it is two quests. **The teaching half has left this module** —
it is `.planning/the-grumpy-crafter.md`, a level-one miniquest, and it is not this run's. Do
not teach the plane here, do not hand out a first jewel, and do not lower anything to reach a
beginner.

**What is left is the hard one.** A Grand Blade is the difficult quest of the combat push and
it pays a best-in-slot weapon for its tier. The bladesmith's son, his father's hidden notes,
the riddle and the paving stone all stand — that is the quest and it is good. What is wrong
is that nothing about it is difficult, and the blade it pays is not cut for the world the
base run left behind.

**The anvil stays.** The smithing skill is being cut, and that does not mean the world may
never have an anvil in it: this quest is a one-off where the player stands at one, and the
schematic-and-recipe shape is the reward. Keep `# recipe grand-blade`, keep the schematic
item, keep the station. What must not stand is a gate that only a levelled smithing skill can
pass — read what `skill: smithing 650` costs a player who has not trained it, and if it walls
the quest off from a fighter, make the requirement something a fighter can meet: bars they can
buy or be given, the son's hands on the work beside theirs, a `@@@` if the grammar cannot say
what you want.

## Make it hard

Right now the quest is: talk, search under the anvil, talk, craft. The only obstacle is
knowing to search the anvil, and the riddle gives that away. Put real work between the riddle
and the blade, and make the work *fighting*, because this is combat's finale quest and it is
what the tier is measured in.

What the difficulty is made of is yours to invent from what the world holds — read
`content/combat.dsl` for the foes, the damage types, the resistances and the bands, and
`content/tulsa.dsl` for the rooms. Some shapes that fit: the notes name materials the son
cannot get and the player has to take them off something that is holding them; the pattern
calls for a bar nobody in town can make and the ore is somewhere that fights back; the blade
comes off the anvil unfinished and wants quenching in something a room will not give up
quietly. Whatever you choose, it must be **a fight a character at the top of the band can win
and a character in the middle of it cannot**, and it must be typed: a foe with a resistance
that punishes the wrong weapon is the whole reason damage types were built.

## Cut the blade for the world it ships into

`# item grand-blade` currently reads `weapon, +28 attack` and `requires: level.combat.attack
>= 25`. The base run moved every weapon onto `physical-damage` and gave the iron set typed
resistances; this item did not move with them and is the last one still written the old way.
Re-cut it: name its type or types, set its item level so the plane it carries is worth the
climb, and price it as best-in-slot **for its tier** rather than for the game. Read what the
iron and post-iron weapons grant off `content/combat.dsl` and put this one above them by a
margin a player would notice and not by one that ends the ladder.

**Cut it against the ladder, not against the weapons beside it.** The damage ladder was
corrected on 2026-09-04: a stat that deals a damage type now climbs at a fifth of the health
ladder, so that an even fight takes about five blows. Every weapon and attack jewel already
in the world was cut against the old line and none has been re-cut, so `ladder-check` reads
`combat.attack` at level 30 as 58.0 **over** out of a shop and 156.9 over counting the drops
— roughly five times what the ladder asks.

That means the honest best-in-slot blade for this tier is **weaker than several things
already shipped**, and it will look wrong beside them until the re-cut lane runs. Cut it to
the ladder anyway, say plainly in the report what it grants against what the ladder asks at
its tier, and name the shipped weapons it now sits under. Do not match them.

## Balance

Every fight this quest stages names a `tier:`, a `profile:` and a `level:`, and the engine cuts
every stat under them. That the gate fight is lost at the middle of the band and won at the top
of it is a choice of tier and of the level it is met at — not a number to solve for. Say in the
report which tier you gave it and why.

`npm run ladder-check -- --world <your corpus>` says whether a body reads as the tags it names.
One that does not is mis-tagged or met at the wrong level, and both are one word to change.

**Do not run `simulate-activity` and do not tune anything.** The tags are the balance. Nothing
here asserts a number in a `# test`.

One measured thing worth having: on the shipped corpus every combat room but the pasture
stops short of the hour in every seed — a faint ends the offer at the low rungs and the room
runs out of things to kill at the high ones — and the rest of the window pays nothing. If the
fight you write is one a player will faint in repeatedly, that is a finding to report rather
than a reason to soften it.

## Done means

`npm run oracle -- --at <your corpus>` green, the existing start-to-finish route still
walking, a route that walks the new hard section and one that shows it refusing a character
who is not ready, and a report saying what the difficulty became, what the blade grants, what
the ladder residual moved, and every `@@@` you wrote.
