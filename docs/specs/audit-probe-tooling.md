# audit-probe-tooling

## Deliverable

An auditor asking "what does the load path do with this input?" and "does the suite actually catch
this?" gets a command for each, instead of building a runner out of vitest and a temp file.

Both questions are already routine — every DSL load path audit asks the first, and `docs/workflow.md`
§6 requires the second ("only mutation proves it fails for the right reason"). Neither has a tool, so
each pass rebuilds one. The observed cost of that: exploration written as `describe`/`it` blocks whose
assertions are `log()` calls into an absolute scratchpad path; a 30-line fixture module retyped per
probe because the equivalent in `entityType.test.ts` is a file-local `const`; abandoned `zzprobe*.test.ts`
left inside `src/content/`, where they are collected by `npm test`; and mutation runs that edit a
tracked file in the shared working tree and restore it with `git checkout --`, which does not restore
the file — it restores HEAD, discarding any uncommitted work in that file.

Two scripts, in the layer the repo already puts its testing tools in (`scripts/`, beside
`play-cli.ts`). Neither is a gate. Neither is wired into CI, and neither persists state: a probe is a
question, and a mutation set rots the moment the source moves, so nothing here is written down for a
later run to replay.

`npm run probe` loads DSL and says what the loader says. `npm run mutate` applies mutations, runs
tests, and reports which mutations the suite failed to catch.

Proof:

- [c1] `npm run probe` loads one or more DSL sources — files, or `-` for stdin — and prints the
  loader's own diagnostic for a module the loader rejects, with no test file, no runner and no log
  file involved. A rejecting source exits non-zero.
- [c2] Several sources in one invocation load as a universe in dependency order, so a base and a
  patch that edits it are one command. The module id, not the filename, is what `--show` and
  `--round-trip` name.
- [c3] `--show <kind>.<id>` prints one registry record as JSON. The kinds it accepts come from
  `CONTENT_SECTION_MAPS`, so a section kind added to the loader is accepted here without this file
  being edited; an unknown kind is refused with the accepted list, and a known kind with an absent id
  is refused with the ids that are defined.
- [c4] `--round-trip` serializes every loaded module and reloads the universe from **those
  serializations alone**, then reports `registryDiff` differences. One module at a time is not a
  well-defined question — a module is serialized from the merged registry, so it already carries what
  other modules did to its ids, and leaving any original source in the reload applies those edits
  twice. Idempotent edits survive that and `# remove` does not, so the per-module form reported the
  wrong module as broken. Clean output means the universe survives a serialize/reload cycle;
  differences are listed and exit non-zero.
- [c5] That round trip is one implementation, and it lives in `src/content/` rather than beside the
  scripts that call it, because `content < scripts` means a content-layer test cannot import
  upward. Its callers are the probe, `scripts/squash-local-changes.ts`'s publish guard, and
  `src/content/serialize.test.ts`; the private `variableIds` that stood in all three is gone.
- [c6] `npm run mutate <manifest.json>` applies every mutation in the manifest in one invocation, and
  restores each file from bytes captured in this process before any mutation was written — never from
  git, so a mutation run cannot discard uncommitted work in the file it mutates. Restoration holds
  when the test command exits non-zero, and when it throws.
- [c7] A mutation whose `find` text is absent from the file, or occurs more than once without
  `all: true`, is refused by name before anything is written, and the run applies no mutation at all.
- [c8] Each mutation reports `KILLED` or `SURVIVED` with the number of failing tests and **the test
  scope it was measured against**, so a `SURVIVED` verdict never stands without naming what it
  survived. A mutation that names no scope is measured against the whole suite.
- [c9] After the run, every mutated file is verified byte-identical to what was captured, and a file
  that is not is reported as a failure of the run rather than a result.
- [c10] Every file this branch adds is a member of a system in `docs/audits/systems.json`, and
  `npm run audit-status` reports the partition intact.
- [c12] `--each` loads every source on its own and reports one verdict per source, and a stdin body
  splits on a line of `---`, so a table of variants is one heredoc and one invocation rather than one
  invocation per row. `--each` exits 0 on a table of rejections: it is a survey, not an assertion.
- [c13] `--round-trip=module` asks the other question — serialize one module and reload it beside the
  other sources unchanged, which is what publishing a single module does, and is the only shape in
  which a patch module owning no ids shows up as serializing to nothing. The universe form stays the
  default.
- [c14] A `SURVIVED` measured against a named scope is re-run against the whole suite before it is
  reported, and the row names both (`one.test.ts -> whole suite`). A narrow `SURVIVED` therefore never
  stands as a final verdict, and a narrow scope becomes the cheap default rather than a weaker claim:
  only survivors pay for the suite. Baselines are measured on first use, so a scope nothing reaches is
  never run.
