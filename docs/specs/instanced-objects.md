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

### Pass 2 — 2026-08-09

- base: `0115673633133af064a724780d6cb21acc4d1e4b`
- head: `4b87f5e14c6dc506a7b78054d08214b52c5178ed`
- proof 1: met — Unchanged from pass 1 and re-verified at HEAD. One field (state.ts:37), one SAVE_FIELDS
  row (save.ts:50), one rule (save.ts:143, now a single `warnings.push(...pruneInstances(...))`).
  Enforced by tsc, not by a test: add `instances2?: InstanceTable` beside the field and
  `npx tsc --noEmit` gives TS2741 at save.ts:40 while `npm test` stays green. A next pass must not
  read that survivor as a finding.
- proof 2: met — Re-checked after the readonly tightening landed. `grep -n "payload" src/runtime/instances.ts`
  shows every access going through a kind method, plus one `'payload' in held` presence check and one
  JSON.stringify in an error message. Pass 2 mutation-tested the boundary the other way: making
  `instance()` return `{...held}` SURVIVES the whole suite. Recorded as an equivalent mutant rather
  than filed — the shallow copy shares the payload object, and payload identity is the only thing a
  consumer needs from the accessor, so nothing observable differs. Named here so a third pass does
  not re-derive it.
- proof 3: met — Unchanged from pass 1. Mint, load and repair are all closed, each mutation-killed. The
  eager/offered question the spec left open is answered both ways and both halves are asserted.
- proof 4: met — Unchanged from pass 1, all four properties still mutation-killed. Pass 2 added the
  regression check that matters here: `npm run build` (tsc + vite) succeeds, so the counter and the
  table survive the production bundle, and no id is derived from anything the bundler reorders.
- proof 5: met — Unchanged from pass 1. instanceIsLive is the single answer and is mutation-killed;
  pruneInstances is the first rule in pruneStateForRegistry and the order is pinned by warning order
  and mutation-verified by moving it back. The limit stated in pass 1 still stands and is the honest
  boundary of this grade: no field of GameState holds an instance id yet, so what is proved is the
  shape a reference site will ask, not a reference site.
- proof 6: met — Pass 2 found this one under-proved and fixed it. Every earlier case reached the repair
  loop with a chain that resolved in a single round, because each was minted in the order the loop
  walks — so replacing the fixed point with one pass stayed green, and one pass leaves a live
  reference to an instance that is gone. "reports a repair once however many rounds the table takes
  to settle" mints the chain against the iteration order so the outer link cannot be repaired before
  round two, and asserts both the settled table and that a repair is reported exactly once.
  Mutation `c6-one-round-is-not-a-fixed-point` (loop rewritten as a single pass): KILLED. The warning
  shape is now built where it is owned: pruneInstances returns PruneWarning itself, so path, id and
  message are one sentence in one file; mutating the path to drop the id KILLED four tests.
- proof 7: met — Unchanged from pass 1. `grep -n "\.repair(" src/runtime` returns exactly instances.ts:139.
  Pass 2 added the clause the interface was missing: repair is called until the table settles, so an
  implementor must return nothing when there is nothing left to repair. That obligation is now stated
  on InstanceKind and proved on the substrate side by the once-only assertion in c6's new case.
- proof 8: met — Unchanged from pass 1. SAVE_VERSION is 7. Five nonsense cases, absent-means-empty
  asserted in both directions, both mutations killed.
- proof 9: met — Re-run at HEAD. `git diff --stat main...HEAD` still touches only four files under
  src/runtime plus unowned docs; nothing under content/, src/grammar or src/content. npm test 2119
  passed. Pass 2 added two regression checks pass 1 did not run: `npm run build` succeeds, and
  `grep` for anything enumerating GameState's keys finds only save.ts's SaveField type — no loop
  over GameState that a new field silently joins.
- proof 10: met — 23 cases now, one added by each pass. Sixteen mutations aimed at the clauses' own lines
  across the two passes, fifteen KILLED and one recorded as an equivalent mutant. The test-only kind
  is still registered nowhere but its own file.
- proof 11: met — Unchanged from pass 1; three decisions on the record, readable with
  `npm run tasks -- log --spec instanced-objects --op decision`. The walk's two leftovers are filed
  as findings and deferred, with the triage reasoning recorded as a fourth decision.
- proof 12: met — `npm run tasks -- merge-ready` at HEAD: tsc, npm test, layer-check, audit-status,
  doctor, bytes, tree, base, spec and clauses all pass. 17 doctor warnings, none of which fail a leg
  and none of which this branch introduced.

### Pass 3 — 2026-08-09

