# info fishing-floor
version: 1
pack: skills
dependencies:
  core
  first-steps
  fishing
  tulsa

# test bare-floor-to-14
run: first-steps.apology-route-full
travel: tulsa.riverside
use: entity.fishing.anchovy-shoal.cast until level.fishing >= 14
assert: level.fishing >= 14

# test gear-up
run: first-steps.apology-route-full
travel: tulsa.riverside
use: entity.fishing.shrimp-shoal.cast until inventory.fishing.raw-shrimp >= 200
travel: tulsa.market-square
travel: tulsa.market-row
shop: fishing.fishing-supplies
until 200 times:
  submit-modal: item=sell:fishing.raw-shrimp
submit-modal: item=buy:fishing.fishing-rod
submit-modal: item=buy:fishing.gut-line
until 40 times:
  submit-modal: item=buy:fishing.dried-fish-bait
submit-modal: item=close
assert: has fishing.fishing-rod
assert: has fishing.gut-line
assert: inventory.fishing.dried-fish-bait >= 40
equip: fishing.fishing-rod
equip: fishing.dried-fish-bait
equip: fishing.gut-line

# test kitted-floor-to-20
run: gear-up
travel: tulsa.deep-water
until level.fishing >= 11:
  use: entity.fishing.trout-run.cast until level.fishing >= 11 or not has fishing.dried-fish-bait
  travel: tulsa.riverside
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-trout:
    submit-modal: item=sell:fishing.raw-trout
  submit-modal: item=more:buy:fishing.dried-fish-bait
  submit-modal: count=100
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.riverside
  travel: tulsa.deep-water
assert: level.fishing >= 11
travel: tulsa.the-narrows
until level.fishing >= 20:
  use: entity.fishing.pike-reach.cast until level.fishing >= 20 or not has fishing.dried-fish-bait
  travel: tulsa.deep-water
  travel: tulsa.riverside
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-pike:
    submit-modal: item=sell:fishing.raw-pike
  submit-modal: item=more:buy:fishing.dried-fish-bait
  submit-modal: count=100
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.riverside
  travel: tulsa.deep-water
  travel: tulsa.the-narrows
assert: level.fishing >= 20
