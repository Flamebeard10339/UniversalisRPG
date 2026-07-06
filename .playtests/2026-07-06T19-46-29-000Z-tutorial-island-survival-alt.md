# Playtest: tutorial-island-survival-alt
Modules: base-core, wayside-supplies, tutorial-island-reset, tutorial-island-foundation, tutorial-island-guide-house, tutorial-island-survival
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

> Chose: `action:entity.drawer.search` — Search

  - The drawer was not locked. Inside: a few coins, a lockpick, and a small guide book. That feels deliberate.

## At Guide House (tutorial-guide-house)
A small room with a locked front door and too many helpful objects.
Entities present (5): Miki, Front Door, Mirror, Drawer, Bookshelf
Visible choices:
- `action:entity.miki.talk` (entity-action on miki): Talk
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.pick` (entity-action on front-door): Pick Lock
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.look` (entity-action on mirror): Look
- `action:entity.bookshelf.read` (entity-action on bookshelf): Read

> Chose: `action:entity.front-door.pick` — Pick Lock

  - The lock gives with a soft click. Whatever is out there, you can reach it now.

## At Guide House (tutorial-guide-house)
A small room with a locked front door and too many helpful objects.
Entities present (5): Miki, Front Door, Mirror, Drawer, Bookshelf
Visible choices:
- `action:travel-house-to-beach` (action): Travel to Shell Beach
- `action:entity.miki.talk` (entity-action on miki): Talk
- `action:entity.miki.examine` (entity-action on miki): Examine
- `action:entity.front-door.examine` (entity-action on front-door): Examine
- `action:entity.mirror.look` (entity-action on mirror): Look
- `action:entity.bookshelf.read` (entity-action on bookshelf): Read

> Chose: `action:travel-house-to-beach` — Travel to Shell Beach

  - You arrive.

## At Shell Beach (tutorial-beach)
Low shoals glitter beside a smoky campfire.
Entities present (5): Brianna, Shrimp Shoals, Campfire, Supply Crate, Bridge Sign
Visible choices:
- `action:travel-beach-to-house` (action): Travel to Guide House
- `action:travel-beach-to-hermit-grove` (action): Travel to Hermit Grove
- `action:travel-beach-to-bridge` (action): Travel to Bridge Toll
- `action:entity.brianna.talk` (entity-action on brianna): Talk
- `action:entity.shoals.fish` (entity-action on shoals): Fish [requirements not met]
- `action:entity.shoals.examine` (entity-action on shoals): Examine
- `action:entity.campfire.eat` (entity-action on campfire): Eat [requirements not met]
- `action:entity.supply-crate.search` (entity-action on supply-crate): Search
- `action:entity.bridge-sign.read` (entity-action on bridge-sign): Read

> Chose: `action:entity.bridge-sign.read` — Read

  - The word FOOD is carved deeper than the rest.

## At Shell Beach (tutorial-beach)
Low shoals glitter beside a smoky campfire.
Entities present (5): Brianna, Shrimp Shoals, Campfire, Supply Crate, Bridge Sign
Visible choices:
- `action:travel-beach-to-house` (action): Travel to Guide House
- `action:travel-beach-to-hermit-grove` (action): Travel to Hermit Grove
- `action:travel-beach-to-bridge` (action): Travel to Bridge Toll
- `action:entity.brianna.talk` (entity-action on brianna): Talk
- `action:entity.shoals.fish` (entity-action on shoals): Fish [requirements not met]
- `action:entity.shoals.examine` (entity-action on shoals): Examine
- `action:entity.campfire.eat` (entity-action on campfire): Eat [requirements not met]
- `action:entity.supply-crate.search` (entity-action on supply-crate): Search
- `action:entity.bridge-sign.read` (entity-action on bridge-sign): Read

> Chose: `action:entity.supply-crate.search` — Search

  - A net and bowl sit on top, practically accusing you of missing them.

## At Shell Beach (tutorial-beach)
Low shoals glitter beside a smoky campfire.
Entities present (5): Brianna, Shrimp Shoals, Campfire, Supply Crate, Bridge Sign
Visible choices:
- `action:travel-beach-to-house` (action): Travel to Guide House
- `action:travel-beach-to-hermit-grove` (action): Travel to Hermit Grove
- `action:travel-beach-to-bridge` (action): Travel to Bridge Toll
- `action:entity.brianna.talk` (entity-action on brianna): Talk
- `action:entity.shoals.fish` (entity-action on shoals): Fish
- `action:entity.shoals.examine` (entity-action on shoals): Examine
- `action:entity.campfire.eat` (entity-action on campfire): Eat [requirements not met]
- `action:entity.bridge-sign.read` (entity-action on bridge-sign): Read

