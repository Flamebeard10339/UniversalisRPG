# nothing-downstream-rebuilds-what-the-load-path-decided

## Deliverable

Three failure modes have been diagnosed separately in this repository and are one failure. A switch
that re-lists a union's members, a printer that re-states a field's authored spelling, and a runtime
that re-splits an id it was handed whole are all the same act: a reader downstream of the load path
rebuilding an answer the load path already gave. Each rebuild is correct on the day it is written and
wrong the first time the thing it rebuilt gains a member, and nothing between the two moments says so.

The measurement is on the tree today. `ActionResult` (`src/grammar/actionResult.ts:12`) has twenty
members and five independent consumers — the parse cascade (`:258`), `nestedResults` (`:60`),
`partyPhrase` (`:323`), the reference walk (`src/content/referenceSites.ts:111`) and the apply switch
(`src/runtime/effects.ts:230`). One of the five is total: `result` (`src/content/serialize.ts:80`)
returns `string`, so an unhandled member does not compile. `resultLines` (`:145`) returns the same
shape and then defeats it with a `default:` at `:157`; `applyOne` returns `number | undefined`, so a
member it forgets returns `undefined` and does nothing. A tree-wide search for a `never` assertion in
`src/**` returns zero. The compiler is the only duplication detector here that costs nothing to
maintain, and it is switched off on the one family with no other spine.

`serializeRegistryModule` (`src/content/serialize.ts:542`) is the second shape at full size.
`parseModule` (`src/content/module.ts:86`) is derived — it dispatches through `PARSERS`, which is
built from `SCHEMAS`. Its inverse is nineteen hand-written per-kind loops dispatching to per-kind
printers that restate roughly fifty authored spellings as string literals. Nothing holds the two
directions together except `roundTripUniverse` (`:644`) over the shipped corpus, so a field is
protected exactly as far as `content/*.dsl` happens to author it, and a renamed `keyword:` prints a
line the parser then refuses.

The third shape is an id that packs structure and is taken apart again downstream. `parseOwnerRef`
(`src/runtime/actions.ts:79`) recovers an owner's kind and id with `indexOf('.')` and two slices; given
a reference with no dot, `slice(0, -1)` drops the last character and both halves are silently wrong,
and the result is fed to `findActionOwner`, `findActiveAction` and the save pruner. A journey's ends
come back from `objId.split('>')` (`:31`), an actor's template from `actorId.split('#')`
(`src/runtime/state.ts:24`), a choice's directive from a regex over `fight:a:b`
(`src/runtime/session.ts:349`) after the engine built that string *from* the directive at `:236`, and
a module's ownership from `id.startsWith(moduleId + '.')` (`src/content/serialize.ts:341`) where
`registry.namespace.ownerOf` already answers. The dotted address is a good authoring syntax and nothing
here changes it. What changes is that it stops being the carrier once the load path has read it.

The fourth stage shares none of this and is here because the same branch cannot be verified without
it. The suite sets no `test.environment` and depends on neither jsdom nor `@testing-library`, so no
React effect under `src/ui` has ever run: four survive the whole suite at zero failures, two of them
the write half of a clause that took three audit passes to grade. That gap is filed as
`the-suite-runs-no-react-effect-so-every-ui-fix-s-last-inch-i` with no severity and no spec, which is
why it has never been triaged. It is named in `## Decisions` as the part of this spec that is really a
second one.

None of this is allowed to change what loads. Every shipped module parses to the same registry and
prints to the same bytes at the end of this branch as at its start, and c7 is the clause that says so.

Proof:

- [c1] **Every switch over a discriminated union in the shipped tree ends in a `never` assignment.**
  For each union any shipped module switches on, the switch handles every member and its `default`
  assigns the scrutinee to `never`. The proof derives its subjects three ways over — the file set from
  `shippedModules()` (`scripts/lib/layers.ts:83`), the same enumeration `layer-check` sweeps; the union
  set by asking the type checker which switched-on types are discriminated, so a union declared next
  month is a subject with no edit here; and each union's members from the checker rather than from a
  list. Measured at commissioning: 20 such switches, 0 guarded, 4 already missing a member.
  proof: vitest scripts/exhaustive.test.ts
