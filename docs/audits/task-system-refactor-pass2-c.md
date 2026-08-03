# task-system-refactor pass 2C

Independent second pass, CLI-surface emphasis. Base = `354682d`, head = `e861d30`. Every claim below was reproduced by running the tool, not by reading it. Gate: `merge-ready` all six legs green, 100s wall.

## H1 — `tasks spec show --full` is rejected by the parser, and it is the only way back to the output this command had before the branch

**Files:** `scripts/tasks/commands.ts:33`, `scripts/tasks/cli.ts:25`, `scripts/tasks/specCmds.ts:95`

`flagArities` derives a flag's arity from the token that follows it in the usage string. In `SPEC_COMMANDS.show` the token after `[--full]` is the prose parenthetical `(default`, which is neither `--`, `[--`, `]`, nor end-of-string — so `--full` is derived as taking a **value**:

```
$ tasks spec show task-system-refactor --full
error: --full needs a value
usage: tasks spec show <slug> [--order] [--full]  (default shows clause standings; --full prints the whole ## Deliverable)
exit=1
```

Three consequences, all reproduced:
- `--full` in its documented form always exits 1. `--full true` works by accident; `--full x` is **accepted at exit 0 and silently does nothing** — precisely what the root help forbids ("a flag not named there is an error, never a silent no-op").
- `tasks spec show --full <slug>` swallows the slug as the flag's value and exits 1 printing bare usage with no error line.
- This is a **regression against base**. At `354682d` the usage was `tasks spec show <slug> [--order]` and the default output was the whole `## Deliverable` with untruncated clause text. On this branch the default is one-line standings truncated at ~100 chars with `…`, and the untruncated text is now unreachable from the CLI. `.github/workflows/test.yml:62` runs `tasks spec show` on the ubuntu leg, so the PR-page spec report changed too.

`positionalArity` (`cli.ts:44`) already stops at "the first flag or the first prose parenthetical"; `flagArities` has no such stop, so the two derivations from one usage string disagree. There is a sweep test for positional-arity drift (`scripts/tasks.test.ts:298`, whose comment names this exact failure mode — "`spec` derived 3 from prose in its own usage line and went unnoticed through two audits") but **no equivalent sweep for flag arity**, and no test anywhere references `spec show --full`.

**Fix:** teach `flagArities` the same "stop at a prose parenthetical" rule `positionalArity` already has (or move `[--full]` to the end of the usage line), and add the flag-arity twin of the existing junk-argument sweep — for every command surface, assert each boolean flag in its usage is accepted bare. Then decide deliberately whether `spec show`'s default should have changed at all; c2 promises the surface is unchanged except where a clause changes it, and no clause declares `--full`.

## M1 — `tasks promote` prints promotions it did not make when the batch is refused

**Files:** `scripts/tasks/records.ts:632`

`cmdPromote` validates each record's state *inside* the write loop, after it has already printed the success line for the records ahead of it, then returns before `saveStoreAndWarn`:

```
$ tasks promote aaa bbb --spec probe
promoted aaa into probe
error: bbb is declined — promote moves unreviewed or deferred records into a spec, it does not reopen closed ones
exit=1
$ tasks show aaa
aaa  [finding/unreviewed/high]
spec: (deferred)          <- aaa was never promoted
```

Nothing is written (good), but stdout asserts a write that did not happen. `done` and `decline` get this right — `resolveTaskIds` refuses the whole batch before either touches a record — which is exactly what c4 promises and c9 says `promote` is the non-interactive form of.

**Fix:** hoist the state check into a validation pass over `resolved` before the mutation loop, so `promote` refuses with nothing printed, matching `done`/`decline`.

## M2 — `tasks audit <spec>` with no flags on non-interactive stdin silently records an all-unknown pass over recorded verdicts

**Files:** `scripts/tasks/audit.ts:472`, `scripts/tasks/audit.ts:325`

Reproduced against a scratch store and spec:

```
$ tasks audit probe --proof 1=met --evidence 1="ran it" --proof 2=met --evidence 2="ran it too"
recorded pass 1 for probe: no clause outstanding

$ tasks audit probe < /dev/null
clause 1: first promise
met/unmet/unknown? recorded pass 2 for probe: outstanding: c1 (unknown), c2 (unknown)
exit=0

$ tasks spec show probe
clause standing (latest pass 2): outstanding: c1 (unknown), c2 (unknown)
```

`walkClausesInteractively` returns `[]` the moment `prompter.exhausted()`, the caller grades everything `unknown`, and a full pass is appended and becomes the latest — which is what the standing reads from. That is "a permanent pass that says nobody looked", the trap c7's own text names. c7 closes the *findings-without-proof* route only; the interactive route is still open, and it is the one an agent hits by typing the bare command with no TTY.

The mechanism is pre-existing (identical code at `354682d:scripts/tasks.ts:2094`), so this is not a regression — but this branch makes it materially more likely: `audit-prompt` now instructs every commissioned auditor to file through `tasks audit`, where the old CLAUDE.md prompt asked for a report.

