# Playtest: guide-house upstairs window discovers beach/bridge
Modules: base-core, tutorial-island-foundation, tutorial-island-guide-house, tutorial-island-survival, tutorial-island-bank, tutorial-island-mining, tutorial-island-combat
Mode: from-start

## At Tutorial guide house (tutorial-guide-house)
Tutorial guide house.
Entities present (6): Miki, Front door, Mirror, Drawer, Bookshelf, Stairs
Visible choices:
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.miki.talk` (entity-action on miki): Talk
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.front-door.pick-lock` (entity-action on front-door): Pick lock [requirements not met]
- `action:entity.mirror.look` (entity-action on mirror): Look
- `action:entity.drawer.examine` (entity-action on drawer): Examine
- `action:entity.drawer.take-coins` (entity-action on drawer): Take coins
- `action:entity.drawer.take-lockpick` (entity-action on drawer): Take lockpick
- `action:entity.bookshelf.examine` (entity-action on bookshelf): Examine
- `action:entity.bookshelf.take-note` (entity-action on bookshelf): Take note
- `action:entity.stairs-up.examine` (entity-action on stairs-up): Examine
- `action:entity.stairs-up.ascend` (entity-action on stairs-up): Ascend

> Chose: `action:entity.stairs-up.ascend` — Ascend

  - You climb the stairs.

## At Guide House, Upstairs (tutorial-guide-house-upstairs)
A cramped loft above the guide house, a single window looking out.
Entities present (2): Stairs, Window
Visible choices:
- `action:entity.stairs-down.examine` (entity-action on stairs-down): Examine
- `action:entity.stairs-down.descend` (entity-action on stairs-down): Descend
- `action:entity.window.examine` (entity-action on window): Examine
- `action:entity.window.look-through` (entity-action on window): Look through

> Chose: `action:entity.window.look-through` — Look through

  - Through the window you can make out the beach, and further off, a bridge.

## At Guide House, Upstairs (tutorial-guide-house-upstairs)
A cramped loft above the guide house, a single window looking out.
Entities present (2): Stairs, Window
Visible choices:
- `action:entity.stairs-down.examine` (entity-action on stairs-down): Examine
- `action:entity.stairs-down.descend` (entity-action on stairs-down): Descend
- `action:entity.window.examine` (entity-action on window): Examine
- `action:entity.window.look-through` (entity-action on window): Look through

> Chose: `action:entity.stairs-down.descend` — Descend

  - You climb back down.

## End state
Location: Tutorial guide house (tutorial-guide-house)
Flags: {"death-count":0,"tutorial.miki-cleared":false,"tutorial.bridge-open":false,"tutorial.gommi-asleep":false,"tutorial.bank-visited":false,"tutorial.mining-cleared":false,"tutorial.combat-cleared":false,"tutorial.cage-locked-by-orloth":false,"tutorial.reached-mainland":false,"quest.leave-tutorial-island.accepted":false,"tutorial.crate-net-taken":false,"tutorial.crate-bowl-taken":false,"tutorial-island.bookshelf-note-taken":false,"tutorial-island.drawer-coins-taken":false,"tutorial-island.drawer-lockpick-taken":false}
Inventory: {"gold":0,"lockpick":0,"note":0,"small-net":0,"raw-shrimp":0,"cooked-shrimp":0,"herb":0,"bowl":0,"uncooked-sleeping-draught":0,"sleeping-draught":0,"copper-ore":0,"tin-ore":0,"bronze-bar":0,"iron-dagger":0,"bronze-dagger":0,"bronze-pickaxe":0,"bones":0}
Bank: {}
Character name: ""
Spawn location: (default)

RESULT: fail
FEEDBACK: Location tutorial-guide-house has 6 entities visible at once (max 5).
FEEDBACK: Location tutorial-mine has 6 entities visible at once (max 5).
