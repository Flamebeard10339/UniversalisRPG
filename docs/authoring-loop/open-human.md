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

## Whether a sale may pay for itself when the pack is full

`sellProblem` checks there is room for the coin before anything leaves the pack, so a
player whose pack is full and who holds no coin cannot sell — including selling the very
thing that would free the row. Pre-existing, and pinned by `pack.test.ts:182`, so the
behaviour is deliberate as far as the suite is concerned. It bites harder now that grown
gear takes a row: a pack full of blades and no coin is a reachable state and it is a
dead end.

*Moves when: he says whether the coin check belongs after the item leaves rather than
before. Either answer is a small edit and the pinned test moves with it; guessing is what
would be wrong, because the current order may be guarding something the lane did not see.*
RESPONSE: Yes, it should be possible to sell an item with a full inventory. The coins take
up the slot that was just emptied by the sale. 

## Whether `1-3` was the number in the file or the number on screen

The ruling reads *"the rat swings 1-3"*. The lane wrote `attack 6-8` on `giant-rat`,
because that is the declaration that makes the **swing** literally 1–3 against the
shipped player's defence of 5 — and it measured the other reading rather than assuming
it: `damage: my attack vs their defense` subtracts, and `hitDamage`'s floor is
`max(1, min(minDamage, attack))`, so an authored `attack 1-3` against a defence of 5
collapses to a **constant 1**. That reading fails the *"two swings differ"* requirement
outright, so it cannot be what was meant unless something bigger changes.

*Moves when: he says which number he was naming. If it is the number in the file, the
swing has to stop being `attack − defense` and that is engine work well past this line;
if it is the number on screen, this is already done and the line is deleted.*
RESPONSE: The rat needs to have 1-3 attack. DOn't do anything fancy like calculating its 
dps. The player at this point in the game should have 1 defense from their defense skill. 
We also nerf the rat's health to 3, and the player's attack to 1-2 from their attack skill. 

## Whether a quest's standing is a fill or coloured lettering

Ruled: *"yellow=started, white=unstarted, green=finished"*, and it is built — but the lane
drew it as a **fill**, a colour wash with a coloured edge on the row, rather than as
coloured title text. It made that call rather than asking because colour carries voice on
the text channel and group on the fill, and the two never share; the ruling itself said the
colour comes off the group channel, so recolouring the title would put two facts on one. The words
beside it are *Not started* / *Under way* / *Done*, and the colours are `#e5e7eb`,
`#fbbf24`, `#34d399`.

*Moves when: he looks at it and says fill or lettering. If lettering, it is a different
ruling about what the text channel carries and the proof of it moves too; the colours and
the words themselves are one-line edits in `content/core.dsl` either way.*
RESPONSE: The title text should be colored, not the background. 

## Whether to take the corpus cache, now that it is known what it buys

*"Development when npm test takes >30s is very annoying."* The measurement ran and the
numbers are below; what is left is your call, because the answer is not the one the
question expected.

**The suite is not slow because of the corpus.** 692 universe loads cost 20.4s of CPU, and
a per-process content-keyed cache takes that to near zero — but **wall clock does not
move**, because the twenty-three seconds are import and transform, which is a function of
how many test *files* there are. Summed test-body time falls 95.7s → 70.9s and the clock
on the wall stays where it was.

So there are two separable answers:

- **The dev loop.** Running the one file you are editing costs about **1 second**. That is
  the loop and `npm test` is the gate. Nothing needs building for it — it is a habit, and
  it is over twenty times faster than the thing the complaint was about.
- **The cache itself.** Worth taking only if CPU rather than wall clock is what is short —
  CI parallelism, or a box already running several agent lanes. It is not free: the five
  corpus-rewriting tools in `scripts/` fail with it in and each needs a way round it, and
  a cached registry is handed to many callers at once.

*Moves when: he says whether to build the cache. If yes it is an agent line with a known
shape and a known cost — five tools to teach; if no, this is deleted and the dev-loop
sentence goes to `CLAUDE.md`. Nothing else is waiting on it either way.*
RESPONSE: Delete this, and put this line into CLAUDE.md, not settled.md

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

## Whether `/state` should say where a stat's number came from

The app answers it behind a press. The terminal does not, and the view-parity harness passes
anyway because no driver draws `stats[].from[].title` during its run — the app draws it only
behind a press the harness never makes. The lane left it deliberately rather than by
oversight: `/state` was measured at about 620 tokens over ten turns for the playbot, and a
per-stat breakdown would inflate a number that was costed on purpose.

