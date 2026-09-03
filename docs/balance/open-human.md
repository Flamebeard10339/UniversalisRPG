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
fact. The clearest case has since been decided by hand rather than by rule:
`a-minute-at-the-post` asserted attack xp between 350 and 750 for a minute, the
rebalance moved it by two orders of magnitude, and it was rewritten to the claim that
is actually the post's — it trains the arm and leaves the hide alone. That is one test
answered out of forty-one, and it took a judgement each time.

He said on 2026-09-02 that he does not know the rule yet, and that the speedrun runs
are the experiment that will find it. So this waits on data rather than on a ruling.

*Moves when: he states the rule, or rules that the candidate is it. Then the sweep
over all 41 is a lane's afternoon.*

## What a player loses by turning a pack off mid-game

Turning quests off reopens the world, and reopening prunes a save of everything it
can no longer name. So a player mid-quest who turns quests off and back on has the
quest gone rather than paused. That is the honest behaviour of the machinery and it
is not obviously the right one to put in front of a player, as against refusing the
toggle while a save is standing, or warning first.

*Moves when: he says whether a portal toggle is a playtest lever that may eat a save,
or a player-facing setting that may not. The first is what is built.*

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

## Which rung of the ladder is 1.0× the curve

Levels 1 to 10 could not answer this and levels 11 to 30 cannot be balanced without it,
because that is exactly where the two ladders part. Below 10 there is no thieving gear, so
a thief in civilian clothes with a full plane and a thief in the best kit he can wear are
the same character — ability 19 at level 1 either way. From level 10 the lockpicks land,
then the climbing gloves at 16 and the burglar's picks at 20, and by level 22 the two
ladders read 50 and 129. That is a factor of six in the odds of every roll he makes.

So there were two coherent worlds and they want different numbers for every mark:

- the marks sit near the **civilian** ladder, everyone can rob everything, and gear is a
  modest bonus on top; or
- the marks sit near the **kitted** ladder, gear is the gate, and a level-22 thief who
  never bought lockpicks is not getting into the jewellery box.

**Taken as the second**, on 2026-09-03, on three grounds: the difficulties the module was
written with (100 to 170) are the kitted ladder and nothing else; the gear is gated to
arrive inside exactly this band, which is what gating it there is for; and "balancing
roughly around the current gear and levels" was the instruction. Every number this pass
shipped follows from it, and re-reading it the other way is a re-derivation of all nine
marks rather than an adjustment.

The consequence to sign off on is the size of the gear gap. A kitted thief now earns
**about four times the curve** across the whole band, and the same thief with no gear at
all earns about **0.7×**. The four is not invented: the house chest the 1–10 pass shipped
already pays a kitted thief 3.9× at level 11, and a band mark that did not beat it would be
dead content. If four is too much, the house chest is where it comes from and it is a
level-1 mark, so that is a 1–10 question rather than an 11–30 one.

*Moves when: he says the kitted ladder is the reference and roughly what multiple of the
curve it should pay, or names the other ladder — in which case the nine marks are re-derived
from the same rule and the same sheet.*

## No thief can stand at any of these marks for an hour, and the pass did not price it

Every run of every mark in this band ended in death or in being thrown out, never in the
hour running down. `npc-thieving-damage` is a flat drain on the miss and the marks bleed a
kitted thief between 150 and 1,100 health an hour — the strongbox 256, the jewellery box
603, the treasure chest 1,108, which is eight health a miss and the highest in the module.
A thief who has not levelled health has nothing like that to spend.

Nothing was done about it, because §2 of the model rules that a mark is two knobs and that
cost is not a third. But the numbers this pass shipped assume the mark is being worked, and
a mark that empties the player in ninety seconds is not being worked. The two readings
disagree and only one of them can be the design.

*Moves when: he says whether the health drain is a knob the balance pass may move, or a
thing the player answers by levelling health — and if the second, whether thieving is meant
to require it.*

## The accuracy denominator does not need moving, on this evidence

Asked on 2026-09-03 whether `contest-spread` should go from 100 to 150 or 200. It is a
`# variable` a world may write, not engine code, so it is a one-line change in `core.dsl`
whenever it is wanted — `contestSpread` in `src/runtime/tuning.ts` defaults to 100 and
nothing in `content/` writes it today.

It looked wrong because the band's marks were two to five times harder than the thief
standing in front of them, which a wider denominator would have papered over. With the
difficulties sitting on the ladder instead, a kitted thief is at a coin toss, a
civilian-clothed one at about one in five and a bare one at about one in ten, and that is a
spread worth having. Widening to 200 halves it and makes gear worth much less, which is the
opposite of the reading above.

*Moves when: play says the gap between a geared thief and an ungeared one is too wide, in
which case this is the one line that closes it.*
