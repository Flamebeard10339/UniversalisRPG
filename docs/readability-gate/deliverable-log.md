# Readability gate — deliverable log

Branch: `dsl-pass2-resources`. Read this before touching `scripts/readability-*.ts`,
`docs/audits/readability.json`, or `.claude/agents/readability-auditor.md`.

## Spec

Every source file must pass a readability audit within N=5 code-changing commits
that touch it. The audit is performed by a cold Haiku agent that sees only that
file's text. A file that goes stale, or that is recorded as failed, turns CI red.

The gate is split so CI stays deterministic:

- **`npm run readability-check`** is a pure function of the repo. It reads
  `docs/audits/readability.json` and fails when a file is missing from the ledger,
  recorded as failed, or has accumulated 5+ code-changing commits since its last
  audit. No model runs here. This is what CI executes.
- **`npm run readability-audit`** generates prompts and records verdicts. The model
  calls happen through a subagent; grading happens in the orchestrating session.
  Never wired into CI.

"Code-changing" reuses `codeOnly` from `scripts/lib/stripComments.ts`, so comment
strips and pure renames do not spend a file's budget. Renames are followed, so
moving a file cannot reset its counter.

The comment budget and this gate are adversarial by design: the natural way to make
a file explain itself is a header comment, which `npm run comment-budget` rejects.
The remaining moves are renaming, tightening types, splitting the file, or deleting
the confusing thing. That pressure is the point, not a contradiction.

## Built and committed

| Commit | What |
|---|---|
| `b126d9f` | Split the two files straddling the load/play boundary |
| `262a637` | Move DSL sources into `grammar/content/runtime` |
| `83d81d2` | `layer-check` gating the boundary in CI |
| `2e05502` | Audit counters derived from git |
| `2905b41` | `readability-check` — the deterministic half |
| `ee8c06e` | `readability-audit` — first version, API-key based |
| `542f994` | Delete `playtest-cli` in favour of `# test` |
| `5e6eceb` | Rework the audit to run from a subagent, no API key |

## Environment findings (tested, not assumed)

Probed by spawning `readability-auditor` and asking it directly:

- **`tools: []` in the agent frontmatter does restrict the agent.** Two probes,
  `tool_uses: 0` on both, including one that explicitly ordered it to attempt a
  file read. It reports no mechanism to call a tool exists.
- **The agent listing reports `(Tools: All tools)` for it anyway.** The listing and
  the behaviour disagree; the behaviour is what held.
- **Project instructions DO reach subagent context.** It quoted `CLAUDE.md` verbatim
  when asked. This cannot be closed by agent configuration.
- It does not have file contents preloaded — asked about `src/runtime/session.ts`
  without a tool, it answered UNKNOWN.

### Mitigating the CLAUDE.md leak

Two defences, both already in the design:

1. Distractors are drawn from **siblings in the same folder**, so knowing the layer
   scheme cannot separate the candidates.
2. When grading the prose audit, check each claim against the file text. A claim
   that is *correct but unsupported by the file* is evidence of leakage, not of
   readability — discount it rather than crediting it.

## Remaining work

### 1. Pilot — done

Ran on `src/grammar/values.ts`, `src/content/tuningVariables.ts`,
`src/runtime/save.ts`, each against three same-folder distractors minted first
(`range`/`list`/`tagClause`, `variable`/`resource`/`stat`, `state`/`tuning`/`stats`).
All three passed discrimination and prose; notes are in the ledger.

**Leak test: clean.** No description asserted anything absent from the text it was
given. Every claim traced to an identifier, an import path, or an in-file comment.
The genre words that looked like leakage on first read (`DSL`, `game state`,
`balance`) are all present in the given text as `DslError`, `GameState`,
`MIN_DAMAGE`. `CLAUDE.md` reaching subagent context did not turn out to matter at
this granularity.

**Discrimination is valid but wide-margin.** The prompt names the file path, and
these three filenames nearly answer their own question. A control run with the path
scrubbed still passed both files tested, so the code carries the test, not the
name — but the path is an unearned hint that should come out of
`discriminationPrompt`, since the point is to measure the file.

**Prose rubric is not over-failing.** It is currently under-gating, if anything: it
is advisory, and the three verdicts turned on whether claims were supported, which
all were. The useful output was not the verdict but the UNCLEAR section, which
named real file-owned ambiguities (`values.ts`: does `text` return `''` by design;
`save.ts`: why is each field record vs scalar). The one wrong claim in the pilot —
`values.ts` error messages read as identical when `id` differs — came from three
near-identical parser blocks, which is a readability signal the pass/fail verdict
throws away.

### Follow-ups the pilot surfaced

- Drop the path from `discriminationPrompt`; keep it in the audit and summary prompts.
- `--set-summary` writes `discrimination: 'fail'`, so a summarized-but-unaudited file
  reads as a recorded failure. Minting 68 summaries before any audit — which the
  baseline requires — puts the whole repo in that state. Needs a third value, or
  `readability-check` keying off an empty `lastAuditedSha`.

### 2. Baseline — 68 files

`npx tsx scripts/readability-audit.ts --needs-summary` lists what is outstanding.
Summaries must all be minted **before** any discrimination test runs, or the first
files audited get an empty distractor pool and an unearned pass.

### 3. Calibrate, then wire CI

Review the failure rate. Only once it is defensible, add to
`.github/workflows/test.yml` after `layer-check`:

```yaml
      - run: npm run readability-check
```

## Commands

```bash
npx tsx scripts/readability-audit.ts --needs-summary
npx tsx scripts/readability-audit.ts --prompt-summary <path>
npx tsx scripts/readability-audit.ts --prompt-audit <path>
npx tsx scripts/readability-audit.ts --prompt-discriminate <path>   # expected letter -> stderr
npx tsx scripts/readability-audit.ts --set-summary <path> "<sentence>"
npx tsx scripts/readability-audit.ts --record <path> --discrimination pass|fail --prose pass|fail --note "…"
npx tsx scripts/readability-check.ts --explain <path> [<since-sha>]
```

Spawn the reader with `subagent_type: readability-auditor`, passing the generated
prompt as the whole message. Grade in the orchestrating session; do not spawn an
Opus grader, since the orchestrating session is already Opus and that would add
~68 calls to the baseline for nothing.

## Open decisions

- Prose verdicts are recorded but **advisory**; only discrimination gates. Revisit
  once the baseline shows whether prose verdicts are stable enough to gate on.
- `scripts/` is not covered by `tsc --noEmit` (`tsconfig.json` has
  `"include": ["src"]`). Unrelated to this gate, but it means a broken import in
  `scripts/` ships silently. Worth fixing separately.
