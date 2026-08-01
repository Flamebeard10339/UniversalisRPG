# task-system-small-test-fixes-to-get-feet-wet

## Deliverable

Amending a spec proof clause does not strand an existing undelivered task. A task created for an
unmet proof clause can still be matched, audited as met, and marked done after the clause has been
amended, without hand-editing the task store.

Proof:

- [c1] A regression test covers this flow: create a spec with a proof clause, audit it as unmet, amend or reword the clause, audit the amended clause as met, then mark the undelivered task done.
- [c2] The implementation no longer depends only on exact clause text matching between an undelivered task and the current proof-clause prose.
- [c3] `npm test` and `npm run tasks -- check --merge --spec task-system-small-test-fixes-to-get-feet-wet` pass.

## Decisions

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-01

- base: `9c87fd37e63f7e6e3c032b00b118bb1f51c30d5c`
- head: `f56678dbf9f0403ae99488812616f6634f44a08e`
- proof 1: met — scripts/tasks.test.ts drives the whole flow through the CLI: audit clause 1 unmet, reword the [c1] line, spec amend, re-audit met, tasks done closes it. npm test green at 40 files / 717 tests. Reproduced by hand in a temp fixture via --store/--specs-dir; the task closed.
- proof 2: met — undeliveredDoneRefusal (scripts/tasks.ts:488-497) resolves the clause by task.clause id and reads no prose at all. Probed live: rewording a clause that keeps its [c1] tag leaves tasks done working, and deleting the clause refuses with "proof clause 1 is no longer in ..." rather than a text mismatch.
- proof 3: met — npm test 40 files / 717 tests passed; npx tsc --noEmit exit 0; npm run layer-check 454 imports, all downward; tasks check 171 tasks / 0 errors / 0 warnings. Before this pass the merge gate reported exactly one issue, "has no recorded audit pass", which this pass supplies.
