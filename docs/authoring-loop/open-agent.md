# What is still wrong that an agent can take

The queue an autonomous lane picks from. Everything here is open; nothing here is
done. **A line is deleted the day it closes** — not struck through, not annotated,
deleted — and if what it settled is something a later agent could get wrong, one
sentence about it goes in `settled.md` instead. Git holds the reasoning, and the
commit that closes a line is where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here is proved headlessly — `npm test`, `npm run probe`,
`npm run oracle`, `tsc --noEmit` — and the shape is already settled, so a lane can
take one to the end without asking. What waits on the owner's play, his reading of
the writing, or a ruling nobody has taken is in `open-human.md`.

**A line here that turns out to need his judgement does not stay here flagged — it
moves, carrying what you measured.** Guessing the ruling and abandoning the lane
are the two bad answers, and the second is worse, because the measurement dies with
the session. `deliverable-log.md` states how a line crosses, in both directions,
and is the one place that rule is written.

---

## From the owner's play, 2026-08-24

Not recorded through the playtest tool, so no `# test` stands behind any of it. The
wants are the owner's own and are not in doubt; anything below that reads as a bug
still has to be reproduced before it is diagnosed.

Several of these crossed from `open-human.md` on 2026-08-25 when the ruling each waited
on was taken. **The ruling is stated in the line and is authoritative** — a lane takes
it as given rather than reopening it, and a lane that finds it cannot be held sends the
line back with what it measured.

### Grids, not lists

**The pack has no order the player owns.** The want is drag-and-drop to swap two items.
`state.inventory` is a `Record<template, count>` and `packRows` reads its order off that
(`src/runtime/itemInstance.ts:134`), so there is nothing to reorder and nothing a save
would carry. `DragSheet` is the drag surface the map and the plane already share, and
with the grid ruling the thing dragged is the cell. *Closes when:* the pack has a
player-owned order that survives a save.

### Chat readability, and the information dump

**A new location dumps everything at once, and none of it has been examined.** Two
rounds of play on the same subject. From 2026-08-23: *"There should be some sort of
visual cue that I already examined this object."* From 2026-08-24, the larger form:
something never examined shows as a question mark that hides its name and its actions
and keeps only its background colour, so a room the player has not read is a short list
of unknowns rather than a wall of text. Examining twice says the same words and a third
time says nothing at all, because the node has fallen silent — and the player cannot
tell those two apart either. Both rulings it waited on are taken. **The terminals mask
too**: an unexamined entity reaches the REPL and the playbot as an unnamed placeholder
whose only offer is *Examine*, so all three surfaces say the same words and the parity
harness keeps its whole claim with nothing excused. **The playbot reveals a room free on
arrival**, examining everything unexamined at no turn cost, so its runs stay about the
quest and its turn budget keeps the meaning it had before the mask. *Closes when:* what
has been examined is visible on the thing, an unexamined room costs less to read than it
does now, and the mask reads the same in all three surfaces.

### Balance, and four rulings from playing it

**The whetstone is a step that buys nothing.** *"just have gear drop with a certain
amount of points. Drop the whetstone idea. It is just an extra step."* Today an
instance's level is `skillLevel(payload.experience)` capped at `max-level:`
(`src/runtime/itemInstance.ts:293`) and `feed:` is how the experience arrives. Wanted
instead: gear drops carrying its points, rolled from a range the item declares
(`item-level: 3-8`) — which also makes every piece of gear an instance stacking to 1,
because the roll is what makes two copies different. **And it is the same declaration
that says a piece of gear has a skill tree at all**: an item with an item level has a
plane, an item without one does not. *Closes when:* an item declares its level range
and a drop rolls it. The cost is known and it is not small — 39 whetstone lines across
`core`, `tulsa` and `combat-expansion`, and 22 files under `src/` and `scripts/` that
name one.
RESPONSE: It would be nice if these kinds of balance refactors cost less. There are going 
to be many features that are built then cut. It probably isn't possible, but some effort 
to reduce the work of removing features would be nice. 

**Nothing can be unallocated.** The ruling: passive points refund for free and jewel
sockets do not, so a socketed jewel is semi-permanent, and a node whose removal would
strand a socket cannot be taken back. `src/runtime/clusterPlane.ts` only ever grows a
plane — there is no unallocate of any kind, free or costly, to build that rule on.
*Closes when:* a plane can shrink, and refuses to shrink out from under a jewel.

**A jewel's passives should roll.** Ranges on a jewel's passives, locked in the moment
it is allocated and socketed. That is the same roll-and-fix shape as the item level
above and wants deciding with it rather than after it.

