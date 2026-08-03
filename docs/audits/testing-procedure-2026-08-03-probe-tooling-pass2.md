# Testing procedure — audit-probe-tooling pass 2, 2026-08-03

Second independent pass over `3d3386a..bb5c620` (8 commits), by the same auditor, after the seventeen
pass-1 findings were triaged and closed. Required commands all pass: `npm test` exit 0 (48 files,
1113 passed, 52.49s), `npx tsc --noEmit` exit 0, `npm run layer-check` exit 0 (501 imports, all
downward), `npm run audit-status` exit 0, `npm run tasks -- doctor` exit 0 (334 tasks). No CI file
touched, no gate weakened. `auditImport.test.ts`'s corpus counts moving 21/54/63 to 23/59/72 is
exactly pass 1's findings entering the archive — a data update, not a loosened assertion.

## What was verified sound

The H1 reframing is correct: the pass-1 reproduction (`base` + `cut` carrying
`# remove item.base.rope`) reports `round-trips clean`, exit 0. It is not blind — mutating
`src/content/serialize.ts` (`tags` to `tagz`, all occurrences) is KILLED through `probe.test.ts`, so
the whole-universe question still catches the defect class it exists for. `UniverseLoadResult.parsed`
is not stale, empty or wrong on any path: both returns set it, the field is non-optional so tsc
enforces it, and it excludes disabled modules, which is correct. Restore held byte-identical across
~40 mutations with `git status --porcelain` empty after every run.

## H1 — the two fixes pass 1 rated HIGH are both unfalsifiable by the suite

Measured with `npm run mutate`, whole-suite scope, baseline 1113, and independently reproduced:

```
h1-reload-originals        SURVIVED  0 failed of 1113  [whole suite]
h2-tally-reads-stderr      SURVIVED  0 failed of 1113  [whole suite]
probe-parsed-truncated     SURVIVED  0 failed of 1113  [whole suite]
registry-parsed-unordered  SURVIVED  0 failed of 1113  [whole suite]
```

`scripts/mutate.ts:353` is the H2 fix, `parseVitestTally(stdout)`. Reverting it to
`parseVitestTally(\`${stdout}${stderr}\`)` — the pass-1 defect verbatim — kills nothing, because
`runTests` is a `const` inside `main()` and only the `RunTests` *type* is exported. No test can reach
it. The fix is guarded by a three-line comment and nothing else.

`src/content/roundTrip.ts:42` is the H1 fix, `reload(sources)` where `sources` are the
serializations. Changing the argument to `reload(modules.map((each) => each.source))` kills nothing,
and that mutant makes `--round-trip` **always report clean** — the tool's entire purpose becomes
inert, invisibly. All five `roundTripUniverse` tests supply their own `reload` closure and assert on
what the closure does to the text it receives; not one asserts anything about the argument it was
handed. Commit `a7462c0` also deleted the only probe test that asserted `--round-trip` can report a
failure and replaced it with one asserting the opposite, so every remaining probe round-trip test
asserts `ok: true`.

This is the failure `docs/workflow.md` §6 exists to prevent, occurring in the branch that ships the
tool for preventing it. The branch author's report that "all ten fixes died" does not reproduce for
these two: the mutations run were of the adjacent pure functions — `parseVitestTally` itself, and a
reload argument that added a duplicate `# info` and so failed the load for an incidental reason —
rather than of the decision each finding was about.

Both are about five lines to pin. H2 wants `runTests` split so the stream choice is data:
`export function tallyOf(streams: { stdout: string; stderr: string }): TestRun`, which is the
"pass effects in as data" rule `runMutations` already follows and `runTests` does not. H1 wants the
test's reload closure to capture the sources it receives and assert they equal `result.sources`, plus
one probe-level test that `--round-trip` still exits non-zero on something.

## H2 — a truncated journal permanently wedges `mutate`

