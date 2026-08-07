# a-mutation-verdict-names-the-test-that-changed

## Deliverable

`mutate` is the one tool this repository trusts to say a test proves what it claims, and it decides
that by counting. `TestRun` carries `failed`, `passed`, `total`; `Baseline` carries `failed`,
`total`, `ran`; and `verdictOf` is one line — `run.failed > wasFailing ? 'KILLED' : 'SURVIVED'`. No
identity is captured anywhere, so **any** failure appearing during a mutation run is credited to the
mutation. The baseline subtraction cannot help: it corrects for a tree that was already red, not for
one that goes red intermittently.

The known flake is three slow spawn-heavy tests that each pass alone and tip over under **full-suite
contention**, filed as `npm-test-flakes-on-three-slow-spawn-heavy-tests-under-full-s`. And the
escalation ladder sends a survivor **up to whole-suite scope**. So the step that exists to catch a
survivor is the step most exposed to manufacturing a kill, and the tool is least trustworthy exactly
where it is doing its most important job. A false `SURVIVED` costs an argument; a false `KILLED`
reads as proof, and a clause graded met on it is a clause nothing proved.

It was caught once, by an auditor who re-ran an identical entry and got `KILLED 2 failed` and then
`SURVIVED 0 failed` from the same manifest against the same tree. Nothing asks anyone to do that.

The remedy is stated as a property and not against those three test names, because a fix aimed at
today's flake is the too-small fix this repository has now measured seven times: **a kill is a named
test going from pass to fail, not a count going up.** Retiring the flake is a separate and lesser
job — the tool must not be able to convert *any* intermittent failure into proof, and there will
always be another one.

Out of scope, deliberately: fixing the three flaky tests. That is filed and is somebody's afternoon.
This branch makes their flakiness *visible in the verdict* rather than silently load-bearing, which
is the part that does not need re-doing the next time a different test gets slow.

Proof:

- [c1] **A verdict is attributable to a named test.** A run that reports `KILLED` names the test
  whose result changed, and one that cannot name a changed test is not a kill — it is an error,
  reported as one. Counting is not attribution, and this clause is the whole difference.
  proof: vitest scripts/mutate.test.ts
- [c2] **A test that fails without the mutation never contributes to a verdict**, whether it failed
  in the baseline or is failing for a reason the mutation did not cause. Attribution runs against
  what the baseline observed per test, not against a total.
  proof: vitest scripts/mutate.test.ts
- [c3] **Widening the scope cannot widen what counts as a kill.** A survivor escalated to its file
  or to the whole suite is still judged on tests attributable to the mutation, so the escalation
  ladder cannot turn an unrelated failure into proof. This is where the defect actually bites and a
  fix that leaves it uncovered has fixed the reproduction and not the property.
  proof: vitest scripts/mutate.test.ts
- [c4] **The same manifest against the same tree reports the same verdicts, or says why not.** A
  verdict that changes between identical runs is reported as unstable rather than returned as fact —
  which is the check that would have caught this defect the first time instead of by accident.
  proof: vitest scripts/mutate.test.ts
- [c5] Every audit brief that tells an auditor how to read a verdict says what attribution means, so
  a `KILLED` is read as "this named test changed" rather than as "the number went up".
  proof: vitest scripts/tasks/audit.test.ts

## Goal

Make a mutation verdict mean what every audit in this repository has been reading it to mean.

## Decisions

- **Attribution, not flake-retirement.** The three flaky tests are filed separately and are not
  touched here. A fix that made today's flake go away would leave the mechanism intact for the next
  slow test, and this repository's own measured failure mode is a fix aimed at the reproduction
  rather than at the property — seven of twenty-three fixes, every one of that shape.
- **A `KILLED` that cannot name a test is an `ERROR`, not a `SURVIVED`.** The two are different
  facts and `mutate` already keeps that distinction for a mutation that does not build. Collapsing
  an unattributable kill into `SURVIVED` would hide a broken measurement inside a routine verdict,
  which is the same shape as the defect being fixed.
- **c4 is a property of the tool, not a retry loop.** Detecting instability is the deliverable;
  deciding what to do about an unstable verdict is the auditor's, and the tool's job is to refuse to
  present one as fact.
- **The audit brief is in scope (c5) although it is a different file.** A verdict whose meaning
  changed and a brief that still explains the old meaning are one change, and splitting them is how
  the tool and its instructions drift — which this repository has already filed under
  `the-brief-generates-a-mutation-manifest-and-never-says-how-to-read-its-verdicts`.

## Open questions

- Where per-test identity comes from: vitest's JSON reporter, or parsing the names already present
  in the captured `raw` output, which the flake finding itself quotes verbatim. Delegated — whoever
  reads `mutate.ts` and its existing parser is better placed than this session to choose, and c1
  states the property either way.
