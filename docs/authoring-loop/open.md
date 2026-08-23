# What is still wrong

The queue. Everything here is open; nothing here is done. **A line is deleted the
day it closes** — not struck through, not annotated, deleted — and if what it
settled is something a later agent could get wrong, one sentence about it goes in
`settled.md` instead. Git holds the reasoning, and the commit that closes a line is
where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

---

## The next stretch of work, in order

Everything under this heading is the owner's, and the order is theirs.

**1. The author's own playtest, and the list of problems it produces.** Nothing
substitutes for it and nothing is in front of it. `npm run review` is the sheet for
the writing; this is the sheet for the playing.

**2. Then author each quest in order, with playbot testers in a loop.** Ten quest
notes in `.planning/planning_quests/`, deliberately not levelled up before now —
how much outline detail the loop actually needs is what the runs were meant to
measure. The runs are cheap and the fixing is not, which is the asymmetry to plan
around.

## Death resets the player's health to full
Optional hardcore mode setting which also clears the player's inventory and 
equipped items on death. Default false. 

## A quest cannot hold all of its own state

**Deferred by the owner** in favour of the smaller members. The ruling stands:
everything related to a quest belongs inside the quest file. Nothing today lets it.
`tulsa.mirror` sets `mirror-done` and `tulsa.giant-rat` sets `rats-killed`; both
are read only by `tutorial-quests`, and neither can move there, because `tulsa`
does not depend on `tutorial-quests` and the engine refuses the upward reference:

    town [town] resolve: # entity town.mirror action "look in" set: names
    errand.mirror-done, but errand is not this module or one of its dependencies

A `# quest` hands **dialogue** to an upstream entity and cannot hand it an
**action**, so moving the flag by moving what sets it does not work either. The
corpus has zero `+` field edits and this is not an argument for inventing one.

*Closes when:* a quest module can own a whole interaction on an entity declared
upstream of it. Until then the two flags stay where they are. Entity-private flags
(`tulsa.mirror.done`) would work today and were rejected: they re-home the flag
without re-homing the quest, which is the requirement.

**`sewer-toll-paid` is read and never set.** `castle-yard`'s road to
`sewer-entrance` is gated on it (`content/tulsa.dsl`) and nothing in the corpus
sets it, so that road is unreachable. It is Larry's toll and belongs to a quest
that is not written; it closes the same way.

## The review sheet cannot tell written-and-read from written-and-dead

The generator behind three separate fixes, named by the lane that made the last two
and not yet closed. `npm run review` derives its subjects from each kind's
**declared prose fields**, never from **reachability**, so a line can sit on the
sheet for a human to read while no player can reach it. `entity`'s `examine:`
reached no surface at all; `itemExamine()` had zero non-test callers while shipping
a live English fallback; `planeReport` read `title` only. All three were on the
sheet the whole time and no gate in this repository could notice. Each has been
fixed by hand, one kind at a time.

*Closes when:* one derived claim over the tables the sheet itself reads says every
line it offers a human reaches some published surface. It needs a decision about
what counts as a surface, and a line behind a flag nothing sets is unreachable in a
way no load-time check can see.

## Tests that would pass in a world where the mechanic did nothing

**`combat-expansion.accelerated-vigor-stacks-behind-its-gate` rides a 1.08×
margin.** `assert: stat.attack-rate > 40` where base 25 plus six flat instances
alone reach 37 — so it would still pass if `quickening`, the passive whose entire
point is reading how many are held, contributed nothing, given a rebalance of
`accelerated-vigor` from +2 to +3 flat. Its own comment does the arithmetic that
condemns it. *Closes when:* it declares its own payload the way the two hammers do,
and the claim becomes a difference. It is `combat-expansion`'s content.
RESPONSE: If the test is just asserting that buffs can stack on the player, that is 
a unit test, not a integration # test. Need to think if this test is actually 
meaningful.

Two lesser ones, listed rather than fixed because neither is the same defect:
`xp.core.cooking > 0` could be exact the way `xp.thieving = 4` next door already
is, and `tutorial-quests`' `resource.core.health <= 25` is a band whose comment
defends it.

**An emptied pool reaches the death event by two independent routes** — `felledBy`'s
`emptied()` → `emptyPoolNow`, and the clamp in `settlePools`. Cutting either alone
leaves every corpus test passing. That is redundancy in the engine rather than a
gap in the suite, but no single-line mutation will ever see it.

## For the human review pass

The long pole, and it is the owner's. `npm run review` is the sheet and
`content/reviewed.tsv` makes it resumable.

- **The orbs read as healing items.** Two independent runs concluded Orb of Renewal
  and Orb of Vitality must restore health. They are item modifiers. Their `examine:`
  lines were improved; whether that is enough is a reading question.
- **Fourteen lines of player-voice writing went with `hint:`.** None was folded into
  a `log:`. Whether any of it should be is a writing decision.
- **Miki says *"There's a mirror upstairs"* while standing in `guide-house`**, which
  is where the mirror is (`content/tulsa.dsl:1032`). Pre-existing, and squarely the
  kind of thing that made two runs think the mirror was broken.