`scripts/mutate.ts:309-310`. `JSON.parse(readFileSync(JOURNAL, 'utf8'))` is unguarded, and the
journal is written by one non-atomic `writeFileSync` carrying the full pre-mutation bytes of every
target — a wide window. A run killed during that write leaves a half-written journal, and every
subsequent run then dies before reading the manifest, before recovering anything, before restoring
anything:

```
SyntaxError: Unterminated string in JSON at position 69
    at main (scripts/mutate.ts:310:26)
journal still there? YES
```

The stack trace names `mutate.ts`, not the journal path, so the only escape — deleting an
undocumented file in `os.tmpdir()` — is not discoverable from the error. The recovery mechanism
becomes an unconditional crash in exactly the scenario it was added for.

## H3 — journal recovery writes one checkout's bytes into another, bypassing the containment fix

`scripts/mutate.ts:236, 252-263, 315`. `JOURNAL` is one fixed path per machine carrying no record of
which repository root it was captured from. `recoverFrom` resolves every key against *this* process's
`repoRoot` and writes with no `escapesRoot` check — that fix is applied to `mutations` and not to
journal keys. Demonstrated with a dead-pid journal naming one relative and one absolute path:

```
recovered 2 file(s): zz-journal-victim.txt, C:/…/scratchpad/outside-victim.txt
--- zz-journal-victim.txt ---   BYTES FROM ANOTHER CHECKOUT
--- outside-victim.txt ---      WRITTEN OUTSIDE THE REPO ROOT
```

Two worktrees of this repo on one machine: a run in A is killed, and the next run in B silently
overwrites B's files with A's bytes and calls it recovery. Not hypothetical — `.claude/worktrees/` is
in vitest's exclude list because worktree-isolated agents are how this repo parallelises. Key the
journal filename by a hash of `repoRoot`, store the root inside it and refuse a mismatch, and run
`escapesRoot` over journal keys before writing.

## M1 — `--round-trip` can silently cover only some of the universe

`scripts/probe.ts:140`. `loaded.parsed` to `loaded.parsed.slice(0, 1)` SURVIVED at whole-suite scope.
c4 promises "serializes every loaded module"; nothing tests that the set is complete, so that half of
the mechanism is as unpinned as the other. A patch module dropped from the reload is invisible
precisely because patch modules serialize to nothing.

## M2 — the ordering contract on the new public `UniverseLoadResult.parsed` is prose only

`src/content/registry.ts:89-91, 725`. `parsed: [...ordered].reverse()` SURVIVED at whole-suite scope.
The comment claims "in the order they were applied" and nothing checks it. This is a cross-system
change — a new non-optional field on the load path's most widely consumed result type — with no test
of `parsed` anywhere under `src/content/`. `roundTrip.test.ts` calls `parseUniverse` separately rather
than using it, so the handoff the field exists for is exercised only through `probe.ts`.

## M3 — the baseline pass runs before the manifest is validated

`scripts/mutate.ts:358-368` against `:370`. `refuse()` is pure and needs only `files.read`, but runs
inside `runMutations` after N full test runs. A one-character indentation error in a `find` cost four
baseline runs, about 90 seconds, and then `applied nothing — the manifest was refused`. c7's
guarantee still holds; the ordering is backwards for cost.

## M4 — the report cannot say a verdict had no baseline

`scripts/mutate.ts:194, 365-367`. If a baseline run throws, `shortfall` is `undefined` and
`formatReport` renders nothing — byte-identical to a verdict that had a baseline and no shortfall.
The only notice is one stderr line during the preamble, and the report is on stdout, which is what
gets pasted into an audit. This is c8's own argument: a `SURVIVED` measured without a baseline is a
weaker claim, and the report does not distinguish them.

## M5 — the journal is not a lock; two runs can both start

