# info fishing-floor
version: 1
pack: skills
dependencies:
  core
  first-steps
  fishing
  tulsa
  combat

# test bare-floor-to-14
run: first-steps.apology-route-full
travel: tulsa.riverside
use: entity.fishing.anchovy-shoal.net-cast until level.fishing >= 14
assert: level.fishing >= 14

# test gear-up
run: first-steps.apology-route-full
travel: tulsa.riverside
use: entity.fishing.shrimp-shoal.net-cast until inventory.fishing.raw-shrimp >= 200
travel: tulsa.market-square
travel: tulsa.market-row
shop: fishing.fishing-supplies
until 200 times:
  submit-modal: item=sell:fishing.raw-shrimp
submit-modal: item=buy:fishing.fishing-rod
submit-modal: item=buy:fishing.gut-line
until has 40 fishing.dried-fish-bait:
  wait: 60
  submit-modal: item=more:buy:fishing.dried-fish-bait
  submit-modal: count=40
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
  use: entity.fishing.trout-run.bait-cast until level.fishing >= 11 or not has fishing.dried-fish-bait
  travel: tulsa.riverside
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-trout:
    submit-modal: item=sell:fishing.raw-trout
  until has 100 fishing.dried-fish-bait:
    wait: 60
    submit-modal: item=more:buy:fishing.dried-fish-bait
    submit-modal: count=100
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.riverside
  travel: tulsa.deep-water
assert: level.fishing >= 11
travel: tulsa.the-narrows
until level.fishing >= 20:
  use: entity.fishing.pike-reach.bait-cast until level.fishing >= 20 or not has fishing.dried-fish-bait
  travel: tulsa.deep-water
  travel: tulsa.riverside
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-pike:
    submit-modal: item=sell:fishing.raw-pike
  until has 100 fishing.dried-fish-bait:
    wait: 60
    submit-modal: item=more:buy:fishing.dried-fish-bait
    submit-modal: count=100
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.riverside
  travel: tulsa.deep-water
  travel: tulsa.the-narrows
assert: level.fishing >= 20

# test top-floor-to-30
unkillable
run: kitted-floor-to-20
until level.fishing >= 22:
  use: entity.fishing.sturgeon-hole.bait-cast until level.fishing >= 22 or not has fishing.dried-fish-bait
  travel: tulsa.deep-water
  travel: tulsa.riverside
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-sturgeon:
    submit-modal: item=sell:fishing.raw-sturgeon
  until has 100 fishing.dried-fish-bait:
    wait: 60
    submit-modal: item=more:buy:fishing.dried-fish-bait
    submit-modal: count=100
  until has 40 fishing.bread-paste:
    wait: 60
    submit-modal: item=more:buy:fishing.bread-paste
    submit-modal: count=40
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.riverside
  travel: tulsa.deep-water
  travel: tulsa.the-narrows
assert: level.fishing >= 22
travel: tulsa.deep-water
travel: tulsa.riverside
travel: tulsa.market-square
travel: tulsa.swamp-edge
travel: tulsa.swamp-mire
equip: fishing.bread-paste
until level.fishing >= 25:
  use: core.melee-combat on combat.bog-lurker until done
  until level.fishing >= 25 or not has fishing.bread-paste:
    use: entity.fishing.tench-hole.paste-cast until done
  travel: tulsa.swamp-edge
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-tench:
    submit-modal: item=sell:fishing.raw-tench
  until has 40 fishing.bread-paste:
    wait: 60
    submit-modal: item=more:buy:fishing.bread-paste
    submit-modal: count=40
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.swamp-edge
  travel: tulsa.swamp-mire
assert: level.fishing >= 25
travel: tulsa.swamp-edge
travel: tulsa.market-square
travel: tulsa.market-row
shop: fishing.fishing-supplies
until not has fishing.raw-tench:
  submit-modal: item=sell:fishing.raw-tench
submit-modal: item=buy:fishing.greenheart-rod
submit-modal: item=close
assert: has fishing.greenheart-rod
equip: fishing.greenheart-rod
travel: tulsa.market-square
travel: tulsa.riverside
travel: tulsa.deep-water
travel: tulsa.the-narrows
travel: fishing.the-mere
equip: fishing.dried-fish-bait
until level.fishing >= 26:
  use: entity.fishing.perch-shoal.bait-cast until level.fishing >= 26 or not has fishing.dried-fish-bait
  travel: tulsa.the-narrows
  travel: tulsa.deep-water
  travel: tulsa.riverside
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-perch:
    submit-modal: item=sell:fishing.raw-perch
  until has 100 fishing.dried-fish-bait:
    wait: 60
    submit-modal: item=more:buy:fishing.dried-fish-bait
    submit-modal: count=100
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.riverside
  travel: tulsa.deep-water
  travel: tulsa.the-narrows
  travel: fishing.the-mere
assert: level.fishing >= 26
equip: fishing.bread-paste
until level.fishing >= 30:
  use: entity.fishing.carp-hole.paste-cast until level.fishing >= 30 or not has fishing.bread-paste
  travel: tulsa.the-narrows
  travel: tulsa.deep-water
  travel: tulsa.riverside
  travel: tulsa.market-square
  travel: tulsa.market-row
  shop: fishing.fishing-supplies
  until not has fishing.raw-carp:
    submit-modal: item=sell:fishing.raw-carp
  until has 40 fishing.bread-paste:
    wait: 60
    submit-modal: item=more:buy:fishing.bread-paste
    submit-modal: count=40
  submit-modal: item=close
  travel: tulsa.market-square
  travel: tulsa.riverside
  travel: tulsa.deep-water
  travel: tulsa.the-narrows
  travel: fishing.the-mere
assert: level.fishing >= 30
