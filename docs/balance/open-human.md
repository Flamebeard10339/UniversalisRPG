# What is still wrong that waits on the author

Everything here is open. **A line is deleted the day it closes**, and one you answer
crosses to `open-agent.md` carrying what was measured for it.

---

## Whether a fresh character is meant to survive an hour of picking pockets

`npm run simulate-activity -- tulsa.in-town pick-pocket` kills the starting character
in **4 of 4 seeds**, at around 400s of the 3,600s window, having earned about 110
thieving xp. It reads the same from every square in town. The pace while it runs is
close to right — 945–998 xp/h against a level-1 curve asking 1,200 — so nothing is
under-paying; the run simply ends. Thieving-ability opens at **1.01** against the
civilian's vigilance of **20**, so most cycles are a catch, and a catch is one health
against roughly four health a minute of regeneration. Nothing about this is new: the
route `a-hand-goes-out-again-after-it-is-caught` walked to 200 xp and died doing it
before the daze was ever landing, and it now asks a question it can answer instead.

*Moves when: he says which of three it is. The opening ability is too low against a
townsman; or the catch should cost less than a health; or a level-1 thief is supposed
to pick two pockets and go and do something else, in which case the curve's 1,200/h at
level 1 is not a target this skill is meant to meet on its own and the ladder in
`docs/tulsa/` needs saying that way. Each is one number, and the sim re-answers it in
a minute.*

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

*Moves when: he states the rule, or rules that the candidate is it. Then the sweep
over all 41 is a lane's afternoon.*

## Whether the five packs are the five packs

Every shipped module now declares one: `engine` (core, engine-en), `skills` (the
seven), `tulsa`, `quests` (the nine), `balance` (tiers). They were picked to make
*turn every quest off* one click, which is what was asked for, and nothing else
about them was decided by anything. A player who wants the town without thieving
can reach in and turn thieving off under `skills`; whether that is a thing anyone
should be offered is a judgement, not a fact.

*Moves when: he reads the settings page and says whether the grouping is right. It
is one `pack:` line per module and no code, so regrouping is an afternoon.*

## What a player loses by turning a pack off mid-game

Turning quests off reopens the world, and reopening prunes a save of everything it
can no longer name. So a player mid-quest who turns quests off and back on has the
quest gone rather than paused. That is the honest behaviour of the machinery and it
is not obviously the right one to put in front of a player, as against refusing the
toggle while a save is standing, or warning first.

*Moves when: he says whether a portal toggle is a playtest lever that may eat a save,
or a player-facing setting that may not. The first is what is built.*

## Whether `-<line>` should work on a field that holds one value

The grammar page offers `-<line>` on every line of every section. It now works on
lists, on entries and on keywords. It is still refused on a field holding a single
value — `-examine:` says *examine is not a list, so it cannot take -* — so the page
promises more than the engine does by exactly that much.

Both answers are defensible: unwriting a scalar is meaningful over another module's
body, and a refusal with a clear message is not a bug. What is not defensible is the
page and the parser disagreeing, which is what a reader is left with today.

*Moves when: he says whether taking a scalar back is a thing the language should do.
If yes it is a small parser change; if no it is a sentence in `EVERY_SECTION`.*

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