- **The player's death line changed** to cover being carried back to the start, so
  it returns to the sheet marked CHANGED. That is the mechanism working.
- **Five scenery entities became reachable** when `examine:` became an action —
  `drunk-patron`, `outfall-grate`, `sewer-signs`, `sewer-hatch`, `dumped-crates`.
  Their prose has never been read by a player and has never been read in place.

The eight marks the corpus holds are `tulsa` entities waiting on quests that are
not written — the anvil on A Grand Blade, Oolga's counter on Kill it with Fire, the
hive mouth on Birds and the Bees. Those close when the quest modules arrive.

## Balance nobody has played against

Every number here was reasoned about and none was played against.

**28 slots has had no play behind it.** The fullest shipped `# save` is 13 rows.

**`adder's-tongue` pays 45 coin a minute** against honeycomb and fen-root near 20 —
a four-second pick on the corpus's most potent-sounding reagent. The value follows
the fiction and the clock says it is out of band. Either lengthen the pick or drop
the value to 2.

**Which stat each race raises is an agent's guess**, not a ruling: human
max-health, elf accuracy, dwarf defense, orc attack. Evasion and regeneration were
unusable at +5% of 0 and of 1.

**`# skill melee` and `thieving` carried an inert `stat-id: attack`** with no
`per-level:` anywhere, folding nothing. The dead declarations were deleted. Making
either live is now one line (`tags: +1 attack per level of melee`) but it is a
combat balance change.

**Weapon bases are untradable** — iron-sword, wooden-shield, heartwood-blade,
proving-blade — on the argument that they are builds rather than goods. The shipped
hand-axe at 12 is the counter-example. Worth a deliberate call now that a grown copy
can no longer be sold twice.

## Ours, and small

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

**`src/ui/render.test.tsx`'s `stringsDrawn` is a hand-written list of view fields.**
It could derive from the parity walk's `leaves()`.

**The parity excuse on `modals[].options[].label` is keyed to a whole path.** Its
stated reason covers one narrow case — `ModalSheet`'s `onlyLeaves`, a screen whose
only answer is *close* — but because the excuse names the path, a driver that
dropped **every** modal label would pass. That path now carries an item's own words
and a jewel's, so it is load-bearing.

**The parity proof checks a path's strings against the whole rendered blob.** So a
path whose words already appear elsewhere in the render passes without being drawn
in its own right — which is how `choice.detail` went missing from the playbot while
the entity's name showed in the `entities:` row. One level up from the hole the
proof closed.

**`npm test` is red-by-load rather than red-by-code.** Every failure under
competing load is `Error: Test timed out in 5000ms` and never an assertion; the
failing set moves between runs with no edit in between. Measured: 44 competing node
processes gave 15 failures, 14 gave 3, 4 gave 1, and a raised timeout gave none.
`src/ui/authoringSurface.test.ts`'s slowest case takes 3458ms solo against a 5000ms
default. The offenders share one shape — a loop that builds a fresh driver or CLI
session over `SHIPPED_SOURCES` once per section kind or per command — so the cost
grows with every kind and every command anyone adds. CLAUDE.md budgets twenty
seconds; it is 55-170s here. *Closes when:* a red suite means a broken tree.

**A GUI wiring line is untested and wants the author's eye** — the two identity rows
at the top of the Stats page, in `App.tsx`.

## Left by the core/tulsa split

**`combat-expansion` and `tutorial-quests` depend on `tulsa`.** Each names one thing
that moved — a road to the beach, and Miki — so a module about archetypes and a
module about a quest both load the whole town. `combat-expansion.proving-ground`
sits at `tulsa.market-square`'s own square and hangs off the beach for want of
anywhere better. Map churn for the hardening pass; a playtest names it better than a
reading does.

## Open questions, not yet work

**A range is equality written twice.** `xp.thieving >= 100 and xp.thieving <= 200`
says it, which is a bound stated twice rather than a bound. Whether that wants its
own form is a question for whoever first writes a hundred of them.

**A repeat-N form.** `until <condition>` finishes one action and, since the
terminator ruling, fails loudly when it cannot reach the condition — so *do this a
hundred times* is still unsaid, and `tutorial-quests.dsl:189-191` still writes the
same rat line three times. Re-engagement was offered and **not** taken: the owner
chose the failure. Reopen when an author writes the fourth such line.

**Should a foe ever have identity?** Ruled: no, a count is enough, and
`EncounterFoe.remaining` is it. Reopen only if wanting to name one individual of a
kind ever actually comes up in play.

**What a shop pays for a grown copy.** Today it does not deal in them at all — not
offered, not sold, `not-carried` if asked for by name. Making them sellable means
the price answers to the instance's own modifiers and plane, and `Trade` carries no
copy identity, so it is real design rather than a line change.

**Should worn gear take a slot?** It does not. The ruling said "the length of the
inventory list", `state.inventory` literally excludes worn and grown, and worn gear
is drawn under its own heading. If it should, equipping one of a stack of three
starts being refusable.