- [c11] `npm test`, `npx tsc --noEmit` and `npm run layer-check` pass. The two scripts are covered by
  tests that drive their decisions directly, with the subprocess passed in as data rather than run,
  and the suite stays inside the five-minute budget.

## Decisions

- The mutation runner edits the working tree in place rather than a `git worktree`. A worktree is at
  a commit, so it cannot mutate uncommitted work — and an audit often reviews exactly that. In-place
  editing with an in-memory restore is correct on a dirty tree, which is the case `git checkout --`
  gets wrong. The residual cost is a window of seconds where the file on disk is wrong for a
  concurrent reader; that is documented at the command, not designed away.
- The round trip started in `scripts/lib/` and moved down to `src/content/`. A self-review grep for
  the helper it had absorbed found a third copy inside `src/content/serialize.test.ts`, which the
  layer rule forbids from importing anything under `scripts/`. Putting a concept about
  `ParsedModule` and `serializeRegistryModule` in the scripts layer was the mistake; two of its
  three callers being scripts is incidental.
- Round-tripping the universe is the right default, but making it the only mode was wrong, and the
  second audit pass said so: `squash-local-changes.ts` is hardwired to `local-changes` and a target in
  the repo's own content directory, so it cannot be pointed at two arbitrary sources. The per-module
  question was therefore not delegated but unaskable, which is the friction this branch exists to
  remove — the auditor reached for a hand-rolled `tsx` file importing `src/content/`. Nothing forced
  the two to be exclusive; `--round-trip=module` is a flag and a branch, and it is c13.
- `--each` was added mid-branch, after the one-invocation-per-row cost was measured against the
  probe that motivated this work: its largest block was a table of eighteen one-line variants. A tool
  that answers that in eighteen commands is worse than the vitest file it replaces, so auditors would
  keep writing vitest files. The clause is c12, added rather than folded into c1.
- Nothing here is a CI gate and no mutation manifest is tracked. `CLAUDE.md` grants a gate a place
  only when it prevents something that happened; these prevent nothing, they answer questions.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-03

- base: `3d3386ac7ca181b04b1684efe305b35bb021009e`
- head: `7b169107b34ae35eae01e73524ef82d3498c90ff`
- proof 1: met — printf an instant+time: snippet | npm run probe -- - prints the loader diagnostic and exits 1; no test file, runner or log involved
- proof 2: met — probe base.dsl cut.dsl loads both in declared dependency order and --show resolves by module id; probe.test.ts proves argument order does not decide it
- proof 3: met — KIND_TO_MAP is derived from CONTENT_SECTION_MAPS and probe.test.ts iterates it, so a new kind needs no edit here; unknown kind and absent id both refuse with the list. M5 is against the clause premise, not the clause
- proof 4: unmet
- proof 5: unmet
- proof 6: met — nine mutations across three files in one invocation, tree byte-identical after; restore held on non-zero exit, on a throwing runner, and on uncommitted content; originals populated in refuse() before any write
- proof 7: met — a four-entry manifest with three bad entries reported all three by name, wrote nothing, and left git status --porcelain empty
- proof 8: met — every reported line carries its scope; scopeOf defaults to whole suite and formatReport cannot print a verdict without it
- proof 9: met — an injected corrupting store yields unrestored:[a.ts] and ok:false; M2 is an escape at the runMutations API level, filed open
- proof 10: met — npm run audit-status exit 0; four new script files under Testing procedure, both new src/content files under Contribution system and the src/content grant
- proof 12: met — one heredoc of three documents split on --- gave two rejections and one load, one line each, exit 0; splitDocuments anchors the separator to a whole line
- proof 11: met — 1074 passing in 59.57s, tsc and layer-check clean; mutate takes RunTests/FileStore as parameters so decision tests run with no subprocess, with three real tsx spawns to prove the seam

### Pass 2 — 2026-08-03

