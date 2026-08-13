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
- [c16] **One function names a carried thing, and every surface spells it that way.** A screen never
  composes a name of its own: the inventory row, the equipment row, the plane screen's heading, the
  option that names a jewel or a whetstone, the world's own `Unequip` choice and the GUI's rows all
  read the same answer. A stack reads its title; a grown copy reads `Modified Iron Sword` — the
  descriptor is what says it is grown, and it carries no id, because the stat summary beneath it is
  what tells two apart. Ruled by the author 2026-08-13, who added that custom handles are a later
  question and not this one. Where a name is an *answer* rather than a label — a listed option value,
  which must be distinct to be answerable — disambiguating two identical names is a mechanism the
  screen already has and is not a second name. This is c8's rule about an assembled value applied to
  the name instead of the number, and it is the seam localization needs: a name reached through one
  function is a name `reimplement-localization` can route, and a name each screen builds is not.
- [c17] **A row states what a choice does, not the line that would do it.** The plane screen prints
  no directive text beside the option that abbreviates it — typing the number achieves the same
  result, so the spelled-out form is noise on the screen that exists to retire it. The full directive
  stays spellable everywhere it already is, which is c4 and is unchanged; c17 is only about what a
  screen prints. Added 2026-08-13, ruled by the author.

- [c18] **A row says what its columns promise.** A page listing what the player carries states a
  count where it shows a count, and a grown copy is legible on the page it is listed on: its name,
  and beneath it the per-stat contribution `itemContribution` already publishes. An entry offers only
  verbs that apply to it, which c1 already requires and which an item already worn disproves — worn
  offers `Unequip`, not an `Equip` that does nothing. Added 2026-08-13 after the author played the
  GUI and found the equipment page reading `mainhand 1`, the inventory reading `1` with the template
  id where the quantity goes, and `Equip` offered on an item already equipped. One cause: both pages
  draw an engine dictionary through a generic key-and-value ledger, so the key became the name and
  the value became the column. The runtime publishes everything the rows need.
- [c19] **A modal is dismissed the way its driver dismisses things.** c15 gives every screen this
  branch adds a published value that leaves it; on the GUI, clicking away from the sheet answers
  that value, so the way out is reachable without hunting for a button. It answers the same value the
  REPL answers, so c11 holds and no driver gains a way to leave a screen the other has not got — and
  a frame that publishes no such value, dialogue among them, is not dismissable this way, because
  there is nothing for the click to answer. Added 2026-08-13, ruled by the author.
- [c20] ~~**A row acts in one click.**~~ **Withdrawn 2026-08-13 by the author, unmet and not
  deferred to a later member of this spec.** The implementation drew the question under the row that
  opened it, which left the row still needing a press to find out what it offered — orthogonal to the
  goal — and bought a modal that is sometimes a sheet and sometimes not, which is a special case in
  the driver of exactly the kind c9 exists to forbid. The clause is struck rather than reworded
  because the author judged the problem non-trivial under the screen's space constraints: making
  every action an item offers visible without opening anything is filed as its own work, requiring
  thought rather than another attempt. What replaces it here is nothing — pressing a row opens a
  screen, as it did before, and the branch closes without claiming otherwise.

- [c21] **What the player carries and what they are wearing are disjoint.** Equipping takes the item
  out of the inventory and puts it in the equipment; unequipping returns it. A stack of three, one
  worn, reads two carried and one equipped, and unequipping reads three again. A grown copy worn is
  listed under equipment and nowhere else. Added 2026-08-13, ruled by the author, and it is the one
  rule this branch adds — the spec's standing decision that it adds none is overridden here
  deliberately and only here. Two places already read the invariant it replaces and both are this
  clause's to correct. `destroyItem` sweeps every slot and empties any whose worn id is no longer
  carried; under this rule every worn item is not-carried by definition, so the first destroy would
  strip every slot. It is replaced rather than repaired, by a removal naming the destroyed id — the
  author's reading 2026-08-13, that the helper's own comment mistook one rule for two, and that the
  targeted form being untouched by c21 is the evidence the generality was never carrying anything.
  `wearInstead` repoints a slot when a stack copy is grown and assumes carried-and-worn coexist.
  This clause first claimed a third reader was unaffected — that what an equipped item contributes is
  read off `state.equipped` — and it was wrong: the fold then guarded each worn id on "does the
  player carry this", which c21 makes false for everything worn, so an equipped item would have
  contributed nothing. Corrected 2026-08-13 by the member that worked it, and left standing here as
  written rather than quietly repaired, because the reason it was wrong is the clause's real content:
  "carried" was one word doing two jobs. What an inventory row states and what a gate asks are
  different questions — a stack of three with one worn is two on the row, and three to a
  `requires: has` — and c21 is met only where both are answered separately.

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

