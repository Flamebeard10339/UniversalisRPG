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

## Oolga's cellar rats are counted rather than protected

Ruling on 2026-08-30: there are no hard failure states in this game, only alternate paths.
*Kill it with Fire* completes when the player does what Oolga asked; **how** they did it
picks the dialogue and the reward. Her one condition — clear the cellar and leave every rat
breathing — is not a fail gate, it is a branch.

The shape he named: the cellar's rats carry an id of their own, with the same title as
`tulsa.feral-rat`, and the quest counts kills of that id. Zero kills is the clean path and
she says so; anything above zero is the other path, and she says that instead and pays
differently.

Measured on 2026-08-29 and still true: the route that walks the quest end to end kills four
of them — the melee action takes whatever in the room is aggressive, and the cellar's four
feral rats are aggressive — and it ends holding eight rat pelts, after which she
congratulates the player for not killing one.

*Closes when:* the cellar holds its own rat id, both branches of her closing are written,
and a route walks each — one that kills none and one that kills some — with the reward
differing between them. If nothing in the language counts kills of an id, that is the
finding and it is measured before anything is invented.

## Two quests may want one NPC at once, and one of them takes her whole conversation

Ruling on 2026-08-30, in two parts.

The narrow part: Kelsa's own `blunt` node in `tulsa` — the one that says *if you are here
about the bees, say so* — is a preamble to the quest and is **meant** to be replaced by it.
It comes out of `tulsa` and the quest owns it. The corpus route
`tulsa.kelsa-takes-the-answer-she-asks-for` walked that node, so it is rewritten with the
reasoning in the commit: a route may be rewritten because a quest superseded the path it
walked, and this is the first time that has been ruled.

The wide part was **already true, and the line that said otherwise was wrong.** Two quests
each opening a stage on one entity both stand, both are reachable, in either load order —
built and walked on 2026-08-30. Miki already carries two quest threads at once in the shipped
corpus, and breaking it reddens six routes in `integration.test.ts`. What gives way to a quest
line is only the `always` fallback, which is what `always` means; an entity's own `ask:` and
`when:` threads have always stood beside one. So the narrow part is not a workaround for a
limitation, it is the ruling about where a preamble belongs — and a preamble that must survive
a quest opening is written as a thread rather than as `always`.

Two of the four earlier measurements do not survive either. `when: kelsa.the-third-hive.visits
>= 1` **does** read true once the node is entered, bare or module-qualified, including entry by
a `->` choice's `goto`; only `dialogue.kelsa.hive.visits` is refused, and it is refused at load
with the node named. Whatever failed in the corpus was local to it.

**The real defect was next to it and is fixed.** A quest names the node it hands over
`<quest>.<stage>.<entity>.<n>.said`, so two quests on one entity differ only in the first
segment, and every tail short enough to drop the quest fitted both — `choose:` took the first
match silently. That recording passes in English and takes the *other* thread under
`translationSurvival`, which is the failure that was originally read as a takeover. `choose:`
now refuses a tail that fits more than one thread and names both, mirroring `Namespace.resolve`;
`spellings` in `dialogue-runtime.ts` was a second copy of `namesSection` and is gone.

*Closes when:* Kelsa's preamble lives in `birds-and-the-bees` and `tulsa`'s route is rewritten
to match. The engine half is done and its proof home was already taken.

## A section written over another module's belongs to the module that wrote it

Ruling on 2026-08-30: the id rule is a **defect**, not the design. All of a quest's flags
are named inside the quest. Loading `tulsa` alone must read as if no quest touches it —
strangely empty, with no hint of one. An entity or item leaves a quest module only when a
*second* module needs it, and then it goes to the shared module both use. Tulsa is not a
dummy: it is the skilling location, and skilling tasks genuinely belong there. If it reads
bare, that is a real measurement — there are not enough skilling tasks in the city — and
not a reason to push quest furniture into it.

