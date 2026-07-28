# Testing procedure audit — 2026-07-28

Independent audit of repository system 5 (**Testing procedure**) at `f16ccb1` (HEAD moved from
`50a4f41` to `f16ccb1` mid-audit; `f16ccb1` changes only `docs/audits/systems.json`, so every
measurement below holds for both). Covers the 9 code-changing commits since the retired baseline
`83d81d2`: `50a4f41, 0699072, 6fa90e4, 3d1c389, 0ea46d9, 5e6eceb, 542f994, ee8c06e, 2905b41,
2e05502` — the arc that built the readability gate, retired it, and salvaged its commit-counting
into `audit-status.ts`.

Scope is CLAUDE.md's three-part definition, not the narrower `systems.json` path list: the
`play-cli` REPL, the `# test`/`runTest`/`integration.test.ts` regression format, and
`.github/workflows/test.yml`. The gap between those two definitions is itself **M5**.

Baseline: `npx tsc --noEmit` clean, **21 files / 315 tests** green, `npm run audit-status` exits
non-zero by design (four audits outstanding).

Method: every gate was attacked, not read. Fixtures were built in a throwaway `git worktree`
under the scratchpad (removed at the end; the main working tree was never modified) and the real
scripts were run against them. Each finding states the fixture so it can be re-run. Two
measurements in this audit were **retracted after a harness bug was found** — see *Corrections*
at the end; both were re-run and the corrected numbers are what appear below.

Findings already tracked as open in `backlog.md` are not re-reported. Where a parallel audit
landed the same day already owns a finding, it is cited rather than duplicated —
`docs/audits/dsl-load-path-2026-07-28.md` (L2, M1) and `docs/audits/build-deployment-2026-07-28.md`
(M1).

---

## What the system gets right

Stated first because it bounds the rest, and because the piece most likely to be wrong was not.

**`audit-status`'s commit attribution is correct, including the cases I expected it to fail.**
I predicted merge commits would be miscounted, because `changesIn` calls `.some()` on the result
of `git show --name-status`, and `git show` prints no diff for a merge. The measurement refuted
it. Against a synthetic two-system manifest:

| Commit shape | `audit-status` verdict | Correct? |
| --- | --- | --- |
| Ordinary code change in `scripts/` | `code` | ✅ |
| Comment-only change in `scripts/` | `no-op` | ✅ |
| Pure rename inside `scripts/` (`R100`) | `no-op` | ✅ |
| Add-only commit | `code` | ✅ |
| Delete-only commit | `code` | ✅ |
| Commit touching **two** systems | `code` for **both** | ✅ |
| `--no-ff` merge, all changes on the side branch | `no-op`, side commits counted individually | ✅ |
| **Evil merge** carrying its own change | `code` | ✅ |

The evil-merge case works for a non-obvious reason worth recording: `git show --name-status` on a
merge *does* emit combined-diff rows (`MM scripts/layer-check.ts`) for files that differ from
every parent, so `changesIn` sees it, and `unchangedCode` compares against `sha^` and finds a
real delta. Ordinary merges correctly contribute nothing because their constituent commits are
counted on their own. The salvage from `readability-check.ts` did what
`docs/readability-gate/deliverable-log.md` claims it did.

**The readability-gate retirement is genuinely complete.** The deliverable log's claim that
nothing is outstanding holds: `3d1c389` deleted `scripts/readability-audit.ts`,
`scripts/readability-check.ts` **and** the second ledger `docs/audits/readability.json`, and
removed both `package.json` entries. `grep -rn "readability"` across tracked files returns only
`backlog.md`'s pointer, the deliverable log itself, and unrelated prose in the dsl-rewrite log. No
dead script, no dead npm script, no dead CI step, no orphaned ledger. Add-then-retire arcs usually
leave sediment; this one did not.

**`scripts/lib/stripComments.test.ts` is the best test file in the system.** It tests decisions,
not implementation: comments inside strings, inside regex literals, inside template literals,
inside a template nested in its own expression, division-vs-regex disambiguation, and directives
as code-wearing-comment-syntax. The `codeOnly` pair (`:55`, `:61`) states the actual contract in
two tests — a comment edit compares equal, a code change hiding among comment edits does not.

