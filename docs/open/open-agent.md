# What is still wrong that an agent can take

The queue an autonomous lane picks from. Everything here is open; nothing here is
done. **A line is deleted the day it closes** — not struck through, not annotated,
deleted. Git holds the reasoning, and the commit that closes a line is where the
reasoning belongs. Nothing here records what has been decided: a ruling a later
agent could get wrong is a test, and a test is where they will meet it.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

**A line about behaviour may hand its evidence over as a proof instead of a
paragraph** — a route in `open-tests.dsl`, or a `describe` in `open-tests.test.ts`,
named for the line and red until it closes. Then the line closes on the proof
passing and says nothing the proof already says. `npm run handoff` runs them, so
*does this still fail?* is answered rather than guessed. Neither file stands in this
folder today; whoever writes the first one writes the file with it.

Everything here is proved headlessly — `npm test`, `npm run probe`,
`npm run oracle`, `tsc --noEmit` — and the shape is already settled, so a lane can
take one to the end without asking. What waits on the owner's play, his reading of
the writing, or a ruling nobody has taken is in `open-human.md`.

**A GUI line is proved the way `CLAUDE.md` says and no further.** The decision goes
in a `.ts` beside the component and is tested there; the wiring is built, `tsc` and
the suite are run, and it is handed to the author in one line. A lane that cannot
find a pure decision under a GUI line says so rather than reaching for a screenshot
loop.

**A line here that turns out to need his judgement does not stay here flagged — it
moves, carrying what you measured.** Guessing the ruling and abandoning the lane
are the two bad answers, and the second is worse, because the measurement dies with
the session. The `hand-over` skill states how a line crosses, in both directions,
and is the one place that rule is written.

---

## Market Square is ruled legible, and still carries twelve entities

Ruled 2026-09-03: **legible**. The square holds twelve entities and eight roads, and it is
the room every road in town runs through by design, so it is the worst case for a screen a
player has to read at a glance. The travel half is already capped — the sheet stops at one
step out and the rest is on the map — and nothing caps the entity list.

The lever is which entities stand there, not a number in the engine, so this is authoring:
a brief that thins the square and says where each entity it moves now stands. Nothing may
simply be deleted — a townsman who was the market square's is somewhere else afterwards, or
the room he moved to is named.

*Closes when:* the square reads at a glance, every entity taken off it stands somewhere a
road reaches, and `walking-the-town` still walks.

## Cooking, smithing and crafting still hang off the town rather than writing onto it

Ruled 2026-09-03: **the thieving inversion is the pattern, not the exception**, and fishing
is its own module on the same terms. Fishing is already off tulsa's `skills:` line
(`content/tulsa.dsl:1101` names `core.woodcutting, combat.attack, combat.health,
cooking.cooking, smithing.smithing, crafting.crafting`), so what is left is the three that
are not.

The move is the one `content/thieving.dsl` already makes and is four-ish lines per module:
the skill's stat comes off tulsa's `skills:` line and goes back as a `+skills:` laid over
`# entity tulsa.player` from the skill's own file, the skill takes `? tulsa` in its
`dependencies:`, and every id tulsa names of that skill's becomes an addressed heading
written from the skill's side. The verification is thieving's: `npm run probe -- content
--off <skill>` loads clean and every one of tulsa's routes still passes, so the skill
strips out and leaves a town behind.

Two references are not the town's and are a separate call: `content/first-steps.dsl` hands
out `fishing.small-fishing-net` and casts at `entity.fishing.shrimp-shoal`, and
`content/the-bars-crawl.dsl:19` writes `uses: fishing.cast`. A quest naming a skill's id is
not the same shape as a town declaring the skill on its player, and nothing above asks for
those to move.

*Closes when:* `npm run probe -- content --off cooking --off smithing --off crafting` loads
clean with tulsa's routes passing, and tulsa's `skills:` line names only `core.woodcutting`
and the two combat stats.

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

## Two of the ten quest notes still have no module

Reverse Infiltration and Plague Matters. Plague Matters waits on Reverse Infiltration;
Reverse Infiltration waited on The Rat Conspiracy and The Swampy Menace, **and both of
those now stand, so it is next and unblocked.** They are written one wave at a time,
each merged before the next starts.