**Half of it landed on 2026-08-30 and this is the other half.** A **whole section** written
at another module's address now belongs to whoever wrote it: the address stays as written, so
`tulsa.mire` is still `tulsa.mire` to everything that names it, but the owner is the writing
module, and print-back sends the body home to the file that declared it. A
`# dialogue tulsa.guard-points` written from `the-swampy-menace`, owned by `tulsa.castle-guard`
and gated on that quest's own stage, loads clean and round-trips clean into
`the-swampy-menace.dsl`. `src/content/resolve.test.ts` holds the proof.

**The other half is the printer, and it is not the `+` line — it is the merged list.** A
location's `entities:` prints under whichever module **declares the location**, so tulsa's
serialization names ids tulsa cannot see, however the entity was contributed. Three lanes hit
it independently on 2026-08-30 and the third pinned it, having tried every shape:

| what was tried | what the round trip said |
|---|---|
| `+entities: 4 cellar-rat`, rat declared in the quest | `tulsa … names kill-it-with-fire.cellar-rat, but kill-it-with-fire is not this module or one of its dependencies` |
| the whole `# location tulsa.oolga-basement` body restated from the quest | identical |
| `# entity tulsa.cellar-rat` declared from the quest — the shape the ownership half fixed | `tulsa … names an unknown entity: tulsa.cellar-rat` |

So the ownership half does not half-help here; it does not help at all, and the third row is it
working exactly as advertised and failing for that very reason. The same fold was measured on
`the-bars-crawl` — moving `raw-blowfish` and `blowfish-hole` out and naming them from
`+entities:` loads clean and fails the round trip — and keeping the id as `tulsa.blowfish-hole`
while the body lives in the quest's file does not dodge it either, because visibility follows
the owner rather than the address prefix.

**No quest module in the corpus puts its own entity into a tulsa room, because the engine
forbids it.** `attention-to-detail`, `the-bars-crawl` and `the-swampy-menace` each dodge it the
same way — `tulsa.reporter`, `tulsa.blowfish-hole`, `tulsa.rat-toad` — and that dodge is the
whole of why the list below exists. The fix is one sentence: **a foreign contribution to a body
should print back as a patch under the contributing module rather than folded into the owner's.**

So the migration is blocked, and this is what it moves the day it is not — out of
`content/tulsa.dsl`, each carrying the comment above it that says it is tulsa's *because* a
tulsa section may name nothing but tulsa's:

| section | line | goes to | reaches tulsa through |
|---|---|---|---|
| `# item smiths-notes` | 697 | `a-grand-blade` | `# entity tulsa.anvil` `give: 1 smiths-notes` |
| `# entity reporter` | 703 | `attention-to-detail` | `# location tulsa.market-row` `+entities:` |
| `# flag overheard-the-captain` | 51 | `attention-to-detail` | `# location tulsa.market-rooftops` |
| `# entity rat-toad` | 1337 | `the-swampy-menace` | `# location tulsa.swamp-mire` `+entities:` |
| `# flag oolga-struck` | 47 | `the-swampy-menace` | `# entity tulsa.oolga` |
| `# flag herbs-collected` | 49 | `the-swampy-menace` | `# entity tulsa.herb-patch` |
| `# item raw-blowfish` | 1350 | `the-bars-crawl` | `# location tulsa.deep-water` via the hole |
| `# entity blowfish-hole` | 1355 | `the-bars-crawl` | same |

Three flags stay put and are genuinely tulsa's under the ruling, because a second module needs
each: `corners-slathered`, `wurm-defeated`, `sewer-toll-paid`. `ball-of-a-boy`'s two patches
have nothing parked in tulsa to bring home.

**A third thing waits on the same half, and its fix is already measured.** `# entity
tulsa.herb-patch` in `the-swampy-menace.dsl` writes the same nine-line *count the herb and
narrate the find* block three times, once per herb — one-home shape 5 inside `content/`. Finds
1 and 2 are byte-identical across all three; find 3 differs by one noun. The corpus already
owns the idiom for saying it once: a `# droptable` is a named result list whose body runs in
full, and `fishing.spend-bait` says so in its own comment. Both placements were built and both
fail the round trip for this line's reason — a table declared in `the-swampy-menace` is refused
because tulsa cannot depend on it, and a `# droptable tulsa.herb-find` declared *from* that
file loads and resolves but does not survive printing, since the herb-patch override folds back
into tulsa's file and tulsa then names a table it cannot see. The one placement that
round-trips green is the table living in `tulsa.dsl` — which is quest furniture pushed into
tulsa, exactly what the ruling above refuses, and `herbs-collected` is already on the list of
things coming *out*. So it waits.

