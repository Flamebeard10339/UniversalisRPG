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
- [c2] **The proof derives its subjects from the schemas, and by the predicate the engine decides on.**
  The test walks `SCHEMAS` (`src/content/module.ts:32`) and takes every field whose parser exposes
  `parseBlock`, rather than a hand-written list of field names. `parseBlock` is the predicate because
  `src/grammar/section.ts:100` is the line that decides whether a block is legal, and a walk grading
  the engine by a predicate the engine does not use is grading something else — so the walk asserts
  the two sets are equal rather than restating the choice in prose. Measured at HEAD on 2026-08-16: 15
  schemas declare 76 fields, 26 of them block-capable; shipped content exercises 11 lines of them.
  `isListField` is not that line: it gates `+`/`-`, and it answers *true* for `location.adjacent` — an
  earlier measurement here said false, which pass 1 disproved. The two predicates are
  indistinguishable at HEAD, so nothing in the suite would notice the substitution; what stops the
  drift is the equality against the engine's gate, not the name in this sentence. The walk covers the
  bare, `+` and `-` forms of each field, because a patch is where a mod's typo arrives and the
  contribution system is what makes that reachable.
  proof: vitest src/content/parse.test.ts
- [c3] **Inline and block agree field by field, and no line of any kind keeps a block nobody read.**
  Two halves of one property. For every block-capable field, one authored text is accepted by both
  forms or refused by both — the property the finding states, derived over the schemas the way c2's
  is. And for every line of every section kind the loader can parse, an indented block put under a
  line whose reader never asked for one is refused rather than discarded: passes 1 and 2 each found
  that outcome surviving one level below where the previous proof looked, in five separate readers,
  so this half derives its subjects from the shipped corpus — every childless line of every section
  — rather than from a list of fields. Its subject set is held against `SECTION_KINDS`, so a kind
  the corpus stops covering fails rather than going unprobed.
  proof: vitest src/content/parse.test.ts src/content/blocks.test.ts
- [c4] **Shipped content is unchanged, and a line the new refusal rejects is repaired here and named.**
  Measured at HEAD on 2026-08-15: every block-form line under a block-capable field in `content/`
  parses and leaves nothing behind, so this branch forecasts no content edit and every `# test` and
  `# save` fixture stays byte-identical. If the check finds one anyway, that line is a defect the
  loader was hiding: it is fixed in this diff and explained in the commit body. Weakening the check to
  keep a content line loading is the one repair this clause forbids.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat HEAD -- content/
- [c5] **One refusal, reused — and one for the block half.** `requireEnd` (`src/grammar/parser.ts:56`)
  is the end-of-text check and this branch adds no second one and no second message. The block half
  is `requireNoBlock`, which is not new either: it is `readResultLine`'s own throw hoisted into
  `structure.ts` beside the `RawLine` it is about, with its message unchanged, and every demand made
  of a block goes through it. The branch ends with strictly fewer copies of that refusal than it
  started with. `dsl-load-path-2026-07-28-m2` already records `action.ts` holding a second, laxer
  copy of the section field engine; a third copy is that finding reproduced, not a fix delivered.
  proof: command grep -rn "requireEnd\|requireNoBlock\|takes no indented block" src/grammar src/content --include=*.ts --exclude=*.test.ts
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

**The block demand is made where a section's value is assembled, not by each reader.** Passes 1 and 2
found the same silence three times, one level apart each time, in five readers that consume
`line.text` and never look at `line.children` — `parseSection`'s keyword, clause and bare branches,
`parseActionLine`, `dialogue`'s node and choice loops, and `saveSection`. Teaching a sixth reader to
refuse is what the first two attempts did. Instead `children` is behind an accessor that records the
read, `hasBlock` answers "is there one" without recording it, and `requireBlocksRead` asks, after a
section parser has run, for any line whose block nobody took. A reader that ignores a block cannot
answer for it and never could; the record is now kept by the act of reading rather than by each
reader remembering to keep it, which is the only version of this a reader written next month cannot
forget.

