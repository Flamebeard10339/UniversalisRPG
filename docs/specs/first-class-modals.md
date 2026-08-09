# first-class-modals

## Goal

Leave the runtime with one modal mechanism instead of several — one stack, one open, one close, one
published name-and-options shape — so that the screens the game still has to grow are a definition
against that shape rather than a mechanism of their own, and so a `# test` can answer a modal
instead of ending on one. Declaring a modal in content is a separate deliverable and is not this
one; see the Decisions.

## Deliverable

The runtime gains one modal concept and stops having several. A modal is a named screen that
presents options, sits atop whatever is beneath it, and is cleared by the player choosing one of
those options. Character creation and dialogue are both instances of it rather than two bespoke
mechanisms, and the main action sheet, inventory, shop, quest journal and craft menu become one
definition each against that shape — a name, its options, and what its answer does — rather than a
mechanism each. The engine publishes a modal's name and its
options and never its presentation — every rendering layer decides for itself how a named modal
looks. Opening and closing each happen in exactly one place. A `submit-modal:` directive gives the
DSL a way to answer a modal, which is what lets `runTest` stop reporting a test that ends holding an
unanswered modal as passed.

Proof:

- [c1] `submit-modal: <key>=<value>` parses in `parseDirectiveLine` and nowhere else, spelled in the
  directive grammar the rest of `# test` uses rather than as embedded JSON; a payload that does not
  parse raises a `DslError` naming the offending line.
- [c2] The engine's published shape for a modal is a name plus its options. No presentation vocabulary —
  widget kind, layout, ordering hint, styling — crosses out of `src/runtime`, and a driver that
  renders a modal it has never heard of is possible from that shape alone.
- [c3] Modals stack. Opening a modal while one is open leaves both, answering the top one reveals the one
  beneath, and the state holds an ordered stack rather than the single `pendingModal` scalar it
  holds today.
- [c4] Open and close each have one implementation. After this branch, no assignment to the modal stack
  exists outside the module that owns it — `src/runtime/effects.ts` reaches it through that module,
  as does everything else.
- [c5] Dialogue is a modal. A dialogue menu is published through the same name-and-options shape as any
  other modal, and `PlaySession.dialogue` no longer stands beside the modal stack as a second,
  parallel mechanism for the same thing.
- [c6] `runTest` returns `passed: false`, with a failure naming the modal, for a test whose directives end
  while a modal is still open. This closes `testing-procedure-2026-07-28-m3`.
- [c7] The shipped `# test miki-route-full` answers the character-creation modal through the new directive
  and still passes, and `# save miki-route-end` is regenerated from a live session rather than
  hand-edited to match.
- [c8] `scripts/play-cli.ts` drives a modal by its published name and options. The literal
  `'character-creation'` does not appear in the driver, and `submitModal`'s signature does not name
  that modal's fields.
- [c9] The REPL's recorder captures a modal answer. A session that crosses a modal records a
  `submit-modal:` line in `Recorder.history`, so `/create-test` emits a `# test` that replays the
  modal without hand-editing. `TODO(modal-recording)` is retired rather than restated.
- [c10] Piped input survives a modal. With input piped, a `/test` whose replay crosses a modal no longer
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
- **A modal is defined in the engine, not authored in content, and that is where this branch
  stops.** Pass 1 was right that `DEFINITIONS` enumerates every modal that can be opened, and the
  Goal originally read as though content could add one. Making that true needs a `# modal` DSL
  section, a registry kind, and a way for content to say what an answer *does* — and the layer
  ordering forbids the cheap half on its own, since `src/content` sits below `src/runtime` and
  cannot see the engine's modal names to validate an `open modal:` at load time. Filed as
  `content-declared-modals`. What this branch delivers is the shape those definitions are written
  against, which is the part every one of them would otherwise have invented separately.
- **An `open modal:` naming a modal nothing defines raises a `RuntimeError` where it used to be
  inert.** Before, the name was stored and every driver ignored it, so an author's typo was a screen
  that never appeared and never complained. It now fails the way an unknown `restore:` resource
  already does, in the same switch, mid-action — consistent with the existing posture rather than a
  new one, and loud at first play rather than silent forever.
- **Saves break rather than migrate.** `loadSave` refuses any `version` that is not exactly
  `SAVE_VERSION` and no migration path exists, so turning `pendingModal` into a stack bumps the
  version and invalidates older saves. That is this repository's existing posture, not a new one;
  `save-migration-system` is tracked separately and this branch does not pre-empt it.

## Open questions

- Whether answering a modal can itself open another one — a shop confirmation over a shop — is
  permitted by the stack but not yet demanded by any content. Left unconstrained until content asks.

## Audit passes

### Pass 1 — 2026-08-09

