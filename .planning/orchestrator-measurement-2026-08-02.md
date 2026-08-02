# Orchestrator measurement pass — 2026-08-02

Taken on `task-system-policy-seam` at 028507f, before any work was scheduled.
Every number below is from a command run against the live branch, not from
reading the friction notes or the spec. Workers should read this instead of
re-deriving it.

## The planner's four questions, asked of the live tool

| Question | Command | What actually happened |
|---|---|---|
| what's next | `tasks next` | `no open, unblocked tasks in spec task-system-policy-seam` — true, and useless: the spec has **0 members** and 6 slices of real work |
| what's in flight | `tasks list --state in-progress` | works, validates its value, reports 0 |
| what's blocked | `tasks list --blocked` | **printed all 87 tasks.** `--blocked` is not a flag; unknown flags are silently ignored |
| is this branch provable | `tasks check --merge` | refuses: *"branch's diff touches more than one spec file"*. `--spec` overrides it and then answers correctly (`no recorded audit pass`) |

## Most of the friction list is already closed

The friction and proposal documents describe the state *before* the superseded
branch landed. Verified as landed on this branch:

- **in-progress state** — `start`/`stop` exist, `list` counts it (friction 5)
- **`requires` is surfaced** — `BLOCKED` tag and a `requires:` line in both task
  printers, topological `specMembers(ordered)`, and `next`/`start`/`done` all
  refuse or skip on unmet requirements (friction 6, proposal 4)
- **`--state` filter** with value validation (friction 2, partial)
- **in-process test runner** — `runInProcess` for all non-`audit` commands.
  `npm test` is **50.08s, 43 files, 831 passed**, well inside the five-minute
  budget (friction 18–20, proposal 9)
- **closing commits** — `closedCommit` is a live key in the store (friction 7, 17)
- **commit contract** — optional `Next:`, repo-local `tsx` (friction 11, 21)
- **`noUnusedLocals`/`noUnusedParameters`** in `tsconfig.json` (proposal 12)

Do not re-open these. The remaining planner-facing gap is narrower than the
friction list makes it look.

## What is still broken

**Argument parsing accepts anything.** `list --blocked`, `list --totallyfakeflag`
and `list --help` all print the full 87-task list. `--state bogus` *is* rejected,
so flag *values* are validated and flag *names* are not. Three commands answer
`--help` three different ways: `tasks list --help` runs the query, `tasks spec
--help` prints usage, `tasks show --help` errors. This is the purest form of the
problem the tool exists to solve — the planner asks a question and gets a
confident wrong answer. Not in the friction notes, the proposal, the spec or
the store.

**Reads are expensive.** `spec show <slug>` prints the entire Deliverable —
about 60 lines for this spec — before the member list a planner actually wants.
`tasks next` dumps the full evidence blob. `tasks check` reports three freeze
warnings belonging to *other branches'* specs on every invocation.

**The default merge-gate answer is wrong on this branch, permanently.** The diff
necessarily touches both `task-system-policy-seam.md` and
`task-system-real-world-friction-spec.md`, so diff-based binding refuses and
will keep refusing until Slice 2 replaces it with store membership.

**Both inherited regressions are live.**
- `scripts/tasks.test.ts:1523` asserts a real two-SHA diff range, but
  `fixture`'s runner uses `cwd: repoRoot` against the real checkout — its own
  comment says so. It passes here because `main..HEAD` is non-empty; on a `main`
  checkout base equals head and it fails.
- `vitestFixtureFile` (`scripts/tasks.test.ts:166`) writes
  `scripts/lib/__proof_fixture_*.test.ts` containing `expect(1).toBe(2)`, and
  removes it in a `finally`. An interrupted run leaves a permanently failing
  test inside a source directory. Five call sites.

## Store state

229 records — 112 declined, 48 open, 39 unreviewed, 30 done. Of the 87
open+unreviewed, **82 carry no spec at all**. `task-system-real-world-friction-spec`
holds 12 records, 5 of them still open or unreviewed.

**Corrected 2026-08-02 by U1 — the paragraph below was wrong, and how it was
wrong is worth more than what it claimed.**

It originally read: the spec says the store "still points 36 pass-1 findings and
5 auto-generated clause tasks" at the superseded spec, the store holds 12 with
that spec field, so the premise is wrong by roughly 3x.

The spec was right and this measurement was wrong. All 41 records were filed.
`cmdAudit` files an undelivered clause task with `spec` set
(`scripts/tasks.ts:1853`) and a *finding* with `spec: null`, carrying its
provenance in `source.spec` instead (`:1880`). Counting the `spec` field sees 5
of 41 — and so do `tasks list --spec`, `tasks next` and `spec show`.

So the planner's "what is next" was silently incomplete by 36 records, the store
held the right answer the whole time, and the query surface could not reach it.
A measurement pass explicitly commissioned to stop workers re-deriving facts
wrote the wrong number into a document they were told to trust. Filed as
`audit-findings-invisible-to-spec-queries` (high).

The lesson for the next planner is not "measure more carefully". It is that a
count over one field is not a measurement of membership when two fields express
membership, and that the cheapest check on any store measurement is to ask the
store the same question a second way.

## Structural measurements

| Thing | Measured |
|---|---|
| `scripts/tasks.ts` | 2139 lines |
| `scripts/tasks.test.ts` | 2260 lines |
| `scripts/lib/mergeGate.ts` | 92 lines |
| `console.` sites in `tasks.ts` | 218, spread across every 200-line block |
| non-test files under `scripts/` spawning processes | 5 (`audit-status`, `git`, `modportal`, `publish-local-changes`, `tasks`) |
| `npm test` | 50.08s / 43 files / 831 tests, green |

## The scheduling defect this implies

Slice 1 extracts policy from roughly lines 89–530 and 907–920 of `tasks.ts`.
Slice 2 reroutes git across roughly 89–1440. Slice 4 moves 218 output sites
spread over all 2139. **These are one change to one file**, which
`.planning/agent-swarm-theory.md` names explicitly: chunks touching one file are
not independent, parallel or sequential. The spec presents them as separable
slices. They cannot be given to separate workers as written, and Slice 4 would
rewrite the output of Slices 1–3 after they had been audited.

Cut the refactor by **command family** — a contiguous, disjoint region of
`tasks.ts` per worker, each taking its own family's policy, git and rendering in
one pass — against fact types and a policy-module shape pinned by a scaffold
chunk first. Cutting by layer gives every worker the whole file.

Slice 5's two regression fixes are scheduled fifth and gate the merge. They are
small, they touch only `scripts/tasks.test.ts`, and nothing depends on them.
They go first.
