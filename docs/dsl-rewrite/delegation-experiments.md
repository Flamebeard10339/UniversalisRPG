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

## Working heuristic (revise as data accrues)

- **Non-trivial, self-contained feature →** delegate to Sonnet; context offload
  + review gate paid off (row 2).
- **Trivial, well-specified fix →** usually inline; delegate only to protect a
  long context, and then to Haiku.
- **Always review** — cheap; its value (verification + synthesis) is independent
  of whether the agent erred.
- **Design-heavy, cross-cutting work →** likely a *poor* delegation fit: the
  cold agent lacks the whole-system view such decisions need, and that view is
  exactly what a spawn can't cheaply rebuild. Prefer doing it in the main thread.

## Break-even, stated once

Delegate when the implementation churn you'd otherwise absorb into the main
context exceeds the cold-start re-derivation cost, and the task is self-contained
enough to bound that cold-start. Cheaper models lower the right-hand side.

## Open experiments

- [ ] Low-spec Haiku probe (intent-only small task) — find the reliability edge.
- [ ] A design-heavy delegation, to test the "poor fit" hypothesis directly.
- [ ] Track review *rework rate*: how often the review sends work back.
