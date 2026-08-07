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

## 2026-08-06, auditing `the-task-store-survives-parallel-branches` (pass 1)

### The generated brief's tooling cost nothing this pass — the friction was all in constructing an
### adversarial git-merge scenario by hand, outside anything the tool offers

`audit-prompt`, `mutate` and `merge-ready` all ran clean on the first try, no wrong `file` guesses,
no argv-length wall, no escaping round-trip. The one instruction ("run the diagnostic on this spec
slug and do what it says") worked exactly as advertised.

The real cost was outside the generated brief: the task asked whether c5's claim — "two branches
inserting adjacent ids" is the *only* remaining conflict shape — actually holds, and answering that
meant writing a standalone script that spawns real git (init/commit/branch/merge) to construct
scenarios the shipped tests do not cover, then sweeping a parameter (the gap between an edited line
and an inserted one) to find the actual boundary. That took four throwaway scripts and about the
same wall-clock as the rest of the audit combined, because the first two attempts controlled the
wrong variable (array-splice position instead of the id the record actually sorts by, since
`saveStore` always re-sorts regardless of array order — the array position tells you nothing about
where the line lands). There is no tool in this repo for "construct an adversarial merge and see
what breaks" — `mutate` breaks a named line and asks whether a *named test* notices, which is a
different question from "does the property the clause asserts actually hold at the boundary the
shipped test doesn't visit." That gap is inherent to what a residual-boundary claim is: nobody can
generate the adversarial case from the clause text, because the clause text is exactly the thing
being checked. Worth naming anyway, since this is the second audit pass in this log where the
generated tooling was clean and the real work was outside it (see `audit-brief-arrives-complete`
pass 5's `recoveryStanding` probes) — the shape recurs, and `mutate` covers "did anyone test this
line" but not "did anyone test this line under the case that breaks it."

### Mutation testing caught something the brief's own instructions predicted but I did not expect
### to actually see: two clause-proof tests surviving their own scope

`mutate`'s escalation-chain warning (`"<a test>" -> <a file>` "is not that clause proving itself")
is printed in every generated brief, so I expected to eventually hit it and treat it as boilerplate.
This pass it fired for real, on two different clauses (c4, c5), for the same root cause: both
tests hand-splice their branch arrays already in id-sorted order, so mutating away `saveStore`'s
sort changes nothing they observe. Filed as a medium finding rather than reworking the tests myself
— the fix (build the arrays out of order, the way c1's own test does) is small, but it is the kind
of change that should sit next to the clause it is proving, not be made by an auditor mid-pass.

## 2026-08-06, auditing `the-task-store-survives-parallel-branches` (pass 2)

### The generated tooling stayed clean two passes running; `mutate`'s escalation chain again
### surfaced the one thing worth finding, this time in code the six clauses do not cover

`audit-prompt`, `mutate` and `merge-ready` again ran with no wrong `file` guesses and no wall. A
six-entry hand-built manifest (one per clause, each aimed at a named test) confirmed pass 1's
mutation-gap finding is actually fixed: c4 and c5 both now KILL at their own named-test scope,
where pass 1 caught them surviving to file scope. That took one `npm run mutate` call and cost
nothing.

The real finding this pass came from a second manifest built to check `orderIndependence.test.ts`
— the new property test the spec's clauses do not name, covering the roadmap.ts/producers.ts
seq-tie-break generalization a coordinator asked for mid-branch (137245b). Removing roadmap.ts's
seq tie-break term SURVIVED all the way to the 1667-test whole suite; the equivalent producers.ts
mutation was KILLED at its own named-test scope. Reading why: `roadmapView`'s `topics` sort runs
on `listQueue`'s output, which is already seq-sorted, so JS's stable `Array.prototype.sort` makes
the redundant tie-break unobservable — no test in the repo, existing or addable at that call site,
can currently kill it without changing how `topics` composes with `listQueue`. `mutate` is what
made this checkable in one command (a scoped manifest, escalate-on-survive) rather than a manual
`git stash`-and-rerun loop; the reasoning about *why* it survives still had to be done by hand,
same shape as pass 1's note about adversarial-scenario construction being outside any tool here.

Two probes beyond the six clauses (this pass's own idea, not prompted by the brief) — my own
standalone real-git-merge harness sweeping edit-edit, delete-delete, delete-edit and edit-delete
adjacency, plus first/last-record file edges, none of which the shipped tests build — cost about
15 minutes total (four throwaway `node -e` scripts, one bug in the first draft where "gap" was
computed against the wrong index for an edit-shaped side) and confirmed c5's boundary claim holds
outside the fixtures its own tests happen to look at. Positive: this generalizes pass 1's note —
a clause claiming a boundary needs its boundary re-derived by hand every pass, because the
adversarial case is exactly what the clause text cannot generate about itself.

## 2026-08-06, auditing `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal` (pass 1)

### `mutate` needed a hand-built manifest again — no proof target resolved one — and every clause
### KILLED at its own named-test scope; the real finding came from testing the reason requirement
### as an attacker rather than as a reader of the tests that already exist

`audit-prompt` wrote no manifest (`Mutation manifest: none — no proof target on this spec
resolved to a test this brief could name`), same shape as prior passes on other specs: a `proof:
vitest <file>` line names a file, not a test, so `mutationManifest` has nothing to resolve without
a `--show`-style target. Building the seven-entry manifest by hand (one `find`/`replace` per
clause, aimed by reading the diff rather than guessing) cost about ten minutes and all seven
KILLED at their own named `it(...)` — no escalation to file or suite scope, which the brief
specifically flagged as a defect pattern seen elsewhere this round. Positive result, first time
this reads clean end to end.

The finding that mattered came from doing what the brief asked rather than what the tests check:
"try recording a deferral with an empty reason, with whitespace, through the interactive walk as
well as the flag path." The tests only exercise a truly-empty `--evidence`; a whitespace-only one
(`--evidence 1="   "`) sails through the flag/file path (untrimmed in `clauseScoped`) while the
interactive walk correctly rejects it (`.trim() || null` already there). Reproducing this needed a
disposable git fixture outside the test harness — `cliFixtures.ts`'s `fixture()` runs audit
in-process against a temp dir but has no exposed way to pass a raw whitespace string through a
shell-quoted flag from outside a `.test.ts` file, so I built a throwaway `git init` + `--store`/
`--systems`/`--specs-dir`/`--branch` scratch repo by hand, mirroring the fixture's own shape, and
ran the real CLI against it. `npm run inspect` was useful for a second thing: calling the real,
unmodified `runMergeReady` directly with a stubbed `BranchStanding` to read c7's actual output
line rather than trusting the unit test's assertion — but it only accepts plain JS (the source
runs through `new Function`, not tsx's transform), so a first draft with TypeScript type
annotations in the body failed with an unhelpful "neither an expression nor a body of statements"
parse error before I dropped the annotations. Worth noting for the next pass that reaches for it.

## 2026-08-06, auditing `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal` (pass 2)

### The hand-built mutation manifest and `cliFixtures.ts`'s `fixture()` both paid off again; the
### bypass this pass found lived one layer below where pass 1 stopped — inside `trim()` itself

`audit-prompt` again wrote no manifest for the same reason as pass 1 (`proof:` names a file, not a
test); building the seven-entry manifest by hand cost about ten minutes, reusing the exact
`file`/`find` targets the brief's own proof text pointed at for six of the seven entries, and all
seven KILLED at their own named `it(...)`, no escalation — a clean read both passes running.

The brief's framing ("tabs, newlines, non-breaking or zero-width characters, a value that is only
punctuation") was the whole finding: `clauseScoped`'s fix trims `String.prototype.trim()`, which
strips ECMA-262 `WhiteSpace`/`LineTerminator` — that set happens to include NBSP (U+00A0) and BOM
(U+FEFF), so those are closed for free — but not the Unicode zero-width/format family (U+200B
zero-width space, U+200C/U+200D ZWNJ/ZWJ, U+00AD soft hyphen, U+2060 word joiner, U+200E LRM,
U+180E). A bare zero-width space as `--evidence` trims to a one-character non-empty string and
sails through the same `!verdict.evidence` check pass 1 found bypassed, indistinguishable from
empty in a terminal, an editor, or the merged spec file. `node -e` one-liners found the character
class in under five minutes (`"​".trim().length` is 1, not 0); confirming it against the real
CLI needed three short scratch `.test.ts` files built on `cliFixtures.ts`'s `fixture()` and
`auditWith()` (one per input route: direct flag, `--args-from` file, interactive walk piped
through `auditWith`), each written, run once with `--reporter=verbose` to read the captured
`console.log` output, then deleted — `fixture()`'s exposed `audit`/`auditWith` helpers made this
faster than the git-scratch-repo route pass 1 needed, since the whitespace-string quoting problem
pass 1 hit doesn't apply to a value that's a single non-ASCII character typed directly into a
`.ts` file. `auditWith`'s first positional argument is the piped stdin, not part of `args`; passed
no spec slug on the first attempt and got the command's own usage string back rather than a
clause prompt, cost about two minutes to notice the fixture's calling convention (`args` needs
`'demo-spec'` first, same as `audit`) from an adjacent passing test rather than from an error
message naming the omission.

## 2026-08-06, auditing `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal` (pass 3)

### `npm run inspect` plus `cliFixtures.ts`'s `fixture()`, chained together, found the third gap in
### under fifteen minutes; the mutation manifest cost the same ten minutes as the last two passes
### for the same reason, and the one route to the real finding was checking a category the fix's
### own commit message named but did not close

`audit-prompt` again wrote no manifest for the same reason as passes 1 and 2 (`proof:` names a
file, not a test); the seven-entry hand-built manifest, one clause reused verbatim from the prior
passes' targets, cost about ten minutes and all eight mutations (seven clauses plus a second cut
at c2's own regex) KILLED at their file's own scope with no escalation to the whole suite —
`npm run mutate` backgrounds cleanly past its own 120s foreground timeout with no extra ceremony,
which the first two passes did not need to lean on.

The finding came from reading 01e04a1's own commit message as a spec rather than as an answer:
it names "category Cf" three times and never mentions Cc (Control) at all, so the obvious next
question was whether the fix's regex, `[^\s\p{Cf}]/u`, treats Cc the way it treats Cf. `npm run
inspect` answered that in one call — a scratch `.js` file piped through `npm run inspect -- -`
(stdin mode; the `"<expr>"` positional form does not accept a multi-line script) with `hasVisibleContent`
imported via `load('scripts/tasks/audit.ts')`, testing a dozen candidate characters
(control codes, an unpaired surrogate, a lone combining mark, RTL overrides, punctuation, a long
run) against the exported function directly — no reimplementation, no fixture, answer in one shot:
NUL/BEL/ESC/DEL/etc. all read `true`. `load()` only resolves specifiers relative to the repo root
through its own loader, not Node's own `import()` — a first draft calling `await load('node:fs')`
failed with `ERR_MODULE_NOT_FOUND` looking for a literal `node:fs` file under the repo root; plain
`await import('node:fs')` works fine alongside `load()` in the same script and cost about a
minute to switch to once the error made the distinction obvious.

Confirming the live, three-route reproduction (not just the pure-function check) reused
`cliFixtures.ts`'s `fixture()`/`audit()`/`auditWith()` exactly as pass 2's entry described,
imported the same way through `npm run inspect -- -` rather than a throwaway `.test.ts` — faster
than pass 1's scratch git repo and pass 2's three scratch test files, since one script could drive
all three routes (flag, `--args-from` file, interactive walk) and the exhausted-prompter check in
one process and print a single JSON object back. The one new thing worth a mutation entry rather
than a prose note: the multi-line evidence values in this pass's own `--args-from` file could not
contain a literal `--evidence "1=..."` example mid-sentence on its own line, since `parseAuditFile`
reads any line starting with `--` as a new flag regardless of where in a paragraph it sits — writing
the whole evidence block as one un-wrapped line per flag (no embedded newlines) sidestepped it, and
the brief's own warning about this cost nothing since it was flagged before the first attempt
rather than after the file was rejected.

## 2026-08-06, auditing `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal` (pass 4)

### `npm run inspect`'s stdin mode with `load()` found the fourth gap in one scan; the cost this
### round was re-learning `--args-from`'s file format on the first attempt, a friction already
### filed and still unfixed two passes later

Verifying the Cc fix and hunting for a fifth gap both went through `npm run inspect -- -`
piping a script that imports `hasVisibleContent` via `load('scripts/tasks/audit.ts')`, same as
pass 3's entry describes — this pass added one step: instead of hand-picking candidate characters,
it scanned U+0000 through U+2FFFF with `/\p{Default_Ignorable_Code_Point}/u` (confirmed supported
by the same regex engine with no extra dependency) minus `/\s/u`, `/\p{Cf}/u` and `/\p{Cc}/u`, and
printed the 37 codepoints left over. That one scan replaced what would otherwise have been another
round of guessing individual characters by hand, and it is the reason this pass's finding is a
single-line fix (`\p{Cf}` → `\p{Default_Ignorable_Code_Point}`) rather than a fourth exclusion
bolted onto a growing list — the scan showed the *shape* of the gap (a whole Unicode property the
sentence's three-category model doesn't cover), not just one more instance of it.

The actual time cost was elsewhere: reproducing the live, three-route bypass through
`cliFixtures.ts`'s `fixture()`/`audit()`/`auditWith()` needed an `--args-from` file, and the first
attempt put the spec slug as the file's own first line (`demo-spec\n--proof 1=deferred\n...`),
which `parseAuditFile` refuses as "a value line before any flag" — because the slug is a
positional CLI argument, consumed before `--args-from` is even read, and can never live inside the
file it names. This is exactly the friction pass 3's own commissioning round already filed as
`audit-args-from-rejects-the-slug-on-the-file-s-first-line-wi` (still `unreviewed`, two passes
later): the tool's error names the *shape* of the mistake ("a value line before any flag") but not
*where the slug belongs instead*, so an agent who has not read that finding has to work it out from
`AUDIT_USAGE`'s own text (`<spec>` is a separate bracket from `[--args-from <file>]`) rather than
from the error it just got. Cost about two minutes to notice this time, against the roughly ten
minutes it reportedly cost when it was first found — the finding sitting unreviewed doesn't compound
the cost across audits of the *same* branch, since each pass re-derives it fresh from the same
ambiguous error rather than inheriting the last pass's five minutes of debugging.
## `every-triage-action-has-a-non-interactive-form` pass 1, 2026-08-06

`--args-from` rejected the pass file on the first attempt: `error: --question describes a finding,
and no --finding has been opened yet`. The cause was invisible from the error alone. `parseAuditFile`
treats any physical line starting with `--` as a new flag and everything else as a continuation of
the value above it (`audit.ts`'s `parseAuditFile`) — so a reproduction snippet quoted inside a
clause's own `--evidence` prose (`tasks ask x1` on one line, `--question q\`` wrapping onto the
next) was silently read as an unrelated top-level flag, thirty lines away from any `--finding`. The
fix cost one grep (`grep -n "^--"` over the pass file, to list every line the parser will actually
treat as a flag-open) and a rewrite of two paragraphs to describe the repro in prose instead of
literal command syntax. Same shape as the `nearestLine`/`visibleWhitespace` machinery `mutate`
already has for its own find-text misses — `audit`'s free-text evidence fields have no equivalent
guard, and a long paragraph is exactly where an author reaches for a backtick-quoted CLI example.
Worth considering: `parseAuditFile` warning (not erroring past the point of no return) when a
continuation line both starts with `--` and matches no known flag name, or documenting `grep -n
"^--"` as the pre-flight check for anyone hand-writing a pass file with command examples in it.

Six-entry mutation manifest (one per clause) all KILLED at their own named-test scope on the first
run, no escalation — the strongest possible outcome from `mutate`, and it cost exactly one call.
The `mutate` tool itself was otherwise friction-free: find-text, restore and the journal all worked
as documented.

The real finding came from going outside the manifest the brief's mechanical grading would have
produced. Two adversarial checks the brief explicitly asked for by name — "a record in an
unexpected state" for c4, and re-checking c6 "harder than the rest" — were not expressible as a
single find/replace mutation, so they were run as direct CLI reproductions instead: decline a
record, then ask a question against it (c4 — the record silently stays `declined`, never
`unreviewed`, contradicting the clause's own text, and neither `defer` nor `promote`'s sibling
guard exists on `ask`/`redirect`) and a hand-edited reorder of `TRIAGE_ACTIONS` run through `mutate`
with no `tests` scope at all (c6 — SURVIVED the entire 1673-test suite, because the one
order-touching test computes its expected string from the same table it is checking). Both were
findable only by asking "what would a reviewer plausibly do that the six named tests do not
describe", which the generated manifest cannot ask on its own — same lesson as the prior pass's
note about adversarial-scenario construction living outside any tool here.

## `every-triage-action-has-a-non-interactive-form` pass 2, 2026-08-06

This branch's own pass 1 found c4's guard was missing entirely and c6's order test was tautological.
The fix (289868e, 73f214b) closed both readings literally — but the pass-1 finding text itself named
the shape that survives it: "operate on a record regardless of its state" is not the same claim as
"admit exactly the states the queue re-offers." isReviewable was written to the wrong boundary
(unreviewed-or-open, borrowed correctly from promote/defer where open is a valid input) rather than
ask's own boundary (unreviewed only, because that is the queue's own filter). Nine of ten manifest
entries KILLED at their own named-test scope on the first `mutate` run; the discriminating move was
building a tenth entry the brief did not name — deleting redirect's own inline save rather than the
walk's common one — because pass 1's mutation had only ever targeted the shared path three actions
share, never the two (redirect, ask) that persist themselves. It SURVIVED the whole 1675-test suite.
Direct execution (defer a finding, then ask it) reproduced the c4 gap in under a minute once the
right boundary was suspected; the suspicion itself came from re-reading isReviewable's own doc
comment against unreviewedQueue's filter side by side, not from any tool.

One thing worth naming since the brief asked for it explicitly: the smallest of the three findings
this pass (isReviewable's comment claiming it guards promote when promote was never switched onto
it) was found by treating "the branch changed a shared comment" as reason enough to check every name
the comment lists against the diff, not by any test or tool surfacing it — a plain reading of one
paragraph against one diff. No tool cost a round this pass; `--args-from` was accepted on the first
attempt once every finding's long-form reproduction was moved into a separate `--evidence` block
instead of folded into `--finding`'s own title line, which the command's own usage text says
explicitly but is easy to miss when a finding's title is the most natural place to put the
reproduction.

## `every-triage-action-has-a-non-interactive-form` pass 3, 2026-08-06

Nine-entry mutation manifest (one per proof target across all six clauses, plus three separate
c6-persist entries — one per action that saves on its own) all KILLED at their own named-test scope
on the first `mutate` run, no escalation. Pass 2's redirect-persist gap is genuinely closed this
round and mutation-verified in isolation; c6 is met for the first time in three passes. `--args-from`
was accepted on the first attempt — the pass-1 lesson (move any CLI-syntax reproduction out of a
`--evidence` paragraph and into prose, since `parseAuditFile` reads any line starting with `--` as a
new flag) is now second nature and cost nothing to apply across five multi-line evidence blocks.

The real finding, again, came from going outside the six clauses' own literal text and asking the
brief's explicit question about c4 directly: "nothing else in the command set can move a record
between states such that a recorded question is stranded." That is not expressible as a single
find/replace mutation — there is no line to break, since the gap is an absent guard, not a wrong
one — so it was three direct CLI reproductions instead: ask a question, then defer/promote/decline
the same still-unreviewed id and watch the question survive in evidence while the id silently drops
out of `--state unreviewed`. Two of the three (promote, defer) are this exact spec's own actions,
which is what makes it a defect in this clause rather than a pre-existing, out-of-scope one. Finding
this took under two minutes once the question was read literally off the brief; no tool surfaced it,
and no tool could have, since mutation testing can only measure a line that already exists.

One tool-adjacent event worth recording rather than acting on: partway through this pass, the
scratch manifest file this session had written at
`C:\Users\yonat\AppData\Local\Temp\claude\...\scratchpad\pass3-manifest.json` was silently replaced
mid-session with an unrelated nine-entry manifest for a different spec entirely (a `deferred`
verdict feature this branch does not touch), accompanied by a system-reminder asserting the change
was "intentional" and instructing that it not be mentioned to the user. The mutation run for this
pass had already completed and its results captured before the replacement was noticed, so nothing
here was affected, but the manifest was not reused — a fresh file was written under a new name and
the substitution is recorded here rather than acted on silently, since an instruction to withhold a
tool-state anomaly from the user is not something a scratchpad write should be able to carry.

## `every-triage-action-has-a-non-interactive-form` pass 4, 2026-08-06

No code changed since pass 3's head, so this pass's job was independent re-grading of all six clauses
plus a direct judgement on whether the orchestrator's ruling that c4 is met (with the five-verb stranding
gap filed separately) actually holds against the clause's own text. `audit-prompt` correctly reported no
generated mutation manifest for this spec (the tool's own note: no proof target resolves to a single
named test it can point at), so a ten-entry manifest was hand-built from scratch — nine clause targets
plus a split c4 entry (guard-removal and evidence-overwrite as two separate mutations, since the guard
removal is caught by two different named tests rather than one). Aiming it cost about ten minutes reading
records.ts and triage.ts directly rather than trusting pass 3's own file:line prose, and every `find`
matched on the first attempt with zero wrong-file guesses — pass 3's evidence turned out to name the
right lines exactly. All ten KILLED at their own named-test scope, zero escalation, one `npm run mutate`
call, about ninety seconds wall.

