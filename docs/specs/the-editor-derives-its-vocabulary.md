# the-editor-derives-its-vocabulary

## Deliverable

An author writing DSL in a text box needs to be told two things: what may be written here, and what
they have just written that names nothing. Both answers already exist in the tree, computed by the
loader, and the whole risk of this branch is that they get copied into `src/ui` as lists instead of
read from where they live. A hand-written keyword list beside a text box is the exact failure CLAUDE.md
names first and most often, and it would be wrong within one branch: `SCHEMAS` gains kinds, fields gain
`keyword:` spellings, `referenceSites.ts` gains sites, and none of those edits would reach a copy.

So the clauses below are about derivation, not about features. What may be written at the cursor is
`schemaFor(kind)`'s field names, keyword spellings, `keywords`, `clauses` and `bare` — the same five
things `parseLine` reads to decide whether a line is legal, and the same set `typoOf`
(`src/grammar/section.ts:171`) already searches when it offers a did-you-mean on a failed parse. What
names nothing is the `Visit` walk in `src/content/referenceSites.ts` run in reporting mode instead of
throwing mode: resolution and validation already walk the same sites through it, and this makes a third
caller rather than a second walk. A recipe at a water source converting `jug` to `jug-of-water` warns
about both ids because that walk reaches `# recipe`'s inputs and outputs, not because anything here
knows what a recipe is.

Reachability is the one answer that does not exist yet. `journey.reachable`
(`src/runtime/journey.ts:71`) walks from where the player is standing, with the conditions on each
edge evaluated against live state — that is a runtime question and it belongs to the runtime. The
authoring question is different and is asked of the content alone: from the `starting:` location, over
`adjacent:` edges, ignoring what the conditions say, which locations are never arrived at. A location
reachable only across a condition is reported apart from one reachable across nothing, because the
first is a design and the second is a mistake.

None of this refuses anything. Every warning here is a diagnostic on the tool channel and an edit that
loads still adopts, because a warning that blocks is a load error with a friendlier name and the loader
already owns load errors.

Proof:

- [c1] **What the editor offers at a cursor is what the parser would accept there.** For every kind in
  `SCHEMAS`, the set offered at the start of a body line equals that schema's field names, keyword
  spellings, `keywords`, `clauses` and `bare` — the same five the parser reads — and for a cursor inside
  a field's value the set comes from that field's own parser. The proof derives its subjects by walking
  `SCHEMAS`, so a kind or a field added later is covered without an edit to the test, and a field whose
  `keyword:` differs from its name is offered by the spelling the DSL wants.
  proof: vitest src/ui/completion.test.ts
- [c2] **One vocabulary, no second copy.** Nothing under `src/ui` declares a DSL keyword, field name,
  section kind or reference kind as a literal. The proof derives its subjects from the tree and from the
  schemas rather than from a list of files, because the surface that adds the copy is by definition the
  one nobody thought to check.
  proof: vitest src/ui/completion.test.ts
- [c3] **An id that names nothing is warned about, at every site the loader resolves.** A staged section
  is walked through `referenceSites.ts`'s `Visit` in a mode that reports instead of throwing, so every
  site is covered by construction: the clause is universal over `ReferenceKind` and its proof derives
  its subjects from that walk, not from a list of fields. The motivating case is pinned as an
  illustration and not as the extent — a `# recipe` at a station converting `jug` into `jug-of-water`
  where neither `# item` exists warns about both ids and names where each was read.
  proof: vitest src/content/authoringDiagnostics.test.ts
- [c4] **A location nothing can arrive at is reported, and a conditional arrival is not the same
  report.** Over the loaded locations, a walk from every `starting:` location across `adjacent:` edges
  yields three sets — arrived at unconditionally, arrived at only across a condition, and never arrived
  at — and the third is a warning while the second is stated separately. A content module with no
  `starting:` location at all is the loader's existing error and is not re-reported here.
  proof: vitest src/content/reachability.test.ts
- [c5] **A warning never blocks and never becomes an error.** An edit carrying any diagnostic this
  branch produces still stages, still validates, and still adopts if the loader accepts it; the session
  after it is identical to the session an author with no warnings would have. Nothing here can make a
  module that loads today fail to load.
  proof: vitest src/runtime/command.test.ts src/runtime/integration.test.ts
- [c6] **The same answers reach both drivers.** Every diagnostic this branch computes is available to
  `play-cli` as well as to the GUI, because it is computed below `src/ui` from the loaded modules. A
  diagnostic only one driver can see is a diagnostic living in the wrong layer.
  proof: vitest scripts/play-cli.test.ts
- [c7] **`/dsl` has three verbs and no unverbed form.** `fields` and `show` read, `stage` writes, and
  an invocation naming no verb is an error that lists them rather than a write. `/dsl item gem`, the
  reported defect, stages nothing.
  proof: vitest scripts/play-cli.test.ts
- [c8] **`/dsl fields <kind>` prints that kind's fields, derived from `SCHEMAS`.** Adding a field to a
  schema makes it appear with no second edit, which is the property that keeps the help honest — and
  it is c1's derivation answering a second caller, not a second derivation.
  proof: vitest scripts/play-cli.test.ts
