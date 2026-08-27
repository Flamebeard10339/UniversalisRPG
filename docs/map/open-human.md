# Map — open, for the author

## Does a region name its own entrances, or does the drawing work them out?

A collapsed region has to attach the roads that cross its edge to something. It can
be worked out — a road from outside lands on the blob, and which member it really
reaches is a fact the collapsed drawing is hiding on purpose — or a region can name
entrance points, which is what would let a module join another module's region
without knowing what is inside it. Shipping `holds:` only, and the roads attaching to
the blob.
*Closes when:* you say whether `entrances:` earns its place, or that a region names
only what it holds.

## What does the 3×3 grid put in the middle square?

Eight compass cells have obvious occupants. The middle has the place you are already
standing in — but up and down have no cell of their own either, and a guildhouse
with a cellar and an upstairs is the common case, not the odd one. Options: leave the
middle empty and list up/down beneath with the teleports; stack up and down in the
middle; or draw them as a separate pair beside the grid.
*Closes when:* you pick one, or say the middle stays empty and up/down go in the
overflow list with everything else that has no bearing.

## How wide should the map be, now that it can be tuned?

`# variable map-grid` is 140, up from the 104 that was hard-coded. That is a guess at
"a little more space", made without seeing it on a phone.
*Closes when:* you have looked at Tulsa at 140 on both a desktop pane and a phone and
said a number.

## Does the corpus want regions at all yet, or only the castle?

The obvious candidates in `content/tulsa.dsl` are the castle (gate, yard, hall,
kitchen, quarters, solar, cellar) and Oolga's house. Whether the guildhouse and the
smaller houses want to be regions too is a judgement about how the map should read
rather than about what the engine can do.
*Closes when:* you name which groups of places are regions in the shipped world.

## The one-way road drawing has never been seen, because it cannot happen

Roads close both ways at load, so the dashed-and-arrowed drawing in `MapPane.tsx` has
never been reachable. Making the authored direction visible would turn it on for
every road only one end writes — which is most of them in Tulsa. That would change
how the shipped map reads overnight.
*Closes when:* you say whether a road written from one end only should read as
one-way on the map, or whether one-way should mean something narrower — a road that
genuinely cannot be walked back.
