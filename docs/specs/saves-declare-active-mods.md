# saves-declare-active-mods

## Deliverable

A save should carry the mods it needs, so that opening it brings them with it — whether or not the
state holds a single item from any of them. That last clause is the design constraint: the set is
*declared*, never inferred from the id prefixes the state happens to contain, because a mod that
contributed no state is still one the save was played with.

The list is a requirement manifest, not a configuration to restore. It says what the save needs; it
never says what to switch off. That follows from one worked case rather than from taste: a player
turns on a newly released mod and then opens their save, and it must simply load. A mod turned on
after the save was written is indistinguishable from any other mod the save does not name, so a list
able to switch mods off would switch off the one the player just turned on and came back to play.

Today nothing records it. `serializeSave` writes `{version, ...diff}` and the enabled set is known
only to whoever assembled the module sources — `scripts/play-cli.ts` and the mod portal cache, since
`src/ui` does not exist and `src/main.tsx` is a placeholder. The runtime never sees it at all:
`loadedModules` lives on `UniverseLoadResult`, while `startSession`, `serializeSave` and `loadSave`
all take a bare `Registry`, which has no module list.

The load path this needs does not exist either, and cannot be reached by reading the loader's
output. `loadUniverseWithDiagnostics` resolves every problem it meets by switching a module off and
retrying in a loop, so by the time it returns, an incompatibility between two mods the player turned
on has already been settled by dropping one of them unilaterally. That is the right behaviour for a
developer pointing the loader at files and the wrong one for a player opening a save, and the
difference belongs to the caller: this branch decides in front of the loader and does not change it.

The rule is that the game never starts on a broken mod set, and never drops mod content to get the
player moving. **A broken configuration blocks, and the player fixes it in the mod store. The one
exception is a mod the player already switched off, because there the intent is theirs and already
stated** — that is the canonical way to stop using a mod, and it is the only path that prunes.

| the save declares    | the mod store has on              | opening it                                                    |
| -------------------- | --------------------------------- | ------------------------------------------------------------- |
| `A B C`              | `A B C`                           | loads. no prompt.                                              |
| nothing about `A`    | `A`                               | loads, with `A`. no prompt.                                    |
| `A`                  | `A` is off                        | asks: sync `A` on and load / go to the mod store / continue without `A` |
| `A B`                | `A B`, which cannot coexist       | blocked. go to the mod store.                                  |
| `A`                  | `A`, which requires a missing `B` | blocked. go to the mod store.                                  |
| nothing about `A`    | `A`, which will not parse         | blocked. go to the mod store.                                  |
| — a new game         | `A`, which will not parse         | blocked. go to the mod store.                                  |

A declared module with no source anywhere is the third row with the sync option absent: there is
nothing to switch on, so the choice is the mod store or continuing without it. It is not a row of its
own and needs no concept of "downloaded" beyond a source being findable.

Continuing, in the one row that offers it, prunes the state that belonged to the module and stops the
save declaring it when next written. That is the removal being complete rather than an escape hatch.

Proof:

- [c1] A save declares the mods that were enabled when it was written. The list sits beside `version`
  in the envelope, never inside the diff, and it is the enabled set the session was constructed with
  rather than anything inferred from the ids the state holds.
  proof: vitest src/runtime/save.test.ts
- [c2] The declaration survives a content round trip. A `# save` section carrying a mod list parses,
  re-serializes and reloads unchanged; `serialize.ts` does not drop the field it does not know.
  proof: vitest src/content/roundTrip.test.ts
- [c3] The field is additive and this branch bumps nothing. `SAVE_VERSION` is unchanged, a save with
  no mod list loads exactly as it does today, and the three shipped `# save` fixtures are untouched.
  proof: npm test
- [c4] A mod the player switched off is the one case that offers to continue. A save declaring it is
  met with three options — switch it on and load, go to the mod store, or continue without it — and
  the third prunes the state ids that belonged to it and stops the save declaring it when next
  written, which is how a mod is removed from a save for good. Nothing is pruned or written until
  the choice is made, and the sync option is absent when no source for the module can be found.
  proof: vitest scripts/play-cli.test.ts
