# Agent Session Protocol

Protocol version: `1`

The controller is the only authority allowed to mutate runtime state. The GM
authors choices and content changes. The player selects choices. Agents never
send free-form messages to each other.

## Pre-Play Planning

Before turn one, the GM receives a private `planning-snapshot` and writes
`planning.md` in natural Markdown using `planning-template.md`. The
supervisor may edit this file. Controller `begin` is an explicit approval
gate; no GM update or player choice is accepted before it.

The plan is design context, not canonical game state. Only validated
`gm-update` operations mutate the universe. This lets the GM reason about
pacing, resource arithmetic, death/reset behavior, and endpoints naturally
while retaining an atomic machine boundary for implementation.

## Turn Order

1. The controller loads the approved plan and current milestone.
2. The controller resolves all due virtual-time events and creates a new turn
   id.
3. The controller sends the GM one private `gm-snapshot`.
4. The GM returns one `gm-update`.
5. The controller applies operations to a draft, validates it, and either:
   - accepts it and produces a public player snapshot, or
   - rejects it and returns validation errors to the GM without involving the
     player.
6. Unless `runStatus` ended the run, the controller sends one public
   `player-snapshot`; the player returns one `player-choice`.
7. The controller verifies that the action is currently available, stores the
   expectation feedback privately, starts the action, and resolves it with the
   instant virtual clock.
8. The controller records the complete outcome and repeats from step 1 without
   wall-clock delay.

This ordering prevents stale choices, double execution, fabricated resources,
and private story leakage.

## Instant Virtual Clock

- Never use `sleep`, `setTimeout`, polling, browser idling, or real elapsed time.
- Keep a monotonic `virtualNow` in milliseconds in controller state.
- After a valid choice, start the action at `virtualNow` and advance directly to
  the earliest action, enemy attack, or resource-boundary timestamp.
- Resolve that boundary, then continue advancing until the selected action has
  completed, failed, been stopped by death, or relocated the player.
- A combat action may require several internal attack boundaries. Resolve all
  of them before asking either agent for another message.
- Apply effects for the exact simulated interval. A ten-second action consumes
  ten seconds of air even though the controller returns immediately.
- Resolve and freeze localized completion narration before sending the next GM
  snapshot. Later content edits cannot retroactively change observed text.
- Disable global action looping during agent runs. One player choice resolves
  one selected action to its terminal outcome.
- Use a recorded seeded random source for adversarial checks. Store the seed and
  each sampled outcome in the transcript.
- Increase `virtualNow`; never rewrite timestamps backward after death reset.

## Private GM Snapshot

The player never receives this object.

```json
{
  "protocolVersion": 1,
  "type": "gm-snapshot",
  "turnId": "turn-0007",
  "runId": "run-0001",
  "virtualNow": 42000,
  "bootstrapRequired": false,
  "milestoneId": "wake-in-cryopod",
  "world": {
    "locationId": "cryopod",
    "inventory": {},
    "resources": { "air": { "current": 100, "min": 0, "max": 100 } },
    "flags": {},
    "actionCompletions": {},
    "deathCount": 0
  },
  "availableActionIds": ["inspect-cracked-seal"],
  "latestOutcome": null,
  "playerFeedback": null,
  "validationIssues": [],
  "capabilities": {
    "instantVirtualTime": true,
    "finiteInventory": true,
    "finiteActions": true,
    "recursiveConditions": true,
    "actionRelocation": true,
    "deathPersistence": true
  }
}
```

The snapshot also includes the approved plan, a focused `contentWindow` for
the current location, a compact `contentIndex`, and paths to the exact full
draft and authoring reference. The complete growing draft is intentionally not
repeated in every turn. The GM must never infer state from an older snapshot.

## Player Message

```json
{
  "protocolVersion": 1,
  "type": "player-choice",
  "turnId": "turn-0007",
  "actionId": "inspect-cracked-seal",
  "feedback": {
    "expectedActions": [
      {
        "label": "Try to wipe frost from the pod window",
        "reason": "The window and frost were both visible in the last narration."
      }
    ],
    "confusion": null
  }
}
```

Rules:

- `turnId` must equal the current public snapshot turn.
- `actionId` must be one currently enabled id.
- `expectedActions` contains zero to three entries.
- `confusion` is either a concise string or `null`.
- Feedback is never displayed as character dialogue or narration.

## GM Message

```json
{
  "protocolVersion": 1,
  "type": "gm-update",
  "turnId": "turn-0007",
  "milestoneId": "wake-in-cryopod",
  "runStatus": "continue",
  "operations": [
    {
      "op": "upsert",
      "contentType": "actions",
      "value": {
        "id": "inspect-cracked-seal",
        "locationId": "cryopod",
        "durationSeconds": 4,
        "rewards": []
      }
    },
    {
      "op": "localize",
      "locale": "en",
      "values": {
        "action.inspect-cracked-seal.title": "Inspect the Cracked Seal",
        "action.inspect-cracked-seal.description": "Check the split gasket around the pod lid.",
        "action.inspect-cracked-seal.success": "The gasket has hardened into a black ring. One split reaches the manual release housing.",
        "action.inspect-cracked-seal.failure": "Frost obscures the damaged section before you can trace it."
      }
    }
  ],
  "capabilityRequests": [],
  "privateNotes": "The player's request is physically supported and provides a second route to the release clue."
}
```

Rules:

- `turnId` must match the controller's GM snapshot.
- `milestoneId` is private bookkeeping and is never sent to the player.
- `runStatus` is `continue`, `part-complete`, or `blocked`.
- Every operation is one of:
  - `{"op":"upsert","contentType":"...","value":{...}}`
  - `{"op":"remove","contentType":"...","id":"..."}`
  - `{"op":"localize","locale":"en","values":{...}}`
  - `{"op":"set-manifest","value":{...}}`
