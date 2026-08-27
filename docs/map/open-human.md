# Map — open, for the author

## `content/local-changes.dsl` is committed, and two tests say so

`ba6b2990` put the REPL's own working file into the repo. It holds nothing but its
`# info` header, and `probe.test.ts` and `playbot.test.ts` both fail on it, because
the shipped corpus is not supposed to have a local-changes module in it. Nothing in
this branch's work touches those two; they were red before it started. It is a git
index change, which a worker in this checkout does not make.
*Closes when:* you run

```bash
git rm --cached content/local-changes.dsl && printf '\ncontent/local-changes.dsl\n' >> .gitignore
```

## Blob or box?

`# setting regions` takes `blob` — a shape that follows the rooms — or `box`, one
rectangle round the lot, and the settings page offers both. Either one now covers the
whole square each room stands in rather than stopping at the middles, so a room is
never half outside its own wall.
*Closes when:* you have looked at the castle both ways and said which the world ships
at, and the other is either kept as a setting or taken out.

## Does a region name its own entrances, or does the drawing work them out?

The drawing works them out, and nothing is authored: a room of a region is on the map
when a road from where you stand reaches it, so standing in the market square the
castle is its shape with the gate inside it, and every road in lands on a room that is
there to land on. The question that is left is the one about other people's modules: a
region naming entrance points is what would let one module join another module's
region without knowing what is inside it. Shipping `holds:` only.
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
"a little more space", made without seeing it on a phone.
*Closes when:* you have looked at Tulsa at 140 on both a desktop pane and a phone and
said a number.

## Which groups of places are regions?

Tulsa's castle and Oolga's house are in. The guildhouse in `first-steps`, the sewer,
the tunnels, and the two lanes of houses are all candidates, and whether they want to
be one thing on the map is a judgement about how the map should read. `region` mode on
the map pane is now how one is made and added to, so this is an afternoon rather than
a session of hand-writing `holds:`.
*Closes when:* you name which groups of places are regions in the shipped world.

## The one-way road drawing has been seen, and it was lying

`Road.mutual` was derived from whether the far end listed this one, which said
discovery and not direction — so on the author's map most roads drew dashed with an
arrow on them, and none of those roads is one-way. That derivation is gone and every
road reads as walked both ways, which is what they all are. Turning one-way back on
means publishing the end that *wrote* each road, and that would light it up for every
road only one end writes — which is most of them in Tulsa. It is also what would let
`/unlink` take a road away at the end that wrote it.
*Closes when:* you say whether a road written from one end only should read as
one-way on the map, or whether one-way should mean something narrower — a road that
genuinely cannot be walked back.

## The playbot still cannot author, and it may be that you meant it should

`/place`, `/link`, `/unlink` and now `/region` are `audience: 'author'`, like `/dsl` —
so the REPL, the app's command line, and anything driving `runLine` can use them, and
an agent driving the app through `window.__test` can too. `scripts/playbot.ts` refuses
every non-player command outright, because the model there is told it is the player
and not the author. That is deliberate and it predates this work.
*Closes when:* you say whether the playbot's `author` mode should be handed the
authoring vocabulary as well, or whether an agent that means to edit the map should be
driving the app rather than playing it.
