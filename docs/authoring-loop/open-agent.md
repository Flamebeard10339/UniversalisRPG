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
