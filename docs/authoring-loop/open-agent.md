# What is still wrong that an agent can take

The queue an autonomous lane picks from. Everything here is open; nothing here is
done. **A line is deleted the day it closes** — not struck through, not annotated,
deleted. Git holds the reasoning, and the commit that closes a line is where the
reasoning belongs. Nothing here records what has been decided: a ruling a later
agent could get wrong is a test, and a test is where they will meet it.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here is proved headlessly — `npm test`, `npm run probe`,
`npm run oracle`, `tsc --noEmit` — and the shape is already settled, so a lane can
take one to the end without asking. What waits on the owner's play, his reading of
the writing, or a ruling nobody has taken is in `open-human.md`.

**A GUI line is proved the way `CLAUDE.md` says and no further.** The decision goes
in a `.ts` beside the component and is tested there; the wiring is built, `tsc` and
the suite are run, and it is handed to the author in one line. A lane that cannot
find a pure decision under a GUI line says so rather than reaching for a screenshot
loop. Half of what is below is GUI, because it came out of a playtest.

**A line here that turns out to need his judgement does not stay here flagged — it
moves, carrying what you measured.** Guessing the ruling and abandoning the lane
are the two bad answers, and the second is worse, because the measurement dies with
the session. The `hand-over` skill states how a line crosses, in both directions,
and is the one place that rule is written.

---

## From the owner's second playtest, 2026-08-25

`.planning/yonatan-playtests/run-2026-08-25t14-51-24-926z-reviewed.md`, sixty turns
through Miki's route recorded through the playtest tool against `56a2dca7`. Every
line quotes what he wrote at the turn it happened. Four were measured against the
live loader while the run was read, and those carry the measurement — the run is the
evidence a line exists, and the measurement is the evidence about its cause.

### What the chat says, and when

So: talking with more than one thread open **offers the paths as a choice**, quest
threads ahead of the rest, each labelled in words rather than with its first spoken
line. The reproduction is a fresh game on this branch — talk, take *"I'd rather find my
own way"*, refuse again, leave by the window, come back — and today it says nothing and
draws a bare list labelled with each thread's opening line. `isThread`
(`src/content/sections/dialogue.ts`) is `when !== undefined || ask !== undefined`, so
every quest-given node is a thread including one the author wrote `always` on, and
fifteen of Miki's sixteen nodes are threads. **Do not take the one-line `isThread` fix
on its own:** it was measured, it makes Miki speak, and it strands the whole
`apologised` route, because `snubbed.miki.0` becomes an `otherwise` node and
`adrift.miki.0` is `sticky` on a flag that never goes false. `apology-route-full`
apologises before ever leaving the house, so the suite would not catch it — a proof
that walks out of the house and back is part of closing this.

### The fight

**Three siblings of the arming question are unasked, and they were measured while it was
answered.** All three are the same conflation one step over, all reachable only by a
directive, and none is reached by anything shipped today — which is why they are one line
rather than an emergency.

- **`use: location.<other-room>.<action>` still arms.** `armAction` passes a target only for
  `obj === 'entity'`, and `isElsewhere` cannot cover a room because location ids are not in
  `entitiesStood`. Same shape, different list to ask.
- **`standsAgain` and `fightLeftItsLocation` still ask `isStanding`**, so a fight or a
  repeating depleting action against an entity no room stands would stop, or fail to re-arm.
  Nothing reaches it today.
- **`actionVisible` throws before `whyRefused` runs**, so an action `hidden if:` from the far
  room raises `action hidden: …` instead of being refused in the player's own words. Two of
  the 82 corpus doors hit this, and the sweep that found them skips them honestly rather than
  asserting on the raise.

*Closes when:* each is either asked the same way the entity question now is, or written down
as differing with its reason. **The third is the one to think about first** — it is the
`hidden if:` rule and the refusal rule meeting, and which of them owns that moment is a
design answer rather than a patch.

## The command four test comments tell you to regenerate a sheet with does not exist

`content/first-steps.dsl` and `content/tulsa.dsl` carry four comments reading
*"Regenerate with /create-valid-test when this route's content changes on purpose"*,
over the `expect only:` sheets on `miki-route-full`, `thieving-route-full`,
`apology-route-full` and `dresser-trinket`. There is no such command: nothing under
`.claude/skills/`, nothing under `~/.claude/commands/`, nothing in `package.json`.

