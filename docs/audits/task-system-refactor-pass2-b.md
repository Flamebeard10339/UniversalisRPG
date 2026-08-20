# task-system-refactor pass 2B

Independent second pass. Base `354682d` … head `e861d30`. Gate re-run: `npm run tasks -- merge-ready` — tsc, npm test, layer-check, audit-status, doctor, bytes — **all six legs green**; `npm test` alone is 1312 tests in 73s wall clock, well inside the five-minute budget.

Method: every command that existed before this branch was run in-process against both the merge-base tree and HEAD over the same fixture store/specs (≈145 ordinary and adversarial invocations, output + exit code + resulting store/spec bytes compared), plus a nine-mutation run over the clause behaviours. **All nine mutations were KILLED** (`c7` findings-only-appends-a-pass, `c4` batch-writes-before-refusing, `c3` stale-margin-removed, `c5` fragment-resolution-removed, `c6` terminator-ignored, `c10` merge-suspension-removed, `c8` filed-findings-invisible, `c12` nul-check-removed, `c11` red-leg-reported-green) — the tests backing those clauses fail for the right reason.

## H1 — `tasks spec show --full` is refused, and the output `spec show` printed before this branch is now reachable only by accident

**Files:** `scripts/tasks/commands.ts:33`, `scripts/tasks/cli.ts:25`, `scripts/tasks/specCmds.ts:95`

At the merge-base, `tasks spec show <slug>` printed the whole `## Deliverable`. At HEAD it prints clause standings and its usage advertises `[--full]` for the old output. `--full` does not work:

```
$ npx tsx scripts/tasks.ts spec show task-system-refactor --full
error: --full needs a value
usage: tasks spec show <slug> [--order] [--full]  (default shows clause standings; --full prints the whole ## Deliverable)
```

Root cause, measured directly: `flagArities` derives arity from the usage prose, and the token after `[--full]` here is `(default`, which `cli.ts:25` does not recognise as "no value".

```
spec show arities: [["order","boolean"],["full","value"]]
next arities:      [["spec","value"],["system","value"],["severity","value"],["full","boolean"]]
```

So the same flag works on `tasks next` (last token in its usage) and is broken on `spec show`. Consequences, all reproduced: `--full true` is the only spelling that prints the deliverable; `--full yes` prints standings and silently swallows `yes` — precisely the "a flag not named there is an error, never a silent no-op" the root help promises. No test covers `spec show --full` (the only `--full` test, `scripts/tasks.test.ts:681`, is `next`). CI runs `npm run tasks -- spec show "$SPEC_BRANCH"` on every PR page, so what a reviewer sees changed — and neither the spec's clauses nor commit `4dae513`'s otherwise-exhaustive behaviour-change list mentions `spec show` at all. This contradicts c2's "the CLI surface is unchanged except where a clause below changes it deliberately"; I disagree with pass 1's `met` on c2 for this reason.

**Fix:** make `--full`'s arity unambiguous (move the parenthetical ahead of the flags, or declare arity explicitly rather than deriving it from prose), and add a test asserting `spec show <slug> --full` prints `## Deliverable` at exit 0. Since arity is inferred from a help string, one boolean-flag test per flag — or an explicit arity declaration — is what stops this recurring for the next flag someone documents with a trailing note.

## M1 — `tasks promote` prints "promoted X" for records it never writes

**Files:** `scripts/tasks/records.ts:629-643`

`tasks promote beta-find gamma-done --spec demo` (gamma-done is `done`) prints to stdout `promoted beta-find into demo`, then errors on stderr and returns. Verified afterwards: `beta-find` is still `unreviewed` with `spec: null`, and no event was appended. The state check sits inside the loop, after the per-record `console.log`, while `saveStoreAndWarn` is only reached past the loop. `done`/`decline` cannot do this because `resolveTaskIds` validates the whole batch before any mutation — c4's own principle. The test at `scripts/tasks.test.ts:1716` promotes two valid ids, then refuses a single closed one, so the mixed batch is never exercised.

**Fix:** collect refusals in a first pass over the resolved records and refuse before mutating or printing, making promote all-or-nothing like done/decline; add the mixed-batch case to that test.

