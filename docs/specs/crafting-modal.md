# crafting-modal

Written 2026-08-12, after the author tried to play `items-mods-and-crafting` through the REPL and
could not. That branch made growing an item reachable and correct; it did not make it legible.
Every other play input in this game is a numbered choice, and growth alone requires typing
`allocate: 1 at 0,0 position 1` from memory — three concepts (which copy, which hexagon, which node)
held at once, none of them visible until you already know them. This branch is the surface, and
nothing else: it adds no rule, no refusal and no arithmetic, because those all exist and are tested.

## Deliverable

Carrying, growing and wearing an item are reached the way everything else in this game is reached.
`/inv` opens a modal over what the player carries; an item there offers only the verbs that apply to
it; opening one's plane replaces that screen with a plane screen that holds which copy and which
hexagon are in hand, so a command names only what is left; closing it returns to the inventory with
that item's stats summarised. The directive grammar underneath is untouched and stays total.

Proof:

- [c1] `/inv` opens a modal rather than printing a block, and prints nothing beside it — `/state` is
  where what the player carries is still read as text. It lists stacks by title and count and each
  grown copy under its own name, and each entry offers only verbs that apply to it — a plane screen
  for an item that can carry one, equip for an item with a slot, destroy for anything. `/inv <item>`
  opens the same screen with that item already selected; that argument is the one route the GUI's
  inventory rows take, so a row is a dispatch of the shared command and never a second frame.
- [c2] The screens are `ModalFrame` members of the closed union in `src/runtime/modals.ts`, opened,
  answered and closed by the machinery `first-class-modals` already ships. Adding one is an engine
  change by that branch's own design; nothing here makes a modal authorable in content.
- [c3] Opening an item's plane replaces the inventory frame rather than stacking a second one, and
  closing it returns to an inventory frame with that item still selected — `submit` returning another
  `ModalFrame` is the substrate's own mechanism for this and no second one is built.
- [c4] **The modal prefills; it never narrows.** Every growth directive stays spellable in full from
  anywhere the directive surface is reachable, and the modal-shortened form is the same directive
  with its leading arguments defaulted from the frame — one parser, one directive kind, not two. A
  frame that one day holds more than one hexagon, or more than one item, or a whole tree at once,
  must not require a grammar change to say so. This is the clause to break first when the
  implementation gets inconvenient, so it is the one to test hardest.
- [c5] Moving between hexagons is answering an option: the frame's focused hexagon changes and no
  game state does. Navigating is not a move, costs nothing, and is not recorded.
- [c6] Slotting from the plane screen names a jewel the player carries and a slot in the focused
  hexagon; allocating names a position or a slot in it. Both route to the runtime functions
  `items-mods-and-crafting` already ships and add no rule of their own.
- [c7] A refusal reaches the player where they are: the screen states it and stays open, and the
  refused verb costs nothing. A refusal that closes the screen, or that is only discoverable in the
  log beneath it, does not satisfy this.
- [c8] An item's contribution is summarised per stat by one pure function below the surface and
  published, so every screen states the same numbers rather than folding them itself. Two surfaces
  that each summarise are two surfaces that will disagree, and the repository's rule is to enforce
  where a value is assembled.
- [c9] **No modal id is a literal in `src/ui`, and a screen the driver has never heard of renders
  and is answerable.** This is `gui-rebuild`'s clause 4, already delivered, and this branch is the
  first real test of it — a plane is not a list of options, so the naive rendering is a special case
  in the driver keyed by the modal's name, which that clause forbids. The mechanism is c10's.
- [c10] What a plane screen shows beyond its options is published as ordinary `PlayStatus` data with
  a focus, not as a payload only one screen understands: the driver renders the focused plane because
  a focus is published, never because it recognised a screen. `PlayStatus.planes` already exists and
  is what the focus points into.
- [c11] The REPL and the GUI drive one command table and cannot differ in what a player may do, per
  `gui-rebuild`'s standing requirement. One scripted sequence through both reaches byte-identical
  state.
- [c12] **Destroying an item removes it from what the player carries, and destroying is not
  dropping.** Destroying a grown copy is the destructive case: it asks a second question naming what
  is lost before it happens, because the plane it carries cannot be rebuilt and no other verb in this
  game destroys that much. A stack copy goes without one. Nothing here puts an item down anywhere:
  placing one in a location is `item-drop-places-the-item-in-the-location` and is out of scope, so
  this screen's verb is spelled `destroy` and the word `drop` is left unspent for the feature that
  means it.
- [c13] A `# test` records the whole route — open the inventory, open a plane, navigate, slot,
  allocate, close, equip — and replays green over shipped content, so the surface is a regression
  and not a screenshot.
- [c14] `npm run tasks -- merge-ready` passes before the spec is marked done.
- [c15] **Every screen this branch adds carries its own way out.** A modal closes only when every
  option it publishes has an answer, so a frame whose every value is a commitment is a frame that
  withdraws the world until the player commits to one of them. Each screen this branch adds publishes
  a value that leaves it — one that closes the inventory, one that returns from a plane — and
  answering it moves no game state and is not recorded as a move. Added 2026-08-13, after the survey
  found that `first-class-modals` gives a frame no cancel and that `/inv` therefore turns an
  at-a-glance read into a screen the player can be stranded on.

## Goal

Make growing an item something the author can judge by playing it, without teaching them a grammar.

## Decisions

