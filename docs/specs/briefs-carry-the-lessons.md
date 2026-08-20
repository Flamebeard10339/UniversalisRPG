# briefs-carry-the-lessons

## Goal

Make what one orchestrated run learned reach the next one automatically, instead of dying with the
session that learned it.

## Deliverable

The 2026-08-06 orchestrated run landed four tasks through eleven worker rounds and fourteen audit
passes. Every recurring defect it found was corrected by a sentence typed by hand into a dispatch
message — and each of those sentences changed behaviour within one round of being said. None of them
is in any generated brief. Checked directly: `work-prompt` mentions neither mutation, nor proof, nor
recording a decision the spec was silent on.

So the run's cost is currently paid again by every future run. That is the defect this branch fixes,
and it is the only finding of that run whose fix compounds.

**The three existing briefs gain the lessons that were repeatedly needed. A fourth is written,
because the run proved the orchestrator is a real role with its own failure modes.**

### What `work-prompt` must carry

Four instructions, each traceable to a defect that cost a round:

- **Comments are scarce by principle.** Keep one only if the fact is owned by this file, is not
  derivable from reading it, and is expressible as neither a name, a type, nor a test. Never describe
  another module's contract. Never write an audit finding's rationale into the source — that belongs
  in the commit message. *A worker wrote a four-line comment describing `listQueue`'s ordering from
  inside `roadmap.ts`; two audit passes did not catch it because it landed after the last one.*
- **A test that cannot fail is not proof.** Before claiming a clause met, break the code it covers and
  confirm the named test fails. `npm run mutate` is the tool. *Eleven tests this run looked like proof
  and were not.*
- **Record any decision the spec was silent on, even one you are certain of.** `tasks note --spec` or
  a line in the commit body. *Three instances, from two workers. A decision that does not block is
  precisely the one that leaves no trace — and both workers' choices were defensible; only the silence
  made them findings. Both changed behaviour immediately on being asked once.*
- **File what you notice outside your grant, do not merely mention it.** `tasks add --kind finding`.
  Reporting it in a final message is how it gets lost. *One worker correctly declined to widen its
  scope, reported an adjacent real defect in prose, and it survived only because the orchestrator read
  carefully.* And never cite an id you have not seen in your own store: describe it in prose instead.

### What `audit-prompt` must carry

- **The failure shape, stated generally: an assertion that cannot be false while the code is present
  at all.** Ask of each test what would have to break for it to fail, and whether that is what the
  clause promises. Three forms seen, and the first is by far the most common: a fixture that performs
  a *second* operation whose side effect produces the asserted state (six instances); an expectation
  derived from the structure under test (two); a test written against the class the implementation is
  guaranteed to handle (three).
- **Hunt the next neighbour, not confirmation of the last fix.** A finding names one reproduction, and
  the reproduction is always narrower than the property the clause promises, so a fix aimed at the
  finding's text is systematically too small. *Three clauses failed two or more passes each, every
  time this way.*
- **When a clause has failed twice, ask whether the rule is wrong rather than whether another instance
  exists.** *This is the highest-value instruction in the set. c2 of the clause-deferral spec consumed
  four passes as an ever-longer hand-picked exclusion list; the pass that was asked to challenge the
  sentence found that the guard used a general category where Unicode defines the exact property, and
  that ended it.* A stated boundary with reasoning is a better result than a longer list.
- **Guard over-strictness at least as hard as bypass.** Repeated narrowing is where a guard starts
  refusing legitimate input. *Nothing checked that for four passes.*
- **Ask the silent-guess question explicitly**, and treat "none found" as real only if you looked.
  *Three audits answered it "none found"; the fourth found a real defect that would otherwise have
  merged.*

### What `plan-prompt` must carry

Two habits account for nearly every contract-fault record of the run:

- **State the invariant. Offer instances as illustration, never as extent.** *Four instances: a clause
  naming four call sites where the rule covered six; a clause naming one conflict shape where the
  condition was adjacency; a ruling naming a zero threshold where the property was direction; a class
  list where two orthogonal axes were wanted.*
- **When a clause requires a guard, name the point at which it must act.** Enforce where a value is
  assembled, not where it is read. *Two branches' HIGH findings had this identical root, and neither
  spec said it.*