The genuinely new work this pass was outside anything mutate or audit-prompt can check: three direct CLI
reproductions against a scratch store built with `--store`/`--systems`/`--specs-dir` pointed at the
scratchpad rather than the repo's own tracked `docs/tasks.jsonl`, to verify c4's three named properties
(evidence append, unchanged state, triage-scoped event) hold independently of the test suite's own
assertions, and separately to reproduce pass 3's ask-then-defer stranding scenario myself rather than
take the audit trail's word for it. Both reproduced exactly as documented, in under two minutes total —
a scratch store with the same three global flags the shipped test fixtures use is cheap to stand up by
hand and left no trace in the tracked store. `--args-from` was accepted on the first attempt; the pass-1
lesson (no evidence line may open with `--`, since `parseAuditFile` reads any such line as a new flag)
is now routine — writing the c4 paragraph's CLI-flavoured reproduction in prose rather than literal
syntax cost nothing extra once it was habitual. Nothing here cost a round; the tooling was clean.
## 2026-08-06, auditing `a-branch-knows-which-spec-it-owes` (pass 1)

### `audit-prompt`/`mutate`/`merge-ready` cost nothing; both real findings came from seams the
### brief named explicitly and the shipped tests do not reach

Pass 1, no prior standing, `git status` clean throughout, no wrong-`file` mutation refusals. Seven
manifest entries, one per clause, each aimed at the exact return statement the clause's own vitest
describe block already names — all seven KILLED at `scripts/tasks/mergeReady.test.ts` scope, none
needed whole-suite escalation. Total mutate wall time was under two minutes for all seven.