**Travel should be 2–5 seconds everywhere.** *"Travel feels bad."* Today it is
straight-line distance × `travel-seconds-per-unit` (`src/runtime/actionLookup.ts:63`,
default 5, set at `content/core.dsl:20`), so the time is a function of map coordinates
and gets worse as the world grows: a flat band is a different mechanism, not a
different number. Beside it, **travel actions should leave the action list** unless
they are an entity's action, because they are visual clutter — the GUI already drops
the multi-leg ones (`aWalkAway` hides any choice with `legs > 1`, `src/ui/choices.ts`),
so this extends a rule that exists rather than inventing one. The REPL and the playbot
would then need somewhere else to travel from, and a `/map` command is the proposal.
*Closes when:* travel costs a flat few seconds and is reached from the map. If it
lands, *Travelling shows no progress on the map* in `open-human.md` may close with
it: a three-second walk does not read as a freeze.

## Ours, and small

**`readable()` in `src/ui/render.test.tsx` cannot see an `aria-label`.** It injects the
attribute's value inside the tag, and the following `/<[^>]*>/g` swallows it again — so
any assertion that a label reaches a screen through `aria-label` passes without reading
anything. Found by the lane that made a cell's background examine, whose examine label
is exactly such a case; it derived its one exception rather than weakening the claim, so
nothing is currently hidden by this. It silently disarms the next one. *Closes when:* an
`aria-label`'s words are readable to that test.

**A `DEBUG` section reaches a player without anything naming it.** Two roads, found by
the audit that swept every `standingSources()` caller with a planted `DEBUG` section of
each kind. A `DEBUG` `# resource` draws in the player's status bar on every turn as its
raw key — `core.resource.probe-resource.title: ██████████ 10/10` — which
`scripts/printedWords.test.ts` catches loudly. A `DEBUG` `# stat` reaches `/state`'s
stats blob as `"core.stat.probe-max.title (core.probe-max)":10` and **nothing in the
suite catches it**, because `printedWords` sweeps player-worded lines only and
`play-cli.test.ts` compares the stats line against `sessionStatus` itself, so it agrees
with the leak. A `DEBUG` `# location` appears the same way in `/state`'s *not yet found*
list and is caught only by that test's `tulsa.` anchor. Nothing shipped triggers any of
the three today.

Decision taken, and it is the one the engine already implies: **the row leaves the
sheet, the section is not refused at load.** `load.ts` empties a `DEBUG` section's words
rather than refusing the section, precisely so a `DEBUG` thing stays usable for testing —
refusing a `DEBUG` `# resource` outright would contradict that. So the rule extends from
*nothing a player can reach may name a DEBUG thing* to *nothing a player-facing sheet
lists may be one*, and the sweep that empties the words is the same place that should
drop the row. *Closes when:* a `DEBUG` resource, stat and location are absent from every
player-facing sheet, and a derived proof covers all three rather than the two that
happen to be caught today.

**A `DEBUG` section's `title:` cannot survive a round trip.** `unsayDebug`
(`src/content/load.ts`) empties a `DEBUG` section's locale rows, and the printer's
`authored(field)` predicate (`src/content/serialize.ts`) reads that same table to decide
whether a title was written — so it prints nothing and the reload derives a title from
the id. Found by marking the smith's chest: `npm run probe -- content --round-trip`
reported `entities: changed tulsa.smiths-chest` and named no cause. The corpus does not
hold one today only because the chest's `title:` was deleted with it. *Closes when:* a
`DEBUG` section prints back what it parsed, or the round-trip report names why it
cannot.

**A `DEBUG` section's `say:` reaches the terminal as its bare locale key.** Same
emptied table, read at a different moment: the words are gone by the time the terminal
asks for them, so the key is what a player sees. Caught by
`scripts/printedWords.test.ts`, whose script opens the smith's chest to reach a cluster
plane. Whether prose on a `DEBUG` section should be refused at load rather than said as
a key is the shape of the answer — a section that says nothing in any language has no
business carrying words. *Closes when:* a `DEBUG` section cannot reach a player with a
locale key.

**Two tests still live in the wrong module.** The hammers and their claims are in
`content/tutorial-quests.dsl` and neither touches the quest — they are `tulsa`
claims about its rat and its `rats-killed`. Six `DEBUG` sections move together, or
the move is refused at load: the two items, the two saves that arm them and the two
tests that swing them. A clean follow-up.

**A green suite under heavy load is still owed.** The lane that fixed the clock
measured green at 13 processes and, separately, green at 32 with the new clock on
the pre-split tree. Nobody has run the whole suite at 70 with the split in place,
which is where twelve tests used to fail. *Closes when:* that run is taken.


