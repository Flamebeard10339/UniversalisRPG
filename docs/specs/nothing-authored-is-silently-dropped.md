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

The demand is attached where each section parser is **defined**, through `sectionParser`, rather than
where the kinds are tabulated. Attaching it to the `PARSERS` table was the first attempt and pass 3
measured what it left open: `scripts/migrate-saves.ts` imports `parseSaveSection` and reaches past
the table, so a `# save` fixture's indented block was dropped there while `parseModule` refused the
same text. A claim that no route reaches a parser except through the table is a claim nothing derives
and it was already false. Wrapped at the definition there is no unwrapped export to reach, and the
fifteen schema kinds are covered by one wrapper inside `parseSection`.

**That each parser carries the demand is derived, not remembered.** Wrapping at the definition site
closed the reach-past route and opened a forget-to-wrap one: pass 4 removed four of the eight wraps
with the whole suite green, and built a new kind that walked through the corpus walk's own
`refusesABody` excuse — parser unwrapped, block dropped, six of six tests green. A probe cannot reach
a kind whose parser forgets, because a probe needs a body that parser accepts and a new kind can be
excused for having none. So `sectionParser` records what it wraps and `answersForItsBlocks` is asked
of every kind in `SECTION_KINDS`, which is the parser table itself. The wrapping is still written by
hand; that it happened is not, and the check does not depend on finding a droppable line. Pass 4's
reproduction now fails and names the kind.

**Forgetting is refused, not dropped.** `children` stays an ordinary field and `takeBlock` is the one
act that records a reader consumed a block, so a consumer that forgets to call it has its line
refused rather than its author's words discarded. The first shape of this guard recorded any property
access, which pass 3 measured failing both ways: `JSON.stringify(section)` before the check turned the
guard off for that whole section, and a line whose block genuinely was consumed by a caller holding
its own `RawLine` was refused. Both are gone, and the polarity earned itself immediately — converting
the guard surfaced two consumers this branch had not yet wired, `dialogue`'s two loops and `one of:`'s
rows, as failing tests rather than as silent drops.

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

### Pass 3 — 2026-08-16

- base: `75152857faf3c2958ed6c7ca32d7a6335dbdfc9b`
- head: `b602dc6c292ce8efe96848e7b29ff65789e53c15`
- proof 1: met — Two aimed mutations of the one line the branch changed, src/grammar/list.ts:22
  `parseBlock: (lines) => lines.flatMap((raw) => parseWhole(line, raw.text, raw.span.start, 'a list item'))`.
  Reverted to the pre-branch `parseInline(new Cursor(raw.text, 0, raw.span.start))` it KILLED, attributed to 7 named
  tests re-run at their own files with the mutant still applied, among them parse.test.ts "reads a block line and the
  same text handed to the whole parser identically" and "never reads through a section a block that section refuses
  inline, in the bare, + and - forms". The accept half is watched too: appending ' leftover' to every block line
  KILLED with 14 named tests, so the clause is not held by a suite that can only ever demand a throw. Manifest at
  C:\Users\yonat\AppData\Local\Temp\mutations-nothing-authored-is-silently-dropped-pass3.json (9 killed, 0 survived,
  0 unstable, 0 errored). Live outside the suite: piping a location whose `adjacent:` block line reads
  `beach whille unlocked` into npm run probe prints `unexpected content after a list item: "whille unlocked"`, and
  the three cases the finding measured (entities/miki oven, flags/alert typo, on success/xp: brawling 2.5) each
  refuse in parse.test.ts "refuses the leftover the loader used to drop, on each field the finding measured".
