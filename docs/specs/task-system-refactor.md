# task-system-refactor

## Deliverable

The task system becomes a system of this repository rather than a corner of Testing procedure:
owned paths, registered concepts, and a codebase cut along command families instead of one
2628-line file. The friction three sessions of agents recorded against the tool is retired where
the record still describes the code, and the audit workflow's two structural leaks — hand-written
audit briefs and findings that vanish from spec queries — are closed at the tool, not by
instruction.

Proof:

- [c1] `docs/audits/systems.json` declares a `Task system` owning `scripts/tasks.ts`, the
  `scripts/tasks/` modules and the task-workflow libraries (`taskStore`, `eventLog`, `specDoc`,
  `planCheck`, `producers`, `auditImport`, `commitContract`, `architecture` and their tests), with
  the task-workflow concepts re-homed under it; `npm run audit-status` reports the partition
  intact, and `tasks where scripts/tasks.ts` answers `Task system`.
- [c2] `scripts/tasks.ts` is an entry point of under 100 lines re-exporting `run`; the command
  bodies live under `scripts/tasks/` in modules cut by command family, none over 700 lines, and
  the CLI surface is unchanged except where a clause below changes it deliberately.
- [c3] The uncommitted-store warning prints at most once per process invocation.
- [c4] `tasks done` and `tasks decline` accept several ids in one invocation; each id is
  recorded and reported individually, and one bad id refuses the batch before anything is written.
- [c5] Anywhere a command resolves a task id, an unambiguous prefix or substring of exactly one id
  resolves to it and the output names the resolution; an ambiguous fragment is refused with the
  candidates.
- [c6] A bare `--` in the argument list ends flag parsing, so `tasks decision "--each added
  mid-branch: ..."` records the text as given.
- [c7] `tasks audit <spec>` invoked with findings and no `--proof` flags files the findings
  without appending an audit pass, so clause verdicts recorded by an earlier pass are not reset to
  unknown by filing findings — the trap that twice created a permanent pass that says nobody
  looked.
- [c8] An unreviewed finding filed by a spec's audit is visible from that spec: `tasks spec show
  <slug>` lists it in its own section and `tasks list --spec <slug>` includes it, marked as
  awaiting triage; `tasks next` reports the count but never offers one as work.
- [c9] `tasks promote <id>... --spec <slug>` is the non-interactive form of triage's promote, and
  `tasks triage` gains an `[a] ask` action that records a question on the finding and leaves it
  unreviewed.
- [c10] `tasks doctor` inside an unresolved merge (`MERGE_HEAD` present) suspends its git-anchored
  checks and says so in one line; the store-only checks still run. A closing state that exists
  only in the working tree is reported at `[warning]`, since it is the documented mid-branch
  order.
- [c11] `tasks merge-ready` runs the branch's merge gate — `npx tsc --noEmit`, `npm test`,
  `npm run layer-check`, `npm run audit-status`, `tasks doctor`, and a tracked-text byte check —
  reporting one line per leg and exiting non-zero when a CI-red leg fails; its decisions are
  tested with the subprocess passed in as data.
- [c12] The byte check reports any tracked source file containing NUL bytes or invalid UTF-8 by
  path, so a file an agent corrupted is named before CI or an audit trips over it.
- [c13] `tasks audit-prompt` output carries the full audit checklist (reuse, scope drift, gate
  weakening, duplication, boundary violations, assumption-repeating tests, missing edges, risk,
  cross-system effects, comments), the regression question — is anything worse than before this
  branch — and instructions to file verdicts and findings through `tasks audit`/`tasks import`
  rather than a report nobody reads; CLAUDE.md's hand-maintained audit prompt section becomes a
  pointer to it.
- [c14] `docs/workflow.md` opens with the session protocol as a short ordered list of commands and
  is materially shorter than its current 242 lines, with the reasoning kept but demoted below the
  protocol; it documents the new commands and the first-pass promotion policy for HIGH findings.
- [c15] The open task-system findings this refactor subsumes are closed against commits, the 16
  unreviewed findings are each triaged with a recorded reason, and the task-system entries in the
  declined list are re-reviewed with any wrong declines reopened; decisions on integer ids and
  squash-merging are recorded with `tasks decision`.
- [c16] `npm test`, `npx tsc --noEmit` and `npm run layer-check` pass, the suite stays inside the
  five-minute budget, and new tests drive command decisions in-process rather than spawning the
  CLI per case.

## Decisions

- Task ids stay slugs. Integer ids would be easier to quote but collide across concurrent
  branches — the merge-conflict-free property of content-derived ids is worth more than short
  handles, and c5's prefix resolution removes the cost of long ones.
- `tasks merge-ready` is a runner, not a new gate: every leg it runs is already required by CI.
  It exists because every session hand-crafts the same shell line, and a hand-crafted gate drifts.
- The audit brief is generated because three sessions proved instruction does not survive context
  pressure: agents told about `audit-prompt` still fabricated briefs. The fix is structural — the
  one place agents do look (CLAUDE.md's audit section) now points at the command instead of
  competing with it.

## Open questions

None.
