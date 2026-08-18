# the-shell-is-never-handed-a-missing-view

## Deliverable

`opening-a-universe-answers-rather-than-raises` makes a session something the door always hands back.
This is the half of that which the type system has to be told about.

`DriverSnapshot.view` is `PlayView | null` and stays so, and **29 sites across 10 files** under
`src/ui` still handle a state that can no longer occur: `src/ui/App.tsx` (10), `src/ui/discovery.ts`
(3), `src/ui/agent/testHarness.ts` (3), `src/ui/LocationBanner.tsx` (3), `src/ui/driver.ts` (2),
`src/ui/SkillsPane.tsx` (2), `src/ui/MapPane.tsx` (2), `src/ui/Home.tsx` (2),
`src/ui/StatusBanner.tsx` (1), `src/ui/authoringSurface.ts` (1, which is `NOWHERE` — what `standingIn`
answers when there is nobody standing anywhere). The counts are the shape of the sweep, not its extent:
c2 derives its own subjects, so a site this list has miscounted is still caught.

A type that is merely wide is a nuisance. A type that lies is a defect generator: the next reader
writes handling for the impossible state, a test written against that handling can never fail, and a
reviewer cannot tell the difference between a branch that is dead and a branch that is untested — which
is the confusion that cost the predecessor branch its HIGH. Leaving the nullable in place after the
door guarantees a session is choosing to keep that confusion.

This deletes and does not add. There is no new behaviour here at all: every one of the 29 sites is
either an unreachable branch to remove or a `?.` to unwrap.

Proof:

- [c1] **The published type says what is true.** `DriverSnapshot.view` is `PlayView`. The harness
  publishes a view rather than a maybe-view, and `standingIn` answers where the player is rather than
  whether there is one.
  proof: command npx tsc --noEmit
- [c2] **Nothing under `src/ui` asks whether there is a view, and nothing this layer publishes may
  quietly admit one.** The guarantee is derived over the published interfaces' own keys and put to the
  type checker: `| null`, `| undefined` and `?:` are one question over every member, including the
  members written next month and the ones that yield an absence through a call, and a name exempted
  from it fails as loudly when it stops admitting absence as a field does when it starts. The other
  half, which no type can state about itself, is put to the same compiler over the two directories a
  driver is driven from: every spelling of the question is a source fixture compiled by the program
  that reads the tree, so what holds the tree is what the fixtures prove rather than a second list
  checked against the first. That second half is a **named grammar and not a closed set**, and the
  file, this clause and the concept note each say so and say what is outside it — asking the checker
  about every condition position is the closed answer and is a spec of its own. It is a boundary the
  first half makes small: a nullable cannot be published, so a spelling that escapes is a reader
  writing a pointless check rather than a type that lies. The branches are deleted rather than left unreachable behind a `!`, which
  is what makes this a clause and not a restatement of c1: a non-null assertion satisfies the compiler
  and leaves the reader exactly the question this spec removes.
  proof: vitest src/ui/published.test.ts
- [c3] **Every screen draws exactly what it drew before.** The full render sweep passes unchanged. This
  is the clause that carries the whole risk of the sweep, because 29 mechanical deletions across ten
  files is a shape that fails silently or not at all.
  proof: vitest src/ui/render.test.tsx
- [c4] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

**c2 was amended a second time on 2026-08-18, after pass 2, and this is the record of it.** The first
amendment replaced eight regexes with a compiler walk and called both of its halves closed sets. The
type half is one. The grammar half is not: pass 2 measured twelve ordinary spellings escaping it,
`const { view = null } = s` among them, which is this repository's own house style. A thirteenth entry
would move the number and not the shape, so the claim is retired rather than extended and what the rule
does not reach is written down in all three places that claimed closure. The derivation that would
close it — asking the type checker about every condition position rather than about a listed grammar —
is real, is named in the store, and is a new dependency and a new gate, so it is deferred to its own
spec under this branch's standing scope ruling. What makes that honest is c1, graded met at the same
pass: the published type admits no absence at all, so the residue is a pointless check and never a lie.

