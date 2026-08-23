# What is still wrong

The queue. Everything here is open; nothing here is done. **A line is deleted the
day it closes** — not struck through, not annotated, deleted — and if what it
settled is something a later agent could get wrong, one sentence about it goes in
`settled.md` instead. Git holds the reasoning, and the commit that closes a line is
where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

---

## Core DSL
Create a core.dsl file which contains all skills and basic mechanics. So that Tulsa doesn't have non tulsa related things in it. This means splitting tutorial-island.dsl into miki's house which goes into tulsa, and core stuff which goes into core.dsl. 

## Blocking the writing pass

**Twelve rough lines in `content/tutorial-quests.dsl`.** Miki's *snubbed*,
*apologised* and *adrift* routes and four quest `log:`/`hint:` lines were written
in one pass to get the module past the silence refusal, and none of them has had a
second thought. Three carry what they are reaching for; the rest are bare marks.
*Closes when:* `npm run notes` reports no mark in that module.

## Reported by a player, not yet diagnosed

**A dialogue node announces its own removal to the player.** Named
`bake-bread.miki.1.said`, reported on three separate turns of run 2 as a recurring
missing-content note.

**The journal does not keep up.** Run 2, turn 9, after both steps were done:
*"Journal text still says 'Knead the dough, then bake it in the oven' even though
both steps are already completed."* Run 4 hit the same shape from the other side —
the tracker pointed at Miki throughout a walk across Tulsa.

**The oven offers a recipe whose ingredient the player cannot have.** *"'roast
chestnuts' is available but I have no chestnuts."*
  RESPONSE: remove roast chestnuts. It was a debugging action added to test things

**No way to rest or heal.** Run 4 noticed it at 14/30 health with nothing to do
about it anywhere in the town.
  RESPONSE: We need to teach agents about the wait action available everywhere 
  which passes time and allows regeneration to work. 

## Ours, and small

**The action status line always reads `Fight 100% done, 0 attempts`.** Surfaced by
the one-cycle rule: control now returns exactly at a cycle boundary, so the action
a player is looking at has always just finished one, and the label describes the
cycle behind it rather than the one ahead. Reported on six turns of run 4.

**The stat fold's new reading is untested.** An action whose `requires:` or
`hidden if:` stops holding partway through a cycle keeps contributing its stat tags
until that cycle ends. That was chosen deliberately — it is the only definition
that terminates once `stat` is a condition root — but no test in the suite changed
when it landed, so nothing pins it down. *Closes when:* a fixture exercises it.

**`npm run oracle -- --at` cannot answer for a module that already ships.** It
loads the corpus beside the draft, so a draft that *is* a shipped file collides
with its own copy and the answer becomes `two modules declare the id tulsa`. The
tool reads a new module and refuses an edited one, and an author reaches for it
either way.

**`--save` does not imply its own sources.** `npm run playbot -- --save
tulsa.in-town` fails unless the content files are also named positionally, because
the default source list is still tutorial-island plus tutorial-quests. *Closes
when:* the default is `content/`, the way `probe` already takes a directory.

## The terminal shows less than the GUI

Found by asking all three renderers the same question. Each is a real gap, not a
deliberate exclusion.

- **No stats.** `PlayStatus.stats` is read by no command; `/state` prints location,
  time, flags, inventory, resources and the encounter, and stops.
- **An equipment slot appears only once something is worn in it**, so an
  empty-handed session has nothing to point at.
- **No map**, so neither `discovered` nor `locations` is drawn anywhere.

The GUI's only deliberate exclusion is `flags`, on anti-spoiler grounds.

## For the human review pass

Not bugs. Writing that promises a mechanic is a promise, and a playtester files it
as a bug — run 4 did, three times unprompted.

- The sewer grate is named in Market Square's own description and cannot be touched.
- *"a rack of axes nobody is watching closely enough"* offers no way to take one.
- Oolga's *"something glints in her eye"* opens no counter.
- `sha-dynastys` renders as **"Sha Dynastys"**, missing its apostrophe.
- `content/tutorial-quests.dsl:22` and `:85` still say *this island* and *a boat to
  the mainland*, which the outline ruled out months ago and nobody has applied.

## Facts an author must know that nothing yet tells them

A hand-kept list of these is the failure mode the mission forbids, so each line is
**verified against the code, then given a home, then deleted from here**. Three
homes, in order of preference: the engine refuses it, so `oracle --at` names it at
the point of writing; the oracle says it, as a note derived from the kind's own
declaration; or the outline template says it, for a convention no engine rule could
enforce. A line that verification shows is stale is deleted with no home.

Nothing is to be added to this section. When it is empty, delete the heading.

- [ ] "descriptive flavor text for an object" is **one** mechanism
- [ ] modals are rendered unconditionally with guaranteed closing behavior
- [ ] a `# quest` is one section: stages, what the journal reads at each, and what
      an entity says while the quest stands there
- [ ] a quest lives in its own module, and the world still loads without it
- [ ] quest/stage conditions are runtime flag checks against live state
- [ ] `<obj>.<objId>.<actionId>` is first-class for anything an object can do
- [ ] item actions are not location-scoped; location and entity actions are
- [ ] enemy-shaped actions and instant actions are two intentionally different tools
- [ ] travel actions with no cost or reward are pathfinding edges
- [ ] progress signals get lightweight UI acknowledgement
- [ ] there is no browser storage to clear and no reset command

## Open questions, not yet work

**A range is equality written twice.** `xp.thieving >= 100 and xp.thieving <= 200`
says it, which is a bound stated twice rather than a bound. Whether that wants its
own form is a question for whoever first writes a hundred of them.

**A repeat-N form.** `until <condition>` finishes one action; nothing says *do this
a hundred times*. Worth revisiting once `until` has been used in anger.
