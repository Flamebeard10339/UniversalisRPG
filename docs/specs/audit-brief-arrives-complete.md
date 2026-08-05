# audit-brief-arrives-complete

## Deliverable

`npm run tasks -- audit-prompt <spec>` is the auditor's whole starting position, and two measured
audits show what it leaves an auditor to find out alone. Pass 1 of `tool-friction-backlog` ran six
test files under `--reporter=json` for 191 seconds purely to learn their names, then wrote a matcher
three times — two of them failed — to check whether the spec's `proof:` targets pointed at tests that
exist. It hunted the mutate manifest format across three commands and hand-wrote 74 lines of it. It
fetched the diff stat and commit list, opened the spec to read `## Decisions` the brief had already
parsed past, and ran `tasks where` once per changed path. Pass 2 repeated most of it, found the cheap
route to test names on its own (`npx vitest list --json`, 6 seconds), and spent 52 more grepping the
repository for where a name was used. None of that is judgment. All of it is derivable from what the
brief has already read.

The brief is not short of instructions — it is short of answers. This branch moves the line: where it
now tells an auditor what to go and check, it arrives carrying the check already done.

Half of the first clause already exists, and this branch extends it rather than rebuilding it.
`tool-friction-backlog` shipped `unresolvedTarget` and `testTitles` (`audit.ts:138-160`), which
resolve a `proof: vitest <file> "<name>"` target by searching that file's source for the title and
report two outcomes: the file is absent, or the file has no test by that name. The gap is the third
outcome. Nothing asks whether the name exists *somewhere else*, and after `audit-loop-costs-less`
splits `scripts/tasks.test.ts` — 4532 lines and still growing — every test it moves keeps its name
and changes its file. Without the third outcome that split reads as a wall of false absences, which
is the failure mode most likely to teach an auditor to stop reading the check.

Proof:

- [c1] A `proof:` target whose named file does not contain the title is searched for across the suite,
  and when the title exists elsewhere the report names the file it was found in. The cheap path is
  unchanged: `unresolvedTarget` still answers from the named file's source first, and pays for a
  wider search only once that has already failed — the same shape as mutate's escalation, where a
  narrow answer settles it and only a miss costs more.
  proof: vitest scripts/tasks/audit.test.ts "a target whose title lives in another file is told where it actually is"
  proof: vitest scripts/tasks/audit.test.ts "a target that resolves in the file it names never pays for a wider search"

- [c2] Every target resolves to exactly one of four states, each distinguishable in the output: found;
  found under another file; the named file does not exist; no test by that name exists anywhere.
  The fourth is the one that means what the current message says, and today it is spelled the same
  as the second.
  proof: vitest scripts/tasks/audit.test.ts "a title that exists nowhere is reported differently from one that merely moved"
  proof: vitest scripts/tasks/audit.test.ts "a target naming a file absent from the checkout is reported as a missing file"

- [c3] The brief emits a mutation manifest wired to the targets it resolved, and offers no guess at
  what to break. `name`, `tests` and `test` are derived, so each entry runs the test its clause
  names in the file that test actually lives in. `file` and `find` ship as sentinels `mutate`
  refuses — the file cannot be read and the text is in no file — so an entry nobody has aimed stops
  the run by name before a baseline runs. Which line a clause is about is the auditor's judgement
  and the manifest carries no candidate for it: four passes each aimed an entry as the tool
  suggested, and pass 4's suggestion produced KILLED at narrow scope with a clean scope column off
  a test fixture helper, which is the one shape the brief teaches an auditor to accept as proof. A
  target that did not resolve is omitted and named as omitted, because `parseManifest` refuses a
  manifest as a whole and one bad entry would cost the auditor the entire run.
  proof: vitest scripts/tasks/audit.test.ts "a manifest entry runs the test its clause names, in the file that test lives in"
  proof: vitest scripts/tasks/audit.test.ts "the manifest offers no guess at which line a clause is about"
  proof: vitest scripts/tasks/audit.test.ts "a manifest entry nobody has aimed is refused by mutate rather than run green"
  proof: vitest scripts/tasks/audit.test.ts "an unresolved target is named as omitted rather than emitted into the manifest"

