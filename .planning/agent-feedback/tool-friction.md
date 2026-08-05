# Tool friction

Raw notes on where the tooling — repo scripts, the agent harness, the CLI — cost time or
produced a wrong state. Each entry is something that actually happened, not a speculative
improvement. One section per session, newest last.

An entry leaves this file when a spec clause has taken it over, and the clause carries its evidence
verbatim; `git log -- .planning/agent-feedback/tool-friction.md` holds the original wording. The
2026-07-28 through 2026-08-04 entries were drained into `docs/specs/tool-friction-backlog.md` at
`f004048` — twenty entries into sixteen clauses, plus one that was already fixed before the drain
(`audit-prompt` naming two log paths that did not exist, repaired in `605b868`).

## Entries

<!-- Append below. Newest last. Name the pass and the date. -->

## `tool-friction-backlog` planning, 2026-08-04

Decomposing a sixteen-clause spec into seven slices, and the friction was in the two places the
tool could not answer a planner's question at all.

### A task cannot name which proof clauses it discharges

The whole output of a decomposition session is a map from clauses to the tasks that owe them, and
there is nowhere to put it. `Task` has a `clause` field, but `tasks add` hardcodes `clause: null`
(`records.ts:107`) and no verb offers a `--clause` flag; the only writer is `audit`, which sets it
on the `undelivered` records an `unmet` verdict creates (`audit.ts:538`). So the mapping went into
each task's `deliverable` prose as "Clauses 3, 6, 12, 15, 16", where nothing can read it back.

The cost is not this session's — it is the next one's. `tasks spec show` prints sixteen clause
standings and twelve members and cannot join them, so "who is delivering clause 9" is a prose
search across twelve deliverables, and "which clauses has this branch not assigned to anyone" is
not answerable at all. The audit then grades clauses against a diff without knowing which slice
promised each one.

Worth considering: `--clause` on `add` and `edit`, accepting several, and `spec show` printing the
owing task beside each standing. The field, the parse and the display all exist; only the planner's
half of the write is missing. Whether an unassigned clause should be a `plan` note is the open
question — it is the one shape of decomposition defect `plan` cannot currently see.

### `spec show` answers "no proof clauses" when the list is numbered instead of bulleted

Rewriting the spec's `## Deliverable` with `1.`-style numbered clauses — the natural markdown for a
list whose items are referred to by number — silently produced `(no proof clauses — --full prints
the whole ## Deliverable)` and a clause standing of `no clause to grade`. All sixteen clauses were
present under a `Proof:` line; `scanProofClauses` matches `/^- (.*)$/` (`specDoc.ts:97`) and nothing
else, so the whole set read as prose.

The failure is quiet in the direction that matters: the spec file still looked right, `tasks spec
show` still exited zero, and had the edit been made without checking, the branch would have carried
a contract of zero clauses into its audit. It was caught only because the read immediately after
the write was for a different purpose.

Worth considering: `scanProofClauses` already knows it found a `Proof:` heading. When the lines
under it are non-empty and none of them matched, say so — `Proof: found, but no line under it
begins with "- "` — rather than reporting the same thing an absent `Proof:` heading reports. Same
shape as the near-miss refusals in clause 7: the reader has the evidence in hand and prints a bare
negative.

### `roadmap` reports a spec as waiting on its own members