**c2 was amended on 2026-08-18, after pass 1, and this is the record of it.** It promised a count of
spellings, scanned over text by `surface.test.ts`. Pass 1 graded it unmet and named seven ordinary
spellings that escaped all eight of those regexes — `view?: PlayView` first, which is the standard
TypeScript spelling of the very union the rule bans and is already the house spelling one layer down in
`CommandResult`. A rule that derives its files and enumerates its spellings is the manual-sync shape
this repository names most loudly, wearing a derivation's clothes. The replacement, ruled the same day,
asks the type checker what a member can hold and the compiler what counts as asking; both are closed
sets, so neither half can be missing a row. The clause is wider than it was and the proof moved with
it, from `surface.test.ts` to `src/ui/published.test.ts`, which is why the `proof:` line changed too.
c1 was amended by nothing: it always said the published type says what is true, and what pass 1 showed
is that the sweep answered it for one field rather than for the type.

## Goal

Stop the type from describing a state the engine can no longer produce, so that nobody writes, tests
or reviews handling for it.

## Decisions

**This is a separate spec and not the tail of its predecessor.** It touches ten files and no behaviour,
where the predecessor touches behaviour and few files; folding a wide mechanical sweep into a branch
that has already taken two audits is how the last HIGH happened. The argument is about audit surface,
not clause count, so it survives this spec shrinking to four clauses. It runs on the same branch, after
the predecessor is closed, so the tree is never in the state this spec exists to prevent — a guaranteed
session with a type that denies it — for longer than one merge.

**A `!` is not a fix.** Unwrapping with a non-null assertion satisfies tsc and leaves the reader
exactly the question this spec removes. c2 is written against the deletion, not against the compile.

**`wordless()` is the predecessor's, not this spec's.** An earlier draft claimed it here. It is a
`loadUniverseWithDiagnostics` call under `src/ui` (`src/ui/driver.ts:277`), so the predecessor's c6 —
zero load path calls under `src/ui` — deletes it before this spec starts. Two specs both claiming one
deletion is the manual-sync shape in miniature, and the fix is that the clause which forces it owns it.

**Three clauses were cut from the first draft, each because something else proves it.** A "the words on
the screen are the session's" clause went with `wordless` to the predecessor. A "nothing that loads
today stops loading, and no content is edited" clause was dropped: this spec touches only `src/ui`, and
the predecessor's c8 makes that check on the same branch. A "deletes more than it adds" clause was
dropped: c2 already proves the branches left rather than being asserted away, which is the fact the
line count was standing in for, and `main...HEAD` would have measured the predecessor's additions too.

**Both open questions took the narrow answer, under the author's 2026-08-17 ruling.** `MapPane` and
`discovery.ts` go on taking a view; `drawnFor`'s parameter loses its null and nothing else moves, and
`walkLine` keeps its journey guard, because a view with no journey under way is a state the engine
still produces. `NOWHERE` survives in `authoringSurface.ts` and `standingIn` stops reaching for it:
c1 makes the state it answered for unreachable, and four test files name the value as the standing
with no entities, so deleting it would mint that literal three times over.

**c2's scanner walks `src/ui` with tests included**, one flag wider than the `SOURCES` set the file's
other rules use. It earned the width on the first run: 39 `snapshot().view!` assertions across five
test files, none of them in the ten files this spec counted, and the assertion is the exact spelling
the clause says is not a fix.

**Three survivors are declared rather than closed, and two are filed as findings.** `SkillsPane`'s
rate clock and `MapPane`'s recentre floor are read only after component state a click sets, which
CLAUDE.md's testing rule 5 leaves to the author. The driver's arming log is redundant with the tick
that follows it for every fixture in the tree — the only thing the arming view carries that the tick
cannot is what the world said as the action began, and nothing in the tree says anything there.

## Open questions

- Whether `MapPane` and `discovery.ts` keep taking a view at all, or take the fields they draw, is the
  worker's call — several of their null checks are about a view that has no journey rather than about
  there being no view, and those are a different question that this spec should not quietly answer.
