# Map — open, for a lane

## The map cannot tell a one-way road from a two-way one

`Road.mutual` is now simply true: every road the load path publishes is walked both
ways, because `closeAdjacency` closes each authored edge back before anything sees it.
It used to be derived by asking whether the far end listed this one, which is a
question about **discovery** and not about direction — a found place publishes only
the roads to places the player has found, so on an author's map most roads read as
one-way and drew a dashed line with an arrow on it that nobody had written. The
derivation is gone; the dashed line and the arrowhead in `MapPane.tsx`, and the `->`
in `scripts/lib/mapText.ts`, are unreachable again. The authored direction still never
leaves the registry, so `/unlink` also stages its removal at whichever end was named
rather than at the end that wrote the road.
*Closes when:* `publishPlaces` says which end of each road authored it, both renderers
draw a one-way road from that, and `joining` takes a road away at the end that wrote
it. Waits on the ruling in `open-human.md` about what one-way should mean on the
shipped map.

## A region's shape waits for the drop when one of its rooms is dragged

Dragging a room now moves that room alone, which is what `place` mode is for; the
shape round it is the engine's `hull`, worked out before the drag started, so it sits
still until the room lands and the sheet is drawn again. Dragging the region's own tag
moves shape and rooms together, because everything it holds is being carried.
*Closes when:* the hull is redrawn under the finger — which means the pane asking the
engine for the shape of a set of points it has moved, rather than working one out of
its own, since which shape a region draws is a setting.

## A place written off another can only be written off one that is on the map

`pin` mode takes two taps and works the direction out of where the two places stand, so
the second tap has to land on something drawn. Two floors are reachable at once — the
first tap survives changing floors — but a place on a floor the author cannot see from
here cannot be tapped at all, and neither can one no region has opened.
*Closes when:* the second tap can name a place the map is not drawing, or the floor
selector can be held open while the map is worked on.

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
and it reads well enough, but it is the one map edit that is not a command of its own
— `/region` now makes a region of a name nothing declares, so the two are no longer
alike.
*Closes when:* making a place is `/place` on an id nothing declares, or a command
beside it, and the map pane sends that.
