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
- [c3] **A section prints under the spellings its schema declares.** `serializeRegistryModule` and
  every printer below it read field names and `keyword:` spellings from `SCHEMAS`
  (`src/content/module.ts:32`) rather than restating them, and no authored spelling of a
  schema-declared field appears as a string literal anywhere in `src/content/serialize.ts`. The seven
  `BESPOKE` kinds (`module.ts:59`) keep their own printers and are exempt by construction rather than
  by a list.
  proof: vitest src/content/serialize.test.ts
- [c4] **Round-tripping is proved over generated content, not only over shipped content.** The proof
  walks `SCHEMAS`, synthesises for every kind a section exercising every field that kind declares —
  including the fields no module in `content/` authors — prints it, reparses it and compares the
  registries. A field added to a schema next month is round-tripped by this test with no edit to it,
  which is the property the shipped-corpus round trip cannot have.
  proof: vitest src/content/roundTrip.test.ts
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
