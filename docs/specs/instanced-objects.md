# instanced-objects

## Deliverable

One instancing substrate: a template plus a per-instance payload, living in game state, saved and
restored, and pruned when its template goes away. Two consumers need exactly that and nothing more of
each other. `items-mods-and-crafting` c11 needs it for items — instancing is lazy, so
`inventory[itemId]` keeps counting stacks until a cluster jewel is slotted into one and that single
item leaves the stack, carrying its plane, its allocations and its experience.
`full-refactor-of-enemies-and-combat` needs it for spawned things — the player as an instance,
enemies spawned per fight, a felled tree that regrows, a location holding five rats each on its own
respawn clock. The payloads differ; the machinery does not, which is why building it twice would put
two instance tables in `GameState`, two prune rules and two save migrations — the thing CLAUDE.md
forbids outright. This branch ships the substrate and no consumer, so nothing a player can see
changes when it merges.

Proof:

- [c1] There is exactly one instance table. `GameState` gains one field, `save.ts` gains one row in
  `SAVE_FIELDS`, and `pruneStateForRegistry` gains one rule. Both consumers reach it through the same
  module. The invariant is one table — not one table per kind of thing instanced — and a second
  table, a second prune rule or a second save field is the defect this branch exists to prevent.
- [c2] An instance is a template reference plus a payload the substrate never interprets. The
  substrate knows a payload's **kind** and how to hand it back to the code that owns that kind; it
  does not know what a hex plane or a respawn clock is. This is the seam that lets an item instance
  and a spawned rat share one table, and it is the check on every clause below: if satisfying one
  requires the substrate to read inside a payload, the seam is in the wrong place and the clause is
  wrong, not the seam.
- [c3] Instancing is lazy: nothing that carries no per-instance state is an instance. An item stays a
  count in `inventory[itemId]` until something is recorded about one particular copy of it. The
  invariant is that no instance exists carrying nothing.
- [c4] An instance has an identity that survives a save round trip and is stable under replay.
  Creating an instance draws no randomness — a `# test` that creates one rolls the same numbers
  afterwards as one that does not — and an id, once minted, names the same instance for that
  instance's whole life. The mechanism (a counter carried in state, a key derived from content,
  something else) is the worker's call; these two properties are not.
- [c5] Everything that names an instance holds its id, and liveness is answered in one place. An
  inventory entry, an equipped slot, an encounter actor and a location's contents all reference by
  id, and the substrate is what answers "is this id still live". The guard acts where state is
  assembled — during the load-time prune pass, before anything reads it — never at each read site,
  because a read site that has to check is a read site that will one day forget.
- [c6] Content moving underneath an instance prunes it rather than breaking it. An instance whose
  template is no longer in the registry is removed with a `PruneWarning` shaped like every other
  warning that file already produces, and every reference to it is repaired in the same pass, so a
  loaded state never holds a reference to an instance that is gone. This is the first half of
  `items-mods-and-crafting` c21 and it is owned here.
- [c7] Repairing a payload belongs to whoever owns the payload, and it gets exactly one place to run.
  `items-mods-and-crafting` c21's second half — a slotted jewel or allocated node whose declaration is
  gone is dropped with its point returned — is a rule about clusters and stays on that branch; this
  branch gives it one registered hook per payload kind, called during the same prune pass. The
  countable promise is that the number of extension points is one: no consumer adds a second call
  site, and no consumer prunes by walking the table itself.
- [c8] The save format grows by addition and no fixture is regenerated. The new field is
  absent-means-empty, so every `# save` in shipped content loads unchanged and `SAVE_VERSION` does
  not move. `checkSave` validates the new field's shape the way it validates every other, so a
  hand-written `# save` body holding nonsense in it is refused at load rather than misread at first
  use.
- [c9] Nothing observable changes. Every `# test` in shipped content passes byte-identical, no
  `expect:` save is regenerated, and no authored content gains any way to make an instance. A
  substrate branch that needs a fixture rewritten has shipped behaviour it claimed not to.
- [c10] The substrate is proved by a test-only payload kind that never reaches shipped content and
  exercises the whole lifecycle: create, save, load with identity and payload intact, template
  removed and the instance pruned, a reference to the pruned instance repaired, and a payload whose
  own referenced declaration is gone repaired through the c7 hook. A substrate whose only proof is
  that its two future consumers will one day exercise it is unproven.