- [c5] Every other broken set blocks. Modules that cannot coexist, a required dependency that is not
  there, or a module that will not parse stop the load, name what is at fault, and offer only the
  mod store. Nothing is pruned, nothing is switched on or off, and the save on disk is untouched, so
  the player fixes it where mod configuration is fixed and opens it again.
  proof: vitest scripts/play-cli.test.ts
- [c6] The reason is structured, not a parsed message. A module order problem carries which kind of
  problem it is, and the decision reads that rather than matching on error text.
  proof: vitest src/content/universe.test.ts
- [c7] The options are data, not prose. Each carries the modules it concerns and what it does with
  them, so one decision renders as a REPL prompt or as a modal without either caller re-deriving it,
  and the mod store option can name the module to navigate to and highlight rather than leaving it
  to be recovered from a sentence.
  proof: vitest
- [c8] The decision is pure. Given a declared list, the modules switched on and the sources
  available, the whole choice — load, offer the three options, block — is computed by a function
  that reads no file, builds no registry and writes nothing, so every row of the table is a unit
  test rather than a fixture.
  proof: vitest
- [c9] The mod store's enabled state has exactly one writer. Syncing a module on, and switching one
  off, both persist through the same seam `npm run modportal` uses, so the manifest is never written
  by two code paths that can disagree about its shape.
  proof: vitest scripts/modportal.test.ts
- [c10] The check guards the enabled set, not the save. Starting a new game on a set that will not
  parse or cannot coexist is blocked by the same decision and the same prompt as opening a save on
  it, so there is no way into the game that skips it.
  proof: vitest scripts/play-cli.test.ts
- [c11] A set that loads as something other than what was approved is a block, not a success. The
  modules the loader reports having loaded are compared against the set the decision approved, and
  any difference stops the session with the same prompt. The decision cannot pre-empt a compile-stage
  failure without compiling, so it checks afterwards instead, and no class of silent switch-off can
  reach the player by being one the pre-check did not model.
  proof: vitest scripts/play-cli.test.ts

## Decisions

- **A broken set blocks; the exception is intent the player already stated.** The game never loads a
  save in a degraded state to keep the player moving, because that trades their content for their
  convenience without asking. The single case that continues is a mod they had already switched off:
  the intent is theirs and on the record, so the game offers to complete it. Incompatibility, a
  missing dependency and a module that will not parse are configurations nobody chose, and the mod
  store is where they get chosen away.
- **Two earlier drafts of this policy were wrong and are recorded so they are not re-proposed.** The
  first pruned a missing mod silently and refused only repairable conflicts; the second offered
  continue-and-prune on every failure. Both let the game discard the player's content to avoid
  asking a question. The rule above is narrower than either.
- **A module with no source is a module that is off.** Rather than a "downloaded" concept the mod
  store does not yet have, an unfindable source is the switched-off row with the sync option
  withheld. This keeps the vocabulary at on and off, which is what a player sees, and leaves nothing
  in this branch waiting on `mod-portal-gui`.
- **The list is additive; it enables and never disables.** Opening a save switches on what it
  declares — with the player's agreement — and switches off nothing it omits. This is forced, not
  chosen: a mod turned on after a save was written is the same case as any mod that save never
  named. The cost is that opening a save does not restore a configuration exactly, and the mod store,
  not the save, is where things are turned off. The one place a save's list shrinks is the third row,
  by the player choosing it.
- **The decision sits in front of `loadUniverseWithDiagnostics`, which is not changed.** Its
  switch-off-and-retry loop is the correct behaviour for `probe`, for contribution validation and for
  a developer loading files, and every one of those callers would break if blocking became the
  loader's policy. What differs is not the mechanism but who is allowed to decide, so the caller
  decides.
