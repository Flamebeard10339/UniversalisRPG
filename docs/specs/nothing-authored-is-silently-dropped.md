# nothing-authored-is-silently-dropped

## Deliverable

A parser consumes the text it was handed or refuses it, and there is no third outcome. Today there
is: `list.parseBlock` (`src/grammar/list.ts:22`) builds a `Cursor` per indented line, reads what the
element parser understands, and returns — nothing demands the rest of the line. The same text written
inline is refused. So whether a typo is caught follows from which form the author chose, and block
form is what shipped content uses. `dsl-load-path-2026-07-30-h1` reproduced it on the shipped file:
one letter changed in `while` at `content/tutorial-island.dsl:139` and the condition gating the front
door disappears, the beach is adjacent from the first turn, and the loader says nothing. This branch
closes that, and closes it as a property of every field that can take a block rather than of the
fields anyone thought to list.

Proof:

- [c1] **A block-form line is refused exactly where its inline twin is.** Each line `parseBlock` reads
  is required to end where the parser stopped, and a line carrying content the element parser cannot
  read raises a `DslError` naming the leftover — the message the inline form already gives. The three
  cases the finding measured (`entities:` / `  miki oven`, `flags:` / `  alert typo`, `on success:` /
  `  xp: brawling 2.5`) all refuse, and so does the `adjacent: beach whille unlocked` that motivated
  it.
  proof: vitest src/grammar/list.test.ts src/content/parse.test.ts
- [c2] **The proof derives its subjects from the schemas, and by the right predicate.** The test walks
  `SCHEMAS` (`src/content/module.ts:32`) and takes every field whose parser exposes `parseBlock` — not
  a hand-written list of field names, and *not* `isListField`. Measured at HEAD on 2026-08-15: 15
  schemas declare 26 block-capable fields; shipped content exercises 11 lines of them; and
  `location.adjacent`, the field the finding's own reproduction used, answers `isListField` false
  while accepting a block. A predicate that misses the motivating case is the enumeration failure
  wearing a derivation's clothes. The walk covers the bare, `+` and `-` forms of each field, because a
  patch is where a mod's typo arrives and the contribution system is what makes that reachable.
  proof: vitest src/grammar/list.test.ts
- [c3] **Inline and block agree, field by field.** For every block-capable field, one authored text is
  accepted by both forms or refused by both. This is the property the finding states; c1 is one
  implementation of it, and c3 is what notices if a later change re-opens the gap on another route.
  The clause is universal and its proof derives its subjects the same way c2's does.
  proof: vitest src/grammar/list.test.ts
- [c4] **Shipped content is unchanged, and a line the new refusal rejects is repaired here and named.**
  Measured at HEAD on 2026-08-15: every block-form line under a block-capable field in `content/`
  parses and leaves nothing behind, so this branch forecasts no content edit and every `# test` and
  `# save` fixture stays byte-identical. If the check finds one anyway, that line is a defect the
  loader was hiding: it is fixed in this diff and explained in the commit body. Weakening the check to
  keep a content line loading is the one repair this clause forbids.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat HEAD -- content/
- [c5] **One refusal, reused.** `requireEnd` (`src/grammar/parser.ts:56`) is the end-of-input check and
  this branch adds no second one and no second message. `dsl-load-path-2026-07-28-m2` already records
  `action.ts` holding a second, laxer copy of the section field engine; a third copy is that finding
  reproduced, not a fix delivered.
  proof: command grep -rn "requireEnd" src/grammar --include=*.ts --exclude=*.test.ts
- [c6] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make the load path unable to discard an author's words without saying so, before content volume makes
that discarding unfindable.

## Decisions

**Adds no capability; extends `the parser`.** The concept `the parser` is already registered to DSL
load path over `src/grammar`, and totality of a parse is what a parser is for. No second concept is
registered: one over `src/grammar/list.ts` would manufacture the two-concepts-one-file report that is
meant to mean "this file does two jobs", which is the shape of the 2026-08-07 and 2026-08-14 rulings
on `an-action-pruned-for-a-dangling-reference` and `authored-prose-is-addressed-by-its-owner`. The
`produces` forecast is cleared rather than registered.

