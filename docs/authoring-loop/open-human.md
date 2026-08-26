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

## Six quests stand in the journal that nobody can begin

A new game's journal now lists eight quests, six of them stubs that nothing starts:

    unstarted  A Grand Blade — The forge in the market row is cold, and the young
               smith at it does not look like a man who chose the work.
    unstarted  Attention to Detail — Somebody in town pays for what can be learned…
    unstarted  Ball of a Boy — There is a boy hunched over the sewer grate…
    unstarted  Birds and the Bees — Kelsa's bees have turned on anything…
    unstarted  Kill it with Fire — Grandma Oolga keeps her shelves behind her…
    unstarted  The Swampy Menace — The guard captain has been asking after me…

That is the journal working as written — `listedToPlayer` filters only `DEBUG`, and
its own comment says a journal listing only what has been started would be a list of
what the player already knows. So six hooks on turn one is either the quest board
doing its job or six dead ends, and which one it is is a call about the game.

The mechanism is not free either way. Holding a stub back means `DEBUG`, and a
`DEBUG` section says nothing in any language, so it never reaches the locale that
`npm run notes` walks — the note that is the whole point of the stub disappears with
it. Measured both ways on 2026-08-25.

*Moves on a ruling on whether an unwritten quest is visible to a player. If it must
be held back, that is engine work a lane can take: some way for a section to ship
its prose to `npm run notes` without shipping the quest to the journal.*

## Four of the ten quest notes have no module, and nothing says which is written first

Six of the ten notes in `.planning/planning_quests/` became modules because Tulsa
held a `@@@` naming them. Plague Matters, Reverse Infiltration, The Bar's Crawl and
The Rat Conspiracy held none, so nothing moved for them and they have no file.

The ordering that used to sit here — the town finished first, then quests one by one
— was overturned on 2026-08-25: *"the whole premise is wrong. We already have a
quest."* First Steps is that quest and is now its own module. What the town still
owes is in `open-agent.md` and is unchanged; it is no longer a gate on writing a
quest.

The notes are uneven, which is why this waits. Ball of a Boy and Kill it with Fire
are written through to their last beat; Attention to Detail is two lines and Plague
Matters is a heading with seven empty numbers under it.

*Moves on naming the quest to author first, and on whether the four unstubbed notes
get modules now or when they are levelled enough to author from.*

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

## Nobody has watched a replay back

Everything the replay decides is proved (`src/ui/replay.test.ts`, and the cursor
through the driver in `src/ui/playtest.test.ts`); what nobody has watched is the tick
itself, the bar, and whether 0.3s is the right default once a run with a long stretch
of `page:` moves is played back. There are two recorded runs standing in
`.planning/yonatan-playtests/` to watch.

*Moves when: he watches one and names the cadence. Nothing else answers it — and he
has said explicitly that he will do it later.*

## What the band under every page should carry

The run under way is now drawn below whatever page you are on, which is what you asked
for. What it carries is the question: today that is the label, the bar, the cancel button
**and the pool meters** — your health and each foe's. During a fight on the character sheet
that is roughly 150px of permanent furniture, and on the home page your own health meter is
then drawn twice, once in the band and once in `StatusBanner`.

*Moves when: he says whether the band is the whole sheet or just label, bar and cancel with
the foe meters staying on the home page. Either is a small edit in `App.tsx`; the lane did
not guess because both readings of "it should exist on lower banner" are defensible and one
of them draws a number twice.*

## Two stats were put on a tab by judgement rather than by the ruling

The three tabs are Combat, Skilling and Other, and every stat names one. Two calls were
not the ruling's to make and were made anyway: `regeneration` sits under Combat, because
it refills the pool a fight empties, and `standard for: stat` sits on Combat, so a stat
somebody forgot to group lands on the tab the sheet opens on rather than on one a player
may never turn to. The other reading of that second one is that "everything related not
fighting" is the complement and so the natural home for a stat nothing has classified.

*Moves when: he opens the character sheet and either says nothing, or names the tab either
one should sit on — one `group:` line and one `standard for:` line in `content/core.dsl`.*


## Whether a fishing spot is a thing you can use up

Your reading of the corpus on 2026-08-26: *"fishing should be just like `# action
melee-combat`, just for fishing."* The enumeration you caught is fixed — what a parted
line costs is now a `# droptable` under the tackle that declares it, so a seventh net is
one line in the file someone is already editing. The four duplicated casts are not, and
the reason is a decision rather than a defect.

A lane built the shape rather than asserting it could not be built. `src/grammar/action.ts:315`
refuses a side-naming action that declares no `depletes:`, so `accuracy: my fishing vs
their depth` is rejected at load. Adding `depletes:` to get past it **loads** — and then a
measured minute of netting recorded the shoal *felled by the first fish and not coming
back*, plus `combat.attack: 2` banked per landed cast. That second one is the thing
`content/fishing.dsl`'s own header exists to refuse, and it cannot be scoped away:
`damage-dealt` takes no `resource:` and the arity check refuses one.

Both are fixable in content — `respawn after:` for the shoal, and the stray experience is
about 7% of the benchmark — but fixing them means accepting that a fishing spot is a thing
that gets used up and that casting trains your arm a little. That is a decision about what
fishing *is*.

There is a third path and it is the one a lane recommends: relax that grammar line so a
side-naming action needs no `depletes:` at all, which the runtime already supports
(`runtime.ts:264` fires target hooks without it). Then the four casts become one action and
four waters with no shoal felled and no arm trained. It is engine work, not content.

*Moves when: he says whether a water may be depleted, or whether the grammar should stop
requiring it. The first is a content afternoon and changes what fishing means; the second is
a small engine change and changes nothing about the game. A lane cannot pick between those.*