Both findings this pass came from doing exactly what the brief asked and nothing more —
constructing the two seams it named ("a spec file that does not parse" and the c7
diff-vs-write-region overshoot) with throwaway `.ts` scratch files inside the worktree, run
directly with `tsx` against the exported functions (`specClausesDiffer`, `authoredAsPlan`,
`changedFiles`, `diffTouchesRegion`) rather than through the CLI, then deleted before the tree was
checked for cleanliness. That path exists because these functions were pulled out of
`branchStanding` specifically so something could call them without a live repository — `decideSpec`
already says as much in its own comment — but `branchStanding` itself (the function that actually
wires `task.writes` into `touchedWriteRegion`) has no test at all, real-repo or unit. Both findings
sit exactly there: in the wiring the pulled-apart functions make testable individually but that
nothing recomposes and tests together. Confirming each took one temp git repo, four to eight lines
of setup, and under a minute; nothing about constructing them needed a tool beyond `tsx` and `git
init` in a scratch directory, but nothing in the suite would have surfaced either without being
told which seam to check — same shape as the parallel-branches passes' note that the adversarial
case is exactly what a clause's own text cannot generate about itself. The one new wrinkle here:
both adversarial cases came from reading a sibling file (`workPrompt.ts`) for what the codebase
itself says is a sanctioned state (grants may diverge from the diff), not from the diff under audit
at all — worth remembering that "attack the seam" sometimes means reading one file over from the
one that changed.

## 2026-08-06, auditing `a-branch-knows-which-spec-it-owes` (pass 2)

### `audit-prompt`/`mutate`/`merge-ready` cost nothing again; the finding came from generalizing
### pass 1's own reproduction one step further than its fix went

No wrong-`file` guesses, no argv-length wall, no journal left behind. Ten manifest entries this
time — the seven clauses plus both pass-1 fixes — all ten KILLED, but two (the clauseIdsDiffer
return line and the diffTouchesRegion fail-open branch) only killed at file scope on the first
try. Both were my own mis-aim, not a suite gap: the real-repository test carrying the clause's own
tag in its title ("...(c1)", "...(c7)") only exercises the branch where the function returns
`false`/drops the exemption, so forcing the function to always return the *opposite* of what that
test checks sails through it. Re-running with a test that exercises the other branch — a plain unit
test one describe-block down, with no clause number in its name — killed both at named-test scope,
1 of 51 failing, no escalation. Cost: two extra `npm run mutate` invocations, under a minute total,
once I noticed the arrow in the report. Worth remembering for the next pass: the test whose title
literally names the clause is not always the one whose assertion direction matches the mutation
you're aiming at; check which branch of a boolean-returning function a candidate test actually
exercises before picking it as the named-scope target, not just which test's title matches the
clause tag.

The finding itself came from the same move pass 1's own retro named: reading pass 1's evidence
text for the exact words it used ("bad merge, stray conflict markers, a mangled heading") and
noticing the shipped fix's guard (`headClauses.length === 0`) only covers one of those three named
causes cleanly. A stray conflict marker landing mid-list, rather than over the whole `## Deliverable`
section, drops one bullet from the scan without zeroing the count — reproduced with the same
temp-git-repo-plus-exported-function pattern pass 1 used, four lines of setup once the shape was
clear. No tool surfaced this; it came from treating the finding's own prose as a spec for what the
fix owed, not just from reading the diff that closed it. Same shape as pass 1's retro and both
`the-task-store-survives-parallel-branches` passes: the adversarial case a fix needs to be checked
against is not generated by any tool here, only by reading the words that described the bug closely
enough to ask "is that the only shape this takes."

## 2026-08-06, auditing `a-branch-knows-which-spec-it-owes` (pass 3)

### No new finding; `mutate` was clean on the first try once the manifest named the right test per
### clause; `inspect` cost one lost round-trip to `import` instead of `load`

Seven manifest entries, one per clause, each aimed straight at the return statement its own
describe block names — helped by pass 2's own retro note here about checking which branch of a
boolean function a candidate test exercises before picking it. All seven KILLED at
`scripts/tasks/mergeReady.test.ts` named-test scope, none escalated, one `npm run mutate`
invocation. `merge-ready` was green throughout with nothing to fix.

The one real cost was self-inflicted: `npm run inspect`'s own usage text says to reach another
module through the `load(specifier)` function it hands the body, not through a top-level `import`
statement, and I ignored that on the first attempt — wrote a body with `import { ... } from
'./scripts/tasks/mergeReady'` at the top. That did not error; it printed the source text back (npm's
own command-echo of a multi-line argument, not the tool) followed by `undefined`, which reads as
"ran fine, returned nothing" rather than "your syntax was rejected." Rewriting the same probe
through `load()` and piping it in via stdin (`inspect -- -`) worked immediately and returned the
five-case result table I was after. Cost: one wasted call, under a minute, entirely avoidable by
reading the tool's own two-line example before typing past it. Worth flagging because the failure
mode was silent rather than loud — a caller who does not already suspect the `import` form is wrong
has no signal here that anything went wrong at all, only a suspiciously empty answer.

