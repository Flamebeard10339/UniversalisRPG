# combat-encounter-grammar

## Deliverable

One design document at `docs/combat/encounter-grammar.md`, and no code. The defect it is written
against is in the authoring surface, not the runtime: on `# entitytype melee-foe`, `fight` and `bite`
are identical clause for clause except the word `retaliates`, and what makes them opposite is which
side is `self` — a mapping that exists as a comment at `src/runtime/encounter.ts:58` and a comment at
`content/tutorial-island.dsl:288`, and nowhere in the grammar. So `target: health` on a rat cannot be
read locally: whether it means the rat's health or the health of whoever the rat hits depends on a
bare tag four lines away and a rule documented in a file the author may never open. Entity-owns-action
compounds it — the rat owns `fight` and is its object, owns `bite` and is its subject. This branch
proposes one grammar in which that ambiguity cannot be written, with worked examples chosen to be
intuitive to author rather than to fit the code that exists. It is first in its chain because it is
the requirements document for the two branches behind it: whether an author addresses an individual
spawned rat, whether a fight names its sides by type or by instance, and where a respawn timer is
written each decide what `instanced-objects` must store, and designing that substrate before them is
guessing.

Proof:

- [c1] The document states the invariant its grammar exists to hold, and it is a property of the
  text rather than of the engine: **every field in an authored combat block names the side it reads,
  from that block alone**. A reader holding only the page can say what `target: health` refers to. A
  proposal where the answer depends on a bare tag elsewhere in the block, on which section the block
  is nested under, or on a rule documented in another file has not met it, and the document says so
  against its own proposal rather than only against today's.
- [c2] Ownership is decided and argued. Today an entity owns both the action in which it is the
  object and the action in which it is the subject; the document says who owns an encounter's moves —
  the entity, the encounter, a side, or something else — and shows what that decision does to
  `# entitytype melee-foe`, whose two blocks collapse to one under some answers and not others.
- [c3] The three questions the branches below are waiting on are answered as rules, not as examples,
  because each one decides what the instancing substrate stores: (a) whether an author can address an
  individual spawned rat, and if so in what written form; (b) whether a fight names its sides by
  type or by instance; (c) where a respawn timer is written — on the spawner, on the spawned thing,
  or on the place that holds it. An answer of "not addressable" is a real answer and is preferred to
  a mechanism nobody has a use for.
- [c4] Four shapes are authored end to end, complete enough that a reader could parse them, not as
  fragments: one player against one rat; a location holding five rats, each respawning thirty seconds
  after it dies; a fight with more than two participants, where the sides are not "me and it"; and a
  felled tree that regrows after sixty seconds, which is the same spawn model with no combat in it.
  The fourth is load-bearing — a spawn model that only reads as combat will grow a second mechanism
  for everything else.
- [c5] The shipped content is rewritten side by side. `# entitytype melee-foe` and `# entity
  giant-rat` from `content/tutorial-island.dsl` appear as they are today and as they would be written
  under the proposal, verbatim in both columns. This is the smallest available check that the
  proposal is more intuitive rather than merely different, and it is the one a reader will actually
  perform.
- [c6] Expressiveness is accounted for against what ships. Every combat behaviour authorable today is
  either expressible in the proposal or named as deliberately dropped with its reason: `retaliates`,
  `escape after` and `on escape`, the implicit target pool an action with no `target:` gets,
  `accuracy` / `evasion` / `ability` / `dr` and which side each reads, `rate:` naming a stat read
  live, and `# entitytype` action templates. A behaviour the document does not mention has been
  dropped by accident, which is the failure this clause exists to catch.
- [c7] The document names its own blast radius as a forecast for `full-refactor-of-enemies-and-combat`
  — which of `src/grammar/action.ts`, `src/content/entity.ts`, `src/content/entityType.ts`,
  `src/runtime/encounter.ts` and the shipped content change, and which do not — while changing none of
  them. A design that cannot say which files it lands in is not specific enough to implement.