- **A name is assembled once, like a number is.** Ruled by the author 2026-08-13, playing the REPL
  this branch had just built. Three screens named one item three ways — `Whetstone x6`, then
  `feed: with tutorial-island.whetstone`, then a heading reading `Heartwood Blade — 1`. None is a
  defect in any member: each screen was written to name what it holds, and naming is what none of
  them was told to share. That is the same shape c8 already ruled on for the contribution fold, and
  the ruling is the same — one function, read by every surface. c16 is that as a proof clause. The
  raw id in an option label is additionally a localization question, and is filed as a finding
  against `reimplement-localization` rather than answered here: this branch owes the seam, that spec
  owes what passes through it.
- **The screen does not teach the grammar.** Ruled by the author 2026-08-13. A plane row printed the
  full directive beside the option that shortens it, which reads as proof that c4 holds. It is not
  worth its space: typing the number does the same thing, and the branch exists precisely so the
  author never reads that line. c17 says so, and c4 is untouched — the directive stays spellable, it
  just stops being printed.

- **A grown copy is named, not numbered.** Ruled by the author 2026-08-13, correcting this spec's own
  c16 as first written. The name is `Modified Iron Sword`: the descriptor carries the fact that it is
  grown and the stat summary beneath carries which one it is, so the id stays out of the name
  entirely. Custom handles were considered and deferred in the same breath — "that day is not today".
  The id remains what a *directive* spells, which is unchanged and is c4's business, and remains
  available to a listed option value that would otherwise be ambiguous, which is answerability rather
  than naming.
- **The geometry pane is a different branch; one-click rows are this one.** Ruled by the author
  2026-08-13. Drawing the plane as a clickable map, with a node opening what it grants and what may
  be slotted into it, is what this spec's Out of scope already refused, and it is filed as its own
  work to be planned against the focus and `planes` data this branch publishes. Reshaping the
  inventory page so a row acts in one press is not that: it is the surface this branch promised, and
  the modal verb step is this branch's own design falling short of its own goal. c20 is that
  correction and it stays here, because letting it wait would leave the branch closing on a screen
  the author has already said is one press too long.

- **The branch adds exactly one rule, and it is named.** Ruled by the author 2026-08-13, overriding
  this spec's own "This branch adds no rule" for c21 and nothing else. That decision exists so a rule
  appearing inside a screen is read as the seam being cut wrong; an author ruling that the inventory
  and the equipment are disjoint is not that — it is a statement about the model, it lands in
  `equipment.ts` below every screen, and both surfaces get it for free. The decision stands for
  everything else on this branch.
- **Growing what you wear stays one press away.** Consequence of c21 and not a separate ruling: today
  an equipped item is still carried, so `/inv` reaches it and it can be grown while worn. Once it
  leaves the inventory it is reachable only from the equipment, so the equipment's rows offer the
  same verbs a carried row does. The alternative — unequip, grow, re-equip — makes the item a player
  most wants to improve the one the branch's own goal line cannot reach. Recorded as the default the
  worker implements; the author may overturn it, and the cost of doing so is one clause.

- **c20 is withdrawn, not deferred.** Ruled by the author 2026-08-13 after playing the
  implementation. Two independent reasons, either sufficient: it did not reach the goal — a row still
  had to be pressed to learn what it offered, and drawing the answer lower is orthogonal to that —
  and it made a modal that is a sheet on one page and an inline block on another, which is a driver
  holding a special case about screens and is the thing c9 forbids in a different costume. The
  capability is real and is filed as its own work; what is refused is reaching it this way. A clause
  a branch cannot meet is struck by the author or it is owed, and this one is struck.

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