- base: `799585bd3c3d1c0e58186da3303294e61e803c8a`
- head: `799585bd3c3d1c0e58186da3303294e61e803c8a`
- proof 1: met — One field (src/runtime/state.ts:36 `instances: InstanceTable`), one SAVE_FIELDS row
 (src/runtime/save.ts:51), one call in pruneStateForRegistry (src/runtime/save.ts:143).
 `grep -rn "from './instances'|runtime/instances" src scripts` returns exactly save.ts:5,
 state.ts:4 and the test, so both future consumers reach the table through one module and
 nothing else in the tree can walk byId. Pass 1's tsc guard re-verified by this pass rather
 than inherited: inserting `instances2: InstanceTable;` beside state.ts:36 and running
 `npx tsc --noEmit` gives TS2741 at save.ts(40,7) and state.ts(44,3); file restored, tsc green.
 Mutation c1-prune-rule-not-wired (save.ts:143 replaced with `void pruneInstances;`): KILLED,
 9 failed of 55, by instances.test.ts 'prunes the instance whose template is gone, and warns
 like every other prune' and 8 more, re-run at its own file with the mutant still applied.
 The branch also reuses the pattern that was already there rather than inventing one: modals
 is the same shape (owner module, readonly field, isModalFrame in SAVE_FIELDS, pruneModals in
 pruneStateForRegistry) and instances is a faithful copy of it.
- proof 2: met — `grep -n "payload" src/runtime/instances.ts`: every access goes through a kind
 method (holds, empty, repair), plus exactly two substrate-side reads, both structural rather
 than semantic: `'payload' in held` at instances.ts:168 and a JSON.stringify inside one error
 message at instances.ts:79, which is what save.ts:214 already does for every other field.
 The module's import list is Registry, PruneWarning, GameState, RuntimeError and it names no
 item, cluster, entity, plane or respawn concept anywhere. Mutation c7-live-answer-inverted
 (the `live` callback handed to repair replaced with `() => true`): KILLED, 4 failed of 23 -
 the substrate's only contribution to a payload's repair is the liveness answer it passes in,
 and breaking that is visible, which is the seam being load-bearing rather than decorative.
 Independently confirmed the seam is reachable from outside: a payload kind defined in a
 scratch `npm run inspect` body, with a shape instances.ts has never seen, drives create,
 load, prune and repair without the module learning anything about it.
- proof 3: met — Three routes into the table, all closed, each mutation-killed by this pass.
 Mint: mutation c3-mint-refuses-nothing (instances.ts:80 guard disabled) KILLED, 1 failed of
 23, by 'refuses a payload recording nothing, so no instance carries nothing'. Load and
 repair share the fixed point: mutation c3-fixed-point-collapse (instances.ts:142 collapse
 branch disabled) KILLED, 3 failed of 23, by 'drops a copy a # save wrote already recording
 nothing, the one route past the refusal at the mint', 'drops a copy a repair left recording
 nothing, and follows the reference that strands' and one more. The spec's open question
 (eager or offered) is answered both ways on purpose: enforced at the mint, offered as
 collapseInstance for a consumer that empties a payload mid-session, and both halves assert.
- proof 4: met — Ids are decimal strings from a counter carried inside the table, so the mechanism
 draws no randomness and touches no clock; instances.ts imports neither rng nor any clock.
 Mutation c4-counter-does-not-advance (`table.next += 1` weakened to `+= 0`): KILLED, 7 failed
 of 23, by 'never answers a removed id with a later instance', 'comes back with the same id
 and the same payload' and 5 more. Mutation c4-minted-id-bound-dropped (isMintedId returns
 true): KILLED by 'refuses an id no counter could have minted, which would collide with a real
 one'. Round trip and counter survival are asserted by 'comes back with the same id and the
 same payload' and 'keeps a counter that has run on past the instances it minted'.
 One boundary recorded here so a next pass does not have to re-find it: for every state the
 engine itself can produce, all four properties hold. They are breakable only through a
 counter value that no mint could have reached and that checkSave does not refuse, which is a
 hole in the load-side validator rather than in the mechanism. That is graded under c8, where
 the promise to refuse it lives, and filed as a finding.
