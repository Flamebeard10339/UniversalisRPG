# What is still wrong that an agent can take

The queue an autonomous lane picks from. Everything here is open; nothing here is
done. **A line is deleted the day it closes** — not struck through, not annotated,
deleted — and if what it settled is something a later agent could get wrong, one
sentence about it goes in `settled.md` instead. Git holds the reasoning, and the
commit that closes a line is where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here is proved headlessly — `npm test`, `npm run probe`,
`npm run oracle`, `tsc --noEmit` — and the shape is already settled, so a lane can
take one to the end without asking. What waits on the owner's play, his reading of
the writing, or a ruling nobody has taken is in `open-human.md`.

**A line here that turns out to need his judgement does not stay here flagged — it
moves, carrying what you measured.** Guessing the ruling and abandoning the lane
are the two bad answers, and the second is worse, because the measurement dies with
the session. `deliverable-log.md` states how a line crosses, in both directions,
and is the one place that rule is written.

---

## From the owner's play, 2026-08-24

Not recorded through the playtest tool, so no `# test` stands behind any of it. The
wants are the owner's own and are not in doubt; anything below that reads as a bug
still has to be reproduced before it is diagnosed.

### Chat readability, and the information dump

**The dialogue modal hides the words it is answering.** From 2026-08-23: *"The dialogue
modal darkens the screen and I can't see the words that were just spoken. The dialogue
that just happened should also be in the modal itself."* Said again this round with the
ordering it causes: **the GUI offers the choices before the player can read the text.**
The modal darkens what is behind it, so the line being answered is the one thing that
cannot be read while answering. *Closes when:* the spoken line is inside the modal,
above its choices.

### Notifications

**There are two notification surfaces and neither behaves the way wanted.** `XpOverlay`
draws xp gains and item arrivals top-right in fixed slots (`src/ui/XpOverlay.tsx`,
`src/ui/xpNotes.ts`); `FloatingText` draws centred pills a quarter of the way down
(`src/ui/FloatingText.tsx`), and the only two things that reach it are *playtest
copied* and *playtest filed*. The verdict from play is that they are too complicated
and look wrong. One behaviour is wanted: **spawn at the top, flow down, fade.**
*Closes when:* there is one notification surface.

**A notification cannot be added without inventing a kind.** `xpNotes.ts` knows exactly
two — `xp` and `item` — and both are derived by diffing `PlayView` between turns, so
quest progress and levelling up, which are the two named, cannot raise one at all and a
third would be a third diff. *Closes when:* a notification is what an arbitrary event
raises, so adding or removing one is a line rather than a shape.

### Balance, and four rulings from playing it

**The whetstone is a step that buys nothing.** *"just have gear drop with a certain
amount of points. Drop the whetstone idea. It is just an extra step."* Today an
instance's level is `skillLevel(payload.experience)` capped at `max-level:`
(`src/runtime/itemInstance.ts:293`) and `feed:` is how the experience arrives. Wanted
instead: gear drops carrying its points, rolled from a range the item declares
(`item-level: 3-8`) — which also makes every piece of gear an instance stacking to 1,
because the roll is what makes two copies different. **And it is the same declaration
that says a piece of gear has a skill tree at all**: an item with an item level has a
plane, an item without one does not. *Closes when:* an item declares its level range
and a drop rolls it. The cost is known and it is not small — 39 whetstone lines across
`core`, `tulsa` and `combat-expansion`, and 22 files under `src/` and `scripts/` that
name one.
RESPONSE: It would be nice if these kinds of balance refactors cost less. There are going 
to be many features that are built then cut. It probably isn't possible, but some effort 
to reduce the work of removing features would be nice. 

**Nothing can be unallocated.** The ruling: passive points refund for free and jewel
sockets do not, so a socketed jewel is semi-permanent, and a node whose removal would
strand a socket cannot be taken back. `src/runtime/clusterPlane.ts` only ever grows a
plane — there is no unallocate of any kind, free or costly, to build that rule on.
*Closes when:* a plane can shrink, and refuses to shrink out from under a jewel.

**A jewel's passives should roll.** Ranges on a jewel's passives, locked in the moment
it is allocated and socketed. That is the same roll-and-fix shape as the item level
above and wants deciding with it rather than after it.

