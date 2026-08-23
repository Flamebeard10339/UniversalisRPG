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

**1. A playtesting mode in the GUI.** A run the author plays in the browser,
recorded whole, with the author's own notes attached at each step. There should be
a button visible **only while the mode is active** that opens a modal for feedback
after a given action, and a way to get the log out — extracted by hand, or written
into the project where an agent can read it. *The unification is the point*: the
playbot already has a vocabulary of what a player may do and a shape for what a run
produces (`line`, `note`, `expected`, `confusion`), and the parity proof already
forbids the surfaces differing in what they can do. A second recording format
beside the playbot's would be the failure this repository keeps having. *Closes
when:* an author can play a session in the browser and an agent can read what they
did and what they thought about it, in the same shape a playbot run produces.

**2. The author's own playtest, and the list of problems it produces.** Nothing
substitutes for it and nothing is in front of it. `npm run review` is the sheet for
the writing; this is the sheet for the playing.

**3. Then author each quest in order, with playbot testers in a loop.** Ten quest
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

## Prose the engine carries and no player can reach

The same defect that `examine:` on an entity had, in two more places. Both were
found by the lane that fixed the first and were deliberately not widened.

**44 items' `examine:` is unreachable.** `itemExamine()` in
`src/runtime/localized.ts` has **zero non-test callers**, and its fallback key
`engine.item.examine` ships a live English line nothing says. Minting a look action
per item the way an entity got one is the wrong fix — it would put a "Look" per
carried item into the room's choice list. The fallback's own wording (*"This is
{article} {item}."*) suggests a per-item panel was the intended surface. *Closes
when:* an item's prose reaches a player somewhere, and the derived proof covers it.

**12 cluster jewels' `examine:` likewise.** `planeReport` reads `title` only.

## Tests that would pass in a world where the mechanic did nothing

**`combat-expansion.accelerated-vigor-stacks-behind-its-gate` rides a 1.08×
margin.** `assert: stat.attack-rate > 40` where base 25 plus six flat instances
alone reach 37 — so it would still pass if `quickening`, the passive whose entire
point is reading how many are held, contributed nothing, given a rebalance of
`accelerated-vigor` from +2 to +3 flat. Its own comment does the arithmetic that
condemns it. *Closes when:* it declares its own payload the way the two hammers do,
and the claim becomes a difference. It is `combat-expansion`'s content.

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

**Fainting leaves the player at about zero health**, and `regeneration` base is 1 a
minute, so the walk back costs roughly thirty simulated minutes of recovery on top
of the trip. That reads like the price of dying; it is a consequence of the ruling
rather than part of it.

**`# skill melee` and `thieving` carried an inert `stat-id: attack`** with no
`per-level:` anywhere, folding nothing. The dead declarations were deleted. Making
either live is now one line (`tags: +1 attack per level of melee`) but it is a
combat balance change.

**Weapon bases are untradable** — iron-sword, wooden-shield, heartwood-blade,
proving-blade — on the argument that they are builds rather than goods. The shipped
hand-axe at 12 is the counter-example. Worth a deliberate call now that a grown copy
can no longer be sold twice.

## Ours, and small

**`# modal`'s `screen:` field is dead.** `open modal: X` looks `X` up directly in
the runtime's frame table and nothing reads `Modal.screen`. The corpus works only
because every modal's id happens to equal its screen; `# modal foo / screen:
carried-items` loads clean and throws the first time a player touches it. Pinned by
a derived test that opens every `# modal` the corpus declares. *Closes when:* either
the id resolves through `registry.modals` to its screen, or `screen:` is deleted and
the id validated against `MODAL_SCREENS`.

**An `always` node with no `when:` that writes `take:` can leave an entity silent.**
The offer gate is uniform and correct; that one shape is the softlock silhouette,
because it is the fallback line and there is nothing behind it. Nothing in the
corpus writes one. *Closes when:* it is refused at load, or ruled harmless.

**An action refuses with a message where a dialogue node now hides.** `engine.inputs.short`
is designed and authors have `hidden if:` explicitly, so this was left alone. Say if
actions should follow dialogue.

**`actionSlugProblem`'s `isProseField` guard is over-broad**, which is the only
reason the examine choice reads *Look* rather than *Examine*. The collision it
protects against can only happen for an action with **no declared id**; narrowing it
to those would let the address be `examine`. Small, but it relaxes an existing
refusal.

**An entity writing both `examine:` and its own `look:` is refused with a confusing
message** — it names `action "Look"`, the minted one the author never wrote. Honest,
badly worded.

**`goto: starting-location` is still refused at load.** It is the one other site
that names a location and could resolve live; `adjacent:`/`relative:` genuinely
cannot, since a road to "wherever the game starts" is not a coherent map. `goto:` is
a `# test`-only teleport.

**A repeating action with `attempts:` never reaches `on unfinished:` as a
terminator** — it fires the handler and restarts, so `grind until done` runs to the
four-hour bound. Only a non-repeating action ends by attempts.

**`carriedCount` has no production caller.** It is the plausible-sounding count that
caused the shop to sell grown copies for free, and it survives only in three test
files where it correctly means "loose in the pack".

**Two tests still live in the wrong module.** The hammers and their claims are in
`content/tutorial-quests.dsl` and neither touches the quest — they are `tulsa`
claims about its rat and its `rats-killed`. Six `DEBUG` sections move together, or
the move is refused at load: the two items, the two saves that arm them and the two
tests that swing them. A clean follow-up.

**`src/ui/render.test.tsx`'s `stringsDrawn` is a hand-written list of view fields.**
It could derive from the parity walk's `leaves()`.

**The parity proof checks a path's strings against the whole rendered blob.** So a
path whose words already appear elsewhere in the render passes without being drawn
in its own right — which is how `choice.detail` went missing from the playbot while
the entity's name showed in the `entities:` row. One level up from the hole the
proof closed.

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
