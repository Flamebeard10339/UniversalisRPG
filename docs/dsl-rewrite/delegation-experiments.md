# Delegation experiments

A running log of subagent delegations on the DSL rewrite, kept so a real
conclusion about *when delegation pays off* can be drawn once there are many
data points. Any single row proves little; append to it, don't reason from n=3.

## How to add a data point

After delegating a task to a subagent, record: the model, a one-line task
description, the subagent token count + tool calls + wall time (from the Agent
tool's usage footer), how heavily the task was pre-specified (this is a major
confound — a task handed the exact edit measures typing, not design), whether
the result was correct, and what the review caught.

## Data points

| # | Model | Task | Sub-tokens | Tool calls | Wall | Spec detail | Outcome |
|---|-------|------|-----------:|-----------:|-----:|-------------|---------|
| 1 | inherited | Cold-read: describe the comment-free code with zero context (readability probe) | 37.9k | 6 | 65s | n/a (read-only) | Correct — reconstructed every mechanism; flagged the real rough edges |
| 2 | Sonnet 5 | Implement entity action modifiers (`requires`/`hidden if`/tags/`on success`) reusing existing codecs | 91.7k | 23 | 307s | medium (scope + corpus given, design left open) | Correct, well-scoped; self-flagged its own two smells (F1 duplication, F2 try/catch) |
| 3 | Haiku 4.5 | Replace F2 try/catch dispatch with a non-consuming `startsResult` peek | 42.9k | 12 | 87s | high (exact regex + exact edit handed over) | Correct, clean, one-shot; added the locking test |
| 4 | Sonnet 5 | Dialogue `{…}` text fragments → literal/interpolate/conditional segments | 74.0k | 21 | 217s | medium-high (forms + examples + files constrained) | Correct; forced to duplicate the REFERENCE regex (couldn't touch condition.ts), which it self-flagged |
| 5 | Sonnet 5 | **Design** + implement the `# test` kind (composable test grammar) | 74.2k | 24 | 171s | medium (starting vocab given, design left open) | Correct; coherent minimal grammar, independently reused repo conventions (`<obj>.<objId>.<actionId>`, the condition grammar) |
| 6 | Sonnet 5 | Write the complete grammar reference (doc synthesized from the parsers) | 107.9k | 35 | 431s | medium | Doc correct + rigorous — it verified examples against the running parser; but its one novel "discovery" mis-framed load-bearing code as dead, and review corrected the framing before it entered the canonical doc |

Rows 4 and 5 ran **in parallel** as two background Sonnet agents on disjoint files.

## Findings so far (directional, not settled)

### Token efficiency — depends which budget
- **Total tokens: delegation costs more.** Every spawn cold-starts and re-reads
  files the delegator already holds in context. Haiku spent ~43k tokens to
  change ten lines; inline that is ~5–8k. The cold-start tax is fixed overhead
  that dominates small tasks.
- **Main-context tokens: delegation is cheaper.** Only the ~1k summary + the
  diff return to the main thread; the 40–90k of churn never enters it. In a
  long session where the main context window is the scarce resource, this is
  the real win — delegation trades *total* compute for *main-context* runway.
- **Dollars: model choice can flip it.** Cheap-model tokens can undercut
  inline-Opus even with the cold-start waste, because the price-per-token gap
  exceeds the token-count gap. "Delegate to a cheaper model" can be *more* total
  tokens yet *fewer* dollars.

### Review value — mostly not from discovery
Both implementation agents were honest and self-flagged their weak spots, so the
review rarely *uncovered* something hidden. Its value was: (1) **independent
verification** — re-running tests/tsc and confirming the engine file was
untouched, cheap insurance against a false "it works"; (2) **severity +
architectural synthesis** — e.g. connecting F1 to the upcoming `dialogue` kind,
which no agent did; (3) a **decision gate**. Discovery value would rise with
less-reliable agents or lower-spec tasks — i.e. exactly the cheap-model regime.
Review pairs *especially* well with cheap delegation.

### Trivial tasks — wasteful on tokens/latency, but that's the wrong lens
F2 was over-served: 87s + a cold-start to change ten lines. On raw efficiency,
inline wins trivial work. Delegation earns a trivial task only when **context
preservation** is the goal, and a cheap model makes the waste affordable.

### Haiku — one success, but too easy to generalize from
F2 shows Haiku executes a *fully specified* small change cleanly. It does not
show where Haiku's reliability drops, because the design was handed over. Needs
a **low-spec probe**: a small task described by intent only (no regex, no exact
edit), to isolate "can the cheap model design a small fix" from "can it type
one." Run 2–3 before concluding.

### Parallel disjoint-file delegation works — but can induce duplication
Rows 4 and 5 ran concurrently, split so they touched disjoint files (a safe way
to parallelize on one working tree). Both landed correct with zero conflict. But
the split *forced* row 4 to re-declare a shared regex it couldn't import (it was
barred from `condition.ts`, which the other agent's boundary also excluded), so
the tactic traded conflict-safety for an induced duplication that review then
consolidated. Lesson: parallelize on disjoint files freely, but budget a small
review-cleanup when the tasks would naturally share a primitive.

### Design-heavy delegation — the "poor fit" claim was too broad
Row 5 was the design-heavy experiment. Given requirements, a starting vocabulary,
and world context (via `.planning/` files), a cold Sonnet agent produced a
coherent, minimal grammar and made good independent calls — reusing the repo's
`<obj>.<objId>.<actionId>` addressing and the shared condition grammar rather
than inventing parallels. So design-heavy delegation is **not** automatically a
poor fit. The distinction that actually matters is *local vs. system-wide*: a
bounded new component with clear requirements delegates fine; a design that must
reconcile the whole architecture (the one-directional pivot) does not, because
that whole-system view is exactly what a cold spawn can't rebuild.

## Working heuristic (revise as data accrues)

- **Non-trivial, self-contained feature →** delegate to Sonnet; context offload
  + review gate paid off (row 2).
- **Trivial, well-specified fix →** usually inline; delegate only to protect a
  long context, and then to Haiku.
- **Always review** — cheap; its value (verification + synthesis) is independent
  of whether the agent erred.
- **Design-heavy but *local* work →** fine to delegate (row 5): a bounded new
  component with clear requirements + a starting shape, checked on review.
- **Design that must reconcile the *whole system* →** poor fit: the cold agent
  can't cheaply rebuild the architecture-wide view. Keep it in the main thread.
- **Parallel agents →** split on disjoint files; expect an occasional induced
  duplication to clean up on review.

## Break-even, stated once

Delegate when the implementation churn you'd otherwise absorb into the main
context exceeds the cold-start re-derivation cost, and the task is self-contained
enough to bound that cold-start. Cheaper models lower the right-hand side.

## Open experiments

- [ ] Low-spec Haiku probe (intent-only small task) — find the reliability edge.
- [x] A design-heavy delegation (row 5) — the "poor fit" hypothesis narrowed to
      *system-wide* design, not *local* design.
- [ ] Track review *rework rate*: how often the review sends work back
      (so far 0/6 fully sent back; 1/6 needed a code consolidation, 1/6 a
      doc-framing correction — both caught on review, neither by the agent).
