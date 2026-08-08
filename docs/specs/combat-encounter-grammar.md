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
