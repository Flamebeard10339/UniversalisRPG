# What is still wrong that waits on the author

Everything here is open. **A line is deleted the day it closes**, and one you answer
crosses to `open-agent.md` carrying what was measured for it.

---

## Where the line sits between a balance number and a path fact

41 of the 66 numeric `assert:` lines in the corpus sit on roots a `# save` sheet is
already blind to (`walked: false` — inventory 28, xp 10, resource 3). So giving
`assert:` the blindness `expect:` has would kill all 41 at once, including real path
proofs: `inventory.coin = 0` after a purchase is how a route proves the purchase
happened, not a claim about what things cost.

The candidate rule: **a number a balance pass would move is a balance number; a
number a scripted hand-over produces is a path fact.** Under it
`inventory.coin = 6` is balance and `inventory.small-fishing-net = 1` is a path
fact. `tulsa.a-minute-at-the-post-is-what-the-ladder-is-cut-from` asserts attack xp
between 350 and 750 for a minute at the post, which under the rule is squarely a
balance number sitting in a `# test`, and it is the clearest case to decide against.

*Moves when: he states the rule, or rules that the candidate is it. Then the sweep
over all 41 is a lane's afternoon.*

## What a tier's experience pool is worth, per activity

§6.1 sets a tier at level L to **N × the xp needed to bring one skill to L**, N
being the number of skills the activity uses — two for combat (attack, health), one
for fishing — spent by the search wherever it likes rather than split evenly.
Whether that is the right size is a judgement only play answers: too small and every
tier reads as underpowered against its own rooms, too large and the matrix's "lowest
tier that earns from it" stops discriminating.

*Moves when: the first matrix is read and the tiers either land where they should or
do not.*

## Whether a jewel no build can win with is buffed or accepted

§2 rules that a jewel with no winning build at any tier is a finding. Whether the
answer is to buff it or to accept that it is not meant to carry a tier is not a
lane's call — `crossroads` is a connector whose whole function is reaching other
jewels, and it may never win one by design.

*Moves when: the first matrix shows a jewel with no winning build at any tier.*

## Whether a derived requirement is ever shown to a player

§6.2 produces *"20 fishing, 50 combat"* for a quest, read off the lowest per-skill
profile that completes it. There is nowhere to put it: `# quest` has no `requires:`
field (`src/content/sections/quest.ts:33-41` — stages carry `done when:`
conditions), and nothing authored can hold a derived profile. Whether this is a
designer's instrument only, or something the player reads, changes what has to be
built.

*Moves when: he says whether a player ever sees it.*
