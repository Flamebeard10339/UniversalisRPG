# a-session-adopts-an-edit-or-refuses-it-whole

## Deliverable

A live session can pick up a module edit made outside it, and either takes the whole edit or none of
it. Today the only route in is `/dsl`, which writes and adopts in one act inside one process
(`commitLocalChanges`, `src/runtime/command.ts:376`), so a second process editing the same file is
invisible until the session is restarted. The mechanism is already here and is not what this branch
builds: `adoptRegistry` (`src/runtime/session.ts:381`) swaps the registry under a live session, prunes
what no longer resolves with a warning per prune, re-inits resources and re-spreads discovery — its
own comment says "the roads may have moved: an edge the old registry did not have is a place the
player can now walk to". What is missing is a second caller and the read half of the authoring
context, whose `writeLocalChanges` has never had a counterpart. This is what lets an author edit
content in one place while a session plays it in another.

Proof:

- [c1] **A session re-reads its local module on demand and shows what another process wrote.** A
  `/reload` command re-reads the local file from disk through a `readLocalChanges` on
  `AuthoringContext` — the counterpart of the `writeLocalChanges` already on it — loads it beside the
  base sources, and adopts the result. A location added to that file by a different process is
  reachable in the running session after it, with no restart and no save.
  proof: vitest src/runtime/command.test.ts scripts/play-cli.test.ts
- [c2] **A reload that does not load changes nothing.** On any diagnostic, the session's registry,
  state, log and clock are exactly what they were, the diagnostics print on the tool channel, and play
  continues. There is no partial adoption: the load either produces a registry that is adopted whole
  or produces none. This is the shape `commitLocalChanges` already has, which returns before
  `adoptRegistry` on failure, and c3 is what stops the second caller re-deciding it.
  proof: vitest src/runtime/command.test.ts
- [c3] **One load-and-adopt path, and `/dsl` is its other caller.** The read, the load, the diagnostic
  gate and the adopt are one function; `/dsl` is that function with a write in front of it. A second
  copy of the sequence is the defect this clause exists to forbid, and the proof is that removing the
  shared function breaks both commands rather than one.
  proof: vitest src/runtime/command.test.ts
  proof: command grep -n "adoptRegistry" src/runtime/command.ts
- [c4] **State the edit invalidates is pruned with the warning already emitted, never silently.** A
  session standing in a location the edit deletes, holding an item it removes, or carrying a flag it
  drops, comes out of the reload with `pruneStateForRegistry`'s warnings in its log and a state the
  registry resolves. This is `adoptRegistry`'s existing behaviour and the clause pins it for the new
  caller, because a reload is the first way a player can be standing somewhere an author just deleted.
  proof: vitest src/runtime/command.test.ts src/runtime/session.test.ts
- [c5] **Reload carries no information, so a driver may call it unconditionally.** Reloading an
  unchanged file leaves the session identical — same registry contents, same state, same log length,
  same clock — so a driver that reloads every turn is indistinguishable from one that never does until
  the file actually changes. This is what makes the polling loop safe: a reload that only happened
  when something changed would tell an agent playing the session that an author had just written, and
  a file watcher would do the same while also making a session nondeterministic under `# test` replay.
  proof: vitest src/runtime/command.test.ts
- [c6] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Let one process author a module while another plays it, so authoring and reading stop being the same
seat.

## Decisions

**Extends `the play command surface`; registers no concept.** That concept is already registered to
Runtime over `src/runtime/command.ts`, and a command is what this adds. A second concept over the same
file would manufacture the two-concepts-one-file report, which is the shape of the 2026-08-07 and
2026-08-14 rulings on `an-action-pruned-for-a-dangling-reference` and `authored-prose-is-addressed-by-
its-owner`. The `produces` forecast is cleared rather than registered.

