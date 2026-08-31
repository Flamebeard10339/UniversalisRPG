# What is still wrong that needs Yonatan

The queue nobody else can take. Everything here is open; nothing here is done. **A
line is deleted the day it closes** — not struck through, not annotated, deleted.
Git holds the reasoning, and the commit that closes a line is where the reasoning
belongs. Nothing here records what has been decided: a ruling a later agent could
get wrong is a test, or a line in `CLAUDE.md` if it is a rule about the work rather
than about the game.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here waits on the owner: his play, his reading of the writing, or a
ruling nobody else can take. **Under each line is one italic clause saying what
would move it into `open-agent.md`** — the decision that is missing, named, and
`npm run handoff` reports a line that carries none. A line whose clause would have to
read *nothing moves it, and no work hangs off it* is not an open line at all: it is
either a ruling, which goes to a test, or an observation, which belongs in git. It is
deleted. A line that arrives here from `open-agent.md`, because a lane got into it and
hit a judgement that is his, carries that same clause written out of what the lane had
already measured. The `hand-over` skill states when a line crosses, in both
directions.

---

## Whether the view may declare two paths aliases of one fact

Held open for a conversation the owner asked for: *"I'm not convinced we need aliases
in the first place. This needs a discussion. What are the pros and cons. What is the
shape either path will take."* The discussion was had on 2026-08-25 and its substance
is below, so it is not re-derived; what is left is the choice.

**What is broken.** The view-parity harness proves every string the engine puts in a
view actually reaches a player on all three surfaces. It works by counting words, so
when two paths carry the same word at the same moment neither is ever proved.
Measured at `/look` in the Guide House: `choices[].detail` and `entities[].title`
hold *identical* word sets, so mutating `formatChoices` in `scripts/lib/replLines.ts`
to drop `choice.detail` entirely **passes the suite**.

**Shape A — the view declares its aliases.** A declaration saying these paths are
several names for one fact, after which the cheap rule (*a shared word must be drawn
once per bearing path*) applies to everything else. Measured: the rule kills the
mutant and raises exactly three false alarms — `location.title`, `planes[].name`,
`action.label` — and all three are exactly the alias groups, so they look declarable.
*Against it:* the declaration is a hand-kept list of what counts as one fact, which is
the failure mode `CLAUDE.md` opens by naming. A new alias fails the harness until
someone adds it; a path that stops being an alias keeps its exemption silently.

**Shape B — every driver reports its text keyed by the subject it hangs off.** Then
aliasing falls out rather than being declared: same subject, same fact. Nothing is
kept in sync. *Against it:* it is a change to all three drivers rather than to the
harness, and it is the expensive path.

**There is no shape C.** The obvious *"then stop carrying three names for one place"*
does not exist: `location.title`, `discovered[].title` and `locations[].title` are
three different **lists** that legitimately mention the same place, not three
redundant paths to one field. Collapsing them is not available, and that was checked
— a per-line unit gives the same answer, because those two share a chunk for exactly
the reason they share a word.

**The recommendation on file: neither, yet.** What was actually at risk is one mutant
in a test harness, and that specific hole — `choice.detail` going missing unnoticed —
is now shut: `scripts/lib/replLines.test.ts` holds every choice the shipped opening
view gives an owner to saying it, and the mutation it was written against was made and
watched to fail. So only the general question stands here. Shape A buys it at the price
of the one thing this repo spends 11.5% of its commits undoing. Shape B is what the
repo's own doctrine selects and should be taken the next time a driver is open for
another reason, not on its own account.

**Measured again on 2026-08-26, and the hole is wider than one mutant.** A lane
rebuilding the shop found that `stats[].from[].title` carries
`["Base","Attack","Elf","Health", ...]` — every word of which is also held by
`stats[].title` or `player.race.title`. So `drawnHere` never proves that path for
**any** driver and `driftingPaths` filters it as "drawn by none". The terminal was
missing a whole screen and the harness was structurally incapable of noticing.

What the lane did about it is a third option this line did not have. Rather than
declaring aliases or rekeying every driver, it added a claim beside the
word-counting one: the walk opens all nine screens and compares what it opened
against `MODAL_NAMES` **read off the engine**. That is a reachability claim, not a
word claim — it asks whether a surface can get to a screen at all, which is the
question the word counter cannot ask. It was verified by reinstating the
terminal's gap and watching it fail. Cost: each driver now walks once, memoized,
so the larger script runs faster than the old one (2.9s against 3.7s).

That does not answer this line, but it changes what is left of it. Reachability
is now covered; what is still unproved is whether the *words* on a reached screen
are the right ones when two paths share them.

*Moves when: the owner picks a shape, or accepts the recommendation and this line is
deleted, with the commit that deletes it naming the blind spot and naming B as its
answer if it ever matters.*

## Whether Market Square should read as crowded or as legible

It carries twelve entities and eight roads. That is what "alive" costs at the busiest room in
the game, and it is the room every road in town runs through by design.

The travel half is capped — the sheet now stops at one step out and the rest is on the map —
but nothing caps the entity list, and nobody has decided whether it should. A square you can
read at a glance and a square that feels like a market are not obviously the same screen.

His word on 2026-08-30: it wants thinning, and the thinning happens in another pass over the
map once the quests are roughly finished. So the answer is known and the timing is not, and
the lever is still which entities stand there rather than a number in the engine.

*Moves when: the map pass he named is opened — not before, and not by a lane deciding on its
own that the quests are finished enough. He says when.*

## The tutorial now ends holding fifty-six shrimp

Miki's unlock asks for what he always meant to ask for — reach a second level in any skill
— now that the condition grammar can say it. Walked: fishing pays 18 xp a shrimp against
1000 for the first level, so the route takes **56 catches and 147 seconds of game time**,
and the apology route ends with 56 raw shrimp in the pack.

It walks fine and fast, and nothing is broken. But a tutorial beat that hands a player
fifty-six of one item is a shape someone should look at, and there are three different
answers — the first level is expensive for a tutorial, or netting is cheap, or Miki should
be asking on a route where the rats are already levelling attack.

*Moves on which of the three it is. `npm run simulate-activity` is where the answer is read rather
than reckoned, and any one of the three is a lane's afternoon once picked; a lane cannot
pick, because the choice is about what the tutorial is teaching.*
