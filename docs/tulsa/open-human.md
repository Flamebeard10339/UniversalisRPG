# What is still wrong that waits on the author

**A line is deleted the day it closes**, and one you answer crosses to
`open-agent.md` carrying what was measured for it.

Fishing and thieving both land on the curve at all three shipped tiers and their
frontiers climb with the level. Combat does not, and no room is the reason — every
combat room in the town pays on target for as long as anybody can stand in it. What
is undecided is what pays for standing there, and that is the first line; everything
else here is smaller.

---

## Whether a long fight is meant to be paid for by gear, by food, or by dying cheaply

Only **two** offers in the whole questless town run a full hour: the market square,
where a faint puts you back where you fell, and the pasture, where the chickens do not
fight back. Everywhere else the run ends in a death and a walk back from the square.

Read the sheet's two columns rather than one. Nearly every combat row pays
**2,300–4,500/h while it ran** against a level-20 target of 2,177 — the muster pays
4,344–4,790 on attack and 2,903–3,226 on health for the five minutes a tier-20 build
lasts in it, and 307–396 and 228–240 over the window. **The rooms are sized correctly
and none of them can be occupied.**

What bounds it is `core.regeneration`, and that stat does scale — measured, not
reckoned: bare **1**, wearing one cluster whose root is `mending` **3**, with
`orb-of-renewal` on that cluster **3.5**, and a fuller plane reaches about six, which
is where health would land near 1× at twenty. So the ceiling is a build's, not a rule's.

Which leaves the question as a design one rather than a defect. Three things pay for a
long fight and the world half-builds all three: **gear** (jewels, now reachable — see
`open-agent.md` for what the sheet still cannot wear), **food** (every cooked fish
grants regeneration for a couple of minutes, which is what cooking is for), and **dying
cheaply** (the market square, today, by accident of where a faint puts you).

**Since this was written the tiers have been dressed, and it answers half the question
and sharpens the other half.** With every point its gear dropped with spent, combat
attack at twenty goes 0.55× → **1.3×** of the curve and the frontier moves off the
market-square townsman onto the ratkin-warrior at the muster — a fight the undressed
build could not hold. So gear does carry the attack half, and the muster is a room
after all.

Health went the other way: 0.24× → **0.14×**. That is structural rather than a number.
`combat.dsl:49-58` pays health on *damage taken*, and says so deliberately — "armour
that stops a tier hurting you is armour that stops it training you, which is the whole
reason to walk further out". Walking further out did not compensate, and it cannot,
because what bounds damage-taken-per-hour is regeneration, and **regeneration has one
passive and one orb in the entire game**: `mending` (+2), which appears in `stout-heart`
at position 6 and in the DEBUG-only `heartwood-core`; and `orb-of-renewal` (+25%), at
1-in-25 off the ratkin-warrior. Sitting is +10 and a cooked dish up to +16, so every
temporary source dwarfs everything a build can permanently carry.

**It is dying cheaply, and the sheet now says so in one line.** The king's road
guardsman at tier-1 pays health **4,670–5,103/h while it ran** against a 1,200/h
target — nearly 4x — and reads 0.28x over the window, because it `worked 233–254s of
the 3,600s` and `Death happened` in 4 of 4 seeds. The room is not weak. Uptime is 7%.

`content/tulsa.dsl:1473` is the whole of it: `on death` does `relocate: market-square`
from anywhere in the world, so every death at the castle gate, the king's road or the
muster costs the same walk back, and that walk is 93% of the hour. Attack is unhurt
because it is paid per swing landed, so a short life still earns; health is paid per
hit taken and is therefore pure uptime.

The arithmetic is unusually clean: ~4x target at 7% uptime, so **~25% uptime lands
health on the curve** and nothing about any enemy, drop, rate or piece of gear has to
change.

*Moves when: he says what a faint costs. Content can name only a location and not
"where you fell", so the shapes are: no relocate at all for a plain
faint (dying costs the health bar and the interruption, nothing more); a respawn point
per region; or leaving it and accepting health as a slow skill with its own curve.*

## Whether the sheet is allowed to eat

`simulate-activity` walks one offer for the window and eating is a different offer, so
every rate it has ever printed is for a character who never ate. For fishing, thieving
and cooking that is the truth. For combat it is a floor that no player would ever
actually sit on, and it is the difference between a room reading 0.24× and reading 1.3×.

Making the tool eat breaks its own stated principle — it would be the tool deciding
what a player does rather than asking the engine what is on offer — so this is not a
small change and it is not obviously right. It only matters at all if food is the answer
to the line above; if gear is, the tool needs to wear a jewel instead, which is
`open-agent.md`'s.

*Moves when: he says whether a run may take an offer it was not pointed at in order to
keep going. If yes it is one rule ("when a pool is low and something in the pack fills
it") and every combat row in the table moves. If no, the combat rows are understood as
the never-ate floor and the balance target for them has to be stated in those terms.*

## Whether a guard should jail rather than hold

The brief says a hand caught in a guard's pocket ends in jail. What ships is
`inflict: thieving.dazed for thieving.collar-length` — ten seconds of somebody's fist
in your shirt — because a `relocate:` to the barracks ends the run and the sheet then
measures the walk back rather than the guard. Jail is the better fiction and it costs the guardsman its place on the ladder:
it currently tops the first band at 0.99× of target at level ten, and it would go to
roughly what the knight reads when it is throwing you across town.

*Moves when: he says whether the first band's top rung is meant to be farmable at all,
or whether being caught by the duke's men is supposed to end the afternoon. Both are
one line in `content/tulsa.dsl`.*

## Whether the muster is a room or a wall

Six ratkin warriors at 115 health on a ninety-second respawn, and a tier-20 build in
full iron dies there in about five minutes having killed thirty of them. That is
correct if the muster is meant to be what you are not ready for — the thing past the
tunnels that says the next region exists. It is wrong if it was meant to be the room
combat levels 11 to 20 are spent in, because nobody can spend an hour in it.

Nothing there is aggressive, which is what lets a beginner walk in, look, and walk out.

*Moves when: he says which of the two it is. A room means bringing its numbers down
until an hour is survivable, which given the line above means it stops being dangerous
at all. A wall means combat's second band is somewhere else and this stays as the door
to it.*
