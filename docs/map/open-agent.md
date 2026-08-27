# Map — open, for a lane

## The map cannot tell a one-way road from a two-way one

`Road.mutual` in `src/runtime/map.ts` is computed by asking whether the far end lists
this one — but `closeAdjacency` closes every road both ways before the view is
published, so `mutual` is always true. The dashed line and arrowhead in
`MapPane.tsx`, and the `->` in `scripts/lib/mapText.ts`, are unreachable. The
authored direction never leaves the registry, so `/unlink` also stages its removal
at whichever end was named rather than at the end that wrote the road — which is a
no-op when the far end wrote it.
*Closes when:* `publishPlaces` says which end of each road authored it, both
renderers draw a one-way road as one, and `joining` takes a road away at the end
that wrote it. Waits on the ruling in `open-human.md` about what one-way should mean
on the shipped map.

## Dragging a place placed off another still refuses, with no warning first

`up of castle-hall` now survives into the view, so a drag carries what hangs off the
place under the finger and `/place` writes no line for it. What is still missing is
the other direction: dragging the hung place itself refuses, and nothing says so
until the refusal arrives.
*Closes when:* a place written off another is drawn as pinned — a tether, a badge,
something — so the refusal is never a surprise.

## A region cannot be edited from the map

`# region` is authored by hand. Adding a place to one, taking one out, and making a
region out of a few places selected on the map all go through `/dsl region <id>
+holds: …`, which is a line an author has to know.
*Closes when:* regions have the same treatment places got — a command that says what
it means, and a control on the map that sends it.

## An entry cannot travel as a patch

`patchedInto` places fields by where they are written; an entry — an action, an
event — goes home by the label it carries, and `fieldSites` says nothing about
labels. `foldedHome` in `scripts/consolidate.ts` therefore sends any staged section
holding an entry home whole, which is what every staged section did before patches
existed. Nothing regressed, but a partial edit that adds one action to a location
still overwrites the rest of it.
*Closes when:* entry sites carry their labels and `patchedInto` matches an entry home
by label, or the fallback is proved unnecessary because nothing stages one.

## The text map gives up on a road it cannot draw straight

`drawnMap` draws a road along a row, up a column, or across one corner, and says the
rest in words under the map. Standing in the market square that is one road out of
about a dozen; standing in the castle it is two. Correct, and further from a picture
than it needs to be.
*Closes when:* a road that has to bend is drawn bending, or the lattice leaves a lane
between columns for one to run down.

## `/place` cannot make a place, only move one

Making one is `/dsl location <id> x: …`, which the map pane sends. That is one line
and it reads well enough, but it is the one map edit that is not a command of its own.
*Closes when:* making a place is `/place` on an id nothing declares, or a command
beside it, and the map pane sends that.