- base: `af892db6fd7684dde4cb72d55dfbeb208923516b`
- head: `4af6b8bd379e81d19c469d876af051f25d5873a3`
- proof 1: met — `grep -rn "submit-modal" --include=*.ts src/ scripts/ | grep -v .test.ts` returns one parse
  site: src/content/test.ts:53 `SUBMIT_MODAL = /^submit-modal:[ \t]*(?<key>[a-z][a-z0-9-]*)=(?<value>.*)$/`
  inside `parseDirectiveLine`. Every other hit (referenceSites.ts:184, serialize.ts:273, session.ts:320,
  play-cli.ts:238/440) consumes an already-parsed `Directive` and parses no text. Spelled as key=value,
  not JSON, per the settled decision. The DslError arm is covered by
  `vitest src/content/test.test.ts "names the offending line for a payload that is not key=value"`, which
  asserts the message carries the offending line verbatim; the branch author's mutation of that throw was
  KILLED. `submit-modal:` with no payload and with an uppercase key both throw.
- proof 2: met — src/runtime/modals.ts:16-25 — `Modal = { name: string; options: readonly ModalOption[] }` and
  `ModalOption = { key; label; values }`. `vitest src/runtime/modals.test.ts "offers only the options still
  to be answered, and nothing about how to draw them"` asserts `Object.keys(published).sort()` is exactly
  `['name','options']` and each option's keys exactly `['key','label','values']`, so a new presentation
  field fails it. `grep -niE "widget|layout|styl|colou?r|icon|render[A-Z]" src/runtime/modals.ts
  src/runtime/session.ts` returns nothing but a prose line. Driver half proven live rather than by
  assertion: `printf '4\nsubmit-modal: name=Rowan\n2\n/quit\n' | npm run play` prints
  `[character-creation] name, race` / `Name:` / `  submit-modal: name=<text>`, then after the name
  `[character-creation] race` and the numbered value list — all produced by `formatModals`, which reads
  only `modal.name` and `modal.options`. Re-run either to re-verify.
  Caveat, filed as a finding rather than graded here: the shape is renderer-agnostic but the engine is not
  open — `DEFINITIONS` and the `ModalFrame` union enumerate every modal that can ever be opened.
- proof 3: unmet — Two of the three sentences hold and the third has a reachable counterexample.
  Hold: `GameState.modals: readonly ModalFrame[]` replaces the `pendingModal` scalar (src/runtime/state.ts:35),
  and `vitest src/runtime/modals.test.ts "leaves both when one opens over another, and reveals the one
  beneath when the top is answered"` walks character-creation under dialogue, answers the top, and sees the
  one beneath.
  Fails: "opening a modal while one is open leaves both" is false whenever the two share a name, because
  `openModal` (src/runtime/modals.ts:88) returns silently on `state.modals.some(open => open.name ===
  frame.name)`. Reproduction, run through `npm run inspect` against a two-NPC module — after
  `applyDirective(talk sage)` the stack is `["dialogue"]` with the sage's menu; after
  `applyDirective(talk scholar)` the stack is still `["dialogue"]` with the SAME sage menu, while
  `flags.scholar-seen` is now true and `visits["scholar-talk.greeting"]` is 1. The second dialogue ran every
  effect and advanced its visit counter, and its cursor was then discarded with no error. Before this branch
  `session.dialogue = result.choices ? result : null` replaced the menu, so this is also a behaviour
  regression, not only an unmet clause. The branch's only stacking fixture uses two differently-named
  modals, which is why nothing caught it.
- proof 4: met — `grep -rn "state.modals" --include=*.ts src/ scripts/ | grep -v .test.ts` shows every write is
  in src/runtime/modals.ts, through the single `stack(state)` cast at line 78; `GameState.modals` is
  `readonly`, so a write anywhere else is a type error. src/runtime/effects.ts:189 no longer assigns and
  calls `openModalNamed(state, result.modal)` instead — mutating that call to hard-code a name is KILLED by
  `src/runtime/modals.test.ts "refuses a modal nothing defines…"`. Open is `openModal`/`openModalNamed`
  only; close is the single `stack(state).pop()` in `answerModal` plus `pruneModals`' splice, and the author's
  mutations of the push and the pop are both KILLED.
  One exception the next pass should see: `loadSave` (src/runtime/save.ts) writes `modals` generically with
  the other scalar fields through a `state as unknown as Record<string, unknown>` cast, so the readonly type
  does not reach it. That is whole-state restore rather than open or close, so I have not graded the clause
  on it — but it is the path by which an unvalidated frame reaches the stack, filed as a finding.