After the decomposition, `tool-friction-backlog`'s row reads `waits on record-verbs-say-back (spec
tool-friction-backlog), roadmap-shows-settled-work-pass1-wrapunder-computes-its-wrap (spec
tool-friction-backlog), …` — four ids over five wrapped lines, every one of them a member of the
spec doing the waiting. The state cell is correct (`ready`), and the annotation does say which spec
each blocker belongs to, so nothing is wrong; it is just that the line a reader scans to learn what
blocks a spec is spending five lines saying "some of its members are ordered behind others", which
is what `requires` is for and what step 4 of `docs/workflow.md` asks every planner to produce.

Every other spec on the roadmap names external work there. This is not a regression — it is the
first row rendered for a spec that has actually been decomposed, so the case had not arisen. It
also sharpens `roadmap-shows-settled-work-pass1-the-record-caps-bound-how-m`, already promoted into
this branch: that finding measured an uncapped row on a synthetic store, and this is the same
uncapped list on the real one.

Worth considering: `blockerText` filters blockers whose `spec` equals the row's own spec, and says
`N member(s) ordered behind others` if it wants to say anything at all. The annotation it already
prints is the evidence that it knows which ones they are.

### `npm run mutate` cannot find vitest from a git worktree

Every one of twelve mutations came back `ERROR — could not read a test tally out of the run`, with
a `MODULE_NOT_FOUND` stack under each. `mutate.ts:481` spawns
`path.join(repoRoot, 'node_modules/vitest/vitest.mjs')`, and a worktree cut under
`.claude/worktrees/` has no `node_modules` of its own — only an empty directory left by the spawn.
`npx vitest` and `npm test` both work there, because node's resolution walks up to the main
checkout's `node_modules`; the hardcoded join is the one path that does not.

The report is honest — `errored`, not `survived`, so nothing was falsely certified — but the twelve
stack traces bury the one fact that would fix it, which is that the file it tried to run is not
there. The cost was one full mutation run plus the archaeology; the fix was a junction, and the
tool never suggested one.

Worth considering: resolve vitest the way node would rather than by joining to `repoRoot` — or,
when that join misses, say `no vitest at <path> — this looks like a worktree without its own
node_modules` once, before running anything, instead of once per mutation as a stack trace. Same
shape as clause 8: a refusal that holds the information the caller needs and prints something else.

## `prior-art-by-path` worker, 2026-08-04

### `git worktree remove` follows a junction and deletes the main checkout's `node_modules`

On Windows, never `git worktree remove` a worktree that contains a junction. Unlink the junction
first — `rmdir` on a junction removes the link and leaves the target alone:

    cmd //c "rmdir .claude\worktrees\<name>\node_modules"

then remove the worktree.

The part worth noticing: that junction only ever existed because of the `mutate.ts` bug —
`path.join(repoRoot, 'node_modules/vitest/vitest.mjs')` instead of resolving the way node does.
The first worker measured that `npm test` and `npx vitest` work fine from a worktree with no
junction at all; the junction was a workaround for one hardcoded path, and the workaround is what
wiped the dependencies.

So the fix already folded into `load-path-tool-refusals` retires this whole failure class, not just
twelve errored mutations. That raises its priority: it is cheap, `scripts/lib/tsxCli.ts` is the
in-repo pattern for it, and until it lands every worker that reaches for mutation testing recreates
the hazard.

### `npx tsx -e`'s silent exit is not an inconvenience, it erases a stored field

Appending one sentence to `load-path-tool-refusals`' `evidence` meant reading the current value
first, and the obvious read was `EV=$(npx tsx -e "import { loadStore } … process.stdout.write(…)")`.
That is the exact call clause 14 already describes: it exits 0 with no output and no error. So `$EV`
was the empty string, `tasks edit --evidence "$EV <new sentence>"` was a well-formed command, and
`edit` correctly reported `edited load-path-tool-refusals: evidence` while replacing 1011 characters
of measured evidence with 350. It was caught by reading the record back; nothing in the chain said
anything was wrong, because nothing in the chain was wrong.

Recovery was `git show HEAD:docs/tasks.jsonl` and a `node -e` over plain JSON — no repo imports, so
it worked. The store being versioned with the code is what made this a two-minute repair rather than
a loss, which is the argument for that design and not a reason to leave the hazard.

The clause already asks for repo-resolved evaluation and is owned by `expression-inspector`. What
this adds is the severity: a silent empty result feeding a write command is a data-loss shape, not a
convenience gap, and it is reachable by any session that composes a read into an `edit`. Worth
considering alongside it: `edit` refusing an `--evidence` that would shrink a non-empty field by an
order of magnitude, the way a diff tool asks before discarding. That is a guess at a rule and the
repo is right to resist new gates — but the failure it would have caught is recorded here now, which
is the evidence a gate is supposed to earn its place with.

### A `proof:` target naming no test is green, not red

Verifying `tool-friction-backlog`'s clauses meant running each `proof: vitest <file> "<name>"` the
brief points at. `npx vitest run scripts/tasks/mergeReady.test.ts -t "merge-ready fails on a dirty
tree"` reports `Test Files 1 skipped (1) / Tests 12 skipped (12)` and exits 0. Nothing distinguishes
that from a target that ran and passed, so an auditor doing exactly what the brief says can record
`met` on the strength of a command that asserted nothing. Forty of that spec's forty-nine targets are
in this state, which is how it was noticed at all: the count was too high to be coincidence.