- Whether `NOWHERE` survives as the answer for a session standing in the fallback's own location is the
  worker's call. c1 fixes that `standingIn` is total; it does not fix what it returns there.

## Requires

`opening-a-universe-answers-rather-than-raises`, closed. Starting before it is closed would mean
deleting the handling for a state the engine can still reach.

## Audit passes

### Pass 1 — 2026-08-17

- base: `7a0081a19f28d556372123f479f8d0baec702d7c`
- head: `7051d8b0f76c7555b304bf4c9716c7d3de6e9aef`
- proof 1: unmet — The three subjects the clause names are all true: src/ui/driver.ts:30 is `view: PlayView`,
src/ui/agent/testHarness.ts:38 is `view: PlayView`, src/ui/App.tsx:150 `standingIn` is total, and
`npx tsc --noEmit` passes (re-run: it did on 7051d8b). The clause fails on its own subject, which is
the published type and not that one field of it. Two more fields of the same interface, in the same
file, still describe states the door can no longer produce, and both were made unreachable by this
branch's own predecessor commit cedfaf5:
(a) src/ui/driver.ts:43 `speed: number | null`, while src/ui/driver.ts:151 sets it from
`context.live.speed` and src/runtime/command.ts:131 types that `speed: number`. `context` is
definitely assigned by `openOnce` before the constructor returns, so null is unreachable. The lie has
already generated the defect the Deliverable warns about: src/ui/SettingsPane.tsx:62 reads
`{speed === null ? null : <SpeedField ... />}`, an unreachable branch in a rendered component. Measured
with `npm run mutate` on 2026-08-17 over the whole suite: removing that guard SURVIVED 0 failed of
3749, and inverting it — which takes the speed control off the Settings page entirely — also SURVIVED
0 failed of 3749. Manifest kept at
C:\Users\yonat\AppData\Local\Temp\audit-the-shell-is-never-handed-a-missing-view-pass1-residue.json.
So it is dead and untested at once, which the Deliverable names as the confusion that cost the
predecessor branch its HIGH.
(b) src/ui/driver.ts:66 `serialized(): string | null` with the comment "null when there is no session
to save", while the body is `serializeSession(context.session)` and src/runtime/session.ts:395 returns
`string`. At the merge base 7a0081a the body was `context ? serializeSession(context.session) : null`,
so the null was real then and is not now. It already carries the spelling this spec exists to refuse:
scripts/drift.test.ts:236 `JSON.parse(gui.serialized()!)`.
The sweep was aimed at one field of the published type rather than at the type, and `npx tsc --noEmit`
is a proof that cannot see the difference — it passed before the sweep and passes now.
- proof 2: unmet — The scanner works for what it enumerates, and it enumerates. Eight aimed mutations, all
KILLED by the test that names them (`npm run mutate`, 2026-08-17, manifest at
C:\Users\yonat\AppData\Local\Temp\mutations-the-shell-is-never-handed-a-missing-view-pass1.json):
reintroducing `view?.` in src/ui/LocationBanner.tsx, reintroducing `view!` in src/ui/App.tsx,
reintroducing `view?.` in the test file src/ui/mapEdit.test.ts, restoring `PlayView | null` on
`DriverSnapshot`, stopping the walk descending into tests, dropping one row from `ASKING`, dropping
`undefined` from `NOTHING`, and dropping the chain prefix from `A_VIEW`. `vitest src/ui/surface.test.ts`
passes 32 of 32 and the tree is clean of all eight spellings.
What fails is the clause's operative claim — "derived ... so a site written next month is caught rather
than a list going stale". The subjects (the files) are derived; the predicate (what counts as asking) is
a hand-written list of eight spellings, and the test that grades it ('fires on every way of asking, and
on none of the ways of using') checks that list against a second hand-written list of the same eight,
which is enumeration on both axes. Seven ordinary spellings pass the whole rule. Re-runnable — paste the
file's own `A_VIEW`, `NOTHING`, `ASKING` and `UNION` into `node -e` and test these strings:
  `view?: PlayView`            escapes the union rule entirely — the optional-property spelling of the
                               very union it bans, and the spelling `CommandResult.view?: PlayView` in
                               src/runtime/command.ts:102 already uses one layer down
  `if (view) ...`              escapes all eight — the plainest way of asking there is
  `view == null` / `!= null`   escapes: the pattern requires `[=!]==`, three characters
  `typeof view === 'undefined'` escapes: the quote breaks the `NOTHING` alternation
  `Boolean(view)`              escapes
  `const at = view\n  ? 1 : 2` escapes: the scan is line-by-line, so a formatter wrapping a long
                               ternary defeats `branches on its truth`
  `const v = snapshot.view; if (!v)` escapes: the rule is keyed on the identifier `view`
The first of those is the one that matters: `view?: PlayView` is how a reader would most plausibly put
the nullable back, and no test in this file says a word about it. This is the list-kept-in-sync shape
CLAUDE.md names, wearing a derivation's clothes.
- proof 3: met — `vitest src/ui/render.test.tsx` passes 27 of 27 on 7051d8b, and the sweep is behaviour
preserving by reading: every one of the 28 sites is `?.`/`??` on an operand `openUniverse` now
guarantees (src/runtime/openUniverse.ts returns a session on every input), or a branch whose condition
is now constant. Aimed 22 mutations at the swept lines themselves rather than at the render tests —
one per file the sweep touched — and 17 died on the render test that names them (`npm run mutate`,
2026-08-17, manifest at
C:\Users\yonat\AppData\Local\Temp\mutations-the-shell-is-never-handed-a-missing-view-pass1.json;
25 killed, 5 survived, 0 unstable, 0 errored over the 30 entries). The four new render proofs in
af9ce0e each kill the line they were written for: the two banners, the Local standing and the modal's
way out. The five survivors are filed below rather than left implied; none of them is a screen drawing
something different today, and three are decisions no static render can reach.
One caveat on the record: the sweep was specified as "either an unreachable branch to remove or a `?.`
to unwrap", and src/ui/driver.ts:278 is neither — `logging(result.view)` became
`[{ kind: 'view', view: context.view, ... }]`, substituting a different expression and deleting a
conditional. It is equivalent today only because `driveChoice` in src/runtime/command.ts:1349 is the one
producer of `result.live` and always carries `view: opening`, which `settle` moves onto `ctx.view`.
`CommandResult` types `view?` and `live?` independently, so nothing enforces it, and both the deletion
of that line and its substitution for `current.view` SURVIVED the whole suite.
- proof 4: met — Every mechanical leg passes on 7051d8b: tsc ok, npm test ok (3749 of 3749), layer-check ok,
audit-status ok, doctor ok with 27 warnings that do not fail the leg, bytes ok, tree ok, base ok, and
`spec the-shell-is-never-handed-a-missing-view` ok — every declared member closed. Graded on the same
reading the worker's 2026-08-17 decision on the-shell-draws-what-the-session-answers-clause-14 used and
recorded in docs/events.jsonl: the remaining red legs are the audit-pass accounting, which no run of the
gate can turn green. Two things a reader of this record should know rather than re-derive.
First, the accounting is not only self-referential: `clauses opening-a-universe-answers-rather-than-raises`
clears when the sibling auditor files, and this spec's leg clears when this pass is filed, but
`spec the-shell-draws-what-the-session-answers` (1 open member) and `clauses` (c4, c5, c14 outstanding
across 2 passes) need a third audit on a spec nobody has been commissioned for. The branch cannot go
green until that pass exists.
Second, `npm test` FAILED on the first of three merge-ready runs and passed on the other two, and a bare
`npm test` between them passed 3749 of 3749. That is the fourth sighting of
npm-test-flakes-on-three-slow-spawn-heavy-tests-under-full-s and not this branch's doing; a recurrence
is written into the friction file beside this one.

### Pass 2 — 2026-08-18

- base: `7a0081a19f28d556372123f479f8d0baec702d7c`
- head: `304b3090757088b8c4bce8ecda8aadd04548c098`
- proof 1: met — Repaired, and repaired at the subject pass 1 said it missed: the type rather than one field
of it. On c7992617 the three named subjects still hold (src/ui/driver.ts:40 `view: PlayView`,
src/ui/agent/testHarness.ts:38 `view: PlayView`, src/ui/App.tsx:150 `standingIn` total) and both
lies pass 1 measured are gone — src/ui/driver.ts:59 is `speed: number`, :82 is `serialized(): string`
with the "null when there is no session to save" comment deleted, the dead `speed === null` guard is
out of src/ui/SettingsPane.tsx, and the `!` is off scripts/drift.test.ts:236. `npx tsc --noEmit` passes.
What makes this met rather than a third sweep of one field is that the question is now asked of the
type. Re-run with the red-green script kept at
C:\Users\yonat\AppData\Local\Temp\audit-the-shell-is-never-handed-a-missing-view-pass2-typeprobe.mjs
(`node <it> <worktree>`): 17 probes, each editing one file, running `npx tsc --noEmit`, and recording
whether src/ui/published.test.ts is named among the errors. 12 are named and are the ones that should
be — a field added to DriverSnapshot as `| null`, as `?:`, as `| undefined`, through an alias
resolving to a union and through a generic resolving to one; a property and a one-call method added to
Driver; a field added to TestState; an exemption gone stale in both directions (`live` on the snapshot,
`modal` on the harness); and three weakenings of the derivation itself, each of which reddens the
positive control at published.test.ts:51. Two are correctly silent: an array of nullables is not an
absent member, and `void` is not an absence. Two escape and are filed as findings rather than counted
here: an absence yielded through two calls, and one yielded from an inline object type literal, which
is the shape `editorMemory` at src/ui/driver.ts:95 already has in the tree.
Pass 1's three SettingsPane survivors are dead. `npm run mutate` on 2026-08-18, manifest at
C:\Users\yonat\AppData\Local\Temp\mutations-the-shell-is-never-handed-a-missing-view-pass2.json:
taking the speed control off the page KILLED, drawing a constant in place of the session's dial
KILLED, and inverting the dev gate around it KILLED — each by src/ui/render.test.tsx "draws the speed
dial on Settings, carrying the multiplier the session holds", each re-measured with the mutation still
applied. Pass 1 measured the first two as SURVIVED 0 failed of 3749.
- proof 2: unmet — Graded against the sentence as amended on 2026-08-18. The type half is met and the
mechanism of the other half is right; what fails is the headline, and it fails on an instance in the
tree rather than on a hypothetical.
src/ui/shell.test.tsx:106 and :107 are `expect(withGame.snapshot().view).not.toBeNull()` and
`expect(standingIn.snapshot().view).not.toBeNull()` — two assertions under src/ui that ask whether
there is a view, on a type that can no longer be one, with a comment above them presenting them as the
point of the case. Commit f85c80b unwrapped the `!` on :108 and left the two lines above it untouched.
The worker deleted the identical spelling from scripts/drift.test.ts:275 on this branch and recorded
why in docs/events.jsonl ("vacuous once the type is total"); the two under the directory the clause
actually names were not. This is the Deliverable's own sentence — a test written against the
impossible state that can never fail — surviving in the file the clause is about.
The rule cannot see them, and its stated reason for not needing to is false. published.test.ts:225
says "The list is the grammar's and closed by it — there is no other syntax for asking"; the spec's
amendment paragraph and the concept note in docs/audits/systems.json both say "both are closed sets,
so neither half can be missing a row". Twelve ordinary spellings escape, measured by appending them to
the rule's own SPELLINGS fixture and asking the rule — re-run with
C:\Users\yonat\AppData\Local\Temp\audit-the-shell-is-never-handed-a-missing-view-pass2-escapes.mjs,
which restores the file from bytes afterwards and carries two controls that are correctly caught:
  `renamed === void 0`                        the canonical spelling of `=== undefined`
  `renamed ??= x` and `renamed &&= x`         the assignment forms of two operators the list has
  `const { view = null } = s`                 a destructuring default, and `const { problems, remedies }
                                              = driver.snapshot()` at src/ui/driver.test.ts:537 is the
                                              house style this is one keystroke from
  `switch (renamed) { case null: }`           a question form the grammar has and the list has not
  `Object.is(renamed, null)`
  `if (s.view as Published | null)`           a cast straight into the condition
  `<T extends Published | null>`              the union put back on a type parameter
  `Array<Published | null>` and `Record<string, Published | undefined>`  the nothing put back inside a
                                              container, which the declaration half does not look into
  `const nothing = undefined; renamed === nothing`
  a default parameter standing in for it
All five of the ones worth writing typecheck under this repo's own `npx tsc --noEmit` — verified by
adding them to a scratch module under src/ui and running the gate, which reported nothing.
What the branch did build is a large, real improvement and should be said so. Every one of the seven
spellings pass 1 named now fails, including `view?: PlayView`, and so do a renamed binding and a
formatter-wrapped ternary that no line-by-line text rule can reach. Eleven aimed mutations, all
KILLED first aim (manifest above, 2026-08-18): a question put back under src/ui, one put back under
scripts, `PlayView | null` put back on the published type, one question form dropped from the grammar,
the declaration half dropped, the flow type read instead of what a binding was declared to hold, the
over-strictness guard removed so an honest question one layer down is called a violation, the walk not
descending, scripts dropped from the scanned set, the union no longer walked, and `spellingAt`
answering wrong so the fixture could not tell which spelling it caught. `vitest
src/ui/published.test.ts` passes 4 of 4, and the type half's 17-probe red-green is under c1 above.
The remedy this points at is a boundary or a derivation, not a longer list of node kinds — the
predicate is still enumerated, only in a much better alphabet.
- proof 3: met — Pass 1's evidence re-run and it still holds: `vitest src/ui/render.test.tsx` passes 28 of
28 on c7992617, where pass 1 recorded 27 of 27 on 7051d8b. The one added case is 9bac4d2's speed-dial
proof, which is a pass-1 finding against this same file being closed rather than a screen changing.
Not re-derived — pass 2 was scoped to c1 and c2 by the commissioning brief, and the three mutations
aimed at src/ui/SettingsPane.tsx under c1 above are the part of c3's surface these repairs touched.
The caveat pass 1 recorded on src/ui/driver.ts:278 is unchanged by these commits and stands as filed.
- proof 4: met — Graded on the same reading pass 1 used and recorded in docs/events.jsonl: the audit-pass
accounting cannot be turned green by any run of the gate. On c7992617: tsc ok, layer-check ok,
audit-status ok, doctor ok with 27 warnings that do not fail the leg, bytes ok, tree ok, base ok. The
six red legs are the accounting — two specs with open members and two clause tallies on
opening-a-universe-answers-rather-than-raises and the-shell-draws-what-the-session-answers, plus this
spec's own two, which clear as their passes are filed.
One thing changed since pass 1 and a reader should have it rather than re-derive it: `npm test` FAILED
on both of two runs here, not one of three. The failure is
`scripts/tasks/auditPrompt.test.ts > tasks CLI > audit-prompt prints a ready-to-use auditor prompt for
a spec`, "Test timed out in 5000ms", 3753 of 3754 passing both times. That file is untouched by this
branch — `git log 7a0081a..HEAD -- scripts/tasks/auditPrompt.test.ts` is empty — and it passes 69 of
69 in isolation in 35s. It is the fifth sighting of
npm-test-flakes-on-three-slow-spawn-heavy-tests-under-full-s, under a second auditor sharing this
machine; a recurrence is written beside this file rather than a second record. The suite is 53s wall,
well inside the five-minute rule, and the file this branch adds costs 4.4s of it.