- proof 5: met — instanceIsLive (instances.ts:95) is the one answer and everything asks it:
 removeInstance, collapseInstance and the `live` callback the repair hook receives all route
 through it, and `grep -n "in state.instances.byId|in table.byId" src/runtime` finds no second
 derivation. Mutation c5-liveness-always-true (`return id in state.instances.byId` replaced
 with `return true`): KILLED, 8 failed of 55. The guard acts where state is assembled:
 pruneInstances is the first statement of pruneStateForRegistry, pinned by 'settles the table
 before any other rule runs, so a field holding an id asks an answer that is final', which
 asserts warning order equals rule order, and by mutation c1-prune-rule-not-wired: KILLED.
 The honest limit pass 1 stated still stands and this pass re-confirmed it by grep: no field
 of GameState holds an instance id yet, so what is proved is the shape a reference site will
 ask, not a reference site. One live gap inside that limit is filed as a low finding -
 removeInstance and collapseInstance delete without running the repair fixed point, so a
 mid-session removal leaves stale ids in other payloads until the next load. That is
 consistent with what c5 and c6 actually promise (the load-time pass) and is filed as a
 contract-statement gap rather than graded against this clause.
- proof 6: met — Two ways a template goes, both dropping with a PruneWarning of the same
 {path,id,message} shape every other rule in save.ts produces, built inside pruneInstances
 where it is owned. Mutation c6-template-prune (instances.ts:129 branch disabled): KILLED,
 6 failed of 23. Unknown-kind drop asserted by 'prunes an instance whose payload kind nothing
 registered' with an exact one-element warning list. References repaired in the same pass:
 'repairs a reference to a pruned instance in the same pass that prunes it' asserts both
 messages in order, and 'leaves a loaded state holding no reference to an instance that is
 gone' asserts it end to end through serialize, parseSaveSection and loadSave. The fixed point
 pass 2 added is real and this pass re-proved it independently: mutation
 c6-one-round-is-not-a-fixed-point (the `settled = false` that forces another round flipped to
 `settled = true`): KILLED, 1 failed of 23, by 'reports a repair once however many rounds the
 table takes to settle'. Termination checked by reading rather than by test: a further round
 is requested only by a drop, drops are the only table write in the loop and nothing adds
 rows, so the loop is bounded by the table size and a badly-behaved repair costs duplicate
 warnings rather than a hang.
- proof 7: met — One extension point, InstanceKind, registered by defineInstanceKind.
 `grep -rn "\.repair\(" src/runtime` returns exactly instances.ts:139 and nothing else, and
 `grep -rn "byId" src` returns only instances.ts and its test, so no consumer can prune by
 walking the table. Mutation c7-repair-hook-never-called (the repair call replaced with an
 empty iterable): KILLED, 5 failed of 23. Mutation c7-live-answer-inverted (`live` replaced
 with `() => true`): KILLED, 4 failed of 23 - which is what shows the count stays at one
 rather than needing a sibling hook for reference repair, since a payload's stale declarations
 and its stale instance references are the same call. The obligation pass 2 added to the
 interface (return nothing when there is nothing left, because repair runs to a fixed point)
 is stated on InstanceKind at instances.ts:51-52 and is the reason the once-only assertion in
 c6's new case can be written at all.
- proof 8: unmet — The additive half is fully met and mutation-proved; the validation half has a
 reachable hole, so the clause is graded on its own second sentence.
 Met and re-proved by this pass: SAVE_VERSION is still 7 and untouched in the diff;
 'is absent from a save that has none, and does not move SAVE_VERSION' asserts serializeSave
 of a fresh state is exactly {version} and that a diff with no instances field resets a
 populated table to the baseline; mutation c8-baseline-not-empty-table (createInstanceTable
 returns next 2) KILLED, 2 failed of 55; mutation c8-save-field-holds-weakened (SAVE_FIELDS'
 holds swapped from isInstanceTable to isObject) KILLED, 4 failed of 55; no fixture under
 content/ moved and the merge gate's byte leg passes.
 Not met: isInstanceTable (instances.ts:162-175) checks the counter with Number.isInteger and
 nothing else, while isMintedId next to it is strict about every id. A hand-written `# save`
 body holding a counter no mint could have reached is accepted at load and misread at first
 use, which is exactly the failure this clause's second sentence names. Reproduced with
 `npm run inspect`, both directions:
 with instances {next: Number.MAX_VALUE, byId: {}} the load is accepted, `table.next += 1` is
 a no-op at that magnitude, and two successive createInstance calls both return the id
 '1.7976931348623157e+308' - one row in byId, the first instance's payload silently replaced
 by the second's.
 with instances {next: -1, byId: {}} the load is accepted and the first mint returns the id
 '-1'; serializeSave then writes a body that the same validator refuses on reload with
 'save field instances holds ... which is not what instances keeps', so the engine produces a
 save it cannot load back.
 Re-run: npm run inspect with a body that defines any instance kind, calls loadSave with each
 of those two diffs, then calls createInstance twice. Verified at HEAD 799585b.
 The fix is two conditions in one predicate - Number.isSafeInteger(next) and next >= 0, which
 is the bound every accepted id already implies through `Number(id) < next` - so no
 over-strictness is introduced: every counter the engine can reach satisfies both. Filed as a
 finding with that deliverable.
