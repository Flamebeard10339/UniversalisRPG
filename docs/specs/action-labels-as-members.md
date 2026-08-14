# action-labels-as-members

## Deliverable

An action is addressed by a slug and displayed by a label, and the two stop being one string.
Today an action section's `title:` line *is* its label (`src/content/action.ts:20`), and that
label is what `activeAction.actionLabel` stores, what `findActiveAction` and `save.ts` compare by
string equality, what a `use:` directive spells and what a choice id carries. So renaming
`title: Fight` to `Combat` stops the fight under way and puts the English word into a Spanish
player's log — reproduced by `what-is-stored-or-replayed-is-an-id` pass 3, which is why this
spec's own recorded premise, that nothing is broken today, is struck rather than edited quietly.

This is the third and last owner of an action label. `travelAction` composed one from a
location's title and pass 1 found it; the recipe loader composed one from a recipe's id and pass 2
found it; this is the one an author writes, and no clause of that branch could reach it — its c3
is about text the engine composed and the engine composed nothing here, its c4 about sentences
built in TypeScript and this is built in the DSL. The slug those branches already derive for the
display key becomes the identifier, the label becomes display text and nothing else, and the
uniformity this spec was originally written for — a namespace member, `use:` resolving like every
other reference, the bespoke validator retiring — comes with it rather than being its point.

Proof:

- [c1] An action's slug is a namespace member, declared under its owner beside that owner's flags and
  dialogue nodes, so an action is addressable by the same path grammar as everything else a module
  owns.
  proof: vitest src/content/resolve.test.ts
- [c2] `use:` resolves through the namespace, and the bespoke check retires. `validateTestReferences`
  no longer reads the owner's built `actions` to compare labels; an unknown action is an unknown
  member, reported the way an unknown flag already is.
  proof: vitest src/content/references.test.ts
- [c3] An action removed by a later module takes its member with it, through the reconciliation
  `dangling-reference-on-field-edit` already built, with no removal logic written here.
  proof: vitest src/content/flags.test.ts
- [c4] What is stored, replayed and compared is the slug, and the label reaches no field that
  outlives the frame it is drawn in. `activeAction` holds the slug under a field name that says
  so, `findActiveAction`, `pruneStateForRegistry` and the encounter roster compare slugs, and a
  choice id carries one. Proven the way its two neighbours were: a save written against an action
  titled one thing is replayed against the same action retitled, in another language, and the
  action is still under way with no English in the log.
  proof: vitest src/runtime/save.test.ts
- [c5] What changes is only what had to, and it is named here in full. `SAVE_VERSION` moves 10 to
  11, because `activeAction`'s action field changes both name and domain; the seven `# save`
  fixtures carry the version stamp and nothing else, since none holds an action. Two authored
  lines move and no others: `use: entity.mirror.look in` and `use: entity.dresser.search drawer`
  in shipped `# test` sections become their slugs, which is this spec's original promise that no
  directive is respelled being withdrawn rather than quietly broken. No `title:` moves, no
  content id moves, and no player-visible English moves.
- [c6] The choice-id contract is stated once, where it is built. `use:<kind>.<objId>.<slug>` is
  produced and parsed in one agreed shape across `session.ts` and `test.ts`, rather than a regex in
  each that happens to match the other.
  proof: vitest src/runtime/session.test.ts

## Decisions

- **"Nothing is broken today" is struck, not softened.** This spec was written as uniformity on
  the recorded premise that the bespoke label check works and nothing fails. `what-is-stored-or-
  replayed-is-an-id` pass 3 refuted it against the repository's own module resolution: a save
  holds `"actionLabel":"Fight"`, changing only `title: Fight` to `Combat` yields `Detenida la
  accion action.isla.melee-combat.Fight: no existe la accion "Fight" en action.isla.melee-combat.`
  and drops the action. The shipped content has exactly that shape at
  `content/tutorial-island.dsl:120-121`, driven by two shipped recordings. The uniformity is still
  bought and is still nearly free; it is no longer the reason.
- **The stored field is renamed, not just retyped.** `activeAction.actionLabel` holding a slug
  would be a field whose name says the opposite of what it holds, which is the confusion that
  produced this defect in the first place. It is renamed with its domain, and that is what moves
  `SAVE_VERSION`.
- **`use:` spells the slug.** The alternative — accepting the written label and resolving it to a
  slug at load — was rejected: it keeps a recording depending on display text, so a `title:`
  rename still breaks it, which is the whole defect. Two shipped lines are respelled and named in
  c5. This is the same bargain every id in this DSL already makes.
- **No save migration.** Third consecutive `SAVE_VERSION` bump; `save-migration-system` stays open
  and untouched and a stale save is rejected, which is standing policy rather than a decision of
  this branch.
- **The deferral to `gui-rebuild` is retired, and the reason is recorded rather than reversed
  silently.** Its logic was that the GUI redefines the choice-id contract, so touching it twice is
  waste. Localization now touches it first and must, so the second touch is already happening; and
  `gui-rebuild` sits behind `first-class-modals` and the whole decided chain, which would leave a
  derived slug and a bespoke validator standing side by side for a long time.
- **An address is derived, not authored, and it is derived from whatever the declaration is.** A
  `# action` section is addressed by the id it was written under, so its `title:` is display and
  moves freely; an inline block on an entity or a location has no id but the label it is headed
  with, so a slug of that label is the only address available and renaming the heading renames the
  declaration, which is honest. This corrects the rule as first written here — "the slug is
  derived from the label", for every form — which c4 refutes: a slug of a title still moves when
  the title moves, so a declaration addressed that way would still stop a save on a retitle, which
  is the whole defect. The two agree wherever a label was generated rather than authored, because
  `actionSlug(humanizeEn(id))` is the id again. Two declarations under one owner deriving the same
  address is rare, checkable, and a load error.
- **The identifier and the display are separated by localization, not here.** After that branch, the
  label is display text resolved through a key and the identifier is the slug. This branch does not
  re-litigate that split; it takes the slug as given and gives it a home in the namespace.
- **Carried on the same branch as `what-is-stored-or-replayed-is-an-id`, and audited separately.**
  The earlier reasoning — two unrelated failures behind one audit — assumed they were unrelated,
  and pass 3 showed they are one failure on three owners. They stay separate specs with separate
  audits, which is what keeps the grading honest; they share a branch because the store diff, not
  the checkout, is what makes a branch owe a spec, and because this one moves the choice-id
  contract that the localization work above it reads.

## Open questions

- Whether `use:` keeps a bespoke directive grammar or becomes an ordinary namespaced reference in
  `referenceSites.ts` is the worker's call once the region is read. c2 fixes that the label
  comparison goes, not which visitor replaces it.
- `gui-rebuild` will still redefine the choice-id contract when it lands. c5 asks only that the shape
  be agreed in one place now, so that redefinition changes one thing rather than two regexes that
  drifted apart in the meantime.
