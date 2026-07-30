# Testing procedure audit — 2026-07-30

Independent audit of repository system 5 (**Testing procedure**) at `4631baa`, covering the 16
code-changing commits since `50a4f41`: `1301729, 69d1aa0, 0ab8536, 861399c, 11d9335, 731c3a6,
339f106, 8a54d1b, fe74472, 7676c09, 4b6e383, 73a73f3, 8cde0dc, 6299045, 2c2ccee, f9dfd72`.

Scope is CLAUDE.md's three-part definition — the `play-cli` REPL, the `# test`/`runTest`/
`integration.test.ts` regression format, and CI — plus the gates `systems.json` assigns it
(`audit-status`, `layer-check`, `.claude/hooks`).

Baseline: `npx tsc --noEmit` clean, **33 files / 509 tests** green, `npm run layer-check` reports
433 imports all downward, `npm run audit-status` exits 0 with every system documented.

Method: every gate and every REPL command was attacked, not read. Fixtures ran in a throwaway
`git worktree` under the scratchpad (removed; the working tree was never modified) against the
real scripts. Each finding names the fixture so it can be re-run.

The 2026-07-28 pass's findings are not re-reported except where a later commit changed their
severity. Its `H1`/`M4`/`L5` died with the comment gates (`1301729`), `M2` `M5` `M6` `M7` `L2`
`L3` `L4` are closed in `completed-tasks.md`, and `M3` is open and tracked under *First-class
modals* in `backlog.md`.

---

## What the system gets right

**The partition check is real.** `orphanedFiles` was attacked with a tracked `rogue.ts` at the
repo root and a tracked `.vscode/settings.json`; both were named and both failed the run. The
`*.md` rule correctly covers only root-level prose (`covers` rejects a `/`), so a stray
`docs/`-shaped path cannot hide under it.

**The hook now reports on the edge it claims.** Driven with a synthetic payload against a fresh
`$GIT_DIR/audit-due-state`: healthy ledger → `exit 0`, state `<head> ok`; threshold dropped to 1
→ `exit 2` with the ledger on stderr, state `<head> due`; run again on the same HEAD → silent.
Exactly the OK→DUE-once contract `7676c09` describes. (Its failure mode is **M1**.)

**`layer-check` catches what `fe74472` claimed.** Every spelling in `layers.test.ts` was
re-verified against live fixtures: `src/grammar/probe-a.ts` importing `../../src/runtime/session`
and `src/grammar/probe-b.ts` doing `await import('../runtime/session')` were both flagged, and the
run exited 1. Comment-blanking, directory imports and all three quote styles hold. (Its hole is
**M2**.)

**`integration.test.ts` enumerates rather than lists.** It loops `registry.tests.keys()`, so a
`# test` authored today runs in CI tomorrow without anyone remembering to register it. This is the
right shape and it should stay.

---

## H1 — `/test` rewinds the live session, records nothing, and makes `/create-valid-test` emit a test that fails on its own first replay

`runTestCommand` (`scripts/play-cli.ts:172`) calls
`runTest(testId, session.registry, session.state)`. `runTest` builds its own `PlaySession`
wrapper — its comment says so — but the `GameState` it applies directives to **is the live one**.
A `# test` that begins `load: <save>`, which is the shape `/create-test` itself emits and the shape
two of the three shipped tests use, therefore overwrites the player's inventory, location, flags
and clock. Nothing is recorded, so `recorder.history` still describes the pre-`/test` timeline
while `session.state` no longer does.

`/create-valid-test` then serializes the *current* state as the `-end` save and pairs it with
directives that produce a different one.

Fixture (`scratch-probe.ts`, driving the exported `handleCommand` directly — no TTY needed):

```
played:  travel: ruins   -> location = ruins  inventory = {}
ran:     /test unrelated-regression ->  Test 'unrelated-regression' PASSED
         live state is now location = camp   inventory = {"gold":3}
         recorder.history = ["travel: ruins"]
```

and the emitted block:

```
# save derived-start
{"version":5}

# save derived-end
{"version":5,"inventory":{"gold":3}}

# test derived
load: derived-start
travel: ruins
expect: derived-end
```

Replayed from a fresh state the way `integration.test.ts` would:

