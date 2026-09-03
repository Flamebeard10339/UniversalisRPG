# Fishing: a floor route, to walk the ladder rather than assert it

Write **one new module, `fishing-floor`**, holding routes that start where a real player starts
and fish their way up. Nothing else is yours: `content/fishing.dsl` is finished and is not to be
edited.

A floor route is the fastest way anybody has actually walked to a level. It is not a proof that
the numbers are right — it is the measurement the numbers are read against. `npm run floors`
walks each route, reads its goal off its own closing `assert: level.<skill> >= <n>`, and prints
the game-minutes it took beside the minutes the curve allows for that level. Nothing about the
minutes is asserted anywhere. **Do not write a single `assert:` about experience, coin, time or
a drop count.** A route asserts the level it reached and the things it is holding, and no more.

`content/thieving-floor.dsl` is in the corpus you are reading and is the shape to copy. Read it
first. Note how each route opens with `run:` of the one before it, so the ladder is climbed once
and not three times, and how `gear-up` buys and wears a kit and allocates a jewel before working
a mark.

## What to write

Between two and four routes. These are the ones worth having:

- **a bare floor to about level 14** — a player with the net the tutorial gives them and nothing
  else, working the shingle and then the deep water. This is the one that says what fishing pays
  somebody who has bought nothing.
- **a kitted floor to about level 20** — the same player, having bought a rod, bait and a line
  off the tackle stall on Market Row first, the way `gear-up` does in the thieving floor. Buying
  the kit is part of the route and its minutes count.
- **a top-band floor to 30** if the budget runs to it, carrying the greenheart band. The mere and
  the tench hole are up there.

Fewer routes that walk beats more that do not.

## The facts you need, so you do not spend the run finding them

- A player reaches town through `first-steps.miki-route-full`, which is the tutorial done the
  polite way and ends with a small fishing net. `run:` it as the first line, as the thieving
  floor `run:`s its own opposite number.
- The waters, going up: the shingle at `tulsa.riverside` (shrimp, anchovy, nets only), the deep
  water at `tulsa.deep-water` (trout, salmon, rod and bait), `tulsa.the-narrows` (pike at 11,
  sturgeon at 16), the swamp mire (eel bed, tench at 22), `fishing.the-mere` past the Narrows
  (perch at 24, carp at 26). Old Slate is a single fish at 30 and is not a floor.
- The tackle stall is `fishing.fishing-supplies` on `tulsa.market-row`, and it sells the rod, the
  bait, the lines and the greenheart rod. A shop is worked the way the thieving floor works the
  alley coat: `shop:`, then `submit-modal: item=buy:<id>`, then `submit-modal: item=close`.
- **A route that stands in `tulsa.swamp-mire` is attacked before it can cast.** `tulsa.bog-lurker`
  lives there. Put `use: core.melee-combat on tulsa.bog-lurker until done` before the cast, or
  the step fails with the cast never armed and the trace showing a fight instead.
- `travel:` is one hop and refuses the room it is already in, so a loop body has to be a walk
  that is legal both from the water and from wherever anything throws the player.
- Bait is spent per cast. A loop that fishes for an hour and buys no more bait stops when the tin
  is empty, and the route ends there. Buy enough, or write the walk back to the stall into the
  loop.

## What the curve allows, for your report

Minutes of game time the declared curve gives, from nothing to that level:

    level      10     14     16     20     22     25     26     30
    minutes    60    ~100    126    187    224    291    316    437

Print, per route you wrote, the level it reached and the game-minutes it took, and stand them
beside the row above as a ratio. `npm run floors` does not read your module — it reads the
shipped `floors/` — so take the minutes off
`npm run probe -- <your corpus> --record <test id>`, where `time` is in milliseconds.

A route that lands near its row is fishing balanced. One well under it is a water paying more
than the curve asks, and one well over is a water paying less — **say which, and do not fix it
here.** This module changes no number in the world.

## Done means

`npm run oracle -- --at <your corpus>` green with `fishing-floor` in it, every route in it
walking, and a report giving the minutes and the ratio per route.
