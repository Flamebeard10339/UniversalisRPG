# The workflow

The live specification of how work moves through this repository, and of the tool that carries it.
Kept current: when the tool and this document disagree, that is a defect in one of them.

This is **not** a branch spec. A branch's promise lives at `docs/specs/<slug>.md` and becomes a
historical record the moment it merges — `task-system-v2.md` is one of those, and it rotted into
being read as live documentation, which is the drift this file exists to end.

## The shape

```
  spec ─▶ plan ─▶ claim ─▶ work ─▶ audit ─▶ triage ─┬─ promote ─▶ work
                    ▲                                │
                    └── replan ◀── refusal           └─ defer / decline
                                                             │
                                                    spec done ─▶ merge
```

Two roles. A **planner** decomposes and never implements, so its context never fills with
low-level detail. A **worker** implements and never plans, so its context is spent on one piece.
`.planning/agent-swarm-theory.md` holds what a planner owes the tree; read it before decomposing.

## 1. The spec is the promise

One spec per branch, at `docs/specs/<slug>.md`, naming what the branch promises to close. Its
`## Deliverable` carries numbered proof clauses. It is the contract, never the test plan — nobody
planning a unit from outside knows what it will need to be robust, so a worker that judges it needs
coverage the clauses do not name should write it.

## 2. Decompose against write grants, not against layers

The single most expensive mistake this repo has made repeatedly is cutting work by *layer* —
extract the policy, then reroute git, then move the output sites — when every slice touches the
same file. Chunks touching one file are not independent, parallel or sequential.

Cut so that **each task owns a disjoint region of the tree**, and record that region:

```bash
npm run tasks -- add "extract the policy module" --writes scripts/lib/policy.ts --produces "policy module"
```

- **`writes`** — what this task may change. Files or directories; a directory covers everything
  beneath it. This is *not* `files`, which is evidence about where a finding was observed.
- **`produces`** — the interfaces or concepts nothing owns until this task lands. It answers
  "who owns batching?" with a query instead of a guess, and a guess that goes the wrong way is a
  duplicate subsystem.
- **`requires`** — the tasks that must land first. A forward reference to a record that does not
  exist yet is allowed and holds the task until that record arrives.

## 3. Grade the plan before dispatching it

```bash
npm run tasks -- plan <id>...
```

No workers run. It reports, in one command, what has previously taken a measurement pass to find
by hand:

Each line is tagged `[defect]` or `[note]` and says what it found in full; these are the seven
situations it can report.

| it reports | what it means | remedy |
| --- | --- | --- |
| *"both write X, and neither requires the other"* | two unordered tasks write one region | merge them; they are one change |
| *"writes X, where Y is producing Z"* | one writes where another is inventing an interface | add the `requires` edge |
| *"both claim to produce Z"* | two tasks claim one interface | one is the owner, the other is a duplicate |
| *"N of M granted task(s) write X"* | most of the plan lands in one path | it is one task, and more workers buy nothing |
| *"declares no writes"* | nothing to compare | grant it, or accept that this task was not checked |
| *"cannot resolve to a region"* | a grant with a wildcard in it | name paths or directories — a glob compares nothing |
| *"starts blocked — it waits on ..."* | a requirement is unsettled | expected in a sequenced plan; a surprise otherwise |

It exits 0 and refuses nothing. Dispatching against a reported defect is a call a planner is
allowed to make; making it unknowingly is not.

**Do not add workers to buy speed.** Agent count is the one lever measured to correlate with
nothing. Fewer workers over disjoint regions is not a compromise.

## 4. The worker proposes before it implements

A dispatched worker's **first** deliverable is not code. It is a proposed correction to its own
ledger entry:

```bash
npm run tasks -- start <id> --actor <name>
npm run tasks -- edit <id> --writes <what it will actually touch> --requires <what it actually needs>
```

The planner accepts it, or corrects it, and re-runs `tasks plan`. Then the worker writes code.

This exists because the planner declared the write grant without having read the region, and the
worker is the first party who has. It is also where refusal gets a slot instead of requiring
initiative: **briefs must invite refusal, and a planner must believe it.** Twice that produced a
correct refusal — a reproduction that was information-theoretically impossible, and a fix that
silently retracted a protection. Both would otherwise have shipped.

One round trip. If it grows a protocol, it has failed.

## 5. Work, and close against a commit

`tasks next` for what to pick up, `tasks show <id>` for the full record, `tasks done <id>` to close.
`tasks done <id> --commit <sha>` when the closing commit already exists. Commit after each logical
chunk; every non-exempt commit carries a body saying what was done.

