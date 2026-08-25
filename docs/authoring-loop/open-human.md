# What is still wrong that needs Yonatan

The queue nobody else can take. Everything here is open; nothing here is done. **A
line is deleted the day it closes** — not struck through, not annotated, deleted —
and if what it settled is something a later agent could get wrong, one sentence
about it goes in `settled.md` instead. Git holds the reasoning, and the commit that
closes a line is where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here waits on the owner: his play, his reading of the writing, or a
ruling nobody else can take. **Under each line is one italic clause saying what
would move it into `open-agent.md`** — the decision that is missing, named. A line
whose clause would have to read *nothing moves it, and no work hangs off it* is not
an open line at all: it is either a ruling, which belongs in `settled.md`, or an
observation, which belongs in git. It is deleted. A line that arrives here from
`open-agent.md`, because a lane got into it and hit a judgement that is his, carries
that same clause written out of what the lane had already measured.
`deliverable-log.md` states when a line crosses, in both directions.

**Fourteen lines stand here.** The queue emptied on 2026-08-25, when the owner ruled
seventeen of them in one sitting off the back of his second playtest — most of what
this file held turned out to be one-line answers nobody had asked him for. Five of the
eight arrived back the same day, each measured by the lane that hit it.

---

## Tulsa first, then the quests one by one

**One task, not four.** Ruled 2026-08-25, folding together what were four separate
headings here: the ten quest notes in `.planning/planning_quests/`, the eight `@@@`
marks the corpus holds, the unreachable `sewer-toll-paid` road, and the deferred
question of whether a quest can own all of its own state. *"This task needs to be
combined with the next stretch of work… It is a single task. Once tulsa is ready we
will start making quests one by one."*

So none of the four is separately answerable, and the ordering is settled: **the town
is finished first**, and then each quest is written in turn with playbot testers in a
loop. What the town still owes is in `open-agent.md` and is a full queue.

The three facts a lane will need when this starts, kept here so they are not
re-derived:

- **The eight `@@@` marks are entities waiting on quests** — the anvil on A Grand
  Blade, Oolga's counter on Kill it with Fire, the hive mouth on Birds and the Bees.
- **`sewer-toll-paid` is read and never set.** `castle-yard`'s road to
  `sewer-entrance` is gated on it and nothing in the corpus sets it, so that road is
  unreachable. It is Larry's toll, and it is written when Larry's quest is.
- **A quest cannot hold all of its own state, and the engine refuses the fix.**
  `tulsa.mirror` sets `mirror-done` and `tulsa.giant-rat` sets `rats-killed`; both
  are read only by `tutorial-quests` and neither can move there, because `tulsa` does
  not depend on `tutorial-quests`:

      town [town] resolve: # entity town.mirror action "look in" set: names
      errand.mirror-done, but errand is not this module or one of its dependencies

  A `# quest` hands **dialogue** to an upstream entity and cannot hand it an
  **action**, so moving the flag by moving what sets it does not work either. The
  corpus has zero `+` field edits and this is not an argument for inventing one.
  Entity-private flags (`tulsa.mirror.done`) would work today and were rejected: they
  re-home the flag without re-homing the quest, which is the requirement.

*Moves quest by quest, when the owner says the town is ready and a note is levelled
enough to author from. The language design under the third bullet is engine work a
lane can take and prove the moment the first quest actually needs it — which is the
event that un-defers it, rather than a separate ruling.*

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
deleted with one sentence going to `settled.md` naming the blind spot and naming B as
its answer if it ever matters.*

## Nobody has watched a replay back

Everything the replay decides is proved (`src/ui/replay.test.ts`, and the cursor
through the driver in `src/ui/playtest.test.ts`); what nobody has watched is the tick
itself, the bar, and whether 0.3s is the right default once a run with a long stretch
of `page:` moves is played back. There are two recorded runs standing in
`.planning/yonatan-playtests/` to watch.

*Moves when: he watches one and names the cadence. Nothing else answers it — and he
has said explicitly that he will do it later.*

## Which stat each skill raises, where a skill raises one at all

Ruled and landed: every `# skill` naming a stat grants +1 to it per level, derived from
that one word rather than written beside each skill, and a skill naming no stat grants
nothing. `melee` and `thieving` took back the `stat: attack` the ruling names. What the
lane could not answer is the rest of the list, and it measured the candidates rather
than guessing:

- **`cooking` → `cooking-rate`** (base 55). Natural fit by name, and +1 a level is a
  modest nudge against that base.
- **`woodcutting` → `felling`** (base **0.25**). Natural fit by name, but +1 a level is
  a scale change rather than a balance nit: at level 2 a trunk falls in one swing where
  it now takes four.
- **`fishing` → nothing exists.** A stat would have to be invented before the question
  can be answered at all.
- **`thieving` → `attack`** is what is in the corpus now, restored because the ruling's
  own wording names it — but it reads like a placeholder somebody pasted, a non-combat
  skill quietly adding to the player's damage.

