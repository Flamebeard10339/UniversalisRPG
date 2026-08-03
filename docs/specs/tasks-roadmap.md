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

## Audit passes

### Pass 1 — 2026-08-03

- base: `dcc8574001b06b5c89516f8a9afcefa8ce64163b`
- head: `2a6966f6ea3e63128ab0ab2b12bf3cd089cebb2c`
- proof 1: met — `npm run tasks -- roadmap` prints header, body and footer in one invocation with no flags; cmdRoadmap takes no arguments and only console.logs. Mutation 'the header counts vanish' is KILLED by scripts/tasks/roadmapCmd.test.ts.
- proof 2: met — roadmapView takes listQueue(tasks, {deferred:true}) — open && spec===null — then kind==='task' then !isBlocked. Three mutations all KILLED against roadmap.test.ts + roadmapCmd.test.ts: widening the kind filter (7 failures), dropping the isBlocked filter (6), dropping the deferred filter (3). Tests 'offers only deferred, open, unblocked tasks as topics' and 'never offers a finding as a topic' are the direct proof.
- proof 3: met — Four ordering mutations all KILLED against scripts/lib/roadmap.test.ts: zeroing the fan-out comparator, zeroing the severity tiebreak, counting done/declined records as waiters (LIVE_STATES), and leaving the topic itself in alsoWaitsOn. Live output agrees — droptables (fan-out 2) leads and reads 'unblocks archetype-mods (also waits on buffs-generalized)'.
- proof 4: met — Test 'partitions the deferred backlog, so no record falls between the body and the footer' asserts readyTasks+blockedTasks+deferredFindings+deferredOther === deferred, so every excluded record is in exactly one footer row; deleting the other-kinds row is KILLED. Every footer command returns a superset containing its row's records, so a reader reaches any excluded record. Residual filed as a low finding on the other-kinds row.
- proof 5: met — Measured over the shipped store: renderRoadmap(roadmapView(parseStore(docs/tasks.jsonl))) is 50 lines, max width exactly 78, 0 over. Mutations 'fit wraps instead of truncating' (3 failures) and 'the waiter line stops being fitted' (1) both KILLED by roadmapCmd.test.ts. Residual filed as a low finding: packed() overflows rather than truncating a single overlong part.
- proof 6: met — roadmapView is Task[] -> RoadmapView with no effects; grep for readFile/writeFile/node:fs/node:child_process/Date/Math.random/process./execSync/tasks.jsonl over roadmap.ts, roadmap.test.ts, roadmapCmd.ts and roadmapCmd.test.ts returns nothing. Both test files build records from a local task() factory. The only import is taskStore for isBlocked/listQueue/severityRank/waitingOn.
- proof 7: met — git diff dcc8574..2a6966f touches 10 files; the only taskStore.ts change is adding `export` to severityRank — the Task interface is untouched. No new data file, no second store, no .github change. cmdRoadmap sets no exit code and throws nothing. `npm run tasks -- merge-ready`: every leg passed (tsc, npm test, layer-check, audit-status, doctor, bytes).
- proof 8: unmet — Sixteen task titles shortened, no finding retitled — the rule c8 sets. But gui-rebuild lost a fact the record does not otherwise hold: 'Make the thin RPG GUI work again, a thin wrapper over CLI commands, designed for mobile' became 'Rebuild the GUI over the CLI', deliverable is null, and evidence names only the placeholder and what it blocks. `grep -c mobile docs/tasks.jsonl` is 0. Filed as a finding.
- proof 9: met — `npm test` on this branch: 54 files, 1343 tests, all passing, Duration 63.23s — a fifth of the budget. The two new test files add 24 in-memory cases with no fs or subprocess cost.