**This branch takes the totality half of the silent-acceptance cluster and no other half.** Five open
records share the surface symptom "the loader accepts what it does not understand", and reading them
together they are three different invariants with three different enforcement points, not one:

1. *A parse consumes its input or refuses it* — `dsl-load-path-2026-07-30-h1`, and
   `dsl-load-path-2026-07-30-pass2-m2` which was declined as its fourth reproduction. This spec.
2. *An id is declared once* — `dsl-load-path-2026-07-28-h1` (a second `# location guide-house`
   replaces the first wholesale via `Map.set`; two `# test t` and the first regression is silently
   deleted) and `dsl-load-path-2026-07-28-m5` (`starting` has no cardinality check). Its enforcement
   point is `declareIds`, which the author already ruled on 2026-08-07 for the neighbouring cross-kind
   case, owned by `refuse-two-objects-of-different-kinds-sharing-an-id-while-ei`. Not folded in here:
   a different file, a different derivation, and a live ruling this spec would be absorbing rather
   than implementing. It is the recommended next spec and is the one that should carry the same-kind
   duplicate too, since one function holds both halves and two branches editing it is the collision
   `tasks plan` exists to report.
3. *Every name an author writes is one the engine knows* — `item-slot-unvalidated` and the 2026-08-14
   buffs ruling on unvalidated engine keywords (`food`, `continuous`, `instant`, `stacks`). Not
   specced at all yet, because it is not implementation work: the finding's own evidence says it
   "needs a declaration site, or a rule that a supplied name no demand ever references is suspect",
   and that is a design question for a planning session, not a clause.

Splitting them this way is the sizing rule applied, not a scope dodge: each of the three derives its
subjects from a different surface, and a spec that carried all three would be graded by enumeration
because no single walk covers a parser, a namespace and a vocabulary at once.

**The derivation predicate is `parseBlock`, decided by measurement rather than by name.** The obvious
reading — walk `isListField` — was tried first and returns false for `location.adjacent`, which is
where the finding's headline reproduction lives. A derivation aimed by the wrong predicate is an
enumeration that looks universal, which `a-clause-that-enumerates-instances-is-graded-on-the-enumerat`
records as this repository's most-repeated grading failure. c2 names the predicate for that reason.

**Ordered before `starting-zone`.** Every one of these defects is silent at load and surfaces as
misbehaving content hours later, so the cost of each scales with how much content exists and how far
authoring sits from reading. A zone is the first work that makes both large. `starting-zone` gains a
`requires` edge on this spec.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-16

