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