**Fix:** refuse rather than record when the walk graded nothing and stdin was never interactive — exit 1 naming `--proof`, the same way a `met` verdict with no evidence is refused. A pass that graded zero clauses is not a pass.

## M3 — prefix/substring id resolution is missing everywhere except the six commands that call `resolveTaskIds`, and `docs/workflow.md` promises it everywhere

**Files:** `docs/workflow.md:13`, `scripts/tasks/specCmds.ts:61`, `scripts/tasks/specCmds.ts:214`, `scripts/tasks/architectureCmds.ts:45`, `scripts/tasks/handoff.ts:174`, `scripts/tasks/records.ts` (`--requires`)

`docs/workflow.md:13` states, at the head of the protocol every agent follows: "Any id may be given as a unique prefix or substring." Reproduced against the real store:

```
$ tasks show tsr-spl                                  -> resolved tsr-spl -> tsr-split          (works)
$ tasks spec add task-system-refactor tsr-spl         -> error: no such task: tsr-spl   exit=1
$ tasks plan tsr-spl                                  -> no such task: tsr-spl          exit=0
$ tasks note "probe" --id tsr-spl                     -> no record answers to tsr-spl   exit=0
```

The `--requires` case is the one with real damage, and it is used by workflow step 3:

```
$ tasks add "the dependency" --id build-the-parser
$ tasks add "the dependent" --id use-the-parser --requires build-the
added use-the-parser [task/open]
recorded 1 requirement(s) no record answers to: build-the
$ tasks show use-the-parser   -> use-the-parser [task/open] BLOCKED / requires: build-the (missing)
$ tasks doctor                -> [error] use-the-parser requires unresolved id: build-the
```

An unambiguous prefix in `--requires` creates a permanently blocked task and a standing doctor error.

**Fix:** either route `spec add`/`spec remove`/`plan`/`--id`/`--requires` through `resolveTaskIds` (the read/write emitter split it already carries covers all five), or narrow `docs/workflow.md:13` to name the commands that actually resolve. Leaving both as they are means the repository's one live protocol document is wrong about its own tool — the condition `docs/workflow.md` opens by declaring a defect.

## M4 — a new system was declared but `tasks import` was not taught its name, so `task-system-*` audit docs import unowned

**Files:** `scripts/lib/auditImport.ts:79`

c1 creates the `Task system`. `DOC_SYSTEM_PREFIXES` still lists only the seven older systems, and `docs/audits/systems.json` explicitly says this system's audit history lives in "the `task-system-*` … docs under `docs/audits/`". Reproduced with two identically-shaped docs:

```
$ tasks import .../task-system-2026-08-03.md
imported 1 finding(s) — no system mapping for this doc name, system left null
$ tasks import .../testing-procedure-2026-08-03.md
imported 1 finding(s)

$ tasks list --state unreviewed
task-system-2026-08-03-h1        [finding/unreviewed/high]  (no system)        a high finding
testing-procedure-2026-08-03-h1  [finding/unreviewed/high]  Testing procedure  a high finding
```

Every finding imported from this system's own audit docs is invisible to `tasks list --system "Task system"` and to the per-system views the carve-out was done to enable.

**Fix:** add `['task-system', 'Task system']` to `DOC_SYSTEM_PREFIXES`. Better, derive the map from `systems.json` (slugified names) so declaring a system cannot leave a second table stale — this is the "systems required to be manually kept in sync" shape CLAUDE.md forbids.

## L1 — c3's "at most once per process" has no coverage; the guard survives deletion

**Files:** `scripts/tasks/context.ts:100`, `scripts/tasks.test.ts:1331`, `scripts/tasks.test.ts:152`

Mutation-tested: deleting `if (warnedStoreDirty) return;` and running `npx vitest run scripts/tasks.test.ts` gives **257 passed (257)**. The guard is untestable through the fixture that exercises it — `defaultStoreGitFixture` (`tasks.test.ts:170`) spawns a fresh `tsx` subprocess per invocation, so the module-level flag is always `false` and no test can observe a second warning in one process. The test named "…and warn once over stale uncommitted state" proves the 30-minute staleness margin only.

Pass 1 graded c3 met citing "warnedStoreDirty once per process; the warn-once-over-stale test in tasks.test.ts passes". That test does not cover the once-per-process half. This is my one direct disagreement with a pass-1 verdict: c3 is half-proved.

**Fix:** call `run(...)` twice in-process through `runInProcess` against a backdated store and assert the second call is silent, or export a reset for the flag so the property is expressible. Either way the clause's second half becomes something a mutation can break.

## L2 — no flag value may begin with `--`, and the `--` terminator cannot rescue one

**Files:** `scripts/tasks/cli.ts:78`, `scripts/tasks/commands.ts:152`

`parseArgs` refuses any value starting with `--`, and the terminator added by c6 only makes *positionals* literal. There is no argument order that records a dashed flag value:

