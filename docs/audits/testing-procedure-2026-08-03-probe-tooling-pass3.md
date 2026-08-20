# Testing procedure — audit-probe-tooling pass 3, 2026-08-03

Third independent pass over `3d3386a..9b2a4b3` (11 commits). Required commands all pass: `npm test`
exit 0 (48 files, 1153 passed, 53.29s), `npx tsc --noEmit` exit 0, `npm run layer-check` exit 0,
`npm run audit-status` exit 0, `npm run tasks -- doctor` exit 0 (349 tasks).

## The pass-2 fixes are real

A fifteen-mutation battery aimed at decisions rather than neighbourhoods: 14 killed, 1 survived, in
2m12s. `universe-reloads-originals` — pass 2's headline survivor — is now KILLED, as is
`tally-reads-both-streams`. Both pass-2 HIGHs are genuinely falsifiable and no unpinned decision was
found in the new work. The one survivor, `journal-root-unchecked`, is not a finding: removing the
`root` type check is caught by `npx tsc --noEmit`, which is a CI gate and the right home for a fact
expressible as a type. c13 delivers — `--round-trip=module` finds the contribution-system H1 in one
command with no hand-rolled `tsx`.

## H1 — the lazy baseline is measured on the mutated tree

`scripts/mutate.ts:167-172, 185-187, 461-477`. `measure` calls `baselineFor`, and `measure` is called
from `runMutations` *after* `files.write(mutation.file, applyTo(...))`. Both the narrow and the wide
baseline are therefore taken with the mutant on disk. Instrumented:

```
narrow saw MUTANT
  baselineFor(narrow) ->
narrow saw MUTANT
whole  saw MUTANT
  baselineFor(whole) ->
whole  saw MUTANT

verdict: SURVIVED | total: 25 | shortfall: undefined
Truth: 40 tests run unmutated, 25 mutated. The shortfall is 15.
```

End to end, breaking `roundTrip.ts` so one file cannot collect:
`breaks-collection-of-one-file KILLED 3 failed of 1086` against a suite of 1153 — 67 tests silently
stopped running and the row says nothing, because the whole-suite baseline was itself measured at
1086. The poisoned value is memoised and reused by every later mutation in that scope. The usage text
still claims "Each distinct test scope is run once unmutated first", which is no longer true.

This is the class of bug the shortfall exists to catch, and it is reachable: a mutation that does not
compile produces `Tests 0 failed` at narrow scope, because vitest 4 counts a collection failure on
the `Test Files` line only, which `parseVitestTally` never reads. `total === 0` does not fire, so the
verdict is SURVIVED, and the one remaining guard — the test-count drop — is exactly what the poisoned
baseline suppresses. The tool then asserts a coverage gap that does not exist. Two fixes are needed:
take the baseline before the write, and read `Test Files ... failed` so an uncollectable file is an
ERROR rather than a verdict.

## H2 — `--round-trip=module` reintroduces the defect commit 7b16910 fixed

`scripts/probe.ts:123-140`. `canSerialize` has exactly one call site, in the universe path, and the
guard was not carried into the module path.

```
$ npm run probe -- snippet.dsl --round-trip=module
snippet: publishing this module alone would not preserve the universe
  items: missing rock                                            <- exit 1

$ npm run probe -- snippet.dsl --round-trip
not round-tripped: snippet declare no # info ...                 <- exit 0
```

`7b16910`'s commit body, verbatim: "`--round-trip` on a source with no `# info` reported
`items: missing rock`, which reads as a serializer defect. It is not." The new mode reports exactly
that for the same input. The principle that commit named — a check that could not run is not a check
that failed — is violated in the new path, and no module-mode test covers a source without `# info`.

## H3 — one pre-existing red test turns every escalated verdict into a false KILLED