`scripts/mutate.ts:309` to `:330`. Between the `existsSync` check and the write sit the recovery
branch and the pre-read of every target. Two runs launched together both see no journal, both
proceed, the second clobbers the first's journal — destroying its only recoverable copy — and both
mutate one tree. `writeFileSync(JOURNAL, …, { flag: 'wx' })` with `EEXIST` as the busy path makes it a
real lock. Reasoned from the code, not raced.

## M6 — `--show`'s vocabulary is split between DSL kinds and registry map names

`scripts/probe.ts:25, 94`. `--show variable.travel-seconds-per-unit` is refused;
`--show variables.travel-seconds-per-unit` works. The accepted list is nine singular authoring kinds
and three plural internal map names in one undifferentiated row. `# variable` is what the DSL says,
so the natural guess is the wrong one. Pass 1's M5 is half-closed: the records are reachable, under a
name the author never types.

## L1 — `restoreFailures` is unproven

Deleting `|| restoreFailures.has(file)` (`mutate.ts:179`) SURVIVED at whole-suite scope, because the
M2 test's throwing write also leaves the bytes wrong and the byte-compare catches it alone. Pinning
it needs a store whose write throws *after* landing the bytes; otherwise the condition is either dead
or a guard against a case nobody has named.

## L2 — pid reuse wedges the busy check

`journalVerdict` (`:247-250`) compares only `pid`, while `startedAt` is recorded and never used. A
recycled pid reads as permanently busy. The message tells the user to delete the journal, so it
degrades to a documented manual step, but comparing `startedAt` would close it for free.

## L3 — `UniverseRoundTrip.printed` carries a second meaning on an inherited field

`roundTrip.ts:41`. It is a `// --- name ---`-labelled concatenation of every module, and is not
loadable — multiple `# info` gives "declares # info more than once" — yet it inherits the field name
and type from `RoundTrip.printed`, where `printed` is the reloadable text. Computed on every call;
probe never reads it; one test asserts on it.

## L4 — `alive()` treats EPERM as dead

`:300-307`. A `process.kill(pid, 0)` EPERM is treated the same as ESRCH, so a journal held by a live
process owned by another user reads as dead and gets recovered.

## L5 — the journal is plaintext source in a world-known path

`:372`. Full source bytes in `os.tmpdir()`, left there whenever `unrestored` is non-empty. Per-user
tmp on Windows makes this minor, but it is uncommitted work at a predictable location.

## L6 — the corpus-count test forces a hand-edit per archived audit

`scripts/lib/auditImport.test.ts:100,110` pins exact finding counts across `docs/audits/`.
Pre-existing, not this branch's doing, but this branch is the first to pay it twice, and CLAUDE.md
names manual-sync systems specifically.

## Clause standing

c1 met, c2 met, c3 met (M6 is against the vocabulary, not the clause), c4 met, c5 met, c6 met, c7 met
(M3 is about when, not whether), c8 met, c9 met, c10 met, c11 met, c12 met. c4 and c11 carry
caveats: c4's mechanism is unfalsifiable by the suite per H1, and c11's "subprocess passed in as
data" principle is unapplied at `runTests`, which is the direct cause of H2's fix being untestable.

## On the recorded trade-off

The reframing is right; the removal of the other question is the hole. Whole-universe is the honest
answer to "does this content survive a serialize/reload cycle", and it still catches genuine
serializer defects. But the per-module question has a different true answer that is still live —
serializing a patch module alone yields a bare `# info` and `items: changed base.bread`, which is
contribution-system H1, reachable in one command in pass 1 and reachable from no command now. The
spec argues `squash-local-changes.ts` still asks it, but squash is hardwired to `local-changes` and a
target id in the repo's own content directory; an auditor cannot point it at two arbitrary sources.
The question is not delegated, it is unaskable from a command — which is the exact friction this
branch exists to remove, and the auditor reached for a hand-rolled `tsx` file importing
`src/content/roundTrip.ts`, the pattern the Deliverable opens by condemning. This did not need to be a
trade: `roundTripModule` is exported and tested, and `--round-trip=module|universe` is a flag and a
branch.