- proof 2: met — Both halves mutation-held, and the half pass 2 measured missing is now closed. The predicate half: widening
  the engine's own gate at src/grammar/section.ts:108 from `'parseBlock' in parser` to `'parse' in parser` KILLED
  parse.test.ts "derives its subjects by the predicate the section engine decides a block by", so
  expect(declaresBlock).toEqual(engineReadsBlock) is load-bearing against the line the engine actually decides on.
  The subject-set half: narrowing the walk's own source, `Object.keys(SCHEMAS)` in schemaFields at
  src/content/parse.test.ts:739, to `['location']` KILLED "walks every field of every kind the loader parses through
  a schema" — the same narrowing pass 2 measured SURVIVING the whole suite. What closed it is parse.test.ts:307,
  which reaches the fields a second time through SECTION_KINDS (22 kinds, 15 schema-backed) and demands the two
  routes agree, so the walk can no longer shrink in silence. Re-run: the two entries named
  "c2 the walk is graded by the predicate the engine decides a block by" and
  "c2 the walk's subject set cannot shrink in silence" in the pass 3 manifest.
- proof 3: met — The seam is structural rather than enumerated, and every line of it is mutation-held. PARSERS is built by
  mapping readingWholeSections over the merged SCHEMAS-derived and BESPOKE tables (src/content/module.ts:80), so a
  kind added to either inherits the demand and there is no list of kinds anyone must keep in sync; requireBlocksRead
  (src/grammar/structure.ts:66) recurses the whole tree, and `children` is an accessor that records the read while
  hasBlock answers without recording it, so a reader that ignores a block cannot answer for it. Five aimed mutations,
  all KILLED, each attributed to a named test re-run at its own file: removing `requireBlocksRead(section.body)` from
  the wrapper, and removing the READ test inside requireBlocksRead, each killed blocks.test.ts "is refused, never
  discarded, on every line the corpus writes" plus two more; reverting claimsTheBlock's `hasBlock(line)` to
  `line.children.length > 0` killed blocks.test.ts "is refused on a line whose block one reader looked at and no
  reader took", which is what proves asking is not taking; removing the recursion into blockOf(line) killed
  parse.test.ts "refuses a block line carrying an indented block of its own, on every field a block can address",
  which is pass 1's depth; and the accept half, removing `line[READ] = true`, KILLED with 10 named tests, so the
  refusal is not vacuous. Both prior reproductions now refuse, measured live with npm run probe: a location whose
  `adjacent:` block holds `beach` with `cove reef nonsense` indented under it gives `"beach" takes no indented
  block`, and a `# item rock` writing `weapon` with an indented line under it gives `"weapon" takes no indented
  block` — pass 1's and pass 2's HIGHs respectively. I hunted the third neighbour rather than confirming the second:
  18 further authored shapes across all four branches of parseSection, parseActionLine, both dialogue loops (node,
  choice, goto, when, sticky, say), parseTest, parseLocaleSection, parseSaveSection, parseRemoval, parseDropTable,
  the + and - forms of the contribution system, `one of:` rows, `dependencies:`, and an action body two levels deep
  — every one refuses, and the over-strictness direction was checked with 13 legitimate shapes, all of which still
  parse. Inside the loader I could not find a fourth. Outside it I did: scripts/migrate-saves.ts:146 reaches
  parseSaveSection directly, where a `# save` line with an indented block is accepted and the block dropped, while
  parseModule refuses the same text — filed as a finding, since the loader is what this clause is about and no route
  content takes reaches it.
- proof 4: met — `git diff --stat HEAD -- content/` is empty and `git diff --stat 75152857..b602dc6 -- content/` is empty:
  no content line needed repair and none was made, which is the forecast the clause recorded. merge-ready's npm test
  leg passes including src/runtime/integration.test.ts over the shipped corpus, and its bytes leg passes, so every
  `# test` and `# save` fixture stays byte-identical. That the corpus really flows through the new demand is measured
  rather than assumed: removing `requireBlocksRead(section.body)` from the PARSERS wrapper KILLED blocks.test.ts
  "is refused, never discarded, on every line the corpus writes", which walks every childless line of every shipped
  section. The one lax move in the diff is the deleted `title takes no indented block` check in
  src/content/action.ts:54, and it is not a weakening: probing an `# action` with an indented block under its
  `title:` line still refuses, now through the derived demand. No check was weakened to keep a content line loading.
