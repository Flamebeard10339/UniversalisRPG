# dsl-kind-prints-fields

## Deliverable

`/dsl` today has one form, `/dsl <kind> <id> [body]`, and it writes. Every other command in the REPL
announces what it does — `/local delete`, `/local show`, `/create-test` — and this one does not, which
is how `/dsl item gem` came to stage an empty item: a read-shaped invocation performed a write, and
the empty body was accepted as content. This branch gives `/dsl` explicit verbs, adds the field list
the record asks for as one of them, and fills the gap that neither record noticed — there is no way to
read an already-loaded section at all.

```
/dsl fields <kind>            what a section of this kind may contain
/dsl show <kind> <id>         the section as loaded, from the registry
/dsl stage <kind> <id> [body] stage or replace a local section        (write)
```

`stage` is the command's own word — it already answers "Staged # entity door" — and `show` is
`/local show`'s. The write is the only form that changes anything and it is the only one that names
itself.

**The verbs are why this absorbed a second record.** `dsl-write-verb-not-visible-in-syntax` asked for
exactly this, and named the collision: once `/dsl <kind>` prints fields, argument count becomes the
read/write discriminator — one argument reads, two write — which is the thing it wanted removed.
Shipping the field list at arity 1 would have entrenched the defect and then paid to undo it. Under
explicit verbs no discriminator is ever created, `/dsl item gem` is not a valid write, and the fix and
the feature are one change rather than two that fight.

Two pieces of the field list itself, both specified in the record and both confirmed against the tree.

**`AnySchema` has to widen.** It carries `kind`, `fields` as `Record<string, { parser: unknown }>`,
and `entries` — enough for a caller that does not know the kind to walk fields, and not enough to
name them. A field's authored spelling can differ from its property name, and four fields do:
`entity.capabilities` is authored `stations:`, `recipe.requiresCapability` is `station:`, and
`resource.onEmpty`/`onFull` are `on empty:`/`on full:`. Printing property names would misname all four
and, worse, hand an author `onEmpty:` — which is a parse error, because the authored form has a
space. `clauses`, `bare` and `keywords` are invisible through `AnySchema` for the same reason and
belong with it.

**The bespoke kinds need a hand-written line each, and there are five, not four.** The record names
dialogue, test, save and remove. `BESPOKE` also holds `droptable`. A worker following the record
would leave one of the sixteen section kinds with no help at all, and it would be the one whose
grammar is least guessable.

| invocation                              | today                                          | after |
| ----------------------------------------- | ---------------------------------------------- | ----- |
| `/dsl fields entity`                       | not a form — `/dsl fields` reads as kind `fields` | the fields of `# entity`, `stations:` under its authored name |
| `/dsl fields recipe`                       | —                                               | fields, with `station:` rather than `requiresCapability` |
| `/dsl fields resource`                     | —                                               | fields, with `on empty:` and `on full:` as authored |
| `/dsl fields droptable`                    | —                                               | its hand-written line — the kind the record forgot |
| `/dsl fields dialogue` / `test` / `save` / `remove` | —                                     | a hand-written line each |
| `/dsl fields nosuchkind`                   | —                                               | says the kind is unknown and lists the kinds there are |
| `/dsl show entity front-door`              | no read path exists                              | the section as loaded |
| `/dsl stage entity door <body>`            | writes, spelled `/dsl entity door <body>`        | writes |
| `/dsl stage entity door`                   | writes an empty section, spelled `/dsl entity door` | writes an empty section — asked for, not stumbled into |
| `/dsl entity door`                         | **silently stages an empty item**                | an error naming the three verbs |

The last two rows are the point. Staging an empty stub stays possible, because an author filling one
in is a real workflow; what changes is that it can only be reached by asking.

Proof:

- [c1] `/dsl` has three verbs and no unverbed form. `fields` and `show` read, `stage` writes, and an
  invocation naming no verb is an error that lists them rather than a write.
  proof: vitest scripts/play-cli.test.ts
