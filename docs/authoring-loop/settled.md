# What is already decided

For an agent starting cold. Every line here is **true now** and was expensive to
learn — most of them were learned by getting the opposite wrong first. None of it
is history: git holds why, and the commit that settled a line is where the
reasoning lives. If a line here is wrong, the code changed and the line should be
deleted, not annotated.

Nothing open lives here. That is `open.md`.

## The language

**Adjacency is symmetric by construction.** Write a road once; the engine derives
the return edge with the same condition unless the far end writes its own, which
always wins. `Location.adjacent` stays exactly what the author wrote, and the
effective relation lives in `Registry.roads` behind one accessor. Every road in the
corpus runs both ways — there is deliberately **no `one-way` keyword** until
something needs one.

**`sticky` replays a node whole; `again:` is what a non-sticky node says on a later
visit.** The engine refuses both on one node, since `again:` is unreachable on a
`sticky` one. Without either, a node is said once and then falls silent — and a
conversation whose every node has fallen silent is no longer offered at all, so
`reachedNow` returns nothing rather than a node that would say nothing.

**Talking to someone offers every thread they hold open, and the player picks.**
A thread is a node that says which moment is its turn (`when:`) or what it is
called (`ask:`); a node offering only `always` is not a thread but what they say
when no thread is open. One thread open is entered outright, so nothing gains a
click. Threads are ordered by the words the player reads, never by declaration
order — no module takes a place by loading earlier. Before this, the winner was
whichever module parsed last, which silently made an earlier quest's opening
unreachable for fifteen turns of a run.

**`hint when <condition>: <text>`, and the last one whose condition holds wins.**
So a plain `hint:` written above is the default and each conditional line below is
an exception to it. It sits in a stage block and at a quest's top level, the same
line in both. The condition goes before the colon because everything after a colon
is the value. A stage's `log:` has **no** such form yet.

**A line the game says may carry `@@@` and still be played, and may not be
silence.** `@@@ <words>` means *unreviewed, or here is what I wanted and could not
get*; the engine drops the note and says the rest. Because the note is dropped, a
line that is *only* a mark is silence, and the engine refuses it at load naming the
line — so the mark goes beside the words, never in place of them. The sweep reads
`everySaid`, the same table `npm run notes` and `npm run review` read, so a kind or
a field added next month is covered with no edit.

**`assert:` reads `xp`, `resource`, `inventory`, `stat`, flags, `time`, `visits`
and `player.<field>`.** The resolver is a `Record` over the grammar's own roots, so
a root added there does not compile until it reads something. An unknown id under a
root is refused at load.

**`until <done | condition>` runs an action to a terminator.** The condition is the
same grammar `assert:` takes — no second predicate language. `done` means nothing
is under way. There is exactly one stepping loop, `resolveUnderWay`, and it takes
the stopping test.

**A terminator may only follow a payload that spells itself out.** `choose:` is
free text a player is shown and may contain the word "until", so the split is tried
after free text and before anything that would swallow the tail.

**Content claims live in `# test`; TypeScript tests are for mechanics.** A claim
about a number is `assert:` or a `# save` compared with `expect only:`, which
matches just the keys the save declares.

**`expect only:` is the default; whole-sheet `expect:` has to earn itself.** Two
arguments earn it and no third has been found. One: the claim is that a roll
*happened*, and the cursor moves whether or not it yielded anything, which no
assertion can name. Two: **the claim is an absence** — `expect only:` compares the
keys a save names, and a sheet recorded after a buff lifted has stopped naming it,
so the narrow form would also pass in a world where the buff never expired. A test
that walks anything must state its claim in words (`assert:` or `refuse:`), and
`dsl.test.ts` reports one that does not.

**State the quantity the test names in its own title.** A one-line content change
broke fifteen tests whose claims were all still true; they were exact about
something else. A buff's *contribution* is not the stat's *total*, and damage is
not `max - current` once anything regenerates. The fix is a difference, never a
tolerance band — a band would also pass in a world where the mechanic did nothing.

## Modules