- proof 5: met — `grep -rn "requireEnd\|requireNoBlock\|takes no indented block" src/grammar src/content --include=*.ts
  --exclude=*.test.ts` names exactly the pre-branch requireEnd sites and no others: parser.ts:56 (the definition),
  :66 (inside parseWhole), action.ts:188 'an action field', actionResult.ts:187 'one of:', :313 'a result'. list.ts
  reaches the one check through parseWhole and adds no call and no message of its own. requireNoBlock has one
  definition (structure.ts:57) carrying one message (structure.ts:59), verbatim the throw that stood at
  actionResult.ts:315 before this branch, and two callers: actionResult.ts:316 and requireBlocksRead itself. The
  branch ends with strictly fewer copies than it started with — src/content/action.ts:54's third copy, which read
  `# action <id>: title takes no indented block`, is deleted in this range and its behaviour is now the one message.
  No third copy of the section field engine appears in the range.
- proof 6: met — `npm run tasks -- merge-ready` at b602dc6, 1m18s wall clock: tsc ok, npm test ok, layer-check ok,
  audit-status ok, doctor ok (23 pre-existing warnings, none from this range), bytes ok, tree ok with nothing
  uncommitted, base ok — main has not moved past the merge base, which pass 2 recorded failing and the merge at
  8c01995 repaired — and spec ok with every declared member closed. Every leg the clause names passes. The one
  failing leg is `clauses`, "1 outstanding across 2 pass(es): c3", which is passes 1 and 2 and is what this pass
  answers.

### Pass 4 — 2026-08-16