**`scripts/play-cli.test.ts` tests decisions too.** It would have been easy to assert that
`handleCommand` returns what `handleCommand` computes. Instead the recorder suite ends with a real
correctness gate (`:359-375`): record a session, emit the `# test` and `# save` blocks, paste them
into a **brand-new module sharing no state**, reload, and replay. That is the round trip the
authoring workflow actually depends on, and it is asserted end to end.

**CI ordering and `fetch-depth: 0` are right.** `test.yml:19-21` correctly recognizes that
`audit-status` walks back to a `lastAudit` SHA a shallow clone would not contain, and no step
carries `continue-on-error`.

---

## H1 — `comment-only` certifies commits that deleted CI steps, disabled tests, and neutered gates

**Verified against four throwaway commits.** CLAUDE.md:19 states the contract:

> Strip passes must pass `npm run comment-only -- <base>`, which **proves no code changed**.

It proves something much narrower. `comment-only-diff.ts:5` sets
`SOURCE_EXTENSIONS = ['.ts', '.tsx']`, and `:38` skips every other path outright:

```ts
if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) continue;
```

A single commit that stripped comments from `src/runtime/tuning.ts` **and**, in the same commit:

- deleted `- run: npm test` and `- run: npm run audit-status` from `.github/workflows/test.yml`,
- renamed `# test tutorial-quest-given` to `# test DISABLED-…` in the shipped content,
- replaced `"comment-budget": "tsx scripts/comment-ratio.ts"` with `"comment-budget": "echo skip"`,

reports:

```
<base>..HEAD is comment-only: 1 files changed, all code identical after stripping comments.
```

exit 0. Three narrower probes isolate the mechanism:

| Fixture | Reported | Actual |
| --- | --- | --- |
| Strip + gut CI + disable a `# test` + neuter `comment-budget` | `is comment-only` | four files changed |
| Change **only** `test.yml` (`comment-budget` → `true`) | `is comment-only: **0 files changed**` | one file changed |
| `--worktree` + a new **untracked** `src/runtime/sneaky.ts` | `is comment-only` | a new source file appeared |
| Intra-line whitespace (`export function` → `export  function`) | correctly **fails** | — |

The second row is the cleanest statement of the defect: the tool prints "0 files changed" about a
commit that changed a file, because the file was not a `.ts`. The third is worse in one way —
`git diff` never lists untracked paths, so `--worktree` mode cannot see an added file at all,
while the tracked-file path at `:40` explicitly rejects additions with "a comment-only change adds
no files".

The blast radius is specific to this system: the set of files `comment-only` cannot see is almost
exactly the set that defines whether this repo's gates run at all — `test.yml`, `package.json`'s
script bodies, and `content/*.dsl`. A strip pass is the one commit shape reviewers are encouraged
to skim, and it is the shape this gate is supposed to make safe to skim.

Note the same repo already computes this correctly elsewhere: `audit-status.ts:51-59` handles
non-TypeScript files by comparing them **verbatim**, with a comment explaining exactly why. Two
scripts sharing `codeOnly` reached opposite conclusions about the same problem.

**Fix**: mirror `audit-status`'s `STRIPPABLE` split — compare non-`.ts` paths byte-for-byte and
diverge on any difference, rather than `continue`. Additionally, in `--worktree` mode, list
untracked files (`git ls-files --others --exclude-standard`) and treat any source addition as a
divergence, matching the tracked-path rule at `:40`.

---

## M1 — the "an audit doc is required" gate is satisfiable by `touch`

**Verified.** CLAUDE.md:31 makes the doc load-bearing:

> The doc is required — a counter reset with nothing to show for it fails the same check.

`audit-status.ts:82-84` implements that as an existence test and nothing more:

```ts
function documented(system: System): boolean {
  return system.lastAudit === null || (system.lastAuditDoc !== null && existsSync(system.lastAuditDoc));
}
```

Setting `lastAuditDoc` to each of the following, with `lastAudit: "83d81d2"`:

