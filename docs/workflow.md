# The workflow

The live specification of how work moves through this repository, and of the tool that carries it.
Kept current: when the tool and this document disagree, that is a defect in one of them. A branch's
promise lives at `docs/specs/<slug>.md` and becomes a historical record the moment it merges — this
file never does.

Two roles. A **planner** decomposes and never implements, so its context never fills with low-level
detail. A **worker** implements and never plans, so its context is spent on one piece.

## The session, in order

Every command is `npm run tasks -- <verb>`. The record verbs (`show`, `edit`, `start`, `stop`,
`done`, `decline`, `promote`) accept a unique prefix or substring of an id; everywhere else —
`spec add`/`remove`, `plan`, `--id`, `--requires` — an id is exact.

1. **`tasks handoff`** — the first command of a cold session: branch, active spec, clause
   standings, open queue.
2. **Survey the capabilities before writing the contract.** For every region the work will touch,
   ask what is already there: `tasks where <path>` for the owning system, `tasks produces "<name>"`
   for an existing claim, `tasks system "<name>"` for its registered concepts. Ask by **path** as
   well as by name — a capability name is authored prose and two authors will not choose the same
   words, while a path is the same string for everyone. Then decide, deliberately, which
   capabilities this branch **adds**, which it **extends**, which it **takes over**, and which it
   **retires** — and record that in the spec's `## Decisions`, because it is the reasoning a later
   planner would otherwise re-litigate. A survey that finds an owner is a success: reuse it, or
   write down why a second one is right.
3. **`tasks spec new <slug>`**, then write `docs/specs/<slug>.md` — one spec per branch, numbered
   proof clauses under `## Deliverable`. The spec is the contract, never the test plan.
4. **Decompose** into tasks whose `--writes` regions are disjoint:
   `tasks add "<title>" --writes <paths> --produces "<capability>" --requires <ids>`.
   A `--produces` here is a **forecast** of a capability, answerable to the survey in step 2; the
   registration that makes it durable happens later, once someone has read the region.
   `tasks system` / `tasks system "<name>"` / `tasks where <path>` answer the architecture.
5. **`tasks plan`** — grades the set for overlap, unstated dependencies and duplicated
   interfaces before anyone works it. It reports and refuses nothing.
6. **The worker proposes before it implements**: `tasks start <id> --actor <name>`, then
   `tasks edit <id> --writes <what it will actually touch>` — the worker has just read the region
   and the planner has not. Briefs must invite refusal, and a planner must believe it. This is
   also the only place a durable capability gets registered:
   `tasks concept "<system>" "<name>" --paths <paths> --note "produced by <id>"`.
7. **Work.** `tasks next` for what to pick up; commit after each logical chunk;
   `tasks done <id>... --commit HEAD` closes against the commit (several ids in one call). If the
   diff diverges from the grant, correct the record and say so in the commit body — that is
   information, not a violation.
8. **Audit.** Commission an auditor with the one instruction "run
   `npm run tasks -- audit-prompt <slug>` and do what it says" — the brief is generated and
   carries the checklist, the regression question, and how to file. The auditor records verdicts
   and findings with `tasks audit` (or archives a report under `docs/audits/` and
   `tasks import`s it). Filing findings without `--proof` flags appends no pass, so late findings
   never reset verdicts.
9. **Triage.** Findings from the branch's **own first pass** skip the walk: promote HIGHs and
   anything judged fix-now with `tasks promote <id>... ` — they are always promoted anyway, and a
   human can interrupt. From pass 2 on, promotion extends what the spec owes, so it waits for the
   human: `tasks triage` walks the queue (`[1] promote [2] defer [3] decline [4] redirect
   [a] ask [s] skip [q] quit`; `[a]` records a question on the finding and leaves it unreviewed).
10. **Close and merge.** `tasks spec done <slug>` when every member is done or declined.
    `tasks merge-ready` runs the whole merge gate — tsc, tests, layer-check, audit-status, doctor,
    byte check — one line per leg, non-zero when a leg fails.