*Once the patch half lands:* the table goes to `the-swampy-menace`, each of the three actions
keeps only its own `time:`, `give:` and `say:` with the block replaced by one `roll:`, and a
fourth herb is five lines in the quest and nothing in the table. That last part needs find 3's
one herb-specific noun rewritten to name no herb, which is a line of prose to draft rather than
a decision to take.

*Closes when:* the registry keeps each module's own contribution at an address rather than only
the merge, so a patch body prints back into the module that wrote it; then the eight sections
above move, and the three `@@@` guards in `the-swampy-menace.dsl` are written as the guards
they wanted to be. That is registry, merge and printer together — larger than the ownership
half, which is why it was not half-landed alongside it.

## A fishing water is never used up, and fishing must not drift from combat

Ruling on 2026-08-30: **water cannot be depleted.** Engine changes are bypassed for now by
giving a water an instant respawn, so nothing is ever felled. And the load-bearing half:
fishing must not drift from combat, because that is a one-home violation — *"fishing should
be just like `# action melee-combat`, just for fishing."*

What stands in the way, measured: `src/grammar/action.ts:315` refuses a side-naming action
that declares no `depletes:`, so `accuracy: my fishing vs their depth` is rejected at load.
Adding `depletes:` loads, and a measured minute of netting then recorded the shoal felled by
the first fish and not coming back — which the instant respawn answers — plus
`combat.attack: 2` banked per landed cast, which it does not. That second one is what
`content/fishing.dsl`'s own header exists to refuse, and it could not be scoped away:
`damage-dealt` takes no `resource:` and the arity check refuses one.

Four duplicated casts are what not having this costs: one action per water.

*Closes when:* the four casts are one action over four waters, no water is ever felled, and
no cast trains an arm. If the last of those cannot be had without touching the grammar, the
lane says so with the measurement rather than shipping a cast that pays combat xp — the
ruling bypasses engine work, it does not license the leak.

## Miki offers another net to a player who has none

Ruling on 2026-08-30: **no exemptions** — the lent net is a regular net and parts like one.
Miki simply offers another when the player is holding none.

What is wrong today: `on line-parted:` takes the tackle when `line-health` empties, and
Miki's `again:` line — the one a player gets on every talk after the offer — points at the
net already in their pack. A player whose net has parted is told to use a thing they no
longer hold. Remote rather than theoretical: the shrimp shoal drains 1 line-health per miss
against the 6 the small net grants, so it takes a run of misses; the window is still an exit,
so it is a false line rather than a softlock.

*Closes when:* Miki's `again:` branches on whether the player holds a net and hands over
another when they do not, and a route parts the net and takes the replacement.

## Nobody has established that editing while playing is cheaper than reporting and fixing

The premise of handing a playbot the authoring vocabulary is that a bot editing in situ beats a
bot reporting and an agent fixing. It is a real hunch and it is not measured, and the arms it is
usually stated as — *fleet* against *global agent* — do not isolate it, because they differ in two
things at once: **who found the gap** and **who wrote the DSL**.

What is already known cuts across it. Where the edit is a fact about the world you are standing in
and the kind is schema-driven, editing in situ plainly wins, and `/place` and `/link` are that case
working today.

**Three runs have now been made, and what they cost is here so the sweep does not re-measure it.**
All against a copy of `content/`, one bot, default effort, on 2026-08-29:

| run | mode | turns asked | turns played | wall | out tokens | cache read | cache write | edits |
|---|---|---|---|---|---|---|---|---|
| smoke | reader | 3 | 3 | 20.4s | 715 | 19,371 | 8,352 | — |
| first-steps | bughunter | 60 | 44 | 366.4s | 21,735 | 621,666 | 127,284 | **0** |
| ball-of-a-boy | briefed | 100 | 60 | 831.6s | 47,994 | 872,887 | 385,764 | 5 |
| ball-of-a-boy, every argument landing | briefed | 120 | **120** | 1,147.9s | 70,739 | 1,933,201 | 809,546 | **0** |

