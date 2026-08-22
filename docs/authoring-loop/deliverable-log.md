# Deliverable log — the authoring loop and the playbot

Branch `authoring-loop-and-playbot`. Items 3 and 5 of the content dream. This
file is the agreement about what is being built and what "done" means; it is
written before the implementation and edited as the implementation teaches us
something. It is tracked, so a session that picks this branch up cold starts here.

The two items share one thing, and it is worth saying at the top: **an author
writing content and a bot playing it both need to say "this bit is not right
yet" and have it survive into a list someone reads later.** `@@@` and
`npm run notes` are already that channel. Neither item gets its own.

---

## Item 3 — an outline goes in, a module comes out

### What it is

    you write     a rough outline, prose, one page
    agent reads   npm run oracle   +   the outline
    agent writes  content/<region>.dsl
    agent runs    npm run oracle -- --at content/<region>.dsl
                  fix what it names, repeat until clean
    agent runs    npm test
    you run       npm run notes    → the second pass, on the writing

Most of this exists. The build is small; the risk is in three places.

### Risk 1 — the whole-file verdict stops at the first refusal

`takenLines` in `scripts/oracle.ts` says, in its own words, that it stops at the
first thing it cannot take and that fixing it may uncover another. The per-line
pass already reports every line at once, but the whole-file pass — the one that
catches rules about two sections at once — does not.

"The oracle gives it all the errors in one go" is the stated point of item 3. So:
**the whole-file verdict reports every independent refusal it can reach, and
names only the ones that genuinely cascade as cascading.** This is the single
most concrete deliverable of item 3 and the first thing to build.

### Risk 2 — the oracle is complete on grammar and silent on semantics

`scripts/oracle.test.ts` derives its subjects from `sectionKinds()` and asserts
every offer the editing page makes appears in the tree, so an agent is never told
the wrong *syntax*. It is told nothing about meaning: that a travel action with
no cost is a pathfinding edge, that item actions are not location-scoped.

Those facts sat in a hand-kept list in `CLAUDE.md`. That list is now
`facts-to-home.md` in this folder, as a work-list to be consumed and deleted —
each line verified, then homed in an engine refusal, an oracle note, or the
outline template, or struck as stale.

**This work is not done first.** The measurement below tells us which of the
twelve actually bite. Some will never come up.

### Risk 3 — the process must forgive stopping and starting

This will not one-shot, and pretending otherwise builds the wrong thing. A draft
must be *useful while half-written*: `oracle --at` on a partial file has to be a
progress report, not one long refusal. `@@@` is how an agent says "I stopped
here" or "I could not do this"; `npm run notes` is how the next session — human
or agent — finds where to resume.

**A run that stops early with honest notes is a success, not a failure.** The
loop is designed around that, not around a single clean pass.

### The measurement, which comes first

Hand a cold agent `npm run oracle` output and one real outline, and nothing else.
Count the oracle iterations to clean. Read what it got wrong. The failures name
which of the twelve facts matter and whether the outline format carries enough.

The first run is a measurement. It has no pass mark.

---

## Item 5 — the playbot

### It is already specified, and almost already built

`docs/specs/a-turn-costs-what-the-last-turn-did.md` is a ten-clause spec with a
`## Decisions` section and measured numbers behind every ruling. It was written,
argued and never implemented; the tooling around it was deleted and the record
kept. **Nothing on this branch re-decides it.** The work is to implement it.

Standing already, checked on this branch:

- `@anthropic-ai/claude-agent-sdk` is in `package.json` and in `node_modules`
- `adoptRegistry` (`src/runtime/session.ts`) is built and tested against content
  changing under a live session — c7 needs no new runtime
- `apply` and `applyDirective` are the two input surfaces c6 names, and both exist
- 14 `# save` fixtures exist, which is the start-anywhere lever

`scripts/playbot.ts` is the only thing missing.

### What the spec already answers, so it is not asked again

