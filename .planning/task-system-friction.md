# Task-system friction observed while running this branch as a swarm

Raw notes. Each entry is something that actually cost time or created a wrong
state during combat-continuation-runtime, not a speculative improvement.

## CLI surface

1. `npm run tasks -- spec <slug>` prints a bare usage line. The natural guess is
   that it is short for `spec show <slug>`. Same class: `tasks --help` answers
   `unknown command: --help`, and the only discoverability is the one-line usage
   string on error.
2. `tasks list` prints all 60 open tasks with no `--spec`, `--system` or
   `--state` filter. To see this branch's work I had to use `spec show`.
3. `tasks next` returns exactly one task and dumps its entire `evidence` blob —
   for `runtime-2026-07-30-m2` that is ~30 lines of audit prose including a
   fenced code block. There is no short form, so `next` is expensive to call.
4. `tasks search <term>` matches against evidence text but does not show which
   field matched or why, so a hit on a long record is hard to judge.

## Model gaps that a swarm exposes

5. **No in-progress state.** States are unreviewed/open/done/declined. With five
   workers running sequentially against one store, nothing records which member
   is currently being worked, so the store and the branch drift for the whole
   session. A planner cannot ask the store "what is in flight".
6. **`requires` is stored but never surfaced.** Ordering the five member tasks by
   dependency was done by hand, in my head, from reading source. That ordering
   is exactly what a planner needs and exactly what the store already has the
   field to express.
7. **`done` is an unverified assertion.** `tasks done <id>` succeeded for two
   tasks while the commit documenting them was being rejected by the commit-msg
   hook. Nothing ties a task to the commits that implemented it. This is the same
   root as the filed finding "a recorded audit pass is never checked against the
   diff being merged".
8. `--evidence` is free text. The repo convention wants a why and a how-to-apply,
   but nothing enforces or surfaces that shape, so evidence ranges from one line
   to thirty.

## Spec/deliverable machinery

9. `tasks spec amend` appends a **full copy** of the Deliverable under
   `## Amendments`. The file now carries the deliverable twice, and the clause-id
   machinery runs over both. Given the already-filed finding that a new clause can
   inherit a deleted clause's met verdict by recycling its id, a duplicated clause
   body is a second way for verdicts to attach to the wrong text.
10. Good affordance worth keeping: `spec amend` printed
    `next: run tasks audit <slug> to verify the new clauses`.

## Commit hook

11. The commit-msg hook requires a `Next:` trailer on **every** commit. That models
    a single-session handoff. In a swarm there is no single next: the chunk-3
    worker stamped `Next: Chunk 4 (equipment slots)`, which was stale the moment
    chunk 4 started, and which duplicates what the spec's member list already
    says. There is already a filed finding about stale `Next:` trailers.
12. The hook fired on my fix commit but not on the earlier spec-amendment commit,
    so its trigger condition is not obvious from the error message.

## Store hygiene

13. `docs/tasks.jsonl` arrived with a large uncommitted diff that was mostly key
    reordering — the already-filed two-key-orders finding. Every `tasks add` /
    `tasks done` reserialises records, so task edits produce noisy diffs that
    bury the real change.

## What the swarm exposed about the deliverable contract (added after chunk 4)

14. **Proof clauses are prose, bound to nothing.** Three of four worker chunks
    produced a correct implementation with a *weak proof*: chunk 3 deleted the
    `health:` row from a table and left the "no longer accepts" clause unproven;
    chunk 4 discharged "an equipped defense bonus changes incoming damage" with
    an assertion that a stat went up. Both passed a green suite. Nothing in the
    store or the spec connects a numbered proof clause to the test that
    discharges it, so `tasks check --merge` can only ask whether an audit pass
    was *recorded*, never whether the clause's evidence still runs. This is the
    single highest-value gap I hit.
15. **Dead imports survived every chunk.** `runtime.ts` kept `damagePool`/
    `poolLevel`, `equipment.ts` kept `PLAYER`, the equipment fixture kept three.
    `tsc --noEmit` does not flag them and no gate does. Per CLAUDE.md a gate
    earns its place by preventing something that actually happened — this
    happened three times in one branch, so `noUnusedLocals`/`noUnusedParameters`
    now qualifies on the repo's own standard.
16. Cross-check with `npm run audit-status`: the open finding
    `dsl-load-path-2026-07-30-pass2-h1` says the shipped `# test` route skips
    dialogue node `skills`, so both tutorial equipment items are unreached and
    the stat-bonus system has no shipped coverage. That is why this branch's
    equipment proof had to be a focused fixture rather than a `# test` section —
    worth stating in the audit so the next reader does not read it as a gap.

## The most consequential one (found at merge-gate time)

17. **The store is a working-tree file, so a worker's tidy-up silently reverts
    recorded task state.** Three members — runtime-2026-07-30-m2, -m3 and
    unify-action-health-into-target — were marked `done` as their chunks landed.
    `git log main...HEAD -- docs/tasks.jsonl` shows only two commits ever touched
    the store, so all three marks were discarded before any commit picked them
    up: a `git checkout -- .` / `git reset --hard` / `git stash` in a worker's
    tree takes docs/tasks.jsonl with it, and nothing distinguishes the project's
    system of record from build litter.

    What makes this bad is that it is SILENT and it is INVISIBLE in review: the
    `tasks done` command printed success, and the diff of the branch looks
    complete. Only `tasks check --merge` caught it, and only because it
    cross-checks members against the spec rather than trusting a printed `done`.
    That is a strong argument for keeping that gate and a strong argument that
    `done` needs to be anchored to something durable.

    Cheap mitigations, in increasing order of cost:
    - `tasks done` warns when the store has uncommitted changes at exit.
    - `tasks check` compares the store's committed state against HEAD and reports
      state that exists only in the working tree.
    - a task records the commit that closed it, so a reverted `done` is
      detectable by asking whether that commit is still reachable.
