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

## An entry restating one the file already writes still travels whole

Entry sites carry their labels now, so an entry added to a location goes home under
the lines around it, and one written as a removal strikes the entry at home. The
harm the old line named — a partial edit overwriting the rest of the section — is
gone. One shape is left: an entry whose label the home already writes. `mergeEntries`
lays such a body over the declaration key by key, so a base `peck:` with `time: 7`
keeps its `time: 7` under a patch that restates only `give:`; an entry body is parsed
by `EntryBody`, which keeps no field sites, so there is nothing inside one to write
between and replacing its text would silently drop what it did not restate.

That is no longer a predicate each caller asks beforehand — `patchedInto` decides it
where the shape is known and marks the patch — so it is one home rather than three.
It is still a shape that cannot be patched.
*Closes when:* `EntryBody` carries sites of its own, which means `action.ts` and
`entity.ts` reporting where inside an entry each field was written. That is a larger
job than the fallback it removes, and nothing is broken while it waits.

## The text map still gives up on a road whose rows do not touch

A road between rows that touch and columns that do not is drawn bending now, down
the line of paper the lattice leaves between rows, and the corner slope checks its
clearance rather than claiming a road it does not show. Measured over all 104
standings of the shipped world: about eighty fewer aside lines.

What is left is roads more than one row apart — 237 of 2841 over every standing.
They have no line of paper to bend along, because the labels of the rows between
them are in the way, so they are still said in words. Letting a bend cross a vertical
was tried and reverted: the blockers on those rows are slopes, not verticals, so it
measured zero.
*Closes when:* the lattice leaves a vertical lane beside each column — offset 15 of
17 is free of every label, slope and vertical — for a road to run down past the rows
between its two ends.