- **Ask who else computes this answer.** Scope a fix to everywhere the wrong answer is produced, not
  to where the bug was reported. *`a-branch-knows-which-spec-it-owes` fixed spec inference in
  `mergeReady.ts` and left `audit.ts` asking the same question the old broken way; pass 5 of a
  different spec found it, and it nearly ended that audit before it started.*
- **Name what the worker may decide.** A `## Open questions` section listing the delegated decisions
  worked: where it was used, no worker overreached, and every delegated answer came back recorded.

### What `orchestrate-prompt` must carry

The role is new and its failure modes are now observed rather than imagined.

- **The orchestrator is a buffer, not a decision-maker.** It absorbs everything that is not a genuine
  design decision and batches what is into one review. Given a design question it *could* answer, it
  still routes it to a planning session — not to move the decision off the author's desk, but to move
  it where the survey and the rulings already are.
- **A ruling is a contract too, and is written with less review than a clause.** *One ruling named a
  threshold where the case wanted an invariant, and produced a defect an audit then had to find.*
- **Verify what a report claims; do not grade the report.** *Reports were substantially accurate all
  run, and the one hollow verification was the orchestrator's own — a mutation that never applied,
  reported as verified. Confirm the mutation applied before believing the test result.*
- **The orchestrator's own records are invisible to its workers.** The store is per-branch until
  merge, so anything filed on the orchestrator's branch cannot be seen, cited or verified downstream,
  and a worker citing it looks like it invented an excuse. *Found twice, independently, by two
  auditors.*
- **Give every dispatched agent a scratch filename prefix.** *Concurrent agents share one directory
  and overwrote each other's mutation manifests.*
- **Do not tune the brief mid-run if the rates are meant to be comparable.** Sharper briefs find more,
  so a rising defect count measures attention as much as defect density.

Proof:

- [c1] `work-prompt` carries the four worker instructions above, and a test names each so a future
  edit cannot silently drop one.
  proof: vitest scripts/tasks/workPrompt.test.ts
- [c2] `audit-prompt` carries the five auditor instructions above, including the three named forms of
  the false-proof shape, and a test names each.
  proof: vitest scripts/tasks/audit.test.ts
- [c3] `plan-prompt` carries the four planner instructions above, and a test names each.
  proof: vitest scripts/tasks/planPrompt.test.ts
- [c4] `npm run tasks -- orchestrate-prompt` exists and prints the orchestrator's brief, generated the
  way the other three are rather than hand-written into a document nobody opens.
  proof: vitest scripts/tasks/orchestratePrompt.test.ts
- [c5] Every instruction states what to do, not merely what went wrong. A brief that recounts a defect
  teaches nothing a reader can act on; each line names an action, and the evidence for it lives here
  and in the event log rather than in the printed brief.
  proof: vitest scripts/tasks/workPrompt.test.ts
- [c6] The four briefs stay one family. Whatever carries the shared instructions is written once and
  read by each, so a fifth brief added later inherits them and an edit to one does not silently skip
  the others.
  proof: vitest scripts/tasks/workPrompt.test.ts
- [c7] The briefs do not grow without bound. Each addition is a line or two; the whole of this
  branch's additions fits in what a reader will actually read before starting work, and the spec says
  so in a form a later editor can check rather than feel.
  proof: vitest scripts/tasks/audit.test.ts

## Decisions

- **The briefs, not CLAUDE.md.** CLAUDE.md is read by every agent and is already near its stated
  length limit, and these instructions are role-specific: an auditor does not need the worker's
  filing rule and a planner does not need either. A generated brief is the one place that already
  knows which role is reading.
- **Instructions, not narrative.** The evidence for each line is in this spec and in the event log,
  and the brief carries only the instruction. A brief that argues its case is longer, and length is
  the thing that stops a brief being read.
- **A fourth brief rather than folding the orchestrator's lessons into the others.** The run
  established the role has failure modes nobody else has — rulings written with less review than
  clauses, records invisible to its own workers, and the temptation to grade a report rather than the
  work. Those belong to whoever holds the role next, and to nobody else.