Two waves have been measured. Five ran in parallel on 2026-08-30, one brief each,
Sonnet 5, engine off limits:

| quest | wall | replies | out tok | cost | reaches for the engine |
|---|---|---|---|---|---|
| birds-and-the-bees | 16.3 min | 91 | 69,549 | $3.77 | 0 |
| attention-to-detail | 17.4 min | 126 | 82,829 | $4.64 | 0 |
| the-bars-crawl | 20.3 min | 120 | 92,014 | $4.31 | 0 |
| the-swampy-menace | 25.6 min | 154 | 120,603 | $6.97 | 0 |
| a-grand-blade | 22.7 min | 179 | 106,799 | $8.80 | 0 |
| the-rat-conspiracy | 12.7 min | 127 | 62,765 | — | 0 |

**Not one of the six reached for the engine.** Every question all six had was answered
by `npm run oracle` or by the corpus, which is the measurement the harness exists to
take. The spread is the finding: a-grand-blade cost two and a half times
birds-and-the-bees and spent replies 59 through 124 hand-building throwaway `DEBUG`
sections, all of it against a stage-transition defect that has since closed.

The Rat Conspiracy is the first run to come in under fifteen minutes, and it is also the
first written against a world whose oracle prints its id lists whole. It hung the errand
off the `tunnel-mouth` / `tunnels` / `ratkin-border` chain tulsa had already declared
rather than bringing a parallel geography of its own.

*Closes when:* the two are written and merge with the suite green.

## The resolver names `self` as the fix and the loader does not take it

Found on 2026-08-30 giving Kelsa's three hives a `searched` flag each. An
unqualified `assert: searched` in another module is now ambiguous, and the refusal
reads *"Name the module, or use self."* — but `self.searched` comes back *"names an
unknown flag"*, and `npm run oracle` never prints `self` under any kind. So the
message advertises a form the language does not have, which is worse than naming no
fix at all: the author tries it, is refused a second time in different words, and has
learned nothing about which of the two refusals is the real rule.

Either half is a fix and they are different sizes. Whichever it is, it has to come off
the same declaration the oracle reads, or the message and the page drift the moment
one of them moves.

*Closes when:* `self` resolves to the section it is written in, or the refusal names
the qualified form instead — and `npm run oracle` says which without anyone keeping
the page in step.

## A refused line in a `# test` is reported against the next section header

Met by the authoring run that wrote The Rat Conspiracy, and it cost that run real
time: `assert: location = X` is not an engine state, and the refusal did not point at
that line. The whole file's error collapsed onto the header of the section *after* the
one holding the bad line, so the run bisected by hand to find which line it was about.

This is the diagnostic half of what makes a world writable from the oracle alone. The
same run's other stumble was the reverse — a form that exists and is not printed: the
`<quest>.<stage>.<entity>.<n>.said` thread id a `talk:` needs when a quest thread is
open beside a townsman's own is nowhere in `npm run oracle`, and was found by
pattern-matching `kill-it-with-fire.dsl`. Both are the same cost paid two ways.

*Closes when:* a refusal inside a `# test` body names the line it is about, and the
thread-id form is printed off whatever declares it.

## Nothing can prove that a searched hive hides itself

`hidden if: searched` is what stops one of Kelsa's three hives standing for all three —
without it a player searches the same hive three times and the count reaches three.
It works, and **no route can ask whether it works**, because what a route would assert
is that an action is *not offered*: `refuse:` takes `slot`, `allocate`, `unallocate`
and `apply`, and no `use:`.

So the mechanism the whole hive beat rests on is unproved, and a later edit that drops
the `hidden if:` reddens nothing. This line is the only place that says so.

*Closes when:* `refuse: use <action>` is a thing a route may write, or a `describe` in
this folder's `open-tests.test.ts` pins it off the offering the engine puts up — the
second is much the smaller and does not wait on the language.

## A long step still nets what a short step would have clamped

