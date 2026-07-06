# Tutorial Island playtest: tutorial-island-mining
Enabled modules: base-core, wayside-supplies, tutorial-island-reset, tutorial-island-foundation, tutorial-island-guide-house, tutorial-island-survival, tutorial-island-bank, tutorial-island-mining

Location tutorial-guide-house: 5 entities (miki, front-door, mirror, drawer, bookshelf)
Location tutorial-beach: 5 entities (brianna, shoals, campfire, supply-crate, bridge-sign)
Location tutorial-hermit-grove: 3 entities (hermit, herb-patch, cracked-bowl)
Location tutorial-bridge: 3 entities (gommi, river, loose-plank)
Location tutorial-bank: 3 entities (bank-teller, vault-counter, trapdoor)
Location tutorial-mine: 5 entities (denzel, copper-rock, tin-rock, locked-chest, mine-tunnel)
Location tutorial-forge: 3 entities (furnace, anvil, forge-table)
Path check tutorial-island-guide-house: primary=Miki opens the door; alternative=drawer lockpick opens the same door; subtle hint=front-door examine hints the scratched keyhole.
Path check tutorial-island-survival: primary=cook shrimp and pay Gommi; alternative=hermit draught puts Gommi to sleep; subtle hint=river and bridge sign show the trick without naming it.
Path check tutorial-island-bank: primary=talk/withdraw and descend; alternative=trapdoor is open immediately; subtle hint=trapdoor is visible in the room.
Path check tutorial-island-mining: primary=mine-smelt-smith a bronze dagger; alternative=pick Denzel chest for materials and iron dagger; subtle hint=Denzel/chest text points at sentence/private chest.

RESULT: pass
