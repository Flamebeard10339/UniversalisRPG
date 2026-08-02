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

| finding | what it means | remedy |
| --- | --- | --- |
| `overlapping-writes` | two unordered tasks write the same region | merge them; they are one change |
| `unstated-dependency` | one writes where another is producing an interface | add the `requires` edge |
| `duplicate-produces` | two tasks claim the same interface | one is the owner, the other is a duplicate |
| `cohesion` | most of the plan writes one path | it is one task, and more workers buy nothing |
| `no-write-grant` | a task declared no `writes` | the check cannot see it — say so, or grant it |
| `starts-blocked` | a requirement is unsettled | expected for a sequenced plan; a surprise otherwise |

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

- **An audit cannot create work.** Every finding enters `unreviewed`. That decouples the auditor
  from the cost of what it finds, which is the condition under which auditors are useful.
- **Every proof clause gets a verdict**: `met` carries evidence, `unmet` means it was checked and
  fails, `unknown` means nobody looked. `unknown` and `unmet` never collapse.
- **Red-green proves a test can fail; only mutation proves it fails for the right reason.** For
  pure logic, remove, invert or scale the behaviour a proof claims and confirm the named test goes
  red.
- **Commission an auditor whose only question is "is anything worse than before".** Clause-by-clause
  verification cannot see a regression, because each clause looks fine in isolation.
- **Persisting the evidence is planner work.** Archive audit reports into `docs/audits/` before the
  session ends and plan against the archive, not against a summary of a summary.

## 7. Triage is a human's call

`tasks triage` walks the unreviewed queue. Promote joins the current spec; defer leaves it open and
unclaimed; decline closes it with a reason. Promotion is available at every pass — an auditor files,
it does not schedule.

Before promoting a list, read its *shape*. A finding list is evidence about a system, not a queue.
Density in one file is a structural diagnosis. Two findings that contradict each other mean no
module owns that rule. Ask **what single change retires the most of the list** — if the answer is a
seam that does not exist yet, build the seam first, because fixing items that dissolve under a
restructure is work thrown away.

## 8. Close and merge

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