Beside it, one small thing with the same answer either way: a `DEBUG` carrier has no words
by rule, so `combat-expansion.vigor-tally`'s buff shows as a locale key on the breakdown.
Only reachable from a DEBUG save, and it is what the engine already does for anything
wordless.

*Moves when: he says whether the terminal should answer it too, and whether a wordless
carrier should fall back to `humanizeEn` rather than showing its key. The first is a real
cost against a measured budget, which is why it is his; the second is one line either way.*
RESPONSE: This is a parity violation. The engine exposes a single function which answers the detailed information regarding a stat. As in, it spawns the modal showing the detailed information on all the pieces that compose a stat. This is true for all surfaces. The GUI simply renders modals differently than the harness. But the two expose the same methods to interact with the same information.

## Whether a talk and a trade should name who they are with

Talking is now one of Miki's own offers rather than a location action, so a terminal reads
`Miki: Talk to Miki` and the app draws it in a cell already headed *Miki*. The name is said
twice. That is exactly the shape `engine.shop.label` has had all along — `Sunny: Trade with
Sunny` — so **one ruling covers both** and the lane deliberately left them alike rather than
fixing one and leaving the other odd.

The cost of making it read just *Talk*: the English value drops `{entity}`, and
`unsuppliedParameters` derives the parameters a translation may use **from the English** — so
no other language could name the entity any more. `locale.test.ts:83` uses that very key as
its worked example.

*Moves when: he says whether an offer that already sits under its owner's name should repeat
it. If yes, nothing changes; if no, it is two locale values and a decision about what a
translation may still say, which is why it was not guessed.*
RESPONSE: No. Talk to Miki should be renamed to Talk. 

## Whether the shipped corpus still needs its `DEBUG` sections

Your own follow-up, and it is answerable now that the fixture world exists — but the answer
is not the one the follow-up assumed, so it comes back to you rather than being taken.

