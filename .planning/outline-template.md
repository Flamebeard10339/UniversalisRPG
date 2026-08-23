# Region outline — the template

Copy this file, fill it in, hand it to an agent. What comes back is one
`content/<region>.dsl` holding the region **standing**: its places, the roads
between them, the people who live there, what they sell, and what is already
hostile. Not its quests — see *What this region must not hold*, below.

`.planning/starting-town-outline.md` is the worked example and
`content/tulsa.dsl` is what it became. Read the pair when a prompt here is
unclear; do not copy the specimen's shape, because half of it was scaffolding
for a correction pass that has happened.

**This file says nothing about the language.** `npm run oracle` prints the
grammar, per kind, from the kinds' own declarations, and `npm run oracle -- --at
<draft>` reads a draft against the loaded world. An agent that finds itself
guessing at syntax has skipped a step, not found a gap in this template.

A rough outline is one page. Under-specifying is cheap — the agent decides, or
asks, and `npm run review` catches what it decided badly. Over-specifying is
waste, and it is waste that has to be read.

---

## Required

### 1. What this region is, and where it hangs off

*One paragraph.* What the place is, what part of the arc happens here, and —
load-bearing — **which existing location it connects to**, by id. A region with
no road into the standing world is a region nobody reaches.

Say if it spans z-layers (roofs, cellars, tunnels). Do not say which places sit
on which; the agent reads that off the list below.

> Tulsa: a town, a castle, sewers under it and a swamp on the way out; it hangs
> off the beach east of `guide-house`, which is where every route out of Miki's
> house lands.

### 2. Places

*One line each: what it is, and what it is for.* Say which places exist because
a quest has to land somewhere, and say so by naming the quest.

The **only** connectivity you have to write is the part an agent would get
wrong:

- roads that are **gated** — *this one opens only once the toll is paid*
- roads that go **one way** — *there is a window and it is a drop*
- places that are **deliberately hard to reach**, and what the two routes in
  cost differently

Everything else: say *densely connected, read it as a text adventure* and stop.
Tulsa's outline said exactly that and got thirty locations with a coherent map.

### 3. Cast

*One line of voice per person.* Who they are, **how they talk**, and what they
are wrong about. This is the part the agent cannot invent and the part that
survives into the shipped module almost word for word — *blunt to the point of
rude*, *confidently wrong and says 100%*, *sends you on invented errands and
does not apologise for it* all landed.

Name anyone a quest speaks through, even if they have nothing to say yet. They
still need to exist and still need a voice.

Do **not** write their dialogue. That is prose and prose gets reviewed once.

### 4. What is already hostile

*One line each: what it is, where it lives, and how it compares to what the
player is carrying by the time they get there.* "Aggressive throughout past the
swamp edge" is the right resolution. Stat blocks are not.

### 5. What is bought and sold

*The kinds of shop and roughly what they stock.* Not prices. Tulsa's outline
said "probably a fishing store, a general store, potentially an axe store" and
the module set every price and closed an economy test on them.

### 6. What this region must **not** hold

**A quest lives in its own module, and the world still loads without it.** The
region module holds no `# quest` and no stage. A quest module depends on the
region, gives its entities more to say, and is removable: take it away and every
place still stands and every person still has a word for a traveller. Nothing in
the engine enforces this — it is a convention, and it is the one that keeps the
region reviewable.

So list here, for each quest that will land in this region:

- its name
- the **one or two things the region must stand up** for it to land on — a
  person, a prop, a room
- nothing else about it

Then the region's author builds those things with no quest behind them, and
marks with `@@@` whatever is waiting on the quest — Tulsa's anvil, Oolga's
counter and the third hive are all standing, usable, and marked.

Each of those quests gets its own outline later. Not this one.

### 7. What the notes assume the engine may not have

*A list of mechanics your source material takes for granted.* Instanced areas,
a door that locks behind you, skill-gated actions, an ally whose death loses the
fight, fleeing an encounter. You do not have to know which of these exist.

The agent's instruction for this list is fixed: **verify against
`npm run oracle`, and where the engine cannot do it, write what it can, leave
`@@@ <what was wanted>` beside the words, and move on.** Never invent a
mechanism. `npm run notes` collects those marks and they are the feature queue —
this is how the loop's own findings get out of a session.

---

## Optional

**Names.** The kingdom, the river, the currency. One line each. Cheap, and they
turn up in `examine:` lines you would otherwise have to correct later.

**Antagonists and lore that are not standing yet.** Tulsa's villain, his
lieutenant, the wasp, the groundwurm — none of them appear in `tulsa.dsl`,
because all of them belong to quests. Write them if you have them; they cost the
region nothing and they save a later outline.

**A dependency sketch of the quests.** Worth drawing once there are more than
about three, because it is what tells you which parts of the region are
load-bearing and which can wait. Tulsa's said the forge and the reporter could
wait, and they did.

---

## What an outline does not settle

Everything here the agent decides, and has decided well:

- **coordinates, distances, and the direction of every road**
- **stat blocks** — attack, health, accuracy, respawn timers, xp awards
- **prices, and what a new player can afford**
- **items, drop tables, and recipes**
- **ids**
- **how many rooms a building is**
- **the prose** — every `examine:` and every line anybody says

The last one is the one worth arguing with. The writing is judged in
`npm run review`, once, by a human. An outline that pre-writes prose gets the
same words read twice and reviewed in the wrong place. Give the agent the voice
(§3) and let it write the lines.

---

## Two conventions the engine does not enforce

For whoever writes the `.dsl`. Neither is refused at load, so neither shows up
in `oracle --at`.

**A quest lives in its own module.** §6 above, and `content/tulsa.dsl`'s and
`content/tutorial-quests.dsl`'s own headers say it of themselves. The corollary
is the part that gets forgotten: every entity a quest speaks through keeps an
`always` node of its own, so it has something to say when no quest is loaded.

**The screen already announces some progress, and not other progress.** xp
gained, items arriving in the pack, a skill crossing a level and reaching a place
for the first time are all acknowledged on their own — the UI diffs the view and
draws it. So `say: You gain 40 woodcutting experience` is the same fact twice;
write what happened in the fiction and let the number announce itself.

A **flag being set and a quest stage changing are not acknowledged** anywhere
outside the journal. If the only thing an action did is set a flag, the player
sees nothing at all unless the content says something. Say it.
