# audit-loop-costs-less

## Deliverable

Two audits of `tool-friction-backlog` ran on 2026-08-04 and `npm run session-timing` measured both.
Pass 1 took 25.2 minutes with 15.1 of them spent waiting on tools — 60%, no human in the loop. Pass
2 took 39.1 minutes and reads better at 40% waiting, but that is arithmetic rather than progress:
it waited **15.5 minutes**, slightly more than pass 1, and its share fell only because it generated
for 23.6 minutes instead of 10.2. Its auditor was resourceful about it — backgrounded the expensive
command, polled for it, then ran out of other work and blocked on the poll for 421 seconds.
Backgrounding moved when the cost was paid without reducing it, and a workaround an auditor has to
invent is evidence for the clause, not a substitute for it.

Across both audits the waiting is 30.6 minutes, and it is concentrated rather than spread: `npm run
mutate` accounts for 17.5 of them, 57% of everything either auditor waited for. A third session
that day, `c05bcd20`, spent 47% of its wall clock waiting with the same command at the top. This
branch is that measurement acted on, and `## Targets` below names every command it is aimed at.

Two causes, both measured on `da8ddb0`. `scripts/tasks.test.ts` is 84 of the suite's 89 seconds —
264 tests in one file, and one test file is one vitest worker, so 23 of 24 cores idle behind it. It
is the floor under `npm test`, under `merge-ready`, and under every mutation whose scope names it.
And mutate's narrowest scope is a whole file, so a manifest of five task-system mutations pays that
84 seconds six times, even though every `proof:` target in the spec already names the exact test it
means.

One correctness gap rides along, because it is in the same file and the same run. `mutate` proves it
put back what it took and is blind to what a run added: a test executing under a mutant wrote a file
that nothing restored and nothing mentioned, and it surfaced later as an untracked file caught by
`audit-status` — a gate for something else entirely. It was found during `tool-friction-backlog` and
never filed. It is filed now, as `mutate-leaves-behind-what-a-mutant-created`.

The auditors' other cost is not how slow the tools are but how little they say — 191 seconds in pass
1 spent running six test files purely to learn their names, then a hand-written matcher, three times.
That is a second branch, `audit-brief-arrives-complete`, and it follows this one because the manifest
it learns to generate should name a test rather than a file.

Proof:

