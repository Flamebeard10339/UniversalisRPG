# info thieving-expansion-open
version: 0.1.0
pack: open
dependencies:
  core
  tulsa
  thieving

# flag probe-set

# flag probe-not-set

# entity probe-post
title: Probe Post
examine: A post.
set it:
  instant
  set: probe-set

# location tulsa.market-square
+entities: probe-post

# dialogue tulsa.guardsman
node probe-always:
  always
  ask: Probe always
  Always here.

# save probe-start
{"version":13,"location":"tulsa.market-square"}

# test an-always-node-laid-over-a-dialogue-is-offered
load: probe-start
travel: kings-road
talk: guardsman
choose: guardsman.probe-always
choose: continue
assert: guardsman.probe-always.visits = 1