- base: `75152857faf3c2958ed6c7ca32d7a6335dbdfc9b`
- head: `99019012bfc06c7c13770119b4fbfb63bff33e61`
- proof 1: met — Re-graded against the current seam, not pass 3's. Five aimed mutations of the one
line the branch changed, src/grammar/list.ts:24
`parseBlock: (lines) => lines.flatMap((raw) => parseWhole(line, raw.text, raw.span.start, 'a list item'))`.
Reverted to the pre-branch `parseInline(new Cursor(raw.text, 0, raw.span.start))` it KILLED four
times, each attributed to a named test re-run at its own file with the mutant still applied:
list.test.ts "refuses what the element parser left behind, naming it" and "points the refusal at the
leftover, in the whole source rather than the line"; parse.test.ts "refuses the leftover the loader
used to drop, on each field the finding measured" and "refuses a while one letter off rather than
dropping the condition it gates". The accept half is watched: appending ' leftover' to every block
line KILLED list.test.ts "reads a line the element parser consumes whole", so the clause is not held
by a suite that can only demand a throw. All four measured cases are asserted through parseModule at
parse.test.ts, including the `on success:` / `xp: brawling 2.5` one and the
`adjacent: beach whille unlocked` that motivated the branch. Manifest at
C:\Users\yonat\AppData\Local\Temp\mutations-nothing-authored-is-silently-dropped-pass4.json
(18 killed, 0 survived, 0 unstable, 0 errored).
- proof 2: met — Both halves re-measured at this head. Predicate half: widening the engine's own gate at
src/grammar/section.ts:108 from `'parseBlock' in parser` to `'parse' in parser` KILLED parse.test.ts
"derives its subjects by the predicate the section engine decides a block by", so
`expect(declaresBlock).toEqual(engineReadsBlock)` is load-bearing against the line the engine decides
on. Subject-set half: narrowing schemaFields' own source, `Object.keys(SCHEMAS)` at
src/content/parse.test.ts, to `['location']` KILLED "walks every field of every kind the loader
parses through a schema", which reaches the same fields a second time through SECTION_KINDS. New at
this head and an improvement the clause did not promise: the walk no longer re-implements the
engine's positional-field rule — `isPositionalField` is exported from src/grammar/section.ts:73 and
asked by both the line reader and the walk, so the duplicate pass 1 filed as a LOW is gone. Counts
re-measured: 15 schemas, 76 fields, 26 block-capable, unchanged.
- proof 3: met — The seam pass 3 graded has been replaced, so this is a fresh grade on fresh code, and
every line of the new one is mutation-held. `children` is an ordinary field again and `takeBlock`
(src/grammar/structure.ts:32) is the one act that records consumption, so the polarity is fail-closed:
`grep -rn "\.children" src scripts --include=*.ts` outside tests names only structure.ts itself, so no
reader can consume a block without recording it. Six aimed mutations, all KILLED, each attributed to
a named test re-run at its own file: removing `requireBlocksRead(section.body)` from `sectionParser`,
and inverting `if (!TAKEN.has(line))` to `if (TAKEN.has(line))`, each killed blocks.test.ts "is
refused, never discarded, on every line the corpus writes"; removing the recursion into
`line.children` killed parse.test.ts "refuses a block line carrying an indented block of its own, on
every field a block can address"; replacing `hasBlock(line)` with `takeBlock(line).length > 0` in
claimsTheBlock killed blocks.test.ts "is refused on a line whose block one reader looked at and no
reader took", which is what proves asking is not taking now that hasBlock and a raw children read are
the same expression (pass 3's mutation of that line no longer distinguishes anything and its evidence
does not carry over); replacing `sectionParser((read) => readSection(read, schema))(section)` with a
direct `readSection` call killed the corpus sweep; and unwrapping `parseSaveSection` at its own
definition killed blocks.test.ts "is refused by a section parser called directly, not only through
the module table", which is pass 3's migrate-saves route. The accept half is watched: removing
`TAKEN.add(line)` KILLED, attributed after escalation to blocks.test.ts "probes every kind the loader
can parse" — the corpus stops parsing at all, so the refusal is not vacuous. Subject-set half: the
corpus sweep's own source, `readdirSync('content')`, narrowed to one file KILLED "probes every kind
the loader can parse", so the sweep cannot shrink in silence either. I hunted the fourth neighbour
rather than confirming the third, on the five routes the brief named. (a) Readers that take and
discard: none — every one of the six `takeBlock` call sites consumes what it returns. (b) Section
parsers reachable without `sectionParser`: none unwrapped at this head, all 22 kinds of PARSERS
covered by 7 bespoke wraps plus `parseSection`'s. (c) `RawSection`s built by hand: none outside
tests. (d) Routes into a parse that skip splitSections: `src/content/localChanges.ts:37` and
`scripts/migrate-saves.ts:144` are the only non-test callers; localChanges slices source text back
out and never reads a value, migrate-saves parses through the now-wrapped parseSaveSection. (e)
Shapes nobody probed: three derived sweeps of my own, all clean — 798 sibling-line intrusions across
the shipped corpus (a line inserted at a line's own indent, which asks the text half of the same
question) dropped nothing; every field of every schema in every form including the positional ones,
plus every schema keyword, given an indented intruder, dropped nothing; and 31 hand-shaped deep
probes across the bespoke kinds (dialogue's node/choice/when/again/once/sticky/goto/say/effect loops
at two depths, `one of:` rows, chance bodies, entity entry labels, `- label:` removals, `+adjacent:`,
`# info` dependencies, `# test`, `# save`, `# locale`, `# remove`, and `requires:`/`time:` on an
action body) every one refuses, with 8 legitimate shapes still parsing. Over-strictness checked in
that direction as well as this one: the suite is 3318 green and the shipped corpus is byte-identical,
and the only newly-refused shapes I could construct are ones whose text was previously discarded
(`requires:` over a block, `- eat:` over a block). Where the seam is not held is durability rather
than behaviour, and it is filed as a finding rather than graded here: nothing derives that a section
parser carries the wrapper.
- proof 4: met — `git diff --stat HEAD -- content/` is empty and
`git diff --stat 75152857..99019012 -- content/` is empty: no content line needed repair and none was
made, which is the forecast the clause recorded. merge-ready's npm test leg passes 3318 tests
including src/runtime/integration.test.ts over the shipped corpus, and its bytes leg passes, so every
`# test` and `# save` fixture stays byte-identical. That the corpus really flows through the new
demand is measured rather than assumed: removing `requireBlocksRead(section.body)` KILLED
blocks.test.ts "is refused, never discarded, on every line the corpus writes", which walks 755
childless lines across 169 shipped sections in 21 of the 22 kinds — measured at this head, with 0
sections skipped for failing to parse standalone, so the sweep's floor of 100 is far below what it
actually grades. Aiming the same mutation at integration.test.ts instead escalated to the whole suite
and was killed by blocks.test.ts, so integration.test.ts does not itself hold the demand; the
corpus-flow evidence is the blocks.test.ts kill, and integration is the "still loads" half. Nothing
in the diff weakens a check to keep a content line loading — the one deletion,
src/content/action.ts:54's `title takes no indented block`, is a third copy retired in favour of the
one message, and an `# action` with a block under its `title:` line still refuses.
- proof 5: met — The clause's own grep, run over src/grammar and src/content with the include=*.ts and
exclude=*.test.ts filters it names, at 99019012 names exactly the pre-branch requireEnd sites and no
others: parser.ts:56 (the definition), :66 (inside parseWhole), action.ts:188 'an action field',
actionResult.ts:187 'one of:', :313 'a result'. list.ts reaches the one check through parseWhole and
adds no call and no message. requireNoBlock has one definition (structure.ts:41) carrying one message
(structure.ts:43) and two callers, actionResult.ts:316 and requireBlocksRead at structure.ts:50 —
which is now every demand made of a block in the tree, because no reader outside structure.ts touches
`children` at all. The branch ends with strictly fewer copies than it started with:
src/content/action.ts:54's third copy is deleted in this range. That the one message is the one that
fires is measured: deleting the throw at structure.ts:43 KILLED blocks.test.ts "is refused, never
discarded, on every line the corpus writes". No third copy of the section field engine appears in the
range.
- proof 6: met — `npm run tasks -- merge-ready` at 99019012, 1m11s wall clock: tsc ok, npm test ok (3318
tests), layer-check ok, audit-status ok, doctor ok (23 pre-existing warnings, none from this range),
bytes ok. All six legs the clause names pass, in one invocation. Two legs it does not name: tree ok
with nothing uncommitted, spec ok with every declared member closed, clauses ok — and `base` FAILS,
"main has moved past the merge base", which is the condition pass 2 recorded and the merge at 8c01995
repaired, now recurred. `git log HEAD..main` is 20 commits and
`git diff $(git merge-base HEAD main)..main --stat` touches src/content/localChanges.ts (+87), which
is a DSL-load-path file this branch does not touch. I read main's version: it still reaches a parse
only through splitSections-for-text-slicing and parseModuleSource, so it opens no unwrapped route —
but `git merge main` is required before this branch can merge and the behaviour of that merge is
unmeasured at the head this pass graded, so every verdict above is a verdict on 99019012 and not on
what will land.