The audit's own findings cover the drifted names. What belongs here is the harness half — a filter
that matches nothing is indistinguishable from a filter that matches and passes, so the drift is
undetectable at the moment it matters. Whether the answer is `--allowOnly`-style strictness, a
`doctor` read over `proofTargets` (which today only `audit.ts` reads, and only to print), or nothing
at all, the fact is that the one mechanism the spec's `## Decisions` defends as "a declaration to the
auditor" has no way to say it has gone stale.

### `npm run mutate` escalating survivors past the tool timeout

A nine-mutation manifest over `scripts/tasks.test.ts` and `scripts/tasks/mergeReady.test.ts` ran past
the 600-second harness timeout and had to be backgrounded. The cost is correct and by design — two
survivors each escalate to the whole suite, and the whole-suite baseline is measured once — but it
means a mutation-testing pass is not a foreground command at this size, and an auditor budgeting
against the repo's five-minutes rule will guess wrong. Splitting the manifest by scope, so survivors
in one file escalate without dragging the rest, was the workaround. Worth a line in the tool's own
usage that a survivor costs a whole-suite run, since the manifest is written before anyone knows
which mutations will survive.

## `tool-friction-backlog` auditor, pass 2, 2026-08-04

### `mutate`'s narrowest scope is a file, and one file here is the whole suite

Eleven mutations scoped to `scripts/tasks.test.ts` took roughly twenty minutes. `scripts/tasks.test.ts`
alone runs in 93 seconds — the whole 59-file suite runs in 92, because it is 315 CLI tests each
spawning a process — so "name a narrow scope" bought nothing, and every mutation paid a full-suite
cost to be killed by one test.

`Mutation.tests` takes file paths and hands them to `vitest run`. There is no way to say "this
mutation can only be killed by these three tests", which is exactly what the manifest author knows and
`vitest -t` already accepts. A `-t` field passed through would have turned twenty minutes into about
one, and the verdict would be sharper: `1 failed of 315` does not say which test, so confirming *which*
test holds a behaviour still needs a second run by hand. That second run is what this pass needed to
establish that clause 19's five named proof targets do not hold its fix — the mutation reported KILLED,
and only a hand-run `vitest -t` over the five named targets showed that none of them was the killer.

### `npm run inspect`'s refusal of `require` is a raw ReferenceError

`npm run inspect -- "require('./scripts/tasks/audit')"` answers `ReferenceError: require is not
defined`. The usage does say to reach a module with `load`, but the failure is silent about it, and
`require` is what a reader who has not read the usage will try first. Same shape as clause 8: the
command knows the answer — there is exactly one way in and it is named in the usage two lines above —
and prints the runtime's error instead of it.

## 2026-08-05, auditing `audit-loop-costs-less` (pass 1)

### The brief requires a command the honest path cannot make pass

`audit-prompt` prints "Required commands (all must pass): `npm run tasks -- merge-ready`" to an
auditor whose spec has, by construction, no recorded audit pass yet — so the spec and clauses legs
are red before the auditor has done anything, and stay red after an honest `unmet` is filed. The
requirement is satisfiable only on the all-met path. The brief should either scope the requirement
to the legs an auditor can influence (tsc, tests, layer-check, audit-status, doctor, bytes) or say
what it means: run it, and read every leg that is not about this audit's own outcome.