- [c2] **The guard bites.** A synthesised union with one member left unhandled is compiled through the
  type checker and the compile is asserted to fail, naming `never`; the same fixture with every member
  handled is asserted to compile clean. c1 says the shape is present at every consumer and reads
  source text to say it; this says the shape rejects what it must reject, and is the reason c1 cannot
  pass by finding a `never` that does nothing.
  proof: vitest scripts/exhaustive.test.ts
- [c3] **A parser owns everything about what it reads.** `Parser<T>` is a codec: it parses, it prints,
  and it carries the authored spellings it accepts. Nothing outside a parser states how the thing it
  reads is written — no field spelling, no separator, no unit suffix appears as a literal anywhere in
  `src/content/serialize.ts`, whose per-kind printers are replaced by one walk over the collected
  grammar. A parser added next month brings its own writing with it, because there is nowhere else to
  put it.
  proof: vitest src/grammar/codec.test.ts src/content/serialize.test.ts
- [c4] **A parser proves its own round trip, and the collection proves it did.** Each parser's
  examples are parsed and printed back inside that parser's own test, so a round trip cannot be
  satisfied by what some other module happens to author; the collected walk then asserts that every
  parser in the grammar has examples and that each one survives parse-then-print unchanged. The
  subjects are the collection, not a list, so a parser with no examples fails rather than passing
  silently — which is the property the shipped-corpus round trip cannot have, because it protects a
  field exactly as far as `content/*.dsl` happens to use it.
  proof: vitest src/grammar/codec.test.ts src/content/roundTrip.test.ts
- [c5] **An address is taken apart once, where it is read, and is carried as its parts thereafter.**
  No module under `src/runtime` recovers structure from an id by splitting, slicing or matching it:
  an action's owner arrives as `{ kind, id }`, a journey as `{ origin, dest }`, an actor as
  `{ template, copy }`, and a choice carries the `Directive` it was built from rather than a string
  it is parsed back out of. The proof derives its subjects from `shippedModules()` restricted to the
  runtime layer, so the rule covers a file added later, and the packed spellings that remain — the
  authored `<obj>.<objId>.<actionId>` and the wire forms a save records — are reachable only through
  the one function that mints each.
  proof: vitest src/runtime/addresses.test.ts
- [c6] **A packed address cannot be assembled by hand.** Each packed form is a branded type whose
  only constructor is its minter, so a second site that builds one by template literal fails to
  compile. This is c5's rule read from the writing end, and it is what stops the sixth assembly of
  `${ownerRef}.${actionSlug}` being written after this branch closes.
  proof: command npx tsc --noEmit
- [c7] **Nothing that loads today loads differently, and nothing that prints today prints
  differently.** Every module under `content/` parses to a registry deep-equal to the one it parsed to
  at this branch's base, and prints to byte-identical text. The proof reads the base bytes from a
  fixture captured at the merge base rather than regenerating them, so a change that alters both
  directions consistently still fails.
  proof: vitest src/content/roundTrip.test.ts src/runtime/integration.test.ts
- [c8] **The suite runs a React effect.** A DOM environment is configured and at least one test mounts
  a component whose effect writes through the driver and asserts the write happened. The proof derives
  its subjects from the tree: every module under `src/ui` declaring a `useEffect` is either exercised
  by a mounting test or named in a list this test reads and reports, so the untested set is a number
  the suite prints rather than a claim a commit message makes.
  proof: vitest src/ui/effects.test.tsx
- [c9] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make the load path the only place any fact about the language is decided, so that a fact gaining a
member breaks a build instead of drifting past a reader that was written before it existed.

## Stages

Four, in this order. The order is a dependency order and not a convenience: each stage makes the next
one's mistakes visible rather than silent.

1. **Exhaustiveness** — c1, c2. Touches `src/grammar`, `src/content`, `src/runtime`. Adds no
   behaviour. Goes first because stages 2 and 3 both edit switches over these unions, and doing it
   first means an arm dropped during that work fails to compile rather than being found by an audit.
