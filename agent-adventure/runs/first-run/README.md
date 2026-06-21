# First Dual-Agent Run

- Scenario: Derelict Extant, Part 1
- Simulation: instant virtual time
- Random seed: `1731`
- Supervisor: Codex
- GM and player contexts: isolated
- Result: terminated early at turn 12 after the GM stopped responding to a
  required correction

Generated artifacts:

- `session.json`: authoritative draft, state, virtual clock, and run status.
- `transcript.jsonl`: append-only controller transcript.
- `gm-snapshot.json`: latest private GM input.
- `player-snapshot.json`: latest public player input when available.
- `bugs.md`: supervised findings and early-stop reason, if any.
- `run-summary.md`: concise playthrough and termination report.
