# first-class-modals

## Goal

Leave the runtime with one modal mechanism instead of several, published as a name and its options,
so that the screens the game still has to grow — inventory, shop, quest journal, craft menu — cost
content rather than engine, and so a `# test` can answer a modal instead of ending on one.

## Deliverable

The runtime gains one modal concept and stops having several. A modal is a named screen that
presents options, sits atop whatever is beneath it, and is cleared by the player choosing one of
those options. Character creation and dialogue are both instances of it rather than two bespoke
mechanisms, and the main action sheet, inventory, shop, quest journal and craft menu become
expressible as modals without further engine work. The engine publishes a modal's name and its
options and never its presentation — every rendering layer decides for itself how a named modal
looks. Opening and closing each happen in exactly one place. A `submit-modal:` directive gives the
DSL a way to answer a modal, which is what lets `runTest` stop reporting a test that ends holding an
unanswered modal as passed.

Proof:

- `submit-modal: <key>=<value>` parses in `parseDirectiveLine` and nowhere else, spelled in the
  directive grammar the rest of `# test` uses rather than as embedded JSON; a payload that does not
  parse raises a `DslError` naming the offending line.
- The engine's published shape for a modal is a name plus its options. No presentation vocabulary —
  widget kind, layout, ordering hint, styling — crosses out of `src/runtime`, and a driver that
  renders a modal it has never heard of is possible from that shape alone.
- Modals stack. Opening a modal while one is open leaves both, answering the top one reveals the one
  beneath, and the state holds an ordered stack rather than the single `pendingModal` scalar it
  holds today.
- Open and close each have one implementation. After this branch, no assignment to the modal stack
  exists outside the module that owns it — `src/runtime/effects.ts` reaches it through that module,
  as does everything else.
- Dialogue is a modal. A dialogue menu is published through the same name-and-options shape as any
  other modal, and `PlaySession.dialogue` no longer stands beside the modal stack as a second,
  parallel mechanism for the same thing.
- `runTest` returns `passed: false`, with a failure naming the modal, for a test whose directives end
  while a modal is still open. This closes `testing-procedure-2026-07-28-m3`.
- The shipped `# test miki-route-full` answers the character-creation modal through the new directive
  and still passes, and `# save miki-route-end` is regenerated from a live session rather than
  hand-edited to match.
- `scripts/play-cli.ts` drives a modal by its published name and options. The literal
  `'character-creation'` does not appear in the driver, and `submitModal`'s signature does not name
  that modal's fields.
- The REPL's recorder captures a modal answer. A session that crosses a modal records a
  `submit-modal:` line in `Recorder.history`, so `/create-test` emits a `# test` that replays the
  modal without hand-editing. `TODO(modal-recording)` is retired rather than restated.
- Piped input survives a modal. With input piped, a `/test` whose replay crosses a modal no longer
  consumes the following lines as that modal's fields: a marker command sent after such a `/test`
  is still executed as a command, not eaten as a name or a race.

### Sequencing

The directive spelling lands first and the unified modal system records against it. The `runTest`
guard lands with the directive rather than before it: on its own the guard fails the shipped
`miki-route-full`, which today ends holding `pendingModal: character-creation`, and there is no way
to answer that modal until `submit-modal:` exists.

## Decisions

- **The REPL half stays in this branch rather than running beside it.** `testing-procedure-2026-07-28-m3`
  records three symptoms of one missing directive — a recorder that cannot capture a modal, a
  `runTest` false green, and piped-mode input corruption — and states that the directive closes all
  three at once. Splitting them across branches would split one fix, and the recorder cannot be
  built before the name-and-options shape it records against exists. It is a dependency, so it is a
  sequence, not a parallel set.
- **`submit-modal: key=value`, not JSON.** It matches the rest of the directive grammar, which is
  what a reader of a `# test` section has already learned. Settled 2026-07-29.
- **A modal is one mechanism, not a family.** The main action sheet, inventory, an NPC conversation,
  a shop, the quest journal and the craft menu are the same thing wearing different content. Settled
  2026-07-29.
- **The engine never describes presentation.** It publishes name and options; each rendering layer
  owns how that is drawn. Settled 2026-07-29.
- **Saves break rather than migrate.** `loadSave` refuses any `version` that is not exactly
  `SAVE_VERSION` and no migration path exists, so turning `pendingModal` into a stack bumps the
  version and invalidates older saves. That is this repository's existing posture, not a new one;
  `save-migration-system` is tracked separately and this branch does not pre-empt it.

## Open questions

- Whether answering a modal can itself open another one — a shop confirmation over a shop — is
  permitted by the stack but not yet demanded by any content. Left unconstrained until content asks.
