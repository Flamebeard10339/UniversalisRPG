# action-labels-as-members

## Deliverable

Flags and dialogue nodes hang under the object that owns them, as paths in the namespace tree. Action
labels do not, and the gap is filled by a bespoke check: `validateTestReferences` reads the owner's
built `actions` and asserts a `use:` directive names one of their labels. Nothing is broken — that
check works, and it catches an action a later module removed because it runs post-build against the
built registry. This branch buys uniformity, and it is worth doing only because two other branches
have already paid its price.

`reimplement-localization` derives a namespace-legal slug for every action, because it needs a path
segment for the action's display key and `pick-lock` costs it nothing over `pick lock`. That is the
expensive half — a stable identifier distinct from display text — and it lands there whether or not
this branch exists. `dangling-reference-on-field-edit` reconciles the namespace against the merged
section rather than against flags specifically, so an action removed by a later module takes its
declared member with it the moment that lands, with nothing written here.

What is left is small: declare the slug where flags and dialogue nodes are already declared, let
`use:` resolve through the namespace like every other reference, and retire the bespoke validator
that exists only because actions were the one addressable thing the namespace could not hold.

The record's own plan was to defer this to `gui-rebuild`, which redefines the
`use:<kind>.<objId>.<label>` choice-id contract anyway, rather than churning it twice. That reasoning
was right when written and no longer holds: localization separates the display role from the
identifier role first, so the contract is already being touched by a branch that must touch it, and
waiting for the GUI would mean the slug exists for a year with a bespoke validator standing beside it.

| the content                                                   | today                                          | after |
| --------------------------------------------------------------- | ---------------------------------------------- | ----- |
| `use: entity.front-door.pick lock`, the action exists            | passes the bespoke label check                  | resolves through the namespace |
| `use: entity.front-door.no-such-action`                          | errors — `names an unknown entity action`        | errors, through the namespace, naming the unknown member |
| a later module removes `pick lock` by label, a test still uses it | errors post-build, from the built registry      | errors, and the member is gone from the namespace with it |
| two actions on one owner whose labels derive the same slug       | both load; the second wins whatever reads first | load error, raised by localization's derivation |
| an action label containing spaces or capitals                    | used verbatim as an identifier                  | unchanged as display; addressed by its slug |

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
- [c4] Nothing authored changes and no directive is respelled. Every `# test` in shipped content
  passes byte-identical, `use:` keeps its written form, and an action's label is still the label the
  author wrote.
  proof: npm test
- [c5] The choice-id contract is stated once, where it is built. `use:<kind>.<objId>.<slug>` is
  produced and parsed in one agreed shape across `session.ts` and `test.ts`, rather than a regex in
  each that happens to match the other.
  proof: vitest src/runtime/session.test.ts

## Decisions

- **This is uniformity, and it is only worth doing because its cost was paid elsewhere.** The record
  says so plainly — nothing is broken, labels are validated, objId is already namespaced. A refactor
  that fixes nothing earns its place only when it is nearly free, and it became nearly free when
  localization took on the slug and `dangling-reference-on-field-edit` took on removal. Neither was
  done for this task's sake, which is exactly why this one stays small.
- **The deferral to `gui-rebuild` is retired, and the reason is recorded rather than reversed
  silently.** Its logic was that the GUI redefines the choice-id contract, so touching it twice is
  waste. Localization now touches it first and must, so the second touch is already happening; and
  `gui-rebuild` sits behind `first-class-modals` and the whole decided chain, which would leave a
  derived slug and a bespoke validator standing side by side for a long time.
- **The slug is derived, not authored, and a collision is a load error.** `pick lock` becomes
  `pick-lock` by the rule ids already follow, so no author writes anything new and every existing
  action keeps working. Two labels under one owner deriving the same slug is rare, checkable, and
  loud. The cost is honest: renaming a label moves its slug, so a `use:` elsewhere breaks — caught at
  load rather than prevented, which is the same bargain every id in this DSL already makes.
- **The identifier and the display are separated by localization, not here.** After that branch, the
  label is display text resolved through a key and the identifier is the slug. This branch does not
  re-litigate that split; it takes the slug as given and gives it a home in the namespace.
- **Not merged into `reimplement-localization`.** It would be tempting, since that branch creates the
  slug. It is refused because that branch's proof is that raw text cannot be rendered, and folding a
  namespace refactor into it would put two unrelated failures behind one audit — and because this can
  be dropped entirely without costing localization anything, which is only true while they are
  separate.

## Open questions

- Whether `use:` keeps a bespoke directive grammar or becomes an ordinary namespaced reference in
  `referenceSites.ts` is the worker's call once the region is read. c2 fixes that the label
  comparison goes, not which visitor replaces it.
- `gui-rebuild` will still redefine the choice-id contract when it lands. c5 asks only that the shape
  be agreed in one place now, so that redefinition changes one thing rather than two regexes that
  drifted apart in the meantime.
