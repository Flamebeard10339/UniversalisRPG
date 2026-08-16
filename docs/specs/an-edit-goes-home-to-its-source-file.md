# an-edit-goes-home-to-its-source-file

## Deliverable

An edit made in the browser lives in the `local-changes` module, which is loaded last and overrides
what the files under `content/` declare. That is the right place for it while it is being written and
the wrong place for it afterwards: a local section that shadows a base section makes the next edit to
that file invisible, which is the diagnosis `the-shell-draws-what-the-session-answers` c3 emits and
this branch is the remedy it points at. Sending an edit home means writing it into the file that declared
its id and taking it out of the local module, and the whole difficulty is proving that doing so
changed nothing.

That proof already exists and is already load-bearing one file over.
`scripts/squash-local-changes.ts:125` serializes a module, reloads it, and refuses to proceed unless
`registryDiff` says the universe is identical. `c9c88e1` promoted `registryDiff` out of that script
into `src/content/registryDiff.ts` precisely so it could be shared, and the next commit, `bd77f26`,
built a second serialize-and-reload path in the mod portal without it — which is
`contribution-system-2026-07-30-h1`, where canonicalising an approved mod silently discards every edit
and removal it makes. One guard, two callers, one of them missing it: this branch makes the guard the
thing a serialize-and-reload *is*, so a third caller cannot be written without it.

How the edit is written into the file is the other decision, and it is a splice rather than a rewrite.
`splitSections` already returns each section's byte span, so replacing one section's span leaves every
other byte of the file exactly as the author wrote it — comments, blank lines, ordering and all. The
alternative, printing the whole module canonically, makes every consolidation a whole-file diff nobody
can review and makes the serializer's completeness a precondition, which is the very thing
`contribution-system-2026-07-30-h1` records as not holding.

Proof:

- [c1] **A consolidation writes each section into the file that declared its id.** Every section of the
  local module is spliced over the span `splitSections` gives for that id in its declaring file, and
  every other byte of every file is untouched. A section no file under `content/` declares is reported
  by id and left in the local module — placing it by guess is the one repair this clause forbids.
  proof: vitest scripts/consolidate.test.ts
- [c2] **A serialize-and-reload is a diffed serialize-and-reload, at every caller.** No path in the
  repository serializes content and loads it back without comparing the result to the universe it came
  from through `registryDiff`. The proof derives its subjects from the tree rather than naming the
  script and the mod portal, because the third caller is the one this clause exists to catch. This
  closes `contribution-system-2026-07-30-h1`.
  proof: vitest src/content/registryDiff.test.ts src/content/modportal.test.ts
- [c3] **A consolidation that would change the universe writes nothing.** Any difference `registryDiff`
  reports aborts the whole run: no file is written, the local module is untouched, and the difference is
  named. All-or-nothing, because a half-distributed edit is a state neither the file nor the local module
  describes.
  proof: vitest scripts/consolidate.test.ts
- [c4] **After a successful consolidation the game is unchanged and the local module is empty.** Loading
  `content/` alone after the run yields a universe `registryDiff` cannot distinguish from the one loaded
  before it with the local module on top, every `# test` over shipped content passes, and
  `/local list` reports nothing staged.
  proof: vitest scripts/consolidate.test.ts
- [c5] **The round trip is closed, and it is closed on real content.** An edit staged through `/dsl`,
  consolidated home, and loaded back from files alone produces the same universe as the same edit left
  staged — proven over the shipped `content/` tree rather than over a fixture, because the shipped tree
  is the one an author will run this against.
  proof: vitest scripts/consolidate.test.ts
- [c6] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make the local module a place edits pass through rather than a place they accumulate, so the files
under `content/` stay the thing the game is made of.

## Decisions

**Extends `local changes` and `registry diff`; registers `edit consolidation` over
`scripts/consolidate.ts`.** Both extended concepts are already registered to Contribution system, and
the survey found `scripts/squash-local-changes.ts` holding most of the mechanism. What is genuinely new
is distributing across many files rather than printing one, which is a capability a later survey will
ask about by name.

