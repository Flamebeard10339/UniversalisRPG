# Orchestration research — what the literature actually supports, 2026-08-02

Commissioned to find a model to co-opt before rebuilding the task system. Read
alongside `.planning/orchestrator-measurement-2026-08-02.md`, which measured this
repo's version of the same failure two weeks earlier and got the same answer.

## Three premises that did not survive checking

**AGORA does not support the externalized-architecture claim.** `arXiv:2602.13290`
is *Agentic Green Orchestration Architecture for Beyond 5G Networks* — a local
tool-augmented LLM in a mobile-network control loop. It has nothing to say about
codebases. Do not cite it.

**The Google defensive publication could not be found.** The nearest TDCommons hit
is a framework for governed orchestration and lifecycle management of hierarchical
agents; it decomposes a directive into a subtask dependency graph, but publishes no
measurement that redundant work "largely disappears." The claim may be real and I
may have missed it, but nothing should be built on it as stated.

**"The orchestrator should not understand the codebase" is half right, and the
wrong half is load-bearing.** Magentic-One's orchestrator maintains a Task Ledger
of *facts and educated guesses* and rewrites it when progress stalls. It very much
holds a model of the problem — it holds it **externally, and revisably**. The
finding is not "hold no model." It is "hold a model you can be shown to be wrong
about." Our own measurement pass is the proof: it was commissioned precisely so
workers would stop re-deriving facts, and it wrote a 3x-wrong count into a document
workers were told to trust. An in-context model fails silently; an externalized one
gets corrected in a commit.

## The one result worth reorganizing around

**OrchBench** (`arXiv:2607.25656`) evaluates orchestration *plans* in isolation:
DAG in, plan out, deterministic simulator scores it without invoking a single
worker. Three of its numbers are directly actionable here.

| Finding | Number |
|---|---|
| Dominant failure is **missing information transfers** — cross-agent dependencies omitted from the plan | up to 22.7 per plan, rising with task count |
| Transfer coverage correlates with outcome quality | Pearson r = **0.61–0.95** |
| **Agent count correlates with quality** | r ≈ **0** at scale |
| Over-decomposition — splitting not grounded in problem structure | **6.3%** of generated DAGs |
| Simulator vs. real Claude Code execution | r = **0.816**, at **1.3%** of tokens |

The last row is the one this repo cannot ignore. A plan can be graded before it is
dispatched, for roughly nothing. Every failure catalogued in
`agent-swarm-theory.md` — five chunks against one file, a 17-minute gate, proofs
that proved nothing — was a property of the *plan*, visible before any worker ran.

Corroborating, weaker (abstract-level only, the PDFs did not extract cleanly):
**cohesion-aware partitioning** (`arXiv:2606.00953`) concludes parallelism pays only
when interdependency is low, and otherwise costs more than it buys. That is the same
sentence as our own measurement doc's "these are one change to one file," derived
independently. Two sources agreeing means it is safe to build on.

## The mechanism worth copying

**PatchBoard** (`arXiv:2605.29313`) is the closest thing in the literature to a
duplication *impossibility* result rather than a duplication *discouragement*:

- A schema defines the shared state and its invariants.
- Each worker's blueprint grants it **a set of paths it may write**. A worker can
  only propose edits inside its grant.
- Workers return **candidate patches**; a deterministic kernel validates syntax,
  path authorization, post-mutation schema validity, and invariants before
  committing. Destructive ops are off by default.
- Accepted *and rejected* patches are logged with worker id, input-view hash,
  patch, verdict, and resulting state hash — the whole run replays from the log.

Two agents cannot duplicate work they are not both authorized to write. That is a
set-intersection check, computable before dispatch, not a norm in a brief.

Anthropic's own multi-agent writeup reaches the coordination half of this from the
other direction and with less machinery: their duplication (two subagents both
researching 2025 supply chains) was fixed by briefs carrying explicit boundaries —
*"don't research X, that's another subagent's job."* Prose boundaries work and are
free; path authorization makes them checkable. Do both, in that order of cost.

## What this implies for our rebuild

### Keep the data. Rewrite the tool.

`docs/tasks.jsonl` is 280 records of real audit findings and an event log that
already answers questions git cannot. That is the expensive part and it is not
what failed. What failed is a 2139-line CLI with 218 output sites that answers
`list --blocked` by printing all 87 tasks. Starting the *store* from scratch
re-earns 280 records of bugs to fix a CLI defect.

### The gap is coordination semantics, not a new store

The record already has `requires`, `files`, `claimedBy`, `spec`, `closedCommit`.
It is a **bookkeeping** surface: it records what happened. It has no way to express
what a worker is *allowed to do*, which is the only thing that prevents duplication.
Four changes, in evidence order:

1. **`writes: []` — the authorized path set.** Dispatching two tasks whose `writes`
   intersect is a plan defect, detectable by set intersection. This is PatchBoard's
   one load-bearing idea and it costs one field. `files[]` records what a finding
   *touches*; `writes` grants what a task *may change*. They are different.

2. **`produces` / consumers.** Your point 4, and the thing that makes missing
   transfers detectable. "Who owns batching?" becomes a query over `produces`
   rather than a question a worker asks by guessing. A task whose `writes` overlap
   another's `produces` but which does not `require` it is a missing transfer —
   OrchBench's top-ranked failure, found without running anything.

3. **`tasks plan check <ids...>` — simulate before dispatch.** Reports overlapping
   write sets, missing transfers, and cohesion (do these tasks land in one file).
   No workers run. This is the highest-value new command and the only genuinely
   new *capability* on the list.

4. **Verification as a dispatch precondition, not a fifth agent.** The worker's
   first deliverable is a proposed patch to its own ledger entry — its `writes`,
   `produces`, and `requires` — which the planner accepts or rejects before any
   code exists. One round trip. This is where "does this duplicate an existing
   subsystem" gets asked, and it is also where `agent-swarm-theory.md`'s
   **"invite refusal, then believe it"** becomes a protocol step instead of a
   sentence in a brief. It already produced two correct refusals as prose.

### Do not build the code graph yet

Your point 2 (Feature → Module → Function graph) is the most attractive item and
the one to defer. `docs/audits/systems.json` is already a hand-maintained ownership
map whose partition CI already fails on — that is the ownership layer, built and
enforced. A second architecture model, authored by hand, is exactly the thing
CLAUDE.md forbids: a system required to be manually kept in sync. RepoGraph and
CodexGraph both *derive* their graphs from source (tree-sitter / static analysis);
they earn their keep on repos far larger than this one and only because nobody
maintains them by hand. Build it derived, or not at all — and not before the four
items above, which address the failure that actually happened.

### Cap the swarm on evidence, not ambition

Agent count correlating at r ≈ 0 with quality is the cheapest lesson here. The
combat-continuation round ran five workers against one file and produced three
regressions. Fewer workers with disjoint write sets is not a compromise; it is
what the measurement says.

## Sources

- OrchBench — https://arxiv.org/html/2607.25656v1
- PatchBoard — https://arxiv.org/html/2605.29313v1
- Verified Multi-Agent Orchestration (PEVR) — https://arxiv.org/abs/2603.11445
- Magentic-One — https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/
- AgentOrchestra — https://arxiv.org/html/2506.12508v1
- Cohesion-aware task partitioning — https://arxiv.org/pdf/2606.00953
- RepoGraph — https://arxiv.org/html/2410.14684v1
- Anthropic, multi-agent research system — https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them