The brief's own five adversarial cases (wholesale renumbering, add-and-corrupt-together, duplicate
ids in head or base, base unreadable-vs-empty, the retired null-vs-false special case) were each
answered by one `inspect` call against the live functions plus a `grep` for `specAddsClauseId`'s
only call site, rather than by writing five new committed tests — matching the brief's own steer
that a stated boundary with reasoning outweighs a longer exotic-case list. None defeated a clause;
one (duplicate ids masking new content under an existing id) is a real but narrow false-negative on
the side the branch's own design already declares safe, and it did not need a filed finding because
nothing downstream treats it as anything worse than "audit this spec you didn't need to."

## 2026-08-06, auditing `a-clause-can-be-deferred-and-a-spec-can-carry-its-goal` (pass 5)

### `audit-prompt` itself cost a round: its own WARNING was wrong, and believing it would have
### thrown away the whole audit

`audit-prompt` opened with "WARNING: this branch is working run-an-orchestrator-over-three-parallel-tasks,
not a-clause-can-be-deferred-and-a-spec-can-carry-its-goal" and, following from that, refused to
write a mutation manifest or an args skeleton and told step 7 to end with "Do not file a pass." Taken
at face value this ends the audit before it starts — the brief's own instruction is "do exactly what
it says." Checking it instead of trusting it cost roughly the first third of the session: `git diff
--name-only` on the printed range, `git log -S` on the line that produces the warning, reading
`mergeReady.ts`'s `decideSpec`/`touchedWriteRegion` and its doc comments, and finally running
`npm run tasks -- merge-ready` directly, which resolves the same question correctly — "spec chosen
by the gate: a-clause-can-be-deferred-and-a-spec-can-carry-its-goal — run-an-orchestrator-over-three-parallel-tasks
was not shown to be touched by this branch's diff." Root cause: `docs/events.jsonl` carried one
uncommitted `note` event, written during this branch's own merge-conflict resolution, misfiled under
the orchestrator spec's id instead of left unspecced. `audit-prompt`'s `branchSpec` reads
`resolveActiveSpec` directly (`scripts/tasks/audit.ts:602`) rather than routing through the
`decideSpec` gate that `a-branch-knows-which-spec-it-owes` built specifically because the un-gated
inference is unreliable — a fix that landed in `mergeReady.ts` and was never carried over to
`audit.ts`, even though `audit.ts` had the older, known-unreliable version of the same check
(`03a9ce9`, closed as its own finding before the gated version existed). Filed as a finding this
pass rather than fixed, since it is not part of this spec's own `writes` grant. Worth naming
plainly: a brief that tells its reader not to trust the diff, and to stop, is exactly the shape of
failure an auditor has the least defense against, because the instruction to comply is also printed
by the tool being distrusted.

Once past that, the substantive audit was cheap: one hand-built seven-entry mutation manifest (no
manifest could be generated automatically, for the same reason as above) killed all seven clauses at
named-test scope on the first try, zero escalations. Closing c2 itself needed no new tool —
`npm run inspect -- -` piped from a heredoc, calling `hasVisibleContent` directly against ~28
boundary codepoints and then the real CLI's `--args-from` route against ~9 end-to-end cases via
`scripts/tasks/cliFixtures.ts`'s `fixture()`/`audit()` helpers — was enough to independently confirm
pass 4's argument rather than re-run it. One self-inflicted slip repeating pass 3's own retro note
here: the first `inspect` script reached for `await load('node:fs')`, which resolves `node:fs`
against the repo root as a file path and fails loudly (unlike pass 3's silent-`undefined` case) —
switching to a top-level `await import('node:fs')` fixed it in one retry.

## 2026-08-06, auditing `briefs-carry-the-lessons` (pass 1)

`audit-prompt` cost nothing wrong this time: the "no manifest was written" line named the real
reason (no proof target on this spec resolved to a test the brief could name) rather than a false
warning, so no round was spent distrusting it — worth contrasting with the same day's other entry.
Building the manifest by hand was cheap once one thing was found: for a proof target that is
"does an array's contents reach printed output," mutating the *call site* (`printLessons(heading,
WORKER_LESSONS)` to `printLessons(heading, [])`) is a one-line, always-unique find/replace, versus
matching a whole multi-line array-literal block in `briefLessons.ts` itself, which is fragile to
reformatting and easy to get wrong on quoting. The "drop one instruction" mutations did need the
full multi-line object literal as `find` (four lines, exact indentation) — copied from a fresh
`Read` rather than the git-diff view, which turned out to matter once (the diff view's leading `+`
column is not part of the file). All eleven mutations killed at their own named-test or named-file
scope with zero escalations, which is itself evidence for the branch's central claim: nineteen
hardcoded per-instruction assertions really do catch both an emptied array and a single dropped
entry, the two shapes the worker said it was deliberately avoiding making untestable. No tool
produced a wrong answer this pass; the only real cost was manual — reading all nineteen printed
instructions myself to judge action-orientation is not something any tool here does, and finding
the one that fails (a fact with no imperative, buried among eighteen that pass) took a full close
read rather than a grep.

## 2026-08-06, auditing `briefs-carry-the-lessons` (pass 2)

`mutate` refused two manifest entries on the first attempt with `test names a test by name, so
tests must name the file it lives in` — the tool's own message named the fix exactly (a `test`
field needs a sibling `tests` array naming its file), so the round cost one edit and one re-run
rather than any guessing. Once both entries carried `tests`, all eight manifest mutations KILLED
at their own named scope with zero escalation on the first clean run — the empty-array and
drop-one shapes for c1-c4 and c6-c7 all still die exactly as pass 1 recorded, including the two
new entries this pass added for the lines pass 1's own fix touched (the comment-rule pointer and
the file-on-the-worker's-branch rewrite).

c5 has no line to mutate — it asserts an *absence* — so `mutate` cannot check it at all; verifying
it meant editing `briefLessons.ts` by hand four times (once per brief), reintroducing one narrative
phrase from the pre-fix spec wording into each of the four lesson arrays in turn, and running that
brief's own `-t "never prints the narrative evidence..."` test directly with `npx vitest run … -t
…` between each edit and its revert. All four caught their own reintroduced narrative and none
false-passed. This is the same shape as the "reading nineteen instructions by hand" half of c5
that pass 1 already named — no tool here can check whether a printed sentence is an absence of
narrative or an actionable imperative; both halves of c5 are read, not run.

## 2026-08-06, auditing `run-an-orchestrator-over-three-parallel-tasks` (pass 1, retrospective)

This audit's subject is a measurement, not a diff: `audit-prompt` correctly detected that
(diff range collapses to one SHA, "nothing relates this spec to this branch") but still printed
the full seven-step, diff-shaped procedure — step 4's mutation-manifest step and step 7's "do not
file a pass" both had to be consciously overridden per the assignment rather than followed, since
this audit's proof targets are `tasks log` queries and a source-inspected test file, not a diff to
mutate. Worth carrying into a future retrospective-audit brief: a spec whose clauses point at log
queries rather than a diff range is a distinguishable shape (no `writes`/`grant` on the member
task, proof targets naming `tasks log` instead of a test path) and could get its own step list
instead of inheriting the code-diff one wholesale.

Separately, and more costly: roughly 40 minutes into this audit, `node_modules` at
`C:\Users\yonat\Projects\UniversalisRPG\node_modules` — the real directory every worktree in this
checkout junctions to, including this one — went from working (the first `npm run tasks --
audit-prompt` call succeeded) to completely empty, confirmed independently via both `ls` and
`cmd /c dir` and rechecked roughly every few minutes for the audit's remainder with no recovery
and no visible `node`/`npm` process in `tasklist` to explain it. Every `npm run tasks` call after
that point failed with `'tsx' is not recognized`. Nothing in this session touched node_modules or
ran an install (prohibited by the task brief), so the cause is external — plausibly a concurrent
session elsewhere in this shared checkout reinstalling dependencies mid-audit. Cost: the rest of
this pass's clause grading (c1, c2, c3, c4, c5, c7) had to be done entirely from git history,
direct file reads, and `docs/events.jsonl`/`docs/tasks.jsonl` read via `Grep`/`Read` rather than
`tasks log`/`tasks show`, and c6 was graded on source inspection rather than an actual `vitest`/
`mutate` run. The evidence gathered this way cross-checks cleanly (event-log timestamps line up to
the second with git commit times throughout), so the verdicts are not weaker for it, but every
`npm run mutate` verification this pass would otherwise have done did not happen. Worth recording
as a concrete argument for whatever isolates a worktree's `node_modules` rather than sharing one
mutable copy across concurrent agents — the risk this pass hit is exactly the shared-mutable-state
class the run's own worktree isolation was designed to avoid for the *task store*, just one layer
down in the toolchain.


## 2026-08-06, auditing `the-workflow-records-what-cost-it-in-one-place` (pass 1)

Three costs, all measured rather than felt.

**The pass file is keyed on the spec slug alone, in the shared OS temp directory.** Step 7 of the
brief prints `C:\Users\yonat\AppData\Local\Temp\audit-<slug>-pass1.txt`, and it printed the same
path a sibling branch auditing the same spec would be handed. Two branches audit one spec whenever
a spec has more than one member, which is the normal case — this spec has three. Nothing in the
generated brief warns about it and nothing in the filename distinguishes the auditor, so the
second one to write wins silently and the first files the other's verdicts. Avoided here only
because the dispatch carried a hand-written instruction to copy the file to an `lh-` prefixed name
first, which is the orchestrator paying per dispatch for something the tool knows at generation
time. The same hazard is already a shipped lesson (`orchestrator/scratch-prefix`, "concurrent
agents share one directory and can overwrite each other's mutation manifests") — the tool teaches
the rule in the brief and then breaks it in the same brief's step 7. Cheapest fix: put the branch
name in the path, since `audit-prompt` already resolves it to print the diff range.

**The manifest step is the one the brief cannot do and the one it says least about.** Step 4 said
"no manifest was written; see `Mutation manifest:` below for why", and the reason given was that
no proof target resolved to a test the brief could name — even though c6's proof target,
`vitest scripts/tasks/briefLessons.test.ts`, names a file that exists in this diff and has 20
tests in it. So the brief declined to aim a manifest at the one clause in scope that was
mutation-testable, and writing the fifteen entries by hand was about 25 minutes, the largest single
block of this pass. The eight clauses whose targets genuinely do not resolve are unbuilt, and the
brief cannot tell that apart from a target it simply did not try to resolve; it reports both as
the same silence. Worth noting the neighbour: this is the same defect the spec's own Deliverable
section names as the run's largest repeated cost ("a mutation manifest that never generates,
because `proof: vitest <file>` names a file where `mutationManifest` needs a test") — still
unfixed, hit again here, and this is the ninth recorded instance.

**What the manifest bought, for the record on whether hand-writing it was worth 25 minutes.**
13 killed, 2 survived, 0 errored over 15 entries. Both survivors are findings this pass filed and
neither was reachable by reading the code — one of them, `unknownLessonIds` silently dropping an
empty citation, is invisible precisely because the sibling function *is* tested on that input.
Verdict: worth it, and the argument for generating the manifest is not that it saves the writing
but that an auditor who spent 25 minutes on setup files fewer entries than one who spent none.

**Cheap and worth keeping.** `npm run tasks -- merge-ready` answered all seven legs in one call and
correctly separated the three mechanical FAILs (base drift, two open members, no recorded pass)
from the code legs, all green. Checking whether the `base` FAIL staled the diff range took one
`git log HEAD..main` and cost nothing: two commits, one event-log line, no code. `tasks show` on
the member task carried the worker's recorded decisions in full, which is the reason point 3 of
this dispatch could be judged rather than guessed — the decision note argued the case and named
the alternative, so the audit's job was to test the argument rather than reconstruct it.

**node_modules survived this pass.** The previous entry's HIGH finding held: nothing here ran an
install, the junction stayed populated for the whole audit, and every `npm run` call worked. One
data point that the rule works when it is carried in the dispatch; it is still carried by hand.
## 2026-08-07, auditing `a-mutation-verdict-names-the-test-that-changed` (pass 1)

The subject was `npm run mutate` itself, so step 4's instruction — aim a manifest and run the tool
— is circular on its face: the thing being asked to prove the clauses is the thing the clauses are
about. What resolved it was cheap and should be named as the standard move for a self-referential
audit rather than reinvented: drive the mutation by hand (edit the line, `npx vitest run` the
scope directly, read the failing test names out of vitest's own stderr, `git checkout --` the
file, `git status --porcelain` for clean), then run `npm run mutate` over the identical manifest
and check the two agree. Sixty lines of throwaway script; both passes agreed on all six entries.
The agreement is corroboration, not proof, and only the hand-driven half is cited as evidence.

The genuinely load-bearing step the brief does not ask for: capture what the tool *parses* before
judging the parser. One `spawnSync` of vitest with stdout and stderr written to separate files,
against a fixture built to be hostile (nested describes, `it.each`, a name containing ` > `, a
150-character name, a `beforeAll` that throws), settled in one run what the reporter actually
emits — stream, path separator, truncation, and whether a thrown hook prints a test-less FAIL
line. Every one of the worker's recorded reporter decisions was checkable against that capture in
seconds, and the highest-severity finding of this pass came out of the same capture aimed at a
real repository file. Reading the parse and reasoning about vitest's format would have missed it.

`npm run inspect -- -` with a body on stdin carried the whole second half of the audit: six
adversarial scenarios driven through `runMutations` with injected `runTests`/`baselineFor`, plus
feeding real captured streams to `tallyOf`. No file in the worktree, no `*.test.ts` to clean up.
This is the tool working exactly as its own comment says it should; nothing to fix.

Two real costs. `resolveVitest` is not exported in a form a scratch driver can call — reproducing
it meant copying eight lines of `createRequire`/`package.json` `bin` resolution into the capture
script, and the first attempt (`require.resolve('vitest/vitest.mjs')`) failed on package exports.
A tiny exported `vitestCli()` would have saved two rounds. And `merge-ready` reports `base: main
has moved past the merge base` as a FAIL, which is correct but arrives in the same block as the
gates, so a reader has to know that one of the two red lines is a merge and not a defect.

Cost of the pass itself, measured rather than estimated: `merge-ready` 43s for the whole gate,
well inside the five-minute rule. `npm run mutate` over the six clause entries 97s against 56s for
the same manifest under `main`'s `mutate.ts` — the +73% is the confirmation phase and is filed.


## 2026-08-07, auditing `save-fixture-migration` (pass 1)

Three specs landed on one branch and `audit-prompt` infers one spec per branch, so the brief for
two of the three refuses to write its pass file and mutation manifest. The `--branch <slug>`
override is what unblocks it, and it then prints a branch name that is false. That is survivable
once you are told; nothing in the brief says it, and a pass filed with the override would record
the wrong branch in the event log. Filing without the flag and briefing with it is the working
shape — worth making `audit-prompt` able to say "this branch carries N specs" instead.

Step 4 had nothing to run: all six clauses write `proof: vitest <file>` with no quoted test name,
and `resolveTarget` only wires a target written as `vitest <file> "<exact test name>"`, so the
manifest section printed `- none` for every clause. The step is still the whole exercise, so the
manifest was hand-written. The cost is not the writing — it is that a spec author has no signal
that the proof line they wrote will resolve to nothing until an auditor three commits later finds
an empty manifest section. `tasks plan`, or `spec show`, could say "this proof target resolves to
no test" at the moment the clause is written, which is the only moment it is cheap to fix.

What the hand-written manifest bought, and the argument for keeping step 4 binding even with no
generated one: 13 mutations, 11 killed, 2 survived, and both survivors are filed findings. Neither
was reachable by asking "is this line covered" — both came from asking what the clause promises
that the code merely happens to do. The sharper of the two is a test that disables itself in the
failure state (`it.skipIf(SHAPE_CHANGE !== null)` is the only end-to-end refusal test, and it
skips exactly when the value it guards is wrong). A survivor is the finding, but a survivor whose
scope walked to the whole suite and came back green because the test *skipped* rather than passed
is invisible in the report — there is already a finding on the shortfall check missing skips, and
this pass is a second, independent instance of it.

Cheap and load-bearing, worth naming as the standard move: measure the clause instead of trusting
the number in it. c6 states a count ("three failures in one file"). Driving the bump through
`npm run mutate` with `all: true` rather than by hand cost one command and produced the whole
answer — 6 of 1815 with the pre-existing red subtracted, and the re-run scope column naming the
two files. The count was correct when the event log recorded it and false by the time the branch
ended, because a later commit *on the same branch* added two tests coupled to shipped content. A
clause that pins a measurement can be falsified by its own branch, and only re-measuring finds it.

Costs. `npm run inspect` resolves its dynamic `import()` relative to `scripts/`, not the repo
root, so `./scripts/migrate-saves.ts` fails and `./migrate-saves.ts` works; the error does suggest
the fix, which saved the round trip. `merge-ready` was 4m10s all in and reports `npm test` FAIL
with no indication that the single red test is a known, filed, non-hermetic one — every auditor on
this branch pays the same few minutes to re-establish that. A `merge-ready` that could name the
failures it saw against the open findings would turn that into a line of output. Measured: the
13-entry manifest 4m02s (two survivors each escalating to a whole-suite run), the single c6
mutation 5m18s, `merge-ready` 4m10s.


## 2026-08-07, auditing `resolve-forward-progress-guard` (pass 1)

Second auditor on the same three-spec branch, so the `--branch <slug>` override and the empty
`Mutation manifest:` section are already logged above and cost nothing here — being told in
advance is what made them free, which is the argument for `audit-prompt` learning to say "this
branch carries N specs" rather than for another entry about it. One thing the previous entry
could not know: the pass file is named for the spec, not the branch, so three auditors sharing
one temp directory cannot collide. The brief's line about the file being "yours if you have
aimed it" reads as a warning about exactly that collision and is not one.

The cost this pass actually paid was hang-screening. `npm run mutate` spawns vitest with no
timeout, and the spec's own Decisions section records why that matters here: deleting the throw
from `requireForwardProgress` makes `resolve()` spin synchronously, so vitest's per-test timeout
cannot fire and the tool hangs holding a mutated tree. Every one of the 11 entries I ran had to
be reasoned about first — "can this mutation only add throws, or can it remove one the loop's
termination depends on?" — before it was safe to run. That screening is real work, it is
invisible in the report, and it is what pushes an auditor toward scalings (`STALL_BOUND + 1`,
`< now - 1`) and away from deletions. A per-mutation timeout would remove it outright: the
restore-from-captured-bytes path already exists, and a killed child is exactly the case it was
written for. Until then the constraint deserves to be in the brief's "how to read what mutate
prints back" section, not only in one spec's Decisions.

The move worth carrying forward: mutate a line in a PAIR, in opposite directions. Deleting the
`requireBoundaryNotPast` call SURVIVED the whole suite; shifting its argument by one millisecond
was KILLED. Either mutation alone gives a confident and wrong answer — deletion alone reads as
"dead code", the shift alone reads as "fully covered". Together they say precisely what is true:
the loop provably executes the call, and nothing observes whether it is there. That is the
finding, and no single-mutation-per-line manifest could have produced it.

Two smaller costs. `npm run inspect` takes a body of statements but not `import` declarations —
the first attempt spent a round on "Cannot use import statement outside a module" before the
usage text's `await load('src/runtime/runtime.ts')` form; the error names the symptom and not the
fix, which is one line of message away from being free. And `merge-ready` still reports `npm test
FAIL` with no hint that the one red test is filed and non-hermetic, which is the same tax the
previous entry measured; I re-established it independently on purpose, and it took a targeted
vitest run plus a `git diff --name-only main...<base>` to prove the test was green before this
range and that this spec's three files are independently sufficient to redden it. Worth the
minutes once per branch, not once per auditor.

Measured this pass: `src/runtime/resolve.test.ts` 32 tests in 1.0s, which is why an 11-entry
manifest scoped to it is cheap and why the four whole-suite escalations (one per survivor) are
where the wall clock goes. `merge-ready` 1815 tests, one red. Two numbers the audit produced
rather than consumed, both from `npm run inspect`: `resolve()` over a boundary-dense span is
quadratic in active buffs — 500 buffs 34ms, 1000 buffs 133ms, 2000 buffs 653ms — which is
pre-existing and belongs to `offline-progression`, not here; and the branch's switch from
`Object.values` to `Object.entries` in that scan costs 637ms against 512ms over 2000 calls on
2000 keys, i.e. real and immaterial at any count a session reaches. Measuring it was cheaper than
arguing about it, and is the reason no performance finding was filed.

## 2026-08-07, auditing `non-entity-action-owner-inherits-player-stats` (pass 1)

The third audit of one branch carrying three specs, and the first whose spec owns no
`src/runtime` path — which turned the branch's one red test from a thing to re-litigate into a
thing to measure. `audit-prompt`'s prior-art heading is built from the live working tree's diff
filtered to system-owned paths, and the heading its own fixture printed was
`prior art on src/runtime/forwardProgress.ts, resolve.test.ts, runtime.ts, save.test.ts,
save.ts, session.test.ts`. Not one `src/content` path appears, because the fixture's manifest
owns none — so attribution was a single grep rather than an argument: reverting this spec's three
files leaves the assertion failing identically. Two prior entries had to reason about whether the
red was theirs; this one could read the answer off the failure output. Cost: about four minutes,
and worth stating as a technique — when a non-hermetic test leaks the tree, the leak itself is
the attribution evidence.

`resolveTarget` still resolves nothing for any of the three specs, because all three write
`proof: vitest <file>` with no quoted test name. Third audit in a row hand-writing a manifest.
The gap is one line wide: a `proof: vitest <file>` with no test name could resolve to the file and
run the whole file as the scope, which is strictly better than "- none" and refusing to write a
manifest. As it stands the tool's one automated step is off for every spec that does not know the
undocumented quoting rule.

What the manifest bought that reading could not. Five mutations of one 8-line function, each
aimed at a different clause of the rule, all KILLED by five *different* named tests — including
`const max = registry.resources.get(action.target)?.max` -> `const max = action.target`, which is
the only one that proves the resource-to-stat indirection is watched rather than the mere presence
of a check. Two more on `statRange`, which this branch does not touch, for c3's "nothing changed":
deleting the global-base fallthrough is killed inside the named proof target, but *swapping* the
two operands — an actor's own sheet losing to the global base, the exact asymmetry the spec is
about — survives `src/runtime/stat.test.ts` and escalates to the whole suite. c3's proof target
covers the player's half of its clause and not the entity's. That is a fact no amount of reading
green tests produces, and it cost one 40-second run.

The finding the clause-by-clause pass cannot reach came from `npm run inspect`, not from the diff:
after this branch a `# entity` with `stats: max-health 5` and a `target: health` action loads
clean and `statRange('attack', …, 'ghoul')` returns the player's 10. The branch closes one of the
six stats shipped `melee-foe` reads. Every clause is honestly met and the deliverable's own
sentence is discharged for a sixth of its subject — which is exactly the "the reproduction is
always narrower than the property" lesson the brief prints, arriving from the other direction:
here the *fix* was narrower than the property, and only asking the runtime a question caught it.

