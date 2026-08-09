# instanced-objects

## Deliverable

One instancing substrate: a template plus a per-instance payload, living in game state, saved and
restored, and pruned when its template goes away. Two consumers need exactly that and nothing more of
each other. `items-mods-and-crafting` c11 needs it for items — instancing is lazy, so
`inventory[itemId]` keeps counting stacks until a cluster jewel is slotted into one and that single
item leaves the stack, carrying its plane, its allocations and its experience.
`full-refactor-of-enemies-and-combat` needs it for entities that carry state outliving a fight: an
entity declaring `skills:` is durably instanced, which in shipped content is the player and nothing
else. The payloads differ; the machinery does not, which is why building it twice would put
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
  **That document merged on 2026-08-09 and the gate is lifted**; its answers are recorded under
  `## Open questions` below, which is now a settled list rather than a delegated one.
- **The combat consumer is smaller than this spec first forecast, and the correction is recorded rather
  than absorbed.** The Deliverable paragraph originally named four spawned things — the player, enemies
  spawned per fight, a regrowing tree and five rats on their own respawn clocks. Under the settled
  grammar three of the four are not instances: `allies:` spawns are fight-scoped and vanish with the
  fight the way `ActiveAction.actors` already does, and a location's respawn deficit is a fact about the
  location rather than about any rat. What is left is one durable consumer here, the player. **No clause
  changes**, because no clause names a consumer — c1 through c10 are properties of the table, and they
  are the reason the correction is cheap. c11 is the clause that would have caught this had the document
  landed later, and it is being discharged early by this paragraph rather than deleted.
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

Three of the four this spec carried were delegated to `combat-encounter-grammar` and are answered by
the document it merged on 2026-08-09. They are kept here with their answers rather than deleted,
because a reader arriving at this spec needs the answer more than the history of the question.

- **Are instance ids visible to authors?** **No, in any written form.** A location holds a count,
  `allies:` holds counts of types, and no syntax anywhere names one instance. Ids are minted by the
  runtime, never written down and never parsed, so this branch stores an identity that no grammar has
  to round-trip.
- **What makes something an instance, in the grammar?** **An entity declaring `skills:`**, because
  skill experience is per-individual and outlives any one fight. An entity without it is a template and
  the pools it carries in a fight are fight-scoped. That is c3's laziness rule with an authored tell,
  which is worth more than the rule alone: an author can see from the block whether a thing is
  instanced.
- **Where does a spawned thing's location live?** **Not here.** A location's `entities:` count and the
  respawn deficit under it are location state, owned by `full-refactor-of-enemies-and-combat`, and a
  fight-scoped participant is not in this table at all. This branch stores instances and does not
  decide who points at them; c5 only requires that whoever does, does it by id.
- **The id mechanism**, still delegated to the worker. c4 names the two properties it must have —
  survives a save round trip, draws no randomness — and deliberately names no mechanism; a counter
  carried in `GameState` is the obvious candidate and is not a requirement.
- **Whether an instance whose payload empties collapses back into a stack**, still delegated. c3 says
  nothing carrying nothing is an instance; whether the substrate enforces that eagerly or offers the
  operation and lets the consumer call it is the worker's call, and the honest default is to offer it.

## Audit passes

### Pass 1 — 2026-08-09

- base: `0115673633133af064a724780d6cb21acc4d1e4b`
- head: `76b6375d68cb469bd9e22a5f8d926e9ba7b23b23`
- proof 1: met — One field on GameState (state.ts:36 `instances: InstanceTable`), one row in SAVE_FIELDS
  (save.ts:50), one rule in pruneStateForRegistry (save.ts:143). Both consumers reach it through
  src/runtime/instances.ts, the only module that writes the table. The invariant is enforced by tsc
  rather than by a test: SaveField is Exclude<keyof GameState,'log'> and SAVE_FIELDS is a Record over
  it, so a second InstanceTable field on GameState is TS2741 at save.ts:40. Re-run by adding
  `instances2?: InstanceTable` beside state.ts:36 and running `npx tsc --noEmit`; it errors. The same
  mutation SURVIVES `npm test`, which is the reason this clause's proof target is a command and not a
  vitest name — recorded here so a next pass does not read that survivor as a finding.