- **The grammar is prefilled, never replaced.** Ruled by the author 2026-08-12. The tempting design
  is a modal-only short form — `allocate 1` as its own thing — and it is wrong twice over: it makes
  two spellings of one action that can drift, and it bakes in the assumption that a screen shows
  exactly one hexagon of exactly one item. A screen that later shows a whole tree would have to break
  its own grammar to address a second hexagon. So the frame supplies defaults for arguments the
  directive already has, and the directive is unchanged. c4 is that decision as a proof clause.
- **The load-bearing uncertainty is c9, and it was found by the survey rather than by building.**
  `gui-rebuild` clause 4 promises that no modal id appears as a literal in `src/ui` and that a modal
  the driver has never heard of still renders. Every modal so far has been a list of options, which
  that promise is easy to keep for. A plane is not a list of options, and the obvious implementation —
  "if the modal is called `crafting`, also draw the plane" — breaks it on the first line. c10 is the
  way out: publish a focus into the `PlayStatus.planes` that `cluster-plane-view` already publishes,
  so the driver renders a focused plane whenever one is focused and never inspects a screen's name.
  If that turns out not to hold, the finding belongs to `gui-rebuild`'s clause and not to this branch,
  and it is worth more than the feature.
- **`craft` is not the word.** `craft:` already means "run a `# recipe`" — a directive kind and a
  choice kind — and spending it a second time is precisely the collision `items-mods-and-crafting`
  spent a paragraph avoiding when it refused to call a cluster effect a "mod". The branch keeps the
  name `crafting-modal` because that is what the author called it and a slug is not a vocabulary; the
  in-game verb that opens a plane is the worker's to choose and must not be `craft`.
- **This branch adds no rule.** Every refusal, every point cost, every adjacency check and the whole
  effect fold exist and are mutation-proved in `items-mods-and-crafting`. A rule appearing in a screen
  is the report that the seam was cut wrong, and the fix is to move it down rather than to test it
  twice.
- **Destroy is in scope; drop is a different feature and is not.** Ruled by the author 2026-08-13,
  correcting this spec's own first draft, which called the verb "drop". Drop means putting an item
  down where you are standing, and nothing in this game has items on the ground; that is
  `item-drop-places-the-item-in-the-location`, filed the same day and not worked here. What an
  inventory screen needs is the destructive verb, so the verb is `destroy` and c12 says so. Spending
  the word `drop` on it would have been the same collision `items-mods-and-crafting` refused when it
  would not call a cluster effect a "mod".
- **An option carries values, so the answer is a number.** Ruled by the author 2026-08-13 over a
  typed-verb surface. `first-class-modals` already publishes listed values, the REPL already answers
  them by index and `ModalSheet` already draws one button each, so the screens cost no new input path
  on either driver — which is the whole of what makes this branch the surface and nothing else. It
  also keeps `command.ts`'s standing rule that no line is ever consumed as a field it was not typed
  as: a mistyped item name stays an error rather than becoming an answer.
- **A listed value is a directive tail, not a word a second parser understands.** The frame composes
  the value it published onto the arguments it holds — the instance and the focused hexagon — and
  hands the completed line to the one directive parser in `src/content/test.ts`. That is what makes
  c4 structural rather than a promise: there is no place a second reading of "position 4" could live.
- **The plane screen is not a tab, on either driver.** The GUI's Character layer keeps its inventory
  subpage as the at-a-glance ledger it is, and a row there dispatches the shared `/inv <item>`
  command — ruled by the author 2026-08-13. So the tab is the doorway and the modal is the surface,
  the command table stays the one place a capability lives, and neither driver grows a screen the
  other has not got. A tab that opened the modal on navigation was refused: navigating would move
  game state, and the modal covers the tab it was opened from anyway.
- **It waits for `items-mods-and-crafting` to merge rather than growing it.** That branch is complete
  and green against its own clauses; holding it open until a surface exists would make one diff carry
  two specs and keep the audit target moving, which is the split `gui-rebuild` was already divided
  along for the same reason.

## Out of scope

Showing more than one item's plane at once, or a whole tree across hexagons — c4 exists so that
becomes content of the screen rather than a grammar change, and it is not built here. Any change to
what growing an item costs, refuses or grants. A jewel arriving with an effect already on it,
selection by tag, and the archetype fixtures, all of which belong to `archetype-mods`. Rendering the
plane as geometry rather than as text; a hexagon is addressed by its coordinates on both surfaces
until someone draws one. Putting an item down in a location and picking it back up, which is
`item-drop-places-the-item-in-the-location` and needs a place for items to lie that this game has
not got.

## Open questions

- The in-game verb that opens a plane screen, subject only to it not being `craft`.
- Whether a growth refusal is stated by the frame that comes back or by the log beneath it. c7 fixes
  that the player reads it without leaving the screen and that the verb costs nothing; `grow()`
  already returns the sentence and already pushes it into the log, so the worker chooses between
  reusing that and giving the frame a line of its own.
- Where the growth dispatch lives once two callers need it. `performDirective` holds the only copy
  today and a frame's `submit` is the second caller; whether that becomes a module below both or an
  export from `session.ts` is the worker's, subject to `modals.ts` not importing `session.ts`.
- Whether opening the inventory during a live action is allowed to withdraw the world's choices the
  way every other modal does, or whether the screen refuses to open while an action runs. The
  substrate makes the first free and the second a rule, and this branch is not supposed to add rules.
