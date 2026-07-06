# Playtest: tutorial-island-guide-house-primary-from-start
Modules: base-core, wayside-supplies, tutorial-island-reset, tutorial-island-foundation, tutorial-island-guide-house
Mode: from-start

## At Guide House (tutorial-guide-house)
A small room with a locked front door and too many helpful objects.
Entities present (5): Miki, Front Door, Mirror, Drawer, Bookshelf
Visible choices:
- `action:entity.miki.talk` (entity-action on miki): Talk
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.pick` (entity-action on front-door): Pick Lock [requirements not met]
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.look` (entity-action on mirror): Look
- `action:entity.drawer.search` (entity-action on drawer): Search
- `action:entity.bookshelf.read` (entity-action on bookshelf): Read

> Chose: `action:entity.miki.talk` — Talk

  - Miki: Welcome. Keep your map open, poke what looks useful, and check the Quests tab if you forget what you were doing. Colors there mean red for not started, yellow for in progress, green for done. Ready to see the island?

## At Guide House (tutorial-guide-house)
A small room with a locked front door and too many helpful objects.
Entities present (5): Miki, Front Door, Mirror, Drawer, Bookshelf
Visible choices:
- `dialogue-option:ready` (dialogue-option): I can find my way.

> Chose: `dialogue-option:ready` — I can find my way.

  - Miki: Good. The door is open. Curiosity is allowed here.

## End state
Location: Guide House (tutorial-guide-house)
Flags: {"death-count":0,"tutorial-guide.q1.count":0,"tutorial.miki-cleared":true,"tutorial.bridge-open":false,"tutorial.gommi-asleep":false,"tutorial.bank-visited":false,"tutorial.mining-cleared":false,"tutorial.combat-cleared":false,"tutorial.cage-locked-by-orloth":false,"tutorial.reached-mainland":false,"quest.leave-tutorial-island.accepted":true,"well-fed":false}
Inventory: {"emberleaf":0,"log":0,"iron-ore":0,"bones":0,"bronze-spear":0,"bronze-dagger":0,"bronze-arrow":0,"bronze-throwing-knife":0,"tutorial-blade":0,"bronze-pickaxe":0,"gold":0,"lockpick":0,"guide-book":0,"small-net":0,"raw-shrimp":0,"cooked-shrimp":0,"herb":0,"bowl":0,"uncooked-sleeping-draught":0,"sleeping-draught":0,"copper-ore":0,"tin-ore":0,"bronze-bar":0,"iron-dagger":0}
Bank: {}
Appearance: {"presetId":"default"}
Spawn location: (default)

RESULT: pass
