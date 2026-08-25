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

**Nine lines stand here.** The queue emptied on 2026-08-25, when the owner ruled
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
