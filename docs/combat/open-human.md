# What is still wrong that waits on the author

**A line is deleted the day it closes**, and one you answer crosses to `open-agent.md`
carrying what was measured for it.

---

## What the player's toughness anchor should be

The toughness ladder starts at 0 and grows 7 a level, so a level-1 character is expected to
stand at nothing and a level-30 one at 203. Every foe number in the game is a share of that:
a tier's `damage share` is a fraction of what the player can lose over a minute, and its
`seconds to fell` is read against what the player deals, which is the toughness line divided
by `SECONDS_TO_FELL_AN_EVEN_MATCH`. **So this one number sets the scale of every fight in the
world**, and it is the reason the `min-damage` floor bites at low levels: at level 4 the whole
economy is single digits, and the engine cannot cut a blow smaller than one point.

You said 30, or 50, or maybe 100. Any of them is one edit once the ladders are declared, and
the machinery re-cuts every tagged body with no content change — that was measured this
session, on a change that propagated correctly and did nothing, because the lever moved was
the other one.

*Moves when: he names the anchor. It is a number, not a design, and the lane that takes it
re-reads `ladder-check` and the room table afterwards rather than guessing what moved.*

## Whether a solved reduction may go negative

The solve reaches a body's tier by writing whatever reduction makes it fall in the seconds
its tier names. Where a profile names a `pool` too large for that tier at that level, the
only way to hit the seconds is a **negative** reduction — the body takes extra damage from
every blow. `combat.feral-rat` as a `brute` solves to about −6.

It is a real state the engine understands, and vulnerability is a real thing to want. What is
odd is arriving at it by accident, on a common rat, because a profile asked for something its
tier could not afford. The two answers are to accept it as a legitimate solved state, or to
refuse it and report the profile as impossible at that tier and level — which turns a silent
compensation into a message an author can act on.

*Moves when: he says accept or refuse. Refusing is the larger change, since it means every
profile-and-tier pairing has a range of levels it is legal at, and `ladder-check` should then
say so before an author writes it.*