- ~~The in-game verb that opens a plane screen~~ — answered by `plane-frame`: it is `Grow`.
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

## Audit passes

### Pass 1 — 2026-08-13

- base: `3b355399a84e75c561de667023c340e601fcc1c3`
- head: `5d71b798b4445a8961e92e9fd4fb0e1878342942`
- proof 1: unmet — `/inv` opens a modal and prints no block: the `inventory` CommandOutput kind is gone
 from src/runtime/command.ts and src/ui/transcript.ts, `/state` still prints Inventory/Grown/
 Equipped (scripts/play-cli.ts formatInventory, reached from formatState), and the listing itself
 is proved by src/runtime/carriedScreen.test.ts > what the screen lists > "lists stacks by title
 and count, and each grown copy under its own name". What fails is the second half. CarriedEntry.id
 is the item template for BOTH the carried stack row and the worn stack row (carriedScreen.ts
 carriedEntries, and src/runtime/carriedScreen.test.ts:110 pins exactly that pair of rows with
 id 'iron-sword' twice as correct), and `openInventory` in src/runtime/command.ts:250 resolves the
 argument with `.find((each) => each.id === id)`. With iron-sword x3 and one equipped, the
 equipment row hands `/inv iron-sword` the id the carried stack row also answers to, so the screen
 opens on `Iron Sword x2` and offers `['Grow','Equip','Destroy','Close']` — the wrong entry, and
 an `Equip` on the copy already worn. Re-run: `npm run inspect -- -` with a module declaring
 iron-sword (slot: mainhand), inventory 3, `equip(state, registry, 'iron-sword')`, then
 `carriedEntries(...).find((e) => e.id === worn(equipment, rows)[0].id)`. The route is only
 reachable when a stack copy is worn with copies still in the stack, which no test and no
 `# test` walks.
- proof 2: met — `carried-items` and `item-plane` are members of the ModalFrame union in
 src/runtime/modals.ts and are declared in DEFINITIONS beside character-creation and dialogue;
 both are opened, answered and closed by openModal/answerModal/pruneModals with no second
 machinery. Nothing makes a modal authorable: `open-modal:` resolves no section (see the
 referenceSites.ts arm) and openModalNamed throws `unknown modal` off DEFINITIONS. Proved by
 src/runtime/modals.test.ts > "the plane screen, as a frame like any other" and by the mutation
 c15-no-screen-publishes-a-way-out (KILLED at src/runtime/modals.test.ts, src/ui/asking.test.ts),
 which shows the publish path is the shared one.
- proof 3: met — src/runtime/modals.test.ts:519 > "replaces the inventory frame, and returns one with
 that copy still selected". Structurally: answerModal pops the frame before calling submit, and
 carriedScreen's Grow verb returns `planeFrame(entry.id)` while planeSubmit returns
 `inventory(frame.target, ...)` = `carriedFrame({ item: entry.value })`. No second mechanism
 exists. src/runtime/carriedScreen.test.ts > "opens the plane of the copy in the slot, and puts
 what growing it minted back on" exercises the same return.
- proof 4: met — One parser, one kind: planeScreen.ts composes a whole growth line and hands it to
 growth.ts `growLine`, which calls `parseDirectiveLine` — the same function every `# test` line
 goes through — and refuses anything that is not a GrowthDirective. Nothing in src/runtime reads
 a shortened form. Proved by src/runtime/planeScreen.test.ts > the modal prefills and never
 narrows > "reaches byte-identical state from the screen and from the directives typed in full"
 and "publishes each growth as the directive it becomes, less what the frame holds". Mutation
 c4-a-growth-line-is-filled-from-a-hexagon-the-frame-does-not-hold (line composed with a literal
 `0,0` instead of `frame.hex`) KILLED at src/runtime/planeScreen.test.ts and scripts/drift.test.ts.
 Manifest: C:\Users\yonat\AppData\Local\Temp\audit-crafting-modal-pass1-mutations.json. Noted for
 the next pass, not counted against the clause: the published value now carries the jewel's
 *name* and the composed line its *id* (planeScreen.ts Tail said/spelled), so the value-to-line
 map is a lookup rather than a prefix — still one parser and one directive kind, but the
 "no place a second reading could live" argument in Decisions is now a said/spelled pair.
