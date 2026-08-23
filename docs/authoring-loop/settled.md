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
visit.** They are mutually exclusive: `again:` is unreachable on a `sticky` node.
Without either, a node is said once and then falls silent.

**A line the game says may carry `@@@` and still be played.** `@@@ <words>` means
*unreviewed, or here is what I wanted and could not get*; the engine drops the note
and says the rest. It does **not** mean "leave it blank" — a bare mark on an
otherwise empty line is a line the game says as nothing.

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

## Modules

**One module is one file, and a module is a removability unit, not a size unit.**
Two files declaring the same `# info` id is refused, so "chunk a region" and "split
its namespace" are the same act. The rule: *a module is what you can take out and
still have a world that loads.* Tulsa standing is one module; each quest is its
own, and a quest module adds to entities rather than editing the region's file.
962 lines is not a problem.

**`tutorial-island` keeps its id forever and is not being deleted.** It holds the
engine furniture every region depends on — stat bases, the health pool, factions,
`melee-combat` — plus Miki's house. The id is machine-facing, no player meets it,
and renaming or merging it would churn a hundred references across sixteen files
and every `# save` body to buy nothing visible. **Renaming the namespace is ruled
out; do not propose it again.**

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

## The tools

- `npm run probe -- content --test <id>` runs one `# test` in about a second.
- `npm run oracle` prints the grammar; `--at <draft>` reads a draft against the world.
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

**The symptom is real and the first-named cause is usually wrong.** Four times now
a bot or an agent has reported something true and diagnosed it one layer too low —
"health tracking is broken" was a restarted cycle, "talk is non-functional" was a
spent node, "a merged section cannot print back" was a missing landing, "this is a
balance call" was a semantic circularity. Reproduce before believing the cause.

**A cold agent is cheap at executing a ratified design and honest about hitting a
wall**, and it will describe the wall in the vocabulary of the layer it was
standing in. Re-reading the wall one layer up is where the leverage is.