- [c1] A mutation may name a single test, not only a file, and the run it is measured against is that
  test alone. Every `proof:` target in this repo already carries the name (`proof: vitest <file>
  "<test>"`), so the manifest a brief generates and the target a spec declares are the same fact.
  Measured: the auditor's own last command, `npx vitest run scripts/tasks/mergeReady.test.ts -t
  "merge-ready fails on a dirty tree"`, returned in 4 seconds against 90 for the file. The field is
  accepted by `parseManifest` against `FIELDS` (`mutate.ts:70-102`), named by `scopeOf`
  (`mutate.ts:138`), and reaches vitest as `-t` through `runTests` (`mutate.ts:481`) — the one line
  in the tool that decides what a scope actually runs.
  proof: vitest scripts/mutate.test.ts "a mutation may name one test, and is measured against that test alone"
  proof: vitest scripts/mutate.test.ts "a manifest naming a test that does not exist is refused before anything is written"

- [c2] The escalation ladder gains its middle rung. A mutation that survives its named test is
  re-measured against that test's whole file before the whole suite, and a verdict still names the
  widest scope it reached. Narrowing must not weaken the tool: the existing rule is that a mutation
  dying in a narrow scope is settled and a survivor pays for a wider one, and a new rung inherits
  it rather than replacing it. The escalation phase is the block in `runMutations` at
  `mutate.ts:222-231`, which today is a single widening to `WHOLE_SUITE` and becomes a ladder; its
  baselines stay taken through `baselineFor` on an unmutated tree, memoized per scope, so a third
  rung must not cost a third baseline for scopes nothing escalates to.
  proof: vitest scripts/mutate.test.ts "a mutation surviving its named test is re-measured against the whole file before the whole suite"
  proof: vitest scripts/mutate.test.ts "a verdict names every scope an escalation climbed through"

- [c3] A mutate run reports every path the working tree gained or lost while a mutant was on disk, not
  only the mutation targets it put back. The tool already ends by proving it returned what it took
  (`runMutations`, `mutate.ts:296-304`) — that proof is completed rather than replaced, because
  today it can only ever be about `touched` (`mutate.ts:251`), which is only ever `mutation.file`,
  and `captured` (`mutate.ts:503`), which is only ever a mutation target. A file a test writes while
  running under a mutant is in neither, so nothing puts it back and nothing mentions it. New paths
  are reported, not deleted: a run that silently removed files would be a worse tool than one that
  silently leaves them, and the report is what the exit handler cannot safely act on alone.
  proof: vitest scripts/mutate.test.ts "a file the tree gained while a mutant was on disk is named in the report"
  proof: vitest scripts/mutate.test.ts "a run that added nothing says so rather than staying silent"
  proof: vitest scripts/mutate.test.ts "a path the run gained is reported and not deleted"

- [c4] `merge-ready` runs its independent legs concurrently, still reports every leg in a stable order,
  and reaches the same verdict it reaches in series. The legs are separate processes over shared
  read-only state, and the command already collects every result before emitting a line, so
  concurrency changes nothing a caller can observe except the clock. The serial loop is
  `runMergeReady` at `mergeReady.ts:45`, over the `LEGS` table at `mergeReady.ts:16`; the function
  already collects every `LegResult` before its first `emit`, which is what makes the order a
  formatting choice rather than a consequence of scheduling. Measured on `da8ddb0`: 89s tests, 16.2s
  audit-status, 7.8s doctor, 4.5s tsc, 1.0s layer-check, serially ~120s — and the pass-2 auditor
  paid 123s of it in the foreground.
  proof: vitest scripts/tasks/mergeReady.test.ts "every leg is reported, in declaration order, whatever order they finish in"
  proof: vitest scripts/tasks/mergeReady.test.ts "one red leg among green ones still fails the gate and names only itself"

- [c5] No single test file accounts for more than a quarter of `npm test`, and `npm test` completes in
  at most half the 89 seconds measured on `da8ddb0`. Verified by measurement, not by an assertion:
  a wall-clock threshold pinned in a test is a flake on someone else's machine, and CLAUDE.md's own
  five-minute rule is a measured property for the same reason. The auditor re-runs it and records
  the number.

- [c6] The branch reports its own audit's cost. `npm run session-timing` is run against this branch's
  own audit subagent, and the **minutes it spent waiting on tools** are recorded against the 15.1
  and 15.5 measured for the two 2026-08-04 audits of `tool-friction-backlog` — absolute time, not
  the share, because pass 2 already showed a share improving by 20 points while the waiting itself
  went up. A branch that promises a cheaper audit loop and cannot say what its own audit cost has
  not shown its work.

## Targets

Every command either auditor waited on, from `npm run session-timing` over `agent-abc1ea5f`
(pass 1, 15.1m waiting) and `agent-a0c870ed` (pass 2, 15.5m waiting). Nothing below is estimated.

| command | pass 1 | pass 2 | the code that owns the cost | clause |
|---|---|---|---|---|
| `npm run mutate -- <manifest>` | 603s | 23s + 421s blocked on its own poll | `runTests` `mutate.ts:481` spawns one vitest per scope; `scopeOf` `mutate.ts:138` cannot express anything narrower than a file; escalation `mutate.ts:222-231` | 1, 2 |
| `npx vitest run` over the proof-target files | 105s + 86s | 97s | one file is one worker, and `scripts/tasks.test.ts` is 264 tests in 3900 lines — 84s of the suite's 89s | 5 |
| `npm run tasks -- merge-ready` | 2s (backgrounded) | 123s | the serial `for (const leg of LEGS)` in `runMergeReady` `mergeReady.ts:45` | 4 |
| harvesting test names to check `proof:` targets by hand | 191s, plus three hand-written matchers | 6s via `vitest list` | nothing resolves them: parsed at `specDoc.ts:98-105`, printed at `audit.ts:195`, never checked | `audit-brief-arrives-complete` |
| finding the manifest format, then writing 74 lines of it | 3 commands and a `Write` | — | `cmdAuditPrompt` `audit.ts:130` prints instructions where it could print the manifest | `audit-brief-arrives-complete` |
| diff stat, commit list, `## Decisions`, `tasks where` per path | ~19s and the reading | repeated | each already in reach of `cmdAuditPrompt` `audit.ts:130` | `audit-brief-arrives-complete` |
| `grep -rn` across the repository | — | 52s | an auditor searching for where a name is used; `audit-brief-arrives-complete` answers it, this branch does not | — |