> Chose: `action:entity.shoals.fish` — Fish

  - 

## At Shell Beach (tutorial-beach)
Low shoals glitter beside a smoky campfire.
Entities present (5): Brianna, Shrimp Shoals, Campfire, Supply Crate, Bridge Sign
Visible choices:
- `action:travel-beach-to-house` (action): Travel to Guide House
- `action:travel-beach-to-hermit-grove` (action): Travel to Hermit Grove
- `action:travel-beach-to-bridge` (action): Travel to Bridge Toll
- `action:entity.brianna.talk` (entity-action on brianna): Talk
- `action:entity.shoals.fish` (entity-action on shoals): Fish
- `action:entity.shoals.examine` (entity-action on shoals): Examine
- `action:entity.campfire.cook@cook-shrimp` (entity-action on campfire): Raw Shrimp
- `action:entity.campfire.eat` (entity-action on campfire): Eat [requirements not met]
- `action:entity.bridge-sign.read` (entity-action on bridge-sign): Read

> Chose: `action:travel-beach-to-hermit-grove` — Travel to Hermit Grove

  - You arrive.

## At Hermit Grove (tutorial-hermit-grove)
Herbs grow around a weathered hut beyond the palms.
Entities present (3): Hermit, Herb Patch, Cracked Bowl
Visible choices:
- `action:travel-hermit-grove-to-beach` (action): Travel to Shell Beach
- `action:entity.hermit.talk` (entity-action on hermit): Talk
- `action:entity.herb-patch.gather` (entity-action on herb-patch): Gather
- `action:entity.cracked-bowl.take` (entity-action on cracked-bowl): Take
- `action:entity.cracked-bowl.combine` (entity-action on cracked-bowl): Combine [requirements not met]

> Chose: `action:entity.herb-patch.gather` — Gather

  - 

## At Hermit Grove (tutorial-hermit-grove)
Herbs grow around a weathered hut beyond the palms.
Entities present (3): Hermit, Herb Patch, Cracked Bowl
Visible choices:
- `action:travel-hermit-grove-to-beach` (action): Travel to Shell Beach
- `action:entity.hermit.talk` (entity-action on hermit): Talk
- `action:entity.herb-patch.gather` (entity-action on herb-patch): Gather
- `action:entity.cracked-bowl.take` (entity-action on cracked-bowl): Take
- `action:entity.cracked-bowl.combine` (entity-action on cracked-bowl): Combine

> Chose: `action:entity.hermit.talk` — Talk

  - Hermit: Fish and herb, mixed in a bowl, then warmed. What comes out sleeps whatever drinks it. Rivers carry things further than people expect.

## At Hermit Grove (tutorial-hermit-grove)
Herbs grow around a weathered hut beyond the palms.
Entities present (3): Hermit, Herb Patch, Cracked Bowl
Visible choices:
- `action:travel-hermit-grove-to-beach` (action): Travel to Shell Beach
- `action:entity.hermit.talk` (entity-action on hermit): Talk
- `action:entity.herb-patch.gather` (entity-action on herb-patch): Gather
- `action:entity.cracked-bowl.take` (entity-action on cracked-bowl): Take
- `action:entity.cracked-bowl.combine` (entity-action on cracked-bowl): Combine

> Chose: `action:entity.cracked-bowl.combine` — Combine

  - 

## At Hermit Grove (tutorial-hermit-grove)
Herbs grow around a weathered hut beyond the palms.
Entities present (3): Hermit, Herb Patch, Cracked Bowl
Visible choices:
- `action:travel-hermit-grove-to-beach` (action): Travel to Shell Beach
- `action:entity.hermit.talk` (entity-action on hermit): Talk
- `action:entity.herb-patch.gather` (entity-action on herb-patch): Gather
- `action:entity.cracked-bowl.take` (entity-action on cracked-bowl): Take
- `action:entity.cracked-bowl.combine` (entity-action on cracked-bowl): Combine [requirements not met]

> Chose: `action:travel-hermit-grove-to-beach` — Travel to Shell Beach

  - You arrive.

## At Shell Beach (tutorial-beach)
Low shoals glitter beside a smoky campfire.
Entities present (5): Brianna, Shrimp Shoals, Campfire, Supply Crate, Bridge Sign
Visible choices:
- `action:travel-beach-to-house` (action): Travel to Guide House
- `action:travel-beach-to-hermit-grove` (action): Travel to Hermit Grove
- `action:travel-beach-to-bridge` (action): Travel to Bridge Toll
- `action:entity.brianna.talk` (entity-action on brianna): Talk
- `action:entity.shoals.fish` (entity-action on shoals): Fish
- `action:entity.shoals.examine` (entity-action on shoals): Examine
- `action:entity.campfire.cook@cook-draught` (entity-action on campfire): Uncooked Sleeping Draught
- `action:entity.campfire.eat` (entity-action on campfire): Eat [requirements not met]
- `action:entity.bridge-sign.read` (entity-action on bridge-sign): Read