- [c4] The brief carries the diff stat and the commit list over its range. Each was fetched by hand
  in pass 1 and again in pass 2.
  proof: vitest scripts/tasks/audit.test.ts "the brief names the commits in its diff range and what each touched"

- [c5] The brief answers ownership for the changed paths in one place: what system owns each, what
  concept claims it, and what has claimed it before. This is `tasks where` run once per path, which
  is what both auditors did by hand, batched into the read that already computed the path list.
  proof: vitest scripts/tasks/audit.test.ts "the brief answers ownership and prior art for every path in its diff"

- [c6] The brief names the tools an auditor may reach for and how to invoke each. Pass 1 grepped
  `package.json` to find out what existed. `probe`, `mutate`, `inspect`, `play-cli` and
  `session-timing` are each the answer to a question an auditor asks, and none of them is
  discoverable from the brief that expects them to be used.
  proof: vitest scripts/tasks/audit.test.ts "the brief names each tool an auditor may reach for, with the command that runs it"

- [c7] `audit-prompt` relates its slug to the branch it is run on, and says so plainly when they do not
  match. On `tasks-roadmap` all eleven slugs in `docs/specs/` printed the identical diff range, so
  the slug chose only which clause list was printed beside an unrelated diff. An auditor cannot
  detect this from the brief, which is what makes it worse than a missing feature.
  proof: vitest scripts/tasks/audit.test.ts "a slug whose spec this branch does not own is reported rather than ranged silently against HEAD"

- [c8] The steps an auditor takes are printed as a numbered procedure above the data they act on,
  one line per step, in the order taken — and the last artifact the procedure names is written by
  the brief rather than described to it. Three passes read the steps out of prose scattered through
  366 lines, and two of the three still spent a call learning the `--args-from` format from the
  tool's source. The generated pass file carries one line per clause with every value empty, and an
  empty `--proof` is refused by name, so an unfilled file stops before it records anything — the
  same bargain the manifest's unaimed `find` strikes.
  proof: vitest scripts/tasks/audit.test.ts "writes the pass file the auditor fills in, rather than describing its format"
  proof: vitest scripts/tasks/audit.test.ts "the generated pass file names every clause and is refused until its values are filled in"
  proof: vitest scripts/tasks/audit.test.ts "makes logging tool friction a numbered step rather than a line to skip"
  proof: vitest scripts/tasks/audit.test.ts "tasks audit names the step that follows recording a pass"

- [c10] Neither generated artifact is written over work an auditor has already done, and neither is
  written at all when the range is not this slug's. Both are the auditor's working copy the moment
  they touch one, and re-reading the brief mid-pass is ordinary; an existing file is kept and named,
  because a stale artifact is recoverable by deleting it and an aimed one destroyed is not. The
  manifest was already gated on `rangeIsThisSlugs` and the pass file was not, so a brief that had
  just refused to offer a manifest still handed over the file for recording a pass against a diff
  it had just said these clauses do not describe — and that is the half that writes tracked repo
  state.
  proof: vitest scripts/tasks/audit.test.ts "keeps an artifact the auditor has already worked on rather than overwriting it"
  proof: vitest scripts/tasks/audit.test.ts "offers no pass file either, in a brief that has just warned the diff is not this slugs"

- [c9] The brief prints what an auditor can act on and counts what it cannot. It carries neither the
  spec's own prose nor a list of every spec in the checkout nor a lesson in git — all three were
  measured as read-past — and closed prior-art claims are a count rather than 42 lines of decisions
  already made. Nothing is lost: step 1 names the spec file, and `tasks where <path>` still lists
  every claim in every state for a single path, which is the reader those lines were written for.
  proof: vitest scripts/tasks/audit.test.ts "sends the auditor to the spec file rather than reprinting its sections"
  proof: vitest scripts/tasks/audit.test.ts "does not teach git, having already printed the range"
  proof: vitest scripts/tasks/audit.test.ts "names one other spec to check the standing against, not every spec in the checkout"
  proof: vitest scripts/tasks/audit.test.ts "counts the closed claims in the brief rather than listing them, and still lists them for one path"