**The four constraints are all ruled on.** Local and on the plan rather than an
API key: the Agent SDK is what puts a turn on the author's subscription, and that
is the reason it was chosen. Cheap: measured. Asynchronous mid-run edits: c7.
Feedback at every point: c8's `expected`/`confusion` pair, which the spec calls
the run's actual product — a run recording only moves has produced nothing an
author can act on.

**One harness, several prompts** is c1, and it is stronger than "same harness,
different prompt": below the point where a prompt is selected there is to be no
branch on which prompt was chosen, and the proof runs a turn under each and
asserts the request bodies differ in the system block and nowhere else.

**A restart on edit is not needed** and the deliverable no longer contemplates one.

### The one correction to make, and it inverts an instinct

The playbot must **not** be made as small as possible. Measured 2026-08-15: a
frozen prefix under 1024 tokens does not cache at all — a 932-token prefix billed
932 fresh on every turn with zero cache reads, while a 6,450-token prefix wrote
once and read 6,450 on every turn thereafter. 1024 is a cliff, not a target, and
the prefix belongs comfortably above it.

The cost ladder for one turn: full harness default 45,927; `tools: []` 35,245;
tools off plus `settingSources: []` 5,849; both off and `cwd` outside the
repository 296. `settingSources: []` alone does not isolate — working directory,
git status and auto-memory ride a dynamic section a string system prompt does not
remove, so c4's fourth opt-out is the load-bearing one.

For contrast, the shape this replaces: a Claude Code subagent playing the same
game was measured at ~44k tokens per turn and growing without bound, because it
carries its transcript as memory.

### What is stale in the spec

c10 proves through `npm run tasks -- merge-ready`, which was deleted with the
workflow tooling. It becomes `tsc --noEmit`, `npm test` and `npm run layer-check`.

### Not scored on reachability

Independent paths mean no run reaches everything, and the union across runs is
confounded by which paths were taken. A turn bound plus the player's own
`expected`/`confusion` is the frame. Reachability-of-the-union stays worth
computing as a floor — nothing authored is orphaned — but it is a by-product.

---

## The ordering, which the corpus decides

The corpus holds five locations, all of them tutorial island. There is no town.
Every quest note in `.planning/planning_quests/` starts *speak to Kelsa* or
*around the back of the castle*, and a quest modifies entities and locations
rather than creating them, so there is nothing yet for those quests to modify.

The playbot spec reached the same wall from the other side and restored its
`requires starting-zone` edge on it: a player cannot walk to the edge of a world
with no rooms, so the loop cannot bootstrap a zone from nothing.

So the town is first, and it is also the right first subject for item 3's
measurement. The ten quest notes are **not** to be finished before it — they vary
from a premise-and-reward to named flags with per-stage hints, and how much
outline detail the loop actually needs is precisely what the first run is meant
to measure. Levelling them all up first would delete the experiment.

---

## What the outline answers settled

`.planning/starting-town-outline.md` came back corrected. The rulings that change
what gets built, rather than what gets written:

**Tulsa is the town and effectively the region; the kingdom is Yanodonin.** The
town carries z-layers — basements, surface, roofs — and each place is its own
location, sometimes several adjacent ones, so that travel has distance and
enemies separate naturally. Densely connected, mostly bidirectional, read as a
text adventure. No `look` or `sound` vocabulary, at least not yet.

**Tutorial island is scrapped as a concept, and it costs two lines.** Miki is
joking about escaping it; the player is on the mainland the whole time, and the
joke becomes a quest that runs the length of the game. The instinct is that this
is a rename with a long tail — `tutorial-island` occurs 376 times across 40 files.
It is not. Every one of those is machine-facing: the module id, flag and item
namespaces, save fixtures, test fixtures. The player-visible fiction is two lines
of prose in `content/tutorial-quests.dsl`, at 22 and 85. The module keeps its id
forever and no player ever meets it.

**Renaming the namespace is therefore ruled out**, and this note exists so it is
not proposed again. It would touch 40 files, churn every save fixture, and buy
nothing a reader could see.

