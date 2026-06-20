# Agent Session Protocol

Protocol version: `1`

The controller is the only authority allowed to mutate runtime state. The GM
authors choices and content changes. The player selects choices. Agents never
send free-form messages to each other.

## Turn Order

1. The controller resolves all due virtual-time events and creates a new turn
   id.
2. The controller sends the GM one private `gm-snapshot`.
3. The GM returns one `gm-update`.
4. The controller applies operations to a draft, validates it, and either:
   - accepts it and produces a public player snapshot, or
   - rejects it and returns validation errors to the GM without involving the
     player.
5. Unless `runStatus` ended the run, the controller sends one public
   `player-snapshot`; the player returns one `player-choice`.
6. The controller verifies that the action is currently available, stores the
   expectation feedback privately, starts the action, and resolves it with the
   instant virtual clock.
7. The controller records the complete outcome and repeats from step 1 without
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

The snapshot also includes the canonical draft or a content revision id plus a
controller-provided way to inspect that exact revision. The GM must never infer
state from an older turn.

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
  - `{"op":"set-death-reset","value":{...}}`
- Supported `contentType` values are `locations`, `edges`, `actions`, `skills`,
  `items`, `flags`, `resources`, `effects`, `interaction-types`, and `enemies`.
- The controller translates operations into the existing split JSON files.
- `set-manifest` supplies manifest identity, version, author, locales, file
  list, and compatibility. Death persistence remains a separate atomic
  operation so it can be revised without replacing manifest metadata.
- Omission never means deletion. Removal always requires a `remove` operation.
- The GM may remove an obsolete action only if doing so does not strand the
  player or invalidate the active action.
- `privateNotes` must be a short decision record, not hidden chain-of-thought.

## Content Primitive Reference

Actions always include `id`, `locationId`, `durationSeconds`, and `rewards`.
Use `maxCompletions` for finite interactions. A completion increments the
action's authoritative counter; exhausted actions are no longer available.

Ordered action `results` use only these forms:

```json
[
  { "kind": "item", "itemId": "air-canister", "amount": -1 },
  { "kind": "resource", "resourceId": "air", "amount": 60 },
  { "kind": "skill-xp", "skillId": "engineering", "amount": 2 },
  { "kind": "flag", "flagId": "torn-suit", "value": true },
  { "kind": "relocate", "locationId": "main-intersection" },
  { "kind": "chat", "messageKey": "event.bulkhead-opened" }
]
```

Item, resource, and skill-XP amounts may be positive or negative but not zero.
Item quantities clamp at zero and optional `maxQuantity`. Consumption actions
must also require enough items; clamping is not a substitute for a requirement.

Conditions may be assigned to `visibleWhen` or `requirements`:

```json
{
  "kind": "all",
  "conditions": [
    { "kind": "item", "itemId": "space-suit", "comparison": "at-least", "value": 1 },
    { "kind": "not", "condition": { "kind": "flag", "flagId": "airlock-open", "value": true } }
  ]
}
```

Atomic condition kinds are `item`, `resource`, `skill-level`,
`action-completions`, and `flag`. Combinators are `all`, `any`, and `not`.
Numeric comparisons are `equal`, `at-least`, `at-most`, `greater-than`, and
`less-than`.

Movement chosen through the action-only interface uses a `relocate` result.
The action duration is its travel time. Resource effects remain active across
that simulated duration. Do not ask the player to click the map.

Death is triggered by a resource boundary containing `{"kind":"death-reset"}`.
The `deathReset.preserve` lists in `universe.json` explicitly name inventory,
resources, flags, and action counters that survive; skill XP and discovered
locations use booleans. `torn-suit` must be a declared flag before it can be
preserved.

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
