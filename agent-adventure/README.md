# Two-Agent Adventure Authoring

This package defines a reusable GM/player workflow for generating and testing a
UniversalisRPG universe without allowing either agent to bypass the game UI.

## Files

- `gm-agent.md`: reusable system instructions for the GM agent.
- `player-agent.md`: reusable system instructions for the player agent.
- `protocol.md`: controller-owned turn order and JSON message envelopes.
- `scenarios/derelict-extant-part-1.md`: the private Part 1 brief supplied only
  to the GM.

## Recommended Session

1. Give `gm-agent.md`, `protocol.md`, the current universe draft, and the
   scenario brief to the GM.
2. Give `player-agent.md`, `protocol.md`, and only the public player snapshot to
   the player.
3. Use a deterministic controller to validate messages, execute selected
   actions, advance resources, and maintain the canonical draft.
4. Retain the player's expectation feedback in the session transcript. Use it
   to revise the universe after the run.
5. Export only after UniversalisRPG validation reports no errors.

The controller is deliberately not a third creative agent. It is ordinary
program code responsible for sequencing, validation, simulation, and logs.

## Current Engine Boundary

The existing content model supports locations, travel edges, timed actions,
localized action narration, positive resource rewards, action requirements,
and resource effects while an action is active.

Part 1 also needs mechanics that are not currently expressible in loadable
content: one-use inventory, consuming or subtracting resources, flags and
conditional action visibility, action-driven relocation, and explicit
loop-persistence policies. The GM must identify these as capability requests in
its private update instead of encoding fake fields or silently weakening the
scenario. Those capabilities should be added to the engine before a final Part
1 universe is exported.