**Its own spec because nothing owns it, checked rather than assumed.** `tasks where
src/runtime/command.ts` returns two open records, both findings, and a finding cannot create work. The
two plausible homes were read and rejected: `dsl-kind-prints-fields` was settled 2026-07-29 with seven
fixed clauses, grants `section.ts`/`module.ts`/`play-cli.ts` and does not name `command.ts` at all —
its subject is generating a field list from `SCHEMAS`, which is help text, not adoption;
`single-dev-mode` is blocked behind `auto-save-export-and-load` and gates on a dev-mode toggle that a
reload has no dependency on. This spec is near the floor of what earns the ceremony, and it gets it
because the alternative is that the work has no home rather than because the work is large.

**The mechanism is not built here.** `adoptRegistry` already prunes, re-inits and re-spreads
discovery, and already has the exact semantic a reload needs. The diff is a command entry, a context
field, one extracted function and its tests. A diff that changes `adoptRegistry` itself is the signal
that this spec found something its clauses did not name, and is filed as a finding rather than worked
around.

**Not a file watcher.** Watching the local file and reloading on change was considered and rejected on
two counts: it makes a session's behaviour depend on wall-clock file events, which fights the `# test`
replay format the whole authoring workflow depends on, and it turns a reload into a signal that
something changed. c5 states the property that makes the polling alternative correct instead.

**Distinct from `in-process-module-api-pass3-the-sealed-surface-has-no-way-to`.** That open finding is
about loading a **save** into a live session with no route but mutating `registry.saves`, and it is
deferred onto whichever of `auto-save-export-and-load` or `single-dev-mode` lands first. This spec is
about adopting a **module**, which `adoptRegistry` already exports a route for. They are adjacent
doors on one surface and an auditor should not read one as the other; neither blocks the other.

## Open questions

- Whether `starting-zone` should require this spec. It does if the zone is authored through a
  two-process game-master session, and does not if it is authored as a file and loaded at startup. No
  edge is recorded until the authoring method is chosen, because a `requires` written on a guess is
  the kind of ordering claim that gets worked around rather than read.

## Audit passes

### Pass 1 — 2026-08-16

- base: `cb74060058051c3d6fbd4249cfa72bbbe6d3ef25`
- head: `feae5564d27f7b0cea30dae85456deaec0952bc9`
- proof 1: met — /reload re-reads through AuthoringContext.readLocalChanges and adopts, proven by mutation
 at both layers rather than by the tests' own wording. Aimed manifest
 mutations-...-pass1.json entries 1-5, all KILLED at their own named test, re-run with the mutant
 still applied: (a) src/runtime/command.ts:439 `text = read();` -> `text = authoring.localSource.text;`
 kills command.test.ts "reaches a location a different process added to the local file, with no
 restart" — the remembered-copy defect the clause names is the mutant, and it is caught; (b) the same
 test is killed by replacing command.ts:444 `return adoptLocalChanges(ctx, authoring, text, RELOADED);`
 with `return noted('plain', RELOADED);`, so the "Reloaded" line alone cannot carry the test;
 (c) play-cli.ts:510 `readLocalChanges: () => readLocalChanges(localFile, dependencies)` replaced by an
 IIFE that closes over the text read at construction kills play-cli.test.ts "picks up a location
 another process wrote into the file, in the session already running" — the CLI reader really does
 close over the path, not the contents; (d) the same play-cli test is killed by defeating the adopt in
 command.ts; (e) play-cli.ts:494 `return existsSync(target) ? readFileSync(...) : initial...` reduced to
 the initial module kills "writes and re-reads the same file, so a staged section survives a reload".
 A third manifest (audit-...-pass1-gaps.json) confirms the post-adopt view is republished to the
 driver: replacing `return shown(view(ctx.session), [note('plain', staged)])` with a call that drains
 the view but returns no view kills the same c1 test. The play-cli half runs against a real file in a
 real temp dir written by a `writeFileSync` the session was never told about, which is the clause's
 "different process". Re-run: npm run mutate -- <either manifest>.