| `lastAuditDoc` value | Result |
| --- | --- |
| `docs/audits` (a **directory**) | passes, exit 0 |
| `package.json` (an unrelated tracked file) | passes, exit 0 |
| `docs/audits/empty-audit.md` (**zero bytes**) | passes, exit 0 |

The check cannot tell an audit from an empty file, does not require the path to be under
`docs/audits/`, does not require it to be a file at all, and never relates the document to the
`lastAudit` SHA it is meant to evidence. Since this is the mechanism that turns CI red until an
audit lands, the cheapest way to make CI green is `touch docs/audits/x.md` — which is precisely
the failure mode the sentence in CLAUDE.md was written to prevent, and which the current
`systems.json` history shows already happened once (three markers recorded `83d81d2` with no doc,
reset in `f16ccb1`).

**Fix**: require `lastAuditDoc` to match `^docs/audits/.+\.md$`, to be a regular file
(`statSync().isFile()`), to be non-trivially sized, and — the part that actually binds the doc to
the claim — to contain the `lastAudit` short SHA. Each is one line and together they make the
marker unforgeable without writing something.

---

## M2 — the commit hook fires on strings that merely contain "git commit", and stays silent on the commands that most need it

**Verified by feeding `.claude/hooks/audit-due.sh` synthetic PostToolUse payloads.**
`audit-due.sh:5-8` dispatches on an unanchored glob over the raw command text:

```bash
case "$command" in
  *git\ commit*) ;;
  *) exit 0 ;;
esac
```

| Tool command | Hook fires | Should it |
| --- | --- | --- |
| `git commit -m x` | **yes** | yes |
| `git status` | no | no |
| `echo "git commit"` | **yes** | no |
| `git log --grep="git commit"` | **yes** | no |
| `git commit --dry-run` | **yes** | no — nothing was committed |
| `git merge feature` | **no** | yes — HEAD moved, budgets can cross the threshold |
| `git rebase main` | **no** | yes — same |
| malformed stdin / `node` missing | no (exit 0) | fail-open, silently disabled |

Three separate problems, all verified:

1. **False positives.** Any command whose text contains the substring triggers a full
   `audit-status` run and an `exit 2` blocking error. `--dry-run` is the sharpest case: the hook
   announces "The git command above ran normally" about a command that deliberately committed
   nothing.
2. **False negatives.** `git merge` and `git rebase` both move HEAD and can push a system past the
   threshold; neither matches. The signal advertised as firing "on commit" has holes in both
   directions.
3. **The message asserts two facts it never checks.** `audit-due.sh:17` says *"The git command
   above ran normally"* and *"reporting on the new HEAD"*. The hook reads only
   `tool_input.command` (via `tool-command.js`), never the tool's exit status — so a **failed**
   commit produces the same "ran normally". And it runs `npm run audit-status` in the hook's own
   cwd, which I confirmed is the project root regardless of a `cd` in the command: committing
   inside a worktree (`cd /some/worktree && git commit`) reports on the **main** repo's HEAD while
   claiming to report on "the new HEAD". I hit this live — every commit I made in the audit
   worktree produced a report about the main tree.

None of this can wedge the repo: it is a PostToolUse hook, so the commit has already happened and
`exit 2` only feeds text back to the agent. That is worth stating explicitly, because "gates
commits" in the commit subject (`0699072`, "Make the audit signal fire on commit and gate CI")
overstates it — CI is the gate; the hook is a notification.

**Fix**: match on the command's leading token rather than a substring (or parse `git\s+commit\b`
with a negative lookahead for `--dry-run`), add `git merge` and `git rebase` to the trigger, read
the tool result to confirm success before claiming it, and either run `audit-status` in the
command's working directory or drop "the new HEAD" from the message.

---

## M3 — a `# test` replay ends holding an unhandled modal, reports `passed: true`, and desynchronizes the CLI's input stream

**Verified two ways.** `runTest` has no vocabulary for modals. Replaying the shipped
`miki-route-full` from a fresh state:

