# Fishing: carry the floor from 20 up to 30

There is a floor module already and it is not in the world you are reading, because it lives
beside the corpus rather than in it. **Write it out again exactly as it stands below, and then
add one route to the end of it.** Change nothing in the three that are already there — they
walk, and their minutes are recorded.

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

## The one route to add: `top-floor-to-30`

`run: kitted-floor-to-20`, then climb to 30 through the water this expansion added, because
that water has never been walked — only its ceiling has been read. Roughly:

- Sell up and buy the greenheart band off the tackle stall on Market Row: the greenheart rod at
  level 25, and whatever line and bait the waters above want. Selling sturgeon is how it is
  paid for.
- The sturgeon hole at `tulsa.the-narrows` opens at 16 and is the best rod water until 22.
- The tench hole is in `tulsa.swamp-mire` at 22 and takes **bread paste**, not dried fish bait.
- `fishing.the-mere` is past the Narrows: perch at 24, carp at 26.
- Close on `assert: level.fishing >= 30`.

## The five things that will otherwise eat the run

1. **`tulsa.swamp-mire` fights back.** `tulsa.bog-lurker` jumps a player standing there before
   any cast is armed. Put `use: core.melee-combat on tulsa.bog-lurker until done` before the
   cast, every time the route arrives there.
2. **Never buy one at a time in a loop.** `until 150 times: submit-modal: item=buy:<x>` is a
   hard error the moment the shelf is bare. Buy by count:
   `submit-modal: item=more:buy:<x>` then `submit-modal: count=100`.
3. **`use: <cast> until done` never ends** — `cast` is `continuous`. Drive it with a condition,
   and always give it an escape for running out of bait:
   `until level.fishing >= 26 or not has fishing.bread-paste`.
4. **`travel:` is one hop** and refuses the room it is already in, so a loop body has to be a
   walk that is legal from where it starts and from wherever anything throws the player.
5. **Bait is spent per cast.** A loop that fishes an hour and buys no more stops when the tin
   is empty. The stall restocks a unit every five seconds, so a trip back is worth taking.

## Balance is not yours to change here

**Write no number into `content/fishing.dsl` — it is not your file and this run may not edit
it.** A route asserts the level it reached and nothing else: no experience, no coin, no time, no
drop count. If the climb reads slow or fast, that is the finding, and you report it rather than
fixing it.

Minutes the declared curve gives, from nothing to that level:

    level      20     22     25     26     30
    minutes    187    224    291    316    437

## Done means

`npm run oracle -- --at <your corpus>` green with `fishing-floor` in it and all four routes
walking, and a report giving `top-floor-to-30`'s game-minutes against the 437 above. Take the
minutes off `npm run probe -- <your corpus> --record top-floor-to-30`, where `time` is in
milliseconds. Three routes walking and an honest account beats four with a guess in it.