- proof 2: met — The diagnostic gate is one line and it is watched. command.ts:395
 `if (diagnostics.length > 0 || localStatus?.loaded !== true) {` weakened to
 `if (diagnostics.length > 99999) {` is KILLED twice over, at command.test.ts "leaves registry, state,
 log and clock untouched when the file does not load" and at play-cli.test.ts "refuses the whole of an
 edit the file cannot load, and goes on playing" — the second over a real file on disk. The test's
 `snapshotOf` is a real witness rather than a restatement: `serializeSession` is `diffState` over every
 one of the 17 SAVE_FIELDS (src/runtime/save.ts:49-67), so location, inventory, flags, equipped, buffs,
 activeAction, journey, instances, populations, modals, time, rng and player are all compared, and the
 test additionally re-runs `/wait 1` and asserts time===6, so play demonstrably continues. Diagnostics
 land on the tool channel by construction: `noted` builds a ToolMessage with `words: 'tool'`
 (command.ts:222). "No partial adoption" holds for the authoring context too — inserting
 `authoring.localSource.text = text;` above the refusal return is KILLED (gaps manifest), as is
 inserting `persist?.(text);` there. I also checked the gate against input `/dsl` can never produce,
 since /reload is the first path handing wholly unvalidated file bytes to the loader: eleven hostile
 sources through `npm run inspect` over loadUniverseWithDiagnostics (control bytes, no `# info` header,
 an unterminated heading, an unresolvable `requires`, colon soup, a redeclaration of a base module,
 an unknown section kind, empty, duplicate ids, tab indentation) all return diagnostics; none throws,
 so no file an author can write escapes the gate into the session.
- proof 3: met — One function, two callers, proven the way the clause asks — by breaking the shared line and
 watching both commands fall. command.ts:407 `adoptRegistry(ctx.session, loaded.registry);` replaced
 by `void loaded;` is KILLED at command.test.ts "/dsl stages a section, hands it to the writer it was
 given, reloads it, and /local can show/delete it" AND, as a separate manifest entry, at "reaches a
 location a different process added to the local file, with no restart". Removing the shared function
 breaks both commands rather than one. The write-in-front half: dropping the `authoring.writeLocalChanges`
 argument from commitLocalChanges (command.ts:420) is KILLED at the /dsl test, so `persist` is the only
 thing distinguishing the two callers. The structural half is not an enumeration — the test derives its
 subject by scanning the file (`readFileSync('src/runtime/command.ts').match(/\badoptRegistry\(/g)`), and
 injecting a second guarded `adoptRegistry(...)` call is KILLED at "adopts through the one path /dsl
 adopts through: the file has exactly one adopt in it". Finally, making the gate say a different
 sentence when `persist` is absent is KILLED at "refuses a bad edit identically whichever command
 carried it", so the two commands are pinned to one refusal, not merely to one call site. Confirmed by
 reading: 451/478/481 all route to commitLocalChanges -> adoptLocalChanges, and runReload is the same
 function with a read in front; there is no second copy of load-gate-adopt anywhere in the file.
- proof 4: met — Pruning reaches the new caller and every prune is said. Two mutations in src/runtime/session.ts,
 both KILLED at command.test.ts "prunes state the edit invalidated, saying each prune, and leaves a
 state the registry resolves": deleting `for (const warning of warnings) state.log.push(warning.message);`
 (session.ts:386) and emptying `const warnings = pruneStateForRegistry(state, registry);` (session.ts:385).
 So the test watches both halves — the warnings being emitted and the state actually moving — and is not
 satisfiable by the registry swap alone. The test drives the case the clause names literally: the player
 is standing in local-changes.outpost holding local-changes.gem when `elsewhere()` empties the file, and
 it asserts a "Removed inventory local-changes.gem" line, a line naming the deleted location, the item
 gone from the view, and `registry.locations.has(status.location)` true afterwards. Read against
 pruneStateForRegistry (save.ts:152-215) the coverage is real rather than incidental: instances,
 populations, location, every RECORD_PRUNE, buffs, equipped, modals, journey and activeAction each
 produce a warning, and adoptRegistry sets logCursor to `log.length - warnings.length` so exactly the
 warnings are what the next view says. Caveat recorded as a LOW finding: the clause's second proof
 target, src/runtime/session.test.ts, contains no test of adoptRegistry or pruneStateForRegistry at all
 — the coverage that exists is entirely in command.test.ts.
