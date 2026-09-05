## Dusk is two facts in two places, and a third water would make it three

`fishing.dsl` writes `wait for dusk` twice, with identical `hidden if:`, `time: 20` and
`inflict: the-rise for 3m`. How long dusk takes and how long the rise lasts are one fact each,
written once per water.

Found beside a worse one now fixed: ten waters each wrote out which rod and bait a cast needs,
and the tenth had drifted so a player with an upgraded rod could not fish the blowfish hole at
all. That gate now lives on `# action cast`. This is the same shape, smaller.

*Closes when:* one action holds the wait and the rise, and each water says only where it is.

## `take:` of an item held several times over should put up a choose-item modal

Ruled 2026-09-04, and none of the three answers that were on the table. `take: 1 <item>` where
the player holds more than one copy is not the engine's choice to make by a rule: **it puts up a
choose-item modal and the player picks**, showing each copy as the inventory shows it, which is
enough for somebody to tell their spare from their build. That makes `take:` safe for several
copies rather than a thing an author has to write around.

What stands today is that `take:` spends `stack + worn` (`spendable` in
`src/runtime/itemInstance.ts`) and cannot reach a rolled copy in the pack at all, while
`inventory.` reads `stack + grown + worn` (`heldCount`, same file). The two disagreeing is what
made the Rook beat's choice vanish with nothing said: `has small-fishing-net` true,
`inventory.small-fishing-net` 2, and the choice filtered out of the list. It cost a trace and
four narrowing experiments to find, on a beat where the condition and the `take:` name the same
item three lines apart.

The Rook beat is written round it with `take: worn mainhand`, so nothing is blocked; that line
goes back to `take: 1 small-fishing-net` when this closes.

*Closes when: `take:` of an item the player holds more than one of raises the modal and spends
the copy that was picked; a route can answer it the way a route answers any other modal; and
what "can pay" means has one home, so `spendable`, `heldCount` and the page cannot drift again.*

## The mire is dangerous water and its fish are owed a premium for it

Ruled 2026-09-04. `top-floor-to-30` reading **626 game-minutes against the curve's 437, 1.43x**,
is **correct and stands** — a floor route walked by somebody who never fights better than the
bare minimum is meant to read slow, and thieving's own floors span 0.78x to 2.08x across the
same band.

What follows from it is not a re-cut of the difficulty. `tulsa.swamp-mire` is the purest example
the world has of a **dangerous activity**: `tulsa.bog-lurker` is aggressive, jumps a player
before any action is armed, and comes back every five minutes, so a climb that takes hours
fights it again and again. The fish that live only there — the tench and the eels — are owed
better rewards to compensate, and the ruling leaves the shape open: a higher `value:`, a better
buff on the cooked item, or more experience, whichever reads best.

Explicitly **not** the answer: sweeping the mire without `unkillable` and cutting the numbers to
whatever that reads, and moving a bread-paste seller nearer the water. Both were considered and
refused.

One thing to be careful of, because it is the shape this repository keeps having to undo: once a
premium is paid, *why* it is paid lives only in the size of a number. If the tench or the eel is
ever put in a second location that is not dangerous, the premium travels with it and nobody will
know. Whatever is written should say on the fish that it carries a danger premium, rather than
leaving that in a commit message.

*Closes when: the tench and the eels are paid for the risk, the premium is recorded where the
fish is rather than only in its numbers, and `top-floor-to-30` is re-read so the new figure is
the one on the sheet.*

## Five minutes is the contest's window, and nothing has played it

Ruled 2026-09-04: five minutes of game time is the right length for the match. What is owed is
the check that it is *possible* — nothing has walked the contest at a level where landing a fish
worth weighing is uncertain, because every route that proves it stands on a save handed the gear.

*Closes when: a route or a sweep says how many casts five minutes buys at the contest's own band,
and that a fish that beats Fenn's salmon can be landed inside it by somebody who is not already
kitted.*

## The eel trap is the one offer in the module with no price on it

`npm run simulate-activity` cannot measure it, for a reason that is the tool's rather than the
trap's, and that reason is written up in `docs/balance/open-agent.md`. Its own route sets and
lifts three times over and passes, so the loop works; what it pays an hour is a reckoning
(`xp: fishing 120` a lift against a three-minute soak, so about 2,400/h) that nothing has run.

*Closes when: the balance line about a two-action offer closes, and the trap is swept like every
other water in the module.*

## Cooking's three jewels are one-off finds, so a cook has exactly three, ever