2. **The printer reads the table** — c3, c4, c7. Touches `src/content/serialize.ts` and
   `src/grammar/section.ts`. The largest single diff and the one that retires the most restatements.
   Depends on stage 1 because `result`/`resultLines` are two of the consumers stage 1 makes total.
3. **The address is parsed once** — c5, c6, c7. Touches `src/content` and `src/runtime`. Depends on
   stage 2 only where serialization prints an address; independent of stage 1 in principle, ordered
   after it because `parseOwnerRef`'s callers are switches stage 1 will have touched.
4. **The effect runner** — c8. Touches `vite.config.ts`, `package.json`, `src/ui`. Independent of all
   three. Ordered last because it is the only stage that adds a dependency, and last is where a
   dependency addition is cheapest to back out.

## Decisions

**Why this is one spec, and the condition under which it must become four.** The three reconstruction
shapes are one invariant read at three sites, and `CLAUDE.md` is explicit that one rule applied across
forty files is one task rather than forty. Cutting them apart would give three specs that each prove
the rule holds in their own directory and say nothing about the sentence, which is the failure recorded
as `a-clause-that-enumerates-instances-is-graded-on-the-enumerat` — a clause graded `unmet` in two
passes on different evidence, six consecutive times on `reimplement-localization` c3. The clauses above
are therefore universal and each derives its own subjects; the four stages carry the ordering and not
the grading, and no clause belongs to a stage alone.

That argument holds for the rule and does not settle the size. This spec's writes span four layers and
its stage 2 rewrites a 650-line file; the two specs this diagnosis came from were 600 and 697 lines and
needed three and two-plus audit passes respectively, and the second had to be cut in half mid-flight
because its model was wrong. **If the first worker's context fills before stage 3 opens, this is two
specs and not one** — the seam is between stages 2 and 3, because the printer and the address share no
file. The author is asked to rule on this before dispatch rather than after, since a spec discovered
to be too big during implementation is the more expensive of the two ways to find out.

**Stage 4 is honestly a second spec and is kept here anyway.** c8 shares no invariant with c1–c7: it is
a testing-procedure capability, its system is Testing procedure rather than DSL load path, and its
finding carries `fault: tooling`. It is inside this spec because the alternative is that it stays where
it is now — `severity: null`, `spec: null`, `state: unreviewed`, invisible to every queue in the store
since 2026-08-17. If the author would rather it be graded on its own, lifting c8 out costs nothing and
the remaining eight clauses stand unchanged.

**The compiler is preferred to a test wherever both would work.** c2 and c6 are `tsc` proofs rather
than vitest proofs because an exhaustiveness guarantee a test asserts is a guarantee that can be
asserted wrongly, and the four false-proof findings on `the-gui-authors-through-the-same-door` were
all assertions that could not fail. A `never` assignment cannot be written so as to pass while being
false. Where a compile-time proof is not available — c1's consumer sweep, c5's runtime sweep — the
proof walks `shippedModules()` rather than a list of files, for the reason `printedWords.test.ts:18`
records: walking `src` alone once let a whole engine sentence survive in `scripts`.

**`result` (`src/content/serialize.ts:80`) is the model and is not changed.** It is already total, and
its totality is why it is the one consumer of `ActionResult` that has never silently dropped a member.
c1 makes the other four look like it rather than inventing a new discipline.

**A kind is owned by its parser, and the grammar is what collecting them produces.** Ruled by the
author on 2026-08-18, and it replaces the two options this spec was written against — a `print` on
`Field`, or a separate print table keyed by field name. Both keep the writing half somewhere other
than the reading half, which is the same enumeration in a new place; the second is the manual-sync
system outright. The shape is instead: everything of or related to a kind lives inside its parser,
one step collects the parsers into the grammar, and the round trip runs inside the parser rather than
across the tree. Complexity stops mattering at the point where it cannot leak — a parser that reads,
writes and proves itself is a unit that adding does not cost anything elsewhere, where today adding a
kind costs an edit in `NAMESPACED_KINDS`, `CONTENT_SECTION_MAPS`, `applySection`, `visitSection` and
nineteen loops in `serializeRegistryModule`, none of which fails when it is skipped.

