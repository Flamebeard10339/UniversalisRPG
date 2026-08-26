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

