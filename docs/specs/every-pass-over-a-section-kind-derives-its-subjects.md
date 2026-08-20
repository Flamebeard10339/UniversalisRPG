# every-pass-over-a-section-kind-derives-its-subjects

## Deliverable

A section kind is declared in one place and every pass over the set reads it from there. Today
the spine is `SECTION_KINDS` at `src/content/module.ts:78`, correctly derived as
`Object.keys(PARSERS)` — and typed `readonly string[]`, so it produces no union and nothing
downstream can be keyed on it even where the author wanted to be. Thirteen sites enumerate the
set; two are compiler-enforced, two derive, and **nine are hand-written with nothing relating
them to the spine**: `BESPOKE` (7, `Record<string, …>`), `CONTENT_SECTION_MAPS` (15),
`applySection` (20 arms on `kind: string`, no `default`), `visitSection` (14 arms, no `default`),
`serializeRegistryModule` (20 registry maps walked by hand), `NAMESPACED_KINDS` (19),
`GLOBAL_SECTION_KINDS` (2), `ACTION_OWNER_KINDS` (3) and `ReferenceKind` (19). The measured drift
between them is not hypothetical: `sectionNotNamespaced` is `['info','slot','variable','remove','locale']`
and `sectionNotInMaps` is `['info','slot','flag','variable','save','remove','locale']`, and no
test relates any pair.

This has already cost the project. `5c7a9cf` added `# passive` and `# cluster-jewel` to four
files and not to `serialize.ts` or `locale.ts`; the printer did not learn `passiveSection` until
`f9d0b3d` and `TEXT_FIELDS` not until `236e76c` the next day. For that window every `# passive` a
contribution authored was **silently discarded on republish**, and nothing went red. That commit's
own message names the failure — the forecast "covered the registry and the two new files but not
the three places a new namespaced section kind has to be declared". The repair is not to widen the
forecast. It is to make the compiler ask.

Proof:

- [c1] **The rule is a gate, and it is red on this tree before anything is repaired.** A check
  derives the section kinds from the spine and fails on every table whose keys are drawn from that
  set and whose type is not total over it. It has no exemption list, no threshold and no baseline
  file. Landing it before the repair is the point: a rule nobody has watched fail is a rule nobody
  has measured.
  proof: `vitest scripts/sectionKind.test.ts`
- [c2] **The spine has a type.** `SectionKind` is a union derived from `PARSERS`, not a second
  list, and `SECTION_KINDS` is `readonly SectionKind[]`. Adding a parser adds a member with no
  edit anywhere; adding a member without a parser does not compile.
  proof: `vitest scripts/sectionKind.test.ts`
- [c3] **Every per-kind fact is a field of the row, not a list beside it.** `NAMESPACED_KINDS`,
  `GLOBAL_SECTION_KINDS`, `ACTION_OWNER_KINDS` and `CONTENT_SECTION_MAPS` are answered from a
  table keyed `Record<SectionKind, …>`, so a kind added tomorrow fails to compile until each of
  those four questions has an answer. The proof derives its subjects from `SectionKind` rather
  than naming the four, so a fifth per-kind list written next month fails it too.
  proof: `vitest scripts/sectionKind.test.ts`
- [c4] **Every pass over the set is total or does not compile.** `applySection`, `visitSection`
  and `serializeRegistryModule` dispatch on a value narrowed to `SectionKind` with a `never`
  default, which puts all three under `scripts/exhaustive.test.ts`'s existing rule rather than
  under a second one. A kind that parses and is then silently dropped by any of the three is a
  compile error.
  proof: `vitest scripts/exhaustive.test.ts`
- [c5] **A union TypeScript narrows is a union the rule asks about.** `discriminantOf` accepts a
  discriminant whenever every constituent declares a string literal at that property, which is
  the checker's own test, rather than only when all of those literals differ. The subject set is
  what the compiler treats as discriminated; a rule stricter than the checker drops unions
  silently, and its failure mode is a clean report rather than a false alarm.
  proof: `vitest scripts/exhaustive.test.ts`
- [c6] **Nothing observable changes.** Every module under `content/` parses to a registry
  deep-equal to the one it parsed to at the merge base and prints to byte-identical text, and the
  suite is green. This branch moves declarations and narrows types; it decides nothing
  differently.
  proof: `npm test`
- [c7] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: `npm run tasks -- merge-ready`

Where each of the nine goes, so the count reconciles rather than being asserted:
`BESPOKE` is the spine's second half rather than a fact beside it — `PARSERS` is `SCHEMAS` plus
`BESPOKE`, so typing the spine at c2 types it. `CONTENT_SECTION_MAPS`, `NAMESPACED_KINDS`,
`GLOBAL_SECTION_KINDS` and `ACTION_OWNER_KINDS` are the four lists c3 folds into the row.
`applySection`, `visitSection` and `serializeRegistryModule` are the three dispatchers c4
narrows. `ReferenceKind` is deliberately left alone, for the reason recorded under Decisions.
One plus four plus three plus one is the nine.