This is why `Parser<T>` (`src/grammar/parser.ts:2`) is the seam rather than `SectionSchema`. It was one
method, `parse(cursor)`, and is now three. `serialize.ts` held their writing halves as orphans —
`range()`, `bonusAmount()`, `duration()`, `n()`, `ref()`, `side()`, `tag()`, `counter()`,
`condition()`, `quantified()`, `producedQuantity()`, `result()`, `resultLines()`, `rowLines()` and
`grantLine()` — and the conversion moved them home rather than writing them.

**`examples` earned its place on the first run.** `list()` derives its examples from its element's,
which is what makes a new element example a new list example with no edit; that derivation
immediately reported that `skillGrant` consumed to end of line while `skillSchema` declares `grants`
as a **clause** list, whose separator is the comma. A second grant on one authored line was read as
part of the first and refused. Fixed by making the grant stop at the comma, as `tagClause` already
did. Nothing in `content/` authored one, which is exactly why the shipped-corpus round trip could
never have found it.

**Stage 2 is one worker's whole context, and it was.** Making `print` required on `Parser<T>` breaks
every implementation in a single edit — that is the point of it, since an optional `print` is a hole
of exactly the shape mutation found in c1's delegation exemption — and a half-converted parser table
is worse than an unconverted one. The population is now measured rather than estimated: `tsc` named
**30 sites across 15 files**, not "about 25", and the split is 18 codecs reachable from the grammar
layer's exports against 10 written inline in `src/content` schemas. `SECTION_KINDS` is already
`Object.keys(PARSERS)` and is the model for what collection means.

**c4 and c7 landed; c3 did not, and the reason is recorded rather than the clause weakened.** The
codec conversion, the collected round trip and the byte fixture are done and mutation-verified 12/12
on the first aim. What remains of c3 is its second sentence — `serialize.ts`'s per-kind printers
"replaced by one walk over the collected grammar". It was surveyed and deliberately not begun with a
third of a context left, because the survey turned up six places where a walk derived from a schema's
fields and today's bytes disagree, and each needs a decision rather than a keystroke:

- **Default suppression is not uniform today.** `stat.base` prints at its default and
  `item.maxLevel` does not. No rule over `Field.default` reproduces both, so the field has to say
  which it is.
- **A list is inline for some fields and a block for others** — `entity.stats` inline,
  `entity.flags` and `recipe.in` as blocks — and that is a property of the field, not of the parser.
- **A hook's block form is not its element's print.** `resultLines` handles wrappers and
  `printResult` throws on them, so a `ListParser` needs a block printer beside its inline one.
- **A keyword flag's printed position is between two fields** (`aggressive` between `examine` and
  `hiddenIf`), and `keywords` is a list beside `fields` with no position in it. The fix is to make a
  flag a field — which also retires a list that must be kept in sync with `fields`.
- **A `MappedField` has no inverse.** `entity.stats` and `clusterJewel.positions` hydrate a list into
  a map, and printing needs the way back, in the kind's own module.
- **Section order across kinds is the serializer's, not `SCHEMAS`'.** `CONTENT_SECTION_MAPS`
  (`src/content/registry.ts:99`) is the kind-to-registry-map table the walk needs and already exists;
  it covers 15 of the 22 printed kinds and is ordered differently again.

The cheaper intermediate — moving each per-kind printer into the module that owns its kind and
collecting them onto `SectionSchema.print`, required so a schema without one does not compile — is
byte-identical by construction and is what the next worker should land first. It satisfies the
author's rule that everything of a kind lives inside its parser and empties `serialize.ts` of
spellings; deriving the body from the fields is then a second, separately gradeable step.