**Whether `squash-local-changes` survives is the worker's to decide on the evidence, and either answer
is recorded.** Its job — print one module canonically after applying local changes — is not this
command's job, and it may still be the right tool for publishing a mod as its own module. What it must
not remain is a second implementation of c2's guard. Folding it in or leaving it beside is permitted;
leaving two copies of the diff-then-refuse sequence is not, and c2's derivation is what catches that.

**A splice, not a canonical rewrite — c1.** Printing the whole module means every consolidation is a
whole-file diff, and it makes the serializer's completeness a precondition for not losing content.
`contribution-system-2026-07-30-h1` is that precondition failing in the one place it was already
relied on. Splicing the span `splitSections` already computes touches only what changed, keeps the diff
reviewable, and still gets c3's guarantee from `registryDiff` rather than from trusting the printer.

**Requires nothing in the GUI chain, and that is the point of the one clause it gave away.** Handing
the author the local module's bytes was this spec's c1 and is now
`the-gui-authors-through-the-same-door` c16, because it is a control on a surface that branch builds
over text that branch's `AuthoringContext` already holds — and keeping it here would have made this
branch write `src/ui/driver.ts`, which two other branches in the push also write. Giving up one clause
leaves everything here inside `scripts/` and `src/content/`, so this runs beside the whole GUI chain
instead of behind it. The diagnosis it answers is
`the-shell-draws-what-the-session-answers` c3, which reports which local sections shadow a base
section; that is a conceptual pairing and not a build order, since a shadowing section can be
consolidated whether or not anything has warned about it yet.

**The consolidation is a command and not a button, because a browser cannot write `content/`.** The
GUI hands over bytes and this command places them — two surfaces because of what a browser can do, and
neither a second implementation of the other. Nothing here is reachable from the game, and nothing has
to be.

**`squash-local-changes` survives, unchanged.** It is not a second implementation of c2's guard — it
already reaches the guard through `roundTripModule`, which is the shared thing c9c88e1 built. Its job
is still its own: print one module canonically, which is what publishing a mod as its own module wants
and what sending an edit home does not.

**c2 is enforced by `serializeRegistryModule` not being exported — there is no door to guard.** The
round trip moved into `src/content/serialize.ts` and the printer became private to it, so the only
callers that can exist are `roundTripModule`, `roundTripUniverse` and `republishModule`, all three of
which diff before they return, and `tsc` refuses anybody else. `src/content/registryDiff.test.ts` now
asserts three things and models no import syntax at all: the serializer is not among the module's
exports, the module's whole export surface is the seven names it means to offer, and the identifier
appears in no other file.

This replaced a test that read import statements and decided which reached the serializer. It was
wrong twice — audit pass 1 found `import * as printer from './serialize'` walking past it, and pass 2
found `export { serializeRegistryModule } from './serialize'` added to the one file the rule exempted,
after which any caller could import it from there. Both were closed at the time by adding a case. The
second HIGH is the signal that adding cases was the wrong move: the set of ways to spell "I hold this
binding" is not a set anybody can finish writing down, so the repair is to leave nothing to spell. The
export was the door.

The cost, taken deliberately: `src/content/serialize.ts` grows by the round trip, and three test files
that printed a module directly now reach `.printed` through `roundTripModule`. `REGISTRY_DIFF_MAPS`
became `registryDiffMaps()` because `serialize.ts` importing `registryDiff` closes an import cycle
through `registry.ts`, and a top-level read of another module's binding inside a cycle is a read of a
binding whose module has not run.

**The mod portal's round trip is taken before the rename, and the rename is not diffed — c2.**
Comparing a hand-renamed registry against a reload reports every compiled locale key and inline action
id the rename did not reach, and completing that rename is a table somebody has to keep in sync, which
is the failure this repository names first. What the trip proves is the property h1 is about: that the
serializer carries this module whole. An edit to another module's content and a `# remove` both fail
it, and `republishModule` returns no text at all in that case, so the mod is published as the author's
own bytes under the new id. That is a behaviour change beyond the clause's letter — a contribution
that edits base content used to be published as a bare `# info` — and it is the clause's point.