## M2 — `--proof N=` naming a clause the spec does not have records an all-unknown pass, superseding verdicts, at exit 0

**Files:** `scripts/tasks/audit.ts:287-290`, `scripts/tasks/audit.ts:470-482`

Against a fixture spec whose pass 1 recorded `proof 1: met`:

```
$ tasks audit demo --proof 99=met --evidence 99=x
recorded pass 2 for demo: outstanding: c1 (unknown), c2 (unknown), c3 (unknown)
```

`### Pass 2` is written with every clause `unknown`; because `clauseStandings` reads the latest pass only, the recorded `met` no longer stands. Same for `--proof 0=met`, `--proof =met` and `--proof c1=met` (`Number('c1')` is `NaN`, so the map key matches no clause). The `met` verdict also escapes the "met requires evidence" refusal at `audit.ts:477`, because the clause is filtered out before that check runs.

This is **not a regression** — the merge-base behaves identically — but it is the exact trap c7 exists to close, reached through the one door c7 did not close, in a parser this branch otherwise hardened (it now refuses an unknown flag after `--finding`). It is not only a typo case: I drove a scratch spec through three passes and confirmed that any *partial* pass has the same effect — grading only clause 4 in pass 2 reset c1's `met — ran it` to `unknown` in the standing.

**Fix:** refuse a `--proof N=` whose N is not a numeric id present in the spec, naming the ids that exist — the treatment `--evidence` and `--file` already get for an unscoped value. Optionally carry a prior verdict forward when a pass is explicitly partial.

## M3 — c5's fragment resolution reaches seven of the twelve places a command takes a task id

**Files:** `scripts/tasks/specCmds.ts:59`, `scripts/tasks/specCmds.ts:212`, `scripts/tasks/architectureCmds.ts:44`, `scripts/tasks/handoff.ts:176`, `scripts/tasks/handoff.ts:214`

`show`/`edit`/`start`/`stop`/`done`/`decline`/`promote` resolve fragments through `resolveTaskIds`. These five do not, reproduced on one fixture store:

- `tasks show beta` → `resolved beta -> beta-find`; `tasks spec add demo beta` → exit 1, `error: no such task: beta`, then lists `beta-find` as a near match.
- `tasks spec remove demo alpha-o` → same refusal.
- `tasks plan alpha-o` → exit 0, "no such task", grades nothing.
- `tasks note hello --id alpha-o` → records the event against the literal string `alpha-o`; `tasks log --id alpha-o` then answers nothing.

Commit `4dae513`'s body claims "every id position resolves a unique prefix/substring". Pass 1 graded c5 `met` on `tasks show` alone; I disagree — the clause says "anywhere a command resolves a task id".

**Fix:** route those five through `resolveTaskIds` (reporting form for the reads `plan`/`log`, refusing form for `spec add`/`spec remove`/`note --id`), or narrow c5 to the verbs it actually covers.

## L1 — a finding's `--evidence` is captured as clause evidence when its text begins `<digits>=`

**Files:** `scripts/tasks/audit.ts:291-296` (contract stated at `audit.ts:258-262`)

`tasks audit demo --finding X --severity low --deliverable d --evidence "404=the endpoint returns 404"` exits 1 with `error: finding "X" needs --evidence "..."`. `clauseScoped` is tried before `current` is consulted, so the finding's evidence is filed under clause 404 and the finding is then refused for having none. The module's own comment says the opposite ("once a --finding is open they attach to that finding instead and take a bare value"). Loud rather than silent, but the error names the wrong problem.

**Fix:** treat `--evidence` (like `--file` already does) as clause-scoped only while `current === null`.

## L2 — `tasks concept "<system>"` with no concept name dies with a raw TypeError

**Files:** `scripts/tasks/architectureCmds.ts:214`

```
$ npx tsx scripts/tasks.ts concept "Task system" --paths scripts/lib/bytes.ts
TypeError: Cannot read properties of undefined (reading 'trim')
```

`!name.trim()` is evaluated before establishing that `name` exists, and `positionalArity` admits one positional, so the body is reached. Identical at the merge-base, so not a regression — but it now sits in a module this branch created, behind a boundary (`commands.ts:115`) whose whole purpose is turning malformed input into a diagnostic. **Fix:** `!name?.trim()`.