```
{"passed":false,"failure":"save mismatch derived-end: inventory.gold: (absent) vs 3;
 location: \"ruins\" vs (absent); time: 5000 vs (absent)"}
```

The `/create-valid-test` contract is the record → emit → reload → replay round trip, asserted by
name at `scripts/play-cli.test.ts:364`. One `/test` during a session breaks it. In the good case
the author sees a red test and re-records; in the bad case the divergence is small enough that
`expect:` still passes and a regression is pinned against a state the directives never produce.

Reached by two commands, not one: `/test <id>` (`play-cli.ts:435`) and a raw `run: <id>` directive
(`play-cli.ts:458`) share `runTestCommand`.

Why the suite missed it: `play-cli.test.ts:204` exercises `/test` with `always-passes` /
`always-fails`, both of which are a single `assert:` and change nothing. The test repeats the
implementation's assumption that a test is read-only.

The state sharing is correct for its other two callers — `integration.test.ts` passes a fresh
`createGameState()`, and a nested `run:` inside a `# test` *must* share state. So the fix belongs
in `runTestCommand`: snapshot before and restore after (`serializeSave`/`loadSave` already exist,
and `/create-test` already round-trips through them), rather than changing `runTest`.

---

## M1 — one bad SHA silences the whole ledger, and the hook reads the crash as "nothing to report"

`touchesSince` (`scripts/audit-status.ts:83`) runs `git log <lastAudit>..HEAD` through
`execFileSync` with no guard. Setting Testing procedure's `lastAudit` to `deadbeef`:

```
Error: Command failed: git log --format=%h %s deadbeef..HEAD -- scripts/play-cli.ts …
fatal: bad revision 'deadbeef..HEAD'
    at touchesSince (scripts/audit-status.ts:83:15)
```

The 2026-07-28 pass logged this as **L1**, "crashes with a Node stack trace" — cosmetic, because
the crash still exits non-zero. It was never fixed and never lifted into `backlog.md`. `7676c09`
then changed what non-zero *means*:

```bash
case "$ledger" in
  *"audit due:"*|*"no audit doc:"*) ;;
  *) exit 0 ;;
esac
```

