# Two-Agent Adventure Authoring

This package defines a reusable GM/player workflow for generating and testing a
UniversalisRPG universe without allowing either agent to bypass the game UI.

## Files

- `gm-agent.md`: reusable system instructions for the GM agent.
- `player-agent.md`: reusable system instructions for the player agent.
- `protocol.md`: controller-owned turn order and JSON message envelopes.
- `preflight.md`: required controller settings and first-run checklist.
- `planning-template.md`: editable natural-language design pass completed
  before turn one.
- `authoring-reference.json`: compact exact field reference for GM updates.
- `first-run-retrospective.md`: assessment of the first supervised run and
  the workflow changes made before run two.
- `schemas/*.schema.json`: strict validators for both agent response envelopes.
- `scenarios/derelict-extant-part-1.md`: the private Part 1 brief supplied only
  to the GM.

## Recommended Session

1. Run controller `init`, then give the GM its planning snapshot, the scenario
   brief, and `planning-template.md`.
2. Save the GM's Markdown plan with `set-plan`. Review or edit
   `planning.md`, then explicitly run `begin`.
3. Give the GM `gm-agent.md`, `protocol.md`, the compact GM snapshot, and
   `authoring-reference.json`.
4. Give `player-agent.md`, `protocol.md`, and only the public player snapshot to
   the player.
5. Use a deterministic controller to validate messages, execute selected
   actions, advance resources, and maintain the canonical draft.
6. Retain the player's expectation feedback in the session transcript. Use it
   to revise the universe after the run.
7. Run controller `export` after any accepted turn to produce a normal,
   selectable universe for human playtesting. Incomplete exports must be
   labeled as playtests.
8. Record human notes in the exported universe's `PLAYTEST.md`. After editing
   its JSON directly or through the contribution workflow, use
   `init-from-universe <run-directory> <universe-id>` for the next paired run.
   The next planning snapshot includes those notes and the edited content index.

Per-turn mutation remains structured JSON because atomic validation prevented
state corruption during the first run. Story planning is Markdown, and GM
snapshots contain only current-location content, state definitions, identity
indexes, and paths to the full draft. This keeps the creative context natural
without weakening the engine boundary.

The controller is deliberately not a third creative agent. It is ordinary
program code responsible for sequencing, validation, simulation, and logs.

## Simulation Mode

Agent runs use an instant virtual clock. The controller never sleeps, starts a
real timer, waits for wall-clock duration, or backgrounds the application. When
the player chooses an action, the controller advances virtual time directly to
the next relevant boundary and resolves the action, effects, combat, death, and
relocation synchronously. Durations still matter fictionally and mechanically.

Before a run, complete every item in `preflight.md`.

Run `powershell -ExecutionPolicy Bypass -File agent-adventure/precheck.ps1`
from the project root for the automated precheck.

## Engine Capability Mapping

The content model supports the Part 1 primitives directly:

- Items use `initialQuantity` and optional `maxQuantity`.
- Actions use `maxCompletions` for finite location interactions.
- Ordered `results` can add or consume items, change resources positively or
  negatively, set flags, relocate the player, grant skill XP, and emit chat.
- Recursive `visibleWhen` and `requirements` conditions support items,
  resources, skills, flags, prior action completions, and `all`/`any`/`not`.
- `flags.json` defines boolean world state such as `torn-suit`.
- `universe.json.deathReset` controls which state survives death by id.
- The Settings run transcript records player, GM, and engine events and can be
  reviewed or copied as JSON after a run.

Capability requests remain part of the protocol for future mechanics. The GM
must never invent schema fields.