```
runTest verdict              : {"passed":true}
pendingModal after CI replay : "character-creation"
```

So `integration.test.ts` reports the route green while the replay walked **past** character
creation without ever performing it. The corpus's coverage of that route is narrower than a green
tick suggests, and nothing in the assertion surface can express the gap.

In `play-cli`, the same replay is worse than incomplete. `runTestCommand` (`play-cli.ts:151`)
runs the test against the **live** session:

```ts
const result = runTest(testId, session.registry, session.state);
```

so the modal it leaves behind lands in the REPL. Piping
`/test miki-route-full`, `/test miki-route-full`, `/quit` produces exactly **one** verdict; the
transcript shows why:

```
[time: 107.2s]
Name: Race:
  1) Human  2) Elf  3) Dwarf  4) Orc
Race: Beach (beach)
```

The modal consumed `/test miki-route-full` as the player's **name** and `/quit` as the **race**.
Confirmed with a marker: piping `SNEAKY-COMMAND` after a `/test` feeds it into the name field.
CLAUDE.md names "instant piped/agent mode" as a first-class mode of this CLI; in that mode a
`/test` crossing a modal silently eats the next two commands and every later command is
interpreted against the wrong prompt.

**Overlaps a tracked item — merge, do not double-count.** `backlog.md` already tracks
*Character-creation-modal-in-recordings* and *recordings of `/test` ignore modals*, both scoped to
the **recorder** (`TODO(modal-recording)`): a recording cannot capture name/race. The two facts
above are downstream of the same missing directive but are not that item: one is a *false green*
in the CI replay path, the other is *input-stream corruption* in the REPL. The proposed fix in
that backlog entry — make modal submission a first-class directive parsed by `parseDirectiveLine`
and executed by `applyDirective` — would close all three at once, which is the argument for
raising its priority rather than filing a new item.

**Fix**: adopt the tracked `modal:` directive, and until then make `runTest` fail rather than pass
when it finishes with `state.pendingModal` set — a test that ends mid-modal has not finished.

---

## M4 — the comment budget under-measures comment volume by construction

**Verified against fixtures and re-measured across the repo.** `isCommentLine`
(`stripComments.ts:169-171`) counts a line only when stripping it leaves nothing:

```ts
return original.trim() !== '' && stripped.trim() === '';
```

Three consequences, each confirmed with a fixture run through the real `comment-ratio.ts`:

| Fixture | Measured | Effect |
| --- | --- | --- |
| 4 standalone `//` lines over 2 code lines | 66.7%, **over budget** ✅ | works |
| 5-line JSDoc block | 71.4%, **over budget** ✅ | works |
| The same 4 comments moved to **trailing** position | **0.0%** | trailing comments are free |
| A **400-word** block comment on one physical line | 1/3 lines, **passes** | a comment's cost is its line count, not its length |
| `//`-shaped text inside a string / template literal | 0.0% ✅ | correct — that is content, not comment |
| `// @ts-nocheck`, `// eslint-disable` | 0.0% (counted as **code**) | correct per `isDirective`, but see below |

Across the real repo, the invisible share is not trivial: **85 trailing comments totalling 2,910
characters**, concentrated in `src/runtime/resolve.test.ts` (25), `encounter.test.ts` (11),
`resource.test.ts` (9), `scripts/play-cli.test.ts` (9). Measured repo ratio **3.2%**; with
trailing comments counted, **4.1%** — still under the cap, so nothing is over budget today, but
the gate is reporting roughly three-quarters of the prose it is meant to be capping.

Separately, `ALWAYS_ALLOWED_COMMENT_LINES = 2` (`comment-ratio.ts:7`) combined with
`Math.floor(totalLines * 0.05)` means any file under 60 lines gets a flat 2-line allowance
regardless of ratio. **12 of 67 source files** sit on that floor rather than the 5% rule; a 3-line
file may be 67% comments and pass.

This is a *calibration* finding, not a correctness one — the gate catches the shape CLAUDE.md
mainly cares about (standalone prose blocks) and correctly refuses to be fooled by strings,
regexes or template literals. But "capped at 5% of a file's lines" is not what is enforced, and
the cheapest way to keep a comment is to move it to the end of a code line.