- proof 5: met — `goes()` in planeScreen.ts returns `line: null`, and planeSubmit returns
 `planeFrame(frame.target, move.focus)` without touching state. Proved by
 src/runtime/planeScreen.test.ts > what the screen does with an answer > "changes the focused
 hexagon and no game state at all". Mutation c5-navigating-does-not-move-the-focus (focus pinned
 to `frame.hex`) KILLED by that test plus "reaches byte-identical state from the screen and from
 the directives typed in full".
- proof 6: met — planeScreen.ts publishes slot/allocate values only; each becomes a line that
 growth.ts's `grow` dispatches to `slotJewel` / `allocate` in itemInstance.ts. growth.ts holds a
 four-arm switch and no check of its own — the module comment says so and the file is 30 lines.
 The screen's `movesOn` filters on published standings (`slot.standing === 'allocated' &&
 slot.beyond === null` to offer a jewel, `'available'` to offer a point), which is an offer
 filter rather than a rule: the runtime still refuses, and c7's refusal path is what shows it.
 src/runtime/planeScreen.test.ts covers both verbs end to end.
- proof 7: met — planeSubmit returns `planeFrame(frame.target, frame.hex, growth.refused)` on a
 refusal, and `heading()` appends it to the option's label, so the screen restates it and stays
 on the same hexagon. Nothing is spent: growItem in itemInstance.ts calls `take(state, consumes)`
 only after `growing.change` returned no problem. Proved by src/runtime/planeScreen.test.ts >
 what the screen does with an answer > "states what the plane said, leaves the screen where it
 was, and moves nothing". Mutation c7-a-refusal-does-not-reach-the-screen (drop the `said`
 argument) KILLED by that test.
- proof 8: met — src/runtime/itemContribution.ts is the one fold; stats.ts `statRange` now calls it
 through `foldContribution` instead of its own foldStatBonuses/foldPlanePayloads pair, and
 planeReport.ts publishes `contributions` off the same call, which src/ui/sheet.ts reads without
 arithmetic of its own. Proved by src/runtime/itemContribution.test.ts > "the stat fold spends
 what this fold assembled" > "moves a worn stat by exactly the contribution published for it".
 Mutation c8-a-worn-grown-copy-contributes-its-base-plane (drop the instance argument) KILLED by
 that test.
- proof 9: met — src/ui/surface.test.ts > "names no modal, so it cannot be rendering one it knows"
 sweeps every non-test module under src/ui for `'<name>'` over MODAL_NAMES, and MODAL_NAMES is
 `Object.keys(DEFINITIONS)` in modals.ts, so the two names this branch adds were covered on the
 day they existed. The screen with a subject renders through the same path: ModalSheet draws the
 option it is handed and PlanePane is passed a PlaneView built by src/ui/plane.ts from
 `view.focus` and `view.planes` alone. src/ui/plane.test.ts > the route a row opens > "draws the
 plane a screen opened from an inventory row has in hand".
- proof 10: met — `PlaneFocus` is a PlayStatus field published by `modalFocus(state)`, which asks the
 top frame's optional `focus()` and nothing else; `PlayStatus.planes` gained the stack bases so a
 focus can never point at a plane no driver can find (planeReport.ts planeReports). Both drivers
 look the id up: scripts/play-cli.ts `formatFocus` and src/ui/plane.ts `focusedPlane`. Proved by
 src/runtime/modals.test.ts > "publishes which plane is in hand as a focus into the planes the
 view already publishes". Mutation c10-no-focus-is-published (modalFocus returns null) KILLED by
 that test and by src/ui/plane.test.ts > "draws the plane a screen opened from an inventory row
 has in hand".
- proof 11: met — scripts/drift.test.ts > the two drivers cannot drift > "walks the crafting route
 through both drivers, gesture against typed line" — twelve answers plus the `/inv <item>` row
 dispatch, each line held to identical transcript output and identical serialized bytes by
 `inStep`, ending on a plane of three hexagons and `{ mainhand: '1' }` so a route refused at
 every step could not pass. The pre-existing "reaches byte-identical state and says the same
 things, over a scripted sequence" and "dispatches every entry in the shared table the way the
 REPL does" still pass with `/inventory` now a modal-opening command.
- proof 12: met — `Destroy` applies to every entry and `confirms: (entry) => entry.grown`, so a grown
 copy gets the second question `Destroy <name> for good?` with `['Go ahead','Close']` and a stack
 copy is taken at once; destroyItem in itemInstance.ts is the only verb that ends a plane, puts
 nothing down, and the word `drop` appears nowhere in the new surface. Proved by
 src/runtime/carriedScreen.test.ts > "asks a grown copy's destruction once more, naming the copy,
 and asks a stack nothing". Mutation c12-a-grown-copy-goes-without-a-second-question KILLED by
 that test. Read with c1: which copy `Destroy` reaches is the finding filed there — from the
 equipment row of a worn stack copy it decrements the stack behind it and leaves the slot filled.
- proof 13: met — `# test growing-through-the-inventory-screen` in content/tutorial-island.dsl, twenty
 lines every one of which is a screen being answered — open, select, Grow, allocate, slot, feed,
 Go to 1,0, allocate, allocate, slot, Go to 2,-1, allocate, Back to inventory, Equip, Close — and
 an `expect:` against a `# save` that has the copy worn in mainhand and out of the inventory.
 Re-run: `npx vitest run src/runtime/integration.test.ts -t "growing-through-the-inventory-screen"`
 — 1 passed, verified in this pass.