The parity the owner ruled for holds for buffs now, and the clamped-remainder half is
fixed: 27 of 42 shipped fights diverged between a small dt and a large one and 23 do.
What is left is two structural things, measured on 2026-08-30 and not fixed because
neither is a bug in the sense the first two were.

A segment nets a whole span's damage against a whole span's regeneration before it
clamps, so a long segment never notices the pool sat at its ceiling for part of it —
60s, regen 30/min, 16 incoming hits: 64.150 at dt=50, 64.500 at dt=1000, 66.000 in one
step. And `captureResourceRates` snapshots at segment start, so a debuff that changes a
*resource* rate mid-segment is ignored for the rest of it — health 0 at dt≤1000 against
10.375 in one 60s step.

Exposure is bounded: the engine normally steps one attempt-cycle at a time, and nothing
in the corpus changes a resource rate mid-fight. The one caller that takes a whole span
in one go is `session.ts:933`, which turns a `wait: <seconds>` directive into a single
`resolve`. So this is reachable from a `# test` and from nowhere a player stands.

*Closes when:* a span is cut at the moment a pool would reach its ceiling, or `wait:`
steps the way the loop does and the two structural cases are then unreachable — and
whichever it is, the parity claim in `runtime.test.ts` grows the case it did not cover.

## A condition wanted in several places is written out in each of them

The three guard threads in `the-swampy-menace.dsl` — the gate guard, the guardsman and Larry,
each pointing at the captain while the quest is on offer and untaken — carry the same
`when: kill-it-with-fire.oolgas-basement.cellar-cleared and ball-of-a-boy.down-the-grate.reported
and not oolgas-errands.errands` written out three times. One fact about when the pointer is live,
in three places, which is the shape this repository spends its commits undoing.

There is nothing to reach for. `npm run oracle -- dialogue` offers `when: <condition>` and
nothing that names a condition and points at it; a `# flag` holds a fact somebody sets rather
than a standing test, and a `# variable` holds a number. So the duplication is the language's
rather than the author's, and it will recur the moment a fourth speaker joins them.

*Closes when:* a condition can be declared once under a name and named wherever one is taken,
with `npm run oracle` saying so off the declaration; then those three lines are one.

## A workaround has no mark at its site

Comments are banned and `npm run comment-check` is the gate, so a workaround can no longer
carry a note saying why it is written the way it is — the three identical `when:` lines in
`the-swampy-menace.dsl` are the standing example, and the next reader is invited to "fix" the
duplication. The reason has a home: the line above this one. What is missing is a mark at the
site pointing at it.

What cannot go stale is a mark that says almost nothing. `@@@` already does this for the
corpus and `npm run notes` reads them out; the same mark carrying only the id of an open line
would say *there is a reason, and it is written down over there* — one home for the reason,
and a mark whose only failure mode is being orphaned, which is detectable. `npm run handoff`
already reports a proof no line stands on, which is the same check with a different subject.

*Closes when:* `npm run handoff` reports a `@@@ <id>` in the corpus that no open line names.

## An action a grown copy owns cannot survive being saved

`activeActionProblem` (`src/runtime/save.ts:203-221`) resolves an `activeAction`'s
owner with `findActionOwner(obj, objId, registry)`, and that reads the registry
alone (`src/runtime/actionLookup.ts:17-18`). A grown copy's id is minted into the
state's instance table and is in no registry map, so `item.<copy>` resolves to
nothing and the action is pruned off every load with `engine.action.stale.owner`.

Found while proving that composing two saves renumbers a copy everywhere it is
named: the route had to aim an action *at* the copy rather than hang it off one,
because hanging it off one is thrown away before anything can be asked about it.
Whether any shipped item that grows also carries an action is not the point —
`item-level:` and an action block are independent, and nothing refuses the pair.

*Closes when:* an action owned by a grown copy survives a save and a load, or the
pair is refused at load time so an author is told rather than quietly losing it.

## A counter and an anvil cannot be opened by a quest