- proof 2: met — Every payload access in instances.ts goes through the kind: holds, empty and repair.
  The substrate's own reads are `'payload' in held` (presence, in isInstanceTable) and a
  JSON.stringify in one error message, which is what save.ts's checkSave already does for every
  field. Instance.kind/.template/.payload and InstanceTable.next/.byId are readonly outside the
  module, opened by one cast at instances.ts:31, so a consumer cannot repoint the template the
  reference rests on. `npm run mutate` on the holds call in createInstance: KILLED by
  instances.test.ts "refuses a payload its kind does not keep, and a kind nothing registered".
  Structural half verified by inspection: instances.ts names no item, cluster, entity or respawn
  concept, and the test-only kind is the only thing in the tree that knows what a payload contains.
- proof 3: met — Three routes into the table, all closed. Mint: createInstance refuses a payload its kind
  calls empty (instances.ts:67) — mutation KILLED by "refuses a payload recording nothing, so no
  instance carries nothing". Load: a hand-written `# save` can carry an already-empty payload past
  checkSave, which asks holds and never empty; the prune pass drops it — mutation of the collapse
  KILLED by "drops a copy a # save wrote already recording nothing, the one route past the refusal at
  the mint". Repair: a payload a repair empties is dropped in the same fixed point — KILLED by "drops
  a copy a repair left recording nothing, and follows the reference that strands". The open question
  the spec left (eager or offered) is taken both ways: enforced at the mint, offered as
  collapseInstance for a consumer that empties one mid-session.
- proof 4: met — Ids are decimal strings from a counter inside the table. No randomness: "draws no
  randomness, so a session that makes one rolls what a session that does not rolls" asserts
  nextRandom agrees between a state that minted an instance and one that did not. No reuse: the
  counter never rewinds, asserted by "never answers a removed id with a later instance" and by
  "keeps a counter that has run on past the instances it minted" across a save round trip. Round
  trip: "comes back with the same id and the same payload". Mutations c4-counter-rewinds (id derived
  from the live row count) and c4-minted-id-check (isMintedId returns true) both KILLED. The save
  side refuses an id no counter could have minted, so a hand-written body cannot plant one that a
  later mint collides with.
- proof 5: met — instanceIsLive is the one answer, and pruneInstances hands it to the repair hook as
  `live` rather than re-deriving it (instances.ts:129, fixed in this pass — it had a second
  `ref in table.byId`). Mutating instanceIsLive to return false is KILLED. The guard acts where state
  is assembled: pruneInstances is the FIRST rule in pruneStateForRegistry, so every rule below it
  asks a settled table. Pinned by "settles the table before any other rule runs, so a field holding
  an id asks an answer that is final", which asserts warning order is rule order, and
  mutation-verified by moving the block back below the record prunes: KILLED. No read site checks
  liveness — there is no read site yet, which is the honest limit of this grade: the clause names
  inventory, equipped, encounter actors and location contents, and none of them holds an instance id
  on this branch. What is provable here is the shape they will ask.
- proof 6: met — Two ways a template goes: out of the registry, and its payload kind unregistered. Both
  drop with a PruneWarning of the same {path,id,message} shape every other rule in save.ts produces,
  path `instances.<id>`, message ending in a period, appended to state.log by loadSave. Asserted by
  "prunes the instance whose template is gone, and warns like every other prune" and "prunes an
  instance whose payload kind nothing registered". References repaired in the same pass: "repairs a
  reference to a pruned instance in the same pass that prunes it" asserts both messages in order, and
  "leaves a loaded state holding no reference to an instance that is gone" asserts it end to end
  through serialize -> parseSaveSection -> loadSave against a registry the template left. Mutations
  c6-template-prune, c6-unknown-kind-prune and c1-prune-rule-call-site all KILLED.