## Decisions

- Printing an answer fixes a lookup and does nothing for a judgement, and the difference is what
  three passes cost to learn. Every item the brief eliminated was a lookup — the spec list, the test
  names, the `--args-from` format. Every item that persisted needed a decision the tool does not
  make. c3 was judgement the whole time: pass 1 called it a caption problem, pass 2 a `find`
  problem, pass 3 aimed each entry exactly as instructed and got the same escalated kills. The rule
  this spec now holds to is that the brief supplies answers it can derive and says plainly which
  fields it cannot.
- c3 carries no candidate at all, after four passes and four orderings. Pass 1 called it a caption
  problem, pass 2 a `find` problem, pass 3 a `file` problem; the fix for pass 3 grouped the
  candidates by file, and pass 4 measured that the leading candidate then came from whichever file
  the clause's own task had granted itself — a test fixture helper — producing three kills at
  *narrow* scope with a clean scope column, which disabled the escalation tell that had caught
  passes 2 and 3. Each fix made the guess less wrong and the last one made it undetectable. A tool
  that cannot make a judgement should hand over the judgement, not a default. Making `file` and
  `find` derivable for real means running each named test under coverage and intersecting what it
  executes with the lines the branch added; that is computable, unmeasured, and a research task
  rather than a clause on this spec.
- A generated artifact is the auditor's the moment they edit it. Both are written once and then
  left alone, which costs a stale manifest surviving until someone deletes it — recoverable — and
  buys back an aimed manifest that re-reading the brief used to destroy silently.
- The brief prints no prose it did not compute. The deliverable and `## Decisions` sections were
  added on the theory that a pass which had them printed would not open the spec; all three passes
  opened it anyway, because a clause is graded against its own spec. Forty-one lines that changed no
  behaviour. The same test applies to the three git commands and the spec inventory, and both fail
  it.
- Closed prior-art claims are collapsed in the brief and left in full in `tasks where`. Ownership is
  one relation with two readers: a reader asking about one path wants every claim, closed ones
  included, and a reader handed a whole branch's diff wants the collisions. One query, one flag,
  rather than two answers to keep in sync.
- This branch extends `unresolvedTarget` and `testTitles` rather than adding a resolver beside
  them. The capability survey found them on `scripts/tasks/audit.ts`, already doing two thirds of
  the job; a second implementation would be the duplication `tasks produces` exists to prevent.
- The wide search is an escalation, not a replacement. `testTitles` over the named file is instant
  and right almost always; `npx vitest list --json` is authoritative and costs 2.9 seconds measured.
  Paying the second only after the first has failed keeps the common case free, and is the same
  bargain mutate strikes between a narrow scope and a wide one.
- This branch comes after `audit-loop-costs-less`. Two reasons, and both are load-bearing: the
  manifest it generates should name a test rather than a file, which is that branch's clause 1; and
  its own tests belong in `scripts/tasks/audit.test.ts`, which that branch's split is what creates.
- `task-system-refactor-pass2-audit-prompt-never-checks-the-slu` is promoted into this spec rather
  than left deferred. It is a HIGH, it is in `cmdAuditPrompt`, and a brief that silently describes
  the wrong diff undoes every other clause here.
- The three other open findings on `scripts/tasks/audit.ts` stay out. They are about how findings
  are filed and graded — `tasks import` visibility, the pass stamp on a c7 finding, evidence parsed
  as clause-scoped — which is the audit's output path, not the auditor's starting position.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-05

