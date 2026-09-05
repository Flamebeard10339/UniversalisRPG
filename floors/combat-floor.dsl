# info combat-floor
version: 1
pack: skills
dependencies:
  core
  cooking
  first-steps
  combat
  tulsa

# test bare-floor-to-10
run: first-steps.miki-route-full
equip: core.iron-sword
equip: core.wooden-shield
until level.combat.attack >= 10 and level.combat.health >= 10:
  travel: tulsa.kelsa-farmhouse
  travel: tulsa.bee-gate
  travel: tulsa.pasture
  use: core.melee-combat on combat.chicken until done
  use: core.melee-combat on combat.cow until done
  travel: tulsa.bee-gate
  travel: tulsa.apiary-field
  use: core.melee-combat on tulsa.drone-bee until done
  use: core.melee-combat on combat.princess-bee until done
  travel: tulsa.bee-gate
  travel: tulsa.tunnel-mouth
  travel: tulsa.tunnels
  use: core.melee-combat on combat.feral-rat until done
  travel: tulsa.tunnel-mouth
  travel: tulsa.bee-gate
  travel: tulsa.kelsa-farmhouse
  travel: tulsa.market-square
assert: level.combat.attack >= 10
assert: level.combat.health >= 10

# test gear-up-bronze
run: bare-floor-to-10
until inventory.core.coin >= 280:
  travel: tulsa.kings-road
  travel: tulsa.north-road
  use: core.melee-combat on combat.highwayman until done
  travel: tulsa.pinewood
  use: core.melee-combat on combat.wolf until done
  travel: tulsa.north-road
  travel: tulsa.kings-road
  travel: tulsa.market-square
travel: tulsa.market-row
travel: tulsa.forge
shop: combat.armoury-counter
submit-modal: item=buy:combat.bronze-dagger
submit-modal: item=buy:combat.bronze-shield
submit-modal: item=buy:combat.bronze-helmet
submit-modal: item=buy:combat.bronze-platebody
submit-modal: item=buy:combat.bronze-platelegs
submit-modal: item=buy:combat.bronze-boots
submit-modal: item=close
assert: has combat.bronze-dagger
assert: has combat.bronze-shield
assert: has combat.bronze-helmet
assert: has combat.bronze-platebody
assert: has combat.bronze-platelegs
assert: has combat.bronze-boots
equip: combat.bronze-dagger
equip: combat.bronze-shield
equip: combat.bronze-helmet
equip: combat.bronze-platebody
equip: combat.bronze-platelegs
equip: combat.bronze-boots
travel: tulsa.market-square

# test bronze-floor-to-20
run: gear-up-bronze
until level.combat.attack >= 20 and level.combat.health >= 20:
  travel: tulsa.kings-road
  travel: tulsa.north-road
  use: core.melee-combat on combat.highwayman until done
  travel: tulsa.pinewood
  use: core.melee-combat on combat.wolf until done
  travel: tulsa.north-road
  travel: tulsa.kings-road
  travel: tulsa.market-square
assert: level.combat.attack >= 20
assert: level.combat.health >= 20

# test gear-up-iron
run: bronze-floor-to-20
until inventory.core.coin >= 850:
  travel: tulsa.kings-road
  travel: tulsa.north-road
  use: core.melee-combat on combat.highwayman until done
  travel: tulsa.kings-road
  travel: tulsa.market-square
travel: tulsa.market-row
travel: tulsa.forge
shop: combat.armoury-counter
submit-modal: item=buy:combat.iron-dagger
submit-modal: item=buy:combat.iron-shield
submit-modal: item=buy:combat.iron-helmet
submit-modal: item=buy:combat.iron-platebody
submit-modal: item=buy:combat.iron-platelegs
submit-modal: item=buy:combat.iron-boots
submit-modal: item=buy:combat.keen-edge-jewel
submit-modal: item=close
assert: has combat.iron-dagger
assert: has combat.iron-shield
assert: has combat.iron-helmet
assert: has combat.iron-platebody
assert: has combat.iron-platelegs
assert: has combat.iron-boots
assert: has combat.keen-edge-jewel
equip: combat.iron-dagger
equip: combat.iron-shield
equip: combat.iron-helmet
equip: combat.iron-platebody
equip: combat.iron-platelegs
equip: combat.iron-boots
allocate: 9 at 0,0 slot e
slot: 9 at 0,0 e with combat.keen-edge-jewel
allocate: 9 at 1,0 position 1
assert: stat.physical-damage > 0
travel: tulsa.market-square

# test iron-floor-to-30
run: gear-up-iron
until level.combat.attack >= 30 and level.combat.health >= 30:
  travel: tulsa.kelsa-farmhouse
  travel: tulsa.bee-gate
  travel: tulsa.tunnel-mouth
  travel: tulsa.tunnels
  travel: tulsa.the-muster
  use: core.melee-combat on combat.ratkin-warrior until done
  travel: tulsa.tunnels
  travel: tulsa.tunnel-mouth
  travel: tulsa.bee-gate
  travel: tulsa.kelsa-farmhouse
  travel: tulsa.market-square
  travel: tulsa.swamp-edge
  travel: tulsa.swamp-mire
  use: core.melee-combat on combat.bog-lurker until done
  use: core.melee-combat on combat.swamp-mollusk until done
  travel: tulsa.swamp-edge
  travel: tulsa.market-square
assert: level.combat.attack >= 30
assert: level.combat.health >= 30