Positive: the new named-test mutation scope did what it promised. Eight targeted mutations, each
scoped to one named test, ran in 34 seconds total (16 vitest invocations including baselines), and
the manifest refusal caught nothing this pass but the `ran === 0` seam was mutation-verified. The
same manifest against file scopes would have cost ~15 minutes on the old tool.

## planner-meets-the-record pass 1 (2026-08-05)

`npm run mutate` reported "(1 test(s) were already failing before this mutation)" against its
whole-suite baseline, while `npx vitest run` immediately before and after gave 1600 passed of 1600
in 69 files. Either the baseline scope is measured under a condition the direct run is not, or one
test is flaky only under the mutate harness. Either way the note reads as a real pre-existing
failure to an auditor and cost a full extra suite run to disbelieve. It should name the test.

`tasks audit --args-from` handled seven findings and eleven verdicts with long evidence in one call
with no trouble — the continuation-line rule made multi-sentence evidence practical, which is the
thing that would otherwise have forced a report document.

`tasks add --store <path>` only parses `--store` after the verb, not before it. `npm run tasks --
--store <path> add ...` fails with `unknown command: --store` even though `GLOBAL_USAGE` prints it
as a global. Reaching a proof command that writes (c11's `add`) without touching the real store took
two attempts to discover that.

## 2026-08-05, auditing `audit-brief-arrives-complete` (pass 2)

### `inspect` resolves a relative import from `scripts/`, not from the repo root

`npm run inspect -- "await import('./scripts/tasks/audit.ts')"` fails with
`Cannot find module .../scripts/scripts/tasks/audit.ts`. The expression is evaluated inside
`scripts/inspect.ts`, so a path an auditor copies out of the brief — which prints every path
repo-relative — has to have its `scripts/` prefix stripped by hand. `require` is also undefined,
which is the friction already logged above one release earlier. The suggestion the error prints
("Did you mean `./tasks/audit.ts`?") is what saved it, so the cost was one round trip rather than
three, but a repo-root-relative resolution would have cost none.

Positive: `mutate`'s escalation chain in the scope column is what made this pass's headline
measurable. Nine kills that each read `[... "<the clause's test>" -> scripts/tasks/audit.test.ts]`
say plainly that no clause's own test noticed its own mutation, and no other tool in the repo
reports that. Twelve hand-retargeted mutations cost 70 seconds end to end.

## 2026-08-05, auditing `audit-brief-arrives-complete` (pass 3)

### `mutate` leaves its journal behind when it refuses, and the next run reverts the tree to it

Measured, twice, in a clean tree. The first `npm run mutate` of this pass printed
`recovered 2 file(s) left mutated by an interrupted run: scripts/tasks/audit.ts,
scripts/lib/specDoc.ts` and exited on a find-miss refusal. `git diff --stat` then showed
89 lines gone from `audit.ts` and 5 from `specDoc.ts` — commit 8cbd399, reverted, in a tree
that was clean a second earlier. `git checkout` restored it; the *next* run reverted it again,
because the refused run had written a fresh journal from the already-reverted bytes.
Two `git checkout` cycles plus a manual `rm` of `%TEMP%\universalis-mutate-*.json` to get out.

`main()` takes the journal as a lock before reading anything (mutate.ts:615-636) but the refusal
exit at mutate.ts:664-668 returns without the `rmSync(JOURNAL)` the success path does at :700.
Cost: ~12 minutes and two near-misses on committed work. It is invisible — the recovery line is
one stderr line above the refusal, and nothing says a *tracked* file was overwritten.

### The generated manifest cost a hand-written one, for the third pass running

12 of 12 entries had to be rewritten to grade anything: `file` names `scripts/lib/specDoc.ts` for
c3, c5 and c6, whose implementation is in `audit.ts`, so no offered `note` line could be pasted
without editing `file` too — which `manifestNotes` says is already right. Hand-writing the 12
correct entries with `node` took 4 minutes; the run was 45 seconds, 12 killed, 0 escalations.
Pass 1 and pass 2 each wrote their own manifest as well, and the finding filed for that is
recorded done.

Positive: the sentinel `find` works exactly as promised. The generated manifest, run unedited,
was refused by name before a single test ran — the "green run that proves nothing" route is
genuinely closed. And `mutate`'s scope column remains the only thing in the repo that can tell
a real clause proof from an escalated one; it is what made this pass's headline measurable in
50 seconds.

## 2026-08-05, auditing `audit-brief-arrives-complete` (pass 4)

### The generated manifest cost a hand-written one, for the fourth pass running

Same shape as pass 3, different wrong answer. All 20 entries had to be rewritten: `file` ships
`scripts/lib/specDoc.ts` for every c3-c6 entry and `scripts/tasks/cliFixtures.ts` for every c8-c9
entry, and both are wrong — those clauses are implemented in `audit.ts`. Building the 20 correct
entries with `node` off line numbers took 4 minutes; the run was 20 entries in about 6 minutes
wall (20 named-test baselines plus a file and a whole-suite baseline the two survivors forced),
18 killed narrow, 2 survived. The survivors are the pass's two medium findings, so the escalation
cost bought something.

The 48KB manifest is the other half of the cost. 20 entries carry 3 distinct `note` values of
~2KB each, because candidates are per-clause and most clauses share an ordering — so 17 of the
20 notes are a byte-for-byte repeat of one of the other three. Reading the manifest to aim it
means scrolling past the same 2KB paragraph seventeen times.

### `Write` refuses a file this session created through `Bash`

The brief's step 7 hands over a generated pass file and says fill it in. `Write` on that path
failed with "File has not been read yet" even though the same session had just `cat`ed it — the
harness tracks reads per tool, not per session. One wasted round trip, fixed by a 5-line `Read`.

Positive: `mutate`'s escalation chain is still the only thing in the repo that separates a real
clause proof from an accident, and this pass leaned on it twice. Both survivors read
`"<the clause's test>" -> <file> -> whole suite`, which is what turned "the test looks fine" into
two filed findings. But it is not sufficient any more: the HIGH this pass files is three kills
that came back at *narrow* scope off a test-fixture line, with a clean scope column. The tell
that caught pass 2 and pass 3 does not fire on it.

## 2026-08-05, auditing `audit-brief-arrives-complete` (pass 5)

### The manifest cost 4 minutes of judgement and nothing else, for the first time in five passes

26 entries, all sentinels, nothing to undo. Deciding which line each clause is about took about
4 minutes across two source files; the `node` script that stamped those 26 decisions into the
manifest was 40 lines and ran once. Passes 1-4 each spent that same 4 minutes *plus* the work of
detecting and unpicking a wrong pre-filled `file`. Removing the guess did not move the cost, it
removed a second cost that was sitting on top of it. The run was 28 entries in 5m40s wall — 26
named-test baselines and no escalation — 28 killed, 0 survived.

The 48KB manifest of pass 4 is now 6KB. Aiming it meant reading 26 four-line entries instead of
scrolling past the same 2KB `note` paragraph seventeen times.

### A brief that keeps its artifacts drops the paragraph explaining them

Re-reading the brief mid-pass is what c10 was written for, and it works. But on the kept path the
four `manifestNotes` lines are replaced by the kept sentence, so the second read of the brief no
longer says what `file` and `find` are for or that a kill by another line proves nothing. Measured
here by running `audit-prompt` twice with the manifest aimed in between. Filed as a medium.

### Two probes outside the clause's targets cost 40 seconds and closed a doubt

`recoveryStanding`'s three arms looked individually redundant on reading — the moved-HEAD arm
appeared to catch everything the other two name — so two extra manifest entries were added beside
the 26. Both came back KILLED. That is the cheapest form this tool takes: an entry costs one
baseline and answers a question reading the code could not.

Positive: `npm run mutate` on the unaimed generated manifest was refused for all 26 entries and
left no journal behind — `ls %TEMP%\universalis-mutate-*` found nothing afterwards. That is c11's
whole promise, measured in one command, and it is the first pass where running the generated
artifact as-is was safe to do.