**Stage 3 was not begun, and one fact about it is worth having before it is.** c5 says an action's
owner arrives as `{ kind, id }`. `ActiveAction.ownerRef` is a **saved** field, and four `# save`
sections in `content/combat-expansion.dsl` hold `"activeAction":{"ownerRef":"action.…"}`. c7 and this
spec's own "no `.dsl` file in `content/` is edited by this branch" therefore forbid changing the wire
form. c5 already anticipates this — "the wire forms a save records are reachable only through the one
function that mints each" — so the shape change is in memory and `save.ts` gains a codec at the
boundary that packs and unpacks. That is a seam stage 3 has to build and not a rename. The sites are
`actions.ts:31,79`, `encounter.ts:138-140`, `save.ts:179-181,254`, `session.ts:349,558`,
`runtime.ts:616,670,675`, `state.ts:24` and `forwardProgress.ts:23`.

**The guard is required at every consumer, not only where a return type does not already give it.**
A function returning `string` is protected by `strict` alone: a switch that falls through fails to
compile because the return type does not admit `undefined`. Reading the rule that way would make it
two rules — carry a `never` default, *or* be inside a function whose return type happens to exclude
`undefined` — and the second half moves a switch in and out of protection whenever a signature
changes, with nobody reading the switch. `applyOne` (`src/runtime/effects.ts:232`) is the case that
settled it: nineteen arms, no `default`, returning `number | undefined`, complete today and complete
only until a twenty-first member is added, at which point it silently returns `undefined` for it. One
rule, no exceptions to remember, three lines per site. The survey at commissioning found 20 switches
and 0 guards, so the uniform rule costs 20 edits rather than the 4 the narrower reading would have
asked for — and the 16 it adds are exactly the ones that are correct by luck.

**c1's proof lives in `scripts/`, not beside the grammar.** `sweptFiles` (`scripts/lib/layers.ts:74`)
includes test files, so a test under `src/grammar` importing `shippedModules` would be an upward
import and `layer-check` would refuse it. `scripts/printedWords.test.ts:18` is the precedent: a rule
about the whole tree lives above the whole tree, and its header records that walking `src` alone let
an engine sentence survive in `scripts`.

**c1 is generalising a mechanism this repository has already measured working.** The survey turned up
`decision 2026-08-09T00:52:04Z (first-class-modals)`: widening the `Directive` union made
`src/content/serialize.ts` and `src/content/referenceSites.ts` type errors until each named
`submit-modal`, and the decision records that as *"what a new member of a closed union costs"* rather
than as a design choice. The rename of `credit:` to `them:` (`decision 2026-08-10T01:43:45Z`) is the
same event again, costed at one case in `effects.ts` and one emitter in `serialize.ts`. Both times the
compiler produced the list. c1 is the claim that it should produce it every time rather than at the
sites that happen to be total.

**Stage 2 may not re-export `serializeRegistryModule`.** `decision 2026-08-16T22:03:31Z` records that
it was deliberately unexported and the round trip moved into `serialize.ts` so that `tsc` refuses a
caller, and that the alternative — a transitive walk of the import graph — was rejected as *"the same
trap one level up"*. That ruling was authorised by the author after a pass had already paused a merge,
and it constrains this spec: the printer may be driven by `SCHEMAS` from inside the file, and the
only exported surface stays `roundTripModule`/`roundTripUniverse` (`serialize.ts:601`, `:644`).

**A standing ruling keeps one inference in place, and c5 does not reach it.**
`droptables-pass2-the-vs-selector-still-claims-dialogue-prose` was declined with the reason that
whether an id names a stat is unknowable while parsing, so the guess stays until it bites. c5 is
scoped to `src/runtime` and to addresses the load path has already resolved; nothing in it reopens a
grammar-level ambiguity the author has ruled on.

**Nothing here adds a gate.** `CLAUDE.md` is clear that a gate earns its place by preventing something
that actually happened, and everything above is either a compile error or a test — both of which run
inside gates that already exist. `audit-status` already reports 29 paths claimed by two concepts of one
system and calls them where a seam belongs; this spec acts on part of that report rather than adding a
second one beside it.

**The authored syntax does not change.** `<obj>.<objId>.<actionId>` stays exactly as authors write it,
`# remove <kind>.<id>` stays, and no `.dsl` file in `content/` is edited by this branch. c7 is what
makes that checkable rather than asserted.

## Open questions