- proof 5: met — Reload is information-free in both halves, each broken separately. "Says the same thing":
 command.ts:444 rewritten to pass `${RELOADED} ${Math.random()}` as the staged message is KILLED at
 command.test.ts "says the same thing and leaves the same session however many times it is called".
 "Leaves the same session": three separate mutants are KILLED at the same named test — a clock nudge
 (`state.time += 1;` before the prune in session.ts), a registry item deleted on the reload path only,
 and a line pushed onto the view's `said` on the reload path only. The last two are in
 audit-...-pass1-c5-registry.json; an earlier form that mutated the shared adopt was self-cancelling
 (both /dsl and /reload dropped the same key, so the two snapshots agreed) and escalated to the whole
 suite — reported here rather than counted, per the brief's rule that a widened kill is not the clause
 proving itself. The test reloads three times and compares message text and snapshot each time, and its
 snapshot covers every save field plus the drained log. I checked the case the test does not reach —
 a reload when the local file does not exist at all, which is a driver's normal state — through
 `npm run inspect` over the real fileAuthoring/openRepl path: serializeSession and sessionStatus are
 byte-identical before and after, `said` is empty, the message is the same, and no file is created. So
 a polling driver is safe on a tree where nobody has authored anything yet, which is where it starts.
- proof 6: met — `npm run tasks -- merge-ready` run in this worktree at feae556: tsc pass, npm test pass,
 layer-check pass, audit-status pass, doctor pass (25 pre-existing warnings, which do not fail the leg),
 bytes pass, tree pass, base pass, and `spec a-session-adopts-an-edit-or-refuses-it-whole` pass. The one
 red leg is `clauses`, red for exactly one reason — "has no recorded audit pass" — which is this pass;
 it is the gate waiting on the auditor, not a failure of the branch. Re-run after filing. Timing checked
 against the five-minute rule: the two touched test files run 123 tests in 1.66s, so the three new
 filesystem-touching play-cli tests add no measurable load to the suite.

### Pass 2 — 2026-08-16

- base: `cb74060058051c3d6fbd4249cfa72bbbe6d3ef25`
- head: `8ed8623bee67edceb9b00e1f125f932ede8a17bc`
- proof 1: met — Re-graded from the diff, not from pass 1. Aimed manifest
 C:\Users\yonat\AppData\Local\Temp\audit-a-session-adopts-an-edit-or-refuses-it-whole-pass2-mutations.json,
 entries 1-3, all KILLED at their own named test and re-run with the mutant still applied:
 (a) command.ts:441 `return authoring.readLocalChanges();` -> `return authoring.localSource.text;`
 kills command.test.ts "reaches a location a different process added to the local file, with no
 restart" — the reader is what is read, not the remembered copy; (b) command.ts:458
 `return adoptLocalChanges(ctx, authoring, text, RELOADED);` -> `return noted('plain', RELOADED);`
 kills the same test, so the "Reloaded" line alone cannot carry it; (c) play-cli.ts:508
 `readLocalChanges: () => readLocalChanges(localFile, dependencies)` replaced by an IIFE closing over
 the bytes read at construction kills play-cli.test.ts "picks up a location another process wrote
 into the file, in the session already running" — the CLI reader closes over the path. That play-cli
 test writes a real file in a real temp dir with a writeFileSync the session was never told about,
 which is the clause's "different process", and it asserts both the registry entry and the travel
 choice on the republished view. Re-run: npm run mutate -- <that manifest>.