So a turn costs about **7 seconds when the bot is walking and about 14 when it is writing** — the
staging turn alone produced 4,695 output tokens, where a walking turn produces about 300. The
prompt is written once and read every turn, which is why cache read runs an order of magnitude
above everything else and why prompt size is close to free after turn one.

**The one run that did finish spent 83 of its 120 turns reading.** 73 `/source` and 10 `/grammar`
against 11 talks, 11 modal answers, 8 uses and 3 travels — and **no edit at all**. It is the arm
with the most information and the best tools: the full brief, opened on `tulsa.in-town` in finished
content, every argument delivered. The truncated one-paragraph brief, by contrast, staged a
four-stage quest at turn 39. More to read made it write less, and that is the finding.

**Neither of the two earlier long runs finished, and neither stopped for a reason about the game.** The
bughunter stopped on a note field that spelled emptiness rather than being empty; the briefed run
stopped on four `/dsl` refusals it could not read. Both are closed or queued. **Until a run ends
because it finished, none of these numbers is a cost-to-complete** — they are a cost-to-die, and
the sweep needs the first.

*Closes when:* the sweep is run as three arms over one brief — report-only bot then coding agent,
editing bot alone, coding agent alone — and the report says what each cost and what each landed.
Isolation is a copy of `content/` per bot and a local file of its own, and nothing commits, so the
one-writer rule has nothing to bite on.

## N bots hitting one edge case would file N near-identical proofs

`runAsSections` turns a run into a `# test`, which is what makes a fan-out cheap to keep.
It is also this repository's worst failure mode pointed at its own suite: three harnesses
replay every corpus `# test`, `npm run review` walks them, and the first item in this file
already says the suite holds duplicate proofs. A sweep that files every bot's run adds to
that by construction.

`npm run mutate` cannot be the gate — it writes a break into the working tree, so it may not
run in a checkout anyone else is in, and it costs a suite run per line.

*Closes when:* the merge step over N staged local-changes files is written with a stated
rule that at most one route is kept per end that was not reachable before, and the rest are
read and discarded. Two staged sections at one id are k candidate implementations and the
diffs are the argument; two staged sections at different ids for one gap is the one-home
call, and the only judgement the loop owes a human.

## What the two arms cost, and what each landed

Both arms ran the same brief over the same world on 2026-08-29. The playbot is Sonnet 5 at
`effort: low`.

| arm | wall | tokens | cost | quest |
|---|---|---|---|---|
| playbot, `--mode briefed`, 117 turns | 24.0 min | 95,208 out; 1.92M cache read; 732K cache write | **$3.17** | **none** — 4 edits typed, 4 refused, nothing staged |
| a cold coding agent, same brief, no playbot | 17.2 min | 232,423 total | **~$0.65** | **all five beats**, walked by a corpus `# test` |

The playbot spent **74 of its 117 turns reading** (61 `/source` applied, 13 refused) and reached its
first edit at **turn 107 of 120**. The cold agent read the same world off disk and wrote the file.

So: **five times the money, forty percent more wall time, and nothing shipped.** Per turn the
playbot is cheap — 2.7 cents — and per completed task it has no figure at all, because it has never
completed one.

**This does not settle the premise, and the two reasons it did not have both been closed since.** The
final run failed on a missing diagnostic, not on the bot's judgement or its grasp of the language: it
had read the corpus, found the right id, chosen the right stage, and written a body whose only
visible defect was whitespace. A staged edit that will not load now says what the loader said — the
line it stopped on and what may stand there instead. What is measured here is a loop with one broken
link, not a bot that cannot author.

**The reading both arms did was also being forced, and that is the second.** Every id list the oracle
and the grammar panel offered was cut off at 24. An author standing in a hole saw 24 of 86 entities,
24 of 220 flags and 24 of 112 items — not one flag in `tulsa`, which is the town both arms were
writing in, and not one `core` item, so neither `core.coin` nor `core.bread` could be found without
opening the corpus. The lists are written whole now, which is why a quest can be authored against
`npm run oracle` alone.