### Pass 5 — 2026-08-16

- base: `11e1260f5b25739c693e0f0006df1166134693de`
- head: `aa9a1ae60eee6486b92ddc5485c0df5895c3243d`
- proof 1: met — Re-graded at the merge head aa9a1ae, which is what will land: `base` now passes, so this
  is a verdict on the tree that merges rather than on 99019012. Six aimed mutations of the one line
  the branch changed, src/grammar/list.ts:24
  `parseBlock: (lines) => lines.flatMap((raw) => parseWhole(line, raw.text, raw.span.start, 'a list item'))`.
  Reverted to the pre-branch `parseInline(new Cursor(raw.text, 0, raw.span.start))` it KILLED five
  times, each attributed to a named test re-run at its own file with the mutant still applied:
  list.test.ts "refuses what the element parser left behind, naming it", "points the refusal at the
  leftover, in the whole source rather than the line", "refuses on the line that carries the leftover,
  not on the first one"; parse.test.ts "refuses the leftover the loader used to drop, on each field
  the finding measured" (which asserts entities:/miki oven, flags:/alert typo, adjacent:/beach whille
  unlocked and on success:/xp: brawling 2.5 through parseModule) and "refuses a while one letter off
  rather than dropping the condition it gates". The accept half is watched: appending ' leftover' to
  every block line KILLED list.test.ts "reads a line the element parser consumes whole", so the clause
  is not held by a suite that can only demand a throw. Manifest at
  C:\Users\yonat\AppData\Local\Temp\mutations-nothing-authored-is-silently-dropped-pass5.json
  (24 killed, 0 survived, 0 unstable, 1 errored — the errored entry is c4's, retargeted below).
- proof 2: met — Both halves re-measured at this head. Predicate half: widening the engine's own gate at
  src/grammar/section.ts:108 from `'parseBlock' in parser` to `'parse' in parser` KILLED parse.test.ts
  "derives its subjects by the predicate the section engine decides a block by", so
  `expect(declaresBlock).toEqual(engineReadsBlock)` is load-bearing against the line the engine
  decides on. Subject-set half: narrowing schemaFields' own source, `Object.keys(SCHEMAS)` at
  src/content/parse.test.ts:739, to `['location']` KILLED "walks every field of every kind the loader
  parses through a schema", which reaches the same fields a second time through SECTION_KINDS. Counts
  re-measured at this head with npm run inspect: 15 schemas, 76 fields, 26 block-capable — the
  clause's numbers, unchanged by the two merges of main.
- proof 3: met — Fresh grade on the seam as it stands after the two commits pass 4 did not see (d614de5,
  a419bc8) and after main was merged in twice. Half one, field-by-field agreement: the list.ts revert
  KILLED parse.test.ts "reads a block line and the same text handed to the whole parser identically"
  and "never reads through a section a block that section refuses inline, in the bare, + and - forms".
  Half two, no line keeps a block nobody read: eleven aimed mutations, all KILLED, each attributed to
  a named test re-run at its own file — removing `requireBlocksRead(section.body)` from `sectionParser`
  and inverting `if (!TAKEN.has(line))` each killed blocks.test.ts "is refused, never discarded, on
  every line the corpus writes"; removing the `requireBlocksRead(line.children)` recursion killed
  parse.test.ts "refuses a block line carrying an indented block of its own, on every field a block
  can address"; replacing `hasBlock(line)` with `takeBlock(line).length > 0` in claimsTheBlock killed
  "is refused on a line whose block one reader looked at and no reader took"; removing `TAKEN.add(line)`
  killed "probes every kind the loader can parse", so the refusal is not vacuous; unwrapping
  `parseSaveSection` at its definition killed "is refused by a section parser called directly, not only
  through the module table"; and the new derivation this pass is the first to grade — unwrapping
  `parseRemoval` (a kind no probe can reach: `remove` is absent from the corpus and refuses a body
  outright), unwrapping `parseTest`, unwrapping the SCHEMAS map's own `sectionParser` in module.ts, and
  deleting `ANSWERING.add(answering)` each killed blocks.test.ts "is demanded by every kind the loader
  can parse, whoever wrote its parser". Both of that walk's subject sets are held: narrowing
  `readdirSync('content')` killed "probes every kind the loader can parse" and narrowing
  `const checked = [...SECTION_KINDS]` killed the derivation test. Neighbour hunt, on the five routes
  the brief named, all negative except one filed below. (a) takeBlock-and-discard: all six call sites
  consume what they return, and a derived sweep appending an intruder as the last child of every
  shipped line that already has a block (43 probes) dropped nothing. (b) parsers reachable without
  sectionParser: none unwrapped; 22 of 22 kinds registered. (c) hand-built RawSections: none outside
  tests — `grep -rn "children: \[" src scripts` names only splitSections. (d) routes skipping
  splitSections: localChanges.ts (slices source text, reads no value) and migrate-saves.ts:144 (through
  the wrapped parseSaveSection); nothing main brought in adds a third — modportal.ts and
  contribution.ts reach a parse only through parseModuleSource. (e) shapes nobody probed: three derived
  sweeps of my own, all clean — 798 sibling-line intrusions across 169 shipped sections (151 of them
  inside an existing block), 43 extra-last-child intrusions, and 169 extra-body-line intrusions, none
  dropped; plus 21 hand-shaped probes across comments, entry removals, dialogue at three depths,
  droptable rows, info dependencies, locale, test, save, item and passive positional fields — every one
  refuses. Over-strictness checked as hard: seven legitimate deep shapes still parse (every failure was
  at resolve, past the parser), the shipped corpus is byte-identical, `npm run probe --round-trip` over
  all three modules is clean so the serializer's own output survives the new demand, and the suite is
  3350 green. Where the seam is not held is durability rather than behaviour and it is filed as a
  finding, not graded here: `parseSection`'s own wrap is now masked by module.ts's.
- proof 4: met — `git diff --stat HEAD -- content/` is empty and `git diff --stat 11e1260..aa9a1ae --
  content/` is empty: no content line needed repair and none was made, which is the forecast the
  clause recorded. merge-ready's npm test leg passes (3350 tests, including
  src/runtime/integration.test.ts over the shipped corpus) and its bytes leg passes, so every `# test`
  and `# save` fixture stays byte-identical. That the corpus really flows through both new refusals is
  measured rather than assumed, at two seams. Aiming at src/runtime/integration.test.ts ERRORed —
  that file loads content at module scope, so a refusal fails collection and mutate can name no test —
  so it was retargeted at src/ui/shippedContent.test.ts "opens a session out of what it bundled",
  which loads inside its `it`: appending ' leftover' to every block-form list line KILLED it, and
  inverting `requireNoBlock`'s early return to `if (hasBlock(line)) return` KILLED it too. Through the
  loader's own walk, replacing `requireBlocksRead(section.body)` with `requireBlocksRead([])` KILLED
  blocks.test.ts "is refused, never discarded, on every line the corpus writes". Retarget manifest at
  C:\Users\yonat\AppData\Local\Temp\mutations-nothing-authored-is-silently-dropped-pass5-c4-retarget.json.
  Nothing in the diff weakens a check to keep a content line loading; the one deletion,
  src/content/action.ts:54's `title takes no indented block`, is a third copy retired in favour of the
  one message, and an `# action` with a block under its `title:` line still refuses.
