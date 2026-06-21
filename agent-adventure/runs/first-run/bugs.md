# First Dual-Agent Run Findings

Run status: terminated early by supervisor at turn 12

## Agent-Encountered Bugs

1. **GM bootstrap schema hallucination (turn 1, attempt 1).** The GM emitted a
   plausible but unsupported manifest shape: `files` was an object instead of
   an array, required manifest fields were omitted, and the starting location
   had no `position`. The controller rejected the batch atomically. This
   indicates the operation protocol describes `set-manifest` conceptually but
   does not provide its exact engine schema inline.

2. **GM ignored explicit player feedback (turn 6, attempt 1).** The player
   requested an "Inspect the other cryopods" affordance. The GM instead claimed
   the player had requested a way to wear the suit. A correction prompt was
   required before the missing affordance was added.

3. **GM resource-schema hallucination (turn 6, attempt 1).** The GM used
   `initial`, `min`, `max`, and `ratePerMinute` on a resource definition,
   plus `defaultValue` on flags. The batch was rejected atomically. The valid
   fields are `initialValue`, `minValue`, `baseMaxValue`, and flag
   `initialValue`.

4. **Ambiguous air-canister semantics (player feedback, turn 6).** "Put On the
   Spacesuit" filled Suit Air to 100 without saying whether a spare canister
   would be consumed. The player explicitly reported confusion. A later refill
   action clarified spare-canister consumption, but the initial fill remained
   mechanically free.

5. **Impossible death loop (turn 12, attempt 1).** The GM proposed a zero-air
   death boundary using the unsupported `boundaries` field instead of
   `onEmpty`. More importantly, every action required strictly more air than
   it consumed and the torn suit had no leak effect, so air could never reach
   zero. The supervisor rejected the turn before application.

6. **GM stopped responding during correction (turn 12).** After the impossible
   death-loop update, the GM returned no payload for two consecutive correction
   prompts. This met the requested stuck-agent early-stop condition.

## Supervisor and Controller Findings

1. The first controller launch attempted to load the project Vite config and
   triggered the known sandbox config-read failure. The run controller now uses
   `configFile: false` and dependency discovery is disabled. No game turn was
   affected.

2. The validator catches JSON shape errors but cannot prove milestone
   reachability. The turn-12 death design would have needed a semantic check
   that a configured resource boundary is reachable from available actions and
   effects.

3. The generated manifest's `files` list was not expanded as items, flags,
   and resources were added. The in-memory bundle validates, but exporting the
   manifest as written would omit required content files.

4. Pacing was coherent but slow: eleven player turns reached the main
   intersection, with several finite inspection actions consumed first. This
   was not a cycle because each choice changed state and disappeared.

## Early-Stop Watch

- repeated action choices without new state or narration,
- repeated GM updates that recreate equivalent choices,
- three rejected GM envelopes on one turn,
- no enabled player actions,
- agent prose outside the required JSON envelope,
- private-story leakage into the player snapshot,
- controller boundary limit.

## Stop Reason

Turn 12 was not applied. The authoritative state remains at the main
intersection with 85 Suit Air, two spare canisters, no deaths, and
`torn-suit=false`. The run is incomplete and must not be treated as a
successful Part 1 export.
