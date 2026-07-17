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

| 7 | Sonnet 5 | Build the headless runtime (load + condition eval + effects + dialogue stepper + `# test` runner) | 93.8k | 29 | 357s | high (7 concrete pieces specified) | Green on its own 9 tests — but they missed two cases real content needs (once/sticky effect-refire, menu fall-through); both surfaced only at integration |
| 8 | Sonnet 5 | Author tutorial-island content + friction report | 101.7k | 26 | 522s | medium (grammar doc + questline given) | Content parses and runs; friction report high-signal — confirmed the predicted item-possession gap |

| 9 | Sonnet 5 | Add the `has` inventory-possession condition (grammar + runtime + content + doc + tests) | 77.2k | 37 | 179s | medium-high (feature fully specified) | Correct, one-shot; integration stayed green |
| 10 | Sonnet 5 (cold spawn) | Build `session.ts` interactive-play layer over `runtime.ts` (choice enumeration + apply) + tests | 99.9k | 25 | 470s | high (full interface + enumeration rules + test route specified) | Correct, one-shot; only minimal runtime change (export `useAction`); test drives the full real route through the choice API |
| 11 | Sonnet 5 (**warm resume** via SendMessage, continues #10) | Rewire `playtest-cli.ts` onto `loadModule`+`session.ts`, delete obsolete `playtestEngine.ts` | 82.5k | 37 | 692s | high (steps + arg surface specified) | Correct, one-shot; replays full Miki route green. **But warm resume was not cheaper — see warm-swarm finding.** |

| 12 | Sonnet 5 (cold spawn) | Counter/tally `add:` effect (grammar+runtime+tests) + bare-field error message | 125.1k | 58 | 562s | high (2 labeled pieces, exact content edits) | A1/A2/error-msg correct & green; **correctly STOPPED** on the content-wiring piece — proved empirically that the exact edit I specified collides with entity auto-scoping (`add` unscoped while a sibling `hidden if` scopes → the rat gate never trips → infinitely farmable). A **planner spec error**, caught by the STOP escape hatch + the "verify empirically" instruction, not an agent error. |

| 13 | Sonnet 5 (cold spawn) | Finish counter/tally: scope `add:` in scope.ts + wire `tutorial.rats-killed` content ripple + grammar.md | 62.4k | 28 | 153s | high (3 labeled pieces, exact edits, resolution pre-decided by planner) | Correct, one-shot, no STOP; 59 green, replay green, tsc clean. The follow-up to row 12's STOP — a planner-designed resolution executed cleanly. |

Rows 4 and 5 (and 7 and 8) each ran **in parallel** as two background Sonnet agents on disjoint files. Rows 10 and 11 were the **warm-swarm probe**: 11 continued 10's agent via `SendMessage` instead of a fresh spawn. Rows 12→13 are the **STOP-then-cold-respawn pattern**: chunk 1 took two cold spawns — 12 correctly stopped on a planner spec error (125k), 13 executed the corrected spec (62k) — instead of warm-resuming 12. Validates the no-warm-resume rule: a fresh cold spawn on a fixed spec cost *less* than dragging 12's 125k transcript forward would have, and kept the two diffs cleanly separable for review.

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

### A large delegation's own tests are not enough QA — integrate against real input
Row 7 (the runtime) was the most *system-wide* delegation yet, and it came back
green on its own 9 tests. But those tests were internally consistent and
*incomplete*: the runtime re-fired effects on a node revisit and abandoned a node
after a menu choice, and **neither showed until row 8's real authored content ran
through it** (integration). Lesson: for a big delegation, "the agent's tests
pass" proves self-consistency, not correctness — the review must run it against
an independent, real input. This also sharpens the design-heavy finding below:
the runtime was system-wide *and* delegated fine — the decisive factor was the
7-piece spec, not the scope.

### Friction reports are a distinct delegation payload
Row 8's real deliverable wasn't the content, it was the friction report — a
language model authoring against the grammar for the first time is a usable
instrument for *intuitiveness*. It independently confirmed the predicted
item-possession gap (`requires: lockpick` reads as "holding one" but is a bare
flag) and surfaced a bare-vs-qualified reference ambiguity we hadn't decided.

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

### Warm-swarm (SendMessage continuation) — the token savings did not materialize
The hypothesis (handoff goal 2): spawning fresh re-pays a ~40–108k cold-start
re-read every time, so keeping an agent warm and dispatching follow-ups via
`SendMessage` (which continues it *with context intact*) should dodge that tax.
Rows 10→11 tested it: 11 continued 10's agent instead of cold-spawning.

**Result: warm resume was *not* cheaper.** Task 11 was the *smaller* task (rewire
one script vs. build a layer + tests), yet cost **82.5k tokens / 37 tool calls /
692s** — more tool calls and more wall-time than the from-scratch task 10 (99.9k /
25 / 470s), and only ~17k fewer tokens despite being a lighter job. The agent
*did* reuse context correctly (it re-read only `playtest-cli.ts` +
`playtestEngine.ts` + one grep; it did **not** re-read `runtime.ts`/`session.ts`/
content — it held them from task 10). So context continuity is real and the
file-re-reads were genuinely avoided.

**Why it still cost so much:** a `SendMessage` resume carries the *entire prior
transcript* (~100k from task 10) forward as a context prefix that is re-ingested
on every subsequent model turn. Over 37 turns spanning 692s — far past the
~5-minute prompt-cache TTL, so repeated cache misses — reprocessing that retained
transcript dwarfed the handful of file-reads it saved. The retained context is a
*liability* here, not an asset, because the shared code it replaces (a few hundred
lines) is cheap to just re-read cold.

**And the main-context budget is identical either way** — only the ~1k summary
returns to the delegator whether the sub is cold or warm. So there is *no*
main-context argument for warm over cold; the whole appeal was total-token
savings, which didn't appear.

**Revised guidance:** for **bounded, well-specced coding tasks**, prefer a **cold
spawn per task** — the spec *is* the context, and re-reading a few files is cheaper
than dragging a large transcript. Reserve `SendMessage` continuation for cases
where the agent must retain a **large, hard-to-respec working state** that a spec
can't cheaply reconstitute (a long debugging thread with accumulated hypotheses;
an iterative design conversation), and keep the follow-ups **inside the cache
window** so the retained prefix stays cached. Warm-swarm is a *state-preservation*
tool, not a *cost-reduction* one.

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
- **Warm resume (`SendMessage`) →** not a cost play: use it only to preserve a
  large working state a fresh spec can't cheaply rebuild, and keep follow-ups
  inside the cache window. For bounded, well-specced tasks, cold-spawn each.

## Break-even, stated once

Delegate when the implementation churn you'd otherwise absorb into the main
context exceeds the cold-start re-derivation cost, and the task is self-contained
enough to bound that cold-start. Cheaper models lower the right-hand side.

## Open experiments

- [ ] Low-spec Haiku probe (intent-only small task) — find the reliability edge.
- [x] Warm-swarm probe (rows 10→11): `SendMessage` continuation is *not* cheaper
      than cold-spawn for bounded tasks — the retained transcript costs more than
      the file-reads it saves. It's a state-preservation tool, not a cost play.
- [x] A design-heavy delegation (row 5) — the "poor fit" hypothesis narrowed to
      *system-wide* design, not *local* design.
- [ ] Track review *rework rate*: how often the review sends work back
      (so far 0/8 fully sent back; fixes caught on review: 1 code consolidation,
      1 doc-framing correction, 2 runtime bugs — the last two only via
      integration against real content, not the agent's own tests).