**One module is one file, and a module is a removability unit, not a size unit.**
Two files declaring the same `# info` id is refused, so "chunk a region" and "split
its namespace" are the same act. The rule: *a module is what you can take out and
still have a world that loads.* Tulsa standing is one module; each quest is its
own, and a quest module adds to entities rather than editing the region's file.
962 lines is not a problem.

**`core` holds the furniture and stands nowhere.** Stat bases, the health pool,
the death event, factions, skills, slots, modals, the player, passives, cluster
jewels, droptables, generic items, recipes with no station, and `melee-combat`.
It declares no location, no entity that occupies one and no line anybody says —
those belong to the region they happen in, which is why Miki's house, the beach
and everything standing in them are `tulsa`'s. The one `# test` core owns is the
only claim that can be made without walking anywhere.

**A recipe naming a `station:` is refused unless something in the loaded universe
opens that station**, so a recipe lives with whatever opens it: `bread` went to
`tulsa` with the oven, `dough` stayed in `core` because it names no station.

**A bulk id move is done by `npm run move-sections`, never by hand.** It lifts
named sections out of one module into another, writes every machine form of their
ids across `content/`, `src/` and `scripts/`, and refuses unless the reloaded
registry differs from the one before by exactly those ids —
`registryDiff(before, after, rewrite)`, which derives its subjects from the
section list. `npm run rename-module` is the whole-module case and owns the rule
for what an id written whole looks like.

**A downstream module reaches an upstream thing by owning the statement and letting
the engine land the effect** — the way a `# quest` hands a dialogue to the entity it
speaks through. The corpus uses **zero** `+` field edits. A blocker phrased as *the
engine will not let me write X* is usually asking the wrong question; ask instead
what this module already owns and what the engine should derive from it.

## Running an action

**Issuing an action carries it to the end of one of its own cycles**, and
re-issuing the same action against the same target advances it rather than
restarting it. Control returns after each cycle, which is what keeps breaking off
mid-fight possible. A live driver (the GUI) ticks an armed action to completion on
its own and always did.

**In flight and offerable are different questions.** *Which action is seated here*
is a fact about state and lives in `src/runtime/actionLookup.ts`, beneath action
legality; *may it be performed* reads conditions. Conflating them has now caused
three separate bugs, and once `stat` is a condition root it is circular besides.
`stat.test.ts` demonstrates the circularity rather than arguing it: folded through
offerability, an action granting `+5 attack` whose `requires:` reads
`stat.attack >= 6` exhausts the stack.

**Everything here is simulated time.** Wall clock belongs to the GUI and the live
REPL, which tick simulated time at a constant rate. Nothing below them may read it.

**An action under way is bounded at four simulated hours**, exported and named in
the failure text. It replaced a 1000-*cycle* cap, which was about 1000 seconds for
a swing and about fifty hours for a craft — not a bound anyone could reason about,
which is why the respawn treadmill got past it. Hitting it is a directive failure,
deliberately not `on unfinished:`: that is an authored outcome of `attempts:`
running out, and a backstop the engine applies is not content. The longest wait-out
any `# test` reaches is 21.6 simulated seconds.

**`on death: stop` is a designed terminator.** A dangerous action risks dying and
stopping is the system working. It is not the bound above and must not be routed
around. Note that a regenerating player may now never die, so death can no longer
be relied on to end anything.

**A progress figure is published only when it has counted something.**
`completion` is `number | null` and `stillToCount()` is the one home; a renderer
shows a figure when there is one and says nothing when there is not. **Exactly one
shape makes it non-null:** an untargeted action — no `depletes:` and no `my`/`their`
anywhere — whose plain `damage:` reads under 1, so its cycle takes several attempts
and `implicitTarget` sits below full while control is out. Every other shape either
deplete-counts a named pool instead, or resolves in one attempt and is back at full
before anyone can look. A **side-naming** action with nothing to deplete is refused
outright, which is why `resolvesPerAttempt` is exactly targetedness. `tulsa`'s
dead alder is the corpus's one writing of it — four swings of `damage: felling` at
0.25 a swing for one log — so the terminal's `engine.repl.live.counting` line and
`LiveSheet.tsx`'s implicit bar are lit by shipped content and are **not dead code
to delete**. The unsided `damage:` that makes the cycle multi-attempt is a form
`npm run oracle` does not print; see `open.md`.