- Supported `contentType` values are `locations`, `edges`, `actions`, `skills`, `stats`,
  `items`, `flags`, `resources`, `effects`, `interaction-types`, and `enemies`.
- The controller translates operations into the existing split JSON files.
- The controller derives the manifest `files` list automatically. The GM does
  not maintain it by hand.
- `set-manifest` supplies manifest identity, version, author, locales, file
list, and compatibility. State-reset behavior belongs to the resource boundary that triggers it.
- Omission never means deletion. Removal always requires a `remove` operation.
- The GM may remove an obsolete action only if doing so does not strand the
  player or invalidate the active action.
- `privateNotes` must be a short decision record, not hidden chain-of-thought.

## Content Primitive Reference

Actions always include `id`, `locationId`, `durationSeconds`, and `rewards`.
Use `maxCompletions` for finite interactions. A completion increments the
action's authoritative counter; exhausted actions are no longer available.
`role` is `optional`, `progression`, or `utility`.

Ordered action `results` use only these forms:

```json
[
  { "kind": "item", "itemId": "air-canister", "amount": -1 },
  { "kind": "resource", "resourceId": "air", "amount": 60 },
  { "kind": "skill-xp", "skillId": "engineering", "amount": 2 },
  { "kind": "flag", "flagId": "torn-suit", "value": true },
  { "kind": "relocate", "locationId": "main-intersection" },
  { "kind": "chat", "messageKey": "event.bulkhead-opened", "delaySeconds": 1 }
]
```

An action may contain at most two delayed chat results; together with its
completion message this creates a maximum three-message sequence.

Item, resource, and skill-XP amounts may be positive or negative but not zero.
Item quantities clamp at zero and optional `maxQuantity`. Consumption actions
must also require enough items; clamping is not a substitute for a requirement.

Conditions may be assigned to `visibleWhen` or `requirements`:

```json
{
  "kind": "all",
  "conditions": [
    { "kind": "not", "condition": { "kind": "state-variable", "variable": "item:space-suit", "comparison": "less-than", "value": 1 } },
    { "kind": "not", "condition": { "kind": "state-variable", "variable": "flag:airlock-open", "comparison": "equal", "value": true } }
  ]
}
```

Atomic conditions use `state-variable` with `flag:`, `item:`, `resource:`,
`skill-level:`, `stat:`, or `action-completions:` keys. Combinators are `all`,
`any`, and `not`. Numeric comparisons are `equal`, `greater-than`, and `less-than`.

Movement chosen through the action-only interface uses a `relocate` result.
The action duration is its travel time. Resource effects remain active across
that simulated duration. Do not ask the player to click the map.

Any resource boundary may reset state with `{"kind":"reset-state"}`. Its
optional `preserve` object explicitly names inventory, resources, flags, and
action counters that survive; skill XP and discovered locations use booleans.

## Capability Requests

When required fiction cannot be represented by the current engine, the GM emits
a request instead of invalid content:

```json
{
  "id": "unsupported-state-transition",
  "neededFor": "A future scenario mechanic not expressible by current results.",
  "requiredSemantics": "Describe the missing state and transition precisely.",
  "blocking": true
}
```

A blocking request freezes milestone advancement but should not prevent the GM
from offering unrelated valid investigation actions.

Finite items, item consumption, finite actions, positive or negative resource
changes, flags, recursive conditions, relocation, and death persistence are
already supported and must not be reported as missing capabilities.

## Public Snapshot

The controller constructs this from validated content and authoritative state:

```json
{
  "protocolVersion": 1,
  "type": "player-snapshot",
  "turnId": "turn-0007",
  "virtualNow": 42000,
  "location": {
    "id": "cryopod",
    "title": "Cryopod",
    "description": "A narrow pressure shell filmed with frost."
  },
  "narration": [
    "Cold reaches you before memory does."
  ],
  "resources": [
    { "id": "air", "label": "Air", "current": 100, "min": 0, "max": 100, "ratePerMinute": 0 }
  ],
  "inventory": [],
  "actions": [
    {
      "id": "inspect-cracked-seal",
      "title": "Inspect the Cracked Seal",
      "description": "Check the split gasket around the pod lid.",
      "durationSeconds": 4,
      "remainingCompletions": null,
      "enabled": true
    }
  ]
}
```

The player never receives raw localization keys, undiscovered locations,
disabled-action requirements unless the UI normally exposes them, private GM
notes, capability requests, or the story brief.

## Bootstrap and Termination

- Planning approval is required before bootstrap.
- If no valid playable draft exists, the first GM snapshot sets
  `bootstrapRequired: true`. The first accepted GM update must create a manifest,
  one starting location, required state definitions, English localizations, and
  at least one enabled opening action. Validate the complete batch only after
  applying all operations atomically.
- End successfully only when the GM returns `runStatus: part-complete`, the
  controller validates the draft, and authoritative state matches the Part 1
  endpoint.
- End as blocked only for a blocking capability request.
- The controller enforces the configured maximum player choices and rejects
  repeated stale or invalid messages rather than silently advancing.

## Transcript and Refinement

Persist each accepted GM update, public snapshot, player choice, feedback item,
runtime outcome, virtual-time advance, random sample, validation rejection, and
capability request. Every entry includes `runId`, `turnId`, sequence, actor, and
virtual timestamp. A run report should summarize:

- choices players expected but could not make,
- actions repeatedly ignored or misunderstood,
- deaths and resource state at death,
- milestones reached and where players stalled,
- invalid GM updates,
- unresolved engine capabilities.

The transcript is the evidence used to revise the JSON between player runs.
