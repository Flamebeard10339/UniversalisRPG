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