- [c11] Both consumers are walked against the finished substrate before the spec closes.
  `items-mods-and-crafting` c11, c15 and c21, and the spawn model `combat-encounter-grammar` settles,
  are each read against what was built, and anything neither can express is recorded — as a finding
  here if the substrate is wrong, or as a clause change on that spec if the substrate is right.
  Building a substrate with no live consumer makes this the only check there is, so it is a clause
  rather than an intention.
- [c12] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests,
  layer-check, audit-status, doctor and the byte check in one invocation.

## Goal

Build the one table both instancing consumers need, once, before either of them is in a position to
build half of it.

## Decisions

- **One table, and the ruling that made it so.** Recorded on `src/runtime/instances.ts` on
  2026-08-05: `items-mods-and-crafting`'s grant of that file was withdrawn precisely so this task owns
  it, because that branch and entity spawning were each about to build the same thing. CLAUDE.md's
  ban on systems required to be manually kept in sync is the general form; two instance tables with
  two prune rules and two save migrations is the specific one.
- **The payload is opaque, and that is the whole design.** The two payloads have nothing in common —
  a hex plane of allocated positions and cluster effects versus pools and a respawn clock — so any
  substrate that understands its payloads is a substrate that has to be extended for the third
  consumer. Kind plus opaque blob plus one repair hook is the smallest thing that serves both.
- **The save field is additive; `SAVE_VERSION` does not move.** A bump rejects every existing
  `# save` fixture in `content/`, and this branch has nothing to migrate — a save written before it
  simply has no instances. Absent-means-empty keeps the byte check green, keeps `save-migration-system`
  and `save-fixture-migration` untouched, and keeps this branch's proof (c9) checkable at all.
- **Parallel with `result-application-seam`, not sequenced behind it.** Both write
  `src/runtime/state.ts` and `src/runtime/save.ts`, so a later planner will be tempted to add a
  `requires` edge and serialise two legs of the chain that do not need it. The overlap is a
  `GameState` field addition and a `SAVE_FIELDS` row — textually adjacent, semantically independent,
  and touching none of `applyResults`. Whichever lands second rebases. This is written down so the
  edge is not added by reflex.
- **Gated on the grammar document, not on the combat refactor.** `combat-encounter-grammar` decides
  whether an author addresses an individual spawned rat, whether a fight names sides by type or by
  instance, and where a respawn timer is written. Those answers change what a payload holds — which
  the substrate does not read — and whether ids appear in the language. That is a small enough
  surface that this branch is blocked on the document rather than on the refactor that consumes it.
- **This branch registers `object instancing` as a concept over `src/runtime/instances.ts`.** It is a
  durable capability rather than a branch output: after it lands, "who owns instancing?" is a query
  with one answer, which is the condition under which the second consumer cannot quietly build a
  second one. Registration happens at the worker's `tasks concept` call, once the region has been
  read.
- **The intended cut is two slices, disjoint by path, and it is recorded rather than added to the
  store now.** `src/runtime/instances.ts` (with its test) is the substrate — table, ids, payload
  kinds, prune and repair — and `src/runtime/state.ts` plus `src/runtime/save.ts` (with `save.test.ts`)
  is the wiring, which requires it. `instances.ts` operates on the table passed to it, so the second
  slice is a field, a `SAVE_FIELDS` row and one call. The records are left uncut because the branch
  is uncut: adding two unstarted slices to `main`'s store puts a plan in the shared file for a branch
  nobody has taken, and step 3 of the workflow runs on the branch with this paragraph as its input.

## Open questions

Delegated, in the order they will be met:

- Whether instance ids are visible to authors. `combat-encounter-grammar` c3(a) settles it: if an
  author addresses an individual spawned rat by a written name, ids are part of the language and this
  branch stores what it is handed; if not, they stay runtime-internal. The substrate is the same
  either way, which is why this branch is not blocked on the answer — but the worker reads the
  document before writing the module.
- The id mechanism. c4 names the two properties it must have and deliberately names no mechanism; a
  counter carried in `GameState` is the obvious candidate and is not a requirement.
- Whether an instance whose payload empties collapses back into a stack. c3 says nothing carrying
  nothing is an instance; whether the substrate enforces that eagerly or offers the operation and
  lets the consumer call it is the worker's call, and the honest default is to offer it.
- Where a spawned thing's location lives. A rat has to be somewhere, and whether that is a field in
  its payload, a field on location state, or an index the substrate keeps is a call for whoever reads
  `full-refactor-of-enemies-and-combat`'s needs. This branch stores instances; it does not decide who
  points at them, and c5 only requires that whoever does, does it by id.
