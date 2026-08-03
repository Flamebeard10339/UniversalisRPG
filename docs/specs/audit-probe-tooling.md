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
- [c4] `--round-trip` serializes each loaded module, reloads the universe with that serialization in
  place of the original source, and reports `registryDiff` differences. Clean output means the module
  survives a serialize/reload cycle; differences are listed and exit non-zero.
- [c5] That round trip is one implementation. `scripts/squash-local-changes.ts` performs the same
  serialize-reload-diff as its publish guard and calls the same function afterwards; there is no
  second copy of the sequence.
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
- [c11] `npm test`, `npx tsc --noEmit` and `npm run layer-check` pass. The two scripts are covered by
  tests that drive their decisions directly, with the subprocess passed in as data rather than run,
  and the suite stays inside the five-minute budget.

## Decisions

- The mutation runner edits the working tree in place rather than a `git worktree`. A worktree is at
  a commit, so it cannot mutate uncommitted work — and an audit often reviews exactly that. In-place
  editing with an in-memory restore is correct on a dirty tree, which is the case `git checkout --`
  gets wrong. The residual cost is a window of seconds where the file on disk is wrong for a
  concurrent reader; that is documented at the command, not designed away.
- `--each` was added mid-branch, after the one-invocation-per-row cost was measured against the
  probe that motivated this work: its largest block was a table of eighteen one-line variants. A tool
  that answers that in eighteen commands is worse than the vitest file it replaces, so auditors would
  keep writing vitest files. The clause is c12, added rather than folded into c1.
- Nothing here is a CI gate and no mutation manifest is tracked. `CLAUDE.md` grants a gate a place
  only when it prevents something that happened; these prevent nothing, they answer questions.

## Open questions

None.