`npm run mutate` is 1047 of the 1836 seconds either auditor spent waiting — **57%**, and the reason
clauses 1 and 2 come first. The suite's floor is second at 288s and compounds: it sits inside every
mutate scope and every merge-ready run, so clause 5 discounts the two rows above it.

## Decisions

- The measurement came first and this spec is downstream of it. `npm run session-timing` was built
  on `audit-session-timing` before any clause here was written, so every number above is read off a
  transcript rather than estimated. Nothing in this branch needs to build it again.
- Splitting `scripts/tasks.test.ts` preserves test names and changes only the file they live in.
  `audit-brief-arrives-complete` depends on that: its resolver must tell a moved test apart from a
  missing one, and this branch is what moves them.
- The brief clauses left for `audit-brief-arrives-complete`, and that branch comes after this one.
  The two were one spec until the readings separated them: this branch is about commands that take
  too long, that one is about a brief that makes every auditor rediscover the same things. They also
  order naturally, because a generated manifest should name a test rather than a file, and naming a
  test is clause 1 here.
- The mutate restore gap is in this branch rather than its own. It is a correctness fix, not a speed
  one, but it lands in `scripts/mutate.ts` beside clauses 1 and 2, and this repo cuts slices by file
  because chunks touching one file are one change.
- The proof targets on `tool-friction-backlog` will point at a file that no longer exists once the
  split lands. They are not repaired. A merged spec is history, its clauses were graded against the
  tree as it stood, and rewriting a discharged promise to keep a tool quiet is how a record stops
  being evidence.
- `merge-ready` was not on the pass-1 auditor's critical path — it backgrounded the call and read
  the output later, paying 2 seconds of foreground time. Pass 2 ran it in the foreground and paid
  123. One auditor's habit is not a property of the tool, which is the argument for fixing the leg
  rather than for teaching auditors to background things.
- Backgrounding is a symptom to read, not a technique to adopt. The pass-2 auditor backgrounded
  mutate, polled for it, and then blocked on the poll for 421 seconds once it had nothing left to
  overlap. Its waiting came out at 15.5 minutes against pass 1's 15.1 — the share fell from 60% to
  40% only because it generated for twice as long. A share is not a saving, and no clause here is
  graded on one.
- No gate is added for session timing. The obvious next step from a measurement is a threshold that
  fails a build, and it is refused: the reading lives outside the repository in `~/.claude`, it
  cannot be reproduced in CI, and it is a property of a session rather than of a commit. CLAUDE.md
  asks that a gate earn its place by preventing something that happened. This one would only
  announce it.
- This branch waits for `tool-friction-backlog` to merge. It rewrites `scripts/tasks.test.ts`,
  `scripts/mutate.ts`, `scripts/tasks/audit.ts` and `scripts/tasks/mergeReady.ts` — the four files
  that branch is changing most, and one of them by 544 lines.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-05