- proof 2: met — command.ts:395 `if (diagnostics.length > 0 || localStatus?.loaded !== true) {` weakened to
 `if (diagnostics.length > 99999) {` is KILLED at command.test.ts "leaves registry, state, log and
 clock untouched when the file does not load" (manifest entry 4). Its snapshotOf is a real witness:
 serializeSession covers all 17 SAVE_FIELDS and the test re-runs /wait 1 and asserts time===6, so
 play demonstrably continues. The no-partial-adoption half is watched from the write side too:
 inserting `persist?.(text);` above the refusal return is KILLED at "writes nothing over a file that
 no longer loads, so the other process keeps its text" (entry 6), the new test this branch added,
 which pins the refusal for the /dsl caller as well. Diagnostics land on the tool channel by
 construction — `noted` builds a ToolMessage with words:'tool'. Measured and reported rather than
 filed: the gate's second disjunct `localStatus?.loaded !== true` is NOT watched — replacing the gate
 with `if (diagnostics.length > 0) {` SURVIVED the whole suite (3272 tests, 0 failed). I looked for an
 input that reaches it and found none: eight local-file texts through loadUniverseWithDiagnostics
 (empty, no `# info` header, a different module id, a redeclaration of a base module, an unresolvable
 `requires`, NUL/control bytes, header only, a bad field) each either loaded cleanly or produced a
 diagnostic localDiagnosticsFor keeps, so the first disjunct always fires first. Treated as a
 defensive disjunct with no reachable input rather than as dead code or as a hole.
- proof 3: met — command.ts:407 `adoptRegistry(ctx.session, loaded.registry);` -> `void loaded;` is KILLED
 twice, as two separate manifest entries against two separate named tests: command.test.ts "/dsl
 stages a section, hands it to the writer it was given, reloads it, and /local can show/delete it"
 and "reaches a location a different process added to the local file, with no restart". Removing the
 shared function breaks both commands rather than one, which is what the clause asks for. Structural
 half re-derived rather than trusted: `grep -n "adoptRegistry" src/runtime/command.ts` returns the
 import at :21 and exactly one call at :407, and the test asserting it derives its own subject by
 scanning the file. Both structural derivations were mutation-checked from the other direction —
 rewriting /local show to read `authoring.localSource.text` instead of `localChangesNow(authoring)`
 is KILLED at "lists, prints and deletes what the file holds rather than what this session remembers"
 AND, as a separate entry, at "reads the remembered copy in exactly one place, which is the place
 that consults the file", so the one-read invariant is watched behaviourally and structurally.
 Confirmed by reading: /dsl, /local clear and /local delete all route through commitLocalChanges ->
 adoptLocalChanges, /reload is the same function with a read in front, and there is no second copy of
 load-gate-adopt in the file.
- proof 4: met — Pruning reaches the new caller and every prune is said. Four mutations in
 src/runtime/session.ts, all KILLED: emptying `const warnings = pruneStateForRegistry(state,
 registry);` (session.ts:385) and deleting `for (const warning of warnings) state.log.push(...)`
 (session.ts:386) both kill command.test.ts "prunes state the edit invalidated, saying each prune,
 and leaves a state the registry resolves", so the test watches both halves and is not satisfiable by
 the registry swap alone. The clause's second proof target is now real: emptying the same prune line
 kills session.test.ts "prunes what the new registry cannot resolve, says every prune, and re-spreads
 discovery", the seam test this branch added, which closes pass 1's low. Its third claim was checked
 rather than taken from its title — deleting `spreadDiscovery(state, registry);` from adoptRegistry is
 KILLED at that same test, so "re-spreads discovery" is asserted and not merely narrated. The
 command-level test drives the case the clause names literally: the player stands in
 local-changes.outpost holding local-changes.gem when the file is emptied from elsewhere, and it
 asserts a "Removed inventory local-changes.gem" line, a line naming the deleted location, the item
 gone from the view, and registry.locations.has(status.location) true afterwards.