`a-cooks-hands`, `a-hot-pass` and `a-steady-hand` each come from a single `hidden if: emptied`
search in tulsa — the end drawer of a range, the spike on the bar's pass rail, Aggie's spoon
crock. There is no repeatable source of any of them at any rarity, so what a cook can socket is
fixed at three for the life of a character, and the rarity scheme the world rules by — a shop's
common, an uncommon at one in sixteen to sixty-four, a rare at one in a hundred and twenty-eight
— has nothing to say about cooking at all.

Every other skill's jewels drop off something a player can go back to. This is why cooking's
ladder residual sits where it does even after a whole band of gear was added: 9.4 short at level
20 and 17.1 at 30, on six worn pieces with 116 plane points and no way to fill them.

*Closes when: cooking has a repeatable jewel source cut at a rarity, the way fishing's four drop
off its waters — at which point the residual is read again and is the real one.*

## Fishing is still 39 short at level 30 with its whole band now buyable

Making the gansey, the waders, the hobnailed boots and the creel purchasable took fishing's
residual at 30 from 67.8 to 39.2, and moved 20 not at all — the band added was all level 25 and
above. So the shape of what is missing has changed: it is no longer that the gear does not
exist, it is that seven worn pieces with 141 plane points cannot be filled from the four jewels
fishing drops.

*Closes when: the level-30 orb the thieving pass is also waiting on is readable, and fishing's
top rung is sized against the residual rather than guessed — the same line `docs/balance` holds
for thieving, and neither closes without it.*

## Every piece of fishing speed gear in the world reaches two waters out of eleven

Ruled 2026-09-05: **the carp hole is buffable, and ideally every fishing action is improved by
`fishing-rate`. A harder water may declare a higher default, the way a guard, a knight and a
civilian each daze for their own duration.**

What is there today does not do that, and the gap is a live bug rather than untidiness.
`# stat fishing-rate` (`content/fishing.dsl:31`, base 6) is what every piece of fishing gear
feeds: `hobnailed-river-boots` (+2), and the five passives of the fishing tree — `quick-cast`
(+1), `practised-throw` (+2), `fast-hands` (+12%), `full-wind` (+5), `clean-turn` (+20%). It is
read by exactly two waters, the shrimp and anchovy shoals, because those are the two that cast
with a net. The other nine read `rod-cast-rate` (base 4), which nothing but `the-rise` feeds, or
a literal — carp 2, blowfish 15.

So a fisher who takes the whole passive tree and the boots casts faster at the two lowest waters
in the game and at no other. `# item rod-and-winch` is the sharpest instance: it carries
`-15% fishing-rate` as the price of its `+130 max-line-health`, and that penalty reaches nothing
at all — it is a rod, rods are mainhand, and holding it makes the two net waters unavailable.

**The shape the ruling asks for is not expressible today, which is the thing to settle first.**
`npm run oracle -- stat` gives a stat a `base:`, an `at most:` and a rounding, and no way to
derive one stat from another. A per-water rate stat therefore either sits on the player — where
gear can reach it, but every future item has to name every water's stat — or on the water, where
gear cannot reach it at all. Collapsing every water onto `us.fishing-rate` reaches the gear and
throws away the authored difference between a net, a rod, the deep slow carp bend and the
blowfish hole.

*Closes when:* a stat can be declared as another stat scaled or offset — so `carp-cast-rate` is
`fishing-rate` at a third and the boots and the passives reach it — and every water names one,
including the two that name a literal today.

## Two of the three bait tables are one table with the item swapped

`# droptable spend-bread-paste` (`content/fishing.dsl:275-279`) and `spend-herring-strip`
(`:281-285`) are the same four lines with one id changed:

    one of:
      bait-persistance: nothing
      100x:
        take: 1 <the bait>

`spend-bait` (`:265`) is genuinely different — it branches on wrigglers — and should not be
folded in with them.

Re-weight what a cast costs, or change how `bait-persistance` is read, and one of the two
follows. A fourth bait is a fourth copy.

A droptable takes no parameter and cannot name the bait it is rolled for, so this does not
close in the grammar today. It is the smallest instance of the same want as the tag line in
`docs/open/open-agent.md` — a body that could say *take one of whatever bait this cast used*
rather than naming it.

*Closes when:* a droptable can be rolled for a named thing, or a cast spends its own bait
without a table per bait.

## `old-slate` says it has not been landed twice over

`content/fishing.dsl` hides the entity once it is landed — `hidden if: not level.fishing >= 30
or old-slate-landed` — and the cast then writes `not old-slate-landed` again in its
`+requires:`.

Both are load-bearing for different moments: the `hidden if:` stops it being offered, and the
`requires:` is re-read every cycle, which is what stops a cast already under way from landing it
twice. So this is not simply a copy — but nothing says which is which, and a reader deleting
either has to work out the distinction from first principles.

*Closes when:* the two are distinguished where they are written, or the engine ends an action
whose subject has become hidden and the second one goes.