`scripts/mutate.ts:156, 470`. The verdict compares `run.failed > 0` against zero rather than against
the baseline's failure count, and `baselineFor` records `.total` only. This existed before c14 but was
rare, because the whole suite had to be chosen deliberately. Now narrow scopes are the recommended
default and every survivor is pushed into the full suite, where any unrelated red test lives. A false
SURVIVED gets investigated; a false KILLED closes the question and records coverage that is not there.
The whole-suite baseline already runs unmutated — recording its `failed` and refusing to escalate on a
red tree costs one field.

## M1 — `escalatedFrom` is lost when the escalated run throws

`scripts/mutate.ts:188-189`. `runMutations`'s catch rebuilds the result from `scopeOf(mutation)` with
no knowledge of what `measure` had established, so the reader sees an ERROR against the narrow scope
and cannot tell the mutation survived that scope and then the whole-suite run blew up.

## M2 — a refused manifest leaks the journal lock

`scripts/mutate.ts:456-459` exits without `rmSync(JOURNAL)`. Demonstrated: after a refusal the journal
survives, and the next run reports "a journal from an interrupted run was found". Three consequences —
the full bytes of every target sit in tmpdir indefinitely; the one message that should mean "check
your tree" fires routinely after every typo'd manifest, which is how a real warning becomes invisible;
and a second run started while the first is alive refuses with "another mutate run is holding this
tree" for a lock held by nothing.

## M3 — the narrow verdict's shortfall is discarded by escalation

`scripts/mutate.ts:170-171` returns `{...wide, escalatedFrom}`, replacing everything measured narrowly.
The disagreement between narrow and wide is the most informative thing an escalation produces — it
names the file missing a test — and the row keeps only the wide half.

## M4 — module mode's diagnostic relocates the pass-1 blame rather than resolving it

`scripts/probe.ts:130`. `base: its serialization does not load beside the others` names the artifact
and its failure and invites the pass-1 misreading, while its own sibling line
`cut: publishing this module alone would not preserve the universe` names the action and its
consequence and invites the right one. Naming whose replay caused it would close the asymmetry. No
test covers this branch.

## L1 — `readJournal` accepts `root: ""`

`path.resolve('') === repoRoot` whenever mutate runs from the repository root, which is the normal
invocation, so the root-mismatch check passes for a journal with an empty root. Defence-in-depth only,
since the path is hash-keyed.

## L2 — `STALE_AFTER_MS` treats a long-running run as a reused pid

Six hours. Run B recovers A's files out from under A mid-run, deletes A's journal and takes the lock.
A 30-mutation whole-suite battery is not far off that. Comparing `startedAt` against the holding
process's actual start time would distinguish them.

## L3 — `journalPathFor` hashes the root string without case normalisation

On Windows, the same checkout reached by two differently-cased paths yields two journals and no mutual
exclusion. Hard to trigger given `import.meta.dirname`, but this is a Windows-primary repo.

## L4 — `refusalsFor` runs twice per invocation

Once in `main` and again inside `runMutations`. Harmless, but the ordering guarantee the pass-2 fix
bought lives only in `main`, where no test reaches it — the same structural shape as pass 2's H2.

## L5 — `main()` is untested as a composition

Every extracted decision is now pinned; their composition is not. H1 lives at the `main` call site,
although `measure` and `runMutations` are exported and could have caught it.

## Clause standing

c1–c10 met, c12 met, c13 met with H2 against it, c11 met, **c14 unmet**. c4's pass-2 caveat is
discharged: `universe-reloads-originals` is KILLED, so the mechanism is falsifiable. c14's escalation
half is delivered and pinned — fifteen mutations in 2m12s against roughly fourteen minutes — but its
second sentence, "baselines are measured on first use, so a scope nothing reaches is never run", is
delivered in a way that makes the baseline wrong: measured on the mutated tree, it is not a baseline.

## On the workflow question

Asked whether the scoping workflow feels different in use rather than merely faster: it does, and not
because of the clock. Scope stopped being a claim to defend and became a filter one can be wrong about
for free, which is the first part of this workflow that got cheaper to think about.