- Whether `parseOwnerRef`'s replacement carries `kind` as `ActionOwnerKind` or as the wider set
  `findActionOwner` (`src/runtime/actions.ts:14`) actually switches on — which today includes `recipe`
  and `travel`, neither of them a section kind — is the worker's call, and the discrepancy is worth
  recording as a finding whichever way it goes.
- Whether stage 2's printer lives on `SectionSchema` as a `print` beside each field's `parser`, or as a
  separate table keyed by the same field names, is a design the worker owns. The clause fixes that the
  spellings are read from one place; it does not fix which shape holds them.
- Whether c8's DOM environment is jsdom or `@vitest/browser` is open. jsdom is the cheaper answer and
  the five-minute wall-clock rule in `CLAUDE.md` is the constraint that decides it; a measurement
  belongs in the pass file either way.
- The 29 concept overlaps `audit-status` reports are not all in this spec's family, and which of them
  this branch retires is not predictable before stage 2 lands. They are not clauses here and must not
  become them mid-branch — a finding cannot create work.

## Audit passes

### Pass 1 — 2026-08-20

- base: `ba96a5bfb249c05299a52350be81fe51c65760db`
- head: `139176bb9f7b7c95f155748d523472a9020ef12c`
- proof 1: unmet — Two shipped switches over a discriminated union carry no never assignment and are
invisible to the sweep: scripts/play-cli.ts:255 and src/ui/transcript.ts:85, both switching on
CommandOutput. The cause is in the subject derivation, not in the tree. discriminantOf
(scripts/exhaustive.test.ts:26) accepts a property as the discriminant only when
`new Set(spellings).size === type.types.length` — every constituent must carry a *distinct*
literal. CommandOutput is eight constituents in which PlayerMessage and ToolMessage both declare
kind: 'message' (src/runtime/command.ts:64, :77) and help/source/authored all declare
words: 'tool', so neither candidate property is distinct across all eight and discriminantOf
returns null. TypeScript itself narrows this union on `output.kind` without complaint, so the
clause's own words — "asking the type checker which switched-on types are discriminated" — are
not what the code does: it reimplements a stricter test than the checker's. Re-runnable: relax
that one line to `spellings.length === type.types.length` and the clause's own test
'every switch carries a default that assigns its scrutinee to never' fails, printing exactly
those two rows and no others. Measured 2026-08-19 at 139176b. Everything else about c1 is sound
and mutation-proved — removing the real never guard at src/runtime/effects.ts:331 is KILLED by
that test, disabling the switch walk is KILLED by 'the walk had subjects', blinding NEVER_GUARD
and forcing the delegation exemption true are both KILLED by 'reads a default that answers for
itself as absorbing'. The commissioning survey of "20 such switches" was short by two for the
same reason the sweep is.
- proof 2: met — scripts/exhaustive.test.ts 'the guard bites' compiles a three-member fixture through
ts.createProgram twice: handling all three yields no semantic diagnostics, handling two yields a
diagnostic containing 'never'. Mutation, 2026-08-19 at 139176b: replacing the fixture's
`default: { const never: never = value; return never; }` with `default: { return 0; }` is KILLED
by scripts/exhaustive.test.ts > the guard bites > refuses a switch that handles all but one,
re-run at its own file with the mutation still applied and failing there too. The proof is a
compile rather than an assertion, which is what the spec's Decisions section argued for.
- proof 3: unmet — First sentence met, second sentence not begun, and the goal does not hold without it.
Parser<T> (src/grammar/parser.ts:4) now requires print and examples, 30 sites across 15 files
implement both, and no implementation stubs either — grep over src and scripts finds no
`examples: []`, no print returning '' and no print that throws. isCodec requiring all three is
mutation-proved: reducing it to a parse check is KILLED by src/grammar/codec.test.ts > the law
itself > is not satisfied by a value that only parses. But "no field spelling, no separator, no
unit suffix appears as a literal anywhere in src/content/serialize.ts, whose per-kind printers
are replaced by one walk over the collected grammar" is false at 139176b: serialize.ts is 495
lines and still emits roughly 45 field spellings as string literals — `requires:`, `hidden if:`,
`time:`, `rate:`, `accuracy:`, `damage:`, `depletes:`, `attempts:` at :90-:103, `examine:`,
`slot:`, `cluster-jewel:`, `origin-cluster:`, `cluster-effect:`, `item-experience:`,
`max-level:`, `shape:`, `open-connections:`, `passives:`, `mod-slots:`, `respawn after:`,
`stats:`, `skills:`, `equipment-slots:`, `uses:`, `faction:`, `allies:`, `x:`/`y:`/`z:`,
`station:`, `skill:`, `say:`, `evasion:`, `max:`, `start:`, `display:`, `when:`, `again:`,
`version:`, `pack:`, `language:`, `base:`, `value:` and the nineteen per-kind loops that hold
them. Not graded deferred: the goal is that a fact gaining a member breaks a build, and renaming
a keyword in a schema today still prints a line the parser will refuse, with nothing between the
two moments saying so. The spec's own Decisions section records this and names the next step —
collect each per-kind printer onto SectionSchema.print, required so a schema without one does not
compile — which is byte-identical by construction and separately gradeable.
- proof 4: met — src/grammar/codec.ts derives the subjects from the collection three ways:
exportedCodecs over an eager glob of src/grammar/*.ts (codec.test.ts), the same over
src/content/*.ts, and reachableCodecs over every field of every schema in SCHEMAS
(roundTrip.test.ts:23), each following a list parser to its element by object identity. Neither
directory has a subdirectory, so the two globs are the whole population that layer-check allows a
Parser to live in. roundTripFailures returns a failure for a parser with no examples rather than
skipping it. Five mutations, 2026-08-19 at 139176b, each KILLED by its own named test re-run at
its own file: (a) making an empty examples list return [] is KILLED by 'reports a parser carrying
no examples rather than passing it'; (b) dropping the printed === example comparison is KILLED by
'reports a parser whose print does not return what was parsed'; (c) stopping the walk at a list
wrapper is KILLED by 'follows a list parser to its element, so a wrapper cannot hide one'; (d)
reducing isCodec to a parse check is KILLED by 'is not satisfied by a value that only parses'; (e)
restoring the skillGrant bug — `cursor.take(/[^,\n]*/)` back to `/[^\n]*/` at
src/grammar/skillGrant.ts:25 — is KILLED by src/content/roundTrip.test.ts > 'reaches the parsers
only a schema names, and finds each one round-tripping'. (e) is the whole argument for the shape:
skillGrant.test.ts is untouched by this branch and authors no comma case, content/*.dsl authors no
second grant on one line, and the only thing that catches it is list()'s derived
`element.examples.join(', ')` reaching skillGrant through skillSchema.fields.grants. The fix is
real and the failure is on the parse side, so it is a bug the corpus round trip could not have
found.
- proof 5: unmet — Stage 3 was not begun and the spec says so. src/runtime/addresses.test.ts does not
exist, so the clause's proof target names no file in this checkout and audit-prompt omitted it
from the manifest. parseOwnerRef (src/runtime/actions.ts:79-82) still recovers an owner's kind and
id with indexOf('.') and two slices, and still returns two silently wrong halves for a reference
with no dot; src/runtime/encounter.ts:138-140 repeats the same three lines inline;
src/runtime/actions.ts:31 still recovers a journey's ends with objId.split(TRAVEL_PAIR); and
src/runtime/state.ts:24 still recovers an actor's template by splitting on '#'. No {kind, id},
{origin, dest} or {template, copy} carrier exists anywhere under src/runtime. Not graded deferred:
the goal — the load path is the only place a fact about the language is decided — is exactly what
these sites contradict, and parseOwnerRef's dotless case is a live silent-corruption path feeding
findActionOwner, findActiveAction and the save pruner.
- proof 6: unmet — No branded type exists. grep for `__brand`, `declare const brand` and `Brand<` over
src/runtime and src/content at 139176b returns nothing, and ActiveAction.ownerRef,
Seat.ownerRef (src/runtime/encounter.ts:16, :22) and BoundarySource.ownerRef
(src/runtime/forwardProgress.ts:6) are all plain `string`. The template-literal assemblies the
clause exists to stop are still writable and still written: `action.${id}` at encounter.ts:94 and
runtime.ts:565, `${source.ownerRef}.${source.actionSlug}` at forwardProgress.ts:23,
`${active.ownerRef}.${active.actionSlug}` at runtime.ts:235 and :378. The clause's proof is
`npx tsc --noEmit`, which passes at 139176b — vacuously, since there is no brand for it to
enforce. A command proof that cannot distinguish done from not-begun is why this is graded from
the tree rather than from the gate.
- proof 7: met — Verified independently of the branch's own tests, 2026-08-19. Printed the whole
shipped corpus through roundTripUniverse at ba96a5b and again at 139176b (git checkout of
src/scripts/content at each, restored after; git status clean at 139176b afterwards) and diffed:
identical, 51661 bytes, and equal to src/content/printedCorpus.fixture.txt, so the fixture really
is the base's bytes and not a regeneration. Dumped the loaded registry over content/*.dsl at both
commits as canonicalised JSON (Maps and Sets sorted, keys sorted) and diffed: identical, 275334
bytes. So both halves of the clause hold in fact. The byte half is also mutation-proved: making
duration.print emit `1m0s` where it emitted `1m` (src/grammar/values.ts:78) — a drift a
*regenerated* fixture could not see, because parse accepts both and the round trip still closes —
is KILLED by src/content/roundTrip.test.ts > 'prints every shipped module to the bytes it printed
to at the branch base'. Caveat filed as a finding rather than graded here: the test named for the
registry half compares two loads through HEAD's parser and cannot fail for a parse change that
prints identically (DEFAULT_MAX_LEVEL 99 -> 98 SURVIVED it and was killed only by an unrelated
file three scopes out). The fixture is a snapshot that is compared against and nothing derives
from it; what it catches is print drift and print/parse disagreement, and what it cannot catch is
a semantic parse change invisible in the bytes.
- proof 8: met — src/ui/effects.test.tsx runs under `// @vitest-environment jsdom` with jsdom added to
package.json, mounts a component through createRoot inside React's act, and asserts that
useMoment's effect reached the transient channel — chosen over a probe component so that real
src/ui code runs. The census below it reads src/ui off the tree and matches every module declaring
a use(Layout)?Effect against EXERCISED + NOT_EXERCISED, so an unclassified one fails. Two
mutations, 2026-08-19 at 139176b, each KILLED by its own named test re-run at its own file:
gating useMoment's channel.play behind an impossible kind (src/ui/transient.ts:158) is KILLED by
'runs an effect declared by a src/ui hook, and the effect reaches the channel'; replacing the
useEffect regex filter that derives the census with a filter that accepts everything
(effects.test.tsx:78) is KILLED by 'every module declaring an effect is classified'. Two gaps
filed as findings rather than graded: the census reads src/ui one level deep so a subdirectory
module is not a subject, and nothing checks that a name in EXERCISED has a mounting test, so the
promotion from one list to the other is unverified.
- proof 9: unmet — npm run tasks -- merge-ready at 139176b: tsc ok, npm test ok, layer-check ok, doctor
ok (28 warnings, which do not fail the leg), bytes ok, tree ok, base ok — and audit-status FAIL
exit=1, plus four spec/clauses legs red. audit-status fails because five files this branch adds
belong to no system in docs/audits/systems.json: scripts/exhaustive.test.ts,
src/content/printedCorpus.fixture.txt, src/grammar/codec.ts, src/grammar/codec.test.ts and
src/ui/effects.test.tsx. Membership is a partition and that is the one condition audit-status
fails on. Two of the four red spec legs belong to a second spec,
the-cost-of-a-change-is-known-before-it-is-made, which this branch declared with an open member
and no implementation. Separately: one full npm test run reported 1 failed of 3780 —
scripts/tasks/auditPrompt.test.ts 'audit-prompt prints a ready-to-use auditor prompt for a spec'
timed out at 5000ms with the file itself taking 44218ms — and the same file alone then passed 69
of 69; recorded as occurrence 21 of npm-test-flakes-on-three-slow-spawn-heavy-tests-under-full-s
rather than as a defect of this branch.