- [c2] No invocation writes without saying so. `/dsl item gem`, the reported defect, stages nothing;
  the only path that changes local changes is `stage`.
  proof: vitest scripts/play-cli.test.ts
- [c3] `/dsl fields <kind>` prints that kind's fields, derived from `SCHEMAS`. Adding a field to a
  schema makes it appear with no second edit, which is the property that keeps the help honest.
  proof: vitest scripts/play-cli.test.ts
- [c4] Every field prints under the name an author writes. The four fields whose authored spelling
  differs from their property name — `stations`, `station`, `on empty`, `on full` — print as
  authored, and a test names all four so a fifth added later cannot quietly print wrong.
  proof: vitest scripts/play-cli.test.ts
- [c5] All sixteen section kinds answer. The eleven with schemas answer from them; the five bespoke
  ones — dialogue, droptable, test, save, remove — answer from one hand-written line each, and a test
  iterates `SECTION_KINDS` so a kind added later fails rather than answering nothing.
  proof: vitest scripts/play-cli.test.ts
- [c6] `/dsl show <kind> <id>` reads an already-loaded section, which nothing could do before. It
  reads from the registry rather than from local changes, so it answers for shipped content as well
  as staged.
  proof: vitest scripts/play-cli.test.ts
- [c7] The field derivation is exported, not inlined in the CLI. `grammar-docs-from-source` is a
  second consumer of exactly this answer, and the shape it needs is a value it can render rather than
  text printed to a terminal.
  proof: vitest src/content/module.test.ts

## Decisions

- **Verbs first, so no arity discriminator is ever created.** `dsl-write-verb-not-visible-in-syntax`
  observed that shipping the field list at arity 1 would make argument count the read/write signal —
  one argument reads, two write — which is the ambiguity it existed to remove. Folding the two is
  cheaper than shipping the discriminator and then paying to delete it, and it is the same
  churn-it-twice argument that retired `action-labels-as-members`' deferral. That record is declined
  into this one.
- **Staging an empty section stays possible, and stops being accidental.** Requiring a body would fix
  the reported bug by removing a workflow authors use — a stub to fill in. `stage` with no body is
  explicit enough, and the defect was never the empty section but the invocation that did not look
  like a write.
- **`/dsl show` fills a gap neither record noticed.** There is no way to read a loaded section today,
  which is why `/dsl <kind> <id>` looked like a read in the first place. Adding the read the syntax
  implied is what makes the verb split describe a real distinction rather than rename an existing one.
- **Derive from `SCHEMAS`, and export the derivation.** The CLI is not the only caller.
  `grammar-docs-from-source` exists to stop the grammar being documented in a third place that cannot
  be executed, and it names this task as where its derivation is budgeted. Printing straight to stdout
  would mean writing it twice, in a repository whose stated rule is not to build systems that must be
  kept in sync by hand. The verb change does not touch that export, which is why folding costs
  `grammar-docs-from-source` nothing.
- **Widening `AnySchema` is the point, not an incidental.** Without `keyword`, the help is confidently
  wrong for four fields and actively harmful for two — `onEmpty:` does not parse. `AnySchema`'s own
  comment says it "carries exactly what a caller that does not know the kind can act on", and that
  set was drawn when no caller needed to name a field to a human. It does now.
- **Five bespoke kinds, not four — the record undercounts.** `droptable` is in `BESPOKE` alongside
  dialogue, test, save and remove. Recorded here rather than silently fixed, because the record will
  keep saying four and the next reader deserves to know which is right.

## Open questions

- Whether a field's help line shows its type, its default, or only its name is the worker's call once
  `AnySchema` is widened. c3 fixes that the list is derived and c4 that the names are the authored
  ones; how much else a `parser` can honestly describe is discoverable only from the region.
- Whether `/dsl show` prints the section as authored or as serialized from the registry is left to the
  slice. `serialize.ts` can already emit a section, so the round-trip form is nearly free; the
  authored form would need local changes consulted first. c6 fixes only that a loaded section can be
  read.