**Fix direction**: this is a policy call, not a bug — either count a trailing comment as a
fractional line, or state in CLAUDE.md that the budget deliberately governs standalone comment
lines only, so the number means what a reader thinks it means.

---

## M5 — the system's declared paths exclude the format it owns and the machinery that enforces it

**Verified by computing ownership over `git ls-files`.** `systems.json` gives Testing procedure
`["scripts", ".github/workflows/test.yml"]`. Of 164 tracked files, **37 belong to no system at
all**. Excluding `docs/`, `.planning/` and `attic/`, the uncovered set includes:

```
.claude/hooks/audit-due.sh
.claude/hooks/block-main-git-writes.sh
.claude/hooks/lib/tool-command.js
.claude/settings.json
content/tutorial-island.dsl
```

Two distinct problems, and the assignment's question has two different answers:

**The regression format is double-covered, not uncovered.** `runTest` and `applyDirective` live in
`src/runtime/session.ts`, `integration.test.ts` in `src/runtime/`, and `# test` parsing in
`src/content/test.ts` — so they are all inside **Runtime** and **DSL load path**. They are audited,
by those systems' auditors, on those systems' budgets. The effect is not a coverage hole but a
signalling one: the auditor of the system that *owns* the regression format has no budget counter
for it, and the auditors who *do* have the counter do not own the format.

**The enforcement machinery genuinely is uncovered.** `.claude/hooks/audit-due.sh` — a commit hook
whose whole purpose is to police this system's own ledger — and `.claude/settings.json`, which
wires it up, belong to nobody. Changing them spends no budget and triggers no audit, forever. The
same is true of `content/tutorial-island.dsl`, which *is* the corpus `integration.test.ts` runs.
A test corpus that no system owns is an odd thing for the testing system to be built on.

There is a third, mirror-image edge already documented by
`docs/audits/build-deployment-2026-07-28.md` (M1): all four npm gate scripts are **defined** in
`package.json`, which belongs to Build & deployment, so every gate change this system makes
charges another system's budget. That audit found all 7 of its commits were really this system's
work. Cited, not re-reported — but it is the same defect seen from the other side, and the two
together make the case that path-based membership is mis-modelling shared config.

**Fix direction**: add `.claude/hooks` to this system's paths (it is enforcement code, and it is
executable code that runs on every Bash call), and decide explicitly where `content/*.dsl` belongs
— it is arguably DSL load path's, but somebody should own it. The `package.json` question is a
`systems.json` design call, flagged in both audits and resolved in neither.

---

## M6 — CI runs one OS, and a Windows checkout of the shipped content does not load

**Verified.** `.github/workflows/test.yml:15` is `runs-on: ubuntu-latest`, the only runner in the
file, and there is no matrix. There is **no `.gitattributes`** anywhere in the repo. This machine
has `core.autocrlf=input`, so the working tree is LF and everything passes — but git-for-Windows'
installer default is `core.autocrlf=true`, which yields a CRLF working tree on a fresh clone.

Converting `content/tutorial-island.dsl` from LF to CRLF and changing nothing else:

```
original: CRLF=0 LF-only=352   ->   CRLF=352 LF-only=0
loadModule: THREW -> content before first section: # variable travel-seconds-per-unit
npm test:   3 files failed | 18 passed (21)   —   13 tests failed
```

The game does not load and a fifth of the suite fails, on a checkout that is byte-correct as far
as git is concerned.

**The root cause is not this system's** — the parser's CRLF handling is
`docs/audits/dsl-load-path-2026-07-28.md` M1, which found the same thing independently and owns the
fix. What is this system's is the *gate* gap: a single-OS CI matrix means no gate in the repository
can observe a failure that only exists on the platform the project is actually developed on. The
DSL audit found it by reading the parser; CI could not have found it at all.

**Fix**: add `.gitattributes` pinning `*.dsl` (at minimum) to `text eol=lf`, and add
`windows-latest` to the `test.yml` job matrix so the class of defect is observable rather than
argued about.