- proof 9: met — `git diff --stat 0115673..799585b -- content src/grammar src/content src/ui .github`
 is empty, so no authored content gained any way to make an instance, no `# save` or `expect:`
 fixture moved and no CI leg changed. The whole diff is four files under src/runtime plus
 three unowned docs and systems.json. `npx vitest run --reporter=dot` at HEAD: 80 files,
 2119 of 2119 passed, including integration.test.ts which replays every shipped `# test`.
 The merge gate's byte leg passes (every tracked text file valid UTF-8, no NUL bytes) and its
 tree leg reports nothing uncommitted. The substrate is inert without a registered kind and
 `grep -rn "test-token" src content scripts` returns one line, instances.test.ts:42, so the
 only kind in the tree cannot be reached from shipped content. Checked the one way a new
 GameState field could leak observably: `grep -rn "Object.keys(state)|keyof GameState" src
 scripts` finds only save.ts's SaveField type and diffRecord's per-record key union, so no
 loop over GameState silently gains a member.
- proof 10: met — `test-token` is defined at src/runtime/instances.test.ts:42 and registered
 nowhere else in the tree, and .test.ts files reach no bundle, so shipped content cannot name
 it. Its payload carries free-form notes, a registry stat id and links to other instances,
 which between them is every way a payload goes stale, and 23 cases walk the lifecycle the
 clause enumerates. This pass did not inherit the earlier passes' mutation results: it wrote
 its own twelve-entry manifest aimed at the lines it judged each clause to be about, and all
 twelve came back KILLED with named killers, 0 survived, 0 unstable, 0 errored, tree gained
 and lost nothing. Checked the assertions for the shape that cannot fail: the load-bearing
 ones can - 'is absent from a save that has none' asserts an exact object, the nonsense cases
 assert a throw over five and seven enumerated bodies, and 'draws no randomness' compares
 nextRandom across two states and would fail the moment minting touched the cursor. Two
 weaker spots recorded rather than filed: 'reports a repair once however many rounds' also
 asserts Object.keys order, which is an artifact of insertion order rather than a promise,
 and 'accepts a payload whose kind nothing registered' calls isInstanceTable directly instead
 of going through loadSave. Neither is the clause's load-bearing assertion.
- proof 11: met — `npm run tasks -- log --spec instanced-objects --op decision` returns six
 decision events, four of them the walk itself: items-mods-and-crafting c11, c15 and c21 read
 against the built substrate with the mapping written out for each; the settled combat spawn
 model read against it; the correction that the combat consumer is one durable thing (the
 player) rather than four, with the reasoning for why no clause changes; and the walk's two
 leftovers, one fixed on this branch (prune order, which is why pruneInstances is first) and
 one left to the consumer (RecordPrune.loaded takes no state). Both leftovers exist as open
 records in the store outside every spec, so the first branch to register a real payload kind
 finds them in the queue - confirmed present in the brief's own prior-art list for
 src/runtime/save.ts. The walk also produced a constraint the substrate does not enforce and
 both payloads must respect (a payload round-trips through JSON.stringify, so no Map or Set),
 which is recorded rather than absorbed. This is a clause discharged by recorded reasoning
 rather than by a test, and the record is complete and queryable.
- proof 12: met — `npm run tasks -- merge-ready` at HEAD 799585b: tsc pass, layer-check pass (814
 cross-file imports across 5 layers, every import downward), audit-status pass (the partition
 holds and this branch's two new files are declared under Runtime with the `object instancing`
 concept over instances.ts), doctor pass (17 warnings, none introduced by this branch, none
 failing a leg), bytes pass, tree pass, spec pass.
 Two legs report red at this HEAD and neither is a defect of this diff, which is why the
 clause is graded met with the caveat written down rather than left for a next pass to
 rediscover:
 base - 'main has moved past the merge base', which is structural: this branch is already
 merged into main, which is also why this brief has to be run with --base-branch 0115673 to
 resolve a diff at all. merge-ready takes no equivalent flag. Filed as friction.
 npm test - 5 of 2119 failed, every one a 5000ms timeout on a spawn-heavy test under full
 suite load (rng.test.ts, auditPrompt.test.ts, doctor.test.ts, handoff.test.ts,
 mergeReady.test.ts), none of them touching anything in this diff. The identical bytes ran
 2119 of 2119 green standalone under `npx vitest run --reporter=dot` two minutes earlier.
 This is the fourth-and-now-fifth occurrence of an existing record; recurrence filed rather
 than a second record.