So a recorded sheet is unmaintainable by anything but hand-editing, and those sheets
pin the clock, the rng cursor, the visit counts and every holding. This was hit on
2026-08-25 while pricing a split of `leave-tutorial-island` out of `first-steps`: the
split needed three sheets re-recorded, no tool could do it, and the split was dropped
for that reason among others.

Nothing in the repo can dump one either. `/state` prints a status view, not a save;
`npm run probe --test <id>` reports PASSED/FAILED and nothing else.

*Closes when:* running a `# test` can print the state it ends on as a `# save` body,
and the four comments name the thing that actually does it. The pieces are already
there — `runTest` in `src/runtime/session.ts` leaves the state, and `src/runtime/save.ts`
serializes one — so this is a script and its test, not a design.

## npm run review needs to work in chunks
the command should give the first 20 sections that need review. Optional way to indicate that all of those 20 have been reviewed. 

---

## From the owner's rulings on `open-human.md`, 2026-08-26

Each line below crossed from `open-human.md` carrying what had already been measured
for it. The ruling is quoted; the measurement under it is what the lane that raised it
found, and is not re-derived.

### A test may not assert a balance number

Ruled: *"balance should not be hard coded into tests. Balance is going to churn
massively and continuously over the course of the project. Making any small change in
balance should not redden the suite. The suite should test that the functionality
works, not that the numbers make sense."*

This is the largest of the rulings and it gates the two under it, because both are
balance edits that would otherwise redden recorded figures. Two lines that used to
stand in `open-human.md` were exactly this complaint wearing different clothes: *"every
recorded combat figure moves again"* when the player's swing width changes, and the rage
route closing at 19.8 of a 20 pool rather than on the cap. Under the ruling neither is a
question any more — the assert is wrong, not the number.

*Closes when:* every assertion in the suite that would break on a pure balance edit
either stops asserting the number or asserts the *shape* instead — that rage rises when
a blow lands, that it raises attack, that a cap bites, that two swings differ — and the
`# test` sheets in the corpus that pin damage totals move with them. The sweep is the
work: `grep` the suite for numeric asserts standing on `attack`, `health`, `damage`,
`xp`, `rage`, and for `expect only:` sheets holding combat figures. **Report the count
before editing** — if it is large, this becomes its own commit before the two below land.

### The rat, the player and the first fight get their numbers

Ruled, verbatim: *"The rat needs to have 1-3 attack. Don't do anything fancy like
calculating its dps. The player at this point in the game should have 1 defense from
their defense skill. We also nerf the rat's health to 3, and the player's attack to 1-2
from their attack skill."* And, on the player's swing: *"the player's attack should be
low, maybe 1-3 damage per hit."*

So: `giant-rat` declares `attack 1-3` and `health 3`; the shipped player's defence comes
to **1** off the defence skill and the attack to **1-2** off the attack skill. The lane
that wrote `attack 6-8` did so because `damage: my attack vs their defense` subtracts
and `hitDamage` floors at `max(1, min(minDamage, attack))` — with defence at 1 rather
than 5, an authored `1-3` no longer collapses to a constant, which is what makes the
ruling coherent. Take the numbers as written and do not re-derive them.

*Closes when:* the declarations say those numbers, the balance sweep above has landed so
nothing reddens on the figures, and a `npm run probe --test` of the first fight still
passes on shape.

### A sale may pay for itself when the pack is full

Ruled: *"Yes, it should be possible to sell an item with a full inventory. The coins take
up the slot that was just emptied by the sale."*

`sellProblem` checks there is room for the coin **before** anything leaves the pack, so a
player with a full pack and no coin cannot sell — including selling the very thing that
would free the row. `pack.test.ts:182` pins the current order.

*Closes when:* the coin check happens after the sold item leaves rather than before, the
pinned test moves with it, and a test covers the exact case ruled on — full pack, no
coin, sell one thing, coin lands in the row it vacated.

### One function answers what a stat is made of, on every surface

Ruled, and it is a rule about the whole architecture rather than about `/state`: *"This
is a parity violation. The engine exposes a single function which answers the detailed
information regarding a stat. As in, it spawns the modal showing the detailed information
on all the pieces that compose a stat. This is true for all surfaces. The GUI simply
renders modals differently than the harness. But the two expose the same methods to
interact with the same information."* And again on the same subject: *"The separate
surfaces (REPL, GUI, playbot etc) are all rendering systems. They get all information
through the runtime. This should be enforced. If something spawns a modal, it should
spawn it everywhere."*

