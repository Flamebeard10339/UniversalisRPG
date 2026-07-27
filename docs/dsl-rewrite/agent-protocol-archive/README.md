# Agent-adventure protocol (archived design note)

These two files are the only salvage-worthy remnants of the `agent-adventure/`
experiment (a deterministic controller sequencing a GM agent and a player agent
through strict JSON envelopes to author + playtest a universe without bypassing
the engine). The experiment ran twice, both failed, and its controller depended
on engine modules deleted on 2026-07-26 and a content format replaced by the
`contentDsl` grammar — so the runnable half was removed during the 2026-07-26
spring-clean.

Kept here because the **agent/engine-boundary message protocol** may be worth
mining if a headless bot-play loop over the new `contentDsl` runtime lands (see
`../implementation-plan.md`). This is a frozen reference, not live tooling.

- `protocol.md` — turn order, JSON message schemas, virtual-clock rules.
- `first-run-retrospective.md` — what broke in run one and the intended fixes.
