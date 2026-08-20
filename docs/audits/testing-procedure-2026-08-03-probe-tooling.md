# Testing procedure — audit-probe-tooling, 2026-08-03

Independent pass over `3d3386a..7b16910` (6 commits), against the twelve proof clauses of
`docs/specs/audit-probe-tooling.md`. The auditor used the branch's own two commands to audit the
branch, which is both a test of them and the fastest route through the diff.

Required commands, all run rather than inferred: `npm test` exit 0 (48 files, 1074 passed, 59.57s),
`npx tsc --noEmit` exit 0, `npm run layer-check` exit 0 (501 imports, every one downward),
`npm run audit-status` exit 0, `npm run tasks -- doctor` exit 0. No CI workflow is touched and no
gate is weakened.

## What was attacked and held

Stated so the negatives count. `mutate`'s restore survived a file outside the repo carrying `$&`,
`` $` ``, `$'` and `$1` in both find and replace, CRLF endings, and three mutations against one file
where the middle runner threw — md5 identical, third mutation saw pristine bytes. Across ~15 runs the
tree came back `git status --porcelain` empty every time. `source !== module.source` referential
identity is safe, verified by reading `parseModuleSource` and `orderModules` rather than assumed. The
false-SURVIVED-from-a-non-compiling-mutation hazard does not exist in vitest 4: an un-importable file
counts as a failed test, so it reads KILLED.

## H1 — `--round-trip` blames the wrong module when the universe contains a `# remove`

`scripts/probe.ts:150-157`. The reload is `[...others, printed]`, where `others` are the *original*
sources. The printed module is serialized from the merged registry, so every other module's edits are
already baked in — and then those modules load again and replay their edits on top. Idempotent edits
survive that; `# remove` does not, because `registry.ts:594` throws when a removal names nothing
loaded.

Demonstrated. `base.dsl` declares `item rope` and `item bread`; `cut.dsl` is `# remove item.base.rope`:

```
base: its serialization does not load
  cut [cut] resolve: # remove item.base.rope names an unknown item: base.rope
cut: its serialization loads to a different registry
  items: added base.rope
```

`base`'s serialization is fine. The tool reports it as broken, in the exact words c4 reserves for a
serializer defect, on the branch's headline use case. Not a regression — `squash-local-changes.ts`
had the same reload-with-replay shape before this branch — but the new tool's claim is what fails.

## H2 — `parseVitestTally` reads stdout+stderr and takes the last match, so a stderr line can invert the verdict

`scripts/mutate.ts:86-92` and `:255-259`. `runTests` builds `raw = stdout + stderr`, which destroys
ordering, and `parseVitestTally` takes the last `Tests` line. In vitest 4.1.9 the summary is on
stdout while the Failed Tests block and test-emitted output go to stderr, so any stderr line of that
shape wins.

Demonstrated on real captured bytes from a test that `console.error`s a tally-shaped line and fails:

```
stdout+stderr (what runTests builds): {"failed":0,"total":999}
stdout alone (the truth)            : {"failed":1,"total":2}
```

`0 failed of 999` reads SURVIVED where the truth is KILLED; a `Tests 3 failed` decoy inverts it the
other way. Latent — nothing in the current suite prints such a line — but it is a silent inversion of
the tool's only output, and it compounds with M3, which discards the evidence that would contradict
it. The fix is to parse stdout only.

## M1 — c5 is not delivered: the round trip is still two implementations

`src/content/serialize.test.ts:112-122` open-codes serialize → reload → `registryDiff` with options,
and imports only `declaredVariableIds`. The spec's Decisions section cites this very file as the
reason the module moved down to `src/content/`, and then the file did not adopt it. The
`variableIds` half of the clause is delivered; the round-trip half is not.

## M2 — a throwing restore-write escapes `runMutations`, and the `unrestored` proof never runs

`scripts/mutate.ts:149-151` versus `:157-166`. The restore is `files.write(...)` inside `finally`. If
that write throws, the exception replaces the flow, the loop aborts, remaining mutations never run,
and the `unrestored` loop — the whole of c9 — is never reached. Demonstrated with an injected store
whose write fails only on restore: no report produced, file still mutated, second mutation never ran.
Reachable on Windows via an AV or editor lock, a read-only flag flipped mid-run, or a full disk. The
CLI's exit handler is a backstop but retries the same failing write and swallows the error, so the
user gets a stack trace instead of the promised `NOT RESTORED:` line.

## M3 — `TestRun.raw` is captured and never read

`scripts/mutate.ts:25,256,259`. Populated by `runTests`, consumed by nothing. The cost lands on the
most common failure: `ERROR — the run reported no tests` discards the transform or type error saying
why it does not build, leaving re-applying the mutation by hand as the only recourse.

