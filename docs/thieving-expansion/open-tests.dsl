# info thieving-expansion-open
version: 0.1.0
pack: open
dependencies:
  core
  tulsa
  thieving

# flag probe-set

# flag probe-not-set

# droptable probe-sub
set: probe-set
stop
set: probe-not-set

# entity probe-shadow
title: Probe Shadow
examine: Only here once set.
hidden if: not probe-set
touch:
  instant
  set: probe-not-set

# entity probe-post
title: Probe Post
examine: A post.
set it:
  instant
  set: probe-set
sub:
  instant
  roll: probe-sub

# location tulsa.market-square
+entities: probe-post, probe-shadow

# location tulsa.doss-house
-adjacent: tulsa.well-lane

# dialogue tulsa.guardsman
node probe-always:
  always
  ask: Probe always
  Always here.

# save probe-start
{"version":13,"location":"tulsa.market-square"}

# test an-entity-hidden-by-its-own-condition-refuses-its-actions
load: probe-start
use: entity.probe-shadow.touch
refused
assert: not probe-not-set

# test stop-ends-a-droptable
load: probe-start
use: entity.probe-post.sub
assert: probe-set
assert: not probe-not-set

# test a-minus-adjacent-line-takes-one-road-out
load: probe-start
goto: tulsa.doss-house
travel: well-lane
refused

# test an-always-node-laid-over-a-dialogue-is-offered
load: probe-start
travel: kings-road
talk: guardsman
choose: guardsman.probe-always
choose: continue
assert: guardsman.probe-always.visits = 1