**Measured:** 17 `DEBUG` marks, 264 lines, three modules — `tulsa.dsl` 9 (154 lines: the two
hammers, the smith's chest, two saves, four tests), `combat-expansion.dsl` 5 (75 lines),
`core.dsl` 3 (35 lines). Removing the *mechanism* touches about 14 files: the mark and its
merge and print rules in `sections/define.ts`, the prose refusal and locale sweep in
`load.ts`, the reachability refusal in `references.ts`, twelve `listedToPlayer` call sites
across four runtime files, and `debugSheets.test.ts` deleted outright with claims edited in
five more.

**Why the fixture world is not the home for them.** A `.ts` fixture cannot be driven from
the CLI — `npm run probe`, `npm run play` and `--test <id>` take files, directories or
stdin — and **eight of the seventeen are `# save` and `# test` bodies you drive from a
terminal**, standing on shipped ids. The home that would work is a `.dsl` outside
`content/`, say `fixtures/debug.dsl` depending on `tulsa`: unreachable by construction just
as the `.ts` is, no exclusion added, and still drivable.

**What that trades away is real.** Today the engine *proves* a player cannot reach a DEBUG
thing — anything reachable that names one is refused at load, and the locale sweep
guarantees it says nothing in any language. In a separate file that proof weakens to *we did
not load it*. And it reverses the rule that `# item million-attack-hammer` lives in the
module of the test that swings it.

*Moves when: he says whether that trade is worth 264 lines and a mechanism. If yes it is a
substantial agent line with a known shape; if no, this is deleted and the commit that
deletes it says the DEBUG mechanism stays and why the fixture world did not replace it.*
RESPONSE: I'm reading that it isn't doing any harm. And we can't prove that we won't use debug items in the future. Maybe it would be useful as a debug tool later on. Leave it as is. 

## The stat groups are a draft, and which stat sits where is yours

A stat's tab is now its own `# group` and nothing else, so revising this is one `group:`
line per stat in `content/core.dsl` and `content/combat-expansion.dsl`. The only structural
constraint is that exactly one `# group` stands `standard for: stat`. The draft:

- **Fighting** (the main tab) — Attack, Defense, Accuracy, Evasion, Attack Rate, Max Health
- **Upkeep** — Regeneration, Max Rage, Rage Drain
- **Knack** — Cooking Rate, Felling, Luck

*Moves when: he renames a tab or moves a stat. Nothing is waiting on it — the shape is
settled and only the membership is a draft, which is exactly what the ruling said it would
be.*
RESPONSE: Three tabs. 
Combat: Everything related to fighting. 
Skilling: Everything related not fighting.
Other: Rage (Reason is that a player may not use rage at all, it should not clutter their sheet)

## Whether a terminal should print a stat's shares too

`/stat <id>` opens the screen on every surface, but the *words* for what makes a number —
`amounts` and `madeOf` — live in `src/ui`, so `replLines` draws nothing beside it and only
the app shows the shares. Moving those two down into runtime would give both surfaces one
function. The lane left them where they were because the costing it inherited said the
runtime does not change, and wrote the reason at the call site rather than quietly moving it.

*Moves when: he says whether the terminal owes a stat's breakdown. If yes it is a small
agent line — two functions down a layer and `replLines` reading them; if no, this is deleted
and the commit that deletes it says the app is where a number is explained.*
RESPONSE: This was answered above. The separate surfaces (REPL, GUI, playbot etc) Are all rendering systems. They get all information through the runtime. This should be enforced. If something spawns a modal, it should spawn it everywhere. Etc...

## Whether the reveal is off/on or a choice of paces, and whether it types

Dialogue now arrives a line at a time and it is a player preference — *Paced dialogue*,
default **on**, *"What is said to you arrives a line at a time, at reading speed, rather than
all at once."* Two calls the lane made rather than guessed at, both cheap to reverse:

- **Off/on, not slow/quick.** *"A global variable that can optionally be edited/skipped"* was
  read as one number, and the three tunables in `src/ui/reveal.ts` (`A_CHARACTER = 24`,
  `LEAST_A_LINE_HOLDS = 260`, `MOST_A_LINE_HOLDS = 2400`) beat a keyed pace table the app
  would have to keep in step with the declaration. If you want the player choosing a pace, it
  is two lines plus two engine keys, and the derived test already guards it.
- **A fade, not a typewriter.** Lines arrive whole, one after another — the same technique
  the plane's nodes sprout with. Chopping a `Localized` mid-character felt wrong, and nothing
  in the engine stops it, which is worse.

*Moves when: he watches it and says. Both are small and neither blocks anything; the numbers
are his to tune whatever he decides about the shape.*
RESPONSE: I watched it. Let's make it more specific. Typewriter is better. As in, one character at a time and a rate of 20 characters per second. That is a guess, but a relatively quick rate is what we want. 
But we are going to go further. Sequential dialogue lines require a continue acknowledgement to show up. 

## Whether `src/ui/testFixtures.ts` should fold into the shared world

The one module the fixture sweep could not decide. `FIXTURE_DSL` — a keep, a yard, a warden,
a sword and a shield — is already a single home used by exactly one file, and its own comment
says the world is deliberately generic. Folding it in works mechanically but saves only one
`x/y/starting` triple, and it costs renaming `fixture.keep` and `fixture.yard` throughout
`editControls.test.ts`, which has assertions keyed on those addresses.

*Moves when: he says whether one triple is worth churning a file's addresses. Either answer
is fine and nothing waits on it — it is here rather than guessed at because the trade is
genuinely close.*
RESPONSE: No. It is not worth it at this time. 

## How wide the player's swing should be

`8-12` is the lane's choice, not a ruling. It keeps the midpoint at 10 so nothing the engine
plans with moved, and ±2 on 10 sits beside the rat's ±1 on 7. The other foes still declare
point attacks, which is the balance pass rather than this line.

*Moves when: he names a width, or says the balance pass will. It is one line in
`content/core.dsl` and the derived claim follows it — but **every recorded combat figure
moves again** whenever it changes, so it is worth deciding once rather than twice.*
RESPONSE: This is a larger concern. To answer the question, the player's attack should be low, maybe 1-3 damage per hit. 
The larger concern is that balance should not be hard coded into tests. Balance is going to churn massively and continuously over the course of the project. Making any small change in balance should not redden the suite. The suite should test that the functionality works, not that the numbers make sense. 

## Whether the rage route should still land flat on its ceiling

Giving the player a ranged swing shifted the seeded stream, so the rage route now closes at
19.8 of a 20 pool rather than exactly on the cap. It still demonstrates the cap biting —
twelve hits granting three each, less fifteen bled, is twenty-one into a pool that holds
twenty — but the number no longer reads as the ceiling.

*Moves when: he says whether that assert should read the ceiling exactly. `wait: 29` does
it; it is a content choice about what the route is demonstrating, which is why the lane did
not take it.*
RESPONSE: Same as above. No test should test balance. Only that rage actually goes up, it increases attack, etc. 