**A staged section replaces the whole section it goes home to, so a partial patch is refused — c1, c3.**
Splicing is what keeps the diff reviewable, and a splice has nothing to merge with: the fields the
staged section does not name are the fields the file stops saying. Merging them in text would be a
second implementation of `mergeSection` that has to be kept in sync with the first. So the run aborts
and `registryDiff` names the id, which is c3 doing exactly its job; staging the section whole is the
repair, and `/dsl` takes a whole section.

**The command consolidates everything staged and takes no filter.** c3's all-or-nothing is then a
statement about the local module rather than about an argument, and there is no way to ask for half of
it. `--dry-run` is what a reader wanting to see the plan first gets instead.

**Its content set is `content/*.dsl`, read from the directory.** The same derivation the browser's glob
and the shipped-content replay already make, so a `.dsl` added to `content/` is a file an edit can go
home to on the commit that authors it. `content=` overrides it, which is what the tests point at a
temporary tree with.

**A removal goes home as a deletion, and takes the blank line separating it from its neighbour.** The
span `splitSections` gives is the section's own lines; leaving the gap two lines wide where a section
used to be is not "every other byte untouched" in any useful sense, and the alternative reading leaves
a growing pile of blank lines behind every consolidated removal.

**Line endings follow the file being written into.** A CRLF checkout is a real configuration the loader
already holds for, and splicing LF text into it would rewrite the file's own convention one section at
a time. A restage of what a CRLF file already says leaves it byte-identical, which is the test.

**c2's proof runs in `src/content/registryDiff.test.ts` and `src/content/modportal.test.ts`, not
`scripts/modportal.test.ts`.** `materializeApprovedModIssue` is where the second caller lives and it is
in `src/content`; the script is a CLI over it. c4's `# test` replay runs in
`scripts/consolidate.test.ts` over the consolidated tree rather than in `src/runtime/integration.test.ts`,
which reads the shipped tree and would only prove that this branch did not disturb it. Both clauses'
`proof:` lines said otherwise and have been corrected, because a wrong `proof:` line misaims the
generated mutation manifest — c2's cost pass 1 eleven entries and c4's cost pass 2 seventeen. c2's was
fixed on its own in pass-1 triage and c4's, the identical defect one clause away, was left standing:
aiming at the finding rather than at the property, which is the failure this workflow names.

## Open questions

- Whether the command takes a filter — one kind, one id, one file — or always consolidates everything is
  the worker's call. c3's all-or-nothing applies to whatever set it was asked for.
- Where a section belongs when two files under `content/` both declare its id is not decidable here and
  must be refused rather than guessed, under c1's own rule. Whether that case can arise at all depends
  on `refuse-two-objects-of-different-kinds-sharing-an-id-while-ei`; until it lands, refusing is correct
  and costs nothing.

## Audit passes

### Pass 1 — 2026-08-16

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `acf40f02ae7231826d7ae5800bbab8b79d6d1710`
- proof 1: met — Seven aimed mutations of the splice itself were killed by the test the clause names, each
  re-run at scripts/consolidate.test.ts with the mutation still applied: narrowing the spliced span to
  `end: declaration.start`, replacing `rehead` with the staged heading, dropping the namespace
  qualification in `declarationKey`, unconditionally returning from `deletionEnd` before it eats the
  separating blank line, raising the two-declaring-files guard to `at.length > 99`, disabling the
  one-span-two-sections guard, and replacing the unreachable-section reason with one that does not name
  the id. Manifest at C:\Users\yonat\AppData\Local\Temp\mutations-an-edit-goes-home-to-its-source-file-pass1.json
  (plus the -reports.json beside it); `npm run mutate -- <it>` re-runs all of it. The "every other byte"
  half is asserted twice over: byte equality of the whole file against a restage that says what the file
  already said, and, over a copy of the shipped tree, byte equality of every content file except the one
  tutorial-island.dsl edit. One aimed mutation survived and is filed: flipping the descending sort in
  `applyEdits` changes nothing any test can see, because no test consolidates two sections into one file.
  I probed that case directly through `npm run inspect` (two edits, and two edits plus a removal, into
  one file) and both spliced correctly, so the survivor is a missing test rather than a broken property.