- base: `4314b3e7691cf732471862872188f5254725c01f`
- head: `4d53cf1adef21a843d68a9d553f407ba2d7dcb89`
- proof 1: met — Clause-targeted mutations, both KILLED by the exact test the clause names (1 failed of 77, narrow scope, no escalation): delete scripts/tasks/audit.ts:209 (the `moved:` report) kills "a target whose title lives in another file is told where it actually is"; delete audit.ts:199 (the found-in-named-file return, which is what stops the escalation) kills "a target that resolves in the file it names never pays for a wider search". Live: `npm run tasks -- audit-prompt tool-friction-backlog` on this branch resolves 29 stale `scripts/tasks.test.ts` targets to the files the suite split moved them into, naming each file; whole command 9.4s wall clock. `audit-prompt audit-brief-arrives-complete` resolves every target from the named file's source and never spawns the listing at all.
- proof 2: met — Delete audit.ts:209 and the `nowhere` and `moved` messages become identical, killing "a title that exists nowhere is reported differently from one that merely moved"; replace audit.ts:198 so a missing file returns `nowhere` instead of `no-such-file` and it kills "a target naming a file absent from the checkout is reported as a missing file". Both at narrow scope. `resolveTarget` in fact carries five distinguishable states, not the promised four - found / moved / no-such-file / nowhere / unsearchable - the fifth for a checkout whose suite will not list, which is a superset of the clause and the right call.
- proof 3: met — Exercised, not read. `npm run mutate -- %TEMP%\mutations-audit-brief-arrives-complete.json` - the file this branch's own brief generated - parsed and ran end to end with no editing: 11 entries, 8 killed, 3 survived, 0 errored, tree unchanged. Omission is delivered too: `mutationManifest` pushes an `omitted` line per unresolved target and emits no entry for it (delete audit.ts:371 and "an unresolved target is named as omitted rather than emitted into the manifest" fails). The clause promises a runnable manifest and gets one; what the verdicts inside it mean is filed as a finding below.
- proof 4: met — Delete audit.ts:538 (the commit loop) kills "the brief names the commits in its diff range and what each touched"; delete audit.ts:551 (the decisions print) kills "the brief carries the specs decisions so an auditor does not reopen them". Live brief for this spec carries `Commits in this range:` with all four commits and the files each touched, `Diff stat:` with the seven-file stat, and all five of the spec's decisions under a heading naming them as settled.
- proof 5: met — Delete audit.ts:143 (the per-path ownership line) kills "the brief answers ownership and prior art for every path in its diff". Live brief prints `Who owns each changed path:` for all seven diff paths - the three `docs/` ones as `none - it is declared unowned` - and then prior art over the four owned paths only, which is why the section is readable rather than most of the store.
- proof 6: met — Delete audit.ts:533 (the AUDIT_TOOLS loop) kills "the brief names each tool an auditor may reach for, with the command that runs it". Every one of the seven commands printed exists: `play`, `probe`, `inspect`, `mutate`, `session-timing` are package.json scripts, and `merge-ready` and `where` are `tasks` subcommands - checked, not assumed.
- proof 7: met — Replace the condition at audit.ts:417 with `if (false)` and it kills "a slug whose spec this branch does not own is reported rather than ranged silently against HEAD". Live on this branch: `npm run tasks -- audit-prompt audit-loop-costs-less` prints both warnings - the branch is working another spec, and that spec's last pass is an ancestor of this range's base so none of its work is in the diff - while `audit-prompt audit-brief-arrives-complete` prints neither, so the warning is not noise on a correct run.

### Pass 2 — 2026-08-05

