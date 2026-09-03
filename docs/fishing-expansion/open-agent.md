# What is still wrong that a lane can take

The design doc is `.planning/fishing-expansion.md` and the balance marks are in its last
section. **A line is deleted the day it closes.**

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

## Fishing has no floor route, so nothing walks its ladder end to end

`floors/` holds `thieving-floor.dsl` and nothing else. The expansion's own `# test`s prove the
paths are walkable from saves that are handed the gear; none of them starts at level one and
earns its way up, so no minute of the fishing curve has been walked rather than asserted.
`npm run floors` reads a route's goal off its closing `assert: level.<skill> >= <n>` and stands
the game-minutes it took beside what the curve allows.

*Closes when: `floors/fishing-floor.dsl` walks at least a mid-band and a top-band route, and
`npm run floors` reports both against the curve.*

## The swamp mire is contested water, and the tench hole is paying for it

`tulsa.swamp-mire` holds `tulsa.bog-lurker`, which jumps a player standing in it before any
action is armed, so every route that fishes the eel bed or the tench hole has to fight first —
`use: core.melee-combat on tulsa.bog-lurker until done` is the line, and without it the trace
shows the lurkers killed on the step that "failed to cast".

That is the world working. It is also the whole of the tench hole's balance gap: measured
2026-09-03 at `--ideal` from a save standing at its gate, the tench reads **4,767/h against the
5,040 it is cut for**, where the perch and the carp at the uncontested mere hit their marks
exactly. The five percent is time lost to lurkers, and nothing in the module tells a player
walking out there that the water costs a fight.

*Closes when: either the mire's waters are cut with the fight priced in — a sweep that does not
stand under `unkillable` — or the water says in its own prose what standing in it costs, and
the tench's row is re-read against whichever it is.*
