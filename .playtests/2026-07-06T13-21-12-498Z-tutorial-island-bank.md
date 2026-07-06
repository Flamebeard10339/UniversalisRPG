# Tutorial Island playtest: tutorial-island-bank
Enabled modules: base-core, wayside-supplies, tutorial-island-reset, tutorial-island-foundation, tutorial-island-guide-house, tutorial-island-survival, tutorial-island-bank

Location tutorial-guide-house: 5 entities (miki, front-door, mirror, drawer, bookshelf)
Location tutorial-beach: 5 entities (brianna, shoals, campfire, supply-crate, bridge-sign)
Location tutorial-hermit-grove: 3 entities (hermit, herb-patch, cracked-bowl)
Location tutorial-bridge: 3 entities (gommi, river, loose-plank)
Location tutorial-bank: 3 entities (bank-teller, vault-counter, trapdoor)
Path check tutorial-island-guide-house: primary=Miki opens the door; alternative=drawer lockpick opens the same door; subtle hint=front-door examine hints the scratched keyhole.
Path check tutorial-island-survival: primary=cook shrimp and pay Gommi; alternative=hermit draught puts Gommi to sleep; subtle hint=river and bridge sign show the trick without naming it.
Path check tutorial-island-bank: primary=talk/withdraw and descend; alternative=trapdoor is open immediately; subtle hint=trapdoor is visible in the room.

RESULT: pass