- proof 7: met — One extension point, InstanceKind, registered by defineInstanceKind. `repair` has exactly
  one call site, instances.ts:129 inside pruneInstances; `grep -n "\.repair(" src/runtime` returns
  that line and nothing else. A consumer never walks the table: the payload's own stale references
  and its references to other instances are the same call, because `live` is passed in — which is
  what kept this from needing a second hook for reference repair. Deleting the call KILLED four
  tests. The countable promise holds at one because reference repair folded into the repair hook
  rather than becoming a sibling of it.
- proof 8: met — SAVE_VERSION is still 7; `git diff main...HEAD -- src/runtime/save.ts` shows the constant
  untouched. Absent-means-empty: "is absent from a save that has none, and does not move
  SAVE_VERSION" asserts serializeSave of a fresh state is exactly `{version}` and that loading a diff
  with no instances field resets a populated table to the baseline. Mutating the baseline off the
  empty table KILLED it. checkSave validates through isInstanceTable the way every other field
  validates through its own holds: five cases under "a # save body holding nonsense in the instance
  table" cover a table that is not one, a row that is not an instance, an id no counter could have
  minted, and a payload the owning kind does not keep; weakening holds to isObject KILLED four of
  them. A kind nothing registered passes the shape check on purpose and is pruned, which is how
  modals.ts already treats a frame this engine does not know.
- proof 9: met — `git diff --stat main...HEAD` touches four source files, all under src/runtime, plus
  three unowned docs. No file under content/, src/grammar or src/content changed, so no authored
  content gained any way to make an instance and no `# save` or `expect:` fixture moved. npm test:
  2118 passed, 82 files, including integration.test.ts which replays every shipped `# test`. The
  substrate is inert without a registered kind, and the only kind in the tree is registered inside
  instances.test.ts.
- proof 10: met — `test-token` is defined in src/runtime/instances.test.ts and registered nowhere else, so
  no shipped content can name it. It carries free-form notes, a registry stat id and links to other
  instances, which between them is every way a payload goes stale. 22 cases walk the lifecycle the
  clause enumerates: create, save, load with identity and payload intact, template removed and the
  instance pruned, a link to the pruned instance repaired, and a stat declaration gone repaired
  through the c7 hook. Eleven mutations aimed at the clauses' own lines, all KILLED
  (c3-mint-refuses-empty, c4-counter-rewinds, c4-minted-id-check, c6-template-prune,
  c6-unknown-kind-prune, c7-repair-hook, c3-fixed-point-collapse, c1-prune-rule-call-site,
  c8-save-field-shape, c8-additive-round-trip, c5-instances-prune-first), plus three more in the
  audit pass (c3-load-empty-payload, c5-one-liveness-answer, c2-payload-opacity).
- proof 11: met — Three decisions recorded against the spec, readable with
  `npm run tasks -- log --spec instanced-objects --op decision`. items-mods-and-crafting c11, c15 and
  c21 are each expressible with no substrate change: c11 is createInstance over an opaque
  {plane, allocations, experience}; c15's cluster effect is a record inside that same payload, which
  is why jewels stay stackable; c21's first half is c6 here and its second half is InstanceKind.repair
  with the point return being arithmetic the substrate never sees. The settled spawn model needs an
  entity template, a per-skill-experience payload and no content-facing identity, all of which the
  table already holds. The walk was not free: it found the prune-order defect fixed in 0d4f8d3, and
  it left two things on the record — RecordPrune.loaded takes no state, so a record field cannot yet
  ask instanceIsLive, and a payload must be JSON because serializeSave round-trips it through
  JSON.stringify. Both are filed as findings below.
- proof 12: met — `npm run tasks -- merge-ready` at 3e252b8 and again after the audit fixes: tsc, npm
  test, layer-check, audit-status, doctor, bytes, tree and base all pass. The spec leg passes; the
  clauses leg is what this file closes.
