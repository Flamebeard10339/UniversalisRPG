# Readability gate — retired

**Status: closed, not shipped.** The machinery is deleted; this log is the record of
what it was, what the pilot proved, and what moved into `audit-status`.

## What it was

Every source file would pass a readability audit within N=5 code-changing commits
touching it, performed by a cold Haiku agent that saw only that file's text. Split
so CI stayed deterministic: `readability-check` was a pure function of the repo and
its ledger, `readability-audit` generated prompts and recorded verdicts through a
subagent. Grading happened in the orchestrating session.

Built over `2905b41`…`5e6eceb`, piloted in `da1c8d0`, retired here.

## Why it was retired

It was a second audit ledger. `docs/audits/readability.json` plus
`readability-check.ts` reimplemented "count commits since a recorded SHA, compare to
a threshold" — which `audit-status.ts` and `systems.json` already do, at system
granularity. Two ledgers, two thresholds, two counting implementations, kept in sync
by hand. That is the duplication CLAUDE.md exists to prevent.

It also answered the wrong question. Independent audit earned its place because a
fresh Opus reading a *system* found real defects. This asked whether each *file* was
legible to a cold reader — a proxy, at 68× the granularity, whose gating half the
pilot showed to be near-tautological. "Comments that restate self-documenting code"
is already a line in the audit prompt.

## What the pilot proved

Ran on `src/grammar/values.ts`, `src/content/tuningVariables.ts`,
`src/runtime/save.ts`, each against three same-folder distractors minted first. All
three passed both halves.

**The leak test came back clean.** No description asserted anything absent from the
text it was given. Words that looked like project knowledge — `DSL`, `game state`,
`balance` — were all present as `DslError`, `GameState`, `MIN_DAMAGE`. `CLAUDE.md`
reaching subagent context did not matter at this granularity.

**Discrimination is a floor test, not a quality measure.** Almost every file
contains a token naming its own subject, so the reader matches that token to an
option without reading the logic. Two controls confirmed it: scrubbing the file path
from the prompt changed nothing, and `src/content/variable.ts` — 14 lines, against
three sibling schema files including the near-identically-shaped `stat.ts` — was
identified immediately off `kind: 'variable'`. It catches a file so vague it could
be any sibling. Nothing subtler.

**The prose audit had the signal, concentrated in NON-OBVIOUS BEHAVIOUR and
UNCLEAR.** The verdict was the least useful thing it produced; the findings were
real (`save.ts`: why is each field record vs scalar; `values.ts`: is `text`
returning `''` deliberate). INPUTS AND OUTPUTS restated EXPORTS in all three audits.
Its cost was the blocker: grading needs the orchestrator to read the file and check
every claim, which is affordable once and unaffordable every five commits.

## What was salvaged

`readability-check.ts` counted commits better than `audit-status.ts` did — it
followed renames and compared `codeOnly`, so comment strips and pure renames did not
spend a budget. That logic moved into `audit-status.ts`, where it fixes a live
miscount: a strip pass was pushing systems toward a spurious audit.

## Environment findings (tested, still true, reusable)

Probed by spawning a `tools: []` subagent and asking it directly:

- **`tools: []` in agent frontmatter does restrict the agent.** Two probes,
  `tool_uses: 0` on both, including one explicitly ordered to attempt a file read.
- **The agent listing reports `(Tools: All tools)` for it anyway.** The listing and
  the behaviour disagree; the behaviour is what held.
- **Project instructions DO reach subagent context.** It quoted `CLAUDE.md` verbatim
  when asked. This cannot be closed by agent configuration.
- It does not have file contents preloaded — asked about a file without a tool, it
  answered UNKNOWN.

These matter for any future cold-reader work. They do not constrain system audits,
where independence means a fresh session rather than an absence of tools.

## Not carried forward

A one-time prose sweep over all 68 files would still produce a real list of
file-owned ambiguities. It was considered and dropped: it is a task, not a gate, and
nothing about it needs the ledger, the summaries, or the discrimination test to
happen. If it is ever wanted, it is one pass with the audit prompt and no
infrastructure at all.
