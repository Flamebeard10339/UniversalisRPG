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

## Whether a stretch may be composed of two numbers rather than named by one

`inflict: <buff> for <duration>` now takes a stat, and it is read off whoever the buff
lands on. That is one number, so a mark's own grip and a thief's nerve cannot both be in
it: what ships instead is two stats a mark picks between — `thieving.daze-length` at three
seconds and `thieving.collar-length` at ten — and two nerve passives that take a
percentage off **both**, because a hand hard to hold on to is hard for a townsman and a
knight alike.

The cost is that "nerve shortens every hold" is written once per hold. A third stretch —
a gaoler, a mantrap — is two more clauses on `brazen` and `hard-faced`, and nothing says
so if they are forgotten.

*Moves when: he says whether that is a rule or a choice. If a wheel is meant to be able to
shorten one hold and not another it is already right and this line goes. If it is meant to
shorten all of them, the number wants two sides — `for their grip less my nerve`, the shape
`accuracy:` already has — and that is a bigger build than the one just done.*