If the work diverges from the declared `writes`, that is information, not a violation — say so in
the commit body and correct the record. A diff that does not match its grant means the
decomposition was wrong, and that is worth knowing before the next one is cut.

## 6. Audit reads the diff

`tasks audit-prompt <spec>` generates the auditor's brief; `tasks audit <spec>` records the pass.
An audit reviews the diff a branch proposes to merge, not a running commit count.

A pass has **two outputs, and they behave differently.**

- **A finding cannot create work.** Every finding enters `unreviewed` and waits for triage. That
  decouples the auditor from the cost of what it finds, which is the condition under which
  auditors are useful.
- **An `unmet` clause creates work directly.** It becomes an open `undelivered` member of the spec
  — high severity, no triage step — and `tasks next` will hand it to the next worker. This is not
  an exception to the rule above so much as its other half: a finding is *new* scope, so it waits
  for a human; an unmet clause is scope the branch **already promised**, so nothing is being added.
  The first rule stops a spec growing, the second stops it closing falsely. Both have happened here.
- **Every proof clause gets a verdict**: `met` carries evidence, `unmet` means it was checked and
  fails, `unknown` means nobody looked. `unknown` and `unmet` never collapse — an ungraded clause
  records `unknown` and creates nothing, because nobody has established there is work to do.
- **Red-green proves a test can fail; only mutation proves it fails for the right reason.** For
  pure logic, remove, invert or scale the behaviour a proof claims and confirm the named test goes
  red. `npm run mutate -- <manifest.json>` is the tool: it restores from bytes it captured rather
  than from git, so it is safe on a tree carrying uncommitted work, and it reports every verdict
  with the test scope it was measured against — a `SURVIVED` against two hand-picked files is not
  the same claim as a `SURVIVED` against the suite. Keep the manifest in a scratch directory; a
  mutation set rots the moment the source moves, so nothing here is worth tracking.
- **Commission an auditor whose only question is "is anything worse than before".** Clause-by-clause
  verification cannot see a regression, because each clause looks fine in isolation.
- **Persisting the evidence is planner work.** Archive audit reports into `docs/audits/` before the
  session ends and plan against the archive, not against a summary of a summary.

## 7. Triage is a human's call

`tasks triage` walks the unreviewed queue one finding at a time, offering
`[1] promote  [2] defer  [3] decline  [4] redirect  [s] skip  [q] save and quit`. Promote joins the
current spec; defer leaves it open and unclaimed; decline closes it with a reason; redirect
re-displays the same finding so a mis-keyed answer is not a decision. Quitting saves, so a long
queue survives being interrupted. Promotion is available at every pass — an auditor files, it does
not schedule.

Before promoting a list, read its *shape*. A finding list is evidence about a system, not a queue.
Density in one file is a structural diagnosis. Two findings that contradict each other mean no
module owns that rule. Ask **what single change retires the most of the list** — if the answer is a
seam that does not exist yet, build the seam first, because fixing items that dissolve under a
restructure is work thrown away.

## 8. Record the reasoning, not just the outcome

Every store write appends a line to `docs/events.jsonl` automatically — who, when, which branch,
which head, and what changed. Nothing to remember and nothing to keep in sync. Two verbs add the
part the tool cannot infer:

```bash
npm run tasks -- note "measured the queue at 87 records before touching it" --id <id>
npm run tasks -- decision "cutting by command family, not by layer" --spec <slug>
```

`tasks log` answers from the log alone — never by joining to present-day state, which would rewrite
history every time a record is re-pointed. `--id`, `--system`, `--spec`, `--op` and free text each
answer in one invocation and compose:

```bash
npm run tasks -- log --id <id>            # this record's whole history
npm run tasks -- log --op decision        # every decision, no text matching
```

This is what git cannot give you. `git log -S` finds one of five edits to a record; `tasks log --id`
finds all five, in order, and stays exact after a serializer rewrite touches every line. **A
decision made in a session and not recorded here is a decision the next planner will re-litigate.**

## 9. Close and merge

`tasks spec done <slug>` when every member is `done` or `declined`. `tasks doctor` scans the store
and reports; it fails on exactly one condition, a line that will not parse.

Nothing else refuses. Reads always answer, writes refuse only malformed input, and no semantic
disagreement fails a build — a report that names the problem is worth more than a gate that hides
it behind a rerun.

## The cold start

`tasks handoff` is the first command of a new session: the branch, the active spec, the live
`Next:` and the open queue.

## Where the reasoning lives

- `.planning/agent-swarm-theory.md` — what a planner owes the tree, learned from rounds that failed
- `.planning/orchestration-research-2026-08-02.md` — the literature this protocol is drawn from,
  including which of its premises did not survive checking
- `docs/audits/` — the archive; every finding label cited above is traceable there