- proof 5: met — The clause's own grep, run at aa9a1ae over src/grammar and src/content with the
  include=*.ts and exclude=*.test.ts filters it names, reports exactly the pre-branch requireEnd sites
  and no others: parser.ts:56 (the definition), :66 (inside parseWhole), action.ts:188 'an action
  field', actionResult.ts:187 'one of:', :313 'a result'. list.ts reaches the one check through
  parseWhole and adds no call and no message. requireNoBlock has one definition (structure.ts:41)
  carrying one message (structure.ts:43) and two callers, actionResult.ts:316 and requireBlocksRead at
  structure.ts:50 — which is every demand made of a block in the tree, because
  `grep -rn "\.children" src scripts --include=*.ts` outside tests names only structure.ts itself. The
  branch ends with strictly fewer copies than it started with: src/content/action.ts:54's third copy
  is deleted in this range. That the one message is the one that fires is measured: deleting the throw
  at structure.ts:43 KILLED blocks.test.ts "is refused, never discarded, on every line the corpus
  writes". No third copy of the section field engine appears in the range.
- proof 6: met — `npm run tasks -- merge-ready` at aa9a1ae, 1m09s wall clock, every leg green: tsc ok, npm
  test ok (3350 tests), layer-check ok, audit-status ok, doctor ok (23 pre-existing warnings, none
  from this range), bytes ok. Three legs the clause does not name also pass, and one of them is the
  one pass 4 recorded failing: tree ok with nothing uncommitted, spec ok with every declared member
  closed, clauses ok — and `base` ok, "main has not moved past the merge base", which the merge at
  aa9a1ae repaired. `git rev-parse main` is 11e1260 and `git merge-base HEAD main` is 11e1260, so the
  head graded above is the head that merges.