- proof 2: met — Both halves hold. The h1 half: replacing the refusal in `republishModule`
  (src/content/roundTrip.ts:55) with `if (false)` was killed twice at src/content/modportal.test.ts, by
  "carries an edit to base content, which the module it prints does not own" and by "carries a removal of
  base content, which the module it prints cannot express", so the mod portal now publishes the author's
  own bytes rather than a canonical print that loses them, which is contribution-system-2026-07-30-h1
  closed. The derivation half: adding `serializeRegistryModule` to src/content/registry.ts's existing
  import of `./serialize` was killed by src/content/registryDiff.test.ts "is the only thing shipped code
  can do with the serializer", so a new shipped caller does turn the test red. Graded met because the
  clause's own sentence, that no path in the repository serializes and reloads without registryDiff, is
  true of the tree today and proven by a walk of the tree rather than a list. The Decisions' stronger
  reading ("a third caller cannot be written without ... turning that test red") is measurably not true of
  every form: `import * as printer from './serialize'; void printer.serializeRegistryModule;` added to
  registry.ts survived at whole-suite scope, 0 failed of 3374. Filed as a medium finding, not as unmet.
  Note for the next pass: the clause's `proof:` line names scripts/modportal.test.ts, which is the CLI
  test file and has nothing to do with c2; the Decisions section says src/content/modportal.test.ts and is
  right. I graded against the latter.
- proof 3: met — Six aimed mutations, five killed at scripts/consolidate.test.ts. Making the differences
  branch return the edited sources and the emptied local instead of `[...base]` and `local.text` was killed
  three separate ways: by "names the difference a partial patch would make, and keeps every byte", by
  "refuses as a whole, so a placeable section beside an unloadable one is not written either", and by
  "leaves every byte on disk where it was", which is the on-disk claim and the only one an in-memory result
  cannot make. Stubbing `registryDiff` to `[]` and dropping the differences term from `writable` were both
  killed by the first of those. The difference is named: the test asserts the exact line
  "  locations: changed base.camp". One survivor is filed: `if (after.diagnostics.length > 0)` changed to
  `if (false)` changes nothing any test sees. That branch is reachable and correct, probed with a staged
  `# location base.camp` carrying `adjacent: other.hall`, giving "base [base] resolve: ... but other is not
  this module or one of its dependencies", nothing written and the local module untouched; it survives only
  because registryDiff refuses the same input by a second route. Low, not a hole in the clause.
- proof 4: met — Replacing the local-emptying `deleteLocalSection` call with a no-op was killed by
  scripts/consolidate.test.ts "leaves the local module with nothing staged", which reads the local file back
  off disk after a real `run()` over a copy of the shipped tree; deleting `write(args.localFile,
  result.local)` was killed by the same test. Replacing the after-load with `before` was killed by "names the
  difference a partial patch would make, and keeps every byte". "Loading content/ alone yields a universe
  registryDiff cannot distinguish" is the assertion registryDiff(staged, after) equals [] over the shipped
  tree, and the write-nothing mutation on `run()` killed it. One honest qualification for the next pass: the
  shipped-test-replay assertion, "passes every test the consolidated tree declares", never failed on its
  own. Both mutations I aimed at it, breaking the splice span and writing the original bytes back instead of
  the edit, were killed by neighbours in the same file at the escalated scope and survived at the replay's
  own scope, because the one staged edit is examine prose that no shipped test exercises. The clause still
  holds; the replay is defence in depth rather than the thing proving it, and the byte-equality and
  universe-equality assertions are what carry c4.