`npm run oracle -- shop entity recipe` has no conditional form of `keeps shop:`, no
`hidden if:` on a `# shop`, no `requires:` on a `# recipe` and no condition on an
entity's `stations:`. So a quest whose reward is a shop or a station can only open
it to everybody or to nobody, and two shipped quests have taken the second: the
potion counter `kill-it-with-fire` pays out is left as `tulsa.oolgas-counter`
already had it, and `a-grand-blade` cannot gate `tulsa.anvil` on having met the
smith's son, so a player can craft at the forge before the quest exists. Both
carry the reward in a line of dialogue instead.

This was written in a comment in each file and is here because comments are gone.
It is a wall two modules have hit independently, which is what makes it a line
rather than a note.

*Closes when:* a `# shop`'s counter and an entity's `stations:` can each be gated on
a condition, with `npm run oracle` printing the form off the declaration.


## The page teaches merging and says nothing about a field that clears another

`npm run oracle` now says what a second body does to a line it writes again — laid over
keyword by keyword, `laid over by name` where a body goes home by its own name, and four
kinds where the one already there is gone. It says nothing about `schema.exclusive`,
which is a *third* thing a second body can do: writing one field clears another outright.
`clearedBy` in `src/grammar/section.ts:60` is the machinery, and `# location`'s
`exclusive: [['x', 'y', 'z'], ['relative']]` (`src/content/sections/location.ts:217`) is
its only declaration — so a second body writing `relative:` silently drops the `x/y/z`
the first one had, and the page an author reads does not mention it.

It is derivable exactly like the rest: the groups are on the schema and nothing has to be
enumerated. It is not written because the page is held to a size — the whole merge
teaching cost one line, 372 to 373 — and a fourth thing to say about merging is where
that budget starts to bite.

*Closes when:* an author reading `npm run oracle -- location` is told that `relative:`
and `x/y/z` displace each other, derived from `schema.exclusive`, with the no-kind page
no longer than it is now.

## A `them.` amount is taken where no two sides stand

`refuseParty` (`src/grammar/actionResult.ts:466`) is what enforces *the two sides stand
only inside `on hit:` or `when hit:``, and `firstParty` beneath it walks the `party` field
of `pool`, `inflict` and `shake-off` and nothing else. A `Sided` **amount** carries the same
two words in a different field and is not walked, so half the rule is unenforced. Put
through the real parser on 2026-09-02:

```
drain: them.attack health     PARSED  {"delta":{"side":"them","id":"attack","falls":true}}
drain: 5 health from them     REFUSED `from them` names one of two parties…
xp: mining them.attack        PARSED  {"amount":{"side":"them","id":"attack"}}
```

At runtime `readAmount` (`src/runtime/effects.ts:126`) reads
`segment.parties?.them ?? actor`, so the line that got through silently reads **the actor's
own stat** — a well-typed, plausible number, and no way downstream to tell it from the one
that was meant. `values.ts:175` already says these are "written nowhere a line is said to a
player", so the rule is stated and half-kept. `subjectOf` (`effects.ts:214`) carries the
identical `?? actor` and is safe only because `refuseParty` does cover its field; `stands`
(`effects.ts`, `case 'stands'`) is the shape to copy, returning 0 rather than falling back.

This is the same rule c02d4bc0 made `them.` throw for in a condition, one place short.

*Closes when:* a sided amount outside a hit list is refused where a sided party already is —
the two reading off one declaration rather than two walks — and a `describe` in this folder's
`open-tests.test.ts` pins the refusal, which is what a focused test is for.

## `ownerOf` answers three things and eight callers hear two

`Namespace.ownerOf` (`src/content/namespace.ts:138`) returns `string | null | undefined`, and
the three cases are distinct: a module id, `null` for a kind whose ids are global and has no
owner, and `undefined` for **an id nobody declared**. Eight callers write `?? null` and
collapse the last two, then build a locale key under the wrong namespace — so a title or a
line of prose comes back as its own key, or as unauthored, with nothing raised.

`src/runtime/localized.ts:62`, `src/runtime/proseSaid.ts:40`, `src/content/load.ts:141`,
`:225`, `:540`, `:831`, `src/content/references.ts:39`, `src/content/sections/action.ts:46`.

`src/content/serialize.ts:84` is the one caller that does not: it asks
`sectionFor(kind)!.ids === 'global'` first and only then takes `null`. That it had to is the
evidence the distinction is load-bearing, and that the other eight do not is what makes this
a line rather than a preference.

*Closes when:* an undeclared id cannot be read as a global-id kind — the caller either asks
the kind, as `serialize.ts` does, or `ownerOf` refuses a key it does not hold — and no site
has to remember which of the three it is looking at.

## `player.` and `setting.` take any word after the dot

`reference` (`src/content/refs.ts:60-69`) resolves a rooted reference's tail only when the
root declares a `kind`; `if (isEngineRoot(value.path)) return;` lets every other root past
unchecked. `player` and `setting` in `ENGINE_ROOTS` declare `stands`, not `kind`, so
`player.rase` and `setting.hadcore` load clean.

They then answer `undefined` at runtime (`src/runtime/conditions.ts:21-22`), and the two
readers of that answer both give it a plausible value: `Number(left ?? 0)` (`:84`) compares it
as **0**, and `String(value ?? '')` (`:70`) prints it as **empty**. So a misspelt condition
reads false for the life of the world and says nothing. The directive path already refuses the
same mistake — `session.ts:863` throws naming `SETTING_NAMES` — so the two entrances to one
question disagree about whether it has an answer.

The `?? ''` at `:70` is correct for a declared-but-unset flag, which is why it has survived;
what makes it dangerous is that the question reaching it can now be a bad one.

*Closes when:* a rooted reference's tail is checked for every root that has one, derived from
the root's own declaration rather than from a second list of which roots are checked, and a
`describe` in this folder's `open-tests.test.ts` pins the refusal an author sees.

## A build failure is reported against the first module in the world

`compileModules` blames a failure on `sectionOwner(owners, kind, id) ?? modules[0]`
(`src/content/load.ts:855`) and `byNamespace.get(declared.module) ?? modules[0]` (`:873`).
Where the lookup fails the author is pointed at whichever module happens to be first, with
nothing saying the attribution was guessed. It miscomputes nothing, and it costs the reader
the same bisect as any wrong line number — which is the cost the neighbouring line in this
file about refusals inside a `# test` is also about.