*Closes when:* this run is repeated against the world as it now stands. If the bot then lands a
quest, these numbers are the before. If it still does not, the premise is answered and the playbot
is a reporter — which is worth having: the two `first-steps` repairs that landed this session both
came out of playbot reports, and no agent reading the corpus had found either.

## Three of the ten quest notes still have no module, and what one costs is measured

Plague Matters, Reverse Infiltration and The Rat Conspiracy. They are last because each
waits on another: The Rat Conspiracy on Birds and the Bees, Reverse Infiltration on that
and The Swampy Menace, Plague Matters on Reverse Infiltration. So they are written one
wave at a time, each merged before the next starts.

Five ran in parallel on 2026-08-30, one brief each, Sonnet 5, engine off limits:

| quest | wall | replies | out tok | cost | reaches for the engine |
|---|---|---|---|---|---|
| birds-and-the-bees | 16.3 min | 91 | 69,549 | $3.77 | 0 |
| attention-to-detail | 17.4 min | 126 | 82,829 | $4.64 | 0 |
| the-bars-crawl | 20.3 min | 120 | 92,014 | $4.31 | 0 |
| the-swampy-menace | 25.6 min | 154 | 120,603 | $6.97 | 0 |
| a-grand-blade | 22.7 min | 179 | 106,799 | $8.80 | 0 |
| | **25.6 min wall** | 670 | | **$28.49** | **0** |

**Not one of the five reached for the engine.** Every question all five had was answered
by `npm run oracle` or by the corpus, which is the first time that has been true — and it
is the measurement the harness exists to take.

The spread is the finding. a-grand-blade cost two and a half times birds-and-the-bees and
spent replies 59 through 124 hand-building throwaway `DEBUG` sections, all of it against
the stage-transition defect below.

*Closes when:* the three are written and merge with the suite green.

## A line that is nothing but a conditional fragment prints as a blank line

`{<condition>: <words>}` inside a `say:` is how one speech says different things on different
paths. Measured on 2026-08-30, writing Oolga's two closings: a line whose **whole** content is
one fragment renders as an **empty line** when the condition is false, rather than as nothing.
The speech comes out with a hole in it.

That run was the corpus's first use of fragments — there were none before it — so nothing had
met this. It was worked around by pairing the two acknowledgements on one line and the two
farewells on another, so that between them one always holds, and by hanging the one-sided
clause off a sentence said either way. That is a real technique and it is also the sort of
thing an author should be told rather than made to discover.

*Closes when:* a line left empty by its fragments is dropped rather than printed, or
`npm run oracle` says under the fragment entry that it will not be — derived from whatever the
printer actually does, so the page cannot drift from it.

## Nothing tells a player to wear the net, so the lent net can never part

Miki now offers another net to a player holding none, and a route walks it. But the thing that
takes the first one away cannot happen on the shipped path, measured on 2026-08-30: **a net
that is carried and not worn grants no `line-health` pool at all**, because `max-line-health`
comes from the tackle. Ten game-minutes and 248 catches leave no pool in the save.
`apology-route-full` never equips the net and nothing in the tutorial says to.

So the repair is right and its trigger is unreachable. The tutorial teaches netting without
teaching that tackle is worn, which is also why the false line survived long enough to be
found by reading rather than by playing.

*Closes when:* the tutorial says that a net is worn — a line of Miki's, most likely, since he
is the one handing it over — and a route equips it, so the path a player is actually taught is
the path the module proves.

## A negative weight in a `one of:` fires no branch at all

Found on 2026-08-30 while measuring how long a net takes to part: an item granting `-1000
fishing` produced 300 casts with **no catch, no experience and no drain** — neither branch of
the roll appeared to fire, rather than the roll settling on the other one.

The input was invented rather than found in the corpus, so nothing ships in this state and it
costs nobody anything today. It is here because a roll that silently does nothing is the
shape a later author would lose an afternoon to, and because the language refuses malformed
input everywhere else.

*Closes when:* a weight the roll cannot use is refused at load with the line named, or the
roll settles on a branch — either is fine, and the first is the language's usual answer.