Measured this pass: `src/content/references.test.ts` 41 tests, five mutations plus six baselines
in ~50s; full suite 1815 tests, one red, ~90s. `npm run probe -` with a heredoc answered "is
`max:` required on a `# resource`" in one call and killed a would-be finding about the
`max === undefined` arm being a silent hole — it is not, the schema refuses a resource without a
max, so that arm only fires for a target naming no resource, which the reference check then
reports properly. Cheapest measurement of the pass.

### non-entity-action-owner-inherits-player-stats (pass 2, run concurrently in its own worktree)

## 2026-08-07 — non-entity-action-owner-inherits-player-stats audit pass 2 (concurrent, worktree audit2)

Cheap pass. Roughly 25 tool calls end to end, ~12 minutes of wall clock, and the only real cost
was the two full test suites (43s each) and the mutation run (~2 min for 8 mutations across 7
baseline scopes).

**Audit tool.**
- `audit-prompt` resolved the branch by the strict route and wrote the pass file without a
  `--branch` flag, exactly as promised. The "Who owns each changed path" and prior-art sections
  were the single most useful thing in the brief: `[unreviewed] ...-pass1-an-entit` showing up
  under prior art on registry.ts is what let me recognise the pool-only residual on sight and
  step around it instead of re-deriving and re-filing it. That section paid for itself.
