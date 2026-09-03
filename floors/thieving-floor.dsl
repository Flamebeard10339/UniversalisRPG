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