- proof 14: met — `npm run tasks -- merge-ready`, second run this session: tsc, npm test,
 layer-check, audit-status, doctor, bytes, tree, base and `spec crafting-modal` all pass; the only
 FAIL is `clauses crafting-modal — crafting-modal has no recorded audit pass`, which is what this
 pass supplies. The first run of the same command in the same tree reported `npm test FAIL exit=1`
 and did not name a test; `npm test -- --reporter=dot` immediately after passed 2855/2855 and the
 second merge-ready passed, so that leg flaked. Filed as friction rather than against this clause.
- proof 15: met — `Modal.leaving` is published from the member's declared `leaves` (LEAVE='Close',
 BACK='Back to inventory'), and both screens append it to every option they publish —
 carriedScreen `listed()` on item/verb/confirm, planeOptions on the single `plane` option — so no
 question this branch adds can be reached without one. The substrate refuses the other shape too:
 frameProblem in modals.ts drops a frame whose option accepts nothing. Answering it moves nothing
 (carriedSubmit returns null on LEAVE; planeSubmit returns the inventory frame). Proved by
 src/runtime/modals.test.ts > the value a screen leaves by > "is listed on every question the
 inventory asks, and takes it down from any of them" and "is the word the plane screen leaves by,
 and goes back rather than closing the world", plus carriedScreen.test.ts > "publishes the value
 that leaves beside every question, empty hands included". Mutation c15-no-screen-publishes-a-way-
 out KILLED by both.
- proof 16: met — src/runtime/carriedName.ts is the one function; carriedScreen's `nameOf`,
 planeScreen's `stacked`, planeReport's `name` field and both GUI ledgers all read it or the
 field it produced, and no surface composes a name. The id is out of the name and the option
 value is disambiguated separately by `distinct()` — answerability, as the clause allows. Proved
 by src/runtime/carriedName.test.ts > "calls a grown copy the same title under a descriptor" and
 by src/runtime/planeReport.test.ts. Mutation c16-a-grown-copy-is-named-like-its-stack KILLED,
 10 tests across three files. The one surface the clause names that no longer exists is the
 world's own `Unequip` choice, removed in 14d1669.