**Travel should be 2–5 seconds everywhere.** *"Travel feels bad."* Today it is
straight-line distance × `travel-seconds-per-unit` (`src/runtime/actionLookup.ts:63`,
default 5, set at `content/core.dsl:20`), so the time is a function of map coordinates
and gets worse as the world grows: a flat band is a different mechanism, not a
different number. Beside it, **travel actions should leave the action list** unless
they are an entity's action, because they are visual clutter — the GUI already drops
the multi-leg ones (`aWalkAway` hides any choice with `legs > 1`, `src/ui/choices.ts`),
so this extends a rule that exists rather than inventing one. The REPL and the playbot
would then need somewhere else to travel from, and a `/map` command is the proposal.
*Closes when:* travel costs a flat few seconds and is reached from the map. If it
lands, *Travelling shows no progress on the map* in `open-human.md` may close with
it: a three-second walk does not read as a freeze.

## A condition cannot name a number that is not whole

**`assert:` reads integers only** (`/-?\d+/` in `src/grammar/values.ts`), so a claim
landing on a folded percentage stat cannot be exact and is forced into a band — and a
band also passes in a world where the mechanic did nothing. That is the structural
reason the vigor claim existed at all, found by the lane that closed it: it worked
around the wall by counting the stacks off a `DEBUG` tally instead of reading the
stat, which is a good answer for one test and not a general one. Every later claim on
a real-valued stat meets the same wall. *Closes when:* a condition can name a number
the engine can actually hold.

**`expect only:` is carrying a claim nobody wrote.** The vigor sheet caught both a
rebalance and a dead `quickening`, but only through incidental couplings — buff expiry
clocks shifting because the cadence shifted. The file's own instruction is to
regenerate a sheet whenever content changes on purpose, so a recording doing work no
`assert:` states is one regeneration away from doing none. *Closes when:* what the
sheet stands in for is written as a claim, or the load is measured and found to be
nothing.

**`settleHandlerDeltas` is a third pool writer that fires no event.**
`src/runtime/effects.ts` writes `store.levels[…]` directly during a settle and
deliberately never fires `on empty`, so a handler that drains a pool to nothing is
silent. It looks intentional — it stops a death handler recursing — but it is the same
shape as the duplicate just collapsed and nothing in the file says which it is.
*Closes when:* the file says which, or it goes through the one writer.

**`applyDueBoundaries` discards `segment.stopped`.** A non-repeating deterministic
action whose `on success:` carries `stop` reports *finished* rather than the reason the
`stop` named, because `endAction` is called unconditionally after `applyOutcome`.
Pre-existing and no test sees it.

**`attempts:`'s retirement message says it "bounds the action".** True only for a
non-repeating one — a repeating action's `attempts:` is a per-cycle budget, which is
what sent this queue's own line down the wrong path for a session. *Closes when:* the
message says which.

## From the first run somebody played, 2026-08-23

Quoted from what they wrote at the turn it happened. The rest of that run's findings
are reading and writing decisions and are in `open-human.md`; these three are rulings
already taken with the words already supplied.

- **The mirror's refusal is fancy about failing.** *"The message should just be:
  'You need 1000 gold to perform this action'."* It currently answers *"The glass
  shows you exactly what you are carrying, and it is not enough to be looked at
  twice."*
- **Smith's chest does not belong.** *"Remove completely. Make it a debug entity if
  necessary."*
- **Examine sits inconsistently in the choice list.** *"Sometimes examine first and
  sometimes examine second. It should be consistent. Examine second."*

## Ours, and small

**Miki's dialogue does not appear when it should.** From the first run, turn 26,
after taking the *"I'd rather find my own way"* branch: *"Miki's dialogue doesn't
appear when it should."* Talking again redrew the room and said nothing. Worth
reproducing before believing the cause — a spent node and a silent conversation
have been misdiagnosed here twice.

**A reload starts a fresh game.** `openUniverse` calls `startSession`
unconditionally, so closing the tab or refreshing loses the session: measured by
waiting 60 seconds, reloading, and coming back at 0. `/autosave` writes the live
slot and `/restore` reads it back, so the pieces exist and nothing joins them. It
costs an author a playtest and a player their game. *Closes when:* the app opens on
what it last wrote, or refuses to lose it silently.

**A proof that loads `standingSources()` may assume no `DEBUG` section stands
there.** `translationSurvival` took its subjects from `[...shipped.items.keys()]`
while its claim was about locale keys, and only ever passed because no `DEBUG`
section had lived in `core` or `tulsa`; moving the hammers into `tulsa` broke it.
It derives properly now. Whether its neighbours carry the same assumption has not
been asked.

