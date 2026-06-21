# First-Run Preflight

Complete this checklist before sending the first message to either agent.

## Controller Configuration

- Simulation mode is `instant-virtual-time`; no wall-clock timers are started.
- `virtualNow` starts at a fixed recorded value and only increases.
- Global action looping is disabled.
- A seeded random generator is configured and its seed is in the transcript.
- The run has a unique `runId`; turn ids are monotonic and never reused.
- The maximum is 200 accepted player choices, 3 GM correction attempts per
  turn, and 10,000 internal timer/resource/combat boundaries per choice.
- Crossing the internal-boundary limit ends the run as a controller error. It
  must not be presented as story failure.

## Planning Approval

- Complete a private Markdown plan before turn one.
- Review and edit the plan before running controller `begin`.
- Require explicit resource arithmetic for every planned depletion/death path.
- Verify action requirements permit the final resource boundary to be reached.
- Define death persistence and the authoritative Part endpoint in advance.

## Isolation

- The GM receives the scenario brief, protocol, GM instructions, approved plan,
  focused content window, compact content index, and validation errors.
- The player receives only the player instructions, protocol, and current
  public snapshot.
- The player context contains no story brief, milestone names, GM notes,
  capability requests, raw undiscovered content, or prior test transcripts.
- The GM and player have no direct channel. The controller forwards only the
  fields permitted by `protocol.md`.

## Draft and Validation

- Begin from a deliberate Derelict Extant draft, or set `bootstrapRequired` to
  true. Do not accidentally mutate the bundled `base` universe.
- Apply every GM operation for a turn atomically to a temporary draft.
- Validate every agent response against the corresponding schema in `schemas/`
  before reading any fields or changing controller state.
- Run shape, reference, localization, duplicate-id, and starting-location
  validation before accepting the batch.
- Reject the complete batch on any error and leave canonical content unchanged.
- Recompute visible and enabled actions from authoritative state after each
  accepted batch and after each resolved player action.
- Ensure at least one enabled action is available before sending a player
  snapshot, unless the run has ended.
- Normalize the manifest file list from accepted content rather than asking the
  GM to maintain it manually.
- Export accepted checkpoints as normal playtest universes for human review.
- For follow-up runs, initialize from the reviewed universe and include its
  `PLAYTEST.md` notes in the GM planning snapshot.

## Instant Resolution

- Record the player choice and feedback before mutating runtime state.
- Verify turn id, action id, location, visibility, requirements, and remaining
  completion count.
- Advance to each relevant virtual boundary and resolve until the chosen action
  reaches a terminal outcome. Never wait in real time.
- Apply resource effects for exact simulated duration, including boundaries
  reached before nominal action completion.
- Resolve death/reset and persistence before constructing the next snapshot.
- Record the choice, virtual-time advances, random samples, state deltas,
  narration, outcome, and resulting snapshot.

## Transcript

- Open a fresh append-only transcript for the `runId` before turn one.
- Record accepted and rejected GM messages, player choices and feedback,
  validation errors, controller decisions, virtual timestamps, random samples,
  state changes, deaths, and snapshots.
- Flush the transcript after every controller step.
- At run end, retain the raw transcript and write a summary containing stalls,
  missing expected actions, deaths, milestone reached, validation failures, and
  unresolved capabilities.

## Stop Conditions

- Success requires `runStatus: part-complete`, a valid draft, and authoritative
  state at the Part 1 endpoint.
- `runStatus: blocked` requires a genuinely blocking capability request.
- Stop on player-choice limit, repeated invalid agent output, or controller
  boundary limit and label the reason as a test/controller stop.
- Never let an agent invent a successful ending after a controller stop.