- **Being in front of the loader is not enough, so the caller also checks behind it.** The loader
  switches a module off and retries on a compile-stage failure as readily as on an order problem, and
  no pre-check can predict a compile without compiling. Rather than model the loader's failure classes
  and drift from them, the decision compares what came back against what it approved — c11. That
  catches every present class and every one added later, and it is the difference between a rule that
  holds and a rule that holds for the cases someone remembered.
- **The mod list is envelope, not state.** It sits beside `version` where `parseSaveSection` already
  splits the JSON, so it never reaches `diffState`, `SAVE_FIELDS` or `pruneStateForRegistry` — all of
  which exist to reconcile ids the player's state holds against a registry, which is a different
  question from which modules were configured. Keeping it out of `GameState` is also what makes the
  field additive: `checkSave` rejects unknown fields in the *diff* only, so an absent list means
  "this save does not say" and no `SAVE_VERSION` bump is needed. That keeps this branch out of the
  queue behind `save-fixture-migration`.
- **The list records what was enabled, not what loaded.** They differ when a mod was switched on but
  failed to load, and recording only the loaded set would make that mod vanish from the save
  permanently — one bad load and the player has silently lost it from their configuration.
- **The enabled set rides on the session, not on the `Registry`.** A `Registry` is the compiled
  result and genuinely does not know what was asked for; `registry.namespace` privately holds the
  *loaded* ids, which is the wrong set by the decision above. Whoever constructs a session knows the
  enabled set, so the session carries it and `serializeSave` reads it from there.
- **The mod store option navigates; it never repairs.** Continuing and syncing are the options that
  change anything, and the player takes each with the consequence stated in front of them. Going to
  the mod store takes the player there and highlights the module at fault, and stops — switching
  off, updating or reinstalling is theirs to do, in the place built for doing it. An option that
  quietly fixed things would make the branches differ in what they cost the player without saying so.
- **The GUI shows a modal, the REPL a prompt, and both read one decision.** In the GUI the choice
  arrives as a modal carrying the problem and the options; in `play-cli` it is a keypress per option.
  Neither presentation is allowed to hold logic the other lacks, which is what c7 and c8 exist to
  keep true. The GUI half is not built here — `src/ui` does not exist — and whoever builds it
  inherits the modal machinery `first-class-modals` settles rather than inventing a second kind of
  blocking prompt.
- **The mod store's existing capability is reused, not duplicated.** `tasks produces "mod portal"`
  reports an exact match owned by the Contribution system, so syncing does not grow a second way to
  switch a module on. `scripts/lib/modportalCache.ts` is read-only today and the only writer of the
  manifest is `toggle` inside `scripts/modportal.ts`; the write seam is added beside the read seam
  and `toggle` is moved onto it, so the count of writers goes from one to one rather than to two.
- **The Factorio dependency grammar is already implemented and is not this branch's work.**
  `src/grammar/dependency.ts` follows the Factorio mod-structure spec it cites: all five prefixes
  bar `(?)`, all five version operators, and `universe.ts` enforces incompatibility, missing
  requirements and version constraints. Three gaps were surveyed and deliberately left: `(?)` hidden
  optional is unsupported, `dependencies` defaults to `[]` rather than Factorio's `["base"]` because
  no base module exists here, and an optional dependency present at a disallowed version is a load
  error rather than a switch-off. A fourth — block-form `dependencies:` silently dropping the version
  constraint — is finding `dsl-load-path-2026-07-30-pass2-m2`, already ruled the fourth reproduction
  of open high `dsl-load-path-2026-07-30-h1`, and one fix covers both. None of them is repaired here.

## Open questions

- Whether the session field holding the enabled set is a list of ids or the richer `ModuleStatus`
  is the worker's call once the region is read. c1 fixes that it is the enabled set and that it
  comes from the session.
- Whether `play-cli`'s mod store option leaves the session or prints the command and waits is
  presentation, and c7 is what keeps that choice from reaching the decision.
