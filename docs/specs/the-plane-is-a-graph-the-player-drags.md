# the-plane-is-a-graph-the-player-drags

## Deliverable

A grown item's plane stops being a list of rows under hexagon headings and becomes the graph it
already is: nodes joined by edges, dragged and pinched on the same sheet the map is dragged on, with
one panel above it that says what the tapped node is and offers the one thing that can be done to
it. The hexagon is the plane's coordinate system and stops being something a player reads. The
viewport the map already had — bounds, clamped pan, clamped zoom, wheel and pinch — is moved out from
under the map so both surfaces hold one implementation, and the recentring that move makes possible
is given to the map as a control, because a player lost among z-layers has no way back today.

Proof:

- [c1] The pan, zoom and clamp arithmetic exists once. `src/ui/viewport.ts` holds it, `discovery.ts`
  keeps only what is about places and roads, and no second clamp, wheel rate or zoom bound is
  written anywhere under `src/ui`.
  proof: vitest src/ui/viewport.test.ts
- [c2] One component holds the drag. The map and the plane are two children of `DragSheet`, and
  neither writes a pointer, wheel or touch handler of its own.
  proof: vitest src/ui/dragSheet.test.ts
- [c3] The graph a plane draws is derived from what the engine publishes and from nothing the shell
  knows about shapes. Every node's key, every edge between two nodes, and which hex edges a position
  sits on are read off `PlaneReport`; `src/ui/planeGraph.ts` imports no shape catalogue and no hex
  vocabulary beyond parsing a published key.
  proof: vitest src/ui/planeGraph.test.ts
- [c4] Every node of every cluster the report publishes is laid out, and no two nodes of one plane
  are laid out at the same point. The proof walks every shape the catalogue declares rather than a
  list of the ones someone remembered.
  proof: vitest src/ui/planeGraph.test.ts
- [c5] The player reads no hexagon. Nothing the plane modal draws contains a hex key, a direction id
  or the word for either.
  proof: vitest src/ui/planeModal.test.tsx
- [c6] A node is tappable wherever it is. The engine publishes a move to every cluster standing on
  the plane rather than only to the ones a step away, so one tap reaches any node the graph draws.
  proof: vitest src/runtime/planeScreen.test.ts
- [c7] The panel above the graph says what is selected and offers only what the engine published for
  it: a node's name, what it pays, whether it is allocated, and the allocate value where one exists.
  With nothing selected it states the item's own fold, which is `contributions` and not a sum this
  layer took.
  proof: vitest src/ui/planeModal.test.tsx
- [c8] An allocated slot with nothing beyond it offers the jewels the engine published `slot:` values
  for, and offers them in a panel of its own rather than in the plane's own list.
  proof: vitest src/ui/planeModal.test.tsx
- [c9] A cluster that has just arrived is drawn arriving: the nodes and edges the last view did not
  carry are played through the one channel, one after another, and the class they are drawn with is
  written in `transient.ts` like every other. The plane the modal opens on is not an arrival — it is
  already there — so what a player watches sprout is what a jewel just brought.
  proof: vitest src/ui/planeGraph.test.ts
- [c11] Nothing on the plane is drawn over anything else. What a node takes up and what the layout
  leaves for it are one figure, so the two cannot drift, and every pair of every shape the catalogue
  declares is checked rather than the ones someone measured.
  proof: vitest src/ui/planeGraph.test.ts
- [c12] The page itself does not zoom. The two surfaces that do hold their own pinch, and a browser
  scale over one of them is a scale nothing in the app can read or undo.
  proof: vitest src/ui/pageZoom.test.ts
- [c10] The map offers a control that puts the player's own place back in the middle of the window,
  on the floor they are standing on, at rest.
  proof: vitest src/ui/render.test.tsx

## Goal

A plane the player can read at a glance and reach with one thumb, on the viewport the map already
proved, so neither surface owns a second copy of it.

## Decisions

- **Extends** "the map and the character sheet": the viewport half of it becomes `src/ui/viewport.ts`
  and `src/ui/DragSheet.tsx` and is shared, rather than a second pan clamp being written for the
  plane. A second one is the failure this repository names most often.
- **Takes over** "the plane pane": `src/ui/PlanePane.tsx` drew the report as rows under hexagon
  headings and is replaced rather than kept beside the graph. Two surfaces drawing one report is two
  places to change when the report changes.
- **Extends** the plane report: node keys and the edges between them are published by
  `src/runtime/planeReport.ts`, read out of `neighbours()`, which is already the one authority on
  what touches what. The shell deriving adjacency from the shape catalogue would be a second
  implementation of that rule.
- **Adds** nothing to the growth verbs. Every act the modal performs is a value the plane screen
  already published; the one runtime change to that screen is which hexagons it offers a move to.

## Open questions

None.