- base: `9b16a96ff28cfca863b79ffad4e3592cbf343519`
- head: `8dd7ddcd9c2c5cec97a545724b9b46756440e877`
- proof 1: met — Both targets exist, pass, and die for the right reason: an 8-entry manifest run through npm run mutate (itself using the new test field, so the CLI path parseManifest -> scopeOf -> -t was exercised end to end) KILLED a mutant that dropped the name on the way to the runner (runTests(mutation.tests) without mutation.test in phase 1) via "a mutation may name one test, and is measured against that test alone", and KILLED a mutant that disabled the ran===0 refusal (baseline.ran === -1) via "a manifest naming a test that does not exist is refused before anything is written" — each 1 failed of 126 at named-test scope. The whole run — 8 baselines plus 8 measured runs, 16 vitest invocations — took 34s wall, ~2s per invocation, against ~90s per file-scoped run measured on da8ddb0. Re-run: npm run mutate -- <manifest naming these two tests>.
- proof 2: met — KILLED a mutant that skipped the ladder's middle rung (ladderAbove pushed no file rung) via "a mutation surviving its named test is re-measured against the whole file before the whole suite", and KILLED a mutant that kept only the last scope instead of chaining escalatedFrom via "a verdict names every scope an escalation climbed through" — each 1 failed of 126 at named-test scope. Baseline economy holds twice over: "pays for the baselines the ladder reached, and no others" pins it in-process, and the live mutate run measured exactly the 8 named-test baselines with no file or whole-suite baseline taken, because nothing survived. Narrow-death-settles is inherited: the escalation loop breaks on any non-SURVIVED verdict before paying for a wider rung.
- proof 3: met — KILLED a mutant reporting gained: [] via "a file the tree gained while a mutant was on disk is named in the report", and KILLED a mutant that dropped the gained-nothing line via "a run that added nothing says so rather than staying silent". The third target, "a path the run gained is reported and not deleted", pins a deletion that would have to be written to exist — runMutations has no removal path for gained files, formatReport prints "left in place, not deleted", and the test asserts the file still reads after the run — so it was inspected rather than mutated. Live: this audit's own mutate run printed "The tree gained nothing and lost nothing while this run held it" and git status --porcelain was empty afterwards. The journal lives under os.tmpdir (journalPathFor), so the tool's own state cannot pollute the delta.
- proof 4: unmet — The code and its targets hold at unit level: KILLED a mutant that serialized the legs (awaited each before starting the next — the held-open resolvers never all appear and the declaration-order target times out) via "every leg is reported, in declaration order, whatever order they finish in", and KILLED status === 0 || status === 1 via "one red leg among green ones still fails the gate and names only itself", each 1 failed of 26. But the clause's acceptance criterion — "reaches the same verdict it reaches in series" — fails on the machine the spec's own numbers were measured on: two consecutive npm run tasks -- merge-ready runs on a clean tree (42s and 43s wall, against ~120s serial) both went red on the npm test leg with 5000ms test timeouts (scripts/modportal.test.ts "opts an approved mod in and back out" both times, scripts/tasks/doctor.test.ts "default-store writes stay silent" once), while standalone npm test passed 1583/1583 twice the same hour. The legs are separate processes over shared read-only state, but the CPU is shared state too: npm test already saturates 24 threads, and tsc + audit-status + doctor on top push spawn-heavy 5s-budget tests over their timeout. The serial gate ran npm test uncontended and would have passed. Filed as a finding with the fix's meaning.
- proof 5: unmet — Measured 2026-08-05, 24-thread machine. Second half holds: npm test = 33.08s vitest duration (35s wall), well under the 44.5s ceiling — a 63% cut from 89s. First half fails: by the spec's own measure (file seconds against suite seconds, the "84 of the suite's 89"), scripts/tasks/audit.test.ts ran 32.7s inside the full run (json reporter, endTime-startTime) and 22.99s solo (npx vitest run scripts/tasks/audit.test.ts: Duration 22.99s), with handoff.test.ts at 32.1s and records.test.ts at 31.7s beside it — 70-99% of npm test, not under a quarter. One file is one vitest worker, so a ~23s file is a floor the suite cannot drop below; the split moved test names, not runtime, and the runtime concentrates where the tests spawn a subprocess per CLI call. The branch measured the same fact itself and filed remediation as task-suite-spawn-costs (open): its stdin-seam part is what would discharge this half.
- proof 6: unknown — Not gradable by this pass by design: the clause measures this audit's own subagent with npm run session-timing after the audit completes, and the spec assigns the recording to the commissioning session. Recorded unknown so that nothing reads as verified before that measurement lands against the 15.1 and 15.5 minute baselines.
