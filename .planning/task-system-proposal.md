# Task system: what this branch exposed, and what to do about it

Everything below is grounded in something that actually happened while running
`combat-continuation-runtime` as a planner + five workers + three auditors. No
speculative features.

## The three that earn their keep

### 1. Bind a proof clause to the test that discharges it

**What happened.** Four of five worker chunks produced a correct implementation
with a proof that proved nothing:

| Clause | What was written to discharge it |
|---|---|
| "no longer accepts action `health:` fields" | a row deleted from a table; nothing asserted rejection |
| "an equipped defense bonus changes incoming damage" | `expect(statValue('defense')).toBeGreaterThan(...)` |
| "the audit's `ability: 2.5` reproduction no longer has a 2.5-vs-2.0 split" | `expect(activeAction).toBeDefined()` — passes for `null` |
| "shipped tutorial equipment is not inert once equipped" | a hand-copied module named `tutorial`, asserting only bookkeeping |

All four passed a green suite. All four were caught by reading diffs — three by
me, one by an auditor. `tasks check --merge` cannot catch any of them: it asks
whether an audit pass was *recorded*, never whether a clause's evidence *runs*.

**Proposal.** A proof clause may name the test that discharges it, and
`tasks check --merge` runs those tests and fails on a clause whose named test is
missing, skipped, or failing.

```
- A regression test demonstrates ... the same authored `ability:` value.
  proof: src/runtime/contest.test.ts "spends the authored ability at its authored scale"
```

This is the smallest change with the largest effect, because it converts the
deliverable from prose a reader must audit into something the store can check.
It also gives a worker an unambiguous definition of done, which is exactly what
the four failures above lacked.

**Do not** make this mandatory for every clause. Clauses like "`npm test` passes"
have no test of their own. Optional-but-checked-when-present is the right shape.

### 2. Anchor `done` to a commit

**What happened.** Three members were marked `done` as their chunks landed.
`git log main...HEAD -- docs/tasks.jsonl` showed only two commits ever touched
the store: all three marks were silently discarded, almost certainly by a worker
running `git checkout -- .` or `git reset --hard` to tidy its tree. `tasks done`
had printed success. The branch diff looked complete. Only `tasks check --merge`
noticed, and only because it cross-checks members against the spec.

**Proposal, cheapest first.**
- `tasks done` warns if the store has uncommitted changes when it exits.
- `tasks check` reports state that exists only in the working tree.
- A task records the SHA that closed it, so a reverted `done` is detectable by
  asking whether that commit is still reachable — and so `tasks show <id>` can
  answer "what actually implemented this", which it currently cannot.

The third also fixes a real review gap: today nothing connects a task to its
code, so an auditor reconstructs that mapping by hand every time.

### 3. Give the store an in-flight state

**What happened.** States are `unreviewed | open | done | declined`. With five
workers running against one store there was no way to record which member was
being worked, so for the whole session the store and the branch disagreed. I
tracked it in my own context instead, which is precisely the thing a planner's
context should not be spent on.

**Proposal.** Add `in-progress`, set by `tasks start <id>`, and surface it in
`tasks list`/`spec show`. In a swarm this is the difference between the store
being the coordination surface and the store being a write-only log.

## Worth doing, smaller

4. **`requires` is stored but never surfaced.** I ordered five member tasks by
   dependency by hand, from reading source, when the store already has the field
   that expresses it. `tasks spec show <slug> --order` should topologically sort
   members. That ordering IS the planner's decomposition.

5. **`tasks list` has no filters.** No `--spec`, `--system`, `--state`. With 60
   open tasks the only usable view was `spec show`. Add them.

6. **`tasks next` dumps the full evidence blob** — for one finding that was ~30
   lines including a fenced code block. Add a short form, or truncate by default
   with `--full`.

7. **Discoverability is one usage line on error.** `tasks --help` answers
   `unknown command: --help`; `tasks spec <slug>` does not mean
   `tasks spec show <slug>`. Both are two-line fixes.

8. **`spec amend` duplicates the whole deliverable** into `## Amendments`. The
   file now carries the deliverable twice and the clause-id machinery runs over
   both — a second way for a verdict to attach to the wrong text, next to the
   already-filed finding about recycled clause ids. Record the amendment as a
   diff, or as the reason plus a pointer, not a full copy.

## Keep the checks, cut the startup tax

9. **Most task CLI tests should run in-process.** `npm test` took ~88s, and
   `scripts/tasks.test.ts` alone took ~94s. That file has 98 cases, and its
   fixture cold-starts the TypeScript CLI through `tsx` for almost every one:
   `node node_modules/tsx/dist/cli.mjs scripts/tasks.ts ...`. The script already
   exports `run(argv)`, so most cases can import `run` once and capture
   `stdout`/`stderr`/`process.exitCode` in-process.

   Keep a small number of real subprocess smoke tests for argument wiring and
   keep the Git-history handoff cases real where they need actual commits. The
   bulk of the suite is checking command semantics, not Node process startup.

10. **The commit hook should avoid `npx`.** The current hook path runs
    `npx tsx scripts/tasks.ts check-commit-msg ...`. Timed locally, that costs
    ~1.56s per commit. Calling the repo-local installed CLI directly:

    ```
    node node_modules/tsx/dist/cli.mjs scripts/tasks.ts check-commit-msg ...
    ```

    took ~0.39s for the same check. The hook can keep the same policy and get
    most of the speed back by using local `tsx` when `node_modules` exists, with
    an `npx tsx` fallback for a checkout that has not installed dependencies.

## One thing to stop doing

11. **The `Next:` trailer hook should not fire on every commit.** It models a
   single-session handoff. In a swarm there is no single next: the chunk-3 worker
   stamped `Next: Chunk 4 (equipment slots)`, stale the moment chunk 4 started
   and duplicating what the spec's member list already says. There is already a
   filed finding about stale `Next:` trailers. Require it on the LAST commit of a
   session, or drop it and let `tasks next` answer the question it was invented
   for.

## One gate that now earns its place

12. **`noUnusedLocals` / `noUnusedParameters`.** CLAUDE.md says a gate earns its
    place by preventing something that actually happened. This happened five
    times in one branch: `runtime.ts` kept `damagePool`/`poolLevel`,
    `equipment.ts` kept `PLAYER`, the equipment fixture kept three imports, and —
    the one that mattered — `equipment.test.ts` computed `bareAttack` and
    `bareDefense` and never read either, which is precisely how that test came to
    assert nothing about stats. A dead local was the visible symptom of a missing
    assertion. That is a gate paying for itself.
