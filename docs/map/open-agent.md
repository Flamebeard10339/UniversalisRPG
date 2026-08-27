# Map — open, for a lane

## The map cannot tell a one-way road from a two-way one

`Road.mutual` in `src/runtime/map.ts` is computed by asking whether the far end lists
this one — but `effectiveAdjacent` closes every road both ways before the view is
published, so `mutual` is always true. The dashed line and arrowhead in
`MapPane.tsx`, and the `->` in `scripts/lib/mapText.ts`, are unreachable. The
authored direction never leaves the registry.
*Closes when:* `publishDiscovered` says which end of each road authored it, both
renderers draw a one-way road as one, and `unlinkedFrom` stages the removal at the
end that wrote it rather than at whichever end the author clicked first. Waits on
the ruling in `open-human.md` about what one-way should mean on the shipped map.

## A place placed relative to another does not move with it

`up of market-row` and the five others like it in `content/tulsa.dsl` already mean
"this follows that", and `recursivelyResolveRelativeCoordinates` erases the fact at
load, so the map cannot show it and a drag on the parent cannot carry the child.
`movedTo` refuses to drag such a place, which is right, but nothing says beforehand
which places are pinned to the one under the finger.
*Closes when:* the view publishes what each place is placed relative to, dragging a
place carries everything hanging off it, and the pinning is visible before the drag
rather than discovered by a refusal.

## Regions

Nothing declares one yet. `# region <id>` with `title:` and `holds:` naming member
locations, purely visual: a hull drawn round wherever the members happen to sit, one
collapsed bubble when the map is zoomed out far enough, and the drag group — moving
one member moves them all.
*Closes when:* `src/content/sections/region.ts` exists with its line in
`sections/index.ts`, the hull is computed in `src/runtime/map.ts` rather than in a
renderer, and dragging a member of a region moves the region.

## Dev mode cannot show a whole floor

The map draws what has been discovered. An author editing a map wants every place on
the floor they are looking at, found or not. `PlayStatus.locations` publishes only
`{id, title}`, so the coordinates of an undiscovered place never reach a surface.
*Closes when:* the sheet can be asked for every place on the floor, both `/map` and
the map pane show the undiscovered ones marked as such while dev is on, and nothing
publishes one list of places twice.

## Every map edit must be reachable without the GUI

Placing, linking and creating go through `/dsl`, so an agent can already do them —
but only by knowing the patch grammar, and `src/ui/mapEdit.ts` is where the grammar
is known. There is no command that says "put this place here".
*Closes when:* the map edits have commands of their own, refused off dev the way
`/goto` is, the patch-writing sits under `src/runtime/`, and the GUI's controls send
those lines rather than composing `/dsl` bodies for themselves.

## Everything in a room is unread until it is clicked, even for an author

`maskedHere` in `src/runtime/session.ts` holds back the name and the offers of
anything nobody has examined. That is the game, and it is in the author's way: dev
mode has no way to see a room as it really is. The fact that a session is an
author's lives in `SaveContext.dev`, above the runtime, so `maskedHere` cannot ask.
*Closes when:* the runtime can be told a session is an author's — a setting looks
like the cheapest shape, since it is saved, replayable and reachable from a `# test`
— and `maskedHere` reads it in the one place the masking rule already lives.

## An entry cannot travel as a patch

`patchedInto` places fields by where they are written; an entry — an action, an
event — goes home by the label it carries, and `fieldSites` says nothing about
labels. `foldedHome` in `scripts/consolidate.ts` therefore sends any staged section
holding an entry home whole, which is what every staged section did before patches
existed. Nothing regressed, but a partial edit that adds one action to a location
still overwrites the rest of it.
*Closes when:* entry sites carry their labels and `patchedInto` matches an entry home
by label, or the fallback is proved unnecessary because nothing stages one.