A stack trace carries neither verdict line, so the hook classifies it as "the ledger could not
run" and exits 0 **without writing the state file**, so it re-reaches the same conclusion on every
subsequent commit. Measured, with the ledger reachable (the worktree's `audit-status` script
repointed at the parent's `tsx`):

| Ledger state | Hook exit | State file written | Reported |
| --- | --- | --- | --- |
| OK | 0 | `<head> ok` | — |
| genuinely DUE | 2 | `<head> due` | yes |
| `lastAudit: deadbeef` | **0** | **none** | **no** |
| `deadbeef` **and** threshold 1, so another system is genuinely due | **0** | **none** | **no** |

The last row is the one that matters. The crash happens inside the per-system loop, so no verdict
line for any system is ever printed, the `audit due:` summary never runs, and **`orphanedFiles`
never runs either** — it sits after the loop at line 131. One unresolvable SHA disables commit
counting, the doc gate and the partition check together, and the only thing that still notices is
CI at push time.

This is not hypothetical: `lastAudit` records a branch SHA, and this repo rebases and squashes
feature branches. Once the original is gc'd the reference is unresolvable.

Same class, same consequence: a malformed `systems.json` throws out of `JSON.parse` at line 106,
before the loop.

Fix is two small ones. In `audit-status`, resolve `lastAudit` with a `try` and turn a failure into
a named verdict line (it already has `undocumented` as the template for "a system is
mis-recorded"), so the ledger reports rather than aborts. In the hook, treat an unrecognised
non-zero exit as worth one line on stderr rather than silence — fail-open is defensible for a
missing `node_modules`, but not for a ledger that ran and blew up.

---

## M2 — `layer-check` never reads any file directly under `src/`, which makes that directory an import launderette

`ROOTS` (`scripts/lib/layers.ts:8`) names five directories. `src/main.tsx`, `src/vite-env.d.ts`
and anything else placed directly under `src/` belong to none of them, and the consequence runs
both ways: `layer-check` never iterates those files, so their imports are unchecked, and
`layerOf` returns `null` for them, so imports *into* them are skipped by `layer-check.ts:18`.

Fixture — two files, neither flagged, run exiting 0 on their account:

```ts
// src/probe-root.ts
import { runTest } from './runtime/session';
import { handleCommand } from '../scripts/play-cli';   // grammar…scripts, unreported

// src/grammar/probe-c.ts
import { runTest } from '../probe-root';               // reaches runtime + scripts, unreported
```

The edge count moved 433 → 435 across all four probe files: only the two that live inside a root
and target a root were counted at all.

`layers.test.ts:36` pins `layerOf('content/tutorial-island.dsl') === null` as correct behaviour,
which it is — but nothing distinguishes "this path is deliberately outside the stack" from "this
path is source the sweep forgot", and `src/main.tsx` is the second kind.

Latent today: `main.tsx` is the placeholder root and imports only React and `./index.css`. It
stops being latent at the GUI rebuild, when `main.tsx` grows real imports and `src/ui` appears
beneath it.

The fix already exists one directory over. `audit-status` made membership meaningful by proving
it is a partition and failing on a file that belongs to nothing; `layer-check` should assert the
same over `sourceFiles('src')` and `sourceFiles('scripts')` — every source file is inside a
declared root, or the run fails naming it. That is the check that would have caught this hole and
the six `fe74472` closed.

---

## M3 — `/create-test` is the one authoring command that ignores the authoring machinery

`11d9335` gave the REPL a real local-DSL path: `/dsl <kind> <id> <body>` stages a section through
`upsertLocalSection`, reloads the universe to prove it valid, and persists via
`writeLocalChanges`. `play-cli.test.ts:508` demonstrates it authoring all sixteen section kinds
local-changes may own — **including `# test` and `# save`**.

`buildCreateTest` (`play-cli.ts:241`) predates that and was not revisited. It hand-assembles the
block, `console.log`s it, and mutates `session.registry` in place
(`registry.tests.set`, `registry.saves.set`) without ever touching `authoring`. The recorded
regression exists only in the terminal scrollback until a human copies three blocks into a content
file by hand — which is the exact step CLAUDE.md's "record a regression as a `# test` section via
`/create-test`" is supposed to make cheap, and the exact step `/dsl` already automates.

It is also the only writer that bypasses the load-time validation gate: `/dsl` refuses a section
that does not load, `/create-test` cannot refuse anything because it never re-loads.

Routing `buildCreateTest`'s three blocks through `commitLocalChanges` deletes the duplicated
registry mutation, gives `/create-test` the same validation and persistence every other authoring
verb has, and makes the emitted test survive the session. It also removes the mechanism behind
**H1**'s worst outcome, since a corrupt emission would then have to survive a reload.

---

## Lows

- **L1 — the audit-doc gate accepts a file outside `docs/audits/`, a file with no content, and a
  file that is not committed.** `documented()` (`audit-status.ts:98`) checks `startsWith`,
  `existsSync`, `isFile` and `size >= 500`. Measured passes: `lastAuditDoc:
  "docs/audits/../../package-lock.json"`; a `docs/audits/filler.md` holding 600 bytes of `x`; the
  same file left untracked. The 500-byte floor `73a73f3` added is a real improvement over the
  2026-07-28 `touch` case and the gate can never judge content, but `resolve()`-and-contain and a
  `git ls-files --error-unmatch` are two lines that close the two mechanical holes. The untracked
  case is caught by CI incidentally, and by nothing locally.

- **L2 — the Windows CI leg cannot see the thing its comment says only it can see.** `test.yml:15`
  justifies the matrix as "a Windows checkout is a real configuration this content has to parse
  in, and ubuntu alone cannot see it". `4b6e383` added `.gitattributes` in the same commit, and
  `* text=auto eol=lf` forces LF into the working tree on every platform regardless of
  `core.autocrlf`, so the Windows runner checks out byte-identical content. The real CRLF guard is
  `integration.test.ts`'s in-memory `replace(/\n/g, '\r\n')`, which runs on ubuntu too. The leg is
  still worth its minutes — it is the only place `posix()`, `tsx` and vitest are exercised on the
  platform this repo is developed on — but the comment should say that, since it is the reason
  anyone would keep paying for it.

- **L3 — the CLI's whole argument surface is unexported and untested.** `parseCliArgs`
  (`play-cli.ts:671`) handles `--live`, `--local`/`--changes`/`local=`, `--modportal`/`modportal=`/
  `--no-modportal` and positionals, and is reachable only from `main()`. `8a54d1b` fixed a real
  data-loss bug there — a second positional became the local-changes file, which `/dsl` then
  rewrote over real content — and shipped with no regression test, because there is no seam to
  test through. `handleCommand`, `liveTick` and `loadModportalSources` are all exported for exactly
  this reason; `parseCliArgs` is the one decision function that is not.

- **L4 — `systems.json`'s Testing note is factually wrong about `scripts/lib`.** It says its
  "scripts coverage is narrowed to the files it actually implements, with the contribution scripts
  charged to their own system", but `scripts/lib` is declared as a whole directory and therefore
  still covers `scripts/lib/modportalCache.ts`, which the Contribution system also lists.
  `339f106`, `8cde0dc` and `6299045` are double-charged. Either intend it and say so the way the
  DSL note does, or name the three files Testing procedure actually implements
  (`layers.ts`, `sourceFiles.ts`, `stripComments.ts`, plus their tests).

- **L5 — `handleCommand`'s comment claims a single recorder seam that live mode does not honour.**
  `play-cli.ts:502` says "The one place a result reaches the recorder, so the two paths cannot
  drift." Live mode pushes to `recorder.history` at four other sites (`play-cli.ts:855, 860, 861,
  865`) inside `main()`'s loop, entirely outside `handleCommand`. The divergence is deliberate — a
  live numeric choice records `begin:`/`wait:`/`cancel` rather than the instant form — but the
  comment describes a contract the file no longer has, and none of those four sites is under test
  (`runLiveAction` is unexported and TTY-bound; only the pure `liveTick` is covered).

- **L6 — `shownLocations` and `speedMultiplier` are module-level mutable state.**
  `play-cli.ts:82,85`. A second `PlaySession` in the same process inherits the first one's
  "already described" set, so `formatView` output depends on process history — harmless for a
  one-session REPL, but it means any future assertion over CLI output is order-dependent, and
  `play-cli.test.ts` already builds many sessions per run.

---

## Gate scorecard

| Gate | Catches | Lets through |
| --- | --- | --- |
| `audit-status` counting | code vs comment-only vs rename; add/delete; cross-system; ordinary and evil merges; non-`.ts` members compared verbatim | file-mode-only changes; **aborts entirely on an unresolvable `lastAudit` or malformed manifest (M1)** |
| `audit-status` partition | a new tracked file anywhere, including under a dotted directory | nothing found |
| `audit-status` doc gate | missing, empty, directory, and sub-500-byte docs | `docs/audits/../../<anything>`; 500 bytes of filler; an untracked file (L1) |
| `layer-check` | all six import spellings, three quote styles, directory imports, commented-out imports | **every file directly under `src/`, in both directions (M2)**; non-relative specifiers |
| `audit-due.sh` | the OK→DUE edge, once, per worktree, from the payload's cwd | **a ledger that ran and crashed — silently, and permanently (M1)** |
| `# test` corpus | 3 shipped tests, all enumerated not listed; `miki-route-full` ends on a full-state `expect:` | a `# test` authored via `/create-test` never reaches a file on its own (M3) |
| `test.yml` | `tsc --noEmit`, 509 tests, layer-check, audit-status; ubuntu + windows; full history; no `continue-on-error` | `npm run build` — a Vite build break surfaces only on a tag push (Build & deployment's surface, noted for cross-reference) |

---

## Budget attribution, for the note

Eleven of the sixteen commits in this window touched no testing-procedure file except
`scripts/play-cli.ts` or `scripts/lib/modportalCache.ts`; only `1301729`, `fe74472`, `7676c09`,
`4b6e383` and `73a73f3` are this system's own work. `play-cli.ts` is a downstream consumer of
every layer beneath it, so it moves whenever they do.

This is the shape that got `package.json` and `tsconfig.json` removed from Build & deployment
(**BD-M1**), but the conclusion is the opposite: nobody else audits `play-cli.ts`, and **H1** and
**M3** are both in it. The coverage is earned; the note should simply say the budget is spent
mostly from outside so a future reader does not mistake sixteen commits for sixteen commits of
gate work.