- [c8] Collisions with queued work are reconciled on the page rather than discovered by whoever
  merges second. `combat-events` writes all four files above and proposes on-hit / when-hit hooks;
  `buffs-generalized` makes every entity carry buffs; `result-application-seam` gives a result a
  subject actor; `non-entity-action-owner-inherits-player-stats` adds two load-time bans written to be
  cheap to carry through this refactor; `starting-zone` will author monsters in whichever grammar
  exists when it is worked. For each, the document says whether the proposal subsumes it, is
  compatible with it, or requires it to be re-planned. `combat-events` in particular arrives with
  rulings already recorded against it — that it drops its symmetric when-hit block because thorns
  decomposes as a stat plus an effect fired by damage-taken and carried by the actor, that
  action-declared on-hit survives because its scope differs, that rage is a resource rather than a
  stacking buff, and that it drops its own chance mechanism in favour of `droptables`' wrappers. The
  document reads those before proposing anything that would reopen them; a proposal that overturns
  one says so and argues it, and one that overturns it silently is the failure this clause catches.
- [c9] The player is placed. `participants()` special-cases `PLAYER` and `statRange` gates on
  `actorId === PLAYER`; `full-refactor-of-enemies-and-combat` intends to delete both by making the
  player an instance like any other. The document says what the player looks like written down —
  whether they have an `# entity`, whether an author can name their side, and what the grammar reads
  from them — because that is what decides whether those two gates can go.
- [c10] Exactly one grammar is proposed. Alternatives considered are recorded with why they lost; a
  document ending in a menu hands the decision to whoever implements it, which is the failure this
  branch exists to prevent. Where a choice is deliberately left open, it is listed under the
  document's own open questions and names who decides it.
- [c11] It is short enough to hold in one sitting and states its proposal before its argument. Its
  reader is the worker on `full-refactor-of-enemies-and-combat`, who needs the rules and the examples;
  the deliberation is for the reviewer and comes second.
- [c12] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests,
  layer-check, audit-status, doctor and the byte check in one invocation.

## Goal

Settle how combat is written down, so that the substrate beneath it and the refactor above it are
built against a decision instead of against each other.

## Decisions

- **Grammar before substrate, and both before the refactor.** Recorded as a decision on
  `src/runtime/instances.ts` on 2026-08-05 and restated here because it is this branch's whole
  reason to exist: the substrate's contents follow from the authoring surface, so designing it first
  is guessing. A single mega-branch was considered and dropped, since instancing merging only at the
  end would make `items-mods-and-crafting` wait on the combat refactor after all.
- **No code, deliberately.** A design document that also edits files is reviewed as a diff, and the
  argument — which is the whole deliverable — is read last if at all. `graph-based-items-research` is
  the precedent: a document-only branch that gated an implementation branch, and whose value was the
  judgement rather than the volume.
- **This branch registers no concept.** `produces: combat encounter grammar` on the record stays a
  forecast. A document is a branch's output, not a durable capability the repository knows how to do;
  the capability arrives with `full-refactor-of-enemies-and-combat`, which is where it gets
  registered against the files that implement it.
- **`docs/combat/` is where it lands, and `docs` is already `unowned` in
  `docs/audits/systems.json`.** Nothing tracked lives under `docs/combat/` today — the
  deliverable-log that was there was deleted, and one of its numbers was overturned by a recorded
  decision on 2026-08-04. So the file needs no manifest edit and `audit-status`'s partition holds
  unchanged.
- **The system is the DSL load path even though nothing in `src/` changes.** The subject is the
  language, and the branch that implements it writes `src/grammar` and `src/content`. Filing it under
  Runtime because `encounter.ts` holds today's comment would attribute the design to the code it is
  written against.
- **One task, not a decomposition.** The deliverable is one document; cutting it into slices would
  put several writers in one file, which the workflow names as the most expensive recurring mistake.

## Open questions

Delegated to the worker who writes the document:

- Whether sides are a first-class authored thing (a named side with members) or an implicit
  consequence of who initiated the encounter. c1 constrains the answer without choosing it.
- Whether spawning is authored on the location, on a spawner declaration of its own, or as a property
  of the thing spawned. c3(c) forces an answer; which one is the worker's, and c4's tree example is
  the case that will decide it.
