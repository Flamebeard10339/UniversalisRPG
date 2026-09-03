# Fishing: cleanup and balance pass

`content/fishing.dsl` was written on 2026-09-03 from `.planning/fishing-expansion.md`, which is
the design doc and still stands — read it for what anything is *for*. This brief is the second
pass over what that run produced. **Read `content/fishing.dsl` before changing a line of it.**

This is not a pass for new content. Everything the design doc asked for is written. What is
left is four broken routes, a balance measurement that was never taken, and a read-through.

## The four routes that do not walk, already diagnosed

The engine was traced on each of these, so **do not re-derive them and do not go looking in
the engine**. Each fix below was tried and passed before this brief was written.

**1. `fishing-the-new-water-with-the-gear-for-it` — bog-lurkers, not the tench hole.**
The route stands in `tulsa.swamp-mire`, which is tulsa's swamp and has `tulsa.bog-lurker` in
it. The player is jumped before the cast is ever armed: the trace of the failing step shows
two lurkers killed and combat experience gained. It is not the tench hole's line, and no god
word fixes it — `instant-kill` still leaves the fight happening first.

The fix is one line in the route, before the cast:

    use: core.melee-combat on tulsa.bog-lurker until done

With that line the whole route walks end to end — tench, then the mere, then Old Slate — and
was watched doing it. Do the same for any other route you write that stands in the mire.

That the mire is contested water is a fact about the world rather than a fault, and the design
doc put the eel bed and the tench hole there on purpose. Leave it. It is worth one line of
prose somewhere that a man fishing the mire is not fishing it alone, if there is a natural
place for one.

**2. `old-slate-does-not-come-back-once-landed` — a misused `on failure:`.**
`# entity old-slate` gained this:

    on failure:
      say: Anything short of dressed silk goes before the fish does.

That reads as "the fish beat you", and the keyword does not mean that. The page is explicit:
`on failure:` runs **where the action is turned away before it begins** — a `requires:` that
does not hold, a thing that is not here, an input it has not got — and "a check inside the body
falling the wrong way is not this". So writing it made every refusal on that action run those
words instead of being refused, and the route exists to catch exactly that refusal.

**The word for a cast that misses is `on attempts exhausted:`**, and Old Slate already has one
saying the right thing. Delete the `on failure:` block. That alone makes the route pass; it was
checked. Then go through every other action you wrote and check the same mistake is not in it.

**3. `the-boy-at-the-narrows-is-taught-to-fish-in-the-open` — an engine limit, work around it.**
The `-> Here.` choice hands Rook a net with `take: 1 small-fishing-net`. `take:` of a plain item
id spends a **stack** or a **worn** copy and cannot reach a **rolled** copy sitting in the pack.
Every fishing net has an `item-level:`, so every net a player owns is rolled, and the choice is
therefore filtered out of the list with nothing said about why. `has small-fishing-net` is true
and `inventory.small-fishing-net >= 2` is true at the same moment — that is what makes it hard
to see. This is being written up as an engine question and is **not yours to fix.**

Write the beat with the form that does reach a rolled copy: `take: worn <slot>` — the player
gives Rook the net off their own hand, and puts the spare on afterwards. Keep the `(when
inventory.small-fishing-net >= 2)` on the choice, because needing a *spare* is the point of the
beat; the condition reads rolled copies correctly. The route then wants the player wearing one
net with another in the pack.

**4. `winning-the-pirn-off-a-pike-beats-fenn-fair` — a `choose:` with nothing to answer.**
The trace shows the `talk: weigh-master` step already doing the whole weigh-in: the pike gone,
The Pirn given, `fenn-beaten-honest` and `weighed-in` both set. An entity with **one** thread
open says it outright with no list to pick from, so the `choose: Weigh the pike.` after it has
nothing to choose. Drop the `choose:`, or give the weigh-in a second open thread if the choice
is meant to be a real one. Check every other weigh-in route for the same shape.

## Balance, which was never measured

The first run could not measure anything: `simulate-activity` had no way to be pointed at the
world an authoring run writes, so it read the shipped corpus and none of the new saves or
entities existed. **That is fixed. The flag is `--world`, and the tool list above prints it
with your own corpus already in it.** Use it on every call.

The design doc's balance section holds the marks. What is already confirmed, measured against
your predecessor's draft on the day this brief was written:

    the mere, --ideal, at the level the save stands on
      carp  5,760/h while it ran     (the doc asks 5,760)
      perch 5,280/h while it ran     (the doc asks 5,280)

So those two are right. Both runs stopped short of the window with *"You cannot do that yet"*
because the save's bait ran out about twenty minutes in — that is the save, not the water.

What is owed:

- A `# save` per new water standing at that water's own gate level with the tackle of its band
  worn **and enough bait to fish the whole hour** — the sweep gives every run sixty minutes of
  game time, and forty baits at four casts a minute is twenty of them.
- `npm run simulate-activity -- --world <your corpus> <save> --ideal --at <location>` for each,
  and the eel bed as well. Read the ceiling off the `while it ran` figure where a run stopped
  short, and off the plain rate where it did not.
- The measured table in your report beside the doc's table. A water more than about a tenth off
  its row has a number wrong; say which and fix it.
- The blowfish hole at the Deep Water will read about **42,000/h**. It is `the-bars-crawl`'s
  quest prop, it is known, it is not yours, and nothing is to be cut against it.

## A read-through, last

`npm run notes -- <your corpus>` lists every `@@@` in what was written. The design doc
pre-ruled three marks that must **not** stand — the buff-timer trap, the bailiff's rounds and
the dusk rise are all the intended shape rather than workarounds — so delete any of those three
you find. Anything else with a `@@@` on it, leave and say what it is in your report.

Then read the prose you inherited against the design doc's line on style: descriptive examines
with no opinion in them, grounded dialogue with a want leaking through it, and no story-book
narration. Fix what reads wrong on the spot rather than noting it.

## Done means

`npm run oracle -- --at <your corpus>` green — loads, round-trips, and **every** route walks,
the four above included — and a report holding the measured balance table.
