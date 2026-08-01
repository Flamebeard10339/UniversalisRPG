# task-system-small-test-fixes-to-get-feet-wet

## Deliverable

Amending a spec proof clause does not strand an existing undelivered task. A task created for an
unmet proof clause can still be matched, audited as met, and marked done after the clause has been
amended, without hand-editing the task store.

Proof:

- A regression test covers this flow: create a spec with a proof clause, audit it as unmet, amend or reword the clause, audit the amended clause as met, then mark the undelivered task done.
- The implementation no longer depends only on exact clause text matching between an undelivered task and the current proof-clause prose.
- `npm test` and `npm run tasks -- check --merge --spec task-system-small-test-fixes-to-get-feet-wet` pass.

## Decisions

## Open questions

None.
