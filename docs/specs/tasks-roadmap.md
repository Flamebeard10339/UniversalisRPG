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

### Pass 2 — 2026-08-04

- base: `dcc8574001b06b5c89516f8a9afcefa8ce64163b`
- head: `71c5aed336786c7275a9a98161d049cf18a67640`
- proof 1: met — Re-verified at head 71c5aed. `npm run tasks -- roadmap` prints header, body and footer in one 50-line invocation; cmdRoadmap reads no flags beyond resolveConfig and only console.logs. Mutations 'the header counts vanish' and 'the per-system finding breakdown stops printing' both KILLED by scripts/tasks/roadmapCmd.test.ts. roadmapView([]) renders without crashing (16 lines, max width 78). Observation, not a failure: the deliverable prose says the frontier 'fits on one screen' and the live body is 50 lines with the waiter rows, which is two screens on a default 24-row terminal; no clause promises a row count.
- proof 2: met — Re-verified at head. roadmapView filters listQueue(tasks,{deferred:true}) — open && spec===null — then kind==='task' then !isBlocked. Three mutations KILLED against roadmap.test.ts+roadmapCmd.test.ts: 'findings are offered as topics' (2 failures), 'blocked topics enter the body' (6), 'spec-held records enter the backlog' (3). Live: body is 24, list --deferred --kind task is 33 of which 9 print BLOCKED.
- proof 3: met — Re-verified at head. Four ordering mutations all KILLED against scripts/lib/roadmap.test.ts: 'fan-out stops ordering the topics', 'severity stops breaking a fan-out tie', 'closed records count as waiters' (LIVE_STATES), 'a waiter is listed as also waiting on the topic itself'. The store-order tiebreak reads the index of the raw tasks array, not listQueue's severity-sorted output, so it is store order. Live output agrees: droptables leads at fan-out 2 and reads 'unblocks archetype-mods (also waits on buffs-generalized)'.
- proof 4: met — Re-verified at head against the shipped store. Header 74 deferred = 33 tasks + 41 findings + 0 other, and each footer command was run: `tasks list --deferred --kind task` returns 33 (the 9 blocked are printed with a BLOCKED marker, so the row's own count is reachable inside its command's output), `--kind finding` returns 41, `--deferred` returns 74. Test 'partitions the deferred backlog' asserts readyTasks+blockedTasks+deferredFindings+deferredOther === deferred. Mutations 'the other-kinds footer row disappears' (2 failures) and 'the footer stops disclosing how wide its command reaches' (3) both KILLED — the pass-1 disclosure findings are closed by footerRow computing the parenthetical from what its command lists.
- proof 5: met — Measured at head over the shipped store: renderRoadmap(roadmapView(parseStore(docs/tasks.jsonl))) is 50 lines, max width exactly 78, 0 over, 0 with trailing space; the empty store renders at 78 too. Mutation 'fit wraps instead of truncating' KILLED (3 failures, roadmapCmd.test.ts). 'the width constant moves off 78' is KILLED, but only after escalating past the three roadmap test files to the whole suite — the literal 78 is pinned in scripts/tasks.test.ts:1737, not by the roadmap's own width test, which compares against the exported TERMINAL_WIDTH. Filed as a low finding.
- proof 6: met — Re-verified at head. roadmapView is Task[] -> RoadmapView; grep -nE 'readFile|writeFile|node:fs|child_process|Date|Math.random|process.|execSync|tasks.jsonl' over roadmap.ts, roadmap.test.ts, roadmapCmd.test.ts returns nothing, and roadmapCmd.ts returns nothing for the same pattern (readStore is its only effect and is confined to cmdRoadmap). Both test files build records from a local task() factory. 71c5aed narrowed RoadmapView further, dropping the three Task[] lists nothing read.
- proof 7: met — git diff dcc8574..71c5aed touches 13 files; the only taskStore.ts change is adding `export` to severityRank, the Task interface is untouched. No new data file, no second store; git diff --stat over .github, package.json, vitest.config.ts and tsconfig.json is empty, so no gate was added or weakened. cmdRoadmap sets no exit code and throws nothing. `npm run tasks -- merge-ready` at head: tsc, npm test, layer-check, audit-status, doctor and bytes all pass.
- proof 8: met — Repaired by d763003 and re-verified mechanically over all 28 renames rather than a sample: no id changed and none was dropped (28 renamed, 13 added, 0 removed), every renamed record is kind:task so no finding title moved, and for each rename every content word the old title dropped was checked against the record's whole searchable text (id, title, system, deliverable, evidence). Every residue resolves: gui-rebuild now carries 'designed for mobile. Mobile is the target form factor, not a later adaptation' in deliverable, single-dev-mode's evidence names contribution mode and debug mode, reimplement-localization's evidence carries the locale-editing UI, mod-portal-gui's carries pack hierarchy and the shipped CLI half, buffs-generalized's deliverable carries 'any entity rather than the player alone'. Deviation recorded, not failed: 15 of the 28 new titles are six words rather than the clause's 'four-or-five', but none reads as a sentence and the clause's operative constraints all hold.
- proof 9: met — `npm test` inside merge-ready at head: 1350 tests passing, well inside the budget; the mutation runs measured the same suite repeatedly at roughly a minute. The three test files this branch adds are 43 in-memory cases with no fs or subprocess cost.