**A kind cannot ask for one name across modules and have its references checked.**
`ids: 'global'` reads like an id-scoping choice and is silently also an opt-out of
reference checking — `isNamespacedKind` gates both reference visits, two files away
from the comment that says what `global` means. `# modal` picked the obvious word
and got the bug; `dsl.test.ts` now refuses any global kind that anything names, so
the next one fails rather than ships, but a kind that legitimately wants both still
has no way to say so. *Closes when:* the two are separate declarations.

**A minted action squats the `# action` key space without declaring it.** The
action `examine:` mints keys its label at `action.examine.examine` through a plain
`set`, on a bare unnamespaced global id it never declares — so a module writing
`# action examine` lands on the same key and one of the two silently wins. Nothing
can refuse the squat, because the namespace was never told the minted id exists.
Pre-existing, and the same shape when the address was `look`. *Closes when:* a
minted action's id is declared where an authored one's would be.

**A locale-key move silently orphans a row in `content/reviewed.tsv`.** The ledger
is keyed by locale key, so a key that moves takes its "a person has read this"
answer with it — the row does not come back marked CHANGED, it just stops being
about anything. No file exists yet on this branch, so nothing has broken; the first
review pass is when it starts to matter. *Closes when:* an orphaned row is reported
rather than ignored.

**A repeating action with `attempts:` never reaches `on unfinished:` as a
terminator** — it fires the handler and restarts, so `grind until done` runs to the
four-hour bound. Only a non-repeating action ends by attempts.

**Two tests still live in the wrong module.** The hammers and their claims are in
`content/tutorial-quests.dsl` and neither touches the quest — they are `tulsa`
claims about its rat and its `rats-killed`. Six `DEBUG` sections move together, or
the move is refused at load: the two items, the two saves that arm them and the two
tests that swing them. A clean follow-up.

**The parity excuse on `modals[].options[].label` is keyed to a whole path.** Its
stated reason covers one narrow case — `ModalSheet`'s `onlyLeaves`, a screen whose
only answer is *close* — but because the excuse names the path, a driver that
dropped **every** modal label would pass. That path now carries an item's own words
and a jewel's, so it is load-bearing.

**Two paths holding the same words at the same moment cannot be told apart.** The
parity proof now counts per moment and credits a path only beyond what
already-proved paths account for, which caught `action.label` and the plane node
titles. It still cannot see `choice.detail` going missing, because
`entities[].title` holds exactly the same words at that moment and one occurrence
credits both. Separating them needs locality, and the three surfaces share no unit
of it: a line is a unit the terminals have and the app does not, an element is a
unit the app has and the terminals do not. *Closes when:* the harness gives each
surface a comparable unit — the thing to change is the harness, not the rule.

**The parity harness runs `play-cli` in a shape `play-cli` is never in.** `cliRun`
builds a non-driving context, so `result.live` never comes back and
`formatTick`/`formatLive` — the one place the real terminal names an action under
way — never runs. That is how `action.label` stayed invisible until this session.

**A green suite under heavy load is still owed.** The lane that fixed the clock
measured green at 13 processes and, separately, green at 32 with the new clock on
the pre-split tree. Nobody has run the whole suite at 70 with the split in place,
which is where twelve tests used to fail. *Closes when:* that run is taken.

**`vite.config.ts` claims to hold the worker count and does not.** Its comment says
every route reads its clock and worker count from there. The clock is true now; the
worker count is still unset and the comment still claims it.

**`/create-test` still assembles its own `# save` + `# test` pair.** `runAsSections`
is the one writer everywhere else — the app's filing and the playbot both go
through it — and `buildCreateTest` cannot, because `runLog.ts` imports
`type CommandResult` from `command.ts` and the reverse import closes a cycle;
measured, `npm run layer-check` exits 1 on even the minimal version. What the two
writers actually disagree about is one fact, the `<id>-start` naming, spelled in
both. *Closes when:* the cycle is broken — `outcomeOf` and `refusedLine` moving down
into `command.ts`, where a private `refusedLine` already exists — or that naming
moves somewhere both can read. Two further things would still need answering:
`/create-valid-test` appends an `expect: <id>-end` and a second `# save` that
`runAsSections` has nowhere to put, and a history already opening with `load:`
deliberately emits no start save.