## L3 — `scripts/lib/bytes.ts`, written for the Task system's merge gate, is owned by Testing procedure

**Files:** `docs/audits/systems.json` (Task system `paths`), `scripts/tasks/mergeReady.ts:3`

`tasks where scripts/lib/bytes.ts` answers `system: Testing procedure`, `imported from outside its system by: scripts/tasks/mergeReady.ts (Task system)`. c1 enumerates the eight re-homed libs by name; this branch's own new lib was not added, so it falls to Testing procedure's blanket `scripts/lib` claim and creates a fresh cross-system edge whose only consumer is the Task system. The partition is intact and `audit-status` is green either way. **Fix:** declare `scripts/lib/bytes.ts` and its test under the Task system, or record why the byte check belongs to Testing procedure.

## Verified sound

- **c7's fix is real and well-tested.** `tasks audit <spec>` with findings and no `--proof` appends no pass; the test (`scripts/tasks.test.ts:2162`) asserts the spec file is byte-identical afterwards, and inverting the branch turns it red. Attribution is to the latest *recorded* pass (`pass1` in the id, "against pass 1" in the message), which matches the promise. With zero recorded passes it attributes to pass 1 — a pass that does not exist yet, harmless because only `>= 2` changes behaviour anywhere.
- **CRLF normalization round-trips correctly, and cannot churn the repo.** A CRLF spec that parsed as "no recorded passes at all" at the merge-base now parses identically to LF, and `stampClauseIds` → `appendAuditPass` → `parseSpecDoc` survives the round trip. The write-back is LF-only, but `.gitattributes` declares `* text=auto eol=lf` and all ten tracked specs are already LF on disk, so no tracked file changes shape. (One cosmetic edge: for a CRLF input the "tagged … [cN]" line prints even when nothing was stamped, because `text !== original` compares normalized against raw.)
- **Clause id stamping and reuse across passes is correct.** Driven end to end: pass 1 stamps `[c1..c3]`; reordering and rewording keeps every verdict attached to its clause; a clause inserted afterwards takes the next free id (`c4`, reserving ids any pass ever graded); deleting a clause retires its id and drops it from the standing. Ids behave as names, exactly as the module claims.
- **The prefixed `RG-`/`CL-` import form works end to end and does not collide.** A doc with `## H1`, `## RG-H1`, `## CL-M6` imports as three findings with ids `…-h1`, `…-rg-h1`, `…-cl-m6` and severities high/high/medium; the prefix is retained in the code, so two auditors' `H1`s stay distinct. CRLF audit docs, which imported as *zero* findings at the merge-base, now import correctly.
- **`layerOf`'s reuse of `covers` is behaviour-preserving.** `covers(root, file)` reduces to `file === root || file.startsWith(root + '/')` for every non-`*.` path, which is exactly the code it replaced; every layer root is such a path.
- **No CI or gate weakening.** `.github/workflows/test.yml`, `package.json` and `vite.config.ts` are untouched by this branch. Test removals are all accounted for by deliberate clauses (c3's warn-once, c5's fragment resolution, c10's error→warning), each replaced by a stricter or equivalent test.
- **No silent store-format change.** `renderTask`'s field order is identical at both ends, and `docs/tasks.jsonl` changes 83 of 389 lines — no wholesale rewrite, no merge-conflict surface added.
- **Refuted hypotheses:** that CRLF normalization would rewrite tracked specs wholesale (it cannot — `eol=lf`); that the store serializer changed key order (it did not; my first differ run was comparing a written file against an unwritten one); that `audit --finding --system "<not a system>"` was newly unvalidated (identical at the merge-base, and `doctor` reports it).

## Must not merge without

**H1 only.** It is a real regression in a CI-visible read, it makes a flag the tool documents unusable, and the fix is a one-line arity correction plus a test. M1, M2 and M3 are genuine and worth scheduling — M2 in particular is the last open door to the verdict-wiping trap this branch was written to close — but none of them loses data or blocks the merge, and M2 and L2 are equally true of the code this branch replaces.