- proof 17: met — scripts/planeView.ts lost the `command` column and both `slotCommand` and the
 address it built; src/ui/plane.ts's PlaneRow is node/standing/what/worth with no directive field.
 Proved by scripts/planeView.test.ts:114 > "spells no directive beside a node the next point
 could go to". The values the screen publishes (`allocate: slot e`) are the abbreviated form the
 option is answered by, not the line that would do it, which is what c17 distinguishes.
- proof 18: unmet — Two of the three the clause names are fixed and proved: src/ui/sheet.ts `carried()`
 puts `tidy(row.count)` in the count column (src/ui/sheet.test.ts > "states the engine name and
 puts the count in the count column"; mutation c18-a-row-shows-an-id-where-it-shows-a-count
 KILLED at sheet.test.ts and render.test.tsx), and `worn()` reads the slot as the name and the
 engine's name as the value. Two things fail. (a) "worn offers `Unequip`, not an `Equip` that does
 nothing" holds for the entry but not for the page: pressing the equipment row of a worn *stack*
 copy dispatches `/inv <template>`, which resolves to the carried stack row that shares that id,
 and the player is offered `['Grow','Equip','Destroy','Close']` — see c1. The test that covers
 this sentence, carriedScreen.test.ts:162, puts a *grown* copy in the slot, whose id is unique, so
 the case is untested. (b) "a grown copy is legible on the page it is listed on: its name, and
 beneath it the per-stat contribution `itemContribution` already publishes" — under c21 a worn
 grown copy is listed only on the equipment page, and `worn()` in src/ui/sheet.ts emits no
 `detail` at all (src/ui/sheet.test.ts > "names the slot and the thing in it, never the id the
 slot holds" asserts the three-field row exactly). So the copy the player most wants to read is
 the one page that states nothing about it, and two identical worn copies in two slots have
 nothing to tell them apart — which is the reason c16 gives for leaving the id out of the name.
- proof 19: met — src/ui/asking.ts `dismissal` takes the decision off `Modal.leaving` and the option
 currently asked, reads no screen name, and returns null when the value is not among the option's
 listed values — so the gesture is always an answer the REPL could type, and dialogue (which
 publishes no `leaves`) is not dismissable. Both GUI gestures route through it: ModalSheet's
 click on its own ground (`event.target === event.currentTarget`) and App's `go`. Proved by
 src/ui/asking.test.ts > what a click away from a screen answers > "is nothing where the question
 being asked does not list it". Mutation c19-a-click-away-answers-a-value-the-question-does-not-
 list KILLED by that test.
- proof 20: unmet — Recorded as the author struck it, not re-graded: the implementation was reverted in
 7950a07, src/ui/Question.tsx no longer exists, its markup is back inside ModalSheet, and
 asking.ts kept `dismissal` and lost `askedOfRow`. A row on either ledger opens a sheet, as it
 did before c5a5215. The capability is filed as its own work. Grading `unmet` rather than
 `deferred` because the spec says in terms that it is struck and not deferred to a later member
 of this spec.
- proof 21: met — Equipping moves the copy: equipment.ts `carriedBy` calls `stockItem(state, id, -1)`
 on equip and `+1` on unequip, skipping a grown copy which is in no stack; itemCopies in
 itemInstance.ts is the one read of where every copy is, and it feeds `carriedCount` (what a row
 states) and `heldCount` (what a gate asks) separately — conditions.ts `has` now uses the second.
 The three readers the clause names are corrected: destroyItem's slot sweep is replaced by
 `takeOff`, which names the destroyed id; wearInstead is gone, growItem mints out of a slot and
 writes the minted id back into it; and stats.ts drops the `carriesItem` guard that c21 would have
 made false for everything worn, folding the worn item's contribution unconditionally. Proved by
 src/runtime/carriedScreen.test.ts > "lists a worn stack copy once, under its slot, and takes it
 off the stack's count" and "lists a worn grown copy under equipment and nowhere else", plus
 src/runtime/equipment.test.ts. Mutations c21-equipping-does-not-take-the-copy-off-the-carried-side
 (KILLED, 8 tests) and c21-a-gate-asks-what-is-carried-rather-than-what-is-held (KILLED, 57 tests
 at whole-suite scope). What is not met is not this clause's own text but the row identity it
 leaves behind — filed against c1 and c18.