*Moves when: he names a stat, or `none`, for each of the four. Each answer is a one-word
content edit and the derived proof follows it with nothing else edited — so this is four
words, not four tasks.*

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

## Whether the counter should ask "how many" for a thing there is one of

A grown copy has a stack size of 1 by construction, and the counter still says
`Sell Modified Iron Sword — 19 each, you carry 1` and then asks *How many Modified Iron
Sword will you sell?* Correct, and clunky. Both rulings that opened the counter to grown
gear are silent on it.

*Moves when: he says whether a row there is exactly one of skips the count. That is a
second engine line and a branch in `shopScreen`, which no ruling on file authorises, so
it needs his word before it is worth writing.*

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

## Whether `humanizeEn` should know English's minor words

Now that a generated action label passes through `humanizeEn` on its way to a player,
it capitalises every word: *Take The Leaf*, *Chop A Log*, *Reach Through The Bars*,
*Unlock With The Key*. The corpus's own authored titles use real English title case and
lower the minor words — *Orb of the Edge*, *Charlie the Tramp*, and the engine's own
*Talk to Miki* — so the generated names and the written ones now read to two different
standards.

- **Leave it.** One function, one rule, no exceptions list. An author who wants *Take
  the Leaf* gives that action a `title:`.
- **Teach it a minor-word set** (`a an the of to in on at for with`, never first). Still
  one function and one home, but it becomes a small table somebody maintains — and it
  would then also be the standard the new derived guard holds every authored title to.

*Moves when: he picks one. Either is a one-line change in `src/grammar/values.ts` and
nothing downstream depends on the answer, which is why the lane did not guess.*

## Whether a quest's standing is a fill or coloured lettering

Ruled: *"yellow=started, white=unstarted, green=finished"*, and it is built — but the lane
drew it as a **fill**, a colour wash with a coloured edge on the row, rather than as
coloured title text. It made that call rather than asking because `settled.md` is explicit
that text colour is voice and fill is group, and the ruling itself said the colour comes
off the group channel; recolouring the title would put two facts on one channel. The words
beside it are *Not started* / *Under way* / *Done*, and the colours are `#e5e7eb`,
`#fbbf24`, `#34d399`.

*Moves when: he looks at it and says fill or lettering. If lettering, it is a different
ruling about what the text channel carries and `settled.md` moves with it; the colours and
the words themselves are one-line edits in `content/core.dsl` either way.*

## Whether to take the corpus cache, now that it is known what it buys

*"Development when npm test takes >30s is very annoying."* The measurement ran and the
numbers are in `settled.md`; what is left is your call, because the answer is not the one
the question expected.

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
sentence goes to `settled.md`. Nothing else is waiting on it either way.*

## Whether a screen may be readable through, and what that would cost

The modal API landed with three strategies, and one of them — `behind: 'clear'`, a screen
that does not darken what is under it — is implemented and proved and **has no user**.
Every shipped screen still dims, exactly as before. The complaint it was built for —
*"The dialogue modal darkens the screen and I can't see the words that were just
spoken"* — was already answered from the other side, by the sheet drawing the beat it is
answering; `showsTheBeat` now makes that coupling explicit, so a screen draws the words
*because* it took them away.

If you still want the transcript itself visible behind dialogue, there is a cost and it is
not a word. A per-screen departure has to key on some **surface-neutral** fact the view
publishes, because a published modal deliberately says nothing about how to draw it —
`place: 'bottom'` means nothing to a terminal. Today that fact is `focus`, and the dialogue
screen publishes none. So the choice is: give that screen a neutral fact to key on, or
relax the rule and let the view carry an app-only vocabulary.

*Moves when: he says whether dialogue should be readable through. If no, this is deleted
and nothing else changes. If yes, the second half is his call too, because relaxing
"nothing about how to draw them" is a rule the suite currently enforces and a lane will not
take it down on its own.*

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
oversight: `settled.md` costs `/state` at about 620 tokens over ten turns for the playbot,
and a per-stat breakdown would inflate a number that was measured on purpose.

Beside it, one small thing with the same answer either way: a `DEBUG` carrier has no words
by rule, so `combat-expansion.vigor-tally`'s buff shows as a locale key on the breakdown.
Only reachable from a DEBUG save, and it is what the engine already does for anything
wordless.

*Moves when: he says whether the terminal should answer it too, and whether a wordless
carrier should fall back to `humanizeEn` rather than showing its key. The first is a real
cost against a measured budget, which is why it is his; the second is one line either way.*

## Whether an autosave slot already holding "0" means never

`/autosave 0` used to mean *never* and now means *after every action*, which is the
direction of the ruling. An author whose `autosave` slot already holds `"0"` will therefore
start being written after every action rather than not at all. The lane wrote no migration
and said so: the cadence lives outside the portable save, so this reaches only somebody with
that slot already set on this machine.

*Moves when: he says whether an existing `"0"` should be read as `never` for the sake of
whoever set it meaning never. It is a few lines in `cadenceOrUnreadable` and a claim beside
it; doing it wrong silently changes what a slot means, which is why it was not guessed.*
