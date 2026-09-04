# What is still wrong that a lane can take

The push covered both halves of the fishing/cooking split. The design doc is
`.planning/fishing-expansion.md` and its last section holds the balance marks and how they were
derived; `.planning/cooking-pass.md` is cooking's. Fishing walks twelve routes, the floor four,
cooking three. **A line is deleted the day it closes.**

---

## A dialogue choice whose `take:` cannot be paid vanishes, and nothing anywhere says why

Measured 2026-09-03, on the Rook beat. `-> Here. (when inventory.small-fishing-net >= 2)`
carrying `take: 1 small-fishing-net` is filtered out of the choice list at the moment
`has small-fishing-net` is true, `inventory.small-fishing-net` reads 2, and the `when` on the
choice holds. The reason is that `take:` of a bare item id spends `stack + worn`
(`spendable` in `src/runtime/itemInstance.ts`) while `inventory.` reads `stack + grown + worn`
(`heldCount`, same file), so the two disagree about a rolled copy in the pack — and every item
with an `item-level:` is rolled.

Whether `take:` **should** reach one is a ruling and lives in `open-human.md`. What is a defect
either way is that an author has no way to find out: the choice is not offered, no line is
logged, the oracle's page for `take:` says nothing about which copies it can spend, and the
route that hits it fails with *no choice matches*, naming the text rather than the reason. It
cost a trace and four narrowing experiments to find, on a beat where the condition and the
`take:` name the same item three lines apart.

*Closes when: the page for `take:` says which copies it spends, and a choice or an action
turned away because it cannot pay one says so where the author can see it — with one home for
what "can pay" means, so `spendable` and the page cannot drift.*

## The mire costs more than it is priced for, and it is the whole of the top band's overrun

`tulsa.swamp-mire` holds `tulsa.bog-lurker`, which is aggressive, jumps a player standing there
before any action is armed, and comes back every five minutes. The eel bed and the tench hole
are both in it by design, so a route that fishes them fights first —
`use: core.melee-combat on tulsa.bog-lurker until done` — and a climb that takes hours fights
again, and again.

What that costs is now two measurements rather than a suspicion:

- at its ceiling, the tench reads **4,767/h against the 5,040 it is cut for**, where the perch
  and the carp at the uncontested mere hit their marks exactly
- walked, `top-floor-to-30` spends **458 game-minutes on the stretch from 20 to 30 where the
  curve budgets 250** — 1.8× — and its cumulative 626 against 437 is 1.43×

The water itself is priced right, so this is time spent not fishing: the refights, and the walk
from the mire back to Market Row for bread paste. Nothing in the module tells a player deciding
to walk out there that the water costs a fight, and no number in it is set with the fight in it.

*Closes when: the mire's two waters are either cut with the fight priced in — a sweep of them
that does not stand under `unkillable`, and payouts read off that — or left as they are with
the prose saying what standing there costs, and `top-floor-to-30` re-read against whichever it
is.*

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