---

## M7 — `layer-check` reports violations that are not code, and misses directory imports

**Additional to `docs/audits/dsl-load-path-2026-07-28.md` L2, not a re-report.** That finding owns
the quote-style hole (single quotes only; double-quoted, backtick, type-only and dynamic forms
missed) and should be read as the primary. My probe reproduces it — with a double-quoted and a
single-quoted `src/content` → `src/runtime` violation both present, only the single-quoted file is
reported — and adds two behaviours its table does not cover.

**False positives.** `layer-check.ts:45-46` matches `IMPORT_PATTERN` against raw file text. Both of
these are flagged as architecture violations:

```ts
// see also: import { view } from '../runtime/session';        <- a comment
export const doc = "import { view } from '../runtime/session'"; <- a string literal
```

So the gate can fail CI over prose. That matters more than it sounds, because the repository
already owns the exact tool that fixes it: `codeOnly` sits in `scripts/lib/stripComments.ts`, is
imported by both sibling scripts in the same folder, and is precisely "give me this file with
comments and comment-shaped strings neutralized". `layer-check` is the one gate that reads raw
source. This is the audit prompt's *simpler existing pattern that should have been reused*, and it
is one line: `readFileSync(...)` → `codeOnly(readFileSync(...)).join('\n')`.

**Directory/barrel imports are invisible.** `layerOf` (`:33`) requires a trailing slash:

```ts
return LAYERS.find((layer) => normalized.startsWith(`${ROOTS[layer]}/`)) ?? null;
```

`import * as R from '../runtime'` resolves to `src/runtime`, which does not start with
`src/runtime/`, so `layerOf` returns `null` and the edge is skipped entirely — not counted, not
flagged. No barrel `index.ts` exists today, so this is latent rather than live, but it is the
standard way such a file gets introduced.

**Fix**: strip comments before matching; widen the quote class per the DSL audit's L2; and make
`layerOf` match the root itself as well as its children.

---

## L1 — an unresolvable `lastAudit` crashes with a Node stack trace

**Verified.** Setting `lastAudit` to a SHA that does not exist:

```
stderr: "fatal: bad revision 'deadbeef..HEAD'\n"
Node.js v24.15.0
   -> exit 1
```

`git()` (`audit-status.ts:20-22`) lets `execFileSync` throw uncaught. It **fails closed**, which is
the right direction — but the operator-facing output is a stack dump rather than the actionable
message every other failure path in this script produces. This is the realistic post-rebase state:
a `lastAudit` recorded against a commit that history rewriting orphaned and `gc` later collected.
The same script is cwd-sensitive (running it from `scripts/` crashes on the relative `MANIFEST`
path), which is harmless via `npm run` but unhelpful otherwise.

**Fix**: wrap the `git log` call and report `lastAudit <sha> for <system> is not a resolvable
commit — the marker predates a history rewrite; re-audit and re-record`.

---

## L2 — the shipped `# test` corpus is two happy paths, and never uses its strongest assertion

**Measured by mutation testing.** The corpus is two sections in `content/tutorial-island.dsl`:
`tutorial-quest-given` (4 lines) and `miki-route-full` (~25 lines). Seven single-token mutants,
run against the corpus in isolation and against the full suite:

| Mutant | 2 shipped `# test`s | `npm test` |
| --- | --- | --- |
| `conditions.ts`: `>=` → `>` | caught | caught (7 failed) |
| `conditions.ts`: `not` stops negating | caught | caught (8 failed) |
| `conditions.ts`: `and` → `or` | caught | caught (5 failed) |
| `conditions.ts`: inventory `has` off-by-one | caught | caught (4 failed) |
| `actions.ts`: craft input cost never charged | **SURVIVES** | caught (14 failed) |
| `effects.ts`: resource max-clamp inverted | **SURVIVES** | caught (12 failed) |

4 of 6 — meaningfully better than "replays a happy path", and worth saying plainly, since the
corpus is only 29 lines. Its unique value is also real: three content mutants (dialogue stops
setting the quest flag; front door never unlocks; mirror stops setting its flag) are caught **only**
by `integration.test.ts` and `session.test.ts` — no other suite notices, because no other suite
plays the shipped content.