- base: `3d3386ac7ca181b04b1684efe305b35bb021009e`
- head: `bb5c62057a7f9fdaa75c334d6d085ca332aa34a5`
- proof 1: met — unchanged path; a rejecting stdin source prints the loader diagnostic and exits 1
- proof 2: met — probe base.dsl cut.dsl reports both module ids; --show resolves by module id, now sourced from loaded.parsed
- proof 3: met — SHOWABLE still derives from CONTENT_SECTION_MAPS; unknown name and absent id both refuse with the list. M6 is against the vocabulary, not the clause
- proof 4: met — the pass-1 # remove reproduction reports round-trips clean, and a mutated serialize.ts is still KILLED through probe.test.ts. Caveat H1: the mechanism itself is unfalsifiable by the suite
- proof 5: met — serialize.test.ts calls roundTripModule and asserts diagnostics as well as differences; the open-coded copy is gone and no private variableIds survives
- proof 6: met — restore held byte-identical across ~40 mutations this pass; originals captured in refuse() before any write; holds on non-zero, on throw, and on a throwing restore write
- proof 7: met — a manifest with a bad find reported applied nothing and wrote nothing; M3 is about when the check runs, not whether
- proof 8: met — this pass is the clause's own proof: universe-drops-globals read SURVIVED at file scope and KILLED at suite scope
- proof 9: met — the pass-1 M2 escape is closed; unrestored is reached on every path through runMutations
- proof 10: met — audit-status exit 0; the new record is under docs/ and the friction logs under .planning, both unowned
- proof 12: met — unchanged; --each surveys and exits 0 on a table of rejections
- proof 11: met — 1113 passing in 52.49s, tsc and layer-check clean. Caveat H1: runTests is the one decision not passed in as data, which is why H2's fix is untestable

### Pass 3 — 2026-08-03

- base: `3d3386ac7ca181b04b1684efe305b35bb021009e`
- head: `9b2a4b3df5ae8153e155538cfc104f296a375032`
- proof 1: met — unchanged; a rejecting source prints the loader diagnostic and exits 1
- proof 2: met — two sources load in dependency order from loaded.parsed; --show and --round-trip name module ids
- proof 3: met — SHOWABLE derives from CONTENT_SECTION_MAPS; the refusal groups section kinds and registry maps separately
- proof 4: met — the # remove universe reports clean and universe-reloads-originals is now KILLED, so the mechanism is falsifiable; pass 2 caveat discharged
- proof 5: met — one implementation in src/content; serialize.test.ts calls roundTripModule; UniverseRoundTrip no longer extends RoundTrip
- proof 6: met — restore held byte-identical across ~20 mutations this pass; tree clean after every run
- proof 7: met — applied nothing on a refused manifest, nothing written, and the check now runs before the baselines
- proof 8: met — every row names its scope and unmeasured marks a verdict with no baseline; pass-3 H1 is that the baseline is wrong, not that it is unnamed
- proof 9: met — unrestored is reached on every path and restoreFailures is folded in and pinned
- proof 10: met — audit-status exit 0
- proof 12: met — unchanged; --each surveys and exits 0 on a table of rejections
- proof 13: met — --round-trip=module finds the contribution-system H1 in one command; H2 is that the mode does not carry canSerialize
- proof 14: unmet
- proof 11: met — 1153 passing in 53.29s; tallyOf is the subprocess-as-data seam the clause asks for. L5 records that main()'s composition is still outside it

### Pass 4 — 2026-08-03

- base: `3d3386ac7ca181b04b1684efe305b35bb021009e`
- head: `9ade314b2afe4d3ed2b26f70688d8da3314f8c3a`
- proof 1: met — pass 3, independent: a rejecting source prints the loader diagnostic and exits 1
- proof 2: met — pass 3, independent: two sources load in dependency order from loaded.parsed
- proof 3: met — pass 3, independent: SHOWABLE derives from CONTENT_SECTION_MAPS and the refusal groups kinds and maps separately
- proof 4: met — pass 3, independent: the # remove universe reports clean and universe-reloads-originals is KILLED
- proof 5: met — pass 3, independent: one implementation in src/content with three callers; UniverseRoundTrip no longer extends RoundTrip
- proof 6: met — pass 3, independent: restore held byte-identical across ~20 mutations, tree clean after every run
- proof 7: met — pass 3, independent: a refused manifest wrote nothing, and the check runs before the baselines
- proof 8: met — pass 3, independent: every row names its scope; unmeasured marks a verdict with no baseline
- proof 9: met — pass 3, independent: unrestored is reached on every path through runMutations
- proof 10: met — audit-status exit 0
- proof 12: met — pass 3, independent: --each surveys and exits 0 on a table of rejections
- proof 13: met — author-verified after pass 3 H2: canSerialize now guards the module path too, so a source with no # info is reported as unserializable rather than as a missing item, and H2-module-mode-unguarded is KILLED
- proof 14: met — author-verified after pass 3 H1, not independently re-audited: escalation is a second phase so both baselines are taken on an unmutated tree, and a file that fails to collect is an ERROR rather than a verdict. The auditor's own instrumentation now reads ORIGINAL for both baselines and reports the shortfall of 15 it lost; their breaks-collection case reports ERROR where it read KILLED 3 failed of 1086. Six mutations of these decisions all KILLED
- proof 11: met — 1165 passing in 58s; tsc, layer-check and doctor clean