- Whether c3's "attributable to the mutation" is best drawn at the manifest entry's own `tests`
  scope or by a rule about which files a mutated line can reach. The first is cheap and slightly
  conservative; the second is more accurate and more machinery. State the boundary with reasoning
  rather than listing cases.

## Audit passes

### Pass 1 — 2026-08-07

- base: `5fec46ba9cc88e4aa81bdec98e0a0f97fa4a73e9`
- head: `3338d3ed308243475bf09057a703ead27dcec1bb`
- proof 1: met — Hand-driven, deliberately using none of scripts/mutate.ts: the line was edited on disk, npx vitest was run directly against scripts/mutate.test.ts, the named failures were read out of vitest's own stderr FAIL lines, and the file restored with git checkout (tree clean after each). Two mutations, each killed by exactly the test that states the clause. (a) scripts/mutate.ts "verdict: attributed.length > 0 ? 'KILLED' : 'SURVIVED'," replaced by "verdict: run.failed > wasFailing ? 'KILLED' : 'SURVIVED'," (main's counting form) fails 1 of 149: "mutate: attributing a verdict to a test > kills on a different test failing, even when the same number of them failed" — a baseline of one failure and a run of one failure, where a count cannot separate them and attribution can. (b) "if (attributed.length === 0 && run.failed > wasFailing) {" replaced by "if (false) {" fails 1 of 149: "is an error, not a kill, when the failures that appeared cannot be named". The tool corroborates both (npm run mutate over the same two entries: KILLED, naming the same two tests). Ground truth for the parse was captured separately from a real vitest 4.1.9 run: FAIL lines arrive on stderr, forward-slash paths, names untruncated, and a suite whose beforeAll throws prints a FAIL line with no test under it — so the worker's reporter decisions check out against real output rather than against the fixtures. Limit on this grade: a KILLED can still name a test the tally did not count as failing, see finding ma-2.
- proof 2: met — Hand-driven as above. scripts/mutate.ts "const attributed = run.failures.filter((name) => !before.has(name));" replaced by "const attributed = [...run.failures];" fails 2 of 149 in scripts/mutate.test.ts: "mutate: a tree that was already red > does not credit a mutation for failures the baseline already had" and "mutate: attributing a verdict to a test > does not credit a mutation for a test that was failing without it". Both name the per-test baseline set rather than the count, which is what the clause distinguishes. Tree clean after restore; npm run mutate over the same entry agrees (KILLED, same two names).
- proof 3: met — Hand-driven as above. scripts/mutate.ts "const rung: Pick<Mutation, 'tests' | 'test'> = { tests: filesOf(found.attributed) };" replaced by "{ tests: undefined };" — that is, confirm the kill at the same wide scope that produced it, so widening would once again widen — fails 11 of 149 in scripts/mutate.test.ts, headed by "mutate: a kill that has to happen twice > will not let a failure that only happens under the whole suite become proof" and "does not confirm a kill by a test that is red at the scope it was re-run in". The confirmation phase is reached by every kill at every scope, not only by an escalated one, which is what makes the property hold for an entry that declares no tests at all. Residual, measured and filed as ma-5: the confirmation runs the union of the attributed tests' files in one vitest invocation, so the scope meant to filter contention is assembled out of the contended tests and widens as more of them fire. Driven through runMutations with injected runTests: two flakes in two files produce a two-file re-run in which one reproduces, and the entry is reported KILLED attributed to that flake.
- proof 4: met — Hand-driven as above. scripts/mutate.ts "return { ...result, verdict: 'UNSTABLE', attributed: undefined, unreproduced: attributed, confirmedAt: scope };" replaced by "return { ...result, confirmedAt: scope };" fails 3 of 149 in scripts/mutate.test.ts, including "reports a verdict that changed between two identical measurements as unstable, not as fact". The confirmation is a single extra measurement that can only downgrade, never resolve, so it is the property the clause asks for and not the retry loop the spec's Decisions rule out. Graded met for the kill direction only, and the limit is load-bearing: driven through runMutations with injected runTests, two identical runs over an identical tree where the watching test flaked green return SURVIVED (formatted row: "m  SURVIVED  0 failed of 20  [whole suite]", no annotation of any kind) and KILLED respectively, and nothing says why not. A survivor is never re-measured. Filed as ma-4; a later pass reading "c4 met" must not read it as covering that direction.
- proof 5: met — Hand-driven: scripts/tasks/audit.ts MUTATE_VERDICTS[0], the sentence "A verdict is attributed to a named test, never to a count. ...", replaced by the empty string, fails 1 of 120 in scripts/tasks/audit.test.ts: "the brief arriving with the answers rather than the instructions > says a verdict is attributed to a named test, not to a count". Verified by reading the generated brief itself rather than only the assertion: npm run tasks -- audit-prompt a-mutation-verdict-names-the-test-that-changed prints the attribution sentence, the UNSTABLE verdict and the "Widening the scope cannot widen what counts as a kill" clause in its "How to read what mutate prints back" block, so the brief and the tool now say the same thing. Tree clean after restore.
