# Plague Matters

Write **one new module, `content/plague-matters.dsl`**, the only file this run may write.
Its note is `.planning/planning_quests/Plague Matters.md`: every step blank, a requirement,
a start and a summary. Read the note, then read `content/reverse-infiltration.dsl` whole,
because this quest requires it and ends what it began, and `content/combat.dsl`, because
every fight here stands on foes and types declared there.

The summary is the whole design: speaking to the guard captain begins the final battle, but
the ratkin have sent sappers under the castle walls and the Black Plague himself is leading
the charge. Go and stop him. This is the end of the ratkin arc and of the MVP's story, so it
ends with the town changed — not with a number, with people saying different things.

The note leaves the reward blank. Propose one in the shape the arc's other quests use —
attack and health experience, and coin from the captain — sized above Reverse Infiltration's
12,500 and 18,500, and say in the report what you chose and why.

## What it may lean on

Depend on `core`, `tulsa`, `combat` and `reverse-infiltration`. Do not edit any of them. The
tunnels and the muster under the town are `tulsa.tunnels` and `tulsa.the-muster`, and the
sappers' way under the walls is a room or two of this module's own reaching the map from
them with `adjacent:`. The ratkin warriors in the muster are combat's; the sappers and the
Plague are this module's entities. He deals chaos and is the arc's boss, so he drops the
arc's unique jewel, at the rarity the world rules by: one in two hundred and fifty-six or
worse is for a repeatable boss, and a boss met once drops it once.

Two things the world can now do that the earlier quests could not, and that a final battle
wants: `perform: <action>` starts a timed action the player cannot call off, which is how a
scene is written — the walls coming down, the charge — and `allies:` on
`# entity tulsa.player` puts the town's fighters beside the player in the fight. Read both
off `npm run oracle -- result entity`. Where a beat cannot be said, mark it `@@@`.

Afterwards the town remembers, the way thieving's town does: a `when:` node laid over the
captain, the crier, Kelsa, Oolga, one or two guards. Nothing global, no meter.

Match the style of `thieving.dsl` and `the-rat-conspiracy.dsl`: descriptive examines with no
opinion in them, grounded dialogue with a want leaking through it, no story-book narration
even at the end.

## Balance

A player reaches this at the top of the ladder, around level thirty in attack and health, in
the top band's gear and with whatever Oolga sells. So the Plague is a `boss` tier met at
`level: 30`, and the engine cuts it from there — there is no number to solve. Choose its
`profile:` for the shape the fight should have and say in the report why that shape.

`npm run ladder-check -- --world <your corpus>` says whether it reads as what it names. **Do
not run `simulate-activity` and do not move numbers.** A boss pays once; pay the landing as a
lump.

## Done means

`npm run oracle -- --at <your corpus>` green, a `# test` that walks the quest start to
finish from the captain, and a report saying what each blank step became, the reward you
chose, and every `@@@` you wrote.