- Whether `# entitytype` survives as a mechanism. If the proposal collapses `fight` and `bite` into
  one authored move, the template's reason for existing may go with it — that is a legitimate finding
  and belongs in the document rather than being worked around.
- Whether the document should recommend retiring `combat-events` as a separate branch or leave it
  standing. c8 requires a position; taking the position is delegated.

## Audit passes

### Pass 1 — 2026-08-09

- base: `af892db6fd7684dde4cb72d55dfbeb208923516b`
- head: `7cf396203d83436802443979aa08d27e10d086ef`
- proof 1: met — Invariant stated at docs/combat/encounter-grammar.md:9 as a property of the text, not the engine: "Every field in an authored combat block names the side it reads, from that block alone." The three disqualifying answers c1 names (bare tag in the block, enclosing section, rule in another file) are restated verbatim at :11-13. It is turned against the proposal at :462-485, "What the invariant buys, and where it does not hold", which names two places it fails under this grammar - attempts: not saying whose attempts (:474-477) and an action with accuracy: and no depletes: keeping the abstract pool (:478-480) - and records that aggressive was a third until factions landed (:482-485). Its account of today's failure is accurate: the mapping comment is at src/runtime/encounter.ts:58 ("One shape, both directions: speed/ability read self, target/dr other") and at content/tutorial-island.dsl:289, both verified at those exact lines, and the doc corrects the spec's own off-by-one (spec says dsl:288). Filed one gap the self-criticism misses - a handler say: is still in the player's voice - as a finding rather than as unmet, because the clause asks for the invariant and a self-directed failure list and both are present.
- proof 2: met — Decided in one sentence at docs/combat/encounter-grammar.md:489: "An action is owned by nobody and performed by one participant." What it does to the template is stated in the same line - it "collapses # entitytype melee-foe from two blocks to zero" - and shown at :430-455, where the rewritten content carries one top-level # action melee-combat and the entity carries uses: melee-combat, with no entitytype section at all. The argument for it is at :492-501 (the oven has no second block where it roasts something at you; entity-owns-action is the only place in the grammar where the owner is sometimes the object) and six alternatives are recorded with why they lost at :503-520, including the two that would have kept the template - "the entity keeps a fight: block and the swing moves to a shared move" and "# entitytype survives, restricting actions to permitted entity types". Re-runnable against src/content/entityType.ts, which today holds actions and nothing else, and src/content/entity.ts, whose type?: string field the blast radius marks deleted.
- proof 3: met — All three are answered as rules at docs/combat/encounter-grammar.md:522-546, each under its own bolded question. (a) :524-528 - "No, in any written form", with the consequence spelled out for the substrate ("instance ids are minted by the runtime, never written down, and never parsed"), which is the "not addressable is a real answer" the clause prefers; :529-535 adds the authored tell for what is durably instanced (skills: on an entity). (b) :537-539 - "By type", with allies: 2 bandit naming a template and a count and no fight declaring a roster. (c) :541-546 - on the spawned thing, respawn after: 30s on # entity giant-rat, absent meaning never, with the count staying on the place, and the losing alternative (timer on the place) recorded with its reason. Each is a rule quantified over all cases, not an example; the worked shapes at :283-304 and :340-371 exercise (c) on a rat and on a tree.
- proof 4: met — Four shapes at docs/combat/encounter-grammar.md:236-374, each a full section list rather than a fragment: one player against one rat (:238-281, carrying # action, # event, two # faction, # entity player, # entity giant-rat and the use: line), a location holding five rats each respawning thirty seconds after it dies (:285-304, respawn after: 30s on the entity and "5 giant-rat" on the location), a fight with more than two participants (:308-334, miki on faction player against bandit-leader with allies: 2 bandit, explicitly "two against three" and "neither side is me and it"), and a felled tree regrowing after sixty seconds (:342-371, # resource wood, # event felled, # action woodcutting, respawn after: 60s, and the closing line "Same spawn model, same event mechanism, no combat in it" at :374). A fifth, the mirror at :378-390, is carried to show the one-sided kind coexists. Filed as a finding rather than as unmet: the # entity player block in shape 1 would be refused by the document's own load-error rule at :102-105, so the shape is structurally complete but not internally consistent.
- proof 5: met — Side by side at docs/combat/encounter-grammar.md:392-460. The "today" column at :396-428 is verbatim against content/tutorial-island.dsl - I diffed it line for line against the file: # entitytype melee-foe with fight: and bite: at dsl:295-312 and # entity giant-rat with type: melee-foe and its fight: block at dsl:314-330 both match clause for clause, including retaliates and the 1 in 3: roll: trinket nesting. The citation "content/tutorial-island.dsl:295" is exact - dsl:295 is the # entitytype melee-foe line. The proposal column is at :432-455 and the comparison is quantified at :457-460: I counted both blocks and "thirty lines become twenty-one" is correct on non-blank lines (31 lines including one blank, against 22 including one blank). The one semantic change is named rather than hidden - hidden if: moves from hiding the player's fight action to removing the rat (:459-460).
- proof 6: met — Table at docs/combat/encounter-grammar.md:550-562, twelve rows. Every behaviour c6 names by hand appears with a verdict: retaliates (Dropped, with why), escape after N (Renamed attempts:), on escape: (Renamed on unfinished:), the implicit target pool an action with no target: gets (Kept for one-sided actions), accuracy/evasion (one contest line), ability/dr (one contest line), rate: naming a stat read live (Kept, written rate: my attack-rate), # entitytype action templates (Replaced by # action plus uses:). Three more are volunteered - on success:/on failure: on a fight, on empty:/on full: on # resource, and stop. Which side each field reads is written into the replacement rather than left implicit: accuracy: my accuracy vs their evasion, damage: my attack vs their defense. The claims about today check out against source: escapeAfter is counted off playerCadence at src/runtime/runtime.ts:321, so "symmetric where today only the player could" is accurate; the rate comment the doc says becomes the word "my" is at src/runtime/stats.ts:69, exact; and the ACTION_FIELDS table at src/grammar/action.ts:112-126 holds accuracy, evasion, ability, target, dr, escape after and on escape, with retaliates the only member of BOOLEAN_ACTION_FLAGS at :46, exactly as the blast radius says.
- proof 7: met — Blast radius at docs/combat/encounter-grammar.md:585-624, split into Changes / New / Also touched / Does not change. All five files c7 names carry a verdict with what changes in each: src/grammar/action.ts (:590-594), src/content/entity.ts (:595-597), src/content/entityType.ts deleted with its test (:598), src/runtime/encounter.ts (:599-601), content/tutorial-island.dsl (:602-605). Seven files are named as not changing (:621-622). The forecast is checkable and checks out where I checked it: BOOLEAN_ACTION_FLAGS with retaliates as its only member at src/grammar/action.ts:46, entity.ts's type?: string, entityType.test.ts present, retaliationOf and the PLAYER branch at src/runtime/encounter.ts:80 and :70, the # test use: line at content/tutorial-island.dsl:438 and the expect: at :452 - both exact. And it changes none of them: the diff over af892db..7cf3962 touches four files, all under docs/. Filed as a finding rather than as unmet: four load-path files that must change (registry.ts, serialize.ts, references.ts/referenceSites.ts, test.ts) appear in no list, which does not fail c7's letter - it asks about five named files - but weakens the forecast it exists to produce.
- proof 8: met — All five queued records are positioned at docs/combat/encounter-grammar.md:626-662, each with one of the three verdicts the clause asks for: combat-events "compatible; requires re-planning; it stands, behind the refactor" (:628), buffs-generalized "compatible, and partly done for it ... should re-scope rather than re-plan" (:643-646), result-application-seam "done, and this design leans on it" plus an explicit statement that it reopens one recorded limitation, with the argument that the limitation's own stated ground no longer holds (:648-653), non-entity-action-owner-inherits-player-stats "subsumed" (:655-658), starting-zone "no re-plan needed, but it must not start first" (:660-662). The four combat-events rulings are read and each is restated as surviving rather than silently overturned (:630-633: thorns stays a persistent effect, rage stays a resource, the chance mechanism stays droptables', the event vocabulary stays closed) and the three things that do rest on the replaced grammar are named (:634-639). The long form is written to the head of docs/specs/combat-events.md as the document claims (:638-639) - the diff adds a 29-line block there beginning "This spec needs another planning session before it is worked". The spec's own open question "whether the document should recommend retiring combat-events or leave it standing" is answered, not deferred.
- proof 9: met — docs/combat/encounter-grammar.md:564-582. The player is written down as # entity player (:566-568), shipped in content, declaring stats, skills, equipment slots, uses:, allies: and handlers, and is nameable in a side list because it is an entity id - the three things c9 asks for. Both gates are named with what deletes them: participants()'s PLAYER branch at src/runtime/encounter.ts:70 (:572-573, and the citation is exact - line 70 is `if (actorId === PLAYER) {`), and statRange's `if (actorId === PLAYER)` at src/runtime/stats.ts:35 (:574-579, also exact). The third case inside statRange is the load-bearing part: the doc separates the two sub-cases that generalize by actor for free (buffs, equipment) from the one that does not (folding the active action's tag bonuses), and says what the grammar has to name for it - "the bonuses belong to the performer of the action, not to the player, so the fold takes the performer's action rather than state.activeAction". Verified against src/runtime/stats.ts:36-48: the gate does contain exactly those three folds, and only the third reads state.activeAction. It also disposes of the consequence - the global # stat bases stop being the player's sheet (:581-582), which is what src/content/entity.ts's own comment ("the player names nothing") says they are today.
- proof 10: met — One grammar, no menu. Six alternatives are recorded with why each lost at docs/combat/encounter-grammar.md:503-520 (entity keeps a fight: block; interactions own everything; # entitytype survives as a permitted-type list; factions written as numbers; on escape: renamed to on failure:; auto-retaliate as an authored field), and two more inside the body - the timer on the place (:544-546) and an earlier draft's unmarked on death: blocks (:468-471). The document's own Open questions at :664-672 hold exactly two, and each names a decider: the implicit target pool, "Decided by whoever revisits the action kind taxonomy", and renaming today's on failure:, "Decided by whoever takes that record" - and that record now exists in the store (on-failure-fires-only-when-an-action-cannot-start, added by this branch's tasks.jsonl diff). Three questions carried in earlier drafts are closed rather than delegated (:674-677). Every one of the spec's four delegated open questions is answered on the page: sides are implicit (:212-215), spawning is a property of the thing spawned (:541-546), # entitytype does not survive (:559), combat-events stands behind the refactor (:628).
- proof 11: met — Measured: 677 lines, 5017 words (wc -l -w docs/combat/encounter-grammar.md), which is a 25-35 minute read - one sitting. Order is proposal-first and checkable by heading offsets: the invariant at :7, "The proposal" at :18 through :233 (the two kinds of action, # action, how an action ends, uses: and overloads, targets, retaliation and factions, # event, entities, locations, sides, performing an action), "Worked shapes" at :235-390 and the side-by-side rewrite at :392-460 - so a worker has every rule and every example inside the first 460 lines. The deliberation follows and is separable: "What the invariant buys, and where it does not hold" at :462, "Ownership, argued" at :487, and the alternatives-that-lost list at :503. The three sections after the argument (blast radius, queued work, open questions) are addressed to the same worker rather than to the reviewer. The opening two lines state the audience explicitly: "The reader this is for is the worker on full-refactor-of-enemies-and-combat: the rules and the worked shapes come first, the argument for them second."
- proof 12: met — Ran `npm run tasks -- merge-ready` on 7cf3962. All six legs the clause names are green: tsc ok, npm test ok, layer-check ok, audit-status ok, doctor ok (17 warnings, none of which fail the leg, and all pre-existing - none names a path this branch touched), bytes ok (every tracked text file valid UTF-8, no NUL). tree is also ok, nothing uncommitted. Three legs fail and none is one of the six: `base` (main has moved past the merge base - mechanical, `git merge main`), `spec` (1 open member, which is this task, still in-progress and closed by filing this pass), and `clauses` (no recorded audit pass, which this pass is). The first is a real pre-merge action and is reported in prose rather than as a finding, since it is a rebase and not a defect.