## The thieving ladder now runs at one pace

A townsman, a guardsman and a knight were tuned to 30, 20 and 15 attempts a minute so that a
minute spent on each paid about the same. That is gone: a rate a debuff can reach has to be a
stat, one stat is one number, and all three now run at 30. The knight is the best mark per
minute, which is backwards.

This was not a slip — it is the cost of what you asked for. *"It should work like a debuff
that reduces your thieving rate to 0 for a few seconds"* requires the rate to be something a
modifier can touch, and `rate: 30` written as a literal is not. The stall works; the ladder
paid for it.

*Moves when: he says whether the three payouts should be retuned to restore the ladder, or
whether a per-mark rate is worth a language feature. Retuning is three numbers and no test
pins them; the feature is a `rate:` that can read a number off the mark, which nothing in the
grammar offers today.*

## Whether Market Square should read as crowded or as legible

It carries twelve entities and eight roads. That is what "alive" costs at the busiest room in
the game, and it is the room every road in town runs through by design.

The travel half is capped — the sheet now stops at one step out and the rest is on the map —
but nothing caps the entity list, and nobody has decided whether it should. A square you can
read at a glance and a square that feels like a market are not obviously the same screen.

*Moves when: he stands in it and says. If it should be thinned, the lever is which entities
stand there rather than a number in the engine; if it should not, this is deleted.*

## Whether one step out is the right radius for the sheet

The home page and the terminal now offer what is here plus what is one leg away, and
everything further is reached through the map. That closed a real complaint — the list was
being swamped by travel — but the radius itself was a lane's choice, not a ruling, and it was
made before the grid town existed.

The grid town is the case that matters: crossing Tulsa is now three or four legs through lanes
whose neighbours are houses, so "one step out" means something different there than it did in
a loose graph of thirty-four rooms.

*Moves when: he plays the walled town and says whether the sheet feels short or right. It is
one comparison in `sheetOffers`; a radius of two is the same edit as a radius of one.*

## Whether a stalled bar should empty or hold where it stopped

While a run is stalled — a rate taken to zero by a debuff, which is what being caught
pickpocketing now does — the published fraction is `0`, so the bar empties rather than
freezing where it had got to. The lane that built the stall published a `stalled` flag beside
it so a renderer could draw it stopped, and did not go further.

Holding the drawn number needs a span stored on `Cadence`, which is a real change to the shape
the runtime keeps per attempt. The lane judged that out of scope rather than guessing at it.

*Moves when: he sees a stall and says whether an emptied bar reads as "you are stopped" or as
"you lost your progress". If the second, it is a field on `Cadence` and the publisher reading
it.*

## Miki's lent net can be destroyed, and his line then points at nothing

`on line-parted:` takes the tackle when `line-health` empties. Miki's `again:` line — the one
a player gets on every talk after the offer — points at the net already in their pack, so a
player whose net has parted is told to use a thing they no longer hold.

Remote rather than theoretical: the shrimp shoal drains 1 line-health per miss against the 6
the small net grants, so it takes a run of misses. The window is still an exit, so it is not a
softlock — it is a line of dialogue that becomes false.

*Moves when: he says whether the tutorial's lent net should be exempt from parting, or whether
Miki should have something to say to a player who broke it. The first is a condition on one
droptable; the second is a dialogue node and is the better writing.*

## The ruled combat numbers make the sewer unreachable

Ruled, and **applied**: *"The rat needs to have 1-3 attack... The player at this point in
the game should have 1 defense from their defense skill. We also nerf the rat's health to
3, and the player's attack to 1-2 from their attack skill."* This came here from
`open-agent.md` rather than closing, because taking it to the end turned up something a
lane cannot decide.

The edit is written and sitting on branch `worktree-agent-a44bebbff7348643a`, commit
`08eb6511`, so nothing has to be re-done. It is **not merged**, because it reddens
twenty-odd routes and one of them is not a stale sheet.

**What it does to the tutorial is exactly what was asked for.** `giant-rat` at `attack 1-3`
and `max-health 3` against a player at `attack 1-2` and `defense 1`: a rat falls in two or
three swings and bites for one or two. That reads right.

**What it does to everything past the tutorial is the problem.** The numbers are written on
the base player line, and every enemy in Tulsa was tuned against the player they replace
(`attack 8-12`, `defense 5`). `feral-rat` in the sewer outfall declares `attack 9`,
`defense 1`, `max-health 24`. Derived from those declarations: the player now needs about
**24 landed hits** to put one down and dies to about **four bites**, and the outfall stands
two of them.

So `tulsa.the-key-opens-the-barred-door` fails at `tulsa.barred-door.unlocked` — and it
fails for a reason worth reading. `feral-rat` is `aggressive`, `pick lock:` is `time: 6`,
and an aggressive foe now cancels what you are doing. A player who cannot clear the room
can never pick the lock, so the puzzle is not merely hard, it is **unreachable**. That is
the collision between this ruling and the aggression rule from the same playtest, and it is
the sharper form of a question already standing in `docs/skills/open-human.md` — *whether
the sewer should be able to kill a beginner*.

*Moves when: he says whether the nerf is the tutorial's or the game's. If it is the
tutorial's, the base line is the wrong home and a beginner wants a weaker start that grows
back — a different mechanism, not a different number. If it is the game's, every enemy in
Tulsa needs re-tiering against the new player and that is a content pass a lane can take
once he says so. Either way the branch above holds the numbers.*

*Beside it, and answerable in the same breath: `first-steps.two-eight-health-swings-leave-a-rat-up-and-the-third-puts-it-down` is a test whose **name** is a balance number. Under the
ruling that a test may not pin one, it is wrong whatever is decided here — but what it
should assert instead depends on what a first fight is supposed to feel like.*