**Prune records are addressed to whoever loaded the save, not to the player.**
They travel as `PruneWarning[]` — stderr and the run log for the playbot, a
warn-toned tool message beside the view for the terminal and the GUI. They are
written in save-key vocabulary a player never wrote and cannot act on.

## The tools

- `npm run probe -- content --test <id>` runs one `# test` in about a second.
- `npm run oracle` prints the grammar; `--at <draft>` reads a draft against the
  world, **answering with the refusals and the verdict only** — the per-line
  reference walk is `--walk`, and it is 3000 lines for a 950-line file. A draft is
  the module its own `# info` declares, so `--at` answers for a file that already
  ships by replacing the shipped copy rather than colliding with it.
- `npm run notes` lists every `@@@` the corpus holds.
- `npm run review [-- <module>]` is every line the game can say, under the section
  that says it; `--read-through <section>` marks a sitting as read. What has been
  read is kept in `content/reviewed.tsv` against a hash of the words, so a line
  rewritten after someone signed it off comes back marked CHANGED.
- `npm run playbot -- --save <id>` opens a run on a `# save` fixture, so a region
  has to be reachable only once.

**The set of things to review derives itself** from the locale tables the engine
builds off each kind's declared prose fields. Nothing is marked by hand to appear
on the sheet, and `@@@` keeps meaning what it means.

## The playbot

**A turn costs what the last turn did.** Measured: 2–6 tokens billed in per turn
against thousands of cache reads, from the second turn onward. **The prefix must
stay comfortably above 1024 tokens** — that is a caching cliff, not a style
preference, and a 932-token prefix cached nothing at all.

**One harness, several prompts.** Below the point where a prompt is selected there
is no branch on which prompt was chosen, and no branch on whether a save was
loaded. `scripts/playbot.test.ts` asserts it.

**A run that stops early with honest notes is a success.** The run's product is the
player's own `expected` and `confusion`, not the moves — a run recording only moves
has produced nothing anyone can act on.

## What the loop keeps teaching

**A claim that a shape is unbuildable is a measurement, not a reading.** The one
shape that lights the implicit countdown had a green assertion sitting in
`command.test.ts` the whole time the branch was queued for deletion as dead code;
the reading that condemned it generalised a refusal that only covers *side-naming*
actions. Before writing *nothing the engine can build does X*, build it —
`npm run inspect` drives a live run over a throwaway module in seconds, and it
answers for the shapes as well as for the corpus.

**The symptom is real and the first-named cause is usually wrong.** Seven times now
a bot or an agent has reported something true and diagnosed it one layer too low —
"health tracking is broken" was a restarted cycle, "talk is non-functional" was a
spent node, "a merged section cannot print back" was a missing landing, "this is a
balance call" was a semantic circularity, "a fight is broken and the enemy heals"
was a kill nobody announced, "a quest is softlocked" was declaration order deciding
who speaks, "the status line lies" was a figure that had never once been meaningful.
Reproduce before believing the cause.

**A cold agent is cheap at executing a ratified design and honest about hitting a
wall**, and it will describe the wall in the vocabulary of the layer it was
standing in. Re-reading the wall one layer up is where the leverage is.

**A bot's reading of the fiction is evidence about the writing, even when it is
wrong about the mechanics.** Two runs concluded the orbs must heal, because they
are called Renewal and Vitality; they are item modifiers. Two read the mirror
re-offering character creation as save corruption; it is permanent by design and
the player may rename themselves whenever they like. Neither was an engine bug and
both were real findings — the words were doing something the author did not intend.

**Several agents on one checkout share the git index.** They must never run
`git add`, `git commit` or `git stash`; the orchestrator commits alone, by
pathspec. And **a test run read against a tree another agent is mid-write on is
worthless** — one suite went 14/32 failing then 32/32 minutes later with no edit
between. Re-run before believing a failure. A bulk id rewrite runs alone on a quiet
tree, because its blast radius intersects every other lane.