## M4 — rationale comments are mirrored near-verbatim between source and test

CLAUDE.md keeps a comment only where the fact is expressible as neither a name, a type, nor a test.
Four pairs where the test already carries the sentence: `mutate.ts:127-128` against
`mutate.test.ts:173-174`; `probe.ts:143-146` against `probe.test.ts:134-135` and a third copy in
commit `7b16910`'s body; `probe.ts:74-76` against `probe.test.ts:222-223`; `roundTrip.ts:12-14`
against `roundTrip.test.ts:51-52` and a third copy at `squash-local-changes.ts:105-107`. Two also
describe `serializeRegistryModule`'s contract from outside `serialize.ts`, which the policy names
explicitly. `roundTrip.ts` is 8 comment lines of 32.

## M5 — `--show` cannot name `variable`, `flag` or `save`, and the comment justifying that is wrong

`scripts/probe.ts:24-26,27-28,98-99`. Probe counts `variables 1` in the same output in which it
refuses `--show variable.travel-seconds-per-unit`. `# variable` is authored DSL. The comment says
these maps "cannot be authored as a section a reference points into" — true and irrelevant, since
`--show` prints a record rather than following references — and it hardcodes "three", which drifts
the moment a map is added.

## L1 — `declaredVariableIds` gained an unmeasured `.sort()`

Not present in any of the three `variableIds` copies it replaced. Removing it SURVIVED against
`roundTrip.test.ts` and `serialize.test.ts`. Redundant at `squash-local-changes.ts:106`, which sorts
again, and unproven at `serialize.test.ts`. An unmeasured behaviour change to a DSL-load-path input.

## L2 — `applyTo`'s `$`-safety has no test

`mutate.ts:98-100`. The sole justification for `split`/`join` over `String.replace`. Swapping it for
`text.replaceAll(...)`, which still replaces every occurrence but does reinterpret `$&`, SURVIVED the
whole of `mutate.test.ts`. The comment is a behavioural claim that belongs in a test.

## L3 — the `no tests` branch is an equivalent mutant

`mutate.ts:90`. Deleting it SURVIVED, because the fallthrough already yields 0/0 on that input. The
test at `mutate.test.ts:213` cannot distinguish the branch from its absence. The format is real —
vitest 4 does emit `Tests  no tests` — only the branch is dead.

## L4 — no repo-root containment on `mutation.file`

`mutate.ts:231,236`. `path.resolve(repoRoot, file)` lets an absolute path or `../..` mutate anything
on the machine; demonstrated against a scratch file outside the repo. Manifests are auditor-authored,
so this is exposure rather than a vulnerability, but the "safe on your working tree" framing is
unbounded as written.

## L5 — `readSources` is called outside `main`'s try/catch

`probe.ts:187`. A mistyped filename prints a raw Node ENOENT stack trace where every other error path
prints a sentence.

## L6 — no on-disk journal

Captured bytes live only in process memory, which is the design's selling point and its single point
of failure: a SIGKILL or a closed terminal during the window leaves the tree mutated with no recovery
path, and by construction git cannot help, because the premise is uncommitted work. The usage text
documents the window but not that outcome.

## L7 — `total` is never compared to a baseline

A compile-breaking run went 1074 to 1027; 47 cases silently stopped running and the report said only
`3 failed of 1027`. Capturing an unmutated tally once and flagging a drop would make that visible.

## L8 — the universe is parsed twice

`probe.ts:125,130`. `loadUniverseWithDiagnostics` then `parseUniverse`. Harmless, and `parseUniverse`'s
throw is unreachable after a clean load, but redundant work on shipped content.

## L9 — `.planning/tool-friction.md` is diff content the spec does not promise

+98 lines, unowned path, so no partition issue. Noted only as scope the `## Deliverable` does not
name. The friction log itself is good work.

## Clause standing

c1 met, c2 met, c3 met (with M5 against its premise), **c4 unmet** (H1), **c5 unmet** (M1), c6 met,
c7 met, c8 met, c9 met with M2 open, c10 met, c11 met, c12 met.

## On the design

The tools should exist and the layering call was right. Two pushbacks. c4's promise is stronger than
a replay-based round trip can deliver — "reloads the universe with that serialization in place of the
original source" is not what happens and cannot be, because the other sources are sources, not their
effects; the clause should narrow to the single-module case, or the reload should exclude modules
whose edits are already merged into the printed text. And `mutate`'s central claim, restore from
memory and never from git, is correct and is also its only line of defence: M2 and L6 are the same
shape, one copy of the truth in a process that can die. A small journal written before the first
mutation and deleted after the last would make the claim survivable without weakening it.