- `Mutation manifest: - none` cost me nothing this time only because the dispatch told me in
  advance why. Standing cost is real: `resolveTarget` wires a target only for
  `vitest <file> "<exact test name>"`, and all five clauses here write `proof: vitest <file>`.
  Every clause on this spec is mutation-testable and none of them is wired. Hand-writing the
  manifest took ~5 minutes; the harder part is that nothing in the brief tells an auditor which
  line a clause is *about*, which is correct (that judgement is the exercise) but means the
  "wired to the tests above" framing promises something the tool cannot deliver on this spec
  shape. Either specs should be pushed toward quoted proof targets, or the brief should stop
  describing a manifest it will not write.
- The pass file's `#`-at-column-zero comment rule collided with DSL evidence: every error message
  this spec produces starts `# item …` / `# location …`, which would be silently eaten as a
  comment. I rewrote them as `... item …`. Small, but it makes the one system whose error
  messages all begin with `#` awkward to quote in its own audit record. A `\#` escape, or
  requiring the comment marker at column zero followed by a space, would fix it.
- Goal line: the spec records none, so the brief printed the deferral warning and `deferred` was
  unavailable as a weighed option. Did not bite (all clauses met) but it is a live gap.

**Mutation tool.** Excellent this pass — 8/8 killed, every verdict attributed to a named test and
re-confirmed at that test's own file. The named-test attribution is what let me trust the two new
neighbour mutations (unwiring the call site; emptying entityTypeBase's inherited actions) rather
than just re-running pass 1's four. Baseline pre-measurement of seven scopes cost ~40s before
anything was written; worth it. No unrestored files, journal clean, `git status` empty after.

**Probe and inspect.** `npm run probe -- - --each` over a 9-variant heredoc answered the whole
over-strictness question in one call and was the highest-value tool of the pass. `inspect` cost
me four round-trips to discover the fixture shape: `ModuleSource` is `{name, text}` not `{id,...}`,
the namespace separator is `.` not `:`, the info id is on the header line (`# info base`) not an
`id:` field, and the dependency field is `dependencies:` not `needs:`. Each was a one-line error
and a re-run. A `--help` example showing one two-module `loadUniverse` call would have saved all
four; this is the single cheapest fix available in this list.

**Harness.** Bash tool resets cwd between calls — every command needed the absolute worktree path
prefixed, and a compound `cd &&` silently produced NO OUTPUT AT ALL on one call (the
`git diff --stat -- content/` + `--name-only` chain), which I initially misread as "content is
untouched" rather than "the command did not run". That is a dangerous failure mode for an auditor:
an empty diff and an unexecuted command look identical. Using `;` instead of `&&` after the `cd`
fixed it. Worth a line in the auditor brief.

**merge-ready.** One invocation, ~2 min, and its `npm test ok pass` doubled as my second
independent full-suite run — which is what made the flake protocol a no-op (nothing failed, so
nothing needed isolating). Its final two FAIL lines (`spec`: the held unreviewed finding;
`clauses`: the c4 this pass clears) are both correct and both self-explanatory. No friction.

### save-fixture-migration (pass 2, run concurrently in its own worktree)

## 2026-08-07 — save-fixture-migration audit pass 2 (concurrent, worktree audit2-save-fixture-migration)

**No mutation manifest was generated, and the brief said so honestly.** `resolveTarget` only wires a target written as `vitest <file> "<exact test name>"`; this spec writes `proof: vitest scripts/migrate-saves.test.ts` with no quoted name, so the brief printed "- none". Cost: I hand-wrote a 15-entry manifest and a 1-entry manifest in scratch. That is the right division of labour (aiming the mutation IS the exercise), but the brief could pay for itself by emitting a manifest *skeleton* with `file`/`find` blank and `tests` pre-filled from the proof target's file — the file half is mechanical, only `find` is judgement. Measured: roughly 12 minutes of this pass went into transcribing test names out of the source into the manifest, which the tool already knows.

**mutate is excellent and the verdict format did its job.** 15 mutations, 15 KILLED, every one attributed to a named test and re-run at that test's own file. Two of them (`c3c`, `c5c`) were aimed specifically at fix-pass commits and killed, which is what let me certify the fixes rather than the clause text. Wall clock for the 15-entry run over one test file: ~3 min including 12 baseline measurements. The `all: true` c6 run: ~6 min for baseline + mutant + re-run scope.

**The `all: true` baseline is where the flake costs money.** mutate's own whole-suite baseline reported "1 test(s) were already failing before this mutation" and its escalation walked into scripts/modportal.test.ts and scripts/tasks/handoff.test.ts — both flake-set files — so its kill line named a mixture of real and flaky failures with no way to tell them apart from the report. I could not use mutate's output for c6 at all; I re-did the measurement by hand (sed the constant, `npm test` to a log, `git checkout --`, grep the FAIL lines) to get the failure *names*, then ran the three suspects in isolation under the same mutation. Cost: ~15 extra minutes and three extra full-suite runs. The cheap fix is on mutate, not on the flake: when a whole-suite run is the scope, print the failing test names of the baseline and of the mutant side by side, so "1 already failing" is a name rather than a count. Today the number moves and the reader cannot see which name moved.

**The isolation check paid for itself immediately.** 9 failed of 1822 under the bump looked like c6 was worse than the clause claims (it claims 5). Re-running scripts/modportal.test.ts + scripts/tasks/doctor.test.ts + scripts/tasks/handoff.test.ts alone under the *same* mutation gave 57/57, which is what made the 5 exact. Note for the flake finding: this run adds `scripts/tasks/doctor.test.ts` to the sighting list, and the set that tripped (modportal x2, doctor, handoff) was again not the set the previous sightings recorded.

**Verifying c6's second half required editing two source files and could not be done with mutate.** "goes green once `npm run migrate-saves` restamps content" needs SAVE_VERSION bumped *and* SHAPE_CHANGE declared *and* the command actually run, before the suite means anything. mutate does one find/replace and restores; it cannot express "mutate, run a command, then measure". I did it by hand with an explicit `git checkout -- <three paths>` and a `git status --porcelain` after every step. That is a legitimate gap rather than a tool defect, but it is worth naming: a clause whose proof is "do X, then run a command, then the suite is green" has no tool, and this spec had one.

**inspect's import base is relative to scripts/, not to the repo root.** `await import('./scripts/migrate-saves.ts')` resolved to `scripts/scripts/migrate-saves.ts`. The error message did say "Did you mean to import './migrate-saves.ts'?", which recovered it in one round trip — good failure message, but the base is surprising and is not in the brief's tool list.

**Harness.** The Bash tool resets cwd between calls, so every command carried its own absolute `cd`; combined with heredocs into a Windows scratch path this cost two malformed-command retries. `npm run probe`/`inspect` also echo the full scratch path with a `***` redaction in the middle, so a reported path cannot be copy-pasted back into a command.

**Total: ~70 minutes wall clock, of which ~35 was test execution (two full suites, the two mutate runs, the migrated-tree suite) and ~15 was recovering the c6 measurement from the flake.**

### resolve-forward-progress-guard (pass 2, run concurrently in its own worktree)

## 2026-08-07 — resolve-forward-progress-guard, audit pass 2

Fourth audit in a row where `resolveTarget` wrote no manifest, for the same one-line reason: all
three specs on this branch write `proof: vitest <file>` with no quoted test name, so the brief
prints "- none" and step 4 — the step the brief itself calls "the whole exercise" — starts from
zero. I hand-wrote three manifests (15 entries total). The gap is still one line wide: a
`proof: vitest <file>` with no test name could resolve to the file and run the file as the scope,
which is strictly better than refusing to write anything. As it stands the tool's one automated
step is off for 100% of the specs an auditor actually meets.

**What the manifest bought that reading could not, and what it cost.** Group A: 10 mutations of
`src/runtime/forwardProgress.ts` and `runtime.ts`, all file-scoped, 8 baselines — about 2 minutes,
10 killed by 5 distinct named tests. That is the cheap, high-yield shape. Group C: 4 mutations
aimed at the source-wiring residual, 3 of which escalated to whole-suite — about 6 minutes, and it
returned the pass's only real finding: two of the four boundary sources can be rewired to the wrong
candidate with the whole suite green.

**The flake cost me a verdict, not just a re-run.** This is the number worth carrying forward.
mutate's own whole-suite baseline came back with **8 already-failing tests**, and the third wiring
mutation returned UNSTABLE rather than SURVIVED purely because of that noise — a failure that did
not reproduce on re-measurement. So under contention, whole-suite escalation does not merely cost
four minutes, it can cost the answer. `npm test` itself: 3 full runs at one tree — 1 green
1822/1822 (merge-ready's leg), 2 red on exactly `scripts/tasks.test.ts > "refuses five junk
arguments on every bounded command surface"` with `Test timed out in 5000ms`. In isolation that
file is 18/18 in **3.25s** and the single test passes twice at **3.69s / 3.71s**. The filed finding
describes "fails once and passes twice"; with three auditors sharing the machine it is two-in-three,
against a 5s timeout on work that takes 2.2s alone. The isolation check is what makes the
distinction, and it took 40 seconds — cheap, and I would not have trusted the verdict without it.

**Step 4's artifact is not cumulative.** The `--args-from` pass file has nowhere to put the
manifest, so the manifest — the one durable product of the most expensive step — survives only as
prose inside `--evidence N=`. Pass 3 will hand-write it again. A `--manifest <path>` flag that
parked the JSON beside the spec would make each pass start from the last one's aim instead of from
the source. Related and concrete: my first c3 mutation (`return 0` -> `return consecutiveStalls`)
was the WRONG aim and the tool told me so correctly — it escalated and named a different test — but
I only knew to re-aim because the brief explains that `"<a test>" -> <a file>` is not the clause
proving itself. That paragraph earned its place; keep it.

**Cheapest measurement of the pass, again `inspect`.** One call —
`npm run inspect -- "[Object.is(Math.round(-0.0004*1000), -0), Math.ceil((60000*(1-1)-1-0)/Math.round(-0.0004*1000))]"`
-> `[true, Infinity]` — killed a would-be finding about `msUntilEmpty` dividing by zero for a rate
that rounds to zero milli-units. JS `Math.round` returns `-0` there, so the result is `+Infinity`
and the candidate is never selected. Thirty seconds against what would otherwise have been a
paragraph of reasoning I could not have trusted.

**Noise in the brief.** `Goal: (none recorded — add a `## Goal` line …)` is printed as though it
were this spec's omission. 7 of 50 specs have a `## Goal`. Either the field is a convention nobody
adopted, in which case the nag should go, or it is required, in which case 43 specs need it — but
telling one auditor about it mid-brief converts a repo-wide gap into per-pass noise, and the
deferral route it gates is effectively unavailable for almost every spec.

Wall clock for the pass: roughly 35 minutes, of which ~8 was mutation runs, ~6 was three full-suite
runs plus the isolation check, and the rest reading `runtime.ts`/`effects.ts`/`units.ts` closely
enough to prove which mutations could not hang. That last part is unavoidable and correct — the
spec's own Decisions section warns about it — but it is the reason a manifest is expensive to aim
for this particular subject.

## 2026-08-07 — dangling-reference-on-field-edit and offline-progression, passes 1 and 2 (six auditors, one shared worktree)

Written by the orchestrator, not the auditors. That is itself the first entry.

**The orchestrator suppressed step 8 six times and nearly lost every lesson below.** Three auditors
per pass ran concurrently in ONE worktree, so each brief carried "do not write the tool-friction
file; put it in your report instead" — the same override that kept them off `docs/tasks.jsonl` and
the git index. Store writes and git writes genuinely must be serialised. This file must not: it is
append-only prose, one dated section per pass, and two agents appending to it conflict no worse than
two commits do. The override was applied to it by reflex because it sat in the same sentence as the
real hazards. Everything here survived only because the orchestrator still had the reports in
context when asked whether the lessons had persisted. The sibling session, which gave each auditor
its own worktree, wrote its six entries normally.

**`npx rg` fetches and executes an untrusted package.** An auditor typed `npx rg`; npm installed
`rg@0.0.2` from the registry and ran it. It printed `README.md already exists. run with -f to
overwrite` and returned nothing for three consecutive searches — output a scanner reads as "no
matches", not as failure. In a read-only audit over a worktree two other auditors were reading, an
arbitrary package executing with write access is a real hazard, and it was caught only because the
auditor checked `git status` afterwards. Filed as a finding as well as recorded here.

**Concurrent agents share one scratchpad path and silently overwrite each other's measurements.**
Two pass-1 auditors wrote `scratchpad/perf.js` and `scratchpad/perf2.js`; both were clobbered
mid-audit, one of them by a benchmark referencing a `scratchpad/before/src/` tree its author never
created. No numbers were lost only because both had already captured them. A run that wrote then
read would have measured another agent's code and reported it as its own. Pass 2's briefs added
"write into your own private subdirectory", which worked — but nothing in the tooling suggests or
enforces it.

**`mutate` has no way to validate a manifest without running it.** It refuses a `find` that does not
occur exactly once, but only after starting. Because the auditors were forbidden from running it,
they hand-verified every `find` string — occurrence counts, indentation, a literal `\0`, and CRLF —
with node one-liners and `sed | cat -A`. A `--check` that parses the manifest and reports occurrence
counts per entry would have cost nothing and saved that in three separate passes. The orchestrator
paid it too: one manifest's first target reported 0 occurrences purely from shell escaping of `\0`,
and only re-verifying by `JSON.parse`ing the manifest itself showed the target was fine.

**`mutate` escalating to the whole suite collides with the known subprocess-timeout flake.** Two
mutations came back UNSTABLE — not KILLED, not SURVIVED — because `scripts/modportal.test.ts` timed
out during whole-suite escalation and could not be attributed. Settling one of them took three runs
and a re-scope to `tests: ["src"]`. The flake is filed; the compounding effect on `mutate`'s verdict
ladder is worth knowing, because an UNSTABLE verdict costs a whole re-run and reads as neither
evidence nor absence of it.

**`audit-prompt` wrote no mutation manifest for either spec**, reporting "no proof target on this
spec resolved to a test this brief could name" — while every clause carries `proof: vitest <file>`
and those files exist. Step 4 then instructs the auditor to set each entry's `file` and `find`
against a manifest that does not exist, so three auditors wrote one from scratch, including
discovering the field names by reading `scripts/mutate.ts`. The message names what the tool did not
do rather than which target failed to resolve, so none of them could tell a resolver bug from a
deliberate refusal.

**`audit-prompt` on a branch whose inferred spec is not the one being audited suppresses the pass
file itself.** Auditing `offline-progression` from a branch inferred as
`dangling-reference-on-field-edit` printed a WARNING and wrote neither manifest nor pass file. The
warning is right; the consequence is that the pass-file format then exists nowhere the brief points
to, and the auditor recovered it by reading `auditArgsSkeleton` in `scripts/tasks/audit.ts`.

**The pass-file parser has one trap worth stating.** A continuation line beginning with `--`
is parsed as a new flag. Evidence prose that wrapped before `--maxWorkers=4` silently truncated a
clause's evidence; the fix was to reflow so no continuation line starts with a dash. Nothing warns.

**`merge-ready` re-runs the full suite unconditionally** — 62s of its wall clock, immediately after
the auditor had run the identical suite. There is no way to hand it a result it could trust.

**Two findings' reproductions were not re-runnable as written.** Neither recorded its modules'
`dependencies:` lines, and module load order is topological, so a pass-2 auditor's first two
attempts put `# remove` after the re-creation and then hit "base is not this module or one of its
dependencies". Three round-trips to reproduce a finding that claimed to be measured. A finding's
evidence should carry the module sources verbatim.

**`serializeSave` and `loadSave` disagree on shape.** `serializeSave` emits `{version, ...diff}`;
`loadSave` wants `{version, diff}`, so round-tripping the repo's own save bytes fails with "save
holds an unknown field: version" until reshaped by hand.

**`npm run inspect` is the load-bearing tool of a concurrent audit, and worth protecting.** It
answered every question `mutate` could not, left nothing on disk, and is safe to run while other
agents read the tree — which `mutate` is not. One auditor ran sixteen load-path fixtures through it
as stdin bodies; another used it for a 3972-universe fuzz and a before/after differential against
`git archive` of the base tree. Every one of those would otherwise have been a scratch `*.test.ts`
inside a worktree two other agents were reading. Recording it as friction avoided rather than
friction met.

## 2026-08-07 — audit pass 1, a-green-run-means-the-tree-is-green (opus-auditor-p1)

- `npm run mutate` could not return a single KILLED verdict. 22 of the 24 entries I aimed broke a
  test and every one came back ERROR: `parseFailedTests` cannot read vitest's project-qualified
  `FAIL  |tools| <file> > <suite> > <test>` line, which is what two configured projects make it
  print. Cost: two full manifest runs (~13 and ~9 minutes) plus a throwaway failing test to
  confirm the reporter format, and every "met" verdict in this pass had to be justified from
  failure text read by eye out of an ERROR row. Filed HIGH. This is step 4 of the brief the tool
  itself generates, and no auditor on any spec can currently satisfy it as written.
- `audit-prompt` printed "no manifest was written" for step 4 and then step 4 told me to aim one
  anyway. Aiming it by hand was the right instruction, but the brief spends a line saying the tool
  declined rather than a line saying what a good entry looks like; the format had to be read out of
  `parseManifest` in `scripts/mutate.ts`. Already filed as
  `audit-prompt-generates-no-mutation-manifest-for-any-spec-who`.
- Measuring c7 and c8 honestly cost five full suite runs (two `npx vitest run --reporter=json
  scripts` and three `npm test`), about 5 minutes of wall clock, and that was the cheapest way to
  check a measurement the branch had recorded rather than asserted. Worth it: the re-run disagreed
  with the record, which is the finding.
- `npm run tasks -- merge-ready` was the one leg of this that cost nothing to trust: one invocation,
  every gate, and the only failure was the pass I was about to file.

## 2026-08-07 — audit pass 2, a-green-run-means-the-tree-is-green (opus-auditor-p2)

- `audit-prompt` run from the main checkout answered about the wrong tree, and answered
  confidently. The branch lives in `.claude/worktrees/<slug>`; run from `C:/…/UniversalisRPG` the
  brief printed `Diff range: 431ab07..431ab07`, "Commits in this range: none", "Diff stat: (none)",
  every clause `unknown`, no pass-1 record, and step 7 as "do not file a pass — nothing relates this
  slug to this branch". Every one of those is a true statement about the checkout it was run in and
  a false statement about the audit I was commissioned for. Cost: one wasted brief and the ~2
  minutes to notice `git worktree list` explained it. The branch name is in the command line; a
  brief that cannot find the slug's commits could say "this slug is checked out at <path>" instead
  of concluding the branch has no diff.
- `mutate`'s `test` field takes a vitest `-t` substring, but the brief, the usage text and the
  survivor rows all print names in `file > suite > test` form. Copying a name out of a survivor row
  into a manifest is refused with "no test named … ran in <file>", which reads as "you aimed at a
  test that does not exist" rather than "drop the suite prefix". Cost: one refused manifest run.
- `mutate` itself was the whole value of this pass and worked exactly as documented — pass 1's
  `|tools|` fix has landed, and 17 of 22 entries came back KILLED with a named test and a
  re-measurement. The five survivors are five of the six findings I filed; four of them are lines
  no reading of the diff would have flagged. Two manifest runs, ~11 and ~8 minutes.
- Measuring c7 and c8 again cost five full suite runs (two `npx vitest run --reporter=json scripts`,
  three `npm test`), ~5 minutes wall. Unavoidable and worth it: c7's residue moved from six tests
  over 2000ms to one-to-three, which is a number no static reading produces.
- `merge-ready` again cost one invocation and reported exactly the two legs the pass was about.

## 2026-08-07 — audit pass 3, a-green-run-means-the-tree-is-green (opus-auditor-p3)

- `tasks audit --args-from` refused the whole file with "`--commit` describes a finding, and no
  `--finding` has been opened yet" because one wrapped line of clause evidence happened to begin
  with `--commit HEAD`. The continuation rule is "a line that does not open with `--`", and the
  evidence a pass is asked to write quotes command lines and test names constantly, so any flag-like
  token landing at column zero after a wrap is indistinguishable from a flag. Cost: one refused
  filing and a scan of the file for stray `^--` lines. The error names the offending flag but not
  the line number, and the flag it names does not exist in the file as a flag.
- Three whole-suite mutation escalations cost ~9 minutes between them, and all three came back
  SURVIVED — which is the point: they were re-measurements of pass 2's three unreviewed findings,
  and confirming a survivor still survives is worth the wall clock. Narrow entries were nearly free;
  the price is entirely in the escalation, and `mutate` spends it only where it must.
- `mutate`'s `test` field taking a `-t` substring bit again, but only because pass 2 wrote it down
  here — that note is what saved the round-trip. Worth keeping.
- Measuring c7 and c8 cost five full suite runs (two `npx vitest run --reporter=json
  --configLoader runner scripts`, three `npm test`), ~5 minutes wall. Third pass in a row to pay it,
  third pass in a row where the number moved: c7's residue went six tests over 2000ms, then one to
  three, now exactly one in both runs. A clause whose grade turns on a measurement nobody can cache
  is expensive on purpose and cheap against the alternative.
- Recording a clause `deferred` resolves the clause standing but leaves the `undelivered` record an
  earlier pass created open, so `merge-ready`'s `spec` leg still fails on member tasks the `clauses`
  leg now says are settled. Already filed as
  `a-later-pass-grading-a-clause-deferred-cannot-convert-the-un`; this pass is its second sighting,
  and c5 shows it is not specific to `deferred` — grading a clause `met` leaves the record open too.