Measured: `amounts` and `madeOf` — the words for what makes a number — live in `src/ui`,
so `scripts/lib/replLines.ts` draws nothing beside a stat and only the app shows the
shares. The view-parity harness passes anyway because no driver draws `stats[].from[]`
during its run; the app draws it only behind a press the harness never makes.

Two things close this and the second is the bigger one. First, those two functions move
down into runtime and both surfaces read them. Second, **the harness must stop passing
when a surface is missing a screen the runtime offers** — a modal the runtime can open is
one every surface must be able to open, and today nothing proves it.

*Closes when:* the stat breakdown is a runtime function both surfaces call, and there is
a derived claim — one that finds its own subjects, not a list — that every modal the
runtime can raise is reachable on every surface. Cost noted by the lane that left it:
`/state` was costed at about 620 tokens over ten playbot turns, and a per-stat breakdown
inflates that; drawing it behind a command rather than in the status view is the obvious
answer and is a lane decision.

### An offer under its owner's name does not repeat the name

Ruled: *"No. Talk to Miki should be renamed to Talk."*

A terminal reads `Miki: Talk to Miki` and the app draws it in a cell already headed
*Miki*. `engine.shop.label` has the same shape — `Sunny: Trade with Sunny` — and **one
ruling covers both**, because the lane deliberately left them alike.

The cost is known and is part of the work: the English value drops `{entity}`, and
`unsuppliedParameters` derives the parameters a translation may use **from the English**,
so no other language could name the entity any more. `locale.test.ts:83` uses that very
key as its worked example and moves with it.

*Closes when:* both labels read `Talk` and `Trade`, the locale test names a different
worked example, and whatever `unsuppliedParameters` now says about those two keys is
what the test asserts.

### A quest's standing is coloured lettering, not a fill

Ruled: *"The title text should be colored, not the background."*

It is built as a fill today — a colour wash with a coloured edge on the row. The words
beside it are *Not started* / *Under way* / *Done* and the colours are `#e5e7eb`,
`#fbbf24`, `#34d399`, all in `content/core.dsl`.

The lane drew the fill deliberately, reasoning that colour carries voice on the text
channel and group on the fill. That reasoning is overruled; take the ruling.

*Closes when:* the journal draws the title in the standing's colour and no row fill, and
whatever pure decision sits beside the component says which colour a standing takes.

### Three stat tabs

Ruled, verbatim: *"Three tabs. Combat: Everything related to fighting. Skilling:
Everything related not fighting. Other: Rage (Reason is that a player may not use rage at
all, it should not clutter their sheet)"*

A stat's tab is its own `# group`, so this is one `group:` line per stat in
`content/core.dsl` and `content/combat-expansion.dsl`, plus renaming the three groups.
Exactly one `# group` must stand `standard for: stat`, and that is Combat.

Membership follows the ruling's own rule rather than a list: fighting stats to Combat,
the rage triple (Max Rage, Rage Drain, and anything else reading rage) to Other,
everything else to Skilling.

*Closes when:* the three groups exist with those names, every stat names one, and the
claim that proves it derives its subjects from the stat list rather than enumerating
them.

### Dialogue types, and a line waits to be acknowledged

Ruled: *"Typewriter is better. As in, one character at a time and a rate of 20 characters
per second. That is a guess, but a relatively quick rate is what we want. But we are
going to go further. Sequential dialogue lines require a continue acknowledgement to show
up."*

So `src/ui/reveal.ts` changes from a per-line fade to a per-character reveal at **20
characters per second**, and a second line does not begin until the player acknowledges
the one before it. The player preference *Paced dialogue* stays; what it switches is now
the typewriter and the acknowledgement together.

The lane that built the fade chose it over a typewriter because chopping a `Localized`
mid-character felt wrong and nothing in the engine stops it. That concern is real and is
part of the work rather than a reason not to: the reveal must cut the **rendered string**,
not the `Localized`, and the pure decision beside the component is where the cut is
computed and tested.

*Closes when:* it types at 20 cps, a following line waits on an acknowledgement, the cut
is tested on a rendered string in a `.ts` beside the component, and the three tunables
that are no longer meaningful are gone rather than left unread.