```
$ tasks add "t1" --evidence "--full needs a value"
error: --evidence needs a value
error: unknown flag: --full needs a value

$ tasks add "t2" --evidence -- "--full needs a value"
error: --evidence needs a value
error: unexpected argument: "--full needs a value"
```

Same for `tasks edit --title/--deliverable`, `tasks decline --reason`, and `tasks audit --finding/--evidence/--deliverable`. This bites the audit pipeline directly: filing H1 above through `tasks audit --evidence "--full needs a value"` is impossible. The workaround (never start the text with a dash) is undocumented — the only guidance, on `note`/`decision`, points at the terminator, which does not apply to values.

**Fix:** accept the next token as a value when the flag's derived arity is `value` and the token is not itself a known flag name, or honour `--` as "the next token is literal" in value position. Whichever is chosen, say so in `GLOBAL_USAGE` alongside the terminator note.

## Verified sound

Hypotheses checked and refuted, plus clause behaviour confirmed by running it:

- **The gate is green and inside budget.** `npm run tasks -- merge-ready` at `e861d30`: all six legs ok (tsc, npm test 1312/1312, layer-check, audit-status, doctor, bytes), exit 0, **100s wall**. The report shape is one padded line per leg plus a verdict line, as c11 promises. CI (`.github/workflows/test.yml`) and `package.json` are untouched by the branch — no gate was weakened.
- **The CLI surface is otherwise exactly as promised.** I ran base `scripts/tasks.ts` and head side by side and diffed `--help` and `spec --help`. The entire delta is: `promote` and `merge-ready` added; `done`/`decline` pluralised to `<id>...`; `note`/`decision` gained the terminator note; `log --op` gained `spec-done`; `audit`/`audit-prompt` prose extended — **plus `spec show [--full]`**, which is H1. No command or flag was silently dropped.
- **c6, the `--` terminator, holds** for every command that takes free text. Verified live on `note`, `decision`, `add`, `edit`, `search`, `log`: `tasks add --id dashed --store S -- "--each: a dashed title"` records the title verbatim and `tasks search -- "--each"` finds it. Global flags placed before the terminator survive it.
- **c10, doctor's merge suspension, holds** — I refuted the pass-1 note that it is untested-and-therefore-unverified by exercising it. With a working-tree-only close in `docs/tasks.jsonl`, doctor reports it at `[warning]` (2 issues). With `MERGE_HEAD` written into the worktree gitdir (`git rev-parse --verify MERGE_HEAD` confirming git sees it), doctor prints the one-line suspension notice, drops the working-tree-only warning, and keeps the store-only dirty-store warning (1 issue). The `git rev-parse` route is correct for a worktree where `.git` is a file, as the comment claims.
- **c4 and c5's core hold.** `tasks done alpha-one nosuch` refuses at exit 1 with `alpha-one` still open; `tasks done alpha-one beta-two` closes both, one reported line each, in argument order; `tasks start alph` prints `resolved alph -> alpha-one`; `tasks show tsr` refuses naming all seven candidates.
- **c8 holds.** A finding filed by `probe`'s audit appears in `spec show` under its own "awaiting triage (not members)" section, in `list --spec probe` tagged "(filed by this spec's audit — awaiting triage)", and `next --spec probe` reports the count while never offering it as work.
- **The read/write exit-code asymmetry holds for record lookups.** `show`, `where`, `produces`, `plan`, `next`, `spec show`, `handoff` all answer at 0 on a name that does not exist; `spec add` on the same name refuses at 1. The enum-validation refusals (`list --state bogus`, `log --op bogus`, `system "No Such"` at exit 1) are byte-identical to base, so not a branch defect.
- **`layerOf` via `covers` is behaviour-preserving.** `covers(path, file)` reduces to `file === path || file.startsWith(path + '/')` for every `ROOTS` value (none is a `*.` glob), which is the deleted implementation exactly. That closed finding is genuinely closed.
- **`tasks import` accepts this report's format.** `## H1 — title` / `## M1 — title` parse to `high`/`medium` with bodies bounded at the next `##`, and a trailing `## Verified sound` prose section is correctly not imported as a finding.
- **c1's ownership is as declared.** `tasks where` answers `Task system` for `scripts/tasks.ts`, `scripts/tasks/cli.ts`, `scripts/tasks/mergeReady.ts`; `audit-status` reports the partition intact inside the green merge-ready run.

## Must not merge without

**H1 only.** It is a regression in a command CI runs, a documented flag that exits 1 in the form it documents and silently no-ops in the form that parses, and the fix is a one-token change to a usage string plus the flag-arity sweep that would have caught it — the twin of a sweep this branch's own test file already has and whose comment names this exact bug class.

M1–M4 are real and cheap, but none of them breaks something that worked before this branch. M2 in particular is a pre-existing hole that this branch widens the traffic through rather than creates; I would promote it, but on its own merits, not as a merge gate.
