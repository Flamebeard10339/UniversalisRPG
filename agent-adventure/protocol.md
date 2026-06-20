# Agent Session Protocol

Protocol version: `1`

The controller is the only authority allowed to mutate runtime state. The GM
authors choices and content changes. The player selects choices. Agents never
send free-form messages to each other.

## Turn Order

1. The controller resolves any completed timer and resource effects.
2. The controller sends the GM a private authoring snapshot.
3. The GM returns one `gm-update`.
4. The controller applies operations to a draft, validates it, and either:
   - accepts it and produces a public player snapshot, or
   - rejects it and returns validation errors to the GM without involving the
     player.
5. The player returns one `player-choice`.
6. The controller verifies that the action is currently available, stores the
   expectation feedback privately, starts the action, and advances simulation.
7. Repeat from step 1 after completion or another controller event.

This ordering prevents stale choices, double execution, fabricated resources,
and private story leakage.

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
  "operations": [
    {
      "op": "upsert-action",
      "action": {
        "id": "inspect-cracked-seal",
        "locationId": "cryopod",
        "durationSeconds": 4,
        "rewards": []
      },
      "localizations": {
        "action.inspect-cracked-seal.title": "Inspect the Cracked Seal",
        "action.inspect-cracked-seal.description": "Check the split gasket around the pod lid.",
        "action.inspect-cracked-seal.success": "The gasket has hardened into a black ring. One split reaches the manual release housing.",
        "action.inspect-cracked-seal.failure": "Frost obscures the damaged section before you can trace it."
      }
    }
  ],
  "removeActionIds": [],
  "capabilityRequests": [],
  "privateNotes": "The player's request is physically supported and provides a second route to the release clue."
}
```

Rules:

- `turnId` must match the controller's GM snapshot.
- `milestoneId` is private bookkeeping and is never sent to the player.
- `operations` may upsert supported universe data and localization values. The
  controller translates these into the existing split JSON files.
- Removing content uses explicit id lists; omission never means deletion.
- The GM may remove an obsolete action only if doing so does not strand the
  player or invalidate the active action.
- `privateNotes` must be a short decision record, not hidden chain-of-thought.

## Capability Requests

When required fiction cannot be represented by the current engine, the GM emits
a request instead of invalid content:

```json
{
  "id": "consume-finite-item",
  "neededFor": "Use one of two spare air canisters exactly once.",
  "requiredSemantics": "Require one canister, remove one on completion, and hide or disable the action at zero.",
  "blocking": true
}
```

A blocking request freezes milestone advancement but should not prevent the GM
from offering unrelated valid investigation actions.

## Public Snapshot

The controller constructs this from validated content and authoritative state:

```json
{
  "protocolVersion": 1,
  "type": "player-snapshot",
  "turnId": "turn-0007",
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
      "enabled": true
    }
  ]
}
```

The player never receives raw localization keys, undiscovered locations,
disabled-action requirements unless the UI normally exposes them, private GM
notes, capability requests, or the story brief.

## Transcript and Refinement

Persist each accepted GM update, public snapshot, player choice, feedback item,
runtime outcome, validation rejection, and capability request. A run report
should summarize:

- choices players expected but could not make,
- actions repeatedly ignored or misunderstood,
- deaths and resource state at death,
- milestones reached and where players stalled,
- invalid GM updates,
- unresolved engine capabilities.

The transcript is the evidence used to revise the JSON between player runs.