- base: `4314b3e7691cf732471862872188f5254725c01f`
- head: `0d1cbda9133258eabe21ff29d0a404c3df7569f1`
- proof 1: met — Clause-targeted mutations, both KILLED at narrow scope with no escalation (1 failed of 79, scope reported as the named test alone): delete scripts/tasks/audit.ts:209, the `moved:` report in unresolvedTarget, and "a target whose title lives in another file is told where it actually is" fails; delete audit.ts:199, the found-in-named-file return that stops the escalation, and "a target that resolves in the file it names never pays for a wider search" fails on its search counter.
Cheap path measured live, not read: `npm run tasks -- audit-prompt audit-brief-arrives-complete` is 2.1s wall clock and never spawns the listing, `audit-prompt tool-friction-backlog` is 5.8s and does, the difference being the one escalation.
Rebuild the manifest with `node` from the line numbers above; the run is 12 entries in about 70s.
- proof 2: met — Delete audit.ts:209 and the `nowhere` and `moved` messages collapse into one, killing "a title that exists nowhere is reported differently from one that merely moved" at narrow scope; rewrite audit.ts:198 so a missing file returns `nowhere` instead of `no-such-file` and it kills "a target naming a file absent from the checkout is reported as a missing file". Both narrow, no escalation.
`resolveTarget`'s union carries five states, not the promised four, the fifth being `unsearchable` for a checkout whose suite will not list; that is a superset of the clause and each is distinguishable in `unresolvedTarget`'s output.
- proof 3: met — The generated manifest was run unedited, not read: `npm run tasks -- audit-prompt audit-brief-arrives-complete` wrote 11 entries to %TEMP%\mutations-audit-brief-arrives-complete.json, `npm run mutate` on a copy parsed and ran end to end, 9 killed, 2 survived, 0 errored, tree gained nothing and lost nothing. Built from the resolutions is mutation-proved: replace audit.ts:379 with `const file = resolution.file;` and "audit-prompt emits a runnable mutation manifest built from the resolved proof targets" fails on the moved entry's `tests`; delete audit.ts:371 and "an unresolved target is named as omitted rather than emitted into the manifest" fails. Both narrow.
The clause as written is delivered. What the run means is a separate matter and is filed below as a finding, because all 9 of the kills escalated past the test their clause names.
- proof 4: met — Delete audit.ts:556, the commit loop, and "the brief names the commits in its diff range and what each touched" fails; delete audit.ts:569, the decisions print, and "the brief carries the specs decisions so an auditor does not reopen them" fails. Both narrow, no escalation. The live brief for this spec carries all six commits with the files each touched, the eight-file diff stat, and all five decisions under a heading naming them settled.
- proof 5: met — Delete audit.ts:143, the per-path ownership line, and "the brief answers ownership and prior art for every path in its diff" fails at narrow scope. The live brief answers ownership for all eight diff paths, the four `docs/` ones as declared unowned, and prints prior art over the four owned paths only.
- proof 6: met — Delete audit.ts:551, the AUDIT_TOOLS loop, and "the brief names each tool an auditor may reach for, with the command that runs it" fails at narrow scope. Each of the seven commands was resolved rather than assumed: `play`, `probe`, `inspect`, `mutate` and `session-timing` are package.json scripts reading `tsx scripts/<name>.ts`, and `where` and `merge-ready` both answer as `tasks` subcommands.
- proof 7: met — Delete audit.ts:419, the branch-mismatch warning `lines.push` argument, and "a slug whose spec this branch does not own is reported rather than ranged silently against HEAD" fails at narrow scope. Exercised across the tool rather than on its own spec: `audit-prompt` on audit-loop-costs-less, tool-friction-backlog, combat-events, first-class-modals and task-system-refactor each printed the branch-mismatch warning naming audit-brief-arrives-complete as what this branch is working, three of them also printing the merged-before-this-branch warning; `audit-prompt audit-brief-arrives-complete` prints neither, so the warning is not noise on a correct run.

### Pass 3 — 2026-08-05