**The eleven unheld mechanics were triaged by the author**, and the triage is in
the outline beside each one. Two results matter to ordering: screenshake is
removed outright, and instanced areas are backlogged as being the same thing as
respawns plus death mechanics. The rest are believed reachable, several with
implementation work, and `use`-a-weapon-on-an-NPC is to be a dialogue option
instead. That triage is what an authoring agent should be handed so it knows
which `@@@` are expected.

---

## What Yonatan has to deliver

1. **Corrections to a town outline**, which is extracted from the cast and places
   the quest notes already name — Kelsa, George, the town crier, Mouse, Larry,
   Charlie the Tramp, Oolga, the duke, the guard captain, the bladesmith's son,
   the barman; a market district, sewers, a castle, an apiary, a tavern; and
   Miki's house joined to the town. Correcting is cheaper than authoring, and the
   corrections are the specimen the outline format is read off.
2. Nothing else. The reload question is closed and the quest notes stay as they are.

---

## Where this stands, 2026-08-22 — the phase after Tulsa

Items 3 and 5 are both built and both have run. What is open is no longer *can
the loop produce a module* — it did, twice — but **what has to be true before the
next ten modules are worth writing.** Four things, and they are ordered by what
blocks what.

### 1. The region wall — closed

Adjacency is symmetric by construction; a road answers from both ends and a
module may name a location in the module beneath it. Tulsa hangs off where every
route out of Miki's house lands. Detail and the lesson in `run-findings.md`.

**`tutorial-island.dsl` is not being deleted, and the reasoning is worth keeping**
because the instinct will come back. The module is two things — engine furniture
(lines 6–465: stats, resources, factions, skills, slots, passives, cluster
jewels, orbs, modals, `melee-combat`, the death event) and Miki's house (466–824).
Only the first has dependents. Deleting the module means rehoming ids named 100+
times across ~16 code and content files plus every `# save` body, to buy nothing
a player can see — and it would not have fixed the road, which was the actual
complaint. The id is machine-facing and outlives the fiction it was named for.

### 2. Module size — a removability unit, not a size unit

**One module is one file** (two files declaring the same `# info` id is refused),
so "chunk a region" and "split its namespace" are the same act. The rule:

> A module is what you can take out and still have a world that loads.

By it: Tulsa standing is one module and stays one. Each of the ten quests is its
own module, per the `tutorial-quests` pattern — and a quest module adds to
entities rather than editing `tulsa.dsl`, so the file nobody wants to re-read
does not get re-read. Splitting Tulsa geographically buys nothing and fragments
the ids all ten quests are about to name. 962 lines is not the pressure point; if
a region file passes ~1500 and still cannot be split by the rule above, the region
is doing two jobs.

### 3. The writing — a human pass over 492 lines

`npm run review` is the sheet, and `content/reviewed.tsv` is what makes it
resumable. Both derive their subjects; nothing is marked by hand and nothing is
enumerated. A line rewritten after it was signed off comes back marked CHANGED,
which is the case that matters while agents edit the same modules a person is
reading.

**The review is the long pole and it is Yonatan's, so everything else is
scheduled around it.** Agents work below `src/` while it runs; content-editing
passes wait.

### 4. The hardening pass — after the playbot, not before

An exploratory playbot run over the beginning of the game and Tulsa comes first,
because its `confusion` reports say which lines are actually confusing. Reviewing
blind and then hardening would do the same reading twice.

**Map churn is deliberately deferred to that pass.** The beach stops making sense
once Miki's house sits in Tulsa properly; `tutorial-island.market-district` is a
stub duplicating `tulsa.market-square`; `combat-expansion.proving-ground` and
`tulsa.market-row` now collide at x:3,y:0. None of these are worth a hand-fix
while the map is moving — a playtest names them better than a reading does.

### What is not on this list, and why

`one-way` roads: designed, deliberately not built. Nothing in the corpus needs
one and the map is churning; the keyword is ten lines the day a chute exists.

Renaming the `tutorial-island` namespace: still ruled out, for the reasons in
"What the outline answers settled" above.