- proof 5: met — `grep -rn "inDialogue\|DialogueSession\|PlaySession.dialogue" src/ scripts/` returns nothing;
  `PlaySession` has no `dialogue` field and `PlayChoiceKind` no `'dialogue'` member (src/runtime/session.ts:13,26).
  A menu publishes through the same shape as any other modal:
  `vitest src/runtime/modals.test.ts "publishes a dialogue menu as one option whose values are the choices
  the state currently allows"` asserts `{ key: 'choice', label: 'Choice', values: [...] }`, and
  `vitest src/runtime/session.test.ts "drives the tutorial-island miki route through the choice-list API"`
  reaches the miki menu through `v.modals[0].options[0]` with `v.choices` empty. My mutation "talk: advances
  the dialogue and publishes no modal" (replacing `openModal(state, dialogueFrame(cursor))` with `void cursor`
  at session.ts:310) is KILLED by 8 named tests across modals.test.ts, session.test.ts and play-cli.test.ts.
- proof 6: met — src/runtime/session.ts:392-394 — `runTest` ends on `const open = topModal(state); if (open)
  return { passed: false, failure: 'modal left open: ' + open.name }`.
  `vitest src/runtime/session.test.ts "fails, naming the modal, and passes once every option of it is
  answered"` pins `{ passed: false, failure: 'modal left open: character-creation' }` for both a wholly
  unanswered and a half-answered modal, and `{ passed: true }` once both options land;
  `"holds a dialogue to the same standard"` pins `modal left open: dialogue`. The author's mutation of the
  guard was KILLED. The sequencing the spec required is respected: this guard ships with the directive, and
  `# test miki-route-full` now answers rather than ends on the modal.
- proof 7: met — Byte-identical regeneration, not a match by inspection. Through `npm run inspect`: load
  content/tutorial-island.dsl, `runTest('tutorial-island.miki-route-full', registry, createGameState())`
  returns `{"passed":true}`, and `serializeSave(state, registry)` is character-for-character equal to the
  shipped `# save miki-route-end` body (`IDENTICAL BYTES: true`, zero differing keys). The test answers the
  modal through the directive (`submit-modal: name=Rowan` / `submit-modal: race=Elf`, content/tutorial-island.dsl:432-433)
  and carries `expect: miki-route-end`, which passes. Also confirmed end to end outside vitest:
  `printf '/test tutorial-island.miki-route-full\n/quit\n' | npm run play` prints
  `Test 'tutorial-island.miki-route-full' PASSED`.
  Caveat filed as a finding: the test's opening line changed from `travel: guide-house` to
  `load: miki-route-start`, which the spec did not ask for and which moves what the shipped regression covers.
- proof 8: met — `grep -n "character-creation" scripts/play-cli.ts` returns nothing (the literal survives only in
  play-cli.test.ts fixtures). `submitModal(session, answers: Record<string, string>)` names no field of any
  modal (src/runtime/session.ts:282). The driver renders from the published shape alone — `formatModals` and
  `askedOption` read only `modal.name`, `option.key`, `option.label`, `option.values` — proven live by
  `printf '4\nsubmit-modal: name=Rowan\n2\n/quit\n' | npm run play`, whose output carries the modal name,
  both option keys, the free-text hint for the option with `values: null` and the numbered list for the one
  with values. `vitest scripts/play-cli.test.ts "answers a listed value by number and records the canonical
  submit-modal: line either way"` covers the number path against the second value, not the first.
  Caveat filed as a finding: my mutation of `askedOption` from the top of the stack to the bottom SURVIVED
  the whole suite, so the driver's rule for which modal it is answering is unverified.
- proof 9: met — Live, in a piped session:
  `printf '4\nsubmit-modal: name=Rowan\n2\n/create-valid-test crossed\n/quit\n' | npm run play`
  emits a `# test crossed` whose body is `load: crossed-start` / `use: entity.tutorial-island.mirror.look in`
  / `submit-modal: name=Rowan` / `submit-modal: race=Elf` / `expect: crossed-end` — the modal answered by
  number is recorded as the canonical directive, so the emitted test replays with no hand-editing.
  `grep -rn "TODO(modal-recording)" .` returns nothing; the TODO is deleted, not restated. Also covered by
  `vitest scripts/play-cli.test.ts "emits a replayable # test from a session that crossed a modal, with no
  hand-editing"`, which reloads the emitted blocks into a fresh registry and runs them.
- proof 10: met — `promptCharacterCreation` and `nextLine` are deleted from scripts/play-cli.ts and nothing
  reads the input iterator outside the main loop (`grep -n "nextLine\|promptCharacterCreation" scripts/`
  returns nothing). Live, with input piped:
  `printf '/test tutorial-island.miki-route-full\n/state\n/inventory\n/quit\n' | npm run play` — the test
  crosses the character-creation modal, passes, and the two following lines are executed as commands
  (`Location: tutorial-island.beach`, then the inventory listing), not consumed as fields.
  And with a modal actually open, `printf '4\nRowan\n2\n/quit\n' | npm run play` answers the bare line
  `Rowan` with `Error: invalid choice: "Rowan"` and leaves the modal open, so no line is silently eaten as
  a name either. `vitest scripts/play-cli.test.ts "never takes a line as a modal field…"` and
  `"refuses a bare line while a modal is open…"` cover the same two shapes.