- base: `4314b3e7691cf732471862872188f5254725c01f`
- head: `02bcf144a31ff5c188003b7e6d81f723a81e2e95`
- proof 1: met — Two clause-targeted mutations, both KILLED at narrow scope with no escalation (1 failed of 88, scope column naming the test alone): delete scripts/tasks/audit.ts:209, the `moved:` branch of unresolvedTarget, and "a target whose title lives in another file is told where it actually is" fails; delete audit.ts:199, the found-in-named-file return that stops the escalation, and "a target that resolves in the file it names never pays for a wider search" fails on its search counter.
The escalation is measured live, not read: `audit-prompt audit-brief-arrives-complete` is 1.8s wall and never spawns the listing; `audit-prompt tool-friction-backlog` is 5.9s and does, and resolves 30 stale `scripts/tasks.test.ts` targets into the four files the suite split moved them to (14 records.test.ts, 9 audit.test.ts, 4 architectureCmds.test.ts, 3 specCmds.test.ts). `retire-superseded-spec` pays the same 5.8s for one moved target, which is the escalation's shape working as the decision describes.
- proof 2: met — Delete audit.ts:209 and the `nowhere` and `moved` messages collapse into one, killing "a title that exists nowhere is reported differently from one that merely moved" at narrow scope; rewrite audit.ts:198 so a missing file returns `nowhere` instead of `no-such-file` and it kills "a target naming a file absent from the checkout is reported as a missing file". Both narrow, no escalation, in the same 12-entry run as c1.
`resolveTarget`'s union carries five states, not the promised four — the fifth is `unsearchable`, for a checkout whose suite will not list — and each is a distinct string in `unresolvedTarget`'s output. That is a superset of the clause. Note that c2's second proof target is a pre-existing test renamed on this branch, over pre-existing `no-such-file` behaviour; only the third and fourth states are new, and both are mutation-proved above.
- proof 3: unmet — Two of the clause's five sentences are false as measured, and the failure they produce is pass 2's headline reproduced verbatim.
Delivered: the sentinel `find` works. `npm run mutate` on the manifest this branch's own brief generated was refused by name before any test ran, and the mutation proves it — replace audit.ts:436 with `find: suggestions[0].find,` and "a manifest entry nobody has aimed is refused by mutate rather than run green" fails at narrow scope. Omission is delivered too: delete audit.ts:419 and "an unresolved target is named as omitted rather than emitted into the manifest" fails.
Not delivered: "`name`, `file`, `tests` and `test` are derived and right" and "Each entry carries the lines this branch added under its clause, so aiming one is a paste". In the live 12-entry manifest, `file` is `scripts/lib/specDoc.ts` for every c3, c4, c5 and c6 entry, while c3, c5 and c6 are implemented in `scripts/tasks/audit.ts` — so no offered `note` line can be pasted without also editing `file`, which `manifestNotes` states is already right. Measured end to end: taking the generated c3 and c6 entries verbatim and aiming each exactly as instructed (paste the first offered note line over `find`) gives 2 KILLED, both with scope `scripts/tasks/audit.test.ts "<the clause's test>" -> scripts/tasks/audit.test.ts` — the named test survived and something else killed it, which the brief's own reading guide calls not that clause proving itself.
Re-run: `npm run tasks -- audit-prompt audit-brief-arrives-complete`, then for the c3 entry replace `find` with the first string in its own `note` and run `npm run mutate` on it.
- proof 4: met — Delete audit.ts:624, the commit loop, and "the brief names the commits in its diff range and what each touched" fails; delete audit.ts:642, the decisions print, and "the brief carries the specs decisions so an auditor does not reopen them" fails. Both narrow, no escalation. The live brief for this spec carries all eleven commits in the range with the files each touched, the nine-file diff stat, and all five decisions under a heading naming them settled. `archetype-mods`, the one spec in the checkout with no column-zero `Proof:` line, renders its whole deliverable as prose without error, so the `split('\nProof:')` parse degrades correctly.
- proof 5: met — Delete audit.ts:143, the per-path ownership line, and "the brief answers ownership and prior art for every path in its diff" fails at narrow scope. The live brief answers ownership for all nine diff paths, the five `docs/` and `.planning/` ones as declared unowned, and prints prior art over the four owned paths — including the three `[concept]` lines and the six open collisions on them. The clause's three enumerated questions are all answered in one place. Its equivalence claim ("this is `tasks where` run once per path") is loose and is filed as a low finding rather than graded against.
- proof 6: met — Delete audit.ts:607, the `toolLines(packageScripts())` loop, and "the brief names each tool an auditor may reach for, with the command that runs it" fails at narrow scope. The staleness check is real rather than asserted: all six named scripts — `tasks`, `mutate`, `probe`, `inspect`, `play`, `session-timing` — are present in package.json, so no entry is marked, and `toolLines` with `probe` removed emits `package.json has no "probe" script; this entry is stale`, while `toolLines(null)` marks nothing.
- proof 7: met — Delete audit.ts:483, the branch-mismatch warning's `lines.push` argument, and "a slug whose spec this branch does not own is reported rather than ranged silently against HEAD" fails at narrow scope. Exercised across the tool rather than on its own spec: `audit-prompt` on tool-friction-backlog, combat-events, tasks-roadmap, task-system-refactor and retire-superseded-spec each printed the branch-mismatch warning naming audit-brief-arrives-complete, four of them also the merged-before-this-branch warning, and all five suppressed the manifest; `audit-prompt audit-brief-arrives-complete` prints neither warning and does emit one. The suppression now reads `rangeIsThisSlugs` rather than matching the word WARNING, and the third standing (`branchSpec: null`, whose line carries no WARNING prefix) is covered by "decides the range belongs to this slug from the standing itself, not from how it is worded".

