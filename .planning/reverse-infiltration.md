# Reverse Infiltration

Write **one new module, `content/reverse-infiltration.dsl`**, the only file this run may
write. Its note is `.planning/planning_quests/Reverse Infiltration.md`: seven steps with the
middle three left blank, a summary that says what the middle is for, and a reward. Read the
note, then read `content/the-rat-conspiracy.dsl` and `content/the-swampy-menace.dsl` whole,
because this quest requires both and follows them, and `content/combat.dsl`, because every
fight in it stands on foes and types declared there.

The quest starts at the guard captain once both of those quests have settled, and it is the
first step of the ratkin arc's ending: the captain sends the player with a small group of
elites over the border to find out what is coming. What is coming is the Black Plague, a
mutated ratkin who thinks he is a scientist, and an army. The player finds that out, fights
the Plague's lieutenant — The Twins — and barely gets out. Plague Matters, the quest after
this one, is where the army arrives; this one ends with the town warned and nobody yet
believing it.

The reward is ruled: **12,500 attack experience and 18,500 health experience**, paid by the
captain at the end. No coin unless a beat earns it.

## What it may lean on

Depend on `core`, `tulsa`, `combat`, `the-rat-conspiracy` and `the-swampy-menace`. Do not
edit any of them. The town's border outpost is `tulsa.ratkin-border` with its two border
guards, past the tunnels and the muster, and it is the last room the town has in that
direction: whatever lies beyond it is this module's to declare, as `# location`s of its own
reaching the map by `adjacent: tulsa.ratkin-border`, the way fishing's mere reaches the
Narrows. Keep it to three or four rooms. The muster's ratkin warriors are combat's and stand
in the muster already; the Twins and anything else that fights here are this module's
entities, and they deal chaos, because the mutagen is the arc's poison and chaos is the type
combat.dsl declares for it. That makes this the first place a chaos resistance matters, so
say so in an examine somewhere the player will read it before the fight.

The elites who go with the player: `# entity` takes `allies: <entity>, …` once it has
`stats:`, and an ally joins its entity's fights, on the player's side when laid over
`# entity tulsa.player`. Whether allies can be given only while the quest stands is a
question for the tool; try it, and if the grammar has no way to take them back afterwards,
write the beat so the elites hold the door and the player goes in alone, and say so in a
`@@@`. The escape at the end is a forced beat the world can now do:
`perform: <action>` in a result starts a timed action the player cannot call off, and its
`on success:` can `relocate:` them back to the border; a scene written that way is what
"barely escape" looks like here. `npm run oracle -- result` prints it.

Match the style of `thieving.dsl` and `the-rat-conspiracy.dsl`: descriptive examines with no
opinion in them, grounded dialogue with a want leaking through it. Consequences are the
world remembering, as thieving does it: a `when:` node on the captain and on one or two
townspeople afterwards, and nothing global. Mark what the grammar cannot say with `@@@` and
do not work around it.

## Balance

A player reaches this quest having finished the two before it, so around level twenty in
attack and health in the band's shop gear. Cut the Twins against the ladder at that rung,
read with `npm run ladder-check -- --world <your corpus>`, and read what the fight does to
such a player with `npm run simulate-activity -- <save> --ladder combat.attack=20,combat.health=20 --world <your corpus> --at <the room>`
before and after any number you move. A boss pays once, so pay the landing as a lump and
not as a rate; the reward above is the quest's, and the Twins' own drop is a unique jewel or
nothing.

## Done means

`npm run oracle -- --at <your corpus>` green, a `# test` that walks the quest start to
finish from the captain, and a report saying what the three blank steps became, what the
elites turned out to be, and every `@@@` you wrote.