- **This is `run-an-orchestrator-over-three-parallel-tasks`'s c6 being delivered.** That spec asked
  for the orchestrator brief to be generated and to carry what the run learned rather than what was
  imagined before it. This branch is where that clause lands, which is why the run's own spec is not
  reopened to hold it.
- **No new gate.** Nothing here refuses a merge or checks that anyone followed the advice. The
  repository's stance is that a gate earns its place by preventing something that actually happened,
  and what actually happened is that the advice was never offered.

## Open questions

- Whether the shared instructions live in a new small module or in `context.ts` beside the other
  cross-brief helpers. c6 fixes that they are written once; the worker picks the home after reading
  how the three briefs already share code.
- Whether `orchestrate-prompt` takes an argument. The other three take a slug or an id; an
  orchestrator is not working one spec, so it may take a list, a spec set, or nothing at all. The
  worker decides from what the brief actually needs to print.
- Whether the false-proof forms belong in `audit-prompt` as three named shapes or as the single
  general sentence with the forms as examples. The general sentence is the durable part; the worker
  should weigh whether the examples earn their length or merely make the brief longer.

## Audit passes

### Pass 1 — 2026-08-06

- base: `87b3be62121351f4cbc7361112788fb008467afc`
- head: `f151494f61a2e8d4ce5574c104a8375e2f392197`
- proof 1: met — vitest scripts/tasks/workPrompt.test.ts has one it() per worker instruction, each
asserting a literal substring of that instruction's printed text (not a loop over WORKER_LESSONS
itself). Confirmed all four are present: comment-scarcity, mutation-is-proof, record-the-decision,
file-what-you-notice. Mutation-tested with a hand-built manifest since the brief supplies none:
c1-worker-empty-array (call site in workPrompt.ts changed from WORKER_LESSONS to []) KILLED 4 of 7
tests at file scope; c1-worker-drop-one (removed the "Record any decision" entry from
briefLessons.ts) KILLED exactly 1 of 7, and it was the one named test for that instruction, at
named-test scope with no escalation. Both the empty-array and the single-drop shapes the worker
said it was avoiding are the ones I mutated, and both die.
- proof 2: met — vitest scripts/tasks/audit.test.ts has one it() per auditor instruction, five total,
each a literal-substring assertion: the false-proof question with its three named forms in the
same sentence as examples, hunt-the-next-neighbour, the twice-failed-clause question,
over-strictness, and the silent-guess question. c2-auditor-empty-array (call site in audit.ts)
KILLED 5 of 118 at file scope; c2-auditor-drop-one (removed the "Guard over-strictness" entry)
KILLED exactly the 1 named test, at named-test scope, no escalation.
- proof 3: met — vitest scripts/tasks/planPrompt.test.ts has one it() per planner instruction, four
total: state-the-invariant, guard-placement, who-else-computes-this, name-what-the-worker-may-decide.
c3-planner-empty-array KILLED 4 of 12 at file scope; c3-planner-drop-one (removed "Ask who else
computes this answer") KILLED exactly the 1 named test, named-test scope, no escalation.
- proof 4: met — `tasks orchestrate-prompt` is registered in commands.ts, generated the same way as the
other three (cmdOrchestratePrompt in orchestratePrompt.ts, no hand-written competing document —
grepped docs/workflow.md and CLAUDE.md for "orchestrat", the only hit is an unrelated citation of a
research file). vitest scripts/tasks/orchestratePrompt.test.ts covers existence, no-argument
behaviour, per-spec clause standing, unknown-spec handling and --help, plus one it() per orchestrator
instruction (six total). c4-orchestrator-empty-array KILLED 6 of 10 at file scope; c4-orchestrator-drop-one
(removed "Give every dispatched agent a scratch filename prefix") KILLED exactly the 1 named test,
named-test scope, no escalation.
- proof 5: unmet — Read all nineteen printed instructions (title+body concatenated, since that is what
printLessons actually prints on one line). Eighteen name an action a reader can do differently next
time. One does not: ORCHESTRATOR_LESSONS[3] in briefLessons.ts, "The orchestrator's own records are
invisible to its workers. The store is per-branch until merge, so anything filed on the
orchestrator's branch cannot be seen, cited or verified downstream." Both title and body are pure
description of a constraint; neither contains an imperative. Compare the spec's own fuller version,
which the worker correctly trimmed for c5's evidence-exclusion rule but which happened to carry the
only actionable part in its excluded clause: "...and a worker citing it looks like it invented an
excuse." What survived into the brief is true and was found twice by real auditors, but an
orchestrator reading it is not told to do anything differently — it is the recounting of a
constraint, not an instruction. This is exactly the failure c5 names ("An instruction a reader cannot
act on is a defect against c5 however true it is"). I also checked whether the false-proof examples
in AUDITOR_LESSONS[0] read as extent rather than illustration (the planner's own lesson's failure
mode) — they read as illustration, correctly hedged by "for example". Filed as a finding below
rather than fixed; a one-line rewrite (e.g. "Do not cite your own findings by task id when
dispatching to a worker — restate them in the dispatch message text, since the store is per-branch
and invisible to them until merge") would close it.
- proof 6: met — Grep confirms all four brief files import printLessons from ./briefLessons and call it;
the four lesson arrays are each defined exactly once (vitest's own "share one instruction carrier"
tests assert both of these mechanically). Mutation-tested the sharing claim directly:
c6-planPrompt-bypasses-shared-carrier changed planPrompt.ts to print the same lines through a
hand-rolled console.log loop instead of calling printLessons — output is byte-identical, so every
content-level test still passes, but the "renders through the same printLessons function" test
KILLED it at its own named-test scope with no escalation, which is the one test in the suite whose
whole job is to notice a brief that stopped sharing the carrier. A fifth brief would import Lesson,
printLessons and a new FIFTH_LESSONS array from briefLessons.ts exactly as the existing four do —
nothing about the carrier is brief-specific.
- proof 7: met — MAX_LESSON_COUNT = 24 in briefLessons.ts is checked against totalLessonCount() (19: 4
worker + 5 auditor + 4 planner + 6 orchestrator) by a real assertion in audit.test.ts.
c7-budget-lowered-below-current-total (24 to 10) KILLED the named budget test at named-test scope,
no escalation — this is not a check that can never fail. It is weaker than a hard ceiling: the
constant lives in the same file as the lists it counts, so the same commit that pushes the total
past 24 can also raise the number, and nothing forces a second reviewer or a recorded justification
for doing so. I do not think that makes it theatre, though — it is the same shape as every numeric
budget the repo already accepts elsewhere (e.g. the 300-token CLAUDE.md limit is enforced the same
way, by a human noticing a diff), it is tight relative to current usage (5 slots of headroom, not
500), and the decision log for this pass records the exact reasoning for choosing 24 over a
character count. The count-not-characters choice is right: a character budget would penalise a
clearer, longer sentence over a shorter unclear one, which is the opposite of what c5 asks for.

### Pass 2 — 2026-08-06

- base: `87b3be62121351f4cbc7361112788fb008467afc`
- head: `af7248a7987cb5b08bbab6e01f38aa4955697019`
- proof 1: met — Independent re-check, pass 2. vitest scripts/tasks/workPrompt.test.ts still has one
it() per worker instruction (comment-scarcity/CLAUDE.md pointer, mutation-is-proof,
record-the-decision, file-what-you-notice), each a literal-substring assertion. Mutation-tested
fresh: c1-worker-empty-array (call site in workPrompt.ts, WORKER_LESSONS to []) KILLED 4 of 7 at
file scope; c1-worker-drop-comment-pointer (removed the rewritten first entry, the one pass 1
found unmet and this pass's own commit changed) KILLED exactly the 1 named test
("points at CLAUDE.md for the comment rule rather than re-deriving it") at named-test scope, no
escalation. Manifest run: 8 killed, 0 survived, 0 errored.
- proof 2: met — Independent re-check, pass 2. vitest scripts/tasks/audit.test.ts still has one it()
per auditor instruction, five total, unchanged by this pass's fix (only WORKER_LESSONS[0] and
ORCHESTRATOR_LESSONS[3] were rewritten). Re-ran c2-auditor-empty-array (call site in audit.ts,
AUDITOR_LESSONS to []): KILLED 5 of 119 at file scope. Confirmed AUDITOR_LESSONS[0]'s three named
false-proof forms still read as illustration ("for example") rather than extent, matching pass 1.
- proof 3: met — Independent re-check, pass 2. vitest scripts/tasks/planPrompt.test.ts still has one
it() per planner instruction, four total, unchanged by this pass's fix. Re-ran
c3-planner-empty-array (call site in planPrompt.ts, PLANNER_LESSONS to []): KILLED 4 of 13 at
file scope. planPrompt.test.ts also grew its own c5 narrative-exclusion test this pass — see c5's
evidence below.
- proof 4: met — Independent re-check, pass 2. `tasks orchestrate-prompt` still registered in
commands.ts (cmdOrchestratePrompt), grepped docs/workflow.md and CLAUDE.md for "orchestrat" again
— only the same unrelated citation. Mutation-tested fresh: c4-orchestrator-empty-array (call site
in orchestratePrompt.ts, ORCHESTRATOR_LESSONS to []) KILLED 6 of 11 at file scope;
c4-orchestrator-drop-file-on-worker-branch (removed the rewritten fourth entry — the exact one
pass 1 found unmet) KILLED exactly the 1 named test ("carries the file-on-the-worker's-branch
rule") at named-test scope, no escalation. This is the clause the pass-1 finding was filed
against; the rewrite closes it and the test still discriminates.
- proof 5: met — Read all nineteen printed instructions myself (title+body concatenated per line, the
literal `printLessons` output format), independent of pass 1's read and of the worker's own
"checked the other eighteen by hand" claim. All nineteen now name an action a reader can do
differently: the four worker, five auditor and four planner entries were already actionable in
pass 1 and are unchanged; the two entries this branch's fix touched are the ones that matter.
WORKER_LESSONS[0] now reads "CLAUDE.md's `# Comments` section owns the comment rule — do not
re-derive it here." plus "never describe another module's contract, and never write an audit
finding's rationale into the source" — both an instruction (do not re-derive) and the two clauses
restated as direct action. ORCHESTRATOR_LESSONS[3], the one pass 1 found unmet, now reads "File a
record on the worker's branch, not the orchestrator's." plus "never hand a worker an id it cannot
resolve in its own store; describe it in prose instead." — two imperatives where pass 1 found pure
description with no verb at all. Separately verified the narrative-exclusion half of c5, which
pass 1 only checked for work-prompt: this pass's own fix extended it to audit.test.ts,
planPrompt.test.ts and orchestratePrompt.test.ts. Confirmed all four are real, not tautological —
for each of the four briefs, hand-edited briefLessons.ts to reintroduce one narrative phrase from
the pre-fix wording (e.g. added back "Eleven tests this run looked like proof and were not" to
WORKER_LESSONS[1]'s body, "c2 of the clause-deferral spec consumed four passes..." to
AUDITOR_LESSONS[2], "HIGH findings had this identical root..." to PLANNER_LESSONS[2], "Found
twice, independently, by two auditors." to ORCHESTRATOR_LESSONS[4]), then ran that brief's own
`npx vitest run <file> -t "never prints the narrative evidence..."` — all four failed on the
reintroduced text and none of the assertions were vacuous (each named a specific string that only
appears when narrative is present), reverted after each check, working tree confirmed clean by
`git status --short` afterward.
- proof 6: met — Independent re-check, pass 2. Grep confirms all four brief files still import
printLessons from ./briefLessons and call it; the four lesson arrays are each declared exactly
once. Re-ran c6-planPrompt-bypasses-shared-carrier (planPrompt.ts's printLessons call replaced
with a hand-rolled console.log loop producing byte-identical output): the
"renders through the same printLessons function" test in workPrompt.test.ts KILLED it at its own
named-test scope, 1 failed of 20 across workPrompt.test.ts and planPrompt.test.ts together, no
escalation — every content-level test in planPrompt.test.ts still passed against the bypass,
confirming the carrier check is the only thing watching for this failure mode.
- proof 7: met — Independent re-check, pass 2. MAX_LESSON_COUNT is still 24 in briefLessons.ts,
checked against totalLessonCount() (still 19: 4 worker + 5 auditor + 4 planner + 6 orchestrator —
this pass's fix rewrote two entries' text, not the counts) by audit.test.ts. Re-ran
c7-budget-lowered-below-current-total (24 to 10): KILLED the named budget test at named-test
scope, 1 failed of 119, no escalation.