### Pass 4 — 2026-08-05

- base: `4314b3e7691cf732471862872188f5254725c01f`
- head: `0d59d5440fd6f52587bded0232c58a85d38de2a0`
- proof 1: met — Two clause-targeted mutations, both KILLED at narrow scope with no escalation (1 failed of 91, scope column naming the test alone), in a 20-entry hand-aimed run: delete scripts/tasks/audit.ts:209, the `moved:` branch of unresolvedTarget, and "a target whose title lives in another file is told where it actually is" fails; delete audit.ts:199, the found-in-named-file return that stops the escalation, and "a target that resolves in the file it names never pays for a wider search" fails on its search counter. Re-run: build a manifest naming those two lines and `npm run mutate` it.
- proof 2: met — Delete audit.ts:209 and the `nowhere` and `moved` messages collapse into one, killing "a title that exists nowhere is reported differently from one that merely moved" at narrow scope; rewrite audit.ts:198 so a missing file returns `nowhere` instead of `no-such-file` and it kills "a target naming a file absent from the checkout is reported as a missing file". Both narrow, no escalation, in the same 20-entry run as c1. `resolveTarget`'s union still carries five states, the fifth being `unsearchable`, which is a superset of the clause.
- proof 3: met — All four targets KILLED at narrow scope, no escalation, in the same 20-entry run: replace audit.ts:437 `tests: [file],` with `tests: [resolution.file],` and "a manifest entry runs the test its clause names, in the file that test lives in" fails on the moved entry; delete audit.ts:451, the byFile grouping loop, and "offers candidate lines grouped under the file each came from" fails; replace audit.ts:435 `find: UNRETARGETED,` with `find: suggestions[0].find,` and "a manifest entry nobody has aimed is refused by mutate rather than run green" fails; delete audit.ts:418, the omitted.push, and "an unresolved target is named as omitted rather than emitted into the manifest" fails.
Live: the brief for this spec wrote 20 entries to %TEMP%\mutations-audit-brief-arrives-complete.json, every one carrying tests ["scripts/tasks/audit.test.ts"] and `test` set to its clause's own test name, every `find` the UNRETARGETED sentinel, and every `note` grouped by source file. `npm run mutate` on it unedited is refused by name before a baseline runs.
Graded against the clause as written after the "c3 shrinks to wiring" decision, which this pass does not reopen. What the clause does not promise, and what is measurably still broken, is filed as the HIGH finding below: `file` ships pre-filled (specDoc.ts for every c3-c6 entry, cliFixtures.ts for every c8-c9 entry), and aiming an entry exactly as its own note instructs produces KILLED at narrow scope off a test-fixture line.
- proof 4: met — Delete audit.ts:685, the commit loop, and "the brief names the commits in its diff range and what each touched" fails at narrow scope, no escalation. The live brief for this spec carries all seventeen commits in the range with the files each touched, and the twelve-file diff stat. The `## Decisions` print this clause's pass-3 evidence also named is gone by decision (c9), and the clause does not promise it.
- proof 5: met — Delete audit.ts:143, the per-path ownership line, and "the brief answers ownership and prior art for every path in its diff" fails at narrow scope. The live brief answers ownership for all twelve diff paths, the seven docs/, CLAUDE.md and .planning/ ones as declared unowned, and prints prior art over the five owned paths — three [concept] lines, six open collisions, three unreviewed, and "45 closed claim(s) not listed" as a count.
- proof 6: met — Delete audit.ts:677, the `toolLines(packageScripts())` loop, and "the brief names each tool an auditor may reach for, with the command that runs it" fails at narrow scope. The staleness check is derived rather than asserted: `toolLines` with `probe` removed emits `package.json has no "probe" script; this entry is stale`, `toolLines(null)` marks nothing, and all six named scripts are present in package.json so the live brief marks none.
- proof 7: met — Delete audit.ts:527, the branch-mismatch warning's `lines.push` argument, and "a slug whose spec this branch does not own is reported rather than ranged silently against HEAD" fails at narrow scope. Live: `npm run tasks -- audit-prompt tasks-roadmap` on this branch prints both warnings — the branch is working audit-brief-arrives-complete, and tasks-roadmap's last pass at 71c5aed is already an ancestor of base 4314b3e — and suppresses the manifest with "No mutation manifest: the diff above is not tasks-roadmap's". `audit-prompt audit-brief-arrives-complete` prints neither and does emit one. What the same run also does, which the clause does not cover, is filed as a finding: the pass file and steps 4 and 7 are not gated on `rangeIsThisSlugs`.
- proof 8: met — Three of the four targets KILLED at narrow scope, no escalation, in the 20-entry run: delete audit.ts:476, the `--proof N=` push, and "the generated pass file names every clause and is refused until its values are filled in" fails; delete audit.ts:668, step 8, and "makes logging tool friction a numbered step rather than a line to skip" fails; delete audit.ts:1162, the `nextAfterPass` print, and "tasks audit names the step that follows recording a pass" fails.
Live: the brief for this spec is a numbered 1-8 procedure printed above the data, and it wrote %TEMP%\audit-audit-brief-arrives-complete-pass4.txt carrying `# Pass 4 on audit-brief-arrives-complete`, one `--proof N=` and one `--evidence N=` line per clause for all nine, every value empty, and the finding block commented out. Running it unfilled is refused with "names no verdict" before anything is recorded. `audit-prompt tasks-roadmap` freshly wrote audit-tasks-roadmap-pass3.txt at 09:27, so the write is live and not a cached artifact.
The fourth target does not hold and is filed as a finding: delete audit.ts:651, the writeFileSync of the skeleton, and "writes the pass file the auditor fills in, rather than describing its format" SURVIVED to whole-suite scope, 0 failed of 1613, because it reads %TEMP%\audit-demo-spec-pass1.txt, which earlier suite runs left on this machine.
- proof 9: met — Three of the four targets KILLED at narrow scope in the 20-entry run: delete audit.ts:656, step 1, and "sends the auditor to the spec file rather than reprinting its sections" fails; delete audit.ts:633, the `Diff range:` print, and "does not teach git, having already printed the range" fails; replace audit.ts:150 with `printPriorArt(priorArt(arch.manifest, tasks, owned));` and "counts the closed claims in the brief rather than listing them, and still lists them for one path" fails.
Live: the brief for this spec is 266 lines against the 366 pass 3 recorded, carries no `## Deliverable` prose and no `## Decisions` section, prints no git command (no `- git diff `, no `- git log -p `), names two other slugs plus `ls docs/specs` rather than the inventory, and renders the closed prior art as "45 closed claim(s) not listed" while `npm run tasks -- where scripts/tasks/audit.ts` still lists every one.
The fourth target does not hold and is filed as a finding: replace `otherSpecs.slice(0, 2)` with `otherSpecs` at audit.ts:702 and "names one other spec to check the standing against, not every spec in the checkout" SURVIVED to whole-suite scope, 0 failed of 1613.
