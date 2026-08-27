# Map — open, for the author

## Does a region name its own entrances, or does the drawing work them out?

A folded region attaches the roads that cross its edge to one of its own rooms — the
one a road out of here reaches, or the first of them — so tapping the castle walks to
the castle gate. That is worked out. The alternative is a region naming entrance
points, which is what would let a module join another module's region without knowing
what is inside it. Shipping `holds:` only.
*Closes when:* you say whether `entrances:` earns its place, or that a region names
only what it holds.

## Up and down have no square, and the middle holds the room you are in

Shipped that way: the middle square of the 3×3 names where you are standing, and a
floor up or down falls back to an ordinary cell above the grid with everything else
that no heading points at. A guildhouse with a cellar and an upstairs is the common
case rather than the odd one, so this may be the wrong half of the trade.
*Closes when:* you have used it and said whether up and down want the middle square,
a pair of their own beside the grid, or to stay where they are.

## How wide should the map be, now that it can be tuned?

`# variable map-grid` is 140, up from the 104 that was hard-coded. That is a guess at
"a little more space", made without seeing it on a phone. `FOLDED_BELOW` in
`src/ui/viewport.ts` is 0.7 — the zoom at which a region stops being a shape round its
rooms and becomes one thing — and is the same kind of guess.
*Closes when:* you have looked at Tulsa at 140 on both a desktop pane and a phone and
said a number for each.

## Which groups of places are regions?

Tulsa's castle and Oolga's house are in. The guildhouse in `first-steps`, the sewer,
the tunnels, and the two lanes of houses are all candidates, and whether they want to
be one thing on the map is a judgement about how the map should read.
*Closes when:* you name which groups of places are regions in the shipped world.

## The one-way road drawing has never been seen, because it cannot happen

Roads close both ways at load, so the dashed-and-arrowed drawing in `MapPane.tsx` has
never been reachable. Making the authored direction visible would turn it on for
every road only one end writes — which is most of them in Tulsa. That would change
how the shipped map reads overnight, and it is also what would let `/unlink` take a
road away at the end that wrote it.
*Closes when:* you say whether a road written from one end only should read as
one-way on the map, or whether one-way should mean something narrower — a road that
genuinely cannot be walked back.

## The playbot still cannot author, and it may be that you meant it should

`/place`, `/link` and `/unlink` are `audience: 'author'`, like `/dsl` — so the REPL,
the app's command line, and anything driving `runLine` can use them, and an agent
driving the app through `window.__test` can too. `scripts/playbot.ts` refuses every
non-player command outright, because the model there is told it is the player and not
the author. That is deliberate and it predates this work.
*Closes when:* you say whether the playbot's `author` mode should be handed the
authoring vocabulary as well, or whether an agent that means to edit the map should be
driving the app rather than playing it.
