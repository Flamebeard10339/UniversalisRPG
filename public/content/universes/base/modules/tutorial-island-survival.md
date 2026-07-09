# info
id: tutorial-island-survival
version: 1.0.0
universe: base
author: UniversalisRPG
game_version: 1.0
pack: tutorial-island
dependencies: tutorial-island-guide-house

# location tutorial-beach
x: 1, y: 0
title: Shell Beach
description: Low shoals glitter beside a smoky campfire.
exhausted: The beach settles into gull cries and surf.
tutorial shore

## entity brianna
talk: [[dialogue brianna]]

## entity shoals
title: Shrimp Shoals
fish:
  requires: small-net
  xp: fishing 4
  give: raw-shrimp 1
examine: Shrimp dart away from your shadow.

## entity campfire
cook: station: tutorial-campfire

## entity supply-crate
title: Supply Crate
examine: A net and bowl sit on top, practically accusing you of missing them.{tutorial.crate-net-taken & !tutorial.crate-bowl-taken: A bowl still sits at the bottom of the crate.}{!tutorial.crate-net-taken & tutorial.crate-bowl-taken: A small net still sits at the bottom of the crate.}{tutorial.crate-net-taken & tutorial.crate-bowl-taken: An empty supply crate. Nothing left worth taking.}
take net:
  give: small-net
  set: tutorial.crate-net-taken
  once
  say: You take the small net.
take bowl:
  give: bowl
  set: tutorial.crate-bowl-taken
  once
  say: You take the bowl.

## entity bridge-sign
title: Bridge Sign
read: say: The word FOOD is carved deeper than the rest.

# location tutorial-hermit-grove
x: 2, y: -1
title: Hermit Grove
description: Herbs grow around a weathered hut beyond the palms.
exhausted: The grove smells of crushed leaves.
tutorial forest

## entity hermit
talk: [[dialogue hermit]]

## entity herb-patch
title: Herb Patch
gather: give: herb 1

## entity cracked-bowl
title: Cracked Bowl
take:
  give: bowl
  once
  say: The bowl leaves a damp ring behind.
combine:
  requires: raw-shrimp & herb & bowl
  xp: cooking 2
  take: raw-shrimp
  take: herb
  give: uncooked-sleeping-draught

# location tutorial-bridge
x: 2, y: 0
title: Bridge Toll
description: A narrow bridge crosses the river. Something large waits below.
exhausted: The river keeps sliding past.
tutorial river

## entity river
use draught:
  requires: sleeping-draught
  take: sleeping-draught
  set: tutorial.gommi-asleep
  say: Gommi slumps under the bridge, snoring like a sawmill.
examine: A slow eddy curls under Gommi's bridge, deep enough to carry a cupful without a splash.

## entity gommi
pay toll:
  requires: cooked-shrimp
  hidden if: tutorial.bridge-open | tutorial.gommi-asleep
  take: cooked-shrimp
  set: tutorial.bridge-open
  say: Gommi eats first and negotiates never.
examine:
  hidden if: tutorial.gommi-asleep
  say: Big hands. Bigger appetite. He watches every snack that crosses the bridge.
examine-asleep:
  visible if: tutorial.gommi-asleep
  say: Gommi is out cold, snoring louder than the river.

## entity loose-plank
title: Loose Plank
examine: A tempting plank, but it wobbles and would not hold your weight over open water.

# dialogue brianna
start (brianna): You look hungry. Don't worry, we all showed up half-starved. Want the rundown?
  -> Sure, what do I do? [[explain-food]]
  -> I'll figure it out. [[close]]

[[explain-food]] (brianna): Net from the crate, shrimp from the shoals, heat from the campfire. Simple enough once you've done it twice.
  -> Why bother eating, though? [[explain-buff]]
  -> Got it, thanks. [[close]]

[[explain-buff]] (brianna): A hot meal makes you feel steadier for a while — your body recovers a bit faster than usual. Worth having a shrimp cooked and ready before you go looking for trouble.
  -> Got it, thanks. [[close]]

[[close]] (brianna): Good luck out there.

# dialogue hermit
start (hermit): Hrmph. Another one. What do you want?
  -> I could use some advice. [[explain-draught]]
  -> Never mind. [[close]]

[[explain-draught]] (hermit): Fish and herb, mixed in a bowl, then warmed. What comes out sleeps whatever drinks it. Rivers carry things further than people expect — further than a bridge, even.
  -> Noted. [[close]]

[[close]] (hermit): Don't mix up the bowls.

# recipe cook-shrimp
station: tutorial-campfire
in: raw-shrimp
out: cooked-shrimp
skill: cooking 4

# recipe cook-draught
station: tutorial-campfire
in: uncooked-sleeping-draught
out: sleeping-draught
skill: cooking 6