The demand is attached to every entry of `PARSERS` rather than written into `parseModule`'s body, so
a kind added to `BESPOKE` inherits it — `dialogue` and `save` are two of the five that did not have
it. `parseSection` on its own does not carry it, and that is the boundary rather than an oversight: a
section parser is what receives a `RawSection`, `PARSERS` is the table of them, and no route content
takes reaches one except through that table.

**c3's agreement is asserted in one direction at the section level and in both at the parser level.**
The walk compares a field's parser directly — `parseWhole(parser, text)` against
`parser.parseBlock([one line])` — and demands they be identical, which is the invariant with no
section grammar in the way. Through `parseAnySection`, where `+` and `-` live, it demands only that a
block never read what the same section refuses inline. The other direction survives and is
characterised rather than excused: a section declaring a clause field gives an unclaimed word a home,
so `on hit: drain: 5 health b` on a `# item` reads `b` as a tag where the block form refuses it, and
the walk fails if that ever happens on a section without clauses. Nothing is dropped there — a word
no demand references is read as a tag — so it belongs to the third invariant above, the one about
vocabulary, and it is filed as its own finding rather than closed here.

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

**The derivation predicate is `parseBlock`, because that is the line the engine decides on.**
`src/grammar/section.ts:100` gates a block on `'parseBlock' in parser`, so a walk that picks its
subjects any other way is grading a set the engine does not use. The obvious alternative,
`isListField`, gates `+`/`-` rather than blocks. This spec first justified the choice by claiming
`isListField` answers false for `location.adjacent`; pass 1 measured it true, and measured the two
predicates agreeing on all 76 fields, so no test can tell them apart. The decision stands and its
reason is now the engine's gate rather than that measurement — and the walk asserts equality against
that gate, so the predicate is held by something executable instead of by this paragraph. A
derivation aimed by the wrong predicate is an enumeration that looks universal, which
`a-clause-that-enumerates-instances-is-graded-on-the-enumerat` records as this repository's
most-repeated grading failure.

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

### Pass 2 — 2026-08-16

