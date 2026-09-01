# What is still wrong that waits on the author

Everything here is open. **A line is deleted the day it closes**, and one you answer
crosses to `open-agent.md` carrying what was measured for it.

The seven skills are built, trained, geared and tested. What is below is what a lane
could not settle: numbers that only play can judge, and three shapes that are a design
answer rather than a defect.

---

## Whether the sewer should be able to kill a beginner

Six feral rats in the junction on a forty-second respawn is what makes it about 216 health
a minute, which is what makes it the first rung. A fresh player who walks in and stays
**faints**: measured by letting `a-feral-rat-picks-the-fight-itself` run to `wait: done`
before it was bounded — the run ends with `core.fainted` set and the player back where
they started. One rat at a time is all that engages, but nothing pauses between one dying
and the next starting, and the save that test loads carries no food.

The puzzle rooms were thinned back to their old populations for exactly this reason: six
aggressive rats in the outfall meant the barred door could never be picked. The junction
and the tunnels were left dense because that is where the experience is meant to be.

*Moves when: he says whether a beginner is supposed to be driven out of the sewer and back
to the bench, or whether the first rung is meant to be survivable standing still. Either
is a count and a respawn; guessing decides how the whole first hour feels.*

## Whether every dish should burn at the same rate

`# recipe`'s `accuracy:` and `evasion:` both name a stat, and both are read off the player
— a craft has no opponent to read the other side off. So a dish's difficulty cannot be
written on the dish, and every recipe in `content/cooking.dsl` is contested against the
player's `cooking` and nothing else: about one in five ruined bare at level 1, about one in
eighteen at level 20 in a full kitchen. A salmon is worth more than a shrimp and risks
exactly as much.

Giving each tier its own difficulty means inventing a stat per tier, and a stat is
something the character sheet draws — the player would read *Searing Difficulty 120* on
their own sheet, which is the reason a lane did not do it.

*Moves when: he says whether tiers should differ in risk. If yes it is a language question
(a recipe wants a number where it now wants a stat) and not a content edit, which is why
this is here rather than in the other file.*

## Whether Smithing and Crafting levelling should buy anything but speed

Both stats are used as their recipes' `rate:`, so a level makes the pile go down faster and
does nothing else — nothing smithed or crafted can be spoiled, and nothing is gated on the
level. The coin cost of bars is the whole of what paces smithing. It works and it is thin
next to Fishing, where the level decides whether the cast lands at all.

*Moves when: he says what a level of either is supposed to be worth — a chance to ruin the
bar, a gate on the better recipes, a yield. Each is a different mechanic and two of the
three need a language feature, so this is not a number a lane can pick.*

## What a player is told when gear refuses to be worn

`requires:` on an item is built, and the iron set asks ten of both combat skills while the
Knight's Sword asks twenty Attack. The carried screen asks the same gate the equip
directive asks, so a player under the level is offered **no Equip verb at all** and is told
nothing about why. `engine.equip.requires` — *"You are not the {item}'s match yet"* —
only reaches them down the directive path, which the app does not use.

*Moves when: he says whether the verb should be absent, or present and refuse out loud with
that line. The second is the smaller build and puts a reason on the screen; the first is
what is there now and says nothing.*

## Which stat Woodcutting raises, if any

Carried over from `docs/authoring-loop/` with the rest of that question answered by the
seven modules: `woodcutting` is the one skill left declaring no stat, so it grants nothing.
The natural fit by name is `felling` (base **0.25**), and it is not a balance nit — at
level 2 a trunk would fall in one swing where it now takes four.

*Moves when: he names a stat, or `none`. It is one word in `content/core.dsl` and the
derived proof in `stat.test.ts` follows it with nothing else edited.*

## A number inside a result cannot read a stat, and three asks now want it to

The Angler's Knot was asked to carry a chance not to spend the bait. What a cast consumes
is written in the cast — `if has wrigglers: 3 in 4: take: 1 wrigglers` — and nothing reads
a stat there, so a jewel cannot move it.

Two more of the same shape have since arrived, both named in the starting-town brief and
neither buildable. **`bait-persistance`** is that chance, as a stat. **`daze-resistance`**
would shorten the daze a caught hand costs, and a buff's duration is written on the buff
as a literal — so the only way one mark differs from another is by carrying its own buff
item, which is what `thieving.collared` is. Two tiers of daze is tolerable; a number per
mark is not, and neither is a player stat that shortens all of them.

There is one feature under all three: **a number in a result that reads a stat** — a
chance, a duration, a count. Two `@@@` carry them, on the Angler's Knot and on
`thieving.collared`, each written where the thing should have been, so `npm run notes`
reads them out. `bait-persistance` is the jewel's note said as a stat rather than a
third one.

*Moves when: he says whether a result's numbers may name a stat. It is one shape in the
result grammar and it would serve at least these three; the notes are honest without it,
and the workarounds shipped are honest too, so nothing is broken while it waits.*