- proof 5: met — The whole describe block "the round trip is closed, on the content that ships" runs against a
  copy of the real content/ tree: it stages "/dsl item tutorial-island.lockpick examine: ..." through
  `runLine` and the same AuthoringContext the REPL and the GUI use, runs the CLI's own `run()`, and reloads
  from files alone. Three aimed mutations of `run()`'s write path were killed there: writing the original
  bytes back instead of the edit (killed by "loads the same universe from the files alone as it did with the
  edit staged on top"), dropping the local-module write (killed by "leaves the local module with nothing
  staged"), and appending a newline to every file (killed by "wrote the edit into the file that declared the
  id, and touched no other file"). One survivor is filed: every test in the file passes `content=` and
  `local=`, so `.filter((name) => name.endsWith('.dsl'))` in `contentFiles` can be replaced with
  `.filter(() => false)` with the whole suite green. That is the default content-set derivation the
  Decisions section commits to, untested.
- proof 6: met — `npm run tasks -- merge-ready` at acf40f0 with a clean tree: tsc ok, npm test ok, layer-check
  ok, audit-status ok, doctor ok (23 warnings, which that leg does not fail on), bytes ok, tree ok, base ok.
  All six legs the clause names pass. The two legs that report FAIL are the spec-standing ones, "1 open
  member" and "has no recorded audit pass", which cannot pass before this pass is filed and the member is
  closed, and are not among the six the clause enumerates.

### Pass 2 — 2026-08-16

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `ae7e8843a6c0830f906156bca69f9c7b505ee41a`
- proof 1: met — Five aimed mutations killed at scripts/consolidate.test.ts, each re-run at that file with the
mutation still applied. (a) src/content/resolve.ts `declaredKey`'s dotted-id null widened to always
`qualify(namespace, id)`, killed by "splices the staged text over the declaring span, under the
heading that file spells" — which is what makes pass 1's two-rules-into-one collapse load-bearing
rather than decorative: consolidate genuinely places through the loader's own rule. (b) `rehead(
declaration.heading, section.text)` replaced with `section.text`, killed by the same test, so the
file's own spelling of the heading is what survives a splice. (c) the descending sort in `applyEdits`
flipped to ascending, killed by "places two sections into one file without either moving the other" —
this was pass 1's survivor and 060f9c7's new test now watches it. (d) `deletionEnd`'s blank-line scan
short-circuited to `return stop + 1`, killed by "takes the declaring section out of its file when the
staged section is a removal". (e) the two-declaring-files guard raised to `at.length > 99`, killed by
"refuses a section two files both declare, rather than choosing one". One survivor, filed low:
`matchingEndings` replaced with the identity survives at whole-suite scope, 0 failed of 3386, so the
"line endings follow the file being written into" decision is unwatched. I checked the property by
hand through `npm run inspect` over consolidate() with all three of CRLF-file/LF-local,
CRLF-file/CRLF-local and LF-file/CRLF-local: all three come back byte-identical with no doubled CR,
because listLocalSections normalises a staged section to LF, so this is a missing test and not a
broken property. Manifest:
C:\Users\yonat\AppData\Local\Temp\mutations-an-edit-goes-home-to-its-source-file-pass2.json
- proof 2: met — The clause's own sentence is true of the tree today, checked by walking it rather than by
trusting the guard: `serializeRegistryModule` has exactly one shipped importer, src/content/
roundTrip.ts, and every other reach is a test that also imports the diff. Both halves mutation-proved.
The h1 half: `republishModule`'s refusal in src/content/roundTrip.ts weakened to
`trip.diagnostics.length > 99`, killed by src/content/modportal.test.ts "carries an edit to base
content, which the module it prints does not own", re-run at its own file — so the mod portal
publishing the author's own bytes instead of a print that loses them is what that test is holding.
The derivation half, positive control: adding `import { serializeRegistryModule } from './serialize';`
to src/content/modportal.ts was killed by src/content/registryDiff.test.ts "is the only thing shipped
code can do with the serializer" at its own scope, so the ordinary way of writing a third caller does
turn the test red. Two qualifications the next pass should carry. First, the Decisions' stronger
reading ("a third caller cannot be written without ... turning that test red") is measurably false a
second time, in a new form: `export { serializeRegistryModule } from './serialize';` added to
roundTrip.ts SURVIVED at whole-suite scope, 0 failed of 3386, and with that door open a shipped file
importing the serializer from './roundTrip' is invisible to the derivation — that mutation's named
test survived, its file survived, and the whole-suite red came from scripts/modportal.test.ts and
scripts/publish-local-changes.test.ts crashing as real processes on an export roundTrip.ts does not
actually have, which is the suite noticing a broken build and not this clause proving itself. Filed
high. Second, over-strictness, looked for and found: rewriting src/runtime/session.ts's
`import { printDirective } from '../content/serialize';` as `import * as printer` — legitimate code
that touches nothing but printDirective — was KILLED at registryDiff.test.ts's own scope. That is a
stated and reasoned boundary in the test's own comment, so I record it as a measured cost rather than
as a defect. Also recorded, unchanged from before the branch and settled in the Decisions:
`republishModule`'s second print (the renamed registry) is serialized, written to a mod file and
loaded by planModportalSync without a registryDiff.
- proof 3: met — Two aimed mutations, both killed at scripts/consolidate.test.ts and re-run there with the
mutation still applied. `const differences = registryDiff(before.registry, after.registry)` replaced
with an empty list, killed by "names the difference a partial patch would make, and keeps every byte";
and the differences branch made to return the edited `sources` and the emptied `text` instead of
`[...base]` and `local.text`, killed by the same test — which is the all-or-nothing half, since that
test asserts both `writable(result)` false and byte equality of the whole base file. Re-run with
`npm run mutate` over the pass-2 manifest.
- proof 4: met — The `deleteLocalSection` call in consolidate() replaced with `void section;` was killed by
scripts/consolidate.test.ts "leaves the local module with nothing staged", which reads the local file
back off disk after a real `run()` over a copy of the shipped content tree, and re-run at that file
with the mutation still applied. The universe-equality half is asserted by "loads the same universe
from the files alone as it did with the edit staged on top" in the same describe block, and the
write-path mutation aimed at c5 killed it. One thing the next pass should not have to rediscover: the
clause's `proof:` line still names src/runtime/integration.test.ts, which reads the shipped tree and
cannot be influenced by anything in this diff — the spec's own Decisions section says exactly that and
the line was not corrected, and 17 of the 116 entries this pass's generated manifest carries are aimed
there as a result. Filed medium.
- proof 5: met — Two aimed mutations killed by the describe block "the round trip is closed, on the content
that ships", which stages `/dsl item tutorial-island.lockpick examine: ...` through `runLine` and the
same AuthoringContext the REPL and the GUI use, over a copy of the real content tree, runs the CLI's
own `run()`, and reloads from files alone. `write(files[index], source.text)` replaced with
`write(files[index], base[index].text)` was killed by "loads the same universe from the files alone as
it did with the edit staged on top". And `contentFiles`'s `.filter((name) => name.endsWith('.dsl'))`
replaced with `.filter(() => false)` was killed by "defaults to every .dsl under content/ but the
local file, and takes an override" — that was pass 1's survivor, and 060f9c7's command-surface test
now watches the default content-set derivation the Decisions commit to.
- proof 6: met — `npm run tasks -- merge-ready` on a clean tree at ae7e884: tsc ok, npm test ok, layer-check
ok, audit-status ok, doctor ok (26 warnings, which that leg does not fail on), bytes ok, tree ok, base
ok. All six legs the clause enumerates pass. The one FAIL is the spec-standing leg, "1 open member",
which is this branch's own in-progress record and cannot pass before this pass is filed and the member
closed; it is not among the six.
