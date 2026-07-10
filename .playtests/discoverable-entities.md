# Playtest: discoverable-entities
Modules: base-core, tutorial-island-foundation, tutorial-island-guide-house, tutorial-island-survival, tutorial-island-bank, tutorial-island-mining, tutorial-island-combat
Mode: from-start

## At Tutorial guide house (tutorial-guide-house)
Tutorial guide house.
Entities present (6): Miki, Front door, Mirror, Drawer, Bookshelf, Stairs
Visible choices:
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.examine` (entity-action on mirror): Examine
- `action:entity.drawer.examine` (entity-action on drawer): Examine
- `action:entity.bookshelf.examine` (entity-action on bookshelf): Examine
- `action:entity.stairs-up.examine` (entity-action on stairs-up): Examine

> Chose: `action:entity.bookshelf.examine` — Examine

  - A packed bookshelf with leather bound tomes. There is a handwritten note tossed on the second shelf.

## At Tutorial guide house (tutorial-guide-house)
Tutorial guide house.
Entities present (6): Miki, Front door, Mirror, Drawer, Bookshelf, Stairs
Visible choices:
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.examine` (entity-action on mirror): Examine
- `action:entity.drawer.examine` (entity-action on drawer): Examine
- `action:entity.bookshelf.examine` (entity-action on bookshelf): Examine
- `action:entity.bookshelf.take-note` (entity-action on bookshelf): Take note
- `action:entity.stairs-up.examine` (entity-action on stairs-up): Examine

> Chose: `action:entity.bookshelf.take-note` — Take note

  - You take the note.

## At Tutorial guide house (tutorial-guide-house)
Tutorial guide house.
Entities present (6): Miki, Front door, Mirror, Drawer, Bookshelf, Stairs
Visible choices:
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.examine` (entity-action on mirror): Examine
- `action:entity.drawer.examine` (entity-action on drawer): Examine
- `action:entity.bookshelf.examine` (entity-action on bookshelf): Examine
- `action:entity.stairs-up.examine` (entity-action on stairs-up): Examine
- `action:item.note.examine` (item-action): Examine
- `action:item.note.read` (item-action): Read

> Chose: `action:entity.drawer.examine` — Examine

  - A drawer full of random junk. There are coins and a worn set of lockpicks tucked in the back.

## At Tutorial guide house (tutorial-guide-house)
Tutorial guide house.
Entities present (6): Miki, Front door, Mirror, Drawer, Bookshelf, Stairs
Visible choices:
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.examine` (entity-action on mirror): Examine
- `action:entity.drawer.examine` (entity-action on drawer): Examine
- `action:entity.drawer.take-coins` (entity-action on drawer): Take coins
- `action:entity.drawer.take-lockpick` (entity-action on drawer): Take lockpick
- `action:entity.bookshelf.examine` (entity-action on bookshelf): Examine
- `action:entity.stairs-up.examine` (entity-action on stairs-up): Examine
- `action:item.note.examine` (item-action): Examine
- `action:item.note.read` (item-action): Read

> Chose: `action:entity.drawer.take-coins` — Take coins

  - You take the coins.

## At Tutorial guide house (tutorial-guide-house)
Tutorial guide house.
Entities present (6): Miki, Front door, Mirror, Drawer, Bookshelf, Stairs
Visible choices:
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.examine` (entity-action on mirror): Examine
- `action:entity.drawer.examine` (entity-action on drawer): Examine
- `action:entity.drawer.take-lockpick` (entity-action on drawer): Take lockpick
- `action:entity.bookshelf.examine` (entity-action on bookshelf): Examine
- `action:entity.stairs-up.examine` (entity-action on stairs-up): Examine
- `action:item.gold.examine` (item-action): Examine
- `action:item.note.examine` (item-action): Examine
- `action:item.note.read` (item-action): Read

> Chose: `action:entity.drawer.take-lockpick` — Take lockpick

  - You take the lockpick.

## At Tutorial guide house (tutorial-guide-house)
Tutorial guide house.
Entities present (6): Miki, Front door, Mirror, Drawer, Bookshelf, Stairs
Visible choices:
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.examine` (entity-action on mirror): Examine
- `action:entity.drawer.examine` (entity-action on drawer): Examine
- `action:entity.bookshelf.examine` (entity-action on bookshelf): Examine
- `action:entity.stairs-up.examine` (entity-action on stairs-up): Examine
- `action:item.gold.examine` (item-action): Examine
- `action:item.lockpick.examine` (item-action): Examine
- `action:item.note.examine` (item-action): Examine
- `action:item.note.read` (item-action): Read

> Chose: `action:entity.bookshelf.examine` — Examine

  - A packed bookshelf with leather bound tomes.

## End state
Location: Tutorial guide house (tutorial-guide-house)
Flags: {"death-count":0,"tutorial.miki-cleared":false,"tutorial.bridge-open":false,"tutorial.gommi-asleep":false,"tutorial.bank-visited":false,"tutorial.mining-cleared":false,"tutorial.combat-cleared":false,"tutorial.cage-locked-by-orloth":false,"tutorial.reached-mainland":false,"quest.leave-tutorial-island.accepted":false,"tutorial.crate-net-taken":false,"tutorial.crate-bowl-taken":false,"tutorial-island.bookshelf-note-taken":true,"tutorial-island.drawer-coins-taken":true,"tutorial-island.drawer-lockpick-taken":true}
Inventory: {"gold":5,"lockpick":1,"note":1,"small-net":0,"raw-shrimp":0,"cooked-shrimp":0,"herb":0,"bowl":0,"uncooked-sleeping-draught":0,"sleeping-draught":0,"copper-ore":0,"tin-ore":0,"bronze-bar":0,"iron-dagger":0,"bronze-dagger":0,"bronze-pickaxe":0,"bones":0}
Bank: {}
Character name: ""
Spawn location: (default)

RESULT: fail
FEEDBACK: Location tutorial-guide-house has 6 entities visible at once (max 5).
FEEDBACK: Location tutorial-mine has 6 entities visible at once (max 5).