What it does not cover:

- **Failure paths.** Every assertion is positive, though `not` exists in the condition grammar
  (`src/grammar/condition.ts:13`). Nothing asserts that a locked door stays locked, that an
  unaffordable craft is refused, or that a gated action is absent — the exact class the two
  surviving mutants live in.
- **`expect: <save>`, the strongest assertion form, is never exercised over shipped content.**
  There is no `# save` section in `tutorial-island.dsl` at all — `play-cli.test.ts:11` says so in
  as many words and mints its own fixture module to test `/load` and `/expect`. So
  `/create-valid-test`'s whole-state diff, the most sensitive regression form the system has, is
  proven only against synthetic two-location fixtures.
- **Pass-2 resources have no `# test`.** `integration.test.ts:25-46` covers the health pool with a
  hand-written `describe` block that drives `useAction`/`resolve` directly and pokes
  `state.activeBuffs`. CLAUDE.md's repository context says: *"record a regression as a `# test`
  section via `/create-test` rather than writing an ad-hoc script."* That block is the ad-hoc
  script, living inside the file whose job is running `# test` sections.

**Fix direction**: record the two surviving classes as `# test` sections (a craft attempted without
inputs; a pool driven to its cap), add one negative assertion, and give the shipped content a
`# save` so at least one route is pinned by a full-state `expect:`.

---

## L3 — `session.test.ts` walks the Miki route a second time, in TypeScript

**Verified.** `src/runtime/session.test.ts:14-99` (`'drives the tutorial-island miki route through
the choice-list API'`) asserts `tutorial.quest-given`, `tutorial.mirror-done`,
`tutorial.made-bread`, `tutorial.rats-killed`, `tutorial.miki-complete` and
`front-door.unlocked` — the same six flags, in the same order, over the same content, as
`miki-route-full`. My content-mutation runs confirm the redundancy directly: all three content
mutants failed `integration.test.ts` and `session.test.ts` and nothing else.

The two are not quite equivalent — `session.test.ts` also asserts choice *visibility*
(`expect(ids(v)).not.toContain('use:entity.front-door.pick lock')`), which the `# test` grammar
cannot express — so this is duplication with a real remainder, not dead weight. But CLAUDE.md
names the `# test` section as *the regression format*, and the route is currently maintained in
two languages.

**Fix direction**: reduce `session.test.ts`'s route test to the assertions the DSL cannot make
(choice visibility, throwing behaviour) and let `miki-route-full` own the flag progression, or
state that the TypeScript copy is deliberately the API-surface test and the DSL copy is the
content test.

---

## L4 — the layer stack in code has five layers; CLAUDE.md documents four

**Verified.** `layer-check.ts:5` declares
`['grammar', 'content', 'runtime', 'ui', 'scripts']` and the script prints
`grammar < content < runtime < ui < scripts`. CLAUDE.md:47 says:

> `grammar < content < runtime < ui`. Imports point downward only, gated by `npm run layer-check`.

`scripts` was added as depth 4 in `2905b41` and the documentation was never updated. The behaviour
is right — scripts may import any layer, and nothing may import scripts, which I confirmed
(a `src/content` file importing `../../scripts/play-cli` **is** flagged). Only the prose is stale,
and it is the prose a reader consults to know what the rule is.

---

## L5 — the comment budget does not scan this system's own workflow file

`comment-ratio.ts:8` sets `ROOTS = ['src', 'scripts']` and `sourceFiles` only collects `.ts`/`.tsx`.
`.github/workflows/test.yml` — one of this system's two declared paths — is **7 comment lines of 29
non-empty lines, 24%**, against a stated repo-wide cap of 5%. The comments are good ones (they
record why the workflow is separate from `publish.yml` and why `fetch-depth: 0` is needed), which
is rather the point: the budget's jurisdiction is `.ts` files, not "a file's lines", and CLAUDE.md
states the rule without that qualifier.

---

## Gate scorecard

