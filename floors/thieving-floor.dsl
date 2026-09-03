# info thieving-floor
version: 1
dependencies:
  core
  first-steps
  thieving
  tulsa

# test death-farm-to-30
run: first-steps.thieving-route-full
until level.thieving >= 30:
  use: entity.civilian.pick-pocket until done
  wait: 120
assert: level.thieving >= 30

# test oolga-chest-to-10
run: first-steps.thieving-route-full
until level.thieving >= 10:
  travel: tavern-street
  travel: oolga-house
  use: entity.house-chest.pick-the-lock until done
assert: level.thieving >= 10

# test oolga-chest-to-20
run: oolga-chest-to-10
until level.thieving >= 20:
  travel: tavern-street
  travel: oolga-house
  use: entity.house-chest.pick-the-lock until done
assert: level.thieving >= 20

# test oolga-chest-to-30
run: oolga-chest-to-20
until level.thieving >= 30:
  travel: tavern-street
  travel: oolga-house
  use: entity.house-chest.pick-the-lock until done
assert: level.thieving >= 30

# test gear-up
run: first-steps.thieving-route-full
until inventory.thieving.common-general-thieving >= 1:
  use: entity.tulsa.civilian.pick-pocket until done
  wait: 120
assert: inventory.thieving.common-general-thieving >= 1
assert: has core.unassuming-cap
equip: 3
allocate: 3 at 0,0 slot e
slot: 3 at 0,0 e with common-general-thieving
allocate: 3 at 1,0 position 1
allocate: 3 at 1,0 position 2
allocate: 3 at 1,0 position 3
allocate: 3 at 1,0 position 4

# test geared-to-20
run: gear-up
until level.thieving >= 20:
  travel: tavern-street
  travel: oolga-house
  use: entity.house-chest.pick-the-lock until done
assert: level.thieving >= 20

# test geared-to-30
run: geared-to-20
until level.thieving >= 30:
  travel: tavern-street
  travel: oolga-house
  use: entity.house-chest.pick-the-lock until done
assert: level.thieving >= 30

# test cellar-chest-to-14
run: oolga-chest-to-10
until level.thieving >= 11:
  travel: tavern-street
  travel: oolga-house
  use: entity.house-chest.pick-the-lock until done
travel: tavern-street
travel: market-square
travel: castle-gate
until level.thieving >= 14:
  travel: castle-hall
  travel: castle-cellar
  use: entity.treasure-chest.pick-the-lock until done
assert: level.thieving >= 14

# test cellar-chest-to-22
run: cellar-chest-to-14
until level.thieving >= 22:
  travel: castle-hall
  travel: castle-cellar
  use: entity.treasure-chest.pick-the-lock until done
assert: level.thieving >= 22

# test jewellery-box-to-30
run: cellar-chest-to-22
until level.thieving >= 30:
  travel: castle-hall
  travel: castle-quarters
  use: entity.jewellery-box.pick-the-lock until done
assert: level.thieving >= 30