- proof 5: met — The behaviour holds and three of its four halves are proven; the log half is not, and is
 filed. Proven: command.ts:458 rewritten to stage `${RELOADED} ${Math.random()}` is KILLED at
 command.test.ts "says the same thing and leaves the same session however many times it is called",
 and that test reloads three times comparing message text and a snapshot of sessionStatus,
 serializeSession and both registry key sets each time. /reload contributes nothing to
 recorder.history — its CommandResult.recorded is [] and applyResult pushes only that — so a /reload a
 driver types can never reach a `# test`, and c5's replay argument holds by construction. Measured the
 log half directly, because the test cannot see it: with the c5 fixture's base module, `/dsl item gem
 title: Gem` + `/wait 4` leaves nothing undrained in state.log (measured 0 via npm run inspect), so
 `expect(first.view?.said).toEqual([])` holds for any cursor, and snapshotOf covers neither log nor
 logCursor — serializeSession is the 17 SAVE_FIELDS and sessionStatus is location, entities and time.
 Consequently session.ts:387 `internals.logCursor = Math.max(0, state.log.length - warnings.length);`
 replaced by `= 0` SURVIVED the whole suite (3272 tests, 0 failed). The real code is correct —
 measured on a session that has actually spoken ("Empty." from an entity action, log non-empty and
 drained), the following /reload republishes nothing, said length 0. So c5 is met on behaviour, and
 the missing proof is filed as a finding rather than graded as a failure.
- proof 6: unmet — `npm run tasks -- merge-ready` at 8ed8623 in this worktree: tsc pass, npm test pass,
 layer-check pass, audit-status pass, doctor pass (25 pre-existing warnings, which do not fail the
 leg), bytes pass, tree pass, spec pass, clauses pass — and `base FAIL — main has moved past the
 merge base`, so the invocation exits "NOT merge-ready: base failed". main has advanced 24 commits
 past cb74060 with the xp-from-events merge (1a75ee4), touching src/content/registry.ts,
 src/runtime/runtime.ts, src/runtime/effects.ts and src/runtime/skillGrants.ts. Graded unmet rather
 than met because the clause is that the invocation passes and it does not; it is routine and
 mechanically repairable rather than a defect in the diff — `git merge-tree --write-tree main HEAD`
 produces a tree with no conflict, and the two sides touch disjoint runtime files. The repair is
 `git merge main` and re-run. Timing checked against the five-minute rule: command.test.ts,
 play-cli.test.ts and session.test.ts run 205 tests in 1.94s, so the four new filesystem-touching
 play-cli tests add nothing measurable.

### Pass 3 — 2026-08-16

- base: `75152857faf3c2958ed6c7ca32d7a6335dbdfc9b`
- head: `ef5755621d99b2eafc2d551b7e04395dedaaf9b2`
- proof 1: met — Re-graded from the diff at ef57556, not from passes 1-2, and re-measured over the merged
 result. Aimed manifest C:\Users\yonat\AppData\Local\Temp\mutations-a-session-adopts-an-edit-or-refuses-it-whole-pass3.json
 (12 entries, 12 KILLED / 0 survived / 0 unstable; re-run with `npm run mutate -- <that path>`).
 Entries that carry c1: (a) command.ts:435 `return authoring.readLocalChanges();` -> `return
 authoring.localSource.text;` KILLED at command.test.ts "reaches a location a different process added
 to the local file, with no restart" — the reader is what is read, never the remembered copy;
 (b) play-cli.ts:508 `readLocalChanges: () => readLocalChanges(localFile, dependencies),` ->
 `() => initialLocalChangesModule(dependencies),` KILLED at play-cli.test.ts "picks up a location
 another process wrote into the file, in the session already running", which writes a real file in a
 real temp dir with a writeFileSync the session was never told about; (c) command.ts:503, the /local show
 arm, `localChangesNow(authoring)` -> `authoring.localSource.text` KILLED at "lists, prints and deletes
 what the file holds rather than what this session remembers"; (d) localChanges.ts:88 `const header =
 info ? info.text : renderLocalChangesModule(dependencies).trimEnd();` -> the unconditional rebuild that
 was there before 82bbdc2, KILLED at "keeps the header the other process wrote, not only the sections
 under it" — the pass-2 fix has a witness that fails for the right reason. The one read of the remembered
 copy that remains is the no-reader fallback at command.ts:433; I checked the cache behind it is still
 written (command.ts:407 `authoring.localSource.text = text;` survives the diff), so a context with a
 writer and no reader still composes successive edits against its own last write rather than against the
 text it started with. Carried across from the header fix as a defect and filed, not graded here: the
 header is now carried whole, including the module id, which is not the file's to choose.
- proof 2: met — command.ts:396 `if (diagnostics.length > 0 || localStatus?.loaded !== true) {` weakened to
 `if (diagnostics.length > 99999) {` is KILLED at command.test.ts "leaves registry, state, log and clock
 untouched when the file does not load" (pass-3 manifest entry 3), re-run at its own file with the mutant
 still applied. snapshotOf is a real witness rather than a restatement — serializeSession is diffState
 over all 17 SAVE_FIELDS, and the test re-runs /wait 1 and asserts time===6, so play demonstrably
 continues. The refusal reaches the write side too: pass 2 measured `persist?.(text);` inserted above the
 refusal return as KILLED at "writes nothing over a file that no longer loads". New this pass, and the
 reason c2 is still met after 82bbdc2 widened what refuses: command.ts:463 `listLocalSections(text);` ->
 `void text;` is KILLED at "refuses in the local file's own name when the local file is what will not
 parse" (entry 11), so the file-parses-before-the-line ordering that lets a refusal name the file and
 name `/local clear` is watched and is not narration. I checked the widening for over-strictness rather
 than taking it: with an unparseable file on disk, /dsl, /local list and /local delete refuse while
 /local show and /local clear still work, and every command that now refuses is one that previously
 succeeded by composing against the remembered copy and overwriting the other process's file, which is
 the pass-1 defect — so no capability was lost there. Where a capability WAS lost is the header, filed
 separately. Diagnostics land on the tool channel by construction: `noted` builds a ToolMessage with
 words:'tool'.
- proof 3: met — Proven the way the clause asks — one line broken, both commands fall. command.ts:408
 `adoptRegistry(ctx.session, loaded.registry);` -> `void loaded;` filed as two separate manifest entries
 against two separate named tests, both KILLED and both re-run at their own file with the mutant still
 applied: command.test.ts "reaches a location a different process added to the local file, with no
 restart" (the /reload caller, entry 4) and "/dsl stages a section, hands it to the writer it was given,
 reloads it, and /local can show/delete it" (the /dsl caller, entry 5). Structural half re-derived rather
 than trusted: `grep -n "adoptRegistry" src/runtime/command.ts` returns the import at :22 and exactly one
 call at :408, and the test that pins it derives its own subject by scanning the file rather than
 enumerating call sites. Read against the current file: /dsl (runSectionEdit), /local clear and /local
 delete all route through commitLocalChanges -> adoptLocalChanges, and /reload is adoptLocalChanges with
 a read in front and no `persist`; there is no second copy of load-gate-adopt anywhere in command.ts.
 82bbdc2 did not add one — it added `localSourceNow`, which reads and pre-parses and then hands its text
 to the same commitLocalChanges, so the number of adopts is unchanged at one.
- proof 4: met — Pruning reaches the new caller and every prune is said, proven at adoptRegistry's own seam
 rather than only through the command. Two mutations in src/runtime/session.ts, both KILLED at
 session.test.ts "prunes what the new registry cannot resolve, says every prune, and re-spreads
 discovery" (pass-3 manifest entries 6 and 7): session.ts:385 `const warnings =
 pruneStateForRegistry(state, registry);` emptied to `(pruneStateForRegistry(state, registry), [])`, and
 session.ts:386 `for (const warning of warnings) state.log.push(warning.message);` -> `void warnings;`.
 So that one test watches both halves — the state actually moving and the warnings actually being said —
 and is not satisfiable by the registry swap alone. I read the test for the vacuity shape rather than
 taking its title: its assertions are driven by ADOPT_AFTER, a second world that has no `outpost`, no
 `relic` and no `charted`, and it additionally asserts a discovery flag (`tower.discovered`) read out of
 serializeSession, which no registry swap produces on its own. The command-level half drives the case the
 clause names literally — the player stands in local-changes.outpost holding local-changes.gem when the
 file is emptied from elsewhere, and the test asserts a "Removed inventory local-changes.gem" line, a
 line naming the deleted location, the item gone from the republished view, and
 registry.locations.has(status.location) true afterwards.
- proof 5: met — Met on all four halves for the first time; pass 2's open half is now proven and its finding
 is really closed. THE LOG HALF: session.ts:387 `internals.logCursor = Math.max(0, state.log.length -
 warnings.length);` -> `internals.logCursor = 0;` is KILLED at session.test.ts "publishes its own prunes
 and not a line the session had said but nobody had read" (pass-3 manifest entry 8), re-run at
 src/runtime/session.test.ts with the mutant still applied and failing there too. The same mutation
 SURVIVED the whole 3272-test suite at pass 2, so d31e735's witness is the difference and it fails for
 the right reason. That witness is not the false-proof shape either: it puts a line into state.log with
 applyDirective and never drains it, then asserts the post-adopt view does NOT carry that line while it
 DOES carry the prune warnings — so a cursor too low and a cursor too high both fail it, and it sits at
 adoptRegistry's seam because, as its own comment records, nothing reachable through runCommand can leave
 a line undrained. THE MESSAGE HALF: command.ts:452 `return adoptLocalChanges(ctx, authoring, text,
 RELOADED);` rewritten to stage `${RELOADED} ${Math.random()}` is KILLED at command.test.ts "says the
 same thing and leaves the same session however many times it is called" (entry 9), and that test reloads
 three times comparing message text and a snapshot of sessionStatus, serializeSession and both registry
 key sets each time. THE REPLAY HALF, re-measured this pass rather than carried forward: /reload's
 CommandResult.recorded is [] — measured directly through runLine over a real AuthoringContext with
 `npm run inspect` (recorded: [] on /reload and on /dsl alike) — so a /reload a driver types can never
 reach a `# test`, and c5's nondeterminism argument holds by construction rather than by intention.
- proof 6: met — `npm run tasks -- merge-ready` at ef57556 in this worktree: tsc pass, npm test pass,
 layer-check pass, audit-status pass, doctor pass (23 warnings, which do not fail the leg), bytes pass,
 tree pass, and BASE PASS — "main has not moved past the merge base", which is pass 2's one substantive
 failure repaired by 7fda08e. Every leg the clause enumerates is green. The two legs still red are `spec`
 and `clauses`, and both name only c6 itself: `clauses` is red for "1 outstanding across 2 pass(es): c6",
 which is the verdict this pass replaces, and `spec` is red for "1 open member(s):
 a-session-adopts-an-edit-or-refuses-it-whole-clause-6", the undelivered record pass 2's unmet grade
 created and whose substance 7fda08e repaired without closing it. Graded met on the enumerated legs
 rather than unmet on the invocation's exit code, because recording unmet a second time is what keeps the
 invocation red: scripts/tasks/audit.ts:493 skips an already-open clause record and never closes one, so
 no later met grade retires it and a clause of this shape becomes unmeetable after a single unmet pass.
 The remaining repair is one store write, `npm run tasks -- done
 a-session-adopts-an-edit-or-refuses-it-whole-clause-6`, filed below as a finding with what it costs.
 I checked the merge itself rather than taking the gate's word for it: comparing docs/tasks.jsonl at
 7fda08e against both of its parents record by record, 0 of main's 1417 records and 0 of the branch's
 1391 are lost, no record appears that neither parent had, main's side differs in exactly the one record
 the resolution was about, and the branch's side differs in 11 records which are all main's newer text
 taken whole. Timing against the five-minute rule: the three touched test files run 209 tests in 2.0s.