| Gate | Catches | Lets through |
| --- | --- | --- |
| `comment-budget` | standalone `//` and block comments, JSDoc; correctly ignores comment-shaped strings, regexes, template literals | **trailing comments entirely**; unlimited prose on one physical line; any file under 60 lines up to 2 comment lines; `.yml`/`.js`/`.mjs`/`.dsl` files |
| `comment-only` | code edits in `.ts`/`.tsx`, incl. intra-line whitespace; added/deleted tracked source files | **every non-`.ts` file** — CI workflow, `package.json`, shipped `.dsl`; **untracked** new files in `--worktree`; whole-file re-indentation; renames (reported as verified-identical) |
| `layer-check` | single-quoted upward imports: static, `import type`, dynamic `import()`, `export … from`; correctly forbids importing `scripts` | double-quoted/backtick imports (DSL audit L2); directory imports (`'../runtime'`); files directly under `src/`. **False-positives** imports inside comments and strings |
| `audit-status` | code vs comment-only vs rename; add/delete; cross-system commits; ordinary **and** evil merges | file-mode-only changes; whole-file re-indentation; `lastAuditDoc` that is a directory, an unrelated file, or empty; crashes on an unresolvable `lastAudit` |
| `audit-due.sh` hook | `git commit`, `git commit --amend` | `git merge`, `git rebase`; fires spuriously on any command containing the substring; reports on the wrong HEAD from a worktree; asserts success it never checks; fail-open if `node` is absent |
| `test.yml` | `tsc --noEmit`, 315 tests, comment budget, layer check, audit status — on every branch and PR, full history, no `continue-on-error` | anything platform-specific (ubuntu-only; a CRLF checkout fails locally and cannot fail in CI) |

---

## Design questions for the user, not defects

1. **Should re-indentation be invisible?** A whole-file re-indent passes `comment-only` as
   "comment-only" and does not spend a system's audit budget, while a single intra-line space
   change correctly fails. Both behaviours follow from `codeOnly` trimming each line. Trimming is
   almost certainly right for a strip pass; it also means a 600-line reformat is certified as a
   change to nothing. Worth deciding rather than inheriting.
2. **`>=` or `>`?** CLAUDE.md:5 says an audit is prompted when un-audited commits *"exceed the
   threshold"*; `audit-status.ts:95` fires at `changing >= manifest.threshold`, i.e. at exactly 10.
   Harmless, but the two sentences disagree.
3. **Is `scripts` really the top layer?** It sits above `ui` in `DEPTH`, so a script may import
   anything. That is correct for `play-cli.ts`, but it also means the gate can never object to a
   script reaching into any internal. Worth confirming it is a deliberate ceiling rather than a
   default.
4. **Should `# test` grow a `modal:` directive now?** M3 argues the tracked backlog item is
   load-bearing for more than recordings — it is also why a green replay can skip an interaction
   and why agent-mode piping can desync. That raises its priority; the call is yours.

---

## Corrections

Two measurements in this audit were wrong on first run and are corrected above. Recorded because
the exemplar's standard is that a fixture can be re-run, which requires knowing which run to trust.

1. **The mutation tables were initially produced in a worktree with no `node_modules`.** `npx
   vitest` silently failed to load `vite.config.mjs` and exited non-zero, so every mutant scored as
   "caught". Fixed by junctioning the main repo's `node_modules` into the worktree and
   re-baselining to the stated 21 files / 315 tests before re-running. A second run of the
   isolated DSL-corpus harness independently reproduced the 4-of-6 result, which is why L2 states
   it with confidence.
2. **The content-mutation table was initially invalid because Python rewrote the DSL with CRLF
   line endings**, breaking the parser outright — so every content mutant appeared "caught" for the
   wrong reason. Re-run with newline-preserving I/O. The accident is what surfaced M6, which was
   then verified deliberately at byte level.

Not verified, and stated as such: I did not exercise `test.yml` on GitHub Actions (no push was
made), so all CI claims are from reading the workflow plus running each step locally. `--live`
real-time mode was exercised only through `liveTick`'s unit tests, not against a wall clock.