## Goal

Make adding a section kind cost one row rather than nine edits, none of which fails when it is
skipped, so that the next `# passive` is not silently thrown away by a printer nobody remembered
to tell.

## Decisions

**Depends on `nothing-downstream-rebuilds-what-the-load-path-decided` landing first.** That branch
ships `scripts/exhaustive.test.ts`, which asks the TypeScript checker which unions are
discriminated and requires a `never` guard on every consumer — subjects derived from
`shippedModules()`, so a union declared next month is a subject with no edit. c4 is that rule
applied to three switches that are currently on `kind: string` and therefore invisible to it; the
work is to narrow the scrutinee, not to write a second checker. Starting this branch before that
one merges means reimplementing a derived proof that already exists and is mutation-verified.

**Extends** the spine at `src/content/module.ts`, which already derives `SECTION_KINDS` from
`PARSERS` and is the only place that knows what a kind is. **Extends** `scripts/exhaustive.test.ts`
by feeding it three more switches — and repairs its subject test, which pass 1 of that branch's
own audit graded `unmet`: `discriminantOf` accepts a discriminant only when every constituent's
literal is *distinct*, so `CommandOutput` — where `PlayerMessage` and `ToolMessage` both declare
`kind: 'message'` — is not a subject at all, and `scripts/play-cli.ts:255` and
`src/ui/transcript.ts:85` switch on it unguarded while TypeScript narrows both without complaint.
That is c5, and it is this spec's to close because it is the same defect in miniature: a rule
whose subjects are narrower than it claims reports clean over what it cannot see.

**Adds** one capability: a per-kind row, and the check that keeps every question about a kind in
it. **Retires** four lists — `NAMESPACED_KINDS`, `GLOBAL_SECTION_KINDS`, `ACTION_OWNER_KINDS`,
`CONTENT_SECTION_MAPS` — into that row. **Takes over** nothing: `the registry` keeps
`src/content/load.ts`, `reference validation` keeps `src/content/referenceSites.ts` and
`action slug members` keeps `src/content/namespace.ts`. The 2026-08-14 ruling on
`an-action-pruned-for-a-dangling-reference-leaves-its-namespa` declined to register a second
concept over a file an existing concept already claims, on the ground that it manufactures the
two-concepts-one-file report; the same reasoning applies here and the row is registered once,
where it is declared.

**The gate lands red and stays red until c2 and c3.** This is the ordering CLAUDE.md's
`worker/mutation-proof` lesson asks for, applied to a rule rather than a test: build the check,
watch it fail on the tree as it stands, then repair. A check written after the repair has never
been observed to fail and is worth what any unfalsified assertion is worth. The measured cost of
getting this backwards is on the record at 3.5 hours and 660k tokens.

**Not `ReferenceKind`.** It is 19 members over a different question — what a reference may point
at, which is not the same set as what a section may be, and `node` and `action-slug` are in one
and not the other. Folding it in would assert an identity that does not hold. It stays where it
is and is named here so a later planner does not read its absence as an oversight.

**No `.types.ts` per module and no indirection layer.** The precedent is the 2026-08-14 ruling on
`src/runtime/state.ts` and the whole of `runtime-has-an-order-because-it-has-no-cycles`: where two
modules both need a shape, the shape goes beneath both, which adds no module. `src/content/sectionKind.ts`
already exists and already holds `SchemaKind`; the row goes there.

## Open questions

**Does c1 mean CI is red for the life of the branch?** The clause says the gate lands before the
repair and is watched failing, which is the whole reason it is c1 and not c7. Written as a
`vitest` case that fails, `.github/workflows/test.yml` is red on every push until c2 and c3 land,
and a red check nobody can distinguish from a broken one is its own hazard. The alternative is to
land it as a reporting command first and flip it to a failing assertion in the same commit that
makes it pass, which buys a green CI and gives up the thing c1 exists for. This is the author's
call and nothing else in the spec depends on which way it goes.

**Does `ACTION_OWNER_KINDS` belong to this set at all?** It says three kinds own an action
(`entity`, `location`, `item`) and `src/content/references.ts:120` refuses any other `use:`, while
`src/runtime/actions.ts:14` `findActionOwner` switches on six — adding `recipe` and `travel`,
which are not section kinds. One concept, two memberships, no relation between them. c3 folds the
content-side list into the row; the runtime-side disagreement is a question about the domain, not
about where a list lives, and this branch does not answer it. It needs a ruling before anyone
makes the two agree, because either could be the wrong one.
