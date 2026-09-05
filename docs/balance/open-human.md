## The top of the ladder has no gear to reach it

Found gear must add 162 at level 30 and reaches 109 — **53 short**, and 22 short at level 25.
Ruled 2026-09-03 that the answer is new gear at the top rather than a gentler slope, carrying
three things: a material naming convention, a higher item-level than anything below it
(which multiplies what a jewel is worth rather than adding to it), and a cluster-effect orb
at level 30 that scales what thieving jewels give.

The audit could not see an orb at all when this was ruled — `tier-build --grow` had no move
for one — so the size of every piece of that tier is unsettled until it can.

*Moves when: the orb is readable and the tier is sized against the residual rather than
guessed. Then it is authoring rather than a ruling.*

## Whether a simple object's reward and bite are derived rather than typed

Ruled 2026-09-05: **a saturated mark keeps paying, because that is what saturation is.** The
house chest is difficulty 25, so from about ability 90 a thief opens it every time and takes
its whole ceiling — 8,400 an hour — which is why the band's first three marks are not the
frontier at their own gate until 16. The answer is not an exhausted mechanic: *this is too
easy for you, therefore you cannot do it* is not diegetic. It is a lower saturation point or a
higher difficulty, and either is a number.

What is open is the shape underneath that ruling. A passive's worth is **already derived** —
`grants:` is written as a multiple of what one level is worth on the ladder the stat climbs,
so moving a ladder re-cuts every passive hanging off it. A chest's experience per hour is not:
it is a number somebody typed, which is how the house chest came to saturate with nothing
objecting.

The same gap shows on the other side of the same action. `npc-thieving-damage` runs 1 to 8
across every mark in `content/thieving.dsl`, most of them 1 to 3, against a `max-health` ladder
adding 100 at level one — so the recent health buff took the teeth out of thieving and no
declared line noticed. Both halves are typed numbers standing beside a ladder that could have
cut them.

Deriving a simple object's payout and its bite off the ladder would leave only the complicated
multi-step actions wanting a reward written by hand.

*Moves when: you say whether a simple object's reward and damage are derived from the ladder
the way a passive's grant already is. If yes, what counts as simple is the lane's first
question and the rest is engine work.*
