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

- [c3] The brief emits a mutation manifest built from the targets it resolved, runnable without editing.
  A target that did not resolve is omitted and named as omitted, because `parseManifest` refuses a
  manifest as a whole and one bad entry would cost the auditor the entire run.
  proof: vitest scripts/tasks/audit.test.ts "audit-prompt emits a runnable mutation manifest built from the resolved proof targets"
  proof: vitest scripts/tasks/audit.test.ts "an unresolved target is named as omitted rather than emitted into the manifest"

- [c4] The brief carries the diff stat, the commit list over its range, and the spec's own `## Decisions`
  section. Each was fetched by hand in pass 1 and again in pass 2; the decisions in particular exist
  to stop an auditor reopening a settled argument, and a brief that parses the spec and then omits
  them is why pass 1 opened the file anyway.
  proof: vitest scripts/tasks/audit.test.ts "the brief names the commits in its diff range and what each touched"
  proof: vitest scripts/tasks/audit.test.ts "the brief carries the specs decisions so an auditor does not reopen them"

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

## Decisions

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
