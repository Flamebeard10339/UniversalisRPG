# Map — open, for a lane

## One map, drawn by every surface

The map's model lives in `src/ui/discovery.ts` — which places are drawn, on which
floor, joined by which roads. `/map` in `src/runtime/command.ts` is a second
authority that lists exits and knows nothing about any of that, and
`formatMap` in `scripts/lib/replLines.ts` is a third that dumps coordinates under
`/state`. Three readings of one thing.
*Closes when:* the model is built once under `src/runtime/`, `/map` emits it as a
structured `CommandOutput` kind of its own (the way `status` and `choices` already
do), `replLines.ts` draws it as text and `MapPane` draws it as bubbles, and neither
renderer works anything out about the map for itself.

## A floor you cannot see is offered anyway

`sheetAt` lists every `z` any discovered place sits on as a floor you may switch to,
so standing in the market square offers the castle cellar. The rule wanted is: the
floor you are on, plus any floor a road from where you stand actually reaches.
*Closes when:* the floors a sheet offers are the ones reachable from `here`, proved
against a corpus place with a basement nobody can get to from where the test stands.

## The map cannot tell a one-way road from a two-way one

`Road`'s `mutual` is computed in `sheetAt` by asking whether the far end lists this
one — but `effectiveAdjacent` closes every road both ways before the view is
published, so `mutual` is always true and the dashed line and arrowhead in
`MapPane.tsx` are unreachable. The authored direction never leaves the registry.
*Closes when:* `publishDiscovered` says which end of each road authored it, the map
draws a one-way road as one, and `unlinkedFrom` stages the removal at the end that
wrote it rather than at whichever end the author happened to click first.

## A place placed relative to another does not move with it

`up of market-row` and the five others like it in `content/tulsa.dsl` already mean
"this follows that", and `recursivelyResolveRelativeCoordinates` erases the fact at
load, so the map cannot show it and a drag on the parent cannot carry the child.
`movedTo` refuses to drag such a place at all, which is right, but says nothing
about which places are pinned to the one being dragged.
*Closes when:* the view publishes what each place is placed relative to, dragging a
place carries everything hanging off it, and the pinning is visible before the drag
rather than discovered by a refusal.

## Regions

Nothing declares one yet. `# region <id>` with `title:` and `holds:` naming member
locations, purely visual: a hull drawn round wherever the members happen to sit, one
collapsed bubble when the map is zoomed out far enough, and the drag group — moving
one member moves them all.
*Closes when:* `src/content/sections/region.ts` exists with its line in
`sections/index.ts`, the hull is computed in the runtime map model rather than in the
renderer, and dragging a member of a region moves the region.

## Travel offers are not spatial

Every `legs: 1` travel choice has a bearing derivable from the two places'
coordinates; nothing derives it. The 3×3 grid wanted is NW/N/NE, W/·/E, SW/S/SE with
the first matching choice per cell, and everything left over — up, down, anything
without coordinates — listed beneath.
*Closes when:* the bearing is derived in the runtime map model from
`DIRECTION_VECTORS` in `src/content/sections/location.ts` rather than from a fresh
statement of which way north is, `Home.tsx` draws the grid, and `/map` prints the
same nine cells in text.

## Dev mode cannot show a whole floor

The map draws what has been discovered. An author editing a map wants every place on
the floor they are looking at, found or not.
*Closes when:* dev mode draws the undiscovered places on the current floor, marked
as such, and the same set is what `/map` prints while dev is on.

## Every map edit must be reachable without the GUI

Placing, linking and creating go through `/dsl`, so an agent can already do them —
but only by knowing the patch grammar. There is no command that says "put this place
here".
*Closes when:* the map edits have commands of their own, refused off dev the way
`/goto` is, and the GUI's controls send those lines rather than composing `/dsl`
bodies in `mapEdit.ts`.

## An entry cannot travel as a patch

`patchedInto` places fields by where they are written; an entry — an action, an
event — goes home by the label it carries, and `fieldSites` says nothing about
labels. `foldedHome` in `scripts/consolidate.ts` therefore sends any staged section
holding an entry home whole, which is what every staged section did before patches
existed. Nothing regressed, but a partial edit that adds one action to a location
still overwrites the rest of it.
*Closes when:* entry sites carry their labels and `patchedInto` matches an entry home
by label, or the fallback is proved unnecessary because nothing stages one.