- base: `cb74060058051c3d6fbd4249cfa72bbbe6d3ef25`
- head: `fc839d432159b2561f6d9dccc33e607fd0e2d155`
- proof 1: met — Five aimed mutations of the one line this branch changed, src/grammar/list.ts:26
`const items = parseWhole(line, raw.text, raw.span.start, 'a list item');`. Reverted to the
pre-branch `parseInline(new Cursor(raw.text, 0, raw.span.start))` it KILLED four times, each by a
named test re-run at its own file with the mutant still applied: list.test.ts "refuses what the
element parser left behind, naming it" and "points the refusal at the leftover, in the whole source
rather than the line"; parse.test.ts "refuses the leftover the loader used to drop, on each field
the finding measured" and "refuses a while one letter off rather than dropping the condition it
gates". The accept half is watched too — appending ' leftover' to every block line KILLED
list.test.ts "reads a line the element parser consumes whole" — so the clause is not held by a test
that can only ever demand a throw. Over-strictness checked in the other direction: the demand is
requireEnd, which eats trailing whitespace, and splitSections already trims each line, so the only
text it newly refuses is text the inline form was already refusing. No content line, fixture or test
writes one. Manifest at
C:\Users\yonat\AppData\Local\Temp\mutations-nothing-authored-is-silently-dropped-pass2.json
(11 killed, 3 survived, 2 errored).
- proof 2: met — The derivation covers a subject nobody wrote a test for, measured rather than argued: a
new block-capable field injected into locationSchema — a hand-rolled ListParser whose parseBlock
drops both the leftover and the children, named by no test anywhere — was caught twice, KILLED at
parse.test.ts "refuses a block line carrying an indented block of its own, on every field a block
can address" and at "reads a block line and the same text handed to the whole parser identically".
The predicate half is pinned to the engine and not to prose: widening the engine's own gate at
src/grammar/section.ts:108 from `'parseBlock' in parser` to `'parse' in parser` KILLED "derives its
subjects by the predicate the section engine decides a block by", so the
expect(declaresBlock).toEqual(engineReadsBlock) is load-bearing. Manifest at
C:\Users\yonat\AppData\Local\Temp\audit-nothing-authored-is-silently-dropped-pass2-mutations-derivation.json.
What is not held is the walk's own subject set — narrowing `Object.keys(SCHEMAS)` to `['location']`,
and dropping one kind from it, each SURVIVED the whole 3266-test suite — and that is filed as a
finding rather than graded here, because the clause's operative promise is that the engine's
subjects reach the walk, which the injected field proves.
- proof 3: unmet — 26 fields are block-capable at HEAD; the nested-block walk probes 24. The two it never
probes in any shape, `item.tags` and `passive.tags`, are exactly where the property still fails.
Measured with npm run probe: `# item rock` / `title: Rock` / `weapon` / an indented `utter nonsense
here` loads clean and the parsed item carries tags [{ kind: keyword, value: weapon }] — the indented
line is gone with no word said; `# passive tough` / `foo` / an indented line behaves the same. Both
are block-capable fields, so this is the clause's own universal failing, not a neighbouring one. The
walk cannot reach them because its only probe shape is `<keyword>:` followed by an indented block,
and a positional field's `tags:` label is refused before any block is read ("item field tags must be
written bare"), so AUTHORED.find(...) returns undefined and the field is skipped. The
`!field.positional` filter on that test is therefore inert — removing it changed no verdict
(mutation UNSTABLE; the named test did not fail) — which is why nothing reported the gap.
The seam is the diagnosis: list.parseBlock is one reader among several, and the drop is decided a
level above it, in parseSection's line loop (src/grammar/section.ts:165-229), which reads
`line.text` through a Cursor and never asks whether anything claimed `line.children`. Three of its
four branches drop a block today — the clauses branch (above), the keyword branch (`# location bay`
/ `starting` / an indented line), and the bare branch (`north of cove` / an indented line) — and
parseActionLine (src/grammar/action.ts:185-189) is a second loop of the same shape. One
requireNoBlock at the end of each loop, where the value is assembled rather than where it is
written, retires the clauses route this clause owns and the others with it, and derives its own
subjects the way c2's walk does. The two routes outside this clause's wording are filed as a
finding.
- proof 4: met — `git diff --stat HEAD -- content/` is empty and `git diff --stat cb74060..fc839d4 --
content/` is empty: no content line needed repair and none was made, which is the forecast the
clause recorded. merge-ready's npm test leg passes 3266 tests including
src/runtime/integration.test.ts over the shipped corpus, and its bytes leg passes, so every
`# test` and `# save` fixture stays byte-identical. That the shipped corpus really flows through
both new refusals is measured, not assumed: appending ' leftover' to every block-form list line, and
making requireNoBlock's early return never fire, each made content/ refuse at load — the run
printed the DslError raised through src/grammar/list.ts:26 and through
src/grammar/actionResult.ts:316 respectively. Nothing in the diff weakens a check to keep a content
line loading; both source changes move in the strict direction.
- proof 5: met — `grep -rn "requireEnd" src/grammar --include=*.ts --exclude=*.test.ts` names exactly the
pre-branch sites and no others: parser.ts:56 (the definition), :66 (inside parseWhole),
action.ts:188 'an action field', actionResult.ts:187 'one of:', :313 'a result'. list.ts reaches the
one check through parseWhole and adds no call and no message of its own. The one function the
branch adds, requireNoBlock (src/grammar/structure.ts:22), is a hoist rather than a copy: its
message `"..." takes no indented block` is verbatim the throw that stood at actionResult.ts:315
before this branch, actionResult.ts:316 now calls it, and the old `line.children.length > 0 &&`
guard it replaced is requireNoBlock's own early return, so the two are behaviourally identical. Two
callers, one message. No third copy of the section field engine appears in the range.
- proof 6: met — `npm run tasks -- merge-ready` at fc839d4: tsc ok, npm test ok (3266 tests),
layer-check ok, audit-status ok, doctor ok (25 pre-existing warnings, none from this range), bytes
ok, tree ok with nothing uncommitted. All six legs the clause names pass. Two legs it does not name
fail: `clauses`, which is c3 and is this pass; and `base` — "main has moved past the merge base", so
`git merge main` is required before this branch can merge and the behaviour of that merge is
unmeasured at the head this pass graded.