- [c9] **Every field prints under the name an author writes.** The four fields whose authored spelling
  differs from their property name — `stations`, `station`, `on empty`, `on full` — print as authored,
  and the proof derives the set rather than naming the four, so a fifth added later cannot quietly
  print wrong. This is the same widening c1 reads and the reason `AnySchema` gains
  `keyword`/`keywords`/`clauses`/`bare`: without it the help is confidently wrong for four fields and
  actively harmful for two, because `onEmpty:` does not parse.
  proof: vitest scripts/play-cli.test.ts src/content/module.test.ts
- [c10] **All sixteen section kinds answer.** The eleven with schemas answer from them; the five
  bespoke ones — dialogue, droptable, test, save, remove — answer from one hand-written line each, and
  the proof iterates `SECTION_KINDS` so a kind added later fails rather than answering nothing.
  proof: vitest scripts/play-cli.test.ts
- [c11] **`/dsl show <kind> <id>` reads an already-loaded section**, which nothing can do today. It
  reads from the registry rather than from local changes, so it answers for shipped content as well as
  staged.
  proof: vitest scripts/play-cli.test.ts
- [c12] **The field derivation is exported, not inlined in the CLI.** `grammar-docs-from-source` is a
  second consumer of exactly this answer, and the shape it needs is a value it can render rather than
  text printed to a terminal. c2's no-second-copy rule and this are the same rule read from the two
  ends: the GUI must not copy the vocabulary, and neither must the CLI.
  proof: vitest src/content/module.test.ts
- [c13] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make the editor's knowledge of the language a reading of the language rather than a copy of it, before
the copy exists and starts drifting.

## Decisions

**Registers `authoring diagnostics` over `src/content`; extends `the parser` and `the section field
engine` without taking either over.** The two capabilities the survey found are already registered to
DSL load path over `src/grammar`, and neither is what this adds: the parser decides what is legal and
this reports what is offered and what is missing. Registering the diagnostics below `src/ui` rather
than beside the editor is c6's reason — a warning computed in a component is a warning `play-cli`
cannot have, and the layer rule (`grammar < content < runtime < ui`) makes the lower home the only one
both drivers can read.

**Absorbs `dsl-kind-prints-fields` whole, as c7-c12.** It was a requirement rather than a fold in the
first plan, on the reasoning that its `AnySchema` widening is what c1's offered set is read from. That
is still true and is now the argument for the fold rather than for the edge: one worker widens
`AnySchema` once and both callers of the widened thing — the CLI's `/dsl fields` and the editor's
completion — are written against it in one pass. Two workers would widen it and then read it, in
sequence, over the same two files. The author ruled on 2026-08-16 that the push folds wherever folding
costs no parallelism, and this one costs none: `scripts/play-cli.ts` is claimed by seven open records
already.

**The absorbed spec's own decisions are carried, not restated.** Verbs come first so no arity
discriminator is ever created — `dsl-write-verb-not-visible-in-syntax` is declined into that reasoning
and stays declined. Staging an empty section stays possible and stops being accidental. `/dsl show`
fills a gap neither record noticed, which is why the verb split describes a real distinction rather
than renaming one. And the bespoke kinds are five, not four — `droptable` is in `BESPOKE` beside
dialogue, test, save and remove, and c10 counts them correctly where the record undercounts.

**c3 makes a third caller of `Visit`, never a second walk.** `referenceSites.ts` is walked twice today
— once by resolution, which rewrites an id into a namespaced key, and once by validation, which hands
it back and throws. A reporting mode is the same walk with a third `Visit`. A separate traversal that
knew which fields hold ids would be the manual-sync system CLAUDE.md forbids, and would be wrong the
first time a site is added: `the-three-new-cluster-reference-sites-do-not-take-part-in-th` is that
failure already recorded once against this very file.

**Reachability is authored-content reachability, and it is not `journey.reachable`.** The runtime's
walk is from the player's location with conditions evaluated against live state, which answers "where
can I go now"; the authoring question is "can this place ever be arrived at", asked of content with no
session in it. They differ in start, in condition handling and in layer. Reusing the runtime's would
mean `src/content` reaching up into `src/runtime`, which `layer-check` refuses, and would make the
answer depend on a game state an author does not have.

**Splitting c4's answer three ways rather than two is the load-bearing part.** A location gated behind
a quest is unreachable by the two-way reading and warning about it would train the author to ignore the
warning, which is the only way this feature fails.

## Open questions

- Whether completion is offered as a list under the cursor, a dropdown, or on an explicit keystroke is
  the worker's call, and is a UI decision the author tests rather than the agent. c1 fixes the set;
  nothing here fixes the presentation.
- Whether `# dialogue`, `# test`, `# save` and `# remove` — the four bespoke kinds with no schema — get
  completion at all in this branch, or only the schema-backed kinds, is the worker's call. c1's
  derivation walks `SCHEMAS` and those four are outside it by construction; `dsl-kind-prints-fields`
  hand-writes one line each for them, and reusing those lines is permitted but not required.