11. **Record the reasoning**: `tasks note "<one line>" --id <id>` and
    `tasks decision "<one line>" --spec <slug>` as they happen; `tasks log --id <id>` /
    `--op decision` answers later, from the log alone. A decision made in a session and not
    recorded here is a decision the next planner will re-litigate.

## Advice that is known good

- **Cut by write grants, not by layers.** The most expensive recurring mistake is slicing work so
  every slice touches the same file. Chunks touching one file are one task.
- **Do not add workers to buy speed.** Agent count is the one lever measured to correlate with
  nothing. Fewer workers over disjoint regions is not a compromise.
- **A finding cannot create work; an unmet clause creates work directly.** The first rule stops a
  spec growing without a human; the second stops it closing falsely. Both have happened here.
- **`met` carries evidence, `unmet` means checked-and-fails, `unknown` means nobody looked.** The
  three never collapse.
- **Red-green proves a test can fail; only mutation proves it fails for the right reason.**
  `npm run mutate -- <manifest.json>` is the tool; keep manifests in scratch, they rot.
- **Commission one auditor whose only question is "is anything worse than before".**
  Clause-by-clause verification cannot see a regression.
- **Read a finding list's shape before promoting it.** Density in one file is a structural
  diagnosis; ask what single change retires the most of the list, and build that seam first.
- **Persisting evidence is planner work.** Archive audit reports into `docs/audits/` before the
  session ends; the store is the record of note.
- **A commit body scales with what the commit touches.** The contract asks for one line past the
  subject, and a diff that changes code earns much more than that — it is the only place the shape
  of *that* diff is explained, and it is where `git blame` lands. A commit that changes only the
  store or a spec has already been recorded: `events.jsonl` holds who, when, branch and head for
  every store write, and the spec's `## Decisions` holds the reasoning. There, say what changed and
  point at where the reasoning lives rather than restating it — a judgement written in three places
  is three places to drift.

## Why it is shaped this way

**Write grants.** `writes` is what a task may change (files or directories; a directory covers
everything beneath it) — not `files`, which is evidence about where a finding was observed.
`produces` names an interface nothing owns until the task lands, so "who owns batching?" is a
query instead of a guess. `requires` orders tasks; a forward reference to a record that does not
exist yet holds the task until it does. `tasks plan` reports eight shapes of defect and note —
two unordered tasks writing one region, a write into a region another task is producing an
interface for, two claims on one interface, a claim the repository already answers, a plan
concentrated in one path, a grant it cannot read, a wildcard it cannot resolve, and a task that
starts blocked. Dispatching against a reported defect is a call a planner may make; making it
unknowingly is not.

**Concepts.** A concept is one thing a system knows how to do, declared in
`docs/audits/systems.json` inside its owning system. Register durable capabilities only — a
branch's output ("playtest findings") is not one. `tasks done` prints unregistered claims and the
registering command; it never writes one itself, because that judgement is the point. Two
concepts claiming one file is the report that the file does two jobs.

**Audit outputs.** A pass has two outputs that behave differently. A finding enters `unreviewed`
and waits — that decouples the auditor from the cost of what it finds, which is the condition
under which auditors are useful. An `unmet` clause becomes an open `undelivered` member of the
spec directly — high severity, no triage — because it is scope the branch already promised.
An ungraded clause records `unknown` and creates nothing.

**The store is the record.** Every store write appends to `docs/events.jsonl` automatically —
who, when, branch, head, what changed. `tasks log` answers from the log alone, never by joining
to present-day state, so history stays exact after records are re-pointed. `tasks doctor` scans
and reports; it fails on exactly one condition, a line that will not parse. Reads always answer;
writes refuse only malformed input; no semantic disagreement fails a build.

## Where the deeper reasoning lives

- `.planning/agent-swarm-theory.md` — what a planner owes the tree, learned from rounds that failed
- `.planning/orchestration-research-2026-08-02.md` — the literature this protocol draws on
- `docs/audits/` — the archive; every finding label cited above is traceable there