- base: `cb74060058051c3d6fbd4249cfa72bbbe6d3ef25`
- head: `47760fd9c15b44506afbb1ab56c3d5a58af8efd1`
- proof 1: met — Aimed mutation of the one line this branch changed, src/grammar/list.ts:24
  `parseWhole(line, raw.text, raw.span.start, 'a list item')` reverted to the pre-branch
  `parseInline(new Cursor(raw.text, 0, raw.span.start))`: KILLED five times, each by a named test
  re-run at its own file with the mutant still applied. list.test.ts "refuses what the element
  parser left behind, naming it", "points the refusal at the leftover, in the whole source rather
  than the line", "refuses on the line that carries the leftover, not on the first one"; and
  parse.test.ts "refuses the leftover the loader used to drop, on each field the finding measured",
  "refuses a while one letter off rather than dropping the condition it gates". The accept half is
  watched too: appending ' leftover' to every block line KILLED "reads a line the element parser
  consumes whole", so the clause is not held by a test that only ever demands a throw. Manifest at
  C:\Users\yonat\AppData\Local\Temp\audit-nothing-authored-is-silently-dropped-pass1-mutations-aimed.json
  (9 killed, 2 survived, both survivors c2's, below). Live check outside the suite: piping
  a location whose `adjacent:` block line reads `beach whille unlocked` into npm run probe prints
  `stdin:3:9 parse: unexpected content after a list item: "whille unlocked"`. The fourth measured
  case, an `on success:` block line reading `xp: brawling 2.5`, already refused before this branch
  (requireEnd sits at actionResult.ts:313 in cb74060 too), so that expectation records an outcome
  rather than a change.
- proof 2: met — The walk is a derivation and mutation proves it: narrowing
  `Object.entries(SCHEMAS as unknown as Record<string, WalkableSchema>)` in src/content/parse.test.ts
  to a single schema KILLED "derives its subjects by the predicate the section engine decides a block
  by", so the subjects come from SCHEMAS and not from a written list. Counts re-measured at HEAD with
  npm run inspect: 15 schemas, 76 fields, 26 of them carrying `parseBlock` — the clause's numbers.
  The predicate half is met in the code (`takesABlock = 'parseBlock' in field.parser`) and pinned to
  the engine by `expect(declaresBlock).toEqual(engineReadsBlock)`. But the clause's stated reason for
  that predicate is false at HEAD and nothing can tell the two predicates apart: measured
  `isListField(locationSchema, 'adjacent')` is true, and over all 76 schema fields `'parseBlock' in
  parser` and `'element' in parser` agree exactly by field name. Two mutations confirm it — swapping
  the test's predicate to `'element' in field.parser`, and swapping the engine's own gate at
  section.ts:100 to `'element' in parser` — each SURVIVED the whole 3264-test suite. Graded met on the
  operative requirement; the false premise is filed as a finding rather than graded here.
- proof 3: unmet — The walk proves agreement for the ten single-line texts it enumerates and passes, but the
  clause is universal and a counterexample sits one indentation level below where it looked. A
  block-form list item's own indented children are never read: src/grammar/list.ts:24 maps over
  `lines` and never touches `raw.children`. Measured with npm run probe: a location whose `adjacent:`
  block holds `beach` with `cove reef nonsense` indented under it loads clean, and the parsed
  location shows `adjacent: [{ target: "beach" }]` — `cove reef nonsense` is gone with no word said.
  A `flags:` block holding `alert` with `typo here` under it, and an `entities:` block holding `miki`
  with `oven` under it, behave the same. The inline twin of that text, `adjacent: beach` with the same
  indented line under it, is refused: `location field adjacent is written inline and as a block; give
  it one`. Accepted as a block, refused inline, on a block-capable field: the disagreement c3 forbids,
  and the third outcome the Deliverable says does not exist. It costs nothing to close — a mutation
  adding `if (raw.children.length > 0) throw ...` to parseBlock SURVIVED the whole 3264-test suite, so
  no shipped content, fixture or test writes such a line and no over-strictness is risked. Manifest at
  C:\Users\yonat\AppData\Local\Temp\audit-nothing-authored-is-silently-dropped-pass1-mutations-children.json.
  Filed as the HIGH finding below; the repair belongs to this clause rather than to a new spec.
- proof 4: met — `git diff --stat HEAD -- content/` is empty and `git diff --stat cb74060..47760fd -- content/`
  is empty: no content line needed repair and none was made, which is the forecast the clause
  recorded. `npx vitest run src/runtime/integration.test.ts` passes 28 of 28 over the shipped content,
  and merge-ready's bytes leg passes, so every `# test` and `# save` fixture stays byte-identical.
  Nothing in the diff weakens the check to keep a content line loading: the only source change is the
  added end-of-line demand, which moves in the strict direction.
- proof 5: met — `grep -rn "requireEnd" src/grammar --include=*.ts --exclude=*.test.ts` names exactly the
  pre-branch sites: parser.ts:56 (the definition) and :66 (inside parseWhole), action.ts:188 'an
  action field', actionResult.ts:187 'one of:' and :313 'a result'. The diff adds no `requireEnd` call
  and no new message — list.ts reaches the one check through `parseWhole`, and the refusal an author
  reads, `unexpected content after a list item: "..."`, is parser.ts:60's single template with a new
  `what` string. No third copy of the section field engine appears in the range.
- proof 6: met — `npm run tasks -- merge-ready` is green on every behavioural leg: tsc ok, npm test ok
  (3264 tests), layer-check ok, audit-status ok, doctor ok (25 pre-existing warnings, none from this
  range), bytes ok, tree ok with nothing uncommitted, base ok with main not moved past the merge
  base, and spec ok with every declared member closed. The one failing leg is `clauses` — "has no
  recorded audit pass" — which is this pass; it stays red while c3 is unmet.