> Chose: `action:entity.campfire.cook@cook-draught` — Uncooked Sleeping Draught

  - It is ready.

## At Shell Beach (tutorial-beach)
Low shoals glitter beside a smoky campfire.
Entities present (5): Brianna, Shrimp Shoals, Campfire, Supply Crate, Bridge Sign
Visible choices:
- `action:travel-beach-to-house` (action): Travel to Guide House
- `action:travel-beach-to-hermit-grove` (action): Travel to Hermit Grove
- `action:travel-beach-to-bridge` (action): Travel to Bridge Toll
- `action:entity.brianna.talk` (entity-action on brianna): Talk
- `action:entity.shoals.fish` (entity-action on shoals): Fish
- `action:entity.shoals.examine` (entity-action on shoals): Examine
- `action:entity.campfire.eat` (entity-action on campfire): Eat [requirements not met]
- `action:entity.bridge-sign.read` (entity-action on bridge-sign): Read

> Chose: `action:travel-beach-to-bridge` — Travel to Bridge Toll

  - You arrive.

## At Bridge Toll (tutorial-bridge)
A narrow bridge crosses the river. Something large waits below.
Entities present (3): Gommi, River, Loose Plank
Visible choices:
- `action:travel-bridge-to-beach` (action): Travel to Shell Beach
- `action:entity.gommi.pay-toll` (entity-action on gommi): Pay Toll [requirements not met]
- `action:entity.gommi.examine` (entity-action on gommi): Examine
- `action:entity.river.use-draught` (entity-action on river): Use Draught
- `action:entity.river.examine` (entity-action on river): Examine
- `action:entity.loose-plank.examine` (entity-action on loose-plank): Examine

> Chose: `action:entity.river.examine` — Examine

  - A slow eddy curls under Gommi’s bridge, deep enough to carry a cupful without a splash.

## At Bridge Toll (tutorial-bridge)
A narrow bridge crosses the river. Something large waits below.
Entities present (3): Gommi, River, Loose Plank
Visible choices:
- `action:travel-bridge-to-beach` (action): Travel to Shell Beach
- `action:entity.gommi.pay-toll` (entity-action on gommi): Pay Toll [requirements not met]
- `action:entity.gommi.examine` (entity-action on gommi): Examine
- `action:entity.river.use-draught` (entity-action on river): Use Draught
- `action:entity.river.examine` (entity-action on river): Examine
- `action:entity.loose-plank.examine` (entity-action on loose-plank): Examine

> Chose: `action:entity.river.use-draught` — Use Draught

  - Gommi slumps under the bridge, snoring like a sawmill.

## At Bridge Toll (tutorial-bridge)
A narrow bridge crosses the river. Something large waits below.
Entities present (3): Gommi, River, Loose Plank
Visible choices:
- `action:travel-bridge-to-beach` (action): Travel to Shell Beach
- `action:entity.gommi.examine-asleep` (entity-action on gommi): Examine
- `action:entity.river.use-draught` (entity-action on river): Use Draught [requirements not met]
- `action:entity.river.examine` (entity-action on river): Examine
- `action:entity.loose-plank.examine` (entity-action on loose-plank): Examine

> Chose: `action:entity.gommi.examine-asleep` — Examine

  - Gommi is out cold, snoring louder than the river.

## End state
Location: Bridge Toll (tutorial-bridge)
Flags: {"death-count":0,"tutorial-guide.q1.count":0,"tutorial.miki-cleared":true,"tutorial.bridge-open":false,"tutorial.gommi-asleep":true,"tutorial.bank-visited":false,"tutorial.mining-cleared":false,"tutorial.combat-cleared":false,"tutorial.cage-locked-by-orloth":false,"tutorial.reached-mainland":false,"quest.leave-tutorial-island.accepted":true,"well-fed":false}
Inventory: {"emberleaf":0,"log":0,"iron-ore":0,"bones":0,"bronze-spear":0,"bronze-dagger":0,"bronze-arrow":0,"bronze-throwing-knife":0,"tutorial-blade":0,"bronze-pickaxe":0,"gold":5,"lockpick":1,"guide-book":1,"small-net":1,"raw-shrimp":0,"cooked-shrimp":0,"herb":0,"bowl":1,"uncooked-sleeping-draught":0,"sleeping-draught":0,"copper-ore":0,"tin-ore":0,"bronze-bar":0,"iron-dagger":0}
Bank: {}
Appearance: {"presetId":"default"}
Spawn location: (default)

RESULT: pass
