# tasks-roadmap

## Deliverable

A single read-only command, `npm run tasks -- roadmap`, that answers one question from main: **which
branch do I open next?** Today that question has no command. `tasks next` is spec-scoped and
deliberately refuses when no spec is active, so the deferred backlog — every open record not claimed
by a branch — is reachable only as an undifferentiated list of 73. The gap is a view, not data: the
store already carries the ordering (`requires`) and the topic/debt split (`kind`).

The view has two failure modes and they pull against each other. A list of 64 unblocked records
overwhelms and gets ignored; a list truncated to the top few silently buries work the author has
already forgotten once. The resolution is that `kind` cuts the frontier to 24, which fits on one
screen, so **nothing is hidden and nothing is truncated** — the two constraints stop competing.
Findings are the one thing summarized rather than listed, because a finding is debt an auditor filed,
never a topic to choose between.

Proof:

- [c1] `npm run tasks -- roadmap`, run from main with nothing in flight, prints three parts in one
  invocation: a header of whole-store counts, a body of topics ready to branch on, and a footer of
  what the body excluded. No part is behind a flag.
- [c2] The body is exactly the records that are `open`, deferred (`spec === null`), unblocked, and
  `kind: task`. A finding never appears as a topic. A blocked topic never appears in the body.
- [c3] Topics order by fan-out — how many open records name this one in `requires` — then by
  severity, then by store order. Every topic that unblocks something names what it unblocks, and
  names the other requirements that waiter is still short of.
- [c4] Everything the body excludes is counted and carries a runnable command that expands it: the
  blocked topics as one count, the findings as per-system counts. A reader can reach any excluded
  record without knowing it exists.
- [c5] Every line of output is at most 78 columns. An id or system name too long for its column is
  truncated with an ellipsis, never wrapped — the output must not reflow in a narrow terminal.
- [c6] The view is a pure function from `Task[]` to a described result, with no file, git, or clock
  access. Its tests build records in memory and never touch `docs/tasks.jsonl`.
- [c7] No new field on the task record, no new file, no second store. The command is a read over
  fields that already exist, and adds no gate and no failing condition anywhere.
- [c8] Task titles that read as sentences are rewritten to four-or-five-word summaries so the body's
  id column stays honest. Ids are unchanged, and no title loses a fact that is not already in the
  record's `deliverable` or `evidence`. Findings keep their titles: a finding's title is the defect
  statement an audit filed, and shortening it would edit the evidence.
- [c9] `npm test` stays inside the five-minute budget.

## Decisions

**`kind` is the axis, not severity.** Severity means two different things in this store: on a finding
it is how bad the defect is, on a task it is roughly the author's priority. Ranking a mixed list by
it is meaningless. `kind: task` versus `kind: finding` is the split that already means "topic I would
choose" versus "debt an auditor found", so the roadmap filters on it and the header reports both.

**Fan-out is the ordering signal.** Severity alone puts `pre-release-readiness-audit` next to
`droptables` with nothing to tell them apart. Fan-out — computed from `requires` edges already in the
store — floats the structurally load-bearing topics (`droptables`, `first-class-modals`,
`skill-levels-xp-events`, `combat-events`) above the leaves that block nothing. This is derived, never
authored: there is no priority field to keep in sync.

**Fixed width, truncating.** 78 columns, matching `EVIDENCE_WRAP_WIDTH` in `render.ts`. Truncation is
chosen over wrapping because a wrapped row destroys the column alignment that makes 24 rows scannable,
and the id is a lookup key — a truncated id still resolves, since the record verbs accept a prefix.

**The header is part of the deliverable, not decoration.** The counts are how a reader sees the shape
of the whole store — including the 40 open findings and the fact that nothing is in progress — without
which the body reads as "24 things exist" rather than "24 of 73".

## Open questions

None.