*Closes when:* a build failure whose owner cannot be found says so rather than naming a module
that had nothing to do with it.

## Three things every gearing run has had to work out by experiment

Three authoring runs have now spent budget discovering the same class of thing: a fact the
tooling knows and does not say. Each was found by a run that could not read `src/`, which is
what makes them oracle and probe defects rather than author error.

**A shop marks everything up a fifth over `value:`, and nothing prints it.** Soft-toed boots
listed at 60 cost 72; fingerless gloves at 45 cost 54. A run budgeting what a climb must earn
before it can buy has to buy something first and watch the purse. `npm run oracle -- shop` says
nothing about markup.

**`equip: <template>` does nothing, silently, once another rolled copy stands ahead of it in
the pack.** A run that bought three bases in one modal session and equipped them by name got no
refusal and no equipment, and had to trace instance numbers through an intermediate
`--record` to write `equip: 8`. An earlier run met the same fault as a *refusal* that named the
template — *player does not carry item core.unassuming-cap*, while the cap was plainly carried,
because several were. So it is silent down one path and misleading down the other, and
`floors/thieving-floor.dsl` now carries two bare instance numbers because of it, which will
break the day anything upstream mints one more item.

**A long probabilistic loop cannot be traced.** `probe --record` prints the final state only,
and a failing `assert:` stops the run with no partial dump, so there is no way to see which
iterations of a four-hundred-minute loop failed. A run wanting to know whether repositioning
could dodge the travel tax after a success could not find out without instrumenting the DSL
with thousands of asserts.

One more of the same shape, from the same runs: how many points a jewel's own hex carries once
it is socketed — four, of the six the rate jewel declares — is printed nowhere, and was found by
allocating one position at a time until `engine.plane.no-points`.

*Closes when: the oracle prints a shop's markup where it prints the shop and a socketed hex's
points where it prints the jewel; `equip:` by template either picks a copy or refuses by saying
an instance is wanted, with a refusal test beside it; and `probe` can print a step trace.*
